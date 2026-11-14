/**
 * The `arch lint --json` document as a pure function (card CR10): what the CLI's `lint` reports
 * for one source, built here once so the hosted `POST /check` (`packages/mcp-worker`) returns the
 * same document for the same input. `cmdLint` (`src/cli/commands-analyze.ts`) takes its
 * diagnostics from {@link lintFindings}; `test/lint-report.test.ts` holds {@link lintReport} to
 * the CLI's stdout, byte for byte, over the public check set and the examples.
 *
 * Read by the CLI and by the Worker, never by `compile()` or the playground, so a bundle that does
 * not call it drops it. `lint()`'s own return value is not touched.
 */

import { resolvePlan } from "../analyze.js";
import { diagnosticsSummary } from "../cli/summary.js";
import { type DiagnosticJson, diagnosticToJson } from "../diagnostic-json.js";
import { lintWithCoverage } from "../lint.js";
import { parse } from "../parser.js";
import { unknownThemeDiagnostic } from "../pipeline.js";
import type { Diagnostic } from "../types.js";
import type { World } from "../world.js";
import type { LintCoverage } from "./coverage.js";
import { diagnosticRule } from "./provenance.js";

/**
 * `before`, then `W_UNKNOWN_THEME` when the plan's `theme <name>` is no built-in theme, then
 * `after` (RM1.4b). `compile()` raises it with the call's registered themes; the CLI registers
 * none, so `validate` and `lint` hold the name to `THEMES` alone, and `validate --strict` fails
 * on `theme Rendered` as `compile --json` reports it. The library's `describe()` and `lint()` do
 * not raise it (a host may register the name at compile). A plan that names a built-in theme, or
 * none, gets back the very arrays it passed.
 */
export function withThemeWord(source: string, before: Diagnostic[], after: Diagnostic[] = []): Diagnostic[] {
  const { plan } = parse(source);
  const d = plan ? unknownThemeDiagnostic(plan, undefined) : undefined;
  if (!d) return after.length === 0 ? before : [...before, ...after];
  return [...before, d, ...after];
}

/** The options of {@link lintFindings} and {@link lintReport}. */
export interface LintReportOptions {
  /** A built-in lint profile name (`LINT_PROFILE_NAMES`); the caller has checked it. */
  profile?: string;
  /** The environment imports are read through; default: none (an `import` is refused). */
  world?: World;
}

/**
 * What `arch lint` reports for `source`: the resolve errors alone when there are any (`lint()` is
 * silent on a plan that does not resolve, and the coverage report is absent), otherwise the
 * compile's `W_UNKNOWN_FURNITURE` warnings, then `W_UNKNOWN_THEME`, then `lint()`'s warnings, with
 * the coverage report of the same run. Pure.
 */
export function lintFindings(
  source: string,
  opts: LintReportOptions = {},
): { diagnostics: Diagnostic[]; coverage?: LintCoverage } {
  const { world, profile } = opts;
  // Surface fatal errors too (lint() is silent on an unresolvable plan).
  // Render-free: resolvePlan carries every diagnostic compile() would.
  const { diagnostics } = resolvePlan(source, { world });
  const errs = diagnostics.filter((d) => d.severity === "error");
  if (errs.length) return { diagnostics: errs };
  // One run of the rules gives the diagnostics `lint()` returns and the coverage report.
  const linted = lintWithCoverage(source, { world, profile });
  // RM1.4 review: a furniture word near a catalogued kind is compile()'s, but it is the same
  // kind of finding as the lint rule `W_ALIAS_MATCH`, so `lint --strict` fails on it as on that
  // one. Then a theme name the drawing cannot select (RM1.4b). Both are listed before the lint
  // findings, in the order `validate` lists them.
  const furniture = diagnostics.filter((d) => d.code === "W_UNKNOWN_FURNITURE");
  const coverage = linted.coverage ?? undefined;
  return { diagnostics: withThemeWord(source, furniture, linted.diagnostics), ...(coverage ? { coverage } : {}) };
}

/** The `arch lint --json` document, in its key order. */
export interface LintReport {
  /** The count and the codes (PS7.6), first, so output cut short still says how much there is. */
  summary: string;
  /** No error, and with `strict` no warning either: what the CLI's exit code says. */
  ok: boolean;
  strict: boolean;
  /** Each diagnostic as `diagnosticToJson` writes it, with its ruleset number (`rule`, RM1.6b). */
  diagnostics: DiagnosticJson[];
  /** Which rule families ran or skipped, and why; absent when the plan did not resolve. */
  coverage?: LintCoverage;
}

/**
 * The document `arch lint <file> --json [--profile P] [--strict]` prints for `source`, as data:
 * the same keys in the same order, so `JSON.stringify(lintReport(src), null, 2) + "\n"` is the
 * CLI's stdout byte for byte when both read imports through the same World. Pure; never throws
 * for a source (its errors are the report's diagnostics).
 */
export function lintReport(source: string, opts: LintReportOptions & { strict?: boolean } = {}): LintReport {
  const { diagnostics: diags, coverage } = lintFindings(source, opts);
  const strict = opts.strict ?? false;
  const e = diags.filter((d) => d.severity === "error").length;
  const w = diags.length - e;
  return {
    summary: diagnosticsSummary(diags),
    ok: e === 0 && (!strict || w === 0),
    strict,
    diagnostics: diags.map((d) => diagnosticToJson(source, d, { rule: diagnosticRule })),
    ...(coverage ? { coverage } : {}),
  };
}
