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
 *
 * `examples/hillside-villa.arch` re-measured, with this test's own digest body:
 * `W_BATH_VIA_BEDROOM` no longer names an en-suite on a storey with another wet room off
 * circulation. `lint()` loses that one diagnostic (the master ensuite, span 2564); putting it
 * back at its old index in the new payload reproduces the old row, so every storey's SVG,
 * `describe()` and `compile().diagnostics` are byte-identical. Field by field in
 * `./byte-identity-baseline.ts`, "an en-suite beside a bathroom off circulation is not
 * flagged". No other example row and no fixture row moved.
 *
 * `examples/sheet-notes.arch` is a row ADDED with a new example (the issued-sheet statements),
 * measured with this test's own digest body when the example first existed, and measured again
 * when the next commit on the same branch extended it with `schedule openings`: only its SVG
 * moved (`compile().diagnostics` is `[]` both times; the summary row in
 * `./byte-identity-baseline.ts` did not move), and once more for the review fixes (NOTES wrap
 * to a fixed column; tags avoid neighbouring openings) — again the SVG alone, diagnostics `[]`.
 * No other example row and no fixture row moved.
 *
 * Three rows re-measured, with this test's own digest body, for a deliberate diagnostic-TEXT
 * change (case (3) in `./byte-identity-baseline.ts`'s header; `test/lint-fix-texts.test.ts`).
 * Each moves in `lint()` alone: hashing the NEW compile, `describe()` and diagnostics with the
 * OLD `lint()` reproduces its old row.
 *   - `examples/hillside-villa.arch` — `W_PATH_TOO_NARROW` names the en-suite doors and gives
 *     the clearing `width`; the Master Suite → Ensuite route through `d_enm` is withdrawn as
 *     the same bottleneck. Re-measured a second time when the named door became the one on the
 *     widest door path (doors in series), and a third time when the attribution became
 *     re-measured (hint wording only); each time the previous `lint()` put back reproduces the
 *     previous row. Field by field in `./byte-identity-baseline.ts`, "names the door, once".
 *   - `test/fixtures/diff-a.arch`, `test/fixtures/diff-b.arch` — `W_ROOM_NO_FIXTURE`'s hint
 *     stops pointing at an unshipped `lib/fixtures.arch` import and gives a pasteable
 *     statement (`furniture wc in bath anchor top flush size 400x700`). Its message, span and
 *     every other diagnostic are byte-identical.
 * No other example row and no other fixture row moved.
 *
 * Two fixtures ADDED, not re-measured: `test/fixtures/star30.arch` (thirty rooms off one
 * corridor) and `test/fixtures/chain30.arch` (thirty rooms in a row), the run-time and
 * re-measure-count pins for `W_PATH_TOO_NARROW`'s door attribution
 * (`test/lint-attribution-budget.test.ts`). Their rows are their first measurement, taken with
 * this test's own digest body on the tree that adds them. `test/fixtures/off-path-bypass.arch`
 * likewise: the repro of a walk that passes furniture through another room's doorway band.
 *
 * Eighteen rows re-measured, with this test's own digest body, for the thickness call-out
 * station (drawing only): every example that draws a `dims auto all`/`walls` call-out, plus
 * `test/fixtures/axes-grid.arch` and `test/fixtures/schedule-sheet.arch`. A call-out now keeps
 * off the openings on its wall and the furniture on its side. Hashing the NEW payload with
 * the OLD SVG put back reproduces each old row; `describe()`, `lint()` and
 * `compile().diagnostics` are byte-identical. Each moved call-out in
 * `./byte-identity-baseline.ts`, "thickness call-outs keep off doorways and fixtures".
 *
 * `examples/sheet-notes.arch` re-measured once more, for the same call-out change meeting the
 * example on merge: two call-outs move out of d_bed and d_front, nothing else in the drawing;
 * `compile().diagnostics` is still `[]`, and the old SVG put back into the new payload
 * reproduces its old row (`365c38ef…`). Field by field in `./byte-identity-baseline.ts`,
 * "`sheet-notes`'s whole-surface row re-measured when the call-out change met it".
 */
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "7d17249d81b43f1ff5b17c6b1219750bbdd695599f31e66fb298be9facc7c169"],
  ["examples/aquarium.arch", "bd7b2666cb68c863d7a89064d0b96710e130cc2163ba426750ca1b76f8e22ba0"],
  ["examples/attached.arch", "ce39e349037a98b01516a72737bf9ea14a6f410ec295913efe84708753481761"],
  ["examples/bungalow.arch", "1e374f87b266082707aa4e0baa263a2f2784ddc75eba8aeec94e5049f97d84ae"],
  ["examples/classroom-block.arch", "d0fdd3758a0ccf77a9edbd5b7d1d7f03d07745b104759e3150477ea5da9721ca"], // first measurement, added with the example
  ["examples/clinic.arch", "2713e28ea3bfb3409f54cab4fac70402777397fbc0414ac91fd22a13093b6a9d"],
  ["examples/corner-cafe.arch", "2fe716112a6b8ea668f0ad1c076981da170d8fecdac98f0c39357e8d1b9234fa"], // first measurement, added with the example
  ["examples/courtyard-house.arch", "91c2a44265e69f983cf775eed28aa33e0aa5888334ad13856662a15fefa68169"],
  ["examples/furnished-flat.arch", "12473e1ca6aaacf6adea0da3c46565d93a14a8396700eed2f8d70dd90d73957a"],
  ["examples/gallery-l.arch", "83bfc4e12622ae307469b173ce83a27b9dcb5aafd661fa004a8330f58c14e4e4"],
  ["examples/garden-house.arch", "78af129f024f23540fc2ea037bd3ba8f5eb8875098303ee5899ce5a8fe4715d8"], // re-measured, see header
  ["examples/garden-loft.arch", "35f94551f233a8b74a41fa33653068b5f7a6a39afd362d0646b861d7c44e5a4d"],
  ["examples/hexagon-pavilion.arch", "293447ab543aa86945af475e440ff85cddb8070f3330d6887e94f5e344d4c216"],
  ["examples/hillside-villa.arch", "4eed978244287e971800bed3775fff061c0602b894b8076087c1e0532678752d"], // re-measured, see header
  ["examples/imports.arch", "dbbdb95881775e34e5abecc72a52bc72160af81a5883ddced18bbf3d7f1a7f2c"],
  ["examples/laneway-house.arch", "22c7826c336b629f99f486b29fd601033ba3220c27a8db9ab166f4de721ab40f"],
  ["examples/library.arch", "087897f49ddcea8e83f7c59081946b38e36db0b6f4afe37aa99e4f91522b54e9"],
  ["examples/materials.arch", "3222a896a4a48f27bb92bb3e6396fde2395af69307536eae38cdd75e8bcf32cd"],
  ["examples/museum-wing.arch", "961bb8630adfb67925212a4ddfd0ad2fa95213306e8d3ee27def73dcb8bb6d6e"],
  ["examples/museum-wings.arch", "9d1a8cd57df5a37100ec394c8a263481d280a7e1cef5d53c931fb13b2a5972c1"], // re-measured, see header
  ["examples/museum.arch", "7635661a9e48d26588950f7c4c902b7961f2e28bc50025e55b20f2053a5a67d3"],
  ["examples/one-room.arch", "050d5beb84aff06312d933a3b16de45f4b98cac0aa2d25efba6ed0234f45e4ca"],
  ["examples/parametric.arch", "50542aff6a0a3f03bb8e1ff9ba69d10d721d81bc78c7b7147b10acdab77e25fd"],
  ["examples/practice-office.arch", "fc2603d751b6b2efed7ff5ad3ac35ca54e5b8eb90ee5a472eee7ed9589ed2ad8"], // first measurement, added with the example
  ["examples/relational.arch", "78396bc038b0198f2ed2952cc6169d0c810ffeb4149d04ba3203aa397a16cabd"],
  ["examples/sheet-notes.arch", "90e7d0ad148524bd71ba014f2b3849737034c6a23f27bf6f5a40ea800c20eaa1"], // re-measured, see header
  ["examples/studio.arch", "6f0c677cc5c7bc15b4cea1faee4d61bf30e4e775aa96c2efb2f374f773047362"],
  ["examples/terrace-row.arch", "93825c78af4638012261cfa52b8645ff1bfcb2859f4d65a4595a1a8505a40424"],
  ["examples/themed.arch", "94ea6112f46d9827b260dbfee48cfe1a5fe694d78256bfb70dc12a85be7532a0"],
  ["examples/tiny-house.arch", "af84b98168791a856d4b2787106534b2def58541ad554405d6d890c576444106"],
  ["examples/townhouse.arch", "35e1b257702e6facdc73fa3bf34e00571d7721744b6c20e816246198ecf361a7"],
  ["examples/transit-hall.arch", "adf801635352b34e5fbba07ea84cd55c5b2df81a8a13b12dc2722e963c48ff56"],
  ["examples/two-bed.arch", "595276f8bf7cf2b3531acf5f6f89808b33653e3ec99c4d30e5ca9b81d5f8bd1f"],
  ["examples/two-storey.arch", "1876fbe4389260e58f93a68c8100c81fd7fb7976ad3dc926ba68ba5d7d2e4419"],
  ["test/fixtures/axes-grid.arch", "2c703799551f36dfba311db77835e04ca15ef5a38e7fe7e7ff8fb9eee511a284"],
  ["test/fixtures/chain30.arch", "b1e38c910666b9f7f7bf2fb6e8a4b043fe7787419e1e0b41bfad0be774194b09"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "22f98cc0f66e94a5db73bd40f2ba111da74740976f5255f1f978467760828de3"],
  ["test/fixtures/diff-a.arch", "a7bad45dcc57e01a854d130cf857857ae056546c8f8b37ddd5474f22c2cf1bb1"], // re-measured, see header
  ["test/fixtures/diff-b.arch", "aed751c9f9579dd29c93d4c0363c1f17428fc68f6e6003f59281824eacd7ff06"], // re-measured, see header
  ["test/fixtures/diff-circ-a.arch", "84d413c8733e5dae6fe6adf57a9ecea3ced920501be76a4175f225ea2e8a9974"],
  ["test/fixtures/diff-circ-b.arch", "c22679ed9da2f1386e64c665245bb8a4555ffb5e7f38010e5d4252c858a8f2f9"],
  ["test/fixtures/off-path-bypass.arch", "db9817836d83fc29efad66097ca383032c0c918d8ca4fabb23e2feed79f088a3"], // new fixture, see header
  ["test/fixtures/schedule-sheet.arch", "fd7706850384f0179d82a74abd64f4e0744de7705eb0ddf25aae71eb3617a24b"],
  ["test/fixtures/star30.arch", "e5cf06a13db022de20a0a085d113e38405b4ea1dd81325890fd9c8a68db6e539"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "2ee9feeb3f6ca7c09e51eee71ffb78272b3b09be7ccdccbf87a38a4ee1234cae"],
  ["test/fixtures/zones-wings.arch", "9375f1e04051120bf1d5734fe7a99a7dd828926d08993da28ec5b3d02a20591c"],
];
