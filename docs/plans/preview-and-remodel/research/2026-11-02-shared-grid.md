# One grid for every storey, and the stair's bounds

Issue #345, backlog P2-4, and D27. Measured on `main` at 3f3060a3. The plans and the probes are the
executor's scratch; everything quoted here was printed by the built core.

## 1. What exists

Most of the grid was already there, so this card is small.

| The question | What the core does on `main` |
|---|---|
| Does a plan-level `axes` reach a `level`? | Yes. A storey is a synthetic plan that keeps the plan's settings, so each storey draws the axes and reports them, and `keep on axis 2 w1` measures on each |
| A per-level override? | None as a form: `axes` inside a `level` is `E_PARSE` |
| Can a `let` inside a `level` move the grid? | **Yes, silently.** `axes { x at 0, BAY }` with `let BAY = 6000` on level 1 and `7000` on level 2 draws two grids, and a keep on each storey holds against its own |
| What does an opening write? | `at axis 2` (ADR 0028 §5) |
| What does a wall or a column write? | Numbers, or a `let` shared with the block. No address |
| What does a room write? | The same |
| What checks a wall? | `keep on axis 2 w1`, also through a turned `place`: `keep on axis 2 w.w1` reads the carried wall in plan coordinates |
| What checks a column? | Nothing: `keep on axis 2 c1` is `E_KEEP_MEASURE`, "A column is not a line a keep can align" |
| Inside a component? | `at axis` is refused: an instance has no axes. A `keep` is refused there too (`E_KEEP_PLACEMENT`) |
| A label that does not exist? | Refused on both existing routes (`E_KEEP_TARGET`, `E_OPENING_DATUM`) |

So three things are missing: an address a wall, a column or a room can write; a check that reads a
column; and a warning for the one way the grid stops being shared.

## 2. Decisions

### An axis reads as a coordinate: `axis.3`, `axis.B`

```text
axes { x at 0, 6000, 12000 y at 0, 5000 }
level 1 {
  wall id=g2 partition thickness 200 { (axis.2, axis.A) (axis.2, axis.B) }
  column id=c at (axis.3 - 200, axis.B - 200) size 400x400
  keep on axis 2 g2
  keep on axis 3 c
  keep on axis B c
}
```

It is one more datum: a dotted name no binding can spell, read through the reader `hall.top` is read
through, in plan coordinates, as the axis is drawn (snapped). It adds no statement and no keyword.

- *Alternative:* `A/3` for a crossing, the way a drawing says it. It reads as a division, and it would
  need a point grammar for a thing that is rarely the point wanted: a column's `at` is its corner, so
  its corner would land on the crossing. Two numbers an author can offset are what is wanted.
- *Alternative:* `at axis 3` on walls and columns. A wall has one line per point and a point has two
  coordinates, so this is a second point grammar too.
- *Reverse if:* first-contact runs keep writing `A/3`, or the two-keep form for a column reads badly
  enough that a crossing earns its own word.

**The lexer.** `axis.B` was already one word. `axis.3` was `axis` and `.3`, so the lexer takes a digit
after `axis.` as well, for that word alone. `axis` beside a number with no space between them was
never a legal expression.

**`at axis.2` on an opening stands on the axis**, the same as `at axis 2`. Read as a number it would
be that many millimetres along the wall from its start, and land somewhere else without a word.

### Where it reads, and where it is refused

| Where | What happens | Why |
|---|---|---|
| A room's `at` and `size`, a wall, a column, furniture, a dimension: any statement of the plan or a storey | Reads | The axes are evaluated before the root group's rooms, so unlike `hall.top` it also reads in the room pass |
| A `let`, a loop bound, a condition, a `place … at`, a component argument, a plan setting | `E_DATUM_BEFORE_ROOMS`, naming the shared `let` as the route | The axes read every plan-level `let`, wherever it sits, so they exist only after the expansion those statements are part of |
| The body of a user function | `E_DATUM_BEFORE_ROOMS` | As `hall.top`: pass it as an argument, from a statement |
| A statement inside a `place`d component | `E_UNKNOWN_REF`, saying why | An instance resolves in its own frame and never reaches out (ADR 0016 §3) |
| A legacy bare call of a component | Reads | It is a macro: its statements stand in the plan |
| A label the plan does not declare | `E_UNKNOWN_REF` at the datum, with the nearest label | A reference that does not exist is a diagnostic |

