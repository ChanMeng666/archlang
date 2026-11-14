/** Types for `run.mjs`, the public check set's runner (card CR10). */

/** One case of `check-set.json`, with its two paths resolved against the folder. */
export interface CheckCase {
  id: string;
  /** `opt-in`: decided by a number graded `convention`, `S-secondary` or `M`; run with `--opt-in`. */
  column: "default" | "opt-in" | "cross-jurisdiction";
  /** The built-in lint profile the case runs under; `null`: the default ruleset. */
  profile: string | null;
  /** The code the plan must report and the twin must not. */
  expect: string;
  /** The ruleset key that decides the case (opt-in and cross-jurisdiction columns); `null` in the default column. */
  rule: string | null;
  /** Cross-jurisdiction only: the code is held by `rule` and another number at once, so its
   *  finding cites neither (RM1.6b) and passes with no `rule`. Absent: the finding must cite `rule`. */
  joint?: boolean;
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
export function judge(
  row: Pick<CheckCase, "expect" | "rule" | "profile" | "joint">,
  plan: LintDoc,
  twin: LintDoc,
): string[];
export function main(argv: readonly string[]): Promise<number>;
