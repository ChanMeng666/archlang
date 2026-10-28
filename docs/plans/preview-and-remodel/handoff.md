# Preview-and-remodel programme: handoff (state as of 2026-10-29, `main@c10cce3c`)

The resume point for a new session. Re-written at every wave end; dated history goes to `research/`.

## 1. Where the programme stands

Waves 0–3 are done, and every card the owner opened is merged. Landed: A0 (#319), B6 (#320),
C1 (#321), C2 (#322), A1 (#325), B5 (#327), A2 (#328), B1 (#323), B4 (#324), B3a (#329), A3 (#330),
A4 (#336), B3b (#337), A0b (#338), A5 (#340), A2b (#341), A7 (#349), A8 (#350, #351); records #326,
#331, #335, #342, #348, #352. Each card's text and as-built note: `research/2026-10-28-as-built.md`.
Open: card A9 (residue, `cards.md`); A6 and B2 parked; D1 in wave 4.

**Tier A is open** (README §3 D16): the playground's lazy "3D preview" tab (A5) carries D5's label;
the storey switcher drives it; positioning row 8 took its Tier A wording in the growth repository
(archcanvas-growth #22, at the owner's request in conversation). The docs site, README, npm READMEs
and landing pages stay without 3D. The N10 window has not started: it opens with the owner's first
Tier A post.

**Releases (README §3 D15), all through the tokenless OIDC chain with SLSA provenance:** 1.44.0
(#334; the seam exports, `--lock`, quantities and `takeoff`, imperial literals, wall `status`, the
garage lint), 1.45.0 (#339; B3b's drawn wall status, A0b's exports) and 1.46.0 (#353;
`E_FURN_AGAINST_DEMOLISHED_WALL`). npm `latest` is 1.46.0; the MCP shim 0.2.29 is on npm and the MCP
registry; `.mcpb` bundles are on each GitHub Release; `@chanmeng666/arch-plan` stays 0.1.1
(unchanged). VS Code 0.32.0, 0.33.0 and 0.34.0 were uploaded by the owner and verified on the
Marketplace (0.34.0 bundles core 1.46.0).

`packages/archlang-3d` (private, never published): adapter, Scene3D, Mesh3D (T0 furniture, ghosts for
demolished walls), the replay (per-storey and combined views, fitted framing, `--doors plan`), the
GLB and its checks, the CLI, the `check:3d` CI job (not a required check), and the browser
`mountReplay` entry. Its laws: `.claude/rules/archlang-3d.md`. `spec.llm.md` is at 29,999 of 30,000.

Process facts from this programme: executors ran on the inherited model; every branch got a full
local `npm run check` (529–675 s) on its final, `main`-merged head before its pin, and one
independent red-team round; at most one fix round was needed per PR. The A3 look set the owner saw
is on the owner's machine under `D:\.claude-scratch\2026-10-28\a3-look\`.

## 2. Pre-flight for a new session

1. `git fetch --all --prune`; `git switch main && git pull --ff-only && npm ci` in the primary checkout
   (the 3D package needs its own dependencies: earcut, three, playwright-core, esbuild,
   `@gltf-transform/core`, gltf-validator).
2. The open Dependabot PRs (#206/#207 vitest 2→5 and others) wait on owner decision 3.1(b); do not
   resolve them here.
3. Read `.claude/rules/archlang-3d.md` before touching `packages/archlang-3d`.

## 3. Next items, in order

*2026-10-29 audit (main at `3f603d80`, #354): the wave 0–3 claims above were verified against raw
`git`/`gh`/`npm` evidence (every merged PR #319–#353 maps to a card, record or release; the laws,
label text, pinned three.js and the private package are as planned). Deviations found: A5's chunk
budget became +20,000 bytes; the imperial refusal code is `E_IMPERIAL_FORM`; B3b's hatch for new
walls was not built (A9 item 5); A3's CI video runs at 320×180 and the "identical twice" claim rests
on key-frame hashes; `archlang-3d`'s peer range still says `^1.43.1` though it needs 1.44.0 (A9 item
1). ArchCanvas has started none of E1–E4 and still pins core 1.43.1 (1.42.0 installed), so its
designer prompt carries a 1.42-era `spec.llm.md`. Wave 5 (cards G1–G6, decisions D17–D19) was added
in response.*

1. **A9** (residue of A7 and A8, `cards.md`). Its item (2), the 30° end elevation of one-storey
   views, is the owner's call on their next look.
2. **Wave 5, in parallel:** G1 (surface what shipped; docs), G2 (issue replies drafted in
   `research/2026-10-29-issue-replies-draft.md`, posted only after the owner approves), G3
   (rooms-only Plan JSON import + mask recipe), G4 (metrics strip), G5 (wall-closure measure-first).
   G6 is blocked on the owner's reply to the Halo Forge user.
3. The owner's first Tier A post starts the N10 window (README §6; the agent posts nothing). The
   draft posts are in the growth repository, `marketing/content/posts/2026-10-29-tier-a-replay-posts-draft.md`.
4. ArchCanvas, in that repository: E0 (core bump to 1.46.0 with the `spec.llm.md` diff per its
   2026-10-16 bump checklist), then E1–E3 per its 2026-10-28 spec. E4 waits for Tier B.
5. Wave 4 and wave 6 (README §4, cards G7) after N10 is read: D1, A6 (parked), archlang-3d M2+.
   Tier B needs the owner's first npm publish of `@chanmeng666/archlang-3d` and its trusted publisher (§6).
6. After each landed card: its records PR (done line, as-built note, this handoff). If anything lands
   in the core, cut a release the same way (D15), pausing for the owner's VS Code upload (D16).

## 4. How a card is run

- The main session plans, reviews and dispatches; one executor subagent per card in an isolated
  worktree branched from `main` (not from another card's branch), with its own `npm ci` (never a
  junctioned `node_modules`); the executor runs the card's gates and the touched tests; the
  coordinator merges `main` into the branch and runs the FULL `npm run check` (plus `check:drift`,
  `typecheck:all`, and `check:3d` / the playground chain where touched) on that head before pinning
  the merge; verify every completion claim with raw `git`/`gh`/`npm` output, not the summary.
- One independent red-team round per PR (at most two); its should-fix items are fixed in the PR,
  the rest becomes a card, never a scope creep.
- A landed card is cut to its `done` line in `cards.md`; its as-built note (what was built, what the
  gates measured, what was left) goes verbatim to `research/<date>-as-built.md` in this folder.
- Heavy probes (cross-machine pixel determinism, H1 artefacts under motion) run in Claude cloud
  sessions while credit lasts (to 2026-11-05), with an explicit `--permission-mode`.

## 5. Open questions

- The one-storey end elevation (30°, at which near walls hide furniture): the owner's next look (A9).
- Posing sliding, barn, bifold and pocket panels open under `--doors plan` needs a core export of
  the panel geometry (A9); whether it is worth one.
- Settled (see the as-built notes): B1 went on `impact --against`; a double door is two leaves from
  `doorLeaves`; the replay's phases and the combined view's exploded storeys with camera stops were
  set by the owner's look notes round 1 (D14) and A3.
