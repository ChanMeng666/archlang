/**
 * Kitchen and utility plan symbols: the sink run, the worktop, the hob, the fridge, the
 * built-in appliances and the overhead cabinet.
 *
 * Every symbol is drawn in the visual-polish language the pilot symbols set:
 *
 * - **A pen hierarchy that is also a tone hierarchy.** The OUTLINE of a piece is `thin` (drawn
 *   in the derived symbol ink); anything *inside* it — a worktop edge, a burner, a drain, a
 *   groove, a handle's seat — is `extraThin` (drawn in the lighter detail tone). A hard carcass
 *   is `g.body`; a sunk or glazed surface — a bowl, an oven window, a control strip — is
 *   `g.basin` (white).
 * - **Round things are round.** A burner, a knob and a drain is a true `circle`; a bowl, a
 *   drum and a door window is a `roundedRectPath` or a circle, never a tessellated polygon.
 *   Every backend already serializes `circle` and `path` natively.
 * - **Dashes only for what is above the cut plane.** The overhead cabinet and the extract hood
 *   are dashed all the way round; nothing else here dashes anything.
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
 * ## Handedness
 *
 * The symmetric appliances stay mirror-symmetric (a hob's burners are the one exception: the
 * large pair stands on one diagonal and the small pair on the other, as every drafted range
 * block draws it, so the hob — and the stove, island and range that carry one — are handed). A
 * sink with a drainer, a washer with its dial, a microwave with its keypad and an island with
 * its hob or bowl at one end are handed too, deliberately: the drawing says which end the
 * feature is on, and a mirrored `place` mirrors it.
 *
 * Symbols draw with their back (the side placed against a wall) along the TOP edge;
 * `furniture.render()` quarter-turns the result about the footprint centre. Every function
 * is a pure, deterministic function of (rect, theme, sizes) — no clock, no randomness — and
 * every one must survive a degenerate footprint (the `hasFixtureGlyph` probe asks with a
 * 1×1 rect, and the fuzz asks with 10000×10) without throwing or producing a NaN.
 */

import type { Point } from "../ast.js";
import { weightWidth } from "../scene.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, GlyphWeight, Rect } from "./glyph-lib.js";
import {
  centerOf,
  clamp,
  dashedPattern,
  dashedPoly,
  insetRect,
  insetRectSides,
  rectPoly,
  roundedRectPath,
  shortSide,
} from "./glyph-lib.js";

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

/** A straight run across the full width of `r` at height `y`. */
function across(g: GlyphCtx, r: Rect, y: number, weight: GlyphWeight = "extraThin", dashed = false): void {
  g.seg({ x: r.x, y }, { x: r.x + r.w, y }, weight, dashed);
}

/**
 * A DASHED circle. {@link GlyphCtx.ring} has no dashed form, and a dashed ring is the one thing a
 * hood's fan needs, so this builds the node the way `dashedPoly` builds a polygon: it names the
 * line type AND hands the same pattern as `paint.dash`, so the SVG (which follows the name) and
 * the PDF (which follows the number) draw one dash between them.
 */
function dashedRing(g: GlyphCtx, center: Point, r: number, weight: GlyphWeight = "extraThin"): void {
  g.nodes.push({
    layer: "furniture",
    prim: { t: "circle", center, r },
    paint: { fill: "none", stroke: g.tone(weight), width: weightWidth(weight, g.sizes), dash: dashedPattern(g.sizes) },
    lineWeight: weight,
    lineType: "dashed",
  });
}

/**
 * Four burners on a 2 × 2 grid inside `area`: the LARGE pair on one diagonal (top-left and
 * bottom-right) and the SMALL pair on the other, each a ring — or, drawn `double`, two
 * concentric rings, the outer the pan support and the inner the flame.
 *
 * It is the arrangement every drafted range block uses (the two sizes sit on the diagonals so
 * no two large burners crowd one another), which is also why it is handed. The radii are keyed
 * to the smaller half-cell, so the burners clear one another and the area's edge at any aspect.
 *
 * Prim count: 4, or 8 when `double`.
 */
function drawBurners(g: GlyphCtx, area: Rect, double: boolean): void {
  const cw = area.w / 2;
  const ch = area.h / 2;
  const m = Math.min(cw, ch);
  const burners: readonly (readonly [number, number, number])[] = [
    [0.5, 0.5, 0.4],
    [1.5, 0.5, 0.29],
    [0.5, 1.5, 0.29],
    [1.5, 1.5, 0.4],
  ];
  for (const [i, j, k] of burners) {
    const c: Point = { x: area.x + cw * i, y: area.y + ch * j };
    g.ring(c, m * k, "extraThin");
    if (double) g.ring(c, m * k * 0.55, "extraThin");
  }
}

