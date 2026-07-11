# AI-First Deep Dive, Round 2 — Research Report

**Date:** 2026-07-11 · **Status:** research only, no code changed · **Companion:**
[`2026-07-roadmap-proposal.md`](./2026-07-roadmap-proposal.md) (the executable plan derived from this report)

> **Method.** Five parallel research tracks (academic sweep, open-source benchmarking against
> live AI-first languages, closed-loop eval methodology, intent formalization, training-data
> opportunity), followed by an adversarial design debate: five hypotheses, each argued by an
> independent proposer and refuter, judged on cited evidence, with a challenge round run to
> convergence (loop-until-dry). Four honest self-corrections occurred during the debate and are
> recorded below — they changed the conclusions materially. All claims cite an arXiv ID, URL, or
> repo file path. Full track reports and debate transcripts were produced in-session; this
> document is the self-contained synthesis.

---

## 1. Executive summary

This round was driven by one measured fact: on the live eval harness
(`gpt-5.5-2026-04-23`, one-shot, cold-start), ArchLang scores **valid 95% but intent 9% and
sound 9%** (v1.13, 22 briefs; pre-v1.13: 94% / 6% / 17% on 18 briefs). The research question was
how to raise intent within the determinism red lines (ADR 0005/0011). The answer, after
adversarial verification, restructures the problem:

