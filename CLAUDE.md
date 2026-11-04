# CLAUDE.md

@AGENTS.md

- Prove a change through the CLI (`arch compile|describe|lint --json`), not by eyeballing SVG.
- Local gate is exactly `check:quick` (+ `docs:build` for docs), then push. `check`, drift,
  `typecheck:all`, vitest runs, e2e and bench are CI's; only CI green is merge evidence. A hook
  blocks them (`.claude/hooks/local-gate.mjs`). Executor briefs list only the local gate.
  Packaging that needs the primary checkout stays local.
- Commit or push only when asked. This file asserts no project fact — those go in `AGENTS.md`.