/**
 * A sunk bowl: a rounded rectangle (corners 10% of its short side) in the basin fill with its
 * waste on the centre — a white disc in the detail pen, so it reads as a ring in the bowl and
 * not as a spot. The bowl of a kitchen sink, a laundry tub and an island's prep sink.
 *
 * Prim count: 2.
 */
function sinkBowl(g: GlyphCtx, bowl: Rect): void {
  const m = shortSide(bowl);
  g.path(roundedRectPath(bowl, m * 0.1), g.basin);
  g.dot(centerOf(bowl), m * 0.065, g.basin, "extraThin");
}

/**
 * A tap seen from above: its base (a ring) and the spout swung out from it (a short stroke)
 * toward the bowl. Both are detail.
 *
 * Prim count: 2.
 */
function tap(g: GlyphCtx, base: Point, radius: number, spoutTo: number): void {
  g.ring(base, radius, "extraThin");
  g.seg({ x: base.x, y: base.y + radius }, { x: base.x, y: spoutTo }, "extraThin");
}

// ---------------------------------------------------------------------------
// Kitchen

/**
 * A sink unit: the worktop, one bowl or two with a waste each, a **drainer board** with its
 * grooves, and the tap with its spout at the back.
 *
 * The layout is read off the footprint, on the evidence-not-guess rule the range and the island
 * follow: a run at least 1.2 times as wide as it is deep (the catalogued 800 x 600 is 1.33) is a
 * sink with a drainer, narrower is a bowl alone; a run at least 2.4 times as wide takes a second
 * bowl. Neither is invented — the alternative is one drawing that is wrong for half the sinks
 * anyone draws.
 *
 * - **Worktop** (body fill, outline pen): the first node.
 * - **Bowls** (white, outline pen): rounded rectangles, corners 10% of the bowl, inside a rim 7%
 *   of the short side wide and below a tap deck 20% of the depth, each with a waste disc.
 * - **Drainer** (detail pen): a recessed board on the right, 30% of the width, and five grooves
 *   running toward the bowl. It is the one handed part of the symbol, on purpose.
 * - **Tap** (detail pen): a base ring on the deck, centred over the bowls, and its spout.
 *
 * Every measure is a fraction of a footprint axis or of the short side, and every inset is a
 * multiple of the short side, so nothing escapes a 10000 x 10 rect.
 *
 * Prim count: 5 (a bowl alone), 11 (bowl and drainer), 13 (two bowls and a drainer).
 */
export function drawKitchenSink(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(rectPoly(r), g.body);

  const drainer = r.w * 10 >= r.h * 12;
  const bowls = r.w * 10 >= r.h * 24 ? 2 : 1;
  const m = s * 0.07;
  const gap = s * 0.06;
  const ix0 = r.x + m;
  const iw = r.w - 2 * m;
  const top = r.y + r.h * 0.2;
  const bh = r.y + r.h - m - top;
  const dw = drainer ? iw * 0.3 : 0;
  const zone = iw - dw - (drainer ? gap : 0);
  const bw = (zone - (bowls - 1) * gap) / bowls;

  for (let k = 0; k < bowls; k++) sinkBowl(g, { x: ix0 + k * (bw + gap), y: top, w: bw, h: bh });

  if (drainer) {
    const board: Rect = { x: ix0 + zone + gap, y: top, w: dw, h: bh };
    g.path(roundedRectPath(board, shortSide(board) * 0.08), "none", "extraThin");
    for (let k = 1; k <= 5; k++) {
      const y = board.y + (bh * k) / 6;
      g.seg({ x: board.x + dw * 0.12, y }, { x: board.x + dw * 0.88, y }, "extraThin");
    }
  }

  const tapX = ix0 + zone / 2;
  const base = { x: tapX, y: r.y + r.h * 0.105 };
  tap(g, base, s * 0.035, bowls === 1 ? top + bh * 0.2 : r.y + r.h * 0.19);
  return g.nodes;
}

