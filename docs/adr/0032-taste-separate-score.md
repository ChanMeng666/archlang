# 32. Taste is a separate, sourced score that never gates

- **Status:** Accepted 2026-10-25 on §7 row 5's taste acceptance (the separation law holds with
  0 reversed and an empty ledger), with the caveats of plan-soundness D14 and D15
  (`docs/plans/plan-soundness/README.md` §3), built by PRs #244 (PS5.1a), #247 (PS5.1b), #248
  (PS5.2, the residential-advisory taste profiles) and #246 (PS5.3, taste as the last tier of
  `validate --json` `next`); D11 records the layer ruling
- **Date:** 2026-10 (proposed 2026-10-24, accepted 2026-10-25)
- **Relates to:** [ADR 0005](0005-no-invisible-architect.md) (facts and advisory lint, honestly
  named profiles; this ADR adds a second advisory channel beside lint),
  [ADR 0022](0022-exact-decisions-and-bounded-input.md) (exact decisions, counted budgets),
  [ADR 0011](0011-machine-applicable-fixes.md) (no machine fix is offered for taste)
- **Scope:** a new library function `taste()`, a new `--taste <profile>` mode of `arch score`, a
  required `layer` and `codes` on every lint rule. `compile()`, `describe()` and `lint()` output
  is unchanged.
- **Numbering:** 0030 and 0031 are reserved by the archlang-3d programme's drafts
  (`docs/plans/archlang-3d/`).

## Context

The plan-soundness programme (`docs/plans/plan-soundness/README.md`) splits what a plan can get
wrong into four layers: validity (lint), advisory code (lint profiles), intent (a brief) and
taste: the privacy gradient, day and night zoning, light, a living room at the heart, alignment
and proportion. Decision D2 of that programme puts taste in a separate score, but the programme's
README is deleted when the programme ends, and ADR 0005 allows "honestly named, caveated advisory
checks" without saying anything of a score, a cap or a second channel. Putting taste in `lint()`
would move the lint output of the whole corpus every time a threshold is tuned, and turn a
cultural preference into a warning an agent is told to clear.

The design record is `docs/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md`. It
measured that the defect corpus's clean twins are not lint-clean (28 of 70 still warn), so the
cap alone cannot separate good from bad plans, and that three starting criteria (R3, R7, R14)
already separate the corpus's circulation and daylight pairs.

## Decision

1. **Quality judgements that are profile- or culture-dependent go to `taste()` and `arch score
   --taste <profile>`, never to `lint()` or `describe()`.** Neither of those ever imports the
   taste module (`test/taste-invisible.test.ts` walks the import graph), and taste draws nothing.
2. **Only plain defects become `W_*` lint rules** (D2). A taste criterion graduates to lint only
   with a defect-corpus case, a clean twin, and the corpus `lint()` movement explained.
3. **The score is in [0, 1], computed in integers, never gating.** Each criterion's measured value
   is a rational of integers; ramps, means and the cap are decided in `BigInt` and rounded half up
   to an integer permyriad, printed by `fmtPermyriad` (`src/num-format.ts`); the JSON numbers are
   the parse of those strings. No float sits upstream of a pinned byte. The score never sets an
   exit code: `arch score --taste` exits 0 on a measurement, 2 on compile errors, 3 on bad usage.
4. **The validity cap reads layers, not a list.** The total is capped at 0.5 while default-ruleset
   `lint()` reports a warning from a rule whose layer is `validity`. Every lint rule declares
   `layer: "validity" | "drafting"` and the `codes` it may emit (`LintRule`, required fields, so
   the compiler refuses a rule without them); `lintWithCoverage()` returns the code → layer map
   beside the diagnostics, never inside them, and `lint()`'s output is unchanged. Drafting rules
   (the annotation family: `W_DIM_INSIDE`, `W_DIM_OVERLAP`, `W_OPENING_NOT_DIMENSIONED`, and the
   annotation codes later cards add) never cap; they are listed in `validity.drafting`.
   Compile-channel warnings (`W_ROOM_OVERLAP`, the `while` deprecations) never cap. Profile-only
   warnings (later cards) go to `advisory` and never cap. The taste module keeps no code list of
   its own (`test/lint-layers.test.ts` holds every code to exactly one rule).
5. **Coverage first.** A criterion that cannot judge says so (`assessable: false` and a reason)
   and is excluded from the total, never counted as a pass. `score` is `null` when nothing is
   assessable. `coverage.weight` reports how much of the profile was judged, so a plan hollowed
   out by relabelling shows it.
6. **Messages name rooms by label**, as lint's do; ids appear only in `evidence[].ids`. Advice
   codes are `A_*`, kept in `src/taste/advice.ts`, not in the error catalogue and not in `arch
   explain`.
