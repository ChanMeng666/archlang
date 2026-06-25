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

## Values & expressions

Anywhere a number is expected (coordinates, sizes, widths, thickness, offsets)
you may write an **arithmetic expression**:

```
room at (0, 0) size (3000) x (3000 - 500)
furniture bed at (WALL + 300, 300) size 1500x2000
```

- **Operators:** `+ - * / %`, unary `-`, and parentheses `( … )`.
- **Precedence:** `* / %` bind tighter than `+ -`; use parens to override.
- **Numbers are non-negative literals**; write `-x` for negation.
- Division/modulo by zero is a compile error.
- **Sizes** accept either the `WxH` literal (`4000x3000`) or `<expr> x <expr>`
  (`(2000+W) x H`). The bare `x` separates width and height.

### Bindings — `let`

Bind a name to a value with `let`; later statements can use it:

```
let WALL = 200
let W = 4000
let H = W - 1000
room at (0, 0) size W x H
```

- Evaluated **top to bottom**; a name must be defined before it is used
  (no forward references).
- Re-defining a name in the same scope is an error.
- Unknown names produce a `did you mean …?` hint.

### Components

Define a reusable, parameterised sub-plan with `component`, then instantiate it
by name. A component body may contain elements, `let`s, and calls to earlier
components (composition).

```
component bath(x, y) {
  room at (x, y) size 2000x2000 label "Bath"
  door at (x + 1000, y) width 700 wall exterior
}

bath(0, 0)
bath(3000, 0)
```

- **Scope:** a component body sees its **parameters**, its own `let`s, and the
  **plan-level** `let`s (plan scope is global) — but not the caller's locals.
- Auto-assigned ids stay unique across instantiations (the whole drawing is
  numbered per kind), so two `bath(...)` calls yield `room_1`/`room_2`, etc.
- Infinite recursion is bounded and reported as an error.

See [`examples/parametric.arch`](../examples/parametric.arch) for a worked
example using all three.

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

### Column

```
column [id=<id>] at (x,y) size <w>x<h>
```

A solid structural column (filled square). Useful for grids of columns in
larger plans.

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
{
  svg: string;
  errors: CompileError[];          // derived from diagnostics (severity "error")
  warnings: CompileWarning[];      // derived from diagnostics (severity "warning")
  diagnostics: Diagnostic[];       // every problem, with byte-offset spans
  ast?: PlanNode;
}
```

- `errors` are **fatal**; when present, `svg` is `""`. Each carries `message`
  and (when known) `line`/`col`.
- `warnings` are advisory (e.g. *door does not lie on any wall*, *rooms overlap*)
  and do not block rendering.
- `errors`/`warnings` are **projections** of `diagnostics` — kept for back-compat.

### Diagnostics

The compiler never throws on bad source: it recovers from syntax errors and
reports **all** problems in a single pass. Each is a `Diagnostic`:

```ts
interface Span { start: number; end: number; }          // byte offsets into source
type Severity = "error" | "warning";
interface Diagnostic {
  severity: Severity;
  message: string;
  span?: Span;       // source location, when known
  code?: string;     // stable machine code, e.g. "E_ROOM_SIZE"
  hints?: string[];  // optional "did you mean …?" suggestions
}
```

`formatDiagnostic(source, d)` (also exported) renders a caret-framed snippet:

```text
error[E_ROOM_SIZE]: room "bed" must have a positive size
  --> 1:27
   |
 1 | room id=bed at (0,0) size 0x4000
   |                           ^^^^^^
   = help: did you mean 3000x4000?
```

`offsetToLineCol(source, offset)` converts a byte offset to a 1-based
`{ line, col }`. The `arch` CLI prints these frames for every diagnostic.

Options: `width` (px for the `<svg>`; height derived from aspect ratio) and
`noCache` (bypass the memoization cache).

## Worked example

See [`examples/studio.arch`](../examples/studio.arch) and
[`examples/two-bed.arch`](../examples/two-bed.arch), or try the
[playground](../playground/index.html).

## Architecture (for contributors)

The compiler is a pipeline: **lex → parse → resolve(AST → IR) → render**.
Every element type (wall, room, door, …) is a single self-contained module in
`src/elements/` implementing a common `ElementDef` (`parse` / `resolve` /
`render`); parse, resolve, and render all iterate the registry rather than a
hard-coded switch. `resolve()` (in `src/ir.ts`) is the single place semantics
live — grid-snap, id assignment, opening-hosting, and checks — and it produces
a new immutable IR (the AST is never mutated). `render()` consumes the IR only,
which keeps it backend-ready.

**To add an element type:** write one `src/elements/<name>.ts` exporting an
`ElementDef`, then add one `register()` line in `src/elements/index.ts`. No
edits to the parser, resolver, or renderer cores are needed — `column` is the
worked example.
