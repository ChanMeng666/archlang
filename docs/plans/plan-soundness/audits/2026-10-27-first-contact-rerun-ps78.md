> Research record, 2026-10-27 (run and audit), against `main@134765d1` (PR #305's merge; built CLI
> `archlang v1.43.1`, `dist/cli.js`). Read observations as evidence and diagnoses as hypotheses:
> re-measure before you build on a number. Programme entry: `../README.md` (D26, card PS7.8).
> Protocol: `first-contact-protocol.md`; this run adds the arm-2 prompt to it as a new dated block
> beside the frozen one and edits no existing text. Baseline: `2026-10-26-first-contact-rerun-row6.md`
> (61 defects, QA1–QK8). Two arms on the same commit, role, model and briefs: arm 1 the frozen
> 2026-10-24/25 prompt, arm 2 the whole-loop prompt. The plans:
> `first-contact-plans/2026-10-27-rerun-arm1/` and `…/2026-10-27-rerun-arm2/`. Ids carry the run
> prefixes `X` (arm 1: XA1, XH1, XS1, XC1, XT1, XK1) and `Y` (arm 2: YA1 … YK9).

# First-contact re-measure PS7.8: the frozen prompt against the whole-loop prompt

## Headline

| Measure | row 6 (`24a8afa2`) | arm 1, frozen prompt (`134765d1`) | arm 2, whole-loop prompt (`134765d1`) |
|---|---|---|---|
| Role as loaded | `compile → validate → lint → repair` | the same | the same |
| Prompt's verbs and stop | `compile\|lint`, "stop when it compiles" | the same | compile, `validate --stage`, lint, repair; "until `validate`'s `next` is null" |
| Defects (B / N / m) | 61 (2 / 26 / 33) | **64 (4 / 29 / 31)** | **56 (1 / 19 / 36)** |
| …without area-basis rows | 58 | **61** | **53** |
| …reported by final default lint | 12 | **16 + 3 partial**, all on the three plans not clean | **0** |
| Blockers | 2 (QH1, QT1), both reported by lint | **4** (XH1, XH2 house, XT1 townhouse stair, XK1 clinic exit swing) | **1** (YK1, clinic main exit behind the sofa and desk; named only by the a11y profile) |
| Lint-clean plans | 4 / 6 | **3 / 6** | **6 / 6** |
| Authors stopping with warnings standing | 2 (house 21, townhouse 14) | **3** (house 24, townhouse 11, studio 3) | **0** |
| Final plans with `validate`'s `next` null | not recorded | 3 / 6 | **6 / 6** |
| CLI calls c / l / d / v / s | 27 / 32 / 1 / 0 / 0 (60) | **20 / 25 / 0 / 0 / 0 (45)** | **26 / 25 / 6 / 46 / 0 (103)** |
| Authors running validate / `--stage` / describe / score | 0 / 0 / 1 / 0 | **0 / 0 / 0 / 0** | **6 / 4 / 6 / 0** |
| `--stage` gated one stage at a time | n/a | n/a | **0 / 4** (the four stages fired within ~1 s, as a batch) |
| Class 4 / 5 / 7 / 8 / relation (dual-class rows in both) | 10 / 19 / 3 / 10 / 6 | **10 / 24 / 3 / 9 / 6** | **11 / 19 / 1 / 10 / 2** |
| Sofas facing their TV | 0 / 3 | **0 / 4** | **2 / 3** (one by `facing`) |
| Hinged exterior doors opening the intended way | 8 / 8 | **7 / 8** | **6 / 6** |
| Taste, final plans | 0.50 – 0.94 | **0.50 – 0.85** (house, studio, townhouse capped) | **0.64 – 0.96** |
| Rooms-first / `wall` statements / class 1 | 6 / 6, 0, 0 | 6 / 6, 0, 0 | 6 / 6, 0, 0 |
| Shim log, first to last CLI call | 1.6 min | 1.37 min | 1.64 min |
| Dispatcher cost and wall time | $1.38, ~2.7 min | $1.47, 2.9 min | $1.77, 3.4 min |

**Read the columns by class and by blockers and noticeables, not by the minor count.** Each arm had
its own opus auditor (same rubric, same brief), and row 6 a third; D15's two auditors differed by 7
minor and 5 noticeable rows on the same kind of material. One draw per brief.
- **Arm 2 took the loop up; arm 1 did not.** Under the frozen prompt `validate` uptake stayed 0 / 6
  for the third time, and three authors stopped with warnings standing although the role names the
  whole loop. Naming the loop in the prompt gave 6 / 6 `validate` uptake, 46 `validate` calls, 6 / 6
  plans lint-clean with `next` null, and no author stopping early. `--stage` was used by 4 of 6, but
  always fired as a batch of four, never gated on one stage's `next`.
- **Arm 2 has fewer defects where it counts:** 1 / 19 B / N against 4 / 29 in arm 1 on the same commit
  and 2 / 26 in row 6. The difference is mostly what lint can see: arm 1's stopped plans carry blocked
  doors, a cut-off house and a stair approach that lint reports and a full loop repairs. Arm 2's minor
  count is higher (36 against 31), inside the auditor spread.
- **The residual is the same in every arm:** the families no rule names (tables with no chairs,
  wardrobe fronts at bed sides, bed heads across windows, accessible WCs with no grab-rail wall,
  counter zoning, kitchens hidden by `uses` typing, sofas against walls, wall-thickness text). Arm 2's
  final lint reports 0 of 56: the loop removes what lint sees and leaves what it cannot. Arm 2's one
  blocker is a blocked exit that only `--profile accessibility-advisory` names.
- **D26's reverse-if** ("the whole-loop arm shows no fewer defects than the frozen arm over two
  re-measures") is read here for the first time: arm 2 shows fewer (56 against 64; 1 / 19 against
  4 / 29), so this run does not count toward reversing it. One more re-measure is needed for the read.

