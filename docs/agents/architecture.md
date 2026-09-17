# Architecture, conventions & repo layout

> Moved verbatim from `AGENTS.md` (2026-09-18) so it loads on demand: the "Architecture & Conventions" section, then the monorepo layout and the key `src/` module map that sat under "Standing decisions & iron laws". Read it before changing anything under `src/` or adding an element, format, generator or workspace.

## Architecture & Conventions

ArchLang is a compiler pipeline. Source text → backend-neutral **Scene IR** →
backends, in stages:

```
source (.arch)
  └─ src/lexer.ts       hand-written lexer  → Token[]   (byte spans)
  └─ src/parser.ts      recursive descent   → PlanNode  (src/ast.ts); recovers, never throws
  └─ src/import.ts      link `import`s through the World seam (the one I/O phase)
  └─ src/ir.ts          resolve(): expand scripting, grid-snap, auto-id, host openings,
                        relational placement (src/layout.ts) → ResolvedPlan
  └─ src/scene-build.ts toScene(): elements → primitives, hatches, page sizing → Scene (src/scene.ts)
       └─ src/wall-lowering.ts  lowerWallSet(): the WHOLE wall set in one joinery pass
            └─ geometry/band.ts      each wall as exact mitred EdgeLoops + openingCut
            └─ geometry/intersect.ts closed-form meets + half-open ray crossings
            └─ geometry/joinery.ts   joinWalls(): split · classify · keep · chain → one outline
  └─ src/backends/      pure serializers of the Scene:
       svg.ts (default, zero-dep) · png.ts (optional @resvg/resvg-js)
  └─ src/export/        dxf.ts (zero-dep) · pdf.ts (optional pdfkit)
  └─ src/index.ts       compile() — orchestrates the above; memoizes by source + extension id
```

- **`src/index.ts` is the only public surface.** It exports `compile(source, opts) =>
  { svg, errors, warnings, diagnostics, ast?, scene? }` plus the backends, the
  extension registry, the World seam, and the types. The `CompileResult` is
  **append-only** — add fields, never remove/rename.
- **`compile()` is pure, synchronous, and isomorphic** — no I/O, no `Date.now()`, no
  `Math.random()`. This guarantees determinism and lets it run in the browser. Do **not**
  introduce non-determinism or Node-only APIs into the `src/` core. The CLI (`src/cli.ts` +
  `src/cli/`) is the one place Node APIs and real time are allowed; everything else gets its
  environment injected through the **`World`** seam (`src/world.ts`).
- **Optional power is lazily `import()`ed.** The remaining heavy/native deps (pdfkit, resvg) are
  `optionalDependencies`, loaded only at point of use, so the default SVG path pulls nothing.
  **Clipper2 is no longer one of them:** since v1.30 every wall is joined by one closed-form
  zero-dependency pass, so no `GeometryBackend` is consulted while rendering and `clipper2-wasm`
  is a **devDependency** — the angled oracle for `test/joinery-oracle.test.ts`. The seam's exports
  are kept and documented deprecated; removing them is a MAJOR. See
  [ADR 0018](../adr/0018-zero-dep-wall-joinery.md), which amends
  [ADR 0002](../adr/0002-optional-dep-geometry.md).
- **Errors are returned, never thrown** for user-source problems. Push a `Diagnostic` (with a
  byte `span` and an `E_*`/`W_*` `code` documented in `src/error-catalog.ts`); the parser
  recovers and reports all problems in one pass.
- **Adding an element = one module** in `src/elements/` exporting an `ElementDef`, registered
  in `src/elements/defs.ts`. Parse/resolve/render dispatch through the registry, not a switch.
- **Output formats are deliberately NOT a public registry seam** (unlike elements/themes/
  hatches/geometry-backend): formats drag optional native deps and CLI flags with them, which
  a registry can't abstract cleanly. Adding one = a row in `EXPORT_FORMATS`
  (`src/manifest.ts`) + a serializer line in `src/cli/serialize.ts` `serialize()`.
- **Coordinates are millimetres**; origin top-left, +x right, +y down (matches SVG).
- **Rendering constants** (colours, line weights, fonts) live in the theme (`src/theme.ts`)
  and the size formulas in the backends — tune there, not inline.
- **Zero runtime dependencies in the core is a feature.** Don't add a hard runtime dep;
  prefer arithmetic or an optional lazy dep.

## Monorepo layout & key `src/` modules

