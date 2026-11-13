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

import { wallPhraseOf } from "./wall-ref.js";
import {
  accessDigraph,
  buildDoorAccessGraph,
  outdoorsOf,
  DEFAULT_TOL,
  EXTERIOR_NODE,
  isBedroom,
  isCirculation,
  isKitchen,
  isWetRoom,
  reachFrom,
  pointInRoomBox,
  rectOf,
  roomBox,
  resolvePlan,
  wetRoomsOnlyViaBedroom,
  type AnalyzeOptions,
} from "./analyze.js";
import type { BBox } from "./geometry/rect.js";
import { segmentsOfWall, type WallSegment } from "./geometry.js";
import { collinearOverlapLength, polygonEdges } from "./geometry/polygon.js";
import { projectPointOntoWall, type AttachableWall } from "./fix-producers.js";
import { fmt3 as numStr } from "./num-format.js";
import type { Point } from "./ast.js";
import type { RDoor, RFurniture, ROpening, RRoom, RWall, RWindow } from "./ir.js";
import { openRunsOf } from "./analyze.js";
import { isLivingOrDining } from "./analyze/nav-grid.js";

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
  const ea: Point = e.axis === "h" ? { x: e.lo, y: e.fixed } : { x: e.fixed, y: e.lo };
  const eb: Point = e.axis === "h" ? { x: e.hi, y: e.fixed } : { x: e.fixed, y: e.hi };
  for (const r of rooms) {
    if (r.id === selfId) continue;
    // A polygon neighbour is tested against ITS OWN edges: a suggested "exterior" door
    // must not land on a wall an L-shaped gallery is actually behind.
    if (r.poly) {
      const shares = polygonEdges(r.poly).some(([a, b]) => collinearOverlapLength(ea, eb, a, b, tol) > 0);
      if (shares) out.push(r.id);
      continue;
    }
    const rect = rectOf(r);
    const edges = e.axis === "h" ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w];
    const onLine = edges.some((f) => Math.abs(f - e.fixed) <= tol);
    if (!onLine) continue;
    const [lo, hi] = e.axis === "h" ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    if (Math.min(hi, e.hi) - Math.max(lo, e.lo) > 0) out.push(r.id);
  }
  return out;
}

/**
 * Where along edge `e` each neighbouring room lies across it ({@link neighboursOnEdge}'s rooms,
 * in its order): the run of `e` that room's own edge shares, clipped to `e`, so a door placed in
 * it opens into THAT room and no other (PS0.6). A polygon neighbour gives one run per edge of its
 * ring lying on `e`'s line.
 */
function neighbourRunsOnEdge(
  e: Edge,
  rooms: RRoom[],
  selfId: string,
  tol: number,
  /** Which way is ACROSS the edge, away from the room: `-1` for a top or left edge, `+1` else. */
  outward: 1 | -1,
): Array<{ id: string; lo: number; hi: number }> {
  const ids = new Set(neighboursOnEdge(e, rooms, selfId, tol));
  const out: Array<{ id: string; lo: number; hi: number }> = [];
  const ea: Point = e.axis === "h" ? { x: e.lo, y: e.fixed } : { x: e.fixed, y: e.lo };
  const eb: Point = e.axis === "h" ? { x: e.hi, y: e.fixed } : { x: e.fixed, y: e.hi };
  const along = (p: Point): number => (e.axis === "h" ? p.x : p.y);
  for (const r of rooms) {
    if (!ids.has(r.id)) continue;
    const spans: Array<[number, number]> = r.poly
      ? polygonEdges(r.poly)
          .filter(([a, b]) => collinearOverlapLength(ea, eb, a, b, tol) > 0)
          .map(([a, b]) => [Math.min(along(a), along(b)), Math.max(along(a), along(b))])
      : [e.axis === "h" ? [rectOf(r).x, rectOf(r).x + rectOf(r).w] : [rectOf(r).y, rectOf(r).y + rectOf(r).h]];
    const box = roomBox(r);
    for (const [lo, hi] of spans) {
      const a = Math.max(lo, e.lo);
      const b = Math.min(hi, e.hi);
      if (!(b > a)) continue;
      // Across the wall, not beside it: a room that overlaps this one along the same side (its
      // edge on the same line, its floor on this side) is no neighbour a door here opens into.
      const mid = (a + b) / 2;
      const off = e.fixed + outward * tol;
      if (pointInRoomBox(e.axis === "h" ? { x: mid, y: off } : { x: off, y: mid }, box))
        out.push({ id: r.id, lo: a, hi: b });
    }
  }
  return out;
}

