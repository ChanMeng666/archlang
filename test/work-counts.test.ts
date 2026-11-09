/**
 * The work-count golden (engineering-health EH1.6): per plan, the evaluator's steps, the drawing
 * budget's units and the resolved elements, as COUNTS. The budgets (`MAX_EVAL_STEPS`,
 * `MAX_DRAW_UNITS`) sit hundreds of times above every shipped plan, so an algorithmic regression of
 * several hundred times still passes them, and the bench job is time and noise. This table pins the
 * corpus's real work instead.
 *
 * Per row, each count may move by at most `max(recorded × _tolerance, _floor)` either way; the corpus
 * totals by at most `recorded × _totalTolerance`, so a creep just under the row tolerance on every
 * row still fails. A rise past the bound is an algorithmic regression; a drop past it is just as red,
 * because a silent drop can hide a pass that stopped running. A drop inside it is reported, not
 * failed. Every row must be a clean resolution with work in it. A legitimate move is explained and
 * the table re-taken with `npx tsx test/work-counts-gen.ts "<why>"`, never by hand
 * (`docs/testing.md` §3). The measurement is `./work-counts.ts`, shared with the generator.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import {
  rowProblems,
  TABLE,
  type WorkCounts,
  type WorkCountsTable,
  workCountPlans,
  workCounts,
} from "./work-counts.js";

const table = JSON.parse(readFileSync(TABLE, "utf8")) as WorkCountsTable;
const plans = workCountPlans();
const RETAKE = 'with its reason: npx tsx test/work-counts-gen.ts "<why>"';

const COUNTS: readonly (keyof WorkCounts)[] = ["steps", "drawUnits", "elements"];

/** Holds `actual` within `recorded ± slack`; a drop inside the slack is only reported. */
function within(name: string, count: string, actual: number, recorded: number, slack: number): void {
  expect(
    actual,
    `${name}: ${count} rose from ${recorded} to ${actual}, past ±${slack}: an algorithmic change to explain, then re-take the table ${RETAKE}`,
  ).toBeLessThanOrEqual(recorded + slack);
  expect(
    actual,
    `${name}: ${count} fell from ${recorded} to ${actual}, past ±${slack} (a pass may have stopped running): explain it, then re-take the table ${RETAKE}`,
  ).toBeGreaterThanOrEqual(recorded - slack);
  if (actual < recorded) console.info(`work-counts: ${name} ${count} fell from ${recorded} to ${actual}`);
}

suite("the table is the corpus", () => {
  it("has a header with a reason, the tolerances and the floor", () => {
    expect(table._reason.trim().length).toBeGreaterThan(0);
    expect(table._tolerance).toBe(0.1);
    expect(table._totalTolerance).toBe(0.03);
    expect(table._floor).toBe(8);
  });

  it("every plan has a row, and every row a plan", () => {
    const keys = new Set(plans.map((p) => p.key));
    const missing = [...keys].filter((k) => !(k in table.rows));
    const stale = Object.keys(table.rows).filter((k) => !keys.has(k));
    expect(missing, `plans with no row: add the row ${RETAKE}`).toEqual([]);
    expect(stale, `rows with no plan (stale): re-take the table ${RETAKE}`).toEqual([]);
    // Not vacuous: every example and the three bench plans.
    expect(plans.length).toBeGreaterThan(30);
  });
});

suite("no plan's work moved past its bound", () => {
  const measured = new Map<string, WorkCounts>();
  for (const p of plans) {
    it(p.key, () => {
      const row = table.rows[p.key];
      expect(row, `${p.key} has no row: add it ${RETAKE}`).toBeDefined();
      const m = workCounts(p.src, p.world);
      expect(rowProblems(m), `${p.key} cannot be a row`).toEqual([]);
      measured.set(p.key, m.counts);
      for (const c of COUNTS)
        within(p.key, c, m.counts[c], row![c], Math.max(row![c] * table._tolerance, table._floor));
    }, 60_000);
  }

  it("nor did the corpus totals", () => {
    for (const p of plans) if (!measured.has(p.key)) measured.set(p.key, workCounts(p.src, p.world).counts);
    for (const c of COUNTS) {
      const actual = [...measured.values()].reduce((n, w) => n + w[c], 0);
      const recorded = Object.values(table.rows).reduce((n, w) => n + w[c], 0);
      expect(recorded).toBeGreaterThan(0);
      within("the corpus total", c, actual, recorded, recorded * table._totalTolerance);
    }
  }, 120_000);
});
