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
| **Core package** | `@chanmeng666/archlang@1.29.0` — **PUBLISHED and live** (probed 2026-08-27, `npm view @chanmeng666/archlang dist-tags --json` → `{"latest":"1.29.0"}`, carrying a SLSA provenance attestation). Released tokenlessly via `.github/workflows/release.yml` OIDC trusted publishing, with provenance | npmjs.com/package/@chanmeng666/archlang |
| **Agent interface** | the `arch` **CLI** (`--json`, exit codes, stdin — incl. `ast`/`complete`/`fix`/`suggest`, `compile --from-json`/`-f txt`, `validate --graph`, v1.14's `validate --intent`/`--feedback` + `score --brief`, and the v1.17 **self-describing + bounded-output** layer: manifest-rendered per-command `--help` with worked examples, `--version`, exit-3 did-you-mean on an unknown flag/verb, `describe --room/--select`, `lint\|validate --code/--severity`, `context --section`, `fix --dry-run/--backup` + unified diff) + `SKILL.md` + `spec.llm.md` + **`llms-full.txt` / `arch context`** + **`schemas/plan.schema.json`** + **`schemas/intent.schema.json`** + **`grammars/archlang.gbnf`**. Primary interface stays the CLI; an **optional MCP shim** (`packages/mcp`) is a discoverability channel, not a replacement | `src/cli.ts`, `SKILL.md`, `spec.llm.md`, `llms-full.txt`, `packages/mcp` |
| **MCP server** | `@chanmeng666/archlang-mcp@0.2.9` — **PUBLISHED and live on both registries.** Probed 2026-08-27: `npm view @chanmeng666/archlang-mcp dist-tags --json` → `{"latest":"0.2.9"}`, and the MCP registry entry `io.github.ChanMeng666/archlang-mcp` reads `version` **0.2.9**, `updatedAt` 2026-08-26T11:50:59Z — the same minute as the v1.29.0 GitHub Release. **Probe the MCP registry with `?version=latest`** — the bare `GET /v0/servers?search=…` returns the FIRST-published entry, which for this server is `0.1.1` from 2026-07-10, carrying its long-dead `archlang-docs.vercel.app` website URL; reading that as "the registry never got the updates" is wrong. `packages/mcp/`; stdio shim over the library; tools compile/describe/lint/validate (incl. `intent`)/**score**/repair/fix/suggest/complete + spec/context/schema/**intent-schema**/grammar resources; SDK dep quarantined here, core stays zero-dep). **Its context resources are baked in at pack time and only a version bump ships fresh ones** — the staleness itself is no longer silent: CI's `builds` job runs `packages/mcp/scripts/check-dist-resources.mjs` (byte-compares every baked `dist/` resource against its repo source) and `packages/mcp/test/lockstep.test.ts` pins the core dep range as a **string** equal to `^` + the root version, so every core release turns this package RED on purpose until someone re-pins, rebuilds the resources and bumps the shim in both `package.json` and both of `server.json`'s version fields (don't relax it to a semver-satisfies check). **History — the same law, seven releases running, so read the SHAPE and not the roll-call.** 0.2.2 is the original defect and the only one whose cause was anything but staleness: it served the v1.19 spec *and a v1.19 GBNF that could not decode* `paper`/`level`/`place`/`zone`/`polygon`/`arc`, while its `^1.14.0` range happily resolved to a current core — a host got a grammar and a compiler from different languages and nothing said so. 0.2.3 is the only one since that changed shipped CODE: it refreshed all five resources, pinned the range to `^1.24.0`, returned every storey of a multi-storey `compile` in `pages[]` (+ a `level` selector) instead of the ground floor alone, and derived the handshake version from `package.json` (the old hardcoded `"0.2.0"` drift, now test-pinned). **0.2.4 through 0.2.9 are six consecutive VERSION-BUMP-ONLY releases** — `git diff <prev-tag>..main -- packages/mcp` empty every time — each existing solely to ship refreshed baked resources, which is exactly the case the pack-time law describes. What moved, in one line each: **0.2.4** all five, for v1.25's `site` layer and door kinds; **0.2.5** three (`spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`) in v1.26.0, so published 0.2.4 was handing hosts the wrong furniture syntax **and** a grammar that let a constrained decoder emit uncompilable output; **0.2.6** exactly one (`llms-full.txt`, carrying `W_DIM_INSIDE`'s corrected fix prose) — the cheapest possible instance; **0.2.7** three again in v1.27.0, all carrying the `on <wall> at <pos>` expression form plus `E_PARSE`; **0.2.8** two (`spec.llm.md`, `llms-full.txt`) in v1.28.0 for the widened fixture list `spec.llm.md` interpolates from `CANONICAL_FIXTURES`, while the GBNF and both schemas stayed **byte-unchanged** — correctly, because the furniture vocabulary is a catalogue, not a grammar token; **0.2.9** three in v1.29.0, and the sharpest instance of the law since 0.2.2 because the GRAMMAR moved: `roof` and `void` are real tokens, so published 0.2.8's GBNF cannot DERIVE either statement — a constrained decoder pointed at it is not merely mis-taught, it is *unable to emit the new syntax at all*. Both schemas are byte-identical there and correctly so: neither element enters Plan JSON. **Two mechanics worth carrying:** measure what moved by unpacking the PUBLISHED tarball and SHA-256'ing each baked file against the repo tree, not by diffing the tag (the tag tells you what the repo changed, not what the last pack shipped); and re-pin the range to `^` + the new core version every release — it is `^1.29.0` now | `packages/mcp/`, `server.json` |
| **VS Code extension** | **`0.18.0` — LIVE, uploaded 2026-08-26** against core 1.29.0. **Confirmed** via the gallery API (`extensionquery`, `filterType: 7` = `ChanMeng.archlang`): `0.18.0` is the only version the gallery returns, `lastUpdated` 2026-08-26T13:36:09Z — re-probed 2026-08-27 and unchanged. The `.vsix` at `editors/vscode/archlang-0.18.0.vsix` (463.2 KB, 12 files) was verified from INSIDE the archive BEFORE the upload, which is the order to keep: `Identity Version="0.18.0" Publisher="ChanMeng"` in `extension.vsixmanifest`, manifest `0.18.0` with dep `^1.29.0`, and `ARCHLANG_CORE_VERSION = "1.29.0"` the only core version literal in `dist/server.js` (an unquoted `\b1\.\d+\.\d+\b` scan of the whole bundle returns exactly two matches, and reading their context shows the other is the unchanging `"@scope/name:1.0.0"` example inside the import-diagnostic message — scan unquoted and read the context, since a `"1\.\d+\.\d+"` regex misses that one entirely and flatters the result). The new surface is present in the bundled server, not merely in the repo: `"roof"` ×20, `"void"` ×14, `E_ROOF_AMBIGUOUS`/`E_ROOF_CURVED`/`E_ROOF_SELF_INTERSECT`/`E_VOID_SIZE` ×3–4 each, and the four new fixture families with their aliases (`rug`/`carpet`, `piano`/`grand_piano`, `sofa_l`, `sun_lounger`) plus `underlay`, so completion, hover and the fixture lint rules all know them. **The Marketplace upload is a human web step** at marketplace.visualstudio.com/manage/publishers/ChanMeng — there is no CI publish, nothing in this repo performs it, and a packaged `.vsix` therefore reaches nobody until a human uploads it. **The five durable mechanics — these, not the version roll-call, are what a future agent needs.** (1) **The extension bundles the core at BUILD time**, so a stale bundle ships a stale language; `editors/vscode/test/stdio.test.ts` pins bundle freshness via the `__CORE_VERSION__` stamp esbuild writes. (2) **"Rebundled" and "packaged" are different steps** — `npm run build` produces `dist/server.js`, only `npm run package` produces a `.vsix`; v1.26.0's prep did the first and not the second, so no artifact existed until someone checked. And `npm run package` esbuilds against the CORE's `dist/`, so **`npm run build` at the repo root must run first** or it silently packages a stale language. (3) **Build and package in the PRIMARY checkout only — now GUARDED, not merely advised (v1.27.0).** A `.claude/worktrees/*` checkout has no `node_modules`, so esbuild resolves the core by walking UP and bundles the SHARED repo's, and the `__CORE_VERSION__` stamp cannot catch it because both stamp the same version (`docs/backlog.md` item 3.14). `editors/vscode/resolve-core.mjs` now compares the resolved core's real path against the repo root of the tree being built and REFUSES, naming both paths (`editors/vscode/test/wrong-core.test.ts` simulates the two-checkout walk-up on disk at the SAME version, so the case the stamp cannot see is the case the test asserts). It fires for a **junctioned** worktree too, and that is right: npm links a workspace package by ABSOLUTE path to the main tree's root, so a junction moves the walk one step and still bundles the other checkout's core. (4) **The dep range is guarded separately from the bundle** — `editors/vscode/test/lockstep.test.ts` (v1.26.1) asserts the range is a **string** equal to `^` + the root version, mirroring the shim's. The distinction is not academic: the range sat two releases stale at `^1.24.0` while the stamp test stayed green throughout, because esbuild resolves the workspace symlink regardless of what the manifest declares. The guard deliberately does NOT also require the extension's own version to bump — its cadence is human uploads, and coupling them would train people to bump a digit for green. (5) **The gallery LAGS the upload, by a varying amount** — ~10 min for 0.14.0, ~25 for 0.15.0, ~40 for 0.15.1, but only ~13 for 0.17.0, so the trend is not monotonic. **A probe that disagrees with a just-performed upload means "wait and re-probe", never "the upload failed."** `.vsix` files are gitignored, so the artifact is local to whoever ran `npm run package`, and **more than one version can sit un-uploaded**: 0.16.0 was packaged for v1.27.0 and skipped, and 0.13.0 once carried three skipped tiers (0.12.0, 0.11.0, 0.9.0) to the gallery in a single upload. **Always upload the HIGHEST version.** **Upload history, verified live by the gallery API each time:** 0.18.0 (core 1.29.0) 2026-08-26T13:36:09Z · 0.17.0 (core 1.28.0) 2026-08-26T09:30:34Z · 0.16.0 (core 1.27.0) **packaged, never uploaded** · 0.15.1 (core 1.26.1) 2026-08-13T00:49:57Z · 0.15.0 (core 1.26.0) 2026-08-12T11:55:36Z · 0.14.0 (core 1.25.0) 2026-08-11T03:47:51Z · 0.13.0 (core 1.24.0) 2026-07-26T11:51:11Z | marketplace.visualstudio.com/items?itemName=ChanMeng.archlang |
| **Playground** | deployed, redesigned (**"The Compile Boundary"** one-light-world UI — see below · TypeScript app · pan/zoom · autocomplete · history · click-to-source · format · repair · error-explain · embeddable `embed.html` · circulation Paths toggle · **Copy-for-LLM** · inline diagnostic fixes) | https://playground.archlang.uk |
| **Docs site** | deployed, redesigned (**"The Compile Boundary"** one-light-world UI · compiler-as-hero · VitePress · live editable `<ArchLive>` examples · plain ```` ```arch ```` fences auto-live · serves `/llms.txt` + `/llms-full.txt` + **raw `/<page>.md`** + **`/plan.schema.json`** + **`/archlang.gbnf`**) | https://archlang.uk |
| **Git** | `main`, tags `v1.0.0` → `v1.29.0` (the newest tag that exists and is pushed — `git ls-remote --tags origin`; it points at `2b183ba`, which is also `main`'s head, and its GitHub Release is dated 2026-08-26T11:51:00Z. A `v*` tag push triggers the tokenless OIDC release workflow) | github.com/ChanMeng666/archlang |
| **Dataset** | HF `ChanMeng666/archlang-repair-trajectories` (**published, live 2026-07-13** — repair 1200 + authoring 400 rows) — two splits, fully synthetic, self-verifying, CC0-1.0, deterministic from seed `20260712`; generator `dataset/` (`npm run dataset:gen`), permanent CI leakage guard `test/dataset.test.ts` | `dataset/`, huggingface.co/datasets/ChanMeng666/archlang-repair-trajectories |
| **Tests** | 3222 passing, 181 files (the count assumes the VS Code bundle is built — without `editors/vscode/dist/server.js` both of `stdio.test.ts`'s describes emit a visible gated skip and the run reports **3219 passing + 2 skipped**, 180 files + 1 skipped, instead. The 3222/181 figure was **re-verified on 2026-08-27** at `2b183ba` by `npm run build && npm run vscode:build:only && npx vitest run`; the skipped pair was measured on 2026-08-26 for the v1.29.0 release prep by moving the bundle aside and back — build first, then count. The pair read 3092/3089 earlier that day for v1.28.0, and 2804/2801 before that: nothing gates this number, so it drifts silently between measurements. Re-measure it; never carry it forward). Incl. the fault-injection L1 gate, the G1 oracle-isolation guards, the L2 protocol tests, the judge byte-equivalence fixture, the intent-channel suites, the vocabulary-equivalence classification pin, the dataset contamination/determinism guard, and v1.17's CLI-surface suites — FLAG_KEYS↔manifest bidirectional drift, per-command help/examples, filters-never-gate, the `context --section` splitter-to-generator weld, and `test/docs-flags.test.ts`, the docs↔manifest gate that fails if any hand-written doc names a flag its command doesn't declare, plus v1.19's drawing-quality suites — fixture orientation, `flush` placement, the openings render pass, and `test/repair-coverage.test.ts`, whose postcondition is that every piece a lint pass flags gets a change entry or an `unresolved` entry, never nothing, plus v1.20's sheet-and-datum suites — `test/axes.test.ts` (GB/T numbering incl. the `I`/`O`/`Z` skip and the descending-`y` lettering), `test/sheet.test.ts` (the paper/scale size table, closed-form auto-fit, `W_SCALE_OVERFLOW`, and a pin that a plan with no `paper` is byte-identical) and `test/schedule.test.ts` (schedule rows equal `describe()`'s own areas, legend lists only what is drawn), plus v1.21's vertical suites — `test/levels.test.ts` (either/or level nesting, per-storey id scoping, one-building paper/scale) and `test/cli-levels.test.ts` (`<stem>.L<n>.<ext>` fan-out, `outputs[]`/`pages[]`, `--level` as a display filter that never moves an exit code), `test/vertical.test.ts` (registry dispatch for the three new elements, the drawn symbols, the obstruct-except-the-entry-edge nav-grid rule, same-id shaft identity in `describe().vertical`, upper-storey reachability ± its counterexample, `W_STAIR_UNMATCHED` ±, and cross-level `checkGraph`), and `test/nav-grid-scale.test.ts` (the grid-resolution formulas, large-plan bottleneck discrimination, and the threshold carve), plus v1.22's composition suites — `test/zones.test.ts` (the byte-identity law that a zoned plan renders exactly like its unzoned twin, nesting/roll-up in `describe().zones`, `--zone` as a display filter that never moves an exit code, and the grouped `schedule rooms` subtotals partitioning the total) and `test/place.test.ts` (instance id namespacing and order-independence, dotted refs allowed only in reference positions, `rotate`/`mirror` as exact composing isometries incl. mirrored door swings, whole-file `import … as`, and the imported-fix span guard that keeps `applyFixes` from splicing a component's offsets into the importer), plus v1.23's geometry suites — `test/polygon-rooms.test.ts` (exact shoelace area and centroid labelling, the byte-identity law that an all-rectangle plan is unchanged, boundary-run adjacency and by-distance opening attribution at any angle, the occupancy/nav grids dropping out-of-ring cells, exact `W_ROOM_OVERLAP`, and every rectangle-only clause refusing rather than approximating — `E_PLACE_POLY`, `E_ROOM_POLY_SELF_INTERSECT`, `E_ROOM_POLY_DEGENERATE`, `W_ROOM_LABEL_OUTSIDE`) and `test/miter-limit.test.ts` (the `Paint.miterLimit` cap reaching SVG, PDF and the clipper2 offset alike), plus v1.24's `test/curves.test.ts` (the two-endpoints-and-a-radius arc solve incl. all four `cw`/`major` branches and the `E_ARC_RADIUS` floor, arc-length opening attribution and tangent-derived swings, exact πR² against the 48-gon it is *not* measured from, the dedup that gives a two-semicircle drum one `R` leader, and **both determinism laws** — byte-identical output with the optional clipper2 backend registered *and* cleared, which is what per-segment lowering buys), plus v1.25's orientation-and-openings suites — `test/site.test.ts` (the `site` grammar, the five derived names, the byte-identity law that a plan with no `site` is unchanged everywhere, and the pin that `north` is **deliberately absent** from `KEYWORDS.enum` so nobody "fixes" the three-of-four asymmetry into the first word in two categories), `test/window-facing-probe.test.ts` (the outward-face probe, incl. the two courtyard reproductions the bbox midpoint answered backwards, and both tie-break branches) and `test/doors.test.ts` (the four door kinds, `doorSwing()` returning `null` per kind, both `E_DOOR_KIND_CLAUSE` directions, `W_POCKET_RUN` ± its reverse-slide fix, and the mirrored-`place` pin that `slide`'s flip is the identity while `swing`'s is not), plus v1.26's self-description gates — **`test/spec-forms.test.ts`**, which makes the agent reference EXECUTABLE (44 documented forms must compile, 19 documented illegalities must be refused with their catalogued code; bound by keyword set-equality and a pure `clauseAtoms()` so a new keyword or clause with no snippet goes red, with non-vacuity proven by a planted clause and the eight whole-plan spatial codes it cannot reproduce listed in a `NOT_REPRODUCED_HERE` map that a second assertion prunes), `test/gbnf-drift.test.ts`'s **71-plan agreement corpus** (every plan's verdict from the bundled GBNF recognizer must equal `compile()`'s — the expected column is taken from the compiler on every run, so it can only be greened by fixing the grammar or changing the language; 113/113, versus 24 failures against the pre-v1.26 grammar), `test/public-surface.test.ts` (runs `tsc` over `src/index.ts` and walks `SceneSummary`'s declaration TRANSITIVELY into whatever `src/` module declares each type, asserting every reachable name is exported — the requirement list is DERIVED, so a new field whose type lives in an unexported module goes red with no edit to the test), and the `align` accept-set rows in `test/relational.test.ts`), plus v1.26.1's execute-the-surface suites — **`test/arbitrary-plan.ts`**, a generator that emits valid plans by CONSTRUCTION (the old `fc.string()` body produced **zero** walls, rooms, openings or fixtures across 5000 samples, so the flagship determinism property asserted almost nothing about the rendering path; all 3000 new samples render at ~158 geometry elements each, every closed value set imported from its owner, and a planted `lowerWalls` iteration-order bug that the old property passed 300 runs of fails the new one in 5), `test/cli-commands.test.ts` + the widened `test/cli-batch.test.ts` (the three commands no test had ever INVOKED — `watch`/`fmt`/`manifest` — plus `runPool`/`aggregateExit`/`perFileJson`, incl. the exit-code precedence rule that user-source outranks IO; the watch pin is now INVERTED, requiring the child be killed from outside), `test/lint-measure.test.ts` and `test/frame.test.ts` (two modules nothing imported: the measured-deficit arithmetic — strongest case being `frontGapMm` agreeing with `frontClearanceRect` across all four quarter-turns — and the exact-isometry layer with no epsilon anywhere; 27 of 28 planted faults killed, the survivor provably equivalent), `editors/vscode/test/lockstep.test.ts` (the extension's dep range as a **string** equality against `^` + the root version, mirroring the shim's — the `__CORE_VERSION__` stamp stayed green for two stale releases because esbuild resolves the workspace symlink regardless of the manifest), and the three former SILENT-PASS gates now required in CI and visibly skipped locally (`png.test.ts`, both pdfkit gates in `export-pdf.test.ts`/`sheet.test.ts`; `readme-permalink.test.ts`'s deflate-raw gate is deliberately `it.skipIf` and NOT a CI throw, since the Node 18/20 legs lack the capability by design)) + offline authorability eval (26 briefs, judge v2, `npm run eval:ci`, in CI) **and the separately-reported intent-fidelity slice** (`npm run eval:fidelity`, `eval/corpus-fidelity.json` — infeasible briefs where declaring infeasibility is correct, plus a deterministic judge-free laundering detector; it shares no ruler with the 26-brief rate and never touches `judge-fixture.json`), plus the 2026-08 cross-surface layer — lockstep drift guards (`test/site-lockstep.test.ts` token-block/`--syn-*` byte pins, `test/brand-assets.test.ts`, `test/share-codec.test.ts` — the `#z=` codec's three implementations held behaviourally equal, `test/docs-sync-list.test.ts`, `test/docs-table-pipes.test.ts` — the GFM `\|`-in-table tripwire, now scanning `docs/archive/` too since its one real offender was escaped, and `test/docs-fences.test.ts` — the live-fence gate: every published ```` ```arch ```` fence the docs site turns into a running `<ArchLive>` widget must compile clean, or carry the `static` opt-out), `test/escape-fuzz.test.ts` (hostile-string properties over SVG/ASCII/DXF via `src/text-safe.ts`), and **`test/example-svgs-drift.test.ts`** — the gate for the thirteen committed `examples/*.svg` the README embeds, which had NO gate at all and had therefore rotted for months (three of them showed the front page a building compiled before four separate rendering fixes); it re-renders each in memory and byte-compares, and pins the curated `README_SVGS` list against the README's own `<img>` tags **in both directions**, so neither an ungated drawing nor a listed-but-unshown one can exist, plus v1.28's furniture-symbol suites — five per-domain glyph suites (`test/glyphs-bath`/`-kitchen`/`-bedroom`/`-living`/`-misc.test.ts`) over one shared drawing contract (a symbol stays inside its own footprint at every aspect and every quarter-turn, two pen weights, no text, deterministic), `test/glyph-lib.test.ts` (the two laws that let the eight shipped families be re-tagged with semantic line weights without moving a byte: a factory's named weight and its raw `paint.width` agree, since SVG reads the name and PDF reads the number, and a dashed segment's two dash fields agree — read back OUT of the rendered SVG, never compared to the module's own constant), `test/furniture-curves-backends.test.ts` (the v1.26.1 lesson applied BEFORE the fact: `glyph-lib` was about to put the first `circle`/`arc` on the furniture pass, so all four serializers are proven to DRAW one by hand-building the Scene — every assertion differential against the same Scene without the two nodes, on a deliberately door-free plan, so a backend that silently dropped them cannot pass) and **`test/fixture-byte-identity.test.ts`**, whose three groups carry DIFFERENT promises and must not be blessed alike: group 1 (no furniture, and an uncatalogued word) is **PERMANENT** — a phase that draws a bed and moves either of those touched the shared path and has a bug, not a snapshot to update — while groups 2 and 3 (the eight shipped families, then the four v1.29 ones) are deliberately re-blessable and each diff is to be read and explained; plus v1.29's `test/roof.test.ts` (exact coordinate equalities for the mitred offset, including an OBLIQUE ring and a redundant collinear vertex, all seven `E_ROOF_*` refusals reproduced, both halves of the dash convention, and `fmt` round-tripping both spellings), `test/void.test.ts` (the obstruction proved by a counterexample PAIR — the route exists without the void and dies with it — the walkable halo beside it, the pinned decision that it does not touch the room's area, and the POLY-AWARE room attribution that the bbox-derived-position class would get wrong), `test/glyphs-batch2.test.ts` (`underlay` proved by its CONSEQUENCES in both directions: a rug under a sofa raises nothing, two ordinary pieces still raise `W_FURNITURE_OVERLAP`, and two RUGS overlapping each other still do — plus the same plan, same footprint, one word different, walked THROUGH a rug and ROUND a piano across both the nav grid and the per-room flood fill, since two separate code paths must not disagree about what a rug is), `test/roof-void-byte-identity.test.ts` (hardcoded SHA-256s measured against v1.28.0's `src/` by checking that tree into the worktree — a test that compiled twice and compared would prove determinism, not identity — over the WHOLE agent-facing surface: SVG, `describe()` and `lint()`) and **`test/v129-cross.test.ts`**, the cross-feature gate neither branch could produce alone: both tracks edit the nav grid's obstacle list in `src/analyze/circulation.ts`, git merged them cleanly, and a clean merge is not evidence — so a rug and a void occupy the SAME rectangle spanning the only route between two rooms, with a `sofa` control on that identical rectangle to prove the geometry really does seal, full MCP tool/resource/lockstep/fuzz coverage in `packages/mcp/test/`, VS Code LSP handler + stdio + bundle-freshness tests in `editors/vscode/test/`, and **Playwright E2E**: 50 playground cases (`playground/e2e/`, 6 files) + 61 docs cases (`docs-site/e2e/`, 3 files) against the built sites — both counted 2026-08-27 with `npx playwright test --list` in each workspace, which is the only honest count because `routes.spec.ts` generates cases in a loop and the docs half had long been recorded as "33 specs"; typecheck (`noUncheckedIndexedAccess` on, full-repo via `typecheck:all`) + build + `npm run lint` (Biome) clean | — |

**Latest release: v1.29.0 (2026-08-26)** — **"two drawing-only elements, four furniture families, and
one word for a thing you stand on"**, a MINOR, **released**: tag `v1.29.0` pushed at `2b183ba`,
GitHub Release 11:51:00Z, npm `latest` 1.29.0 with provenance, MCP registry 0.2.9 at 11:50:59Z, and
VS Code 0.18.0 live in the gallery at 13:36:09Z — all four re-probed 2026-08-27. Two new elements that
**draw and do nothing else**: `roof overhang <mm> [wall <id>]` / `roof polygon …` puts one dashed
eaves line on `A-ROOF` (a closed-form mitred outward offset of a closed wall ring, exact at any angle
and on either winding), and `void [id=] at (x,y) size WxH` puts a stair well or atrium on
`A-FLOR-OVHD`. Neither adds a `Theme` key — both reach existing paint through `STYLE_KEYS`, so `style
roof { stroke … }` works with no new palette entry, and a generator guard now fails if a style kind
has no rendering. Both **refuse rather than approximate**: eight new codes (seven `E_ROOF_*` plus
`E_VOID_SIZE`, taking the catalog from 74 errors to 82; the 42 warnings are unchanged), with the
offset of an `arc` edge, a polygonal void and area subtraction under a void all **deferred by name**.
Three semantics worth knowing: a void obstructs circulation but lifts its walkable halo on all four
edges (you cannot walk across a hole, but you may stand at the railing), it does **not** reduce the
containing room's area (`describe --json` gains `voids[]` so a consumer can subtract), and a `roof`
grows the drawing extent — which on a plan with no `paper` rescales every line weight, since `refDim`
is the drawing span. The other track is four fixture families (`rug`, `sofa_l`, `piano`,
`sun_lounger`) carrying **one new catalog flag, `underlay`** — a piece that lies flat and is stood on.
One shared predicate, `solidFurniture()`, feeds all four consumers (the overlap rule, the clearance
rule, the nav grid and the per-room flood fill), so they cannot disagree about what a rug is; two rugs
overlapping each other still warn, and a rug drawn through a wall still does. Exactly **three of the
28 shipped examples change bytes**, each because its own source took up the new syntax — the other 25
compile SHA-256 identical against published `@chanmeng666/archlang@1.28.0`. Shipped alongside **MCP
shim 0.2.9** (version-bump-only, the pack-time law a sixth consecutive time — three of five baked
resources moved, the GBNF among them) and **VS Code 0.18.0** (verified from inside the `.vsix` first,
then uploaded and confirmed live in the gallery the same day). **The prior release, v1.28.0 (2026-08-26)** — **"the furniture vocabulary the examples were
already using, and the symbols it now draws"**, a MINOR, **released**: tag `v1.28.0` pushed, GitHub
Release 09:17:07Z, npm `latest` 1.28.0 with provenance, MCP registry 0.2.8, VS Code 0.17.0 live in
the gallery at 09:30:34Z. `arch manifest`
advertises **51 fixture categories across 32 families**, up from 18 across 9, and every one of the
51 has a plan symbol — the words the shipped examples had been writing for months (`bed`, `sofa`,
`desk`, `wardrobe`, `dining_table`, `car`…) used to fall through to "unknown category" with no
footprint, no wall semantics and a labelled rectangle where a drawing belonged. They are drawn now,
across five domain modules (`glyphs-bath`/`-kitchen`/`-bedroom`/`-living`/`-misc`) over one shared
drawing vocabulary, `src/elements/glyph-lib.ts`. **Three behaviour changes to state plainly:** a
drawn symbol **ignores its `label`** (long-standing for `wc`/`basin`, now true of twenty shipped
examples whose fixture words vanish from the drawing while staying in the source and in
`describe()`); **`requiresWall` now means SERVICES and only services** — flagging room furniture
raised 23 spurious floating-fixture warnings across nine shipped plans, so the flag stayed with the
plumbed and vented goods and the derived quarter-turn moved to a **new `directional` flag** on the
eleven categories whose symbol has a back worth turning to a wall (`sofa`/`chair`/`bench`/`desk`
deliberately do NOT carry it — seating is arranged, not installed); and **all 27 shipped examples
that place a fixture render different bytes**, re-blessed in one reviewed pass across 25 SVG
snapshots, 21 PNG goldens and eleven of the twelve README SVGs (`aquarium` places no fixture and is
byte-identical; `furnished-flat` joins the list as the thirteenth). **Net lint change across every shipped
example, eval golden and fault fixture: zero**, swept before and after. No new keyword, no new
`E_*`/`W_*` code. New flagship `examples/furnished-flat.arch` (26 of the 32 kinds in one 90.7 m²
flat) plus `examples/lib/furniture.arch`. Also in the tag, with no `src/` behaviour change: a new
`/showcase` docs page (eleven compiled plans from the separate `archlang-showcase` repo, each with
a playground permalink), and the **extraction of `paper/` to the private `ChanMeng666/archlang-paper`
repository** — one target is a double-anonymous ICSE submission and a public repo under the author's
own name de-anonymises it, so `check:drift` now gates 22 artifacts across 9 generators and there is
no `paper:*` script here any more. Shipped alongside **MCP shim 0.2.8** (version-bump-only, the
pack-time law a fifth consecutive time — two of five baked resources moved) and **VS Code 0.17.0**
(packaged and verified from inside the `.vsix`; the Marketplace upload is a human web step and had
NOT been performed when this line was written; it since was, and is confirmed live). **Before that,
v1.27.0 (2026-08-25)** —
**"one new form, four rules that asked a narrower question
than they claimed, and three sheet promises the drawing was not keeping"**, a MINOR. The one language
change is small and unblocking: `door|window|opening … on <wall> at <pos>` takes a full **expression**
instead of a bare `number` token, which is what makes the attachment form reachable from a `for` loop
at all — before it, a generated run of openings had to fall back to `at (x,y) … wall <id>` and
hand-compute the coordinate the form exists to remove. Alongside it, **every lexer and parser refusal
now carries `E_PARSE`**; the most common failure a generating model hits had no code at all, so
`lint --code`/`--severity` could not select it and `arch explain` had nothing to say. The rest is
promises kept: `arch repair` is idempotent by a **pinned law** (60 of 400 generated plans used to
ping-pong with period 2–4, so which arrangement shipped depended on how many times you had run it —
now 0 of 2000 across four seeds); `dims auto walls` stopped writing its call-outs *inside* the poché
they measure (29 readings across 13 of the 27 shipped examples, on every plan that asked for wall
dimensions); `usablePlanMm` started reserving the band its own `schedule`/`legend` tables occupy, so a
plan can no longer be issued taller than the paper it declares while `fits` says `true`; a `place`d
instance stopped being a schedule heading; and `flush` stopped fighting `grid` (a resolver-derived
coordinate is no longer grid-snapped — the grid governs numbers an author *writes*). **Three
behaviour changes to state plainly:** `arch lint` may now warn on plans it silently passed — three
rules widened (an angled wall is measured instead of skipped, a fixture is judged by its footprint
rather than its centre, `W_NO_ENTRANCE` no longer stands down when no wall is `exterior`), and one of
those warnings was hiding in `examples/hexagon-pavilion.arch`, where two benches sat 100 mm and 130 mm
inside a wall solid; **`SheetFitInput.tableRows` is a type-level breaking change** (now required, on
`resolveSheetSpec`/`fitsOnSheet`/`chooseScaleDenominator`/`usablePlanMm` — no runtime break, nothing
changes for `compile()` or the CLI, and required-not-optional is the point, since a caller that can
forget the field is how the band went unreserved for three releases); and eighteen shipped examples
change bytes on purpose, each named in `CHANGELOG.md`. Also in the release, with no `src/` behaviour
change: the docs site's ArchLang highlighter is now **generated** from `KEYWORDS`/`RULES` rather than a
hand-typed keyword `Set` (which had already drifted — `street` and `hemisphere` shipped in v1.25.0 and
every renderer had been drawing them as bare identifiers since), and the `paper/` working set landed
with its facts interpolated from the compiler's own tables and drift-gated. (**That working set has
since MOVED, on 2026-08-26, to the private repository `ChanMeng666/archlang-paper`** — one target is a
double-anonymous ICSE submission and a public repo under the author's own name de-anonymises it
however clean the LaTeX is. Its facts generator and drift gate went with it and read this repo as a
sibling checkout, so the numbers are still derived, never retyped. Nothing here builds a paper any
more: there is no `paper:*` script, no `gen:paper-facts`, and no paper entry in `check:drift`.)
Shipped alongside **MCP
shim 0.2.7** (version-bump-only, the pack-time law a fourth consecutive time — three of five baked
resources moved) and **VS Code 0.16.0** (packaged and verified from inside the `.vsix`; the
Marketplace upload is a human web step and had NOT been performed when this line was written).
**Before that, v1.26.1 (2026-08-13)** — **"five shipped surfaces that no test ever executed"**, a
PATCH. v1.26.0 made the language's *descriptions* of itself agree with its parser; this one does the
same a layer out, for its *behaviour*. Every fix is a documented promise the code had quietly stopped
keeping, and every one was found by **running** the surface, not reading it: `arch watch` had not
watched since v1.1.0 — twenty-five minor releases, while the manifest advertised "recompile on save"
— because a refactor wrapped it in `process.exit(await cmdWatch())` and killed the process the
watcher had just armed; poché was dropped from **every PDF ArchLang has ever exported** (`drawNode`
had no `hatch` case and no `default`, so the one primitive the `wallFill` layer emits fell through);
`arch fmt` printed neither a door's kind word nor its `slide`/`open` clauses, so the one operation a
user may assume is safe silently returned a pocket door as a hinged one; `W_DIM_INSIDE`'s
machine-applicable fix 2-cycled forever, making `arch fix`'s output depend on the **parity** of its
pass budget; and `toPdf` was the single shipped format without byte-determinism, because pdfkit
stamps `CreationDate` from the wall clock. The gap was never analysis, it was **invocation** — `arch
watch`/`fmt`/`manifest` had zero end-to-end execution, `lint/measure.ts` and `frame.ts` no direct
caller, three gates opened with an `if (…) return;` that passed having asserted nothing, and the
flagship determinism property fed `fc.string()` into a plan body, producing **zero** walls or rooms
across 5000 samples. All closed here, which is why a patch carries +4900 lines. **Three fixes change
observable output on purpose** and say so in `CHANGELOG.md`: PDFs gain poché and a constant
`CreationDate`/`/ID`, `arch fmt` emits clauses it used to drop, and `arch watch` no longer exits. No
new keyword, no new `E_*`/`W_*` code, no `src/index.ts` change. New flagship `examples/bungalow.arch`
(the first example to use *any* of the v1.25 `site`/door-kind surface). Shipped alongside **MCP shim
0.2.6** (version-bump-only again — one baked resource, `llms-full.txt`, moved) and **VS Code 0.15.1** (uploaded 2026-08-13 and confirmed live). All four published surfaces were verified after the tag, not assumed: the shim tarball was unpacked and its one changed resource byte-compared against the repo, and `npx @chanmeng666/archlang@1.26.1` was driven through all three fixes — `fmt` preserves a pocket door, two PDF renders across a second boundary are byte-identical, and the poché fill is present.

**Before that, v1.26.0 (2026-08-12)** — **"the language's descriptions of itself, made
honest"**. No new syntax. Instead, the four artifacts that *tell a model what ArchLang is* were checked against
the parser for the first time, and every one was wrong: `spec.llm.md` taught seven incorrect grammar
lines (four of which do not compile — measured downstream in ArchCanvas as 11 of 18 generations
failing), `grammars/archlang.gbnf` derived **eleven forms the parser rejects** (a constrained-decoding
grammar whose whole job is to make invalid output impossible), `src/index.ts` withheld seven types
`describe()` hands you at runtime, and `room … align <word>` accepted **any** word, silently drawing
the leading edge as if the clause were absent. One shape underlies all four: *a fact about the
language, retyped by hand into something that describes the language.* `check:drift` is structurally
blind to it — it proves a generator reproduces its own output, never that the output is true, and the
proof is that the two hand-typed generators had the same forms right and wrong in different places
while both stayed green. So the remedy is structural: eight closed value sets now live once in
`src/ast.ts` and **interpolate** into every description of them (`assertVocabRendered` throws on a
value with no rendering), and **`test/spec-forms.test.ts` executes the reference** — 44 documented
forms must compile, 19 documented illegalities must be refused with their catalogued code, with
non-vacuity proven by a planted clause rather than asserted. `test/gbnf-drift.test.ts` does the same
for the grammar as a 71-plan agreement corpus whose expected verdict is taken from the compiler on
every run, so there is no column to edit. New codes `E_ROOM_ALIGN` and `E_ROOM_ALIGN_AXIS` (kept
separate on purpose: "unknown edge" is false when the word *is* an edge, and `--code` should separate
a typo from a wrong axis), both with word-only fixes. Two spec-generator guard holes closed —
`dims`/`accTitle`/`accDescr` fell between the element- and control-table set-equality checks and were
documented nowhere, and `SCRIPTING_KEYWORDS` carried an unfalsifiable "the prose covers these" that
was false for `theme` and `style`. Also: the lockfile still recorded the pre-v1.25.0 versions, and
`typecheck:all`'s ~67 spurious errors in a fresh worktree are now documented (build first). Shipped
alongside: **MCP shim 0.2.5** (version-bump-only — three of its five pack-time-baked resources
changed) and **VS Code 0.15.0** (uploaded 2026-08-12 and confirmed live; its dep range had gone two
releases stale). All four published surfaces were verified after the tag, not assumed: the shim's
tarball was unpacked and its three changed resources byte-compared against the repo, `archlang.uk`
serves `/spec.md` and `/archlang.gbnf` byte-identical to the checkout, and `npx
@chanmeng666/archlang@1.26.0` compiles the furniture form that used to fail.

**Before that, v1.25.0 (2026-08-11)** — **"orientation & openings"**, the Batch-3 release. Two new
language surfaces and the closure of a whole defect class. `site { street north|south|east|west
[hemisphere north|south] }` is a plan-level setting that **draws nothing** and names five directions on
`describe --json`'s new `site` key — `street`, `back`, `equator_side`, `sunrise_side`, `sunset_side` —
assertable by name in an intent's `windows.facing` (`E_INTENT_NO_SITE` when the plan declares no site,
never a silent pass) and read by one advisory rule, `W_ROOM_NOT_EQUATOR_FACING`. **The `_side` names are
a drafting heuristic for an aspect, not a daylight measurement** — there is still no sun model, no
latitude and no date, and the 2026-07 daylight refusal is upheld, not superseded; `good_sun` was
deliberately REJECTED for exactly that reason (a token must not claim more than the check verifies,
least of all to a model that will map "sunny" onto whatever token exists). A bare **door kind** may now
lead a `door` statement — `sliding`, `barn`, `bifold`, `pocket` beside the default `hinged` — plus
`slide left|right` and a drawing-only `open <0..1>`; a non-hinged leaf sweeps nothing, so `doorSwing()`
returns `null` and `W_SWING_OBSTRUCTED` stops applying while every doorway rule is unchanged, and
`W_POCKET_RUN` measures the wall a pocket panel must slide into (truncated at any intervening opening)
against `width + max(50 mm, width x 5%)` — the two-term threshold deliberately chosen over the cited
1.05 ratio, which is wrong on narrow doors. The other half of the release is **six instances of one
defect class**: a position derived from a shape's *bounding box or centroid* rather than the shape
itself, silent every time (`arch lint` reported none of them) — the room label point, the circulation
routing anchor (a 10.9 m walk was reported as 5.6 m), `dims auto` witness lines floating metres off a
sloped facade, `swing into <room>`, `furniture ... against wall`, and `windows[].facing` on a courtyard
plan. The search that finds them is *a room-shape consumer reading `r.at`/`r.size` without branching on
`r.poly`*, recorded in `docs/research/2026-08-06-competitor-borrowing-roadmap.md` §9.1. Also new:
`W_DIM_OVERLAP` + a tier-bump fix, staggered dimension numbers on crowded chains, measured-deficit
diagnostic prose on four rules, lint fixes finally carrying `file` provenance (an imported module's fix
was rewriting the *importer's* source), and the judge-free **intent-fidelity eval slice**
(`npm run eval:fidelity`) that catches a repair loop satisfying the validator by quietly rewriting the
requirement it could not meet. **Every new form obeys a byte-identity law** — a plan that does not use
it renders, describes and lints exactly as before, verified by SHA-256 sweeps over all fourteen shipped
examples. (The five prior Batch-2 sub-releases, all 2026-07-26: **v1.24.0 "geometry II"**, which
**closed the large-building roadmap**: `arc (x,y) radius R [cw|ccw] [major]` inside a `wall` body makes
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
verbatim in the private growth repository, at
`archcanvas-growth/archive/archlang/docs-archive/agents-status-history-2026-07.md` — **its permanent
conclusions are distilled into "Standing decisions & iron laws" just below, so read *that*, not the
archive, for what still binds you.** Older docs predating the launch (the build plans, and the
now-frozen work log `WORK-LOG-v0.7-v1.15.md`) moved to that same directory on 2026-08-26; they are
historical, and nothing in this repository reads them. The table above and `CHANGELOG.md` reflect what
shipped.

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
- **A derived POSITION must come from the shape, never from its bounding box or centroid — this is a
  defect CLASS, not a bug.** Six instances shipped and were fixed in v1.25.0, every one of them SILENT
  (`arch lint` reported none): the room label point, the circulation routing anchor (a 10.9 m walk
  reported as 5.6 m), `dims auto` witness lines floating metres off a sloped facade, `swing into
  <room>`, `furniture … against wall`, and `windows[].facing` on a courtyard plan. **The grep that
  finds a new one is `room\.size`/`r\.size\.w` WITHOUT a nearby `r.poly` branch** — a room-shape
  consumer reading the box when the ring is the honest datum. The fix is always local and closed
  form: probe one wall thickness off each face and ask which side has floor (`pointInRoomBox` /
  `pointInPolygon`, both poly-aware), or use `polygonLabelPoint`. Never reach for the wall boolean
  union to answer a `describe()` question — `describe()` never builds a Scene, and doing so drags the
  poché pipeline and the optional `clipper2-wasm` dep into a read meant to be cheap. Full inventory,
  including what the sweep CLEARED and why, in
  [`docs/research/2026-08-06-competitor-borrowing-roadmap.md`](docs/research/2026-08-06-competitor-borrowing-roadmap.md) §9.1.
- **`prepublishOnly` runs the WHOLE monorepo suite, so the release job must build what that suite
  asserts.** `npm publish` → `prepublishOnly` = `npm run build && npm run test`, and `npm run test`
  includes `editors/vscode/test/stdio.test.ts`, which hard-fails under CI when the core is built but
  `editors/vscode/dist/server.js` is not. `npm run build` does not build that bundle, so
  `release.yml` builds it explicitly before publishing. **Do not "fix" a future occurrence by
  narrowing the gate** — building the artifact keeps it verified, narrowing it means nothing about
  the shipped bundle was checked. This cost v1.25.0 its first publish attempt (the tag was moved to
  the fixed commit; nothing had reached npm, so re-tagging was clean). It had never fired because
  that test post-dates v1.24.0, and CI's `builds` job runs `vscode:build:only` before the suite.

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
├─ examples/          28 plans, each the flagship of ONE thing (plus lib/ and the thirteen committed
│                     README_SVGS renders — see `gen:example-svgs`). Start here: one-room (the
│                     smallest plan that draws anything) · studio (the lint-clean, IMPORT-FREE
│                     flagship) · attached (nothing positioned by hand).
│                     Homes: laneway-house (the SIGNATURE plan — every opening on a wall run, every
│                     fixture on a room or wall, nothing hand-placed) · tiny-house · garden-loft ·
│                     two-bed · bungalow (the DOOR-KIND flagship, and since v1.29 the `roof`
│                     one: `roof overhang 600`) · furnished-flat (the FURNITURE
│                     flagship: 30 statements covering 29 of the 36 catalogued glyph FAMILIES,
│                     across all five symbol domains, with no `label` on any of them and no
│                     `size` on most — the four v1.29 families and the `underlay` rug among
│                     them) · courtyard-house (the CONCAVE
│                     flagship: a U whose centroid is off its own floor and whose windows face out
│                     of a court) · townhouse (three levels, A3 portrait) · terrace-row (one `component`
│                     placed four times) · two-storey (and since v1.29 the `void` flagship: a
│                     gallery over the ground floor, on L2 only) · accessible (accTitle/accDescr).
│                     Public: museum (the LARGE-building flagship: paper A1 @ 1:200) · library ·
│                     transit-hall · clinic · hexagon-pavilion (oblique polygon rooms).
│                     Geometry: gallery-l (the POLYGON-room flagship) · aquarium (the CURVED-geometry
│                     flagship: a drum of two arcs round a `room circle`, A2 @ 1:200).
│                     Composition: parametric · relational · imports · museum-wing + museum-wings
│                     (the COMPONENT-v2 flagship: one wing authored in local coords, imported as a
│                     whole FILE and placed twice, once mirrored) · lib/.
│                     Style: themed · materials (the only user of `style <kind> { … }`).
├─ eval/              NL→ArchLang authorability harness: corpus.json (26 briefs) · goldens/ · run.ts ·
│                     assertions.ts + synonyms.ts (re-export SHIMS over src/intent*.ts since T4) ·
│                     judge-fixture.json (byte-equivalence) · rubric.md (frozen) · faults/ + l1.ts (L1 gate) ·
│                     g1/ (Gate G1, PASSED) · l2.ts + l2-run.ts (T3 harness, live run never dispatched);
│                     offline gate `npm run eval:ci` in CI; guarded live `npm run eval:live` (see iron laws);
│                     PLUS the v1.25 intent-FIDELITY slice — corpus-fidelity.json · fidelity.ts ·
│                     fidelity-run.ts · fidelity-plans/ (faithful + laundered twins) ·
│                     fidelity-results.md, run by `npm run eval:fidelity`. Own corpus, own
│                     scorecard, JUDGE-FREE: it never touches corpus.json/judge-fixture.json and
│                     shares NO ruler with the 26-brief rate
├─ dataset/           repair + authoring dataset generator (`npm run dataset:gen`, tsx, no new dep):
│                     generate.ts · templates.ts · faults.ts · trajectory.ts · briefs.ts · rng.ts · diff.ts ·
│                     dedup.ts · canary.ts · CARD.md (HF README) · out/ (.gitignore'd jsonl); imports ONLY
│                     the pure core, never eval/; contamination iron law enforced by test/dataset.test.ts — CC0
├─ scripts/           check-test-wiring.mjs (fails if a tracked *.test.ts sits outside vitest.config.ts's
│                     include globs, or an include glob matches nothing — it PARSES the globs out of the
│                     config rather than duplicating them) + the
│                     single-source generators behind the `gen:*` npm scripts (gen-grammars, gen-error-codes,
│                     gen-llm-spec, …) + smoke.mjs (zero-dep post-deploy/nightly route check) + changelog-section.mjs
├─ bench/             ~1000-element timing harness (+ --json mode, CI regression comment)
└─ test/              vitest: snapshot + fast-check + unit + visual-regression + CLI/describe/lint/eval +
                      the cross-surface guards (lockstep, docs tripwires, escape fuzz) — map in docs/testing.md.
                      The root vitest run ALSO includes playground/test, packages/*/test and editors/vscode/test
```

Key agent-facing `src/` modules (all pure, exported from `src/index.ts`): `describe.ts` (semantic
summary; `.caption` = accessible one-liner, `.freedom` = authored-absolute vs resolver-derived
placement), `lint.ts` (soundness rules), `analyze.ts` (shared resolve pipeline + rectilinear geometry
behind both), `geometry.ts` (shared door-swing quarter-disc), **the fixture-symbol layer** —
`elements/glyph-lib.ts` (the shared drawing vocabulary every symbol is built from: `dot`/`ring`/
`arcSeg`/`insetRect`/`ellipsePoly`/`dashedPattern`, each factory setting the named `lineWeight` AND
the raw `paint.width` from one ramp, because the SVG serializer follows the name and the PDF
serializer follows the number), the five domain modules `elements/glyphs-bath`/`-kitchen`/`-bedroom`/`-living`/`-misc.ts`
that draw the art, and `elements/fixtures-glyphs.ts`, which now holds only the dispatch plus the
single-source `FIXTURE_FAMILIES` table that `FIXTURE_CATEGORIES` (59 words) and `CANONICAL_FIXTURES`
(36 families) are both DERIVED from — `hasFixtureGlyph` is what the legend filters on, so an
uncatalogued word still falls through to the labelled rectangle. Its semantics live next door in
`fixtures-catalog.ts`, where three flags are deliberately distinct and must stay so: **`requiresWall`
means SERVICES and only services** (the plumbed and vented goods — flagging room furniture raised 23
spurious floating-fixture warnings across nine shipped plans), **`directional`** carries the derived
quarter-turn for the eleven categories whose symbol has a back worth turning to a wall (`sofa`/
`chair`/`bench`/`desk` deliberately do NOT — seating is arranged, not installed), and **`underlay`**
marks a piece that lies flat and is stood on, read by exactly one shared predicate,
`solidFurniture()`, so the overlap rule, the clearance rule, the nav grid and the per-room flood fill
cannot disagree about what a rug is. `elements/roof.ts` (`offsetRingOutward` — the closed-form mitred
outward offset of a closed wall ring: line–line intersection with orientation from the shoelace sign,
exact at any angle and on either winding, refusing an `arc` edge rather than approximating it) and
`elements/void.ts` (a hole in this storey's floor plate: it obstructs the nav grid as a
`VerticalObstacle` while lifting its walkable halo on all four edges, does **not** reduce the
containing room's area — `describe().voids[]` gives the extent so a consumer can subtract — and finds
its room through the poly-aware containment test, never a bounding box). Both are drawing-only and
neither adds a `Theme` key: they reach existing paint through `STYLE_KEYS`. `diagnostic-json.ts` (`diagnosticToJson` line/col/`fix` projection), `backends/error-svg.ts`
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
`checkGraph` all read), `site.ts` (the v1.25 orientation layer, and the ONE place a page direction becomes a compass one: `windowFacingPage` — which probes one wall thickness off each face of a window's own host segment and takes the side no room occupies, exact at any wall angle and the only rule that is right for a COURTYARD — plus `toCompass` and `deriveSite`. **`northQuarterTurns` is NOT here: it lives in `describe.ts` (`:548`), its historical home, and `site.ts`'s own header says so** — this line claimed `site.ts` for three releases. `describe()` AND the site lint rule both call `windowFacingPage`, because a second place to apply the north rotation is a second place to get it wrong), `label-placement.ts` (the post-pass inside `toScene` that moves a room's name and area text off furniture, swings, stair symbols and dimension text — it must run AFTER `lowerWalls` and after `dims auto`, because that is the only point at which a dimension number exists to avoid; it relocates only when >2% of the label box is buried, so a clear plan keeps its exact bytes), `text-metrics.ts` (`EM_PER_CHAR`/`textWidth` — the renderer has NO text metrics, so this closed-form estimate is the single source the label pass, the dimension stagger, `W_DIM_OVERLAP` and the error card all share; a test pins the literal to this one file so a fifth copy cannot appear), `lint/measure.ts` (the measured-deficit arithmetic behind the value/shortfall/remedy diagnostics), `elements/door-panels.ts` (the sliding/barn/bifold/pocket panel geometry, emitted as the SAME Scene primitives every backend already serializes — no per-backend door code exists), and `frame.ts` (the `place` transform: a frame is a 2×2 signed-permutation
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
- **One syntax palette, FOUR renderers.** The eight `--syn-*` tokens live in the shared block and
  feed the playground's CodeMirror (via `scripts/gen-grammars.ts`'s fallbacks), the docs fences (via
  the custom `archlangLight` Shiki theme in `docs-site/.vitepress/config.ts`), and — through
  `docs-site/.vitepress/theme/arch-highlight.js` — both the docs hero's typing pane and the
  `<ArchLive>` editor. Change a syntax colour in ALL FOUR places, then `npm run gen:grammars`.
  `arch-highlight.js` is **GENERATED** by `gen-grammars.ts` from the same `KEYWORDS`/`RULES`
  tables as the other two grammars, and deliberately adds no fifth copy of the palette: it emits
  `ahl-<name>` classes whose suffix IS a token name, coloured once by the `.ahl-*` rules at the
  foot of `style.css`. It is why ArchLang source is readable anywhere it appears — the ArchLive
  editor (a coloured `<pre>` under a transparent-text `<textarea>`, both sharing every metric that
  can move a glyph) is where nearly all of it lives, since every plain `arch` fence becomes one, and
  it used to render in ONE FLAT COLOUR while `CompileSeam.vue` carried a hand-typed keyword Set that
  had already drifted behind `src/grammar/tokens.ts`. `test/arch-highlight.test.ts` welds the
  generator's vocabulary to `KEYWORDS` and its class list to those CSS rules.
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
npm run gen:grammars # regenerate the THREE grammars from src/grammar/tokens.ts — the TextMate
                     # grammar, the playground's CodeMirror mode, and the docs site's
                     # arch-highlight.js tokenizer (CI checks drift)
npm run gen:errors   # regenerate docs/error-codes.md from the catalog (CI checks drift)
npm run gen:cli      # regenerate docs/cli-reference.md from src/manifest.ts (CI checks drift)
npm run gen:spec     # regenerate spec.llm.md from tokens.ts + examples/ (CI checks drift)
npm run gen:llms     # regenerate llms-full.txt from spec + SKILL.md + manifest + error catalog (CI checks drift)
npm run gen:gbnf     # regenerate grammars/archlang.gbnf from src/grammar/tokens.ts (CI checks drift)
npm run gen:plan-schema  # regenerate schemas/plan.schema.json from PLAN_JSON_SCHEMA (CI checks drift)
npm run gen:intent-schema  # regenerate schemas/intent.schema.json from INTENT_JSON_SCHEMA (CI checks drift)
npm run gen:example-svgs   # re-render the thirteen committed examples/*.svg the README embeds, from
                     # their .arch sources (README_SVGS in scripts/gen-example-svgs.ts; CI checks
                     # drift). Run it after ANY rendering-pipeline change — the three drawings that
                     # existed before this generator had rotted for months with nothing watching.
npm run gen:all      # run every gen:* generator in dependency order (gen:spec before gen:llms,
                     # gen:example-svgs last since it depends on nothing else)
npm run check        # typecheck + lint + check:test-wiring + test — the local pre-push gate
                     # NOTE: `typecheck` here does NOT compile test/ — only `typecheck:all` does,
                     # so a type error in a test file passes `check` and fails `typecheck:all`.
npm run check:test-wiring  # fail if a tracked *.test.ts sits outside vitest.config.ts's include
                     # globs (it would never run), or if an include glob matches nothing
npm run check:drift  # run every generator and fail if any generated artifact drifted (CI drift gate)
npm run lint:ci      # biome ci . — the non-writing lint entry CI uses
npm run typecheck:all    # full-repo typecheck: root tsconfig.dev.json (src+test+eval+dataset+scripts+bench)
                         # + playground + docs-site (vue-tsc) + packages/mcp + editors/vscode (CI: builds job)
                         # RUN `npm run build` FIRST — like build:workspaces below, this one reads dist/.
                         # playground/tsconfig.json maps the bare `archlang` specifier to
                         # ../dist/index.d.ts; with no dist/ that path misses and TS falls back to the
                         # repo-root node_modules/archlang symlink, which points at editors/vscode, NOT
                         # the core. A fresh worktree therefore fails with ~67 SPURIOUS errors (46
                         # TS2305 "Module 'archlang' has no exported member …" + 21 knock-on implicit-any
                         # TS7006) that read exactly like a broken public surface. Build and re-run
                         # before believing a single one of them.
npm run eval:ci          # the offline 26-brief authorability golden gate (no API key; runs in CI)
npm run eval:fidelity    # the intent-FIDELITY slice: infeasible briefs (declaring infeasibility is the
                         # correct answer) + a deterministic, JUDGE-FREE laundering detector. Separate
                         # corpus, separate scorecard — it shares no ruler with eval:ci and must never
                         # be compared against it
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
  editor grammars (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`,
  `docs-site/.vitepress/theme/arch-highlight.js`),
  `docs/error-codes.md`, `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`, the two
  `schemas/*.schema.json`, and **the thirteen committed `examples/*.svg`** — each come from a single
  source (`src/grammar/tokens.ts` / `src/error-catalog.ts` / `examples/` / `SKILL.md` + manifest /
  `PLAN_JSON_SCHEMA` / `INTENT_JSON_SCHEMA` / the matching `.arch`) via the matching `npm run gen:*`
  (order: `gen:spec` before `gen:llms`, which consumes it). **CI fails on drift** — edit the source
  and regenerate, never hand-edit. **The `examples/*.svg` are the newest members of that list and
  the reason it is worth restating:** they were hand-committed for years and nothing compared them
  to the compiler, so `studio`/`two-bed`/`attached` silently showed the README a building rendered
  before the opening-void fix, the fixture-orientation fix, the miter cap and the label-placement
  pass. `npm run gen:example-svgs` renders them; `test/example-svgs-drift.test.ts` gates them and
  also pins the curated list against the README's own `<img>` tags, in both directions. The docs site
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
- **Fixtures draw by category, not a new element kind — and a drawn symbol IGNORES its `label`.**
  `furniture.render()` dispatches the category to `elements/fixtures-glyphs.ts`, which since v1.28
  covers **59 category words across 36 families** (all five domain modules); anything else falls back
  to the labelled rectangle, and that fallback is the escape hatch, not a defect. The label rule is
  long-standing for `wc`/`basin` and now true of twenty shipped examples whose fixture words vanish
  from the drawing while staying in the source and in `describe()` — so **do not add a `label` to make
  a catalogued piece read; add a category, or accept the rectangle.** Adding a family means one row in
  the single-source `FIXTURE_FAMILIES` table plus a `CATALOG` entry, never a new element or a `switch`
  arm, and the three catalog flags mean different things (`requiresWall` = services only,
  `directional` = has a back worth turning to a wall, `underlay` = lies flat and is stood on — read
  ONLY through `solidFurniture()`, never re-tested inline). The lint rules
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
- **(Sites) `docs/adr/*.md` is copied FLAT into `docs-site/adr/`, so a relative link from an ADR to
  anything outside `docs/adr/` is a dead link that FAILS the build.** `../archive/…`, `../research/…`
  and `../testing.md` all resolve at the repo but not on the site, because the copy loses the parent
  directory. Sibling ADR links (`0012-mcp-shim-discoverability.md`) are fine. Cite an out-of-tree path
  as inline code instead of linking it. Cost a build during the 2026-08-12 doc sweep; `docs:build` is
  the only gate that sees it.
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
- **(Parallel worktrees) A clean auto-merge is NOT evidence of correctness when one branch MOVED a
  function another MODIFIED.** v1.25.0's closest call: one agent fixed `windowFacing` in
  `describe.ts` while a second, branched earlier, *extracted that function into a new
  `src/site.ts`* — carrying the pre-fix body. Git conflicted only on the doc comment; taking
  "theirs" would have **silently reverted the fix with a fully green suite**, because the moving
  branch had no courtyard fixture to fail. The typechecker then caught the second half — the new
  lint rule still called the old 4-arg signature, which would have let `arch lint` and `arch
  describe` disagree about a window's facing (invisible on a rectangular plan, wrong on a
  courtyard). **When merging parallel agent branches: diff the MOVED body against the newer
  version, and run both branches' fixtures TOGETHER** — that pairing is the only real proof, and
  neither branch can produce it alone.
- **(Docs vs npm) Pushing to `main` deploys the docs site; only a `v*` tag moves npm.** So a
  language feature merged and not released puts `archlang.uk` in the position of documenting syntax
  `npx @chanmeng666/archlang` cannot parse. This actually happened between the v1.25.0 merges and
  the release (the live reference served `site { … }` and `door pocket … slide left` while npm was
  still 1.24.0). If you land a language surface and are not releasing it the same day, say so
  explicitly — the mismatch is invisible from inside the repo, where everything is consistent.

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
  historical narrative is archived outside this repo, at
  `archcanvas-growth/archive/archlang/docs-archive/agents-status-history-2026-07.md`).
- Release and work history is recorded in `CHANGELOG.md` **only** — do not create or append
  per-session work logs under `docs/` (the old top-level `WORK-LOG.md` is frozen in that same
  archive, as `WORK-LOG-v0.7-v1.15.md`).
</content>
