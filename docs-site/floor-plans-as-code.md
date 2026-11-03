# Floor plans as code

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666): you write `.arch` text and compile it to SVG, DXF or
PDF.

"Floor plans as code" means the plan is a text file. Rooms, walls, doors and windows are written
as statements with sizes in millimetres, and a compiler turns that text into a drawing. Because
the source is text, it goes in git, a change shows up as a diff, and the same file gives the same
drawing byte for byte every time it is compiled.

## A floor plan diagram as code

This is a whole plan: four rooms, the walls derived from the rooms, four doors, two windows and a
bath. Edit it below and it recompiles in your browser.

```arch
plan "Small flat" {
  units mm
  grid 50
  north up
  room id=living at (0,0)        size 5000x4000 label "Living" uses living
  room id=bed    right-of living size 3500x4000 label "Bedroom" uses bedroom
  room id=hall   below living    size 5000x1500 label "Hall" uses hall
  room id=bath   right-of hall   size 3500x1500 label "Bath" uses bath
  walls from rooms exterior 200 partition 100
  door on hall.left at center width 900 swing into hall
  door between hall and living at 2500 from start width 900 swing into living
  door between living and bed at 2000 from start width 800 swing into bed
  door between hall and bath at 700 from start width 800 swing into bath
  window on living.top width 1800
  window on bed.top width 1500
  furniture bathtub in bath anchor top flush size 1700x700
}
```

Only `living` has coordinates. The other rooms are placed `right-of` or `below` a neighbour
([relational placement](/relational)), `walls from rooms` draws the exterior shell and a partition
on every shared edge, and each door is hosted by the two rooms it joins. Change the living room's
width and the bedroom, the walls and the doors move with it.

## From text to a floor plan

Save the source as `flat.arch`, then compile, check and export it from the command line:

```bash
npx -y @chanmeng666/archlang compile flat.arch -o flat.svg          # SVG drawing
npx -y @chanmeng666/archlang compile flat.arch -f dxf -o flat.dxf   # DXF for CAD
npx -y @chanmeng666/archlang describe flat.arch --json              # rooms, areas, doors, as JSON
npx -y @chanmeng666/archlang lint flat.arch --json                  # habitability warnings
```

For the plan above, `describe` reports 4 rooms and 46.75 m² measured on the wall centrelines,
every room reachable from the front door, and the bath reached from the hall rather than through
the bedroom. `lint` reports no warnings. Neither needs an image: they read the plan, not the
drawing.

PDF output (`-f pdf`) needs the optional `pdfkit` package, and PNG (`-f png`) needs
`@resvg/resvg-js`; SVG, DXF and the ASCII preview (`-f txt`) need nothing beyond the package.

## What the text gives you

- **Version control.** A plan is a few dozen lines that diff and merge like any other source file.
- **Exact numbers.** Sizes are millimetres and areas are computed from the room shapes, not
  measured off a picture.
- **Repeatable output.** There is no clock and no randomness in the compiler, so a plan compiled
  twice produces identical bytes.
- **A format an AI model can write.** The whole language fits in [one page](/spec), and the
  compiler's errors carry a fix. See [using it from an agent](/agents).

## FAQ

### Can I turn text into a floor plan?

Yes. Write the plan as `.arch` text and run `npx -y @chanmeng666/archlang compile plan.arch -o plan.svg`. The
compiler draws the walls, doors, windows, room labels and areas. You can also paste the text into
the [playground](https://playground.archlang.uk) and see the drawing without installing anything.

### What file formats can a floor plan written as code be exported to?

SVG, DXF, PDF and PNG, plus an ASCII preview in the terminal. SVG and DXF need no extra packages;
PDF needs `pdfkit` and PNG needs `@resvg/resvg-js`.

### Do I have to write coordinates for every room?

No. One room needs a position; the others can be placed `right-of`, `left-of`, `above` or `below`
another room, and `walls from rooms` derives the walls from the room layout. See
[relational placement](/relational).

### Is ArchLang free to use?

Yes. ArchLang is open source under the MIT licence. The source is on
[GitHub](https://github.com/ChanMeng666/archlang) and the package is
[`@chanmeng666/archlang`](https://www.npmjs.com/package/@chanmeng666/archlang) on npm.

## Next

- [Guide](/guide): the language from the start.
- [Examples](/examples): every example plan in the repository, live.
- [A floor plan DSL](/floor-plan-dsl): what the language has in it, including loops and variables.
