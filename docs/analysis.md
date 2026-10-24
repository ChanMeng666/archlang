# Analysis: `describe` & `lint`

ArchLang compiles a plan to a drawing — but it can also **read the plan back as
facts**. Two pure functions turn source into machine-readable, image-free output:

- **`describe(source)`** — a semantic summary: rooms, areas, adjacencies, what every
  door/window/opening connects, the furniture, a modelled **access graph**, and a
  **circulation** model (how far you walk to each room and the pinch on the way).
- **`lint(source)`** — advisory `W_*` warnings about habitability, against a chosen
  profile.

Both are exported from the package (`import { describe, lint } from "@chanmeng666/archlang"`)
and surfaced on the CLI as `archlang describe` / `archlang lint` (add `--json` for the
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

`archlang describe plan.arch --json` returns a `SceneSummary`. For
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
      "net_area_m2": 22.33,
      "bbox": { "x": 0, "y": 0, "w": 4000, "h": 6000 },
      "adjacent": ["r_bed", "r_hall", "r_bath"]
    },
    {
      "id": "r_bath",
      "label": "Bath",
      "uses": ["bath"],
      "area_m2": 4.8,
      "net_area_m2": 4.13,
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
  "totals": { "rooms": 4, "doors": 3, "windows": 3, "floor_area_m2": 42, "net_floor_area_m2": 38.29 }
}
```

| Field | Meaning |
|-------|---------|
| `caption` | one deterministic sentence summarising the whole plan (room count, total area, the rooms and their areas, door/window counts, entrance) — **always present**, composed only from the fields above so it never diverges from them |
| `bbox` | overall extent on wall **centerlines** — the coordinate space the source is written in (room `at`/`size`, wall points), so this is the number to compute *with* |
| `bbox_outer` | overall extent on the **outer wall faces** — `bbox` plus half a wall thickness at each end (7000×6000 inside a 200 shell is 7200×6200 outside). What a builder measures, what `dims auto`'s overall chain prints, and what to quote when someone asks how big the building is |
| `rooms[].uses` | the room's [`uses` tags](language-reference.md#room) (or the inferred kind when none were authored) |
| `rooms[].area_m2` | floor area in m², rounded to 2 dp — `w × h` for a rectangle, the exact **shoelace** area of the ring for a [polygon room](language-reference.md#polygonal-rooms-v1-23). A room is drawn on wall **centrelines**, so this runs to the middle of every wall round it |
| `rooms[].net_area_m2` | **net internal** area in m², rounded to 2 dp: the floor no wall stands on — the room's own shape less every part of it a wall's band covers, each band as the drawing draws it (faces, square caps at a free end, mitred joints, true arcs; openings not cut). A wall on the edge takes half of itself, a wall standing on the floor takes what it stands on. Always `<= area_m2`, and equal to it when no wall touches the room. Computed exactly in closed form, or **absent** when it cannot be (then `totals.net_floor_area_m2` is absent too). This is the figure to quote as a room's floor area (rule: [ADR 0027](adr/0027-net-internal-area.md)) |
| `rooms[].floor_polygon` | the room's floor as a closed ring: a rectangle's four corners, or the polygon's own vertices. This — not `bbox` — is the room's shape |
| `rooms[].bbox` | the room's **vertex extent**. For a polygon room it is the box the ring fits in, which is bigger than the floor |
| `rooms[].adjacent` | ids of rooms whose walls touch this one within tolerance (a shared corner alone doesn't count) |
| `doors[].between` / `openings[].between` | the two spaces the connector joins — a room id or the literal `"exterior"`. For a connector on a wall it is the space probed one wall thickness either side of that wall's centreline, half a thickness past each face (on no floor behind an exterior wall: `"exterior"`), not which room edges the connector's centre point touches. A probe that lands on the boundary two rooms share picks the room covering more of the opening on that side. A side counts only for a room the connector's point touches, so behind a thick wall a probe that reaches a room beyond a shallow one decides nothing |
| `doors[].straddles` / `openings[].straddles` | every room the opening covers on one side of its wall when that is more than one: a wall runs into the opening (measured just inside each jamb). Listed even when those rooms are the `between` pair. **Present only then** |
| `windows[].room` | the room the window lights: the first room whose edge the window's centre is on. A window on an `arc` wall edge that no room edge touches is read from the shape instead: the room whose floor lies one wall thickness behind either face, or, for a bay outside a room drawn to the arc's chord, the room the probe enters one wall thickness past the chord along the curve's inward normal, unless a wall stands on or across the chord there. `null` when none of these finds a room |
| `windows[].facing` | the **true compass** direction the window's wall faces (`N`/`S`/`E`/`W`), read against the plan's [`north`](language-reference.md#plan-settings) setting. Under the default `north up` the top of the drawing is north, so a top-edge window faces `N`; under `north right` compass north points at the page's right edge, so a right-edge window faces `N` and a top-edge one faces `W`. A `north <deg>` bearing snaps to the nearest cardinal (an exact 45° tie rounds clockwise) |
| `windows[].facingPage` | the same direction **before** `north` is applied — `N` = toward the top of the drawing. **Present only when the declared `north` actually turns the answer**, so a plan on the default `north up` is unchanged |
| `voids` | the holes in this storey's floor plate — one `{ id, at, size, room }` per [`void`](language-reference.md#void--a-hole-in-the-floor-v1-29). **Present only when the storey declares one.** `room` is the room whose FLOOR contains the opening's centre (`null` when none does — a void in the notch of a U-shaped room belongs to no room, even though it is inside that room's `bbox`). The room's `area_m2` is **not** reduced by it: subtract `size.w × size.h` yourself if you need the net |
| `outdoor` | the [ground surfaces](language-reference.md#outdoor--ground-outside-the-building-v1-31) outside the building — one `{ id, kind, label?, area_m2, bbox, rail? }` per `outdoor`. **Present only when the storey declares one.** `area_m2` is the exact **shoelace** area for the `polygon` spelling, never the `bbox`. `rail` is present on a `balcony` and absent on every other kind — an empty array there means "no railing", which is a different fact from the key being missing. **None of this is floor area:** a ground surface appears in no other part of the summary, and its area is totalled separately (below) |
| `fences` | the [fence runs](language-reference.md#fence--a-boundary-line-on-the-ground-v1-31) — one `{ id, style, length_mm, closed }` each. **Present only when the storey declares one.** A fence is not a wall: it is absent from `walls`, from `access` and from `input_graph`, and it hosts no opening |
| `totals` | room / door / window counts and total floor area: `floor_area_m2` sums the rooms' `area_m2`, `net_floor_area_m2` their `net_area_m2` (each summed from the rounded per-room figures; absent when any room's net area is) |
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
archlang describe plan.arch --select rooms,totals --json
archlang describe plan.arch --room r_bath,r_hall --json
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
side to be the fixture's back), and `archlang repair` declines to push a piece into one,
reporting it in `unresolved`. `W_ROOM_OVERLAP`, by contrast, **was** generalised: it runs
an exact ring-vs-ring intersection test, so a room tucked into an L's notch — overlapping
boxes, disjoint floors — does not warn, while two floors that really do intersect still do.

### Curves: what is exact, and what is chordal (v1.24)

A curve has two truthful descriptions — the circle it is, and a polygon close enough to it
— and this layer deliberately uses each where it belongs. The rule is short:

| Fact | How it is computed |
| --- | --- |
| A circular room's `area_m2` (label, `describe()`, `schedule rooms`, Plan JSON) | **Exact** — πR², closed form |
| Any room's `net_area_m2` crossed by a curved wall band | **Exact** — closed-form arc pieces (ends, centre, swept angle) on the boundary of the covered region; π(R − t/2)² for a circle walled all round by one concentric thickness. Angles are read through `atan2` ([ADR 0027](adr/0027-net-internal-area.md)) |
| `floor_circle`, `dim diameter`, `dim radius`, the `dims auto` R/φ call-outs | **Exact** — the authored centre and radius |
| The drawing extent, a wall's outer-face box, a spatial-index cell | **Exact** — the arc's closed-form extremes, so a bulge is never clipped |
| Which wall hosts an opening, and how far along it sits | **Exact** — distance to the arc, and run length `R·θ` |
| The occupancy grid, the circulation flood-fill, path widths | **Chordal** — a 48-sided inscribed ring (7.5° per chord) |
| Room-vs-room overlap, and a fixture's wall collision | **Chordal** — the same ring, through the polygon tests |
| The drawn poché fill of a curved wall | **Chordal** — the visible faces stay true arcs |

The chordal ring is inscribed, so it is **conservatively small**: a grid answer never
claims floor the circle does not have. At 7.5° a chord's sagitta is about `R/467` — 19 mm on
a 9 m radius — which is well inside the tolerances the circulation rules already work at.
Where the difference would be visible in a *number a reader trusts*, the exact form is used
instead; that is why the area is never taken from the ring (a 48-gon is 0.29% short, enough
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
| `edges[].straddles` | as `doors[].straddles` |
| `edges[].ambiguous` | the connector sits where three or more rooms meet, and probing one wall thickness either side of its host wall's centreline could not say which two it joins (a probe landed on a room boundary). It is listed but joins nothing, so it counts for no room's reachability. When the probe does decide, `between` is the room on each face, and lint, circulation and `suggest` all read that same pair |
| `rooms[].depthFromEntrance` | how many connectors you pass through from the nearest entrance (`1` = opens straight off it); `null` if you can't get there |
| `rooms[].reachable` | can this room be reached from the exterior at all? |
| `rooms[].bottleneckClearWidth` | the **narrowest clear width** along the widest path in from the entrance — the real constraint for moving furniture or a wheelchair (a widest-path search, so it reports the best route's worst pinch) |
| `mainEntrance` | which entrance is the **front door**: `{ door, basis, candidates }`. **Present only on a storey with more than one entrance.** The candidates are the exterior doors with a leaf that are not a `garage` door, do not open onto an `outdoor balcony`, and do not open into a private room (a bedroom, bath or WC with no living, dining, kitchen, entry, hall or circulation use beside it, so a studio's door stays one); width never decides. In order, each step must single out exactly one door: the one door into an entry, hall or circulation room, of any leaf, but only when every other candidate opens into a service room (utility, storage, garage) (`basis: "entry-room"`); else, with `site`, the one **hinged** door not into a service room whose wall faces `site.street` (`"street"`; a wall at 45° faces no single side, and a street side with only service doors is refused); else the only candidate (`"sole"`). Otherwise the choice is refused, `door: null`: `"tie"` (the candidates are listed) or `"no-candidate"`. A storey a stair or lift arrives on from a storey below that has a candidate of its own names none (`"upper-storey"`) |
| `rooms[].depthFromMainEntrance` | connectors passed from the main entrance (its room is `1`) **without going outside**; `null` for a room reached only through another door from outside. Present only when `mainEntrance.door` names a door. `depthFromEntrance` is unchanged beside it |

When a main entrance is named, lint's `W_PATH_TOO_NARROW`, `W_ROOM_VIA_PRIVATE` and `W_WET_ROOM_DOOR`
judge a route from it: another door from outside counts as a way in only into a room the main entrance
cannot reach from inside, or when it is a `garage` door. So a patio or balcony door no longer
hides a route blocked from the front door. A room with a door of its own from outside is judged by
that door, and when the walk from the main entrance cannot reach it at all `W_PATH_TOO_NARROW` says
so with its own message ("From the main entrance the walk to … is blocked; the room is reached only
through its own door from outside"). When the fact refuses, they measure from every
exterior door, and the coverage report says so (`no-main-entrance`). Which rooms are reachable at all does not
change.
`circulation` below, and `W_CIRCUITOUS_PATH`'s ratio, still measure each room from its nearest
entrance.

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

(Re-read from `archlang describe examples/studio.arch --json`. The excerpt had drifted before the
tie rules too: `r_bath` and the route were already 4600 mm / 740 mm / 2.27 and 5100 mm / 740 mm
/ 1.31. Of the figures shown, the tie rules moved only `r_living` — 4000 mm, 1.29 → 3700 mm,
1.26 — and the route — 5100 mm, 1.31 → 5000 mm, 1.32.)

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
`archlang compile --overlay circulation` render overlay (see
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
  { "no": "01", "id": "living", "name": "Living", "area_m2": 12, "net_area_m2": 10.78 },
  { "no": "02", "id": "bath",   "name": "bath",   "area_m2": 9,  "net_area_m2": 7.98 }
]
```

