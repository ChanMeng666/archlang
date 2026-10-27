# Row 7 as built: tranche 1 and tranche 2 card texts (2026-10-27)

The `cards.md` rows and blocks of the row-7 cards that landed on 2026-10-27, moved here verbatim
when each was cut to its `done` line (README §8; the row-7 tranche-2 housekeeping). Per-card
landing notes, where a card has one: `2026-10-27-ps266-as-built.md`, `2026-10-27-ps267-as-built.md`,
`2026-10-27-ps269-as-built.md`, `2026-10-27-ps270-as-built.md`; sources: `2026-10-27-ps267-271-sources.md`;
the PS7.8 run: `../audits/2026-10-27-first-contact-rerun-ps78.md`.

## PS2.64

| PS2.64 | `W_HOB_UNDER_WINDOW` on a hob beside a window on a return wall | *Intent:* the rule counts a hob as under a window when its footprint reaches the band `fixtureWallTolMm` (300 mm) either side of the window wall's centreline (`windowCover`, `src/lint/clearance-measure.ts:324-337`; the rule at `src/lint/rules/clearances.ts:222-224`), and never asks whether the hob backs onto that wall. The 2026-10-18 apartment's stove backs onto the north wall, 125 mm off the east wall's face; a 50 × 75 mm corner enters the band of the east window, so it warns, and its hint sends the stove "along the wall" it is not against. In the 11 other firings over the first-contact plans the hob backs onto the window wall (distance 0). *Acceptance:* a hob warns only when its back edge lies on the window's host within the same tolerance; the 2026-10-18 apartment goes silent, the 11 true firings and every corpus case stay, and every moved corpus `lint()` row is explained. Class: false positive (rule fix). Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1 (the kitchen as-built record counted this hit as true) | done (PR #296): as built, the hob must also stand against the window's host, its side nearest the host no more than `WALL_COLLISION_SLACK_MM` (30 mm) off the face (`hobWindowCover`), not its `rotate` back edge, which drops RS3 and the repro apartment (an unturned or side-on stove at the wall); only the 2026-10-18 apartment moves |

## PS2.65

| PS2.65 | `W_DOORWAY_BLOCKED` judges a vehicle door as a pedestrian doorway | *Intent:* under `accessibility-advisory` the 2026-10-18 house's 2400 mm `garage` door warns that "Car" leaves 375 mm of its 450 mm approach (the face datum, PS2.54, moved it from 500): the blocker is the car the door exists for. Leave `garage` doors out of the approach check, as `W_LEAF_TOO_WIDE` leaves out leaf-less kinds (`src/lint/rules/doors.ts`), or judge only a pedestrian door beside one. *Acceptance:* that a11y line goes; no other corpus or first-contact row moves. Class: false positive (rule fix). Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1 | done (PR #297): `W_DOORWAY_BLOCKED` and `repair`'s doorway census skip `garage` doors; only the 2026-10-18 house's a11y "Car" row moves |

## PS2.66

| PS2.66 | A bathroom with a WC and no basin | *Intent:* `W_ROOM_MISSING_DEFINING` defines a `bath` by its bathtub or shower alone (`src/lint/defining.ts`), so a family bathroom holding a tub and a WC and no basin passes (QH7). Warn when a `bath` room holds a WC and no basin; a `wc` room stays defined by its WC alone (a cloakroom without a basin is common, as the module says). *Acceptance:* the row-6 house warns; the corpus clean twins stay silent. *Open:* a bath whose basin stands in an adjoining dressing room. Class 4. Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QH7) | done (PR #301): `W_ROOM_MISSING_DEFINING` also reports a `bath` that holds a WC and no basin, unless a basin stands in a directly joined non-kitchen room (AD G4) |

## PS2.67

| PS2.67 | A bed drawn under the smallest standard bed | *Intent:* an authored `size` below a sourced minimum for its family passes silently: the clinic's exam couches drawn as `bed` 1500 × 700, cut from 1900 (QK2); `W_FOOTPRINT_TRANSPOSED` reads only the catalogue's aspect. Narrowed 2026-10-27 by owner-delegated decision (main session) to BEDS only: the shower tray (QS5; no sourced minimum, 700 × 700 trays are sold) and the exam couch (no catalogue family, no read source) are out of scope, each a new card when a source is read. Warn when a `bed`, `double_bed` or `bunk_bed` (never `crib` or `cot`) is drawn under 1900 mm long (its longer side) or 750 mm wide (its shorter), naming the minimum and its source; both figures are ruleset values a profile or caller may override (`bedMinLengthMm`, `bedMinWidthMm`). Source: Which?, "UK mattress sizes: bed and mattress size guide" (8 May 2026), its table of standard UK sizes, small single 75 × 190 cm the smallest; graded [M], a consumer magazine, not a standard (`research/2026-10-27-ps267-271-sources.md`). *Reverse-if:* a normative standard (BS, EN, GB/T 3328-2016's size table) read with a different minimum replaces these figures, as a profile value where it is national. *Acceptance:* the row-6 clinic warns (its 1500 × 700 couches drawn as `bed`); a 1500 × 700 `bed` warns and the same bed at 900 × 1900 does not (defect-corpus twin); `crib` and `cot` never warn; every tracked `.arch` measured before and after under the default and every profile, each moved `lint()` row explained; `examples/` stays warning-free under the default profile. Class 5. Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QK2) | done: `W_BED_UNDERSIZED`, 1900 × 750 mm default; the row-6 clinic warns, no example moves (record: `research/2026-10-27-ps267-as-built.md`) |

## PS2.69

| PS2.69 | Furniture in front of an exterior exit | *Intent:* `W_DOORWAY_BLOCKED` reads an approach of 300 mm (450 under the a11y profile), so the clinic's waiting sofa, 500 mm off the façade and in front of 600 of the 1200 mm main exit, passes in both profiles (QK4; OK5's egress half before). Warn when furniture within an egress depth in front of an exterior exit leaves less clear width than the door's. A sibling of PS2.16. Sourced 2026-10-27: 914 mm clear in front of the inside face (IRC R311.3), 1220 push / 1525 pull under `accessibility-advisory` (ADA 2010 404.2.4.1); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 clinic warns; the corpus clean twins stay silent. Needs a sourced depth. Class: new (egress). Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QK4) | done (PR #308): W_EXIT_APPROACH_BLOCKED, 914 mm default (IRC R311.3, second-hand), 1220/1525 a11y (ADA 404.2.4.1); the row-6 clinic warns |

## PS2.70

| PS2.70 | `W_GARAGE_TOO_NARROW` judges depth too | *Intent:* the rule judges a garage's width only (`src/lint/rules/per-room.ts`), so a garage about 3000 mm deep along its vehicle door's axis passes (QH5; OH5, CH5, NH4, RH5 before). Judge the clear depth along the vehicle door's axis against a sourced figure, keeping a double garage silent. Sourced 2026-10-27: clear depth 5000 by default (a bay or car-port length), 6000 × 3000 under `uk-residential-advisory` (Monmouthshire SPG 2013 ¶12, ¶21, citing Manual for Streets; Buckinghamshire parking guidance Tables 9, 11); see `research/2026-10-27-ps267-271-sources.md`. *Acceptance:* the row-6 house warns; `examples/hillside-villa.arch`'s double garage stays silent. Class: new (advisory size). Source: `audits/2026-10-26-first-contact-rerun-row6.md` (QH5) | done (PR #307): depth between wall faces along the vehicle door's axis, 5000 mm default / 6000 uk; the row-6 house warns, hillside-villa silent by default |

## PS2.72

| PS2.72 | `describe --facts clearances` | *Intent:* no CLI surface reproduces a clearance rule's numbers: `describe --facts` prints rooms and areas, so the row-6 Part 1 auditor re-measured every hob, doorway and stair figure with `resolveAll` in a script. An opt-in facet printing what each clearance rule measured (a hob's cover of a window, a doorway's approach and clear width, a stair's landing lengths and run) lets a reviewer check a warning, or its absence, from the CLI. *Acceptance:* the Part 1 figures (the 2026-10-18 apartment's 50 × 75 mm hob corner, the 2026-10-18 townhouse's 275 mm landing) are read from the facet; `describe()` without the flag is byte-identical. Class: tool. Source: `audits/2026-10-26-first-contact-rerun-row6.md` Part 1. *As built:* `src/lint/clearance-facts.ts` reads the rules' own measures on `lint()`'s storey contexts (`src/lint/storeys.ts`); both figures pinned, and the facet's short rows held equal to `lint()`'s warnings over the corpus, in `test/describe-clearances.test.ts` | done (PR #311) |

## PS2.74

| PS2.74 | An accessible WC's pan far from every side wall | *Intent:* `W_WC_SIDE_CLEARANCE` checks only the minimum from a pan's centreline to a side wall; nothing checks the maximum, so an accessible WC can place its pan where no grab rail can reach (ADM Part M / ADA 604.2: centreline 400–500 mm from the side wall). The fix/examples-sound design review (2026-10-27) found it in four examples (classroom-block 1175 mm, clinic 900, transit-hall 1400, and the library WC it added), each moved by hand. *Acceptance:* a rule (or an `accessibility-advisory` threshold) fires on a pan in a room whose label or `uses` says accessible when no side wall's face is within the band; the four pre-fix positions warn, the fixed examples and every other corpus case stay silent, every moved corpus `lint()` row is explained. Class: missing check. Source: the review's PR | done (PR #313): `W_ACCESSIBLE_WC_SIDE_WALL`, label says accessible (not negated), 500 mm (ADM M4(2)/M4(3), ADA 604.2), `wide-wc-pan` skip; the four pre-fix positions warn; `museum` and `practice-office` fixed too |

## PS2.77

| PS2.77 | A fixture for the multi-storey drawing overflow | *Intent:* the PR #305 red team (2026-10-27) found two coverage losses once fix/examples-sound refitted every example to its sheet. (1) `test/equivariance-storeys.test.ts` no longer has a building whose roof alone overruns its sheet: `hillside-villa`'s eaves did (the building-level `W_DRAWING_OVERFLOW`, `level` undefined, gone when the `roof` is removed), so the oracle no longer compares a building-level sheet diagnostic under the group. (2) `test/drawing-overflow.test.ts` reads every overflow case off a single-storey example as it was (or the multi-storey `garden-house`'s old sheet, by text substitution), so no shipped multi-storey plan raises the warning as authored. *Design:* one dedicated fixture, not a shipped example (examples stay warning-free): a two-storey plan with `paper` and a fixed `scale`, whose building fits and whose upper-storey `roof overhang` alone overruns the sheet. Join it to `MULTI_STOREY_EXAMPLES`-style cases in `test/equivariance-storeys-cases.ts` as a named fixture case (its `roof` test: the building-level diagnostic present with the roof and absent without it), and to `drawing-overflow.test.ts` (warns once, at building level, and `drawing_fits` is false on every storey). *Acceptance:* both assertions pass on the fixture and fail when its `roof` line is removed; no shipped example's rows move; the corpus-wide suites that sweep `test/fixtures/` re-pin only the new fixture's rows. Class: coverage. Source: PR #305's red team. As built: `test/fixtures/storeys-eaves-overflow.arch` (`two-storey`'s building, fixed A4 landscape 1:75, upper-storey `roof overhang 1000`) as `fixture:` case `FIXTURE_BUILDINGS` in both oracle cases and the overflow suite; both fail with the `roof` line removed; no example row moved, five sweeps gain the fixture's rows | done (PR #312) |

## PS7.7

**PS7.7 · `next` ranks class-7 blockers and earlier-stage findings before a swing shortfall.** `done` (PR #298)
- On the row-6 townhouse, plain `validate --json` names `W_SWING_OBSTRUCTED` (a WC door 85 mm short) as
  `next` while `W_STAIR_NO_LANDING` (a stair with no landing at its head, a blocker) and
  `W_STAIR_TOO_STEEP` stand; even at `--stage openings`, `next` is the swing while those earlier-stage
  stair codes are present (`audits/2026-10-26-first-contact-rerun-row6.md`, new surfaces).
- *Acceptance:* within the validity tier, `next` puts a finding of an earlier stage, and a
  stair-safety code, before a door-swing shortfall; the row-6 townhouse's `next` is a stair code; every
  moved `validate --json` digest row is explained. D13 (compile-channel warnings first) stands.
- As built: `src/next.ts` `firstValidity`: a first validity item in `SWING_SHORTFALL_CODES` yields to the first `stairs`-family code or earlier-stage finding; the row-6 townhouse's `next` is `W_STAIR_SIDE_ENTRY` (plain and `--stage openings|fixtures|drafting`), the only move over 2,905 runs (415 tracked `.arch` × plain + 6 stages); no digest pin moved.

## PS7.8

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

## PS7.10

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
