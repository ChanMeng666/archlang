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

`ci.yml` (push to `main` + PRs), all gating except `bench`. No `concurrency` group and no path
filters; `main` has no branch protection, so "gating" means the merge procedure below waits for it.
Minutes measured 2026-10-26, run for 5b872984 (`gh run view 40329078071`):

| Job (check name) | Runs | Min |
|---|---|---|
| `build` (Node 18, Node 20) | typecheck, `lint:ci`, `check:drift`, `npm test`, `eval:ci` | 20.5, 15.3 |
| `build` (Node 22) | the same with `test:coverage` in place of `npm test` (report-only), plus the coverage summary, the zero-coverage advisory and the summary artifact: the only coverage in CI, and the long pole (its test step alone 42.5) | 43.3 |
| `builds` (Workspace builds) | `build`, `typecheck:all`, all four workspace builds, MCP `check-dist-resources.mjs`, VS Code bundle tests, `check:test-wiring` (each only here) | 2.1 |
| `windows` | `npm test` + `check:drift` at the runner's default line endings (no `eval:ci`) | 18.7 |
| `e2e-playground`, `e2e-docs` | Playwright against the built sites | 11.4, 22.1 |
| `bench` | informational per-stage timings in the job summary (+ a PR comment on same-repo PRs); never gates | 1.0 |

The E2E legs vary most: their apt "Install Chromium system deps" step took 10 and 18 minutes in that
run and under one minute in others. A run's wall clock is its slowest leg (24–60 min over the 15
`ci.yml` runs up to 55d9d2fc's push, PRs and pushes, median ≈ 43). Options to shorten it: `docs/plans/ci-throughput.md`.

### Merging a PR

1. Wait for every check: `gh pr checks <n> --watch` (no `--fail-fast`, see `gotchas.md`), then read
   each conclusion with `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`.
2. Post a PR comment `reviewed <full sha>` naming the commit whose diff was read.
3. `gh pr merge <n> --merge --match-head-commit <full 40-character sha>`: a merge commit (a squash
   or rebase re-creates allowlisted gitleaks lines), pinned to the reviewed commit.
4. Only once `gh pr view <n> --json state` says `MERGED`, delete the remote branch; unlink a
   worktree's `node_modules` junction before removing the worktree.

`codeql.yml` `analyze` gates too (and runs weekly). `nightly.yml`: `prod-smoke`
(`scripts/smoke.mjs`), `audit` (report-only), `secrets` (gitleaks over full history),
`full-matrix`, `cross-engine` (`digest:engines`, advisory: never fails the night, a divergence updates
the pinned issue; its report is an
artifact), `e2e-prod` (the read-only `@prod` subset against the live sites; its docs half also
detects a stale deploy), and `report` (the single writer of the pinned issue). `deploy.yml` deploys
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
