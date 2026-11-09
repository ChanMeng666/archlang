# Engineering-health cards

Format: `### EHx.y · title — status · effort · tier · model`. `tier` is the expected
`scripts/risk-tier.mjs` result (the script decides, not the card). `model` is the executor the
coordinator dispatches (sonnet for mechanical, opus for judgement). Every card: one worktree from
`main`, Conventional Commit, `npm run check:quick` once (plus `docs:build` for `docs/*.md`), PR with
the proof in its body, no CHANGELOG line unless the card says so. A card that moves a corpus digest
stops and reports instead of re-blessing.

Finding ids: A = architecture, T = tests, C = CI, N = navigation, P = performance, S = security,
W = workspaces (`claude-kept/2026-11-09-archlang-health-audit/`).

---

## Wave 0 · the signal is trustworthy

### EH0.1 · nightly `e2e-prod` collects without a build — `done (#581)` · S · low · sonnet
PR #581. Lazy `dist` imports in `playground/e2e/{checks,short-link}.spec.ts`; `home-data.js` read
inside the tests in `docs-site/e2e/{homepage-links,page-chrome}.spec.ts`. Proof: `--list` with no
`dist/` names 29 + 101 cases, no module error. Done when the next nightly's `e2e-prod` is green.

### EH0.2 · a red nightly or red `main` notifies — `todo` · S · high · sonnet · C-F4
`nightly.yml` `report` and `main-red.yml`: label the marker issue `ci-red`, post a comment on every
red run (a body edit notifies nobody), close or relabel on the first green. Add
`gh issue list -l ci-red` to `docs/agents/commands.md` § session start. Proof: the workflow YAML
validates (`gh workflow view`), and the PR body quotes the two `issues.createComment` calls.

### EH0.3 · release guard — `todo` · S · high · sonnet · C-F1, C-F2, C-F17
First step of `release.yml` `publish`: tag = core `package.json` version; tag SHA is an ancestor of
`origin/main`; the SHA's CI run concluded `success` (`gh api .../commits/$SHA/check-runs`);
`CHANGELOG.md` has a `## [<version>]` section; `workflow_dispatch` refuses a ref that is not a `v*`
tag. Same ref guard in `publish-openvsx.yml`. Create the GitHub Release before the MCP registry sync.
A final `verify` job `npm view`s every published package at its `package.json` version. The 3D
job's "registry 5xx → warning" becomes a failure. Proof: a dry run of the guard script against the
`v1.57.0` tag passes and against a mistyped tag fails (run the script locally with `--dry-run`).

### EH0.4 · deploy waits for CI — `todo` · S · high · sonnet · C-F3 · EH-D5
`deploy.yml` triggers on `workflow_run` of `CI` with `conclusion == success` on `main` (keep
`workflow_dispatch`). The checkout uses `github.event.workflow_run.head_sha`. Proof: PR body shows the
trigger block and the SHA plumbing; after merge, the next `main` push produces one deploy run that
starts after CI's.

### EH0.5 · required checks and the stale protection line — `todo` · S · owner · (coordinator) · C-F9
Owner setting: add `3D package (check:3d)` and CodeQL `Analyze` to `main`'s required contexts
(EH-D2). Repo side: correct `docs/plans/ci-throughput.md` § 1 ("no branch protection" is false since
option A). Proof: `gh api repos/ChanMeng666/archlang/branches/main/protection` lists nine contexts.

### EH0.6 · `mcp-worker` is built before merge — `todo` · S · high · sonnet · W-F1
Add `npm run mcp-worker:build` to the `Workspace builds` job and to `build:workspaces`. Proof: the
job log shows the wrangler/rolldown bundle step; its minutes are reported in the PR body.

### EH0.7 · five duration-balanced shards — `todo` · S · high (workflow) + low (tests) · sonnet · T-F4, C-F5, P-F10 · EH-D9
(a) Move `net-area.test.ts`'s corpus oracle (the 235 s `it` at `:483`) into
`test/net-area-oracle-corpus.test.ts` as `it.each` per corpus directory. (b) Add a vitest
`sequencer` whose `shard()` does longest-processing-time balancing over
`test/.durations.json` (unknown files get the median; sorted by name first, so deterministic), and
`scripts/gen-test-durations.mjs` that writes the table from a `--reporter=json` run (nightly uploads
it; not drift-gated: a stale table costs balance, never correctness). (c) `ci.yml` matrix
`shard: [1..5]` and the `Node 22` aggregator's expectations. Proof: two code PRs after merge show
the five shard times in the PR body; the longest is under 6 min.

