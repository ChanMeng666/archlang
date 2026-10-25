# Plan-soundness cards

The card tables and card texts of `README.md` §6, moved here on 2026-10-25 (D16) with the same
ids and status words. The README keeps the programme (§1–§5), the order (§7) and the rules for
this file (§8): pick the first `todo` card whose dependencies are done; a card that lands is cut to
its `done` line with its as-built note moved verbatim to a dated `research/` record. Status words:
`todo`, `doing`, `done` (at most three lines: id, title, status, PR, commit), `parked`. Paths are
relative to the programme folder (`docs/plans/plan-soundness/`). This file has no size limit.

### PS0 · Bugs found by the audit (independent; file and fix first)

Landed: PS0.1 (PR #196, da9b47b5), PS0.7 (PR #197, 1d92656f), PS0.10–PS0.12 (PR #211, fcb30748),
PS0.13–PS0.14 (PR #214, e736146f). Landing notes verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § PS0.

A done row's "record" is `research/2026-10-24-ps0-ps2-as-built.md`.

| Card | Bug (re-measure first; the evidence is in the cited file) | Status |
|---|---|---|
| PS0.15 | `describe()`'s net-area work has a cap per room but no total per plan. Measured by PR #214's red team on `aac48b2`: 200 distinct 45-wall × 60-tooth comb rooms, each under `MAX_NET_PROBE_WORK`, cost `describe()` 172.6 s (50 rooms 19.7 s; main 60.3 s for the same 50). `compile()` meets the drawing budget only when a schedule is drawn; `describe()` draws nothing (ADR 0022 §4), so the step budget is its only bound and the playground thread is still exposed. Add a per-call total (a count, charged before each room's walk; rooms past it omit the figure for the same reason) or make the per-room charge count against one plan-level meter. No shipped plan is near it. *Note 2026-10-25:* `lint --profile` with a net-area profile (`cn-`, `uk-`, `us-residential-advisory`, `roomAreaMeasure: "net"`, PR #248) and taste (R7 reads each habitable room's net floor) now run the same per-room net-area walk (shared memo with `describe()`), so the missing per-plan total bounds those paths too; first in this table because it is a bound, not a feature. Order of work: `handoff.md` § 4 | todo |
| PS0.2 | `compile -f json` (Plan JSON) drops arc segments; a round trip loses a bay and floats its window (`audits/archcanvas-public-examples.md` G2) | todo |
| PS0.3 | Multi-storey `describe`: upper-storey rooms report `reachable:false` though a stair reaches them; an exterior door on an upper storey counts as an entrance (`audits/showcase-and-examples.md` §5.10) | todo |
| PS0.4 | `diffPlans`: pure moves, re-hosted openings, a wall section | done (PR #238, 78b507c5) |
| PS0.5 | `furniture … against wall … in <relational room>` failed with `E_FURN_AGAINST`. As built: record § PS0.5 | done (PR #220, 6c6179c7) |
| PS0.6 | `suggest` connects an unreachable room to *any* reachable neighbour, a bedroom included (`src/suggest.ts` ~364-395), against `skills/archlang/SKILL.md`'s own advice. Rank by neighbour use (hall/circulation/living first, bedroom and bath last) | todo |
| PS0.8 | `W_PATH_TOO_NARROW` measures pinches on the 100 mm grid and missed a 500 mm diagonal between a bench and a jamb (`repro/gallery-bench-pinch.arch`, `audits/archcanvas-public-examples.md` GW3). Re-measure the case first: the repro lints with the warning in isolation | todo |
| PS0.9 | `describe` assigns a window between an enclosed room and a covered loggia to the loggia, so lint and describe disagree on bedroom windows (`audits/showcase-and-examples.md` villa-rotonda) | todo |
| PS0.13 | `W_ROOM_NO_CLEAR_PATH` was not equivariant under mirror x. As built: record § PS0.13 | done (PR #214, e736146f) |
| PS0.14 | `describe()`'s net-area integral was super-linear on a comb room. As built: record § PS0.14 | done (PR #214, e736146f) |
| PS0.16 | `set` value parsing: `parseSetValue` reads a bare identifier before `,`/`)` as a word (like `swing: out`), so `set door(width: W)` and `set door(width: hall.cx)` silently become the string "W"/"hall.cx" and have no effect, with no diagnostic (predates PR #221, found in its review; a door's explicit `width` overrides `set`, so the effect was never visible). Decide: a bound name or a dotted datum name as a `set` value is an expression; a bare word stays a word only for word-valued keys. Also: `set door(swing: inward\|outward)` is silently ignored like any unknown enum word there (PS3.8); fix it with this card | todo |
| PS0.20 | Plan JSON: a door carrying both `swing` and `swing_building` that contradict each other (e.g. `swing: "out"` with `swing_building: "outward"` where outward resolves to `in`) is accepted silently; `swing_building` wins on input and the `swing` value is never read (found in PR #229's review). Consider a warning on import, or document `swing` as informational there | todo |
| PS0.17 | `describe` keys: `outdoor` and `fences` are missing from `PER_STOREY_OPTIONAL_KEYS` (`src/describe.ts`), so `describe --level N` can leave another storey's surfaces standing, and from `DESCRIBE_KEYS` (`src/cli/commands-analyze.ts`), so `--select outdoor` is refused (found in PR #223, which added `derived_walls` to both; not fixed there) | todo |
| PS0.19 | A window's `facing` fact was not equivariant under a pure translation. As built: record § PS0.19 | done (PR #231, 6fde1d7f) |
| PS0.18 | Plan JSON round trip turns a label-only "Hall" into `uses entry`: the room classifies `uses hall`, `room_type` `Entrance`, and the projection maps `Entrance` back to `entry` (`src/plan-json.ts`), so the compiled-back plan's `describe()` differs. Found in PR #227, where `examples/relational.arch`'s new hall authors `uses hall` to round-trip. Decide the honest mapping (carry the classified `uses`, or map `Entrance` to the use that produced it). It applies inside a PS3.9 component body too, whose rooms go through the same projection (found by PR #232's red team) | todo |
| PS0.21 | Plan JSON has no member for `outdoor`, so a plan whose rooms tile only with an `outdoor` surface (a courtyard) loses it on the way out and comes back refused with `E_ROOMS_NOT_TILING`, at the root and inside a PS3.9 component body alike (found by PR #232's red team). Carry `outdoor` additively, or refuse the projection with a named code rather than emit a payload that cannot compile | todo |
| PS0.22 | `diffPlans` reports no change for a room reshaped inside the same bounding box with the same area (an L flipped inside its 3000×3000 box: `(0,0) (3000,0) (3000,1000) (1000,1000) (1000,3000) (0,3000)` → `(0,0) (1000,0) (1000,2000) (3000,2000) (3000,3000) (0,3000)`), because `geometryChanged` compares only area and bbox edges (`src/diff.ts`; found in PR #238). Acceptance: a vertex-set comparison reports it as reshaped; add this L case to `test/diff-fabric.test.ts` (PR #238 dropped it, since it documented the gap) | todo |
| PS0.23 | `diffPlans` pairs walls without a written `id=` by their positional auto id (`partition_3`), so inserting a wall ahead of them shifts the ids and mis-pairs them (found in PR #238). The positional pairing also yields false `re-hosted` lines for doors that never moved: e.g. per PR #238's red team, inserting `wall partition … { (1000,0) (1000,1000) }` before the first partition in `examples/studio.arch` gives three false re-hosts and three false wall lines. Separately, two courtyard rings get the same name (`the courtyard wall derived from the rooms`), so the summary is ambiguous and the `wall:${w.name}` antisymmetry key in `test/diff-laws.test.ts` would collide. Acceptance: pair unnamed walls by shape first, then fall back to position (doors, windows and openings pair by id the same way and should get the same treatment); name rings by a distinct hole index or by the rooms they enclose. `arch impact --against` inherits the positional-auto-id shift and the identical courtyard-ring names (found in PR #240) | todo |
| PS0.24 | The LSP's reference walk (`STATEMENT_EXPRS` in `src/cursor.ts`) misses two PS3.7 clauses, `against <room>.<edge> offset <expr>` and `clear front\|sides <expr>`, so rename and references skip a name read there (found in PR #239, whose `statementReads()` adds them for `describe --facts depends` only, leaving the LSP unchanged). Acceptance: add both clauses to the cursor table and extend the LSP references test to cover each. *2026-10-25:* both clauses were added to `src/cursor.ts` by PR #252 (486c9cb7; `test/cursor-exhaustive.test.ts` forced it once an example used them); the LSP references test for `clear front\|sides` is still missing; only that test is left | todo |
| PS0.25 | Grid snapping of a declared size is silent. *Intent:* `grid 100` turns `size 2750x7000` into 2800 with no diagnostic, so a storey grows 100 mm (RT3). Report the snap (a `W_` with the snapped value, or a `describe` note), and check that adjacent storeys' exterior rings coincide. *Acceptance:* a two-room `grid 100` plan of `2750` rooms reports the snap. The 2026-10-25 townhouse reports the 100 mm overhang. Source: `audits/2026-10-25-first-contact-rerun-row5.md`, where it was proposed as "PS0.20" (that id was taken) *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): `grid 100` snapped `walls from rooms exterior 250` to 300 on the arm-A and the arm-B house (Plan JSON says 300; the same source under `grid 50` keeps 250), and snapped 450 mm chairs to 500 mm, closing a 100 mm gap between chairs to 0 (OC3), with no diagnostic. The auditors wrote this card as "PS0.20" | todo |

### PS1 · The defect corpus (do this before PS2; it is the yardstick)

**PS1.1 · `test/defect-corpus/`.** `done` (PR #195, 3d255044)
- As built: record § PS1.1.

**PS1.2 · Fold the first-contact instances into the corpus.** `done` (PR #203, 90ae6bfd; two more cases in PR #233, 1a1efd9e)
- As built: record § PS1.2. The corpus is now 73 cases and the catch rate 59/73 (PS2.10, PR #243: 48/70; PS2.12, PR #245: two new pairs, 53/72; PS2.11a/b, PR #252: four `todo` clearance cases caught, 57/72; PS2.11c/d, PR #253: `leaf-across-doorway` caught, plus one new pair).
- *Open (carried from PS1.1):* should the corpus also feed `eval:ci` as a non-gating metric? Read
  `.claude/rules/eval-dataset.md` first: the holdout rules apply.

**PS1.3 · Walls-first control arm for §8 Q1.** `todo` (filed 2026-10-25 from the transcript audit: the
owner asked on 2026-10-18 to "用 CLI 循环比较'房间优先'和'墙优先'两种写法的缺陷率"; only the rooms-first arm
has ever run, three times.)
- *Goal:* the same six briefs, cold-authored under the same protocol, with the author told to write
  walls first (`wall`/`door at` forms only, no `room … walls from rooms`/`door between`), audited by
  the same rubric; the defect count per class beside the rooms-first arm (`audits/2026-10-25-first-contact-rerun-row5.md`).
- *Design:* reuse the D7 protocol and the D15 two-arm harness (one dispatch prompt, two role texts);
  unpaid local subagents; the plans land under `audits/first-contact-plans/<date>-walls-first/`.
- *Acceptance:* a dated `audits/` file with both arms' per-class counts and the authors' statement
  forms counted (`wall`, `door between`, `walls from rooms`); D1/D5 re-stated if walls-first is not
  worse.
- *Open:* whether the spec can be shown to a walls-first author without teaching rooms-first (the
  spec leads with rooms); if not, the arm measures the spec's pull, which is itself the D1 question.

**PS1.4 · Which diagnostic wording repairs best (§8 Q3).** `todo` (filed 2026-10-25 from the
transcript audit: asked by the owner on 2026-10-18, "什么样的诊断措辞最利于 AI 修复"; never studied.)
- *Goal:* measure, on the defect corpus, which message/hint wording an AI author repairs correctly
  in one pass: facts only ("the door's leaf parks 200 mm in front of the WC door") vs rule ("doors
  must not swing into another doorway's approach") vs fix instruction ("hinge the door on its other
  jamb") vs the current combination.
- *Design:* for each corpus defect case, give a local, unpaid author model the plan plus one wording
  variant, ask for the minimal edit, re-lint; count fixed / unchanged / broke-something-else per
  variant. Hold the model and the prompt fixed; vary only the diagnostic text. No paid eval.
- *Acceptance:* a dated `research/` file with the table and a wording rule for the catalogue
  (`lint-fix-texts` then pins it); the PS2.29 id-free rule folded in.
- *Open:* whether the result transfers across models; run at least two local models before writing
  the rule.

### PS2 · Validity checks that read existing facts (small, high yield)

Each is an advisory `W_*` appended to `LINT_RULES`, with catalogue entry, `explain` text, fix prose
(§4 format) and a defect-corpus case. Prototype checkers that found these defects exist in the
owner's audit scratch. Re-derive them from this text rather than asking for them.

Landed in three waves, 2026-10-19 to 2026-10-20 (landing notes verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § PS2). Corpus catch
rate 47/70 after the re-run (`audits/2026-10-24-first-contact-rerun.md`); 48/70 with PS2.10 (PR #243);
53/72 with PS2.12 (PR #245: three `todo` annotation cases caught, plus two new pairs); 57/72 with PS2.11a/b (PR #252: the four `todo` WC and tall-unit cases caught; clearances 9/18); 59/73 with PS2.11c/d (PR #253: `leaf-across-doorway` caught, plus the `sofa-l-transposed` pair; clearances 11/19).

A done row's "record" is `research/2026-10-24-ps0-ps2-as-built.md`.

| Card | Rule | Test (on the resolved plan) | Status |
|---|---|---|---|
| PS2.1 | `W_OPENING_AT_JUNCTION` | As built: record § PS2.1 | done (PR #201, cefe7e9f) |
| PS2.2 | `W_OPENING_OVERLAP` | As built: record § PS2.2 | done (PR #201, cefe7e9f) |
| PS2.3 | `W_CONNECTOR_AMBIGUOUS` | As built: record § PS2.3 | done (PR #201, cefe7e9f) |
| PS2.4 | `W_BOUNDARY_NO_WALL` | As built: record § PS2.4 | done (PR #204, 600eaaf6) |
| PS2.5 | `W_ROOM_VIA_PRIVATE` | As built: record § PS2.5 | done (PR #199, a7a1ac34) |
| PS2.6 | `W_WET_ROOM_DOOR` | As built: record § PS2.6 | done (PR #199, a7a1ac34; PR #203, 90ae6bfd) |
| PS2.7 | `W_ENTRANCE_INTO_PRIVATE` | As built: record § PS2.7 | done (PR #199, a7a1ac34) |
| PS2.8 | `W_HABITABLE_NO_WINDOW` | As built: record § PS2.8 | done (PR #200, cc165f4c) |
| PS2.9 | `W_ROOM_MISSING_DEFINING` | As built: record § PS2.9 | done (PR #200, cc165f4c) |
| PS2.10 | `W_DIM_TEXT_MISMATCH` | As built: record § PS2.10; PR rulings `research/2026-10-25-ps5-as-built.md` § PS2.10 | done (PR #243, b1f06577) |
| PS2.11a | `W_WC_SIDE_CLEARANCE` | As built: `research/2026-10-25-ps211ab-as-built.md` | done (PR #252, 486c9cb7) |
| PS2.11b | `W_FURNITURE_OVER_WINDOW` | As built: `research/2026-10-25-ps211ab-as-built.md` | done (PR #252, 486c9cb7) |
| PS2.11c | `W_FOOTPRINT_TRANSPOSED` | As built: `research/2026-10-25-ps211cd-as-built.md` § PS2.11c | done (PR #253, 43fe7fd6) |
| PS2.11d | `W_LEAF_ACROSS_DOORWAY` | As built: `research/2026-10-25-ps211cd-as-built.md` § PS2.11d | done (PR #253, 43fe7fd6) |
| PS2.11e | Clearance family, the remainder | The bullets that shipped as PS2.11a–d (WC centreline, tall unit over a window, transposed footprint, door–door interference) are cut from this card (PRs #252, #253). The rest sits in §7 row 6 (D14): front of a wardrobe ≥ 600; hob-to-fridge gap; a door swing over a stair footprint or its landing; a void at a stair's arrival; stair pitch versus storey height; `W_DOORWAY_BLOCKED` extended to leaf-less openings; a single hinged leaf over 1200 mm (and a double-leaf `door` kind, since authors fake one with two leaves that clash). Siblings filed from the a–d reviews: hob under a window PS2.46, per-family depth ceiling PS2.53, face/centreline unification PS2.54. Each is a separate code; split into cards as they start. Wardrobe front and bed sides are declarations or profile values, never defaults (PS3.7). Fresh instances still open: `audits/2026-10-18-first-contact.md` T1, T3, H2 (C4, A1 and K4 are caught by PS2.11c/d). *Part landed:* `W_SEAT_FACING_AWAY` (PR #228, 0d2dbc04); as built: `research/2026-10-24-ps0-ps2-as-built.md` § PS2.11. The other bullets stay open. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): wardrobe front RH4 *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OT2 (a flight of 2000 mm for a 2800 mm storey, about 54°, made by repairing a label warning: the stair-pitch bullet above, `height` being known); the wardrobe front OA4, CA4 and the hob-to-fridge gap OH3 | todo |
| PS2.12 | Annotation collisions | As built: `research/2026-10-25-ps5-as-built.md` § PS2.12 | done (PR #245, cbf6701f) |
| PS2.13 | Lint coverage report | As built: record § PS2.13 | done (PR #203, 90ae6bfd) |
| PS2.14 | Dwelling declaration | A zone-level marker that groups rooms into a dwelling, `describe().dwellings`, common area, and the derived party wall (the ladder rung). Needs an ADR. Unblocks the across-dwellings rule (GB 50096 5.4.4 / GB 55038-2025 4.1.7: a WC over another household's bedroom, living, kitchen or dining) and the shared-corridor checks. Corrects `research/design-taste.md` R19's default of "one level = one dwelling": that fires inside a single house and misses flats, so R19 runs only where dwellings are declared and otherwise reports a coverage skip (`research/2026-10-18-furniture-and-multistorey.md` B1, B9, B12) | todo |
| PS2.15 | `W_SHAFT_FOOTPRINT_MISMATCH` | Same-id stair/lift runs on adjacent storeys whose footprints do not overlap. The facts exist already; ship with PS2.11e's arrival-void check (`…multistorey.md` B4) | todo |
| PS2.16 | Egress necessary-condition checks | `uk-residential-advisory`: `W_INNER_ROOM` (ADB 2.11/2.12, 3.7/3.8: a habitable room whose only route to the exit passes through another room, with its exemptions). `us-residential-advisory`: bedroom escape-window failures provable from gross sizes (IRC R310: width < 508 mm, sill > 1118 mm, area < 0.33 m²); never a pass claim without an `openable` window fact (`…multistorey.md` B10–B11). A non-residential advisory profile for the same family: escape-door swing in the direction of travel and leaf type, exits on separate sides, public/staff zoning, accessible WC pan offset and basin reach (first-contact café and clinic, K1, K9, K10, C6, K8). Blocked on facts, not rules, and listed as such: wet-stack risers, fire ratings, protected-stair enclosure, sprinkler-dependent limits | todo |
| PS2.17 | Kitchen worktop | As built: record § PS2.17 | done (PR #216, 8bbdd699) |
| PS2.18 | Profile scoping of dwelling-reading rules | As built: record § PS2.18 | done (PR #217, 06c6b563) |
| PS2.19 | Vocabulary gaps | As built: record § PS2.19 | done (PR #216, 8bbdd699) |
| PS2.20 | Furnish: shower and tub placement | After PS2.9, 44 of 1,600 fuzzed baths are left empty because neither the stage's candidates nor the lint's placement search finds a tub or shower position, where the previous main wrote a WC and basin. Measure what those rooms have in common (size, door and window positions) and extend the candidate set (a shower in the corner the door does not swing into; a tub along the long wall with the door at its foot) before anyone concludes the rooms are too small | todo |
| PS2.21 | Enclosure budget follow-ups | From PR #204's final red-team: (1) the point-test charge assumes every curve crosses every other (`piecesBound ≈ 2c²` × ring vertices), so a plain round room drawn with ≥ 300 vertices is refused on `point-tests` although it crosses nothing; count only curve pairs whose boxes meet so finely drawn curved rooms stay measured (corpus max today is 56 vertices, aquarium's concourse). (2) The slowest admitted shape, a 50-partition × 30-tooth comb room, lints in ~1.6 s vs 0.44 s on main: bounded, not a hang, but twice the figure the PR body quotes. (3) `W_BOUNDARY_NO_WALL` sits outside the `FaceBudget` (ring × ring per room pair plus runs × wall segments), the same class as the ring-pair analyses `describe()` already pays; two interlocking 2000-tooth combs go 23 s → 35 s. Give it a count bound beside the existing ring-pair cost | todo |
| PS2.22 | `W_ALIAS_MATCH` quotes a room id | For a room with no label the alias rule classifies the id and then writes it into the message ('Room "r_carport" reads as a garage only from the indirect term "carport"'), the one lint message that names an id; PS2.19's fallback words widen it (`r_plant`, `r_boiler`, `r_cellar`, `r_linen`, `r_nursery`; found by PR #216's red team). Word the unlabelled case without the id (the room's storey and position, or "an unlabelled room") and pin that no lint message over the corpus contains a room id | todo |
| PS2.23 | Authored wall beside a derived line | An authored wall 1 mm (any non-zero distance) off a `walls from rooms` derived line is kept beside the derived wall, not merged (ADR 0028 §3 coexistence): two parallel bands nearly on top of each other. Lint it: an authored straight wall parallel to a derived segment, overlapping it along its length, whose centreline is closer than half the thicker wall's thickness, almost always meant to lie on the line (found by PR #223's red team) | todo |
| PS2.24 | Wall meeting an open run mid-span | An authored wall perpendicular to a `walls from rooms` `open between` run, ending on it mid-span, is neither refused (it is not collinear, so not `E_WALL_BETWEEN_OPEN`) nor excused: today it only warns through `W_OPENING_AT_JUNCTION` (a wall standing inside the opening). Decide the rule: refuse it as `E_WALL_BETWEEN_OPEN`, or a lint finding with its own hint (give the opening a `width` that clears the wall, or move the wall). No code yet (found by PR #224's red team) | todo |
| PS2.25 | `W_DOOR_NEAR_CORNER` disagrees with the junction measure | `W_DOOR_NEAR_CORNER` measures from a different point than the junction measure `E_OPENING_NIB` and `W_OPENING_AT_JUNCTION` share (`src/opening-junctions.ts`), so a relational door placed at the nib hint's "nearest legal position" (650 from end on a 400 mm host meeting a thinner wall) still warns. Fix: measure the corner from the meeting wall's face, or have the nib hint skip candidates that would warn. No code yet (found by PR #225's red team) | todo |
| PS2.26 | `W_SWING_OBSTRUCTED` at exactly 0 mm short | Under `accessibility-advisory` the rule fires on `examples/two-bed.arch` with a swing that needs 1050 mm of clear radius and measures 1050 mm ("0 mm short", found by PR #227's red team). The boundary should be `<`, not `≤`: decide, fix, and explain the corpus movement in that PR | todo |
| PS2.27 | `W_FACING_BLOCKED` | A declared `facing` whose front ray crosses a wall body before it reaches its target (a TV facing a sofa through a partition). Walls only: a coffee table between a sofa and its TV is the arrangement. Deferred from PS3.7 (ADR 0029) | todo |
| PS2.28 | Undeclared sofa → TV check | A sofa or loveseat in a room with a `tv`/`tv_unit` whose front ray misses it (the audit's A3, H2, T3: 3 of 3 sofas). Out of PS3.7's scope, which judges only seats at tables; measure the corpus first, and decide what a sofa facing a view instead means | todo |
| PS2.29 | Id-free lint messages | Iron law: a lint `message` never quotes an element id (ids go in `hint`). The 2026-10-23 drift audit found three codes that do: `W_OPENING_NOT_DIMENSIONED` (the opening's id), `W_POCKET_RUN` and `W_DOOR_NEAR_CORNER` (the host via `wallPhraseOf`, `src/wall-ref.ts`: `wall "<id>"`, or a derived partition by its room ids). A grep of `src/lint` adds, to confirm first: `ctx.labelOf` falls back to the room id for an unlabelled room, as do `circulation-facts.ts`'s connector and route phrases; `W_CIRCUITOUS_PATH` (entrance door id); `W_OUTDOOR_OVERLAPS_ROOM` and `W_BALCONY_NO_DOOR` (surface id); `W_ALIAS_MATCH` is PS2.22 (fold in); `W_ROOM_OVERLAP` quotes element ids (`Rooms "r_living" and "r_bath" overlap`) and is a compile-channel warning (found in PR #240). `W_ROOM_TOO_NARROW` and its passage phrase quote the room id through the same `labelOf` fallback for an unlabelled room (PR #248, `src/lint/rules/per-room.ts`); taste messages likewise (`namesOf`, `src/taste/criteria.ts`; ADR 0032 decision 6). *Acceptance:* `test/lint-fix-texts.test.ts` asserts that no internal id appears in any `message` over the corpus: element ids, room ids of unlabelled rooms, and the derived names `A\|B`, `A\|B:open`, `exterior` and `exterior#n`; the same holds for `W_ROOM_OVERLAP`'s `message` over the corpus's `compile().diagnostics`. Every moved corpus `lint()` row explained | todo |
| PS2.30 | Room use inferred from contents | A room holding a kitchen sink, stove or fridge but not typed `kitchen` (or untyped) gets `W_ROOM_USE_MISSING`, or the kitchen rules run on the inferred use. NA1, NS1, NC1. NC1 shows that deleting the type is the cheapest way to silence `W_ROOM_MISSING_DEFINING`. **Acceptance test: the exact laundering.** The final café (`first-contact-plans/2026-10-24-rerun/4-cafe.arch`) has `service` untyped, and lint reports only `W_WET_ROOM_DOOR`. Restoring `uses kitchen` on `service` brings back `W_ROOM_MISSING_DEFINING`: "Counter" is furnished (bar counter) but has no kitchen sink, no stove and no counter or worktop. The card is done when the untyped room gets the same finding. `bar_counter` does not count as the worktop in that message, and the card should keep it that way. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RA2, RS2 (2 / 6 kitchens typed `living` again); RS2 adds a laundering route, deleting the worktop to clear `W_FURNITURE_OVERLAP` *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OA2, OS1, CA2 (kitchens typed `uses living` again, 3 of 12); the laundering routes CC1 (the counter room lost `uses kitchen` and was relabelled to clear `W_ROOM_MISSING_DEFINING`), CS4 (a wardrobe and a nightstand deleted to clear warnings) and CA3 (a TV deleted) | todo |
| PS2.31 | A table or desk with no seat | A dining table or desk with no chair within `seatTableReachMm`. NA4, NT8, NK1. Also a waiting room's seat count, as a profile value. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RH6, RK1 *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): CA7, CT8, CK1, OK1 (a table or desk with no seat) | todo |
| PS2.32 | A seat or sofa facing a wall | A sofa or seat whose front ray meets a wall face within 600 mm: NS4, NK5, NH2's front. A sibling of PS2.28. Also make `in <room> anchor <edge> flush` turn a sofa's back to the anchored wall as it does a bed's head, or say in `spec.llm.md` that it does not. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RS4 (a sofa facing a bed) | todo |
| PS2.33 | An open leaf across a corridor | An open leaf in a circulation room that leaves under 700 mm past it: NH3. A sibling of `W_LEAF_ACROSS_DOORWAY`. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.34 | Stair foot and head landings, and side entry | A landing shallower than the flight width at the foot or head, and a door or opening onto a flight's flank (NT1, NT2; T1). Extends PS2.11e's stair bullets, which today name only the swing and the void. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RT1, RT2 *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OT1 (the townhouse stair entered at its head, its foot in a 700 mm pocket; a blocker), OT3 (the head 200 mm from a partition), CT2 (a kitchen door onto the flank of the flight, 150 mm away) and CT3 (a foot 550 mm from the WC partition). CT1, the blocker where a door lands on a 150 mm strip beside the stairwell, is PS2.56 | todo |
| PS2.35 | A wet-room door onto a food store | `W_WET_ROOM_DOOR` reaches `kitchen` and `dining` only. A WC opening onto a store in a plan with a kitchen should count (NC3). Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.36 | Accessible WC door swing | An accessible WC whose hinged door opens inward (NC4, NK2). Fold it into PS2.16 with the pan offset and basin reach. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RC2, RK2, RC5, RK5 (PS2.36 / PS2.16) | todo |
| PS2.37 | `W_WET_ROOM_DOOR` on non-residential plans | NC6 cites GB 50096 (residential) on a café's public WC, and the author kept it as wrong for the building type. Decide whether the rule should defer to a non-residential profile. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.38 | Chord-aware dimension hint, or an arc-length dimension form | A straight `dim` drawn on the jambs of an opening on an arc and lettered with the opening's width (the arc length) is told by `W_DIM_TEXT_MISMATCH` to move its endpoints so they span that width, i.e. off the jambs. Either make the hint chord-aware (recognise jambs on an arc and say the line measures the chord) or add an arc-length dimension form that measures along the arc. Found in PR #243 (aquarium's two window dims, now lettered `2.0m`) | todo |
| PS2.39 | Thickness call-outs on room floors | `dims auto all` letters each wall thickness once, beside its wall on the side with floor (`thicknessSideFlipped`, `scene-build.ts`): about 65 numbers on a room floor across 21 of the 26 `dims auto` examples, with the `R` and `φ` call-outs (audits X28, M6, DM2; corpus `annotation-collisions/auto-dims-in-room`). A drawing decision, not a lint: state thickness on the openings chain or in the dimension band, or make the tier opt-in, with its own byte-identity accounting. PS2.12 declined to flag it (no author remedy short of dropping the openings chains). *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): thickness text on 6 / 6 plans again | todo |
| PS2.40 | `furnish` avoids label overprints | `furnish` prefers a candidate that raises no `W_ANNOTATION_OVERLAP`, else lists the room under `unresolved`. Acceptance: `finish` on the eval goldens raises 0 overlaps (9 across 6 plans today: ADR 0024 §6 and ADR 0025 §7, amended 2026-10-24). Found in PR #245 | todo |
| PS2.41 | A room label across a wall or outside its floor | *Intent:* `W_ANNOTATION_OVERLAP` sees a label over a symbol but not a label over a wall line, or one wider than its room. Authors now clear the warning by pinning the label onto a wall. *Acceptance:* the 2026-10-25 townhouse ("Stair" both levels, "Bathroom" L1) and clinic ("Access. WC") warn, and so do the 2026-10-24 house's "Bathroom" and "Entrance Hall". The corpus clean twins stay silent. Source: `audits/2026-10-25-first-contact-rerun-row5.md` (RT7, RK6) *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OT9, CS6, CT9, CK7; and the repair pressure the rule produced: OT2 (a stair shrunk to 1000 × 2000 to clear a label warning, about 54° for a 2800 mm storey), CS5 (a shower shrunk 800 → 700 in the round that pinned its label) and four labels pinned onto walls or door leaves in arm B (CS6, CT9) | todo |
| PS2.42 | The front door opens onto a modelled room with no way out | *Intent:* a plan whose only exterior opening is a balcony or patio door, while a circulation room holds the hinged front door and has no exterior opening, is a dwelling with its context drawn inside. Warn, or read the corridor as the entrance side (PS2.14's dwelling context). *Acceptance:* the 2026-10-25 apartment warns (today `access.entrances` = the balcony slider); the 2026-10-24 apartment is silent. Source: `audits/2026-10-25-first-contact-rerun-row5.md` (RA1) | todo |
| PS2.43 | A counter or desk with its service side against a wall | *Intent:* a `reception_desk` or `bar_counter` whose staff side or customer side meets a wall face within 600 mm (RK3, RC1; K7, NC2). A sibling of PS2.32. *Acceptance:* the 2026-10-25 clinic and café warn; their furniture turned 180° does not. Source: `audits/2026-10-25-first-contact-rerun-row5.md` | todo |
| PS2.44 | A balcony door does not make an entry passage | Under `cn-residential-advisory`, `W_ROOM_TOO_NARROW` holds a passage to the 1200 mm entry figure when any door from outside opens into it, a door onto an `outdoor balcony` included (`widthAsk`, `src/lint/rules/per-room.ts`, reads every exterior access edge). Read the entrance as the walk does (`entranceWays`' `balcony` flag, `src/analyze/entrance.ts`) and leave balcony doors out; the warning's hint says so until then. Found in PR #248 | todo |
| PS2.45 | `finish` furnishes small wet rooms the WC rule accepts | Since PS2.11a, `finish`'s corner WC stands its centreline 450 mm off the side face, and the never-worse law refuses any set that stands the pan nearer a wall or its basin. Over the red team's 918 probe rooms (`research/2026-10-25-ps211ab-as-built.md` § `finish` sweep) main furnished 276 WC rooms and 144 baths, the head 246 and 128: the lost rooms (a 1.0 m clear WC room with a basin beside the pan; a 2.4 × 2.1 m bath taking a shower after an off-corner pan) need the stage to place a room's pieces together, or to try its next candidate when a set breaks the law, rather than one piece at a time. Found in PR #252 | todo |
| PS2.46 | A hob under a window | A hob or cooktop whose footprint overlaps a window's span on its wall (NC8, RS3; the hob halves of NA2 and RC4). Not a tall unit, so `W_FURNITURE_OVER_WINDOW` does not report it; decide whether it is the same code with a second catalogue set or its own. Found in PR #252 | todo |
| PS2.47 | `W_WC_SIDE_CLEARANCE` names the same side under a mirror | When both sides of a pan are equally short the message names `sides[0]`, which a mirror maps to the other side: the same plan mirrored names "the wall" where it named "the basin". Pick the reported side by a rule that does not depend on orientation (both obstacles, or a fixed precedence of piece over wall). Found in PR #252's red team | todo |
| PS2.48 | `W_FURNITURE_OVER_WINDOW` wording for a unit beside the window | A bookshelf standing perpendicular to the window wall, its end within the band, is reported as standing "in front of" the window although it stands beside it (`examples/furnished-flat`'s, fixed in PR #252). Say "across N mm of" or distinguish the two. Found in PR #252's red team | todo |
| PS2.49 | Equivariance oracle coverage for the clearance rules | No shipped example raises `W_WC_SIDE_CLEARANCE` or `W_FURNITURE_OVER_WINDOW` after PR #252's fixes, so the oracle classifies both `invariant` without a corpus case exercising them. Add a component example (or an oracle-only fixture) that raises each under `place … rotate`/`mirror`. Found in PR #252's red team | todo |
| PS2.50 | `W_FIXTURE_BACK_TO_ROOM` on a piece end-on or side-on to a wall | The rule warns whenever the edge on a wall is not the piece's back, even when no edge on a wall could be one (`backCandidateEdges`, `src/lint/rules/furniture.ts`): a bed lengthwise with its side on a wall (`examples/tiny-house.arch`), a wardrobe touching a wall only with its end (`examples/hillside-villa.arch` Bedroom 2). Both examples carry the warning since PR #253, which turned those pieces from transposed drawings. The same class reaches `W_FOOTPRINT_TRANSPOSED`: a crib or a treadmill set side-on to a wall with `against` (a normal layout) is written along × depth with its long side along the wall, which that rule reads as turned, so such a piece has no lint-clean reading at all. And the wardrobe turns made in `hillside-villa` are now asked for by no rule (wardrobes are not `fixedAspect`; PS2.53 would). Decide: decline when no edge on a wall is a back candidate, give side-on placement a lint-clean spelling, and explain the corpus movement | todo |
| PS2.51 | Dedupe gap between the two door rules | A pair of doors whose swings collide is left to `W_SWING_OBSTRUCTED`, which reports a door's furniture hit before its swing pairs and stops at the first cause; when the earlier door also hits furniture, neither rule reports the pair's leaf across the doorway (found in PR #253's review) | todo |
| PS2.52 | Equivariance oracle: a corpus plan for each PS2.11 code | No plan in `test/equivariance-corpus.test.ts`'s corpus raises `W_FOOTPRINT_TRANSPOSED` or `W_LEAF_ACROSS_DOORWAY`, so the oracle's `invariant` class for them is pinned only by the rule's own placement tests. Add a placed-component case that raises each (found in PR #253's review) | todo |
| PS2.53 | A per-family depth ceiling | `W_FOOTPRINT_TRANSPOSED` judges only one-shape families (`fixedAspect`), so a wardrobe drawn 600 wide and 1800 deep (`examples/hillside-villa.arch` before PR #253) is out of its reach: wardrobes come in both shapes. A sourced ceiling per family (a wardrobe or bookcase is never deeper than about 700 mm) would catch it without judging a single-door wardrobe | todo |
| PS2.54 | One datum for a doorway's approach | `W_DOORWAY_BLOCKED` measures `doorwayLandingMm` from the wall's centreline (`doorLandingRect`, `src/geometry/rect.ts`); `W_LEAF_ACROSS_DOORWAY` from the face (from the centreline, the audits' A1 and NH5 sit exactly on the edge). Unify on the face and explain the corpus movement | todo |
| PS2.55 | Agent records carrying `W_FOOTPRINT_TRANSPOSED` | Plans kept as records of what an agent wrote raise it and are left as written: listed in `research/2026-10-25-ps211cd-as-built.md` (the gallery's `one-bed`; three `docs/showcase.md` permalink plans with four hits: a bed, two TVs and a twin bed; the first-contact plans; the repro). Decide whether the gallery should show a plan with a known drawing defect | todo |
| PS2.56 | A room whose only door lands on an unwalkable strip | *Intent:* `describe` marks a room `unmeasured` (reason `no_threshold`) while lint says nothing: the 2026-10-26 arm-B townhouse's bedroom 2 has its only door onto a 150 mm strip between the stairwell and the partition (CT1, a blocker), because room reachability counts the door and not the floor beside it. Warn when a room's every door lands on floor too narrow to stand on. *Acceptance:* the 2026-10-26 arm-B townhouse warns; the corpus clean twins stay silent. A sibling of PS2.34 (CT2 is a door onto a flight's flank). Source: `audits/2026-10-26-first-contact-rerun-d15.md` (CT1) | todo |

### PS3 · Relation-first authoring (D1 + D5; needs an ADR)

**PS3.1 · ADR: rooms may be primary; walls and openings may be derived from room relations.**
`done`: ADR 0028, drafted in PR #215 (9d05af4f), Accepted in PR #224 (ac1ad21d)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.1.

**PS3.0 · `walls from rooms` (D5).** `done` (parts A–C: PR #222, c95bd8a1; PR #223, c97c226c; PR #224, ac1ad21d)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.0.

**PS3.2 · Resolve order and room-edge datums.** `done` (PR #220, 6c6179c7; PR #221, 9fb79494)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.2.

**PS3.3 · `wall … between A and B` and `wall … around [ids]`.** `done` (PR #226, 1235529c)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.3.

**PS3.4 · `door|opening between A and B [at <pos>]`, `… on <room>.<edge>`.** `done` (PR #225, 852df5ec)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.4. Ruling D8 (§3) records its `placement` decision.

**PS3.5 · Semantic selectors.** `done` (PR #230, 401c0795)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.5.

**PS3.6 · Teach it.** `done` (PR #227, 2316f7d5)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.6. Ruling D9 (§3) records its lead-example form.

**PS3.10 · Snap a derived open-pair opening to the grid?** `todo`
- `open between`'s derived opening centres on the clear span exactly. That can be a half-grid
  position, which a typed `at` on the same `grid` cannot reach (`relational.arch`: 2025 and 2525
  on `grid 50`, between a 200 mm ring's face and a 100 mm partition's).
- Decide whether the derived centre should snap to the plan grid, toward the inside of the clear
  span, so that a typed twin always exists. A snapped centre would move the PS3.0 part C digest
  rows, so it needs its own PR with the rows explained.

**PS3.7 · Furniture relations: `facing <id>`, `against <wall|room.edge>`, `clear front|sides <mm>`.**
`done` (PR #228, 0d2dbc04; ADR 0029, Accepted, with an ADR 0017 amendment)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.7.

**PS3.11 · Sofa and couch footprints.** `todo` (after a corpus sweep)
- `sofa`/`couch` carry no catalogued footprint, so `E_FACING_TRANSPOSED` cannot see the audit's
  transposed sofas (H2, T3) and `against wall` cannot omit their `size`. Add a footprint (about
  2000-2200 along x 900 deep) once a sweep shows which corpus rows move (`finish`, the LSP hover,
  the fixture paste and the defining-piece rule read it), and explain each.
- *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RA3, a `sofa`. RS4 and
  RK4 are `sofa_l`, which does have a footprint, so `W_FOOTPRINT_TRANSPOSED` (PS2.11) alone would
  see them.

**PS3.8 · Building-relative swing and offset wording.** `done` (PR #229, 98a41560)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.8.

**PS3.9 · Plan JSON for a component that derives its walls.** `done` (PR #232, f420660a)
- As built: `research/2026-10-24-ps3-as-built.md` § PS3.9.

**PS3.12 · Plan JSON round trip for every placed plan.** `todo` (after PS3.9)
- PS3.9's record (`components`/`instances`, `instance` on flattened rows) is gated to storeys where
  a placed component derives its walls, so every other placed plan still exports flattened and
  fails the way back with `E_DOTTED_DECL` (backlog G.10). Widen the gate to every placed plan. It
  moves the Plan JSON of each placed example (`clinic`, `museum-wings`, `terrace-row`,
  `hillside-villa` and every other plan with a `place`). List each one, and take the
  `E_DOTTED_DECL` tripwire in `test/plan-json.test.ts` and those examples' entries in
  `CANNOT_ROUND_TRIP` (`test/plan-json-gaps.ts`) off together. Nested places and imported
  components need their own decision.

**PS3.13 · Plan JSON: print each `place` where its instance stood.** `todo` (after PS3.9; may fold
into PS3.12)
- PS3.9 prints every `place` after the root statements, so a plan that places before (or between)
  its root statements comes back in the grouped order and draws within a layer in another order
  (the LIMIT pin in `test/plan-json-instances.test.ts`). Print each `place` at the position its
  marked rows held in the payload instead. Prove first, against the resolve order (instances
  resolve deepest first and commit in group order before the root, `src/ir.ts` step 3), that the
  row order alone determines `ir.elements` order; then turn the LIMIT pin into a law.

### PS4 · The change model: what follows, what stays, what breaks

**PS4.1 · `describe --facts depends` (opt-in).** `done` (PR #239, 29ec0662)

**PS4.2 · `arch impact`.** `done` (PR #240, 7954f252)

**PS4.3 · `keep` invariants (checked, never solved, by `compile()`).** `todo` (needs an ADR addendum)
- Vocabulary: `keep align …`, `keep equal …`, `keep offset <x> from <y> <mm>`, `keep min clear <room> <mm>`,
  `keep on axis <n> <wall>`, `keep stacked <room> on levels …`, `keep fixed …`.
- Grades `hard`/`soft`/`advisory` (the IFC `IfcConstraintEnum` ladder).
- `W_KEEP_VIOLATED` reports a signed residual in mm.
- A static DOF/redundancy/conflict fact goes under `--facts depends`.
- A `keep` draws nothing and moves nothing.

**PS4.4 · Brief-bound dimensions (provenance).** `todo`
- Sizes stated by the user's brief become intent assertions that `validate --intent` measures from
  geometry (room count and area exist already; add a room width/depth and an exact-size assertion).
- An edit that breaks one fails the gate. Every other number is free to flex.
- This is the machine form of "know what to keep" (ADAI's bound dimension targets,
  `research/adai-sketchup.md` idea 1).
- Check the intent schema's drift and generator rules before adding fields.
- Add a gross-internal-area fact beside the centreline area (`describe().totals`), because every
  first-contact brief was "met" on centrelines and the finished floor came out 6–10 % under the
  brief (`audits/2026-10-18-first-contact.md` A12, H8, S7). The brief binds to the fact the client
  means.

**PS4.5 · Contact dependency.** `todo`
- A wall or element written at fixed coordinates that lies on a room's edge records that contact
  (a `depends` edge), so `arch impact`'s `held` can flag it when the room moves and it does not.
- *Acceptance:* the widening drill (`repro/widen-before.arch`, `--set AW=4500`) reports the shell and
  the partition `p` as held. Found in PR #240.

**PS4.6 · Impact keying.** `todo`
- Diagnostics carry the element id they are about, and `arch impact` keys by it instead of by span
  containment. Then a whole-plan warning that re-attaches to another room (`W_FLOOR_UNASSIGNED`) is
  not read as one broke plus one healed, and the elements of one loop body are told apart.
- An unresolved side keys its errors to the statement. Every storey's elements are compared, not
  only the lowest storey's. Found in PR #240.

**PS4.7 · Impact resolves bindings, not names.** `todo`
- `arch impact` keeps one entry per bound name, so a name stands for every place that binds it.
  The red team on PR #240 measured three consequences:
  - (a) arguments of different `place` instances are merged. An element that reads a component
    parameter directly is resolved per instance since round 2 (`place unit(A) as p`,
    `place unit(B) as q`, `--set A=…`: `q.r` is neither changed nor held). A component-local
    `let` that reads a parameter (`let BEDW = w - BATHW`) is still one entry for every instance;
  - (b) a block-level `let W = K` merges with a top-level `W`: with `--set K=2000`, the
    top-level reader `a` is held via `reads W (reads K)`, and the lets section prints `W` with
    before "3000", after "3000" and `reads K`;
  - (c) a changed name spreads to every name that reads it even when the value did not change
    (`bed_1` with `x = 0·W`; a loop's elements at `i = 0`).
- *Acceptance:* resolve bindings per instance and per scope, and compare values, not names.
  Found in PR #240.

### PS5 · The taste layer and the review sheet (D2)

Taste is ADR 0032 (Accepted 2026-10-25; D11, D14). A done card's "record" is
`research/2026-10-25-ps5-as-built.md`.

**PS5.1 · `taste()` and `arch score --taste <profile> [--json]`.** `done` (PS5.1a: PR #244, 3a262a00;
PS5.1b: PR #247, 9cc29c7e)
- As built: record § PS5.1, § PS5.1a, § PS5.1b.

**PS5.2 · Profiles.** `done` (PR #248, f60636d6)
- As built: record § PS5.2. R10 and R37 deferred to PS2.11 and PS2.16; follow-up PS5.6; ruling D12.

**PS5.3 · `validate --json` gains `next`.** `done` (PR #246, c54cdfbc)
- As built: record § PS5.3. Ruling D13 (§3) records its tier order.

**PS5.3a · MCP `validate` returns `next` (version bump).** `todo`
- The MCP `validate` tool returns the same `next` key, with `--profile`/`--taste` parameters.
- A tool-surface change: bump `packages/mcp`'s version and both `server.json` fields (iron law);
  the hosted worker inherits it. Deferred from PS5.3 by lead ruling.

**PS5.4 · `arch preview --review`.** `todo`
- A review sheet: the plan with the access graph overlaid, each flagged element ringed with its code,
  plus zoomed crops of every flagged junction.
- Agents look at pictures well when told where to look ("not opened = not seen").
- Drawing-only; it never changes `describe()` or `lint()`.

**PS5.5 · Use-scoped R6, R11 and R12.** `todo`
- From PS5.1b's lead rulings (PR #247; design note after §3): R6, R11 and R12 skip a non-residential
  plan as a whole (`non-dwelling`; R12's dependence on the dwelling reading was unrecorded until the
  2026-10-25 audit, see D6), and R6 does not judge `counter`/`worktop`. Scope them by room
  use instead, so a clinic's or café's dwelling-like rooms are judged and a counter in a bath or
  bedroom is not left unjudged.
- From the row-5 re-measure (`audits/2026-10-25-first-contact-rerun-row5.md`, PR #249): *R11 reads
  a dining table, not only a `uses` word.* A kitchen holding a dining table is "where people eat",
  so R11 should score the 2026-10-25 house 1, not 0. Also gate R11 off non-residential plans, as
  the dwelling reading gates lint. *Acceptance:* the 2026-10-25 house R11 = 1, the 2026-10-24 café
  R11 = n/a, and the concordance line is unchanged.

**PS5.6 · `finish`/`furnish --profile <name>`.** `todo`
- `finish --profile <name>` (and its furnish stage) holds the never-worse law under that profile
  as well: when the profile refuses a room's first piece, it falls back to the next size in the
  furnish table (e.g. the 900 × 2000 single bed for the 1500 mm `bed` that makes a bedroom a
  double), and reports what it could not fit.
- Why: ADR 0024 §6 and ADR 0025 §7 (amended 2026-10-25, PR #248) left the residential-advisory
  profiles out of the default law; measured on the eval goldens, a default furnish leaves 28
  profile-only warnings in 14 plans (`uk` 22, `cn` 6, `us` 0), every one a bedroom the 1500 mm
  bed makes a double.

### PS6 · `arch solve` (explicit transform; last)

**PS6.1 · ADR addendum to 0006, then `arch solve`.** `parked` until `keep` has real use
- Exact rational elimination for equalities (DOF is a decision, not a float threshold) and
  Bellman-Ford for difference constraints (a negative cycle names the conflicting `keep`s).
- Authored values are the lowest-priority anchors, applied in hold-fixed-ladder order.
- It refuses when under-determined, its budget is counted, and it emits source plus a change log.
- Design: `research/associativity.md` §4 P5.

### PS7 · Staged authoring for agents

**PS7.1 · Stages as a first-class idea.** `todo` (after PS2, PS3.4)
- Stages: brief → room graph → zoning on a grid → walls (derived) → openings → fixtures and
  furniture → drafting.
- `validate --stage <s>` runs only the rules meaningful up to that stage. SKILL's loop advances only
  when a stage is clean.
- Prior art and ADAI agree: decide low-frequency things first; early proportional errors cascade.

**PS7.2 · `arch context --level starter`.** `todo`
- A one-screen starter for weak models: the same truth as the full context, less of it.

**PS7.3 · Rule packs as data.** `parked`
- Profiles and taste rules described as versioned data, each with applicability, check, failure exit,
  sources, and draft/verified-on-corpus state.
- Only if PS5 shows the rule count outgrowing code-defined profiles.

**PS7.4 · Teach the taste step where cold authors read.** `done` (PR #250, 6e0aa520; measured in PR #261, commit filled at merge)
- As built: `research/2026-10-25-ps5-as-built.md` § PS7.4. Measured 2026-10-26 (`audits/2026-10-26-first-contact-rerun-d15.md`, D20): teaching the step where cold authors read did not change behaviour (arm B over arm A: +1 `validate`, +1 `describe`, 0 `score`); taste is a reviewer's tool, PS7.5.

**PS7.5 · Move the taste step out of the author loop.** `todo` (one PR, after the 2026-10-26 audit merges; D20)
- Goal: a cold author's loop is the validity loop; `score --taste` is read by the reviewer (the dispatching session, `validate --taste`, `preview --review` PS5.4). Three edits in one PR: (1) `spec.llm.md`'s self-correction paragraph drops `score --taste generic` from the loop (compile → `validate --json` `next` → lint → repair), so its characters return to the spec budget that row 6's `keep` form needs (136 UTF-16 units of headroom under 30,000 today); the CLI list keeps naming the command. (2) `skills/archlang/SKILL.md` step 7 is re-worded as a review step. (3) `.claude/agents/arch-author.md` reverts to compile → `validate` `next` → lint → repair, with taste under a "Review" heading.
- Design: `validate --json` `next` stays taught: it is the validity ordering, not a second score, and its uptake (1 of 12 authors) is a PS7.x staged-authoring question. The score's design (0–1, sourced, capped under a validity warning, never gating, `taste()` in the API) is unchanged; only its audience is.
- Acceptance: the spec's loop paragraph no longer names `score --taste` and the PR states the characters freed; the SKILL and the role text agree with the spec; the spec and prefilled-link budget tests stay green. The spec change is a measured surface: the next first-contact re-measure states it among its confounders. *Reverse if* (D20): a re-measure whose dispatch prompt names the whole loop shows at least half of the cold authors running `score --taste` unprompted, or a consumer is shown steering authors by the score; then taste returns to the author loop and this card is reverted.

**PS7.6 · `lint` opens with a one-line summary.** `todo`
- Three arm-B authors cut `lint --json` with `head -c` and repaired only what they saw (café 4 of 23 codes, clinic 2 of 4, studio 5 of 6). Put a one-line summary (`N warnings: CODE ×k, …`) as the first key of the JSON and as the first line of the text report.
- Acceptance: the summary is a function of the diagnostics alone and every diagnostic over the corpus is byte-identical; `lint --json` truncated to its first 200 bytes still names the count and the codes. A surface authors see, so the next first-contact re-measure states it (D19). Source: `audits/2026-10-26-first-contact-rerun-d15.md` (arm B authoring friction).
