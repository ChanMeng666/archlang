---
paths:
  - "test/**"
  - "vitest.config.ts"
  - "**/*.test.ts"
  - "**/e2e/**"
---

# Tests, goldens and guards

Read `docs/testing.md` before adding a test or updating a pin/golden, and
`docs/agents/verification.md` for the review-before-bless rule. The `(Typecheck)` entry of
`docs/agents/gotchas.md` explains root-program type errors in workspace modules a test imports.
