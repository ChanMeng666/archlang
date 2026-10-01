# 8. Circulation is reported as facts on a clearance-eroded nav grid, never generated

- **Status:** Accepted
- **Date:** 2026-07 (v1.10 planning)

## Context

`describe()` already answers *"can you reach this room?"* — the door **access graph**
(`access`) models connectivity through modeled doors/openings, and the per-room
**occupancy** flood-fill (`src/analyze/occupancy.ts`) measures how much clear floor a
doorway can reach. What neither answers is the next question an agent asks about a layout:
*how far* is the walk to a room, *how wide* is the tightest point on the way, and *how
direct* is the route versus a straight line.

These are the numbers that separate a plan that merely connects from one that is pleasant
to move through — a bedroom two turns and a 700 mm squeeze from the door reads very
differently from one straight off the hall. They are also exactly the kind of thing a
generative tool is tempted to *optimise*. [ADR 0005](0005-no-invisible-architect.md) and
[ADR 0006](0006-solver-as-explicit-transform.md) already drew that line: the compiler is a
faithful renderer; "design intelligence" ships as **facts** (`describe`) and **advisory
lint**, and any layout change is an **explicit, reviewable** source-to-source transform
(`arch repair`), never invisible behaviour.

## Decision

**Circulation is a new block of facts on `describe().circulation` — a measurement, not a
generator.** It never moves a wall or a fixture and never changes rendering (default SVG
output is byte-identical; circulation lives only in the semantic summary).

The model is a whole-plan **navigation grid** built with the same discipline as
`occupancy.ts` — fixed cell size, integer cell coordinates, source-ordered seeds, row-major
iteration, never a float as a key — so it is pure, deterministic and zero-dependency. Three
choices make it a *walking* model rather than bare reachability, and each trades exactness
for an honest, cheap, stable number:

- **Walls are rasterised, doors carve back through.** A wall thinner than a cell occupies no
  cell centre, so adjacent rooms would otherwise leak into each other along their whole
  shared edge. Cells within half a wall's thickness of a wall segment are blocked; each
  modeled connector then carves a threshold slit between the two rooms' nearest free cells.
  Rooms connect **only** where a door/opening actually is.
- **Clearance erosion by a body radius (default 300 mm).** A cell is walkable only if its
  centre is farther than a body radius from every furniture footprint — obstacles are
  inflated by the space a person occupies, so a route is one a body fits through.
- **Clearance is distance to *furniture*, not to walls.** Inside a room you walk freely, so
  a cell's clear width comes from a distance transform seeded on the furniture-eroded cells
  (`≈ (2·hops − 1)·cell`); a doorway cell instead reads its connector's modeled clear width
  (which the access graph already estimates). A cell far from furniture reads "open", so
  only doors and furniture pinches ever set a bottleneck — never proximity to a room wall.

Distances are a deterministic 4-connected uniform-cost BFS (shortest walk). The
**bottleneck** is a widest-path (max-min) clearance — the *unavoidable* squeeze on the best
route into a room, the cell-grid analogue of the access graph's widest-path clear width —
not the min along the single shortest path, which would degenerate to one cell wherever the
path hugs a wall. All millimetres are rounded to integers, ratios to two decimals, through
the existing deterministic rounding.

The numbers are deliberately **coarse and advisory**: grid-quantised to the cell size, the
distance transform is Manhattan, and the bottleneck reads a modeled door width rather than
true hardware clear width. They are facts for an agent (and, later, an advisory lint rule)
to read — never a target the compiler silently solves for.

## Consequences

- `describe()` gains an append-only `circulation` field: per reachable room `{ walkDistanceMm,
  bottleneckClearWidthMm, detourRatio }`, plus key functional routes (kitchen → nearest
  living/dining, bedroom → nearest bath). It is `null` when the plan has no modeled exterior
  entrance — there is nothing to measure a walk from — mirroring `access.hasEntrance: false`.
- No render change and no golden churn: circulation is computed only in the semantic layer.
  A test pins that importing/running the module leaves `compile(studio.arch)` byte-identical.
- Cost is bounded: the grid is clamped per axis, so a large plan grows the cell, not the work.
- This does **not** reopen ADR 0005/0006. Circulation *describes* how a plan walks; if a tool
  wants to improve it, that remains the agent's job (edit the source, re-`describe`) or an
  explicit transform — never an invisible optimiser in `compile()`.

## Addendum (2026-07): resolution scales with area, not a fixed cell count

The decision above stands unchanged — circulation is still facts on a clearance-eroded nav
grid, still coarse, still advisory. What this addendum replaces is one *implementation*
choice inside it: "Cost is bounded: the grid is clamped per axis, so a large plan grows the
cell, not the work."

