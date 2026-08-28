/**
 * Bedroom plan symbols — the bed and what stands beside it.
 *
 * Drawn in the same vocabulary as the bath and kitchen families: an outline at `thin`, every
 * interior line at `extraThin`, no text, and every measure a FRACTION of the footprint so a
 * piece drawn at any size or aspect keeps its proportions. The back (the side a wall goes
 * behind) is the TOP edge of `r`; `furniture.render()` quarter-turns the result. For a bed the
 * back is the HEAD, which is why the headboard and the pillows are at the top and the
 * turned-down sheet is below them.
 *
 * Two proportions here are not free choices and are worth stating, because both were decided
 * against a constraint rather than by eye.
 *
 * **1. One pillow or two is read off the mattress SHAPE, not the category word.** `bed` and
 * `double_bed` share one drawing function, so the two categories cannot drift apart; what
 * separates a single from a double is `r.w / r.h`. A single mattress is 900 × 2000 (0.45), a
 * double 1500 × 2000 (0.75), so the branch sits at {@link PILLOW_TWO_ASPECT} = 0.6 — which on a
 * 2000-long bed falls at exactly the conventional 1200 mm single/double split. Reading the
 * shape rather than the word is what makes `furniture bed … size 1500x2000` draw the double it
 * plainly is, and a `double_bed` squeezed to 900 draw the single it has become. The glyph has
 * no millimetres to test against — it is handed a footprint and a palette and nothing else —
 * so an aspect ratio is the only honest form this rule can take.
 *
 * **2. The wardrobe's clothes-hanger scallops TILE the rail; their radius is derived, not
 * fixed.** The scallop count comes from the aspect ({@link scallopCount}) and the radius is then
 * half a cell, so consecutive semicircles meet exactly on the rail with no gap and no overlap —
 * the even, end-to-end run is the whole point of the symbol, and it is what makes a wardrobe
 * readable as a wardrobe at plan scale. A radius pinned to a fraction of the depth instead
 * would only tile at one aspect and leave ragged gaps at every other. The one thing that DOES
 * cap the radius is depth: {@link SCALLOP_DEPTH_CAP} keeps the bow inside the carcass on a long
 * shallow piece, where a half-cell would otherwise reach past the front face. On the ordinary
 * proportions (a 1800 × 600 robe) the cap is slack and the scallops touch.
 *
 * Pure and deterministic: closed-form arithmetic on `(rect, theme, sizes)`, no clock, no
 * randomness, and no trig — the scallops are axis-aligned semicircles, so their endpoints are
 * the centre ± the radius along x and nothing has to be solved.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { clamp, dashedPoly, insetRect, rectPoly, roundedRectPoly } from "./glyph-lib.js";

/** Mattress aspect (`w / h`) at or above which the bed gets two pillows. See the header. */
const PILLOW_TWO_ASPECT = 0.6;

/**
 * The bed: mattress, headboard band at the head, pillow(s), and the turned-down sheet.
 *
 * Shared by `bed` and `double_bed` — see the header for why the pillow count is a property of
 * the footprint rather than of the category name.
 */
