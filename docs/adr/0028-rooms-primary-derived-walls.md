# 28. Rooms may be primary: walls and openings derived from room relations

- **Status:** Accepted (plan-soundness decisions D1 and D5, `docs/plans/plan-soundness/README.md`
  §3). Proposed until the first derived form, `walls from rooms`, landed with its byte-identity
  law (PR #223); accepted 2026-10-22, when the form's last clauses landed (card PS3.0 part C).
- **Date:** 2026-10
- **Relates to:** [ADR 0004](0004-relational-placement-not-optimizer.md) (relational placement is
  deterministic arithmetic, not an optimizer), [ADR 0005](0005-no-invisible-architect.md) (refuse,
  never choose), [ADR 0016](0016-component-instances-and-frames.md) (an instance is closed: it sees neither
  its parent's nor its siblings' elements), [ADR 0020](0020-algebraic-core.md) (the algebraic core
  and its laws), [ADR 0022](0022-exact-decisions-and-bounded-input.md) (exact decisions, bounded
  input), [ADR 0027](0027-net-internal-area.md) (rooms are drawn on wall centrelines)
- **Scope:** the language gains room-edge datums, one whole-tiling form (`walls from rooms`), two
  pairwise wall forms (`wall … between`, `wall … around`), relational opening placement
  (`door|opening between`, `window on <room>.<edge>`) and hosted offsets measured from a room edge or
  a wall end. Wall-first authoring stays fully legal. A plan that uses none of the new forms compiles,
  describes and lints byte for byte as before, diagnostics order included.

## Context

No wall in the corpus is derived from anything: every wall is a list of typed points, because no
other form exists (`describe().freedom` has no wall family to count; the figure "walls 100 %
absolute" in `docs/plans/plan-soundness/evidence.md` §4 is that observation, not a measured field).
The audits behind the plan-soundness programme found that the three most frequent defect classes in
AI-written plans are all *writable by omission* in that style:

- a shared room edge with no wall on it (class 2, "space not enclosed"), the single most common
  blocker in the reconstructed published plan and in the first-contact plans;
- a room that leaves walled floor unassigned, or lies outside the shell (class 2);
- an opening that spans a wall junction or a corner, because its position was typed in millimetres
  with no knowledge of where the meeting wall is (class 1).

The change drills show the second half of the problem: widening one room by 500 mm in
`examples/studio.arch` touches about 24 literals, and the partition the room grew through stays
where it was. Lint now reports all of this afterwards (`W_BOUNDARY_NO_WALL`, `W_ROOM_OUTSIDE_SHELL`,
`W_OPENING_AT_JUNCTION`, landed 2026-10). Reporting is not the same as making the state unwritable.

Two measured premises decide the shape of the answer (`research/2026-10-18-room-tiling.md`): in
26 of 34 top-level examples the rooms' area sum equals the plan's centreline bounding-box area
exactly, so authors already write rooms that tile the building and leave corridors as rooms; and
236 of 246 rooms are rectangles. That measurement is an area sum, which overlaps can cancel, and it
counts a four-vertex `room polygon` as a rectangle; the exact preconditions of §3 are re-measured
per storey before the form ships (Acceptance).

Prior art (`research/associativity.md` §4 P1, `research/prior-art.md` §1.1): Revit, ArchiCAD,
Sweet Home 3D and FreeCAD treat walls as primary and derive rooms; Topologic treats cells as primary
and walls as their shared faces; the generative work that avoids the "missing wall" class (BSP and
hypergraph formulations) does so by construction, because a wall is the boundary between two cells.
An LLM author thinks in room graphs. ArchLang already reports that graph (`rooms[].adjacent`, the
access graph). What it lacks is a way to *write* it.

## Decision

### 1. Resolve order: rooms first, then a frozen datum table, then walls, then openings

`resolve()` places every room first: absolute `at … size`, relational `right-of|left-of|above|below`
(ADR 0004), `polygon` and `circle`. It then freezes a **datum table** for the group being resolved
(the root plan, or one component instance, ADR 0016): for each rectangular room its four edge lines
and centre, for each grid its axes. Derived walls read the table; authored walls are resolved as
today; openings resolve last against the final wall set.

Ids are assigned before resolve, so the element registry order is unchanged. Diagnostics are
buffered and emitted in registry order, as one pass in that order produces them today, so
`compile().diagnostics` does not reorder on a plan whose rooms and walls both diagnose. That
promise covers a resolution that completes: one stopped by `E_STEP_LIMIT` reports, deterministically,
the diagnostics raised before the crossing in the new order (rooms before walls), and that set may
differ from what the old walls-first pass had raised by then. Plans that
use no new form must resolve to the same `ResolvedPlan`; the byte-identity sweep over SVG,
`describe()`, `lint()` and `compile().diagnostics` is the gate for the resolve-order change (card
PS3.2) and is pinned before any form lands.

### 2. Room-edge datums

A rectangular room `r` exposes `r.top`, `r.bottom`, `r.left`, `r.right` (edge lines, in the frame the
room is authored in: `+y` goes down, so `top` is the smaller `y`), `r.cx`, `r.cy` (centre) and the
grid axis names already in the language. Datums are read wherever a coordinate is read.

- **Snapping is unchanged:** the evaluated value of a point or length expression is snapped to the
  plan `grid`, as today (ADR 0004: a relational result snaps exactly like an absolute coordinate),
  whether or not the expression reads a datum. Edge datums are already on the grid because room
  coordinates were snapped when the room resolved; `cx`/`cy` may sit on a half-grid and then snap,
  which is what `grid` does to every half-grid value today.
- `north|south|east|west` are aliases of `top|bottom|left|right` **only** in the root frame of a plan
  whose `north` setting is `up` (explicit or default). Inside a `component`, or when `north` is any
  other direction or a bearing, a compass word in a datum is refused (`E_DATUM_COMPASS`: "`north` would
  mean two things here; write `top`"). Compass facts belong to `describe()`, frame words belong to
  datums, and one word must not carry both.
- Inside a `component`, datums are local-frame words. `place … rotate 90` turns the room's `top`
  edge into a world `right` edge, and `mirror x` swaps `left` and `right`: the component is written
  once in its own frame and the instance follows the frame, exactly as its coordinates do
  (`frame.ts` carries the resolved element; a resolver never sees pre-transformed input). From the
  root, `west.main.top` names the placed room `west.main`'s edge in **world** words (the last
  dotted segment is the datum; a dotted path whose last segment could be read both as a datum word
  and as an element id inside the instance, such as an instance `west` holding an element `top`, is
  refused with `E_DATUM_NAME` rather than resolved either way).
- A `polygon` or `circle` room exposes no datum in this version (`E_ROOM_NOT_RECTANGLE`, the same
  condition relational placement refuses with `E_PLACE_POLY`). A rectilinear polygon may gain named
  edges later; the honest extension is §8 question 4 of the plan.

### 3. The headline form: `walls from rooms` (D5)

    walls from rooms exterior <t_ext> partition <t_int> {
      open [id=<name>] between <A> and <B> [width <mm>]
      between <A> and <B> thickness <t>
      except <R> …
    }

One statement derives the whole wall set of the group it is written in (the root storey, or one
component) from the rooms resolved there, excluding `except` rooms. There may be one such statement
per group (`E_WALLS_FROM_ROOMS_DUP`). It derives:

- the **exterior ring**: the rectilinear outline of the union of the room rectangles, drawn as one
  closed `exterior` wall of thickness `t_ext`. A hole in the union is legal in two cases: covered
  exactly by `outdoor` surfaces declared in the same group (a courtyard), when the hole's outline is
  drawn as a second, inner `exterior` ring; or covered exactly by a `void` (an atrium, a stair
  well), when no wall is derived round it and the author adds a balustrade or wall by hand. Any
  other hole, any second edge-connected component, and a union that touches its own hole at a
  single vertex (a pinch) are `E_ROOMS_NOT_TILING`. A hole is covered only by `outdoor` surfaces or
  a `void` declared in the same group as the rooms, so a root `outdoor` does not cover an
  instance's courtyard. A hole is covered by one kind only, so a hole half `outdoor` and half
  `void` is `E_ROOMS_NOT_TILING`.
- every **shared edge run** of two rooms (a positive-length overlap of two facing edges on one
  line) as one `partition` segment of thickness `t_int` on that line, unless an `open between A and
  B` clause names the pair. `open` without `width` derives a leaf-less `opening` across the **clear
  span** of the run, between the faces of the walls that meet it at each end (so it carries no nib
  and trips neither `E_OPENING_NIB` nor `W_OPENING_AT_JUNCTION`); with `width` one centred on that
  clear span. As built (PS3.0 part C): the pair's partition is still derived, as the opening's
  host, and the opening voids it; at an end where several walls meet the run, the face is the
  thickest one's, so no meeting wall's body lies inside the opening (the thinner wall's pier
  beside that face is not a nib, and `W_OPENING_AT_JUNCTION` does not report it). Either is an ordinary opening (in the access graph, in `describe().openings[]`), with
  an auto-assigned id unless the clause gives one, so an open-plan join is a stated connection, not
  a gap `W_BOUNDARY_NO_WALL` would report. The drawing therefore shows an open-plan pair as two
  jamb lines with the meeting walls' piers at the ends, which is what the plan says. A
  `door|opening between A and B` on a pair the author declared `open` is `E_WALL_BETWEEN_OPEN`:
  the run is already voided.
  *Amended 2026-10-31 (issue #368, card H2):* where such runs meet each other, a meeting wall's
  pier is a block no statement asked for, and the drawing removes it. With every run at a point
  open the whole block goes; with one left standing that run ends flush on the point, across its
  own width, whether thicker or thinner than the open runs; two or more that stand meet as walls do.
  A run with a narrower `width` that stops short of the point, or with another opening on it,
  stands. The block stays in the solid `describe()` reads, and an authored wall, or the ring,
  touching it keeps what it draws. A boundary voided over its whole clear span is also no meeting
  wall for `E_OPENING_NIB` or `W_OPENING_AT_JUNCTION` (§5): nothing is built there. The exception
  is a host that stops at it with nothing carrying on past that end, whose jamb would stand beside
  a free end, and the openings the clause itself derives, whose jambs were set on those faces.
- `between A and B thickness t` overrides the partition thickness for that one pair.

Rooms are centreline shapes (ADR 0027), so a room union tiled exactly by rooms gives an exterior
ring on the room outline and partitions on the shared lines; nothing moves. `examples/studio.arch`
and `examples/two-bed.arch` already draw their rings on the room-union outline. The clause list is
closed at these three. If a fourth is needed in practice (a party-wall category, a bearing line, a
per-edge material), D5's reversal condition applies and the pairwise forms of §4 become the headline.
Party walls between dwellings are the dwelling declaration's business (plan card PS2.14), not a
clause here.

**Preconditions, decided exactly on the resolved integer coordinates, each a refusal naming the
rooms (ADR 0005):**

| Condition | Code |
|---|---|
| Two rooms in the set overlap with positive area | `E_ROOMS_OVERLAP` |
| The union has a hole not covered exactly by `outdoor`/`void`, or more than one edge-connected component (rooms touching only at a corner are not connected) | `E_ROOMS_NOT_TILING` (names the hole's bounding rooms, or one room from each component) |
| A shared run is shorter than `t_int` | `E_PARTITION_TOO_SHORT` (names the pair and the run) |
| A `polygon` or `circle` room is in the set and not excluded | `E_ROOM_NOT_RECTANGLE` |
| An `open between` or `between … thickness` clause names a pair that shares no run | `E_WALL_BETWEEN_NOT_ADJACENT` |
| An `open between` or `between … thickness` clause names a room that is not in the group, or a polygon/circle room; `except` accepts any room of the group, polygon and circle rooms included (it is how they are excluded) | `E_WALL_BETWEEN_ROOM` |
| An authored wall lies on a pair the author also declared `open`, or an opening (relational, or hosted by position ON the voided span) targets such a pair | `E_WALL_BETWEEN_OPEN` |
| An `open … width` wider than the run's clear span, or a run with no clear span | `E_WALL_BETWEEN_WIDTH` |
| One pair named by two clauses (`open` and `thickness`, or either twice) | `E_WALL_BETWEEN_DUP` |

*Amended 2026-11-01 (issue #363, card L1):* a rectilinear `polygon` room is now in the set: every
edge horizontal or vertical, decided exactly on the snapped ring. The two `polygon` rows above now
read "a polygon with any other edge"; a circle stays refused. Inside the sweep such a room is
interior-disjoint rectangles of one owner, cut after snapping, and an edge with one room on both
sides is no wall, so what is derived depends on the ring and not on how it was cut (a test holds
that over three different cuts). It stays one room in every other respect, so this is not the
two-rectangle plan with its seam left open: one stamp, one area, no half judged alone. The sentence
"the union of the room rectangles" reads "the union of the rooms". A rectilinear ring the room itself
refuses (`E_ROOM_POLY_SELF_INTERSECT`, `E_ROOM_POLY_DEGENERATE`) leaves the set with no second
report: the gap it leaves is that error, not a tiling fault.

The rest follows from one pair now being able to share **several** runs, which two rectangles
never could (§4 still holds, for rectangles):

- Each run is one partition. The first is `A|B`, later ones `A|B#2`, `A|B#3`, numbered by start
  point, smallest `y`, then `x`; a vertical run comes before a horizontal one from the same reflex
  corner. `~n` keeps its meaning, so `A|B#2~2` is legal. `#` is no identifier character, so the
  name stays one nothing can spell. In prose a later run is `the partition between A and B (edge 2)`,
  so a message or an `impact` row about it says which.
- `between A and B thickness t` sets every run of the pair. There is nothing to choose.
- `open between A and B` on a pair with several runs is `E_OPENING_HOST_AMBIGUOUS` on the clause,
  naming the runs. The clause derives one opening, with one `id` and one `width`, on one run, so
  several runs leave no single answer (ADR 0005), and opening every run would make two rooms with
  no boundary between them, which the consequence below says is one room. The drawing is not the
  reason: since the 2026-10-31 amendment above the corner of two open runs clears, and no pier is
  left there. On a pair with one run the clause works as it always did.
- The pairwise forms of §4 stay rectangle-only (`E_ROOM_NOT_RECTANGLE`), so neither `runs[0]` nor
  the first run of a ring can be picked silently.

Not in this amendment: `door|opening between`, a polygon's datums (§2), relational placement against
it and anchored furniture in it all still refuse a polygon. Those are cards L2 to L4, and §5
gains its several-run rule with L2.

There is no tolerance row: a 1 mm jog in the outline is a legal tiling whose ring follows the jog,
and a 1 mm interior gap is a hole. A plan whose corridor is "the leftover" fails the tiling test,
and that is the point: the corridor must be a room. The class-2 defect-corpus cases must be
unwritable in this form (a test writes each with `walls from rooms` and asserts the refusal or the
wall).

**Direction of a derived wall**, which hinge, swing, `from start|end` and `segment <n>` read: the
exterior ring starts at its vertex with the smallest `y`, then the smallest `x`, and runs clockwise
on the page (first along `+x`), so the floor is on the `in` side of travel; an inner ring round a
courtyard starts the same way and runs **counter-clockwise** (first along `+y`), so the floor is
again on the `in` side and `swing in` opens into the building on both rings; a partition starts at its end with the
smaller `y`, then the smaller `x`, so a horizontal run grows along `+x` and a vertical run along
`+y`. `swing into <room>` and `hinge near start|end` are the recommended words on a derived wall;
`swing in|out` means what it means on any wall of that direction (plan card PS3.8 adds
`inward|outward`).

**Addressing.** Derived walls have **no author-facing id**. They are addressed by relation: an
opening by `between A and B` or `on A.<edge>` (§5), furniture by `against <room>.<edge>` (§5a), a
selector by `containing A.<edge>` (plan card PS3.5). Internally each derived wall carries an id no
identifier can spell (`A|B` with the room ids in source order, `exterior`, `exterior#2` for an inner
ring) with `_idAuthored = false`, so the keyed internals (heights, hosting, lint, furnish) work
unchanged and nothing can collide with an authored id; `describe()` prints that name only in
`derived_walls[]`, in `heights.walls[]`, and as `hostWallId` of any element hosted on or backed
onto one (an opening, a piece placed `against wall`, a roof that follows the ring), a join
reference into the other two; never in a lint hint or fix. *Amended 2026-10-24 (card PS4.1,
PR #239):* the list said "as the `hostWallId` of an opening hosted on one"; `describe --facts
depends` names the wall a piece or a roof backs onto the same way, so a derived wall is
referenced by name once per element rather than expanded into its rooms in every row, and its
rooms are listed once, in `depends.derived_walls[]`. It still never appears in `on`. A lint hint about a derived host quotes the relational
form (`between A and B at …`), never `on A|B`. Plan JSON exports the `walls from rooms` statement
and the relational openings as written, as additive kinds in its schema (the Plan JSON and printer
round-trip tests gain a case each); derived children are not exported as walls, and `arch fix` and
`suggest` never emit a derived child as an authored one. `roof overhang` counts only the outer
ring among its candidates. An author who needs a wall by id writes it by hand. A statement inside
a `place`d component is exported in that component's body (`components[].body.walls_from_rooms`,
with `instances[]` for the frames; card PS3.9), still as written and still without its walls
(nested, differing-body and imported components still refuse: `E_JSON_DERIVED_IN_INSTANCE`).

**Coexistence with authored walls.** An authored wall whose centreline is exactly collinear with a
derived segment and overlaps it with positive length drops the derived segment over the shared
span (the author wrote it, so the author's wall, material and thickness win); the remainder of the
derived run, zero, one or two pieces, stays and keeps its relational address. An authored wall
anywhere else, 1 mm off the line included, is kept beside the derived set and judged by lint like
any wall. Every dropped span is reported in the facts (§6) so the drop is never silent. Both cases
are pinned by test.

**Scope across instances.** A component's derivation sees only the component's rooms (ADR 0016),
so two instances of one component each derive their own ring; where two instances abut, or a root
room abuts a placed instance's room, two coincident exterior walls result on the shared line,
exactly as two authored instances draw today. A root derivation sees only root-declared rooms;
instance rooms are covered by their component's own statement.

**Bounds, charged before allocating.** At expansion the statement counts toward `MAX_ELEMENTS` with
the upper bound of what it can derive (at most `6n` partition pieces, since coexistence can split
a run in two, and `4n` ring vertices for `n` rooms), so a tiling that could exceed the cap is `E_ELEMENT_LIMIT` before resolve. At resolve the
shared runs come from one sort of the room edges per axis and a sweep, charged as `n log n + 3n`
steps on the evaluator meter before the sweep runs; the union outline is one sweep over the sorted
edges. Derived children count toward the drawing budget like authored ones in `compile()`
(`E_DRAWING_LIMIT`); `describe()` and `lint()` resolve the same children under the step meter.
*Amended 2026-11-01 (issue #363, card L1):* a rectilinear polygon is cut into rectangles after the
step above is charged for its ring and before the sweep runs, one pass over the ring per slab, and
the sweep then counts rectangles where it counted rooms. The flat `10n` is no bound on what a comb
can derive; the second count, of the real walls before any is allocated, is what holds it
(`E_ELEMENT_LIMIT`). Nothing changes for a set of rectangles, by a step.

**Implementation shape.** `walls from rooms` is one element kind (one `src/elements/` module with
`drawCost` and `bounds()`), whose resolution yields its wall and opening children. The children
enter `ir.walls` / `ir.openings` after every authored element of the group, so the existing
first-wins tie-breaks over `ir.walls` prefer authored walls, and diagnostics are owned by the
statement with the span of the clause at fault.

### 4. The pairwise forms (D1): mixed authoring

    wall id=p partition thickness 100 between <A> and <B>
    wall id=e exterior thickness 200 around [<A> <B> <C>]

`between` resolves to the shared run of two rectangular rooms whose facing edges lie on one line
with their interiors on opposite sides (overlap: `E_ROOMS_OVERLAP`; no run:
`E_WALL_BETWEEN_NOT_ADJACENT`; not rectangles: `E_ROOM_NOT_RECTANGLE`; run shorter than the
thickness: `E_PARTITION_TOO_SHORT`). Two rectangles share at most one run, so there is nothing to
choose. `around` resolves to the rectilinear union outline of the listed rooms with the same hole
and connectivity rule as §3 (`E_ROOMS_NOT_TILING`). These walls carry the author's id and
direction rule of §3, and are the forms for a plan that derives some walls and types others.

*Amended 2026-10-23 (card PS3.3, PR #226):* `around` refuses **every** hole with
`E_ROOMS_NOT_TILING`, including one an `outdoor` surface or a `void` covers exactly. One wall
is one ring, so it cannot draw a courtyard's inner ring, and a courtyard needs `walls from rooms`.
A room listed twice overlaps itself (`E_ROOMS_OVERLAP`, on the repeated name). An `around`
wall counts `4n` toward `MAX_ELEMENTS` at expansion, and its sweep is charged `n log n + 3n`
before it runs. A refused pairwise wall has no points. An opening, a piece of furniture or a
dimension that names it says that it could not be placed, not that no such wall exists.

### 5. Openings by relation

    door id=d hinged between <A> and <B> at (<mm> from <A>.<edge> | <mm> from start|end | center) width <mm> …
    opening id=o between <A> and <B> at (…) width <mm>
    window id=win on <A>.<edge> [at (…)] width <mm> …

`between` resolves to the one wall body on the pair's shared run, derived or authored; none is
`E_OPENING_NO_SHARED_WALL`, more than one (two authored halves, or an authored span beside a derived
remainder) is `E_OPENING_HOST_AMBIGUOUS`. `window on A.top` picks the one exterior wall body on
that edge; none, a partition, or two bodies (a narrower room centred above a wider one) refuse the
same way. Positions are measured along the shared run or the edge, not along the host wall.

- A door's position is **required**: the plan's own rule (`README.md` §4) is that a hosted door is
  held to a corner or a room edge, never centred by default. `center` is a word the author writes.
  A window's position defaults to `center`.
- `<mm> from <A>.<edge>` is legal only for an edge perpendicular to the run that meets the run at
  one of its ends; the offset runs from that end into the run. A parallel edge, or one that meets
  the run nowhere, is `E_OPENING_DATUM`. `from start|end` reads the direction of §3. `at axis n` on
  a run parallel to that axis is refused the same way.
- Hosted offsets gain the same datums on the existing forms: `on <wall> at 150 from end`,
  `on <wall> at 150 from <A>.<edge>`, `on <wall> at axis 3`. On a hosted wall the datum line must
  cross the host run at exactly one point (`E_OPENING_DATUM` otherwise), and the offset runs from
  that crossing along the host's own direction; the other way is written `from end`.

**The nib is enforced, never slid.** If the resolved position leaves a jamb nearer than
`max(100 mm, host thickness / 2)` to a meeting wall face, the opening is refused with
`E_OPENING_NIB` naming the clearance, the meeting wall and the nearest legal position. These are
the **default values** of the measure `W_OPENING_AT_JUNCTION` uses for hand-placed openings
(`minJunctionNibMm`, `junctionNibThicknessRatio`), including its exemption for a cased opening flush
with a meeting wall face; `compile()` reads no lint profile, so a profile that changes the lint's
numbers does not change the refusal. The relational form turns the warning into a refusal because
the author asked for a derived position and the compiler must not choose a different one (ADR 0004,
ADR 0005).

### 5a. Furniture against a room edge

    furniture id=f wardrobe against <A>.<edge> [offset <mm>] in <A>

`against wall <id|category>` needs a unique wall id and refuses a category that matches several
walls, so furniture could never back onto a derived partition (a tiling has many). The form above,
pulled forward from plan card PS3.7, backs a piece onto a room's own edge: the piece's back face
lies on the edge line's room-side wall face when a wall stands there, or on the edge line itself
when nothing does. "A wall stands there" is decided over the piece's whole footprint span along the
edge: exactly one wall body, derived or authored, with its centreline on the edge line across the
whole span; two walls of different thickness, a part-open span, or a wall beside the line is
`E_FURN_AGAINST`, as a non-unique `against wall` is today. `offset` is measured along the edge in
the room's frame from its start corner (`top`/`bottom` from `left`, `left`/`right` from `top`) to
the piece's **centre**, defaults to the edge's midpoint, and is refused outside `0 … edge length`
(`E_FURN_AGAINST`), exactly as `against wall … offset` works today (`furniture.ts`). `in <B>` with
`B ≠ A` is refused: the edge already names the room. It is closed-form, needs no wall id, and
`examples/two-bed.arch`'s wardrobe (`against r_bed2.right offset 1500`, centre y 6500) and shower
(`against r_bath.left offset 2000`, centre y 7000) rewrite to it one for one.
*Amended 2026-10-23 (card PS3.6, PR #227):* the one-for-one claim held for the file before
PS3.6. The example was then rewritten rooms first, and its wardrobes and shower are now placed
by `in <room> anchor … flush`.
`against wall exterior [segment <n>]` keeps working when the ring is the only exterior wall, with
segments numbered along the ring's direction rule; an inner ring or an authored exterior wall beside
the ring makes `exterior` ambiguous, as today.

### 6. Facts

`describe()` gains one key, present only on a plan that derived something: `derived_walls[]`, one
row per derived wall with `{ from: "rooms" | "between" | "around", name: "A|B" | "exterior" |
"exterior#n", between?: [A, B], dropped?: [{ x1, y1, x2, y2, by: <wall id> }] }` (`name` is the
internal id of §3; for the pairwise forms it is the authored wall id).
`freedom` gains a `walls` family, and openings gain the placement value `relational`, both emitted
only when a derived wall or a relational opening exists. `describe()` of a plan with none of them
does not change by a byte.

*Amended 2026-10-23 (card PS3.3, PR #226):* a pairwise wall's row is
`{ from: "between", name: <id>, between: [A, B] }` or
`{ from: "around", name: <id>, around: [A, …] }`: the rooms as written, `around` an additive
field. Rows follow source order, among a `walls from rooms` statement's own. `freedom.walls`
gains `relational`, the count of pairwise walls, which `absolute` then excludes; it is present
only when there is one.

*Amended 2026-11-01 (issue #363, card L1):* `name` may also be `A|B#n` (§3): a pair with several
runs has one row per run, each with the same `between`.

### 7. Teaching order

`spec.llm.md` and `skills/archlang/SKILL.md` lead with the room-graph form: rooms, then `walls from
rooms`, then `door between`, then furniture. The wall-first grammar stays, after it. The spec is a
few hundred bytes under its render cap (`test/llm-spec-drift.test.ts`), so the room-graph example
replaces the current opening example rather than joining it, and duplication is trimmed first
(the gotchas rule); the context-size tests are the gate. Prior art says a minimal task-scoped
grammar helps an LLM author and the full grammar does not; the first example an agent sees should
be the one that cannot express the top three defect classes.

## Consequences

- The class-2 defects (missing shared wall, unassigned floor, room outside the shell) and the
  junction half of class 1 become unrepresentable in a plan written in the headline form. Lint keeps
  reporting them for wall-first plans.
- "The room grows, the walls follow" becomes true for every derived wall and every relational
  opening: the widening drill (`repro/widen-before.arch` → `repro/widen-after.arch`) moves the
  partition and its door with the room, with no literal to forget.
- Resolve order changes for every plan. The byte-identity law, diagnostics order included, is the
  gate for PS3.2, not a consequence to re-measure: if the order change moves any corpus byte, the
  card stops.
- Derived walls have no ids. Openings reach them by `between`/`on <room>.<edge>`, furniture by
  `against <room>.<edge>`, selectors by plan card PS3.5's `containing <room>.<edge>`; plain `dim`
  takes points, which may now be datums. What is lost by name is only `against wall <id>` on a
  derived partition (replaced by §5a) and `roof overhang wall <id>` (the outer ring is the one
  candidate; an authored exterior wall beside it makes the roof ambiguous, as it is today).
- Compass words in datums are restricted to north-up root frames. The alternative, compass datums
  that rotate with `north` or with `place`, would make `living.north` move when the plan is turned,
  which no author expects of a wall.
- `open between` always derives an opening, so every open-plan join is an access edge. An author
  who wants two rooms to be one space with no boundary at all writes one room.

## Alternatives considered

- **Walls primary, rooms derived** (Revit, ArchiCAD): fits a drafter at a screen, not an author who
  writes a room graph; it also cannot make a missing wall unwritable, because the room is then the
  derived thing and a missing wall simply merges two rooms.
- **Pairwise forms as the headline** (D1 as first written): every pair must still be enumerated, so
  a shared edge with no wall is still writable by omission. Kept as the mixed-authoring forms (D5).
- **Synthetic ids for derived walls** (`w_ext`, `w_a_b`): not injective under `_` in room ids, and
  unparseable across `place` where ids are dotted references. Replaced by relational addressing.
- **A constraint solver that keeps walls on room edges**: refused by ADR 0004 and ADR 0005. Every
  derivation here is closed-form with every target named; where the arithmetic has no single answer
  the compiler refuses.
- **Snapping a derived opening to the nearest legal nib**: a silent choice (ADR 0005). Refuse and
  name the legal position instead.

## Reversal conditions

Recorded with D1 and D5 in the plan:

- the resolve-order change cannot be made byte-identical for plans that use no new form, or the
  `place`-frame semantics of datums cannot be made sound (the test is the D4 equivariance oracle,
  `test/d4-oracle.ts`, run on a component that derives walls and hosts a hinged door on them under
  all eight frames): ship datums in wall points only and keep `between` as an explicit `arch`
  transform;
- `walls from rooms` needs a fourth clause in practice, or its preconditions refuse more than a
  quarter of the corpus storeys when measured mechanically (Acceptance): the pairwise forms become
  the headline and `walls from rooms` is dropped.

## Acceptance (cards PS3.0, PS3.2–PS3.4)

- Before any form lands: a probe runs the four preconditions that need no clause (overlap, tiling
  with the hole and pinch rules, too-short run, non-rectangle) over every corpus storey and reports
  the refusal share twice: with no exclusions, and with a reviewed per-example `except` list
  checked into the probe (no use kind means "outdoor", so a terrace is excluded by that list, never
  by reading its label). D5's quarter threshold is read from the excluded figure, and both are
  recorded in the plan.
- Byte-identity sweep green with the new resolve order and no new form in use, diagnostics order
  included.
- `examples/relational.arch` and `examples/two-bed.arch` rewritten in the headline form lint clean
  of the class-1 and class-2 codes, and the widening drill moves walls and doors with the room.
- Each class-2 defect-corpus case, written with `walls from rooms`, is refused or gains the wall.
- Every refusal code above has a catalogue entry, a span on the offending clause, and a test; no
  reserved codes.
