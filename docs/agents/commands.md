# Commands, CI & the CLI surface

> Moved verbatim from `AGENTS.md` (2026-09-18) so it loads on demand. The everyday commands are repeated in short in `AGENTS.md`; read this for every `gen:*`/`e2e`/workspace script, the CI and nightly job map, export formats, and the full agent-native CLI contract.

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
npm run gen:example-svgs   # re-render the twenty committed examples/*.svg the README embeds — plus the
                     # two axonometric renders docs/axonometric.md embeds (VIEW_SVGS) — from
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
each — is **[`docs/testing.md`](../testing.md)**.

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
red — is mapped in [`docs/testing.md`](../testing.md); read it before adding a test or
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
`role="img"`, with `--acc-id-prefix <p>` to rename those two ids. **The v1.36 element controls are
NOT reachable from the CLI**: `role="button"`/`tabindex="-1"`/`aria-label` on each element's primary
node need the library's `annotate` beside `accessible`, and `annotate` has no flag — `serialize.ts`
turns it on only for `-f txt`/`--ascii`, where it feeds the ASCII renderer
(`docs/language-reference.md` § "Keyboard and screen-reader operability", `docs/backlog.md` A.7).
The error-svg/accessible paths leave the default output byte-identical.
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