function drawBedFrame(r: Rect, g: GlyphCtx): SceneNode[] {
  // Mattress, then the headboard as a band across the back. Both take the body fill: the
  // headboard reads as a band because of its outline, not because of a second colour.
  g.poly(rectPoly(r), g.body);
  g.poly(rectPoly({ x: r.x, y: r.y, w: r.w, h: r.h * 0.06 }), g.body);

  // Pillows sit just clear of the headboard band, drawn in the light (basin) fill so they
  // read against the mattress. The corner radius is a fraction of the pillow's own height,
  // so a pillow stays pillow-shaped whatever the bed's proportions.
  const pillowH = r.h * 0.14;
  const pillowY = r.y + r.h * 0.09;
  const pillow = (x: number, w: number): void =>
    g.poly(roundedRectPoly({ x, y: pillowY, w, h: pillowH }, pillowH * 0.35), g.basin);
  if (r.h > 0 && r.w / r.h >= PILLOW_TWO_ASPECT) {
    // Two, symmetric: 0.09 margin, 0.38 pillow, 0.06 gap, 0.38 pillow, 0.09 margin.
    const pw = r.w * 0.38;
    pillow(r.x + r.w * 0.09, pw);
    pillow(r.x + r.w * 0.53, pw);
  } else {
    pillow(r.x + r.w * 0.2, r.w * 0.6);
  }

  // The turned-down sheet: two full-width rules with a fold diagonal running back from the
  // right edge between them — the coverlet convention on a drafted plan.
  const yTop = r.y + r.h * 0.32;
  const yBot = r.y + r.h * 0.36;
  g.seg({ x: r.x, y: yTop }, { x: r.x + r.w, y: yTop }, "extraThin");
  g.seg({ x: r.x, y: yBot }, { x: r.x + r.w, y: yBot }, "extraThin");
  g.seg({ x: r.x + r.w, y: yTop }, { x: r.x + r.w * 0.78, y: yBot }, "extraThin");
  return g.nodes;
}

/** The single bed: mattress, one pillow at the head, turned-down coverlet. */
export function drawBed(r: Rect, g: GlyphCtx): SceneNode[] {
  return drawBedFrame(r, g);
}

/** The double bed — the same drawing; its wider footprint is what earns it the second pillow. */
export function drawDoubleBed(r: Rect, g: GlyphCtx): SceneNode[] {
  return drawBedFrame(r, g);
}

/**
 * The nightstand: a carcass, its top outline, the lamp standing at the BACK, and the drawer
 * front with its handle facing the room.
 *
 * The old symbol was a carcass, an inset rectangle and a ring in the dead centre, which at
 * plan scale is a box with a dot in it — it said nothing about which way the piece faces, on a
 * category the catalog calls `directional`. Both additions fix that in the drawing rather than
 * in a flag: the lamp is pushed into the back third (where a lamp stands, against the wall) and
 * the drawer band with its handle tick is on the FRONT edge (where you open it from). A
 * nightstand drawn with the handle against the wall has been turned round, and now the drawing
 * shows it.
 *
 * Prim count: 6.
 */
export function drawNightstand(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, Math.min(r.w, r.h));
  g.poly(rectPoly(r), g.body);
  g.poly(rectPoly(insetRect(r, 0.1)), "none", "extraThin");
  // The lamp: a ring with its bulb, standing in the back third.
  const lamp = { x: r.x + r.w / 2, y: r.y + r.h * 0.3 };
  g.ring(lamp, s * 0.2, "extraThin");
  g.dot(lamp, s * 0.06, g.stroke, "extraThin");
  // The drawer front on the room side, and the handle centred on it.
  const drawerY = r.y + r.h * 0.66;
  g.seg({ x: r.x, y: drawerY }, { x: r.x + r.w, y: drawerY }, "extraThin");
  g.seg({ x: r.x + r.w * 0.34, y: r.y + r.h * 0.85 }, { x: r.x + r.w * 0.66, y: r.y + r.h * 0.85 }, "extraThin");
  return g.nodes;
}

/** How far in from each end of the carcass the hanging rail stops, as a fraction of the width. */
const RAIL_END_INSET = 0.05;

/** The deepest a scallop may bow below the rail, as a fraction of the carcass depth. */
const SCALLOP_DEPTH_CAP = 0.42;

/**
 * How many clothes-hanger scallops hang from the rail: roughly three per two units of aspect,
 * held to `[3, 12]`. A square-ish carcass takes the floor of 3 (fewer would not read as a run)
 * and a very long one the ceiling of 12 (more would close up into a solid band at plan scale).
 * A non-positive depth yields the floor rather than a `NaN` count.
 */
function scallopCount(r: Rect): number {
  return clamp(Math.floor((r.h > 0 ? r.w / r.h : 0) * 1.5), 3, 12);
}

/** The wardrobe: a carcass, the hanging rail at mid-depth with its scalloped hangers, and the
 *  centre door split. */
