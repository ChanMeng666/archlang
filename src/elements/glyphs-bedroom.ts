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
import { insetRect, rectPoly, roundedRectPoly } from "./glyph-lib.js";

/**
 * `v` held inside `[lo, hi]`.
 *
 * Written as two `>` comparisons rather than `Math.min`/`Math.max` so that a `NaN` — which a
 * degenerate footprint can produce upstream — resolves to `lo` instead of propagating. A glyph
 * must survive any rect the fuzzer hands it without emitting a `NaN` coordinate.
 *
 * Local to this module on purpose: it is the first of its kind here. If a second domain module
 * needs it, it belongs in `glyph-lib.ts` (a Phase-2 consolidation note, not a Phase-1 edit).
 */
function clamp(v: number, lo: number, hi: number): number {
  return v > hi ? hi : v > lo ? v : lo;
}

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

/** The nightstand: a carcass, its drawer front, and the lamp on top. */
export function drawNightstand(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  g.poly(rectPoly(insetRect(r, 0.12)), g.body, "extraThin");
  g.ring({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, Math.max(0, Math.min(r.w, r.h)) * 0.18, "extraThin");
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