**The problem.** Bounding the grid by a fixed cell COUNT (10 000 cells, 200 per axis) makes
every measurement scale-relative. At `examples/museum.arch`'s 100 × 60 m the cell reached
**775 mm**, and at that resolution the model can no longer see what it exists to measure: a
900 mm door is one cell, the 300 mm body-radius erosion is a third of a cell, and clear
width quantises in ~775 mm steps — so a compliant 1.8 m corridor and an illegal 1.0 m one
report the *same* number. All 14 museum rooms read an identical 1940 mm bottleneck. The
per-room occupancy grid had the same shape: a 26 × 26 m gallery gridded at ~520 mm, and
because blocking is "is the cell CENTRE inside the footprint", a fixture only a few hundred
mm deep could fall between two rows of centres and be measured as **not there at all**.

**The change.** The knob becomes a target cell **size** bounded by a total cell **budget**:

```
nav grid:   cell = max(100 mm, ceil(sqrt(planArea / 250 000)))
occupancy:  cell = max(100 mm, ceil(sqrt(roomArea /  25 000)))
```

- `MIN_CELL_MM = 100` is unchanged, so **every dwelling-scale plan is byte-for-byte
  unaffected**: the floor holds to 2500 m² (nav) and 250 m² (per room). The museum drops
  from 775 mm to **155 mm**, and its bottlenecks now discriminate (1140 vs 1940 mm).
- The **per-axis clamp is dropped**. Total cells ≈ `area / cell²` ≤ the budget whichever
  branch of the `max` wins, so the budget alone bounds the grid — and a per-axis cap would
  re-introduce exactly the quantisation this removes on a long, thin building.
- Still closed-form, integral, monotonic in the area, and therefore deterministic.

**What paid for it.** ~250 000 cells is 25× the old grid, so two scans that were
`O(cells × rects)` were restructured to per-rect bbox scans — same predicate on the same
cells, `O(cells + covered)` — and the widest-path heap stopped allocating an array per
swap. `bench/` gains a `MUSEUM` case (and an `occupancy` row) to hold the line.

**One consequence worth naming.** A finer cell exposed a latent assumption in the threshold
carve: a connector was modelled as the single cell at its centre point, which is fine while
the opening is about one cell wide. At 155 mm a 4 m opening spans two dozen cells, and the
museum's cafe — a 6 m servery parked across half of its 4 m threshold — read as *sealed*.
The carve now tries the centre first (so any plan that already carves is untouched) and,
only if that is blocked, carves the parts of the opening that are genuinely walkable. A
fully covered opening still reports the room as unreachable: no room is ever connected by
fiat.

## Addendum (2026-09): every walk starts at the room's nearest entrance

The decision stands; this replaces one choice inside it. Every walk used to be measured
from `entrances[0]`, so on a plan with several front doors a room served by another door
was measured the long way round, or not at all (`unmeasured: other_entrance` — sixteen
rooms across the shipped examples, among them three of `terrace-row`'s four houses).

The owner's decision is **nearest entrance per room**. The walk is one multi-source search
seeded at every entrance at once — the `MIN_PLUS` sum over the entrances, the same shape as
the multi-source flood that already decided `blocked` — and each room is measured from
whichever entrance reaches it first, ties to the entrance written first. The bottleneck is
the widest route from ANY entrance, each seeded at its own clear width, and the detour
ratio is taken from the room's own entrance.

- `rooms[].entranceId` names that entrance, and appears **only when the plan has more than
  one entrance**, so every single-entrance plan keeps its bytes. The top-level `entranceId`
  stays (append-only) and means the first entrance.
- `other_entrance` is retired: a room any entrance reaches is measured. The reason stays in
  the type so an exhaustive consumer still compiles.
- The lint rules (`W_PATH_TOO_NARROW`, `W_CIRCUITOUS_PATH`) and the `--overlay circulation`
  walks read the same per-room values, so the drawing starts each walk at the room's own
  entrance.

## Addendum (2026-09): ties are broken by the group, not by the page (circulation v2)

The decision stands; this replaces how the grid resolves an exact tie. "Deterministic by
row-major iteration" made every tie a page-order choice, and a turned or flipped plan (a
`place … rotate r mirror m`) measured its rooms differently from the unplaced one — by a
cell for an endpoint tie, by metres where furniture rings a room's centre (`courtyard-house`'s
dining room 1.4 m, `garden-loft`'s living room 1.9 m) or where a doorway on a lattice line was
carved on one side only. "Coarse and grid-quantised" licenses a cell of noise; it does not
license a different answer for the same building drawn the other way up. The owner's decision
is **D4-symmetric tie rules**, and every tie below is now resolved by a rule the dihedral group
preserves:

- **An entrance on a lattice line seeds both sides of it.** Every cell whose closed square
  holds the doorway point starts the inward walk (one, two across a line, four at a crossing);
  each seed is a source of the multi-source search, and the straight line a detour divides by
  runs to the nearer seed.
- **A threshold is carved on a symmetric row set.** Each threshold point seeds both rooms the
  same way, each seed is paired with its nearest seed on the other side, and each pair is
  carved by both L-shaped runs (x-then-y and y-then-x); the axis a threshold spans comes from
  the host wall's direction. A carve stamps the connector's width on the cells it opens and on
  its far seed, never on a room cell an L-run only passes along.
