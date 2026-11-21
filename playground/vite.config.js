import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { coreFiles, firstUseFiles, lintFiles } from "./scripts/core-files.mjs";

/** The built core's directory, as rolldown spells module ids (forward slashes). */
const CORE_DIST = `${resolve(__dirname, "../dist").replace(/\\/g, "/")}/`;
/** The view path's door to it (src/compiler.ts), which belongs in the same chunk. */
const CORE_DOOR = resolve(__dirname, "src/compiler.ts").replace(/\\/g, "/");
// The built core's files (scripts/core-files.mjs): `index.js` and the chunks `compile-path.js`
// imports (src/compile-path.ts, card RM0.7f: compile, describe, describeLevel, THEMES). Not
// every file under dist/: the chunks only the rest of `index.js` reaches (`finish`, `repair`,
// `lint`, `toDxf`, `planToJson`, `validateIntent`, `completion`, …; split again by
// src/first-use-path.ts, card EB.2, so the header actions' share loads apart from edit mode's),
// `cli/review.js` (the Checks overlay's
// review sheet, card P6) and the chunk holding its code are reached only by lazy imports, so they
// stay out of the `compiler` chunk and land in the lazy chunks that use them.
const CORE_FILES = coreFiles(
  (rel) => readFileSync(CORE_DIST + rel, "utf8"),
  (rel) => existsSync(CORE_DIST + rel),
);
const isCompiler = (id) => id === CORE_DOOR || (id.startsWith(CORE_DIST) && CORE_FILES.has(id.slice(CORE_DIST.length)));
// The built core's files the first use loads beyond the compiler (scripts/core-files.mjs, card
// 3.18): the chunks `first-use-path.js` imports (src/first-use-path.ts: `diagnosticToJson`, which the
// header actions import statically), in one `first-use` chunk. What the actions run only on a press
// (press-core.ts) is no such file, nor, since card 3.19b, the compile worker's `lint`.
const FIRST_USE_FILES = firstUseFiles(
  (rel) => readFileSync(CORE_DIST + rel, "utf8"),
  (rel) => existsSync(CORE_DIST + rel),
  CORE_FILES,
);
const isFirstUse = (id) => id.startsWith(CORE_DIST) && FIRST_USE_FILES.has(id.slice(CORE_DIST.length));
// `lint`'s built files beyond those two (card 3.19b: the chunks `lint-path.js` imports,
// src/lint-path.ts) and the playground's door to them (src/lint-core.ts), in one `lint` chunk: edit
// mode imports the door statically, and the compile worker imports that chunk by its own URL
// (`LINT_URL`) for the editor's first request, so a first use in view mode loads none of it
// (firstUsePathBudget). The door must be the chunk's own module: inlined into edit mode's chunk, its
// URL would be edit mode's, which the worker cannot run.
const LINT_FILES = lintFiles(
  (rel) => readFileSync(CORE_DIST + rel, "utf8"),
  (rel) => existsSync(CORE_DIST + rel),
  new Set([...CORE_FILES, ...FIRST_USE_FILES]),
);
const LINT_DOOR = resolve(__dirname, "src/lint-core.ts").replace(/\\/g, "/");
const isLint = (id) => id === LINT_DOOR || (id.startsWith(CORE_DIST) && LINT_FILES.has(id.slice(CORE_DIST.length)));

/*
 * The compiler is its own chunk (`compiler-*.js`, the codeSplitting group below), which main.ts
 * reaches through a dynamic `import("./compiler.js")` on first use, or (imported only, nothing
 * compiled) when the browser is idle (card MP5, ruling MP-D4): a visit on the built-in plan has the drawing, its facts line and its
 * rooms' facts in the HTML, so it needs no compiler to show them. index.html therefore names no
 * `<link rel="modulepreload">` for it (it had one until MP5, which every visit paid for, ~430 KB
 * brotli, whether it used the compiler or not). embed.html imports the core statically, so Vite
 * loads it there at once.
 */

