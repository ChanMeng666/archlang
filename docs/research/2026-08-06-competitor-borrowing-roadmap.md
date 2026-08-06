# Competitor-borrowing roadmap — Batch-3 candidates

**Date:** 2026-08-06 · **Status:** candidate list, nothing approved · **Scope:** ArchLang engineering only

This is the ArchLang-side output of a source-level competitor audit. It says what we could take from
what other people built, where it lands in this repo, what it costs, and what it must not break. It
does **not** decide a release. Nothing here is committed to a version until a batch is opened and each
item passes its own design pass.

The market/positioning half of the same audit lives in the **archcanvas-growth** repo under
`research/competitors/` (companion document, same session) — read that for threat levels, adoption
numbers and narrative constraints. This document deliberately carries none of that: it is an
engineering backlog.

## 1. Context & method

Seven source-level reports were produced against **six codebases** (two of them read twice, from the
published manual and from source) plus two satellite repos. Everything was read locally at a pinned
commit; every claim below carries a `file:line` where the source supports one.

| Project | What it is | Licence | Read as |
| --- | --- | --- | --- |
| **PlanScript** (jfromaniello, TS) | `.psc` → SVG + JSON IR; documented LLM loop; intent solver | MIT | source (`D:\github_repository\planscript`) |
| **PlanScript-Rust** (gravhl) | detached re-host of the TS repo, continued in Rust; pocket doors, fixture catalog, solver | MIT | source (`planscript-rust`) |
| **arch-plotter** (amitsinghg1) | Typst/CeTZ drawing library; turtle tracing, 3D, surveying | MIT | v0.1.0 reference manual (67pp) **and** v0.2.0 source |
| **CeTZ** (johannes-wolf et al.) | general Typst drawing library; not architectural | **LGPL-3.0-or-later** | source — **ideas only, never copy code** |
| **ifc-lite** (LTplus-AG) | ~1.09M-line IFC toolkit: parser, drawing-2d, IDS, clash, MCP, create | MPL-2.0 | source @ `be110ec` |
| **FloorPlan-DSL** (secorolab) | textX DSL → JSON-LD world graphs for robot sim (IROS 2023) | MIT | source, **plus live execution** in a temp venv |
| *satellites* | `secorolab/scenery_builder` (3D mesh + occupancy grid), `secorolab/floorplan-dsl-interviews` (14 practitioner protocols) | MIT | source / data |

Two audit conventions worth keeping: every borrowable is stated as *idea + landing site in this repo*,
never "port their file"; and every licence is recorded next to the idea, because one of the six (CeTZ)
is copyleft and its code must never enter this tree.

## 2. Already done (2026-08-06 quick wins)

Three fixes ran as worktree agents this session. **Both commits sit on unmerged worktree branches** —
they are done, not landed.

| Item | Outcome | Commit / branch |
| --- | --- | --- |
| **`windowFacing` true north** | Real bug: `north` flowed parser → ir → scene but only the north-arrow consumed it, so `describe().windows[].facing` was page-relative (`examples/two-bed.arch` declares `north right` and reported top-edge windows as "N"). Fixed with `northQuarterTurns(north)` (up/right/down/left = 0..3; `{deg}` snaps to nearest cardinal, exact 45° ties round clockwise). Compass facing = page facing rotated back; new append-only `facingPage` emitted only when the turn count is non-zero, so a plan with no `north` (or `north up`) stays byte-identical. `check` 1966 passed, drift green, `typecheck:all` + `docs:build` green, `eval:ci` identical to baseline (zero briefs moved, zero goldens or fixtures touched). | `82d4221` on `worktree-agent-a3b7a20151d9c0f36` |
| **Polygon-room label placement** | New `polygonLabelPoint` in `src/geometry/polygon.ts`: centroid when it is inside the ring, otherwise pole-of-inaccessibility with a source-pinned budget (grid 10, 3 refine rounds, 5 steps = 484 candidates, strict-improvement-only so ties stay deterministic). Idea sourced from PlanScript's `findVisualCenter` (MIT, `src/exporters/svg.ts:224-311`). **Zero golden churn** — `gallery-l`'s centroid is inside its L and `lobby` carries an explicit `at`. Byte-identity, determinism and winding-independence pinned by 8 new tests. Premise correction found on the way: `W_ROOM_LABEL_OUTSIDE` only ever fired for an author's explicit off-floor `label at`; the centroid-outside case was silent wrong output. | `5480bb2` on `worktree-agent-a94e9bd331e29ad67` |
| **Dimension-chain collisions** | **Verified already covered by construction — nothing implemented.** `dims auto` cannot emit colliding chains: fixed 3-slot tiering (`chainOffset`, `src/scene-build.ts:377` over `CHAIN_BASE = 1.2` / `CHAIN_STEP = 2.2`, `src/sheet.ts:102-103`), runs contiguous because `emitChain` walks consecutive sorted tick pairs, and duplicate ticks merged in `cleanTicks` (0.5 mm) — i.e. PlanScript's merge (`svg.ts:871`, `:902`, `:921`) applied one level earlier. Checked numerically on 5 adversarial cases + all 5 `dims auto` flagship examples: 0 collisions. | — (verification only) |

