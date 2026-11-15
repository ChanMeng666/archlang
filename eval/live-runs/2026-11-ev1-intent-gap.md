# EV.1, 2026-11-16: the gpt-5.5 intent gap against July, per brief (offline)

A dated, aggregate-only record of an offline comparison. No model was called and no paid eval was
run: the per-brief tables were read from the artifacts of three existing GitHub Actions
"Eval (live)" runs and set against the one July per-brief table in the repo. Raw model replies are
not published; the failing checks below are named by kind (lint code or compile-error kind), not
quoted.

**`eval/live-baseline.json` is NOT changed by this record.** Re-baselining needs an owner decision
(RM-D51 keeps the July record).

## Sources

| Side | Run | Date (UTC) | Commit | Valid | Intent | Sound | L1 intent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| July | 29150982395 (`eval/g1/baseline-run-29150982395.md`) | 2026-07-11 | pre-v1.15.0 prompt | 25 | 13 | 4 | 18 |
| New 1 | 43727485853 | 2026-11-15 | `2a210589` | 22 | 10 | 0 | 15 |
| New 2 | 43727489713 | 2026-11-15 | `2a210589` | 22 | 9 | 1 | 16 |
| New 3 | 43727493307 | 2026-11-15 | `2a210589` | 18 | 7 | 0 | 12 |

All four: `gpt-5.5-2026-04-23`, seed `20260711`, judge v2, synonyms v1, 26 briefs, `--l1`.

**The July side is the 2026-07-11 run, not the 2026-07-12 run behind `eval/live-baseline.json`**
(valid 23, intent 14, sound 3). The 2026-07-12 run's per-brief artifacts are gone, so no per-brief
comparison with the baseline run itself is possible. The two July runs differ by one prompt line
(the v1.15.0 metric-unit suffix) and by -2 valid / +1 intent / -1 sound (`eval/README.md`).

"Intent" here is the scorecard's L0 intent match: a brief counts when its result is `pass` or
`warns`. A brief fails intent when it does not compile, when any gating Expect predicate (room
count, label, area) fails, or when lint raises a physical code (`W_FURNITURE_WALL_COLLISION`,
`W_DOORWAY_BLOCKED`, `W_ROOM_NO_CLEAR_PATH`; `PHYSICAL_CODES` in `eval/run.ts`).

## Per brief

Y = intent met, N = not met. For each N, the failing intent check as recorded in that run's notes:
**DB** `W_DOORWAY_BLOCKED`, **FWC** `W_FURNITURE_WALL_COLLISION`, **C-jamb** compile error "opening
refused, not moved" (jamb too close to a meeting wall, or span past the wall's end), **C-par**
compile error "edge runs parallel to the shared edge, offset cannot be measured", **C-ext** compile
error "window needs an exterior wall" on a partition edge, **C-amb** compile error "door cannot
tell which wall to stand in", **C-stmt** compile error `Unknown statement`, **rooms** room-count
predicate, **label** label/concept predicate.

| Brief | July 07-11 | New 1 | New 2 | New 3 | New Y of 3 |
| --- | --- | --- | --- | --- | --- |
| `studio-1br` | Y | N (DB, FWC) | N (DB) | N (DB) | 0 |
| `two-bed-hall` | N (DB) | N (DB) | Y | N (C-amb) | 1 |
| `relational-studio` | N (FWC) | Y | N (DB, FWC) | N (C-jamb) | 1 |
| `dims-auto-cottage` | Y | N (DB) | N (DB) | N (DB) | 0 |
| `against-wall-bath` | N (C-stmt) | N (C-jamb) | N (C-jamb) | N (C-jamb) | 0 |
| `small-office` | N (label) | Y | Y | Y | 3 |
| `core-and-shell` | Y | Y | Y | N (C-jamb) | 2 |
| `two-bath-flat` | Y | N (C-ext) | Y | N (DB, FWC) | 1 |
| `open-plan-loft` | N (DB) | Y | N (DB) | Y | 2 |
| `scripting-units` | Y | Y | Y | Y | 3 |
| `three-bed-2bath` | Y | N (DB, FWC) | N (DB, FWC) | N (C-jamb) | 0 |
| `galley-kitchen` | N (rooms, label) | N (DB, FWC) | N (C-jamb) | Y | 1 |
| `l-shaped-flat` | N (FWC, rooms) | N (C-par) | N (C-jamb, C-par) | N (C-par) | 0 |
| `accessible-flat` | N (rooms) | N (rooms) | N (DB, rooms) | N (DB, rooms) | 0 |
| `accessible-bath` | Y | N (C-jamb) | N (DB) | Y | 1 |
| `compact-studio` | N (DB) | N (DB) | N (DB) | N (DB) | 0 |
| `bungalow` | Y | N (DB) | N (C-par) | Y | 1 |
| `reception-suite` | N (FWC) | Y | N (DB) | Y | 2 |
| `strip-corridor` | N (label) | N (label) | Y | N (label) | 1 |
| `attach-openings` | Y | Y | N (DB, FWC) | N (DB) | 1 |
| `anchor-furniture` | N (DB) | Y | N (DB) | N (DB) | 1 |
| `strip-attach-clean` | Y | Y | Y | N (DB) | 2 |
| `sized-kitchen-flat` | Y | N (DB) | N (DB) | N (C-stmt) | 0 |
| `sized-bedrooms` | N (FWC) | N (DB) | Y | N (DB, FWC) | 1 |
| `sized-wet-room` | Y | Y | Y | N (DB) | 2 |
| `sized-office-mix` | Y | N (DB) | N (DB) | N (C-jamb) | 0 |
| **Total Y** | **13** | **10** | **9** | **7** | |

