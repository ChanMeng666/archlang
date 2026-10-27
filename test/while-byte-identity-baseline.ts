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
 *
 * 2026-10-26, plan-soundness PS2.11e: the rows of `garden-house`, `hillside-villa`, `library` and
 * `two-storey` (stair defects fixed in the source) and `test/fixtures/zones-levels` (new stair
 * warnings only) re-measured, with the same reasons as `./import-module-lets.test.ts`'s table.
 *
 * 2026-10-27, plan-soundness PS2.74: `museum` and `practice-office` re-measured, each accessible-WC
 * pan moved into the 400–500 mm band by one line (`./byte-identity-baseline.ts`, "Two examples
 * fixed: an accessible WC's pan"); swapped back with the rule off, the previous rows reproduce.
 */
// Re-measured 2026-10-23 (PS3.7): aquarium, corner-cafe, furnished-flat, gallery-l, hillside-villa, materials, museum, themed: chairs turned to the table they sit at, a real
// defect `W_SEAT_FACING_AWAY` found (ADR 0029 §6); the cause and the proof that nothing else
// moved are in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-24 (PS2.12): the annotation-collision examples (seven fixed examples and townhouse); why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11a/b): the twelve examples fixed for WC side clearance and tall units over windows, and test/fixtures/schedule-sheet (gains W_WC_SIDE_CLEARANCE, not edited); why, and the proof that nothing else moved, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-25 (PS2.11c, PS2.11d): hillside-villa, relational and tiny-house fixed for a transposed footprint or a parked leaf; why, and the swap-back proof, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (PS2.50): hillside-villa and tiny-house each lose one `W_FIXTURE_BACK_TO_ROOM` (a piece side-on or end-on to a wall, no longer read as its back to the room); nothing else moved, see `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (PS2.11e, PS2.46, PS2.54): the twenty examples fixed for a hob under a window, a hob beside a fridge, a hinged leaf over 1219 mm and a doorway approach read from the wall's face, and test/fixtures/off-path-bypass (its cabinet 250 mm off d_d's face gains `W_DOORWAY_BLOCKED`, not edited; its SVG, `describe()` and diagnostics are unchanged); why, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (PR #283 red-team round 1): the examples edited by its rulings (relational, hillside-villa, tiny-house, garden-house, terrace-row, and the widened `double` pairs of gallery-l, classroom-block and aquarium) and the summary of every example writing a `double` door (a person passes one leaf, so `describe()`'s clear width halves); why, in `test/byte-identity-baseline.ts`'s header.
// Re-measured 2026-10-26 (merging main@e432c24a, PR #280, into PR #283): garden-house, hillside-villa and library carry both PRs' example edits (the stair fixes and this PR's), each row the measurement with this suite's body; two-storey (and its recovery-corpus copy) is `main`'s row, unedited by this PR; why, in `test/byte-identity-baseline.ts`'s header.
export const BASELINE: ReadonlyArray<readonly [string, string]> = [
  // PS4.4: every row whose plan resolves re-measured once for the new totals key (gross internal area); see test/byte-identity-baseline.ts.
  ["examples/accessible.arch", "5f69fe78d45db6b096e3e7f4c44bfcdb537c4201d06fee8780e813112869f20c"],
  ["examples/aquarium.arch", "e66504b7142257fc5c1c76c6e1b2f04a68be43ce98ea12b5be242d8e29171521"], // re-measured for PS2.4, see header; PS2.10 dims fixed (byte-identity-baseline.ts); PS2.11e, see header
  ["examples/attached.arch", "07995653257dff5785f4fe210e3c4f6f9d6fc35165be2e5ae34df364079029dc"],
  ["examples/bungalow.arch", "cda041e6004160bf8b826158202f931b3b6457c88f8edd7dc147282163c1c283"], // PS2.11e, see header
  ["examples/classroom-block.arch", "809f674a9d48b528c5e9850768c92afe5d826c22783f1a18df610d8a88adb4f6"], // added with the example, re-measured for net area, see header; PS2.11e, see header
  ["examples/clinic.arch", "af780d4296064bdd7a1d81dfc776fa586520a26bfaed8295f3298ff91373ead5"],
  ["examples/corner-cafe.arch", "199a01c5d9fcbe38de99e8a87109a800428eee868b171404e81e2dfbb51a57ce"], // added with the example, re-measured for net area, see header
  ["examples/courtyard-house.arch", "e5a170e01d15451ed5a322d6eb9f8267a356f208fea829dfce19cd6d3e1a43ce"], // re-measured for PS2.4, see header; PS2.11e, see header
  // Re-measured 2026-10-20 (PS2.19), `describe()` only: "Utility" reads `utility` (`byte-identity-baseline.ts`).
  ["examples/furnished-flat.arch", "cdb42b5c1bee8dd931d9b99b1e338dd895e4cb5d2de1915de8a85f04a3fd444a"], // PS2.11e, see header
  ["examples/gallery-l.arch", "0e8f7696890b8f3e01211ecbc873996f49ba22fff103e349e8f4660b1417a1c2"], // PS2.10 dims fixed (byte-identity-baseline.ts); PS2.11e, see header
  ["examples/garden-house.arch", "2ebce59ad2ade8fd181400ff73c88b9e6ab3af4217c1341a63745bb64ca4243d"], // re-measured, see header
  ["examples/garden-loft.arch", "f273e4717a1afae1cd94ae0f62a7390ae603c7418fbe434e061e191aa98231a0"], // PS2.11e, see header
  ["examples/hexagon-pavilion.arch", "3078765cf03974518e0f2b3ea13585cca69ffbb86438f0899218c8a1c24a09a8"],
  ["examples/hillside-villa.arch", "9f493e8903437b74f50eb72fd227871d17c13a17b6bc9ccf7592d423f6908572"], // re-measured, see header; PS2.11e, see header
  ["examples/imports.arch", "3aa7b2d5f953e6df63059c368e391ee3ea58c097cd7dff358197a940f4946252"],
  ["examples/laneway-house.arch", "21459ebc71dbc508de2faae421b59ac48afd068dd1813adb6bf0595b9963fb3e"], // PS2.11e, see header
  ["examples/library.arch", "9354e572f6d9df8c04e9b3b0fee0fe15b5ddf87831e0feba28078aaa4158ba92"], // PS2.11e, see header
  ["examples/materials.arch", "635e4b1a04bb6497e1fff846708c3f28519c89b531f5ad14b363381344cad925"],
  ["examples/museum-wing.arch", "546b10dfb0204dbce454dff9e47713f32745285f4885e58a46b5faff23d10126"],
  ["examples/museum-wings.arch", "1149f0993df1cd719dcffd1d8c5c43c4ea6176c9a43b47954b23b3950bcc6f4a"], // re-measured, see header; PS2.11e, see header
  ["examples/museum.arch", "3eb89a03ff32698a0e11f9419f7d8bc6317ce66d2b660dd289d085cb4ecd36a4"], // PS2.11e, see header; PS2.74 source edit, see header
  ["examples/one-room.arch", "8c47e263f778993d69c2f85d07a24b3a62c0b96d9f17ccb5cd9ebf2af6fa0120"],
  ["examples/parametric.arch", "402cf58e4e122164928e6d875320e63b7be5c017396dce026ab8c73d4a0373ef"],
  ["examples/practice-office.arch", "f55654d5dd8db8243b7e46f3e9afe6ed8b265da11392f797608f5364d5c4d2b4"], // added with the example, re-measured for net area, see header; PS2.11e, see header; PS2.74 source edit, see header
  ["examples/relational.arch", "4c117d32d823ccbfa76734397cf58001d5b3fcf700a67ee52b493856c436f5b1"], // re-measured for PS2.4, see header; PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e, see header
  ["examples/sheet-notes.arch", "602cfd5f8e34268bf660dcad47b5cbf28332ddf92a119fba7317850ab9f9d798"], // re-measured, see header
  ["examples/studio.arch", "b64f7234dddc6527a0176033e82b38b70ad4fe84ca8df22b7a2e3269a1029553"], // PS2.11e, see header
  ["examples/terrace-row.arch", "6667da00528cdd4ee4f155586a049ad877f81b83178f5a18c85afef7a76a781d"],
  ["examples/themed.arch", "edd65eb6b725687bb30a7c956132e01bc2b9c57d772afaa9c234745af332f8bf"], // PS2.11e, see header
  ["examples/tiny-house.arch", "7dec52e5621d9af9dbdcf7cb73e58791705e6d976bbecf5ae59419c1c9a9ea17"], // PS2.11e, see header
  ["examples/townhouse.arch", "2ba4f5c6510c8c1c5b0dce5fda946532a49aa27d9d14668e8398903af71f3612"], // PS2.11e, see header
  ["examples/transit-hall.arch", "a9145858f1fb7a7f1a0f0aa86d53e115bfda51e68c2101b822913d7bdc97eed5"], // PS2.11e, see header
  ["examples/two-bed.arch", "4fb4b10d1cde2487691965ce44bb8eb7e210c785e026f586dbeaf853f1e5b610"], // PS3.6 source rewrite, see ./byte-identity-baseline.ts; PS2.11e, see header
  ["examples/two-storey.arch", "30fea74236f151947c7fec764e66b2f5a860ce6f71908a5a60fc68e87566837a"],
  ["test/fixtures/axes-grid.arch", "e6be5d70788d931cacaa8cb1db2c2c454c1532d01153b90e2427c125770e5559"],
  ["test/fixtures/chain30.arch", "df7e1343b01b2194505898df5017da81b58d8c840d01236ff75101f047396e43"], // new fixture, see header
  ["test/fixtures/dense-bays.arch", "9f4ad4538851a27b463113cd7e563823d185bc7e18b342fd9eebb45f2887992f"],
  ["test/fixtures/diff-a.arch", "33a377ed414748c1262bdfbd057d657f8dda607ff77be9d944d2daa5feb12b2a"], // re-measured, see header
  ["test/fixtures/diff-b.arch", "1d4aaebab314c77742fc16d68c8925aa629ae42e1253a2167e240a2f25849ab1"], // re-measured, see header
  ["test/fixtures/diff-circ-a.arch", "e5bebcb2ebee7d35409f726a36c6da902eb7f414cadc9b93adb6e5d8a014235d"],
  ["test/fixtures/diff-circ-b.arch", "e52a2d0d2299ddaa916dc6e204c21d5296ccc52f4eb7376591c78eef685191de"],
  ["test/fixtures/off-path-bypass.arch", "81ef92c32f98bc41635428f477b2cf7e59adea520e60892b5e39aa48fcbcaecf"], // new fixture, see header; PS2.11e, see header
  ["test/fixtures/schedule-sheet.arch", "15dc29228ea12dae7240ad843567f88218c5a57bd8838ea950b1a5792c2579a5"], // re-measured, see header; PS2.29: message text only, same code, same span
  ["test/fixtures/star30.arch", "74a3209110606543fb04c1932b2ec60a78526ccdd2a7205cdfe972719efac471"], // new fixture, see header
  ["test/fixtures/zones-levels.arch", "05693d9ec59a2c27dcf9c35c5b8d8d5a63969ee0931499b97305433324cb978f"], // re-measured for PS2.4, see header
  ["test/fixtures/zones-wings.arch", "392675a2abd9bc82b094fc768190979fabf814b22dbb8d4fbaf7de410570c35a"], // re-measured for PS2.4, see header
];
