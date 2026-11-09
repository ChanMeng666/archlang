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

### EH0.2 · a red nightly or red `main` notifies — `done (#584)` · S · high · sonnet · C-F4
`nightly.yml` `report` and `main-red.yml`: label the marker issue `ci-red`, post a comment on every
red run (a body edit notifies nobody), close or relabel on the first green. Add
`gh issue list -l ci-red` to `docs/agents/commands.md` § session start. Proof: the workflow YAML
validates (`gh workflow view`), and the PR body quotes the two `issues.createComment` calls.

### EH0.3 · release guard — `done (#583)` · S · high · sonnet · C-F1, C-F2, C-F17
First step of `release.yml` `publish`: tag = core `package.json` version; tag SHA is an ancestor of
`origin/main`; the SHA's CI run concluded `success` (`gh api .../commits/$SHA/check-runs`);
`CHANGELOG.md` has a `## [<version>]` section; `workflow_dispatch` refuses a ref that is not a `v*`
tag. Same ref guard in `publish-openvsx.yml`. Create the GitHub Release before the MCP registry sync.
A final `verify` job `npm view`s every published package at its `package.json` version. The 3D
job's "registry 5xx → warning" becomes a failure. Proof: a dry run of the guard script against the
`v1.57.0` tag passes and against a mistyped tag fails (run the script locally with `--dry-run`).

### EH0.4 · deploy waits for CI — `done (#585)` · S · high · sonnet · C-F3 · EH-D5
`deploy.yml` triggers on `workflow_run` of `CI` with `conclusion == success` on `main` (keep
`workflow_dispatch`). The checkout uses `github.event.workflow_run.head_sha`. Proof: PR body shows the
trigger block and the SHA plumbing; after merge, the next `main` push produces one deploy run that
starts after CI's.

### EH0.5 · required checks and the stale protection line — `done (2026-11-09: ten required checks incl. 3D package (check:3d), Analyze (javascript-typescript), Analyze (actions); ci-throughput § 1 corrected)` · S · owner · (coordinator) · C-F9
Owner setting: add `3D package (check:3d)` and CodeQL `Analyze` to `main`'s required contexts
(EH-D2). Repo side: correct `docs/plans/ci-throughput.md` § 1 ("no branch protection" is false since
option A). Proof: `gh api repos/ChanMeng666/archlang/branches/main/protection` lists nine contexts.

### EH0.6 · `mcp-worker` is built before merge — `done (#587)` · S · high · sonnet · W-F1
Add `npm run mcp-worker:build` to the `Workspace builds` job and to `build:workspaces`. Proof: the
job log shows the wrangler/rolldown bundle step; its minutes are reported in the PR body.

### EH0.7 · five duration-balanced shards — `done (#586)` · S · high (workflow) + low (tests) · sonnet · T-F4, C-F5, P-F10 · EH-D9
(a) Move `net-area.test.ts`'s corpus oracle (the 235 s `it` at `:483`) into
`test/net-area-oracle-corpus.test.ts` as `it.each` per corpus directory. (b) Add a vitest
`sequencer` whose `shard()` does longest-processing-time balancing over
`test/.durations.json` (unknown files get the median; sorted by name first, so deterministic), and
`scripts/gen-test-durations.mjs` that writes the table from a `--reporter=json` run (nightly uploads
it; not drift-gated: a stale table costs balance, never correctness). (c) `ci.yml` matrix
`shard: [1..5]` and the `Node 22` aggregator's expectations. Proof: two code PRs after merge show
the five shard times in the PR body; the longest is under 6 min.

### EH0.8 · retries no longer hide flakes — `done (#620)` · S · low · sonnet · C-F8
Both Playwright configs add the `json` reporter; a step parses it for status `flaky`, prints
`::warning::` and a job-summary line per flaky case; nightly `e2e-prod` fails on any flaky.
Proof: the parser run on a saved report with one flaky case prints the warning.

### EH0.9 · token-bearing jobs — `done (#588)` · S · high · sonnet · C-F11, C-F12, C-F13, C-F14
`deploy.yml` and `release.yml`: `npm ci --ignore-scripts && npm rebuild esbuild`; Cloudflare env
moves from job level to the wrangler step. CodeQL matrix adds `actions`. Dependabot: security
updates on, `cooldown: default-days: 7`. Proof: the PR body lists each diff hunk and its finding.

