# Numbers audit — five contested figures

Audited 2026-08-22 against `D:\github_repository\archlang` at commit `8096f2d`
(`main`, working tree carrying unrelated uncommitted changes that were **not** touched).

Every replacement figure below is produced by a committed script under
`paper/experiments/`, runnable with one command, with its raw output written to JSON
next to it. Nothing outside `paper/experiments/` was modified; the two experiments that
edit source files restore them and assert `git status` is clean afterwards.

| # | Claim | Verdict |
|---|---|---|
| 1 | "27 of 28 planted faults killed; the survivor provably an equivalent mutant" | **DROP** the old number; **USE-REVISED** (new measurement: 49/56) |
| 2 | "113/113, versus 24 failures against the pre-v1.26 grammar" / "71-plan agreement corpus" | **USE-REVISED** (disaggregated below; `71` is wrong, `113` and `24` are different units) |
| 3 | Two conflicting eval baselines | **USE-REVISED** (cite the 2026-07-12 run; the per-brief table belongs to the superseded one) |
| 4 | Gate G1 faithfulness 154/157 vs control 155/166 | **USE-AS-IS** for the numbers; **USE-REVISED** for the word "human" |
| 5 | npm downloads | **USE-REVISED** (only with the release-cadence shape) |

---

## 1. Mutation testing of `src/lint/measure.ts` and `src/frame.ts`

### The claim

`CHANGELOG.md:254` (v1.26.1, *Added*) and `AGENTS.md:30`:

> 27 of 28 planted faults were killed; the survivor is provably an equivalent mutant.

### What I verified

The prior investigation is correct on every point:

- **No mutation-testing tool is configured.** `package.json` has no Stryker (or any
  mutation) dependency or script; `vitest.config.ts` has no mutation plugin; nothing under
  `scripts/` performs mutation.
- **The mutants are not committed.** No mutant list, no diff set, no result artifact exists
  anywhere in the tree.
- **Neither test file mentions the experiment.** `test/lint-measure.test.ts` and
  `test/frame.test.ts` contain no occurrence of *mutation*, *mutant*, *planted*, *killed*
  or *survivor*. (The only repo-wide hits for "planted" are a different claim — the
  `lowerWalls` iteration-order plant in `test/arbitrary-plan.ts` and the planted clause in
  `test/spec-forms.test.ts`.)

So "27 of 28" is a **one-time, unrecorded, unreproducible observation**. Neither the
mutant set nor the "provably equivalent" argument survives anywhere. A reviewer cannot
check it, and neither can the project.

### The replacement

`paper/experiments/mutation/` — a deterministic, auditable harness:

```bash
node paper/experiments/mutation/run.mjs          # ~8 min; writes results.json
npx tsx paper/experiments/mutation/witness.mts   # survivor triage; writes witness-results.json
```

`mutants.json` enumerates **56 hand-authored mutations** (20 to `src/lint/measure.ts`, 36
to `src/frame.ts`) as exact find/replace pairs. Each `find` must match its file **exactly
once**, asserted before anything is written, so the experiment cannot silently mutate the
wrong line. For each mutant the harness applies the edit, runs the module's **dedicated**
vitest file, and — if that suite still passes — re-runs a fixed **secondary** set of
whole-plan suites that reach the module (`place`/`levels` for `frame.ts`; four lint suites
for `measure.ts`). The source is restored from an in-memory pristine copy in a `finally`
and on SIGINT, and the run refuses to start on a dirty tree and reports tree-cleanliness at
the end (`treeCleanAfterRun: true` in the committed result).

**Result** (`paper/experiments/mutation/results.json`, node v24.15.0, vitest ^2.1.8,
commit `8096f2d`, 472 s of test wall-time):

| | mutants | killed by the module's dedicated suite | survived |
|---|---|---|---|
| `src/lint/measure.ts` | 20 | 17 | 3 |
| `src/frame.ts` | 36 | 32 | 4 |
| **total** | **56** | **49 (87.5%)** | **7** |