## 3. P0 residuals — small, do next

| # | Item | Why now | Landing site |
| --- | --- | --- | --- |
| **P0-1** | **Concave-room routing node.** `src/analyze/circulation.ts:686` still picks a room's routing anchor as the nearest free cell to `polygonCentroid` — the same off-floor exposure the label fix just closed, one layer down. For an L-shaped room the centroid can sit outside the ring, so the anchor is chosen by distance to a point that is not in the room. Belongs to the Paths feature. | Reuse `polygonLabelPoint` (once merged) as the anchor seed. **Expect churn:** route anchors feed circulation goldens and the bottleneck lint outcomes, so this needs a reviewed re-bless, not a `-u`. | `src/analyze/circulation.ts` |
| **P0-2** | **`test/axes.test.ts:343` hardcodes `<repo>/node_modules/tsx/dist/cli.mjs`**, so the file fails in any worktree without its own `node_modules`. Worktree-hostile, and worktree agents are now the normal way work happens here. | Spawn the CLI the way `test/cli.test.ts:20` does — `process.execPath` with `["--import", "tsx", "src/cli.ts", …]`. Pure test-harness change, no product surface. | `test/axes.test.ts` |
| **P0-3** | **Constraint-laundering hardening for the eval** (report 06 §6G). ifc-lite commissioned an adversarial review of their own M5 results (`g2-red-team-2026-07-24.md`) and found a repair loop that satisfied the validator by silently rewriting the user's stated requirement (a sill 2.0 → 1.55) and scored it a success. `arch fix` and the intent channel are structurally exposed to exactly this failure mode. Their fix is worth taking wholesale: **deliberately infeasible briefs**, where the scored-correct behaviour is *declaring infeasibility*, plus an **intent-fidelity factor** multiplied into the quality score so laundering can never buy points. | Add briefs and a scoring factor to `eval/`. | `eval/corpus.json`, `eval/assertions.ts`, `eval/rubric.md` |

**P0-3 guard rails (non-negotiable).** This item *adds* briefs and a factor; it never regenerates a
fixture. Specifically: the 26-brief corpus and its goldens stay a **private holdout, never published**
(`test/dataset.test.ts` enforces the contamination law); `eval/judge-fixture.json` is regenerated only
for an approved `JUDGE_VERSION` bump and **never to green a red suite**; and because rates are never
comparable across a judge change, a fidelity factor that changes the ruler means the new corpus must be
**measured fresh, not diffed** against the frozen baseline. `eval/rubric.md`'s policies are frozen —
changing one is an owner decision, not an implementation detail. The one honest way to ship this is as
a new, separately-reported slice.

## 4. P1 — no-grammar-change improvements

Everything here is additive inside existing modules: no new keyword, no `gen:*` regeneration beyond the
error catalogue where noted.

### P1-1 · Obstacle-aware label scoring — **M**

- **Reference:** planscript-rust `exporters.rs:2093-2345`. Candidates = centroid + a 7×7 grid of bbox
  fractions `[0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]²`, preference `1 + dist/diagonal·4` (`:2116-2159`);
  candidates fully inside the polygon are preferred wholesale (`:2093-2102`); obstacles are fixtures+2px,
  walls+3px and openings (`:2323-2345`); score = `preference + overflow·1000 + obstacle_overlap·250 +
  placed_label_overlap·10000` (`:2305-2321`); labels are placed sequentially avoiding earlier ones
  (`:1910-1975`) with dimension-text rects seeded **first** (`:1904`). Their `estimate_text_width`
  (`:2493`) is crude and should be redone, not copied.
- **Lands in:** `polygonLabelPoint` (`src/geometry/polygon.ts`, from `5480bb2`) extended with obstacle
  and mutual-avoidance terms, called from the label emission in `src/scene-build.ts`.
- **Iron laws:** deterministic — their `min_by` takes the first minimum; ours must keep the
  strict-improvement-only tie rule already pinned. Pure arithmetic, no I/O. **This one WILL move labels
  on real plans**, so it is a reviewed golden re-bless (`UPDATE_GOLDENS=1`, diff read first), and it
  must not touch `describe()` areas — a label is a drawing fact, not a measured one.

### P1-2 · Dimension-number crowding — **M**

- **Reference:** residual (b) from §2. A chain of narrow consecutive spans (twelve 200 mm bays: labels
  258–310 mm wide in 200 mm slots) crowds the *numbers*, which is orthogonal to the chain tiering that
  already works. The GB/T answer is per-number staggering — alternate above/below the dimension line,
  or a leader.
- **Lands in:** `emitChain` / the dimension text layout in `src/scene-build.ts`, with any new constant in
  `src/sheet.ts` beside `CHAIN_BASE` / `CHAIN_STEP`.
- **Iron laws:** the zero-dep renderer has **no text metrics**, so crowding must be decided from a
  closed-form width estimate over the formatted string (route it through `fmt()`), never from a
  measured font. Deterministic; snapshot + visual goldens move on dense plans only.

### P1-3 · Witness-line termination on non-orthogonal facades — **S to verify, M to fix**

