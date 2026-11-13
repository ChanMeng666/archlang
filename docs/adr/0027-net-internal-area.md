# 27. Net internal area beside the centreline area

- **Status:** Accepted
- **Date:** 2026-10
- **Relates to:** [ADR 0022](0022-exact-decisions-and-bounded-input.md) (decide geometry exactly
  where the inputs allow), [ADR 0008](0008-circulation-as-facts.md) (`describe()` reports facts)
- **Scope:** `describe()` gains `rooms[].net_area_m2`, `totals.net_floor_area_m2` and, on a
  `schedule rooms` plan, `schedule[].net_area_m2`; the drawn ROOM SCHEDULE gains a NET AREA
  column. No language syntax, no change to `lint()`, `area_m2` unchanged.

## Context

A room is drawn on wall centrelines, so `area_m2` runs to the middle of every wall round it.
That is the right figure for a plan's geometry, and two consumers depend on it byte for byte:
the dataset deduplicates rows by `describe()` (`dataset/dedup.ts`) and the fidelity eval scores
room areas (`eval/fidelity.ts`). It is not the figure a buyer, a brief or a building code means
by "room area". They mean the floor between the walls. On a typical flat that is about 8%
less: the agent-UX audit plan reports 65.00 m² on centrelines and about 60.0 m² net.

An agent reading `describe()` could only estimate the difference. The owner decided
(agent-reach decision 2, 2026-10-13) that `describe()` gains a new field `net_area_m2`,
`area_m2` stays as it is, and the byte-identity law tables are re-measured once, with this
reason written down. The same record adds a condition: if net area cannot be computed exactly
from the room's shape for wall-less edges or curved rooms, the field ships only for the cases
it can state exactly, and no copy calls an approximate figure a measurement.

## Decision

**1. Net area is the room's floor that no wall stands on.**

    net_area = area(room) − area(room ∩ ⋃ wall bands)

The room is its own shape (a rectangle, a `room polygon`'s ring, a `room circle`), never its
bounding box. A wall's **band** is the solid the drawing draws for it before any opening is
cut, built by `wallBand()` in `src/geometry/band.ts`, the same builder the wall joinery uses:
its two faces at ± half its thickness, a square cap at a free end, a mitre at each joint
(bevelled past the stroke's mitre limit), and true concentric arcs on a curved run.

The first version of this rule inset only the edges that had a wall centreline ON them. That
missed every wall standing on a floor any other way, and the shipped corpus has them:
`examples/hexagon-pavilion.arch`'s 1200 mm drum is tangent to the inner edge of all six wedge
galleries, so its outer half-band covers about 1.5 m² of each (15.09 → 13.55 m², 11.97 →
10.52 m²). The figure is now what the drawing shows. What follows from the definition:

- **A wall on the room's edge takes half of itself** (each wall its own thickness). A shared
  partition takes half from each room either side. This is the old inset, and on every room
  where the old rule was right the two give the same number (see Consequences).
- **A wall standing on the floor takes what it stands on**: a drum tangent to a room, a bay
  curving into it, a wall whose centreline is off the edge, a wall across or inside the room.
- **A wall's free end is drawn square-capped**, half its thickness past the end, and the cap
  stands on whatever floor is there. Where a thicker wall ends on an edge beside a thinner one,
  its cap takes a little more than the thinner wall's inset.
- **A joint is drawn mitred**, so at an inside (reflex) corner of one wall run the corner
  square is wall. Two separate walls meeting there are square-capped, and their caps cover the
  same square.
- **An edge with no wall loses nothing**, and a door or window does not cut the band: the
  threshold inside a wall's thickness is not floor.
- **A circle** is cut by whatever band crosses it: a concentric arc wall walled all round by
  one thickness leaves `π(r − t/2)²`, and a straight wall tangent to it takes the circular
  segment its band covers.

**2. Exact, or omitted.** The area of `room ∩ ⋃ bands` is computed by Green's theorem on its
boundary. Every edge of the room and of every band whose box meets the room's box (straight
lines and true arcs) is split at every crossing with every other, in closed form
(`src/geometry/intersect.ts`). A piece lies on the boundary of the covered region exactly when
one side of it is in the room and in a band and the other side is not. Each such piece adds
`½∮(x dy − y dx)` in closed form: a line by its two ends, an arc by its ends, centre and swept
angle. A piece that two edges share is counted once. No tessellation, no sampling and no
bounding box enters the figure. On a rectilinear plan every crossing is an exact
vertical × horizontal intersection, so the sum is exact in floating point. An arc piece reads
its angle through `Math.atan2`, which is not exactly rounded across engines, so a room crossed
by a curved band may differ in the last ulps between platforms, far below the 0.01 m² it is
printed to.

The figure is **omitted** (no `net_area_m2` on the room) rather than approximated in four named
cases:

- The room's box meets more than `MAX_NET_CURVES` (2,000) room and band edges. The pair loop
  is quadratic in them, and the cap bounds it. No shipped room reaches 140.
- The walk over the split's pieces would cost more than `MAX_NET_PROBE_WORK` (20,000,000), a
  count charged after the split and before the walk: 2 × pieces × (the nearby bands' boxes and
  edges + the edges of the fullest y-band of the room's ring). A ring of hundreds of vertices
  crossed by hundreds of free-standing walls stays under the edge cap and still took a minute
  to walk. No shipped room is charged more than 175,000.
- The boundary integral is not finite, or falls outside `[−ε, area + ε]` with
  `ε = 10⁻⁹ · area + 10⁻³ mm²`. That is the signature of a configuration the split did not
  resolve. No shipped room triggers it.
- The call has spent its total (added for backlog U.22). One `describe()`, one `lint()` and each
  storey `compile()` draws share one meter of `MAX_NET_PLAN_WORK` (40,000,000) units, charged
  each room's counts (its split's pair tests, then its walk) before the work they pay for, rooms
  in element order, storeys in level order. Past it the meter closes: that room and every later
  one in the call omit the figure. A memo hit charges what the miss charged, so the answer never
  depends on what ran before. No shipped plan's `describe()` charges more than 275,000.

When any room's figure is omitted, `totals.net_floor_area_m2` is omitted too (never a sum over
a subset), and so are the room schedule's net subtotal and TOTAL. The omitted cell is drawn `-`,
the table's ASCII mark for "no value" (the DOOR & WINDOW SCHEDULE's HAND column uses it).
`describe()` has no notes channel, so the absent key is the signal. Within `ε`, the result is
clamped to `[0, area]` so that `net <= area` holds to the last bit. The clamp removes float
noise and nothing else: the corpus test reads the unclamped figure and finds it inside
`[0, area]` on every room.

