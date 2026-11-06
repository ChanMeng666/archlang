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
- Every way in (ChatGPT app, claude.ai connector, agent prompt, VS Code, playground) lives once in
  `site-shared/doors.json`; `npm run gen:doors` writes the "Try it" blocks into the READMEs and
  `llms.txt`, and `test/site-doors.test.ts` fails on any retyped URL. Copy rules and the plan:
  `docs/plans/public-surfaces/` (PS-D1 bans, PS-D12 3D line).
- The playground opens in view mode: the drawing first, the header at ≤ 5 controls, the editor and
  compiler lazy (`e2e/startup-chunks.baseline.json`). Hash flags `&edit` and `&3d` follow the
  `#z=`/`#src=` token; a copied link keeps `&3d`, never `&edit`.
- The 3D pictures on the sites (`docs-site/public/3d/`) come only from `npm run gen:3d-assets`;
  they change only when what they show changes (`packages/archlang-3d/DEVELOPMENT.md`).
