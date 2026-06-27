# 5. Design intelligence is facts + advisory lint, not an invisible architect

- **Status:** Accepted
- **Date:** 2026-06 (v1.3 planning)

## Context

ArchLang renders authored floor plans, but the plans it renders are only as good as
the coordinates an author (increasingly an AI agent) writes. There is pressure to make
the tool "professional" — to understand circulation (动线), zoning, clearances, and
drafting standards — and a tempting way to do that is to let the compiler *arrange*
things: snap furniture to walls, route a sensible layout, auto-place fixtures, claim
code compliance.

That temptation is the same one [ADR 0004](0004-relational-placement-not-optimizer.md)
already resisted for room layout. An adversarial design review (Claude Code × Codex)
concluded the temptation is broader than layout and needs an explicit, project-wide
boundary, because each "smart" feature quietly erodes two invariants:

- **Determinism.** The moment the compiler *chooses* among valid alternatives (which
  wall, which side, how to resolve a clearance conflict), output depends on a policy /
  search / tie-break — exactly what `compile()` must not do. A *deterministic* bad
  heuristic is still an arranger.
- **Honesty.** Inferring room purpose from label regexes, equating a door's nominal
  width with its clear opening, or stamping a plan "ADA/ISO-compliant" manufactures
  confidence the model does not have, and (for codes) invites liability.

## Decision

Adopt a layered boundary. **The core computes facts and emits advisory warnings; it
never designs. Arranging — choosing among alternatives — is the job of the agent/SKILL
layer on top of the CLI.**

| Layer | Responsibility | May it *choose* among valid alternatives? |
|-------|----------------|-------------------------------------------|
| `compile()` | Faithful, deterministic render of authored intent | No |
| `analyze` | Geometric + semantic **facts**, with ambiguity/confidence surfaced | No |
| `describe` | Append-only agent-facing facts (room uses, modeled access graph) | No |
| `lint` | **Advisory** warnings only; profile-scoped and traceable | No |
| SKILL / agent | Proposes coordinates, reads `lint --json`, repairs, iterates | **Yes** |

Concretely, the core may:

- compute facts (areas, adjacency, a modeled door/opening **access graph**,
  reachability, estimated clear widths, work-triangle measurements);
- warn when a plan looks unsound (advisory `W_*`, traceable to a documented rule);
- perform **closed-form placement only when every target is explicit and
  unambiguous** — and **fail with a diagnostic** (never choose / search / relax) when
  it is not.

The core may **not**: pick among valid wall/side/furniture placements; run a layout or
constraint optimizer; auto-furnish; or assert standards *compliance* (only honestly
named, caveated *advisory* checks — `accessibility-advisory`, not `ada`).

## Consequences

**Pros.** The determinism and zero-surprise guarantees of `compile()` extend cleanly to
all future "intelligence." Facts and warnings are explainable and testable. Agents get a
rich `describe`/`lint` channel to drive their own arranging loop, which is where
open-ended choice belongs. No liability claim of code compliance.

**Cons.** ArchLang will *describe* a bad plan precisely but won't *fix* it — the fixing
lives a layer up. Some genuinely useful conveniences (snap this bed to that wall) are
only offered in their unambiguous, fail-fast form, which feels stricter than a
forgiving design tool. We accept that: ArchLang is a compiler, not a design engine.

This ADR governs the v1.3+ professionalism roadmap (room `uses` tags, the access graph,
clear-width facts, furniture clearance lint, anchored closed-form placement, advisory
profiles). A real layout/optimization engine, if ever wanted, belongs behind a separate
opt-in seam — never inside `compile()`.
