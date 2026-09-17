# Standing decisions & iron laws (never re-litigate)

> Moved verbatim from `AGENTS.md` (2026-09-18) so it loads on demand. Read it before proposing a design change, touching eval/dataset/release/hosting/brand, adding a language form, or writing any code that derives a position from geometry. `AGENTS.md` lists the one-line versions.

Permanent decisions distilled from the archived narrative and `docs/research/`. Settled — do not
re-propose, re-open, or contradict them anywhere.

- **T3 — the diagnostic-loop live experiment is PERMANENTLY DECLINED** (owner, 2026-07-12). Never
  trigger `eval-l2.yml` live, never re-propose it, and **never claim a net model-loop gain OR its
  absence** anywhere (loop-vs-equal-budget-resampling stays permanently unanswered). So L3/L4/L5 stay
  unbuilt and the intent channel's adjacency/reachability assertions stay **advisory (`gate: false`)
  permanently**; the L2 harness (`eval/l2.ts`, `eval/l2-run.ts`) is kept only as reference.
- **T6 — area-syntax sugar is PARKED** behind the frozen reversal triggers in
  `docs/research/2026-07-g2-verdict.md` (Gate G2 CLOSED, residual 0/8). No `area` token enters the
  grammar and unit suffixes deliberately exclude `m2` unless one of that doc's triggers fires; only
  the intent channel's assertion form ships for area.
- **Dataset contamination iron law** (`test/dataset.test.ts` enforces it permanently; getting it
  wrong voids the eval forever). The 26-brief eval corpus/goldens are a **private holdout, never
  published**; `dataset/` imports only `../src/index.js`, never `eval/`; every row is double-
  deduplicated (text + `describe()`) against the holdout. The canary GUID in `dataset/canary.ts` is
  hardcoded once and **NEVER regenerated** (a new value silently splits the corpus, defeating leakage
  probing). `repair`-split sources stay fully literal (`repair()` declines scripting).
- **Judge comparability** — never compare eval rates across a `JUDGE_VERSION` / `SYNONYMS_VERSION`
  change (it measures the ruler, not the model; judge v1→v2 moved intent 9%→50% with zero model
  change). Regenerate `eval/judge-fixture.json` **only** for an approved bump, **never to green a red suite**.
