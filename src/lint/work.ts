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
}

/** A fresh set of counters, all 0. */
export function newLintWork(): LintWork {
  return { leafDoorPairs: 0, boundaryRunTests: 0, navCells: 0 };
}
