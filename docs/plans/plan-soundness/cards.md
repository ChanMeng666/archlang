# Plan-soundness cards

The card tables and card texts of `README.md` §6, moved here on 2026-10-25 (D16) with the same
ids and status words. The README keeps the programme (§1–§5), the order (§7) and the rules for
this file (§8): pick the first `todo` card whose dependencies are done; a card that lands is cut to
its `done` line with its as-built note moved verbatim to a dated `research/` record. Status words:
`todo`, `doing`, `done` (at most three lines: id, title, status, PR, commit), `parked`. Paths are
relative to the programme folder (`docs/plans/plan-soundness/`). This file has no size limit.

### PS0 · Bugs found by the audit (independent; file and fix first)

Landed: PS0.1 (PR #196, da9b47b5), PS0.7 (PR #197, 1d92656f), PS0.10–PS0.12 (PR #211, fcb30748).
Landing notes (and the done rows PS0.13–PS0.14 below) verbatim: `research/2026-10-24-ps0-ps2-as-built.md` § PS0.

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
| PS0.25 | Grid snapping of a declared size is silent. *Intent:* `grid 100` turns `size 2750x7000` into 2800 with no diagnostic, so a storey grows 100 mm (RT3). Report the snap (a `W_` with the snapped value, or a `describe` note), and check that adjacent storeys' exterior rings coincide. *Acceptance:* a two-room `grid 100` plan of `2750` rooms reports the snap. The 2026-10-25 townhouse reports the 100 mm overhang. Source: `audits/2026-10-25-first-contact-rerun-row5.md`, where it was proposed as "PS0.20" (that id was taken) *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): `grid 100` snapped `walls from rooms exterior 250` to 300 on the arm-A and the arm-B house (Plan JSON says 300; the same source under `grid 50` keeps 250), and snapped 450 mm chairs to 500 mm, closing a 100 mm gap between chairs to 0 (OC3), with no diagnostic. The auditors wrote this card as "PS0.20" *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): the row-6 house's `walls from rooms exterior 250` is drawn 300 under `grid 100`, and Part 1 found the same on the 2026-10-24 townhouse, where the stair-landing message's 150 mm reflects the 300 (175 with the authored 250); the café's 450 mm chairs drawn at 500 (QC2). No diagnostic in either | todo |
| PS0.26 | `snap` rounds a half toward +∞ (`Math.round(v / g) * g`, `src/ir.ts` `resolveBody`), so a half-grid coordinate and its mirror image snap to points one grid apart: a turned or mirrored plan does not snap equivariantly. Found by PS4.3a's D4 law for `keep` (PR #272), which therefore excludes half-grid centres; it also excludes keeps naming an axis and `stacked` keeps, because the instance route it uses carries no axis and no storey. *Acceptance:* snapping is sign-symmetric (half away from zero, as ADR 0022's lattice rounding is), measured on the corpus first because it moves every golden with a negative half-grid coordinate; then the keep D4 law (`test/keep.test.ts`) is widened to half-grid centres, to axis keeps (a whole-plan source transform that also maps the `axes` block and its labels) and to `stacked` on multi-storey plans (every storey placed by the same frame, as `test/d4-oracle.ts` builds buildings) | todo |
| PS0.27 | A number written with an exponent lexes as two tokens: `1e30` is the number `1` and then the name `e30`, so `keep fixed a.left at 1e30` reads the value 1 and then refuses an unknown statement `e30`, and the same split happens wherever a number is read (found by PS4.3a's round-2 red team, PR #272). *Acceptance:* the lexer reads a digit run followed by `e`/`E` and an optional sign and digits as one token and refuses it with a catalogued diagnostic that says the language has no exponent form (or reads it, if that is decided), spanned on the whole literal; a test pins `at 1e30`, `size 1e3x2` and `let x = 2E-3` | todo |
| PS0.28 | Nothing holds the README's size cap. D16 caps `docs/plans/plan-soundness/README.md` at 60,000 bytes (`wc -c`), and only a reader checks it: it stood at 61,840 bytes after PR #286 and was trimmed by hand in the 2026-10-27 stage-end housekeeping. *Acceptance:* a test that fails when the README is over 60,000 bytes and names D16 in its message, red on a 60,001-byte copy and green on `main`, wired so `check:test-wiring` passes. Source: the 2026-10-27 drift audit (D1) | todo |

### PS1 · The defect corpus (do this before PS2; it is the yardstick)

**PS1.1 · `test/defect-corpus/`.** `done` (PR #195, 3d255044)
- As built: record § PS1.1.

**PS1.2 · Fold the first-contact instances into the corpus.** `done` (PR #203, 90ae6bfd; two more cases in PR #233, 1a1efd9e)
- As built: record § PS1.2. The corpus is now 73 cases and the catch rate 59/73 (PS2.10, PR #243: 48/70; PS2.12, PR #245: two new pairs, 53/72; PS2.11a/b, PR #252: four `todo` clearance cases caught, 57/72; PS2.11c/d, PR #253: `leaf-across-doorway` caught, plus one new pair).
- *Open (carried from PS1.1):* should the corpus also feed `eval:ci` as a non-gating metric? Read
  `.claude/rules/eval-dataset.md` first: the holdout rules apply.

**PS1.3 · Walls-first control arm for §8 Q1.** `done` (PR #264, 3f071b91)
- Measured 2026-10-26 (`audits/2026-10-26-walls-first-control-arm.md`, D21): 54 verified defects walls-first against 52 rooms-first (arm A), 0 class-1 in the final plans in both; D1/D5 re-stated as claims about authoring. Not run: a walls-first spec.

**PS1.4 · Which diagnostic wording repairs best (§8 Q3).** `done` (PR #284, head f5847349, merge f339e313)
- Measured 2026-10-26 (`research/2026-10-26-ps14-diagnostic-wording.md`): 59 cases × 4 wordings × sonnet and haiku, one draw; fixed (expected code gone) facts/rule/fix/current 46/49/50/51 (sonnet), 45/42/45/48 (haiku). `current` is best on both, but by 1 case on sonnet, under the 3-case margin, so no wording rule; keep message + hint, and do not cut messages to the facts or the catalogue summary alone.
- *Acceptance re-worded 2026-10-27* (it asked for "a wording rule for the catalogue", which the data did not support): a dated `research/` file with the table and either a rule or a stated reason none is supported. Met by the reason: the best variant led by 1 case on sonnet, under the 3-case margin, on one draw (the record's § What would support a rule). Follow-ups: PS1.8.

**PS1.5 · Two wording slips found in PS7.2's red team (2026-10-26).** `todo`
- `E_FURN_SIZE` under `furniture … in <room> anchor|centered` says "no default footprint for `wc`" for a piece that has one (it does under `against`; `in` never reads the catalogue). Say what is true: `in` always needs `size`.
- `describe|compile|preview … --level starter` reports "--level NaN was given …" (the raw word is lost in `Number()`); echo the word and say `--level` is a storey number.
- *Acceptance:* both messages fixed with their `explain` text; a test pins each; `lint-fix-texts` stays green.

**PS1.6 · Two clean twins raise `W_PATH_TOO_NARROW` (found by PS1.4, 2026-10-26).** `todo`
- `space-not-enclosed/bath-open-side.clean.arch` and `openings-ignore-walls/fa-door-across-tee.clean.arch` raise `W_PATH_TOO_NARROW`, which their cases do not: the fix unmasks a 700 mm door (640 mm clear) that the case's defect hid, because the room was reached another way. In PS1.4 (`research/2026-10-26-ps14-diagnostic-wording.md`, § Per-code notes) every reply to the two cases (8 each: sonnet and haiku, all four variants) scored `broke` on that code, the same one the twin raises. They are the only two twins that raise a code their case does not (checked 2026-10-26 at `main@0413af3d`).
- *Acceptance:* give each case and its twin a door the path rule passes, so the twin is clean and the case still raises only its own defect plus what it raised before; a defect-corpus assertion that no twin raises a code its case does not; the catch rate does not move and every moved corpus row is explained.

**PS1.7 · The `eval:ci` gate's two blind spots (found by PR #283's red team round 2, 2026-10-26).** `todo`
- `regressionsAgainstFixture` (`eval/run.ts`) compares each golden's `semanticPass`, `physicalWarnings` and `lintWarnings` with `eval/judge-fixture.json`. It misses (1) a golden recorded as failing (D25's three) that now fails for a different reason with the same counts, say another physical code in place of `W_DOORWAY_BLOCKED`, and (2) a golden deleted from the corpus, whose fixture row is never visited.
- *Acceptance:* the gate also compares a recorded failure's `failures` lines (or codes) with the fixture's, and reports a fixture row with no golden; `test/eval-offline.test.ts` holds both cases; no threshold, `JUDGE_VERSION` unchanged.

**PS1.8 · The wording study's follow-ups (§8 Q3; filed 2026-10-27 by the stage-end drift audit).** `todo`
- PS1.4 ran one draw per case on two models, with the plan alone in the author's context and no `cause`-derived rule arm; its best variant led by 1 case on sonnet (`research/2026-10-26-ps14-diagnostic-wording.md` § What would support a rule). PS1.6 covers none of this.
- *Design:* the same cases and frame with repeat draws (at least three per prompt and model), a third local model, the spec in the author's context, and a fifth variant whose rule is taken from each catalogue entry's `cause` field; the margin and the pairwise correction stated before the run. No paid eval.
- *Acceptance:* a dated `research/` file with the table per model and draw, and either a wording rule (then `lint-fix-texts` pins it) or the stated reason none is supported.

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
| PS2.11a | `W_WC_SIDE_CLEARANCE` | As built: `research/2026-10-25-ps211ab-as-built.md` *Evidence 2026-10-26* (`audits/2026-10-26-walls-first-control-arm.md`): WC2, WK2 (the rule's cheapest repair, centring the pan, makes the accessible WC worse), WS3 (a corner `inset 200` moved the studio WC 200 mm off its back wall and against the basin) | done (PR #252, 486c9cb7) |
| PS2.11b | `W_FURNITURE_OVER_WINDOW` | As built: `research/2026-10-25-ps211ab-as-built.md` | done (PR #252, 486c9cb7) |
| PS2.11c | `W_FOOTPRINT_TRANSPOSED` | As built: `research/2026-10-25-ps211cd-as-built.md` § PS2.11c | done (PR #253, 43fe7fd6) |
| PS2.11d | `W_LEAF_ACROSS_DOORWAY` | As built: `research/2026-10-25-ps211cd-as-built.md` § PS2.11d | done (PR #253, 43fe7fd6) |
| PS2.11e | Clearance family, the remainder | Every bullet landed: the stair bullets in PR #280 (head fb52a6b5, merge e432c24a; `research/2026-10-26-ps211e-stairs-as-built.md`; T1 is caught by `W_STAIR_NO_LANDING`); the hob–fridge gap `W_HOB_FRIDGE_GAP`, the hinged leaf over 1200 mm `W_LEAF_TOO_WIDE` (and the `double` kind) and `W_DOORWAY_BLOCKED` over leaf-less openings in PR #283 (head 8a9533de, merge 24a8afa2; `research/2026-10-26-ps211e-as-built.md`, which keeps this row's text at closure). Wardrobe front: PS2.60; T3, H2: PS2.28 | done (PRs #280, #283) |
| PS2.12 | Annotation collisions | As built: `research/2026-10-25-ps5-as-built.md` § PS2.12 | done (PR #245, cbf6701f) |
| PS2.13 | Lint coverage report | As built: record § PS2.13 | done (PR #203, 90ae6bfd) |
| PS2.14 | Dwelling declaration | A zone-level marker that groups rooms into a dwelling, `describe().dwellings`, common area, and the derived party wall (the ladder rung). Needs an ADR. Unblocks the across-dwellings rule (GB 50096 5.4.4 / GB 55038-2025 4.1.7: a WC over another household's bedroom, living, kitchen or dining) and the shared-corridor checks. Corrects `research/design-taste.md` R19's default of "one level = one dwelling": that fires inside a single house and misses flats, so R19 runs only where dwellings are declared and otherwise reports a coverage skip (`research/2026-10-18-furniture-and-multistorey.md` B1, B9, B12) | todo |
| PS2.15 | `W_SHAFT_FOOTPRINT_MISMATCH` | As built: `research/2026-10-26-ps211e-stairs-as-built.md` (with PS2.11e's arrival void, `W_STAIR_HEAD_VOID`) | done (PR #280, head fb52a6b5, merge e432c24a) |
| PS2.16 | Egress necessary-condition checks | `uk-residential-advisory`: `W_INNER_ROOM` (ADB 2.11/2.12, 3.7/3.8: a habitable room whose only route to the exit passes through another room, with its exemptions). `us-residential-advisory`: bedroom escape-window failures provable from gross sizes (IRC R310: width < 508 mm, sill > 1118 mm, area < 0.33 m²); never a pass claim without an `openable` window fact (`…multistorey.md` B10–B11). A non-residential advisory profile for the same family: escape-door swing in the direction of travel and leaf type, exits on separate sides, public/staff zoning, accessible WC pan offset and basin reach (first-contact café and clinic, K1, K9, K10, C6, K8). Blocked on facts, not rules, and listed as such: wet-stack risers, fire ratings, protected-stair enclosure, sprinkler-dependent limits *Evidence 2026-10-26* (`audits/2026-10-26-walls-first-control-arm.md`): WC2, WK2 (accessible WCs centred to clear `W_WC_SIDE_CLEARANCE`, losing the grab-rail wall) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QC5, QK7 (customers through the back hall; the waiting room open to the staff corridor) | todo |
| PS2.17 | Kitchen worktop | As built: record § PS2.17 | done (PR #216, 8bbdd699) |
| PS2.18 | Profile scoping of dwelling-reading rules | As built: record § PS2.18 | done (PR #217, 06c6b563) |
| PS2.19 | Vocabulary gaps | As built: record § PS2.19 | done (PR #216, 8bbdd699) |
| PS2.20 | Furnish: shower and tub placement | After PS2.9, 44 of 1,600 fuzzed baths are left empty because neither the stage's candidates nor the lint's placement search finds a tub or shower position, where the previous main wrote a WC and basin. Measure what those rooms have in common (size, door and window positions) and extend the candidate set (a shower in the corner the door does not swing into; a tub along the long wall with the door at its foot) before anyone concludes the rooms are too small | todo |
| PS2.21 | Enclosure budget follow-ups | From PR #204's final red-team: (1) the point-test charge assumes every curve crosses every other (`piecesBound ≈ 2c²` × ring vertices), so a plain round room drawn with ≥ 300 vertices is refused on `point-tests` although it crosses nothing; count only curve pairs whose boxes meet so finely drawn curved rooms stay measured (corpus max today is 56 vertices, aquarium's concourse). (2) The slowest admitted shape, a 50-partition × 30-tooth comb room, lints in ~1.6 s vs 0.44 s on main: bounded, not a hang, but twice the figure the PR body quotes. (3) `W_BOUNDARY_NO_WALL` sits outside the `FaceBudget` (ring × ring per room pair plus runs × wall segments), the same class as the ring-pair analyses `describe()` already pays; two interlocking 2000-tooth combs go 23 s → 35 s. Give it a count bound beside the existing ring-pair cost | todo |
| PS2.22 | `W_ALIAS_MATCH` quotes a room id | Folded into PS2.29; as built: `research/2026-10-26-ps229-as-built.md` | done (PR #269, 5aab29e5) |
| PS2.23 | Authored wall beside a derived line | An authored wall 1 mm (any non-zero distance) off a `walls from rooms` derived line is kept beside the derived wall, not merged (ADR 0028 §3 coexistence): two parallel bands nearly on top of each other. Lint it: an authored straight wall parallel to a derived segment, overlapping it along its length, whose centreline is closer than half the thicker wall's thickness, almost always meant to lie on the line (found by PR #223's red team) | todo |
| PS2.24 | Wall meeting an open run mid-span | An authored wall perpendicular to a `walls from rooms` `open between` run, ending on it mid-span, is neither refused (it is not collinear, so not `E_WALL_BETWEEN_OPEN`) nor excused: today it only warns through `W_OPENING_AT_JUNCTION` (a wall standing inside the opening). Decide the rule: refuse it as `E_WALL_BETWEEN_OPEN`, or a lint finding with its own hint (give the opening a `width` that clears the wall, or move the wall). No code yet (found by PR #224's red team) | todo |
| PS2.25 | `W_DOOR_NEAR_CORNER` disagrees with the junction measure | `W_DOOR_NEAR_CORNER` measures from a different point than the junction measure `E_OPENING_NIB` and `W_OPENING_AT_JUNCTION` share (`src/opening-junctions.ts`), so a relational door placed at the nib hint's "nearest legal position" (650 from end on a 400 mm host meeting a thinner wall) still warns. Fix: measure the corner from the meeting wall's face, or have the nib hint skip candidates that would warn. No code yet (found by PR #225's red team) | todo |
| PS2.26 | `W_SWING_OBSTRUCTED` at exactly 0 mm short | Under `accessibility-advisory` the rule fires on `examples/two-bed.arch` with a swing that needs 1050 mm of clear radius and measures 1050 mm ("0 mm short", found by PR #227's red team). The boundary should be `<`, not `≤`: decide, fix, and explain the corpus movement in that PR | todo |
| PS2.27 | `W_FACING_BLOCKED` | A declared `facing` whose front ray crosses a wall body before it reaches its target (a TV facing a sofa through a partition). Walls only: a coffee table between a sofa and its TV is the arrangement. Deferred from PS3.7 (ADR 0029) | todo |
| PS2.28 | Undeclared sofa → TV check | A sofa or loveseat in a room with a `tv`/`tv_unit` whose front ray misses it (the audit's A3, H2, T3: 3 of 3 sofas). Out of PS3.7's scope, which judges only seats at tables; measure the corpus first, and decide what a sofa facing a view instead means *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA4, QH4, QT6 (0 of 3 sofas face the TV in their room) | todo |
| PS2.29 | Id-free lint messages | As built: `research/2026-10-26-ps229-as-built.md` | done (PR #269, 5aab29e5) |
| PS2.30 | Room use inferred from contents | A room holding a kitchen sink, stove or fridge but not typed `kitchen` (or untyped) gets `W_ROOM_USE_MISSING`, or the kitchen rules run on the inferred use. NA1, NS1, NC1. NC1 shows that deleting the type is the cheapest way to silence `W_ROOM_MISSING_DEFINING`. **Acceptance test: the exact laundering.** The final café (`first-contact-plans/2026-10-24-rerun/4-cafe.arch`) has `service` untyped, and lint reports only `W_WET_ROOM_DOOR`. Restoring `uses kitchen` on `service` brings back `W_ROOM_MISSING_DEFINING`: "Counter" is furnished (bar counter) but has no kitchen sink, no stove and no counter or worktop. The card is done when the untyped room gets the same finding. `bar_counter` does not count as the worktop in that message, and the card should keep it that way. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RA2, RS2 (2 / 6 kitchens typed `living` again); RS2 adds a laundering route, deleting the worktop to clear `W_FURNITURE_OVERLAP` *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OA2, OS1, CA2 (kitchens typed `uses living` again, 3 of 12); the laundering routes CC1 (the counter room lost `uses kitchen` and was relabelled to clear `W_ROOM_MISSING_DEFINING`), CS4 (a wardrobe and a nightstand deleted to clear warnings) and CA3 (a TV deleted) *Evidence 2026-10-26* (`audits/2026-10-26-walls-first-control-arm.md`): WK5 (the clinic staff room retyped `uses kitchen` → `uses office` to silence `W_ROOM_MISSING_DEFINING`: silencing by retyping), WA2, WS2 (kitchens typed `uses living` again) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA2, QS1 (kitchens typed `uses living` again, 2 of 6; QA2's label was also cut from "Living / Dining / Kitchen" to "Living" to clear `W_ANNOTATION_OVERLAP`) | todo |
| PS2.31 | A table or desk with no seat | A dining table or desk with no chair within `seatTableReachMm`. NA4, NT8, NK1. Also a waiting room's seat count, as a profile value. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RH6, RK1 *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): CA7, CT8, CK1, OK1 (a table or desk with no seat) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA3 (a dining `table` with no chairs), QK1 (no consulting room has a chair) | todo |
| PS2.32 | A seat or sofa facing a wall | A sofa or seat whose front ray meets a wall face within 600 mm: NS4, NK5, NH2's front. A sibling of PS2.28. Also make `in <room> anchor <edge> flush` turn a sofa's back to the anchored wall as it does a bed's head, or say in `spec.llm.md` that it does not. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RS4 (a sofa facing a bed) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA4, QH4, QS4, QT6, QK4 (sofas facing a wall, a partition or the façade 250 to 500 mm away) | todo |
| PS2.33 | An open leaf across a corridor | An open leaf in a circulation room that leaves under 700 mm past it: NH3. A sibling of `W_LEAF_ACROSS_DOORWAY`. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.34 | Stair foot and head landings, and side entry | `W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY`. As built: `research/2026-10-26-ps211e-stairs-as-built.md` (every audit row named there; CT1 is caught by `W_STAIR_SIDE_ENTRY` too, PS2.56 keeps its broader intent) | done (PR #280, head fb52a6b5, merge e432c24a) |
| PS2.35 | A wet-room door onto a food store | `W_WET_ROOM_DOOR` reaches `kitchen` and `dining` only. A WC opening onto a store in a plan with a kitchen should count (NC3). Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.36 | Accessible WC door swing | An accessible WC whose hinged door opens inward (NC4, NK2). Fold it into PS2.16 with the pan offset and basin reach. Source: `audits/2026-10-24-first-contact-rerun.md`. *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): RC2, RK2, RC5, RK5 (PS2.36 / PS2.16) *Evidence 2026-10-26* (`audits/2026-10-26-walls-first-control-arm.md`): WC2, WK2 (the café and clinic accessible WCs centred to clear `W_WC_SIDE_CLEARANCE`, which removed the grab-rail wall: the rule's cheapest repair makes the accessible WC worse; PS2.36 / PS2.16) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QC3, QK5 (accessible WCs with no grab-rail wall in reach; QK5's door swings in) | todo |
| PS2.37 | `W_WET_ROOM_DOOR` on non-residential plans | NC6 cites GB 50096 (residential) on a café's public WC, and the author kept it as wrong for the building type. Decide whether the rule should defer to a non-residential profile. Source: `audits/2026-10-24-first-contact-rerun.md` | todo |
| PS2.38 | Chord-aware dimension hint, or an arc-length dimension form | A straight `dim` drawn on the jambs of an opening on an arc and lettered with the opening's width (the arc length) is told by `W_DIM_TEXT_MISMATCH` to move its endpoints so they span that width, i.e. off the jambs. Either make the hint chord-aware (recognise jambs on an arc and say the line measures the chord) or add an arc-length dimension form that measures along the arc. Found in PR #243 (aquarium's two window dims, now lettered `2.0m`) | todo |
| PS2.39 | Thickness call-outs on room floors | `dims auto all` letters each wall thickness once, beside its wall on the side with floor (`thicknessSideFlipped`, `scene-build.ts`): about 65 numbers on a room floor across 21 of the 26 `dims auto` examples, with the `R` and `φ` call-outs (audits X28, M6, DM2; corpus `annotation-collisions/auto-dims-in-room`). A drawing decision, not a lint: state thickness on the openings chain or in the dimension band, or make the tier opt-in, with its own byte-identity accounting. PS2.12 declined to flag it (no author remedy short of dropping the openings chains). *Evidence 2026-10-25* (`audits/2026-10-25-first-contact-rerun-row5.md`): thickness text on 6 / 6 plans again *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): thickness text on 6 / 6 plans again (QA9, QH13, QS8, QC7, QT11, QK8) | todo |
| PS2.40 | `furnish` avoids label overprints | `furnish` prefers a candidate that raises no `W_ANNOTATION_OVERLAP`, else lists the room under `unresolved`. Acceptance: `finish` on the eval goldens raises 0 overlaps (9 across 6 plans today: ADR 0024 §6 and ADR 0025 §7, amended 2026-10-24). Found in PR #245 | todo |
| PS2.41 | A room label across a wall or outside its floor | *Intent:* `W_ANNOTATION_OVERLAP` sees a label over a symbol but not a label over a wall line, or one wider than its room. Authors now clear the warning by pinning the label onto a wall. *Acceptance:* the 2026-10-25 townhouse ("Stair" both levels, "Bathroom" L1) and clinic ("Access. WC") warn, and so do the 2026-10-24 house's "Bathroom" and "Entrance Hall". The corpus clean twins stay silent. Source: `audits/2026-10-25-first-contact-rerun-row5.md` (RT7, RK6) *Evidence 2026-10-26* (`audits/2026-10-26-first-contact-rerun-d15.md`): OT9, CS6, CT9, CK7; and the repair pressure the rule produced: OT2 (a stair shrunk to 1000 × 2000 to clear a label warning, about 54° for a 2800 mm storey), CS5 (a shower shrunk 800 → 700 in the round that pinned its label) and four labels pinned onto walls or door leaves in arm B (CS6, CT9) *Evidence 2026-10-26* (`audits/2026-10-26-walls-first-control-arm.md`): WH10, WT10, WK7 (labels pinned or shortened to clear `W_ANNOTATION_OVERLAP` still print over door swings and across walls; WC10 is the partial catch) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA8 (labels pinned to clear `W_ANNOTATION_OVERLAP` land under a door swing and on a partition), QA2 (a room label shortened so the drawing no longer says "Kitchen") | todo |
| PS2.42 | The front door opens onto a modelled room with no way out | *Intent:* a plan whose only exterior opening is a balcony or patio door, while a circulation room holds the hinged front door and has no exterior opening, is a dwelling with its context drawn inside. Warn, or read the corridor as the entrance side (PS2.14's dwelling context). *Acceptance:* the 2026-10-25 apartment warns (today `access.entrances` = the balcony slider); the 2026-10-24 apartment is silent. Source: `audits/2026-10-25-first-contact-rerun-row5.md` (RA1) *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QA1 (the common corridor modelled inside the flat; `describe` names the balcony slider the only entrance; lint coverage privacy `partial`, reason `balcony-only-entrance`) | todo |
| PS2.43 | A counter or desk with its service side against a wall | *Intent:* a `reception_desk` or `bar_counter` whose staff side or customer side meets a wall face within 600 mm (RK3, RC1; K7, NC2). A sibling of PS2.32. *Acceptance:* the 2026-10-25 clinic and café warn; their furniture turned 180° does not. Source: `audits/2026-10-25-first-contact-rerun-row5.md` *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QC1 (the café counter's back on the store partition, 3.6 m from the kitchen pass), QK3 (the reception desk reversed, its chair facing the corridor) | todo |
| PS2.44 | A balcony door does not make an entry passage | Under `cn-residential-advisory`, `W_ROOM_TOO_NARROW` holds a passage to the 1200 mm entry figure when any door from outside opens into it, a door onto an `outdoor balcony` included (`widthAsk`, `src/lint/rules/per-room.ts`, reads every exterior access edge). Read the entrance as the walk does (`entranceWays`' `balcony` flag, `src/analyze/entrance.ts`) and leave balcony doors out; the warning's hint says so until then. Found in PR #248 | todo |
| PS2.45 | `finish` furnishes small wet rooms the WC rule accepts | As built: `research/2026-10-26-ps245-as-built.md` | done (PR #268, e6778596) |
| PS2.46 | A hob under a window | `W_HOB_UNDER_WINDOW`, its own code. As built: `research/2026-10-26-ps211e-as-built.md` | done (PR #283, head 8a9533de, merge 24a8afa2) |
| PS2.47 | `W_WC_SIDE_CLEARANCE` names the same side under a mirror | When both sides of a pan are equally short the message names `sides[0]`, which a mirror maps to the other side: the same plan mirrored names "the wall" where it named "the basin". Pick the reported side by a rule that does not depend on orientation (both obstacles, or a fixed precedence of piece over wall). Found in PR #252's red team | todo |
| PS2.48 | `W_FURNITURE_OVER_WINDOW` wording for a unit beside the window | A bookshelf standing perpendicular to the window wall, its end within the band, is reported as standing "in front of" the window although it stands beside it (`examples/furnished-flat`'s, fixed in PR #252). Say "across N mm of" or distinguish the two. Found in PR #252's red team | todo |
| PS2.49 | Equivariance oracle coverage for the clearance rules | No shipped example raises `W_WC_SIDE_CLEARANCE` or `W_FURNITURE_OVER_WINDOW` after PR #252's fixes, so the oracle classifies both `invariant` without a corpus case exercising them. Add a component example (or an oracle-only fixture) that raises each under `place … rotate`/`mirror`. Found in PR #252's red team | todo |
| PS2.50 | `W_FIXTURE_BACK_TO_ROOM` on a piece end-on or side-on to a wall | As built: `research/2026-10-26-ps250-as-built.md` (side-on by `anchor`/`at` + `rotate`; an `against` side-on clause not built) | done (PR #267, 98b3d7ab) |
| PS2.51 | Dedupe gap between the two door rules | A pair of doors whose swings collide is left to `W_SWING_OBSTRUCTED`, which reports a door's furniture hit before its swing pairs and stops at the first cause; when the earlier door also hits furniture, neither rule reports the pair's leaf across the doorway (found in PR #253's review) | todo |
| PS2.52 | Equivariance oracle: a corpus plan for each PS2.11 code | No plan in `test/equivariance-corpus.test.ts`'s corpus raises `W_FOOTPRINT_TRANSPOSED` or `W_LEAF_ACROSS_DOORWAY`, so the oracle's `invariant` class for them is pinned only by the rule's own placement tests. Add a placed-component case that raises each (found in PR #253's review) | todo |
| PS2.53 | A per-family depth ceiling | `W_FOOTPRINT_TRANSPOSED` judges only one-shape families (`fixedAspect`), so a wardrobe drawn 600 wide and 1800 deep (`examples/hillside-villa.arch` before PR #253) is out of its reach: wardrobes come in both shapes. A sourced ceiling per family (a wardrobe or bookcase is never deeper than about 700 mm) would catch it without judging a single-door wardrobe | todo |
| PS2.54 | One datum for a doorway's approach | The wall's face, for `W_DOORWAY_BLOCKED` and every reader of `doorLandingRect`. As built: `research/2026-10-26-ps211e-as-built.md` | done (PR #283, head 8a9533de, merge 24a8afa2) |
| PS2.55 | Agent records carrying `W_FOOTPRINT_TRANSPOSED` | Plans kept as records of what an agent wrote raise it and are left as written: listed in `research/2026-10-25-ps211cd-as-built.md` (the gallery's `one-bed`; three `docs/showcase.md` permalink plans with four hits: a bed, two TVs and a twin bed; the first-contact plans; the repro). Decide whether the gallery should show a plan with a known drawing defect | todo |
| PS2.56 | A room whose only door lands on an unwalkable strip | *Intent:* `describe` marks a room `unmeasured` (reason `no_threshold`) while lint says nothing: the 2026-10-26 arm-B townhouse's bedroom 2 has its only door onto a 150 mm strip between the stairwell and the partition (CT1, a blocker), because room reachability counts the door and not the floor beside it. Warn when a room's every door lands on floor too narrow to stand on. *Acceptance:* the 2026-10-26 arm-B townhouse warns; the corpus clean twins stay silent. A sibling of PS2.34 (CT2 is a door onto a flight's flank). Source: `audits/2026-10-26-first-contact-rerun-d15.md` (CT1) | todo |
| PS2.57 | The compile channel, `describe()` captions and CLI coverage lines still print ids | *Intent:* PS2.29 made `lint()`, `taste()` and `W_ROOM_OVERLAP` id-free. Red-team round 1 of PR #269 found that the rest of the surface still prints ids to a reader who may not see the source: `W_DOOR_OFF_WALL` and the other resolver warnings print an unauthored generated id (`Door "door_2" does not lie on any wall`) and reach `validate --json`'s `next.message`; `E_OPENING_NIB` prints a derived wall name; a `describe()` room caption and the CLI's coverage line name an unlabelled room by its id. *Acceptance:* the PS2.29 assertion extended to `compile().diagnostics` (every code; an id the author typed in the span the diagnostic points at excepted), `validate --json` `next.message`, the `describe()` captions and the coverage line, with the phrase builder in `src/naming.ts`; every moved digest row explained | todo |
| PS2.58 | Residue of the id-free naming (PR #269, red-team round 2) | *Intent:* three leftovers of `src/naming.ts` and its callers. (1) An outdoor surface far outside the rooms (the `bal3` balcony 20 m from a 10 m plan) is placed by `ctx.placeAt` relative to the rooms' extent, so it reads "on the right of the plan" when it is nowhere near it; place it against the extent of the rooms and the surfaces together, or say it lies outside. (2) The `centre` fallback in `surfaceNames` (`src/lint/rules/outdoor.ts`: a surface with no ring falls back to the box centre) is unreachable, since a surface without a ring is skipped by both rules; remove it or test it. (3) `src/ir.ts` repeats `roomUses`'s logic (`uses` else `classifyLabelUses(label ?? id)`) for the `W_ROOM_OVERLAP` namer, because `analyze.ts` imports `ir.ts`; move the one function to a neutral module and share it. *Acceptance:* a test per item; no moved digest row beyond the surfaces' wording | todo |
| PS2.59 | A hob against a side wall | NKBA guideline 17's landing area is blocked by a wall beside the hob as by a fridge (A7, RH2, RS3's side, WC5), which `W_HOB_FRIDGE_GAP` does not read. Measure the corpus first: a hob at the end of a run is common in small kitchens | todo |
| PS2.60 | Wardrobe front and bed sides as a profile figure | The wardrobe-front bullet of PS2.11e is a declaration (`clear front 600`, PS3.7); OA4, CA4, RH4, H5, A5 stay missed undeclared. Approved Document M4(2)'s 750 mm access zone beside the principal double bed would catch the bed-side half under `uk-residential-advisory` once read [M]; a wardrobe front needs its own source. The defect-corpus cases `wardrobe-front-550` and `wardrobe-faces-bed` wait here *Evidence 2026-10-26, row 6* (`audits/2026-10-26-first-contact-rerun-row6.md`): QH6 (wardrobe fronts 100 mm from the bed sides), QS2 (the alcove bed flush in a corner, reachable from its foot only) | todo |
| PS2.61 | `W_FURNITURE_OVER_WINDOW`'s hint quotes an assigned window id | *Intent:* the hint names the window as `window "<id>"` whether or not the author wrote the id, so an unnamed window is quoted as `window_6`, an id the source does not contain (red-team round 1 of PR #283, which fixed the same habit in `W_HOB_UNDER_WINDOW`'s hint by reading `RWindow._idAuthored`). *Acceptance:* the hint quotes a window's id only when `_idAuthored`, else names it by its width, as `W_HOB_UNDER_WINDOW` does; the messages-id-free and fix-text tests extend to hints of this code | todo |
| PS2.62 | `W_TITLE_OVERFLOW`'s hint sends the overflow into `title { }` | *Intent:* the hint (`src/lint/rules/annotations.ts`) and the catalogue `fix` say "move the rest to a `notes "…"` line" without saying where the line goes. In PS1.4 (`research/2026-10-26-ps14-diagnostic-wording.md`, § Per-code notes) all four authors shown the hint put `notes` inside the `title { }` block and the reply failed with `E_PARSE: Unknown title field "notes"`: sonnet and haiku, variants `fix` and `current` (replies `annotation-collisions--title-overflow__fix` and `__current`, kept outside the repository with the run). `notes` is a plan-level statement. *Acceptance:* the hint and the catalogue `fix` give a compiling example of a plan-level `notes "…"` line and say it stands outside `title { }`; a test applies the hint's example to `test/defect-corpus/annotation-collisions/title-overflow.arch` and asserts it compiles and clears the code; `lint-fix-texts` stays green | todo |
| PS2.63 | `W_ANNOTATION_OVERLAP`'s hint names no clear label point | *Intent:* the hint says "Give it a clear point with `label "…" at (x,y)`" and gives no point. In PS1.4 (`research/2026-10-26-ps14-diagnostic-wording.md`, § Per-code notes) authors shown it guessed points that still overprinted the symbol in 7 of the 8 hint-bearing replies to the two label cases: `label-over-bed` `fix`/`current` unchanged on both models (points (800,2000) to (800,2500)), `label-over-wc` unchanged in 3 of 4 (replies `annotation-collisions--label-over-bed__fix`, `__current`, `--label-over-wc__fix`, `__current`); sonnet's `current` fixed 2 of the 6 annotation cases, its lowest class. The authors who were not given the hint "fixed" three cases by shortening or dropping the room label instead, an evasion. *Acceptance:* the hint names a clear label point computed from the room's geometry and the drawn symbols, the way the opening hints quote checked positions; a test applies it to the two corpus label cases and asserts the code clears with the label text unchanged. *Open:* the hint fires when the placer found no clear part big enough; say what the hint names then (the least-overlapping point and its overlap, or the piece to move) | todo |
| PS2.64 | `W_HOB_UNDER_WINDOW` on a hob beside a window on a return wall | *Intent:* the rule counts a hob as under a window when its footprint reaches the band `fixtureWallTolMm` (300 mm) either side of the window wall's centreline (`windowCover`, `src/lint/clearance-measure.ts:324-337`; the rule at `src/lint/rules/clearances.ts:222-224`), and never asks whether the hob backs onto that wall. The 2026-10-18 apartment's stove backs onto the north wall, 125 mm off the east wall's face; a 50 × 75 mm corner enters the band of the east window, so it warns, and its hint sends the stove "along the wall" it is not against. In the 11 other firings over the first-contact plans the hob backs onto the window wall (distance 0). *Acceptance:* a hob warns only when its back edge lies on the window's host within the same tolerance; the 2026-10-18 apartment goes silent, the 11 true firings and every corpus case stay, and every moved corpus `lint()` row is explained. Class: false positive (rule fix). Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1 (the kitchen as-built record counted this hit as true) | done (PR #296): as built, the hob must also stand against the window's host, its side nearest the host no more than `WALL_COLLISION_SLACK_MM` (30 mm) off the face (`hobWindowCover`), not its `rotate` back edge, which drops RS3 and the repro apartment (an unturned or side-on stove at the wall); only the 2026-10-18 apartment moves |
| PS2.65 | `W_DOORWAY_BLOCKED` judges a vehicle door as a pedestrian doorway | *Intent:* under `accessibility-advisory` the 2026-10-18 house's 2400 mm `garage` door warns that "Car" leaves 375 mm of its 450 mm approach (the face datum, PS2.54, moved it from 500): the blocker is the car the door exists for. Leave `garage` doors out of the approach check, as `W_LEAF_TOO_WIDE` leaves out leaf-less kinds (`src/lint/rules/doors.ts`), or judge only a pedestrian door beside one. *Acceptance:* that a11y line goes; no other corpus or first-contact row moves. Class: false positive (rule fix). Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1 | done (PR #297): `W_DOORWAY_BLOCKED` and `repair`'s doorway census skip `garage` doors; only the 2026-10-18 house's a11y "Car" row moves |
| PS2.66 | A bathroom with a WC and no basin | *Intent:* `W_ROOM_MISSING_DEFINING` defines a `bath` by its bathtub or shower alone (`src/lint/defining.ts`), so a family bathroom holding a tub and a WC and no basin passes (QH7). Warn when a `bath` room holds a WC and no basin; a `wc` room stays defined by its WC alone (a cloakroom without a basin is common, as the module says). *Acceptance:* the row-6 house warns; the corpus clean twins stay silent. *Open:* a bath whose basin stands in an adjoining dressing room. Class 4. Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QH7) | done (PR #301): `W_ROOM_MISSING_DEFINING` also reports a `bath` that holds a WC and no basin, unless a basin stands in a directly joined non-kitchen room (AD G4) |
| PS2.67 | A catalogued fixture drawn under its smallest size | *Intent:* an authored `size` below a sourced minimum for its family passes silently: the studio's shower tray cut 800 → 700 to clear `W_FURNITURE_OVERLAP` (QS5; CS5 before), the clinic's exam couches drawn as `bed` 1500 × 700, cut from 1900 (QK2). `W_FOOTPRINT_TRANSPOSED` reads only the catalogue's aspect. Warn, naming the minimum and its source, when a piece is under it (a shower tray under 800 × 800, a bed under its catalogue length). Sourced 2026-10-27 in part: a bed at least 1900 long × 750 wide (Which? UK bed sizes, 2026); blocked for the shower tray (no sourced minimum found: BS 6465, Neufert and maker ranges searched, 700 × 700 trays are sold) and the exam couch (no catalogue family, no read source); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 studio and clinic warn; the corpus and examples move only where a piece is really undersized, each row explained. Needs a sourced minimum per family (a profile value where sources differ). Class 5. Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QS5, QK2) | todo |
| PS2.68 | Chairs back to back with no room to push back | *Intent:* two seats at different tables standing back to back with less than a push-back allowance between them (QC2: 100 mm between rows, after grid snap drew the 450 mm chairs at 500; OC3 at 0 mm and RC6 at 500 mm before). Warn below a sourced allowance. Blocked 2026-10-27: no sourced figure found (Time-Saver Standards, Panero & Zelnik, Neufert not reached; trade guides give 6, 12 and 18 in and disagree); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 café warns; the café examples stay silent or move with a reason. Class 5. Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QC2) | todo |
| PS2.69 | Furniture in front of an exterior exit | *Intent:* `W_DOORWAY_BLOCKED` reads an approach of 300 mm (450 under the a11y profile), so the clinic's waiting sofa, 500 mm off the façade and in front of 600 of the 1200 mm main exit, passes in both profiles (QK4; OK5's egress half before). Warn when furniture within an egress depth in front of an exterior exit leaves less clear width than the door's. A sibling of PS2.16. Sourced 2026-10-27: 914 mm clear in front of the inside face (IRC R311.3), 1220 push / 1525 pull under `accessibility-advisory` (ADA 2010 404.2.4.1); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 clinic warns; the corpus clean twins stay silent. Needs a sourced depth. Class: new (egress). Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QK4) | todo |
| PS2.70 | `W_GARAGE_TOO_NARROW` judges depth too | *Intent:* the rule judges a garage's width only (`src/lint/rules/per-room.ts`), so a garage about 3000 mm deep along its vehicle door's axis passes (QH5; OH5, CH5, NH4, RH5 before). Judge the clear depth along the vehicle door's axis against a sourced figure, keeping a double garage silent. Sourced 2026-10-27: clear depth 5000 by default (a bay or car-port length), 6000 × 3000 under `uk-residential-advisory` (Monmouthshire SPG 2013 ¶12, ¶21, citing Manual for Streets; Buckinghamshire parking guidance Tables 9, 11); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 house warns; `examples/hillside-villa.arch`'s double garage stays silent. Class: new (advisory size). Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QH5) | done (PR #307): depth between wall faces along the vehicle door's axis, 5000 mm default / 6000 uk; the row-6 house warns, hillside-villa silent by default |
| PS2.71 | A bed head across a window | *Intent:* a bed whose head side stands against a window (QA5, QS3, QT8; OA5, OH7, OT7, RH7 before); `W_FURNITURE_OVER_WINDOW` judges tall units only. An advisory, or a taste criterion if the convention is not a validity failure (D2): decide which first. Decided 2026-10-27: taste, see the record (`research/2026-10-27-ps267-271-sources.md`). *Acceptance:* the row-6 apartment, studio and townhouse report it; a bed whose side is under a window does not. Class 5 (m). Source: `audits/2026-10-26-first-contact-rerun-row6.md` | todo |
| PS2.73 | An `against` side-on clause | *Intent:* PS2.50 judges a piece side-on to a wall when it is placed by `anchor`/`at` + `rotate`, but `against` cannot place one side-on, so the hint writes the `at` spelling. The sketch: `furniture crib against wall shell offset 1500 lengthwise head start\|end` (the long side on the wall face, `size` the piece's own along × depth, `head start\|end` traversal-relative like `hinge near start`, so a mirror carries it). A language form: parser and resolver (`placeAgainst` with the size swapped, the turn off the wall direction ± 90), `fmt`, Plan JSON, `describe()` `_authored`, a `place` transform, a conflict code for a `backsOntoWall` piece, a spec/SKILL line inside the `spec.llm.md` budget (PS7.9) and a byte-identity law. *Acceptance:* start only when authors are seen reaching for `against` for side-on pieces (a first-contact audit row); then the form ships with its law. Source: `research/2026-10-26-ps250-as-built.md` § Open | todo |
| PS2.72 | `describe --facts clearances` | *Intent:* no CLI surface reproduces a clearance rule's numbers: `describe --facts` prints rooms and areas, so the row-6 Part 1 auditor re-measured every hob, doorway and stair figure with `resolveAll` in a script. An opt-in facet printing what each clearance rule measured (a hob's cover of a window, a doorway's approach and clear width, a stair's landing lengths and run) lets a reviewer check a warning, or its absence, from the CLI. *Acceptance:* the Part 1 figures (the 2026-10-18 apartment's 50 × 75 mm hob corner, the 2026-10-18 townhouse's 275 mm landing) are read from the facet; `describe()` without the flag is byte-identical. Class: tool. Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1. *As built:* `src/lint/clearance-facts.ts` reads the rules' own measures on `lint()`'s storey contexts (`src/lint/storeys.ts`); both figures pinned, and the facet's short rows held equal to `lint()`'s warnings over the corpus, in `test/describe-clearances.test.ts` | done (PR #311) |
| PS2.74 | An accessible WC's pan far from every side wall | *Intent:* `W_WC_SIDE_CLEARANCE` checks only the minimum from a pan's centreline to a side wall; nothing checks the maximum, so an accessible WC can place its pan where no grab rail can reach (ADM Part M / ADA 604.2: centreline 400–500 mm from the side wall). The fix/examples-sound design review (2026-10-27) found it in four examples (classroom-block 1175 mm, clinic 900, transit-hall 1400, and the library WC it added), each moved by hand. *Acceptance:* a rule (or an `accessibility-advisory` threshold) fires on a pan in a room whose label or `uses` says accessible when no side wall's face is within the band; the four pre-fix positions warn, the fixed examples and every other corpus case stay silent, every moved corpus `lint()` row is explained. Class: missing check. Source: the review's PR | todo |
| PS2.75 | Shipped examples that need a room to be credible | *Intent:* the fix/examples-sound review (2026-10-27) fixed what a one-line edit could, and left these because each needs a new room: `accessible` and `attached` (a flat with no kitchen or bath), `sheet-notes` (a flat with no kitchen or bathroom), `parametric` (studios with no WC), `imports` (a studio with a stove but no sink, fridge or WC), `gallery-l` (a 132 m² public gallery with no WC), `aquarium` (a public hall with a café and no WCs). Also unproven: `transit-hall`'s escalators end about 2 m from the gate line. *Acceptance:* each example either gains the room while keeping the feature it teaches (a header that names its scope as a fragment is the alternative), with every moved corpus row explained. Class: example content, no rule. Source: the review's PR | todo |
| PS2.76 | The tiling probe and `walls from rooms` disagree beside a component hole | *Intent:* found by fix/examples-sound (2026-10-27): on an upper floor where two `place`d ensuite instances stand inside the floor (a hole in the root room group) and a `room polygon` borders that hole beside rectangle rooms, `derive()` refuses only `E_ROOM_NOT_RECTANGLE` while the probe (`test/rooms-tiling-probe.test.ts`) adds `E_ROOMS_NOT_TILING`, so `test/walls-from-rooms.test.ts` › probe agreement goes red. Witness: `hillside-villa` level 2 with the master suite as the polygon `(11600,4200) (13800,4200) (13800,10200) (8000,10200) (8000,6800) (11600,6800)` around `en_b2` at (8000,4200) and `en_m` at (11600,4200) `mirror x`; the shipped plan avoids it with a rectangular master suite and a dressing room. *Acceptance:* decide which reading is right, make the two agree on the witness, every moved corpus row explained. Class: tool disagreement. Source: the review's PR | todo |
| PS2.77 | A fixture for the multi-storey drawing overflow | *Intent:* the PR #305 red team (2026-10-27) found two coverage losses once fix/examples-sound refitted every example to its sheet. (1) `test/equivariance-storeys.test.ts` no longer has a building whose roof alone overruns its sheet: `hillside-villa`'s eaves did (the building-level `W_DRAWING_OVERFLOW`, `level` undefined, gone when the `roof` is removed), so the oracle no longer compares a building-level sheet diagnostic under the group. (2) `test/drawing-overflow.test.ts` reads every overflow case off a single-storey example as it was (or the multi-storey `garden-house`'s old sheet, by text substitution), so no shipped multi-storey plan raises the warning as authored. *Design:* one dedicated fixture, not a shipped example (examples stay warning-free): a two-storey plan with `paper` and a fixed `scale`, whose building fits and whose upper-storey `roof overhang` alone overruns the sheet. Join it to `MULTI_STOREY_EXAMPLES`-style cases in `test/equivariance-storeys-cases.ts` as a named fixture case (its `roof` test: the building-level diagnostic present with the roof and absent without it), and to `drawing-overflow.test.ts` (warns once, at building level, and `drawing_fits` is false on every storey). *Acceptance:* both assertions pass on the fixture and fail when its `roof` line is removed; no shipped example's rows move; the corpus-wide suites that sweep `test/fixtures/` re-pin only the new fixture's rows. Class: coverage. Source: PR #305's red team. As built: `test/fixtures/storeys-eaves-overflow.arch` (`two-storey`'s building, fixed A4 landscape 1:75, upper-storey `roof overhang 1000`) as `fixture:` case `FIXTURE_BUILDINGS` in both oracle cases and the overflow suite; both fail with the `roof` line removed; no example row moved, five sweeps gain the fixture's rows | done (PR #312) |

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

**PS4.3 · `keep` invariants (checked, never solved, by `compile()`).** `done` (A: PR #272, head d75a6de6, merge 6f3de966; B: PR #275, head 40bd2f7a, merge b09eee4d)
- ADR 0033; design `research/2026-10-26-ps43-keep-design.md`; as built `research/2026-10-26-ps43a-as-built.md`, `research/2026-10-26-ps43b-as-built.md`.

**PS4.4 · Brief-bound dimensions (provenance).** `done` (PR #271, c2f4176b)
- `describe().totals.gross_internal_area_m2` and the intent's `grossInternalAreaM2`/`roomDimensions`, gating; `research/2026-10-26-ps44-as-built.md`.

**PS4.5 · Contact dependency.** `done` (PR #281, head f9b60378, merge 0413af3d)
- `describe --facts depends` `contacts`, `impact` `held` via contact; `research/2026-10-26-ps45-as-built.md`.

**PS4.6 · Impact keying.** `todo`
- Diagnostics carry the element id they are about, and `arch impact` keys by it instead of by span
  containment. Then a whole-plan warning that re-attaches to another room (`W_FLOOR_UNASSIGNED`) is
  not read as one broke plus one healed, and the elements of one loop body are told apart.
- An unresolved side keys its errors to the statement. Every storey's elements are compared, not
  only the lowest storey's. Found in PR #240.
- Evidence from PS5.4 (PR #274, red-team round 1): `preview --review` keys by span too, so a warning
  from a `for` body or a component placed twice cannot be ringed on the copy it means unless a hint
  quotes an id; the sheet then rings none and says how many copies. An element id on the diagnostic
  makes that ring exact.

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

**PS4.8 · `keep` inside a component.** `todo` (after PS4.3)
- Check a component's keeps per instance in its own frame, with residual signs mapped by the
  instance's transform; until then `E_KEEP_PLACEMENT`. Source: `research/2026-10-26-ps43-keep-design.md` §11.

**PS4.9 · `keep` measures beyond v1.** `todo` (after PS4.3)
- Level-qualified datums, so `keep align` can hold a partition over a wall below (first-contact T7,
  WT8); arc, oblique and partial walls in `min clear` (counted as `skipped_walls` in v1); polygon
  room edges; furniture extents. Source: the PS4.3 design §2.1 and §11.

**PS4.10 · Keeps over Plan JSON and MCP.** `todo` (after PS4.3; with PS5.3a's version bump)
- Plan JSON drops keeps in v1, as it drops axes; carry them when a consumer needs them. MCP
  `validate`/`describe`/`impact` return `keeps` (a tool-surface change: bump `packages/mcp` and both
  `server.json` fields). Source: the PS4.3 design §7 and §11.

**PS4.11 · Plan JSON says it dropped keeps.** `done` (with PS4.3b, PR #275, head 40bd2f7a, merge b09eee4d)
- `planToJson().droppedKeeps` and a `compile -f json` stderr note; `research/2026-10-26-ps43b-as-built.md`.

**PS4.12 · Gross internal area residue.** `todo` (MCP part with PS5.3a's version bump)
- Memoise the figure: one `describe()` computes it up to three times (top level, `levels[0]`, and
  `validateIntent`'s own `describe()`), about 36 ms each on a 300-ring stress plan.
- `exterior-ring-subdivided` also fires on two rings touching at a corner, which is not a dividing
  wall: word it, or split the case.
- A court bounded only by partitions counts as floor (`courtyard-house` 175.84 m² against 163 m² on
  centrelines): subtract an `outdoor` or `void` inside the shell, as a decision with a reverse-if.
- MCP `validate` passes `intent.measures` through and serves the new schema fields.
- Source: the PS4.4 as-built note, open questions; PR #271 red-team round 1.

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

**PS5.4 · `arch preview --review`.** `done` (PR #274, head 59b2d793, merge 8c2d6150)
- As built: `research/2026-10-26-ps54-as-built.md`. The review sheet: access graph, every warned element
  ringed and numbered, legend, fixed-scale close-ups; drawing-only (CLI layer, consumes `lint()`).

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

**PS7.1 · Stages as a first-class idea.** `done` (PR #282, head c546ca3f, merge b0f89776)
- As built: `research/2026-10-26-ps71-as-built.md` (`validate --stage`, `LintRule.stage`; room graph and zoning are one `rooms` stage).

**PS7.2 · `arch context --level starter`.** `done` (PR #279, head be28101f, merge 2c7ca200)
- As built: `research/2026-10-26-ps72-as-built.md`. One screen (3,156 UTF-16 units, 59 lines of at most 100 columns; caps 4,000 / 60 / 100) built from the spec's lead example and the compiler, not retyped.

**PS7.3 · Rule packs as data.** `parked`
- Profiles and taste rules described as versioned data, each with applicability, check, failure exit,
  sources, and draft/verified-on-corpus state.
- Only if PS5 shows the rule count outgrowing code-defined profiles.

**PS7.4 · Teach the taste step where cold authors read.** `done` (PR #250, 6e0aa520; measured in PR #261, ef16e249)
- As built: `research/2026-10-25-ps5-as-built.md` § PS7.4. Measured 2026-10-26 (`audits/2026-10-26-first-contact-rerun-d15.md`, D20): teaching the step where cold authors read did not change behaviour (arm B over arm A: +1 `validate`, +1 `describe`, 0 `score`); taste is a reviewer's tool, PS7.5.

**PS7.5 · Move the taste step out of the author loop.** `done` (PR #263, f024ab4a; D20)
- As built: `research/2026-10-26-ps75-as-built.md` (a spec-text card).

**PS7.6 · `lint` opens with a one-line summary.** `done` (PR #278, head 8a78e12e, merge 52e7c71f)
- As built: `research/2026-10-26-ps76-as-built.md`.

**PS7.7 · `next` ranks class-7 blockers and earlier-stage findings before a swing shortfall.** `done` (PR #298)
- On the row-6 townhouse, plain `validate --json` names `W_SWING_OBSTRUCTED` (a WC door 85 mm short) as
  `next` while `W_STAIR_NO_LANDING` (a stair with no landing at its head, a blocker) and
  `W_STAIR_TOO_STEEP` stand; even at `--stage openings`, `next` is the swing while those earlier-stage
  stair codes are present (`audits/2026-10-26-first-contact-rerun-row6.md`, new surfaces).
- *Acceptance:* within the validity tier, `next` puts a finding of an earlier stage, and a
  stair-safety code, before a door-swing shortfall; the row-6 townhouse's `next` is a stair code; every
  moved `validate --json` digest row is explained. D13 (compile-channel warnings first) stands.
- As built: `src/next.ts` `firstValidity`: a first validity item in `SWING_SHORTFALL_CODES` yields to the first `stairs`-family code or earlier-stage finding; the row-6 townhouse's `next` is `W_STAIR_SIDE_ENTRY` (plain and `--stage openings|fixtures|drafting`), the only move over 2,905 runs (415 tracked `.arch` × plain + 6 stages); no digest pin moved.

**PS7.8 · A whole-loop arm in the next first-contact re-measure.** `done` (this PR; D26)
- Ran 2026-10-27 on `main@134765d1`: `audits/2026-10-27-first-contact-rerun-ps78.md`. Arm 1 (frozen prompt) 64 defects (4 / 29 / 31), `validate` 0 / 6, 3 authors stopped with warnings standing; arm 2 (whole-loop prompt, now in the protocol as a dated block) 56 (1 / 19 / 36), `validate` 6 / 6, `next` null 6 / 6, 0 stopped early. The arm-2 prompt was confirmed by the owner from `research/2026-10-27-ps78-arm2-prompt-draft.md`.
- The protocol's frozen per-brief prompt ("stop when it compiles", `audits/first-contact-protocol.md`
  line 56, in every run since 2026-10-24) stays unchanged as arm 1, for comparability. Under it the
  authors who stopped with warnings standing were 0 / 0 / 2 / 2 (arms A, B, C, row 6), and no row-6
  author ran `validate`, `--stage`, `context` or `preview --review`, so the uptake of author-facing
  surfaces cannot be seen (`audits/2026-10-26-first-contact-rerun-row6.md`).
- Arm 2: the same six briefs, commit, role and model, with a dispatch prompt that names the whole loop
  (compile → `validate --stage` → lint → repair, iterate until `next` is `null`). Write that prompt into
  the protocol as a second, dated prompt beside the frozen one, in the re-measure's PR; the frozen text
  is not edited (PS7.4 changed a measured surface and the instrument together).
- *Acceptance:* the next re-measure reports both arms side by side (defects by class and B/N, calls per
  verb, authors stopping with warnings standing). D26's reverse-if is read from two such re-measures.

**PS7.9 · Spec headroom: trim provable duplication before the next spec addition.** `todo` (filed 2026-10-27 by the stage-end drift audit)
- `spec.llm.md` is 29,977 UTF-16 units against `test/llm-spec-drift.test.ts`'s `< 30,000`: 23 free, so every spec addition from here pays by cuts (D22 R4 precedent), and the cap is raised only after provable duplication is trimmed (`docs/agents/iron-laws.md`). Several open cards would add spec text (PS2.73, PS7.8's teaching, any new form).
- *Design:* list the sentences the spec states twice or that describe only how something is drawn, each with the place in `docs/language-reference.md` (or a doc comment, D3) that keeps the fact, as D22 R4 did; cut them in one spec-text PR, which the next first-contact re-measure states as a measured surface (D20).
- *Acceptance:* every cut fact found in its kept place; `llm-spec-drift` green; the units freed and the new headroom recorded in `handoff.md` § 4.

**PS7.10 · `next` ranks stair codes and swing shortfalls before a furniture or fixture finding.** `done` (PR #314)
- The PS7.8 re-measure (`audits/2026-10-27-first-contact-rerun-ps78.md`, PR #309) found PS7.7 too
  narrow: on the arm-1 house, plain `validate --json`'s `next` is a 50 mm fridge/sink
  `W_FURNITURE_OVERLAP`, ahead of both blockers (XH1, XH2); on the arm-1 townhouse it is the missing
  hob (`W_ROOM_MISSING_DEFINING`), ahead of every stair code. Only `--stage rooms|walls` put a stair
  code first. PS7.7 demoted only `W_SWING_OBSTRUCTED`.
- *Acceptance:* within the validity tier only (D13's `NEXT_TIERS` unchanged), a first item of the
  `fixtures` stage yields to a stair-safety code or a door-swing shortfall standing beside it; the
  arm-1 house's `next` is XH2's master-door swing, the townhouse's a stair code; every moved `next`
  over the tracked `.arch` files × plain + 6 `--stage` values is listed with a reason, and the moved
  set stays small (a full "earlier stage first" rule moved 165 runs over 55 plans and was not taken).
- As built: `src/next.ts` `yieldsTo`/`firstValidity` (a visited set stops the chain; a test pins that
  no stair-safety code or swing shortfall is a `fixtures` code); the arm-1 townhouse's `next` is
  `W_STAIR_NO_LANDING` (plain and `--stage fixtures|drafting`). On the tree merged with #307, the
  arm-1 house's first finding is the rooms-stage `W_GARAGE_TOO_NARROW` (PS2.70), so its `next` no
  longer turns on this rule; the walls-first cafe pins the fixtures-to-swing case instead. 36 of
  3,017 runs moved (431 tracked `.arch` × plain + 6 stages; 12 plans × plain, `fixtures`,
  `drafting`), each from a fixtures finding to a stair code or swing shortfall; no digest pin moved.