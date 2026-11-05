# Import a plan

Two ways into ArchLang from outside it: a plan file from OpenPlan3D, converted by the CLI, and a
segmentation mask, turned into Plan JSON by an experimental tool in the repository.

## Check an OpenPlan3D plan

[OpenPlan3D](https://github.com/laanlabs/openPlan3D) is an open, MIT-licensed floor-plan editor in
the browser, with an iPhone app that captures a room with Apple RoomPlan. It saves two kinds of JSON:
the **web project** (Export → Download JSON, centimetres) and the **prepared RoomPlan interchange**
file (Export → Download interchange JSON, or the iPhone app's editable-plan export, metres).
`archlang import --from openplan3d` reads either and writes ArchLang source, so the plan can be
checked like any other:

1. capture or draw the plan in OpenPlan3D;
2. export it as JSON;
3. `archlang import --from openplan3d plan.openplan.json -o plan.arch`;
4. `archlang lint plan.arch` (or `validate`, `describe --json`, `compile`).

```bash
archlang import --from openplan3d plan.openplan.json -o plan.arch
archlang lint plan.arch --json
archlang import --from openplan3d plan.openplan.json --json   # the source plus the report
```

The format is detected as OpenPlan3D detects it (a file with `openplanPrepared`,
`openplanHandoffVersion` or wall `dimensions` is interchange, anything else a web project);
`--format web|handoff` forces one. A file OpenPlan3D's own validators would refuse is refused with
their path and reason (`E_IMPORT_FORMAT`), and nothing is written.

### What maps, and how

| OpenPlan3D | ArchLang |
|---|---|
| walls (centreline `start`/`end`, `thickness`) | `wall … { (x,y) (x,y) }`, `exterior` when one side faces a room and the other none (OpenPlan3D's own envelope test), else `partition` |
| a curved wall (`curvePoint`) | the same wall drawn as OpenPlan3D's own 16 straight facets |
| wall heights | `height`; a sloped wall keeps its higher end |
| rooms | every closed loop of wall centrelines, found the way OpenPlan3D finds them (5 cm endpoint snapping, T-junctions and crossings split), as `room … at … size` or `room … polygon`; the saved room record with the same wall set gives the `label`, and its room type gives `uses` |
| doors | `door … on <wall> at <mm>`: `swingDirection` gives `hinge near end` (left) or `hinge near start` (right), `flipSide` gives `swing in` (false) or `swing out` (true), as OpenPlan3D draws the leaf; `double`, `sliding`, `pocket`, `bifold`, `garage` keep their kind, `french` becomes `double`, `opening` becomes `opening` |
| windows | `window … on <wall>` with `sill` and `head` (`sillHeight` + `height`); `fixed`, `casement`, `sliding` keep their kind |
| a straight stair turned by a quarter turn | `stair … dir up\|down` on the same footprint, entered at the same end (a flight that OpenPlan3D starts from the north or west end is placed as a mirrored component) |
| square columns | `column` |
| furniture with an ArchLang fixture family (sofa, beds, WC, bath, sink, stove, …), turned by quarter turns | `furniture <family> at … size … [rotate] [mirror]` |
| floors (`level`, `elevation`) | `level <n> "<name>" height <mm>`, the height being the difference to the next floor's elevation |
| interchange `sections` | the label (and use) of the room each one stands in, matched as OpenPlan3D matches them |

Lengths become millimetres exactly (×10 from centimetres, ×1000 from metres), rounded to the nearest
0.001 mm with halves away from zero. Ids are kept where they are ArchLang identifiers and rewritten
otherwise (`--json` lists every rewrite under `ids`).

### What is left out

Finishes and textures, notes, prices and photos, text annotations, dimension and measuring lines,
guides, groups, tracing images, round columns, turning or spiral stairs, a stair's riser count
(ArchLang chooses the risers from the storey height), furniture with no fixture family or turned off
a quarter turn, furniture heights, and sibling planner data (OpenKitchen3D, OpenLandscape3D,
OpenCatio3D blocks and attributes). An unprepared RoomPlan capture is imported exactly as captured:
OpenPlan3D squares and joins such walls on import, and this conversion does not. Nothing is left out
without a word: each kind and reason gives a `W_IMPORT_DROPPED` warning, and the `--json` report
lists every dropped entity (`dropped`) and every dropped field with a count (`fields`), while
`counts` gives, per kind, how many were read, written out and dropped.

### Worked example

OpenPlan3D's own two-room example (`docs/skills/openplan3d-plan-authoring/examples/` in its
repository) imports to this, which lints clean:

```arch
# Imported from an OpenPlan3D web project JSON (centimetres) by `archlang import --from openplan3d`.
# Lengths are millimetres, rounded to 0.001 mm. What was not carried over is in the import report.
plan "Two-room demo" {
  units mm
  north up

  # floor "Ground Floor"
  wall id=w_north exterior thickness 200 height 2700 { (0, 0) (8000, 0) }
  wall id=w_east exterior thickness 200 height 2700 { (8000, 0) (8000, 5000) }
  wall id=w_south exterior thickness 200 height 2700 { (8000, 5000) (0, 5000) }
  wall id=w_west exterior thickness 200 height 2700 { (0, 5000) (0, 0) }
  wall id=w_partition partition thickness 120 height 2700 {
    (4800, 0)
    (4800, 5000)
  }
  room id=r_living at (0, 0) size 4800x5000 label "Living Room"
  room id=r_bedroom at (4800, 0) size 3200x5000 label "Bedroom"
  door id=d_entry on w_south at 6000 width 900 hinge near end swing in head 2100
  door id=d_bedroom on w_partition at 4000 width 800 hinge near start swing out head 2100
  window id=win_living sliding on w_north at 2400 width 1500 sill 900 head 2100
  window id=win_bedroom on w_east at 2500 width 1200 sill 900 head 2100
  furniture id=f_sofa sofa at (1400, 750) size 2000x900
  furniture id=f_coffee_table coffee_table at (1800, 2300) size 1200x600
  furniture id=f_bed double_bed at (5650, 700) size 1500x2000 rotate 90
}
```

The wall colours and room floor textures are reported as dropped; the interchange version of the same
example imports to the same plan, with `uses living` and `uses bedroom` from its sections.

## From a segmentation mask (experimental)

ArchLang reads text, never images: the compiler is pure and has no image decoder, and it will not
gain one. If you already have a floor plan as a **label mask** (a PNG in which each pixel's value
is a class: wall, living room, bedroom and so on, the usual output of a segmentation model), there
is a path into ArchLang that keeps the image work outside the compiler:

1. a small Python tool, `tools/mask-to-plan/` in the repository, turns the mask into a **rooms-only
   Plan JSON**: room rectangles plus a `walls_from_rooms` statement, nothing else;
2. `archlang compile --from-json` compiles that JSON, and `walls from rooms` derives every wall from
   the rooms (an exterior ring on their outline, a partition on each shared edge);
3. `archlang validate` and `archlang takeoff` then work on the result like on any plan.

This is **experimental**: the tool is a recipe in the repository, not part of the npm package, and
its output is a starting point that you edit, not a finished plan.

For a photo, scan or PDF that is not a mask, see [Draw a plan from an image or PDF](from-an-image.md):
your own assistant reads the image and writes `.arch`, and ArchLang checks what it wrote.

A PDF floor plan has to be rasterised and segmented first, by you or your model; nothing here reads a
PDF or a photo.

### What the tool recovers, and what it does not

| Recovered | Not recovered |
|---|---|
| Each room as one or more rectangles, snapped to the plan grid | Doors, windows and openings |
| Room labels, from the class names you give | Furniture and fixtures |
| Wall positions, derived from the rooms by `walls from rooms` | Wall thicknesses (you pass them) |
| Floor areas: within 1 % on the worked example, when the mask meets the limits below | Curved, angled or freely polygonal rooms |

`walls from rooms` also takes a rectilinear `room polygon`, but this tool traces no rings yet, so a
room that is not one rectangle (an L-shaped living room) becomes several rectangles joined by `open
between` clauses: the partition between them is voided, and the space still reads as one room. `describe` counts each part's net
area separately and subtracts the voided partition's strip, so the parts' sum is a little under the
mask's area (under 1 % in the worked example).

### How it works

Every 4-connected region of a room class becomes one room. The labels are snapped to the grid (each
grid cell takes its most frequent label). Each room then grows across the walls around it, by half
the wall thickness, first along rows and then along columns. Two neighbouring rooms meet on the
wall's centre line, and an outer room reaches the exterior wall's centre line: that is where
`walls from rooms` puts the walls it derives. Only a run of wall cells at most one wall thick is
crossed, so a room never grows along a wall. Last, each grown region is cut into rectangles.

### Worked example

The example in `tools/mask-to-plan/example/` is a 1000 × 800 px mask at 10 mm per pixel
(`make_example.py` draws it from a known layout): an L-shaped living room, a kitchen, a hall, two
bedrooms and a bath, with 200 mm exterior walls and 100 mm partitions. The classes file names the
values:

```json
{
  "background": [0],
  "wall": [1],
  "rooms": { "2": "Living", "3": "Kitchen", "4": "Hall", "5": "Bedroom", "6": "Bath" }
}
```

Convert, then compile, check and count:

```bash
cd tools/mask-to-plan
pip install -r requirements.txt
python -I mask_to_plan.py example/mask.png example/classes.json --mm-per-px 10 --name "Mask example" \
  --grid 50 --exterior 200 --partition 100 -o example/plan.json --areas example/areas.json
archlang compile --from-json example/plan.json -o plan.svg
node json_to_arch.mjs example/plan.json > example/plan.arch
archlang validate example/plan.arch
archlang takeoff example/plan.arch --format md
node check_areas.mjs example/plan.json example/areas.json
```

`json_to_arch.mjs` writes the `.arch` source with the library's `planJsonToArch` (the CLI compiles
Plan JSON but does not print it as source). For the example it gives:

```arch
plan "Mask example" {
  units mm
  walls from rooms exterior 200 partition 100 { open between living_a and living_b }
  room id=living_a at (0,0) size 6000x4000 label "Living"
  room id=living_b at (0,4000) size 3000x3000
  room id=kitchen at (6000,0) size 3000x4000 label "Kitchen"
  room id=hall at (3000,4000) size 1500x3000 label "Hall"
  room id=bedroom at (4500,4000) size 2500x3000 label "Bedroom"
  room id=bedroom_2 at (7000,5500) size 2000x1500 label "Bedroom"
  room id=bath at (7000,4000) size 2000x1500 label "Bath"
}
```

`check_areas.mjs` compares each region's floor area in the mask (its room pixels times the pixel
area) with the net area `describe` reports for the rooms it became:

```text
Living       mask   30.93 m2  net   30.64 m2  0.95 %  (living_a, living_b)
Kitchen      mask   10.97 m2  net   10.97 m2  0.02 %  (kitchen)
Hall         mask    3.99 m2  net    3.99 m2  0.00 %  (hall)
Bedroom      mask    6.84 m2  net    6.84 m2  0.00 %  (bedroom)
Bedroom      mask    2.50 m2  net    2.50 m2  0.10 %  (bedroom_2)
Bath         mask    2.59 m2  net    2.59 m2  0.00 %  (bath)
worst 0.95 % (tolerance 2.0 %)
```

`validate` passes with warnings, as it should for a plan with no doors or windows yet: most rooms are
`W_ROOM_DISCONNECTED`, there is no entrance (`W_NO_ENTRANCE`), the rooms have no windows and the bath and
kitchen no fixtures. Add the doors and windows
as you would in any plan (`door between living_a and hall …`, `window on kitchen.top …`), and run
`validate` again.

### Limits

- **Axis-aligned only.** A wall at an angle snaps into a staircase of small rectangles whose shared
  edges are shorter than a partition, so the result does not compile (`E_PARTITION_TOO_SHORT`, once per
  pair). Rotate the mask so the walls run along the pixel grid first.
- **Every room fully walled, and the thicknesses you pass match the mask.** A room touching the image
  edge has no wall outside it, and a wall thicker or thinner than `--exterior` / `--partition` moves
  every edge it bounds: the floor areas then drift by several per cent. The tool measures the mask's
  own wall runs and warns in both cases; `check_areas.mjs` says by how much.
- **Adjacent rooms of one class need a wall between them.** Two bedrooms that touch with no wall pixels
  between them are one region, so they become one room.
- **The grid decides the accuracy.** `--grid` must be a whole number of pixels, and half of each wall
  thickness a whole number of grid steps (50 mm with 200 and 100 mm walls). A coarser grid moves room
  edges by up to half a step.
- **One storey per mask**, no courtyards (a hole in the building's outline), and rooms must cover the
  floor: a gap between rooms that is not wall becomes a hole the walls cannot close.
- **Regions under `--min-area-m2`** (0.5 m² by default) are dropped as noise.
- **The labels are your class names.** A class used for two separate regions (two bedrooms) gives two
  rooms, `bedroom` and `bedroom_2`, with the same label.

The tool is MIT-licensed like the rest of the repository and depends on numpy, SciPy and Pillow,
never on the compiler's package. Run it with `python -I` so nothing beside it is imported by accident.
