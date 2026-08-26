/**
 * Kitchen and utility plan symbols: the sink run, the worktop, the hob, the fridge, the
 * built-in appliances and the overhead cabinet.
 *
 * The four symbols that shipped before this module was written (sink, counter, stove,
 * fridge) started as verbatim moves out of `fixtures-glyphs.ts`; they are now REFINED —
 * every one draws more than it did, and their bytes move on purpose. What changed and why:
 *
 * - **A pen hierarchy.** The outline of a piece is `thin`; anything *inside* it — a nosing,
 *   a drain, a carcass line, a control rail — is `extraThin`. Before, a counter's nosing was
 *   drawn at the same weight as its own outline, so the slab read as two stacked boxes.
 * - **Round things are round.** A burner is a `circle` primitive, not the 24-gon
 *   `ellipsePoly` returns. Every backend already serializes `circle` natively (and
 *   `rotateNode` turns one by moving its centre), so this is a fidelity gain with no
 *   per-backend code — the same argument `door-panels.ts` makes for its own budget.
 * - **Filled shapes stay polygons.** A basin is a `roundedRectPoly`, not a path with a
 *   corner radius: there is no rounded-rect primitive and inventing one would need four
 *   backends to agree about it.
 *
 * ## The one absolute in this file
 *
 * Every measure below is a FRACTION of the footprint, so a symbol survives any size the
 * catalogue or an author gives it. {@link CABINET_PITCH_MM} is the single exception, and it
 * has to be: base cabinets come in 600 mm units, and the division ticks that make a counter
 * read as cabinetry rather than a plank are spaced by that real-world module, not by a
 * fraction of however long the run happens to be. It is guarded — see {@link drawCounter} —
 * so a legend swatch or any run under two modules simply has no ticks, rather than a dense
 * hatch of them.
 *
 * Symbols draw with their back (the side placed against a wall) along the TOP edge;
 * `furniture.render()` quarter-turns the result about the footprint centre. Every function
 * is a pure, deterministic function of (rect, theme, sizes) — no clock, no randomness — and
 * every one must survive a degenerate footprint (the `hasFixtureGlyph` probe asks with a
 * 1×1 rect, and the fuzz asks with 10000×10) without throwing or producing a NaN.
 */

import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { centerOf, dashedPoly, insetRect, rectPoly, roundedRectPoly, shortSide } from "./glyph-lib.js";

/**
 * The base-cabinet module, in millimetres — the one sanctioned absolute in this file.
 *
 * 600 mm is the near-universal carcass width (GB/T, DIN and the trade all land on it), and
 * a worktop's division ticks are only truthful at that pitch: they say "this run is five
 * cabinets", which a fractional spacing cannot.
 */
export const CABINET_PITCH_MM = 600;

/**
 * Hard ceiling on the number of division ticks any one run may draw.
 *
 * A counter longer than 64 modules (38.4 m) is not a kitchen; it is a fuzz sample or a typo.
 * The cap keeps the primitive count bounded for any footprint rather than trusting the
 * caller's arithmetic — the same reason the repeat count is derived and clamped instead of
 * looped to the rect's edge.
 */
const MAX_DIVISIONS = 64;

/**
 * An unfilled `extraThin` rectangle inset from `r` by `frac` of its short side — the carcass
 * line that makes an appliance read as a box with a door rather than a blank slab.
 *
 * Unfilled on purpose: it is drawn OVER the body polygon, so a fill would repaint it and
 * hide anything already drawn underneath.
 *
 * Kitchen-local on purpose: unlike the geometry helpers this module used to carry, it is not a
 * shape but an appliance-drawing convention, and it has one domain.
 */
function insetOutline(g: GlyphCtx, r: Rect, frac: number): void {
  g.poly(rectPoly(insetRect(r, frac)), "none", "extraThin");
}

// ---------------------------------------------------------------------------
// Kitchen

/**
 * Counter slab, two eased basins each with a drain, and a tap with its spout at the back.
 *
 * The tap's radius is keyed to the SHORT side, not to the width the drafting convention
 * would suggest: on a 3 m × 600 mm sink run `0.03 × w` is a 90 mm disc that hangs clean off
 * the back edge of its own footprint.
 */
export function drawKitchenSink(r: Rect, g: GlyphCtx): SceneNode[] {
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);

  const m = shortSide(r) * 0.14;
  const bw = (r.w - 3 * m) / 2;
  const bh = r.h - 2 * m - r.h * 0.12;
  const by = r.y + m + r.h * 0.12;
  const bowlRad = Math.min(bw, bh) * 0.08;
  const drainR = Math.min(bw, bh) * 0.12;
  for (const bx of [r.x + m, r.x + 2 * m + bw]) {
    const bowl: Rect = { x: bx, y: by, w: bw, h: bh };
    g.poly(roundedRectPoly(bowl, bowlRad), g.basin);
    g.dot(centerOf(bowl), drainR, g.body, "extraThin");
  }

  const tapR = shortSide(r) * 0.03;
  const tapCy = r.y + r.h * 0.06;
  g.dot({ x: cx, y: tapCy }, tapR);
  g.seg({ x: cx, y: tapCy }, { x: cx, y: r.y + r.h * 0.28 }, "extraThin");
  return g.nodes;
}