- `no` is the drawn number: 1-based **source order**, zero-padded to one uniform width
  across the table (`01`…`09`, `001`…`100`) — cite it the way a reviewer will ("room 02").
- `name` is the room's `label`, falling back to its `id` when unlabelled (`bath` above).
- `area_m2` and `net_area_m2` are byte-identical to that room's `rooms[].area_m2` and
  `rooms[].net_area_m2`, and the drawn `TOTAL` row is `totals.floor_area_m2` and
  `totals.net_floor_area_m2` — one derivation feeds both the drawing and this JSON, so the
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

Read one wing with `archlang describe museum.arch --zone west --json`: the rooms narrow to that
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

Read one storey with `archlang describe house.arch --level 2 --json`: that level's facts become
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
exterior entrance. Reachability then spreads along the connections to a fixpoint over
storeys **and rooms**: a shaft carries you on only from a stop whose room you can walk to
on its own storey — from the front door if the storey is grounded, or from a room another
live shaft lands in. The rooms it lands in become **arrival rooms** — the floor's entrance,
one floor up. A stair standing in a store with no door therefore connects nothing, and the
floor it leads to is not reachable through it. `reachable_levels` is the answer. (A stop
whose footprint lies in no room still counts as soon as its storey is reachable.)

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

A storey with no exterior door of its own is **walked from the runs that arrive on it**: each
arriving run is an entrance whose walk starts in the row of cells in front of the edge a
person steps off at, seeded at the run's width, and the rooms the doors reach are those
walkable from the arrival rooms — the same rooms `W_ROOM_UNREACHABLE` starts from.
`levels[i].circulation` carries the run's id as `entranceId`, and
`W_PATH_TOO_NARROW`/`W_CIRCUITOUS_PATH` measure that floor as they measure a ground floor. A
storey with a front door — a balcony door included — walks from it, whatever shafts land
there.

