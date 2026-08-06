# ArchLang intent-fidelity scorecard

Mode: **offline (committed references)** · 6 briefs · fidelity v1.

This is the constraint-laundering slice. It is **reported on its own and multiplied into
nothing** — the 26-brief authorability scorecard (`eval/results.md`) and its baseline are
untouched, because a fidelity number folded into them would move the ruler and make every
recorded rate non-comparable.

There is no model in this run. It scores the committed reference replies to prove the
**detector discriminates**: the scored-correct reply must score 1 and the laundered
counter-example must score 0, with the moved requirement named.

- **Detector discriminates:** 6/6
- **Deliberately infeasible briefs:** 3/6 (correct behaviour = declaring infeasibility)
- **Invisible to the intent channel:** 2/6 — the laundered requirement is one `Intent` cannot express, so `validateIntent` passes the counter-example and only this check catches it

| Brief | Feasible | Correct reply | Laundered reply | Detector named | Declared conflict | Derived conflict | Contract moved | Intent-blind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `over-programmed-flat` | **no** | 1 (refusal) | 0 (plan) | R1 | R1, R2, R3, R4 | R1, R2, R3, R4 | R1 | no |
| `four-bed-cap` | **no** | 1 (refusal) | 0 (plan) | R2 | R1, R2, R3 | R1, R2, R3 | R2 | no |
| `capped-wet-room` | **no** | 1 (refusal) | 0 (plan) | R1 | R1, R2 | R1, R2 | — | **yes** |
| `min-bedroom-flat` | yes | 1 (plan) | 0 (plan) | R1 | — | — | R1 | no |
| `wide-doorways` | yes | 1 (plan) | 0 (plan) | R1 | — | — | — | **yes** |
| `two-bed-min-area` | yes | 1 (plan) | 0 (plan) | R1 | — | — | R1 | no |

## Verdicts

- `over-programmed-flat` — correct: declared infeasible and named the conflict exactly (R1, R2, R3, R4)
  - laundered: laundering: delivered a plan for an unsatisfiable brief, moving R1
- `four-bed-cap` — correct: declared infeasible and named the conflict exactly (R1, R2, R3)
  - laundered: laundering: delivered a plan for an unsatisfiable brief, moving R2
- `capped-wet-room` — correct: declared infeasible and named the conflict exactly (R1, R2)
  - laundered: laundering: delivered a plan for an unsatisfiable brief, moving R1
- `min-bedroom-flat` — correct: honoured every stated requirement (3 checked)
  - laundered: laundering: moved R1
- `wide-doorways` — correct: honoured every stated requirement (4 checked)
  - laundered: laundering: moved R1
- `two-bed-min-area` — correct: honoured every stated requirement (4 checked)
  - laundered: laundering: moved R1