/**
 * Fill index.html's JSON-LD with the values it must not retype: the core's version (the root
 * package.json, the way the docs config reads it) and the archlang.uk node ids it references
 * (`ids` in site-shared/identity.json, the same ids the docs graph defines its nodes by, so a
 * renamed id cannot leave this page pointing at a node nobody defines, as `#chan-meng` once did).
 * Each placeholder is a quoted JSON string, so the file stays valid JSON-LD-shaped text; a
 * placeholder that is missing, or one left unfilled, fails the build.
 *
 * No `sameAs` here: the playground app is a web app, a different entity from the library, so the
 * library's listings (npm, GitHub, marketplaces) belong on the docs `#software` node only. The app
 * points at that node with `isPartOf`/`isBasedOn` instead.
 */
function identityJsonLd() {
  const version = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")).version;
  const { ids } = JSON.parse(readFileSync(resolve(__dirname, "../site-shared/identity.json"), "utf8"));
  const values = {
    '"%ARCHLANG_VERSION%"': JSON.stringify(version),
    '"%ARCHLANG_ID_WEBSITE%"': JSON.stringify(ids.website),
    '"%ARCHLANG_ID_AUTHOR%"': JSON.stringify(ids.author),
    '"%ARCHLANG_ID_SOFTWARE%"': JSON.stringify(ids.software),
  };
  return {
    name: "archlang-identity-jsonld",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!ctx.filename.replace(/\\/g, "/").endsWith("/index.html")) return html;
        let out = html;
        for (const [slot, value] of Object.entries(values)) {
          if (!out.includes(slot)) throw new Error(`vite.config.js: index.html no longer holds ${slot}`);
          out = out.split(slot).join(value);
        }
        if (out.includes('"%ARCHLANG_'))
          throw new Error("vite.config.js: index.html has an unfilled %ARCHLANG_…% value");
        return out;
      },
    },
  };
}

/**
 * Fill index.html's lede (ruling PG-D6: the sentence at the right of the stage's foot) with the
 * canonical line from site-shared/doors.json (PS-D1), the one copy every public surface reads, so
 * the page never retypes it. HTML-escaped; a missing slot fails the build.
 */
function canonicalLine() {
  const { canonicalLine: line } = JSON.parse(readFileSync(resolve(__dirname, "../site-shared/doors.json"), "utf8"));
  const slot = "<!--doors:canonical-line-->";
  const text = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    name: "archlang-canonical-line",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!ctx.filename.replace(/\\/g, "/").endsWith("/index.html")) return html;
        if (!html.includes(slot)) throw new Error(`vite.config.js: index.html no longer holds ${slot}`);
        return html.split(slot).join(text);
      },
    },
  };
}

