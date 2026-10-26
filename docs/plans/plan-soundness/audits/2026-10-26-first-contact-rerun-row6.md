> Research record, 2026-10-26 (run) and 2026-10-27 (audit), against `main@24a8afa2` (PR #283; built
> CLI `archlang v1.43.1`, `dist/cli.js`). Read observations as evidence and diagnoses as hypotheses:
> re-measure before you build on a number. Programme entry: `../README.md` (D26). Protocol:
> `first-contact-protocol.md`, not changed by this run. Baselines: `2026-10-18-first-contact.md` (57
> defects, A1–K11), `2026-10-24-first-contact-rerun.md` (48, NA1–NK7),
> `2026-10-25-first-contact-rerun-row5.md` (49, RA1–RK7), `2026-10-26-first-contact-rerun-d15.md`
> (arms A and B: 52, OA1–OK8; 54, CA1–CK8) and `2026-10-26-walls-first-control-arm.md` (arm C: 54,
> WA1–WK8). This is the D10 re-measure that closes §7 row 6. One arm: the `arch-author` role as it
> stands on the commit under test. The six plans: `first-contact-plans/2026-10-26-rerun-row6/`. Ids
> carry the run prefix `Q` (QA1, QH1, QS1, QC1, QT1, QK1).

# First-contact re-measure closing §7 row 6

## Headline

The comparison with the three arms of the 2026-10-26 run, verbatim from the Part 2 audit:

| Measure | 2026-10-26 arm A | arm B | arm C (walls-first) | row 6 (`24a8afa2`) |
|---|---|---|---|---|
| Role as loaded | `compile → fix → describe → lint` | `… → score --taste → repair` | A + walls-first | `compile → validate → lint → repair`, staged `--stage` |
| Defects (B / N / m) | 52 (1 / 25 / 26) | 54 (1 / 20 / 33) | 54 (1 / 22 / 31) | **61 (2 / 26 / 33)** |
| …without area-basis rows | 49 | 51 | 52 | **58** |
| …reported by final default lint | 0 | 0 | 3 + 2 partial | **12** (house 5, townhouse 7) |
| Blockers | 1 (OT1) | 1 (CT1) | 1 (WT1) | **2** (QH1, QT1), both reported by lint and left standing |
| Lint-clean plans | 6 / 6 | 6 / 6 | 4 / 6 | **4 / 6** |
| Authors stopping with warnings standing | 0 | 0 | 2 (café 6, townhouse 1) | **2** (house 21, townhouse 14) |
| CLI calls c / l / d / v / s | 27 / 37 / 1 / 0 / 0 (65) | 32 / 42 / 2 / 1 / 0 (77) | 31 / 34 / 1 / 0 / 0 (66) | **27 / 32 / 1 / 0 / 0 (60)** |
| Authors running score / validate / describe | 0 / 0 / 1 | 0 / 1 / 1 | 0 / 0 / 1 | **0 / 0 / 1** (output discarded) |
| Class 4 / 5 / 7 / 8 / relation (dual-class rows counted in both) | 6 / 15 / 3 / 8 / 5 | 10 / 11 / 3 / 9 / 5 | 8 / 14 / 2 / 10 / 4 | **10 / 19 / 3 / 10 / 6** |
| Sofas facing their TV | 0 / 2 | 1 / 2 | 0 / 3 | **0 / 3** |
| Hinged exterior doors opening the intended way | 7 / 7 | 7 / 8 | 9 / 9 | **8 / 8** |
| Taste, final plans | 0.72 – 0.97 | 0.71 – 0.98 | 0.50 – 0.94 | **0.50 – 0.94** (house and townhouse capped) |

The rest of the protocol's headline rows, for this run:

| Measure | Row 6 |
|---|---|
| Earlier runs, verified defects (B / N / m) | 2026-10-18: 57 (4 / 26 / 27); 2026-10-24: 48 (2 / 24 / 22); 2026-10-25: 49 (0 / 23 / 26) |
| Rooms-first (`walls from rooms`, no `wall` statement) | **6 / 6** (30 `door between`, 4 `opening between`, 0 `wall`) |
| Class 1, openings ignore walls | **0** (no class-1 row among the 61) |
| Chairs at a table facing away: before the loop / final | **4 / 24 → 0 / 24** (the café's first lint, `W_SEAT_FACING_AWAY` ×4, repaired by `rotate 180`); `facing` used 0 times |
| Part 1: new default `lint` warnings on the thirty-six earlier plans (D15 CLI `747eed00` → row-6 CLI `24a8afa2`) | **42**: 39 true, 1 false positive, 2 arguable, 0 lost |
| Part 1: accessibility profile | **+46 net**, 5 of them new to the profile (1 false positive, 1 arguable) |
| `score --taste generic`, the thirty-six earlier plans, re-scored | 8 moved, each from uncapped to **0.5 capped**; every uncapped score unchanged |
| Taste concordance (A ∪ B ∪ C) | 58 pairs: 53 ordered, 0 tied, 0 reversed (0 ledgered), 5 unjudged |
| Defect-corpus catch rate | **72 / 79** (clearances 16 / 21, stair safety 8 / 8) |

**Read every column by class and by blockers and noticeables, not by the minor count.** One opus
auditor audited row 6's six plans (Part 2) and an opus auditor run separately judged Part 1; each arm
of 2026-10-26 had its own auditor (same model, brief and rubric). The only numeric auditor spread on
record is D15's two auditors on arms A and B: 26 against 33 minor rows and 25 against 20 noticeables.
The Part 2 auditor's own words: "Auditor-instance spread applies to every column, so compare by class
and by B/N, not by the m count." Part 1's verdicts are likewise one instance's; the kitchen as-built
record judged one of its hits differently (Part 1, cross-check). One draw per brief: 61 against
52 / 54 / 54 is inside the spread the earlier runs show between themselves (57, 48, 49).
- **"12 of 61 reported" is not a gain.** All 12 are on the house and the townhouse, the two plans
  whose authors stopped early with 21 and 14 warnings standing; the four plans run to clean report 0,
  as every arm before did. Blockers are 2 against 1 per arm.

What changed between the D15 run (`main@747eed00`) and this one, from `git log 747eed00..24a8afa2`
(123 commits, PRs #261–#285):
- **Lint:** six stair rules (PS2.11e stairs, PS2.15, PS2.34; PR #280): `W_STAIR_NO_LANDING`,
  `W_STAIR_SIDE_ENTRY`, `W_STAIR_TOO_STEEP`, `W_SWING_OVER_STAIR`, `W_STAIR_HEAD_VOID`,
  `W_SHAFT_FOOTPRINT_MISMATCH`; three kitchen and door rules (PS2.11e, PS2.46; PR #283):
  `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP`, `W_LEAF_TOO_WIDE`, with `W_DOORWAY_BLOCKED` extended to
  cased openings and measured from the wall face (PS2.54, D25); PS2.50 (PR #267); id-free messages
  (PS2.22/PS2.29, PR #269).
- **Surfaces an author could see:** `keep` (PS4.3, PRs #272, #275); gross internal area in
  `describe` (PS4.4, PR #271); `validate --stage` and the stage-ordered loop in the spec, SKILL and
  role text (PS7.1, PR #282); the `lint`/`validate` `summary` line (PS7.6, PR #278);
  `context --level starter` (PS7.2, PR #279); `preview --review` (PS5.4, PR #274); `door double`
  (PR #283); the taste step out of the author loop (PS7.5, PR #263).
- The rest: `finish` wet rooms (PS2.45), `impact` contact (PS4.5), the PS1.3 and PS1.4 studies, a CLI
  stdout flush fix (PR #285), two external fixes (PRs #262, #265), CI and documentation.

## Method and commands

Every number comes from one of these, run on `main@24a8afa2` after `npm run build` (Part 1's base side
on `main@747eed00`, the D15 commit, with the arm-B worktree's build):

```sh
node dist/cli.js lint <plan> --json                                    # default ruleset
node dist/cli.js lint <plan> --json --profile accessibility-advisory   # a11y profile
node dist/cli.js score <plan> --taste generic --json                   # taste report
node dist/cli.js validate <plan> --json                                # `next`; also --stage <s>
node dist/cli.js describe <plan> --json                                # access.entrances, totals
node dist/cli.js compile <plan> -f json -o plan.json                   # geometry for the defect audit
npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts   # catch rate, concordance
npx vitest run test/rooms-tiling-probe.test.ts
npx vitest run test/lint-dwelling-reading.test.ts test/main-entrance.test.ts \
  test/room-too-small-by-use.test.ts test/swing-building.test.ts
```

**Run settings** (protocol steps 2, 3 and 5):

| Setting | Row 6 |
|---|---|
| Commit under test | `main@24a8afa2` (PR #283's merge) |
| Built CLI | `archlang v1.43.1` (`npm run build` in a detached worktree) |
| Arms | **one**: the role as it stands on the commit under test. D20 settled D15's question (taste is a reviewer's tool, measured with arms A and B on 2026-10-26), so the two-arm design that tested it is no longer needed; a pre-#250 arm would measure nothing row 6 changed |
| Role as loaded (the dispatching session's own agent listing, copied before dispatching, `replies.md`) | `arch-author: Authors or edits .arch floor-plan files using the compiler's own verification loop (compile → validate → lint → repair). Use for any task that writes ArchLang source. (Tools: Read, Write, Edit, Bash, Glob, Grep)` |
| Role body, the loop and its stop | "The loop is compile → `validate --json` (fix its `next` first) → lint → repair. Run it one stage at a time …" and "Repeat from step 1 until `compile` reports zero errors, `validate`'s `next` is `null` and `lint` is clean (or every remaining warning is a deliberate, justified choice)." (`.claude/agents/arch-author.md`) |
| Dispatcher | one headless `claude -p` session (model sonnet, `--dangerously-skip-permissions`, `--output-format json`) started in the run's worktree; its prompt is arm B's with the paths changed (`lead-r6.txt`, made by text substitution from `lead-armB.txt`) |
| Authors | six `arch-author` subagents, all six dispatched in one message, model `claude-sonnet-5-5` (inherited; the role file sets none), no follow-up, no nudge |
| Per-brief prompt | the protocol's 2026-10-24/25 prompt verbatim, `<run-folder>` `2026-10-26-rerun-row6`; it names `compile\|lint` only and says "stop when it compiles" |
| Files the authors read | `spec.llm.md` only (29,977 UTF-16 units) |
| CLI call counting | a shim at `dist/cli.js` appended every invocation's argv to `calls-r6.jsonl` (60 lines) and ran the real build (`dist/cli.real.js`); the shim is authoritative. The auditors ran `dist/cli.real.js` directly, so the log stayed at 60 lines |
| Wall time and cost | dispatcher session, start to last reply, about **2.7 min** (00:03:05 → 00:05:47 local), **$1.38** (API-metered; arms A and B $1.82, $1.62). Shim log, first to last CLI call: arm A **11.7 min**, arm B **2.4**, arm C **2.4**, row 6 **1.6** (`calls-armA/B/C.jsonl`, `calls-r6.jsonl`; recounted for this record) |
| Auditors | Part 2 one opus auditor; Part 1 an opus auditor run separately; both read-only, neither wrote to the repository |

**The stopping rule is a protocol confounder, recorded and not fixed here.** The per-brief prompt
says "stop when it compiles"; the role says repeat until `next` is `null` and lint is clean. Four
authors followed the role and ran to clean; two followed the prompt and stopped with 21 and 14
warnings standing (Part 2). This run does not change the protocol: PS7.4 changed a measured surface
and the measuring instrument together, and the next re-measure could not tell which had moved the
number. D26 (README) keeps the frozen prompt for comparability and adds a second arm to the next
re-measure whose prompt names the whole loop (card PS7.8).

**Part 1** re-linted the thirty-six earlier plans (`first-contact-plans/` and the folders
`…/2026-10-24-rerun/`, `…/2026-10-25-rerun/`, `…/2026-10-26-rerun-armA/`, `…/2026-10-26-rerun-armB/`,
`…/2026-10-26-walls-first/`) in both rulesets, validated and scored them with the D15 CLI and the
row-6 CLI, and judged every added warning against the resolved geometry (true, false positive or
arguable). It did not re-map the warnings to the earlier audits' ids; the two PS2.11e as-built records
hold that mapping (cross-check below). **Part 2** audited the six new plans by hand to the protocol's
rubric: Plan JSON geometry, `describe` access, default and a11y lint, `validate` (plain and
`--stage`), taste, and a render. Area basis counts only for the apartment, house and studio briefs, as
before.

---

## Part 1 · The thirty-six earlier plans, re-linted and scored

**The record, as the Part 1 verdict words it:** "Default lint: 42 new warnings, 39 true, 1 false
positive (return-wall hob, 10-18/1-apartment), 2 arguable, 0 lost. Accessibility profile: +46 net, 5
of them new to the profile (1 false positive: garage door/car; 1 arguable)."

Every number was checked against the resolved geometry, and every one reproduces. No added message
quotes an id.

### Findings (verbatim from the Part 1 audit)

**MAJOR: one false positive from `W_HOB_UNDER_WINDOW` (2026-10-18/1-apartment).** The rule counts a hob as "under" a window whenever it reaches into a band 300 mm either side of the window wall's centreline. It never asks whether the hob backs onto that wall.
- The stove backs onto the north wall `w_dem`. It covers x 9150..9750, y 1625..2225.
- `window_5` is on the east wall `w_e`, at y 2150..3350. That wall is 250 mm thick, so the band reaches 175 mm into the room past the wall face.
- The stove stands 125 mm off that face. Only a 50 × 75 mm corner falls inside the band.
- So the stove is beside a window on the side wall, not under it. You reach that window from in front of it, not across the burners.
- The hint is also wrong: it says to slide the stove "along the wall" by the window's wall, which the stove isn't against.
- Logic is at `src/lint/clearance-measure.ts:324-337` and `src/lint/rules/clearances.ts:222-224`. In all 11 other firings the hob backs onto the window wall (distance 0). Requiring that would remove this false positive and none of the true ones. Follow-up card.

**MINOR: accessibility profile only, `W_DOORWAY_BLOCKED` on a garage door (2026-10-18/2-house).** `d_garage` is a 2400 mm `garage` door, and the "blocker" is the car it exists for. Measuring from the wall face instead of the centreline moved the car's gap from 500 to 375 mm, under the profile's 450. The rule judges vehicle doors as pedestrian doorways.

**MINOR: the diff summary is not a list of new warnings.** Its 19 accessibility "+" lines are rewordings with code counts unchanged (12 `W_PATH_TOO_NARROW`, 5 `W_ROOM_TOO_SMALL`, 1 `W_SWING_OBSTRUCTED`, 1 more inside `W_DOORWAY_BLOCKED`). Of the 18 `W_DOORWAY_BLOCKED` "+" lines, 7 only changed a number. In 2026-10-25/5-townhouse two doors each moved 50 (`door_2` 350 → 300, `door_3` 400 → 350), not one door 400 → 300. The script never diffs `[validate]`; all 72 validate/lint pairs are identical. The audit should record counts per plan and code (`codecount.mjs`), not "+" lines.

**MINOR: `describe --facts` can't check any of these numbers.** It prints only rooms and areas; the re-measure used the resolved geometry (`resolveAll`) of the same fc-r6 build.

**MINOR: messages are id-free but sometimes ambiguous.** 2026-10-18/4-cafe `W_SWING_OBSTRUCTED` names the other leaf as "the exterior door into "Cafe seating"", which describes both `d_entry_a` and `d_entry_b`; the id is only in the hint. `W_DOORWAY_BLOCKED` on doors says just "Doorway is blocked"; 2026-10-25/5-townhouse has two such lines differing only by number.

**MINOR, pre-existing:** in 2026-10-24/5-townhouse, `walls from rooms exterior 250` silently resolves to 300 mm with no diagnostic (both CLIs, grid 100). The landing message's "150 mm past the top step" reflects the 300; with the authored 250 it would be 175. Verdict unchanged.

### Per plan (verbatim; unmarked = default lint, "a11y" = accessibility profile)

| Plan | Added code → verdict → reason |
|---|---|
| 10-18/1-apartment | HOB_UNDER_WINDOW → **FP** (above). DOORWAY_BLOCKED, Sofa 250 → TRUE: sofa end 250 mm off the `w_p4` face, covering 400 of the 800 mm `d_laun`. a11y Sofa 300 → 250: face datum on a 100 mm wall, right. |
| 10-18/2-house | a11y DOORWAY, Car → **FP** (garage door). |
| 10-18/3-studio | a11y basin 400 → 350: 100 mm wall, right. |
| 10-18/4-cafe | a11y DOORWAY chair 400 at `d_awc` → TRUE: it sat exactly at 450 on the old centreline. a11y T2 400 → 325: right, `w_v1` is 150 mm, so −75. SWING_OBSTRUCTED: rewording, numbers unchanged. |
| 10-18/5-townhouse | DOORWAY on `g_o_hl` → TRUE: sofa 250 mm off the face across the full 1000 mm. NO_LANDING → TRUE: foot at y 9600, wall face at 9875, so 275. a11y DOORWAY on `g_o_lk` → TRUE under the 1200 mm ruling: two chairs leave 750 of 1800. |
| 10-24/1-apartment | HOB 700/1800 → TRUE: whole hob, backs onto the window wall. |
| 10-24/2-house | a11y nightstand 350 → 300: right. It covers only 50 of 800 mm; the rule flags any overlap, as before. |
| 10-24/3-studio | HOB 100/1400 → TRUE (edge overlap, backs onto the window wall). FRIDGE_GAP 100 → TRUE. |
| 10-24/4-cafe | HOB 600/900 → TRUE. |
| 10-24/5-townhouse | SWING_OVER_STAIR → TRUE: `door_4`'s leaf sweeps y 1100–1900, inside the flight's low part (y 900–2700). NO_LANDING foot 250 → TRUE. SIDE_ENTRY 150 → TRUE. TOO_STEEP: 2400 run vs 2640 needed → TRUE. HOB 450 → TRUE. FRIDGE 0 → TRUE. NO_LANDING head 150 → TRUE. |
| 10-25/3-studio, 10-25/4-cafe | HOB 150/1500 and 600/1200 → TRUE. |
| 10-25/5-townhouse | NO_LANDING 450 and 100 → TRUE. TOO_STEEP 2300 → TRUE. SIDE_ENTRY level 1 (open join along the stairwell, 150 mm) → TRUE. a11y-only SIDE_ENTRY level 0 → **ARGUABLE**: a 2850 mm `open between` join; 757 mm of it runs past the low part of the flight, which clears the default 700 mm minimum door width but not the profile's 850. |
| 10-25/6-clinic | LEAF_TOO_WIDE 1400 → TRUE. |
| armA/2-house | HOB 100/2000 → TRUE. FRIDGE 150 → TRUE: the fridge stands on the right wall, its front facing the hob's side. |
| armA/3-studio | DOORWAY, alcove opening → **ARGUABLE**: the bed's corner is 50 mm off the face over 175 of 1000 mm, leaving 825 clear; openings up to 1200 mm are judged like doors, where any overlap counts. HOB 100/1200 → TRUE. |
| armA/5-townhouse | DOORWAY on `opening_1` → TRUE: sofa at the face, 700 of 1600 clear. SWING_OVER, NO_LANDING 700/1000 and 200, TOO_STEEP 2000, HOB 600 → all TRUE. |
| armA/6-clinic | a11y sofa_l 400 → 300: right, 200 mm exterior wall. |
| armB/4-cafe | HOB 800/1500 → TRUE. |
| armB/5-townhouse | NO_LANDING 550 → TRUE. SIDE_ENTRY ×2 (kitchen door at 150; bedroom 2 door onto the stairwell at 150) → TRUE. a11y-only DOORWAY on the 2950 mm open join (650 clear) → TRUE. |
| walls-first/2-house | HOB 400/1800 → TRUE. FRIDGE 100 → TRUE. |
| walls-first/5-townhouse | NO_LANDING foot 0 → TRUE: the flight runs 50 mm into partition `gp1`, ending at `door_4` and its jamb. FRIDGE 300 → **ARGUABLE**: the threshold is 305 mm (12 in), while 300 mm is the metric worktop module. NO_LANDING head 100 → TRUE. |
| walls-first/6-clinic | LEAF 1400 → TRUE. a11y reception_desk 400 → 350: right. |

The other plans in the six runs have no added lines in either profile.

### Totals, default lint (42; verbatim)

| Code | TRUE | FP | ARGUABLE |
|---|---|---|---|
| `W_HOB_UNDER_WINDOW` | 11 | 1 | 0 |
| `W_HOB_FRIDGE_GAP` | 4 | 0 | 1 |
| `W_STAIR_NO_LANDING` | 10 | 0 | 0 |
| `W_DOORWAY_BLOCKED` | 3 | 0 | 1 |
| `W_STAIR_SIDE_ENTRY` | 4 | 0 | 0 |
| `W_STAIR_TOO_STEEP` | 3 | 0 | 0 |
| `W_SWING_OVER_STAIR` | 2 | 0 | 0 |
| `W_LEAF_TOO_WIDE` | 2 | 0 | 0 |
| **Total** | **39** | **1** | **2** |

The 5 new to the accessibility profile: `W_DOORWAY_BLOCKED` 3 TRUE and 1 FP (car), `W_STAIR_SIDE_ENTRY` 1 ARGUABLE.

### Sub-questions (verbatim)

- (a) `[taste]`: all 8 moves have the score unchanged before the cap and are now capped at 0.5; each plan gained its first validity-layer warning in default lint. Documented behaviour (`src/taste/index.ts:11-14`, applied at `:193`). Every capped plan has at least one TRUE code.
- (b) `[validate]`: none; validate output equals default lint in all 72 file pairs.
- (c) Lost lines: none (by code count per plan and by line/column/code matching).
- (d) Ids and numbers: no added message quotes an id; every number reproduces from the resolved geometry.

### Taste (`score --taste generic`), the eight moves

From the per-plan count probe (`codecount.mjs`). Score before → after; the uncapped score is unchanged
in every row.

| Run | Plan | score base → cur | new validity codes |
|---|---|---|---|
| arm A | 2 House | 0.8946 → **0.5 capped** | `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP` |
| arm A | 3 Studio | 0.92 → **0.5 capped** | `W_DOORWAY_BLOCKED`, `W_HOB_UNDER_WINDOW` |
| arm A | 5 Townhouse | 0.95 → **0.5 capped** | `W_DOORWAY_BLOCKED`, `W_SWING_OVER_STAIR`, `W_STAIR_NO_LANDING`, `W_STAIR_TOO_STEEP`, `W_HOB_UNDER_WINDOW` |
| arm B | 4 Café | 0.7133 → **0.5 capped** | `W_HOB_UNDER_WINDOW` |
| arm B | 5 Townhouse | 0.9667 → **0.5 capped** | `W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY` |
| walls-first | 2 House | 0.881 → **0.5 capped** | `W_HOB_UNDER_WINDOW`, `W_HOB_FRIDGE_GAP` |
| walls-first | 5 Townhouse | 0.8857 → **0.5 capped** | `W_STAIR_NO_LANDING`, `W_HOB_FRIDGE_GAP` |
| walls-first | 6 Clinic | 0.8611 → **0.5 capped** | `W_LEAF_TOO_WIDE` |

Of the eighteen plans of the first three runs, seventeen were already capped (D15 Part 1) and the
10-24 clinic gained no code, so none of their scores moved.

### As-built cross-check (`research/2026-10-26-ps211e-stairs-as-built.md`, `research/2026-10-26-ps211e-as-built.md`)

- **The stair rows agree.** The stairs record names T1, NT1, NT2, RT1, RT2, OT1–OT3, CT2, CT3, WT1 and
  WT2 as caught and CT1 by `W_STAIR_SIDE_ENTRY`; Part 1's stair warnings on the 10-18, 10-24, 10-25,
  arm-A, arm-B and walls-first townhouses are those rows, and all are judged true here.
- **One disagreement on the hob.** The kitchen record lists "the 2026-10-18 apartment's … hob under
  75 mm of a window" among its unaudited true hits and says no false positive was found. Part 1 judges
  it the one false positive: the stove backs onto the north wall and only its corner enters the east
  window's band (card PS2.64).
- **One hit not reproduced.** The kitchen record also lists "the arm-B house's L-sofa 250 mm off its
  opening" as a true hit. At `24a8afa2` the arm-B house lints clean by default and its a11y list is
  unchanged from `747eed00` (4 `W_DOOR_CLEARANCE`, 8 `W_PATH_TOO_NARROW`); the later round-2 changes
  of PR #283 are the likely reason. Not chased further.
- **Measurement note.** The Part 1 script's header says "the 24 earlier first-contact plans"; it loops
  over six runs of six plans, so 36 plans (the 72 validate/lint file pairs are 36 plans × base and cur).

---

## Part 2 · The six briefs, cold-authored (current role: compile → validate → lint → repair)

### The loop each author ran (verbatim)

CLI calls are from the shim log, counted as compile / lint / describe / validate / score.

| Plan | Form | CLI calls (c / l / d / v / s) | First lint after it compiled (codes the author saw) | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | rooms-first (`walls from rooms`, 4 `door between`, 1 `opening between`, 0 `wall`) | 2 / 6 / 0 / 0 / 0 | 13: `W_PATH_TOO_NARROW` ×5, `W_FURNITURE_OVERLAP` ×3, `W_FIXTURE_FLOATING` ×2, `W_ANNOTATION_OVERLAP` ×2, `W_WC_SIDE_CLEARANCE` | 0 | 0.81 | 11 (0 / 4 / 7) |
| 2 House | rooms-first (2 `strip`s + `walls from rooms`, 9 `door between`) | 2 / 3 / 0 / 0 / 0 | 21 (read from the `summary` line) | **21** | 0.50 capped (uncapped 0.87) | 14 (1 / 6 / 7) |
| 3 Studio | rooms-first (`walls from rooms` with 1 `open between`, 2 `door between`, one sliding) | 11 / 12 / 1 / 0 / 0 | 7: `W_FURNITURE_OVERLAP` ×5, `W_FURN_CLEARANCE` ×2 | 0 | 0.83 | 9 (0 / 4 / 5) |
| 4 Café | rooms-first (5 `door between`, 1 `opening between`) | 3 / 3 / 0 / 0 / 0 | 7: `W_SEAT_FACING_AWAY` ×4, `W_FURN_CLEARANCE`, `W_SWING_OBSTRUCTED`, `W_WC_SIDE_CLEARANCE` | 0 | 0.94 | 7 (0 / 3 / 4) |
| 5 Townhouse | two `level`s, `walls from rooms` per level (3 `open between`, 4 `door between`, 2 `opening between`) | 3 / 2 / 0 / 0 / 0 | 14 | **14** | 0.50 capped (uncapped 0.88) | 12 (1 / 4 / 7) |
| 6 Clinic | rooms-first (2 `strip`s, `walls from rooms` with 1 `open between`, 6 `door between`) | 6 / 6 / 0 / 0 / 0 | 7: `W_SWING_OBSTRUCTED` ×3, `W_ANNOTATION_OVERLAP` ×3, `W_WC_SIDE_CLEARANCE` | 0 | 0.67 | 8 (0 / 5 / 3) |
| **Total** | 6 / 6 rooms-first, 0 `wall`, 0 `facing`; swing words: `into` 31, `outward` 4 | **27 / 32 / 1 / 0 / 0 (60)** | — | 2 plans not clean (35 warnings) | 0.50 – 0.94 | **61 (2 / 26 / 33)**; 58 without the 3 area-basis rows |

### Do the replies match the plans? (verbatim)

- Every lint claim is true: clean on apartment, studio, café, clinic; the house's 21 and the townhouse's 14 match the final lint code for code and count.
- Round counts are loose: apartment says 7 rounds (6 shell rounds, 8 calls), studio 14 (12 rounds, 24 calls), townhouse 5 (3 rounds, 5 calls); café 3 + 3 and clinic 6 are exact.
- One stated reason is wrong: the clinic says the couch was cut to 1500 × 700 "to avoid a label overlap"; the transcript shows it went 1900 → 1500 (desks 1400 → 1200) right after `W_FURNITURE_OVERLAP` ×3 and `W_FIXTURE_FLOATING` ×2.
- Two replies leave things out: the studio never mentions the missing hob or the shower cut to 700; the apartment's "single front door from the corridor" is true in source, but `describe` names the balcony slider as the only entrance.

### Why the house and townhouse stopped (verbatim)

Neither stopped for budget. Both obeyed the prompt's "stop when it compiles" over the role's "iterate until `next` is null and lint is clean".
- House (session 77 s, 5 calls): "lint still shows 21 warnings and I stopped there, as you said to." It read the `summary` line (its code list repeats that line's order and counts); it admits it read neither `W_PATH_TOO_NARROW` nor the swing arcs.
- Townhouse (session 49 s, 5 calls; only lint at 11:03:57): "The plan compiles, which is where the brief said to stop." It listed all 14 warnings correctly, including the three stair codes, and tried none.
- The other four ran on to clean under the same prompt.

### Authoring friction (from the authors' replies)

- `E_OPENING_DATUM` on a bare `at <mm>` for a door or window (apartment, café: five windows); the
  authors found `from start` by compiling.
- The door kind word leads (`door sliding on …`): written after the host at first (apartment); the
  house wrote `door id=gdoor garage on …`, which compiled.
- `E_FURN_SIZE` for `in <room> anchor …` without a `size` (apartment, clinic); `sofa_l` has no default
  footprint there although it is in the spec's `against` list (house, townhouse).
- `E_FURN_AGAINST` on a room edge whose wall runs on past the room (studio, which switched to
  `in <room> anchor … flush`); `inset` with `flush` left pieces floating (studio, clinic).
- `E_OPENING_NIB`: a 900 mm front door on a 1.3 m hall edge (house, which widened the hall to 1.5 m);
  an 800 mm door on a 1000 mm overlap (townhouse, which narrowed it to 700, QT12).
- `E_PARSE` on an interpolated `id="t{r}{c}"` on a table in a loop (café); `label "…" at (x,y)` on a
  room inside a `strip` (clinic: "Expected room but found at").
- `W_DRAWING_OVERFLOW` on A3 (clinic, which moved to A2). The clinic could not tell whether the WC
  rules cover an accessible WC's turning space.

### Verified defects (verbatim)

Classes: Sev `B` = unsafe/unbuildable; Lint `MISSED` with the rule named or "no rule" = a rule should have caught it; `m` rows and the `new (…)` classes = taste/convention, Lint `n/a`. All probes ran on `24a8afa2` with `dist/cli.real.js`.

**1 · Apartment** (10000 × 7000 centreline plus a 10000 × 1500 corridor inside the envelope; plan total 85 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QA1 | The common corridor is modelled as a room inside the exterior walls, with no door out; the front door is an internal door. `describe` names the balcony slider `door_5` as the only entrance, every depth is measured from the balcony, and the corridor's 15 m² is counted in the 85 m² total | `corridor` x 0–10000, y 7000–8500, walled on 3 sides by the 200 exterior; `access.entrances: ["door_5"]` | N | new (context) | MISSED (lint `coverage` privacy `partial`, reason `balcony-only-entrance`) |
| QA2 | The kitchen has no worktop: a 1200 sink unit, a hob and a fridge with gaps of 200 and 450, in a room typed `uses living`; the label "Living / Dining / Kitchen" was cut to "Living" to clear `W_ANNOTATION_OVERLAP` | sink x 2300–3500, stove 3700–4300, fridge 4750–5450, all y 100–800 | N | 4 | MISSED (typing; taste R6 0.57) |
| QA3 | The dining table has no chairs: a plain `table` | `table` x 2800–4600, y 1500–2400 | N | 4 | MISSED (no rule) |
| QA4 | The sofa faces the south partition 250 mm away, back to the dining table; the TV is on the west wall at 90° to it, in front of the living room's only window | `sofa` x 1700–3900, y 3000–3900, rotate 0, face 4150; `tv_unit` x 100–600, y 1300–2900 vs `window_1` y 1200–3000 | N | new (relation) | MISSED |
| QA5 | Bedroom 2's bed head stands across the room's only window | bed y 4850–6350 vs `window_3` y 4900–6300 | m | 5 | MISSED |
| QA6 | 800 mm working aisle between the sink front and the table | sink front y 700, table y 1500 | m | 5 | MISSED |
| QA7 | The balcony slider runs 100 mm past the balcony's west end | slider x 300–2100; balcony x 400–5200 | m | new (outdoor) | MISSED |
| QA8 | Labels pinned to clear `W_ANNOTATION_OVERLAP` landed worse: "Bath" and its area sit under the bath door's swing; Bedroom 2's area figure prints on the corridor partition | `label "Bath" at (8300,5200)`; `label "Bedroom 2" at (1800,6700)` | m | 8 | MISSED |
| QA9 | Wall-thickness text inside rooms | "100" and "200" in Bedroom 1 | m | 8 | MISSED |
| QA10 | The hall is 11.2 m², 16 % of the flat, and holds nothing | 4000 × 2800 | m | new (space efficiency) | n/a |
| QA11 | "~70 m²" is met only on centrelines | flat 70.0 centreline; GIA ≈ 67.1 (`describe`'s GIA 81.34 includes the corridor) | m | new (area basis) | n/a |

**2 · House** (13000 × 8800 centreline, 114.4 m² incl. a 12.16 m² garage; `exterior 250` draws 300)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QH1 | Four rooms cannot be entered: the doors of bed 2, bed 3 and the bathroom open 50 mm onto a bed head or the bathtub; the ensuite door is blocked by the basin, 0 m² of the ensuite reachable | `door_10` x 8050–8950 vs bed y 5350; `door_11` vs bed y 5350; `door_9` x 5600–6400 vs tub y 5350; basin x 3450–3950, y 6750–7350 in `door_8` (y 6700–7500) | **B** | 3 / 5 | CAUGHT (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_PATH_TOO_NARROW`, `W_ROOM_NO_CLEAR_PATH`) |
| QH2 | Three more doors open part-way onto furniture: master onto the bed (552 mm from the hinge), living onto the sofa (427), kitchen onto the table (860) | `door_7`, `door_6`, `door_5` | N | 5 | CAUGHT (`W_SWING_OBSTRUCTED`) |
| QH3 | "Kitchen / Dining" has no hob | counter, sink, fridge, `meeting_table` | N | 4 | CAUGHT (`W_ROOM_MISSING_DEFINING`) |
| QH4 | The sofa has its back to the TV: it faces the hall partition 400 mm away | `sofa_l` x 10400–12600, y 2500–3400, rotate 0; `tv_unit` y 150–650 | N | new (relation) | MISSED (only its door clash reported, under QH2) |
| QH5 | The garage cannot take a car: about 3000 clear along the line of its west door | internal x 150–3150, y 150–3750; door 2400 on x 0 | N | new (advisory size) | n/a (`W_GARAGE_TOO_NARROW` judges width only) |
| QH6 | Wardrobe fronts 100 mm from the bed sides in bed 2 and bed 3 | bed x 7750–9250 vs wardrobe x 9350–9950 (front west); bed x 10750–12250 vs wardrobe x 10050–10650 | N | 5 | MISSED (no rule) |
| QH7 | The family bathroom has no basin | `bathtub`, `wc` only | N | 4 | MISSED (no rule) |
| QH8 | The master wardrobe runs 50 mm into the ensuite partition | `wardrobe_9` to x 3400 | m | 5 | CAUGHT (`W_FURNITURE_WALL_COLLISION`) |
| QH9 | The front door's leaf parks in front of the master door, leaving 250 mm | `front` on x 0, y 4150–5050; `door_7` x 250–1150 | m | new (door–door) | CAUGHT (`W_LEAF_ACROSS_DOORWAY`) |
| QH10 | The ensuite WC front is 550 mm from the shower | WC y 5350–6050, rotate 0; shower from y 6600 | m | 5 | MISSED |
| QH11 | The hall is 19.5 m², 13 × 1.5 m, the second-largest room | `hall` 13000 × 1500 | m | new (space efficiency) | n/a |
| QH12 | Four rooms print no name (garage, utility, living, hall) | no `label` | m | 8 | MISSED |
| QH13 | Wall-thickness text inside rooms | "300" in the garage, "100" in the living room | m | 8 | MISSED |
| QH14 | "~110 m²" is missed on the habitable floor | 102.2 centreline without the garage; GIA 107.95 − ~10.8 garage ≈ 97.2 | m | new (area basis) | n/a |

**3 · Studio** (7000 × 4300 centreline, 30.1 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QS1 | The kitchenette has no hob (fridge, a 1200 counter, sink), in a room typed `uses living` | x 100–2700, y 100–700 | N | 4 | MISSED (typing; taste R6 0.67) |
| QS2 | The alcove bed is flush in the south-east corner: one long side on the exterior wall, the other 250 mm from the bath partition; reachable only from the foot | bed x 5000–6900, y 2900–4200; partition face 2650 | N | 5 | MISSED |
| QS3 | The bed head stands across the alcove's only window | head on x 6900; `window_3` y 3050–3950 | m | 5 | MISSED |
| QS4 | The sofa faces the south exterior wall and window 500 mm away, back to the room | `sofa` x 600–2600, y 2800–3700, rotate 0; face 4200 | N | new (relation) | MISSED |
| QS5 | The shower tray is 700 × 700; cut from 800 × 800 in the last round to clear `W_FURNITURE_OVERLAP` | `shower` x 6200–6900, y 1850–2550 | N | 5 | MISSED (no rule) |
| QS6 | No table or seat to eat at in a 17 m² living room | furniture list | m | 4 | MISSED |
| QS7 | Entry and bath print no name | no `label` | m | 8 | MISSED |
| QS8 | Wall-thickness text inside rooms | "200" in the entry, "100" on the entry/bath wall | m | 8 | MISSED |
| QS9 | "30 m²" is met only on centrelines | GIA 27.88 | m | new (area basis) | n/a |

**4 · Café** (12000 × 7500 centreline, 90 m²; 24 seats at six 4-tops)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QC1 | The counter has no service side: its back is on the store partition in the south-east corner, 3.6 m from the kitchen pass and 650 mm from the nearest table | `counter_31` x 5350–5950, y 5300–7300, rotate 90; pass x 6000, y 750–1650; `table_26` to x 4700 | N | new (counter zoning) | MISSED (no rule) |
| QC2 | Chairs stand back to back with 100 mm between rows; grid snap drew the 450 chairs at 500 | row-0 south chairs to y 2400, row-1 north chairs from 2500 (likewise 4400 / 4500) | N | 5 | MISSED (no rule) |
| QC3 | Accessible WC: the pan is 1050 mm from both side walls, so no grab-rail wall, and no 1500 turning circle fits clear of the fixtures | `wc_36` centreline x 9100; faces 8050 / 10150; basin x 9650–10150 | N | 5 (accessible) | MISSED (a11y profile: `W_ROOM_TOO_SMALL` 4.4 m² only) |
| QC4 | The hob stands alone on the north wall with 1300 and 1400 mm of bare floor beside it; the only worktop is 2.1 m across the room; no wash-hand basin | stove x 8700–9300; counter x 8300–10700, y 2850–3450 | m | 4 / 5 | MISSED |
| QC5 | Customers reach the accessible WC through the back hall shared with the kitchen and store doors | `door_2` seating→hall; hall serves kitchen, store, both WCs | m | new (zoning) | n/a |
| QC6 | The "corner" entrance is a south-façade door whose jamb is 450 mm from the corner's inner face | `entry` x 550–1650 on y 7500 | m | new (brief) | n/a |
| QC7 | Wall-thickness text inside rooms | "200" in the seating, "100" in the kitchen | m | 8 | MISSED |

**5 · Townhouse** (two `level`s, 5500 × 10000 each; stair `st` (200,200) 1400 × 2100 on both levels; `height 2700`)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QT1 | The stair has no landing at its head: on level 1 the flight arrives at the north exterior wall 100 mm past the top step, and the only way off is sideways through 150 mm into the landing | head y 200; wall face 100; flight's east edge 1600 vs landing face 1750 | **B** | 7 | CAUGHT (`W_STAIR_NO_LANDING`, `W_STAIR_SIDE_ENTRY` level 1) |
| QT2 | The flight is 2100 mm long for a 2700 mm storey (2640 needed) | `size 1400x2100` | N | 7 | CAUGHT (`W_STAIR_TOO_STEEP`) |
| QT3 | Ground floor: the hall opens onto the side of the flight, 150 mm from it; the foot is reached through the living room | `open between g_stair and g_hall` | m | 7 | CAUGHT (`W_STAIR_SIDE_ENTRY` level 0) |
| QT4 | The bathroom cannot hold its fixtures: the WC and basin overlap the 1700 bath, the WC centreline is 200 mm from the tub, and the door hits the tub | 1500 × 2500 room; `wc_6` x 4550–4950 vs tub x 4700–5400 | N | 5 | CAUGHT (`W_FURNITURE_OVERLAP` ×2, `W_WC_SIDE_CLEARANCE`, `W_SWING_OBSTRUCTED`) |
| QT5 | The kitchen has no worktop; the hob stands under the window and the fridge in front of it | sink, stove x 1700–2300, fridge x 2700–3300 vs `window_4` x 1700–3900 | N | 4 / 5 | CAUGHT (`W_ROOM_MISSING_DEFINING`, `W_HOB_UNDER_WINDOW`, `W_FURNITURE_OVER_WINDOW`) |
| QT6 | The sofa faces the kitchen partition 300 mm away and stands in front of 700 of the 1800 living/kitchen opening; the TV is on the east wall at 90° | `sofa_l` x 400–2600, y 4750–5650; `opening_2` x 1900–3700; `tv_unit` x 4900–5400 | N | new (relation) | MISSED (a11y profile: `W_DOORWAY_BLOCKED` on the opening) |
| QT7 | The WC door's swing hits the pan (85 mm short) | `door_2` level 0 | m | 5 | CAUGHT (`W_SWING_OBSTRUCTED`) |
| QT8 | Both double bed heads stand across the south windows | beds x 600–2200 and 3450–4850 vs windows x 650–2150 and 3600–4800 | m | 5 | MISSED |
| QT9 | The bedrooms are 2.7–2.8 × 7.5 m (21 and 20 m²), each larger than the living room, with ~4 m of empty floor | `f_bed1`, `f_bed2` | m | new (space efficiency) | n/a |
| QT10 | "Stair" label over the flight on both levels | | m | 8 | CAUGHT (`W_ANNOTATION_OVERLAP` ×2) |
| QT11 | Wall-thickness text inside rooms (both levels) | "100" and "200" on each level | m | 8 | MISSED |
| QT12 | The bedroom 1 door was cut to 700 mm to clear `E_OPENING_NIB` | `door between f_land and f_bed1 … width 700` | m | 5 | MISSED (a11y profile: `W_DOOR_CLEARANCE`) |

**6 · Clinic** (12000 × 10000 centreline, 120 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| QK1 | No consulting room has a chair or a basin; the staff room has no sink or worktop; one L-sofa seats the waiting room for three consulting rooms | furniture list | N | 4 | MISSED |
| QK2 | The exam couches are `bed` 1500 × 700 and draw as beds; cut from 1900 to clear `W_FURNITURE_OVERLAP` | `bed_3` to `bed_5` | N | 4 / 5 | MISSED (no rule) |
| QK3 | The reception desk is reversed: the chair is drawn on the south side, so the receptionist faces the open corridor with their back to the entrance and the waiting room (render checked) | `reception_desk` x 3400–5400, y 6600–7400, rotate 0 | N | new (relation) | MISSED |
| QK4 | The waiting sofa faces the façade 500 mm away, back to reception, and stands in front of 600 of the 1200 main exit, leaving 600 clear | `sofa_l` x 600–3000, y 8500–9400; face 9900; exit x 2400–3600 | N | new (relation) / new (egress) | MISSED (both profiles: the approach depth is 300 / 450) |
| QK5 | Accessible WC: the pan centreline is 1650 and 750 mm from the side walls, so no grab-rail wall is in reach, and the door swings in | `wc_9` centreline x 7700; faces 6050 / 8450; `door_5 … swing into wc` | N | 5 (accessible) | MISSED |
| QK6 | The accessible WC is 10 m², about 2.5 times its need | 2500 × 4000 | m | new (space efficiency) | n/a |
| QK7 | The waiting room is open over 6 m to the corridor that serves the consulting rooms, store, staff room and rear exit | `open between wait and corr` | m | new (zoning) | n/a (privacy skipped: `no-main-entrance`, `non-dwelling`) |
| QK8 | Wall-thickness text inside rooms | "200" in Consulting 1, "100" in the corridor | m | 8 | MISSED |

### Q8: furniture turns and door swings

- **Seats at tables.** The café drew 24 chairs; its first lint fired `W_SEAT_FACING_AWAY` ×4 and the
  author turned those chairs `rotate 180`: **0 / 24** face away in the final plan. The apartment's
  dining table has no chairs (QA3); no consulting room has a chair (QK1). `facing`: 0 uses.
- **Sofas.** Three sofas share a room with a TV, and **0 / 3** face it (QA4, QH4, QT6). The studio's
  and the clinic's sofas face a wall or the façade 500 mm away (QS4, QK4).
- **Hinged exterior doors.** **8 / 8** open the intended way.
- **`swing` forms.** `into` 31, `outward` 4.

### Gaming and laundering seen in the transcripts (verbatim)

- Fixtures shrunk to clear `W_FURNITURE_OVERLAP`: the studio shower 800 → 700 (QS5); the clinic couches 1900 → 1500 and desks 1400 → 1200 (QK2).
- Door narrowed to clear `E_OPENING_NIB`: the townhouse bedroom door 800 → 700 (QT12).
- Labels shortened and pinned to clear `W_ANNOTATION_OVERLAP` on the apartment, so the drawing no longer says "Kitchen" and two labels land on a swing and a partition (QA2, QA8).

### Calls, new surfaces, rule firings (verbatim)

**CLI tally.** Shim log: compile 27, lint 32, describe 1, validate 0, score 0 (60 calls). The one `describe` was the studio's `describe … --room wc 2>/dev/null | head -0`: its output was thrown away, so no author read any `describe` output. Timing: dispatch to the last reply took about 2.7 min (00:03:05 → 00:05:47 local), $1.38; arm A took ~17 min and arm B ~12, so this is a confounder.

*Correction (stage-end drift audit, 2026-10-27):* the "~17 / ~12 min" compares unlike spans. On the
shim logs, first to last CLI call, the arms took 11.7 (A), 2.4 (B), 2.4 (C) and 1.6 min (row 6):
row 6 is close to arms B and C, and arm A is the outlier.

**New surfaces since D15.**

| Surface | Used | Would it have helped (probe) |
|---|---|---|
| `validate --stage` | 0 / 6, though the loaded role text makes it the loop | On the townhouse, `--stage rooms` puts `W_STAIR_TOO_STEEP` first and `--stage walls` `W_STAIR_NO_LANDING` first. Plain `validate`'s `next` is `W_SWING_OBSTRUCTED` (a WC swing 85 mm short), ranked ahead of the blocker; even at `--stage openings`, `next` is the swing while those earlier-stage stair codes are still present |
| lint `summary` line | In the first lint output of 5 authors (the first key of the JSON they read with `head -c`); the house reply copies its order and counts; later rounds were piped through `grep` and lost it | It gave the house author the full list; the author still did not act on it |
| `context --level starter` | 0 / 6 | It says "fix `next` first, read `summary`", but nothing in it outranks the prompt's stopping rule |
| `preview --review` | 0 / 6 | 0 rings on the lint-clean apartment, so it cannot show the residual defects; 7 rings on townhouse level 1, the stair included |
| `keep` | 0 / 6 | No brief calls for one |
| GIA in `describe` | Not seen | Would show the studio at 27.88 and the house at 107.95 including the garage; the apartment's 81.34 misleads (includes the corridor) |
| `door double` | 0 / 6 | No brief needs one |

**Rule firings during authoring (log timing vs final plan).**
- Stair rules: `W_STAIR_SIDE_ENTRY` ×2, `W_STAIR_TOO_STEEP` and `W_STAIR_NO_LANDING` fired once, on the townhouse at 11:03:57; all left standing. `W_STAIR_HEAD_VOID` and `W_SWING_OVER_STAIR` never fired.
- `W_HOB_FRIDGE_GAP`: fired on the apartment at 11:04:19 and was repaired by 11:04:32 (gap 50 → 450).
- `W_HOB_UNDER_WINDOW`: fired on the townhouse and was left.
- New door rules: `W_LEAF_TOO_WIDE` never fired; `W_DOORWAY_BLOCKED` on openings fires only under the a11y profile (townhouse).
- Older rules: `W_WC_SIDE_CLEARANCE` repaired in 4 plans; `W_SEAT_FACING_AWAY` ×4 on the café repaired by `rotate 180` (0 of 24 chairs face away); `W_LEAF_ACROSS_DOORWAY` left on the house.

### Tool facts (not counted as defects)

From Part 2 (verbatim):
- `next` ranks the 85 mm swing ahead of the stair blocker.
- On the house, the furniture-caused `W_PATH_TOO_NARROW` warnings are tagged stage `openings`.
- The café and clinic `mainEntrance` is a `tie`, so circulation is `partial`.
- The townhouse `describe` caption still covers level 0 only, but `totals.gross_internal_area_all_levels_m2` (103.88) is new.
- Grid snap still turns 450 chairs into 500.

From Part 1: `describe --facts` cannot reproduce any clearance number (the auditor used `resolveAll`);
`walls from rooms exterior 250` resolves to 300 under `grid 100` with no diagnostic (the 10-24
townhouse in Part 1 and the row-6 house here).

---

## Comparison with arms A, B and C

The table is the headline's. **Reading** (verbatim from the Part 2 audit):

The row-6 corpus does not change what a first-contact author produces. On the four plans run to clean, the surviving defects are the same families as arms A to C: sofas facing walls or away from the TV; kitchens hidden by `uses living`; tables without chairs; accessible WCs with no grab-rail wall; counter zoning; bed heads across windows; labels and wall-thickness text. The new rules worked where they were present: the stair rules named the townhouse blocker, the steep flight and both side entries correctly, the first stair blocker any final lint has reported; `W_HOB_FRIDGE_GAP` was fired and repaired once. But the reported count only moves because two authors obeyed the prompt's "stop when it compiles" over the role's loop and left 35 warnings: 12 of the 61 defects are reported, against 0 / 0 / 3 + 2 before. The binding constraint is not missing surfaces; it is (a) which stopping rule the author follows and (b) defect families with no rule at all. Of the new surfaces only the `summary` line was read (house). `validate --stage` would have put the stair first; plain `next` would not: it ranks an 85 mm swing ahead of a no-landing blocker. Auditor-instance spread applies to every column, so compare by class and by B/N, not by the m count.

### Then and now by class

Counted as the earlier audits' then-and-now tables count: a row with two classes under the first
(`4 / 5` under 4, `3 / 5` under 3, `5 (accessible)` under 5, `new (relation) / new (egress)` under
relation). The row-6 column is this record's count of the Part 2 tables; the headline's class row
counts dual-class rows in both and gives 10 / 19 / 3 / 10 / 6.

| Class | 10-18 | 10-24 | 10-25 | 10-26 arm A | 10-26 arm B | 10-26 arm C | row 6 |
|---|---|---|---|---|---|---|---|
| 1 Openings ignore walls | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 Circulation and privacy | 2 | 3 | 0 | 1 | 0 | 4 | 1 (QH1, four rooms unreachable) |
| 4 Defining contents | 5 | 8 | 7 | 6 | 10 | 8 | 10 (2 hidden by `uses living`) |
| 5 Clearances | 11 | 14 | 13 | 15 | 11 | 14 | 16 (2 accessible WCs) |
| 7 Stair | 1 | 2 | 2 | 3 | 3 | 2 | 3 (1 B; all 3 caught) |
| 8 Annotation | 8 | 6 | 9 | 8 | 9 | 10 | 10 (6 thickness text, 2 unlabelled-room rows, 1 label pinned worse, 1 label over the flight, caught) |
| new: furniture relation | 9 | 3 | 3 | 5 | 5 | 4 | 6 |
| new: transposed footprint | 3 | 1 | 3 | 0 | 1 | 1 | 0 |
| new: door–door and leaf across a corridor | 2 | 2 | 1 | 2 | 0 | 1 | 1 (QH9, caught) |
| new: other (brief, context, zoning, size, area, space, outdoor, counter zoning) | 12 | 9 | 11 | 12 | 15 | 10 | 14 (3 area) |
| **Total (B / N / m)** | **57 (4 / 26 / 27)** | **48 (2 / 24 / 22)** | **49 (0 / 23 / 26)** | **52 (1 / 25 / 26)** | **54 (1 / 20 / 33)** | **54 (1 / 22 / 31)** | **61 (2 / 26 / 33)** |

What the table says:
- **Class 7, stairs:** 3, as in arms A and B, but for the first time every stair row is reported by
  the final lint (QT1–QT3). The author read all three codes and stopped on the prompt.
- **Class 5, clearances:** 16, the most of any run. Four are reported (QH2, QH8, QT4, QT7; QH1's and
  QT5's clearance halves are filed under 3 and 4); the rest are families no rule names: bed heads
  across windows, wardrobe fronts against bed sides, an undersized shower, back-to-back chairs,
  accessible WCs.
- **Class 4 and furniture relation:** 10 and 6, at or above every earlier run: kitchens typed
  `uses living`, a table with no chairs, a bath with no basin, sofas facing walls.
- **Blockers:** 2, both reported by lint and both left standing by an author who stopped on the prompt.

## The row-6 reading (for the lead; README D26)

**What closes.** §7 row 6's cards are all done (PS4.3 A and B, PS4.4, PS5.4, PS7.1, PS7.2, PS7.5,
PS7.6, PS2.11e's stair and kitchen halves), and this is the re-measure D10 asks for. Of the row's
"done when" clauses, `keep` invariants and brief-bound sizes are checked by `validate` (PS4.3a, PS4.4),
and the widening drill reports a broken `keep` with its residual before and after (PS4.3a/b). The
clause "`preview --review` rings every flagged element" is false as built: a mark raised inside a
repeated statement (a `for` body, a component placed twice) rings nothing and is reported `unringed`
with a copy count. The PS5.4 record's own probes (`research/2026-10-26-ps54-as-built.md` lines
104–112): `p2-for` 0 of 2 marks ringed, `p10-loopfurn` 5 of 8, `p3-place` 4 of 6; the examples 10 of
17 (the 7 are whole-sheet warnings with no element). The fix is PS4.6 (an element id on every
diagnostic). The row is therefore **met in part**: the D10 re-measure is done, and PS4.6 is the
remainder.

**What the measurement says.**
- **Defects do not fall with rules alone.** 61 (2 / 26 / 33) against 52, 54 and 54 on the same day
  before row 6's rules, inside the spread of one draw per brief and one auditor per column. The new
  rules fired where the defects were (all three stair rows, the hob under a window, a hob-to-fridge gap
  repaired in the loop), and 12 of the 61 are reported by the final lint against 0, 0 and 3 + 2.
- **The stopping rule binds.** The 12 are reported only because two authors stopped on the prompt's
  "stop when it compiles" with 21 and 14 warnings standing, the stair blocker among them; the four who
  followed the role's loop ran to clean, and their surviving defects are families no rule names. Under
  the identical prompt the stop rate was 0 / 0 / 2 / 2 (arms A, B, C, row 6), so it is noise, not a
  treatment. D26 keeps the frozen prompt for comparability and adds a whole-loop arm (PS7.8), because
  under the frozen prompt the uptake of author-facing surfaces cannot be seen at all.
- **The no-rule families bind.** Sofas facing walls or away from the TV (PS2.28, PS2.32), kitchens
  hidden by `uses living` (PS2.30), tables and desks with no seat (PS2.31), accessible WCs (PS2.36,
  PS2.16), counters and desks with their working side to a wall (PS2.43), bed heads across windows
  (PS2.71), wardrobe fronts at bed sides (PS2.60), labels and thickness text (PS2.41, PS2.39) recur in
  every run since 2026-10-24.
- **Surfaces were not taken up.** No author ran `validate`, `--stage`, `context`, `preview --review`
  or read a `describe`; the `summary` line was read once. Where `validate` would have helped, its plain
  `next` ranks an 85 mm WC swing ahead of the stair blocker (PS7.7).
- **Rule quality.** On the thirty-six earlier plans the nine new codes added 42 default warnings with
  1 false positive (PS2.64) and 2 arguable; the a11y profile adds 1 more false positive (PS2.65).

## Candidate cards

Checked against `../cards.md` before filing (subject grep per candidate). New cards, all `todo`:
- **PS2.64 · `W_HOB_UNDER_WINDOW` on a hob beside a window on a return wall** (the Part 1 false positive;
  `src/lint/clearance-measure.ts:324-337`, `src/lint/rules/clearances.ts:222-224`).
- **PS2.65 · `W_DOORWAY_BLOCKED` judges a vehicle door as a pedestrian doorway** (a11y, the 10-18 house
  garage door and its car).
- **PS2.66 · A bathroom with a WC and no basin** (QH7).
- **PS2.67 · A catalogued fixture drawn under its smallest size** (QS5, QK2).
- **PS2.68 · Chairs back to back with no room to push back** (QC2; OC3, RC6 before).
- **PS2.69 · Furniture in front of an exterior exit** (QK4's egress half; OK5's before).
- **PS2.70 · `W_GARAGE_TOO_NARROW` judges depth too** (QH5; OH5, CH5, NH4, RH5 before).
- **PS2.71 · A bed head across a window** (QA5, QS3, QT8; OA5, OH7, OT7, RH7 before).
- **PS2.72 · `describe --facts clearances`** (Part 1: no CLI surface reproduces a clearance number).
- **PS7.7 · `next` ranks class-7 blockers and earlier-stage findings before a swing shortfall** (the
  townhouse: `W_SWING_OBSTRUCTED` 85 mm ahead of `W_STAIR_NO_LANDING`).
- **PS7.8 · A whole-loop arm in the next first-contact re-measure** (D26: the frozen prompt stays as
  arm 1; arm 2's dispatch prompt names compile → `validate --stage` → lint → repair, iterated until
  `next` is `null`; a protocol addition made with the next re-measure, not an edit of the frozen
  prompt).

Evidence appended to existing cards (one *Evidence 2026-10-26, row 6* note each): PS0.25 (`exterior
250` drawn 300 on the row-6 house; QC2's 450 chairs at 500), PS2.16 (QC5, QK7 zoning), PS2.28 (QA4,
QH4, QT6), PS2.30 (QA2, QS1), PS2.31 (QA3, QK1), PS2.32 (QA4, QH4, QS4, QT6, QK4), PS2.36 (QC3, QK5),
PS2.39 (QA9, QH13, QS8, QC7, QT11, QK8), PS2.41 (QA8; QA2's label cut to "Living"), PS2.42 (QA1),
PS2.43 (QC1, QK3), PS2.60 (QH6, QS2).

Part 2's sixteen candidates map as: 1 → PS2.32 and PS2.28; 2 → PS2.43; 3 → PS2.30; 4 → PS2.31; 5 →
PS2.66; 6 → PS2.67; 7 → PS2.60; 8 → PS2.68; 9 → PS2.36 / PS2.16; 10 → PS2.43; 11 → PS2.69; 12 →
PS2.70; 13 → PS2.42; 14 → PS2.71; 15 → PS2.41 and PS2.39; 16 → PS7.7. `exterior 250` resolving to 300
is PS0.25's subject (grid snapping of a declared size is silent), so it went there as evidence, not a
new card.

Not carded: the area-basis rows (QA11, QH14, QS9), space efficiency (QA10, QH11, QT9, QK6), the
corner entrance (QC6), the balcony slider past the balcony's end (QA7), the 800 mm sink-to-table
aisle (QA6), the ensuite WC front 550 mm from the shower (QH10), the café hob with no worktop beside
it (QC4), the door narrowed to clear `E_OPENING_NIB` (QT12), and Part 1's ambiguous id-free messages
(two leaves both named "the exterior door into …"; "Doorway is blocked" with no door named).

## Corpus, concordance, tiling probe (same commit, with the six plans in the tree)

`npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts`, raw:

```text
taste concordance (A ∪ B ∪ C): 58 pairs — 53 ordered, 0 tied, 0 reversed (0 in the ledger), 5 unjudged
 ✓ test/taste-separation.test.ts (29 tests)
defect-corpus catch rate
  openings-ignore-walls: 16/16
  space-not-enclosed: 6/6
  circulation-privacy: 11/12
  missing-defining-contents: 5/5
  clearances: 16/21
  daylight: 4/4
  stair-safety: 8/8
  annotation-collisions: 6/7
  overall: 72/79

 ✓ test/defect-corpus.test.ts (556 tests)
 Test Files  2 passed (2)
      Tests  585 passed (585)
```

- **Defect corpus.** 72 / 79 (unchanged by this run, which adds no corpus case); stair safety 8 / 8
  since PR #280, clearances 16 / 21 since PR #283.
- **`npx vitest run test/rooms-tiling-probe.test.ts`.** Passes, 27 / 27, with no re-pin:
  `first-contact-plans/` is an information root of the probe, never pinned.
- **The four tests that read `first-contact-plans/`.** `lint-dwelling-reading`, `main-entrance`,
  `room-too-small-by-use` and `swing-building` all pass (121 tests: 22, 63, 8 and 28).
- **The keep weak law** (`test/keep-byte-identity.test.ts`) walks `first-contact-plans/` but checks the
  files its generated baseline lists; the six new plans add no row and move none (D24 re-takes the
  table only when a hashed output moves). It passes, as do `lint-messages-id-free`, `brief-bound` and
  `lint-clearances-kitchen-doors`, which also read the folder.

## Files

- `first-contact-plans/2026-10-26-rerun-row6/<n>-<brief>.arch`: the six final plans as the cold
  authors left them, byte-identical to the authors' files (all LF, 0 CR bytes). Provenance: SHA-256 as
  committed, the file's mtime in the run's worktree, and the author's last logged CLI call on it (shim
  log, UTC). Every mtime precedes that plan's last logged call (by 0.1 to 4 s), so the audited bytes
  are the ones the author last compiled or linted.

  | Plan | SHA-256 (as committed, LF) | mtime | Last logged call (calls on it) |
  |---|---|---|---|
  | 1-apartment | `cdb0fdd14772c786242ca9ccd0b11623336de6791c7251e8d833fc16513e9dc0` | 11:04:42.007 | 11:04:42.137 (8) |
  | 2-house | `7591b8fad6abbafeea1485f2937371b7a5169ff53a577f7ffb424626f5427c7d` | 11:04:18.703 | 11:04:22.666 (5) |
  | 3-studio | `22afcbaa37a621428a4a13230d835705fa22101ce815895c3d56b24d7a7d3b48` | 11:05:08.289 | 11:05:08.691 (24) |
  | 4-cafe | `80fc72237854d5fe3ced96d9bdf0a7913ef8c341629151ef12afa8c0cdecbdf8` | 11:04:23.316 | 11:04:23.791 (6) |
  | 5-townhouse | `cfa35dd3674d52052e4caf3301e8ad14b1de7dcd248724906b8ec81643091641` | 11:03:56.891 | 11:03:57.357 (5) |
  | 6-clinic | `9e80b63e66c4ef53d706cd5ee5a90742207d944da2701d772fb0561202e8a2d7` | 11:04:26.428 | 11:04:26.917 (12) |
- Kept outside the repository, in the run's scratch folder: the dispatcher prompt (`lead-r6.txt`), its
  JSON output, the authors' replies with the loaded role line (`replies.md`), the shim call log
  (`calls-r6.jsonl`, 60 lines), Part 1's raw outputs for both CLIs (`part1-r6/base`, `part1-r6/cur`, 288
  JSON files) and diff summary, Part 1's probes (`codecount.mjs`, `linecode.mjs`, `idcheck.mjs`,
  `geom.mjs`, `hob.mjs`, `doorway.mjs`, `shape2.mjs`), Part 2's probes (`tx.mjs`, `tx2.mjs`, `dump.mjs`,
  `stage.mjs`, the transcripts digest) and per-plan lint, a11y lint, validate (plain and staged),
  describe, taste, Plan JSON, renders and review sheets, and `context --level starter`'s output.

## Confounders

These are the protocol's (step 10) plus what this run adds:
- **The stopping rule (a protocol confounder).** The prompt says "stop when it compiles"
  (`first-contact-protocol.md` line 56, in every run since 2026-10-24; line 65 records the 2026-10-24
  café author stopping at the first clean compile, line 99 why most authors loop anyway); the role says
  iterate until `next` is `null` and lint is clean. Under the identical prompt the authors who stopped
  with warnings standing were 0 / 0 / 2 / 2 (arms A, B, C, row 6): the arms compare like for like by
  prompt, and the stop rate is noise. The "reported by final lint" row moves with that choice, not
  with the rules. The intended treatment is the role text (PS7.5, PS7.1); as in D15, spec and role
  effects cannot be separated. The protocol is unchanged here; D26 keeps the prompt and adds a
  whole-loop arm to the next re-measure (PS7.8).
- **Auditor instances.** Each column of the comparison had its own auditor; one opus auditor did row
  6's Part 2. The only numeric spread on record is D15's two auditors (minor rows 33 against 26,
  noticeables 20 against 25). Compare by class and by blockers and noticeables, not by the minor count.
- **Authoring chance.** One draw per brief. 61 against 52 / 54 / 54 is inside the spread of the
  earlier runs (57, 48, 49).
- **Speed.** First to last CLI call on the shim logs: arm A 11.7 min, arm B 2.4, arm C 2.4, row 6 1.6
  (the D15 record's "about 17 and 12 min" is dispatcher wall time, a different span). Row 6 is near
  arms B and C; two of its sessions lasted 77 s and 49 s. Dispatcher cost $1.38 against $1.82 and
  $1.62. Speed alone does not separate row 6 from the arms.
- **The spec changed.** `spec.llm.md` at `24a8afa2` carries the stage-ordered loop (PS7.1), the `keep`
  line (PS4.3a), the `double` door kind and the taste step moved out (PS7.5), none of which arms A
  and B saw; the lint is stronger by nine codes. The arm columns and this one are not the same
  experiment.
- **One arm only.** No control arm ran (D20 made the two-arm design unnecessary), so nothing here
  separates the role text from the spec.
- **The shim.** Authors ran through a logging shim at `dist/cli.js`; the auditors measured with the
  real build directly.
- **Part 1 does not depend on the authors.** It re-lints the same thirty-six plans at two commits.
