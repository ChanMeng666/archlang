# ArchLang authorability scorecard

Mode: **offline** · 26 prompts · judge v2 · synonyms v1.

- **Valid (compiles):** 26/26 (100%)
- **Intent match (semantic):** 26/26 (100%)
- **Sound (lint-clean):** 8/26 (31%)

Subscores per row: **R**ooms · **L**abels · **A**rea · **Adj**acency (– = unasserted; adjacency/reachability score but never gate).

| Prompt | Result | Valid | Lint | Subscores | Notes |
| --- | --- | --- | --- | --- | --- |
| `studio-1br` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `two-bed-hall` | ⚠️ warns | yes | 2 | R1 L1 A– Adj1 | 2 lint warning(s) |
| `relational-studio` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `dims-auto-cottage` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `against-wall-bath` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `small-office` | ⚠️ warns | yes | 2 | R1 L1 A1 Adj– | 2 lint warning(s) |
| `core-and-shell` | ⚠️ warns | yes | 1 | R1 L1 A– Adj– | 1 lint warning(s) |
| `two-bath-flat` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `open-plan-loft` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `scripting-units` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `three-bed-2bath` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `galley-kitchen` | ⚠️ warns | yes | 1 | R1 L1 A– Adj– | 1 lint warning(s) |
| `l-shaped-flat` | ⚠️ warns | yes | 2 | R1 L1 A– Adj1 | 2 lint warning(s) |
| `accessible-flat` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `accessible-bath` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `compact-studio` | ⚠️ warns | yes | 2 | R1 L1 A– Adj1 | 2 lint warning(s) |
| `bungalow` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `reception-suite` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `strip-corridor` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `attach-openings` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `anchor-furniture` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `strip-attach-clean` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `sized-kitchen-flat` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `sized-bedrooms` | ⚠️ warns | yes | 2 | R1 L1 A1 Adj1 | 2 lint warning(s) |
| `sized-wet-room` | ⚠️ warns | yes | 2 | R1 L1 A1 Adj1 | 2 lint warning(s) |
| `sized-office-mix` | ⚠️ warns | yes | 5 | R1 L1 A1 Adj1 | 5 lint warning(s) |
