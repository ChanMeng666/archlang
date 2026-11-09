---
description: Add a flag to an `arch` command and register it in every place a flag is listed
---

# Add a CLI flag

A flag is declared in two tables that a drift test holds equal, read by one command, listed in a third
table that proves a test exercises it, and echoed in generated docs. The list comes from commit
`4caf30ed` (`--expected-hash`, five commands) and from `--import-root` (#601, `3731573d`, `12651cb6`).
Run the tests named below as the quickest way to learn which step you missed; each is cheap.
The rules for the area: `.claude/rules/cli.md`.

## Steps, in dependency order

1. **The parser entry**: a row in `FLAG_KEYS` (`src/cli/io.ts`: the long flag, its key on the parsed
   `Flags` type, its kind `string`/`number`/`boolean`) and the key on the `Flags` interface above it. A
   flag with a short alias takes a second row. Red without it: `test/cli-help.test.ts` (the parse table
   equals the manifest, both ways), and `tsc` where the key is read.
2. **The manifest entry**: `src/manifest.ts`, on every command that takes it (share a `ManifestFlag`
   constant across commands, as `EXPECTED_HASH_FLAG` does), with `arg` for a value-taking flag and a
   one-line `description`. Add or extend an `examples[]` entry when the flag changes how a command is
   used. Help is rendered from this table. Red without it: `test/cli-help.test.ts`; a flag
   declared on the wrong commands: `test/cli-manifest.test.ts` (it lists which commands take which
   global flags, as it does for `--import-root`).
3. **The behaviour**, in the command module under `src/cli/` (`commands-author.ts`,
   `commands-analyze.ts`, …). Write through `CliIo` only (`io.stdout`, `io.stderr`, `io.env`,
   `io.cwd()`); a bare `process.*` goes red in `test/cli-io-seam.test.ts`. A flag that acts before any
   command runs is handled in `src/cli.ts` once (the way `--import-root` is). A new exit code is
   added to `EXIT` and to the manifest's exit-code table. Every exit still goes through `exitFlushed()`.
4. **A test that exercises the flag**: pass it to the command and assert its effect, through
   `runArch` (`test/helpers/cli.ts`). Then point the flag's row in `test/tables/cli-flags-exercised.ts`
   at that file. Red without the row: `test/cli-flag-matrix.test.ts` (every manifest pair needs a path
   or a `TODO: <reason>` row, and the TODO count only goes down).
5. **A new diagnostic code** the flag can raise: its catalogue entry with a firing example
   (`src/error-catalog/<family>.ts`; `test/error-catalog-examples.test.ts`).
6. **MCP parity**: when the flag is also something a tool should accept (a write-back guard, an import
   root), add the argument to the tool in `packages/mcp/src/tools.ts` and its row in the README table;
   see `.claude/rules/mcp.md`. No test pairs a flag with a tool argument, so say in the PR that you
   checked. A tool argument is additive and optional (the compat gate reads it).
7. **Hand-written docs that show the flag**: a doc that carries `arch <command> --flag` must be listed
   in `DOCS` in `test/docs-flags.test.ts`, or the gate never reads it; every flag it names must be
   declared. Skills that show the command (`skills/archlang*/SKILL.md`) are generated or gated too
   (`.claude/rules/generated-artifacts.md`).
8. **Regenerate**: `npm run gen:all` (`docs/cli-reference.md`, `llms-full.txt`, `spec.llm.md`'s CLI
   block and `src/context-size.ts` all move with a manifest edit); never hand-edit them. Red without it:
   CI runs `npm run check:drift`. `spec.llm.md` has a 30,000-unit cap (`docs/agents/gotchas.md`).
9. **`CHANGELOG.md`**: an `### Added` line under `[Unreleased]`.
10. **Prove it through the CLI** on a plan that uses the flag and on one that does not (the latter must
    not move), then `npm run check:quick`, push, and read the PR's CI.
