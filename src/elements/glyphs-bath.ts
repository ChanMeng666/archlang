/**
 * Bathroom plan symbols: the WC, the basin, the shower tray and the tub.
 *
 * These four were the Phase-0 verbatim move out of `fixtures-glyphs.ts`; this pass gives
 * them the fidelity a drafted symbol needs — a seat inside the bowl, a tap that is a tap
 * rather than a tick, a tray with a rim, a tub with a turned head rim — following
 * `door-panels.ts`'s model: **real closed-form geometry, every measure a fraction of the
 * host footprint, no absolute millimetre anywhere.** That is what lets one symbol read at
 * legend-swatch size and at 1:50 on an A1 sheet without a second size tier.
 *
 * Two conventions the whole file obeys:
 *
 * - **Back-on-top.** A symbol is drawn with the side that goes against the wall along the
 *   TOP edge of `r`; `furniture.render()` quarter-turns the finished nodes about the
 *   footprint centre (and hands us a pre-swapped `r` for 90°/270°, so the turned symbol
 *   still fills the declared `w x h`). Nothing here knows about rotation.
 * - **Circles are circles.** A drain, a flush button, a waste: a true `circle` prim, not a
 *   tessellated ring. It is crisper at every zoom and lowers to a native `CIRCLE` entity in
 *   the DXF export. Only shapes that must be FILLED as a soft outline (the bowls, the tub
 *   rim) stay polygons, because that is the one thing a stroked circle cannot be here.
 *
 * Every radius is a fraction of `min(r.w, r.h)` and every circle's offset from the edge it
 * sits near is at least that fraction, so a symbol stays inside its own footprint at any
 * aspect ratio — including the 1 x 10000 and 10000 x 1 rects the fuzz corpus feeds it.
 * Pure and deterministic: no clock, no randomness, no state.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { ellipsePoly, insetRect, rectPoly, roundedRectPoly } from "./glyph-lib.js";

/**
 * `r` shrunk by an independent fraction on each of the four sides.
 *
 * `glyph-lib`'s {@link insetRect} takes ONE fraction of the short side, which is right for a
 * rim of even width and wrong for the tub below, whose head rim carries the taps and is
 * nearly twice the foot. The four fractions are of the axis they shrink (`left`/`right` of
 * `r.w`, `top`/`bottom` of `r.h`), and each pair sums to well under 1, so the result always
 * has non-negative extents.
 *
 * **Phase-2 candidate:** this belongs beside `insetRect`/`insetRectXY` in `glyph-lib.ts` if a
 * second domain module wants an uneven rim.
 */
function insetRectSides(r: Rect, left: number, right: number, top: number, bottom: number): Rect {
  return {
    x: r.x + r.w * left,
    y: r.y + r.h * top,
    w: r.w * (1 - left - right),
    h: r.h * (1 - top - bottom),
  };
}

/** A concentric copy of an ellipse, scaled by `k` about its own centre. */
function innerEllipse(cx: number, cy: number, rx: number, ry: number, k: number) {
  return ellipsePoly(cx, cy, rx * k, ry * k);
}

/**
 * Cistern across the back with its lid lip and flush button, bowl and seat in front.
 *
 * The seat is the 0.78 ring inside the bowl — the detail that separates a WC from "an
 * ellipse", and the reason the inner outline is drawn in the bowl's own fill rather than
 * left unfilled: it is one edge on a solid, not a second basin.
 */
export function drawWc(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const cisH = r.h * 0.22;
  const unit = Math.min(r.w, r.h);
  g.poly(
    [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + cisH },
      { x: r.x, y: r.y + cisH },
    ],
    g.body,
  );
  // The lid's back lip: a seam across the cistern, clear of the button below it.
  const lipY = r.y + cisH * 0.3;
  g.seg({ x: r.x + r.w * 0.06, y: lipY }, { x: r.x + r.w * 0.94, y: lipY }, "extraThin");
  const bowlCy = r.y + cisH + (r.h - cisH) * 0.52;
  const bowlRx = r.w * 0.4;
  const bowlRy = (r.h - cisH) * 0.46;
  g.poly(ellipsePoly(cx, bowlCy, bowlRx, bowlRy), g.basin);
  g.poly(innerEllipse(cx, bowlCy, bowlRx, bowlRy, 0.78), g.basin, "extraThin");
  g.dot({ x: cx, y: r.y + cisH / 2 }, unit * 0.05);
  return g.nodes;
}

