// Bundle the extension (client + LSP server) into self-contained CJS files with
// esbuild, so the .vsix ships no node_modules. The zero-dep ArchLang core is
// inlined into the server bundle. `vscode` is provided by the host; the core's
// OPTIONAL backends (resvg/pdfkit/clipper2) are marked external so esbuild leaves
// their lazy `import()`s untouched — the language server never invokes them
// (it only parses/resolves/diagnoses), so they are never loaded at runtime.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/**
 * The version of the core this build is about to INLINE.
 *
 * The extension bundles `@chanmeng666/archlang` at build time, so the only honest
 * answer is whatever npm resolved for THIS workspace — not the range in
 * package.json and not the repo root's version. The core's `exports` map has no
 * `./package.json` entry (and no `require` condition), so `require.resolve` cannot
 * reach it; walk the `node_modules` chain the way node itself would instead.
 *
 * It is injected as `__CORE_VERSION__` and lands in dist/server.js as the
 * `ARCHLANG_CORE_VERSION` literal the server reports as `serverInfo.version` —
 * which is how a test can prove a rebuilt bundle really picked the new core up,
 * rather than counting symbols in the bundle text and hoping.
 */
function resolveCoreVersion() {
  const pkg = "@chanmeng666/archlang";
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "node_modules", pkg, "package.json");
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, "utf8")).version;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`cannot resolve ${pkg}/package.json — run \`npm install\` at the repo root`);
    dir = parent;
  }
}

const coreVersion = resolveCoreVersion();

// Clean stale output (e.g. a previous tsc build) so the .vsix ships only the
// current esbuild bundles.
rmSync("dist", { recursive: true, force: true });

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  // `vscode` is the host API; the core's optional, lazily-loaded native/wasm deps
  // are never reached by the LSP, so leave them external (unbundled).
  external: ["vscode", "@resvg/resvg-js", "pdfkit", "clipper2-wasm"],
  // Stamp the bundled core's version into the bundle (see resolveCoreVersion).
  define: { __CORE_VERSION__: JSON.stringify(coreVersion) },
  logLevel: "info",
};

const builds = [
  { entryPoints: ["src/extension.ts"], outfile: "dist/extension.js" },
  { entryPoints: ["src/server.ts"], outfile: "dist/server.js" },
];

if (watch) {
  for (const b of builds) {
    const ctx = await esbuild.context({ ...common, ...b });
    await ctx.watch();
  }
  // eslint-disable-next-line no-console
  console.log("esbuild watching…");
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
  // eslint-disable-next-line no-console
  console.log(`esbuild: built dist/extension.js + dist/server.js (core ${coreVersion})`);
}
