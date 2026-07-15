/**
 * `suggestTopology(source)` — topology repair suggestions as DATA, never applied.
 *
 * Per [ADR 0005](../docs/adr/0005-facts-and-lint-not-an-architect.md) the compiler
 * is a faithful renderer and never invents architecture. This is the *advisory*
 * counterpart to `arch lint`: for the connectivity faults a generator most often
 * produces — a room with no path back to the entrance (`W_ROOM_UNREACHABLE`), a
 * bedroom with no window (`W_BEDROOM_NO_WINDOW`), a building with no way in
 * (`W_NO_ENTRANCE`), and a wet room reachable only through a bedroom
 * (`W_BATH_VIA_BEDROOM`) — it emits concrete, ready-to-paste `.arch` statements
 * (each referencing its host wall by a stable ref, or by absolute coordinates — see
 * the next paragraph) that would resolve the
 * fault, with a rationale. Each builder mirrors the SEMANTICS of the matching lint
 * rule so a suggestion fires iff the lint fires. The agent (or human) chooses;
 * nothing here edits the plan.
 *
 * Every candidate references its host wall only by a STABLE ref that cannot silently
 * re-bind: an author-declared wall id, else a unique wall category, else absolute
 * coordinates (see {@link composeOpening}). A positional auto-id (`partition_3`) is
 * never emitted, since a later same-category wall would re-index it and corrupt a
 * persisted suggestion.
 *
 * Pure and deterministic: rooms are processed in source order; each candidate is
 * the midpoint of the longest opening-free run of a shared/exterior wall, ordered
 * by that run's length. Zero-dependency; built on the same resolve + access-graph
 * layer as `describe`/`lint`.
 */

import {
  buildDoorAccessGraph,
  DEFAULT_TOL,
  doorConnections,
  EXTERIOR_NODE,
  isBedroom,
  isWetRoom,
  rectOf,
  resolvePlan,
  type AnalyzeOptions,
} from "./analyze.js";
import type { BBox } from "./geometry/rect.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import { projectPointOntoWall, type AttachableWall } from "./fix-producers.js";
import { fmt3 as numStr } from "./num-format.js";
import type { Point } from "./ast.js";
import type { RDoor, RFurniture, ROpening, RRoom, RWall, RWindow } from "./ir.js";

/** One concrete statement that would resolve a suggested fault, with a reason. */
export interface SuggestionCandidate {
  /** A complete `.arch` statement to paste. References its host wall by a stable ref
   *  — `on <id>`, `on <category>` (when unique), or absolute `at (x, y)` — never a
   *  positional auto-id (see {@link composeOpening}). */
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
  code: "W_ROOM_UNREACHABLE" | "W_BEDROOM_NO_WINDOW" | "W_NO_ENTRANCE" | "W_BATH_VIA_BEDROOM";
  /** Id of the room the suggestion is about. */
  roomId: string;
  candidates: SuggestionCandidate[];
}

/** Preferred nominal widths for a suggested opening (mm). */
const DOOR_WIDTH = 900;
const WINDOW_WIDTH = 1200;
/** Clear space (mm) kept on each side of an existing opening when siting a new one. */
const OPENING_CLEARANCE = 100;
/** Depth (mm) of the door-approach strip kept clear inside a room in front of a new
 *  door — a door sited where furniture intrudes into this strip would open onto it. */
const APPROACH_DEPTH = 900;

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

/** Along-edge intervals of edge `e` where furniture inside room `rect` intrudes into
 *  the door-approach strip — the band inside the room along `e`, {@link APPROACH_DEPTH}
 *  deep. A door sited over such a span would open straight onto the piece, so these
 *  spans are blocked for DOOR candidates only; windows (which don't swing) ignore them.
 *  Axis-aligned throughout; fail-open — a piece clear of the strip contributes nothing. */