The secondary suites killed **none** of the 7 survivors, so widening the suite set does not
move the number — a finding in itself: the whole-plan tests do not compensate for a gap in
the unit tests here.

### Survivor triage — equivalent, or merely untested?

`witness.mts` compiles a probe plan with and without each survivor and compares the
rendered SVG (or, for the `measure` survivors, the lint message text) byte-for-byte.

| survivor | mutation | witness? | reading |
|---|---|---|---|
| `measure-08` | `hi <= line` → `hi < line` in `approachGapMm` | none | **Equivalent.** When `hi === line` every branch returns 0 for any `depth ≥ 0`, and `depth` is a required clearance. |
| `measure-19` | `frontGapMm` reads the horizontal facing direction from corners, not centres | none | **Equivalent under its caller's invariant.** `frontClearanceRect` (`src/analyze.ts:510`) always returns a zone aligned with the fixture on the cross axis and strictly on one side, for which corner- and centre-derived signs agree in all four quarter-turns. Distinguishable only by a caller that violates that invariant (e.g. a zero-extent rect). |
| `measure-20` | same, vertical axis | none | as above |
| `frame-17` | `swapsAxes` reads `c` instead of `b` | none | **Equivalent** for every frame the module can construct: `makeFrame`/`composeFrame`/`inverse` only ever produce signed permutation matrices, for which `b ≠ 0 ⟺ c ≠ 0`. |
| `frame-27` | `det(f) < 0` → `det(f) <= 0` in `transformElement` | none | **Equivalent**: `det` is exactly ±1 for every constructible frame. |
| `frame-24` | `transformArc` keeps the rotational sense through a reflection | **YES** | **Genuine gap.** A mirrored `place` of a component containing a curved wall renders different SVG bytes and nothing fails. |
| `frame-25` | `transformArc` derives the start angle with `atan2`'s arguments swapped | **YES** | **Genuine gap.** Same probe, different SVG bytes, no test fails. |

So the honest shape is *five arguably-equivalent survivors and **two real, uncovered
behaviours***, both in `transformArc` — the one function in `frame.ts` that no dedicated
test exercises through a reflection.

### What a paper may say

> A 56-mutant experiment over the two modules (`paper/experiments/mutation/`) is killed
> 49/56 (87.5%) by the modules' own test files; the same seven mutants also survive the
> repository's whole-plan `place`/`levels`/lint suites. Five survivors are equivalent —
> two unconditionally, three under an invariant their sole caller establishes — and two are
> genuine coverage gaps in `transformArc`, each demonstrated by a plan whose rendered
> output the mutation changes while the suite stays green.

**VERDICT: DROP** the "27 of 28" sentence from any citation — it is unreproducible and the
artefacts do not exist. **USE-REVISED** with 49/56, and note explicitly that this is a
*new, independent* measurement over a *different, committed* mutant set, not a correction
of the old number: the two are not comparable, because a hand-authored mutant list encodes
its author's idea of what could go wrong.

---

## 2. GBNF grammar/parser agreement: "113/113", "24 failures", "71-plan corpus"

### The claims

`CHANGELOG.md:343-347` (v1.26.0):

> An agreement corpus in `test/gbnf-drift.test.ts` — **71 plans** run through both the
> bundled GBNF recognizer and the real `compile()` … Against the previous grammar it fails
> **24 agreement cases**; against this one, **113/113**.

`AGENTS.md:30/71` repeats "71-plan agreement corpus … 113/113, versus 24 failures against
the pre-v1.26 grammar".

### What the test file actually contains

`test/gbnf-drift.test.ts` (704 lines) runs seven distinct groups of `it()` cases. Counted
by running it, and reproduced independently by
`paper/experiments/gbnf/agreement.mts` (which imports the recognizer and the corpora
**from the test file itself**, so the figures cannot drift from the gate):

