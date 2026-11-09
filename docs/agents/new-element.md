# Adding an element kind: every place it registers

The recipe is `.claude/commands/new-element.md`; this is its checklist. Each row is a place a new
kind must be named, and what fails when it is forgotten. Derived from commit `176bba0f` (`outdoor`
and `fence`) and from a scratch kind `"zzz"` appended to `BUILTIN_DEFS`, `ElementKind`,
`AstElement` and `ResolvedElement`: every `tsc` row below is an error that scratch kind raised.
A row with no failing check is a gap; say so in the PR rather than relying on review.

## The registry (one module, one line)

| Place | What it holds | Caught by |
| --- | --- | --- |
| `src/elements/<name>.ts` | the `ElementDef`: parse, resolve, render, `bounds()`, `measures()`, `drawCost`, `transform` | `test/transform-seam.test.ts` (a `transform` on every built-in), `test/drawing-budget.test.ts` (estimate ≥ drawn), `test/model-range.test.ts` |
| `src/elements/defs.ts` `BUILTIN_DEFS` | the def, appended at the END (order is id assignment and resolve order) | `test/element-keyword-drift.test.ts`, `test/element-facets.test.ts` |
| `src/grammar/tokens.ts` `KEYWORDS.element` | the keyword, at the END, in `BUILTIN_DEFS` order | `test/element-keyword-drift.test.ts`, `test/element-facets.test.ts` |

## The types

| Place | What it holds | Caught by |
| --- | --- | --- |
| `src/ast.ts` `ElementKind` + `AstElement` | the kind literal and its `…Node` | `tsc` at every exhaustive site below |
| `src/ir/types.ts` `ResolvedElement` | its `R…` type (extends `RBase`) | `tsc` at every exhaustive site below |

## Per-kind dispatch outside the registry (each exhaustive at the type level)

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

## Sets built from, or held to, `KIND_FACETS`

`CROPPED` (`src/cli/review.ts`), `SHELL_KINDS` (`src/furnish.ts`), `STACKED_KINDS`
(`src/keep.ts`), `UNPROJECTED_KINDS` and `OPENING_KINDS` (`src/plan-json.ts`) and the label
fallback of `elementLabelOf` (`src/scene-build.ts`) are BUILT from the table: write the row, not
the set. `VERTICAL_KINDS` (`src/vertical.ts`, a public tuple) and `STYLE_KEYS` (`src/theme.ts`,
whose key order feeds the generated spec) are HELD to it by `test/element-facets.test.ts`.
A kind marked `unprojected` needs a `DROPPED_WORDS` entry (`src/cli/serialize.ts`): `tsc`, since
that table is a `Record` over `PlanJsonDroppedClause`.

## Not caught by any check

- `src/describe.ts`: a summary row for the kind, when `describe()` should report it.
- `src/error-catalog/<family>.ts` (the family the element belongs to, e.g. `openings.ts`, `walls.ts`,
  `site.ts`; a new file is imported and spread in `src/error-catalog.ts`): an entry per new
  `E_*`/`W_*` code (`test/error-catalog-*.test.ts` catch a
  raised code with no entry, not a missing diagnostic).
- `src/lint/rules/`: any rule the kind needs (the lint-rule recipe is `.claude/commands/new-lint-rule.md`).
- The two hand-written opening-kind literals of Plan JSON in `src/plan-json.ts`: the
  `OpeningJson.kind` type (`"door"`, `"window"`, `"opening"`) and the `openings[].kind` enum of
  `PLAN_JSON_SCHEMA` (which `schemas/plan.schema.json` is generated from). A kind marked `opening`
  in `KIND_FACETS` also needs both.
- Generated artifacts (grammars, spec, GBNF, schemas): `npm run gen:all`, then `check:drift` (the
  recipe is `.claude/commands/regen.md`).
