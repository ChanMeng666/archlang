# 18. One zero-dependency joinery pass for every wall

- **Status:** Accepted
- **Date:** 2026-08 (v1.30)
- **Amends:** [ADR 0002](0002-optional-dep-geometry.md) — its `clipper2-wasm` bullet no
  longer holds.

## Context

Until v1.30 a plan's poché and wall faces came from **one of three** lowering paths,
chosen by the shape of the walls:

1. **Orthogonal** — the zero-dependency axis-aligned rectangle boolean in
   `geometry/union.ts`, which also subtracted an axis-aligned rectangle per opening.
2. **Angled** — a `clipper2-wasm` polygon boolean, but *only when that optional
   dependency happened to be registered*. Otherwise the wall element's own `render()`
   drew one poché rectangle per segment with two untrimmed face lines.
3. **Curved** — always the per-segment path, deliberately: routing an arc through the
   polygon boolean would have faceted it and would have made a curved plan's bytes depend
   on an optional install.

Three paths meant three sets of corner cases, and each shipped a visible defect:

- **A face line drawn inside another wall's solid.** A partition met an exterior wall and
  its two face lines carried straight on through the poché, stopping mid-hatch. Visible in
  every multi-material plan and at every junction with a curve.
- **Loose per-segment rectangles.** An angled or curved wall was a row of separate
  square-capped boxes; where two segments shared a corner, both drew their own cap, and
  the seam showed.
- **An opening that did not open.** Only the rectilinear boolean subtracted anything, so
  on an angled or curved wall the "doorway" was an opaque `theme.opening` cover painted on
  top, overhanging the faces onto the floor — and the wall's own face lines were still
  drawn straight across it. `hexagon-pavilion`'s 1200 mm drum showed both of its face
  circles running unbroken through all six doorways.
- **Bytes that depended on an optional install.** Registering `clipper2-wasm` changed an
  angled plan's drawing. That is the sharpest statement of the problem: a rendering
  decision was being made by whether `npm install` had succeeded at fetching a native
  package.

## Decision

**One path, for every wall.** `src/wall-lowering.ts`'s `lowerWallSet` builds each wall's
band, cuts every opening on every host, joins the whole set, and emits one poché fill per
material group plus **one outline for the entire plan**.

The algorithm is closed form and zero-dependency, in three modules:

- **`geometry/band.ts`** — a wall as exact closed `EdgeLoop`s: its two offset faces, its
  end caps, and a true **mitre** at every interior vertex (line–line, line–circle or
  circle–circle, whichever the pair of faces needs), bevelled past `MITER_LIMIT · h` so the
  fill and the stroke agree about where a spike stops. A curved face stays a real arc, at
  `r ± t/2`, never a polyline. `openingCut` produces the volume an opening removes: a
  rotated rectangle on a straight host, an annular sector with **radial** jambs on a curve.
- **`geometry/intersect.ts`** — the closed-form meets and the half-open ray crossings the
  above needs, with no epsilon nudging.
- **`geometry/joinery.ts`** — `joinWalls`: split every edge at every mutual crossing,
  classify each sub-edge by probing just off either side of its own midpoint, **keep an
  edge iff exactly one side has an owner**, direct it so its solid is on the right of
  travel, and chain the survivors into loops.

Two properties of the classification are worth stating because they are what make the
output correct rather than merely plausible:

- **A probe's owner is the THICKEST wall whose band contains it**, or nothing if an
  opening cut contains it. That is what makes a 100 mm partition drawn on the same
  centreline as a 250 mm shell disappear *into* the shell instead of drawing its own faces
  inside it.
- **An edge is on group `g`'s fill iff exactly one side is owned by `g`.** So a thin
  wall's end cap buried in a thicker wall of another material belongs to the thicker wall,
  and two materials tile without overlapping — one boundary line between them, not two
  stacked.

### Why the fills are ownership-trimmed rather than unioned per group