**Through `place`.** A component's coordinates are its own, so what crosses a frame is the check, not
the address: `place wing() as w at (BAY, 0) rotate 90`, with `BAY` a `let` the `axes` block also reads,
and `keep on axis 2 w.c1` from the storey, which reads the carried column in plan coordinates under
any turn or mirror.

- *Alternative:* evaluate the axes early, on the first read during expansion, so that
  `place wing() at (axis.2, axis.A)` works. Rejected for now: a `let` written after the read would be
  missing, a reassignment after it would leave the read and the drawn axis apart without a word, and
  the shared `let` already says the same thing.
- *Alternative:* pull the axis back through the frame inside a component. Rejected: the same component
  would draw differently per placement, and under a quarter turn a plan `x` line is a local `y`, so
  the value would land in a slot that does not mean it. It breaks the equivariance laws by design.
- *Reverse if:* authors keep writing `axis.2` in a `place … at` after the diagnostic. Then the block is
  hoisted, with a refusal when a binding it reads moves after the read.

### The check is `keep on axis`, now for a column too

`keep on axis <label> <wall|column>`. A column has no line of its own, so this form alone reads it, at
its centre across the axis; two keeps hold it on a crossing. `keep align` and the others still refuse
a column. An auto id is refused as for any keep. A residual is on the 0.001 mm lattice as a centre
line's is, so a 401 mm column cannot round its way on.

- *Alternative:* a lint rule that every wall and column stands on an axis. Rejected: which walls belong
  on the grid is the author's to say (ADR 0005). A partition off the grid is not a defect.
- *Alternative:* read a column by its `at`. Rejected: that is a corner, and the size would then decide
  whether it passes.
- *Reverse if:* a plan really does want a column held by one face (`keep offset` could take it).

### One grid, no override

No per-level override: `axes` stays refused in a `level`. The one way round is a `let` inside a level,
which reaches the block because each storey evaluates it. That stays legal, since it compiled before,
and `W_AXES_DIFFER` now says so, once, at the block.

- *Alternative:* an override form. Rejected: nobody has asked, and the point of the card is one grid.
- *Alternative:* evaluate the block against the plan's bindings alone. Rejected for now: a plan that
  compiles today would stop.
- *Reverse if:* a real building needs a storey set out on another grid, or the warning fires on plans
  that meant it.

**No structural word** (D25). A grid is geometry: lines with labels. Nothing here says load, bearing or
structure, and `column` stays what it is, a drawn rectangle.

## 3. Consequences by surface

| Surface | Effect |
|---|---|
| Drawing, `lint()` | None of its own: an axis read is a number |
| `describe --facts depends` | An element reading `axis.3` lists it under `axes`, as `at axis 3` does, and not under `params` |
| `impact` | Follows from that row: move an axis and the element reading it is `changed`, with `via: axis` |
| Plan JSON | Coordinates are exported resolved, so the read does not survive the round trip, as `at axis` does not |
| `format` | A dotted reference prints as written |
| GBNF | `ref` admits `axis.3` |
| Steps | One per axis per read, charged before the search, as `at axis` pays. A plan that reads none pays nothing |

## 4. The byte law

A plan that reads no axis by `axis.<label>`, holds no column with `keep on axis` and draws no two grids
resolves, draws, describes and lints exactly as before, on every payload including steps.
`test/shared-grid-byte-identity.test.ts` pins it; `test/fixtures/shared-grid/shared-grid.arch` writes
the form. The one sanctioned move is the wording of two refusals a plan only reaches by writing the
form: `keep on axis 2 c`, now valid, and `axis.3` in an expression, which was `E_PARSE`.

## 5. Left as it stands

- **`keep stacked` refuses a wall.** D25 and the iron law name it as the route for a cross-storey wall
  check, and the core says "A wall has no rectangular footprint to stack". `keep on axis` on each
  storey does that job for a wall on the grid; a wall off the grid has no check.
- **`keep stacked` refuses a column**, though a column has `at` and `size`.
