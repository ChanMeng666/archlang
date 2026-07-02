---
layout: home

# The hero is rendered by the custom BrandHero.vue (the dark "void" landing
# section, injected via the home-hero-before slot) — see .vitepress/theme/.
# We intentionally omit the default `hero:` block so only the branded one shows.

features:
  - title: Deterministic by design
    details: The same source always compiles to byte-identical output. No clocks, no randomness, no I/O — every loop, conditional, and function call is evaluated while the drawing is built.
  - title: Zero-dependency core
    details: The default SVG path pulls no runtime dependencies. Optional power (PNG raster, vector PDF, angled-wall geometry) loads lazily and is never required.
  - title: Professional CAD output
    details: Layers, line weights, line types, wall poché hatches, openings that void walls, real fixture symbols, dimensions, north arrow, scale bar, and a title block. Export to SVG, DXF, PDF, or PNG.
  - title: Parametric & scriptable
    details: Values, arithmetic, arrays, for/if/while, and pure functions — plus relational placement (right-of / below / …) resolved by deterministic topological arithmetic.
  - title: Reads its own plans
    details: "Beyond drawing, ArchLang reads a plan back as facts: describe returns rooms, areas, adjacencies, a modelled access graph, and human-circulation facts (walk distance, bottleneck width, detour); lint flags habitability and circulation problems against advisory profiles — image-free, so an AI agent can verify intent without an image."
---
