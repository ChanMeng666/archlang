/**
 * A build entry, not a package export (card RM0.7f): the values the playground's compiler chunk
 * serves, `compile`, `describe`, `describeLevel`, `lint` and `THEMES` (`playground/src/compiler.ts`,
 * the compile worker's and the page's door, and the embed page's `compile`/`THEMES`), each imported
 * from its declaring module and never through `index.ts`.
 *
 * tsup builds it beside `src/index.ts` (tsup.config.ts), and esbuild puts code in a chunk by the
 * set of entries that reach it. So the core modules this file reaches land in chunks it imports,
 * and the modules only the rest of the public surface reaches (`finish`, `repair`, `toDxf`,
 * `planToJson`, `validateIntent`, `completion`, …) land in chunks of their own, which
 * `dist/index.js` also imports. The playground's `compiler` chunk group takes the chunks this
 * entry imports (playground/scripts/core-files.mjs), so the lazy chunks that use the rest (edit
 * mode, the header actions, takeoff, the 3D preview) carry it, not the path every first compile
 * loads. `dist/compile-path.js` itself holds no code and is left out of the npm tarball
 * (`files` in package.json). Nothing changes for a consumer of `dist/index.js`, which exports the
 * same values from the same code.
 */
export { compile } from "./compile.js";
export { describe, describeLevel } from "./describe.js";
export { lint } from "./lint.js";
export { THEMES } from "./theme.js";