### EH0.8 · retries no longer hide flakes — `todo` · S · low · sonnet · C-F8
Both Playwright configs add the `json` reporter; a step parses it for status `flaky`, prints
`::warning::` and a job-summary line per flaky case; nightly `e2e-prod` fails on any flaky.
Proof: the parser run on a saved report with one flaky case prints the warning.

### EH0.9 · token-bearing jobs — `todo` · S · high · sonnet · C-F11, C-F12, C-F13, C-F14
`deploy.yml` and `release.yml`: `npm ci --ignore-scripts && npm rebuild esbuild`; Cloudflare env
moves from job level to the wrangler step. CodeQL matrix adds `actions`. Dependabot: security
updates on, `cooldown: default-days: 7`. Proof: the PR body lists each diff hunk and its finding.

## Wave 1 · every breakage class has a guard

### EH1.1 · release-compatibility gate — `todo` · M · medium · opus · T-F8 items 1–3, 5
`scripts/compat-check.mjs`, run in the `Node 22 checks` job: fetch the last published core and MCP
tarballs (`npm pack <pkg>@latest` into a tmp dir) and compare, additive-only: (1) the sorted
declaration list of `dist/index.d.ts` (needs `npm run build` in that job, or compare `src/index.ts`
export names + the `.d.ts` of the tarball against a drift-gated `api/archlang.api.txt`); (2) MCP
`listTools()` schemas: no removed tool, no new required param, no narrowed enum; (3)
`schemas/plan.schema.json`: no removed property, no new required, `version` unchanged; (4)
`ERROR_CATALOG` key set: no removed code. Overridable only by a `BREAKING:` line under
`[Unreleased]`. Skips loudly offline, fails under `CI`. Proof: the script run against `main` passes;
with a deleted export it fails naming the export.

### EH1.2 · a new element kind fails loudly everywhere it must be handled — `in review` · M · medium · opus · A-F1, A-F11
Convert the per-kind switches at `analyze/depends.ts:195`, `analyze/symmetry.ts:665`,
`datum.ts:348`, `ir.ts:4115`, `cursor.ts:257` into exhaustive forms (`Record<ElementKind, …>`
`satisfies`, or `const _x: never`), with explicit `case "x": return false` where not applicable.
`test/element-facets.test.ts`: every `BUILTIN_DEFS` kind is a member of, or an explicit opt-out
in, `CROPPED` (`cli/review.ts:288`), `SHELL_KINDS` (`furnish.ts:1593`), `STACKED_KINDS`
(`keep.ts:1562`), the scene label table (`scene-build.ts:726`), `DROPPED_WORDS`,
`KEYWORDS.element`. `cli/serialize.ts:86-110`: `switch` over `ExportFormat` with a `never` default.
Write `docs/agents/new-element.md` as the derived checklist (each place + the test that catches it).
Proof: digests unchanged (CI); a scratch `kind: "zzz"` added to `BUILTIN_DEFS` makes `tsc` or the
test fail at every listed site (list them in the PR body).
Design: one table `KIND_FACETS` (`src/elements/facets.ts`, `satisfies Record<ElementKind, KindFacets>`) builds `CROPPED`/`SHELL_KINDS`/`STACKED_KINDS`/`UNPROJECTED_KINDS`/`OPENING_KINDS` and the scene label fallback, and holds `VERTICAL_KINDS`/`STYLE_KEYS`; `Statement` switches end in `nonElementKind(s.kind)`, element switches in `const unhandled: never`.

### EH1.3 · lint-rule registration is one test — `done (#589)` · S · low · sonnet · A-F4, N-F6
`test/lint-rule-order.test.ts` pins the full `LINT_RULES` name list once and replaces the three
`slice(-N)` windows (`doors.test.ts:524`, `lint-circulation-privacy.test.ts:439`,
`lint-space-enclosure.test.ts:285`). The same test asserts, per rule, membership in `RULE_CLASS`
(`test/d4-oracle.ts`), the `stages` `DECIDED` table, the error catalogue for every `codes` entry and
`src/lint/ruleset.ts`, with one failure message naming every missing place.
`.claude/commands/new-lint-rule.md`: the checklist derived from commit `974d9981`. Proof: lint
output digests unchanged; a scratch rule appended to `rules/index.ts` fails with all sites named.

