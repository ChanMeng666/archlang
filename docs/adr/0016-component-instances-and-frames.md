# ADR 0016 — Component instances are resolved in their own frame, then transformed

**Status:** Accepted (v1.22)
**Supersedes:** nothing. **Amends:** [ADR 0004](0004-relational-placement-not-optimizer.md) —
relational placement now runs once *per coordinate frame*, not once per plan.

## Context

Until v1.22 a `component` was a **text macro**. `wing()` spliced its body into the caller's
coordinate system and the caller's id space, with global per-kind auto-id counters. That is
right for a small parameterised motif (`bed(300, 300)`) and wrong for a piece of building:
drawing the same wing twice meant re-deriving every coordinate by hand, every id collided
or drifted with source order, and nothing in the output said the two halves were the same
thing. A 40-room building composed of six wards was 40 hand-edited numbers that fall out of
step the first time the brief changes.

The goal is the model the owner stated: **one `.arch` file authors one room or wing in local
coordinates, and instances compose like React components.** That needs three things a macro
cannot give: an addressable identity (`as west`), an explicit placement (`at (x,y)`), and a
rigid transform (`rotate` / `mirror`) so a symmetrical building is one component, not two.

## Decision

### 1. `place` is a new statement; the bare call is untouched

```
place <component>(<args>) as <name> at (x,y) [rotate 0|90|180|270] [mirror x|y]
```

`as` and `at` are **required**. An instance that cannot be addressed is not a component, and
one that lands wherever its literals point is the macro — which keeps its exact old
semantics under its old spelling. A plan containing no `place` resolves through the
identical single pass and is **byte-for-byte unchanged** (asserted: every pre-existing SVG
snapshot and visual golden is untouched by this change).

### 2. The transform is applied to the resolver's OUTPUT, not to its inputs

The obvious implementation is to compose the frame into `evalPt`/`snapPt` so every
coordinate arrives pre-transformed and the existing single pass runs unchanged. **We
rejected that.** Every derived-geometry rule in the resolver is stated in *world* terms:

| rule | what it names |
|------|---------------|
| `furniture … in <room> anchor top-left` | a corner **of the page** |
| `furniture … against wall <w> side left` | a **face**, by the wall's traversal handedness |
| `door … hinge left` / `swing in` | a side of the wall direction / its left normal |
| `room … right-of <r>` | the page's **+x** ([ADR 0004](0004-relational-placement-not-optimizer.md)) |
| `dim … offset <n>` | a signed distance along the measured segment's left normal |
| a room's `at` + `size` | the **top-left** corner — which a turn or a flip moves |

Feeding pre-rotated coordinates into those rules silently changes what they mean: `anchor
top-left` in a 180°-turned instance would put the piece in the physically *opposite* corner
of the room, and the room rectangle itself would be displaced by its own extent. Making them
correct would mean teaching *every element resolver* what a frame is — a cross-cutting
change to a dozen modules, each with its own way to get it subtly wrong.

