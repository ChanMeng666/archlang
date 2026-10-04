/**
 * Living- and dining-room plan symbols: seating, tables and the media wall.
 *
 * Symbols draw with their "back" (the side placed against a wall) along the TOP edge of the
 * footprint; `furniture.render()` quarter-turns the result about the footprint centre, so
 * nothing here knows which way the piece is facing. Every measure below is a FRACTION of
 * `r.w`/`r.h`, never an absolute millimetre — a sofa drawn at 1:200 on A1 and the same sofa
 * at 1:50 on A3 are the same drawing at two sizes, and a glyph that reached for a constant
 * would stop being either one.
 *
 * ## Two rules the seating pieces are built on
 *
 * **Repeat counts are clamped, and the clamp is not decoration.** A sofa's cushion divisions
 * and a dining table's chairs are derived from the footprint's ASPECT, which is the only
 * scale-free thing a glyph knows. An aspect is unbounded — the property test feeds
 * 10000 x 10 — so an underived count would emit thousands of lines into one symbol. Both go
 * through {@link clampCount}, which also swallows the `0/0` a fully degenerate rect produces:
 * `Math.round(NaN)` is `NaN` and `Math.min(6, Math.max(2, NaN))` is `NaN`, so the NaN branch
 * is explicit rather than left to arithmetic that quietly propagates it into a `<line>`.
 *
 * **The dining table's footprint INCLUDES its chairs.** `furniture dining_table … size WxH`
 * declares the whole eating zone: the table is the inner rectangle inside a chair-zone band
 * of `0.22 x min(w, h)` on all four sides, and the seats are drawn in that band. That is the
 * dimension a plan needs to check — a table you cannot pull a chair out of is not a table
 * that fits — and it is what makes `W_FIXTURE_OVERLAP`-style questions ask about the right
 * rectangle. It also means a 1200 mm table is authored as roughly 2400 mm of footprint.
 *
 * The seating pieces are free-standing (no `requiresWall`) on purpose: a sofa floated in the
 * middle of a room is a normal plan, and making it wall-requiring would raise a placement
 * warning on drawings that are correct.
 *
 * ## The second tranche: a rug, an L-sofa and a piano
 *
 * Three later arrivals sit at the foot of this file, and each of them is here because it
 * breaks one of the assumptions above rather than because it is another chair.
 *
 * **The rug is the only UNFILLED symbol, and the only one with no outline-weight line.** It
 * is an {@link import("../fixtures-catalog.js").FixtureSpec.underlay}: furniture stands on it
 * and people walk over it, so it must not occlude, must not obstruct, and must not compete
 * with the outlines of the pieces standing on it. No fill makes the first true independently
 * of source order; the detail pen throughout makes the third.
 *
 * **The L-sofa leaves a quarter of its footprint empty.** Every furniture rule measures an
 * axis-aligned box, so its empty quadrant is checked as though it were solid;
 * {@link drawSofaL} says why that is the honest choice today and what the real fix would be.
 *
 * **The piano is the only symbol whose footprint was withheld on purpose.** Giving it one
 * would make `against wall` legal, and that form would face the keyboard into the wall.
 *
 * ## The third tranche: what a room is arranged AROUND
 *
 * Eight more families sit at the very foot of the file, and they are a different kind of thing
 * from the seating above. A `fireplace` and a `radiator` are not furniture you place — they are
 * the fixed objects a living room is arranged around, and a plan that cannot draw them cannot
 * say why the sofa is where it is. The rest close gaps the first two tranches left: a
 * `sideboard` and a `shoe_cabinet` (a hall's storage), a `loveseat` and a `chaise` (the two
 * seats that are not a three-piece sofa), a `coat_rack`, and a wall-mounted `tv` — which is a
 * separate kind from `tv_unit` rather than an alias of it, because 80 mm of panel and 450 mm of
 * console are different amounts of floor.
 *
 * ## One drawing language
 *
 * Every symbol here is drawn in the visual-polish language the sofa set: the OUTLINE in the
 * thin pen and the derived symbol ink, DETAIL (joints, keys, fins, pulls, fringe) in the
 * extra-thin pen and `furnitureStroke`; hard carcasses in the body fill, soft or inner surfaces
 * (cushions, a keyboard, a glass panel, a firebox) in the white `basin`; upholstery corners at 7%
 * of the short side, hard furniture at 0–4%; true curves where a piece is curved. Nothing is
 * drawn that is hidden under something else — a table's legs, a bench's supports — because a
 * solid line says the opposite of hidden.
 *
 * Pure and deterministic: every function is a total function of (rect, ctx).
 */

