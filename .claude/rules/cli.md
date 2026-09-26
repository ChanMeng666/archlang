---
paths:
  - "src/cli.ts"
  - "src/cli/**"
  - "src/manifest.ts"
---

# Working on the `arch` CLI

- Exit codes: `0` ok · `2` user-source error · `1` IO/internal · `3` bad usage. An undeclared flag or
  unknown verb exits 3 with a did-you-mean — never swallowed as a filename.
- Help is rendered from `src/manifest.ts`; each command declares its exact flags and at least one
  `examples[]` entry, and a drift test pins the manifest against `FLAG_KEYS` (`src/cli/io.ts`).
- `--code`/`--severity`/`--select`/`--room` are DISPLAY filters: `ok` and the exit code come from the
  unfiltered set. Narrowing lives in `src/cli/commands-analyze.ts`, never in `describe()`/`lint()`.
- A manifest edit moves `docs/cli-reference.md` — `npm run gen:cli`, never hand-edit.
