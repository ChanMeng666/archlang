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
import type { OutdoorKind, PlanNode, UseKind } from "./ast.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { groundWalkable, outdoorRing } from "./elements/outdoor.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import { capDiagnostics } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import { segmentsOfWall, wallFaceProbes, type WallLike, type WallSegment } from "./geometry.js";
import { mergedLength, overlap1d, type BBox } from "./geometry/rect.js";
import { collinearOverlapLength, pointInPolygon, polygonEdges, VERTEX_EPS } from "./geometry/polygon.js";
import { arcAngleOffset, fullCircleArc } from "./geometry/arc.js";
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

// Room geometry and connector helpers live in `analyze/rooms.ts` and `analyze/connectors.ts` —
// leaves below the resolver, so the sheet modules can read them without a runtime import
// cycle. Re-exported here: this is the analysis surface every importer reads from.
import {
  DEFAULT_TOL,
  rectOf,
  roomBox,
  roomRing,
  roomAreaMm2,
  pointInRoomBox,
  ROOM_CONTAINMENT_SLACK_MM,
  rectInRoomBox,
  roomUses,
  isOpenAir,
  isBedroom,
  isWetRoom,
  isKitchen,
  isGarage,
  isCirculation,
  roomsAdjacent,
  pointOnRoomEdge,
  roomsAtPoint,
  doorConnections,
} from "./analyze/rooms.js";
import type { RoomBox } from "./analyze/rooms.js";
import {
  EXTERIOR_NODE,
  DEFAULT_CLEAR_ALLOWANCE_MM,
  activeLeafWidth,
  JAMB_PROBE_INSET_MM,
  faceLengthInRoom,
  connectorFaces,
  connectorFacePath,
  connectorConnection,
  windowServesRoom,
  arcWindowRoom,
} from "./analyze/connectors.js";
import type { AccessConnector, AmbiguityPolicy, FaceReading } from "./analyze/connectors.js";
export {
  DEFAULT_TOL,
  rectOf,
  roomBox,
  roomRing,
  roomAreaMm2,
  pointInRoomBox,
  ROOM_CONTAINMENT_SLACK_MM,
  rectInRoomBox,
  roomUses,
  isOpenAir,
  isBedroom,
  isWetRoom,
  isKitchen,
  isGarage,
  isCirculation,
  roomsAdjacent,
  pointOnRoomEdge,
  roomsAtPoint,
  doorConnections,
};
export type { RoomBox };
export {
  EXTERIOR_NODE,
  DEFAULT_CLEAR_ALLOWANCE_MM,
  activeLeafWidth,
  JAMB_PROBE_INSET_MM,
  faceLengthInRoom,
  connectorFaces,
  connectorFacePath,
  connectorConnection,
  windowServesRoom,
  arcWindowRoom,
};
export type { AccessConnector, AmbiguityPolicy, FaceReading };

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
 *
 * Public from the package root (ADR 0031): fields of the result are only ever added, and the
 * semantics above are the promise; underscore-prefixed IR fields are not part of it.
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
  // Capped as `compile()` caps them (EH-D8): at most MAX_DIAGNOSTICS, then one `E_DIAGNOSTIC_LIMIT`.
  const diagnostics: Diagnostic[] = capDiagnostics(
    [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])],
    source.length,
  );

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

/**
 * A room's NET internal area in mm²: its own shape less every part of it a wall's band
 * covers (`describe().rooms[].net_area_m2`, the room schedule's NET AREA column), or
 * `undefined` when it is omitted. Beside {@link roomAreaMm2}, never instead of it: the rule
 * lives in `analyze/net-area.ts`, and takes the storey's bands from `netAreaBands`.
 */
export { netAreaBands, roomNetAreaMm2 } from "./analyze/net-area.js";

/** One connector (door or cased opening) as a graph edge between two spaces. */
export interface AccessEdge {
  /**
   * Id of the door/opening element. (`doorId` kept as the historical field name.) On an edge a
   * `status demolish` wall leaves open between two rooms ({@link openRunsOf}, B3a) it is the
   * WALL's id, with `kind: "opening"`; such a wall may give several edges the same id (one per
   * pair of rooms along it), and no door or opening element has it.
   */
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
  /** The ground a connector to the outside opens onto when no one can walk on it (`water`,
   *  backlog 4.5): the edge then joins nothing, its outside end `""`. Absent otherwise. */
  onto?: OutdoorKind;
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

/** How many leaves a connector's width is shared by: 2 for a `double` or `glazed_sliding` door,
 *  else 1 ({@link activeLeafWidth}). */
export const leavesOf = (c: { kind: string; doorKind?: string }): number =>
  c.kind === "door" && (c.doorKind === "double" || c.doorKind === "glazed_sliding") ? 2 : 1;

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
  /** The storey's `outdoor` surfaces: a connector to the outside that opens onto ground no one
   *  walks on joins nothing ({@link unwalkableGroundAt}, backlog 4.5). Append-only: omitted,
   *  every connector to the outside joins the exterior, as before. */
  outdoors: readonly ROutdoor[] = [],
): AccessEdge[] {
  return connectors.map((c) => {
    const { between, ambiguous, straddles } = connectorConnection(c, roomRects, tol, policy);
    const onto = between.includes(EXTERIOR_NODE) ? unwalkableGroundAt(c, roomRects, outdoors) : undefined;
    // A door onto a pond leads nowhere a person can go: its outside end is no node at all, so the
    // edge joins nothing (the `""` end every reader already skips), and `onto` says why.
    const ends = onto ? between.map((n) => (n === EXTERIOR_NODE ? "" : n)) : between;
    const exterior = ends.includes(EXTERIOR_NODE);
    return {
      doorId: c.id,
      kind: c.kind,
      between: [ends[0] ?? "", ends[1] ?? ""] as [string, string],
      nominalWidth: c.width,
      estimatedClearWidth: connectorClearWidth(c.kind, c.width, clearAllowanceMm, leavesOf(c)),
      ...(c.host?.category !== undefined ? { hostCategory: c.host.category } : {}),
      ...(c.host?.wallId !== undefined ? { hostWallId: c.host.wallId } : {}),
      exterior,
      ambiguous,
      ...(straddles ? { straddles } : {}),
      ...(onto ? { onto } : {}),
    };
  });
}

