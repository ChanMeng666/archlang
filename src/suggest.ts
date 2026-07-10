/**
 * `suggestTopology(source)` — topology repair suggestions as DATA, never applied.
 *
 * Per [ADR 0005](../docs/adr/0005-facts-and-lint-not-an-architect.md) the compiler
 * is a faithful renderer and never invents architecture. This is the *advisory*
 * counterpart to `arch lint`: for the two connectivity faults a generator most
 * often produces — a room with no path back to the entrance
 * (`W_ROOM_UNREACHABLE`) and a bedroom with no window (`W_BEDROOM_NO_WINDOW`) — it
 * emits concrete, ready-to-paste `.arch` statements (using the v1.13 `on <wall> at
 * <p>%` attachment form) that would resolve the fault, with a rationale. The agent
 * (or human) chooses; nothing here edits the plan.
 *
 * Pure and deterministic: rooms are processed in source order; each candidate is
 * the midpoint of the longest opening-free run of a shared/exterior wall, ordered
 * by that run's length. Zero-dependency; built on the same resolve + access-graph
 * layer as `describe`/`lint`.
 */

import { buildDoorAccessGraph, DEFAULT_TOL, isBedroom, rectOf, resolvePlan, type AnalyzeOptions } from "./analyze.js";
import type { BBox } from "./geometry/rect.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import { projectPointOntoWall, type AttachableWall } from "./fix-producers.js";
import { fmt3 as numStr } from "./num-format.js";
import type { Point } from "./ast.js";
import type { RDoor, ROpening, RRoom, RWall, RWindow } from "./ir.js";

/** One concrete statement that would resolve a suggested fault, with a reason. */
export interface SuggestionCandidate {
  /** A complete `.arch` statement to paste (uses the `on <wall> at <p>%` form). */
  insertText: string;
  /** Why this candidate is proposed (which wall, what it connects / lights). */
  rationale: string;
}

/** A topology suggestion: a fault, the `W_*` code it would resolve, and 1–3
 *  candidate statements ordered best-first. */
export interface Suggestion {
  /** Human-readable description of the fault. */
  problem: string;
  /** The lint code this suggestion would resolve. */
  code: "W_ROOM_UNREACHABLE" | "W_BEDROOM_NO_WINDOW";
  /** Id of the room the suggestion is about. */
  roomId: string;
  candidates: SuggestionCandidate[];
}

/** Preferred nominal widths for a suggested opening (mm). */
const DOOR_WIDTH = 900;
const WINDOW_WIDTH = 1200;
/** Clear space (mm) kept on each side of an existing opening when siting a new one. */
const OPENING_CLEARANCE = 100;

interface Edge {
  axis: "h" | "v";
  /** The constant coordinate of the edge line (y for a horizontal edge, x for vertical). */
  fixed: number;
  /** The edge's extent along the other axis. */
  lo: number;
  hi: number;
}

/** The four edges of a room rectangle: top, bottom (horizontal), left, right (vertical). */
function edgesOf(r: BBox): Edge[] {
  return [
    { axis: "h", fixed: r.y, lo: r.x, hi: r.x + r.w },
    { axis: "h", fixed: r.y + r.h, lo: r.x, hi: r.x + r.w },
    { axis: "v", fixed: r.x, lo: r.y, hi: r.y + r.h },
    { axis: "v", fixed: r.x + r.w, lo: r.y, hi: r.y + r.h },
  ];
}

/** The along-edge span a wall segment shares with edge `e` (collinear, within tol),
 *  or null when the segment does not lie on the edge line. */
function segOnEdge(s: WallSegment, e: Edge, tol: number): { lo: number; hi: number } | null {
  const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
  const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
  if (e.axis === "h") {
    if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) return null;
    const lo = Math.max(Math.min(s.a.x, s.b.x), e.lo);
    const hi = Math.min(Math.max(s.a.x, s.b.x), e.hi);
    return hi - lo > 0 ? { lo, hi } : null;
  }
  if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) return null;
  const lo = Math.max(Math.min(s.a.y, s.b.y), e.lo);
  const hi = Math.min(Math.max(s.a.y, s.b.y), e.hi);
  return hi - lo > 0 ? { lo, hi } : null;
}

