# T3 pre-registration: diagnostic loop vs equal-budget resampling (the one run)

The owner ratified this run on 2026-11-15 ("同意开启 T3，仅此一次，按上面的边界执行"; RM-D45,
`docs/plans/product-roadmap/README.md` §6.15). Its bounds are in `docs/agents/iron-laws.md`.

This file fixes, **before any call is made**:
- the question;
- the protocol;
- what counts as the run;
- the analysis;
- the exact wording of the verdict.

It is committed before the run, and git history is the evidence of when. Nothing below may be
edited after the first billed call. A defect found later goes into a dated note at the end of the
result file. It is never fixed here.

## 1. Question

Take the 26-brief public eval corpus (`eval/corpus.json`), which is a public regression fixture,
not a holdout. On it, does the L2 diagnostic feedback loop meet the brief's intent more often
than i.i.d. resampling of the same one-shot prompt at the loop's measured token spend?

- The loop is `eval/l2.ts` `runLoopArm`, with at most 2 feedback rounds.
- The resampling arm is `runControlArm`.
- The question is asked separately for `claude-sonnet-5-5` and for `claude-haiku-5-5`.

## 2. Fixed protocol

**Code.** `eval/l2.ts` and `eval/l2-run.ts` as they stand at the commit the run records
(`meta.git`).
- The run starts on `main` after the clause-order relaxation PR (branch `feat/clause-order-free`)
  merges. If that PR has not merged by 2026-11-25, the run starts on `main` as of that day.
- Both models run at the same `meta.git.head`, with `meta.git.dirty = false`.
- Sonnet starts within 24 h of Haiku's end, whatever Haiku's run showed.
- A model not run by 2026-11-30 00:00 UTC is "Inconclusive (not run)".

**Judge.** Judge v2, and the synonyms and rubric as committed. `JUDGE_VERSION` is unchanged.

**Billing.** The Anthropic promotional credit. The key is mapped per process from
`ANTHROPIC_API_KEY_PROMO`, as in `eval/README.md` § "The one T3 run".

**Parameters and commands.** Haiku runs first, then Sonnet, each as exactly this one command.
`MAX_ROUNDS` is 2. The two budgets are the harness's own over-estimating count, set so the
breaker should not trip.

```powershell
$env:ANTHROPIC_API_KEY = [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY_PROMO','User')
$env:ARCHLANG_EVAL_PROVIDER = 'anthropic'
$env:ARCHLANG_EVAL_MODEL = 'claude-haiku-5-5';  npm run eval:l2 -- --yes --trials 3 --concurrency 4 --budget 25usd
$env:ARCHLANG_EVAL_MODEL = 'claude-sonnet-5-5'; npm run eval:l2 -- --yes --trials 3 --concurrency 4 --budget 80usd
```

**Analysis script.** The analysis script (§ 7) is committed with a test on synthetic records
**before the first billed call**.

## 3. What counts as "the run"

- A model's run is its first invocation confirmed by `--yes` (or `ARCHLANG_EVAL_CONFIRM=1`)
  whose record has `ledger.calls ≥ 1`.
- An invocation that exits 3 (preflight) sends nothing. It is not a run.
- An invocation that sends requests but ends with `ledger.calls = 0` is kept as "attempt 0":
  - it is published under `eval/live-runs/t3/`;
  - it is restarted only on the owner's word.
- A run that aborts part-way (crash, freeze, Ctrl-C, credit exhausted) is not re-run. Its JSON
  record, whatever its `meta.status`, is the record. It is published as it stands and analysed
  under § 5.
- There is no smoke run, no `--max` subset and no second run.
- Nobody opens a record while its `meta.status` is `running`.

## 4. Primary outcome and decision rule

**Unit.** One paired cell per (brief, trial). In each cell, an arm scores 1 if any of its outputs
meets intent, otherwise 0. This is `combineMetrics`, best-of. The loop is credited for any of its
rounds. The analysis reads the stored `loopScore.intent` and `controlScore.intent` and never
re-scores a source.

**Complete brief.** A brief is complete when all 3 of its trials completed both arms. Let c be
the number of complete briefs.

