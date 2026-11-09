# Architecture & conventions

## Pipeline

```
source (.arch)
  └─ src/lexer.ts        → Token[] (byte spans)
  └─ src/parser.ts       → PlanNode (src/ast.ts); recovers, never throws (recovery is guided by
                         the failed statement's indentation); memoised by content
  └─ src/import.ts       links `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts           resolve(): scripting, grid snap, auto-ids, then per group: rooms +
                         relational placement (src/layout.ts), the frozen datum table
                         (src/room-datums.ts; read by `hall.top`-style datums through the
                         evaluator's reader, `withDatumReader`), walls, host openings → ResolvedPlan
                         (`walls from rooms` derives a group's walls from its rooms,
                         src/room-tiling.ts, ADR 0028); ir.ts keeps the entry points and
                         `resolveBody`, its stages live in src/ir/ (types, expand,
                         side-tables, groups, checks, sheet), re-exported by ir.ts
  └─ src/scene-build.ts  toScene() → Scene (src/scene.ts)
       └─ src/wall-lowering.ts  every wall in one joinery pass (geometry/band, intersect, joinery)
  └─ src/view/           toIso(): the axonometric, a sibling of toScene (DEPRECATED, ADR 0021)
  └─ src/backends/       svg (default) · png (optional resvg) · ascii · error-svg
  └─ src/export/         dxf · pdf (optional pdfkit)
  └─ src/pipeline.ts     compileUncached(): the one parse→link→resolve→render pipeline
  └─ src/index.ts        compile() wraps it with the memo cache; the public surface (plus the
                         Node-only `/link` subpath, src/cli/link.ts: share links, zlib)
```

## Conventions

- **`compile()` is pure, synchronous and isomorphic** — no I/O, `Date.now()`, `Math.random()` or
  Node-only API. `src/cli.ts` + `src/cli/` are the only place for Node APIs and real time; everything
  else receives its environment through the `World` seam (`src/world.ts`).
- **Numbers print through `src/num-format.ts`** (`fmt2`/`fmt3`/`fmt4`); output is byte-pinned.
- **The memoised parse-stage `PlanNode` is shared** — anything downstream clones before mutating.
- **Errors are returned, never thrown**, for user-source problems: push a `Diagnostic` with a byte
  `span` and an `E_*`/`W_*` code catalogued in its family file, `src/error-catalog/<family>.ts`
  (`src/error-catalog.ts` merges them); a new site writes `diag(code, …)` (`src/diagnostics.ts`).
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered in
  `src/elements/defs.ts`; parse/resolve/render dispatch through the registry, never a switch.
  The per-kind code outside it is exhaustive (`tsc` fails on a kind it does not name) and the kind
  sets come from `KIND_FACETS` (`src/elements/facets.ts`); the checklist is `docs/agents/new-element.md`.
- **Output formats are not a registry seam**: a new one is a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) plus a `case` in `serialize()` (`src/cli/serialize.ts`), which `tsc` demands.
- **`CompileResult` is append-only** — add fields, never remove or rename.
- **Zero runtime dependencies.** Heavy/native deps are `optionalDependencies`, lazily `import()`ed
  with `/* webpackIgnore: true */ /* @vite-ignore */` so downstream bundlers don't resolve them.
- **Coordinates are millimetres**, origin top-left, +x right, +y down. Colours, weights and fonts
  live in `src/theme.ts`. Only the `rendered` theme fills symbols, each in a tint of its family's
  material (`materialTints` over `FIXTURE_FAMILY_MATERIALS`, ADR 0023 as amended); every other
  theme draws outlines only, and its bytes never move with the tints.
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
- `analyze/rooms.ts` room box/ring/area, point-in-room and room-use leaves · `analyze/connectors.ts` which rooms a door or opening joins and which room a window serves; both import no `ir.ts` value (`test/no-value-cycles.test.ts`), re-exported from `analyze.ts`
- `lint/context.ts` the shared per-run `LintContext` and `LintRule` (`family`, `layer`: `validity` or
  `drafting`, and every `codes` it may emit); `lint/rules/index.ts` the ordered rule list (order is
  contract); `lint/coverage.ts` which families ran or were skipped and why (`ctx.skip`), beside the
  diagnostics and never inside them
- `lint/rules/stairs.ts` stair safety: a swing over a flight, a missing landing, a side entry, a
  void where a flight arrives, a flight too steep for its storey (read through `doorLeaves`)
- `elements/stair.ts` a straight flight or a block of flights and landings: `piecesOf`, `flightsOf` and
  `isBlockStair` are the one path for readers; `vertical.ts` `boardedFlight` and `arrivalOn` say where a stop
  is boarded and stepped off, and `describe` gives `steps_off` when those are two rooms; `sameBlock` is the
  shaft rule's test. Only the id joins two stops, never geometry
- `elements/void.ts` `voidPieces` is the path for a reader of a floor hole written on rectangles: a
  `polygon` void is its ring's grid cells (`parts`, a set a frame carries onto itself), a rectangle
  void itself; a reader that takes a ring reads `poly` (`roomBox` does); never read `at`/`size` as the hole
- `geometry/polygon.ts` the ring tests, charged in `RING_READS_PER_STEP`; `polygonsOverlapCost` is the same
  count for a pass outside the meter (`lint/rules/outdoor.ts`)
- `lint/rules/clearances.ts` WC side clearance and a tall unit in front of a window;
  `lint/rules/footprint.ts` `W_FOOTPRINT_TRANSPOSED`; `lint/clearance-measure.ts` the shape measures
  both read, shared with the placement check `lint/fixture-paste.ts` quotes positions through
- `room-tiling.ts` the exact derivation behind `walls from rooms` (rectangular and rectilinear rooms
  in, rings and partitions out, or a refusal; `ringParts` cuts a polygon into rectangles of one owner, `extremeRuns` is what
  a side of one means, and `runPicks` and `pickAt` say which shared run a position selects); `wall-relation.ts` the pairwise forms `wall … between|around`, on the
  same sweep; `opening-junctions.ts` where other walls meet a host wall, shared by
  `W_OPENING_AT_JUNCTION` and `E_OPENING_NIB`
- `impact.ts` `impact(before, after)`: what changed, what stayed and what broke between two sources,
  over one pipeline; `analyze/depends.ts` `describe --facts depends`, what each element derives from;
  `analyze/contacts.ts` which room edge a fixed-coordinate wall or piece lies on (lattice-exact,
  never a bbox), so `impact` can report it `held` while that edge moved
- `keep.ts` `keep` invariants (ADR 0033): expanded on the step meter, measured once after the storey
  resolves, results in a side table beside the resolved plan; reads, never writes or solves
- `stages.ts` the authoring ladder (brief → rooms → walls → openings → fixtures → drafting): each
  code's stage (`LintRule.stage`, `codeStage`), read by `validate --stage`
- `analyze/dwelling.ts` whether the plan reads as a dwelling, the gate of the home-only lint arms
- `taste/` the taste score (ADR 0032): reads `describe()`, `lintWithCoverage()` and the IR, never
  read by them; integer permyriads; the validity cap reads each rule's `layer`
  (`taste/index.ts` the entry, `criteria.ts` the judges and their counted costs, `profiles.ts` the
  sourced numbers per profile, `advice.ts` the `A_*` rows, `report.ts` the report shape, `arith.ts` the
  exact `BigInt` arithmetic)
- `geometry.ts` `doorLeaves` (each leaf's sector, a `double` door's two; `doorSwing` is the hinged
  leaf and returns null for a `double`) shared by `door.render()` and every swing measure;
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
- `naming.ts` how a message names an unlabelled room (use, place, size) and where a point stands on a
  storey: shared by `lint/context.ts` (`nameOf`), `taste/criteria.ts` and the resolver's `W_ROOM_OVERLAP`;
  `lint/element-phrases.ts` names a wall or an opening in a lint message. No message quotes an id
- `vocabulary.ts` room-label matching · `intent.ts` + `intent-concepts.ts` intent channel (shared
  with `eval/`)
- `expr.ts` holds the evaluation step meter (`MAX_EVAL_STEPS`): one step per node evaluated, per
  binding copied, per item compared, taken before the allocation it pays for; `ir.ts` stops the
  resolution at the crossing with one `E_STEP_LIMIT`
- `num-format.ts` also owns `MODEL_RANGE_MM` and `fmtSource` (prints a number so it re-parses to the same double);
  `ir/checks.ts` `checkNumberDomain` (elements' `bounds()` + `measures()`) and `checkDrawnSizes` (hatch tile,
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
- `sheet.ts`, `axes.ts`, `sheet-tables.ts` paper, axis grid, margin tables;
  `opening-schedule.ts` the `schedule openings` tags (placed off the host wall's faces) and rows
- `sheet-text.ts` `sheet text { … }`: the fixed words of a sheet by key (`SHEET_WORDS`), the plan's replacements and
  its decimal mark (`num-format.ts` `drawnDecimal`), read by `toScene` alone; `PLAIN_SHEET_TEXT` is a plan with none
- `label-placement.ts` wraps a room name too wide for its room, then moves room labels off
  obstacles, after walls and dims · `label-fit.ts` then shrinks what still does not fit, by the
  test `W_ANNOTATION_OVERLAP` reads · `text-metrics.ts` the shared `textWidth` estimate and
  `inkWidth`, the bundled face's advances · `text-layout.ts` the name line breaker and where each
  line of a text is drawn (every backend)
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
- `analyze/net-area-memo.ts` memoises each storey's wall bands and each room's exact net internal
  area, keyed on their exact inputs (ADR 0027's figures, output byte-identical); `clearCache()`
  empties it
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
- `cli/summary.ts` the one-line count-and-codes summary `lint`/`validate` open with (CLI only, so
  no corpus digest moves) · `cli/review.ts` `arch preview --review`, the review sheet: consumes
  `compile()`/`describe()`/`lint()`, feeds none of them
- `plan-json.ts` Plan JSON, re-exporting `plan-json/` (room types, wire types, `to-json`, the
  `from-json` validator, `.arch` `emit`, `ast-json`, `check-graph`, `schema`) · `diagnostic-json.ts` · `repair.ts` (geometric corrector) vs
  `fix-apply.ts` (`arch fix`; skips a fix carrying `file`) · `manifest.ts` the CLI contract
- `input-limit.ts` `inputTooLarge()` / `rateLimited()`: a HOST's refusals (`E_INPUT_TOO_LARGE`,
  `E_RATE_LIMITED`), which `compile()` never calls · `cli/share-codec.mjs` (Node) and `cli/share-codec.web.mjs`
  (`DecompressionStream`) the two `#z=` decoders, held together by `test/share-codec-web.test.ts`
- `import/` foreign plans as `.arch` source (`archlang import --from openplan3d`, pure):
  `openplan3d.ts` the entry, `-model`/`-rooms`/`-catalog` its stages, `limits.ts` the storey cap;
  what is not carried over goes to `dropped` or a `W_IMPORT_DROPPED`, never silently
- `cli/source-hash.ts` the write-back revision guard (`--expected-hash`, `E_STALE_SOURCE`, exit 4)
- `packages/mcp/src/tools.ts` the MCP tool set, transport-agnostic; `server.ts` (stdio, npm) and
  `packages/mcp-worker` (the hosted Worker, ADR 0026) both register it
- `finish.ts` the completion transform (`arch finish`): runs the stages in `FINISH_STAGE_ORDER`
  until a round changes nothing, and holds the `sheet` stage (`docs/adr/0024-finish-as-explicit-transform.md`):
  span inserts through `fix-apply.ts`'s `Data`, the fit decided by `sheet.ts` `fitsOnSheet` on
  `ir/sheet.ts` `sheetExtents`
- `furnish.ts` the `furnish` stage (`docs/adr/0025-furnish-as-explicit-transform.md`): `FURNISH_TABLE`
  by `roomUses()`, relative placement only, one compile check per room in the common case, one run
  of statements per storey, each in its own `level` block; it imports nothing from
  `intent-concepts.ts` or `eval/`
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
`playground/worker/` is the playground's Worker (ADR 0034, amends ADR 0019): it runs only for
`/s/*` and `/api/*` (`run_worker_first`) and serves short links (`POST /api/share` stores a `#z=`
payload in KV under a content address; `/s/<id>` redirects to `/#z=`) and their 1200×630 PNG card
(`preview.ts`, resvg-wasm); `share-core.ts` is its pure, unit-tested half. Bindings, rate limits and
the Analytics Engine dataset are in `playground/wrangler.jsonc`.
`eval/` authorability harness, `dataset/` HF dataset generator, `scripts/` generators + smoke,
`bench/` timings.

`site-shared/doors.json` holds every way in (ChatGPT app, claude.ai connector, agent prompt and
commands, VS Code, playground) with a per-surface order; `scripts/gen-doors.ts` (`gen:doors`, in
`check:drift`) writes its marked "Try it" blocks into `README.md`, `packages/mcp/README.md`,
`editors/vscode/README.md` and `llms.txt`, and both sites import it.

The playground (`playground/src`) has two paths. The view path loads at startup: `main.ts` +
`shell.ts` (header, the Share and More menus, Plan | 3D switch, hash flags via `share.ts`), the stage, `gallery.ts`
(the header's plan gallery, its cards also written into the served HTML by `scripts/gen-static.mjs`
with the default drawing), `room-facts.ts`/`room-card.ts` (hover and card), `knobs.ts`/`knobs-panel.ts` (sliders over
top-level numeric `let`s). A plain visit compiles nothing at boot: the default plan's drawing,
facts line and `#planData` are in the served HTML (`scripts/gen-static.mjs`). Lazy chunks:
`compiler.ts` (the core; on first use, or imported when idle, never under Save-Data or 2g),
`compile-worker.ts` (every render's compile, describe and lint in a module Web Worker, with the page
as fallback; `docs/plans/playground-mobile-perf/`), `edit-mode.ts`
(CodeMirror and the editor panels), `make-own.ts` (the doors sheet), `checks-panel.ts` +
`checks-overlay.ts` (review rings from the core CLI's `reviewSheetAndWarnings`, built as
`dist/cli/review.js`), `preview3d.ts` + `plan3d.ts` (the 3D view) and `glb-export.ts` (Download GLB,
byte-identical to `archlang3d build`). `samples.ts` holds playground-only plans (examples stay
warning-free).

The docs site home is `CompileSeam.vue` (brief → source → plan hero), `SameSource.vue` (plan beside
its 3D replay), `WhyCards.vue`, `HowSteps.vue`, `DoorsCard.vue`, `HomeGallery.vue`,
`IsIsntTable.vue`; `/start` and `/3d` are pages. `docs-site/three-d.mjs` reads the 3D wording from
`packages/archlang-3d/src/replay/payload.ts` and the plans from `docs-site/public/3d/manifest.json`;
`sync-docs.mjs` builds the proof figures (`HOME_PROOFS`) from pinned examples, never the agent
gallery.

`packages/archlang-3d` (separate package, ADRs 0030/0031) reads a resolved plan through the core's public
seam: `src/adapter` + `src/scene3d` (plan → Scene3D, plan-aligned, integer µm; `src/walls` the
wall ownership, H1) → `src/mesh` (Mesh3D: closed shells,
canonical order; every catalogued furniture family is a T0 generator in `t0*.ts`, each part in a
material slot from `src/materials.ts`, the one palette the GLB and the viewer share) → `src/replay` (`timeline.ts` pure in `t`; `camera.ts` the fitted framing;
`mount.ts` the renderer, shared by the single-file HTML and the playground's lazy "3D preview" tab
through `./browser`, with a free orbit camera (`camera.ts` `presetCamera`; `view-dom.ts` the preset,
Reset and storey buttons); `video.ts` Playwright + ffmpeg) and `src/glb` + `src/check` (the GLB and its
checks). `src/cli` is `archlang3d view|build|check|manifest|schema|doctor`. Laws:
`.claude/rules/archlang-3d.md`.

## Seams between workspaces and the core

The root `exports` map has only `.` and `./link`, yet workspaces reach past it. Each reach by relative
path, alias, `paths`/`include` entry or built file path into a `src/` or `dist/` of the core or another
workspace is a row in `ALLOW` (`test/workspace-seams.allow.ts`, the source of truth: a new one fails, a
stale row fails, test code is not scanned). This table is generated from it
(`npx tsx test/workspace-seams.allow.ts`) and pinned row for row. `test/core-no-3d.test.ts` pins the
other direction: `src/` never imports `archlang-3d` or `three`.

| File | Specifier | Why |
| --- | --- | --- |
| `playground/src/glb-export.ts` | `../../packages/archlang-3d/src/glb/write.js` | writeGlb is exported only from archlang-3d's Node entry, but the writer is browser-agnostic; read from source |
| `playground/tsconfig.json` | `paths archlang` | mirrors the Vite alias: a root node_modules/archlang symlink points at the vscode extension |
| `playground/tsconfig.json` | `paths archlang/review` | types for the review sheet come from src/: the build emits no declaration for dist/cli/review.js |
| `playground/tsconfig.json` | `paths @chanmeng666/archlang-3d` | mirrors the Vite alias: archlang-3d is read from source, its published exports name a dist/ that may not be built |
| `playground/tsconfig.json` | `paths @chanmeng666/archlang-3d/browser` | the browser entry is a second exports subpath of archlang-3d whose dist/ may not be built; without this mapping tsc cannot resolve what the Vite alias serves |
| `playground/vite.config.js` | `alias archlang` | the playground consumes the built core (dist/index.js), keeping one import path |
| `playground/vite.config.js` | `alias archlang/review` | Checks overlay reads the review sheet, a CLI file with no export; listed before the bare name (prefix match) |
| `playground/vite.config.js` | `alias @chanmeng666/archlang` | archlang-3d imports the core by its published name; same built file so the lazy chunk shares the core |
| `playground/vite.config.js` | `alias @chanmeng666/archlang-3d` | archlang-3d is read from source: its published exports name a dist/ the build has no reason to need |
| `playground/vite.config.js` | `alias @chanmeng666/archlang-3d/browser` | the browser entry of archlang-3d, from source; longer key first |
| `playground/wrangler.jsonc` | `alias archlang` | the short-link Worker bundles the built core by name |
| `docs-site/.vitepress/config.ts` | `alias archlang` | examples compile client-side against the built core, the same alias the playground uses |
| `docs-site/tsconfig.json` | `paths archlang` | mirrors the VitePress alias to the built core |
| `packages/archlang-3d/vitest.e2e.config.ts` | `alias @chanmeng666/archlang` | heavy e2e tests run against the core's source, as the root vitest config does |
| `packages/mcp-worker/scripts/build.mjs` | `alias @chanmeng666/archlang` | the Worker bundles THIS checkout's built core, so a stale installed core cannot ship |
| `packages/mcp-worker/scripts/build.mjs` | `alias @chanmeng666/archlang/link` | the Worker imports the Node-free link helper by its exports name; the alias pins it to this checkout's dist/cli/link.js, so an installed core cannot supply a different encoder than the one the render version hashes |
| `packages/mcp-worker/scripts/measure-cpu.mjs` | `../../../src/cli/share-codec.mjs` | CPU measurement script encodes a plan hash; the shared-link codec is a core CLI file with no package export |
| `packages/mcp-worker/src/app.ts` | `../../../src/cli/share-codec.web.mjs` | the Worker decodes #z= payloads with the Web-stream codec; the shared-link codec is a core CLI file with no package export |
| `packages/mcp-worker/src/env.d.ts` | `../../mcp/src/tools.js` | types the virtual:archlang-resources module by the stdio server's ResourceName |
| `packages/mcp-worker/src/server.ts` | `../../mcp/src/tools.js` | the hosted server serves the stdio server's tool set, so it registers the same tools from source (mcp is not published as a library) |
| `packages/mcp-worker/tsconfig.json` | `paths @chanmeng666/archlang` | types come from the same built core that scripts/build.mjs bundles |
| `packages/mcp-worker/tsconfig.json` | `paths @chanmeng666/archlang/link` | tsc must type the Worker's /link import from the same build the bundler inlines (scripts/build.mjs), not an installed copy that could differ |
| `packages/web-component/tsconfig.json` | `paths @chanmeng666/archlang` | the core is a peer dependency; in the monorepo it is the root's source, typechecking without a build |
| `packages/web-component/scripts/build.ts` | `path dist/index.js` | the standalone build inlines the repo's built core, and refuses to build when it is missing or stale |
| `packages/web-component/scripts/build.ts` | `path src` | freshness check: dist/ must be newer than every core source file, or the standalone would inline a stale compiler |
| `docs-site/sync-docs.mjs` | `path dist/index.js` | the example pages are compiled at build time with the built core (what npm publishes), imported by file URL |
| `docs-site/three-d.mjs` | `path packages/archlang-3d/src/replay/payload.ts` | reads the 3D preview's lines out of the package's source, so the site copy cannot drift from the package's PREVIEW_* constants |
| `docs-site/three-d.mjs` | `path playground/src/share.ts` | reads the playground's own VIEW3D_FLAG constant, so the docs links open the 3D tab with the flag the playground parses |
| `playground/scripts/gen-static.mjs` | `path dist/index.js` | the served default drawing and facts line are compiled with the built core, the same file the page loads |
| `playground/tsconfig.json` | `include ../packages/archlang-3d/src/types/gltf-validator.d.ts` | archlang-3d ships no declaration for glTF-Validator; a playground test runs its CLI build, whose checks import it |
| `playground/vite.config.js` | `path dist` | the config reads the built core's files to split them into the compiler chunk (scripts/core-files.mjs) |
| `packages/mcp-worker/scripts/build.mjs` | `path dist` | hashes the built core's library files into the render version, so a core change without a version bump still re-keys the edge cache |
| `packages/mcp-worker/scripts/build.mjs` | `path dist/index.js` | the Worker bundle's core entry, handed to the build as the alias target for @chanmeng666/archlang |
| `packages/mcp-worker/scripts/build.mjs` | `path dist/cli/link.js` | the Worker bundle's link entry, the alias target for @chanmeng666/archlang/link |
| `packages/mcp-worker/scripts/build.mjs` | `path packages/mcp/src/server.ts` | parses the stdio server's readResource(...) calls to bundle the same resource texts into the Worker |
| `vitest.config.ts` | `alias archlang` | every workspace's source resolves the core through this under vitest, to src/index.ts, so tests need no build and never see a stale dist/ |
| `vitest.config.ts` | `alias @chanmeng666/archlang` | the MCP shim and archlang-3d import the core by its published name; this runs their tests against src/ |
| `vitest.config.ts` | `alias @chanmeng666/archlang/link` | the Node-only subpath, listed before the bare name since an alias also matches name/...; to src/cli/link.ts |
| `vitest.config.ts` | `alias @chanmeng666/archlang-3d` | playground modules that playground tests read import archlang-3d by name; its source entry, as the Vite alias does |
