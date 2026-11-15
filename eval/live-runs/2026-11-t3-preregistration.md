# T3 pre-registration: diagnostic loop vs equal-budget resampling (the one run)

The owner ratified this run on 2026-11-15 ("同意开启 T3，仅此一次，按上面的边界执行"; RM-D45,
`docs/plans/product-roadmap/README.md` §6.15). The bounds are in `docs/agents/iron-laws.md`.
This file fixes the question, the protocol, the analysis and the exact wording of the verdict
**before any call is made**. It is committed before the run, and git history is the evidence
of when. Nothing below may be edited after the first billed call. A defect found later is
recorded as a dated note at the end of the result file, never fixed here.

## 1. Question

On the 26-brief public eval corpus (`eval/corpus.json`, a public regression fixture, not a
holdout), does the L2 diagnostic feedback loop (`eval/l2.ts` `runLoopArm`, ≤ 2 feedback
rounds) produce plans that meet the brief's intent more often than i.i.d. resampling of the
same one-shot prompt at the loop's measured token spend (`runControlArm`)?

The question is asked for each of two models, `claude-sonnet-5-5` and `claude-haiku-5-5`.

## 2. Fixed protocol

- **Code.** `eval/l2.ts` and `eval/l2-run.ts` as they stand at the commit the run records
  (`meta.git`). The run uses `main` after the clause-order relaxation (CO-1) merges. If CO-1
  has not merged by 2026-11-25, the run uses `main` as it is that day. Either way the record
  carries the commit and the sha256 of `spec.llm.md` and of the system prompt.
- **Judge.** Judge v2, synonyms and rubric as committed (`JUDGE_VERSION` unchanged).
- **Parameters, per model:** `--trials 3`, default `maxRounds` 2, `--concurrency 4`.
  - Budget breaker: `--budget 80usd` for Sonnet and `--budget 25usd` for Haiku. These are the
    harness's own over-estimating count. They are set so that the breaker should not trip.
- **Billing.** The Anthropic promotional credit, through the key mapped per process from
  `ANTHROPIC_API_KEY_PROMO`, exactly as in `eval/README.md` § "The one T3 run".
- **Order.** Haiku first, then Sonnet. Each model's invocation is one command.

## 3. What counts as "the run"

- A model's run is its first `eval:l2 -- --yes` invocation that makes at least one billed call.
- An invocation that stops before any billed call (preflight exit 3, or a request-shape 4xx on
  the first call) is not a run. It may be fixed and started again.
- A run that aborts part-way (crash, freeze, Ctrl-C) is not re-run. Its JSON record, whatever
  its `status`, is the record and is published as it stands. Briefs it did not complete count
  under the attrition rule (§ 5).
- There is no smoke run, no `--max` subset, and no second invocation for either model.

## 4. Primary outcome and decision rule

- **Unit.** One paired cell per (brief, trial). Each arm scores 1 if any of its outputs meets
  intent (`combineMetrics`, best-of, as implemented), else 0.
- **Per-brief difference.** For each complete brief b,
  d_b = mean over its 3 trials of (loop_intent − control_intent). The range is −1 … +1.
- **Statistic.** D = mean of d_b over complete briefs. This equals the harness's `net.intent`
  when no brief is excluded.
- **Test.** An exact two-sided sign test over the complete briefs with d_b ≠ 0 (a tied brief
  is dropped from the test, not from D).
  - k = the number of briefs with d_b > 0, among n non-tied briefs.
  - p = the two-sided binomial probability under Binomial(n, ½).
  - The p-values of the two models are Holm-adjusted together, family α = 0.05.
- **Verdict per model.** Exactly one of these three sentences is printed, and nothing stronger:
  - Holm-adjusted p < 0.05 and D > 0: "On this corpus and protocol, the loop met intent more
    often than equal-budget resampling for <model> (D = …, k/n = …, p_Holm = …)."
  - Holm-adjusted p < 0.05 and D < 0: "On this corpus and protocol, equal-budget resampling met
    intent more often than the loop for <model> (D = …, k/n = …, p_Holm = …)."
  - Otherwise: "On this corpus and protocol, no difference between the loop and equal-budget
    resampling was detected for <model> (D = …, k/n = …, p_Holm = …)."
- **Resolution, stated in advance.** With n = 26 non-tied briefs, the sign test needs at least
  19/26 in one direction for p < 0.05 before the Holm adjustment. A null verdict at this n is
  not evidence of no effect, and the result file says so.

## 5. Attrition

- A brief is **complete** when all 3 of its trials completed both arms. Partial and skipped
  briefs (`eval/l2-run.ts` statuses) are dropped from both arms. The comparison stays paired.
- The result file lists every dropped brief by id, with its reason (error, budget, abort).
- If more than 4 of the 26 briefs (> 15 %) are dropped for a model, that model's verdict is
  replaced by: "Inconclusive for <model>: <m> of 26 briefs were not completed." The Holm family
  then holds only the other model.

## 6. Secondary measures (reported, never decided on)

For each model and arm:
- valid and sound net deltas;
- pass@3 and pass^3 on intent;
- mean ± σ of the per-trial rates;
- the loop rounds actually used;
- the control sample counts;
- tokens and dollars, from both the harness count and the Console's promo balance;
- truncated replies (`max_tokens`).

Each of these is labelled "secondary, not pre-registered for a decision".

Exploratory: the share of loop-arm fixes that were clause-order or compile errors, against
lint-only issues. It is labelled exploratory.

## 7. Publication

- The result is published whatever it shows, in `eval/live-runs/2026-11-t3-result.md`. That file
  contains:
  - the two printed verdict sentences, word for word as § 4 defines them;
  - the § 6 tables;
  - the attrition list;
  - the run commands;
  - the commit and spec hashes;
  - the Console cost.
- The two JSON records are committed beside it under `eval/live-runs/t3/`, or attached to the
  result PR if they are too large for the repo.
- The analysis (§ 4–§ 6) is a small committed script that reads only those JSON records. It
  carries no randomness.
- That record is the only statement of the result. Any other claim, either way, needs an
  owner decision. Nothing in it generalises beyond this corpus, these two models, this commit
  and this protocol.
- Out of scope, whatever the result: a second run, other models, L3–L5, and promoting
  adjacency/reachability to gating.
