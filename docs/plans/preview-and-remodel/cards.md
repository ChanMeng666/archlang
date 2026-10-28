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

### A0b · Close the seam's two naming gaps — `todo` · residue of A0/A1 · 0.5 day · model: opus

**Goal.** Two additive core exports the package works around today: the hatch group key `joinWallSet`
groups fills by (`hatchKey`/`hatchOf`, `src/hatches.ts`; the package rebuilds `material|scale|angle`
in `hatchGroupKey`, guarded only by its corpus test) and `Point` (`src/ast.ts`; `RWall.points` is
`Point[]`, the package names it `RWall["points"][number]`). Also teach both closure walkers in
`test/public-surface.test.ts` to follow an inline `import("…").T` type node (today a field typed that
way escapes both guards; plant one to prove it). **Acceptance.** The package drops `hatchGroupKey`
for the export and its `Point` alias for the core's; the public-surface test goes red on a planted
`import()`-typed field; every digest unchanged. **Must not.** Export anything else; change a body.

### A2 · M1a geometry: Mesh3D from Scene3D — `done` · PR #328 · merge `da464b51` · record: `research/2026-10-28-as-built.md` § A2

### A2b · Mesh finish before the look round — `todo` · residue of A2 · 1.5 days · model: opus

**Goal.** What A2 left: the 12 T0 parametric furniture families laneway-house uses (grey boxes
today, §4.4); V-GEO-05 `W3D_FLOOR_OVERLAP` (rooms overlapping by more than 1 cm², with the plan's
0.5 mm deterministic lift; the core already warns `W_ROOM_OVERLAP`); window glass on a curved host
as a chord that runs into the body near its jambs; the T-junctions where a wall body meets its sill
or lintel (each shell closed; a viewer may show hairlines); the slab as rooms ∪ wall outline less
voids (today the wall footprint less voids, so a room outside every wall has no slab); a demolished
wall (B3a) drawn from `ir.drawn`. **Acceptance.** Each with a corpus or synthetic test; Mesh3D stays
deterministic and laneway's pinned digest moves only with a recorded reason. **Depends on.** A2.

### A3 · M1a replay viewer and CLI video — `done` · PR #330 · merge `323a3ee2` · record: `research/2026-10-28-as-built.md` § A3

### A4 · M1b GLB, checks and the `check:3d` CI job — `todo` · wave 3 · 3 days · model: sonnet (opus for the licence gate)

**Goal.** The GLB and its gates, from the same Mesh3D.
**Design.** glTF-Transform writer (hierarchy, names, `extras`), glTF-Validator 0/0, V-DET-01
(SHA-256 ×3) and V-GLTF as heavy tests; `archlang3d build|check|manifest|schema|doctor` with
`--json` and exit codes 0/1/2/3 (plan §7); CI job `check:3d` on Linux; the Q20 licence gate:
a source-checked allow-list, `THIRD_PARTY_NOTICES`, an explicit deny-list starting with
`straight-skeleton@3`.
**Acceptance.** Plan §9.2 criteria 1–5; the viewer's Mesh3D and the GLB's node set are equal (a test
diffs them); `npm pack --dry-run` is clean though the package stays private.
**Must not.** Publish; add IFC; change Mesh3D in a way that moves A3's key-frame hashes without a
recorded reason.
**Depends on.** A3. **Reverse-if.** glTF-Transform needs Node > 20 → vendor a minimal writer (the
plan's IFC spike shows the shape).

### A5 · M1c playground 2D/3D toggle (opens Tier A) — `todo` · wave 3 · 1.5 days · model: sonnet

**Goal.** A "3D preview" tab in the playground's output tabs (`playground/src/main.ts` ~86–94),
loaded on first use like `jspdf` (`playground/src/actions.ts:453`).
**Design.** Dynamic import of a viewer entry from `packages/archlang-3d` (the playground is a
workspace and may import a private package; the zero-dependency rule binds the core only). Light
theme only. Label text, verbatim: *"Preview — from the separate archlang-3d package. ArchLang itself
draws plans."* An `experimental` flag in the playground settings; off until the owner flips it is not
enough, because a push to `main` deploys: the merge itself is the Tier A decision (D5, D13).
E2E: open the tab, assert the canvas exists and `__frameHash()` is stable across two seeks; assert
the two startup chunks' gzip sizes are unchanged (±1 %) by reading the build manifest.
**Acceptance.** `e2e:playground` green; startup chunks unchanged; the owner has confirmed the merge
in writing in the PR thread; the growth repository's row 8 edit (Tier A wording) is ready in a
branch there.
**Must not.** Add 3D to the docs site, README, npm README or landing page; change any 2D output.
**Depends on.** A3, A4. **Reverse-if.** First paint regresses → separate demo page.

### A6 · M1d in-browser WebCodecs MP4 — `parked` (D12) · 1 day · model: sonnet

Unpark when a Tier A post needs it. Labelled non-deterministic; muxer through the Q20 gate; never a CI gate.

---

## B · The renovation wedge (language; D6–D9)

### B1 · Lock check without syntax — `done` · PR #323 · merge `68065481` · record: `research/2026-10-28-as-built.md` § B1

### B2 · `keep locked` syntax — `parked` (D6)

Opens when a consumer needs the lock inside the source. Design sketch: `keep locked <id> [, <id>…]`,
checked by `impact --against` through the same path as B1.

### B3a · Wall `status` semantics — `done` · PR #329 · merge `f4b62e92` · record: `research/2026-10-28-as-built.md` § B3a

### B3b · Wall `status` drawing, DXF, legend, example — `todo` · wave 3 · 2 days · model: sonnet

**Goal.** Demolished walls dashed (a separate `lowerWallSet` call with `lineType: "dashed"` in
`scene-build.ts`), new walls as today (optionally hatched under a sheet option, later), DXF layers
`A-WALL-DEMO` / `A-WALL-NEWW` through `classifyWallSet`, legend rows only when a status is authored,
`examples/remodel.arch` (a real apartment shell with two demolished partitions and one new one)
pinned by golden and byte-identity law, docs page section with an `arch static` fence. The drawn
`schedule rooms` NET AREA (and its TOTAL) and `--overlay circulation` read the plan after the
demolition, so the drawn table equals `describe().schedule[]` again; then drop the exception B3a
wrote into `docs/language-reference.md` (Room schedule) and flip the B3a test that pins it.
**Acceptance.** Every existing golden unchanged; the new example's SVG, DXF, describe and lint
pinned; `docs:build` green.
**Depends on.** B3a. **Must not.** Touch paint order (D4).

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