**3. Implementation.** `src/analyze/net-area.ts` (`netAreaBands`, `roomNetAreaMm2`,
`netAreaDetail`), re-exported from `src/analyze.ts` beside `roomAreaMm2`. `describe()` builds
a storey's bands once and measures every room against them. Inside `compile()`, a
`schedule rooms` plan measures the same rooms for its table. The drawing budget is charged
first (`src/draw-budget.ts`) with a count that builds no band: each room's edges times the
wall segments whose box meets it. The public `roomSchedule()` measures net area only when it
is given the walls; without them its rows carry no net figure at all, never one equal to
`area_m2`.

**4. What reports it.**

- `describe().rooms[].net_area_m2`: 2 dp, `<= area_m2`, equal to it when no wall touches the
  room. Absent when omitted.
- `describe().totals.net_floor_area_m2`: the sum of the rooms' rounded figures, the way
  `floor_area_m2` sums theirs. Absent when any room's is.
- `describe().schedule[].net_area_m2` on a `schedule rooms` plan.
- The drawn ROOM SCHEDULE's NET AREA column, with its subtotals and TOTAL. The centreline
  column is labelled `AREA (CENTRELINE, m²)` and the new one `NET AREA (m²)`. These are the
  owner's "Area (centreline)" and "Net area" in the table's capitals, with the unit kept. The
  AREA column widens to hold its label. The NO. and NAME cells keep their place; the AREA
  cells and totals move right with the column's right edge.

`lint()` does not read net area. The minimum-area rules stay on `area_m2`, so no diagnostic
moves. Zones, the caption and Plan JSON are unchanged.

## Consequences

- Every `describe()` payload gains the fields, so every byte-identity row that digests
  `describe()` moved. They were re-measured once, with the reason written in each table's
  header (`test/byte-identity-baseline.ts`, "EVERY row re-measured, once"). The switch from
  the edge inset to the band rule moved six more plans, each named with its rooms in "Six
  plans re-measured again": `hexagon-pavilion`, `tiny-house`, `aquarium`, `hillside-villa`,
  `materials` and `townhouse`. A hybrid run of the law tests, with the earlier `describe()`,
  shows that nothing else moved.
- On the red-team's constructed rooms (32 of its 36 resolve as written), the band rule gives
  the edge inset's number to the square millimetre wherever the inset was right (13 rooms):
  walls on the edge, shared partitions, a T, collinear runs, reversed runs, reflex joints and
  a U. It differs where a band stands on the floor (an intrusion, a through-wall, an offset
  wall, a free end's cap), and on a thin oblique room where the old insets crossed and were
  clamped to zero. In every one of the 32 it agrees with the grid oracle.
- Every `schedule rooms` sheet's room schedule is wider, by the NET AREA column and by what
  the AREA column grew to hold its label. A legend, door & window schedule or notes table to
  its right moves right by that width. No page size in the corpus moved.
- `area_m2` remains the centreline figure, so `dataset/dedup.ts` and `eval/fidelity.ts` read
  the same numbers as before.
- `test/net-area.test.ts` holds every corpus room to a grid oracle (`test/helpers/net-area-oracle.ts`)
  within the oracle's own error bound. The oracle shares only the band and the room's own area
  with the code. The same test shows the oracle rejects the old inset-only figure on
  hexagon-pavilion, so an intrusion like that one cannot hide again.
- The D4 equivariance oracle (`test/helpers/d4-oracle.ts`) holds net area invariant under every turn
  and mirror of a placed plan.
- The measurement is quadratic in the band edges near one room. It is capped per room by
  `MAX_NET_CURVES` and, inside `compile()`, charged to the drawing budget before it runs.
  `describe()` has no budget, so there the cost is that cap times the number of rooms; compile
  charges it only under `schedule rooms`, and in practice the hosted Worker's CPU cap bounds it.
