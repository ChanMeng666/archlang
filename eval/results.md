# ArchLang authorability scorecard

Mode: **offline** · 3 prompts.

- **Valid (compiles):** 3/3 (100%)
- **Intent match (semantic):** 3/3 (100%)
- **Sound (lint-clean):** 2/3 (67%)

| Prompt | Result | Valid | Lint | Notes |
| --- | --- | --- | --- | --- |
| `studio-1br` | ✅ pass | yes | 0 | — |
| `two-bedroom-flat` | ⚠️ warns | yes | 3 | 3 lint warning(s) |
| `small-office` | ✅ pass | yes | 0 | — |
