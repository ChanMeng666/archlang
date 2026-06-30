# 6. A solver is an explicit source transform, never invisible render behavior

- **Status:** Accepted
- **Date:** 2026-06 (v1.4 planning)

## Context

[ADR 0005](0005-no-invisible-architect.md) drew the line that `compile()` renders facts
and `lint` advises, but neither *arranges*. A second adversarial review (Claude Code ×
Codex), prompted by AI-generated plans that rendered with furniture penetrating walls,
fixtures piled in doorways, and rooms with no door, re-opened the obvious question:

> Building games (The Sims, Project Highrise) never let a player drag a sofa through a
> wall. Why can't ArchLang borrow those algorithms so AI-authored plans are automatically
> physically correct and circulation-sound?

The review found the failing plans were mostly an **integration failure**, not a missing
solver: ArchLang's lint *already* flagged the unreachable rooms, floating fixtures, and
obstructed door swings — the upstream generator ignored every warning and shipped anyway.
But it also exposed a real risk: the natural "fix" is to let the compiler nudge the sofa
out of the wall. That is the ADR 0005 temptation again, now wearing a physics costume.

The key clarification: **the boundary is not "deterministic vs non-deterministic."** A
deterministic routine that moves a sofa, picks a wall, or reroutes circulation is *still
designing* — it can be pure and byte-stable and still break the promise that source
coordinates mean exactly what they say. The real line is **faithful rendering vs choosing
intent.**

## Decision

Amend ADR 0005 with one clause:

> **A constraint-solver / arranger may exist in ArchLang only as an explicit, opt-in
> command whose output is new `.arch` source plus a change log. It may never run inside
> `compile()`, and it may never alter render output for a given source.**

Concretely:

- **`compile()` stays faithful.** When furniture overlaps a wall or a fixture blocks a
  door, the renderer draws exactly what was authored. It does **not** clip, snap, or
  relax — doing so would silently hide an authoring error. Catching the problem is
  `lint`'s job (`W_FURNITURE_WALL_COLLISION`, `W_DOORWAY_BLOCKED`, `W_ROOM_NO_CLEAR_PATH`).
- **Closed-form, unambiguous placement remains core-legal** (as ADR 0005 already allows):
  `against wall <id>`, relational room placement — every target explicit, fail-fast on
  ambiguity, no search.
- **Any *corrective* arranging is a source-to-source transform.** A future `arch repair`
  reads a `.arch`, emits a *new, inspectable* `.arch` plus a per-move change log
  explaining what it did and why, and refuses (with a diagnostic) anything it cannot
  resolve unambiguously. The author reviews the diff; nothing happens invisibly.

| Where it belongs | Example |
|------------------|---------|
| `compile()` | render the authored plan, faithfully; **never** auto-correct |
| `lint` (advisory facts) | AABB furniture-vs-wall collision; door-landing clearance; grid flood-fill circulation reachability |
| explicit transform (`arch repair`, agent loop) | move a fixture to its nearest legal wall; nudge furniture out of a wall; emit new source |

This also settles which "game algorithms" map where. **AABB collision** and **grid
flood-fill / navmesh reachability** are legitimate *fact* computations and live in
`analyze`/`lint`. **Force-directed relaxation, simulated annealing, and rectangle
packing** are policy-heavy arrangers; they are out of scope for `compile()` and belong
only behind the explicit-transform seam, if ever.

## Consequences

**Pros.** `compile()` keeps its zero-surprise, byte-stable guarantee even as physical-
correctness intelligence grows. Every correction is reviewable source, never hidden
behavior. The new lint rules give an AI author a strong enough signal to converge on a
sound plan on its own (especially under `arch validate --strict`).

**Cons.** A physically broken plan still renders broken (with loud warnings) until
someone — the agent, `arch repair`, or a human — fixes the source. ArchLang remains a
compiler with a separate, opt-in corrector, not a forgiving drag-and-drop design tool.
We accept that: it is the same trade ADR 0004 and 0005 already made, extended to physics
and circulation.

This ADR governs the v1.4+ roadmap (furniture-vs-wall and doorway-clearance lint, the
circulation flood-fill, `arch validate --strict`, and the `arch repair` transform).
