# PS2.11e (stair bullets), PS2.34 and PS2.15: stair safety, as built

Six validity-layer lint codes, on by default, appended to `LINT_RULES` in this order:
`W_SWING_OVER_STAIR`, `W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY`, `W_STAIR_HEAD_VOID`,
`W_STAIR_TOO_STEEP` (`src/lint/rules/stairs.ts`, a new `stairs` coverage family, "stair checks") and
`W_SHAFT_FOOTPRINT_MISMATCH` (`src/lint/rules/vertical.ts`, family `vertical`, beside
`W_STAIR_UNMATCHED`). Each is classified `invariant` in the equivariance oracle. The kitchen and door
half of PS2.11e is another PR.

## What each rule reads

Every fact is one the plan states: a stair's footprint (`at`, `size`), its flight width (`width`,
else the cross extent; the band is centred, as `stairGlyph` draws it), its `dir`, and the end it is
entered from (`tailEdge`, read off `_tail` through `place`); door sectors (`doorSwing`); wall bodies
(straight segments, a cased opening's span cut out; a curved wall is not measured); `void`s; room
floors; `ir.storeyHeight`; and, across storeys, the same id's run on the neighbouring stops. That last
fact is new on the building context: `BuildingContext.shaftNeighbours`, built in `buildingContexts`
(`src/lint.ts`) from the first run of each id per storey, as `verticalConnections` reads identity.

**Which end is owed a landing on a storey.** The end the flight is entered from there: its foot where
it goes `up`, its head where it comes `down`. A storey whose run goes `up` while the same id's run on
the storey below also goes `up` along the same axis (`townhouse`'s middle storey) is also owed the
head the lower flight arrives at, `oppositeSide(tailEdge(below))`, the edge `arrivalRuns` reads.

**The landing**: the square beyond that end, as wide as the flight and as deep as it is wide.
Approved Document K (2013) 1.20: "At the top and bottom of every flight, provide landings the width
and length at least as great as the smallest width of the flight" [V, the gov.uk PDF, read]. 1.21b:
kept clear of permanent obstructions [V]. Outside a dwelling, 1.23a: "An unobstructed length a
minimum of 1200mm on each landing" [V]. Dwelling or not is D6's reading (`judgesAsDwelling`:
`residential-basic` reads every plan as one).

| Code | Fires when | Source |
|---|---|---|
| `W_SWING_OVER_STAIR` | A hinged door's quarter-disc overlaps (more than a touch: rectangles taken in 1 mm) the flight; or the head landing; or, at the foot, the 400 mm strip across the flight (a dwelling) or the whole foot landing (elsewhere). A landing is read only as deep as its floor stands clear: a door behind the wall that cuts a landing short is not over it (that wall is `W_STAIR_NO_LANDING`'s report). On a storey the flight RISES from, only the part of the footprint lower than the door's head counts: the treads climb `storeyHeight` over the run, so a leaf 2100 mm tall swings under the high end. A stairwell (the `down` stop, or a storey the flight arrives on) is a hole: all of it. | AD K 1.24 and Diagram 1.8 (a dwelling's door may swing across the bottom landing only leaving at least 400 mm) [V]; 1.23b (elsewhere no door swings across a landing) [V] |
| `W_STAIR_NO_LANDING` | The clear depth beyond an owed end, across the MIDDLE HALF of the flight's width, is under the landing depth. Obstacles: wall bodies (a cased opening is cut out and passable; a door's closed leaf stands in the wall), a `void` at a foot, and the floor (the point halfway to the measured depth on the flight's centreline must lie in a room). The middle half keeps a flank wall drawn to the flight's edge, or a 50 mm half-thickness into it, from reading as a wall across its end. | AD K 1.20, 1.21b, 1.23a [V]; IRC R311.7.6 asks the same at least 36 in in the direction of travel [S] |
| `W_STAIR_SIDE_ENTRY` | A door or cased opening on a straight wall parallel to the flight, beside the part of the flight a person cannot pass under (the low part, to 2 m of rise, on a rising storey; all of a stairwell), with less than `min(minDoorWidthMm, its width)` of doorway past either end, and its wall face nearer the footprint than `minPathClearWidthMm` (700; 900 under `accessibility-advisory`). | AD K 1.20 (a flight is entered from a landing) and 1.11 (2 m headroom) [V]; the threshold is the ruleset's own least clear path |
| `W_STAIR_HEAD_VOID` | A `void` overlaps (more than 1 mm on both axes) an owed HEAD landing. A void drawn as the stairwell, over the footprint, is not judged. | AD K 1.20 [V]; the multi-storey research's B6 |
| `W_STAIR_TOO_STEEP` | A `stair` going `up`, on a plan that AUTHORS a height, whose run is shorter than the least run that climbs `storeyHeight`: the fewest risers no higher than `stairMaxRiseMm`, one going fewer, each at least `stairMinGoingMm` and, under a pitch cap, the riser over `stairMaxPitchRatio`. Fewer risers mean fewer goings, so the fewest is the shortest run, and the pitch only rises with more risers: one count decides. No trigonometry (the cap is a tangent). | Default 220/220, no cap: AD K Table 1.1, private stair (rise 150–220, going 220–300) [V], the most generous of the figures read, so a flight that fails it fails every code cited. `uk-`: 220/220 and note 1's 42° (0.9004) [V]. `us-`: IRC R311.7.5.1 7¾ in (196.85 mm), R311.7.5.2 10 in (254 mm) [S, jurisdiction handouts]. `cn-`: GB 50096-2011 5.7.4, 0.20 m and 0.22 m [S, gf.cabr-fire.com article-7235, the site the research already cites] |
| `W_SHAFT_FOOTPRINT_MISMATCH` | On two neighbouring stops of one id, reported on the upper: a lift car not in exactly the same footprint; a stair or escalator along the other axis, or overlapping by less than half of the smaller footprint; or two kinds of run. | No clause needed (the research's B6: a run that does not stand over itself is an inconsistent drawing; AD B 2.5a's protected stair "at all storeys" as the analogue [V there]). Half is this programme's threshold. |

Messages name a stair by the room it stands in (or where it stands) and its storey, never an id; a
door by the rooms it joins; a wall by its kind and line. Hints quote the stair's, door's, wall's or
void's id. No rule offers a machine fix: every remedy moves a stair or a door, a design decision.

## Decisions

- **Codes.** The defect corpus's proposed names were kept (`W_STAIR_TOO_STEEP`, not the brief's
  `W_STAIR_PITCH`: the defect is the steepness, and the corpus already named it). PS2.34's two
  checks are two codes (`W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY`): different geometry, different
  remedy.
