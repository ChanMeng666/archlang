/**
 * A build entry, not a package export (card EB.2), the second of the playground's two (the first
 * is `src/compile-path.ts`): the core values a first use on the playground loads beyond the
 * compiler chunk, which are what the header actions call (`playground/src/actions.ts`: `finish`,
 * `repair`, `format`, `toDxf`, `renderAscii`, `diagnosticToJson`) and the compile worker's `lint`
 * (`playground/src/compile-worker.ts`). Each is imported from its declaring module, never through
 * `index.ts`.
 *
 * esbuild puts code in a chunk by the set of entries that reach it, so as an entry of its own this
 * file splits the core's lazy code in two: what it reaches (beyond `compile-path.ts`'s chunks) in
 * chunks it imports, and what only the rest of `dist/index.js` reaches (edit mode's `completion`,
 * `suggestTopology` and `applyFixes`, the intent panel's `validateIntent`, takeoff's `takeoffCsv`,
 * the 3D preview's `planToJson`, …) in chunks of their own. The header actions then import only
 * the first, so a first use no longer loads the second with them (`firstUsePathBudget`,
 * `playground/e2e/startup-chunks.baseline.json`); the lazy chunks that need the rest load it.
 * `dist/first-use-path.js` itself holds no code and is left out of the npm tarball (`files` in
 * package.json). Nothing changes for a consumer of `dist/index.js`, which exports the same values
 * from the same code.
 */
export { renderAscii } from "./backends/ascii.js";
export { diagnosticToJson } from "./diagnostic-json.js";
export { toDxf } from "./export/dxf.js";
export { finish } from "./finish.js";
export { format } from "./format.js";
export { lint } from "./lint.js";
export { repair } from "./repair.js";
