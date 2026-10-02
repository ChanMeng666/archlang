---
description: Add a new ArchLang element via the registry convention
---

# Add a new element

Elements are added through the registry, never a `switch`. Dispatch (parse / resolve / render)
goes through `src/elements/defs.ts`.

## Steps

1. **Create `src/elements/<name>.ts`** exporting an `ElementDef` (follow an existing module in
   `src/elements/` as the template — e.g. a simple leaf element). Give it a `transform(el, t)`
   so a `place`d component can carry it (`test/transform-seam.test.ts` requires one on every
   built-in); flip any handed fact when `t.reflected`.

2. **Register it in `src/elements/defs.ts`.** Add it to the registry so parse, resolve, and
   render all dispatch to it automatically. Do not add a `switch` branch anywhere.

3. **Keep the compiler pure.** No I/O, no `Date.now()`, no `Math.random()` in the element module.
   Coordinates are millimetres; origin top-left, +x right, +y down. Route number formatting
   through `fmt()` so output stays byte-stable. Errors for bad user source are **returned** as a
   `Diagnostic` with a byte `span` and a catalogued `E_*`/`W_*` code in `src/error-catalog.ts`
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
   the generated artifacts — see `/regen`.)

7. **Run `/verify-loop`** — `npm run check` + `npm run check:drift` must be green.

## Remember

`examples/studio.arch` is the flagship and must stay **lint-clean and import-free**
(`test/world.test.ts` asserts it compiles from a single file with no World). If your element
changes anything the flagship exercises, keep it clean — use inline `furniture <fixture>` there,
not imports.
