# 23. The plan-symbol drawing language

- **Status:** Accepted — amended 2026-11-04 (material tints in the `rendered` theme only, below)
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
SVG and DXF draw as true arcs (SVG `A`, a DXF `ARC`; PDF
lowers them to Béziers). The tessellated helpers stay in
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
`examples/*.svg` that follow it); over the corpus `describe()`, `lint()` and
`compile().diagnostics` stay byte-identical. The one fact a drawing can move is the opt-in
`describe --facts symmetry`, because a piece's `hand` is read off its drawn symbol: a symbol may
never GAIN handedness where it was symmetric, and it may lose it only through `LOST_HANDEDNESS`
with the reason its old handed mark was decorative (`test/glyph-chirality.test.ts`). Such a loss
can legitimately move that fact: two unmirrored copies of the family standing in mirror
positions no longer break the reflection with their `hand`, so the plan gains an axis. The target for a family catalogued `symmetric` is exactness under every
quarter-turn and mirror of a square footprint; `pool_table` is a known exception (`docs/backlog.md`
D.6). It is pinned for the pilots in `test/glyph-chirality.test.ts` and by each module's sweep
where one exists (`glyphs-living`, `glyphs-outdoor`, and `plant`/`meeting_table` in
`glyphs-misc`).

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
  flips `describe --facts symmetry`. That is why shape builders decide structure from radii and
  extents, never from derived coordinates, and why the handedness key reads numbers through
  `keyNum` (a 1e-7 mm nudge off the `fmt4` ties).
- Redraws are held by the handedness survey and grid, the D4 sweeps and the containment checks,
  not by eye alone; the working checklist is `.claude/rules/glyphs.md`.
- Open items found during the redraw are in `docs/backlog.md`, section D.

## Amendment (2026-11-04): material tints in the `rendered` theme only

**Decision of the owner, 2026-11-04** (visual-assets programme, decision V-D1): plans should be
able to look like a presentation board, and the owner chose that option explicitly. So one new
named theme, `rendered`, fills fixture symbols with soft material tints, and the rejection of
tints above ("Floor-material tints under furniture or rooms") **stands for every other theme and
for the default**.

- **What a tint names.** Not a material the source never named, which was the objection: the
  material is a property of the FAMILY (`FIXTURE_FAMILY_MATERIALS`, beside `FIXTURE_FAMILIES` in
  `src/elements/fixtures-glyphs.ts`; a sofa is fabric, a counter stone), never read from a label
  and never a language keyword. A family names a primary material (the body a plan looks down
  on) and, where it reads better, a secondary one for a second part, which the glyph names
  (a sofa's cushions, a sink's bowl, a car's glass). The same table is exported for
  `packages/archlang-3d`, so a piece's 2D tint and 3D material cannot disagree.
- **How it is drawn.** The theme carries `materialTints` (one fill per material). A glyph's
  `body` and `basin` and its `fillFor(material, untinted)` read them through `GlyphCtx`; with no
  tints each returns exactly the fill it returned before, so no other theme's bytes can move
  (`test/rendered-theme.test.ts` sweeps every example under the default and the four earlier
  themes against digests measured on `main`). Planting keeps `theme.lawn` outside `rendered`;
  inside it a canopy takes the `foliage` tint, so there the `lawn` key reaches the lawn surfaces
  and no longer a tree, shrub, hedge or plant. A rug stays unfilled under every theme, `rendered`
  included: it is moved ahead of the furniture (`renderOrder`), but not ahead of what the same
  pass draws before the first piece (a column, a stair, a void, a fence), nor of the datum axes
  on the pass below, and the Scene has no translucent fill, so any tint would hide them. An
  overhead piece drawn dashed above the cut plane (an upper cabinet, a range hood, a pergola)
  stays unfilled too, so the piece below it shows.
- **What does not change.** Decisions 1 to 6 hold: tints are fills, never strokes; outline and
  detail tones are unchanged (the outline ink is still the derived symbol ink, decision 6), and
  the outline ink keeps at least 3:1 contrast on every tint, measured. No shadow, no hatch on a
  symbol, no new theme directive key: `theme rendered { furniture: … }` and
  `style furniture { fill: … }` replace the tints with the author's one colour. A theme is
  drawing only: `describe()`, `lint()` and diagnostics are the same under `rendered` as under
  the default.
- **Why only one theme.** The ground textures that name a material compete with any fill, and a
  construction or line print reads best untinted; a board for a client is the one place colour
  helps. Keeping tints in one opt-in theme keeps every existing drawing, golden and example
  byte-identical.
