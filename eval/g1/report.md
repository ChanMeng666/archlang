# Gate G1 — NL→intent-JSON faithfulness: **PASS** (with one recorded sensitivity caveat)

**Date:** 2026-07-12 · **Roadmap:** `docs/research/2026-07-roadmap-proposal.md` Gate G1 (deep-dive
H1 verdict: "instrument first, channel gated") · **Generator:** `gpt-5.5-2026-04-23`, seed
20260711, 26 briefs, one call each (run
[29154585163](https://github.com/ChanMeng666/archlang/actions/runs/29154585163), 26/26 parsed,
36 671 tokens) · **Assertion unit:** each generated `Expect` lowered by `compileExpect` to
judge-v2 predicates — **157 assertions**.

## The gate, as frozen in the roadmap

> Mean per-assertion faithfulness ≥ ~85% **and** significantly above the calibrated
> per-assertion accuracy of direct `.arch` generation from T1's baseline.
> Pass → Tranche 4 ships. Fail → intent assertions remain eval-internal.

## Result

| Quantity | Value |
| --- | --- |
| Per-assertion faithfulness (adjudicated) | **154/157 = 98.1%** |
| Condition 1 (≥ ~85%) | **met**, by 13 points |
| Direct `.arch` per-assertion accuracy, all 26 briefs (primary control) | 155/166 = 93.4% (`baseline-accuracy.ts`) |
| Condition 2, primary: 98.1% vs 93.4% | **met** — one-tailed two-proportion z = 2.08, p = 0.019 |
| Sensitivity: control restricted to the 25 valid plans | 155/162 = 95.7% → z = 1.24, p = 0.11 — **not resolvable** at these n |

**Verdict: PASS.** Both conditions hold under the gate as written. The primary control includes
the baseline's one invalid plan (deliverable semantics — a plan that never rendered delivers none
of its assertions), which is also the symmetric accounting: the intent arm would likewise have
counted an unparseable intent JSON as all-failed, and none of the 26 were. The recorded caveat:
if the invalid plan is excluded from the control arm, the margin (98.1% vs 95.7%) is real in sign
but below statistical resolution at n≈160 per arm — the corpus is too small to resolve a
2.4-point gap. T4 should proceed knowing the faithfulness advantage is decisive against the
deliverable-semantics baseline and directionally consistent, but thin, against its
valid-only variant.

## The three unfaithful assertions (all over/under-derivations of room structure)

1. **`accessible-flat` A1** `rooms == 2` — both raters: "generous rooms" (plural) off the hall
   makes an exact count of 2 unsupportable (undercount).
2. **`open-plan-loft` A7** `kitchen ↔ living` direct edge — adjudicated: a kitchen–dining–living
   chain also satisfies "flow into one another"; the direct edge over-asserts.
3. **`strip-attach-clean` A1** `rooms == 4` — adjudicated: "a run of rooms across the top" in a
   flat implies a living space beyond the two bedrooms; exact 4 undercounts.

Pattern: every error is a **room-count/topology derivation** on a brief whose wording
under-determines the plan — the same brief class that judge v2's own corpus review flagged
(rubric §5). None are number-transcription, band-arithmetic, or concept-naming errors; the
areas/adjacency/reachability assertions were 100% faithful.

## Process (double-blind, amended — recorded honestly)

The roadmap called for human + independent-model raters. The user could not judge faithfulness
cold and asked for assistance, so: **rater A** = three blind `claude-opus-4-8` subagents (no repo
access, inline data only; `scores-model.json`, 156/157 faithful); **rater B** = `claude-fable-5`
(the session director), scored independently and archived **before** reading rater A's output
(`scores-fable.json`, 154/157). Both raters are model-family-independent of the gpt-5.5
generator. Inter-rater agreement 155/157 (98.7%), Cohen's κ = 0.50 (deflated by the 98%-faithful
base rate). The human ruled on the 2 disagreements with both reasonings shown side by side
(`scores-human.json`); both rulings went to rater B's side, so the final number equals rater B's,
with rater A's independent floor at 99.4% — the gate passes under **either** rater alone.

## Oracle isolation

The generator saw only the brief text plus the intent-JSON shape/discipline (band conventions
±10% for "about/~/bare N", min-only for "at least N", no bands from qualitative words). It never
saw the corpus `expect` blocks, the synonym table, or the goldens (`test/g1.test.ts` enforces
this structurally). Raters judged brief-vs-assertion only. One convention artifact surfaced:
briefs with "~N m²" get ±10% under the published convention where the eval's private oracle uses
±15% (`small-office`) — faithful to the convention, and exactly the kind of contract T4's
`intent.schema.json` must pin down in its field documentation.

## What this licenses

Per the roadmap: **Tranche 4 (the intent channel — `src/intent.ts`, `validateIntent`,
`arch validate --intent` / `score --brief`, `intent.schema.json`) is cleared to ship** in a
future session. Two design notes for T4 carried out of this measurement: (a) the failure class
to guard is room-count derivation on under-determined briefs — T4's schema docs should say
"assert a count only when the brief enumerates it"; (b) the band conventions must be normative
schema documentation, not prompt folklore.

## Files

`intents.json` (generated intents + predicates + usage) · `scores-model.json` (rater A) ·
`scores-fable.json` (rater B, pre-registered before reading A) · `scores-human.json`
(adjudication) · `baseline-run-29150982395.md` (frozen control-arm scorecard) ·
`baseline-accuracy.ts` (control-arm reconstruction, cross-checked against the scorecard's
failure notes).
