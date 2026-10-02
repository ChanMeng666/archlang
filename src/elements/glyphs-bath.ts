/**
 * Bathroom plan symbols: the WC, the basin, the shower tray, the tub, the bidet, the urinal and
 * the mirror.
 *
 * Every symbol is drawn in the visual-polish language the pilot `wc` set: the OUTLINE of a piece
 * in the `thin` pen (drawn in the derived symbol ink), every DETAIL inside it — a bowl's rim, a
 * tap, a drain, the falls of a tray — in the `extraThin` pen, and TRUE curves (`ovalPath`,
 * `roundedRectPath`) wherever the real thing is round: a bowl is a four-centre oval and a tub's
 * foot end is an arc, not a 24-gon. The vocabulary, in the order a bathroom reads it:
 *
 * - **A hard carcass is `g.body`; a bowl, a tray floor or a seat is `g.basin`** (white). A drawn
 *   piece therefore reads from its lines alone in `mono`, where every tint is white.
 * - **Real closed-form geometry, every measure a fraction of the host footprint, no absolute
 *   millimetre anywhere.** That is what lets one symbol read at legend-swatch size and at 1:50
 *   on an A1 sheet without a second size tier.
 *
 * Two conventions the whole file obeys:
 *
 * - **Back-on-top.** A symbol is drawn with the side that goes against the wall along the
 *   TOP edge of `r`; `furniture.render()` quarter-turns the finished nodes about the
 *   footprint centre (and hands us a pre-swapped `r` for 90°/270°, so the turned symbol
 *   still fills the declared `w x h`). Nothing here knows about rotation.
 * - **Circles are circles.** A drain, a flush button, a tap: a true `circle` prim, not a
 *   tessellated ring. It is crisper at every zoom and lowers to a native `CIRCLE` entity in
 *   the DXF export.
 *
 * Every radius is a fraction of `min(r.w, r.h)` and every inset from the edge it sits near is at
 * least that fraction, so a symbol stays inside its own footprint at any aspect ratio —
 * including the 1 x 10000 and 10000 x 1 rects the fuzz corpus feeds it. Pure and deterministic:
 * no clock, no randomness, no state; the curve builders are closed-form.
 *
 * Mirror symmetry: the `wc`, the `basin`, the `shower`, the `bidet` and the `urinal` are
 * symmetric about their centre line (`test/glyph-chirality.test.ts` holds a mirrored `wc` and
 * `shower` to the plain one's exact bytes). The `bathtub` is handed — its taps are at one end —
 * and so is the `mirror`, whose reflection ticks all lean the same way.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { clamp, insetRect, ovalPath, rectPoly, roundedRectPath, shortSide } from "./glyph-lib.js";

/**
 * The WC: the cistern along the back with its flush button, the bowl in front of it, the seat
 * opening inside the bowl, and the two seat hinges.
 *
 * - **Cistern** (body fill, outline pen): a rounded rectangle 85% of the width × 24% of the
 *   depth against the back edge — the first node, and the one band `test/fixture-orientation`
 *   finds on the wall side.
 * - **Bowl** (white, outline pen): a FOUR-CENTRE OVAL ({@link ovalPath}) 80% of the width ×
 *   73% of the depth, drawn after the cistern and overlapping its front edge, as the real bowl
 *   stands in front of it. A true curve, not a 24-gon.
 * - **Seat opening** (white, detail pen): the inner oval, the ring 12% of the bowl's width at the
 *   sides and the front and twice that at the back, where the seat is hinged.
 * - **Hinges and flush button** (detail pen): two short ticks on the back of the ring and one
 *   small disc on the cistern.
 *
 * Mirror-symmetric about the centre line by construction — `test/glyph-chirality.test.ts`
 * holds a mirrored WC to the plain one's exact bytes.
 *
 * Prim count: 6.
 */
export function drawWc(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const unit = Math.min(r.w, r.h);
  const cisW = r.w * 0.85;
  const cisH = r.h * 0.24;
  g.path(roundedRectPath({ x: cx - cisW / 2, y: r.y, w: cisW, h: cisH }, Math.min(cisW, cisH) * 0.14), g.body);

  const bowlTop = r.y + r.h * 0.215;
  const bowlBot = r.y + r.h * 0.945;
  const bowlCy = (bowlTop + bowlBot) / 2;
  const rx = r.w * 0.4;
  const ry = (bowlBot - bowlTop) / 2;
  g.path(ovalPath(cx, bowlCy, rx, ry), g.basin);
  // The ring: `ring` at the sides and the front, `2 × ring` at the back.
  const ring = Math.min(rx * 2 * 0.12, ry * 0.3);
  g.path(ovalPath(cx, bowlCy + ring * 0.5, rx - ring, ry - ring * 1.5), g.basin, "extraThin");

  // The hinges: two ticks on the back of the ring, clear of the cistern's front edge.
  const hy0 = r.y + cisH + (bowlCy - ry + ring * 2 - r.y - cisH) * 0.25;
  const hy1 = r.y + cisH + (bowlCy - ry + ring * 2 - r.y - cisH) * 0.75;
  for (const f of [-0.17, 0.17]) {
    const x = cx + r.w * f;
    g.seg({ x, y: hy0 }, { x, y: hy1 }, "extraThin");
  }
  g.dot({ x: cx, y: r.y + cisH * 0.5 }, unit * 0.04);
  return g.nodes;
}

