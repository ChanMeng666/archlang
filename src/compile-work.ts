/**
 * Work counters for one `compile()` drawing: how many geometric tests the costliest drawing
 * loops made, as COUNTS (engineering-health EH2.14). The compile-side sibling of `LintWork`
 * (`src/lint/work.ts`): an out-parameter handed down the one drawing call (`compileUncached` →
 * `drawScene` → `lowerWallSet` → `joinWalls`, and → `relocateLabels`), never module state, so
 * `compile()` stays pure and its output never reads them. `compileWork()` (`src/pipeline.ts`)
 * returns them for the pinned work-count table (`test/tables/work-counts.json`), so a joinery or
 * label-placement loop that slips back to testing every pair turns that table red. Budgets are
 * counts, never time.
 *
 * Neither loop charges the evaluation step meter: it is drawing work, done after the resolution
 * that the meter bounds has finished, and the drawing budget (`src/draw-budget.ts`) bounds it.
 */

/** The counters, one field per measured kind of work; every field starts at 0. */
export interface CompileWork {
  /**
   * The joinery's split phase (`splitAll`, `src/geometry/joinery.ts`): the (edge, edge) candidate
   * pairs the grid index handed it, each a box test and, when the boxes meet, an intersection.
   * A pair is counted once, unordered: after the scan's `j <= i` filter and its stamp dedupe, so
   * the count does not depend on the order the index visits cells in and is deterministic. An
   * edge met again in another shared cell without a new pair is invisible to it. Summed over
   * every wall set the drawing joins (standing walls and demolished walls).
   */
  joinerySplitTests: number;
  /**
   * Label relocation (`relocateLabels`, `src/label-placement.ts`): the places scored for a label
   * whose text box collides: the incumbent anchor, and every lattice point on the label's floor
   * that passes the off-floor filter.
   * A plan whose labels are clear scores none.
   */
  labelRelocations: number;
}

/** A fresh set of counters, all 0. */
export function newCompileWork(): CompileWork {
  return { joinerySplitTests: 0, labelRelocations: 0 };
}
