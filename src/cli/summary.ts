/**
 * The one-line summary `lint` and `validate` open with (plan-soundness PS7.6): the count and
 * the codes, first in the text report and first key of the JSON, so a reader who cuts the
 * output short (`head -c`, a 200-byte tool preview) still learns how much there is to fix.
 *
 * A pure function of the diagnostics alone. It lives in the CLI layer on purpose: `lint()` and
 * `compile()` return exactly what they returned before, so no corpus digest moves.
 */

import { ERROR_CODES } from "../error-catalog.js";
import type { Diagnostic } from "../index.js";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Position of a code in `ERROR_CODES` (alphabetical); an uncatalogued code sorts after them. */
const rank = (code: string): number => {
  const i = ERROR_CODES.indexOf(code);
  return i < 0 ? ERROR_CODES.length : i;
};

/** `CODE ×k, …` for one severity: descending count, then alphabetical (`ERROR_CODES` order), then code text. */
function codeList(diags: readonly Diagnostic[]): string[] {
  const counts = new Map<string, number>();
  for (const d of diags) {
    const c = d.code ?? "uncoded";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([c, n]) => `${c} ×${n}`);
}

/**
 * `no warnings`, `7 warnings in 2 codes: W_SWING_OBSTRUCTED ×4, W_ANNOTATION_OVERLAP ×3`, or with
 * errors `2 errors, 3 warnings in 4 codes: E_A ×2, …`. Errors come first, each severity's codes by
 * descending count, then alphabetically (`ERROR_CODES` is sorted, errors before warnings). The head
 * carries the number of distinct codes, so output cut short still says how much it hides. Every
 * diagnostic is counted; none is elided.
 */
export function diagnosticsSummary(diags: readonly Diagnostic[]): string {
  const errors = diags.filter((d) => d.severity === "error");
  const warnings = diags.filter((d) => d.severity !== "error");
  if (!errors.length && !warnings.length) return "no warnings";
  const codes = [...codeList(errors), ...codeList(warnings)];
  const head = [
    ...(errors.length ? [plural(errors.length, "error")] : []),
    ...(warnings.length ? [plural(warnings.length, "warning")] : []),
  ].join(", ");
  return `${head} in ${plural(codes.length, "code")}: ${codes.join(", ")}`;
}

/**
 * `validate`'s summary: the diagnostics' line, except that no diagnostics with a failing `ok`
 * (a graph, intent or keep tier failed) must not read "no warnings". The phrase names no `next`
 * content, so `next` stays purely additive (`test/cli-validate-next.test.ts`).
 */
export function validateSummary(diags: readonly Diagnostic[], ok: boolean): string {
  return !ok && diags.length === 0
    ? "no diagnostics; validate failed on a later tier (see next)"
    : diagnosticsSummary(diags);
}