/**
 * The ground connector `c` opens onto when no one can walk there (backlog 4.5), or `undefined`.
 * Probed one host-wall thickness off its centre on the side with no room, the probe
 * {@link doorFacesBalcony} reads (the shape, never a box). The TOPMOST surface at that point
 * decides, the last of `outdoors` (element order, which is draw order: a later surface is painted
 * over an earlier one) whose shape holds it: a pond drawn inside a lawn after it is water there,
 * and a `deck` or `paving` drawn over the water after it (a bridge, stepping stones) keeps the
 * door a way out. `outdoors` must be in element order. A connector with no host, or whose probe
 * cannot tell the outward side, is left as it was.
 */
export function unwalkableGroundAt(
  c: Pick<AccessConnector, "host" | "at">,
  roomRects: ReadonlyMap<string, RoomBox>,
  outdoors: readonly ROutdoor[],
): OutdoorKind | undefined {
  if (!c.host || !outdoors.some((o) => !groundWalkable(o.surface))) return undefined;
  const { plus, minus } = wallFaceProbes(c.host, c.at, Math.max(c.host.thickness, 1));
  const boxes = [...roomRects.values()];
  const onPlus = boxes.some((b) => pointInRoomBox(plus, b));
  const onMinus = boxes.some((b) => pointInRoomBox(minus, b));
  if (onPlus === onMinus) return undefined;
  const p = onPlus ? minus : plus;
  let top: ROutdoor | undefined;
  for (let i = outdoors.length - 1; i >= 0 && !top; i--)
    if (pointInPolygon(p.x, p.y, outdoorRing(outdoors[i]!))) top = outdoors[i];
  return top && !groundWalkable(top.surface) ? top.surface : undefined;
}

/** The `outdoor` surfaces of one resolved storey, for {@link connectorEdges}. */
export const outdoorsOf = (ir: ResolvedPlan): ROutdoor[] =>
  ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");

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
  openRuns: readonly AccessConnector[] = [],
  /** The storey's `outdoor` surfaces ({@link outdoorsOf}): a door onto water joins nothing
   *  (backlog 4.5). Append-only. */
  outdoors: readonly ROutdoor[] = [],
): AccessGraph {
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  // Doors and cased openings are both connectors, doors first; then the runs a demolished wall
  // leaves open ({@link openRunsOf}, B3a), last, so a plan without one has the edges it had.
  const edges = connectorEdges(
    roomRects,
    [...doors, ...openings, ...openRuns],
    tol,
    clearAllowanceMm,
    "probe",
    outdoors,
  );
  return accessGraphOf(
    rooms.map((r) => r.id),
    edges,
  );
}

/**
 * The runs a `status demolish` wall leaves open between two rooms (preview-and-remodel B3a), as
 * connectors of kind `opening` named by the wall's id: where the wall stood, the two rooms are one
 * space, so the access graph, the circulation walk and the reachability rules join them there.
 *
 * Each straight segment of a demolished wall is cut at every room vertex that lies within the
 * wall's half thickness (plus `tol`) of its centreline, so each piece faces at most one room on
 * each side; a piece is kept only when it joins two rooms, unambiguously and straddling none
 * (`connectorConnection`, the `probe` policy every access graph uses). A piece with the outside
 * on one face is not kept: a demolished facade is not an entrance (the access graph's entrances
 * are doors and openings). A curved segment opens nothing. Empty for a plan with no demolished
 * wall, so every access graph of such a plan is the one it always was.
 */
