# ArchLang vs Mermaid for floor plans

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666): you write `.arch` text and compile it to SVG, DXF or
PDF.

[Mermaid](https://mermaid.js.org) has no floor-plan diagram type. Its diagrams — flowcharts,
sequence, class, state, ER, Gantt, architecture and others — lay out boxes and arrows
automatically, and none of them draws walls, doors and windows at a real size. A floor-plan syntax
for Mermaid has been requested in
[mermaid-js/mermaid#6134](https://github.com/mermaid-js/mermaid/issues/6134) ("Add Floorplan
Syntax"), which is open as of November 2026.

ArchLang is not part of Mermaid and is not a Mermaid plugin. It is a separate text language with
the same idea — a diagram you write as text and keep next to your code — applied to floor plans.

## The same plan, in each

A kitchen open to a dining room, with one front door. In Mermaid the nearest you can get is a
graph of which room connects to which:

```mermaid
flowchart LR
  Entrance --> Dining
  Dining --- Kitchen
```

That records the connections, but no size, position, wall or window. In ArchLang the plan carries
all of them, in millimetres. Edit it below and it recompiles:

```arch
plan "Kitchen and dining" {
  units mm
  grid 50
  room id=kitchen at (0,0)          size 3000x3600 label "Kitchen" uses kitchen
  room id=dining  right-of kitchen  size 4000x3600 label "Dining" uses dining
  walls from rooms exterior 200 partition 100 {
    open between kitchen and dining width 1800
  }
  door on dining.bottom at center width 900 swing into dining
  window on kitchen.top width 1200
  window on dining.top width 1800
  furniture kitchen_sink against kitchen.top
  furniture stove against kitchen.left
  furniture counter against kitchen.left offset 2600
  furniture dining_table in dining centered size 1600x900
}
```

`npx -y @chanmeng666/archlang describe` on this source reports a 10.8 m² kitchen and a 14.4 m²
dining room, and that the kitchen is reached from the front door through the dining room — the
same connection the Mermaid graph states, here derived from the drawing.

## Side by side

| | Mermaid | ArchLang |
| --- | --- | --- |
| What it draws | Flowcharts, sequence, class, state, ER, Gantt and other diagrams | Floor plans: walls, rooms, doors, windows, furniture, dimensions, stairs |
| Layout | Automatic | Exact: coordinates and sizes in millimetres, or rooms placed relative to each other |
| Measurements | None | Room areas, door widths, walking distances, reported by `describe` |
| Checks | Syntax | Syntax, plus advisory warnings such as a windowless bedroom or a narrow door (`lint`) |
| Output | SVG; PNG and PDF through mermaid-cli | SVG, DXF, PDF, PNG, ASCII |
| Renders in GitHub Markdown | Yes, natively | No; render fences to images with `archlang md` or the `arch-render` GitHub Action |
| Licence | MIT | MIT |

## When to use which

Use **Mermaid** for the diagrams it has: process flows, sequences, data models, timelines. It is
built into GitHub, GitLab and many documentation tools, so a fence renders with nothing to install.

Use **ArchLang** when the diagram is a floor plan: when sizes, areas or door positions matter, when
the plan should open in CAD (DXF), or when an AI model writes the plan and needs to check it.
A bubble diagram of which rooms connect is fine in Mermaid; once it needs walls, it is a floor plan.

## Floor plans in Markdown

GitHub does not render `arch` fences. Two ways to put the drawing in a Markdown file:

```bash
npx -y @chanmeng666/archlang md notes.md -o notes.out.md -f svg   # each arch fence becomes an image link
```

The `md` command writes `notes.out.md` with every `arch` fence replaced by an image link, and the
SVG files beside it. In CI, the `ChanMeng666/archlang/.github/actions/arch-render` GitHub Action does
the same for every Markdown file in a repository. In VS Code, the
[ArchLang extension](https://marketplace.visualstudio.com/items?itemName=ChanMeng.archlang) renders
`arch` fences in the built-in Markdown preview, and on this site every `arch` fence is a live,
editable drawing.

## FAQ

### Can Mermaid draw floor plans?

No. Mermaid has no floor-plan diagram type; a request for one,
[mermaid-js/mermaid#6134](https://github.com/mermaid-js/mermaid/issues/6134), is open. A flowchart
can show which rooms connect, but not their sizes, walls or openings.

### Is there a Mermaid-like language for floor plans?

ArchLang is a text language for floor plans that you write in a fenced code block, like Mermaid.
It compiles to SVG, DXF or PDF, and it is a separate project from Mermaid.

### Can I render ArchLang in GitHub Markdown?

Not natively. Convert the fences to images with `npx -y @chanmeng666/archlang md`, or with the
`arch-render` GitHub Action in CI, and commit the result.

### Can I use Mermaid and ArchLang in the same document?

Yes. They use different fence languages (`mermaid` and `arch`), and the `md` command and the
`arch-render` Action touch the `arch` fences and leave the rest of the file as it is.

## Next

- [Floor plans as code](/floor-plans-as-code): writing and compiling a plan.
- [Examples](/examples): larger plans, live.
- [Embed a floor plan in a web page](/embed): show a plan on any page.