7. **Bounded by counts.** One `TASTE_BUDGET` per call, charged before each criterion's work at
   its declared cost; a criterion that would exceed it reports `taste-budget`. The budget was set
   by measurement: 6,500,000 units, 1,054 times the largest corpus charge (6,163, `terrace-row`,
   with the eleven criteria of PS5.1; it was 2,000,000 against 1,559 with PS5.1a's three).
   Each cost bounds the work its criterion counts, held by test on the corpus and a probe plan.
8. **Every threshold cites a source**; a value remembered rather than read ([M]) is verified
   before it ships. Profiles are advisory names (ADR 0005). PS5.1a ships `generic` only.
9. **Calibration is deterministic over the repository's corpora**: the separation law
   (`test/taste-separation.test.ts`) reads the defect corpus and `test/taste-corpus/`; no paid
   eval, no live model run, no claim of a model-loop gain.

## Consequences

- An agent gets a second, slower-moving signal it may optimise without moving lint, and the
  corpus `lint()` digests do not move when a taste threshold is tuned.
- A taste criterion can be wrong without being harmful: it never blocks a build. Its errors show
  up as separation-law rows and pinned digest rows, each explained when it moves.
- Multi-dwelling plans (`terrace-row`) are read as one dwelling until declared dwellings exist
  (PS2.14); upper storeys are skipped by the depth-reading criteria until their entrance depths
  are reliable (PS0.3). Both are visible in `coverage.skipped`.
- A valid plan with poor taste can score below a capped invalid one: the cap bounds the invalid
  plan from above; it does not lift the valid one. PS5.1a's one ledger pair showed it (the fix that
  clears a lint warning narrowed a window). The ledger has been empty since PR #247, by dilution,
  not by a fix: R9 lifts that twin's total above 0.5 while R7 still prefers the bad case
  (0.7677 against 0.4606).
- `LintRule` gains two required fields, so a rule cannot be added without a layer.
- **An unknown profile throws.** `taste()` raises a `RangeError` for a profile name it does not
  know, where `lint()` ignores an unknown profile and runs the defaults. A taste report names its
  profile and takes its thresholds from it, so a silent fallback would report a score under a
  profile nobody asked for. The profile is the caller's argument, not user source, so the
  never-throws contract on source stands; `arch score --taste` checks the name first and exits 3
  with a did-you-mean.
- **Messages fall back to the room id today, against decision 6.** A room with no label is named
  by its id in `message` (`namesOf`, `src/taste/criteria.ts` line 98, the same `label ?? id`
  fallback as lint's `labelOf`). It is fixed with lint's under plan-soundness card PS2.29
  (id-free messages).
- **Measured at acceptance (2026-10-25,
  `docs/plans/plan-soundness/audits/2026-10-25-first-contact-rerun-row5.md`).** On the corpus the
  score separates as the separation law requires: 41 pairs, 37 ordered, 0 tied, 0 reversed (the
  ledger is empty), 4 unjudged. Its reach on first-contact defects is small and orthogonal to the
  audits: `score --taste generic` names 0 of the 57 defects of the 2026-10-18 plans, 3 of the 48
  of the 2026-10-24 plans plus one partial, and 2 of the 49 of the 2026-10-25 plans, all of them
  kitchens hidden by a `uses living` type (R6) or the night zone (R15); its most active criteria,
  R16 and R17, judge things no audit counted. Uptake was nil: 0 of 6 cold authors ran `score
  --taste` or `validate`, because the spec and the author role did not teach the step. PR #250
  (PS7.4) put the loop into both. The 0 of 6 hits this ADR's reverse-if, but it is not yet
  assessed: the measuring dispatch prompt names only `compile|lint`, and the author role changed in
  PR #250. Plan-soundness D15 decides it with two arms on the same briefs, (A) the spec with the
  pre-#250 role text and (B) the current role, counting `score --taste` and `validate` calls;
  taste stays an author tool only if arm A shows calls, and otherwise is re-scoped as a reviewer's
  tool.
- **Measured 2026-10-26** (D15's two arms,
  `docs/plans/plan-soundness/audits/2026-10-26-first-contact-rerun-d15.md`). Twelve cold authors
  wrote the six briefs, six under each role text, from a spec that names `validate --json` and
  `score --taste generic` in its self-correction loop. Arm A (the pre-#250 role) made 0 `score
  --taste` and 0 `validate` calls in 65 CLI calls (27 `compile`, 37 `lint`, 1 `describe`). Arm B
  (the current role, whose loop names `validate` as step 3 and `score --taste` as step 5) made 0
  `score` and 1 `validate` in 77 (32 `compile`, 42 `lint`, 2 `describe`); two of its authors wrote,
  unprompted, that they had skipped `describe` and `score --taste`. So arm A shows no calls, the
  role text alone does not change that (arm B over arm A: +1 `validate`, +1 `describe`, 0 `score`), and this ADR's reverse-if is met. The dispatch prompt names
  `compile|lint` only and says to stop when it compiles, so the result measures that protocol, not
  an agent told to run the whole loop. Re-scoped by plan-soundness D20 (`docs/plans/plan-soundness/README.md`
  § 3): validity stays in `lint`; the taste score is read by the reviewer (the dispatching session,
  `validate --taste`, and the planned `preview --review`) and is no longer expected in a cold
  author's loop. The score's design is unchanged: 0 to 1, sourced, capped under a validity warning,
  never gating, `taste()` in the API. Only its audience changes. It comes back into the author loop
  if a re-measure whose prompt names the whole loop shows at least half of the cold authors running
  `score --taste` unprompted, or if a consumer is shown steering authors by the score.

*Reverse if:* agents measurably ignore a separate score (D2's own trigger).