1. **The 6–9% intent number is ~55–65% measurement artifact.** A full per-brief audit of
   `eval/results.live.md` against the brief texts (performed independently by two debate agents,
   who each corrected the other's over-counts) shows the conjunctive `semanticPass` judge fails
   plans for label wording the brief never required, and for floor-area bands derived from the
   goldens rather than from the briefs (most briefs state no area at all). After a
   brief-grounded judge fix, the true one-shot deliverable rate is an estimated **45–60%** —
   the exact number must come from re-running, not from this report.
2. **The residual true failures are dominated by physical violations** (6–7 briefs: furniture
   through walls, blocked doorways) **plus 1 compile failure and 0–3 room-count disputes** —
   *not* by area or labels. Physical violations are exactly what the existing deterministic
   `arch repair` fixes. This moves the capability agenda from "teach the model to hit areas"
   to "measure what the deterministic tool loop already delivers, then measure what a model
   feedback loop adds *net of resampling*."
3. **The v1.13 "drivability" thesis is currently a narrative, not a datum.** The eval calls the
   model once per brief; the self-correction loop (`fix`/`repair`/`suggest`/`-f txt`) is never
   exercised. The single most decision-relevant experiment ArchLang can run is a small
   closed-loop eval tier with an equal-budget resampling control (Olausson et al., ICLR 2024,
   arXiv:2306.09896) — designed so it *can falsify* the drivability claim.
4. **Two well-evidenced "do not invest" results:** grammar-constrained decoding (GBNF) does not
   improve and can *harm* semantic correctness (GAD, arXiv:2405.21047) — keep it as a fuse
   only; and fine-tuning/RLVR training is not the current move for a single-maintainer project
   whose users drive frontier models (though the compiler-as-reward-harness insight is real and
   is preserved as a documented option with explicit reversal triggers).
5. **One genuine language-direction result:** constraint-expressing syntax (taking geometric
   arithmetic away from the model, the same logic as v1.13's attachment syntax) is the right
   axis for future surface work; per-room area sizing is the leading candidate but is gated on
   re-measured evidence, because the judge fix dissolves the eval bucket that motivated it.

The resulting v1.14 plan (see the roadmap) is deliberately measurement-first: fix the ruler,
gate everything else on what the fixed ruler shows.

---

## 2. Ground truth this round started from

- Live A/B, same harness, `gpt-5.5-2026-04-23`, one-shot: pre-v1.13 **valid 17/18 (94%),
  intent 1/18 (6%), sound 3/18 (17%)**; v1.13 **valid 21/22 (95%), intent 2/22 (9%),
  sound 2/22 (9%)** on a harder 22-brief corpus (`eval/live-baseline.json`,
  `eval/results.live.md`).
- Judge structure (`eval/run.ts:77-116`): `semanticPass` = valid ∧ zero physical warnings ∧
  exact room count ∧ every label substring-matched ∧ total floor area inside a hard band —
  a one-vote-kills conjunction.
- Failure distribution across the 20 failing briefs (audited line by line): **area out of band
  ×13, label miss ×10, physical violation ×7, room count ×3, compile failure ×1** (failures
  overlap; a brief can carry several).
- Known harness lessons: reasoning models spend thinking tokens from `max_completion_tokens`
  (the 4096 cap produced a bogus baseline; OpenAI path fixed to 16384). **Two live harness bugs
  found this round:** the Anthropic path still has `max_tokens: 2048` (`eval/run.ts:183`), and
  no temperature/seed is pinned, so no number the harness produces is currently reproducible.
- Red lines all conclusions respect: `compile()` pure/synchronous/deterministic, zero runtime
  dependencies, errors returned not thrown, ADR 0005 (facts + advisory lint, the core never
  chooses among valid alternatives), ADR 0011 (fix = textual span edits / repair = geometric
  solving, a hard boundary).

---

## 3. Track findings

### Track A — Academic sweep (LLM × spatial/layout/DSL)

Highest-confidence anchors (each cross-checked against at least one other source):

| Finding | Evidence | Implication |
|---|---|---|
| RLVR post-training on floor plans works: SFT+GRPO with a verifier reward yields per-room area MAPE 10–12%, overlaps −65%, adjacency +56% | arXiv:2605.14117 (NeurIPS 2025), on RPLAN (80k plans), Llama-3.3-70B+LoRA | ArchLang's `describe`+`lint`+`checkGraph`+compile **is** a layered verifier — a ready-made reward harness. Whether to *use* it for training is a separate question (see H4). |
| Feeding coordinates to an LLM does not make it spatially competent — area/path computation is a capability boundary, and input format (JSON vs XML) barely matters | FloorplanQA, arXiv:2507.07644 | Don't ask the model to compute geometry; move computation into the compiler (v1.13 attachment syntax is this principle applied to *position*; *size* is the unfinished dimension). |
| Grammar-constrained decoding distorts the model's distribution and can harm semantic quality; grammar-in-context (prompting) is the high-leverage form | GAD, arXiv:2405.21047; Grammar Prompting, arXiv:2305.19234 | GBNF stays a fuse. `arch context`/`spec.llm.md` is the main weapon. Do not invest further in constrained decoding expecting intent gains. |
| Repair-loop gains are front-loaded: rounds 1–3 capture nearly all benefit (round 1 +66.7%, round 2 +22.2%, round 3 +11.5%, then <2%/round) | arXiv:2607.05197; corroborated by arXiv:2604.10508 (2 rounds capture 76–95%) | Loop-eval round cap = 2 has empirical grounding; closed-loop evals are affordable. |
| Compiler-diagnostic-driven repair is a proven paradigm (74% on real repos); structured machine-applicable fixes are stronger than prose feedback | RustAssistant (ICSE 2025) | ArchLang's catalogued `E_*`/`W_*` + `Diagnostic.fixes` (ADR 0011) is the infrastructure this paradigm needs — closer to the "expert feedback" end that Olausson showed is the bottleneck. |
| Intent-as-graph is the mature constraint carrier in the floor-plan literature | Graph2Plan, House-GAN++ (arXiv:2003.06988), Tell2Design, DStruct2Design (arXiv:2407.15723) | `validate --graph` consumes the right object; the intent channel should extend it, not invent a new concept. |
| New DSLs break the few-shot ceiling only with corpora; correct-by-construction synthesis + targeted repair data is the proven recipe | CraftRTL, arXiv:2409.12993; DSL survey, arXiv:2410.03981; ResPlan, arXiv:2508.14006 (17k vector plans) | Relevant only if/when training is on the table (H4 triggers). |

Honest negatives from Track A: pure SFT plateaus at feasibility (DStruct2Design); syntax-sugar
aesthetics do not move semantics (FloorplanQA's format-insensitivity); no external number is
directly comparable to ArchLang's intent metric (every paper uses different scoring) — which is
itself an argument for the decomposed, brief-grounded metrics adopted below.

### Track B — Open-source benchmarking (source-level, shallow clones)

- **KCL (KittyCAD/Zoo)** — nearest living AI-first CAD language. Verdict: ArchLang's
  architecture already wins the comparison (KCL's execution requires a remote geometry engine,
  async and non-deterministic, forcing four execution modes including a self-described
  undefined-behavior Mock; ArchLang's pure `compile()` is structurally superior). Worth
  borrowing: optional unit suffixes (`3m` → mm normalization, default unchanged) and a
  **degrees-of-freedom report** in `describe()` ("BEDROOM has no fixed area") — ADR-0005-legal
  intent help. KCL's AI layer lives server-side; nothing to copy there.
- **BAML** — the crown jewel is Schema-Aligned Parsing (two-phase scored coercion,
  `jsonish/`), but the honest verdict is that **SAP fixes syntax-approximation, not intent** —
  ArchLang's gap is not parse quality. Most transferable: `@check`/`@assert` constraint blocks
  (a validatable output spec — convergent with the intent channel) and closed-vocabulary fuzzy
  matching as a shared primitive (replace scattered `/bath|wc/i` regexes with a
  `matchVocabulary` that accepts `toilet→wc` and emits a fix-carrying `W_ALIAS_MATCH`).
- **Sketch-n-Sketch** — two generations of bidirectional-editing engines coexist in the repo;
  the general engine returns a *lazy list of candidate programs* (even `min/max` trifurcates)
  and needs an external solver server. Reject the general engine (essential ambiguity + solver
  dependency + collides with ADR 0005); keep the trace-based numeric subset (drag a dimension →
  a span edit via `applyFixes`, which `annotate` already half-enables).
- **CUE / Nickel** — for an intent checker running over already-computed `describe()` facts,
  Nickel's mental model (contract = predicate + blame label with a precise path and
  author-written message) is the right one; CUE's unification engine is a sledgehammer for a
  problem ArchLang doesn't have. Constraints must stay conjunctive-only (no disjunction, no
  defaults, no synthesis) or the checker slides toward choosing — the ADR 0005 boundary.
- **egg/egglog** — e-graphs solve equivalence saturation; `arch fix` needs disjoint error
  *correction* with a handful of candidates. Reject the machinery; lift the one concept —
  monotone cost-based extraction — as a pure `rankFixes` comparator (~20–40 LOC,
  applicability → cost → deterministic tiebreak).
- **tree-sitter** — rejected for the core (C11 runtime breaks zero-dependency; CST
  ERROR/MISSING nodes carry strictly less information than catalogued diagnostics with
  machine-applicable fixes; ADR 0001 already decided this and 13 releases validate it). A
  standalone grammar as a *distribution* artifact (GitHub/Zed/Neovim highlighting) is shelved
  as low priority — a distribution argument, not a parsing one.
- **DSPy / LMQL / guidance** — the generation-protocol patterns worth shipping natively:
  a structured input brief schema, a scoring function usable as a refine-loop reward, and a
  deterministic `--feedback` projection (ArchLang can derive the "advice" DSPy spends model
  calls on directly from structured diagnostics, for free). LMQL/guidance duplicate GBNF's
  role; nothing further.

Track B's headline, stated by its own report: *the intent gap is not a parsing/generation
problem — it is a "no machine-checkable intent target derived from the brief" problem.* Four
independent targets (BAML checks, DSPy rewards, CUE/Nickel validation, KCL's absence of any of
this) converge on the same missing artifact.

### Track C — Closed-loop eval methodology

External anchors: SWE-bench Verified (constraints must be derivable from the task description;
human triple-annotation removed ~2/3 of tasks), τ-bench `pass^k` (reliability decays
exponentially: 90% pass@1 → 57% at k=8), AgentLens "Lucky Pass" (arXiv:2605.12925 — the
evaluator itself is a model-accessible tool, so oracle isolation is a closed-loop-specific
cheating surface), and above all **Olausson et al. (ICLR 2024, arXiv:2306.09896)**: self-repair
gains must be claimed *only relative to equal-budget i.i.d. resampling*, are often small or
absent, and the bottleneck is feedback quality (human feedback lifted repair 33.3%→52.6%,
1.58×). The strategic consequence: ArchLang's loop should be positioned as **tool-grounded
repair** — its catalogued, span-bearing, fix-carrying diagnostics are closer to the expert end
of the feedback-quality axis, which is precisely the mechanism by which it *should* beat
resampling. That is a testable claim, and the eval is designed to test (and possibly refute) it.

Track C's dissection of `run.ts` also established: the current judge is an AND-gate
(AgentBench-style binary trajectory scoring, a recognized limitation), spec is resent uncached
per call, and the Anthropic `max_tokens` bug is live.

### Track D — Intent formalization

- The checker can only assert what `describe()` deterministically measures. The assertable
  set today: room count, per-room/total area, labels, uses/room_type, boundary adjacency,
  door connectivity (`access.edges`), entrances, reachability/depth, door widths, windows per
  room, furniture ownership, circulation (advisory). **Orientation is assertable** (window
  facing is pure geometry, a small `describe` addition); **daylight is not** (requires sky/
  climate simulation — breaks determinism and zero-dep; refuse honestly).
- The strongest counter-evidence to any NL→spec route: autoformalization accuracy is ~30% vs
  ~70% informal (survey, arXiv:2505.23486). The rebuttal that holds: an ArchLang intent spec is
  **shallow structured extraction, not temporal logic** — under constrained JSON decoding even
  small models get syntax right and only content accuracy remains (JSONSchemaBench,
  arXiv:2501.10868). The route stands *only if* predicates stay shallow: existence, count,
  range, undirected adjacency, reachability.
- The intent spec should align with what the field already uses: the architectural *space
  program* (Peña, «Problem Seeking»: room list + area table + adjacency matrix + bubble
  diagram) and the exact constraint fields of DStruct2Design/RPLAN — meaning LLMs have seen
  the shape.
- Recommended form (debate-refined): **independent intent JSON** (`intent.schema.json`,
  generated + drift-tested), *not* a new text DSL (over-engineering; LLMs are less trained on
  novel syntax than on JSON), *not* fields stuffed into `plan.schema.json` (category error:
  intent = goals/partial constraints; plan = exact drawing).
- The one falsification point, named by the track itself and made the pivot of the debate:
  **the spec's own error rate is unmeasured.** If the model mis-extracts intent, validation
  against a wrong target is worse than no validation (false green). This became H1's go/no-go
  gate.

### Track E — Training data / fine-tuning opportunity

- DSL corpora with real training uptake are at the **160–170k-pair scale** (RTLCoder/hdl2v for
  Verilog; Text-to-CadQuery/CADmium for CAD) and the metrics they lift are syntax-validity /
  exact-match — the dimension ArchLang already solved with context (94–95%). ArchLang has 22
  pairs: four orders of magnitude short, aimed at the wrong metric.
- No clean causal case exists of "publish a corpus → frontier models learn your niche
  language." For a low-star single-maintainer DSL the realistic probability of pre-training
  uptake is ~zero. (Scope note added after debate: this applies to **static SFT corpora**;
  it is *not* evidence against RLVR, which lifts intent/geometry/topology — see H4.)
- The one data asset that aligns with ArchLang's actual product claim (drivability): **repair
  trajectories** — (broken source + diagnostics → fixed source) triples, producible at zero
  marginal cost and with deterministic zero-noise labels from `arch fix`/`repair`/`diffPlans`.
  APR literature independently marks this signal as high-value (RustAssistant; compiler-
  feedback training surveys).
- **The contamination iron law:** the eval's 22 briefs/goldens are simultaneously the CI gate
  (`npm run eval:ci`). If they ship in a public dataset, the gate is dead. They must be frozen
  as a private holdout with embedded canaries; any public corpus is built separately and
  deduplicated against them (text + plan-structure similarity).

---

## 4. The adversarial debate — hypotheses, arguments, verdicts

Five hypotheses were distilled from the tracks. Each was argued by an independent proposer and
refuter (separate contexts, shared evidence base, mandatory citation discipline, mandated
attack axis: *"does this address the real bottleneck?"*). The judge's verdicts cite evidence,
not track seniority. A challenge round followed; it produced four honest self-corrections and
materially changed two verdicts. Convergence = a round with no new arguments.

### H1 — "v1.14's centerpiece is a machine-checkable intent-spec channel"

**Proposer's core:** `run.ts` already contains a *hidden* intent spec (hardcoded
rooms/labels/area checks); promoting it to a first-class artifact costs ~nothing extra, and one
spec then drives eval judging, the production loop target, and H3/H4's reward function —
"one spec, three returns." Self-assigned kill switch: a half-day blind experiment measuring
NL→intent-JSON faithfulness.

**Refuter's core (the decisive attack):** across all four failure buckets the *net capability
delta of a validator alone is zero* — a checker turns "drew it wrong" into "reported it wrong";
the loop that would convert reports into fixes is H3's claim, not H1's (attributing loop gains
to H1 is an accounting error under Olausson's equal-budget rule); and the spec-faithfulness
premise is unmeasured while autoformalization evidence (30%) points the wrong way. Cheaper
substitute: the eval-side judge rewrite alone captures the "objectify the 9%" win with zero new
public surface. Honest concession: validateIntent is ADR-0005-clean and the "one spec kills
eval↔prod skew" value is real.

**Verdict — conditionally adopted: instrument first, channel gated.**
1. The eval judge rewrite (PR1, shared with H2) is implemented *as* an intent-assertion data
   structure internally — the marginal cost of doing it structured is ~0 (both sides agree the
   comparisons must be written anyway).
2. A half-day go/no-go experiment measures NL→intent faithfulness on the 22 briefs,
   double-blind. **Challenge-round amendment (proposer's new point, adopted):** faithfulness is
   scored **per-assertion, continuously** — not whole-spec binary — because the loop consumes
   per-assertion targets (a 90%-correct spec is a 90%-useful target), and judging a channel
   built to eliminate one-vote-kills with a one-vote-kills ruler is self-contradictory. Gate:
   mean per-assertion faithfulness ≥ ~85% *and* significantly above the post-judge-fix
   per-assertion accuracy of direct `.arch` generation.
3. Pass → expose the CLI surface in v1.14 (`validate --intent`, deterministic `--feedback`
   projection, `score --brief` with both an `.ok` gate and a `satisfied/total` continuous
   projection — the unification of Track B's and Track D's designs). Fail → keep it
   eval-internal and say so.
4. Whether this is the v1.14 *headline* is decided by the experiment, not this report.

### H2 — "The 6–9% intent metric is mostly measurement artifact; fix the judge first"

The most empirical debate: **both sides independently re-audited all 20 failing briefs against
the brief texts**, and both self-corrected once.

**Proposer:** manual re-scoring under a partial-credit judge yields 45–59% (median ~50%);
label failures are golden-author naming conventions (brief says "two bathrooms", golden says
"Main Bathroom" — the check tests golden mimicry, not brief satisfaction).
**Refuter:** full audit split: ~8 artifact vs ~12 real; a uniform ±20% area tolerance would
need to be ±37% to absorb the claimed artifacts — i.e. it abolishes the check; the AND-gate is
a *feature* (it measures deliverable rate — a plan with furniture through a wall is not an 80%
plan, it is scrap), and Track C's own prescriptions are `pass^k` + equal-budget controls, not
partial credit.

**Challenge round (two rounds, both adding real content):**
- Proposer's new point, adopted: brief size language is a **three-tier spectrum** (hard numbers
  / qualitative words like *compact*/*generous* / none), and it honestly self-corrected two of
  its own "real failures" (accessible-flat, strip-attach-clean) whose briefs contain no usable
  area constraint.
- Refuter's counter, adopted: **tier 2 (qualitative caps) is structurally sourceless** — space
  standards publish *minimums*, never "compact ≤ X" caps, so any cap is either subjective or
  golden-derived (the very disease being cured), and the corpus contains zero instances of the
  failure mode it would catch (YAGNI). Tier 2 collapses into tier 3 by both sides'
  pre-commitments. It also caught a factual error: accessible-flat/bath's decisive failures are
  **room count** (5≠4, 4≠3), orthogonal to any area rule — and self-corrected its own
  over-count in the other direction (open-plan-loft, strip-attach-clean are artifacts).

**Verdict — adopted with the strong claim partially restored (final accounting):**
- Judge fix = the first merge (cheap, independent, blocks nothing — the "before everything"
  ordering claim is rejected; but it is a hard prerequisite of H3's L2 tier, because an
  uncalibrated ruler would record real loop gains as false negatives and fossilize a wrong
  narrative).
- Keep the conjunctive `semanticPass` gate (deliverable-rate semantics); tighten truth
  definitions instead of loosening tolerances: versioned label synonym/`room_type`/hyphen
  normalization (invisible to the model); **area checked only where the brief states a number**
  (band around the *brief's* number, ±10–15%, never golden-derived); briefs with qualitative
  or no size language drop the area check (documented hook: add a cap when a real oversized
  instance appears, calibrated on that instance). Room-count ±1 recorded in subscores; whether
  "added a hallway" counts as failure goes to the human corpus review rubric.
- Emit continuous subscores (rooms/labels/area/**adjacency** — a currently missing dimension
  that is ArchLang's differentiator) as a diagnostic projection alongside the gate.
- Harness: fix Anthropic `max_tokens` 2048→16384, pin temperature/seed, enable prompt caching,
  human corpus review with the rubric fixed *before* looking at outputs.
- **Final numbers: artifacts ~11–13, real failures ~7–9** (6–7 physical + 1 compile + 0–3
  room-count pending rubric). True one-shot deliverable rate ≈ 45–60%, **to be measured by the
  PR1 re-run, not asserted.** Residual true failures are dominated by physical violations —
  which redirects capability work toward the deterministic tool tier and room topology, away
  from area.

### H3 — "Build the loop-eval ladder (L0–L5) with equal-budget controls"

**Proposer:** the eval never exercises the loop the release notes celebrate; H1/H4/H5 all
hinge on an unmeasured premise ("does the loop pay?"); minimal credible delivery = three PRs
(judge fix → offline L1 tool gate → L2 + equal-budget pass@k control), with the honest
admission that the likely outcome is *"the drivability gain lives mostly in L1 deterministic
tools, not in model-driven loops"* — which the design must be able to reveal.
**Refuter:** the six-tier ladder outruns its own evidence source; with N=22, tier deltas of
~1 brief sit below the ±10.7% (1σ) statistical resolution floor — L3/L4/L5 are unmeasurable
regardless of engineering; full-matrix cost explodes (est. 4000–7000 API calls per full run);
and no failure-distribution datum calls for the upper tiers.

**Verdict — conditionally adopted, cut to three tiers.** Build **L0** (one-shot), **L1**
(deterministic `fix`+`repair`, offline, property-asserted on fault-injected goldens, in CI,
zero API), **L2** (diagnostic feedback, ≤2 rounds — arXiv:2607.05197/2604.10508 — with an
**equal-budget i.i.d. resampling control** per Olausson and `pass@n`/`pass^n`, n≥3 with σ).
Oracle isolation: the loop is fed diagnostics/suggestions/trimmed describe only — never
`expect`, goldens, or intent-graph ground truth (AgentLens). L3/L4/L5 are **evidence-gated**:
build only if L2 shows a net model-loop gain *and* the corpus grows enough to resolve
tier-sized deltas. H2 is a hard prerequisite of L2. Both sides converged on this shape; the
verdict records it as the **decisive experiment of the release** — the one artifact that can
confirm, refute, or bound the AGENTS.md drivability narrative, and that gates H1's channel,
H4's reversal triggers, and H5's area-sugar sizing.

### H4 — "Don't train; publish a repair-trajectory dataset + the reward-harness narrative"

**Proposer:** RLVR's numbers (2605.14117) are real but condition on an 80k-plan SFT stage;
the trained artifact (Llama-LoRA) is a model none of ArchLang's users run — the CLI/MCP
channels cannot consume weights; GPU/ops burden contradicts the project's cost structure; and
8 of Track A's own 10 conclusions execute without training. The dataset is the **option
premium**: verified pairs + a harness are exactly the asset that makes a future reversal cheap
if frontier providers ship managed RLVR-style fine-tuning.
**Refuter (partially adopted):** the proposer's use of Track E commits a **subject mismatch —
"SFT corpora lift validity" is not evidence against RLVR, which lifts intent/geometry/topology**
(adopted; Track E's conclusion is re-scoped accordingly in this report). The 2605.14117 gains
map bucket-for-bucket onto ArchLang's failure distribution (area MAPE ↔ 13 area misses;
adjacency ↔ labels; overlap ↔ physical) — recorded as the evidence base for the reversal
triggers. Conceded by the refuter: the "moat" argument for withholding the narrative was its
weakest point.

**Verdict — conditionally adopted.** No GRPO, no self-hosted LoRA, no mass synthetic
augmentation now. Publish the versioned HF dataset (repair-trajectory flagship split;
brief→golden secondary), with the contamination iron law (eval corpus frozen private + canary
strings + independent generation + dual dedup). Codifying the reward function **is** H1's
`score --brief` continuous projection — one artifact, not two projects; it ships under H1's
gate. The narrative question goes to the proposer: for an adoption-driven single-maintainer
open-source language, *any* model learning ArchLang is a win — publish the reward-harness
documentation and dataset card to recruit the community (precedents: RustAssistant shipped a
dataset; DStruct2Design shipped a benchmark). **Reversal triggers, recorded:** (1) frontier
managed fine-tuning API at acceptable cost — the accumulated verified pairs become directly
usable; (2) post-judge-fix intent still single-digit (true capability wall); (3) inverse — if
L2 shows no net loop gain, the dataset's drivability leg weakens. A gated small-scale pilot
(test RLVR transfer to NL→.arch) is parked behind H2/H3 results.

### H5 — "The do-not-invest list" (GBNF, tree-sitter, bidirectional editing, mass synthetic corpora, language surface)

**Four items upheld, with strengthened evidence:**
- **GBNF: no further investment** (fuse only). GAD's distribution-distortion result plus two
  refuter-side findings that closed the question: "reference already-declared names" is a
  context-*sensitive* constraint a CFG cannot express, and no observed failure is a
  reference-to-undeclared-name error. The cleanest rejection of the round.
- **tree-sitter: core rejection upheld** (ADR 0001 reaffirmed; C11 runtime vs zero-dep;
  CST error nodes < catalogued diagnostics with fixes). A standalone grammar as a distribution
  artifact: shelved, low priority.
- **General bidirectional editing: rejected** (Sketch-n-Sketch's two-engine history is the
  evidence); the numeric-drag → span-edit subset stays available via `annotate`+`applyFixes`.
- **Mass synthetic corpora: not in v1.14**; boundary management via H4's triggers.
- Recorded correction (proposer's find): the oft-quoted "attach syntax took valid 56%→94%" is
  a **harness artifact** — 56% was the token-starved measurement; the real v1.13 language
  contribution to validity is 94%→95% on a harder corpus. Guard against this misattribution.

**Fifth item overturned, then demoted — final form:** *"Decorative sugar is not the
priority; **constraint-expressing syntax** (taking geometric arithmetic away from the model) is
the right direction."* The refuter's counterexample — per-room area sizing
(`room Kitchen width 3000 area 12m2`, closed-form; strip-interior area, closed-form; area as
assertion) — was verified by the judge (no `area` token exists in `src/grammar/tokens.ts`;
`strip-attach-clean` failed *only* on total area) and is ADR-0005-legal in its determined
forms (`E_AREA_UNDERDETERMINED` for the underdetermined form). **But** the challenge round's
cross-verdict consistency argument prevailed: under H2's final area rule, all 13 area failures
dissolve as judge artifacts (the residual failures on those briefs are room-count, orthogonal
to area) — the eval bucket that motivated the sugar is empty. FloorplanQA's mechanism argument
(models cannot do w×h arithmetic) stands independently, but it is a **drivability** argument,
and the current corpus structurally cannot measure it: it encodes intent only as *total*-area
bands, whereas the field's standard intent form is **per-room** (Peña space programs, RLVR's
per-room MAPE reward, DStruct2Design's fields) — the refuter's final, adopted point. Per-room
area sizing is therefore a **gated drivability candidate**: the corpus review adds a
per-room-area brief slice; the PR1 re-run then measures the real residual; scope is set by
that number. The plan-level total-area assertion belongs to H1's intent channel; the feedback
loop belongs to H3. Neither is demoted.

### Debate-process notes (for methodological honesty)

- Four self-corrections occurred, all material: h2-pro (two briefs misclassified as real
  failures), h2-con (two briefs misclassified as artifacts — the opposite direction), h2-con
  (room-count/area orthogonality catch against h2-pro), h5-con (withdrew its own existence
  proof when H2's rule dissolved it). The two-sided audit design is what surfaced them.
- One agent death (session limit) occurred mid-challenge; a recovery agent resumed from the
  on-disk transcript and completed the round.
- Every verdict above cites the specific evidence that decided it; no verdict rests on a
  track's or agent's authority.

---

## 5. Answers to the research questions

**Q1 — How to raise intent restitution within the determinism red lines?** In three layers,
none of which is a solver. (1) *Measurement:* the brief-grounded judge fix alone moves the
reported number to an estimated 45–60% because most current "intent failures" are the ruler's.
(2) *Residual true failures:* physical violations (the dominant class) are already the
jurisdiction of deterministic `arch repair` (L1 — zero model involvement); room-count/topology
misses are what the gated intent channel's assertions and `--feedback` projection address.
(3) *Capability:* tool-grounded closed-loop repair — ArchLang's catalogued, span-bearing,
fix-carrying diagnostics sit near the expert end of the feedback-quality axis that Olausson
identified as the bottleneck; whether that beats equal-budget resampling is exactly what L2
measures. The language surface contributes via constraint-expressing syntax (area sizing),
gated on re-measured evidence.

**Q2 — How to design and measure closed-loop authorability?** A three-tier ladder: L0
(one-shot) / L1 (deterministic tools, offline, in CI — the "free" gains, kept out of the
model's ledger) / L2 (diagnostic feedback, ≤2 rounds, with equal-budget pass@k resampling
controls and pass^k reliability, n≥3 with variance). Oracle isolation is mandatory (the
evaluator is a model-accessible tool). Upper tiers are evidence-gated on both an L2 win and a
corpus large enough to resolve them. The design criterion is falsifiability: it must be able to
report "the loop does not beat resampling" — that result would redirect the roadmap and is
worth exactly as much as its opposite.

**Q3 — Which proven techniques has ArchLang not yet absorbed?** Adopt: brief-grounded
judging (SWE-bench Verified's derivability principle); equal-budget self-repair accounting
(Olausson); a machine-checkable intent artifact (the BAML-checks / DSPy-reward /
Nickel-contract convergence) — gated on measured spec faithfulness; repair-trajectory data
publication with contamination guards (APR literature); constraint-expressing syntax as the
language-surface axis; closed-vocabulary fuzzy matching as a shared primitive; `rankFixes`
cost-based ordering; optional unit suffixes and a degrees-of-freedom report (KCL). Explicitly
do not adopt: further GBNF investment, tree-sitter in the core, general bidirectional editing,
mass synthetic corpora, RLVR execution at current scale (kept as a documented, triggered
option).

---

## 6. Evidence index

**Papers (primary):** arXiv:2605.14117 (RLVR floor plans, NeurIPS 2025) · 2507.07644
(FloorplanQA) · 2405.21047 (GAD) · 2305.19234 (Grammar Prompting) · 2306.09896 (Olausson,
self-repair, ICLR 2024) · 2607.05197 + 2604.10508 (repair-round concavity) · RustAssistant
(ICSE 2025) · 2407.15723 (DStruct2Design) · 2003.06988 (House-GAN) · 2311.15941 (Tell2Design) ·
2508.14006 (ResPlan) · 2409.12993 (CraftRTL) · 2410.03981 (DSL learnability survey) ·
2505.23486 (autoformalization survey) · 2501.10868 (JSONSchemaBench) · 2605.12925 (AgentLens) ·
2411.12279 (HouseLLM) · τ-bench (2406.12045) · 2603.29231 (reliability reporting) ·
2506.23749 (APR survey) · Peña, «Problem Seeking» (architectural programming).

**Repos read at source level:** KittyCAD/modeling-app (`rust/kcl-lib`) · BoundaryML/baml
(`engine/baml-lib/jsonish`) · ravichugh/sketch-n-sketch · cue-lang/cue · tweag/nickel ·
egraphs-good/egg · stanfordnlp/dspy (+ tree-sitter via documentation and ADR 0001).

**Repo files load-bearing for verdicts:** `eval/run.ts` (judge structure, harness bugs) ·
`eval/results.live.md` (per-brief failure audit) · `eval/corpus.json` + `eval/goldens/`
(brief-text grounding) · `eval/live-baseline.json` (the 56%→94% harness-artifact correction) ·
`src/grammar/tokens.ts` (no `area` token) · `docs/adr/0005`, `0011` (red lines).
