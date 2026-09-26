# Standing decisions & iron laws (never re-litigate)

Owner decisions and laws that no test fully states. Do not re-propose, re-open or contradict them.

## Eval & dataset

- **T3 (the diagnostic-loop live experiment) is permanently declined.** Never trigger `eval-l2.yml`
  live, never re-propose it, never claim a model-loop gain or its absence. L3–L5 stay unbuilt; the
  intent channel's adjacency/reachability assertions stay advisory (`gate: false`); `eval/l2*.ts` is
  reference only.
- **T6 (area-syntax sugar) is parked**: no `area` token and no `m2` unit suffix unless one of the
  frozen G2 reversal triggers fires (archived as `research/2026-07-g2-verdict.md` in the
  archcanvas-growth docs archive). Area ships only as an intent-channel assertion.
- **Dataset contamination** (`test/dataset.test.ts`): the eval corpus/goldens are a private holdout,
  never published; `dataset/` imports only `../src/index.js`, never `eval/`; rows are deduplicated
  against the holdout by text and `describe()`; the canary GUID in `dataset/canary.ts` is never
  regenerated; `repair`-split sources stay fully literal.
- **Judge comparability**: never compare eval rates across a `JUDGE_VERSION`/`SYNONYMS_VERSION`
  change. Regenerate `eval/judge-fixture.json` only for an approved bump, never to green a suite.
- **`eval/rubric.md` is frozen; `npm run eval:live` is paid and owner-only.** CI runs `eval:ci`.

## Releases

- **Tokenless OIDC trusted publishing only** (`v*` tag → `release.yml`). Never add an npm token; an
  auth failure means redo the npmjs trusted-publisher registration. Never automate npmjs account,
  2FA or publisher management (human only). `repository.url`'s owner must be `ChanMeng666`
  byte-for-byte or provenance fails with E422. Recipe: `docs/npm-oidc-publishing-playbook.md`.
- **A `packages/mcp` change — even prose — publishes only with a version bump** in
  `packages/mcp/package.json` AND both `server.json` `version` fields; `release.yml` skips a version
  already on npm.
- **`prepublishOnly` runs the whole monorepo suite**, including the VS Code bundle test, so
  `release.yml` builds that bundle before publishing. Never "fix" that by narrowing the gate.
- **The GitHub Release body is sliced from `CHANGELOG.md`** by `scripts/changelog-section.mjs`
  (`## [<version>]` to the next `## `). `[Unreleased]` stays on top.

## Brand & hosting

- **Brand assets are byte-sacred.** `brand/archlang-logo-master.svg` is the one source; every
  variant is a fill-swap only. The brand token block is duplicated byte-identically in both sites
  (`test/site-lockstep.test.ts`).
- **Both sites are light-only** (ADR 0014). No dark mode, no dark surface.
- **Hosting is Cloudflare Workers static assets** (ADR 0019, `docs/hosting-and-domains.md`): docs at
  `archlang.uk`, playground at `playground.archlang.uk`. The Worker and workspace names
  `archlang-docs`/`archlang-playground` are not URLs — never rename them. The DNS records are
  proxied (a Workers custom domain must be). Bot Fight Mode, Email Obfuscation, Rocket Loader and
  Browser Integrity Check stay OFF, or the smoke test and the nightly byte-equality probe break.
  Neither Worker has a `main` script.

## Language & geometry

- **A generator's template can go stale while `check:drift` is green** — the gate proves
  reproducibility, not correctness. Derive from `KEYWORDS`/`RULES`/`buildManifest()`, never retype,
  and give each generator a guard that fails when a source-of-truth entry has no rendering.
- **Every new language form ships a byte-identity law, pinned by test**: a plan not using it
  renders, describes and lints exactly as before. Prove it with a SHA-256 sweep whose payload is SVG
  + `describe()` + `lint()` (add `compile().diagnostics` when the resolver is reachable), taking the
  baseline with the test's own digest body. A moved golden is a finding to explain first.
- **A derived position comes from the shape, never its bounding box or centroid.** This is a defect
  class that `arch lint` cannot see. The grep that finds a new instance: `room\.size`/`r\.size\.w`
  without a nearby `r.poly` branch. Fix locally: probe one wall thickness off each face and ask
  which side has floor (`pointInRoomBox`/`pointInPolygon`), or use `polygonLabelPoint`. Never build
  the wall joinery to answer a `describe()` question.
