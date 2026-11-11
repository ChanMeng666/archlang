/**
 * The seam allow-list `test/workspace-seams.test.ts` enforces, and the table text
 * `docs/agents/workspace-seams.md` carries (the test parses the doc table back and compares row by row;
 * `npx tsx test/workspace-seams.allow.ts` prints the table to paste).
 */
import { fileURLToPath } from "node:url";

export interface Seam {
  /** Repo-relative, forward slashes. */
  file: string;
  /**
   * The import specifier; `alias <name>` / `paths <name>` for a config entry; `include <entry>` for a
   * tsconfig include/files entry; `path <repo-relative>` for a file path a script reads or resolves.
   */
  specifier: string;
  why: string;
}

const CORE_SHARE =
  "the Node share-link encoder is a core CLI file with no package export (the browser-safe decoder is ./share)";

export const ALLOW: readonly Seam[] = [
  // playground
  {
    file: "playground/src/glb-export.ts",
    specifier: "../../packages/archlang-3d/src/glb/write.js",
    why: "writeGlb is exported only from archlang-3d's Node entry, but the writer is browser-agnostic; read from source",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths archlang",
    why: "mirrors the Vite alias: a root node_modules/archlang symlink points at the vscode extension",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths archlang/review",
    why: "types for the review sheet come from src/: the build emits no declaration for dist/cli/review.js",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths archlang/share",
    why: "the share-link subpath read from src/share.ts: Playwright resolves tsconfig paths at run time for the specs that import share.ts in Node, where a .d.ts would load as an empty module",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths @chanmeng666/archlang-3d",
    why: "mirrors the Vite alias: archlang-3d is read from source, its published exports name a dist/ that may not be built",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "paths @chanmeng666/archlang-3d/browser",
    why: "the browser entry is a second exports subpath of archlang-3d whose dist/ may not be built; without this mapping tsc cannot resolve what the Vite alias serves",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias archlang",
    why: "the playground consumes the built core (dist/index.js), keeping one import path",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias archlang/review",
    why: "Checks overlay reads the review sheet, a CLI file with no export; listed before the bare name (prefix match)",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias archlang/share",
    why: "the share-link decoder, the core's ./share export, built (dist/share.js); listed before the bare name (prefix match)",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang",
    why: "archlang-3d imports the core by its published name; same built file so the lazy chunk shares the core",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang-3d",
    why: "archlang-3d is read from source: its published exports name a dist/ the build has no reason to need",
  },
  {
    file: "playground/vite.config.js",
    specifier: "alias @chanmeng666/archlang-3d/browser",
    why: "the browser entry of archlang-3d, from source; longer key first",
  },
  {
    file: "playground/wrangler.jsonc",
    specifier: "alias archlang",
    why: "the short-link Worker bundles the built core by name",
  },
  {
    file: "playground/wrangler.jsonc",
    specifier: "alias archlang/share",
    why: "the short-link Worker reads its caps and inflater from the core's ./share export, the built dist/share.js",
  },
  // docs-site
  {
    file: "docs-site/.vitepress/config.ts",
    specifier: "alias archlang",
    why: "examples compile client-side against the built core, the same alias the playground uses",
  },
  {
    file: "docs-site/.vitepress/config.ts",
    specifier: "alias archlang/share",
    why: "the widget's Open in playground link takes base64url and the edit flag from the core's ./share export; listed before the bare name (prefix match)",
  },
  {
    file: "docs-site/tsconfig.json",
    specifier: "paths archlang",
    why: "mirrors the VitePress alias to the built core",
  },
  {
    file: "docs-site/tsconfig.json",
    specifier: "paths archlang/share",
    why: "mirrors the VitePress alias to the built share subpath",
  },
  // packages
  {
    file: "packages/archlang-3d/vitest.e2e.config.ts",
    specifier: "alias @chanmeng666/archlang",
    why: "heavy e2e tests run against the core's source, as the root vitest config does",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "alias @chanmeng666/archlang",
    why: "the Worker bundles THIS checkout's built core, so a stale installed core cannot ship",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "alias @chanmeng666/archlang/link",
    why: "the Worker imports the Node-free link helper by its exports name; the alias pins it to this checkout's dist/cli/link.js, so an installed core cannot supply a different encoder than the one the render version hashes",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "alias @chanmeng666/archlang/share",
    why: "the Worker decodes /svg/ payloads with the core's ./share export; the alias pins it to this checkout's dist/share.js, like /link",
  },
  {
    file: "packages/mcp-worker/scripts/measure-cpu.mjs",
    specifier: "../../../src/cli/share-codec.mjs",
    why: `CPU measurement script encodes a plan hash; ${CORE_SHARE}`,
  },
  {
    file: "packages/mcp-worker/src/env.d.ts",
    specifier: "../../mcp/src/tools.js",
    why: "types the virtual:archlang-resources module by the stdio server's ResourceName",
  },
  {
    file: "packages/mcp-worker/src/server.ts",
    specifier: "../../mcp/src/tools.js",
    why: "the hosted server serves the stdio server's tool set, so it registers the same tools from source (mcp is not published as a library)",
  },
  {
    file: "packages/mcp-worker/tsconfig.json",
    specifier: "paths @chanmeng666/archlang",
    why: "types come from the same built core that scripts/build.mjs bundles",
  },
  {
    file: "packages/mcp-worker/tsconfig.json",
    specifier: "paths @chanmeng666/archlang/link",
    why: "tsc must type the Worker's /link import from the same build the bundler inlines (scripts/build.mjs), not an installed copy that could differ",
  },
  {
    file: "packages/mcp-worker/tsconfig.json",
    specifier: "paths @chanmeng666/archlang/share",
    why: "types the Worker's ./share import from the same build the bundler inlines, as for /link",
  },
  {
    file: "packages/mcp/scripts/tsconfig.gen.json",
    specifier: "paths @chanmeng666/archlang",
    why: "gen:mcp-capabilities runs the tool registry under tsx with the core's source, as the root vitest alias does, so check:drift needs no build",
  },
  {
    file: "packages/web-component/tsconfig.json",
    specifier: "paths @chanmeng666/archlang",
    why: "the core is a peer dependency; in the monorepo it is the root's source, typechecking without a build",
  },
  {
    file: "packages/web-component/scripts/build.ts",
    specifier: "path dist/index.js",
    why: "the standalone build inlines the repo's built core, and refuses to build when it is missing or stale",
  },
  {
    file: "packages/web-component/scripts/build.ts",
    specifier: "path src",
    why: "freshness check: dist/ must be newer than every core source file, or the standalone would inline a stale compiler",
  },
  {
    file: "docs-site/sync-docs.mjs",
    specifier: "path dist/index.js",
    why: "the example pages are compiled at build time with the built core (what npm publishes), imported by file URL",
  },
  {
    file: "docs-site/three-d.mjs",
    specifier: "path packages/archlang-3d/src/replay/payload.ts",
    why: "reads the 3D preview's lines out of the package's source, so the site copy cannot drift from the package's PREVIEW_* constants",
  },
  {
    file: "docs-site/three-d.mjs",
    specifier: "path playground/src/share.ts",
    why: "reads the playground's own VIEW3D_FLAG constant, so the docs links open the 3D tab with the flag the playground parses",
  },
  {
    file: "playground/scripts/gen-static.mjs",
    specifier: "path dist/index.js",
    why: "the served default drawing and facts line are compiled with the built core, the same file the page loads",
  },
  {
    file: "playground/tsconfig.json",
    specifier: "include ../packages/archlang-3d/src/types/gltf-validator.d.ts",
    why: "archlang-3d ships no declaration for glTF-Validator; a playground test runs its CLI build, whose checks import it",
  },
  {
    file: "playground/vite.config.js",
    specifier: "path dist",
    why: "the config reads the built core's files to split them into the compiler chunk (scripts/core-files.mjs)",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "path dist",
    why: "hashes the built core's library files into the render version, so a core change without a version bump still re-keys the edge cache",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "path dist/index.js",
    why: "the Worker bundle's core entry, handed to the build as the alias target for @chanmeng666/archlang",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "path dist/cli/link.js",
    why: "the Worker bundle's link entry, the alias target for @chanmeng666/archlang/link",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "path dist/share.js",
    why: "the Worker bundle's share entry, the alias target for @chanmeng666/archlang/share",
  },
  {
    file: "packages/mcp-worker/scripts/build.mjs",
    specifier: "path packages/mcp/src/server.ts",
    why: "parses the stdio server's readResource(...) calls to bundle the same resource texts into the Worker",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias archlang",
    why: "every workspace's source resolves the core through this under vitest, to src/index.ts, so tests need no build and never see a stale dist/",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias archlang/share",
    why: "the playground modules import the share subpath by name; to src/share.ts, listed before the bare name (prefix match)",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias @chanmeng666/archlang",
    why: "the MCP shim and archlang-3d import the core by its published name; this runs their tests against src/",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias @chanmeng666/archlang/link",
    why: "the Node-only subpath, listed before the bare name since an alias also matches name/...; to src/cli/link.ts",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias @chanmeng666/archlang/share",
    why: "the mcp-worker imports the share subpath by its published name; to src/share.ts",
  },
  {
    file: "vitest.config.ts",
    specifier: "alias @chanmeng666/archlang-3d",
    why: "playground modules that playground tests read import archlang-3d by name; its source entry, as the Vite alias does",
  },
];

/** The doc table, header included, generated from ALLOW. */
export function seamTable(rows: readonly Seam[] = ALLOW): string {
  return [
    "| File | Specifier | Why |",
    "| --- | --- | --- |",
    ...rows.map((s) => `| \`${s.file}\` | \`${s.specifier}\` | ${s.why} |`),
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(seamTable());
