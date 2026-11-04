# Preview-and-remodel cards

> **Moved:** this programme's `research/` now lives in the private sibling repository, at
> `archlang-lab/plans/preview-and-remodel/research/`.

Rules (same as `../plan-soundness/cards.md`): pick the first `todo` card whose dependencies are done
and whose wave is open (`README.md` §4). Status words: `todo`, `doing`, `done` (cut to id, title,
status, PR, commit; the as-built note goes verbatim to a dated `research/` record in this folder),
`parked`. Sizes are AI-assisted days (the archlang-3d plan's track B), ±50 %. "Model" is the
suggested executor; the main session may override. Every card lists what it must **not** do.

## 0. Gates every card runs

| When | Commands |
|---|---|
| Locally, always | `npm run check:quick` (+ `npm run docs:build` for docs); nothing else (`AGENTS.md` § How to work) |
| In CI (never locally) | `check`, `check:drift`, `typecheck:all` (a new workspace is added to its list), the Playground and 3D rows below |
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

### G5 · Wall-closure check: measure first — `done` · PR #358 · merge `dcd9a7a6` · record: `research/2026-10-30-as-built.md` § G5

### G6 · DCjson and a game-level recipe — `blocked` on the owner's reply to the Halo Forge user; closes at the N10 read if no answer (D22) · 0.5–1 day

"DCjson" could not be identified on the web. Ask the user what the format is (owner reply, drafted in
G2's file). If public and simple, a `tools/plan-json-to-<format>.mjs` recipe plus one paragraph in
`docs/import.md`'s sibling "export recipes" section. No new example is pinned for it.

### G8 · Demolished walls: the three remaining resolvers — `done` · PR #373 · merge `3185e374` · record: `research/2026-10-30-as-built.md` § G8

### G9 · The first bugs from the German-houses user — `done` · PRs #374, #376, #377, #378, #380 · merges `2649b9dd`, `350e2155`, `a6375be8`, `becf3ca8`, `e1526a4c` · record: `research/2026-10-30-as-built.md` § G9

### G10 · Design spikes for #363 and #362 — `done` · PR #383 · merge `cd10a5ef` · record: `research/2026-10-30-as-built.md` § G10

### G11 · Residue of G8 and G9 — `todo` · after Show HN · 1–2 days · model: opus

What the red-team rounds of #373–#380 left, each with its reproduction in the PR. Take them one PR per
group; none blocks a release. Four lines moved to Wave 7: the three-way open crossing, the `E_OPENING_NIB`
question and the open-ring lint (H1, H2); MCP and `batch` `dropped` (H6); the ArchCanvas block (H8).

- **Demolished walls:** `offWallFix` (`door.ts`, `window.ts`, `opening.ts`) can steer a door to a
  demolished wall; `door at (x,y) wall <category>`; the wording of `door on a.right`; `E_DATUM_NAME` on a
  dotted id; `dim faces` at a cleared crossing.
- **`validate --intent` (#365):** per-room `reachable` above the lowest storey; `windows.min` is the total of
  the matching rooms, not per room (the user was told on the issue); a `level` key on `roomsInclude`.
- **`finish` (#364):** placement-clear hints; a hinted route under a stair's high end; lifts and escalators;
  part 2, furnishing a plan with `level` blocks.
- **Open boundaries (#368):** the T of three open boundaries keeps its pier (`arms.length<3`, one line, re-pin
  `open-tee`); part 2, whether `E_OPENING_NIB` should skip an open boundary; open-ring lint.
- **Labels (#367):** `INK_EM` understates all-caps names (`WC` 0.769, `HWR` 0.739, `BEDROOM 1` 0.613 em per
  character, measured against 0.5); a circle-room pin about 3 mm from the wall gets neither report;
  "found no clear part" overclaims in an L room, where the lattice misses a clear point; `Abstell- raum`
  does not wrap.
- **ArchCanvas at its bump to 1.47:** classify `W_FURNITURE_ON_STAIR` and `W_WALL_END_SHORT`;
  `checkPredicates` now reads `levels[]`, so `mergeLevelSummaries` patches of top-level fields are ignored;
  the comment at `src/lib/agent/intent.ts:702-720` is stale; add a tripwire for each.

Must not: promise IFC; make a new language form without its byte-identity law.

## H, L, S · Wave 7: what the German-houses user reported, by order of harm (D23–D25; added 2026-10-31)

Why this wave exists. One active user filed #362–#370 with reproductions. Each entry below was probed on
1.47.0. The issues were written by the user's agent and skimmed by the user, so read their observations as
evidence and their syntax as a suggestion. Order: what goes wrong silently, then forms any house has.
Must not, for the whole wave: promise IFC; make a structural or compliance claim; add a language form without
its byte-identity law.

### H0 · Records — `done` · PR #391 (growth #34) · merge `b4453506` · record: `research/2026-11-01-as-built.md` § H0

### H1 · Name an open exterior ring — `done` · PR #394 · merge `4eab66b1` · record: `research/2026-11-01-as-built.md` § H1

### H2 · Open boundaries, the two remainders — `done` · PR #393 · merge `58c1fc81` · record: `research/2026-11-01-as-built.md` § H2

### H3 · `finish` names the rooms it leaves empty — `done` · PR #392 · merge `c0ecc0d8` · record: `research/2026-11-01-as-built.md` § H3

### H4 · `W_STAIR_TOO_STEEP` stops advising a loop — `done` · PR #398 · merge `467648f1` · record: `research/2026-11-01-as-built.md` § H4

### H5 · Parse errors that say what to write — `done` · PR #395 · merge `197a0fdb` · record: `research/2026-11-01-as-built.md` § H5

### H6 · `dropped` on the remaining paths — `done` · PR #397 · merge `76095ec4` · record: `research/2026-11-01-as-built.md` § H6

### H7 · Room in `spec.llm.md` — `done` · PR #396 · merge `3d4817d3` · record: `research/2026-11-01-as-built.md` § H7

### H8 · ArchCanvas on 1.48 — `done` · archcanvas PR #275 · record: `research/2026-11-01-as-built.md` § Batches 2 and 3

### H9 · Residue of the H cards — `todo` · after Show HN · 1–2 days · model: opus

What the red-team rounds of #392–#398 left, each with its reproduction in the PR. One PR per group; none blocks a release.

- **`W_EXTERIOR_RING_OPEN`:** silent when a closed annex (porch, garage) is built off an open shell, where `describe` then reports the annex's area with no omission reason: this one needs a different reading, and a test pins today's silence. A jog at a free end loses the span figure; a roof-terrace parapet in `exterior` fires; a fin off an open run can pair with a shell end; two open shells facing each other pair across the street.
- **Open boundaries:** the free-end nib is measured to a face that is not drawn; a narrowed continuation counts as carried on however thin; `W_CONNECTOR_AMBIGUOUS`'s straddle threshold moved from 250 to 200 mm past the line; `W_DOOR_NEAR_CORNER` calls a free end a corner; an authored wall left at a crossing keeps its cap; narrowing the nib scan to ends a boundary reaches moves 11 K1 rows instead of 19.
- **`finish`:** the note on an instance room (`u1.hall`) and the older row-room note disagree on whether a plan body can name it.
- **Rooms and doors:** `door between` on an unknown or unplaced room still names `nosuch.top`; `W_SWING_ROOM_NOT_ADJACENT` follows every relational refusal; `W_SWING_OBSTRUCTED`'s hint says `on <wall>` on a derived wall.
- **Stairs:** a straight stair whose head stands in another room than its centre under-reads what a block reads (`steps_off`), so a level can read reachable through a sealed stop; `keep stacked` passes two different blocks with one box; `W_NO_ENTRANCE` says the plan has no exterior door on an upper storey the shaft does not land in; a shaft that mismatches hides its real short-head warnings until it matches.
- **Budgets:** the `polygonLabelPoint` fallback at render, `sharedRuns` in lint, `surfaceNames` and `standsIn` run unmetered; an overlap crossing inside a placed instance reports without the place frame.
- **`batch -o`:** an output folder that does not exist fails each file with a raw `ENOENT`.
- **Stair `bounds()` (D27):** the break line overshoots the flight by 6 % of its width, 60 mm on a 1000 mm flight, past what `bounds()` declares, on every stair. This breaks the rule that `bounds()` covers every coordinate drawn; `test/block-stair.test.ts` pins it. Fix `bounds()`, never the ink, keep `drawCost` plus `bounds().length` an upper bound, and sweep `bbox`, the viewBox and `sheet.ts`.

### H10 · A polygon room's ring and overlap passes are charged — `done` · PR #407 · merge `3b7f8fef` · record: `research/2026-11-01-as-built.md` § Batches 2 and 3

### L1, L2 · L-shaped rooms, walls and doors — `done` · PRs #400, #409 · merges `1e29c3af`, `7c57c6fb` · record: `research/2026-11-01-as-built.md` § Batches 2 and 3

### S1–S3 · Turning stairs — `done` · PRs #411, #412, #414 · merges `a23a87fd`, `7e4823b3`, `d4b3faa8` · record: `research/2026-11-01-as-built.md` § Batches 2 and 3

## J · The owner's round of 2026-11-02 (D30)

### J1–J6 · Batch 1: fixes for 1.51.0 — `done` · PRs #429, #431, #428, #433, #430, #432 · merges `067c4aaf`, `e45da925`, `c23ef18a`, `a4072531`, `1974d928`, `9120cb3e` · record: `research/2026-11-02-as-built.md`

### J7–J11 · Batch 2: common forms for 1.52.0 — `done` · PRs #436, #438, #437, #439, #440 · merges `ecedd364`, `129b7dda`, `c46cbc81`, `3f3060a3`, `8533fd5c` · record: `research/2026-11-02-as-built.md`

### J12–J15 · Batch 3: interchange and languages for 1.53.0 — `done` · PRs #446, #445, #447, #444 · merges `18254724`, `cac37af4`, `cb254d85`, `db3b136c` · record: `research/2026-11-02-as-built.md`

### J16 · Residue of batch 1 — `todo` · one PR per group; none blocks a release

- **Doors and openings:** five sibling `on <wall>` hints in `src/lint/rules/doors.ts` (296, 323, 359, 421, 1089) on a derived wall; `door between <instance>` reads `E_DATUM_NAME` when a component holds an element named `top`; the span rule on a `between` run beside an authored wall; `at … from bed.left` on a mixed edge is `E_OPENING_DATUM`; a demolished wall left on the line of its replacement still refuses; the single-wall `E_OPENING_NO_SHARED_WALL` hint tells a window to use `between`, a parse error; `, in pieces` attaches to the wrong name in the several-walls message.
- **CLI:** `compile -o` into a missing directory is a raw `ENOENT`; `batch -o` overwrites on a repeated basename, silently.
- **Lint:** `W_BALCONY_NO_DOOR` ignores a cased `opening`; the tall arm's slide hint can cross a corner or leave the room, and the low arm's slide can pass where the wall has turned away; `W_SWING_OBSTRUCTED` can read "0 mm short"; Plan JSON writes `sill` for every window under the heights gate, so a round trip makes a default window look authored once `outdoor` is projected.
- **Open shell:** a jog at a free end loses the span; two open shells facing each other pair across a street; a gap ending exactly at partition ends is reported with one end or none; a parapet closing back on the ring makes the figure `exterior-ring-subdivided`; `validateIntent` binds to a partial figure with no notice of `leaves_out`.
- **`finish`:** a single-storey `void` is not read; a piece on a `void`, lift or escalator has no lint; single-storey non-residential landings read the inert context; time grows faster than storeys, so measure each candidate on its own storey; dotted furnishing of a placed component.
- **Labels:** `relocateLabels` is not order-free, so a plan can differ with its rooms reversed (`test/plans/plan-soundness/audits/first-contact-plans/2026-10-26-walls-first/6-clinic.arch`); identical anchors and texts fall back to element order; `placesFor` and `marksOf` run before the count; `wrapLabels` still judges at 0.62 em while `fitLabels` catches what it misses; an unnamed room's area figure does not shrink; Greek and Cyrillic in a browser's bold run wider than the flat 0.62 em; a mirrored `place` may choose a different form, since text is never mirrored.

### J17 · Residue of batch 2 — `todo` · one PR per group; none blocks a release

- **L rooms:** `keep fixed liv.left`, `facing` an L and `wall … between|around` an L stay refused; `W_FIXTURE_BACK_TO_ROOM` is silent in a polygon; the `W_ROOM_MISSING_DEFINING` hint quotes `at` on a polygon; `finish` leaves a kitchen in an L empty when no named wall runs beside the stove; L5, the mask tracer.
- **Kinds:** `door sliding` reads its whole `width` while the drawing passes 45 %; `takeoff` counts windows by width alone; `arch diff` reports no kind change; `hinge` and `slide` read along the wall, invisible on a `walls from rooms` edge; the reserved `no-operable-window-data` reason; unknown `set` keys parse silently.
- **Net stamp:** `schedule openings net` gives a generic parse error; no diagnostic for a sheet mixing net and centreline stamps.
- **Corner windows:** a sum of window widths counts the corner twice; a refused `walls from rooms` cascades into `E_WINDOW_CORNER`; 3D legs' prisms overlap and panes cross at the corner; `at (x,y)` corner windows still draw the pier.
- **Stairs:** a column in a landing and a wall across a long landing are unread; a wall along a leg reads "0 mm behind the bottom step"; foot and head messages outside a dwelling say "as long as the flight is wide needs 1200 mm"; `W_STAIR_NO_LANDING`'s `fix` does not name a landing; `reachesTheForm` cannot see a block inside a `component`; `docs/testing.md` §5 lists no CLI JSON payload.

### J18 · Residue of batch 3 — `todo` · one PR per group; none blocks a release

- **Interchange:** `dim radius` and `dim diameter` as radial DIMENSION types; a cased `opening` and an uncatalogued fixture as blocks; a dimension `text` holding `<>` or a backslash reads as markup in a CAD reader; `src/lint/rules/dims.ts` keeps its own tick; handles and an OBJECTS section for a stricter reader; a room labelled "Hall" flips `uses` to `entry` across a Plan JSON round trip; a piece's `hidden` or `floor` is not in `impact` or `diffPlans`, unchecked.
- **Sheet text:** `W_ANNOTATION_OVERLAP` can differ from an English twin's verdict, by design; a table key for each new word as it ships.
- **Grid:** `keep stacked` refuses a wall, against D25, and a column, one word in `STACKED_KINDS`; GBNF accepts `at axis.2 from …`; `at axis.2 + 500` lands silently off the axis on a wall not starting at 0; the word "structural" in old text (`src/axes.ts`, the reference, `column`'s doc string).
- **Gaps:** `hidden` is plan-wide, so one storey cannot hide alone; `finish --only sheet` on `scale hidden` writes a second `scale` line; a floor pattern does not turn under a `place`; PDF floors are a flat tint; a narrower `finish` route that adds only the sheet.
- **Left on #405:** L-shaped voids with a railing, `fence` and `outdoor` heights, `b/h` labels, a glass balustrade, a roof window, a bath with tub and shower from `finish`.

### Wave 6 (after the N10 read): G7 repair-convergence replay (the review rings of iteration N fading
into N+1; needs `fix`/`repair` to emit a trace, design spike first), D1, A6, archlang-3d M2+, Tier B.
