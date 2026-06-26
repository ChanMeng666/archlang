// Bundle the extension (client + LSP server) into self-contained CJS files with
// esbuild, so the .vsix ships no node_modules. The zero-dep ArchLang core is
// inlined into the server bundle. `vscode` is provided by the host; the core's
// OPTIONAL backends (resvg/pdfkit/clipper2) are marked external so esbuild leaves
// their lazy `import()`s untouched — the language server never invokes them
// (it only parses/resolves/diagnoses), so they are never loaded at runtime.
import { rmSync } from "node:fs";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

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
  console.log("esbuild: built dist/extension.js + dist/server.js");
}
