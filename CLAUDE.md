# CLAUDE.md

@AGENTS.md

- Prove a change through the CLI (`arch compile|describe|lint --json`), not by eyeballing SVG.
- Local floor: `check:quick` (changed files; under a minute), then push. Never run the full suite
  locally: CI runs `check`, every platform and e2e, and only CI green is merge evidence. Add
  `docs:build` for docs; builds and packaging that need the primary checkout stay local.
- Commit or push only when asked. This file asserts no project fact — those go in `AGENTS.md`.
