# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
