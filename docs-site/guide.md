<script setup>
import { EXAMPLES } from "./.vitepress/theme/examples-data.js";
// The hero is examples/one-room.arch verbatim — the smallest complete plan in the
// repository, and the same file the playground opens under "One room".
const hero = EXAMPLES["one-room"];
</script>

# What is ArchLang?

ArchLang is a small declarative language that compiles to a professional SVG floor
plan — think Typst/LaTeX, but for architecture. You describe a plan in plain text;
the compiler produces a clean, deterministic drawing.

**Edit the source below** and watch it recompile live — this runs the real compiler
in your browser. It is the whole of
[`examples/one-room.arch`](https://github.com/chanmeng666/archlang/tree/main/examples/one-room.arch):
a shell, one room that says what it is for, a door and a window pinned to the wall by
position rather than coordinate, and one dimension chain. Change `5000x4000` and watch
the dimension follow.

<ArchLive :src="hero" :rows="18" />

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
arch compile plan.arch -f txt                   # ASCII plan on stdout (zero-dep)
arch compile plan.arch -f pdf -o plan.pdf       # PDF (needs optional pdfkit)
arch compile plan.arch -f png -o plan.png       # PNG (needs optional @resvg/resvg-js)

# Inspect and correct it:
arch describe plan.arch --json                   # rooms, areas, adjacency, access graph — as data
arch lint plan.arch --json                       # architectural soundness warnings
arch validate plan.arch --strict                 # the ship-gate: valid AND sound
arch fix plan.arch --dry-run                     # preview the machine-applicable diagnostic fixes
arch fmt plan.arch --write                       # format in place
```

That is a slice — the CLI has 20 commands. Ask it about any one of them with **`arch <cmd> --help`**
(flags and worked examples for that command); `arch help` lists them all and `arch --version` prints
the version. The full, always-current list (every flag, format and exit code) is the
**[CLI reference](/cli)**, generated from the same manifest that `arch manifest --json` serves — the
manifest the help itself is rendered from.

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