/** The wall covering the most of edge `e` (its id, category, and covered length),
 *  deterministic: max coverage, ties broken by wall id. Null when no wall lies on it. */
function hostWallForEdge(e: Edge, walls: RWall[], tol: number): { wall: RWall; covered: number } | null {
  let best: { wall: RWall; covered: number } | null = null;
  for (const w of walls) {
    let covered = 0;
    for (const s of segmentsOfWall(w)) {
      const on = segOnEdge(s, e, tol);
      if (on) covered += on.hi - on.lo;
    }
    if (covered <= 0) continue;
    if (!best || covered > best.covered + 1e-6 || (Math.abs(covered - best.covered) <= 1e-6 && w.id < best.wall.id)) {
      best = { wall: w, covered };
    }
  }
  return best;
}

/** Ids of rooms (other than `selfId`) that share edge `e` — a wall neighbour across it. */
function neighboursOnEdge(e: Edge, rooms: RRoom[], selfId: string, tol: number): string[] {
  const out: string[] = [];
  for (const r of rooms) {
    if (r.id === selfId) continue;
    const rect = rectOf(r);
    const edges = e.axis === "h" ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w];
    const onLine = edges.some((f) => Math.abs(f - e.fixed) <= tol);
    if (!onLine) continue;
    const [lo, hi] = e.axis === "h" ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    if (Math.min(hi, e.hi) - Math.max(lo, e.lo) > 0) out.push(r.id);
  }
  return out;
}

/** The longest sub-interval of `[lo, hi]` not covered by any `blocked` interval:
 *  its midpoint and length, or null when nothing free remains. */
function longestFreeRun(lo: number, hi: number, blocked: Array<[number, number]>): { mid: number; len: number } | null {
  const clips = blocked
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let cursor = lo;
  let best: { mid: number; len: number } | null = null;
  const consider = (a: number, b: number): void => {
    const len = b - a;
    if (len > 0 && (!best || len > best.len)) best = { mid: (a + b) / 2, len };
  };
  for (const [a, b] of clips) {
    if (a > cursor) consider(cursor, a);
    cursor = Math.max(cursor, b);
  }
  if (cursor < hi) consider(cursor, hi);
  return best;
}

/** Existing openings (door/window/opening) lying on edge `e`, as blocked intervals
 *  (opening span + a clearance margin each side). */
function blockedRuns(e: Edge, connectors: Array<{ at: Point; width: number }>, tol: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of connectors) {
    const onLine = e.axis === "h" ? Math.abs(c.at.y - e.fixed) <= tol : Math.abs(c.at.x - e.fixed) <= tol;
    if (!onLine) continue;
    const pos = e.axis === "h" ? c.at.x : c.at.y;
    const half = c.width / 2 + OPENING_CLEARANCE;
    out.push([pos - half, pos + half]);
  }
  return out;
}

/** A raw candidate before ordering (carries its run length for the sort). */
interface RawCandidate extends SuggestionCandidate {
  len: number;
  wallId: string;
  pct: number;
}

/** Build up to three ordered candidates from a set of raw ones (longest run first,
 *  ties by wall id then position). */
function orderCandidates(raw: RawCandidate[]): SuggestionCandidate[] {
  return raw
    .sort((a, b) => b.len - a.len || (a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : a.pct - b.pct))
    .slice(0, 3)
    .map(({ insertText, rationale }) => ({ insertText, rationale }));
}

/** Point at along-edge coordinate `along` on edge `e`. */
const edgePoint = (e: Edge, along: number): Point =>
  e.axis === "h" ? { x: along, y: e.fixed } : { x: e.fixed, y: along };

export type SuggestOptions = AnalyzeOptions;

/**
 * Suggest topology fixes for a plan's connectivity faults. Returns an empty array
 * when the plan has errors (nothing to reason about) or no faults. Deterministic.
 */
