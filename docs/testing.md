# Testing & verification

What runs where, what to do when a guard goes red, and how to add a test. Contributor
documentation — not published to the docs site. Each guard's own header comment and failure message
say what it enforces; this file does not inventory them.

## 1. Tiers

**Local.**

| Command | Notes |
|---|---|
| `npm run check` | typecheck (`src/` only) + Biome + `check:test-wiring` + `npm test`. The floor |
| `npm run check:drift` | every generator re-run and byte-compared. Separate from `check`; its own CI gate |
| `npm run typecheck:all` | the only typecheck of `test/`, `eval/`, `dataset/`, `scripts/`, `bench/` and the workspaces. `npm run build` first |
| `npm run docs:build` | the only thing that compiles the VitePress site |
| `npm run e2e:playground` / `e2e:docs` | Playwright against the BUILT site: `npm run build && npm run playground:build:only` (or `docs:build:only`) first |
| `npm run eval:ci` / `eval:fidelity` | offline eval gates; separate corpora, never compared |
| `npm run test:coverage` | report-only v8 coverage over `src/`; no thresholds, nothing fails on a number |

Minimum: `check` + `check:drift`. Add `typecheck:all` for anything outside `src/` (including
`test/`), `docs:build` for `docs/*.md`, and the matching E2E for `playground/` or `docs-site/`.

**PR** (`ci.yml`, `codeql.yml`) and **nightly** (`nightly.yml`): the job map is in
[`docs/agents/commands.md`](agents/commands.md). Red in nightly's `e2e-prod` means production is
broken or stale, not that a PR is bad.

## 2. Goldens and snapshots

| Kind | Where | Update (only after reading the diff) |
|---|---|---|
| vitest snapshots | `test/__snapshots__/*.snap` | `vitest -u` |
| PNG visual goldens | `test/__goldens__/*.png` (`test/visual.test.ts`) | `UPDATE_GOLDENS=1 vitest run test/visual.test.ts` |
| ASCII goldens | `test/__ascii__/*.txt` (`test/ascii.test.ts`) | `ASCII_UPDATE=1 vitest run test/ascii.test.ts` |
| README/docs SVGs | `examples/*.svg` (`test/example-svgs-drift.test.ts`) | `npm run gen:example-svgs`, then look at the drawing |

**Policy.** `compile()` is byte-stable, so an unexplained golden change is a regression, not a
snapshot to bless. Justify every changed byte or fix the source; never run an update to make a red
suite green. When a rendering change legitimately moves a PNG golden, pixel-diff it and confirm the
diff's bounding box lands where the geometry changed.

## 3. A guard went red — what now

"Regenerate" and "consciously update the pin" are different actions.

| Guard class | Examples | Red ⇒ |
|---|---|---|
| Generated-artifact drift | `check:drift`, `example-svgs-drift` | run the matching `gen:*` and commit. Never hand-edit |
| Lockstep pins (two copies that cannot share an import) | `site-lockstep`, `brand-assets`, `share-codec`, `level-filename-lockstep`, `docs-level-svgs` | change the OTHER copy. A changed `share-codec` hash breaks every shared link — fix the copy, never re-pin |
| Intentional-friction pins | `packages/mcp/test/lockstep.test.ts` and `editors/vscode/test/lockstep.test.ts` dep range (string `^` + root version) | red on every core release by design: re-pin the range, rebuild, bump the shim (`package.json` + both `server.json` versions). Never relax to a semver check |
| MCP baked resources | `packages/mcp/scripts/check-dist-resources.mjs` | `npm run mcp:build` (`gen:all` first if the repo artifact is stale) |
| VS Code bundle freshness | `editors/vscode/test/stdio.test.ts` | `npm run vscode:build:only` |
| Docs tripwires | `docs-table-pipes`, `docs-fences`, `docs-flags`, `readme-permalink`, `docs-examples-figures`, `docs-page-meta`, `playground-examples-rows` | fix the prose from the tool's answer, never the plan to suit the prose; never widen a killed-claim regex; regenerate a permalink with `scripts/gen-permalink.mjs` |
| Byte-identity digests | `roof-void-byte-identity`, `height-byte-identity`, `iso-byte-identity` (baseline `test/byte-identity-baseline.ts`), `site`, `doors` | a finding to explain before anything is re-measured (see below) |
| Model-vs-truth gates | `circulation-hand-derived`, `nav-grid-residual`, `joinery-oracle`, `joinery-pipeline` | a real defect. Never re-bless a number, add a tolerance, enlarge a radius or drop an example |
| Fixture symbol snapshots | `fixture-byte-identity` | group 1 (PERMANENT) red is always a bug; groups 2–3 are re-blessable only with each diff explained |
| Property/fuzz | `escape-fuzz`, `fuzz`, `security`, `dataset` | a shrunk counterexample is pinned as a regression case; never delete a pin |
| Public surface | `public-surface` | re-export the named type from `src/index.ts` |

