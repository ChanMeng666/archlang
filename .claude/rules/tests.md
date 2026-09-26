---
paths:
  - "test/**"
  - "vitest.config.ts"
  - "**/*.test.ts"
  - "**/e2e/**"
---

# Tests, goldens and guards

- Read a red golden's diff before updating it (`vitest -u`, `UPDATE_GOLDENS=1 vitest run
  test/visual.test.ts`, `ASCII_UPDATE=1 vitest run test/ascii.test.ts`), and only for a change you can
  justify byte by byte. Never re-bless a lockstep pin, hand-derived number or hardcoded digest.
- A test outside `vitest.config.ts`'s include globs never runs (`check:test-wiring`); `test/` is
  typechecked only by `npm run typecheck:all`.
- Guards derive what they check from the source of truth (parse the table, anchor on content), never
  retype a list. A missing optional dep skips visibly locally and fails under `CI`.
- Tag an e2e case `@prod` only if it purely navigates, reads and asserts. More: `docs/testing.md`.
