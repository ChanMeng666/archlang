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
 *
 * EVERY row re-measured once for net internal area (owner decision 2): `describe()` gains
 * `net_area_m2` / `totals.net_floor_area_m2`; SVG and lint unchanged except room schedules.
 * A hybrid run of this file, unedited, with `describe()` from the pre-change tree (`1eb1bf9`)
 * and `compile()`/`lint()` from the new one reproduces every old row except the plans that
 * set `schedule rooms`: the twelve examples (`aquarium`, `bungalow`, `clinic`,
 * `courtyard-house`, `furnished-flat`, `garden-house`, `hillside-villa`, `library`,
 * `materials`, `museum-wings`, `sheet-notes`, `transit-hall`) and
 * `test/fixtures/schedule-sheet.arch` and `zones-wings.arch`, whose SVG gains the
 * ROOM SCHEDULE's NET AREA column; their `compile().diagnostics` is byte-identical, and with
 * `compile()` too from the old tree they reproduce as well. The account is in
 * `./byte-identity-baseline.ts`, "EVERY row re-measured, once". The same schedule rows,
 * and only they, were re-measured once more when the AREA column took its owner-given label
 * `AREA (CENTRELINE, m²)`; no other row moved.
 *
 * Re-measured once more when net area became the room less every wall band on it (ADR 0027):
 * the rows of `aquarium`, `hexagon-pavilion`, `hillside-villa`, `materials`, `tiny-house` and
 * `townhouse`, whose `describe()` moves in its net figures only. Field by field in
 * `./byte-identity-baseline.ts`, "Six plans re-measured again".
 *
 * `classroom-block`, `corner-cafe` and `practice-office`, first measured without net area,
 * re-measured when it met them: `describe()` and the drawn NET AREA column only, diagnostics
 * byte-identical. Field by field in `./byte-identity-baseline.ts`, "Three example rows
 * re-measured when net area met them".
 *
 * Four rows re-measured when `W_PATH_TOO_NARROW` began naming a bottleneck door by the rooms it
 * joins instead of its id (the id stays in the hint): `examples/hillside-villa.arch` (field by
 * field in `./byte-identity-baseline.ts`, "names a door by its rooms") and the fixtures
 * `test/fixtures/chain30.arch`, `star30.arch` and `off-path-bypass.arch`, whose walks name
 * their doors (`off-path-bypass` also in its `W_FURNITURE_WALL_COLLISION`, which now names
 * "the exterior wall at y 2000" rather than `wall "w_s"`). `lint()` `message` text only: hashing the new SVG, `describe()` and
 * `compile().diagnostics` with the previous `lint()` reproduces each previous row.
 *
 * Two rows re-measured when a connector on a wall began to join the space off each face of
 * that wall, with an additive `straddles` (backlog C.4, plan-soundness PS0.1; field by field
 * in `./byte-identity-baseline.ts`, "read off the host wall's faces"). Hashing the new
 * `compile()` with the previous `describe()` and `lint()` reproduces each previous row: every
 * storey's SVG and `compile().diagnostics` are byte-identical.
 *   - `examples/hillside-villa.arch`: `describe()` gains `straddles` on `o_entry_dining` only.
 *   - `test/fixtures/schedule-sheet.arch`: `door on shell at 20%` is centred on the T where
 *     `part` meets the shell, (4000, 0). It used to join `living` and `bath` and the plan had no
 *     entrance. It is now `between ["exterior", "living"]` (each room covers 400 mm of the inner
 *     face's clear span, so room order breaks the tie), `exterior: true`, `straddles ["living",
 *     "bath"]`; `access` gains the entrance, both rooms' depths and bottlenecks, `circulation`
 *     is measured (it was `null`) and the caption names the entrance. `lint()` withdraws
 *     `W_NO_ENTRANCE`, its only diagnostic, and gains nothing.
 *     Two surfaces no digest here pins move with it, on this row and on
 *     `docs/plans/plan-soundness/repro/door-on-tee.arch` (no row): Plan JSON (`compile -f json`),
 *     whose edge for that door goes from `living`→`bath`, `interior` to `exterior`→`living`,
 *     `front`; and `lint()` under `accessibility-advisory`, which gains `W_PATH_TOO_NARROW` twice
 *     (one walk per room, 840 and 740 mm clear against the 900 mm minimum) now that a route exists.
 *
 * Three rows re-measured on 2026-10-18 (plan-soundness PS0.7) when the label classifier began
 * emitting `living`: `examples/relational.arch`, `themed.arch` and `two-bed.arch`. `describe()`
 * only — one room per plan gains `living` in `uses` and its `room_type` becomes `LivingRoom`
 * (field by field in `./byte-identity-baseline.ts`, "the label classifier emits living").
 * Hashing the new SVG, `lint()` and `compile().diagnostics` with the previous `describe()`
 * reproduces each previous row.
 *
 * Four rows re-measured on 2026-10-18 (plan-soundness PS2.5–PS2.7) when three circulation-and-
 * privacy lint rules were appended. `lint()` only, on `examples/two-bed.arch` (three
 * `W_ROOM_VIA_PRIVATE`), `test/fixtures/axes-grid.arch` (`W_ENTRANCE_INTO_PRIVATE`: its one
 * door from outside opens into "Right", a bedroom, beside a living room) and
 * `test/fixtures/chain30.arch` (28 `W_ROOM_VIA_PRIVATE`: rooms 2–29 are reached only through
 * the bedrooms before them, which is what the fixture is). Hashing each with `lint()` minus the
 * three new codes reproduces its previous row. `examples/garden-house.arch` moved because its
 * source changed (one door re-hosted, +3 bytes; field by field in
 * `./byte-identity-baseline.ts`, "the circulation-and-privacy rules"); its pre-edit source
 * under the new compiler, minus the new codes, reproduces its previous row. `two-bed`'s row moved
 * once more after the rules' review (their hint wording only; see `./byte-identity-baseline.ts`).
 *
 * Eight rows re-measured on 2026-10-18 for the opening rules (plan-soundness PS2.1–PS2.3): six
 * examples and two fixtures whose SOURCE was fixed with same-length edits, so `lint()` did not
 * move (field by field in `./byte-identity-baseline.ts`, "Six examples fixed for the opening
 * rules", and `import-module-lets.test.ts` for the fixtures). The new `lint()` with the previous
 * SVG, `describe()` and `compile().diagnostics` reproduces each previous row. `terrace-row` again
 * in the review round (`win_bath` moved, the drawing only, against `bc5c55f`, same proof).
 * The rows moved by both plan-soundness branches are re-measured on their merge, as recorded
 * in `./byte-identity-baseline.ts` (the last paragraph of its header).
 * Eleven rows re-measured on 2026-10-18 (plan-soundness PS2.8 + PS2.9), with this test's own
 * digest body. The room-contents rules move `lint()` only: hashing the new SVG, `describe()` and
 * `compile().diagnostics` with the previous `lint()` reproduces every previous row (the sweep and
 * field-by-field are in `./byte-identity-baseline.ts`, "the room-contents rules").
 *   - `test/fixtures/dense-bays.arch`: `W_HABITABLE_NO_WINDOW` on "Gallery" (`uses living`, no
 *     window at all in the plan). `test/fixtures/schedule-sheet.arch`: `W_ROOM_MISSING_DEFINING`
 *     on "bath" (a WC and a basin, no bathtub or shower). `test/fixtures/diff-a.arch`,
 *     `diff-b.arch`: `W_ROOM_NO_FIXTURE`'s hint only (it quotes the defining pieces). Fixtures
 *     are not fixed: each is pinned for what else it shows.
 *   - The seven examples `accessible`, `corner-cafe`, `hillside-villa`, `practice-office`,
 *     `relational`, `terrace-row`, `two-storey` also had their SOURCE fixed for the defects the
 *     rules found (listed there), so their rows carry those edits too.
 * Six rows re-measured on 2026-10-19 (plan-soundness PS2.4), with this test's own digest body.
 * The space-enclosure rules move `lint()` only: hashing the new SVG, `describe()` and
 * `compile().diagnostics` with the previous `lint()` reproduces every previous row (the sweep
 * is in `./byte-identity-baseline.ts`, "the space-enclosure rules").
 *   - `test/fixtures/diff-a.arch`: `W_FLOOR_UNASSIGNED`, the 500 mm strip between "Bedroom"
 *     (to y 2500) and the partition at y 3000. `test/fixtures/zones-wings.arch`,
 *     `zones-levels.arch`: `W_BOUNDARY_NO_WALL` on every pair of rooms the fixtures draw with no
 *     partition between them. Fixtures are not fixed: each is pinned for what else it shows.
 *   - `aquarium` and `courtyard-house` also had their SOURCE fixed (listed there), and
 *     `relational` its header, so their rows carry those edits too.
 *
 * `examples/hillside-villa.arch` re-measured, with this test's own digest body, for
 * plan-soundness PS0.12 (a window on an arc edge is attributed from the shape): `describe()`
 * moves in one value, the bay window's `room` `null` → `"r_living"`. Every storey's SVG,
 * `lint()` and `compile().diagnostics` are byte-identical; the previous `describe()` put back
 * into the new payload reproduces the previous row. Field by field in
 * `./byte-identity-baseline.ts`, "a window on an arc edge is attributed from the shape".
 *
 * Fifteen rows re-measured, with this test's own digest body, for plan-soundness PS0.10
 * (`describe().access` names the main entrance): `bungalow`, `classroom-block`, `corner-cafe`,
 * `garden-house`, `hillside-villa`, `laneway-house`, `library`, `materials`, `museum-wings`,
 * `museum`, `parametric`, `practice-office`, `terrace-row`, `townhouse`, `transit-hall`.
 * `describe()` gains the appended `access.mainEntrance` (and `depthFromMainEntrance` on each room
 * when a door is named) on every storey with more than one entrance, and nothing else; every
 * storey's SVG, `lint()` and `compile().diagnostics` are byte-identical, and the previous
 * `describe()` put back reproduces each previous row. The fact per example is in
 * `./byte-identity-baseline.ts`, "`describe().access` names the main entrance". Thirteen of them
 * re-measured again in the PS0.10 review round (width no longer decides), `describe()` only:
 * the first measurement's `describe()` put back reproduces each first row. Seven again in review
 * round 2 (`bungalow`, `garden-house`, `hillside-villa`, `library`, `terrace-row`, `townhouse`,
 * `transit-hall`: the fact's basis or refusal), `describe()` only, the same way.
 *
 * 2026-10-20, plan-soundness PS2.19 and PS2.17: `furnished-flat` (its label-only "Utility"
 * reads `utility`, `describe()` only), then the eleven examples that gained a worktop
 * (`./byte-identity-baseline.ts`, "a worktop in every example kitchen"): the new compiler's
 * payload of each previous source, with the "no counter or worktop" findings removed, reproduces
 * each previous row.
 */
// Re-measured 2026-10-23 (PS3.7): aquarium, corner-cafe, furnished-flat, gallery-l, hillside-villa, materials, museum, themed: chairs turned to the table they sit at, a real
// defect `W_SEAT_FACING_AWAY` found (ADR 0029 §6); the cause and the proof that nothing else
// moved are in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (seven fixed examples and townhouse); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11a/b): the twelve examples fixed for WC side clearance and tall units over windows, and test/fixtures/schedule-sheet (gains W_WC_SIDE_CLEARANCE, not edited); why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11c, PS2.11d): hillside-villa, relational and tiny-house fixed for a transposed footprint or a parked leaf; why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (PS2.50): hillside-villa and tiny-house each lose one `W_FIXTURE_BACK_TO_ROOM` (a piece side-on or end-on to a wall, no longer read as its back to the room); nothing else moved, see `test/byte-identity-baseline.ts`'s header.
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["examples/accessible.arch", "85e27237df00e50be8aa1b46cf4cf11f619b2bb1093b3fe3390dc7ceba87d609"],
  ["examples/aquarium.arch", "78bd4379d464fdaac2de9d08e97fd8b99693c9713a05c15eb1add904b69e3d85"], // re-measured for PS2.4, see header; PS2.10 dims fixed (byte-identity-baseline.ts)
  ["examples/attached.arch", "632df13a9d8ee99fe25a5b71a9df34597a2becd4e2c9ef69015d4ae38b63926b"],
  ["examples/bungalow.arch", "f0ac0395cefa2df1b94a60cf396c00029e3ae2a31d19e6ec61e99e8db2e42631"],
  ["examples/classroom-block.arch", "4e99994194840efe6dc2257a57719e4a3bc0a4378c152452926666c0e835514c"], // added with the example, re-measured for net area, see header
  ["examples/clinic.arch", "3c8b4aeaa4f1e90c8aff25bb17e820da3f89756d54c321c5ae7c6d79dc8ee97d"],
  ["examples/corner-cafe.arch", "8392dbffa52f6854d9406f8b7420d89cfac0c46e2ee6bc60e5b370f0d55e876e"], // added with the example, re-measured for net area, see header
  ["examples/courtyard-house.arch", "b8121deef02b164c787053ba145465fd33d045dd7d87d38691d4b47ce673883d"], // re-measured for PS2.4, see header
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: "Utility" reads `utility` (`byte-identity-baseline.ts`).
  ["examples/furnished-flat.arch", "65b0ffbc76086c3cd0396f1a690cba6cb7c60811841b91cb1befbb3e35228540"],
  ["examples/gallery-l.arch", "54b9ca169ce2163a1c75a399e49e2b5a6b60b3c8f8da7fd6e28179549374f94f"], // PS2.10 dims fixed (byte-identity-baseline.ts)
  ["examples/garden-house.arch", "061efca9f04557dae0bf7e272fe5b42daa09d869332f76c4b51ebf0d567cbd92"], // re-measured, see header
  ["examples/garden-loft.arch", "987374c0f15d2b23767305c536015cd60f91c3d2cef2304f6538b995c94e5003"],
  ["examples/hexagon-pavilion.arch", "891af8cd488c23db8001c962347fd41d29e021fda2d933a3b33d2b467b25cceb"],
  ["examples/hillside-villa.arch", "eeff7b8fa532f567c26cb473094ef6ff58648291b5875b75010e427fd505d333"], // re-measured, see header
  ["examples/imports.arch", "ef15afb9ec7f0c2d2e2685f137e5934c90ac41af0603c8a70199278ba2352845"],
  ["examples/laneway-house.arch", "abe288c68a810052245c81758241eb734189e257815c84c4eea5dc07be4ca358"],
  ["examples/library.arch", "8a36040b92af80972952125daf0b73a27454313ad3b2b47b86569f84c1a7a74e"],
  ["examples/materials.arch", "11159194446551253f972978abde8959a37a07fc52bfd92cd557884dffca540f"],
  ["examples/museum-wing.arch", "6833ec14e690c8a93e03f7021ef453ca877b3a524717afa63e1b77cc4b986be3"],
  ["examples/museum-wings.arch", "703c2614c7321c513055892eaaeacdd8cc9f9407837500d3678f39033c8bd6cb"], // re-measured, see header
  ["examples/museum.arch", "b4226b78babacfe1a8d56e6d8ba2f64b46e20aab9dba533cb287fb947f3a2794"],
  ["examples/one-room.arch", "95f9283ff6b02f3c39fd09d3e7a76ce977b06e5cb3095e5bdecd911a86e887b4"],
  ["examples/parametric.arch", "2df383db4f3fd671faa3e5277ba0140409708ab45093008501119234cd756490"],
  ["examples/practice-office.arch", "5eda7af75b09b46be68f9b6ea545a1d1dbb94f38ac2658db826faf1388231e2f"], // added with the example, re-measured for net area, see header
  ["examples/relational.arch", "a22334f627579d184403c238a560059d0473b721ff3b04000955fbbad4e47de0"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see ./byte-identity-baseline.ts
  ["examples/sheet-notes.arch", "3f8154c12b87841ac58b2a9b4f44d6f3e723e7c5688f8857a279ddff4c8d2ce1"], // re-measured, see header
  ["examples/studio.arch", "f44a791a974b9f363ccf610656d42084a2d4ec27cf77055478f3622aabedf119"],
  ["examples/terrace-row.arch", "245a464047cebe8083df659a26f2c08259ca6e66f3e3431e3f047b7c1565689d"],
  ["examples/themed.arch", "70e8a38ff38f0585a17d4e430ffff6569b301a1468d2d03f1668ba3ba0086525"],
  ["examples/tiny-house.arch", "10541668c3377c88575621a16f10e8c31265bd159dca43cc748cfa7e3c000686"],
  ["examples/townhouse.arch", "19aaac944b66fd8b9a9d9ca9cd7764e95a1df3ad04d0c9cdbfa5039c45909d34"],
  ["examples/transit-hall.arch", "3f2f312a7cb40ac5f5e63d852f1c33a4738099488ca20fd70439e43d2ac219e1"],
  ["examples/two-bed.arch", "9fb86073236bea7574f0551f583dc05edb6bca91bc7cbe077b675d8d823d87ca"], // PS3.6 source rewrite, see ./byte-identity-baseline.ts
  ["examples/two-storey.arch", "22fab4467821c289f31e506222cfcf2630731888e4e24105d2912e50c74ceb1e"],
  ["test/fixtures/axes-grid.arch", "77d4b09d0c981d263ac921469314cccc8b9dc88d9fa18eef482633d167b0f785"],
  ["test/fixtures/chain30.arch", "2997088e815b2f8fae3c3f02187d843a397941e424519d773ca8d7df148cf8b7"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "4601b4bb1dc59a322e1f7af12b7b6d5f28567839c64832cd726d6ad27c0f7892"],
  ["test/fixtures/diff-a.arch", "0e7174a00b646e604a1c4eaec97a680cbfa828a9291d13bf0840c04ae42a3b95"], // re-measured, see header
  ["test/fixtures/diff-b.arch", "e0e70c1f605fad6611a4e1d4356a0902564b1bea546f721d9b71980457174703"], // re-measured, see header
  ["test/fixtures/diff-circ-a.arch", "7841d2c91e36047ee99c31b64bc2eac53f1ed5db4443ae01f031db36d088add8"],
  ["test/fixtures/diff-circ-b.arch", "b8ebc690809f823fe06939d013b0be7c7b340e533def45896719131317a83d72"],
  ["test/fixtures/off-path-bypass.arch", "6ca934556d7587a7c734e14506e0a8790be063d348adee5dd90a9bcf22cf932f"], // new fixture, see header
  ["test/fixtures/schedule-sheet.arch", "38c2bcf210494861de34861249b407aa87fecd9b7f4269dc445ecc0bbc2a8f76"], // re-measured, see header; PS2.29: message text only, same code, same span
  ["test/fixtures/star30.arch", "3278865463e62a7e5fdacdf5c9a91231a71849bb5ffa750c7c1ab412cb8852ae"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "7d45e53ca15b5a093ff00383694df8659f2245b8603f0930aec52e82c1135b1a"], // re-measured for PS2.4, see header
  ["test/fixtures/zones-wings.arch", "fa91773f3c3426cf62ea9bcd58e7e74bc3eb6a68f1419f68f3f49fd575292988"], // re-measured for PS2.4, see header
];
