---
paths:
  - "src/cli.ts"
  - "src/cli/**"
  - "src/manifest.ts"
---

# Working on the `arch` CLI

Read the CLI section of `docs/agents/commands.md` (exit codes, manifest-rendered help, display-only
`--code`/`--severity` filters, bounded output) and the v1.17 invariants in
`docs/agents/verification.md`. A `src/manifest.ts` edit always moves `docs/cli-reference.md` —
regenerate with `npm run gen:cli`, never hand-edit.
