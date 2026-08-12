# ArchLang Language Reference

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
the rooms, areas, adjacencies, a modelled **access graph** (what connects to what,
and how far each room is from the entrance), and **human-circulation** facts (how
far you walk to each room, the narrowest pinch on the way, and how circuitous the
route is); `arch lint` flags habitability problems against advisory profiles. Both
are pure, text-only, and image-free — see [Analysis: describe & lint](analysis.md).

This reference tracks the current language; for the exact version and per-release
history see [`CHANGELOG.md`](../CHANGELOG.md).

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
| `grid <n>` | Snap module in mm. All *built* coordinates round to the nearest multiple (a `dim`'s endpoints do not — a dimension measures, it is not built). `0` disables. | `0` |
| `paper A4\|A3\|A2\|A1\|A0 [landscape\|portrait]` | The sheet the drawing is issued on. Declaring it makes `scale` **operative** — every annotation size becomes a fixed number of millimetres on that sheet (see [Paper and scale](#paper-and-scale-the-sheet)). Orientation defaults to `landscape`. | none |
| `scale 1:50` | Drawing scale. On its own, annotation only (a title-block row). **With `paper`, it is the operative scale** every size derives from; omit it and the sheet auto-fits one. | none |
| `north up\|down\|left\|right\|<deg>` | North direction — where compass north points on the page. Draws the north arrow, and orients the **compass facing** [`describe()` reports for every window](analysis.md#describe--the-semantic-summary) (and therefore what an intent `windows.facing` assertion means): with `north right`, a window on the page's right edge faces `N`. A `<deg>` bearing (clockwise from the top of the page) snaps to the nearest cardinal for that facing — an exact 45° tie rounds clockwise — while the arrow is drawn at the exact bearing. | `up` |
| `site { street north\|south\|east\|west [hemisphere north\|south] }` | Where the building sits relative to its **street**, so a brief can name a direction instead of a letter. Draws nothing and moves nothing: it gives five directions a name (`street`, `back`, `equator_side`, `sunrise_side`, `sunset_side`) that `describe()`, `lint` and an intent's `windows.facing` can all use. See [Site and orientation](#site-and-orientation). | none |
| `dims auto [overall\|rooms\|walls\|all]` | Auto-draw dimension **chains** without hand-placing each `dim`, in the GB/T 50104 exterior convention — every chain outside the building, measured from the outer wall faces (see [Automatic dimension chains](#automatic-dimension-chains)): `overall` (one outer-face-to-outer-face span per dimensioned facade), `rooms` (the room/partition axis chain), `walls` (one deduped thickness call-out per distinct wall thickness), or `all` (the openings chain + the axis chain + the overall span, and the default when no scope is given). | off |
| `axes { x at … y at … }` | The plan's **positioning axes** (定位轴线) — declared structural datum lines, drawn dash-dot with a labelled bubble and used as the ticks of the middle dimension chain. See [Positioning axes](#positioning-axes-定位轴线). | none |
| `schedule rooms` | Draw the **ROOM SCHEDULE** table in the sheet's bottom band — number, name and area per room, closed by a total. Rows are derived from the rooms, never authored. See [Sheet tables](#sheet-tables--room-schedule--legend). | off |
| `legend` | Draw the **LEGEND** table beside the schedule — one row per wall hatch material and per fixture symbol the drawing actually uses, each with a real swatch. Fully derived; nothing to configure. See [Sheet tables](#sheet-tables--room-schedule--legend). | off |

### Paper and scale (the sheet)

`scale` has two quite different jobs, and which one it does depends entirely on whether
the plan also declares `paper`.

**Without `paper`, `scale` is annotation only.** It prints a `SCALE` row in the title
block and changes nothing else. Every drawn size — room label height, wall line weight,
hatch pitch, page margin — is a fraction of the drawing's own *reference dimension*
(the larger of its width and height). That is self-similar, so a small dwelling looks
right at any zoom; but it does not scale to a large building. A 100 m museum gets 3 m
room labels, 280 mm wall strokes and 17 m margins, because the annotations grow with the
building instead of staying fixed on the page.

**With `paper`, `scale` becomes operative** — the way a drawing board works. Every
annotation size is a constant number of millimetres **on the sheet**, multiplied by the
scale denominator to land in plan millimetres:

| Annotation | Sheet size |
|-----------|------------|
| Room name | 3.5 mm |
| Room area, dimension text | 2.5 mm |
| Furniture / fixture label | 2 mm |
| Cut wall outline (the heavy pen) | 0.5 mm |
| Dimensions, glazing, chrome (the thin pen) | 0.18 mm |
| Poché hatch pitch | 1.2 mm |
| Page margin | 15 mm per side |

So a 3.5 mm room label is 3.5 mm of ink whether the building is 7 m or 100 m across;
only how much building fits on the sheet changes.

```arch
plan "City Museum" {
  paper A1 landscape   # 841 x 594 mm
  scale 1:200          # operative: 3.5 mm labels land at 700 plan mm
  dims auto all
  # …
}
```

Orientation defaults to **`landscape`** — floor plans are wider than they are tall.
Paper sizes are the ISO 216 series: A4 210 × 297, A3 297 × 420, A2 420 × 594,
A1 594 × 841, A0 841 × 1189 mm (portrait; `landscape` swaps them).

#### Auto-fit

Declare `paper` and **omit `scale`**, and the sheet picks the *finest* scale that still
fits, from a fixed list — 1:50, 1:100, 1:200, 1:500. The chosen scale is stamped into the
title block, the scale bar, and `describe()`:

```arch
plan "House" {
  paper A3        # no `scale` — auto-fit chooses one
}
```

The fit test is closed-form: the building's **outer-face** extent has to fit the sheet
minus the page margins, minus a dimension band on each side when `dims auto` is on, minus
the bottom chrome band (scale bar and title block).

#### When it does not fit

An authored `scale` is **never silently overridden** — a drawing is issued at the scale
printed in its own title block. If the building does not fit at that scale you get the
advisory [`W_SCALE_OVERFLOW`](errors.md#w-scale-overflow) and the page grows past the
sheet so nothing is clipped. Fix it by choosing a coarser scale, a larger sheet, or by
dropping the `scale` line and letting auto-fit choose.

#### What paper mode changes in the output

- **SVG** — the root carries the true paper size (`width="841mm" height="594mm"`), so the
  file opens and prints at sheet size and at its declared scale. The `viewBox` becomes
  the whole sheet in plan millimetres, with the drawing centred on it and the scale bar
  and title block moved to the sheet's bottom corners. An explicit `--width` still wins.
- **PDF** — the page is the true ISO size in PostScript points, so `-f pdf` prints 1:200
  on a real A1.
- **`describe()`** — gains a [`sheet`](analysis.md#the-sheet) block. It is absent for a
  plan with no `paper`.

A plan that declares no `paper` renders **byte-for-byte** as it did before this feature
existed, `scale` included.

### Site and orientation

`north` says which way the *page* points. `site` says which way the *building* points:

```arch static
site {
  street south          # the frontage faces compass south — required
  hemisphere north      # optional; `north` unless you say otherwise
}
```

It is a **plan-level setting that draws nothing** and changes no geometry: a plan with a
`site` block renders byte-for-byte like the same plan without one. What it buys is a
vocabulary. `street` is a *true compass* direction, so it is read **with** `north`, never
instead of it, and it gives five directions a name — every one of them a compass letter,
reported on `arch describe --json` under `site`:

| Name | Value | Reads `hemisphere`? |
|------|-------|---------------------|
| `street` | the direction you declared | no |
| `back` | its opposite — the garden/rear aspect | no |
| `equator_side` | `S` in the northern hemisphere, `N` in the southern | **yes** — this is the only thing `hemisphere` decides |
| `sunrise_side` | `E`, in both hemispheres | no |
| `sunset_side` | `W`, in both hemispheres | no |

```json
"site": { "street": "S", "back": "N", "equator_side": "S",
          "sunrise_side": "E", "sunset_side": "W", "hemisphere": "north" }
```

Two consumers read those names. An [intent](intent.md)'s `windows.facing` may assert one
of them instead of a letter — `"facing": "equator_side"` is the same assertion as
`"facing": "S"` once the site is known — and one advisory lint rule,
[`W_ROOM_NOT_EQUATOR_FACING`](error-codes.md#w_room_not_equator_facing), reports a
habitable room whose windows all miss the equator-facing aspect.

> **These names are a drafting heuristic, not a daylight measurement.** "Habitable rooms
> want the equator-facing aspect" is a rule of thumb; a south window in Reykjavík and one
> in Singapore are not the same daylight, and ArchLang will never say they are. There is
> **no sun model, no latitude, no date, no solar hours and no daylight factor** anywhere
> in the language, by decision — computing any of them means simulating a sky, which
> breaks determinism and the zero-dependency core. `equator_side` asserts *a window on
> the equator-facing facade*, and nothing more. The names are spelled `_side` rather than
> `_sun` precisely so that step stays visible.

Rules, all of them refusals rather than defaults:

- `street` is **required** — a site with no street derives nothing
  ([`E_SITE_NO_STREET`](error-codes.md)). `hemisphere` is the optional half.
- **One block per plan** ([`E_SITE_DUP`](error-codes.md)). Repeated `axes` blocks merge
  because two axis lists append; two `street` values contradict.
- **Plan level only**, and like `north`, an **imported** module's `site` is ignored — one
  drawing is issued at one orientation, so an imported wing cannot re-orient the building.
- `arch fmt` prints it immediately after `north`, with both fields.

### Accessible metadata (`accTitle`, `accDescr`)

Two optional plan-level keywords supply explicit accessible metadata:

```
plan "Flat 2B" {
  accTitle "Two-room flat — accessible floor plan"
  accDescr "A living room with the entrance and a bedroom off it, joined by an interior door."
  …
}
```

- `accTitle "<text>"` — a human title for the drawing.
- `accDescr "<text>"` — a one-sentence description of the drawing.

They exist for the accessible SVG (`compile(src, { accessible: true })` /
`arch compile --accessible` — see [Compilation result](#compilation-result)): in that
mode `accTitle` overrides the plan name in the SVG `<title>`, and `accDescr` overrides the
auto-derived one-sentence caption (`describe().caption`, see [Analysis](analysis.md)) in the
SVG `<desc>`. **They have no effect on the default (non-accessible) output** — it stays
byte-identical whether or not they are present; this is metadata only, never geometry.

- Both are **plan-level only**. Writing either inside a `component` body or a control-flow
  block is [`E_ACC_PLACEMENT`](error-codes.md).
- Repeating either at plan level is [`W_DUP_ACC_METADATA`](error-codes.md) (a warning; the
  **last** value wins).
- `arch fmt` prints and preserves both.

See [`examples/accessible.arch`](../examples/accessible.arch).

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

### Metric unit suffixes

A numeric literal may carry an optional metric unit suffix, folded to
millimetres by the lexer — so bare numbers still mean millimetres and every
existing plan is unchanged:

| Written | Value (mm) |
|---------|-----------|
| `3` | `3` (bare = mm) |
| `3mm` | `3` (explicit, a no-op) |
| `3cm` | `30` |
| `3m` | `3000` |
| `3.5m` | `3500` |
| `40cm` | `400` |

The conversion is exact (decimal-point shifting, never a floating-point
multiply), so `3.333m` is exactly `3333` and `0.0005m` is exactly `0.5`. The
suffix must sit **immediately** after the digits with no space (`3m`, not
`3 m`), and it does not fire when a letter follows it — `3meters` is the number
`3` followed by the identifier `meters`. Each component of a `WxH` literal may
carry its own suffix (`3mx4m`, `3.5mx4200`, `30cmx40cm`). There is deliberately
**no area unit** (`m²`); areas come from `describe()`. The formatter normalises a
suffixed literal to its millimetre value (`3.5m` → `3500`).

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

A bare `bath(0, 0)` call is an **inline macro**: it splices the body into the
caller's coordinate system and the caller's id space. That is exactly what you
want for a small parameterised motif, and it is unchanged. When you want a
*reusable piece of building* instead — a wing, a ward, a unit — use `place`.

### Placing instances — `place` (v1.22)

```
component wing() {
  wall id=shell exterior thickness 300 { (0,0) (18000,0) (18000,12000) (0,12000) close }
  room id=main  at (0,0) size 18000x9000 label "Gallery"  uses living
  room id=corr  at (0,9000) size 18000x3000 label "Corridor" uses circulation
  opening id=o1 on shell at 50% width 2400
}

place wing() as west at (0,0)
place wing() as east at (42000,0) mirror x
```

**If you know React, you already know this.** `component` is the component,
`place … as <name>` is the element, `at`/`rotate`/`mirror` are its props, and
`west.main` is how the parent reaches a child by name. The component is written
once, in its **own local coordinates from `(0,0)`**, and knows nothing about
where it ends up — the `place` supplies that. Composition is the parent's job.

`as` and `at` are both **required**, and deliberately so. An instance that
cannot be addressed is not a component, and one that lands wherever its literals
happen to point is the old inline macro (still spelled `wing()`). The grammar
refuses to blur the two.

**Ids are namespaced.** Every id born inside the instance becomes
`<instance>.<id>`, and auto-id counters restart per instance — so two instances
of one component are **order-independent** (`west.wall_1` / `east.wall_1`, never
`wall_1` / `wall_4`). Dotted names then work in every **reference** position:

```
door id=d_west at (18000,10500) width 1800 wall west.shell swing into hall
furniture id=desk desk in west.main centered size 1600x800
```

```bash
arch describe museum.arch --room west.main --json
```

A dotted name in a **declaration** position (`room id=west.main`, `let west.x`,
`place … as west.main`) is [`E_DOTTED_DECL`](error-codes.md#e_dotted_decl): the
namespace belongs to the `place`, so a dotted name can only ever be a reference.
Reusing an instance name is [`E_DUP_INSTANCE`](error-codes.md#e_dup_instance).

**`rotate` and `mirror` are exact.** `rotate 0|90|180|270` and `mirror x|y` are
integer isometries — no trigonometry, no floating-point drift, and they compose,
so a `place` inside a component body just multiplies frames. `mirror x` flips
the instance left↔right; `mirror y` flips it top↔bottom.

A mirror is **physics, not decoration**: the instance is genuinely reflected, so
door swings come out mirror-image, an outward-opening fire exit stays outward,
and a fixture's facing follows. (Handed *glyphs* are re-oriented by quarter-turn
rather than reflected — reflection is not a drawing primitive — which for
ArchLang's rectilinear fixture symbols is the same picture.)

**An instance is a closed world — one way.** It resolves entirely in its own
frame, against its **own** walls and rooms, and one rigid transform then carries
the result into the plan. That is what makes `anchor top-left`, `against wall …
side left`, `swing into`, `right-of` and `hinge left` mean inside a rotated
instance exactly what they mean when the component is drawn on its own. The
consequence to know: **the plan can reach into an instance (`wall west.shell`),
but a component cannot reach out of itself.** A component that needs to touch
its surroundings takes the reference as a parameter, or the parent draws the
connecting element — as `examples/museum-wings.arch` does with its hall doors.

**Analysis still sees one building.** Flattening happens before `lint`,
`describe()` and the wall union run, so two overlapping instances raise
`W_ROOM_OVERLAP` across the instance boundary, `dims auto` measures the whole
composed facade, and the positioning axes pick up instance openings.

**An instance is implicitly a [zone](#zones--wings-and-departments-v122)**, named
after the instance. Composing by wing therefore *gives* you the grouping:
`describe().zones`, `arch describe --zone west` and the grouped room schedule all
work with no `zone` declaration. (An explicit `zone` around a `place` still nests
— but note the zone path and the id namespace are separate: wrapping a `place` in
`zone north` makes the zone `north.west` while the rooms stay `west.*`, because a
zone is metadata and never renames anything.)

**`describe()` reports the composition:** an `instances[]` block (name,
component, origin, transform), plus `instance`/`component` on each room and
fixture, and an `instance` marker in `freedom`. Read it as: the instance's
placement is the one authored-absolute degree of freedom, and everything inside
derives from it — so nudging a wing is one edit, not N.

### Whole-file instantiation — `import "…" as <name>` (v1.22)

```
import "wing.arch" as wing

place wing() as west at (0,0)
```

**One `.arch` file authors one room, one wing, one unit.** With `as` instead of
an item list, `import` binds the module's own top-level **drawable statements**
as an implicit zero-parameter component — so a file that draws a wing *is* the
wing component, with no `component` wrapper and no export list.

Two rules follow from "one drawing is issued on one sheet at one scale":

- the module's **plan-level settings** (`units`, `grid`, `paper`, `scale`,
  `north`, `dims`, `title`, `axes`, `schedule`, `legend`) are **ignored** — the
  root plan's settings govern. The module keeps them so it still compiles, and
  reads correctly, on its own;
- a module's `level` blocks are **dropped** (a storey is a page, and a component
  is a piece of one page). A module with no drawable body at all warns with
  [`W_IMPORT_EMPTY_FILE`](error-codes.md#w_import_empty_file) rather than binding
  silence.

The module's own `component`s stay available to its body, so a file may call its
private helpers even though the importer knows only the file's name. Parametric
components keep the named form: `import "lib/fixtures.arch": wc, basin`.

**A diagnostic raised inside an imported body names its file.** Its `span` is
measured in *that* module, so `Diagnostic.file` says which one, and
`arch fix` **refuses** to apply a fix whose edits belong to another file — it
tells you where the real edit goes instead of splicing foreign byte offsets into
the importer.

See [`examples/museum-wing.arch`](../examples/museum-wing.arch) (the wing, a
complete plan in its own right) and
[`examples/museum-wings.arch`](../examples/museum-wings.arch) (the building that
places it twice, once mirrored).

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
room [id=<id>] at (x,y) size <w>x<h> [label "<text>" [at (x,y)]] [uses <kind>…]
room [id=<id>] <right-of|left-of|below|above> <ref> [align <edge>] [gap <mm>] size <w>x<h> [label "<text>" [at (x,y)]] [uses <kind>…]
room [id=<id>] polygon (x,y) (x,y) (x,y) … [label "<text>" [at (x,y)]] [uses <kind>…]
room [id=<id>] circle at (cx,cy) radius <mm> [label "<text>" [at (x,y)]] [uses <kind>…]
```

A rectangle — or [any simple polygon](#polygonal-rooms-v1-23), or a
[circle](#circular-rooms-v1-24). The compiler prints the `label` and the **computed area**
(m²). Rooms describe space; walls are drawn separately.

**Where the name goes.** By default at the room's own centre — the rectangle's, the
circle's, or [a polygon's area centroid](#polygonal-rooms-v1-23) — and a name that would
land on furniture, a door swing or a dimension number is nudged clear of it. Pin it
yourself with `label "…" at (x,y)` and **that point always wins**, on every room form,
nudge included; it is a plan coordinate, so it means the same thing under a relational
clause as under `at`. A pin off the room's own floor is advisory
[`W_ROOM_LABEL_OUTSIDE`](error-codes.md), never an error.

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

### Polygonal rooms (v1.23)

```
room [id=<id>] polygon (x,y) (x,y) (x,y) … [label "<text>" [at (x,y)]] [uses <kind>…]
```

Not every room is a rectangle. The `polygon` form gives a room its own **ring** instead
of `at` + `size`: three or more vertices, in order, **implicitly closed** (do not repeat
the first point), grid-snapped like every other coordinate. An L-shaped gallery, a
trapezoid lobby with an angled facade, a chamfered corner — all one statement.

```
room id=gallery polygon (0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000)
  label "Gallery"
room id=lobby polygon (6000,8000) (12000,8000) (12000,9000) (6000,14000)
  label "Lobby" at (8200,10200) uses entry
```

**What is exact.** The area is the **shoelace** area of the ring — the gallery above is
132 m², not the 168 m² its bounding box would claim — and it is the same number in the
drawn label, `describe().rooms[].area_m2`, the `schedule rooms` table and Plan JSON.
`describe()` reports the ring as `floor_polygon`; `bbox` remains the **vertex extent**,
which is also what the resolved room's `at`/`size` are, so a reader written for
rectangles still sees a truthful box (just not the floor).

**Where the label goes.** At the polygon's **area centroid**, computed closed-form —
except where a concave ring puts that centroid outside its own floor (a deep C or U, or an
L with thin legs). There the label falls back to the ring's **pole of inaccessibility**:
the interior point furthest from any edge, i.e. the middle of the widest place the text can
sit. The fallback is unreachable whenever the centroid is legal, so a rectangle, a circle
and every well-behaved ring are labelled exactly as before. You can still pin the anchor
yourself with `label "…" at (x,y)`, which always wins; a point outside the room is advisory
[`W_ROOM_LABEL_OUTSIDE`](error-codes.md), never an error.

**The ring must be simple.** Edges that cross (a bow-tie, usually two swapped vertices)
report [`E_ROOM_POLY_SELF_INTERSECT`](error-codes.md); a ring with fewer than three
*effective* vertices once duplicate and straight-through points are removed reports
[`E_ROOM_POLY_DEGENERATE`](error-codes.md). A redundant point sitting on an edge is fine.

**What refuses rather than approximates.** Two clauses are arithmetic on a room's four
rectangle edges, and a bounding box is not a substitute — `anchor bottom-left` on an L
could land a fixture in the notch, outside the room. Both raise
[`E_PLACE_POLY`](error-codes.md) and name the way out:

| Clause | With a polygon room |
| --- | --- |
| `room … right-of <poly>` (and `left-of`/`below`/`above`) | `E_PLACE_POLY` — place this room with `at (x,y)` |
| `furniture … in <poly> anchor <a>` / `in <poly> centered` | `E_PLACE_POLY` — place the piece with `at (x,y)` (plus `rotate`) |
| `furniture … against wall <id>` | **Works** — a wall is a wall whatever shape the room is |
| `furniture … at (x,y) in <poly>` | **Works** — an absolute position with declared membership |
| `strip { room … }` | Not applicable — a strip child is a sized rectangle by construction |

Everything else follows the ring, not the box: adjacency is a **shared boundary run**
between two rooms' edges at any angle, a door or window is attributed to a polygon room
by its distance to that room's own edges (so an entrance on an angled facade connects the
room behind it), and the circulation grids test whether a cell centre is **inside the
polygon**. Two rooms whose boxes overlap but whose floors do not — a room tucked into an
L's notch — do **not** raise `W_ROOM_OVERLAP`; the check is an exact ring-vs-ring test.
See [Analysis](analysis.md) for the measured facts and their limits.

One rule keeps its rectangle: the fixture-orientation warning `W_FIXTURE_BACK_TO_ROOM`
does not fire inside a polygon room, because "which edge is the back?" has no answer where
the room has no north/south/east/west sides. `arch repair` likewise declines to push a
piece into a polygon room and says so in its `unresolved` list, and `arch suggest` offers
no door/window candidate *on* a polygon room rather than propose one on an edge the room
does not have.

### Curved walls — `arc` edges (v1.24)

```
wall [id=<id>] <category> thickness <mm> [material …] {
  (x,y) … arc (x,y) radius <mm> [cw|ccw] [major] … [close]
}
```

An `arc (x,y) radius R` clause makes the edge **from the previous vertex to this one** a
circular arc instead of a straight run. Write it where the vertex goes; everything else
about the wall is unchanged.

```arch
plan "Bowed facade" {
  units mm
  wall id=front exterior thickness 300 {
    (0,0)
    (12000,0)
    arc (24000,12000) radius 12000
    (24000,24000)
  }
  door id=d on front at 60% width 1200
}
```

**Which of the two circles.** Two endpoints and a radius describe *four* arcs: two
candidate circles, and two ways round each. Two optional words pick one, and the defaults
are the common case:

| Clause | Meaning |
| --- | --- |
| *(nothing)* | the **minor** arc turning **`ccw`** as drawn — a shallow bow to the left of travel |
| `cw` | turn clockwise as drawn (the centre sits to the **right** of the direction of travel) |
| `ccw` | turn counter-clockwise (centre to the **left**) — the default |
| `major` | take the **long way round** — the arc greater than a half circle |

"Clockwise" means clockwise **on the sheet**, as the reader sees it. Reverse the two words
and you get the concave version of the same corner, which is why the aquarium's rounded
frontage says `cw`: walking the shell south-west, clockwise puts the centre inside the
building, so the facade bows outward.

**A radius has a minimum.** No circle of radius `R` passes through two points more than
`2R` apart, so a radius under half the chord is [`E_ARC_RADIUS`](error-codes.md) — with a
machine-applicable fix that substitutes the minimum. The offending edge stays straight so
the rest of the plan still draws.

**A closed curve is written as its halves.** There is no "arc back to the start" form: a
full circle is two `arc` edges, each with its radius visible in the source.

```arch
plan "Rotunda" {
  units mm
  wall id=drum partition thickness 200 {
    (38000,14000)
    arc (22000,14000) radius 8000
    arc (38000,14000) radius 8000
  }
}
```

**Openings on a curve work.** `on <wall> at <pos>` walks the wall by **run length**, and an
arc contributes its arc length `R·θ` — not its chord — so `at 50%` lands halfway along the
wall *as walked*. An absolute `at (x,y)` is attributed to the curve by its distance to the
arc itself. A door's leaf and swing are taken from the **tangent at the doorway**, so
`hinge left|right` keeps its usual meaning (relative to the direction of travel along the
wall, which on an arc is the direction the arc turns); a window's pane runs along that
tangent with its jambs radial.

**What a curve looks like.** The two visible faces are emitted as **true arcs** — SVG `A`
commands, native DXF `ARC` entities — so a curve is never drawn faceted at any zoom. Only
the poché *fill* is tessellated (a fill has to be a polygon for every backend), at a fixed
7.5° step. A wall carrying an arc is lowered per segment rather than through the polygon
boolean, which is what makes an arc plan's output identical whether or not the optional
`clipper2-wasm` dependency is installed. One consequence to know: like any non-orthogonal
wall, a curved wall's openings are drawn with an opaque cover rather than a real hole
punched in the solid, so a doorway on a curve paints over the floor immediately either side
of it.

**What declines rather than guesses.** `furniture … against wall <id>` on an arc segment
raises [`E_FURN_AGAINST`](error-codes.md): a curve has no single back direction, so place
the piece with `at (x,y)` and an explicit `rotate`. An arc edge inside a `room polygon`
ring is not supported and says so at parse time — no release is promised for it; it is
tracked on the roadmap (`docs/research/2026-08-06-competitor-borrowing-roadmap.md` in the
repository). Use a [circular room](#circular-rooms-v1-24), or a curved wall with a
straight-edged room behind it.

### Circular rooms (v1.24)

```
room [id=<id>] circle at (cx,cy) radius <mm> [label "<text>" [at (x,y)]] [uses <kind>…]
```

A round floor, given by its centre and radius instead of `at` + `size`. A non-positive
radius is [`E_ROOM_RADIUS`](error-codes.md).

```arch
plan "Tank" {
  units mm
  room id=tank circle at (30000,14000) radius 8000 label "Ocean Rotunda" uses hall
}
```

**What is exact.** The area is **πR²**, in closed form — the same number in the drawn
label, `describe().rooms[].area_m2`, the `schedule rooms` table and Plan JSON. The floor is
drawn as a real circle, not a polygon. `describe()` reports the exact centre and radius as
`floor_circle` and leaves `floor_polygon` empty (a 48-vertex ring is an implementation
detail of the grid layer, not the truth about the floor); `bbox` — and the resolved room's
`at`/`size` — is the enclosing square, so a reader written for rectangles still sees a
truthful box.

**What is chordal.** The occupancy and circulation grids, room-vs-room overlap, and door
attribution work on a 48-sided inscribed ring, exactly the machinery polygon rooms use.
That is a deliberate split, described in [Analysis](analysis.md#curves-what-is-exact-and-what-is-chordal-v1-24).

**Annulus is not a form.** A ring-shaped gallery around a tank is two rooms and two walls,
not one room with a hole; there is no doughnut syntax and none is planned.

### Dimensioning a curve (v1.24)

A linear dimension chain cannot describe an arc, so `dims auto` dimensions round things the
way GB/T 50104 does — and the manual forms are there when you want to place one yourself:

```
dim radius <wallId> [segment <n>] [offset <mm>] [text "<text>"]
dim diameter <roomId> [offset <mm>] [text "<text>"]
```

`dim radius` draws an `R<r>` leader from an arc's centre out to its midpoint; `dim diameter`
draws a `φ<d>` call-out across a circular room. Both **derive** their geometry and their
text from the element they name, so the number can never disagree with the drawing. Name a
wall with several arcs and you must add `segment <n>`; anything unresolvable is
[`E_DIM_CURVE_REF`](error-codes.md) rather than a guess.

`dims auto` synthesizes one `R` leader per distinct arc (deduplicated by centre and radius,
so a circle written as two semicircles gets one call-out) and one `φ` per circular room,
while the linear chains stay on the straight facades — a curved facade carries no chain and
no tick. The `φ` call-out sits **on** the diameter, through the centre, which is where a
room name would otherwise be: move the *name* with `label "…" at (x,y)`, since the compiler
never relocates a dimension to make room for a label. Arc-length dimensions are not
implemented.

### Strip (v1.13)

```
strip <right|left|down|up> at (x,y) gap <mm> [height|width <mm>] {
  room [id=<id>] size <main>[x<cross>] [label "<text>"] [uses <kind>…]
  …
}
```

A **row or column of rooms** laid out end to end. `<dir>` is the fill axis; each
room's main-axis offset is the running sum of the previous rooms' extents plus
`gap`, and the shared cross dimension is the strip's `height` (for a horizontal
`right`/`left` strip) or `width` (for a vertical `down`/`up` strip). A room gives
its **main-axis extent** with `size <main>`, and may override the shared cross with
`size <main>x<cross>`. Declaration order is fill order.

`strip` is pure sugar: it expands to ordinary absolute-placed rooms during resolve,
so everything downstream — walls, doors, relational references **to** the strip's
rooms — is unchanged. It is a **plan-level block only** (nesting it inside a
component, control-flow block, or another strip is `E_STRIP_NEST`); a room that
supplies no cross dimension while the strip supplies none is `E_STRIP_SIZE`.

```
strip down at (4000,0) gap 0 width 3000 {
  room id=r_bed  size 3000 label "Bedroom" uses bedroom
  room id=r_hall size 1400 label "Hall"    uses hall
  room id=r_bath size 1600 label "Bath"    uses bath
}
```

### Door

```
door [id=<id>] [<kind>] at (x,y) width <mm> [wall <ref>] [hinge left|right|near start|end] [swing in|out|into <room>] [slide left|right] [open <0..1>]
door [id=<id>] [<kind>] on <wall> at <pos> width <mm> [hinge …] [swing …] [slide …] [open …]
```

Drawn as an opening in the host wall plus a leaf and a quarter-circle swing arc.
`wall <ref>` pins the door to a wall by `id` or `kind`; otherwise the nearest
wall hosts it. `hinge` is relative to the wall's direction. Defaults: `hinge
left`, `swing in`.

**Wall attachment (v1.13).** Instead of `at (x,y)`, place the opening **on** a
named wall at a position along it: `<pos>` is a percentage of the wall's length
(`40%`), an absolute distance in millimetres from the wall's start (`1200`), or
`center`. The point is computed by walking the wall's polyline, so the door is
pinned to that wall by construction (it can never be reported "off wall"). An
unknown/ambiguous wall is [`E_ATTACH_WALL_REF`](error-codes.md); a position past
the wall is `E_ATTACH_POS_RANGE`.

**Room-directed swing & vertex hinge (v1.13).**
- `swing into <room>` picks `in`/`out` so the leaf opens toward that room's side
  of the host wall. If the room doesn't border the wall it warns
  `W_SWING_ROOM_NOT_ADJACENT` and falls back to the default.
- `hinge near start|end` hinges the leaf at the door-segment end nearer the host
  wall's start/end vertex — independent of the wall's traversal wording.

```
door on w_south at 2000 width 1000 hinge near start swing into r_living
```

#### Door kinds (v1.25)

A bare **kind** word may lead the statement, after any `id=` — the same shape as
`room polygon` / `room circle` / `dim faces`:

| kind | what is drawn in the reveal | swing arc? |
| --- | --- | --- |
| `hinged` *(default)* | leaf + quarter-circle swing arc | yes |
| `sliding` | two bypass panels on two tracks | no |
| `barn` | a surface-hung panel on a track that overruns the far jamb | no |
| `bifold` | two folding leaves and the fold hinge | no |
| `pocket` | a panel and the wall cavity it slides into | no |

`hinged` is the default **and writing it is identical to omitting it** — a plan
that names no kind compiles to exactly the bytes it always did.

**Only a hinged door has a swing arc.** For every other kind the leaf sweeps
nothing, so [`W_SWING_OBSTRUCTED`](error-codes.md#w_swing_obstructed) cannot apply
to it — which is why that warning's remedies now name them. The rules that measure
the *doorway* rather than the leaf are unchanged for every kind: you still walk
through it, so `W_DOORWAY_BLOCKED` and `W_DOOR_CLEARANCE` still fire, and a door of
any kind connects the same two rooms in `describe --json`.

**`swing` means something different per kind.** It is deliberately reused rather
than joined by a second handed keyword, because "which normal side of the wall" is
genuinely the same property in each case — and it is the one handed rule already
proved correct under `place … mirror`:

| kind | `swing in\|out` selects |
| --- | --- |
| `hinged` | which side of the wall the leaf sweeps to |
| `barn` | which **face** of the wall the panel hangs on |
| `bifold` | which **face** the panels fold toward |
| `sliding`, `pocket` | *not accepted* — the panel stays in the plane of the wall, or inside it |

**`slide left\|right`** is which way the panel travels to open, read along the host
wall's traversal direction exactly as `hinge` is (so a mirrored `place` carries it
correctly with no flip). Default `left`. **`open <0..1>`** is how far the panel is
**drawn** open — 0 closed, 1 fully open, default 0.5. It is a drawing fact and
nothing else: no measurement, no lint rule and no `describe --json` field reads it,
so a door cannot be made to satisfy a check by being drawn ajar. Outside `[0,1]` it
is [`E_DOOR_OPEN_RANGE`](error-codes.md#e_door_open_range) with a clamping fix.

**Clauses are refused, not ignored.** `hinge` is hinged-only and `slide`/`open` are
sliding-family-only; the wrong pairing is
[`E_DOOR_KIND_CLAUSE`](error-codes.md#e_door_kind_clause) with a machine-applicable
fix that deletes the clause. A non-hinged kind on a wall whose hosting edge is an
`arc` is [`E_DOOR_KIND_CURVED`](error-codes.md#e_door_kind_curved) — a straight panel
on a straight track has no meaning on a curved reveal, and drawing one anyway would
be a wrong drawing with no diagnostic. Clause order follows the grammar line above.

A `pocket` door needs its own width plus end clearance of clear wall past the
slide-side jamb, or [`W_POCKET_RUN`](error-codes.md#w_pocket_run) — measured, and
truncated at any other opening inside the run, because a panel cannot slide through
a window either.

```arch
plan "Door kinds" {
  units mm
  wall exterior thickness 200 { (0,0) (14000,0) (14000,5000) (0,5000) close }
  wall id=p1 partition thickness 100 { (4000,0) (4000,5000) }
  wall id=p2 partition thickness 100 { (9000,0) (9000,5000) }
  room id=west   at (0,0)    size 4000x5000 label "West"
  room id=middle at (4000,0) size 5000x5000 label "Middle"
  room id=east   at (9000,0) size 5000x5000 label "East"
  door id=front on exterior at 10% width 1000 swing in
  door sliding  on p1 at 25% width 1400
  door pocket   on p1 at 75% width 900  slide left open 0.4
  door barn     on p2 at 30% width 1100 swing out slide left
  door bifold   on p2 at 70% width 1500 swing in  slide right
}
```

### Window

```
window [id=<id>] at (x,y) width <mm> [wall <ref>]
window [id=<id>] on <wall> at <pos> width <mm>
```

An opening with the standard double-line glazing symbol. The `on <wall> at <pos>`
attachment form works exactly as for doors.

### Opening (v1.3)

```
opening [id=<id>] at (x,y) width <mm> [wall <ref>]
opening [id=<id>] on <wall> at <pos> width <mm>
```

A **cased, leaf-less gap** — it voids the wall like a door does, but draws no leaf
and no swing arc and no glazing. Use it where two spaces flow into one another
without a door: a living room into a hall, an open-plan kitchen, a wide cased
passage. Like a door, an `opening` **connects two spaces** in the
[access graph](analysis.md) — but because there is no leaf to subtract, its clear
width equals its nominal width (a door loses ~60 mm to the leaf and stop). It also
takes the `on <wall> at <pos>` attachment form.

It is drawn the way an architect draws a cased opening: the wall solid is genuinely
severed (jambs capped, floor continuous through the passage), with a **dashed lintel**
line at each wall face standing for the head above — never a solid line closing the
gap back up. It lives on the CAD layer `A-DOOR`, not `A-GLAZ`.

```
opening id=o_living at (4000,3700) width 900 wall partition   # living ↔ hall, no door
opening on w_part at 50% width 900                            # centred on the partition
```

### Furniture

```
furniture <kind> [id=<id>] at (x,y) size <w>x<h> [label "<text>"] [rotate 0|90|180|270] [in <room>]
furniture <kind> [id=<id>] against wall <ref> [segment <n>] [offset <mm>] [side left|right] [size <along>x<depth>] [label "<text>"] [in <room>]
furniture <kind> [id=<id>] in <room> centered [size <w>x<h>] [label …] [rotate …]
furniture <kind> [id=<id>] in <room> anchor <a> [flush] [inset <mm>] [size <w>x<h>] [label …] [rotate …]
```

A schematic labelled rectangle (bed, sofa, desk…). Known plumbing & kitchen
**fixture** kinds draw a real plan symbol instead of an empty box and ignore any
`label`: `wc`/`toilet`, `basin`, `shower`, `bathtub`, `kitchen_sink`/`sink`,
`counter`, `fridge`, and `stove`/`hob`/`cooktop`. Any other kind falls back to the
labelled rectangle.

A piece can be placed three ways: absolutely with `at (x,y)` (optionally turned with
`rotate`), snapped **`against wall <ref>`** so its back sits on the wall and its
rotation is derived for you, or **relative to a room** (v1.13). A known fixture
placed `against wall` may **omit `size`** to take its catalogued footprint (e.g.
`furniture wc against wall w1 in bath`); `at` and room-relative placement and
uncatalogued kinds still need an explicit `size`. `in <room>` records which room
owns the piece (used by the lint rules).

**Room-relative placement (v1.13).** `in <room> centered` centres the fixture in
that room's box; `in <room> anchor <a> [inset <mm>]` snaps it to a corner or edge.
The anchor `<a>` is one of `top-left`, `top`, `top-right`, `left`, `center`,
`right`, `bottom-left`, `bottom`, `bottom-right`; `inset` (default `0`) pulls it in
from the referenced edge(s). The `in <room>` here both positions **and** owns the
fixture. An unknown or relationally-placed room is
[`E_PLACE_REF`](error-codes.md).

**`flush` — measure from the wall face, not the centerline.** A room's rectangle is
drawn on wall **centerlines**, so `anchor bottom` with `inset 0` puts the piece's back
half a wall thickness *inside* the solid (a `W_FURNITURE_WALL_COLLISION`) — the reason
you would otherwise hand-write `inset 100` for a 200 mm wall you never named. Adding
`flush` re-bases `inset` (still defaulting to `0`) onto the **inner face** of the wall
behind each anchored edge: centerline + thickness / 2, toward the room. So
`anchor bottom flush` sits on the plaster, and `anchor bottom flush inset 50` sits
50 mm off it.

The rule is per edge and independent, so a corner anchor can be flush on one edge and
room-referenced on the other, and an anchored edge with **no** wall behind it simply
keeps the room-rectangle reference (there is no face to measure from). `flush` is a
position rule only — it composes with the derived rotation below, and it needs an
anchored edge: on `centered` (or the equivalent `anchor center`) it is
[`E_FURN_FLUSH`](error-codes.md). It comes before `inset`, which it re-bases.

An anchor also **derives the rotation** of a wall-requiring fixture you did not turn
by hand: the anchored edge names the wall its back should face. It is derived only
when that answer is unique — the edge must be walled, and the footprint's aspect must
allow it as the back — and an explicit `rotate` always wins. A fixture left facing the
room is [`W_FIXTURE_BACK_TO_ROOM`](error-codes.md), with a `rotate` fix. See
[Furniture & fixtures](furniture.md).

```
furniture bed  in r_bed    anchor top-left inset 300 size 1500x2000 label "Bed"
furniture sofa in r_living centered                  size 2000x900  label "Sofa"
furniture wc   in r_bath   anchor bottom flush       size 400x700   # back on the wall face
```

The full placement rules, the fixture symbol catalogue, and the
fixture-aware lint checks live on the dedicated **[Furniture & fixtures](furniture.md)**
page. Standard fixtures are also importable components at typical residential sizes:

```
import "lib/fixtures.arch": wc, basin, shower
wc(6200, 4600)
```

### Dimension

```
dim [faces|clear] (x1,y1)->(x2,y2) [offset <mm>] [text "<override>"]
```

A dimension line offset perpendicular from the measured segment, with tick
marks and a label. Without `text`, the measured length (mm) is shown. Endpoints
are measured verbatim (never grid-snapped) and a zero `offset` draws the line on
the measured segment itself, with no witness lines.

**Which side it lands on is the endpoint ORDER.** The offset runs along the *left
normal* of from→to, so `dim (0,6000)->(7000,6000) offset 500` reads below the
plan while the same pair reversed reads above it. Getting this backwards pushes
the line into the building, across labels and poché — the advisory
[`W_DIM_INSIDE`](error-codes.md), whose machine-applicable fix swaps the two
endpoints for you.

#### `faces` / `clear` — let the walls place the endpoints

A room rectangle's edges are wall **centerlines**, so a hand-written overall dim
between two room corners is short by half a wall thickness at each end — the
classic "the drawing says 10000 but the building is 10300" mistake (and the
`text` override written to match it is wrong the moment the wall changes).

Both forms push each endpoint along the measurement axis, away from the other
one, onto the face of the wall that endpoint runs into:

| Form | Each endpoint lands on | Measures |
|------|------------------------|----------|
| `dim faces …` | the **outer** face | the outside-to-outside span |
| `dim clear …` | the **inner** face | the clear (free) width between the walls |

```arch
plan "Faces" {
  units mm
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 label "Studio"
  dim faces (0,4000)->(5000,4000) offset 600   # prints 5200, not 5000
  dim clear (0,2000)->(5000,2000) offset 0     # prints 4800 — the clear width
}
```

The wall is found as the nearest wall segment *perpendicular to the dimension's
own direction* (at a corner, only the wall the measurement runs into can bound
it). The projection is closed-form and idempotent — an endpoint already on the
outer face stays put — and an endpoint with no wall across the axis keeps its
written coordinate and raises the advisory `W_DIM_NO_WALL`.

#### Automatic dimension chains

`dims auto …` (see [Plan-level settings](#plan-level-settings)) draws the whole
exterior dimensioning for you, in the GB/T 50104 convention: parallel **chains**
on the facades, all outside the building, all measured from the outer wall faces,
stepping outward from the wall.

| Chain | Slot | Ticks |
|-------|------|-------|
| openings | innermost | every opening edge on that facade, between the two outer corners — so the chain reads corner · pier · opening · pier · corner |
| axis | middle | the declared [positioning axes](#positioning-axes-定位轴线) on that direction, when the plan has any — the GB/T axis chain proper. Otherwise the sorted unique room-boundary coordinates on that axis (the partition axes — the classic `4000 · 3000` room chain) |
| overall | outermost | one span, outer face to outer face |

`dims auto rooms` emits just the axis chain, `dims auto overall` just the overall
span, and `dims auto all` all three (plus the `walls` thickness call-outs). The
bottom and left facades are always dimensioned; the top and right are added when
`all` finds openings of their own to chain there. A chain with fewer than two
distinct ticks is skipped, and nothing is ever drawn inside the building.
Dimensioning is presentation only: it never changes `describe()`, `lint()` or the
resolved plan.

### Column

```
column [id=<id>] at (x,y) size <w>x<h>
```

A solid structural column (filled square). Useful for grids of columns in
larger plans. `at` is the **top-left corner**, like a room's — the opening elements
(`door`, `window`, `opening`) are the ones whose `at` is a centre, because they sit on a
wall.

### Vertical circulation — `stair`, `elevator`, `escalator` (v1.21)

```
stair     [id=<id>] at (x,y) size <w>x<h> dir up|down [width <mm>]
elevator  [id=<id>] at (x,y) size <w>x<h>
escalator [id=<id>] at (x,y) size <w>x<h> dir up|down
```

Three elements that draw the conventional plan symbols — and, in a multi-storey plan, the
only thing that joins two floors.

| | drawn as | `dir` | CAD layer |
| --- | --- | --- | --- |
| `stair` | tread lines at a 280 mm nominal going, a mid-flight **break line** (the paired-diagonal cut, with the treads it crosses omitted) and a direction arrow labelled `UP`/`DN` | required | `A-FLOR-STRS` |
| `elevator` | the car rectangle with crossed diagonals | — a lift serves every storey it appears on | `A-FLOR-EVTR` |
| `escalator` | parallel chevrons pointing the way of travel, plus the same `UP`/`DN` arrow | required | `A-FLOR-STRS` |

`at` is the footprint's **top-left corner** (as for `room` and `furniture`). They draw on
the same pass as furniture, under the wall poché.

**Which way the run reads.** Two rules compose.

1. *Geometry.* The flight lies along the footprint's **long axis**, and a **rising** flight
   starts at the end of that axis with the **larger coordinate**: the bottom end of a
   portrait footprint, the right end of a landscape one. So a `dir up` arrow points north
   (or west).
2. *`dir`.* You meet a **descending** flight at its head, not its foot, so a `dir down` run
   is entered from the **opposite** end and its arrow points the other way. That is what
   makes one shaft read correctly on both storeys — the `UP` on the floor below and the
   `DN` on the floor above point in opposite directions, as a drawing set should, with no
   cross-level inference beyond the shared id.

The geometric half is a **fixed drafting convention, not a search for the nearest door** —
it is the same answer in the renderer and in the analysis layer, on every storey, whatever
else the plan contains. A flight genuinely approached from the north or the west therefore
draws its arrow the wrong way round in v1; swap the footprint's authored coordinates, or
wait for the `entry <edge>` clause a later release can add without changing this default.

**`width` (stairs only)** is the FLIGHT width measured across the run. It defaults to the
footprint's cross-axis extent, and may not exceed it
([`E_STAIR_WIDTH`](error-codes.md#e_stair_width)). v1 always draws **one straight flight**:
a narrower `width` centres the flight band in the footprint and leaves the remainder as an
un-drawn return/void, so a dog-leg stair is modelled as its footprint plus a narrower run
rather than as two flights.

**What it does to circulation.** The footprint obstructs the
[navigation grid](analysis.md#circulation--how-a-person-walks-the-plan) exactly like a piece
of furniture — you cannot walk over a lift shaft — **except** that the body-radius halo is
lifted outside its entry edge(s), so the landing you cross to reach the flight stays
walkable. A stair has one entry edge (the arrow's tail, so it moves with `dir`), an
escalator has both narrow ends (you step on at one and off at the other), a lift car is
entered from its south edge.

**Vertical identity.** In a plan made of [`level` blocks](#levels--a-multi-storey-building-v121),
a run carrying the **same id on two storeys is one shaft**. That single rule buys three
things:

- `describe()` reports it under `vertical.connections` (see
  [analysis.md](analysis.md#vertical-circulation--the-building-graph-v121));
- the upper storey is **reachable** — a floor with no exterior door of its own no longer
  raises `W_NO_ENTRANCE`, because you arrive in the room the shaft lands in;
- `validate --graph` counts it as a connector between the rooms it lands in on each floor.

Nothing is inferred from geometry: two flights at the same coordinates with different ids
are two different shafts. A run whose id appears on exactly one storey of a multi-storey
plan is [`W_STAIR_UNMATCHED`](error-codes.md#w_stair_unmatched) — advisory, so a top-floor
flight to a roof hatch simply carries the warning.

```arch
plan "Two-storey" {
  units mm
  level 1 "Ground" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=hall at (0,0) size 6000x6000 label "Hall" uses hall
    door id=front on shell at 15000 width 1000 swing into hall
    stair id=stair at (500,2000) size 900x2600 dir up
  }
  level 2 "First" {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=landing at (0,0) size 6000x6000 label "Landing" uses circulation
    window id=w on shell at 3000 width 1200
    stair id=stair at (500,2000) size 900x2600 dir down
  }
}
```

### Title block

```
title {
  project "<name>"
  drawn_by "<name>"
  date "<date>"
}
```

Rendered as a title block in the lower-right corner (with `scale` if set).

### Positioning axes (定位轴线)

```
axes {
  x at 0, 6000, 12000, 18000
  y at 0, 8000, 16000
}
```

An architectural drawing is not dimensioned from the paper edge — it is dimensioned
from a named grid of **structural datum lines**. `axes` declares that grid, in the
GB/T 50001 convention: `x` positions are vertical axes, `y` positions horizontal
ones, both in mm in the same coordinate space as everything else.

Each axis draws as a thin **dash-dot** line spanning the drawing with a short
protrusion past each end, tagged with a **circled label** at the bottom end (`x`
axes) or the left end (`y` axes) — placed outside any dimension chains, exactly where
a draughtsman puts it. The nodes go on the `axes` render pass and land on the CAD
layer **`A-GRID`**, so a DXF consumer can freeze the datum grid on its own.

**Labels are derived, never authored.** They fall out of sorted position, so
inserting an axis in the middle renumbers everything after it:

| Direction | Reading order | Labels |
|-----------|---------------|--------|
| `x` (vertical axes) | left to right (ascending `x`) | `1`, `2`, `3`, … |
| `y` (horizontal axes) | **bottom to top** — and `+y` points DOWN, so descending `y` | `A`, `B`, `C`, … |

- The letter sequence **skips `I`, `O` and `Z`** (they misread as `1`, `0` and `2` at
  drawing scale), giving 23 letters `A…Y`. Past the 23rd axis it continues `AA`, `AB`,
  … `AY`, `BA`, … — GB/T 50001 §6.2 permits either a doubled letter or a
  letter-with-subscript once the alphabet runs out; ArchLang takes the doubled form
  and continues it lexicographically, so no label ever repeats and no subscript glyph
  is needed. There is deliberately **no label syntax** in v1.20; a future release may
  add an explicit override.
- Positions are **expressions**, like every other coordinate — `let BAY = 6000` then
  `x at 0, BAY, 2 * BAY` is legal — and are **grid-snapped** by `grid <n>` (an
  off-grid datum would not line up with the rooms it dimensions).
- Positions are **sorted and deduped**: declaring the same datum twice collapses
  silently. That is declarative idempotence, not an error.
- Rows may appear in either order and repeat, and repeated `axes` blocks merge (both
  lists append), like `theme`.
- **The axes are what you declare — never what the compiler infers.** ArchLang does not
  guess your structural grid from the walls (see [ADR 0005](adr/0005-no-invisible-architect.md)).
- With `dims auto rooms` or `dims auto all`, the **middle dimension chain measures the
  axes** instead of the room boundaries — the GB/T axis chain (轴线间距). The switch is
  per direction: declaring only `x` axes leaves the vertical facades' chains on room
  boundaries. The chain stays outside the building at the same offset; only the ticks
  move.
- `describe()` reports them as facts (`axes.x` / `axes.y`, in label order — see
  [Analysis](analysis.md)). They are presentation + datum metadata: no axis becomes an
  element, gets an id, or can be referenced by a door/room clause.

### Sheet tables — room schedule & legend

```
plan "Clinic" {
  units mm
  dims auto all
  schedule rooms      # the ROOM SCHEDULE table
  legend              # the LEGEND table, derived from the plan
  # … walls, rooms, fixtures …
}
```

A finished sheet is not only the drawing: it carries tabular blocks in the margin that
let a reader audit the plan without measuring it. Both are **opt-in**, both draw in a
second row **below** the scale bar and title block (so they never cross a dimension
chain or an axis bubble), and the page grows to contain them. A plan that sets neither
renders exactly as before.

**`schedule rooms`** draws the room schedule (房间明细表):

| Column | Contents |
|--------|----------|
| `NO.` | 1-based **source order**, zero-padded to a uniform width (`01`…`09`, `001`…`100`). |
| `NAME` | The room's `label`, falling back to its `id` when unlabelled. |
| `AREA (m²)` | The room rectangle's area to two decimals — the same number `describe()` reports as `rooms[].area_m2`. |

A final **`TOTAL`** row closes the table with the same number as
`describe().totals.floor_area_m2`, so the drawn table and the JSON can never disagree.
`rooms` is the only subject in v1.20; the keyword takes one anyway so `doors`,
`windows` or `finishes` can be added later without a respelling — anything else is a
parse error with a did-you-mean, never a silently ignored word.

**`legend`** draws a legend derived closed-form from the drawing:

- one row per distinct **wall hatch** in use, its swatch filled with the very pattern
  the walls are filled with (`brick`, `poche`, …), in the Scene's stable order;
- one row per **fixture category** actually placed that has a plan symbol (`wc`,
  `basin`, `shower`, …), its swatch drawn with the real glyph, in catalog order.

Nothing is listed that is not drawn, and a category that renders as a plain labelled
rectangle gets no row (there is no symbol to explain). There is nothing to configure —
which is the point: the legend cannot drift from the drawing.

Both tables are ordinary `annotations`-pass primitives on the CAD layer **`A-ANNO`**, so
SVG, PNG, PDF and DXF all draw them from one implementation; the ASCII plan (`-f txt`)
has no sheet chrome and still has none. Every size derives from the drawing's size
system, so the tables scale with the sheet. `describe()` reports the schedule as
`schedule[]` (see [Analysis](analysis.md)); `legend` is pure rendering and adds no
field — every fact it shows is already in `furniture` and the source.

## Levels — a multi-storey building (v1.21)

```
plan "Two-storey house" {
  units mm
  paper A3 landscape        # settings are SHARED: one building, one sheet, one scale
  dims auto all
  let W = 8000

  level 1 "Ground floor" {
    wall id=shell exterior thickness 200 { (0,0) (W,0) (W,7000) (0,7000) close }
    room id=hall at (0,0) size 2200x7000 label "Hall" uses hall
    stair id=stair at (100,1500) size 900x2600 dir up
  }

  level 2 "First floor" {
    wall id=shell exterior thickness 200 { (0,0) (W,0) (W,7000) (0,7000) close }
    room id=landing at (0,0) size 2200x4600 label "Landing" uses circulation
    stair id=stair at (100,1500) size 900x2600 dir down
  }
}
```

A `level` block is **one storey**, and a storey is **one complete drawing**: its own
walls, rooms, dimension chains, axes, schedule and title block. `examples/two-storey.arch`
is the worked version of the sketch above.

**A plan is either single-storey or entirely levels.** Anything that draws belongs to
exactly one storey, so a `room`/`wall`/`door`/`for`/`strip`/component call sitting *beside*
a `level` block has no floor to belong to — that is
[`E_LEVEL_MIX`](error-codes.md#e_level_mix), reported on the offending statement. What
stays outside (and applies to **every** level):

- every plan **setting** — `units`, `grid`, `paper`, `scale`, `north`, `dims auto`,
  `title`, `axes`, `schedule`, `legend`, `theme`/`style`, `accTitle`/`accDescr`;
- **declarations** — `component` and `import`;
- the **plan-global scope** — `let` bindings and `set` defaults.

So `let W = 8000` written once is the same `W` on every floor, and one `component` can be
called from each level.

**Numbering.** Level numbers are integers and must be unique
([`E_LEVEL_DUP`](error-codes.md#e_level_dup)). `0` and negatives are legal — `level -1
"Basement"` — and storeys are drawn in **ascending** order, so the lowest level is page 1.
The optional name (`level 1 "Ground floor"`) is stamped into the title block as a `LEVEL`
row and reported by `describe()`. A `level` inside a block, a component, or another level
is [`E_LEVEL_NEST`](error-codes.md#e_level_nest) — to repeat content on several storeys,
put it in a `component` and call it from each.

**Ids are unique WITHIN a level**, not across the building. The same id on two storeys is
legal and means **vertical identity** — the `stair` above is the same shaft on both floors,
and a riser, a duct or a column keeps its name as it goes up. Since v1.21 that identity is
**operative** for the three [vertical-circulation
elements](#vertical-circulation--stair-elevator-escalator-v121): a `stair`/`elevator`/
`escalator` with one id on two storeys is a shaft, so the upper floor is reachable through
it and needs no exterior door of its own. (For every other element the shared id is still
just a name.)

**One building, one sheet.** `paper`/`scale` are resolved **once for the whole building**,
from the largest storey: auto-fit cannot hand the small top floor a finer scale than the
ground floor, and `W_SCALE_OVERFLOW` is raised once for the building rather than once per
page. Every page is therefore the same paper at the same scale — a drawing set.

**What comes out.** `compile()` returns `pages[]` — `{ level, name?, svg, scene }` per
storey, ascending — and `svg`/`scene`/`ast` keep meaning **page 1** (the lowest storey), so
a level-unaware consumer still gets a complete drawing. On the CLI:

```bash
arch compile house.arch --json          # writes house.L1.svg, house.L2.svg …; reports outputs[]
arch compile house.arch --level 2 -o upper.svg   # just that storey, to the plain target
arch compile house.arch --level 1 -o -           # `-o -` streams ONE drawing, so it needs --level
arch describe house.arch --json                  # top-level facts = lowest storey, plus levels[]
arch describe house.arch --level 2 --json        # read one storey (a display filter)
arch preview house.arch --level 2 -o upper.png   # look at one storey
```

Every format works per level (`-f svg|dxf|txt|pdf|png` each write `<stem>.L<level>.<ext>`);
a multi-page PDF is deliberately not built — one file per storey is one drawing per sheet.
`md` and `batch` render the lowest storey. Diagnostics aggregate across storeys and each
carries a `level`, so `lint`/`validate` gate on the whole building while still saying which
floor a warning is about; `arch repair` walks into every level and tags its changes the same
way.

## Zones — wings and departments (v1.22)

```
plan "Museum" {
  units mm
  schedule rooms

  zone west "West wing" {
    room id=lobby at (0,0) size 4000x8000 label "Lobby" uses hall

    zone galleries "West galleries" {
      room id=gal_a at (4000,0) size 4000x4000 label "Gallery A"
      room id=gal_b at (4000,4000) size 4000x4000 label "Gallery B"
    }
  }

  zone east "East wing" {
    room id=office at (8000,0) size 4000x4000 label "Office" uses office
    room id=store  at (8000,4000) size 4000x4000 label "Store" uses storage
  }
}
```

A `zone` block groups statements into a **wing, a department, a phase** — whatever
organisational unit the brief talks about. It is the answer to "how big is the west wing?"
on a building too large to hold in your head.

**A zone has zero geometric semantics.** Everything inside it resolves *exactly* as if the
`zone … { }` wrapper were deleted: the same coordinates, the same ids, the same auto-id
numbering, the same output bytes. Deleting every zone from a plan cannot change its
drawing — that law is pinned by a byte-identity test. Two consequences worth stating
plainly:

- **A zone is not a scope.** A `let` or a `set` written inside one is visible after the
  closing brace, exactly as it would be without the braces. (This is *why* the byte-identity
  law is total rather than approximate.)
- **A zone draws nothing** — no outline, no tint, no label on the drawing. The only place it
  becomes visible is the room schedule (below) and `describe()`.

**Membership is declared, never inferred.** A room is in the west wing because you wrote it
inside `zone west`, not because the compiler noticed it sits on the west side. ArchLang
reports facts and never plays architect ([ADR 0005](adr/0005-no-invisible-architect.md)) — a
zone is you telling it something it could not know.

**Zones nest, and the path is the identity.** `gal_a` above is in `west.galleries`; its
*innermost* zone is the one it belongs to directly. Membership then **rolls up**: the
`west` zone reports `lobby`, `gal_a` and `gal_b`. So zone areas deliberately overlap when
zones nest — summing them is not the plan total, and `totals.floor_area_m2` remains the one
whole-plan figure.

**Where a zone is legal.** Anywhere a statement is: at plan level, inside a `level` block,
inside a `for`/`if`/`while` body, inside a `component`. A zone is scoped to the storey it is
written on, so the same zone id on two levels is two separate groups. (A `level` inside a
zone is still [`E_LEVEL_NEST`](error-codes.md#e_level_nest), and a `zone` sitting beside the
level blocks of a multi-storey plan is [`E_LEVEL_MIX`](error-codes.md#e_level_mix) like any
other drawable statement — it belongs to a floor.) Re-declaring the same path merges into
the zone already declared; the first declaration's label wins.

**Reading the grouping back.** `describe()` gains a `zones[]` block — see
[Analysis](analysis.md#zones--the-declared-grouping) — and the CLI can read one wing at a
time:

```bash
arch describe museum.arch --json                        # rooms + zones[]: every wing, its rooms, its area
arch describe museum.arch --zone west --json            # just the west wing (nested zones roll up)
arch describe museum.arch --zone west.galleries --json  # just the nested one, by its dotted path
arch describe museum.arch --select zones --json         # the grouping alone
```

`--zone` is a **display filter** like `--room`/`--level`: `ok`, the diagnostics and the exit
code always come from the whole plan, so reading one wing can never make a broken building
look sound.

**With `schedule rooms`,** the drawn table groups its rows by zone — a heading row per
zone, a `SUBTOTAL` closing each group, and the usual `TOTAL` closing the table. The schedule
groups on the **innermost** zone, so every room appears exactly once and the subtotals add
up to the total (unlike `describe().zones`, which rolls up). Rooms outside every zone get a
trailing `(no zone)` group. A plan with no zones draws the flat table, byte for byte as
before.

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
  the furniture; a modelled **access graph** (entrances, per-room reachability,
  door-hop depth from the entrance, and the clear-width bottleneck on the way in);
  and a **circulation** model — see [Circulation](#circulation) below.
- **`lint(source)`** → advisory `W_*` warnings about habitability (a room with no
  way in, a windowless bedroom, a too-small room, a door leaf sweeping onto a
  fixture, a wet room reached only through a bedroom, a walk that squeezes too
  narrow — `W_PATH_TOO_NARROW` — or wanders far from a straight line —
  `W_CIRCUITOUS_PATH`…). Pick a ruleset with `--profile`:

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

### Circulation

`describe(source).circulation` models how a person actually **walks** the plan.
Distances are measured on a nav grid whose free cells are eroded by a body radius,
so a walk only passes where a person really fits (through doors and cased openings,
not through furniture pinches). It is `null` when the plan has no modelled exterior
entrance — there is nothing to measure a walk from — otherwise a `CirculationModel`:

```ts
interface CirculationModel {
  entranceId: string;   // door the walk starts from (first entrance in source order)
  cellSizeMm: number;   // nav-grid quantum every distance is rounded to (coarse)
  bodyRadiusMm: number; // obstacles were inflated by this
  rooms: {              // one entry per room reachable from the entrance
    roomId: string;
    walkDistanceMm: number;        // entrance → room, over the eroded grid
    bottleneckClearWidthMm: number;// narrowest unavoidable clear width on the way in
    detourRatio: number;           // walkDistance ÷ straight-line (≥ ~1)
  }[];
  routes: {             // key functional routes (kitchen→living, bedroom→bath)
    fromRoomId: string; toRoomId: string;
    walkDistanceMm: number; bottleneckClearWidthMm: number; detourRatio: number;
  }[];
}
```

Two advisory lint rules read this model (see [ADR 0008](adr/0008-circulation-as-facts.md)):

- **`W_PATH_TOO_NARROW`** — a walk pinches below `minPathClearWidthMm` (default
  **700 mm**; the `accessibility-advisory` profile raises it to **900 mm**).
- **`W_CIRCUITOUS_PATH`** — a room's `detourRatio` exceeds `maxDetourRatio`
  (**3.0×**), i.e. it's reached the long way round.

The same model backs an **opt-in render overlay** (see
[`overlays`](#compilation-result) below) — the entrance→room walks, their pinch
markers, and key routes drawn on top of the plan.

### Correcting a plan — `arch repair`

Because lint reports rather than rearranges, ArchLang ships an **explicit,
opt-in** source-to-source corrector: `arch repair plan.arch -o fixed.arch` emits new
`.arch` with furniture pushed out of walls, off doorway approaches and door swings,
overlaps separated, and stray fixtures relocated into their room and snapped to a
wall — plus a change log (see [ADR 0006](adr/0006-solver-as-explicit-transform.md)).
It is deterministic and never guesses topology: it will **not** add a door or window
(that is a design choice), and a **circulation guard** declines any furniture move
that would newly pinch a walk below the lint threshold (reporting it in `unresolved`
instead). Use [`SKILL.md`](../SKILL.md) for the full repair-then-gate loop.

**It reads every furniture statement, and never goes quiet.** The scan walks *into*
`for` / `while` / `if` bodies and component definitions, so scripted pieces are no
longer invisible to it, and it rewrites a placement **in the form you wrote it**:

| How the piece is written | What repair rewrites |
|---|---|
| `at (x,y)` with literal coordinates | the `at` point |
| `in <room> anchor <a> [flush] [inset N]` | the `inset`, minimally — in the wall-face frame when the placement is `flush` |
| the same, when the move runs across the anchored axis | the whole placement becomes an absolute `at`, carrying the `rotate` the anchor had *derived* |
| a statement with **more than one** resolved instance (a `for` body, a component used twice) | nothing — reported |
| expression coordinates / an expression `inset` | nothing — reported (rewriting would discard your arithmetic) |
| `against wall <id> …` | nothing — the wall is authoritative; reported |

Anything in the last three rows is still *accounted for*: if a mover or orientation
pass flags it, the piece appears in `unresolved` with the fault **and** the reason it
was left alone (naming the `for`/component and the resolved piece ids for a scripted
statement) — so a scripted collision can never read as a clean run. Every entry, change
or note, carries the statement's byte `span`. A wall-anchored fixture is also an
*obstacle*: a movable piece placed after it is separated off it.

### Comparing two plans — `diffPlans`

Where `describe(source)` turns **one** plan into facts, `diffPlans(sourceA, sourceB, opts?)`
turns **two** into the *delta* between them. It runs entirely on top of `describe()` — no
geometry of its own — so it is equally pure, deterministic, and never throws: if either side
fails to resolve it returns `{ ok: false, … }` with the collected error diagnostics.

```ts
import { diffPlans, type PlanDiff } from "@chanmeng666/archlang";
const d = diffPlans(before, after);
if (d.ok) for (const s of d.summary) console.log(s);
```

The returned `PlanDiff` reports:

- **`rooms`** — each room `added` / `removed` / `resized` / `relabeled`, with before/after
  area and, for a resize, the signed mm delta of each bbox edge (`top`/`bottom`/`left`/`right`,
  after − before, in plan coordinates).
- **`openings`** — doors, windows, and openings `added` / `removed` / `resized` (before/after
  clear width in mm, and what they sit `between`).
- **`furniture`** — fixtures `added` / `removed`, by category.
- **`circulation`** — per-room walk-distance and bottleneck (pinch) deltas, from the
  [circulation](#circulation) model.
- **`totals`** — floor area and room count before and after.
- **`summary`** — human-readable one-line sentences describing each change above.

**Matching** is by **id first, then a unique-label rescue**: a room/opening/fixture is paired
across the two plans by its resolved id; if a room is unmatched by id (positional auto-ids can
shift when statements are added), it is rescued only when exactly one room on the other side
carries the same `label`. An `id` here is the element's **resolved id** — the explicit `id=` if
you wrote one, otherwise the deterministic auto id (e.g. `room_1`).

**Noise thresholds** keep sub-perceptual jitter out of the diff: a room counts as *resized* only
past **0.05 m²** of area drift or **10 mm** on any bbox edge; a circulation change is reported only
past **250 mm** of walk distance or **50 mm** of pinch width. Differences below these are ignored.

The **`summary` sentences are stable, rendered strings** — their exact wording is a frozen part of
the API (downstream UIs display them verbatim), so treat them as presentation, not as a parse
target; read the structured `rooms` / `openings` / `furniture` / `circulation` fields when you need
to branch on a change.

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
| TXT | `renderAscii(scene)` | `arch compile p.arch -f txt` | none (zero-dep ASCII plan) |
| PDF | `toPdf(scene)` | `arch compile p.arch -f pdf` | optional `pdfkit` (vector, text selectable) |
| PNG | `renderPng(scene)` | `arch compile p.arch -f png` | optional `@resvg/resvg-js` (deterministic raster) |

The optional dependencies are lazily `import()`ed, so the core never requires
them and a default install emits SVG, DXF and TXT with nothing extra. The PNG backend
rasterizes the SVG with a bundled font (no system fonts), so output is
byte-identical across machines.

The **TXT** backend draws the plan as an ASCII/Unicode grid — no image, no binary, no
dependency. It exists so a text-only agent (or a terminal) can *see* the layout at a
glance; tune it with `--cols <n>` and `--charset unicode|ascii`.

For a quick **viewable** raster, `arch preview p.arch -o p.png` renders PNG at a
sensible on-screen width (~1600 px) instead of the high-resolution native size — and
where the optional renderer is absent it reports the catalogued `E_PNG_DEPENDENCY`
(with a `fix`), or fetches it with `--install`. Render many files at once with
`arch batch …`, and embed plans in Markdown with `arch md doc.md` (renders each
fenced `arch` block to an image link). `arch manifest --json` prints this whole CLI
surface — commands, flags, formats, lint profiles, error codes — as structured data.

To read that surface rather than parse it: `arch help` lists every command,
`arch <cmd> --help` prints one command's flags and worked examples, and
`arch --version` prints the version. Help and the
[CLI reference](https://archlang.uk/cli) are both rendered from the
manifest, so none of the three can disagree.

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

`compile(source, opts?)` options:

- `width` — px for the `<svg>`; height derived from aspect ratio.
- `noCache` — bypass the memoization cache.
- `theme` — theme overrides layered on top of the plan's `theme { … }` directive.
- `annotate` — stamp each drawn primitive that has a source span with a
  `data-span="start:end"` attribute so tooling can map a clicked element back to its
  source. **Default output is byte-identical** without it (see
  [ADR 0007](adr/0007-opt-in-source-annotation.md)).
- `overlays` — opt-in diagnostic overlays drawn on top of the plan. Currently only
  `["circulation"]` (the entrance→room walks, bottleneck markers, and key routes from
  the [circulation](#circulation) model — [ADR 0008](adr/0008-circulation-as-facts.md));
  also via `arch compile --overlay circulation`. Default output is **byte-identical**
  without it, so shipped SVGs stay clean.
- `accessible` — emit a self-describing SVG for assistive tech and machine consumers: the
  `<svg>` gains `role="img"` + `aria-labelledby` and a `<title>`/`<desc>` pair. The title is
  the plan name (or [`accTitle`](#accessible-metadata-acctitle-accdescr) when declared) and
  the description is a derived one-sentence caption (`describe().caption` — the same sentence,
  or [`accDescr`](#accessible-metadata-acctitle-accdescr) when declared). Also via
  `arch compile --accessible`. **Default output is byte-identical** without it (see
  [ADR 0009](adr/0009-ai-first-context-and-distribution.md)).
- `onError` — set to `"svg"` to render a **broken** plan as a deterministic, self-describing
  error-card SVG (severity, code, `line:col`, message, catalogued fix) instead of returning
  an empty `svg`. Errors, diagnostics, and exit codes are unchanged; **without this opt-in a
  failing plan still produces no image** (`svg: ""`). Also via `--error-svg` on `arch compile`,
  `arch preview`, and `arch md`. The card renderer is exported as `renderErrorSvg`
  (see [ADR 0009](adr/0009-ai-first-context-and-distribution.md)).

`annotate`, `overlays`, `accessible`, and `onError: "svg"` are the only options that change
SVG output, and all are opt-in — the default `compile(source)` is byte-stable and
snapshot-tested.

### Source anchors (annotate mode)

Alongside `data-span`, `annotate` also stamps two element-identity attributes on every
element primitive — **`data-arch-id`** and **`data-arch-kind`** — so a hit-testing or
selection UI can map a clicked SVG shape back to the element (and thence its source) it
came from:

- **`data-arch-id`** is the element's **resolved id** — the explicit `id=` if you wrote one,
  otherwise the deterministic auto id (e.g. `room_1`).
- **`data-arch-kind`** is the element's kind. Anchors are stamped on **every element kind
  except `wall`**, so the value is currently one of `room`, `door`, `window`, `opening`,
  `furniture`, `dim`, or `column`. Treat this as **open-ended, not a closed enum** — the set
  is exactly the non-wall members of the compiler's `ElementKind` union and grows whenever a
  new element kind is added, so a consumer should switch on the kinds it knows and tolerate
  unrecognized ones rather than assume a fixed list.

**Walls carry no anchors.** A single wall in the SVG is unioned geometry stitched across
many source statements, so there is no one element to point back to; anchors are stamped on
the discrete element primitives only. Like `data-span`, these attributes appear **only** under
`annotate` — default output stays byte-identical (see
[ADR 0007](adr/0007-opt-in-source-annotation.md)).

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
