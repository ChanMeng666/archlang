/**
 * Shared semantic-analysis layer for the agent-facing tools.
 *
 * {@link describe} (semantic summary) and {@link lint} (architectural rules) both
 * need the same two things: a resolved plan, and a little rectilinear geometry over
 * room rectangles (areas, edge-touch adjacency, "is this opening on that room's
 * wall?"). That logic lives here once — pure, deterministic, zero-dep — so neither
 * tool re-implements geometry and both stay byte-stable.
 */

import { parse } from "./parser.js";
import { link } from "./import.js";
import { resolveAll } from "./ir.js";
import type { ResolvedLevel, ResolvedPlan, RDoor, ROutdoor, RRoom, ROpening } from "./ir.js";
import type { PlanNode, UseKind } from "./ast.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import { distPointToWallSegment, segmentsOfWall, wallFaceProbes, type WallLike, type WallSegment } from "./geometry.js";
import { mergedLength, overlap1d, pointInRect, type BBox } from "./geometry/rect.js";
import {
  collinearOverlapLength,
  pointInPolygon,
  polygonArea,
  pointOnPolygonEdge,
  polygonEdges,
  rectInsidePolygon,
  rectRing,
  ringsAdjacent,
  VERTEX_EPS,
} from "./geometry/polygon.js";
import { arcAngleOffset, arcLength, arcParamAt, arcPointAt, fullCircleArc } from "./geometry/arc.js";
import { classifyLabelUses } from "./vocabulary.js";
import { bestPaths, type Digraph } from "./algebra/paths.js";
import { BOOLEAN, MAX_MIN, MIN_PLUS } from "./algebra/semiring.js";
// Type-only (erased): a value import of `vertical.ts` from here is harmless, but the
// reverse direction is the cycle `levelIsGrounded`'s comment describes, and keeping this
// edge type-only keeps the two modules' load order trivially acyclic.
import type { StoreyRoomReach, StoreySeeds } from "./vertical.js";
import {
  ANCHOR_BACK_EDGES,
  BACK_EDGE_ROTATE,
  backCandidateEdges,
  backEdgeForRotate,
  backedEdgeList,
  backingWallForRoomEdge,
  FIXTURE_WALL_TOL_MM,
  innerFaceOfRoomEdge,
  RECT_EDGES,
  rotateForBackEdge,
  wallBackedEdges,
} from "./fixture-orientation.js";

/** Options shared by the analysis tools: a subset of {@link CompileOptions}. */
export type AnalyzeOptions = Pick<CompileOptions, "plugins" | "world">;

// Shared rect math lives in geometry/rect.ts; re-exported here so the many
// existing `from "./analyze.js"` importers keep working unchanged.
export { overlap1d };
export type { BBox };

// Fixture orientation (back edge ⇄ quarter-turn) and per-edge wall backing live in
// `fixture-orientation.ts` — below this layer, so an element module can derive a
// rotation without a cycle through the registry. Re-exported here because this is
// the analysis surface the lint rules, `repair`, and `src/index.ts` read from.
export {
  ANCHOR_BACK_EDGES,
  backCandidateEdges,
  backedEdgeList,
  backEdgeForRotate,
  backingWallForRoomEdge,
  BACK_EDGE_ROTATE,
  FIXTURE_WALL_TOL_MM,
  innerFaceOfRoomEdge,
  RECT_EDGES,
  rotateForBackEdge,
  wallBackedEdges,
};
export type { EdgeBacking, RectEdge } from "./fixture-orientation.js";

/** Default mm tolerance for edge-touch / point-on-edge tests (≈ one partition wall). */
export const DEFAULT_TOL = 200;

/**
 * Run parse → link → resolve (the same pipeline as `compile`, semantics live in
 * {@link import("./ir.js").resolveAll}). Returns the resolved IR, or `null` when fatal
 * errors prevented resolution, alongside every diagnostic. Never throws on user-source
 * problems.
 *
 * Multi-storey (`level <n> { … }`): `ir` is the LOWEST storey — the same "page 1" that
 * `compile().svg` draws, so every existing single-plan consumer keeps working — while
 * `diagnostics` aggregates EVERY storey's problems (each tagged with `Diagnostic.level`),
 * so a fault on the top floor can never slip past a gate that only read `ir`. `levels`
 * carries the whole set for consumers that summarize or lint per storey; it is `[]` for a
 * single-storey plan (append-only field).
 */
export function resolvePlan(
  source: string,
  opts: AnalyzeOptions = {},
): { ir: ResolvedPlan | null; diagnostics: Diagnostic[]; levels: ResolvedLevel[]; plan?: PlanNode } {
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolveAll(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])];

  const hasError = diagnostics.some((d) => d.severity === "error");
  const ok = resolved !== null && !hasError;
  // The linked plan rides along only for a read that walks the source (`describe --facts
  // depends`); every other caller ignores it.
  return {
    ir: ok ? resolved.ir : null,
    diagnostics,
    levels: ok ? resolved.levels : [],
    ...(ok && linked ? { plan: linked.plan } : {}),
  };
}

/** Axis-aligned rectangle of a sized element. */
export function rectOf(e: { at: Point; size: { w: number; h: number } }): BBox {
  return { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h };
}

/**
 * A room's extent for the analysis layer: its bounding box, plus the floor RING when
 * the room is polygonal. Carrying the ring on the box — rather than threading a
 * second map through a dozen signatures — is what keeps a rectangular plan's behaviour
 * (and its bytes) untouched: `poly` is simply absent, and every `x/y/w/h` reader is
 * unchanged. The shape-aware helpers below (`roomsAdjacent`, `pointOnRoomEdge`,
 * `pointInRoomBox`) check `poly` first and fall back to the historical rect arithmetic.
 */
export type RoomBox = BBox & { poly?: Point[] };

/** The {@link RoomBox} of a resolved room — bbox for a rect, bbox + ring for a polygon. */
export function roomBox(r: { at: Point; size: { w: number; h: number }; poly?: Point[] }): RoomBox {
  const box: RoomBox = { x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h };
  if (r.poly) box.poly = r.poly;
  return box;
}

/** The room's floor as a ring: its polygon, or its rectangle's four corners. */
export const roomRing = (b: RoomBox): Point[] => b.poly ?? rectRing(b);

/**
 * A room's floor area in mm² — the ONE expression every area reader shares
 * (`describe().rooms[].area_m2`, the room schedule, Plan JSON, the too-small lint, the
 * drawn area label). A rectangle keeps the exact historical product; a polygon is
 * measured by the shoelace formula, which is exact (not sampled) for any simple ring; a
 * circle by πR², exact.
 */
export function roomAreaMm2(r: {
  size: { w: number; h: number };
  poly?: Point[];
  circle?: { c: Point; r: number };
}): number {
  // A CIRCLE is measured in closed form (πR²) — never from the 48-gon tessellation it
  // also carries for the grid layer, which understates the area by 0.29%. See the
  // exact-vs-chordal note in docs/analysis.md.
  if (r.circle) return Math.PI * r.circle.r * r.circle.r;
  return r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
}

/**
 * A room's NET internal area in mm²: its own shape less every part of it a wall's band
 * covers (`describe().rooms[].net_area_m2`, the room schedule's NET AREA column), or
 * `undefined` when it is omitted. Beside {@link roomAreaMm2}, never instead of it: the rule
 * lives in `analyze/net-area.ts`, and takes the storey's bands from `netAreaBands`.
 */
export { netAreaBands, roomNetAreaMm2 } from "./analyze/net-area.js";

/** Is the point inside the room's floor (closed bounds — the boundary counts)? */
export function pointInRoomBox(p: Point, b: RoomBox): boolean {
  return b.poly ? pointInPolygon(p.x, p.y, b.poly) : pointInRect(p.x, p.y, b);
}

/**
 * How far (mm) a fixture's footprint may hang outside the room it declares before the
 * `in <room>` reads as wrong.
 *
 * A room's outline is drawn on wall CENTRELINES, so a piece pushed against a room edge
 * legitimately shares the wall band with whatever is on the other side: 100 mm is half
 * the 200 mm shell every shipped example draws, which is the deepest such overlap an
 * honest placement produces. Well above grid-snap noise, and far below "this piece is
 * standing in the next room".
 */
export const ROOM_CONTAINMENT_SLACK_MM = 100;