/**
 * A basin: a vanity top (a rounded rectangle) with an oval bowl let into it, a tap at the back
 * and a waste — **or two bowls** when the slab is at least 2.2 times as wide as it is deep.
 *
 * - **Top** (body fill, outline pen): corners eased to 6% of the short side — the first node.
 * - **Bowl** (white, outline pen): a four-centre oval ({@link ovalPath}) inset 12% of its cell
 *   from the sides, spanning 24%–92% of the depth, so a tap deck is left behind it.
 * - **Floor** (white, detail pen): the same oval drawn in by a rim a fifth of the bowl's short
 *   semi-axis wide — the line that says "a bowl with a depth", not a flat dish.
 * - **Tap and waste** (detail pen): a disc on the centre line at the back, a short spout stub
 *   running to the bowl's rim, and a disc on the bowl centre.
 *
 * The double branch is the vanity convention from the reference plans: a run long enough for
 * two basins is drawn with two, each in its own half of the width, rather than as one enormous
 * oval. Every bowl is centred in its half, so the symbol is mirror-symmetric either way.
 *
 * The threshold is aspect ratio 2.2, and it is written `w * 10 >= h * 22` for two reasons.
 * A multiplication rather than `w / h` means a zero-depth rect picks a branch instead of
 * dividing; and the INTEGER pair rather than `2.2 * h` is because 2.2 is not representable —
 * `2.2 * 100` is `220.00000000000003`, so a 220 x 100 slab, the round number an author would
 * actually type at the boundary, would have fallen on the single-bowl side of its own rule.
 *
 * Prim count: 6 for one bowl, 11 for two.
 */
export function drawBasin(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.06), g.body);

  const double = r.w * 10 >= r.h * 22;
  const cell = r.w / (double ? 2 : 1);
  const rx = cell * 0.38;
  const ry = r.h * 0.34;
  const bowlCy = r.y + r.h * 0.58;
  const rim = Math.min(rx, ry) * 0.2;
  const tapY = r.y + r.h * 0.115;

  for (let k = 0; k < (double ? 2 : 1); k++) {
    const cx = r.x + cell * (k + 0.5);
    g.path(ovalPath(cx, bowlCy, rx, ry), g.basin);
    g.path(ovalPath(cx, bowlCy, rx - rim, ry - rim), g.basin, "extraThin");
    g.dot({ x: cx, y: tapY }, s * 0.035);
    g.seg({ x: cx, y: tapY }, { x: cx, y: r.y + r.h * 0.31 }, "extraThin");
    g.dot({ x: cx, y: bowlCy + ry * 0.1 }, s * 0.03);
  }
  return g.nodes;
}

/**
 * A shower tray: the rim, the floor let into it, the falls to the waste, and the waste.
 *
 * - **Tray** (body fill, outline pen): corners eased to 4% of the short side — the rim.
 * - **Floor** (white, detail pen): inset 6% of the short side all round.
 * - **Falls** (detail pen): four short strokes from the floor's corners towards the waste,
 *   stopping at its ring — the convention that says "this floor slopes to a drain" and keeps
 *   the diagonals from reading as an X drawn over a box.
 * - **Waste** (detail pen): a ring with a disc in it, on the centre.
 *
 * Every measure is symmetric about both axes and the rim is an even band, so the silhouette is
 * unchanged by a quarter turn — which is the catalog's claim about this fixture, not an
 * accident of the numbers — and a mirrored shower is the plain one's exact bytes.
 *
 * Prim count: 8.
 */
