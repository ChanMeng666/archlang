# What's new in 1.44 to 1.46

The features that arrived in 1.44.0, 1.45.0 and 1.46.0, one section each, with an example you can run,
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

## Quantities and takeoff

`archlang takeoff` prints the quantities a plan holds: wall lengths per category, each room's perimeter and
net area, the storey's net floor area, and door and window counts by width. Each figure carries its
convention in its name (`length_centreline_mm` against `length_face_mm`, `area_net_m2`), so a number
read from a spreadsheet says what it measures. `--format` picks `csv` (one figure per row) or `md`
(tables, the default); `--waste <pct>` adds a floor area with the allowance you chose, and no
allowance is ever assumed. The same figures are `describe --facts quantities`.

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
