/**
 * A storey's ways in from outside, and its MAIN entrance (plan-soundness PS0.10).
 *
 * Reachability and the circulation walk start from every exterior connector at once, so a
 * patio or balcony door used to hide a route blocked from the front door: on the first-contact
 * audit's townhouse a sofa across the hall-to-living opening left Living and the kitchen
 * reachable only through the garden, and lint was silent until the patio door was turned into a
 * window (`docs/plans/plan-soundness/audits/2026-10-18-first-contact.md` T2; A2 is the same mask
 * through a balcony door). This module names the front door as a fact, and says which ways in a
 * walk is judged from. It is the one place a storey's ways in are classified: the circulation
 * rules and the privacy rules (`src/lint/rules/privacy.ts`) both read it.
 *
 * **The choice, and when it is refused** (ADR 0005: report the ambiguity, never guess; a
 * deterministic bad heuristic is still an arranger, so WIDTH never decides: a wider back or
 * delivery door is not a front door). The candidates are the storey's exterior DOORS (a leaf: a
 * cased opening is not a front door) that are not a `garage` door and do not open onto an
 * `outdoor balcony` ({@link doorFacesBalcony}), and (step 0) do not open into a private room, a
 * bedroom, bath or WC with no living, dining, kitchen or entrance use beside it: a front door
 * never does (`W_ENTRANCE_INTO_PRIVATE`), while a studio's `uses living bedroom` keeps its door.
 * Each step must single out exactly one door, or the next step is asked:
 *  1. The one door into an entrance space, a room whose uses ({@link roomUses}) include entry,
 *     hall or circulation and no service use (`entry-room`), but ONLY when every other candidate
 *     opens into a service room (utility, storage, garage). A back hall or mud room does not
 *     outrank a door straight into the living room, the kitchen or an unclassified room. Any
 *     leaf counts here, a sliding entry door included: the room says it is the way in.
 *  2. With `site`, the one HINGED candidate, not into a service room, whose wall faces
 *     `site.street`: the outward side of the host wall, probed one wall thickness off each face
 *     (the side whose probe is on no room's floor), turned by `north` (`street`). A slider on
 *     the street is a shop front or a patio door as often as a front door, so it is never chosen
 *     here; a street door into a utility, store or garage is a service door, and when the street
 *     side has only such doors the choice is refused (`tie`). A wall at 45° to the compass faces
 *     no single side, so a door on it is never the street door.
 *  3. One candidate left: it is the only door from the ground (`sole`).
 *  4. Otherwise refused: `tie` (the candidates are listed), or `no-candidate`.
 * A storey a shaft arrives on from a storey below that has a candidate of its own names none
 * (`upper-storey`): which of its exterior doors is a way in at all is PS0.3's question. A
 * basement with no door from the ground does not demote the floor above it; a walk-out basement
 * does. A refusal keeps every way in, exactly as before, and
 * the fact still says why.
 *
 * **The ways a walk keeps** ({@link walkWays}): the main entrance; every `garage` door (a
 * vehicle entrance by its authored kind: whoever arrives by car starts there); and every other
 * exterior connector whose room the doors do NOT connect to the main entrance without going
 * outside (a store reached only by its own door keeps that door). A living room reached from
 * the hall loses its patio or balcony door as a way in, so its walk is measured from the front
 * door. Which rooms the door graph reaches is unchanged by construction (every room reached
 * from any entrance is reached from the ways kept), so `W_ROOM_UNREACHABLE` cannot move; only
 * the walk can.
 */

import { bestPaths } from "../algebra/paths.js";
import { MIN_PLUS } from "../algebra/semiring.js";
import { northQuarterTurns } from "../algebra/d4.js";
import {
  accessDigraph,
  type AccessEdge,
  type AccessGraph,
  accessGraphOf,
  type AccessRoomNode,
  buildDoorAccessGraph,
  doorFacesBalcony,
  EXTERIOR_NODE,
  type MainEntranceFact,
  pointInRoomBox,
  type RoomBox,
  roomBox,
  roomUses,
} from "../analyze.js";
import type { UseKind } from "../ast.js";
import { wallFaceProbes } from "../geometry.js";
import type { RDoor, ROpening, ROutdoor, RRoom, ResolvedPlan } from "../ir.js";
import { type CompassLetter, deriveSite, toCompass } from "../site.js";
import { openRunsOf } from "../analyze.js";

