# ArchLang Language Reference (v0.8)

ArchLang is a small declarative language that compiles to a professional SVG
floor plan. It is **explicit and parametric**: you give every element exact
coordinates and sizes in millimetres, so the same source always renders the
same drawing, and changing one number changes exactly one thing.

Since v0.8 it is also a small, pure **scripting language** — values, control
flow, functions, arrays, and string interpolation — but it stays **expand-time
and deterministic**: every loop, conditional, and function call is evaluated
while the drawing is built (there is no runtime, no I/O, no clock), so the same
source always produces byte-identical output.

- **Unit:** millimetres (integers recommended).
- **Coordinate system:** origin top-left, **+x** right, **+y** down (matches SVG).
- **Comments:** `#` to end of line.
- **Strings:** double-quoted; `\"`, `\\`, `\n` escapes supported, plus `{…}`
  interpolation (see [Strings & interpolation](#strings--interpolation)).

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

Expressions appear anywhere a value is expected (coordinates, sizes, widths,
thickness, offsets, labels). A value is one of:

| Type | Examples |
|------|----------|
| **number** (unitless mm) | `3000`, `12.5`, `WALL + 300` |
| **boolean** | `true`, `false`, `a < b` |
| **string** | `"Bed"`, `"Studio {i}"` |
| **array** | `[1, 2, 3]`, `0..n` (a range) |
| **function** | `let area(w, h) = w * h` |

```
room at (0, 0) size (3000) x (3000 - 500)
furniture bed at (WALL + 300, 300) size 1500x2000
```

Where a **number** is specifically required (a coordinate, a size, …), a
non-number value is a type error with a clear diagnostic — it never crashes the
compile.

### Operators

Lowest-to-highest precedence (use parentheses to override):

| Group | Operators |
|-------|-----------|
| logical or | `\|\|` |
| logical and | `&&` |
| equality | `==`  `!=` |
| comparison | `<`  `>`  `<=`  `>=` |
| range | `a..b` |
| additive | `+`  `-` |
| multiplicative | `*`  `/`  `%` |
| unary | `-x`  `+x`  `!x` |
| postfix | `arr[i]`  `f(args)` |

- `&&` / `||` **short-circuit** (the right side is skipped when the result is
  already known).
- `==` / `!=` compare values of any type (different types are never equal;
  arrays compare deeply); the ordering operators require numbers.
- **Numbers are non-negative literals**; write `-x` for negation. Division /
  modulo by zero is a compile error.
- **Sizes** accept either the `WxH` literal (`4000x3000`) or `<expr> x <expr>`
  (`(2000+W) x H`). The bare `x` separates width and height.

### Arrays & ranges

```
let widths = [3000, 3500, 4000]
let n = widths[1]              # indexing (0-based; out-of-range is an error)
for i in 0..3 { … }           # 0..3 is the array [0, 1, 2] (half-open)
```

### Conditional expression

`if` is also an **expression** that yields a value (the `else` is required):

```
let w = if compact { 2400 } else { 3000 }
```

### Strings & interpolation

A string may embed `{ <expr> }`; each hole is evaluated and converted to text:

```
room at (x, 0) size W x H label "Studio {i + 1}"
dim (0,0)->(L,0) offset 700 text "{L / 1000} m"
```

- Literal braces are written `\{` and `\}`.
- Interpolated text is **escaped at output**, so labels are always XSS-safe.

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
- Re-defining a name in the same scope is an error. An inner scope (a component
  body or a control-flow block) may **shadow** an outer name.
- Unknown names produce a `did you mean …?` hint.

**Reassignment.** Once a name is bound, `name = <expr>` updates it (this is how a
`while` loop makes progress — see [Control flow](#control-flow)). Assigning a
name that was never `let`-bound is an error.

```
let i = 0
i = i + 1            # reassigns the existing binding
```

### Functions

`let NAME(params) = <expr>` defines a pure **value-function** (a closure over the
names visible where it is defined):

```
let area(w, h) = w * h
let scaled(x)  = x * GRID          # captures the outer `GRID`
room at (0, 0) size area(40, 30) x 100
```

- A function may call itself; recursion is bounded (deep recursion is reported,
  not a crash).
- Calling with the wrong number of arguments is an error.
- This is distinct from `component`, which emits **elements** rather than
  returning a value.

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
example using all of these.

## Control flow

`for`, `if`, and `while` **expand** into the element stream while the drawing is
built — there is no runtime. Each block is its own scope.

```
for i in 0..COUNT {
  let x = i * W
  room at (x, 0) size W x H label "Unit {i + 1}"
}

if rooms > 1 {
  wall partition thickness 100 { (W, 0) (W, H) }
} else {
  furniture sofa at (300, 300) size 2000x900
}

let i = 0
while i < COUNT {
  column at (i * 600, 0) size 300x300
  i = i + 1                       # progress (see Reassignment)
}
```

- `for x in <array|range>` binds `x` for each item, in order.
- `if <cond> { … } [else { … }]` expands one branch; the condition must be a
  boolean.
- `while <cond> { … }` repeats until the condition is false; it is capped at
  10,000 iterations (a runaway loop is reported, not hung).

## Built-in functions

A frozen set of pure helpers is always in scope (a `let` of the same name
shadows one):

| Function | Result |
|----------|--------|
| `min(a, b, …)` / `max(a, b, …)` | smallest / largest number |
| `abs(x)` | absolute value |
| `sqrt(x)` | square root (negative input is an error) |
| `floor(x)` / `ceil(x)` / `round(x)` | rounding |
| `len(x)` | length of an array or string |
| `str(x)` | value rendered as a string |

```
column at (max(0, x - GAP), 0) size 300x300
room at (0,0) size 1000x1000 label "Room {floor(area / 1000000)} m²"
```

## Set rules

`set <kind>(attr: value, …)` overrides the default for subsequent elements of
that kind, scoped to the enclosing block. An attribute the element states
explicitly always wins.

```
set door(swing: out)             # later doors swing out…
door at (1000, 0) width 800      # → out
door at (3000, 0) width 800 swing in   # explicit → in
```

Currently `door` supports `swing` (`in`/`out`) and `hinge` (`left`/`right`).

## Elements

### Wall

```
wall <kind> thickness <mm> [material <name>] { (x,y) (x,y) … [close] }
wall id=<id> <kind> thickness <mm> [material <name>] { … }
```

A polyline of ≥2 points, drawn with the given thickness and a poché hatch.
`close` connects the last point back to the first (use for exterior shells).
`<kind>` is a free label (e.g. `exterior`, `partition`).

Orthogonal walls are **boolean-unioned** so corners and T-junctions render as
one clean outline with no internal seams. (Angled walls fall back to a
per-segment outline.)

**Materials** select the hatch pattern: `poche` (default), `concrete`, `brick`,
`insulation`, `tile`, `none`. An unknown material warns and uses the default.

```
wall exterior thickness 250 material brick { … }
```

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

## Theming

A `theme { … }` directive overrides colours, line weight, and font. Resolution
order (later wins): built-in defaults → the `theme` directive →
`CompileOptions.theme` (programmatic).

```
theme {
  background: "#1e2127"
  wall:       "#e8e8e8"   # wall outline
  wallFill:   "#3a3f4b"   # poché base
  wallHatch:  "#5a6172"   # poché lines
  room:       "#272b33"
  roomLabel:  "#f0f0f0"
  dim:        "#6cb6ff"
  annotation: "#cfd3da"
  font:       "Georgia, serif"
  lineWeight: 1.3          # multiplier on all stroke widths
}
```

Friendly keys (`wall`, `room`, `furniture`, `wallFill`, `wallHatch`, `door`,
`window`, `background`) alias the canonical theme fields; you can also use the
canonical names (`wallStroke`, `roomFill`, …). Unknown keys warn and are
ignored. Colours are strings, `lineWeight` is a number, `font` is a CSS
`font-family`. Programmatic overrides use the canonical field names:

```ts
compile(src, { theme: { wallStroke: "#0000ff", lineWeight: 0.5 } });
```

See [`examples/themed.arch`](../examples/themed.arch).

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
