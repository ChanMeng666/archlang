# v1.14 Roadmap Proposal — "Measure First, Then Believe"

**Date:** 2026-07-11 · **Status:** **T1 + T2 implemented 2026-07-11** (commits
`60f5a87`…`83dc0cc`); **Gate G1 PASSED 2026-07-12** (`eval/g1/report.md` — faithfulness
154/157 = 98.1% vs direct-generation 93.4%, z = 2.08 p = .019; T4 cleared, with a
valid-only-control sensitivity caveat recorded); **T3 harness implemented 2026-07-12;
the live experiment is PERMANENTLY DECLINED by owner decision (2026-07-12)** — the
loop-vs-resampling question is permanently unanswered (never claim a loop gain or its
absence; L3–L5 and T4's gating promotion are closed for good);
**T4 implemented 2026-07-12** (the intent channel — see the tranche's Status
line; released same day as `@chanmeng666/archlang@1.14.0` + `archlang-mcp@0.2.0`);
**Gate G2: CLOSED 2026-07-12 (residual area failures = 0/8 on the calibrated baseline —
[`2026-07-g2-verdict.md`](./2026-07-g2-verdict.md); T6's area-syntax sugar is PARKED with
frozen reversal triggers; only Track B's unconditional smalls proceed)**; **T5 implemented +
published 2026-07-13** (the repair-trajectory dataset — HF `ChanMeng666/archlang-repair-trajectories`,
CC0-1.0, repair 1200 + authoring 400 rows; generator `dataset/`, contamination CI guard
`test/dataset.test.ts`; repo tooling only, core unchanged at 1.15.0 — **every tranche in this
proposal is now resolved**) ·
**Evidence base:** [`2026-07-ai-first-deep-dive.md`](./2026-07-ai-first-deep-dive.md) — every
tranche below cites its verdicts (H1–H5) and the underlying sources. Written to be executable
by a fresh implementation session with no other context beyond `AGENTS.md`.

> **Implementation status (2026-07-11).** Tranches 1 and 2 — the measurement foundation — shipped
> to `main` (commits `60f5a87`…`83dc0cc`): judge v2 (the intent-assertion scoring core +
> oracle-isolated synonym table), the frozen corpus-review rubric, corpus 22 → 26 with a per-room-area
> slice, the harness-integrity fixes, and the L1 fault-injection gate in CI. The **calibrated
> judge-v2 baseline** (26 briefs, `gpt-5.5-2026-04-23`, seed-pinned) came in at **intent 13/26 (50%)
> L0 · 18/26 (69%) L1** — **inside** this proposal's predicted 45–60% true-deliverable band, and the
> ~55–65% "measurement artifact" thesis (H2) held: the same model that scored 9% intent under
> judge v1 scores 50% under judge v2. **Gate G1 and Tranche 3 (the decisive L2-loop-vs-resampling
> experiment) remain the open next steps.** *(Since superseded — G1 passed and the T3 harness
> landed 2026-07-12, its live run deferred; see the Status header above.)* The tranche bodies
> below are the historical spec-as-written and are left unedited.

## The one-paragraph thesis

The 6–9% one-shot intent number that motivated this round is ~55–65% measurement artifact
(H2, dual-audit verified); the residual true failures are mostly physical violations that the
existing deterministic `arch repair` already targets; and the v1.13 "drivability" claim has
never been measured because the eval calls the model exactly once. v1.14 therefore ships
**measurement before capability**: fix the ruler (T1), measure the free deterministic-tool
gains (T2), run the one decisive experiment — does a diagnostic feedback loop beat
equal-budget resampling? (T3) — and gate every capability investment (intent CLI channel,
area syntax, dataset, RLVR) on what those numbers actually say. Every gate has a written
trigger so a future session can flip it without re-litigating.

## Ground rules (unchanged red lines)

`compile()` stays pure/synchronous/deterministic; core stays zero-dependency; errors returned,
never thrown, all catalogued; ADR 0005 (facts + advisory lint, the core never chooses among
valid alternatives); ADR 0011 (fix = span edits / repair = geometry, hard boundary). Nothing
below requires amending any ADR.

---

## Tranche 1 — The measurement foundation (PR1; do first, blocks nothing else)

**Status: ✅ implemented 2026-07-11** (`60f5a87`, `192f13a`, `13bd89b`, `0e63b51`, `abde90b`).

**Motivation:** H2 verdict (final accounting: ~11–13 of 20 failures are judge artifacts;
per-brief audit in the deep-dive §4-H2). Also two live harness bugs. Until this lands, no eval
number — including any future loop delta — is interpretable (a miscalibrated ruler records
real gains as false negatives; deep-dive §4-H3).

**Changes (all in `eval/`, no core surface):**
1. `eval/run.ts` `scoreSource` rewrite, implemented internally as an **intent-assertion data
   structure** (H1 verdict: "instrument first" — write the comparisons as data, not scattered
   `if`s, so Tranche 4 can lift them without a rewrite):
   - **Keep the conjunctive `semanticPass` gate** (deliverable-rate semantics). Loosen nothing;
     tighten truth definitions:
   - Labels: versioned synonym table + `room_type` category match (via `describe()`) +
     hyphen/case normalization. Table lives in `eval/`, is **never shown to the model**
     (oracle isolation), and is version-pinned.
   - Area: **three-tier brief-grounded rule, tiers 2 collapsed** — (a) brief states a number →
     band around *the brief's* number, ±10–15%, never golden-derived; (b) brief has only
     qualitative or no size language → **no area check** (documented hook: when a real
     "oversized compact" instance appears, add a cap calibrated on that instance —
     H2 challenge-round verdict: qualitative caps are structurally sourceless today).
   - Room count: exact match stays in the gate pending the corpus-review rubric; ±1 recorded
     in subscores.
   - Emit **continuous subscores** (rooms / labels / area / **adjacency** via
     `describe().access` — a currently missing dimension) as a diagnostic projection in
     `Score` (append-only interface).
2. Harness integrity: Anthropic path `max_tokens: 2048 → 16384` (`eval/run.ts:183`); pin
   temperature/seed; enable prompt caching; `--budget` circuit breaker.
3. **Human corpus review** (~half a day): rubric written *before* looking at model outputs
   (SWE-bench Verified discipline); decides the room-count ±1 question ("is an added hallway a
   failure?"); results version-frozen. **Add a per-room-area brief slice** (H5 final verdict:
   the current corpus encodes intent only as total-area bands, which the field treats as the
   outlier form — Peña space programs, RLVR per-room MAPE, DStruct2Design are all per-room;
   without this slice, Gate G2 below is structurally blind to the area-syntax benefit).
4. Re-run `eval:ci` + one live run → the **calibrated baseline** (expected ~45–60% true
   deliverable rate; do not pre-commit to a number — measure it).

**Size:** ~200–300 LOC in `eval/` + half-day human review. **Risk:** grade inflation — bounded
by keeping the gate conjunctive and every relaxation brief-derivable.

## Tranche 2 — L1: the deterministic-tool gate, offline, in CI (PR2)

**Status: ✅ implemented 2026-07-11** (`1cbfd8b`, `7bfc99c`, `9da334d`; core purity fix `51a47ee`).

**Motivation:** H3 verdict. The "free" gains of `arch fix` + `arch repair` (which target the
physical-violation bucket — the dominant *true* failure class after T1) must be measured
separately from any model loop, or they will be mis-credited to it. Zero API cost, so it
belongs in CI next to `eval:ci`.

**Changes:** fault-injection fixtures (goldens with known injected defects: off-wall opening,
furniture through wall, blocked doorway) → run `arch fix` then `arch repair` → property
assertions: result compiles valid and physical-clean, and the pipeline is idempotent.
Report ΔL0→L1 on the live corpus as the "deterministic dividend."

**Size:** ~100 LOC + fixtures. Pure determinism; no flakiness budget.

## Gate G1 — Intent-spec faithfulness go/no-go (half a day, zero core code)

**Status: ✅ PASSED 2026-07-12** — full record in `eval/g1/report.md` (154/157 = 98.1%
faithfulness, primary control 93.4%, z = 2.08 p = .019; the double-blind procedure was
amended — human as adjudicator of rater disagreements — and is recorded there honestly).

**Motivation:** H1 verdict — the single kill switch for the intent channel. Track D named the
spec's own error rate as the route's only falsification point; the debate refined the metric.

**Procedure:** for the 22 briefs, have a strong model write `intent.json` from each brief;
double-blind human/independent-model scoring of **per-assertion faithfulness** (not whole-spec
binary — a 90%-correct spec is a 90%-useful loop target; H1 challenge-round amendment).
**Gate:** mean per-assertion faithfulness ≥ ~85% *and* significantly above the calibrated
per-assertion accuracy of direct `.arch` generation from T1's baseline.
Pass → Tranche 4 ships. Fail → intent assertions remain eval-internal; record the result
honestly in AGENTS.md and skip T4.

## Tranche 3 — L2: the decisive experiment (PR3)

**Status: ⚙ harness implemented 2026-07-12** (`eval/l2.ts` + `eval/l2-run.ts` +
`eval-l2.yml`, offline-tested in CI, spec below followed incl. the equal-budget control
and oracle isolation); **the live run is PERMANENTLY DECLINED (owner decision,
2026-07-12)** — no L2 number will ever exist, the drivability question below stays
permanently unanswered, and the "Eval (L2 loop vs resampling)" workflow must not be
dispatched. The harness remains as the protocol's reference implementation.

**Motivation:** H3 verdict — the one artifact that can confirm, refute, or bound the
AGENTS.md drivability narrative, and that gates T4's headline status, T6's scope, and H4's
reversal triggers. Designed to be able to say "the loop does not pay."

**Changes (in `eval/`):**
- L2 protocol: generate → feed back `compile --json` diagnostics (and `arch fix --dry-run`
  output) → model revises, **≤2 rounds** (arXiv:2607.05197, 2604.10508).
- **Equal-budget control:** for every L2 run, an i.i.d. resampling arm with the same token
  budget (Olausson, arXiv:2306.09896, `k = np + np·nfr` accounting). The loop's delta is
  reported **net of** the resampling delta; if ≤ 0, print exactly that.
- Metrics: valid/intent/sound at each tier, `pass@n` and `pass^n` (n ≥ 3, report σ).
- Oracle isolation: the loop never sees `expect`, goldens, subscore targets, or intent-graph
  ground truth (AgentLens, arXiv:2605.12925).
- L3/L4/L5 (suggest-adoption, ASCII self-inspection, graph validation tiers): **not built** —
  evidence-gated on (a) L2 showing a net model-loop gain and (b) a corpus large enough to
  resolve tier-sized deltas (22 briefs have a ±10.7% 1σ floor; H3 refuter's resolution
  argument).

**Size:** ~250 LOC. **Cost guardrail:** one full L2+control run ≈ 22 briefs × (2 arms) ×
n=3 × ≤3 calls ≈ 400 calls — budgeted, cached, seed-pinned.

## Tranche 4 — The intent channel (CONDITIONAL on Gate G1)

**Status: ✅ implemented 2026-07-12** (commits `2a5321e`…; `src/intent.ts` +
`src/intent-concepts.ts` + `schemas/intent.schema.json` + `arch validate --intent`/`--feedback` +
`arch score --brief` + `describe()` window `facing`; the eval rewired onto the same implementation
with `JUDGE_VERSION` kept at "2" via the pinned byte-equivalence fixture; G1's two design notes
made normative in the schema's field docs). Adjacency/reachability stay advisory — their gating
promotion remains parked on T3's still-open loop-vs-resampling question.

**Motivation:** H1 verdict (conditionally adopted); Track B/D convergence (BAML `@check` /
DSPy reward / Nickel contract / Peña space program all point at the same artifact); H4 verdict
(the reward function **is** this projection — one artifact, two consumers).

**Changes (core + CLI, zero new runtime deps):**
- `src/intent.ts`: `validateIntent(source, intent) → IntentCheckResult { ok, violations[],
  satisfied, total, subscores }` — pure; reads `describe()` facts only; conjunctive assertions
  only (existence / count / range / undirected adjacency / reachability — the shallow-predicate
  boundary that keeps the NL→spec task in JSONSchemaBench territory, arXiv:2501.10868, rather
  than autoformalization territory, arXiv:2505.23486). Name resolution: id → label → uses →
  `room_type` (kills the label-wording failure class at the production layer too).
- `INTENT_JSON_SCHEMA` + `gen:intent-schema` → `schemas/intent.schema.json`, drift-tested
  (same discipline as `plan.schema.json`).
- Error codes: `E_INTENT_ROOM_MISSING / _AREA / _COUNT / _TOTAL_AREA / _NOT_ADJACENT /
  _NO_DOOR / _UNREACHABLE / _NO_WINDOW` (catalogued, spanless-but-pathed, Nickel-style blame
  messages naming the assertion and the measured fact).
- CLI: `arch validate --intent <intent.json>` (gate + exit codes) · `--feedback`
  (deterministic per-violation correction prompts derived from violations — the advice DSPy
  spends model calls on, for free) · `arch score --brief <intent.json> --json` (continuous
  `satisfied/total` — the refine-loop reward and, per H4, the codified reward harness).
- Eval rewires `semanticPass` to consume the same assertions (kills eval↔prod skew).
- Includes the plan-level **total-area assertion** (the piece of the area story that survives
  H5's demotion at full strength).
- Docs: `SKILL.md` loop gains one step; `llms-full.txt` regenerated.

**Size:** ~0.8–1.1 KLOC total (matching Track D's estimate), cuttable: core+schema+eval first
(~670 LOC), CLI surfaces second (~180 LOC), orientation assertions (`windows[].facing`,
~30 LOC in describe) third.

## Tranche 5 — The repair-trajectory dataset (after T1–T3)

**Status: ✅ implemented + published 2026-07-13.** Shipped as repo tooling (no core change):
the `dataset/` generator (`npm run dataset:gen`) + the permanent contamination CI guard
`test/dataset.test.ts`, published to HF as `ChanMeng666/archlang-repair-trajectories`
(CC0-1.0, repair 1200 + authoring 400 rows, deterministic from seed `20260712`,
`archlang_version` 1.15.0). The iron law below held: zero holdout hits in the full run; the
canary is documented openly in the card. Consistent with T3's permanent decline, the card
claims no feedback-loop gain (or its absence).

**Motivation:** H4 verdict; Track E + Track A independent convergence on repair trajectories
as the one data asset aligned with the drivability claim (RustAssistant, APR survey).

**Changes (no core code):**
- HF dataset, two splits: `repair` (flagship: broken source + diagnostics → fixed source +
  diff + `fix_kind` preserving the ADR 0011/0006 boundary + steps), `authoring` (brief +
  golden + `describe` facts + verification block). Every row self-verifying via the
  deterministic compiler; `archlang_version` pinned; CC0/CC-BY.
- **Contamination iron law:** the eval's 22 briefs/goldens are frozen as a private holdout —
  never published; canary strings embedded; the public corpus is generated independently and
  deduplicated (text + plan-structure) against the holdout. Getting this wrong voids the eval.
- Dataset card + reward-harness documentation (states plainly: this does not fix one-shot
  intent; it packages drivability; SFT-vs-RLVR evidence scoping per H4's subject-mismatch
  correction). Publishing the harness recruits community training — adoption is the win
  condition for an open-source language, not a moat to defend.

**Size:** a generation script + card; near-zero marginal cost by design.

## Tranche 6 — Language surface: constraint-expressing syntax (CONDITIONAL, scope set by T1 re-run)

**Status: ⛔ Gate G2 CLOSED 2026-07-12 — residual = 0, sugar parked.** The calibrated
baseline's read-out ([`2026-07-g2-verdict.md`](./2026-07-g2-verdict.md)): 0/8 area
assertions failed at L0 (incl. both two-sided per-room bands from T1's `sized-*` slice), so
per the gate below only the assertion form ships (T4 already shipped it) and the syntax
sugar is parked behind the verdict doc's frozen reversal triggers. The unconditional
Track B smalls in this tranche proceed independently.

**Motivation:** H5 final verdict — "decorative sugar is not the priority; constraint-expressing
syntax (taking geometric arithmetic away from the model) is the right direction." Per-room
area sizing is the lead candidate (FloorplanQA mechanism, arXiv:2507.07644; the size dimension
is v1.13's attachment logic left unfinished — verified: no `area` token exists in
`src/grammar/tokens.ts`). Demoted from headline because H2's judge fix dissolves the eval
bucket that motivated it; the drivability benefit is real but only measurable after T1's
per-room-area corpus slice exists.

**Gate G2:** after T1's re-run (with the per-room slice), size this tranche by the measured
residual area-related failures. Residual ≈ 0 → ship only the assertion form (already in T4)
and park the sugar. Residual > 0 → implement, in ADR-0005-legal forms only:
- Closed-form: `room Kitchen width 3000 area 12m2` → height derived, unique, pure arithmetic
  (`fmt()`-routed, grid-snap applied to the derived dimension the same as to literal sizes).
- Strip-interior: `room Bedroom area 12m2` inside a `strip` (cross-axis fixed → unique).
- Underdetermined (area alone, both dims free) → `E_AREA_UNDERDETERMINED`, never a choice.
- Over-determined (`size` + `area` conflict) → `E_AREA_CONFLICT`.

**Also in this tranche (small, unconditional, from Track B):** `matchVocabulary` shared
closed-vocabulary fuzzy matcher (replaces the scattered `/bath|wc/i` classifiers; emits
fix-carrying `W_ALIAS_MATCH`); `rankFixes` deterministic cost ordering for multi-candidate
fixes (~20–40 LOC, egg's extraction concept without e-graphs); optional unit suffixes
(`3m` → mm, default unchanged) and a `describe().freedom` degrees-of-freedom report (KCL).

## Explicitly not in v1.14 (verdicted, with reversal triggers)

| Item | Verdict | Reversal trigger |
|---|---|---|
| GBNF investment beyond a fuse | Rejected (GAD 2405.21047; context-sensitivity; not a failure bucket) | None foreseen |
| tree-sitter in the core | Rejected (ADR 0001 reaffirmed; zero-dep; diagnostics quality) | Distribution-only grammar may be revisited as a shelf item |
| General bidirectional editing | Rejected (SNS evidence: ambiguity, solver dependency, ADR 0005) | Numeric-drag span-edit subset is allowed any time |
| RLVR / fine-tuning execution | Not now (deployment mismatch, cost; H4) | (1) frontier managed fine-tuning API at acceptable cost — T5's verified pairs become ammunition; (2) post-T1 intent still single-digit; (3) L2 shows large net loop gains worth amplifying |
| Mass synthetic corpora | Not now (distribution narrowing; wrong metric) | Only alongside an RLVR reversal |
| L3/L4/L5 eval tiers | Not built | L2 net win + corpus ≫ 22 |

## Cut order (if time compresses)

T1 → T2 → G1 → T3 form the irreducible spine (~620 LOC + one day of human work total): they
produce the calibrated baseline, the deterministic dividend, and the loop-vs-resampling
verdict. T4 cuts to eval-internal assertions (already inside T1). T5 and T6 are independent
and deferrable. Nothing else should jump this queue — every capability claim downstream
depends on the spine's numbers.

## Verification

- After T1: `npm run eval:ci` green; one live run produces the calibrated baseline with
  subscores; the same brief scored twice yields identical results (seed pinned).
- After T2: CI includes the fault-injection gate; `ΔL0→L1` reported.
- After T3: the release notes can state, with numbers, whether tool-grounded repair beats
  equal-budget resampling — whichever way it comes out.
- After T4 (if gated in): `arch validate --intent` / `score --brief` round-trip on the 22
  eval intents; `validateIntent(golden, intent) === ok` self-check for every corpus entry;
  drift tests for `intent.schema.json`.
- After T6 (if gated in): golden snapshots for the closed-form area examples; determinism
  suite unchanged byte-for-byte for plans not using the new syntax.
- Throughout: `npm run typecheck && npm run lint && npm test` before every merge, per
  CONTRIBUTING.md.