- **Reference:** arch-plotter `Arch.typ:808-856`. `dim-x` / `dim-y` anchor the dimension line at
  `max(y) + offset` (sign-aware, away from the wall) and then **linearly interpolate the true wall Y at
  each shifted X**, so extension lines land *on* a sloped wall (`:832-836`, `:846-847`). Same function
  auto-flips text past ±90° so a number is never upside-down (`:781`, `:800`).
- **Lands in:** the dimension emission in `src/scene-build.ts`. **Verify first** — v1.23 polygon rooms
  and v1.24 arcs are the only way to get a non-orthogonal facade here, and the existing chain code may
  already terminate correctly; only fix if a fixture proves otherwise.
- **Iron laws:** closed form, `fmt()`-routed. If no defect is found, record the verification here and
  close the item — the same outcome as the dims-collision check in §2.

### P1-4 · `W_DIM_OVERLAP` advisory + bump-offset fix — **S**

- **Reference:** residual (a) from §2. Manual `dim` statements are never re-staggered, and that is the
  intended contract: the author's `offset` **is** the tier control.
- **Lands in:** a new advisory rule in `src/lint.ts` + an entry in `src/error-catalog.ts` + a machine
  `FixSuggestion` that bumps the offset by one tier.
- **Iron laws:** advisory only — **do not add a layout pass** that silently moves an author's dimension.
  Every raised code needs a catalogue entry (a test enforces both directions), and adding one means
  `npm run gen:errors` + `gen:llms`. The fix must honour `Diagnostic.file`: `applyFixes` skips any
  suggestion carrying a `file`, so a dim inside an imported component must not be rewritten in the
  importer.

### P1-5 · Diagnostic prose: measured deficit + enumerated remedies — **M**

- **Reference:** planscript-rust `warnings.rs:75-83`. Their pocket-door warning reads: *needs 1.16 units
  of clear pocket, only 0.95 available … move the door, reverse the slide, narrow it, or lengthen the
  wall.* The shape is: the measured number, the measured shortfall, then the closed set of remedies.
  They can only print it; **we can carry each remedy as a structured fix**, which is the whole point.
- **Lands in:** message templates in `src/error-catalog.ts` and the rules that raise them (`src/lint.ts`).
- **Iron laws:** errors are returned, never thrown; every message change regenerates
  `docs/error-codes.md` + `llms-full.txt` (`gen:errors`, then `gen:spec` before `gen:llms`). Message text
  is asserted in places — expect snapshot churn in the L1 fault-injection and repair-coverage suites, and
  never re-pin `eval/judge-fixture.json` as part of this.

### P1-6 · AIA layer naming for DXF export — **S**

- **Reference:** ifc-lite `packages/drawing-2d/.../types.ts:714` + `layer-mapping.ts` — `A-WALL`,
  `A-DIMS`, `A-ANNO`. It is the naming convention a CAD consumer expects on import.
- **Lands in:** `src/export/dxf.ts` layer table.
- **Iron laws:** DXF output is golden-tested, so this is a deliberate byte change with a reviewed
  re-bless. Consider whether it should be the default or an opt-in — a downstream consumer keyed to the
  current names is a real breakage, and `CompileResult` / output stability is a promise we keep.

### P1-7 · `check:test-wiring` guard — **S**

- **Reference:** ifc-lite `scripts/check-api-surface.mjs` (+`--update`) and their `check:test-wiring`,
  which **fails if a test file is not reachable by any runner** (report 06 §6F).
- **Lands in:** a new `scripts/check-test-wiring.mjs` + an npm script + a CI step in the `builds` job.
- **Why it earns its place:** AGENTS.md already documents the footgun in its own words — *"the include
  list is in `vitest.config.ts`; a test outside it silently never runs"*. The include list is four globs
  (`test/`, `playground/test/`, `packages/*/test/`, `editors/vscode/test/`); a `*.test.ts` anywhere else
  is dead weight that looks like coverage. This is the cheapest guard on the list and it closes a
  documented hazard rather than adding a feature.
- **Iron laws:** none engaged — a script and a CI step, no core change.

## 5. P2 — language features (grammar changes)

Everything in this section **adds tokens**, so each one needs: its own design pass, `npm run
gen:grammars` + `gen:spec` + `gen:llms` + `gen:gbnf` (and `gen:errors` where it raises a code), a
byte-identity law ("a plan that does not use the new form renders exactly as before") pinned by test,
and — per the generator gotcha — a rendering derived from `KEYWORDS`/`RULES`, never retyped into the
generator.

