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