/**
 * Is the footprint `fr` on the room's floor, allowing {@link ROOM_CONTAINMENT_SLACK_MM}
 * of overhang on every side? The footprint question behind `W_FIXTURE_WRONG_ROOM` — and
 * the same predicate `repair` uses to decide it has moved a piece home, so what repair
 * clears is exactly what lint flags.
 *
 * Asking about the footprint rather than the centre matters most at a CORNER: crossing
 * both the x and the y edge leaves as little as a quarter of the area inside while the
 * centre stays comfortably in, which is how a bed with three quarters of itself in three
 * other rooms used to lint clean. Furniture rotation is a quarter-turn
 * (`E_FURN_ROTATE`), so the AABB is the true footprint and no oriented-box machinery is
 * needed. A piece smaller than twice the slack shrinks to its own centre, degrading
 * gracefully to the historical point test rather than becoming impossible to place.
 */
export function rectInRoomBox(fr: BBox, b: RoomBox, slack: number = ROOM_CONTAINMENT_SLACK_MM): boolean {
  const m = Math.min(slack, fr.w / 2, fr.h / 2);
  return rectInsidePolygon({ x: fr.x + m, y: fr.y + m, w: fr.w - 2 * m, h: fr.h - 2 * m }, roomRing(b));
}

/**
 * The function(s) a room is classified as. Explicit `uses …` are authored intent
 * and win; otherwise we fall back to a conservative keyword match on the label (or
 * id). Returns a set (a studio is `living kitchen`).
 *
 * The keyword match is the shared closed vocabulary in `src/vocabulary.ts`
 * ({@link classifyLabelUses}) — the token-bounded, data-driven form of the label
 * regexes that used to live here, and the only label classifier: it emits every kind
 * it has a row for, `living` and `dining` included. Behaviour on the committed corpus
 * is pinned by `test/vocabulary-equivalence.test.ts`.
 */
export function roomUses(room: { label?: string; id: string; uses?: UseKind[] }): Set<UseKind> {
  if (room.uses && room.uses.length > 0) return new Set(room.uses);
  return new Set(classifyLabelUses(room.label ?? room.id).uses);
}

/** Does the room read as a bedroom? */
export const isBedroom = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("bedroom");
/** Does the room read as a wet room (full bath or WC)? */
export const isWetRoom = (room: { label?: string; id: string; uses?: UseKind[] }): boolean => {
  const u = roomUses(room);
  return u.has("bath") || u.has("wc");
};
/** Does the room read as a kitchen? */
export const isKitchen = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("kitchen");
/** Does the room read as a garage (or a carport / parking space)? */
export const isGarage = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("garage");
/** Does the room read as circulation (hall) or an entry/foyer? */
export const isCirculation = (room: { label?: string; id: string; uses?: UseKind[] }): boolean => {
  const u = roomUses(room);
  return u.has("hall") || u.has("circulation") || u.has("entry");
};

/** Do two room rectangles share an edge (touch) within tolerance? A shared corner
 *  alone does not count — the perpendicular overlap must be positive.
 *
 *  With a polygon room on either side the same question is asked of the two RINGS
 *  ({@link ringsAdjacent}): a shared boundary run of positive length, with the two
 *  edges no more than `tol` apart (a partition thickness). Two rectangles keep the
 *  closed-form test below, exactly as before. */
export function roomsAdjacent(a: RoomBox, b: RoomBox, tol: number): boolean {
  if (a.poly || b.poly) return ringsAdjacent(roomRing(a), roomRing(b), tol);
  const vTouch = Math.abs(a.x + a.w - b.x) <= tol || Math.abs(b.x + b.w - a.x) <= tol;
  if (vTouch && overlap1d(a.y, a.y + a.h, b.y, b.y + b.h) > 0) return true;
  const hTouch = Math.abs(a.y + a.h - b.y) <= tol || Math.abs(b.y + b.h - a.y) <= tol;
  if (hTouch && overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) > 0) return true;
  return false;
}

/** Does point `p` lie on the perimeter of a room (within tolerance)? A polygon room
 *  is measured against its own edges; a rectangle keeps the historical test. This is
 *  what attributes a door/window to the room(s) it opens onto, so a door on a polygon
 *  room's wall connects that room exactly as it would a rectangular one. */
export function pointOnRoomEdge(p: Point, r: RoomBox, tol: number): boolean {
  if (r.poly) return pointOnPolygonEdge(p, r.poly, tol);
  const onLeftRight =
    (Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.w)) <= tol) && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  const onTopBottom =
    (Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.h)) <= tol) && p.x >= r.x - tol && p.x <= r.x + r.w + tol;
  return onLeftRight || onTopBottom;
}

/**
 * Ids of the rooms whose perimeter point `p` sits on (within tolerance). Iterates
 * `roomRects` in insertion order so callers get a stable, element-ordered list:
 * ≤2 ids for a door on a shared partition, 1 for a window on an exterior wall.
 */
export function roomsAtPoint(p: Point, roomRects: Map<string, RoomBox>, tol: number): string[] {
  const out: string[] = [];
  for (const [id, rect] of roomRects) {
    if (pointOnRoomEdge(p, rect, tol)) out.push(id);
  }
  return out;
}

/**
 * The one or two spaces a door connects: room ids, and/or the literal `"exterior"`
 * when the door sits on an outer wall with open space on one side. This is the
 * adjacency-via-doors edge that both {@link import("./describe.js").describe} (for its
 * `between` field) and the connectivity lint rules build their room graph from.
 */
export function doorConnections(
  d: { at: Point; host: { category: string } | null },
  roomRects: Map<string, RoomBox>,
  tol: number,
): string[] {
  const touching = roomsAtPoint(d.at, roomRects, tol);
  const onExterior = d.host?.category === "exterior";
  return touching.length >= 2 ? touching.slice(0, 2) : onExterior ? ["exterior", ...touching] : touching;
}

/** The synthetic graph node standing for the world outside the building. */
export const EXTERIOR_NODE = "exterior";

/**
 * Default mm subtracted from a door's *nominal* width to estimate its *clear*
 * opening (leaf thickness, stop, frame projection). A coarse advisory assumption —
 * a real clear width depends on door type and hardware, which ArchLang doesn't model
 * yet — so the access graph exposes BOTH the nominal and the estimate.
 */
export const DEFAULT_CLEAR_ALLOWANCE_MM = 60;

/**
 * What a connector with three or more rooms at its point joins. The point is on
 * several room edges, so the edge-touch test alone does not say which two rooms it
 * connects.
 *
 *  - `"probe"` asks the connector's HOST WALL: one wall thickness either side of its
 *    centreline ({@link wallFaceProbes}), which room's floor holds the probe point
 *    ({@link pointInRoomBox}, shape-aware)? A probe on no floor is the `exterior` side
 *    when the host is an exterior wall. When both faces resolve, to two different
 *    spaces, the connector joins exactly those. When either face cannot be decided —
 *    the probe lies on a room boundary (in two floors at once), or in no floor behind a
 *    non-exterior host — the edge is `ambiguous` and joins nothing. Every surface uses
 *    it: `describe().access`, Plan JSON, circulation, lint reachability,
 *    `suggestTopology` and the intent channel's `reachable`
 *    (`test/access-policy.test.ts` is the agreement law).
 *  - `"drop"` joins nothing: every such connector is `ambiguous`. The reference the
 *    probe degrades to when it cannot decide.
 *
 * A connector touching two rooms or fewer is never `ambiguous` and is answered the same
 * under either policy: by its host wall's two faces when it has a host
 * ({@link connectorConnection}), else by {@link doorConnections}.
 */
export type AmbiguityPolicy = "probe" | "drop";

/** What {@link connectorEdges} reads off a door or cased opening. `RDoor` and
 *  `ROpening` satisfy it as they are. */
export interface AccessConnector {
  id: string;
  at: Point;
  width: number;
  host: (Pick<WallSegment, "a" | "b" | "arc" | "thickness"> & { category: string; wallId: string }) | null;
  kind: "door" | "opening";
  /** A door's kind when it is not hinged ({@link RDoor.doorKind}); a `double` door passes
   *  through one leaf ({@link activeLeafWidth}). */
  doorKind?: string;
}

