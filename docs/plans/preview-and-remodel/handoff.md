# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@8829a8bb`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Planned, not started. Wave 0 is open. Nothing in `packages/` exists yet. The growth-side exposure
decision is recorded (Tier 0: nothing public). The claim corrections are filed in the growth
repository. No core release has been cut since the authoring stages landed in `[Unreleased]`.

## 2. Pre-flight for the first session (do once)

1. `git fetch --all --prune`; confirm `main` is at or past `8829a8bb`; note the open Dependabot PRs
   (#206/#207 vitest 2→5 are blocked on owner decision 3.1(b); do not resolve them here).
2. Run the floor on a quiet machine and record the times in the first as-built note:
   `npm ci && npm run check && npm run check:drift` (787 s for `check` on 2026-10-28).
3. Read `../archlang-3d/README.md`, `amendment-v0.7.md`, and `core-pr/c1-c2-exports.md`; the PR
   draft's numbers are stale (see A0).
4. Confirm the npm names are still free: `npm view @chanmeng666/archlang-3d version` (404 expected).

## 3. Next items, in order

1. **A0** core exports + ADR 0031 (opus, worktree). Everything in wave 1 waits for its merge.
2. In parallel with A0: **B6**, **C1**, **C2** (sonnet, separate worktrees; they share
   `CHANGELOG.md [Unreleased]` and `docs/` — stack and re-pin per the merge flow).
3. When A0 is merged: **A1**, **B1**, **B4** (wave 1).
4. When A1 is accepted: **A2** then **A3** (same executor if possible), **B3a**, **B5** (wave 2).
5. A3 accepted → tell the owner: Tier A may open. Then **A4**, **A5** (owner confirms the A5 merge),
   **B3b** (wave 3).

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