| group | today | at v1.26.0 (`2ac49ef`) | what one case asserts |
|---|---|---|---|
| file-level cases | 5 | 5 | generator drift; recognizer sanity; a v1.13-sugar snippet; ten tricky-but-valid spellings; comments/blank lines |
| `examples/*.arch` acceptance | **30** | **17** | the grammar derives this shipped example |
| malformed-input rejection | 9 | 9 | the grammar has no derivation for this snippet |
| `AGREEMENT` rows | **73** | **73** | `accepts(grammar, s) === parses(compiler, s)` — the biconditional |
| the non-vacuity case | 1 | 1 | ≥20 of the 73 parse and ≥20 do not; no duplicate labels |
| `NARROWER` pins | 5 | 5 | the grammar refuses a form the compiler flags with a catalogued code |
| `DIVERGENT` pins | 3 | 3 | a known over-permissiveness, pinned with its reasoning |
| **total `it()` cases** | **126** | **113** | |

So:

- **`113` is the total `it()` count of the whole file at v1.26.0**, not a corpus size and
  not an agreement count. `5 + 17 + 9 + 73 + 1 + 5 + 3 = 113`. It is **113 out of 113
  tests in that file**, of which only 73 are agreement rows. Today the same file is
  **126/126**, the growth being 13 new `examples/*.arch` added by the 2026-08-16 showcase
  redraw — the figure moves with the example gallery, which is not what a reader assumes
  it measures.
- **`71` is simply wrong.** The `AGREEMENT` array holds **73** rows, and held 73 at
  v1.26.0 too — the number was never 71 in any committed revision I can find.
- **`24` is an agreement-failure count, reproducible today.** Running the *current* corpus
  against the *pre-v1.26* grammar (`git show 2ac49ef^:grammars/archlang.gbnf`) yields
  **exactly 24 disagreements** out of 73 — and identically 24 against the `v1.25.0` tag,
  i.e. against the last grammar that was ever published. It also breaks **1 `NARROWER`
  pin**, so the file would report **25 failing `it()` cases**, not 24.

Definitions a paper should use verbatim:

- **Agreement corpus**: 73 complete ArchLang plan sources, chosen to sit on clause-ordering
  and arity boundaries. **36** are accepted by the parser and **37** rejected — the split
  is asserted by the test's own non-vacuity case, so the corpus cannot be satisfied by a
  grammar that accepts (or rejects) everything.
- **Agreement**: for each source, `grammar accepts ⟺ compiler parses`. The expected value
  is recomputed from `compile()` on every run, so there is no expected column to edit.
- **Current result**: **73/73** agreement, **30/30** shipped examples derivable, **9/9**
  malformed snippets rejected, **5/5** narrowing pins and **3/3** divergence pins holding.
- **Historical result**: against the last pre-v1.26 grammar, **49/73** agreement (24
  disagreements: 21 forms the grammar derived that the parser rejects, 3 forms the parser
  accepts that the grammar could not derive).

### Reproduce

```bash
npx tsx paper/experiments/gbnf/agreement.mts --rev 2ac49ef^ --rev v1.25.0
# → paper/experiments/gbnf/agreement-results.json
```

**VERDICT: USE-REVISED.** Cite "73/73 agreement over a 73-plan corpus (36 parseable, 37
not), against 49/73 for the last published pre-v1.26 grammar." Do **not** cite "113/113"
(it is a whole-file test count that grows with the example gallery) or "71" (wrong). If the
before/after contrast is wanted, "24 of 73 agreement rows disagreed" is the defensible
form, and it re-runs today.

---

## 3. The two eval baselines

### The two runs

| | **superseded** | **canonical** |
|---|---|---|
| file | `eval/g1/baseline-run-29150982395.md` | `eval/live-baseline.json` |
| date | 2026-07-11 | **2026-07-12** |
| GH Actions run | 29150982395 | **29190294073** |
| model | `gpt-5.5-2026-04-23` | `gpt-5.5-2026-04-23` |
| seed / cap | 20260711 / 16384 | 20260711 / 16384 |
| judge / synonyms | v2 / v1 | v2 / v1 |
| briefs | 26 | 26 |
| **L0 valid** | 25/26 (96%) | **23/26 (88%)** |
| **L0 intent** | 13/26 (50%) | **14/26 (54%)** |
| **L0 sound** | 4/26 (15%) | **3/26 (12%)** |
| L1 intent | 18/26 (69%) | 18/26 (69%) |
| L1 sound | 6/26 (23%) | 7/26 (27%) |
| L1 repair moves | 47 (7 healed, 0 regressed) | 41 (8 healed, 1 regressed) |
| per-brief table | **yes** (committed) | **no** (headline only) |

