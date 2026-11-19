/**
 * The catalogued remediation for a diagnostic code: one row of the catalogue's fix column
 * (`CATALOG_FIXES`, generated from `ERROR_CATALOG`). The error card `compile()` draws
 * (`backends/error-svg.ts`) reads it here. It has a module of its own so the card, which is on the
 * compile path, reads the fix without loading the whole JSON projection (card AF1: the
 * playground's compiler chunk is held to a byte budget, `playground/e2e/startup-chunks.baseline.json`).
 *
 * `CATALOG_FIXES` holds every code `compile()` can raise; the intent violations' (`E_INTENT_*`,
 * raised only by `validateIntent`) are in a table of their own (card NR.10), which
 * `anyCatalogFix` (`src/any-catalog-fix.ts`) reads after this one for `diagnosticToJson` and the
 * public `renderErrorSvg`, so the compile path does not carry them.
 */

import type { Diagnostic } from "./diagnostics.js";
import { CATALOG_FIXES } from "./error-catalog-fixes.js";

/** The catalogued fix for `code` among the codes `compile()` raises, or `undefined` when it has none. */
export function catalogFix(code: string | undefined): string | undefined {
  // An own key only, as `ERROR_CATALOG[code]?.fix` was: an inherited name (`constructor`) has no fix.
  return code && Object.hasOwn(CATALOG_FIXES, code) ? CATALOG_FIXES[code] : undefined;
}

/**
 * The remedy shown for `d`, wherever it is shown (`fix` in the JSON, the CLI's `= fix:` line, both
 * error cards): its code's fix in `fixOf`, the table that place reads (this module's for the card
 * `compile()` draws, `anyCatalogFix` for the JSON and the public `renderErrorSvg`), except that a
 * diagnostic which names a {@link Diagnostic.cause} says to fix that root first (RM9.4). The
 * catalogue is unchanged.
 */
export function diagnosticFix(
  d: Pick<Diagnostic, "code" | "cause">,
  fixOf: (code: string | undefined) => string | undefined,
): string | undefined {
  return d.cause ? "Fix the diagnostic `cause` names first: this one follows from it." : fixOf(d.code);
}