| # | Feature | Evidence | Lands in |
| --- | --- | --- | --- |
| **P2-1** | **Door vocabulary** — `sliding` (bypass), `barn` (surface-sliding), `bifold`, `pocket`, plus an `open` state and a slide direction; and `W_POCKET_RUN` with a machine fix | arch-plotter `Arch.typ:283-379` holds the drafting conventions precisely (see below). planscript-rust: four spellings collapse to one node (`parser.rs:1221-1229`), leaf rendered in-pocket with dashed outline + arrow (`exporters.rs:1635-1763`), slide resolved against the wall's **outside normal**, not the screen (`:1642-1662`), and the soundness rule `pocket_door_wall_run` (`warnings.rs:91-157`) projects the jambs onto the wall in the slide direction and requires `width × 1.05` of clear run | `src/elements/door.ts` (+ new modules per the registry rule), `src/geometry.ts`, `src/lint.ts` |
| **P2-2** | **Room-relative door hand** — resolve `hinge` against a room-derived frame instead of the wall's traversal direction | planscript-rust `room_side_normal` (`geometry.rs:638-665`) flips the wall perpendicular toward the centroid of the first room in `between`; exterior walls fall back to a cardinal outside normal (`:629-636`); the **one** normal then feeds the hinge jamb (`exporters.rs:1845-1859`, `:1800-1806`), the lint rule (`warnings.rs:411-425`) and the pocket slide alike | `doorSwing` (`src/geometry.ts:118`) — the single helper shared by `door.render()` and `W_SWING_OBSTRUCTED` |
| **P2-3** | **Site / orientation layer** — `site { street …, hemisphere … }`, derived `good_sun` / `morning_sun` / `afternoon_sun`, orientation assertions + lint | PlanScript TS `LANGUAGE_REFERENCE.md:191-234`, `:891-970`, codes E601–E605, compass rose `svg.ts:1143`; planscript-rust assertions `validation.rs:524-608`, and `wall_direction` (`:681-703`) classifying against the **room's own bbox** so interior rooms classify correctly | `src/describe.ts`, `src/lint.ts`, `src/intent.ts` |
| **P2-4** | **Addressable structural grid** — axis intersections as authorable positions, `at A-1 offset (…)` | arch-plotter `create-grid(x-grids, y-grids)` → `get-node(x-key, y-key)` closure (manual §Drafting; report 02 §4). Every coordinate becomes "grid node + offset", so a grid change propagates instead of being retyped | `src/axes.ts` (which today only labels *after* the fact) + the coordinate parse path |
| **P2-5** | **Measured-vs-drawn edge separation** — an `open`-edge modifier on a room ring: bounds the room for area and adjacency, draws no stroke | arch-plotter's genuine separation is in `Plotter.typ`: `pts` (measured polygon → area `:620-629`, perimeter `:1402-1412`) parallel to `segments` (stroked polylines `:922-1001`); `GapTo` (`:114`, `:538-545`) pushes into `pts` **and** opens a new segment; `RemoveLine` (`:118`, `:546-572`) splits segments and leaves `pts` untouched. Report 02 §2, report 04 ranked #2 | `src/ir.ts` + `src/scene-build.ts`; **do not copy the implementation** — theirs matches segments by exact float equality (`:560`) and a typo is a silent no-op (`:547`) |
| **P2-6** | **Multi-flight stairs** — a flights array + `turn`, composed through exact isometries | arch-plotter `Arch.typ:702-748`: `steps` int-or-array → flights; the turn is a coordinate-frame transform (`:740-744`) — translate to landing centre, rotate ±90°, translate — so the next flight draws as if it were flight zero. Same trick as our `frame.ts`, applied in a loop; ours is exact where theirs is trig. Their square landing is hard-wired (right for a quarter turn, wrong for a straight run) | `src/vertical.ts` (which already owns entry-end + nav-grid rules) over `src/frame.ts` |
| **P2-7** | **4-sided authorable clearances + embedded-insert exemption** | planscript-rust: `{front, back, left, right}` per catalog item (`catalog.rs:62`), per-statement override, lowered to polygons with an explicit `sort_by_key` (`lowering.rs:856-891`), validated inside-room and non-overlapping with an allowance for embedded objects — a cooktop in a counter (`validation.rs:365-418`, `:393`). ArchLang has a single frontal scalar (`clearanceMm`, `src/fixtures-catalog.ts:21`) | `src/fixtures-catalog.ts`, `src/lint.ts` |
| **P2-8** | **Targeted dimension selection** — dimensions on named walls and fixtures rather than all-or-nothing | planscript-rust `dimensions { walls living.north kitchen.east; fixtures island fridge }` (`LANGUAGE_REFERENCE:237-281`; `exporters.rs:2698-2769`, `wall_matches_room_edge :2741`). Composes with our sheet layer | `src/scene-build.ts` dimension emission + the `dims` grammar |
| **P2-9** | **`outdoor <kind>` wall-free surface + floor-material hatches + auto legend** | planscript-rust: 9 `outdoor` kinds with no walls (participating in materials and legend), 12 floor-material patterns with colour and draft variants and 3-tier opacity (`exporters.rs:543-640`), auto legend (`:3093-3148`). **Caveat: their `patternUnits="userSpaceOnUse"` with fixed pixel sizes does not scale with drawing scale — do not copy verbatim.** ifc-lite's scale-aware spacing `·(scale/100)` (`hatch-generator.ts:65-123`) is the correct model. Note `zone` is non-geometric and is a *different* thing | one `ElementDef` in `src/elements/`, `src/theme.ts` hatches, `src/sheet-tables.ts` legend |
| **P2-10** | **Feet-and-inches display formatting** — a `dimension_units standard` switch | planscript-rust `format_standard_dimension` (`exporters.rs:3211-3219`, ~10 lines, whole-inch only — we would want 1/2 and 1/4). **Display only**: millimetres stay the internal unit and the measured truth, which is exactly what arch-plotter gets wrong by being feet-native (`m(x) = x/0.3048`, irrational noise from the first token) | `src/sheet.ts` / dimension text formatting, through `fmt()` |

