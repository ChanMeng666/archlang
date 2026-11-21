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
 * The built core's files that make the playground's `first-use` chunk (card 3.18): the chunks
 * `first-use-path.js` imports, transitively, that are not the compiler chunk's (`compiler`, the
 * {@link coreFiles} set, whose own imports are all in it, so the walk stops there).
 * `first-use-path.js` (src/first-use-path.ts) names the core values a first use loads beyond the
 * compiler: what the header actions import statically (`diagnosticToJson`) and the compile worker's
 * `lint`. esbuild splits them into chunks by the set of entries that reach each module, and that
 * set differs between them (`finish`, which only a press loads, reads `lint` too: card 3.18's
 * `src/actions-path.ts`), so left to the bundler the worker's `lint` landed in a chunk the actions
 * do not import, off the first use's path its budget counts while the worker fetched it on that
 * use. vite.config.js puts exactly these files in one chunk, which the actions and the worker both
 * import. The entry itself holds only imports and exports and nothing imports it, so it is not in
 * the set. Empty when there is no `index.js`; a dist/ with `index.js` and no `first-use-path.js`
 * is refused, as {@link coreFiles} refuses one without `compile-path.js`. Pure over `read`/`exists`.
 *
 * @param {(rel: string) => string} read the text of a file under dist/, by its relative path
 * @param {(rel: string) => boolean} exists whether that file exists
 * @param {ReadonlySet<string>} compiler the compiler chunk's files ({@link coreFiles})
 * @returns {Set<string>} the relative paths, in walk order
 */
export function firstUseFiles(read, exists, compiler) {
  const seen = new Set();
  if (!exists("index.js")) return seen;
  if (!exists(FIRST_USE_ENTRY))
    throw new Error(
      `playground/scripts/core-files.mjs: dist/${FIRST_USE_ENTRY} is missing beside dist/index.js; rebuild the ` +
        "core (`npm run build` in the repo root): the first use's chunk is the walk from it.",
    );
  const visit = (rel) => {
    if (seen.has(rel) || compiler.has(rel) || !exists(rel)) return;
    seen.add(rel);
    const text = read(rel);
    const reexport = /^export\s[^;]*?from\s*"\.\/([\w./-]+)";?$/m.exec(text);
    if (reexport)
      throw new Error(
        `playground/scripts/core-files.mjs: dist/${rel} re-exports from "./${reexport[1]}"; the first use's ` +
          "chunk is found by following imports only. Follow re-exports here too (and check what lands in `first-use`).",
      );
    for (const m of text.matchAll(/^import\s(?:[^;]*?from\s*)?"\.\/([\w.-]+\.js)";?$/gm)) visit(m[1]);
  };
  visit(FIRST_USE_ENTRY);
  seen.delete(FIRST_USE_ENTRY);
  return seen;
}