function furnitureBlockedRuns(e: Edge, rect: BBox, furniture: BBox[]): Array<[number, number]> {
  // The strip spans the full edge along-axis; on the perpendicular (depth) axis it
  // reaches APPROACH_DEPTH from the edge line into the room interior. The edge sitting
  // below the room centre is a min-side (top/left) edge — the interior lies past it.
  const centre = e.axis === "h" ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
  const [depthLo, depthHi] =
    e.fixed < centre ? [e.fixed, e.fixed + APPROACH_DEPTH] : [e.fixed - APPROACH_DEPTH, e.fixed];
  const out: Array<[number, number]> = [];
  for (const f of furniture) {
    const [pLo, pHi] = e.axis === "h" ? [f.y, f.y + f.h] : [f.x, f.x + f.w];
    if (Math.min(pHi, depthHi) - Math.max(pLo, depthLo) <= 0) continue; // clear of the strip depth
    const [aLo, aHi] = e.axis === "h" ? [f.x, f.x + f.w] : [f.y, f.y + f.h];
    const lo = Math.max(aLo, e.lo);
    const hi = Math.min(aHi, e.hi);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** A raw candidate before ordering (carries its run length for the sort). */
interface RawCandidate extends SuggestionCandidate {
  len: number;
  wallId: string;
  pct: number;
}

/** Sort raw candidates in place, longest run first, ties by wall id then position.
 *  Generic so callers keep any extra fields (e.g. a per-candidate room id). */
function sortRaw<T extends RawCandidate>(raw: T[]): T[] {
  return raw.sort((a, b) => b.len - a.len || (a.wallId < b.wallId ? -1 : a.wallId > b.wallId ? 1 : a.pct - b.pct));
}

/** Strip a sorted raw list to at most three public candidates. */
const toCandidates = (raw: RawCandidate[]): SuggestionCandidate[] =>
  raw.slice(0, 3).map(({ insertText, rationale }) => ({ insertText, rationale }));

/** Build up to three ordered candidates from a set of raw ones (longest run first,
 *  ties by wall id then position). */
function orderCandidates(raw: RawCandidate[]): SuggestionCandidate[] {
  return toCandidates(sortRaw(raw));
}

/** Point at along-edge coordinate `along` on edge `e`. */
const edgePoint = (e: Edge, along: number): Point =>
  e.axis === "h" ? { x: along, y: e.fixed } : { x: e.fixed, y: along };

/**
 * Compose a paste-ready opening statement that references its host wall ONLY by a
 * ref that can never re-bind — the FIRST available of:
 *   1. an author-declared id → `on <wall.id>`;
 *   2. a unique category → `on <wall.category>` (valid iff exactly one wall carries it);
 *   3. absolute coordinates → `at (x, y)` (names no wall; the compiler's nearest-wall
 *      hosting binds the intended wall, since run midpoints sit far from corners).
 * A positional auto-id (`partition_3`, assigned per-kind in `assignIds`) is DELIBERATELY
 * never emitted: inserting a later same-category wall re-indexes it, silently corrupting
 * any persisted suggestion. `categoryCount` is the wall-count-per-category over the plan.
 */
function composeOpening(
  kind: "door" | "window",
  wall: RWall,
  pct: number,
  point: Point,
  width: number,
  categoryCount: ReadonlyMap<string, number>,
): string {
  if (wall._idAuthored) return `${kind} on ${wall.id} at ${numStr(pct)}% width ${width}`;
  if (categoryCount.get(wall.category) === 1) return `${kind} on ${wall.category} at ${numStr(pct)}% width ${width}`;
  return `${kind} at (${numStr(point.x)}, ${numStr(point.y)}) width ${width}`;
}

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
  // Furniture footprints (mm rects) — used only to keep a suggested door's approach
  // strip clear (door builders); windows ignore them.
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture").map(rectOf);
  const walls = ir.walls;
  if (rooms.length === 0 || walls.length === 0) return [];

  const tol = DEFAULT_TOL;
  // Wall count per category — a bare `on <category>` stable ref is valid iff unique.
  const categoryCount = new Map<string, number>();
  for (const w of walls) categoryCount.set(w.category, (categoryCount.get(w.category) ?? 0) + 1);
  const access = buildDoorAccessGraph(rooms, doors, tol, undefined, openings);
  const reachable = new Set(access.rooms.filter((r) => r.reachable).map((r) => r.id));
  // Every connector (door/opening) that can block a new opening's site.
  const connectors = [...doors, ...openings, ...windows].map((c) => ({ at: c.at, width: c.width }));

  const suggestions: Suggestion[] = [];

  // ---- W_NO_ENTRANCE: the building has an outer shell but no way in ----
  // Mirrors src/lint/rules/entrance.ts: fires when there is an exterior wall but no
  // door/opening on one. Propose a single entrance door, preferring a habitable
  // (non-bedroom, non-wet) room's exterior wall; fall back to any room only when no
  // habitable room offers a viable exterior run.
  const hasExteriorWall = walls.some((w) => w.category === "exterior");
  // `!access.hasEntrance` is the GEOMETRIC entrance test (a door/opening whose position
  // resolves onto an exterior wall), the same definition the W_ROOM_UNREACHABLE gate
  // below uses — not entrance.ts's declared host-category check. They agree except on
  // contrived geometry (e.g. a door declared `wall exterior` but sited off every one).
  if (!access.hasEntrance && hasExteriorWall) {
    const suitable: Array<RawCandidate & { roomId: string }> = [];
    const rest: Array<RawCandidate & { roomId: string }> = [];
    for (const room of rooms) {
      const rect = rectOf(room);
      const label = room.label ?? room.id;
      const bucket = !isBedroom(room) && !isWetRoom(room) ? suitable : rest;
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (host?.wall.category !== "exterior") continue;
        if (neighboursOnEdge(e, rooms, room.id, tol).length > 0) continue; // interior wall
        const blocked = [...blockedRuns(e, connectors, tol), ...furnitureBlockedRuns(e, rect, furniture)];
        const free = longestFreeRun(e.lo, e.hi, blocked);
        if (!free || free.len < DOOR_WIDTH) continue;
        const point = edgePoint(e, free.mid);
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, point);
        bucket.push({
          insertText: composeOpening("door", host.wall, pct, point, DOOR_WIDTH, categoryCount),
          rationale: `A door on exterior wall "${host.wall.id}" opens "${label}" to the outside as the building's entrance.`,
          len: free.len,
          wallId: host.wall.id,
          pct,
          roomId: room.id,
        });
      }
    }
    const raw = suitable.length > 0 ? suitable : rest;
    if (raw.length > 0) {
      const sorted = sortRaw(raw);
      suggestions.push({
        problem: "The building has no entrance — no exterior door or opening lets anyone in.",
        code: "W_NO_ENTRANCE",
        roomId: sorted[0]!.roomId,
        candidates: toCandidates(sorted),
      });
    }
  }

  for (const room of rooms) {
    const rect = rectOf(room);
    const label = room.label ?? room.id;
    const node = access.rooms.find((r) => r.id === room.id);

    // ---- W_ROOM_UNREACHABLE: a room with no path back to the entrance ----
    // Only meaningful when an entrance exists — with no way into the building the
    // lint emits W_NO_ENTRANCE for the whole plan, not per-room unreachability, so
    // this builder stays silent to fire iff the lint fires (see W_NO_ENTRANCE below).
    if (access.hasEntrance && node && !node.reachable) {
      // Interior candidates connect to a room that already reaches the entrance;
      // exterior candidates cut a brand-new outside door. For a PRIVATE room
      // (bedroom/wet room) the interior reconnection is architecturally preferred,
      // so those rank above exterior ones regardless of run length; a non-private
      // room keeps the pure geometric (longest-run-first) order across both.
      const interior: RawCandidate[] = [];
      const exterior: RawCandidate[] = [];
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (!host) continue;
        const neighbours = neighboursOnEdge(e, rooms, room.id, tol);
        const reachableNeighbour = neighbours.find((id) => reachable.has(id));
        const isExteriorEdge = neighbours.length === 0 && host.wall.category === "exterior";
        if (!reachableNeighbour && !isExteriorEdge) continue;

        const blocked = [...blockedRuns(e, connectors, tol), ...furnitureBlockedRuns(e, rect, furniture)];
        const free = longestFreeRun(e.lo, e.hi, blocked);
        if (!free || free.len < DOOR_WIDTH) continue;
        const point = edgePoint(e, free.mid);
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, point);
        const via = reachableNeighbour
          ? `connects "${label}" to "${reachableNeighbour}" (which reaches the entrance)`
          : `opens "${label}" directly to the exterior (a new entrance)`;
        (reachableNeighbour ? interior : exterior).push({
          insertText: composeOpening("door", host.wall, pct, point, DOOR_WIDTH, categoryCount),
          rationale: `A door on wall "${host.wall.id}" ${via}.`,
          len: free.len,
          wallId: host.wall.id,
          pct,
        });
      }
      const isPrivate = isBedroom(room) || isWetRoom(room);
      const candidates = isPrivate
        ? toCandidates([...sortRaw(interior), ...sortRaw(exterior)])
        : orderCandidates([...interior, ...exterior]);
      if (interior.length + exterior.length > 0) {
        suggestions.push({
          problem: `Room "${label}" can't be reached from the entrance.`,
          code: "W_ROOM_UNREACHABLE",
          roomId: room.id,
          candidates,
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
        const point = edgePoint(e, free.mid);
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, point);
        raw.push({
          insertText: composeOpening("window", host.wall, pct, point, WINDOW_WIDTH, categoryCount),
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

  // ---- W_BATH_VIA_BEDROOM: a wet room reachable only through a bedroom ----
  // Mirrors src/lint/rules/reachability.ts: build the door/opening room graph, then
  // compare reach-all vs reach-excluding-bedrooms from the exterior. A wet room in
  // the first set but not the second is en-suite-trapped. Propose a door on a wall it
  // shares with a non-bedroom space that still reaches the entrance (preferred), with
  // exterior-wall doors as a fallback. Only runs when an entrance exists.
  const roomRects = new Map(rooms.map((r) => [r.id, rectOf(r)] as const));
  const graphConnectors = [...doors, ...openings];
  const adj = new Map<string, Set<string>>();
  const addEdge = (x: string, y: string): void => {
    if (!adj.has(x)) adj.set(x, new Set());
    if (!adj.has(y)) adj.set(y, new Set());
    adj.get(x)!.add(y);
    adj.get(y)!.add(x);
  };
  for (const c of graphConnectors) {
    const conn = doorConnections(c, roomRects, tol);
    if (conn.length === 2) addEdge(conn[0]!, conn[1]!);
  }
  const isBedroomId = (id: string): boolean => {
    const r = rooms.find((x) => x.id === id);
    return r ? isBedroom(r) : false;
  };
  if (adj.has(EXTERIOR_NODE)) {
    const bfs = (excludeBedrooms: boolean): Set<string> => {
      const seen = new Set<string>([EXTERIOR_NODE]);
      const queue = [EXTERIOR_NODE];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
          if (seen.has(nb) || (excludeBedrooms && isBedroomId(nb))) continue;
          seen.add(nb);
          queue.push(nb);
        }
      }
      return seen;
    };
    const reachAll = bfs(false);
    const reachNoBed = bfs(true);
    for (const room of rooms) {
      if (!isWetRoom(room) || !reachAll.has(room.id) || reachNoBed.has(room.id)) continue;
      const rect = rectOf(room);
      const label = room.label ?? room.id;
      const preferred: RawCandidate[] = [];
      const fallback: RawCandidate[] = [];
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (!host) continue;
        const neighbours = neighboursOnEdge(e, rooms, room.id, tol);
        const goodNeighbour = neighbours.find((id) => reachNoBed.has(id) && !isBedroomId(id));
        const isExteriorEdge = neighbours.length === 0 && host.wall.category === "exterior";
        if (!goodNeighbour && !isExteriorEdge) continue;
        const blocked = [...blockedRuns(e, connectors, tol), ...furnitureBlockedRuns(e, rect, furniture)];
        const free = longestFreeRun(e.lo, e.hi, blocked);
        if (!free || free.len < DOOR_WIDTH) continue;
        const point = edgePoint(e, free.mid);
        const { pct } = projectPointOntoWall(host.wall as AttachableWall, point);
        const rationale = goodNeighbour
          ? `A door on wall "${host.wall.id}" links "${label}" to "${goodNeighbour}", giving it a route that avoids the bedroom.`
          : `A door on exterior wall "${host.wall.id}" opens "${label}" directly to the outside, off the bedroom.`;
        (goodNeighbour ? preferred : fallback).push({
          insertText: composeOpening("door", host.wall, pct, point, DOOR_WIDTH, categoryCount),
          rationale,
          len: free.len,
          wallId: host.wall.id,
          pct,
        });
      }
      // Preferred (connect-to-circulation) candidates always outrank exterior fallbacks,
      // regardless of run length — reconnecting to the hall is the real fix.
      const ordered = [...sortRaw(preferred), ...sortRaw(fallback)];
      if (ordered.length > 0) {
        suggestions.push({
          problem: `Bathroom "${label}" is reachable only through a bedroom.`,
          code: "W_BATH_VIA_BEDROOM",
          roomId: room.id,
          candidates: toCandidates(ordered),
        });
      }
    }
  }

  return suggestions;
}
