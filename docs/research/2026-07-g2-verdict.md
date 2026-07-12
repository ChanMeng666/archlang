# Gate G2 — residual area-related failures: **CLOSED (residual = 0)**, T6 sugar parked

**Date:** 2026-07-12 · **Roadmap:** [`2026-07-roadmap-proposal.md`](./2026-07-roadmap-proposal.md)
Tranche 6 / Gate G2 (deep-dive H5 final verdict: per-room area sizing demoted to a *gated
drivability candidate*, scope set by the measured residual) · **Data:** the frozen calibrated
L0 baseline scorecard
[`eval/g1/baseline-run-29150982395.md`](../../eval/g1/baseline-run-29150982395.md)
(26 briefs incl. the T1 per-room-area `sized-*` slice, judge v2, `gpt-5.5-2026-04-23`,
seed 20260711) — the same run that set `eval/live-baseline.json`. Zero new API calls were
spent on this gate; it is a read-out of already-frozen data.

## The gate, as frozen in the roadmap

> **Gate G2:** after T1's re-run (with the per-room slice), size this tranche by the measured
> residual area-related failures. Residual ≈ 0 → ship only the assertion form (already in T4)
> and park the sugar. Residual > 0 → implement, in ADR-0005-legal forms only: [closed-form
> `width`+`area` / strip-interior `area` / `E_AREA_UNDERDETERMINED` / `E_AREA_CONFLICT`].

H5 had already flagged the structural risk this gate was built to resolve: the pre-T1 corpus
encoded intent only as *total*-area bands, so it was blind to the per-room benefit the field's
standard intent form (Peña space programs, per-room MAPE rewards, DStruct2Design) would
measure. T1 added the `sized-*` slice precisely so this number would mean something.

## The area-assertion inventory (post-T1 corpus)

Six of the 26 briefs carry area assertions — **8 assertions total**, spanning both kinds and
both band shapes:

| Brief | Assertion | Kind | Band shape | L0 area subscore |
| --- | --- | --- | --- | --- |
| `studio-1br` | total ∈ [37.8, 46.2] m² | total-area | two-sided (±10%) | **A1** |
| `small-office` | total ∈ [85, 115] m² | total-area | two-sided (±15%) | **A1** |
| `sized-kitchen-flat` | kitchen ∈ [10.8, 13.2] m² | per-room | two-sided (±10%) | **A1** |
| `sized-kitchen-flat` | bedroom ≥ 10 m² | per-room | min-only | (same row) |
| `sized-bedrooms` | each of 2 bedrooms ≥ 11 m² | per-room | min-only | **A1** |
| `sized-wet-room` | wet-room ≥ 5 m² | per-room | min-only | **A1** |
| `sized-office-mix` | meeting-room ∈ [17, 23] m² | per-room | two-sided (±15%) | **A1** |
| `sized-office-mix` | open-office ≥ 60 m² | per-room | min-only | (same row) |

## Result

| Quantity | Value |
| --- | --- |
| Area assertions failed at L0 | **0 / 8** |
| Briefs failing on an area dimension (`A0`/partial) | **0 / 6** |
| Area assertions blinded by invalid plans | **0** — the run's one invalid plan (`against-wall-bath`) carries no area assertion |
| Residual failures on the area-asserting briefs | 2, both **non-area**: `small-office` (concept label miss), `sized-bedrooms` (physical `W_FURNITURE_WALL_COLLISION`, healed at L1) |

Every area assertion in the calibrated baseline is satisfied at L0 — including both two-sided
per-room bands, which are the exact form the T6 sugar (`room Kitchen width 3000 area 12m2`)
exists to make easy. This is consistent with two independent prior readings: the deep-dive H2
dual audit (all 13 judge-v1 "area failures" dissolved as golden-derived-band artifacts; the
residuals on those briefs were room-count/physical, orthogonal to area) and Gate G1 (the
areas/adjacency assertions in generated intents were 100% faithful — number transcription and
band arithmetic are not a failure class on either side of the channel).

