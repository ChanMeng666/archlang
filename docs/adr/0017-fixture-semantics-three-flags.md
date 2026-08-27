# 17. Fixture semantics: three distinct flags, one shared predicate, one derived table

- **Status:** Accepted
- **Date:** 2026-08 (v1.28.0 / v1.29.0)

## Context

Until v1.28.0 the fixture catalogue knew 18 categories, eight of which drew a symbol.
Everything else — `bed`, `sofa`, `desk`, `wardrobe`, `dining_table`, `car`, words the
shipped examples had been writing for months — fell through to "unknown category": no
footprint, no wall semantics, and a labelled rectangle where a drawing belonged.

Widening the catalogue to 59 words across 36 families forced a question the small
catalogue had let us dodge. `requiresWall` was doing **three jobs at once**: it decided
whether a piece must touch a wall (`W_FIXTURE_FLOATING`), whether its footprint may be
derived from `against wall … in <room>`, and — through `orientationMatters` — whether the
symbol takes a derived quarter-turn from the wall it backs onto. Those three coincide for
a `wc` and a `basin`. They come apart the moment a `sofa` is catalogued: a sofa has a back
worth turning to a wall, and no plumbing whatsoever.

Turning the flag on for the new room furniture proved it: **23 spurious floating-fixture
warnings across nine shipped plans**, the largest group being twelve on
`examples/library.arch`, whose stacks are free-standing runs mid-floor. Those plans were
correct. The flag was wrong.

## Decision

**1. `requiresWall` means SERVICES, and only services.** It stays with the plumbed and
vented goods, and `W_FIXTURE_FLOATING` stays keyed on it alone — because that rule's
remedy prose is about supply and waste, and it has nothing to say to a sofa in the middle
of a room.

**2. A separate `directional` flag carries "this symbol has a back worth turning toward a
wall, though it needs no services."** `orientationMatters` becomes
`(requiresWall || directional) && !symmetric`. Eleven categories carry it.
`sofa`/`chair`/`bench`/`desk` deliberately do **not**: seating is *arranged*, not
installed, and deriving a turn for it would assert a fact the plan never stated.

**3. A third flag, `underlay` (v1.29.0), marks a piece that lies flat and is stood on —
and it is read through exactly one predicate, `solidFurniture()`.** Four consumers ask
whether a piece is solid: the overlap rule, the clearance rule, the whole-plan nav grid
and the per-room flood fill. Routing all four through one predicate is the whole point —
two grids that answer "is a rug walkable?" differently is a defect nobody would see.
The exemption is **narrow, and proved in both directions**: a rug under a sofa raises
nothing, two ordinary pieces overlapping still raise `W_FURNITURE_OVERLAP`, and two
*rugs* overlapping each other still raise it too. An underlay is not "overlap checking
off".

**4. The category list is a single derived table, never a switch.** `FIXTURE_FAMILIES`
(in `src/elements/fixtures-glyphs.ts`) is the one place a family and its aliases are
written; `FIXTURE_CATEGORIES`, `CANONICAL_FIXTURES`, the manifest's `fixtureCategories`,
the legend's `hasFixtureGlyph` filter and `spec.llm.md`'s footprint list are all
**derived from it**. Adding a family is a row plus a `CATALOG` entry — never a new
element, never a `switch` arm.

**5. A drawn symbol ignores its `label`.** Long-standing for `wc` and `basin`, now true
of twenty shipped examples whose fixture words vanish from the drawing while staying in
the source and in `describe()`. The labelled rectangle remains the deliberate escape
hatch for any word the catalogue does not know.

### Rejected: a `sofa_l_r` category

`sofa_l`'s return is always on the left, and `place … mirror` will not produce a
right-handed one — a reflection transforms a resolved element's *position*, not the
symbol drawn inside it. Adding a mirrored category was rejected rather than forgotten:
it would put the fix **in the vocabulary**, where every future handed symbol then needs
its own twin. The fix belongs in `transformElement`'s `det < 0` branch, which is already
where the handed rules flip (see
[ADR 0016](0016-component-instances-and-frames.md)); it is recorded as an open item in
`docs/backlog.md`.

## Consequences

- **`arch lint` got quieter on nine plans and sharper on five**: the 23 spurious warnings
  went, and `directional` surfaced six real defects the drawing could not previously show.
  A flag that means one thing can be believed.
- Three flags cost more to keep straight than one, and the failure mode is a new category
  copying its neighbour's flags without asking what they claim. The mitigation is that
  each flag now has a **one-sentence meaning that names its consumer**, stated here and in
  `src/fixtures-catalog.ts`.
- Any future rule that wants to exempt a class of furniture must extend `solidFurniture()`
  or state plainly why it needs a fourth notion of "solid". Two doorway rules
  (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`) do **not** yet consult it, and that gap is
  recorded in `docs/furniture.md` rather than left to be discovered.
- The derived table means a family added without a glyph is caught rather than shipped:
  the legend filters on `hasFixtureGlyph`, and the spec generator interpolates the list it
  documents instead of retyping it.
