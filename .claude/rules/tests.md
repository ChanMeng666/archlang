---
paths:
  - "test/**"
  - "vitest.config.ts"
  - "**/*.test.ts"
  - "**/e2e/**"
---

# Tests, goldens and guards
- Read a red golden's diff before updating it (the owner's commands: `vitest -u`, `UPDATE_GOLDENS=1 vitest run
  test/visual.test.ts`, `ASCII_UPDATE=1 vitest run test/ascii.test.ts`), and only for a change you can
  justify byte by byte. Never re-bless a lockstep pin, hand-derived number or hardcoded digest.
- A test outside `vitest.config.ts`'s include globs never runs (`check:test-wiring`); `test/` is
  typechecked only by CI's `npm run typecheck:all`.
- Guards derive what they check from the source of truth (parse the table, anchor on content), never
  retype a list. A missing optional dep skips visibly locally and fails under `CI`.
- Tag an e2e case `@prod` only if it purely navigates, reads and asserts. More: `docs/testing.md`.

## Traps

- **A guard that skips when a dependency is absent can be dead with the dependency present.** A test resolving
  `pdfkit/package.json` hit `ERR_PACKAGE_PATH_NOT_EXPORTED`, took the "absent" branch everywhere, and passed locally while
  never reading the file (#433). Run such a test with `CI=true` before trusting it.
- **A test file must not read what another test file wrote.** CI runs `vitest --shard`, which assigns files by sorted
  hash, so a new file can move others into another shard, on another runner. Symptom: a red shard on a
  PR that touched neither file. Write to a `mkdtemp` directory.
- CodeQL `js/polynomial-redos` fires on regexes in `test/` too, and the `analyze` job gates: slice
  a block with `indexOf` rather than a lazy `[\s\S]*?` match over compiler output.
- **Under heavy machine load the visual, sheet and roof tests can time out.** Rerun the file alone
  before suspecting the code.
- **`test/reroll-findrun-oracle.test.ts` › "generated sources" is an unseeded property flake**: it
  asserts `> 0` suggestions over 60 fast-check runs with no `seed`, and about 0.5 % of runs (seeds
  124, 461, 524 of 640) offer none. A one-off red there is legitimately re-run; the fix is owed
  (seed it or assert across runs; `docs/backlog.md`).
- **`npx tsx test/keep-weak-law-gen.ts` needs a reason argument** and prints only a usage line without one, so a
  conflict in `test/keep-byte-identity-baseline.ts` stays unresolved if you do not read its output.