/**
 * The width a person passes through: a `double` door's one active leaf, half its width (the
 * ADA 2010 Standards 404.2.3: "for a pair of doors, at least one of the active leaves" gives the
 * clear width), else the whole width. Read by `W_DOOR_CLEARANCE` and by every connector's clear
 * width ({@link connectorClearWidth}), so `W_PATH_TOO_NARROW` reads the leaf too.
 */
export function activeLeafWidth(d: { width: number; doorKind?: string }): number {
  return d.doorKind === "double" ? d.width / 2 : d.width;
}

/**
 * How far (mm) a connector's jamb probes stand inside each end of its opening, along the
 * host run: `min(JAMB_PROBE_INSET_MM, width / 4)`. 50 mm is half the thinnest partition
 * the examples draw, so a partition whose FACE meets a jamb (the honest way to hang a door
 * beside a T) is not read as running into the opening, while one whose centreline is any
 * further inside is. The quarter-width cap keeps a very narrow connector's probes apart.
 */
export const JAMB_PROBE_INSET_MM = 50;

/** What one side of a connector's host wall holds, probed one wall thickness from the
 *  host's CENTRELINE ({@link wallFaceProbes}) — half a thickness past that face. Exported
 *  for `W_CONNECTOR_AMBIGUOUS`, which names the rooms on each side from this reading. */
export interface FaceReading {
  /** Rooms whose floor holds the CENTRE probe (closed bounds), in `roomRects` order. */
  holders: string[];
  /** Every room covering a positive length (mm) of the face's clear span — the path
   *  jamb probe → centre probe → jamb probe — in `roomRects` order. */
  cover: Array<{ id: string; mm: number }>;
}

/**
 * Length (mm) of the polyline `path` lying on the room's floor, from the shape: each leg
 * is cut at every crossing with the room's ring (and at the ring's vertices where an edge
 * runs along it), and each piece counts when its midpoint is on the floor
 * ({@link pointInRoomBox}, closed bounds). Exact for any simple ring; never a bounding box.
 */
function pathLengthInRoom(path: readonly Point[], box: RoomBox): number {
  const ring = roomRing(box);
  let total = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const p = path[k]!;
    const q = path[k + 1]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const cuts = [0, 1];
    for (const [u, v] of polygonEdges(ring)) {
      const ex = v.x - u.x;
      const ey = v.y - u.y;
      const wx = u.x - p.x;
      const wy = u.y - p.y;
      const den = dx * ey - dy * ex;
      if (den !== 0) {
        const t = (wx * ey - wy * ex) / den;
        const s = (wx * dy - wy * dx) / den;
        if (t > 0 && t < 1 && s >= 0 && s <= 1) cuts.push(t);
      } else if (wx * dy - wy * dx === 0) {
        // Collinear with the leg: its two ends are where the floor may start or stop.
        for (const e of [u, v]) {
          const t = ((e.x - p.x) * dx + (e.y - p.y) * dy) / len2;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i]!;
      const t1 = cuts[i + 1]!;
      if (t1 <= t0) continue;
      const tm = (t0 + t1) / 2;
      if (pointInRoomBox({ x: p.x + dx * tm, y: p.y + dy * tm }, box)) total += (t1 - t0) * Math.sqrt(len2);
    }
  }
  return total;
}

/** The point `along` mm from `at` along the host run: on the arc itself for a curved host
 *  (clamped to its ends), along the chord direction for a straight one. */
function alongHost(host: NonNullable<AccessConnector["host"]>, at: Point, along: number): Point {
  if (host.arc) {
    const total = arcLength(host.arc);
    const t = total === 0 ? 0 : Math.min(1, Math.max(0, arcParamAt(host.arc, at) + along / total));
    return arcPointAt(host.arc, t);
  }
  const ux = host.b.x - host.a.x;
  const uy = host.b.y - host.a.y;
  const l = Math.hypot(ux, uy) || 1;
  return { x: at.x + (ux / l) * along, y: at.y + (uy / l) * along };
}

/**
 * The length (mm) of `box`'s floor along one face of a connector's host, between the run
 * offsets `from` and `to` (mm from `at`): the probe path {@link connectorFaces} measures a
 * face's `cover` over, cut to a sub-range of it. `W_CONNECTOR_AMBIGUOUS` uses it to take a
 * meeting wall's body out of a straddled room's cover.
 */
export function faceLengthInRoom(
  host: NonNullable<AccessConnector["host"]>,
  at: Point,
  from: number,
  to: number,
  side: "minus" | "plus",
  box: RoomBox,
): number {
  const dist = Math.max(host.thickness, 1);
  const path = [from, (from + to) / 2, to].map((s) => wallFaceProbes(host, alongHost(host, at, s), dist)[side]);
  return pathLengthInRoom(path, box);
}

/**
 * The two sides of a connector's host wall, `[minus, plus]` ({@link wallFaceProbes}),
 * each probed one wall thickness from the host's centreline (half a thickness past the
 * face) at the centre and a little inside both jambs ({@link JAMB_PROBE_INSET_MM}). `null`
 * for a connector with no host.
 *
 * A room whose bounding box, grown by the host's thickness, misses the probe path's box is
 * skipped before its shape is asked: a room's box holds its whole floor, so this only
 * FILTERS candidates — every answer still comes from the shape.
 */
export function connectorFaces(
  c: Pick<AccessConnector, "at" | "host"> & { width?: number },
  roomRects: Map<string, RoomBox>,
): [FaceReading, FaceReading] | null {
  const host = c.host;
  if (!host) return null;
  const dist = Math.max(host.thickness, 1);
  const width = c.width ?? 0;
  const half = Math.max(0, width / 2 - Math.min(JAMB_PROBE_INSET_MM, width / 4));
  const centre = wallFaceProbes(host, c.at, dist);
  const jambLo = wallFaceProbes(host, alongHost(host, c.at, -half), dist);
  const jambHi = wallFaceProbes(host, alongHost(host, c.at, half), dist);
  const read = (side: "minus" | "plus"): FaceReading => {
    const mid = centre[side];
    const path = [jambLo[side], mid, jambHi[side]];
    const x0 = Math.min(path[0]!.x, mid.x, path[2]!.x) - dist;
    const x1 = Math.max(path[0]!.x, mid.x, path[2]!.x) + dist;
    const y0 = Math.min(path[0]!.y, mid.y, path[2]!.y) - dist;
    const y1 = Math.max(path[0]!.y, mid.y, path[2]!.y) + dist;
    const holders: string[] = [];
    const cover: FaceReading["cover"] = [];
    for (const [id, box] of roomRects) {
      if (box.x > x1 || box.x + box.w < x0 || box.y > y1 || box.y + box.h < y0) continue;
      if (pointInRoomBox(mid, box)) holders.push(id);
      const mm = pathLengthInRoom(path, box);
      if (mm > 0) cover.push({ id, mm });
    }
    return { holders, cover };
  };
  return [read("minus"), read("plus")];
}

/**
 * The doorway's face on one side of its host wall, half the host's thickness from the
 * centreline: `[jamb, centre, jamb]`, the jambs at the ends of the connector's width along
 * the host run (on the arc itself for a curved host). The same three stations
 * {@link connectorFaces} probes, set on the face rather than past it; a distance from the
 * doorway into a room is measured from this path.
 */
export function connectorFacePath(
  c: Pick<AccessConnector, "at"> & { host: NonNullable<AccessConnector["host"]>; width: number },
  side: "minus" | "plus",
): [Point, Point, Point] {
  const d = c.host.thickness / 2;
  const half = c.width / 2;
  return [
    wallFaceProbes(c.host, alongHost(c.host, c.at, -half), d)[side],
    wallFaceProbes(c.host, c.at, d)[side],
    wallFaceProbes(c.host, alongHost(c.host, c.at, half), d)[side],
  ];
}

/** The pair `a`/`b` in `roomRects` order with `exterior` first — the order
 *  {@link doorConnections} uses — so it depends on no page direction. */
function orderedPair(a: string, b: string, roomRects: Map<string, RoomBox>): [string, string] {
  const order = [EXTERIOR_NODE, ...roomRects.keys()];
  return order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a];
}

/**
 * The two spaces a connector touching 3+ rooms joins under the `"probe"`
 * {@link AmbiguityPolicy}, or `null` when the probe cannot decide: a centre probe on a
 * room boundary, or on no floor behind a non-exterior host, decides nothing.
 */