## Wave 1 · every breakage class has a guard

### EH1.1 · release-compatibility gate — `done (#599)` · M · medium · opus · T-F8 items 1–3, 5
`scripts/compat-check.mjs`, run in the `Node 22 checks` job: fetch the last published core and MCP
tarballs (`npm pack <pkg>@latest` into a tmp dir) and compare, additive-only: (1) the sorted
declaration list of `dist/index.d.ts` (needs `npm run build` in that job, or compare `src/index.ts`
export names + the `.d.ts` of the tarball against a drift-gated `api/archlang.api.txt`); (2) MCP
`listTools()` schemas: no removed tool, no new required param, no narrowed enum; (3)
`schemas/plan.schema.json`: no removed property, no new required, `version` unchanged; (4)
`ERROR_CATALOG` key set: no removed code. Overridable only by a `BREAKING:` line under
`[Unreleased]`. Skips loudly offline, fails under `CI`. Proof: the script run against `main` passes;
with a deleted export it fails naming the export.

### EH1.2 · a new element kind fails loudly everywhere it must be handled — `done (#598)` · M · medium · opus · A-F1, A-F11
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

### EH1.7 · counts not clocks; fast-check policy — `done (#610)` · S · low · sonnet · T-F5, T-F6
Replace `wall-closure-measure.test.ts:110-112`'s `Date.now()` bound with the scan's probe count.
Guard test: no `Date.now()`/`performance.now()` inside an `expect(` in `test/**`, allow-list named.
Per-test timeouts above 120 s need an allow-list row. `test/setup/fast-check.ts` (vitest
`setupFiles`): `fc.configureGlobal({ numRuns: base × FC_SCALE })` and `runs(n)`; `FC_SCALE`
default 1, `0.25` under `check:quick`; nightly `fuzz-deep` job at `FC_SCALE=10` over
`fuzz|escape-fuzz|equivariance-fuzz|frame|reroll-findrun-oracle`, seed printed. A non-vacuity
assertion must be seeded (lint check). Proof: suite green at scale 1; the nightly job added.

### EH1.8 · the CLI runs in-process — `done (#613)` · M · medium · opus · T-F1
`src/cli/run.ts` exports `runCli(argv, io: {stdout, stderr, stdin, cwd, env}) → Promise<number>`;
`src/cli.ts` becomes `exitFlushed(await runCli(process.argv.slice(2), nodeIo))`. Thread `io`
through the `cmd*` functions (about 120 `process.stdout/stderr` sites; `watch` keeps its handle).
`test/helpers/cli.ts`: `runArch(args, {input, cwd})` with today's `{status, stdout, stderr}` shape,
and `spawnArch` for `cli-flush`, `watch` and exit-flush cases. Migrate the 40 spawn copies. A grep
guard refuses a new `spawnSync(… "src/cli.ts")`. Proof: every `cli-*` test green; nightly coverage
shows `src/cli/**` above 0; Node 22 shard total down (report the number).

### EH1.9 · CLI flag matrix and contract table — `done (#619; 72 honest TODO rows remain, ratcheted)` · S+M · low · sonnet · T-F2, T-F8 item 4 · depends EH1.8
`test/cli-flag-matrix.test.ts` derives (command × flag) from `buildManifest()`; each pair needs an
`EXERCISED` row naming its test, seeded with today's gaps as `TODO` rows; close `arch import` (exit
0/2/3, `--json`, `--out`) and `batch --jobs` (jobs 1 = jobs 4 bytes) first.
`test/cli-contract.test.ts`: per command, ok / user-error / usage-error inputs → exit code and the
`--json` envelope key set against `test/tables/cli-envelopes.json`, additive-only. Proof: both
tests green; the `TODO` count in the PR body.

### EH1.10 · malformed input never throws — `done (#593; its three findings are EH1.15)` · M · low · sonnet · T-F3, S-FZ-5
Seeded fast-check mutators over valid `planToJson` output (drop key, wrong type, NaN, ±1e12,
empty array, extra key, `__proto__`) into `planFromJson`; laws: never throws, result is a plan or
≥ 1 catalogued `E_JSON_*` with a JSON path, `Object.prototype` unchanged, round-trip law intact for
unmutated input. Same for `openPlan3dToArch` from `test/fixtures/openplan3d`. Nightly coverage adds
the `lcov` reporter to its artifact. Proof: both files above 95 % branches in the next nightly.

