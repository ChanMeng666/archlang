# Testing & verification

The map of everything that proves this repo correct: what runs where, what each guard is *for*,
and — the part a checklist usually omits — **what to do when one goes red**.

This is contributor documentation. It is not published to the docs site (it is absent from
`sync-docs.mjs`'s `PAGES` table on purpose), so nothing here is agent-facing language surface;
for that read `spec.llm.md` / `SKILL.md`. Read this before adding a test, before blessing a
snapshot, and before believing a green run means more than it does.

---

## 1. The three tiers

### Tier 1 — local

| Command | What it runs |
|---------|--------------|
| `npm test` | the whole vitest suite: `test/`, `playground/test/`, `packages/*/test/`, `editors/vscode/test/` (the include list lives in `vitest.config.ts`) |
| `npm run check` | `typecheck` + `lint` (Biome) + `check:test-wiring` + `npm test` — the pre-push gate. **Its `typecheck` does not compile `test/`** — only `typecheck:all` does, so a type error in a test file passes `check` |
| `npm run check:test-wiring` | fails if a tracked `*.test.ts` falls outside `vitest.config.ts`'s `test.include` globs (it would silently never run), or if an include glob matches nothing. Parses the globs out of the config rather than duplicating them |
| `npm run check:drift` | every `gen:*` generator re-run and byte-compared against its committed artifact. **Separate from `check` — it is its own CI gate** |
| `npm run typecheck:all` | the full-repo typecheck: root `tsconfig.dev.json` (`src` + `test` + `eval` + `dataset` + `scripts` + `bench`) then playground, docs-site (vue-tsc), `packages/mcp`, `editors/vscode` |
| `npm run docs:build` | the only thing that compiles the VitePress site. **The core suite never does** — any `docs/*.md` edit needs this |
| `npm run test:coverage` | vitest + v8 coverage over `src/` only. Report-only: no thresholds, nothing fails on a number |
| `npm run e2e:playground` | Playwright (chromium) against the **built** playground. Needs `npm run build && npm run playground:build:only` first — `vite preview` only serves `playground/dist/` |
| `npm run e2e:docs` | Playwright against the **built** docs site. Needs `npm run build && npm run docs:build:only` first |
| `npm run eval:ci` | the offline 26-brief authorability golden gate (no API key). The live harnesses are owner-only and paid |
| `npm run eval:fidelity` | the **intent-fidelity slice** (v1.25): deliberately infeasible briefs where *declaring infeasibility* is the scored-correct answer, plus a **judge-free, deterministic** laundering detector. Its own corpus (`eval/corpus-fidelity.json`) and its own scorecard; **it shares no ruler with `eval:ci` and the two numbers must never be compared** |

`npm run check` + `npm run check:drift` is the honest local minimum. Add `typecheck:all` when you
touched anything outside `src/`+`test/`, and the matching E2E when you touched `playground/` or
`docs-site/`.

### Tier 2 — PR (every push to `main`, every pull request)

`ci.yml` runs five **gating** jobs in parallel plus one informational one; `codeql.yml` is a
sixth check on the same events. Each row says what that job **alone** catches — the reason it is
not redundant with the others.

| Job (workflow) | Gates? | What it alone catches |
|----------------|--------|-----------------------|
| `build` — Node 18/20/22 matrix (`ci.yml`) | yes | everything the suite asserts, on all three supported runtimes; plus `typecheck`, `lint:ci`, `check:drift` and `eval:ci`. The Node 22 leg swaps `npm test` for `test:coverage` and posts a report-only step summary + artifact |
| `builds` — workspace builds (`ci.yml`) | yes | the four downstream workspaces actually COMPILE (docs site, playground, MCP shim, VS Code extension) — the core suite compiles none of them. Also `typecheck:all`, the MCP baked-resource freshness check, and the VS Code bundle tests (which need the built `dist/server.js`) |
| `windows` (`ci.yml`) | yes | line-ending and path regressions, at the runner's DEFAULT git settings — no `core.autocrlf` override, because the point is to fail if `.gitattributes`' `* text=auto eol=lf` ever stops holding |
| `e2e-playground` (`ci.yml`) | yes | the assembled page in a real browser: boot, edit, apply a fix, download every format, the embed page. Its first run found a live bug (`setPointerCapture` retargeting click-to-source) that `tsc`, vitest and `vite build` are all structurally blind to |
| `e2e-docs` (`ci.yml`) | yes | the machine routes (`/<page>.md`, `/llms-full.txt`, both schemas, the GBNF, the gallery SVGs) actually resolve, and `<ArchLive>` hydrates into a live compiler — a `srcExclude` mistake 404s a machine route while the site still builds and looks perfect |
| `analyze` (`codeql.yml`) | yes | injection/taint paths, default query suite. Also runs weekly on cron: an existing path gets re-flagged when GitHub ships new queries, with no code change |
| `bench` (`ci.yml`) | **no** | per-stage timing deltas vs `bench/baseline.json`, posted as a create-or-update PR comment. Runner-dependent, so it never gates |

The core build once ran alone. The three jobs added around it exist because a green suite proved
nothing about the sites, the shim, the extension, Windows, or a real browser.

### Tier 3 — nightly (`nightly.yml`, cron 03:00 UTC + `workflow_dispatch`)

Checks that talk to the outside world, are too slow per-PR, or would be noise as a merge gate.

| Job | What it is for |
|-----|----------------|
| `prod-smoke` | `scripts/smoke.mjs` against both live origins. A deploy can go green and the site rot later (DNS, cert, project setting) |
| `audit` | `npm audit --omit=dev --audit-level=high` + `npm audit signatures`. **Report-only** — advisories never fail the workflow; a broken `npm ci` does |
| `secrets` | gitleaks over the WHOLE history (`fetch-depth: 0`) — a credential committed and later removed is still leaked |
| `full-matrix` | ubuntu 18/20/22 + windows 22. Deliberately redundant with the PR matrix; nightly is where the extra OS leg is worth paying for |
| `e2e-prod` | the `@prod`-tagged READ-ONLY Playwright subset against production via `E2E_BASE_URL`. No build, no preview server. Its docs half is also a **deploy-staleness probe**: it compares production's raw `/<page>.md` bytes against this checkout of `main` |
| `report` | the single writer for the pinned issue (marker `<!-- archlang-nightly -->`). One `always()` job, so two jobs can never race to create the issue twice |

---

## 2. Guard inventory

Each entry: the law it enforces, where it lives, and the red-run response. **"Regenerate" and
"consciously update the pin" are different actions** — the third column says which one applies.

### Goldens and snapshots — three kinds, three update paths

| Kind | Where | When it goes red |
|------|-------|------------------|
| vitest inline/file snapshots | `test/__snapshots__/*.snap` (SVG, Scene IR, error-SVG, accessible SVG) | **Read the diff first.** `compile()` is byte-stable by iron law, so an unexplained change is a regression, not a snapshot to bless. Only then `vitest -u` |
| visual-regression goldens (PNG) | `test/__goldens__/*.png`, driven by `test/visual.test.ts` (resvg + pixelmatch) | same rule, then `UPDATE_GOLDENS=1 vitest run test/visual.test.ts`. **A missing `@resvg/resvg-js` is a HARD FAILURE under `CI`** and a visible skip locally — it used to be a silent vacuous pass |
| ASCII plan goldens | `test/__ascii__/*.txt`, driven by `test/ascii.test.ts` | same rule, then `ASCII_UPDATE=1 vitest run test/ascii.test.ts` |

Never run an update env var to make a red suite green. Justify every changed byte or fix the
source.

### Drift generators — `npm run check:drift`

Nine generators, twenty-three artifacts (the gate prints the total on every run — `✓ all 23
generated artifacts are in sync with their sources`, so read it there rather than counting); the
authoritative list is the `GENERATORS` table in
`scripts/check-drift.ts` and it is mirrored in [CONTRIBUTING.md](../CONTRIBUTING.md#ci-drift-gates-regenerate-before-you-push).

**Red ⇒ regenerate, never hand-edit.** Run the matching `npm run gen:*` (or `npm run gen:all`,
which orders `gen:spec` before `gen:llms`) and commit the output.

**The limit of this gate, which matters more than the gate:** it compares generator *output* to
the committed file, so it proves **reproducibility, not correctness**. A generator that hardcodes
a language fact reproduces the same wrong text forever (`gen-llm-spec.ts` shipped a v1.12 CLI for
three releases while drift stayed green). Derive from the source of truth; give each generator a
guard that fails when a source-of-truth entry has no rendering.

**`gen:example-svgs` — the thirteen drawings the README embeds.** The newest generator, and the one
that shows what an *un*-gated derived artifact costs. `examples/studio.svg`, `two-bed.svg` and
`attached.svg` were hand-committed and never re-rendered, so for months the README's hero and
gallery showed a building compiled before the opening-void fix, the fixture-orientation fix, the
miter-limit cap and the label-placement pass — four separate rendering changes, invisible because
the only way to notice was to look at the picture. `scripts/gen-example-svgs.ts` renders them from
their `.arch` sources; `test/example-svgs-drift.test.ts` is the gate and does two jobs:

| Law | Red ⇒ |
|-----|-------|
| every `README_SVGS` file on disk equals an in-memory `compile()` of its source | `npm run gen:example-svgs`, then **look at the drawing** before committing — a moved golden here is a rendering change, and the picture is the review |
| the curated list and the README's `<img>` tags agree **in both directions** | a `./examples/<n>.svg` in the README with no `README_SVGS` entry is an ungated drawing that will rot; a listed name the README never embeds is dead weight. Add or remove the `<img>`, or edit the list |

The list is curated on purpose — committing an SVG per `.arch` would put 28 large blobs in every
diff for no reader — which is exactly why the second law exists: a curated list is only honest
while something pins it to what the page actually shows.

### Lockstep pins — duplications that exist on purpose

Each of these is a place two copies must agree because they *cannot* share an import.

| Guard | Law | Red ⇒ |
|-------|-----|-------|
| `test/site-lockstep.test.ts` | the brand token block is byte-identical in `playground/src/styles/tokens.css` and `docs-site/.vitepress/theme/style.css`; the eight `--syn-*` colours agree across **four** places (both token blocks, `scripts/gen-grammars.ts` fallbacks, the `archlangLight` Shiki theme); the CodeMirror squiggle data-URI hexes track `--redline` / `--warn-ink` | change the OTHER copy too, then `npm run gen:grammars`. Located by content anchors, so moving a block is fine and changing a value is not |
| `test/brand-assets.test.ts` | every file the two sites publish under `public/brand/` is byte-identical to `brand/`, and both sites publish the same set | re-copy from the master kit. Never edit a copy. A genuinely site-only file goes in `SITE_ONLY` with a comment |
| `test/share-codec.test.ts` | the `#z=` permalink codec's three implementations (`playground/src/share.ts` — canonical, `scripts/gen-permalink.mjs`, the inline copy in `ArchLive.vue`) decode each other | a changed pinned hash means the SCHEME changed, which breaks every link ever shared. Fix the copy, do not re-pin. Documented non-law: level-9 vs level-6 deflate means large payloads differ byte-wise — decode-compatibility is the contract |
| `packages/mcp/test/lockstep.test.ts` | both of `server.json`'s version fields equal `package.json`'s; `mcpName` equals `server.json`'s `name`; the core dep range is exactly `^` + the root version; the copy-resources list equals the server's registrations | see "MCP pack gates" below — the dep-range assertion is **intentional friction**, not a bug |
| `editors/vscode/test/stdio.test.ts` (bundle freshness) | esbuild stamps `__CORE_VERSION__` into `dist/server.js`; the test asserts it equals the resolved core version | rebuild the extension (`npm run vscode:build:only`). This replaced the by-hand "count symbols in the bundle" release probe |
| `editors/vscode/test/lockstep.test.ts` | the extension declares `@chanmeng666/archlang` in exactly one dependency map, and that range is a **string** equal to `^` + the root version | **intentional friction**, same as the MCP shim's — re-pin the range, never relax the check. Distinct from `stdio.test.ts` above: that one asserts the BUNDLE is fresh, this one asserts the MANIFEST is honest. The distinction is not academic — the range sat two releases stale at `^1.24.0` while the stamp test stayed green the whole time, because esbuild resolves the workspace symlink regardless of what the manifest declares |
| `test/docs-sync-list.test.ts` | the docs gallery is DERIVED from `readdirSync("examples")` minus a documented `EXCLUDED_EXAMPLES` table; nothing `sync-docs.mjs` writes is git-tracked; `examples.md` has an `<ArchLive>` per gallery example | a new example needs a paragraph on `examples.md`; a new exclusion needs a reason that would survive review; a tracked generated file needs untracking |

### Docs tripwires — prose that can break a build or lie to an agent

| Guard | Law | Red ⇒ |
|-------|-----|-------|
| `test/docs-table-pipes.test.ts` | no bare `\|` inside a code span inside a Markdown table row. GFM splits cells before inline parsing, so the backtick pair is severed and any `<token>` leaks as raw HTML — VitePress then fails the whole build with "Element is missing end tag" (four dead deploys, 2026-07-12) | write `\|` in the cell. Scans **every tracked `.md`**, with no exclusions at all, this file included. Re-adding an exclusion means a file stops being checked |
| `test/docs-fences.test.ts` | every ```` ```arch ```` fence on a **published** page compiles with zero errors, or carries the `static` opt-out. The site rewrites plain fences into live `<ArchLive>` widgets, so an illustrative fragment renders a red error card to readers | fix the example, or mark it ```` ```arch static ````. Its scan set is the hand-written `docs-site/*.md`, the repo sources in `sync-docs.mjs`'s `PAGES`, and `docs/adr/*.md`. `npm run docs:build` cannot catch this — the compile happens at runtime in the reader's browser |
| `test/docs-flags.test.ts` | every `arch <cmd> … --flag` written in a hand-maintained doc is a flag that command actually declares in `src/manifest.ts` (the `docs-site/agents.md` page once told agents to run a flag `fix` never accepted) | fix the prose or add the flag properly. Its scanned list is the `DOCS` array at the top of the file — it includes `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `SKILL.md`, `llms.txt` and the `.claude/` command files |
| `test/readme-permalink.test.ts` | every playground `#z=` permalink in README / `SKILL.md` / `llms.txt` / hand-written docs-site pages decodes to an example's exact bytes AND compiles clean | regenerate the link with `scripts/gen-permalink.mjs`; never hand-edit a hash |

### Public-surface closure — `test/public-surface.test.ts`

`src/index.ts` is the only public surface, and it can be *incomplete* without anything inside the
repo noticing: every module here imports its neighbour by real path, so a type that never leaves
`index.ts` still resolves everywhere except in a downstream consumer's editor. That is how five
types reachable from `describe()`'s result — including the `Access*` trio the self-correction loop
tells models to read — shipped readable but **unnameable**.

The guard runs the TypeScript compiler over `src/index.ts`, walks `SceneSummary`'s declaration
transitively through every type reference into whatever `src/` module declares it, and asserts each
name is in `index.ts`'s export set. **The requirement list is derived, never retyped** — add a
field whose type lives in an unexported module and this goes red with no edit to the test. **Red ⇒
re-export the named type, routed through the module that surfaces it** (the `Access*` types are
declared in `analyze.ts` but leave through `describe.ts`, because `describe()` is the only public
value that hands them to you).

### Byte-identity laws — the shape every language feature ships with

Every feature added since v1.20 carries the same law: **a plan that does not use the new form is
byte-identical**, and a test pins it. That is what makes a new keyword safe to add to a published
language, and it is why the golden files above almost never move.

| Guard | Law | When it goes red |
|-------|-----|------------------|
| `test/site.test.ts` | a plan with no `site` block renders, describes and lints exactly as before; and `north` is **deliberately absent** from `KEYWORDS.enum` | The absence pin is the interesting one: three of four compass words sit in `enum`, which looks like an oversight and invites a "fix" that would make `north` the first word in two categories and force both generators to learn about duplicates. **Do not delete this test to add the word** |
| `test/doors.test.ts` | a plan naming no door kind is byte-identical, and `door hinged …` is identical to omitting the word | A diff here means a kind leaked into the default path |
| `test/window-facing-probe.test.ts` | a window's outward side comes from probing its own wall, not the plan's bbox centre — with both courtyard reproductions and both tie-break branches | See the bbox-derived-position iron law in AGENTS.md |
| `test/bbox-derived-position.test.ts` | `swing into <room>` and `furniture … against wall` ask the room's ring, not its box; rectangles stay byte-identical | Also pins the two `dimReach` properties that make leaving it alone safe — it was measured as a provable no-op and deliberately NOT "fixed" |
| `test/dim-stagger.test.ts` | `EM_PER_CHAR` lives in exactly ONE file (`src/text-metrics.ts`) | A fifth copy of the em-per-char factor appeared. The lint rule, the stagger and the renderer must agree about what collides |
| `test/lint-file-provenance.test.ts` | a lint fix on an element written in an imported module carries `file`, so `applyFixes` refuses it | Red means `applyFixes` can once again splice a module's byte offsets into the importer — reproduced on an unmodified `W_DIM_INSIDE` before the fix |
| `test/levels.test.ts` (corpus sweep) | a plan with no `level` block has no `pages`, no `LEVEL` title-block row and no `level` on any diagnostic; a plan WITH one compiles to more than one page | **The split is derived, not listed.** It used to exclude `two-storey.arch` *by filename*, which meant a second multi-storey example could silently join the level-free sweep (failing for the right reason under the wrong name) or silently dodge the paging check. `HAS_LEVEL = /^\s*level\s+-?\d+/m` reads the source instead, both sides are asserted non-empty, and `townhouse.arch` joined with no edit to the test |
| `test/roof-void-byte-identity.test.ts` | a plan using neither `roof` nor `void` renders, describes and lints exactly as before | The digests are **hardcoded**, measured against v1.28.0's `src/` by checking that tree into the worktree — a test that compiled twice and compared would prove determinism and stay green through a change that moved every byte. Two things to carry when you measure the next one: take the baseline with the **same `digest()` body the test will run** (a scratch script whose payload separator differed by one character produced four false failures here), and keep the payload the whole agent-facing surface — SVG, `describe()` **and** `lint()` — since an element that quietly appends an empty summary key leaves the drawing untouched and still changes behaviour for every `arch describe --json` consumer. The four fixtures are chosen, not arbitrary: the two the track edits (`bungalow`, `two-storey`) are excluded on purpose, and the rest span an all-rectangle dwelling, the flagship, a CONCAVE polygon plan (whose ring code the roof's offset shares a module with) and a CURVED plan on `paper` (whose auto-fit reads the same `planBounds` a roof now grows) |

### The fixture-symbol layer — one snapshot file, three different promises

`test/fixture-byte-identity.test.ts` pins WHOLE SVG documents rather than scene objects or primitive
counts, because what matters is whether the bytes a user's `arch compile` writes moved. Its three
groups look alike and **must not be blessed alike** — read the group header before you reach for
`-u`:

| Group | What it holds | When it goes red |
|-------|---------------|------------------|
| 1 — **PERMANENT** | a plan with no furniture, and a plan whose category the language does not know | **A bug, never a re-blessing.** Neither has any business changing when a glyph is drawn: the first never reaches the glyph layer, the second is the labelled-rectangle fallback. If a phase that draws a bed moves one of these it did something to the shared path — a changed factory default, a stray node, a re-tagged paint. Find out why |
| 2 — the eight shipped families | one minimal plan each, at the family's catalogued footprint | Deliberately re-blessable. A phase that redraws these WILL move them, and each diff is to be read and explained rather than accepted |
| 3 — the four v1.29 families | `rug`, `sofa_l`, `piano`, `sun_lounger` | Same terms as group 2. Three of the four have no catalogued footprint on purpose, so their sizes are stated where the group is written rather than looked up |

Around it sit three more guards, each answering a question the snapshots cannot:

- **`test/glyph-lib.test.ts`** — the two laws that let the eight shipped families be re-tagged with
  semantic line weights without moving a byte. A factory's named `lineWeight` and its raw
  `paint.width` must agree (**the SVG serializer follows the name, the PDF serializer follows the
  number**, so setting one and not the other makes the two exports draw different thicknesses from
  the same node), and a dashed segment's two dash fields must agree — read back OUT of the rendered
  SVG, never by comparing the module's constant to itself. It isolates a node by **difference**:
  same plan rendered with and without it, on a furniture-free base, so "the first `<polygon>`" can
  never silently be the room floor.
- **`test/furniture-curves-backends.test.ts`** — the v1.26.1 lesson applied *before* the fact. The
  furniture pass had only ever carried polygons, lines and text; `glyph-lib` was about to put the
  first `circle` and `arc` on it, so all four serializers are proven to actually DRAW one. It
  hand-builds the Scene rather than waiting for a glyph to exist (no test-only `ElementDef`, no
  registry mutation, nothing in `src/` that ships), every assertion is **differential** against the
  same Scene without the two nodes, and the plan is deliberately door-free so the base drawing
  contains no curve of its own — a backend that silently dropped the primitives would otherwise
  produce identical output and pass. Its pdfkit half follows the optional-dep rule below: required
  in CI, a visible named skip locally.
- **`test/glyphs-batch2.test.ts`** — `underlay` proved by its **consequences, in both directions**,
  because the exemption must not degrade into "overlap checking is off". A rug under a sofa raises
  nothing; two ordinary pieces overlapping still raise `W_FURNITURE_OVERLAP`; and two *rugs*
  overlapping each other still raise it too. The walkability half runs the same plan, same
  footprint, same position with one word different — through a `rug` the far room is reachable,
  through a `piano` it is cut off and `W_ROOM_NO_CLEAR_PATH` fires — and drives **both** the
  whole-plan nav grid and the per-room flood fill, since they are separate code paths that must not
  disagree about what a rug is.

### Cross-feature gates — what neither branch can prove alone

`test/v129-cross.test.ts` exists because of the merge law in AGENTS.md: **a clean auto-merge is not
evidence.** The v1.29 tracks were authored on parallel branches and touched one file in common, the
nav grid's obstacle list in `src/analyze/circulation.ts` — one branch appended the void obstacles to
that literal, the other wrapped the furniture entry in `solidFurniture()`. Git merged both cleanly,
and neither branch's suite can fail if the other half of the literal is dropped, because neither has
a fixture using both. The discriminating case puts a rug and a void on the **same rectangle**,
spanning the only route between two rooms, with a `sofa` control on that identical rectangle to
prove the geometry really does seal: drop `solidFurniture` and the rug seals the plan, drop the void
obstacle entry and the void does not.

**Write one of these whenever two branches edit a shared literal or a shared predicate**, and put
the control case on the identical geometry — a fixture that only shows the new behaviour cannot tell
"it works" from "the check never ran".

### Property and fuzz suites

| Guard | Law |
|-------|-----|
| `test/escape-fuzz.test.ts` | hostile strings (control chars, lone surrogates, `]]>`, breakout payloads) through eight injection sites × the SVG paths (default / annotate / accessible / error-SVG), the ASCII plan and DXF: the payload never becomes structure, the output is well-formed in its own format, and determinism holds. Backed by `src/text-safe.ts` (`xmlText` / `plainText`), which is the identity on well-formed text — hence zero golden churn |
| `test/fuzz.test.ts`, `test/security.test.ts` | parser robustness and known-payload spot checks. Fuzz asserts properties; `security.test.ts` asserts specific payloads |
| `test/dataset.test.ts` | the permanent contamination iron law (holdout never published, canary never regenerated, double dedup). Getting this wrong voids the eval forever |

A shrunk counterexample that fast-check finds gets **pinned as a regression case** in the suite —
that is what the "shrunk regressions" block at the bottom of `escape-fuzz.test.ts` is, each one a
concrete bug the properties found, next to a control asserting a well-formed plan is untouched. Do
not delete a pin to go green.

### MCP pack gates — the 0.2.2 staleness class

The shim bakes the agent-context artifacts (spec, `llms-full`, both schemas, the GBNF grammar)
into `dist/` at build/pack time, so a stale-but-well-formed resource is indistinguishable from a
fresh one to any host. Published 0.2.2 handed hosts a v1.19 grammar that could not decode
`paper`/`level`/`place`/`zone`/`polygon`/`arc` beside a `^1.14.0` range resolving to a current core.

Two automated gates now cover it, and they replaced a by-hand `npm pack` probe:

- `packages/mcp/scripts/check-dist-resources.mjs` — run in CI's `builds` job right after
  `mcp:build:only`, byte-compares every copied resource against its repo source and prints which
  file diverged at which byte. **Red ⇒ `npm run mcp:build`.** If the repo artifact is itself stale,
  `npm run gen:all` first.
- the dep-range assertion in `packages/mcp/test/lockstep.test.ts` — a **string** equality against
  `^` + the root version, not a semver-satisfies check. **Every core release turns this red on
  purpose**, so the shim cannot silently keep serving last release's resources. **Red ⇒ consciously
  re-pin the range, rebuild the resources, and bump the shim's version in BOTH
  `packages/mcp/package.json` and BOTH of `server.json`'s version fields.** Never relax it to a
  range check to green a core release.

Remember the standing law that makes this matter: a refreshed resource only reaches a host **with
a version bump** — `release.yml` `npm view`-skips a version already on the registry.

### E2E — the same specs, two modes

| Mode | How | What it means |
|------|-----|---------------|
| local / PR | `npm run e2e:playground` / `npm run e2e:docs`; the config's `webServer` runs `vite preview` / `vitepress preview` over the BUILT output | the artifact that deploys is under test — asset paths, chunk splitting, the `base: "./"` rewrite |
| production | `E2E_BASE_URL=<origin>` + `--grep @prod` (nightly's `e2e-prod`) | the `webServer` key is **omitted** (not disabled — Playwright would still start it), so there is no build and no server. This is why every spec navigates relatively, e.g. `page.goto("/")` |

**Red in `e2e-prod` means production is broken or STALE, not that a PR is bad.** The docs
byte-equality cases compare the live origin against the checkout, so a silently-failed deploy fails
the night. Reports upload as artifacts on failure (`playwright-report*`).

### Post-deploy smoke — `scripts/smoke.mjs`

Zero-dependency plain Node, used by both `deploy.yml` and nightly. It replaced a root-URL `curl`,
which proved only that *something* answered. It checks the machine contract: on the docs site every
machine route, every raw `/<page>.md` copy and one SVG per gallery example; on the playground the
shell page and the embed page — each including the hashed JS entry parsed out of its own HTML — plus
a brand asset. Route lists are **parsed out
of `sync-docs.mjs`'s tables**, so a new page or example joins the smoke test the day it lands.
Retries 6× / 5s apart on a network error or non-200 (alias propagation); a 200 whose **body** fails
its assertion is never retried — waiting cannot fix wrong bytes.

### Coverage — a map, not a gate

`npm run test:coverage` (CI: the Node 22 leg only) measures v8 line/branch coverage over `src/`
alone — the harnesses do the measuring, counting them would inflate the number and say nothing
about the compiler. **There are no thresholds and nothing can fail on a coverage number**, by
design: `npm test` stays the single pass/fail signal and nobody games a percentage. Read it as a
map of what the suite reaches.

The one thing a total cannot show is a module that fell to **zero** — it is one row among the ~120
under `src/` and invisible in a four-line summary. `scripts/coverage-zero-report.mjs` names them in the Node-22 step
summary. It is advisory in the strongest sense: it catches its own errors and forces exit 0, so it
can never turn a green run red, and it adds no thresholds.

Read its output with one caveat it states itself: a module lands on that list either because it is
genuinely unexercised **or because it only ever runs in a child process**. The four current entries
are all the second case — `test/cli*.test.ts` `spawnSync`s the real `arch`, so v8's in-process
counters never see `src/cli.ts` or `src/cli/` however well they are tested. There is deliberately no
allowlist: suppressing the known entries would recreate, one level up, exactly the "nobody notices
the zero" failure the report exists to fix.

---

## 3. Adding tests for new code — the house patterns

**Derive, never retype.** A guard that hand-lists what it checks is the next stale generator. The
in-repo pattern is to **parse the source of truth**: `test/docs-fences.test.ts`,
`test/docs-sync-list.test.ts` and `scripts/smoke.mjs` all parse `sync-docs.mjs`'s literal
`["src", "dest"]` tuple tables; `check-dist-resources.mjs` extracts its resource list from
`copy-resources.mjs`; `test/docs-flags.test.ts` reads `buildManifest()`. If you must parse a
literal table, assert the shape too, with an error message that tells the next person to fix both
parsers together.

**Anchor on content, not line numbers.** `site-lockstep.test.ts` finds the token block by its
header comment and the enclosing `:root {`. Moving code is then free; changing a value is not.

**MCP: drive the server, don't call the handlers.** `packages/mcp/test/helpers.ts` links a real
`Client` to a real server over the SDK's in-process `InMemoryTransport`. What is under test is the
*wiring* — tool registration, zod input schemas, the text-content projection — not the core
functions, which have their own root-level suites. Malformed args must come back as an MCP error
result, never a throw (`fuzz.test.ts`).

**VS Code: inject, don't import.** Language services arrive through the `CoreLsp` interface in
`editors/vscode/src/handlers.ts`, so a handler takes document TEXT and returns an LSP payload with
no `Connection`, no `TextDocuments`, no process. `server.ts` is pure plumbing. Test the logic
there; test the ARTIFACT in `stdio.test.ts`, which spawns the built bundle with `--stdio` and
speaks real LSP to it.

**Playground: extract the pure part.** Behaviour-preserving refactors moved the view math, hit
testing, embed params and raster clamping into pure modules (`pan-zoom.ts`, `interact.ts`,
`embed-params.ts`, `raster-export.ts`, …) which `playground/test/` unit-tests directly. Anything
needing a real DOM, a real pointer or a real download belongs in `playground/e2e/`.

**A missing optional dependency must SKIP visibly and FAIL in CI.** The rule both
`test/visual.test.ts` (resvg) and `editors/vscode/test/stdio.test.ts` (the built bundle) follow: a
suite may never go green having asserted nothing. Gate on `process.env.CI` (or an equivalent
"CI has built this" signal) and make the missing prerequisite a hard failure there.

**Tagging `@prod`.** Only tag a case if it **purely navigates, reads and asserts**: no downloads,
no clipboard, no form submission, no persisted state, no typing flows. It runs against the live
sites. Tag placement is per-file policy and each spec documents its own choice in a header comment
(whole-file, one describe, or per test) — follow the file's stated rule, and a new `describe` in a
per-describe file must opt in explicitly.

**Docs you write are scanned too.** Any Markdown you add is checked by
`test/docs-table-pipes.test.ts` (all tracked `.md`); a *published* page is additionally checked by
`test/docs-fences.test.ts`; a doc on `docs-flags.test.ts`'s `DOCS` list has its `arch …`
invocations checked against the manifest. Publishing a page means adding it to
`sync-docs.mjs`'s `PAGES` — which also enrols it in the smoke test and the docs E2E.

---

## 4. Gotchas

**A file's compiler options come from the PROGRAM compiling it, not from the tsconfig nearest it —
and `exclude` cannot hold a file out of a program it was IMPORTED into.** `tsconfig.dev.json`
checks `test/` and excludes the workspaces, but a root test importing
`../playground/src/share.js` pulls that module into the ROOT program, where
`noUncheckedIndexedAccess` is ON; the playground config's deliberate relaxation does not travel.
So any workspace module a root test imports is compiled once per leg of `typecheck:all`, under two
option sets, and must satisfy the stricter one. Symptom: a `TS2345 … | undefined` on workspace
source that `tsc -p <workspace>` calls clean. Probe with `tsc -p tsconfig.dev.json --listFiles` to
see which files the program really pulls in, and fix it IN the shared module — never by relaxing
the root option or adding an exclude. (Also in AGENTS.md → "Gotchas & Anti-patterns".)

**The core suite never compiles the docs site.** `npm run docs:build` is the only gate for a
`docs/*.md` edit's effect on the site; the pipe and fence tripwires catch the two failure classes
that reach readers, not the whole build.

**Node below 21.2 has no `deflate-raw` in the Web streams API.** The `#z=` codec correctly falls
back to the uncompressed `#src=` form there, so compressed expectations are **capability-gated**
(`test/share-codec.test.ts`, `playground/test/share.test.ts`) and the pinned payloads decode via
`node:zlib` unconditionally. The docs E2E legs pin Node 22 for the same reason.

**The vitest include list spans four workspaces.** A test placed outside `test/`,
`playground/test/`, `packages/*/test/` or `editors/vscode/test/` silently never runs. Check
`vitest.config.ts`.

**`editors/vscode` tests need the built extension.** The plain test matrix builds nothing and skips
`stdio.test.ts` by design; CI's `builds` job runs `npx vitest run editors/vscode` *after* building
it. Locally: `npm run vscode:build:only` first, or accept the visible skip.

**`npm run dev` at the repo root is `tsup --watch`, not a web server.** The sites are separate Vite
apps (`npm run playground:dev` / `npm run docs:dev`).