**Re-measuring a byte-identity digest.** A prose edit to an example can move its digest without a
compiler change: a diagnostic's `span` shifts by the bytes added above it. Diff the `lint()` payloads
field by field — if only `span`s moved, uniformly, and the SVG did not, re-measure and record the
reason in the baseline file's header. Anything else is a compiler change and must be explained. Copy
the test's own `digest()` body verbatim for the baseline. A new height-authoring example goes in
`AUTHORS_HEIGHT` only.

## 4. Adding a test

- **Derive, never retype.** Parse the source of truth (`sync-docs.mjs`'s tuple tables,
  `buildManifest()`, `copy-resources.mjs`); if you parse a literal table, assert its shape too.
- **Anchor on content, not line numbers**, so moving code is free and changing a value is not.
- **A byte-identity law for every new language form**, and a cross-feature test whenever two
  branches edit a shared literal or predicate — with a control case on the identical geometry, so the
  test can tell "it works" from "the check never ran".
- **MCP: drive the server** through `packages/mcp/test/helpers.ts` (real `Client`, in-memory
  transport); malformed args must return an MCP error result, never throw.
- **VS Code: inject, don't import.** Test handlers in `editors/vscode/src/handlers.ts` with text in,
  LSP payload out; test the artifact in `stdio.test.ts`.
- **Playground: extract the pure part** into a module `playground/test/` can unit-test; real DOM,
  pointer or download belongs in `playground/e2e/`.
- **A missing optional dependency skips visibly locally and fails under `CI`.** A suite must never
  go green having asserted nothing.
- **`@prod`** only for a case that purely navigates, reads and asserts (no downloads, clipboard,
  forms, persisted state or typing). Follow each spec file's stated tagging rule.
- **Docs are scanned too**: every tracked `.md` by `docs-table-pipes`; published pages by
  `docs-fences`; the `DOCS` list in `docs-flags.test.ts` for `arch …` flags. Publishing a page means
  adding it to `sync-docs.mjs`'s `PAGES`, which also enrols it in the smoke test and the docs E2E.
- **Place tests inside `vitest.config.ts`'s include globs** or they never run.

## 5. Ad-hoc sweeps ("did anything move?")

- **Prove a sweep can fail before trusting it to pass.** Plant a change (append bytes to one baseline
  file), confirm the sweep names that file, then restore. Pair each file with its own digest (join on
  the name) rather than stripping text.
- **Multi-storey examples emit one SVG per storey**, and `arch compile <f> -o -` is a usage error on
  them — hash every storey, and count storeys, not files.
- **An SVG + `describe()` + `lint()` sweep carries no parse- or resolve-stage diagnostic.** When a
  change can reach the resolver, add `compile().diagnostics` as a fourth payload.
- **Zero corpus movement is not evidence the new path ran.** Instrument it with a counter, show which
  examples reach it, then remove the counter.

## 6. Environment notes

- `editors/vscode` tests need the built bundle (`npm run vscode:build:only`); without it they skip.
  In a `.claude/worktrees/*` checkout `wrong-core.test.ts` fails by design — the bundler refuses to
  bundle another checkout's core — so a worktree's test count is not the repo's.
- Node below 21.2 has no `deflate-raw` in Web streams; the `#z=` codec falls back to `#src=`, so
  compressed expectations are capability-gated.
- `test/roof.test.ts`'s PDF export (a dynamic `import("pdfkit")`) can time out under heavy parallel
  load. Do not raise the global `testTimeout` (`docs/backlog.md` 4.10).
- `scripts/coverage-zero-report.mjs` lists modules at zero coverage; CLI modules appear there because
  `test/cli*.test.ts` spawn the real `arch` in a child process.