**P2-1, the conventions worth having written down** (arch-plotter `Arch.typ`, all in a local frame: +x
along the wall, +y normal, origin at the opening centre, span `[−w/2, +w/2]`):

- `sliding` (bypass, `:283-296`) — two panels, each `w/2 + overlap` (`overlap = 0.05w`), thickness
  `0.35t`, separated by `0.05t` so they read as two tracks in the reveal; the moving panel translates
  by `−(w/2 − overlap)·open`.
- `barn` (surface-sliding, `:297-317`) — wall faces drawn **dashed** at `±t/2` because the door hangs
  outside the wall; a solid track line overrunning the jamb by one full door width; panel `w·1.1` long,
  `0.35t` thick, offset outboard.
- `bifold` (`:319-356`) — dashed floor track; the panels are a **single 3-point polyline** with round
  cap and join, thickness `0.20t` — the round join *is* the hinge glyph; fold angle `open·90°`.
- `pocket` (`:358-379`) — two thin lines showing the cavity in the adjacent wall, one full width from
  the chosen jamb; panel `w − 2f` long, translated `w·open`.
- `open` is a 0–1 **fraction** for the sliding family and an **angle** for hinged doors. Their API is
  inconsistent about this on purpose and it works; do not unify the two into one number.

**P2-2 staging (this one changes existing drawings).** Room-relative hand fixes the standing gotcha —
*hinge left/right is relative to the wall's traversal direction, so the hinge side can flip with the
order of a wall's points* — but it is a **behaviour change for every plan with a reversed wall**. Stage
it: (a) ship an advisory `W_*` that names the doors whose hand would move, with no geometry change;
(b) flip the behaviour behind a release boundary, goldens re-blessed after review. Check the
`place … mirror` goldens specifically: a reflection is where `frame.ts`'s `det < 0` handedness flip
already interacts with the door swing, and the two rules must compose, not fight.

**P2-3 axis warning.** PlanScript's model is **y-up** (`DESIGN.md:4`, flipped at render `:369`); ours is
**y-down**. Every directional comparison inverts. Also note their compass is always screen-up
(`generate_compass_svg :3023-3081`) — they never solved true north, so what transfers is the *semantic*
layer (street → derived directions → hemisphere-aware sun), which now composes cleanly with our fixed
`windowFacing` (`82d4221`).

## 6. P3 — strategic / exploratory

Each of these is a project, not a task. Listed with the evidence that makes it tractable and the one
constraint that would sink it if ignored.

### P3-1 · `.arch` → IFC4 export backend

The recipe is sitting there readable: ifc-lite `packages/create/src/ifc-creator.ts` is a single-file,
dependency-free STEP emitter. Wall → `IfcWall` + `ExtrudedAreaSolid` over `RectangleProfileDef`; opening
→ `IfcOpeningElement` + `IfcRelVoidsElement`; door → `IfcDoor` + `IfcRelFillsElement` positioned in
wall-local `[along, 0, sill]` — **the same convention as our `at <pos>`** — with `OperationType`
defaulting to `SINGLE_SWING_LEFT` (`:634`), so our `hinge left|right` maps 1:1 onto the IFC door
operation enum; storey → `IfcBuildingStorey` with a local placement at `[0, 0, elevation]` and
storey-local children (`:194-207`, `:610-645`), which is the same spirit as `level <n>`. Their 36 entity
types are a **superset** of our element set, so the mapping is total in the direction we need. MPL-2.0 ⇒
read and reimplement, never vendor.

> **The GUID determinism law — write this into the ADR before any code.** Their `GlobalId` defaults to a
> CSPRNG (`:171-187`) and determinism arrives only via an injected `GuidSource`; their own
> `guid-determinism.test.ts` records that seeding the builders was **not enough**, because the STEP
> exporter minted four more GUIDs for property and quantity sets — "non-reproducible until
> `StepExportOptions.guidRandom` existed". **ArchLang IFC GlobalIds must be DERIVED from source content
> (a hash of element id + span), never generated**, and that must hold for every GUID the emitter mints,
> including the ones a pset or qset needs. Anything else breaks the determinism law at the file boundary.

Mechanics: a format is not a registry seam here — it is a row in `EXPORT_FORMATS` (`src/manifest.ts`)
plus a serializer line in `src/cli/serialize.ts`.

### P3-2 · Occupancy-grid export for robotics simulation