export function drawWardrobe(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);

  const railY = r.y + r.h / 2;
  const x0 = r.x + r.w * RAIL_END_INSET;
  const x1 = r.x + r.w * (1 - RAIL_END_INSET);
  g.seg({ x: x0, y: railY }, { x: x1, y: railY }, "extraThin");

  // One semicircle per cell, centred in its cell and bowing DOWN off the rail. `sweep: 0`
  // is what puts the bulge below: SVG measures its sweep from +x toward +y, so travelling
  // from the left endpoint to the right one in the DECREASING direction passes through the
  // +y (screen-down) side of the circle. The endpoints are the centre ± the radius along x,
  // which needs no trig and stays byte-exact.
  const n = scallopCount(r);
  const cell = (x1 - x0) / n;
  const rad = Math.min(cell / 2, r.h * SCALLOP_DEPTH_CAP);
  if (rad > 0) {
    for (let i = 0; i < n; i++) {
      const cx = x0 + cell * (i + 0.5);
      g.arcSeg({ x: cx, y: railY }, rad, { x: cx - rad, y: railY }, { x: cx + rad, y: railY }, 0, "extraThin");
    }
  }

  g.seg({ x: r.x + r.w / 2, y: r.y }, { x: r.x + r.w / 2, y: r.y + r.h }, "extraThin");
  return g.nodes;
}

// ---------------------------------------------------------------------------
// ── v1.32 F2: bedroom ──
//
// Four families the bedroom vocabulary was missing. Appended at the foot of the file for the
// same reason they are appended to `FIXTURE_FAMILIES`: that table's order is the LEGEND's
// order, so slotting `dresser` in beside `wardrobe` would re-order the legend of every shipped
// plan that draws a robe.

/**
 * The bunk bed: the lower mattress with its pillow at the head, the upper bunk drawn DASHED
 * above it, and the ladder rungs at the foot.
 *
 * **The upper bunk is dashed, and that is the drawing's one existing convention rather than a
 * new one.** A dashed outline in this repository means *above the horizontal cut a floor plan
 * is taken at* — it is what `upper_cabinet` has always meant, what `roof` and `void` ship, and
 * what the outdoor `pergola` and the `shed`'s ridge say. An upper bunk is exactly that: present
 * in the room, cut through by nothing. Drawing it solid would claim the room has two mattresses
 * of floor area, which is the one thing a plan must not say about a bunk.
 *
 * The ladder is at the FOOT (the bottom edge), which is where it goes and which is also what
 * keeps the head clear for the pillow — so the symbol says which end is which without a label,
 * on a category the catalog calls `directional`.
 *
 * Prim count: 6.
 */
export function drawBunkBed(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  // The upper bunk: inset all round, stopping clear of the ladder band at the foot.
  const upper = { x: r.x + r.w * 0.07, y: r.y + r.h * 0.04, w: r.w * 0.86, h: r.h * 0.78 };
  dashedPoly(g, roundedRectPoly(upper, Math.min(upper.w, upper.h) * 0.06), "none", "extraThin");
  // The pillow on the lower bunk, at the head.
  const pillowH = r.h * 0.12;
  g.poly(
    roundedRectPoly({ x: r.x + r.w * 0.18, y: r.y + r.h * 0.07, w: r.w * 0.64, h: pillowH }, pillowH * 0.35),
    g.basin,
    "extraThin",
  );
  // The ladder: three rungs across the foot end, inside the footprint.
  for (const f of [0.87, 0.91, 0.95]) {
    g.seg({ x: r.x + r.w * 0.32, y: r.y + r.h * f }, { x: r.x + r.w * 0.68, y: r.y + r.h * f }, "extraThin");
  }
  return g.nodes;
}

