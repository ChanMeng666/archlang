# eval/ — the NL→ArchLang authorability measurement subsystem

This directory answers one question, honestly and repeatably: **given the one-page spec and a plain
English brief, does a model write valid, sound, intent-matching `.arch`?** It grew this week from a
thin `run.ts` + corpus + goldens into a full instrument — a versioned judge, a frozen review rubric,
a deterministic-tool tier, and a fault-injection CI gate. Read this before running or extending it.

The load-bearing rule that governs everything here: **a rate is never comparable across a judge
change.** The recalibration described below moved the one-shot intent rate from 9% to 50% with **zero
model change** — the whole move was a fix to the ruler. See "Versioning discipline".

## The tier ladder

We measure authorability at tiers, so the "free" deterministic dividend is never mis-credited to a
model loop (deep-dive H3).

- **L0 — one-shot generation.** The model authors each plan from the brief + `spec.llm.md` alone,
  scored once. This is the headline number.
- **L1 — deterministic fix + repair.** The same L0 source re-scored after `arch fix` (syntactic span
  edits, ADR 0011) then `arch repair` (the geometric corrector, ADR 0006) — **no model in the loop,
  zero extra API calls.** ΔL0→L1 is the free tool dividend. Implemented in `l1.ts` (`l1Pipeline`),
  gated offline in CI by `test/fault-injection.test.ts`, and overlaid on a live run with `--l1`.
- **L2 — a diagnostic feedback loop (built; the live experiment is PERMANENTLY DECLINED).**
  Roadmap Tranche 3 asked: does feeding diagnostics back to the model beat
  **equal-token-budget i.i.d. resampling** (Olausson, arXiv:2306.09896)? The harness is
  implemented and offline-tested — `l2.ts` (pure protocol: ≤2 feedback rounds fed only
  compile/lint diagnostics with their `fix --dry-run` previews + a trimmed `describe()`,
  oracle-isolated; the control arm matches the loop's *measured* token spend, rounding its
  sample count up, which favours the control) and `l2-run.ts` (guarded CLI + the
  "Eval (L2 loop vs resampling)" workflow). **By owner decision (2026-07-12) the ~440-call
  live run will NOT be performed — ever. Do not dispatch it.** The loop-vs-resampling
  question is therefore **permanently unanswered**: no net-loop-gain claim (nor its absence)
  may be made in any doc, prompt, or comment; `adjacent`/`reachable` stay subscore-only
  permanently (the T4 gating-promotion hook is closed); the L3/L4/L5 tiers stay unbuilt.
  The harness and its 14 offline tests are kept as the protocol's reference implementation.

**Beside the ladder, not on it: the FIDELITY slice** (`fidelity.ts`, `corpus-fidelity.json`,
`fidelity-plans/`, `fidelity-run.ts` — roadmap P0-3). The tiers all ask *can a model author
this?*; the fidelity slice asks the question they structurally cannot — *when it could not,
did it move the user's number instead of saying so?* It is **reported on its own and
multiplied into nothing**; see "The fidelity slice" below and rubric §7.

## The fidelity slice — constraint-laundering hardening

ifc-lite's adversarial review of their own M5 results found a repair loop that satisfied the
validator by silently rewriting the user's stated requirement (a sill 2.0 → 1.55) and scored
it a success. `arch fix`, `repair()` and the intent channel all close loops against an
**editable contract**, so the exposure is structural here too: a loop that cannot hit "at
least 13 m²" can always hit "at least 11 m²" instead.

The countermeasure has two halves, and neither one involves a model:

- **Deliberately infeasible briefs.** Requirements that cannot all hold at once. The
  scored-correct behaviour is *declaring infeasibility* and naming the conflicting ids;
  producing a plan a validator accepts **is** the laundering and scores 0. Infeasibility is
  never asserted in prose — `proveInfeasible` derives the conflict set arithmetically from the
  requirements alone, and a test pins the derived set against the corpus's declared one.