/**
 * A worktop: the slab, an `extraThin` upstand line near the back and an `extraThin` front-edge
 * line near the front, and one division tick per base-cabinet module between the two.
 *
 * The two lines are what make a slab read as a worktop: the back one is the splashback's face,
 * the front one the edge of the top where it overhangs the doors. The ticks are what distinguish
 * a run of cabinetry from a plank, and they are the one place this file measures in real
 * millimetres ({@link CABINET_PITCH_MM}). The guard is the point of the design: a run shorter
 * than TWO modules gets none, so a legend swatch — which is drawn at whatever size the legend
 * cell is — degrades to the plain symbol instead of turning into a comb. Tick `k` sits strictly
 * inside the run, so the last one never lands on the front-right corner and doubles the outline.
 *
 * Prim count: 3, plus one per module boundary (at most 64).
 */
export function drawCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const upstandY = r.y + r.h * 0.045;
  const edgeY = r.y + r.h * 0.94;
  across(g, r, upstandY);
  across(g, r, edgeY);

  if (Number.isFinite(r.w) && r.w / CABINET_PITCH_MM >= 2) {
    const count = Math.min(Math.ceil(r.w / CABINET_PITCH_MM) - 1, MAX_DIVISIONS);
    for (let k = 1; k <= count; k++) {
      const x = r.x + k * CABINET_PITCH_MM;
      g.seg({ x, y: upstandY }, { x, y: edgeY }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A hob: the slab, the glass plate let into it, four burners on the diagonals and the row of
 * control knobs along the front.
 *
 * - **Slab** (body fill, outline pen): the cooker — the first node.
 * - **Plate** (detail pen): the cooking surface, a rounded rectangle 6% of the short side in from
 *   the sides and the back and ending at 74% of the depth.
 * - **Burners** (detail pen): {@link drawBurners} with two concentric rings each — the large pair
 *   on the back-left / front-right diagonal and the small pair on the other.
 * - **Knobs** (detail pen): four discs along the front band, evenly spread.
 *
 * Prim count: 14.
 */
export function drawStove(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(rectPoly(r), g.body);
  const plate: Rect = { x: r.x + s * 0.06, y: r.y + s * 0.06, w: r.w - s * 0.12, h: r.h * 0.74 - s * 0.06 };
  g.path(roundedRectPath(plate, s * 0.025), "none", "extraThin");
  drawBurners(g, insetRect(plate, 0.03), true);
  for (const f of [0.2, 0.4, 0.6, 0.8]) g.dot({ x: r.x + r.w * f, y: r.y + r.h * 0.895 }, s * 0.03);
  return g.nodes;
}

/**
 * A fridge-freezer: the carcass, the door's face line near the front, and the handle bar.
 *
 * The door is the front band of the plan — a fridge's door face stands a few centimetres proud of
 * the carcass and carries the handle — so the symbol is a box with a line across its front and a
 * bar on that line. A compartment split is drawn only where the footprint says one is visible:
 * a **side-by-side** (aspect 1.4 or over, written `r.w * 10 >= r.h * 14`) is two doors, a freezer
 * a third of the width on the left and the fridge the rest, so a vertical split runs through the
 * door band. The integer form is the one the basin's double-bowl rule uses, for the same reason:
 * `1.4 * h` is not representable, so the round number an author types at the boundary would fall
 * on the wrong side of its own rule. An upright fridge-freezer's freezer drawer is behind one
 * door and is not seen from above, so it adds nothing.
 *
 * - **Carcass** (body fill, outline pen): corners eased 2% of the short side — the first node.
 * - **Door face** (detail pen): a line across the whole width at 86% of the depth.
 * - **Split** (detail pen): side-by-side only, from the door face to the front edge.
 * - **Handle** (outline pen): a bar over the front band, a third of the width, off-centre toward
 *   the opening side of a side-by-side's larger door.
 *
 * Prim count: 3, or 4 when wide.
 */
export function drawFridge(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.02), g.body);
  const faceY = r.y + r.h * 0.86;
  across(g, r, faceY);
  const barY = r.y + r.h * 0.93;
  if (r.w * 10 >= r.h * 14) {
    const x = r.x + r.w * 0.3;
    g.seg({ x, y: faceY }, { x, y: r.y + r.h });
    g.seg({ x: r.x + r.w * 0.5, y: barY }, { x: r.x + r.w * 0.82, y: barY });
  } else {
    g.seg({ x: r.x + r.w * 0.34, y: barY }, { x: r.x + r.w * 0.66, y: barY });
  }
  return g.nodes;
}

/**
 * An oven: the carcass, a control band across the back with three knobs, and the door — its
 * window and its handle bar — **plus a hob when the footprint is wide enough to be a range**
 * rather than a built-under single.
 *
 * The wide branch is not decoration. A 600 mm oven and a 900 mm range cooker are different
 * appliances, they are drawn differently on a real plan, and the footprint is the one thing
 * that tells them apart in a language where the fixture word does not. `r.w * 10 >= r.h * 16`
 * (aspect 1.6) is the threshold; below it the piece is an oven and the back band carries the
 * knobs alone, above it the hob takes the back half and the knobs move to a rail between the
 * hob and the door.
 *
 * - **Carcass** (body fill, outline pen): corners eased 2% of the short side — the first node.
 * - **Knobs** (detail pen): three discs on the control band.
 * - **Window** (white, detail pen): the door's glass, a rounded rectangle.
 * - **Handle** (outline pen): a bar across the front.
 * - **Hob** (detail pen), range only: {@link drawBurners} with one ring each, back half.
 *
 * Every offset from an edge is a fraction of the SHORT side, never of the axis it sits on —
 * so a knob 0.1 of the short side down from the back edge cannot escape a 10000 x 10
 * footprint, which keying it to `r.h` would not survive.
 *
 * Prim count: 6 for an oven, 10 for a range.
 */
export function drawOven(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const range = r.w * 10 >= r.h * 16;
  g.path(roundedRectPath(r, s * 0.02), g.body);

  if (range) {
    drawBurners(g, { x: r.x + r.w * 0.1, y: r.y + s * 0.08, w: r.w * 0.8, h: r.h * 0.4 }, false);
  }

  const knobR = Math.min(s * 0.028, r.w * 0.04, r.h * 0.04);
  const knobY = range ? r.y + r.h * 0.57 : r.y + s * 0.1;
  for (const f of [0.34, 0.5, 0.66]) g.dot({ x: r.x + r.w * f, y: knobY }, knobR);

  const win = range ? insetRectSides(r, 0.14, 0.14, 0.64, 0.16) : insetRectSides(r, 0.14, 0.14, 0.3, 0.2);
  g.path(roundedRectPath(win, shortSide(win) * 0.1), g.basin, "extraThin");
  const barY = r.y + r.h * 0.93;
  g.seg({ x: r.x + r.w * 0.2, y: barY }, { x: r.x + r.w * 0.8, y: barY });
  return g.nodes;
}

/**
 * A dishwasher: the carcass, the tub's inset panel with its two rack rails, the control strip
 * and a handle bar across the front.
 *
 * It used to be a box with a dial in the middle of it, which is a washing machine's drawing
 * and not a dishwasher's — the two stand side by side under the same worktop. What separates them
 * is where the detail SITS: a dishwasher's is a panel with racks behind a door on the front edge,
 * a washer's is a drum about its own centre.
 *
 * The door is on the FRONT (the bottom edge), which is the side a dishwasher opens to and
 * the opposite of the wall its services run in. Under this module's back-on-top convention
 * the wall is the top edge, so the leaf falls where a plan draws it and the derived
 * quarter-turn from `against wall` aims it into the room.
 *
 * - **Carcass** (body fill, outline pen): corners eased 2% of the short side — the first node.
 * - **Panel** (white, detail pen): the tub's top inset 8% of the short side, ending at 78%.
 * - **Rails** (detail pen): two lines across the panel at 30% and 50% of the depth.
 * - **Control strip** (detail pen): a line across the door at 83% of the depth.
 * - **Handle** (outline pen): a bar centred on the front, 28% of the width.
 *
 * Prim count: 6.
 */
export function drawDishwasher(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.02), g.body);
  const panel: Rect = { x: r.x + s * 0.08, y: r.y + s * 0.08, w: r.w - s * 0.16, h: r.h * 0.78 - s * 0.08 };
  g.path(roundedRectPath(panel, s * 0.02), g.basin, "extraThin");
  for (const f of [0.3, 0.5]) {
    const y = r.y + r.h * f;
    g.seg({ x: r.x + r.w * 0.18, y }, { x: r.x + r.w * 0.82, y }, "extraThin");
  }
  across(g, r, r.y + r.h * 0.83);
  const cx = r.x + r.w / 2;
  const handleY = r.y + r.h * 0.93;
  g.seg({ x: cx - r.w * 0.14, y: handleY }, { x: cx + r.w * 0.14, y: handleY });
  return g.nodes;
}

