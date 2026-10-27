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

### A2 · M1a geometry: Mesh3D from Scene3D — `doing` · wave 2 · 5 days · model: opus

**Goal.** One deterministic triangulation that both the viewer and the GLB read.
**Design.** `Mesh3D` = integer-micrometre vertices, canonical `(level, kind, id)` order, per-node
`extras` (ids, stage, category, status when B3a lands). Walls: one solid per connected component of
the H1 ownership polygon, extruded to `RWall.height`; openings cut per covered piece into sill /
lintel / cased parts from `sill`/`head`; arcs discretised per §4.1 with `--curve-tol`. Floors per
room (void as hole), one slab (200 mm, Q6), flat roof (Q7, hidden by default), columns, door leaves
closed (`doorSwing` / `doorLeaves`), window frame + glazing band, grey-box furniture + the 12 T0
families laneway-house uses, `assumptions[]` ledger with provenance. Port V-GEO-01/02/04/05/07/10–12
and V-FUR-01/02 as light or heavy tests as their cost dictates.
**Acceptance.** Group A + B1–B3 of the plan's corpus (`aquarium, hexagon-pavilion, library,
relational, two-bed, imports, museum-wings` included) build; opening probes 100 %; Mesh3D hash
identical across three runs and across Node 20/22; mixed-height warning fires on `s11` only;
single-storey build ≤ 2 s.
**Must not.** Add roofs beyond flat, stairs, sun, materials; write a GLB yet.
**Depends on.** A1. **Reverse-if.** Arc-wall openings fail the probes → ship arcs as chords with a
`W3D_ARC_AS_CHORD` warning and a card for the cut geometry.

### A3 · M1a replay viewer and CLI video — `todo` · wave 2 · 4 days · model: opus; owner eyes the look

**Goal.** `archlang3d view plan.arch --replay -o plan.html` and `--video out.mp4`.
**Design.** Single-file HTML, three.js viewer subset *inlined* (pinned 0.186.1, MIT notice in the
file), no CDN, no GSAP (not open source; write easing by hand). `state(t)` is a pure function over
Mesh3D nodes ordered by D3; `window.__seek(t)` and `window.__frameHash()` test hooks (plan §6.5).
Phases: 0–40 % top-down orthographic 2D from Mesh3D footprints in stage order (first frame matches
the core SVG's view box); 40–55 % cross-fade to the core SVG (passed in at build time; light theme);
55–100 % tilt to a 30° perspective with a narrow-lens dolly and walls rising with their openings;
fixtures and furniture rise after walls; roof stays hidden. Doors closed (Q11) unless `--doors plan`.
Light theme default; `--theme dark` allowed in exports only (D11). The CLI renders video through
Playwright on a pinned Chromium plus ffmpeg (plan §6.5, pulled forward from M3), `--json` reporting
frame count, duration, hashes of key frames at stage boundaries; exit codes per §7.3. Key frames join
the pinned-Chrome pixel baseline (Q21) as a heavy test.
**Acceptance.** `laneway-house` → 15 s 1080p30 MP4 twice on one machine with identical key-frame
hashes; replay runs on every corpus plan A2 builds; the HTML opens offline; the owner looks at the
laneway, two-bed and hexagon-pavilion replays and either accepts or files one round of look notes
(this is the human vibe check the programme exists for); `__seek` round-trips (`seek(0.5)` twice
gives one frame hash).
**Must not.** Pin MP4 bytes; add a WebCodecs button (A6); mention 3D anywhere in the core docs.
**Depends on.** A2. **Reverse-if.** The 2D phase reads bare (README §5.1) → replay starts at walls;
record it.

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

### B1 · Lock check without syntax — `doing` (PR #323) · wave 1 · 1.5 days · model: sonnet

**Goal.** `arch impact --against old.arch --lock <id,…>` (and `arch diff --lock` once U.14 lands)
exits non-zero with `E_LOCKED_ELEMENT_CHANGED` when a locked element moved, resized, changed host,
changed swing, or vanished.
**Design.** Reuse `diffPlans` (`src/diff.ts`) pairing by resolved id; a lock names only elements
with a written `id=`; a lock on a name that resolves to an auto-id is refused with
`E_LOCK_UNNAMED` (diagnostic text says to write `id=`). Each violation carries both spans (old and
new) and the kind of change. `--json` lists violations. Catalogue entries, docs
(`docs/language-reference.md` impact section, `spec.llm.md` one line), a `test/lock.test.ts` with
laws: identity (same file → no violation), symmetry of "vanished" vs "appeared", and the PS0.23
auto-id-shift case as a refused lock.
**Acceptance.** A fixture pair where the exterior ring, the entry door and two windows are locked
and an interior partition moves → exit 0; move a locked window 100 mm → exit 2 with the two spans.
**Must not.** Add syntax; change `diffPlans` pairing (PS0.23 is its own card).
**Depends on.** —. **Reverse-if.** `diffPlans` cannot see a change class the lock needs (e.g. PS0.22
reshape inside the same bbox) → file the diff card first, lock ships for the classes it can see.

### B2 · `keep locked` syntax — `parked` (D6)

Opens when a consumer needs the lock inside the source. Design sketch: `keep locked <id> [, <id>…]`,
checked by `impact --against` through the same path as B1.

### B3a · Wall `status` semantics — `doing` · wave 2 · 3 days · model: opus

**Goal.** `wall … status existing|demolish|new` (and `walls from rooms … status <s>`) in the IR,
`describe`, Plan JSON, schema and lint, with the demolished wall enclosing nothing, hosting nothing
and counting in no area; default `existing`-like behaviour when absent (no byte change).
**Design.** Template: the heights change `aa6da412` (19 files). Add `status?` to `RWall` and the
derived-wall statement; parser + printer round-trip; Plan JSON `status` additive with schema; a
`describe` field per wall and a per-plan count by status; audit the 172 `ir.walls` references in 48
files and record each consumer's decision in the PR body (table: file → treats `demolish` as
absent / present / n.a.); lint: a door hosted on a `demolish` wall → `E_OPENING_ON_DEMOLISHED_WALL`;
a `new` wall is a wall. Byte-identity law for the new form; `describe`/`lint` digests unchanged over
the corpus.
**Acceptance.** Corpus digests unchanged; a fixture with one demolished partition: `describe` tiles
the two rooms as one space, reachability treats it as open, net area counts neither wall; Plan JSON
round-trips the status.
**Must not.** Draw anything differently yet (B3b); add `column`/`shaft` semantics (deferred, P2-4).
**Depends on.** —. **Reverse-if.** README §5.6.

### B3b · Wall `status` drawing, DXF, legend, example — `todo` · wave 3 · 2 days · model: sonnet

**Goal.** Demolished walls dashed (a separate `lowerWallSet` call with `lineType: "dashed"` in
`scene-build.ts`), new walls as today (optionally hatched under a sheet option, later), DXF layers
`A-WALL-DEMO` / `A-WALL-NEWW` through `classifyWallSet`, legend rows only when a status is authored,
`examples/remodel.arch` (a real apartment shell with two demolished partitions and one new one)
pinned by golden and byte-identity law, docs page section with an `arch static` fence.
**Acceptance.** Every existing golden unchanged; the new example's SVG, DXF, describe and lint
pinned; `docs:build` green.
**Depends on.** B3a. **Must not.** Touch paint order (D4).

### B4 · Quantities: `describe --facts quantities` and `arch takeoff` — `doing` (PR #324) · wave 1 · 2 days · model: sonnet

**Goal.** Geometric quantities an estimator can read, without any new claim.
**Design.** Opt-in via the existing `DESCRIBE_FACTS` mechanism (no byte change to default
`describe`): per plan and per level — wall length by category and (after B3a) status, as
`length_centreline_mm` and `length_face_mm`; room perimeter (centreline and net); floor area net
(exists) and `floor_area_with_waste_m2` **only when** `--waste <pct>` is passed; door/window counts
by kind and width; wall surface area only when heights are authored. `arch takeoff --format csv|md`
formats that block. Field names carry the convention. Catalogue nothing new; docs section; tests on
three corpus plans with hand-checked numbers.
**Acceptance.** Default `describe` digests unchanged; `takeoff` for `laneway-house` matches a
hand-computed table in the test; no field named "cost", "stud", "code".
**Depends on.** —. **Reverse-if.** D9.

### B5 · Imperial input literals — `doing` · wave 2 · 2 days · model: sonnet

**Goal.** `12ft`, `6in`, `12ft6in` as length literals, exact (1 in = 25.4 mm) with rounding half away
from zero to integer mm (consistent with the direction of PS0.26), through `src/num-format.ts`'s seam.
**Design.** Lexer (`src/lexer.ts` ~83–160) adds the two suffixes; `12'6"` and `1/2in` are refused with
a catalogued diagnostic naming the accepted forms (the quote glyphs clash with strings; `/` is
division). Grammar generators (`gen:*`), `spec.llm.md`, `docs/language-reference.md`, VS Code and
LSP token tables; byte-identity law via a plan written in feet that compiles to the same bytes as its
millimetre twin.
**Acceptance.** The twin-plan law; `MODEL_RANGE_MM` still enforced; `check:drift` green after
`gen:all`.
**Must not.** Change any output format (D8).
**Depends on.** —. **Reverse-if.** D8.

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