/**
 * Vanity slab with an inset oval bowl, its tap block and spout — **or two bowls** when the
 * slab is at least 2.2 times as wide as it is deep.
 *
 * The double branch is the vanity convention from the reference plans: a run long enough for
 * two basins is drawn with two, at the quarter points (0.28 / 0.72 of the width) rather than
 * as one enormous oval.
 *
 * The threshold is aspect ratio 2.2, and it is written `w * 10 >= h * 22` for two reasons.
 * A multiplication rather than `w / h` means a zero-depth rect picks a branch instead of
 * dividing; and the INTEGER pair rather than `2.2 * h` is because 2.2 is not representable —
 * `2.2 * 100` is `220.00000000000003`, so a 220 x 100 slab, the round number an author would
 * actually type at the boundary, would have fallen on the single-bowl side of its own rule.
 */
export function drawBasin(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);

  const double = r.w * 10 >= r.h * 22;
  const centres = double ? [0.28, 0.72] : [0.5];
  const rx = r.w * (double ? 0.16 : 0.34);
  const ry = r.h * 0.32;
  const bowlCy = r.y + r.h * 0.56;
  // The tap is 0.10 of the width, capped against the DEPTH so a long vanity run does not
  // grow a tap the size of a bowl. On a 600x400 basin the cap never binds.
  const tapW = Math.min(r.w * 0.1, r.h * 0.25);
  const tapH = r.h * 0.1;
  const tapY = r.y + r.h * 0.03;

  for (const f of centres) {
    const cx = r.x + r.w * f;
    g.poly(ellipsePoly(cx, bowlCy, rx, ry), g.basin);
    g.poly(innerEllipse(cx, bowlCy, rx, ry, 0.8), g.basin, "extraThin");
    g.poly(
      [
        { x: cx - tapW / 2, y: tapY },
        { x: cx + tapW / 2, y: tapY },
        { x: cx + tapW / 2, y: tapY + tapH },
        { x: cx - tapW / 2, y: tapY + tapH },
      ],
      g.body,
    );
    // The spout reaches from the block into the bowl, stopping short of its centre.
    g.seg({ x: cx, y: tapY + tapH }, { x: cx, y: bowlCy - ry * 0.4 }, "extraThin");
  }
  return g.nodes;
}

/**
 * Tray outline, an inset rim, the two diagonals corner-to-corner of the INNER tray, and a
 * concentric drain.
 *
 * The diagonals stop at the rim rather than the tray edge, which is what stops them reading
 * as an X drawn over a box. Every measure is symmetric about both axes and the rim is
 * {@link insetRect}'s even band, so the silhouette is unchanged by a quarter turn — which is
 * the catalog's claim about this fixture, not an accident of the numbers.
 */
export function drawShower(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const unit = Math.min(r.w, r.h);
  g.poly(rectPoly(r), g.basin);
  const inner = insetRect(r, 0.08);
  g.poly(rectPoly(inner), g.basin, "extraThin");
  g.seg({ x: inner.x, y: inner.y }, { x: inner.x + inner.w, y: inner.y + inner.h }, "extraThin");
  g.seg({ x: inner.x + inner.w, y: inner.y }, { x: inner.x, y: inner.y + inner.h }, "extraThin");
  g.ring({ x: cx, y: cy }, unit * 0.05);
  g.dot({ x: cx, y: cy }, unit * 0.018, g.stroke, "extraThin");
  return g.nodes;
}

/**
 * Eased outer rim, an asymmetrically inset well, the tap at the head and the waste on the
 * centreline.
 *
 * The head end is the -x end of the footprint (where the shipped symbol has always put its
 * tap), and its rim is 0.18 of the length against the foot's 0.10 — the turned deck a tub
 * carries its taps on. Drawing the well concentric, as the previous body did, made the tub
 * read as a tray with a border; the uneven rim is what says which end you get in at.
 */
export function drawBathtub(r: Rect, g: GlyphCtx): SceneNode[] {
  const cy = r.y + r.h / 2;
  const unit = Math.min(r.w, r.h);
  g.poly(roundedRectPoly(r, unit * 0.18), g.body);
  const well = insetRectSides(r, 0.18, 0.1, 0.12, 0.12);
  g.poly(roundedRectPoly(well, Math.min(well.w, well.h) * 0.12), g.basin);
  g.dot({ x: r.x + r.w * 0.07, y: cy }, unit * 0.05);
  g.ring({ x: r.x + r.w * 0.62, y: cy }, unit * 0.04, "extraThin");
  return g.nodes;
}
