# Visual assets: cards

Each card is one PR off `main`. Decisions V-D1…V-D7 are in `README.md`. Every card states what it
may move and proves the rest did not move.

## V1 · 3D material slots (foundation)

- `Part` (`packages/archlang-3d/src/mesh/t0.ts`) gains `mat: Slot`, a closed union, e.g. `wood`,
  `wood_dark`, `fabric`, `cushion`, `linen`, `ceramic`, `stone`, `metal`, `glass`, `appliance`,
  `screen`, `foliage`, `bark`, `soil`, `water`, `rubber`, `paint`. Default for an untagged part:
  `body` (today's colour), so V1 alone changes no colour.
- `Shell` gains an optional `slot`; the furniture node keeps ONE node and its key
  (`furniture:<id>`), so V-GLTF-02's naming is untouched. The GLB writer emits one primitive per
  slot (material `fixture:<slot>`, base colour from one palette module); the viewer builds one
  mesh per slot. One palette module (`src/materials.ts`) is read by both, so they cannot disagree.
- Ledger: one assumption per family that uses a non-body slot (`furniture-material-default`).
- Moves: nothing visible yet (all parts `body`). Prove: laneway Mesh3D / GLB pins unchanged, or
  moved only by the writer's primitive split with the reason recorded; glTF-Validator 0/0.

## V2 · 3D shape primitives

- `Part` gains: `radius` (rounded plan corners, quarter arcs from the exact 16-gon tables, so no
  float trig), `axis: "x" | "z"` (a prism extruded sideways: wheels, bolsters, rails), and
  `profile` (an explicit local polygon: a piano's curve, a chaise, an L-sofa).
- Every shell stays closed, outward-wound, integer µm; mirror-symmetric generators stay
  symmetric (the existing symmetry test covers new primitives).
- Moves: nothing (no generator uses them yet). Unit tests per primitive: closed, outward, extents
  equal the requested box.

## V3 · The twelve existing generators, refined

- Slots and detail for bed (frame wood, mattress linen, duvet, rounded pillows), sofa (fabric
  body, rounded seat and back cushions), table (wood top, legs), rug (fabric, thinner), wardrobe
  (wood doors, metal handles), fridge (appliance, handles), counter/sink/stove (carcass paint,
  stone worktop, metal sink and burners), shower (ceramic tray, glass screen), wc and basin
  (ceramic, rounded with V2).
- Moves: laneway Mesh3D + GLB pins and the furniture key frames, with this card's reason
  (`e2e/fixtures/README.md` entry). Look: screenshot `furnished-flat` and `laneway-house` end
  frames before and after (`archlang3d view … --replay`, `__seek(1)`), attached to the PR.

## V4 · The `rendered` 2D theme (core)

- A family→material table beside `FIXTURE_FAMILIES` (V-D2), exported so archlang-3d reads it
  instead of retyping it (an additive core export with its own byte-identity proof, ADR 0031).
- Theme `rendered`: the presentation palette plus `materialTints` (one soft fill per material);
  a glyph's fill passes through `GlyphCtx` (`fillFor(material)`), which returns the theme's
  `furnitureFill` when the theme has no tints. Outline and detail tones are unchanged (ADR 0023
  d6); contrast of the outline ink on each tint ≥ 3:1, measured in the theme test.
- ADR 0023 amendment: tints are allowed in `rendered` only, and why (owner, V-D1).
- Moves: nothing outside `rendered`. Prove: the byte-identity sweep (SVG + `describe()` +
  `lint()` + diagnostics) over the examples under every existing theme; `gen:all` and
  `check:drift` for the theme lists in docs and manifest. Look: PNG of `furnished-flat`,
  `garden-house` under `rendered` at 1:50 and 1:100.

## V5 · T0: living, bedroom, dining, office

double_bed (bed), nightstand, armchair, coffee_table, tv_unit, chair, stool, bench, desk,
office_chair, bookshelf, sofa_l, piano, bunk_bed, crib, dresser, vanity, fireplace, radiator,
sideboard, loveseat, chaise, tv, coat_rack, shoe_cabinet, mirror (wall-mounted height).

## V6 · T0: kitchen, bath, utility

bathtub, oven, dishwasher, island, upper_cabinet (mounted: underside 1400 mm, a ledger default),
washer, dryer, bidet, urinal, laundry_sink, water_heater, range_hood (mounted), microwave,
bar_counter.

## V7 · T0: outdoor, vehicles, commercial

plant, tree, conifer, shrub, hedge, car, bicycle, motorcycle, bbq, outdoor_table, outdoor_chair,
umbrella, sun_lounger, hot_tub, swing, trampoline, bin, mailbox, ev_charger, pergola, sandpit,
fire_pit, shed, clothesline, meeting_table, reception_desk, filing_cabinet, locker, pool_table,
treadmill. Trees and shrubs: stacked rounded prisms (no sphere primitive needed); a tree taller
than its storey's wall is still drawn at its default height (ledger), never clipped silently.

For V5–V7: every family in `T0_FAMILIES` with a height in `T0_HEIGHT_MM`; the "no grey box for a
catalogued family" test (`test/t0.test.ts`) grows to cover the batch. Each batch moves the pins
only if laneway uses one of its families.

## V8 · New families (2D + 3D + material)

Twenty, appended at the END of `FIXTURE_FAMILIES`: floor_lamp, side_table, console_table,
ottoman (pouf), bean_bag, pantry (tall_cabinet), towel_rail, palm (palm_tree), flower_bed,
boulder (rock), picnic_table, slide, bollard, bike_rack, raised_bed, whiteboard, printer,
server_rack, hospital_bed, workstation. Each: catalog row (footprint, `requiresWall`, symmetry),
glyph per `.claude/rules/glyphs.md` (outline first, fractions of the footprint, containment and
D4 sweeps, chirality), material for `rendered`, T0 generator, `gen:all`. Over the corpus nothing
outside the new families moves (byte-identity row for the new words).

## V9 · Viewer polish

Hemisphere + one key light (fixed, no shadows maps if SwiftShader cost is over budget), the
palette tuned so walls, floors and furniture separate; floor finish by room `uses` (timber for
living/bedroom, tile for wet rooms, stone outdoors) as labelled ledger defaults. Moves key frames
with the reason.