/**
 * The crib / cot: the carcass, the mattress inside it, and the rail bars down both long faces.
 *
 * The bars are the symbol — a crib without them is a small `bed` with no pillow — and they are
 * drawn on the two LONG faces read off the footprint rather than off the page, so a cot turned
 * against a side wall draws the same object instead of a different one. Their count comes from
 * the aspect and is clamped to `[3, 7]`: at the clamp ceiling they read as a rail, and past it
 * they close into a solid band at plan scale.
 *
 * `directional` follows the `bed` precedent: the head end is the top edge, which is what an
 * `anchor top` derives a quarter-turn from.
 *
 * Prim count: `2 + 2 x bars`, i.e. 12 at the catalogued 700x1300.
 */
export function drawCrib(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const mat = insetRect(r, 0.14);
  g.poly(rectPoly(mat), g.basin, "extraThin");
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const bars = clamp(Math.round((long / Math.max(1e-9, Math.min(r.w, r.h))) * 2.5), 3, 7);
  for (let i = 0; i < bars; i++) {
    const t = (i + 0.5) / bars;
    if (horizontal) {
      const x = r.x + r.w * t;
      g.seg({ x, y: r.y }, { x, y: mat.y }, "extraThin");
      g.seg({ x, y: mat.y + mat.h }, { x, y: r.y + r.h }, "extraThin");
    } else {
      const y = r.y + r.h * t;
      g.seg({ x: r.x, y }, { x: mat.x, y }, "extraThin");
      g.seg({ x: mat.x + mat.w, y }, { x: r.x + r.w, y }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The dresser / chest of drawers: the carcass, the drawer band on the room side, its two
 * division lines, and a handle tick in each of the three drawers.
 *
 * A chest is a box, so everything that makes it read as one is inside it — and all of it is on
 * the FRONT (bottom) half, which is the orientation claim. A dresser drawn with its drawers
 * against the wall has been turned round, and it is the only thing separating this symbol from
 * a `bookshelf` of the same proportions.
 *
 * Prim count: 7.
 */
export function drawDresser(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const bandY = r.y + r.h * 0.55;
  g.seg({ x: r.x, y: bandY }, { x: r.x + r.w, y: bandY }, "extraThin");
  for (const f of [1 / 3, 2 / 3]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: bandY }, { x, y: r.y + r.h }, "extraThin");
  }
  for (let i = 0; i < 3; i++) {
    const cx = r.x + (r.w * (i + 0.5)) / 3;
    const half = (r.w / 3) * 0.2;
    g.seg({ x: cx - half, y: r.y + r.h * 0.86 }, { x: cx + half, y: r.y + r.h * 0.86 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The vanity / dressing table: the top, the mirror band DASHED across the wall side, and the
 * stool sitting in front of it.
 *
 * The mirror is dashed for the reason the bunk's upper deck is: it stands on the table, above
 * the cut plane, so drawing it solid would claim a piece of the room's section that is not
 * there. The stool is drawn INSIDE the footprint even though a real one is pulled out — the
 * footprint is what every clearance and collision rule measures, and a symbol that drew outside
 * it would make the drawing and `arch lint` disagree about where the piece is. That is the same
 * call `drawCar` makes about its wing mirrors, and the catalogued 600 mm `clearanceMm` is what
 * actually reserves the room to sit down.
 *
 * Prim count: 5.
 */
export function drawVanity(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const mirror = { x: r.x + r.w * 0.14, y: r.y + r.h * 0.05, w: r.w * 0.72, h: r.h * 0.16 };
  dashedPoly(g, rectPoly(mirror), "none", "extraThin");
  g.seg(
    { x: mirror.x + mirror.w / 2, y: mirror.y },
    { x: mirror.x + mirror.w / 2, y: mirror.y + mirror.h },
    "extraThin",
  );
  // Floored at 0: a negative extent would otherwise ask for a circle of negative radius.
  const rad = Math.max(0, Math.min(r.w * 0.12, r.h * 0.18));
  const stool = { x: r.x + r.w / 2, y: r.y + r.h - rad - r.h * 0.04 };
  g.ring(stool, rad, "extraThin");
  g.ring(stool, rad * 0.55, "extraThin");
  return g.nodes;
}
