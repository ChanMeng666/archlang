# Preview-and-remodel cards

Rules (same as `../plan-soundness/cards.md`): pick the first `todo` card whose dependencies are done
and whose wave is open (`README.md` §4). Status words: `todo`, `doing`, `done` (cut to id, title,
status, PR, commit; the as-built note goes verbatim to a dated `research/` record in this folder),
`parked`. Sizes are AI-assisted days (the archlang-3d plan's track B), ±50 %. "Model" is the
suggested executor; the main session may override. Every card lists what it must **not** do.

## 0. Gates every card runs

| When | Commands |
|---|---|
| Always (floor) | `npm run check` then `npm run check:drift` |
| Anything outside `src/` (including `test/`, `packages/`, `playground/`) | `npm run build` then `npm run typecheck:all` (a new workspace is added to its list) |
| Any `docs/*.md` edit | `npm run docs:build`; tables escape `\|` inside inline code; fragments use `arch static` fences |
| Playground | `npm run build && npm run playground:build:only && npm run e2e:playground` |
| 3D package heavy tests | `npm run check:3d` (created by A1) |
| Every PR | branch from `main` in a worktree, `feat/<card>-<slug>`; PR body per the template; reviewer posts `reviewed <full sha>` then `gh pr merge <n> --auto --merge --match-head-commit <40-char sha>`; a later push voids the pin; CHANGELOG `[Unreleased]` conflicts keep both entries; at most two red-team rounds |

---

## A · The checked 3D preview (archlang-3d M0–M1 recut; D1, D2)

Baseline facts for every A-card: `../archlang-3d/development-plan.md` §3 (architecture), §4
(algorithms), §6.1/§6.5 (viewer, time seam), §7 (CLI), §8 (checks), §9.8/§9.10 (day list, week-one
kit); `amendment-v0.7.md` (the recut). The viewer subset of three.js 0.186.1 is 140 kB gzip (MIT).

### A0 · Core exports C1/C2 and ADR 0031 — `done` · PR #319 · merge `6e510aff` · record: `research/2026-10-28-as-built.md` § A0

### A1 · M0: package skeleton, adapter, H1, Scene3D v0 — `done` · PR #325 · merge `88d83823` · record: `research/2026-10-28-as-built.md` § A1

### A0b · Close the seam's two naming gaps — `done` · PR #338 · merge `9f3e51c5` · record: `research/2026-10-28-as-built.md` § A0b

### A2 · M1a geometry: Mesh3D from Scene3D — `done` · PR #328 · merge `da464b51` · record: `research/2026-10-28-as-built.md` § A2

### A2b · Mesh finish before the look round — `done` · PR #341 · merge `80f2b3b1` · record: `research/2026-10-28-as-built.md` § A2b

### A3 · M1a replay viewer and CLI video — `done` · PR #330 · merge `323a3ee2` · record: `research/2026-10-28-as-built.md` § A3

### A4 · M1b GLB, checks and the `check:3d` CI job — `done` · PR #336 · merge `75072487` · record: `research/2026-10-28-as-built.md` § A4

### A5 · M1c playground 2D/3D toggle (opens Tier A) — `done` · PR #340 · merge `0d1cbda7` · record: `research/2026-10-28-as-built.md` § A5

### A6 · M1d in-browser WebCodecs MP4 — `parked` (D12) · 1 day · model: sonnet

Unpark when a Tier A post needs it. Labelled non-deterministic; muxer through the Q20 gate; never a CI gate.

### A7 · `--doors plan` for the replay — `done` · PR #349 · merge `e667d8f0` · record: `research/2026-10-28-as-built.md` § A7

### A8 · Wave-3 residue — `done` · PRs #350 · merge `b11b83c3` and #351 · merge `f5756794` · record: `research/2026-10-28-as-built.md` § A8

### A9 · Residue of A7 and A8 — `done` · PRs #356 · merge `8fa40dd7` and #361 · merge `ded0f0b5` · record: `research/2026-10-30-as-built.md` § A9

---

## B · The renovation wedge (language; D6–D9)

### B1 · Lock check without syntax — `done` · PR #323 · merge `68065481` · record: `research/2026-10-28-as-built.md` § B1

### B2 · `keep locked` syntax — `parked` (D6)

Opens when a consumer needs the lock inside the source. Design sketch: `keep locked <id> [, <id>…]`,
checked by `impact --against` through the same path as B1.

### B3a · Wall `status` semantics — `done` · PR #329 · merge `f4b62e92` · record: `research/2026-10-28-as-built.md` § B3a

### B3b · Wall `status` drawing, DXF, legend, example — `done` · PR #337 · merge `28116116` · record: `research/2026-10-28-as-built.md` § B3b

### B4 · Quantities: `describe --facts quantities` and `arch takeoff` — `done` · PR #324 · merge `8031dd86` · record: `research/2026-10-28-as-built.md` § B4

### B5 · Imperial input literals — `done` · PR #327 · merge `ba6f66e8` · record: `research/2026-10-28-as-built.md` § B5

### B6 · `W_GARAGE_OPENING_UNDERSIZED` — `done` · PR #320 · merge `9280f256` · record: `research/2026-10-28-as-built.md` § B6

---

## C · Drafting order in guidance (D3, D4)

### C1 · The canonical sequence, written down — `done` · PR #321 · merge `faef9228` · record: `research/2026-10-28-as-built.md` § C1

### C2 · Skill and plugin wording — `done` · PR #322 · merge `324f87c5` · record: `research/2026-10-28-as-built.md` § C2

---

## D · Professional output

### D1 · DXF `BLOCK`/`INSERT` and `DIMENSION` (backlog U.13) — `todo` · wave 4 · 3 days · model: opus

Doors, windows and catalogued furniture as block definitions with one `INSERT` each; dimensions as
`DIMENSION` entities; AIA layer names kept; a DXF round-trip test through an independent reader
(`ezdxf` in a Python `-I` check script under `e2e/`, not a runtime dependency). Byte-identity of SVG
untouched; DXF digests re-pinned on purpose with the reason in the PR.

### D2 · IFC4 — archlang-3d M5, unchanged (Q4, Q17). Not a card here.

---

## E · ArchCanvas (specified in that repository)

`archcanvas/docs/specs/2026-10-28-value-theatre-and-canvas-tweaks.md`: E1 quick-action telemetry;
E2 visible self-check (`check` field on the progress event, plain-language copy); E3 door flip and
furniture nudge quick actions; E4 the 3D preview tab (Tier B only). Listed here so a session sees the
whole programme; the cards are owned there.

## F · Growth (specified in the growth repository)

F1 claim corrections (filed 2026-10-28); F2 Tier A posting kit (after A3; four to six posts, each with
a playground permalink; measurement rows added to `data/`); F3 the N10 read.

---

## G · Wave 5: surface what shipped, and the one real import gap (D17–D19; added 2026-10-29)

Why this wave exists. A 2026-10-29 audit of the 2026-10-28 creator research and of the five public
roadmap issues (#343–#347) found that about half of the proposed "upgrades" already exist in 1.46.0
(`preview --review` rings every warning; `--overlay circulation`; the `dark` theme; `takeoff`;
`keep stacked`, `W_STAIR_UNMATCHED`, `W_SHAFT_FOOTPRINT_MISMATCH`; door swings and 129 catalogued
fixtures), that the README surfaces none of the 1.44–1.46 features, and that three of the five issues
describe shipped features as future work. The only grade-A user ask that is a real gap is import from
segmentation masks or PDF plans into `.arch` (one user, with masks in hand, who also wants quantities).

### G1 · Surface what shipped — `done` · PR #357 · merge `bcc29010` · record: `research/2026-10-30-as-built.md` § G1

### G2 · Roadmap issues reconciled to 1.46.0 — `done` · comments on #343–#347, #347 closed · record: `research/2026-10-30-as-built.md` § G2

### G3 · Rooms-only Plan JSON import and a mask-to-plan recipe — `done` · PR #359 · merge `c61a6c10` · record: `research/2026-10-30-as-built.md` § G3

### G4 · Metrics strip in the replay viewer — `done` · PR #360 · merge `1f4643c1` · record: `research/2026-10-30-as-built.md` § G4

### G5 · Wall-closure check: measure first — `doing` (PR #358; the measurement found a gap: new rule `W_WALL_END_SHORT`) · wave 5 · 0.5–1 day · model: sonnet

Issue #346 asks for "walls closed". Measure before building: write three plans with an open exterior
ring, a gap between a derived wall and an authored one, and a wall ending 80 mm short of its
neighbour; run `validate`, `lint` and `describe`. If `E_ROOMS_NOT_TILING`, the enclosure rules and
`W_OPENING_AT_JUNCTION` already name all three, the card closes with the evidence in the issue
comment. Otherwise one new catalogued rule for the uncovered case, with the usual law.

### G6 · DCjson and a game-level recipe — `blocked` on the owner's reply to the Halo Forge user; closes at the N10 read if no answer (D22) · 0.5–1 day

"DCjson" could not be identified on the web. Ask the user what the format is (owner reply, drafted in
G2's file). If public and simple, a `tools/plan-json-to-<format>.mjs` recipe plus one paragraph in
`docs/import.md`'s sibling "export recipes" section. No new example is pinned for it.

### G8 · Demolished walls: the three remaining resolvers — `todo` · wave 5 · 0.5 day · model: sonnet

Same defect class as A9 item 5, found by #361's red-team, outside that diff. Each was probed against
its deleted-wall twin. (1) The derived rail: `deriveRail(…, ctx.walls)` at `src/elements/outdoor.ts:416`:
a balcony beside a demolished wall loses a balustrade edge. (2) `dim faces`: `src/elements/dim.ts:287-288`
measures to a demolished face where the twin says `W_DIM_NO_WALL`. (3) Category references:
`src/attach.ts:207` and `src/elements/dim.ts:444` count demolished walls, so `door on partition at 50%`
with one demolished and one standing partition is `E_ATTACH_WALL_REF`. Copy the `named`/`matches` filter
from `placeAgainst`, charge the step meter before filtering. Acceptance: each matches its deleted-wall
twin; SHA-256 sweep moves nothing on plans without a demolished wall. Must not: touch `new` wall drawing.

### G9 · The first bugs from the German-houses user — `todo` · wave 5 · 1.5 days · model: opus

Decision D21. A real user drew German houses with an agent and filed #362–#370 with reproductions. Fix
in this order, one PR per issue: #365 (`validate --intent` counts only the lowest storey), #366 (Plan JSON
round trip: say what it dropped, as `droppedKeeps` does for keeps; do not widen the format), #364 part 1
(`finish` furnishing over a stair, with a lint that sees it), #368 (the free-standing pier), #367 (labels in
small rooms). Must not: promise IFC; make a new language form without its byte-identity law.

### G10 · Design spikes for #363 and #362 — `todo` · after G9 · 1 day · model: opus

A written design only, in `research/`, no code. #363: L-shaped rooms in `walls from rooms`, `door between`
and relational placement (touches `src/room-tiling.ts`, and would retire the rectangle cutting in
`tools/mask-to-plan`). #362: quarter-turn and half-turn stairs. #369 and the #370 collection are split into
single issues by the same session and wait for a second ask, unless they are one-line docs fixes.

### Wave 6 (after the N10 read): G7 repair-convergence replay (the review rings of iteration N fading
into N+1; needs `fix`/`repair` to emit a trace, design spike first), D1, A6, archlang-3d M2+, Tier B.
