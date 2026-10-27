# Defect corpus

The yardstick for the plan-soundness programme (`docs/plans/plan-soundness/README.md`, card PS1.1).
Each case is a minimal plan that compiles without errors and really contains one verified
architectural defect, pinned to the lint code that must report it. Each case has a clean twin that
differs only in the fix and must not raise that code, so a rule that fires everywhere fails too.
`test/defect-corpus.test.ts` reads this folder and prints the catch rate per class.

This is **not eval data**. Nothing here feeds `eval/` or `dataset/`, and the holdout rules in
`.claude/rules/eval-dataset.md` do not apply to it. Every plan was written for this folder from the
coordinates in `docs/plans/plan-soundness/audits/`, `evidence.md` and `repro/`, and from measurement
with the CLI. No source from outside this repository is copied in. The `repro/` files that were reduced
here stay where they are.

## Layout and header

`<class>/<case>.arch` is a defect case and `<class>/<case>.clean.arch` is its twin. Every file starts
with a block of `# key: value` lines, which the test parses. A line `#` followed by two or more spaces
continues the previous value. The block ends at the first line that does not start with `#`.

| Key | Defect case | Clean twin |
|---|---|---|
| `class` | the folder name | the folder name |
| `origin` | where the defect was found (paths relative to `docs/plans/plan-soundness/`) | where the fix comes from |
| `expect` | the one `W_*` code that must report the defect | `none` |
| `status` | `todo` while no rule emits the code, `done` once lint reports it | absent |
| `twin-of` | absent | the case's file name without `.arch` |
| `fact` | the measured fact that makes it a defect (from `describe --json`, Plan JSON, the SVG or arithmetic) | the measured fact after the fix |

What the test asserts:

- every file compiles with no error diagnostics, and every header is well formed;
- a `done` case's `lint()` codes contain its `expect` code;
- a `todo` case's codes do **not** contain it yet. When a PS2 rule lands and a case starts to fire,
  the test goes red until the header says `done`, so the status column never goes stale;
- a twin's codes never contain its case's `expect` code, whatever the case's status, under the default
  ruleset and under every profile (but for the rows of the test's `PROFILE_LEDGER`, each with why a stricter profile
  is right to ask more);
- every case has a twin and every twin has a case;
- an `expect` code that is not in `src/error-catalog.ts` is listed in one of the code tables below,
  and every code listed below is used by at least one case.

The catch rate (`caught/total`) per class and overall is printed when the test runs.

## Classes

The eight classes of README §1, most frequent first. The test reads the slugs from this table.

| Slug | Class |
|---|---|
| `openings-ignore-walls` | Openings across T-junctions and corners, overlapping each other, or with nibs under 100 mm |
| `space-not-enclosed` | A shared edge with no wall, walled floor with no room, a room outside the shell |
| `circulation-privacy` | Through-bedroom and through-bath routes, wet-room doors, the entrance into a private room |
| `missing-defining-contents` | A bedroom without a bed, a bath without a shower, a kitchen without a worktop |
| `clearances` | WC side clearance, wardrobe fronts, tall units over windows, blocked openings, pinches |
| `daylight` | Windowless living rooms (labelled or typed) and bedrooms |
| `stair-safety` | A door swing over a flight or its landing, no landing at a foot or head, a door onto a flight's side, a void at the arrival, a flight too steep, a shaft drawn in two places |
| `annotation-collisions` | Auto dimensions inside rooms, title-block overflow, labels over furniture, lying dimension text |

Two classes from `evidence.md` §3 have no cases, because no core lint rule can see them:

- **Names contradicting geometry.** A window id names a room it is not on. Ids carry intent and a core
  lint must not read meaning from them (ADR 0005), so the comparison belongs to the consumer.
- **Change blindness.** It is a property of an edit, not of one plan; PS4's `impact` and `keep` cover it.
  `space-not-enclosed/widen-after-outside-shell.arch` holds the one consequence a single plan can show.

## Codes named by the plan (PS2 table)

