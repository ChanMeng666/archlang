<script setup>
import { EXAMPLES } from "./.vitepress/theme/examples-data.js";
</script>

# Examples

Complete plans from the repository's [`examples/`](https://github.com/chanmeng666/archlang/tree/main/examples)
directory, **live and editable** — edit the source on the left and the SVG on the
right recompiles instantly (client-side, deterministic). Hit **Open in Playground**
to keep going with the full editor.

## Studio (1BR)

The flagship example, and a tour of v1.3: rooms tagged with **`uses`**, a cased
**`opening`** linking the living space to the hall, real **fixture symbols** (sink,
counter, stove, fridge, shower, basin, WC), and doors whose swings stay clear of the
furniture. It is **lint-clean** under the default profile and import-free. Run
`arch describe` / `arch lint` on it to see the [analysis](/analysis) in action.

<ArchLive :src="EXAMPLES['studio']" :rows="22" />

## Two-bedroom flat

A larger plan with a central corridor, multiple rooms, and several openings —
absolute placement at a real apartment's scale, with `north` reoriented.

<ArchLive :src="EXAMPLES['two-bed']" :rows="16" />

## Parametric

Uses `let` bindings, a value-function, an array, a scoped `set`, a `for` loop, and
string interpolation to generate a row of repeated units — showing that
[scripting](/reference#control-flow) expands at compile time into a fixed,
deterministic drawing.

<ArchLive :src="EXAMPLES['parametric']" :rows="20" />

## Themed

A custom `theme { … }` block with a brick wall **material** (hatch) — the same
geometry, restyled. See [theming](/reference#theming) and
[materials](/reference#wall).

<ArchLive :src="EXAMPLES['themed']" :rows="16" />

## Relational

Rooms positioned relative to one another with `right-of` / `below`, `align`, and
`gap` — resolved to absolute coordinates by deterministic arithmetic, not an
optimizer (see [relational placement](/relational)).

<ArchLive :src="EXAMPLES['relational']" :rows="14" />

## Attached (placement sugar)

A one-bedroom flat with **no hand-computed coordinates** for its openings or furniture.
It exercises the v1.13 placement sugar together: a [`strip`](/reference#strip-v1-13) laying
rooms out end to end, doors and windows attached to a wall by position
(`on <wall> at <pos>` — so they can never be reported "off wall"), a door that opens toward
a named room (`swing into`), and furniture anchored inside a room
(`in <room> anchor … inset …`).

<ArchLive :src="EXAMPLES['attached']" :rows="24" />

## Museum (a real sheet, at a real scale)

A ~100 × 60 m single-level museum — the large-building flagship. Everything above is a
dwelling, where sizing every annotation as a fraction of the drawing happens to look
right; at 100 m it does not, and room labels come out metres tall. So this plan declares
a **sheet**: [`paper A1 landscape`](/reference#paper-and-scale-the-sheet) +
[`scale 1:200`](/reference#paper-and-scale-the-sheet), which makes every annotation a
fixed size **on that sheet** — 3.5 mm room labels and 0.5 mm wall lines whatever the
building measures. It also drives `dims auto all` (the GB/T three-chain exterior
dimensioning), a column grid written with `for`, and fixture rows placed by
`against wall <id> offset …` so no coordinate is hand-computed.

<ArchLive :src="EXAMPLES['museum']" :rows="26" />

## Two-storey house (one drawing per level)

A compact house written as two [`level` blocks](/reference#levels-a-multi-storey-building-v1-21)
— a storey is a complete drawing, so this source compiles to **two sheets**
(`two-storey.L1.svg`, `two-storey.L2.svg`), each with its own dimension chains and a title
block stamped `LEVEL 1 — Ground floor` / `LEVEL 2 — First floor`. The settings (`paper A3`,
`dims auto all`) and the `let`s sit *outside* the levels and apply to both: one building,
one sheet spec, one scale. `stair` exists on both floors with the same id — within a level
ids are unique, so the same id across levels is legal and reads as vertical identity.

The live widget below shows **page 1** (the lowest storey), which is what `compile().svg`
returns; `compile().pages` carries the whole set, and `arch describe --level 2 --json` reads
the upper floor's facts.

<ArchLive :src="EXAMPLES['two-storey']" :rows="28" />

## Gallery L (rooms that are not rectangles)

Two [polygonal rooms](/reference#polygonal-rooms-v1-23): an **L**-shaped gallery wrapping a
**trapezoid** lobby, so the building has an angled south-west facade. `room polygon (x,y) …`
replaces `at` + `size` with the room's own ring, and everything downstream follows the ring
rather than a bounding box — the gallery reports its exact **132 m²** (its box would claim
168), the two rooms read as adjacent across the boundary they actually share, and the label
sits at the polygon's centroid (the lobby pins its own with `label "…" at (x,y)`). The
entrance door is hosted on the *angled* wall the ordinary way, and `dims auto all` measures
the chain off the rooms' vertex coordinates.

<ArchLive :src="EXAMPLES['gallery-l']" :rows="30" />

## Harbour Aquarium (curves)

A ~60 × 46 m public aquarium — the [curved-geometry](/reference#curved-walls-arc-edges-v1-24)
flagship. Everything above is rectilinear; an aquarium is the building type that is not. Its
centrepiece is a cylindrical tank you walk around, written as a
[circular room](/reference#circular-rooms-v1-24) (`room circle at (cx,cy) radius R`) inside a
drum wall made of two `arc` edges, and its public frontage turns the south-east corner as a
quarter circle of R12000 instead of mitring it.

Two things to read off the drawing. The curved faces are **true arcs** — SVG `A` commands,
native DXF `ARC` entities — so the rotunda never looks faceted however far you zoom in. And
because a linear dimension chain cannot describe an arc, `dims auto` dimensions the round
things the way GB/T 50104 does: an `R` leader per distinct arc and a `φ` call-out across the
circular room, while the three exterior chains stay on the straight facades. Both rotunda
doors sit **on** the curve — `on rotunda at 25%` walks the wall by run length, so an arc
contributes its arc length rather than its chord — and their leaves swing off the tangent at
the doorway.

<ArchLive :src="EXAMPLES['aquarium']" :rows="30" />

## Accessible metadata

`accTitle` and `accDescr` supply the SVG `<title>`/`<desc>` emitted by
`arch compile --accessible`. They are **metadata only** — the default output is
byte-identical without the flag. Omit them and the description is derived from
[`describe()`](/analysis)'s caption instead.

<ArchLive :src="EXAMPLES['accessible']" :rows="18" />