- **Releases are tokenless OIDC trusted publishing only** (`v*` tag push → `.github/workflows/release.yml`).
  **Never add an npm token** anywhere (an auth failure means "redo the npmjs trusted-publisher
  registration", not "add a token"); **never automate npmjs account / 2FA / publisher management**
  (human-with-2FA only); `package.json`'s `repository.url` owner must be **`ChanMeng666` byte-for-byte**
  (else provenance E422s). Recipe: `docs/npm-oidc-publishing-playbook.md`.
- **A `packages/mcp` prose-only change (a tool description, a README) publishes ONLY with a version
  bump** — and the bump must land in BOTH `packages/mcp/package.json` AND `packages/mcp/server.json`
  (both of `server.json`'s `version` fields). The release workflow resolves each package's declared
  version and `npm view`-skips the publish when that exact version already exists on the registry, so
  an unbumped description edit silently never reaches npm or the MCP registry. (v1.16.0's 0.2.0 → 0.2.1
  bump existed only to ship a refreshed `suggest` tool description.)
- **The GitHub Release body is sliced from `CHANGELOG.md` by `scripts/changelog-section.mjs`**, which
  scans from `## [<version>]` to the next `## ` heading — so section ORDER doesn't affect extraction: a
  release section placed ABOVE `[Unreleased]` still extracts correctly (v1.16.0 shipped that way).
  `[Unreleased]` is back on top (keep-a-changelog convention) and is where in-flight work — including
  infrastructure that ships no version of its own — is recorded until a release claims it.
- **Brand assets are byte-sacred.** `brand/archlang-logo-master.svg` is the one source; every variant
  is a **fill-swap only** (never re-trace/simplify/re-fit path data). The "Compile Boundary" brand
  token block is **duplicated byte-identically** in `docs-site/.vitepress/theme/style.css` and
  `playground/src/styles/tokens.css` (no shared import — change one, change the other).
- **`eval/rubric.md` policies are frozen** (blind-drafted, then approved) and **`npm run eval:live` is
  paid and owner-only** — the offline `npm run eval:ci` golden gate is what runs in CI.
- **Custom domain `archlang.uk` (Cloudflare DNS + Cloudflare Workers), live since 2026-07-15, moved off
  Vercel onto Workers static assets in 2026-09 with NO URL change.** Docs → `archlang.uk` (apex),
  playground → `playground.archlang.uk`. Three things a future agent must not get wrong: (1) the
  **Cloudflare Worker names** and npm **workspace names** are still `archlang-docs` /
  `archlang-playground` — those are NOT the URLs and must never be renamed to match the domain (a grep
  for them legitimately hits `package.json`/`wrangler.jsonc`/`deploy.yml`); (2) **the proxy rule
  INVERTED** — the records are now **proxied (orange cloud)**, because a Workers custom domain
  necessarily is one; the old iron law ("DNS only, never proxied — proxying breaks Vercel's SSL") was
  right for a Vercel origin and is superseded, so if you meet it in an archived doc, it is history;
  (3) because the zone is now proxied, Cloudflare CAN rewrite bytes and challenge clients, so Bot Fight
  Mode, Email Obfuscation, Rocket Loader and Browser Integrity Check must stay OFF or `scripts/smoke.mjs`
  and the nightly byte-equality staleness probe break. Neither Worker has a `main` script, which is what
  keeps every request a free, unmetered static-asset request. Full recipe (DNS, TLS, the `www` redirect
  rule's exact API shape, `_headers`, and how to change a public URL in code without the escaped-dot grep
  trap): `docs/hosting-and-domains.md` and [ADR 0019](../adr/0019-cloudflare-workers-hosting.md).
- **A generator's TEMPLATE can go stale even when `check:drift` is green.** The gate compares
  generator *output* to the committed file — it proves reproducibility, not correctness. A generator
  that hardcodes a language fact reproduces the same *wrong* text forever: `gen-llm-spec.ts` shipped a
  v1.12 CLI + no `strip` for three releases, and `gen-grammars.ts` hardcoded a number regex without the
  unit suffixes. **Derive from the source of truth (`KEYWORDS`/`RULES`/`buildManifest()`), never
  retype it**, and give each generator a guard that fails when a source-of-truth entry has no
  rendering (as `gen-llm-spec.ts` now does for every `KEYWORDS.control` entry, not just `element`).
- **Every new language form ships with a byte-identity law, pinned by test:** a plan that does not
  use it renders, describes and lints exactly as before. `site`, the door kinds, `zone`, `paper`,
  `polygon`, `arc`, `roof`, `void`, the v1.35 `height`/`sill`/`head` datum and the v1.35 `--view`
  all have one. Prove it with a SHA-256 sweep over the shipped examples, not by eyeballing — and if
  a golden moves, that is a finding to explain before it is a diff to bless. Take the baseline with
  the **same digest body the test will run**, not a lookalike in a throwaway script:
  `test/roof-void-byte-identity.test.ts`'s first attempt used a scratch script whose payload
  separator differed by one character and produced four "failures" over artifacts that were in fact
  byte-identical. And the sweep's payload is the whole agent-facing surface — SVG, `describe()`
  **and** `lint()` — because a form that quietly appends an empty key to every summary leaves the
  drawing untouched and is still a behaviour change for every `arch describe --json` consumer.
  (The corpus sweep carries no parse- or resolve-stage diagnostic, because `lint()` is the soundness
  layer alone — sweep 125, not 95, whenever a change can reach the resolver. `docs/testing.md`.)
- **A derived POSITION must come from the shape, never from its bounding box or centroid — this is a
  defect CLASS, not a bug.** Six instances shipped and were fixed in v1.25.0, every one of them SILENT
  (`arch lint` reported none): the room label point, the circulation routing anchor (a 10.9 m walk
  reported as 5.6 m), `dims auto` witness lines floating metres off a sloped facade, `swing into
  <room>`, `furniture … against wall`, and `windows[].facing` on a courtyard plan. **The grep that
  finds a new one is `room\.size`/`r\.size\.w` WITHOUT a nearby `r.poly` branch** — a room-shape
  consumer reading the box when the ring is the honest datum. The fix is always local and closed
  form: probe one wall thickness off each face and ask which side has floor (`pointInRoomBox` /
  `pointInPolygon`, both poly-aware), or use `polygonLabelPoint`. Never reach for the wall JOINERY to
  answer a `describe()` question — `describe()` never builds a Scene, and doing so drags the whole
  poché pipeline into a read meant to be cheap. (It no longer drags an optional dep with it: since
  v1.30 the joinery is zero-dependency, so the cost is time, not an install.) Full inventory,
  including what the sweep CLEARED and why, in
  [`docs/research/2026-08-06-competitor-borrowing-roadmap.md`](../research/2026-08-06-competitor-borrowing-roadmap.md) §9.1.
- **`prepublishOnly` runs the WHOLE monorepo suite, so the release job must build what that suite
  asserts.** `npm publish` → `prepublishOnly` = `npm run build && npm run test`, and `npm run test`
  includes `editors/vscode/test/stdio.test.ts`, which hard-fails under CI when the core is built but
  `editors/vscode/dist/server.js` is not. `npm run build` does not build that bundle, so
  `release.yml` builds it explicitly before publishing. **Do not "fix" a future occurrence by
  narrowing the gate** — building the artifact keeps it verified, narrowing it means nothing about
  the shipped bundle was checked. This cost v1.25.0 its first publish attempt (the tag was moved to
  the fixed commit; nothing had reached npm, so re-tagging was clean). It had never fired because
  that test post-dates v1.24.0, and CI's `builds` job runs `vscode:build:only` before the suite.