export function openRunsOf(ir: ResolvedPlan, tol: number): AccessConnector[] {
  const demolished = (ir.drawn?.walls ?? []).filter((w) => w.status === "demolish");
  if (demolished.length === 0) return [];
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  const out: AccessConnector[] = [];
  for (const w of demolished) {
    for (const seg of segmentsOfWall(w)) {
      if (seg.arc) continue;
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const len2 = dx * dx + dy * dy;
      if (!(len2 > 0)) continue;
      const len = Math.sqrt(len2);
      const reach = seg.thickness / 2 + tol;
      const cuts = new Set<number>([0, 1]);
      for (const box of roomRects.values()) {
        for (const v of roomRing(box)) {
          const t = ((v.x - seg.a.x) * dx + (v.y - seg.a.y) * dy) / len2;
          if (!(t > 0 && t < 1)) continue;
          const off = Math.abs((v.x - seg.a.x) * dy - (v.y - seg.a.y) * dx) / len;
          if (off <= reach) cuts.add(t);
        }
      }
      const ts = [...cuts].sort((p, q) => p - q);
      for (let k = 0; k + 1 < ts.length; k++) {
        const width = (ts[k + 1]! - ts[k]!) * len;
        if (!(width >= 1)) continue;
        const tm = (ts[k]! + ts[k + 1]!) / 2;
        const c: AccessConnector = {
          id: w.id,
          at: { x: seg.a.x + dx * tm, y: seg.a.y + dy * tm },
          width,
          host: { a: seg.a, b: seg.b, thickness: seg.thickness, category: w.category, wallId: w.id },
          kind: "opening",
        };
        const { between, ambiguous, straddles } = connectorConnection(c, roomRects, tol, "probe");
        if (ambiguous || straddles || between.length !== 2 || between.includes(EXTERIOR_NODE)) continue;
        if (between[0] === between[1]) continue;
        out.push(c);
      }
    }
  }
  return out;
}

/**
 * A room a stair or lift delivers a person into on a storey with no door from the ground
 * (`VerticalReach.arrivalRooms`, PS0.3), and the clear width they arrive by: the flight's width
 * across the edge they step off at, as the circulation model seeds that landing (`runWidth`,
 * `src/analyze/nav-grid.ts`), or `null` when no arriving run lands in the room (it is still a
 * place a person arrives, so it is a source of reach and depth, but it seeds no width).
 */
export type ShaftArrivalSeed = readonly [roomId: string, clearWidthMm: number | null];

/**
 * The {@link AccessGraph} over given connector edges: its entrances, and each room's depth,
 * reachability and bottleneck from {@link EXTERIOR_NODE}. {@link buildDoorAccessGraph} is this
 * over every connector of the storey; the walk's graph (`walkAccessGraph`,
 * `src/analyze/entrance.ts`) is this over the edges it keeps.
 *
 * With `arrivals` (non-empty; PS0.3), the storey is one a shaft reaches and no door from the
 * ground does: the rooms the shafts land in are where a person arrives, each at depth 1 (it is
 * entered straight from the arriving run, as a room behind a front door is) and at the run's
 * width, and the exterior is NOT a source. Its exterior connectors (doors onto a balcony) stay
 * walkable THROUGH, so a room reached by stepping out of one room onto the balcony and in by
 * another door is reached, as {@link reachFrom}'s `exterior: false` reads it. `edges` and
 * `entrances` are the same either way: they are the storey's doors, whatever is reached by them.
 * Without `arrivals` this is exactly the graph it always was.
 */
export function accessGraphOf(
  roomIds: readonly string[],
  edges: AccessEdge[],
  arrivals: readonly ShaftArrivalSeed[] = [],
): AccessGraph {
  const g = accessDigraph(roomIds, edges);
  const entrances: string[] = [];
  for (const e of edges) {
    const [a, b] = e.between;
    if (joins(e) && e.exterior && (a === EXTERIOR_NODE) !== (b === EXTERIOR_NODE)) entrances.push(e.doorId);
  }

  const viaShaft = arrivals.length > 0;
  // Door hops from the exterior (1 = a room opening directly outside), or from the rooms the
  // shafts land in (1 = the arrival room) on a storey a shaft reaches.
  const depthSources: Array<readonly [string, number]> = viaShaft
    ? arrivals.map(([id]) => [id, 1] as const)
    : [[EXTERIOR_NODE, 0]];
  const depth = bestPaths(g, { s: MIN_PLUS, weight: () => 1, sources: depthSources, rank: () => 0 }).value;
  // Widest path: the max over paths of the min clear width.
  const order = [EXTERIOR_NODE, ...roomIds];
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const widthSources: Array<readonly [string, number]> = viaShaft
    ? arrivals.flatMap(([id, w]) => (w === null ? [] : [[id, w] as const]))
    : [[EXTERIOR_NODE, Infinity]];
  const best = bestPaths(g, {
    s: MAX_MIN,
    weight: (e) => e.estimatedClearWidth,
    sources: widthSources,
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
  return balconies.some((b) => pointInPolygon(outward.x, outward.y, outdoorRing(b)));
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
  const graph = buildDoorAccessGraph(rooms, doors, tol, undefined, openings, openRunsOf(ir, tol), outdoors);
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
    connectorEdges(roomRects, [...doors, ...openings], tol, DEFAULT_CLEAR_ALLOWANCE_MM, "probe", outdoorsOf(ir)),
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
