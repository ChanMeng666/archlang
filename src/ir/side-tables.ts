/**
 * What one resolution keeps beside its {@link ResolvedPlan}, never on it: the frozen datum
 * tables, the `place`d instances' bodies, the evaluation steps spent and the keep state. Each is
 * a `WeakMap` keyed by the IR object, so no serialisation (Scene, SVG, Plan JSON, `describe()`)
 * can see it, and an IR nobody holds takes its entries with it.
 *
 * Invariant: only `src/ir.ts` writes these tables, while it resolves; everything else reads them
 * through the accessors here. Step meter: charges nothing. `stepsSpent` records what a
 * resolution's meter counted, and {@link evaluationSteps} reads it back.
 */

import type { DatumTable } from "../room-datums.js";
import type { KeepRecord, KeepResult } from "../keep.js";
import type { ResolvedElement, ResolvedPlan, ResolvedLevel, PlanResolution } from "./types.js";

/** Each resolved storey's frozen datum tables (ADR 0028 §1), by instance prefix. */
export const datumTablesOfIr = new WeakMap<ResolvedPlan, ReadonlyMap<string, DatumTable>>();

/**
 * The datum tables one storey's resolution froze: `""` is the root plan's, and each `place`d
 * instance's is under its prefix (`west`, `west.inner`), in that instance's own frame. Empty
 * for a plan whose resolution was stopped or that was not resolved here.
 *
 * Internal: the language reads a table through the room-edge datums (`hall.top`,
 * `src/room-datums.ts` `tableReader`, installed in `resolveGroup`); this accessor is for the
 * tests that pin what the table holds. Not part of the public surface.
 */
export function datumTablesOf(ir: ResolvedPlan): ReadonlyMap<string, DatumTable> {
  return datumTablesOfIr.get(ir) ?? new Map();
}

/** One `place`d instance's body as its own group resolved it, before its frame carried it. */
export interface InstanceBody {
  /** The instance's own elements in its LOCAL frame and LOCAL names (no `<prefix>.`), in
   *  entry order; the ones the frame could not carry are left out, as they are from the plan. */
  local: readonly ResolvedElement[];
  /** True when the component body came in through an `import` (some entry's `file` is set). */
  imported: boolean;
}

/** Each resolved storey's instance bodies, by instance prefix, in commit order. */
export const instanceBodiesOfIr = new WeakMap<ResolvedPlan, ReadonlyMap<string, InstanceBody>>();

/**
 * The bodies of one storey's `place`d instances, keyed by prefix (`west`, `west.inner`) in the
 * order `ir.instances` lists them: each is what the component compiled as a plan resolves to
 * (an instance never reaches out, ADR 0016 §3). Empty for a plan with no instance or one not
 * resolved here. Internal: Plan JSON reads it to carry a component's statement as written
 * (PS3.9); it never reaches the Scene, `describe()` or `lint()`.
 */
export function instanceBodiesOf(ir: ResolvedPlan): ReadonlyMap<string, InstanceBody> {
  return instanceBodiesOfIr.get(ir) ?? new Map();
}

/**
 * What one resolution spent of the evaluation-step budget (`MAX_EVAL_STEPS`, `src/expr.ts`),
 * counted from the steps the storeys below it spent; `exhausted` when it crossed the budget
 * and stopped. Kept beside the IR rather than on it, so no serialisation can see it.
 */
interface StepsSpent {
  used: number;
  exhausted: boolean;
}
export const stepsSpent = new WeakMap<ResolvedPlan, StepsSpent>();

/**
 * What one storey's resolution knows of its keeps (ADR 0033), beside the IR as `stepsSpent` is,
 * never on it: the keeps the plan has counted so far (this storey's included), whether
 * `E_KEEP_LIMIT` was raised, this storey's measured results, the plan's root `stacked` keeps
 * as the last storey expanded them, and which ids were authored (for the `stacked` pass). Set only
 * for a plan that declares a keep.
 */
export interface KeepState {
  count: number;
  limited: boolean;
  results?: KeepResult[];
  stacked?: KeepRecord[];
  authored?: (id: string) => boolean;
}
export const keepStateOfIr = new WeakMap<ResolvedPlan, KeepState>();
/** The plan's `stacked` results, keyed by its PRIMARY (lowest) storey's IR. */
export const stackedResultsOfIr = new WeakMap<ResolvedPlan, KeepResult[]>();
/** Where the `stacked` pass left the step counter, keyed the same way (read by `evaluationSteps`). */
export const stackedStepsOfIr = new WeakMap<ResolvedPlan, number>();

/**
 * Every accepted keep of a resolved plan, measured, in source order: each storey's keeps by level,
 * then the plan's (`stacked`). `undefined` when the plan declares none, so a reader adds no key.
 * Internal: read by `describe()` and `validate`; never on the IR, never in the drawing.
 */
export function keepResultsOf(ir: ResolvedPlan, levels: readonly ResolvedLevel[]): KeepResult[] | undefined {
  const storeys = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const out: KeepResult[] = [];
  let any = false;
  for (const s of storeys) {
    const st = keepStateOfIr.get(s);
    if (st?.results) {
      any = true;
      out.push(...st.results);
    }
  }
  const plan = stackedResultsOfIr.get(storeys[0]!);
  if (plan) {
    any = true;
    out.push(...plan);
  }
  return any ? out : undefined;
}

/** The steps a resolved plan's resolution left the counter at (0 for a plan from elsewhere). */
export function stepsOf(ir: ResolvedPlan): StepsSpent {
  return stepsSpent.get(ir) ?? { used: 0, exhausted: false };
}

/** The evaluation steps a whole resolution spent (every storey). Internal: for the tests
 *  that pin the budget against the corpus; not part of the public surface. */
export function evaluationSteps(res: PlanResolution): number {
  const top = res.levels.length > 0 ? res.levels[res.levels.length - 1]!.ir : res.ir;
  let used = stepsOf(top).used;
  // A storey left unevaluated above a crossing carries no count; the crossing storey's does.
  for (const l of res.levels) used = Math.max(used, stepsOf(l.ir).used);
  // The plan's `stacked` keeps are measured after the last storey, on the same counter.
  const first = res.levels[0]?.ir;
  if (first) used = Math.max(used, stackedStepsOfIr.get(first) ?? 0);
  return used;
}
