/**
 * The walk through the BUILT playground (`playground/dist/`) from a page's roots to everything they
 * import statically, and its gzip sizes (card PG5a, card EB.1). One copy, imported by both places
 * that measure it: the startup-chunks gate in `playground/e2e/preview3d.spec.ts`, and
 * `scripts/embed-path-size.mjs` (`npm run size:embed`), which prints the embed path against
 * `embedPathBudget` before a compiler-path PR is pushed. A second copy of the walk is how two
 * numbers come to disagree, so neither place spells it out again.
 *
 * What a page file costs is everything it imports statically, not the file alone: a module's static
 * imports load and run before it does. The pages name only the roots (their module script and
 * modulepreloads), so the walk follows the graph from them (card PG5a: the compiler once imported
 * the whole jsPDF chunk, ~129 KB gzip, for the bundler's runtime helpers, and a gate that counted
 * only the files index.html names never saw it). A dynamic `import()` is not followed: that is a
 * lazy chunk, loaded on demand; the spec adds the ones every visit makes itself.
 *
 * A relative specifier resolves against the importing file, `?query` dropped; one that names no
 * built file throws, so a change in how the bundler spells imports cannot quietly drop edges from
 * the walk. Sizes are `gzipSync` of each file's bytes at zlib's defaults, summed: a sum is
 * indifferent to the bundler renaming or re-splitting chunks.
 *
 * Pure over `read`/`exists` (paths relative to the build's root, POSIX separators), so a fake tree
 * can hold it to that; `chunkWalkOf(dist)` reads a real build.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { gzipSync } from "node:zlib";

/**
 * `import x,{a as b}from"./c.js"`, `import*as x from…`, `import"./c.js"` and the re-exports
 * `export{…}from…` / `export*from…`; never `import("./c.js")`. Global: read with `matchAll`, which
 * copies the expression, so sharing it is safe.
 */
export const STATIC =
  /\b(?:import|export)\s*(?:[\w$]+\s*,?\s*)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})?\s*(?:from\s*)?["'](\.{1,2}\/[^"']+)["']/g;
/** `import("./c.js")`, the lazy edges the walk does not follow. */
export const DYNAMIC = /\bimport\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*\)/g;

/**
 * @param {(rel: string) => Buffer} read the bytes of a built file, by its path relative to the build
 * @param {(rel: string) => boolean} exists whether that file exists
 */
export function chunkWalk(read, exists) {
  const text = (/** @type {string} */ file) => read(file).toString("utf8");
  /**
   * A page's own module script and modulepreloads, as index.html / embed.html name them.
   * @param {string} page
   * @returns {{ scripts: string[], preloads: string[] }}
   */
  const pageRoots = (page) => {
    const html = text(page);
    const scripts = [...html.matchAll(/<script type="module"[^>]*\bsrc="\.\/(assets\/[^"]+\.js)"/g)].map(
      (m) => /** @type {string} */ (m[1]),
    );
    const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*\bhref="\.\/(assets\/[^"]+\.js)"/g)].map(
      (m) => /** @type {string} */ (m[1]),
    );
    if (scripts.length === 0) throw new Error(`chunk walk: ${page} loads no module script`);
    return { scripts, preloads };
  };
  /**
   * @param {string} from
   * @param {string} spec
   */
  const resolveFrom = (from, spec) => {
    const file = posix.normalize(posix.join(posix.dirname(from), spec.replace(/[?#].*$/, "")));
    if (!exists(file)) throw new Error(`chunk walk: ${from} imports "${spec}", which is no built file`);
    return file;
  };
  /**
   * The files `file` imports, by the expression's first group (`STATIC` or `DYNAMIC`).
   * @param {string} file
   * @param {RegExp} re
   * @returns {string[]}
   */
  const imports = (file, re) =>
    [...text(file).matchAll(re)].map((m) => resolveFrom(file, /** @type {string} */ (m[1])));
  /** @param {string} file */
  const staticImports = (file) => imports(file, STATIC);
  /**
   * The roots and everything they import statically, transitively, sorted.
   * @param {string[]} roots
   * @returns {string[]}
   */
  const reach = (roots) => {
    /** @type {Set<string>} */
    const seen = new Set();
    const todo = [...roots];
    while (todo.length) {
      const file = /** @type {string} */ (todo.pop());
      if (seen.has(file)) continue;
      seen.add(file);
      todo.push(...staticImports(file));
    }
    return [...seen].sort();
  };
  /** A built file's gzip size in bytes. @param {string} file */
  const gz = (file) => gzipSync(read(file)).length;
  /** The sum of the files' gzip sizes. @param {string[]} files */
  const size = (files) => files.reduce((a, f) => a + gz(f), 0);
  /**
   * The embed path (`embedPathBudget`): what embed.html's module script and preloads reach. The
   * embed imports the core statically (embed.ts), so it walks into the compiler.
   * @returns {string[]}
   */
  const embedPath = () => {
    const { scripts, preloads } = pageRoots("embed.html");
    return reach([...scripts, ...preloads]);
  };
  return { pageRoots, resolveFrom, imports, staticImports, reach, gz, size, embedPath };
}

/**
 * The walk over a real build directory (`playground/dist`).
 * @param {string} dist
 */
export function chunkWalkOf(dist) {
  return chunkWalk(
    (rel) => readFileSync(join(dist, rel)),
    (rel) => existsSync(join(dist, rel)),
  );
}
