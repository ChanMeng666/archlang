# CLAUDE.md

@AGENTS.md

- Prove a change through the CLI (`arch compile|describe|lint --json`), not by eyeballing SVG.
- Floor: `check` + `check:drift`; add `typecheck:all` outside `src/` (incl. `test/`), `docs:build`
  for docs, `e2e:playground`/`e2e:docs` for the apps (build first).
- Commit or push only when asked. This file asserts no project fact — those go in `AGENTS.md`.
