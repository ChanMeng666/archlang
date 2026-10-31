# Import a plan from a segmentation mask (experimental)

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

A PDF floor plan has to be rasterised and segmented first, by you or your model; nothing here reads a
PDF or a photo.

## What the tool recovers, and what it does not

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

## How it works

Every 4-connected region of a room class becomes one room. The labels are snapped to the grid (each
grid cell takes its most frequent label). Each room then grows across the walls around it, by half
the wall thickness, first along rows and then along columns. Two neighbouring rooms meet on the
wall's centre line, and an outer room reaches the exterior wall's centre line: that is where
`walls from rooms` puts the walls it derives. Only a run of wall cells at most one wall thick is
crossed, so a room never grows along a wall. Last, each grown region is cut into rectangles.

## Worked example

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

## Limits

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