### EH1.4 · no runtime import cycles — `done (#590)` · S · low · sonnet · A-F5
Move `analyze.ts:84-770`'s leaf helpers (`rectOf`, `roomBox`, `roomRing`, `roomAreaMm2`,
`pointInRoomBox`, `rectInRoomBox`, `DEFAULT_TOL`, `roomUses`/`is*`, connector/face helpers) to
`src/analyze/rooms.ts` and `src/analyze/connectors.ts`, re-exported from `analyze.ts`; repoint
`sheet-tables.ts:50` and `opening-schedule.ts:72`. Move `PAPER_SIZES`/`PAPER_ORIENTATIONS` to
`grammar/tokens.ts`, re-exported from `sheet.ts`. `lint/defining.ts` takes the rule list as a
parameter from `lint.ts`. `test/no-value-cycles.test.ts`: the import graph (value imports, comments
stripped) has no strongly connected component. Proof: the test lists 0 cycles; digests unchanged.
Design (PR #590): rules reach `defining.ts` through `LintContext.lintRules`, a required field every `buildLintContext` caller passes `LINT_RULES` for (named `lintRules` because `LintContext.rules` is already the ruleset).

### EH1.5 · boundary tests: core never imports 3D, workspace seams are an allow-list — `done (#591)` · S · low · sonnet · W-F2, W-F4
`test/core-no-3d.test.ts`: no `src/**` import specifier names `archlang-3d` or `three`; root
`package.json` has no such dependency. `test/workspace-seams.test.ts`: every `src/` or `dist/`
specifier a workspace reaches outside the `exports` map (`archlang/review` alias,
`mcp-worker/src/app.ts:21`, `mcp-worker/src/server.ts:15`, the `src/index.ts` aliases) is a row
in an allow-list with its reason; a new one fails. Add the seam table to
`docs/agents/architecture.md`. Proof: both tests green on `main`; a scratch import turns each red.

### EH1.6 · work-count golden — `done (#592, tranche 1)` · S (steps + draw) then M (geometry) · low · opus · P-F2, T-F8 item 6
`test/work-counts.test.ts` + `test/tables/work-counts.json`: per `examples/*.arch` and the bench
plans, `{steps: evaluationSteps(), drawUnits: drawUnits()}`; fail on a rise above 10 % without a
reason line in the table's header. Tranche 2 adds counters returned by `splitAll`
(`geometry/joinery.ts:336-360`), `navGridFor` (cells) and `relocateLabels` through a pure `stats`
return or a test-only seam, never through the memoised `PlanNode`. Proof: tranche 1 pins 30 rows;
a scratch extra loop in `expr.ts` turns the test red.

### EH1.7 · counts not clocks; fast-check policy — `todo` · S · low · sonnet · T-F5, T-F6
Replace `wall-closure-measure.test.ts:110-112`'s `Date.now()` bound with the scan's probe count.
Guard test: no `Date.now()`/`performance.now()` inside an `expect(` in `test/**`, allow-list named.
Per-test timeouts above 120 s need an allow-list row. `test/setup/fast-check.ts` (vitest
`setupFiles`): `fc.configureGlobal({ numRuns: base × FC_SCALE })` and `runs(n)`; `FC_SCALE`
default 1, `0.25` under `check:quick`; nightly `fuzz-deep` job at `FC_SCALE=10` over
`fuzz|escape-fuzz|equivariance-fuzz|frame|reroll-findrun-oracle`, seed printed. A non-vacuity
assertion must be seeded (lint check). Proof: suite green at scale 1; the nightly job added.

### EH1.8 · the CLI runs in-process — `todo` · M · medium · opus · T-F1
`src/cli/run.ts` exports `runCli(argv, io: {stdout, stderr, stdin, cwd, env}) → Promise<number>`;
`src/cli.ts` becomes `exitFlushed(await runCli(process.argv.slice(2), nodeIo))`. Thread `io`
through the `cmd*` functions (about 120 `process.stdout/stderr` sites; `watch` keeps its handle).
`test/helpers/cli.ts`: `runArch(args, {input, cwd})` with today's `{status, stdout, stderr}` shape,
and `spawnArch` for `cli-flush`, `watch` and exit-flush cases. Migrate the 40 spawn copies. A grep
guard refuses a new `spawnSync(… "src/cli.ts")`. Proof: every `cli-*` test green; nightly coverage
shows `src/cli/**` above 0; Node 22 shard total down (report the number).

### EH1.9 · CLI flag matrix and contract table — `todo` · S+M · low · sonnet · T-F2, T-F8 item 4 · depends EH1.8
`test/cli-flag-matrix.test.ts` derives (command × flag) from `buildManifest()`; each pair needs an
`EXERCISED` row naming its test, seeded with today's gaps as `TODO` rows; close `arch import` (exit
0/2/3, `--json`, `--out`) and `batch --jobs` (jobs 1 = jobs 4 bytes) first.
`test/cli-contract.test.ts`: per command, ok / user-error / usage-error inputs → exit code and the
`--json` envelope key set against `test/tables/cli-envelopes.json`, additive-only. Proof: both
tests green; the `TODO` count in the PR body.

