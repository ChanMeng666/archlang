/**
 * The repair-trajectory recorder.
 *
 * Mirrors the deterministic fix→repair pipeline of `cmdFix` / `eval/l1.ts`'s
 * `l1Pipeline` — a bounded, self-checking machine-applicable fix fixpoint followed by
 * one `repair()` — but records the intermediate steps so the dataset row shows HOW the
 * plan was healed, not just the endpoints:
 *   - each committed fix pass: the suggestions applied (title + `[start,end,newText]`
 *     edits);
 *   - repair's furniture `changes` array.
 *
 * The fix loop is byte-for-byte the `l1Pipeline` contract (compile diagnostics only,
 * `applyFixes` default = machine-applicable tier, ≤4 passes, a pass that raises the
 * compile error count is rolled back and stops, stop at the fixpoint), so a recorded
 * `fixed_source` is exactly what `l1Pipeline` would produce — and re-running the pipeline
 * on it is a byte no-op (idempotence).
 *
 * Imports ONLY the pure core surface (`../src/index.js`). Nothing from `eval/`.
 */

import { type RepairChange, applyFixes, compile, repair } from "../src/index.js";

/** Upper bound on fix passes, matching `cmdFix`'s / `l1Pipeline`'s MAX_PASSES. */
const MAX_PASSES = 4;

/** One applied fix suggestion, projected for the dataset (edit spans → tuples). */
export interface AppliedFix {
  title: string;
  edits: [number, number, string][];
}

/** A recorded fix pass. */
export interface FixStep {
  stage: "fix";
  pass: number;
  applied: AppliedFix[];
}

/** The recorded repair stage. */
export interface RepairStep {
  stage: "repair";
  changes: RepairChange[];
}

export type Step = FixStep | RepairStep;

/** Which stage(s) actually changed bytes (faithful to the ADR 0011/0006 boundary). */
export type FixKind = "fix" | "repair" | "both";

export interface Trajectory {
  fixedSource: string;
  steps: Step[];
  fixKind: FixKind;
  /** How many fix suggestions were committed across all passes. */
  fixesApplied: number;
  /** How many furniture pieces `repair` moved. */
  repairChanges: number;
}

/**
 * Record the deterministic healing trajectory of `broken`: the fix fixpoint, then one
 * `repair`. Returns the healed source, the per-stage steps, and the `fix_kind`.
 */
export function recordTrajectory(broken: string): Trajectory {
  let current = broken;
  const steps: Step[] = [];
  let fixesApplied = 0;
  const afterFix = (() => {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const { diagnostics } = compile(current);
      const fixes = diagnostics.flatMap((d) => d.fixes ?? []);
      if (fixes.length === 0) break; // fixpoint

      const report = applyFixes(current, fixes); // default tier = machine-applicable only
      if (report.applied.length === 0) break; // zero progress

      const errBefore = diagnostics.filter((d) => d.severity === "error").length;
      const errAfter = compile(report.output).diagnostics.filter((d) => d.severity === "error").length;
      if (errAfter > errBefore) break; // would regress — roll back (don't commit)

      steps.push({
        stage: "fix",
        pass: pass + 1,
        applied: report.applied.map((f) => ({
          title: f.title,
          edits: f.edits.map((e): [number, number, string] => [e.span.start, e.span.end, e.newText]),
        })),
      });
      current = report.output;
      fixesApplied += report.applied.length;
    }
    return current;
  })();

  const repaired = repair(afterFix);
  if (repaired.changes.length > 0) {
    steps.push({ stage: "repair", changes: repaired.changes });
  }
  const fixedSource = repaired.source;

  const fixChanged = afterFix !== broken;
  const repairChanged = repaired.changes.length > 0;
  const fixKind: FixKind = fixChanged && repairChanged ? "both" : repairChanged ? "repair" : "fix";

  return { fixedSource, steps, fixKind, fixesApplied, repairChanges: repaired.changes.length };
}
