---
paths:
  - "packages/mcp/**"
  - "packages/mcp-worker/**"
---

# Working on the MCP shim and the hosted Worker

`packages/mcp` is the stdio server (`@chanmeng666/archlang-mcp`); `packages/mcp-worker` is the hosted
Streamable-HTTP server at `mcp.archlang.uk` (ADR 0026). Checklist for a new tool:
`.claude/commands/new-mcp-tool.md`.

- **One registry, two transports.** Tools are defined once in `registerTools` (`packages/mcp/src/tools.ts`);
  `packages/mcp/src/server.ts` and `packages/mcp-worker/src/server.ts` both call it. The Worker adds only
  `read_me` and the viewer. A tool compiles with `compile(source, { noCache: true })`, as every existing
  one does, and returns an error result for bad arguments, never a throw.
- **The tool list is named in several places**, and each is pinned: `KNOWN_TOOLS`
  (`packages/mcp-worker/src/app.ts`, the telemetry allow-list, held to `tools/list` by
  `packages/mcp-worker/test/worker.test.ts`), the tool table of `packages/mcp/README.md` (the registry
  search matches names, `packages/mcp/test/server.test.ts`), the MCPB manifest (derived from
  `tools/list` by `packages/mcp/scripts/build-mcpb.ts`, `mcpb-manifest.test.ts`), the argument table in
  `packages/mcp/test/fuzz.test.ts` and the sorted name list in `server.test.ts`. The tool table in
  `docs-site/mcp.md` is hand-written and no test reads it: update it with the README's.
- **Tool schemas are additive-only against the last published shim** (`scripts/compat-check.mjs`, run in
  the suite by `test/release-compat.test.ts`; it needs the npm registry and fails under `CI` offline). A
  removed or retyped argument needs a `BREAKING: mcp-schemas: item` line under `[Unreleased]` and a
  major; add arguments as optional.
- **Lockstep.** A `packages/mcp` change ships only with a version bump in `package.json` AND both
  `server.json` version fields; the core dependency range stays `^<core version>`
  (`packages/mcp/test/lockstep.test.ts`). `npm run release:pin` (`scripts/bump-lockstep.ts`) rewrites the
  range, the shim version, both `server.json` fields and the lock entry from the core version; run it
  after the root bump, then let the lockstep tests verify. The shim's baked resources refresh only on a
  bump, and a shim must still load on a core older than its release (`older-core.test.ts`).
- **The hosted caps count bytes and requests, never a clock**, and are checked before any compile work
  (`packages/mcp-worker/src/limits.ts`): `SOURCE_CAP_BYTES` per argument, a body cap, the `/svg/<payload>`
  cap, per-address rate bindings that `wrangler.jsonc` and a test hold to the same numbers. The precise
  abuse guard is a zone WAF rule in the Cloudflare dashboard that the repository cannot show
  (`docs/agents/orchestration.md`). A new argument that carries text is capped like `source`.
- Build and package the shim only in the primary checkout, after root `npm run build`
  (`.claude/rules/release-and-packages.md`).