/**
 * A kitchen island: the worktop, the line the seating overhang starts at along the front, and —
 * **by aspect** — either a hob or a sink at one end.
 *
 * The old symbol was a slab with a nosing on all four sides, which is a box inside a box:
 * at plan scale it read as an empty table, and nothing about it said kitchen. The two things
 * that do say kitchen are here instead. The **overhang on one long side** is what an island is
 * for — the side you sit at — and it is what distinguishes this from {@link drawCounter}, which
 * has a wall behind it. The **end fitting** follows the footprint, on the same evidence-not-guess
 * rule {@link drawOven}'s range branch follows: a long island (aspect 1.8 or over, written
 * `r.w * 10 >= r.h * 18`) is a run with a hob dropped into it; a compact one is the prep island
 * with a bowl and its tap. Neither is invented — the alternative is one drawing that is wrong for
 * the other half of the islands anyone draws.
 *
 * - **Worktop** (body fill, outline pen): corners eased 1.5% of the short side — the first node.
 * - **Overhang line** (detail pen): across the whole width at 76% of the depth, the front of
 *   the cabinets under the top.
 * - **Hob** (detail pen), long: a plate and {@link drawBurners} (two rings each), left-hand end.
 * - **Bowl** (outline pen), compact: {@link sinkBowl} left of centre with its {@link tap}.
 *
 * **This symbol is not rotation-symmetric, and the catalog says so.** `island` used to carry
 * `symmetric: true` and the four-sided nosing made that true. A seating side is a
 * distinguishable front, so the flag came off. Nothing observable moved with it:
 * `orientationMatters` reads `(requiresWall || directional) && !symmetric`, and an island is
 * neither wall-requiring nor directional, so it still derives no rotation and still never
 * trips `W_FIXTURE_BACK_TO_ROOM` — pinned by `test/fixture-orientation.test.ts`.
 *
 * Prim count: 11 (long), 6 (compact).
 */
