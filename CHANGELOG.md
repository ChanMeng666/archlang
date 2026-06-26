# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-06-26

### Fixed

- **Bundler builds in downstream consumers (webpack / Next.js).** The lazy
  `import()`s of the optional native/wasm dependencies (`@resvg/resvg-js`,
  `pdfkit`, `clipper2-wasm`) are now annotated with `/* webpackIgnore: true */`
  and `/* @vite-ignore */`, so a consumer's bundler no longer follows them into a
  native `.node` binary at build time (which failed with *"Module parse failed:
  Unexpected character"*). These dependencies are still loaded lazily at runtime
  under Node when the relevant export (`renderPng`/`toPdf`/angled-wall geometry)
  is used; nothing changes for the zero-dependency SVG/DXF path.

## [1.0.0] - 2026-06-26

### Added — Polish, ecosystem & launch (v1.0)

The 1.0 release rounds out the language and ships the public surface that makes
ArchLang adoptable: relational placement, a PNG backend, a visual-regression
safety net, a multi-format playground, a docs site, and a workspaces monorepo.
The core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (the absolute/manual coordinate path) is byte-identical**
to v0.11.

- **Relational placement (`right-of` / `left-of` / `below` / `above`).** A room
  can be positioned relative to another with an optional `align` (`top|middle|
  bottom` or `left|center|right`) and `gap`, instead of absolute `at (x,y)`.
  Positions resolve to absolute coordinates by **pure arithmetic in dependency
  order** (a topological pass in `src/layout.ts`) — deterministic sugar, not an
  optimizer. Reference cycles raise `E_LAYOUT_CYCLE`; unknown references raise
  `E_LAYOUT_REF`. The absolute path is unchanged and remains the default. The
  lexer learns `right-of`/`left-of` as compound keywords; the formatter, error
  catalog, and editor grammars are updated; new `examples/relational.arch`.
- **PNG export backend.** `renderPng(scene)` (exported) and `arch compile -f png`
  rasterize the Scene's SVG with the **optional, lazily-loaded** `@resvg/resvg-js`
  and a **bundled font** (system fonts disabled), so output is deterministic and
  byte-identical across machines. The dependency is absent from the default
  bundle (`optionalDependencies`, external to the build, font read lazily).
- **Visual-regression suite.** Golden PNGs are pixel-diffed with `pixelmatch`
  (strict threshold) so geometry changes are caught visually; refresh with
  `UPDATE_GOLDENS=1`. Skips when the optional raster dep is absent.
- **Playground multi-format download.** The Vite + CodeMirror playground now
  downloads **SVG, PNG, DXF, and PDF** (PNG/PDF via canvas + lazily-loaded jsPDF,
  bounded so large plans don't overflow the canvas limit).
- **Documentation site.** A VitePress site (`docs-site/`) with a guide, the
  language reference, the error catalog, a relational-placement page, an examples
  gallery, and the ADRs — all generated from the canonical repo sources so it
  cannot drift.
- **Workspaces monorepo.** The core stays the published root package; `editors/
  vscode`, `playground`, and `docs-site` are npm-workspace members sharing one
  root lockfile, so a single `npm install` bootstraps everything.
- **Architecture Decision Records** (`docs/adr/`): hand-written parser vs Lezer;
  optional-dependency geometry; expand-time scripting; relational placement is
  not an optimizer.
- **Benchmarks in CI.** `bench/run.ts --json` + `bench/compare.mjs` post an
  informational per-stage regression comment on PRs (never gates the build).

### Changed

- `CompileResult` is unchanged in shape (append-only); the PNG output is produced
  on demand from `scene`, not added as a field.
- `docs/language-reference.md` folded forward to v1.0 (relational placement, the
  four export formats); `AGENTS.md` and `README.md` refreshed to the current
  Scene-IR / registry / World architecture and the v1.0 surface.
- Repo-wide LF line endings enforced via `.gitattributes` (determinism hygiene).

## [0.11.0] - 2026-06-26

### Added — IDE-grade tooling & DX

The compiler grows a proper toolchain: a comment-preserving formatter, a full
language server, one grammar source of truth, and a documented error catalog.
The parser becomes lossless and never throws. All of this is tooling/internal —
the core stays pure, deterministic, and zero-runtime-dependency, and **every
existing rendered output (SVG/DXF/PDF) is byte-identical**.

- **Lossless, error-recovering parse tree.** The lexer captures comments as
  trivia (`LexResult.comments`); the AST gains an `ErrorNode` statement variant,
  `PlanNode.comments`, and a `bodyStart` offset. The parser never throws on user
  source: a malformed header recovers (so `CompileResult.ast` is present even on
  partial input), and a broken line emits an `Error` node + diagnostic and keeps
  the rest of the tree instead of dropping it (progress-aware `synchronize`; the
  expression parser refuses to swallow a new-line statement keyword). New
  read-only AST cursor (`src/cursor.ts`).
- **`arch fmt` formatter.** A ~150-line zero-dep Wadler/Prettier `Doc` IR
  (`src/doc.ts`) + `format(source)` (`src/format.ts`, exported): deterministic,
  idempotent, comment-preserving, and semantics-preserving (`compile(x) ===
  compile(format(x))`). Precedence-correct expressions, `WxH` vs `<expr> x
  <expr>` sizing, and long wall point-lists that wrap one-per-line. CLI: `arch
  fmt <in.arch> [--write]`. Returns source unchanged on parse error.
- **Full LSP.** Promoted from diagnostics-only to hover, completion,
  go-to-definition, scope-aware rename, and signature help — a pure, isomorphic,
  unit-tested core (`src/lsp.ts`, exported) driven by an append-only `params`
  schema on `ElementDef` (one source for the LSP and the docs). The VS Code
  server advertises and delegates to it.
- **One grammar source of truth.** `src/grammar/tokens.ts` is the single source
  for keyword categories, operators, and statement-start keywords; the parser
  derives its statement set from it, and `scripts/gen-grammars.ts`
  (`npm run gen:grammars`) generates the TextMate grammar and the playground
  StreamLanguage. A drift test + CI step keep them in sync.
- **Error-code catalog + richer diagnostics.** `src/error-catalog.ts` documents
  every `E_*`/`W_*` code (cause/fix/example); `arch explain <CODE>` prints an
  entry; `scripts/gen-error-codes.ts` (`npm run gen:errors`) generates
  `docs/error-codes.md` (drift-checked). `Diagnostic` gains `relatedSpans`, and a
  door/window off every wall now points at the nearest wall.

## [0.10.0] - 2026-06-26

### Added — extensible platform

ArchLang becomes a platform: third-party elements, a clean environment seam, an
import system for `.arch` libraries, a richer theming cascade, and config
sanitization with per-stage memoization. All additive and infrastructural — the
core stays pure, deterministic, and zero-runtime-dependency, and **every existing
rendered output is byte-identical**.

- **Open, per-call plugin registry.** `compile(src, { plugins })` merges
  third-party `ElementDef`s into a registry built fresh **per call** — no global
  mutation, so the compile cache stays correct. A new element type now compiles
  with zero core edits. `register{Element,Theme,Hatch,Backend}` validate/construct
  extensions; `createRegistry`/`BUILTIN_REGISTRY` are exported. Plugin, theme,
  backend, hatch, and World **identity is folded into the compile cache key** (via
  stable process-local id tokens), so distinct extension sets never bleed across
  compiles. `CompileOptions` gains `plugins`, `backend`, `hatches`, `themes`.
- **`World` seam.** New `World { read(path): string | null; now?(): Date }` is the
  compiler's single, injectable window onto its environment, keeping `compile()`
  pure/synchronous/isomorphic. `NULL_WORLD` (default) and `makeVirtualWorld(files)`
  ship for browser/test use; the CLI builds a real-fs World. `now` makes
  time-dependent output injectable (never a hidden `Date.now()`). An import-free
  plan compiles byte-identically with or without a World.
- **Import system.** `import "<spec>": a, b as c` (named items, `as`, `*`) brings a
  module's components into a plan. A new `link` phase — the compiler's only I/O,
  behind `World.read` — resolves specs (relative `.arch` paths and namespaced
  `@local/name:1.0.0`), parses each module, and merges components. Cyclic imports
  yield `E_IMPORT_CYCLE` (no hang); missing/unexported/conflicting/bad-spec each get
  a diagnostic. Seeded standard libraries under `examples/lib/` (`furniture.arch`,
  `doors.arch`) + an `examples/imports.arch` demo. Works in Node and the browser.
- **Theming cascade.** Built-in named themes (`THEMES`: `blueprint`, `mono`, `dark`,
  `presentation`) via `theme <name> { … }` (named base + overrides; one-liner
  `theme <name>` works too). Per-element `style <kind> { fill … }` overrides resolve
  element → theme → default. Opt-in `theme from "#color"` derives a finished poché
  from one wall colour (deterministic, zero-dep HSL). `registerTheme` adds named
  themes per call. Theme stays **out of the IR** (re-theming never re-resolves);
  cascade order is default → named base → `theme{}` → `theme from` → per-element
  `style` → `CompileOptions.theme` (always wins). Opt-in derivation keeps all golden
  snapshots byte-identical.
- **Config sanitization.** `sanitizeConfig()` denylist for **untrusted** `.arch`
  config: drops prototype-polluting keys (`__proto__`/`constructor`/`prototype`) and
  blanks string values carrying markup (`<`/`>`) or a `data:` URL. Applied to source
  theme/style values; trusted `CompileOptions` skip it. Theme/style key resolution
  hardened to own-property checks.
- **Per-stage memoization.** Content-hash/identity caches for `lex → tokens`,
  `parse → ast`, and `resolve → ir` (FNV-1a; registry/World identity in the keys),
  bounded and cleared by `clearCache()`. ~22× faster re-render on reparse (e.g.
  re-theming or resizing the same source). Stages are pure, so cached objects are
  shared transparently — determinism intact.

## [0.9.0] - 2026-06-26

### Added — professional CAD fidelity

Output that reads as a real drawing: line-weight hierarchy and line types, CAD
layers, openings that truly cut walls, clean angled joinery, data-driven hatches,
self-consistent dimensions, and sub-linear geometry. Everything stays pure and
deterministic; the core remains zero-runtime-dependency.

- **Style metadata on the Scene.** `SceneNode` gains optional `lineWeight`
  (`heavy|medium|thin|extraThin`), `lineType` (`continuous|dashed|center|hidden`),
  and `layerName`. SVG maps weight → `stroke-width` and type → `stroke-dasharray`;
  DXF emits an `LTYPE` table (before `LAYER`) with group codes `6`/`8`. Additive —
  nodes that set none render as before.
- **AIA CAD layers.** Element kinds map to standard layer names (`A-WALL`,
  `A-FLOR`, `A-DOOR`, `A-GLAZ`, `A-FURN`, `A-COLS`, `A-ANNO-TEXT`, `A-ANNO-DIMS`).
  SVG wraps each layer in an Inkscape `<g>`; DXF declares the layers with colours.
- **Openings void walls (IFC-style).** A hosted door/window registers an opening
  on its wall; the wall solid is the boolean difference of its offset segments and
  the opening rectangles, so an opening genuinely cuts the wall. Orthogonal case is
  fully zero-dependency.
- **Optional angled-wall geometry engine.** A new `GeometryBackend` seam unions
  angled (non-axis-aligned) walls into one seamless outline. The optional
  `clipper2-wasm` adapter (declared in `optionalDependencies`, lazily `import()`ed
  only for angled geometry) is registered by the CLI when present; otherwise angled
  walls fall back to per-segment rendering. The default build pulls no new
  dependency, and **orthogonal output is byte-identical with or without** the engine.
- **Data-driven hatches.** Wall poché is now a backend-neutral `hatch` Scene
  primitive. SVG emits a tiled `<pattern>` and DXF a real `HATCH` entity. Tune with
  `material <name> [scale <n>] [angle <deg>]`.
- **Computed dimensions.** A `dim` with no explicit `text` shows its measured
  length `|to−from|`, formatted via a shared formatter so SVG and DXF agree.
- **Spatial grid index.** Host lookup and room-overlap detection are backed by a
  uniform-grid index (~O(n) for distributed plans), provably byte-identical to the
  former O(n²) scans (fast-check equivalence tests).

### Changed

- **Rendered output intentionally changed** (per-layer `<g>` grouping, line
  weights/types, walls cut by openings, hatch fills). SVG goldens for the orthogonal
  examples remain byte-identical; the Scene-IR golden was updated deliberately.
- **DXF version bumped `AC1009` → `AC1015`** (AutoCAD 2000) so the new `HATCH`
  entity is supported; `LINE`/`ARC`/`TEXT` entities stay R12-style.

## [0.8.0] - 2026-06-25

### Added — a full (pure, expand-time) scripting language

The expression calculator (`Value === number`) is promoted to a small scripting
language. Everything stays **expand-time and deterministic**: loops,
conditionals, and function calls are evaluated while the drawing is built — no
runtime, no I/O, no clock — so the same source still produces byte-identical
output. Numbers remain unitless millimetres.

- **Generalized values.** `Value` is now `number | boolean | string | array |
  function` (`src/expr.ts`). Using a non-number where a number is required is a
  typed diagnostic (`E_TYPE`) with a safe default — never a throw.
- **Richer expressions.** Comparisons (`< > <= >= == !=`), logical operators
  (`&& ||`, short-circuiting), `!`, array literals `[a, b]`, half-open ranges
  `a..b`, indexing `arr[i]` (bounds-checked), function calls, and `if … else`
  **as an expression**.
- **Control flow** that expands into the element stream: `for x in <array|range>
  { … }`, `if <cond> { … } else { … }`, and bounded `while` (10k-iteration cap).
  `name = <expr>` reassigns an existing binding (so `while` loops can progress).
- **Value-functions / closures.** `let area(w, h) = w * h` defines a pure
  closure (recursion bounded; arity checked). Distinct from `component`, which
  emits elements.
- **Built-in functions** (a frozen, pure set): `min, max, abs, sqrt, floor,
  ceil, round, len, str`. Shadowable by a user `let`.
- **Scoped `set` rules.** `set door(swing: out)` overrides defaults for
  subsequent doors in scope; an explicit attribute still wins.
- **String interpolation.** `label "Studio {i}"` interpolates expressions into
  labels/dimension text; interpolated content is escaped at the serialization
  boundary (XSS-safe).
- **Lexical scope chain** with shadowing; `ResolveCtx` gains `evalStr`, and
  `ParseCtx` gains `parseStringExpr`.

### Changed
- `examples/parametric.arch` is rewritten to showcase the new language (a
  `for`-loop row, a value-function, an array, a scoped `set`, an `if`, and
  interpolated labels). Its golden snapshot updates accordingly.
- Existing non-scripting examples (`studio`, `two-bed`, `themed`) render
  **byte-identically** — the value generalization changes nothing for plans that
  use no new constructs.
- `docs/language-reference.md` documents values, operators, arrays/ranges,
  conditional expressions, interpolation, reassignment, functions, control flow,
  built-ins, and `set` rules.

## [0.7.0] - 2026-06-25

### Added
- **Backend-neutral Scene IR.** A new positioned-primitive drawing IR
  (`src/scene.ts`: `Scene`, `SceneNode`, `ScenePrim`, `Paint`) sits between
  `resolve` and the backends, so geometry is defined **exactly once** and every
  backend is a thin, pure serializer. Inspired by Typst's `Frame` and D2's
  `d2target`.
  - `toScene(ir, opts)` (`src/scene-build.ts`) lowers the resolved IR to a Scene
    (elements emit primitives; orthogonal walls union into clean multi-loop
    regions). Exported, plus the Scene types.
  - `compile().scene` exposes the Scene (append-only `CompileResult` field) so
    consumers can target alternate backends without re-resolving.
- **Vector PDF.** `toPdf(scene)` now emits **true vector** PDF via `pdfkit`
  (strokes are real paths, text is selectable) instead of rasterizing the SVG.

### Changed
- **SVG rendering is now a pure serializer** of the Scene (`src/backends/svg.ts`);
  `render(ir)` is a thin composition. Output is **byte-identical** to v0.6 (golden
  snapshots unchanged).
- **DXF backend (`toDxf`) is now a pure Scene serializer** and no longer
  re-derives door arcs / window panes / dimension geometry (the duplicated
  `emitDoor`/`emitWindow`/`emitDim` are deleted). DXF output is correspondingly
  richer (full dimension geometry + computed room areas).
- **API:** `toDxf` and `toPdf` now take a `Scene` (was the IR / an SVG string);
  build one with `toScene(ir)` or read `compile().scene`.

### Removed
- The `svg-to-pdfkit` optional dependency (the PDF backend no longer round-trips
  through SVG). `pdfkit` remains the only optional, lazy-loaded dependency; the
  default SVG/DXF path stays zero-dependency.

## [0.6.0] - 2026-06-25

### Added
- **Export backends.** `arch compile … --format svg|dxf|pdf` (default `svg`), plus
  programmatic `toDxf(ir)` / `toPdf(svg)`:
  - **DXF** — a pure, synchronous, **zero-dependency** ASCII DXF (R12) writer from
    the resolved IR (wall faces, room/furniture/column rectangles, door swing
    arcs, window glazing, dimension lines + labels; Y-flipped for CAD).
    Deterministic.
  - **PDF** — `pdfkit` + `svg-to-pdfkit` lazy-loaded under `optionalDependencies`,
    so the core never hard-requires them (clear error if absent).
- **Public IR access.** `resolve(ast)` and the IR types (`ResolvedPlan`,
  `ResolvedElement`, `RWall`, `RRoom`, `RDoor`, `RWindow`, `RFurniture`, `RDim`,
  `RColumn`) are now exported for consumers that want resolved geometry or custom
  backends.
- **Editor tooling** (in-repo, not shipped in the package; the published core
  stays zero-dependency):
  - A **TextMate grammar** (`editors/archlang.tmLanguage.json`) for `.arch`
    highlighting, TextMate-engine verified.
  - The **playground** rebuilt as a Vite + CodeMirror 6 app with syntax
    highlighting and live inline lint fed by `compile().diagnostics`.
  - A minimal **VS Code extension + LSP server** (`editors/vscode`) that
    publishes the compiler's diagnostics for open `.arch` documents.
- **Benchmark harness** (`npm run bench`): a deterministic ~1000-element plan with
  per-stage timings.
- **CI** (`.github/workflows/ci.yml`): `npm ci → typecheck → test` on Node 18 + 20.

### Changed
- **Performance**: each opening's `isOnWall` + `hostSegment` checks are fused into
  a single wall scan (`hostInfoForWalls`), roughly halving the dominant resolve
  cost. Output is byte-identical (golden snapshots + a fast-check equivalence
  property guard).

### Fixed / Security
- **SVG output XSS hardening.** Theme strings (colours/font) from the `theme { … }`
  directive or `CompileOptions.theme` are now escaped once at the render boundary
  (`sanitizeTheme`), closing an attribute-breakout vector introduced with v0.5
  theming. Output is byte-identical for well-formed themes; the XSS-safety
  guarantee (fixed element allowlist, escaped user text) is documented in
  `SECURITY.md` and covered by `test/security.test.ts`.

## [0.5.0] - 2026-06-25

### Added
- **Clean wall joins**: orthogonal walls are boolean-unioned into a single
  poché fill + mitred outline, so corners and T-junctions render with no
  internal seams (zero-dep, deterministic). Angled walls fall back to
  per-segment outlines.
- **Material hatches**: `wall <kind> thickness N material <name> { … }` with
  `poche` (default), `concrete`, `brick`, `insulation`, `tile`, `none`. Unknown
  materials warn and fall back to the default hatch.
- **Theming**: a `theme { … }` plan directive and `CompileOptions.theme` control
  colours, `lineWeight`, and `font`. Resolution: defaults < directive < options.
  Friendly directive aliases (`wall`, `room`, `wallFill`, …) map to theme fields.
- New diagnostics: `W_UNKNOWN_MATERIAL`, `W_UNKNOWN_THEME_KEY`.
- `examples/themed.arch` — a dark, brick-walled themed plan.

### Changed
- Walls are rendered centrally (unioned by material) rather than per element.
  Default-material, default-theme output is unchanged for non-wall-seam content;
  wall rendering is cleaner (golden snapshots updated + visually verified).
- The memoization cache key now includes `CompileOptions.theme`.

## [0.4.0] - 2026-06-25

### Added
- **Arithmetic expressions** anywhere a number appears (coordinates, sizes,
  widths, thickness, offsets): `+ - * / %`, unary minus, and parentheses with
  the usual precedence. Sizes accept `WxH` or `<expr> x <expr>`. Division by
  zero is a compile error.
- **`let` bindings**: `let NAME = <expr>`, evaluated top-to-bottom (no forward
  references); unknown names get a `did you mean …?` hint.
- **Components**: `component NAME(params) { … }` plus `NAME(args)` instantiation
  — reusable, parameterised sub-plans that compose. Component bodies see their
  params, own `let`s, and plan-level `let`s. Auto-ids stay unique across
  instantiations; infinite recursion is bounded and reported.
- New diagnostics: `E_UNKNOWN_REF`, `E_REDEF`, `E_DIV_ZERO`, `E_ARGCOUNT`,
  `E_UNKNOWN_COMPONENT`, `E_RECURSION`.
- `examples/parametric.arch` — a parametric studio row built from one component.

### Changed
- Lexer: added `+ - * / %` operator tokens; bare numbers are non-negative
  (negation is a unary operator). The `WxH` dimension literal still works.
- AST: element numeric fields are expressions evaluated during `resolve`; the
  plan body is a statement stream (`elements` + `let`s + component instances).
  SVG output is byte-identical for non-parametric plans (golden-snapshot
  verified for `studio.arch` and `two-bed.arch`).

## [0.3.0] - 2026-06-25

### Added
- **Element registry + AST→IR layering.** Each element type (wall, room, door,
  window, furniture, dim) is now a single self-contained module in
  `src/elements/` implementing a common `ElementDef`; parse/resolve/render
  iterate the registry instead of hard-coded switches. Adding an element type is
  one new module + one `register()` line.
- **`column`** element: `column [id=] at (x,y) size WxH` — a solid structural
  column, and the worked example of the new one-file extensibility.
- Pure `resolve(ast) → IR` (`src/ir.ts`): grid-snap, id assignment, opening
  hosting, and semantic checks now produce a new immutable IR — the input AST is
  no longer mutated. `render()` consumes the IR only (backend-ready).

### Changed
- `compile()` pipeline is now `parse → resolve → render`. `CompileResult.ast`
  is the raw parsed AST (unmutated); snapped/resolved geometry lives in the IR.
- AST: elements live in a single discriminated `PlanNode.elements` array (each
  node carries a `kind`); wall/furniture's category field renamed `kind` →
  `category`. SVG output is byte-identical to v0.2 (golden-snapshot verified).

## [0.2.0] - 2026-06-25

### Added
- **Resilient parsing + professional diagnostics.** The compiler now recovers from syntax
  errors and reports **all** problems in a single pass instead of throwing on the first one.
- `CompileResult.diagnostics: Diagnostic[]` — every problem with a byte-offset `span`, a
  stable `code` (e.g. `E_ROOM_SIZE`), and optional `hints`. `errors`/`warnings` are now
  derived projections of this list (back-compatible).
- New `diagnostics` module: `Diagnostic`/`Span`/`Severity` types, `offsetToLineCol()`, and
  `formatDiagnostic()` which renders a zero-dependency, caret-framed source snippet.
- Tokens now carry `start`/`end` byte offsets; the lexer collects every lexical error.
- AST element nodes carry an optional `span`.
- `arch` CLI prints framed diagnostics for every problem.
- Tests: error-recovery, span accuracy, `formatDiagnostic` snapshots, golden-SVG snapshots
  for the example plans, and `fast-check` fuzz properties (never throws, deterministic).

### Changed
- `validate()` now returns `Diagnostic[]` (was `{ errors, warnings }`).

## [0.1.0] - 2026-06-25

### Added
- Initial release of **ArchLang** — a declarative language that compiles `.arch` source to
  professional SVG floor plans.
- Compiler pipeline (lexer → parser → validate → geometry → render) in pure TypeScript with
  **zero runtime dependencies**; runs in Node and the browser.
- Public `compile(source, opts)` API returning `{ svg, errors, warnings, ast }` (errors are
  returned, never thrown), with source-keyed memoization.
- Language elements: `wall` (poché-hatched, thickness), `room` (label + computed area),
  `door` (opening + leaf + swing arc), `window` (glazing), `furniture`, `dim` (dimension
  lines), `title`; plan settings `units`, `grid` (snap), `scale`, `north`.
- Drawing features: north arrow, scale bar, title block, grid snapping, auto-assigned ids,
  XML-escaped labels.
- `arch` CLI (`compile`, `watch`) and a fully client-side web playground.
- Documentation: language reference, examples (`studio.arch`, `two-bed.arch`), and a test
  suite covering validity, determinism, grid-snap, escaping, and error/warning cases.