## Briefs that lost intent

Of the 13 briefs that met intent in July, 12 missed it in at least one new run; only
`scripting-units` met it in all three. Five missed it in all three runs: `studio-1br`,
`dims-auto-cottage`, `three-bed-2bath`, `sized-kitchen-flat`, `sized-office-mix`.

Those 12 briefs account for 26 lost brief-runs (of 39). The failing check in each:

| Failing check | Lost brief-runs | Briefs |
| --- | --- | --- |
| Physical lint only (DB in all 19; FWC as well in 5) | 19 | `studio-1br` x3, `dims-auto-cottage` x3, `three-bed-2bath` x2, `sized-kitchen-flat` x2, `sized-office-mix` x2, `attach-openings` x2, `two-bath-flat`, `accessible-bath`, `bungalow`, `strip-attach-clean`, `sized-wet-room` |
| Compile error (not valid) | 7 | C-jamb x4 (`core-and-shell`, `three-bed-2bath`, `accessible-bath`, `sized-office-mix`), C-ext (`two-bath-flat`), C-par (`bungalow`), C-stmt `Unknown statement` (`sized-kitchen-flat`) |
| Room-count or label predicate | 0 | none |

No brief that met intent in July lost it on a gating Expect predicate (rooms, label, area): every
loss is a physical lint code or a compile error. In the other direction, 9 of July's 13 failing
briefs met intent in at least one new run (`small-office` in all three, from a July label
failure); `against-wall-bath`, `l-shaped-flat`, `accessible-flat` and `compact-studio` failed in
all four runs.

## Causes, as far as this data shows

The question was whether the losses come from a prompt change, the judge, or model drift. The
data separates them only partly.

- **Compile errors (7 lost brief-runs): compiler and prompt.** Six of the seven are opening-placement
  refusals (C-jamb, C-ext, C-par) whose messages do not appear in the July table; the "refused,
  not moved" message entered `src/` on 2026-10-22 (`38bff76f`, ADR 0028 § 5, after July). These
  are plans the current compiler rejects; whether the July compiler would have accepted the same
  source cannot be checked, because neither side's sources are available. The seventh is an
  `Unknown statement` (`sized-kitchen-flat`, run 3), the kind of error July also had
  (`against-wall-bath`).
- **Physical lint (19 lost brief-runs): judge or model, not separable here.** `W_DOORWAY_BLOCKED`
  is in every one of them. Its message wording in the November notes differs from the July notes,
  and `src/lint/rules/doors.ts` has commits after July, so the check that scores these plans is not
  the July check. The same notes cannot say whether the model placed furniture differently or the
  check got stricter: that needs the source of each plan scored under both lint versions, and no
  source is available for either side.
- **Prompt.** The author prompt (`spec.llm.md`) changed between July and `2a210589` (at least
  v1.15.0's suffix line, CO-1 and CO-2), so every new-run difference spans a prompt change too.
  Nothing in the per-brief notes attributes a loss to it alone.
- **Model drift.** Model id and seed are the same on both sides; these tables give no evidence for
  or against drift in the served model.
- **Noise.** The three new runs at one commit disagree with each other on 15 of the 26 briefs, and
  the July side is one run. A single-run per-brief change is within the spread the new runs show
  among themselves.

No claim is made beyond these tables, none about loop gain, and none about which baseline is
right.
