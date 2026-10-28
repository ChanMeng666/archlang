# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@80f2b3b1`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Updated 2026-10-28 after wave 3 (`main@80f2b3b1`). Waves 0–3 are done.
Landed: A0 (#319), B6 (#320), C1 (#321), C2 (#322), A1 (#325), B5 (#327), A2 (#328), B1 (#323),
B4 (#324), B3a (#329), A3 (#330), A4 (#336), B3b (#337), A0b (#338), A5 (#340), A2b (#341); records #326,
#331, #335, #342. As-built notes: `research/2026-10-28-as-built.md`. Quiet-machine baseline on
`main@00b7e7ec`: `npm run check` 557 s; wave 3's full runs took 576–675 s.

**A2b** merged (#341, `80f2b3b1`): wave 3 is done. In flight: A7 (`--doors plan`) and A8 (residue,
package and playground items); A8's B3b core items follow in their own PR and a patch release.

**A3 look set** (1080p30, per-storey and combined views): `D:\.claude-scratch\2026-10-28\a3-look\`
on the owner's machine. Open for the owner's next look: the 30° end elevation of one-storey views
(card A8).

**Tier A is open** (README §3 D16): A5 merged (`0d1cbda7`), the playground has the "3D preview" tab
with D5's label; positioning row 8 took its Tier A wording (archcanvas-growth #22, `826b241f`, at
the owner's request). The docs site, README, npm README and landing pages stay without 3D. For every
owner-only manual step the agent pauses, guides the owner step by step, waits, verifies, continues.

**Releases (README §3 D15):** 1.44.0 (PR #334, tag `v1.44.0`, run 40618590620) and 1.45.0 (PR #339,
merge `ad6c1b1a`, tag `v1.45.0`, run 40638685119; B3b + A0b) are out: npm core `latest` 1.45.0 with
SLSA provenance, the shim 0.2.28 (MCP registry latest), `.mcpb` bundles on each GitHub Release;
`@chanmeng666/arch-plan` stays 0.1.1 (unchanged). VS Code 0.32.0 and 0.33.0 were uploaded by the
owner and verified on the Marketplace (0.33.0 = core 1.45.0).

`packages/archlang-3d` (private): adapter, H1 ownership, Scene3D v0, Mesh3D; the replay viewer, HTML
and video (A3); GLB, checks, CLI, the `check:3d` CI job (A4, not a required check); the browser
`mountReplay` entry (A5). Exposure is Tier A; ADRs 0030/0031 are in archlang.uk's ADR list (factual
wording). `spec.llm.md` is at 29,999 of 30,000. After #328/#330 a checkout needs `npm ci` (earcut,
three, playwright-core, esbuild). Sonnet subagents were refused on 2026-10-28 (HTTP 403); executors
ran on the inherited model. Every branch got a full local `npm run check` before its pin.

## 2. Pre-flight for the first session (do once)

1. `git fetch --all --prune`; confirm `main` is at or past `8829a8bb`; note the open Dependabot PRs
   (#206/#207 vitest 2→5 are blocked on owner decision 3.1(b); do not resolve them here).
2. Run the floor on a quiet machine and record the times in the first as-built note:
   `npm ci && npm run check && npm run check:drift` (787 s for `check` on 2026-10-28).
3. Read `../archlang-3d/README.md`, `amendment-v0.7.md`, and `core-pr/c1-c2-exports.md`; the PR
   draft's numbers are stale (see A0).
4. Confirm the npm names are still free: `npm view @chanmeng666/archlang-3d version` (404 expected).

## 3. Next items, in order

1. **A7** (`--doors plan`) and **A8** (wave-3 residue), in `cards.md`.
2. The N10 window starts with the owner's first Tier A post (README §6; the agent posts nothing).
3. Wave 4 (README §4) after N10 is read: D1, A6 (parked), archlang-3d M2+.
4. After each landed card: its records PR (done line, as-built note, this handoff). If anything lands
   in the core, cut a release the same way (D15/D16).

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
