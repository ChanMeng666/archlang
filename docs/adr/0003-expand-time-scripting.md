# 3. Expand-time scripting — no runtime, no I/O, no clock

- **Status:** Accepted
- **Date:** 2026-06 (v1.0)

## Context

ArchLang grew a real scripting layer (v0.8): values, arithmetic, arrays, string
interpolation, `for`/`if`/`while`, and pure functions. A scripting language could
be implemented with a runtime interpreter that executes as the drawing is
displayed, with access to time, randomness, or external data. That flexibility is
fundamentally at odds with the project's first invariant: **the same source must
always compile to byte-identical output.**

## Decision

The scripting language is **expand-time and pure**. Every `let`/`set`, every
`for`/`if`/`while`, and every function call is fully evaluated during `resolve`,
expanding into a flat, deterministic element stream *before* any geometry is
computed. There is no runtime, no I/O, and no wall-clock access in the language.
The few environment-dependent needs (reading imported files, "now" for a title
block) go through the injectable `World` seam, which is the only place
non-determinism can enter — and tests inject a fixed clock.

Determinism guards back this up: `for` iteration order is fixed, built-ins are a
frozen pure map, ranges have a size cap, `while` has an iteration cap, and
coordinates are integer-mm and grid-snapped before reaching any geometry engine.

## Consequences

**Pros.** `compile(s) === compile(s)` holds by construction — the property test
that asserts it can never legitimately break. Output is reproducible across
machines and runs, which is what makes snapshot and visual-regression testing
meaningful. The model is simple to reason about: a plan is a pure function of its
source (and an explicit `World`).

**Cons.** No data-driven plans from live sources, no animation, no
runtime-interactive parameters — those are deliberately out of scope. Bounded
loops/ranges can reject a legitimately large generated plan, requiring the caps to
be sized conservatively. Relational placement follows the same rule: it is a
deterministic topological arithmetic pass, not a solver (see ADR 0004).
