# README history: measurements and closure narrative moved out of the README

Dated 2026-10-26. The README (`README.md`) had grown to the edge of its 60,000-byte cap (D16). The
blocks below are measurements and closure narrative; every decision, reverse-if and ruling stayed in the
README with a one-line pointer here. Each section is moved verbatim from the README place it names, on
2026-10-26, from `main@6f3de966`; the text is not edited, so its "below" and "above" and its
present tense are those of that day.

## D14: the "Closed 2026-10-25" bullet

Moved verbatim from README §3 D14 on 2026-10-26.

- *Closed 2026-10-25:* PS2.11a/b merged as PR #252 (486c9cb7) and PS2.11c/d as PR #253
  (43fe7fd6); the defect corpus reads 59/73 with the clearances class at 11/19 (two plans added
  for `sofa-l-transposed`), so the threshold is met and row 5 is met in full. Checked card by card:
  PS5.1–PS5.3, PS2.10, PS2.12 and PS2.11a–d are done; PS2.11e sits in row 6 with its reason. The
  first-contact hits are in the as-built records (`research/2026-10-25-ps211ab-as-built.md`,
  `research/2026-10-25-ps211cd-as-built.md`); the first-contact plans themselves are not re-run
  here, that is D15's two-arm re-measure. Costs recorded there and carried as cards: `finish`
  leaves 30 WC rooms and 16 baths of the 918-room probe empty rather than place a pan the WC rule
  refuses (PS2.45), and two examples (`tiny-house`, `hillside-villa`) carried one honest
  `W_FIXTURE_BACK_TO_ROOM` each until PS2.50 declined that rule on side-on pieces (PR #267).

*Correction 2026-10-26 (stage-end drift audit, item 11):* "honest" above is wrong. PS2.50 (PR #267, `research/2026-10-26-ps250-as-built.md`) classes both findings as the rule's false positives, removed by declining it on side-on pieces; the README text says so.

## D15: Why and Reverse if

Moved verbatim from README §3 D15 on 2026-10-26.

- *Why:* one arm cannot tell "agents ignore the score" from "the protocol never showed it to them";
  arm A holds the role fixed so the spec text alone is measured.
- *Reverse if:* arm A shows no calls: then D2's reverse-if is met, taste becomes a reviewer's tool
  (ADR 0032's consequence) and D2 is re-stated. If arm A shows calls, this entry closes and PS7.4
  is done.

## D10: body

Moved verbatim from README §3 D10 on 2026-10-26.

- Row 4 (PS0.4 PR #238, PS4.1 PR #239, PS4.2 PR #240, merged 2026-10-24) added analysis tooling only
  (`diffPlans` fixes, `describe --facts depends`, `arch impact`); it changed no language form, no
  lint rule, no example and no teaching text (`spec.llm.md` gained one generated CLI-list line), so
  a cold re-authoring would measure the same spec as #233 did hours earlier.
- *Why:* a re-measure costs a full six-brief authoring run and would return noise, not evidence;
  D7's purpose is to catch drift in what authors are taught, and nothing taught changed.
- *Reverse if:* any row-4 follow-up card (PS4.5–4.7) or a later discovery shows the row changed
  authoring-facing output; and in any case the re-measure is mandatory after row 5, which changes
  lint (PS2.10–2.12), before row 6 starts.

## D19: the "Re-measure order" bullet

Moved verbatim from README §3 D19 on 2026-10-26.

- *Re-measure order:* D10 makes a first-contact re-measure mandatory after row 5 and before row 6
  starts. The only row-5 run (#249) predates #248, #250, #252 and #253, so the row-5 re-measure is
  still owed; it runs as D15's two arms and is the first item of `handoff.md` § 4, before any
  row-6 card. PS2.45, PS2.50 and PS2.22/PS2.29 are row-5 residue and may land before it only if
  they change no measured surface the authors see (PS2.50 and PS2.22/PS2.29 change lint output and
  PS2.45 changes `finish` output, so all of them wait too).
  *Reverse if:* the owner asks for row 6 to start first; then this bullet records the waiver.
  *Closed 2026-10-26:* the re-measure ran as D15's two arms (`audits/2026-10-26-first-contact-rerun-d15.md`;
  D20); the row-5 residue and row 6 may start.

## D20: the "Measured" bullet

Moved verbatim from README §3 D20 on 2026-10-26.

- Measured: arm A (spec text only, pre-#250 role) made 0 `score --taste` and 0 `validate` calls in 65; arm B (the current role, whose loop names `validate` as step 3 and `score --taste` as step 5) made 0 `score` and 1 `validate` in 77. Both arms ran under the protocol's prompt, which names `compile|lint` and says stop when it compiles; two arm-B authors said unprompted that they skipped `score --taste`. D15's test says taste stays an author tool only if arm A shows calls. It shows none, and arm B shows that the role text alone does not change that.

## D20: the "Not changed by this run" bullet

Moved verbatim from README §3 D20 on 2026-10-26.

- Not changed by this run: the defect count is flat (49 → 52 / 54 under two auditors), blockers 0 → 1 per arm (both stairs: the stair class has no default lint rule but `W_STAIR_UNMATCHED`), rooms-first 6/6 in both arms, `facing` 0 uses in 12 plans. Row 6's content cards (PS4.3, PS4.4, PS5.4, PS7.x, PS2.11e) and the row-5 residue (PS2.45, PS2.50, PS2.22/2.29) may now start: D10's and D19's mandatory re-measure has run.

## D21: "Measured" and "What walls-first did cost"

Moved verbatim from README §3 D21 on 2026-10-26.

- Measured on the same six briefs, same day, same model, same spec, with one role section added: rooms-first (arm A) 52 defects (1 B), walls-first (arm C) 54 (1 B); without area rows 49 vs 52; CLI calls 65 vs 66; class 1 defects in the final plans 0 vs 0. The difference is within what two auditor instances and authoring chance produce (arm B, rooms-first with the other role text, scored 54).
- What walls-first did cost: three class-1 warnings at the point of writing (`W_OPENING_AT_JUNCTION` ×2, `W_OPENING_OVERLAP`), all repaired in the loop — the defects D1/D5 make unwritable were written and then caught; 45 `wall` statements and 54 hosted openings against 0 `wall` and 30 `door between` plus 1 `opening between` in arm A; two of six authors stopped with lint warnings standing (0 of 12 in the rooms-first arms), which the auditor counts as 3 caught + 2 partial. No class-2 defect (an unenclosed space: `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED`, `W_ROOM_OUTSIDE_SHELL`) fired in any arm-C loop, so the omission class D5 makes unwritable was not written by these six walls-first authors either; the three warnings written and repaired were class 1 (openings at a junction or overlapping).

## §7 row 5: the status cell

Moved verbatim from README §7 row 5 on 2026-10-26.

*Status:* met 2026-10-25 (D14): the taste acceptance holds as worded (44 pairs on 2026-10-25: 40 ordered / 0 tied / 0 reversed / 4 unjudged, ledger empty; 41/37 when #249 ran; caveats in D14); PS2.11a–d merged (PRs #252, #253); clearances 11/19; corpus 59/73. *Re-measure:* `audits/2026-10-25-first-contact-rerun-row5.md` (PR #249; ran before #248, #250, #252 and #253 merged, so the row-5 re-measure is still owed, D19): defects 48 → 49, blockers 2 → 0 (by authoring chance: no row-5 rule touches a stair), 0/6 authors ran taste or `next`. Status history verbatim: `research/2026-10-25-ps5-as-built.md` § §7 row 5

## §8 Q1: the three "Measured" lines

Moved verbatim from README §8 Q1 on 2026-10-26.

   *Measured 2026-10-24, see `audits/2026-10-24-first-contact-rerun.md`:* six cold authors on
   today's spec wrote rooms-first unprompted (6/6, 0 `wall` statements); class-1 defects fell 4 → 0
   and surviving defects 57 → 48 (area basis judged as in the baseline; 54 → 45 without it). There
   is no walls-first control arm yet.
   *Measured 2026-10-25, see `audits/2026-10-25-first-contact-rerun-row5.md`:* 6/6 rooms-first again (31 `door between`, 0 `wall`); defects 48 → 49 (46 without area basis), blockers 2 → 0; still no walls-first arm.
   *Measured 2026-10-26 (PS1.3), see `audits/2026-10-26-walls-first-control-arm.md` and D21:* the walls-first arm (arm C, the pre-#250 role plus one "write walls first" section, same spec, same day) wrote 45 `wall` statements and 54 hosted openings with 0 `walls from rooms` and 0 `door between`, and left 54 verified defects (1 B / 22 N / 31 m; 52 without area basis) against 52 (1 / 25 / 26; 49) for the rooms-first arm A and 54 for arm B; class 1 in the final plans 0 in all three, but the walls-first loops wrote three class-1 warnings (`W_OPENING_AT_JUNCTION` ×2, `W_OPENING_OVERLAP`) that lint caught, and no class-2 (unenclosed space) warning fired in any arm-C loop; CLI calls 66 against 65. Walls-first is not worse in surviving defects; what stays open is whether a spec that led with walls would change the authors' choice.

## §8 Q8: the two "Measured" blocks

Moved verbatim from README §8 Q8 on 2026-10-26.

   *Measured 2026-10-24, see `audits/2026-10-24-first-contact-rerun.md`:*
   - The old plans re-linted: 17/57 caught, 6 of them partially (14/57 counting halves), and 0 false positives.
   - The briefs re-authored cold: 48 defects (2 B), final lint 1.
   - Seats: 24/24 inverted before the lint loop, 0/24 after; `facing` used 0 times.
   - Sofas: 1/3 face their TV.
   - Exterior doors: 8/8 swing the intended way.
   *Measured 2026-10-25, see `audits/2026-10-25-first-contact-rerun-row5.md`:* 49 defects (0 B), final lint 0; seats 18/24 inverted before the loop, 0/24 after, `facing` 0; sofas 0/3 face their TV and 3 of 5 are transposed footprints; exterior doors 8/8.

## D14: the Why bullet

Moved verbatim from README §3 D14 on 2026-10-26.

- *Why:* PS2.11 is a row-5 card (the 2026-10-19 correction to row 2 moved class 5 here for it) and
  never started; the 2026-10-25 audit counts 13 of the 49 surviving defects in class 5, and the
  corpus clearances class is 5/18. The first version of this entry (PR #251's first commit) called
  the row met on the taste acceptance alone. The remainder (PS2.11e) moves because the audits hit
  it least.


## D7: the first bullet

Moved verbatim from README §3 D7 on 2026-10-26.

- Row 3 was met by PR #227 (PS3.6). PS3.7 (PR #228), PS3.8 (PR #229), PS3.5 (PR #230) and PS3.9
  (PR #232) then landed although they sat in no §7 row (PS3.5 sat in row 6); rows 4 and 5 were not
  started. PR #231 (PS0.19) fixed a pre-existing fuzz failure in the same stretch.


## §8 Q8: the first-round paragraph

Moved verbatim from README §8 Q8 on 2026-10-26.

*First round done 2026-10-18*
   (`audits/2026-10-18-first-contact.md`): six briefs written cold by an AI author from
   `spec.llm.md` alone, all six lint-clean and strict-clean, carry 57 verified defects (4 blockers),
   lint caught none, and 26 fall outside the eight classes. Twelve new classes are listed there;
   the ones that became cards: furniture not facing its companion (PS3.7), transposed footprints and
   door–door interference (PS2.11), entrance masking (PS0.10), direction-relative wording (PS3.8),
   area basis (PS4.4), non-residential egress and zoning (PS2.16), repair pressure (PS0.11 and the
   order "land PS2.1 before more corner fixes are suggested").

## D20: the Consequences bullet

Moved verbatim from README §3 D20 on 2026-10-26.

- Consequences: (a) ADR 0032 gets a 2026-10-26 addendum under Consequences recording this measurement and the re-scope. (b) PS7.4 is `done`: measured; teaching the step where cold authors read did not change behaviour (arm B over arm A: +1 `validate`, +1 `describe`, 0 `score`). (c) A new card PS7.5 moves the taste step out of the author loop in `spec.llm.md`'s self-correction paragraph (its characters return to the spec budget, which row 6's `keep` form needs), re-words SKILL step 7 as a review step, and reverts `.claude/agents/arch-author.md` to compile → `validate` `next` → lint → repair with taste under a "Review" heading; one PR, after this audit merges; the spec change is a measured surface, so the next re-measure states it. `validate --json` `next` stays taught: it is the validity ordering, not a second score, and its uptake (1 of 12) is a PS7.x staged-authoring question, not a taste one.

## D6: the Why bullet

Moved verbatim from README §3 D6 on 2026-10-26.

- *Why:* the two first-contact plans the card cites (4-cafe, 6-clinic) both carry that evidence, and
  no residential example or eval golden does; the heuristic is therefore decided by measurement, and
  the acceptance for PS2.18 is that no residential corpus row loses a warning.

## Moved 2026-10-27

The sections below were moved verbatim on 2026-10-27 from `main@f1c197ab` by the stage-end
housekeeping PR, to bring the README back under its 60,000-byte cap (D16); the same rules as above apply.

## §1: the evidence bullets

Moved verbatim from README §1 on 2026-10-27 (the eight defect classes stayed).

- **About 120 verified defects across about 30 plans; lint caught a handful.** The plans audited:
  - the ArchCanvas public examples (10 plans), with 6 blockers;
  - the ArchLang showcase (12 plans);
  - ArchLang's own `examples/`;
  - one reconstructed published plan (`repro/family-apartment.arch`).

  Default lint on that reconstructed plan returns only fixture-rotation warnings. One `arch fix` run
  plus one hand edit makes it pass `validate --strict` with every architectural defect still present.
- **Fresh plans confirm it (2026-10-18).** Six briefs written cold by an AI author from `spec.llm.md`
  alone end lint-clean and strict-clean with 57 verified defects, 4 of them blockers; lint caught
  none, and 26 fall outside the eight classes below (`audits/2026-10-18-first-contact.md`).
- **The flagship example is wrong and lints clean.** `examples/two-bed.arch` says "central corridor".
  Its access graph is a chain: hall → bathroom → master bedroom → kitchen/living → bedroom 2.
  `arch lint` returns `[]`. *(PS3.6, PR #227: re-laid with every room off the corridor, in the room-graph form.)*
- **The facts exist; no rule reads them.** On the family-apartment reconstruction, `describe --json`
  already knows that:
  - the front door opens into the kitchen;
  - the living room is 4 doors deep;
  - `d_living_bed3` actually joins bedroom 3 and bathroom 2;
  - `win_bed1` lights bedroom 2;
  - the living room touches bedrooms 3 and 4 with no wall (geometric adjacency without an access
    edge), while the walking grid walks straight through the missing wall.
- **Change has no consequences.** Making the studio example's living room 500 mm wider needs about
  24 literal edits. Changing only the room size drives the room through a wall that stays put, and
  lint reports only "rooms overlap (allowed)" and "unreachable". A `dim` whose text says 4500 over a
  4000 span lints clean.

## D18: what was taken under the entry

Moved verbatim from README §3 D18's first bullet on 2026-10-27.

Taken under this entry: D17 ratified; the executor and red-team scratch folders of
  merged PRs (2026-10-23 to 2026-10-25, 45 folders) deleted because their evidence lives in the
  dated `research/` and `audits/` files and the PR bodies; the 2026-10-18 audit scratch kept as
  instructed. Not ruled on (not named by the owner): the remote branch `docs/archlang-3d-plan` and
  the stray worktree directory `.claude/worktrees/agent-a1314d858f0b8b0cb`, both the owner's.

## D22 R4: as built

Moved verbatim from README §3 D22's R4 bullet on 2026-10-27.

*As built (PS4.3a, PR #272):* the keep line is 483 units, `spec.llm.md` 29,815 UTF-16 units, headroom 185, after red-team rounds 1 and 2 added the placement words (`research/2026-10-26-ps43a-as-built.md`).

## §8 Q1: the scheduling sentence

Moved verbatim from README §8 Q1 on 2026-10-27.

*Scheduled:* it needs the PS3 forms
   to exist, so it runs after row 3 of §7. Until then the first-contact experiment under question 8
   measures the wall-first baseline (`audits/2026-10-18-first-contact.md`). The walls-first control
   arm is card PS1.3 (filed 2026-10-25; run 2026-10-26, below).

## §8 Q8: the 2026-10-26 "Measured" sentence

Moved verbatim from README §8 Q8 on 2026-10-27.

*Measured 2026-10-24, 2026-10-25 and 2026-10-26 (D20):* seats, sofas, exterior doors and the old plans
   re-linted are in the three `audits/` re-runs; the 10-24 and 10-25 blocks verbatim:
   `research/2026-10-26-readme-history.md` § §8 Q8.

## §1: the note on the baseline

Moved verbatim from README §1 on 2026-10-27.

*This section is the 2026-10-18 baseline, kept as written because it is the evidence the plan was
made from. Much of it is no longer true of `main`: the rules it says are missing now exist (45 lint
rules, 22 new `W_*` codes), the dimension that "lints clean" raises `W_DIM_TEXT_MISMATCH`, the
family-apartment reconstruction lints 33 warnings over 11 codes, and the coverage report says what was
not checked. Today's state is `handoff.md` § 1 and § 3.*

## D20: the Consequences summary

Moved verbatim from README §3 D20 on 2026-10-27 (the full text is § D20: the Consequences bullet, above).

- Consequences: (a) ADR 0032 gets a 2026-10-26 addendum under Consequences. (b) PS7.4 is `done`: measured, teaching the step where cold authors read did not change behaviour. (c) PS7.5 moves the taste step out of the author loop (spec self-correction paragraph, SKILL step 7 as a review step, `.claude/agents/arch-author.md` back to compile → `validate` `next` → lint → repair with taste under "Review"); the spec change is a measured surface the next re-measure states. `validate --json` `next` stays taught: it is the validity ordering, not a second score. Full text: `research/2026-10-26-readme-history.md` § D20 Consequences.

## §8 Q3: the "Measured" sentence

Moved verbatim from README §8 Q3 on 2026-10-27; its open follow-ups are card PS1.8.

*Measured 2026-10-26 (PS1.4):* `research/2026-10-26-ps14-diagnostic-wording.md`. Over 59 corpus cases on two local models, the current message + hint
   repaired best on both (51/59 sonnet, 48/59 haiku), but by 1 case on sonnet, under the 3-case margin, so no wording rule yet; open: repeat draws, a third model, the spec in context, a `cause`-derived rule arm.

## §8 Q5: the "Designed" sentence

Moved verbatim from README §8 Q5 on 2026-10-27.

*Designed 2026-10-26 (PS4.3, PR #270):* `research/2026-10-26-ps43-keep-design.md`, ADR 0033 (Accepted, PR #272): a keep is checked with a signed residual and `impact` lists those a change breaks; listing the edits that keep them all true stays `arch solve` (PS6.1).

## §7 row 6: the status sentence

Moved verbatim from README §7 row 6 on 2026-10-27.

*Status:* every card landed (PRs #267–#283) and the D10 re-measure ran (`audits/2026-10-26-first-contact-rerun-row6.md`: 61 defects against 52 / 54 / 54, 12 reported by lint, the stair blocker named by lint, the residual families unchanged). The review-sheet clause is false as built inside repeated statements (`p2-for` 0 of 2 marks ringed, `p10-loopfurn` 5 of 8, `p3-place` 4 of 6; PS5.4 as-built): **PS4.6** is the remainder.

## §9: the file list

Moved verbatim from README §9 on 2026-10-27, where a shorter index replaced it; its
descriptions of each file stand. Files added since are named in the new index.

- `README.md`: this plan.
- `handoff.md`: the resume point — state, open work in order, how the work is run (re-written at
  every stage end).
- `cards.md`: every card of §6, with its table, id and status (D16).
- `research/2026-10-25-ps211ab-as-built.md`, `research/2026-10-25-ps211cd-as-built.md`: the four
  clearance rules as built, their first-contact hits, corpus movements and the `finish` sweep.
- `audits/first-contact-protocol.md`: the six briefs, the dispatch prompts, the rubric, the arm A
  role-text pointer and the re-measure checklist that D15 needs (PR #257, 053ba3f8).
- `evidence.md`: what was measured, the bug list and the defect taxonomy.
- `research/checks-inventory.md`: every current check, the authoring-model facts, governing ADRs,
  and the gap list with code locations.
- `research/prior-art.md`: LLM floor-plan work, rule checking, codes and thresholds, DSL design
  evidence.
- `research/associativity.md`: Revit, ArchiCAD, FreeCAD, IFC/Bonsai, Sweet Home 3D, SolveSpace and
  Topologic at source level, plus the full P1–P7 design (datums, `between`, `impact`, `keep`,
  `solve`, the ladder, selectors).
- `research/design-taste.md`: 37 sourced rules, ResPlan priors (16,317 plans) and the score design.
- `research/adai-sketchup.md`: lessons from a staged, evidence-gated SketchUp agent (ideas only;
  CPAL licence).
- `research/2026-10-18-room-tiling.md`: do rooms already tile the building? (the D5 premise).
- `research/2026-10-18-furniture-and-multistorey.md`: furniture relations in Holodeck, Infinigen,
  LayoutVLM, IFC, Revit and Sweet Home 3D, plus twelve multi-storey/multi-dwelling rules with clause
  numbers and a fact-sufficiency table (cards PS3.7, PS2.14–PS2.16).
- `audits/archcanvas-public-examples.md`, `audits/showcase-and-examples.md`: per-plan defects with
  coordinates.
- `audits/2026-10-18-first-contact.md` and `audits/first-contact-plans/*.arch`: six briefs written
  cold by an AI author, lint-clean, 57 verified defects, twelve classes outside the taxonomy.
- `audits/2026-10-24-first-contact-rerun.md`: the same, re-measured after row 3 (D7).
- `audits/2026-10-25-first-contact-rerun-row5.md`: the same, re-measured after row 5 (D10, D14).
- `audits/2026-10-26-first-contact-rerun-d15.md` and `audits/first-contact-plans/2026-10-26-rerun-arm{A,B}/*.arch`:
  the same, re-measured after row 5 as D15's two arms (A: pre-#250 role, B: current role); 52 and 54
  verified defects, 0 and 0 `score --taste` calls; D20.
- `audits/2026-10-26-walls-first-control-arm.md` and `audits/first-contact-plans/2026-10-26-walls-first/*.arch`:
  PS1.3, the walls-first control arm of the same run (arm C); 54 verified defects against 52 for arm A; D21.
- `research/2026-10-24-ps5-taste-design.md`: the PS5 taste layer design (row 5).
- `research/2026-10-26-ps43-keep-design.md`: the PS4.3 `keep` design and ADR 0033's reasons (row 6).
- `research/2026-10-26-ps229-as-built.md`, `-ps245-`, `-ps250-`, `-ps43a-`, `-ps44-`, `-ps75-as-built.md`:
  the 2026-10-26 as-built records (PS2.22/2.29, PS2.45, PS2.50, PS4.3a, PS4.4, PS7.5).
- `research/2026-10-26-readme-history.md`: measurements and closure narrative moved out of this README
  on 2026-10-26, verbatim.
- `research/2026-10-24-ps0-ps2-as-built.md`, `research/2026-10-24-ps3-as-built.md`,
  `research/2026-10-25-ps5-as-built.md`: landed cards' as-built notes, verbatim (the last also
  holds row 5's PR rulings, §7 rows 1–5 as they stood, and D5/D6 detail).
- `repro/`: minimal reproductions (see its README).

## §6 PS1: the count line

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:

8 cards: 4 done, 4 todo (PS1.5 two message slips, PS1.6 two clean twins that are not clean, PS1.7 the `eval:ci` gate's blind spots, PS1.8 the wording study's follow-ups); PS1.3 walls-first control arm done 2026-10-26 (D21); PS1.4 diagnostic wording measured 2026-10-26 (no rule). PS1.3 and PS1.4 were filed 2026-10-25 from the owner's 2026-10-18 asks, PS1.5 on 2026-10-26 from PS7.2's red team, PS1.6 on 2026-10-26 from PS1.4, PS1.8 on 2026-10-27 from §8 Q3. Cards, tables and as-built pointers: `cards.md` § PS1.

## §8 Q8: the 2026-10-27 cut

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:

The defect classes
   in §1 came from about 30 plans and are surely incomplete. *First round done 2026-10-18* (`audits/2026-10-18-first-contact.md`): 57 verified defects, 26 outside
   the eight classes, twelve new classes listed there (most became cards; the list verbatim:
   `research/2026-10-26-readme-history.md` § §8 Q8: the first-round paragraph). Still uncarded:

## §8 Q6: the still-open sentence

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:

Still open: wet-stack rules need a riser fact and no
   authoritative spacing number was found; several clause texts were read only from secondary
   sources (the file's verification log says which) and must be read in the standard before a
   number ships in a message (D3).

## §8 Q1: the answer sentence

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:

*Answered to that extent 2026-10-26 (PS1.3, D21):* walls-first is not worse in surviving defects (54
   against 52); what stays open is whether a spec that led with walls would change the authors' choice.
   The 10-24, 10-25 and 10-26 measurements: `research/2026-10-26-readme-history.md` § §8 Q1.

## §8 Q8: the re-run sentence

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:


   Re-run with each first-contact re-measure, and count the furniture turn (PS2.11c's
   `W_FOOTPRINT_TRANSPOSED` now catches the turned-footprint half; the `rotate` half is PS2.50).
   Measured on every re-run since: `research/2026-10-26-readme-history.md` § §8 Q8.

## §8 Q7: the researched sentence

Moved 2026-10-27 by the row-7 tranche-2 housekeeping, verbatim:

*Researched 2026-10-18* (same file, Part A): became card
   PS3.7. Still open: no evidence on how often agents get a furniture turn wrong; the first-contact
   audit should count it.

## D26: the PS7.8 run result

Moved verbatim from README §3 D26 on 2026-10-28 (D27 ratification records PR), from `main@8829a8bb`:

- *Run result (PS7.8, 2026-10-27, `audits/2026-10-27-first-contact-rerun-ps78.md`, `main@134765d1`):*
  the frozen arm drew 64 defects (4 / 29 / 31), `validate` 0 / 6, 3 authors stopping with warnings
  standing; the whole-loop arm drew 56 (1 / 19 / 36), `validate` 6 / 6 (`--stage` 4 / 6, batched,
  never gated), every plan lint-clean with `next` null, 0 stopping early, and final lint reports 0 of
  its 56: the loop removes what lint sees and leaves the no-rule families. First read of the
  reverse-if: not met (fewer defects); one more re-measure with both arms decides it.