function probeConnection(
  faces: [FaceReading, FaceReading],
  hostCategory: string,
  roomRects: Map<string, RoomBox>,
): [string, string] | null {
  const face = (f: FaceReading): string | null => {
    if (f.holders.length === 1) return f.holders[0]!;
    if (f.holders.length === 0 && hostCategory === "exterior") return EXTERIOR_NODE;
    return null; // on a room boundary, or in no floor behind an interior wall
  };
  const a = face(faces[0]);
  const b = face(faces[1]);
  if (a === null || b === null || a === b) return null;
  return orderedPair(a, b, roomRects);
}

/**
 * The two spaces a hosted connector touching ≤2 rooms joins, read off its host wall's
 * faces, or `null` when they do not name two different spaces. A face whose centre probe
 * is on one floor is that room; on no floor, `exterior` behind an exterior host (else
 * undecided); on a boundary two floors share, the room covering more of that face's
 * clear span — a measured length, ties to `roomRects` order.
 *
 * A face's room counts only when it is one of the rooms the connector's point `touching`
 * (`exterior` always counts). The probe stands half a thickness past the face, so behind a
 * thick wall and a room shallower than that it lands in the room beyond, which the
 * connector does not open into; such a face decides nothing.
 */
function faceConnection(
  faces: [FaceReading, FaceReading],
  hostCategory: string,
  touching: readonly string[],
  roomRects: Map<string, RoomBox>,
): [string, string] | null {
  const face = (f: FaceReading): string | null => {
    if (f.holders.length === 0) return hostCategory === "exterior" ? EXTERIOR_NODE : null;
    let best = f.holders[0]!;
    let bestMm = -1;
    for (const id of f.holders) {
      const mm = f.cover.find((x) => x.id === id)?.mm ?? 0;
      if (mm > bestMm) {
        best = id;
        bestMm = mm;
      }
    }
    return touching.includes(best) ? best : null;
  };
  const a = face(faces[0]);
  const b = face(faces[1]);
  if (a === null || b === null || a === b) return null;
  return orderedPair(a, b, roomRects);
}

/**
 * Every room a face's clear span covers, over each face that covers more than one, in
 * `roomRects` order — or `undefined` when no face does. Never suppressed for equalling
 * `between`: a wall running into the opening is the fact, whichever rooms it divides.
 */
function straddledRooms(faces: [FaceReading, FaceReading], roomRects: Map<string, RoomBox>): string[] | undefined {
  const covered = new Set<string>();
  for (const f of faces) if (f.cover.length > 1) for (const x of f.cover) covered.add(x.id);
  if (covered.size === 0) return undefined;
  return [...roomRects.keys()].filter((id) => covered.has(id));
}

/**
 * The spaces one connector joins, whether it is `ambiguous`, and the rooms its opening
 * `straddles` — the ONE answer every access surface reads (`describe().doors[]`/
 * `openings[]` `between`, `describe().access`, circulation, lint reachability,
 * `suggestTopology`).
 *
 *  - No host wall: {@link doorConnections}, `ambiguous` when 3+ rooms touch its point.
 *  - A host, ≤2 rooms touching: the room on each face of the host wall
 *    ({@link faceConnection}) — never the centre point's edge touch alone, which hands an
 *    exterior door on a T-junction or beside a partition's end to the two rooms inside.
 *    A face's room counts only if the point touches it. When the faces do not name two
 *    different spaces, {@link doorConnections}' answer.
 *  - A host, 3+ rooms touching: resolved by `policy` ({@link AmbiguityPolicy}); when that
 *    cannot decide it keeps {@link doorConnections}' pair for display and is `ambiguous`.
 *
 * `straddles` ({@link AccessEdge.straddles}) is present only for a hosted connector whose
 * clear span on a face covers more than one room.
 */
export function connectorConnection(
  c: Pick<AccessConnector, "at" | "host"> & { width?: number },
  roomRects: Map<string, RoomBox>,
  tol: number,
  policy: AmbiguityPolicy = "probe",
): { between: string[]; ambiguous: boolean; straddles?: string[] } {
  const touching = roomsAtPoint(c.at, roomRects, tol);
  const faces = connectorFaces(c, roomRects);
  const hostCategory = c.host?.category ?? "";
  // A connector that is not ON its host — a free `door at` far from every wall is still
  // given the nearest segment — has no faces of its own: it keeps the edge-touch answer and
  // straddles nothing. The tolerance is `hostInfoForWalls`' own on-wall test. (The 3+-room
  // policy probes it as it always has.)
  const onHost =
    c.host !== null && distPointToWallSegment(c.at, c.host) <= c.host.thickness / 2 + Math.max(c.host.thickness, 1);
  let between: string[];
  let ambiguous = false;
  if (touching.length < 3) {
    between =
      (faces && onHost && faceConnection(faces, hostCategory, touching, roomRects)) ||
      doorConnections(c, roomRects, tol);
  } else {
    const probed = faces && policy === "probe" ? probeConnection(faces, hostCategory, roomRects) : null;
    between = probed ?? doorConnections(c, roomRects, tol);
    ambiguous = probed === null;
  }
  const straddles = faces && onHost ? straddledRooms(faces, roomRects) : undefined;
  return straddles ? { between, ambiguous, straddles } : { between, ambiguous };
}

/** Do the open segments p1–p2 and q1–q2 cross (a proper crossing, not a touch)? */
function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = (q2.x - q1.x) * (p1.y - q1.y) - (q2.y - q1.y) * (p1.x - q1.x);
  const d2 = (q2.x - q1.x) * (p2.y - q1.y) - (q2.y - q1.y) * (p2.x - q1.x);
  const d3 = (p2.x - p1.x) * (q1.y - p1.y) - (p2.y - p1.y) * (q1.x - p1.x);
  const d4 = (p2.x - p1.x) * (q2.y - p1.y) - (p2.y - p1.y) * (q2.x - p1.x);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Does window `w` serve room `id`: on that room's perimeter (every room it touches, so a
 * window on a shared straight wall serves both, as the daylight rules always read it), or,
 * on an arc edge no room touches, attributed to it by {@link arcWindowRoom}? The lint side of
 * `describe().windows[].room`, which is the first room the window's point touches
 * ({@link roomsAtPoint}) or else that same {@link arcWindowRoom} answer.
 */
export function windowServesRoom(
  w: { at: Point; width: number; host: WallSegment | null },
  id: string,
  roomRects: Map<string, RoomBox>,
  tol: number,
  segs: readonly WallSegment[] = [],
): boolean {
  const box = roomRects.get(id);
  if (!box) return false;
  if (pointOnRoomEdge(w.at, box, tol)) return true;
  if (!w.host?.arc || roomsAtPoint(w.at, roomRects, tol).length > 0) return false;
  return arcWindowRoom({ at: w.at, width: w.width, host: w.host }, roomRects, tol, segs) === id;
}

/**
 * The room a window on an ARC wall edge serves, from the shape — or `null` (plan-soundness
 * PS0.12). Asked only for a window whose point no room's edge touches: one that a room edge
 * touches keeps the first such room, as every window always has.
 *
 * 1. **The faces.** One wall thickness off the arc's concave and convex faces at the window
 *    centre and just inside its jambs ({@link connectorFaces}, PS0.1's probes, which walk the
 *    arc's own normal): a face whose centre probe is on a floor names that room, a boundary
 *    two floors share going to the room covering more of the face's span (ties to
 *    `roomRects` order). One face naming a room is the answer; both naming rooms (an interior
 *    curved wall) gives the first in `roomRects` order, the order {@link roomsAtPoint} uses.
 *    This is the case of a room whose floor follows the curve (a `room circle`, or a polygon
 *    traced along the arc).
 * 2. **The bay.** A room drawn to the arc's CHORD leaves the bay between chord and curve on
 *    no room's floor, so neither probe lands anywhere. Then the probe is carried on along the
 *    concave normal (towards the arc's centre) to where it crosses the chord, and one wall
 *    thickness past it. The first room in `roomRects` order whose floor holds that point and
 *    whose edge holds the crossing serves the window (the bay opens into it there), provided
 *    no other wall runs between the window and the probe: a wall standing on the chord at the
 *    crossing, or crossing the way in, closes the bay off, and the window then serves no
 *    room. The window's CENTRE decides, as it does on a straight wall: a bay whose chord two
 *    rooms share goes to the room in front of the window's centre.
 *
 * `null` when neither step names a room. A room's bounding box only filters candidates in the
 * face probes; every answer comes from `pointInRoomBox`/`pointOnRoomEdge` on the shape.
 */
