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
- The playground opens in view mode: the drawing first, the header at ≤ 5 controls (the brand's
  two links are its name, not controls), the editor and compiler lazy
  (`e2e/startup-chunks.baseline.json`). A plain visit compiles nothing at boot (the drawing and
  `#planData` are in the HTML); renders compile in `src/compile-worker.ts`, the page the fallback.
  Hash flags `&edit` and `&3d` follow the `#z=`/`#src=` token; a copied link keeps `&3d`, never
  `&edit`.
- The 3D pictures on the sites (`docs-site/public/3d/`) come only from `npm run gen:3d-assets`;
  they change only when what they show changes (`packages/archlang-3d/DEVELOPMENT.md`).

## Traps
- **VitePress `.vp-doc a:hover` (0,2,1) outranks a two-class rule (0,2,0).** A control whose colour
  must survive hover re-asserts `color` in its own `:hover` rule. Check hover/focus/active states.
- **A fixed hex in the site CSS is a fossil** — convert it to a token. The one legitimate literal is
  the CodeMirror lint squiggle's data-URI hex (a `var()` cannot enter an SVG data URI).
- **Changing a public host**: grep the host prefix without dots (`archlang-playground`), because some
  references are regexes with escaped dots. Schema `$id`s live in `src/plan-json.ts`/`src/intent.ts`
  (regenerate with `gen:*-schema`), agent-context URLs in `skills/archlang/SKILL.md` (`gen:llms`).
- **SEO** (`docs/seo.md`): crawlers execute no JavaScript, so only static bytes count; the
  killed-claim regexes on `PAGE_META`/`EXAMPLE_ROWS` are never widened — fix the copy; `/embed.html`
  is de-indexed by an `X-Robots-Tag` header, not a `robots.txt` Disallow; `_headers` binds to the
  request path, so `/` and `/index.html` each need their own rule.
- **`vitepress preview` caches its file index at startup.** Symptom: after a rebuild the page is 200
  but its hashed CSS 404s, and every measurement reads plausible and wrong. Restart the preview after
  every build, give a measurement server its own port (a parallel worktree may hold the fixed one),
  and gate on a marker only the new build has, never a status code.
- **`check:quick` picks the nearest tests**, so `docs-page-meta`, `docs-sync-list`, `docs-fences`
  and `docs-topics` may run only in CI for a docs-site PR; read its CI before calling it green.
- **Cloudflare static assets answer a `Range` request with 200, not 206**, so an MP4 may not play
  on Safari: every replay on the sites keeps its poster and an MP4 link as the fallback.
- **The playground's startup budget is a sum, not a per-PR limit**: ordinary core growth reaches it
  eventually. Confirm no 3D marker is in the chunks, then re-take `playground/e2e/startup-chunks.baseline.json`
  with the reason in the commit. The budget stays.
