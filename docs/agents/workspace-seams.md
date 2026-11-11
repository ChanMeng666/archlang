# Workspace seams

The seam allow-list between workspaces and the core; the pipeline and conventions are in
[`architecture.md`](architecture.md), the modules in [`module-map.md`](module-map.md).

## Seams between workspaces and the core

The root `exports` map has only `.` and `./link`, yet workspaces reach past it. Each reach by relative
path, alias, `paths`/`include` entry or built file path into a `src/` or `dist/` of the core or another
workspace is a row in `ALLOW` (`test/workspace-seams.allow.ts`, the source of truth: a new one fails, a
stale row fails, test code is not scanned). This table is generated from it
(`npx tsx test/workspace-seams.allow.ts`) and pinned row for row. `test/core-no-3d.test.ts` pins the
other direction: `src/` never imports `archlang-3d` or `three`.

| File | Specifier | Why |
| --- | --- | --- |
| `playground/src/glb-export.ts` | `../../packages/archlang-3d/src/glb/write.js` | writeGlb is exported only from archlang-3d's Node entry, but the writer is browser-agnostic; read from source |
| `playground/tsconfig.json` | `paths archlang` | mirrors the Vite alias: a root node_modules/archlang symlink points at the vscode extension |
| `playground/tsconfig.json` | `paths archlang/review` | types for the review sheet come from src/: the build emits no declaration for dist/cli/review.js |
| `playground/tsconfig.json` | `paths archlang/share` | the share-link subpath read from src/share.ts: Playwright resolves tsconfig paths at run time for the specs that import share.ts in Node, where a .d.ts would load as an empty module |
| `playground/tsconfig.json` | `paths @chanmeng666/archlang-3d` | mirrors the Vite alias: archlang-3d is read from source, its published exports name a dist/ that may not be built |
| `playground/tsconfig.json` | `paths @chanmeng666/archlang-3d/browser` | the browser entry is a second exports subpath of archlang-3d whose dist/ may not be built; without this mapping tsc cannot resolve what the Vite alias serves |
| `playground/vite.config.js` | `alias archlang` | the playground consumes the built core (dist/index.js), keeping one import path |
| `playground/vite.config.js` | `alias archlang/review` | Checks overlay reads the review sheet, a CLI file with no export; listed before the bare name (prefix match) |
| `playground/vite.config.js` | `alias archlang/share` | the share-link decoder, the core's ./share export, built (dist/share.js); listed before the bare name (prefix match) |
| `playground/vite.config.js` | `alias @chanmeng666/archlang` | archlang-3d imports the core by its published name; same built file so the lazy chunk shares the core |
| `playground/vite.config.js` | `alias @chanmeng666/archlang-3d` | archlang-3d is read from source: its published exports name a dist/ the build has no reason to need |
| `playground/vite.config.js` | `alias @chanmeng666/archlang-3d/browser` | the browser entry of archlang-3d, from source; longer key first |
| `playground/wrangler.jsonc` | `alias archlang` | the short-link Worker bundles the built core by name |
| `playground/wrangler.jsonc` | `alias archlang/share` | the short-link Worker reads its caps and inflater from the core's ./share export, the built dist/share.js |
| `docs-site/.vitepress/config.ts` | `alias archlang` | examples compile client-side against the built core, the same alias the playground uses |
| `docs-site/.vitepress/config.ts` | `alias archlang/share` | the widget's Open in playground link takes base64url and the edit flag from the core's ./share export; listed before the bare name (prefix match) |
| `docs-site/tsconfig.json` | `paths archlang` | mirrors the VitePress alias to the built core |
| `docs-site/tsconfig.json` | `paths archlang/share` | mirrors the VitePress alias to the built share subpath |
| `packages/archlang-3d/vitest.e2e.config.ts` | `alias @chanmeng666/archlang` | heavy e2e tests run against the core's source, as the root vitest config does |
| `packages/mcp-worker/scripts/build.mjs` | `alias @chanmeng666/archlang` | the Worker bundles THIS checkout's built core, so a stale installed core cannot ship |
| `packages/mcp-worker/scripts/build.mjs` | `alias @chanmeng666/archlang/link` | the Worker imports the Node-free link helper by its exports name; the alias pins it to this checkout's dist/cli/link.js, so an installed core cannot supply a different encoder than the one the render version hashes |
| `packages/mcp-worker/scripts/build.mjs` | `alias @chanmeng666/archlang/share` | the Worker decodes /svg/ payloads with the core's ./share export; the alias pins it to this checkout's dist/share.js, like /link |
| `packages/mcp-worker/scripts/measure-cpu.mjs` | `../../../src/cli/share-codec.mjs` | CPU measurement script encodes a plan hash; the Node share-link encoder is a core CLI file with no package export (the browser-safe decoder is ./share) |
| `packages/mcp-worker/src/env.d.ts` | `../../mcp/src/tools.js` | types the virtual:archlang-resources module by the stdio server's ResourceName |
| `packages/mcp-worker/src/server.ts` | `../../mcp/src/tools.js` | the hosted server serves the stdio server's tool set, so it registers the same tools from source (mcp is not published as a library) |
| `packages/mcp-worker/tsconfig.json` | `paths @chanmeng666/archlang` | types come from the same built core that scripts/build.mjs bundles |
| `packages/mcp-worker/tsconfig.json` | `paths @chanmeng666/archlang/link` | tsc must type the Worker's /link import from the same build the bundler inlines (scripts/build.mjs), not an installed copy that could differ |
| `packages/mcp-worker/tsconfig.json` | `paths @chanmeng666/archlang/share` | types the Worker's ./share import from the same build the bundler inlines, as for /link |
| `packages/mcp/scripts/gen-capabilities.ts` | `../../mcp-worker/src/limits.js` | the capabilities resource states the hosted caps from the Worker's own constants, not a retyped copy |
| `packages/mcp/scripts/gen-capabilities.ts` | `../../mcp-worker/src/server.js` | the capabilities resource lists the tools only the hosted server adds, read off createHostedServer's tools/list |
| `packages/mcp/scripts/tsconfig.gen.json` | `paths @chanmeng666/archlang` | gen:mcp-capabilities runs the tool registry under tsx with the core's source, as the root vitest alias does, so check:drift needs no build |
| `packages/mcp/scripts/tsconfig.gen.json` | `paths @chanmeng666/archlang/share` | the Worker's limits, which gen:mcp-capabilities reads, import the core's ./share; resolved to its source as the root vitest alias does |
| `packages/web-component/tsconfig.json` | `paths @chanmeng666/archlang` | the core is a peer dependency; in the monorepo it is the root's source, typechecking without a build |
| `packages/web-component/scripts/build.ts` | `path dist/index.js` | the standalone build inlines the repo's built core, and refuses to build when it is missing or stale |
| `packages/web-component/scripts/build.ts` | `path src` | freshness check: dist/ must be newer than every core source file, or the standalone would inline a stale compiler |
| `docs-site/sync-docs.mjs` | `path dist/index.js` | the example pages are compiled at build time with the built core (what npm publishes), imported by file URL |
| `docs-site/three-d.mjs` | `path packages/archlang-3d/src/replay/payload.ts` | reads the 3D preview's lines out of the package's source, so the site copy cannot drift from the package's PREVIEW_* constants |
| `docs-site/three-d.mjs` | `path playground/src/share.ts` | reads the playground's own VIEW3D_FLAG constant, so the docs links open the 3D tab with the flag the playground parses |
| `playground/scripts/gen-static.mjs` | `path dist/index.js` | the served default drawing and facts line are compiled with the built core, the same file the page loads |
| `playground/tsconfig.json` | `include ../packages/archlang-3d/src/types/gltf-validator.d.ts` | archlang-3d ships no declaration for glTF-Validator; a playground test runs its CLI build, whose checks import it |
| `playground/vite.config.js` | `path dist` | the config reads the built core's files to split them into the compiler chunk (scripts/core-files.mjs) |
| `packages/mcp-worker/scripts/build.mjs` | `path dist` | hashes the built core's library files into the render version, so a core change without a version bump still re-keys the edge cache |
| `packages/mcp-worker/scripts/build.mjs` | `path dist/index.js` | the Worker bundle's core entry, handed to the build as the alias target for @chanmeng666/archlang |
| `packages/mcp-worker/scripts/build.mjs` | `path dist/cli/link.js` | the Worker bundle's link entry, the alias target for @chanmeng666/archlang/link |
| `packages/mcp-worker/scripts/build.mjs` | `path dist/share.js` | the Worker bundle's share entry, the alias target for @chanmeng666/archlang/share |
| `packages/mcp-worker/scripts/build.mjs` | `path packages/mcp/src/server.ts` | parses the stdio server's readResource(...) calls to bundle the same resource texts into the Worker |
| `vitest.config.ts` | `alias archlang` | every workspace's source resolves the core through this under vitest, to src/index.ts, so tests need no build and never see a stale dist/ |
| `vitest.config.ts` | `alias archlang/share` | the playground modules import the share subpath by name; to src/share.ts, listed before the bare name (prefix match) |
| `vitest.config.ts` | `alias @chanmeng666/archlang` | the MCP shim and archlang-3d import the core by its published name; this runs their tests against src/ |
| `vitest.config.ts` | `alias @chanmeng666/archlang/link` | the Node-only subpath, listed before the bare name since an alias also matches name/...; to src/cli/link.ts |
| `vitest.config.ts` | `alias @chanmeng666/archlang/share` | the mcp-worker imports the share subpath by its published name; to src/share.ts |
| `vitest.config.ts` | `alias @chanmeng666/archlang-3d` | playground modules that playground tests read import archlang-3d by name; its source entry, as the Vite alias does |