- **A deterministic, judge-free fidelity measure.** `checkFidelity` measures a plan against the
  brief's *stated numbers* (pure arithmetic over `describe()` facts), and `checkContract`
  measures a presented `Intent` against those same numbers, so a rewritten band is caught
  before any plan is drawn. Requirements are always one-sided hard bounds or exact counts —
  which is what lets the measure use **no tolerance and invent no band**.

```bash
npm run eval:fidelity   # offline: score the committed references, write eval/fidelity-results.md
```

**Why it is a separate slice, and what stays frozen.** `projectSubscores` returns four
*independent* dimensions that are never combined, so there is no scalar quality score to
multiply a factor into — creating one would be a rubric policy change and would bump
`JUDGE_VERSION`. Adding briefs to `corpus.json` would force a `judge-fixture.json`
regeneration, which the iron law forbids. And the refusal protocol is a **prompt** change, and
the prompt is the ruler. So: the briefs live in their own file, the scorecard is its own file,
the protocol ships only in `fidelitySystemPrompt()`, and `corpus.json` / `judge-fixture.json` /
`live-baseline.json` / `results.md` / `JUDGE_VERSION` / `SYNONYMS_VERSION` are all untouched.
The slice carries its own `FIDELITY_VERSION`; a fidelity rate is never comparable across a
change to it, for the same reason a judge rate never is.

**What the offline gate proves — and what it cannot.** The offline path scores committed
artifacts, so *"does a model launder constraints?"* is not an offline question and this slice
does not pretend to answer it. What is testable is whether the **detector discriminates**: each
brief commits a scored-correct reply plus a laundered counter-example that a validator accepts,
and the gate fails unless the correct one scores 1, the counter-example scores 0, and the moved
requirement is **named**. That mirrors `faults/` one level up. `test/eval-fidelity.test.ts` is
where CI actually catches it. The live path a model would drive is deliberately **not built** —
the prompt and reply parser are exported and tested, but nothing here spends a token.

**The recorded gap.** Two requirement classes are unrepresentable in `Intent` — a **door width**
(no width vocabulary at all) and a **plan-wide per-room bound** ("no room may exceed 5 m²",
`Intent` carries per-concept bands only). For those the requirement was never in the contract to
be weakened; it was absent by construction, so `validateIntent` **passes** the laundered plan and
only the fidelity check catches it. Two corpus entries are marked `intentBlind` and assert exactly
that, so the blindness is a test, not a claim.

> **Contamination.** `corpus-fidelity.json` and `fidelity-plans/` are holdout material on the same
> terms as the 26 briefs — private forever, never published. `test/dataset.test.ts` enforces
> disjointness for both corpora. `dataset/dedup.ts`'s `loadHoldout` is deliberately *not* extended:
> it decides what the generator rejects, and widening it would change the bytes a given seed
> reproduces, breaking the published dataset's seed-`20260712` reproducibility claim.

Calibrated L0 baseline (`gpt-5.5-2026-04-23`, seed `20260711`, 26 briefs, judge v2,
**re-measured 2026-07-12 under the post-v1.15.0 author prompt**): **valid 23/26 (88%) ·
intent 14/26 (54%) · sound 3/26 (12%)**. Same run's `--l1` overlay: **intent 18/26 (69%,
ΔL0→L1 +4) · sound 7/26 (+4)**, 8 briefs healed / 1 regressed by 41 repair moves. The L0
numbers live in `live-baseline.json`; the L1 numbers are recorded there as reference only
(the baseline and every delta against it are L0).

