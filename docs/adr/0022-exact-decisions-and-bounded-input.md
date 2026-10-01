# 22. Exact decisions, measured determinism and bounded input

- **Status:** Accepted
- **Date:** 2026-10
- **Scope:** the number domain and resource bounds of `compile()`, the parser's handling of
  malformed input, the geometric predicates that decide a diagnostic, multi-storey
  reachability and circulation, `diffPlans`, and the eval's statistics. Three new catalogued
  errors (`E_NON_FINITE`, `E_ELEMENT_LIMIT`, `E_LAYOUT_UNPLACED`); no language syntax change.

## Context

[ADR 0020](0020-algebraic-core.md) made the plan's symmetry group and path algebra explicit and
law-tested. This round asked the same question of the mathematics outside algebra — linear
algebra, graphs and flows, computational geometry, topology, order theory, logic, formal
languages, optimisation, numerical analysis, combinatorics, information theory, statistics,
evacuation, daylight and bidirectional editing — and kept only what lands on a reproduced
defect, a duplicate implementation or a capability someone needs. The axonometric view was
not studied: it is deprecated ([ADR 0021](0021-plan-first-view-deprecated.md)).

An audit of the code, then a red-team review that reproduced each finding through the built
CLI before any change, found that the places the code already believed correct were the weak
ones:

- **`compile()` threw on user input**, against its contract: a 400-digit literal became
  `Infinity` and then `RangeError: Invalid array length`; a `NaN` index threw a `TypeError`; a
  thousand coincident rooms produced 499,500 overlap warnings; 4,000 nested parentheses and
  `max(…)` over 200,000 arguments overflowed the stack; a 10^12 mm wall with a door exhausted
  memory.
- **The parser dropped input silently**: nothing after the plan's closing `}` was read or
  reported, and recovery from a failed statement could close the plan at a nested `}`.
- **Decisions rested on approximations**: the arc-radius check used `Math.hypot`, which is not
  correctly rounded, and refused exact semicircles; the door-swing check sampled nine points
  per arc and missed a 90,000 mm² overlap; a circle room walled by arcs was measured against
  its 48-gon and read one facet open. The stated tessellation error was understated (R/1400 and
  0.14 % for R/467 and 0.29 %), and the bench measured label placement rather than the joinery
  it was cited for.
- **Fixpoints and orders leaked**: vertical reachability ignored which room a stair stands in;
  intent `reachable` read the lowest storey only; an upper floor had no circulation facts at
  all; a doorway's carve depended on the order its points and connectors were visited;
  relational layout placed a failed room's dependants at `(0,0)`; `diffPlans` paired
  positional auto ids, so one inserted room shifted every neighbour.
- **Nothing compared engines.** CI pinned digests on V8 across Node versions; SpiderMonkey and
  JavaScriptCore, which run the same core in the playground, had never been compared.
- **The eval's feasibility proof summed floors** that one room can satisfy together, and live
  rates carried no interval.

## Decision

### 1. Where the geometry is exact, decide exactly

A diagnostic that answers yes or no is decided by an exact predicate wherever the inputs allow
one, not by sampling and not by a tolerance chosen after the fact.

- **Arc radius**: endpoints and radius are quantised to the 0.001 mm lattice (the precision the
  formatter prints) and `4R²` is compared with `DX² + DY²` in `BigInt`
  (`arcRadiusCompare`, `src/geometry/arc.ts`). An exact tie is built as the exact semicircle.
  The `E_ARC_RADIUS` fix is solved for the endpoint as printed, so applying it always clears.
  Pinned by `test/arc-radius-exact.test.ts`.
- **Door swings**: `swingsCollide` (`src/geometry.ts`) decides with the separating-axis test over
  the two sectors' finite candidate set (`sectorsObstruct`): a separating gap is clear, contact
  is measured only between collinear faces, and nothing is sampled. On axis-aligned whole-mm
  geometry the test is exact; on an oblique wall it reads within `VERTEX_EPS`, the vertex
  tolerance that already existed. Pinned by `test/swing-exact.test.ts` (the counterexample, a
  superset law against the frozen old predicate, an independent clipping oracle).
