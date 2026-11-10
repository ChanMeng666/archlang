/**
 * The work-count measurement (engineering-health EH1.6), importable without vitest: one body, run
 * by the test (`./work-counts.test.ts`) and by the table's generator (`./work-counts-gen.ts`). Two
 * callers, one instrument, so the table and the check can never measure different things.
 *
 * Per plan, three resolution counts, each the instrument the budget suites already use, three lint
 * ones and two drawing ones:
 *
 *  - `steps`: `evaluationSteps()` of the whole resolution (`./step-budget.test.ts`'s `stepsOf`).
 *    It is ONE counter across every storey, instance, call and loop iteration, so a multi-storey
 *    plan has one number for all its storeys, never a per-storey list.
 *  - `drawUnits`: the drawing budget's estimate summed over every storey, `drawUnits()` of each
 *    element plus `storeyPassUnits()` of the storey (`./drawing-budget.test.ts`'s `estimate`).
 *  - `elements`: the resolved elements over every storey (what the drawing budget is charged for).
 *  - `leafDoorPairs`, `boundaryRunTests`, `navCells`: one `lint()` run's work counters
 *    (`lintWork()`, `src/lint/work.ts`; engineering-health EH2.10): the (leaf, door) pairs
 *    `W_LEAF_ACROSS_DOORWAY` measured, the elements `W_BOUNDARY_NO_WALL` measured against shared
 *    runs, and the cells of every circulation nav grid the run built. 0 on a plan that does not
 *    reach the rule, which a row may be.
 *  - `joinerySplitTests`, `labelRelocations`: one uncached compile's drawing work counters
 *    (`compileWork()`, `src/compile-work.ts`; engineering-health EH2.14): the (edge, edge)
 *    candidate pairs the joinery's split phase tested, over every wall set drawn, and the places
 *    the label placer scored for colliding labels. Summed over every storey drawn; 0 on a plan
 *    whose labels are all clear, which a row may be.
 *
 * Every row must be a clean resolution with work in it ({@link rowProblems}).
 *
 * The plans are every `examples/*.arch` (imports read beside it, as the corpus suites do) and the
 * three bench plans of `bench/gen.ts`, which are generated in memory with no I/O.
 */

import { worldFor } from "./world.js";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCED, genPlan, OPENING_HEAVY, ROOM_HEAVY } from "../../bench/gen.js";
import { drawUnits, storeyPassUnits } from "../../src/draw-budget.js";
import { link } from "../../src/import.js";
import { lintWork } from "../../src/lint.js";
import { compileWork } from "../../src/pipeline.js";
import { evaluationSteps, resolveAll } from "../../src/ir.js";
import { parse } from "../../src/parser.js";
import { BUILTIN_REGISTRY } from "../../src/registry.js";
import type { World } from "../../src/world.js";
import { NULL_WORLD } from "../../src/world.js";

export const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TABLE = join(ROOT, "test/tables/work-counts.json");

export interface WorkCounts {
  steps: number;
  drawUnits: number;
  elements: number;
  leafDoorPairs: number;
  boundaryRunTests: number;
  navCells: number;
  joinerySplitTests: number;
  labelRelocations: number;
}

export interface WorkCountsTable {
  _reason: string;
  /** Per row, each count may move by at most `max(recorded × _tolerance, _floor)` either way. */
  _tolerance: number;
  /** The corpus totals may move by at most `recorded × _totalTolerance` either way. */
  _totalTolerance: number;
  /** The absolute slack per row, so a small plan does not trip on a few steps. */
  _floor: number;
  rows: Record<string, WorkCounts>;
}

/** Every measured plan, keyed by its row name: `examples/<f>.arch` (sorted), then `bench:<SPEC>`. */
export function workCountPlans(): { key: string; src: string; world: World }[] {
  const dir = join(ROOT, "examples");
  const examples = readdirSync(dir)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ key: `examples/${f}`, src: readFileSync(join(dir, f), "utf8"), world: worldFor(dir) }));
  const bench = (
    [
      ["BALANCED", BALANCED],
      ["OPENING_HEAVY", OPENING_HEAVY],
      ["ROOM_HEAVY", ROOM_HEAVY],
    ] as const
  ).map(([name, spec]) => ({ key: `bench:${name}`, src: genPlan(spec), world: NULL_WORLD }));
  return [...examples, ...bench];
}

/** The counts of one plan, and the codes of every error its parse, link or resolve raised. */
export interface WorkMeasure {
  counts: WorkCounts;
  errors: string[];
}

/** Measures one plan. A plan that does not parse counts nothing (and has its parse errors). */
export function workCounts(src: string, world: World = NULL_WORLD): WorkMeasure {
  const parsed = parse(src, BUILTIN_REGISTRY);
  const codes = (ds: readonly { severity: string; code?: string }[]): string[] =>
    ds.filter((d) => d.severity === "error").map((d) => d.code ?? "<uncoded>");
  const errors = codes(parsed.diagnostics);
  const ast = parsed.plan;
  if (!ast)
    return {
      counts: {
        steps: 0,
        drawUnits: 0,
        elements: 0,
        leafDoorPairs: 0,
        boundaryRunTests: 0,
        navCells: 0,
        joinerySplitTests: 0,
        labelRelocations: 0,
      },
      errors,
    };
  const linked = link(ast, world, BUILTIN_REGISTRY);
  const res = resolveAll(linked.plan, BUILTIN_REGISTRY, world);
  errors.push(...codes(linked.diagnostics), ...codes(res.diagnostics));
  for (const l of res.levels) errors.push(...codes(l.diagnostics));
  const storeys = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  let units = 0;
  let elements = 0;
  for (const s of storeys) {
    for (const el of s.elements) units += drawUnits(el, BUILTIN_REGISTRY);
    units += storeyPassUnits(s, BUILTIN_REGISTRY);
    elements += s.elements.length;
  }
  const { leafDoorPairs, boundaryRunTests, navCells } = lintWork(src, { world });
  const { joinerySplitTests, labelRelocations } = compileWork(src, { world });
  return {
    counts: {
      steps: evaluationSteps(res),
      drawUnits: units,
      elements,
      leafDoorPairs,
      boundaryRunTests,
      navCells,
      joinerySplitTests,
      labelRelocations,
    },
    errors: [...new Set(errors)],
  };
}

/**
 * Why a measure cannot be a row, or `[]`: a zero count measures nothing, and a plan with an error
 * stopped part-way, so its counts pin a broken resolution. The generator refuses to write such a
 * row and the test fails on it.
 */
export function rowProblems(m: WorkMeasure): string[] {
  const out: string[] = [];
  if (!(m.counts.steps > 0)) out.push("steps is 0");
  if (!(m.counts.drawUnits > 0)) out.push("drawUnits is 0");
  if (m.errors.length > 0) out.push(`errors ${m.errors.join(", ")}`);
  return out;
}
