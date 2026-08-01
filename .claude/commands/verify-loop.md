---
description: Run the full local verification loop (check + drift)
---

# Verify loop

The single command to prove a change is sound before proposing it. Run the two aggregate
scripts and report a pass/fail table.

## Steps

1. **`npm run check`** — typecheck (`noUncheckedIndexedAccess` on) + `biome check` + the full
   vitest suite. All three must be green.

2. **`npm run check:drift`** — runs every generator and fails if any generated artifact differs
   from its committed form.
   - If a drift step fails, run the matching `npm run gen:*` (or `npm run gen:all`) to regenerate
     the artifact **from its source**, then re-run `npm run check:drift`.
   - **NEVER hand-edit a generated file** to make drift pass. The nine generated artifacts
     (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`, `docs/error-codes.md`,
     `docs/cli-reference.md`, `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`,
     `schemas/plan.schema.json`, `schemas/intent.schema.json`) are outputs — edit the source
     (`src/grammar/tokens.ts`, `src/error-catalog.ts`, `src/manifest.ts`, `SKILL.md`, `examples/`,
     `PLAN_JSON_SCHEMA`, `INTENT_JSON_SCHEMA`) and regenerate.
   - If you touched the CLI, expect `docs/cli-reference.md` to move — it is generated from
     `src/manifest.ts`. **Read that diff**; it is the one artifact a CLI change always rewrites.

3. **`npm run typecheck:all`** — REQUIRED whenever the change touched anything outside `src/` +
   `test/`; skippable (and worth skipping, it is slow) when it did not. Step 1's `typecheck` only
   covers `src`; this adds the root dev config (`test`, `eval`, `dataset`, `scripts`, `bench`) plus
   the playground, docs-site (vue-tsc), MCP shim and VS Code extension. CI runs it in the `builds`
   job.
   - A `TS2345 … | undefined` on a workspace file that `tsc -p <workspace>` calls clean means a
     ROOT test imported that module into the strict root program. Fix it in the shared module —
     never by relaxing the root option (AGENTS.md → Gotchas; `docs/testing.md` §4).

4. **Conditional gates — run the ones the diff earns:**
   - touched `docs/*.md` or `docs-site/` ⇒ **`npm run docs:build`** (the core suite never compiles
     the site).
   - touched `playground/` ⇒ `npm run build && npm run playground:build:only && npm run
     e2e:playground`.
   - touched `docs-site/` ⇒ `npm run build && npm run docs:build:only && npm run e2e:docs`.
   - touched `packages/mcp` ⇒ `npm run mcp:build && node packages/mcp/scripts/check-dist-resources.mjs`.
   - touched `editors/vscode` ⇒ `npm run vscode:build:only && npx vitest run editors/vscode`
     (the stdio + bundle-freshness tests SKIP without a built bundle).

5. **If tests fail, fix the root cause.** Do not paper over a red suite.
   - Never run `vitest -u`, `UPDATE_GOLDENS=1 vitest run test/visual.test.ts` or
     `ASCII_UPDATE=1 vitest run test/ascii.test.ts` without first reviewing the diff and being able
     to justify **every changed byte**. `compile()` output is byte-for-byte stable and
     snapshot/golden-tested; an unexplained golden change is a real regression, not a snapshot to
     bless.
   - For any other red guard — a lockstep pin, a docs tripwire, an MCP gate — look up its row in
     **`docs/testing.md` §2** before touching it: each says whether the answer is *fix the source*,
     *regenerate*, or *consciously update the pin*.

## Report

Finish with a pass/fail table:

| Gate | Result |
|------|--------|
| typecheck | pass/fail |
| lint | pass/fail |
| tests | pass/fail |
| drift: editors/archlang.tmLanguage.json | pass/fail |
| drift: playground/src/arch-language.js | pass/fail |
| drift: docs/error-codes.md | pass/fail |
| drift: docs/cli-reference.md | pass/fail |
| drift: spec.llm.md | pass/fail |
| drift: llms-full.txt | pass/fail |
| drift: grammars/archlang.gbnf | pass/fail |
| drift: schemas/plan.schema.json | pass/fail |
| drift: schemas/intent.schema.json | pass/fail |

Add a row for each conditional gate you ran (`typecheck:all`, `docs:build`, `e2e:playground`,
`e2e:docs`, MCP dist resources, vscode bundle tests) and mark the ones the diff did not earn as
`n/a — <reason>`. Never report a gate you skipped as `pass`.

Note: `npm run check` covers neither `check:drift` nor `typecheck:all` nor `docs:build` — the core
suite does not compile the docs site or any workspace. Full map of what each gate catches, and the
red-run response for every guard: `docs/testing.md`.
