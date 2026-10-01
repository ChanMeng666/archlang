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
  its far seed (there as the minimum with the room's own clearance; see the 2026-10 addendum
  on the far seed), never on a room cell an L-run only passes along.
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
from the room the shaft lands in: on such a storey `W_ROOM_UNREACHABLE` had an entrance and
`W_PATH_TOO_NARROW`/`W_CIRCUITOUS_PATH` had none. The owner's decision is that **the arriving
runs are that storey's entrances**:

- a run is an arrival when one of its neighbouring stops (below or above, along its shaft)
  is reachable — storey and room — in the room-aware building graph with this storey taken
  out: a property of the building's connectivity, independent of declaration order. A run
  with no such side is boarded here, not arrived by, and is no entrance;
- each arriving run seeds the walk at the row of cells in front of the edge a person steps
  off at: the **head of the flight from that side** — the end opposite where the neighbouring
  storey boards that run (its tail) — never this storey's own tail, which is where a flight
  continuing onward is boarded. An escalator is stepped off at that one end only; a lift car
  at its door side. The run's halo is lifted outside that edge, and the edge is read off the
  run's tail, so it crosses `place`. With arrival sides both below and above, or a different
  kind of run on the arriving side, the run's own entry edges are used. Seeds are
  multi-source exactly as several front doors are, each at the run's width;
- the rooms a walk is meaningful for are those the doors reach from the arrival rooms, the
  same search `W_ROOM_UNREACHABLE` runs from on that storey, so a landing with no door out
  gives every other room `no_door_route`;
- `entranceId` is the run's id (per room only when several runs arrive), and
  `W_PATH_TOO_NARROW`/`W_CIRCUITOUS_PATH` and `arch repair`'s circulation guard read it.

The two rules still differ on a storey whose only exterior doors open onto a balcony: its
`access.hasEntrance` is true, so circulation walks from the balcony door, while
`W_ROOM_UNREACHABLE` starts from the arrival rooms as well as the exterior. A storey with any
exterior door walks from it, whatever shafts land there, so every such storey and every
single-storey plan is byte-identical. The top-level `circulation` repeats `levels[0]`, so it
moves too when the LOWEST storey is shaft-reached (a basement reached down from the ground
floor); no shipped example has one.

Whether a landing exists is decided on the plan's geometry (floor just beyond the edge that
no wall band, void, other run or furniture within a body radius covers), never on cell
centres, so a landing never reads measured in one frame and sealed in a turned one; given a
landing, the walk starts in the row of cells in front of the edge, or at the free cells
nearest it when the grid's phase leaves that row with none. A run drawn along another axis on the storey it is boarded from takes its own entry
edges. A v1 limit follows from reading the edge off the drawn direction: a landing with no
floor in front of it seeds nothing, and the storey measures nothing — its rooms read
`unmeasured: unreachable` (a head against the shell) or `no_threshold` (a landing covered on a
storey whose room has no doorway). A distinct reason would be a schema change; it is not made
here.

Measured on the shipped corpus: `hillside-villa`, `townhouse` and `two-storey` move, only in
their upper storeys' `levels[i].circulation` (null → a model) and in new `W_PATH_TOO_NARROW`
warnings; the SVG and `compile().diagnostics` are byte-identical. The ledger is in the header
of `test/byte-identity-baseline.ts`.

## Addendum (2026-10): a cell's width is the minimum of every constraint on it (the far seed)

The decision stands; this settles the one stamp that replaced a value instead of narrowing it.
A carve wrote its connector's clear width onto its far seed (the last cell of each carve path,
always a seed of the `between[1]` room) even though that cell was already walkable, so a
furniture pinch narrower than the door on that cell was erased: the walk read the door's
width through a squeeze it could not pass at that width. Because the far seed is always
`between[1]`'s, the result also depended on which room was written first.

