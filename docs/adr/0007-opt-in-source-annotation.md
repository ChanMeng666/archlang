# 7. Editor metadata (`data-span`) enters SVG output only opt-in

- **Status:** Accepted
- **Date:** 2026-07 (v1.9 planning)

## Context

The playground gained interactive affordances that want to map a **drawn primitive back to
the source** that produced it — e.g. click a room in the preview to jump the editor caret
to its `room …` statement. The scene already knows this: resolved elements carry a source
`span` (byte range), and `SceneNode` has an optional `span` field.

The obvious implementation is to emit that span onto each SVG element as a `data-span`
attribute so the browser can hit-test with `event.target.closest('[data-span]')` — exact,
no coordinate math, robust to pan/zoom. But the SVG backend produces a **shipped artifact**
used by everyone (downloaded files, docs, the DXF/PDF sister backends read the same Scene).
Two invariants are in tension:

- **Determinism / golden-stability.** The SVG output is byte-for-byte snapshot- and
  golden-tested. Any always-on attribute change rewrites every golden and grows every
  exported file for one consumer's benefit.
- **Faithful, clean output.** Per [ADR 0005](0005-no-invisible-architect.md) / [0006](0006-solver-as-explicit-transform.md),
  the renderer draws exactly what was authored and nothing more. Editor tooling metadata is
  not part of the drawing.

## Decision

**Source-location metadata is emitted only under an explicit opt-in, and is purely additive.**

- A new `compile(src, { annotate: true })` option (and only that option) makes the SVG
  backend stamp `data-span="start:end"` on each drawn primitive **that carries a source
  span**. The option is folded into the compile cache key.
- **Default output is byte-identical** to before. With `annotate` off, the Scene IR and the
  SVG string are unchanged — the existing goldens/snapshots are untouched, and downloaded
  SVG/PDF/DXF stay clean. A test asserts the annotated SVG, with its `data-span` attributes
  stripped, equals the default SVG (annotation adds nothing else).
- **The span rides on the Scene node, not the geometry.** `toScene` copies the resolved
  element's span onto its rendered nodes (only when annotating); geometry, `describe()`, and
  `lint()` never read it. Walls are unioned across statements, so their per-node span is
  ambiguous and is intentionally left unset.
- **Consumers own the clean/annotated split.** The playground renders the *preview* with
  `annotate: true` for interactivity, but re-compiles **without** it for any
  export/copy — the artifact a user saves never contains editor metadata.

## Consequences

- Click-to-source (and any future "which source made this pixel" tooling) is exact and
  needs no core coordinate coupling.
- No golden churn, no output bloat for existing users; the annotated SVG has its own golden.
- The cost is one additive `CompileOptions` field and a small, well-tested branch in the
  backend — consistent with the append-only `CompileResult`/options surface.
- This ADR narrows the rule to: *the renderer may carry source-location metadata, but only
  when explicitly asked, and never in the default artifact.* It does **not** reopen ADR
  0005/0006 — annotation reports where source went, it never changes what is drawn.