export function drawIsland(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.015), g.body);
  across(g, r, r.y + r.h * 0.76);
  if (r.w * 10 >= r.h * 18) {
    const ah = r.h * 0.6;
    const plate: Rect = { x: r.x + r.w * 0.06, y: r.y + r.h * 0.08, w: Math.min(r.w * 0.34, ah * 1.15), h: ah };
    g.path(roundedRectPath(plate, s * 0.02), "none", "extraThin");
    drawBurners(g, insetRect(plate, 0.06), true);
  } else {
    const bowl: Rect = { x: r.x + r.w * 0.1, y: r.y + r.h * 0.22, w: r.w * 0.38, h: r.h * 0.46 };
    sinkBowl(g, bowl);
    tap(g, { x: bowl.x + bowl.w / 2, y: r.y + r.h * 0.1 }, s * 0.03, bowl.y + bowl.h * 0.15);
  }
  return g.nodes;
}

/**
 * An upper (wall) cabinet — one of the two glyphs in this file whose every node is dashed, and
 * one that reads as cabinetry rather than as a hole in the drawing.
 *
 * A wall cabinet hangs above the horizontal cut a floor plan is taken at, so drafting
 * convention draws it dashed: present, but not cut. Every node carries `lineType: "dashed"`,
 * and the body is unfilled so the base cabinet or appliance it overhangs still reads through
 * it — which is the entire reason the convention exists.
 *
 * What makes it a cabinet: **the door face** — a dashed line across the front band at 84% of the
 * depth — and **door splits on {@link CABINET_PITCH_MM}** from back edge to front, guarded exactly as
 * {@link drawCounter}'s division ticks are (a run under two modules draws none, so a legend
 * swatch degrades to the outline and its door line instead of a comb). A dashed empty rectangle
 * on a plan is a `void`, and that is a different element.
 *
 * Prim count: 2, plus one per module boundary (at most 64).
 */
