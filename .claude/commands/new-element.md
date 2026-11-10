---
description: Add a new ArchLang element via the registry convention
---

# Add a new element

Elements are added through the registry, never a `switch`. Dispatch (parse / resolve / render)
goes through `src/elements/defs.ts`. The checklist of every OTHER place a kind must be named (the
types, the exhaustive per-kind switches, the `KIND_FACETS` row), each with the `tsc` error or test
that catches it, is "The checklist" below: work down it.

## Steps

1. **Create `src/elements/<name>.ts`** exporting an `ElementDef` (follow an existing module in
   `src/elements/` as the template — e.g. a simple leaf element). Give it a `transform(el, t)`
   so a `place`d component can carry it (`test/transform-seam.test.ts` requires one on every
   built-in); flip any handed fact when `t.reflected`.

2. **Register it in `src/elements/defs.ts`.** Add it to the registry so parse, resolve, and
   render all dispatch to it automatically, and append its keyword to `KEYWORDS.element`. Then
   add the kind to `ElementKind`/`AstElement` (`src/ast.ts`) and `ResolvedElement` (`src/ir/types.ts`)
   and answer every `tsc` error that raises (the rows of "The checklist"). Do not add
   a new per-kind `switch` or kind list; a yes/no question about kinds is a `KIND_FACETS` field
   (`src/elements/facets.ts`).

3. **Keep the compiler pure.** No I/O, no `Date.now()`, no `Math.random()` in the element module.
   Coordinates are millimetres; origin top-left, +x right, +y down. Route number formatting
   through `fmt0`, `fmt2`, `fmt3`, `fmt4` (`src/num-format.ts`) so output stays byte-stable. Errors for bad user source are **returned** as a
   `Diagnostic` with a byte `span` and a catalogued `E_*`/`W_*` code in its family file `src/error-catalog/<family>.ts`
   (a test enforces every raised code has an entry), never thrown.

