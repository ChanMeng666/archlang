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
| `totals` | room / door / window counts and total floor area |
| `accTitle` / `accDescr` | the plan's declared [accessible metadata](language-reference.md#accessible-metadata-acctitle-accdescr) — **present only when the source declares them** |
| `axes` | the plan's declared [positioning axes](language-reference.md#positioning-axes-定位轴线) — **present only when the source declares an `axes` block** |
| `site` | the direction **names** the plan's [`site` block](language-reference.md#site-and-orientation) licenses — `street`, `back`, `equator_side`, `sunrise_side`, `sunset_side` and the `hemisphere` they were read in, every one of them a compass letter on the same `north` as `windows[].facing`. **Present only when the source declares `site`.** The three `_side` names are a *drafting heuristic for an aspect, not a measured daylight outcome* — there is no sun model, latitude or date in ArchLang; see the note in the [language reference](language-reference.md#site-and-orientation) |
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

`fits` is a question about the **sheet**, not only about the building: a plan whose walls
fit comfortably can still answer `false` because the schedule and legend it asked for take
the band below the drawing. Adding `schedule rooms` to a tight sheet can therefore flip
`fits` and raise `W_SCALE_OVERFLOW` with no change to the plan's geometry at all — which is
the honest answer, and was not reported before v1.26.2 (the tables were laid out but never
measured, so a page could be emitted taller than its own `paper` with `fits: true` on it).

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
    { "roomId": "r_living", "walkDistanceMm": 4000, "bottleneckClearWidthMm": 940, "detourRatio": 1.29 },
    { "roomId": "r_bath",   "walkDistanceMm": 5300, "bottleneckClearWidthMm": 700, "detourRatio": 2.74 }
  ],
  "routes": [
    { "fromRoomId": "r_bed", "toRoomId": "r_bath", "walkDistanceMm": 6000, "bottleneckClearWidthMm": 700, "detourRatio": 1.53 }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `entranceId` | the door the walk is measured from (first entrance in source order) |
| `cellSizeMm` / `bodyRadiusMm` | the nav-grid quantum (distances are rounded to it, so they're coarse) and the radius obstacles were inflated by |
| `rooms[].walkDistanceMm` | walking distance from the entrance to the room, over the eroded grid |
| `rooms[].bottleneckClearWidthMm` | the narrowest unavoidable clear width on the way in (a door width, or a furniture pinch) |
| `rooms[].detourRatio` | `walkDistance ÷ straight-line` — how far the route wanders from a beeline (`≥ ~1`) |
| `routes[]` | key functional routes (kitchen → nearest living/dining, bedroom → nearest bath), same three metrics |

Two advisory lint rules read this model, and the same model backs the opt-in
`arch compile --overlay circulation` render overlay (see
[ADR 0008 — circulation as facts](adr/0008-circulation-as-facts.md)).

### Grid resolution — why `cellSizeMm` is worth reading

**Areas are exact; anything measured on a grid is an approximation, and `cellSizeMm`
tells you how coarse.** Room areas, adjacency and the access graph come from exact
rectangle arithmetic. Circulation distances and clear widths are read off a raster, so
they are quantised to the cell — treat them as "about", never as a dimension to build to.

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