export function drawShower(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.04), g.body);
  const floor = insetRect(r, 0.06);
  g.path(roundedRectPath(floor, s * 0.02), g.basin, "extraThin");

  const ringR = s * 0.055;
  // Each fall runs from just inside a floor corner to the waste's ring, along the diagonal.
  const lead = s * 0.03;
  for (const [fx, fy] of [
    [floor.x, floor.y],
    [floor.x + floor.w, floor.y],
    [floor.x + floor.w, floor.y + floor.h],
    [floor.x, floor.y + floor.h],
  ] as const) {
    const dx = cx - fx;
    const dy = cy - fy;
    const len = Math.hypot(dx, dy);
    const ux = len > 0 ? dx / len : 0;
    const uy = len > 0 ? dy / len : 0;
    g.seg({ x: fx + ux * lead, y: fy + uy * lead }, { x: cx - ux * ringR, y: cy - uy * ringR }, "extraThin");
  }
  g.ring({ x: cx, y: cy }, ringR, "extraThin");
  g.dot({ x: cx, y: cy }, s * 0.02);
  return g.nodes;
}

/**
 * A bathtub: the rim (the whole tub), the well let into it, two taps on the deck at the head and
 * the waste in the well beside them.
 *
 * - **Rim** (body fill, outline pen): corners eased to 8% of the short side — the first node.
 * - **Well** (white, outline pen): inset 9% of the short side from the sides and the foot and
 *   20% from the head, where the deck carries the taps. Its corners are NOT alike: the head end
 *   is nearly square (14% of the well's depth) and the foot end is rounded to 42% of it, nearly
 *   a half-circle — the shape that says which end you lie at.
 * - **Taps** (detail pen): two discs on the head deck, stacked across the tub.
 * - **Waste** (detail pen): a ring with a disc in it, at the head end of the well.
 *
 * The head is the -x end of the footprint (where the shipped symbol has always put its taps), so
 * the symbol is handed and a mirrored `place` mirrors it. Every inset is a multiple of the SHORT
 * side, so the well never meets the rim at any aspect.
 *
 * Prim count: 6.
 */
export function drawBathtub(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const cy = r.y + r.h / 2;
  g.path(roundedRectPath(r, s * 0.08), g.body);

  const well: Rect = { x: r.x + s * 0.2, y: r.y + s * 0.09, w: r.w - s * 0.29, h: r.h - s * 0.18 };
  const head = well.h * 0.14;
  const foot = well.h * 0.42;
  g.path(roundedRectPath(well, [head, foot, foot, head]), g.basin);

  for (const dy of [-1, 1]) g.dot({ x: r.x + s * 0.1, y: cy + dy * s * 0.12 }, s * 0.035);
  const drain = { x: well.x + s * 0.15, y: cy };
  g.ring(drain, s * 0.045, "extraThin");
  g.dot(drain, s * 0.015);
  return g.nodes;
}

// ── kitchen & bath ──
//
// Three more bathroom symbols, appended at the END for the reason `FIXTURE_FAMILIES` appends:
// this file's reading order follows that table's, and that table's order is the legend's.

/**
 * A bidet: the bowl with its rim, the tap deck on the bowl's rear rim, its jet and the waste.
 *
 * Read it against {@link drawWc}, because that is the only symbol it can be confused with and
 * the drawing has to settle it at a glance. A WC's back is a CISTERN — a band across most of
 * the width, a quarter of the depth deep, with a flush button on it. A bidet has no cistern at
 * all; its back carries a small tap deck barely a third of the width and an eighth of the depth,
 * standing ON the rim of a bowl that reaches nearly to the back edge. The other tell is the
 * waste: a bidet's is on the bowl centre, where a WC has none drawn.
 *
 * - **Bowl** (white, outline pen): a four-centre oval 86% of the width — the first node.
 * - **Rim** (white, detail pen): the inner oval, a wider ring at the back where the jet is.
 * - **Tap deck** (body fill, outline pen): a rounded block over the bowl's back rim, a tap disc
 *   on it and a short jet stub running forward.
 * - **Waste** (detail pen): a disc on the bowl centre.
 *
 * Mirror-symmetric about the centre line. Prim count: 6.
 */
export function drawBidet(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const s = shortSide(r);

  const bowlCy = r.y + r.h * 0.545;
  const rx = r.w * 0.43;
  const ry = r.h * 0.42;
  g.path(ovalPath(cx, bowlCy, rx, ry), g.basin);
  const ring = Math.min(rx * 2 * 0.14, ry * 0.3);
  g.path(ovalPath(cx, bowlCy + ring * 0.5, rx - ring, ry - ring * 1.5), g.basin, "extraThin");

  const deckW = Math.min(r.w * 0.36, r.h * 0.5);
  const deckH = r.h * 0.12;
  const deckY = r.y + r.h * 0.03;
  g.path(roundedRectPath({ x: cx - deckW / 2, y: deckY, w: deckW, h: deckH }, Math.min(deckW, deckH) * 0.22), g.body);
  const tapY = deckY + deckH * 0.5;
  g.dot({ x: cx, y: tapY }, s * 0.035);
  g.seg({ x: cx, y: deckY + deckH }, { x: cx, y: bowlCy - ry + ring * 2.2 }, "extraThin");
  g.dot({ x: cx, y: bowlCy + ring * 0.5 }, s * 0.04);
  return g.nodes;
}

