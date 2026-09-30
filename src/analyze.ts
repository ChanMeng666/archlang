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
import type { UseKind } from "./ast.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import { segmentsOfWall, wallFaceProbes, type WallLike, type WallSegment } from "./geometry.js";
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
} from "./geometry/polygon.js";
import { arcAngleOffset, fullCircleArc } from "./geometry/arc.js";
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
): { ir: ResolvedPlan | null; diagnostics: Diagnostic[]; levels: ResolvedLevel[] } {
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolveAll(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])];

  const hasError = diagnostics.some((d) => d.severity === "error");
  const ok = resolved !== null && !hasError;
  return { ir: ok ? resolved.ir : null, diagnostics, levels: ok ? resolved.levels : [] };
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
  // also carries for the grid layer, which understates the area by ~0.1%. See the
  // exact-vs-chordal note in docs/analysis.md.
  if (r.circle) return Math.PI * r.circle.r * r.circle.r;
  return r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
}

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
 * id) — exactly the classification the lint rules used before `uses` existed, so an
 * untagged plan behaves identically. Returns a set (a studio is `living kitchen`).
 *
 * The keyword match is the shared closed vocabulary in `src/vocabulary.ts`
 * ({@link classifyLabelUses}) — the token-bounded, data-driven form of the label
 * regexes that used to live here. Behaviour on the committed corpus is pinned by
 * `test/vocabulary-equivalence.test.ts`.
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
 *  - `"probe"` asks the connector's HOST WALL: one wall thickness off each face
 *    ({@link wallFaceProbes}), which room's floor holds the probe point
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
 * A connector touching two rooms or fewer is never affected: it keeps
 * {@link doorConnections}' answer under either policy.
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
}

/**
 * The two spaces a connector touching 3+ rooms joins under the `"probe"`
 * {@link AmbiguityPolicy}, or `null` when the probe cannot decide. The pair is in
 * `roomRects` order with `exterior` first — the order {@link doorConnections} uses — so
 * it depends on no page direction.
 */
function probeConnection(
  c: Pick<AccessConnector, "at" | "host">,
  roomRects: Map<string, RoomBox>,
): [string, string] | null {
  const host = c.host;
  if (!host) return null;
  const { plus, minus } = wallFaceProbes(host, c.at, Math.max(host.thickness, 1));
  const face = (p: Point): string | null => {
    const holding: string[] = [];
    for (const [id, box] of roomRects) if (pointInRoomBox(p, box)) holding.push(id);
    if (holding.length === 1) return holding[0]!;
    if (holding.length === 0 && host.category === "exterior") return EXTERIOR_NODE;
    return null; // on a room boundary, or in no floor behind an interior wall
  };
  const a = face(minus);
  const b = face(plus);
  if (a === null || b === null || a === b) return null;
  const order = [EXTERIOR_NODE, ...roomRects.keys()];
  return order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a];
}

/**
 * The spaces one connector joins, and whether it is `ambiguous` — the ONE answer every
 * access surface reads (`describe().doors[]`/`openings[]` `between`, `describe().access`,
 * circulation, lint reachability, `suggestTopology`). A connector touching ≤2 rooms is
 * exactly {@link doorConnections}; one touching 3+ is resolved by `policy`, and when
 * that cannot decide it keeps {@link doorConnections}' pair for display and is
 * `ambiguous`.
 */
export function connectorConnection(
  c: Pick<AccessConnector, "at" | "host">,
  roomRects: Map<string, RoomBox>,
  tol: number,
  policy: AmbiguityPolicy = "probe",
): { between: string[]; ambiguous: boolean } {
  const touching = roomsAtPoint(c.at, roomRects, tol);
  if (touching.length < 3) return { between: doorConnections(c, roomRects, tol), ambiguous: false };
  const probed = policy === "probe" ? probeConnection(c, roomRects) : null;
  return probed
    ? { between: probed, ambiguous: false }
    : { between: doorConnections(c, roomRects, tol), ambiguous: true };
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
  /** Clear opening width: a door loses the leaf/stop allowance; an opening keeps it all. */
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
}

/**
 * A connector's estimated CLEAR width from its nominal one: an opening keeps its full width
 * (no leaf); a door loses `clearAllowanceMm` for the leaf and stop, never below 0. The one
 * deduction behind {@link AccessEdge.estimatedClearWidth}, and so behind every circulation
 * bottleneck `W_PATH_TOO_NARROW` measures — a rule that asks "would a narrower door pass?"
 * calls this rather than restating it.
 */
export function connectorClearWidth(kind: AccessConnector["kind"], width: number, clearAllowanceMm: number): number {
  return kind === "opening" ? width : Math.max(0, width - clearAllowanceMm);
}

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
    const { between, ambiguous } = connectorConnection(c, roomRects, tol, policy);
    const exterior = between.includes(EXTERIOR_NODE);
    return {
      doorId: c.id,
      kind: c.kind,
      between: [between[0] ?? "", between[1] ?? ""] as [string, string],
      nominalWidth: c.width,
      estimatedClearWidth: connectorClearWidth(c.kind, c.width, clearAllowanceMm),
      ...(c.host?.category !== undefined ? { hostCategory: c.host.category } : {}),
      ...(c.host?.wallId !== undefined ? { hostWallId: c.host.wallId } : {}),
      exterior,
      ambiguous,
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
  const g = accessDigraph(
    rooms.map((r) => r.id),
    edges,
  );
  const entrances: string[] = [];
  for (const e of edges) {
    const [a, b] = e.between;
    if (joins(e) && e.exterior && (a === EXTERIOR_NODE) !== (b === EXTERIOR_NODE)) entrances.push(e.doorId);
  }

  // Door hops from the exterior (1 = a room opening directly outside).
  const depth = bestPaths(g, { s: MIN_PLUS, weight: () => 1, sources: [[EXTERIOR_NODE, 0]], rank: () => 0 }).value;
  // Widest path: the max over paths of the min clear width.
  const order = [EXTERIOR_NODE, ...rooms.map((r) => r.id)];
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const best = bestPaths(g, {
    s: MAX_MIN,
    weight: (e) => e.estimatedClearWidth,
    sources: [[EXTERIOR_NODE, Infinity]],
    rank: (id) => rank.get(id) ?? order.length,
  }).value;

  const roomNodes: AccessRoomNode[] = rooms.map((r) => {
    const reachable = depth.has(r.id);
    return {
      id: r.id,
      depthFromEntrance: reachable ? depth.get(r.id)! : null,
      reachable,
      bottleneckClearWidth: reachable ? (best.get(r.id) ?? null) : null,
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
function doorFacesBalcony(d: RDoor, rooms: readonly RRoom[], balconies: readonly ROutdoor[]): boolean {
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
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const covered: Array<[number, number]> = [];
    for (const s of segs) {
      if (collinearOverlapLength(a, b, s.a, s.b, tol) <= 0) continue;
      const t1 = (s.a.x - a.x) * ux + (s.a.y - a.y) * uy;
      const t2 = (s.b.x - a.x) * ux + (s.b.y - a.y) * uy;
      const lo = Math.max(0, Math.min(t1, t2));
      const hi = Math.min(len, Math.max(t1, t2));
      if (hi > lo) covered.push([lo, hi]);
    }
    const gap = len - mergedLength(covered);
    if (gap > worst) worst = gap;
  }
  return worst;
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
