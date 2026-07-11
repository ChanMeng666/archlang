# ArchLang authorability scorecard

Mode: **offline** · 26 prompts · judge v2 · synonyms v1.

- **Valid (compiles):** 26/26 (100%)
- **Intent match (semantic):** 26/26 (100%)
- **Sound (lint-clean):** 25/26 (96%)

Subscores per row: **R**ooms · **L**abels · **A**rea · **Adj**acency (– = unasserted; adjacency/reachability score but never gate).

| Prompt | Result | Valid | Lint | Subscores | Notes |
| --- | --- | --- | --- | --- | --- |
| `studio-1br` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `two-bed-hall` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `relational-studio` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `dims-auto-cottage` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `against-wall-bath` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `small-office` | ✅ pass | yes | 0 | R1 L1 A1 Adj– | — |
| `core-and-shell` | ⚠️ warns | yes | 1 | R1 L1 A– Adj– | 1 lint warning(s) |
| `two-bath-flat` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `open-plan-loft` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `scripting-units` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `three-bed-2bath` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `galley-kitchen` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `l-shaped-flat` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `accessible-flat` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `accessible-bath` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `compact-studio` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `bungalow` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `reception-suite` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `strip-corridor` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `attach-openings` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `anchor-furniture` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `strip-attach-clean` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `sized-kitchen-flat` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `sized-bedrooms` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `sized-wet-room` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `sized-office-mix` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
