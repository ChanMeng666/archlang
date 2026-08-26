# Furniture & Fixtures

`furniture` places a piece of furniture or a built-in fixture into a plan. Every
catalogued kind draws a **real plan symbol** — a WC with a cistern and a seat, a bed
with a headboard and pillows, a wardrobe with hanging scallops — in the same drawing
vocabulary as the door arcs and window panes. Anything ArchLang doesn't know still
renders as a **labelled rectangle**, which is the escape hatch for a piece the
catalogue has no word for.

Where you put it matters to the [soundness checks](analysis.md): the linter knows a WC
should have its back to a wall, that a bath needs a wet fixture, and that a door leaf
should not sweep across a basin.

This page covers the placement modes, the symbol catalogue, how a symbol is oriented
and sized, the importable fixture library, and the lint rules that key off furniture.
The one-line grammar lives in the
[language reference](language-reference.md#furniture).

## Three placement modes

A piece is positioned **absolutely** by its top-left corner, **snapped against a
wall** so its back sits on the wall face, or **anchored inside a room**'s box. The two
non-absolute modes derive the piece's rotation for you.

| Mode | Grammar | You give | ArchLang derives |
|------|---------|----------|------------------|
| **Absolute** | `furniture <kind> at (x,y) size <w>x<h> [rotate 0\|90\|180\|270] [in <room>]` | corner, footprint, optional quarter-turn | nothing — what you write is what's drawn |
| **Against wall** | `furniture <kind> against wall <ref> [segment <n>] [offset <mm>] [side left\|right] [size <along>x<depth>] [in <room>]` | which wall, how far along, optionally a depth | the position **and** the rotation, from the wall — plus the **footprint**, if the kind has one and you omit `size` |
| **In a room** | `furniture <kind> in <room> centered\|anchor <a> [flush] [inset <mm>] size <w>x<h> [rotate …]` | which room, which corner/edge, footprint | the position from the room's box (or, with `flush`, from the backing wall's face), and — for a kind whose facing means something — the rotation from the wall the anchor names |

```arch static
# Absolute: a bed in the top-left, turned a quarter turn so its head is on the left wall.
furniture bed at (4300,300) size 1500x2000 rotate 90 in r_bed

# Against a wall: a 600-mm-deep counter run 1800 mm long, snapped to the north wall,
# starting 300 mm in from the wall's start, sitting on the interior (room) side.
furniture counter against wall north offset 300 side left size 1800x600 in r_kitchen

# Against a wall with NO size: the catalogued footprint is used (a fridge is 600 along
# the wall by 650 deep), so the only numbers left are the ones this plan chooses.
furniture fridge against wall w_west offset 400 in r_kitchen

# In a room: a WC on the bathroom's south edge — `rotate 180` (cistern to that wall) is
# derived, and `flush` puts its back on that wall's inner face (no thickness to work out).
furniture wc in r_bath anchor bottom flush size 400x700
```

- **`rotate`** turns the footprint a whole quarter-turn about its centre (`0`, `90`,
  `180`, or `270` — any other value is [`E_FURN_ROTATE`](error-codes.md)). It is
  exact integer geometry, so the output stays byte-stable.
