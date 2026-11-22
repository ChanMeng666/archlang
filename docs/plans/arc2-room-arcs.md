# ARC2 · arc edges in `room polygon`: the room-ring seam and the card

Card ARC2 (`modularity-and-flywheel.md` §4, §5; ruling RM-D88, `product-roadmap/README.md` §6.37).
This note is the inventory the seam refactor was built from, the seam's API, how each consumer will
treat an arc edge, and the ARC2 card itself. Line numbers are at `main` 7077fec1, before the seam.

## 1. The decision: the circle precedent, generalised

A `room circle` already carries three views of one floor (`resolveCircle`, `src/elements/room.ts`):
the exact `circle` (centre and radius, read for area, the drawing and `describe()`), `poly` (the
48-gon, `arcTessellate(fullCircleArc(…))` at `ARC_STEP_DEG` 7.5°, read by every ring consumer
verbatim) and `at`/`size` (the bounding box, for rect-shaped readers). About 70 call sites read
`poly` (or a `RoomBox`'s `poly`, `src/analyze/rooms.ts`) as a ring, and they are correct for a circle
today because a fixed-step tessellation is what a grid, an adjacency or a containment test wants.

ARC2 keeps that contract and widens it: **`RRoom.poly` is the floor's DISCRETISED ring** (the literal
vertices of a straight-edged ring; the fixed-step tessellation of a curved one), and an exact
boundary rides beside it. An arc-edged polygon will carry:

- `edges: EdgeLoop` (new, optional, only when the ring has an `arc`): the exact boundary, the
  `Edge` type of `src/geometry/band.ts` (`{t:"line",a,b} | {t:"arc",arc}`), one edge per written edge;
- `poly`: every authored vertex plus `arcTessellate(arc)`'s interior points of each arc edge (same
  step, same `ARC_MIN_STEPS`, endpoints verbatim), so no ring consumer needs a second code path;
- `at`/`size`: the bounding box of the EXACT boundary (vertices plus `arcExtremes`), not of the chords.

The alternative (keep `poly` as the authored vertices and add per-edge `arcs` as a wall does) would
put a tessellation call in front of every one of the ~70 ring readers. Rejected.

So the seam is small: a handful of functions every consumer whose answer would be WRONG on the
discretisation reads instead of `poly`, and one place (`src/geometry/room-ring.ts`) where ARC2 adds
its `edges` branch. A consumer that reads `poly` as the discretised ring is already on the seam's
contract and is not edited (§2, class D).

## 2. Inventory