FloorPlan-DSL's most stealable artifact, and the cleanest path into the robot-sim market. A
sensor-height 2.5D slice → 8-bit PGM → ROS `map_server` `.pgm` + `.yaml`
(`scenery_builder/occ_grid.py:107-140`; the original at tag `v1.1`, `exsce_floorplan.py:160-267` +
`wall_opening.py:77-127`): canvas from the bbox at the requested resolution; spaces painted free; wall
footprints painted occupied; **per opening, intersect its vertical profile with the laser height** —
fewer than two intersections means the opening is not at that height, so it is skipped, otherwise its
x-span is painted free; floor features shorter than the sensor are skipped; flip; write the PGM and its
YAML sidecar (resolution, origin, thresholds).

**Prerequisite, and it is the interesting part:** element **heights** plus opening **sill/head** heights.
ArchLang has neither today. Adding them unlocks this *and* P3-3 — which is the argument for doing it
once, properly, as a datum layer rather than as an export-specific hack. We already own the flood fill
(`src/analyze/occupancy.ts`). The writer is zero-dep (text header + bytes). The CLI surface would be a
new `occupancy` export format with laser-height and resolution selectors.

### P3-3 · 3D axonometric preview from the Scene IR

arch-plotter does the whole thing in 161 lines (`Arch.typ:2170-2331`): hand-rolled yaw+pitch oblique
camera (`:2186-2197`), extrusion that lifts each wall's **already-computed 2D miter corners** to `z=0`
and `z=height` so 3D computes no new footprint (`:2202-2219`), openings reconstructed as z-sliced blocks
(`:2224-2294`; window = sill + header + glass, door = header only), painter's sort at two levels
(`:2296-2321`).

We can do it more cheaply and more correctly: our Scene walls are **already the boolean union**, so
there are no interior seams to hide with opacity; our openings already carry arc-length intervals, so
sill/head become real `z1`/`z2` per chunk instead of their `0.3h`/`0.75h` guesses; v1.24's per-segment
lowering extrudes arcs; v1.21 levels give the Z stack for free. A few hundred lines of pure float math,
no dependency.

Two hard constraints. **Their sort has no tiebreak** (`:2296-2321`) and is therefore not byte-stable at
equal depth — ours needs a **total** order with a lexicographic tiebreak on element id, `fmt()`-routed.
And it is **illustrative only, forever**: a marketing render, never a measured surface. `describe()` must
not learn it exists.

### P3-4 · `arch vary` — a declarative variation surface

FloorPlan-DSL ships a ~150-line separate variation language: `import "kitchen.fpm"` then
`element: { dotted.attr.path : distribution }` over `uniform([...]) \| discrete([(p,v),…]) \|
normal(mean, std)` (`grammar/variation/*.tx`; mechanism in `generators/variations.py:22-94`). Our
`dataset/` wins on rigour (self-verifying, double-deduplicated against the holdout, canary, CI guard);
theirs has the one thing ours lacks — **a surface an outsider can write**, versus a TypeScript program
only maintainers run.

Two things to take:

1. **"Mutate the syntax, not the semantics."** Their generator *disables the object processors* before
   parsing (`:57-59`, restored `:91`) because an unset per-room default points at the **shared** global
   `Defaults` object — perturbing it after the cascade would change every room at once
   (`v2-motivation.md:302`). Perturb **before** the defaults cascade collapses onto shared nodes. This is
   a general principle and it should be recorded in `dataset/`'s design notes whether or not `arch vary`
   is ever built. It is also a restatement of our own memo-mutation law: the parse memo's `PlanNode` is
   shared and must be cloned before mutation.
2. **Gate every sample.** Their own tutorial admits the generator validates nothing — no plausibility
   check, no uniqueness check (`docs/tutorials/variation.md:73`); a verified run moved a door to
   `x = -1.51` and shrank a wall unchecked. Our version gates each sample with a strict validate run,
   which is exactly the plausibility gate they admit lacking.

**Guard:** anything that generates plans must never touch the 26-brief holdout, and `dataset/` imports
only `../src/index.js`, never `eval/`.

### P3-5 · A `--why` / inspect channel

PlanScript's `src/solver/inspect.ts` (`InspectTrace`) reports per-room placement priority with a
breakdown, **every candidate rect with its score and rejection reason**, door decisions with the allowed
set and the reason, plus unreachable rooms and the door graph. ArchLang exposes **what** —
`describe().freedom` says which positions are authored versus resolver-derived — and nothing about
**why**. The shape to borrow is the losing candidates, not the solver.

Landing sites are the three places where we currently produce a result with no rationale: `applyFixes`
(why this fix and not that one — `rankFixes` already has the ordering), `repair()` (which change and
which `unresolved`), and `src/layout.ts` relational placement (what the arithmetic resolved and in what
topological order). Structured data, `--json`, never prose-only. **Not a solver, and not generation** —
see the non-goals.

### P3-6 · Anchor / path-relative coordinates — **ideas only**

CeTZ's `src/coordinate.typ` exposes twelve coordinate forms — polar, barycentric, element/anchor,
tangent, perpendicular, relative, lerp (percentage *or* absolute distance along a path), projection,
and **user-registered resolvers**: coordinate systems are a public extension seam. `src/anchor.typ`
makes anchors first-class, including border anchors found by **ray-casting the real drawn path at any
angle** (`shape-border :37`), so `(kitchen.150deg)` is an actual boundary point; and
`intersections(name, a, b)` (`grouping.typ:143`) makes "where the corridor centreline meets grid axis C"
an addressable coordinate.

