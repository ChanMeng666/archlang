# ArchLang Language Reference (v0.1)

ArchLang is a small declarative language that compiles to a professional SVG
floor plan. It is **explicit and parametric**: you give every element exact
coordinates and sizes in millimetres, so the same source always renders the
same drawing, and changing one number changes exactly one thing.

- **Unit:** millimetres (integers recommended).
- **Coordinate system:** origin top-left, **+x** right, **+y** down (matches SVG).
- **Comments:** `#` to end of line.
- **Strings:** double-quoted; `\"` and `\\` escapes supported.

A program is a single `plan` block:

```
plan "My Home" {
  <statements…>
}
```

## Plan-level settings

| Statement | Meaning | Default |
|-----------|---------|---------|
| `units mm` | Measurement unit (only `mm` in v0.1). | `mm` |
| `grid <n>` | Snap module in mm. All coordinates round to the nearest multiple. `0` disables. | `0` |
| `scale 1:50` | Printed scale, shown in the title block. | none |
| `north up\|down\|left\|right\|<deg>` | North direction for the north arrow. | `up` |

## Elements

### Wall

```
wall <kind> thickness <mm> { (x,y) (x,y) … [close] }
wall id=<id> <kind> thickness <mm> { … }
```

A polyline of ≥2 points, drawn with the given thickness and a poché hatch.
`close` connects the last point back to the first (use for exterior shells).
`<kind>` is a free label (e.g. `exterior`, `partition`).

### Room

```
room [id=<id>] at (x,y) size <w>x<h> [label "<text>"]
```

A rectangle. The compiler prints the `label` and the **computed area** (m²).
Rooms describe space; walls are drawn separately.

### Door

```
door [id=<id>] at (x,y) width <mm> [wall <ref>] [hinge left|right] [swing in|out]
```

Drawn as an opening in the host wall plus a leaf and a quarter-circle swing arc.
`wall <ref>` pins the door to a wall by `id` or `kind`; otherwise the nearest
wall hosts it. `hinge` is relative to the wall's direction. Defaults: `hinge
left`, `swing in`.

### Window

```
window [id=<id>] at (x,y) width <mm> [wall <ref>]
```

An opening with the standard double-line glazing symbol.

### Furniture

```
furniture <kind> [id=<id>] at (x,y) size <w>x<h> [label "<text>"]
```

A schematic labelled rectangle (bed, sofa, counter…).

### Dimension

```
dim (x1,y1)->(x2,y2) [offset <mm>] [text "<override>"]
```

A dimension line offset perpendicular from the measured segment, with tick
marks and a label. Without `text`, the measured length (mm) is shown.

### Title block

```
title {
  project "<name>"
  drawn_by "<name>"
  date "<date>"
}
```

Rendered as a title block in the lower-right corner (with `scale` if set).

## Compilation result

`compile(source, opts?)` returns:

```ts
{ svg: string; errors: CompileError[]; warnings: CompileWarning[]; ast?: PlanNode }
```

- `errors` are **fatal**; when present, `svg` is `""`. Each carries `message`
  and (when known) `line`/`col`.
- `warnings` are advisory (e.g. *door does not lie on any wall*, *rooms overlap*)
  and do not block rendering.

Options: `width` (px for the `<svg>`; height derived from aspect ratio) and
`noCache` (bypass the memoization cache).

## Worked example

See [`examples/studio.arch`](../examples/studio.arch) and
[`examples/two-bed.arch`](../examples/two-bed.arch), or try the
[playground](../playground/index.html).
