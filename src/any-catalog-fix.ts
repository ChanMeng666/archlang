/**
 * The catalogued remediation for any catalogue code (card NR.10): {@link catalogFix}'s table, the
 * codes `compile()` raises, then the intent violations' (`E_INTENT_*`, which only `validateIntent`
 * raises). The two generated tables are disjoint and together hold every catalogue code
 * (`test/explain.test.ts`), so this answers as the one table they were split from did.
 * `diagnosticToJson` attaches it as `fix`, and the public `renderErrorSvg` draws it. A module of
 * its own, which nothing on the compile path imports, so the playground's compiler chunk does not
 * carry the intent table (`playground/e2e/startup-chunks.baseline.json`).
 */

import { catalogFix } from "./catalog-fix.js";
import { INTENT_CATALOG_FIXES } from "./error-catalog-fixes-intent.js";

/** The catalogued fix for `code`, an intent violation's too, or `undefined` when it has none. */
export function anyCatalogFix(code: string | undefined): string | undefined {
  // An own key only, as `catalogFix` reads its table.
  return (
    catalogFix(code) ?? (code && Object.hasOwn(INTENT_CATALOG_FIXES, code) ? INTENT_CATALOG_FIXES[code] : undefined)
  );
}