The obvious alternative is to union each material group independently and let the
groups overlap. It draws the same picture at first glance and is wrong in two ways. The
shared boundary between two materials gets drawn **twice**, once by each group, so it is
stroked at double weight and a translucent theme shows a seam. And whichever group is
emitted second paints its poché over the first, so which hatch you see inside the overlap
depends on `hatchesUsed`'s sort order — a rendering decision made by a string comparison.
Trimming by ownership gives every point of every wall exactly one owner, so the fills
partition the solid and the outline is a genuine 1-manifold.

### Why `path` is a new primitive and `region` stays

`region` is a list of straight-edged loops, which every backend has serialized since v0.9.
It cannot carry a curve. Rather than tessellate (which would face a curved plan, undoing
what v1.24 bought) or overload `region` (which would break every existing backend's
reading of it), `emitLoops` narrows to whichever primitive fits: **`region` while every
edge is straight, `path` as soon as one curves.** A `path` is a start point plus edges that
are lines or *unambiguously minor* arcs — minor because neither primitive carries a
large-arc flag.

Keeping `region` is not sentiment. It is what keeps a rectilinear plan on the bytes it
had: those plans are the overwhelming majority, and their outlines come out of the joinery
with the same vertices in the same loops as the retired rectangle boolean produced —
reversed and rotated to a canonical start, which no renderer can see.

### What `clipper2` is now

Not a rendering dependency. It moved from `optionalDependencies` to `devDependencies` and
survives as the **angled oracle** in `test/joinery-oracle.test.ts`: nothing zero-dependency
can answer an oblique or curved boolean, so the property suite feeds it tessellated bands
and compares. `geometry/union.ts` plays the same role for rectilinear input, where the
comparison can be exact.

Every `GeometryBackend` export is **kept and documented deprecated** —
`setGeometryBackend`, `getGeometryBackend`, `loadClipperBackend`, the `GeometryBackend` and
`JoinKind` types, and `Runtime.backend`. `src/index.ts` is append-only and a plugin may
hold them. Registering one is now a no-op for rendering, which
`test/union.test.ts` and `test/miter-limit.test.ts` assert in both directions.

## Consequences

**Every shipped drawing changes bytes**, and all of them were reviewed before blessing:
33 SVG snapshots, 23 PNG goldens, the 19 committed README SVGs, and the four
`roof-void-byte-identity` digests.

**`describe()` and `lint()` do not change by one byte** — held SHA-256 identical across all
29 examples and every storey, measured example by example before and after. This is a
rendering change and nothing else, which is what makes it safe to bless a diff this wide.

**The cased opening's two dashed lintel lines are gone.** They were a convention borrowed
from a drawing where the wall was *not* severed; with a real hole in the poché they
re-bridge the gap the joinery just opened. No opt-in.

**`RenderCtx.openingsVoided` is now always `true`.** It exists because the answer used to
depend on the shape of the plan. The field stays (the interface is append-only) and stays
optional, so a hand-built `RenderCtx` still defaults to the safe opaque behaviour.

**`wall.bounds` measures the band, so two examples' extents move.** The old rule took
`segmentRectangle`, which square-caps both ends of every segment — and at a corner those
caps are phantom, because the segment is mitred into its neighbour there. The extent
therefore moves in **both** directions: it shrinks at an obtuse corner (a cap corner sits
`√2 · h` from the vertex, the real mitre `h / sin(θ/2)`, which is less), grows at an acute
one up to the bevel limit, and is exactly equal at a right angle. Measured across every
example, exactly two are affected and both shrink — `gallery-l` by 61 mm each way and
`hexagon-pavilion` by 45 × 120 mm. No rectilinear plan moves. On a plan with no `paper`
that rescales `refDim` and so every derived line weight.

**A `close`-less ring is a ring.** `wallBand` asks whether the run *ends where it began*,
not whether the author wrote `close` — that keyword is what makes `segmentsOfWall` add a
closing segment, not a declaration about the result. It has to be this way for a curve:
there is no close-an-arc form, so a closed curve is written as the two halves it is.

**Performance — a real regression, measured, and NOT closed.** `toScene` gets slower, by a
lot. Measured back-to-back against `main` in the same session:

| corpus | main | branch | delta |
|---|---|---|---|
| all 29 shipped examples, every storey (total) | 57.5 ms | 162.0 ms | **+182%** |
| … mean per storey | 1.98 ms | 5.59 ms | +182% |
| … slowest single plan (`library`) | 6.75 ms | 16.0 ms | +137% |
| `bench` OPENING_HEAVY (400 walls, 600 openings) | 5.96 ms | 116.3 ms | **+1852%** |
| `bench` BALANCED | 120.7 ms | 184.7 ms | +53% |
| `bench` ROOM_HEAVY | 190.8 ms | 235.4 ms | +23% |

The `OPENING_HEAVY` figure is the honest worst case and the reason to state this plainly
rather than average it away: 400 disjoint wall segments with 600 openings is precisely
what the retired axis-aligned rectangle boolean was fastest at — a sweep over
axis-aligned rectangles — and precisely what an exact split-classify-chain algorithm
cannot match. `joinWalls` phase profile on that plan: split 61.5 ms, classify 29.1,
index 17, chain 16.7, keys 9.6. On a real plan (`library`) the same profile reads split
5.4, classify 3.2, index 1.6, chain 1.1, keys 0.9.

**Neither optimisation the Stage-A notes proposed applies here.** "Classify per hatch
group" does not: the ownership rule is cross-group by design (that is what makes the
fills tile), so the groups cannot be separated without breaking the decision the fills
depend on — and `OPENING_HEAVY` is one material anyway. "Stop rebuilding the indices per
call" does not: there is exactly one call per plan. Halving the split phase — the largest
single one — would recover about 11% of `toScene`, against a 182% regression. The gap is
algorithmic, not constant-factor.

**So this is a deliberate trade, not an oversight**: correctness at every junction, on
every shape of wall, without an optional native dependency, bought with roughly 3× the
lowering time on a pass that costs single-digit milliseconds for a real building. If that
becomes unacceptable, the option on the table is a fast path for purely-rectilinear
single-material plans — the joinery's outline for those is *vertex-identical* to the
rectangle boolean's (reversed and rotated, which no renderer can see), so one could be
substituted for the other. That would reintroduce exactly the two-path structure this ADR
removed, and it is a decision to take deliberately rather than a tuning knob.

## Deferred, by name

- **The window's cover.** `window.ts` still paints an opaque `theme.opening` cover at
  `h + wallStroke`, and always has — it never consulted `openingsVoided`. Bringing it to
  `fill: "none"` at half-extent, as the door and the cased opening now are, is a separate
  change with its own golden churn.
- **DXF `LWPOLYLINE` with bulge.** A curved outline is currently emitted as native `ARC`
  and `LINE` entities. One polyline with bulge factors would be a truer CAD object.
- **Join styles other than mitre.** `band.ts` mitres and falls back to a bevel at the
  limit. Round and square joins are not offered; `JoinKind` survives only on the retired
  backend seam.
- **Removing the `GeometryBackend` API.** A MAJOR, and not worth one on its own.
- **A near-corner lint.** No rule warns when a door's jamb leaves less wall between it and
  a corner than the wall is thick — the nib draws correctly and reads as a chamfer at page
  scale. The nearest existing rules are `W_DOOR_CLEARANCE` (swing space) and
  `W_POCKET_RUN` (a pocket panel's run), neither of which asks this question.

## Alternatives considered

**Make `clipper2-wasm` a hard dependency and route everything through it.** Rejected: it
breaks the zero-runtime-dependency invariant, it cannot represent a true arc (so every
curved face would be faceted), and it puts a wasm instantiation in front of the
synchronous `compile()`.

**Keep the three paths and fix each one's junctions.** Rejected: the defects are not
independent bugs, they are what happens when three code paths disagree at the seam
between them. The curved path could not be fixed at all without a boolean that understands
arcs — which is this.

**Tessellate curves into `region`.** Rejected: it discards exactly what v1.24 bought (SVG
`A`, native DXF `ARC`, never faceted at any zoom) to avoid adding one primitive.
