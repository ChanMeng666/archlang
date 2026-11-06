# What's new in 1.44 to 1.55

The features that arrived in 1.44.0 to 1.55.0, one section each, with an example you can run,
plus the circulation overlay, which is older and since 1.45.0 reads the plan after a demolition.
Every command and code name below is the one `archlang <command> --help` and the
[error catalog](error-codes.md) print. The full list of changes, version by version, is in
[`CHANGELOG.md`](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md).

| Feature | Since | Section |
|---|---|---|
| Quantities for a takeoff | 1.44.0 | [Quantities and takeoff](#quantities-and-takeoff) |
| Locking what an edit must not change | 1.44.0 | [Locked elements](#locked-elements) |
| Walls marked existing, demolish or new | 1.44.0, drawn from 1.45.0 | [Wall status](#wall-status) |
| Feet and inches | 1.44.0 | [Imperial lengths](#imperial-lengths) |
| A sheet for the reviewer | 1.44.0 | [Review sheet](#review-sheet) |
| Walking routes drawn on the plan | opt-in flag | [Circulation overlay](#circulation-overlay) |
| Storeys that must stand over each other | 1.44.0 | [Stacked storeys](#stacked-storeys) |
| Briefs checked over every storey | 1.47.0 | [Intent across storeys](#intent-across-storeys) |
| Plan JSON says what it dropped | 1.47.0 | [What Plan JSON leaves out](#what-plan-json-leaves-out) |
| Slits, furniture on stairs, labels on walls | 1.47.0 | [More lint reports](#more-lint-reports) |
| Open shells named, empty rooms named | 1.48.0 | [Gaps that used to pass quietly](#gaps-that-used-to-pass-quietly) |
| One L-shaped room in `walls from rooms` | 1.49.0 | [L-shaped rooms](#l-shaped-rooms) |
| Quarter-turn and half-turn stairs | 1.50.0 | [Turning stairs](#turning-stairs) |
| `arch finish` on a plan with storeys | 1.51.0 | [Furnishing every storey](#furnishing-every-storey) |
| Labels that shrink to fit a small room | 1.51.0 | [Labels in small rooms](#labels-in-small-rooms) |
| Net area in the room stamp | 1.52.0 | [Net area in the stamp](#net-area-in-the-stamp) |
| Window kinds and a glazed terrace door | 1.52.0 | [Window kinds](#window-kinds) |
| A window round a corner, with no wall left at it | 1.52.0 | [Corner windows](#corner-windows) |
| The sheet's words and decimal mark, as a plan writes them | 1.53.0 | [Sheet text](#sheet-text) |
| A detail with no north arrow, scale bar or title box | 1.53.0 | [Hidden sheet marks](#hidden-sheet-marks) |
| One piece of furniture, mirrored | 1.53.0 | [One mirrored piece](#one-mirrored-piece) |
| A floor finish on a room | 1.53.0 | [Room floors](#room-floors) |
| Furniture filled in its material | 1.54.0 | [The rendered theme](#the-rendered-theme) |
| Twenty more furniture families | 1.54.0 | [More furniture](#more-furniture) |
| An L-shaped void with a railing | 1.55.0 | [Railed voids](#railed-voids) |
| An OpenPlan3D plan read as `.arch` | 1.55.0 | [Import a plan](import.md#check-an-openplan3d-plan) |
| A rewrite refused when the file changed underneath | 1.55.0 | [Change one room](edit-one-room.md#make-the-assistant-do-it-this-way) |

## Quantities and takeoff

`archlang takeoff` prints the quantities a plan holds: wall lengths per category, each room's perimeter and
net area, the storey's net floor area, and door and window counts by width. Each figure carries its
convention in its name (`length_centreline_mm` against `length_face_mm`, `area_net_m2`), so a number
read from a spreadsheet says what it measures. `--format` picks `csv` (one figure per row) or `md`
(tables, the default); `--waste <pct>` adds a floor area with the allowance you chose, and no
allowance is ever assumed. The same figures are `describe --facts quantities`, and the Playground's
Facts tab (its Takeoff section) shows them for the storey on screen, with a box for your waste percentage that starts
blank and a CSV of the whole plan in the same bytes as `--format csv`.

```bash
archlang takeoff cabin.arch --format csv --waste 10
```

```text
level,section,item,width_mm,field,value
,walls,exterior,,count,1
,walls,exterior,,length_centreline_mm,13412
,walls,exterior,,length_face_mm,26824
,rooms,main,,perimeter_centreline_mm,13412
,rooms,main,,perimeter_net_mm,12612
,rooms,main,,area_net_m2,9.85
,floor,storey,,floor_area_net_m2,9.85
,floor,storey,,waste_pct,10
,floor,storey,,floor_area_with_waste_m2,10.84
,doors,hinged,900,count,1
,windows,window,1500,count,1
```

The plan is the cabin from [Imperial lengths](#imperial-lengths). The definitions of each figure are in
[Analysis: Quantities](analysis.md#quantities--lengths-perimeters-areas-and-counts).

## Locked elements

`archlang impact --against old.arch` compares two versions of a plan. Add `--lock` with the ids that must
not change and the command exits 2 with `E_LOCKED_ELEMENT_CHANGED` for each locked element that moved,
resized, was re-hosted or vanished, with its position in both files. A lock must name an element
written with an `id=`; an assigned id such as `room_3` shifts when a statement is inserted ahead of it,
so it is refused with `E_LOCK_UNNAMED`.

```bash
archlang impact cabin2.arch --against cabin.arch --lock shell,front
```

```text
Locked (2): 2 changed, 0 refused
  E_LOCKED_ELEMENT_CHANGED: Locked wall "shell" resized (13412 mm → 14020 mm long).
  E_LOCKED_ELEMENT_CHANGED: Locked door "front" moved 152 mm right.
Locked elements that changed, before → after:
  shell: cabin.arch:3:3 → cabin2.arch:3:3
  front: cabin.arch:5:3 → cabin2.arch:5:3
```

Here `cabin2.arch` is the cabin of the next sections widened from 12ft to 13ft. The report above the
lock lines (what moved, what held, what broke) is the usual `impact` report.

## Wall status

A wall can say what the works do to it: `status existing`, `status demolish` or `status new`, after
`height` on a `wall` and after the thicknesses on `walls from rooms`. A wall that writes no status is
`existing`. A demolished wall is drawn as a dashed outline with no poché, beneath the walls that stay;
it encloses nothing, hosts no door, window or opening (`E_OPENING_ON_DEMOLISHED_WALL`), and counts in no
area or quantity. A new wall draws as any wall, and the legend adds a `demolished` row when a wall is demolished.
The DXF files the two on their own layers, `A-WALL-DEMO` and `A-WALL-NEWW`. Rooms are drawn as the
plan will be after the works, so the schedule and `describe()` agree.

```arch
plan "Remodel" {
  units mm
  grid 100
  legend
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall id=old partition thickness 100 status demolish { (4000,0) (4000,4000) }
  wall id=new partition thickness 100 status new { (2500,0) (2500,4000) }
  room id=a at (0,0) size 2500x4000 label "Study" uses office
  room id=b at (2500,0) size 5500x4000 label "Living" uses living
  door id=front on b.bottom at center width 900 swing into b
  door between a and b at 1000 from start width 800 swing into a
  window on b.top width 1500
}
```

Furniture cannot back onto a demolished wall: `against wall old` is `E_FURN_AGAINST_DEMOLISHED_WALL`
(1.46.0). A larger example is [`examples/remodel.arch`](https://github.com/ChanMeng666/archlang/blob/main/examples/remodel.arch).

## Imperial lengths

A length may be written in feet and inches: `12ft`, `6in` and `12ft6in`, also inside a size such as
`12ftx10ft`. Each literal is converted exactly (1 in = 25.4 mm) and rounded to a whole millimetre
(`12ft6in` is 3810). Every output stays in millimetres, and a plan written in feet
compiles to the same bytes as its millimetre twin. The quote forms `12'6"`, a fraction such as `1/2in`,
and the wrong order `6in12ft` are refused with `E_IMPERIAL_FORM`, whose message names the accepted forms.

```arch
plan "Cabin" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (12ft,0) (12ft,10ft) (0,10ft) close }
  room id=main at (0,0) size 12ftx10ft label "Main" uses living
  door id=front on main.bottom at center width 900 swing into main
  window on main.top width 1500
}
```

A room written `size 12'6"x3000` stops with `E_IMPERIAL_FORM` and the fix
`Write 12ft6in for 12'6", 0.5in for 1/2", and put feet before inches.` The rounding table is in the
[language reference](language-reference.md#imperial-input).

## Review sheet

`archlang preview --review` renders one PNG for whoever reviews a plan: the plan, the access graph over it,
and every element a compile or default-lint warning names ringed with a number and its code. A legend
lists number, code and message, and a strip of close-ups, at one fixed scale, shows the flagged
openings and furniture pieces (at most 24). It is a separate image; `compile`, `describe` and `lint` do not
change. `--json` adds `marks[]` with each warning's span and the elements it ringed. One storey per
sheet (`--level`); it is refused beside `--ascii`, `--view` and `--overlay`.

```bash
archlang preview remodel.arch --review -o review.png --json
```

For the remodel above with its window deleted, the sheet carries one mark, `W_HABITABLE_NO_WINDOW`,
ringing the living room; `marks[0]` reports `"n": 1` and `"line": 9`. A plan with no warning gives a
sheet with `"rings": 0`.

## Circulation overlay

`--overlay circulation` is an opt-in diagnostic layer for `compile` and `preview`: the walking routes
with a marker where the way is narrowest. The default drawing is
unchanged, and since 1.45.0 the routes read the plan after any demolition.

```bash
archlang compile remodel.arch --overlay circulation -o remodel-walks.svg
```

The numbers behind it (walk distance, narrowest pinch, how roundabout the route is) are in
[Analysis: describe and lint](analysis.md), and `W_PATH_TOO_NARROW` and `W_CIRCUITOUS_PATH` are the
rules that read them.

## Stacked storeys

In a plan of `level` blocks a stair, elevator or void with the same id on two storeys is one shaft.
`keep stacked <id> on levels <n> <n>` states that the shaft's footprint must stand over itself on those
storeys. A `keep` is checked and never solved: when it breaks, the compiler reports
`W_KEEP_VIOLATED` with the signed residual and moves nothing. Two stair checks sit alongside it:
`W_STAIR_UNMATCHED` for a run whose id appears on a single storey (usually a typo in the id), and
`W_SHAFT_FOOTPRINT_MISMATCH` for a run whose footprints on two neighbouring storeys overlap by less
than half of the smaller, run along different axes, or are different kinds of run.

```arch
plan "Stacked" {
  units mm
  keep stacked core on levels 1 2
  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=p1 partition thickness 100 { (2000,0) (2000,4000) }
    room id=hall at (0,0) size 2000x4000 label "Hall" uses hall
    room id=living at (2000,0) size 4000x4000 label "Living" uses living
    door id=front on hall.bottom at center width 900 swing into hall
    door between hall and living at center width 900 swing into living
    stair id=core at (200,200) size 1000x2400 dir up
  }
  level 2 "First" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    wall id=p2 partition thickness 100 { (2000,0) (2000,4000) }
    room id=landing at (0,0) size 2000x4000 label "Landing" uses hall
    room id=bed at (2000,0) size 4000x4000 label "Bedroom" uses bedroom
    door between landing and bed at center width 900 swing into bed
    window on bed.top width 1500
    stair id=core at (200,200) size 1000x2400 dir down
  }
}
```

As written the plan lints with two advisory warnings unrelated to stacking (the living room has no
window, and the upper stair has no clear landing at its head). Move the upper stair to `at (3000,200)` and the keep reports `W_KEEP_VIOLATED` while the lint reports
`W_SHAFT_FOOTPRINT_MISMATCH` ("the footprints overlap by 0% of the smaller, under half"). Remove the keep and rename it
`cor`, and the lint reports `W_STAIR_UNMATCHED` on both storeys. The keep forms are in the
[language reference](language-reference.md#keep--declared-invariants-checked-and-never-solved).

## Intent across storeys

`validate --intent`, `score --brief` and `validateIntent()` read every storey of a plan with `level` blocks
(1.47.0). `rooms`, `roomsInclude`, `totalAreaM2` and the advisory `adjacency` used to see only the lowest storey,
so a correct two-storey house could never pass. A room id repeated on another storey is a different room.
`windows.min` in `roomsInclude` counts the windows of all the matching rooms together, not of each room.

```bash
archlang validate house.arch --intent intent.json
```

## What Plan JSON leaves out

`compile -f json` says what the format could not carry (1.47.0): one `note:` on stderr per clause, `dropped` in
the `--json` envelope and on `planToJson()`. The exit code and the document are unchanged.

```arch
plan "Bow" {
  units mm
  legend
  wall id=w exterior thickness 300 { (0,0) (6000,0) (6000,4000) arc (0,4000) radius 4000 cw (0,0) close }
}
```

```text
note: Plan JSON carries no legends; this export leaves out 1 legend (the .arch source still holds it)
```

A wall's `arc` and the `paper` now travel (1.53.0): the arc on the point it arrives at, `{ "x": 0, "y": 4000,
"arc": { "radius": 4000, "dir": "cw" } }`, and the sheet beside `scale`, `{ "size": "A4", "orientation": "landscape"
}`, so neither is reported and a plan that has nothing else to lose comes back byte for byte.

## More lint reports

1.47.0 reports three things it used to pass in silence:

- `W_WALL_END_SHORT`: a wall whose free end stops up to `wallGapMm` (100 mm by default) short of a wall it runs
  toward, which leaves a visible slit instead of a joint.
- `W_FURNITURE_ON_STAIR`: a piece on a flight, or on the landing it owes. `arch finish` no longer places one there.
- `W_ANNOTATION_OVERLAP` now also reports a room's name or area figure over a wall or a door's swing, or running
  off its floor. The label pass no longer walks a name out of its room; a name too wide for its room stays
  there and is reported. The drawing did not yet shrink a label: see [Labels in small rooms](#labels-in-small-rooms).

## Gaps that used to pass quietly

Four things that gave no report before 1.48.0:

- `W_EXTERIOR_RING_OPEN` names exterior walls that do not close: "their ends stop 1000 mm apart on the line x 0, y 0–1000, centreline to centreline".
- `arch finish` lists every room it leaves empty in `unresolved`, such as a hall or a room whose use it cannot read. These notes carry `scope: "outside-table"`, so a caller can tell them from a refusal.
- A hyphen in an id, a `,` between uses and a `;` at a line end each carry a hint saying what to write.
- `dropped` also reaches `batch -f json` and the MCP `compile` tool.

## One grid for every storey

`axes` declared once serves every storey, and a wall, a column or a room can now stand on it by
label. `axis.3` and `axis.B` read an axis as a coordinate; `keep on axis` holds a wall on it, and
now a column, read at its centre.

```arch
plan "One grid" {
  units mm
  axes { x at 0, 6000, 12000 y at 0, 5000 }
  level 1 {
    wall id=g2 partition thickness 200 { (axis.2, axis.A) (axis.2, axis.B) }
    column id=c at (axis.3 - 200, axis.B - 200) size 400x400
    keep on axis 2 g2
    keep on axis 3 c
    keep on axis B c
  }
  level 2 {
    wall id=g2 partition thickness 200 { (axis.2, axis.A) (axis.2, axis.B) }
    column id=c at (axis.3 - 150, axis.B - 200) size 400x400
    keep on axis 3 c   # warning: that column is 50 mm right of the axis
  }
}
```

A label the plan does not declare is `E_UNKNOWN_REF`. A `let`, a `place … at` and a component
argument are read before the axes exist, so they share a `let` with the `axes` block instead; a
component keeps its own coordinates, and `keep on axis 2 wing.c` on the storey checks it after it is
placed. `W_AXES_DIFFER` warns if a `let` inside a `level` turns the one block into two grids.
See [Positioning axes](language-reference.md#positioning-axes-定位轴线).

## L-shaped rooms

A `room polygon` whose edges are all horizontal or vertical works in `walls from rooms` (1.49.0). It stays one room, with one stamp and one area, and the walls come from its outline.

```arch
plan "L-shaped living room" {
  units mm
  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom
  room id=bath at (6000,0) size 2000x6000 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door between liv and bed at 1500 from bed.top width 800 swing into bed
}
```

`liv` and `bed` share two edges here, so `door between` has to say which: `at center` is refused, and the message quotes the forms that work. `open between` on such a pair is refused too. A polygon with a slanted edge and a circle room stay outside `walls from rooms`.

Such a polygon also has sides now. Each is the outline's run on its outermost line, so the rooms-first forms read the shape and never its bounding box:

```arch
plan "L-shaped room, placed by its sides" {
  units mm
  room id=liv polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) label "Living" uses living
  room id=bed at (3000,3000) size 3000x3000 label "Bedroom" uses bedroom
  room id=bath right-of liv align bottom size 3200x1800 label "Bath" uses bath
  room id=store at (6000,0) size 3200x1200 label "Store" uses storage
  walls from rooms exterior 200 partition 100
  window on liv.top width 1500
  window on bed.bottom width 1200
  door on liv.left at 900 from liv.top width 1000 swing inward
  door between liv and bed at 1500 from bed.top width 800 swing into bed
  door between liv and bath at center width 800 swing into bath
  door between liv and store at center width 800 swing into store
  furniture sofa in liv anchor left flush size 900x2000
  furniture bookshelf in liv anchor bottom flush size 1200x300
  furniture shower in bath anchor right flush size 900x900
}
```

`right-of liv` stands on the run at x 6000, y 0–3000, and `align bottom` keeps the bath on it rather than floating past the notch at y 6000. A corner anchor needs a vertex of the outline there, so `anchor bottom-right` is refused: that corner is the notch. A side anchor centres on the run. A side with two runs, like the prongs of a U, `liv.cx` and `centered` are refused, and so is a piece that would leave the floor. `finish` now furnishes such a room on the same terms: a piece stands only where those forms can say. A notch edge has no word yet, so nothing is proposed against it.

## Turning stairs

A `stair` can be one block of flights and landings (1.50.0). Pieces are in climbing order, and each flight runs from what it touches.

```arch
plan "Quarter-turn stair" {
  units mm
  height 2750
  room id=hall at (0,0) size 3800x3800 label "Stair hall" uses hall
  walls from rooms exterior 200 partition 100
  door on hall.bottom at 800 from start width 900 swing inward
  stair id=s dir up width 1000 {
    flight at (2700,1630) size 1000x1530
    landing at (2700,630) size 1000x1000
    flight at (1170,630) size 1530x1000
  }
}
```

It draws as one stair, with one label, one walking line and one break line. `W_STAIR_TOO_STEEP` reads the block as one climb, with a landing replacing one going, and `describe --json` lists `flights`, `landings` and `turn`. Write the same block on two storeys and it is one shaft. `examples/turning-stair.arch` is a worked house. Winders are not in the language; draw a landing, and lint reads the stair strictly.

## Window kinds

A `window` can say what kind it is, and a wide terrace door can be glass. Neither was possible on a
plan: every window drew alike, and `door sliding` drew thin interior panels.

```arch
plan "Window kinds" {
  units mm
  schedule openings
  legend
  room id=a at (0,0) size 6000x4000 label "Living" uses living
  walls from rooms exterior 300 partition 100
  door on a.left at center width 1000 swing into a
  window tilt_turn on a.top at 1500 from start width 1500 hinge left sill 900
  window fixed on a.top at 4500 from start width 1500 sill 900
  door glazed_sliding on a.bottom at center width 2400 slide right
}
```

The window words are `fixed`, `casement`, `tilt`, `tilt_turn` and `sliding`. Each draws a small sign
inside the wall, and the word reaches `describe --json`, the schedule's TYPE column, the legend and
Plan JSON. `hinge left|right` belongs to `casement` and `tilt_turn`. Leave it out when you do not know
the side: the sign then stands on both jambs, and the drawing claims no hand. A window with no kind
word is unchanged.

`door glazed_sliding` draws one fixed and one moving panel in glass, with a slide arrow. It counts as
a door everywhere a door counts, and a person passes through the panel that moves, so the checks read
half its `width`. On a door, `width` is the structural opening, jamb to jamb in the wall: see
[Door](language-reference.md#door).

## Furnishing every storey

`arch finish` used to report a plan with `level` blocks and leave it empty. Since 1.51.0 it furnishes each storey by the rules of a one-storey plan, and it writes each storey's pieces inside that storey's own block:

```diff
   level 0 "Ground" {
     room id=liv at (0,0) size 5000x4000 label "Living" uses living
     walls from rooms exterior 300 partition 100
     door on liv.bottom at 2500 from start width 1000 swing into liv
     window on liv.top width 2000
+    furniture sofa in liv anchor right flush size 900x2000 rotate 90
   }
```

The same room id on two levels is two rooms, so `in liv` means the room of the block it is written in, and each entry of `changes` and `unresolved` carries its `level`. A piece keeps off a shaft's flights and landings, a flight that passes through the floor from the storey above or below, the storey's own `void`s and its lifts and escalators. "Never worse" is judged per storey: a new warning on one storey is refused even when another storey improved. A room of a placed component stays empty and is named; furnish the component, or write `furniture … in u1.bed` yourself. A one-storey plan gets the same bytes as before, so `finish` can still write a piece on a `void`, a lift or an escalator there.

## Labels in small rooms

A room's label that does not fit now shrinks. If its name or area figure would lie over a wall, a door's swing or a fixture, or run off the floor, the label is drawn at the first height that clears: 3, 2.5 or 2 mm on the sheet, wrapped at a space where that helps, at the clear place nearest the room's centre. A label that fits does not change.

```arch
plan "A small store" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=wc at (0,0) size 1000x1400 label "WC" uses wc
  room id=store below wc align left size 1200x900 label "Abstellraum" uses storage
  walls from rooms exterior 200 partition 100
  door between wc and store at center width 600 swing into store
}
```

"Abstellraum" comes out at 2 mm, beside the door's swing. Write `Abstell- raum` and it breaks at the space; a word is never split on its own. A pinned `label … at (x,y)` keeps its size. A label that clears at no height is reported by `W_ANNOTATION_OVERLAP`, and no leader line is drawn. 2 mm is the size of furniture labels, the smallest lettering the sheet draws, and it is this drawing's own rule, no standard's minimum. Without `paper`, the steps end at that drawing's furniture-label size.

Widths are now read character by character, in place of one figure for every letter: the wider of Roboto, which the PNG and the PDF draw, and Helvetica Bold, which a browser reaches for an SVG's room name. `WC` reads 0.83 of its size per character and "Utility" 0.4, so `W_ANNOTATION_OVERLAP` can report a name it used to pass, and drop one it used to report. This is an estimate covering those two faces, not a promise for every font.

## Net area in the stamp

The room stamp shows the centreline area, and the schedule lists both that and the net area. Write `schedule rooms net` and the stamp shows the net figure, named: `10.4 m² net`.

```arch
plan "Net stamp" {
  units mm
  paper A4 landscape
  scale 1:50
  schedule rooms net
  room id=living at (0,0) size 3000x4000 label "Living"
  room id=bed at (3000,0) size 3000x4000 label "Bed"
  walls from rooms exterior 300 partition 100
}
```

The figure is the NET AREA column's, which is `describe()`'s `rooms[].net_area_m2`: one calculation, read twice. A room the schedule cannot measure shows `-` there and keeps its centreline stamp without `net`, and so does a room no wall touches. Without the word nothing changes. The longer stamp is fitted like any label, so it can shrink in a narrow room. This is a drawing choice, no standard's rule.

## Corner windows

Two windows can now meet at a corner with no wall left between them. Write one on each wall, each placed `at corner` and naming the edge the other stands on:

```arch
plan "A corner window" {
  units mm
  grid 50
  room id=living at (0,0) size 5000x4000 label "Living" uses living
  walls from rooms exterior 200 partition 100
  door id=entry on living.left at 2000 from start width 900 swing into living
  window id=n on living.top at corner living.right width 1800
  window id=e on living.right at corner living.top width 1200
}
```

`width` runs to the outer corner. The glass, the wall faces and the sills mitre at the corner. They stay two windows, each with its own wall, `facing` and schedule row, and `describe --json` gives each the other's id in `corner_with`. What is not a true corner of two exterior walls is refused with `E_WINDOW_CORNER`, and a window with no partner is refused with the missing statement in the hint.

`open between` stays centred. An `at` on it now says so and quotes the `opening between` statement to write instead, which draws the same hole at the position you asked for and keeps the wall on either side of it.

## Sheet text

Every fixed word on a sheet was English, and every number had a decimal point. `sheet text` replaces them, so a plan can go to a buyer who reads German:

```arch
plan "Haus" {
  units mm
  paper A4 landscape
  scale 1:50
  sheet text {
    decimal ","
    room_schedule "RAUMBUCH"
    net_area "NETTOFLÄCHE (m²)"
    total "SUMME"
    net "netto"
  }
  schedule rooms net
  room id=wohnen at (0,0) size 3000x4000 label "Wohnen"
  room id=bad at (3000,0) size 3000x4000 label "Bad"
  walls from rooms exterior 300 partition 100
}
```

A key you leave out keeps its English word. The stamp above reads `10,4 m² netto`. ArchLang ships no translations and there is no `locale`: the words are yours, and whether they are right is yours to check. The [language reference](language-reference.md#sheet-text) lists every key and has a German starting point, which no German drafter has reviewed.

Only drawn text changes. `describe()`, Plan JSON and every coordinate keep their numbers, a `lint()` message stays English, and a number inside a string you wrote keeps its point. Nothing is read from the machine: the same source draws the same bytes everywhere. Without the block a plan draws what it drew before.

## Hidden sheet marks

Every plan drew a north arrow and a scale bar, which a stair detail has no use for. A trailing `hidden` takes a mark off the sheet and leaves its fact alone:

```arch
plan "Stair detail" {
  units mm
  paper A4
  scale 1:20 hidden
  north hidden
  title hidden
  room id=hall at (0,0) size 3000x2200 label "Hall" uses hall
  walls from rooms exterior 200 partition 100
}
```

`scale 1:20 hidden` is still the operative scale and `north 30 hidden` keeps its bearing for every compass fact. A band with nothing left in it is not reserved, so the drawing gets the room back, and that is the one way `describe()` moves: `sheet.scale_denominator` follows where the auto scale now fits finer. See [Hiding the sheet marks](language-reference.md#hiding-the-sheet-marks).

## One mirrored piece

Mirroring a sofa used to take a `component` and a `place … mirror x`, which lost the room it stood in. `mirror` on the statement swaps one piece's left and right, and its back stays put:

```arch
plan "Two sofas" {
  units mm
  room id=a at (0,0) size 6000x4000 uses living
  walls from rooms exterior 300 partition 100
  furniture sofa_l in a anchor top-left flush size 2600x1800
  furniture sofa_l in a anchor top-right flush size 2600x1800 mirror
}
```

A handed symbol flips, and a symbol with no hand keeps its exact bytes. The word takes no axis: `mirror x` belongs to `place`, which reflects a whole instance. See [Furniture](language-reference.md#furniture).

## Room floors

`floor` lays a hatch over a room: `tile`, `paving`, `deck` or `concrete`. Each word earns a `legend` row and reaches DXF as a real `HATCH`:

```arch
plan "Finishes" {
  units mm
  paper A4
  scale 1:50
  legend
  room id=bath at (0,0) size 2400x3000 label "Bath" uses bath floor tile
  room id=living right-of bath size 4000x3000 label "Living" uses living floor deck
  walls from rooms exterior 200 partition 100
}
```

It is a drawing fact: `describe()` and `lint()` read the plan as if it were not there. It is a pattern and not a colour, so it follows the `theme`. See [Room](language-reference.md#room).

## The rendered theme

`theme rendered` draws the presentation palette and fills every furniture symbol in a soft tint of its material: fabric for a sofa, wood and glass for a coffee table, ceramic for a bath, foliage for a plant. Every other theme still draws each symbol as an outline, byte for byte as before:

```arch
plan "Rendered" {
  units mm
  theme rendered
  room id=living at (0,0) size 5000x4000 label "Living" uses living
  room id=bath right-of living size 2400x4000 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door id=front on living.bottom at 1000 from start width 900 swing into living
  door between living and bath at 2600 from start width 800 swing into bath
  window on living.top width 1500
  furniture sofa in living anchor top flush size 2200x900
  furniture rug at (1500,1500) size 2000x1400 in living
  furniture coffee_table at (2000,1900) size 1000x600 in living
  furniture armchair in living anchor top-left flush size 800x800
  furniture plant in living anchor top-right flush size 500x500
  furniture bathtub in bath anchor top flush size 1700x750
  furniture basin in bath anchor right flush size 450x550
}
```

A rug stays unfilled, so nothing drawn under it is hidden. The tint is a drawing fact: `describe()` and `lint()` do not change. Each family's material is exported as `FIXTURE_FAMILY_MATERIALS` and `familyMaterials()`.

## More furniture

Twenty families joined the catalogue, each with its own symbol: `floor_lamp`, `side_table`, `console_table`, `ottoman`, `bean_bag`, `pantry`, `towel_rail`, `palm`, `flower_bed`, `boulder`, `picnic_table`, `slide`, `bollard`, `bike_rack`, `raised_bed`, `whiteboard`, `printer`, `server_rack`, `hospital_bed` and `workstation`, plus aliases such as `pouf`, `rock` and `copier`. Each takes `furniture <word> … size WxD` like any other piece, and the [fixture catalogue](language-reference.md#furniture) gives the footprints.

These words used to be free words drawn as a labelled box. A plan that already used one now gets the family's rules: the symbol replaces the label, and `facing`, `anchor` and the fixture warnings treat it as they treat any other catalogued piece. The [changelog](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md) lists each change.

## Railed voids

A stair well or a gallery that is not a rectangle used to take two rectangle voids and a site `fence` standing in for the railing. `void … polygon` takes the ring, whose edges run only horizontally and vertically, and `rail` draws the railing on the edges it names. On a ring the edges are numbered: edge `n` runs from point `n` to point `n+1`, counted from 0. Here the stair arrives across edge 4, and edges 0 and 5 stand on the walls:

```arch
plan "Railed well" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  room id=landing at (0,0) size 6000x5000 label "Landing" uses circulation
  door id=d on shell at 14000 width 900
  void id=well polygon (100,100) (3100,100) (3100,1100) (1100,1100) (1100,4100) (100,4100) rail 1 2 3
}
```

A rectangle names its sides instead, as a balcony does: `void at (5000,2000) size 2000x3000 rail top left`. The outline is one dashed line with a cross in each cell of the grid the ring's corners make (three for an L), and the walk, the stair checks and `finish` read the hole as those cells. The railing is a drawing: it has no height, and a void with no `rail` draws none. See [Void](language-reference.md#void--a-hole-in-the-floor-v1-29).
