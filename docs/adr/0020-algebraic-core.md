# 20. An explicit, law-tested algebra layer under `place`, paths and printing

- **Status:** Accepted
- **Date:** 2026-09
- **Scope:** internal architecture (`src/algebra/`, element `transform`, the statement
  printer, the path engine, the equivariance oracle). No language syntax change.

## Context

`place … rotate r mirror m` ([ADR 0016](0016-component-instances-and-frames.md)) put one
group action — the eight rectilinear symmetries D4, composed with translation — behind
every derived fact a placed instance can carry: a fixture's quarter-turn, a stair's tail
edge, a dimension's text side, a door's hinge, a wall-face probe. Nothing enforced that the
sites computing those facts actually agreed with each other, or with the group law itself.
Research into the branch's own history found five independent places where the group (or an
adjacent piece of shared structure — a graph traversal, a statement's printed form, a
wall-face query, a plan diff) had been re-derived by hand at each call site, and where the
copies had drifted:

| concern | before | re-encodings found | what drifted |
|---|---|---|---|
| D4 action (turn/mirror on a vector, a side, a compass letter, a quarter-turn) | a switch or lookup table at each call site | ~15, across `frame.ts`, `site.ts`, the fixture glyphs and each vertical-run element | a plugin element with no case in the switch made `compile()` **throw** a `TypeError` instead of returning a `Diagnostic` |
| graph/grid traversal (reachability, hop count, bottleneck width) | one hand-written search per consumer (`describe`, `lint`, `suggest`, Plan JSON, the nav grid) | 2 grid searches plus the access-graph walk, each with its own 4-neighbourhood and its own tie-break | no shared oracle, so a consumer could silently disagree with the nav grid it was supposed to describe |
| statement printing | `format.ts`'s pretty-printer, an element's own `resolve()` (a lint fix's replacement text), and Plan JSON's decompiler | 3 independent printers for the same statement grammar | a fix that rebuilt a door/window/opening statement dropped an authored `sill`/`head`, because the fix's printer didn't know that clause existed |
| wall-face queries ("which side of this wall has floor") | copied per caller | 3, in `site.ts`, `analyze.ts` and the facade dimension chain | a door's `swing into` an arc-hosted room disagreed with the leaf it actually drew |
| plan diff | one `diffPlans` pass with an id-then-position match | — | rescued a moved room by label even when the label was **not** unique, silently pairing the wrong rooms |

The equivariance oracle built to check the first row (`test/d4-oracle.ts`; every example and
random plan placed under each of the eight group elements, every fact checked to transform
by the group's action) is what turned "probably fine" into a enumerated, falsifiable list:
16 violation classes, most closed over the course of this work and recorded in
`test/equivariance-known.ts` and `docs/backlog.md` ("Equivariance
findings"). None of the five rows above was a hypothetical risk; each had a shipped,
reproduced defect, cited against the commit that closed it.

## Decision

### 1. A domain-free algebra leaf, `src/algebra/`

`d4.ts`, `semiring.ts` and `paths.ts` state the group and the path abstraction exactly
once, with no dependency on the rest of the compiler — `test/algebra-leaf.test.ts` pins that
every import inside the folder stays inside the folder (value imports only). `d4.ts` is one
normal form, `R^k · Fx^f` (reflect first, then turn), and one set of actions on vectors,
wall sides, compass letters and quarter-turns, plus `det` as the handedness homomorphism
that tells a caller whether a frame reflects. `semiring.ts` states four selective, isotone,
monotone semirings — `BOOLEAN`, `MIN_PLUS`, `MAX_MIN`, lexicographic — as the algebraic
structure reachability, hop distance and clear-width bottleneck all share; `paths.ts`'s
`bestPaths` is the one label-setting search (generalised Dijkstra) that is correct for any
semiring meeting those three laws, replacing the hand-rolled grid searches and the access
graph walk. Being a leaf is the property that lets every downstream module — describe,
lint, suggest, Plan JSON, the nav grid — share it without a dependency cycle.

### 2. Elements own their frame action

`ElementDef.transform` (`frame.ts`'s `TransformCtx` facade) makes the D4 ⋉ Z² action part of
an element module's own contract, alongside `parse`/`resolve`/`render`. A plugin element
registered without a `transform` and used inside a `place` is refused with a `Diagnostic`
(`E_INSTANCE_NO_TRANSFORM`) — never the `TypeError` `compile()` used to throw. This is the
mechanism, not merely the fix: it is what makes "does this element carry correctly through a
turn or mirror" a property of the module that draws it, checkable in isolation, rather than
a fact some central switch has to keep in sync with every new element.

### 3. The equivariance oracle is a permanent gate

`test/d4-oracle.ts` places every shipped example and a fuzz corpus under each of the eight
group elements and asserts every fact — geometry, `describe()`, `lint()` — transforms by the
group's action. It stays in the suite after this work lands, not only during it. **Pin
discipline:** a violation is data, not prose — `test/equivariance-known.ts` carries one entry
per class, each with a predicate that decides which fact instances it covers; a new
violation the predicate doesn't already cover fails as `NEW`; closing a class deletes its pin
and the oracle itself becomes the witness (`FIXED` is a transitional state, kept only long
enough to prove the closing commit actually closes it — see `test/equivariance-corpus.test.ts`
"closed classes"). A convention that is not a group fact (a fixed drafting angle, a
tie-break rule stated once and never claimed to be equivariant) is `declared`, not `todo`:
E.5, E.15 in the backlog are declared, not defects.

### 4. Proof-gated rewrites share one pipeline

The `while`→`for` machine-applicable fix (`src/while-fix.ts`) only offers a rewrite after
compiling the candidate twin and comparing it against the original on every axis `compile()`
can check — identical SVG on every page, equal `describe()`, equal diagnostics minus the one
warning removed — with the loop body kept byte-for-byte. `compile()` itself does none of
that proof work; the fix lives one layer up specifically so `compile()` stays a pure function
of its source text (see `src/while-fix.ts`'s header for the two red-team rounds that moved
it there). The planned `reroll()` refactor (W6b, not yet landed — see
<!-- W6b --> below) is designed to share this same shape: propose a rewrite, prove it against
one pipeline, never bake proof state into `compile()`'s own result.

### 5. Laws pinned by test, not by convention

- **Printer round-trip.** `src/statement-print.ts` is the one place `format.ts`, an
  element's `resolve()`, and Plan JSON's decompiler converge, checked by
  `test/fix-printer.test.ts` and `test/fix-apply.test.ts`.
- **Diff antisymmetry.** `diffPlans` rescues a moved room by label only when the label is
  unique on *both* sides (`test/diff.test.ts`, `test/diff-laws.test.ts`,
  `test/unified-diff.test.ts`) — a **behaviour change** for a plan with duplicate labels,
  see `CHANGELOG.md`.
- **Fix commutation.** Applying a diagnostic's fix and re-parsing commutes with the printer
  round-trip (`test/fix-apply.test.ts`).
- **Composition associativity.** `flatten(place(place(C)))` resolves to the same statements
  as the equivalent flat plan (`test/compose-assoc.test.ts`) — ADR 0016 §3's addendum.
- **Semiring laws.** Selectivity, isotonicity, monotonicity for all four named semirings,
  and the shared search reproducing every existing consumer's numbers
  (`test/semiring.test.ts`; a 16,885-comparison differential harness against the grid
  searches it replaced).
- **The conjugation law for symmetry.** `Stab(gP) = g · Stab(P) · g⁻¹`, pinned over the
  shipped corpus (`src/analyze/symmetry.ts`, exercised by `test/equivariance-*.test.ts`).

## Consequences

- **Good.** A new element only has to state its own frame action once; the oracle finds a
  missing or wrong one for free, as data rather than as a bug report months later. A fix
  that rebuilds a statement can no longer drop a clause the printer didn't know about,
  because there is exactly one printer. `place` composing associatively
  (ADR 0016 §3 addendum) turned "does this component still work once it's placed inside
  another component" from a question nobody could answer without trying it into a law a
  test states.
- **Cost.** Five behaviour changes ship with this work and are called out explicitly in
  `CHANGELOG.md`: `diffPlans` with duplicate labels, `validate --strict` now exiting 2 for
  `while`/reassignment, W8's composition search order (a component that places a child can
  resolve differently, or newly raise `E_FURN_AGAINST`), `terrace-row.arch`'s redraw (its
  mirrored units' rear doors were on the wrong track), and negative `dim` offsets moving
  which side the number is drawn on. None is silent; each has its own test and its own
  CHANGELOG entry.
- **Cost.** The algebra leaf is one more layer to learn before touching a `place`-adjacent
  bug: a contributor now needs `src/algebra/d4.ts`'s normal form, not just the call site
  they're fixing. `docs/agents/architecture.md` and `docs/agents/gotchas.md` carry the two
  sentences that make that fast.
- **Open.** W6b (`arch reroll` + the LSP refactor + a `reroll()` API, behind `src/pipeline.ts`)
  and W3b (an access `probe` policy, nearest-entrance circulation, circulation
  translation/rotation fixes) are designed against this same algebra and have not landed.
  <!-- W6b -->
  <!-- W3b -->
  The equivariance findings this work did **not** close (the nav grid's tie-breaks,
  E.6–E.10; float-translation re-rounding, E.11) stay open in `docs/backlog.md` and are
  unaffected by anything in this ADR.

## Rejected (recorded, not built)

- **E-graphs** for the rewrite/proof work (W7, the planned `reroll()`). An e-graph earns its
  cost on a search space with many equivalent forms to rank; `while`→`for` and the planned
  re-roll refactor are each a single proposed rewrite proven by compile-and-compare, not a
  search — the machinery would cost more than the one rewrite it verifies.
- **PGA / `ganja.js`** (projective geometric algebra) for the frame representation. D4 ⋉ Z²
  on a rectilinear grid is exactly a signed-permutation matrix plus a translation — no
  trigonometry, so no float is introduced and output stays byte-stable (ADR 0016 §2). A
  geometric-algebra representation is strictly more general than this problem needs and
  would reintroduce the float instability the signed-permutation form exists to avoid.
- **Operad / Catlab vocabulary** for describing composition. `place` composing
  associatively is a property worth a test (`test/compose-assoc.test.ts`), not a reason to
  adopt category-theoretic machinery or its terminology in the source — the group and
  semiring vocabulary already in `src/algebra/` says everything a reader needs.
- **Units-of-measure types.** Clashes with the standing bare-number-millimetres convention
  and the parked area syntax (`T6`, see `docs/agents/iron-laws.md`); a units type system is
  a much larger, orthogonal change this work does not need.
- **Rational rotations** (beyond the four quarter-turns D4 already has). No shipped language
  form asks for an angle that isn't a multiple of 90°; P3-7 (arbitrary rotation) is its own
  deferred item in `docs/backlog.md` with its own open questions about what the handed rules
  mean off-axis.
- **Pijul patch theory** for the plan diff. `diffPlans` answers "what changed between two
  resolved plans", a snapshot comparison; Pijul's patch algebra targets composable,
  commuting edits over time, a different problem than the one `diffPlans` or `arch fix`
  solve.
- **Rectangle-algebra path consistency on *intent*.** The `intent` channel's `roomsInclude`/
  adjacency checks already run as a bipartite matching (see `CHANGELOG.md`, "an intent
  concept no longer swallows the room a later concept needs"); routing them through a
  general interval/rectangle constraint solver was considered and rejected as an eval-judge
  risk — a constraint solver can find a *different* satisfying assignment than the judge's
  rubric expects, moving scores for reasons unrelated to plan quality.
- **Exact projective predicates** (orientation/intersection via projective coordinates).
  Measured bounds: `orient2d` stays exact to `2²⁵` mm with the plain double arithmetic
  already in use; homogeneous line intersection is exact only to roughly 10³ m. Both bounds
  comfortably cover every plan size the language can express; adopting exact projective
  predicates would trade simple arithmetic for a bound no shipped plan needs.
- **An FCA (formal concept analysis) catalogue audit** for the fixture/vocabulary tables.
  Needs a synonyms-version bump (`JUDGE_VERSION`/`SYNONYMS_VERSION`, see
  `docs/agents/iron-laws.md`) to compare against, which this work does not have a reason to
  take on its own.

## Prior art, cited by name

- **Spatter** (PACMMOD 2024) — synthesis of spatial layouts from constraints; informed the
  reading of `place` composition as a constraint-satisfaction-adjacent problem without
  adopting its solver.
- **Mohri (2002)**, "Semiring Frameworks and Algorithms for Shortest-Distance Problems" —
  the selective/isotone/monotone conditions `paths.ts` states and checks.
- **Sobrinho (2002)**, "Algebra and Algorithms for QoS Path Computation and Hop-by-Hop
  Routing in the Internet" — a second, independent source for the same semiring conditions
  applied to routing, cross-checked against Mohri's.
- **Szalinski** (PLDI 2020) — synthesizing structured, human-readable CAD programs from
  geometry; informed the printer-convergence goal (one canonical text for one statement)
  without adopting its synthesis search.
- **Hillier & Hanson (1984)**, *The Social Logic of Space* — the permeability-graph reading
  behind `src/analyze/syntax.ts`'s depth/RA/RRA/integration facts.
- **Stiny / Krishnamurti**, shape grammars — background for treating `place` as a grammar of
  rigid transforms composing over a fixed vocabulary of forms, rather than a one-off
  feature.

## Honesty

This is, as far as searched, the first application of an explicit, law-tested D4 ⋉ Z²
algebra layer *in a tool of this kind* (a declarative floor-plan compiler). It is not a new
technique in the general sense — group actions, semirings and label-setting search are all
textbook — and this ADR does not claim otherwise.
