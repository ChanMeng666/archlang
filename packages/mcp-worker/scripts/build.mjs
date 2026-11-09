// Build the hosted MCP Worker into ONE module, dist/worker.js, that wrangler uploads as-is
// (`no_bundle: true` in wrangler.jsonc). Two esbuild passes:
//
//   1. the MCP App viewer (src/viewer/viewer.ts + @modelcontextprotocol/ext-apps) → one inline
//      <script> inside src/viewer/viewer.html → dist/viewer.html, a single self-contained page;
//   2. the Worker (src/worker.ts), with the viewer page and the five `archlang://` resources
//      inlined as strings — the Worker has no filesystem, so they are bundled at BUILD time.
//
// What is bundled is DERIVED, never retyped: the resource set is parsed out of
// packages/mcp/src/server.ts's `readResource("<flat>", "<repo path>")` calls (the same calls
// test/lockstep.test.ts pins against copy-resources.mjs), and the core is THIS checkout's
// ../../dist (run `npm run build` at the root first), aliased by name so a stale core in
// node_modules can never be bundled by accident.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { resourcePaths } from "./resource-paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const REPO = join(PKG, "..", "..");
const DIST = join(PKG, "dist");
const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
const corePkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));

const coreEntry = join(REPO, "dist", "index.js");
const linkEntry = join(REPO, "dist", "cli", "link.js");
const shareEntry = join(REPO, "dist", "share.js");
if (!existsSync(coreEntry) || !existsSync(linkEntry) || !existsSync(shareEntry)) {
  console.error("mcp-worker build: ../../dist is missing — run `npm run build` at the repo root first");
  process.exit(1);
}

/**
 * What decides a drawing's bytes: the core's version plus a hash of the core's built library
 * code (every `dist/*.js` but the CLI), so a core change merged without a version bump still
 * changes it. It keys the Worker's edge cache and names the pinned image path (src/app.ts).
 */
function renderVersion() {
  const dist = join(REPO, "dist");
  const files = readdirSync(dist)
    .filter((f) => f.endsWith(".js") && f !== "cli.js")
    .sort();
  const h = createHash("sha256");
  for (const f of files)
    h.update(f)
      .update("\0")
      .update(readFileSync(join(dist, f)))
      .update("\0");
  return `${corePkg.version}-${h.digest("hex").slice(0, 8)}`;
}
const RENDER_VERSION = renderVersion();

const serverSrc = readFileSync(join(REPO, "packages", "mcp", "src", "server.ts"), "utf8");
const paths = resourcePaths(serverSrc);
if (Object.keys(paths).length === 0) {
  console.error("mcp-worker build: no readResource(...) calls parsed from packages/mcp/src/server.ts");
  process.exit(1);
}
const resources = Object.fromEntries(
  Object.entries(paths).map(([name, rel]) => [name, readFileSync(join(REPO, rel), "utf8")]),
);

// Locally, a dependency installed outside this tree (a worktree's node_modules may be a link)
// still finds the SDK and zod through the repo root; in CI this is the normal install.
const nodePaths = [join(REPO, "node_modules")];

/** Optional core dependencies the Worker can never load: a module that refuses on import. */
const OPTIONAL = ["@resvg/resvg-js", "pdfkit", "clipper2-wasm"];
const optionalStub = {
  name: "optional-deps",
  setup(b) {
    const filter = new RegExp(`^(${OPTIONAL.map((s) => s.replace(/[/\\^$.*+?()[\]{}|-]/g, "\\$&")).join("|")})$`);
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "optional-stub" }));
    b.onLoad({ filter: /.*/, namespace: "optional-stub" }, (a) => ({
      contents: `throw new Error(${JSON.stringify(`optional dependency ${a.path} is not available on the hosted server`)});`,
      loader: "js",
    }));
  },
};

/**
 * tsup writes the core's Node built-ins without the `node:` prefix (`"zlib"`, `"fs"`); the Worker
 * resolves them under `nodejs_compat` by their prefixed names, so keep them external, prefixed.
 */
const nodeBuiltins = {
  name: "node-builtins",
  setup(b) {
    b.onResolve({ filter: /^(fs|url|path|zlib|buffer|crypto|util|stream|os)$/ }, (a) => ({
      path: `node:${a.path}`,
      external: true,
    }));
  },
};

/** `virtual:` modules: strings decided at build time. */
const virtual = (mods) => ({
  name: "virtual",
  setup(b) {
    b.onResolve({ filter: /^virtual:/ }, (a) => ({ path: a.path, namespace: "virtual" }));
    b.onLoad({ filter: /.*/, namespace: "virtual" }, (a) => {
      if (!(a.path in mods)) throw new Error(`unknown virtual module ${a.path}`);
      return { contents: `export default ${JSON.stringify(mods[a.path])};`, loader: "js" };
    });
  },
});

mkdirSync(DIST, { recursive: true });

// ---- 1. the viewer page
const viewerJs = await build({
  entryPoints: [join(PKG, "src", "viewer", "viewer.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  nodePaths,
  define: { __VIEWER_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
});
const script = viewerJs.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const template = readFileSync(join(PKG, "src", "viewer", "viewer.html"), "utf8");
if (!template.includes("/*VIEWER_SCRIPT*/")) throw new Error("viewer.html lost its /*VIEWER_SCRIPT*/ slot");
const viewerHtml = template.replace("/*VIEWER_SCRIPT*/", () => script);
writeFileSync(join(DIST, "viewer.html"), viewerHtml);

// ---- 2. the Worker
await build({
  entryPoints: [join(PKG, "src", "worker.ts")],
  outfile: join(DIST, "worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["workerd", "worker", "browser"],
  target: "es2022",
  minify: true,
  legalComments: "none",
  external: ["node:*", "cloudflare:*"],
  alias: {
    "@chanmeng666/archlang/link": linkEntry,
    "@chanmeng666/archlang/share": shareEntry,
    "@chanmeng666/archlang": coreEntry,
  },
  nodePaths,
  define: { __WORKER_VERSION__: JSON.stringify(pkg.version), __RENDER_VERSION__: JSON.stringify(RENDER_VERSION) },
  plugins: [
    optionalStub,
    nodeBuiltins,
    virtual({ "virtual:archlang-resources": resources, "virtual:archlang-viewer": viewerHtml }),
  ],
  logLevel: "warning",
});

const size = (f) => {
  const bytes = statSync(f).size;
  return `${(bytes / 1024).toFixed(0)} KiB (${(gzipSync(readFileSync(f)).length / 1024).toFixed(0)} KiB gzip)`;
};
console.log(
  `  resources: ${Object.entries(paths)
    .map(([n, p]) => `${n} ← ${p}`)
    .join(", ")}`,
);
console.log(`  dist/viewer.html  ${size(join(DIST, "viewer.html"))}`);
console.log(`  dist/worker.js    ${size(join(DIST, "worker.js"))}`);
console.log(`  render version    ${RENDER_VERSION}`);