/** What this module reads off one storey. */
export interface EntranceInputs {
  rooms: readonly RRoom[];
  doors: readonly RDoor[];
  openings: readonly ROpening[];
  outdoors: readonly ROutdoor[];
  roomRects: ReadonlyMap<string, RoomBox>;
  site: ResolvedPlan["site"];
  north: ResolvedPlan["north"];
  /** A shaft arrives on this storey from a storey below (`levelsEnteredFromBelow`): it names
   *  no main entrance (basis `upper-storey`), and its walk keeps every way in. */
  upperStorey?: boolean;
}

/** The {@link EntranceInputs} of a resolved storey. */
export function entranceInputs(
  ir: ResolvedPlan,
  roomRects: ReadonlyMap<string, RoomBox>,
  upperStorey = false,
): EntranceInputs {
  return {
    rooms: ir.elements.filter((e): e is RRoom => e.kind === "room"),
    doors: ir.elements.filter((e): e is RDoor => e.kind === "door"),
    openings: ir.elements.filter((e): e is ROpening => e.kind === "opening"),
    outdoors: ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
    roomRects,
    site: ir.site,
    north: ir.north,
    ...(upperStorey ? { upperStorey } : {}),
  };
}

/** One way in from outside: an entrance edge of the access graph. */
export interface EntranceWay {
  doorId: string;
  /** The room it opens into. */
  room: string;
  kind: AccessEdge["kind"];
  /** It opens onto an `outdoor balcony`, not the ground ({@link doorFacesBalcony}). */
  balcony: boolean;
}

/** Every entrance edge of `graph`, in edge order, with the room it opens into. */
export function entranceWays(graph: AccessGraph, inp: EntranceInputs): EntranceWay[] {
  const balconies = inp.outdoors.filter((o) => o.surface === "balcony");
  const connectors = new Map<string, RDoor | ROpening>([...inp.doors, ...inp.openings].map((c) => [c.id, c]));
  const ids = new Set(graph.entrances);
  const out: EntranceWay[] = [];
  for (const e of graph.edges) {
    if (!ids.has(e.doorId)) continue;
    const room = e.between[0] === EXTERIOR_NODE ? e.between[1] : e.between[0];
    const c = connectors.get(e.doorId);
    out.push({ doorId: e.doorId, room, kind: e.kind, balcony: c ? doorFacesBalcony(c, inp.rooms, balconies) : false });
  }
  return out;
}

/** The compass side a door's wall faces outward, from the shape, or `null` when both faces or
 *  neither are on a room's floor. */
function doorFacing(d: RDoor, roomRects: ReadonlyMap<string, RoomBox>, turns: 0 | 1 | 2 | 3): CompassLetter | null {
  if (!d.host) return null;
  const { n, plus, minus } = wallFaceProbes(d.host, d.at, Math.max(d.host.thickness, 1));
  const on = (p: { x: number; y: number }): boolean => {
    for (const b of roomRects.values()) if (pointInRoomBox(p, b)) return true;
    return false;
  };
  const onPlus = on(plus);
  if (onPlus === on(minus)) return null;
  // Outward is the side with no floor on it.
  const ox = (onPlus ? -1 : 1) * n.x;
  const oy = (onPlus ? -1 : 1) * n.y;
  // A wall at 45° to the compass faces two sides equally: no single side, so it is never the
  // street door on its own (a tie broken toward N/S would flip under a quarter turn).
  if (Math.abs(Math.abs(ox) - Math.abs(oy)) <= DIAGONAL_TOL) return null;
  const page: CompassLetter = Math.abs(oy) >= Math.abs(ox) ? (oy < 0 ? "N" : "S") : ox < 0 ? "W" : "E";
  return toCompass(page, turns);
}

/** How near |x| and |y| of a unit outward normal may be for the wall to read as diagonal. */
const DIAGONAL_TOL = 1e-6;

/** A door with a hinged leaf: the default kind, `hinged` written out, or a `double` door's pair. */
const hinged = (d: RDoor): boolean => d.doorKind === undefined || d.doorKind === "hinged" || d.doorKind === "double";

/** Uses that make a room an entrance space: a hall, an entry or circulation. */
const ENTRY_USES: ReadonlySet<UseKind> = new Set<UseKind>(["entry", "hall", "circulation"]);
/** Uses a front door never opens into (`W_ENTRANCE_INTO_PRIVATE`): such a door is no candidate. */
const PRIVATE_USES: ReadonlySet<UseKind> = new Set<UseKind>(["bedroom", "bath", "wc"]);
/** Uses that keep a room public even when it is also slept or washed in: a studio's
 *  `uses living bedroom` is still where its front door opens. */
