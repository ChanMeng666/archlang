# 2. Optional, lazy-loaded dependencies for heavy geometry and raster

- **Status:** Accepted
- **Date:** 2026-06 (v1.0)

## Context

Some capabilities genuinely need a heavy native/wasm dependency: robust polygon
boolean operations for seamless **angled** wall joinery (Clipper2), vector PDF
(pdfkit), and PNG rasterization (resvg). Bundling any of these into the core would
break the "zero runtime dependency" invariant and bloat every install — including
the common case of a browser app that only ever emits SVG.

## Decision

The core declares `dependencies: {}`. Every heavy capability is an
`optionalDependency`, reached only through a lazy `import()` at the point of use:

- `clipper2-wasm` — angled-wall geometry, behind the `GeometryBackend` seam. Absent
  ⇒ the zero-dep rectilinear boolean path is used (per-segment fallback).
- `pdfkit` — vector PDF export (`src/export/pdf.ts`).
- `@resvg/resvg-js` — PNG raster export (`src/backends/png.ts`), with a bundled font.

Each lazy import is wrapped so a missing dependency yields a clear, actionable
error rather than a crash. The default SVG path runs with nothing installed.

## Consequences

**Pros.** The core stays tiny and isomorphic; `compile()` to SVG has no native
dependencies and runs in the browser. Consumers opt into exactly the heavy bits
they need. Determinism is preserved: the optional engines take integer-mm input,
and the test suite asserts byte-identical output with the geometry engine both
present and absent.

**Cons.** Two code paths to maintain and test for geometry (with/without the
engine), and the optional deps must be version-pinned so their output stays
reproducible. The visual-regression goldens are tied to a specific resvg version
and are regenerated on a bump. The lazy `import()` also means these backends are
async, which is why they live outside the synchronous `compile()`.