- **Among equidistant cells, the one the walk reaches first, then a group-invariant key** —
  the straight line to the walk's own entrance, the sorted offsets from the room's centre, the
  entrance's source order. Cells that tie on the whole key read the same room facts (walk,
  entrance, detour), but they need not be images of each other under a symmetry of the plan —
  a bed's two cells mirrored about its entrance's own axis tie while the bath it is routed to
  is entered off that axis — so a **key route is measured between the two rooms' tie sets**:
  the fewest hops from any tied cell of one to any of the other, the target the nearest by
  that walk (ties to the room written first), the detour's straight line the shortest pair
  realising it. That was chosen over a longer key because no room-local term can see where a
  route will go, and every term of the set rule is a minimum a turn or flip maps onto its
  image; a room with one tied cell measures exactly as before, and no shipped route moved.
  (The page-order route was pre-existing: on the tree before this addendum the red team's
  plan moved its route under a turn too, where the oracle did not yet compare routes.) The
  cell index still picks the one cell the overlay draws a walk to. A room's seed point (and a concave room's pole
  orbit) is snapped to the frame's 2⁻¹⁰ mm lattice first, so a centroid an ulp off a lattice
  corner cannot break the tie by rounding noise.

With these, every circulation fact — each room's walk, bottleneck, detour and entrance, every
key route, the sealed rooms' widest way in — is exactly equivariant on a grid-aligned plan
(`test/equivariance-corpus.test.ts` compares all of them under every element; the four raster
classes of the oracle are closed). A plan whose extent is not a whole number of cells is still
compared only under translation: its last cell spills past one edge, and a turn moves the spill.

**A wall thinner than a cell blocks the cells its centreline crosses** (backlog C.1). The grid
blocked a cell only when its centre lay within half a wall's thickness of the centreline, so an
80 mm partition on a lattice line of 100 mm cells blocked nothing and the walk leaked through it.
Every cell the centreline touches (closed square) is now blocked too. The walk is 4-connected,
and the touched cells of a continuous centreline form an edge-connected chain — where it passes
exactly through a lattice corner all four cells round the corner are touched — so no step slips
between them. A touched cell's centre is within `cell·√2/2` of the line, so for a wall of at
least `cell·√2` (~142 mm on 100 mm cells) the centre test already blocked it and nothing changes.
The literal alternative, blocking every cell the whole BAND passes through, was measured and
rejected: a square predicate sits exactly on its decision boundary wherever a face is tangent to
a lattice line, which puts the hand-derived drum of `test/circulation-hand-derived.test.ts` on a
knife edge — a 1 mm nudge moved its walk 16100 → 16300 (and the open arc's 16500 → 16700) — where
the centre rule's mod-8 argument had ruled every tie out.

**The overlay is drawn on the facts' grid** (backlog C.2): `--overlay circulation` now passes the
storey's voids, as `describe()` and lint do.

**The detour stays per walk-nearest entrance** (owner decision, backlog C.3): one record is one
route, the walk `walkDistanceMm` reports over the straight line from that same entrance, not the
least ratio over every entrance. `W_CIRCUITOUS_PATH` names the entrance it measures from.

Measured on the shipped corpus: 24 examples move, only in `describe().circulation` (walks,
detours and key routes; no bottleneck, entrance or sealed room); SVG, `lint()` and
`compile().diagnostics` are byte-identical. The field-by-field ledger is in the header of
`test/byte-identity-baseline.ts`.

## Addendum (2026-10): a storey reached only by a shaft walks from the shaft

The decision stands; this replaces "`null` when the plan has no modeled exterior entrance" for
one case. A storey with no exterior door that a `stair`, `elevator` or `escalator` reaches from a
reachable storey had no circulation facts, while lint's reachability rule already walked it
from the room the shaft lands in — two rules disagreeing on what an entrance is upstairs. The
owner's decision is that **the arriving runs are that storey's entrances**:

- each run seeds the walk at the row of cells in front of its entry edge (the edge whose halo
  the grid already lifts, carried through `place` by the run's own tail), multi-source exactly
  as several front doors are, each seed at the run's width;
- the rooms a walk is meaningful for are those the doors reach from the arrival rooms, the
  same search `W_ROOM_UNREACHABLE` runs, so a landing with no door out gives every other
  room `no_door_route`;
- `entranceId` is the run's id (per room only when several runs arrive), and
  `W_PATH_TOO_NARROW`/`W_CIRCUITOUS_PATH` and `arch repair`'s circulation guard read it.

A storey with a front door walks from it whatever shafts land there, so every grounded storey
and every single-storey plan is byte-identical. Measured on the shipped corpus: `hillside-villa`,
`townhouse` and `two-storey` move, only in their upper storeys' `levels[i].circulation` (null →
a model) and in new `W_PATH_TOO_NARROW` warnings; the SVG and `compile().diagnostics` are
byte-identical. The ledger is in the header of `test/byte-identity-baseline.ts`.