export function arcWindowRoom(
  w: { at: Point; width: number; host: WallSegment },
  roomRects: Map<string, RoomBox>,
  tol: number,
  segs: readonly WallSegment[],
): string | null {
  const host = w.host;
  const arc = host.arc;
  if (!arc) return null;
  const faces = connectorFaces(w, roomRects);
  if (faces) {
    const named = (f: FaceReading): string | null => {
      if (f.holders.length === 0) return null;
      let best = f.holders[0]!;
      let bestMm = -1;
      for (const id of f.holders) {
        const mm = f.cover.find((x) => x.id === id)?.mm ?? 0;
        if (mm > bestMm) {
          best = id;
          bestMm = mm;
        }
      }
      return best;
    };
    const a = named(faces[0]);
    const b = named(faces[1]);
    if (a !== null || b !== null) {
      if (a === null || b === null) return (a ?? b)!;
      return [...roomRects.keys()].find((id) => id === a || id === b) ?? a;
    }
  }
  // The bay: along the concave normal from the window centre to the chord a–b.
  const ux0 = arc.center.x - w.at.x;
  const uy0 = arc.center.y - w.at.y;
  const ul = Math.hypot(ux0, uy0);
  if (ul === 0) return null;
  const u = { x: ux0 / ul, y: uy0 / ul };
  const cx = arc.b.x - arc.a.x;
  const cy = arc.b.y - arc.a.y;
  const den = u.x * cy - u.y * cx;
  if (den === 0) return null; // the normal runs along the chord
  const t = ((arc.a.x - w.at.x) * cy - (arc.a.y - w.at.y) * cx) / den;
  const s = ((arc.a.x - w.at.x) * u.y - (arc.a.y - w.at.y) * u.x) / den;
  if (!(t > 0) || s < 0 || s > 1) return null; // the chord is not ahead of the window
  const crossing = { x: w.at.x + u.x * t, y: w.at.y + u.y * t };
  const reach = t + Math.max(host.thickness, 1);
  const probe = { x: w.at.x + u.x * reach, y: w.at.y + u.y * reach };
  // No other wall between the window and the probe: crossing it, or standing on the chord.
  for (const g of segs) {
    if (g.wallId === host.wallId && g.index === host.index) continue;
    if (distPointToWallSegment(crossing, g) <= g.thickness / 2) return null;
    if (!g.arc && segmentsCross(w.at, probe, g.a, g.b)) return null;
  }
  for (const [id, box] of roomRects) if (pointInRoomBox(probe, box) && pointOnRoomEdge(crossing, box, tol)) return id;
  return null;
}

/** One connector (door or cased opening) as a graph edge between two spaces. */
export interface AccessEdge {
  /** Id of the door/opening element. (`doorId` kept as the historical field name.) */
  doorId: string;
  /** Whether this edge is a `door` (has a leaf) or a leaf-less `opening`. */
  kind: "door" | "opening";
  /** The two spaces it connects (room ids and/or `"exterior"`). */
  between: [string, string];
  nominalWidth: number;
  /** Clear opening width: a door loses the leaf/stop allowance from its active leaf (half a
   *  `double` door's width); an opening keeps it all. */
  estimatedClearWidth: number;
  /** Category of the host wall, if any (`"exterior"`, `"partition"`, …). */
  hostCategory?: string;
  /** Id of the host wall, if any (answers "which wall is this opening on?"). */
  hostWallId?: string;
  /** Connects the exterior to a room (an entrance edge). */
  exterior: boolean;
  /** The point touched 3+ rooms and the wall-face probe could not decide which two the
   *  connector joins — a probe landed on a room boundary, or in no floor behind an
   *  interior wall ({@link AmbiguityPolicy}). The edge is reported, its `between` the
   *  first two touching spaces, but it joins nothing: it is excluded from reachability,
   *  bottleneck and circulation. */
  ambiguous: boolean;
  /** Every room the opening's clear span covers on a face of its host wall, when a face
   *  covers more than one (a partition runs into the opening), in room order — even when
   *  those are the `between` pair. Measured one wall thickness from the host's centreline
   *  (half a thickness past each face) between probes just inside the jambs
   *  ({@link JAMB_PROBE_INSET_MM}). Absent when no face straddles. */
  straddles?: string[];
}

/** A room as a node, with its reachability facts from the building entrance(s). */
export interface AccessRoomNode {
  id: string;
  /** Door hops from the nearest entrance (1 = opens directly outside); null if unreachable. */
  depthFromEntrance: number | null;
  /** Reachable from the exterior through modeled doors. */
  reachable: boolean;
  /** Narrowest clear width (mm) along the widest path from the exterior; null if unreachable. */
  bottleneckClearWidth: number | null;
  /** Door hops from the MAIN entrance (its room is 1) without going outside; `null` for a room
   *  reached only through another door from outside, or not at all. Present only in
   *  `describe().access` when {@link AccessGraph.mainEntrance} names a door (PS0.10). */
  depthFromMainEntrance?: number | null;
}

/** How {@link MainEntranceFact.door} was chosen, or why the choice was refused. */
export type MainEntranceBasis = "sole" | "entry-room" | "street" | "tie" | "no-candidate" | "upper-storey";

/**
 * Which exterior door is the storey's front door (plan-soundness PS0.10), when the plan says so
 * unambiguously: `src/analyze/entrance.ts` holds the rule and its refusals.
 */
export interface MainEntranceFact {
  /** The main entrance's id, or `null` when the choice is refused. */
  door: string | null;
  basis: MainEntranceBasis;
  /** The doors the deciding step singled out or compared, in entrance order: the door into the
   *  entrance space (`entry-room`), the hinged street-side door (`street`), the one door left
   *  (`sole`), or every candidate nothing singled out (`tie`). Empty with `no-candidate` and
   *  `upper-storey`. */
  candidates: string[];
}

/**
 * The modeled door access graph: rooms (and a synthetic exterior node) joined by
 * door edges, with reachability/depth and a widest-path clear-width bottleneck.
 * This is the geometric+topological *fact* layer circulation lint builds on — it is
 * a model of the *modeled doors*, not circulation truth (open-plan/cased openings
 * that are not `door`s are invisible until the language models them).
 */
export interface AccessGraph {
  /** Door ids that connect the exterior to a room. */
  entrances: string[];
  hasEntrance: boolean;
  edges: AccessEdge[];
  rooms: AccessRoomNode[];
  /** The storey's main entrance: present only in `describe().access`, and only on a storey
   *  with more than one entrance (PS0.10; `src/analyze/entrance.ts`). */
  mainEntrance?: MainEntranceFact;
}

/**
 * A connector's estimated CLEAR width from its nominal one: an opening keeps its full width
 * (no leaf); a door loses `clearAllowanceMm` for the leaf and stop, never below 0, from the one
 * leaf a person passes (`leaves`: a `double` door's width is shared by two, {@link activeLeafWidth}). The one
 * deduction behind {@link AccessEdge.estimatedClearWidth}, and so behind every circulation
 * bottleneck `W_PATH_TOO_NARROW` measures — a rule that asks "would a narrower door pass?"
 * calls this rather than restating it.
 */
export function connectorClearWidth(
  kind: AccessConnector["kind"],
  width: number,
  clearAllowanceMm: number,
  leaves = 1,
): number {
  return kind === "opening" ? width : Math.max(0, width / leaves - clearAllowanceMm);
}

/** How many leaves a connector's width is shared by: 2 for a `double` door, else 1. */
export const leavesOf = (c: { kind: string; doorKind?: string }): number =>
  c.kind === "door" && c.doorKind === "double" ? 2 : 1;

/**
 * One {@link AccessEdge} per connector, in connector order. An opening keeps its full
 * width as clear (no leaf); a door loses `clearAllowanceMm` for the leaf and stop.
 * `policy` decides what a connector touching 3+ rooms joins ({@link AmbiguityPolicy}).
 */
