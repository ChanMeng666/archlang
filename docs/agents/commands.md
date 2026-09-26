# Commands & CI

`package.json` is the script list. This file holds what the names don't say.

## Non-obvious scripts

- `npm run check` = `typecheck` + `lint` + `check:test-wiring` + `npm test`. Its `typecheck` covers
  `src/` only; `npm run typecheck:all` adds `test/`, `eval/`, `dataset/`, `scripts/`, `bench/` and
  the four workspaces. Run `npm run build` first: without `dist/` the playground resolves the bare
  `archlang` specifier to the wrong package and reports dozens of spurious "no exported member" errors.
- `npm run check:drift` is separate from `check` and is a CI gate. `gen:all` orders `gen:spec`
  before `gen:llms`. Run `gen:example-svgs` after any rendering change.
- `npm test` runs the vitest include list in `vitest.config.ts` — `test/`, `playground/test/`,
  `packages/*/test/`, `editors/vscode/test/`. `check:test-wiring` fails on a test outside it.
- `*:build:only` scripts skip the core rebuild; `npm run build` must have run.
- `e2e:playground` / `e2e:docs` run Playwright against the BUILT site. `E2E_BASE_URL=<origin>` drops
  the preview server and drives that origin instead (nightly uses it with `--grep @prod`).
- `eval:ci` is the offline authorability gate; `eval:fidelity` is a separate, judge-free corpus
  whose numbers are never compared with it; `eval:live` is paid and owner-only.
- `gen:font-cjk` needs Python + fonttools + network and sits outside the drift gate.
- `npm run dev` is `tsup --watch`, not a web server (`playground:dev` / `docs:dev` are the sites).

## CI

`ci.yml` (push to `main` + PRs), all gating except `bench`:

| Job | Runs |
|---|---|
| `build` (Node 18/20/22) | typecheck, `lint:ci`, `check:drift`, tests (coverage on 22, report-only), `eval:ci` |
| `builds` | `build`, `typecheck:all`, all four workspace builds, MCP `check-dist-resources.mjs`, VS Code bundle tests, `check:test-wiring` |
| `windows` | tests + `check:drift` at the runner's default line endings |
| `e2e-playground`, `e2e-docs` | Playwright against the built sites |
| `bench` | informational PR comment of per-stage timings; never gates |

`codeql.yml` `analyze` gates too (and runs weekly). `nightly.yml`: `prod-smoke`
(`scripts/smoke.mjs`), `audit` (report-only), `secrets` (gitleaks over full history),
`full-matrix`, `e2e-prod` (the read-only `@prod` subset against the live sites; its docs half also
detects a stale deploy), and `report` (the single writer of the pinned issue). `deploy.yml` deploys
both sites on every push to `main`; `release.yml` publishes on a `v*` tag. The `eval-*.yml`
workflows are manual and owner-only — never dispatch `eval-l2.yml`.

## CLI contract

Every command takes `--json` (result on stdout, messages on stderr) and `-` for stdin. Exit codes:
`0` ok · `2` user-source error · `1` IO/internal · `3` bad usage. `arch manifest` prints the whole
CLI as data; `arch <cmd> --help` is rendered from `src/manifest.ts`. `-f svg|dxf|txt|pdf|png`
(`pdf`/`png` need the optional deps). `annotate` has no CLI flag, so the element controls that
`accessible` + `annotate` produce are library-only.