- **The 3000 mm default** (ruling on PR #280): stated in each of the two rules' doc comments and
  catalogue entries; it only narrows what the swing and side-entry rules judge.
- **Height only where authored.** `ir.storeyHeight` is always resolved (3000 by default), but
  `describe()` states heights only when the plan authors one (`_heightsAuthored`). A warning that
  quoted a 3000 mm storey the author never wrote would be a number the plan's own summary does not
  carry, so the steepness rule judges authored heights only and files `no-storey-height` otherwise.
  The same default IS used to narrow the swing and side-entry rules (which part of a rising flight a
  leaf or a person passes under): there it only makes a rule quieter.
- **Pitch cap only in `uk-`.** The default is the universal floor; AD K's 42° is its own note.
- **Landing truncation for swings.** One defect, one warning: a door in the wall that cuts a landing
  short is reported as the short landing, not also as a swing over it: walls-first's L0 living-room
  door, in the partition the foot runs into (WT1), is `W_STAIR_NO_LANDING`'s report alone.
- **Side entry on a stairwell too.** On the upper storey the same geometry is a doorway onto a strip
  beside the well (CT1). PS2.56 keeps its broader intent (a room whose every door lands on an
  unwalkable strip, whatever stands there).
- **The brief's "B4"** for shaft continuity is the research's **B6** (B4 is the drain stack).
- **The oracle's building context.** `test/d4-oracle.ts` retyped `buildingContexts` while it was
  private, and the copy had gone stale (`storeyCount`); it now calls the exported function.

## Red-team round 1 (same PR)

- `minimumRun` declines bad ruleset overrides (a riser limit not finite or not above zero, a going
  negative or not finite, a pitch cap not finite or not above zero, a run past `MODEL_RANGE_MM`):
  closed form, one `ceil` and one correction, no loop; no `Infinity` or `NaN` reaches a message.
- The landing measure ran per door × stair (300 doors, stairs and walls: 69 s). It is now measured once
  per storey and shared by the rules (memoised on the lint context), and the work is a count,
  `MAX_STAIR_WORK` (2,000,000), charged before it runs; past it the storey files `stair-budget`.
  Stress plan (N doors, stairs and walls on one storey, `lint()` ms, one run of the three trees back to
  back on this machine): the reviewed head N 100 969, N 300 15744; after N 100 223, N 300 1471;
  `origin/main` (no stair rules) N 100 148, N 300 1407. (An earlier, busier run measured the reviewed
  head at 3102 and 69168.)
- Hints name a derived wall by its rooms (`wallRef`), a door without an authored id by the rooms it
  joins, and an `open between` opening by its clause, never by an id the author cannot write.
- The head a flight from below arrives at is read on the LOWER flight's footprint (it was read on this
  storey's, which differs when the runs are drawn apart); a three-storey test pins it.
- A curved wall near a landing: the landing is not judged and the `curved-landing-wall` skip is filed.
- Every stair twin is clean of its case's code under every profile (`stair-too-steep.clean`'s run is
  3900 mm, past the IRC's 3810); the twin check in `test/defect-corpus.test.ts` now runs under every
  profile, with a ledger of three clearance twins a stricter profile is right to warn. The cases
  `stair-too-steep` and `swing-at-stair-foot` carry one stair defect each (`swing-over-stair` keeps
  X5's door beside the well, which is the same door).

## What `lint()` cannot read

Nothing in these cards needed a fact `lint()` cannot read by law. Two facts it does not have, so two
limits: no handrail, balustrade or riser count is drawn, so the swing rule cannot tell a door at the
top of a stair under the IRC's exception (R311.7.6, no top landing where no door swings over the
stair [S]) from a missing landing; and a straight flight is the only stair (`stair` has no winders or
quarter landing), so a turn on a half landing is not modelled. GB 50016's evacuation-stair position
clause was not found (as the research recorded) and is not cited.

## Corpus movement

Measured with a sweep of every `.arch` in the repository (405 files), default and every profile, old
compiler against new: no SVG, `describe()` or `compile().diagnostics` moved, and every moved
`lint()` only APPENDED the six codes. Per rule, before the examples were fixed:

| Plan | Codes | Verdict |
|---|---|---|
| `examples/garden-house` | L1 `W_STAIR_SIDE_ENTRY` (study door 50 mm from the flight), L2 `W_STAIR_NO_LANDING` (head 550 mm from the north wall), L2 `W_STAIR_SIDE_ENTRY` (bedroom 2's door 50 mm from the well) | true; fixed: the flight is 800 mm wide, centred in the hall (750 mm each side) and starts 1100 mm off the north wall |
| `examples/hillside-villa` | L2 `W_SWING_OVER_STAIR` (audit X5), L2 `W_STAIR_SIDE_ENTRY` ×2 (linen and ensuite doors 50 mm from the well), L1 `W_STAIR_SIDE_ENTRY` (the entry–dining opening 400 mm from the flight) | true; fixed: the stair, now 2900 × 800 mm (a run that climbs the default 3000 mm storey at 220/220, audit X7), rises in the living room (x 1000–3900, y 4300–5100) to the gallery; the rug 100 mm shorter so it stops at the flight; the gallery's opening onto the landing narrowed to 1600 mm so a doorway's width of it stands past the stairwell's end; bedroom 2's door moved 1300 mm west, off the bed 450 mm in front of it, which the old route through the ensuite had hidden. `lint()` now says eight warnings: the walk to bedroom 2 is gone, the walk to the linen cupboard and the route from bedroom 2 to its ensuite are new (each a 700 mm door) |
| `examples/library` | `W_STAIR_NO_LANDING` (foot 850 mm from the south wall; a public stair 1400 mm wide asks 1400) | true; fixed: moved 1000 mm north |
| `examples/two-storey` | L1 `W_STAIR_TOO_STEEP` (2600 run, 2700 storey, audit X11), L2 `W_STAIR_HEAD_VOID` (audit X9) | true; fixed: run 2900 (the bare 220/220 minimum, 2640, was about 43°), its head 900 mm off the north wall; the void is the stairwell |
| `docs/gallery/two-storey` | L1 `W_STAIR_NO_LANDING` (head on the west wall) | true; fixed: moved 1000 mm east, 3500 run |
| `examples/townhouse` | `W_STAIR_SIDE_ENTRY` ×3 under `accessibility-advisory` only (doors 850 mm from the flight, under its 900) | true under that profile; no default change |
| `examples/two-storey` (fixed) | `W_STAIR_TOO_STEEP` under `us-` only (IRC 7¾ in / 10 in ask 3302 mm) | true under that profile; listed in `test/lint-profiles-residential.test.ts` |
| `examples/garden-house`, `examples/hillside-villa` (fixed) | `W_STAIR_SIDE_ENTRY` under `accessibility-advisory` only: 4 on garden-house (doors 750 mm from the 800 mm flight), 1 on hillside-villa (the gallery opening, 750 mm of it past the well, under the profile's 850 mm door) | true under that profile's 900 mm path and 850 mm door; no default change |
| first-contact townhouses (six) | see the audit table below | true |
| `test/fixtures/zones-levels` | `W_STAIR_NO_LANDING` ×2 (no room beyond either end) | true of the fixture; not edited |
| `test/keep-corpus/{widen-before,widen-after}` | `W_STAIR_NO_LANDING` (head 200 mm from the west wall) | true; fixed: the stair moved to `(1000,800) size 2000x900`, a line of the same bytes, so no room, partition `p`, keep residual or span moved; the drill's output is as before (design §9 note, `repro/README.md`) |
| `test/keep-corpus/paper` | `W_STAIR_NO_LANDING` ×2 (head 200 mm from the west wall) | true of the fixture; not edited, `keep-digests` row re-measured |
| `test/main-entrance-fixtures/n6-*` | `W_STAIR_NO_LANDING` (foot 800 of 900) | true; not edited |
| `test/recovery-corpus/two-storey` | the old example's two | true; the frozen copy is not edited |

No eval golden moved, so `eval/judge-fixture.json` is untouched. Every digest row that moved is
re-measured with its suite's own body and its reason stated in that table's header
(`test/byte-identity-baseline.ts`, `import-module-lets`, `while-byte-identity-baseline`,
`keep-digests`, `finish-furnish`, `taste-digests`); for the two unedited fixtures in the diagnostics
tables, the new payload with `lint()` stripped of the six codes reproduces each previous row. The
keep weak law's table (`test/keep-byte-identity-baseline.ts`) is never hand-edited: it was re-taken
with its generator (`test/keep-weak-law-gen.ts`, whose header now states that a later PR moving a
hashed output re-takes it that way, reason recorded), 17 rows moved and 8 added, listed in the commit.

**Clean twins lint clean** (ruling on PR #280). Three older stair twins carried a second real defect
the new rules saw, and were made sound: `swing-at-stair-foot.clean` (T1's foot, 275 mm from the
wall: the flight is 800 mm shorter), `swing-over-stair.clean` (X5's ensuite door stood 50 mm beside
the well: moved 400 mm west, widened to 800, the ensuite given a shower and basin, which also clears
its pre-existing `W_PATH_TOO_NARROW` and `W_ROOM_NO_FIXTURE`) and `stair-too-steep` (both sides: the
head had no landing, so the flight moved 700 mm east, and level 2 gained a store with a corner door,
which clears the pre-existing `W_ROOM_DISCONNECTED`; the pair still differs only in the run). Every
stair-safety twin now lints clean under the default ruleset.

## The audits' stair rows

| Row | Plan | Caught by |
|---|---|---|
| T1 | 2026-10-18 townhouse L0 | `W_STAIR_NO_LANDING` (foot 275 mm); the swing lies beside the foot, not across it |
| NT1 | 2026-10-24 L0 | `W_STAIR_NO_LANDING` (foot 250), `W_STAIR_SIDE_ENTRY` (150), `W_SWING_OVER_STAIR` |
| NT2 | 2026-10-24 L1 | `W_STAIR_NO_LANDING` (head 150) |
| RT1 | 2026-10-25 L0 | `W_STAIR_NO_LANDING` (foot 450) |
| RT2 | 2026-10-25 L1 | `W_STAIR_NO_LANDING` (head 100); `W_STAIR_SIDE_ENTRY` on the landing opening |
| OT1 | arm A L0 | `W_STAIR_NO_LANDING` (foot pocket 700 of 1000), `W_SWING_OVER_STAIR` (the leaf under the flight's low part) |
| OT2 | arm A L0 | `W_STAIR_TOO_STEEP` (2000 run, 2800 storey) |
| OT3 | arm A L1 | `W_STAIR_NO_LANDING` (head 200) |
| CT1 | arm B L1 | `W_STAIR_SIDE_ENTRY` (bedroom 2's door 150 mm from the well); PS2.56 stays open |
| CT2 | arm B L0 | `W_STAIR_SIDE_ENTRY` (150) |
| CT3 | arm B L0 | `W_STAIR_NO_LANDING` (foot 550) |
| WT1 | walls-first L0 | `W_STAIR_NO_LANDING` (foot 0 mm, on the partition's centreline) |
| WT2 | walls-first L1 | `W_STAIR_NO_LANDING` (head 100) |
| X5, X9, X11 | the showcase examples | `W_SWING_OVER_STAIR`, `W_STAIR_HEAD_VOID`, `W_STAIR_TOO_STEEP`; fixed |
| X7, X15 | hillside-villa, townhouse | not judged: neither authors a height; hillside-villa's run was lengthened to 2900 anyway, and X15 passes 220/220 at the default 3000 |

Also caught, not in a row: the 2026-10-24 and 2026-10-25 townhouses' runs are too short for their
2800 mm storeys under the default (`W_STAIR_TOO_STEEP`); the walls-first townhouse's is too short only
under the `cn-` and `us-` profiles.

**"Appended" holds per storey.** The six codes come after every older code within a storey's lint
output; on a multi-storey plan the storeys are concatenated, so a new L1 code precedes an older L2
code (13 corpus files). No existing diagnostic moved within its storey.

## Defect corpus

Stair safety 0/4 → 8/8; overall 59/73 → 67/77. The four cases are `done`; four pairs are new:
`foot-against-partition` (RT1), `head-against-wall` (RT2, NT2, OT3, WT2), `door-onto-flank` (NT1,
CT2, CT1) and `shaft-footprint-mismatch` (PS2.15). Each twin is lint-clean and taste-separated.