**Monorepo layout (npm workspaces, one root lockfile):**

```
.                     @chanmeng666/archlang — the core (PUBLISHED package; src/, dist/)
├─ spec.llm.md        GENERATED one-page language spec for agents (`arch spec`, `gen:spec`)
├─ SKILL.md           agent Skill: the spec → compile → fix → describe → validate loop
├─ llms.txt           machine-readable project map (USE vs CONTRIBUTE)
├─ llms-full.txt      GENERATED full agent context (spec + skill + CLI + errors; `gen:llms`)
├─ schemas/           GENERATED plan.schema.json (`gen:plan-schema`) + intent.schema.json (`gen:intent-schema`), both drift-tested
├─ grammars/          GENERATED archlang.gbnf — GBNF constrained-decoding grammar (`gen:gbnf`)
├─ packages/mcp/      @chanmeng666/archlang-mcp — stdio MCP shim over the library (SDK dep quarantined
│                     here): src/server.ts, server.json (registry manifest), scripts/ (copy-resources +
│                     check-dist-resources staleness gate), test/ (tools · resources · lockstep · fuzz) — see ADR 0012
├─ editors/vscode     archlang-vscode → published as ChanMeng.archlang (esbuild-bundled extension);
│                     src/handlers.ts holds the DI'd LSP logic, test/ covers it + the built stdio bundle
├─ editors/*.json     generated TextMate grammar + language-configuration (shared by the extension)
├─ playground/        Vite + CodeMirror live editor (consumes built core via dist/); styles under
│                     src/styles/{tokens,chrome,editor,panels,embed}.css (tokens.css = the brand block);
│                     also ships embed.html — a chrome-less <iframe> viewer read from the #z= hash;
│                     test/ = pure-logic units, e2e/ = Playwright specs against the BUILT app
├─ docs-site/         VitePress docs (pages generated from docs/*.md, examples/*.arch); theme CSS as
│                     .vitepress/theme/{style,home,doc-pages}.css (style.css = the brand block);
│                     examples are live/editable <ArchLive> widgets; e2e/ = Playwright route + hydration specs
├─ docs/              language-reference.md · analysis.md · intent.md · error-codes.md (GEN) ·
│                     cli-reference.md (GEN from src/manifest.ts, `gen:cli`) · testing.md (the verification-system
│                     map: tiers, guards, what to do when one goes red) · adr/ (archive/ holds the frozen WORK-LOG)
├─ brand/             logo kit + brand book (README.md) — archlang-logo-master.svg is byte-sacred (iron law)
├─ examples/          30 plans, each the flagship of ONE thing (plus lib/ and the twenty committed
│                     README_SVGS renders — see `gen:example-svgs`). Showpiece: hillside-villa
│                     (the whole language on one sheet — a two-storey villa with an attached
│                     garage, A2 @ 1:50: `site`, a polygon nook, an L-shaped suite, an `arc` bay,
│                     all five door kinds, a two-level `stair` shaft, a `void`, a `roof overhang`,
│                     and a mirrored `place … mirror x` component; three deliberate lint warnings
│                     — W_BATH_VIA_BEDROOM ×1, W_ROOM_NOT_EQUATOR_FACING ×2 — left in and named in
│                     the source, so it is NOT strict-clean by design).
│                     OUTDOOR flagship: garden-house (the site plan — a two-storey family house
│                     on a 22 x 22 m lot, A2 @ 1:100: `site … boundary`, twelve `outdoor`
│                     surfaces across eight of the nine kinds, a `panel` fence round the pool
│                     and a `picket` one at the street, `uses garage` + `door garage`, and 15 of
│                     the 21 outdoor fixture families; ONE deliberate lint warning, named in
│                     the source — W_ROOM_NOT_EQUATOR_FACING x1. It used to carry a SECOND,
│                     W_BATH_VIA_BEDROOM, that was a FINDING rather than a layout mistake: the
│                     balcony door on L2 grounded its storey and suppressed the stair's arrival
│                     edge, so the BFS entered through the bedroom instead of the landing. Fixed
│                     — `levelIsGrounded` (`src/vertical.ts`) now discounts an exterior door
│                     whose outward probe lands inside an `outdoor balcony`; backlog 4.6 closed).
│                     It was also invisible in the playground until 2026-09 — the menu is now 27
│                     presets, gated two-way by `test/playground-examples-rows.test.ts`.
│                     Start here: one-room (the
│                     smallest plan that draws anything) · studio (the lint-clean, IMPORT-FREE
│                     flagship) · attached (nothing positioned by hand).
│                     Homes: laneway-house (the SIGNATURE plan — every opening on a wall run, every
│                     fixture on a room or wall, nothing hand-placed) · tiny-house (barn/bifold
│                     doors, now with eaves) · garden-loft ·
│                     two-bed (repaired — was `ok:false` with 6 warnings before the 2026-08
│                     gallery refresh) · bungalow (the DOOR-KIND flagship, and since v1.29 the `roof`
│                     one: `roof overhang 600`, now on a sheet — A3 landscape, schedule) · furnished-flat (the FURNITURE
│                     flagship: 30 statements covering 29 of the 36 catalogued glyph FAMILIES,
│                     across all five symbol domains, with no `label` on any of them and no
│                     `size` on most — the four v1.29 families and the `underlay` rug among
│                     them; since the 2026-08 gallery refresh also on a sheet — A3 portrait,
│                     schedule) · courtyard-house (the CONCAVE
│                     flagship: a U whose centroid is off its own floor and whose windows face out
│                     of a court, now with eaves) · townhouse (three levels, A3 portrait, now with eaves on
│                     L3) · terrace-row (one `component`
│                     placed four times) · two-storey (and since v1.29 the `void` flagship: a
│                     gallery over the ground floor, on L2 only, now with eaves on L2) · accessible (accTitle/accDescr, furnished).
│                     Public: museum (the LARGE-building flagship: paper A1 @ 1:200, furnished) · library
│                     (entrance hall furnished) ·
│                     transit-hall (kiosks and lobby furnished) · clinic (entrance furnished) ·
│                     hexagon-pavilion (oblique polygon rooms).
│                     Geometry: gallery-l (the POLYGON-room flagship, furnished, `theme presentation`)
│                     · aquarium (the CURVED-geometry
│                     flagship: a drum of two arcs round a `room circle`, A2 @ 1:200, furnished).
│                     Composition: parametric · relational (living room and kitchen furnished) · imports
│                     · museum-wing + museum-wings
│                     (the COMPONENT-v2 flagship: one wing authored in local coords, imported as a
│                     whole FILE and placed twice, once mirrored) · lib/.
│                     Style: themed (living room and bedroom furnished) · materials (the only user
│                     of `style <kind> { … }`, office furnished).
├─ eval/              NL→ArchLang authorability harness: corpus.json (26 briefs) · goldens/ · run.ts ·
│                     assertions.ts + synonyms.ts (re-export SHIMS over src/intent*.ts since T4) ·
│                     judge-fixture.json (byte-equivalence) · rubric.md (frozen) · faults/ + l1.ts (L1 gate) ·
│                     g1/ (Gate G1, PASSED) · l2.ts + l2-run.ts (T3 harness, live run never dispatched);
│                     offline gate `npm run eval:ci` in CI; guarded live `npm run eval:live` (see iron laws);
│                     PLUS the v1.25 intent-FIDELITY slice — corpus-fidelity.json · fidelity.ts ·
│                     fidelity-run.ts · fidelity-plans/ (faithful + laundered twins) ·
│                     fidelity-results.md, run by `npm run eval:fidelity`. Own corpus, own
│                     scorecard, JUDGE-FREE: it never touches corpus.json/judge-fixture.json and
│                     shares NO ruler with the 26-brief rate
├─ dataset/           repair + authoring dataset generator (`npm run dataset:gen`, tsx, no new dep):
│                     generate.ts · templates.ts · faults.ts · trajectory.ts · briefs.ts · rng.ts · diff.ts ·
│                     dedup.ts · canary.ts · CARD.md (HF README) · out/ (.gitignore'd jsonl); imports ONLY
│                     the pure core, never eval/; contamination iron law enforced by test/dataset.test.ts — CC0
├─ scripts/           check-test-wiring.mjs (fails if a tracked *.test.ts sits outside vitest.config.ts's
│                     include globs, or an include glob matches nothing — it PARSES the globs out of the
│                     config rather than duplicating them) + the
│                     single-source generators behind the `gen:*` npm scripts (gen-grammars, gen-error-codes,
│                     gen-llm-spec, …) + smoke.mjs (zero-dep post-deploy/nightly route check) + changelog-section.mjs
├─ bench/             ~1000-element timing harness (+ --json mode, CI regression comment)
└─ test/              vitest: snapshot + fast-check + unit + visual-regression + CLI/describe/lint/eval +
                      the cross-surface guards (lockstep, docs tripwires, escape fuzz) — map in docs/testing.md.
                      The root vitest run ALSO includes playground/test, packages/*/test and editors/vscode/test
```