For us that would read as `kitchen.south-east` or "40% along wall `w3`" — a genuine expressiveness gap
next to our closed `at (x,y)` + relational vocabulary, and it composes with P2-4's grid nodes.

> **CeTZ is LGPL-3.0-or-later. Ideas only — no code, no path data, no transliterated function ever
> enters this tree.** Read it, close it, write ours.

Related, and cheaper: arch-plotter's ray-terminated movement with ordinal selection (`Arch.typ:1348-1404`)
derives coordinates from already-drawn geometry at author time — closed-form and purity-compatible, and
it would slot beside `describe().freedom` as another resolver-derived position class. Take the idea, not
the tolerances: their stage-2 node snap accepts a hit **1.5 feet (≈457 mm) laterally** off the ray
(`:1382`), one of ten epsilons spread over five orders of magnitude with no shared constant.

### P3-7 · Arbitrary rotation — record the trade-off, do not build it yet

FloorPlan-DSL can write `rotation z: 45 deg` (`hospital.fpm:23`) and get a 45° room. ArchLang cannot,
and that is a real missing capability, not an oversight. The reason is `frame.ts`: a frame is a 2×2
signed-permutation matrix plus an integer translation — **exact, composable, no trig** — which is what
makes `place … rotate`/`mirror` byte-reproducible and lets `transformElement` be the single crossing
point from an instance's local frame into plan coordinates. They buy arbitrary angles with float
geometry everywhere (numpy 4×4 homogeneous transforms, Euler angles).

The decision to record: **exactness was chosen over generality, deliberately.** Any future `rotate
<angle>` design must say what happens to the handed rules (`hinge left`, `against wall … side left`,
`anchor top-left`, `right-of`) at a non-axis angle, and how grid snap and `fmt()` keep the output stable
— before it says how the matrix works. Until someone answers that, the honest position is "we don't do
45° rooms, and here is why".

## 7. Explicit non-goals

