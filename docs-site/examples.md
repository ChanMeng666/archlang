<script setup>
import { EXAMPLES } from "./.vitepress/theme/examples-data.js";
</script>

# Examples

Every complete plan in the repository's
[`examples/`](https://github.com/chanmeng666/archlang/tree/main/examples) directory,
**live and editable** — edit the source on the left and the SVG on the right recompiles
instantly (client-side, deterministic, no server). Hit **Open in Playground** to keep
going with the full editor.

They are ordered as a tour rather than an inventory: a plan you can read in one screen
first, then houses, then the large public buildings, then the drawings that exist to
prove one language feature. Every figure quoted below comes from
[`arch describe --json`](/analysis) on the file itself, so the prose and the drawing
cannot disagree.

Two things worth knowing before you start. A plan written as
[`level` blocks](/reference#levels-a-multi-storey-building-v1-21) compiles to **one
drawing per storey**, and a live widget shows **page 1** — the lowest storey, which is
what `compile().svg` returns; the whole set is in `compile().pages`, and
`arch describe --level 2 --json` reads a specific floor. And the playground's **theme
selector restyles any plan** — blueprint, dark, mono, presentation — without touching a
line of its source, because a theme changes inks and hatches, never geometry.

## The whole language on one sheet

### Hillside Villa

The showpiece: a two-storey villa with an attached garage, drawn on one A2 sheet at
1:50. The widget below shows **page 1 — the ground floor**, **11 rooms, 196.54 m²**
(`arch describe --json`); the upper floor adds nine more rooms over 140.76 m²
(`arch describe --level 2 --json`).

It is the plan to read when you want to see how the surfaces above fit together rather
than in isolation: `site { street north }` names the facades a plot orientation lint
rule can reason about; a `room … polygon` chamfers a reading nook off the study and an
L-shaped master suite wraps its own ensuite; an `arc` wall edge bows a bay window off the
living room; every door kind ships somewhere a builder would actually put it — hinged,
sliding, pocket, bifold, barn; a `stair` carries the same id on both `level` blocks, so
it is one shaft, not two symbols that happen to line up; a `void` opens a double-height
gap over the living room; `roof overhang` draws the eaves on the upper storey; and a
`component` authored once — `ensuite() { … }` — is `place`d twice with `mirror x`, so a
pair of bathrooms share one definition and face opposite ways.

`arch lint` still raises three warnings on it, on purpose: a bathroom reachable only
through a bedroom, and two bedrooms whose windows don't face the equator side. Every
room is reachable and every doorway clears — the warnings are left in and named in the
source as the honest cost of a real site, not something the plan was tuned to hide.

<ArchLive :src="EXAMPLES['hillside-villa']" :rows="20" />

## Start here

### One room

The smallest complete ArchLang plan, and the one the [guide](/guide) opens with: a
200 mm shell, one room that says what it is for, a door and a window, and a single
overall dimension chain. **1 room, 20 m²**, fourteen lines including its comment.

Neither opening carries a coordinate. `door … on shell at 60%` walks 60 % of the way
around the shell wall's own run and puts the door there, so the door cannot be reported
off-wall and cannot drift when the room resizes. Change `5000x4000` to something else and
the wall, both openings and the dimension text all follow.

<ArchLive :src="EXAMPLES['one-room']" :rows="18" />

### Laneway House

The signature example: a one-bedroom laneway cottage of **3 rooms and 48.75 m²**
(Living / Kitchen 27.3, Bedroom 13.2, Bath 8.25) with **4 doors and 4 windows**, on a
7.5 × 6.5 m footprint. It is the plan the home page's hero types out.

Nothing in it is positioned by hand. Every opening is pinned to a run distance along a
named wall (`on w_lane at 2100`), every fixture resolves against a room or the wall behind
it (`in r_live centered`, `against wall w_west offset 400`), and the bath/bedroom pair is
laid out by a [`strip`](/reference#strip-v1-13) that assigns each room its depth and
derives the rest. `site { street north }`
([site and orientation](/reference#site-and-orientation)) names the two facades the plan
turns on — the front door faces the lane, the glazing faces the garden — and it draws
nothing at all; it only gives those directions names an intent or a lint rule can assert
against. Two of the four doors are not hinged: a **sliding** garden door, and a
**pocket** door to the bath whose `slide right` aims the panel down the solid length of
the hall partition rather than at the 500 mm that would trip `W_POCKET_RUN`.

<ArchLive :src="EXAMPLES['laneway-house']" :rows="17" />

### Garden Loft

**3 rooms, 35 m²**, at `scale 1:50` — deliberately the smallest plan still worth
*describing*. It is the plan the home page reads its own room schedule from, which is the
constraint that shaped it: three rooms, so the derived table fits in a band beside the
drawing, but a real fit-out behind each one — a kitchen run with a wall behind it, a bath
with three fixtures, a door into every room.

There is no `paper` block here, so `scale 1:50` is *annotation*: the title block says 1:50
and the SVG scales to whatever box it is dropped into. That is what a web page wants; a
building issued to a builder wants the [sheet](/reference#paper-and-scale-the-sheet)
instead, which several examples below declare.

<ArchLive :src="EXAMPLES['garden-loft']" :rows="16" />

### Tiny House

A 7.2 × 3.0 m micro-home — **2 rooms, 19.6 m², 3 doors, 5 windows** — and the example for
the three language forms that are about *fit* rather than shape.

The wet room is 1.55 m wide, so a hinged leaf swinging in fouls the WC and swinging out
sweeps the only walkway in the house; it gets a **barn** door instead, which sweeps
nothing at all (`doorSwing()` returns `null` for every non-hinged
[kind](/reference#door-kinds-v1-25), so `W_SWING_OBSTRUCTED` cannot even apply) and parks
on the wall it came from. The wardrobe recess — 1.9 × 0.65 m, far under the 4 m² of floor
`lint` expects of a room, so it is deliberately *not* declared as one — closes with a
**bifold**: two leaves, each half of the 1600 opening, folding out of the way instead of
swinging 800 mm into a 1.85 m galley. That 1.85 m is not typed anywhere: `dim clear`
pulls each endpoint onto the inner *face* of the wall the measurement runs into, so the
number on the drawing is the built clear width, derived. `open 0.6` on the barn door is
drawing-only — nothing measured reads it — and is written because a leaf drawn shut is
indistinguishable from a hinged one on paper.

<ArchLive :src="EXAMPLES['tiny-house']" :rows="30" />

### Studio (1BR)

The long-standing flagship: **4 rooms, 42 m², 3 doors, 3 windows**, `scale 1:50`. A tour
of rooms tagged with **`uses`**, a cased [`opening`](/reference#opening-v1-3) linking the
living space to the hall, real [fixture symbols](/furniture) (sink, counter, stove,
fridge, shower, basin, WC), and doors whose swings stay clear of the furniture. It is
**lint-clean** under the default profile and import-free — a single file with no `import`
and no World seam — which is why the test suite uses it as the plan that must always
compile from nothing. Run `arch describe` / `arch lint` on it to see the
[analysis](/analysis) layer in action.

<ArchLive :src="EXAMPLES['studio']" :rows="24" />

## Homes

### Two-bedroom flat

**5 rooms, 80 m², 3 doors, 4 windows** on a 10 × 8 m footprint at `scale 1:100` — a
larger plan with a central corridor and several openings, placed absolutely at a real
apartment's scale, with `north` reoriented.

<ArchLive :src="EXAMPLES['two-bed']" :rows="15" />

### Attached (placement sugar)

A one-bedroom flat — **2 rooms, 28 m²** — with **no hand-computed coordinates** for its
openings or furniture. It exercises the placement sugar together: a
[`strip`](/reference#strip-v1-13) laying rooms out end to end, doors and windows attached
to a wall by position (`on <wall> at <pos>`, so they can never be reported "off wall"), a
door that opens toward a named room (`swing into`), and furniture anchored inside a room
(`in <room> anchor … inset …`).

<ArchLive :src="EXAMPLES['attached']" :rows="13" />

### Furnished Flat (the drawn symbol catalogue)

**7 rooms, 90.7 m², 6 doors, 6 windows** on an 8.4 × 10.8 m footprint — and
**twenty-six of the thirty-two catalogued furniture kinds**, which is what it is here for.
Every other example draws a fixture or two in passing; this one exercises all five symbol
domains at once: a fitted kitchen run with an island and a dashed
[overhead cabinet](/furniture#how-a-symbol-is-drawn), a plumbed bathroom, two furnished
bedrooms, a lounge and dining zone, and a utility room with a washer beside a dryer (the
same box, told apart by the chords across its drum).

Two things to read in the source rather than the drawing. **Not one piece carries a
`label`** — a drawn symbol ignores it, so the only text here comes from the rooms. And
**most carry no `size`** either: `against wall <id> … in <room>` takes the
[catalogued footprint](/furniture#the-symbol-catalogue) and derives the rotation from the
wall, so the whole kitchen, bathroom and both beds are written without a hand-computed
number. `offset` is where a piece's **centre** lands along the wall run, which is why a
fitted run reads as a sequence of centres rather than corners. `arch validate --strict`
is clean.

<ArchLive :src="EXAMPLES['furnished-flat']" :rows="30" />

### Suburban Bungalow (orientation, and doors that are not hinged)

A single-storey house — **8 rooms, 102 m², 6 doors, 7 windows** at `scale 1:100` — on a
plot that fronts the street on the **south**, in the southern hemisphere, and the whole
layout follows from that one declared fact. `site { street south hemisphere south }`
([site and orientation](/reference#site-and-orientation)) draws nothing; it names five
directions on `arch describe --json --select site` — `street` (S), `back` (N),
`equator_side` (N), `sunrise_side` (E), `sunset_side` (W). Here `back` and `equator_side`
are the *same* side, which is why the house turns away from the road: the living room and
both bedrooms take the north facade, and the service band — entry, hall, bath, laundry,
kitchen — is stacked along the street. Delete Bedroom 2's north window and `arch lint`
says so, through the one advisory rule that reads a site,
`W_ROOM_NOT_EQUATOR_FACING`. These are **drafting heuristics for an aspect, not a daylight
measurement**: there is no sun model, no latitude and no date anywhere in ArchLang.

The other half is the [door kinds](/reference#door-kinds-v1-25). Three of the six doors
are not hinged, each where a builder would actually put one: a **sliding** garden door
onto the deck, a **pocket** door to the bath so no leaf lands in a 1500 mm corridor, and a
**bifold** to the laundry. `slide right` on the pocket is load-bearing, not cosmetic — it
aims the panel at the 2200 mm of solid wall between its jamb and the laundry door, where
`slide left` would give it 500 mm against the 850 mm it needs and raise `W_POCKET_RUN`. A
non-hinged leaf sweeps nothing, so only the two bedroom doors carry a swing arc, and
`describe().doors[].kind` appears on exactly the three that are not the default.

<ArchLive :src="EXAMPLES['bungalow']" :rows="30" />

### Courtyard House

A 16 × 11.5 m single-storey house whose rooms ring an open middle — **11 rooms, 163 m²,
10 doors, 15 windows** at `scale 1:100`.

The first thing to understand about the courtyard is that **it is not a room**. Nothing is
declared inside it: it is the hole the building wraps around, open to the sky, and calling
it a `room` would put 21 m² of weather into the floor schedule. It is enclosed by a single
three-segment partition, and everything that reads the plan — the schedule,
`describe().totals`, the circulation flood-fill — simply sees no floor there. The courtyard
is also the shape that breaks the naive way of answering *which way does this window look?*
The window on the courtyard's west wall has the gallery's floor to its west and open air to
its east, so it looks **east**, not west; ArchLang answers by probing one wall thickness off
each face of the window's own host segment and taking the side no room occupies, which is
exact here and on a sloped facade alike. Read it back with
`arch describe --json --select windows`.

The wings are [`zone`s](/reference#zones-wings-and-departments-v1-22) — living 67.75 m²
over 4 rooms, private 65.5 m² over 4, service 29.75 m² over 3. A zone has **zero
geometry**: delete the wrappers and the drawing is byte-identical. Membership is declared,
never inferred from where a room happens to sit, which is why the schedule can carry a
subtotal per wing that no amount of looking at the drawing could have derived. The gallery
is one [polygon room](/reference#polygonal-rooms-v1-23) — a U wrapping three sides of the
courtyard, so the schedule lists one corridor rather than three — and because a U's
centroid falls outside it, its name is pinned by hand in the south arm.

<ArchLive :src="EXAMPLES['courtyard-house']" :rows="30" />

### Townhouse (three storeys)

A 5.5 × 11 m terrace house written as three
[`level` blocks](/reference#levels-a-multi-storey-building-v1-21), `paper A3 portrait` at
`scale 1:50`. Each storey is **4 rooms and 55.64 m²** and becomes its own page — ground
(Hall, Living, Cloakroom, Kitchen/Dining), first (Landing, Bedroom 1, Bathroom, Bedroom 2),
second (Landing, Study, Shower room, Main bedroom). `arch compile` writes
`townhouse.L1.svg`, `townhouse.L2.svg` and `townhouse.L3.svg`; the widget below shows page
1. Everything outside the blocks — `units`, `grid`, `paper`, `scale`, `dims auto` — is
stated once, because one building is issued on one sheet at one scale.

**The stair is one object written three times.** Ids are unique *within* a level, so the
same `id=st` on all three storeys is not a clash — it is the declaration that these are one
shaft, and it is what makes the upper floors legal: they have no front door of their own,
and `lint` still reads the first-floor landing as reached from outside because
[`describe().vertical`](/reference#vertical-circulation-stair-elevator-escalator-v1-21)
connects it to the storey below. Change one storey's id and you get `W_STAIR_UNMATCHED`
rather than a silently disconnected floor. `dir` is not decoration either: the flight runs
along its footprint's long axis and `dir up` is entered at that axis's larger-coordinate
end, which is also what the navigation grid reads — a stair obstructs circulation
everywhere except its entry edge, and that is why the ground-floor flight stops 1.15 m
short of the back wall. One flight-length further south, the only route from the front door
to the kitchen measured 300 mm on the nav grid against a 700 minimum, and `lint` refused the
plan with `W_PATH_TOO_NARROW`.

<ArchLive :src="EXAMPLES['townhouse']" :rows="30" />

### Two-storey house

A compact house written as two
[`level` blocks](/reference#levels-a-multi-storey-building-v1-21) — **3 rooms and 56 m² on
the ground floor**, `paper A3` at `scale 1:50`. It compiles to two sheets
(`two-storey.L1.svg`, `two-storey.L2.svg`), each with its own dimension chains and a title
block stamped `LEVEL 1 — Ground floor` / `LEVEL 2 — First floor`. The settings and the
`let`s sit *outside* the levels and apply to both: one building, one sheet spec, one scale.
It is the smaller sibling of the townhouse above — the two-page version of the same idea,
without the stack of wet rooms.

<ArchLive :src="EXAMPLES['two-storey']" :rows="26" />

## Public buildings

### Museum (a real sheet, at a real scale)

A ~100 × 60 m single-level museum — **14 rooms, 6000 m², 7 doors, 9 windows** — and the
large-building flagship. Everything above is a dwelling, where sizing every annotation as
a fraction of the drawing happens to look right; at 100 m it does not, and room labels come
out metres tall. So this plan declares a **sheet**:
[`paper A1 landscape`](/reference#paper-and-scale-the-sheet) +
[`scale 1:200`](/reference#paper-and-scale-the-sheet), which makes every annotation a fixed
size **on that sheet** — 3.5 mm room labels and 0.5 mm wall lines whatever the building
measures. It also drives `dims auto all` (the GB/T three-chain exterior dimensioning), a
column grid written with `for`, and fixture rows placed by `against wall <id> offset …` so
no coordinate is hand-computed.

<ArchLive :src="EXAMPLES['museum']" :rows="30" />

### Harbour Aquarium (curves)

A 60 × 40 m public aquarium — **8 rooms, 2061.06 m², 3 doors, 6 windows**, A2 at 1:200 —
and the [curved-geometry](/reference#curved-walls-arc-edges-v1-24) flagship. Everything
above is rectilinear; an aquarium is the building type that is not. Its centrepiece is a
cylindrical tank you walk around, written as a
[circular room](/reference#circular-rooms-v1-24) (`room circle at (cx,cy) radius R`, an
exact 201.06 m² = πR²) inside a drum wall made of two `arc` edges, and its public frontage
turns the south-east corner as a quarter circle of R12000 instead of mitring it.

Two things to read off the drawing. The curved faces are **true arcs** — SVG `A` commands,
native DXF `ARC` entities — so the rotunda never looks faceted however far you zoom in. And
because a linear dimension chain cannot describe an arc,
[`dims auto` dimensions the round things](/reference#dimensioning-a-curve-v1-24) the way
GB/T 50104 does: an `R` leader per distinct arc and a `φ` call-out across the circular room,
while the three exterior chains stay on the straight facades. Both rotunda doors sit **on**
the curve — `on rotunda at 25%` walks the wall by run length, so an arc contributes its arc
length rather than its chord — and their leaves swing off the tangent at the doorway.

<ArchLive :src="EXAMPLES['aquarium']" :rows="30" />

### Reading Room Library (sheet tables)

A 50 × 32 m public library around a circular reading room — **14 rooms, 1545.06 m², 8 doors,
16 windows**, `paper A2 landscape` at `scale 1:200`, split into three
[zones](/reference#zones-wings-and-departments-v1-22): public (9 rooms, 948.06 m²), stacks
(2 rooms, 374.5 m²) and staff (3 rooms, 222.5 m²).

The reading room is a drum inscribed in the 16 × 16 m central bay — a
[`room circle`](/reference#circular-rooms-v1-24) of exactly 201.06 m² inside a wall of
`arc` edges — so it is tangent to all four bay walls and every tangent point is a
threshold; the four corner spandrels it leaves belong to no room and carry no schedule row.
The circle is written as **eight** arcs rather than the two semicircles the shape needs,
deliberately: the analysis grid behind `describe --json`'s `circulation` rasterises a wall
between its *vertices*, so two semicircles lay a phantom chord straight across the room and
report the walk to it at five times its true length. Eight keeps every chord inside the
face it stands for, and the drawing is identical either way — every face is a true arc, at
any zoom.

The sheet is the other half. `schedule rooms` and `legend` fill the margin and are **fully
derived**, nothing to configure: the legend lists one row per wall hatch material actually
used and one per placed fixture category that has a plan symbol, and the schedule's rows and
total are the same numbers `arch describe --json` reports. At the foot of the file,
`dim radius <wallId> segment <n>` and `dim diameter <roomId>` take both geometry and text
from the element they name, so R8000 and the centre are never retyped.

<ArchLive :src="EXAMPLES['library']" :rows="30" />

### Transit Hall

A 90 × 40 m metro concourse — **12 rooms, 3600 m², 7 doors, 19 windows**, A2 at 1:200 — and
the big-public-building example. One fact organises the whole plan: a transit hall is two
buildings that share a roof. The unpaid side is street, and anyone may stand in it; the paid
side is platform, and the only way across is the gate line. So the drawing is a single
300 mm partition running the full 90 m width, with nine `opening`s punched in it by a `for`
loop — eight 800 mm gates and one 1200 mm wide aisle. Nothing else joins the two halves.

That split is [declared](/reference#zones-wings-and-departments-v1-22), never inferred from
position: `paid` is 1260 m² over 1 room, `unpaid` 1948 m² over 5, and back-of-house 80 m²
over 2, so "how much unpaid floor is there" is a read rather than a sum — while the SVG is
byte-identical without the zone wrappers. The four retail units are one
[`strip`](/reference#strip-v1-13), not four hand-placed rooms: each unit's offset is the
running sum of the ones before it, so changing a shop's depth moves every unit below it and
nothing else. Escalators and a lift are
[vertical shafts](/reference#vertical-circulation-stair-elevator-escalator-v1-21) drawn with
their chevrons and UP/DN arrows; on a single-storey plan they still obstruct circulation,
and `W_STAIR_UNMATCHED` is a multi-storey question that never fires here.

<ArchLive :src="EXAMPLES['transit-hall']" :rows="30" />

### Clinic Wing

An outpatient clinic — **13 rooms, 294.12 m², 11 doors, 13 windows** at `scale 1:100` —
whose six consulting rooms are **one [component](/reference#components) placed six times**.
Every consulting room in a clinic is the same room; drawn the usual way that is twenty-four
statements to keep in step by hand. Here it is written once and
[instantiated](/reference#placing-instances-place-v1-22): each `place consult(…) as c1 …` is
an addressable instance of exactly 16.2 m².

Three things follow. **Namespacing** — ids inside the component become
`<instance>.<id>`, so the six rooms are `c1.main` … `c6.main` and the plan can address
exactly one of them: `furniture … in c2.main` puts an ECG trolley in the second room and
nowhere else, and `arch describe --room c2.main` reads it back. **Mirroring** — the north row
is placed as drawn and the south row with `mirror y`, a real reflection about the instance's
own origin, so the corridor wall lands on the corridor for both rows and all six doors face
the same way; because a reflection moves the origin to the far edge, a mirrored 4500-deep
unit is placed at the far y. **One side wall** — each instance carries its left wall and its
corridor wall only, an L rather than a box, so at 3600 centres no two partitions ever
coincide. The rest of the wing is ordinary: a 2400 corridor with a `dim clear` proving
2300 mm of it is actually clear floor, pocket doors on the consulting rooms so no leaf ever
sweeps into a corridor patients queue in, and a sliding door wide enough for a trolley into
treatment. The plan is clean under `arch lint --profile accessibility-advisory` as well as
the default ruleset.

<ArchLive :src="EXAMPLES['clinic']" :rows="30" />

## Geometry & experiments

### Gallery L (rooms that are not rectangles)

Two [polygonal rooms](/reference#polygonal-rooms-v1-23) — **2 rooms, 153 m²** at
`scale 1:100`: an **L**-shaped gallery wrapping a **trapezoid** lobby, so the building has
an angled south-west facade. `room polygon (x,y) …` replaces `at` + `size` with the room's
own ring, and everything downstream follows the ring rather than a bounding box — the
gallery reports its exact **132 m²** (its box would claim 168), the two rooms read as
adjacent across the boundary they actually share, and the label sits at the polygon's
centroid (the lobby pins its own with `label "…" at (x,y)`). The entrance door is hosted on
the *angled* wall the ordinary way, and `dims auto all` measures the chain off the rooms'
vertex coordinates.

<ArchLive :src="EXAMPLES['gallery-l']" :rows="13" />

### Hexagon Pavilion

Six trapezoidal galleries ringing a circular rotunda — **7 rooms, 122.79 m²** on a
15 × 12 m hexagonal footprint. Every other example is built from rectangles, because that is
what a floor plan usually is; this one is not rectangular anywhere, and it exists to show
that [polygon rooms](/reference#polygonal-rooms-v1-23),
[circular rooms](/reference#circular-rooms-v1-24) and
[`arc` wall edges](/reference#curved-walls-arc-edges-v1-24) compose.

**The hexagon is not regular, and that is the point.** A regular hexagon of circumradius R
carries four of its vertices at an irrational offset no grid can express, so its sloped
facades never measure a round anything — set one out at R = 7500 on a 50 mm grid and each
nominal 7500 edge comes back 7504. A drawing that calls that 7500 is lying, and one that
calls it 7504 looks like a mistake. So this shell is built on a 3-4-5 triangle instead:
every sloped facade steps 4500 across and 6000 down, which is exactly 7500, and every vertex
lands on the grid. The drum in the middle is one wall of two semicircular arcs on a
centreline of radius 3000 — the inner hexagon's inradius, so it is tangent to all six
galleries' inner edges, which is what lets the rotunda be `room circle … radius 3000`
(exactly 28.27 m² = πR²) and counts each gallery as adjacent to it. The six cased openings
are positioned `on drum at <pct>`, which walks the wall by **arc length**, so 8.333 % is 30°
— square onto the middle of a gallery. Its palette comes from a single colour with
`theme from "#2f6f4e"`.

<ArchLive :src="EXAMPLES['hexagon-pavilion']" :rows="30" />

### Terrace Row

Four terrace dwellings generated from **one component, placed and mirrored** — **16 rooms,
199.8 m², 16 doors, 18 windows** across 22.2 × 9.6 m. A terrace is the same plan four times,
so it is written once: `component unit(w, d, gable)` in its own coordinates from (0,0), then
four [`place`](/reference#placing-instances-place-v1-22) statements, alternating `mirror x`.

`mirror x` reflects about the *instance's* own origin, so a mirrored unit is placed at its
far x edge. Alternating it is what makes a terrace a terrace: u1 and u2 meet local-x=w to
local-x=w, so their bathrooms and kitchen runs back onto one shared party wall, and u2 and u3
meet local-x=0 to local-x=0. The consequence is that the row's two free gables are both the
local x=0 wall — which is why `gable` is 1 for the end units and 0 for the middle two, and why
the `if` inside the component puts a side window on that wall and nowhere else. The offsets
are arithmetic rather than typing (`widths` is an array and the placements are a running sum
of it), the 600 mm stagger is one coordinate, and three of the four room names are pinned with
`label "…" at (x,y)` written in the **component's** coordinates — a pinned label is a point
like any other, so `place` carries it through the frame and the mirrored units get the
mirrored position for free. `theme blueprint` is a named theme base: a whole cyanotype palette
from one word.

<ArchLive :src="EXAMPLES['terrace-row']" :rows="30" />

## Scripting & composition

### Relational (right-of / below)

**4 rooms, 60 m²** at `scale 1:100`, positioned relative to one another with `right-of` /
`below`, `align` and `gap` — resolved to absolute coordinates by deterministic arithmetic in
topological order, not an optimizer (see [relational placement](/relational)).

<ArchLive :src="EXAMPLES['relational']" :rows="11" />

### Parametric (let + for)

**3 rooms, 60 m², 3 doors, 3 windows** — a row of repeated units generated from `let`
bindings, a value-function, an array, a scoped `set`, a `for` loop and string interpolation.
It is the demonstration that [scripting](/reference#control-flow) expands **at compile time**
into a fixed, deterministic drawing: there is no runtime, no clock and no randomness, so the
row you see is exactly what the loop produced.

<ArchLive :src="EXAMPLES['parametric']" :rows="16" />

### Accessible metadata

**2 rooms, 24 m²** — the smallest plan that carries
[`accTitle` and `accDescr`](/reference#accessible-metadata-acctitle-accdescr), which supply
the SVG `<title>`/`<desc>` emitted by `arch compile --accessible`. They are **metadata
only**: the default output is byte-identical without the flag. Omit them and the description
is derived from [`describe()`](/analysis)'s caption instead.

<ArchLive :src="EXAMPLES['accessible']" :rows="8" />

## Style

### Themed (blueprint + brick)

**2 rooms, 24 m²** with a custom `theme { … }` block and a brick wall **material** (hatch) —
the same geometry, restyled. Nothing about a theme touches geometry, which is why the
playground's theme selector can restyle any plan on this page. See
[theming](/reference#theming) and [materials](/reference#wall).

<ArchLive :src="EXAMPLES['themed']" :rows="14" />

### Materials (the whole hatch palette)

A 16 × 8 m maker-space — **4 rooms, 128 m², 5 doors, 6 windows**, `paper A3 landscape` at
`scale 1:50` — whose walls carry the entire wall-material palette, one per side. Poché is not
decoration: on a real drawing the hatch inside a wall **is** the specification, and ArchLang
spells that as one optional clause on `wall`:
`material poche|concrete|brick|insulation|tile|none [scale <n>] [angle <deg>]`.

All six appear here, each on the element a builder would actually detail that way and each on
a wall long enough to read: 300 mm **concrete** on the two long facades (the thickest thing in
the building, because that is what carries the roof), 230 mm **brick** on the east gable with
`scale 1.5 angle 90` so the courses run along the wall instead of across it, a 200 mm
**insulation** leaf drawn as its own wall so the leaf rather than the assembly carries the
hatch, **tile** on the two WC partitions, **none** on the glazed office screen (deliberately
empty rather than defaulted), and the default poché on the two service partitions. The sheet
is what makes it readable, and it is the second thing this file is for: at 1:50 a 100 mm
partition draws 2 mm wide and a 300 mm facade 6 mm; halve that to 1:100 and they become 1 mm
and 3 mm — the walls still look right and the hatch inside them is gone. A material sampler
has to be issued at a scale where the poché survives, so the scale is written down rather
than left to the auto-fit. The `legend` beside it is derived: one swatch per material
actually used and one per fixture category actually placed, growing a row on its own if you
add a seventh.

<ArchLive :src="EXAMPLES['materials']" :rows="30" />