- **Circle rooms**: enclosure is the angular coverage of concentric `arc` walls
  (`largestPerimeterGapCircle`, `src/analyze.ts`), so the answer does not depend on the
  tessellation step. It is not an integer predicate: two `atan2` calls per arc are made and
  documented, and the result is compared with a whole-millimetre threshold. Pinned by
  `test/circle-enclosure.test.ts`.

### 2. An exact tie is decided in `+ − × ÷ √`, integers or `BigInt`

ECMA-262 specifies the four operations and `Math.sqrt` exactly; `hypot`, `atan2`, `sin`, `cos`,
`log2` and `pow` are implementation-approximated. Where a verdict turns on an exact tie (an
arc radius equal to half its chord), this round decides it with exact arithmetic only, and the
arc check stopped using `Math.hypot` for it. The rule is that narrow, and the other two
decisions say how they depart from it: the swing test normalises its candidate axes with
`Math.hypot` (through `unit`) and reads a tie within `VERTEX_EPS`, exact on axis-aligned
whole-millimetre geometry; the circle-room measure makes two `atan2` calls per arc and compares
a length with a whole-millimetre threshold. The existing transcendental calls were NOT swept:
whether to replace them is decided by measurement (§3), and the measurement did not motivate
it.

### 3. Determinism across engines is measured, not assumed

`npm run digest:engines` (`scripts/engine-digests.ts`) runs the built core in Playwright
Chromium, Firefox and WebKit, rebuilds the byte-identity payload from the same functions
(`test/byte-identity-payload.ts`) and compares each engine's digests with Node's and with the
pinned baseline. The nightly `cross-engine` job runs it as an advisory signal that never fails
the night. Measured: 172 of 172 digests identical (86 plans × 2 payloads) in all three engines
and on Node, when the harness landed and again with every change of this round merged. It
compares output bytes after the compiler's rounding, so a transcendental difference that never
reaches an exact comparison is invisible by design; Playwright WebKit on Windows is not Safari.

### 4. The number domain and every resource bound are catalogued diagnostics

No input makes `compile()` throw, and each bound is reported by a catalogued code, never a
silent truncation:

