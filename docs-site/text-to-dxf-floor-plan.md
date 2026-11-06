# From text to a DXF floor plan, open source

To turn text into a DXF floor plan, write the plan in ArchLang, an open-source (MIT) language for
floor plans, and compile it with `-f dxf`:
`npx -y @chanmeng666/archlang compile plan.arch -f dxf -o plan.dxf`. The file is ASCII DXF in
millimetres, with walls, doors, windows, floors and dimensions on separate named layers, so a CAD
program inserts the plan at true size and you can switch the layers on and off. DXF output needs
nothing beyond the npm package.

ArchLang was created by [Chan Meng](https://github.com/ChanMeng666). The same `.arch` file also
compiles to SVG, PDF and PNG.

## A plan written as text

A two-room cabin: a living room and a bedroom, with the walls derived from the rooms and an overall
dimension chain. Edit it below and it recompiles in your browser.

```arch
plan "Two-room cabin" {
  units mm
  grid 50
  north up
  room id=main  at (0,0)       size 4800x3600 label "Living" uses living
  room id=sleep right-of main  size 3000x3600 label "Bedroom" uses bedroom
  walls from rooms exterior 200 partition 100
  door on main.bottom at center width 900 swing into main
  door between main and sleep at 1800 from start width 800 swing into sleep
  window on main.top width 1800
  window on sleep.top width 1200
  dims auto overall
}
```

Before exporting, check it reads as intended:

```bash
npx -y @chanmeng666/archlang describe cabin.arch --json
npx -y @chanmeng666/archlang lint cabin.arch --json
```

`describe` reports 2 rooms, 2 doors and 2 windows; 28.08 m² measured on the wall centrelines
(living 17.28 m², bedroom 10.8 m²) and 25.5 m² net; and both rooms reachable from the front door.
`lint` reports no warnings. The bundled
[studio example](https://playground.archlang.uk/examples/studio.html) is a larger, furnished plan
of the same kind.

## Export it

```bash
npx -y @chanmeng666/archlang compile cabin.arch -f dxf -o cabin.dxf
```

The command writes `cabin.dxf` beside the source. Add `--json` and the command prints a JSON
result (`ok`, the output path, the byte count and any diagnostics), which is what an agent reads. In the [playground](https://playground.archlang.uk),
the download menu has a DXF option that writes the same kind of file from the browser.

## What the DXF carries

As the [language reference](/reference) states it:

- **Format and units.** ASCII DXF headed AutoCAD 2000 (`AC1015`). The header declares
  `$INSUNITS` 4 (millimetres) and `$MEASUREMENT` 1 (metric), so the plan is inserted at true size.
- **Layers by discipline**, in the NCS style: `A-` for architecture (`A-DOOR`, `A-GLAZ`,
  `A-FLOR`, `A-ANNO-DIMS`, and others), `L-` and `C-` for landscape and civil ground, and `V-` for
  an axonometric view.
- **Walls on two layers.** A wall of category `exterior` goes on `A-WALL-EXTR` and every other wall
  on `A-WALL-INTR`, so you can freeze the partitions and keep the envelope. A remodel's demolished
  and new walls go on `A-WALL-DEMO` and `A-WALL-NEWW`.
- **Blocks.** Each door, window and catalogued fixture is a `BLOCK` with one `INSERT`, named by what
  it is, such as `DOOR-HINGED-900` or `WINDOW-FIXED-1500`. One door shape used four times is one
  block with four inserts.
- **Dimensions.** Every `dim` and `dims auto` figure is a `DIMENSION` entity that measures along its
  own line.

The cabin's file uses seven of those layers: `A-WALL-EXTR`, `A-WALL-INTR`, `A-DOOR`, `A-GLAZ`,
`A-FLOR`, `A-ANNO-DIMS` and `A-ANNO-TEXT`. Compiling the same source again gives the same bytes.

## Where it opens

Any CAD program that reads DXF. The repository's CI reads every exported file with
[ezdxf](https://ezdxf.mozman.at/), an independent DXF reader. The file has no handles and no
`OBJECTS` section, which a stricter reader may ask for, so open it in the CAD program you use before
you rely on it.

The DXF holds the same 2D drawing as the SVG, as lines, arcs, text, blocks and dimensions; walls
arrive as linework on their layers, not as wall objects. The plan is a concept or scheme-stage
drawing, not a construction document.

## FAQ

### Can I convert text to a DXF floor plan for free?

Yes. ArchLang is MIT-licensed and runs from npm with `npx`, so
`npx -y @chanmeng666/archlang compile plan.arch -f dxf -o plan.dxf` needs no account and no
licence fee.

### What units does the DXF use?

Millimetres. The header sets `$INSUNITS` to 4 and `$MEASUREMENT` to 1 (metric), and every size in
the `.arch` source is in millimetres, so a 4800 mm room is 4800 drawing units long.

### Can an AI agent produce the DXF?

Yes. An agent with a shell runs the same `compile … -f dxf` command after it has checked the plan
with `describe` and `lint`. Neither MCP server writes DXF; DXF and PDF come from the CLI or the
playground, and the MCP `link` tool opens the plan in the playground, where the DXF can be
downloaded.

### Does it export DWG or IFC?

No. The formats are SVG, DXF, PDF, PNG and an ASCII preview.

## Next

- [Floor plans as code](/floor-plans-as-code): writing and compiling a plan.
- [Language reference](/reference): every statement, and the export details in full.
- [Generate a floor plan with a coding agent](/floor-plan-with-a-coding-agent): let the agent write the plan.