### EH1.10 · malformed input never throws — `todo` · M · low · sonnet · T-F3, S-FZ-5
Seeded fast-check mutators over valid `planToJson` output (drop key, wrong type, NaN, ±1e12,
empty array, extra key, `__proto__`) into `planFromJson`; laws: never throws, result is a plan or
≥ 1 catalogued `E_JSON_*` with a JSON path, `Object.prototype` unchanged, round-trip law intact for
unmutated input. Same for `openPlan3dToArch` from `test/fixtures/openplan3d`. Nightly coverage adds
the `lcov` reporter to its artifact. Proof: both files above 95 % branches in the next nightly.

### EH1.11 · diagnostics cost O(1) each — `todo` · S · medium · opus · S-F1 · EH-D8
`offsetToLineCol` (`src/diagnostics.ts:145-158`) reads a per-source line-start table (binary
search), built once and memoised with the lex stage. Cap diagnostics at 500 per compile, then one
`E_DIAGNOSTIC_LIMIT` (catalogued, `gen:errors`). `test/diagnostics-volume.test.ts`: 64 KiB of `@`,
NUL, `zone "a" {`, `let a = 1` each produce ≤ 501 diagnostics; a counter seam proves
`offsetToLineCol` work is linear. Sub-cap output pinned byte-identical over the corpus and the defect
corpus. Add the four inputs to `scripts/measure-cpu.mjs`. CHANGELOG line under `[Unreleased]`.
Proof: digests unchanged; the four inputs under 1 s in the test.

### EH1.12 · `import` is rooted — `todo` · S · medium · opus · S-F2 · EH-D7
`makeNodeWorld` (`src/cli/io.ts:315-326`) resolves with `realpath`, refuses a result outside the
working directory unless `--import-root <dir>` names an ancestor, refuses non-`.arch`, caps module
size at the input limit. `E_IMPORT_PARSE` for an imported file reports line:col, never the token.
Tests for `..`, absolute, symlink, `.txt`, and a sibling-directory library that still imports.
`test/import-world-fuzz.test.ts` (S-FZ-2) over hostile specs. CHANGELOG line. Proof: the probe
from the audit (`import "../../secret.txt"`) returns a diagnostic with no file content.

### EH1.13 · browser surfaces: capped inflate, one sanitiser, a CSP — `todo` · S · low · sonnet · S-F4, S-F5, S-FZ-3
`playground/src/share.ts` uses `inflateCapped` (1 MiB) with a visible "link too large" notice,
also for `#s=`. `svgElement` from `mcp-worker/src/viewer/viewer.ts:114-128` becomes a shared
helper used by `packages/web-component/src/arch-plan.ts:193` and `playground/src/viewer.ts:31`.
`playground/public/_headers` gains a CSP (no inline script unless hashed; measure the e2e first).
Codec fuzz: arbitrary base64url and high-ratio deflate through `decodePayload`,
`decodePlanHashWeb`, `srcFromHash`: size cap holds, no throw. Proof: playground unit tests + e2e
green; the 204 KB bomb from the audit is refused.

