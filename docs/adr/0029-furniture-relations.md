# 29. Furniture relations: `facing`, `against <room>.<edge>`, `clear front|sides`

- **Status:** Accepted (plan-soundness card PS3.7, `docs/plans/plan-soundness/README.md`). Proposed
  until the PR that builds it merged; accepted 2026-10-24, recorded after PR #228 shipped it
  (merged 2026-10-23)
- **Date:** 2026-10
- **Relates to:** [ADR 0017](0017-fixture-semantics-three-flags.md) (amended: a stated `facing`
  is the licence decision 2 withheld), [ADR 0028](0028-rooms-primary-derived-walls.md) §5a
  (`against <room>.<edge>`, specified there and built here), [ADR 0004](0004-relational-placement-not-optimizer.md)
  and [ADR 0005](0005-no-invisible-architect.md) (closed form, refuse rather than choose),
  [ADR 0016](0016-component-instances-and-frames.md) (an instance resolves in its own frame),
  [ADR 0020](0020-algebraic-core.md) (D4 turns), [ADR 0022](0022-exact-decisions-and-bounded-input.md)
  (exact decisions, bounded input), [ADR 0023](0023-plan-symbol-drawing-language.md) (a glyph
  never gains handedness)
- **Scope:** three clauses on the `furniture` statement, their facts in `describe()`, three lint
  codes (two for a declared `clear`, one undeclared seat check). A plan that uses none of the
  clauses compiles, describes and lints byte for byte as before, diagnostics included.

## Context

The first-contact audit (`archlang-lab/plans/plan-soundness/audits/2026-10-18-first-contact.md`) gave six
cold AI-written plans to the compiler. None held a single `rotate` clause; 27 of the 51 chairs at
a table faced away from it, all 3 sofas with a TV faced elsewhere, and a reception desk faced away
from the entrance. Lint said nothing, because nothing in the source said what the piece was for.
Three sofas and a bar counter were also *transposed*: `size 900x2200` with the long side on the
depth axis, which draws a one-seat sofa two metres deep.

ADR 0017 decided that seating is arranged, not installed, so the compiler must not derive a turn
for a sofa or a chair: it "would assert a fact the plan never stated". The research behind this
card (`archlang-lab/plans/plan-soundness/research/2026-10-18-furniture-and-multistorey.md` §A) found that
every comparable system gives a piece a canonical front and derives its turn from a relation to a
target, and that the LLM-era systems (Holodeck, LayoutVLM, I-Design, Infinigen) all make facing a
soft cost or a search. ArchLang's turn set has four members, so the relation can be closed form.

ADR 0028 §5a specified `against <room>.<edge>` so furniture can back onto a derived wall, which has
no id; it was pulled forward from this card and not built.

## Decision

Relations are **declared by the author, derived in closed form, reported as facts, checked by
lint, never solved.** Nothing here searches, and every case with no single answer refuses.

### 1. Grammar

    furniture [id=<name>] <category>
      ( at (x,y)
      | against wall <id|category> [segment <n>] [offset <mm>] [side left|right]
      | against <room>.<edge> [offset <mm>]
      | in <room> centered | in <room> anchor <a> [flush] [inset <mm>] )
      [size WxH] [label "…"]
      [rotate 0|90|180|270 | facing <id>]
      [clear front <mm>] [clear sides <mm>]
      [in <room>]

`facing` is a new attribute keyword; `front` and `sides` are new enum values (`clear` is already a
keyword, from `dim clear`). The parser accepts `rotate` and `facing` together so that resolve can
refuse the pair with a span (§3); the printer, `arch fmt` and Plan JSON emit the canonical order
above. Each `clear` clause appears at most once (`E_FURN_CLEAR` on a repeat). The GBNF and the
TextMate/CodeMirror grammars are generated from the token tables, as today.

### 2. `against <room>.<edge> [offset <mm>]` (ADR 0028 §5a, as built)

