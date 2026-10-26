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

/** Catalogue position of a code; an uncatalogued code sorts after every catalogued one. */
const rank = (code: string): number => {
  const i = ERROR_CODES.indexOf(code);
  return i < 0 ? ERROR_CODES.length : i;
};

/** `CODE ×k, …` for one severity: descending count, then catalogue order, then code text. */
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
 * `no warnings`, `7 warnings: W_SWING_OBSTRUCTED ×4, W_ANNOTATION_OVERLAP ×3`, or with errors
 * `2 errors, 3 warnings: E_A ×2, W_B ×3`. Errors come first, each severity's codes by
 * descending count. Every diagnostic is counted; none is elided.
 */
export function diagnosticsSummary(diags: readonly Diagnostic[]): string {
  const errors = diags.filter((d) => d.severity === "error");
  const warnings = diags.filter((d) => d.severity !== "error");
  if (!errors.length && !warnings.length) return "no warnings";
  const head = [
    ...(errors.length ? [plural(errors.length, "error")] : []),
    ...(warnings.length ? [plural(warnings.length, "warning")] : []),
  ].join(", ");
  return `${head}: ${[...codeList(errors), ...codeList(warnings)].join(", ")}`;
}
