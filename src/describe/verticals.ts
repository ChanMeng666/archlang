/**
 * The vertical facts of `describe()`: what only a block stair reports (its flights, landings
 * and turn) and the building-level vertical report of a multi-storey plan (moved verbatim from
 * `src/describe.ts`).
 *
 * Invariant: the report asks the predicates `lint` asks (`storeyGrounded`, `buildingRoomReach`),
 * never a second copy of them. It charges nothing to the step meter.
 */

import type { ResolvedLevel } from "../ir.js";
import { rectOf, storeyGrounded, buildingRoomReach } from "../analyze.js";
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
    fromBelow: levelsEnteredFromBelow(connections, (n) => {
      const l = levels.find((x) => x.level === n);
      return l ? storeyHasEntranceCandidate(l.ir, tol) : false;
    }),
  };
}