import type { Point } from "../ast.js";
import type { PathEdge, PathLoop, SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import {
  centerOf,
  chairAt,
  clamp,
  clampCount,
  insetRect,
  insetRectXY,
  rectPoly,
  roundedRectPath,
  shortSide,
} from "./glyph-lib.js";

/**
 * The short side of a footprint. Every corner radius and band width below is keyed to it, so
 * a long thin piece gets an even band instead of a wedge — the rule `insetRect` already
 * follows.
 */
const short = shortSide;

/** Corner radius of an upholstered piece, as a fraction of its short side (design spec D10). */
const UPHOLSTERY_RADIUS = 0.07;

/** Depth of a seat's back band (frame + back cushions), as a fraction of the depth. */
const SEAT_BACK_BAND = 0.2;

/**
 * The upholstered-seat construction shared by the sofa, the loveseat and the armchair, with
 * the cushion count and the arm width handed IN.
 *
 * Read back to front: a rounded BODY (the frame, body fill, the outline), an ARM at each end
 * running the full depth with its outer corners on the body's own radius, a row of `cushions`
 * rounded BACK CUSHIONS in the back band, and the same number of SEAT CUSHIONS in front of
 * them. The cushions are the soft surfaces, so they take the `basin` (white) fill and the
 * detail pen, and they stand a small gap off each other and off the arms — so no cushion edge
 * ever lies on top of the outline it sits inside (a detail line drawn over an outline thins it).
 *
 * Every horizontal measure is a fraction of the width, every vertical one of the depth, and the
 * gaps and radii of the short side; the arm width is additionally held to a quarter of the width,
 * so a footprint with no width (the fuzz feeds one) draws nothing outside itself.
 *
 * Prim count: `3 + 2 × cushions`.
 */
function seatBody(r: Rect, g: GlyphCtx, cushions: number, armWidth: number): SceneNode[] {
  const s = short(r);
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const rad = s * UPHOLSTERY_RADIUS;
  const gap = s * 0.018;
  const armW = Math.min(armWidth, r.w * 0.25);
  const innerL = r.x + armW;
  const innerR = x1 - armW;

  g.path(roundedRectPath(r, rad), g.body);
  // The arms: the outer corners ride the body's radius, the inner FRONT corner is eased to
  // read as the rounded arm end, and the inner back corner is square where it meets the back.
  const armEase = Math.min(rad, armW * 0.45);
  g.path(roundedRectPath({ x: r.x, y: r.y, w: armW, h: r.h }, [rad, 0, armEase, rad]), g.body);
  g.path(roundedRectPath({ x: innerR, y: r.y, w: armW, h: r.h }, [0, rad, rad, armEase]), g.body);

  // The cushion row spans the gap-inset space between the arms; `n` equal cushions, `gap` apart.
  const rowX = innerL + gap;
  const rowW = innerR - innerL - 2 * gap;
  const cw = (rowW - (cushions - 1) * gap) / cushions;
  const backTop = r.y + r.h * 0.05;
  const backBot = r.y + r.h * SEAT_BACK_BAND;
  const seatTop = backBot + gap;
  const seatBot = y1 - r.h * 0.045;
  for (let i = 0; i < cushions; i++) {
    const x = rowX + i * (cw + gap);
    g.path(roundedRectPath({ x, y: backTop, w: cw, h: backBot - backTop }, s * 0.035), g.basin, "extraThin");
  }
  for (let i = 0; i < cushions; i++) {
    const x = rowX + i * (cw + gap);
    g.path(roundedRectPath({ x, y: seatTop, w: cw, h: seatBot - seatTop }, s * 0.045), g.basin, "extraThin");
  }
  return g.nodes;
}

/**
 * The sofa: {@link seatBody} with arms 8% of the width — held to `[0.12, 0.22]` of the depth so a
 * long sofa's arms do not swell and a short one's do not vanish — and one seat cushion per 0.62
 * depths of seat, `[1, 4]`, so the catalogue's 2.2:1 sofa gets the conventional three.
 *
 * Prim count: `3 + 2 × cushions`, i.e. 9 at the common 2000x900 and 11 at the clamp.
 */
export function drawSofa(r: Rect, g: GlyphCtx): SceneNode[] {
  const armW = clamp(r.w * 0.08, r.h * 0.12, r.h * 0.22);
  const seatW = r.w - 2 * Math.min(armW, r.w * 0.25);
  return seatBody(r, g, clampCount(seatW / (0.62 * r.h), 1, 4), armW);
}

/**
 * The armchair: the sofa's anatomy with ONE cushion and broader arms, 16% of the width each.
 *
 * It used to be a body with a true-arc back; it is now drawn from {@link seatBody} like the
 * sofa beside it, because an armchair IS a one-seat sofa and a living room whose armchair and
 * sofa are drawn in two languages reads as two drawings.
 *
 * Prim count: 5.
 */
export function drawArmchair(r: Rect, g: GlyphCtx): SceneNode[] {
  return seatBody(r, g, 1, r.w * 0.16);
}

/**
 * The coffee table: a hard top with softly eased corners and an inset PANEL — the glass or
 * tray a low table carries — in the white `basin` tone.
 *
 * It is told from {@link drawTable} by two things a reader sees at 1:100: the softer corner (4%
 * of the short side against the table's 1.2%, both hard-furniture radii) and the white panel a
 * full tenth of the short side in, where the table has a hairline bevel at 3%. It carries no
 * legs: a leg is under the top, and four corner dots read as drains on a slab. Both measures
 * are keyed to the short side, so a long top gets an even border rather than a wedge, and the
 * drawing is the same at every aspect — nothing to clamp.
 *
 * Prim count: 2.
 */
export function drawCoffeeTable(r: Rect, g: GlyphCtx): SceneNode[] {
  g.path(roundedRectPath(r, short(r) * 0.04), g.body);
  const panel = insetRect(r, 0.1);
  g.path(roundedRectPath(panel, short(panel) * 0.03), g.basin, "extraThin");
  return g.nodes;
}

/**
 * A plain table: the hard top and one bevel line just inside its edge — exactly the top
 * {@link drawDiningTable} draws (radius 1.2% of the short side, bevel 3% in), without the
 * chairs. A free table and a dining table are the same object at plan scale; the chairs are
 * what the dining table adds, so the two tops must not differ.
 *
 * No legs (they are under the top) and no leaf line: both read as clutter at 1:100 and neither
 * is something a reader of a floor plan looks for.
 *
 * Prim count: 2.
 */
export function drawTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.path(roundedRectPath(r, s * 0.012), g.body);
  g.path(roundedRectPath(insetRect(r, 0.03), s * 0.008), "none", "extraThin");
  return g.nodes;
}

/** The chair-zone band of a dining table, as a fraction of the footprint's short side. */
const DINING_BAND = 0.22;

/** The spacing of a dining table's chairs along a side, in chair-zone bands (see `drawDiningTable`). */
const CHAIR_PITCH = 2.2;

/**
 * The fraction of a dining chair's depth that is tucked under the table top. Only the part in
 * front of the table edge is drawn, so a seat meets the top instead of floating beside it.
 */
const CHAIR_TUCK = 0.3;

/**
 * The dining table: the top inside a chair-zone band, and the chairs tucked under it.
 *
 * **The declared footprint is the whole eating zone, chairs included** — see the module
 * header for why. The band is `0.22 × min(w, h)` on all four sides; a chair is a band deep and
 * nine tenths of one wide, and {@link CHAIR_TUCK} of it is under the top, so it never floats
 * detached from the table and never reaches past the footprint.
 *
 * Seats per LONG side: one per {@link CHAIR_PITCH} bands of top length, `[1, 4]`; plus ONE at
 * each end. The pitch is chosen so that a SQUARE top seats exactly one per side —
 * `0.56 / (2.2 × 0.22)` is 1.16 — which is what keeps the catalog's `symmetric: true` honest: a
 * square table maps onto itself under a quarter-turn. A 2:1 footprint (`3.2` pitches of top)
 * seats three a side, a 1.2:1 one two.
 *
 * Draw order: the top FIRST — it is the symbol's outline and the node a consumer makes
 * clickable — then its bevel, then each chair's visible part, whose seat ends exactly on the
 * table's edge.
 *
 * Prim count: `2 + 2 × chairs`, i.e. 10 for the square four-seater and 22 at the clamp.
 */