export function connectorEdges(
  roomRects: Map<string, RoomBox>,
  connectors: readonly AccessConnector[],
  tol: number,
  clearAllowanceMm: number,
  policy: AmbiguityPolicy = "probe",
): AccessEdge[] {
  return connectors.map((c) => {
    const { between, ambiguous, straddles } = connectorConnection(c, roomRects, tol, policy);
    const exterior = between.includes(EXTERIOR_NODE);
    return {
      doorId: c.id,
      kind: c.kind,
      between: [between[0] ?? "", between[1] ?? ""] as [string, string],
      nominalWidth: c.width,
      estimatedClearWidth: connectorClearWidth(c.kind, c.width, clearAllowanceMm, leavesOf(c)),
      ...(c.host?.category !== undefined ? { hostCategory: c.host.category } : {}),
      ...(c.host?.wallId !== undefined ? { hostWallId: c.host.wallId } : {}),
      exterior,
      ambiguous,
      ...(straddles ? { straddles } : {}),
    };
  });
}

/** Does the edge join two spaces: two endpoints, and not ambiguous? */
const joins = (e: AccessEdge): boolean => !e.ambiguous && e.between[0] !== "" && e.between[1] !== "";

/**
 * The access graph as a {@link Digraph}: nodes are {@link EXTERIOR_NODE} then the rooms,
 * and every joining edge appears in both directions, in edge order, carrying its
 * {@link AccessEdge}.
 */
export function accessDigraph(roomIds: readonly string[], edges: readonly AccessEdge[]): Digraph<string, AccessEdge> {
  const adj = new Map<string, Array<{ to: string; w: AccessEdge }>>();
  const link = (a: string, b: string, w: AccessEdge): void => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, w });
  };
  for (const e of edges) {
    if (!joins(e)) continue;
    const [a, b] = e.between;
    link(a, b, e);
    link(b, a, e);
  }
  return { nodes: [EXTERIOR_NODE, ...roomIds], out: (n) => adj.get(n) ?? [] };
}

/**
 * The spaces reachable from {@link EXTERIOR_NODE} and from `extraSources` (rooms a
 * shaft delivers you into), never entering a node `avoid` names. An avoided extra
 * source is not a source; the exterior is one unless `exterior: false` (a storey with no
 * way in of its own — the exterior node stays walkable THROUGH, it is only not a start).
 *
 * Caveat of walking through it: {@link EXTERIOR_NODE} is ONE node for every exterior
 * connector on the storey. On an ungrounded storey those are the doors
 * {@link levelIsGrounded} discounted (they open onto an `outdoor balcony`), so two SEPARATE
 * balconies are one node here: a room whose only way out is a door onto balcony B is
 * reached from any room with a door onto balcony A. That is the storey's own
 * `describe().access` graph answering exactly as it does for that storey's facts, and is
 * kept on purpose; separating balconies needs one node per outdoor surface.
 */
export function reachFrom(
  g: Digraph<string, unknown>,
  o: { extraSources?: readonly string[]; avoid?(id: string): boolean; exterior?: boolean } = {},
): ReadonlySet<string> {
  const avoid = o.avoid;
  const sources: Array<readonly [string, boolean]> = o.exterior === false ? [] : [[EXTERIOR_NODE, true]];
  for (const id of o.extraSources ?? []) if (!avoid?.(id)) sources.push([id, true]);
  const { value } = bestPaths(g, {
    s: BOOLEAN,
    weight: () => true,
    sources,
    ...(avoid ? { admit: (n: string) => !avoid(n) } : {}),
    rank: () => 0,
  });
  return new Set(value.keys());
}

/**
 * The wet rooms `W_BATH_VIA_BEDROOM` names on one storey: reachable (`reachAll`), but not
 * without passing through a bedroom (`reachNoBed`) — and only when NO wet room on the
 * storey is reachable without one. The fault is a storey whose whole bathroom provision
 * sits behind a bedroom; an en-suite beside a bathroom or WC off circulation is the
 * conventional case and is not named. A WC counts as that other room because
 * {@link isWetRoom} is the one wet-room classification there is (`bath` or `wc`).
 *
 * The one definition `lint` and `suggestTopology` share, so they cannot disagree.
 */
export function wetRoomsOnlyViaBedroom(
  rooms: ReadonlyArray<{ label?: string; id: string; uses?: UseKind[] }>,
  reachAll: ReadonlySet<string>,
  reachNoBed: ReadonlySet<string>,
): ReadonlySet<string> {
  const wet = rooms.filter(isWetRoom);
  if (wet.some((r) => reachNoBed.has(r.id))) return new Set();
  return new Set(wet.filter((r) => reachAll.has(r.id)).map((r) => r.id));
}

/**
 * Build the {@link AccessGraph} from the resolved rooms + doors. Pure and
 * deterministic, on the `"probe"` policy. Depth is unit-weight `MIN_PLUS` from the
 * single {@link EXTERIOR_NODE} (breadth-first, neighbours in door source order); the
 * bottleneck is `MAX_MIN`, ties settled in `[exterior, ...rooms]` order. Both values are
 * unique optima, so no tie-break can change them.
 */
export function buildDoorAccessGraph(
  rooms: RRoom[],
  doors: RDoor[],
  tol: number,
  clearAllowanceMm: number = DEFAULT_CLEAR_ALLOWANCE_MM,
  openings: ROpening[] = [],
): AccessGraph {
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  // Doors and cased openings are both connectors, doors first.
  const edges = connectorEdges(roomRects, [...doors, ...openings], tol, clearAllowanceMm, "probe");
  return accessGraphOf(
    rooms.map((r) => r.id),
    edges,
  );
}

/**
 * The {@link AccessGraph} over given connector edges: its entrances, and each room's depth,
 * reachability and bottleneck from {@link EXTERIOR_NODE}. {@link buildDoorAccessGraph} is this
 * over every connector of the storey; the walk's graph (`walkAccessGraph`,
 * `src/analyze/entrance.ts`) is this over the edges it keeps.
 */
export function accessGraphOf(roomIds: readonly string[], edges: AccessEdge[]): AccessGraph {
  const g = accessDigraph(roomIds, edges);
  const entrances: string[] = [];
  for (const e of edges) {
    const [a, b] = e.between;
    if (joins(e) && e.exterior && (a === EXTERIOR_NODE) !== (b === EXTERIOR_NODE)) entrances.push(e.doorId);
  }

  // Door hops from the exterior (1 = a room opening directly outside).
  const depth = bestPaths(g, { s: MIN_PLUS, weight: () => 1, sources: [[EXTERIOR_NODE, 0]], rank: () => 0 }).value;
  // Widest path: the max over paths of the min clear width.
  const order = [EXTERIOR_NODE, ...roomIds];
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const best = bestPaths(g, {
    s: MAX_MIN,
    weight: (e) => e.estimatedClearWidth,
    sources: [[EXTERIOR_NODE, Infinity]],
    rank: (id) => rank.get(id) ?? order.length,
  }).value;

  const roomNodes: AccessRoomNode[] = roomIds.map((id) => {
    const reachable = depth.has(id);
    return {
      id,
      depthFromEntrance: reachable ? depth.get(id)! : null,
      reachable,
      bottleneckClearWidth: reachable ? (best.get(id) ?? null) : null,
    };
  });

  return { entrances, hasEntrance: entrances.length > 0, edges, rooms: roomNodes };
}

/**
 * Does door `d` open onto a balcony rather than genuinely onto the ground/street? Probes ONE
 * host-wall thickness off the door's own centre, on the side with no room — the exact
 * pattern `site.ts`'s `windowFacingPage` uses to find a window's outward side, reused
 * here because the question is the same shape: which side of this opening is "outside",
 * and what is actually out there. The SHAPE, never a bounding box — a poly balcony or a
 * poly room is tested with `pointInRoomBox`/`pointInPolygon`, exactly as those probes are
 * everywhere else in this codebase.
 *
 * A door whose probe cannot tell which side is outward (a room on BOTH sides, or on
 * NEITHER — a free-standing wall) is never called a balcony door: the ambiguous case
 * keeps the historical "this door is an entrance" answer rather than guessing.
 */
