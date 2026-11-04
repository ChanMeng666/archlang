# AGENTS.md

ArchLang: a declarative language (`.arch`) that compiles to SVG floor plans. TypeScript, Node 18+,
npm-workspaces monorepo; the core (repo root, `@chanmeng666/archlang`) also runs in the browser.
Code and tests are the documentation; this file holds only what they cannot say.

```bash
npm run build         # core + CLI → dist/ (before typecheck:all, e2e)
npm run cli -- compile examples/studio.arch -o studio.svg
npm run check:quick   # local pre-push: changed files, nearest tests (CI runs the rest)
npm run check         # typecheck + lint + test-wiring + vitest (CI only)
npm run check:drift   # generated artifacts == generator output (CI only)
npm run typecheck:all # CI only; the one typecheck that compiles test/ + workspaces
npm run docs:build    # after any docs/*.md edit
npm run gen:all       # every gen:* generator
```

## How to work

- Prove a change through the CLI (`arch compile|describe|lint --json`), not by eyeballing SVG.
- Local gate is exactly `check:quick` (+ `docs:build` for docs), then push. `check`, drift,
  `typecheck:all`, vitest runs, e2e and bench are CI's; only CI green is merge evidence. A hook
  blocks them (`.claude/hooks/local-gate.mjs`). Executor briefs list only the local gate.
- Commit or push only when asked. Merge by risk tier (`docs/agents/commands.md` § Merging a PR).

## Hard rules

- `compile()` is pure, sync, deterministic: no I/O, time, randomness or Node APIs in `src/` outside
  `src/cli.ts`+`src/cli/`; environment via the `World` seam; numbers via `src/num-format.ts`; never
  mutate the memoised parse-stage `PlanNode` (clone). Zero runtime deps.
- User-source errors are returned as a `Diagnostic` (byte `span` + catalogued `E_*`/`W_*`), never thrown.
- `compile()` is bounded: every input returns within the step budget and the drawing budget. Charge
  new evaluator work to the step meter BEFORE allocating (`MAX_EVAL_STEPS`, `E_STEP_LIMIT`,
  `src/expr.ts`); budgets are counts, never time. Every coordinate/length stays within
  `MODEL_RANGE_MM` (`src/num-format.ts`, `E_OUT_OF_RANGE`).
- New element = one `src/elements/` module registered in `defs.ts`, no switch; it declares
  `drawCost` (an upper bound on what it draws) and `bounds()`/`measures()` covering every coordinate
  and length it draws. New fixture category = a `FIXTURE_FAMILIES` row + a `CATALOG` entry; a drawn
  symbol ignores its `label`.
- Never hand-edit `dist/` or a generated file; run `gen:*`. Drift-green proves reproducibility, not
  correctness: derive generator templates from the source of truth, never retype.
- A derived position comes from the shape, never its bounding box or centroid.
- Every new language form ships a byte-identity law pinned by test (SHA-256 of SVG + `describe()` +
  `lint()` over the examples). Never bless a golden to green a suite.
- Heights draw nothing; `--view` measures nothing (`describe()`/`lint()` never learn it). 3D lives
  only in the separate `packages/archlang-3d`, never a core dependency (`.claude/rules/archlang-3d.md`).
- A drawing change never moves `describe()`/`lint()` over the corpus, except drafting-layer lint
  rules, which read the sheet (ADR 0032; `docs/agents/iron-laws.md`); a glyph never gains
  handedness and a loss is allow-listed (`test/glyph-chirality.test.ts`).
- `npm run check` does not typecheck `test/`; `typecheck:all` does.
- A clean auto-merge of a MOVED function another branch MODIFIED is not evidence: diff the moved
  body, run both branches' fixtures together.
- Releases are tokenless OIDC (`v*` tag); never an npm token, never automate npmjs account/2FA.
  Pushing `main` deploys the sites. Before a tag: `/release-check`.
- Eval: T3 live run declined forever; `eval:live` is paid, owner-only; the eval corpus is a public fixture, never a holdout;
  dataset canary never regenerated.
- Sites are light-only (no dark mode); `brand/archlang-logo-master.svg` is byte-sacred.
- No secrets in this public repo. Versions come from npm/tags/`gh release`, never a doc; release
  narrative lives only in `CHANGELOG.md`.

## Where to look

`src/index.ts` public surface · `REVIEW.md` what a bad diff looks like · `docs/adr/` decisions · `docs/backlog.md` open work · `docs/plans/` programmes · `.claude/rules/` path-scoped rules (auto-loaded).
`docs/agents/`: `architecture.md` (pipeline, module map) · `gotchas.md` (traps) · `iron-laws.md`
(owner decisions) · `commands.md` (CI, scripts). `docs/testing.md`: red guards, golden policy.
`docs/seo.md` § 8: where the project is listed and who may submit.
A root `.ignore` hides CHANGELOG, generated files and goldens from ripgrep; name the path to search them.
Authoring `.arch` (not contributing): `spec.llm.md`, `skills/archlang/SKILL.md`.

Conventional Commits. This is the only root instruction file; `CLAUDE.md` just imports it;
path-scoped rules go in `.claude/rules/`. Together ≤ 5,000 bytes (`wc -c`); detail goes in `docs/agents/`.
