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
- **Plan JSON (#366):** MCP `compile` does not pass `dropped`; `batch -f json` does not report it.
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

### H0 · Records — `doing` · 0.5 day · model: main session

D23–D25, this section, the handoff, and in the growth repository the day-90 reading, the N10 release notes and
the question for the user. Docs only.

### H1 · Name an open exterior ring — `todo` · 0.5–1 day · model: opus

From #346 and #370. A 1000 mm gap in an exterior ring passes `validate` and `lint`; only `describe` hints at it
through `gross_internal_area_omitted`. A new lint rule in `src/lint/rules/enclosure.ts`, on the same reading as
`src/analyze/gross-area.ts` (`no-closed-exterior-ring`), catalogued in `src/error-catalog.ts`. Measure the corpus
first and judge every hit. Must not: fire on a plan with no exterior wall at all; overlap `W_WALL_END_SHORT`'s
reports; change a drawing.

### H2 · Open boundaries, the two remainders — `todo` · 0.5 day · model: opus

From #368. (a) `freeCrossingCuts` needs four arms (`src/wall-lowering.ts:155`), so a T of three open boundaries
keeps its pier; re-pin `open-tee` with the reason beside the value. (b) A boundary opened over its whole shared
edge draws no wall, so it stops counting for `E_OPENING_NIB` and its lint twin (`src/opening-relation.ts:645`,
`src/opening-junctions.ts`). Must not: relax any narrower opening; pin that with a test.

### H3 · `finish` names the rooms it leaves empty — `todo` · 0.5 day · model: opus

From #370. Rooms with `uses hall`, `utility`, `storage` or `entry` come back empty with `unresolved: []`,
against SKILL.md step 10 and `llms-full.txt`. Use the existing `note()` in `src/furnish.ts`. Must not: furnish
them; change what `finish` writes into a plan.

### H4 · `W_STAIR_TOO_STEEP` stops advising a loop — `todo` · 0.25 day · model: opus

From #362. Its fix says to draw two flights with a landing, which lint then judges as two too-steep stairs
(`src/error-catalog.ts:1500`, `src/lint/rules/stairs.ts:793`). Reword it; regenerate `docs/error-codes.md`; list
the moved hint digests. S2 restores the advice in the block form.

### H5 · Parse errors that say what to write — `todo` · 0.25 day · model: sonnet

From #370. A hyphen in an id, `,` between uses and `;` at a line end give a bare `E_PARSE`
(`src/lexer.ts:557`, `src/parser.ts:380,1362`). Add the hint. Must not: accept any of them.

### H6 · `dropped` on the remaining paths — `todo` · 0.25 day · model: sonnet

From #366. MCP `compile` does not pass `dropped`; `batch -f json` does not report it. Reuse
`src/cli/serialize.ts`. A shim release follows.

### H7 · Room in `spec.llm.md` — `todo` · 0.5 day · model: opus

The spec is at 29,999 of 30,000 UTF-16 units and L, S and #370's stair-entry sentence all need room. Free at
least 600 units by provable cuts, each with its evidence in the PR, then add the sentence on a stair entered
from the north or west. Must not: remove a behavioural constraint.

### H8 · ArchCanvas on 1.48 — `todo` · after 1.48.0 · 0.5 day · model: opus · in the ArchCanvas repository

Classify `W_FURNITURE_ON_STAIR`, `W_WALL_END_SHORT` and H1's code; `checkPredicates` now reads `levels[]`, so
`mergeLevelSummaries` patches of top-level fields are ignored; refresh the stale comment at
`src/lib/agent/intent.ts:702-720`; add a tripwire for each.

### L1, L2 · L-shaped rooms, walls and doors — `todo` · after H7 · 2.5 days · model: opus

`research/2026-10-31-g10-l-shaped-rooms.md` §10, with the rulings of D24. L1 and L2 share release 1.49.0.
`check:3d` gates L1. L3 and L4 stay closed until the user answers.

### S1–S3, S4 · Turning stairs — `todo` · after L2 · 4 days, S4 1 more · model: opus

`research/2026-10-31-g10-turning-stairs.md` §10, with the rulings of D24. S1–S3 share release 1.50.0; S4 only if
there is room before 2026-11-24. No prototype exists, so S1 opens with a probe. S1 also checks the positional
pairing at `src/circulation.ts:1301`, lists a verdict per reader of `v.size` in the PR, and runs a block-stair
fixture through `check:3d`: if the package draws it wrong, fix the package or refuse by name. If S1–S3 are not
all in by 2026-11-24, none ships before Show HN.

### Wave 6 (after the N10 read): G7 repair-convergence replay (the review rings of iteration N fading
into N+1; needs `fix`/`repair` to emit a trace, design spike first), D1, A6, archlang-3d M2+, Tier B.