### What differed between them

Exactly one thing, by the project's own record (`eval/live-baseline.json`'s `note` and
`eval/README.md` §"Prompt-drift history"): **the author prompt**. v1.15.0 added the
metric-unit-suffix line to `spec.llm.md`, which *is* the prompt the model authors from, so
the 2026-07-11 measurement was re-run the next day under the current prompt. Same model,
same seed, same token cap, same judge, same synonyms, same 26 briefs.

Two things a paper must not skip:

1. **The seed did not make the run deterministic.** Same seed, same model, same corpus,
   one-line prompt delta → −2 valid / +1 intent / −1 sound. The project reads that as run
   noise at n = 26, which is reasonable, but it means `seed 20260711` should be reported as
   *requested*, not as a reproducibility guarantee. A single-run rate at n = 26 carries a
   ±1–2 brief wobble; do not report a 4-point difference between any two such runs as a
   result.
2. **Only the superseded run has a per-brief table.** Any per-brief analysis, and the whole
   Gate G1 control arm (item 4), rests on the **2026-07-11** run, while the headline
   baseline is the **2026-07-12** one. These are two different measurements and the repo
   mixes them.

### What to cite

> Calibrated one-shot (L0) authorability baseline, `eval/live-baseline.json`: OpenAI
> `gpt-5.5-2026-04-23`, seed 20260711, `max_completion_tokens` 16384, 26 briefs, judge
> v2 / synonyms v1, run 2026-07-12 from GitHub Actions run 29190294073 — **valid 23/26
> (88%), intent-match 14/26 (54%), lint-clean 3/26 (12%)**. The same run's deterministic
> repair overlay (L1: `arch fix` + `arch repair`, zero extra model calls) reaches intent
> 18/26 (69%) and lint-clean 7/26 (27%) via 41 repair moves and 0 fix edits, 8 briefs
> healed and 1 regressed. A superseded 2026-07-11 run (29150982395, identical model/seed/
> judge, pre-v1.15.0 author prompt) scored valid 25/26, intent 13/26, sound 4/26; it is the
> only run with a committed per-brief scorecard, and is the run Gate G1's control arm is
> computed from.

Do not present the L1 numbers as a headline: the project's own rule is that the baseline
and every delta against it are L0, with L1 recorded for reference. And never compare either
rate against a judge-v1 number (`JUDGE_VERSION` is pinned at `"2"` in `src/intent.ts:33`;
the v1→v2 recalibration moved intent 9%→50% with zero model change).

**VERDICT: USE-REVISED.** Canonical = `eval/live-baseline.json` (2026-07-12). Cite it with
the full provenance block above, and state plainly that the per-brief table and the G1
control belong to the superseded run.

---

## 4. Gate G1 — grading provenance

### Every number checks out

`paper/experiments/g1/verify.mjs` recomputes all of them from the committed artefacts
(zero dependencies, no network, no key):

```bash
node paper/experiments/g1/verify.mjs
npx tsx eval/g1/baseline-accuracy.ts    # the control arm; NO API key needed
```

| quantity | `report.md` | recomputed |
|---|---|---|
| rater A faithfulness | 156/157 (99.4%) | 156/157 ✓ (sole miss `accessible-flat/A1`) |
| rater B faithfulness | 154/157 (98.1%) | 154/157 ✓ (`open-plan-loft/A7`, `accessible-flat/A1`, `strip-attach-clean/A1`) |
| adjudicated final | 154/157 = 98.1% | 154/157 ✓ |
| inter-rater agreement | 155/157 = 98.7% | 155/157 ✓ |
| Cohen's κ | 0.50 | 0.495 ✓ |
| control, all 26 briefs | 155/166 = 93.4% | 155/166 ✓ |
| control, valid plans only | 155/162 = 95.7% | 155/162 ✓ |
| primary z, p (one-tailed) | z = 2.08, p = 0.019 | z = 2.08, p = 0.019 ✓ |
| sensitivity z, p | z = 1.24, p = 0.11 | z = 1.24, p = 0.108 ✓ |
| generator token spend | 36 671 | 26 753 in + 9 918 out = 36 671 ✓ |