### EH1.14 · agent docs name no blocked command; stale recipes fixed — `todo` · S · low+high · sonnet · N-F1, N-F2, N-F3 · EH-D3
Rewrite as "CI runs X; read its result": `gotchas.md:57-62,107-109,156-159,311-317`,
`.claude/commands/verify-loop.md` step 2, `docs/backlog.md:26`. `test/agent-docs-gate.test.ts`
scans `docs/agents`, `.claude/**/*.md`, `docs/backlog.md` for the hook's `HEAVY` patterns
(imported from `local-gate.mjs`, not retyped); a hit needs `#allow-local-heavy` or "CI runs".
`regen.md` points at `GENERATORS` instead of listing scripts; `new-element.md` names `fmt2`…; the
`alg-*` agents become `executor-senior`, `executor-mechanical`, `redteam`, `verifier` with the
integration branch as a parameter; `gotchas.md:333` matches `:255`; plans README re-dated. Every
`/x` reference becomes "read `.claude/commands/x.md`" (AGENTS.md's line is the high-tier part,
split into its own PR). Proof: the new test green; `grep -rn '^/\|`/release-check`'` finds no
slash-invocation in agent docs.

## Wave 2 · structure, by pure moves

Every move PR also repoints the source-text guards: tests that read a module's bytes (`readFileSync("src/analyze.ts")`-style, e.g. `test/arc-tessellation-error.test.ts`, `test/iso-describe-blind.test.ts`'s module list) follow the code to its new file (EH1.4 learned this on CI).

### EH2.1 · error catalogue by family, typed once — `todo` · M · medium · opus · A-F3, P-F4 · depends EH1.1
`src/error-catalog/` with one file per family (`parse`, `resolve`, `openings`, `lint-doors`,
`lint-stairs`, `intent`, `json`, …), each `defineEntries({ E_X: e("msg", "cause", "fix", "ex") })`
filling `code` from the key; `error-catalog.ts` spreads them in today's key order into the same
frozen object. `export type CatalogCode = keyof typeof …`; internal `diag(code: CatalogCode, …)` for
new sites; public `Diagnostic.code: string` unchanged. Second commit: `error-fix-table.ts` (code →
`fix`, severity) is what `diagnostic-json.ts:84` reads; the prose catalogue loads only for
`explain`/CLI/docs; a test asserts the two agree per code. Proof: `JSON.stringify(ERROR_CATALOG)`
identical before/after (script in the PR body); `gen:errors`, `gen:llms` no drift; corpus `--json`
diagnostics digest unchanged; playground compiler chunk size before/after from its own build.

### EH2.2 · `src/ir/` — `todo` · M · medium · opus · A-F2 · depends EH1.4, EH1.6
Verbatim moves, `ir.ts` re-exports: `ir/types.ts` (R* interfaces, `ResolvedPlan`), `ir/expand.ts`
(`Scope`, `expandScope*`, zones, `placeFrame`, `stripRooms`), `ir/side-tables.ts` (the 9 WeakMaps
and accessors), `ir/groups.ts` (partition, `assignIds`, `markPlacement`, demolition,
`registerOpenings`), `ir/checks.ts` (`checkNumberDomain`, `checkDrawnSizes`, `checkPlanDrawable`,
`checkRoomOverlaps`, `checkFurnitureRooms`), `ir/sheet.ts` (`resolveSheet`). `ir.ts` keeps
`resolve*` and `resolveBody`. Each new module's header names what it charges to the meter (A-F13).
Follow-up card (not this one): `resolveBody` steps 3b–8 as named functions, one PR per step.
Proof: `git diff -M --stat` moved counts equal; `tsc`; CI digests unchanged; `check:quick`'s nearest
tests for `ir/*` listed in the PR body.

### EH2.3 · `describe/`, `plan-json/`, `analyze/circulation` splits — `todo` · S–M each · medium · sonnet · A-F6 · depends EH1.6
One PR per module, along the section dividers the audit lists: `describe/types.ts` + per-kind
`summarize` blocks; `plan-json/{types,to-json,from-json,emit,ast-json,check-graph,schema}.ts`
(`scripts/gen-plan-schema.ts:14` reads the moved constant); `analyze/{nav-grid,circulation,
circulation-overlay}.ts`. `keep.ts`, `repair.ts`, `furnish.ts` (`furnish/site.ts`), `intent.ts`
(`intent/schema.ts`, `from-json.ts`) follow if the first three land clean. Proof per PR as EH2.2.

