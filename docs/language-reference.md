# ArchLang Language Reference (v1.3)

ArchLang is a small declarative language that compiles to a professional SVG
floor plan. It is **explicit and parametric**: you give every element exact
coordinates and sizes in millimetres, so the same source always renders the
same drawing, and changing one number changes exactly one thing.

It is also a small, pure **scripting language** — values, control flow, functions,
arrays, and string interpolation — but it stays **expand-time and deterministic**:
every loop, conditional, and function call is evaluated while the drawing is built
(there is no runtime, no I/O, no clock), so the same source always produces
byte-identical output.

The output is professional CAD: layers, line weights, line types, wall poché
hatches by material, openings that void their wall, dimensions, a north arrow,
scale bar, and a title block — exportable to **SVG, DXF, PDF, or PNG**. Rooms can
be placed absolutely or **relative to one another** (`right-of` / `below` / …),
classified by what they're for (`uses bedroom`), and furnished with fixtures that
draw real plan symbols — placed by coordinate or snapped **`against`** a wall.
Plans can `import` components from other modules, select named **themes**, and be
formatted with `arch fmt`.

Beyond rendering, ArchLang **reads back** what you wrote: `arch describe` returns
the rooms, areas, adjacencies, and a modelled **access graph** (what connects to
what, and how far each room is from the entrance); `arch lint` flags habitability
problems against advisory profiles. Both are pure, text-only, and image-free — see
[Analysis: describe & lint](analysis.md). This reference covers the language
through **v1.3**.

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
| `dims auto [overall\|rooms\|walls\|all]` | Auto-draw dimension strings without hand-placing each `dim`: `overall` (the bounding extents), `rooms` (each room's width + height, placed in the page margin on the side the room faces), `walls` (one deduped thickness call-out per distinct wall thickness), or `all` (all three; the default when no scope is given). | off |

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
wall <kind> thickness <mm> [material <name> [scale <n>] [angle <deg>]] { (x,y) (x,y) … [close] }
wall id=<id> <kind> thickness <mm> [material <name> …] { … }
```

A polyline of ≥2 points, drawn with the given thickness and a poché hatch.
`close` connects the last point back to the first (use for exterior shells).
`<kind>` is a free label (e.g. `exterior`, `partition`).

Orthogonal walls are **boolean-unioned** so corners and T-junctions render as
one clean outline with no internal seams. Angled walls render seamlessly too when
the optional `clipper2-wasm` geometry engine is installed; otherwise they fall
back to a per-segment outline.

**Materials** select the hatch pattern: `poche` (default), `concrete`, `brick`,
`insulation`, `tile`, `none`. An unknown material warns and uses the default.
Hatches are **data-driven**: the SVG emits a tiled `<pattern>` and the DXF a real
`HATCH` entity. Optionally tune the hatch with `scale <n>` (tile-size multiplier,
default 1) and `angle <deg>` (extra rotation, default 0):

```
wall exterior thickness 250 material brick { … }
wall exterior thickness 250 material brick scale 1.5 angle 30 { … }
```

### Room

```
room [id=<id>] at (x,y) size <w>x<h> [label "<text>"] [uses <kind>…]
room [id=<id>] <right-of|left-of|below|above> <ref> [align <edge>] [gap <mm>] size <w>x<h> [label "<text>"] [uses <kind>…]
```

A rectangle. The compiler prints the `label` and the **computed area** (m²).
Rooms describe space; walls are drawn separately.

**Room purpose — `uses` (v1.3).** Tag a room with one or more space kinds so the
analysis layer knows what it *is* without guessing from the label:

```
room id=r_living at (0,0)    size 4000x6000 label "Living / Kitchen" uses living kitchen
room id=r_bath   at (4000,4400) size 3000x1600 label "Bath"         uses bath
```

The kinds are `living`, `kitchen`, `dining`, `bedroom`, `bath`, `wc`, `hall`,
`circulation`, `storage`, `utility`, `office`, and `entry`. This is **authored
intent**: it overrides the conservative label/id regex that `describe` and `lint`
fall back to when `uses` is absent (so a room labelled "Master Suite" can still be
tagged `uses bedroom`). The tags drive lint rules like *bedrooms need a window* and
*wet rooms need fixtures*, and appear in `describe().rooms[].uses` — see
[Analysis](analysis.md).

**Relational placement (v1.0).** Instead of an absolute `at (x,y)`, a room may be
positioned **relative to another room** with `right-of` / `left-of` / `below` /
`above`. The compiler resolves the absolute corner by pure arithmetic in
dependency order (a topological pass over the references) — it is deterministic
sugar over absolute coordinates, not an optimizer. The absolute path is the
default and is unchanged.

- `<ref>` is the `id` of another room.
- `align <edge>` lines up the cross-axis edges: horizontal placement uses
  `top|middle|bottom`, vertical placement uses `left|center|right` (default: the
  leading edge — `top` for horizontal, `left` for vertical).
- `gap <mm>` is the spacing along the placement axis (default `0`).

```
room id=living  at (0,0)                        size 5000x4000 label "Living"
room id=kitchen right-of living align top gap 0 size 3000x4000 label "Kitchen"
room id=bed     below living    align left gap 0 size 5000x3500 label "Bedroom"
```

A reference cycle reports [`E_LAYOUT_CYCLE`](error-codes.md); an unknown reference
reports `E_LAYOUT_REF`. See the dedicated guide page for the placement arithmetic.

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

### Opening (v1.3)

```
opening [id=<id>] at (x,y) width <mm> [wall <ref>]
```

A **cased, leaf-less gap** — it voids the wall like a door does, but draws no leaf
and no swing arc and no glazing. Use it where two spaces flow into one another
without a door: a living room into a hall, an open-plan kitchen, a wide cased
passage. Like a door, an `opening` **connects two spaces** in the
[access graph](analysis.md) — but because there is no leaf to subtract, its clear
width equals its nominal width (a door loses ~60 mm to the leaf and stop).

```
opening id=o_living at (4000,3700) width 900 wall partition   # living ↔ hall, no door
```

### Furniture

```
furniture <kind> [id=<id>] at (x,y) size <w>x<h> [label "<text>"] [rotate 0|90|180|270] [in <room>]
furniture <kind> [id=<id>] against wall <ref> [segment <n>] [offset <mm>] [side left|right] [size <along>x<depth>] [label "<text>"] [in <room>]
```

A schematic labelled rectangle (bed, sofa, desk…). Known plumbing & kitchen
**fixture** kinds draw a real plan symbol instead of an empty box and ignore any
`label`: `wc`/`toilet`, `basin`, `shower`, `bathtub`, `kitchen_sink`/`sink`,
`counter`, `fridge`, and `stove`/`hob`/`cooktop`. Any other kind falls back to the
labelled rectangle.

A piece can be placed two ways: absolutely with `at (x,y)` (optionally turned with
`rotate`), or snapped **`against wall <ref>`** so its back sits on the wall and its
rotation is derived for you. A known fixture placed `against wall` may **omit `size`**
to take its catalogued footprint (e.g. `furniture wc against wall w1 in bath`); `at`
placement and uncatalogued kinds still need an explicit `size`. `in <room>` records
which room owns the piece (used by the lint rules). The full placement rules, the fixture symbol catalogue, and the
fixture-aware lint checks live on the dedicated **[Furniture & fixtures](furniture.md)**
page. Standard fixtures are also importable components at typical residential sizes:

```
import "lib/fixtures.arch": wc, basin, shower
wc(6200, 4600)
```

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

## Analysis: `describe` & `lint`

ArchLang doesn't just draw a plan — it can **read it back as facts**. Two pure
functions (also surfaced as `arch describe` / `arch lint`) turn source into
machine-readable, image-free output:

- **`describe(source)`** → a semantic summary: every room with its `uses`, area,
  bounding box and `adjacent` rooms; what each door, window, and opening connects;
  the furniture; and a modelled **access graph** (entrances, per-room reachability,
  door-hop depth from the entrance, and the clear-width bottleneck on the way in).
- **`lint(source)`** → advisory `W_*` warnings about habitability (a room with no
  way in, a windowless bedroom, a too-small room, a door leaf sweeping onto a
  fixture, a wet room reached only through a bedroom…). Pick a ruleset with
  `--profile`:

  ```
  arch lint plan.arch --profile residential-basic        # default: ≥700 mm doors, ≥4 m² rooms
  arch lint plan.arch --profile accessibility-advisory   # stricter: ≥850 mm doors, ≥5 m² rooms, swing clearance
  ```

  Profiles are **advisory soundness checks, never a building-code guarantee.** The
  programmatic form is `lint(src, { profile })`; the names come from
  `LINT_PROFILES` (see `src/lint.ts`).

These are deliberately **facts and advice, not an auto-arranger** — ArchLang never
moves your geometry behind your back (see
[ADR 0005](adr/0005-no-invisible-architect.md)). The full output shapes, the access
graph, and the complete rule list are documented on the
**[Analysis: describe & lint](analysis.md)** page; every code is in the
[error catalog](error-codes.md).

## Compilation result

`compile(source, opts?)` returns:

```ts
{
  svg: string;
  errors: CompileError[];          // derived from diagnostics (severity "error")
  warnings: CompileWarning[];      // derived from diagnostics (severity "warning")
  diagnostics: Diagnostic[];       // every problem, with byte-offset spans
  ast?: PlanNode;
  scene?: Scene;                   // backend-neutral drawing (for DXF/PDF/PNG)
}
```

- `errors` are **fatal**; when present, `svg` is `""`. Each carries `message`
  and (when known) `line`/`col`.
- `warnings` are advisory (e.g. *door does not lie on any wall*, *rooms overlap*)
  and do not block rendering.
- `errors`/`warnings` are **projections** of `diagnostics` — kept for back-compat.
- `scene` is the backend-neutral {@link Scene} IR — the geometry computed once and
  shared by every backend.

### Output formats

The default `compile()` path is zero-dependency and emits **SVG**. Other backends
are pure serializers of the same `scene`:

| Format | API | CLI | Dependency |
|--------|-----|-----|------------|
| SVG | `compile().svg` | `arch compile p.arch` | none (default) |
| DXF | `toDxf(scene)` | `arch compile p.arch -f dxf` | none (zero-dep) |
| PDF | `toPdf(scene)` | `arch compile p.arch -f pdf` | optional `pdfkit` (vector, text selectable) |
| PNG | `renderPng(scene)` | `arch compile p.arch -f png` | optional `@resvg/resvg-js` (deterministic raster) |

The optional dependencies are lazily `import()`ed, so the core never requires
them and a default install emits SVG and DXF with nothing extra. The PNG backend
rasterizes the SVG with a bundled font (no system fonts), so output is
byte-identical across machines.

For a quick **viewable** raster, `arch preview p.arch -o p.png` renders PNG at a
sensible on-screen width (~1600 px) instead of the high-resolution native size — and
where the optional renderer is absent it reports the catalogued `E_PNG_DEPENDENCY`
(with a `fix`), or fetches it with `--install`. Render many files at once with
`arch batch …`, and embed plans in Markdown with `arch md doc.md` (renders each
fenced `arch` block to an image link). `arch manifest --json` prints this whole CLI
surface — commands, flags, formats, lint profiles, error codes — as structured data.

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
