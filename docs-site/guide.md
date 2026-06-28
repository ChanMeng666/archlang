# What is ArchLang?

ArchLang is a small declarative language that compiles to a professional SVG floor
plan — think Typst/LaTeX, but for architecture. You describe a plan in plain text;
the compiler produces a clean, deterministic drawing.

```arch
plan "Studio 1BR" {
  units mm
  grid 50
  scale 1:50
  north up

  wall exterior thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  room id=living at (0,0) size 7000x6000 label "Living / Kitchen" uses living kitchen
  door at (1000,6000) width 1000 wall exterior hinge left swing in
  window at (2500,0) width 1800 wall exterior
  furniture bed at (4300,300) size 1500x2000 label "Bed"
  dim (0,6000)->(7000,6000) offset 600 text "7000"
}
```

## Core ideas

- **Millimetres, top-left origin, +x right, +y down** (matches SVG).
- **Explicit and parametric** — every element has exact coordinates and sizes, so
  the same source always renders the same drawing, and changing one number changes
  exactly one thing.
- **Deterministic** — there is no runtime, no clock, and no randomness; loops and
  conditionals expand while the drawing is built. See
  [ADR 0003](/adr/0003-expand-time-scripting).
- **Zero-dependency core** — the SVG path needs nothing installed. PNG, PDF, and
  angled-wall geometry are optional, lazily-loaded add-ons. See
  [ADR 0002](/adr/0002-optional-dep-geometry).
- **Reads its own plans** — `arch describe` returns rooms, areas, adjacencies, and a
  modelled access graph; `arch lint` flags habitability problems. Both are image-free
  facts and advice, never an auto-arranger. See [Analysis](/analysis).

## Install & use

```bash
npm install @chanmeng666/archlang
```

```bash
# Compile to any format:
arch compile plan.arch -o plan.svg              # SVG (default, zero-dep)
arch compile plan.arch -f dxf -o plan.dxf       # DXF (zero-dep)
arch compile plan.arch -f pdf -o plan.pdf       # PDF (needs optional pdfkit)
arch compile plan.arch -f png -o plan.png       # PNG (needs optional @resvg/resvg-js)

arch fmt plan.arch --write                       # format in place
arch explain E_LAYOUT_CYCLE                       # explain a diagnostic
```

Or call it as a library:

```js
import { compile } from "@chanmeng666/archlang";
const { svg, diagnostics, scene } = compile(source);
```

## Where to next

- The full [language reference](/reference) covers every element, value, and
  control-flow construct.
- [Relational placement](/relational) lets rooms position themselves relative to
  one another.
- [Furniture & fixtures](/furniture) covers placing pieces by coordinate or snapped
  against a wall, and the fixture symbol catalogue.
- [Analysis: describe & lint](/analysis) explains the semantic summary, the access
  graph, and the soundness rules — the channel an AI agent uses to verify a plan.
- The [error catalog](/errors) documents every diagnostic with a cause and a fix.
- [Examples](/examples) shows complete plans and their rendered output.