const PUBLIC_USES: ReadonlySet<UseKind> = new Set<UseKind>([
  "living",
  "dining",
  "kitchen",
  "entry",
  "hall",
  "circulation",
]);
/** Uses of a service room: a door into one does not compete with a door into the hall. */
const SERVICE_USES: ReadonlySet<UseKind> = new Set<UseKind>(["utility", "storage", "garage"]);

/** Does the room read as an entrance space ({@link roomUses}): an entry, hall or circulation
 *  use, and no service use beside it? */
function isEntryRoom(r: RRoom | undefined): boolean {
  if (!r) return false;
  const uses = [...roomUses(r)];
  return uses.some((u) => ENTRY_USES.has(u)) && !uses.some((u) => SERVICE_USES.has(u));
}

/** Is the room a service room: classified, and every use a service one? */
function isServiceRoom(r: RRoom | undefined): boolean {
  if (!r) return false;
  const uses = [...roomUses(r)];
  return uses.length > 0 && uses.every((u) => SERVICE_USES.has(u));
}

/**
 * The candidates for the main entrance, in edge order: the doors from the ground with a leaf,
 * not a `garage` door, not onto an `outdoor balcony`, and (0) not into a private room (a
 * bedroom, bath or WC with no living, dining, kitchen or entrance use beside it).
 */
export function entranceCandidates(graph: AccessGraph, inp: EntranceInputs): Array<{ door: RDoor; room: string }> {
  const doors = new Map(inp.doors.map((d) => [d.id, d]));
  const rooms = new Map(inp.rooms.map((r) => [r.id, r]));
  const cands: Array<{ door: RDoor; room: string }> = [];
  for (const w of entranceWays(graph, inp)) {
    const d = doors.get(w.doorId);
    if (w.kind !== "door" || !d || d.doorKind === "garage" || w.balcony) continue;
    const r = rooms.get(w.room);
    if (r && isPrivateRoom(r)) continue;
    cands.push({ door: d, room: w.room });
  }
  return cands;
}

/** A room a front door never opens into (`W_ENTRANCE_INTO_PRIVATE`): a bedroom, bath or WC use
 *  and no public use beside it. */
function isPrivateRoom(r: RRoom): boolean {
  const uses = [...roomUses(r)];
  return uses.some((u) => PRIVATE_USES.has(u)) && !uses.some((u) => PUBLIC_USES.has(u));
}

/**
 * Does storey `ir` have a door from the ground that could be its main entrance
 * ({@link entranceCandidates})? A storey a stair arrives on from one that does is an upper
 * storey (`levelsEnteredFromBelow`); a basement with no such door does not demote the floor
 * above it.
 */
export function storeyHasEntranceCandidate(ir: ResolvedPlan, tolMm: number): boolean {
  const inp = entranceInputs(
    ir,
    new Map(ir.elements.filter((e): e is RRoom => e.kind === "room").map((r) => [r.id, roomBox(r)])),
  );
  const graph = buildDoorAccessGraph(
    [...inp.rooms],
    [...inp.doors],
    tolMm,
    undefined,
    [...inp.openings],
    openRunsOf(ir, tolMm),
  );
  return entranceCandidates(graph, inp).length > 0;
}

/**
 * The storey's main entrance ({@link MainEntranceFact}; the rule is this module's header), or
 * `null` on a storey with one entrance or none: there is nothing to choose, and no fact.
 * Width never decides: a wider back or delivery door is not a front door.
 */
