# CI throughput: options for the owner

Status: A, B, C, D live 2026-10-27 (B/C/D by PR #290). Every option changes a workflow or a repository setting,
and the owner decides which to take. Job map and per-job minutes: `docs/agents/commands.md` § CI.

## 1. What is measured

- `ci.yml` wall clock, the 15 runs up to 55d9d2fc (PRs and pushes): 24–60 min, median ≈ 43.
- Per job, run for 5b872984 (2026-10-26): Node 22 43.3, Docs site E2E 22.1, Node 18 20.5,
  Windows 18.7, Node 20 15.3, Playground E2E 11.4, Workspace builds 2.1, Benchmark 1.0.
- The long pole is one step: Node 22's `npm run test:coverage` (42.5–43.1 min in the three runs read;
  the uninstrumented `npm test` takes 15–20 min on Node 18/20). Coverage is report-only.
  `eval:ci` is not the cause: it runs on all three Linux Node legs and takes seconds.
- The E2E legs vary: their apt step "Install Chromium system deps" took 10 and 18 min in that run,
  under a minute in others.
- No `concurrency` group and no path filters in `ci.yml`; `main` has no branch protection;
  `allow_auto_merge`, `allow_update_branch` and `delete_branch_on_merge` are all false.
- Programme PRs are mostly records only (cards, handoff, audits, backlog, CHANGELOG).
- Measured 2026-10-27 (row-7 tranche 1, code PRs #296–#301; option D live, Node 22 no longer runs coverage on PRs):
  minutes per job on those PRs: Node 22 13.0–17.6, Node 20 15.3–20.1, Node 18 16.3–21.7, Windows 12.4–20.8,
  Docs E2E 3.3–10.3, Playground E2E 1.5–10.5, Workspace builds 1.7–2.1, Benchmark about 1, Changed paths 0.1.
  The `Changed paths` job printed `Changes output set to ["code"]` on every code PR.
- Records-only PR #<this>: <filled in step 6>

**The cost today** is the coordinator's waiting, not runner minutes: records conflict after nearly
every merge (`docs/agents/gotchas.md` § PRs & CI), so the next dependent PR waits for the previous
one's green CI and merge, about 43 minutes each.

## 2. Laws every option keeps

1. A merge is pinned to the reviewed commit (`--match-head-commit <full sha>`), after a
   `reviewed <sha>` comment (`docs/agents/commands.md` § Merging a PR).
2. CI is the full gate. A narrowing may skip only work that cannot be affected by the change.
3. After `main` is merged into a PR, the red team reads the merged head, and that head is the one
   pinned.

## 3. Options, in the recommended order

### A. Repository auto-merge plus minimal branch protection on `main`

Settings: `allow_auto_merge = true`; a protection rule (or ruleset) on `main` whose required checks
are the gating `ci.yml` jobs and CodeQL `analyze` (not Benchmark); no required reviews; "require
branches to be up to date" OFF (ON would re-run CI after every merge); admins not exempt is
optional. After review the coordinator runs
`gh pr merge <n> --auto --merge --match-head-commit <full sha>` and moves on.

- Effect: coordinator wait per PR 43 → 0 min. CI time unchanged.
- Needs: the owner (repository settings). No workflow change.
- Check on first use: a commit pushed after auto-merge is enabled must stop that merge (gh sends
  the pinned SHA as the expected head). If it does not, disable auto-merge before any further push.
- Reverse if: a PR auto-merges at a commit other than the reviewed one.

### B. A `concurrency` group per PR

`concurrency: { group: ci-${{ github.event.pull_request.number || github.sha }},
cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`. A new push to a PR cancels its
superseded run; pushes to `main` are never cancelled.

- Effect: frees runners when a review-round fix lands mid-run; one run is no shorter.
- Needs: a workflow PR.
- Reverse if: a cancelled run hides a red that the replacement run does not reproduce.

### C. Path-filtered legs for record-only PRs

A first job (`dorny/paths-filter`, or a `git diff --name-only` step) sets `records_only` when every
changed path is in a fixed set: `docs/plans/**`, `docs/agents/**`, `docs/backlog.md`,
`CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`. Published pages, `docs/adr/**`, README and the spec are
NOT in it: they carry `arch` fences that the docs suites compile. Under `records_only` the Node
matrix, Windows and both E2E legs skip with a job-level `if`, and one job runs `docs:build`, the
`test/docs-*.test.ts` suites and `check:test-wiring`. A trailing `CI summary` job (`needs:` every
job, `if: always()`, fails if any needed job failed or was cancelled) becomes the single required
check, so a skipped job never leaves a required check pending.

- Effect: record-only PRs ≈ 43 → ≈ 8 min.
- Needs: a workflow PR, plus A's protection rule re-pointed at `CI summary`.
- Reverse if: a record-only PR merges green and the next full run on `main` is red because of it;
  that path then leaves the set.
- As built (PR #290): no `CI summary` job. Every gating job keeps its check name and guards its
  steps, so A's required checks stay as they are. The record set was measured by tracing every `fs`
  read of the full suite: seven suites compile every `arch` fence of every Markdown page under
  `docs/` and the root, so the docs leg runs them too, and `.arch` plans under `docs/plans/` are code.

### D. Shorten the long pole

Move `test:coverage`, the coverage summary, the zero-coverage advisory and the artifact upload from
Node 22's PR leg to `nightly.yml`; Node 22 runs `npm test` like the others. If the slowest leg is
still too slow, shard it (`vitest run --shard=1/2`, `--shard=2/2`, one job each, about a minute of
`npm ci` per shard). Separately, the E2E legs' apt step could run in the Playwright container
image instead of installing system packages on every run.

- Effect: long pole ≈ 43 → ≈ 22 min (then Docs E2E or Node 18).
- Needs: a workflow PR. `docs/testing.md` § 1 and `docs/agents/commands.md` § CI move with it.
- Reverse if: a coverage drop is first seen after a release rather than in the PR that caused it.

### E. GitHub merge queue

Available on this public repository; needs A's protection rule and `merge_group` added to `ci.yml`'s
triggers. Queued PRs are merged in order, each tested on top of the one before.

- Cost: one more full CI run per merge group (≈ 43 min without D, ≈ 22 with it); it supersedes the
  coordinator's manual ordering. It does not resolve textual conflicts: a PR whose records conflict
  leaves the queue and still needs a hand merge.
- Effect: removes "green against a stale `main`"; little for today's cost while C and F are absent.
- Recommendation: defer until A–D are in and conflicts are rare.

### F. Conflict hot-spots

- `CHANGELOG.md` `[Unreleased]`: per-PR fragments under `changelog.d/`, assembled into
  `CHANGELOG.md` by `/release-check` before the tag. This conflicts with the `AGENTS.md` hard rule
  that release narrative lives only in `CHANGELOG.md`, so it needs that rule amended first.
  Reverse if: a release ships with a missing fragment.
- `handoff.md` and `cards.md` counts: recounted only at a stage end (already the rule).
- Recommendation: decide after A; with auto-merge the remaining conflicts cost one hand merge each,
  not a wait.

## 4. Recommendation

Take A now (settings only, removes the waiting), then B and D in one workflow PR, then C. Leave E
and F until the conflict rate after A shows they are needed.