export function drawDiningTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const band = short(r) * DINING_BAND;
  const top: Rect = { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band };
  const st = short(top);
  g.path(roundedRectPath(top, st * 0.012), g.body);
  g.path(roundedRectPath(insetRect(top, 0.03), st * 0.008), "none", "extraThin");

  const horizontal = r.w >= r.h;
  const runLen = horizontal ? top.w : top.h;
  const perSide = clampCount(runLen / (CHAIR_PITCH * band), 1, 4);
  const cw = band * 0.9;
  const vis = band * (1 - CHAIR_TUCK); // a chair is a band deep; this much shows
  // Every chair is placed by its centre's OFFSET from the footprint centre, and counterpart
  // chairs get exactly negated or swapped offsets: `along(n−1−i)` is `−along(i)` exactly (an
  // integer numerator negates), and the two sides of the table share one `±(half + vis/2)`. So
  // a mirror, a half-turn and — on a square — a quarter-turn carry each chair onto a chair
  // built from the very same numbers, not onto one that took a different rounding path.
  const C = centerOf(r);
  const out = (half: number): number => half + vis / 2;
  const along = (i: number): number => (runLen * (2 * i + 1 - perSide)) / (2 * perSide);
  for (let i = 0; i < perSide; i++) {
    const u = along(i);
    if (horizontal) {
      chairAt(g, C, { x: u, y: -out(top.h / 2) }, "top", cw, vis, CHAIR_TUCK);
      chairAt(g, C, { x: u, y: out(top.h / 2) }, "bottom", cw, vis, CHAIR_TUCK);
    } else {
      chairAt(g, C, { x: -out(top.w / 2), y: u }, "left", cw, vis, CHAIR_TUCK);
      chairAt(g, C, { x: out(top.w / 2), y: u }, "right", cw, vis, CHAIR_TUCK);
    }
  }
  if (horizontal) {
    chairAt(g, C, { x: -out(top.w / 2), y: 0 }, "left", cw, vis, CHAIR_TUCK);
    chairAt(g, C, { x: out(top.w / 2), y: 0 }, "right", cw, vis, CHAIR_TUCK);
  } else {
    chairAt(g, C, { x: 0, y: -out(top.h / 2) }, "top", cw, vis, CHAIR_TUCK);
    chairAt(g, C, { x: 0, y: out(top.h / 2) }, "bottom", cw, vis, CHAIR_TUCK);
  }
  return g.nodes;
}

/**
 * The dining chair: a rounded upholstered SEAT (white) and a pill-ended BACKREST bar along the
 * back edge, 12% of the depth, drawn over the seat's back.
 *
 * Two primitives, and that is the drawing: a chair at plan scale is a seat and a back, and the
 * armrest lines and inner cushion the previous symbol carried read as three nested boxes at
 * 1:100. The seat is the outline (first node); the backrest overlaps it, as the real one stands
 * over the seat's back edge. The same construction, turned and tucked, is every chair round a
 * {@link drawDiningTable}.
 *
 * It is deliberately NOT the outdoor chair (`drawOutdoorChair`, slatted) nor the office chair
 * (round, with a true-arc back).
 *
 * Prim count: 2.
 */
export function drawChair(r: Rect, g: GlyphCtx): SceneNode[] {
  chairAt(g, centerOf(r), { x: 0, y: 0 }, "top", r.w, r.h, 0);
  return g.nodes;
}

/**
 * The stool: a round upholstered SEAT and the FOOTREST RING that stands proud of it — which is
 * how a bar stool reads from above.
 *
 * The seat is a solid white disc (it is upholstered, like the dining chair's seat) in the outline
 * pen — the symbol's outline and its first node; the footrest ring is detail, drawn AT the
 * footprint's radius, because the footrest is the widest part of a stool: the symbol's extent is
 * the footprint's, which is also the extent every consumer of the drawing (room-label placement
 * among them) measures it by. It stands a clear band outside the seat, so the two never merge
 * into one heavy line at 1:100. There is no seam ring inside the seat: three nested circles read
 * as a target, not a seat.
 *
 * **Both are CONCENTRIC true circles, and the concentricity is the constraint, not a
 * preference.** `furniture.render()` rotates the node LIST in place: a ring of three or four
 * foot dots maps onto itself as a SET while each node lands where its neighbour was, so the SVG
 * bytes would move even though the drawing does not. A circle centred on the pivot maps onto
 * ITSELF, which is what makes the quarter-turn byte-identical rather than merely
 * indistinguishable — the law `test/glyphs-living.test.ts` asserts.
 *
 * Prim count: 2.
 */
export function drawStool(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  // A negative extent (the fuzz feeds one) would give a negative radius; collapse onto the centre.
  const rad = Math.max(0, short(r) / 2);
  g.dot(c, rad * 0.76, g.basin, "thin");
  g.ring(c, rad, "extraThin");
  return g.nodes;
}

/**
 * The bench: a hard slab with its boards running LENGTHWISE — along the long axis, whichever
 * that is, so a bench authored 1800x400 and one authored 400x1800 are the same drawing turned.
 *
 * The board joints are detail lines that run the full length of the slab and stop at its ends;
 * the slab itself has the hard-furniture corner (2% of the short side). It draws no end
 * supports: a support is UNDER the seat, and a solid line across the boards would say the
 * opposite.
 *
 * The board count is derived from the aspect — a deeper bench takes more boards — and clamped
 * for the reason every count in this module is: an aspect is unbounded and the property suite
 * feeds 10000 x 10, where an underived count would ask for a solid band of lines.
 *
 * Prim count: `1 + joints`, i.e. 4 at the common 1500x400.
 */
