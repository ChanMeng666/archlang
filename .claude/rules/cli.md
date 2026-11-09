---
paths:
  - "src/cli.ts"
  - "src/cli/**"
  - "src/manifest.ts"
---

# Working on the `arch` CLI
- Exit codes: `0` ok · `2` user-source error · `1` IO/internal · `3` bad usage · `4` stale source (`--expected-hash`). An undeclared flag or
  unknown verb exits 3 with a did-you-mean — never swallowed as a filename.
- Help is rendered from `src/manifest.ts`; each command declares its exact flags and at least one
  `examples[]` entry, and a drift test pins the manifest against `FLAG_KEYS` (`src/cli/io.ts`).
- `--code`/`--severity`/`--select`/`--room` are DISPLAY filters: `ok` and the exit code come from the
  unfiltered set. Narrowing lives in `src/cli/commands-analyze.ts`, never in `describe()`/`lint()`.
- **Every CLI exit goes through `exitFlushed()` (`src/cli.ts`, reached via `finish()`).** A bare
  `process.exit` after a large stdout write truncates the output on a pipe (Node 22 on Linux cut
  `context --json` at ~145 KB). `test/cli-flush.test.ts` discriminates only on Linux: Windows pipes
  drain in time, so a green local Windows run proves nothing about a new exit path.
- A manifest edit moves `docs/cli-reference.md` and `llms-full.txt` — `npm run gen:all` (`gen:llms`
  measures the bundle size the `context` help states, then `gen:cli`), never hand-edit.
- Commands and helpers write through `CliIo` (`io.stdout`/`stderr`/`readStdin()`/`env`/`cwd()`);
  only `nodeIo()`, the `--install` banner and `makeNodeWorld`'s default root touch the process,
  allow-listed in `test/cli-io-seam.test.ts`. Tests run the CLI with `runArch`
  (`test/helpers/cli.ts`), not a spawn.
- **The PNG backend is Node-only and async**; keep `node:*` imports lazy so the module stays
  browser-safe.
- **CJK text in PDF/PNG**: the face from `@chanmeng666/archlang-font-cjk` is registered only when a
  drawn string needs it, which keeps every non-CJK PDF/PNG byte-identical. Loading it
  unconditionally moves every PDF golden — a finding, not a re-pin.
- A new flag is five places, none optional: its `FLAG_KEYS` row (`src/cli/io.ts`), the command that reads
  it, its `src/manifest.ts` entry (only a declared flag is accepted, and `docs-flags` fails on a hand
  doc that writes an undeclared one), its row in `test/tables/cli-flags-exercised.ts` (the
  `cli-flag-matrix` test), and `npm run gen:all`. A hand-written doc that shows `arch <cmd> --flag` must
  be listed in `DOCS` in `test/docs-flags.test.ts`, or the gate never reads it. A flag that is also a
  tool argument of the MCP server needs the same argument in `packages/mcp/src/tools.ts`
  (`.claude/rules/mcp.md`); no test pairs the two. The checklist: `.claude/commands/new-cli-flag.md`.
