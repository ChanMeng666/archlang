# Commands & CI

`package.json` is the script list. This file holds what the names don't say.

## Non-obvious scripts

- `npm run check` = `typecheck` + `lint` + `check:test-wiring` + `npm test`. Its `typecheck` covers
  `src/` only; `npm run typecheck:all` adds `test/`, `eval/`, `dataset/`, `scripts/`, `bench/` and
  the four workspaces. Run `npm run build` first: without `dist/` the playground resolves the bare
  `archlang` specifier to the wrong package and reports dozens of spurious "no exported member" errors.
- `npm run check:drift` is separate from `check` and is a CI gate. `gen:all` orders `gen:spec`
  before `gen:llms` before `gen:cli` (the CLI reference states the bundle size `gen:llms`
  measures). Run `gen:example-svgs` after any rendering change.
- `npm test` runs the vitest include list in `vitest.config.ts` — `test/`, `playground/test/`,
  `packages/*/test/`, `editors/vscode/test/`. `check:test-wiring` fails on a test outside it.
- `*:build:only` scripts skip the core rebuild; `npm run build` must have run.
- `e2e:playground` / `e2e:docs` run Playwright against the BUILT site. `E2E_BASE_URL=<origin>` drops
  the preview server and drives that origin instead (nightly uses it with `--grep @prod`).
- `eval:ci` is the offline authorability gate: it scores the committed goldens (rewriting the
  tracked `eval/results.md`), compares each with `eval/judge-fixture.json` and exits 1 only on a
  regression against it (a golden recorded as passing that now fails, or a moved
  `physicalWarnings`/`lintWarnings` count). It never requires every golden to pass; its last line
  says how many are recorded as failing and under which decision (`fixtureVerdict`, `eval/run.ts`).
  `eval:fidelity` is a separate, judge-free corpus whose numbers are never compared with it;
  `eval:live` is paid and owner-only.
- `npm run digest:engines` (ADVISORY, always exits 0, last line `status=` clean, diverged, incomplete or
  baseline-stale) measures cross-engine determinism: the built `dist/` is run in Playwright chromium,
  firefox and webkit over examples, fixtures, recovery and eval plans plus transcendental probes, and
  each engine's `byte-identity-payload.ts` digest is compared with Node's and the pinned
  `while-byte-identity` baseline; a mismatch names the first differing payload part. It compares the
  agent-facing OUTPUT bytes (SVG, `describe()`, `lint()`, diagnostics, after 2-dp rounding), not
  transcendental agreement: a 1-ulp `Math.cos` difference is invisible by design, and `hypot` is
  caught only where it feeds an exact comparison. It measures, it fixes nothing. Set `PLAYWRIGHT_BROWSERS_PATH` to keep the browsers off the default cache.
- `gen:plugin` (in `gen:all`, drift-gated) writes `plugins/archlang/`: the Claude Code plugin's
  manifest and its copies of the skills. Edit `skills/` (the umbrella `skills/archlang/` included), never the copies.
- `gen:agent-manifests` (in `gen:all`, drift-gated) writes the other hosts' files: `plugins/archlang/plugin.json`, `.cursor-plugin/plugin.json`, `rules/archlang.mdc` and `integrations/copilot/*`. Details: `docs/integrations.md`.
- `build:mcpb` rebuilds the core, then writes both `.mcpb` bundles to the gitignored `dist-mcpb/`;
  `prove:mcpb` unpacks one outside the repo and drives it over stdio. Neither runs in `ci.yml`: only
  `release.yml` runs them, last and best-effort, so a broken bundle shows as a yellow step on a
  green release.