| Code | Card |
|---|---|
| `W_OPENING_AT_JUNCTION` | PS2.1 |
| `W_OPENING_OVERLAP` | PS2.2 |
| `W_CONNECTOR_AMBIGUOUS` | PS2.3 |
| `W_BOUNDARY_NO_WALL` | PS2.4 |
| `W_ROOM_OUTSIDE_SHELL` | PS2.4 |
| `W_ROOM_VIA_PRIVATE` | PS2.5 |
| `W_WET_ROOM_DOOR` | PS2.6 |
| `W_ENTRANCE_INTO_PRIVATE` | PS2.7 |
| `W_HABITABLE_NO_WINDOW` | PS2.8 |
| `W_ROOM_MISSING_DEFINING` | PS2.9 |
| `W_DIM_TEXT_MISMATCH` | PS2.10 |
| `W_WC_SIDE_CLEARANCE` | PS2.11a |
| `W_FURNITURE_OVER_WINDOW` | PS2.11b |
| `W_FOOTPRINT_TRANSPOSED` | PS2.11c |
| `W_LEAF_ACROSS_DOORWAY` | PS2.11d |
| `W_SWING_OVER_STAIR` | PS2.11e |
| `W_STAIR_NO_LANDING` | PS2.11e, PS2.34 |
| `W_STAIR_SIDE_ENTRY` | PS2.34 |
| `W_STAIR_HEAD_VOID` | PS2.11e |
| `W_STAIR_TOO_STEEP` | PS2.11e |
| `W_SHAFT_FOOTPRINT_MISMATCH` | PS2.15 |
| `W_HOB_FRIDGE_GAP` | PS2.11e |
| `W_LEAF_TOO_WIDE` | PS2.11e |
| `W_HOB_UNDER_WINDOW` | PS2.46 |
| `W_ACCESSIBLE_WC_SIDE_WALL` | PS2.74 |
| `W_EXIT_APPROACH_BLOCKED` | PS2.69 |

## Proposed codes

The plan names no code for these checks. One code per distinct check, in the catalogue's naming style.
The card that implements a check may rename its code; rename it here and in the cases' headers.