export function drawUpperCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  dashedPoly(g, rectPoly(r), "none");
  const faceY = r.y + r.h * 0.84;
  across(g, r, faceY, "extraThin", true);
  if (Number.isFinite(r.w) && r.w / CABINET_PITCH_MM >= 2) {
    const count = Math.min(Math.ceil(r.w / CABINET_PITCH_MM) - 1, MAX_DIVISIONS);
    for (let k = 1; k <= count; k++) {
      const x = r.x + k * CABINET_PITCH_MM;
      g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin", true);
    }
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Utility

/**
 * The control strip of a laundry appliance: a white band 14% of the depth across the back, inset
 * from the sides — the panel the dial and the buttons sit in. Returns the strip.
 */
function controlStrip(g: GlyphCtx, r: Rect): Rect {
  const s = shortSide(r);
  const strip: Rect = { x: r.x + s * 0.07, y: r.y + s * 0.07, w: r.w - s * 0.14, h: r.h * 0.14 };
  g.path(roundedRectPath(strip, s * 0.02), g.basin, "extraThin");
  return strip;
}

/**
 * A washing machine: the carcass, the control strip across the back with its dial, and the drum
 * — the door ring with the porthole in it.
 *
 * - **Carcass** (body fill, outline pen): corners eased 2% of the short side — the first node.
 * - **Strip** (white, detail pen): {@link controlStrip}, with a dial ring at 78% of the width and
 *   a button disc at 28%. The dial is what makes the symbol handed, as a washer's panel is.
 * - **Door ring** (outline pen): a circle 31% of the short side in radius, centred at 60% of the
 *   depth, over the front of the carcass.
 * - **Porthole** (white, detail pen): the glass, a disc at 62% of the ring — a filled white
 *   centre against {@link drawDryer}'s empty ring, a difference you see without looking twice.
 *
 * Every radius is capped against BOTH axes, not just the short side, so the drum on a
 * 10000 x 10 footprint shrinks with the depth instead of escaping through the front edge.
 *
 * Prim count: 6.
 */
export function drawWasher(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.02), g.body);

  const strip = controlStrip(g, r);
  const sy = strip.y + strip.h / 2;
  const dialR = Math.min(strip.h * 0.3, s * 0.04);
  g.ring({ x: r.x + r.w * 0.78, y: sy }, dialR, "extraThin");
  g.dot({ x: r.x + r.w * 0.28, y: sy }, dialR * 0.45);

  const drum = Math.min(s * 0.31, r.h * 0.34, r.w * 0.45);
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h * 0.6 };
  g.ring(c, drum);
  g.dot(c, drum * 0.62, g.basin, "extraThin");
  return g.nodes;
}

/**
 * A tumble dryer: the washer's carcass and control strip — with the dial on the centre line —
 * the drum with its door ring, and the lint-filter slot across the front.
 *
 * The two appliances are the same box at the same size and sit side by side in most utility
 * rooms, so they need to differ by SHAPE — a glyph carries no text (the fixture label is drawn by
 * the caller, and only when there is no symbol), so a letter is not available to tell them apart
 * even if it were good drafting. The dryer's tells are the centred dial, a drum that is an EMPTY
 * ring with a second ring close inside it (the washer's is a white disc), and the slot.
 *
 * - **Carcass** (body fill, outline pen): corners eased 2% of the short side — the first node.
 * - **Strip** (white, detail pen): {@link controlStrip}, with one dial ring in its centre.
 * - **Drum** (outline pen + detail pen): a ring 31% of the short side in radius at 58% of the
 *   depth, and the gasket ring at 84% of it.
 * - **Filter slot** (detail pen): a short rounded slot centred on the front band.
 *
 * Mirror-symmetric about the centre line. Prim count: 6.
 */
export function drawDryer(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.02), g.body);

  const strip = controlStrip(g, r);
  g.ring({ x: r.x + r.w / 2, y: strip.y + strip.h / 2 }, Math.min(strip.h * 0.3, s * 0.04), "extraThin");

  const drum = Math.min(s * 0.31, r.h * 0.33, r.w * 0.45);
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h * 0.58 };
  g.ring(c, drum);
  g.ring(c, drum * 0.8, "extraThin");
  const slotW = r.w * 0.3;
  const slotH = s * 0.04;
  g.path(
    roundedRectPath({ x: r.x + (r.w - slotW) / 2, y: r.y + r.h * 0.92 - slotH / 2, w: slotW, h: slotH }, slotH / 2),
    "none",
    "extraThin",
  );
  return g.nodes;
}

// ── kitchen & bath ──
//
// Five more kitchen and utility symbols. They are appended at the END of the module for the
// same reason `FIXTURE_FAMILIES` appends: reading order here follows the table's order, which
// is the LEGEND's order, and slotting a range hood in beside the wall cabinet it hangs above
// would put the two lists out of step for nothing.

