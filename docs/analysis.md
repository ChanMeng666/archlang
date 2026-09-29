# Analysis: `describe` & `lint`

ArchLang compiles a plan to a drawing — but it can also **read the plan back as
facts**. Two pure functions turn source into machine-readable, image-free output:

- **`describe(source)`** — a semantic summary: rooms, areas, adjacencies, what every
  door/window/opening connects, the furniture, a modelled **access graph**, and a
  **circulation** model (how far you walk to each room and the pinch on the way).
- **`lint(source)`** — advisory `W_*` warnings about habitability, against a chosen
  profile.

Both are exported from the package (`import { describe, lint } from "@chanmeng666/archlang"`)
and surfaced on the CLI as `arch describe` / `arch lint` (add `--json` for the
structured form). They power the **Describe** and **Lint** tabs in the
[playground](https://playground.archlang.uk). Neither renders anything, so a
text-only agent can author a plan and **verify it matches intent without ever
looking at an image**.

> **Philosophy.** This is the line ArchLang draws on purpose: it reports *facts* and
> gives *advice*, but it never silently re-arranges your geometry. The compiler stays
> a faithful, deterministic renderer; the intelligence ships as data you read, not as
> an invisible architect that moves walls behind your back. See
> [ADR 0005 — no invisible architect](adr/0005-no-invisible-architect.md).

## `describe` — the semantic summary

`arch describe plan.arch --json` returns a `SceneSummary`. For
[`examples/studio.arch`](../examples/studio.arch) (abridged to the shapes that
matter — run it yourself for the full object):

```json
{
  "ok": true,
  "plan": "Studio 1BR",
  "units": "mm",
  "scale": "1:50",
  "caption": "\"Studio 1BR\" — a 4-room floor plan, 42 m² total: Living / Kitchen (24 m²), Bath (4.8 m²), …; 3 doors, 3 windows, entrance via d_main.",
  "bbox": { "w": 7000, "h": 6000 },
  "bbox_outer": { "w": 7200, "h": 6200 },
  "rooms": [
    {
      "id": "r_living",
      "label": "Living / Kitchen",
      "uses": ["living", "kitchen"],
      "area_m2": 24,
      "bbox": { "x": 0, "y": 0, "w": 4000, "h": 6000 },
      "adjacent": ["r_bed", "r_hall", "r_bath"]
    },
    {
      "id": "r_bath",
      "label": "Bath",
      "uses": ["bath"],
      "area_m2": 4.8,
      "bbox": { "x": 4000, "y": 4400, "w": 3000, "h": 1600 },
      "adjacent": ["r_living", "r_hall"]
    }
  ],
  "doors": [
    { "id": "d_main", "between": ["exterior", "r_living"], "width": 1000 },
    { "id": "d_bath", "between": ["r_hall", "r_bath"], "width": 800 }
  ],
  "windows": [
    { "id": "window_1", "room": "r_living", "width": 1500, "facing": "N" }
  ],
  "openings": [
    { "id": "o_living", "between": ["r_living", "r_hall"], "width": 900 }
  ],
  "furniture": [
    { "id": "kitchen_sink_1", "category": "kitchen_sink" },
    { "id": "sofa_5", "category": "sofa", "label": "Sofa" }
  ],
  "access": { "…": "see below" },
  "totals": { "rooms": 4, "doors": 3, "windows": 3, "floor_area_m2": 42 }
}
```

| Field | Meaning |
|-------|---------|
| `caption` | one deterministic sentence summarising the whole plan (room count, total area, the rooms and their areas, door/window counts, entrance) — **always present**, composed only from the fields above so it never diverges from them |
| `bbox` | overall extent on wall **centerlines** — the coordinate space the source is written in (room `at`/`size`, wall points), so this is the number to compute *with* |
| `bbox_outer` | overall extent on the **outer wall faces** — `bbox` plus half a wall thickness at each end (7000×6000 inside a 200 shell is 7200×6200 outside). What a builder measures, what `dims auto`'s overall chain prints, and what to quote when someone asks how big the building is |
| `rooms[].uses` | the room's [`uses` tags](language-reference.md#room) (or the inferred kind when none were authored) |
| `rooms[].area_m2` | floor area in m², rounded to 2 dp — `w × h` for a rectangle, the exact **shoelace** area of the ring for a [polygon room](language-reference.md#polygonal-rooms-v1-23) |
| `rooms[].floor_polygon` | the room's floor as a closed ring: a rectangle's four corners, or the polygon's own vertices. This — not `bbox` — is the room's shape |
| `rooms[].bbox` | the room's **vertex extent**. For a polygon room it is the box the ring fits in, which is bigger than the floor |
| `rooms[].adjacent` | ids of rooms whose walls touch this one within tolerance (a shared corner alone doesn't count) |
| `doors[].between` / `openings[].between` | the two spaces the connector joins — a room id or the literal `"exterior"` |
| `windows[].room` | the room the window lights |
| `windows[].facing` | the **true compass** direction the window's wall faces (`N`/`S`/`E`/`W`), read against the plan's [`north`](language-reference.md#plan-settings) setting. Under the default `north up` the top of the drawing is north, so a top-edge window faces `N`; under `north right` compass north points at the page's right edge, so a right-edge window faces `N` and a top-edge one faces `W`. A `north <deg>` bearing snaps to the nearest cardinal (an exact 45° tie rounds clockwise) |
| `windows[].facingPage` | the same direction **before** `north` is applied — `N` = toward the top of the drawing. **Present only when the declared `north` actually turns the answer**, so a plan on the default `north up` is unchanged |
| `voids` | the holes in this storey's floor plate — one `{ id, at, size, room }` per [`void`](language-reference.md#void--a-hole-in-the-floor-v1-29). **Present only when the storey declares one.** `room` is the room whose FLOOR contains the opening's centre (`null` when none does — a void in the notch of a U-shaped room belongs to no room, even though it is inside that room's `bbox`). The room's `area_m2` is **not** reduced by it: subtract `size.w × size.h` yourself if you need the net |
| `outdoor` | the [ground surfaces](language-reference.md#outdoor--ground-outside-the-building-v1-31) outside the building — one `{ id, kind, label?, area_m2, bbox, rail? }` per `outdoor`. **Present only when the storey declares one.** `area_m2` is the exact **shoelace** area for the `polygon` spelling, never the `bbox`. `rail` is present on a `balcony` and absent on every other kind — an empty array there means "no railing", which is a different fact from the key being missing. **None of this is floor area:** a ground surface appears in no other part of the summary, and its area is totalled separately (below) |
| `fences` | the [fence runs](language-reference.md#fence--a-boundary-line-on-the-ground-v1-31) — one `{ id, style, length_mm, closed }` each. **Present only when the storey declares one.** A fence is not a wall: it is absent from `walls`, from `access` and from `input_graph`, and it hosts no opening |
| `totals` | room / door / window counts and total floor area |
| `totals.outdoor_area_m2` | total ground area in m² — **present only when the storey declares an `outdoor` surface**. Deliberately a **sibling** of `floor_area_m2` rather than part of it: floor area is floor area, and a terrace is not it. A consumer that wants plot coverage adds the two, having decided that is what it means |
| `accTitle` / `accDescr` | the plan's declared [accessible metadata](language-reference.md#accessible-metadata-acctitle-accdescr) — **present only when the source declares them** |
| `axes` | the plan's declared [positioning axes](language-reference.md#positioning-axes-定位轴线) — **present only when the source declares an `axes` block** |
| `site` | the direction **names** the plan's [`site` block](language-reference.md#site-and-orientation) licenses — `street`, `back`, `equator_side`, `sunrise_side`, `sunset_side` and the `hemisphere` they were read in, every one of them a compass letter on the same `north` as `windows[].facing`. **Present only when the source declares `site`.** The three `_side` names are a *drafting heuristic for an aspect, not a measured daylight outcome* — there is no sun model, latitude or date in ArchLang; see the note in the [language reference](language-reference.md#site-and-orientation) |
| `site.lot_area_m2` / `site.lot_bbox` | the LOT, when the block declares a [`boundary`](language-reference.md#the-lot-line--boundary-v1-31) — **absent otherwise, and absent from every `site` written before v1.31**. The area is the exact **shoelace** of the ring; `lot_bbox` is reported beside it for framing, and nothing is derived from it (a splayed lot's box is not its lot) |
| `scale` | the **effective** drawing scale. Annotation only on its own; with a `sheet` it is operative, and it is the scale auto-fit chose when the plan declared none |
| `sheet` | the sheet the drawing is issued on — **present only when the plan declares [`paper`](language-reference.md#paper-and-scale-the-sheet)**. See [The sheet](#the-sheet) |

A text-only agent reads this and confirms "4 rooms, 42 m², a bath adjacent to the
hall (not the bedroom), a 1000 mm front door" — no rendering required.

On a large plan the whole summary can be more than you want to read. Two flags bound
it at the source: `--select rooms,totals` emits only those top-level keys (the
`ok`/`plan`/`units`/`diagnostics` envelope is always kept), and `--room r_bath,r_hall`
keeps only those rooms and the doors, windows, openings and furniture that touch them
(plan-level facts — `bbox`, `bbox_outer`, `totals`, `caption` — stay whole-plan).

```
arch describe plan.arch --select rooms,totals --json
arch describe plan.arch --room r_bath,r_hall --json
```

The **`caption`** is the same sentence the accessible SVG puts in its `<desc>`
(`compile(src, { accessible: true })` — see the
[language reference](language-reference.md#accessible-metadata-acctitle-accdescr)); it is
computed here, from facts, so the two can never disagree. When the source declares
`accDescr`, that authored string overrides the derived caption in the SVG `<desc>` — but
`describe().caption` always reports the *derived* sentence, and the declared strings are
surfaced separately as `accTitle` / `accDescr`.

### Polygon rooms: what is exact, and what is measured (v1.23)

A [polygon room](language-reference.md#polygonal-rooms-v1-23) is not approximated by its
bounding box anywhere in this layer. Three of its facts are **exact** — closed-form
arithmetic on the ring, identical on every run and with or without the optional geometry
backend:

- **Area** — the shoelace formula. `describe().rooms[].area_m2`, the drawn area label, the
  `schedule rooms` row and Plan JSON's `area` all read that one number.
- **Adjacency** — two rooms are adjacent when their **boundaries share a run of positive
  length**: an edge of one and an edge of the other are parallel, no further apart than the
  tolerance (one partition thickness), and overlap along that direction. This is the same
  question the rectangle rule asks — a shared corner still does not count — asked of edges
  at any angle, so a trapezoid's sloping party wall joins the room behind it.
- **Containment** — a door, window or cased opening is attributed to a polygon room by its
  distance to *that room's own edges*, so an entrance on an angled facade connects the room
  it actually opens into. A fixture is "in" the room when its centre is inside the ring.

The circulation facts are **measured on a grid**, exactly as they are for rectangles, and
are therefore resolution-bounded rather than exact: each room is rasterised over its
bounding box and every cell whose **centre** falls outside the ring is dropped before the
flood-fill, so an L's notch is never counted as floor and the reachable-area number lands
within a cell of the true area (see [Grid resolution](#grid-resolution-why-cellsizemm-is-worth-reading)).
The doorway seed is the free cell nearest the connector, since "step inward perpendicular
to the edge" has no direction on a ring.

Two rules keep the rectangle they are written about, and say so rather than guess:
`W_FIXTURE_BACK_TO_ROOM` does not fire inside a polygon room (no north/south/east/west
side to be the fixture's back), and `arch repair` declines to push a piece into one,
reporting it in `unresolved`. `W_ROOM_OVERLAP`, by contrast, **was** generalised: it runs
an exact ring-vs-ring intersection test, so a room tucked into an L's notch — overlapping
boxes, disjoint floors — does not warn, while two floors that really do intersect still do.

### Curves: what is exact, and what is chordal (v1.24)

A curve has two truthful descriptions — the circle it is, and a polygon close enough to it
— and this layer deliberately uses each where it belongs. The rule is short:

| Fact | How it is computed |
| --- | --- |
| A circular room's `area_m2` (label, `describe()`, `schedule rooms`, Plan JSON) | **Exact** — πR², closed form |
| `floor_circle`, `dim diameter`, `dim radius`, the `dims auto` R/φ call-outs | **Exact** — the authored centre and radius |
| The drawing extent, a wall's outer-face box, a spatial-index cell | **Exact** — the arc's closed-form extremes, so a bulge is never clipped |
| Which wall hosts an opening, and how far along it sits | **Exact** — distance to the arc, and run length `R·θ` |
| The occupancy grid, the circulation flood-fill, path widths | **Chordal** — a 48-sided inscribed ring (7.5° per chord) |
| Room-vs-room overlap, and a fixture's wall collision | **Chordal** — the same ring, through the polygon tests |
| The drawn poché fill of a curved wall | **Chordal** — the visible faces stay true arcs |

The chordal ring is inscribed, so it is **conservatively small**: a grid answer never
claims floor the circle does not have. At 7.5° a chord's sagitta is about `R/1400` — 6 mm on
a 9 m radius — which is well inside the tolerances the circulation rules already work at.
Where the difference would be visible in a *number a reader trusts*, the exact form is used
instead; that is why the area is never taken from the ring (a 48-gon is 0.14% short, enough
to move a `toFixed(1)` label).

**One reported fact a curve legitimately lacks.** `adjacent` means "shares a boundary
**run**", and has always excluded a shared corner. A circle meets a straight wall at a
single point, so a circular room reports no adjacent rooms even when it is tangent to one.
Its connectivity comes from its doors instead: a door at the tangent point belongs to both
rooms, appears in `describe().doors[].between`, and carries reachability — which is how the
aquarium's rotunda is reached from its entrance. Do not read the empty `adjacent` as a
missing measurement; adjacency-by-tangency would be an invented semantic (ADR 0005).

## The sheet

A plan that declares [`paper`](language-reference.md#paper-and-scale-the-sheet) is issued
on a real sheet at a real scale, and `describe()` reports which:

```json
"scale": "1:200",
"sheet": {
  "paper": "A1",
  "orientation": "landscape",
  "scale_denominator": 200,
  "scale_auto": false,
  "fits": true
}
```

| Field | Meaning |
|-------|---------|
| `paper` / `orientation` | the declared sheet (`A4`…`A0`, `landscape` or `portrait`) |
| `scale_denominator` | the **operative** denominator — the `200` of `1:200`. Every annotation size is a fixed sheet-millimetre value times this |
| `scale_auto` | `true` when the plan declared no `scale` and the sheet auto-fitted one (the finest of 1:50 / 1:100 / 1:200 / 1:500 that fits) |
| `fits` | does the building's `bbox_outer` fit the sheet at this scale, after the margins, the `dims auto` bands, the bottom chrome band **and the margin-table row `schedule rooms` / `legend` add below it**? `false` is the [`W_SCALE_OVERFLOW`](errors.md#w-scale-overflow) condition — the drawing is still produced, and the page grows past the sheet rather than clip it |
| `drawing_fits` | the same question about **everything the plan draws** — the building plus the `outdoor` ground, `fence`, `site … boundary` and `roof` eaves that `bbox_outer` does not contain. **Present only when it is `false`**, so an existing summary is unchanged; absent means the whole drawing fits. `false` with `fits: true` is the [`W_DRAWING_OVERFLOW`](errors.md#w-drawing-overflow) condition |

`fits` is a question about the **sheet**, not only about the building: a plan whose walls
fit comfortably can still answer `false` because the schedule and legend it asked for take
the band below the drawing. Adding `schedule rooms` to a tight sheet can therefore flip
`fits` and raise `W_SCALE_OVERFLOW` with no change to the plan's geometry at all — which is
the honest answer, and was not reported before v1.27.0 (the tables were laid out but never
measured, so a page could be emitted taller than its own `paper` with `fits: true` on it).

What `fits` measures is still only the **building**, and that is deliberate — it is what
auto-fit picks a denominator against, so widening it would re-scale every site plan. A plan
draws more than its building, though, and none of that could ever make `fits` say no: a
4 × 3 m cottage with a 40 m yard answered `true` and was issued on a page 57% taller than
its A4. `drawing_fits` is that residual, measured by the same rule on the wider extent.
Neither is a claim that the page **grew**: both are measured against the area the sheet
reserves, and a marginal overrun eats the reserved margin and comes out exactly paper-sized.
The page that was actually emitted is `scene.sheet.page`.

The whole `sheet` key is **absent** for a plan with no `paper`, so an existing summary is
unchanged. `scale` and `sheet` always agree: the operative scale is resolved once, before
anything is drawn.

## The access graph

`describe().access` models the building as a **graph of connectors** (doors and
openings) and walks it from the exterior. For the studio:

```json
"access": {
  "entrances": ["d_main"],
  "hasEntrance": true,
  "edges": [
    {
      "doorId": "d_main", "kind": "door", "between": ["exterior", "r_living"],
      "nominalWidth": 1000, "estimatedClearWidth": 940,
      "hostCategory": "exterior", "hostWallId": "exterior_1",
      "exterior": true, "ambiguous": false
    },
    {
      "doorId": "o_living", "kind": "opening", "between": ["r_living", "r_hall"],
      "nominalWidth": 900, "estimatedClearWidth": 900,
      "exterior": false, "ambiguous": false
    }
  ],
  "rooms": [
    { "id": "r_living", "depthFromEntrance": 1, "reachable": true, "bottleneckClearWidth": 940 },
    { "id": "r_hall",   "depthFromEntrance": 2, "reachable": true, "bottleneckClearWidth": 900 },
    { "id": "r_bath",   "depthFromEntrance": 3, "reachable": true, "bottleneckClearWidth": 740 }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `entrances` / `hasEntrance` | the door(s) that connect the exterior to a room, and whether any exist at all |
| `edges[].nominalWidth` | the connector's drawn width |
| `edges[].estimatedClearWidth` | the usable opening: a **door** loses ~60 mm to its leaf and stop, an **opening** keeps its full width |
| `edges[].exterior` | whether this connector reaches the outside |
| `edges[].ambiguous` | the connector sits where three or more rooms meet, and probing one wall thickness off each face of its host wall could not say which two it joins (a probe landed on a room boundary). It is listed but joins nothing, so it counts for no room's reachability. When the probe does decide, `between` is the room on each face, and lint, circulation and `suggest` all read that same pair |
| `rooms[].depthFromEntrance` | how many connectors you pass through from the nearest entrance (`1` = opens straight off it); `null` if you can't get there |
| `rooms[].reachable` | can this room be reached from the exterior at all? |
| `rooms[].bottleneckClearWidth` | the **narrowest clear width** along the widest path in from the entrance — the real constraint for moving furniture or a wheelchair (a widest-path search, so it reports the best route's worst pinch) |

This is what makes a sealed-off room or a wheelchair-impassable corridor visible as
*data* — the playground's Describe tab draws it as a reachability diagram.

## Circulation — how a person walks the plan

Where the access graph counts *connectors*, `describe().circulation` measures the
actual **walk**. It floods a nav grid whose free cells are eroded by a body radius,
so a route only passes where a person really fits — through doors and cased openings,
never through a furniture pinch. It is `null` when the plan has no modelled exterior
entrance. For the studio:

```json
"circulation": {
  "entranceId": "d_main",
  "cellSizeMm": 100,
  "bodyRadiusMm": 300,
  "rooms": [
    { "roomId": "r_living", "walkDistanceMm": 3700, "bottleneckClearWidthMm": 940, "detourRatio": 1.26 },
    { "roomId": "r_bath",   "walkDistanceMm": 4600, "bottleneckClearWidthMm": 740, "detourRatio": 2.27 }
  ],
  "routes": [
    { "fromRoomId": "r_bed", "toRoomId": "r_bath", "walkDistanceMm": 5000, "bottleneckClearWidthMm": 740, "detourRatio": 1.32 }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `entranceId` | the first entrance in source order. With one entrance every walk starts there; with several, each room names its own |
| `cellSizeMm` / `bodyRadiusMm` | the nav-grid quantum (distances are rounded to it, so they're coarse) and the radius obstacles were inflated by |
| `rooms[].walkDistanceMm` | walking distance to the room from its **nearest** entrance, over the eroded grid |
| `rooms[].bottleneckClearWidthMm` | the narrowest unavoidable clear width on the widest way in from **any** entrance (a door width, or a furniture pinch) |
| `rooms[].detourRatio` | `walkDistance ÷ straight-line` from the room's own entrance (the walk-nearest one, not the straightest) — how far the route wanders from a beeline (`≥ ~1`) |
| `rooms[].entranceId` | the entrance this room's walk starts at: its nearest, ties to the one written first. **Present only when the plan has more than one entrance** |
| `routes[]` | key functional routes (kitchen → nearest living/dining, bedroom → nearest bath), same three metrics |

A plan with several front doors — a terrace of houses on one sheet, a building with a
street door and a garden door — is walked from all of them at once: every room is measured
from whichever entrance is nearest, so no room is reported the long way round, or left out,
because a different door happens to come first in the source.

The three per-room numbers answer two different questions, on purpose. `walkDistanceMm`,
`detourRatio` and `entranceId` all come from the room's **nearest entrance by walk** — the
route a person would take. `bottleneckClearWidthMm` is the widest way in from **any**
entrance — what you can get a sofa or a wheelchair through, whichever door that means. So a
room can report a wide bottleneck through one door and a walk from another, and its detour is
measured from its nearest door even when another door is in a straighter line (the museum's
`g3` reads 2.32, from a door that is nearest by walk but roundabout).

**The detour is per walk-nearest entrance, not the least over every entrance** — so one record
describes one route. `detourRatio` divides the walk `walkDistanceMm` reports by the straight
line from that SAME entrance; the alternative, each entrance's walk over its own straight line
with the smallest ratio kept, would call `g3` direct again but would no longer describe the
walk that is reported beside it, and a room could then read "direct" while its walk is the
long way round. `W_CIRCUITOUS_PATH` therefore names the entrance it measures from ("The walk
from entrance "…" to "…" is 2.33× the straight-line distance from that entrance"), so a warning
on a room with a straighter door elsewhere says which door the ratio is about.

### Ties — the same numbers however the plan is drawn

A grid distance is quantised, and a quantised model meets exact TIES: a doorway centred on a
cell boundary, a room centre equidistant from four cells, a bed whose clearance leaves a ring
of equally near free cells. The grid breaks every such tie by a rule a turn or a flip of the
plan preserves, never by page order:

- an entrance on a lattice line seeds the walk on **both** sides of it, and the straight line a
  detour divides by runs to the nearer side;
- a doorway between two rooms is carved on a **symmetric** set of rows: both sides of every
  lattice line, each seed to its nearest seed opposite, by both L-shaped runs;
- among equally near cells a room is measured to the one the walk reaches **first**, then the
  nearest (straight line) to its own entrance, then by its offsets from the room's centre; its
  seed point sits on the same 1/1024 mm lattice as every input coordinate.

So on a plan whose rooms span a whole number of cells, `place … rotate r mirror m` of it
reports exactly the same circulation — every walk, bottleneck, detour, entrance, key route and
sealed room — as the unplaced plan (the equivariance oracle checks this on every single-storey
shipped example and on random plans). A plan whose extent is not a whole number of cells
has its last cell spill past one edge, and a turn moves that spill: there a number can still
move by a cell.

A wall thinner than a cell still blocks: besides every cell whose centre its band covers, the
grid blocks every cell its **centreline** passes through, so an 80 mm partition on a 100 mm grid
cannot be walked through. A wall of about 142 mm or more (`cell·√2`) already blocks every such
cell by its centre, so this changes nothing for it.

A room the grid cannot reach at all is simply **absent** from `rooms[]`. Three things
obstruct it: furniture (halo on every side), a
[vertical run](#vertical-circulation--the-building-graph-v121) (halo lifted outside its entry
edges) and a [`void`](language-reference.md#void--a-hole-in-the-floor-v1-29) (halo lifted on
**all four** — you cannot walk across a hole, but you can stand at the railing). Walls block
and doors carve, as always.

Two advisory lint rules read this model, and the same model backs the opt-in
`arch compile --overlay circulation` render overlay (see
[ADR 0008 — circulation as facts](adr/0008-circulation-as-facts.md)).

### Grid resolution — why `cellSizeMm` is worth reading

**Areas are exact; anything measured on a grid is an approximation, and `cellSizeMm`
tells you how coarse.** Room areas, adjacency and the access graph come from exact
rectangle arithmetic. Circulation distances and clear widths are read off a raster, so
they are quantised to the cell — treat them as "about", never as a dimension to build to.
The grid is anchored at the rooms' min corner and samples everything relative to it (snapped
to 1/1024 mm), so moving a whole plan changes no circulation number — exactly, except in the
vanishing case of a relative coordinate within about one float ulp of a half-quantum.

The cell is derived from the plan's own area: a **target cell size bounded by a total
cell budget**, `cell = max(100 mm, ceil(sqrt(planArea / 250 000)))`. So resolution is
what stays fixed, and cost is what is capped:

- Every plan up to **2500 m²** — which is every dwelling — grids at exactly **100 mm**.
- Past that the cell grows as `sqrt(area)`: `examples/museum.arch` (100 × 60 m) sits at
  **155 mm**, and four times the area only doubles the cell.
- The grid never exceeds ~250 000 cells whatever the shape, so the budget alone bounds
  the work; there is no per-axis clamp (one would re-introduce the scale-relative
  quantisation this replaces on a long, thin building).

The per-room occupancy grid behind `W_ROOM_NO_CLEAR_PATH` follows the same rule on a
proportionate budget: `max(100 mm, ceil(sqrt(roomArea / 25 000)))`, so every room up to
250 m² is measured at 100 mm.

This matters because the numbers a large plan most needs are the ones a cell-count-based
grid destroyed: at 100 × 60 m the cell used to reach 775 mm, so a 900 mm door was a
single cell, the 300 mm body radius was a third of one, and a compliant 1.8 m corridor
and an illegal 1.0 m one reported the same clear width. See
[ADR 0008](adr/0008-circulation-as-facts.md#addendum-2026-07-resolution-scales-with-area-not-a-fixed-cell-count).

## Positioning axes — the datum grid, as facts

When the plan declares [positioning axes](language-reference.md#positioning-axes-定位轴线),
`describe().axes` reports them with the labels the drawing prints. The key is **absent
entirely** on a plan that declares none, so an existing summary is unchanged.

```json
"axes": {
  "x": [
    { "pos": 0,    "label": "1" },
    { "pos": 4000, "label": "2" },
    { "pos": 8000, "label": "3" }
  ],
  "y": [
    { "pos": 3000, "label": "A" },
    { "pos": 0,    "label": "B" }
  ]
}
```

Both lists are in **label order**, not coordinate order: `x` runs left to right
(ascending `pos`), and `y` runs **bottom to top** — since `+y` points down, `y[0]` is
the axis with the *largest* `pos`, which is why `A` reads `3000` above. Labels are
derived from sorted position (never authored), so they are exactly what the bubbles
show and what a reviewer will cite ("the wall on axis ②").

This is the read an agent wants before nudging a coordinate: the axes are the
coordinates that are *meant* to be structural, and with `dims auto rooms|all` they are
also the ticks of the middle dimension chain — so moving a room boundary that sits on
an axis changes a dimension a human is reading off the grid.

## The room schedule — the drawn table, as data

When the plan sets [`schedule rooms`](language-reference.md#sheet-tables--room-schedule--legend),
`describe().schedule` reports the ROOM SCHEDULE **exactly as the sheet draws it** — so an
agent can read the numbered table it just rendered without OCR'ing the image. The key is
**absent entirely** when the plan does not opt in, so an existing summary is unchanged.

```json
"schedule": [
  { "no": "01", "id": "living", "name": "Living", "area_m2": 12 },
  { "no": "02", "id": "bath",   "name": "bath",   "area_m2": 9 }
]
```

- `no` is the drawn number: 1-based **source order**, zero-padded to one uniform width
  across the table (`01`…`09`, `001`…`100`) — cite it the way a reviewer will ("room 02").
- `name` is the room's `label`, falling back to its `id` when unlabelled (`bath` above).
- `area_m2` is byte-identical to that room's `rooms[].area_m2`, and the drawn `TOTAL` row
  is `totals.floor_area_m2` — one derivation feeds both the drawing and this JSON, so the
  table on the sheet and the facts here can never disagree.

The `legend` setting has **no counterpart here**, deliberately: it is pure rendering, and
every fact it shows (the wall materials, the fixture categories placed) is already in
`furniture` and the source.

When the plan also declares [`zone` blocks](language-reference.md#zones--wings-and-departments-v122)
the rows **group by zone**: they are ordered wing by wing, each row carries the dotted path
of its innermost zone, and `no` becomes the row's position in the **table** (which is what
the drawn number labels) rather than in the source. The drawn table gains a heading row and
a `SUBTOTAL` row per group. Grouping is on the *innermost* zone, so every room appears
exactly once and the subtotals add up to the `TOTAL`.

```json
"schedule": [
  { "no": "01", "id": "lobby", "name": "Lobby",     "area_m2": 32, "zone": "west" },
  { "no": "02", "id": "gal_a", "name": "Gallery A", "area_m2": 16, "zone": "west.galleries" }
]
```

## Zones — the declared grouping

`describe().zones` reports the plan's [`zone` blocks](language-reference.md#zones--wings-and-departments-v122)
— wings, departments, phases — and the rooms each groups. The key is **absent entirely**
when the plan declares no zone, so an existing summary is unchanged.

```json
"zones": [
  { "id": "west",      "label": "West wing",      "path": "west",
    "rooms": ["lobby", "gal_a", "gal_b"], "room_count": 3, "floor_area_m2": 64 },
  { "id": "galleries", "label": "West galleries", "path": "west.galleries",
    "rooms": ["gal_a", "gal_b"],          "room_count": 2, "floor_area_m2": 32 },
  { "id": "east",      "label": "East wing",      "path": "east",
    "rooms": ["office", "store"],         "room_count": 2, "floor_area_m2": 32 }
]
```

- **`path` is the identity**, not `id`: nested zones are dotted (`west.galleries`), and it
  is what `describe --zone` selects on. Zones are listed in declaration order.
- **Membership is declared, never inferred** — a room is here because it was *written*
  inside that block ([ADR 0005](adr/0005-no-invisible-architect.md)).
- **Nesting rolls up.** `west` lists the galleries' rooms too, so a wing reports its whole
  area however its interior is subdivided. The cost of that is deliberate **overlap**:
  `west` and `west.galleries` both count `gal_a`, so **summing `floor_area_m2` across
  `zones` double-counts** and is not the plan total. `totals.floor_area_m2` stays the one
  whole-plan figure. (The drawn schedule takes the other view — it partitions on the
  innermost zone, so *its* subtotals do add up.)
- **`level`** is present on a multi-storey plan: a zone belongs to the storey it was written
  on, so the same zone id on two floors is two entries. Top-level `zones` is the lowest
  storey's, like every other top-level fact; `levels[i].zones` is that storey's.

Read one wing with `arch describe museum.arch --zone west --json`: the rooms narrow to that
zone's members (nested zones included) and so do the doors/windows/openings/furniture
touching them, marked `filtered: true` + `selected_zones`. Whole-plan facts (`bbox`,
`totals`, `caption`) stay whole-plan, and — as with every other narrowing flag — `ok`,
`diagnostics` and the exit code come from the **unfiltered** plan, so reading one wing can
never make a broken building look sound. It composes with `--level` and `--room`.

### Placed instances are zones

A [`place`d component instance](language-reference.md#placing-instances--place-v122) is
implicitly a zone named after the instance, so a building composed of wings reports its
grouping with **no `zone` declaration at all**:

```json
"instances": [
  { "name": "west", "component": "wing", "at": { "x": 0, "y": 0 }, "rotate": 0 },
  { "name": "east", "component": "wing", "at": { "x": 42000, "y": 0 }, "rotate": 0, "mirror": "x" }
],
"zones": [
  { "id": "west", "path": "west", "rooms": ["west.g1", "west.g2", "west.g3", "west.corridor"],
    "room_count": 4, "floor_area_m2": 216 },
  { "id": "east", "path": "east", "rooms": ["east.g1", "east.g2", "east.g3", "east.corridor"],
    "room_count": 4, "floor_area_m2": 216 }
]
```

An implicit zone carries no `label` — the instance name *is* the heading, so the drawn
schedule groups read `west` / `east` rather than the component's name printed twice. Note
the zone path and the id namespace are separate concerns: wrapping a `place` in
`zone north` makes the zone `north.west` while the rooms stay `west.*`, because a zone is
metadata and never renames anything. A **legacy bare call** (`wing()`) declares no zone —
it is a macro, not a thing.

## Instances — the composition, as facts (v1.22)

`describe().instances` lists the plan's [`place`d component
instances](language-reference.md#placing-instances--place-v122) in source order: the
addressable name (which is also the id namespace of everything inside), the component it
was made from, where its local `(0,0)` landed, and the exact rigid transform it carries.
Absent entirely when the plan places none.

Every room, door, window, opening and fixture born inside an instance also carries
`instance` (and rooms/fixtures `component`), so a flat list of ids is still attributable:

```json
"rooms": [
  { "id": "west.main", "instance": "west", "component": "wing", "area_m2": 54, … }
]
```

Read it as the answer to *"what are this building's real degrees of freedom?"* — a wing is
one `at`, not N coordinates. `freedom.elements` says the same thing element by element:
inside an instance, `placement` describes how the element was authored **within its
component**, and the `instance` field says its position on the page additionally derives
from that instance's frame.

## Levels — one storey's facts at a time (v1.21)

A plan built from [`level` blocks](language-reference.md#levels--a-multi-storey-building-v121)
is a **drawing set**, and rooms, adjacency and circulation only mean something *within* one
storey. So `describe()` keeps its contract and appends one:

- every top-level field — `rooms`, `doors`, `access`, `circulation`, `totals`,
  `input_graph`, `freedom`, `schedule`, … — describes the **lowest storey** (page 1, the
  same drawing `compile().svg` returns);
- **`levels[]`** appends one summary per storey, ascending, each with the **full
  single-plan shape** plus `level` and `name`. `levels[0]` therefore repeats the top-level
  facts. The key is **absent** for a single-storey plan, so every existing summary is
  unchanged.

```json
"levels": [
  {
    "level": 1,
    "name": "Ground floor",
    "rooms": [{ "id": "hall", "label": "Hall", "area_m2": 15.4, "adjacent": ["living", "kitchen"] }],
    "totals": { "rooms": 3, "doors": 3, "windows": 2, "floor_area_m2": 56 },
    "access": { "entrances": ["front"], "hasEntrance": true }
  },
  { "level": 2, "name": "First floor", "…": "…" }
]
```

Read one storey with `arch describe house.arch --level 2 --json`: that level's facts become
the top-level ones and `levels[]` narrows to it, marked `filtered: true` +
`selected_level: 2`. Like `--room`/`--select` it is a **display filter** — `ok`,
`diagnostics` and the exit code always come from the whole building, so reading one floor
can never make a broken plan look sound. It composes with `--room` (which then narrows
*within* that storey).

`lint()` runs the rules **per storey** and concatenates the results in level order: each
floor needs its own reachable rooms and its own bedroom windows. Every diagnostic a storey
raises carries `level`, in the library and in `--json`, so a gate sees the whole building
while a reader still knows which floor to open. What a floor does *not* need is its own
front door — see the next section.

## Vertical circulation — the building graph (v1.21)

Rooms, adjacency and circulation are per-storey facts. **Vertical circulation is not**: a
`stair`/`elevator`/`escalator` drawn with the **same id** on two
[`level` blocks](language-reference.md#vertical-circulation--stair-elevator-escalator-v121)
is one shaft, and that is the only thing in the language that joins two floors. Identity is
the whole rule — nothing is inferred from geometry (ADR 0005), so two runs at the same
coordinates with different ids stay two different shafts.

Two fields carry it, and they sit at deliberately different levels:

- **`levels[i].verticals`** — the runs drawn on *that* storey, as facts:
  `{ id, kind, dir?, room, bbox, flight_width? }`. `room` is the room whose rectangle
  contains the footprint's centre (or `null`). Absent when a storey draws none.
- **`vertical`** — a **whole-building** block, present only at the top level (never inside
  `levels[i]`) and only when a run actually spans two or more storeys:

```json
"vertical": {
  "connections": [
    {
      "id": "stair",
      "kind": "stair",
      "levels": [1, 2],
      "stops": [
        { "level": 1, "dir": "up", "room": "hall" },
        { "level": 2, "dir": "down", "room": "landing" }
      ]
    }
  ],
  "reachable_levels": [1, 2]
}
```

**Reachability through a shaft.** A storey is *grounded* when its own access graph has an
exterior entrance. Reachability then spreads along the connections to a fixpoint: a storey
joined by a shaft to a reachable storey is itself reachable, and the room that shaft lands
in becomes an **arrival room** — the floor's entrance, one floor up. `reachable_levels` is
the answer.

Two lint rules read that, per storey:

- **`W_NO_ENTRANCE`** stands down on a storey with an arrival room. Before v1.21 an upper
  floor had to invent a balcony door to lint clean; `examples/two-storey.arch` no longer
  does.
- **`W_ROOM_UNREACHABLE`** treats each arrival room as joined to `exterior`, so the same
  BFS answers the same question one floor up.

Each storey's own `access.hasEntrance` stays **honest** — it reports that floor's doors, so
the upper storey of a house with one front door reads `false`. The cross-storey answer is
`vertical.reachable_levels`, never a doctored per-storey graph.

**`W_STAIR_UNMATCHED`** is the other side of the identity rule: a run whose id appears on
exactly *one* storey of a multi-storey plan connects nothing — usually a typo. It is
advisory and deliberately simple, so a top-floor flight to a roof hatch, and a lift that
stops short of a storey it passes, both carry it.

**`validate --graph` across floors.** For a multi-storey plan the intended-graph check is
the **whole building's**, not page 1's: storeys are scanned in ascending order and their
rooms pooled in that order (a repeated room id resolves to the lower storey). Nodes stay
rooms; a shaft contributes **one undirected edge per adjacent pair of its storeys**, between
the rooms it lands in on each — a lift serving levels 1/2/3 links 1–2 and 2–3, never 1–3. A
run that lands in no room on one of the two storeys contributes no edge there.

**Circulation.** A run's footprint obstructs the nav grid exactly like furniture, with one
exception: the body-radius halo is lifted outside its **entry edge(s)**, so the landing you
cross to reach it stays walkable. A stair has one entry edge — the arrow's tail, which is
the foot of a `dir up` flight and the head of a `dir down` one, so the same shaft is
approached from opposite ends on the two storeys it joins. An escalator has both narrow
ends; a lift car its south edge.

## Freedom — how constrained the plan is

`describe().freedom` is a **degrees-of-freedom report**: for every placed element,
whether its position was authored **absolutely** (a literal `at (x,y)`) or **derived**
by the resolver from a higher-level clause. It is the "how much of this plan is
pinned down vs computed" fact an agent reads before editing — moving a `relational`
room shifts everything placed off it, while an `absolute` room moves alone. Facts
only: no advice, no scoring, no thresholds.

Each family carries counts plus one `elements` row per member, in `describe`'s own
emission order (rooms, doors, windows, openings, furniture). For the strip-and-attach
`examples/attached.arch`:

```json
"freedom": {
  "rooms":     { "total": 2, "absolute": 0, "relational": 0, "strip": 2 },
  "openings":  { "total": 4, "attached": 4, "absolute": 0 },
  "furniture": { "total": 2, "anchored": 2, "againstWall": 0, "absolute": 0 },
  "elements": [
    { "id": "r_living", "kind": "room",      "placement": "strip" },
    { "id": "d_main",   "kind": "door",      "placement": "attached" },
    { "id": "sofa_1",   "kind": "furniture", "placement": "anchored" }
  ]
}
```

| Family | Placement values | Meaning |
|--------|------------------|---------|
| `rooms` | `absolute` · `relational` · `strip` | a literal `at`; a `right-of`/`below`/… clause; a `strip` block row |
| `openings` (doors + windows + cased openings) | `attached` · `absolute` | `on <wall> at <pos>`; a literal `at (x,y)` |
| `furniture` | `anchored` · `against-wall` · `absolute` | `in <room> anchor\|centered`; `against wall …`; a literal `at` |

An element inside a [`place`d instance](#instances--the-composition-as-facts-v122) adds an
`instance` field to its row. Read the pair together: `placement` is how the element was
authored **inside its component**, and `instance` says its position on the page *also*
derives from that instance's frame — so the one genuinely free number is the `place`'s
`at`, and nudging a wing is one edit rather than N.

Every derived placement is still resolved to concrete coordinates in the rest of the
summary — `freedom` only records *how* each coordinate was arrived at. On a plan that
failed to resolve, `freedom` is present with all-zero counts and an empty `elements`.

## Symmetry — the plan's group and its repeats

`describe(src, { facts: ["symmetry"] })` — `arch describe plan.arch --facts symmetry --json`
— adds `symmetry`: which rigid motions of the page map the plan onto itself, and which of
its rooms repeat. It is **opt-in**: without `--facts` the key is absent and every summary is
byte-identical to one written before it existed.

**What is measured.** The symmetries ArchLang can draw are the eight of the square — four
quarter-turns and four reflections, the group D4 that `place … rotate … mirror` already
acts by — combined with translations. A finite plan has no translational symmetry, so its
symmetry group fixes a point: its **stabiliser** is a subgroup of D4 about a centre `c`.
Any symmetry maps the plan's extent onto itself, so `c` can only be the centre of that
extent, and the seven non-identity candidates about it are each **tested on the shape**:
the whole labelled set of walls, rooms or drawn elements must map onto itself exactly.
The extent only nominates the candidate centre; no reported symmetry and no position is
derived from it, which is why a layer with no symmetry reports no `centre` at all.

Comparison is exact on integers — in doubled, centred coordinates `u = 4(p − c)`, so a
centre on a half-millimetre stays exact — whenever every coordinate is a multiple of half a
millimetre (every grid-snapped plan). Otherwise (an oblique wall's jamb, an arc's centre)
it is made at the 4-decimal precision the drawing's own exporters print, and the layer
reports `exact: false`.

Three layers, each with its own group:

| Layer | The set tested | Labelled by |
|-------|----------------|-------------|
| `shell` | the walls, in **maximal-line normal form**: collinear pieces of one thickness that overlap or touch merge into one segment, so splitting a wall into statements changes nothing | wall thickness only — a wall's category, material and hatch are not read (a hatch is laid on page axes and does not turn with the building) |
| `rooms` | each room's floor — a rectangle's or polygon's ring, a circle's centre and radius | the room's `uses`, never its label text; a room with no `uses` clause takes the uses `describe().rooms[].uses` reports for it, classified from its label (or its id when it has none) |
| `full` | everything drawn as building: the rooms, every opening (each handed choice its symbol draws: a hinged door's hinge side and swing, a non-hinged door's slide side, a sliding door's track, a barn, bifold or garage panel's face, and how far a sliding, barn, bifold or pocket panel is drawn `open`; a window's and a cased opening's jambs), the furniture (footprint, category, the back vector when the catalogue gives the symbol a back, and the handedness of a symbol that is drawn handed), the stairs, lifts and escalators (footprint, the way the arrow points, a stair's break-line hand), the columns, floor voids and roof outlines (footprints), the ground surfaces (outline and kind, and a balcony's railed edges) and the fences (each run's segments) — each read as a placed, mirrored instance really draws it | as `rooms`, plus kind and width, category, run kind and direction, surface kind or fence style |

Each layer reports:

| Field | Meaning |
|-------|---------|
| `group` | `C1` (none) · `C2` (half-turn) · `C4` (quarter-turns) · `D1` (one mirror) · `D2` (two mirrors and the half-turn) · `D4` (all eight) |
| `axis` (D1) / `axes` (D2) | the mirror line through `centre`: `x` is the `mirror x` reflection (the line is vertical, `x = centre.x`), `y` is `mirror y` (horizontal), `diag` runs top-left to bottom-right and `antidiag` bottom-left to top-right |
| `centre` | the fixed point every element turns or reflects about, in plan mm. **Absent on a `C1` layer**: nothing is fixed there, and the point would only be the midpoint of the layer's extent — a box position, not a fact of the shape |
| `elements` | every group element, identity first, in `place`'s spelling (`{ rotate, mirror? }`, reflect in x then turn) |
| `exact` | integer-exact comparison, or 4-decimal |

A layer holding nothing (no walls, say) is `null`. A furniture piece is compared on its
attributes rather than its drawn marks, so a symbol with more symmetry than they record
can only make the group smaller, never larger. Dimensions are in no layer: a dimension is
annotation about the building, not part of it.

**Repeats.** `repeats[]` lists the rooms that recur. A `translate` run is three or more
**congruent** rooms — the same floor, the same `uses`, the same furniture laid out the same
way, up to a translation — whose positions, sorted top to bottom then left to right, step
by a constant offset (`step`, mm). A `mirror` run is the terrace pattern A, mirror-A, A, …:
each room the exact reflection of the one before about an axis-parallel line (`axis`, as
above), with the lines (`lines`, their x for `x`, their y for `y`) evenly spaced; `step`
is the translation from each room to the one two along. Runs are cut **greedily**: in scan
order each run is extended as far as its step holds, and the next starts after it — so
runs are maximal-first and never overlap, and five congruent rooms at offsets 0, 1, 2, 4
and 6 m report the run `0, 1, 2` and not `2, 4, 6`.

For [`examples/museum-wing.arch`](../examples/museum-wing.arch), a symmetric example:

```json
"symmetry": {
  "layers": {
    "shell": { "group": "D1", "axis": "x", "centre": { "x": 9000, "y": 6000 },
               "elements": [{ "rotate": 0 }, { "rotate": 0, "mirror": "x" }], "exact": true },
    "rooms": { "group": "D1", "axis": "x", "centre": { "x": 9000, "y": 6000 },
               "elements": [{ "rotate": 0 }, { "rotate": 0, "mirror": "x" }], "exact": true },
    "full":  { "group": "C1", "elements": [{ "rotate": 0 }], "exact": true }
  },
  "repeats": [
    { "kind": "translate", "count": 3, "step": { "x": 6000, "y": 0 }, "ids": ["g1", "g2", "g3"] }
  ]
}
```

The walls and rooms mirror about `x = 9000`; the fit-out does not, because the one exit
door is on the west wall, so `full` is `C1` and reports no centre. The three galleries
are one room repeated at a 6 m step.

[`examples/terrace-row.arch`](../examples/terrace-row.arch) is four dwellings placed from
one component, alternately mirrored — and `--facts symmetry` reports that the row, as
drawn, has **no** symmetry and **no** exact repeat:

```bash
arch describe examples/terrace-row.arch --facts symmetry,syntax --json
```

```json
"symmetry": {
  "layers": {
    "shell": { "group": "C1", "elements": [{ "rotate": 0 }], "exact": true },
    "rooms": { "group": "C1", "elements": [{ "rotate": 0 }], "exact": true },
    "full":  { "group": "C1", "elements": [{ "rotate": 0 }], "exact": true }
  },
  "repeats": []
}
```

That is the true answer, not a miss: the third unit is 6000 mm wide where the others are
5400, and alternate units step back 600 mm from the street, so no unit is an exact
translate or mirror image of its neighbour. Make the four widths equal and the setback `0`,
and the same row is `D1` about `x = 10800` on every layer, with a `translate` run of the
four halls and a `mirror` run each of the beds, baths and living rooms, reflected about
`x = 5400, 10800, 16200`.

Without `--json`, `--facts` adds one line per fact to the human summary, e.g.
`symmetry: shell D1 x · rooms D1 x · full C1; repeats 2` and `syntax: k=17 cycleRank=4`.
`--select symmetry` (or `syntax`) without the matching `--facts` is a usage error rather
than a silently missing key.

## Space syntax — integration on the access graph

`describe(src, { facts: ["syntax"] })` — `arch describe plan.arch --facts syntax --json` —
adds `syntax`: the space-syntax measures of Hillier and Hanson (*The Social Logic of
Space*, 1984), computed on the [access graph](#the-access-graph) above. Opt-in like
`symmetry`.

The graph is `describe().access`'s own: one node per room plus `exterior` (the carrier),
one edge per pair of spaces a modelled connector joins, taken as a simple graph — two
doors between the same two rooms are one permeability, not a ring. The **system** is
everything `exterior` reaches; `k` is its node count, `exterior` included. Step distances
are all-pairs shortest paths at unit cost.

| Field | Definition |
|-------|------------|
| `k` | nodes in the system |
| `cycleRank` | E − V + C over the whole graph (every room and `exterior`; C counts its connected pieces): the number of independent rings — `0` is tree-like |
| `rooms[].depth` | steps from `exterior` — exactly `access.rooms[].depthFromEntrance` |
| `rooms[].meanDepth` | MD = the sum of steps to the other k − 1 nodes, over k − 1 |
| `rooms[].ra` | relative asymmetry RA = 2(MD − 1) / (k − 2), from 0 (adjacent to everything) to 1 (the end of a corridor); `null` when k ≤ 2 |
| `rooms[].rra` | real relative asymmetry RRA = RA / D_k, where D_k = 2(k(log₂((k + 2) / 3) − 1) + 1) / ((k − 1)(k − 2)) is the RA of the root of a k-node **diamond**, the reference graph Hillier and Hanson normalise by (the definition depthmapX uses). It makes systems of different sizes comparable; `null` when RA is |
| `rooms[].integration` | Hillier and Hanson's integration value **1 / RRA** — higher is more integrated. `null` when RRA is `null`, or when RA is `0` (the reciprocal is unbounded; `ra: 0` beside it says which) |
| `rooms[].control` | Σ over the room's neighbours of 1 / (the neighbour's degree): how much of its neighbours' access it commands |

A room the system does not reach has every metric `null`, never `NaN`. Ratios are rounded
to 4 decimals. D_k is the one non-rational step (a base-2 logarithm); it is rounded with
everything else, so a last-bit difference between JavaScript engines could move a printed
digit only on an exact 4-decimal tie.

For the terrace row above, `k` is 17 (sixteen rooms and the outside) and `cycleRank` is 4:
each dwelling is one ring — street, living room, hall, bedroom, garden door, back to the
street. Every unit reads the same, so one suffices:

```json
"syntax": {
  "k": 17,
  "cycleRank": 4,
  "rooms": [
    { "id": "u1.bed",    "depth": 1, "meanDepth": 2.4375, "ra": 0.1917, "rra": 0.7858, "integration": 1.2726, "control": 0.4583 },
    { "id": "u1.bath",   "depth": 3, "meanDepth": 4.0625, "ra": 0.4083, "rra": 1.674,  "integration": 0.5974, "control": 0.3333 },
    { "id": "u1.hall",   "depth": 2, "meanDepth": 3.125,  "ra": 0.2833, "rra": 1.1616, "integration": 0.8609, "control": 2 },
    { "id": "u1.living", "depth": 1, "meanDepth": 2.4375, "ra": 0.1917, "rra": 0.7858, "integration": 1.2726, "control": 0.4583 }
  ]
}
```

The bath is the deepest and least integrated space, the hall has the most control. In
`museum-wing.arch` the corridor opens onto the outside and all three galleries, so its RA
is `0` and its `integration` is `null`: it is as integrated as a space can be.

## `lint` — architectural soundness

`arch lint plan.arch --json` returns advisory `W_*` diagnostics, each with a byte
`span`, a `line`/`col`, and a `fix`. Warnings never block rendering — they flag
*habitability*, not *validity*. The rules, grouped by what they watch:

| Family | Example codes |
|--------|---------------|
| Room | `W_ROOM_TOO_SMALL`, `W_ROOM_DISCONNECTED`, `W_BEDROOM_NO_WINDOW`, `W_ROOM_OVERLAP`, `W_ROOM_NOT_EQUATOR_FACING` |
| Placement | `W_DOOR_OFF_WALL`, `W_WINDOW_OFF_WALL`, `W_OPENING_OFF_WALL` |
| Door / circulation | `W_DOOR_CLEARANCE`, `W_SWING_OBSTRUCTED`, `W_NO_ENTRANCE` |
| Reachability | `W_ROOM_UNREACHABLE`, `W_BATH_VIA_BEDROOM` |
| Wet rooms | `W_ROOM_NOT_ENCLOSED`, `W_ROOM_NO_FIXTURE` |
| Garage | `W_GARAGE_TOO_NARROW` |
| Furniture / fixtures | `W_FIXTURE_FLOATING`, `W_FIXTURE_BACK_TO_ROOM`, `W_FIXTURE_WRONG_ROOM`, `W_FURNITURE_OVERLAP`, `W_FURN_CLEARANCE` |
| Circulation quality | `W_ROOM_NO_CLEAR_PATH`, `W_PATH_TOO_NARROW`, `W_CIRCUITOUS_PATH` |

Every code is documented — with cause, fix, and example — in the
[error catalog](error-codes.md), or run `arch explain W_SWING_OBSTRUCTED`. (In human
mode each diagnostic already prints its catalogued `= fix:` line, so the lookup is
usually unnecessary.)

Narrow a noisy report with `--code` or `--severity` — on `lint` and on `validate`:

```
arch lint plan.arch --code W_ROOM_UNREACHABLE,W_NO_ENTRANCE --json   # only these codes
arch validate plan.arch --severity error --json                      # only the blocking errors
```

> **A display filter never changes gating.** `--code` and `--severity` (like `describe`'s
> `--select` / `--room`) filter what is *shown*; `ok` and the exit code are always computed
> from the **unfiltered** diagnostic set, and a narrowed result marks itself with
> `filtered: true` and a `total_diagnostics` count. Reading less can never make a broken
> plan look sound.

### Profiles

A **profile** is a named bundle of thresholds, applied with `--profile` (CLI) or
`lint(src, { profile })`. The names come from `LINT_PROFILES` (`src/lint.ts`):

| Profile | Thresholds |
|---------|-----------|
| `residential-basic` *(default)* | doors ≥ 700 mm, rooms ≥ 4 m², walk clear ≥ 700 mm, detour ≤ 3.0×, no swing-clearance buffer |
| `accessibility-advisory` | doors ≥ 850 mm, rooms ≥ 5 m², walk clear ≥ 900 mm, detour ≤ 3.0×, 150 mm swing clearance |

```
arch lint plan.arch                                  # residential-basic
arch lint plan.arch --profile accessibility-advisory
```

The flagship studio is **clean under the default profile**, but the stricter profile
surfaces advisory notes — its 800 mm internal doors and ~4–5 m² hall and bath fall
under the accessibility thresholds:

```json
{
  "ok": true,
  "diagnostics": [
    {
      "code": "W_DOOR_CLEARANCE",
      "message": "Door is 800 mm wide (under the 850 mm minimum nominal width).",
      "line": 30, "col": 3,
      "fix": "Widen the door to at least the minimum clear width.",
      "hints": ["Widen it to at least 850 mm."]
    },
    {
      "code": "W_ROOM_TOO_SMALL",
      "message": "Room \"Hall\" is only 4.2 m² (under 5 m²).",
      "line": 22, "col": 3,
      "fix": "Increase its `size`, or merge it into an adjacent space."
    }
  ]
}
```

> Profiles are **advisory soundness checks, never a building-code compliance
> guarantee.** Real accessibility and code review depend on jurisdiction; treat these
> as a helpful nudge, not a sign-off.

## The agent loop

Together, `describe` and `lint` close the author → render → **verify** loop for an AI
agent with no eyes on the drawing — see
[Use ArchLang from an agent](https://archlang.uk/agents):

1. `arch compile` — render and get errors as data.
2. `arch describe --json` — confirm the room count, labels, areas, and access match
   the brief.
3. `arch lint --json` — clear the habitability warnings (each carries a `fix`).

### Diagnostics as data, and seeing a failure

The two feedback channels an agent relies on are both public, structured API:

- **`diagnosticToJson(source, d)`** (exported; type `DiagnosticJson`) is the canonical
  projection the CLI's `--json` output already uses for every diagnostic. It resolves the
  byte `span` to 1-based `line`/`col` (via `offsetToLineCol`) and attaches the catalogued
  `fix` for the code, so a self-correcting agent has the location and the remedy without a
  docs lookup:

  ```ts
  import { compile, diagnosticToJson } from "@chanmeng666/archlang";
  const { diagnostics } = compile(src);
  const asJson = diagnostics.map((d) => diagnosticToJson(src, d));
  // → { code, severity, message, line, col, span: [start,end], fix?, hints? }
  ```

- **The opt-in error card.** By default a plan that fails to compile produces **no image** —
  correct for a pipeline, but blind for an agent watching the drawing. `compile(src, { onError:
  "svg" })` / `--error-svg` (on `arch compile`, `arch preview`, and `arch md`) instead renders
  a deterministic, self-describing SVG card — severity, code, `line:col`, message, and the
  catalogued fix — so the failure is visible, not just returned. Errors, diagnostics, and exit
  codes are unchanged; without the opt-in the failing plan still yields no bytes. The renderer
  is exported as `renderErrorSvg`. See
  [ADR 0009](adr/0009-ai-first-context-and-distribution.md).

For a full cold start, `arch context` (and the shipped `llms-full.txt`) bundle this loop —
the language spec, the `SKILL.md` workflow, the CLI reference, and the whole error catalog — into
one system-prompt-ready document.