/**
 * A worktop: the slab, an `extraThin` nosing line set in from the front edge, and one
 * division tick per base-cabinet module below it.
 *
 * The ticks are what distinguish a run of cabinetry from a plank, and they are the one place
 * this file measures in real millimetres ({@link CABINET_PITCH_MM}). The guard is the point
 * of the design: a run shorter than TWO modules gets none, so a legend swatch — which is
 * drawn at whatever size the legend cell is — degrades to the plain symbol instead of
 * turning into a comb. Tick `k` sits strictly inside the run, so the last one never lands on
 * the front-right corner and doubles the outline.
 */
export function drawCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const nosingY = r.y + r.h * 0.82;
  g.seg({ x: r.x, y: nosingY }, { x: r.x + r.w, y: nosingY }, "extraThin");

  if (Number.isFinite(r.w) && r.w / CABINET_PITCH_MM >= 2) {
    const count = Math.min(Math.ceil(r.w / CABINET_PITCH_MM) - 1, MAX_DIVISIONS);
    for (let k = 1; k <= count; k++) {
      const x = r.x + k * CABINET_PITCH_MM;
      g.seg({ x, y: r.y }, { x, y: nosingY }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A hob: the slab, four burners as concentric true circles, and the control rail across the
 * front.
 *
 * Each burner is an outline ring at `thin` with an `extraThin` inner ring at 0.6 of it —
 * the pan-support read. They were 24-gons filled white; a `circle` primitive is exact at any
 * zoom and native in the CAD export.
 */
export function drawStove(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const br = shortSide(r) * 0.16;
  for (const bx of [r.x + r.w * 0.3, r.x + r.w * 0.7]) {
    for (const by of [r.y + r.h * 0.3, r.y + r.h * 0.7]) {
      g.ring({ x: bx, y: by }, br);
      g.ring({ x: bx, y: by }, br * 0.6, "extraThin");
    }
  }
  const railY = r.y + r.h * 0.92;
  g.seg({ x: r.x, y: railY }, { x: r.x + r.w, y: railY }, "extraThin");
  return g.nodes;
}

/** A carcass, the freezer/fridge door split, and a door-handle stub. */
export function drawFridge(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.05);
  g.seg({ x: r.x, y: r.y + r.h * 0.36 }, { x: r.x + r.w, y: r.y + r.h * 0.36 });
  g.seg({ x: r.x + r.w * 0.86, y: r.y + r.h * 0.12 }, { x: r.x + r.w * 0.86, y: r.y + r.h * 0.28 });
  return g.nodes;
}

/** A wall oven: carcass, door line across the front, and the door window. */
export function drawOven(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.1);
  const doorY = r.y + r.h * 0.85;
  g.seg({ x: r.x, y: doorY }, { x: r.x + r.w, y: doorY }, "extraThin");
  g.ring({ x: r.x + r.w / 2, y: r.y + r.h * 0.45 }, shortSide(r) * 0.22);
  return g.nodes;
}

/** A dishwasher: carcass plus the door dial that tells it from a blank base unit. */
export function drawDishwasher(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);
  g.ring(centerOf(r), shortSide(r) * 0.2);
  return g.nodes;
}

/**
 * A kitchen island: a slab with its overhang nosing on ALL FOUR sides.
 *
 * That is the whole symbol, and the four-sided nosing is what says "island" — a run against
 * a wall ({@link drawCounter}) noses on one edge only. Seating around it is a `stool`, a
 * separate category with its own footprint and its own lint.
 */
export function drawIsland(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.06);
  return g.nodes;
}

/**
 * An upper (wall) cabinet — the ONLY glyph in this file whose every node is dashed.
 *
 * A wall cabinet hangs above the horizontal cut a floor plan is taken at, so drafting
 * convention draws it dashed: present, but not cut. Both nodes carry `lineType: "dashed"`,
 * and the body is unfilled so the base cabinet or appliance it overhangs still reads
 * through it — which is the entire reason the convention exists.
 */
export function drawUpperCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  dashedPoly(g, rectPoly(r), "none");
  const midY = r.y + r.h * 0.5;
  g.seg({ x: r.x, y: midY }, { x: r.x + r.w, y: midY }, "extraThin", true);
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Utility

/** A washing machine: carcass, the door, and the drum inside it. */
export function drawWasher(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);
  const c = centerOf(r);
  const s = shortSide(r);
  g.ring(c, s * 0.3);
  g.ring(c, s * 0.18, "extraThin");
  return g.nodes;
}

/**
 * A tumble dryer: the washer's carcass and door, with three chords across the drum where the
 * washer has an inner ring.
 *
 * The two appliances are the same box at the same size and sit side by side in most
 * utility rooms, so they need to differ by SHAPE — a glyph carries no text (the fixture
 * label is drawn by the caller, and only when there is no symbol), so a letter is not
 * available to tell them apart even if it were good drafting.
 */
export function drawDryer(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  insetOutline(g, r, 0.08);
  const c = centerOf(r);
  const drum = shortSide(r) * 0.3;
  g.ring(c, drum);
  for (const f of [-0.45, 0, 0.45]) {
    const dy = drum * f;
    const half = Math.sqrt(Math.max(drum * drum - dy * dy, 0)) * 0.85;
    g.seg({ x: c.x - half, y: c.y + dy }, { x: c.x + half, y: c.y + dy }, "extraThin");
  }
  return g.nodes;
}
