# Furniture & Fixtures

`furniture` places a piece of furniture or a built-in fixture into a plan. A piece
is either a **schematic labelled rectangle** (a bed, a sofa, a desk) or — for the
known plumbing and kitchen kinds — a **real plan symbol** (a WC pan, a basin, a
shower tray). Where you put it matters to the [soundness checks](analysis.md): the
linter knows a WC should have its back to a wall and a bath should contain fixtures.

This page covers the two ways to place a piece, the fixture-symbol catalogue, the
importable fixture library, and the lint rules that key off furniture. The one-line
grammar lives in the [language reference](language-reference.md#furniture).

## Two placement modes

A piece is positioned **absolutely** by its top-left corner, or **snapped against a
wall** so its back sits on the wall face and its rotation is derived for you.

| Mode | Grammar | You give | ArchLang derives |
|------|---------|----------|------------------|
| **Absolute** | `furniture <kind> at (x,y) size <w>x<h> [rotate 0\|90\|180\|270] [in <room>]` | corner, footprint, optional quarter-turn | nothing — what you write is what's drawn |
| **Against wall** | `furniture <kind> against wall <ref> [segment <n>] [offset <mm>] [side left\|right] size <along>x<depth> [in <room>]` | which wall, how far along, depth | the position **and** the rotation, from the wall |

```
# Absolute: a bed in the top-left, turned a quarter turn so its head is on the left wall.
furniture bed at (4300,300) size 1500x2000 rotate 90 in r_bed

# Against a wall: a 600-mm-deep counter run 1800 mm long, snapped to the north wall,
# starting 300 mm in from the wall's start, sitting on the interior (room) side.
furniture counter against wall north offset 300 side left size 1800x600 in r_kitchen
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
  - The rotation is **derived from the wall**, so combining `against` with an
    explicit `rotate` is an error ([`E_FURN_AGAINST`](error-codes.md)).
- **`in <room>`** records the owning room (by `id`). It doesn't move the piece — it
  lets the linter check the piece is actually inside that room and lets `against`
  infer the interior side. A non-existent id is [`E_FURN_ROOM`](error-codes.md).

## Fixture symbols

A handful of categories draw a recognisable architectural symbol instead of an empty
labelled box, and ignore any `label`. Everything else falls back to the rectangle.

| Category (and aliases) | Symbol |
|------------------------|--------|
| `wc` · `toilet` | WC pan |
| `basin` · `sink` | bathroom basin |
| `shower` | shower tray |
| `bathtub` · `bath` · `tub` | bathtub |
| `kitchen_sink` | kitchen sink |
| `counter` · `worktop` | counter / worktop |
| `stove` · `hob` · `cooktop` · `oven` | cooktop |
| `fridge` · `refrigerator` | refrigerator |

Symbols draw with their back along the top edge of the footprint, so orient by the
wall the fixture sits against (or let **`against wall`** do it for you).

## Importable fixture library

The standard fixtures are also packaged as importable components at typical
residential sizes, so you can drop one in with a single call instead of writing out
its footprint:

```
import "lib/fixtures.arch": wc, basin, shower, bathtub, kitchen_sink, counter, fridge
wc(6200, 4600)
basin(5200, 4450)
shower(6000, 5000)
```

| Component | Footprint (mm) |
|-----------|----------------|
| `wc(x,y)` | 400 × 700 |
| `basin(x,y)` | 600 × 450 |
| `shower(x,y)` | 900 × 900 |
| `bathtub(x,y)` | 1700 × 700 |
| `kitchen_sink(x,y)` | 800 × 600 |
| `counter(x,y)` | 600 × 600 |
| `fridge(x,y)` | 600 × 650 |

A matching `lib/furniture.arch` provides `bed`, `double_bed`, `sofa`, `desk`, and
`stove`. (Imports need a filesystem, so they work from the CLI and library but not in
the browser playground — the flagship `examples/studio.arch` uses inline `furniture`
for exactly this reason.)

## Furniture-aware lint rules

Placing fixtures meaningfully lets `arch lint` reason about habitability. The
furniture and fixture rules (each documented in the [error catalog](error-codes.md)):

| Code | Flags |
|------|-------|
| `W_FIXTURE_FLOATING` | a wall-requiring fixture (WC, basin, sink, counter, stove, fridge) placed away from any wall |
| `W_FIXTURE_WRONG_ROOM` | a piece declared `in <room>` whose centre lies outside that room |
| `W_FURNITURE_OVERLAP` | two pieces overlapping by more than 1 mm on both axes |
| `W_FURN_CLEARANCE` | a fixture's frontal use-space blocked by free-standing furniture |
| `W_ROOM_NO_FIXTURE` | a bath / WC / kitchen room with none of the relevant fixtures |
| `W_SWING_OBSTRUCTED` | a door leaf or swing arc sweeping onto a fixture |

These are **advisory** — facts and warnings, never an auto-arranger (see
[ADR 0005](adr/0005-no-invisible-architect.md)). See
[Analysis: describe & lint](analysis.md) for the full rule set and profiles.
