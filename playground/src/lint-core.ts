/**
 * `lint`, which only the editor runs (card 3.19b): the door edit mode imports statically, and the
 * module the compile job (compile-worker.ts) imports by its own URL, `LINT_URL`, for the first
 * request that asks for lint (edit mode sends that URL with every request from the editor). So a
 * first use, which renders in view mode with no lint, does not load lint's rules
 * (`firstUsePathBudget`, `playground/e2e/startup-chunks.baseline.json`), and entering edit mode
 * does: by the time the editor's first request reaches the worker, the page has fetched this
 * chunk with edit mode's, and the worker's import of it is an HTTP-cache hit.
 *
 * By URL, not `import("./lint-core.js")`: Vite wraps every literal dynamic import in its preload
 * helper, which reads `document` (no worker has one) and is a chunk of the view path, which the
 * worker must never import (e2e/preview3d.spec.ts, "startup chunks"). The URL is this module's
 * own (`import.meta.url`, as compile-worker.ts's `WORKER_URL`): vite.config.js keeps it the `lint`
 * chunk's own module, never inlined into edit mode's chunk. Named, not `import("archlang")`, as
 * `compiler.ts` and `press-core.ts` are. Add a name here and to `src/lint-path.ts` together
 * (playground/test/core-files.test.ts).
 */
export { lint } from "archlang";

/** This module's own URL: the compile worker imports `lint` from it. */
export const LINT_URL = import.meta.url;