The edge is read through the group's datum reader (`ResolveCtx.datums`), so `E_UNKNOWN_REF`,
`E_DATUM_COMPASS`, `E_DATUM_NAME` and `E_ROOM_NOT_RECTANGLE` hold exactly as they do for
`on <room>.<edge>`. A centre datum (`r.cx`) is `E_FURN_AGAINST`.

- **Size** is wall-relative (`along x depth`), as for `against wall`, and the catalogue default
  footprint applies when `size` is omitted.
- **Offset** is measured along the edge in the room's frame from its start corner (`top`/`bottom`
  from `left`, `left`/`right` from `top`) to the piece's **centre**; it defaults to the edge's
  midpoint and is refused outside `0 … edge length` (`E_FURN_AGAINST`). Not grid-snapped, as
  `against wall`'s derived position is not.
- **The back face.** Over the piece's footprint span along the edge, the candidate walls are the
  straight wall segments, derived or authored, parallel to the edge, whose centreline lies within
  `FIXTURE_WALL_TOL_MM` (300) of the edge line and overlaps the span with positive length.
  - none: the back lies on the edge line itself;
  - all exactly on the line, covering the whole span together, all of one thickness `t`: the back
    lies on the room-side face, `t/2` from the line into the room;
  - anything else (a wall beside the line, a part-covered span, two thicknesses, a span on a pair
    the author declared `open between`): `E_FURN_AGAINST`, naming the case.

  Openings in the backing wall do not refuse the form; a piece in front of a doorway is lint's
  business (`W_DOORWAY_BLOCKED`).
- **Turn:** the back goes on the edge (`top` 0, `right` 90, `bottom` 180, `left` 270). `rotate` on
  the piece is `E_FURN_AGAINST`, as on `against wall`; `facing` is `E_FACING_CONFLICT` (§3).
- **Room:** the piece belongs to the edge's room. `in <B>` with `B` another room is
  `E_FURN_AGAINST`; `in <A>` is accepted and redundant.

`against wall <id|category>` keeps every behaviour it has. The two forms are twins: a piece
`against r.left` and the same piece `against wall <id> … side …` on the wall that stands on that
edge resolve to the same footprint and turn (pinned by a swap-back test).

### 3. `facing <id>`

**What it derives.** Only the quarter-turn. `facing` never moves a footprint: the piece is placed
by its own clause (`at`, `in <room> centered|anchor …`), then turned. Because no footprint depends
on a turn, a piece's target rectangle is known before any `facing` is evaluated, so two pieces may
face each other and there is no cycle to refuse.

**The front ray.** At `rotate 0` a symbol's back is its top edge (`src/fixture-orientation.ts`), so
at turn `r` the back edge is `top`, `right`, `bottom`, `left` for `r` = 0, 90, 180, 270, and the
front edge is the opposite one. The footprint is the plan `w x h` at every turn (a turn redraws
the symbol inside it). The front ray at turn `r` starts at the midpoint of the front edge and
runs along the edge's outward normal.

**The target rectangle** `T` (its open interior):

| Target | Rectangle |
|---|---|
| a `furniture` piece | its resolved footprint |
| a rectangular `room` | its rectangle (a polygon or circle room: `E_FACING_TARGET`) |
| a `door`, `window` or `opening` | the opening's body on its host: the width along the host segment, the host thickness across it, centred on the opening's centre (a curved or oblique host: `E_FACING_TARGET`) |

Any other kind, an unknown id, an element that could not be placed, or the piece itself is
`E_FACING_TARGET`. The target must be an element of the piece's own group (the root plan, or the
`place`d component the piece is written in, ADR 0016); source order does not matter.

**The rule.** For each turn `r`, the hit distance `d(r)` is the smallest `s >= 0` at which the
ray's point lies in the closure of `T` while the ray's line passes through `T`'s open interior;
for a ray running `+y` from `(mx, my)`: defined iff `T.x0 < mx < T.x1` and `T.y1 > my`, and then
`d = max(0, T.y0 - my)`. The other three directions are the same formula turned. A ray that runs
along a side of `T` (on its boundary) does not enter it. The derived turn is the `r` with the
smallest `d(r)`.

