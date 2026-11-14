/** Types for `run.mjs`, the public check set's runner (card CR10). */

/** One case of `check-set.json`, with its two paths resolved against the folder. */
export interface CheckCase {
  id: string;
  column: "default" | "cross-jurisdiction";
  /** The built-in lint profile the case runs under; `null`: the default ruleset. */
  profile: string | null;
  /** The code the plan must report and the twin must not. */
  expect: string;
  /** The ruleset key that decides the case (cross-jurisdiction column); `null` in the default column. */
  rule: string | null;
  plan: string;
  twin: string;
  planPath: string;
  twinPath: string;
}

/** The parts of a `lint --json` document the judge reads. */
export interface LintDoc {
  diagnostics: ReadonlyArray<{ code?: string; severity: string; rule?: { key: string; profile: string | null } }>;
}

export function loadCases(dir?: string): CheckCase[];
export function judge(row: Pick<CheckCase, "expect" | "rule" | "profile">, plan: LintDoc, twin: LintDoc): string[];
export function main(argv: readonly string[]): Promise<number>;
