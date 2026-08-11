# AGENTS.md

This file provides project guidance to AI coding assistants (Claude Code, GitHub Copilot, Cursor,
Codex, etc.) working with this repository. Read it before writing or changing any code.

## Project Overview

ArchLang — A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture.

- **Primary language / stack:** TypeScript (Node 18+; the core also runs in the browser)
- **Default branch:** `main`
- **Repository:** https://github.com/ChanMeng666/archlang

## Project status & where things live (current)

**ArchLang is shipped and launched.** This is a published, deployed monorepo —
not a work-in-progress. Treat the live artifacts below as the source of truth
(the exact current version lives in the table and `CHANGELOG.md`, never in prose).

| Thing | Current | Where |
|-------|---------|-------|
| **Core package** | `@chanmeng666/archlang@1.24.0` (published, `latest`, with provenance — released tokenlessly via `.github/workflows/release.yml` OIDC trusted publishing) | npmjs.com/package/@chanmeng666/archlang |
| **Agent interface** | the `arch` **CLI** (`--json`, exit codes, stdin — incl. `ast`/`complete`/`fix`/`suggest`, `compile --from-json`/`-f txt`, `validate --graph`, v1.14's `validate --intent`/`--feedback` + `score --brief`, and the v1.17 **self-describing + bounded-output** layer: manifest-rendered per-command `--help` with worked examples, `--version`, exit-3 did-you-mean on an unknown flag/verb, `describe --room/--select`, `lint\|validate --code/--severity`, `context --section`, `fix --dry-run/--backup` + unified diff) + `SKILL.md` + `spec.llm.md` + **`llms-full.txt` / `arch context`** + **`schemas/plan.schema.json`** + **`schemas/intent.schema.json`** + **`grammars/archlang.gbnf`**. Primary interface stays the CLI; an **optional MCP shim** (`packages/mcp`) is a discoverability channel, not a replacement | `src/cli.ts`, `SKILL.md`, `spec.llm.md`, `llms-full.txt`, `packages/mcp` |
| **MCP server** | `@chanmeng666/archlang-mcp@0.2.3` (published, `latest`; registry entry `io.github.ChanMeng666/archlang-mcp` v0.2.3 live on registry.modelcontextprotocol.io; `packages/mcp/`; stdio shim over the library; tools compile/describe/lint/validate (incl. `intent`)/**score**/repair/fix/suggest/complete + spec/context/schema/**intent-schema**/grammar resources; SDK dep quarantined here, core stays zero-dep). **Its context resources are baked in at pack time and only a version bump ships fresh ones** — the staleness itself is no longer silent: CI's `builds` job runs `packages/mcp/scripts/check-dist-resources.mjs` (byte-compares every baked `dist/` resource against its repo source) and `packages/mcp/test/lockstep.test.ts` pins the core dep range as a **string** equal to `^` + the root version, so every core release turns this package RED on purpose until someone re-pins, rebuilds the resources and bumps the shim in both `package.json` and both of `server.json`'s version fields (don't relax it to a semver-satisfies check). History, one clause: 0.2.2 served the v1.19 spec *and a v1.19 GBNF grammar that could not decode* `paper`/`level`/`place`/`zone`/`polygon`/`arc` while its `^1.14.0` range resolved to a current core; 0.2.3 refreshes all five, pins the range to `^1.24.0`, returns every storey of a multi-storey `compile` in `pages[]` (+ a `level` selector) instead of the ground floor alone, and derives the handshake version from `package.json` (the old hardcoded `"0.2.0"` drift, now test-pinned) | `packages/mcp/`, `server.json` |
| **VS Code extension** | `ChanMeng.archlang@0.13.0` **live on the Marketplace** — verified 2026-08-01 via the gallery API (`extensionquery`, `filterType: 7` = `ChanMeng.archlang`): **0.13.0 is the only version the gallery returns**, even with `IncludeAllVersions`; its `lastUpdated` is 2026-07-26T11:51:11Z, so the upload landed that day, shortly after the query that still saw 0.10.0. It bundles core 1.24.0 (`arc`/`radius`/`circle`/`cw`/`ccw`/`major`, `E_ARC_RADIUS`/`E_ROOM_RADIUS`/`E_DIM_CURVE_REF`, exact πR² areas and arc-length opening attribution in the bundled analysis) and carried in one upload the three tiers that were packaged but never uploaded: 0.12.0 (core 1.23.0 — `polygon`), 0.11.0 (core 1.22.0 — `zone`/`place`/`mirror`) and 0.9.0 (core 1.20.0 — sheet/datum). Durable mechanics: the extension **bundles the core at build time** (a stale bundle ships a stale language — `editors/vscode/test/` pins bundle freshness), `.vsix` files are gitignored so the artifact is local to whoever ran `npm run package`, and **upload stays a human web step** at marketplace.visualstudio.com/manage/publishers/ChanMeng — there is no CI publish | marketplace.visualstudio.com/items?itemName=ChanMeng.archlang |
| **Playground** | deployed, redesigned (**"The Compile Boundary"** one-light-world UI — see below · TypeScript app · pan/zoom · autocomplete · history · click-to-source · format · repair · error-explain · embeddable `embed.html` · circulation Paths toggle · **Copy-for-LLM** · inline diagnostic fixes) | https://playground.archlang.uk |
| **Docs site** | deployed, redesigned (**"The Compile Boundary"** one-light-world UI · compiler-as-hero · VitePress · live editable `<ArchLive>` examples · plain ```` ```arch ```` fences auto-live · serves `/llms.txt` + `/llms-full.txt` + **raw `/<page>.md`** + **`/plan.schema.json`** + **`/archlang.gbnf`**) | https://archlang.uk |
| **Git** | `main`, tags `v1.0.0` → `v1.24.0` (latest; a `v*` tag push triggers the tokenless OIDC release workflow) | github.com/ChanMeng666/archlang |
| **Dataset** | HF `ChanMeng666/archlang-repair-trajectories` (**published, live 2026-07-13** — repair 1200 + authoring 400 rows) — two splits, fully synthetic, self-verifying, CC0-1.0, deterministic from seed `20260712`; generator `dataset/` (`npm run dataset:gen`), permanent CI leakage guard `test/dataset.test.ts` | `dataset/`, huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories |
| **Tests** | 2257 passing (156 files, incl. the fault-injection L1 gate, the G1 oracle-isolation guards, the L2 protocol tests, the judge byte-equivalence fixture, the intent-channel suites, the vocabulary-equivalence classification pin, the dataset contamination/determinism guard, and v1.17's CLI-surface suites — FLAG_KEYS↔manifest bidirectional drift, per-command help/examples, filters-never-gate, the `context --section` splitter-to-generator weld, and `test/docs-flags.test.ts`, the docs↔manifest gate that fails if any hand-written doc names a flag its command doesn't declare, plus v1.19's drawing-quality suites — fixture orientation, `flush` placement, the openings render pass, and `test/repair-coverage.test.ts`, whose postcondition is that every piece a lint pass flags gets a change entry or an `unresolved` entry, never nothing, plus v1.20's sheet-and-datum suites — `test/axes.test.ts` (GB/T numbering incl. the `I`/`O`/`Z` skip and the descending-`y` lettering), `test/sheet.test.ts` (the paper/scale size table, closed-form auto-fit, `W_SCALE_OVERFLOW`, and a pin that a plan with no `paper` is byte-identical) and `test/schedule.test.ts` (schedule rows equal `describe()`'s own areas, legend lists only what is drawn), plus v1.21's vertical suites — `test/levels.test.ts` (either/or level nesting, per-storey id scoping, one-building paper/scale) and `test/cli-levels.test.ts` (`<stem>.L<n>.<ext>` fan-out, `outputs[]`/`pages[]`, `--level` as a display filter that never moves an exit code), `test/vertical.test.ts` (registry dispatch for the three new elements, the drawn symbols, the obstruct-except-the-entry-edge nav-grid rule, same-id shaft identity in `describe().vertical`, upper-storey reachability ± its counterexample, `W_STAIR_UNMATCHED` ±, and cross-level `checkGraph`), and `test/nav-grid-scale.test.ts` (the grid-resolution formulas, large-plan bottleneck discrimination, and the threshold carve), plus v1.22's composition suites — `test/zones.test.ts` (the byte-identity law that a zoned plan renders exactly like its unzoned twin, nesting/roll-up in `describe().zones`, `--zone` as a display filter that never moves an exit code, and the grouped `schedule rooms` subtotals partitioning the total) and `test/place.test.ts` (instance id namespacing and order-independence, dotted refs allowed only in reference positions, `rotate`/`mirror` as exact composing isometries incl. mirrored door swings, whole-file `import … as`, and the imported-fix span guard that keeps `applyFixes` from splicing a component's offsets into the importer), plus v1.23's geometry suites — `test/polygon-rooms.test.ts` (exact shoelace area and centroid labelling, the byte-identity law that an all-rectangle plan is unchanged, boundary-run adjacency and by-distance opening attribution at any angle, the occupancy/nav grids dropping out-of-ring cells, exact `W_ROOM_OVERLAP`, and every rectangle-only clause refusing rather than approximating — `E_PLACE_POLY`, `E_ROOM_POLY_SELF_INTERSECT`, `E_ROOM_POLY_DEGENERATE`, `W_ROOM_LABEL_OUTSIDE`) and `test/miter-limit.test.ts` (the `Paint.miterLimit` cap reaching SVG, PDF and the clipper2 offset alike), plus v1.24's `test/curves.test.ts` (the two-endpoints-and-a-radius arc solve incl. all four `cw`/`major` branches and the `E_ARC_RADIUS` floor, arc-length opening attribution and tangent-derived swings, exact πR² against the 48-gon it is *not* measured from, the dedup that gives a two-semicircle drum one `R` leader, and **both determinism laws** — byte-identical output with the optional clipper2 backend registered *and* cleared, which is what per-segment lowering buys), plus v1.25's orientation-and-openings suites — `test/site.test.ts` (the `site` grammar, the five derived names, the byte-identity law that a plan with no `site` is unchanged everywhere, and the pin that `north` is **deliberately absent** from `KEYWORDS.enum` so nobody "fixes" the three-of-four asymmetry into the first word in two categories), `test/window-facing-probe.test.ts` (the outward-face probe, incl. the two courtyard reproductions the bbox midpoint answered backwards, and both tie-break branches) and `test/doors.test.ts` (the four door kinds, `doorSwing()` returning `null` per kind, both `E_DOOR_KIND_CLAUSE` directions, `W_POCKET_RUN` ± its reverse-slide fix, and the mirrored-`place` pin that `slide`'s flip is the identity while `swing`'s is not)) + offline authorability eval (26 briefs, judge v2, `npm run eval:ci`, in CI) **and the separately-reported intent-fidelity slice** (`npm run eval:fidelity`, `eval/corpus-fidelity.json` — infeasible briefs where declaring infeasibility is correct, plus a deterministic judge-free laundering detector; it shares no ruler with the 26-brief rate and never touches `judge-fixture.json`), plus the 2026-08 cross-surface layer — lockstep drift guards (`test/site-lockstep.test.ts` token-block/`--syn-*` byte pins, `test/brand-assets.test.ts`, `test/share-codec.test.ts` — the `#z=` codec's three implementations held behaviourally equal, `test/docs-sync-list.test.ts`, `test/docs-table-pipes.test.ts` — the GFM `\|`-in-table tripwire, now scanning `docs/archive/` too since its one real offender was escaped, and `test/docs-fences.test.ts` — the live-fence gate: every published ```` ```arch ```` fence the docs site turns into a running `<ArchLive>` widget must compile clean, or carry the `static` opt-out), `test/escape-fuzz.test.ts` (hostile-string properties over SVG/ASCII/DXF via `src/text-safe.ts`), full MCP tool/resource/lockstep/fuzz coverage in `packages/mcp/test/`, VS Code LSP handler + stdio + bundle-freshness tests in `editors/vscode/test/`, and **Playwright E2E**: 50 playground specs (`playground/e2e/`) + 33 docs specs (`docs-site/e2e/`) against the built sites; typecheck (`noUncheckedIndexedAccess` on, full-repo via `typecheck:all`) + build + `npm run lint` (Biome) clean | — |

**Latest release: v1.24.0 (2026-07-26)** — Batch-2's final sub-release **"geometry II"**, which
**closes the large-building roadmap**: `arc (x,y) radius R [cw|ccw] [major]` inside a `wall` body makes
that edge a circular arc, and `room [id=…] circle at (cx,cy) radius R` makes a floor round. The visible
faces are **true arcs** (SVG `A`, native DXF `ARC`) at `r ± t/2`, never faceted at any zoom — only the
poché fill tessellates — and a circular room's area is **exact πR²** in closed form, not the 48-gon the
grid layer uses (which is 0.14% short, enough to move the label). Openings work on a curve: `at <pos>`
walks by **arc length** `R·θ` rather than the chord, and a door's leaf, swing and `hinge left|right`
come from the **tangent at the opening**. Dimensioning gains the round GB/T forms — `dims auto` emits
one deduplicated **`R`** leader per distinct arc and a **`φ`** call-out per circular room while the
exterior chains stay on the straight facades, plus manual `dim radius`/`dim diameter` that derive text
and geometry from the element they name. The determinism keystone: an arc-bearing wall is lowered **per
segment instead of through the polygon boolean**, so a curved plan's bytes are independent of the
optional `clipper2-wasm` dep, and a plan with no `arc` is byte-identical. New codes `E_ARC_RADIUS` (with
a minimum-radius fix), `E_ROOM_RADIUS`, `E_DIM_CURVE_REF`; new flagship `examples/aquarium.arch`
(~60 × 46 m, A2 at 1:200, `validate --strict` clean). Deferred by name, not silently: an `arc` inside a
`room polygon` ring (v1.25), annuli, and arc-length dimensions. (The four prior Batch-2 sub-releases,
all 2026-07-26: **v1.23.0 "geometry I"** — `room … polygon` rings measured by exact shoelace area and
centroid at any angle, rectangle-only clauses refusing rather than approximating (`E_PLACE_POLY`,
`E_ROOM_POLY_SELF_INTERSECT`, `E_ROOM_POLY_DEGENERATE`, `W_ROOM_LABEL_OUTSIDE`), and the `Paint.miterLimit`
cap that stopped acute joints spiking 23× the line weight in the PDF; **v1.22.0 "composition"** — `place <component>() as
<name> at (x,y) [rotate] [mirror]` as an addressable, transformable instance with per-instance id
namespacing and exact integer isometries, `import "wing.arch" as wing`, `zone <id> { … }` grouping with
zero geometric semantics, and the imported-fix span guard in `applyFixes`; **v1.21.0
"vertical"** — `level <n>` blocks make a plan a set of per-storey drawings (`<stem>.L<n>.<ext>`,
`pages[]`, `--level`) plus `stair`/`elevator`/`escalator` as one cross-floor shaft feeding
reachability, and area-scaled circulation grids; **v1.20.0 "sheet & datum"** —
`paper`/`axes`/`schedule`/`legend` and the operative drawing scale.) The table above is what is live. Canonical release notes
live in `CHANGELOG.md`; per-tranche research verdicts in `docs/research/`. The full per-release
narrative (v1.3.0 → v1.16.0, honest eval read, sites redesign, every tranche summary) is archived
verbatim at
**[`docs/archive/agents-status-history-2026-07.md`](docs/archive/agents-status-history-2026-07.md)** —
its permanent conclusions are distilled into "Standing decisions & iron laws" just below, so read
*that*, not the archive, for what still binds you. Older docs predating the launch (build plans in
`docs/archive/`, the now-frozen work log `docs/archive/WORK-LOG-v0.7-v1.15.md`) are historical — the
table above and `CHANGELOG.md` reflect what shipped.

## Standing decisions & iron laws (never re-litigate)

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
- **Custom domain `archlang.uk` (Cloudflare DNS + Vercel), live since 2026-07-15.** Docs → `archlang.uk`
  (apex), playground → `playground.archlang.uk`. Two things a future agent must not get wrong: (1) the
  Vercel **project names** and npm **workspace names** are still `archlang-docs` / `archlang-playground`
  — those are NOT the URLs and must never be renamed to match the domain (a grep for them legitimately
  hits `package.json`/`deploy.yml`); (2) the Cloudflare records must stay **"DNS only" (grey cloud), never
  proxied** — proxying breaks Vercel's SSL. The old `*.vercel.app` hosts are kept and **301**-redirect to
  the new ones. Full recipe (DNS records, TLS = Full strict, redirects, and how to change a public URL in
  code without the escaped-dot grep trap): `docs/hosting-and-domains.md`.

**Monorepo layout (npm workspaces, one root lockfile):**

```
.                     @chanmeng666/archlang — the core (PUBLISHED package; src/, dist/)
├─ spec.llm.md        GENERATED one-page language spec for agents (`arch spec`, `gen:spec`)
├─ SKILL.md           agent Skill: the spec → compile → fix → describe → validate loop
├─ llms.txt           machine-readable project map (USE vs CONTRIBUTE)
├─ llms-full.txt      GENERATED full agent context (spec + skill + CLI + errors; `gen:llms`)
├─ schemas/           GENERATED plan.schema.json (`gen:plan-schema`) + intent.schema.json (`gen:intent-schema`), both drift-tested
├─ grammars/          GENERATED archlang.gbnf — GBNF constrained-decoding grammar (`gen:gbnf`)
├─ packages/mcp/      @chanmeng666/archlang-mcp — stdio MCP shim over the library (SDK dep quarantined
│                     here): src/server.ts, server.json (registry manifest), scripts/ (copy-resources +
│                     check-dist-resources staleness gate), test/ (tools · resources · lockstep · fuzz) — see ADR 0012
├─ editors/vscode     archlang-vscode → published as ChanMeng.archlang (esbuild-bundled extension);
│                     src/handlers.ts holds the DI'd LSP logic, test/ covers it + the built stdio bundle
├─ editors/*.json     generated TextMate grammar + language-configuration (shared by the extension)
├─ playground/        Vite + CodeMirror live editor (consumes built core via dist/); styles under
│                     src/styles/{tokens,chrome,editor,panels,embed}.css (tokens.css = the brand block);
│                     also ships embed.html — a chrome-less <iframe> viewer read from the #z= hash;
│                     test/ = pure-logic units, e2e/ = Playwright specs against the BUILT app
├─ docs-site/         VitePress docs (pages generated from docs/*.md, examples/*.arch); theme CSS as
│                     .vitepress/theme/{style,home,doc-pages}.css (style.css = the brand block);
│                     examples are live/editable <ArchLive> widgets; e2e/ = Playwright route + hydration specs
├─ docs/              language-reference.md · analysis.md · intent.md · error-codes.md (GEN) ·
│                     cli-reference.md (GEN from src/manifest.ts, `gen:cli`) · testing.md (the verification-system
│                     map: tiers, guards, what to do when one goes red) · adr/ (archive/ holds the frozen WORK-LOG)
├─ brand/             logo kit + brand book (README.md) — archlang-logo-master.svg is byte-sacred (iron law)
├─ examples/          studio · two-bed · parametric · themed · relational · attached · accessible ·
│                     museum (the LARGE-building flagship: paper A1 @ 1:200) · two-storey ·
│                     museum-wing + museum-wings (the COMPONENT-v2 flagship: one wing authored in
│                     local coords, imported as a whole FILE and placed twice, once mirrored) ·
│                     gallery-l (the POLYGON-room flagship) · aquarium (the CURVED-geometry flagship:
│                     a drum of two arcs round a `room circle`, A2 @ 1:200) · lib/
├─ eval/              NL→ArchLang authorability harness: corpus.json (26 briefs) · goldens/ · run.ts ·
│                     assertions.ts + synonyms.ts (re-export SHIMS over src/intent*.ts since T4) ·
│                     judge-fixture.json (byte-equivalence) · rubric.md (frozen) · faults/ + l1.ts (L1 gate) ·
│                     g1/ (Gate G1, PASSED) · l2.ts + l2-run.ts (T3 harness, live run never dispatched);
│                     offline gate `npm run eval:ci` in CI; guarded live `npm run eval:live` (see iron laws)
├─ dataset/           repair + authoring dataset generator (`npm run dataset:gen`, tsx, no new dep):
│                     generate.ts · templates.ts · faults.ts · trajectory.ts · briefs.ts · rng.ts · diff.ts ·
│                     dedup.ts · canary.ts · CARD.md (HF README) · out/ (.gitignore'd jsonl); imports ONLY
│                     the pure core, never eval/; contamination iron law enforced by test/dataset.test.ts — CC0
├─ scripts/           single-source generators behind the `gen:*` npm scripts (gen-grammars, gen-error-codes,
│                     gen-llm-spec, …) + smoke.mjs (zero-dep post-deploy/nightly route check) + changelog-section.mjs
├─ bench/             ~1000-element timing harness (+ --json mode, CI regression comment)
└─ test/              vitest: snapshot + fast-check + unit + visual-regression + CLI/describe/lint/eval +
                      the cross-surface guards (lockstep, docs tripwires, escape fuzz) — map in docs/testing.md.
                      The root vitest run ALSO includes playground/test, packages/*/test and editors/vscode/test
```

Key agent-facing `src/` modules (all pure, exported from `src/index.ts`): `describe.ts` (semantic
summary; `.caption` = accessible one-liner, `.freedom` = authored-absolute vs resolver-derived
placement), `lint.ts` (soundness rules), `analyze.ts` (shared resolve pipeline + rectilinear geometry
behind both), `geometry.ts` (shared door-swing quarter-disc), `elements/fixtures-glyphs.ts` (fixture
symbols), `diagnostic-json.ts` (`diagnosticToJson` line/col/`fix` projection), `backends/error-svg.ts`
(`renderErrorSvg`), `intent.ts` + `intent-concepts.ts` (intent channel, shared with the eval via
shims), `vocabulary.ts` (`matchVocabulary` label matcher), `sheet.ts` (the sheet layer: the ISO 216 table, the
sheet-millimetre drafting constants, `sizesFromPaper` — the second `RenderSizes` constructor — and the
closed-form fit/auto-fit rule; a plan with no `paper` never reaches it), `axes.ts` (`numberAxes` /
`axisLetter` — the GB/T positioning-axis grid and its derived labels) and `sheet-tables.ts`
(`roomSchedule` / `legendEntries` + their Scene layout, so all four backends draw the margin tables
from one place), and `vertical.ts` (the shared `stair`/`elevator`/`escalator` semantics: which end a
run is entered from — a closed-form drafting convention, `dir`-dependent, used by BOTH the symbol and
the nav grid — what its footprint does to circulation, and `verticalConnections`/`verticalReach`, the
same-id-on-two-levels shaft graph that `describe().vertical`, `lint`'s per-storey reachability and
`checkGraph` all read), and `frame.ts` (the `place` transform: a frame is a 2×2 signed-permutation
matrix + translation — exact, composable, no trig — and `transformElement` is the ONE place a
resolved element crosses from an instance's local frame into plan coordinates, including the handed
flips a reflection forces; see [ADR 0016](docs/adr/0016-component-instances-and-frames.md)). The CLI lives in `src/cli.ts` (dispatch) +
`src/cli/` (command modules); a single root `npm install` bootstraps every workspace.

### The sites' design system — "The Compile Boundary" (docs + playground)

Both public sites share one front-end system — **site chrome only**, no core/language change. Full
rationale in **[ADR 0014](docs/adr/0014-one-light-world.md)** (which supersedes ADR 0010 §1/§2/§6/§7 —
read 0010's carbon/mylar prose as history) and `brand/README.md`.

- **ONE LIGHT WORLD. There is no dark mode and no dark surface on either site.** Two worlds still split
  by a compile seam, but both are LIGHT and differ by **temperature + texture**, never by darkness: a
  cool **SOURCE world** (`--src-bg` #eceef2 / `--src-surface` #fbfbfc — code, mono type, syntax colour;
  plum survives *only* as the syntax accent + logo fills) vs. a warm **SHEET world** (drafting paper,
  blue-black ink, grid, title blocks). The seam is a solid plum rule (a glow reads as dirt on light).
  One shared attention accent, **REDLINE**, for CTAs and errors only. Body-size plum is `--plum-deep`;
  bare `--plum` (4.1:1) is graphics/≥24px only. A control's only border must be `--src-rule` (3.2:1),
  never the decorative `--src-border` (1.3:1).
- **One syntax palette, three renderers.** The eight `--syn-*` tokens live in the shared block and feed
  the playground's CodeMirror (via `scripts/gen-grammars.ts`'s fallbacks), the docs hero's typing pane,
  and the docs fences (via the custom `archlangLight` Shiki theme in `docs-site/.vitepress/config.ts`).
  Change a syntax colour in ALL FOUR places, then `npm run gen:grammars`.
- **Fonts** (self-hosted `@fontsource`, zero CDN): **Archivo Variable** (display) + **Public Sans
  Variable** (body) + **IBM Plex Mono** (code).
- **Token-lockstep law.** The brand token block is **duplicated byte-identically** in
  `docs-site/.vitepress/theme/style.css` and `playground/src/styles/tokens.css` — change one, change
  the other (the brand iron law above).
- **Machine-readable routes.** `sync-docs.mjs` publishes at the docs-site root a raw markdown copy of
  every generated page at `/<route>.md` plus **`/plan.schema.json`** + **`/archlang.gbnf`** — the copies
  live in `public/`, excluded from page parsing so they serve verbatim.

## Commands

This is an **npm-workspaces monorepo**: the core (`@chanmeng666/archlang`) lives at
the repo root and is the published package; `editors/vscode`, `playground`,
`docs-site`, and `packages/*` (currently `packages/mcp`) are workspace members
sharing one root lockfile.

```bash
npm install          # bootstraps ALL workspaces (core has ZERO runtime deps)
npm run build        # build core library + CLI into dist/ (tsup)
npm run typecheck    # tsc --noEmit
npm run lint         # biome check . (format + lint; `npm run lint:fix` applies safe fixes)
npm test             # the whole vitest suite — test/, playground/test/, packages/*/test/, editors/vscode/test/
                     # (the include list is in vitest.config.ts; a test outside it silently never runs)
npm run cli -- compile examples/studio.arch -o studio.svg   # run the CLI from source via tsx
npm run bench        # compile a generated ~1000-element plan and report per-stage timings
npm run gen:grammars # regenerate editor grammars from src/grammar/tokens.ts (CI checks drift)
npm run gen:errors   # regenerate docs/error-codes.md from the catalog (CI checks drift)
npm run gen:cli      # regenerate docs/cli-reference.md from src/manifest.ts (CI checks drift)
npm run gen:spec     # regenerate spec.llm.md from tokens.ts + examples/ (CI checks drift)
npm run gen:llms     # regenerate llms-full.txt from spec + SKILL.md + manifest + error catalog (CI checks drift)
npm run gen:gbnf     # regenerate grammars/archlang.gbnf from src/grammar/tokens.ts (CI checks drift)
npm run gen:plan-schema  # regenerate schemas/plan.schema.json from PLAN_JSON_SCHEMA (CI checks drift)
npm run gen:intent-schema  # regenerate schemas/intent.schema.json from INTENT_JSON_SCHEMA (CI checks drift)
npm run gen:all      # run every gen:* generator in dependency order (gen:spec before gen:llms)
npm run check        # typecheck + lint + check:test-wiring + test — the local pre-push gate
                     # NOTE: `typecheck` here does NOT compile test/ — only `typecheck:all` does,
                     # so a type error in a test file passes `check` and fails `typecheck:all`.
npm run check:test-wiring  # fail if a tracked *.test.ts sits outside vitest.config.ts's include
                     # globs (it would never run), or if an include glob matches nothing
npm run check:drift  # run every generator and fail if any generated artifact drifted (CI drift gate)
npm run lint:ci      # biome ci . — the non-writing lint entry CI uses
npm run typecheck:all    # full-repo typecheck: root tsconfig.dev.json (src+test+eval+dataset+scripts+bench)
                         # + playground + docs-site (vue-tsc) + packages/mcp + editors/vscode (CI: builds job)
npm run test:coverage    # vitest run --coverage — report-only v8 coverage over src/ (CI: Node 22 leg)
npm run e2e:playground   # Playwright E2E against the built playground (build core + playground:build:only first)
npm run e2e:docs         # Playwright E2E against the built docs site (build core + docs:build:only first)
                         # Set E2E_BASE_URL=<origin> on either and the config drops its webServer and
                         # drives THAT origin — no build, no preview server. Nightly pairs it with
                         # `--grep @prod` (the READ-ONLY subset) against the live sites.

npm run playground:dev   # build core, then run the Vite playground dev server
npm run docs:build       # build core, then build the VitePress docs site
npm run mcp:build        # build core, then build the MCP shim (packages/mcp → dist/ + copied resources)
npm run build:workspaces # docs + playground + mcp + vscode, via the `*:only` variants — they SKIP the
                         # core rebuild, so `npm run build` must have run first (what CI's builds job does)
```

Full map of the verification system — the three tiers, every guard, and the red-run response for
each — is **[`docs/testing.md`](docs/testing.md)**.

`ci.yml` runs **five gating PR jobs in parallel** — the Node 18/20/22 test matrix (+ report-only
coverage on the 22 leg), a **builds** job (all four workspaces compile, `typecheck:all`, MCP
dist-resource freshness, VS Code bundle tests), a **Windows** leg (tests + drift at
runner-default line endings), and two **Playwright E2E** jobs (playground, docs) — plus an
informational `bench` PR comment that never gates; `codeql.yml` adds a sixth check on the same
events (and a weekly cron). `nightly.yml` adds six jobs: production smoke
(`scripts/smoke.mjs`), `npm audit` (report-only, into a pinned issue), gitleaks over the full
history, a full OS×Node matrix, **`e2e-prod`** — the `@prod`-tagged READ-ONLY Playwright subset
re-run against the live `playground.archlang.uk` / `archlang.uk` via `E2E_BASE_URL` (no build,
no preview server) — and the single `report` writer. Only tag a case `@prod` if it purely
navigates, reads and asserts: no downloads, no clipboard, no persisted-state or typing flows.
`e2e-prod`'s docs half is also a **deploy-staleness probe** — the raw `/<page>.md` cases compare
production's bytes against the checkout's, so a stale deploy fails the night.
**The whole verification system — every tier, every guard, and what to do when each one goes
red — is mapped in [`docs/testing.md`](docs/testing.md); read it before adding a test or
blessing a snapshot.**

Export to other formats from the CLI: `-f svg|dxf|txt|pdf|png` (`txt` is the
zero-dep ASCII plan; `pdf` needs optional `pdfkit`; `png` needs optional
`@resvg/resvg-js`).

**The CLI is agent-native.** Every command takes `--json` (structured result to stdout, messages to
stderr) with deterministic exit codes (`0` ok · `2` user-source error · `1` IO/internal · `3` bad
usage), and source can come from stdin (`-`). **It is also self-describing and hard to misuse:** the
manifest (`src/manifest.ts`) declares each command's *exact* flag set plus at least one worked
`examples[]` entry, and `src/cli/help.ts` renders `arch --help` / `arch <cmd> --help` / `arch help
<cmd>` **from that manifest** — so help can never list a flag the command doesn't take (a bidirectional
drift test pins the manifest against both the parser's `FLAG_KEYS` table and the dispatch table). An
undeclared flag or an unknown verb is a **usage error (exit 3)** with a `closest()` did-you-mean and a
`usage:` echo — never a silently-swallowed filename. `arch --version` prints the version.
Beyond `compile`/`watch`/`fmt`/`explain` there are
`arch spec` (print the whole language — `spec.llm.md`), `arch context` (print the full bundled agent
context — `llms-full.txt`: spec + skill + CLI reference + error catalog, for a cold-start agent;
`--section spec|workflow|cli|errors` prints just one slice instead of the whole ~60KB bundle),
`arch describe` (semantic JSON: rooms,
areas, adjacency, door connections — backed by `describe()` in `src/describe.ts`), `arch lint`
(architectural soundness `W_*` warnings — `src/lint.ts`), `arch validate` (parse+resolve+lint, no
render; `--strict`/`--fail-on-warning` makes warnings fail too — the pipeline ship-gate; `--graph
<g.json>` also checks interior-door adjacency against an intended graph via `checkGraph`; `--intent
<intent.json>` gates on a brief's intent contract via `validateIntent` — exit 2 on a gating
violation, `--feedback` appends deterministic correction prompts), `arch score` (`--brief
<intent.json>` — the continuous intent-satisfaction meter, `satisfied/total` + subscores, exit 0 on
any successful measurement; measures, never gates), `arch ast`
(parse-only span-bearing AST JSON — `astToJson`), `arch complete --at <offset>` (LSP `completion()`
items in scope), `arch fix` (apply the machine-applicable `diagnostics[].fixes` via a bounded
fixpoint — `applyFixes`, `--unsafe`/`--dry-run`/`--force`; ADR 0011 — it prints a **unified diff** of
what it would write on stderr, `--dry-run` included, and `--backup` saves the original bytes to
`<file>.bak` before rewriting in place), `arch suggest` (advisory
door/window topology statements as data — `suggestTopology`, ADR 0005), `arch new` (scaffold),
`arch repair` (the explicit source-to-source **geometric** corrector — pushes furniture out of walls
and emits new `.arch` + a change log; `src/repair.ts`, see ADR 0006 — distinct from `fix`), `arch
preview` (render a PNG an agent can look at, or `--ascii` for a zero-dep text plan; opt-in `--install`
fetches the optional `@resvg/resvg-js`), `arch batch` (render many files concurrently → `{ ok,
results[] }`), `arch md` (render the ` ```arch ` blocks in a Markdown file → image links; pure
`src/markdown.ts`), and `arch manifest`/`capabilities` (the whole CLI API as structured data —
`src/manifest.ts`). Output-shaping flags: `-f txt` (zero-dep ASCII plan via `renderAscii`),
`compile --from-json` (read Plan JSON — `planFromJson` — instead of `.arch`); opt-in
`--error-svg` (on `compile`/`preview`/`md`) renders a failing plan as a self-describing error-card
SVG instead of no bytes, and `--accessible` (on `compile`) emits SVG `<title>`/`<desc>` +
`role="img"`; the error-svg/accessible paths leave the default output byte-identical.
**Bounded output** (so a big plan can't blow an agent's context): `describe --select <keys>` emits only
the named top-level keys and `describe --room <ids>` keeps only those rooms plus the elements touching
them (whole-plan facts — `bbox`, `totals`, `caption`, `adjacent` — stay whole-plan, so a narrowed read
never lies about the building), while `lint`/`validate --code <CODE,…>` / `--severity <error|warning>`
narrow which diagnostics are *shown*. **The `--code`/`--severity` filters are DISPLAY-only and must stay
that way — `ok` and the exit code are always computed from the unfiltered diagnostic set**, so reading
less can never turn a failing plan green (a filtered result is marked `filtered: true` +
`total_diagnostics`/`selected_rooms`). The narrowing lives in the CLI layer (`src/cli/commands-analyze.ts`),
never in the library: `describe()`/`lint()` stay pure whole-plan fact producers.
`describe`/`lint` share the pure analysis layer in `src/analyze.ts` (+ `src/analyze/occupancy.ts`, the
circulation flood-fill); all are exported from `src/index.ts`. The CLI is the **primary** agent
interface; an optional stdio **MCP shim** (`packages/mcp`, `@chanmeng666/archlang-mcp`) wraps the same
library functions for MCP-native hosts as a discoverability channel (see ADR 0012 and the README's
agent section) — the core stays zero-dependency, the SDK lives only in that package.

## Architecture & Conventions

ArchLang is a compiler pipeline. Source text → backend-neutral **Scene IR** →
backends, in stages:

```
source (.arch)
  └─ src/lexer.ts       hand-written lexer  → Token[]   (byte spans)
  └─ src/parser.ts      recursive descent   → PlanNode  (src/ast.ts); recovers, never throws
  └─ src/import.ts      link `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts          resolve(): expand scripting, grid-snap, auto-id, host openings,
                        relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts toScene(): wall union/offset, hatches, page sizing → Scene (src/scene.ts)
  └─ src/backends/      pure serializers of the Scene:
       svg.ts (default, zero-dep) · png.ts (optional @resvg/resvg-js)
  └─ src/export/        dxf.ts (zero-dep) · pdf.ts (optional pdfkit)
  └─ src/index.ts       compile() — orchestrates the above; memoizes by source + extension id
```

- **`src/index.ts` is the only public surface.** It exports `compile(source, opts) =>
  { svg, errors, warnings, diagnostics, ast?, scene? }` plus the backends, the
  extension registry, the World seam, and the types. The `CompileResult` is
  **append-only** — add fields, never remove/rename.
- **`compile()` is pure, synchronous, and isomorphic** — no I/O, no `Date.now()`, no
  `Math.random()`. This guarantees determinism and lets it run in the browser. Do **not**
  introduce non-determinism or Node-only APIs into the `src/` core. The CLI (`src/cli.ts` +
  `src/cli/`) is the one place Node APIs and real time are allowed; everything else gets its
  environment injected through the **`World`** seam (`src/world.ts`).
- **Optional power is lazily `import()`ed.** Heavy/native deps (Clipper2 geometry, pdfkit,
  resvg) are `optionalDependencies`, loaded only at point of use, so the default SVG path
  pulls nothing. See ADRs in `docs/adr/`.
- **Errors are returned, never thrown** for user-source problems. Push a `Diagnostic` (with a
  byte `span` and an `E_*`/`W_*` `code` documented in `src/error-catalog.ts`); the parser
  recovers and reports all problems in one pass.
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered
  in `src/elements/defs.ts`. Parse/resolve/render dispatch through the registry, not a switch.
- **Output formats are deliberately NOT a public registry seam** (unlike elements/themes/
  hatches/geometry-backend): formats drag optional native deps and CLI flags with them, which
  a registry can't abstract cleanly. Adding one = a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) + a serializer line in `src/cli/serialize.ts` `serialize()`.
- **Coordinates are millimetres**; origin top-left, +x right, +y down (matches SVG).
- **Rendering constants** (colours, line weights, fonts) live in the theme (`src/theme.ts`)
  and the size formulas in the backends — tune there, not inline.
- **Zero runtime dependencies in the core is a feature.** Don't add a hard runtime dep;
  prefer arithmetic or an optional lazy dep.

## Gotchas & Anti-patterns

- **(Typecheck) A file's options come from the PROGRAM compiling it, not from the tsconfig nearest
  it — and `exclude` cannot hold a file out of a program it was IMPORTED into.** `tsconfig.dev.json`
  checks `test/` and excludes `playground`/`docs-site`/`packages`/`editors`, but a root test that
  imports `../playground/src/share.js` pulls that module into the ROOT program, where
  `noUncheckedIndexedAccess` is ON; the playground tsconfig's deliberate relaxation does not travel,
  because `exclude` only filters a config's own `include` globs. So any workspace module a root test
  imports is compiled once per leg of `typecheck:all`, under two option sets, and must satisfy the
  stricter one — `test/lsp-diagnostics.test.ts` → `editors/vscode/src/diagnostics.ts` is a second
  live instance that happens to pass. Symptom: `TS2345 … | undefined` on workspace source that
  `tsc -p <workspace>` reports as clean — check WHICH leg emitted it before blaming the workspace
  config (`tsc -p tsconfig.dev.json --listFiles` names every file the program actually pulls in),
  and fix it IN the shared module (guard or a provably-safe assertion), never by relaxing the root
  option or adding an exclude.
- **Don't edit `dist/` or generated files.** `dist/` is a build output. The generated artifacts —
  editor grammars (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`),
  `docs/error-codes.md`, `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`, and the two
  `schemas/*.schema.json` — each come from a single source (`src/grammar/tokens.ts` /
  `src/error-catalog.ts` / `examples/` / `SKILL.md` + manifest / `PLAN_JSON_SCHEMA` /
  `INTENT_JSON_SCHEMA`) via the matching `npm run gen:*` (order: `gen:spec` before `gen:llms`, which
  consumes it). **CI fails on drift** — edit the source and regenerate, never hand-edit. The docs site
  copies the root artifacts + a raw markdown copy of each page into `public/` via
  `docs-site/sync-docs.mjs` — edit the repo-root source, not the copies. **Editor syntax colors also
  route through the generator:** `arch-language.js` emits each `HighlightStyle` tag as
  `var(--syn-<name>, <fallback>)` (palette in `playground/src/styles/editor.css`) — recolor via the
  `scripts/gen-grammars.ts` template or `--syn-*` values + `npm run gen:grammars`, never by hand.
- **Determinism is tested.** The suite asserts `compile(s) === compile(s)` byte-for-byte, geometry
  engine both present and absent. Anything varying output across runs (object key order, floats, time)
  fails — route number formatting through `fmt()`. The one opt-in output change is
  `compile(src, { annotate: true })` (adds `data-span`); it is deterministic and leaves the **default**
  output byte-identical, so never emit annotation unconditionally (ADR 0007) — a test enforces equality.
- **The parse-stage memo's AST is shared — never mutate it downstream.** `parser.ts` memoizes
  `parse()` by content key (parser.ts ~line 59–63) on the contract that the cached `PlanNode` is never
  mutated. Anything consuming `parse()` or any memoized structure treats it as immutable — clone before
  you mutate (an in-place `repair()` edit once made output history-dependent; fixed in `51a47ee`).
- **Relational placement is deterministic, not an optimizer.** `src/layout.ts` resolves
  `right-of`/`below`/… by pure arithmetic in topological order; the absolute `at (x,y)` path must stay
  byte-identical (it is the default and has its own golden snapshots). See ADR 0004.
- **The PNG backend is Node-only and async** (resvg is a native binding); it rasterizes the SVG with a
  **bundled font** so text is deterministic. Keep `node:*` imports lazy so the module stays browser-safe.
- **Keep every Node-only lazy `import()` bundler-safe.** The lazy `import()`s of `@resvg/resvg-js`,
  `pdfkit`, `clipper2-wasm` — **and** the PNG font-lookup `import("node:fs")` / `import("node:url")` —
  carry `/* webpackIgnore: true */ /* @vite-ignore */` so a downstream webpack/Next.js consumer doesn't
  try to resolve a native `.node` binary or a `node:*` builtin for the browser and fail its build. The
  comments are needed even though these paths never run in a browser — preserve them on any new
  Node-only or optional-dep import (the 1.0.0→1.0.1 + 1.12.1 fixes).
- **`npm run dev`** (repo root) runs `tsup --watch` (a rebuild watcher), not a web server — the
  playground/docs sites are separate Vite apps (`npm run playground:dev` / `docs:dev`).
- **(Releasing) npm provenance exact-matches `repository.url`'s casing.** The OIDC release
  (`.github/workflows/release.yml`; a `v*` tag push runs it) fails with `E422` if `repository.url`'s
  owner segment isn't `ChanMeng666` byte-for-byte (the v1.14.0 release needed a same-day casing fix +
  re-tag). See the release/npmjs iron law above and `docs/npm-oidc-publishing-playbook.md`.
- **(MCP registry) The `io.github.<Owner>/*` namespace is case-sensitive and identity-checked.**
  registry.modelcontextprotocol.io exact-matches the published npm package's **`mcpName`** against
  `server.json`'s `name`, so the owner segment must match your GitHub login byte-for-byte
  (`io.github.ChanMeng666/…`, not `chanmeng666`); it also **caps the server `description` at 100
  chars**. A mismatch or over-long description is rejected at publish (the 0.1.0 → 0.1.1 patch fixed exactly this).
- **(Eval harness) Reasoning models spend thinking tokens out of `max_completion_tokens`.** A too-low
  cap starves the model into truncated (invalid) output and a bogus low baseline; `eval/run.ts` uses
  16384. If a model scores implausibly low, suspect a token cap before the language.
- **(Eval harness) Never compare rates across a judge change** (an iron law above; the mechanics:
  `JUDGE_VERSION` / `SYNONYMS_VERSION` are pinned by tests and stamped into every result +
  `live-baseline.json`'s `judge` field, and `renderDelta` prints a non-comparability warning when they
  differ). See `eval/README.md`.
- **(Dataset) Holdout never published, canary never regenerated, `repair`-split sources stay literal**
  — the contamination iron law above, enforced by `test/dataset.test.ts`. Operationally: `dataset/out/`
  is git-ignored (HF-only); on re-upload the HF card's `task_categories` must come from HF's official
  list (`text-generation`, not `text2text-generation` — the upload warns), namespace uses the canonical
  `ChanMeng666` casing. See `dataset/README.md` and [ADR 0013](docs/adr/0013-repair-trajectory-dataset.md).
- **(`place`) NEVER pre-transform a resolver's INPUT coordinates.** A `place`d instance resolves in
  its OWN frame — against its own walls and rooms, with its own `placeRelational` pass — and
  `frame.ts`'s `transformElement` then carries the resolved element into plan coordinates. That is
  not an implementation accident: every derived-geometry rule is stated in world terms (`anchor
  top-left` names a corner of the page, `against wall … side left` a face, `hinge left` a wall
  handedness, `right-of` the page's +x, a room's `at` its TOP-LEFT — which a turn moves), so
  feeding rotated coordinates in would silently change what each one means and force every element
  resolver to learn about frames. Add a handed rule ⇒ add its flip to `transformElement` (`det < 0`),
  not a frame parameter to the element. See [ADR 0016](docs/adr/0016-component-instances-and-frames.md).
- **(`place`) A bare `wing()` call is still the LEGACY MACRO and must stay byte-identical** — caller's
  coordinates, caller's GLOBAL auto-id counters, no namespace, no zone. A plan with no `place` has
  exactly one resolution group and takes the historical single pass; the SVG snapshots and visual
  goldens are the gate. Never "unify" the two forms.
- **A diagnostic's `span` is not always in the file you compiled.** A component's body statements
  carry spans into the module they were WRITTEN in, so `Diagnostic.file` names that module when it is
  not the compiled source — and `applyFixes` **skips** any `FixSuggestion` carrying a `file`. Before
  v1.22 it did not, and an imported component's off-wall-door fix rewrote the middle of the
  importer's `wall` statement. Any new consumer of `diagnostics[].fixes` must honour `file`.
- **Door `hinge left/right` is relative to the wall's traversal direction**, not the screen — so the
  hinge side can flip with the order of a wall's points. The swing quarter-disc is computed once in
  `geometry.ts` (`doorSwing`) and shared by `door.render()` and the `W_SWING_OBSTRUCTED` lint rule —
  keep them on that one helper.
- **Fixtures draw by category, not a new element kind.** `furniture.render()` dispatches the category
  to `elements/fixtures-glyphs.ts`; a known fixture (`wc`, `basin`, `shower`, `sink`, `counter`…) draws
  a symbol and ignores its `label`, anything else falls back to the labelled rectangle. The lint rules
  key off two closed vocabularies: room-label classification through `src/vocabulary.ts`
  (`USE_VOCABULARY` + token-bounded `matchVocabulary`; an alias-only classification raises advisory
  `W_ALIAS_MATCH` with a fix) and fixture category through `src/fixtures-catalog.ts`. Corpus
  classification is pinned by `test/vocabulary-equivalence.test.ts` — fix the vocabulary, never regenerate the pin.
- **`examples/studio.arch` is import-free on purpose** (`test/world.test.ts` asserts the flagship
  compiles from a single file with no World) — use inline `furniture <fixture>` there, not imports.
- **(Sites) A bare `|` inside inline code in a Markdown TABLE cell breaks the docs build.** GFM
  splits table cells on `|` *before* inline-code parsing, so `` `anchor|centered` `` severs the
  backtick pair and any `<token>` inside leaks out as raw HTML — VitePress/Vue then fails the whole
  build with "Element is missing end tag" (took the docs deploy down for four pushes on 2026-07-12).
  Write `\|` inside table cells, and treat **`npm run docs:build` as verification for any `docs/*.md`
  edit** — the core test suite doesn't compile the site.
- **(Sites) A plain ```` ```arch ```` fence in a published page COMPILES in the reader's browser.**
  The fence rule in `docs-site/.vitepress/config.ts` rewrites every one into a live `<ArchLive>`
  widget, so an illustrative FRAGMENT (a lone `room …` line) or a deliberate error demo renders a red
  error card on the public page. `npm run docs:build` cannot catch it — the compile happens at
  runtime. Mark those fences ```` ```arch static ````: same ArchLang highlighting, no live compile.
  Two real instances: `/relational`'s opening fragment, and `/errors`, where 104 error-catalog
  examples each showed a generic `Expected "plan" but found …` instead of the code they document
  (fixed at the source — `scripts/gen-error-codes.ts` emits `arch static`). `test/docs-fences.test.ts`
  is the gate, and it pins the `static` convention against config.ts's own source.
- **(Sites) There is no dark mode — if you are writing a `.dark` rule, you are on the wrong plan.**
  (History, in case you are tempted: a partial `:global(.dark) …` selector inside a Vue `<style scoped>`
  block miscompiles to a bare `.dark { … }` rule and once inverted the whole site.) The docs site sets
  `appearance: false`, and `color-scheme: only light` in the shared `:root` is what keeps Chromium's
  Auto Dark Mode off — do not "restore" a `light dark` declaration.
- **(Sites) VitePress `.vp-doc a:hover` (specificity 0,2,1) outranks a two-class rule (0,2,0) on
  hover.** Any `.vp-doc <class> a` control whose color must survive hover has to re-assert `color` in
  its own `:hover` rule. Verify interactive states (hover/focus/active), not just static render.
- **(Sites) Nothing flips per mode any more, so a fixed hex in the site CSS is a FOSSIL** — convert it
  to a token. (The old rule was "a mode-flipping token is unsafe on ground that doesn't flip", which is
  why the CTAs and the terminal once carried literal `#b3261e` / `#f0705f`. ADR 0014 retired all of
  them.) The one legitimate literal left is the CodeMirror lint squiggle's data-URI hex — a `var()`
  cannot cross into an SVG — so keep it in step with `--redline` / `--warn-ink` by hand.
- **(Sites) The public hosts are `archlang.uk` / `playground.archlang.uk` — the old `*.vercel.app`
  URLs are gone from source (only 301 redirects + the Vercel project names remain).** If you ever
  change a public host again: grep the host **prefix without dots** (`archlang-playground`, not
  `archlang-playground.vercel.app`) — some references are regexes with escaped dots (e.g.
  `test/readme-permalink.test.ts`) that a literal-dot grep misses. Edit sources and regenerate (schema
  `$id`s in `src/plan-json.ts`/`src/intent.ts` → `gen:*-schema`; agent-context URLs in `SKILL.md` →
  `gen:llms`); never hand-edit `schemas/*.json` or `llms-full.txt`. The README `#z=` permalinks are
  base-independent, so only the host prefix swaps. Full playbook: `docs/hosting-and-domains.md`.

## Reading Order

**To USE ArchLang (author/edit floor plans as an agent):** read `spec.llm.md` (the whole language
in one page — or run `arch spec`), then follow `SKILL.md`'s loop: `spec` → write `.arch` →
`arch compile --json` → fix from each `diagnostics[].fix` → `arch describe --json` to confirm
intent. Zero install: `npx @chanmeng666/archlang …`.

**To CONTRIBUTE (work on this repo), read in this order:**
1. `README.md` — what the project is and how to run it
2. This `AGENTS.md` — how to work in it
3. `CONTRIBUTING.md` — contribution workflow and quality gates
4. `docs/testing.md` — the verification system: what runs locally, on a PR and nightly, what each
   guard enforces, and what to do when one goes red (read before adding a test or updating a pin)

## Conventions for Changes

- Follow [Conventional Commits](https://www.conventionalcommits.org/).
- Run the project's lint/test commands before proposing changes.
- Keep this file up to date when you change build steps, structure, or conventions.
- Ongoing release narrative goes in `CHANGELOG.md` only — do not re-grow per-release prose here (the
  historical narrative is archived at `docs/archive/agents-status-history-2026-07.md`).
- Release and work history is recorded in `CHANGELOG.md` **only** — do not create or append
  per-session work logs under `docs/` (the old top-level `WORK-LOG.md` is frozen in `docs/archive/`).
</content>