- **`against wall <ref>`** snaps the piece's back onto a wall named by `id` or kind.
  - `segment <n>` selects which leg of a multi-point wall (0-based) to sit against.
  - `offset <mm>` slides the piece along that segment from its start.
  - `side left|right` picks which face of the wall to sit on (relative to the
    segment's direction); when you also give `in <room>`, the interior side is
    inferred for you.
  - `size` may be **omitted** for any kind with a catalogued footprint (the "Footprint"
    column below) — it is read as `along × depth`, along the wall and into the room.
    A kind with no footprint and no `size` is [`E_FURN_SIZE`](error-codes.md).
  - The rotation is **derived from the wall**, so combining `against` with an
    explicit `rotate` is an error ([`E_FURN_AGAINST`](error-codes.md)).
- **`in <room>`** records the owning room (by `id`). A trailing `in <room>` doesn't
  move the piece — it lets the linter check the piece is actually inside that room and
  lets `against` infer the interior side. A non-existent id is
  [`E_FURN_ROOM`](error-codes.md). The leading form (`in <room> centered\|anchor …`)
  both positions and owns the piece.
- **`flush` measures the inset from the wall FACE.** A room's rectangle runs along wall
  **centerlines**, so `anchor bottom` alone leaves the piece's back half a wall thickness
  inside the solid — which is why you would otherwise write `inset 100` for a 200-mm wall
  you never named ([`W_FURNITURE_WALL_COLLISION`](error-codes.md) if you forget). `flush`
  re-bases `inset` (default still `0`) onto the **inner face** of the wall behind each
  anchored edge — centerline + thickness / 2, toward the room — so `anchor bottom flush`
  lands on the plaster and `anchor bottom flush inset 50` sits 50 mm off it. It applies
  per edge and independently (a corner anchor can be flush on one edge only), an anchored
  edge with no wall behind it keeps the room-rectangle reference, and it needs an anchored
  edge at all: `centered` / `anchor center` is [`E_FURN_FLUSH`](error-codes.md). Write it
  **before** `inset`, whose reference it changes.
- **`anchor <edge>` also aims a piece.** An anchor names the wall(s) the piece is
  pushed against, so for a kind whose facing means something the quarter-turn is
  derived — no `rotate` to work out by hand. It is derived only when the answer is
  **unique** (ADR 0005): the anchored edge must have a wall behind it, and the
  footprint's aspect must allow that edge to be the back (a 400 × 700 WC is 400 *along*
  the wall and 700 *deep*, so it can only back onto a horizontal edge). `anchor
  bottom-left` in a walled corner therefore still has one answer for that WC, while a
  square 600 × 600 counter in the same corner has two — so nothing is derived and
  [`W_FIXTURE_BACK_TO_ROOM`](error-codes.md) asks you to pick. An explicit `rotate`
  always wins.

## The symbol catalogue

Thirty-two families, fifty-one names with the aliases, and **every one of them draws**.
The tables below are grouped by the room the pieces belong to.

Three columns need a word of explanation:

- **Footprint** is the catalogued `along × depth` in millimetres — the size
  `against wall` uses when you omit `size`. A dash means the kind has none, so `size` is
  required there.
- **Facing** says what ArchLang will do about which way the piece points.
  **Derived** means the symbol has an unmistakable back — a cistern, a tap, a nosing, a
  headboard, a wardrobe's door line — so an anchor can derive the quarter-turn and
  [`W_FIXTURE_BACK_TO_ROOM`](error-codes.md) flags a piece against a wall that faces the
  wrong way. **Symmetric** means the symbol is drawn so that a quarter-turn changes
  nothing, so its facing carries no meaning and is neither derived nor checked.
  **Free** means the piece is *drawn* with a front but is arranged rather than installed
  — a sofa's back to the room is a room-divider layout, not a defect — so nothing is
  derived and nothing is warned about.
- **Wall** marks the kinds that carry `requiresWall`, which means **services** and
  nothing else: supply, waste, venting, or hanging off the wall by definition. Those are
  the kinds [`W_FIXTURE_FLOATING`](error-codes.md) applies to. A bookcase is not one of
  them — a library's stacks are free-standing runs mid-floor, which is what stacks are.

### Bath

| Kind (and aliases) | Symbol | Footprint | Facing | Wall |
|---|---|---|---|---|
| `wc` · `toilet` | cistern across the back with its lid lip and flush button, bowl and seat ring in front | 400 × 700 | derived | ✓ |
| `basin` · `lavatory` | vanity slab with an inset oval bowl, tap block, spout and drain — **two bowls** on a long enough slab | 600 × 450 | derived | ✓ |
| `shower` | tray with an inset rim, both diagonals across the inner tray, and a centre drain | 900 × 900 | symmetric | ✓ |
| `bathtub` · `tub` · `bath` | eased rim, an inset well, the tap at the head end and the waste on the centreline | 1700 × 700 | derived | ✓ |

