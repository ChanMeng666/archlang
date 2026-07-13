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
   - **NEVER hand-edit a generated file** to make drift pass. The generated artifacts
     (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`, `docs/error-codes.md`,
     `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`, `schemas/plan.schema.json`,
     `schemas/intent.schema.json`) are outputs — edit the source
     (`src/grammar/tokens.ts`, `src/error-catalog.ts`, `SKILL.md`, `examples/`, `PLAN_JSON_SCHEMA`,
     `INTENT_JSON_SCHEMA`, `src/manifest.ts`) and regenerate.

3. **If tests fail, fix the root cause.** Do not paper over a red suite.
   - Never run `vitest -u` or `UPDATE_GOLDENS=1 vitest run test/visual.test.ts` without first
     reviewing the diff and being able to justify **every changed byte**. `compile()` output is
     byte-for-byte stable and snapshot/golden-tested; an unexplained golden change is a real
     regression, not a snapshot to bless.

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
| drift: spec.llm.md | pass/fail |
| drift: llms-full.txt | pass/fail |
| drift: grammars/archlang.gbnf | pass/fail |
| drift: schemas/plan.schema.json | pass/fail |
| drift: schemas/intent.schema.json | pass/fail |

Note: `docs:build` is a separate gate — the core suite does NOT compile the docs site, so a
`docs/*.md` edit still needs `npm run docs:build` to catch a broken site build.