4. **Declare `drawCost` and the range inputs.** `drawCost(resolved)` is an upper bound on the
   primitives `render()` emits (`src/draw-budget.ts`; without it the kind is estimated at
   `DEFAULT_DRAW_COST`, wrong for anything that grows with its size); `test/drawing-budget.test.ts`
   checks estimate >= drawn. `bounds()` must list every point drawn and `measures()` every other
   coordinate or length (an opening's width, a thickness, a radius, an offset), because the
   resolver holds both to `MODEL_RANGE_MM` (`E_OUT_OF_RANGE`). Any loop the element runs is
   charged to the step budget (`src/expr.ts`) or capped by a constant, before it allocates.

5. **Add unit tests in `test/`** covering parse, resolve, and render for the new element.

6. **`npm run gen:all`** — if the element introduces new tokens/keywords, the generated spec,
   grammars, GBNF, and schemas must pick them up. (Regeneration is source-driven; never hand-edit
   the generated artifacts — the recipe is `.claude/commands/regen.md`.)

7. **Follow `.claude/commands/verify-loop.md`** — `npm run check:quick` green locally, then the
   PR's CI green.

## Remember

`examples/studio.arch` is the flagship and must stay **lint-clean and import-free**
(`test/world.test.ts` asserts it compiles from a single file with no World). If your element
changes anything the flagship exercises, keep it clean — use inline `furniture <fixture>` there,
not imports.

## The checklist

Each row is a place a new
kind must be named, and what fails when it is forgotten. Derived from commit `176bba0f` (`outdoor`
and `fence`) and from a scratch kind `"zzz"` appended to `BUILTIN_DEFS`, `ElementKind`,
`AstElement` and `ResolvedElement`: every `tsc` row below is an error that scratch kind raised.
A row with no failing check is a gap; say so in the PR rather than relying on review.

### The registry (one module, one line)

| Place | What it holds | Caught by |
| --- | --- | --- |
| `src/elements/<name>.ts` | the `ElementDef`: parse, resolve, render, `bounds()`, `measures()`, `drawCost`, `transform` | `test/transform-seam.test.ts` (a `transform` on every built-in), `test/drawing-budget.test.ts` (estimate ≥ drawn), `test/model-range.test.ts` |
| `src/elements/defs.ts` `BUILTIN_DEFS` | the def, appended at the END (order is id assignment and resolve order) | `test/element-keyword-drift.test.ts`, `test/element-facets.test.ts` |
| `src/grammar/tokens.ts` `KEYWORDS.element` | the keyword, at the END, in `BUILTIN_DEFS` order | `test/element-keyword-drift.test.ts`, `test/element-facets.test.ts` |

### The types

| Place | What it holds | Caught by |
| --- | --- | --- |
| `src/ast.ts` `ElementKind` + `AstElement` | the kind literal and its `…Node` | `tsc` at every exhaustive site below |
| `src/ir/types.ts` `ResolvedElement` | its `R…` type (extends `RBase`) | `tsc` at every exhaustive site below |

### Per-kind dispatch outside the registry (each exhaustive at the type level)

| Place | What the kind must answer | Caught by |
| --- | --- | --- |
| `src/elements/facets.ts` `KIND_FACETS` | one row: `cropped`, `shell`, `stacked`, `unprojected`, `opening`, `vertical`, `styled`, `label` | `tsc` (TS1360, `satisfies Record<ElementKind, KindFacets>`) + `test/element-facets.test.ts`, one `it` per facet |
| `src/cursor.ts` `STATEMENT_EXPRS` | every expression field, in source order | `tsc` (TS2741) + `test/cursor-exhaustive.test.ts` |
| `src/cursor.ts` `statementBodies` | nested statement lists (none for an element) | `tsc` (`nonElementKind` in the `default`) |
| `src/statement-print.ts` `statementText` | the canonical printed form | `tsc` (TS2366, return type `Doc` with no `default`) |
| `src/stages.ts` `ELEMENT_KIND_STAGES` | the authoring stage it is placed at | `tsc` (TS2741) |
| `src/analyze/depends.ts` `readsOf` | the ids/axes it reads beyond its expressions (`describe --facts depends`, `impact`) | `tsc` (`nonElementKind`) |
| `src/analyze/symmetry.ts` `drawnRecs` | its footprint records, or why another record covers it | `tsc` (`const unhandled: never`) |
| `src/datum.ts` `statementAuthorsHeights` | whether its source authors a height (`_heightsAuthored`) | `tsc` (`nonElementKind`) |
| `src/ir/groups.ts` `markPlacement` | its `_placement` (`describe().freedom`), or none | `tsc` (`const unhandled: never`) |

### Sets built from, or held to, `KIND_FACETS`

`CROPPED` (`src/cli/review.ts`), `SHELL_KINDS` (`src/furnish.ts`), `STACKED_KINDS`
(`src/keep.ts`), `UNPROJECTED_KINDS` (`src/plan-json/to-json.ts`), `OPENING_KINDS` (`src/plan-json/from-json.ts`) and the label
fallback of `elementLabelOf` (`src/scene-build.ts`) are BUILT from the table: write the row, not
the set. `VERTICAL_KINDS` (`src/vertical.ts`, a public tuple) and `STYLE_KEYS` (`src/theme.ts`,
whose key order feeds the generated spec) are HELD to it by `test/element-facets.test.ts`.
A kind marked `unprojected` needs a `DROPPED_WORDS` entry (`src/cli/serialize.ts`): `tsc`, since
that table is a `Record` over `PlanJsonDroppedClause`.

### Not caught by any check

- `src/describe.ts` (`summarize`) and its row type in `src/describe/types.ts`: a summary row for the
  kind, when `describe()` should report it.
- `src/error-catalog/<family>.ts` (the family the element belongs to, e.g. `openings.ts`, `walls.ts`,
  `site.ts`; a new file is imported and spread in `src/error-catalog.ts`): an entry per new
  `E_*`/`W_*` code (`test/error-catalog-*.test.ts` catch a
  raised code with no entry, not a missing diagnostic).
- `src/lint/rules/`: any rule the kind needs (the lint-rule recipe is `.claude/commands/new-lint-rule.md`).
- The two hand-written opening-kind literals of Plan JSON in `src/plan-json/`: the
  `OpeningJson.kind` type (`types.ts`; `"door"`, `"window"`, `"opening"`) and the `openings[].kind`
  enum of `PLAN_JSON_SCHEMA` (`schema.ts`) (which `schemas/plan.schema.json` is generated from). A kind marked `opening`
  in `KIND_FACETS` also needs both.
- Generated artifacts (grammars, spec, GBNF, schemas): `npm run gen:all`, then `check:drift` (the
  recipe is `.claude/commands/regen.md`).