Found by renaming `RRoom.poly`/`RRoom.circle` and reading `tsc`'s errors, plus the structural types
that read the same fields (`NetAreaRoom`, `FaceRoom`, naming's `RoomShape`, `RoomBox`) and the 3D
package. Classes: **A** exact area, **B** exact boundary (curves, extent, edge count), **C** the
authored vertex chain, **R** the drawn ring and extent, **D** the discretised ring (no change),
**K** a kind test ("not a rectangle", "a circle"), **X** outside the core's IR.

| Site (7077fec1) | Reads | Class | In ARC2 |
|---|---|---|---|
| `analyze/rooms.ts:60` `roomAreaMm2` (describe `area_m2`, schedule, Plan JSON `area`, `per-room.ts:53` `areaM2`, `sheet-tables.ts:170`, `furnish.ts:348`) | area | A | exact: shoelace + each arc's segment, `loopArea` (ADR 0027's ½∮(x dy − y dx)) |
| `elements/room.ts:704` drawn area stamp | area | A | `roomAreaMm2(r)/1e6` (the rect keeps its own expression) |
| `naming.ts:121` `sizeWords` | area | A | as `roomAreaMm2` |
| `furnish.ts:478` too-large gate | area | A | as `roomAreaMm2` |
| `ir/checks.ts:90` finiteness guard | chordal area | D | unchanged: a guard that the area is finite; the discretisation is finite iff the edges are |
| `analyze/net-area.ts:390` `roomRegion` (net area, `W_FLOOR_UNASSIGNED`, open-shell) | curves, box, gross | B | the edges as curves (`arcCurve` for an arc, as the circle already is), the exact extent, gross `roomAreaMm2`; `inside` by `loopWinding` on the edges |
| `analyze/net-area.ts:136` work units | box, edge count | B | exact extent, edge count of `edges` |
| `analyze/net-area-memo.ts:92` memo key | shape fields | B | add the arcs to the key |
| `analyze/wall-faces.ts:254-270` `roomCurveCount`, `roomBoxOf` | edge count, box | B | as net-area's |
| `analyze/wall-faces.ts:532` depth over the ring's vertices | ring | D | the tessellation's vertices (each lies on the arc) |
| `naming.ts:106-119` room bounds | box | B | exact extent |
| `describe/rooms.ts:51` `floor_polygon` | vertex chain | C | the authored vertices; the arcs as a new `floor_arcs` field (append-only), so no fact is a chord |
| `plan-json/to-json.ts:191-195` `polygon`, `floor_polygon` | ring | C | authored vertices plus `arcs` per edge (`arcJson`, as a wall's), `planFromJson`/`emitArch` re-emit `arc (x,y) radius R …`; a circle keeps its 48-gon and its gap row |
| `scene-build.ts:547` `dims auto` boundary ticks | vertices | C | the authored vertices only (a chord point is no room boundary) |
| `scene-build.ts:272` `synthCurveDims` | arcs | C | one `R<r>` leader per arc edge, deduplicated with the walls' by (centre, r) |
| `elements/room.ts:637` `bounds()` | drawn extent | R | the ring plus `arcExtremes` of each arc (the drawing budget and `MODEL_RANGE_MM` must cover the true curve) |
| `elements/room.ts:668-686` floor fill, `floor` hatch | drawn ring | R | the fill as a `path` prim (`PathEdge` arcs, `src/scene.ts:174`), so the edge is never faceted; the hatch region keeps the tessellation (its walls cover the sag) |
| `elements/room.ts:758` `transform` | ring | R | also carry `edges` through `t.arc` (a reflection flips each sweep), as `wall.ts:373` does |
| `elements/room.ts:809-862` `resolvePolygon` checks | vertices | D | `effectiveVertices`, `polygonSelfIntersects` and the label-inside test on the tessellation (an arc whose chords cross a neighbour edge is a crossing ring) |
| `elements/room.ts:182` `roomLabelAnchor` | ring | D | `polygonLabelPoint` of the tessellation (shape-derived, never a box) |
| `scene-build.ts:1447`, `lint/rules/annotations.ts:376`, `lint/fixture-paste.ts:201`, `furnish.ts:988`, `ir/checks.ts:350`, `cli/review.ts:186` (`r.poly ?? rectRing(…)`) | ring | D | the tessellation |
| `analyze/rooms.ts` `RoomBox` and its helpers (`roomRing`, `pointInRoomBox`, `rectInRoomBox`, `roomsAdjacent`, `pointOnRoomEdge`, `roomsAtPoint`, `doorConnections`), used at ~70 sites in `analyze*`, `describe*`, `lint/*`, `repair.ts`, `scene-build.ts`, `facade.ts`, `opening-schedule.ts`, `site.ts`, `suggest.ts`, `view/extrude.ts` | ring | D | the tessellation: within the sag (R·(1 − cos 3.75°), 4 mm at R1900) of the curve, far inside every tolerance they use (`DEFAULT_TOL` 200, a door's `t/2 + t`, the 100 mm containment slack) |
| `analyze/occupancy.ts:140,189`, `analyze/nav-grid.ts:226,447,655,1210,1428,1702`, `describe/adjacency.ts:47,82,104`, `analyze/symmetry.ts:474`, `room-tiling.ts:1108-1182`, `opening-relation.ts:178-200`, `elements/door.ts:110,180`, `elements/furniture.ts:812`, `keep.ts:532`, `lint/rules/furniture.ts:244`, `lint/rules/per-room.ts:607`, `repair.ts:865,1453,2089`, `suggest.ts:163,199`, `vertical.ts:299`, `taste/criteria.ts:511-1747` | ring | D | the tessellation (grids, flood-fills, adjacency, containment, taste's lattice ring) |
| `layout.ts:149,248`, `elements/furniture.ts:909,1100,1335`, `elements/walls-from-rooms.ts:204,520,598`, `room-datums.ts:94`, `keep.ts:732,870,1542,1759`, `lint/defining.ts:306`, `lint/rules/per-room.ts:267,287,645,701,729`, `analyze/contacts.ts:77`, `elements/room.ts:224`, `opening-relation.ts:178`, `site.ts:182`, `suggest.ts:420`, `lint/fixture-paste.ts:152`, `repair.ts:1963` | `poly` present, `rectilinear(poly)` | K | refused or declined as a polygon room already is (`rectilinear` of a tessellation is false). ARC2 words the three refusals that say "an edge neither horizontal nor vertical" (`layout.ts:150`, `furniture.ts:1102`, `walls-from-rooms.ts:536`) as "an arc edge" |
| `analyze/symmetry.ts:469`, `taste/criteria.ts:798,867,1262,1437`, `lint/rules/enclosure.ts:496`, `lint/rules/annotations.ts:910`, `repair.ts:1453,1506,2148`, `lint/rules/per-room.ts:603`, `elements/dim.ts:465`, `plan-json/to-json.ts:528`, `describe/rooms.ts:46`, `scene-build.ts:286`, `cli/review.ts:250` | `circle` | K | an arc polygon is not a circle: it takes the polygon branch (D) |
| `packages/archlang-3d/src/scene3d/build.ts:105` floor | ring | X | `tessellateLoops([r.edges], tol)` (`src/curves.ts`, the chord tolerance) when `edges` is present; the core's `edges` is a public `RRoom` field (ADR 0031) |
| `analyze/nav-grid.ts:1428` translation probe | shape fields | X | translate `edges` too |
| playground | none | — | reads only `compile()`/Plan JSON output |

What the inventory shows: the reads that an arc moves are A, B, C and R, about twenty sites; the
seventy-odd D reads are right on a tessellation for the same reason the circle's are.

## 3. The seam (this PR)

`src/geometry/room-ring.ts`, over a structural `RoomShape` (`at`, `size`, `poly?`, `circle?`), so a
`RRoom`, a `FaceRoom`, a `NetAreaRoom` and naming's shape all pass:

| Function | Today | ARC2 adds |
|---|---|---|
| `roomRing(r)` | `poly ?? rectRing(at/size)`: the discretised ring | nothing (`poly` is the tessellation) |
| `roomEdges(r)` | the exact boundary as an `EdgeLoop`: a circle's one full-circle arc, else a line per ring edge | `r.edges` |
| `roomAreaMm2(r)` | moved from `analyze/rooms.ts` (re-exported there): πR², shoelace, w·h | `Math.abs(loopArea(r.edges))` |
| `roomExtent(r)` | the exact `GridBox`: c ± R, the ring's min/max, at/size | min/max over vertices and `arcExtremes` |
| `roomCurveCount(r)` | 1, the ring's length, 4 | `r.edges.length` |
| `roomCorners(r)` | the authored vertex chain: `[]` for a circle, the ring otherwise | the edges' start points |

Routed through it, each with the same expression in the same float order: the area stamp, naming's
size and bounds, the furnish gate, `roomRegion` and net-area's work units, wall-faces' curve count
and box, `describe()`'s `floor_polygon`, the drawn floor ring, `bounds()`, and the
`poly ?? rectRing(…)` ring idioms (scene-build's label groups, annotations, fixture-paste, furnish,
`checkRoomOverlaps`, `arch review`). The `RoomBox` helpers already are a ring seam and stay.

Byte identity, over the corpus (`docs/testing.md` § 5 dirs plus every `arch` fence of `docs/`,
`README.md`, `spec.llm.md`): compiled SVG (every page), `compile().diagnostics`, DXF, ASCII,
`describe()`, `lint()` under the default and every `LINT_PROFILE_NAMES` profile, Plan JSON,
`evaluationSteps`, and the 3D scene, warnings and mesh. One PR: the seam plus about fifteen
mechanical call-site edits is small enough to review whole, so it is not split. Routing the D reads
by name (`roomRing(r)` for `r.poly`) is not done: it would move nothing ARC2 needs and would grow the
diff.

## 4. The ARC2 card

**Syntax.** Inside `room polygon`, the wall clause verbatim, written on the vertex it arrives at:
`room polygon (0,0) (2400,0) arc (5400,0) radius 1900 cw (5800,0) (5800,6800) (0,6800) label "Living"`.
`arc (x,y) radius R [cw|ccw] [major]`. A ring is implicitly closed and stores no repeated vertex,
so the closing edge is curved by ending the ring with `arc (x0,y0) …` back to its FIRST vertex:
that arc is the closing edge and the repeated vertex is dropped (a repeated first vertex after a
straight edge keeps today's meaning, a duplicate `effectiveVertices` removes). `arc` cannot lead the
ring (no vertex to curve from), the wall body's own refusal. Parse reuses the wall body's reader
(`src/elements/wall.ts:124-150`); `arch fmt` and `src/statement-print.ts` re-emit it; the generated
spec gains the form.

**Resolve.** Solve each clause with `arcFromChord` (as `resolveArcs`, `wall.ts:386`), the same
`E_WALL_ARC_RADIUS`-shaped refusal with the same `arc-radius-min` fix, under a room code
`E_ROOM_ARC_RADIUS`. Then `edges`, `poly` (the tessellation), `at`/`size` (exact extent). Refusals:
degenerate and self-intersecting on the tessellation (`E_ROOM_POLY_DEGENERATE`,
`E_ROOM_POLY_SELF_INTERSECT`), and an arc that bulges across another edge is self-intersecting there.
Charge the tessellation's vertices to the step meter before building them (`chargeSteps`), and every
centre, radius and extreme goes through `checkNumberDomain` / `MODEL_RANGE_MM`. The parse-stage
refusal at `room.ts:431` goes, with its backlog § NS entry.

**Consumers.** §2's "In ARC2" column, class by class: the seam's six branches; the drawing (`path`
fill, hatch on the tessellation, `bounds()` with `arcExtremes`, `drawCost` unchanged: one floor
primitive); `transform` through `t.arc`; `describe()` `floor_polygon` = authored vertices plus
`floor_arcs: [{from, to, center, r, sweep}]`; Plan JSON `arcs` with the round trip (`from-json.ts`,
`emit.ts`, the gap list `test/tables/plan-json-gaps.ts`); `dims auto`: no tick at a chord point, one
`R<r>` leader per arc edge deduplicated with the walls'; net-area and wall-faces exact through the
seam; the net-area memo key; the nav-grid translation probe; the 3D floor through `tessellateLoops`
at the chord tolerance (`packages/archlang-3d`, a `MIN_CORE` bump if it reads `edges`); the three
refusal messages that say "an edge neither horizontal nor vertical".

**Laws and tests.** A byte-identity law: every plan without an arc edge in a room ring is unchanged
in SVG, `describe()`, `lint()`, diagnostics, Plan JSON, DXF and steps (SHA-256, the test's own
digest; `test/helpers/byte-identity-digest.ts`). Exactness: a semicircle room's area equals πR²/2 plus
its rectangle to 1e-9 relative, not the chordal figure; a D4 law (a turned and mirrored arc room has
the same area and the mirrored sweep sign, `test/helpers/d4-oracle.ts`); `W_FLOOR_UNASSIGNED` on
ArchCanvas's bay-bungalow written with an arc living room reports no bay; the round trip
`.arch → Plan JSON → .arch` holds; the 3D floor covers the bay (its area within the chord
tolerance).

**Docs.** `docs/language-reference.md` (the `room` form), `spec.llm.md` (within its 30,000-unit cap:
pay with a cut), `docs/analysis.md` (the exact-vs-chordal note now names arc rooms), a
`CHANGELOG.md` `[Unreleased]` entry (a new language form, minor), one example (`examples/` with its
SVG, through `gen:*`). ArchCanvas rewrites bay-bungalow's living room after 1.68.0 ships.