/**
 * A laundry tub: the slab, ONE deep bowl with its step and waste, and the tap with its spout.
 *
 * The whole difference from {@link drawKitchenSink} is the count and the depth. A kitchen sink
 * has a drainer and may have two bowls; a laundry sink is one deep one, and the second line
 * inside it — the step down to the floor of the tub — is what says "deep" in a drawing that has
 * no elevation to say it in. Both take a tap at the back, because both are plumbed against a wall.
 *
 * - **Slab** (body fill, outline pen): the first node.
 * - **Bowl** (white, outline pen): {@link sinkBowl}, inset 10% from the sides, from 26% of the
 *   depth to 8% from the front.
 * - **Step** (white, detail pen): the bowl's floor, drawn in by 8% of its short side.
 * - **Tap** (detail pen): a ring and its spout at the back.
 *
 * Mirror-symmetric about the centre line. Prim count: 6.
 */
export function drawLaundrySink(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const cx = r.x + r.w / 2;
  g.poly(rectPoly(r), g.body);

  const bowl = insetRectSides(r, 0.1, 0.1, 0.26, 0.08);
  sinkBowl(g, bowl);
  const step = insetRect(bowl, 0.08);
  g.path(roundedRectPath(step, shortSide(step) * 0.08), g.basin, "extraThin");
  tap(g, { x: cx, y: r.y + r.h * 0.11 }, s * 0.035, bowl.y + shortSide(bowl) * 0.12);
  return g.nodes;
}

/**
 * A water heater / boiler: the cylinder in plan, its jacket, and two pipe stubs running back to
 * the wall.
 *
 * A cylinder seen from above is a circle, and a circle alone is a `fire_pit` or a `stool`.
 * The pipes are what make it a service: two short runs from the vessel to the back edge, the
 * one thing on this drawing that says the piece is connected to something. They also give the
 * symbol a back, which is why the catalog leaves it un-`symmetric` even though its outline
 * would map onto itself — `against wall` then derives a quarter-turn that puts the pipes into
 * the wall rather than into the room.
 *
 * The vessel is pushed toward the FRONT (`r.h - s * 0.5` from the top) so the pipe run has
 * somewhere to be — but only just far enough. Keying that offset to the short side rather
 * than to `r.h` is what keeps the circle inside a footprint of any aspect: the centre is at
 * most `0.5 s` above the bottom edge and the radius is `0.4 s`, so the two cannot cross either
 * way.
 *
 * - **Vessel** (body fill, outline pen): a circle, the first node.
 * - **Jacket** (detail pen): the inner ring at 80% of it.
 * - **Pipes** (detail pen): two strokes, each a fitting-length from the vessel to the back edge,
 *   at 30% of the radius either side of the centre line.
 *
 * Mirror-symmetric about the centre line. Prim count: 4.
 */
export function drawWaterHeater(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const rad = s * 0.4;
  const c: Point = { x: r.x + r.w / 2, y: r.y + r.h - s * 0.5 };
  g.dot(c, rad, g.body, "thin");
  g.ring(c, rad * 0.8, "extraThin");
  for (const f of [-0.3, 0.3]) {
    const x = c.x + rad * f;
    g.seg({ x, y: r.y }, { x, y: c.y - rad * Math.sqrt(1 - f * f) }, "extraThin");
  }
  return g.nodes;
}

/**
 * An extract hood over a hob: the canopy, the fan ring, four blade radials and the hub —
 * **every one of them dashed**, because a hood hangs above the cut plane exactly as
 * {@link drawUpperCabinet} does.
 *
 * A dashed outline means a thing above the cut plane, which `upper_cabinet`, `roof`, `void`, the
 * outdoor `pergola`/`shed` and the garage door's projection all already say. The two kitchen
 * pieces are told apart by what is INSIDE the outline — a cabinet's door line runs edge to edge,
 * a hood's fan is a ring about the centre — and the fan is a true circle, dashed through
 * {@link dashedRing} (the `ring` factory has no dashed form).
 *
 * - **Canopy** (dashed, outline pen): the footprint, unfilled so the hob under it reads through.
 * - **Fan** (dashed, detail pen): a ring 26% of the short side in radius, four blade radials
 *   running from the hub's ring to the fan's, and the hub ring (22% of the fan's).
 *
 * The first draft also drew the filter panel as an inset dashed rectangle; over a hob it put a
 * third dashed outline on the burners beneath, which is the clutter the dash convention exists
 * to avoid, so it is gone.
 *
 * Mirror-symmetric about the centre line and the centre across. Prim count: 7.
 */
export function drawRangeHood(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const s = shortSide(r);
  const rad = s * 0.26;
  dashedPoly(g, rectPoly(r), "none");
  dashedRing(g, c, rad);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    g.seg(
      { x: c.x + rad * 0.22 * ca, y: c.y + rad * 0.22 * sa },
      { x: c.x + rad * ca, y: c.y + rad * sa },
      "extraThin",
      true,
    );
  }
  dashedRing(g, c, rad * 0.22);
  return g.nodes;
}

