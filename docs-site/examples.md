# Examples

Complete plans from the repository's [`examples/`](https://github.com/chanmeng666/archlang/tree/main/examples)
directory, with their rendered SVG output. Each compiles deterministically to the
drawing shown.

## Studio (1BR)

A one-bedroom studio: exterior shell, a partition, a room with a computed area
label, a hosted door and window, furniture, and a dimension line.

<img src="/examples/studio.svg" alt="Studio 1BR floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Two-bedroom flat

A larger plan with a central corridor, multiple rooms, and several openings.

<img src="/examples/two-bed.svg" alt="Two-bedroom flat floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Parametric

Uses a `for` loop and string interpolation to generate repeated elements — showing
that scripting expands at compile time into a fixed, deterministic drawing.

<img src="/examples/parametric.svg" alt="Parametric floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Themed

A dark theme with a brick wall material (hatch).

<img src="/examples/themed.svg" alt="Themed floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />

## Relational

Rooms positioned relative to one another with `right-of` / `below` (see
[relational placement](/relational)).

<img src="/examples/relational.svg" alt="Relational floor plan" style="max-width:100%;border:1px solid #ddd;border-radius:8px" />