What changed between row 6 (`main@24a8afa2`) and this run (`main@134765d1`), from
`git log 24a8afa2..134765d1` (PRs #286–#306):
- **Lint:** `hobWindowCover`, a hob must stand within 30 mm of the window wall (PS2.64, #296);
  `W_DOORWAY_BLOCKED` skips `garage` doors (PS2.65, #297); `validate`'s `next` precedence (PS7.7,
  #298); `W_ROOM_MISSING_DEFINING` reports a bath with a WC and no basin (PS2.66, #301).
- **Surfaces an author could see:** `spec.llm.md` changed by one example line (a window position);
  `skills/archlang/SKILL.md` gained two lines; the role file is unchanged.
- The rest: the examples made sound (#305), sourced figures (#306), dependency and CI work, docs.

## Method and commands

Every number comes from one of these, run on `main@134765d1` after `npm run build`, with
`dist/cli.real.js` (the real build behind the shim, see below):

```sh
node dist/cli.real.js lint <plan> --json                                    # default ruleset
node dist/cli.real.js lint <plan> --json --profile accessibility-advisory   # a11y profile
node dist/cli.real.js validate <plan> --json                                # `next`; also --stage <s>
node dist/cli.real.js describe <plan> --json                                # access.entrances, totals
node dist/cli.real.js compile <plan> -f json -o -                           # geometry for the defect audit
node dist/cli.real.js score <plan> --taste generic --json                   # taste report
npx vitest run test/defect-corpus.test.ts test/taste-separation.test.ts   # catch rate, concordance
npx vitest run test/rooms-tiling-probe.test.ts
npx vitest run test/lint-dwelling-reading.test.ts test/main-entrance.test.ts \
  test/room-too-small-by-use.test.ts test/swing-building.test.ts test/lint-messages-id-free.test.ts
```

**Run settings** (protocol steps 1 to 5):

| Setting | Arm 1 | Arm 2 |
|---|---|---|
| Commit under test | `main@134765d1` (PR #305's merge), detached worktree; `git rev-parse --short HEAD` = `134765d1` | the same worktree |
| Built CLI | `archlang v1.43.1` (`npm ci && npm run build`; `node dist/cli.js --version` = `1.43.1`) | the same |
| Role as loaded (each dispatcher's own agent listing, copied before dispatching into `replies-<arm>.md`) | `arch-author: Authors or edits .arch floor-plan files using the compiler's own verification loop (compile → validate → lint → repair). Use for any task that writes ArchLang source. (Tools: Read, Write, Edit, Bash, Glob, Grep)` | identical line |
| Role body | `.claude/agents/arch-author.md` at `134765d1`, unchanged since row 6 | the same |
| Dispatcher | one headless `claude -p --model sonnet --permission-mode bypassPermissions --max-budget-usd 3 --output-format json` session started in the worktree; prompt `lead-arm1.txt` | the same flags; prompt `lead-arm2.txt` |
| Dispatcher prompt | row 6's `lead-r6.txt` was lost with its scratch folder; it was reconstructed from row 6's settings table and the PS7.8 draft's recipe (`make-lead.mjs`): copy the `arch-author` listing line, dispatch six `arch-author` subagents in one message with the six per-brief prompts verbatim, wait for all six in the foreground, no follow-up, no nudge, save the replies verbatim | the same text, only the per-brief prompts and the folder differ |
| Authors | six `arch-author` subagents in one message, model `claude-sonnet-5-5` (inherited), no follow-up, no nudge; all six replied and saved a plan | the same; all six replied and saved a plan |
| Per-brief prompt | the protocol's 2026-10-24/25 prompt verbatim, `<run-folder>` `2026-10-27-rerun-arm1`: `compile\|lint` only, "stop when it compiles" | the protocol's new 2026-10-27 block (the owner-confirmed PS7.8 draft), `<run-folder>` `2026-10-27-rerun-arm2` |
| Files the authors read | `spec.llm.md` only | the same |
| CLI call counting | shim at `dist/cli.js` appended `{t, argv}` to `calls-arm1.jsonl` (45 lines) and imported `dist/cli.real.js` | log repointed to `calls-arm2.jsonl` (103 lines) between the arms |
| Dispatcher wall time and cost (its JSON) | 176.1 s (18:46:23 → 18:49:24 local), **$1.47**, 12 turns | 202.8 s (18:49:48 → 18:53:16), **$1.77**, 12 turns |
| Shim log, first to last CLI call | 18:46:53.9 → 18:48:16.1 (1.37 min) | 18:50:21.6 → 18:51:59.97 (1.64 min) |
| Auditor | one opus auditor, `claude -p --model opus --permission-mode plan --allowedTools "Bash(node:*)" --max-budget-usd 5`; $2.46, 11.7 min | the same; $2.28, 10.5 min |

Both arms ran one after the other on one machine. The auditors ran after both arms, in parallel,
read-only, and called only `dist/cli.real.js`: the call logs stayed at 45 and 103 lines.

---

## Arm 1 · the frozen prompt ("stop when it compiles")

The sections below are the arm-1 auditor's report, verbatim except one opening paragraph about a
stray file (see Confounders).

**Sources.** CLI is v1.43.1 at `main@134765d1`, run only as `dist/cli.real.js`. I re-measured geometry from `compile -f json -o -` (the townhouse with `--level 0|1`) and from `describe --json`. Coordinates are mm, y grows south, and `rotate 0` means back to the north. I could not check render crops, because a PNG or SVG crop would need a file write; every B row was re-measured from coordinates instead. The codes each author saw come from the tool results in `dispatcher-arm1.json`. Call counts come from `calls-arm1.jsonl`.

### The loop each author ran

| Plan | Form | CLI calls (c / l / d / v / s) | First lint after it compiled (codes the author saw) | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | rooms-first (`walls from rooms`, 1 `open between`, 4 `door between`, 0 `wall`) | 4 / 6 / 0 / 0 / 0 | 14 (read through `grep`, no summary line): `W_SWING_OBSTRUCTED` ×3, `W_FURNITURE_OVERLAP` ×2, `W_PATH_TOO_NARROW` ×2, `W_FURN_CLEARANCE`, `W_FIXTURE_FLOATING`, `W_FURNITURE_WALL_COLLISION`, `W_DOORWAY_BLOCKED`, `W_FIXTURE_BACK_TO_ROOM`, `W_ANNOTATION_OVERLAP`, `W_WC_SIDE_CLEARANCE` | 0 | 0.85 | 9 (0 / 5 / 4) |
| 2 House | rooms-first (2 `open between`, 8 `door between`) | 3 / 1 / 0 / 0 / 0 | 24 (its only lint, which is the final one) | **24** | 0.50 capped (uncapped 0.94) | 16 (2 / 8 / 6) |
| 3 Studio | rooms-first (3 `open between`, 1 `door between`) | 4 / 5 / 0 / 0 / 0 | 10: `W_PATH_TOO_NARROW` ×3, `W_DOORWAY_BLOCKED` ×2, `W_ANNOTATION_OVERLAP`, `W_FIXTURE_BACK_TO_ROOM`, `W_ROOM_MISSING_DEFINING`, `W_SWING_OBSTRUCTED`, `W_WC_SIDE_CLEARANCE` | **3** | 0.50 capped (uncapped 0.88) | 11 (0 / 4 / 7) |
| 4 Café | 1 `strip` + `walls from rooms` (1 `open between`, 4 `door between`) | 4 / 6 / 0 / 0 / 0 | 38: `W_SEAT_FACING_AWAY` ×24, `W_DOORWAY_BLOCKED` ×4, `W_SWING_OBSTRUCTED` ×4, `W_HABITABLE_NO_WINDOW` ×2, `W_PATH_TOO_NARROW` ×2, `W_ROOM_MISSING_DEFINING`, `W_WC_SIDE_CLEARANCE` | 0 | 0.65 | 6 (0 / 2 / 4) |
| 5 Townhouse | two `level`s, `walls from rooms` per level (1 `open between`, 6 `door between`) | 3 / 4 / 0 / 0 / 0 | 13: `W_FURNITURE_OVER_WINDOW` ×3, `W_ANNOTATION_OVERLAP` ×2, `W_STAIR_NO_LANDING` ×2, `W_DOORWAY_BLOCKED`, `W_PATH_TOO_NARROW`, `W_ROOM_MISSING_DEFINING`, `W_FURNITURE_OVERLAP`, `W_WC_SIDE_CLEARANCE`, `W_STAIR_SIDE_ENTRY` | **11** | 0.50 capped (uncapped 1.00) | 13 (1 / 6 / 6) |
| 6 Clinic | rooms-first (1 `open between`, 6 `door between`) | 2 / 3 / 0 / 0 / 0 | 3: `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_PATH_TOO_NARROW` | 0 | 0.67 | 9 (1 / 4 / 4) |
| **Total** | 6 / 6 rooms-first, 0 `wall`, 0 `facing`; swing words: `into` 35, `inward` 2, `outward` 0 | **20 / 25 / 0 / 0 / 0 (45)** | — | 3 plans not clean (38 warnings) | 0.50 – 0.85 | **64 (4 / 29 / 31)**; 61 without the 3 area-basis rows |

- **Other verbs:** none. The log has 0 calls to `fix`, `context`, `preview`, `explain` or `describe`.
- **Time span:** first to last call is 05:46:53 → 05:48:16, about 1.4 min.

### validate uptake and the next sequence

`validate` was called 0 times by every author (0 / 6), so no `--stage` value was used and no edit could follow a `next` code. The role text the authors loaded names validate ("compile → validate → lint → repair"); the prompt names only `compile|lint`.

`next` on the final plans, from my runs:

| Plan | `validate` | `--stage rooms` | `walls` | `openings` | `fixtures` | Ends with `next` null? |
|---|---|---|---|---|---|---|
| Apartment | null | null | null | null | null | yes (by lint, not validate) |
| House | `W_FURNITURE_OVERLAP` (fridge/sink) | null | null | `W_SWING_OBSTRUCTED` | `W_FURNITURE_OVERLAP` | no |
| Studio | `W_FIXTURE_FLOATING` | null | null | null | `W_FIXTURE_FLOATING` | no |
| Café | null | null | null | null | null | yes |
| Townhouse | `W_ROOM_MISSING_DEFINING` | `W_STAIR_TOO_STEEP` | `W_STAIR_NO_LANDING` | `W_STAIR_NO_LANDING` | `W_ROOM_MISSING_DEFINING` | no |
| Clinic | null | null | null | null | null | yes |

On the house, plain `next` is the 50 mm fridge/sink overlap, ranked ahead of both blockers (XH1, XH2). On the townhouse, plain `next` is the missing hob, ranked ahead of every stair code; only `--stage rooms` or `--stage walls` puts a stair code first.

### Authors stopping with warnings standing

- **House: 24** (`W_PATH_TOO_NARROW` ×9, `W_DOORWAY_BLOCKED` ×5, `W_SWING_OBSTRUCTED` ×3, `W_FURNITURE_OVER_WINDOW` ×3, `W_WC_SIDE_CLEARANCE` ×2, `W_FURNITURE_OVERLAP`, `W_ANNOTATION_OVERLAP`).
  - It gives one blanket reason, "stopped there as instructed", plus "most of them come from furniture that I put flush against doors and walls".
  - The blanket is true: 22 of the 24 trace to furniture placement, and the other two are the WCs flush to walls.
  - It gives no per-warning reason, and it never says that `W_PATH_TOO_NARROW` "no route reaches the room" means the whole house is cut off (XH1). It ran lint once, after its last compile.
- **Townhouse: 11** (`W_FURNITURE_OVER_WINDOW` ×3, `W_ANNOTATION_OVERLAP` ×2, `W_ROOM_MISSING_DEFINING`, `W_STAIR_NO_LANDING`, `W_STAIR_TOO_STEEP`, `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_STAIR_SIDE_ENTRY`).
  - It gives a reason for each one, and all 11 are true, including that it shortened the flight 3600 → 1900 to clear `W_STAIR_NO_LANDING` ×2, which produced `W_STAIR_TOO_STEEP`.
  - "Stopped there, as the brief said to" is only half true: after the first clean compile it ran one repair round (13 → 11).
- **Studio: 3** (`W_FIXTURE_FLOATING`, `W_FIXTURE_BACK_TO_ROOM`, `W_ANNOTATION_OVERLAP`).
  - It gives a reason for each, and each is true: the counter is 700 mm off the wall, it could not tell which rotate value puts the nightstand's back to a wall, and the label sits over the bed.
  - "I stopped at 'compiles' as briefed" is false as a description of the loop: it repaired 10 → 5 → 3 after compiling.

### Do the replies match the plans?

- **Lint claims:** all six are true code for code: apartment, café and clinic clean; house 24; studio 3; townhouse 11.
- **Round counts:**
  - Apartment says "6 times": 6 lints (plus 4 compiles) in 7 shell rounds. Its "about 16 furniture warnings" was in fact 14 codes, and "three label-overlap rounds" is exact.
  - House: 3 compiles and 1 lint, exact.
  - Studio: 5 rounds, exact (4 compiles, 5 lints).
  - Café says 7; the log shows 6 shell rounds (4 compiles, 6 lints).
  - Townhouse: "2 + 2 failed" is exact (3 compiles, 4 lints).
  - Clinic says "3 plus one final pass"; the log shows 3 rounds in all (2 compiles, 3 lints), so the final pass is round 3, counted twice.
- **Stated sizes and facts:**
  - Areas and footprints are right: apartment 8800 × 8000, studio 6000 × 5000, café 10 × 9 m, clinic 123.6 m², accessible WC 3000 × 4500.
  - The café honestly reports retyping the counter room to `uses circulation` to clear `W_ROOM_MISSING_DEFINING`, and placing the entrance near the corner rather than on it.
- **Omissions:**
  - House: the sofa that cuts off the house (XH1) and the hall being reached only through the kitchen (XH4).
  - Townhouse: the foot of the stair and the WC reached only through 450 mm gaps (XT1).
  - Clinic: the rear exit swinging inward (XK1).
  - Apartment: the 550 mm aisle between the kitchen run and the table (XA3).

### Verified defects

**1 · Apartment** (8800 × 8000 centreline, 70.4 m²; `exterior 250` draws 300; GIA 65.45)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XA1 | The sofa faces north toward the dining table; the TV is on the west wall at 90° to it, standing in front of the living window | `sofa` x 500–2700, y 3050–3950, rot 180 (`1-apartment.arch:26`); `tv_unit` x 150–650, y 600–2200, rot 270 (`:27`) vs `window_1` y 1200–2800 (`:22`) | N | new (relation) | MISSED |
| XA2 | The dining table has no chairs | `table` x 2100–3900, y 1300–2200 (`:28`) | N | 4 | MISSED (no rule) |
| XA3 | 550 mm between the hob/worktop fronts and the table | run fronts y 750 (`:29`–`:31`); table from y 1300 | N | 5 | MISSED |
| XA4 | Bedroom 2's double bed has its east side on the exterior wall, so it can be got into from one side only | bed x 7050–8650, wall face 8650 (`:33`) | N | 5 | MISSED |
| XA5 | Bedroom 1's double bed has its west side on the exterior wall; at the head end its free side is 200 mm from the wardrobe | bed x 150–1950, y 5850–7850 (`:35`); wardrobe x 2150–3950, y 7250–7850 (`:36`) | N | 5 | MISSED |
| XA6 | Both beds run their long side across a window | bed2 vs `window_2` y 1250–2750 (900 covered, `:23`); bed1 vs `window_3` y 5850–7350 (1500 of 1500, `:24`) | m | 5 | MISSED |
| XA7 | Circulation is 17.3 m² (corridor 10.56 + hall 6.72), 25 % of the flat | `:8`, `:11` | m | new (space efficiency) | n/a |
| XA8 | Wall-thickness text inside rooms | "100" at (3375, 3671) in Living; "300" at (6350, 429) in Bedroom 2 (`:5` `dims auto all`) | m | 8 | MISSED |
| XA9 | "~70 m²" is met only on centrelines | 70.4 centreline; GIA 65.45 | m | new (area basis) | n/a |

**2 · House** (13500 × 9300 centreline, 125.55 m² including a 20.25 m² garage; `exterior 250` draws 300)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XH1 | Past the entrance hall, nothing in the house is reachable with usable clear width. From the entry, the only way into the living room passes behind the sofa through 350 mm (or 250 mm at its west end). The way in through the garage is blocked at the utility (XH3) | `sofa_l` x 400–2800, y 3200–4100 (`2-house.arch:51`); living\|corridor partition face y 4450 from x 2000; west wall face x 150 | **B** | 3 / 5 | CAUGHT (`W_PATH_TOO_NARROW` ×7 "no route reaches the room") |
| XH2 | Neither the master bedroom nor the ensuite can be entered: the master door opens onto the bed head 50 mm away, and the bed's east side lies 50 mm from the ensuite door | `door_3` x 2250–3150 on y 6300 (`:30`); bed x 1450–3250, y 6350–8450 (`:59`); `door_4` y 7350–8250 on x 3300 (`:31`) | **B** | 3 / 5 | CAUGHT (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED` ×2, `W_PATH_TOO_NARROW` 0 mm) |
| XH3 | Both utility doors swing onto the washer 50 mm from the hinge | `door_8`, `door_9` (`:35`–`:36`); washer x 11550–12150, y 4550–5150 (`:73`) | N | 5 | CAUGHT (`W_SWING_OBSTRUCTED` ×2, `W_DOORWAY_BLOCKED` ×2) |
| XH4 | There is no door from the entry to the hall: the hall and all five bedroom-wing rooms are reached only through the living room and the kitchen | entry\|corridor wall x 2000 with no opening; `door_2` kitchen→corridor is the only link (`:29`) | N | 3 | MISSED |
| XH5 | The kitchen has no worktop run. A 600 counter stands alone on the north wall, the sink is on the east wall overlapping the fridge, and the hob is on the south wall about 3 m away | counter x 5700–6300 (`:53`); sink y 800–1600 vs fridge y 150–850 (`:54`–`:55`); stove x 7200–7800, y 3850–4450 (`:56`) | N | 4 | PARTIAL (`W_FURNITURE_OVERLAP` sees only the clash) |
| XH6 | The hob stands in the kitchen door's approach | stove x 7200–7800 vs `door_2` x 6350–7250 | N | 5 | CAUGHT (`W_DOORWAY_BLOCKED`) |
| XH7 | The dining table has no chairs | `table` x 5850–7650, y 1800–2700 (`:57`) | N | 4 | MISSED (no rule) |
| XH8 | The sofa has its back to the TV: both face south, 2550 apart | `sofa_l` rot 0 (`:51`); `tv_unit` y 150–650, rot 0 (`:52`) | N | new (relation) | MISSED |
| XH9 | The garage cannot take a car: about 4300 clear deep behind its north door | interior ≈ 4300 × 4300; `door_10` on y 0 (`:37`) | N | new (advisory size) | n/a |
| XH10 | Both WC centrelines are 200 mm from a side wall | ensuite WC centre x 4750, face 4950 (`:67`); bath WC centre x 6850, face 7050 (`:70`) | N | 5 | CAUGHT (`W_WC_SIDE_CLEARANCE` ×2) |
| XH11 | Wardrobes stand in front of the windows in three bedrooms | 700 / 750 / 450 mm covered (`:60`, `:63`, `:64`) | m | 5 | CAUGHT (`W_FURNITURE_OVER_WINDOW` ×3) |
| XH12 | Bed 3's long side runs across `window_10` | bed x 12350–13350 vs window y 7200–8400 on x 13500 (`:62`, `:48`) | m | 5 | MISSED |
| XH13 | The hall is 17.1 m² (9.5 × 1.8 m) | `:14` | m | new (space efficiency) | n/a |
| XH14 | "Master Bedroom" label is printed over the wardrobe | `:17` | m | 8 | CAUGHT (`W_ANNOTATION_OVERLAP`) |
| XH15 | Wall-thickness text inside rooms | "100" at (4729, 2300) in the kitchen; "300" at (775, 329) in Living | m | 8 | MISSED |
| XH16 | "~110 m²" is missed on the habitable floor | 105.3 centreline without the garage; GIA 118.8 − ~18.5 garage ≈ 100.3 | m | new (area basis) | n/a |

**3 · Studio** (6000 × 5000 centreline, 30 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XS1 | The sofa faces the south exterior wall 0 mm away; the TV is beside it on the same wall, facing north | `sofa` x 100–1800, y 4000–4900, rot 0 (`3-studio.arch:30`); `tv_unit` x 1950–3450, rot 180 (`:31`) | N | new (relation) | MISSED |
| XS2 | No worktop on the kitchen run: the counter floats 700 mm off the wall, 100 mm in front of the gap between hob and sink | counter x 4250–4850, y 800–1400 (`:27`); stove x 3550–4150, sink x 4900–5900, both y 100–700 (`:26`, `:28`) | N | 4 / 5 | CAUGHT (`W_FIXTURE_FLOATING`) |
| XS3 | The wardrobe front is 250 mm from the bed foot | wardrobe y 2050–2650 (`:34`); bed from y 2900 (`:32`) | N | 5 | MISSED (no rule) |
| XS4 | The double bed's east side is on the exterior wall, so it can be got into from one side only | bed x 4300–5900, wall face 5900 (`:32`) | N | 5 | MISSED |
| XS5 | The bed head stands across `window_4` (1100 of 1200) and its long side across `window_3` (1300 of 1400) | `:21`–`:22`, `:32` | m | 5 | MISSED |
| XS6 | The nightstand is at the bed's foot, free-standing 300 mm inside the open living–alcove line, with its back to the bed | x 3800–4200, y 2900–3300, rot 90 (`:33`); open edge x 3500 | m | 4 | PARTIAL (`W_FIXTURE_BACK_TO_ROOM` names the orientation only) |
| XS7 | The WC stands 200 mm off its back wall, with 450 mm in front of it to the basin | wc y 300–1000 vs wall face 100 (`:23`); basin from y 1450 (`:24`) | m | 5 | MISSED |
| XS8 | No table or seat to eat at | furniture list | m | 4 | MISSED |
| XS9 | "Sleeping alcove" label is printed over the bed and nightstand | `:11` | m | 8 | CAUGHT (`W_ANNOTATION_OVERLAP`) |
| XS10 | Wall-thickness text inside rooms | "100" at (3729, 3475); "200" at (875, 279) | m | 8 | MISSED |
| XS11 | "30 m²" is met only on centrelines | GIA 27.84 | m | new (area basis) | n/a |

**4 · Café** (10000 × 9000 centreline, 90 m²; 24 seats at six 4-tops)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XC1 | The bar counter has no service side: it is flush against the north exterior wall, 2.8 m back from the seating opening, and its room was retyped `uses circulation` to clear `W_ROOM_MISSING_DEFINING` | `bar_counter` x 6500–7900, y 100–700 (`4-cafe.arch:47`); opening on y 3500 (`:17`); `:12` | N | new (counter zoning) | MISSED (silenced) |
| XC2 | Accessible WC: the pan is centred 950 mm from both side walls, so no grab-rail wall is in reach, and the door swings in | `wc_3` centreline x 9000, faces 8050 / 9950 (`:37`); `door_6` swings into accwc (`:24`) | N | 5 (accessible) | MISSED |
| XC3 | The hob stands beside the sink with no worktop either side; the only worktop (800) is 2.15 m away on the opposite wall; no wash-hand basin | sink x 3850–4650, stove 4700–5300, y 2850–3450 (`:42`–`:43`); counter y 100–700 (`:45`) | m | 4 / 5 | MISSED |
| XC4 | The staff WC is reached only through the store | `door_3` swc–store (`:21`) | m | 3 | MISSED |
| XC5 | The "corner" entrance is a south-façade door whose jamb is 500 mm from the corner's inner face | `door_1` x 600–1800 on y 9000 (`:19`) | m | new (brief) | n/a |
| XC6 | Wall-thickness text inside rooms | "100" at (1729, 2825); "200" at (5875, 279) | m | 8 | MISSED |

**5 · Townhouse** (two `level`s, 5500 × 10000 each; stair `st` (4000, 4100) 1000 × 1900 on both levels; `height 2700`)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XT1 | On the ground floor, the hall door opens at the flight's high end. The foot of the stair and the WC beyond it are reached only through 450 mm (west) or 400 mm (east) gaps beside the flight, and the foot landing is 950 | stair x 4000–5000, y 4100–6000 (`5-townhouse.arch:28`); stair room faces x 3550 / 5400; `door_3` on y 3000 (`:20`); WC door on y 7000 (`:21`) | **B** | 7 / 3 | PARTIAL (`W_STAIR_NO_LANDING` names the foot landing only; circulation reads the flight as floor) |
| XT2 | A 1900 mm run for a 2700 mm storey (2640 needed, goings ≈ 158), shortened from 3600 to clear `W_STAIR_NO_LANDING` | `:28`, `:54` | N | 7 | CAUGHT (`W_STAIR_TOO_STEEP`) |
| XT3 | The bedroom 1 door opens 450 mm beside the stair void on level 1 | `door_2` y 3550–4450 on x 3500 (`:46`) | m | 7 | CAUGHT (`W_STAIR_SIDE_ENTRY`) |
| XT4 | The kitchen has no hob | `:31`–`:34` | N | 4 | CAUGHT (`W_ROOM_MISSING_DEFINING`) |
| XT5 | The fridge stands in front of the kitchen window | fridge x 1650–2350 vs `window_4` x 900–2700 (`:33`, `:25`) | m | 5 | CAUGHT (`W_FURNITURE_OVER_WINDOW`) |
| XT6 | The dining table has no chairs | `table` x 1300–3100, y 5400–6300 (`:34`) | N | 4 | MISSED |
| XT7 | The sofa (900 × 2200, rot 0) faces south with its back to the TV on the north wall | sofa y 1400–3600 (`:29`); `tv_unit` y 100–600 (`:30`) | N | new (relation) | MISSED |
| XT8 | The bathroom door swing hits the tub, 241 mm short | `door_1` level 1 (`:45`); tub x 4600–5400, y 1050–2750 (`:59`) | N | 5 | CAUGHT (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`) |
| XT9 | The wardrobes cover a whole window in each bedroom | 1600 / 1600 and 1400 / 1400 (`:56`, `:58`) | m | 5 | CAUGHT (`W_FURNITURE_OVER_WINDOW` ×2) |
| XT10 | The wardrobe fronts are 250 mm from the bed sides in both bedrooms | wardrobe front x 700 vs bed x 950 (`:55`–`:58`) | N | 5 | MISSED (no rule) |
| XT11 | The level-1 landing is 14 m² (25 % of the floor), 4 m of it south of the void serving one door | `:43` | m | new (space efficiency) | n/a |
| XT12 | "Stair" label over the flight; "Bathroom" label over the WC | `:14`, `:42` | m | 8 | CAUGHT (`W_ANNOTATION_OVERLAP` ×2) |
| XT13 | Wall-thickness text inside rooms on both levels | L0 "100" (1775, 4593), "200" (5043, 1525); L1 "100", "200" | m | 8 | MISSED |

**6 · Clinic** (12000 × 10300 centreline, 123.6 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| XK1 | The second exit, at the corridor's east end, swings into the corridor, against the escape direction | `door_8` on x 12000, y 4900–5900, `swing into hall` (`6-clinic.arch:26`) | **B** | new (egress) | MISSED |
| XK2 | There is no chair anywhere: each consulting room has only a desk, a couch drawn as a `bed`, and a basin; the staff room has a table without chairs and no sink or worktop | `:40`–`:54` | N | 4 | MISSED |
| XK3 | Accessible WC: the pan centreline is 1450 / 1400 mm from the side walls, so no grab-rail wall is in reach | `wc_13` centre x 10500, faces 9050 / 11900 (`:50`) | N | 5 (accessible) | MISSED |
| XK4 | The reception desk is at rot 0, so the receptionist sits facing the corridor partition 600 mm away, back to the waiting room and the entrance (chair side not re-rendered: auditor may not write files) | `reception_desk` x 600–2600, y 6900–7600 (`:36`) | N | new (relation) | MISSED |
| XK5 | The waiting `sofa_l` and the bench face the façade 300 mm away, back to reception | sofa y 9000–9900, bench y 9400–9900, rot 0; wall face 10200 (`:37`–`:38`) | N | new (relation) | MISSED |
| XK6 | The accessible-WC door and the east exit leaf clash in the corridor (60 mm short) | `door_4` (`:22`), `door_8` (`:26`) | m | new (door–door) | MISSED (a11y profile: `W_SWING_OBSTRUCTED`) |
| XK7 | The accessible WC is 13.5 m² | 3000 × 4500 (`:11`) | m | new (space efficiency) | n/a |
| XK8 | The shelving covers the whole store window | shelving x 9300–11700 vs window x 10000–11000 (`:55`, `:34`) | m | 5 | MISSED (`shelving` is uncatalogued) |
| XK9 | Wall-thickness text inside rooms | "100" at (1188, 5893); "200" at (9625, 458) | m | 8 | MISSED |

### Totals

- **Defects:** 64 (4 B / 29 N / 31 m); 61 without the area-basis rows (XA9, XH16, XS11).
- **Reported by the final default lint:** 16 CAUGHT and 3 PARTIAL (17.5 counting a partial as half) out of 64. All of them are on the three plans that were not clean; the clean apartment, café and clinic report 0.
- **Blockers:** XH1, XH2, XT1, XK1.
- **Lint-clean plans:** 3 / 6 (apartment, café, clinic).
- **Class counts (a dual-class row counts in both):** 4: 10 · 5: 24 · 7: 3 · 8: 9 · relation: 6 (3: 5).
- **Sofas facing their TV:** 0 / 4 (XA1, XH8, XS1, XT7).
- **Seats at tables:** the café has 0 / 24 chairs facing away.
- **Hinged exterior doors opening the intended way:** 7 / 8. The miss is the clinic's rear exit (XK1).
- **Taste range:** 0.50 – 0.85.
- **Form:** 6 / 6 plans are rooms-first, with 0 `wall` statements; class 1 count is 0.

| Class (first only) | Row 6 (2026-10-26) | Arm 1 (2026-10-27) |
|---|---|---|
| 1 | 0 | 0 |
| 3 | 1 | 4 |
| 4 | 10 | 10 |
| 5 | 16 | 20 |
| 7 | 3 | 3 |
| 8 | 10 | 9 |
| furniture relation | 6 | 6 |
| transposed | 0 | 0 |
| door–door / leaf | 1 | 1 |
| other | 14 | 11 |
| **Total** | 61 | 64 |

### Authoring friction

- `room … label` must come before `uses`; three authors (house, studio, townhouse) found this through `E_PARSE`.
- `E_FURN_SIZE` for `in <room> anchor …` without a `size` (apartment, studio, house).
- `inset` applies on both axes, which left pieces off their wall: the studio counter is 700 off and its WC 200 off.
- The door kind word must lead (`door sliding on …`); the apartment hit `E_PARSE` first.
- `E_FURN_AGAINST` when part of a room edge is open or is a different wall run (house, townhouse, café).
- `E_OPENING_DATUM` on a bare `at <mm>` (café, clinic), and `E_SWING_SIDE` for `swing inward` (clinic).
- `E_OPENING_NIB` led the house to widen its hall run 9000 → 9500 and the studio to move its bath door 1500 → 1400.
- Which way `rotate 90`/`270` turns is not in the spec: the café learned it from `W_SEAT_FACING_AWAY` ×24, and the studio nightstand stayed wrong.
- Uncatalogued categories (`table`, `chair`, `desk`, `bench`, `shelving`) compile silently.
- Stair landing and steepness rules are not in the spec (townhouse); the clinic could not name a main entrance.

### Tool facts (not counted)

- `next` ranks the house's fridge/sink overlap ahead of both blockers, and the townhouse's missing hob ahead of every stair code. Only `--stage rooms` or `--stage walls` surfaces the stair first.
- Circulation reads the townhouse flight as floor: it reports WC and stair bottlenecks of 700–840, while the gaps beside the flight are 450 / 400.
- `describe` lists the apartment's balcony slider `door_6` as an entrance (living depth 1, via the balcony) and the house's `garage` door `door_10` as one too.
- `exterior 250` resolves to 300 under `grid 100` with no diagnostic: apartment `bbox_outer` 9100 = 8800 + 300, and "300" is printed inside rooms.
- `W_FIXTURE_BACK_TO_ROOM` says the studio nightstand's wall is "on its left side", but it stands free, 850 mm from the nearest wall.
- `W_FURNITURE_OVER_WINDOW` does not see the uncatalogued `shelving`.
- Wall-thickness text is printed inside rooms on all 6 plans.
- `compile -f json` without `-o -` writes a file next to the input: this is how the stray `3-studio.json` was created.

### Reading

Arm 1 kept the frozen prompt ("compile|lint", "stop when it compiles") and loaded the current role text, which names `validate`. It moved nothing that matters against row 6:
- **validate uptake** is still 0 / 6, and calls are 20 / 25 / 0 / 0 / 0 against 27 / 32 / 1 / 0 / 0.
- **Defects** are 64 (4 / 29 / 31), or 61 without area basis, against 61 (2 / 26 / 33).
- **Authors stopping with warnings:** three plans finished not clean (house 24, townhouse 11, studio 3), against two in row 6 (21 and 14). The prompt's stopping rule still outranks the role.

By class the profile is nearly the same: class 4 is 10 against 10, relation 6 against 6, class 7 3 against 3, class 1 0 against 0. Class 5 rose (16 → 20) and so did circulation (class 3, 1 → 4). There are two more blockers: the house's sofa slot and its unenterable bedrooms, the townhouse stair approach, and the clinic exit swing. Lint-clean still does not mean sound: the three clean plans carry 1 B and 11 N, and every catch is on the three plans that stopped dirty. Auditor-instance spread applies, so compare by class and by B / N, not by the m count.

---

## Arm 2 · the whole-loop prompt

The sections below are the arm-2 auditor's report, verbatim except one opening paragraph about a
stray file (see Confounders).

Commit `134765d1`, `node dist/cli.real.js --version` = 1.43.1. The role as loaded reads "compile → validate → lint → repair", without `score`.

### The loop each author ran

CLI calls come from `calls-arm2.jsonl` (103 lines), attributed by the plan path in argv, as compile / lint / describe / validate / score. The log holds argv only, so the codes each author saw cannot be recovered (n/r). The reply's own account is quoted in the first-lint column.

| Plan | Form | CLI calls (c / l / d / v / s) | First lint after it compiled (codes the author saw) | Final lint (default) | Taste (final) | Defects B / N / m |
|---|---|---|---|---|---|---|
| 1 Apartment | rooms-first (`walls from rooms`, 4 `door between`, 1 `opening between`, 1 `facing`) | 4 / 5 / 1 / 14 / 0 | n/r; reply lists fixes of `W_FURNITURE_WALL_COLLISION`, `W_FURNITURE_OVER_WINDOW`, `W_OUTDOOR_OVERLAPS_ROOM`, `W_DRAWING_OVERFLOW` | 0 | 0.64 | 9 (0 / 4 / 5) |
| 2 House | rooms-first (`walls from rooms` + 1 `open between`, 10 `door between`, front door `at (x,y) wall exterior`) | 2 / 8 / 1 / 5 / 0 | n/r; reply: furniture on swings and doorways, fridge overlap, WC and basin spacing, stove and fridge under windows, missing stove, labels | 0 | 0.91 | 11 (0 / 4 / 7) |
| 3 Studio | rooms-first (2 `open between`, 1 `door between`, 1 `door on`) | 4 / 1 / 1 / 8 / 0 | Its only lint was the final one, so 0; warnings came through `validate` (reply: 6, then 1 error, then 4, then clean) | 0 | 0.85 | 9 (0 / 3 / 6) |
| 4 Café | rooms-first (1 `open between`, 6 `door between`) | 4 / 3 / 1 / 7 / 0 | n/r; reply names `W_FIXTURE_BACK_TO_ROOM`, `W_SEAT_FACING_AWAY`, `W_ROOM_MISSING_DEFINING`, `W_WET_ROOM_DOOR` | 0 | 0.84 | 9 (0 / 3 / 6) |
| 5 Townhouse | two `level`s, `walls from rooms` per level (1 `open between`, 5 `door between`, 1 `opening between`) | 6 / 6 / 1 / 6 / 0 | n/r; reply names `W_ANNOTATION_OVERLAP` (stair label) | 0 | 0.96 | 9 (0 / 3 / 6) |
| 6 Clinic | rooms-first (1 `open between`, 6 `door between`, 2 `door on`) | 6 / 2 / 1 / 6 / 0 | n/r; the first lint came in round 5 of 6; reply round 5: staff-room label over the sink (`W_ANNOTATION_OVERLAP`) | 0 | 0.75 | 9 (1 / 2 / 6) |
| **Total** | 6 / 6 rooms-first, 0 `wall`, 1 `facing`; swing words: `into` 35, `inward` 1, `outward` 2 | **26 / 25 / 6 / 46 / 0 (103)** | — | 6 / 6 clean | 0.64 – 0.96 | **56 (1 / 19 / 36)**; 53 without the 3 area-basis rows |

- Other verbs (fix, context, preview, explain, score): **0**.
- All 6 `describe` calls were real reads. Four used `--select totals` (or `totals,caption` / `totals,levels`); the house ran a full `describe --json` at t+69 s.
- First to last call took 1.64 min (row 6: 1.6).

### validate uptake and the next sequence

Times are seconds from the first logged call.

| Plan | validate calls | `--stage` use and order | Edits vs `next` (inferred from call sequence and reply) | Ended `next` null |
|---|---|---|---|---|
| Apartment | 14 | t4 rooms; t23 rooms→walls→openings→fixtures (<1 s); t35 the same four (<1 s); then plain ×5 (t43, 57, 62, 67, 71) | The four stages were fired as one batch, twice, not gated. The plain validate→lint pairs at 43/44, 57, 62, 67, 71/72 alternate with compiles, which fits fix-then-recheck. The reply's fixed codes are plausible but cannot be checked. | yes (final validate t71, lint t72; my re-run: null at all stages) |
| House | 5 | none; plain at t12, 83, 88, 91, 97 | Lint drove the loop (8 lints). Validate appears once early and four times in the last 15 s as a check. | yes |
| Studio | 8 | all four stages at t0–1, within 1 s of the first compile and before any fix (reply: "they all showed the same errors"), then plain ×4 (t13, 33, 37, 44) | The reply's sequence (6 warnings → 1 error → 4 → clean) matches 4 plain validates with compiles at 13 and 32 between. This is the one author whose repair loop ran on `validate`. | yes |
| Café | 7 | t10 rooms; t21–22 rooms→walls→openings→fixtures (1 s); plain at t82, 91 | The stages were batched once. The rest was compile and lint. | yes |
| Townhouse | 6 | t29 rooms; t32–33 walls→openings→fixtures (1 s); plain at t94, 98 | The reply confirms one rooms round, then the other three together. Repair then went through lint (6). | yes |
| Clinic | 6 | none; plain once per round (t10, 15, 32, 39, 46, 51) | Each round is compile→validate. The reply's six rounds name the codes repaired in order, so they fit acting on each validate's output. | yes |

- Uptake: **6 / 6 ran `validate`** (row 6: 0 / 6). 4 / 6 used `--stage`, always in rooms→walls→openings→fixtures order. Studio, café and apartment fired all four stages within ~1 s and the townhouse fired three, so no author gated on one stage's `next` before the next stage.

### Authors stopping with warnings standing

- **None.** All six final default lints are 0, and `validate`'s `next` is null in plain mode and at every stage (my runs).
- Choices stated in place of warnings, both true:
  - Café: "left the Counter without a `uses` tag instead of adding a stove". Lint coverage is `partial`, `no-uses` on `counter`.
  - Clinic: the staff room was switched from `uses kitchen` to `uses office` because the kitchen typing expected a stove. It holds a counter and sink, no stove.
  Both silence `W_ROOM_MISSING_DEFINING` by typing.
- Typing with no stated reason: the apartment and studio kitchens are typed `uses living`. The studio kitchenette has no hob and no fridge (YS1).

### Do the replies match the plans?

- **Lint claims: all true.** All six say clean or none, and all six are 0 now. "next null" is true for all six.
- **One false statement.** The house says "I never ran `describe`". The log shows `describe 2-house.arch --json` at t+69 s, a full payload.
- **Round counts are loose:**
  - Apartment says "about 9"; the log has 24 calls (4 c / 5 l / 1 d / 14 v) in about 10 time clusters.
  - House says "about 11", with one compile error and one parse failure; the log has 16 calls (2 compiles).
  - Studio says 7 rounds with 2 compiles; the log has 4 compiles.
  - Café says 2 compiles, 3 full validates and 2 lints; the log has 4, 2 and 3, plus 1 `describe` it doesn't mention.
  - Townhouse says 5 compiles; the log has 6.
  - Clinic says "6 rounds, each a compile, validate and lint"; it linted in only 2 of them (t47, t52).
- **Figures:**
  - Correct: the house's 126 m², 10 rooms, 12 doors and 9 windows; the café's 92 m² and 85.15 net; the clinic's 120 and 109.24; the studio's 30 m², 2 doors and 4 windows.
  - The apartment's 75.7 / 72.9 match GIA 75.69 and net 72.93. It calls 75.7 "gross", but the floor area is 81.
  - The apartment's "roughly 67 m² net" for the flat alone is high: net 72.93 minus the corridor's 8700 × 1200 inner (10.44) ≈ 62.5.
- **Omissions:**
  - The apartment's "front door from the corridor" is true in source, but `describe` `access.entrances` is `["balcdoor"]` only (YA1).
  - The café's "entrance near the top-left corner" is accurate: the jamb is 600 mm from the corner's inner face.

### Verified defects

Geometry is from `compile -f json -o -` (resolved bboxes), `describe --json` and SVG `<text>` positions. Probes ran on `134765d1` with `dist/cli.real.js`. The convention is `rotate 0` = back to the north, and `from start` measures to the opening's centre (spec.llm.md:76). The exterior wall is 300 wherever 250 was written (grid snap).

**1 · Apartment** (9000 × 9000 centreline including a 9000 × 1400 corridor; plan 81 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YA1 | The common corridor is a room inside the exterior walls with no door out, so the front door is internal. `describe` names the balcony slider as the only entrance, and the corridor's 12.6 m² is counted in the totals. | `corridor` (0,1000)–(9000,2400), 1-apartment.arch:8; `access.entrances: ["balcdoor"]` | N | new (context) | MISSED |
| YA2 | The kitchen has a 600 counter set 300 from the sink; the hob butts the sink and stands 150 from the south wall, with no set-down either side. The room is typed `uses living`. | counter y 7400–8000, sink 8300–9100, stove 9100–9700, wall face 9850; :12, :43–45 | N | 4 / 5 | MISSED (typing) |
| YA3 | The dining table has no chairs. | `table` x 1400–3200, y 7250–8150; :49 | N | 4 | MISSED (no rule) |
| YA4 | Bedroom 1's wardrobe front is 100 mm from the bed side. | bed x 6350–8150; wardrobe x 8250–8850 (front west); :40–41 | N | 5 | MISSED (no rule) |
| YA5 | Both bed heads stand across windows. | bed2 head x 8850, y 3000–4800 vs `window_2` y 3100–4700; bed1 x 6350–8150 vs `window_5` x 6600–8000; :36, :40, :24, :28 | m | 5 | MISSED |
| YA6 | The aisle between the counter front and the table is 650 mm. | counter front x 750, table x 1400; :43, :49 | m | 5 | MISSED |
| YA7 | Bedroom 1 is entered only through the living/kitchen. | `door between living and bed1`; :21 | m | 3 | MISSED |
| YA8 | Wall-thickness text inside rooms. | "100" at (5729,7650) in bed1; "300" at (4500,1329) in the corridor | m | 8 | MISSED |
| YA9 | "~70 m²" is missed on both figures for the flat. | flat without the corridor: 68.4 centreline; GIA ≈ 8700 × 7400 = 64.4 | m | new (area basis) | n/a |

**2 · House** (14000 × 9000 centreline, 126 m² including a 12.92 m² garage)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YH1 | The L-sofa faces the south wall 150 mm away, with its back to the TV. | `sofa_l` x 5700–8100, y 7100–8700, rotate 0, wall face 8850; `tv_unit` y 5250–5750; 2-house.arch:57–58 | N | new (relation) | MISSED |
| YH2 | The garage cannot take a car: 3600 clear in the direction of its 2400 door. | internal y 5250–8850; `door garage on garage.bottom`; :12, :30 | N | new (advisory size) | n/a |
| YH3 | Wardrobe fronts sit 250, 100 and 250 mm from the bed sides in the master, bed 2 and bed 3. | bed1 x 1000 vs wardrobe front 750; bed2 bed 10450 vs 10550; bed3 bed 12100 vs 11850; :43–54 | N | 5 | MISSED (no rule) |
| YH4 | The dining table has no chairs. | `meeting_table` x 11000–12800, y 6650–7550; :63 | N | 4 | MISSED (no rule) |
| YH5 | All three bed heads stand across the bedroom windows. | beds against `.top`; windows x 1150–2650, 9000–10400, 11900–13300; :33, :36–37, :43, :51, :53 | m | 5 | MISSED |
| YH6 | The kitchen run is three pieces with 300 and 250 gaps; the hob is 250 from the corner; the aisle to the table is 700. | sink 10050–10950, counter 11250–12750, stove 13000–13600, wall 13850; table to y 7550 vs fronts 8250; :59–63 | m | 5 | MISSED |
| YH7 | The garage→hall door swings into the 1300 mm hall; the leaf crosses the corridor 100 mm from the front door's leaf. | `door_7` x 1250–2150 on y 5200, swing into hall; front door leaf to x 1150; :20, :26 | m | new (leaf across a corridor) | MISSED |
| YH8 | The hall is 19.6 m², more than the master bedroom (14.4). | `hall` 14000 × 1400; :11 | m | new (space efficiency) | n/a |
| YH9 | Four pinned labels and their area figures sit inside door swings (master, bathroom, bed 2, bed 3). | e.g. "Bathroom" at (6900,2914), area ≈ (6900,3190), 680–789 mm from `door_4`'s hinge (800 leaf); :6, :8–10 | m | 8 | MISSED |
| YH10 | Wall-thickness text inside rooms. | "100" at (6300,4741) in the hall; "300" at (3275,559) in bed1 | m | 8 | MISSED |
| YH11 | "~110 m²" is met only on centrelines. | habitable 113.1 centreline; GIA 119.19 − garage ≈ 11.5 = 107.7 | m | new (area basis) | n/a |

**3 · Studio** (6000 × 5000 centreline, 30 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YS1 | The kitchenette has no hob and no fridge, only an 1800 counter and a sink, in a room typed `uses living`. | counter x 300–2100, sink 2200–3200, y 4300–4900; 3-studio.arch:10, :23–24 | N | 4 | MISSED (typing) |
| YS2 | The L-sofa faces the south exterior wall at 0 mm and covers 1200 of the window. | `sofa_l` x 4100–5900, y 4100–4900, rotate 0; wall face 4900; `window_4` x 3700–5300; :25, :17 | N | new (relation) | MISSED |
| YS3 | The alcove's 1400 bed is flush on the east wall across the alcove's only window, reachable from one side; entry past its foot squeezes to 700. | bed x 4500–5900, y 100–2000; `window_2` y 600–1800 on x 6000; opening x 4200–5400; :18, :15, :11 | N | 5 | MISSED (a11y profile: `W_DOORWAY_BLOCKED` 350, `W_PATH_TOO_NARROW` 700) |
| YS4 | The front door's leaf parks 400 mm in front of the bath door and leaves 700 of 800 clear. | `door_1` x 2250–3150 on y 0; `door_2` y 800–1600 on x 1800; :12–13 | m | new (door–door) | MISSED (a11y profile: `W_LEAF_ACROSS_DOORWAY`) |
| YS5 | The basin stands 100 mm in front of the WC pan. | WC front x 800, y 400–800; basin x 900–1500, y 100–600; :20–21 | m | 5 | MISSED |
| YS6 | Nowhere to sit and eat. | furniture list :18–26 | m | 4 | MISSED |
| YS7 | Bath, entry and alcove print no name (area only). | no `label`; :7–9 | m | 8 | MISSED |
| YS8 | Wall-thickness text inside rooms. | "100" at (2029,1975) in the entry; "200" at (500,279) in the bath | m | 8 | MISSED |
| YS9 | "30 m²" is met only on centrelines. | GIA 27.84 (`describe`) | m | new (area basis) | n/a |

**4 · Café** (11500 × 8000 envelope, 92 m²; 24 seats at six 4-tops)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YC1 | The 3000 counter is flush on the north façade, so there is no staff side. | `counter_4` x 8000–11000, y 100–800, anchor top flush; 4-cafe.arch:30 | N | new (counter zoning) | MISSED (no rule) |
| YC2 | Chairs between table rows stand back to back with 0 mm between them. | row-0 south chairs y 2300–2700, row-1 north chairs y 2700–3100; :35–43 | N | 5 | MISSED (no rule) |
| YC3 | Accessible WC: the pan centreline is 1500 / 850 mm from the side walls, so no grab-rail wall; a 1500 turning circle doesn't fit (1150 clear depth); the door swings in. | `wc_1` centreline x 1500, faces 100 / 2350; room 2250 × 1850 inner; `door_3 … swing into wc_acc`; :11, :17, :27 | N | 5 (accessible) | MISSED (a11y profile: `W_ROOM_TOO_SMALL` 4.8 m² only) |
| YC4 | The hob stands alone on the south wall, 800 bare to the sink and 300 to the wall; the only worktop is 4.1 m away on the north wall. | stove x 10500–11100, y 7300–7900; counter y 2550–3150; :32–34 | m | 4 / 5 | MISSED |
| YC5 | The entrance door's leaf clears a chair by 10 mm. | `door_1` y 700–1700 on x 0; chair x 700–1100, y 1600–2000; :15, :42 | m | 5 | MISSED (a11y profile: `W_SWING_OBSTRUCTED`) |
| YC6 | Customers reach the accessible WC through a lobby that also serves the staff WC and the store (and through it the kitchen). | `hall` doors :16–20 | m | new (zoning) | n/a |
| YC7 | The "corner" entrance is on the west façade, its jamb 600 from the corner's inner face. | `door_1` y 700–1700; :15 | m | new (brief) | n/a |
| YC8 | The staff WC has no wash-hand basin. | `wc_staff` holds `wc_3` only; :29 | m | 4 | MISSED |
| YC9 | Wall-thickness text inside the seating area. | "100" at (2750,4571); "200" at (1100,279) | m | 8 | MISSED |

**5 · Townhouse** (two `level`s, 5500 × 10000 each; stair `st` (4300,4300) 1000 × 2650 on both)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YT1 | The kitchen run is a fridge, a 600 counter and a hob with 400 gaps on the west wall; the sink is on another wall. | fridge y 200–800, counter 1200–1800, stove 2200–2800 at x 100–700; sink x 2600–3400 on y 100; 5-townhouse.arch:26–29 | N | 4 / 5 | MISSED |
| YT2 | The dining table has no chairs. | `dining_table` x 1850–3650, y 1300–2200; :30 | N | 4 | MISSED (no rule) |
| YT3 | Wardrobe fronts are 150 mm from the bed sides in both bedrooms. | wardrobes front x 700, beds x 850 (y overlap 1900–2100 and 7900–8400); :53–56 | N | 5 | MISSED (no rule) |
| YT4 | On level 1 the landing beside the stair void is 750 mm wide, and the bath and bed 2 doors open onto the side of the flight. | partition face 3550 vs flight x 4300; doors y 4900–5700 and 6750–7650; :44–45, :52 | m | 7 | MISSED (a11y profile: `W_STAIR_SIDE_ENTRY` ×2) |
| YT5 | The sofa crowds both living-room entries: 350 from the kitchen opening, and 64 mm inside the hall door's swing. | `sofa_l` x 100–1700, y 3900–6500; `opening_1` x 1200–2400; `door_3` x 1650–2550; :18–19, :31 | m | 5 | MISSED (a11y profile: `W_DOORWAY_BLOCKED`, `W_SWING_OBSTRUCTED`) |
| YT6 | Both bed heads stand across windows. | beds x 850–2650 vs `window_2` / `window_4` x 1200–2400; :47, :49, :53, :55 | m | 5 | MISSED |
| YT7 | The landing runs the full 10 m (20 m², the largest first-floor room); a 3 m dead end lies south of the flight. | `landing` 2000 × 10000; :41 | m | new (space efficiency) | n/a |
| YT8 | Five rooms print no name (living, WC, hall; bath, landing). | no `label`; :11, :13–14, :39, :41 | m | 8 | MISSED |
| YT9 | Wall-thickness text inside rooms on both levels. | L0 "100" (650,3271) in the kitchen, "200" (5221,8475) in the hall; L1 "100" (3729,2025), "200" (5221,2200) in the landing | m | 8 | MISSED |

**6 · Clinic** (12000 × 10000 centreline, 120 m²)

| # | Defect | Geometry | Sev | Class | Lint |
|---|---|---|---|---|---|
| YK1 | The main exit is blocked: the waiting sofa and the reception desk stand in front of it, leaving a 200 mm gap between them and a 300 mm strip to the door. | door x 2200–3400 on y 10000 (face 9850); `sofa_l` x 450–2850 and desk x 3050–5250, both to y 9550; 6-clinic.arch:19, :35–36 | **B** | 3 / new (egress) | MISSED (a11y profile: `W_DOORWAY_BLOCKED` 300) |
| YK2 | No consulting room has a desk or chair; the staff table has no chairs; one L-sofa seats the waiting room for three consulting rooms. | furniture list :35–56 | N | 4 | MISSED (no rule) |
| YK3 | Accessible WC: the pan centreline is 1150 mm from both side walls, so no grab-rail wall; the basin is 1.2 m away on the east wall; the door swings in. | `wc_12` x 6600–7000 (centreline 6800), faces 5650 / 7950; basin x 7450–7950; :24, :48–49 | N | 5 (accessible) | MISSED |
| YK4 | The examination couches are `bed`s and draw as beds. | `bed_3`, `bed_6`, `bed_9` 800 × 1900; :38, :41, :44 | m | 4 | MISSED |
| YK5 | The staff-room door's swing is 49 mm short of the sink. | `door_7` x 8750–9650; sink x 9750–10350, y 6350–6950; :25, :52 | m | 5 | MISSED (a11y profile: `W_SWING_OBSTRUCTED`) |
| YK6 | The waiting room is open over 2.4 m to the corridor serving the consulting rooms, staff room and store. | `open between wait and hall width 2400`; :17 | m | new (zoning) | n/a |
| YK7 | The accessible WC is 8.9 m², about twice its need. | 2400 × 3700; :13 | m | new (space efficiency) | n/a |
| YK8 | The pinned "Accessible WC" label is missing from the SVG; the room prints only "8.9 m²". | `label "Accessible WC" at (6800,7000)`, :13; no "Accessible" anywhere in the SVG | m | 8 | MISSED (no diagnostic) |
| YK9 | Wall-thickness text inside rooms. | "100" (900,5892) in the corridor; "300" (3100,508) in Consulting 1 | m | 8 | MISSED |

### Totals

- **Defects:** 56 (1 / 19 / 36). Without the 3 area-basis rows: 53 (1 / 19 / 33).
- **Reported by the final default lint:** 0 / 56. The a11y profile names part of 8 of them: YS3, YS4, YC3, YC5, YT4, YT5, YK1, YK5.
- **Blockers:** 1 (YK1), not reported by default lint.
- **Lint-clean plans:** 6 / 6, all with `next` null.
- **Class counts (dual-class rows counted in both):** 4 = 11, 5 = 19, 7 = 1, 8 = 10, relation = 2.
- **Sofas facing their TV:** 2 / 3. Apartment (via `facing`) and townhouse yes; house no. The studio and clinic have no TV.
- **Hinged exterior doors opening the intended way:** 6 / 6 (house 1, studio 1, café 1 inward under 60 occupants, townhouse 1, clinic 2 outward). The apartment's "front door" is modelled as internal (YA1).
- **Taste:** 0.64 – 0.96.
- **Rooms-first plans:** 6 / 6; `wall` statements: 0.
- **Class 1:** 0.

Then-and-now, first class only:

| Class | row 6 | arm 2 |
|---|---|---|
| 1 Openings ignore walls | 0 | 0 |
| 3 Circulation and privacy | 1 | 2 (YA7, YK1 B) |
| 4 Defining contents | 10 | 11 |
| 5 Clearances | 16 | 16 (2 accessible WCs) |
| 7 Stair | 3 | 1 (m) |
| 8 Annotation | 10 | 10 (6 thickness-text rows, 3 unlabelled-room rows incl. 1 dropped label, 1 labels in swings) |
| new: furniture relation | 6 | 2 |
| new: transposed | 0 | 0 |
| new: door–door and leaf | 1 | 2 |
| new: other | 14 | 12 (3 area) |
| **Total (B / N / m)** | **61 (2 / 26 / 33)** | **56 (1 / 19 / 36)** |

### Authoring friction
- `E_FURN_SIZE` on `in <room> anchor …` without a `size`, including `wc`, `basin`, `stove` and `sofa_l`. Raised by every reply but the café's own.
- `E_OPENING_DATUM` on a bare `at <mm>` (apartment, studio, townhouse).
- Clause order: `label` before `uses` (apartment, studio). The door kind word leads (`door sliding on`).
- `strip` rooms refuse `label … at`, so the house dropped strips. `door on hall.left` gave `E_OPENING_NO_SHARED_WALL`, so the house used `door at (x,y) wall exterior`.
- The rotation mapping for `anchor` and for chairs at a table was found by trial (café, clinic). `facing` needed the TV lined up by hand (apartment).
- `W_ANNOTATION_OVERLAP` was cleared by guessing label coordinates. Three authors pinned labels; the house pinned four into door swings (YH9), and the clinic's pinned label vanished (YK8).
- Rooms were typed to silence `W_ROOM_MISSING_DEFINING`: the café counter left untyped, the clinic staff room as office.
- The clinic author compiled with `-o D:/Temp/c.svg` six times, writing outside the worktree.

### Tool facts (not counted)
- A pinned room label that does not fit is dropped from the SVG with no diagnostic (clinic "Accessible WC").
- `walls from rooms exterior 250` resolves to 300 under `grid 100` with no diagnostic (apartment, house, clinic).
- The apartment's `describe` names the balcony slider as the only entrance. The clinic has 2 entrances and no main entrance, so circulation is `partial`. The café's counter has `no-uses`, so rooms and reachability are `partial`.
- Default lint is silent on things the a11y profile names with real geometry: a blocked main exit (YK1), a 700 squeeze into the alcove, door-leaf conflicts.
- No rule judges wardrobe fronts against bed sides, back-to-back chairs, tables without chairs, sofas against walls, or a WC's grab-rail wall. These are the families that survived.
- `compile -f json` without `-o` writes `<stem>.json` beside the plan even with no `--json` flag. That is how this audit's stray file appeared.

### Reading
Under the whole-loop prompt, the loop is taken up: 6 / 6 authors ran `validate` (46 calls against 0), 4 / 6 used `--stage`, every author ran to lint-clean with `next` null, and none stopped with warnings standing (row 6: 2 authors with 21 and 14). The call mix moved from 27 / 32 / 1 / 0 / 0 to 26 / 25 / 6 / 46 / 0, but `score` stayed at 0, and `--stage` was fired as a batch of four, never gated stage by stage. The surviving defects are the same no-rule families as row 6 and arms A–C:
- kitchens hidden by typing or broken into pieces;
- tables with no chairs;
- wardrobe fronts at bed sides;
- bed heads across windows;
- accessible WCs with no grab-rail wall;
- counter zoning;
- sofas against walls;
- thickness text.

The total is 56 (1 / 19 / 36) against 61 (2 / 26 / 33). N falls from 26 to 19, mostly because row 6's stopped plans carried blocked doors and stairs, which a full loop repairs. Final lint now reports 0 of 56, against 12 of 61 when two authors stopped early. The one blocker, a waiting-room exit walled off by a sofa and the reception desk, is named only by the accessibility profile. The loop therefore removes what lint can see and leaves what it cannot. Auditor-instance spread applies: compare by class and B/N, not by the m count.

---

## Both arms against row 6

### Then and now by class

First class only, as the earlier audits count (a row with two classes under the first).

| Class | 10-18 | 10-24 | 10-25 | 10-26 arm A | 10-26 arm B | 10-26 arm C | row 6 | 10-27 arm 1 | 10-27 arm 2 |
|---|---|---|---|---|---|---|---|---|---|
| 1 Openings ignore walls | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 Circulation and privacy | 2 | 3 | 0 | 1 | 0 | 4 | 1 | 4 (XH1, XH2 B) | 2 (YK1 B) |
| 4 Defining contents | 5 | 8 | 7 | 6 | 10 | 8 | 10 | 10 | 11 |
| 5 Clearances | 11 | 14 | 13 | 15 | 11 | 14 | 16 | 20 | 16 |
| 7 Stair | 1 | 2 | 2 | 3 | 3 | 2 | 3 | 3 (XT1 B) | 1 (m) |
| 8 Annotation | 8 | 6 | 9 | 8 | 9 | 10 | 10 | 9 | 10 |
| new: furniture relation | 9 | 3 | 3 | 5 | 5 | 4 | 6 | 6 | 2 |
| new: transposed footprint | 3 | 1 | 3 | 0 | 1 | 1 | 0 | 0 | 0 |
| new: door–door and leaf across a corridor | 2 | 2 | 1 | 2 | 0 | 1 | 1 | 1 | 2 |
| new: other | 12 | 9 | 11 | 12 | 15 | 10 | 14 | 11 (XK1 B) | 12 |
| **Total (B / N / m)** | **57 (4 / 26 / 27)** | **48 (2 / 24 / 22)** | **49 (0 / 23 / 26)** | **52 (1 / 25 / 26)** | **54 (1 / 20 / 33)** | **54 (1 / 22 / 31)** | **61 (2 / 26 / 33)** | **64 (4 / 29 / 31)** | **56 (1 / 19 / 36)** |

What the table says:
- **Arm 1 repeats row 6.** Same commit family, same prompt, same role: 64 against 61, blockers 4
  against 2, authors stopping early 3 against 2. All four arm-1 blockers sit on plans whose authors
  stopped (house, townhouse) or on a clean plan whose blocker no default rule names (the clinic's
  inward-swinging second exit, XK1).
- **Arm 2 moves the families lint sees.** Stair 3 → 1 and relation 6 → 2: the townhouse stair was
  repaired to clean, and two sofas face their TV. Clearances fall from arm 1's 20 to 16, circulation
  from 4 to 2. Class 4 (11) and annotation (10) do not move: no rule, or a rule silenced by typing.
- **The stop rate follows the prompt, not the role.** Under the frozen prompt, the authors stopping
  with warnings standing are now 0 / 0 / 2 / 2 / 3 (arms A, B, C, row 6, arm 1); under the whole-loop
  prompt 0.

### The PS7.8 reading (for README D26)

- **Uptake:** naming the loop in the prompt is what puts `validate` in an author's hands: 0 / 6 under
  the frozen prompt (row 6 and arm 1, the same role), 6 / 6 under the whole-loop prompt. `--stage`
  was used as a batch, so the stage-ordered loop itself (PS7.1) is still unmeasured as a gate.
- **Defects:** 56 (1 / 19 / 36) against 64 (4 / 29 / 31) on the same commit; the gain is in B and N,
  and every surviving defect in arm 2 is on a family the default lint does not report.
- **D26's reverse-if:** not met by this run (arm 2 shows fewer defects). Read again at the next
  re-measure, which keeps both arms.

## Candidate cards

Leads from the two audits, not filed here (the orchestrator files cards):
- `W_DOORWAY_BLOCKED` on an exterior exit under the default ruleset: arm 2's one blocker (YK1, a main
  exit with a 200 mm gap between the sofa and the desk) is named only by the a11y profile.
- An inward-swinging second exit on a non-dwelling (XK1) has no default rule.
- `validate`'s `next` still ranks a 50 mm furniture overlap ahead of a cut-off house (XH1) and a
  missing hob ahead of every stair code (townhouse, arm 1); only `--stage rooms|walls` puts the stair
  first.
- Circulation reads a stair flight as floor: it reported 700–840 mm where the gaps beside the flight
  are 450 / 400 (XT1).
- A pinned room label that does not fit is dropped from the SVG with no diagnostic (YK8).
- `exterior 250` resolves to 300 under `grid 100` with no diagnostic (both arms).
- `compile -f json` without `-o` writes `<stem>.json` beside the plan (both auditors tripped on it).
- The rotation of `anchor` pieces and chairs (`rotate 90/270`) is learned by trial in both arms.

## Corpus, concordance, tiling probe (same commit, with both new folders in the tree)

```text
defect-corpus catch rate
  openings-ignore-walls: 16/16
  space-not-enclosed: 6/6
  circulation-privacy: 11/12
  missing-defining-contents: 6/6
  clearances: 16/21
  daylight: 4/4
  stair-safety: 8/8
  annotation-collisions: 6/7
  overall: 73/80
taste concordance (A ∪ B ∪ C): 59 pairs — 54 ordered, 0 tied, 0 reversed (0 in the ledger), 5 unjudged
```

`defect-corpus`, `taste-separation`, `rooms-tiling-probe`, `lint-dwelling-reading`, `main-entrance`,
`room-too-small-by-use`, `swing-building` and `lint-messages-id-free`: 8 files, 757 tests passed.
Part 1 (re-linting the earlier plans) was not run: this run measures the prompt, and the lint moved by
four PRs since row 6, each of which recorded its own first-contact row moves (#296, #297, #301).

## Files

- `first-contact-plans/2026-10-27-rerun-arm1/` and `…-arm2/<n>-<brief>.arch`: the twelve final
  plans as the cold authors left them, byte-identical (all LF, 0 CR bytes). Provenance: SHA-256 as
  committed, the file's mtime in the run's worktree (local time), and the author's last logged CLI
  call on it (shim log). Every mtime precedes that plan's last logged call (by 0.1 to 3.7 s), so the
  audited bytes are the ones the author last compiled, validated or linted.

  | Arm | Plan | SHA-256 (as committed, LF) | mtime | Last logged call (calls on it) |
  |---|---|---|---|---|
  | 1 | 1-apartment | `e91e1cf5ad97cefcc9a2d5e87f2bfac01d308189705bd4d125c0f5cb680e010d` | 18:48:05.416 | 18:48:05.545 (10) |
  | 1 | 2-house | `1c5d823068ba9d51f8714a6bd030573ac4c4775335e5cf769f6061c220164de1` | 18:47:40.669 | 18:47:44.331 (4) |
  | 1 | 3-studio | `42f72608de3e47da6250f72376ae8aaf7c7830b3cb9f16174c2019f832a5bb8d` | 18:47:32.040 | 18:47:32.419 (9) |
  | 1 | 4-cafe | `3ff5cf75940d5c59376de5ea7cff686409ddb14be1e5cc0c067936b9e7bdf6e0` | 18:48:15.597 | 18:48:16.074 (10) |
  | 1 | 5-townhouse | `55bd8dbfd16c08fc1184b5a5726201a0ec81f9b435e16a26fb2a6370f2ef3d6d` | 18:47:18.664 | 18:47:19.166 (7) |
  | 1 | 6-clinic | `833fc2308af0b0d9d98afd3c30975701a51bdb8f9da1ce3256ab3760ad56207a` | 18:47:02.217 | 18:47:02.865 (5) |
  | 2 | 1-apartment | `49782949c24e0428637412b6799542251a94652d58377c22e0ab4e307f06f94b` | 18:51:32.564 | 18:51:33.254 (24) |
  | 2 | 2-house | `78bb461cfeb490ea3b0c52b1203954a3abbf4f8c3839b19776ab9642be898c40` | 18:51:58.214 | 18:51:58.809 (16) |
  | 2 | 3-studio | `4b29f0bc621cddc031026134cc79d2f7572aebd003b5da01abf328c5da389c2c` | 18:51:05.385 | 18:51:08.427 (14) |
  | 2 | 4-cafe | `2f45d92d6556ff70002588705cbd85be7a350e16b99540d08c55f4ef71060056` | 18:51:52.519 | 18:51:55.976 (15) |
  | 2 | 5-townhouse | `9005fd70b1c2a5b140815b2d7d030bf6aa1901209e3d37d23b968328a1679eda` | 18:51:59.441 | 18:51:59.972 (19) |
  | 2 | 6-clinic | `f44d3a10943842755e30cd99fe59c708f2b72964561f0476b5334ba658369704` | 18:51:12.482 | 18:51:13.579 (15) |

- Kept outside the repository, in the run's scratch folder: the reconstructed dispatcher prompts
  (`lead-arm1.txt`, `lead-arm2.txt`, made by `make-lead.mjs`) and the twelve per-brief prompts, both
  dispatchers' JSON output, the replies with the loaded role line (`replies-arm1.md`,
  `replies-arm2.md`), the shim and both call logs (`calls-arm1.jsonl`, 45 lines; `calls-arm2.jsonl`,
  103 lines), the auditor prompts (`make-audit.mjs`) and both auditors' JSON and reports, the plan
  mtimes and the provenance script.

## Confounders

These are the protocol's (step 10) plus what this run adds:
- **The prompt is the treatment, and it changes two lines.** Arm 2's prompt replaces the "Write the
  plan; …" sentence and also asks the reply for "the warnings you chose to leave and why"; the reply
  line is part of the treatment, as the draft states.
- **Auditor instances.** One opus auditor per arm, run in parallel with the same brief; row 6 had a
  third. Compare by class and B / N, not the minor count.
- **Authoring chance.** One draw per brief. Arm 1's 64 against row 6's 61 under the same prompt shows
  the draw-and-auditor spread on this material (blockers 4 against 2).
- **The dispatcher prompt is a reconstruction.** Row 6's `lead-r6.txt` was lost; this run's lead
  prompts were rebuilt from row 6's settings table and the PS7.8 recipe. Both arms used the same text.
  The run folders were created before dispatch, so no author had to make one.
- **The commit moved since row 6.** Four lint PRs (#296, #297, #298, #301) and a one-line spec
  example change; the role is unchanged. Arm 1 is the like-for-like control for arm 2; row 6 is
  context.
- **The auditors could not render.** Plan mode forbids file writes, so no render crop was checked
  before filing a B; every B was re-measured from `compile -f json` coordinates instead (the rubric
  asks for both). The lead re-checked YK1's source lines and its a11y warning.
- **Two stray files, never committed.** Each auditor ran one `compile <plan> -f json` without `-o -`,
  which wrote `3-studio.json` (arm 1) and `1-apartment.json` (arm 2) into the plan folders. Both were
  deleted before the provenance hashes; the `.arch` files were not touched (their mtimes precede the
  authors' last logged calls). The arm-2 clinic author compiled with `-o D:/Temp/c.svg`, outside the
  worktree.
- **Speed.** Shim spans 1.37 and 1.64 min against row 6's 1.6: not a separating factor.
- **The shim.** Authors ran through a logging shim at `dist/cli.js`; the auditors used the real build.
