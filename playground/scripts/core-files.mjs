/** The build entry whose imports are the compiler chunk (src/compile-path.ts, tsup.config.ts). */
export const ENTRY = "compile-path.js";

/**
 * The built core's files that make the playground's `compiler` chunk, read off the build itself:
 * `index.js` and the chunks `compile-path.js` imports, transitively. vite.config.js puts exactly
 * these in the `compiler` chunk. `compile-path.js` is a build entry (src/compile-path.ts, card
 * RM0.7f) that names what that chunk serves (`compileWithoutErrorCard`, `describe`, `describeLevel`,
 * `THEMES`; `lint` left it at card EB.2, `compile` at card 3.19), so esbuild split the shared code
 * by it: what it reaches is in the
 * chunks it imports, and what only the rest of `index.js` reaches (`finish`, `repair`, `lint`,
 * `toDxf`, `planToJson`, …; a second build entry, src/first-use-path.ts, splits that again) is in
 * chunks that `index.js` imports and this walk does not take. Those, and anything else under dist/
 * (`cli/review.js`, the Checks overlay's review sheet, and the chunk holding its code), are reached
 * only by lazy imports and load with the lazy chunk that uses them. `index.js` holds only imports
 * and exports; it is in the set, its imports are not followed. `compile-path.js` holds only imports
 * and exports too; the compiler door imports it (`archlang/compile-path`, card 3.19: the
 * `compileWithoutErrorCard` it serves is no export of `index.js`), so it is in the set, second.
 *
 * The walk reads `import … from "./x.js"` and `import "./x.js"` lines. A re-export
 * (`export … from "./x.js"`) would pull a file in that the walk does not follow, so the core would
 * be split across chunks without a word: it is refused, loudly, instead (in `index.js` too). A
 * dist/ that has `index.js` but no `compile-path.js` is a build from before card RM0.7f, refused
 * as well: walking `index.js` instead would put the whole core back in the chunk without a word.
 * Pure over `read`/`exists` so `playground/test/core-files.test.ts` can hold it to that.
 *
 * @param {(rel: string) => string} read the text of a file under dist/, by its relative path
 * @param {(rel: string) => boolean} exists whether that file exists
 * @returns {Set<string>} the relative paths, `index.js` first
 */
export function coreFiles(read, exists) {
  const seen = new Set();
  const refuseReexport = (rel, text) => {
    const reexport = /^export\s[^;]*?from\s*"\.\/([\w./-]+)";?$/m.exec(text);
    if (reexport)
      throw new Error(
        `playground/scripts/core-files.mjs: dist/${rel} re-exports from "./${reexport[1]}"; the compiler chunk ` +
          "is found by following imports only. Follow re-exports here too (and check what lands in `compiler`).",
      );
  };
  const visit = (rel) => {
    if (seen.has(rel) || !exists(rel)) return;
    seen.add(rel);
    const text = read(rel);
    refuseReexport(rel, text);
    for (const m of text.matchAll(/^import\s(?:[^;]*?from\s*)?"\.\/([\w.-]+\.js)";?$/gm)) visit(m[1]);
  };
  if (!exists("index.js")) return seen;
  if (!exists(ENTRY))
    throw new Error(
      `playground/scripts/core-files.mjs: dist/${ENTRY} is missing beside dist/index.js; rebuild the core ` +
        "(`npm run build` in the repo root): the compiler chunk is the walk from it.",
    );
  seen.add("index.js");
  refuseReexport("index.js", read("index.js"));
  visit(ENTRY);
  return seen;
}

/** The build entry whose imports beyond the compiler chunk are the `first-use` chunk (src/first-use-path.ts). */
export const FIRST_USE_ENTRY = "first-use-path.js";

