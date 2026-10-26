# ArchLang authorability scorecard

Mode: **offline** · 26 prompts · judge v2 · synonyms v1.

- **Valid (compiles):** 26/26 (100%)
- **Intent match (semantic):** 23/26 (88%)
- **Sound (lint-clean):** 4/26 (15%)

Subscores per row: **R**ooms · **L**abels · **A**rea · **Adj**acency (– = unasserted; adjacency/reachability score but never gate).

| Prompt | Result | Valid | Lint | Subscores | Notes |
| --- | --- | --- | --- | --- | --- |
| `studio-1br` | ✅ pass | yes | 0 | R1 L1 A1 Adj1 | — |
| `two-bed-hall` | ⚠️ warns | yes | 2 | R1 L1 A– Adj1 | 2 lint warning(s) |
| `relational-studio` | ⚠️ warns | yes | 3 | R1 L1 A– Adj1 | 3 lint warning(s) |
| `dims-auto-cottage` | ❌ fail | yes | 2 | R1 L1 A– Adj1 | physical: W_DOORWAY_BLOCKED — Doorway is blocked — the approach needs 300 mm clear on each side but "wc" leaves 250 mm (50 mm short). |
| `against-wall-bath` | ⚠️ warns | yes | 4 | R1 L1 A– Adj– | 4 lint warning(s) |
| `small-office` | ⚠️ warns | yes | 3 | R1 L1 A1 Adj– | 3 lint warning(s) |
| `core-and-shell` | ⚠️ warns | yes | 2 | R1 L1 A– Adj– | 2 lint warning(s) |
| `two-bath-flat` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `open-plan-loft` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `scripting-units` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `three-bed-2bath` | ⚠️ warns | yes | 8 | R1 L1 A– Adj1 | 8 lint warning(s) |
| `galley-kitchen` | ❌ fail | yes | 2 | R1 L1 A– Adj– | physical: W_DOORWAY_BLOCKED — Doorway is blocked — the approach needs 300 mm clear on each side but "basin" leaves 250 mm (50 mm short). |
| `l-shaped-flat` | ⚠️ warns | yes | 5 | R1 L1 A– Adj1 | 5 lint warning(s) |
| `accessible-flat` | ⚠️ warns | yes | 1 | R1 L1 A– Adj1 | 1 lint warning(s) |
| `accessible-bath` | ✅ pass | yes | 0 | R1 L1 A– Adj– | — |
| `compact-studio` | ❌ fail | yes | 5 | R1 L1 A– Adj1 | physical: W_DOORWAY_BLOCKED — The opening between "Studio Room" and "Kitchenette" is blocked — the approach needs 300 mm clear on each side but "kitchen_sink" leaves 250 mm (50 mm short). |
| `bungalow` | ⚠️ warns | yes | 4 | R1 L1 A– Adj1 | 4 lint warning(s) |
| `reception-suite` | ⚠️ warns | yes | 7 | R1 L1 A– Adj1 | 7 lint warning(s) |
| `strip-corridor` | ✅ pass | yes | 0 | R1 L1 A– Adj1 | — |
| `attach-openings` | ⚠️ warns | yes | 2 | R1 L1 A– Adj1 | 2 lint warning(s) |
| `anchor-furniture` | ⚠️ warns | yes | 2 | R1 L1 A– Adj– | 2 lint warning(s) |
| `strip-attach-clean` | ⚠️ warns | yes | 3 | R1 L1 A– Adj1 | 3 lint warning(s) |
| `sized-kitchen-flat` | ⚠️ warns | yes | 4 | R1 L1 A1 Adj1 | 4 lint warning(s) |
| `sized-bedrooms` | ⚠️ warns | yes | 4 | R1 L1 A1 Adj1 | 4 lint warning(s) |
| `sized-wet-room` | ⚠️ warns | yes | 4 | R1 L1 A1 Adj1 | 4 lint warning(s) |
| `sized-office-mix` | ⚠️ warns | yes | 6 | R1 L1 A1 Adj1 | 6 lint warning(s) |
