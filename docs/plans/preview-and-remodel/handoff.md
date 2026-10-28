# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@323a3ee2`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Updated 2026-10-28 after A3 and the 1.44.0 release (`main@323a3ee2`). Waves 0, 1 and 2 are done.
Landed: A0 (#319), B6 (#320), C1 (#321), C2 (#322), A1 (#325), B5 (#327), A2 (#328), B1 (#323),
B4 (#324), B3a (#329), A3 (#330, merge `323a3ee2`, look notes round 1 in); records #326, #331.
As-built notes: `research/2026-10-28-as-built.md`. Quiet-machine baseline on `main@00b7e7ec`:
`npm run check` 557 s.

**A3 look set** (1080p30, per-storey and combined views): `D:.claude-scratch6-10-28a3-look`
on the owner's machine. Open for the owner's next look: the 30° end elevation of one-storey views
(`endElevation`, `camera.ts`), at which near walls hide most furniture.

**Tier A is open** (README §3 D16, owner 2026-10-28): A5 merges once green; the docs site, README,
npm README and landing pages stay without 3D (Tier C). For every owner-only manual step (the VS Code
Marketplace upload; OTP/2FA, logins, terms in the release chain) the agent pauses, guides the owner
step by step, waits for confirmation, verifies, and continues.

**Releases (README §3 D15):** **1.44.0 is out** (PR #334, merge `a6405af9`, tag `v1.44.0`,
`release.yml` run 40618590620 green): npm core 1.44.0 (`latest`, SLSA provenance), the shim 0.2.27
(MCP registry `isLatest`), `.mcpb` bundles on the GitHub Release; `@chanmeng666/arch-plan` stays
0.1.1 (unchanged). The VS Code `.vsix` 0.32.0 (core 1.44.0 stamped) is built in the primary checkout
and waits for the owner's Marketplace upload (D16; the Marketplace shows 0.31.1).

`packages/archlang-3d` (private): adapter, H1 ownership, Scene3D v0, Mesh3D; the replay viewer, HTML
and video (A3). Exposure is Tier 0; ADRs 0030/0031 are in archlang.uk's ADR list (factual
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

1. **VS Code 0.32.0 Marketplace upload** (owner, D16): verify the listing after.
2. **Wave 3 in flight:** A4 and B3b executors started 2026-10-28; B3b lands after 1.44.0, so a
   1.44.1/1.45.0 follows it.
3. **Wave 3:** A4 (GLB, glTF-Validator, V-DET-01, the `check:3d` CI job on Linux, the Q20 licence
   gate, the cross-machine key-frame baseline: pin only frames without SVG text, or ship a font);
   B3b (draw the wall status, DXF layers, legend, `examples/remodel.arch`, the schedule law restored);
   A5 (playground toggle; Tier A is open, D16: merge it once green).
4. Residue: **A0b** (export the hatch group key and `Point`; the closure walkers follow `import()`
   types), **A2b** (T0 parametric furniture, V-GEO-05, curved-host glass, slab ∪ rooms, extrude from
   `ir.drawn` once B3b draws demolished walls), `--doors plan` (each leaf's open tip into Scene3D).
5. After each landed card: its records PR (done line, as-built note, this handoff).

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
