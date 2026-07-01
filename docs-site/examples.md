<script setup>
import { EXAMPLES } from "./.vitepress/theme/examples-data.js";
</script>

# Examples

Complete plans from the repository's [`examples/`](https://github.com/chanmeng666/archlang/tree/main/examples)
directory, **live and editable** — edit the source on the left and the SVG on the
right recompiles instantly (client-side, deterministic). Hit **Open in Playground**
to keep going with the full editor.

## Studio (1BR)

The flagship example, and a tour of v1.3: rooms tagged with **`uses`**, a cased
**`opening`** linking the living space to the hall, real **fixture symbols** (sink,
counter, stove, fridge, shower, basin, WC), and doors whose swings stay clear of the
furniture. It is **lint-clean** under the default profile and import-free. Run
`arch describe` / `arch lint` on it to see the [analysis](/analysis) in action.

<ArchLive :src="EXAMPLES['studio']" :rows="22" />

## Two-bedroom flat

A larger plan with a central corridor, multiple rooms, and several openings —
absolute placement at a real apartment's scale, with `north` reoriented.

<ArchLive :src="EXAMPLES['two-bed']" :rows="16" />

## Parametric

Uses `let` bindings, a value-function, an array, a scoped `set`, a `for` loop, and
string interpolation to generate a row of repeated units — showing that
[scripting](/reference#control-flow) expands at compile time into a fixed,
deterministic drawing.

<ArchLive :src="EXAMPLES['parametric']" :rows="20" />

## Themed

A custom `theme { … }` block with a brick wall **material** (hatch) — the same
geometry, restyled. See [theming](/reference#theming) and
[materials](/reference#wall).

<ArchLive :src="EXAMPLES['themed']" :rows="16" />

## Relational

Rooms positioned relative to one another with `right-of` / `below`, `align`, and
`gap` — resolved to absolute coordinates by deterministic arithmetic, not an
optimizer (see [relational placement](/relational)).

<ArchLive :src="EXAMPLES['relational']" :rows="14" />