> **Prompt-drift history.** v1.15.0's metric-unit-suffix feature added one line to
> `spec.llm.md` (the author prompt), so the original 2026-07-11 baseline (valid 25 · intent 13
> · sound 4, pre-suffix prompt) was re-measured the next day under the current prompt — same
> judge, same model, same seed. Movement (−2 valid / +1 intent / −1 sound) is within run noise
> at n=26: the spec drift did not materially move the numbers, intent stayed inside the
> predicted 45–60% band, L1 intent was identical (18/26), and all 8 area assertions passed
> again (Gate G2's residual-0 verdict re-confirmed). Any future language-surface change to
> `spec.llm.md` re-opens this question and needs the same owner-approved re-measurement.

## How to run

```bash
npm run eval        # offline: score the committed goldens (writes eval/results.md)
npm run eval:ci     # same command — the CI regression gate (no API key; exit 1 on regression)
npm run eval:fidelity   # offline: the constraint-laundering slice (writes eval/fidelity-results.md)
npm run eval:live -- --yes [--max N] [--budget <n>tok|<n>usd] [--l1]   # live, paid, guarded
npm run eval:g1 -- --yes [--max N]    # Gate G1: generate intent JSONs from briefs (paid, guarded; or the "Eval (G1 intent generation)" workflow)
npm run eval:l2 -- --yes …   # T3 harness — DO NOT RUN: the live experiment is permanently declined (owner decision 2026-07-12)
```

- **Offline** (`run.ts` default) compiles → lints → describes each committed golden and scores it.
  It guards **authorability regressions**: if a language change breaks a plan a model already wrote,
  the eval fails. No network, no key. `--l1` is rejected offline (there is no model source to heal).
- **Live** asks a model to author each plan. It is **guarded**: without `--yes` (or
  `ARCHLANG_EVAL_CONFIRM=1`) it prints the plan (provider, model, brief count) and exits `3` **without
  calling any API**. `--max <n>` caps briefs; `--budget <n>tok|<n>usd` is a cumulative-usage circuit
  breaker (the unit suffix is required; a skipped brief is excluded from every denominator); `--l1`
  adds the deterministic overlay. Output goes to `eval/results.live.md` (git-ignored, ephemeral — the
  numbers move with the model and the day) with a "Delta vs baseline" section when
  `live-baseline.json` is present.

**In practice, run the live eval from GitHub Actions** ("Eval (live)" `workflow_dispatch`,
`.github/workflows/eval-live.yml`): `OPENAI_API_KEY` lives in Actions secrets, not on any dev
machine. It defaults to OpenAI, defaults `--max 26` and `--l1 true`, and skips (green, not failed)
when the secret is absent. Provider resolution: explicit `ARCHLANG_EVAL_PROVIDER`, else OpenAI when
only its key is present, else Anthropic.

## Judge v2 semantics (`assertions.ts`)

A brief's `expect` block compiles to a flat list of **predicates**, each checked against the plan's
`describe()` facts (the same facts an agent verifies against). Six kinds, deliberately a shallow
boundary — and since v1.14 T4 the implementation **lives in `src/intent.ts`** (`assertions.ts` /
`synonyms.ts` are re-export shims; `judge-fixture.json` + `test/eval-fixture.test.ts` pin that the
lift changed no corpus judgment, which is why `JUDGE_VERSION` stayed `"2"`). The production channel
also checks a seventh kind (`room-windows`) that no corpus entry uses:

| Predicate | Gates? | Rule |
| --- | --- | --- |
| `room-count` | **yes** | Policy B: exact, or `+1` **only** when the surplus room is pure circulation (see rubric §1). |
| `room-exists` | **yes** | Concept present, `min`..`max` count, greedy one-room-one-concept assignment. |
| `room-area` | **yes** | Per-room area band, over the rooms that concept was *credited with*. |
| `total-area` | **yes** | Total floor area within the brief's stated band. |
| `adjacent` | no (subscore) | Required-edge subset: every licensed interior-door edge present; extras never penalized. |
| `reachable` | no (subscore) | Every room reachable from a modeled entrance. |

Gating predicates are conjunctive — they decide `semanticPass`. `adjacent`/`reachable` **score but
never fail** a plan in Tier 1: one-shot topology is what v1.13's *loop* tools address, not one-shot
generation. (The T4 hook that would have promoted them to gating required T3's measurement;
with the live experiment permanently declined, they stay advisory permanently.)

- **Area is brief-grounded.** A band is asserted **only where the brief states a number** (±10–15%
  around it); each band carries a `source` quote so a failure cites what licensed the number.
  Qualitative size words ("compact", "generous") carry no cap — inventing one would measure the
  oracle's guesswork, not the plan (rubric §3).
- **Synonym/concept matching** (`synonyms.ts`) resolves a brief concept to produced rooms in order:
  normalized **label** (token-bounded whole-word, so "hall" matches "Entrance Hall" but not
  "Hallmark") → **`room_type`** → **`uses[]`**. Label wins so a specifically-labelled room is not
  miscounted by a broad type. Assignment is **one-room-one-concept**: a single "WC" room clears
  `bathroom` *or* `wc`, not both (greedy, corpus order).
- **Subscores column legend:** `R`ooms · `L`abels · `A`rea · `Adj`acency, e.g. `R1 L0.67 A– Adj1`.
  A `–` means the dimension is unasserted (`null`), not a failure — `rooms`/`labels` default to a
  full score when the brief pins neither, `area`/`adjacency` stay `null`.

## Versioning discipline

Three pinned versions stamp every result: `JUDGE_VERSION` (`assertions.ts`, currently `"2"`),
`SYNONYMS_VERSION` (`synonyms.ts`, currently `1`), and the rubric version (`rubric.md`, currently
`1`). Tests pin the first two; `live-baseline.json` carries a `judge` field.

**The iron rule: never compare rates across a judge (or synonyms) change.** A judge change
re-defines what "pass"/"sound" *mean*, so a delta straddling one compares two different measurements.
`renderDelta` prints a loud non-comparability warning when `base.judge !== JUDGE_VERSION`. The
judge-v1 → v2 recalibration is the canonical example: intent 9% → 50%, **zero model change** — a
measurement of the ruler, not the model. Judge-v1 numbers are kept only as history. A frozen rubric
is never edited in place for a policy change; it is superseded by the next version, which bumps
`JUDGE_VERSION` in lockstep.

## Oracle isolation

`synonyms.ts` is the eval's **private** definition of what each brief asked for. It is never shown to
any model, never part of a system/user prompt, never imported by prompt-building code
(`systemPrompt`/`makeAuthor`). The model authors from the **brief + `spec.llm.md` only**; the `expect`
block, the synonym table, and the goldens exist solely on the scorer's side. If this vocabulary ever
leaked into a prompt, the eval would be measuring itself.

## Corpus & goldens

`corpus.json` is an array of entries; each pairs an NL prompt with a golden `.arch` and a
brief-grounded `expect` block:

```json
{
  "id": "studio-1br",
  "prompt": "Draw a one-bedroom studio apartment of about 42 m². …",
  "golden": "examples/studio.arch",
  "expect": {
    "rooms": 4,
    "roomsInclude": [{ "concept": "living-room" }, { "concept": "bedroom" },
                     { "concept": "hall" }, { "concept": "bathroom" }],
    "totalAreaM2": { "min": 37.8, "max": 46.2, "source": "brief: 'about 42 m²' ±10%" },
    "adjacency": { "requiredEdges": { "hall": ["bathroom"] },
                   "source": "brief: 'a bathroom off a small hall'" }
  }
}
```

The corpus is **26 briefs** (the original 22 plus a per-room-area `sized-*` slice so the area
dimension is no longer total-only). Every `expect` field must be **brief-derivable** — derived from
the prompt's words, not the golden's labels or geometry (three prompts were amended so every room
count is enumerable from the brief; see rubric §5's flag resolution). The goldens must **self-prove**:
`eval:ci` requires every golden to pass its gating checks *and* score a perfect (or `null`) subscore
on all four dimensions. Adding a brief = brief-derivable expectations + a golden that passes them + a
rubric row.

> **Contamination warning (roadmap T5 iron law).** These briefs and goldens are a **private
> holdout**, and they stay private **forever**. **Never publish them.** The public dataset now
> **exists** — HF `ChanMeng666/archlang-repair-trajectories`, generated independently by the
> `dataset/` generator (which imports only `../src/index.js`, never `eval/`) and
> double-deduplicated against this holdout (text Jaccard + 8-gram, and a structural `describe()`
> fingerprint). `test/dataset.test.ts` enforces that disjointness **permanently, in CI**. That
> enforcement does not relax the rule: this corpus is never published regardless — the moment it
> leaks into a public set, the holdout is burned and no honest number can ever be reported against
> it again.

## The fault-injection / L1 gate (`faults/`, `l1.ts`, `test/fault-injection.test.ts`)

Six fixtures in `faults/`, each an otherwise-sound plan carrying exactly one seeded defect (two for
`combined`); their headers document the fault, the code it raises, and how it heals:

| Fixture | Seeds | Healed by |
| --- | --- | --- |
| `off-wall-door` / `off-wall-window` / `off-wall-opening` | opening declared beyond the on-wall tolerance (`W_*_OFF_WALL`) | `arch fix` (span edit → attachment form) |
| `furniture-through-wall` | furniture straddling a partition (`W_FURNITURE_WALL_COLLISION`) | `arch repair` (geometric move) |
| `blocked-doorway` | furniture on a door's landing (`W_DOORWAY_BLOCKED`) | `arch repair` |
| `combined` | an off-wall door **and** a blocked doorway | `fix` then `repair` (exercises the ordering) |

For each fixture the test asserts four things: the fault is **present** before healing (guards against
a silently-healthy fixture), it **heals** into a plan that compiles with no errors and non-empty SVG
via the expected mechanism, the healed source is **physically clean** (no physical-soundness or
off-wall codes), and the pipeline is a **fixpoint** (a second pass is a byte no-op). A separate test
proves a lint-clean golden passes through untouched. `l1Pipeline` **mirrors `arch fix`'s fixpoint**
(`cmdFix`): bounded passes of machine-applicable fixes, rolling back any pass that raises the error
count, then one `repair` — the same pipeline the live `--l1` overlay uses.

## The G1 intent-faithfulness experiment (`g1/`)

Roadmap Gate G1, run 2026-07-12: can a model write the *intent contract itself* (an `Expect`-shaped
JSON, lowered by `compileExpect`) faithfully from the brief? **PASS — 154/157 assertions (98.1%)
faithful, vs 93.4% per-assertion accuracy of direct `.arch` generation** (one-tailed z = 2.08,
p = .019; caveat: not resolvable against the valid-only control variant). The generation prompt is
oracle-isolated (never sees `expect`/synonyms/goldens — `test/g1.test.ts` enforces it); grading was
double-blind (opus subagents + an independently pre-registered second rater, human adjudication of
disagreements). This clears T4 (`src/intent.ts` + `arch validate --intent`). Full record:
`g1/report.md`; regenerate the control number with `npx tsx eval/g1/baseline-accuracy.ts`.

## Pointers

- **`rubric.md`** — the frozen human review rubric (version 1, calibrates judge v2). Read it for the
  *why* behind each policy: room-count policy B (§1), the label-match boundary and one-room-one-concept
  (§2), qualitative-size non-assertion (§3), adjacency required-edge subset semantics (§4), and the
  per-brief review sheet (§5). A frozen rubric predates the grades (SWE-bench Verified discipline).
  **§7 is an append-only appendix, not an amendment** — it documents the fidelity slice's four
  policies (F1 hard bounds only, F2 worst-item/empty-scope, F3 the infeasible-brief scoring rule,
  F4 derived-not-asserted infeasibility) as a *separate instrument*; §1–§6 and the rubric version
  are untouched.
- **`docs/research/`** — the round-2 research report and roadmap that motivated rebuilding the judge
  (why the 9% number was ~55–65% measurement artifact, and the T3/T4/T5 open questions).
- **Standing harness lessons** (in `AGENTS.md` gotchas): reasoning models spend thinking tokens out
  of the completion cap (use 16384, both providers, or a bogus low baseline results); and never
  compare rates across a judge change.