**`eval/g1/baseline-accuracy.ts` runs offline and needs no API key.** It parses the frozen
2026-07-11 scorecard's per-brief subscore cells, multiplies each dimension's pass fraction
by that brief's judge-v2 predicate count from `corpus.json`, and cross-checks the
reconstructed failures against the scorecard's own failure notes. It reproduced 155/166 and
155/162 exactly on first run, in a few seconds.

One trivial inconsistency worth knowing before a reviewer finds it: `report.md` is dated
2026-07-12 while `intents.json` records the generation as 2026-07-11. The generation ran on
the 11th; the scoring and the report are the 12th.

### Who actually graded

**No human scored any assertion.** The roadmap called for a human rater plus an independent
model rater; the owner could not judge faithfulness cold, so the process was amended — and,
to the project's credit, the amendment is recorded verbatim in
`eval/g1/scores-human.json`'s own `note`, not hidden. In fact:

- **Rater A** = three blind `claude-opus-4-8` subagents, no repository access, judging from
  inline brief + assertion text only (`scores-model.json`).
- **Rater B** = `claude-fable-5`, the session's own director model, scoring independently
  and archiving its verdicts **before** reading rater A's (`scores-fable.json`).
- The **human** ruled only on the **two** inter-rater disagreements, with both raters'
  reasonings shown side by side (`scores-human.json`). Both rulings went to rater B, so the
  reported final equals rater B's own score.

### Provenance paragraph (usable verbatim)

> Gate G1 measures whether a model can translate a natural-language brief into the
> project's intent-JSON contract faithfully. The generator was OpenAI `gpt-5.5-2026-04-23`
> (seed 20260711, one call per brief, 26 briefs, 36 671 tokens, GitHub Actions run
> 29154585163, 2026-07-11); each generated `Expect` block was lowered by `compileExpect`
> into judge-v2 predicates, giving 157 per-assertion units. Faithfulness was graded by two
> independent, generator-family-independent raters: rater A, three blind `claude-opus-4-8`
> subagents with no repository access judging from inline brief-plus-assertion text
> (156/157 faithful); and rater B, a `claude-fable-5` instance scoring independently and
> archiving its verdicts before seeing rater A's (154/157). Inter-rater agreement was
> 155/157 (98.7%), Cohen's κ = 0.50, deflated by the ~98% faithful base rate. **The
> project's roadmap specified a human rater; no human graded any assertion.** The human
> owner's role was reduced, and this is recorded in the committed artefacts, to
> adjudicating the two inter-rater disagreements with both reasonings shown; both rulings
> went to rater B, so the adjudicated result, 154/157 = 98.1%, equals rater B's own score,
> with rater A's independent score forming a 99.4% upper bound. The control arm — the
> per-assertion accuracy of generating `.arch` directly, from the calibrated 2026-07-11
> live baseline — is 155/166 = 93.4%, reconstructed offline from the frozen scorecard by
> `eval/g1/baseline-accuracy.ts`; the gate's primary comparison, 98.1% vs 93.4%, gives a
> one-tailed two-proportion z of 2.08 (p = 0.019). **The sensitivity analysis is the
> load-bearing caveat**: the control's denominator counts all assertions of the one brief
> whose plan failed to compile as failed (deliverable semantics). Excluding that brief
> leaves the control at 155/162 = 95.7%, and the comparison at z = 1.24 (p = 0.11) — real
> in sign, but below statistical resolution at n ≈ 160 per arm. The gate as written passes;
> the faithfulness advantage over the *valid-only* baseline is directional, not
> established. Two further limits: the control arm comes from a run that the project's own
> canonical baseline superseded the next day, and both arms are single runs at n = 26
> briefs.