/**
 * A microwave: the carcass, the door frame over the left three-quarters with its glass window,
 * and the keypad strip on the right with its three buttons.
 *
 * The asymmetry IS the symbol. A microwave is a small box, and a small box on a worktop is
 * indistinguishable from every other small box unless something says which end the door is —
 * so the window is set to one side and the buttons fill the other, which is what every one of
 * them actually looks like. That asymmetry is also what earns the `directional` flag: the
 * back has a vent and belongs against something.
 *
 * - **Carcass** (body fill, outline pen): corners eased 3% of the short side — the first node.
 * - **Door frame** (detail pen): a rounded rectangle from 7% to 72% of the width.
 * - **Window** (white, detail pen): the glass inside the frame.
 * - **Keypad** (detail pen): a strip from 77% to 93% of the width, with three buttons down it.
 *
 * The button radius is capped against BOTH axes and their spread is keyed to the SHORT side, so
 * the column stays on the panel at any aspect instead of running off the front edge.
 *
 * Prim count: 7.
 */
export function drawMicrowave(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.03), g.body);
  const frame = insetRectSides(r, 0.07, 0.28, 0.1, 0.1);
  g.path(roundedRectPath(frame, shortSide(frame) * 0.05), "none", "extraThin");
  const win = insetRect(frame, 0.1);
  g.path(roundedRectPath(win, shortSide(win) * 0.08), g.basin, "extraThin");
  const keypad = insetRectSides(r, 0.77, 0.07, 0.1, 0.1);
  g.path(roundedRectPath(keypad, shortSide(keypad) * 0.1), "none", "extraThin");
  const btnR = Math.min(s * 0.035, keypad.w * 0.25, r.h * 0.06);
  for (const k of [-1, 0, 1]) g.dot({ x: keypad.x + keypad.w / 2, y: r.y + r.h / 2 + k * s * 0.17 }, btnR);
  return g.nodes;
}

/**
 * A bar counter: the top, the line the seating overhang starts at, and one stool per roughly
 * 1.2 counter-depths of run.
 *
 * The stools are the point. A bar drawn as a slab with a nosing is a `counter`, and the
 * language already has that word; what makes a bar a bar is that you sit at it. Deriving the
 * count from the run rather than fixing it means a 1.8 m bar draws four stools and a 4 m bar
 * draws eight, which is the arrangement in both cases — and it means an author who has not
 * placed individual `stool` pieces still gets a drawing that reads.
 *
 * `clamp((r.w / r.h) * 1.2, 1, 8)` is the count, and every part of it is load-bearing. The
 * ratio is the FRONT's length against the depth, so it is scale-free. The floor of 1 is what
 * a legend swatch and the `hasFixtureGlyph` 1x1 probe get. The ceiling of 8 is what keeps the
 * primitive budget bounded on a fuzz sample. And {@link clamp} resolves `NaN` to its low
 * bound, so a zero-by-zero footprint draws one stool rather than looping on a `NaN` count.
 *
 * The seat radius is capped at `0.4 * r.w / stools` as well as at the short side: at eight
 * stools the pitch is an eighth of the run, and a radius keyed to depth alone would have the
 * end seats hanging off the ends.
 *
 * - **Top** (body fill, outline pen): the BACK 62% of the footprint — the front band is the
 *   floor you stand a stool on, and filling the whole rect (the first draft) made the stools
 *   read as holes cut in the slab. The first node.
 * - **Overhang line** (detail pen): across the top at 42% of the depth.
 * - **Stools** (white, outline pen): a seat disc each, evenly spread on the front band.
 *
 * Mirror-symmetric about the centre line. Prim count: `2 + stools`, at most 10.
 */
export function drawBarCounter(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const top: Rect = { x: r.x, y: r.y, w: r.w, h: r.h * 0.62 };
  g.poly(rectPoly(top), g.body);
  across(g, r, r.y + r.h * 0.42);

  const stools = Math.round(clamp((r.w / r.h) * 1.2, 1, 8));
  const seat = Math.min(s * 0.14, (r.w * 0.4) / stools);
  const cy = r.y + r.h - s * 0.2;
  for (let k = 0; k < stools; k++) {
    g.dot({ x: r.x + (r.w * (k + 0.5)) / stools, y: cy }, seat, g.basin, "thin");
  }
  return g.nodes;
}