**Verdict: residual = 0 → per the gate as written, ship only the assertion form — which T4
already shipped (`roomsInclude[].areaM2` / `totalAreaM2` in `src/intent.ts`, gating codes
`E_INTENT_ROOM_AREA` / `E_INTENT_TOTAL_AREA`) — and park the T6 syntax sugar.** No area
syntax is implemented; no `area` token enters the grammar.

## Honest caveats (what this number does and does not say)

1. **n is small.** 8 assertions across 6 briefs, one model, one seed. The gate asked "is the
   residual ≈ 0 on the calibrated corpus", not "can any model always hit an area band"; this
   read-out answers exactly the former.
2. **Four of the six per-room assertions are min-only** (open-top bands, the more forgiving
   shape). The two two-sided per-room bands both passed, but a corpus richer in tight
   two-sided per-room bands would stress the dimension harder — that is written into the
   reversal triggers below rather than speculated on here.
3. **Passing a band is not evidence the model does w×h arithmetic.** FloorplanQA's mechanism
   argument (models are bad at geometric arithmetic) stands untouched; a model can land in a
   ±10–15% band by choosing round dimensions. What this gate measures is whether that
   weakness produces *deliverable failures on this corpus* — it does not. The sugar's benefit
   would be unmeasurable drivability polish here, which is precisely the investment class the
   roadmap demotes.
4. This gate reads the **L0** column only. L1's heals on these briefs were physical/lint,
   not area; no deterministic-tool credit is involved in the 0/8.

## Reversal triggers (frozen — a future session flips this without re-litigating)

Implement T6 (in the roadmap's four ADR-0005-legal forms, quoted below) if **any** of:

1. A future calibrated run **under the same judge version** shows ≥ 1 gating area-assertion
   failure (`E_INTENT_ROOM_AREA` / `E_INTENT_TOTAL_AREA` class) on a valid plan.
2. The corpus grows a harder area slice (e.g. tight two-sided per-room bands, or briefs
   requiring derived dimensions to hit a band) and the residual on that slice is > 0.
3. A real downstream consumer (ArchCanvas or another integrator) reports the
   area-arithmetic failure class in production authoring — an existence proof outweighing
   the corpus.

On trigger, the implementation is already specified — from the roadmap, verbatim:

> - Closed-form: `room Kitchen width 3000 area 12m2` → height derived, unique, pure
>   arithmetic (`fmt()`-routed, grid-snap applied to the derived dimension the same as to
>   literal sizes).
> - Strip-interior: `room Bedroom area 12m2` inside a `strip` (cross-axis fixed → unique).
> - Underdetermined (area alone, both dims free) → `E_AREA_UNDERDETERMINED`, never a choice.
> - Over-determined (`size` + `area` conflict) → `E_AREA_CONFLICT`.

A judge-version change does **not** by itself re-open the gate: rates are never compared
across a judge change (eval iron rule), so a re-opened G2 must be re-measured entirely under
the new judge, not diffed against this read-out.

## Scope notes

- The **unconditional** Track B items listed alongside T6 in the roadmap (`matchVocabulary`,
  `rankFixes`, optional unit suffixes, `describe().freedom`) are unaffected by this verdict —
  they were never gated on G2 and proceed independently.
- Unit suffixes (`3m` → mm) deliberately exclude `m2`: an area *unit* only enters the grammar
  if a reversal trigger fires and T6's area *semantics* enter with it.
- Nothing in this verdict concerns the model-loop question, which is permanently unanswered
  by owner decision (2026-07-12); no claim here depends on it.

## Files

Frozen scorecard: `eval/g1/baseline-run-29150982395.md` · baseline:
`eval/live-baseline.json` (judge `"2"`) · corpus inventory: `eval/corpus.json` (the six
area-asserting entries) · prior readings: `2026-07-ai-first-deep-dive.md` §4-H2/§4-H5,
`eval/g1/report.md`.
