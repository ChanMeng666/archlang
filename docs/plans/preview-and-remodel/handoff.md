# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@f4b62e92`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Updated 2026-10-28 (`main@f4b62e92`). Waves 0 and 1 are done; wave 2 is done except A3. Landed:
A0 (#319), B6 (#320), C1 (#321), C2 (#322), A1 (#325), B5 (#327), A2 (#328), B1 (#323), B4 (#324),
B3a (#329). As-built notes: `research/2026-10-28-as-built.md`. Quiet-machine baseline on
`main@00b7e7ec`: `npm run check` 557 s; full runs on the card branches took 505–679 s with other
agents working.

**A3 (#330) is the stop point.** Its gates are green and its red-team round 1 is fixed; it waits,
unmerged, for the owner's look at the laneway, two-bed and hexagon-pavilion replays (one round of look
notes allowed). A3's acceptance opens Tier A (README §6), which only the owner may approve; nothing in
wave 3 starts before the owner says so.

`packages/archlang-3d` (private): adapter, H1 ownership, Scene3D v0, Mesh3D (A2), and on #330 the
replay viewer, its HTML and its CLI video. The core is untouched by the A-cards beyond A0's exports.
Exposure is Tier 0; ADRs 0030 and 0031 are in archlang.uk's ADR list (factual wording). No core
release has been cut: `npx @chanmeng666/archlang` (1.43.1) lacks the seam, lock, quantities,
imperial literals and wall status, while archlang.uk (deployed from `main`) documents them.

`spec.llm.md` is at 29,999 of its 30,000 cap: the next card that adds to it must pay with a
provable-duplicate cut. After A2 a checkout needs `npm ci` (new dependency `earcut`); after A3,
`three`, `playwright-core`, `esbuild` at runtime.

Execution notes: sonnet subagents were refused on 2026-10-28 (HTTP 403 `oauth_org_not_allowed`), so
executors ran on the inherited model. An executor's test subset repeatedly missed corpus-wide guards
(taste tables, fixture tables, the per-storey key list, the catalogue size prose); the full local
`check` before every pin caught each one.

## 2. Pre-flight for the first session (do once)

1. `git fetch --all --prune`; confirm `main` is at or past `8829a8bb`; note the open Dependabot PRs
   (#206/#207 vitest 2→5 are blocked on owner decision 3.1(b); do not resolve them here).
2. Run the floor on a quiet machine and record the times in the first as-built note:
   `npm ci && npm run check && npm run check:drift` (787 s for `check` on 2026-10-28).
3. Read `../archlang-3d/README.md`, `amendment-v0.7.md`, and `core-pr/c1-c2-exports.md`; the PR
   draft's numbers are stale (see A0).
4. Confirm the npm names are still free: `npm view @chanmeng666/archlang-3d version` (404 expected).

## 3. Next items, in order

1. **Owner:** look at the A3 replays and accept, or file one round of look notes; then confirm
   Tier A may open. The main session then lands #330 (re-review if the notes change it) and records it.
2. On the owner's word, wave 3: **A4** (GLB, checks, the `check:3d` CI job and the cross-machine
   pixel baseline: pin only key frames without the SVG's text, or ship a font), **A5** (the playground
   toggle; the owner confirms its merge, since a push to `main` deploys), **B3b** (draw the wall
   status, the schedule law back, extrude from `ir.drawn`).
3. Residue cards when convenient: **A0b** (export the hatch group key and `Point`; walkers follow
   `import()` types), **A2b** (T0 furniture, V-GEO-05, curved glass, slab ∪ rooms), `--doors plan` for
   the replay (needs each leaf's open tip in Scene3D).

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