export function drawBench(r: Rect, g: GlyphCtx): SceneNode[] {
  g.path(roundedRectPath(r, short(r) * 0.02), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const joints = clampCount((short(r) / long) * 12, 2, 5);
  for (let i = 1; i <= joints; i++) {
    const f = i / (joints + 1);
    if (horizontal) {
      g.seg({ x: r.x, y: r.y + r.h * f }, { x: r.x + r.w, y: r.y + r.h * f }, "extraThin");
    } else {
      g.seg({ x: r.x + r.w * f, y: r.y }, { x: r.x + r.w * f, y: r.y + r.h }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * Door splits and pulls along the run of a cabinet `r` whose front is its BOTTOM edge — the
 * construction the `tv_unit`, the `sideboard` and the `shoe_cabinet` share.
 *
 * `doors − 1` full-depth splits and one pull per door: a short bar parallel to the front,
 * `pullFrac` of the door's width long, at `pullAt` of the depth. The pulls are on the FRONT
 * only, which is what makes the symbol directional (the catalog's flag for all three): a
 * cabinet whose pulls face the wall has been turned round. Every pull is centred on its own
 * door, so the set is mirror-symmetric and the symbol has no hand.
 */
function cabinetFront(r: Rect, g: GlyphCtx, doors: number, pullFrac: number, pullAt: number): void {
  for (let i = 1; i < doors; i++) {
    const x = r.x + (r.w * i) / doors;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }
  const half = ((r.w / doors) * pullFrac) / 2;
  const y = r.y + r.h * pullAt;
  for (let i = 0; i < doors; i++) {
    const cx = r.x + (r.w * (i + 0.5)) / doors;
    g.seg({ x: cx - half, y }, { x: cx + half, y }, "extraThin");
  }
}

/**
 * The TV unit / media console: the carcass, its door splits and pulls along the front, and the
 * television standing on its top against the BACK edge — a slim panel on a foot plate.
 *
 * The television is what tells it from a {@link drawSideboard}, and it stands at the back, which
 * is the edge the unit goes against a wall on; the pulls are on the front. The panel is the same
 * slab-and-stand construction as the wall-mounted {@link drawTv}, set on the console: a foot
 * plate (white, detail) and over it the panel (body tone, outline pen). Both are drawn after the
 * splits, so the splits run under them rather than across the screen.
 *
 * Doors: one per depth of run, `[2, 5]` — three on the catalogued 1500x450.
 *
 * Prim count: `2 × doors + 2`, i.e. 8 at the catalogued 1500x450.
 */
export function drawTvUnit(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  cabinetFront(r, g, clampCount(r.w / r.h, 2, 5), 0.26, 0.86);
  const cx = r.x + r.w / 2;
  const foot: Rect = { x: cx - r.w * 0.08, y: r.y + r.h * 0.12, w: r.w * 0.16, h: r.h * 0.28 };
  g.path(roundedRectPath(foot, short(foot) * 0.2), g.basin, "extraThin");
  const panel: Rect = { x: cx - r.w * 0.34, y: r.y + r.h * 0.2, w: r.w * 0.68, h: r.h * 0.09 };
  g.path(roundedRectPath(panel, short(panel) * 0.3), g.body);
  return g.nodes;
}

/**
 * The rug: the woven body, a border band inside it, and a fringe on the two SHORT ends — every
 * line in the DETAIL pen, and nothing filled.
 *
 * **It is an underlay, and both halves of that sentence follow from it.** A rug is an
 * {@link import("../fixtures-catalog.js").FixtureSpec.underlay} — the sofa and the coffee table
 * stand ON it — so it is the one fixture whose symbol must not occlude another. With no fill it
 * hides nothing, and `toScene` renders every underlay before the rest of the furniture
 * (`renderOrder` in `scene-build.ts`), so a `rug` written after the `sofa` still lies under the
 * sofa's fill rather than drawing its lines across the seat. And it is the one symbol with
 * NO outline-weight line: drawn in the outline ink, a rug's edge runs straight through the
 * seating that stands on it and competes with every outline in the room. In the detail pen and
 * tone it reads as what it is — a floor finish — and the furniture drawn over it stays on top.
 *
 * The fringe hangs off the two SHORT ends — the ends of the rug's own long axis, whichever that
 * is on the page, so a runner authored 2400x800 and one authored 800x2400 are the same drawing
 * turned. A SQUARE rug has no long axis, so it is fringed on all four ends: that is what keeps
 * the catalog's `symmetric: true` honest — the drawing maps onto itself under every quarter-turn
 * and mirror, where picking two ends would hand it an axis the footprint does not have. The
 * woven body stops short of the fringed ends by the fringe's length and the ticks run from it to
 * the footprint's edge, so the fringe lies OUTSIDE the weave, as a real one does, and still
 * inside the rectangle every lint rule measures. Square corners: a rug is cut, not eased.
 *
 * The fringe pitch is a twentieth of the rug's length, so the tick count is the short side over
 * that — a near-square rug gets a full fringe, a runner a short one — clamped to `[3, 16]` per
 * end (`[3, 10]` on a square rug, which fringes twice as many ends), which also swallows the
 * `0/0` a degenerate rect produces.
 *
 * Prim count: `2 + ends × ticks`, i.e. 30 at a typical 2000x1400, 34 at the two-end clamp and 42
 * on a square rug.
 */
export function drawRug(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  const square = r.w === r.h;
  // Which ends carry a fringe: the two ends of the long axis, or all four on a square.
  const sides = square || r.w > r.h;
  const ends = square || r.h > r.w;
  const long = Math.max(r.w, r.h);
  const fringe = long * 0.035;
  const fx = sides ? fringe : 0;
  const fy = ends ? fringe : 0;
  const body: Rect = { x: r.x + fx, y: r.y + fy, w: r.w - 2 * fx, h: r.h - 2 * fy };
  g.poly(rectPoly(body), "none", "extraThin");
  g.poly(rectPoly(insetRect(body, 0.08)), "none", "extraThin");

  const ticks = clampCount(s / (long * 0.05), 3, square ? 10 : 16);
  for (let i = 0; i < ticks; i++) {
    const t = (i + 0.5) / ticks;
    if (sides) {
      const y = body.y + body.h * t;
      g.seg({ x: r.x, y }, { x: r.x + fringe, y }, "extraThin");
      g.seg({ x: r.x + r.w - fringe, y }, { x: r.x + r.w, y }, "extraThin");
    }
    if (ends) {
      const x = body.x + body.w * t;
      g.seg({ x, y: r.y }, { x, y: r.y + fringe }, "extraThin");
      g.seg({ x, y: r.y + r.h - fringe }, { x, y: r.y + r.h }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A closed loop through the axis-aligned ring `pts` (clockwise on the page), each vertex
 * filleted with a TRUE quarter arc of its own radius — `0` leaves the vertex sharp. Each radius
 * is held to half of both incident edges, so neighbouring fillets can meet but never cross, and
 * a degenerate ring (coincident vertices) collapses to finite points rather than `NaN`.
 *
 * {@link roundedRectPath} is the four-corner special case; the L-sofa's outline has six corners,
 * one of them the reflex seam where the two runs meet, which is why this one exists. Right-angle
 * corners only: the fillet centre `v − u_in·r + u_out·r` is `r` off both edges exactly when they
 * meet square. A convex corner of a clockwise ring turns clockwise (sweep 1), a reflex one the
 * other way (sweep 0); the sign is read off the cross product of the two edge directions.
 */
function orthoLoop(pts: readonly Point[], radii: readonly number[]): PathLoop {
  const n = pts.length;
  const edges: PathEdge[] = [];
  let start: Point | undefined;
  let cur: Point | undefined;
  const lineTo = (to: Point): void => {
    if (cur && (to.x !== cur.x || to.y !== cur.y)) edges.push({ t: "line", to });
    cur = to;
  };
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n]!;
    const v = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const lp = Math.hypot(v.x - p.x, v.y - p.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const ui = lp > 0 ? { x: (v.x - p.x) / lp, y: (v.y - p.y) / lp } : { x: 0, y: 0 };
    const uo = lq > 0 ? { x: (q.x - v.x) / lq, y: (q.y - v.y) / lq } : { x: 0, y: 0 };
    const rr = clamp(radii[i] ?? 0, 0, Math.min(lp, lq) / 2);
    const a = { x: v.x - ui.x * rr, y: v.y - ui.y * rr };
    if (start === undefined) {
      start = a;
      cur = a;
    } else lineTo(a);
    if (rr > 0) {
      const b = { x: v.x + uo.x * rr, y: v.y + uo.y * rr };
      const center = { x: a.x + uo.x * rr, y: a.y + uo.y * rr };
      edges.push({ t: "arc", to: b, center, r: rr, sweep: ui.x * uo.y - ui.y * uo.x > 0 ? 1 : 0 });
      cur = b;
    }
  }
  if (start && cur && (cur.x !== start.x || cur.y !== start.y || edges.length === 0))
    edges.push({ t: "line", to: start });
  return { start: start ?? { x: 0, y: 0 }, edges };
}

/**
 * The L-shaped sofa: {@link drawSofa}'s anatomy wrapped round the corner — one run along
 * the back edge, a return down the left, a SQUARE corner seat where they meet, an arm at each
 * free end, a back band along both outer edges, and white seat and back cushions throughout.
 *
 * Both runs are one seat DEEP, `D = min(0.56 h, 0.35 w)` — 896 mm on the catalogued 2600x1600 —
 * and every band, arm, gap and radius is a fraction of `D`, so the two runs always match and a
 * cushion on the return is the same cushion as one on the back run, turned. The back band is
 * 20% of `D`, the arms 18%, as on the sofa. The corner seat is the square between the two
 * back bands; its back cushions pinwheel — one along the top running into the corner, one down
 * the left below it — so no two cushions overlap. The run cushions follow the sofa's rule, one
 * per 0.62 `D` of seat, `[1, 4]` on each run, which is also what bounds the count.
 *
 * The outline is one curved loop: every outer corner on the upholstery radius (7% of `D`) and
 * the reflex corner where the two seat fronts meet left SHARP — a seam in the real piece, not a
 * radius. The bottom-right quadrant is open floor, which is what makes it read as an L.
 *
 * **The footprint stays the bounding RECTANGLE, deliberately.** Every furniture rule —
 * `W_FURNITURE_OVERLAP`, `W_FURN_CLEARANCE`, `W_FURNITURE_WALL_COLLISION`, both walkability
 * grids — measures `RFurniture.size`, an axis-aligned box, and there is no per-category shape
 * hook for any of them. So an L-sofa is checked as though its empty quadrant were solid: a
 * coffee table tucked into the L raises `W_FURNITURE_OVERLAP` even though nothing touches.
 * Teaching one rule about the L and not the other four would be worse than this — the drawing
 * and the lint would disagree in a way nothing tests — so the honest fix is a shape seam
 * shared by all five, which is not this change.
 *
 * **It is handed**: the return is on the LEFT. A mirrored `place` draws the mirror image
 * (`glyph-chirality.ts` derives that from the drawing), so a right-hand L is a mirrored one.
 *
 * Prim count: `6 + 2 × (top cushions + return cushions)`, i.e. 14 at the catalogued 2600x1600
 * and never more than 22.
 */
export function drawSofaL(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const D = Math.max(0, Math.min(r.h * 0.56, r.w * 0.35));
  const rad = D * UPHOLSTERY_RADIUS;
  const gap = D * 0.018;
  const armW = D * 0.18;
  const armEase = Math.min(rad, armW * 0.45);

  g.path(
    orthoLoop(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y0 + D },
        { x: x0 + D, y: y0 + D }, // the reflex corner: a seam, not a radius
        { x: x0 + D, y: y1 },
        { x: x0, y: y1 },
      ],
      [rad, rad, rad, 0, rad, rad],
    ),
    g.body,
  );
  // The arms at the two free ends, on the sofa's construction: outer corners on the body radius,
  // the inner FRONT corner eased, the inner BACK corner square where it meets the back band.
  g.path(roundedRectPath({ x: x1 - armW, y: y0, w: armW, h: D }, [0, rad, rad, armEase]), g.body);
  g.path(roundedRectPath({ x: x0, y: y1 - armW, w: D, h: armW }, [0, armEase, rad, rad]), g.body);

  // Seat extents across a run's depth: from just inside the back band to just behind the front.
  const backOut = D * 0.05; // the frame behind the back cushions
  const backIn = D * SEAT_BACK_BAND; // the back band's inner edge
  const seatIn = backIn + gap;
  const seatOut = D * (1 - 0.045);
  // The run cushions: `n` equal ones between `from` and `to`, `gap` apart.
  const run = (from: number, to: number): Array<[number, number]> => {
    const n = clampCount((to - from) / (0.62 * D), 1, 4);
    const len = (to - from - (n - 1) * gap) / n;
    return Array.from({ length: n }, (_, i): [number, number] => [from + i * (len + gap), len]);
  };
  const top = run(x0 + seatOut + gap, x1 - armW - gap);
  const ret = run(y0 + seatOut + gap, y1 - armW - gap);
  const cushion = (box: Rect, k: number): void => g.path(roundedRectPath(box, D * k), g.basin, "extraThin");

  // Back cushions: the corner pinwheel, then one behind every run seat.
  cushion({ x: x0 + backOut, y: y0 + backOut, w: seatOut - backOut, h: backIn - backOut }, 0.035);
  cushion({ x: x0 + backOut, y: y0 + seatIn, w: backIn - backOut, h: seatOut - seatIn }, 0.035);
  for (const [x, len] of top) cushion({ x, y: y0 + backOut, w: len, h: backIn - backOut }, 0.035);
  for (const [y, len] of ret) cushion({ x: x0 + backOut, y, w: backIn - backOut, h: len }, 0.035);
  // Seat cushions: the square corner seat, then the runs.
  cushion({ x: x0 + seatIn, y: y0 + seatIn, w: seatOut - seatIn, h: seatOut - seatIn }, 0.045);
  for (const [x, len] of top) cushion({ x, y: y0 + seatIn, w: len, h: seatOut - seatIn }, 0.045);
  for (const [y, len] of ret) cushion({ x: x0 + seatIn, y, w: seatOut - seatIn, h: len }, 0.045);
  return g.nodes;
}

/**
 * The arc edge(s) from `from` to `to` about `center`, radius `rad`, turning `sweep` (1 =
 * clockwise on the page), split at angular midpoints until every piece is at most 120° — the
 * `path` contract. Closed form: a piece is minor and within 120° exactly when the cross product
 * of its end directions has the sweep's sign and their dot product is at least −½; otherwise it
 * is split at the bisector (negated for a major arc). Coincident ends give no edge; a degenerate
 * radius or centre gives a straight edge, so nothing here can recurse without end.
 */
function arcEdges(center: Point, rad: number, from: Point, to: Point, sweep: 0 | 1, depth = 0): PathEdge[] {
  if (from.x === to.x && from.y === to.y) return [];
  const ax = from.x - center.x;
  const ay = from.y - center.y;
  const bx = to.x - center.x;
  const by = to.y - center.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (!(rad > 0 && la > 0 && lb > 0) || depth > 3) return [{ t: "line", to }];
  const cross = (ax * by - ay * bx) / (la * lb);
  const dot = (ax * bx + ay * by) / (la * lb);
  const minor = sweep === 1 ? cross > 0 : cross < 0;
  if (minor && dot >= -0.5) return [{ t: "arc", to, center, r: rad, sweep }];
  const sx = ax / la + bx / lb;
  const sy = ay / la + by / lb;
  const ls = Math.hypot(sx, sy);
  let mx: number;
  let my: number;
  if (ls > 1e-9) {
    mx = minor ? sx / ls : -sx / ls;
    my = minor ? sy / ls : -sy / ls;
  } else {
    // An exact half-turn: the midpoint is a quarter-turn on from `from`, in the sweep's sense.
    mx = sweep === 1 ? -ay / la : ay / la;
    my = sweep === 1 ? ax / la : -ax / la;
  }
  const mid = { x: center.x + mx * rad, y: center.y + my * rad };
  return [...arcEdges(center, rad, from, mid, sweep, depth + 1), ...arcEdges(center, rad, mid, to, sweep, depth + 1)];
}

/** The construction circles of a grand piano's case — see {@link drawPiano}. */
interface GrandCase {
  /** The TAIL circle, tangent to the bass side and to the footprint's far edge. */
  readonly ct: Point;
  readonly rt: number;
  /** The CONCAVE circle of the bent side, outside the case, tangent to the tail and shoulder. */
  readonly cc: Point;
  readonly rc: number;
  /** The treble SHOULDER circle, tangent to the cheek. */
  readonly cs: Point;
  readonly rs: number;
}

/**
 * Solve the grand piano's bent side inside the case box `[x0, x1] × [yc, y1]`: a tail circle in
 * the far bass corner, a shoulder circle on the treble cheek, and the one CONCAVE circle tangent
 * to both from outside — the reverse curve between them. Closed form: the concave centre is a
 * circle–circle intersection (radii `rc + rt` about the tail centre, `rc + rs` about the
 * shoulder's), taking the solution outside the case. `null` for a box with no area or a
 * configuration with no real intersection; the caller then draws a plain case.
 */
function grandCase(x0: number, yc: number, x1: number, y1: number): GrandCase | null {
  const w = x1 - x0;
  const L = y1 - yc;
  if (!(w > 0 && L > 0)) return null;
  const rt = Math.min(w * 0.25, L * 0.42);
  const rs = Math.min(w, L) * 0.16;
  const ct = { x: x1 - rt, y: y1 - rt };
  const cs = { x: x0 + rs, y: yc + L * 0.3 };
  const ex = cs.x - ct.x;
  const ey = cs.y - ct.y;
  const d = Math.hypot(ex, ey);
  if (!(d > Math.abs(rt - rs))) return null;
  // The concave radius: 0.8 of the width on a piano-shaped box; at least enough for the two
  // circles to reach it; and flat enough that the bent side's sagitta (≈ chord² / 8r, the chord
  // under `d`) stays within a tenth of the case's short side — which is what keeps a 30:1 or 1:30
  // box's bent side inside it rather than bowing out through the keyboard or the bass side.
  const rc = Math.max(w * 0.95, (d - rt - rs) * 0.6, (d * d) / (Math.min(w, L) * 0.8));
  const ra = rc + rt;
  const rb = rc + rs;
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const h2 = ra * ra - a * a;
  if (!(h2 >= 0)) return null;
  const h = Math.sqrt(h2);
  const ux = ex / d;
  const uy = ey / d;
  const px = ct.x + a * ux;
  const py = ct.y + a * uy;
  // Of the two mirror solutions, the concave centre is the one OUTSIDE the case: on the far side
  // of the shoulder→tail line from the keyboard (a positive cross product, y pointing down).
  const c1 = { x: px - h * uy, y: py + h * ux };
  const c2 = { x: px + h * uy, y: py - h * ux };
  const outside = (c: Point): number => -ex * (c.y - cs.y) + ey * (c.x - cs.x);
  return { ct, rt, cc: outside(c1) > 0 ? c1 : c2, rc, cs, rs };
}

/**
 * The closed case loop of {@link grandCase} offset `t` INWARD, its straight front at `yTop`:
 * along the front, down the bass side, round the tail, back up the concave bent side, over the
 * treble shoulder and up the cheek. An inward offset keeps every centre and shrinks the convex
 * radii by `t` while growing the concave one by `t`, so the offset loop is tangent-continuous
 * wherever the outline is.
 */
function grandLoop(gc: GrandCase, x0: number, x1: number, yTop: number, t: number): PathLoop {
  const { ct, rt, cc, rc, cs, rs } = gc;
  const ra = rc + rt;
  const rb = rc + rs;
  const j1 = { x: ct.x + ((cc.x - ct.x) * (rt - t)) / ra, y: ct.y + ((cc.y - ct.y) * (rt - t)) / ra };
  const j2 = { x: cs.x + ((cc.x - cs.x) * (rs - t)) / rb, y: cs.y + ((cc.y - cs.y) * (rs - t)) / rb };
  const xl = x0 + t;
  const xr = x1 - t;
  const start = { x: xl, y: yTop };
  return {
    start,
    edges: [
      { t: "line", to: { x: xr, y: yTop } },
      { t: "line", to: { x: xr, y: ct.y } },
      ...arcEdges(ct, rt - t, { x: xr, y: ct.y }, j1, 1),
      ...arcEdges(cc, rc + t, j1, j2, 0),
      ...arcEdges(cs, rs - t, j2, { x: xl, y: cs.y }, 1),
      { t: "line", to: start },
    ],
  };
}

/**
 * The grand piano, keyboard to the BACK (top) edge: the case, its lid, the keyboard and — when
 * the footprint is long enough to hold one — the bench in front of the keys.
 *
 * **The case** is drawn the way a piano maker draws it, from three tangent circles and two
 * straight sides: the straight BASS side down the right (the player's left), a round TAIL in the
 * far bass corner, the CONCAVE bent side sweeping back toward the treble, a convex SHOULDER, and
 * the straight treble CHEEK up to the keyboard. {@link grandCase} solves the concave circle in
 * closed form so every junction is tangent — no kinks, at any aspect — and every arc is split to
 * at most 120°. A quarter-disc outline reads as a door swing; this reads as a piano.
 *
 * **The lid** is the same loop offset inward by 3.5% of the short side and starting at the fold
 * line a fifth of the way back: one detail path that is both the lid's front fold (parallel to
 * the keyboard) and the rim following the curve. **The keyboard** is a white band between the
 * cheek blocks, just behind the key slip, with its keys ticked off at 0.4 of the band's depth apart,
 * `[8, 24]`.
 *
 * **The bench** is drawn only when the footprint allows it — depth at least 1.3 × width — so a
 * near-square footprint is all piano and a long one holds the
 * piano and its player: the case keeps a depth of at least its width behind a bench zone of 0.3 ×
 * width, and the bench is half the width across, centred on the keys.
 *
 * **A piano is deliberately un-`against wall`-able** — see `fixtures-catalog.ts`: it carries no
 * footprint, so the form that would derive a rotation from a wall is not reachable and cannot
 * face the keyboard into the plaster.
 *
 * Prim count: `3 + keys (+ 2 with a bench)`, i.e. 26 at a baby-grand 1500x1400 (23 keys).
 */
export function drawPiano(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const w = r.w;
  const bench = r.h >= w * 1.3;
  const yc = bench ? r.y + w * 0.3 : r.y;
  const L = y1 - yc;
  const s = Math.min(w, L);
  const gc = grandCase(x0, yc, x1, y1);
  const yFold = yc + L * 0.2;
  const lidT = Math.max(0, s * 0.035);
  if (gc) {
    g.path(grandLoop(gc, x0, x1, yc, 0), g.body);
    g.path(grandLoop(gc, x0, x1, yFold, lidT), "none", "extraThin");
  } else {
    // No area to solve a case in (the fuzz's zero-extent rects): the same two nodes, square.
    g.path(roundedRectPath({ x: x0, y: yc, w, h: L }, 0), g.body);
    g.path(roundedRectPath(insetRectXY({ x: x0, y: yFold, w, h: y1 - yFold }, lidT, 0), 0), "none", "extraThin");
  }

  // The keyboard between the cheek blocks, just behind the key slip, keys ticked off.
  const kb: Rect = { x: x0 + w * 0.075, y: yc + L * 0.03, w: w * 0.85, h: L * 0.1 };
  g.path(roundedRectPath(kb, 0), g.basin, "extraThin");
  const keys = clampCount(kb.w / (kb.h * 0.4), 8, 24);
  for (let i = 1; i <= keys; i++) {
    const x = kb.x + (kb.w * i) / (keys + 1);
    g.seg({ x, y: kb.y }, { x, y: kb.y + kb.h }, "extraThin");
  }

  if (bench) {
    const frame: Rect = { x: x0 + w * 0.25, y: r.y + w * 0.03, w: w * 0.5, h: w * 0.2 };
    g.path(roundedRectPath(frame, frame.h * 0.12), g.body);
    const pad = insetRect(frame, 0.14);
    g.path(roundedRectPath(pad, pad.h * 0.12), g.basin, "extraThin");
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// ── living ──
//
// Eight families that furnish the rooms the tranches above already drew seating for, and each
// of them is here because a plan cannot say the thing without it: a `fireplace` and a
// `radiator` are the two objects a living room is arranged AROUND, a `sideboard` and a
// `shoe_cabinet` are the storage a hall has, and a wall-mounted `tv` occupies almost no floor
// where a `tv_unit` occupies 450 mm of it. Appended at the foot of the file for the same
// reason they are appended to `FIXTURE_FAMILIES`: that table's order is the LEGEND's order.

/**
 * The fireplace: the chimney BREAST against the wall, the HEARTH slab in front of it, and the
 * splayed FIREBOX recess cut into the breast's room face.
 *
 * One outline polygon carries both masses — the breast across the full width at the back
 * (62% of the depth) and the hearth, 8% narrower each side, projecting into the room — and a
 * detail line marks where the breast's face meets the hearth. The firebox is the classic plan
 * trapezoid: its mouth on that face, its sides splayed so it narrows toward the back, filled
 * white and outlined with the outline pen because it is a cut edge of the masonry. A single
 * detail line across it is the grate.
 *
 * The recess opens onto the FRONT (bottom) and the hearth stands in front of it, which is the
 * whole orientation claim: a fireplace drawn with its hearth at the back has been turned the
 * wrong way, and the drawing says so — the linework the catalog's `directional: true` rests on.
 * Symmetric about its centre line, so it has no hand.
 *
 * Prim count: 4.
 */
export function drawFireplace(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const yb = r.y + r.h * 0.62; // the breast's room face
  const hx = r.w * 0.08; // the hearth's set-back at each side
  g.poly(
    [
      { x: x0, y: r.y },
      { x: x1, y: r.y },
      { x: x1, y: yb },
      { x: x1 - hx, y: yb },
      { x: x1 - hx, y: y1 },
      { x: x0 + hx, y: y1 },
      { x: x0 + hx, y: yb },
      { x: x0, y: yb },
    ],
    g.body,
  );
  g.seg({ x: x0 + hx, y: yb }, { x: x1 - hx, y: yb }, "extraThin");
  const cx = r.x + r.w / 2;
  const back = r.y + r.h * 0.24;
  const mouth = r.w * 0.24;
  const rear = r.w * 0.15;
  g.poly(
    [
      { x: cx - mouth, y: yb },
      { x: cx - rear, y: back },
      { x: cx + rear, y: back },
      { x: cx + mouth, y: yb },
    ],
    g.basin,
  );
  // The grate: a bar across the firebox, two thirds of the way to its mouth.
  const gy = back + (yb - back) * 0.62;
  const gx = rear + (mouth - rear) * 0.62 - r.w * 0.03;
  g.seg({ x: cx - gx, y: gy }, { x: cx + gx, y: gy }, "extraThin");
  return g.nodes;
}

/**
 * The radiator: a shallow slab against the wall with its fins ticked off across the depth.
 *
 * The fins are DETAIL ticks that stop a fifth of the depth short of each long face, so they read
 * as fins inside a casing rather than as a ladder, and they come at a pitch of 0.75 depths along
 * the run — thirteen on the catalogued 1000x100 — clamped to `[4, 20]`, which is the same rule the
 * bench's boards follow and for the same reason: the property suite feeds 10000 x 10, where an
 * underived pitch would ask for a thousand lines and draw a solid band.
 *
 * The fins run ACROSS the piece, from the back face toward the front, which is how a panel
 * radiator is drawn and what tells it from a `sideboard` — three times as deep, with pulls on
 * one edge only.
 *
 * Prim count: `1 + fins`, i.e. 14 at the catalogued 1000x100.
 */
export function drawRadiator(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const fins = clampCount(long / (short(r) * 0.75), 4, 20);
  for (let i = 1; i <= fins; i++) {
    const f = i / (fins + 1);
    if (horizontal) {
      const x = r.x + r.w * f;
      g.seg({ x, y: r.y + r.h * 0.2 }, { x, y: r.y + r.h * 0.8 }, "extraThin");
    } else {
      const y = r.y + r.h * f;
      g.seg({ x: r.x + r.w * 0.2, y }, { x: r.x + r.w * 0.8, y }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The sideboard / buffet: the carcass, its door splits, and one short pull per door on the
 * room-facing edge ({@link cabinetFront}).
 *
 * The door count comes from the aspect — one door per depth of run — and is clamped to `[2, 5]`,
 * so the splits and the pulls are both bounded. The pulls are on the FRONT (bottom) edge only,
 * which is what makes the symbol directional: a sideboard whose pulls face the wall has been
 * turned round.
 *
 * Prim count: `2 × doors`, i.e. 8 at the catalogued 1600x450 (4 doors).
 */
export function drawSideboard(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  cabinetFront(r, g, clampCount(r.w / r.h, 2, 5), 0.26, 0.86);
  return g.nodes;
}

/**
 * The loveseat / two-seater: the sofa's {@link seatBody} with its cushion count PINNED at two,
 * whatever its footprint.
 *
 * That is the whole difference from {@link drawSofa}, and stating it as a pinned count rather
 * than as a second construction is the point: a two-seater IS a sofa, and a reader who can
 * tell the two symbols apart is reading the number of cushions, which is the fact the category
 * carries. `sofa` derives its count from the length of its seat and draws more on a long one;
 * `loveseat` draws two on any.
 *
 * Free-standing and NOT `directional`, like every other seat in the catalogue: a two-seater
 * floated with its back to the room is a room divider, not a defect.
 *
 * Prim count: 7.
 */
export function drawLoveseat(r: Rect, g: GlyphCtx): SceneNode[] {
  return seatBody(r, g, 2, clamp(r.w * 0.08, r.h * 0.12, r.h * 0.22));
}

/**
 * The chaise: the sofa's language with ONE arm and the other end OPEN — a back band along
 * the back edge, an arm at the left end, one long white seat cushion you lie along, and a row of
 * back cushions above it.
 *
 * The open end is the symbol. A sofa has an arm at each end; a chaise has a head at one and
 * nothing at the other, so its seat cushion runs on to the body's own edge there (set in by the
 * same frame a seat keeps at the front) and reads as something you lie along rather than sit
 * across. Everything else is {@link seatBody}'s construction and proportions — body radius 7% of
 * the short side, back band 20% of the depth, the arm on the sofa's rule — so a chaise and a sofa
 * in the same room are one drawing language. Back cushions follow the sofa's seat rule, one per
 * 0.62 depths of seat, `[1, 4]`.
 *
 * The arm is on the LEFT, so the symbol is handed; a mirrored `place` draws the mirror image
 * (`glyph-chirality.ts` derives that from the drawing).
 *
 * Prim count: `3 + back cushions`, i.e. 6 at the catalogued 1600x800.
 */
export function drawChaise(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const rad = s * UPHOLSTERY_RADIUS;
  const gap = s * 0.018;
  const armW = Math.min(clamp(r.w * 0.08, r.h * 0.12, r.h * 0.22), r.w * 0.25);
  const armEase = Math.min(rad, armW * 0.45);
  g.path(roundedRectPath(r, rad), g.body);
  g.path(roundedRectPath({ x: r.x, y: r.y, w: armW, h: r.h }, [rad, 0, armEase, rad]), g.body);

  const rowX = r.x + armW + gap;
  // The open end keeps the frame a seat keeps at its front, keyed to the SHORT side so a tall,
  // narrow footprint cannot push the cushion past the body's far edge.
  const rowEnd = x1 - s * 0.045;
  const backTop = r.y + r.h * 0.05;
  const backBot = r.y + r.h * SEAT_BACK_BAND;
  const n = clampCount((rowEnd - rowX) / (0.62 * r.h), 1, 4);
  const cw = (rowEnd - rowX - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) {
    const x = rowX + i * (cw + gap);
    g.path(roundedRectPath({ x, y: backTop, w: cw, h: backBot - backTop }, s * 0.035), g.basin, "extraThin");
  }
  const seat: Rect = { x: rowX, y: backBot + gap, w: rowEnd - rowX, h: y1 - r.h * 0.045 - (backBot + gap) };
  g.path(roundedRectPath(seat, s * 0.045), g.basin, "extraThin");
  return g.nodes;
}

/**
 * The wall-mounted television: a slim PANEL across the room face and the STAND — its wall
 * bracket — behind it, centred, reaching back to the wall.
 *
 * It is deliberately a DIFFERENT kind from {@link drawTvUnit} rather than an alias of it,
 * because the two occupy different floor: a media console is 450 mm deep and a mounted panel
 * is 80, and a plan that draws the first where the second belongs has taken a walkway away.
 * The panel is the outline (body tone, softly eased ends) and stays SLIM at any footprint: its
 * thickness is the lesser of 55% of the depth and 6% of the width, so a TV authored deeper than
 * the catalogued 80 mm stands further off the wall on a longer arm rather than swelling into a
 * slab. The bracket is a second solid part in the outline pen, so its edge on the panel's back
 * face is the same stroke drawn twice rather than a detail line thinning the outline. The panel
 * is on the FRONT (bottom) edge and the bracket behind it, so the drawing reads back-to-front the
 * way the piece is — the linework the catalog's `directional: true` rests on.
 *
 * Prim count: 2.
 */
export function drawTv(r: Rect, g: GlyphCtx): SceneNode[] {
  const slab = Math.min(r.h * 0.55, r.w * 0.06);
  const panel: Rect = { x: r.x, y: r.y + r.h - slab, w: r.w, h: slab };
  g.path(roundedRectPath(panel, short(panel) * 0.3), g.body);
  g.poly(rectPoly({ x: r.x + r.w * 0.35, y: r.y, w: r.w * 0.3, h: r.h - slab }), g.body);
  return g.nodes;
}

/**
 * The coat rack: a round BASE, the central POLE, and four HOOK arms reaching out on the
 * diagonals, each ending in a knob.
 *
 * The base is the outline (a solid disc in the body tone); the arms and knobs are detail, and the
 * pole is a solid ink disc drawn last, over the arms' inner ends — the one mark that is the
 * stand itself. The arms reach past the base, as a real coat tree's hooks do.
 *
 * The drawn SET maps onto itself under every quarter-turn and under a mirror, which is what the
 * catalog's `symmetric: true` claims and what `test/glyphs-living.test.ts` proves against the real
 * `rotateNode`. Note the weaker word: the SET is invariant, not the node LIST. A quarter-turn
 * carries arm `i` onto arm `i + 1`, so the SVG bytes move even though the drawing does not —
 * unlike {@link drawStool}, whose concentric circles each map onto themselves.
 *
 * Prim count: 10.
 */
export function drawCoatRack(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  // A negative extent (the fuzz feeds one) would make every radius below negative, which is
  // finite and still not a circle; the floor at 0 collapses the symbol onto its centre instead.
  const rad = Math.max(0, short(r) / 2);
  g.dot(c, rad * 0.44, g.body, "thin");
  const k = Math.SQRT1_2;
  const DIAGONALS: readonly (readonly [number, number])[] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [sx, sy] of DIAGONALS) {
    g.seg(
      { x: c.x + sx * k * rad * 0.14, y: c.y + sy * k * rad * 0.14 },
      { x: c.x + sx * k * rad * 0.8, y: c.y + sy * k * rad * 0.8 },
      "extraThin",
    );
  }
  for (const [sx, sy] of DIAGONALS) {
    g.dot({ x: c.x + sx * k * rad * 0.86, y: c.y + sy * k * rad * 0.86 }, rad * 0.1, g.body, "extraThin");
  }
  g.dot(c, rad * 0.16, undefined, "thin");
  return g.nodes;
}

/**
 * The shoe cabinet: a slim carcass, its door splits, and one long pull per door along the
 * room-facing edge ({@link cabinetFront}).
 *
 * It is the {@link drawSideboard}'s construction at a hall's depth, told apart by its pulls: a
 * shoe cabinet's doors are tilt-out bins with a long finger-pull along the top of each, so its
 * pull runs half the door's width where a sideboard's knob-pull is a quarter. It draws no tilt
 * diagonals: inside a door they read as cross-bracing, and leaning one way they would make the
 * symbol handed for no reason. It is mirror-symmetric.
 *
 * Doors: one per depth of run, `[2, 4]` — three on the catalogued 800x300. The pulls are on the
 * FRONT (bottom) edge only, the linework the catalog's `directional: true` rests on.
 *
 * Prim count: `2 × doors`, i.e. 6 at the catalogued 800x300.
 */
export function drawShoeCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  cabinetFront(r, g, clampCount(r.w / r.h, 2, 4), 0.5, 0.82);
  return g.nodes;
}
