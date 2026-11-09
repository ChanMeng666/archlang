/**
 * The work-count golden (engineering-health EH1.6): per plan, the evaluator's steps and the drawing
 * budget's units, as COUNTS. The budgets (`MAX_EVAL_STEPS`, `MAX_DRAW_UNITS`) sit hundreds of times
 * above every shipped plan, so an algorithmic regression of several hundred times still passes them,
 * and the bench job is time and noise. This table pins the corpus's real work instead.
 *
 * Each count may move by at most the table's `_tolerance` either way. A rise past it is an
 * algorithmic regression; a drop past it is just as red, because a silent drop can hide a pass that
 * stopped running. A drop inside it is reported, not failed. Either way, a legitimate move is
 * explained and the table re-taken with `npx tsx test/work-counts-gen.ts "<why>"`, never by hand
 * (`docs/testing.md` §3). The measurement is `./work-counts.ts`, shared with the generator.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { TABLE, type WorkCounts, type WorkCountsTable, workCountPlans, workCounts } from "./work-counts.js";

const table = JSON.parse(readFileSync(TABLE, "utf8")) as WorkCountsTable;
const tol = table._tolerance;
const plans = workCountPlans();
const RETAKE = 'with its reason: npx tsx test/work-counts-gen.ts "<why>"';

type Count = "steps" | "drawUnits";
const COUNTS: readonly Count[] = ["steps", "drawUnits"];

/** Holds `actual` within `recorded × (1 ± tol)`; a drop inside the tolerance is only reported. */
function within(name: string, count: string, actual: number, recorded: number): void {
  expect(
    actual,
    `${name}: ${count} rose from ${recorded} to ${actual}, past ${tol * 100}%: an algorithmic change to explain, then re-take the table ${RETAKE}`,
  ).toBeLessThanOrEqual(recorded * (1 + tol));
  expect(
    actual,
    `${name}: ${count} fell from ${recorded} to ${actual}, past ${tol * 100}% (a pass may have stopped running): explain it, then re-take the table ${RETAKE}`,
  ).toBeGreaterThanOrEqual(recorded * (1 - tol));
  if (actual < recorded) console.info(`work-counts: ${name} ${count} fell from ${recorded} to ${actual}`);
}

suite("the table is the corpus", () => {
  it("has a header with a reason and the tolerance", () => {
    expect(table._reason.trim().length).toBeGreaterThan(0);
    expect(tol).toBe(0.1);
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

suite("no plan's work moved past the tolerance", () => {
  const measured = new Map<string, WorkCounts>();
  for (const p of plans) {
    it(p.key, () => {
      const row = table.rows[p.key];
      expect(row, `${p.key} has no row: add it ${RETAKE}`).toBeDefined();
      const actual = workCounts(p.src, p.world);
      measured.set(p.key, actual);
      for (const c of COUNTS) within(p.key, c, actual[c], row![c]);
    }, 60_000);
  }

  it("nor did the corpus totals", () => {
    for (const p of plans) if (!measured.has(p.key)) measured.set(p.key, workCounts(p.src, p.world));
    for (const c of COUNTS) {
      const actual = [...measured.values()].reduce((n, w) => n + w[c], 0);
      const recorded = Object.values(table.rows).reduce((n, w) => n + w[c], 0);
      expect(recorded).toBeGreaterThan(0);
      within("the corpus total", c, actual, recorded);
    }
  }, 120_000);
});