export function suggestTopology(source: string, opts: SuggestOptions = {}): Suggestion[] {
  const { ir } = resolvePlan(source, opts);
  if (!ir) return [];

  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const walls = ir.walls;
  if (rooms.length === 0 || walls.length === 0) return [];

  const tol = DEFAULT_TOL;
  const access = buildDoorAccessGraph(rooms, doors, tol, undefined, openings);
  const reachable = new Set(access.rooms.filter((r) => r.reachable).map((r) => r.id));
  // Every connector (door/opening) that can block a new opening's site.
  const connectors = [...doors, ...openings, ...windows].map((c) => ({ at: c.at, width: c.width }));

  const suggestions: Suggestion[] = [];

  for (const room of rooms) {
    const rect = rectOf(room);
    const label = room.label ?? room.id;
    const node = access.rooms.find((r) => r.id === room.id);

    // ---- W_ROOM_UNREACHABLE: a room with no path back to the entrance ----
    if (node && !node.reachable) {
      const raw: RawCandidate[] = [];
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (!host) continue;
        const neighbours = neighboursOnEdge(e, rooms, room.id, tol);
        const reachableNeighbour = neighbours.find((id) => reachable.has(id));
        const isExteriorEdge = neighbours.length === 0 && host.wall.category === "exterior";
        if (!reachableNeighbour && !isExteriorEdge) continue;

        const free = longestFreeRun(e.lo, e.hi, blockedRuns(e, connectors, tol));
        if (!free || free.len < DOOR_WIDTH) continue;
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, edgePoint(e, free.mid));
        const via = reachableNeighbour
          ? `connects "${label}" to "${reachableNeighbour}" (which reaches the entrance)`
          : `opens "${label}" directly to the exterior (a new entrance)`;
        raw.push({
          insertText: `door on ${host.wall.id} at ${numStr(pct)}% width ${DOOR_WIDTH}`,
          rationale: `A door on wall "${host.wall.id}" ${via}.`,
          len: free.len,
          wallId: host.wall.id,
          pct,
        });
      }
      if (raw.length > 0) {
        suggestions.push({
          problem: `Room "${label}" can't be reached from the entrance.`,
          code: "W_ROOM_UNREACHABLE",
          roomId: room.id,
          candidates: orderCandidates(raw),
        });
      }
    }

    // ---- W_BEDROOM_NO_WINDOW: a bedroom with no window on its perimeter ----
    const hasWindow = windows.some((w) => {
      for (const e of edgesOf(rect)) {
        const onLine = e.axis === "h" ? Math.abs(w.at.y - e.fixed) <= tol : Math.abs(w.at.x - e.fixed) <= tol;
        const pos = e.axis === "h" ? w.at.x : w.at.y;
        if (onLine && pos >= e.lo - tol && pos <= e.hi + tol) return true;
      }
      return false;
    });
    if (isBedroom(room) && !hasWindow) {
      const raw: RawCandidate[] = [];
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (host?.wall.category !== "exterior") continue;
        if (neighboursOnEdge(e, rooms, room.id, tol).length > 0) continue; // interior wall
        const free = longestFreeRun(e.lo, e.hi, blockedRuns(e, connectors, tol));
        if (!free || free.len < WINDOW_WIDTH) continue;
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, edgePoint(e, free.mid));
        raw.push({
          insertText: `window on ${host.wall.id} at ${numStr(pct)}% width ${WINDOW_WIDTH}`,
          rationale: `A window on exterior wall "${host.wall.id}" gives "${label}" natural light and egress.`,
          len: free.len,
          wallId: host.wall.id,
          pct,
        });
      }
      if (raw.length > 0) {
        suggestions.push({
          problem: `Bedroom "${label}" has no window.`,
          code: "W_BEDROOM_NO_WINDOW",
          roomId: room.id,
          candidates: orderCandidates(raw),
        });
      }
    }
  }

  return suggestions;
}
