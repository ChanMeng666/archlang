/**
 * Error catalogue: the site family. The site and outdoor elements: boundaries, streets, terraces,
 * balconies, fences, and the `outdoor` lint family.
 *
 * Spread into `ERROR_CATALOG` by `src/error-catalog.ts`; each code is written once, as its key.
 */

import { defineEntries, e, w } from "./entry.js";

export const SITE_ENTRIES = defineEntries({
  E_SITE_DUP: e(
    "Two `site` blocks in one plan.",
    "A plan declares `site` more than once. `axes` merges when repeated because two axis lists *append*; two `street` values **contradict**, and silently keeping the last one would hide an authoring mistake in the very statement whose job is to be the single source of orientation.",
    "Delete one of the blocks, or merge their fields into a single `site { … }`. The first block is the one that takes effect.",
    'plan "H" {\n  units mm\n  site { street south }\n  site { street north }   # error: site already declared\n}',
  ),
  E_SITE_NO_STREET: e(
    "A `site` block declares no `street`.",
    "`street` is the only required field of `site`: every derived name (`back`, and the three `_side` names) is a function of it, so a site without one derives nothing at all. Refusing beats defaulting — there is no direction a building's frontage faces by default.",
    "Add `street north`, `south`, `east` or `west` inside the block. `hemisphere` is the optional field (it defaults to `north`).",
    'plan "H" {\n  units mm\n  site { hemisphere south }   # error: no street\n}',
  ),
  E_OUTDOOR_SIZE: e(
    "An outdoor surface must have a positive size.",
    "An `outdoor … at (x,y) size WxH` statement's width or height evaluated to zero or a negative number, so there is no ground to draw, hatch or measure.",
    "Give it a positive `size W x H` — the surface's extent in plan. For a shape that is not a rectangle, use the `polygon` spelling instead.",
    "outdoor lawn at (0,0) size 0x4000   # error: zero width",
  ),
  E_OUTDOOR_POLY_DEGENERATE: e(
    "An outdoor ring is degenerate, or a balcony was given one.",
    "Either an `outdoor … polygon …` ring has fewer than 3 effective vertices once duplicate and collinear points are removed (so it encloses no area), or the ring was written on a `balcony`, which is rectangle-only: a balcony's railing is derived per EDGE — top, bottom, left, right — and a ring has no such edges.",
    "Give the ring at least 3 corners that are not all on one line. For a balcony, use `at (x,y) size WxH`; a polygonal balcony is deferred by name, not supported.",
    "outdoor paving polygon (0,0) (1000,0) (2000,0)   # error: all three are collinear",
  ),
  E_OUTDOOR_POLY_SELF_INTERSECT: e(
    "An outdoor ring crosses itself.",
    "The vertices of an `outdoor … polygon …` describe a ring whose edges intersect (a bow-tie), so it encloses no single area — there is no unambiguous surface to hatch or to measure. Usually two vertices in the wrong order.",
    "Reorder the vertices so the ring is a simple polygon, walking the outline once without crossing back over itself.",
    "outdoor deck polygon (0,0) (4000,4000) (4000,0) (0,4000)   # error: a bow-tie",
  ),
  E_OUTDOOR_RAIL: e(
    "A `rail` clause on something that is not a balcony, or an unknown edge word.",
    "`rail` names which edges carry a railing, and only a `balcony` has one. Written on any other ground surface it has no meaning — and a clause with no meaning is refused rather than silently dropped, so a plan never draws differently from what it says. The same code covers an edge word outside `top|bottom|left|right|all|none`.",
    "Delete the clause, or make the surface an `outdoor balcony`. For an unknown word, use one of the six edge words.",
    "outdoor deck at (0,0) size 3000x2000 rail all   # error: a deck has no railing",
  ),
  E_FENCE_CURVED: e(
    "A fence cannot have a curved (`arc`) edge.",
    "An `arc … radius …` clause appeared inside a `fence { … }` body. The post pitch, the panel offset and the reported `length_mm` are all measured along a STRAIGHT run, so a faceted curve would silently measure the facets rather than the arc — this release refuses rather than approximating (the same decision `roof` makes with `E_ROOF_CURVED`).",
    "Approximate the curve with short straight runs, which is what a fence built on a curve actually is.",
    "fence picket { (0,0) arc (3000,3000) radius 3000 }   # error: curved edge",
  ),
  E_SITE_BOUNDARY_DEGENERATE: e(
    "The site `boundary` encloses no lot.",
    "A `site { boundary … }` ring has fewer than 3 effective vertices once duplicate and collinear points are removed, so there is no lot to draw a property line round or to report an area for.",
    "Give the boundary at least 3 corners that are not all on one line.",
    "site { street north\n  boundary (0,0) (10000,0) }   # error: two points is not a lot",
  ),
  E_SITE_BOUNDARY_SELF_INTERSECT: e(
    "The site `boundary` crosses itself.",
    "The vertices of a `site { boundary … }` describe a ring whose edges intersect, so it encloses no single lot and `describe --json`'s `site.lot_area_m2` would have no honest value. Usually two vertices in the wrong order.",
    "Reorder the vertices so the boundary walks the lot line once without crossing back over itself.",
    "site { street north\n  boundary (0,0) (10000,10000) (10000,0) (0,10000) }   # error: a bow-tie",
  ),
  W_OUTDOOR_OVERLAPS_ROOM: w(
    "A ground surface is laid over a room's floor.",
    "An `outdoor` surface's extent overlaps the floor of a room by more than a shared edge. Almost always a coordinate slip — a terrace written from the wrong corner, or a lawn given the building's own extent. It matters because ground and floor are reported in SEPARATE totals (`totals.outdoor_area_m2` and `totals.floor_area_m2`), so the overlapping piece is counted twice by anything that adds them for a plot figure. A surface that merely touches a room along its edge — a patio flush against the house — does NOT trip this.",
    "Move or resize the surface so it sits outside the building's rooms. If the overlap is deliberate (a covered terrace drawn under a room), the two are genuinely different things and one of them is the wrong element.",
    'room id=liv at (0,0) size 5000x4000 label "Living"\noutdoor paving at (1000,1000) size 3000x2000   # warning: on the living-room floor',
  ),
  W_BALCONY_NO_DOOR: w(
    "A balcony with no way onto it.",
    "An `outdoor balcony` has no `door` and no way through a `window` within one wall thickness of any of its edges, so the drawing shows a slab that cannot be reached. A window counts as well as a door, because a full-height window is a normal way onto a balcony: `sill 0` counts, and so does a window with no `sill` clause, whose 900 mm is only the default. A window whose authored `sill` is above 0 stops above the floor and does not count; the message then gives the sill. A `fixed` or `tilt` window does not count whatever its sill: nobody walks through it.",
    "Add a door (or a full-height window) on the wall the balcony hangs off — the usual fix — or move the balcony to the facade that already has one.",
    "outdoor balcony at (2000,7200) size 4000x1600   # warning: no opening within reach",
  ),
});
