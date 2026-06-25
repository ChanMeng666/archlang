/**
 * Built-in element registry — back-compatible views over the default
 * {@link Registry}. The canonical built-in list now lives in `defs.ts`; the
 * per-call registry machinery (and the public `register*` extension points) live
 * in `registry.ts`. These exports keep existing `registry`/`registryOrder`
 * imports working while the pipeline threads a per-call registry through.
 *
 * To add a built-in element: write one module and add it to `BUILTIN_DEFS` in
 * `defs.ts`. To add a *third-party* element: pass it via `compile(src, { plugins })`.
 */

import { BUILTIN_REGISTRY } from "../registry.js";

/** Built-in defs in canonical (registration) order. */
export const registryOrder = BUILTIN_REGISTRY.order;
/** Built-in lookup by keyword. */
export const registry = BUILTIN_REGISTRY.byKeyword;
