# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
