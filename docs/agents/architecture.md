# Architecture & conventions

## Pipeline

```
source (.arch)
  └─ src/lexer.ts        → Token[] (byte spans)
  └─ src/parser.ts       → PlanNode (src/ast.ts); recovers, never throws; memoised by content
  └─ src/import.ts       links `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts           resolve(): scripting, grid snap, auto-ids, host openings,
                         relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts  toScene() → Scene (src/scene.ts)
       └─ src/wall-lowering.ts  every wall in one joinery pass (geometry/band, intersect, joinery)
  └─ src/view/           toIso(): the axonometric, a sibling of toScene producing the same Scene
  └─ src/backends/       svg (default) · png (optional resvg) · ascii · error-svg
  └─ src/export/         dxf · pdf (optional pdfkit)
  └─ src/index.ts        compile() orchestrates; the only public surface
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
- `geometry.ts` door-swing quarter-disc shared by `door.render()` and `W_SWING_OBSTRUCTED`
- `geometry/` band, intersect, joinery (the wall outline); `union.ts`/`clipper.ts` are test oracles only
- `elements/fixtures-glyphs.ts` dispatch + the single-source `FIXTURE_FAMILIES`;
  `elements/glyph-lib.ts` shared drawing helpers (a helper moves here verbatim on its second
  caller); `elements/glyphs-*.ts` the art by domain; `fixtures-catalog.ts` the semantics
  (`requiresWall` = services only, `directional` = has a back to turn to a wall, `underlay` = lies
  flat, read only via `solidFurniture()`)
- `vocabulary.ts` room-label matching · `intent.ts` + `intent-concepts.ts` intent channel (shared
  with `eval/`)
- `site.ts` compass/facing (`windowFacingPage` probes the window's own wall) · `vertical.ts`
  stair/elevator/escalator semantics and the shaft graph · `datum.ts` heights
- `sheet.ts`, `axes.ts`, `sheet-tables.ts` paper, axis grid, margin tables
- `label-placement.ts` moves room labels off obstacles, after walls and dims · `text-metrics.ts`
  the single text-width estimate
- `frame.ts` the `place` transform (signed-permutation matrix, no trig)
- `plan-json.ts` Plan JSON · `diagnostic-json.ts` · `repair.ts` (geometric corrector) vs
  `fix-apply.ts` (`arch fix`; skips a fix carrying `file`) · `manifest.ts` the CLI contract

## Layout

Core at the root; workspaces `editors/vscode`, `playground`, `docs-site`, `packages/*` share one
lockfile. `docs-site/sync-docs.mjs` copies `docs/*.md` + root artifacts into the site at build time.
`eval/` authorability harness, `dataset/` HF dataset generator, `scripts/` generators + smoke,
`bench/` timings.
