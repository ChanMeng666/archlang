> Research record, 2026-10-26, against `main@747eed00` (PR #260; the last programme PR is #258), built CLI
> `archlang v1.43.1` (`dist/cli.js`). PS1.3; arm C of the 2026-10-26 run; compare with arm A of
> `2026-10-26-first-contact-rerun-d15.md`. Read observations as evidence and diagnoses as hypotheses:
> re-measure before you build on a number. Programme entry: `../README.md`. Protocol:
> `first-contact-protocol.md`. Card: `../cards.md` § PS1.3; question: `../README.md` § 8 Q1. The six plans:
> `first-contact-plans/2026-10-26-walls-first/`.

# Walls-first control arm (PS1.3): arm C of the 2026-10-26 run

The one thing that differs from arm A is a section inserted into the `arch-author` role text, before
"The authoring loop", verbatim:

> In this task you write the plan walls-first: draw every wall with explicit `wall` statements and host every door, window and opening on a wall with the `door|window|opening on <wall> at …` forms (or coordinates). Do not use `walls from rooms`, `wall … between`, `wall … around`, `door|opening between`, or `on <room>.<edge>` datums. Rooms are still declared with `room`; the walls are yours to draw.

## Headline

| Measure | 2026-10-26 arm A (rooms-first) | 2026-10-26 arm B (rooms-first, current role) | **2026-10-26 arm C (walls-first)** |
|---|---|---|---|
| Author role text | pre-#250 | current (post-#250) | pre-#250 plus the "Write walls first" section above |
| Verified defects (B / N / m), area basis judged as in the baseline | 52 (1 / 25 / 26) | 54 (1 / 20 / 33) | **54 (1 / 22 / 31)** |
| …without the area-basis rows | 49 | 51 | **52** (only 2 area rows: the apartment meets ~70 m² on GIA) |
| …of which final default `lint` reports | 0 | 0 | **3, plus 2 partial** (all on the two plans left with warnings) |
| Blockers | 1 (OT1: the townhouse stair is entered at its head) | 1 (CT1: townhouse bedroom 2 unreachable beside the stair) | **1** (WT1: the townhouse stair foot runs into the living partition's centreline; the only way off the foot is a doorway covering 550 of the 800 mm flight) |
| Class 1, openings ignore walls (final plans) | 0 | 0 | **0**; but the loops fired `W_OPENING_AT_JUNCTION` ×2 and `W_OPENING_OVERLAP` ×1, all repaired: the class appeared at the point of writing and lint (PS2.1–2.3) removed it |
| Class 3, circulation and privacy | 1 | 0 | 4 (2 caught by the café's standing warnings) |
| Class 4, defining contents | 6 | 10 | 8 |
| Class 5, clearances | 15 | 11 | 14 |
| Class 7, stair | 3 | 3 | 2 |
| Class 8, annotation | 8 | 9 | 10 |
| Furniture relation / transposed / door–door / other | 5 / 0 / 2 / 12 | 5 / 1 / 0 / 15 | 4 / 1 / 1 / 10 |
| Statement forms | 6/6 `walls from rooms`, 0 `wall`, 30 `door between` plus 1 `opening between` | 6/6 `walls from rooms`, 0 `wall`, 32 `door between` plus 1 `opening between` | 45 `wall`, 54 openings `on <wall> at`, 31 by coordinates; 0 `walls from rooms`, 0 `door between` |
| Sofas facing their TV | 0 / 2 | 1 / 2 | 0 / 3 |
| Café chairs facing away before → after the loop | before: `W_SEAT_FACING_AWAY` fired on the side chairs (no count given) → 0 / 24 | 18 / 24 → 0 / 24 | 24 / 24 → 0 / 24 |
| Hinged exterior doors opening the intended way | 7 / 7 | 7 / 8 | 9 / 9 |
| Authors who ran `score --taste` / `validate` / `describe` | 0 / 0 / 1 of 6 | 0 / 1 / 1 of 6 | 0 / 0 / 1 of 6 |
| CLI calls, compile / lint / describe / validate / score (shim log) | 27 / 37 / 1 / 0 / 0 (65) | 32 / 42 / 2 / 1 / 0 (77) | **31 / 34 / 1 / 0 / 0 (66)** |
| Authors who stopped with default-lint warnings standing | 0 of 6 | 0 of 6 | 2 of 6 (café 6, townhouse 1) |
| `score --taste generic`, final plans | 0.72 – 0.97, none capped | 0.71 – 0.98, none capped | 0.50 – 0.94; the café is capped at 0.50 (uncapped 0.95) |

Arm A is the like-for-like partner (same pre-#250 role base, same prompt, same model); arm B is shown
for the spread between two rooms-first runs. Read the columns by class and by blockers, not by the
minor count: the arms were audited by different auditor instances.

## Method

The same harness, the same day and the same commit as D15's two arms (`2026-10-26-first-contact-rerun-d15.md`
§ Method and commands): one headless `claude -p` dispatcher session (model sonnet, session
`e408c584-c3a6-48d9-8676-210b8413e8b4`, about $1.73 API-metered) started with a detached worktree at
`main@747eed00` as its working directory; six `arch-author` subagents dispatched in one message, one per brief,
model `claude-sonnet-5-5`, no follow-up message and no nudge; the protocol's per-brief prompt verbatim (it
names `compile|lint` only and says "stop when it compiles"); a logging shim at `dist/cli.js` counted every
CLI call. What differed from arm A: the role text was arm A's pre-#250 text (loaded as `compile → fix →
describe → lint`) plus the "Write walls first" section above, written over the file in the arm's worktree
uncommitted. The authors read `spec.llm.md` only (all six), unchanged: it leads with rooms. All six
complied with the instruction: 0 `walls from rooms`, 0 `door between`, 0 room-edge datums, 0 `facing`. The
plans were then audited by hand by one opus instance with the same brief and rubric as arms A and B
(geometry from Plan JSON, access from `describe --json`, default lint on the final plan, a render crop for every
blocker and orientation claim). Ids are `W` plus the plan letter (WA1, WH1, WS1, WC1, WT1, WK1).

## The loop each author ran

CLI calls are from the shim log, counted as compile / lint / describe / validate / score. "First lint" is the first
lint after the plan first compiled, read from the subagent transcripts; the clinic's was re-run from its first
`Write`, because the author read only the first 4 kB of it. "Form" counts the final plan's `wall` statements, its
openings hosted `on <wall> at …`, and its openings placed `at (x,y) … wall <id|category>`.

| Plan | Form | CLI calls (c / l / d / v / s) | First lint | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | walls-first: 10 `wall`, 12 `on <wall>`, 0 by coordinates | 4 / 6 / 1 / 0 / 0 | 7: `W_SWING_OBSTRUCTED` ×2, `W_DOORWAY_BLOCKED` ×2, `W_FIXTURE_FLOATING`, `W_OPENING_AT_JUNCTION`, `W_WC_SIDE_CLEARANCE` | 0 | 0.82 | 6 (0 / 3 / 3) |
| 2 House | walls-first: 10 `wall`, 9 `on <wall>`, 10 by coordinates | 9 / 6 / 0 / 0 / 0 | 9: `W_ANNOTATION_OVERLAP` ×3, `W_FIXTURE_BACK_TO_ROOM` ×2, `W_WC_SIDE_CLEARANCE` ×2, `W_PATH_TOO_NARROW`, `W_ROOM_MISSING_DEFINING` | 0 | 0.88 | 12 (0 / 5 / 7) |
| 3 Studio | walls-first: 3 `wall`, 2 `on <wall>`, 4 by coordinates | 3 / 2 / 0 / 0 / 0 | 8: `W_SWING_OBSTRUCTED` ×2, `W_DOORWAY_BLOCKED` ×2, `W_FIXTURE_BACK_TO_ROOM`, `W_OPENING_OVERLAP`, `W_WC_SIDE_CLEARANCE`, `W_FOOTPRINT_TRANSPOSED` (the author reports 9) | 0 | 0.94 | 6 (0 / 3 / 3) |
| 4 Café | walls-first: 5 `wall`, 4 `on <wall>`, 8 by coordinates | 3 / 5 / 0 / 0 / 0 | 33: `W_SEAT_FACING_AWAY` ×24, `W_WET_ROOM_DOOR` ×2, `W_ANNOTATION_OVERLAP` ×2, `W_WC_SIDE_CLEARANCE` ×2, `W_SWING_OBSTRUCTED`, `W_ROOM_MISSING_DEFINING`, `W_FURNITURE_OVER_WINDOW` | **6**: `W_FURNITURE_OVERLAP`, `W_SWING_OBSTRUCTED`, `W_WET_ROOM_DOOR` ×2, `W_ANNOTATION_OVERLAP` ×2 | 0.50 (capped; uncapped 0.95) | 11 (0 / 2 / 9) |
| 5 Townhouse | walls-first, two `level`s: 9 `wall`, 20 `on <wall>`, 0 by coordinates | 10 / 11 / 0 / 0 / 0 | 12: `W_PATH_TOO_NARROW` ×3, `W_FIXTURE_WRONG_ROOM` ×2, `W_ROOM_MISSING_DEFINING` ×2, `W_ANNOTATION_OVERLAP`, `W_FURNITURE_OVERLAP`, `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_WC_SIDE_CLEARANCE` | **1**: `W_ANNOTATION_OVERLAP` (L0 "Stair") | 0.89 | 11 (1 / 5 / 5) |
| 6 Clinic | walls-first: 8 `wall`, 7 `on <wall>`, 9 by coordinates | 2 / 4 / 0 / 0 / 0 | 7: `W_SWING_OBSTRUCTED` ×2, `W_DOORWAY_BLOCKED`, `W_PATH_TOO_NARROW`, `W_ROOM_MISSING_DEFINING`, `W_ANNOTATION_OVERLAP`, `W_WC_SIDE_CLEARANCE` | 0 | 0.86 | 8 (0 / 4 / 4) |
| **Total** | 6 / 6 walls-first: 45 `wall`, 54 `on <wall>`, 31 by coordinates; 0 `walls from rooms`, 0 `door between` | **31 / 34 / 1 / 0 / 0** (66) | 76 | 7 on 2 plans | 0.50 – 0.94 | **54 (1 / 22 / 31)** |

The only call beyond compile and lint: the apartment author's `describe --select totals`. No author ran
`validate` or `score`. The two plans left with warnings standing (café, townhouse) were stopped by their
authors as the prompt says ("stop when it compiles") and reported; in arms A and B all 12 authors linted to
clean. `validate --json` returns `next: null` on the four clean plans. On the townhouse `next` is the standing
`W_ANNOTATION_OVERLAP`. On the café it lists the same six warnings as lint.

## Forms used

- 6 / 6 walls-first: 45 `wall` statements (10 / 10 / 3 / 5 / 9 / 8, apartment … clinic); 54 openings `on <wall> at`
  (12 / 9 / 2 / 4 / 20 / 7); the 31 others by `at (x,y) … wall <id|category>`; `facing` 0; `walls from rooms`
  0; `door between` 0.
- Swing words: `into` 34, `inward` 6, `outward` 1, `in` / `out` 0. `hinge` 0 uses.

## Authoring friction

Compile errors the authors hit, from the transcripts and their reports:

- Clause order, `E_PARSE`:
  - `rotate` before `size` (apartment);
  - `in <room>` before `size` or `against wall` (apartment, townhouse);
  - `swing` before `wall exterior`, and the `garage` kind written after the placement (house);
  - `inset` before `flush` (house, café).
- `E_PARSE` on `door|window on w_ext at (x,y)` (house, 7 openings): coordinates do not pair with `on <wall>`. The author
  switched to `at (x,y) … wall exterior`.
- `E_FURN_SIZE`: `in <room> anchor` needs a `size` (studio, café, townhouse, apartment).
- `E_FURN_AGAINST`:
  - `against wall` without `side` or `in <room>` (apartment, studio, café);
  - a multi-segment ring without `segment <n>` (townhouse);
  - `side` not inferable (townhouse);
  - `segment 4 out of range (0..3)`: the townhouse author learned only from this error that segments are 0-indexed.
- `E_ATTACH_POS_RANGE` ×4 (café): door positions on partitions were written as plan x (9000, 11000), not as mm along the
  4000 mm run. `W_SWING_ROOM_NOT_ADJACENT` was a knock-on.
- Semantic traps that compiled:
  - The studio's first `door on ext at 900 from start` landed on the north wall, the closed ring's first point, across a window (`W_OPENING_OVERLAP`). The author switched to coordinates.
  - The clinic author found no way to host an opening on the closed exterior ring with `on <wall> at <pos>` and used coordinates.
- The clinic hit no compile error.

## Verified defects

Every Lint cell is the final plan's default lint; ids W* (arm C). Copied from the hand audit.

**1 · Apartment** (flat 10000 × 7400 plus a 1600 × 7400 corridor drawn as a room; plan total 85.84 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WA1 | The sofa faces the living/bedroom-1 partition 0 mm away, back to the room. The TV unit stands beside it on the same wall facing north, so nothing faces the TV | `sofa_1` x 100–1900, y 3250–4150, rotate 0, `wL` face 4150; `tv_unit_2` x 2100–3500, rotate 180; crop confirms the back rail on the north | N | **new** (relation) | MISSED |
| WA2 | The kitchen has no worktop and no fridge: the hob and a 1200 sink stand 50 mm apart on the north wall. The room is typed `uses living` only | `stove_5` x 3700–4300, `kitchen_sink_4` x 4350–5550, y 100–700; with `uses living dining kitchen` lint gives `W_ROOM_MISSING_DEFINING` (no counter) | N | 4 | MISSED (typing; taste R6 0.6 sees it) |
| WA3 | Bedroom 2's wardrobe front is 50 mm from the bed's long side, along 1600 mm of it. The wardrobe cannot open, and the bed has no access on that side | `double_bed_6` y 700–2300, x 7900–9900, rotate 90; `wardrobe_7` y 2350–2950, x 8300–9900, front north | N | 5 | MISSED |
| WA4 | The dining table has no chairs | `table_3` 1600 × 900, x 2000–3600, y 1650–2550; no seat in the plan | m | 4 | MISSED |
| WA5 | The common corridor is drawn as a room of the plan, with its own exterior walls and an exterior door. The plan's total is 85.84 m², and the author reported 85.8 m² as "above the ~70 m² target" | `corridor` x 10000–11600 `uses circulation`; `wC` exterior 200; `door_2` at (11600,6000); `describe` totals 85.84 incl. 11.84 | m | **new** (context) | MISSED |
| WA6 | Wall-thickness text inside rooms | "200" in the living room (950,380); "100" in bedroom 2 (5800,1600) | m | 8 | MISSED |

Area basis: the flat is 10000 × 7400 = 74.0 m² centreline and 9800 × 7200 = 70.6 m² GIA, so "~70 m²" is met on both. No
area-basis row is filed. The 85.84 m² total is WA5. Door offsets on the right-to-left `wN` were checked. The balcony slider
lands at x 1700–3500 on the balcony (x 800–4400). `window on wN at 2200` lands at x 7000–8600, which is bedroom 2's only window.
The living room keeps its west window, so no row is filed.

**2 · House** (13500 × 9600 = 129.6 m² centreline, with a 21.0 m² garage)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WH1 | The L-sofa faces the hall partition 550 mm away, with its back to the room, turned 90° from the TV on the west wall | `sofa_l_1` x 600–3000, y 3300–4200, rotate 0; `w_h` face 4750; `tv_unit_2` x 100–500, rotate 270 (front east) | N | **new** (relation) | MISSED |
| WH2 | "Kitchen / Dining" has no dining table or chairs, and the house has no table anywhere. The room is typed `uses kitchen` only | furniture: sink, counter, stove, fridge; with `uses kitchen dining` lint gives `W_ROOM_MISSING_DEFINING` (no dining table) | N | 4 | MISSED (typing) |
| WH3 | The master double bed is flush in the south-east corner. There is no bedside on the east, the foot is 250 mm from the north partition, and the head runs 350 mm across the south window | `double_bed_13` x 8150–9950, y 7500–9500; `w_x10` face 9950; `w_y72` face 7250; `window_6` x 6700–8500 | N | 5 | MISSED |
| WH4 | The beds in bedrooms 2 and 3 are flush in the north-west corners, each long side across the whole west window | bed 2 y 4850–6850 against `window_4` y 5400–6600; bed 3 y 7250–9250 against `window_5` y 7800–9000; both x 100–1600 | N | 5 | MISSED |
| WH5 | The garage is too short for a car: the up-and-over door is on the long east side, so the car stands crosswise in 3350 mm | internal x 10050–13400 × y 100–5950; `door_10` garage y 1800–4200 on x 13500 | N | **new** (advisory size) | n/a |
| WH6 | The TV unit stands wholly in front of the living room's west window | `tv_unit_2` y 1600–3200 at x 100–500; `window_2` y 1500–3300 | m | 5 | MISSED |
| WH7 | The hob stands 100 mm from the fridge, and 400 mm of it sits under the north window | `stove_5` x 8600–9200, `fridge_6` x 9300–9900; `window_3` x 7200–9000 | m | 5 | MISSED |
| WH8 | The utility is reached from the house only through the garage | edges kitchen–garage (`door_8`), garage–utility (`door_9`); its other door is exterior (`door_11`) | m | 3 | MISSED |
| WH9 | The front door's open leaf parks 350 mm in front of the master doorway, over 350 mm of it | `door_1` x 3800–4800, hinged at x 4800 (crop), open leaf along x 4800, y 8500–9500; master door face 5150, y 7950–8850 | m | **new** (door–door) | MISSED |
| WH10 | Room names print across walls and door swings. The author shortened or pinned four labels to clear `W_ANNOTATION_OVERLAP`: "Bath" and "4.3 m²", pinned at (6100,5800), print on the bath door's swing; "Bed 3" (was "Bedroom 3") at (2500,8400) prints its area on the bed-3 door swing; "Bedroom 2" runs across the bed-2/hall partition | `label "Bath" at (6100,5800)`; `w_x33` at x 3300; crop confirms | m | 8 | MISSED |
| WH11 | Wall-thickness text inside rooms | "100" in the kitchen against the ensuite WC (8500,4400); "200" in the garage (11700,400) | m | 8 | MISSED |
| WH12 | "~110 m²" is met only on centrelines on the habitable floor | 129.6 − 21.0 = 108.6 m² centreline; GIA 13300 × 9400 = 125.0 less the garage's 3400 × 5900 = 20.1, about 105 m² | m | **new** (area basis) | n/a |

The bath and ensuite have no exterior wall. They are internal bathrooms, which is fine, and the author noted it. Every
habitable room has glazing.

**3 · Studio** (6000 × 5000 = 30 m² centreline)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WS1 | There is no sleeping alcove: the double bed is flush in the north-west corner of the one room. Its head runs 1000 mm across the north window, its long side 400 mm across the west window, and the nightstand stands at the bed's foot | bed x 100–1700, y 100–2100; `window_1` x 700–2300; `window_2` y 1700–3300; `nightstand_2` x 1800–2300, y 1800–2200 | N | 5 / brief | MISSED |
| WS2 | The kitchenette is a single 1800 counter, with no sink, hob or fridge. The room is typed `uses living` only | `counter_3` x 100–1900, y 4300–4900; with `uses living kitchen bedroom` lint gives `W_ROOM_MISSING_DEFINING` (no sink, no stove) | N | 4 | MISSED (typing; taste R6 does not see it) |
| WS3 | The basin stands directly in front of the WC, 0 mm from the pan over its west 200 mm. The WC's cistern stands 200 mm off the back wall, because the corner anchor's `inset 200` (added to clear `W_WC_SIDE_CLEARANCE`) applied on both axes | `wc_5` x 4450–4850, y 300–1000 (wall face 100); `basin_6` x 4250–4650, y 1000–1500; crop confirms | N | 5 | MISSED |
| WS4 | The entry takes 15 % of the flat and holds nothing | entry 1800 × 2500 = 4.5 m² of 30 | m | **new** (space efficiency) | n/a |
| WS5 | Wall-thickness text inside rooms | "200" in the studio (2130,270); "100" in the bath (4430,1980) | m | 8 | MISSED |
| WS6 | "30 m²" is met only on centrelines | GIA 5800 × 4800 = 27.8 | m | **new** (area basis) | n/a |

The sofa is drawn correctly: `sofa` x 2350–4150 sits on the north wall, faces south into the room, and has no TV in the brief.

**4 · Café** (12000 × 7500 = 90 m²; 24 chairs at six 4-tops, a 3500 bar with six stools)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WC1 | The staff WC opens straight into the kitchen | `door_4` on `p_kit` x 8600–9400, swings into `staffwc` | N | 3 | **CAUGHT** `W_WET_ROOM_DOOR` |
| WC2 | Accessible WC: there is no grab-rail wall, the basin is out of reach from the pan, and the door swings in. The pan was centred (`bottom-right` → `bottom`) to clear `W_WC_SIDE_CLEARANCE` | pan centreline x 9000, 950 mm to both side faces (8050, 9950); basin y 5050–5450, pan front y 6700; `door_3` swings into `accwc` | N | 5 (accessible) | MISSED |
| WC3 | The accessible WC opens straight onto the seating (as NC6) | `door_3` on `p_main` y 5750–6750 | m | 3 | **CAUGHT** `W_WET_ROOM_DOOR` (left standing by the author; the rule cites a residential code) |
| WC4 | The staff-WC door leaf strikes the WC | 776 mm from the hinge against an 800 leaf | m | 5 | **CAUGHT** `W_SWING_OBSTRUCTED` |
| WC5 | The hob is drawn 700 wide and 1200 deep, with its front to the south: the range meant for the west wall was never turned. It is flush on the west partition, with a 500 mm gap to the worktop | `stove_2` `size 700x1200`, rotate 0, x 8050–8750, y 100–1300; `p_main` face 8050; `counter_5` from x 9250; crop confirms the stretched glyph | m | 5 / **new** (transposed) | MISSED |
| WC6 | The kitchen has no wash-hand basin | sink, stove, fridge, 1500 counter | m | 4 | MISSED |
| WC7 | Chairs stand back to back 400 mm apart, both between tables and between rows | east chair x 2400–2800, next west chair x 3200–3600; row-1 south chair y 4200–4600, row-2 north chair y 5000–5400 | m | 5 | MISSED |
| WC8 | The "entrance on the corner" is a door 600 mm from the corner | `door_1` x 600–1800 on the south wall | m | **new** (brief) | n/a |
| WC9 | The kitchen has no outside door: deliveries and refuse cross the seating to the only entrance | `describe` `access.entrances` = `["door_1"]`; the kitchen opens only to the seating, the staff WC and the store | m | **new** (zoning) | n/a |
| WC10 | Room names print over fixtures and across a wall. "Staff WC" and its area print over the WC. "Accessible WC" prints over the basin and runs across the WC/store partition into the store | "Accessible WC" spans about x 8000–10300; `p_store` at x 10000; crop confirms | m | 8 | PARTIAL (`W_ANNOTATION_OVERLAP` names both overprints, not the wall crossing) |
| WC11 | Wall-thickness text inside rooms | "200" in the seating (6020,400); "100" in the kitchen (8440,1780) | m | 8 | MISSED |

The bar has a 900 mm staff aisle behind it (`bar_counter` y 1000–1700, north wall face 100) with its stools on the customer
side, so no counter-zoning row is filed. The 50 mm counter/sink overlap that `W_FURNITURE_OVERLAP` reports is a sink set in a
worktop run. It is not counted.

**5 · Townhouse** (two `level`s, each 5500 × 10000; stair `st` at (4500,200), 800 × 2800, on both levels)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WT1 | The stair has no landing at its foot. The bottom tread runs to the living-room partition's centreline, so the flight overlaps the wall's 50 mm half-thickness over its last 250 mm of width. The only way off the foot is the living-room doorway, which covers 550 of the 800 mm flight; descending with that door shut, you stand on the last tread against the door | `st` y 200–3000, `dir up`, foot at y 3000 (crop: "UP" at the south end); `gp1` centreline 3000, face 2950; `door_4` x 4150–5050, swings into living | **B** | 7 | MISSED |
| WT2 | The stair head arrives 100 mm from the north exterior wall. The way off is a 90° turn west onto the landing (the bedroom-2 door sits 450 mm beyond the well's south end) | L1 `st` `dir down`, top at y 200; `fx` face 100; landing free x 2050–4500 | N | 7 | MISSED |
| WT3 | The stair, and with it the whole first floor, is reached only through the living room: the hall opens to the living room and the WC, and the WC sits between the hall and the stair room | `stairhall` edge only to `living` (`door_4`); `hall` edges: exterior, `living`, `wc` | N | 3 | MISSED |
| WT4 | The sofa is a transposed footprint, as in NT3 and T3: drawn one seat wide and 2 m deep. It faces the kitchen partition 0 mm away and is turned 90° from the TV on the east wall | `sofa_3` `size 900x2000`, rotate 0, x 100–1000, y 4450–6450; `gp4` face 6450; `tv_unit_4` front west; crop confirms | N | **new** (transposed) | MISSED |
| WT5 | The kitchen's only worktop is one 600 mm module on the east wall. The sink, hob and fridge stand on the south wall with 200 and 300 mm gaps and no worktop between them | sink x 2800–3600, stove 3800–4400, fridge 4700–5300; `counter_8` x 4800–5400, y 7000–7600 | N | 4 / 5 | MISSED (presence only) |
| WT6 | Both bedroom beds are flush in a corner, with no bedside on the wall side. Their heads run across the south windows: 1300 mm in bedroom 1, 850 mm in bedroom 2 | bed 1 x 100–1700, y 7900–9900, `window_4` x 400–1800; bed 2 x 4000–5400 (east face 5400), `window_6` x 3650–4850 | N | 5 | MISSED |
| WT7 | The TV unit stands wholly in front of the living room's east window | `tv_unit_4` y 4000–5500 at x 5000–5400; `window_3` y 3950–5550 | m | 5 | MISSED |
| WT8 | No first-floor partition stands on a ground-floor wall | L1 `fp1` y 3500 (L0 walls at 3000 and 6500), `fp2` x 2000 over the hall (L0 `gp2` at 2500), `fp3` x 3200 over the living room and kitchen | m | **new** (stacking) | n/a |
| WT9 | Circulation takes about a fifth of each floor | L0 hall 7.5 + stair room 5.4 = 12.9 m² of 55; L1 landing 12.25 m² of 55 (2.24 of it the stair) serving three doors | m | **new** (space efficiency) | n/a |
| WT10 | Labels pinned to clear `W_ANNOTATION_OVERLAP` still overprint. "Stair" was pinned twice, finally at (4100,2700): its name and area print over the stair, and the area figure prints across the `gp1` line. "WC" was pinned at (3100,1000), off the basin and onto its door swing | `label "Stair" at (4100,2700)`, `label "WC" at (3100,1000)`; crop confirms | m | 8 | PARTIAL (`W_ANNOTATION_OVERLAP` names the stair overprint, not the wall line or the swing) |
| WT11 | Wall-thickness text inside rooms (both levels) | L0 "100" in the hall (2060,2610), "200" in the living room (5070,3590); L1 "100" (3590,4975) and "200" (5070,4930) in bedroom 2 | m | 8 | MISSED |

Both storeys are 5500 × 10000 and stack. The same-id stair footprint is on both levels. The ground-floor WC
(pan centreline y 2400, 550 to the south face) and the bathroom (pan centreline x 600, 500 to the west face) clear.

**6 · Clinic** (12000 × 10000 = 120 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| WK1 | No consulting room has a chair (for doctor or patient) or a basin: each has a desk and a couch only. The waiting room's only seats are two loveseats, four places for three consulting rooms (NK1, RK1 again) | furniture list; `desk` 1400 × 700 and `bed` 700 × 1900 per room | N | 4 | MISSED |
| WK2 | Accessible WC: there is no grab-rail wall, the basin is out of reach, and the door swings in (NK2, RK2 again). The pan was moved from the corner to the centre to clear `W_WC_SIDE_CLEARANCE` | pan centreline x 7000, 950 mm to both side faces (6050, 7950); basin x 7550–7950, y 8000–8500, pan front y 9200; `door_5` swings into `wc` | N | 5 (accessible) | MISSED |
| WK3 | The reception desk is reversed. The glyph's staff chair is on the south, so the receptionist sits with their back to the waiting room and the front door, and the counter side faces the corridor partition 350 mm away | `reception_desk_7` x 3400–5600, y 6900–7700, rotate 0; `pBot` face 6550; `door_8` x 2300–3700 at y 10000; crop confirms the chair | N | **new** (relation; K7's class) | MISSED |
| WK4 | Both waiting loveseats face the façade 0 mm away, backs to the room, each in front of a window | `loveseat_8` x 100–1900, `loveseat_9` x 4150–5950, y 9100–9900, rotate 0; wall face 9900; `window_4` x 900–2100, `window_5` x 4400–5600; crop confirms | N | **new** (relation) | MISSED |
| WK5 | The staff room's tea point is one sink, with no worktop or fridge. The author retyped the room `uses kitchen` → `uses office` to clear `W_ROOM_MISSING_DEFINING` | `kitchen_sink_13` 1200 × 600; `meeting_table_12` with drawn chairs | m | 4 | MISSED (silenced) |
| WK6 | Patients reach the staff room and the store: the waiting room's door opens onto the corridor that serves them (NK6, RK5) | `door_4` waiting–corridor x 2400–3600; the corridor holds `door_6` (staff) and `door_7` (store) | m | **new** (zoning) | n/a |
| WK7 | Room names print across a wall and a swing. "Accessible WC" runs across the WC/staff-room partition. "Staff Room" and "8.8 m²" print over the staff door's swing | "Accessible WC" spans about x 6430–8720; `b2` at x 8000; crop confirms | m | 8 | MISSED |
| WK8 | Wall-thickness text inside rooms | "200" in Consulting 1 (3360,470); "100" in Consulting 2 (4800,4130) | m | 8 | MISSED |

Both exits are hinged and swing inward: `door_8` into the waiting room and `door_9` into the corridor's east end. With
waiting at 21 m² and three consulting rooms, the occupancy is far below 60, so this is filed as on 2026-10-25 (acceptable),
not as K1. The `door_9` leaf parks along the corridor's north side (hinged at y 5000, crop), clear of every door.

## Then and now by class

Counts are the auditors' own; classes with two labels are counted under the first, as the earlier tables do.
Arms A and B are the columns of `2026-10-26-first-contact-rerun-d15.md` § Then and now by class.

| Class | 10-26 arm A (rooms-first) | 10-26 arm B (rooms-first, current role) | 10-26 arm C (walls-first) |
|---|---|---|---|
| 1 Openings ignore walls | 0 | 0 | 0 (the loops fired `W_OPENING_AT_JUNCTION` twice and `W_OPENING_OVERLAP` once, all repaired) |
| 2 Space not enclosed | 0 | 0 | 0 (no PS2.4 warning fired in the arm-C loops) |
| 3 Circulation and privacy | 1 (OA1, the hall opened over its whole length) | 0 (CT1, unreachable, is filed under 7 as `7 / 3`) | 4 (WH8, WC1, WC3, WT3; WC1 and WC3 caught) |
| 4 Defining contents | 6 (2 hidden by `uses living`, 1 by `uses kitchen`) | 10 (2 hidden by typing, 3 presence only, 1 made by deleting a wardrobe) | 8 (WA2, WA4, WH2, WS2, WC6, WT5, WK1, WK5; 3 hidden by typing, 1 by retyping) |
| 5 Clearances | 15 | 11 (2 accessible WCs) | 14 (WC4 caught; WC5 is also transposed) |
| 7 Stair | 3 (1 B, 2 N) | 3 (1 B) | 2 (1 B, 1 N) |
| 8 Annotation | 8 (6 thickness-text rows, 2 unlabelled-room rows) | 9 (6 thickness text; 2 made by pinning labels; 1 label over glyph-drawn chairs) | 10 (2 partial; 6 thickness rows; 3 made or kept by pinning or shortening labels) |
| new: furniture relation | 5 | 5 | 4 (WA1, WH1, WK3, WK4) |
| new: transposed footprint | 0 | 1 | 1 (WT4; plus WC5 under class 5) |
| new: door–door and leaf across a corridor | 2 | 0 | 1 (WH9) |
| new: other (brief, context, zoning, size, stacking, area, space) | 12 (3 area) | 15 (3 area) | 10 (2 area: house, studio) |
| **Total (B / N / m)** | **52 (1 / 25 / 26)** | **54 (1 / 20 / 33)** | **54 (1 / 22 / 31)**; 52 without the area-basis rows |

Of the 54, final default lint reports 3 (WC1, WC3, WC4) and names 2 more in part (WC10, WT10). All five are on
the two plans that ended with warnings standing. Taste reaches 1 (R6 sees WA2).

What the table says, by class:
- **Class 1:** 0 in the final plans of all three arms. Walls-first did not bring it back, but it did write it:
  `W_OPENING_AT_JUNCTION` fired twice and `W_OPENING_OVERLAP` once in the loops (the studio's
  `door on ext at 900 from start` landed on the closed ring's first point, across a window), and lint caught each.
- **Class 3:** 4 against 1 and 0. Two of the four are the café's accessible WC and staff WC opening onto the
  seating and the kitchen, which `W_WET_ROOM_DOOR` caught and the author left standing; the other two are the
  utility reached only through the garage (WH8) and the townhouse's first floor reached only through the
  living room (WT3).
- **Classes 4, 5, 7, 8 and the relation rows:** the same surviving defects as in the rooms-first arms (kitchens
  typed `uses living`, tables with no chairs, beds flush across windows, TVs in front of windows, the
  stair foot and head, thickness text on 6 of 6 plans). None depends on how the walls were written.
- **Blockers:** one in each arm, a townhouse stair each time (OT1, CT1, WT1), drawn differently.

## Q8: furniture turns and door swings

- **Seats at tables.**
  - The café drew 24 chairs in a `for` loop. Before the loop all **24 / 24** faced away: the author wrote `rotate 0` on the north chair, `180` on the south, `270` west and `90` east, and lint reported all 24 as `W_SEAT_FACING_AWAY`. One `sed` swap fixed them. Final geometry: **0 / 24** (north chairs rotate 0 face south onto the table, and so on).
  - The other tables:
    - The townhouse `dining_table` and the clinic staff `meeting_table` draw their own chairs.
    - The apartment `table` has none (WA4), and the house has no table (WH2).
    - The consulting desks have no chair (WK1).
  - `facing`: 0 uses.
- **Sofas facing their TV: 0 / 3.**
  - The apartment sofa faces the wall beside the TV (WA1).
  - The house L-sofa faces the hall partition, 90° from the TV (WH1).
  - The townhouse sofa is transposed and faces the kitchen partition, 90° from the TV (WT4).
  - Without a TV:
    - The studio sofa faces into the room correctly.
    - The clinic loveseats face the façade 0 mm away (WK4).
  - The studio author's `sofa_l 900x1800` was reported `W_FOOTPRINT_TRANSPOSED` and replaced by a correctly drawn `sofa`. The townhouse's transposed plain `sofa` is outside that rule.
- **Hinged exterior doors: 9 / 9 open the intended way.**
  - Dwellings swing into the hall or entry: apartment `door_1`, house `door_1` and the utility's `door_11`, studio `door_1`, townhouse `door_1`.
  - The apartment's modelled corridor door swings into the corridor (context, WA5).
  - The café front door swings `outward`.
  - The clinic's two exits swing inward; occupancy is under 60 (see the clinic note).
  - K1 did not recur.
- **Swing forms:** `swing into` 34, `inward` 6, `outward` 1, `in`/`out` 0. `hinge` was used 0 times.

## The auditor's judgement calls

- **No area-basis row for the apartment.** Its GIA is 70.6 m² (9800 × 7200), which meets the brief's ~70 m²; the
  85.84 m² total in `describe` includes a corridor drawn inside the plan, which is filed as WA5 (context). So the
  arm has two area rows (WH12 house, WS6 studio), and the "without area rows" figure is 52.
- **The café's accessible WC onto the seating** is counted as a caught minor (WC3, `W_WET_ROOM_DOOR` cites GB 50096, a
  residential code, on a café), for consistency with NC6 of the earlier audits.
- **The clinic's two inward-opening exits are not filed.** Occupancy is far below 60 (waiting at 21 m², three
  consulting rooms), as the 2026-10-25 audit judged; `door_9`'s leaf parks along the corridor's north side, clear of
  every door.
- **Not counted:** the 50 mm counter/sink overlap that `W_FURNITURE_OVERLAP` reports in the café (a sink set in a
  worktop run); the bath and ensuite of the house, which are internal bathrooms.

## Gaming and laundering observed

- **WC side clearance, three ways:**
  - The café and clinic accessible WCs were moved off their corner into the middle of the room to clear `W_WC_SIDE_CLEARANCE`. That deleted the grab-rail wall (WC2, WK2).
  - The studio WC was given a corner `inset 200` to clear the same rule. It moved 200 mm off its back wall and up against the basin (WS3).
- **Retyping:** the clinic staff room `uses kitchen` → `uses office`, to clear `W_ROOM_MISSING_DEFINING` (WK5).
- **Labels shortened or pinned to clear `W_ANNOTATION_OVERLAP`:**
  - House: "Entrance Hall" → "Hall", "Bedroom 3" → "Bed 3", "Master Bedroom" → "Master" and "Bathroom" → "Bath", three of them pinned. "Bath" and "Bed 3" now print on door swings (WH10).
  - Townhouse: "WC" was pinned onto its door swing, and "Stair" was pinned twice and left overlapping (WT10).
- **Deleted furniture:**
  - The townhouse author deleted the dining table once (`sed '/dining_table/d'`) to test `W_PATH_TOO_NARROW`, then re-added it.
  - No final plan lost a piece to clear a warning.
  - The studio's `sofa_l` became a `sofa`, a category swap that cleared `W_FOOTPRINT_TRANSPOSED`. The new piece is drawn right, so it is not counted.
- **Honest repairs:**
  - The house kitchen and the café kitchen gained a counter for `W_ROOM_MISSING_DEFINING`.
  - The café chairs were turned for `W_SEAT_FACING_AWAY`.
  - The townhouse sofa moved from `anchor left` to `anchor bottom-left` to clear a 150 mm `W_SWING_OBSTRUCTED`; it was already transposed (`size 900x2000`) before the move.
- **Doors swung outward to clear a warning:** none.
- **Warnings left standing:** the café left 6 and the townhouse 1. The role text allows "every remaining warning is a deliberate, justified choice". The café author justified `W_WET_ROOM_DOOR` on the accessible WC by the brief.

## Tool facts (not counted as defects)

- **Townhouse `describe`:**
  - The top-level `caption`, `rooms` and `totals` cover level 0 only (5 rooms, 55 m²).
  - Level 1's `access` reports `entrances: []`, and bedrooms 1 and 2 `reachable: false`, while `vertical` connects `st` on both levels.
  - `circulation` lists the stair room as unmeasured (`no_threshold`).
- **Clinic:** `describe` reports a main-entrance tie (`door_8`, `door_9`), so lint's circulation family runs `partial` and privacy is skipped (`no-main-entrance`, plus `non-dwelling`).
- **Apartment:** `describe` lists the balcony slider `door_8` as an entrance beside the corridor door. The main entrance is resolved correctly (`door_2`, basis `entry-room`).
- **Rules that exist but stayed silent on these plans:**
  - `W_FURNITURE_OVER_WINDOW` fired once, in the café's first lint. It was silent on both TVs wholly in front of windows (WH6, WT7) and on the bed heads and sides across windows (WH3, WH4, WS1, WT6).
  - `W_FOOTPRINT_TRANSPOSED` fires on `sofa_l` (studio loop) and is silent on a plain `sofa` (WT4) and a `stove` (WC5).
- **What `W_WC_SIDE_CLEARANCE` accepts:**
  - It accepts a centred pan in a room named "Accessible WC", so its repair removes the grab-rail wall (twice).
  - It accepts a pan moved off its back wall by a corner `inset` (WS3).
- **Corner `anchor … inset` applies on both axes:** the studio WC sits 200 mm off its back wall, and the clinic desks 300 mm off both walls.
- **Silent `grid` snaps** (PS0.25 again; the auditor wrote PS0.20):
  - The apartment bathtub `size 750x1500` is drawn 800 wide (x 7450–8250).
  - The house front door written at (4250,9600) is placed at x 4300.
- **Café `W_WET_ROOM_DOOR` on the accessible WC → seating** cites GB 50096 (residential) on a café. It is counted as WC3, for consistency with NC6.
- **Taste:**
  - R6 flags the café's `bar_counter` in a dining room as wrong use (a building-type false positive).
  - R6 is 1 on the studio although its kitchenette has no sink or hob: the lone counter in a `living` room is not judged.
  - House R3 is 0.5 because the kitchen is 3 doors deep through the living room.

## Repeats and new this run

Repeats of 2026-10-24 / 2026-10-25 findings:
- the kitchen hidden by `uses living` (NA1, NS1, RA2, RS2): WA2, WS2;
- the kitchen/dining room with no table, typed `kitchen` (NH1): WH2;
- a table with no chairs (NA4, NT8, RH6): WA4;
- a sofa facing a wall or away from its TV (NH2, NS4, RH1, RT4): WA1, WH1;
- the transposed `size 900x2000` sofa (NT3, as T3; RA3): WT4;
- beds flush in a corner, across windows (NA3, NT6, RA4, RH7): WH3, WH4, WT6;
- the missing alcove (NS3, RS1): WS1;
- the wardrobe front at the bed side (RH4): WA3;
- the basin in front of the pan (NT5): WS3;
- the garage too short (NH4, RH5): WH5;
- the hob beside the fridge or under the window (NS2, NT7, NC8, RC4): WH7, WC5;
- the accessible WCs (NC4, NK2, RC2, RK2): WC2, WK2;
- the WC onto the seating, caught again (NC6): WC3;
- no wash-hand basin (RC3): WC6;
- chairs back to back (RC6): WC7;
- the corner entrance (NC7, RC7): WC8;
- consulting rooms without seats (NK1, RK1): WK1;
- the reversed reception desk (RK3; K7): WK3;
- the waiting seat facing the façade (NK5): WK4;
- the clinic zoning (NK6, RK5): WK6;
- the front-door leaf parked before a doorway (NH5, RA6): WH9;
- the stair foot and head (NT1, RT1; RT2): WT1, WT2;
- context drawn inside the plan (RA1): WA5;
- labels pinned onto walls or swings (RT7, RK6): WH10, WT10, WK7;
- circulation share (NH8, RS5): WS4, WT9;
- thickness text on 6 / 6 plans;
- area basis (NH10, NS6, RH11, RS7): WH12, WS6.

New this run:
- a stair blocker again (WT1), after 0 on 2026-10-25: the bottom tread runs into the partition line, and the only way off is a doorway.
- the first floor reached only through the living room (WT3);
- TVs standing wholly in front of windows (WH6, WT7);
- the utility reached only through the garage (WH8);
- a café kitchen with no outside door (WC9);
- the staff WC opening into the kitchen, caught (WC1), and its leaf striking the pan, caught (WC4);
- a hob drawn 1200 deep, never turned (WC5);
- upper partitions on no lower wall (WT8; baseline T7);
- `W_WC_SIDE_CLEARANCE` laundered three times, two of them by centring an accessible pan;
- a staff room retyped to silence `W_ROOM_MISSING_DEFINING` (WK5);
- walls-first brought no class-1 defect back in the final plans.

## The D21 reading

Recorded in `../README.md` § 3 as D21 and as § 8 Q1's measured answer (reverse-if in D21).

- **Measured** on the same six briefs, the same day, the same model and the same spec, with one role section
  added: rooms-first (arm A) 52 defects (1 B), walls-first (arm C) 54 (1 B); without area rows 49 against 52; CLI
  calls 65 against 66; class 1 defects in the final plans 0 against 0. The difference is within what two
  auditor instances and authoring chance produce: arm B, rooms-first with the other role text, scored 54.
- **What walls-first cost:** three class-1 warnings at the point of writing (`W_OPENING_AT_JUNCTION` ×2,
  `W_OPENING_OVERLAP`), all repaired in the loop, so the defects D1/D5 make unwritable were written and then caught;
  45 `wall` statements and 54 hosted openings against 0 `wall` and 30 `door between` plus 1 `opening between` in
  arm A; two of six authors stopped with lint warnings standing (0 of 12 in the rooms-first arms), which the auditor
  counts as 3 caught and 2 partial. No class-2 defect (an unenclosed space: `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED`, `W_ROOM_OUTSIDE_SHELL`) fired in any arm-C loop, so the omission class D5 makes unwritable was not written by these six walls-first authors either; the three warnings written and repaired were class 1 (openings at a junction or overlapping).
- **Re-statement:** D1 and D5 hold as the form an author reaches for first (6 / 6 cold authors chose it unprompted
  in four runs) and as the form under which the omission class cannot be written (this arm shows six walls-first authors did not
  write it either, so the arm neither confirms nor refutes that cost). They are not a claim that
  rooms-first plans carry fewer surviving defects, because the surviving classes (clearances, defining contents,
  stairs, annotation, furniture relation) do not depend on how the walls were written, and the class they do remove
  is now also caught by lint. § 8 Q1 is answered to that extent; the open question stays whether a spec that led with
  walls would change the authors' choice (not run; it would measure the spec's pull, which the card already names).

## Candidate evidence

No new cards: each finding fits an existing one. Evidence lines were appended in `../cards.md` for PS2.11a, PS2.16,
PS2.30, PS2.34, PS2.36 and PS2.41 only.
- **PS2.34** (stair foot into a partition, exit across the flight): WT1 (the blocker), WT2.
- **PS2.36 / PS2.16** and a note under **PS2.11a**: WC2 and WK2, the accessible WCs centred to clear
  `W_WC_SIDE_CLEARANCE`, losing the grab-rail wall; a rule whose cheapest repair makes the accessible WC worse
  (WS3 is the same rule's other evasion, a corner `inset 200` that moved the studio WC off its back wall).
- **PS2.30:** WK5 (the clinic staff room retyped `kitchen` → `office` to silence `W_ROOM_MISSING_DEFINING`:
  silencing by retyping); WA2 and WS2 (kitchens typed `uses living` again).
- **PS2.41:** WH10, WT10, WK7 (labels over door swings and across walls; WC10 is the partial catch).
- **PS0.25:** the silent `grid` snaps (a bathtub `size 750x1500` drawn 800 wide, a door at 4250 placed at 4300). The
  auditor wrote the id as PS0.20; the id is PS0.25 (PS0.20 is a Plan JSON swing card), as the D15 audit corrected.

## Corpus, concordance, tiling probe (same commit, with the six plans in the tree)

`npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts`, raw:

```text
defect-corpus catch rate
  openings-ignore-walls: 16/16
  space-not-enclosed: 6/6
  circulation-privacy: 11/12
  missing-defining-contents: 5/5
  clearances: 11/19
  daylight: 4/4
  stair-safety: 0/4
  annotation-collisions: 6/7
  overall: 59/73

 ✓ test/defect-corpus.test.ts (441 tests)
taste concordance (A ∪ B ∪ C): 44 pairs — 40 ordered, 0 tied, 0 reversed (0 in the ledger), 4 unjudged
 ✓ test/taste-separation.test.ts (29 tests)
 Test Files  2 passed (2)
      Tests  470 passed (470)
```

- **Defect corpus.** 59 / 73, unchanged (this run adds no corpus case).
- **`npx vitest run test/rooms-tiling-probe.test.ts`.** 27 / 27, no re-pin: `first-contact-plans/` is an
  information root of the probe, never pinned.
- **The four tests that read `first-contact-plans/`.** `lint-dwelling-reading`, `main-entrance`,
  `room-too-small-by-use` and `swing-building` all pass (121 tests: 22, 63, 8 and 28).

## Files

- `first-contact-plans/2026-10-26-walls-first/<n>-<brief>.arch`: the six final plans as the cold authors left them.
  All six are byte-identical to the authors' files; none carried a CR byte, so unlike the arm-B café of the D15
  audit there is no line-ending normalisation (git stores LF, `.gitattributes`). The worktree folder was
  `2026-10-26-rerun-armC`; the card names `<date>-walls-first`.
- The lint, taste, validate, describe and Plan JSON outputs, the renders, the transcripts, the shim call log and the
  scripts were kept outside the repository.

## Confounders

These are the protocol's (step 10) plus what this run adds:
- **One role section added, but the spec did not change.** `spec.llm.md` still leads with rooms, so the arm measures
  walls-first authoring under a spec that teaches rooms-first. The card's open question (can the spec be shown to
  a walls-first author without teaching rooms-first) is not answered; a walls-first spec was not run.
- **Two of six authors stopped with warnings standing** (café 6, townhouse 1), as the prompt says ("stop when it
  compiles"). Arms A and B linted all 12 plans to clean, so the arms did not end the same way; the auditor counts
  3 of the 54 as caught by the final lint and 2 as partial.
- **One auditor instance per arm** (three in all: the same model, brief and rubric). The earlier arms' auditors filed
  26 and 33 minor rows; compare the arms by class and by blockers, not by the minor count.
- **Authoring chance.** One draw per brief per arm (six plans). The blockers are one townhouse stair in every arm,
  drawn differently; 52, 54 and 54 differ by less than the spread between earlier runs (57, 48 and 49).
- **The prompt names only `compile|lint` and says "stop when it compiles".** It is the protocol's prompt, used for
  all three arms; "0 calls to `score --taste`" measures this protocol, not an agent told to run the whole loop.
- **The role text is an uncommitted overwrite** in the arm's worktree (arm A's text plus the walls-first section); the
  loaded description was copied from the dispatching session's own agent listing, as the protocol's step 2 asks.
- **The authors ran through a logging shim** at `dist/cli.js`; the audit measured with the real build directly.
- **The author model** is `claude-sonnet-5-5`, inherited from the dispatching session; the earlier runs record the
  model only as `sonnet`.