The tub's rim is deliberately **uneven** — thicker at the tap end than at the foot — so
the drawing says which end you get in at. `lavatory` is the one alias that differs from
its head: it does **not** count as a wet fixture for
[`W_ROOM_NO_FIXTURE`](error-codes.md), which has always been true of it, while `basin`
does.

### Kitchen & utility

| Kind (and aliases) | Symbol | Footprint | Facing | Wall |
|---|---|---|---|---|
| `kitchen_sink` · `sink` | counter slab, **two** eased bowls each with a drain, and a tap with its spout at the back | 800 × 600 | derived | ✓ |
| `counter` · `worktop` | slab with a nosing line inside the front edge and one division tick per 600 mm base-cabinet module | 600 × 600 | derived | ✓ |
| `stove` · `hob` · `cooktop` | slab with four burners as concentric rings and the control rail across the front | 600 × 600 | derived | ✓ |
| `fridge` · `refrigerator` | carcass, the freezer/fridge door split, and a door-handle stub | 600 × 650 | derived | ✓ |
| `oven` | carcass with an inset door line across the front and the round door window | — | free | |
| `dishwasher` | carcass plus the door dial that tells it from a blank base unit | 600 × 600 | derived | ✓ |
| `island` | slab with its overhang nosing on **all four** sides | — | symmetric | |
| `upper_cabinet` · `wall_cabinet` | carcass and centre line, drawn **entirely dashed** | 600 × 350 | derived | ✓ |
| `washer` · `washing_machine` | carcass, the door, and the drum inside it | 600 × 600 | derived | ✓ |
| `dryer` | the same carcass and door, with **three chords** across the drum | 600 × 600 | derived | ✓ |

`washer` and `dryer` are the same box at the same size and stand side by side in most
utility rooms, so they are drawn to differ by *shape*: a glyph carries no text, so a
letter is not available to tell them apart even if it were good drafting.

`island` is free-standing **by definition** — that is what makes it an island — and it
is approached from every side, so it has no back and no frontal clearance. Seating round
it is a `stool`, a separate kind with its own symbol.

### Bedroom

| Kind (and aliases) | Symbol | Footprint | Facing | Wall |
|---|---|---|---|---|
| `bed` | mattress, headboard band at the head, **one or two pillows**, and the turned-down sheet with its fold diagonal | 1500 × 2000 | derived | |
| `double_bed` | the same drawing — its wider footprint is what earns it the second pillow | 1800 × 2000 | derived | |
| `nightstand` · `bedside_table` | carcass, drawer front, and the lamp ring on top | 450 × 400 | derived | |
| `wardrobe` · `robe` · `closet` | carcass, the hanging rail at mid-depth with its **clothes-hanger scallops**, and the centre door split | 1800 × 600 | derived | |

None of these carries `requiresWall` — a bed needs no pipe — but all four are
**directional**, because the symbol has a back worth turning toward a wall. That is what
lets `anchor top` derive `rotate 0` for a bed and put its headboard where you meant it.

The wardrobe's scallops **tile** the rail: their count comes from the carcass aspect and
the radius is then half a cell, so consecutive semicircles meet exactly, end to end, with
no gap and no overlap at any size.

### Living & dining

| Kind (and aliases) | Symbol | Footprint | Facing | Wall |
|---|---|---|---|---|
| `sofa` · `couch` | eased body, a back band along the rear edge, an arm at each end, and the cushion divisions between them | — | free | |
| `armchair` | eased body, a **true arc** for the curved back, and the seat cushion | — | free | |
| `coffee_table` | eased top with the inset that reads as its edge | — | symmetric | |
| `tv_unit` | carcass, the screen against the back edge, and the shelf line | 1500 × 450 | derived | |
| `table` | square top with an inset edge | — | symmetric | |
| `dining_table` | the table inside a chair-zone band, **with the chairs drawn in it** | — | symmetric | |
| `chair` | seat, back band along the rear edge, and the cushion | — | free | |
| `stool` · `barstool` | a round seat with no back — both prims true circles about the footprint centre | — | symmetric | |
| `bench` | slab with two slat lines running **lengthwise**, along whichever axis is longer | — | free | |

