---
layout: home

hero:
  name: ArchLang
  text: Code → floor plans
  tagline: A small declarative language that compiles to professional SVG floor plans — like Typst/LaTeX, but for architecture. Zero-dependency, deterministic, isomorphic.
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: Language reference
      link: /reference
    - theme: alt
      text: Examples
      link: /examples

features:
  - title: Deterministic by design
    details: The same source always compiles to byte-identical output. No clocks, no randomness, no I/O — every loop, conditional, and function call is evaluated while the drawing is built.
  - title: Zero-dependency core
    details: The default SVG path pulls no runtime dependencies. Optional power (PNG raster, vector PDF, angled-wall geometry) loads lazily and is never required.
  - title: Professional CAD output
    details: Layers, line weights, line types, wall poché hatches, openings that void walls, dimensions, north arrow, scale bar, and a title block. Export to SVG, DXF, PDF, or PNG.
  - title: Parametric & scriptable
    details: Values, arithmetic, arrays, for/if/while, and pure functions — plus relational placement (right-of / below / …) resolved by deterministic topological arithmetic.
---