| Code | Check | Card |
|---|---|---|
| `W_FLOOR_UNASSIGNED` | A walled face less than 95 % covered by rooms (PS2.4's dual) | PS2.4 |
| `W_WARDROBE_FRONT_CLEARANCE` | Clear depth in front of a wardrobe under 600 mm (a declared `clear front`, or a profile figure: card PS2.60) | PS2.11 |
| `W_EXIT_SWINGS_INWARD` | A hinged exterior door that is an exit of a non-residential plan, swinging into the floor against the escape direction | PS2.16 |

Two checks extend existing codes instead of adding one: a desk in front of a leaf-less opening expects
`W_DOORWAY_BLOCKED` (`done` since PS2.11e read cased openings), and wall-thickness labels from `dims auto`
inside a room expect `W_DIM_INSIDE` (`todo`). PS2.12 did not widen `W_DIM_INSIDE`: every `dims auto` number on a
room floor is a thickness, `R` or `φ` call-out the renderer letters there by design, so the warning
would fire on every `dims auto all` plan and could only be cleared by dropping the openings chains.
Where the thickness tier writes its number is a drawing decision, card PS2.39; when that card moves
the number off the floor, this case is resolved there or retired.

PS2.12 shipped `W_TITLE_OVERFLOW` and `W_ANNOTATION_OVERLAP`. The second absorbed the proposed
`W_LABEL_COLLISION` (a room label over a symbol): one code for any text printed over a symbol or a
label, whether the text is a room label or a `dims auto` number.

## Notes from building it

- `clearances/bench-diagonal-pinch.arch` reproduces PS0.8 (the 500 mm diagonal past a bench that
  `W_PATH_TOO_NARROW` misses). The reduced repro, `bench-across-opening.arch`, does warn and is `done`.
- A window on an `arc` edge reports `room: null` in `describe` (`audits/archcanvas-public-examples.md`
  BB3), so the daylight twin of the solid bay is glazed on a straight wall. A rule that reads
  `windows[].room` would call a glazed bay windowless.
- The family-apartment label collision only reproduces at a fixed text size, so
  `annotation-collisions/label-over-bed.arch` is drawn on paper at 1:100. Without `paper` the label
  shrinks with the plan and the placer finds free floor.
- Defects with no PS2 check are left out rather than given a code: a kitchen as the only route
  (BB4), a garage opening into a study (X4), a WC on a pocket-door cavity (M3), an exterior wall used
  as a partition (T2), an indoor courtyard (CY1), and the `describe` bugs of PS0.
- The first-contact audit (`audits/2026-10-18-first-contact.md`, card PS1.2) adds one case per new
  shape. Instances whose shape an earlier case already holds get no second copy: the kitchens with
  no worktop (A7, H4, S3, T5, C8) are `kitchen-no-worktop`, the wall-thickness labels inside rooms
  (A10, H6, S5, C11, T8, K11) are `auto-dims-in-room`, K2 is `door-jamb-50-from-tee`, K3 is
  `door-fills-gap` and C5's staff WC onto a `uses kitchen` servery is `bath-door-off-kitchen`.
  `circulation-privacy/bath-off-open-plan` is S1's stronger variant: its kitchen sink stands 400 mm
  from the bath door. The audit's own instance (`first-contact-plans/3-studio.arch`) has its nearest
  kitchen fixture 2025 mm from the door, beyond the 1500 mm `wetDoorKitchenProximityMm` default, so
  it is silent: there a bath door onto a combined kitchen/living room is a taste question
  (`research/design-taste.md` R2), and no case is added that could never fire.
  Instances outside the eight classes, and those in a class with no check a card
  names (A6, S2 bed sides; A7 hob against a side wall; C6, C7, K8 accessible WC layout), are left
  out for the planner.
- PS2.11e (`W_HOB_FRIDGE_GAP`, `W_LEAF_TOO_WIDE`, `W_DOORWAY_BLOCKED` on a cased opening) marked
  `hob-against-fridge`, `single-leaf-2400` and `desk-in-opening` done; `single-leaf-2400`'s twin now hangs
  the 2400 mm doorway as a `door double` pair rather than narrowing it. Two pairs were added:
  `hob-under-window` (PS2.46: NC8, RS3, the hob halves of NA2 and RC4) and `bed-before-door-face` (PS2.54:
  the approach read from the wall's face, the bed `examples/themed.arch` held 250 mm before its bedroom
  door). `masked-route-patio-door` stays `todo` on its own code: its sofa now raises
  `W_DOORWAY_BLOCKED` at the hall's opening (T2), but the masked route it is about is
  `W_PATH_TOO_NARROW`'s. The two wardrobe-front cases stay `todo`: a front is a declaration
  (`clear front 600`, PS3.7) or a profile figure, never a default, and no standard read so far gives
  one (card PS2.60).
- `clearances/sofa-transposed` stays `todo` after PS2.11c: `W_FOOTPRINT_TRANSPOSED` judges a piece
  against its catalogued footprint, and a plain `sofa` has none until PS3.11. The rule's own case is
  `sofa-l-transposed` (RK4, RS4), whose `sofa_l` has one.
- The balcony masked-route case (PS0.10) is reported since the walk is judged from the main
  entrance (`describe().access.mainEntrance`): the balcony door is no candidate. The patio case stays
  `todo`: with no `site` its main entrance is refused, because the patio door opens into a public room
  and the door into the hall does not outrank it; declaring the street names the front door and both
  rooms are reported. Each `fact` gives the warning lint raised before only when that door was made a
  window.

## Adding a case

Reduce the defect to the fewest walls and rooms that still show it. Measure the fact with
`node dist/cli.js describe <file> --json` (or Plan JSON, `-f json`) and write it in `fact`. Write the
twin by changing only the fix, then run `npx vitest run test/defect-corpus.test.ts`.
