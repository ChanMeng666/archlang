# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@88d83823`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Updated 2026-10-28 (`main@88d83823`). Wave 0 is done: A0 (#319), B6 (#320), C1 (#321), C2 (#322).
Wave 1: A1 is done (#325, the gate that opens wave 2: all 34 examples adapt); B1 (#323) and B4
(#324) are open, reviewed and pinned or queued. Wave 2 is open: A2 (main session), B3a and B5
(executors). As-built notes: `research/2026-10-28-as-built.md`. Quiet-machine baseline on
`main@00b7e7ec`: `npm run check` 557 s; A1 put it at 576 s (+3.4 %).

`packages/archlang-3d` exists (private, M0): adapter, H1 ownership, Scene3D v0, light tests in the core
suite, `npm run check:3d` for heavy tests (empty until A2). Exposure is still Tier 0; ADRs 0030 and
0031 are in archlang.uk's ADR list (factual wording; flagged to the owner). No core release has been
cut, so `npx @chanmeng666/archlang` (1.43.1) lacks the seam and the package refuses with
`E3D_CORE_TOO_OLD` against it.

Execution note: on 2026-10-28 sonnet subagents were refused (HTTP 403 `oauth_org_not_allowed`), so
executors run on the inherited model.

## 2. Pre-flight for the first session (do once)

1. `git fetch --all --prune`; confirm `main` is at or past `8829a8bb`; note the open Dependabot PRs
   (#206/#207 vitest 2→5 are blocked on owner decision 3.1(b); do not resolve them here).
2. Run the floor on a quiet machine and record the times in the first as-built note:
   `npm ci && npm run check && npm run check:drift` (787 s for `check` on 2026-10-28).
3. Read `../archlang-3d/README.md`, `amendment-v0.7.md`, and `core-pr/c1-c2-exports.md`; the PR
   draft's numbers are stale (see A0).
4. Confirm the npm names are still free: `npm view @chanmeng666/archlang-3d version` (404 expected).

## 3. Next items, in order

1. Land **B1** (#323) and then **B4** (#324): B4 merges `main` after B1 and re-checks the
   `spec.llm.md` cap (both add a line; the file sits a few units under 30,000).
2. Wave 2: **A2** then **A3** (same executor), **B3a**, **B5**. B3a and B5 also touch `spec.llm.md`;
   whichever lands later re-checks the cap.
3. **A0b** (residue of A0/A1: export the hatch group key and `Point`; walkers follow `import()`
   types) whenever a core PR is open anyway.
4. A3 accepted → stop and tell the owner: Tier A may open. Then A4, A5 (owner confirms the A5 merge),
   B3b (wave 3), only on the owner's word.

## 4. How a card is run

- The main session plans, reviews and dispatches; one executor subagent per card in an isolated
  worktree branched from `main` (not from another card's branch); the executor runs the card's gates
  and the touched tests locally, CI is the full gate; verify every completion claim with raw `git`
  output, not the executor's summary.
- At most two red-team rounds per PR; residue becomes a card, never a scope creep.
- A landed card is cut to its `done` line in `cards.md`; its as-built note (what was built, what the
  gates measured, what was left) goes verbatim to `research/<date>-as-built.md` in this folder.
- Heavy probes (cross-machine pixel determinism, H1 artefacts under motion) run in Claude cloud
  sessions while credit lasts (to 2026-11-05), with an explicit `--permission-mode`.

## 5. Open questions (not blocking wave 0)

- Whether `arch diff` (U.14) lands before B1; if not, B1 goes on `impact --against`.
- The `double` door kind in 3D: leaves from `doorLeaves`; the closed pose for a double door is two
  leaves at 0° (A2 decides and records).
- The exact stage-boundary times of the replay (A3 proposes; the owner's look notes decide).
