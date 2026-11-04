---
description: Verify a change — check:quick locally, then the PR's CI as the full gate
---

# Verify loop

Prove a change is sound before proposing it. The full suite never runs on this machine (owner's
rule): `npm run check:quick` catches the cheap mistakes in under a minute, then the push lets GitHub
CI run `check`, every platform, e2e and 3D. Only the PR's CI green is merge evidence; a quick pass
is not (a targeted subset misses the corpus-wide guards, `docs/agents/gotchas.md`).

## Steps

1. **`npm run check:quick`** — Biome on the changed files, the typecheck the changes need (the dev
   config for `test/` and `scripts/`, each changed workspace's own), `check:drift`, and the nearest
   tests by import distance (`--max`, default 20; it prints what it cut). `--list` shows the plan,
   `--fix` lets Biome write its fixes. After pushing, read the PR's checks (`gh pr checks <n>`) and
   fix any red from CI's log, never by re-running the whole suite locally.

2. **Drift** (inside step 1; alone: `npm run check:drift`) — runs every generator and fails if any generated artifact differs
   from its committed form.
   - If a drift step fails, run the matching `npm run gen:*` (or `npm run gen:all`) to regenerate
     the artifact **from its source**, then re-run `npm run check:drift`.
   - **NEVER hand-edit a generated file** to make drift pass. The nine generated artifacts
     (`editors/archlang.tmLanguage.json`, `playground/src/arch-language.js`, `docs/error-codes.md`,
     `docs/cli-reference.md`, `spec.llm.md`, `llms-full.txt`, `grammars/archlang.gbnf`,
     `schemas/plan.schema.json`, `schemas/intent.schema.json`) are outputs — edit the source
     (`src/grammar/tokens.ts`, `src/error-catalog.ts`, `src/manifest.ts`, `skills/archlang/SKILL.md`, `examples/`,
     `PLAN_JSON_SCHEMA`, `INTENT_JSON_SCHEMA`) and regenerate.
   - If you touched the CLI, expect `docs/cli-reference.md` to move — it is generated from
     `src/manifest.ts`. **Read that diff**; it is the one artifact a CLI change always rewrites.

3. **`npm run typecheck:all`** — CI only (`builds` job; the local-gate hook blocks it); `check:quick` already typechecks what
   changed. Chase a CI typecheck failure from the CI log. Step 1's `typecheck` only
   covers `src`; this adds the root dev config (`test`, `eval`, `dataset`, `scripts`, `bench`) plus
   the playground, docs-site (vue-tsc), MCP shim and VS Code extension. CI runs it in the `builds`
   job.
   - A `TS2345 … | undefined` on a workspace file that `tsc -p <workspace>` calls clean means a
     ROOT test imported that module into the strict root program. Fix it in the shared module —
     never by relaxing the root option (`docs/agents/gotchas.md` → (Typecheck)).

4. **Conditional gates — CI runs all of these. Locally only `docs:build`; the rest are blocked by
   `.claude/hooks/local-gate.mjs` unless the command carries `#allow-local-heavy` and a reason:**
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
     **`docs/testing.md` §3** before touching it: each says whether the answer is *fix the source*,
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
red-run response for each class of guard: `docs/testing.md`.
