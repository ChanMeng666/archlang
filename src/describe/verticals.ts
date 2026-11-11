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
  stairTurns,
  tailEdge,
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
  return {
    report: { connections, reachable_levels: [...reach.reachable].sort((a, b) => a - b) },
    arrivals: arrivalRuns(inputs, grounded, roomReach),
    arrivalRooms: reach.arrivalRooms,
    fromBelow: levelsEnteredFromBelow(connections, (n) => {
      const l = levels.find((x) => x.level === n);
      return l ? storeyHasEntranceCandidate(l.ir, tol) : false;
    }),
  };
}

/**
 * Where `describe().access` counts a shaft-reached storey's rooms from (PS0.3): each room an
 * ARRIVING run lands in (`landedOn(arrivals)`, the runs `computeCirculation` walks the storey
 * from), with the width a person arrives by: the widest such run, measured as the circulation
 * model seeds its landing (`runWidth` across the edge stepped off). Only rooms that are also among
 * `arrivalRooms` (the sources `lint`'s reachability rule adds) are kept, in that order. A room
 * that only holds a flight BOARDED on this storey (a stair on up to a floor reached only through
 * this one) is in `arrivalRooms` but is no arrival: nobody steps off into it, so it is counted
 * through the doors from the rooms a person does arrive in. Empty when no arriving run lands in
 * an arrival room, so the access graph is then the one it always was.
 */
export function shaftArrivalSeeds(
  arrivalRooms: readonly string[],
  arrivals: readonly ArrivingRun[],
  rooms: readonly RRoom[],
): ShaftArrivalSeed[] {
  if (arrivalRooms.length === 0) return [];
  const sources = new Set(arrivalRooms);
  const widths = new Map<string, number>();
  for (const a of landedOn(arrivals, rooms)) {
    if (!sources.has(a.roomId)) continue;
    const w = runWidth(a.flight, a.edges[0]!);
    if (w > (widths.get(a.roomId) ?? Number.NEGATIVE_INFINITY)) widths.set(a.roomId, w);
  }
  return arrivalRooms.filter((id) => widths.has(id)).map((id) => [id, widths.get(id)!] as const);
}
