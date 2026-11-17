/**
 * The catalogued remediation for a diagnostic code: one row of the catalogue's fix column
 * (`CATALOG_FIXES`, generated from `ERROR_CATALOG`). `diagnosticToJson` attaches it as `fix`, and
 * the error card (`backends/error-svg.ts`) draws it. It has a module of its own so the card, which
 * is on the compile path, reads the fix without loading the whole JSON projection (card AF1: the
 * playground's compiler chunk is held to a byte budget, `playground/e2e/startup-chunks.baseline.json`).
 */

import { CATALOG_FIXES } from "./error-catalog-fixes.js";

/** The catalogued fix for `code`, or `undefined` when the code has none. */
export function catalogFix(code: string | undefined): string | undefined {
  // An own key only, as `ERROR_CATALOG[code]?.fix` was: an inherited name (`constructor`) has no fix.
  return code && Object.hasOwn(CATALOG_FIXES, code) ? CATALOG_FIXES[code] : undefined;
}
