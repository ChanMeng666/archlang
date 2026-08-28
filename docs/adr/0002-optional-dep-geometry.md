# 2. Optional, lazy-loaded dependencies for heavy geometry and raster

- **Status:** Accepted — **Amended by [ADR 0018](0018-zero-dep-wall-joinery.md) (2026-08)**
- **Date:** 2026-06 (v1.0)

> **Amendment (v1.30).** The `clipper2-wasm` bullet below no longer holds. Wall geometry —
> orthogonal, angled and curved alike — is now joined by one closed-form, zero-dependency
> pass, so there is no `GeometryBackend` in the rendering path and no per-segment fallback
> to fall back *to*. `clipper2-wasm` moved to `devDependencies`, where it is the angled
> oracle for the property suite. **The decision itself stands for `pdfkit` and
> `@resvg/resvg-js`**, which are still optional, still lazily imported, and still the
> reason the default SVG path installs nothing. See ADR 0018.

## Context

Some capabilities genuinely need a heavy native/wasm dependency: robust polygon
boolean operations for seamless **angled** wall joinery (Clipper2), vector PDF
(pdfkit), and PNG rasterization (resvg). Bundling any of these into the core would
break the "zero runtime dependency" invariant and bloat every install — including
the common case of a browser app that only ever emits SVG.

## Decision

The core declares `dependencies: {}`. Every heavy capability is an
`optionalDependency`, reached only through a lazy `import()` at the point of use:

- ~~`clipper2-wasm` — angled-wall geometry, behind the `GeometryBackend` seam. Absent
  ⇒ the zero-dep rectilinear boolean path is used (per-segment fallback).~~ **Struck by
  ADR 0018**: nothing in the renderer consults it, and it is no longer an optional
  dependency.
- `pdfkit` — vector PDF export (`src/export/pdf.ts`).
- `@resvg/resvg-js` — PNG raster export (`src/backends/png.ts`), with a bundled font.

Each lazy import is wrapped so a missing dependency yields a clear, actionable
error rather than a crash. The default SVG path runs with nothing installed.

## Consequences

**Pros.** The core stays tiny and isomorphic; `compile()` to SVG has no native
dependencies and runs in the browser. Consumers opt into exactly the heavy bits
they need. Determinism is preserved: the optional engines take integer-mm input,
and the test suite asserts byte-identical output with the geometry engine both
present and absent — which since ADR 0018 is true for the trivial reason that nothing
reads it.

**Cons.** ~~Two code paths to maintain and test for geometry (with/without the
engine)~~ — this was the real cost, and ADR 0018 removed it by removing the second path;
what is left is that the optional deps must be version-pinned so their output stays
reproducible. The visual-regression goldens are tied to a specific resvg version
and are regenerated on a bump. The lazy `import()` also means these backends are
async, which is why they live outside the synchronous `compile()`.
