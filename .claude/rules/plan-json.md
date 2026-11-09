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
(`arch ast --json`). The header of `src/plan-json.ts` is the contract; a new Plan JSON field is also a
place a new element kind must be named (`docs/agents/new-element.md`).

- **`version: 1` is append-only.** A field is only added, optional, and never renamed, retyped or
  removed. The schema `schemas/plan.schema.json` is generated from `PLAN_JSON_SCHEMA` in
  `src/plan-json.ts`: edit the constant, run `npm run gen:plan-schema` (`test/plan-schema-drift.test.ts`
  fails on a hand edit), never the file.
- **The release-compat gate reads the schema**: `plan-schema` in `scripts/compat-check.mjs`, run in the
  suite by `test/release-compat.test.ts` against the last published core, additive-only. A removal
  needs a `BREAKING: plan-schema: item` line under `[Unreleased]` and a major.
- **The round-trip law.** For a non-scripting, grouped plan, `planFromJson(planToJson(src))` compiles to
  byte-identical SVG (`test/plan-json.test.ts`; the CLI half `test/cli-plan-json-roundtrip.test.ts`). A
  shipped example that cannot round-trip is named in `CANNOT_ROUND_TRIP` (`test/plan-json-gaps.ts`)
  with the language surface it loses and a `proof` pattern that must still match the file. What the
  format has no field for is reported, never silently lost: `dropped` on `planToJson` (the words are in
  `DROPPED_WORDS`, `src/cli/serialize.ts`), pinned by `test/plan-json-dropped.test.ts`.
- **Emission prints from validated JSON, not from the `Expr` AST.** The decompiler writes statements
  with its own `num()` (full-precision `String(n)` with the exponent expanded by `plainDigits`: a
  resolved number is already rounded, so `fmt3` would lose precision twice). `src/statement-print.ts`
  is the leaf printer `arch fmt` and a lint fix share; it is dependency-light on purpose (no parser
  import) and Plan JSON does not use it, so a printing change there never moves Plan JSON, and the
  reverse. `test/print-roundtrip.test.ts` pins the shared printer.
- **The validator validates before it emits.** Every field's type and word shape is checked, and a
  failure is a catalogued `E_JSON_*` diagnostic naming its JSON path, never a throw and never text that
  reaches the emitted source unchecked (a string is escaped or word-checked; a hostile string cannot
  inject a statement: `test/plan-json-malformed.test.ts`). The diagnostics are capped at 500 plus
  `E_DIAGNOSTIC_LIMIT`. A position probe parses through `parseUnmemoised` so a payload never evicts a
  real source from the parse memo.
- Scripting (`let`, `for`, `if`, `component`) and `import` are not carried by design, except a placed
  component that derives its walls (`components`/`instances`).
