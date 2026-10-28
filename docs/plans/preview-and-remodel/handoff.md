# Preview-and-remodel programme: handoff (state as of 2026-10-28, `main@c6db740b`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Updated 2026-10-28 after the owner's answer (`main@c6db740b`). Waves 0 and 1 are done; wave 2 is
done except A3. Landed: A0 (#319), B6 (#320), C1 (#321), C2 (#322), A1 (#325), B5 (#327),
A2 (#328), B1 (#323), B4 (#324), B3a (#329); records #326, #331. As-built notes:
`research/2026-10-28-as-built.md`. Quiet-machine baseline on `main@00b7e7ec`: `npm run check` 557 s.

**A3 (#330, branch `feat/A3-replay-viewer`, head `58f1fdd5`):** gates green, independent red-team
round 1 fixed, CI clean (Node 18 needed `playwright-core` imported lazily). **The owner looked**
(2026-10-28) and filed look notes round 1 (README §3 D14; the A3 card): show each storey on its own
and the storeys combined, never hiding the ground floor; frame the end shot to the building. The owner
also accepted every optimisation the session found (A0b, A2b, `--doors plan`, framing). Implement
the notes on #330, re-render the look set, then merge #330.

**Tier A** (README §3 D5: the playground toggle A5 and the owner's posts) is still the owner's to open;
the owner's answer did not open it. Build A5, but confirm its merge with the owner (a push to `main`
deploys the playground).

**Releases (README §3 D15):** the owner approved cutting and publishing the core, the MCP shim,
`@chanmeng666/arch-plan` and the VS Code build end to end. No release has been cut yet: npm has core
1.43.1, while `main` (and archlang.uk) carry the seam exports, `--lock`, quantities and `takeoff`,
imperial literals, wall `status`, the garage lint and the authoring-order docs.

`packages/archlang-3d` (private): adapter, H1 ownership, Scene3D v0, Mesh3D; the replay viewer, HTML
and video are on #330. Exposure is Tier 0; ADRs 0030/0031 are in archlang.uk's ADR list (factual
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

1. **A3 look notes round 1** on #330 (the A3 card's list): per-storey and combined views, the ground
   floor kept readable, end framing; re-render laneway, two-bed, hexagon-pavilion, two-storey and
   townhouse at 1080p30 into a scratch folder and give the owner the paths; full gates; merge #330.
2. **Release** (D15): run `/release-check` (`.claude/commands/release-check.md`) in the primary
   checkout; the version-bump PR (core minor: new exports and language forms; the shim's version and
   both `server.json` fields; CHANGELOG `[Unreleased]` → the version); the `v*` tag; watch
   `release.yml`; prove npm, the MCP registry and `arch-plan`; build the VS Code bundle (its
   Marketplace upload stays the owner's manual step). The owner steps in only for OTP/2FA, logins
   and terms.
3. **Wave 3:** A4 (GLB, glTF-Validator, V-DET-01, the `check:3d` CI job on Linux, the Q20 licence
   gate, the cross-machine key-frame baseline: pin only frames without SVG text, or ship a font);
   B3b (draw the wall status, DXF layers, legend, `examples/remodel.arch`, the schedule law restored);
   A5 (playground toggle, built and green; **its merge waits for the owner's written OK**).
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
