<script setup>
import { EXAMPLES } from "./.vitepress/theme/examples-data.js";
// The hero is examples/one-room.arch verbatim — the smallest complete plan in the
// repository, and the same file the playground opens under "One room".
const hero = EXAMPLES["one-room"];
</script>

# What is ArchLang?

ArchLang is a deterministic DSL and compiler for floor plans. You describe a plan in
plain text; the compiler produces a clean, deterministic drawing in SVG, DXF or PDF,
with linting and geometric validation.

::: tip Want a plan rather than the language?
Your AI can write the ArchLang for you: [get a floor plan from your AI](/start).
:::

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
- **Reads its own plans** — `archlang describe` returns rooms, areas, adjacencies, and a
  modelled access graph; `archlang lint` flags habitability problems. Both are image-free
  facts and advice, never an auto-arranger. See [Analysis](/analysis).

## Install & use

```bash
npm i -g @chanmeng666/archlang     # puts `archlang` on your path
```

No install at all: write `npx -y @chanmeng666/archlang` wherever this page writes `archlang`. The
package also installs `arch` as an alias, but on Linux, macOS and Git Bash that name is the
coreutils command, so the docs never use it.

```bash
# Compile to any format:
archlang compile plan.arch -o plan.svg              # SVG (default, zero-dep)
archlang compile plan.arch -f dxf -o plan.dxf       # DXF (zero-dep)
archlang compile plan.arch -f txt                   # ASCII plan on stdout (zero-dep)
archlang compile plan.arch -f pdf -o plan.pdf       # PDF (needs optional pdfkit)
archlang compile plan.arch -f png -o plan.png       # PNG (needs optional @resvg/resvg-js)

# Inspect and correct it:
archlang describe plan.arch --json                   # rooms, areas, adjacency, access graph — as data
archlang lint plan.arch --json                       # architectural soundness warnings
archlang validate plan.arch --strict                 # the ship-gate: valid AND sound
archlang fix plan.arch --dry-run                     # preview the machine-applicable diagnostic fixes
archlang fmt plan.arch --write                       # format in place
```

That is a slice — the CLI has 20 commands. Ask it about any one of them with **`archlang <cmd> --help`**
(flags and worked examples for that command); `archlang help` lists them all and `archlang --version` prints
the version. The full, always-current list (every flag, format and exit code) is the
**[CLI reference](/cli)**, generated from the same manifest that `archlang manifest --json` serves — the
manifest the help itself is rendered from.

Or call it as a library (`npm install @chanmeng666/archlang` in your project):

```js
import { compile } from "@chanmeng666/archlang";
const { svg, diagnostics, scene } = compile(source);
```

[The JavaScript library](/javascript) shows the rest of the API and how to generate plans from
your own parameters.

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
- [The MCP server](/mcp) connects ArchLang to Claude, Cursor, VS Code and other MCP hosts.
- [ArchLang vs Mermaid](/vs-mermaid) compares the two text-diagram languages and says when to
  use which.