- No `d(r)` defined: `E_FACING_MISS` ("no front of the sofa points at the TV"), with the
  footprint span the front would need to cover in the hint.
- Two or more turns share the smallest `d(r)`: `E_FACING_TIE`. For two pieces whose interiors do
  not overlap this cannot happen (their projections overlap on at most one axis, so only one ray
  direction can meet `T`); a tie means the piece overlaps its target, and the message says so.

All four candidates are evaluated on resolved coordinates, which are integers or half-integers,
so the comparison is exact (ADR 0022). There is no ordering among the turns and no "first" one.

**Exclusions.**

- `facing` with `rotate`, `against wall …` or `against <room>.<edge>` on the same piece:
  `E_FACING_CONFLICT`, spanned on the `facing` clause. One source of truth for the turn.
- `facing` on a `symmetric` category (`table`, `stool`, `rug`, …): `E_FACING_SYMMETRIC`; the
  symbol has no front, so the stated fact could not be seen.
- **Transposed footprint:** when the category has a catalogued non-square footprint, the piece is
  non-square, and the derived back edge is not one of `backCandidateEdges(size, footprint)` (the
  rule that already keeps a 400x700 WC from backing onto a vertical edge), the piece is
  `E_FACING_TRANSPOSED`: the turn that faces the target would draw the symbol stretched across its
  short side. The hint gives the swapped `size`. Nothing is turned.
- On a piece placed `in <room> anchor …`, a stated `facing` replaces the anchor's derived turn
  (that derivation runs only when no turn was stated, as with `rotate`).

**When it resolves.** A target may be later in source than the piece, so `facing` is settled in
one pass after every statement of the group has resolved, in source order, before the group is
transformed by its frame. The pass charges `1 + |group|` steps per piece (the target lookup) and 4
more (the candidates) on the evaluator meter before it reads anything (`E_STEP_LIMIT`).

**Frames.** A component resolves in its own frame and `transformElement` carries the derived
turn and, under a reflection, the glyph's mirror (`_mirror`), exactly as it carries an authored
`rotate`. The output set is the four D4 turns, so no glyph gains handedness. A mirror-equivariance
test pins that a `mirror x` instance's derived turn equals the turn `facing` derives on the same
plan written mirrored at the root.

### 4. `clear front <mm>` and `clear sides <mm>`

**Declarations only.** No category carries a default, and no lint profile adds one in this card.
The re-measure the card asked for: over the 11 wardrobes in `examples/`, the clear depth in front
(to the nearest solid piece or wall face) is 100 mm on `garden-loft` (to the bed), 300 mm on
`tiny-house` (to a wall), 450 mm on `furnished-flat` (to a vanity), and 800 mm or more on the other
eight. A default of 600 mm would warn on three shipped plans, two of which cannot be rearranged in
their rooms, which is the measurement that kept `clearanceMm` off `wardrobe` in the first place.
PS2.11's "front of a wardrobe at least 600 mm" is therefore met by the declaration, not a default.

A value must be positive and within `MODEL_RANGE_MM` (`E_FURN_CLEAR`). It changes no geometry: a
plan with `clear` draws exactly what the plan without it draws.

**The zones**, on the resolved footprint and turn: `front` is the strip of the declared depth
across the front edge (`frontClearanceRect`, the same strip `W_FURN_CLEARANCE` uses); `sides` is
the two strips of the declared depth along the two edges adjacent to the back (a bed's long
sides), both required.

**The measure.** For each strip, the clear depth is the distance from the piece's face to the
nearest obstacle inside the strip, capped at the declared depth and floored at 0. Obstacles:

- every **solid** piece (`solidFurniture()`, ADR 0017 decision 3) other than the piece itself;
- every **wall body**: a straight segment's body quadrilateral (centreline +/- half thickness),
  clipped to the strip; an arc segment is not measured in this card (as `backingScan` skips arcs),
  a stated limit;
- every hinged door's **swing** (`doorSwing`, shared with `W_SWING_OBSTRUCTED`): the quarter-disc
  clipped to the strip, its nearest point found in closed form (the disc's vertices, the strip
  corners inside it, the strip edges' crossings with its radii and its arc, and the arc's extreme
  points along both axes).