`sofa`, `armchair`, `chair` and `bench` are deliberately **free**: seating is arranged,
not installed, so ArchLang neither derives a rotation for them nor warns when one faces
the room. `tv_unit` is the exception in this group — it is directional (a media wall has
a front) but still carries no services, so floating one as a room divider raises nothing.

### Office & misc

| Kind (and aliases) | Symbol | Footprint | Facing | Wall |
|---|---|---|---|---|
| `desk` | slab with the modesty panel across its back and the working edge stepped in | — | free | |
| `office_chair` | round seat, a **true arc** back over it, and an armrest each side | — | free | |
| `bookshelf` · `bookcase` · `shelf` | carcass with its shelf bays ticked off along the run, read from the footprint's own long axis | 900 × 300 | derived | |
| `plant` · `planter` | pot as a true circle, foliage as a ring of eight radials at a 45° pitch | — | symmetric | |
| `car` | body, cabin, the two screens, and a wing mirror each side | — | free | |

`car` earns its place for the same reason `bench` does: it is drawn on real plans (a
carport, a driveway, a garage) and a model asked for one will write the word whether or
not the catalogue knows it. Its long axis is the driving direction, drawn top-to-bottom
like every other symbol's depth, so `rotate 90` parks it across a garage.

## How a symbol is drawn

**Back on top.** Every symbol is drawn with the side that goes against a wall along the
**top** edge of its footprint, then quarter-turned about the footprint centre. So
`rotate 0` faces the back **north**, `90` east, `180` south, `270` west. Orient by the
wall the piece sits against, or let **`against wall`** / **`in <room> anchor <edge>`**
do it for you.

**A drawn symbol ignores its `label`.** A `label` reaches the drawing only through the
labelled-rectangle fallback — that is, only for a kind the catalogue does **not** know.
Writing `furniture bed … label "Bed"` is harmless but inert: the word stays in the source
and in `arch describe --json`, and no text appears in the SVG. The fallback is the escape
hatch, and it is deliberate: an uncatalogued word (`furniture piano at … label "Piano"`)
still draws a rectangle with its name in it, which is how you annotate something ArchLang
has no symbol for.

**Two symbols read their own footprint and change what they draw.** Neither branch looks
at the category word, because the shape is the honest datum:

- **`basin`** draws **two** bowls, at the quarter points, once the slab is at least
  **2.2** times as wide as it is deep — the vanity convention. Below that it draws one,
  centred.
- **`bed`** / `double_bed` draw **two** pillows once the mattress aspect (`w / h`)
  reaches **0.6**, and one below it. On a 2000-long bed that falls at exactly the
  conventional 1200 mm single/double split, so `furniture bed … size 1500x2000` draws the
  double it plainly is and a `double_bed` squeezed to 900 draws the single it has become.

**`upper_cabinet` is drawn entirely dashed**, and is the only symbol that is. A wall
cabinet hangs *above* the horizontal cut a floor plan is taken at, so drafting convention
draws it dashed — present, but not cut — and unfilled, so the base cabinet or appliance it
overhangs still reads through it. There is no syntax for saying "draw this piece above the
cut plane" about anything else; `upper_cabinet` is dashed because of what it is.

**`dining_table`'s footprint includes its chairs.** `furniture dining_table … size WxH`
declares the whole **eating zone**: the table is the inner rectangle inside a chair-zone
band, and the seats are drawn in that band. That is the dimension a plan needs to check —
a table you cannot pull a chair out of is not a table that fits — so a 1200 mm table is
authored as roughly 2400 mm of footprint. The seat count comes from the aspect, plus one
at each short end when the table is under 2:1 (a square table seats its ends; a refectory
bench does not).

