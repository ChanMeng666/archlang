# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
