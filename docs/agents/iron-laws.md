# Standing decisions & iron laws (never re-litigate)

Owner decisions and laws that no test fully states. Do not contradict them or re-open them outside
the process below. A change to one is proposed in a PR, recorded as a decision with its reverse-if in the owning
programme's README §3, marked *awaiting ratification* until the owner ratifies it in words, and
listed in the stage report (`docs/plans/plan-soundness/README.md` D18).

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
  Its `lintWarnings` counts are a side count, not a judgment: a lint PR whose new rule fires on an
  eval golden bumps that count with a per-row reason in the PR body and touches no field other than
  `lintWarnings` (plan-soundness D19, ratified 2026-10-27). A judgment field moves only under a
  ratified D-entry named in the row's fixture `notes` (D25: three goldens recorded as failing), and
  the offline `eval:ci` gate compares every golden with the fixture, never requires all to pass, and
  prints how many are recorded as failing (`fixtureVerdict`, `eval/run.ts`; D25's gate bullet,
  ratified 2026-10-27).
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
- **`archlang-mcp` (`packages/mcp-worker`, ADR 0026) is the third Worker and the only scripted
  ArchLang one** (the Cloudflare account also holds an unrelated scripted Worker, `sunostats`, which
  shares the Workers Paid caps): its own deploy job, served at `mcp.archlang.uk`; DNS and the
  Workers plan are owner-only. A site never gains a `main` to share its work.
- **The hosted MCP spend bound is three things**: `limits.cpu_ms`, the account's USD 10 billing
  budget alert, and the zone WAF rule `mcp abuse guard` (100 requests per 10 s per IP to any path on `mcp.archlang.uk`). The
  Worker's own rate-limit bindings are best-effort and are not part of the bound. The rule lives in
  the Cloudflare dashboard, not in the repository.

## Language & geometry

- **The modelling range is 2^25 mm** (`MODEL_RANGE_MM`, `docs/adr/0022-exact-decisions-and-bounded-input.md`):
  past it an element is `E_OUT_OF_RANGE`. Do not widen it to suit an input.
- **Budgets are counts, never time, and every input returns a diagnostic**, never a hang or a throw
  (`E_STEP_LIMIT`, `E_DRAWING_LIMIT`). Never replace one with a wall-clock timeout.
- **A `lint()` diagnostic's `message` names things the way a person would** (rooms by label, doors
  by the rooms they join, walls by kind and the line they run on) and never quotes an element id;
  ids live only in `hint`. A consumer may show `message` to someone who never sees the source,
  while an agent edits by the id in the hint. A room with no label is named by its use or its place
  (`src/naming.ts`, shared by `lint()`, `taste()` and the `W_ROOM_OVERLAP` compile warning).
  `test/lint-messages-id-free.test.ts` holds it over the whole corpus, the catalogue examples and a
  label-stripped twin of each; `test/lint-fix-texts.test.ts` holds the wording of the codes it covers.
- **Circulation**: furniture within R + δ of a doorway's face reads the room `blocked` (kept; no one can
  stand in the doorway). There is no far-seed stamp: routes start and rooms are reached on the
  room's floor, and a door's width lives only on the cells its carve opened.
- **The `spec.llm.md` size cap is raised only after provable duplication is trimmed**; the rules are
  in `test/llm-spec-drift.test.ts`.

- **ArchLang is plan-first: it draws 2D plans only** (ADR 0021,
  `docs/adr/0021-plan-first-view-deprecated.md`). The axonometric view (`src/view/`, `--view`) is
  deprecated: fix nothing in it, promote it nowhere. It is deleted at the next major together with
  `while`/reassignment, and that deletion is already prepared (see `docs/backlog.md`) — rebase it,
  don't redo it. Heights are data (`describe()`, Plan JSON, a future data export such as IFC), never
  a drawing.
- **A generator's template can go stale while `check:drift` is green** — the gate proves
  reproducibility, not correctness. Derive from `KEYWORDS`/`RULES`/`buildManifest()`, never retype,
  and give each generator a guard that fails when a source-of-truth entry has no rendering.
- **Every new language form ships a byte-identity law, pinned by test**: a plan not using it
  renders, describes and lints exactly as before. Prove it with a SHA-256 sweep whose payload is SVG
  + `describe()` + `lint()` (add `compile().diagnostics` when the resolver is reachable), taking the
  baseline with the test's own digest body. A moved golden is a finding to explain first.
- **A drawing change never moves `describe()`, and moves `lint()` only through its drafting-layer
  rules** (ADR 0032; owner decision taken by delegation, `docs/plans/plan-soundness/README.md` § 3
  D17/D18). `W_ANNOTATION_OVERLAP` and `W_TITLE_OVERFLOW` (PS2.12,
  `src/lint/rules/annotations.ts`) read the drawn sheet, because the defect they report (text
  printed over a symbol or a label; a title value wider than its row) exists only there: they build
  the storey's Scene and read where labels and `dims auto` numbers landed. So a renderer change that
  moves a label, a `dims auto` number, a symbol's drawn shape or the title block can move them. A PR
  that does so lists each corpus plan whose drafting-layer lint moved, says whether the plan or the
  renderer was wrong, and proves nothing else moved (the swap-back law in
  `test/byte-identity-baseline.ts`'s header). Every other rule still reads only the plan's facts.
  Drafting-layer codes are also excepted from `finish`'s never-worse law (`NOT_GATED_DRAFTING`,
  read from `LINT_CODE_LAYERS`; ADR 0024 §6, ADR 0025 §7).
- **A derived position comes from the shape, never its bounding box or centroid.** This is a defect
  class that `arch lint` cannot see. The grep that finds a new instance: `room\.size`/`r\.size\.w`
  without a nearby `r.poly` branch. Fix locally: probe one wall thickness off each face and ask
  which side has floor (`pointInRoomBox`/`pointInPolygon`), or use `polygonLabelPoint`. Never build
  the wall joinery to answer a `describe()` question.

## Owner policies

- **Merging a PR**: once CI is green and the diff has been read (a code change: adversarially
  reviewed), the agent merges without asking, pinned to the reviewed commit (procedure:
  `docs/agents/commands.md` § Merging a PR). It never merges a red gate or an unread diff.
  Dependabot patch/minor bumps merge under the same rule after `@dependabot rebase` onto a fresh
  `main` and green CI; a major bump waits for the owner.
  Committing and pushing still happen only when asked.
- **The release chain** (version-bump PR, tag, `release.yml`, proofs, hand publishes, listings) runs
  end to end by the agent. The owner pauses it only for OTP/2FA, logins, account/token/secret
  creation, acceptance of terms and attestations, and native file pickers.
- **Listings**: an agent may drive a submission form or a publish step through the owner's logged-in
  browser or CLI when the owner has asked for that listing; the final submit of anything that
  accepts terms, and Cloudflare dashboard edits, are the owner's (`docs/seo.md` section 8).
- **Distribution first**: ArchLang exists for distribution and credibility; revenue is secondary.