/**
 * How well a room serves as the way into another (PS0.6, `skills/archlang/SKILL.md`: never route
 * a room through a bedroom): circulation first, then a living, dining or kitchen space, then any
 * other room that is neither private, then a wet room, then a bedroom last. Lower is better.
 */
function wayInTier(r: RRoom): number {
  if (isCirculation(r)) return 0;
  if (isBedroom(r)) return 4;
  if (isWetRoom(r)) return 3;
  if (isLivingOrDining(r) || isKitchen(r)) return 1;
  return 2;
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

/** A rationale's name for a wall: its id, or the relation of a derived one (ADR 0028 §3). */
const named = (w: RWall, exterior: boolean): string =>
  w._derived ? wallPhraseOf(w) : `${exterior ? "exterior " : ""}wall "${w.id}"`;

export type SuggestOptions = AnalyzeOptions;

/**
 * Suggest topology fixes for a plan's connectivity faults. Returns an empty array
 * when the plan has errors (nothing to reason about) or no faults. Deterministic.
 */
export function suggestTopology(source: string, opts: SuggestOptions = {}): Suggestion[] {
  const { ir } = resolvePlan(source, opts);
  if (!ir) return [];

  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  // Every candidate this module composes is derived from a room's four RECTANGLE edges
  // (`edgesOf`) — where on that side a door or window could go. A polygon room has no
  // such sides, so it contributes no candidates: `suggest` is advisory, and offering an
  // opening on a bounding-box edge the room does not have would be worse than silence.
  // Polygon rooms still take part in the reachability graph below, so a fault involving
  // one is still DIAGNOSED (by `lint`) — only the auto-composed statement is withheld.
  const rectRooms = rooms.filter((r) => !r.poly);
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
  const access = buildDoorAccessGraph(rooms, doors, tol, undefined, openings, openRunsOf(ir, tol), outdoorsOf(ir));
  const reachable = new Set(access.rooms.filter((r) => r.reachable).map((r) => r.id));
  // What a new door gives access THROUGH (PS0.6): a neighbour reached only by passing a bedroom
  // (or a wet room) is as private as one, whatever it is itself.
  const graph = accessDigraph(
    rooms.map((r) => r.id),
    access.edges,
  );
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const avoiding = (test: (r: RRoom) => boolean) =>
    reachFrom(graph, { avoid: (id) => (byId.has(id) ? test(byId.get(id)!) : false) });
  const noBedroom = avoiding(isBedroom);
  const noWetRoom = avoiding(isWetRoom);
  const throughTier = (n: RRoom): number =>
    !noBedroom.has(n.id) ? 4 : !noWetRoom.has(n.id) ? Math.max(3, wayInTier(n)) : wayInTier(n);
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
    for (const room of rectRooms) {
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
          rationale: `A door on ${named(host.wall, true)} opens "${label}" to the outside as the building's entrance.`,
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
        // Doors that open onto water exist and lead nowhere (backlog 4.5): say so rather than deny them.
        problem: access.edges.some((e) => e.onto !== undefined)
          ? "The building has no entrance — its only doors to the outside open onto water."
          : "The building has no entrance — no exterior door or opening lets anyone in.",
        code: "W_NO_ENTRANCE",
        roomId: sorted[0]!.roomId,
        candidates: toCandidates(sorted),
      });
    }
  }

  for (const room of rectRooms) {
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
      // room keeps the pure geometric (longest-run-first) order across both. Either
      // way a connection THROUGH a bedroom or a wet room ranks last (PS0.6).
      // Each interior candidate is sited on the run of the edge its neighbour lies across, so the
      // door opens into the room the rationale names, and is ranked by what that room is
      // (PS0.6, {@link wayInTier}): through a hall or a living space before a bedroom or bath.
      const interior: Array<RawCandidate & { tier: number }> = [];
      const exterior: RawCandidate[] = [];
      for (const e of edgesOf(rect)) {
        const host = hostWallForEdge(e, walls, tol);
        if (!host) continue;
        const outward = e.fixed === (e.axis === "h" ? rect.y : rect.x) ? -1 : 1;
        const across = neighbourRunsOnEdge(e, rooms, room.id, tol, outward);
        const isExteriorEdge = across.length === 0 && host.wall.category === "exterior";
        const blocked = [...blockedRuns(e, connectors, tol), ...furnitureBlockedRuns(e, rect, furniture)];
        const runs: Array<{ to: string | null; lo: number; hi: number }> = isExteriorEdge
          ? [{ to: null, lo: e.lo, hi: e.hi }]
          : across.filter((n) => reachable.has(n.id)).map((n) => ({ to: n.id, lo: n.lo, hi: n.hi }));
        // One candidate per neighbour on this edge: the longest free run across any of its runs,
        // on the wall that stands on THAT stretch (two walls can share one room edge).
        const best = new Map<string | null, { mid: number; len: number; host: { wall: RWall } }>();
        for (const run of runs) {
          const free = longestFreeRun(run.lo, run.hi, blocked);
          if (!free || free.len < DOOR_WIDTH) continue;
          const at = run.to === null ? host : hostWallForEdge({ ...e, lo: run.lo, hi: run.hi }, walls, tol);
          if (!at) continue;
          const had = best.get(run.to);
          if (!had || free.len > had.len) best.set(run.to, { ...free, host: at });
        }
        for (const [to, { host, ...free }] of best) {
          const point = edgePoint(e, free.mid);
          const { pct } = projectPointOntoWall(host.wall as AttachableWall, point);
          const via = to
            ? `connects "${label}" to "${to}" (which reaches the entrance)`
            : `opens "${label}" directly to the exterior (a new entrance)`;
          const c: RawCandidate = {
            insertText: composeOpening("door", host.wall, pct, point, DOOR_WIDTH, categoryCount),
            rationale: `A door on ${named(host.wall, false)} ${via}.`,
            len: free.len,
            wallId: host.wall.id,
            pct,
          };
          const neighbour = to ? rooms.find((r) => r.id === to) : undefined;
          if (neighbour) interior.push({ ...c, tier: throughTier(neighbour) });
          else exterior.push(c);
        }
      }
      const byTier = (xs: Array<RawCandidate & { tier: number }>) => {
        const tiers = [...new Set(xs.map((x) => x.tier))].sort((a, b) => a - b);
        return tiers.flatMap((t) => sortRaw(xs.filter((x) => x.tier === t)));
      };
      const isPrivate = isBedroom(room) || isWetRoom(room);
      // A door into circulation comes first for every room; through a bedroom or a wet room (or a
      // room reached only through one) is the last resort (tiers 3 and 4).
      const hall = interior.filter((c) => c.tier === 0);
      const good = interior.filter((c) => c.tier > 0 && c.tier < 3);
      const poor = interior.filter((c) => c.tier >= 3);
      const candidates = isPrivate
        ? toCandidates([...sortRaw(hall), ...byTier(good), ...sortRaw(exterior), ...byTier(poor)])
        : toCandidates([...sortRaw(hall), ...sortRaw([...good, ...exterior]), ...byTier(poor)]);
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
          rationale: `A window on ${named(host.wall, true)} gives "${label}" natural light and egress.`,
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
  // the first set but not the second is en-suite-trapped — unless another wet room avoids
  // every bedroom (`wetRoomsOnlyViaBedroom`, the definition the lint rule uses). Propose a
  // door on a wall it shares with a non-bedroom space that still reaches the entrance
  // (preferred), with exterior-wall doors as a fallback. Only runs when an entrance exists.
  // The same `"probe"` graph and search as the lint rule.
  const g = accessDigraph(
    rooms.map((r) => r.id),
    access.edges,
  );
  const isBedroomId = (id: string): boolean => {
    const r = rooms.find((x) => x.id === id);
    return r ? isBedroom(r) : false;
  };
  if (g.out(EXTERIOR_NODE).length > 0) {
    const reachAll = reachFrom(g);
    const reachNoBed = reachFrom(g, { avoid: isBedroomId });
    const viaBedroom = wetRoomsOnlyViaBedroom(rooms, reachAll, reachNoBed);
    for (const room of rectRooms) {
      if (!viaBedroom.has(room.id)) continue;
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
          ? `A door on ${named(host.wall, false)} links "${label}" to "${goodNeighbour}", giving it a route that avoids the bedroom.`
          : `A door on ${named(host.wall, true)} opens "${label}" directly to the outside, off the bedroom.`;
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
