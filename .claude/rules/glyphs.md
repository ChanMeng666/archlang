---
paths:
  - "src/elements/glyphs-*.ts"
  - "src/elements/fixtures-glyphs.ts"
  - "src/elements/glyph-lib.ts"
  - "src/elements/glyph-chirality.ts"
  - "src/elements/door.ts"
  - "src/elements/door-panels.ts"
  - "src/elements/window.ts"
  - "src/elements/opening.ts"
  - "src/elements/fence.ts"
  - "src/elements/outdoor.ts"
  - "src/elements/vertical-glyphs.ts"
  - "src/hatches.ts"
  - "src/fixtures-catalog.ts"
  - "src/elements/furniture.ts"
  - "src/sheet-tables.ts"
---

# Drawing a symbol

The drawing language and why: `docs/adr/0023-plan-symbol-drawing-language.md`.

- Outline first: the first node is the symbol's `thin` outline, which `annotate` marks
  `data-arch-primary`. Detail follows in `extraThin`. Tone follows weight (`GlyphCtx.tone`); never
  pass a colour that bypasses it.
- A fixture's every measure is a fraction of its footprint (`shortSide`, `insetRect`,
  `insetRectSides`); a door's or window's, of the wall thickness. Every repeat count is a clamped
  function of the geometry alone (`clampCount`), never of a pen, so it is the same on every sheet
  and theme — the drawing budget counts it once (`test/drawing-budget.test.ts`).
- All ink stays inside the footprint at every aspect and quarter-turn (the containment checks in
  `test/glyphs-*.test.ts`, path extents via `test/glyph-extent.ts`).
- Curves are `g.path` loops from `roundedRectPath`/`ovalPath`/`bulgeArc`/`scallopPath`, every arc
  edge ≤ 120°; a bare `arcSeg` is a minor arc. Dashes only for hidden or above the cut plane.
- Reuse `glyph-lib.ts` (`chairAt`, `polar`, `clampCount`, the shape builders); a helper moves there
  on its second caller. Build a mirrored or turned part by exact reflection or a coordinate swap
  (as `chairAt` does), never by float rotation; decide a shape's structure from radii and extents,
  never from derived coordinates.
- Target: a `symmetric` family is exact under every quarter-turn and mirror of a square.
  `pool_table` is a known exception (see the backlog). Pinned for the pilots in
  `test/glyph-chirality.test.ts` and by the module's own sweep where one exists; add the family to
  it. No glyph ever GAINS handedness: run `test/glyph-chirality.test.ts`; a decorative loss goes
  in its `LOST_HANDEDNESS` with the reason. Re-measuring its baselines: `docs/testing.md` §3.
- Ground-material work never re-frames or restyles a wall material's hatch.
- Look at it: `npm run cli -- compile <plan> -f png -s 3 -o <scratch>/x.png`, crop to the symbol,
  and compare on a `paper` plan at `scale 1:50` and `scale 1:100` and under each `theme`
  (`blueprint`, `mono`, `dark`, `presentation` and the default).
- A redraw moves SVG only: over the corpus `describe()`, `lint()` and diagnostics stay
  byte-identical (the symmetry-fact exception: ADR 0023, decision 7). The goldens
  it moves and how to update them: `docs/testing.md` §2–3. Never `-u` group 1 of
  `test/fixture-byte-identity.test.ts`.
