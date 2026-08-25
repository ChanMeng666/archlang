// Bundle the extension (client + LSP server) into self-contained CJS files with
// esbuild, so the .vsix ships no node_modules. The zero-dep ArchLang core is
// inlined into the server bundle. `vscode` is provided by the host; the core's
// OPTIONAL backends (resvg/pdfkit/clipper2) are marked external so esbuild leaves
// their lazy `import()`s untouched — the language server never invokes them
// (it only parses/resolves/diagnoses), so they are never loaded at runtime.
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { assertCoreIsOurs, ownRepoRoot, resolveCore } from "./resolve-core.mjs";

const watch = process.argv.includes("--watch");

/**
 * The version of the core this build is about to INLINE — and a hard check that the
 * core it is about to inline belongs to THIS checkout.
 *
 * The extension bundles `@chanmeng666/archlang` at build time, so the only honest
 * answer is whatever npm resolved for THIS workspace — not the range in package.json
 * and not the repo root's version. Both the resolution and the ownership check live in
 * `resolve-core.mjs` (with the full rationale) so a test can exercise them with
 * injected paths without triggering a build.
 *
 * The version is injected as `__CORE_VERSION__` and lands in dist/server.js as the
 * `ARCHLANG_CORE_VERSION` literal the server reports as `serverInfo.version` —
 * which is how a test can prove a rebuilt bundle really picked the new core up,
 * rather than counting symbols in the bundle text and hoping. That stamp answers
 * "is the bundle stale in VERSION?"; `assertCoreIsOurs` answers the question it
 * cannot — "did the bundle come from this tree at all?".
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const coreVersion = assertCoreIsOurs(resolveCore(HERE), ownRepoRoot(HERE));

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
