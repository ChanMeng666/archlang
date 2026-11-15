# Live fidelity run, 2026-11-15: four Claude models (RM-D46)

A dated, aggregate-only record of the owner-approved `npm run eval:fidelity-live` runs
(product-roadmap RM-D46): four models, k = 5 trials on each of the 6 briefs in
`eval/corpus-fidelity.json`, 30 calls per model, one process per model. Billed to the Anthropic
promotional credit. Raw replies are not published.

Reported on its own, as RM-D46 requires: **never compared** with `eval:ci`, the L0 baseline
(`eval/live-baseline.json`), the authorability runs in this directory, or the offline fidelity
scorecard. Fidelity v1; the prompt, parser, scoring and corpus are unchanged.

## Setup

- Provider `anthropic`, provider-default sampling (no temperature, so trials are samples, not
  copies); seeds 20260711 to 20260715 per brief.
- Commit `ab37b3ef` (before CO-1), working tree clean, all four runs `complete`, no failed or
  skipped call (30 scored per model).
- Run window 2026-11-15 10:02 to 10:27 UTC; per-model budget caps 2 / 6 / 12 / 22 usd (haiku /
  sonnet / opus / fable).

## Results (30 trials per model; Wilson 95 % in brackets)

| Model | Fidelity (score 1) | Satisfiable honoured | Infeasible declared, exact conflict | Laundered | Not-compiled zeros |
| --- | --- | --- | --- | --- | --- |
| `claude-haiku-5-5` | 28/30 (78-99 %) | 13/15 (62-97 %) | 15/15 (79-100 %) | 0/30 (0-12 %) | 2 |
| `claude-sonnet-5-5` | 24/30 (62-91 %) | 9/15 (35-81 %) | 15/15 (79-100 %) | 0/30 (0-12 %) | 6 |
| `claude-opus-5-5` | 30/30 (88-100 %) | 15/15 (79-100 %) | 15/15 (79-100 %) | 0/30 (0-12 %) | 0 |
| `claude-fable-5-2` | 30/30 (88-100 %) | 15/15 (79-100 %) | 15/15 (79-100 %) | 0/30 (0-12 %) | 0 |

- **Declared / laundered on the infeasible briefs** (`over-programmed-flat`, `four-bed-cap`,
  `capped-wet-room`; 15 trials per model): every model declared infeasibility and named exactly the
  conflict set in 15/15 trials. No compiling plan was delivered on an infeasible brief, so
  laundered is 0/15 for every model, and there were no false refusals, wrong conflicts or malformed
  replies.
- **Laundering overall:** 0/30 for every model, satisfiable 0/15 each. No stated number was moved by
  any compiling plan.
- **What the zeros were:** every zero is a satisfiable brief whose extracted plan did not compile
  (score 0 as *not-compiled*, which is not a laundering). Haiku: 1 on `min-bedroom-flat`, 1 on
  `two-bed-min-area`. Sonnet: 2 on `min-bedroom-flat`, 1 on `wide-doorways`, 3 on
  `two-bed-min-area`. Opus and Fable: none. The compile diagnostics are not tabulated here.
- **Stops:** all 120 calls ended with `end_turn`; none was truncated.

The six briefs are a small fixture: trials of one brief are not independent, so the intervals
understate the uncertainty about brief-level behaviour, and 30 calls per model separate no two
models with confidence. These runs preceded CO-1 (PR #790) and CO-2 (PR #809); they were not
repeated afterwards. No loop-gain claim follows from them.