### EH2.4 · one write-back, one ring, one plural — `todo` · S · low · sonnet · A-F7, A-F8
`cli/io.ts` `writeBack({target, bytes, read, args})` replaces the five copies in
`commands-author.ts` (order of operations unchanged: recheck before the first byte, `.bak`
included). Replace the ~22 inline TL→TR→BR→BL ring literals with `rectRing`; alias `rectPoly`/
`boxRing` to it after an identity check. Merge the bit-identical `plural` and bbox variants; rename
`naming.ts`'s `Bounds` to `RoomBounds`. One commit per replacement, each proven by digests. Glyph
files follow `.claude/rules/glyphs.md`.

### EH2.5 · one share codec, typed LSP seam — `todo` · M · medium · sonnet · A-F9, W-F3, W-F9
Expose the web decoder + `inflateCapped` + the id regex as a core subpath (`./share`); import it
from `playground/src/share.ts`, `playground/worker/share-core.ts`, `mcp-worker`, `ArchLive.vue`.
Encoders stay per environment. Reconcile `PAYLOAD_CAP_CHARS` (65,536 vs 88,406): rename if they
mean different things, else derive one from `SOURCE_CAP_BYTES`. `editors/vscode`: `CoreLsp`
derived from `typeof import("@chanmeng666/archlang")`, cast removed. Hash pins stay. Proof:
`share-codec` tests green; every example's share link decodes to the same source.

### EH2.6 · one Scene per lint — `todo` · M · medium · opus · P-F3 · depends EH1.6
A one-slot Scene memo keyed by `(ResolvedPlan identity, annotate, theme identity, runtime identity)`
shared by `pipeline.ts` and `lint/rules/annotations.ts:161`; hand out a frozen or cloned Scene
(`CompileResult.scene` is public). Check whether `accessible` belongs in the key. Test: mutate a
returned scene, recompile, bytes unchanged. Playground worker reuses the scene across its
compile/lint/paths passes where the key matches. Proof: digests unchanged; `lint` bench row and
work counts reported before/after.

### EH2.7 · release pins from one source; public-surface map — `todo` · M · medium · sonnet · W-F5, A-F10, A-F13
`scripts/bump-lockstep.ts` (`npm run release:pin`) rewrites the mcp range + version, both
`server.json` versions, the VS Code range, the font pin from the root version; the red lockstep
tests stay as the verifier. `gen:surface` writes `docs/agents/public-surface.md` (export, module,
kind, in-repo consumers, none flagged), drift-gated. `index.ts` header gains a "state" section
(caches, side tables, `_` fields: which to use). `test/meter-headers.test.ts`: every module calling
`chargeSteps` names the meter in its header; write the seven missing sentences; give `src/cli.ts` a
header. Proof: drift green; `release:pin --dry-run` prints the eight edits for a scratch version.

### EH2.8 · bench honesty, incremental tsc, packaging — `todo` · S · low+high · sonnet · P-F1, P-F5, P-F10
Bench job builds the merge base and the head in the same job, runs each twice, reports the ratio;
flags only rows > 5 ms and > 50 %; `lint` reported as its own row class. Both tsconfigs
`incremental: true` with `tsBuildInfoFile` under `node_modules/.cache`. `"sideEffects": false` only
after a test proves every `src/` module is import-side-effect-free; DTS build time measured and a
faster path tried (`tsc --emitDeclarationOnly --incremental`). Proof: two PR bench comments with
the new table; `npm run build` time before/after.

### EH2.9 · fixture glyph dispatch by family — `todo` · S · low · sonnet · A-F12
`fixtureGlyph` dispatches through `FAMILY_OF.get(category)` into `Record<CanonicalFamily, DrawFn>`;
a script proves every category maps to the same draw function before and after;
`fixture-byte-identity` group 1 is the CI proof. Follow `.claude/rules/glyphs.md`.

## Wave 3 · agent navigation

### EH3.1 · generated module map — `todo` · M · medium+high · sonnet · N-F5
`scripts/gen-module-map.ts` walks `src/**/*.ts`, `packages/*/src/**/*.ts`, `playground/src/*.ts`;
takes each header's first paragraph (≤ 200 chars) and the optional tags `@budget`, `@reads`,
`@readBy`; emits `docs/agents/module-map.md` grouped by directory; fails on a module with no first
paragraph. `GENERATORS` row (high tier, own PR). `.ignore` lists the artifact. Trim
`docs/agents/architecture.md` to pipeline + conventions + cross-module invariants, pointing at the
map. Proof: `check:drift` green; the map names 100 % of modules.