**VERDICT: USE-AS-IS** for the numbers (all reproduced exactly). **USE-REVISED** for the
prose: "double-blind human + model rating" must become "two independent model raters, with
a human adjudicating two disagreements", and the valid-only sensitivity result must travel
with the headline z, never behind it.

---

## 5. npm download figures

### The script

`paper/experiments/npm-downloads/fetch.mjs` — zero-dependency Node, queries the public npm
registry download-counts API for both packages (30-day point figure and a 90-day daily
range), derives the shape of the distribution, marks each top-5 day against this
repository's own `v*` tag dates, and writes a dated JSON.

```bash
node paper/experiments/npm-downloads/fetch.mjs        # → downloads-<YYYY-MM-DD>.json
```

### Result, fetched 2026-08-21 (UTC; range ends 2026-08-20, the last complete day)

| | `@chanmeng666/archlang` | `@chanmeng666/archlang-mcp` |
|---|---|---|
| last 30 days (point, 2026-07-21…08-19) | **2 357** | **1 181** |
| 90-day window total | 8 153 | 1 674 |
| first day with any download | 2026-06-24 | 2026-07-10 |
| days since first download | 58 | 42 |
| zero-download days, whole 90-day window | 35 | 52 |
| zero-download days, since first download | **3** | **4** |
| median / mean per day (90-day) | 19 / 90.6 | 0 / 18.6 |
| busiest single day | 980 (2026-06-30) | 281 (2026-08-12) |
| top-5 days as a share of the total | **44.0%** | **57.6%** |
| top-5 days that are release days | **5 of 5** | 3 of 5 |

The release-cadence caveat is not rhetorical here, it is measured: **all five** of the core
package's busiest days are days this repository pushed `v*` tags (2026-06-25: 6 tags;
06-26: 6; 06-30: 5; 07-25: 1; 07-26: 5), and those five days carry 44% of the 90-day
total. The MCP shim's own top day, 2026-08-12, is the v1.26.0 release day, and its two
other peaks are its own first publish (2026-07-10) and the dataset/MCP publishing day
(2026-07-13).

Note also that most of the "zero-download days" in a 90-day window are days **before the
package existed** — 32 of the core's 35 and 48 of the shim's 52. Reporting the raw
zero-day count without that split would understate uptake as badly as reporting the total
without the release peaks overstates it.

### What a paper may say

> As of 2026-08-21 the core package `@chanmeng666/archlang` records 2 357 npm downloads in
> the trailing 30 days and 8 153 over 90 days (the package's first recorded download is
> 2026-06-24), and the optional MCP shim records 1 181 and 1 674 respectively. npm download
> counts are not unique users — they include CI, mirrors and bots — and for a package on
> this release cadence they track publishing activity closely: all five of the core
> package's busiest days are days a `v*` tag was pushed, and those five days account for
> 44% of the 90-day total. The figure is reported as a distribution-availability datum, not
> as evidence of adoption.

**VERDICT: USE-REVISED.** The point figure is fine to cite provided the release-cadence
concentration travels with it in the same sentence. Do not cite it as users, installs or
adoption.

---

## Files produced

```
paper/experiments/
├─ NUMBERS-AUDIT.md              this document
├─ mutation/
│  ├─ mutants.json               56 enumerated source mutations
│  ├─ run.mjs                    the harness (one command, restores the tree)
│  ├─ results.json               49/56 killed
│  ├─ witness.mts                survivor triage (equivalent vs untested)
│  └─ witness-results.json       2 of 7 survivors change observable output
├─ gbnf/
│  ├─ agreement.mts              re-uses test/gbnf-drift.test.ts's own recognizer + corpora
│  └─ agreement-results.json     73/73 now; 49/73 against the pre-v1.26 grammar
├─ g1/
│  └─ verify.mjs                 recomputes every Gate G1 figure from committed artefacts
└─ npm-downloads/
   ├─ fetch.mjs                  registry API + release-day marking
   └─ downloads-2026-08-21.json
```