// The playground consumes the *built* core (run `npm run build` in the repo
// root first): `dist/index.js` and the built files beside it (`cli/review.js`, `share.js`,
// `error-catalog.js`), never `src/`. Aliasing to dist/ keeps the published core import path
// honest and avoids re-resolving the source's `.js` ESM specifiers.
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [identityJsonLd(), canonicalLine()],
  resolve: {
    alias: {
      // The review sheet (`arch preview --review`), for the Checks overlay: its own built file,
      // listed before the bare name, which would otherwise match it as a prefix.
      "archlang/review": resolve(__dirname, "../dist/cli/review.js"),
      // The share-link decoder (`@chanmeng666/archlang/share`), likewise before the bare name.
      "archlang/share": resolve(__dirname, "../dist/share.js"),
      // The diagnostic catalogue (messages, causes, examples), for the edit-mode diagnostics panel
      // only (card RM0.7): its own built file, `dist/error-catalog.js` (tsup.config.ts builds it
      // with no shared chunk), likewise before the bare name. `ERROR_CATALOG` imported from
      // `archlang` would land in the `compiler` chunk (the group below captures every statement of
      // the core's shared chunk any chunk uses), ~57 KB gzip on the path every first compile loads.
      // This file is no core file (scripts/core-files.mjs), so it lands in the lazy chunk that
      // needs it. The fix column `diagnosticToJson` reads (`src/error-catalog-fixes.ts`) is in
      // neither: since card 3.19 it rides the `first-use` chunk, off the compiler chunk.
      // e2e/startup-chunks.baseline.json measures the paths.
      "archlang/error-catalog": resolve(__dirname, "../dist/error-catalog.js"),
      // The compiler door's build entry (src/compile-path.ts, card 3.19): `compileWithoutErrorCard`,
      // which `dist/index.js` does not export, so the compiler chunk carries no error card and no
      // catalogue fix column. A core file (scripts/core-files.mjs), likewise before the bare name.
      "archlang/compile-path": resolve(__dirname, "../dist/compile-path.js"),
      archlang: resolve(__dirname, "../dist/index.js"),
      // archlang-3d is read from its source, as it always was: its published `exports` name a
      // dist/ this build has no reason to need. The longer key goes first (prefix match).
      "@chanmeng666/archlang-3d/browser": resolve(__dirname, "../packages/archlang-3d/src/browser.ts"),
      "@chanmeng666/archlang-3d": resolve(__dirname, "../packages/archlang-3d/src/index.ts"),
      // The 3D preview tab (preview3d.ts) reads the core through archlang-3d's own import
      // specifier: the same built file, so the lazy chunk shares the startup chunk's core.
      "@chanmeng666/archlang": resolve(__dirname, "../dist/index.js"),
    },
  },
  server: {
    fs: { allow: [resolve(__dirname, "..")] },
  },
  // The core's optional Node-only backends (@resvg/resvg-js, pdfkit, clipper2-wasm)
  // are reached only via lazy `import()`s that never run in the browser. Exclude
  // them from dev dep-prebundling so esbuild doesn't try to load their native
  // `.node`/wasm files (the `build.rolldownOptions.external` below covers prod).
  optimizeDeps: { exclude: ["@resvg/resvg-js", "pdfkit", "clipper2-wasm", "archlang"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      // Two pages: the full playground (index.html) and the chrome-less embed
      // renderer (embed.html) that third-party pages iframe in.
      input: {
        index: resolve(__dirname, "index.html"),
        embed: resolve(__dirname, "embed.html"),
      },
      // The core's Node-only export backends (PNG via @resvg/resvg-js, PDF via
      // pdfkit, angled-geometry via clipper2-wasm) are reached only through lazy
      // `import()`s that never run in the browser — the playground rasterizes via
      // <canvas> and embeds PDF via jsPDF. Externalize them (and node: builtins)
      // so Rolldown doesn't try to bundle native binaries it can't parse.
      external: [/^node:/, "@resvg/resvg-js", "pdfkit", "clipper2-wasm"],
      output: {
        // The built core's compile path in one chunk, `compiler`, whichever page or lazy chunk
        // reaches it (the rest of the core goes with the lazy chunks that use it, card RM0.7f):
        // the startup chunk stays the view path alone (e2e/startup-chunks.baseline.json).
        // Vite's dynamic-import helper is shared by the startup chunk and the core (whose
        // optional Node backends are lazy imports), so it gets a chunk of its own first:
        // left to the bundler it lands in `compiler`, and the startup chunk would then import
        // the whole core statically just to reach it.
        // jsPDF (Download PDF's lazy import) is a group of its own for the same trap with the
        // bundler's runtime helpers (`__export`, `__commonJS`, …), which the compiler, jsPDF and
        // the 3D chunks all use. No group `test` ever sees that runtime module: left to the
        // automatic split, it was put in jsPDF's chunk, and the compiler then imported all of
        // jsPDF (~129 KB gzip) statically on every visit. With jsPDF captured by a group, Rolldown
        // emits the runtime as its own `rolldown-runtime` chunk (~0.4 KB gzip). That placement is
        // a bundler heuristic, not something this config can pin: no group can name the runtime,
        // and a Rolldown upgrade or a new shared dependency may move it again. What holds it is
        // the startup gate (playground/e2e/preview3d.spec.ts, "startup chunks"), which walks the
        // static imports from both pages and fails when jsPDF or another lazy chunk is reached.
        // `first-use` (card 3.18) is the core the header actions and the compile worker share
        // beyond the compiler (FIRST_USE_FILES above); `lint` (card 3.19b) is `lint()` and its door,
        // which edit mode and the compile worker share (LINT_FILES above).
        codeSplitting: {
          groups: [
            { name: "preload-helper", test: (id) => id.includes("vite/preload-helper") },
            { name: "jspdf", test: /node_modules[\\/]jspdf[\\/]/ },
            { name: "compiler", test: (id) => isCompiler(id.replace(/\\/g, "/")) },
            { name: "first-use", test: (id) => isFirstUse(id.replace(/\\/g, "/")) },
            { name: "lint", test: (id) => isLint(id.replace(/\\/g, "/")) },
          ],
        },
      },
    },
  },
});
