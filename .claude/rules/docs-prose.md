---
paths:
  - "docs/**/*.md"
  - "README.md"
  - "CONTRIBUTING.md"
---

# Editing Markdown docs

Read the `(Sites)` entries of `docs/agents/gotchas.md` first: a bare `|` inside inline code in a
table cell breaks the docs build (write `\|`), ADR links outside `docs/adr/` are dead on the site, and
a plain `arch` fence compiles live (mark fragments `arch static`). Run `npm run docs:build` after any
`docs/*.md` edit. Release narrative belongs in `CHANGELOG.md` only.