**The ASCII plan shows none of this.** `arch compile -f txt` (and `arch preview --ascii`)
reduces each piece to a **single uppercase letter** at its centre — the first letter of
its category — because a character grid has no room for a symbol. The CLI turns on the
`annotate` metadata the text backend needs to recover a category, so this works out of the
box; a *library* caller passing a Scene built without `compile(src, { annotate: true })`
gets no marker at all for a drawn piece.

## Sizes: catalogued footprints and the fixture library

The **Footprint** column above is what `against wall` uses when you omit `size`, so the
common case has no numbers in it at all:

```arch static
furniture fridge       against wall w_west offset 400  in r_kitchen
furniture stove        against wall w_west offset 1200 in r_kitchen
furniture kitchen_sink against wall w_west offset 2000 in r_kitchen
```

The other placement modes always need an explicit `size` — an `at (x,y)` or `in <room>`
piece has no wall to tell `along` from `depth`, so there is no unique answer to derive
([`E_FURN_SIZE`](error-codes.md)).

Two importable libraries package the standard pieces at typical residential sizes, for
when you would rather call a component than write a footprint:

```arch static
import "lib/fixtures.arch": wc, basin, shower, bathtub, kitchen_sink, counter, fridge
import "lib/furniture.arch": bed, double_bed, sofa, desk, wardrobe

wc(6200, 4600)
basin(5200, 4450)
shower(6000, 5000)
```

| Library | Components |
|---------|------------|
| `lib/fixtures.arch` | `wc` 400 × 700 · `basin` 600 × 450 · `shower` 900 × 900 · `bathtub` 1700 × 700 · `kitchen_sink` 800 × 600 · `counter` 600 × 600 · `fridge` 600 × 650 |
| `lib/furniture.arch` | `bed` 1500 × 2000 · `double_bed` 1800 × 2000 · `nightstand` 450 × 400 · `wardrobe` 1800 × 600 · `sofa` 2000 × 900 · `armchair` 900 × 850 · `coffee_table` 1100 × 600 · `tv_unit` 1500 × 450 · `dining_table` 2400 × 2000 · `desk` 1400 × 700 · `bookshelf` 900 × 300 · `stove` 600 × 600 · `washer` 600 × 600 |

Imports need a filesystem, so they work from the CLI and the library but not in the
browser playground — the flagship `examples/studio.arch` uses inline `furniture` for
exactly this reason. `examples/furnished-flat.arch` is the worked example: a two-bedroom
flat furnished with eighteen kinds across all five domains, `arch validate --strict`
clean.

## Furniture-aware lint rules

Placing fixtures meaningfully lets `arch lint` reason about habitability. The
furniture and fixture rules (each documented in the [error catalog](error-codes.md)):

| Code | Flags |
|------|-------|
| `W_FIXTURE_FLOATING` | a **services** fixture — plumbed, vented, or hung off the wall (WC, basin, shower, bath, sink, counter, stove, fridge, dishwasher, washer, dryer, upper cabinet) — placed away from any wall |
| `W_FIXTURE_BACK_TO_ROOM` | a piece that *is* against a wall but faces the wrong way — its back (cistern, tap, nosing, headboard, wardrobe door line, bookshelf's open face) turned to the room. Carries a `rotate` fix when one edge is unambiguously the back. Arranged seating never trips it |
| `W_FIXTURE_WRONG_ROOM` | a piece declared `in <room>` whose **footprint** does not sit on that room's floor (100 mm of overhang is allowed — a room edge is a wall centreline) |
| `W_FURNITURE_OVERLAP` | two pieces overlapping by more than 1 mm on both axes |
| `W_FURN_CLEARANCE` | a fixture's frontal use-space blocked by free-standing furniture |
| `W_ROOM_NO_FIXTURE` | a bath / WC / kitchen room with none of the relevant fixtures |
| `W_SWING_OBSTRUCTED` | a door leaf or swing arc sweeping onto a fixture |

These are **advisory** — facts and warnings, never an auto-arranger (see
[ADR 0005](adr/0005-no-invisible-architect.md)). See
[Analysis: describe & lint](analysis.md) for the full rule set and profiles.