### EH3.2 · backlog and plans fit in a context window — `todo` · M · low · sonnet · N-F7 · EH-D4
`scripts/backlog-archive.mjs` moves every `closed|done|won't fix|decided|measured` entry verbatim
to `archlang-lab/backlog-archive.md`, leaving a one-line tombstone only where another doc cites the
id. Normalise open headings to `### <id> · <title> — \`<status>\``. `scripts/gen-backlog-index.ts`
→ `docs/backlog-index.md` (id, title, status, section, anchor), `GENERATORS` row (high tier, with
EH3.1's). `/loop` text points at the index. Test: no closed status in the backlog; every index row
resolves. Archive `visual-assets/`, `playground-minimal/`, `playground-mobile-perf/`,
`public-surfaces/` and `archlang-3d/{development-plan,adr-draft-*}.md` to the lab repo, one README
row each. Proof: `wc -c docs/backlog.md` and the index in the PR body.

### EH3.3 · docs by audience and path — `todo` · M · medium+high · sonnet · N-F4, N-F6, N-F9
`gotchas.md` splits: drawing → `glyphs.md`, sites/e2e → `sites.md`, CLI → `cli.md`, 3D →
`archlang-3d.md`, "examples move suites" → new `.claude/rules/examples.md`; orchestrator-only items
→ `docs/agents/orchestration.md` (including the executor brief limits and "worktree agents start
at `main`"); the two in-file duplicates deleted; iron-laws/REVIEW restatements of AGENTS.md rules
become one-line pointers (high tier, own PR). New rules `.claude/rules/plan-json.md`, `mcp.md`;
recipes `new-fixture-family.md`, `new-cli-flag.md`, `new-mcp-tool.md`, each derived from a real
commit and paired with a registration test (docs-site `mcp.md` tool table pinned to `tools/list`).
Proof: executor read-first bytes before/after in the PR body (target ≤ 40 KB).

### EH3.4 · test helpers and a generated test index — `todo` · M · low · sonnet · T-F7
`test/helpers/{cli,corpus,world,digest,diag,tmp}.ts`; `corpus.ts` is the one `corpusFiles({dirs})`
the byte-identity sweep uses, with named subsets. Move the 51 helper/table modules under
`test/helpers/` and `test/tables/`. Migrate opportunistically; a grep guard blocks new copies of the
runner, `worldFor`, sha256 one-liners. `gen:test-index` → `test/INDEX.md`: per `src` module the
tests that import it (directly or transitively, reusing `check-quick.mjs`'s distance), per test its
header's first sentence; the 66 unimported modules listed. Proof: drift green; suite green.

### EH3.5 · hooks for the recurring mistakes — `todo` · S · high · sonnet · N-F8
`local-gate.mjs` grows: Edit/Write on a `GENERATORS` artifact or `dist/` → deny with
"run `gen:<script>`"; `vitest -u` together with `-t` → deny except the documented scope; recursive
delete whose target contains a reparse point → deny. CI step: added CHANGELOG lines must sit under
`## [Unreleased]`, no deletions in a code PR. Test: no control bytes in tracked `*.md`.
`check-quick.mjs`: `examples/` or `docs/**/*.md` changes always add the directory-scanning guards
(derived by scanning tests for `readdirSync("examples")`). PR template rows for moved digests and
CHANGELOG placement. Proof: each hook exercised once with the denied command in the PR body.

### EH3.6 · nightly sampled mutants (report-only) — `todo` · M · low · sonnet · T-F9
`scripts/mutants.mjs`: seeded sample of 40 mutants per night from `src/num-format.ts` and
`src/expr.ts` (relational boundary, sign, negation, early return); each runs only the nearest tests
(≤ 20 files, 3 min); survivors in the job summary; allow-list of equivalent mutants with reasons.
Never gates merge. Proof: one nightly run's summary linked in the handoff.

---

## Coordinator-only items (no executor)

- Clean the 26 orphan `.claude/worktrees/*` husks after a reparse-point scan (N-F10, W-F12).
- Memory: replace ~12 repo-derivable entries with pointers and ~25 programme-status lines with one
  pointer at `docs/plans/README.md` (N-F9); add the missing repo facts to `gotchas.md` via EH3.3.
- Move the seven audit reports and probe scripts to `claude-kept/2026-11-09-archlang-health-audit/`.
