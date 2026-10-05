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
 *
 * Re-measured for the visual-polish symbol redraw: SVG only, describe/lint/diagnostics unchanged
 * (substitution check reproduces the old digests).
 *
 * `examples/hillside-villa.arch` re-measured, with this test's own digest body, for backlog
 * E.17 (`facade-probe-order`): level 2's `dims auto` chains end on the shell's outer face
 * (13950) instead of the ensuite wall's (13850) that `ir.walls` order picked. Only level 2's
 * SVG moves; the old SVG put back into the new payload reproduces the old row, so
 * `describe()`, `lint()` and `compile().diagnostics` are byte-identical. Field by field in
 * `./byte-identity-baseline.ts`, "`dims auto` ends on the outermost face". No other example
 * row and no fixture row moved.
 *
 * `examples/garden-house.arch` re-measured, with this test's own digest body, for backlog D.1:
 * the example's SOURCE changed (the four `chair`s and four `outdoor_chair`s that doubled the
 * chairs its two tables draw are removed); the compiler did not. Level 1's SVG, `describe()`,
 * `lint()` (one span, 523 bytes up) and `compile().diagnostics` (the `W_DRAWING_OVERFLOW`
 * message's measured numbers) move; level 2's SVG is byte-identical. Field by field in
 * `./byte-identity-baseline.ts`, "the example stopped seating its tables twice". No other
 * example row and no fixture row moved.
 *
 * `examples/hillside-villa.arch` re-measured, with this test's own digest body, for backlog D.2:
 * the example's SOURCE changed (its `piano` moved beside the bay, turned `rotate 270` and given
 * a 1600x1200 footprint that holds the bench); the compiler did not. Level 1's SVG (the piano
 * only), `describe()` (the piano's `rotate`, three bottlenecks 940 → 1100) and `lint()` (five
 * spans, +11 bytes) move; level 2's SVG and `compile().diagnostics` are byte-identical. Field by
 * field in `./byte-identity-baseline.ts`, "the piano turns its keyboard to the room". No other
 * example row and no fixture row moved.
 *
 * `examples/garden-house.arch` re-measured, with this test's own digest body, for backlog D.3:
 * the legend's `grass`, `gravel` and `tarmac` swatches draw their pattern at a smaller zoom.
 * Only level 1's SVG moves (three swatch fills); the old SVG put back into the new payload
 * reproduces the old row, so `describe()`, `lint()` and `compile().diagnostics` are
 * byte-identical. Field by field in `./byte-identity-baseline.ts`, "three legend swatches show
 * more marks". No other example row and no fixture row moved.
 *
 * `examples/clinic.arch` re-measured, with this test's own digest body, for room-name wrapping:
 * "Accessible WC" is too wide for its room on one line and is drawn as "Accessible" / "WC"
 * (`wrapLabels`, `src/label-placement.ts`). Only that name and its area figure move; the old
 * SVG put back into the new payload reproduces the old row, so `describe()`, `lint()` and
 * `compile().diagnostics` are byte-identical. Field by field in `./byte-identity-baseline.ts`,
 * "a room name too wide for its room wraps". No other example row and no fixture row moved.
 */
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "7d17249d81b43f1ff5b17c6b1219750bbdd695599f31e66fb298be9facc7c169"],
  ["examples/aquarium.arch", "cd69652d35d177efcacfbb73fe1d8b5b05a78702aac0d48305120a8d29efaf61"],
  ["examples/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["examples/bungalow.arch", "b841a0cee3ddba6e29c5ca17fb0f22a382d9409f3b0cd2c3f1ad6c6848e2dbde"],
  ["examples/clinic.arch", "00678e5081cf6e5c9a7d6691a5fd5925af80b484f494e37662cc1ed58c882254"],
  ["examples/courtyard-house.arch", "c143144408b02775b6343eee9dbda3420a7947df651195bed024768620715335"],
  ["examples/furnished-flat.arch", "12473e1ca6aaacf6adea0da3c46565d93a14a8396700eed2f8d70dd90d73957a"],
  ["examples/gallery-l.arch", "0f52fc12ee4cf93c8d7c106be8a5a49c8b78c3a66cd9afabd00149d57f47802c"],
  ["examples/garden-house.arch", "78af129f024f23540fc2ea037bd3ba8f5eb8875098303ee5899ce5a8fe4715d8"], // re-measured, see header
  ["examples/garden-loft.arch", "1fbeaf41b1f1b981f274a1501ed870bb6b3ebc2ec377bd15e588e78cbd07ab7b"],
  ["examples/hexagon-pavilion.arch", "293447ab543aa86945af475e440ff85cddb8070f3330d6887e94f5e344d4c216"],
  ["examples/hillside-villa.arch", "8321d132254774bd2aa79bf88cd9e9fd36a3f452a8f2af8eeae7cae4a95ff675"], // re-measured, see header
  ["examples/imports.arch", "dbbdb95881775e34e5abecc72a52bc72160af81a5883ddced18bbf3d7f1a7f2c"],
  ["examples/laneway-house.arch", "2315eb23382b52aa784930c332c00083b7d9931c4620a46b8b710c75e4c1195e"],
  ["examples/library.arch", "5c4913bdc5e2960d6cac2203cdb775ed56179c232550efe893a1dfab492d3215"],
  ["examples/materials.arch", "115a724fe9b7036c5d8e1ae2d7fc087126df41d9adbe390a97cbb80354b83c64"],
  ["examples/museum-wing.arch", "860439d86b4b406c7af8d184a078c6461580b219c70227e3aabeda9b25cde862"],
  ["examples/museum-wings.arch", "da045e501bf580920bed1c764766dda64cfb8cab8de1218d292dcbd4852d2ef7"], // re-measured, see header
  ["examples/museum.arch", "ecdc2f529a170001d711f2b7656f987004cefadea1cbaae972c31c6c7dc911f3"],
  ["examples/one-room.arch", "050d5beb84aff06312d933a3b16de45f4b98cac0aa2d25efba6ed0234f45e4ca"],
  ["examples/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["examples/relational.arch", "78396bc038b0198f2ed2952cc6169d0c810ffeb4149d04ba3203aa397a16cabd"],
  ["examples/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["examples/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["examples/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["examples/tiny-house.arch", "af84b98168791a856d4b2787106534b2def58541ad554405d6d890c576444106"],
  ["examples/townhouse.arch", "9b1298ecccc1a1a0010e8f533982b298ab25ae8dff257e56ddd2e1056a7f47c5"],
  ["examples/transit-hall.arch", "7dd542eb7bb1110e5b15ac375653f2a015826dc292ecbb1eb62063bf5a444c7a"],
  ["examples/two-bed.arch", "595276f8bf7cf2b3531acf5f6f89808b33653e3ec99c4d30e5ca9b81d5f8bd1f"],
  ["examples/two-storey.arch", "40db64f06de76a95b038de66acc9ddd996020a2c84c48e5d6e1670ac8c247adb"],
  ["test/fixtures/axes-grid.arch", "6f1e4a5a6c27df9deeb26885d5d97da5b574d8e644acd0fa6fc588c11f610695"],
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "a0aa011cfb507ce20b4945afdc748d71b196d54a016269c539fee59223519f15"],
  ["test/fixtures/diff-b.arch", "e3824c83ed8db86eda56328ef12cf598ad200cceee01ff63c7400bd13ef8cfb9"],
  ["test/fixtures/diff-circ-a.arch", "84d413c8733e5dae6fe6adf57a9ecea3ced920501be76a4175f225ea2e8a9974"],
  ["test/fixtures/diff-circ-b.arch", "c22679ed9da2f1386e64c665245bb8a4555ffb5e7f38010e5d4252c858a8f2f9"],
  ["test/fixtures/schedule-sheet.arch", "3f66597531afcf2d8be6c4a297121aa309f08887fc369ca5f322fa12b95433e5"],
  ["test/fixtures/zones-levels.arch", "2ee9feeb3f6ca7c09e51eee71ffb78272b3b09be7ccdccbf87a38a4ee1234cae"],
  ["test/fixtures/zones-wings.arch", "9375f1e04051120bf1d5734fe7a99a7dd828926d08993da28ec5b3d02a20591c"],
];