Key agent-facing `src/` modules (all pure, exported from `src/index.ts`): `describe.ts` (semantic
summary; `.caption` = accessible one-liner, `.freedom` = authored-absolute vs resolver-derived
placement), `lint.ts` (soundness rules), `analyze.ts` (shared resolve pipeline + rectilinear geometry
behind both), `geometry.ts` (shared door-swing quarter-disc), **the fixture-symbol layer** —
`elements/glyph-lib.ts` (the shared drawing vocabulary every symbol is built from: `dot`/`ring`/
`arcSeg`/`insetRect`/`ellipsePoly`/`dashedPattern`/`easedRing`, each factory setting the named
`lineWeight` AND the raw `paint.width` from one ramp, because the SVG serializer follows the name
and the PDF serializer follows the number. **A helper moves here on its SECOND caller and it moves
VERBATIM** — v1.32 promoted `easedRing` out of `glyphs-living.ts` when the reception counter
became its second user, and the L-sofa's bytes did not change, which is the whole point of moving
it unedited. A helper with ONE caller stays in its domain module: `sofaBody`, which `drawSofa` and
`drawLoveseat` share, lives in `glyphs-living.ts` and belongs there), the six domain modules `elements/glyphs-bath`/`-kitchen`/`-bedroom`/`-living`/`-misc`/`-outdoor.ts`
that draw the art (`-outdoor` is the v1.31 site tranche — planting, garden furniture, parked things
and the small standing objects; nothing in it is `requiresWall`, because outdoors the wall is the
exception), and `elements/fixtures-glyphs.ts`, which now holds only the dispatch plus the
single-source `FIXTURE_FAMILIES` table that `FIXTURE_CATEGORIES` (129 words) and `CANONICAL_FIXTURES`
(83 families) are both DERIVED from — `hasFixtureGlyph` is what the legend filters on, so an
uncatalogued word still falls through to the labelled rectangle. Its semantics live next door in
`fixtures-catalog.ts`, where three flags are deliberately distinct and must stay so: **`requiresWall`
means SERVICES and only services** (the plumbed and vented goods — flagging room furniture raised 23
spurious floating-fixture warnings across nine shipped plans), **`directional`** carries the derived
quarter-turn for the eleven categories whose symbol has a back worth turning to a wall (`sofa`/
`chair`/`bench`/`desk` deliberately do NOT — seating is arranged, not installed), and **`underlay`**
marks a piece that lies flat and is stood on, read by exactly one shared predicate,
`solidFurniture()`, so the overlap rule, the clearance rule, the nav grid and the per-room flood fill
cannot disagree about what a rug is. `elements/roof.ts` (`offsetRingOutward` — the closed-form mitred
outward offset of a closed wall ring: line–line intersection with orientation from the shoelace sign,
exact at any angle and on either winding, refusing an `arc` edge rather than approximating it) and
`elements/void.ts` (a hole in this storey's floor plate: it obstructs the nav grid as a
`VerticalObstacle` while lifting its walkable halo on all four edges, does **not** reduce the
containing room's area — `describe().voids[]` gives the extent so a consumer can subtract — and finds
its room through the poly-aware containment test, never a bounding box). Both are drawing-only and
neither adds a `Theme` key: they reach existing paint through `STYLE_KEYS`. **The v1.35 VERTICAL
DATUM — `src/datum.ts`** (the six drafting defaults, `elevationOf`, the two range predicates and
`plansAuthorHeights`): `height` at three sites (a plan setting, a `level` header clause, a `wall`
clause) and `sill`/`head` on the three opening elements, all of which **draw nothing at all**
because a floor plan is a horizontal cut. The fallback chain is wall → level → plan →
`STOREY_HEIGHT`, resolved ONCE into `ResolveCtx.storeyHeight` and never re-derived per element;
**elevation ACCUMULATES the storeys below rather than multiplying a level number by one height**,
which is the whole reason `level … height` exists; and heights are deliberately NOT grid-snapped
(`grid` snaps plan coordinates so rooms line up with each other, and a height shares no axis with
them). Its refusals are refusals, not clamps: `E_HEIGHT_RANGE`, `E_SILL_ABOVE_HEAD` and
`E_OPENING_ABOVE_WALL` — the last measured against the HOST WALL, not the storey. **`describe()`
and Plan JSON emit the height keys ONLY when the source authored a height somewhere**, and the gate
is ONE boolean, `ResolvedPlan._heightsAuthored`, read by both so they cannot disagree — whole-PLAN
rather than per-storey, so a plan authoring nothing emits nothing
(`test/height-byte-identity.test.ts` pins that over all 30 examples and every storey).
**The v1.35 AXONOMETRIC VIEW — `src/view/{camera,extrude,paint,iso}.ts`**, `toIso` being a
SIBLING of `toScene` that produces the same `Scene` type, so every backend draws it unchanged.
Three laws, all pinned: **`describe()` never imports `src/view/`** (a grep guard, plus
`DescribeOptions` not admitting a `view` at all — an illustrative projection must never become a
measurement); **no `Math.cos`/`sin`/`tan`/`atan` anywhere under `src/view/`**, because those are
implementation-approximated in ECMAScript while `Math.sqrt` is exactly rounded, and CI spans two
operating systems and three Node versions; and the painter's order is **TOTAL**, its depth
quantised through the same `fmt2` the coordinates print at so two faces that serialise identically
cannot swap. It computes NO footprint of its own — `joinWallSet` (extracted from `lowerWallSet`)
hands it the drawing's own `EdgeLoop[]` before `emitLoops` narrows them, and an opening's glazing
band is `openingCut` asked for a wall 20% as thick. Two things a future editor must know: the SVG
backend's per-CAD-layer `<g>` grouping **RE-ORDERS nodes within a pass**, which is why a view emits
one flat group (the first render read as an open box); and the `V-3D-*` layers sit outside the
`A-`/`L-`/`C-` NCS discipline namespace and are declared in the DXF table only on a drawing that
uses them. **A view REFUSES rather than silently falling back to the plan** — `--view` with `-f
txt`, with `--ascii`, with `--level` or with `--overlay` all exit 3. Roof, furniture, ground, stairs
and every annotation are deliberately NOT drawn —
`roof` most pointedly, because ArchLang stores an eaves outline and no pitch. See
`docs/axonometric.md`. **The v1.31 GROUND layer
— `elements/outdoor.ts` and `elements/fence.ts`** (nine ground kinds and three fence styles, drawn on
`L-PLNT`/`L-SITE`/`A-FLOR-BALC`; the seven ground hatches live in `hatches.ts`'s one shared `META`
table beside the wall materials, each **scale-aware** off `c.gap * k * c.scale` and each painting no
background so the element's tint shows through — and a `hatch` node carries its `url(#…)` in the
PAINT, so a node that names a material and leaves `fill: "none"` draws nothing at all. Neither element
is a room or a wall: ground is absent from `rooms[]`, `totals.floor_area_m2`, the access graph and
Plan JSON, reporting itself in `describe().outdoor[]` + `totals.outdoor_area_m2`, and a fence hosts no
opening. Their two advisory rules live together in `lint/rules/outdoor.ts` (`W_OUTDOOR_OVERLAPS_ROOM`,
`W_BALCONY_NO_DOOR`), and the things that STAND on the ground are ordinary fixtures drawn by
`elements/glyphs-outdoor.ts` — the sixth domain module, 21 families, none of them `requiresWall`.
`OUTDOOR_LAYERS` is exported because `label-placement.ts` and the ASCII backend must both
skip it — the ASCII room pass identifies a room as "a polygon on the `floor` pass" and read a lawn as
one). `diagnostic-json.ts` (`diagnosticToJson` line/col/`fix` projection), `backends/error-svg.ts`
(`renderErrorSvg`), `intent.ts` + `intent-concepts.ts` (intent channel, shared with the eval via
shims), `vocabulary.ts` (`matchVocabulary` label matcher), `sheet.ts` (the sheet layer: the ISO 216 table, the
sheet-millimetre drafting constants, `sizesFromPaper` — the second `RenderSizes` constructor — and the
closed-form fit/auto-fit rule; a plan with no `paper` never reaches it), `axes.ts` (`numberAxes` /
`axisLetter` — the GB/T positioning-axis grid and its derived labels) and `sheet-tables.ts`
(`roomSchedule` / `legendEntries` + their Scene layout, so all four backends draw the margin tables
from one place), and `vertical.ts` (the shared `stair`/`elevator`/`escalator` semantics: which end a
run is entered from — a closed-form drafting convention, `dir`-dependent, used by BOTH the symbol and
the nav grid — what its footprint does to circulation, and `verticalConnections`/`verticalReach`, the
same-id-on-two-levels shaft graph that `describe().vertical`, `lint`'s per-storey reachability and
`checkGraph` all read), `site.ts` (the v1.25 orientation layer, and the ONE place a page direction becomes a compass one: `windowFacingPage` — which probes one wall thickness off each face of a window's own host segment and takes the side no room occupies, exact at any wall angle and the only rule that is right for a COURTYARD — plus `toCompass` and `deriveSite`. **`northQuarterTurns` is NOT here: it lives in `describe.ts` (`:548`), its historical home, and `site.ts`'s own header says so** — this line claimed `site.ts` for three releases. `describe()` AND the site lint rule both call `windowFacingPage`, because a second place to apply the north rotation is a second place to get it wrong), `label-placement.ts` (the post-pass inside `toScene` that moves a room's name and area text off furniture, swings, stair symbols and dimension text — it must run AFTER `lowerWalls` and after `dims auto`, because that is the only point at which a dimension number exists to avoid; it relocates only when >2% of the label box is buried, so a clear plan keeps its exact bytes), `text-metrics.ts` (`EM_PER_CHAR`/`textWidth` — the renderer has NO text metrics, so this closed-form estimate is the single source the label pass, the dimension stagger, `W_DIM_OVERLAP` and the error card all share; a test pins the literal to this one file so a fifth copy cannot appear), `lint/measure.ts` (the measured-deficit arithmetic behind the value/shortfall/remedy diagnostics), `elements/door-panels.ts` (the sliding/barn/bifold/pocket/garage panel geometry, emitted as the SAME Scene primitives every backend already serializes — no per-backend door code exists; the v1.31 `garage` arm is the module's first node with a NAMED `lineType`, and it settles the drawing's dash convention: **a dashed outline means a thing above the cut plane**, which is what `upper_cabinet`, `roof`, `void`, the outdoor `pergola`/`shed` and this projection now all say through the one `dashedPattern()` helper — closing half of backlog 5.5. Its projection side is DERIVED, not written: `door.ts`'s `roomSideOf` probes one wall thickness off each face and asks which side has floor, so `DOOR_KIND_CLAUSES` gives that kind no `swing` clause to contradict a fact with, and no clause at all besides), **the wall-joinery layer** — `wall-lowering.ts` (`lowerWallSet`, the ONE path every wall takes:
bands, cuts, `joinWalls`, then one `hatch` node per material group and ONE outline for the plan; it
lives outside `scene-build.ts` only because `elements/wall.ts` delegates to it and
`scene-build → registry → defs → wall` would otherwise be an import cycle), `geometry/band.ts`
(a wall as closed `EdgeLoop`s — two offset faces, end caps, an exact mitre at every interior vertex
bevelled past `MITER_LIMIT · h`, true arcs on a curve — plus `openingCut`, which is a rotated
rectangle on a straight host and an annular sector with RADIAL jambs on a curve; **every loop obeys
the orientation law, material on `+perp` of travel**, which is what lets the classification be
analytic), `geometry/intersect.ts` (the closed-form meets and ray crossings, no epsilon nudging) and
`geometry/joinery.ts` (`joinWalls` — split at every mutual crossing, classify each sub-edge by
probing off its own midpoint, keep it iff exactly ONE side has an owner, chain into canonical loops;
**thickest-wins** is what makes a thin partition on a thick shell's centreline vanish into it, and
**one owner per point** is what makes two materials tile without a doubled boundary). `emitLoops`
narrows to `region` while every edge is straight and `path` once one curves — see
[ADR 0018](../adr/0018-zero-dep-wall-joinery.md). `geometry/union.ts` and `geometry/clipper.ts` are
now TEST ORACLES only, and `geometry/backend.ts` is deprecated. And `frame.ts` (the `place` transform: a frame is a 2×2 signed-permutation
matrix + translation — exact, composable, no trig — and `transformElement` is the ONE place a
resolved element crosses from an instance's local frame into plan coordinates, including the handed
flips a reflection forces; see [ADR 0016](../adr/0016-component-instances-and-frames.md)). The CLI lives in `src/cli.ts` (dispatch) +
`src/cli/` (command modules); a single root `npm install` bootstraps every workspace.