/**
 * The chunks `entry` imports, transitively, that are not in `stop` (a set whose own imports are all
 * in it, so the walk stops there). The entry itself holds only imports and exports and nothing
 * imports it, so it is not in the set. Empty when there is no `index.js`; a dist/ with `index.js`
 * and no `entry` is refused, as {@link coreFiles} refuses one without `compile-path.js`, and so is a
 * re-export, which the walk would not follow.
 *
 * @param {string} entry the build entry's file under dist/
 * @param {string} chunk what the set makes, for the messages
 * @param {(rel: string) => string} read
 * @param {(rel: string) => boolean} exists
 * @param {ReadonlySet<string>} stop
 * @returns {Set<string>}
 */
function entryFiles(entry, chunk, read, exists, stop) {
  const seen = new Set();
  if (!exists("index.js")) return seen;
  if (!exists(entry))
    throw new Error(
      `playground/scripts/core-files.mjs: dist/${entry} is missing beside dist/index.js; rebuild the ` +
        `core (\`npm run build\` in the repo root): ${chunk} is the walk from it.`,
    );
  const visit = (rel) => {
    if (seen.has(rel) || stop.has(rel) || !exists(rel)) return;
    seen.add(rel);
    const text = read(rel);
    const reexport = /^export\s[^;]*?from\s*"\.\/([\w./-]+)";?$/m.exec(text);
    if (reexport)
      throw new Error(
        `playground/scripts/core-files.mjs: dist/${rel} re-exports from "./${reexport[1]}"; ${chunk} ` +
          "is found by following imports only. Follow re-exports here too (and check what lands in it).",
      );
    for (const m of text.matchAll(/^import\s(?:[^;]*?from\s*)?"\.\/([\w.-]+\.js)";?$/gm)) visit(m[1]);
  };
  visit(entry);
  seen.delete(entry);
  return seen;
}

/**
 * The built core's files that make the playground's `first-use` chunk (card 3.18): the chunks
 * `first-use-path.js` imports, transitively, that are not the compiler chunk's (`compiler`, the
 * {@link coreFiles} set). `first-use-path.js` (src/first-use-path.ts) names the core values a first
 * use loads beyond the compiler: what the header actions import statically (`diagnosticToJson`).
 * esbuild splits them into chunks by the set of entries that reach each module; vite.config.js
 * puts exactly these files in one chunk, which the actions import. The compile worker's `lint` was
 * named there too until card 3.19b; it is {@link lintFiles}'s now, which no view-mode render loads.
 * Pure over `read`/`exists`.
 *
 * @param {(rel: string) => string} read the text of a file under dist/, by its relative path
 * @param {(rel: string) => boolean} exists whether that file exists
 * @param {ReadonlySet<string>} compiler the compiler chunk's files ({@link coreFiles})
 * @returns {Set<string>} the relative paths, in walk order
 */
export function firstUseFiles(read, exists, compiler) {
  return entryFiles(FIRST_USE_ENTRY, "the first use's chunk", read, exists, compiler);
}

/** The build entry whose imports beyond the compiler and first-use chunks are the `lint` chunk (src/lint-path.ts). */
export const LINT_ENTRY = "lint-path.js";

/**
 * The built core's files that make the playground's `lint` chunk (card 3.19b): the chunks
 * `lint-path.js` imports, transitively, that are in neither the compiler chunk nor the `first-use`
 * chunk (`loaded`, {@link coreFiles} and {@link firstUseFiles} together). `lint-path.js`
 * (src/lint-path.ts) names `lint`, which no view-mode render runs. vite.config.js puts exactly these
 * files in one chunk with the playground's door to them (playground/src/lint-core.ts), which edit
 * mode imports statically and the compile worker imports by that chunk's own URL. Left to the
 * bundler, the door would be inlined into edit mode's chunk, and the worker would then import edit
 * mode's code with it. Pure over `read`/`exists`.
 *
 * @param {(rel: string) => string} read the text of a file under dist/, by its relative path
 * @param {(rel: string) => boolean} exists whether that file exists
 * @param {ReadonlySet<string>} loaded the compiler and first-use chunks' files
 * @returns {Set<string>} the relative paths, in walk order
 */
export function lintFiles(read, exists, loaded) {
  return entryFiles(LINT_ENTRY, "the lint chunk", read, exists, loaded);
}
