---
description: Add a tool to the ArchLang MCP server (stdio shim and hosted Worker) and register it in every place a tool is listed
---

# Add an MCP tool

A tool is one `server.registerTool` call plus the lists that name it. The list comes from commits
`b4874d9c` (`link`) and `6ccc282a` (`finish`, shim 0.2.23; the registry has since moved from
`server.ts` to `tools.ts`, `10253d7a`) and from the hosted Worker's `KNOWN_TOOLS` pin. The rules for the
area: `.claude/rules/mcp.md`. The shim ships through a version bump; the core change it wraps, if any,
lands first (`.claude/commands/release-check.md`).

## Steps, in dependency order

1. **The tool**: a `server.registerTool(name, { title, annotations: TOOL_ANNOTATIONS, description,
   inputSchema }, handler)` in `registerTools` (`packages/mcp/src/tools.ts`), next to its siblings. Wrap
   a handler that takes a plan in `hashingSource` (it reports `source_hash`), compile with
   `compile(source, { noCache: true })`, return `json({ ok, … })`, and make bad arguments an error
   result, never a throw. Arguments are zod, described, and optional unless the tool cannot run
   without them. The stdio shim and the Worker both call `registerTools`, so there is no second
   registration. Red without a description: `packages/mcp/test/instructions.test.ts` (no ADR numbers, no
   repo file names, no bare `arch <cmd>` in a description).
2. **The handshake**: when the tool belongs in the author loop, add it to `INSTRUCTIONS`
   (`packages/mcp/src/tools.ts`) at the position `skills/archlang/SKILL.md`'s loop gives it. Red when the
   order disagrees: `instructions.test.ts`.
3. **The hosted allow-list**: add the name to `KNOWN_TOOLS` (`packages/mcp-worker/src/app.ts`). Red
   without it: `packages/mcp-worker/test/worker.test.ts` ("lists the stdio tool set plus read_me").
   A tool with an argument that carries text is capped like `source` (`packages/mcp-worker/src/limits.ts`).
4. **The pinned lists in the shim's tests**: the sorted name list in `packages/mcp/test/server.test.ts`,
   the `{ name, params }` row in `packages/mcp/test/fuzz.test.ts` (and its "N tools" comment), and the
   tool count in `packages/mcp/test/mcpb-manifest.test.ts`. The MCPB manifest itself is derived from
   `tools/list`, never typed. Red without them: those three files.
5. **A test of the tool**: a case in `packages/mcp/test/tools.test.ts` for a firing call, a clean call
   and a malformed argument, through the real `Client` in `packages/mcp/test/helpers.ts`.
6. **The tables people read**: a row in `packages/mcp/README.md` § Tools and in `docs-site/mcp.md`
   § "What the tools do". Red without it: `packages/mcp/test/docs-tool-table.test.ts`, which compares
   both tables with `tools/list` and names the missing or extra tool. A command the tool wraps that has a CLI twin keeps the two in step
   (`.claude/commands/new-cli-flag.md`).
7. **Compatibility**: the tool's `inputSchema`/`outputSchema` are compared with the last published shim
   (`scripts/compat-check.mjs`, `test/release-compat.test.ts`, additive-only). A new tool passes; later,
   arguments are only added, optional. CI runs it with the registry reachable.
8. **The release fields**: `packages/mcp` changes ship only with a version bump in `package.json` AND
   both `server.json` version fields; `npm run release:pin` moves the range and the three fields
   together (`scripts/bump-lockstep.ts`). Red without it: `packages/mcp/test/lockstep.test.ts`.
9. **`CHANGELOG.md`**: an `### Added` line under `[Unreleased]`; regenerate with `npm run gen:all`
   if a generated block names the tool list (CI runs `npm run check:drift`).
10. **Prove it**: call the tool through the in-memory `Client` (the `tools.test.ts` case), then
    `npm run check:quick`, push, and read the PR's CI. The hosted Worker's behaviour is exercised by
    its own suite and by `scripts/smoke.mjs --site mcp` after a deploy.
