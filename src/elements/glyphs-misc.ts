/**
 * The remaining plan symbols: the workspace pieces, and the two that belong to no room at
 * all (a plant, a parked car).
 *
 * `car` earns its place for the same reason a `bench` does: it is drawn on real plans (a
 * carport, a driveway, a garage) and a model asked for one will write the word whether or
 * not the catalog knows it. Catalogued, it is free-standing and unsized-by-default, so it
 * behaves exactly like any other unlisted word until someone draws it.
 *
 * Symbols draw with their "back" (the side placed against a wall) along the TOP edge of the
 * footprint; `furniture.render()` quarter-turns the result about the footprint centre. Two of
 * the five here have no back to speak of — `plant` is drawn fully rotation-symmetric, and
 * `bookshelf` reads off its own long axis rather than off the page — so a turn moves them and
 * changes nothing, which is the honest drawing for a pot and for a run of shelving.
 *
 * Every measure below is a FRACTION of `r.w`/`r.h`, never an absolute millimetre, so a piece
 * sized by hand and one sized from `defaultFootprint` draw the same symbol at two scales, and
 * a degenerate aspect (the fuzz feeds 10000x10) still lands inside its own footprint. The
 * repeat count that could run away — the bookshelf's shelf ticks — is clamped to 12.
 *
 * Pure and deterministic: fixed angles through `Math.cos`/`sin`, no clock, no randomness.
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { clamp, insetRect, insetRectXY, rectPoly, roundedRectPoly } from "./glyph-lib.js";

/**
 * The point at `deg` (screen degrees: 0 = +x, 90 = +y, i.e. DOWN) and radius `rad` about `c`.
 *
 * Local on purpose: this is the only domain module that reaches for trigonometry at all, so
 * there is no second caller to consolidate it with.
 */
function polar(c: Point, rad: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) };
}

/**
 * The desk: a slab with the modesty panel across its back and the working edge stepped in.
 *
 * The modesty line sits at 0.12 of the depth from the BACK (top) edge, which is where the
 * panel actually is — so the drawing says which way the user sits without needing a label.
 */
export function drawDesk(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const my = r.y + r.h * 0.12;
  g.seg({ x: r.x, y: my }, { x: r.x + r.w, y: my }, "extraThin");
  g.poly(rectPoly(insetRect(r, 0.06)), "none", "extraThin");
  return g.nodes;
}

/**
 * The swivel office chair: a round seat, a curved back over it, and two armrests.
 *
 * The back is a TRUE arc rather than a tessellated one, for the reason the door swing is:
 * the CAD export gets a native curve, and no zoom finds the facets. It spans 140 degrees —
 * comfortably a minor arc, which is the only kind the Scene's `arc` primitive carries (the
 * large-arc flag is pinned to 0 in every backend).
 */
export function drawOfficeChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const m = Math.min(r.w, r.h);
  const seat = m * 0.32;
  const back = m * 0.432;
  g.ring(c, seat);
  // 200 deg -> 340 deg is the half above the seat (y grows downward), swept in the
  // increasing-angle direction, which is SVG's sweep flag 1.
  g.arcSeg(c, back, polar(c, back, 200), polar(c, back, 340), 1, "thin");
  for (const s of [-1, 1]) {
    const ax = c.x + s * m * 0.45;
    g.seg({ x: ax, y: c.y - m * 0.1 }, { x: ax, y: c.y + m * 0.3 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The bookshelf: a carcass with its shelf bays ticked off along the run.
 *
 * The run reads off the footprint's own LONG axis, not off the page, so a stack turned
 * 90 degrees draws the same bays rather than a grid. The tick count is derived from the
 * aspect — one bay per 1.5 depths of length — and clamped to 12, because a 10000x1 fuzz
 * rect would otherwise ask for six thousand lines.
 */
export function drawBookshelf(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const short = horizontal ? r.h : r.w;
  const n = clamp(Math.floor(long / short / 1.5), 1, 12);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (horizontal) {
    g.seg({ x: r.x, y: cy }, { x: r.x + r.w, y: cy }, "extraThin");
    for (let i = 1; i <= n; i++) {
      const x = r.x + (r.w * i) / (n + 1);
      g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
    }
  } else {
    g.seg({ x: cx, y: r.y }, { x: cx, y: r.y + r.h }, "extraThin");
    for (let i = 1; i <= n; i++) {
      const y = r.y + (r.h * i) / (n + 1);
      g.seg({ x: r.x, y }, { x: r.x + r.w, y }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The potted plant: the pot as a true circle, the foliage as a ring of eight radials.
 *
 * Every measure is taken from the footprint CENTRE at a radius keyed to the short side, and
 * the radials sit at a 45-degree pitch — so the whole symbol maps onto itself under any
 * quarter-turn. That is deliberate and it is what `symmetric: true` in the fixture catalog
 * already claims about this category: a pot has no back, so a derived rotation would be a
 * fact the drawing cannot show.
 */
export function drawPlant(r: Rect, g: GlyphCtx): SceneNode[] {
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const pot = Math.min(r.w, r.h) * 0.48;
  const inner = pot * 0.6;
  g.ring(c, pot);
  g.ring(c, inner, "extraThin");
  for (let i = 0; i < 8; i++) {
    const deg = i * 45;
    g.seg(polar(c, inner, deg), polar(c, pot, deg), "extraThin");
  }
  return g.nodes;
}

/**
 * The car in plan: body, cabin, the two screens, and a mirror each side.
 *
 * The long axis is the driving direction, drawn top-to-bottom like every other symbol's
 * depth, so `rotate 90` parks it across a garage the same way it turns a bed. The mirrors
 * are drawn INSIDE the footprint even though a real mirror overhangs the body: a fixture's
 * footprint is what every clearance and collision rule measures, and a symbol that drew
 * outside it would make the drawing and the lint disagree about where the car is.
 */
export function drawCar(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(roundedRectPoly(r, r.w * 0.22), g.body);
  const cab = insetRectXY(r, r.w * 0.14, r.h * 0.28);
  g.poly(roundedRectPoly(cab, Math.min(cab.w, cab.h) * 0.18), g.basin);
  // The windscreen and the rear glass, just inside each end of the cabin.
  for (const f of [0.12, 0.88]) {
    const y = cab.y + cab.h * f;
    g.seg({ x: cab.x, y }, { x: cab.x + cab.w, y }, "extraThin");
  }
  // A wing mirror each side, at 0.30 of the length — the band between the cabin and the
  // body edge, which is the only place one fits without leaving the footprint.
  const my = r.y + r.h * 0.3;
  for (const [x0, x1] of [
    [0.02, 0.14],
    [0.86, 0.98],
  ] as const) {
    g.seg({ x: r.x + r.w * x0, y: my }, { x: r.x + r.w * x1, y: my }, "extraThin");
  }
  return g.nodes;
}