- **`E_NON_FINITE`**: a literal, an arithmetic result or a derived quantity (an element's
  extent, a room's area, the total area) that leaves the finite doubles; a literal or result is
  replaced by 0 so the plan still resolves and reports. `fmt3`'s `"0"` for a non-finite number
  stays only as a backstop (`src/num-format.ts`), and a finite value too large to scale is
  printed as itself.
- **Nesting**: blocks and expressions deeper than 256 (`MAX_NEST_DEPTH`) are an `E_PARSE`.
  Evaluation and expansion share one stack budget (`MAX_STACK_UNITS`, `src/expr.ts`), decided
  by measurement: overflow capacity was bisected cold on Node, Node workers and
  Chromium/Firefox/WebKit workers, and the budget is the smallest capacity over 1.5, the same
  on every host. The rule is what is re-run when an engine changes.
- **Size**: at most 5,000 elements per storey (`MAX_ELEMENTS`, `E_ELEMENT_LIMIT`); at most 200
  listed overlap pairs (`MAX_OVERLAP_PAIRS_LISTED`) and one counting warning; a spatial-index
  cell index of 2^52 or more is overflow (`src/geometry/grid-index.ts`).

Pinned by `test/non-finite.test.ts`, `test/element-cap.test.ts`, `test/grid-index.test.ts` and
`test/huge-coordinates.test.ts`. A modelling range (proposed: 2²⁵ mm, the bound under which
ADR 0020 measured `orient2d` exact) and a global evaluation-step budget are left to the owner
(backlog M.1, M.2).

### 5. A parse consumes the whole file, and recovery is measured

Content after the plan's closing `}` is an `E_PARSE` (`E_IMPORT_PARSE` in a module), so
`format()` refuses the file rather than rewriting it without the tail. Recovery after a failed
statement reads the file's indentation, a local signal no brace far away can move, and its
quality is a metric with floors that may only rise: every statement of a frozen corpus is
fingerprinted and mutants (a dropped `}`, a deleted token) are scored on how many survive
(`test/recovery-metric.ts`, `test/parser-recovery-metric.test.ts`, `test/recovery-corpus/`).
The metric was written before the recovery change and shows the loss it fixes.

### 6. Fixpoints and carves do not depend on order

- **Vertical reachability** is a Kleene fixpoint over `(storey, room)`: a shaft relays only from
  a room walkable on its own storey. The room search is injected (`StoreyRoomReach`,
  `src/vertical.ts`) and must be monotone in its seeds, which any graph search is; that is what
  makes the fixpoint well defined and order-independent. `verticalReach` takes it as an
  optional third argument, so the public call is unchanged without it.
- **Arrivals**: a run arrives on a storey when a neighbouring stop is reachable in the same
  building graph with that storey taken out (`arrivalRuns`), a property of connectivity, not of
  declaration order ([ADR 0008](0008-circulation-as-facts.md)'s addendum).
- **Doorway carve**: every connector's seeds are read from the nav grid as it stood before any
  connector carved, so point order (which a turn reverses) and connector order commute with
  the carve (`buildGrid`, `src/analyze/circulation.ts`; laws in
  `test/equivariance-corpus.test.ts`).
- **Relational layout** propagates a failed set: a dependant of a failure or a cycle is
  `E_LAYOUT_UNPLACED`, and only rooms on a cycle are `E_LAYOUT_CYCLE` (`src/layout.ts`,
  `test/relational.test.ts`).
- **`diffPlans`** pairs rooms whose ids are auto on both sides by a label unique on both sides,
  before the id. The rule reads both sides identically, so the diff stays antisymmetric
  (`test/diff-laws.test.ts`).

### 7. Constants and statistics are derived, not asserted

The tessellation error (sagitta R/467, area 0.29 %) is derived from `ARC_STEP_DEG` by a law
test that pins every place it is quoted (`test/arc-tessellation-error.test.ts`). The eval's
`proveInfeasible` takes the binding floor per concept and never sums floors one room can meet
together (`eval/fidelity.ts`); live rates carry a Wilson 95 % interval (`eval/stats.ts`), the
interval recommended for small binomial samples. A performance change is accepted only with an
equivalence oracle holding the old implementation verbatim (`test/reroll-findrun-oracle.test.ts`,
`test/interner-oracle.test.ts`) and a byte-identical corpus.

## Consequences

- **Good.** `compile()`'s "never throws" contract is now tested against the inputs that broke
  it. The arc check decides its tie exactly, the swing check no longer samples, the circle
  measure no longer depends on the tessellation, and each transcendental call left in them is
  documented where it is made. Cross-engine agreement is a number from a script, watched
  nightly.
- **Cost: behaviour changes**, each in `CHANGELOG.md`: a plan past 5,000 elements per storey,
  a recursion past the stack budget (`n + sum(n - 1)` is accepted to about 110 calls, where the
  512-call cap alone accepted more but could overflow) or nesting past 256 now fails with a
  diagnostic; a file with trailing content no longer compiles; three examples' upper storeys
  gain circulation facts and `hillside-villa` six `W_PATH_TOO_NARROW`; `hexagon-pavilion`'s two
  oblique-portal galleries walk 8800 instead of 9800; intent `reachable` fails a storey with no
  way in.
- **Cost.** One more bound per resource to keep calibrated. The stack budget's table is in
  `src/expr.ts` and goes stale with engines; the rule is what to re-run.
- **Open** (`docs/backlog.md`, section M): the modelling range and absurd magnitudes, a global
  step budget, the carve's inward walk through eroded cells and the far-seed stamp, the limits
  of shaft-walked storeys, the oracle's exclusion of `level` plans, and the observations the
  audit re-verified (formatter precision, half-up grid snap, collation-dependent catalogue
  order, rename and assignment targets, the detour ratio's metric, an occupancy page-order tie,
  `suggestTopology` on upper storeys, an unbounded acute roof mitre).

## Rejected (recorded, not built)

- **Exact projective predicates** (backlog 6.5) stay rejected, consistently with this ADR: the
  decisions made exact here needed integers, `BigInt` and squared lengths, which rely only on
  IEEE-exact `+ − × ÷ √`. Plain-double `orient2d` is exact on integer coordinates below 2²⁵ mm
  (ADR 0020). Adaptive predicates would matter for non-integer inputs, and the one decision
  here that meets them (the swing test on an oblique wall) reads its tie within the existing
  `VERTEX_EPS` instead, with no observed defect to motivate more.
- **A whitelist guard on transcendental calls.** About 45 legitimate `sin`/`cos` sites; a guard
  would only freeze exemptions, and no failure was observed.
- **Rewriting `applyFixes`.** Nobody applies 2,000 fixes at once; 200 take about 22 ms, and the
  current form is the simplest that satisfies ADR 0020's commutation law.
- **Merging the three one-dimensional interval sweeps.** They answer three different questions.
- **Deduplicating `D4_MATS`** in `src/analyze/circulation.ts`: its element order feeds the
  label-point orbit's order, so a reorder could move a concave room's circulation.
- **The roof's mitre through `meetLines`.** Tried and reverted: about 11 % of decimal
  rectilinear rings moved by 0.01 in the SVG.
- **A corrected standard deviation in `eval/l2*.ts`.** That code is reference only and its live
  experiment is permanently declined; a source-normalising hash for the dataset had no reason.
- **A modular-coordination lint.** `grid` already snaps by construction; without one the lint
  would have to guess the module, choosing for the author ([ADR 0005](0005-no-invisible-architect.md)).
- **Linear programming, total unimodularity or Bellman–Ford in `arch repair`.** Its constraints
  are not all difference constraints (against-wall, swing sectors, the circulation guard), a
  second policy would result, and repair feeds the dataset's trajectories, which would move.
- **Compensated summation.** Areas are printed rounded; an ulp never changes a digit, and the
  shoelace sum is exact on integer millimetres within the plan sizes the language covers.
- **Spectral graph measures** (Laplacian spectrum, Fiedler vector, effective resistance): no
  floor-plan precedent was found in the search, the access graph has at most 17 nodes, exact
  integer connectivity facts say more, and an eigen-solver brings iteration and floats.
- **Visibility graphs and isovists.** O(N²) over about 20,000 cells is wrong for a synchronous
  compile, the reference implementation is GPL, and nobody asked.
- **Rectangular duals for layout generation.** They need a triangulated planar graph without
  separating triangles, which real access graphs are not, and they design for the author
  (ADR 0005).
- **A Datalog lint engine.** No maintainability evidence; it would be one more way to write a
  rule.
- **Incremental parsing, tree edit distance, Myers diff.** Parsing is 15–50 % of a compile,
  `.arch` is a shallow list keyed by ids so diffing is a matching problem, and changing the diff
  algorithm risks moving dataset rows.
- **Interval abstract interpretation of parameters.** It loses the correlation between variables
  (it cannot prove `x₂ − x₁ ≥ width`), so false alarms dominate; small-scope enumeration is
  more honest (deferred, below).
- **Evacuation-time models, sun paths, global label optimisation.** Respectively a step toward
  compliance claims, inexact trigonometry plus site data the language deliberately lacks, and an
  NP-hard problem with no failure evidence.
- **Topology through the joinery** (Betti numbers, Euler characteristic): the iron law forbids
  building the wall joinery to answer a `describe()` question. A winding-number point test is
  already equivalent to what is there.
- **`describe().freedom` as a rank**, a fixed-point or rational-number rewrite, and enumerating
  rectangular partitions for the dataset: no defect or consumer motivates them.
- **Bentley–Ottmann intersection, snap rounding in the interner, a DCEL that derives rooms from
  walls:** not taken this round. Backlog 4.1 lists a sweep line as a legitimate direction, but
  whether it beats the grid-bucketed pair scan at the corpus's size (about 1,000 segments at
  most) was not measured here, so it stays out until it is; any joinery change is held to "not
  one byte moves".

## Deferred (each needs a consumer or a measurement)

- **Egress facts** (opt-in `describe --facts egress`): room dominators, a door-disjoint second
  route, integer max-flow door capacity (which would also settle backlog 6.11's double door),
  exit separation. Fits ADR 0005 as facts, but has no consumer and is nearly constant on houses.
- **A daylight-ratio fact** from the height datum (glazing over floor area); no consumer, and
  the default for an unauthored height is undecided.
- **Roof ridges from the straight skeleton.** For an integer rectilinear outline the skeleton
  is exact on ½ℤ (event times are half-integers, no square root), but a roof plan is a second
  drawing and a new language form.
- **Dimension completeness** (backlog P2-8): which lengths no `dim` fixes, a set difference
  rather than a constraint solver's floating-point rank.
- **Replacing `hypot`/`atan2`/`log2`** at decision sites: not motivated by §3's measurement.
- **A deterministic `ownerOf(coordinate)`** for playground drag-to-edit (unique, shared,
  ambiguous or derived; only a unique owner auto-applied, proven with `diffPlans`).
- **Small-scope parameter enumeration**: compile a component over a small parameter grid and
  report the exact failing values, worded for that range only.
- **Smaller candidates without failure evidence yet**: interval-graph layering for
  `W_DIM_OVERLAP`, regular path queries over the access graph, bare-call component extraction,
  grammar-constrained decoding beyond the GBNF, a certified label point, a dataset entropy
  report, an arc edge under `roof overhang` (backlog 5.1).

## Prior art, cited by name

Only sources the research read in the original (paper or source code) are cited; a claim
known only second-hand is not.

- **ECMA-262** (the Number type and `Math` object): the four operations and `Math.sqrt` are
  correctly rounded; the other `Math` functions are implementation-approximated. The engines'
  own implementations were read: V8's `ieee754.cc`, SpiderMonkey's `Math.cpp`, JavaScriptCore's
  `MathCommon.h`.
- **Shewchuk**, adaptive-precision geometric predicates, and the `robust-predicates` package
  (Unlicense): considered for §1 and not needed on integer inputs (6.5 above).
- **Miller**, "Adding Error Bars to Evals" (arXiv 2411.00640), and **Brown, Cai & DasGupta
  (2001)** on interval estimation for a binomial proportion: the case for intervals on small
  eval samples and for Wilson over Wald.
- **Diekmann & Tratt (2020)**, CPCT+ error recovery, with tree-sitter and Lezer: read for §5;
  only the idea of a bounded repair verified by re-parsing carries over, as a direction for
  `arch fix`.
- **Cooper, Harvey & Kennedy**, "A Simple, Fast Dominance Algorithm", and networkx's
  `dominance.py`, node-splitting connectivity and Edmonds–Karp (BSD-3); Hopcroft–Tarjan
  articulation points: the deferred egress facts.
- **Aichholzer et al. (1995)**, **Barequet, Eppstein, Goodrich & Vaxman (2008)** and **Emiris &
  Katsamaki (2019)** on straight skeletons and L∞ Voronoi diagrams of orthogonal polygons: the
  ½ℤ exactness of deferred roof ridges. CGAL's implementation is GPL-3 and was used for ideas
  only.
- **Clipper2**'s offsetting (BSL-1.0): the reference miter policy for an acute roof corner.
- **Mapbox polylabel** (ISC): a label point with a certified error bound, unscheduled.
- **depthmapX** and **Turner et al. (2001)** (GPL-3): visibility graph analysis, rejected above.
- **Kleinberg & Tardos**, interval partitioning (earliest-start greedy uses exactly depth
  colours): the deferred `W_DIM_OVERLAP` layering.
- **ISO 129-1:2018 §4.1.1** (each dimension shown once): the deferred completeness fact;
  SolveSpace (GPL-3) and FreeCAD's PlaneGCS (LGPL-2.1) decide redundancy by floating-point rank,
  which is the approach not taken.
- **Szalinski** (PLDI 2020), Stitch and babble (MIT): program compression; `reroll()` already
  proposes and proves, and only bare-call extraction could stay byte-identical.
- **Sketch-n-Sketch** (PLDI 2016) and **Foster et al. (2007)** on lenses: the deferred `ownerOf`,
  deterministic where Sketch-n-Sketch chooses heuristically.

This ADR claims no novelty: every technique above is textbook or published, and where the
research found no precedent for applying one to floor plans it says only that none was found
in the search.