The owner's decision is that **a cell's width is the minimum of every constraint on it**. A
cell the carve opens has no clearance of its own and reads the connector's width; a far seed
reads the narrower of the connector's width and the room's own clearance there (the
furniture distance transform, `centreFreedomToClearWidth`). The door still caps every route
through it, and the pinch stays a pinch. Dropping the far-seed stamp instead was measured
and rejected. A key route was then seeded at +Infinity on every free cell of its from-room,
the cells a carve opened inside that room's rectangle included (a cell belongs to the room
that holds its centre), and the widest search never reads a source cell's own clearance,
only a neighbour's. On `min-bedroom-flat` every cell `d_bath` opens lies in the bedroom, so
the far seed in the bath was the route's only cap, and without it the route bed → bath read
14000 through a 740 mm door. `test/far-seed-pinch.test.ts` holds the corpus to "no walk or
key route is wider than the widest door path it must take".

**A key route starts on its room's floor** (owner-delegated, same window). The same seeding
let a route escape its door outright: with the from-room's far seed on its own side and every
opened cell in its rectangle, no stamped cell lay outside the sources, and the red team's
plan (bath and bedroom meeting at x = 5000, a 100 mm partition on x = 5050, an 800 mm door)
read bed → bath 14000 with the bath written first and 740 with the bedroom first. A route's
sources are now the from-room's FLOOR — cells walkable before any threshold was carved — so
the cells a carve opened are the way out, not a starting point, and the door caps the route
in either order and every frame (`test/route-source-floor.test.ts`). That makes the corpus
bound a law for rooms separated by walls. Seeding the opened cells at their own stamp
instead would read the same; the floor rule says what a route starts on. Walks are seeded
only at entrances, each at that entrance's width, so they never had this hole. Measured: no
fact moves on the shipped corpus (every digest byte-identical); on a random family of the
red team's plan (500 draws over partition offset and thickness, door, source order and
frame) 131 routes move, every one from above its door's width to exactly the door's width.

**A room is reached on its floor** (owner-delegated, the same rule on the arriving side). A
room's walk and bottleneck, and a key route's arrival, were read at the room's best cell, and
a doorway's opened cells inside its rectangle counted: a room whose only door is pinched just
past the threshold read the door's width for a floor reached only through the pinch. A room's
cells are now its floor, as a route's sources are; a room with no floor cell at all would keep
the cells it has (it never happens on the corpus or in 1000 random plans). Measured: on the
shipped corpus one fact moves, `hillside-villa`'s terrace 1140 → 840 — the kitchen's sliding
door opens onto a 700 mm strip between the wall and two sun loungers, so its floor is reached
at best through the 840 mm dining door; the accessibility profile gains that walk's
`W_PATH_TOO_NARROW`, and the overlay moves pinch markers on 14 files. In 1000 random plans 7
facts move, and on a random family of the pinched doorway 151; each is exactly the room's or
route's best over its floor where it had been the best over its doorway cells, with no walk
moving.

Two other stamps write a width over a cell's own clearance: a front door's on its seed cells
and a shaft run's on its landing cells. Both are walk SOURCES, and a source's value is the
seed value the walk starts at (`sourceClear`), not the cell's clearance, so the same rule
there means changing the seed value itself. That was measured separately for each, and
both were left alone because it would measure something else. A front door is seeded at its
point only, not across its width, so the minimum would read the clearance at one point of a
wide door: the 3 m garage doors of `garden-house` and `hillside-villa`, with cars parked
behind them, would read 2300 and 1300 instead of 2940 (and `eval/faults/blocked-doorway` and
`combined` 840 → 700), the dependence on a midpoint's phase that carving a connector across
its whole width removed. A shaft's landing cells abut the run's own footprint, so the
minimum would read the stair a person has just stepped off as a pinch: no walk on a
shaft-reached storey could read wider than one hop beside the run (700 mm), and thirteen
walks in five corpus files fell to it.

Measured on the shipped corpus: no fact moves. SVG, `describe()`, `lint()` (default and
`accessibility-advisory`) and `compile().diagnostics` are byte-identical; only the opt-in
overlay moves, its pinch markers at the same `clearMm`. The closed-class witness of the carve
order now reads its WC pinch, 700, in every frame. The ledger is in the header of
`test/byte-identity-baseline.ts`.