export function mainEntranceOf(graph: AccessGraph, inp: EntranceInputs): MainEntranceFact | null {
  if (graph.entrances.length <= 1) return null;
  // PS0.3: an upper storey's exterior doors open onto decks and terraces; which of them is a
  // way in at all is that card's question, so the fact is not asked here.
  if (inp.upperStorey === true) return { door: null, basis: "upper-storey", candidates: [] };
  const rooms = new Map(inp.rooms.map((r) => [r.id, r]));
  const cands = entranceCandidates(graph, inp);
  const ids = (cs: readonly { door: RDoor }[]): string[] => cs.map((c) => c.door.id);
  if (cands.length === 0) return { door: null, basis: "no-candidate", candidates: [] };
  // (a) The door into an entrance space, when every other one opens into a service room: a hall
  // does not outrank a door straight into the living room, the kitchen or an unclassified room.
  const entry = cands.filter((c) => isEntryRoom(rooms.get(c.room)));
  if (entry.length === 1 && cands.every((c) => c === entry[0] || isServiceRoom(rooms.get(c.room))))
    return { door: entry[0]!.door.id, basis: "entry-room", candidates: ids(entry) };
  // (b) The one hinged door on the street side.
  if (inp.site) {
    const turns = northQuarterTurns(inp.north);
    const street = deriveSite(inp.site).street;
    const facing = cands.filter((c) => hinged(c.door) && doorFacing(c.door, inp.roomRects, turns) === street);
    // A street door into a utility, store or garage is a service door, not the front door.
    const onStreet = facing.filter((c) => !isServiceRoom(rooms.get(c.room)));
    if (onStreet.length === 1) return { door: onStreet[0]!.door.id, basis: "street", candidates: ids(onStreet) };
    // The street side holds service doors only: which of the others is the front is not said.
    if (onStreet.length === 0 && facing.length > 0 && cands.length > 1)
      return { door: null, basis: "tie", candidates: ids(cands) };
  }
  // (c) The only door from the ground there is: nothing is chosen.
  if (cands.length === 1) return { door: cands[0]!.door.id, basis: "sole", candidates: ids(cands) };
  // (d) Nothing singles one door out.
  return { door: null, basis: "tie", candidates: ids(cands) };
}

/** Door hops from the entrance `door` (its room is 1) without going outside, per room. */
export function depthFromDoor(graph: AccessGraph, door: string): ReadonlyMap<string, number> {
  const e = graph.edges.find((x) => x.doorId === door);
  const room = e ? (e.between[0] === EXTERIOR_NODE ? e.between[1] : e.between[0]) : undefined;
  if (room === undefined || room === "") return new Map();
  const g = accessDigraph(
    graph.rooms.map((r) => r.id),
    graph.edges,
  );
  return bestPaths(g, {
    s: MIN_PLUS,
    weight: () => 1,
    sources: [[room, 1]],
    admit: (n: string) => n !== EXTERIOR_NODE,
    rank: () => 0,
  }).value;
}

/**
 * `describe().access` with the main-entrance facts appended: `mainEntrance`, and, when it names
 * a door, `depthFromMainEntrance` on every room. `graph` itself (the same object, so the same
 * bytes) on a storey with one entrance or none.
 */
export function withMainEntrance(graph: AccessGraph, inp: EntranceInputs): AccessGraph {
  const fact = mainEntranceOf(graph, inp);
  if (fact === null) return graph;
  if (fact.door === null) return { ...graph, mainEntrance: fact };
  const depth = depthFromDoor(graph, fact.door);
  const rooms: AccessRoomNode[] = graph.rooms.map((r) => ({ ...r, depthFromMainEntrance: depth.get(r.id) ?? null }));
  return { ...graph, rooms, mainEntrance: fact };
}

/**
 * The ways in a walk is judged from (this module's header): the main entrance and every other
 * entrance whose room the main entrance does not reach without going outside. `null` — every
 * way in — when no main entrance is named.
 */
export function walkWays(
  graph: AccessGraph,
  inp: EntranceInputs,
  fact: MainEntranceFact | null = mainEntranceOf(graph, inp),
): ReadonlySet<string> | null {
  if (fact === null || fact.door === null) return null;
  const depth = depthFromDoor(graph, fact.door);
  const garage = new Set(inp.doors.filter((d) => d.doorKind === "garage").map((d) => d.id));
  const keep = new Set<string>();
  for (const w of entranceWays(graph, inp))
    if (w.doorId === fact.door || garage.has(w.doorId) || !depth.has(w.room)) keep.add(w.doorId);
  return keep;
}

/**
 * `graph` with only the entrance edges `keep` names: the access graph a walk is judged on.
 * Every other edge stays, so the rooms it reaches are `graph`'s whenever `keep` is
 * {@link walkWays}' answer. `graph` itself when `keep` is `null`.
 */
export function walkAccessGraph(graph: AccessGraph, keep: ReadonlySet<string> | null): AccessGraph {
  if (keep === null) return graph;
  const entrances = new Set(graph.entrances);
  return accessGraphOf(
    graph.rooms.map((r) => r.id),
    graph.edges.filter((e) => !entrances.has(e.doorId) || keep.has(e.doorId)),
  );
}