export function doorFacesBalcony(
  d: Pick<RDoor, "host" | "at">,
  rooms: readonly RRoom[],
  balconies: readonly ROutdoor[],
): boolean {
  if (!d.host || balconies.length === 0) return false;
  const { plus, minus } = wallFaceProbes(d.host, d.at, Math.max(d.host.thickness, 1));
  const onPlus = rooms.some((r) => pointInRoomBox(plus, roomBox(r)));
  const onMinus = rooms.some((r) => pointInRoomBox(minus, roomBox(r)));
  if (onPlus === onMinus) return false;
  const outward = onPlus ? minus : plus;
  return balconies.some((b) =>
    pointInPolygon(outward.x, outward.y, b.poly ?? rectRing({ x: b.at.x, y: b.at.y, w: b.size.w, h: b.size.h })),
  );
}

/**
 * Is a storey GROUNDED for {@link import("./vertical.js").verticalReach} purposes — does
 * it have an exterior entrance that is a real arrival point?
 *
 * A storey with an `outdoor balcony` and the door
 * [`W_BALCONY_NO_DOOR`](./error-catalog.js) requires is grounded by that door under the
 * plain "has an exterior door" reading, which is wrong: the door leads onto a slab, not
 * onto the ground, and treating it as an arrival point suppresses the stair's own
 * `arrivalRooms` entry — on `examples/garden-house.arch` the reachability BFS then enters
 * the upper storey through the main bedroom instead of the landing, and
 * `W_BATH_VIA_BEDROOM` fires on a bathroom that in fact opens straight off the landing.
 *
 * The fix is narrow, on purpose: an entrance door whose {@link doorFacesBalcony} probe
 * lands inside an `outdoor balcony` is discounted from grounding; every other exterior
 * door — including one onto an upper-storey deck that is NOT a `balcony` surface, and a
 * hillside entrance with no balcony in sight — keeps today's behaviour exactly. A storey
 * grounds as soon as ONE of its entrance doors survives the discount, so a balcony door
 * beside a real front door changes nothing.
 *
 * This governs the internal `grounded()` predicate `verticalReach` is built on — never
 * `describe()`'s per-storey `access.hasEntrance`, which stays the HONEST, undiscounted
 * fact that this floor has an exterior door (a reader asking "does this floor have its
 * own door" should not have the answer laundered by what that door opens onto). The two
 * are read together deliberately: `lint.ts` and `describe.ts` both reach this function
 * through {@link storeyGrounded}, so the cross-storey answer (`vertical.reachable_levels`,
 * and the reachability lint rules that key off it) can never disagree with itself between
 * the CLI and the lint pass.
 *
 * Lives here, next to {@link buildDoorAccessGraph}, rather than in `vertical.ts`: this
 * needs `pointInRoomBox`/`roomBox` (this module) and the door-normal probe geometry, and
 * `vertical.ts` is imported by the `stair` element, so `vertical.ts → analyze.ts →
 * registry.ts → elements/defs.ts → elements/stair.ts` would be a real import cycle.
 */
export function levelIsGrounded(
  graph: AccessGraph,
  rooms: readonly RRoom[],
  doors: readonly RDoor[],
  outdoors: readonly ROutdoor[],
): boolean {
  if (!graph.hasEntrance) return false;
  const balconies = outdoors.filter((o) => o.surface === "balcony");
  if (balconies.length === 0) return true;
  const byId = new Map(doors.map((d) => [d.id, d]));
  return graph.entrances.some((id) => {
    const d = byId.get(id);
    return !d || !doorFacesBalcony(d, rooms, balconies);
  });
}

/**
 * {@link levelIsGrounded} for one resolved storey: the `grounded()` callback `lint` and
 * `describe` both hand to `verticalReach`. The tolerance is explicit because the two
 * callers use their own (`LintRuleset.tolMm`, `DescribeOptions.adjacencyTolMm`).
 */
export function storeyGrounded(ir: ResolvedPlan, tol: number): boolean {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const outdoors = ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
  const graph = buildDoorAccessGraph(rooms, doors, tol, undefined, openings);
  return levelIsGrounded(graph, rooms, doors, outdoors);
}

/**
 * The rooms of one resolved storey walkable from a set of seeds — the exterior and/or the
 * rooms a shaft lands in — on the `"probe"` access graph that `describe().access` and lint
 * reachability read. The graph is built once; each call is one {@link reachFrom}. With
 * `exterior: false` the exterior node is not a start but stays walkable through, exactly
 * as {@link reachFrom} states — including its caveat: on an ungrounded storey every
 * exterior connector is a balcony door and all balconies share the one exterior node, so
 * two separate balconies are conflated (a stair in a room reachable only from balcony B
 * counts as reachable from a landing whose bedroom opens onto balcony A).
 */
export function storeyRoomReach(ir: ResolvedPlan, tol: number): (seeds: StoreySeeds) => ReadonlySet<string> {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  const g = accessDigraph(
    rooms.map((r) => r.id),
    connectorEdges(roomRects, [...doors, ...openings], tol, DEFAULT_CLEAR_ALLOWANCE_MM, "probe"),
  );
  return (seeds) => reachFrom(g, { exterior: seeds.exterior, extraSources: seeds.rooms });
}

/**
 * The {@link StoreyRoomReach} callback for a whole building, as `describe` and `lint` hand
 * it to `verticalReach`: one {@link storeyRoomReach} per storey, built on first use. The
 * tolerance is the caller's own, the same one its `grounded()` callback uses. A level the
 * building does not have reaches nothing.
 */
export function buildingRoomReach(
  levels: readonly { level: number; ir: ResolvedPlan }[],
  tol: number,
): StoreyRoomReach {
  const byLevel = new Map<number, (seeds: StoreySeeds) => ReadonlySet<string>>();
  return (level, seeds) => {
    let reach = byLevel.get(level);
    if (!reach) {
      const l = levels.find((x) => x.level === level);
      if (!l) return new Set<string>();
      reach = storeyRoomReach(l.ir, tol);
      byLevel.set(level, reach);
    }
    return reach(seeds);
  };
}

/**
 * How open a room's perimeter is (mm): the uncovered length of its WORST edge. For
 * each of the four axis-aligned edges, the orthogonal wall segments collinear with it
 * (within `tol`) are clipped to the edge and merged, and that edge's
 * `edgeLength − coveredLength` is its uncovered total — summed over every gap on the
 * edge, not the longest contiguous run. The largest per-edge total is returned.
 *
 * Openings (doors/windows) are not split out of wall centerlines — they live in
 * `RWall.openings` and are only subtracted at render time — so a wall carrying a
 * door still counts as fully enclosing. Only a genuine missing wall registers as a
 * gap (e.g. a partition that stops short, leaving a wet room open to a living space).
 * Angled walls match no edge and contribute nothing; the rule is for orthogonal rooms.
 */
export function largestPerimeterGap(
  rect: BBox,
  walls: WallLike[],
  tol: number,
  // Callers looping over many rooms hoist the segment list once and pass it in.
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): number {
  const edges = [
    { axis: "h" as const, fixed: rect.y, lo: rect.x, hi: rect.x + rect.w },
    { axis: "h" as const, fixed: rect.y + rect.h, lo: rect.x, hi: rect.x + rect.w },
    { axis: "v" as const, fixed: rect.x, lo: rect.y, hi: rect.y + rect.h },
    { axis: "v" as const, fixed: rect.x + rect.w, lo: rect.y, hi: rect.y + rect.h },
  ];
  let worst = 0;
  for (const e of edges) {
    const covered: Array<[number, number]> = [];
    for (const s of segs) {
      const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
      const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
      if (e.axis === "h") {
        if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.x, s.b.x);
        const shi = Math.max(s.a.x, s.b.x);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      } else {
        if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.y, s.b.y);
        const shi = Math.max(s.a.y, s.b.y);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      }
    }
    const gap = e.hi - e.lo - mergedLength(covered);
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * {@link largestPerimeterGap} for an arbitrary room RING: the worst run of any edge —
 * at any angle — not backed by a collinear wall centerline. Same measure, same
 * tolerance, expressed with the parallel-and-within-`tol` test from
 * {@link collinearOverlapLength} instead of the four axis-aligned edge cases, so a
 * trapezoid's sloping wall counts as enclosing it exactly as a square's side does.
 *
 * Kept separate from the rect version deliberately: the rect path is byte-pinned by
 * the lint corpus and must keep its own float arithmetic.
 */
