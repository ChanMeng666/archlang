# Live eval runs, 2026-11-15: authorability re-measure around CO-1 and CO-2

A dated, aggregate-only record of `eval:live` runs (Claude 5.x locally, gpt-5.5 through GitHub
Actions) on the 26-brief corpus, taken before and after two changes: CO-1 (PR #790: furniture,
room, door, window, opening and outdoor clauses in any order, `id=` after the category) and CO-2
(PR #809: catalogued footprints under `at`/`in`). The runs were the P1 repeat runs and the P2
gpt-5.5 re-measure of the owner's in-chat approval of 2026-11-15 for the promotional-credit
measurement programme (P3 fidelity is in `2026-11-fidelity.md`, under RM-D46). Raw model replies
and per-brief tables are not published.

**Each before/after pair differs in the compiler AND in the author prompt** (`spec.llm.md`, the
system prompt `eval/run.ts` reads). CO-1's spec rule 6 went from "`id=` after the category is a
parse error" to permitting it, plus a sentence that trailing clauses may come in any order. CO-2's
went from "`against` may omit size" to "any placement may omit size". The differences below cannot
be split between the two.

**`eval/live-baseline.json` is NOT updated by these runs.** It stays the July record
(`gpt-5.5-2026-04-23`, seed `20260711`, valid 23, intent 14, sound 3 of 26; same run's L1 intent
18/26); changing it needs an owner decision. Nothing here is a baseline.

## Setup

- Judge v2, synonyms v1, rubric v1; 26 briefs; `--l1` overlay (deterministic `arch fix` +
  `arch repair` over the same L0 sources, no extra API calls). Each group is 3 runs: n = 3 x 26 = 78
  per model, except where a budget cap skipped a brief (noted).
- Claude: provider `anthropic`, run locally with `npm run eval:live`, 3 runs per model. No seed is
  sent and temperature is unpinned (the 5.5 models reject it; the scorecard's `temp 0` is a label).
- gpt-5.5: model `gpt-5.5-2026-04-23`, seed `20260711`, GitHub Actions "Eval (live)", 3 runs per
  commit.

| Group | Date (UTC) | Commit | Model(s) | Per-run budget cap |
| --- | --- | --- | --- | --- |
| P1 before | 2026-11-15 | `e523f3f5` | haiku-5-5, sonnet-5-5, opus-5-5, fable-5-2 | 1.5 / 3 / 5 / 8 usd |
| P1 after (CO-1) | 2026-11-15 | `ca02caed` (see provenance) | same four | 1.5 / 3 / 5 / 10 usd |
| P1 after CO-1 + CO-2 | 2026-11-15 (09:51 to 12:27 on 2026-11-16, UTC+13) | `680641114e5b` | same four | 1.5 / 3 / 5 / 10 usd |
| P2 before | 2026-11-15 | `3ca9556b` | gpt-5.5-2026-04-23 | none recorded |
| P2 after CO-1 | 2026-11-15 | `ca02caed` | gpt-5.5-2026-04-23 | none recorded |
| P2 after CO-1 + CO-2 | 2026-11-15 | `2a210589` | gpt-5.5-2026-04-23 | none recorded |

Fable skipped 1 brief (`sized-office-mix`) in each of runs 1 and 3 before (8 usd cap): its "before"
n is 25 / 26 / 25 = 76. After (10 usd cap) it skipped none (n = 78). Skipped briefs are excluded
from the denominators. One Fable call before ended on `max_tokens`; no other call in either group
was truncated.

The CO-1 + CO-2 group skipped no brief (n = 78 per model) and one Fable call, on `accessible-flat`
in run 1, ended on `max_tokens` (no other call was truncated). Every run completed under its cap
(largest spend: Fable, 9.24 usd of 10).

### P1 after: provenance

The run started at `ca02caed`. At 02:41:29 local (UTC+13, from the reflog), another session
fast-forwarded the primary checkout to `6e144178` (commit time 02:39:45), mid-run. Between the two
commits `src/` differs by one comment line in `src/finish.ts`, and `spec.llm.md` is unchanged;
nothing `eval/run.ts` reads changed (`eval/README.md`, the `l2*.ts` files and the T3 record did).
Every P1-after run therefore measured the same compiler and the same prompt. The next
fast-forward, to `2a210589` (with CO-2), was at 04:00:43, 33 s after the last run ended at
04:00:10.

The CO-1 + CO-2 group ran in a dedicated detached worktree at `680641114e5b` (origin/main after
CO-1 #790 and CO-2 #809), 09:51 to 12:27 local (UTC+13) on 2026-11-16, so the commit could not
move mid-run: no fast-forward of a checkout was possible. All 12 runs measured one compiler and one
prompt.

## P1: Claude 5.x, per run (L0 valid / intent / sound of 26; L1 in brackets)

Per run, runs 1 / 2 / 3. L1 valid equals L0 valid in every run; the bracket is L1 intent / L1 sound.
Fable before: runs 1 and 3 have 25 briefs, so its before valid, intent and sound are out of
25 / 26 / 25.

| Model | Phase | Valid | Intent | Sound | [L1 intent / sound] |
| --- | --- | --- | --- | --- | --- |
| haiku-5-5 | before | 13, 16, 16 | 6, 7, 10 | 2, 2, 1 | [10/2, 14/3, 14/1] |
| haiku-5-5 | after | 14, 18, 15 | 10, 8, 6 | 2, 1, 1 | [11/2, 16/1, 13/1] |
| sonnet-5-5 | before | 16, 19, 18 | 15, 15, 17 | 2, 2, 1 | [15/2, 16/2, 18/1] |
| sonnet-5-5 | after | 22, 24, 23 | 13, 18, 18 | 1, 2, 4 | [18/2, 19/2, 19/5] |
| opus-5-5 | before | 24, 21, 23 | 17, 15, 16 | 2, 3, 2 | [20/2, 17/3, 20/2] |
| opus-5-5 | after | 24, 25, 24 | 15, 14, 18 | 1, 1, 2 | [18/1, 20/1, 19/2] |
| fable-5-2 | before | 22/25, 24/26, 21/25 | 20/25, 23/26, 18/25 | 5/25, 3/26, 3/25 | [20/5, 23/3, 19/4] |
| fable-5-2 | after | 26, 26, 26 | 23, 24, 24 | 5, 5, 5 | [23/5, 24/5, 24/5] |
| haiku-5-5 | after CO-1 + CO-2 | 17, 20, 14 | 6, 10, 6 | 1, 2, 2 | [11/1, 16/2, 13/2] |
| sonnet-5-5 | after CO-1 + CO-2 | 26, 25, 23 | 16, 16, 14 | 3, 3, 4 | [23/3, 19/4, 21/4] |
| opus-5-5 | after CO-1 + CO-2 | 23, 23, 23 | 15, 19, 14 | 2, 2, 2 | [19/2, 22/2, 18/2] |
| fable-5-2 | after CO-1 + CO-2 | 25, 26, 26 | 23, 24, 21 | 5, 4, 6 | [23/5, 24/4, 21/6] |

## P1: summed counts with Wilson 95 % intervals

Intervals are outward-rounded whole percents, as `eval/run.ts` prints them.

| Model | Phase | n | Valid | Intent | Sound | L1 intent |
| --- | --- | --- | --- | --- | --- | --- |
| haiku-5-5 | before | 78 | 45 (46-69 %) | 23 (20-41 %) | 5 (2-15 %) | 38 (37-60 %) |
| haiku-5-5 | after | 78 | 47 (49-71 %) | 24 (21-42 %) | 4 (2-13 %) | 40 (40-63 %) |
| sonnet-5-5 | before | 78 | 53 (56-78 %) | 47 (49-71 %) | 5 (2-15 %) | 49 (51-73 %) |
| sonnet-5-5 | after | 78 | 69 (79-94 %) | 49 (51-73 %) | 7 (4-18 %) | 56 (60-81 %) |
| opus-5-5 | before | 78 | 68 (77-93 %) | 48 (50-72 %) | 7 (4-18 %) | 57 (62-82 %) |
| opus-5-5 | after | 78 | 73 (85-98 %) | 47 (49-71 %) | 4 (2-13 %) | 57 (62-82 %) |
| fable-5-2 | before | 76 | 67 (79-94 %) | 61 (69-88 %) | 11 (8-25 %) | 62 (71-89 %) |
| fable-5-2 | after | 78 | 78 (95-100 %) | 71 (82-96 %) | 15 (12-30 %) | 71 (82-96 %) |
| haiku-5-5 | after CO-1 + CO-2 | 78 | 51 (54-75 %) | 22 (19-40 %) | 5 (2-15 %) | 40 (40-63 %) |
| sonnet-5-5 | after CO-1 + CO-2 | 78 | 74 (87-98 %) | 46 (47-70 %) | 10 (7-23 %) | 63 (70-88 %) |
| opus-5-5 | after CO-1 + CO-2 | 78 | 69 (79-94 %) | 48 (50-72 %) | 6 (3-16 %) | 59 (65-84 %) |
| fable-5-2 | after CO-1 + CO-2 | 78 | 77 (93-100 %) | 68 (77-93 %) | 15 (12-30 %) | 68 (77-93 %) |

L1 sound sums, before / after CO-1 / after CO-1 + CO-2: haiku 6 / 4 / 5, sonnet 5 / 9 / 11,
opus 7 / 4 / 6, fable 12 / 15 / 15. L1 valid sums
equal the L0 valid sums. Each call is treated as a Bernoulli trial; the 3 runs of one brief are not
independent, so the intervals understate brief-level uncertainty.

### Compile notes by class (summed over 3 runs)

Counted in the result files. "Order notes" are `Unknown statement ...` plus `Expected "at" but
found ...`; before CO-1 they were all `label` / `size` (P1) and `label` / `size` / `clear` (P2),
after it none is `label` / `size` / `clear`. The size column counts the literal note ``needs a `size
WxH` ``.

| Model | Order notes before | Order notes after (none label/size/clear) | Order notes after CO-1 + CO-2 | `needs a size` before | `needs a size` after | `needs a size` after CO-1 + CO-2 |
| --- | --- | --- | --- | --- | --- | --- |
| haiku-5-5 | 50 | 0 | 7 | 1 | 0 | 0 |
| sonnet-5-5 | 66 | 2 | 0 | 5 | 9 | 0 |
| opus-5-5 | 2 | 2 | 0 | 3 | 0 | 5 |
| fable-5-2 | 11 | 0 | 0 | 0 | 0 | 0 |

The residual notes after CO-1 are other statements: in P1 `offset`, `at` and `double`, in P2
`offset`. Opus has 2 before and 2 after, so its count did not change.

After CO-1 + CO-2 the only order notes are Haiku's: 5 `Unknown statement "offset"` and 2
`Unknown statement "hinged"` (none `label` / `size` / `clear`); no `Expected "at"` note anywhere.

Discrepancy with the running log: `findings.md` gives 43 for Haiku before; the result files hold 43
`Unknown statement` notes plus 7 `Expected "at"` notes, so 50 is used here. The other seven figures
agree with the log.

## P2: gpt-5.5, per run (of 26; seed 20260711)

| Group | Run | Valid | Intent | Sound | L1 intent | L1 sound | `Unknown statement` notes | `needs a size` notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before (`3ca9556b`) | 43690645744 | 12 | 5 | 0 | 5 | 0 | 28 | 10 |
| before | 43690648250 | 11 | 5 | 0 | 6 | 0 | 24 | 34 |
| before | 43690650571 | 11 | 5 | 0 | 8 | 1 | 18 | 26 |
| after CO-1 (`ca02caed`) | 43709030127 | 12 | 4 | 0 | 7 | 0 | 0 | 44 |
| after CO-1 | 43709032281 | 12 | 7 | 1 | 8 | 1 | 0 | 32 |
| after CO-1 | 43709034599 | 8 | 5 | 2 | 6 | 2 | 4 | 35 |
| after CO-1 + CO-2 (`2a210589`) | 43727485853 | 22 | 10 | 0 | 15 | 0 | 0 | 0 |
| after CO-1 + CO-2 | 43727489713 | 22 | 9 | 1 | 16 | 1 | 0 | 0 |
| after CO-1 + CO-2 | 43727493307 | 18 | 7 | 0 | 12 | 0 | 1 | 0 |

Truncated replies: 0/26 in every run. L1 valid equals L0 valid in every run. `Expected "at"`
notes: none.

| Group | n | Valid | Intent | Sound | L1 intent | L1 sound |
| --- | --- | --- | --- | --- | --- | --- |
| before | 78 | 34 (33-55 %) | 15 (12-30 %) | 0 (0-5 %) | 19 (16-35 %) | 1 (0-7 %) |
| after CO-1 | 78 | 32 (30-53 %) | 16 (13-31 %) | 3 (1-11 %) | 21 (18-38 %) | 3 (1-11 %) |
| after CO-1 + CO-2 | 78 | 62 (69-87 %) | 26 (23-45 %) | 1 (0-7 %) | 43 (44-66 %) | 1 (0-7 %) |

Against the July baseline (valid 23/26, intent 14/26, sound 3/26, one run; same run's L1 intent
18/26): the per-run valid counts were 11 to 12 before, 8 to 12 after CO-1, and 18 to 22 after
CO-1 + CO-2; the per-run L0 intent counts were 5, 4 to 7 and 7 to 10 (L1 intent: 5 to 8, 6 to 8,
12 to 16). The July run and these differ in commit, prompt and day, and the baseline is one run;
this record states the gap without explaining it.

## Causal note

The before-to-after differences are observed differences across commits (compiler and prompt
together), not isolated effects. Each cell is 3 runs of 26 briefs (n = 78; Fable before 76), the
runs of a brief are not independent, and the intervals above overlap for most before/after pairs.
No significance is claimed.

- Order notes fell to zero for Haiku and Fable and to 2 for Sonnet and Opus after CO-1 (P1;
  Opus was 2 before as well), and from 70 `Unknown statement` notes to 4 for gpt-5.5 (P2). The
  `needs a size` notes fell from 111 to 0 for gpt-5.5 after CO-2. The only `src/` commits between
  the phases are CO-1 and CO-2.
- Valid sums, before to after CO-1: Haiku 45 to 47, Sonnet 53 to 69, Opus 68 to 73 (each of 78),
  Fable 67 of 76 to 78 of 78. Fable's pair is confounded: the cap went from 8 to 10 usd,
  `sized-office-mix` was skipped twice before, and one call before was truncated. gpt-5.5: 34 to
  32 after CO-1 only, then 62 after CO-2.
- gpt-5.5's `needs a size` notes rose from 10 / 34 / 26 per run before to 44 / 32 / 35 after CO-1,
  and the briefs carrying such a note from 23 to 37 of 78. That is consistent with the
  clause-order errors having masked the size errors; this record does not test it.
- Intent sums, before to after CO-1: Haiku 23 to 24, Sonnet 47 to 49, Opus 48 to 47, Fable 61 of 76
  to 71 of 78. Only Fable's moved.

- CO-1 + CO-2 against after CO-1 (P1; this adds CO-2 and its prompt change, and also differs in
  day and run; no significance claimed). Valid: Haiku 47 to 51, Sonnet 69 to 74, Opus 73 to 69,
  Fable 78 to 77. Intent: Haiku 24 to 22, Sonnet 49 to 46, Opus 47 to 48, Fable 71 to 68. Sound:
  Haiku 4 to 5, Sonnet 7 to 10, Opus 4 to 6, Fable 15 to 15. L1 intent: Haiku 40 to 40, Sonnet
  56 to 63, Opus 57 to 59, Fable 71 to 68. Against before, valid is Haiku 45 to 51, Sonnet 53 to
  74, Opus 68 to 69, Fable 67 of 76 to 77 of 78. The intervals overlap for every pair after CO-1
  and CO-2, and the pairs differ in compiler and prompt (`spec.llm.md` changed with CO-2), so the
  deltas are not attributable to CO-2 alone.
- `needs a size` notes after CO-2: Sonnet 9 to 0, Haiku and Fable 0 to 0, Opus 0 to 5 (1, 2 and 2 in runs 1 to 3). Order notes: Sonnet 2 to 0, Haiku 0 to 7 (`offset`, `hinged`), others 0.

This record makes no statement about loop gain, and the T3 record
(`2026-11-t3-result.md`) is the only statement of that result.
