# Architecture & conventions

## Pipeline

```
source (.arch)
  └─ src/lexer.ts        → Token[] (byte spans)
  └─ src/parser.ts       → PlanNode (src/ast.ts); recovers, never throws (recovery is guided by
                         the failed statement's indentation); memoised by content
  └─ src/import.ts       links `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts           resolve(): scripting, grid snap, auto-ids, host openings,
                         relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts  toScene() → Scene (src/scene.ts)
       └─ src/wall-lowering.ts  every wall in one joinery pass (geometry/band, intersect, joinery)
  └─ src/view/           toIso(): the axonometric, a sibling of toScene (DEPRECATED, ADR 0021)
  └─ src/backends/       svg (default) · png (optional resvg) · ascii · error-svg
  └─ src/export/         dxf · pdf (optional pdfkit)
  └─ src/pipeline.ts     compileUncached(): the one parse→link→resolve→render pipeline
  └─ src/index.ts        compile() wraps it with the memo cache; the only public surface
```

## Conventions

- **`compile()` is pure, synchronous and isomorphic** — no I/O, `Date.now()`, `Math.random()` or
  Node-only API. `src/cli.ts` + `src/cli/` are the only place for Node APIs and real time; everything
  else receives its environment through the `World` seam (`src/world.ts`).
- **Numbers print through `src/num-format.ts`** (`fmt2`/`fmt3`/`fmt4`); output is byte-pinned.
- **The memoised parse-stage `PlanNode` is shared** — anything downstream clones before mutating.
- **Errors are returned, never thrown**, for user-source problems: push a `Diagnostic` with a byte
  `span` and an `E_*`/`W_*` code catalogued in `src/error-catalog.ts`.
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered in
  `src/elements/defs.ts`; parse/resolve/render dispatch through the registry, never a switch.
- **Output formats are not a registry seam**: a new one is a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) plus a line in `serialize()` (`src/cli/serialize.ts`).
- **`CompileResult` is append-only** — add fields, never remove or rename.
- **Zero runtime dependencies.** Heavy/native deps are `optionalDependencies`, lazily `import()`ed
  with `/* webpackIgnore: true */ /* @vite-ignore */` so downstream bundlers don't resolve them.
- **Coordinates are millimetres**, origin top-left, +x right, +y down. Colours, weights and fonts
  live in `src/theme.ts`.
- **Opt-in output leaves the default byte-identical** (`annotate`, `accessible`, `--error-svg`,
  heights, `--view`); never emit annotation unconditionally.
- **Heights draw nothing** (`src/datum.ts`): `describe()` and Plan JSON report them only when the
  source authored one, gated by the single whole-plan flag `ResolvedPlan._heightsAuthored`.
  Elevation accumulates the storeys below. **The view measures nothing**: `describe()` never
  imports `src/view/`, and `src/view/` uses no `Math.cos/sin/tan/atan` (not exactly rounded across
  platforms). A view refuses (exit 3) rather than falling back to the plan.
- **`place` resolves an instance in its own frame**, then `frame.ts`'s `transformElement` carries it
  into plan coordinates; never pre-transform a resolver's input. A bare `wing()` call is the legacy
  macro and stays byte-identical.

## Module map (`src/`)

- `describe.ts` semantic summary · `lint.ts` + `lint/` soundness rules · `analyze.ts` +
  `analyze/` shared resolve + circulation/occupancy grids
- `geometry.ts` `doorSwing` (the leaf's sector) shared by `door.render()` and `W_SWING_OBSTRUCTED`;
  `sectorsObstruct` is the exact two-sector test (separating axes, no sampling)
- `geometry/` band, intersect, joinery (the wall outline); `union.ts`/`clipper.ts` are test oracles only;
  `arc.ts` decides an arc's radius check exactly, in `BigInt` on the 0.001 mm lattice, never on
  `hypot`
- `elements/fixtures-glyphs.ts` dispatch + the single-source `FIXTURE_FAMILIES`;
  `elements/glyph-lib.ts` shared drawing helpers (a helper moves here verbatim on its second
  caller); `elements/glyphs-*.ts` the art by domain; `fixtures-catalog.ts` the semantics
  (`requiresWall` = services only, `directional` = has a back to turn to a wall, `underlay` = lies
  flat, read only via `solidFurniture()`). Drawing language: `docs/adr/0023-plan-symbol-drawing-language.md`
- `elements/glyph-lib.ts` `glyphCtx`: tone follows weight (`tone`: `thin` → the derived `ink`,
  `symbolInk`; `extraThin` → `furnitureStroke`); the curve builders emit `path` loops of ≤ 120° arcs.
  `vertical-glyphs.ts` outlines in the same ink
- `elements/glyph-chirality.ts` a symbol's handedness, derived from its marks (`marksEqual`); read by
  `mirrorGlyph` and by `analyze/symmetry.ts` `handed()`
- `scene-build.ts` `renderOrder()` draws `underlay` fixtures before the other furniture;
  `RenderCtx.floorAt` (`registry.ts`) answers "inside the building?" from rooms and voids, the probe
  that puts a window's sill on the side with no floor
- hatch prim `origin`/`zoom` (`scene.ts`) re-frame one region's tile, honoured by SVG (and so PNG) only; set by
  the legend's ground swatches (`hatches.ts` `groundSwatchFrame`, `sheet-tables.ts`)
- `backends/ascii.ts` pass 2 carves an opening from its one unstroked cover polygon only
- `vocabulary.ts` room-label matching · `intent.ts` + `intent-concepts.ts` intent channel (shared
  with `eval/`)
- `expr.ts` holds the evaluation step meter (`MAX_EVAL_STEPS`): one step per node evaluated, per
  binding copied, per item compared, taken before the allocation it pays for; `ir.ts` stops the
  resolution at the crossing with one `E_STEP_LIMIT`
- `num-format.ts` also owns `MODEL_RANGE_MM` and `fmtSource` (prints a number so it re-parses to the same double);
  `ir.ts` `checkNumberDomain` (elements' `bounds()` + `measures()`) and `checkDrawnSizes` (hatch tile,
  pen) hold the resolved plan to the range once, after frames are carried; an element past it is
  reported once and dropped
- `draw-budget.ts` pre-render drawing estimate over every storey (`MAX_DRAW_UNITS`, each element's
  `drawCost` + its `bounds()` points + the plan-wide passes); run by `compile()` only, and only when
  no error is already present, so `describe()`/`lint()` never see it
- `sheet.ts` `drawingBounds` + `renderSizes` are shared by `scene-build.ts` and the resolver (so a
  size is checked on the drawing that is drawn); `scene-build.ts` `planTheme()` is the one theme
  cascade shared by the drawing and the pipeline's `lineWeight` check
- `site.ts` compass/facing (`windowFacingPage` probes the window's own wall) · `vertical.ts`
  stair/elevator/escalator semantics and the shaft graph · `datum.ts` heights
- `sheet.ts`, `axes.ts`, `sheet-tables.ts` paper, axis grid, margin tables
- `label-placement.ts` wraps a room name too wide for its room, then moves room labels off
  obstacles, after walls and dims · `text-metrics.ts` the single text-width estimate ·
  `text-layout.ts` the name line breaker and where each line of a text is drawn (every backend)
- `frame.ts` the `place` transform (signed-permutation matrix, no trig); each element carries
  itself across through `ElementDef.transform` (a `TransformCtx` facade), and a plugin kind
  without one is refused inside a `place` (`E_INSTANCE_NO_TRANSFORM`), never thrown
- `algebra/` domain-free leaf layer (value imports only from inside the folder,
  `test/algebra-leaf.test.ts`): `d4.ts` is the one encoding of the four directions — the
  group D4 in normal form `R^k·Fx^f` and its actions on sides, compass letters and
  quarter-turns; `semiring.ts` states BOOLEAN/MIN_PLUS/MAX_MIN/lexicographic path algebra;
  `paths.ts` is the one label-setting best-path engine over any of them
  (`docs/adr/0020-algebraic-core.md`)
- `statement-print.ts` the one printer for a leaf statement, shared by `format.ts`, an
  element's own `resolve()` fix text and Plan JSON's decompiler
- `analyze/symmetry.ts` a plan's D4 ⋉ Z² stabiliser and its repeats · `analyze/syntax.ts`
  space-syntax depths/RA/RRA/integration on the access graph — both opt-in `describe --facts`
- `analyze/circulation.ts` the walking model on a nav grid. A door's width lives only on the cells
  its carve opened; routes start, and rooms are reached, on the room's floor (the cells walkable
  before any carve). A storey with no front door is seeded at the arrival head of each arriving
  run; whether a landing exists is decided on the plan's geometry (`landingProbe`), not on cells.
  `vertical.ts` `arrivalRuns`: a run's neighbouring stop is an arrival side when it is reachable
  with that storey removed
- `while-deprecation.ts` the `W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED` advisory warnings ·
  `while-fix.ts` the proven `while`→`for` rewrite `arch fix` offers, kept out of `compile()`
  itself on purpose (see its header) · `reroll.ts` the proven re-roll of a run in arithmetic
  progression into a `for` loop (`arch reroll`, `reroll()`, the LSP's `refactorActions`)
- `plan-json.ts` Plan JSON · `diagnostic-json.ts` · `repair.ts` (geometric corrector) vs
  `fix-apply.ts` (`arch fix`; skips a fix carrying `file`) · `manifest.ts` the CLI contract
- `finish.ts` the sheet-completion transform (`arch finish`, `docs/adr/0024-finish-as-explicit-transform.md`):
  span inserts through `fix-apply.ts`'s `Data`, the fit decided by `sheet.ts` `fitsOnSheet` on
  `ir.ts` `sheetExtents`; stages are `FINISH_STAGES`, of which only `sheet` exists
- `pipeline.ts` the ONE `compileUncached()` (parse→link→resolve→render), extracted verbatim from
  `index.ts` so `compile()`'s memo-cache wrapper and `reroll.ts`'s twin-compile proof obligation
  call the same function and can never drift apart

- `scripts/engine-digests.ts` (`npm run digest:engines`) cross-engine determinism measurement;
  `eval/stats.ts` Wilson intervals, used by live reports only
- Test harness modules importable without vitest, so an older `src/` can be measured with the same
  body: `test/byte-identity-payload.ts` (the payload builders, also shipped into browsers by the
  engine script), `test/byte-identity-digest.ts` (hashes them), `test/recovery-metric.ts` (parser
  recovery survival), `test/shaft-equivariance-models.ts` (multi-storey buildings placed in a D4 frame)

## Layout

Core at the root; workspaces `editors/vscode`, `playground`, `docs-site`, `packages/*` share one
lockfile. `docs-site/sync-docs.mjs` copies `docs/*.md` + root artifacts into the site at build time.
`eval/` authorability harness, `dataset/` HF dataset generator, `scripts/` generators + smoke,
`bench/` timings.
