# Examples

Complete plans from the repository's [`examples/`](https://github.com/chanmeng666/archlang/tree/main/examples)
directory, with their rendered SVG output. Each compiles deterministically to the
drawing shown.

## Studio (1BR)

The flagship example, and a tour of v1.3: rooms tagged with **`uses`**, a cased
**`opening`** linking the living space to the hall, real **fixture symbols** (sink,
counter, stove, fridge, shower, basin, WC), and doors whose swings stay clear of the
furniture. It is **lint-clean** under the default profile and import-free. Run
`arch describe` / `arch lint` on it to see the [analysis](/analysis) in action.

<img src="/examples/studio.svg" alt="Studio 1BR floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Two-bedroom flat

A larger plan with a central corridor, multiple rooms, and several openings —
absolute placement at a real apartment's scale, with `north` reoriented.

<img src="/examples/two-bed.svg" alt="Two-bedroom flat floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Parametric

Uses `let` bindings, a value-function, an array, a scoped `set`, a `for` loop, and
string interpolation to generate a row of repeated units — showing that
[scripting](/reference#control-flow) expands at compile time into a fixed,
deterministic drawing.

<img src="/examples/parametric.svg" alt="Parametric floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Themed

A custom `theme { … }` block with a brick wall **material** (hatch) — the same
geometry, restyled. See [theming](/reference#theming) and
[materials](/reference#wall).

<img src="/examples/themed.svg" alt="Themed floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Relational

Rooms positioned relative to one another with `right-of` / `below`, `align`, and
`gap` — resolved to absolute coordinates by deterministic arithmetic, not an
optimizer (see [relational placement](/relational)).

<img src="/examples/relational.svg" alt="Relational floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />
