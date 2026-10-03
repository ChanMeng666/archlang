# 23. The plan-symbol drawing language

- **Status:** Accepted
- **Date:** 2026-10
- **Scope:** how every fixture symbol, door, window, fence, balcony rail and vertical-circulation
  glyph is drawn: pens, tones, curves, dashes and what a redraw may move. No language syntax
  change, no new theme key.

## Context

The symbols drew correct facts badly. Every mark on a symbol was one tone (`furnitureStroke`,
a pale grey chosen to sit behind the walls), and the finer of its two pens fell below what
prints (about 0.1 mm on paper), so a WC's outline and its flush button, a sofa's frame and its
cushion joints, read alike and the symbols read washed out next to the walls. Round things — a WC bowl, a basin, a tub — were tessellated
polygons that faceted when zoomed. A door's open leaf was a single line, its swing was dashed
like a hidden edge, and a window had no exterior sill to say which side was outside.

A redraw could not be a free hand. The glyph layer feeds more than the picture: the renderer
mirrors a symbol only if it is handed (`src/elements/glyph-chirality.ts`), `describe --facts
symmetry` reports a symbol's hand through the same probe (`handed()`,
`src/analyze/symmetry.ts`), the drawing budget counts what each glyph draws
(`ElementDef.drawCost`), and the permanent pins of `test/fixture-byte-identity.test.ts`
(group 1) hold the shared path byte for byte.

## Decision

**1. A hierarchy of five, from the pens and tones that already exist.** Wall (`heavy`) >
door leaf and glazing > a symbol's OUTLINE (`thin`, in the derived symbol ink) > its DETAIL
(`extraThin`, in `furnitureStroke`) > ground texture. Tone follows weight inside the glyph
layer: `GlyphCtx.tone` maps `thin` to the ink and `extraThin` to `furnitureStroke`, and every
factory in `src/elements/glyph-lib.ts` reads its colour from there, so the two cannot disagree
inside one symbol. The outline is the first node a glyph emits, which makes it the node
`annotate` marks `data-arch-primary`.

**2. The finest pen is the ISO 128 floor.** `extraThin` is `EXTRA_THIN_RATIO` (13/18) of
`thin`, so on a sheet it lands on 0.13 mm, the thinnest pen that reproduces in print
(`src/scene.ts`).

**3. True curves.** A round outline is a `path` of straight edges and minor arcs, each at most
120° (`roundedRectPath`, `ovalPath` — the four-centre oval — and `bulgeArc`), which every
backend lowers natively (SVG `A`, a PDF arc, a DXF `ARC`). The tessellated helpers stay in
`glyph-lib.ts`, and no glyph draws with them.

**4. A dash means hidden or above the cut plane, never decoration.** An upper cabinet, a range
hood, a wardrobe rail behind a closed door, a garage door's overhead projection and a pocket
door's cavity are dashed; a hinged door's swing, at floor level, is a solid `extraThin` arc.
The open leaf is a slab built from `doorSwing`'s own points (`src/elements/door.ts`), so it
cannot disagree with `W_SWING_OBSTRUCTED`. A window is double glazing plus an exterior sill on
the side the floor probe (`RenderCtx.floorAt`) finds no floor.

**5. No shadows.** A drop shadow is ink outside the footprint (every glyph suite holds the
symbol inside it), it has a direction, so it breaks the D4 equivariance of a placed instance
and makes every symmetric symbol handed, and it implies a height, while heights draw nothing.

**6. The symbol ink is derived, not a theme key.** `symbolInk` mixes `furnitureStroke` toward
`wallStroke` by `SYMBOL_INK_MIX` (3/7, the simplest fraction that clears WCAG 4.5:1 on every
built-in theme's `roomFill`, measured by `test/glyph-lib.test.ts`). It follows any theme (a
light wall ink lightens it), keeps a `style furniture { stroke … }` override in the author's
hue, and leaves the defaults alone: the labelled rectangle an unknown word draws paints with
`furnitureStroke`/`furnitureFill` and is a group-1 permanent pin, so those defaults cannot
move. Vertical-circulation outlines use the same ink (`src/elements/vertical-glyphs.ts`).

**7. What a redraw may move.** A drawing change moves SVG (and the PNG/ASCII goldens and
`examples/*.svg` that follow it) and nothing else: `describe()`, `lint()` and
`compile().diagnostics` stay byte-identical. A symbol may never GAIN handedness at a footprint
where it was symmetric; it may lose it only through `LOST_HANDEDNESS` with the reason its old
handed mark was decorative (`test/glyph-chirality.test.ts`, against the survey and grid
measured on the tree before the redraw). A family catalogued `symmetric` stays exact under
every quarter-turn and mirror of a square footprint (the per-module D4 sweeps in
`test/glyphs-*.test.ts`).

## Alternatives rejected

- **Shadows or a raised-object offset**: decision 5.
- **Floor-material tints under furniture or rooms**: a fill implies a material the source
  never named, and it competes with the ground textures that do name one.
- **A new theme key for the outline ink**: every built-in and registered theme would need a
  value, and a `style furniture` override would leave the outline in the old colour unless the
  author also learnt the new key. A derived mix does neither.
- **Level of detail by pen size** (fewer marks at 1:100): a glyph's count must not depend on
  the sheet, because the drawing budget counts each glyph once at canonical pens and
  `test/drawing-budget.test.ts` holds the estimate at or above what is drawn on every sheet.
  Counts are clamped functions of the footprint instead.

## Consequences

- The example SVGs, the scene and snapshot suites, the PNG goldens and the SVG-bearing
  byte-identity rows moved once; each re-measured row was proved SVG-only.
- A symmetric symbol can read handed through an ulp or a decimal rounding tie alone, which
  flips `describe --facts symmetry`. Shape builders decide structure from radii and extents,
  never from derived coordinates, and the handedness key reads numbers through `keyNum` (a
  1e-7 mm nudge off the `fmt4` ties).
- Redraws are held by the survey, the grid baseline, the D4 sweeps and the containment checks,
  not by eye alone; the working checklist is `.claude/rules/glyphs.md`.
- Open items found during the redraw are in `docs/backlog.md`, section D.