Which runs a person **arrives** by is a property of the building's connectivity, not of
declaration order: a run's neighbouring stop (on the storey below, or above, along its shaft)
is an **arrival side** when it is reachable — its storey, and the room it stands in — in the
same room-aware building graph **with this storey taken out**. A run with no arrival side is
not an arrival: with `s1` joining levels 1–2 and `s2` levels 2–3, level 3 is reachable only
through level 2, so nobody arrives on level 2 by `s2` — it is boarded there, and level 2 is
walked from `s1` alone. (The arrival rooms `W_ROOM_UNREACHABLE` starts from are unchanged.)

The edge stepped off at is the **head of the flight from the arrival side**: arriving from
below, the end opposite where the storey below boards that run (its arrow's tail), and
likewise from above. It is not this storey's own tail: on a middle storey whose flight
climbs on, you arrive at the head of the flight below, not at the foot of the next one. The
run's halo is lifted there too, so the landing is walkable. An escalator is stepped off at
that one end only; a lift car at its door side. Direction of travel is not modelled — `dir`
is a drawing convention per storey — so a pair of escalators, one up and one down, seeds the
upper storey at both cars. When there are arrival sides both below and
above (the storey is reachable from either independently), or the neighbouring stop is a
different kind of run, the walk starts in front of the run's own entry edge(s) instead.

Whether there is a landing at all is decided on the plan's geometry, not on the grid: at
nine evenly spaced points just beyond the edge, is there floor in the arrival room that no
wall band (except where a door or opening is cut through that same wall), void, other run, or
furniture within a body radius covers? The points are 1 mm out and about 112 mm apart on a
900 mm flight, so it is a sampled test: an obstruction narrower than their spacing can sit
unseen between two of them, and a slot narrower than it can be missed. On a large plan whose cell does not divide it, the cell centres fall in a
different place in a turned frame, so a test on cells read the same shallow landing as open
in one frame and covered in another. Given a landing, the walk starts in the row of cells
directly in front of the edge, or, when the grid's phase leaves that row with no free cell,
at the free cells nearest the edge (in front of it or beside the flight, within a body radius
and a cell or so).

The v1 arrow convention limits this. The arrival edge follows the drawn direction of the
run, not a search for the room, so a landing with no floor in front of it seeds nothing and
the storey's model measures nothing. The reason each room then carries is an existing one,
no new code: a flight whose head lies against the shell wall leaves its rooms `unmeasured` as
`unreachable`; a landing covered by something else (a `void` at the head of the flight,
furniture) on a storey whose room has no doorway reads `no_threshold`. Flip the footprint's
authored coordinates (or the run's `dir`) so the head opens onto the floor. When the run is
drawn along a different axis on the storey it is boarded from (portrait below, landscape
above), the head cannot be read on this footprint and the run's own entry edge is used.

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

`describe(src, { facts: ["symmetry"] })` — `archlang describe plan.arch --facts symmetry --json`
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
archlang describe examples/terrace-row.arch --facts symmetry,syntax --json
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

`describe(src, { facts: ["syntax"] })` — `archlang describe plan.arch --facts syntax --json` —
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

## Dependencies — what each element derives from

`describe(src, { facts: ["depends"] })` — `archlang describe plan.arch --facts depends --json`
— adds `depends`: for every element, the ids its position was derived from and the names
its expressions read. It answers "if I change this, what follows?" before you change it.
Opt-in like `symmetry`; without `--facts` the key is absent.

`depends.elements[]` has one row per element (every element of the storey except the
`walls from rooms` statement itself), sorted by `id`:

| Field | Meaning |
|-------|---------|
| `id`, `kind` | the element, as in the rest of the summary |
| `on` | the ids it derives from, sorted: a relational room's reference room; the two rooms of `between A and B`; the room of `on <room>.<edge>`, `against <room>.<edge>` and `segment containing <room>.<edge>`; a `facing` target; the room of `in <room> anchor` or `centered` (and of `in <room>` on an `against wall` piece with no `side`, which picks the face from it); `swing into <room>`; a pairwise wall's rooms; the element `dim radius` or `diameter` measures; every room whose datum (`r.top`, `r.cx`, a compass alias, `from r.left`) it reads; and its host wall, or the wall it backs onto, when that wall is authored — so a roof following an authored ring (`roof overhang 500 wall ring`) lists `ring` here, while one following a derived ring names it only as `hostWallId` |
| `params` | the bound names its own expressions read, sorted: a `let`, a module `let`, a component or function parameter, a `for` variable, and the user functions it calls (never a built-in) |
| `axes` | the positioning-axis labels it is placed at (`at axis 3`, `at axis B`), sorted. Always present, like `on` and `params`, and empty when it reads none |
| `hostWallId` | the wall it is hosted on or backed onto, authored or derived: a door's, window's or cased opening's host (as in `access.edges[]`), an `against wall` piece's wall, the ring a `roof … overhang` follows. Absent when there is none |

`depends.derived_walls[]` has one row per wall `walls from rooms` derived, sorted by
`name` (the name `derived_walls[]` and `heights.walls[]` use): `on` is the pair of rooms a
partition stands between, or the whole room set (less `except`) for a ring, plus any
authored wall that took a span of the run over; `params` are the names its thickness reads.

**A derived wall is never named in `on`.** It has no id an author can write, so an element
hosted on or backed onto one (a door, a window, a piece `against wall exterior …`, a roof
following the ring) names it only as `hostWallId`; join that to `depends.derived_walls[]`
for the rooms it came from. Those rooms are listed once there, never copied into each piece,
so the output is linear in the elements plus the derived walls times their rooms (225 rooms
and 2,400 pieces against the ring print about 0.5 MB, not 540,000 copied room ids).

What it does not record, so you can tell an empty list from a missing one:

- **Direct reads only.** `let w = base * 2` read by a room puts `w` in its `params`, not
  `base`; a `place wing(W)` puts the component's own parameter name in its contents' rows.
- **The enclosing loop or condition** (`for i in 0..n`, `if`) decides whether an element
  exists, not where it stands, and is not listed; the loop variable it reads is.
- **Geometry found by search, not by name:** `dim faces`/`clear` projecting onto the wall
  they meet, `flush` measuring from the wall behind an edge, a door `at (x,y)` finding its
  nearest wall (that one is listed, as its host), `set` defaults.
- **Heights** are not dependencies of a position (they draw nothing); a `height`, `sill` or
  `head` clause's names are in that element's own `params` and nowhere else. `--view` never
  reaches `describe()`.

For `examples/relational.arch`, where only the living room is placed by number:

```json
{ "id": "bath", "kind": "room", "on": ["bed"], "params": [], "axes": [] },
{ "id": "counter_5", "kind": "furniture", "on": ["kitchen"], "params": [], "axes": [], "hostWallId": "exterior" },
{ "id": "door_2", "kind": "door", "on": ["bed", "hall"], "params": [], "axes": [], "hostWallId": "hall|bed" },
{ "id": "window_1", "kind": "window", "on": ["living"], "params": [], "axes": [], "hostWallId": "exterior" }
```

and among the derived walls, `{ "name": "hall|bed", "on": ["bed", "hall"], "params": [] }`.
Without `--json` the human summary gains one line, e.g.
`depends: 22 of 24 element(s) depend on another id, a name, an axis or a host wall; 7 derived wall(s) (--json for the lists)`
(the two that do not: the living room, placed `at (0,0)`, and the `dim`, whose points are numbers).

## Impact — change one number, see what follows

`impact(before, after)` — `archlang impact plan.arch --set W=4500` or
`archlang impact plan.arch --against old.arch`, `--json` for the object — compiles two versions
of a plan through the one pipeline and answers "change one number: what changes, what must
not". `--set NAME=value` makes the second version from the first by replacing the expression of
the root plan's top-level `let NAME` with a numeric literal (`4500`, which is millimetres since a
plan's units are always mm, or `4.5m`); any other name, a
value-function, a `let` declared twice or reassigned, or a value that is not one number is
refused with `E_SET_OVERRIDE` (exit 2). `--against` compares the input (the new version) with an
older file. The report is a measurement: it exits 0 whatever broke.

It is built on two existing facts: `diffPlans`' room, opening and wall deltas, and the `depends`
rows above. It has four parts:

| Part | Meaning |
|------|---------|
| `lets` | the bound names whose binding changed (a `let` anywhere, a `for` variable's range, the argument a component parameter is given), and those whose binding reads one (`reads`); `before`/`after` are the `let`'s text as written when there is one |
| `changed[]` | every element that changed: rooms, openings and walls as `diffPlans` classifies them (`moved`, `resized`, `rehosted`, `rethickened`, `relabeled`, `added`, `removed`); other kinds, and a door that slid along a wall that did not move, from their resolved position (`moved`, `resized`, `changed`) |
| `changed[].why` | the chain from the element back to what changed first: each step names the dependency it followed (`on`, `host`, `axis`, `param` (a name the element or its `place … at` reads), and `joins` for a re-hosted opening only: a room whose change moved the spaces it joins) and how that dependency changed. Where several dependencies changed, the chain takes the first, in that edge order and then by id in code-unit order, that leads to a root, else the first that changed: an order, not a judgement of which cause mattered most. `root` says how the chain ends: `let` (a binding's text changed), `edited` (that element's own statement changed), `axis`, or `unexplained` (no recorded dependency reaches a change) |
| `held[]` | elements that did not change although a dependency did (`because`): the "should it have followed?" signal. A relabel never makes a dependant held |
| `diagnostics` | `broke` (only after), `healed` (only before) and `unchanged_count`, matched by code, element and storey over the compile and lint diagnostics of both sides |

Every element is named as `describe()` names it; a wall `walls from rooms` derived is named by its
rooms (`the partition between "a" and "b"`), an `open between` opening by its clause, never by an
internal name. Chains stop at 32 steps (`truncated: true`) and never revisit a node.

For the widening drill (`docs/plans/plan-soundness/repro/widen-before.arch`, `let AW` 4000 → 4500):

```text
AW: 4000 → 4500
Lets (1):
  AW: 4000 → 4500
Changed (3):
  room a resized (20 m² → 22.5 m²; right edge +500 mm)
    why: reads AW (4000 → 4500)
  room b moved 500 mm right
    why: on a (resized) ← reads AW (4000 → 4500)
  door door_2 re-hosted: joins a and b → nothing
    why: joins a (resized) ← reads AW (4000 → 4500)
Held (0): none
Broke (3):
  W_BOUNDARY_NO_WALL on b: "Living" and "Bed" have no wall between them: …
  W_ROOM_DISCONNECTED on b: Room "Bed" has no door or opening — it can't be entered.
  W_ROOM_OUTSIDE_SHELL on b: Room "Bed" has 2 m² of its floor outside the building's walls, …
Healed (0): none
Unchanged diagnostics: 1
```

What it cannot tell you:

- **A wall written in numbers depends on nothing**, so it can never be `held`: in the drill the
  shell and the partition should have followed the rooms, and the report names what that broke
  (`W_ROOM_OUTSIDE_SHELL`, `W_BOUNDARY_NO_WALL`), not the walls. Derive walls from rooms
  (`walls from rooms`) and they follow instead.
- **Elements pair by id.** Under `--against`, a statement inserted ahead of elements with
  positional ids (`door_2`) shifts them, as in `diffPlans`.
- **The lowest storey's elements** are compared, as `describe()`'s top-level facts are;
  diagnostics cover every storey.
- **A bound name is one entry** however many places bind it: a component-local `let`, a loop
  variable and a top-level `let` of the same name are not told apart, and a name that reads a
  changed one counts as changed even when its value did not (PS4.7). A component parameter an
  element reads directly is the exception: it is resolved per `place` instance, so an argument
  reaches only its own instance's elements that read it.
- **`unexplained`** remains where a position is found by search rather than read from a name:
  a piece placed `flush` measures from the wall behind it, so a thicker wall moves it with no
  recorded dependency (6 of the 26 single-number overrides of the examples' top-level lets,
  all in `townhouse.arch`). An element of a `place` whose `at` was edited to a literal is
  `unexplained` too: its own statement did not change.
- **A wall changes only in its own geometry** (points, arcs, closure, thickness); a door widened
  in it changes the door, not the wall.
- **A diagnostic is keyed by the element whose statement contains it**; one raised on a different
  element after the change (a whole-plan figure such as `W_FLOOR_UNASSIGNED` attached to its
  nearest room) reads as one broke and one healed. A side that does not resolve keys its errors
  by no element.

## `lint` — architectural soundness

`archlang lint plan.arch --json` returns advisory `W_*` diagnostics, each with a byte
`span`, a `line`/`col`, and a `fix`. Warnings never block rendering — they flag
*habitability*, not *validity*. The rules, grouped by what they watch:

| Family | Example codes |
|--------|---------------|
| Room | `W_ROOM_TOO_SMALL`, `W_ROOM_DISCONNECTED`, `W_BEDROOM_NO_WINDOW`, `W_HABITABLE_NO_WINDOW`, `W_ROOM_MISSING_DEFINING`, `W_ROOM_OVERLAP`, `W_ROOM_NOT_EQUATOR_FACING` |
| Placement | `W_DOOR_OFF_WALL`, `W_WINDOW_OFF_WALL`, `W_OPENING_OFF_WALL` |
| Door / circulation | `W_DOOR_CLEARANCE`, `W_SWING_OBSTRUCTED`, `W_NO_ENTRANCE` |
| Reachability | `W_ROOM_UNREACHABLE`, `W_BATH_VIA_BEDROOM` |
| Wet rooms | `W_ROOM_NOT_ENCLOSED`, `W_ROOM_NO_FIXTURE` |
| Garage | `W_GARAGE_TOO_NARROW` |
| Furniture / fixtures | `W_FIXTURE_FLOATING`, `W_FIXTURE_BACK_TO_ROOM`, `W_FIXTURE_WRONG_ROOM`, `W_FURNITURE_OVERLAP`, `W_FURN_CLEARANCE` |
| Circulation quality | `W_ROOM_NO_CLEAR_PATH`, `W_PATH_TOO_NARROW`, `W_CIRCUITOUS_PATH` |
| Circulation and privacy | `W_ROOM_VIA_PRIVATE`, `W_WET_ROOM_DOOR`, `W_ENTRANCE_INTO_PRIVATE` |
| Enclosure | `W_BOUNDARY_NO_WALL`, `W_FLOOR_UNASSIGNED`, `W_ROOM_OUTSIDE_SHELL` |
| Annotation | `W_DIM_INSIDE`, `W_DIM_OVERLAP`, `W_DIM_TEXT_MISMATCH`, `W_OPENING_NOT_DIMENSIONED` |

Every code is documented — with cause, fix, and example — in the
[error catalog](error-codes.md), or run `archlang explain W_SWING_OBSTRUCTED`. (In human
mode each diagnostic already prints its catalogued `= fix:` line, so the lookup is
usually unnecessary.)

`W_BATH_VIA_BEDROOM` is about a storey's bathroom provision, not one room: it fires on
every bathroom or WC reachable only through a bedroom when **no** bathroom or WC on that
storey is reachable from the entrance without passing through one. An en-suite beside a
family bathroom — or just a WC — that is reached without crossing a bedroom (off the hall,
say) is the conventional case and is not flagged. The check runs per storey, so a WC on
the ground floor does not excuse a first floor whose only bathroom is an en-suite.

`W_ROOM_VIA_PRIVATE` is the general case. Take one bedroom, bathroom or WC out of the access
graph: any room that is then cut off from the entrance is reached only through it, and the
warning names the private rooms on that route in order and the room's access depth. An
en-suite, a WC behind a bathroom and a storage room are exempt. `W_WET_ROOM_DOOR` reads a
bathroom's or WC's connectors (no door, a door straight onto a kitchen or dining room, or two
doors that make it a passage), and `W_ENTRANCE_INTO_PRIVATE` fires when every door from
outside opens into a bedroom, bathroom or WC. All three read `uses` (authored, or from the label
vocabulary) and skip a room with no classified use. Their hints offer only doors on edges two
rooms really share, measured, and never suggest shrinking or deleting a room.

The enclosure rules compare the rooms with the walls. `W_BOUNDARY_NO_WALL` fires when two
rooms share an edge and more than a doorway's width of it (900 mm) has no wall, door, cased
opening or fixed counter on it; two rooms that are each kitchen, dining or living are an
open-plan pair and are exempt. `W_FLOOR_UNASSIGNED` fires when a closed region of floor the
walls enclose is less than 95 % covered by rooms (an `outdoor` surface, a `void` or a stair
also counts as cover), and names the rooms beside the empty floor. A walled pocket with no
door or window into it and no room on it, such as a duct, is not reported. A wall counts as
the boundary between two rooms when its body stands on their shared edge, not merely near
it. `W_ROOM_OUTSIDE_SHELL` fires when part of a room lies outside every wall, and only for a
room most of whose floor is inside walls: with no closed shell around it, it says nothing. All three measure the shapes themselves, so curved walls and circular rooms are
measured exactly.

Narrow a noisy report with `--code` or `--severity` — on `lint` and on `validate`:

```
archlang lint plan.arch --code W_ROOM_UNREACHABLE,W_NO_ENTRANCE --json   # only these codes
archlang validate plan.arch --severity error --json                      # only the blocking errors
```

> **A display filter never changes gating.** `--code` and `--severity` (like `describe`'s
> `--select` / `--room`) filter what is *shown*; `ok` and the exit code are always computed
> from the **unfiltered** diagnostic set, and a narrowed result marks itself with
> `filtered: true` and a `total_diagnostics` count. Reading less can never make a broken
> plan look sound.

### Coverage: what lint did not check

A clean lint is only as good as what the rules could see. `lint --json` appends a
`coverage` block after `diagnostics` that says which rule families ran, which skipped and
why, and which rooms no use-reading rule could judge. It is additive: the keys before it,
and the `diagnostics` array, are exactly what they would be without it, and a filter
(`--code`, `--severity`) narrows only the diagnostics. The block is absent when the plan has
errors, because no rule ran. In the library it is `lintCoverage(src)` (or
`lintWithCoverage(src)` for both at once); `lint()` itself returns only the diagnostics, and
`describe()` never reads any of it.

```json
"coverage": {
  "families": [
    { "family": "rooms", "status": "ran" },
    { "family": "orientation", "status": "skipped",
      "skipped": [{ "reason": "no-site", "why": "the plan declares no site" }] },
    { "family": "daylight", "status": "partial",
      "skipped": [{ "reason": "arc-window-unattributed",
                    "why": "a window on a curved wall is attributed to no room",
                    "rooms": ["Living"], "roomIds": ["r_living"], "level": 1 }] }
  ],
  "unclassifiedRooms": [{ "name": "Terrace", "id": "r_terrace", "level": 1 }]
}
```

Every family is listed once, in the order its first rule runs. `status` is `ran` (nothing
skipped), `skipped` (every rule of the family declined the whole plan, on every storey) or
`partial` (some rooms, or some of its rules). A skip names its rooms the way a message does,
by label, with the ids in `roomIds`; an id appears in the names only where a room has no
label, as in every lint message. The reasons:

| `reason` | Filed by | When |
|---|---|---|
| `no-uses` | room, reachability, privacy, daylight, contents and orientation checks | a room with no `uses` whose label classifies to no use |
| `no-site` | orientation | the plan declares no `site` and has a bedroom, living or dining room with a window, so no window has a compass facing |
| `single-storey` | storey matching | a `stair`, `elevator` or `escalator` on a plan with one storey |
| `arc-window-unattributed` | daylight | a room bounded by a curved wall edge whose window the shape attributes to no room (neither face probe finds a floor, and no bay opens into a room through the chord) |
| `non-rectangular-room` | room and furniture checks | a polygon room: the garage-width check declines a `uses garage` one, the fixture-orientation check (`W_FIXTURE_BACK_TO_ROOM`) any one, and under a residential-advisory profile `W_ROOM_TOO_NARROW` a polygon or circle room it would ask a width |
| `no-entrance` | reachability, circulation walk, privacy checks | a storey with rooms and no way in (`W_NO_ENTRANCE` still runs) |
| `balcony-only-entrance` | privacy checks | every door to the outside opens onto a balcony or terrace, which these rules do not count as a way in (the access graph and the walk do) |
| `unsupported-host-geometry` | door checks | a door on an angled or curved wall, which the doorway-landing and pocket-run checks do not measure |
| `no-kitchen-fixtures` | privacy checks | a bath or WC door onto a room that is a kitchen and also the living room, which holds no sink, hob, oven, fridge, worktop, island or dishwasher, so `W_WET_ROOM_DOOR` cannot tell whether the door opens onto the kitchen |
| `no-main-entrance` | circulation walk, privacy checks | a storey with more than one way in whose `access.mainEntrance` names no door (`tie`, `no-candidate`, `upper-storey`), so `W_PATH_TOO_NARROW`, `W_ROOM_VIA_PRIVATE` and `W_WET_ROOM_DOOR` judge a route from every exterior door |
| `non-dwelling` | daylight, privacy checks | the plan reads as non-residential: a room label with "Cafe", "Restaurant", "Retail", "Clinic", "Consulting", "Servery", "Staff room" or "Classroom"; or, on a plan with no bedroom and no living room, a room whose use is `office` or a label with "Lobby", "Reception", "Waiting", "Shop" or "Meeting" (a house's "Reception room" or "Entrance Lobby" stays a dwelling). `W_HABITABLE_NO_WINDOW` does not ask a kitchen for daylight there, and `W_WET_ROOM_DOOR` (all but a door onto a kitchen) and `W_ENTRANCE_INTO_PRIVATE` do not judge: they describe a home. `residential-basic` judges every plan as a dwelling and files none |
| `no-bed` | room checks | under a profile with a double-bedroom figure (`cn-`, `uk-residential-advisory`), a bedroom with no `bed` or `double_bed`: whether it is a single or a double is not known, so it is held to the single figure only |
| `no-dwelling` | room checks | under `uk-residential-advisory`, a multi-storey plan with double bedrooms: "one double bedroom of every home 2.75 m wide" needs to know which bedrooms share a home (declared dwellings are still to come) |

Two more reasons are reserved for families that do not exist yet: `no-brief` and
`no-operable-window-data`. In human mode `lint` prints one line on stderr
when anything was skipped, and nothing when nothing was:

```
  lint coverage: skipped orientation (the plan declares no site).
```

### Profiles

A **profile** is a named bundle of thresholds, applied with `--profile` (CLI) or
`lint(src, { profile })`. The names come from `LINT_PROFILES` (`src/lint.ts`):

| Profile | Thresholds |
|---------|-----------|
| *(default, no profile)* | doors ≥ 700 mm, rooms ≥ 4 m², walk clear ≥ 700 mm, detour ≤ 3.0×, no swing-clearance buffer; the home-only checks skip a plan that reads as non-residential (`non-dwelling`) |
| `residential-basic` | the default's thresholds, with every plan judged as a dwelling |
| `accessibility-advisory` | doors ≥ 850 mm, rooms ≥ 5 m², walk clear ≥ 900 mm, detour ≤ 3.0×, 150 mm swing clearance |
| `cn-residential-advisory` | the default's, plus room areas and passage widths read from China's residential design code (table below) |
| `uk-residential-advisory` | the default's, plus bedroom areas and widths from England's space standard and hall widths (table below) |
| `us-residential-advisory` | the default's, plus habitable-room areas and widths and hallway widths from the US model residential code (table below) |

The three residential-advisory profiles add room sizes by use. Each number is read from the
source it cites, marked [V] (read in the source) or [S] (second-hand: the primary text was not
reachable); nothing remembered ships:

| Check | `cn-residential-advisory` | `uk-residential-advisory` | `us-residential-advisory` |
|---|---|---|---|
| Bedroom area (`W_ROOM_TOO_SMALL`) | single 5 m², double 9 m² (GB 50096-2011 5.2.1 [V]) | single 7.5 m², double 11.5 m² (NDSS 10(c), 10(d) [V]) | 6.5 m² (IRC R304.1 [S]) |
| Living / dining area | living 10 m² (GB 5.2.2 [V]) | — | 6.5 m² each (IRC R304.1 [S]) |
| Kitchen area | 4.0 m² (GB 5.3.1 [V]) | — | excepted: the default 4 m² |
| Room width (`W_ROOM_TOO_NARROW`) | — | bedroom 2150 mm (NDSS 10(c) [V]); double 2550 mm, one double per home 2750 mm (NDSS 10(e) [V]) | living, dining, bedroom 2134 mm (IRC R304.2 [S]) |
| Passage width (`W_ROOM_TOO_NARROW`) | entry passage 1200 mm (宜, should); to a bedroom or living room 1000 mm; to a kitchen, bath, WC or store 900 mm (GB 5.7.1 [V]) | hall, circulation, entry 900 mm (Approved Document M4(2) [S]) | hall, circulation, entry 914 mm (IRC R311.6 [S]) |
| Daylight target (taste R7) | 1/7 (GB 7.1.5 [V]) | 8 %, the generic target (no English figure read) | 8 % (IRC R303.1 [S]) |

How they measure:

- **Areas** are read as `W_ROOM_TOO_SMALL` reads every floor, on the room as drawn (to the wall
  centrelines when it is drawn so). The clauses give net floor area, so the check is lenient by
  half of each wall and never warns a room that meets the figure.
- **Widths** are clear: a rectangular room's short side between the inner faces of the walls
  along it (the drawn edge where no wall backs it). A polygon or circle room is not measured
  (`non-rectangular-room`). A passage (a room used as hall, circulation or entry) is held to the
  highest width the rooms it opens onto ask, and to the entry width when a door from outside
  opens into it or it is used as `entry`. This is the passage's own width, not the walk's
  bottleneck (`W_PATH_TOO_NARROW`), which runs through doors.
- **Single or double** comes from the bedroom's bed, never its label: a `double_bed`, a `bed`
  wider than 1200 mm, or two beds (a twin room, held to the double's figures) make a double. A
  bedroom with no bed is held to the single figure and files `no-bed`.
- Not yet: WC side and front clearances (IRC P2705.1, R307.1) land with the WC-clearance rule,
  and the bedroom escape window (IRC R310; Approved Document B 2.10) with the escape-window
  checks. Their numbers are kept, unused, with their sources (`DEFERRED_PROFILE_NUMBERS` in
  `src/lint/ruleset.ts`; noted 2026-10-24).

```
archlang lint plan.arch                                  # the default ruleset
archlang lint plan.arch --profile residential-basic     # the same, judged as a dwelling
archlang lint plan.arch --profile accessibility-advisory
archlang lint plan.arch --profile cn-residential-advisory  # room sizes and passage widths as advice
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

## Taste — a separate score that never gates

`lint` reports plain defects. Whether a plan is *good* — the living room at the heart, the
bedrooms deeper than the public rooms, enough daylight — depends on the culture and the brief,
so it is not a lint rule. It is a separate, sourced score:

```
archlang score plan.arch --taste generic          # one summary line, one line per criterion
archlang score plan.arch --taste generic --json   # the report as data
```

`taste(source, { profile })` returns the same report from the library. **Taste never gates.**
A measurement exits `0` whatever the score; only a plan with compile errors (exit `2`) or bad
usage (exit `3`: an unknown profile, or `--taste` together with `--brief`) fails. Neither
`describe()` nor `lint()` reads it, and it draws nothing. The decision is
[ADR 0032](adr/0032-taste-separate-score.md).

Each criterion reads the facts `describe` reports (room uses, access depths, windows, net
areas) and, where `describe` rounds, the exact room rings, door positions and wall
centrelines; each cites its source. A ramp `a → b` scores 0 at `a` and 1 at `b`, linear between.
Marks: [V] read in the source, [S] second-hand, [prior] a ResPlan dataset prior used only as a
ramp anchor.

| Criterion | Subscore | Reads | Ramp | Source |
|---|---|---|---|---|
| R3 intimacy gradient | zoning | the share of (living/dining/kitchen, bedroom) pairs where the public room is no deeper from the entrance | 0 → 1 | Alexander, *A Pattern Language*, 127 [V] |
| R6 furniture–use match | furnishing | the share of plumbing fixtures, kitchen fittings and beds standing in a room of their use (a counter or worktop is not judged; homes only) | 0 → 1 | the fixture catalogue's zones and a bedroom's defining piece |
| R7 daylight ratio | light | glazing (width × (head − sill)) over net floor area, per habitable room; target 8 % (`generic`, `uk-` and `us-residential-advisory`), 1/7 (`cn-residential-advisory`) | 0 → the target | IRC R303.1 [S]; GB 50096-2011 7.1.5 [V] for `cn` |
| R9 proportion | geometry | per habitable, bath or WC room, long ÷ short side of the minimum-area rectangle enclosing its floor (from the shape, never the bounding box; a circle reads 1) | habitable 3 → 2, bath or WC 3.5 → 2.5 | Palladio, *I Quattro Libri* I.xxi (preferred room shapes, the longest 2:1), as read in Mitrović, "Andrea Palladio's Villa Cornaro in Piombino Dese", *Nexus Network Journal* 6(2), 2004 [S]; ResPlan aspect p95 [prior] |
| R11 kitchen–dining link | zoning | the share of kitchens with a living or dining use, or a door or opening to such a room (homes only) | 0 → 1 | Alexander 139 [V]; ResPlan 99 % [prior] |
| R12 dwelling aspect | light | the number of compass sides the habitable windows face: none 0, one 0.5 (0 if it is the pole side of a `site`), two or more 1 (homes only) | — | London Plan D6, LPG C4.1 [S] |
| R14 common area at the heart | circulation | the best rank, by total depth on the access graph, of a living or dining room | rank n → ⌈n/3⌉ | Alexander 129; Hanson 1998 |
| R15 night-zone contiguity | zoning | the share of bedroom pairs (joined without going outside) that open onto a common hall or corridor | 0 → 1 | 动静分区; Alexander 136 [V] |
| R16 corner doors | circulation | per door into a room under 15 m² (not a hall), whether the nearer jamb is within max(wall thickness, 600 mm) of the room's corner; rectilinear rooms only | 0 → 1 | Alexander 196 [V]; ResPlan jamb-to-corner p50 [prior] |
| R17 axis economy | geometry | distinct x and y lines of room and wall edges (lines within 100 mm are one) per room that is not circulation; four rooms or more | 2.5 → 1.5 | Brandão 2008 [S] |
| R18 shape regularity | geometry | per bedroom, bath or kitchen, floor area ÷ the area of its minimum enclosing rectangle (a circle is skipped) | 0.75 → 0.9 | Alexander 191 [V]; ResPlan rectangularity p10 [prior] |

A criterion that cannot judge (no entrance, nothing to compare, an upper storey, a building that
reads as non-residential for R6, R11 and R12) says so with
`assessable: false` and a `reason`, and is left out of the total, never counted as a pass;
`coverage.weight` says how much of the profile was judged. A criterion below 1 carries an
`A_*` advice code. Rooms are named by label in `message`; ids appear only in
`evidence[].ids`. Scores are computed in integers and printed exactly.

**The validity cap.** While default-profile `lint` reports a warning from a *validity* rule,
the total is capped at 0.5 (`capped: true`, the value before the cap in `uncapped`), so a plan
with a defect never scores above 0.5. Every lint rule declares its layer: the annotation rules
(`W_DIM_INSIDE`, `W_DIM_OVERLAP`, `W_OPENING_NOT_DIMENSIONED`) are *drafting* and never cap;
they are listed under `validity.drafting`. Compile-channel warnings such as `W_ROOM_OVERLAP`
never cap.

A hall → bath → bedroom → living chain, abridged to its first criterion:

```json
{
  "profile": "generic",
  "ok": true,
  "score": 0.5,
  "uncapped": 0.6875,
  "capped": true,
  "validity": { "pass": false, "warnings": 6,
                "codes": ["W_ROOM_NO_FIXTURE", "W_CIRCUITOUS_PATH", "W_ROOM_VIA_PRIVATE"],
                "drafting": { "warnings": 0, "codes": [] } },
  "advisory": [],
  "coverage": { "rooms": 5, "classified": 5, "unclassified": [],
                "weight": { "assessable": 10, "total": 11 },
                "skipped": [{ "criterion": "R6", "reason": "too-few-items" }] },
  "subscores": { "circulation": 0.3334, "zoning": 0.5, "light": 1,
                 "geometry": 0.9167, "furnishing": null, "facade": null },
  "criteria": [
    { "id": "R3", "name": "intimacy-gradient", "subscore": "zoning", "kind": "taste",
      "weight": 1, "assessable": true, "measured": { "num": 1, "den": 2 }, "score": 0.5,
      "source": "Alexander, A Pattern Language, 127 (intimacy gradient)", "verified": "V",
      "advice": "A_INTIMACY_INVERSION",
      "message": "\"Kitchen / Living\" is 4 doors in from the entrance and \"Master Bedroom\" 3: 1 of 2 living-to-bedroom pairs puts the public room deeper than the bedroom.",
      "evidence": [{ "ids": ["r_living", "r_master"], "fact": "depth 4 > depth 3" }] }
  ]
}
```

### Deviations from design §3 (PS5.1b)

Each was ruled by the plan-soundness lead on the measured reason given.

- **R6 and R11 skip a non-residential plan** (`non-dwelling`), read plan-wide by lint's
  `dwellingReading`. Measured: on `clinic` R6 read 10 of 12 consulting-room basins as bath
  fittings out of place, and on `corner-cafe` R11 read the café kitchen, which serves seating
  that no use names, as unlinked.
- **R6 does not judge a `counter` or `worktop`.** The catalogue zones them as kitchen only so a
  kitchen's worktop counts as its fixture; measured, R6 read the laundry bench on `bungalow`,
  the workshop benches on `materials` and a desk written as a counter on `hexagon-pavilion` as
  kitchen fittings in the wrong room.
- **R16 does not judge the hall or corridor side of a door**: a corridor's doors cannot all sit
  at corners (measured: `bungalow`'s hall side read a 4,100 mm nib).
- **R17 needs at least four classified rooms.** `n` rectangles need at least `a + b + 2` axes
  for an `a × b` grid, so one room reaches 4 axes per room at best, two 2.5 and three 2: a
  3-room plan would be capped at 0.5 whatever its order, and smaller plans at 0, so the
  criterion would score the room count. The design's line "a 3-room strip reads 6/3" is replaced
  by a four-room grid.

**Gaps.** A use-scoped R6 and R11 (card PS5.5, "use-scoped R6/R11") would judge a
non-residential plan's rooms by their own uses instead of skipping the plan, and would judge a
counter that stands in a bathroom or a bedroom, which goes unjudged today. Relabelling a small
room as circulation removes its doors from R16 (the coverage-weight caveat of design §6 Q9
applies: `uses` is the author's claim).

**Calibration notes for PS5.2.** The separation ledger is empty, but one order is the cap's,
not a criterion's: `openings-ignore-walls/door-window-overlap-chamfer`'s fixed twin out-scores
its case (0.7303 > 0.5) because R9 lifts the twin's geometry subscore, while R7 still prefers the
case's window (0.7677 against the twin's 0.4606).

Read taste after `lint` is clean: it is advice for a sound plan, not a substitute for fixing
one.

**Profiles.** `generic` and the three residential-advisory profiles (`cn-`, `uk-`,
`us-residential-advisory`, the same names `lint --profile` takes). A profile sets the criteria's
targets (today R7's, in the criteria table above) and, for a residential-advisory one, lists the
warnings its lint profile raises that default `lint` does not under `advisory` as
`{ code, warnings }`. They are advice from an advisory code and never cap the score: only
default-profile validity warnings do. `archlang score plan.arch --taste cn-residential-advisory`
prints them on one `advisory … (does not cap)` line; `lint --profile` shows each.

## The agent loop

Together, `describe` and `lint` close the author → render → **verify** loop for an AI
agent with no eyes on the drawing — see
[Use ArchLang from an agent](https://archlang.uk/agents):

1. `archlang compile` — render and get errors as data.
2. `archlang describe --json` — confirm the room count, labels, areas, and access match
   the brief.
3. `archlang lint --json` — clear the habitability warnings (each carries a `fix`).

### `next`: the one thing to fix first

`validate --json` ends with a `next` key: the one item to fix before anything else, or `null`
when nothing is left. It is chosen by a fixed precedence, and within a tier the first in
emission order wins:

| Tier | What | Present when |
|---|---|---|
| `error` | a compile error | always |
| `warning` | a compile-channel warning (`W_DOOR_OFF_WALL`, `W_ROOM_OVERLAP`, a deprecation) | always |
| `validity` | a default `lint()` warning from a validity-layer rule | always |
| `drafting` | a default `lint()` warning from a drafting-layer rule (the annotation family) | always |
| `intent` | a failing gating assertion, then a `--graph` mismatch, then an advisory assertion | `--intent`, `--graph` |
| `profile` | a warning only the named lint profile raises | `--profile <name>` |
| `taste` | the lowest-scoring assessable taste criterion below 1 | `--taste <profile>` |

```
archlang validate plan.arch --json --taste generic
```

```json
"next": {
  "tier": "validity",
  "code": "W_ROOM_VIA_PRIVATE",
  "message": "\"Bedroom 4\" is reached only through \"Bedroom 3\" (access depth 3). A route through a bedroom takes away that room's privacy (…).",
  "span": [735, 810],
  "hint": "\"Living Room\" (r_living) shares a straight 3000 mm of edge with \"Bedroom 4\" (r_bed4), on centrelines: a door at least 900 mm wide there, with 100 mm of wall left at each jamb, reaches it at depth 2 without passing a bedroom, bathroom or WC."
}
```

(`test/defect-corpus/circulation-privacy/bedroom-via-bedroom.arch`; the message is shortened.)

`hint` is the diagnostic's first hint, else its catalogued `fix`; for an intent violation it is
the correction prompt `--feedback` prints; for taste it names the criterion, its score and its
source. `code` is the taste criterion's `A_*` advice code in the taste tier, and `null` for a
`--graph` mismatch. `level` and `file` appear when the diagnostic carries them.

Compile-channel warnings come right after errors because they are upstream causes: a door that
did not land on its wall (`W_DOOR_OFF_WALL`) reads to lint as a room with no door, and the fix
is the door, not the extra door lint would suggest. The cosmetic ones (fonts, hatch scale,
unknown keys, deprecations) share the tier; they are quick to clear. With `--profile`, a lint
warning is quoted as the profile run words it, the text the diagnostics show.

`next` adds a key and changes nothing else: every byte before it, `ok` and the exit code are
what they were, and a display filter (`--code`, `--severity`) never moves it. `--profile`
reports the diagnostics `lint --profile` reports (so `--strict` gates on them); `--taste` only
feeds the last tier and never gates. In human mode one `next (<tier>):` line goes to stderr,
followed by its `= help:` line; `--quiet` drops it. In the library it is
`nextDiagnostic({ diagnostics, lint, intent?, graph?, profileLint?, taste? })`, pure: it reads
the results it is handed and measures nothing itself.

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
  "svg" })` / `--error-svg` (on `archlang compile`, `archlang preview`, and `archlang md`) instead renders
  a deterministic, self-describing SVG card — severity, code, `line:col`, message, and the
  catalogued fix — so the failure is visible, not just returned. Errors, diagnostics, and exit
  codes are unchanged; without the opt-in the failing plan still yields no bytes. The renderer
  is exported as `renderErrorSvg`. See
  [ADR 0009](adr/0009-ai-first-context-and-distribution.md).

For a full cold start, `archlang context` (and the shipped `llms-full.txt`) bundle this loop —
the language spec, the `SKILL.md` workflow, the CLI reference, and the whole error catalog — into
one system-prompt-ready document.
