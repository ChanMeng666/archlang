# Live eval runs, 2026-11-15: authorability re-measure around CO-1 and CO-2

A dated, aggregate-only record of owner-authorised `eval:live` runs (Claude 5.x locally, gpt-5.5
through GitHub Actions) on the 26-brief corpus, taken before and after two parser changes:
CO-1 (PR #790: trailing furniture clauses in any order, `id=` after the category) and CO-2
(PR #809: catalogued footprints under `at`/`in`). Billed to the Anthropic promotional credit and
the OpenAI budget. Raw model replies and per-brief tables are not published.

**`eval/live-baseline.json` is NOT updated by these runs.** It stays the July record
(`gpt-5.5-2026-04-23`, seed `20260711`, valid 23, intent 14, sound 3 of 26); changing it needs an
owner decision. Nothing here is a baseline.

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
| P2 before | 2026-11-15 | `3ca9556b` | gpt-5.5-2026-04-23 | none recorded |
| P2 after CO-1 | 2026-11-15 | `ca02caed` | gpt-5.5-2026-04-23 | none recorded |
| P2 after CO-1 + CO-2 | 2026-11-15 | `2a210589` | gpt-5.5-2026-04-23 | none recorded |

Fable skipped 1 brief in each of runs 1 and 3 before (8 usd cap): its "before" n is 25 / 26 / 25 =
76. After (10 usd cap) it skipped none (n = 78). Skipped briefs are excluded from the denominators.
One Fable call before ended on `max_tokens`; no other call in either group was truncated.

### P1 after: provenance

The run started at `ca02caed`. Around 02:30 local (UTC+13), another session fast-forwarded the
primary checkout to `6e144178` mid-run. Between the two commits `src/` differs by one comment line
in `src/finish.ts`; `spec.llm.md` and the eval files are unchanged. Every P1-after run therefore
measured the same compiler and the same prompt.

## P1: Claude 5.x, per run (L0 valid / intent / sound of 26; L1 in brackets)

Per run, runs 1 / 2 / 3. L1 valid equals L0 valid in every run; the bracket is L1 intent / L1 sound.

| Model | Phase | Valid | Intent | Sound | [L1 intent / sound] |
| --- | --- | --- | --- | --- | --- |
| haiku-5-5 | before | 13, 16, 16 | 6, 7, 10 | 2, 2, 1 | [10/2, 14/3, 14/1] |
| haiku-5-5 | after | 14, 18, 15 | 10, 8, 6 | 2, 1, 1 | [11/2, 16/1, 13/1] |
| sonnet-5-5 | before | 16, 19, 18 | 15, 15, 17 | 2, 2, 1 | [15/2, 16/2, 18/1] |
| sonnet-5-5 | after | 22, 24, 23 | 13, 18, 18 | 1, 2, 4 | [18/2, 19/2, 19/5] |
| opus-5-5 | before | 24, 21, 23 | 17, 15, 16 | 2, 3, 2 | [20/2, 17/3, 20/2] |
| opus-5-5 | after | 24, 25, 24 | 15, 14, 18 | 1, 1, 2 | [18/1, 20/1, 19/2] |
| fable-5-2 | before | 22/25, 24/26, 21/25 | 20, 23, 18 | 5, 3, 3 | [20/5, 23/3, 19/4] |
| fable-5-2 | after | 26, 26, 26 | 23, 24, 24 | 5, 5, 5 | [23/5, 24/5, 24/5] |

## P1: summed counts with Wilson 95 % intervals

| Model | Phase | n | Valid | Intent | Sound | L1 intent |
| --- | --- | --- | --- | --- | --- | --- |
| haiku-5-5 | before | 78 | 45 (47-68 %) | 23 (21-40 %) | 5 (3-14 %) | 38 (38-60 %) |
| haiku-5-5 | after | 78 | 47 (49-70 %) | 24 (22-42 %) | 4 (2-12 %) | 40 (40-62 %) |
| sonnet-5-5 | before | 78 | 53 (57-77 %) | 47 (49-70 %) | 5 (3-14 %) | 49 (52-73 %) |
| sonnet-5-5 | after | 78 | 69 (80-94 %) | 49 (52-73 %) | 7 (4-17 %) | 56 (61-81 %) |
| opus-5-5 | before | 78 | 68 (78-93 %) | 48 (50-72 %) | 7 (4-17 %) | 57 (62-82 %) |
| opus-5-5 | after | 78 | 73 (86-97 %) | 47 (49-70 %) | 4 (2-12 %) | 57 (62-82 %) |
| fable-5-2 | before | 76 | 67 (79-94 %) | 61 (70-88 %) | 11 (8-24 %) | 62 (71-89 %) |
| fable-5-2 | after | 78 | 78 (95-100 %) | 71 (83-96 %) | 15 (12-29 %) | 71 (83-96 %) |

L1 sound sums, before / after: haiku 6 / 4, sonnet 5 / 9, opus 7 / 4, fable 12 / 15. L1 valid sums
equal the L0 valid sums. Each call is treated as a Bernoulli trial; the 3 runs of one brief are not
independent, so the intervals understate brief-level uncertainty.

### Clause-order errors (compile notes, summed over 3 runs)

Counted in the result files as `Unknown statement ...` plus `Expected "at" but found ...` notes
(the CO-1 class), and the separate `needs a size WxH` notes (the CO-2 class).

| Model | CO-1 class before | CO-1 class after | `needs a size` before | `needs a size` after |
| --- | --- | --- | --- | --- |
| haiku-5-5 | 50 | 0 | 1 | 0 |
| sonnet-5-5 | 66 | 2 | 5 | 9 |
| opus-5-5 | 2 | 2 | 3 | 0 |
| fable-5-2 | 11 | 0 | 0 | 0 |

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
| before | 78 | 34 (33-55 %) | 15 (12-29 %) | 0 (0-5 %) | 19 (16-35 %) | 1 (0-7 %) |
| after CO-1 | 78 | 32 (31-52 %) | 16 (13-31 %) | 3 (1-11 %) | 21 (18-38 %) | 3 (1-11 %) |
| after CO-1 + CO-2 | 78 | 62 (69-87 %) | 26 (24-44 %) | 1 (0-7 %) | 43 (44-66 %) | 1 (0-7 %) |

Against the July baseline (valid 23/26, intent 14/26, sound 3/26, one run): the per-run valid
counts were 11 to 12 before, 8 to 12 after CO-1, and 18 to 22 after CO-1 + CO-2; the per-run intent
counts were 5, 4 to 7 and 7 to 10 (L1: 5 to 8, 6 to 8, 12 to 16). The July run and these differ in
commit, prompt and day, and the baseline is one run; this record states the gap without explaining
it.

## Causal note

The before-to-after differences are observed differences across commits, not isolated effects. Each
cell is 3 runs of 26 briefs (n = 78; Fable before 76), the runs of a brief are not independent, and
the intervals above overlap for most before/after pairs. No significance is claimed.

- The clause-order notes fell to zero for Haiku and Fable and to 2 for Sonnet and Opus after CO-1
  (P1), and from 70 `Unknown statement` notes to 4 for gpt-5.5 (P2). The `needs a size` notes
  fell from 111 to 0 for gpt-5.5 after CO-2. The CO-1 and CO-2 changes are the only language
  changes known to sit between those commits; the other commits on the way were not audited here.
- Valid moved most where the error class was frequent: Sonnet 53 to 69 of 78, Fable 67 of 76 to
  78 of 78, gpt-5.5 34 to 32 (after CO-1 only; its size errors surfaced once the clause errors
  parsed) and then to 62 after CO-2. Haiku moved 45 to 47 and Opus 68 to 73.
- Intent barely moved for the Claude models (Haiku 23 to 24, Sonnet 47 to 49, Opus 48 to 47,
  Fable 61/76 to 71/78). Plans that now compile still miss the brief or hit geometry errors.
- Sonnet's 9 `needs a size` notes after CO-1 are the CO-2 class; #809 merged after that run.

This record makes no statement about loop gain, and the T3 record
(`2026-11-t3-result.md`) is the only statement of that result.