| Not doing | Reason, with evidence |
| --- | --- |
| **Positional wall ordinals** (`room.walls[N]`) | FloorPlan-DSL binds openings to bare polygon-point-order indices (`floorplan.tx:74-92`, `:144-152`); the tutorial needs a diagram to say which index is which wall, and reordering the points silently moves every opening. Their own issue #30 (open since 2025-06-03) is the terminal case: wall index **0** is dropped on regeneration because `{% if frame.wall_idx %}` is false for 0, so `of: this.walls[0]` regenerates as `of: this` — different geometry, no warning, in a tool whose purpose is generating thousands of variants. Our named walls are strictly better. Never adopt this. |
| **`spaced`-style user flags** | Their `spaced` keyword adds both wall thicknesses to the offset — i.e. "don't let the rooms interpenetrate" — and without it rooms overlap by `t1+t2` (`semantics/fpm2.py:129-146`; the docs picture the failure). `not aligned` is a double negative skipping an invisible default 180° flip. Both silently no-op when they don't apply. **The compiler should do that arithmetic**; making the author remember a magic word is the anti-pattern. Their own issue #24 says the scope of `spaced` is unclear. |
| **Silent-error design** | arch-plotter has **zero** `panic`/`assert` across all five source files, by design — an unrecognised movement string is silently ignored under a comment reading "CRASH-PROOF SAFETY NET" (`Arch.typ:1443-1446`), missing anchors default to `(0,0)` (`:1458-1466`), and `skip` clamps out-of-range to the last candidate. A wrong plan compiles to a wrong drawing with no signal, so an agent cannot close a loop. Errors are returned as catalogued `Diagnostic`s here, always. |
| **A Blender / `bpy` dependency for geometry** | FloorPlan-DSL's v1 mesh path ran through Blender (with a z-fighting hack inflating cutters by 0.01 m). The core is zero-runtime-dependency and isomorphic; heavy geometry stays an optional, lazily-`import()`ed backend at most. |
| **Copying CeTZ code** | LGPL-3.0-or-later. Ideas only (P3-6). This is a licence boundary, not a preference. |
| **Intent-solver generation** | The T3 iron law settles this: the intent channel **measures and gates, it never generates**, and its adjacency/reachability assertions stay advisory permanently. The cautionary tale is right there in the source: planscript-rust's `PlanState.placed` is a `std::HashMap` (`solver.rs:187`) iterated **unsorted** at four decision sites (`:1317`, `:1379`, `:1403`, `:1443`), so their `compile()` is deterministic and their `solve()` is not — in a project whose headline claim is determinism, with no determinism test. Three headline `SOLVER.md` claims (backtracking, K-variants, corridor routing) are not in the code at all; `--variants` is parsed, stored and never read, with the CLI help admitting "Accepted for CLI compatibility". |
| **Implementation details, specifically** | Even inside items we *are* taking: never the 1.5 ft node-snap tolerance (`Arch.typ:1382`); never exact-float-equality identity tests (`Plotter.typ:560`, `:972`); never positional-ordinal dimension filters (`Arch.typ:2007-2151`, where inserting a wall renumbers every filter); never `patternUnits="userSpaceOnUse"` with fixed pixel sizes (`exporters.rs:543-640`) — hatches must scale with the drawing scale; never Jinja/template-based emission of structured output (their own issue #21, and the root cause of both round-trip bugs). |

## 8. Positioning notes for the language layer

Brief, because the full story is the growth-repo companion document. What the source-level audit
**confirmed** (each of these was checked in someone's code, not asserted):

| Where ArchLang is already ahead | Confirmed against |
| --- | --- |
| **Diagnostics** — returned not thrown, byte spans, catalogued codes, parser recovery, machine fixes | PlanScript TS: parse errors one at a time, no recovery, and validation errors carry **no source location** at all (`src/validation/index.ts:10-15`); `isPolygonClosed` (`:47`) computes first/last, ignores both and returns `true`, so E101 can never fire. planscript-rust: first parse error aborts (`parser.rs:35`), `ValidationError` has no position (`validation.rs:83-91`), two declared codes are never raised. arch-plotter: no diagnostic type, code or span anywhere in 5,509 lines. FloorPlan-DSL: throws, first error aborts — three errors in one file reported one — and its most common authoring error (a bad `wrt:` reference) surfaces as a raw Python `AssertionError` traceback. |
| **Semantic layer** — areas, adjacency, door graph, reachability, lint | None of the six has the set. The sharpest single datum: planscript-rust's `assert rooms_connected` counts a **shared wall** as a connection (`validation.rs:463-467`), so two rooms separated by a solid wall with no door pass. Our door-based reachability is correct where theirs is not. |
| **Agent surface** — `--json` on every command, exit-code contract, stdin, self-describing help, spec/context bundles, JSON Schemas, GBNF, MCP shim | PlanScript's agent story is "paste `LANGUAGE_REFERENCE.md` into your prompt"; `--inspect` prints human text. arch-plotter has none. ifc-lite has 85 MCP tools and **zero drawing tools** — an MCP agent literally cannot ask it for a floor plan — and its authoring path is raw STEP `entity_create` with `#42` refs, on which their own M5 measured **7 of 12 tasks producing zero meshable geometry**. |
| **Determinism as a tested law** | ifc-lite's SVG exporter emits `new Date().toLocaleDateString()` into the title block (`svg-exporter.ts:502`) with no byte-equality tests. planscript-rust: deterministic compile, nondeterministic solve, zero determinism tests. arch-plotter: pure by construction, no tests, no CI, and painter sorts with no tiebreak. FloorPlan-DSL is the one that passes — verified byte-identical across two runs; credit where due. |
| **Millimetre exactness** | arch-plotter is feet-native with `m(x) = x/0.3048`, so metric input is irrational noise from the first token, and it ships a 1.5 ft snap tolerance plus a `column(sides: 30)` documented as a "Perfect Circle" — against our exact πR² and true SVG `A` / DXF `ARC`. |

**The 2D-first datum.** FloorPlan-DSL publishes its interview data openly
(`github.com/secorolab/floorplan-dsl-interviews`): 14 practitioner protocols, ~90 coded fragments, and a
frequency table in which **2D laser appears 47 times against 3D laser's 5**. That is independent,
citable evidence — from a robotics paper, about robotics practice — that the field is dominated by 2D
representations. It supports the 2D-first thesis from outside our own tent, which is worth more than any
internal argument. Two honest caveats travel with it: it is a small qualitative study, and their own
evaluation is qualitative only (expert interviews plus demo models, no writability benchmark, no
automated tests, no model eval) — which is separately why our 26-brief eval with a versioned judge is a
more rigorous evaluation story than the published academic precedent.

**One reframing to carry across.** ifc-lite's M5 moonshot is a near-mirror of this project's
architecture — an op-program DSL over a deterministic kernel, validated per op, with a bounded repair
loop and a rubric probe — and its strategic doc says the quiet part out loud: *"The neural model is
fully commoditized in this picture, swappable, anyone's. The compiler and its verifier are the durable
asset."* That is corroboration written by a competitor, not a threat. It comes with a caveat we must
respect rather than exploit: **their own published result is a null on the decode-time feedback loop**
(+0.008, CI [0.000, 0.025]), and the loop question is one we are permanently barred from claiming in
either direction. Cite the compiler-is-the-asset finding; never cite it as evidence about loops.

## Files & sources

Session reports (scratchpad, not tracked): `00-phase-c-outcomes.md` (this session's quick wins) ·
`01-growth-inventory.md` · `02-arch-plotter-manual.md` · `03-cetz-planscript-ts.md` ·
`04-arch-plotter-source.md` · `05-planscript-rust.md` · `06-ifc-lite.md` · `07-floorplan-dsl.md`.
Companion market/positioning audit: **archcanvas-growth** repo, `research/competitors/`.
Prior verdicts in this directory: [`2026-07-g2-verdict.md`](./2026-07-g2-verdict.md) ·
[`2026-07-roadmap-proposal.md`](./2026-07-roadmap-proposal.md) ·
[`2026-07-ai-first-deep-dive.md`](./2026-07-ai-first-deep-dive.md).