### EH1.11 · diagnostics cost O(1) each — `done (#597)` · S · medium · opus · S-F1 · EH-D8
`offsetToLineCol` (`src/diagnostics.ts:145-158`) reads a per-source line-start table (binary
search), built once and memoised with the lex stage. Cap diagnostics at 500 per compile, then one
`E_DIAGNOSTIC_LIMIT` (catalogued, `gen:errors`). `test/diagnostics-volume.test.ts`: 64 KiB of `@`,
NUL, `zone "a" {`, `let a = 1` each produce ≤ 501 diagnostics; a counter seam proves
`offsetToLineCol` work is linear. Sub-cap output pinned byte-identical over the corpus and the defect
corpus. Add the four inputs to `scripts/measure-cpu.mjs`. CHANGELOG line under `[Unreleased]`.
Proof: digests unchanged; the four inputs under 1 s in the test.

### EH1.12 · `import` is rooted — `done (#601)` · S · medium · opus · S-F2 · EH-D7
`makeNodeWorld` (`src/cli/io.ts:315-326`) resolves with `realpath`, refuses a result outside the
working directory unless `--import-root <dir>` names an ancestor, refuses non-`.arch`, caps module
size at the input limit. `E_IMPORT_PARSE` for an imported file reports line:col, never the token.
Tests for `..`, absolute, symlink, `.txt`, and a sibling-directory library that still imports.
`test/import-world-fuzz.test.ts` (S-FZ-2) over hostile specs. CHANGELOG line. Proof: the probe
from the audit (`import "../../secret.txt"`) returns a diagnostic with no file content.

### EH1.13 · browser surfaces: capped inflate, one sanitiser, a CSP — `done (#594, #595)` · S · low · sonnet · S-F4, S-F5, S-FZ-3
`playground/src/share.ts` uses `inflateCapped` (1 MiB) with a visible "link too large" notice,
also for `#s=`. `svgElement` from `mcp-worker/src/viewer/viewer.ts:114-128` becomes a shared
helper used by `packages/web-component/src/arch-plan.ts:193` and `playground/src/viewer.ts:31`.
`playground/public/_headers` gains a CSP (no inline script unless hashed; measure the e2e first).
Codec fuzz: arbitrary base64url and high-ratio deflate through `decodePayload`,
`decodePlanHashWeb`, `srcFromHash`: size cap holds, no throw. Proof: playground unit tests + e2e
green; the 204 KB bomb from the audit is refused.

### EH1.14 · agent docs name no blocked command; stale recipes fixed — `done (#605, #606)` · S · low+high · sonnet · N-F1, N-F2, N-F3 · EH-D3
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

### EH1.15 · `planFromJson` hardening — `done (#607)` · M · medium · opus · from EH1.10's findings and #597's review
Three defects #593 pinned as `it.fails`: a non-string furniture `label` and a non-string `title.*` field
throw `TypeError` from the emitter (should be a pathed `E_JSON_SCHEMA`); identifier-like strings (an
empty `category`, a number in an opening `id`) are emitted unchecked and the source then fails to
parse, and quotes/newlines in an identifier position are a source-injection vector by the same
mechanism. Also `Validator.err` pushes without a limit, so 64 KiB of `{"rooms":[{},…]}` yields tens of
thousands of `E_JSON_SCHEMA` through the hosted `plan_json` tool. Do: validate every field the emitter
quotes or writes as an identifier before emission (grammar's identifier rule, closed vocabularies,
a shared string-literal printer that escapes quotes, backslashes, newlines); cap the validator's
diagnostics with `capDiagnostics`; flip the three pins to plain tests and remove the absorbers; a seeded
property test over hostile strings in every string field. CHANGELOG `### Fixed` ×2. Proof: the former
pins green; the 64 KiB probe ≤ 501 diagnostics; corpus digests unchanged.

