/**
 * The work-count measurement (engineering-health EH1.6), importable without vitest: one body, run
 * by the test (`./work-counts.test.ts`) and by the table's generator (`./work-counts-gen.ts`). Two
 * callers, one instrument, so the table and the check can never measure different things.
 *
 * Per plan, three counts, each the instrument the budget suites already use:
 *
 *  - `steps`: `evaluationSteps()` of the whole resolution (`./step-budget.test.ts`'s `stepsOf`).
 *    It is ONE counter across every storey, instance, call and loop iteration, so a multi-storey
 *    plan has one number for all its storeys, never a per-storey list.
 *  - `drawUnits`: the drawing budget's estimate summed over every storey, `drawUnits()` of each
 *    element plus `storeyPassUnits()` of the storey (`./drawing-budget.test.ts`'s `estimate`).
 *  - `elements`: the resolved elements over every storey (what the drawing budget is charged for).
 *
 * The plans are every `examples/*.arch` (imports read beside it, as the corpus suites do) and the
 * three bench plans of `bench/gen.ts`, which are generated in memory with no I/O.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { BALANCED, genPlan, OPENING_HEAVY, ROOM_HEAVY } from "../bench/gen.js";
import { drawUnits, storeyPassUnits } from "../src/draw-budget.js";
import { link } from "../src/import.js";
import { evaluationSteps, resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { NULL_WORLD } from "../src/world.js";

export const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
export const TABLE = join(ROOT, "test/tables/work-counts.json");

export interface WorkCounts {
  steps: number;
  drawUnits: number;
  elements: number;
}

export interface WorkCountsTable {
  _reason: string;
  _tolerance: number;
  rows: Record<string, WorkCounts>;
}

const worldFor = (dir: string): World => ({
  read: (p) => {
    try {
      return readFileSync(resolvePath(dir, p), "utf8");
    } catch {
      return null;
    }
  },
});

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

/** The three counts of one plan. A plan that does not parse counts nothing. */
export function workCounts(src: string, world: World = NULL_WORLD): WorkCounts {
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return { steps: 0, drawUnits: 0, elements: 0 };
  const linked = link(ast, world, BUILTIN_REGISTRY);
  const res = resolveAll(linked.plan, BUILTIN_REGISTRY, world);
  const storeys = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  let units = 0;
  let elements = 0;
  for (const s of storeys) {
    for (const el of s.elements) units += drawUnits(el, BUILTIN_REGISTRY);
    units += storeyPassUnits(s, BUILTIN_REGISTRY);
    elements += s.elements.length;
  }
  return { steps: evaluationSteps(res), drawUnits: units, elements };
}