An obstacle counts only when it overlaps the strip with positive **area**: a piece, a wall or a
swing that touches the strip at a point or along a line (a leaf end on the strip's edge, a
corner on the face) leaves it clear. For a swing that is decided on the same candidate points:
the intersection is convex, so it has area exactly when three of them are not collinear.

*Amended 2026-10-23 (PR #228, red team round 1):* the catalogue's `clearanceMm` is a **floor**. A
piece whose declared `clear front` is at least its catalogue clearance is judged by
`W_FURN_CLEAR_FRONT` alone (the author's number replaces the catalogue's). A shallower
declaration cannot silence `W_FURN_CLEARANCE`: both are measured, and both can warn. Every
undeclared piece is judged exactly as before.

### 5. Facts

`describe()`'s `furniture[]` row gains, each only when declared, so every other row is unchanged:

- `relation: "against <room>.<edge>[ offset <mm>]"` for §2 (as written, the way an opening's
  `relation` is), and `freedom` counts the piece as `relational` (`freedom.furniture.relational`,
  present only when there is one, as `freedom.openings.relational` is);
- `facing: "<target id>"` for §3 (the derived turn is the row's existing `rotate`); inside a
  `place`d instance the id is namespaced as the row's own id is;
- `clear: { front?: { declared, measured }, sides?: { declared, measured } }` for §4, `measured`
  being the §4 measure (the smaller of the two sides).

Plan JSON gains `against_edge`, `facing`, `clear_front` and `clear_sides` on `FurnitureJson`,
additive, and round-trips them; a payload with `facing` re-emits `facing <id>` and not its
resolved `rotate`.

### 6. Lint

| Code | When | Default |
|---|---|---|
| `W_FURN_CLEAR_FRONT` | a declared `clear front` measures short | on (declared only) |
| `W_FURN_CLEAR_SIDES` | a declared `clear sides` measures short on either side | on (declared only) |
| `W_SEAT_FACING_AWAY` | undeclared (PS2.11): a seat with a table or desk within 600 mm whose front ray enters no table or desk within 600 mm | on |

Messages name things as a person would ("The wardrobe in Bedroom 2 needs 600 mm clear in front;
the bed leaves 100 mm") and never an id; ids are in the hints.

**`W_SEAT_FACING_AWAY`.** Seats: `chair`, `office_chair`, `outdoor_chair` (and its alias). Tables:
`table`, `dining_table`, `meeting_table`, `outdoor_table`, `desk`, `reception_desk` (and aliases).
Lounge seating (`sofa`, `armchair`) and stools (`symmetric`, no front) are out: a sofa faces a TV
or a view, not a table. A seat is *at a table* when the gap between the two footprints is at most
the reach on both axes (`seatTableReachMm`, 600) and both lie in the same room (the first room
whose floor holds the footprint, `rectInRoomBox`; a piece in no room matches only pieces in no
room), so a table behind a partition is never the one a chair is sat at; it warns when no such
table is entered by its front ray (§3's ray, from the front edge's midpoint, at the seat's
resolved turn) within the reach. A seat with `facing` is never judged (its turn is stated). The
hint names the turn whose ray meets the nearest table, when one turn does uniquely, and the
`facing <id>` clause naming that table; a table with no authored id is to be named first (`id=`),
since a `facing` on an auto id breaks when an earlier piece is named. No machine-applicable fix in
this card.

Measured on the six first-contact plans: 51 seats are at a table and 26 warn (the audit counted 27
by eye; the difference is café `chair_29`, south of its table and facing south, whose front ray
enters the next table 550 mm away). On `examples/` it warned 17 times on 8 plans (`corner-cafe` 9,
`hillside-villa` 2, and one office or desk chair each on `aquarium`, `furnished-flat`, `gallery-l`,
`materials`, `museum`, `themed`), each a chair drawn facing away from its table: real defects in
the corpus. The rule ships **on** (`seatTableReachMm: 600` in `DEFAULT_RULESET`, so every profile
inherits it), and the same PR fixes those chairs, each by one clause: `facing` where the desk
already had an id, the `rotate` it derives where it had none (naming the desk would renumber every
later auto id), and on `furnished-flat` and `museum` a move into line with the desk first, since
those chairs stood diagonally off its corner. The byte-identity law protects plans
that use no new *form*; a new undeclared rule may move `lint()` on the corpus when every moved row
is explained one by one and a real defect is fixed, never blessed.

### 7. Budgets and identity

- Each relation is O(1) per piece after one target lookup; every scan is charged before it runs:
  `against <room>.<edge>` charges one step per wall and per wall point (as `bodiesOn` does);
  `facing` as in §3. `clear` and `W_SEAT_FACING_AWAY` run in `lint()`, pairwise over furniture
  like `W_FURN_CLEARANCE`, and only for declared pieces or seats respectively.
- **Byte identity.** A plan with none of the clauses is untouched in SVG, `describe()`, `lint()` and
  `compile().diagnostics`: a SHA-256 sweep over the corpus, taken with the test's own digest body
  before any code lands.
- **Swap-back twins** (pinned): `facing t` and the `rotate` it resolves to draw and lint the same
  (describe differs only by `facing`); `against r.left` and its `against wall … side …` twin; a
  plan with `clear front 600` and the same plan without it draw the same, and their facts differ
  only by the `clear` key.
- A digest table over the relation plans is pinned last.

### 8. Refusal codes

| Code | Message (shape) |
|---|---|
| `E_FACING_TARGET` | `Furniture "<id>" faces "<t>", which is not in this plan / is a polygon room / is a wall, not a piece, room or opening / could not be placed / is the piece itself` |
| `E_FACING_MISS` | `No front of furniture "<id>" points at "<t>": its front ray misses it at every quarter-turn` |
| `E_FACING_TIE` | `Furniture "<id>" overlaps "<t>", so two of its fronts point at it equally near; move it off its target` |
| `E_FACING_CONFLICT` | `Furniture "<id>" states its turn twice, by facing and by rotate (or by against); keep one` |
| `E_FACING_SYMMETRIC` | `A <category> has no front, so it cannot face anything; drop facing` |
| `E_FACING_TRANSPOSED` | `Facing "<t>" puts the back of <category> "<id>" on its short side; write size <h>x<w>` |
| `E_FURN_CLEAR` | `clear front / clear sides needs a positive depth in mm, or is written twice` |
| `E_FURN_AGAINST` (reused) | the §2 cases, each naming the room edge |

Each has a catalogue entry in `src/error-catalog.ts` with an executed example, a span on the
offending clause and a test.

## Consequences

- An author can say what a chair, a sofa or a desk is for, and the compiler turns it, reports the
  fact, and refuses when the geometry cannot satisfy it. A chair facing away from a table is still
  writable with `rotate`, and the undeclared seat check reports it.
- Furniture can back onto a derived wall, which has no id, by its room edge.
- Clearance stays the author's number. The catalogue keeps its four measured `clearanceMm` values
  and adds none.
- `facing` reads the front ray at one point, the front edge's midpoint. A desk whose front is not
  in line with the door it should face is refused, not turned toward it; the author moves the
  desk or names a nearer target. That is the strict reading the card asked for, and the one an
  author can predict.

## Alternatives considered

- **Derive a turn for seating from the nearest table** (no declaration): the silent choice ADR 0017
  refused, and the one ADR 0005 forbids.
- **`left of` / `right of` / `in front of`**: handed relations that need the target's frame; the
  research found them the weak spot of every system that has them. Not offered.
- **A ray from the footprint centre** (Holodeck): makes a chair tucked under a table edge face it
  from inside its own footprint; the front-edge midpoint is the point a person sits at.
- **A catalogue or profile default for `clear front`**: re-measured above, and refused.

## Reversal conditions

- If agents writing `facing` hit `E_FACING_MISS` on most first attempts (measured on a fresh
  first-contact round), widen the ray to the front edge's whole span (still closed form, still
  refusing ties), recorded as an amendment.