### EH1.16 · review residue of wave 1 — `done (#608)` · S · low · sonnet
From the fresh-context reviews of #594, #598, #599: (a) `svg-sanitize` fast-path negatives built by
injecting `<!--`, `<![CDATA[`, `<?`, `<!DOCTYPE`, `<SCRIPT>`, `<rect/onload=x>` into a real example's SVG
(each must fail `isPlainSvg` and clean to nothing removable); document that the fast path repairs
malformed input while the full path refuses it; CSS `url(` is not inspected. (b) `OpeningJson.kind`
(`src/plan-json.ts` ~:371) and the schema enum (~:2550) are hand-written twins of `OPENING_KINDS`: tie them
to `KIND_FACETS` by a test. (c) `scripts/compat-check.mjs` does not compare generic constraints,
`readonly`, or the literal values of `as const` objects; the old shim runs against the repo's current
zod and MCP SDK (after a major bump of either, pin the old versions in the cache). Proof: each item a
test or a doc sentence; no `src/` change except (b) if a derivation is cheap.

### EH1.17 · residue of the second review batch — `done (#617)` · S · low · sonnet
(a) `scripts/compat-check.mjs` reports a member whose printed type is a NON-EXPORTED alias (e.g. `readonly KindsWith<"opening">[]`) as "new: (none)"; resolve such aliases structurally (print the apparent type with `typeToString` flags that expand aliases, or fall back to the alias's declared type) so a derived literal union compares as its members (#608 had to cast to a hand-written tuple). (b) Root `packages/archlang-3d/src/node.ts`'s `makeNodeWorld` like `src/cli/io.ts` (realpath containment, `.arch` only, size cap; EH1.16d's allow-list row then goes). (c) `hasFixtureGlyph`/the manifest guard: a drawer returning `[]` passes — pin per-family non-empty output (the alias golden table from #611 already does; confirm and drop the redundancy or keep both with a sentence). Proof: tests; no `src/` change except (b).

### EH1.18 · CLI exit codes on a plan that does not parse — `done (#648: impact exits 2; fmt stays 0 by pinned contract (MCP hash parity) and is documented with repair/reroll/suggest/complete/link)` · S · medium · sonnet · from #619's review
`fmt`, `repair`, `reroll`, `suggest`, `complete` and `impact` exit 0 on a plan with `E_PARSE` (pinned as-is in
`test/cli-contract-cases.ts`); `link` does so by documented contract (`docs/cli-reference.md`: a plan that does
not compile still gets a link). `impact` is the one that matters: a CI gate on `impact` passes on a broken plan
while its docs say "what broke". Decide per command (document the exit-0 contract, or exit 2 with the
diagnostic), update `docs/cli-reference.md` through `gen:cli` and the manifest descriptions, and move the
contract table rows with the generator and a reason. CHANGELOG for any exit-code change (a breaking change for
scripts: say so). Proof: `cli-contract` green with the new rows; `docs-flags`/`cli-help` green.

### EH1.19 · clear the open CodeQL alerts on main — `done (#653; zero open alerts on main; guard test for replace-chain escapers)` · S · medium · sonnet · from #645's CodeQL red
Code scanning holds four open non-test alerts: `actions/missing-workflow-permissions` on
`.github/workflows/plugin-validate.yml` (add `permissions: contents: read`), and `js/incomplete-sanitization` in
`eval/fidelity-run.ts:77`, `scripts/gen-cli-reference.ts:39` and `scripts/gen-grammars.ts:248` (replace-chain
escapers → character maps, as `gen-module-map.ts` does; regenerate and prove the generated files byte-identical).
Twenty-two test-only alerts (regexes over compiler-emitted SVG) were dismissed as "used in tests" on 2026-11-10
with a comment naming this card; a header line shift had surfaced them all on #645. Proof: zero open alerts;
`check:drift` green.

## Wave 2 · structure, by pure moves

Every move PR also repoints the source-text guards: tests that read a module's bytes (`readFileSync("src/analyze.ts")`-style, e.g. `test/arc-tessellation-error.test.ts`, `test/iso-describe-blind.test.ts`'s module list) follow the code to its new file (EH1.4 learned this on CI).

### EH2.1 · error catalogue by family, typed once — `done (#614; the fix-table half dropped after measurement)` · M · medium · opus · A-F3, P-F4 · depends EH1.1
`src/error-catalog/` with one file per family (`parse`, `resolve`, `openings`, `lint-doors`,
`lint-stairs`, `intent`, `json`, …), each `defineEntries({ E_X: e("msg", "cause", "fix", "ex") })`
filling `code` from the key; `error-catalog.ts` spreads them in today's key order into the same
frozen object. `export type CatalogCode = keyof typeof …`; internal `diag(code: CatalogCode, …)` for
new sites; public `Diagnostic.code: string` unchanged. Second commit: `error-fix-table.ts` (code →
`fix`, severity) is what `diagnostic-json.ts:84` reads; the prose catalogue loads only for
`explain`/CLI/docs; a test asserts the two agree per code. Proof (amended 2026-11-09 by #614's review: key ORDER is not part of the contract — nothing in `src/`, the generators or the packages reads it; entries must be identical BY CODE): per-code JSON identical before/after; `gen:errors`, `gen:llms` no drift; corpus `--json`
diagnostics digest unchanged; playground compiler chunk size before/after from its own build.

### EH2.2 · `src/ir/` — `done (#618)` · M · medium · opus · A-F2 · depends EH1.4, EH1.6
Verbatim moves, `ir.ts` re-exports: `ir/types.ts` (R* interfaces, `ResolvedPlan`), `ir/expand.ts`
(`Scope`, `expandScope*`, zones, `placeFrame`, `stripRooms`), `ir/side-tables.ts` (the 9 WeakMaps
and accessors), `ir/groups.ts` (partition, `assignIds`, `markPlacement`, demolition,
`registerOpenings`), `ir/checks.ts` (`checkNumberDomain`, `checkDrawnSizes`, `checkPlanDrawable`,
`checkRoomOverlaps`, `checkFurnitureRooms`), `ir/sheet.ts` (`resolveSheet`). `ir.ts` keeps
`resolve*` and `resolveBody`. Each new module's header names what it charges to the meter (A-F13).
Follow-up card (not this one): `resolveBody` steps 3b–8 as named functions, one PR per step.
Proof: `git diff -M --stat` moved counts equal; `tsc`; CI digests unchanged; `check:quick`'s nearest
tests for `ir/*` listed in the PR body.

### EH2.3 · `describe/`, `plan-json/`, `analyze/circulation` splits — `done (#626 describe/, #630 plan-json/, #634 circulation + nav-grid + overlay; summarize stays one function)` · S–M each · medium · sonnet · A-F6 · depends EH1.6
One PR per module, along the section dividers the audit lists: `describe/types.ts` + per-kind
`summarize` blocks; `plan-json/{types,to-json,from-json,emit,ast-json,check-graph,schema}.ts`
(`scripts/gen-plan-schema.ts:14` reads the moved constant); `analyze/{nav-grid,circulation,
circulation-overlay}.ts`. `keep.ts`, `repair.ts`, `furnish.ts` (`furnish/site.ts`), `intent.ts`
(`intent/schema.ts`, `from-json.ts`) follow if the first three land clean. Proof per PR as EH2.2.

### EH2.4 · one write-back, one ring, one plural — `done (#646; residue: none — every ring copy found is on rectRing)` · S · low · sonnet · A-F7, A-F8
`cli/io.ts` `writeBack({target, bytes, read, args})` replaces the five copies in
`commands-author.ts` (order of operations unchanged: recheck before the first byte, `.bak`
included). Replace the ~22 inline TL→TR→BR→BL ring literals with `rectRing`; alias `rectPoly`/
`boxRing` to it after an identity check. Merge the bit-identical `plural` and bbox variants; rename
`naming.ts`'s `Bounds` to `RoomBounds`. One commit per replacement, each proven by digests. Glyph
files follow `.claude/rules/glyphs.md`.

### EH2.5 · one share codec, typed LSP seam — `done (#623)` · M · medium · sonnet · A-F9, W-F3, W-F9
Expose the web decoder + `inflateCapped` + the id regex as a core subpath (`./share`); import it
from `playground/src/share.ts`, `playground/worker/share-core.ts`, `mcp-worker`, `ArchLive.vue`.
Encoders stay per environment. Reconcile `PAYLOAD_CAP_CHARS` (65,536 vs 88,406): rename if they
mean different things, else derive one from `SOURCE_CAP_BYTES`. `editors/vscode`: `CoreLsp`
derived from `typeof import("@chanmeng666/archlang")`, cast removed. Hash pins stay. Proof:
`share-codec` tests green; every example's share link decodes to the same source.

### EH2.6 · one Scene per lint — `done (#624)` · M · medium · opus · P-F3 · depends EH1.6
A one-slot Scene memo keyed by `(ResolvedPlan identity, annotate, theme identity, runtime identity)`
shared by `pipeline.ts` and `lint/rules/annotations.ts:161`; hand out a frozen or cloned Scene
(`CompileResult.scene` is public). Check whether `accessible` belongs in the key. Test: mutate a
returned scene, recompile, bytes unchanged. Playground worker reuses the scene across its
compile/lint/paths passes where the key matches. Proof: digests unchanged; `lint` bench row and
work counts reported before/after.

### EH2.7 · release pins from one source; public-surface map — `done (#627)` · M · medium · sonnet · W-F5, A-F10, A-F13
`scripts/bump-lockstep.ts` (`npm run release:pin`) rewrites the mcp range + version, both
`server.json` versions, the VS Code range, the font pin from the root version; the red lockstep
tests stay as the verifier. `gen:surface` writes `docs/agents/public-surface.md` (export, module,
kind, in-repo consumers, none flagged), drift-gated. `index.ts` header gains a "state" section
(caches, side tables, `_` fields: which to use). `test/meter-headers.test.ts` and the missing header sentences landed with #618 (nine, not seven); only `src/cli.ts`'s header remains here. Proof: drift green; `release:pin --dry-run` prints the eight edits for a scratch version.

### EH2.8 · bench honesty, incremental tsc, packaging — `done (#631 bench vs merge base; #635 incremental tsc; sideEffects → EH2.8b)` · S · low+high · sonnet · P-F1, P-F5, P-F10
Bench job builds the merge base and the head in the same job, runs each twice, reports the ratio;
flags only rows > 5 ms and > 50 %; `lint` reported as its own row class. Both tsconfigs
`incremental: true` with `tsBuildInfoFile` under `node_modules/.cache`. `"sideEffects": false` only
after a test proves every `src/` module is import-side-effect-free; DTS build time measured and a
faster path tried (`tsc --emitDeclarationOnly --incremental`). Proof: two PR bench comments with
the new table; `npm run build` time before/after.

### EH2.9 · fixture glyph dispatch by family — `done (#611)` · S · low · sonnet · A-F12
`fixtureGlyph` dispatches through `FAMILY_OF.get(category)` into `Record<CanonicalFamily, DrawFn>`;
a script proves every category maps to the same draw function before and after;
`fixture-byte-identity` group 1 is the CI proof. Follow `.claude/rules/glyphs.md`.

### EH2.5b · one bounded inflater — `done (#647; decodePlanHashWeb returns a discriminated result)` · S · medium · sonnet · from #623's review
The `./share` subpath ships two bounded inflaters that behave differently: `decodePlanHashWeb` pipes one
`Blob.stream()` with no 1 KiB write slicing and throws, while `inflateCapped` feeds slices and returns codes; the
hosted MCP Worker uses the unsliced one, so the bomb protection exists only where the short-link Worker reads.
Build `decodePlanHashWeb` on top of `inflateCapped` (same cap, same refusal codes), keep every existing link
decoding identically (the 37-example identity test and the at-cap/over-cap cases from #623), and add a test that
the browser-safe module imports no `node:` API (it lives under `src/cli/`, where Node APIs are allowed). A refusal
that used to throw now returns a code: say so in the CHANGELOG. Proof: `share-codec` and the Worker tests green.

### EH2.10 · lint rule costs after the shared Scene — `done (#656: leaf-across-doorway and boundary-no-wall indexed with a checked-in superset test; path-too-narrow inherent, pinned by navCells; the card's other counters and the K1 table are not addressed — partial by design)` · M · medium · opus · from #624's measurements
With the Scene shared, lint's time sits in rules: BALANCED `leaf-across-doorway` 44.9 ms and `boundary-no-wall`
29.1 ms of 163 ms; MUSEUM `path-too-narrow` 75.2 ms of 108 ms. Profile each (what is quadratic or repeated),
cut the cost without moving a byte of `lint()` output (the corpus digest and the K1 table are the proof),
and pin the work with counters in `test/tables/work-counts.json` (EH1.6 tranche 2's geometry counters: nav cells,
split candidates, label relocations) so a regression turns red. Timing is informational only.

### EH2.8b · `sideEffects: false` after an explicit builtins registration — `done (#649; sideEffects false; DTS experiment not comparable with tsup, reverted)` · S · medium · sonnet · from #635
`src/builtins.ts` ends with `setBuiltinDispatch(dispatch)`, an import-time registration into `src/expr.ts`; it is
kept today only because `ir.ts` and `analyze/depends.ts` import `BUILTIN_NAMES` as a value. Make the registration an
explicit call from the pipeline (or have `expr.ts` import the table directly), drop the allow-list entry in
`test/no-import-side-effects.test.ts`, then declare `"sideEffects": false` in the root `package.json` (HIGH tier) with a
CHANGELOG `### Changed` line (consumers' bundlers tree-shake differently). Also try `tsc --emitDeclarationOnly
--incremental` for the 31 s DTS step (#635 did not); keep it only if `dist/*.d.ts` stay byte-identical. Proof: the
side-effect scan green with one pinned entry (`src/cli.ts`'s `void main()`), digests unchanged, the playground bundle
size before/after.

### EH2.3b · residue of the splits — `done (#652: parts a and b; part c (summarize per kind) still open — see EH2.3c)` · S · medium · sonnet · from #626/#630/#634's review
(a) `pairsJson` sits in `src/plan-json/from-json.ts` but its only caller is `to-json.ts`; `to-json` imports `num`/`q`
from `emit.ts` for one use, pulling `emit` → `from-json` → the parser into the projector: move `pairsJson` to
`to-json.ts` (pure move) and give the one `num`/`q` use a tiny shared helper, so the projector no longer loads the
validator. (b) `SUMMARY_MODULES` in `test/iso-describe-blind.test.ts` is a hand-written list that misses the eight
`plan-json/*` modules `describe()` now loads: derive it by an import-closure walk, as `test/describe-overlay-blind.test.ts`
does. (c) Later, with a body edit and its own byte-identity proof: `summarize` (446 lines) into per-kind functions
(`describe/rooms.ts`, `describe/openings.ts`). Proof: digests unchanged; `no-value-cycles` green.

### EH2.3c · `summarize` per kind — `todo` · S · medium · sonnet · part c of EH2.3b
`summarize` (446 lines) into per-kind functions (`describe/rooms.ts`, `describe/openings.ts`), a body edit with its own
byte-identity proof: digests unchanged; `no-value-cycles` green; `iso-describe-blind` (now a closure walk) green.

### EH2.11 · the projector without the parser — `todo` · S · low · sonnet · from #652's review
`src/plan-json/to-json.ts` still loads `src/parser.ts` through `src/ir.ts`, whose only parser value import is
`idSpanOf` (one call). Move `idSpanOf` to a leaf and tighten `test/plan-json-projector-leaf.test.ts` to assert the
parser is absent from the projector's closure. Proof: digests unchanged.

### EH3.7 · merge queue, or CI on the merged result — `done (#658: merge_group triggers on every required workflow; a merge-queue ruleset is rejected on a user-owned repo, so main's required checks are strict (up to date) since 2026-11-10 and allow_update_branch is on)` · S · high · sonnet · from 2026-11-10
Twice today two PRs that were each green merged blind and broke main (#643+#645: a `statSync` import; #645+#646: the
generated `test/INDEX.md` and two header-less tests) and every later PR paid a re-merge round for the generated
files. Enable GitHub's merge queue on `main` (`merge_group` trigger on `ci.yml`, `codeql.yml` and the required
jobs; the aggregator job must run under `merge_group` too) so CI runs on the merged result, or at least set
`strict` on the required checks. Document the queue in `docs/agents/commands.md` § Merging a PR and the
`gh pr merge --auto` form. Proof: a records-only PR merges through the queue; a PR behind a drift-moving PR is
re-run on the merged tree.

### EH2.12 · lint index superset for every ruleset value — `todo` · S · low · sonnet · from #656's review
`resolveRuleset` validates no numbers: a non-finite `doorwayLandingMm` reaches the index. #656 keeps non-finite
boxes in the overflow list; add validation (`E_RULESET_VALUE`, finite and within `MODEL_RANGE_MM`) so the rule never
sees one. Pin with a test.

## Wave 3 · agent navigation

### EH3.1 · generated module map — `done (#639; 378 modules; the :(glob) pathspec lesson is in gotchas)` · M · medium+high · sonnet · N-F5
`scripts/gen-module-map.ts` walks `src/**/*.ts`, `packages/*/src/**/*.ts`, `playground/src/*.ts`;
takes each header's first paragraph (≤ 200 chars) and the optional tags `@budget`, `@reads`,
`@readBy`; emits `docs/agents/module-map.md` grouped by directory; fails on a module with no first
paragraph. `GENERATORS` row (high tier, own PR). `.ignore` lists the artifact. Trim
`docs/agents/architecture.md` to pipeline + conventions + cross-module invariants, pointing at the
map. Proof: `check:drift` green; the map names 100 % of modules.

### EH3.2 · backlog and plans fit in a context window — `done (#629; backlog 220 KB → 142 KB, 45 entries in archlang-lab/backlog-archive.md, docs/backlog-index.md generated; the four done programmes stay: their files are small or cited)` · M · low · sonnet · N-F7 · EH-D4
`scripts/backlog-archive.mjs` moves every `closed|done|won't fix|decided|measured` entry verbatim
to `archlang-lab/backlog-archive.md`, leaving a one-line tombstone only where another doc cites the
id. Normalise open headings to `### <id> · <title> — \`<status>\``. `scripts/gen-backlog-index.ts`
→ `docs/backlog-index.md` (id, title, status, section, anchor), `GENERATORS` row (high tier, with
EH3.1's). `/loop` text points at the index. Test: no closed status in the backlog; every index row
resolves. Archive `visual-assets/`, `playground-minimal/`, `playground-mobile-perf/`,
`public-surfaces/` and `archlang-3d/{development-plan,adr-draft-*}.md` to the lab repo, one README
row each. Proof: `wc -c docs/backlog.md` and the index in the PR body.

### EH3.3 · docs by audience and path — `done (#637, #638)` · M · medium+high · sonnet · N-F4, N-F6, N-F9
`gotchas.md` splits: drawing → `glyphs.md`, sites/e2e → `sites.md`, CLI → `cli.md`, 3D →
`archlang-3d.md`, "examples move suites" → new `.claude/rules/examples.md`; orchestrator-only items
→ `docs/agents/orchestration.md` (including the executor brief limits and "worktree agents start
at `main`"); the two in-file duplicates deleted; iron-laws/REVIEW restatements of AGENTS.md rules
become one-line pointers (high tier, own PR). New rules `.claude/rules/plan-json.md`, `mcp.md`;
recipes `new-fixture-family.md`, `new-cli-flag.md`, `new-mcp-tool.md`, each derived from a real
commit and paired with a registration test (docs-site `mcp.md` tool table pinned to `tools/list`).
Proof: executor read-first bytes before/after in the PR body (target ≤ 40 KB).

### EH3.4 · test helpers and a generated test index — `done (#645 + hotfix #651; 50 modules re-homed, five helpers, generated test/INDEX.md; biome chunked by command length)` · M · low · sonnet · T-F7
`test/helpers/{cli,corpus,world,digest,diag,tmp}.ts`; `corpus.ts` is the one `corpusFiles({dirs})`
the byte-identity sweep uses, with named subsets. Move the 51 helper/table modules under
`test/helpers/` and `test/tables/`. Migrate opportunistically; a grep guard blocks new copies of the
runner, `worldFor`, sha256 one-liners. `gen:test-index` → `test/INDEX.md`: per `src` module the
tests that import it (directly or transitively, reusing `check-quick.mjs`'s distance), per test its
header's first sentence; the 66 unimported modules listed. Proof: drift green; suite green.

### EH3.5 · hooks for the recurring mistakes — `done (#642; three hook rules, changelog job, control-bytes test, corpus guards)` · S · high · sonnet · N-F8
`local-gate.mjs` grows: Edit/Write on a `GENERATORS` artifact or `dist/` → deny with
"run `gen:<script>`"; `vitest -u` together with `-t` → deny except the documented scope; recursive
delete whose target contains a reparse point → deny. CI step: added CHANGELOG lines must sit under
`## [Unreleased]`, no deletions in a code PR. Test: no control bytes in tracked `*.md`.
`check-quick.mjs`: `examples/` or `docs/**/*.md` changes always add the directory-scanning guards
(derived by scanning tests for `readdirSync("examples")`). PR template rows for moved digests and
CHANGELOG placement. Proof: each hook exercised once with the denied command in the PR body.

### EH3.6 · nightly sampled mutants (report-only) — `done (#644; six operators, incremental report, 85-min budget; first nightly run is the real proof)` · M · low · sonnet · T-F9
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
