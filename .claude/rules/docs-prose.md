---
paths:
  - "docs/**/*.md"
  - "README.md"
  - "CONTRIBUTING.md"
---

# Editing Markdown docs
- A bare `|` inside inline code in a table cell breaks the docs build — write `\|`
  (`test/docs-table-pipes.test.ts`).
- A plain `arch` fence on a published page compiles live in the reader's browser; mark fragments and
  error demos `arch static` (`test/docs-fences.test.ts`).
- ADRs are copied flat to the site, so a link from `docs/adr/` to anything outside it is dead — cite
  the path as inline code. Run `npm run docs:build` after any `docs/*.md` edit.
- Quote a dimension with its convention (centreline `bbox` vs `bbox_outer`) or a tilde; settle it with
  `arch describe <file> --json --select bbox,bbox_outer`. Deliberately not gated. Release
  narrative goes in `CHANGELOG.md` only.
- **`docs-site/sync-docs.mjs` copies `docs/*.md` and root artifacts into the site** (gitignored
  there). Edit the repo-root source, never the copy.
