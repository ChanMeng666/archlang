/** The build entry whose imports are the compiler chunk (src/compile-path.ts, tsup.config.ts). */
export const ENTRY = "compile-path.js";

/**
 * The built core's files that make the playground's `compiler` chunk, read off the build itself:
 * `index.js` and the chunks `compile-path.js` imports, transitively. vite.config.js puts exactly
 * these in the `compiler` chunk. `compile-path.js` is a build entry (src/compile-path.ts, card
 * RM0.7f) that names what that chunk serves (`compile`, `describe`, `describeLevel`, `lint`,
 * `THEMES`), so esbuild split the shared code by it: what it reaches is in the chunks it imports,
 * and what only the rest of `index.js` reaches (`finish`, `repair`, `toDxf`, `planToJson`, …) is in
 * chunks that `index.js` imports and this walk does not take. Those, and anything else under dist/
 * (`cli/review.js`, the Checks overlay's review sheet, and the chunk holding its code), are reached
 * only by lazy imports and load with the lazy chunk that uses them. `index.js` holds only imports
 * and exports; it is in the set, its imports are not followed. `compile-path.js` holds only imports
 * and exports too, and nothing imports it, so it is not in the set.
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
  seen.delete(ENTRY);
  return seen;
}