Instead: **an instance resolves entirely in its own frame — against its own walls and rooms,
with its own relational-placement pass — and one rigid transform then carries the result
into the plan.** Every rule above keeps meaning exactly what it means when the component is
drawn on its own, by construction rather than by care. This is exact, not approximate: a
quarter-turn composed with an axis reflection is an isometry of the rectilinear world, so
resolving-then-transforming and transforming-then-resolving agree wherever the rule is
equivariant — and the handed rules that are *not* (`swing`, a signed `dim` offset, a
fixture's quarter-turn) are flipped explicitly, in one place, in `src/frame.ts`.

A frame is a **2×2 signed-permutation matrix plus a translation**: entries in `{-1,0,1}`,
`|det| = 1`. No trigonometry, so no float is introduced and output stays byte-stable; and
frames **compose by matrix multiply**, so a `place` inside a component body is free.

### 3. An instance is a closed world going OUT, not going IN

The plan resolves last and sees every instance's walls and rooms under their namespaced ids,
so the parent can reach in: `door … wall west.shell`, `furniture … in west.main`,
`describe --room west.main`. The reverse does **not** hold — a component cannot reference
anything outside itself.

This is deliberate, and it is the same encapsulation a UI component has: a child that reads
its parent's DOM is not reusable. A component that must touch its surroundings takes the
reference as a parameter, or the parent draws the connecting element — which is what
`examples/museum-wings.arch` does with its two hall doors. The alternative (expressing the
plan's walls in each instance's local frame by inverse transform) is implementable but buys
a coupling we do not want to promise.

### 4. Ids are namespaced; zone membership comes free

Every id born inside an instance becomes `<instance>.<id>`, and auto-id counters restart per
instance, so two instances of one component are **order-independent**. Dotted names are legal
in reference positions and rejected in declaration positions (`E_DOTTED_DECL`) — the
namespace belongs to the `place`, so a dotted name can only ever be a reference.

A `place`d instance is also **implicitly a [zone](../language-reference.md#zones--wings-and-departments-v122)**,
pushed through the identical `ZoneFrame` mechanism a hand-written `zone` block uses.
Composing by wing therefore *gives* you the grouping — `describe().zones`, `describe --zone`,
the grouped room schedule — with no second declaration. (Zone path and id namespace stay
separate: wrapping a `place` in `zone north` makes the zone `north.west` while the rooms stay
`west.*`, because a zone is metadata and must never rename anything.)

### 5. Analysis is unaffected

Flattening happens *before* `lint`, `describe()` and the wall union run, so the plan is one
building: cross-instance room overlap fires, `dims auto` measures the composed facade, the
positioning axes pick up instance openings, and the circulation grid floods across the whole
plan. Instance identity survives only as append-only *facts* (`describe().instances`, plus
`instance`/`component` on the rooms, doors and fixtures).

## The cross-file span bug this uncovered

The Phase-0 spike for this work asked a narrow question — where do the spans of an imported
component's body point? — and found a live defect, present since imports shipped in v0.10:

A component's statements carry spans into the file they were **written** in, while the
diagnostic is reported against the file being **compiled**. `import.ts` collapses module
*parse* errors to the import site, but resolve-time diagnostics from imported bodies kept
their module-relative spans, which silently addressed unrelated bytes of the importer. Worse,
those offsets rode along in `diagnostics[].fixes`, and `applyFixes` spliced them in. Verified:
an off-wall `door` inside an imported component produced a `machine-applicable` fix that
`arch fix` applied to the importer, rewriting the middle of an unrelated `wall` statement:

```
wall exterior thickness 200 { (door id=d on exterior_1 at 50% width 800lose }
```

**Decision.** Keep the primary span **module-relative** and say so: `Diagnostic` gains
append-only `file` (the module the span is measured in), `instance` and `component`;
`FixSuggestion` gains `file`; and **`applyFixes` skips any suggestion carrying one**, with a
reason naming the file the edit belongs to. When the `place`/call itself is in the compiled
source, a `relatedSpans` entry points at it, so a reader always has one location it can
render against the file it has.

**Rejected alternative: re-point the primary span at the `place` statement**, demoting the
body span to `relatedSpans`. It reads well for a human and is wrong for the loop that
matters. It destroys the only precise location of the actual defect — an agent editing the
component library needs the body byte, and N instances of one broken component would produce
N identical messages pointing at N different `place` lines with no way back. It also changes
the span of every *existing* imported-component diagnostic, a larger behavioural break than
adding a field. And it does not even fix the bug on its own: the `fixes[].edits[].spans`
would still be module-relative, so the corruption would remain unless the fixes were dropped
entirely — losing machine-applicability for exactly the plans that need it most.

## Consequences

- **Good.** One wing, authored once, placed twice — the flagship
  `examples/museum-wings.arch` is 42 × 12 m and three statements of composition. `describe()`
  now answers "what are this building's real degrees of freedom?" honestly: a wing is one
  `at`, not N coordinates. `arch fix` can no longer corrupt an importing file.
- **Cost.** Resolution is now grouped rather than one flat pass; the root group resolves
  last, so for a plan *with* instances the plan-wide wall array is ordered
  instance-walls-then-root-walls rather than pure source order. Element draw order is
  unaffected (it is rebuilt from the entry stream), and a plan with no `place` has exactly
  one group, so nothing about the historical path changes.
- **Limitation, inherited.** A `stair` inside a rotated instance re-derives its UP/DN arrow
  from the global footprint by the fixed drafting convention in `src/vertical.ts`, so a
  90°/270° turn can flip it — the same documented v1 limitation as authoring the flight in
  that orientation directly.
- **Limitation, deliberate.** Handed fixture *glyphs* are re-oriented by quarter-turn under a
  mirror rather than reflected; reflection is not a Scene primitive. For ArchLang's
  rectilinear fixture symbols the two are the same picture.
