# 4. Relational placement is deterministic arithmetic, not an optimizer

- **Status:** Accepted
- **Date:** 2026-06 (v1.0)

## Context

v1.0 adds relational placement sugar: a room can be positioned relative to another
(`right-of` / `left-of` / `below` / `above`, with optional `align` and `gap`)
instead of with absolute `at (x,y)` coordinates. Layout tools in this space
(Penrose, Graphviz, D2) often resolve such constraints with an **optimizer** or a
force-directed/constraint solver that searches for a satisfying arrangement. That
approach can express richer intent — but its output depends on solver state,
iteration counts, and tie-breaking, which is at odds with byte-identical
determinism.

## Decision

Relational placement is resolved by **pure arithmetic in dependency order**, not
by a solver. References between rooms form a DAG; a topological pass
(`src/layout.ts`) places each room as a closed-form function of its already-placed
reference's box (`right-of` ⇒ `ref.x + ref.w + gap`, etc.), then grid-snaps the
result exactly like an absolute coordinate. A reference cycle is a user error
(`E_LAYOUT_CYCLE`); an unknown reference is `E_LAYOUT_REF`. The absolute/"manual"
path is unchanged and remains the default — a plan with no relational clauses is
byte-identical to v0.11.

We borrow Penrose's *vocabulary* (`above`/`below`/`align`/`near`) and D2's
`LayoutGraph` *shape* as a future seam, but explicitly not their solving.

## Consequences

**Pros.** Fully deterministic and trivially explainable: each room's position is a
visible arithmetic function of its neighbour. No solver, no dependency, no
non-determinism. Backward compatible — the manual path is provably untouched
(existing golden snapshots are unchanged). Cheap: one topological sweep.

**Cons.** It cannot satisfy *mutual* or *global* constraints (e.g. "these three
rooms should pack to minimise total width") — those need a solver, which is out of
scope. Over-constrained or cyclic intent is rejected rather than approximated.
This is a layout *seam*, not a layout *engine*; a real engine could be added later
behind the same `LayoutGraph` shape without disturbing the deterministic default.
