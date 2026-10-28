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

### A9 · Residue of A7 and A8 — `todo` · 1 day · model: opus

Small items, one PR or several. (1) `MIN_CORE` and `packages/archlang-3d`'s peer range move to
1.45.0 at its first publish (owner step). (2) The owner's call on the 30° end elevation of one-storey
views (`endElevation`, `camera.ts`). (3) Sliding, barn, bifold and pocket panels posed open under
`--doors plan` need a core export of the panel geometry. (4) A leaf the plan swings through a wall
(stress `s5-door-on-arc`) is reproduced as interpenetrating geometry with no ledger entry. (5) The
by-id `E_FURN_AGAINST_DEMOLISHED_WALL` span covers the whole statement; the B3a/B3b sweep's deletion
comparison ignores furniture; `anchor … flush` measures from a demolished face; `roof … wall` can
follow a demolished outer wall; the `new` legend row waits for a hatch option.

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

### G1 · Surface what shipped — `todo` · wave 5 · 1 day · model: sonnet

Docs only, Tier C rules (no 3D anywhere here). README feature list and `docs/overview.md` gain
one short example each for: `arch takeoff` and `describe --facts quantities`; `arch impact --against
old.arch --lock <ids>`; wall `status existing|demolish|new` with the dashed demolition drawing;
imperial literals (`12ft6in`); `arch preview --review`; `--overlay circulation`; `keep stacked` and
the stair/shaft checks. A `docs/whats-new.md` (or the existing release-notes page if one exists)
lists 1.44.0–1.46.0 by feature with one `arch static` fence each. `spec.llm.md` is at its 30,000 cap
and must not grow; check that status, lock and takeoff are already in it (B-cards said so) and only
reorder if a line is missing. Acceptance: `docs:build` green; every new fence compiles or is
`arch static`; a reader can find each feature from the README in one click.

### G2 · Roadmap issues reconciled to 1.46.0 — `todo` · wave 5 · 0.5 day · model: sonnet; owner approves the text

For #343–#347: a comment per issue, drafted first in
`research/2026-10-29-issue-replies-draft.md` and posted only after the owner approves, that says
what exists today with doc links (after G1 lands), what remains, and re-scopes the title where the
body describes shipped work: #347 closes as shipped; #346 narrows to "wall-closure check and a
playground takeoff panel"; #343 narrows to "a converter interface and a public glTF (waits for the
3D package's first publish)"; #345 narrows to "shared grid (P2-4) and load-bearing stacking";
#344 stays open as the import gap. Never write "users asked" where `data/community-replies.json`
shows one user. Must not: add a 3D word to #343 beyond "waits for a separate package".

### G3 · Rooms-only Plan JSON import and a mask-to-plan recipe — `todo` · wave 5 · 2 days · model: opus

Evidence: one user training a segmentation model on floor plans asked for PDF-or-mask → `.arch` and
wants vector geometry for quantities. Design (D18): the core gains nothing raster. Document the
existing path: a Plan JSON with rooms only plus a derived-walls statement compiles through
`--from-json` (verify first with a hand-written file; if derived walls cannot be expressed in Plan
JSON today, that is the card's core change, additive, with its byte-identity law). Then
`tools/mask-to-plan/` (outside the package, MIT, Python run with `-I`, OpenCV or scikit-image
allowed there): label mask PNG + a millimetres-per-pixel scale → room polygons (simplified,
right-angled where within tolerance, snapped to `grid`) → rooms-only Plan JSON → `.arch` via the CLI,
and `arch validate` + `takeoff` on the result. A `docs/import.md` recipe with one worked example and
its limits (no openings, no furniture, labels from the mask's class names only), marked experimental.
Acceptance: the example mask round-trips to a plan whose `describe` room areas match the mask's
pixel areas within 2 %; `check:drift` unchanged; no new core dependency. Must not: ship a VLM
reversal (ArchCanvas W1 territory); promise PDF parsing (a PDF is rasterised by the user first).

### G4 · Metrics strip in the replay viewer — `todo` · wave 5 · 0.5 day · model: sonnet

In `packages/archlang-3d`'s replay, a small strip fed only by `describe()` facts the adapter already
holds: floor area (centreline and net, labelled), room count, door and window counts, storey count,
and the warnings count from `lint()`; numbers appear when their stage is reached. No "score", no
"checks passed N/M", no percentages. Light theme in the playground; the exported file may use the
dark theme (D11). Key-frame hashes re-pinned with the reason. Tier A artefact for the owner's posts.

### G5 · Wall-closure check: measure first — `todo` · wave 5 · 0.5–1 day · model: sonnet

Issue #346 asks for "walls closed". Measure before building: write three plans with an open exterior
ring, a gap between a derived wall and an authored one, and a wall ending 80 mm short of its
neighbour; run `validate`, `lint` and `describe`. If `E_ROOMS_NOT_TILING`, the enclosure rules and
`W_OPENING_AT_JUNCTION` already name all three, the card closes with the evidence in the issue
comment. Otherwise one new catalogued rule for the uncovered case, with the usual law.

### G6 · DCjson and a game-level recipe — `blocked` on the owner's reply to the Halo Forge user · 0.5–1 day

"DCjson" could not be identified on the web. Ask the user what the format is (owner reply, drafted in
G2's file). If public and simple, a `tools/plan-json-to-<format>.mjs` recipe plus one paragraph in
`docs/import.md`'s sibling "export recipes" section. No new example is pinned for it.

### Wave 6 (after the N10 read): G7 repair-convergence replay (the review rings of iteration N fading
into N+1; needs `fix`/`repair` to emit a trace, design spike first), D1, A6, archlang-3d M2+, Tier B.
