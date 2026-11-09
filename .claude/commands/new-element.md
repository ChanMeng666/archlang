---
description: Add a new ArchLang element via the registry convention
---

# Add a new element

Elements are added through the registry, never a `switch`. Dispatch (parse / resolve / render)
goes through `src/elements/defs.ts`. The checklist of every OTHER place a kind must be named (the
types, the exhaustive per-kind switches, the `KIND_FACETS` row), each with the `tsc` error or test
that catches it, is `docs/agents/new-element.md`: work down it.

## Steps

1. **Create `src/elements/<name>.ts`** exporting an `ElementDef` (follow an existing module in
   `src/elements/` as the template — e.g. a simple leaf element). Give it a `transform(el, t)`
   so a `place`d component can carry it (`test/transform-seam.test.ts` requires one on every
   built-in); flip any handed fact when `t.reflected`.

2. **Register it in `src/elements/defs.ts`.** Add it to the registry so parse, resolve, and
   render all dispatch to it automatically, and append its keyword to `KEYWORDS.element`. Then
   add the kind to `ElementKind`/`AstElement` (`src/ast.ts`) and `ResolvedElement` (`src/ir/types.ts`)
   and answer every `tsc` error that raises (the rows of `docs/agents/new-element.md`). Do not add
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
