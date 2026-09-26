# AGENTS.md

ArchLang: a declarative language (`.arch`) that compiles to SVG floor plans. TypeScript, Node 18+,
npm-workspaces monorepo; the core (repo root, `@chanmeng666/archlang`) also runs in the browser.
Code and tests are the documentation; this file holds only what they cannot say.

```bash
npm run build         # core + CLI → dist/ (before typecheck:all, e2e)
npm run cli -- compile examples/studio.arch -o studio.svg
npm run check         # typecheck + lint + test-wiring + vitest (floor)
npm run check:drift   # generated artifacts == generator output (CI gate)
npm run typecheck:all # the only typecheck that compiles test/ and the workspaces
npm run docs:build    # after any docs/*.md edit
npm run gen:all       # every gen:* generator
```

## Hard rules

- `compile()` is pure, sync, deterministic: no I/O, time, randomness or Node APIs in `src/` outside
  `src/cli.ts`+`src/cli/`; environment via the `World` seam; numbers via `src/num-format.ts`; never
  mutate the memoised parse-stage `PlanNode` (clone). Zero runtime deps.
- User-source errors are returned as a `Diagnostic` (byte `span` + catalogued `E_*`/`W_*`), never thrown.
- New element = one `src/elements/` module registered in `defs.ts`, no switch. New fixture category =
  a `FIXTURE_FAMILIES` row + a `CATALOG` entry; a drawn symbol ignores its `label`.
- Never hand-edit `dist/` or a generated file; run `gen:*`. Drift-green proves reproducibility, not
  correctness: derive generator templates from the source of truth, never retype.
- A derived position comes from the shape, never its bounding box or centroid.
- Every new language form ships a byte-identity law pinned by test (SHA-256 of SVG + `describe()` +
  `lint()` over the examples). Never bless a golden to green a suite.
- Heights draw nothing; `--view` measures nothing (`describe()`/`lint()` never learn it).
- `npm run check` does not typecheck `test/`; `typecheck:all` does.
- A clean auto-merge of a MOVED function another branch MODIFIED is not evidence: diff the moved
  body, run both branches' fixtures together.
- Releases are tokenless OIDC (`v*` tag); never an npm token, never automate npmjs account/2FA.
  Pushing `main` deploys the sites. Before a tag: `/release-check`.
- Eval: T3 live run declined forever; `eval:live` is paid, owner-only; holdout never published;
  dataset canary never regenerated.
- Sites are light-only (no dark mode); `brand/archlang-logo-master.svg` is byte-sacred.
- No secrets in this public repo. Versions come from npm/tags/`gh release`, never a doc; release
  narrative lives only in `CHANGELOG.md`.

## Where to look

`src/index.ts` public surface · `docs/adr/` decisions · `docs/backlog.md` open work · `.claude/rules/` path-scoped rules (auto-loaded).
`docs/agents/`: `architecture.md` (pipeline, module map) · `gotchas.md` (traps) · `iron-laws.md`
(owner decisions) · `commands.md` (CI, scripts). `docs/testing.md`: red guards, golden policy.
A root `.ignore` hides CHANGELOG, generated files and goldens from ripgrep; name the path to search them.
Authoring `.arch` (not contributing): `spec.llm.md`, `SKILL.md`.

Conventional Commits. `AGENTS.md` + `CLAUDE.md` ≤ 5,000 bytes together (`wc -c`); detail goes in
`docs/agents/`.
