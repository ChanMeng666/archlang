/**
 * `lint`, which no view-mode render runs (card 3.19b; edit mode, the Checks overlay, a press of
 * Format, Finish or Repair and the DXF and TXT downloads load its chunk): the door edit mode imports
 * statically, and the module the compile job (compile-worker.ts) imports by its own URL,
 * `LINT_URL`, for the first request that asks for lint (main.ts sends that URL with every request
 * from the editor). So a first use, which renders in view mode with no lint, does not load lint's
 * rules (`firstUsePathBudget`, `playground/e2e/startup-chunks.baseline.json`); entering edit mode
 * does, and the worker then imports the same file.
 *
 * By URL, not `import("./lint-core.js")`: Vite wraps every literal dynamic import in its preload
 * helper, which reads `document` (no worker has one) and is a chunk of the view path, which the
 * worker must never import (e2e/preview3d.spec.ts, "startup chunks"). The URL is this module's
 * own (`import.meta.url`, as compile-worker.ts's `WORKER_URL`): vite.config.js keeps this module
 * the `lint` chunk's own, never inlined into edit mode's chunk.
 *
 * The worker reads `lint` from `globalThis[LINT_KEY]`, which this module sets when it runs, not
 * from its exports: the bundler renames a shared chunk's exports (`export { … as l }`), so a
 * module loaded by URL cannot be read by its export names. compile-worker.ts spells the same key
 * (playground/test/core-files.test.ts holds the two together). Named, not `import("archlang")`,
 * as `compiler.ts` and `press-core.ts` are. Add a name here and to `src/lint-path.ts` together.
 */
import { lint } from "archlang";

export { lint } from "archlang";

/** Where this module publishes `lint` for a module that loads it by URL (the compile worker). */
export const LINT_KEY = "__archlangLint";
(globalThis as Record<string, unknown>)[LINT_KEY] = lint;

/** This module's own URL: the compile worker imports `lint` from it. */
export const LINT_URL = import.meta.url;
