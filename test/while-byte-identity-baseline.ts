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
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  ["examples/accessible.arch", "37750afda8d897db7e4e03b20db72ffe0873a840210eca21d494aaefa7cfc0a2"],
  ["examples/aquarium.arch", "58e77abe2d1295ae6fd8cdfbb6edc7ecb793987a7556c8438a579d6c62eab0aa"], // re-measured for PS2.4, see header; PS2.10 dims fixed (byte-identity-baseline.ts)
  ["examples/attached.arch", "591f4199087b7f7fcab65af3cab3f12dbe062456954e7ef0f02969a974d34b93"],
  ["examples/bungalow.arch", "5fddcfb20684e94f609c770e7632c207df253d8acdae244243327df6b926b7df"],
  ["examples/classroom-block.arch", "48ee65709fc9f1b2875c7b96fd680d03a8012811d0bd18bc4a3a45422f19fe79"], // added with the example, re-measured for net area, see header
  ["examples/clinic.arch", "fac5d9fab49df93fe8cbff6cc0bf26b9e84b1a32c26128e155d0eeb5da99feb1"],
  ["examples/corner-cafe.arch", "d6f003e95916a1865e9acc794bf46a3e4d543260148f9d93047178e58f9acaf3"], // added with the example, re-measured for net area, see header
  ["examples/courtyard-house.arch", "0a8139dc57b28932244423f227f5ea3d2dc07039afe2664324931a6ef4307449"], // re-measured for PS2.4, see header
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: "Utility" reads `utility` (`byte-identity-baseline.ts`).
  ["examples/furnished-flat.arch", "a8224a29788cfd4d004ff1b4d5ed651c21a3e712d288012e8bf08b5cf1f38f43"],
  ["examples/gallery-l.arch", "bdd079e16fb24fdd473e9ad39bd73b74fd3bf08e674f07de9401d5a0124f2009"], // PS2.10 dims fixed (byte-identity-baseline.ts)
  ["examples/garden-house.arch", "ca301c92f83194527199e06d809ad2e2be11f317fe2570cea14eec9884f769a1"], // re-measured, see header
  ["examples/garden-loft.arch", "eb6be0aa8496c054e6aad518d92f7603772b5740d6822bfcbad7a6d58ef4951d"],
  ["examples/hexagon-pavilion.arch", "edef621837ae7adb96218de65b346e231ffe0c006dcd72f70a7e8d3b14777858"],
  ["examples/hillside-villa.arch", "e8df383e5e44e84cf567cfb232ac0104e2669bcd5f4fd5d12bc64976ccc3e852"], // re-measured, see header
  ["examples/imports.arch", "f1b5ff9ee7189d217cd8df57d04a1af5d2876bbc69ec588be202f28c68f47a5b"],
  ["examples/laneway-house.arch", "8d4c82f4eee8df75a460d87b9178701b88a3f655a2fa789fb11dcaeeb8e99052"],
  ["examples/library.arch", "85e0a65732f435bace56035fb5f1dc0cec529e5e9d86c19b4e57d12a7e4de86c"],
  ["examples/materials.arch", "105c29274c00f439d77b07dfe2e035446019103e2a12cba3c43c1b3dd5aad9d4"],
  ["examples/museum-wing.arch", "6e01f37f15c674c544fac6651e9f3bd32d4d6e4865fdafba36ed97feca9ff33a"],
  ["examples/museum-wings.arch", "6c9d3bd413ac9b9c5cdc9404a68ff86930b763bec36bb902d208888a76a503f3"], // re-measured, see header
  ["examples/museum.arch", "06d8104e18fc14ab78c7a26227a8b7d7383119b853ff3f15438dcc60c7cc075d"],
  ["examples/one-room.arch", "e12596f5401f097b5cf431fda952e96fc6523d7ca6a97c1518ffe6dd64e72cbe"],
  ["examples/parametric.arch", "4b4e50a6118cdca922c93a88e9c783abe17fd7d29458e27f98f0400721c2c8c7"],
  ["examples/practice-office.arch", "469f2d99f8911d59d91d2e7c0fdfaf21628cb5cfc92d3a0f08634699d57e2012"], // added with the example, re-measured for net area, see header
  ["examples/relational.arch", "c478536cf718fc7b12bbc48a24857c2eedbbfbb9d80dfc4f57e11e192d092f57"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see ./byte-identity-baseline.ts
  ["examples/sheet-notes.arch", "0104550fc3b3a39a71c1a005da79c3db5ea10ae21d9739e11a6d1f18ee7b7420"], // re-measured, see header
  ["examples/studio.arch", "ed8513998b1bc62fa08d73a67c0897777ab68f186609896ae491b868adf463d8"],
  ["examples/terrace-row.arch", "7899ea115baf2f835b336b3fa19811131b6806b238c65d8e9dcdfca0a4ca4de9"],
  ["examples/themed.arch", "4e7c2e8038077ad9698c3e654e15f88ee89bf3468fe8261082dafcc018f24776"],
  ["examples/tiny-house.arch", "6d929b7b131350ca55f1e3d9fc2020ad0a17517588f35fc984ef37d3f4adc51d"],
  ["examples/townhouse.arch", "82df7bb4157fd9b4687a9e56aa3fc92fc185a21698e0072c2000ad847136360b"],
  ["examples/transit-hall.arch", "c9cd341de542893c026a75eab9251de869db96b405e334738ef535a170ff6a5d"],
  ["examples/two-bed.arch", "3eb3731a693055e708d480b93ab6309ae9b5ce7a4294643afa9639414dea5954"], // PS3.6 source rewrite, see ./byte-identity-baseline.ts
  ["examples/two-storey.arch", "797409712aeeae0265027797b238233aea0024dd7603e0de84fb2fd9e0352375"],
  ["test/fixtures/axes-grid.arch", "a0a729cd0ec5bbfd90353f47e0fc9d3ee45601b66dbb67df459f54165465e8ff"],
  ["test/fixtures/chain30.arch", "858da6001d3d8032a10d372a3dac4c4eae453ad898c4f930ec4dd09ad4d9c54a"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "01ec7328bb74d5e67b80e9c2301db4bdf6734542b398ba714a3c19807b1bfa57"],
  ["test/fixtures/diff-a.arch", "55aa08f8cc9c48bc3535b14e15cab82ac4002a88709c7bd691f171f74512308a"], // re-measured, see header
  ["test/fixtures/diff-b.arch", "36af79705f9dcbf671117c2d0cb263d309ec0540d7e689bcc6cc3bfaee4c6a8e"], // re-measured, see header
  ["test/fixtures/diff-circ-a.arch", "272184ab44393f0f5cf74f5ad7a41c65ee2e16fbaf837dd9d0a1fb40ab71a335"],
  ["test/fixtures/diff-circ-b.arch", "68ba4e31f6e1bcb57fda4bc7eefc2afba407b1e0038497fb4a65079be210864d"],
  ["test/fixtures/off-path-bypass.arch", "b8123c5f00d6ce700209f6c5f6a479847f0e5218cf99c8bb2d4af66006289415"], // new fixture, see header
  ["test/fixtures/schedule-sheet.arch", "f8bf3c2679d6c8803a39d6775d82af06e0127b1723ef7ecdb7e8363bf2fab121"], // re-measured, see header; PS2.29: message text only, same code, same span
  ["test/fixtures/star30.arch", "eb21a2460d3cd302bc0b470184924cb46c947fa9ca95a7d8d7cbda839f791761"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "3a6f8bc7115bcd0a1471ce008b984f5c121cafc3e8b4a8269f0dcc94af18ecb8"], // re-measured for PS2.4, see header
  ["test/fixtures/zones-wings.arch", "f7ee2a2b343dee5164a308b00204c546f3f8cfcfde21a32f128f58d5e2a1f072"], // re-measured for PS2.4, see header
];
