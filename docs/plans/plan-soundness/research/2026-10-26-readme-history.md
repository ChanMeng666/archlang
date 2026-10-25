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
