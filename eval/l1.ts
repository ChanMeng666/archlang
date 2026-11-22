/**
 * L1 — the deterministic-tool tier of the eval ladder (roadmap Tranche 2; deep-dive H3).
 *
 * L0 is a raw model generation; L1 runs that source through the two *deterministic*
 * healers the language already ships — `arch fix` (syntactic span edits, ADR 0011) then
 * `arch repair` (the geometric corrector, ADR 0006) — with no model in the loop. The
 * gap ΔL0→L1 is the "free" deterministic dividend, measured here separately so it is
 * never mis-credited to a model feedback loop (H3: the free gains must be isolated from
 * any L2 loop delta).
 *
 * Pure and deterministic: the only imports are the pure core surface (`compile`,
 * `applyFixes`, `rankFixes`, `repair`). This MIRRORS the CLI's `arch fix` fixpoint (`cmdFix` in
 * src/cli/commands-author.ts) — the top-ranked fix of each diagnostic, machine-applicable fixes
 * only, a bounded number of passes, and a pass that raises the compile error count is rolled
 * back — but stays inside `eval/` rather than reaching into the (unexported) CLI.
 */

import { applyFixes, compile, type Diagnostic, type FixSuggestion, rankFixes, repair } from "../src/index.js";

/** The result of running a source through the L1 deterministic pipeline. */
export interface L1Result {
  /** The healed `.arch` source (fix span-edits applied, then repair's geometric moves). */
  source: string;
  /** How many machine-applicable fix suggestions were committed across all fix passes. */
  fixesApplied: number;
  /** How many furniture pieces `repair` moved. */
  repairChanges: number;
}

/** Upper bound on fix passes, matching `cmdFix`'s MAX_PASSES. */
const MAX_PASSES = 4;

/**
 * The fixes one L1 pass hands `applyFixes`: per diagnostic, the top of `rankFixes`, as `cmdFix`
 * takes it. The `fixes` on one diagnostic are mutually-exclusive alternatives, so the rest are
 * never offered; a diagnostic with no fix offers nothing. Diagnostic order is kept.
 */
export function l1Fixes(diagnostics: readonly Diagnostic[]): FixSuggestion[] {
  return diagnostics.flatMap((d) => rankFixes(d.fixes ?? []).slice(0, 1));
}

/**
 * Heal `source` with the deterministic tool pipeline: a bounded, self-checking
 * machine-applicable fix fixpoint, then one `repair`.
 *
 * The fix loop mirrors `cmdFix`: each pass takes each diagnostic's top-ranked fix
 * ({@link l1Fixes}), applies the machine-applicable ones via `applyFixes` (its default tier), and commits
 * the pass only if it applied something and did **not** raise the compile error count;
 * otherwise the loop stops (a rolled-back pass is simply not committed). The loop also
 * stops at its fixpoint (a pass that applies nothing) or after {@link MAX_PASSES}. Then
 * `repair` runs once — the fix→repair order is the ADR 0011/0006 boundary (span edits
 * before geometry). Pure: identical input always yields an identical result.
 */
export function l1Pipeline(source: string): L1Result {
  let current = source;
  let fixesApplied = 0;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { diagnostics } = compile(current);
    const fixes = l1Fixes(diagnostics);
    if (fixes.length === 0) break; // fixpoint: nothing left to fix

    const report = applyFixes(current, fixes); // default tier = machine-applicable only
    if (report.applied.length === 0) break; // zero progress (all skipped / placeholders)

    const errBefore = diagnostics.filter((d) => d.severity === "error").length;
    const errAfter = compile(report.output).diagnostics.filter((d) => d.severity === "error").length;
    if (errAfter > errBefore) break; // this pass would regress — roll it back (don't commit)

    current = report.output;
    fixesApplied += report.applied.length;
  }

  const repaired = repair(current);
  return { source: repaired.source, fixesApplied, repairChanges: repaired.changes.length };
}