export function largestPerimeterGapRing(
  ring: readonly Point[],
  walls: WallLike[],
  tol: number,
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): number {
  let worst = 0;
  for (const [a, b] of polygonEdges(ring)) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const gap = len - mergedLength(edgeWallCover(a, b, segs, tol));
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * How {@link edgeWallCover} decides that a wall stands on an edge by its BODY, not its
 * centreline: the segment is parallel to the edge and its body (centreline ± half its
 * thickness, widened by `slack` on each side) meets the strip `halfGap` either side of the
 * edge's line (the gap between two rooms drawn to a wall's faces; 0 when they share a line).
 */
export interface WallBodyTest {
  halfGap: number;
  slack: number;
}

/**
 * The runs of the edge `a`→`b` that a wall backs: every segment of `segs` parallel to the edge
 * with its line within `tol` ({@link collinearOverlapLength}), clipped to the edge, as
 * intervals in mm from `a` (unmerged, in `segs` order). The measure behind
 * {@link largestPerimeterGapRing} for one edge, byte for byte. With `body`
 * ({@link WallBodyTest}, `W_BOUNDARY_NO_WALL`'s reading of the run two rooms share) a segment
 * counts by its body instead, and `tol` is not read; that caller passes only straight
 * segments, since an arc's chord is not a wall.
 */
export function edgeWallCover(
  a: Point,
  b: Point,
  segs: readonly Pick<WallSegment, "a" | "b" | "thickness">[],
  tol: number,
  body?: WallBodyTest,
): Array<[number, number]> {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return [];
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const covered: Array<[number, number]> = [];
  for (const s of segs) {
    if (body) {
      const sx = s.b.x - s.a.x;
      const sy = s.b.y - s.a.y;
      const sl = Math.hypot(sx, sy);
      if (sl < VERTEX_EPS || Math.abs(ux * sy - uy * sx) / sl > 1e-9) continue;
      const across = Math.abs((s.a.x - a.x) * -uy + (s.a.y - a.y) * ux);
      if (across - s.thickness / 2 - body.slack > body.halfGap) continue;
    } else if (collinearOverlapLength(a, b, s.a, s.b, tol) <= 0) continue;
    const t1 = (s.a.x - a.x) * ux + (s.a.y - a.y) * uy;
    const t2 = (s.b.x - a.x) * ux + (s.b.y - a.y) * uy;
    const lo = Math.max(0, Math.min(t1, t2));
    const hi = Math.min(len, Math.max(t1, t2));
    if (hi > lo) covered.push([lo, hi]);
  }
  return covered;
}

/**
 * {@link largestPerimeterGap} for a CIRCULAR room (`room circle`, centre `c`, radius
 * `r`): the length (mm) of its circumference NOT backed by a concentric arc wall —
 * measured by angle, never by the 48-gon tessellation, so the answer cannot move with
 * `ARC_STEP_DEG`. (The ring path matches wall centrelines PARALLEL to each facet; an
 * arc wall enters it only by its chord, which is parallel to no facet, so a fully
 * walled drum used to read as open by exactly one facet, 2R·sin 3.75°.)
 *
 * **What counts.** Only an `arc` wall segment whose centre is within `tol` of `c` and
 * whose radius is within `tol` of `r` — the circle analogue of "collinear within `tol`".
 * Both tests read the wall's CENTRELINE, exactly as the rect path does: an arc wall whose
 * inner face sits on `r` but whose half-thickness exceeds `tol` (a 420 mm wall has its
 * centreline at `r + 210`) backs nothing, and the room reads as open all the way round.
 *
 * Each admitted arc covers the angular interval between its two ENDPOINTS as seen from
 * the ROOM's centre `c` — never its own `|sweep|` hung off one endpoint — walked in the
 * reference direction (clockwise as drawn, from east — `fullCircleArc`): from `a` to `b`
 * for a clockwise arc, from `b` to `a` for a counter-clockwise one. So when the wall's
 * centre is off `c` by up to `tol`, two arcs that meet at a vertex still meet in angle
 * about `c` and the chain closes (the projection the rect/ring paths get from clipping a
 * parallel wall to the edge). `c` lies inside the arc's circle (the offset is ≤ `tol`,
 * far below any real radius), so the angle about `c` runs monotonically along the arc
 * and the interval is exactly the arc's footprint. Intervals wrap at 2π and are merged,
 * and the gap is `r × (2π − covered)` — ONE figure for the whole circumference (a
 * circle has no "worst edge"), which is also what the rect/ring versions' per-edge total
 * becomes when the whole perimeter is one edge.
 *
 * **Straight walls never count**, deliberately: a straight run touches a circle in at
 * most a point (a tangent) or crosses it, so it backs no finite length of the curve.
 * A circle room ringed by a FACETED polyline wall therefore reads as fully open
 * (`2πr`) — author the enclosure as `arc` edges (as every shipped circle room does).
 *
 * **Floats.** Each endpoint angle is `arcAngleOffset`'s one `Math.atan2` (two per arc),
 * taken about the ROOM's centre. `atan2` is not exactly rounded across engines, so the
 * result may differ in the last ulps between platforms; that is ~1e-12 mm on a real
 * radius, and the only consumer (`W_ROOM_NOT_ENCLOSED`) compares it to a whole-millimetre
 * threshold and prints `Math.round` of it. No other transcendental call is made.
 */
export function largestPerimeterGapCircle(c: Point, r: number, segs: readonly WallSegment[], tol: number): number {
  // The reference circle: `start` 0 (east), `sweep` +2π, so `arcAngleOffset(ref, p)` is
  // p's clockwise angle from east about `c`, in [0, 2π).
  const ref = fullCircleArc(c, r);
  const full = ref.sweep;
  const covered: Array<[number, number]> = [];
  for (const s of segs) {
    const arc = s.arc;
    if (!arc) continue;
    if (Math.hypot(arc.center.x - c.x, arc.center.y - c.y) > tol) continue;
    if (Math.abs(arc.r - r) > tol) continue;
    // Walk the arc clockwise: it starts at `a` when it runs clockwise, else at `b`.
    const cw = arc.sweep >= 0;
    const lo = arcAngleOffset(ref, cw ? arc.a : arc.b);
    const end = arcAngleOffset(ref, cw ? arc.b : arc.a);
    const hi = end < lo ? end + full : end;
    if (hi <= full) covered.push([lo, hi]);
    else covered.push([lo, full], [0, hi - full]);
  }
  return r * (full - mergedLength(covered));
}

/**
 * The activity-clearance rectangle directly in front of a fixture — the space a
 * person needs to use it. "Front" is the face opposite the symbol's back, derived
 * from its quarter-turn `rotate` (0 = back north → front south, 90 → front west, …).
 * Used by the clearance lint; returns a zero-area rect when `clearance` is 0.
 */
export function frontClearanceRect(
  f: { at: Point; size: { w: number; h: number }; rotate?: number },
  clearance: number,
): BBox {
  const { x, y } = f.at;
  const { w, h } = f.size;
  const rot = (((f.rotate ?? 0) % 360) + 360) % 360;
  switch (rot) {
    case 90:
      return { x: x - clearance, y, w: clearance, h }; // front west
    case 180:
      return { x, y: y - clearance, w, h: clearance }; // front north
    case 270:
      return { x: x + w, y, w: clearance, h }; // front east
    default:
      return { x, y: y + h, w, h: clearance }; // rot 0 → front south
  }
}

/**
 * Is any edge of `rect` backed by a wall over at least half its length (within
 * `tol` of a collinear wall centerline)? Distinguishes a fixture placed against a
 * wall from one floating in the middle of a room. `tol` should comfortably exceed a
 * wall's half-thickness (a fixture's back sits at the wall *face*, half a thickness
 * off the centerline) plus a small installation setback.
 *
 * The boolean summary of {@link wallBackedEdges} (same per-edge test, same order) —
 * kept as the entry point every existing caller already uses. Ask
 * {@link wallBackedEdges} / {@link backingWallForRoomEdge} instead when you need to
 * know *which* edge is backed (which way a fixture should face).
 */
export function isAgainstWall(
  rect: BBox,
  walls: WallLike[],
  tol: number,
  // Callers looping over many fixtures hoist the segment list once and pass it in.
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): boolean {
  const backing = wallBackedEdges(rect, walls, tol, segs);
  return RECT_EDGES.some((e) => backing[e] !== null);
}
