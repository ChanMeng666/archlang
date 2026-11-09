---
paths:
  - "src/plan-json.ts"
  - "src/plan-json/**"
  - "schemas/plan.schema.json"
  - "scripts/gen-plan-schema.ts"
---

# Working on Plan JSON

The machine channel: `planFromJson` (JSON to `PlanNode`, by emitting canonical `.arch` text and running
the real parser), `planToJson` (a resolved plan out, with output-only facts) and `astToJson`
(`arch ast --json`). `src/plan-json.ts` is the entry point and its header the contract; the parts are
`src/plan-json/`: `types.ts`, `schema.ts`, `from-json.ts` (the validator), `emit.ts` (`.arch` emission),
`to-json.ts`, `ast-json.ts`, `check-graph.ts`. A new element kind must also be named in Plan JSON
(see `docs/agents/new-element.md`).

- **`version: 1` is append-only.** A field is only added, optional, and never renamed, retyped or
  removed. The schema `schemas/plan.schema.json` is generated from `PLAN_JSON_SCHEMA` in
  `src/plan-json/schema.ts`: edit the constant, run `npm run gen:plan-schema` (`test/plan-schema-drift.test.ts`
  fails on a hand edit), never the file.
- **The release-compat gate reads the schema**: `plan-schema` in `scripts/compat-check.mjs`, run in the
  suite by `test/release-compat.test.ts` against the last published core, additive-only. A removal
  needs a `BREAKING: plan-schema: item` line under `[Unreleased]` and a major.
- **The round-trip law.** For a non-scripting, grouped plan, `planFromJson(planToJson(src))` compiles to
  byte-identical SVG (`test/plan-json.test.ts`; the CLI half `test/cli-plan-json-roundtrip.test.ts`). A
  shipped example that cannot round-trip is named in `CANNOT_ROUND_TRIP` (`test/tables/plan-json-gaps.ts`)
  with the language surface it loses and a `proof` pattern that must still match the file. What the
  format has no field for is reported, never silently lost: `dropped` on `planToJson` (`src/plan-json/to-json.ts`; the words are in
  `DROPPED_WORDS`, `src/cli/serialize.ts`), pinned by `test/plan-json-dropped.test.ts`.
- **Emission prints from validated JSON, not from the `Expr` AST.** The decompiler (`emit.ts`) writes
  statements with its own `num()` (full-precision `String(n)` with the exponent expanded by `plainDigits`: a
  resolved number is already rounded, so `fmt3` would lose precision twice). `src/statement-print.ts`
  is the leaf printer `arch fmt` and a lint fix share; it is dependency-light on purpose (no parser
  import) and Plan JSON does not use it, so a printing change there never moves Plan JSON, and the
  reverse. `test/print-roundtrip.test.ts` pins the shared printer.
- **The validator (`from-json.ts`) validates before it emits.** Every field's type and word shape is checked, and a
  failure is a catalogued `E_JSON_*` diagnostic naming its JSON path, never a throw and never text that
  reaches the emitted source unchecked (a string is escaped or word-checked; a hostile string cannot
  inject a statement: `test/plan-json-malformed.test.ts`). The diagnostics are capped at 500 plus
  `E_DIAGNOSTIC_LIMIT`. A position probe parses through `parseUnmemoised` so a payload never evicts a
  real source from the parse memo.
- Scripting (`let`, `for`, `if`, `component`) and `import` are not carried by design, except a placed
  component that derives its walls (`components`/`instances`).