**Sums.**
- s_b = Σ over the 3 trials of b of (loop_intent − control_intent). This is an integer in −3 … +3.
- S = Σ_b s_b over the complete briefs.
- D = S / (3c). D equals the record's `summary.net.intent` up to floating-point rounding, since
  both are over complete briefs only. The script asserts |D − net.intent| < 1e-9.

**Test.**
- A brief is tied when s_b = 0.
- n is the number of non-tied complete briefs.
- k is the number of those with s_b > 0.
- p = min(1, 2·P(X ≥ max(k, n − k))) with X ~ Binomial(n, ½). When n = 0, p = 1.

**Holm.** The family is always the two models. A model that is inconclusive or not run enters
with p = 1. Order the two raw p values. The smaller is multiplied by 2. The larger is taken as
the maximum of itself and that doubled value. Both are capped at 1.

**Verdict per model.** Exactly one of these sentences is printed, and nothing stronger:
- If p_Holm < 0.05 and k > n − k and S > 0: "On this corpus and protocol, the loop met intent
  more often than equal-budget resampling for <model> (D = …, k/n = …, c/26 complete,
  p_Holm = …)."
- If p_Holm < 0.05 and k < n − k and S < 0: "On this corpus and protocol, equal-budget
  resampling met intent more often than the loop for <model> (D = …, k/n = …, c/26 complete,
  p_Holm = …)."
- In every other case, including a disagreement between k and S: "On this corpus and protocol,
  no difference between the loop and equal-budget resampling was detected for <model> (D = …,
  k/n = …, c/26 complete, p_Holm = …)."
- If § 5 makes the model inconclusive, that sentence replaces all three.

**Resolution, stated in advance.**
- With Holm over two models, a model needs raw p < 0.025, which is 20/26 at n = 26 (p = 0.0094).
- If the other model's raw p is already below 0.025, 19/26 suffices (p = 0.029).
- n counts non-tied briefs only. At n ≤ 5 no directional verdict is possible. At n = 6 one is
  possible only as the second rejection.
- A "no difference detected" verdict at this resolution is not evidence of no effect, and the
  result file says so.

## 5. Attrition

**Unfinished record.** If a model's record has `meta.status` other than `complete`, that model
is "Inconclusive for <model>: the run did not complete (status <status>)", whatever the count.

**Complete record.**
- Partial and skipped briefs (the statuses in `eval/l2-run.ts`) are dropped from both arms, so
  the comparison stays paired.
- If more than 4 of the 26 briefs are dropped, the verdict is "Inconclusive for <model>: <m> of
  26 briefs were not completed".

**Listing.** The result file lists every dropped brief by id, with its reason: error, budget or
abort.

## 6. Secondary measures (reported, never decided on)

For each model and arm, the result file reports:
- the valid and sound net deltas;
- pass@3 and pass^3 on intent;
- the mean ± σ of the per-trial rates;
- the loop rounds actually used;
- the control sample counts;
- tokens, and dollars both by the harness count and by the Console's promo balance;
- the number of truncated replies (`max_tokens`).

Each is labelled "secondary, not pre-registered for a decision". Nothing else is reported as a
finding.

## 7. Analysis and publication

**The script.**
- It is committed before the first billed call, with a test on synthetic records.
- It reads only the two JSON records and contains no randomness.
- It prints the § 4 sentences, the § 5 list and the § 6 tables.

**The harness's own `.md` scorecard** prints its own verdict line. That scorecard is neither
published nor quoted.

**Publication.** The result is published whatever it shows, in
`eval/live-runs/2026-11-t3-result.md`. That file contains:
- the script's output;
- the run commands;
- the commit and the spec hashes;
- the Console cost.

The two JSON records (and any attempt 0) are always committed under `eval/live-runs/t3/`,
gzipped if they are large.

**Use of the record.**
- The records are never an input to `dataset/`.
- That record is the only statement of the result. Any other claim, either way, needs an owner
  decision.
- Nothing in it generalises beyond this corpus, these two models, this commit and this protocol.
- These stay out of scope whatever the result: a second run, other models, L3–L5, and promoting
  adjacency/reachability to gating.