- `build:openai-plugin` writes the OpenAI directory ZIP to the gitignored `dist-openai/` from the
  generated `plugins/archlang/` (adds the version, swaps in the hosted server's `mcp.json`) and checks
  what it wrote; `prove:openai-plugin` re-checks a ZIP. Neither is in CI; the owner uploads by hand.
- `gen:font-cjk` needs Python + fonttools + network and sits outside the drift gate.
- `npm run dev` is `tsup --watch`, not a web server (`playground:dev` / `docs:dev` are the sites).

## CI

`ci.yml` (push to `main` + PRs), all gating except `bench` and `check-3d`; the jobs behind the
`Node 22` check are not required by name, the `Node 22` aggregator gates on them. `main` is protected: its
required checks are the seven gating check names below (not up-to-date-with-`main`, no reviews); `check-3d`
is not one of them (adding it is the owner's branch-protection setting), and repository
auto-merge is on. A new push to a PR cancels that PR's running CI (`concurrency`, per PR number); each
push to `main` runs in a group of its own and is never cancelled.

**Record-only PRs.** The `changes` job sets `code=false` when every changed path is a record: the
negated globs in its `dorny/paths-filter` step (Markdown under `docs/plans/`, `docs/agents/`, a few
unpublished `docs/*.md`, `.claude/**/*.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `editors/vscode/CHANGELOG.md`; never a published
page, an ADR, the README, `spec.llm.md`, a skill, or a non-Markdown file under `docs/plans/`). Then
every gating job still reports its check, green, with its steps skipped, and Node 22 runs the docs
leg instead: `check:drift`, `check:test-wiring`, the suites that read a record (`docs-*`, the seven
that compile every `arch` fence of every Markdown page, `npm-tarball`) and `docs:build`. A push to
`main`, a failed `changes` job or any other path runs everything. A suite that starts reading a record
joins the docs leg's list in `ci.yml`, or the record leaves the filter.

**Code PRs.** Node 18, Node 20 and Windows report green with a job-summary line and run nothing: they
run on every push to `main` and in nightly's `full-matrix`. Node 22 runs: `Node 22` is an aggregator
over `Node 22 checks` and the shards `Node 22 tests 1/3` to `3/3`, and fails if one of them failed,
was cancelled, or was skipped when `changes` did not call the PR a record. A push to `main` runs
every leg, the suite on Node 22 split across those shards. A failed `changes` job runs every leg on
a PR too.

**A break on a main-only leg appears after the merge**, and nothing blocks on it. It is seen in three
places: the red push run on `main`, with GitHub's failed-run notification to whoever merged;
nightly's `report`, which lists a failed `full-matrix` job in the pinned issue, by the next 03:00 UTC;
and `/release-check` item 5, which refuses a release on either. An open pinned issue is only edited,
which notifies nobody, so close it once triaged or the next bad night is silent.

Minutes, a full run measured 2026-10-27 (PR #290 at 2ed9d70e, `gh run view 40416348158`; wall clock
22.7), the Node 22 rows on @@PR@@:

| Job (check name) | Runs | Min |
|---|---|---|
| `changes` (Changed paths) | classifies the PR's paths (not a required check) | < 0.1 |
| `build` (Node 18, Node 20) | push only: typecheck, `lint:ci`, `check:drift`, `npm test`, `eval:ci` | 20.7, 19.9 |
| `node-22-checks` (Node 22 checks) | typecheck, `lint:ci`, `check:drift`, `eval:ci` | @@CHECKS@@ |
| `node-22-tests` (Node 22 tests 1/3, 2/3, 3/3) | `vitest run --shard=N/3` | @@SHARDS@@ |
| `node-22` (Node 22) | gates on the two above; on a record-only PR, runs the docs leg | < 0.2 |
| `builds` (Workspace builds) | `build`, `typecheck:all`, all four workspace builds, MCP `check-dist-resources.mjs`, VS Code bundle tests, `check:test-wiring` (each only here) | 2.0 |
| `windows` | push only: `npm test` + `check:drift` at the runner's default line endings (no `eval:ci`) | 21.1 |
| `e2e-playground`, `e2e-docs` | Playwright against the built sites | 4.7, 4.7 |
| `check-3d` (3D package (check:3d)) | `npm run check:3d` on Linux: `packages/archlang-3d`'s heavy tests (GLB through glTF-Validator, determinism over the corpus, CLI exit codes, the tarball through `npm pack`, the replay in Playwright's Chromium on SwiftShader with ffmpeg, the key-frame pixel baseline pinned to this job's Chromium); browsers in `PLAYWRIGHT_BROWSERS_PATH`, cached by the `playwright-core` version; not a required check | 2.0 (PR #336, browser cache cold) |
| `bench` | informational per-stage timings in the job summary (+ a PR comment on same-repo PRs); never gates; skipped on a record-only PR | 0.9 |

Coverage is not in `ci.yml`: nightly's `coverage` job runs `test:coverage` (report-only). The E2E legs
vary most: their "Install Chromium system deps only" step runs on every run (it installs fonts the
runner image lacks, which the specs' layout depends on): 10 and 18 minutes in run 40329078071, 12 s and
3 min in the run above; the spread is the apt mirror. Options and status: `docs/plans/ci-throughput.md`.

### Merging a PR

Auto-merge (option A of `docs/plans/ci-throughput.md`); nothing waits for CI or for the `push` run on
`main`, which is the first run of Node 18, Node 20 and Windows (§ CI).

1. Review the diff as soon as the PR opens, never after CI; post `reviewed <full sha>` on the PR.
2. `gh pr merge <n> --auto --merge --match-head-commit <full 40-character sha>`: GitHub merges (a merge
   commit; a squash or rebase re-creates allowlisted gitleaks lines) once the seven required checks
   pass, and deletes the branch. A later push voids the pin: re-review, re-run step 2.
   A PR already green and in clean status refuses `--auto` ("clean status"): merge it directly,
   `gh pr merge <n> --merge --match-head-commit <full sha>`. After `gh pr merge --disable-auto` and a
   new push, re-run step 2.
3. PRs touching the same records (`CHANGELOG.md` `[Unreleased]`, handoff, cards) are STACKED: the next
   branches from the previous PR's head and, once that merges, runs `gh pr update-branch <n>` (or
   merges `main`); the coordinator re-pins. Independent PRs run in parallel.
4. A PR that merged `main` after its review is red-teamed again on the merged head (#280/#283).
5. Unlink a worktree's `node_modules` junction before removing the worktree.

`codeql.yml` `analyze` gates too (and runs weekly). `nightly.yml`: `prod-smoke`
(`scripts/smoke.mjs`), `audit` (report-only), `secrets` (gitleaks over full history),
`full-matrix` (`npm test` + `check:drift`), `coverage` (`test:coverage`, the coverage summary and artifact; report-only, `continue-on-error`, outside `report`), `cross-engine` (`digest:engines`, advisory: never fails the night, a divergence updates
the pinned issue; its report is an
artifact), `e2e-prod` (the read-only `@prod` subset against the live sites; its docs half also
detects a stale deploy), and `report` (the single writer of the pinned issue; a fully green night comments on it and closes it). `deploy.yml` deploys
both sites on every push to `main`; `release.yml` publishes on a `v*` tag; `publish-openvsx.yml` (manual) publishes the VS Code
extension to Open VSX. The `eval-*.yml`
workflows are manual and owner-only — never dispatch `eval-l2.yml`.

## Release

`/release-check` (`.claude/commands/release-check.md`) is the checklist and holds the human steps.
Two things it pins:

- **Gate order in the PRIMARY checkout**: `npm run build`, `npm run mcp:build:only`,
  `npm run vscode:build:only`, then `npm run check`. `check` runs
  `editors/vscode/test/stdio.test.ts`, which compares the bundled server's stamped core version with
  the workspace version, so a stale `editors/vscode/dist/server.js` fails it after a version bump.
- **npm shows a just-published version only about 3 minutes after `npm publish` returns.** The
  shim's core-exports check (`VIEW_ATTEMPTS`, `VIEW_INTERVAL_MS` in
  `packages/mcp/scripts/check-core-exports.ts`) can trip on it. The MCP-registry publish validates
  against npm, so `release.yml` first runs "Wait for npm to show the shim version" (`npm view
  … --prefer-online` every 20 s, up to 10 minutes) and fails there if npm never answers. Whatever
  still fails, the remedy is `gh run rerun <id> --failed` (idempotent; backlog 4.7).

`@chanmeng666/arch-plan` is published by `release.yml` in its own job, `publish-arch-plan`, after the
core, so a failure there never blocks the core, the shim or the registry.

## CLI contract

Every command takes `--json` (result on stdout, messages on stderr) and `-` for stdin. Exit codes:
`0` ok · `2` user-source error · `1` IO/internal · `3` bad usage. `arch manifest` prints the whole
CLI as data; `arch <cmd> --help` is rendered from `src/manifest.ts`. `-f svg|dxf|txt|json|pdf|png`
(`pdf`/`png` need the optional deps). `annotate` has no CLI flag, so the element controls that
`accessible` + `annotate` produce are library-only.
