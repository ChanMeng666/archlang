---
paths:
  - "docs-site/**"
  - "playground/**"
  - "brand/**"
---

# Working on the brand or either public site

- Both sites are LIGHT only: no dark mode, no `.dark` rule; keep `appearance: false` and
  `color-scheme: only light` (ADR 0014).
- `brand/archlang-logo-master.svg` is byte-sacred; every variant is a fill-swap, never a re-trace.
- The brand token block is byte-identical in `docs-site/.vitepress/theme/style.css` and
  `playground/src/styles/tokens.css`; the `--syn-*` palette also lives in `scripts/gen-grammars.ts` and
  the `archlangLight` Shiki theme — change every copy, then `npm run gen:grammars`
  (`test/site-lockstep.test.ts`).
- Crawlers see static bytes only (`docs/seo.md`); `_headers` rules bind to the request path.
  Restart `vitepress preview` after every build before measuring anything.
- The playground has a Worker (`playground/worker/`, ADR 0034) for `/s/*` and `/api/*` only; every
  other path stays a byte-identical static asset (`scripts/playground-static-sweep.mjs`, `scripts/smoke.mjs`).
  A short link stores a plan only when the user asks for one. The docs Worker has no `main` script
  (`docs/agents/iron-laws.md`, hosting).