/**
 * A urinal: the bowl on the wall, its rim, the flush plate across its back and the waste.
 *
 * This is the only fixture in the catalogue drawn as a U against its wall, and that is the honest
 * plan of it: a wall-hung urinal has no back at all — the wall is its back — so the bowl runs to
 * the very top edge of its footprint with square back corners and a rounded front, where a closed
 * oval would draw a rim that does not exist and would read as a small basin.
 *
 * - **Bowl** (white, outline pen): a rounded rectangle 88% of the width with its two FRONT corners
 *   at half the width — a semicircular front on straight sides — the first node.
 * - **Rim** (white, detail pen): the same shape drawn in by 12% of the bowl's short side.
 * - **Plate** (body fill, outline pen): the flush pipe and bracket, a band 56% of the width and
 *   13% of the depth over the bowl's back. It is what tells the symbol from a `basin` at legend
 *   size, where a U and a shallow oval converge.
 * - **Waste** (detail pen): a disc on the centre line, in the bowl's rounded front.
 *
 * Mirror-symmetric about the centre line. Prim count: 4.
 */
export function drawUrinal(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  const s = shortSide(r);
  const bowl: Rect = { x: r.x + r.w * 0.06, y: r.y, w: r.w * 0.88, h: r.h * 0.97 };
  const front = Math.min(bowl.w / 2, bowl.h * 0.7);
  g.path(roundedRectPath(bowl, [0, 0, front, front]), g.basin);
  const wall = shortSide(bowl) * 0.12;
  const inner: Rect = { x: bowl.x + wall, y: bowl.y + wall, w: bowl.w - 2 * wall, h: bowl.h - 2 * wall };
  const innerFront = Math.max(0, front - wall);
  g.path(roundedRectPath(inner, [0, 0, innerFront, innerFront]), g.basin, "extraThin");

  const plateW = r.w * 0.56;
  const plateH = r.h * 0.13;
  g.path(
    roundedRectPath({ x: cx - plateW / 2, y: r.y, w: plateW, h: plateH }, [0, 0, plateH * 0.25, plateH * 0.25]),
    g.body,
  );
  g.dot({ x: cx, y: r.y + r.h * 0.6 }, s * 0.045);
  return g.nodes;
}

/**
 * A wall-hung mirror: the glass, and a run of reflection ticks across it.
 *
 * The catalogued footprint is 900 x 50 — a mirror has essentially no depth, which is the
 * whole drawing problem. A 50 mm band is a line at any real plan scale, and a line on a wall
 * is already what a wall looks like, so the symbol needs a mark that survives being 18 times
 * longer than it is deep. The ticks are that mark: strokes at 45 degrees, the convention for a
 * reflective surface on a section or elevation, borrowed here because nothing else fits in the
 * band — and any detail that does not CROSS the band (an inset frame, a centre line) closes
 * up into the outline at 1:100, where a 50 mm slab is narrower than two of its own pen widths.
 *
 * The tick count follows the run, one per four depths of length clamped to `[3, 12]`, so a long
 * mirror keeps the rhythm a short one has and a legend swatch still gets three. The ticks all lean
 * the same way, which is why the symbol is handed: a mirrored `place` mirrors them.
 *
 * The glass is filled `g.basin` (white) rather than `g.body`, so the mirror reads as a void in
 * the wall run instead of as another cabinet stuck to it.
 *
 * The tick half-length is capped at half a pitch as well as at 45% of the depth, and that cap is
 * what makes containment hold rather than nearly hold: a half-length keyed to `min(w, h)` alone
 * escapes the ends the moment the footprint is TALLER than it is wide — which the fuzz corpus's
 * 1 x 10000 rect is.
 *
 * Prim count: `1 + ticks`, 6 at the catalogued 900 x 50.
 */
export function drawMirror(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.basin);
  const n = clamp(Math.round(r.w / (4 * r.h)), 3, 12);
  const pitch = r.w / n;
  const d = Math.min(r.h * 0.45, pitch * 0.25);
  const cy = r.y + r.h / 2;
  for (let k = 0; k < n; k++) {
    const x = r.x + pitch * (k + 0.5);
    g.seg({ x: x - d, y: cy + d }, { x: x + d, y: cy - d }, "extraThin");
  }
  return g.nodes;
}
