/**
 * The vertical facts of `describe()`: what only a block stair reports (its flights, landings
 * and turn) and the building-level vertical report of a multi-storey plan (moved verbatim from
 * `src/describe.ts`).
 *
 * Invariant: the report asks the predicates `lint` asks (`storeyGrounded`, `buildingRoomReach`),
 * never a second copy of them. It charges nothing to the step meter.
 */

import type { ResolvedLevel, RRoom } from "../ir.js";
import { rectOf, storeyGrounded, buildingRoomReach, type ShaftArrivalSeed } from "../analyze.js";
import { landedOn, runWidth } from "../analyze/nav-grid.js";
import { storeyHasEntranceCandidate } from "../analyze/entrance.js";
import {
  type ArrivingRun,
  arrivalRuns,
  flightRun,
  flightsOf,
  levelsEnteredFromBelow,
  type RBlockStair,
  roomToward,
  stairTurns,
  tailEdge,
  type VerticalConnection,
  verticalConnections,
  verticalReach,
} from "../vertical.js";
import type { VerticalSummary, VerticalReport } from "./types.js";

/** Spreadable instance stamp for a resolved element — nothing at all at plan level. */
/** What only a block stair reports (`VerticalSummary`): the pieces its `bbox` cannot say. */
export function blockStairFacts(v: RBlockStair): Pick<VerticalSummary, "flights" | "landings" | "turn"> {
  const turns = stairTurns(v);
  return {
    flights: flightsOf(v).map((f) => ({ bbox: rectOf(f), run_mm: flightRun(f), entry: tailEdge(f) })),
    landings: v.landings.map((l, i) =>
      l.winders === undefined
        ? { bbox: rectOf(l), turn: turns.landings[i]! }
        : { bbox: rectOf(l), turn: turns.landings[i]!, winders: l.winders },
    ),
    turn: turns.whole,
  };
}

/**
 * The building-level vertical report for a multi-storey plan, or `undefined` when no run
 * spans two storeys. A storey is *grounded* when it has its own exterior entrance that is
 * a real arrival point — {@link storeyGrounded}, the same predicate `lint` builds its
 * `grounded()` callback from, discounting a door that opens onto an `outdoor balcony`.
 * Reachability then spreads along the shafts — room-aware: a shaft carries you on only
 * from a stop whose room is walkable on its storey ({@link buildingRoomReach}, the same
 * probe access graph `access` reports), so a stair in a door-less store reaches nothing.
 * This is deliberately NOT the same thing as this storey's own `access.hasEntrance`
 * below, which stays the honest, undiscounted fact that the floor has an exterior door.
 */
export function buildVerticalReport(
  levels: readonly ResolvedLevel[],
  tol: number,
):
  | {
      report: VerticalReport;
      arrivals: ReadonlyMap<number, readonly ArrivingRun[]>;
      /** Per storey with no door from the ground, the rooms a shaft delivers a person into
       *  (`VerticalReach.arrivalRooms`): the sources `lint`'s reachability rule adds there. */
      arrivalRooms: ReadonlyMap<number, readonly string[]>;
      /** Per storey, the arrival rooms `describe().access` counts that storey from: those a shaft
       *  with an arriving run there stops in ({@link arrivalSeedRoomsOf}). */
      arrivalSeedRooms: ReadonlyMap<number, readonly string[]>;
      fromBelow: ReadonlySet<number>;
    }
  | undefined {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  if (connections.length === 0) return undefined;
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyGrounded(l.ir, tol) : false;
  };
  const roomReach = buildingRoomReach(inputs, tol);
  const reach = verticalReach(inputs, grounded, roomReach);
  const arrivals = arrivalRuns(inputs, grounded, roomReach);
  return {
    report: { connections, reachable_levels: [...reach.reachable].sort((a, b) => a - b) },
    arrivals,
    arrivalRooms: reach.arrivalRooms,
    arrivalSeedRooms: arrivalSeedRoomsOf(connections, arrivals, reach.arrivalRooms),
    fromBelow: levelsEnteredFromBelow(connections, (n) => {
      const l = levels.find((x) => x.level === n);
      return l ? storeyHasEntranceCandidate(l.ir, tol) : false;
    }),
  };
}

/**
 * Per storey, the rooms `describe().access` counts a shaft-reached storey from (PS0.3): the
 * `arrivalRooms` (the sources `lint`'s reachability rule adds) that a shaft with an ARRIVING run
 * on that storey (`arrivalRuns`) stops in, at either end (`roomToward` each side, and the stop's
 * own room). It is filtered by shaft, not by the room a run is stepped off in, because a block
 * stair arrived on from both sides names only one end's room as its landing (`arrivalOn`) while a
 * person steps off in both. A room that only holds a shaft BOARDED on that storey (a stair on up to
 * a floor reached only through it, so no arriving run) is left out: it is counted through its doors.
 * In `arrivalRooms` order; a storey with none is absent.
 */
function arrivalSeedRoomsOf(
  connections: readonly VerticalConnection[],
  arrivals: ReadonlyMap<number, readonly ArrivingRun[]>,
  arrivalRooms: ReadonlyMap<number, readonly string[]>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const [level, list] of arrivalRooms) {
    const arriving = new Set((arrivals.get(level) ?? []).map((a) => a.run.id));
    const stopRooms = new Set<string>();
    for (const c of connections) {
      if (!arriving.has(c.id)) continue;
      const stop = c.stops[c.levels.indexOf(level)];
      if (!stop) continue;
      for (const room of [stop.room, roomToward(stop, "below"), roomToward(stop, "above")])
        if (room !== null) stopRooms.add(room);
    }
    const kept = list.filter((id) => stopRooms.has(id));
    if (kept.length > 0) out.set(level, kept);
  }
  return out;
}

/**
 * Where `describe().access` counts a shaft-reached storey's rooms from (PS0.3): each room of
 * `seedRooms` (`arrivalSeedRooms`, above), with the width a person arrives by: the widest arriving
 * run landing in the room, measured as the circulation model seeds its landing (`runWidth` across
 * the edge stepped off, `landedOn`), or `null` when no arriving run's landing is that room (the far
 * end of a block stair arrived on from both sides: a source of reach and depth, but of no width).
 * Empty when the storey has no such room, so the access graph is then the one it always was.
 */
export function shaftArrivalSeeds(
  seedRooms: readonly string[],
  arrivals: readonly ArrivingRun[],
  rooms: readonly RRoom[],
): ShaftArrivalSeed[] {
  const known = new Set(rooms.map((r) => r.id));
  const ids = seedRooms.filter((id) => known.has(id));
  if (ids.length === 0) return [];
  const widths = new Map<string, number>();
  for (const a of landedOn(arrivals, rooms)) {
    const w = runWidth(a.flight, a.edges[0]!);
    if (w > (widths.get(a.roomId) ?? Number.NEGATIVE_INFINITY)) widths.set(a.roomId, w);
  }
  return ids.map((id) => [id, widths.get(id) ?? null] as const);
}
