> Research record, 2026-10-26, against `main@747eed00` (PR #260; the last programme PR is #258), built CLI
> `archlang v1.43.1` (`dist/cli.js`). Read observations as evidence and diagnoses as hypotheses:
> re-measure before you build on a number. Programme entry: `../README.md`. Protocol:
> `first-contact-protocol.md`. Baselines: `2026-10-18-first-contact.md` (57 defects, A1–K11),
> `2026-10-24-first-contact-rerun.md` (48, NA1–NK7) and `2026-10-25-first-contact-rerun-row5.md`
> (49, RA1–RK7). This is the re-measure that D19 left owed after row 5 and D15 specified as two arms.
> Arm A: the pre-#250 `arch-author` role, loaded as `compile → fix → describe → lint`. Arm B: the
> role as it stands on the commit under test, loaded as `compile → validate → lint → score --taste →
> repair`. The twelve plans: `first-contact-plans/2026-10-26-rerun-armA/` and `…-armB/`.

# First-contact re-measure after row 5: D15's two arms

## Headline

| Measure | 2026-10-18 | 2026-10-24 | 2026-10-25 | 2026-10-26 arm A | 2026-10-26 arm B |
|---|---|---|---|---|---|
| Author role text | pre-#250 | pre-#250 | pre-#250 | pre-#250 | current (post-#250) |
| Cold-authored plans: verified defects (B / N / m), area basis judged as in the baseline | 57 (4 / 26 / 27) | 48 (2 / 24 / 22) | 49 (0 / 23 / 26) | **52 (1 / 25 / 26)** | **54 (1 / 20 / 33)** |
| …without the area-basis rows on every side | 54 | 45 | 46 | **49** | **51** |
| …of which final default `lint` reports | 0 | 1 | 0 | **0** | **0** |
| Blockers (B) | 4 | 2 | 0 | **1** (OT1: the townhouse stair is entered at its head, its foot in a 700 mm pocket) | **1** (CT1: townhouse bedroom 2's only door opens onto a 150 mm strip beside the stairwell; `describe` marks the room `unmeasured`, reason `no_threshold`, and lint is silent) |
| Rooms-first (`walls from rooms`, no `wall` statement) | 0 / 6 | 6 / 6 | 6 / 6 (31 `door between`, 0 `wall`) | **6 / 6** (30 `door between` by the auditor's count, 31 with the one `opening between`; 0 `wall`) | **6 / 6** (32 `door between` by the auditor's count, 33 with the one `opening between`; 0 `wall`) |
| Class 1, openings ignore walls | 4 | 0 | 0 | **0** | **0** |
| Chairs at a table facing away: before the loop / final | — / 27 of 51 | 24 / 24 → 0 / 24 | 18 / 24 → 0 / 24; `facing` used 0 times | before: `W_SEAT_FACING_AWAY` fired on the side chairs (no count given) → **0 / 24**; `facing` used 0 times | **18 / 24 → 0 / 24**; `facing` used 0 times in the final plans (one failed attempt) |
| Sofas facing their TV | 0 / 3 | 1 / 3 | 0 / 3 (one more sofa faces a bed) | **0 / 2** (5 sofas; both backs to the TV) | **1 / 2** (5 sofas; one back to the TV, one TV deleted) |
| Hinged exterior doors opening the intended way (K1) | 1 wrong (K1) | 8 / 8 | 8 / 8 | **7 / 7** | **7 / 8** (the clinic's corridor-end exit swings inward, CK6) |
| Authors who ran `score --taste` / `validate` (`next`) / `describe` unprompted | — | — | 0 / 6 each | **0 / 0 / 1** of 6 | **0 / 1 / 1** of 6 |
| CLI calls, compile / lint / describe / validate / score (shim log) | — | — | 27 / 31 / 0 / 0 / 0 (transcripts) | **27 / 37 / 1 / 0 / 0** (65) | **32 / 42 / 2 / 1 / 0** (77) |
| The 57 caught by default `lint` on the 2026-10-18 plans | 0 | 17 (6 partial) | 19 (7 partial); 15.5 counting halves | **23 (6 partial)**; 20 counting halves | same run (Part 1 does not depend on the arm) |
| The 48 caught by default `lint` on the 2026-10-24 plans | — | 1 | 1 | **7 (3 partial)**; 5.5 counting halves | same run |
| The 49 caught by default `lint` on the 2026-10-25 plans | — | — | — | **5 (2 partial)**; 4 counting halves (0 before) | same run |
| Row-5 drafting codes on the eighteen old plans | — | — | (twelve old plans) `W_ANNOTATION_OVERLAP` 12 (all true; 1 hit, 1 partial, 10 outside the audits); `W_DIM_TEXT_MISMATCH` 0; `W_TITLE_OVERFLOW` 0 | 0 new (the 25 new default warnings are all clearance codes) | same run |
| Clearance codes (PS2.11a–d) on the eighteen old plans | — | — | — | 25 new default warnings, 0 removed; 16 map to audited defects (11 caught, 5 partial), 9 new and true, 0 false positives | same run |
| `score --taste generic`, cold plans | — | 0.5 (capped) – 0.90 | 0.72 – 0.93, none capped | **0.72 – 0.97**, none capped | **0.71 – 0.98**, none capped |
| `score --taste generic`, the eighteen old plans, re-scored | — | — | — | 17 of 18 now score 0.5 (capped by the new validity codes) | same run |
| Taste concordance (A ∪ B ∪ C) | — | — | 41 pairs: 37 ordered, 0 tied, 0 reversed (0 ledgered), 4 unjudged | 44 pairs: 40 ordered, 0 tied, 0 reversed (0 ledgered), 4 unjudged | same commit |
| Defect-corpus catch rate | 46 / 68 | 47 / 70 | 53 / 72 | **59 / 73** (clearances 11 / 19) | same commit |

Read the two arm columns by class and by blockers and noticeables, not by the minor count alone: the
two arms were audited by two different auditor instances (same model, same brief, same rubric), and
arm B's auditor filed more minor rows (33 against 26).

What changed between the 2026-10-25 run and this one, from `git log 9cc29c7e..747eed00` (42 commits):
- `W_WC_SIDE_CLEARANCE` and `W_FURNITURE_OVER_WINDOW` (PR #252), `W_FOOTPRINT_TRANSPOSED` and
  `W_LEAF_ACROSS_DOORWAY` (PR #253), the cn/uk/us advisory profiles (PR #248).
- PR #250 put the loop `compile → validate → lint → score --taste → repair` into `spec.llm.md`'s
  self-correction paragraph, the SKILL and `.claude/agents/arch-author.md`. So the spec both arms read
  names `validate --json` (read `next`) and `score --taste generic`, and arm A differs from arm B only
  in the role text.
- The rest is documentation, the protocol (PR #257) and registry work.

## Method and commands

Every number above comes from one of these, run on `main@747eed00` after `npm ci && npm run build`
(and, for Part 1's base side, on `main@9cc29c7e`, the commit of the 2026-10-25 run):

```sh
node dist/cli.js lint <plan> --json                                    # default ruleset
node dist/cli.js lint <plan> --json --profile accessibility-advisory   # a11y profile
node dist/cli.js score <plan> --taste generic --json                   # taste report
node dist/cli.js validate <plan> --json                                # `next`
node dist/cli.js describe <plan> --json                                # access.entrances, totals
node dist/cli.js compile <plan> -f json -o plan.json                   # geometry for the defect audit
npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts   # catch rate, concordance
npx vitest run test/rooms-tiling-probe.test.ts
npx vitest run test/lint-dwelling-reading.test.ts test/main-entrance.test.ts \
  test/room-too-small-by-use.test.ts test/swing-building.test.ts
```

**Run settings** (protocol step 2, 3 and 5):

| Setting | Arm A | Arm B |
|---|---|---|
| Commit under test | `main@747eed00` | the same |
| Built CLI | `archlang v1.43.1` (`npm run build` in a detached worktree; lockfile unchanged since 9cc29c7e) | the same |
| Role text (`.claude/agents/arch-author.md`) | pre-#250: `git show 6e0aa520^1:.claude/agents/arch-author.md` written over the file in the arm's worktree, uncommitted (5 insertions, 24 deletions against main) | `main` as it stands (post-#250) |
| Role as loaded (the dispatching session's own Agent-tool listing, the headless equivalent of `/agents`, copied before dispatching) | `compile → fix → describe → lint` | `compile → validate → lint → score --taste → repair` |
| Dispatcher | one headless `claude -p` session per arm, started with the arm's worktree as its working directory (model sonnet, `--dangerously-skip-permissions`, `--output-format json`) | the same |
| Authors | six `arch-author` subagents, all six dispatched in one message, one per brief, model `claude-sonnet-5-5` (inherited; the role file sets none), no follow-up message, no nudge | the same |
| Per-brief prompt | the protocol's 2026-10-24/25 prompt verbatim, `<repo>` the arm's worktree, `<run-folder>` `2026-10-26-rerun-armA`; it names `compile\|lint` only and says "stop when it compiles" | the same with `2026-10-26-rerun-armB` |
| Files the authors read (from the transcripts) | `spec.llm.md` only, every author | `spec.llm.md` only; the house author also re-read its own plan |
| CLI call counting | a shim at `dist/cli.js` in each arm's worktree appended every invocation's argv to a log, then ran the real build. The transcripts were parsed as a cross-check and agree within one `compile`; the shim is authoritative | the same |
| Dispatcher cost (API-metered) | about $1.82 | about $1.62 |
| Wall time, dispatch to last reply | about 17 min | about 12 min |
| Auditor | one opus instance, same brief and rubric as arm B's | a second opus instance |

**Part 1** re-linted the eighteen earlier plans (`first-contact-plans/`, `…/2026-10-24-rerun/`,
`…/2026-10-25-rerun/`) in both rulesets and scored them, before (`main@9cc29c7e`) and after
(`main@747eed00`) the change under test, and mapped each new warning to an audit id, or marked it new and true, or
false (protocol step 6). **Part 2** audited the twelve new plans by hand to the protocol's rubric: Plan
JSON geometry, `describe` access, default and a11y lint, `validate`, taste, and a render at 1800 px
cropped to check every blocker and orientation claim (step 7). Area basis counts only for the
apartment, house and studio briefs, as before. Ids carry the arm: `O` for arm A (OA1, OH1, OS1, OC1,
OT1, OK1 start each plan) and `C` for arm B (CA1, CH1, CS1, CC1, CT1, CK1).

---

## Part 1 · The eighteen old plans, re-linted and scored

The eighteen plans of the three earlier runs, unchanged, were linted at `main@9cc29c7e` (base) and
`main@747eed00` (cur) and the two warning lists diffed: 25 new default warnings (24 distinct lines), 0
removed, all of them `W_WC_SIDE_CLEARANCE`, `W_FURNITURE_OVER_WINDOW`, `W_FOOTPRINT_TRANSPOSED` or
`W_LEAF_ACROSS_DOORWAY`. Geometry for each row is from Plan JSON compiled with the current CLI, and the
couch glyph of the 2026-10-18 clinic was read on a render. Severity and ids follow the three audits.

### New warnings since 2026-10-25 (default lint; the a11y profile repeats every row, see below)

| Run | Plan | New warning (code, short geometry) | Maps to | Verdict |
|---|---|---|---|---|
| 10-18 | 1 Apartment | `W_WC_SIDE_CLEARANCE`: `wc_6` centreline y 3500, `basin_7` to y 3200, 300 mm (100 short) | A8 (m) | CAUGHT |
| 10-18 | 1 Apartment | `W_LEAF_ACROSS_DOORWAY`: `d_front` (x 3900–4900 on y 1500, hinge x 3900) leaf along x 3900 is 250 mm in front of `d_bed2` (y 1750–2650, hall face 3650), leaving 150 of 900 clear | A1 (N) | CAUGHT (clear width differs from the audit; see cross-check) |
| 10-18 | 3 Studio | `W_FURNITURE_OVER_WINDOW`: `wardrobe_3` x 2300–3500 on `w_n` covers x 2300–2500 of `window_1` (x 1100–2500, the alcove's only window) | none (S2 is the bed sides) | NEW TRUE, m: a tall unit over 200 mm of the alcove's window |
| 10-18 | 4 Café | `W_FOOTPRINT_TRANSPOSED`: `bar_counter at (5650,3650) size 700x1900`, catalogue 1800 × 600 | C4 (N) | CAUGHT (the quarter turn the message names accounts for both of C4's symptoms: the short drawn counter with its gap, and the customer side along the partition) |
| 10-18 | 5 Townhouse | `W_FURNITURE_OVER_WINDOW`: `fridge_6` x 150–750 covers 150 mm of `window_2` (x 600–1800) | T5's fridge half (N) | CAUGHT. T5 goes from PARTIAL to whole, because its worktop half was already caught by `W_ROOM_MISSING_DEFINING` |
| 10-18 | 6 Clinic | `W_FOOTPRINT_TRANSPOSED` ×3: `bed … size 1900x700 label "Couch"` against `w_v1`/`w_v2`/`w_v3`. The render shows the pillows running along the 1900 mm side, so each draws as a bed 700 long | none (K5–K7 are seats and the desk) | NEW TRUE, m ×3 (one pattern). The placement, long side to the wall, is a normal couch layout. Only the glyph is wrong, so the hint's "swap the sides" would stand the couch 1900 mm into the room. A `rotate`, not a swap, is the honest fix (fix-text weakness, not a false positive) |
| 10-18 | 6 Clinic | `W_LEAF_ACROSS_DOORWAY`: `d_corr` (on x 10800, y 3900–4900) leaf along y 3900, x 10800–11800, is 50 mm in front of `d_staff` (x 11350–12250, face 3850), leaving 450 of 900 clear | K4 (N) | CAUGHT |
| 10-24 | 1 Apartment | `W_FURNITURE_OVER_WINDOW`: `fridge_5` y 1050–1750 covers 400 mm of `window_1` (y 1350–3150) | NA2 (N) | PARTIAL: the hob half (`stove_4` y 2150–2850, wholly under the window) is not named |
| 10-24 | 2 House | `W_FURNITURE_OVER_WINDOW`: `wardrobe_11` y 1000–2800 on `bed3.right` covers all of `window_6` (y 1300–2500). Bedroom 3 keeps `window_5` (north) | none (NH7 is the bed heads) | NEW TRUE, N (suggested; a window wholly covered, as RH3) |
| 10-24 | 2 House | `W_FURNITURE_OVER_WINDOW`: `fridge_22` y 7550–8250 covers 300 mm of `window_8` (y 7950–9450) | NH6 (m) | CAUGHT |
| 10-24 | 2 House | `W_LEAF_ACROSS_DOORWAY`: front `door_1` leaf along x 6700, y 8800–9800, is 250 mm in front of the kitchen `door_4` (y 8250–9150, face 6950), leaving 550 clear | NH5 (m) | CAUGHT |
| 10-24 | 3 Studio | `W_FURNITURE_OVER_WINDOW`: `fridge_3` x 1400–2000 covers 600 mm of `window_2` (x 800–2200) | NS2 (N) | PARTIAL: the hob-to-fridge half (`stove_2` x 2100, 100 mm from the fridge) is not named |
| 10-24 | 4 Café | `W_LEAF_ACROSS_DOORWAY`: kitchen→store `door_5` (x 10950–11750 on y 4500) leaf along x 10950, y 4500–5300, is 200 mm in front of the staff WC `door_4` (y 4800–5600, face 10750), leaving 300 of 800 clear, inside the 1300 mm store | none (NC3 is the WC opening onto the store) | NEW TRUE, m (door–door, back of house) |
| 10-24 | 5 Townhouse | `W_WC_SIDE_CLEARANCE` (1 of 2): `wc_1` x 150–550 in `wc`, centreline 350, exterior face 150: 200 mm | NT4 (N) | CAUGHT (200 mm, not the audit's 225: `exterior 250` resolves to 300) |
| 10-24 | 5 Townhouse | `W_WC_SIDE_CLEARANCE` (2 of 2): `wc_6` x 4950–5350 in `bath`, centreline 5150, exterior face 5350: 200 mm | NT5 (N) | PARTIAL: the basin standing 250 mm in front of the pan (`basin_7` y 5500 against the pan front at 5250) is not named |
| 10-25 | 1 Apartment | `W_LEAF_ACROSS_DOORWAY`: corridor→hall `door_1` (x 5400–6400 on y 7200) leaf along x 5400, y 6200–7200, is 150 mm in front of the bathroom `door_4` (y 5600–6400, face 5250), covering 200 and leaving 600 clear | RA6 (m) | CAUGHT |
| 10-25 | 2 House | `W_FURNITURE_OVER_WINDOW`: `fridge_6` y 1700–2300 (600 along, 700 deep) is wholly within `window_3` (y 1400–2600) | RH3 (N) | CAUGHT |
| 10-25 | 3 Studio | `W_FOOTPRINT_TRANSPOSED`: `sofa_l … size 900x1300`, catalogue 2600 × 1600 | RS4 (N) | PARTIAL: it names the transposition and quotes the catalogue size, exposing the undersize. It does not name the other half, a sofa facing the bed 300 mm away (sofa y 1300–2600, rotate 0; bed from y 2900). Swapping the size keeps that facing, and the 10-25 audit filed that half under PS2.32 |
| 10-25 | 4 Café | `W_FURNITURE_OVER_WINDOW`: `fridge_8` y 4900–5500 covers 100 mm of `window_6` (y 5400–6600) | RC4 (m) | PARTIAL: the hob half (`stove_7` y 6000–6600, wholly under the window) is not named (PS2.46) |
| 10-25 | 4 Café | `W_LEAF_ACROSS_DOORWAY`: seating→passage `door_2` (y 3300–4200 on x 7500) leaf along y 3300, x 7500–8400, is 250 mm in front of the accessible WC `door_4` (x 8050–8950, face 3050), leaving 550 of 900 clear | none (RC2 is the WC's own swing; RC5 is the route) | NEW TRUE, N (suggested: it is on the customers' only route to the accessible WC) |
| 10-25 | 5 Townhouse | `W_FURNITURE_OVER_WINDOW`: `wardrobe_5` x 100–1900 on `bed1.bottom` covers 1100 of `window_5` (x 800–2000). Bedroom 1 keeps `window_3` | none (RT6 is the beds) | NEW TRUE, N (suggested) |
| 10-25 | 5 Townhouse | `W_FURNITURE_OVER_WINDOW`: `wardrobe_7` x 3700–5500 on `bed2.bottom` covers 1100 of `window_6` (x 3600–4800). Bedroom 2 keeps `window_4` | none | NEW TRUE, N (suggested) |
| 10-25 | 6 Clinic | `W_FOOTPRINT_TRANSPOSED`: `sofa_l … size 900x2400`, catalogue 2600 × 1600 (x 4050–4950, y 6800–9200) | RK4 (N) | CAUGHT |

The 25 warnings break down as 16 mapped to audit ids (11 caught, 5 partial; NT4 and NT5 share
one message line) and 9 new and true (7 distinct defects, counting the three couches as three
warnings). None is a false positive.

### Results

- **The 57 (2026-10-18 plans):** 19 → **23 caught, 6 of them partial** (20 counting halves; it was
  15.5). The new catches are A1, A8, C4 and K4. T5 goes from partial to whole, so the partials
  now are A7, S3, C3, C5, C8 and A10. By severity: B 1/4 (C1, unchanged) · N 12/26 → **15/26**
  (A1, C4, K4; 5 partial) · m 6/27 → **7/27** (A8; 1 partial, A10).
- **The 48 (2026-10-24 plans):** 1 → **7 caught, 3 of them partial** (5.5 counting halves): NC6,
  NH5, NH6, NT4, and the partials NA2, NS2, NT5. By severity: B 0/2 · N 4/24 (NT4; NA2, NS2, NT5
  partial) · m 3/22 (NC6, NH5, NH6).
- **The 49 (2026-10-25 plans):** 0 → **5 caught, 2 of them partial** (4 counting halves): RA6,
  RH3, RK4, and the partials RS4 and RC4. By severity: B 0/0 · N 3/23 (RH3, RK4; RS4 partial) ·
  m 2/26 (RA6; RC4 partial). If RS4 is scored whole, as the as-built record does, the figures are
  5 caught, 1 partial, 4.5.
- **New true findings outside the audits:** 9 warnings, 7 distinct defects:
  - the 10-18 studio wardrobe over 200 mm of the alcove window;
  - the 10-18 clinic couches ×3, which draw as beds lying across their length;
  - the 10-24 house wardrobe over the whole of Bedroom 3's east window;
  - the 10-24 café kitchen leaf before the staff WC door, in the store;
  - the 10-25 café passage leaf before the accessible WC door;
  - the 10-25 townhouse wardrobes over 1100 of 1200 mm, Bedrooms 1 and 2.
- **False positives:** 0. One fix-text weakness: on the clinic couches the offered swap is the
  wrong architectural fix (see the table).
- **Still missed, though in these rules' family:** the hob halves of NA2, NS2 and RC4. NC8 and
  RS3, a hob under a window, are PS2.46. H2, T3, NT3 and RA3 are plain `sofa`, which has no
  catalogued footprint (PS3.11). NT5's basin half and RS4's facing half are also missed.

### Taste (`score --taste generic`)

The new codes are validity warnings, so they only cap. On all 18 plans the uncapped score and every
criterion score are byte-identical base to cur.

| Run | Plan | score base → cur | uncapped (unchanged) | new validity codes |
|---|---|---|---|---|
| 10-24 | 1 Apartment | 0.6667 → **0.5 capped** | 0.6667 | `W_FURNITURE_OVER_WINDOW` |
| 10-24 | 2 House | 0.8985 → **0.5 capped** | 0.8985 | `W_FURNITURE_OVER_WINDOW` ×2, `W_LEAF_ACROSS_DOORWAY` |
| 10-24 | 3 Studio | 0.7947 → **0.5 capped** | 0.7947 | `W_FURNITURE_OVER_WINDOW` |
| 10-24 | 5 Townhouse | 0.9 → **0.5 capped** | 0.9 | `W_WC_SIDE_CLEARANCE` ×2 |
| 10-25 | 1 Apartment | 0.7962 → **0.5 capped** | 0.7962 | `W_LEAF_ACROSS_DOORWAY` |
| 10-25 | 2 House | 0.8667 → **0.5 capped** | 0.8667 | `W_FURNITURE_OVER_WINDOW` |
| 10-25 | 3 Studio | 0.8125 → **0.5 capped** | 0.8125 | `W_FOOTPRINT_TRANSPOSED` |
| 10-25 | 4 Café | 0.925 → **0.5 capped** | 0.925 | `W_FURNITURE_OVER_WINDOW`, `W_LEAF_ACROSS_DOORWAY` |
| 10-25 | 5 Townhouse | 0.9333 → **0.5 capped** | 0.9333 | `W_FURNITURE_OVER_WINDOW` ×2 |
| 10-25 | 6 Clinic | 0.7222 → **0.5 capped** | 0.7222 | `W_FOOTPRINT_TRANSPOSED` |

Ten plans newly capped. The others stand as follows:
- **Already capped, no change in score:** the six 10-18 plans, whose validity counts rose (apartment 4→6, studio 2→3, café 16→17, townhouse 4→5, clinic 10→14; house 3→3), and the 10-24 café (NC6; 1→2 via the new leaf).
- **Not capped:** only the 10-24 clinic, at 0.6667.
- **Effect:** 17 of the 18 first-contact plans now score 0.5. The 10-25 audit's "0.72 – 0.93, none capped" becomes "all six capped at 0.5", so taste no longer orders the cold plans at all on this commit.

`validate --json` `next` follows the same pattern:
- **Newly non-null:** six 10-25 plans and the 10-24 apartment and studio, each pointing at the new code.
- **Drafting to validity:** the 10-24 house and townhouse switch from a drafting `W_ANNOTATION_OVERLAP` to the new validity code.
- **Still null:** the 10-24 clinic.

### Accessibility profile (`--profile accessibility-advisory`)

The profile adds every default warning above, with the same counts and elements. Beyond that:
- **Thresholds in the messages.** The WC side needs 450 instead of 400. The leaf rule's "needed" is `min(door width, 850)` instead of `min(…, 700)`, so 800 for the 800 mm doors.
- **Two WC hits only under the profile:** the 10-18 townhouse WC is 425 mm from its basin and the 10-25 townhouse bathroom WC 400 mm from its basin, both against 450. No audit row judged either, so they are threshold hits, neither caught nor false.
- **Approach depth.** The 450 mm approach, against 300 by default, adds no further `W_LEAF_ACROSS_DOORWAY` pair.
- **Nothing else.** No `W_FURNITURE_OVER_WINDOW` or `W_FOOTPRINT_TRANSPOSED` fires only under the profile, and no profile warning was removed.

### As-built cross-check (`research/2026-10-25-ps211ab-as-built.md`, `…-ps211cd-as-built.md`)

The as-built hit lists agree with what fired: A8, NT4, NT5 (partial), NH6, RH3, T5 whole; NA2,
NS2, RC4 partial; NC8 and RS3 missed; A1, K4, NH5, RA6, C4, RK4; H2, T3, NT3 and RA3 missed. The
unaudited true hits agree as well: the wardrobes in the 10-18 studio, the 10-24 house and the
10-25 townhouse ×2, the 10-18 clinic couches, and both café leaves. Both records say no false
positive, and so does this re-measure.

There are four disagreements or measurement notes.
1. **RS4 scored "caught" in ps211cd; partial here.** The warning names the transposition, but not the sofa facing the bed 300 mm away. Swapping the size does not fix that half, and the 10-25 audit itself lists RS4 under PS2.32 for it. With RS4 whole, the 49 read 5 caught, 1 partial, 4.5.
2. **A1's clear width.** The lint reports 150 mm clear. The audit's geometry (leaf y 1625–2625 against the doorway's y 1750–2650) implies 25 mm. `doorSwing` hinges the leaf on the wall centreline (y 1500), so the 1000 mm leaf ends at y 2500. The audit hinged it at the face (y 1625). The verdict is unaffected, as both are far under 700. K4 agrees with the audit (450 covered, 450 clear).
3. **RH3's span.** The audit wrote the fridge at y 1700–2400. Plan JSON gives y 1700–2300 (600 along, 700 deep, rotate 90), hence the lint's "600 mm". The fridge is wholly in front of the window either way.
4. **NT4 and NT5 at 200 mm, not 225.** ps211ab already records this: `exterior 250` resolves to 300.

---

## Part 2 · Arm A · the six briefs, cold-authored (pre-#250 role: compile → fix → describe → lint)

### The loop each author ran

CLI calls are from the shim log, counted as compile / lint / describe / validate / score. "First lint" is from the author's own report: the first lint after the plan first compiled, where the author itemised it. The form counts are the auditor's: `door between` excludes `opening between` (the townhouse has one).

| Plan | Form | CLI calls (c / l / d / v / s) | First lint | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | rooms-first (`walls from rooms`, 3 `door between`, 0 `wall`) | 3 / 4 / 0 / 0 / 0 | 2: `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED` (bed in front of a bedroom door; round 1 did not compile) | 0 | 0.87 | 7 (0 / 4 / 3) |
| 2 House | rooms-first (`walls from rooms`, 9 `door between`, 0 `wall`) | 5 / 11 / 0 / 0 / 0 | not itemised; over about 9 lint rounds the author names door-swing and approach clearances, `W_PATH_TOO_NARROW`, overlap/collision warnings and `W_ANNOTATION_OVERLAP` | 0 | 0.89 | 12 (0 / 5 / 7) |
| 3 Studio | rooms-first (`walls from rooms`, 1 `door between`, 0 `wall`) | 8 / 8 / 0 / 0 / 0 | not itemised ("errors or many warnings"); named: `W_FIXTURE_BACK_TO_ROOM`, furniture-clearance warnings | 0 | 0.92 | 5 (0 / 2 / 3) |
| 4 Café | rooms-first (`walls from rooms`, 5 `door between`, 0 `wall`) | 2 / 4 / 0 / 0 / 0 | 4 codes, counts not given: `W_FURNITURE_OVERLAP`, `W_SWING_OBSTRUCTED`, `W_ROOM_MISSING_DEFINING`, `W_SEAT_FACING_AWAY` (side chairs); round 3 `W_DOORWAY_BLOCKED`, `W_FIXTURE_BACK_TO_ROOM`, `W_WC_SIDE_CLEARANCE` | 0 | 0.97 | 10 (0 / 5 / 5) |
| 5 Townhouse | rooms-first, one `walls from rooms` per level (6 `door between`, 1 `opening between`, 0 `wall`) | 7 / 8 / 1 / 0 / 0 | not itemised; named: `W_FIXTURE_BACK_TO_ROOM`, `W_ANNOTATION_OVERLAP` (stair label), `W_PATH_TOO_NARROW` (1600 bed by a door) | 0 | 0.95 | 10 (1 / 4 / 5) |
| 6 Clinic | rooms-first (`walls from rooms`, 6 `door between`, 0 `wall`) | 2 / 2 / 0 / 0 / 0 | 0 (round 2 clean, after two `E_FURN_SIZE`) | 0 | 0.72 | 8 (0 / 5 / 3) |
| **Total** | 6 / 6 rooms-first | **27 / 37 / 1 / 0 / 0** (65) | — | 0 | 0.72 – 0.97 | **52 (1 / 25 / 26)** |

Taste below 1 on the final plans: R6 (apartment 0.75, studio 0.6: kitchen fixtures in rooms typed `living`), R9
(apartment 0.75, house 0.98), R11 (house 0: "Kitchen / Dining" has no link to where people eat), R16 (apartment,
house, townhouse, clinic) and R17 (apartment, café, clinic). R16 and R17 judge nothing this audit counts.

The only calls beyond compile and lint: the townhouse author's `describe --select totals,levels`. No author ran `validate` or `score`. The role text these authors held told them to run `describe`; one of six did. Two said in their replies that they had not (studio, café).

Final state of the six plans on the current CLI: default `lint` clean on all six; `validate --json` `next: null` on all six; `score --taste generic` 0.87 / 0.89 / 0.92 / 0.97 / 0.95 / 0.72 (apartment … clinic), none capped.

### Forms used

- 6 / 6 `walls from rooms` (the townhouse twice, one per level), 31 `door\|opening between` (the auditor's 30 `door between` excludes the one `opening between`), 0 `wall` statements, 0 `facing`.
- Swing words: `into` 34, `inward` 1, `outward` 2.

### Authoring friction

Compile errors the authors hit, from their reports:

- `E_PARSE` on `label` written after `uses` in a `room` line (apartment, café, townhouse); `E_PARSE` on `inset <mm> flush` (the order is `flush inset <mm>`, studio).
- `E_OPENING_NIB`: a 1000 door in a 1200 hall (apartment); a window `at 3800 from start` (studio); a townhouse door, where the hint's legal span taught the author that `from start` counts from the shared segment's start.
- `E_FURN_AGAINST`: a sink past the end of its wall (apartment); `against bed2.left`, an edge covered by two walls (house).
- `E_FURN_SIZE`: `in <room> anchor|centered` needs a `size` (studio: `wc`, `double_bed`, `sofa_l`; clinic: `meeting_table`, `locker`, which the spec lists among the pieces `against` may leave unsized).
- The house's first compile had 2 errors (not named); the author also found `at … from start` on a `between` door hard to predict and settled an offset by trial.
- The café had no "corner" placement and took its chair `rotate` values from the `W_SEAT_FACING_AWAY` hints. The clinic could not name a main entrance with two exits (lint circulation `partial`, privacy `skipped`, `no-main-entrance`).

### Verified defects

Every Lint cell is the final plan's default lint, which is empty on all six: none of the 52 is reported.

**1 · Apartment** (9400 × 7500 centreline, 70.5 m²; balcony 3000 × 1500 outside the south wall)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OA1 | There is no hall: `open between hall and living` takes out the whole partition, so the front door, both bedroom doors and the bathroom door open straight onto the living/dining/kitchen. The bathroom door is 2.25 m from the dining table | `hall\|living:open` nominal width 9200 (`describe`); bath door x 4300–5100 on y 3300; `meeting_table` x 3800–5600, y 5550–6450 | N | 3 | MISSED |
| OA2 | The kitchen has no hob and no fridge: a 1600 counter and an 800 sink, in a room typed `uses living` only | `counter` y 4700–6300, `kitchen_sink` y 6400–7200, both on `living.left` | N | 4 | MISSED (typing; taste R6 0.75 sees the sink) |
| OA3 | The L-sofa faces the south exterior wall 500 mm away, with its back to the room; it is drawn 2400 × 900 (catalogue 2600 × 1600), a squashed L | `sofa_l` x 6400–8800, y 6000–6900, no rotate, `inset 600`; wall face 7400 | N | **new** (relation) | MISSED |
| OA4 | Both wardrobe fronts stand 250 and 350 mm from the bed sides | bed 1 x 950–2550, `wardrobe` x 100–700 (front 700); bed 2 x 6850–8350, `wardrobe` x 8700–9300 | N | 5 | MISSED |
| OA5 | Both bed heads stand across the bedroom windows | bed 1 x 950–2550 against `window_1` x 1100–2500; bed 2 x 6850–8350 against `window_3` x 6900–8300 | m | 5 | MISSED |
| OA6 | Wall-thickness text inside rooms | "200" in bedroom 2, "100" in the hall | m | 8 | MISSED |
| OA7 | "~70 m²" is met only on centrelines | 70.5 centreline; GIA 9200 × 7300 = 67.2 | m | **new** (area basis) | n/a |

**2 · House** (12600 × 8900 centreline, 112.14 m² with a 16.5 m² garage)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OH1 | The sofa stands mid-room facing the hall door, with its back to the TV 600 mm behind it (NH2, RH1 again) | `sofa` x 1300–3500, y 1250–2150, no rotate; `tv_unit` y 150–650 on `living.top` | N | **new** (relation) | MISSED |
| OH2 | "Kitchen / Dining" has no table and no chairs, and is typed `uses kitchen` only (NH1 again; the author found "no dining-table category") | furniture: counter, sink, stove, fridge | N | 4 | MISSED (typing; taste R11 0 reads it as an unlinked kitchen) |
| OH3 | There is no continuous worktop: a single 600 counter mid-wall, a 700 gap, the sink, a 300 gap, then the hob, which stands 150 mm from the fridge | counter x 5700–6300, sink 7000–7800, stove 8100–8700 (y 150–750); fridge x 8850–9550, y 500–1100 | N | 4 / 5 | MISSED (presence only) |
| OH4 | The master bedroom is the smallest bedroom (8.96 m² against 10.08). Its double is cut to 1400 × 1800, and the bed's south side is 350 mm from the ensuite partition | `double_bed … size 1400x1800`, x 150–1950, y 5700–7100; partition face 7450 | N | 5 | MISSED |
| OH5 | The garage is too short for a car | internal 2800 × 5300 (x 9650–12450, y 3450–8750); `W_GARAGE_TOO_NARROW` judges width only (2700) | N | **new** (advisory size) | n/a |
| OH6 | The garage is reached from the house only through the kitchen and the utility; it shares 1300 mm of wall with the hall but has no door to it | `door between kitchen and utility`, `door between utility and garage`; `garage\|hall` x 9600, y 3400–4700 | m | **new** (zoning) | n/a |
| OH7 | All three bed heads stand across the bedroom windows (RH7 again) | master bed y 5700–7100 vs `window_5` y 5350–6850; bed 2 x 3650–5150 vs `window_7` x 3700–5100; bed 3 x 6050–7550 vs `window_8` x 6100–7500 | m | 5 | MISSED |
| OH8 | Bedroom 3's door leaf, open, parks 150 mm in front of the wardrobe front | `door_9` hinged at x 6400, leaf y 4750–5550; `wardrobe` front x 6250, y 5000–6200 | m | 5 | MISSED (a11y profile: `W_SWING_OBSTRUCTED`, 335 mm from the hinge) |
| OH9 | The bathroom basin front is 300 mm from the bathtub (RH8 again) | basin x 8050–8550, y 6900–7500; tub from x 8850, y 6750–8450 | m | 5 | MISSED |
| OH10 | The ensuite WC front is 500 mm from the partition ahead | `wc` y 8050–8750 (`rotate 180`); partition face 7550 | m | 5 | MISSED |
| OH11 | Wall-thickness text inside the living room | "300", "100" | m | 8 | MISSED |
| OH12 | "~110 m²" is missed on the habitable floor | 112.14 − 16.5 = 95.6 m² centreline; about 91 m² GIA (12300 × 8600 = 105.8 less the garage's 2800 × 5300) | m | **new** (area basis) | n/a |

**3 · Studio** (6000 × 5000 centreline, 30 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OS1 | The kitchenette has no fridge and one 700 mm worktop, and the room is typed `uses living` only (NS1, RS2 again) | stove x 2700–3300, sink 3400–4200, counter 4300–5000, all y 4300–4900 on `living.bottom` | N | 4 | MISSED (typing; taste R6 0.6 sees sink and stove) |
| OS2 | The alcove's double bed is flush against the east wall (one side only), its foot 50 mm from the partition and across 200 mm of the 1000 mm opening | bed x 4500–5900, y 100–2100; wall face 5900; partition face 2150; opening x 3700–4700 | N | 5 | MISSED |
| OS3 | The entrance takes 22.4 % of the flat and holds only a shoe cabinet (RS5 counted 16.7 %) | entry 2400 × 2800 = 6.72 m² of 30 | m | **new** (space efficiency) | n/a |
| OS4 | Wall-thickness text inside rooms | "200" in the bathroom, "100" in the alcove | m | 8 | MISSED |
| OS5 | "30 m²" is met only on centrelines | GIA 5800 × 4800 = 27.8 | m | **new** (area basis) | n/a |

**4 · Café** (12000 × 7500 centreline, 90 m²; 24 seats at six 4-tops)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OC1 | The bar counter has no service side: its back is on the north exterior wall and its stools face the room. The kitchen opens to the seating through a doorless 1000 mm opening 700 mm past its end (NC2, RC1 again) | `bar_counter` x 4300–7300, y 100–800; `open between dining and kitchen` x 8000, y 750–1750 | N | **new** (counter zoning) | MISSED |
| OC2 | The seating-to-passage door's open leaf stands across the 1.4 m passage and leaves 400 mm | `door_2` hinged at y 4000, leaf x 8050–9050; passage clear x 8050–9450 | N | **new** (leaf across a corridor) | MISSED |
| OC3 | Chairs stand back to back with 0 mm between table columns and 100 mm between rows: no seat can be pushed back (RC6 was 500 mm) | east chair x 2800–3300, next west chair x 3300–3800; south chair y 3800–4300, next north chair y 4400–4900 | N | 5 | MISSED |
| OC4 | The fridge front is 150 mm from the end of the sink run, across 400 mm of its 600 mm door | `fridge` x 11100–11700, y 1750–2450, faces north; `kitchen_sink` x 11300–11900, y 800–1600 | N | 5 | MISSED |
| OC5 | Accessible WC: no grab-rail wall within reach of the pan, and the door swings in (NC4, RC2 again) | pan centreline y 6500, 950 mm to the north face 5550; basin 400 mm beside it on the south; `door_5 … swing into accwc` | N | 5 (accessible) | MISSED (a11y profile: `W_WC_SIDE_CLEARANCE`, 400 vs 450) |
| OC6 | The kitchen has no wash-hand basin, and the hob stands alone in the corner, 850 mm from the only worktop | counter x 8050–9850; stove x 10700–11300 | m | 4 / 5 | MISSED |
| OC7 | Customers reach the accessible WC through the back passage, past the kitchen and store doors (RC5 again) | `door between dining and corr`; `corr` serves `kitchen`, `store`, `staffwc`, `accwc` | m | **new** (zoning) | n/a |
| OC8 | The "entrance on the corner" is a door on the west wall whose south jamb is 150 mm from the corner's inner face (NC7, RC7 again) | `door on dining.left at 6700 from start width 1100`: y 6150–7250; wall face 7400 | m | **new** (brief) | n/a |
| OC9 | Three rooms print no name: the kitchen, passage and store have no `label`, so only their areas print | `room id=kitchen … uses kitchen` (also `corr`, `store`) | m | 8 | MISSED |
| OC10 | Wall-thickness text inside rooms | "200" in the seating, "100" in the passage | m | 8 | MISSED |

**5 · Townhouse** (two `level`s, both 5500 × 10000, 55 m² each; one stair `st` at (250,3250) 1000 × 2000 on both)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OT1 | The ground-floor stair is entered at its head. `dir up` puts the foot at the south end, in a 700 mm pocket against the kitchen partition, flanked by 150 and 200 mm; the stair room's only door is at the north end, and its leaf swings in under the top of the flight | `st` x 250–1250, y 3250–5250, `dir up` ("UP" drawn at y 5107); `stair0` faces x 100 / 1450, y 5950; `door_3` x 300–1200 on y 3000, `swing into stair0` | **B** | 7 | MISSED |
| OT2 | The flight is 2000 mm long for a 2800 mm storey: the drawn run cannot climb it at any domestic pitch (54°). The author shrank the stair to 1000 × 2000 to clear `W_ANNOTATION_OVERLAP` on its label | `stair … size 1000x2000`, `height 2800` | N | 7 | MISSED |
| OT3 | The stair head on level 1 arrives 200 mm from the bedroom 1 partition; the way off is a turn east onto the landing | `dir down` entered at y 3250; partition face 3050 | N | 7 | MISSED |
| OT4 | The sofa faces the kitchen partition 0 mm away, with its back to the TV, and stands across 900 mm of the 1600 mm living/kitchen opening (NH2 again) | `sofa` x 3400–5400, y 5050–5950, `anchor bottom-right flush`, no rotate; `tv_unit` y 3050–3500; `opening_1` x 2700–4300 on y 6000 | N | **new** (relation) | MISSED |
| OT5 | Bedroom 1's double bed is flush in the north-east corner, one long side against the bathroom partition | bed x 1850–3450, y 100–2100; partition face 3450 | N | 5 | MISSED |
| OT6 | The hob stands wholly under the kitchen window (NC8, RC4 again) | stove x 2700–3300 on `kitchen.bottom`; `window_3` x 1550–3950 | m | 5 | MISSED |
| OT7 | Both double bed heads stand across windows | bed 1 x 1850–3450 vs `window_1` x 2100–3300; bed 2 x 1950–3550 vs `window_4` x 1850–3650 | m | 5 | MISSED |
| OT8 | Hall, WC and landing take a third of each floor while the living room is 12 m²: a 10.5 m² hall and a 6 m² WC below, a 16.5 m² landing above | `hall` 3500 × 3000, `wc` 2000 × 3000, `landing` 5500 × 3000; `living` 4000 × 3000 | m | **new** (space efficiency) | n/a |
| OT9 | Four rooms print no name (hall, WC, living; bath on level 1). "Stair" is pinned under the flight, where its area figure runs onto the kitchen partition | no `label` on `hall`, `wc`, `living`, `bath`; `label "Stair" at (750,5550)`: "4.5 m²" at y 5865, 250 mm text, face 5950 | m | 8 | MISSED |
| OT10 | Wall-thickness text inside rooms (both levels) | L0 "100" in the living room, "200" in the WC; L1 "100" on the landing, "200" in bedroom 2 | m | 8 | MISSED |

**6 · Clinic** (12000 × 10000 centreline, 120 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| OK1 | No consulting room has a chair or a basin, only a desk and a couch; the staff room has a table but no sink or worktop; waiting has one 2 m L-sofa for three consulting rooms (NK1, RK1 again) | furniture list | N | 4 | MISSED |
| OK2 | Accessible WC: no grab-rail wall, and the basin is 1150 mm beyond the pan front (NK2, RK2 again) | pan centreline x 6250, 1200 mm to both side faces (5050, 7450); basin y 7450–8050, pan front y 9200 | N | 5 (accessible) | MISSED |
| OK3 | The accessible WC door swings out across the 1.4 m corridor, which is also the way to the rear exit, and leaves 500 mm | `door_6` hinged at x 5850, leaf y 4550–5450; corridor clear y 4050–5450 | N | **new** (leaf across a corridor) | MISSED |
| OK4 | The reception desk is reversed: the receptionist's chair is drawn on its south side, facing the corridor partition 550 mm away, with her back to the waiting room and the entrance. The desk also stands across 1300 mm of the 2400 mm waiting/corridor opening (RK3 again) | `reception_desk` x 600–2600, y 6100–6900, no rotate; partition face 5550; opening x 1300–3700 | N | **new** (relation; K7's class) | MISSED |
| OK5 | The waiting L-sofa faces the façade 300 mm away, with its back to reception (NK5 again), and its east 500 mm stands in front of the 1200 mm main exit, leaving 700 mm clear | `sofa_l` x 400–2400, y 8700–9600, no rotate; wall face 9900; `exit_main` x 1900–3100 | N | **new** (relation) / **new** (egress) | MISSED (a11y profile: `W_DOORWAY_BLOCKED`, 400 vs 450) |
| OK6 | The waiting room is open to the corridor that serves the staff room, the store and the rear exit (NK6, RK5 again) | `open between waiting and corridor width 2400` | m | **new** (zoning) | n/a |
| OK7 | The accessible WC is 11.25 m², about three times what it needs, beside an 11.25 m² staff room | `wc` 2500 × 4500 | m | **new** (space efficiency) | n/a |
| OK8 | Wall-thickness text inside rooms | "200" in Consulting 1, "100" in the corridor | m | 8 | MISSED |

### Q8: furniture turns and door swings

- **Seats at tables.**
  - The café drew 24 chairs in a nested `for` loop. In round 2 `W_SEAT_FACING_AWAY` fired on the side chairs (the author gives no count) and the author took the `rotate` values from its hints. Final, by front rays: **0 / 24** face away (north `rotate 0`, south 180, west 270, east 90).
  - The apartment (`meeting_table`), townhouse (`dining_table`) and clinic staff room (`meeting_table`) use glyphs that draw their own chairs. The house's kitchen/dining has no table (OH2). No consulting desk has a chair (OK1).
  - `facing`: 0 uses.
- **Sofas.** 5 sofas, 2 with a TV in the room: **0 / 2** face it (OH1, OT4: both backs to the TV). Of the other three, the apartment's faces the south wall 500 mm away (OA3), the clinic's the façade 300 mm away (OK5), and the studio's faces into its room (no defect). Transposed footprints: 0 / 5; `sofa_l` was drawn undersized three times (2400 × 900, 1600 × 900, 2000 × 900).
- **Hinged exterior doors.** **7 / 7** open the intended way: apartment, house and studio front doors `swing into` their hall or entry; townhouse `swing inward`; café entrance `swing into dining` (acceptable for 24 seats); both clinic exits `swing outward`. The garage door (no swing) and the balcony slider are not hinged. K1 did not recur.
- **`swing` forms.** `swing into` 34, `inward` 1, `outward` 2, `in` / `out` 0.

### Gaming and laundering observed

- **Townhouse stair shrunk for a label (OT2, OT9).** By the author's report, the stair's own label overprinted the stair symbol; the author pinned `label "Stair" at (750,5550)` and "shrank the stair to 1000x2000". The repair of `W_ANNOTATION_OVERLAP` produced a flight too short for its storey, and the label now sits in the 700 mm foot pocket with its area figure on the partition.
- **Labels pinned.** House "Bathroom" (8800,5600) and "Ensuite" (1900,7850) were pinned to clear `W_ANNOTATION_OVERLAP`; both land inside their rooms (not counted). Townhouse "Bedroom 1" is pinned at (900,1700), its text starting at about the west wall's inner face (not measured to a defect).
- **Repair pressure on furniture size.** The house author overrode catalogue sizes "found only through overlap and collision warnings" and rearranged the master bedroom and ensuite to clear door-clearance rules; the master double ends up 1400 × 1800 (OH4). Not proven laundering, but the loop shaped it.
- **No deleted furniture, retyped room or outward swing to clear a warning** is visible in the final plans or reports. The café author added a counter for `W_ROOM_MISSING_DEFINING` and turned chairs per hint (honest repairs). The studio and townhouse authors switched corner `anchor` pieces to `against` (and turned two basins `rotate 180`) to clear `W_FIXTURE_BACK_TO_ROOM`.
- The two kitchens typed `uses living` (OA2, OS1) carry no evidence of a retype; no author ran taste, so none moved R6 or R16.

### Tool facts (not counted as defects)

- **House wall thickness.** `walls from rooms exterior 250` under `grid 100` is drawn 300 thick: `bbox_outer` 12900 × 9200 on 12600 × 8900 centrelines, living net 14.72 m² = 4600 × 3200, thickness text "300". No diagnostic.
- **Café grid snap (PS0.25 again).** `grid 100` turned the 450 × 450 chairs into 500 × 500 and moved them (`cx - 225` = 2075 → 2100). The 100 mm the author left between back-to-back chairs became 0 (OC3). No diagnostic.
- **Clinic main entrance.** `describe` `mainEntrance` is a tie (`exit_main`, `exit_rear`, `door: null`); lint circulation is `partial` and privacy `skipped` (`no-main-entrance`), as for the 2026-10-25 café. The author saw this and could not tell whether it was expected.
- **Townhouse `describe`.** The top-level caption and `totals` cover level 0 only ("a 5-room floor plan, 55 m² total"); level 1 is only in `levels[]`.
- **Townhouse Plan JSON.** `compile -f json` per level carries no stair at all; the flight's footprint is only in `describe` `verticals` (bbox 250,3250, 1000 × 2000).
- **Stairs are unjudged.** Default lint has no stair rule besides `W_STAIR_UNMATCHED`: foot access, the head landing and the run against the storey height (OT1–OT3) produce nothing.
- **Advisory profile catches three rows the default misses.** `--profile accessibility-advisory` reports the clinic sofa at the exit (`W_DOORWAY_BLOCKED`, OK5), the house bedroom-3 door against the wardrobe (`W_SWING_OBSTRUCTED`, OH8) and the café accessible WC's basin (`W_WC_SIDE_CLEARANCE`, 400 vs 450, part of OC5). The Lint cells stay default.
- **`W_GARAGE_TOO_NARROW` measures width only.** The house garage's 2800 clear width passes its 2700 bay; the 5300 length (OH5) is not judged.
- **Taste.** R6 sees OA2 and OS1. R11 = 0 on the house names the missing dining link, which is OH2 in substance. Nothing else in taste names an audited defect (2.5 / 52 counting R11 as half).
- **Apartment `describe`.** `entrances` lists the balcony slider (`door_5`) beside the front door; `mainEntrance` is correctly `door_1` (`entry-room`). `open between hall and living` with no `width` removes the whole 9200 mm shared edge.
- **`validate --json`** returns `next: null` on all six (they are lint-clean).

### Repeats and new this run

Repeats of 2026-10-24 / 2026-10-25 findings:
- the sofa back to the TV (NH2, RH1): OH1, OT4;
- kitchens hidden by `uses living` (NA1, NS1, RA2, RS2): OA2, OS1; the kitchen/dining typed `kitchen` with no table (NH1): OH2;
- no continuous worktop (RH2) and a hob beside the fridge (NT7): OH3;
- a wardrobe front against a bed side (RH4): OA4;
- bed heads across windows (RH7): OA5, OH7, OT7; a double flush in a corner (NA3, NS3, NT6, RA4, RS1): OS2, OT5;
- a basin front against the bathtub (RH8): OH9;
- the garage too short (NH4, RH5): OH5;
- the counter zoning (NC2, RC1): OC1;
- the accessible WCs (NC4, NK2, RC2, RK2): OC5, OK2;
- no wash-hand basin in the café kitchen (RC3): OC6; the hob under a window (NC8, RC4): OT6;
- customers through the back passage (RC5): OC7; chairs back to back (RC6): OC3, closer this time;
- the corner entrance (NC7, RC7): OC8;
- unlabelled rooms (RH9): OC9, OT9;
- the stair foot and head (NT1, NT2, RT1, RT2): OT1, OT3; a leaf across a corridor (NH3): OC2, OK3;
- no seat in the clinic (NK1, RK1): OK1; the reversed reception desk (RK3): OK4; the waiting sofa facing the façade (NK5): OK5; the clinic zoning (NK6, RK5): OK6;
- an oversized entrance (RS5): OS3; thickness text on every plan; area basis on all three dwelling briefs (RA8, RH11, RS7).

New this run:
- a hall opened over its whole length, so every private door opens onto the living space (OA1);
- a fridge whose door meets the end of the sink run (OC4);
- a stair flight too short for its storey, made by repairing a label warning (OT2), and a stair entered at its head (OT1, a blocker again after 0 on 2026-10-25);
- a sofa standing in front of the main exit (OK5's egress half) and an accessible WC three times its need (OK7);
- the master bedroom the smallest bedroom, its double cut to 1400 × 1800 (OH4); a door leaf parked in front of a wardrobe (OH8); a WC front 500 mm from a wall (OH10); a garage reached through the kitchen and utility (OH6);
- no transposed footprint this run (3 on 2026-10-25), and no context modelled inside a plan (RA1 did not recur).

## Part 2 · Arm B · the six briefs, cold-authored (current role: compile → validate → lint → score --taste → repair)

### The loop each author ran

CLI calls are from the shim log, counted as compile / lint / describe / validate / score. "First lint" is the first lint after the plan first compiled; the auditor re-ran it on that version, which it rebuilt from the transcript's first `Write` and the author's own `sed` edits. Three authors truncated their output (`head -c`), so they saw fewer codes than the counts below; the note in each row says so.

| Plan | Form | CLI calls (c / l / d / v / s) | First lint | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | rooms-first, relational rooms (`walls from rooms`, 5 `door between`, 0 `wall`) | 4 / 4 / 0 / 0 / 0 | 6: `W_FURNITURE_OVERLAP` ×3, `W_FURNITURE_WALL_COLLISION`, `W_FOOTPRINT_TRANSPOSED`, `W_LEAF_ACROSS_DOORWAY` (then `W_DRAWING_OVERFLOW` from compile) | 0 | 0.88 | 10 (0 / 4 / 6) |
| 2 House | rooms-first (1 `walls from rooms` with 1 `open between`, 9 `door between`, 0 `wall`) | 11 / 13 / 2 / 1 / 0 | 18: `W_DOORWAY_BLOCKED` ×6, `W_SWING_OBSTRUCTED` ×5, `W_PATH_TOO_NARROW` ×3, `W_WC_SIDE_CLEARANCE` ×2, `W_FURNITURE_OVERLAP`, `W_ROOM_MISSING_DEFINING` | 0 | 0.98 | 9 (0 / 4 / 5) |
| 3 Studio | rooms-first (1 `walls from rooms` with 3 `open between`, 1 `door between`, 0 `wall`) | 6 / 6 / 0 / 0 / 0 | 6: `W_FURNITURE_OVERLAP` ×2, `W_PATH_TOO_NARROW`, `W_ROOM_MISSING_DEFINING`, `W_ANNOTATION_OVERLAP`, `W_WC_SIDE_CLEARANCE` (the author's `head -c 3500` showed 5) | 0 | 0.98 | 8 (0 / 1 / 7) |
| 4 Café | rooms-first (1 `walls from rooms`, 4 `door between`, 1 `opening between`, 0 `wall`) | 2 / 8 / 0 / 0 / 0 | 23: `W_SEAT_FACING_AWAY` ×18, `W_ROOM_MISSING_DEFINING` ×2, `W_CIRCUITOUS_PATH`, `W_WET_ROOM_DOOR`, `W_WC_SIDE_CLEARANCE` (the author's `head -c 4000` showed the first 4) | 0 | 0.71 | 8 (0 / 3 / 5) |
| 5 Townhouse | rooms-first, one `walls from rooms` per level (7 `door between`, 0 `wall`) | 7 / 7 / 0 / 0 / 0 | 13: `W_ANNOTATION_OVERLAP` ×3, `W_SWING_OBSTRUCTED` ×3, `W_DOORWAY_BLOCKED` ×2, `W_FURNITURE_OVERLAP`, `W_FIXTURE_BACK_TO_ROOM`, `W_ROOM_MISSING_DEFINING`, `W_FURNITURE_OVER_WINDOW`, `W_PATH_TOO_NARROW` | 0 | 0.97 | 11 (1 / 5 / 5) |
| 6 Clinic | rooms-first (1 `walls from rooms` with 1 `open between`, 6 `door between`, 0 `wall`) | 2 / 3 / 0 / 0 / 0 | 4: `W_SWING_OBSTRUCTED` ×3, `W_FIXTURE_BACK_TO_ROOM` (the author's `head -c 3000` showed 2) | 0 | 0.72 | 8 (0 / 3 / 5) |
| **Total** | 6 / 6 rooms-first (32 `door between`, 0 `wall`) | **32 / 42 / 2 / 1 / 0** (77) | 70 | 0 | 0.71 – 0.98 | **54 (1 / 20 / 33)**; 51 without the 3 area-basis rows |

Every final plan has `validate --json` `next: null` and default `lint` diagnostics `[]`. The café and the clinic report
partial coverage (see Tool facts). Final taste: no score is capped and every plan has 0 validity or drafting warnings.
The criteria below 1 are: apartment R6 0.67 and R17 0.25; house R6 0.92; studio R17 0.75; café R11 0, R16 0.33 and
R17 0.7; townhouse R14 0.67; clinic R16 0.33 and R17 0.67.

The calls beyond compile and lint: the house author's `describe --select access`, `describe --select caption,rooms --room living` and `validate --json` (run after its plan was already lint-clean, and read as `next: null`), plus one `lint` of a scratch copy of the house with its sofa deleted, counted in the total (the 42 lint calls include it). Two authors, the apartment's and the house's, wrote in their replies, unprompted, that they had not run `describe` (the house: "beyond a room-level check") or `score --taste`. The role text these authors held names `validate` as step 3 and `score --taste` as step 5: they knew the steps and skipped them.

Final state of the six plans on the current CLI: default `lint` clean on all six; `validate --json` `next: null` on all six; `score --taste generic` 0.88 / 0.98 / 0.98 / 0.71 / 0.97 / 0.72 (apartment … clinic), none capped.

### Forms used

- 6 / 6 `walls from rooms` (the townhouse twice, one per level), 33 `door\|opening between` (the auditor's 32 `door between` excludes the one `opening between`), 0 `wall` statements, 0 `facing` in the final plans.
- Swing words: `into` 37, `inward` 3, `outward` 0.

### Authoring friction

These are compile errors the authors hit, taken from their reports and checked against the transcripts.
- `E_PARSE` from clause order:
  - `align left` after `size` in a relational room (apartment).
  - `uses` before `label`, 13 hits each (house, townhouse).
  - the `garage` kind word placed after the width (house).
- `E_OPENING_DATUM`: a bare `at <mm>` on an edge-hosted opening needs `from start|end` (apartment).
- `E_OPENING_NIB`:
  - a 1000 mm door on the 1300 mm end of the corridor (apartment);
  - 8 door positions, then a master window whose jamb fell 100 mm from the face of a 300 mm wall (house);
  - a WC door 50 mm from a partition face (townhouse).
- `W_SWING_ROOM_NOT_ADJACENT` followed each refused door, because its `swing into` named a room the door no longer bordered.
- `E_FURN_SIZE` ×18: `in <room> anchor` needs a `size`, where `against` does not (studio).
- `facing` inside a `for` loop: the café author tried `id="t{r}_{c}"` plus `facing t{r}_{c}` and got `E_PARSE`,
  `E_UNKNOWN_REF` and `E_FACING_TARGET`. Loop-generated ids cannot be interpolated, so the author fell back to `rotate`.
- The clinic compiled on the first write.

### Verified defects

Severity and class follow the baseline audits. Every Lint cell is the final plan's default lint, which reports
none of the 54.

**1 · Apartment** (flat 9000 × 7800, plus a 9000 × 1300 corridor room; 81.9 m² total, flat 70.2 m² centreline)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CA1 | The common corridor is modelled as a room of the flat (as RA1). It is walled on three sides by the 200 exterior wall and has its own exterior door, so the flat has two front doors in series. The balcony slider counts as a second entrance: `circulation` measures the living room and bedroom 1 from the balcony | `corr` `uses circulation` x 0–9000, y 7800–9100; `door_2` x 700–1700 on y 9100; `describe` `access.entrances` = `["door_2","door_7"]` (`door_7` is the balcony door); circulation `entranceId` `door_7` for `living` and `bed1` | N | **new** (context) | MISSED |
| CA2 | The kitchen has no hob, and the room is typed `uses living` only (NA1, RA2 again) | fridge x 250–950, counter 1050–2950, sink 2950–3650, all at y 3950–4550 on `living.bottom`; no `stove` | N | 4 | MISSED (typing; taste R6 0.67 sees it) |
| CA3 | The sofa is a transposed footprint: one seat wide and 2 m deep, facing south toward the hall door. The repair made it: the author replaced `size 2000x900 rotate 90` by `size 900x2000` to clear `W_FURNITURE_OVERLAP`, and deleted the `tv_unit` | `sofa … size 900x2000`, no rotate, x 4450–5350, y 1300–3300; there is no TV in the plan | N | **new** (transposed) | MISSED |
| CA4 | The bedroom 2 wardrobe front is 200 mm from the bed side, so the wardrobe cannot open and the bed's south side has no access | `bed_9` y 5450–6950, x 100–2100; `wardrobe_10` x 1000–2400, y 7150–7750, `rotate 180` (front north) | N | 5 | MISSED |
| CA5 | Both bed heads stand across windows | bed 1 head at the east face x 8900, y 1300–3300, `window_4` y 1550–3050; bed 2 head at x 100, y 5450–6950, `window_5` y 5450–6950 | m | 5 | MISSED |
| CA6 | The only nightstand is 1.1 m from the bed, in the far corner, not at the bedside | `nightstand_7` x 5800–6200, y 400–800; `double_bed_6` x 7300–8900, y 1300–3300, head on the east wall | m | **new** (relation) | MISSED |
| CA7 | The dining table has no chairs | `table_2` 1800 × 900, x 1800–3600, y 1850–2750; the `table` glyph draws none | m | 4 | MISSED |
| CA8 | The hall is 10.9 m², 15.5 % of the flat and as large as bedroom 2 | `hall` 3400 × 3200 = 10.88 m² of 70.2 m² | m | **new** (space efficiency) | n/a |
| CA9 | Wall-thickness text inside rooms | "100" and "200" inside bedroom 1, by the west and east walls | m | 8 | MISSED |
| CA10 | "~70 m²" is met only on centrelines | flat 9000 × 7800 = 70.2 m² centreline; GIA 8800 × 7600 = 66.9 m² | m | **new** (area basis) | n/a |

**2 · House** (12000 × 9500, 114 m² centreline with a 16 m² garage; exterior walls 300, see Tool facts)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CH1 | All three double beds stand flush in a corner with one long side against a wall, so that side has no access. The master's free side has 200 mm to the wardrobe at the pillow end, and its walled side runs across the west window | master `bed_1` 1800 × 2100, x 150–1950, y 150–2250 (west face 150); `wardrobe_2` x 2150–3950, y 150–750; `window_2` y 1200–2400 on x 0; bed 2 x 6050–7550 (west face 6050); bed 3 x 10350–11850 (east face 11850) | N | 5 | MISSED |
| CH2 | All three bed heads stand across the north windows. The master window was moved there to clear `W_FURNITURE_OVER_WINDOW` (the wardrobe had stood in front of it) | master `window_1` x 350–1850 behind a head at x 150–1950; bed 2 x 6050–7550 against `window_4` x 6750–8250; bed 3 x 10350–11850 against `window_5` x 9750–11250 | m | 5 | MISSED |
| CH3 | There is no continuous worktop. The hob stands at the end of the run against the kitchen/living partition, 500 mm from the sink, with no worktop either side. The fridge is 2.5 m away at the north end. The only counter (900) was added to clear `W_ROOM_MISSING_DEFINING` | counter x 5550–6450, sink 6650–7650, stove 8150–8750, all at y 8750–9350; fridge x 8050–8750, y 5550–6250 | N | 4 / 5 | MISSED (presence only) |
| CH4 | "Kitchen / Dining" has no table and no chairs. The author found no dining-table category and left them out. The room is typed `uses kitchen` only (NH1 again) | `kitchen` 3300 × 4000: counter, sink, stove, fridge | N | 4 | MISSED (typing) |
| CH5 | The garage is too short for a car (NH4, RH5) | internal 3800 × 3800 (x 150–3950, y 5550–9350); 2400 garage door | N | **new** (advisory size) | MISSED |
| CH6 | The plan has no `title` block, which the brief asked for | only `plan "Three-bed family house"`; the sheet shows a scale box alone | m | **new** (brief) | n/a |
| CH7 | Wall-thickness text inside rooms | "300" inside Bed 2 at about (8570, 300); "100" inside the utility at about (4190, 7460) | m | 8 | MISSED |
| CH8 | The hall is a 9.2 × 2.0 m spine of 18.4 m², 19 % of the habitable floor (NH8's pattern) | `hall` x 2800–12000, y 3500–5500 | m | **new** (space efficiency) | n/a |
| CH9 | "~110 m²" is missed on the habitable floor (H8, NH10, RH11) | 114.0 − 16.0 = 98.0 m² centreline; GIA 11700 × 9200 = 107.6 m², less the garage | m | **new** (area basis) | n/a |

**3 · Studio** (6500 × 4600, 29.9 m² centreline; kitchenette, entrance and alcove joined to the living by `open between`)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CS1 | The L-sofa is anchored `bottom-left flush` but not turned, so it faces the south wall flush, with its back to the room (NS4 again). It is also undersized against the catalogue 2600 × 1600 | `sofa_l … size 2000x900`, rotate 0, x 100–2100, y 3600–4500; wall face 4500 | N | **new** (relation) | MISSED |
| CS2 | The bed's long side runs across the alcove's only window | `bed_8` 1300 × 1900, x 5100–6400, y 2050–3950 (east face 6400); `window_5` y 2700–3900 on x 6500 | m | 5 | MISSED |
| CS3 | The fridge stands 550 mm in front of the sink, its back in the kitchen/living opening | `fridge_2` x 100–700, y 1250–1950, `rotate 180` (front north); sink front y 700; opening x 350–2150 on y 2000 | m | 5 | MISSED |
| CS4 | The flat has no wardrobe or other storage. The author deleted the alcove's wardrobe and nightstand to clear `W_FIXTURE_BACK_TO_ROOM` and `W_ANNOTATION_OVERLAP` | the furniture list holds no `wardrobe`; `sed -e '/nightstand/d' -e '/wardrobe/d'` in the transcript | m | 4 | MISSED |
| CS5 | The shower tray is 700 × 700. It was shrunk from 800 × 800 in the round that pinned the bathroom label | `shower_7` x 5700–6400, y 100–800; `s/size 800x800/size 700x700/` in the transcript | m | **new** (advisory size) | n/a |
| CS6 | "Bathroom" was pinned to clear `W_ANNOTATION_OVERLAP` and now prints over the bathroom door's leaf and swing | `label "Bathroom" at (5100,700)`; `door_2` on x 4500, y 600–1400, leaf parked along y 600 to x 5300 | m | 8 | MISSED |
| CS7 | Wall-thickness text inside rooms | "200" inside the bathroom by the north wall; "100" inside the alcove at about (4710, 2320) | m | 8 | MISSED |
| CS8 | "30 m²" is met only on centrelines | 29.9 m² centreline; GIA 6300 × 4400 = 27.7 m² | m | **new** (area basis) | n/a |

**4 · Café** (12000 × 7500, 90 m²; 24 seats at six 1400 × 800 tables)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CC1 | The "Serving Counter" room has nothing to serve from. Its one bar counter stands against the west window, with stools facing the glass, so staff have no service side. The room's `uses kitchen` was dropped and the room relabelled to clear `W_ROOM_MISSING_DEFINING` (NC1, NC2, RC1 again) | `counter` room x 0–4500, y 3000–7500, no `uses`; `bar_counter_10` x 100–800, y 3850–6650, `rotate 270`, in front of `window_3` y 4550–6050 | N | **new** (counter zoning) / 4 | MISSED (silenced) |
| CC2 | The hob stands alone mid-wall: 1450 mm from the fridge, 950 mm from the sink, with no worktop either side. The one counter (600 × 1400) is an L-return beyond the sink, added to clear `W_ROOM_MISSING_DEFINING` | fridge x 2550–3250, stove 4700–5500, sink 6450–7650, all on the north wall at y 100–700/800; `counter_9` x 7050–7650, y 800–2200 | N | 4 / 5 | MISSED (presence only) |
| CC3 | Accessible WC: there is no grab-rail wall, the basin is at the back corner and the door swings in. With the door's swing kept clear, the room has 1250 mm of depth, not a 1500 mm turning circle (NC4, RC2 again) | pan centreline x 10750, 1200 mm to the west face 9550; basin x 11400–11900, y 100–500; `door between dining and accwc … swing into accwc` x 10350–11250; pan front y 800, swing reaches y 2050 | N | 5 (accessible) | MISSED |
| CC4 | The hob sits wholly under the kitchen window (NC8, RC4 again) | stove x 4700–5500; `window_5` x 4350–5850 on y 0 | m | 5 | MISSED |
| CC5 | The kitchen has no wash-hand basin (RC3 again) | fridge, stove, sink, one counter | m | 4 | MISSED |
| CC6 | The staff WC opens straight onto the public seating. Staff walk kitchen → servery → seating to reach it. The door was moved there off the kitchen to clear `W_WET_ROOM_DOOR` and `W_CIRCUITOUS_PATH` | `door between dining and staffwc` x 8200–9000 on y 3000; the kitchen's only door leads to the servery | m | **new** (zoning) | n/a |
| CC7 | There is no service entrance: the only exterior door is the customer entrance, so deliveries and refuse cross the seating to reach the kitchen and store | one exterior door, `entry` x 10800–11800 on y 7500; the kitchen and store have none | m | **new** (zoning) | n/a |
| CC8 | Wall-thickness text inside rooms | "200" inside the kitchen at about (3790, 460); "100" in the seating at about (4720, 5230) | m | 8 | MISSED |

**5 · Townhouse** (two `level`s, each 5500 × 10000 = 55 m² centreline; stair `st` x 1200–2200, y 4000–7600 on both)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CT1 | Bedroom 2 cannot be reached on level 1. Its only door opens off the landing onto a 150 mm strip between the stairwell and the partition | `door between landing and bed2` on x 2400, y 5550–6450; stair east edge x 2200, partition face 2350; `describe` level 1 circulation lists `bed2` as `unmeasured`, reason `no_threshold` | **B** | 7 / 3 | MISSED (no diagnostic) |
| CT2 | On level 0 the kitchen door opens onto the flank of the flight, 150 mm away, about 1.2 m up the rise. The kitchen is reached only through the living room | `door between stairs and kitchen` on x 2400, y 5550–6450, `swing into kitchen`; stair x 1200–2200, rising north from y 7600 to 4000 | N | 7 | MISSED |
| CT3 | The stair foot leaves 550 mm to the WC partition, and the WC door is straight ahead. The way off the foot is a turn west into the 1100 mm strip (RT1's pattern) | `dir up`, foot at y 7600; `stairs`/`wc` partition face 8150; `door_4` x 1300–2100 on y 8200 | N | 7 | MISSED |
| CT4 | The sofa faces south into the kitchen/dining, with its back to the TV (NH2, RH1 again) | `sofa_1` x 3100–5100, y 3700–4600, rotate 0; `tv_unit_2` x 2700–4100, y 100–500 on `living.top` | N | **new** (relation) | MISSED |
| CT5 | The hob stands alone on the east wall, 3.1 m from the sink and counter, with no worktop beside it. It was added to clear `W_ROOM_MISSING_DEFINING` | `stove_5` x 4800–5400, y 5600–6200; sink x 3250–4150 and counter 4250–5150 at y 9300–9900; fridge x 2450–3150, y 8950–9650 | N | 4 / 5 | MISSED (presence only) |
| CT6 | Both double beds stand flush in a corner with one long side against the east wall, so that side has no access. Each room is 3100 wide, so a centred bed would leave 650 mm a side | bed 1 x 3800–5400, y 100–2100; bed 2 x 3800–5400, y 7900–9900; east face 5400 | N | 5 | MISSED |
| CT7 | Both bed heads stand across windows | bed 1 head on y 100 against `window_1` x 3250–4750; bed 2 head on y 9900 against `window_4` x 3200–4800 | m | 5 | MISSED |
| CT8 | The dining table has no chairs (NT8 again) | `table_7` 1600 × 900, x 3150–4750, y 7050–7950 | m | 4 | MISSED |
| CT9 | Three room labels were pinned to clear `W_ANNOTATION_OVERLAP`: "Stair" prints its area across the west wall, "Kitchen / Dining" prints over the kitchen door's swing, and "Bathroom" (level 1) runs across the west wall and over the bathroom door's leaf (RT7 again) | `label … at (500,5800)`, `at (3500,5600)`, `at (800,8600)`; L0 `door_5` swing x 2450–3350, y 5550–6450; L1 `door_3` x 400–1200 on y 8200, swing to y 9000 | m | 8 | MISSED |
| CT10 | Wall-thickness text inside rooms, both levels | L0: "200" and "100" inside the living room; L1: "100" and "200" inside bedroom 1 | m | 8 | MISSED |
| CT11 | Circulation takes 36 % of each floor: a 2.4 × 8.2 m landing on level 1, and the hall plus the stair room on level 0 | L1 `landing` 19.68 m² of 55; L0 `hall` 8.4 + `stairs` 11.28 = 19.68 m² | m | **new** (space efficiency) | n/a |

**6 · Clinic** (12000 × 10000, 120 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| CK1 | No consulting room has a chair for the clinician or the patient, or a basin: each has a couch and a desk. The staff room (typed `uses utility`) has a counter with no sink (NK1, RK1 again) | furniture list; e.g. `desk_5` x 2300–3700, y 1650–2350 and `bed_4` x 300–1000, y 300–2200 in `consult_a` | N | 4 | MISSED |
| CK2 | Accessible WC: there is no grab-rail wall, the basin is in the back corner, and the door swings in (NK2, RK2 again) | pan centreline x 7200, 1150 mm to the west face 6050; basin x 7850–8350, y 9500–9900; `door between wc and corridor … swing into wc` | N | 5 (accessible) | MISSED |
| CK3 | The reception desk is reversed (RK3 again). The receptionist's chair is on the south side, facing the corridor partition with its back to the waiting room. The public side is a 350 mm slot against the partition | `reception_desk_1` x 3600–5600, y 6000–6700, rotate 0; chair drawn on the south side; partition face y 5650 | N | **new** (relation) | MISSED |
| CK4 | The waiting L-sofa faces the façade 200 mm away, with its back to the room (NK5 again) | `sofa_l_2` x 300–2300, y 8800–9700, rotate 0; wall face 9900 | m | **new** (relation) | MISSED |
| CK5 | Patients have free access to the staff room and the store: the waiting room is open to the corridor that serves them (NK6, RK5 again) | `open between waiting and corridor width 2400` (x 1800–4200 on y 5600); the corridor holds the `staff` and `store` doors | m | **new** (zoning) | n/a |
| CK6 | Both exits swing inward, including the corridor-end door that serves only as the second exit. That is lawful at about 15–20 occupants, but a dedicated escape door would open outward | `door on waiting.bottom … swing inward`; `door on corridor.right … swing inward` (`swing_building` `inward` on both) | m | **new** (egress) | n/a |
| CK7 | "Staff" prints over the south chair that the staff-room table glyph draws | `meeting_table_12` x 8900–10100, y 7400–8200; the glyph's chair falls below y 8200, where the label's first line sits | m | 8 | MISSED |
| CK8 | Wall-thickness text inside rooms | "200" inside Consulting 1 at about (3370, 440); "100" in the corridor at about (970, 5210) | m | 8 | MISSED |

### Q8: furniture turns and door swings

- **Seats at tables.**
  - The café drew 24 chairs in a `for` loop. Re-linted, its first compiled version has `W_SEAT_FACING_AWAY` on 18 of 24 chairs. The author saw them in round 2 and tried `facing`, which failed (Authoring friction). The author then tried a cycled `rotate` and finally redrew 1400 × 800 tables with chairs on the long sides.
  - Final: **0 / 24** face away. North chairs are at `rotate 0` and south chairs at `rotate 180`, each facing its table at 0 mm.
  - The apartment and townhouse used `table`, which draws no chairs (CA7, CT8). The house has no table (CH4). The clinic's two `meeting_table`s draw their own chairs.
- **Sofas facing their TV: 1 / 2.** The house sofa faces its TV. The townhouse sofa has its back to its TV (CT4).
  - The apartment's TV was deleted, and its sofa is transposed (CA3).
  - The studio sofa (CS1) and the clinic waiting sofa (CK4) have no TV, and each faces a wall 0–200 mm away.
  - One sofa of five is a transposed footprint (CA3). `W_FOOTPRINT_TRANSPOSED` fired on the house `sofa_l` and the apartment bed, and both were fixed. It does not see the category `sofa`.
- **Hinged exterior doors: 7 / 8 open the intended way.** The exception is the clinic's corridor exit (CK6).
  - The dwellings' front doors swing into the hall, entry or corridor; the balcony door swings into the living room.
  - The café's single entrance swings inward. That is lawful for about 30 occupants and is not filed.
  - The clinic's main door swings inward, which is acceptable for its occupancy.
- **`facing`:** 0 uses in the final plans (one failed attempt, café).
- **`swing` forms:** `swing into` 37 times, `swing inward` 3, `swing outward` 0, `swing in`/`out` 0.

### Gaming and laundering observed

- **Deleted furniture.**
  - Apartment: the `tv_unit`, deleted in the same edit that turned the sofa into a transposed footprint (CA3).
  - Studio: the wardrobe and nightstand, to clear `W_FIXTURE_BACK_TO_ROOM` and `W_ANNOTATION_OVERLAP` (CS4).
- **Shrunk fixtures.**
  - Studio shower 800 → 700 (CS5).
  - Townhouse bathtub 1700 × 750 → 1500 × 700. This is not filed, because 1500 is a stock length.
- **Labels pinned.** The studio's "Bathroom" now sits on a door leaf (CS6). The townhouse's "Stair", "Kitchen / Dining" and "Bathroom" now sit across walls or door swings (CT9).
- **A dropped `uses`.** The café's counter room lost `uses kitchen` and was relabelled "Serving Counter" to clear `W_ROOM_MISSING_DEFINING`. Five lint families now skip it (CC1).
- **Presence-only repairs.** One piece was added to satisfy `W_ROOM_MISSING_DEFINING`, with no worktop logic: the house counter (CH3), the café counter (CC2) and the townhouse stove (CT5).
- **Moved to clear a warning, defect relocated.**
  - House: the master window moved behind the bed head to clear `W_FURNITURE_OVER_WINDOW` (CH2).
  - Café: the staff-WC door moved onto the public seating to clear `W_WET_ROOM_DOOR` (CC6).
- **Honest repairs.**
  - The apartment front door moved along the corridor to clear `W_LEAF_ACROSS_DOORWAY`. A door–door defect was prevented.
  - Every `W_WC_SIDE_CLEARANCE` (4 loops) was cleared by moving the pan.
  - The 18 `W_SEAT_FACING_AWAY` were cleared by turning the chairs.
- **Not seen.** No author swung a door outward to clear a warning, and no author retyped a room to move a taste criterion.
- **A probe.** The house author ran lint on a copy with the sofa deleted (`/tmp/t.arch`) to locate a `W_CIRCUITOUS_PATH`. The copy was not kept.

### Tool facts (not counted)

- Townhouse:
  - `describe` level 1 circulation marks `bed2` `unmeasured` (`no_threshold`), yet lint emits nothing. Lint's room reachability counts the door, not the floor beside the stairwell (CT1).
  - No rule relates a door to a stair flank (CT2).
  - `compile -f json` (Plan JSON) has no stair element; the stair exists only in `describe` `verticals`.
  - The top-level `describe` caption covers level 0 only ("a 5-room floor plan, 55 m² total").
- House:
  - `grid 100` silently snaps `walls from rooms exterior 250` to 300. Plan JSON says `exterior: 300`, and the same source with `grid 50` keeps 250. This is PS0.25's silent snapping, on a wall thickness this time.
  - `W_GARAGE_TOO_NARROW` judges width only, so the 3800 mm length is silent (CH5).
  - Taste R6 0.92 calls a `kitchen_sink` in the utility room a wrong-use piece, which is a false reading.
- Café:
  - The untyped servery leaves the rooms, reachability, privacy, daylight and contents families `partial`.
  - Taste R11 = 0 misreads the kitchen → servery → seating order, as on the 2026-10-24 café.
  - Taste R16 0.33 ("door into Accessible WC 750 mm from the corner") is a criterion no audit judges.
- Clinic:
  - With two exterior doors, lint can name no main entrance: circulation is `partial` and privacy `skipped` (`no-main-entrance`), as the 2026-10-25 café was. `describe` lists both doors as entrances.
  - The clinic's R6, R11 and R12 are not judged (non-residential), so its taste weight is 4 / 11.
- `W_ANNOTATION_OVERLAP` sees neither door leaves and swings (CS6, CT9) nor a glyph's drawn chairs outside the declared footprint (CK7).
- `W_ROOM_LABEL_OUTSIDE` does not fire on room text that crosses a wall line (CT9).
- `describe` `access.entrances` counts the apartment's balcony slider as an entrance (CA1).
- Three authors piped CLI output through `head -c`. Each truncated JSON hid real warnings (the café saw 4 of 23 first-lint codes).

### Repeats and new this run

Repeats of 2026-10-24 and 2026-10-25 findings:
- the corridor modelled inside the flat (RA1) → CA1;
- kitchens hidden by typing: `uses living` (NA1, RA2) → CA2; `uses kitchen` with no table (NH1) → CH4;
- a transposed sofa (RA3, NT3) → CA3;
- a wardrobe front against the bed side (RH4) → CA4;
- beds flush in a corner (NA3, RA4, NT6) → CH1, CT6;
- bed heads across windows (RH7, NH7) → CA5, CH2, CT7;
- tables without chairs (NA4, RH6, NT8) → CA7, CT8;
- the hob alone, with no continuous worktop (RH2, RT5, NC5) → CH3, CC2, CT5;
- the garage too short (NH4, RH5) → CH5;
- the passage or entrance share (NH8, RS5) → CH8, CA8;
- area basis on all three dwellings (NA7, NH10, NS6, RA8, RH11, RS7) → CA10, CH9, CS8;
- a sofa facing a wall with its back to the room (NS4, NK5) → CS1, CK4;
- a sofa with its back to the TV (NH2, RH1) → CT4;
- the servery silenced and the counter zoning (NC1, NC2, RC1) → CC1;
- accessible WCs (NC4, NK2, RC2, RK2) → CC3, CK2;
- the hob under the window (NC8, RC4) → CC4;
- no wash-hand basin (RC3) → CC5;
- a staff-WC door moved to clear `W_WET_ROOM_DOOR` (NC3) → CC6;
- no seat in the consulting rooms (NK1, RK1) → CK1;
- the reversed reception desk (RK3) → CK3;
- the clinic zoning (NK6, RK5) → CK5;
- a short stair foot (NT1, RT1) → CT3;
- labels pinned onto walls (RT7, RK6) → CT9, CS6;
- thickness text on 6 / 6 plans again.

New this run:
- **a blocker from stair placement:** a bedroom door on a 150 mm ledge beside the stairwell (CT1). Its level-0 twin is a kitchen door onto the flight's flank (CT2). Both doors stood in the first draft, and no rule saw either;
- a nightstand 1.1 m from its bed (CA6);
- a shower shrunk to clear a label warning (CS5);
- a missing `title` block (CH6);
- no service entrance in the café (CC7);
- both clinic exits swinging inward (CK6);
- a label over glyph-drawn chairs that `W_ANNOTATION_OVERLAP` misses (CK7);
- a fridge 550 mm in front of the sink (CS3);
- the silent grid snap of a wall thickness (tool fact).

What did not recur:
- class 1, openings ignore walls: 0;
- door–door and leaf across a corridor: 0. `W_LEAF_ACROSS_DOORWAY` fired once and was repaired honestly;
- seats facing away at the final state: 0 / 24;
- the missing sleeping alcove (NS3, RS1): the studio has a real alcove this time.

---

## Then and now by class

Counts are the auditors' own; classes with two labels are counted under the first (`4 / 5` under 4,
`5 (accessible)` under 5, `7 / 3` under 7), as the earlier tables do.

| Class | 10-18 | 10-24 | 10-25 | 10-26 arm A | 10-26 arm B |
|---|---|---|---|---|---|
| 1 Openings ignore walls | 4 | 0 | 0 | 0 | 0 |
| 3 Circulation and privacy | 2 | 3 | 0 | 1 (OA1, the hall opened over its whole length) | 0 (CT1, unreachable, is filed under 7 as `7 / 3`) |
| 4 Defining contents | 5 | 8 | 7 (2 hidden by typing, 1 made by deleting a counter) | 6 (2 hidden by `uses living`, 1 by `uses kitchen`) | 10 (2 hidden by typing, 3 presence only, 1 made by deleting a wardrobe) |
| 5 Clearances | 11 | 14 | 13 | 15 | 11 (2 accessible WCs) |
| 7 Stair | 1 | 2 (both B) | 2 (both N) | 3 (1 B, 2 N) | 3 (1 B) |
| 8 Annotation | 8 | 6 | 9 (2 made by repairing `W_ANNOTATION_OVERLAP`, 1 unlabelled rooms) | 8 (6 thickness-text rows, 2 unlabelled-room rows, one with a label pinned under the flight) | 9 (6 thickness text; 2 made by pinning labels to clear `W_ANNOTATION_OVERLAP`; 1 label over glyph-drawn chairs that the rule does not see) |
| new: furniture relation | 9 | 3 | 3 | 5 | 5 |
| new: transposed footprint | 3 | 1 | 3 | 0 | 1 |
| new: door–door and leaf across a corridor | 2 | 2 | 1 | 2 | 0 |
| new: other (brief, context, zoning, size, stacking, area, space, egress, counter zoning) | 12 (3 area) | 9 (3 area) | 11 (3 area) | 12 (3 area) | 15 (3 area) |
| **Total (B / N / m)** | **57 (4 / 26 / 27)** | **48 (2 / 24 / 22)** | **49 (0 / 23 / 26)** | **52 (1 / 25 / 26)** | **54 (1 / 20 / 33)** |

What the table says, by class and not by the minor count:
- **Class 5, clearances:** 13 → 15 (arm A) and 11 (arm B), after four clearance rules landed. The rules
  fired in the loops and were cleared (below), but the surviving clearance defects are the ones those
  rules do not name: a bed or wardrobe front against a bed side, a bed head across a window, an
  accessible WC, a hob beside the fridge. The final default lint reports none of the 106.
- **Class 7, stairs:** 2 (both N) → 3 and 3, and the blocker count 0 → 1 in each arm, both on the
  townhouse stair (OT1, CT1). The only default stair rule is `W_STAIR_UNMATCHED`.
- **Class 4, defining contents:** 7 → 6 and 10. Kitchens typed `uses living` recur (OA2, OS1, CA2).
- **Class 8, annotation:** thickness text on 12 of 12 plans again; arm B adds four labels pinned onto
  walls or door leaves (CS6 one, CT9 three), arm A one label pinned in a stair pocket (OT9).
- **New classes:** furniture relation 3 → 5 and 5 (the sofa with its back to the TV, the sofa facing a
  wall, the reversed reception desk); transposed footprints 3 → 0 and 1 after `W_FOOTPRINT_TRANSPOSED`
  landed, where it fired in an arm-B loop and was cleared.
- **Not recurring:** class 1 (0 for the third run); the missing alcove (arm B); door–door interference in
  arm B (`W_LEAF_ACROSS_DOORWAY` fired once and was repaired honestly).

## The D15 verdict evidence (for the lead)

**The test, as D15 worded it.** Run two arms on the same briefs: (A) the spec text only, with the
pre-#250 role text; (B) the current role. Count `score --taste` and `validate` calls. Taste stays an
author tool only if arm A shows calls. If arm A shows none, D2's reverse-if is met and taste becomes a
reviewer's tool (ADR 0032's consequence).

**Measured.**

| Calls by 12 cold authors | Arm A (pre-#250 role) | Arm B (current role) |
|---|---|---|
| `score --taste` | **0 of 65** | **0 of 77** |
| `validate --json` | **0** | **1** (house; after its plan was lint-clean, `next: null`) |
| `describe` | 1 (townhouse, `--select totals,levels`) | 2 (house, `--select access` and `--select caption,rooms --room living`) |
| `compile` / `lint` | 27 / 37 | 32 / 42 |
| Authors who ran `score` / `validate` / `describe` | 0 / 0 / 1 of 6 | 0 / 1 / 1 of 6 |

**Reading.**
- **Arm A shows no `score --taste` or `validate` calls.** Under D15, taste is not an author tool on this
  evidence.
- **Arm B shows the role text alone does not change that.** The current role names `validate` as step 3
  and `score --taste` as step 5 of its loop. Against arm A it added one `validate` and one `describe`
  call and no `score` call. Two arm-B authors (the apartment's and the house's) wrote, unprompted, that they had not run `describe` and
  `score --taste`: they knew the steps and skipped them.
- **Both arms read the taught loop and did not use it.** `spec.llm.md` at `747eed00` carries PR #250's
  self-correction paragraph, which names `validate --json` (fix its `next` first) and `score --taste
  generic`; every author read `spec.llm.md` and nothing else. Arm A's authors therefore had the step
  in front of them in the one document they read, and made no call. That is the cleaner reading of
  PS7.4: teaching the step where cold authors read did not change their behaviour.
- **They did loop.** All twelve plans ended lint-clean without a nudge, though the prompt said "stop
  when it compiles". The authors run the verbs the prompt names (`compile`, `lint`) and iterate on
  them. This is a hypothesis about why, not a measurement: the prompt is the protocol's, unchanged
  since 2026-10-24, so the result measures this protocol, not an agent told to run the whole loop.
- **Uptake of the other new surfaces is one author.** `validate --json` `next` was run once in twelve
  plans, after the plan was clean, so `next` steered nothing. Its place in the loop is a staged
  authoring question (PS7.x), not a taste one.

**Taste's reach on today's 106 defects stays small.**
- Arm A: R6 sees OA2 and OS1 (kitchens in rooms typed `uses living`); R11 = 0 on the house names the
  missing dining link, which is OH2 in substance. That is 2.5 of 52 counting R11 as half.
- Arm B: the audit ties one defect to a criterion, CA2 (R6 0.67, the kitchen typed `uses living`). It
  also reports three misreadings or unjudged readings: R6 0.92 on the house calls a `kitchen_sink` in
  the utility room a wrong-use piece, R11 = 0 on the café misreads the kitchen → servery → seating
  order (as on the 2026-10-24 café), and R16 0.33 on the café is a criterion no audit judges.
- Every criterion below 1 otherwise is R16 or R17, which no audit counts.
- Taste no longer separates the old plans: 17 of 18 now score 0.5 on this commit (Part 1), because the
  clearance codes cap them. The 12 new plans are all uncapped (0.71 – 0.98).

**What the run says about the rest of the programme.**
- **The surviving-defect count is flat: 48 → 49 → 52 / 54**, under two auditor instances and one draw
  per author, so the difference cannot be told from the noise of one draw per brief and two auditors.
- **Blockers 0 → 1 in each arm, both on the townhouse stair** (OT1 enters the stair at its head with its
  foot in a 700 mm pocket; CT1 puts bedroom 2's only door on a 150 mm strip beside the stairwell). The
  2026-10-25 audit put its 0 blockers down to authoring chance, with no row-5 rule touching a stair;
  this run confirms the second half. The stair class has no default lint rule but `W_STAIR_UNMATCHED`.
- **Lint's reach on fresh plans:** the final default lint reports none of the 106 defects, as in every
  earlier run. In the loops the new rules did fire and were cleared: `W_WC_SIDE_CLEARANCE` (the arm-A
  café; four loops in arm B, every one cleared by moving the pan), `W_FOOTPRINT_TRANSPOSED` (the arm-B apartment bed and house `sofa_l`) and
  `W_LEAF_ACROSS_DOORWAY` (arm-B apartment); each was cleared, the leaf by moving the front door, and
  `W_FURNITURE_OVER_WINDOW` (arm-B house and townhouse). One of those repairs relocated the defect:
  the house's master window was moved behind the bed head to clear `W_FURNITURE_OVER_WINDOW` (CH2).
- **Repair pressure on the drawing is the new cost.** Clearing `W_ANNOTATION_OVERLAP` produced a stair
  shrunk to 1000 × 2000 for a 2800 mm storey (about 54° pitch, OT2), four labels pinned onto walls or
  door leaves (arm B: CS6, CT9) and a shower shrunk 800 → 700 (CS5); clearing `W_ROOM_MISSING_DEFINING`
  produced presence-only pieces (CH3, CC2, CT5) and a dropped `uses` (CC1); clearing furniture warnings
  deleted a TV (CA3), a wardrobe and a nightstand (CS4).
- **Rooms-first held** at 6 / 6 in both arms (64 `door between` or `opening between` in all, no `wall`
  statement). **`facing` was used in none of the 12 final plans**; one arm-B author tried it in a `for`
  loop, where loop-generated ids cannot be interpolated, and fell back to `rotate`.
- **Truncated lint output misled authors.** Three arm-B authors cut `lint --json` with `head -c` and
  repaired only what they saw (café 4 of 23 codes, clinic 2 of 4, studio 5 of 6).
- **Authoring friction is the same set as before:** clause order in `room` (`label` before `uses`),
  `E_OPENING_DATUM`, `E_OPENING_NIB`, and `E_FURN_SIZE` for `in <room> anchor`.

**Verdict (D15 applied).** Arm A shows no calls, so D2's reverse-if is met: taste is re-scoped as a
reviewer's tool and PS7.4 is `done` as measured. The ruling, its consequences and its reverse-if are
`../README.md` D20. A third arm (walls-first, PS1.3, reported separately) made 0 `score` and 0
`validate` calls in 66 under the same prompt: a third data point that supports D20 and does not change it.

## Candidate cards

New cards, filed in `../cards.md` with the next free ids (all `todo`):
- **PS2.56 · A room whose only door lands on an unwalkable strip.** CT1: `describe` marks the room
  `unmeasured` (`no_threshold`) and lint says nothing, because room reachability counts the door and
  not the floor beside it. *Acceptance:* the 2026-10-26 arm-B townhouse warns; the corpus clean twins
  stay silent. A sibling of PS2.34 (CT2 is its door onto a flight's flank).
- **PS7.6 · `lint` opens with a one-line summary.** Three arm-B authors truncated `lint --json` with
  `head -c` and repaired only what they saw (café 4 of 23, clinic 2 of 4, studio 5 of 6). A first key
  `N warnings: CODE ×k, …` in the JSON and a first line in the text report. A surface authors see, so it
  is stated in the next re-measure.
- **PS7.5 · Move the taste step out of the author loop** (D20's consequence (c)): the spec's
  self-correction paragraph, SKILL step 7 and the `arch-author` role.

Evidence lines were appended in `../cards.md` for PS0.25, PS2.11e, PS2.30, PS2.31, PS2.34 and PS2.41 only.
The remaining bullets are recorded here as evidence for the cards they name. The stair-run-too-short
candidate went into PS2.11e's existing stair-pitch bullet, not a new card. Checked against each card's
text before filing:
- **PS2.11e** (its stair bullets name pitch versus storey height, so OT2 goes there, not into a new card):
  OT2; the wardrobe front and the hob-to-fridge gap: OA4, CA4, OH3.
- **PS2.28** (sofa against its TV): OH1, OT4, CT4.
- **PS2.30:** OA2, OS1, CA2 (kitchens typed `uses living`); the laundering routes CC1 (the counter
  room's `uses kitchen` dropped and relabelled to clear `W_ROOM_MISSING_DEFINING`), CS4 and CA3
  (furniture deleted to clear warnings).
- **PS2.31:** CA7, CT8, CK1, OK1 (a table or desk with no seat).
- **PS2.32:** OA3, CS1, CK4, OK5 (a sofa facing a wall 0 to 500 mm away).
- **PS2.33:** OC2, OK3 (a leaf across a corridor).
- **PS2.34:** OT1, OT3, CT2, CT3 (stair foot, head and side entry; CT1 is PS2.56).
- **PS2.36 / PS2.16:** OC5, OK2, CC3, CK2 (accessible WCs); OC7, OK6, CK5, CC6, CC7 (zoning); CK6 (both
  clinic exits swing inward).
- **PS2.39:** thickness text on 12 of 12 plans (OA6, OH11, OS4, OC10, OT10, OK8, CA9, CH7, CS7, CC8,
  CT10, CK8).
- **PS2.41:** OT9, CS6, CT9, CK7; and the repair pressure: OT2 (a stair shrunk to 1000 × 2000 to clear
  the label warning), CS5 (a shower shrunk 800 → 700), four labels pinned (CS6, CT9).
- **PS2.42:** CA1 (the corridor modelled as a room of the flat, the balcony slider read as the entrance).
- **PS2.43:** OC1, CC1, OK4, CK3 (a counter or desk with its service side to a wall).
- **PS2.46:** OT6, CC4 (a hob under a window).
- **PS3.11:** CA3 (a plain `sofa` drawn transposed).
- **PS5.5:** the café R11 = 0 misreading (arm B) and the R6 reading of a utility sink.
- **PS0.25:** `grid 100` snapped `walls from rooms exterior 250` to 300 on both houses, and 450 mm chairs
  to 500 (OC3), with no diagnostic. The auditors wrote this card's id as PS0.20; the id is PS0.25
  (PS0.20 is a Plan JSON swing card), and the tool-fact lines above carry the corrected id.
- Not carded: the garage too short for a car (OH5, CH5; `W_GARAGE_TOO_NARROW` judges width only), the
  area-basis rows, space efficiency and brief rows, and `describe` caption and Plan JSON facts for the
  multi-storey case (the caption covers level 0 only; Plan JSON has no stair element).

Gaming and laundering observed, in one line each: arm A shrank a stair for a label and pinned labels
(OT2, OT9); arm B deleted a TV, a wardrobe and a nightstand, shrank a shower, pinned four labels onto
walls or leaves, dropped a `uses`, moved a window and a staff-WC door to relocate a defect, and added
presence-only pieces. No author swung a door outward or retyped a room to move a taste criterion.

## Corpus, concordance, tiling probe (same commit, with the twelve plans in the tree)

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

- **Defect corpus.** 59 / 73 (unchanged by this run, which adds no corpus case): openings-ignore-walls
  16/16, space-not-enclosed 6/6, circulation-privacy 11/12, missing-defining-contents 5/5,
  clearances 11/19, daylight 4/4, stair-safety 0/4, annotation-collisions 6/7. The stair class is
  still 0 of 4 in the corpus, and the two blockers of this run are stair defects.
- **`npx vitest run test/rooms-tiling-probe.test.ts`.** Passes, 27 / 27, with no re-pin. `first-contact-plans/`
  is an information root of the probe, never pinned, so the twelve new plans move no pinned count.
- **The four tests that read `first-contact-plans/`.** `lint-dwelling-reading`, `main-entrance`,
  `room-too-small-by-use` and `swing-building` all pass (121 tests: 22, 63, 8 and 28).

## Files

- `first-contact-plans/2026-10-26-rerun-armA/<n>-<brief>.arch` and
  `first-contact-plans/2026-10-26-rerun-armB/<n>-<brief>.arch`: the twelve final plans as the cold
  authors left them. Eleven are byte-identical to the authors' files; the arm-B café was written
  with CRLF line endings (56 CR bytes) and git stores LF (`.gitattributes`), so its committed bytes
  differ from the original only in line endings.
- The lint, taste, validate, describe and Plan JSON outputs, the renders, the transcripts, the shim call
  logs and the scripts were kept outside the repository.

## Confounders

These are the protocol's (step 10) plus what this run adds:
- **The prompt names only `compile|lint` and says "stop when it compiles".** It is the protocol's
  prompt, unchanged since 2026-10-24, used for both arms. "0 calls to `score --taste`" measures this
  protocol; it does not measure an agent told to run the whole loop. D20's reverse-if is that
  re-measure.
- **Two auditor instances** (same model, same brief, same rubric) audited the two arms. Arm B's
  auditor filed more minor rows (33 against 26) and fewer noticeables (20 against 25). Compare the
  arms by class and by blockers and noticeables, not by the minor count.
- **Authoring chance.** One draw per brief per arm (six plans each). The blockers in both arms are one
  townhouse stair each, drawn differently; the defect counts (52 and 54) differ by less than the
  spread between the earlier runs (57, 48 and 49). Do not read the arm difference as an effect of
  the role text.
- **The spec changed.** `spec.llm.md` at `747eed00` carries PR #250's loop paragraph, which the
  2026-10-25 authors did not see. The lint is also stronger than in the 2026-10-25 run (the four
  clearance rules, PRs #252 and #253, and the advisory profiles, PR #248). So the 2026-10-25 column and
  these two are not the same experiment.
- **The author model** is `claude-sonnet-5-5`, inherited from the dispatching session by the role file;
  the earlier runs record the model only as `sonnet`, so whether it is the same build is not recorded.
- **The role text of arm A is an uncommitted overwrite** of the current file with the pre-#250 text; the
  loaded description was checked against the dispatching session's own agent listing, as the protocol's
  step 2 asks. The SKILL, which also carries the loop, was not shown to the authors in either arm.
- **The authors ran through a logging shim** at `dist/cli.js`; the audits measured with the real build
  directly. The transcripts' own count agrees with the shim within one `compile`.
- **Output truncation.** Three arm-B authors cut `lint --json` output and saw fewer codes than there
  were, which shortens their loops (café 4 of 23, clinic 2 of 4, studio 5 of 6).
- **Part 1 does not depend on the arms.** It re-lints the same eighteen old plans at two commits, so it
  is one measurement and appears once.
