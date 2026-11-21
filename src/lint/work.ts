/**
 * Work counters for one `lint()` run: how many geometric tests the costliest rules made, as
 * COUNTS (engineering-health EH2.10). They are an out-parameter on the per-run
 * {@link import("./context.js").LintContext}, never module state, so `lint()` stays pure and its
 * output never reads them; `lintWork()` (`src/lint.ts`) returns them for the pinned work-count
 * table (`test/tables/work-counts.json`), so a rule that slips back to rescanning every element
 * turns that table red. Budgets are counts, never time.
 */

/** The counters, one field per measured kind of work; every field starts at 0. */
export interface LintWork {
  /**
   * `W_LEAF_ACROSS_DOORWAY`: the (leaf, door) pairs the rule measured, each a swing-collision
   * test and, unless the swings collide, a clip of the leaf against the door's approach.
   */
  leafDoorPairs: number;
  /**
   * `W_BOUNDARY_NO_WALL`: the elements measured against a run two rooms share, summed over the
   * runs: straight wall segments, doors, cased openings and open runs, and closing counters.
   */
  boundaryRunTests: number;
  /**
   * Every circulation nav grid the run built (`buildNav`, `src/analyze/nav-grid.ts`), as cells:
   * the walk model `W_PATH_TOO_NARROW` and `W_CIRCUITOUS_PATH` share, its furniture-free control
   * and ladder when a room is sealed, and the door-attribution re-measures.
   */
  navCells: number;
  /**
   * `W_TABLE_NO_SEAT`: the (room, piece) footprint-centre tests the rule made, once per room of a
   * storey that has a table it reads, never once per table (product roadmap RM9.6).
   */
  tableSeatTests: number;
  /**
   * `W_SEAT_FACING_WALL` (product roadmap RM9.6), the sum of three counts:
   *  - one per wall segment of the storey (arcs included, which it then skips) for each drawn
   *    front of a lounge seat it tests (an L-sofa's second front only when its first is clear of
   *    every wall);
   *  - one per door or cased-opening cut on a segment's line, for each segment that reaches a
   *    front (the cuts taken out of that wall before the half-coverage test);
   *  - one per room of the storey for each seat it reports (the room its message names is
   *    looked up there).
   * The storey's cuts themselves are read once per run that has a lounge seat, one pass over
   * its elements, which no counter charges.
   */
  seatWallTests: number;
}

/** A fresh set of counters, all 0. */
export function newLintWork(): LintWork {
  return { leafDoorPairs: 0, boundaryRunTests: 0, navCells: 0, tableSeatTests: 0, seatWallTests: 0 };
}
