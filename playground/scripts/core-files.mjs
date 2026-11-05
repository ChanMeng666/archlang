/**
 * The built core's files, read off the build itself: `index.js` and the chunks it imports,
 * transitively. vite.config.js puts exactly these in the `compiler` chunk the page preloads at
 * startup; anything else under dist/ (`cli/review.js`, the Checks overlay's review sheet, and the
 * chunk holding its code) is reached only by a lazy import and loads when it is used.
 *
 * The walk reads `import … from "./x.js"` and `import "./x.js"` lines. A re-export
 * (`export … from "./x.js"`) would pull a file in that the walk does not follow, so the core would
 * be split across chunks without a word: it is refused, loudly, instead. Pure over `read`/`exists`
 * so `playground/test/core-files.test.ts` can hold it to that.
 *
 * @param {(rel: string) => string} read the text of a file under dist/, by its relative path
 * @param {(rel: string) => boolean} exists whether that file exists
 * @returns {Set<string>} the relative paths, `index.js` first
 */
export function coreFiles(read, exists) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel) || !exists(rel)) return;
    seen.add(rel);
    const text = read(rel);
    const reexport = /^export\s[^;]*?from\s*"\.\/([\w./-]+)";?$/m.exec(text);
    if (reexport)
      throw new Error(
        `playground/scripts/core-files.mjs: dist/${rel} re-exports from "./${reexport[1]}"; the compiler chunk ` +
          "is found by following imports only. Follow re-exports here too (and check what lands in `compiler`).",
      );
    for (const m of text.matchAll(/^import\s(?:[^;]*?from\s*)?"\.\/([\w.-]+\.js)";?$/gm)) visit(m[1]);
  };
  visit("index.js");
  return seen;
}
