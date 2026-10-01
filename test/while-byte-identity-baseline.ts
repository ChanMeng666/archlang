/**
 * The measured baseline for `test/while-byte-identity.test.ts` — M3 of the W7 red-team
 * verdict: no test pinned the byte-identity law for `compile().diagnostics` itself, only
 * for SVG/`describe()`/`lint()` (which a PARSE-stage diagnostic never reaches).
 *
 * Every row is `allStoreysDigestWithDiagnostics(API, src, { world })` from
 * `./byte-identity-digest.ts`, taken with the test's own digest body (never a lookalike;
 * see that module's header for why this split exists) over the whole corpus: every
 * shipped `examples/*.arch` plus every `test/fixtures/*.arch`. None of these plans uses
 * `while` or a bare reassignment, so the measurement is the same on the tree before W7
 * existed and after — proved directly, not merely argued, by an ad-hoc before/after sweep
 * against `feat/algebra` (0 files moved) as part of this change.
 *
 * `terrace-row` re-measured after W5b (merged in `566f2d3`; commit `54d8b18` re-measured
 * its own goldens): mirrored units' sliding doors now take the correct track — SVG only;
 * describe/lint/diagnostics unchanged.
 *
 * Fourteen example rows re-measured for W3b's circulation changes, with this test's own
 * digest body. In every one the SVG, `lint()` and `compile().diagnostics` are byte-identical
 * (swept per storey before and after on the same tree); only `describe().circulation` moved
 * (field by field in `./byte-identity-baseline.ts`, "Fourteen rows re-measured"). No fixture
 * row moved.
 *   - `bungalow`, `garden-house`, `hillside-villa`, `laneway-house`, `materials`, `museum`,
 *     `museum-wings`, `parametric`, `terrace-row`, `townhouse`, `transit-hall`: each has
 *     several entrances, and every room now walks from its NEAREST one (backlog G.5);
 *   - `library`: the same, plus r_reading 25500 → 25400 from the snapped relative frame;
 *   - `aquarium`: rotunda_r detour 1.01 → 1, the snapped relative frame (translation
 *     invariance);
 *   - `hexagon-pavilion`: rotunda walk 5800 → 5700, the snapped relative frame.
 *
 * Two more rows re-measured for W3b's door-route gate (a room `access` cannot reach is
 * `no_door_route` even where the raster walks into it): `examples/relational.arch` —
 * kitchen, bed and bath, doorless rooms of an open plan with no interior wall, lose their
 * walks and their two routes; `test/fixtures/zones-wings.arch` — gal_b and store, doorless
 * rooms of a plan with no partitions, likewise. Only `describe().circulation` moved.
 *
 * `examples/museum-wings.arch` re-measured for a SOURCE edit, not a compiler change: `d_east`
 * now hangs `hinge left` (the mirror of `d_west`). Only the SVG moves — that one door's leaf
 * and swing arc; `describe()`, `lint()` and `compile().diagnostics` are byte-identical (the
 * full field-by-field is in `./byte-identity-baseline.ts`, "`museum-wings`: whole-surface row").
 * Re-measured again for a second SOURCE edit (backlog 6.8): the single-leaf `d_main` became a
 * mirror pair of 1000 mm leaves on a shared jamb. The SVG and `describe()` move (field by field
 * in `./byte-identity-baseline.ts`, "the main door is a mirror pair"); `lint()` and
 * `compile().diagnostics` are `[]` before and after. The `W_SWING_OBSTRUCTED` change that lets
 * the pair lint clean moved no row on its own (the corpus swept with the examples untouched).
 *
 * Circulation v2 (backlog E.6–E.10): 24 example rows and three fixture rows re-measured, with
 * this test's own digest body. SVG, `lint()` and `compile().diagnostics` are byte-identical in
 * every one; only `describe().circulation` moved — the examples field by field in
 * `./byte-identity-baseline.ts` ("Circulation v2"), the fixtures here (A = the walk-first
 * nearest-cell tie, E = an entrance seeded on both sides of its lattice line):
 *     - `test/fixtures/diff-circ-a.arch`: living walk 2500→2300 [A]; living detour 1.04→1 [A]
 *     - `test/fixtures/diff-circ-b.arch`: living walk 2500→2300 [A]; living detour 1.04→1 [A];
 *       bed walk 5800→5700 [A]
 *     - `test/fixtures/zones-wings.arch`: lobby walk 1900→1800 [A]; lobby detour 1.05→1 [A];
 *       gal_a walk 7900→7700 [AE]; gal_a detour 1.28→1.26 [AE]; office walk 11900→11700 [AE];
 *       office detour 1.19→1.17 [AE]
 *
 * Circulation on storeys reached only by a shaft (owner-approved; ADR 0008's 2026-10
 * addendum): `hillside-villa`, `townhouse` and `two-storey` re-measured with this test's own
 * digest body. In each, every storey's SVG and `compile().diagnostics` are byte-identical; in
 * `describe()` only the upper storeys' `levels[i].circulation` moved, `null` → a model walked
 * from the head of the arriving stair (hillside-villa level 2; townhouse levels 2 and 3;
 * two-storey level 2); `lint()` gains only `W_PATH_TOO_NARROW`, inserted in rule order —
 * six on hillside-villa level 2 (640 mm: five 700 mm doors, and the Master Suite's a carve
 * artefact on the passage under the flight — since removed, below), none on the other two. hillside-villa's
 * corrected source comment shifts no default-profile span (every one lies above it). Every
 * value, field by field, is in `./byte-identity-baseline.ts` ("Circulation on storeys reached
 * only by a shaft"). No fixture row moved.
 *
 * `examples/hexagon-pavilion.arch` re-measured, with this test's own digest body, for the
 * threshold carve-order fix (every connector's seeds are read off the nav mask as it stood
 * before any connector carved, so neither the order a connector's threshold points are
 * visited in — which a turn or flip reverses — nor the connectors' source order moves a fact).
 * SVG, `lint()` and `compile().diagnostics` are byte-identical; only `describe().circulation`
 * moved: g_sw and g_se walk 9800 → 8800, detour 1.87 → 1.68 (field by field, and the 14 files
 * whose opt-in `--overlay circulation` SVG moved with no fact, in `./byte-identity-baseline.ts`,
 * "a threshold no longer carves in carve order"). No other example row and no fixture row moved.
 *
 * `examples/hillside-villa.arch` re-measured, with this test's own digest body, for the
 * connector carve fix (a connector's inward walk stops at the room's first eroded floor cell,
 * so `d_en2_corr` no longer stamps its 640 on the passage under the flight). Every storey's SVG
 * and `compile().diagnostics` are byte-identical; `describe()` moves only level 2's
 * r_master bottleneck, 640 → 700; `lint()` keeps nine warnings, the Master Suite's walk
 * warning replaced by its route to its ensuite through `d_enm` (640, at the same span). The
 * example's comment above `d_en2_corr` was rewritten in the same change and shifts no
 * default-profile span. Field by field in `./byte-identity-baseline.ts`, "a connector's inward
 * walk stops at the room's first eroded cell". No other example row and no fixture row moved.
 *
 * `examples/hillside-villa.arch` re-measured again, with this test's own digest body (the
 * script first reproduced the old row on the tree before), for "a room is reached on its
 * floor": a room's best cell no longer counts the doorway cells a carve opened inside its
 * rectangle. Every storey's SVG, `compile().diagnostics` and the default `lint()` are
 * byte-identical; `describe()` moves only level 1's `r_terrace` bottleneck, 1140 → 840.
 * Field by field in `./byte-identity-baseline.ts`, "a room is reached on its floor". No other
 * example row and no fixture row moved.
 */
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "a8b70a680754e431524037dc3a936bba2ec7c0e2cba8df0c72a16f45e5d1e27b"],
  ["examples/aquarium.arch", "4f135e5fba5280498df1ab20fb940a68e649365b55f074e9763d722411d193eb"],
  ["examples/attached.arch", "51833bf888bb42ce0bf0ac436375a281467b904bede6c8f590dda6d4c6a4b46f"],
  ["examples/bungalow.arch", "717b2fe807b737a1a9a7b7c28732f97ab1679bfa7b6947555c14e8a442a6f0b7"],
  ["examples/clinic.arch", "64e6abfc1bb9e12b2e63dda0deec06ad0029c7cb599ab0349df888528719a518"],
  ["examples/courtyard-house.arch", "b1313ec6723213df69b054f821bc14316c671ca93f199d50fe2bc780002f475a"],
  ["examples/furnished-flat.arch", "d00f64c4441c1e24f2de9aace0ebff2393d6db36fda37f8ae6a84ed38d3ebc87"],
  ["examples/gallery-l.arch", "8904c16f3c22da4f2b82d7a257a02fe2a578494378524a00a62b7fd94a2afa87"],
  ["examples/garden-house.arch", "8ea8fb09514623262787606780e5db8571d1fa7cbe1d48070b5eef0931cde302"],
  ["examples/garden-loft.arch", "a21189336cc1d8160d968e51cf9407137eb8212d1692228325e8f7ff172abbcd"],
  ["examples/hexagon-pavilion.arch", "a6bf86674027eac1e6e68a718e5902c401a461650a90808b177f576f330b7137"],
  ["examples/hillside-villa.arch", "53e4eb4c095734866e1d784fa87b4377b43a94b04003e6146c104fef226a3c49"], // re-measured, see header
  ["examples/imports.arch", "7e44e3f95168fb671437b5d38e8918d72ec74d89636636aac858e7306538a4f4"],
  ["examples/laneway-house.arch", "ef8afb7fa4673499128960f97075509cf41bf8270c9fbaece1f1c640e9679d7a"],
  ["examples/library.arch", "89c83260fd894b5271a0ffba7e6622760298c8ffc996a8139caa416fe7a9ac29"],
  ["examples/materials.arch", "f580b5bff294860346858347ea21b3f43fe648e58266603dd4549026d1addafe"],
  ["examples/museum-wing.arch", "1dc44273ff89fdc84d1d1c84fe76d2cacb35f9f8cb05b09909780e9afdf63f1a"],
  ["examples/museum-wings.arch", "ba10adf23d893ff18a3b146b783eb71c8b3b9239e07d9319ed4ad3527380893e"], // re-measured, see header
  ["examples/museum.arch", "afc31f3ca38ea93b1ff3031a7f89cc3bdf15c6255be5987569f427bcbaaa5fea"],
  ["examples/one-room.arch", "0cc68bb6a76ac2086b978b95bf6a461968f5e30779dfbe60acb9db695ec77e54"],
  ["examples/parametric.arch", "963fd4b30b77d52f0367492e8e7ff13eabb08c9f709fd2100aba7eb67764ca63"],
  ["examples/relational.arch", "63fa6c32c6838fdc364e6e177c6c794f916ac9992ece18e8cc6218b72f8080a9"],
  ["examples/studio.arch", "d506b6b9ea5795c4d4b1b809067be40b474f42c3c41456ce7463be0bfdc253f4"],
  ["examples/terrace-row.arch", "9ad5fcc128ecca935fa6fd43a6e02f3ecd762a79dcbcd8d6fe9f8718aa8b696e"],
  ["examples/themed.arch", "9395b6c8962d09e72701690c14ce8e12ef7ae1c9f65a1d4827d5f9734c1fcc4c"],
  ["examples/tiny-house.arch", "62b7975513bb50faa6bef4d976e7229c07015b53615d9044d29b2e703bdc9d01"],
  ["examples/townhouse.arch", "ccbbd3ba42b9c6c1f1af683b933819fb935ed8990576e5db853c283089d822c8"],
  ["examples/transit-hall.arch", "27e02c494de9ec1e43a624a85c6ba1aa91f86b58441016b9d7ed83212c28fd05"],
  ["examples/two-bed.arch", "ee833aac25fb9dcb73179acde49407cf065d9dd3c987a388aa362607cffc19d0"],
  ["examples/two-storey.arch", "728bf52318ca4ddc249276bb41c52a98893649c3b33c5d2c042b16d118c812f8"],
  ["test/fixtures/axes-grid.arch", "392def55168a0672ecddda8e47deebc5be6289ce8db230fbf1dc7fe315e077ac"],
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "1df5ea19907127485872bd11c488eb5747e17ab3bd55051a0a69c7221394b24a"],
  ["test/fixtures/diff-b.arch", "6145ecc0ccbfa94fa78fb31d6eabca8d89194ca92290361ca52e37c572e468d8"],
  ["test/fixtures/diff-circ-a.arch", "c735c9f3dd761ab9098fdc726ce8f9ed7eca6b66a6e7a929ad25ac91cfb61414"],
  ["test/fixtures/diff-circ-b.arch", "604c70e57848bf2ebb2c0482c8caa7732667c0633fde02e77c8c67432094d852"],
  ["test/fixtures/schedule-sheet.arch", "87b0599a57b6df143daf9f593a4099c0cb19fb230b36aabe93cf37bef15c4fff"],
  ["test/fixtures/zones-levels.arch", "73386d89afe78ed066d395979141521f6b9d7ca42ee883c42cd8c7bbc7db884b"],
  ["test/fixtures/zones-wings.arch", "1b35741ed096626d8ea9e54ea8df294bb3ff5e7140d2cbde78ec6d91d5b17de3"],
];
