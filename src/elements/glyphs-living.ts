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
 * **The rug is the only UNFILLED symbol.** It is an
 * {@link import("../fixtures-catalog.js").FixtureSpec.underlay}: furniture stands on it and
 * people walk over it, so it must not occlude and must not obstruct. Drawing it with no fill
 * at all is what makes the first of those true independently of source order.
 *
 * **The L-sofa is the only symbol whose drawn shape is not its footprint.** Every furniture
 * rule measures an axis-aligned box, so its empty quadrant is checked as though it were
 * solid; {@link drawSofaL} says why that is the honest choice today and what the real fix
 * would be.
 *
 * **The piano is the only symbol whose footprint was withheld on purpose.** Giving it one
 * would make `against wall` legal, and that form would face the keyboard into the wall.
 *
 * Pure and deterministic: every function is a total function of (rect, ctx).
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import { clamp, insetRect, rectPoly, roundedRectPoly, shortSide } from "./glyph-lib.js";

/**
 * The short side of a footprint. Every corner radius and band width below is keyed to it, so
 * a long thin piece gets an even band instead of a wedge — the rule `insetRect` already
 * follows.
 */
const short = shortSide;

/**
 * A repeat count derived from an aspect ratio, rounded and clamped to `[lo, hi]`.
 *
 * The NaN guard is the whole reason this is a function, and it now comes from `glyph-lib`'s
 * {@link clamp}: a zero-area footprint makes the aspect `0/0`, `Math.round(NaN)` is `NaN`, and
 * that clamp lands `NaN` on `lo` instead of passing it through to a loop bound. `Infinity` (a
 * zero-HEIGHT footprint) needs no special case — `Math.round(Infinity)` is `Infinity` and the
 * clamp pins it to `hi`, which is the right answer: an infinitely wide sofa gets the maximum
 * number of cushions.
 */
function clampCount(v: number, lo: number, hi: number): number {
  return clamp(Math.round(v), lo, hi);
}

/**
 * The sofa: an eased body, a back band along the rear edge, an arm at each end, and the
 * cushion divisions between them.
 *
 * The arms and the divisions are what make it read as a sofa rather than a long box — an
 * outlined rectangle with a line across the back is a bench. Both arm bands are filled in the
 * body colour over a body-coloured shell, so what shows is their OUTLINE; that is deliberate,
 * and it is the same trick the bathtub's inner well uses in reverse.
 *
 * Prim count: `5 + divisions`, i.e. 7 at the common 2.3:1 aspect and 11 at the clamp.
 */
export function drawSofa(r: Rect, g: GlyphCtx): SceneNode[] {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const backY = r.y + r.h * 0.18;
  const frontY = r.y + r.h * 0.9;
  const armW = r.w * 0.12;
  const armTop = r.y + r.h * 0.1;
  const innerL = r.x + armW;
  const innerR = x1 - armW;

  g.poly(roundedRectPoly(r, short(r) * 0.1), g.body);
  for (const [ax0, ax1] of [
    [r.x, innerL],
    [innerR, x1],
  ] as const) {
    g.poly(
      [
        { x: ax0, y: armTop },
        { x: ax1, y: armTop },
        { x: ax1, y: y1 },
        { x: ax0, y: y1 },
      ],
      g.body,
    );
  }
  // Drawn across the FULL width, over the arms: the back cushion runs behind them.
  g.seg({ x: r.x, y: backY }, { x: x1, y: backY }, "extraThin");

  // `divisions` lines cut the seat into `divisions + 1` cushions, so the 2.3:1 sofa the
  // catalogue's default footprint describes gets the conventional three.
  const divisions = clampCount((r.w / r.h) * 0.9, 2, 6);
  for (let i = 0; i < divisions; i++) {
    const cx = innerL + ((innerR - innerL) * (i + 1)) / (divisions + 1);
    g.seg({ x: cx, y: backY }, { x: cx, y: frontY }, "extraThin");
  }
  g.seg({ x: innerL, y: frontY }, { x: innerR, y: frontY }, "extraThin");
  return g.nodes;
}

/**
 * The armchair: an eased body, a TRUE arc for the curved back, and the seat cushion.
 *
 * The back is a real `arc` primitive rather than a faceted polygon — round things stay round
 * at any zoom, and every backend (SVG `A`, native DXF `ARC`) already lowers one. Its radius
 * is SOLVED from the chord and the sagitta rather than picked: `R = (a^2 + s^2) / 2s`.
 *
 * **Both of the clamps below hold something down that the drawing cannot show.** The sagitta
 * is capped at `0.9 x a` because `GlyphCtx.arcSeg` accepts MINOR arcs only — every backend
 * pins the SVG large-arc flag to 0, and `s < a` is exactly the condition for the sweep to
 * stay under a half turn, so on a tall footprint an uncapped sagitta would make the export
 * silently draw the arc's COMPLEMENT. The chord is capped at `0.55 x h` because an arc's
 * CENTRE is a defining point, not a construction aid: `pointsOf` in `src/backends/ascii.ts`
 * bounds an arc by `[start, end, center]`, so a shallow arc across a wide footprint would put
 * the centre metres below the chair and drag the plan's extents with it. Capped, the centre
 * lands at worst `0.88 x h` down — inside the footprint at every aspect, which is the law
 * `test/glyphs-living.test.ts` asserts and the reason a wide armchair gets a chord narrower
 * than its box rather than a centre outside it.
 *
 * Prim count: 3.
 */
export function drawArmchair(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.18), g.body);

  const halfChord = Math.min(r.w * 0.4, r.h * 0.55);
  const chordY = r.y + r.h * 0.3;
  const mx = r.x + r.w / 2;
  const sag = Math.min(r.h * 0.22, halfChord * 0.9);
  // A zero-area footprint has no arc to draw; radius 0 keeps the node finite and in place.
  const radius = sag > 0 ? (halfChord * halfChord + sag * sag) / (2 * sag) : 0;
  // Centre sits BELOW the chord (screen +y), so the arc bows up toward the back edge, and
  // left-to-right over the top is the increasing-angle direction: sweep 1.
  g.arcSeg(
    { x: mx, y: chordY - sag + radius },
    radius,
    { x: mx - halfChord, y: chordY },
    { x: mx + halfChord, y: chordY },
    1,
  );

  g.poly(
    roundedRectPoly({ x: r.x + r.w * 0.12, y: r.y + r.h * 0.38, w: r.w * 0.76, h: r.h * 0.5 }, s * 0.12),
    g.body,
    "extraThin",
  );
  return g.nodes;
}

/** The coffee table: an eased top with the inset that reads as its edge. Prim count: 2. */
export function drawCoffeeTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.12), g.body);
  g.poly(roundedRectPoly(insetRect(r, 0.1), s * 0.09), "none", "extraThin");
  return g.nodes;
}

/** A plain table: a square top with the same inset edge. Prim count: 2. */
export function drawTable(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  g.poly(rectPoly(insetRect(r, 0.08)), "none", "extraThin");
  return g.nodes;
}

/**
 * The dining table: the table itself inside a chair-zone band, with the chairs drawn in it.
 *
 * **The declared footprint is the whole eating zone, chairs included** — see the module
 * header for why. The band is `0.22 x min(w, h)` on all four sides and each seat is a
 * `0.45 x 0.45` square of that band's depth, centred in it, so a seat can never spill out of
 * the declared rectangle at any aspect.
 *
 * Seats are laid along the two LONG edges, `clamp(round(aspect x 1.2), 1, 8)` per side, plus
 * one at each SHORT end when the aspect is under 2. That boundary is the difference between
 * a table you sit at the ends of and a refectory bench you do not: a square table seats 1+1
 * per side and 1+1 on the ends (the four-seater), a 2:1 or longer table seats only its sides.
 *
 * Prim count: `2 + chairs`, i.e. 6 for the square four-seater and 18 at the clamp.
 */
export function drawDiningTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const band = short(r) * 0.22;
  const top: Rect = { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band };
  g.poly(rectPoly(top), g.body);
  g.poly(rectPoly(insetRect(top, 0.08)), "none", "extraThin");

  const horizontal = r.w >= r.h;
  const aspect = horizontal ? r.w / r.h : r.h / r.w;
  const perSide = clampCount(aspect * 1.2, 1, 8);
  const seat = band * 0.45;
  const chair = (cx: number, cy: number): void => {
    g.poly(roundedRectPoly({ x: cx - seat / 2, y: cy - seat / 2, w: seat, h: seat }, seat * 0.3), g.body, "extraThin");
  };

  const runStart = horizontal ? top.x : top.y;
  const runLen = horizontal ? top.w : top.h;
  for (let i = 0; i < perSide; i++) {
    const along = runStart + (runLen * (i + 0.5)) / perSide;
    if (horizontal) {
      chair(along, r.y + band / 2);
      chair(along, r.y + r.h - band / 2);
    } else {
      chair(r.x + band / 2, along);
      chair(r.x + r.w - band / 2, along);
    }
  }
  // `NaN < 2` is false, so a zero-area footprint takes the no-end-chairs branch rather than
  // needing a second guard.
  if (aspect < 2) {
    if (horizontal) {
      chair(r.x + band / 2, r.y + r.h / 2);
      chair(r.x + r.w - band / 2, r.y + r.h / 2);
    } else {
      chair(r.x + r.w / 2, r.y + band / 2);
      chair(r.x + r.w / 2, r.y + r.h - band / 2);
    }
  }
  return g.nodes;
}

/** The dining chair: seat, back band along the rear edge, and the cushion. Prim count: 3. */
export function drawChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.15), g.body);
  g.poly(roundedRectPoly({ x: r.x, y: r.y, w: r.w, h: r.h * 0.18 }, s * 0.08), g.body);
  g.poly(
    roundedRectPoly({ x: r.x + r.w * 0.12, y: r.y + r.h * 0.3, w: r.w * 0.76, h: r.h * 0.58 }, s * 0.1),
    g.body,
    "extraThin",
  );
  return g.nodes;
}

/**
 * The stool: a round seat with no back, so its symbol is rotation-symmetric.
 *
 * Both prims are TRUE circles about the footprint centre, which is what makes the symmetry
 * exact rather than approximate: `furniture.render()`'s quarter-turn is about that same
 * centre, and a circle centred on the pivot maps onto itself. A tessellated ring would have
 * rotated its own vertices and moved bytes for a drawing nobody can tell apart.
 *
 * The outer disc is FILLED in the body colour (`dot`, not `ring`), so the stool obeys the
 * same "a piece of furniture is a solid" convention as every other glyph here — an unfilled
 * seat would be the one fixture in the drawing you can see the floor through.
 *
 * Prim count: 2.
 */
export function drawStool(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const rad = short(r) / 2;
  g.dot(c, rad, g.body);
  g.ring(c, rad * 0.6, "extraThin");
  return g.nodes;
}

/**
 * The bench: a slab with two slat lines running LENGTHWISE — along the long axis, whichever
 * that is, so a bench authored 1800x400 and one authored 400x1800 read the same way up.
 *
 * Prim count: 3.
 */
export function drawBench(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const horizontal = r.w >= r.h;
  for (const f of [1 / 3, 2 / 3]) {
    if (horizontal) {
      g.seg({ x: r.x, y: r.y + r.h * f }, { x: r.x + r.w, y: r.y + r.h * f }, "extraThin");
    } else {
      g.seg({ x: r.x + r.w * f, y: r.y }, { x: r.x + r.w * f, y: r.y + r.h }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The TV unit / media console: the carcass, the screen against the back edge, and the shelf
 * line.
 *
 * The screen is drawn in the `basin` (white interior) colour so it reads as a distinct object
 * sitting ON the unit rather than part of it — the same reason a sink's bowls are white
 * against its counter. It sits against the BACK (top) edge, which is the edge the unit is
 * placed against a wall on, so a quarter-turned unit still faces the room.
 *
 * Prim count: 3.
 */
export function drawTvUnit(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const tvW = r.w * 0.7;
  const tvH = r.h * 0.15;
  g.poly(rectPoly({ x: r.x + (r.w - tvW) / 2, y: r.y, w: tvW, h: tvH }), g.basin, "extraThin");
  g.seg({ x: r.x, y: r.y + r.h / 2 }, { x: r.x + r.w, y: r.y + r.h / 2 }, "extraThin");
  return g.nodes;
}

/**
 * The rug: an outer border, an inner border, and a fringe at each short end.
 *
 * **Every primitive is unfilled, and that is the load-bearing part of the drawing.** A rug
 * is an {@link import("../fixtures-catalog.js").FixtureSpec.underlay} — the sofa and the
 * coffee table stand ON it — so it is the one fixture whose symbol must not occlude another.
 * Filling it would make the drawing depend on the order the two pieces were written in: a
 * `rug` after the `sofa` in source order would paint over the sofa, and the same plan with
 * the two lines swapped would look right. With no fill there is no paint order to get wrong,
 * which is a stronger guarantee than a z-index would be and costs nothing.
 *
 * The fringe hangs off the two SHORT ends — the ends of the rug's own long axis, whichever
 * that is on the page, so a runner authored 2400x800 and one authored 800x2400 are the same
 * drawing turned. It is drawn INSIDE the footprint, in the band between the two borders: a
 * fringe that overhung would put linework outside the rectangle every lint rule measures.
 *
 * Prim count: `2 + 2 x ticks`, i.e. 16 at a typical 2000x1400 and 8 at the clamp.
 */
export function drawRug(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.06), "none");
  const inner = insetRect(r, 0.07);
  g.poly(roundedRectPoly(inner, short(inner) * 0.06), "none", "extraThin");

  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  // Ticks are spread along the END edge, so their count comes from how much end there is
  // relative to the run — a near-square rug gets a full fringe, a long runner gets a short
  // one at each end. `0/0` and `x/0` both land on a clamp rather than in a loop bound.
  const ticks = clampCount((s / long) * 10, 3, 9);
  const d = s * 0.05;
  for (let i = 0; i < ticks; i++) {
    const t = (i + 0.5) / ticks;
    if (horizontal) {
      const y = r.y + r.h * t;
      g.seg({ x: r.x, y }, { x: r.x + d, y }, "extraThin");
      g.seg({ x: r.x + r.w - d, y }, { x: r.x + r.w, y }, "extraThin");
    } else {
      const x = r.x + r.w * t;
      g.seg({ x, y: r.y }, { x, y: r.y + d }, "extraThin");
      g.seg({ x, y: r.y + r.h - d }, { x, y: r.y + r.h }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A closed ring through `pts`, with a circular fillet of radius `rad` at each vertex flagged
 * in `ease`; a vertex flagged `false` passes through sharp.
 *
 * {@link roundedRectPoly} eases all four corners of a RECTANGLE, and an L has one corner that
 * must stay sharp — the reflex corner where the two runs meet, which is a seam in the real
 * piece rather than a radius. Local to this module: nothing else draws a non-rectangular ring,
 * and a shared helper would have to answer questions (non-right corners, self-intersection)
 * that the one caller does not ask.
 *
 * **Right-angle corners only.** The fillet centre is `v + (u_prev + u_next) x rad`, which puts
 * it `rad` from both incident edges exactly when they meet square; at any other angle it lands
 * somewhere plausible and wrong. Every corner of an axis-aligned L is square.
 *
 * Degenerate-safe by construction: a zero-length incident edge gives a `(0,0)` unit vector and
 * `rad` clamps to 0, so the fillet collapses onto the vertex and emits `K + 1` copies of a
 * finite point instead of propagating a `NaN` into a coordinate.
 */
function easedRing(pts: readonly Point[], ease: readonly boolean[], rad: number): Point[] {
  const n = pts.length;
  const K = 4;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const v = pts[i]!;
    if (!ease[i]) {
      out.push(v);
      continue;
    }
    const p = pts[(i + n - 1) % n]!;
    const q = pts[(i + 1) % n]!;
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const rr = Math.min(rad, lp / 2, lq / 2);
    const up = lp > 0 ? { x: (p.x - v.x) / lp, y: (p.y - v.y) / lp } : { x: 0, y: 0 };
    const uq = lq > 0 ? { x: (q.x - v.x) / lq, y: (q.y - v.y) / lq } : { x: 0, y: 0 };
    const c = { x: v.x + (up.x + uq.x) * rr, y: v.y + (up.y + uq.y) * rr };
    const a0 = Math.atan2(v.y + up.y * rr - c.y, v.x + up.x * rr - c.x);
    let sweep = Math.atan2(v.y + uq.y * rr - c.y, v.x + uq.x * rr - c.x) - a0;
    // Take the SHORT way round: a right-angle fillet turns a quarter, never three quarters.
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let k = 0; k <= K; k++) {
      const a = a0 + (sweep * k) / K;
      out.push({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) });
    }
  }
  return out;
}

/**
 * The L-shaped sofa: one run along the back edge, a second down the left, and the seat
 * cushions along both.
 *
 * The corner is at the BACK-LEFT, which follows from the one convention every symbol here
 * obeys — the back goes along the top — plus the choice of a left-hand return. The
 * bottom-right quadrant of the footprint is simply not painted: that is open floor, and it is
 * what makes the piece read as an L rather than as a large rectangle.
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
 * **Chirality is a known limitation.** The return is always on the LEFT, and `place … mirror`
 * reflects a resolved element's *position* without reflecting the glyph, so a mirrored
 * instance draws a left-hand sofa where a right-hand one belongs. There is deliberately no
 * `sofa_l_r` twin: a second category would make the vocabulary carry the fix, and the real fix
 * is glyph-aware mirroring in `frame.ts`. Turn the piece with `rotate` where that reads right,
 * or draw the mirrored one by hand.
 *
 * Prim count: `3 + top cushions + arm cushions`, i.e. 6 at the catalogued 2600x1600.
 */
export function drawSofaL(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const runY = y0 + r.h * 0.56; // front edge of the back run
  const armX = x0 + r.w * 0.35; // inner edge of the left-hand return
  g.poly(
    easedRing(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: runY },
        { x: armX, y: runY }, // the reflex corner: a seam, not a radius
        { x: armX, y: y1 },
        { x: x0, y: y1 },
      ],
      [true, true, true, false, true, true],
      short(r) * 0.1,
    ),
    g.body,
  );

  // The two backrests, drawn across their full runs so they meet at the corner the way the
  // real piece's back does.
  const backY = y0 + r.h * 0.15;
  const bandX = x0 + r.w * 0.13;
  g.seg({ x: x0, y: backY }, { x: x1, y: backY }, "extraThin");
  g.seg({ x: bandX, y: y0 }, { x: bandX, y: y1 }, "extraThin");

  // Cushion divisions along each run, counted from that run's own aspect and clamped for the
  // reason the plain sofa's are: an aspect is unbounded and the fuzz feeds 10000 x 10.
  const nTop = clampCount(((x1 - armX) / (runY - y0)) * 0.9, 1, 5);
  for (let i = 0; i < nTop; i++) {
    const x = armX + ((x1 - armX) * (i + 1)) / (nTop + 1);
    g.seg({ x, y: backY }, { x, y: runY }, "extraThin");
  }
  const nArm = clampCount(((y1 - runY) / (armX - x0)) * 0.9, 1, 4);
  for (let i = 0; i < nArm; i++) {
    const y = runY + ((y1 - runY) * (i + 1)) / (nArm + 1);
    g.seg({ x: bandX, y }, { x: armX, y }, "extraThin");
  }
  return g.nodes;
}

/**
 * The grand piano: the keyboard edge across the back, the straight spine down the left, and
 * the bent side sweeping round to the tail.
 *
 * The outline is one **superellipse quarter**, tessellated at a FIXED sixteen steps. Two
 * things follow from "fixed", and both are the point: the symbol is the same drawing at every
 * size and every aspect (no step count derived from a footprint, so nothing to clamp), and it
 * is exactly reproducible — `Math.cos`/`Math.sin` at sixteen rational angles, no accumulation.
 * The exponent `0.77` is what gives the belly: `1` would draw an ellipse (too round, no
 * shoulder at the keyboard) and a smaller exponent squares it off toward a rectangle.
 *
 * The quarter runs from the keyboard's right-hand corner round to the foot of the spine, so
 * the piano is widest AT the keyboard and tapers to the tail — which is the way round a grand
 * actually is, and the reason the shape survives being drawn at 40 mm on an A3 sheet.
 *
 * **A piano is deliberately un-`against wall`-able** — see `fixtures-catalog.ts`: it carries
 * no footprint, so the form that would derive a rotation from a wall is simply not reachable,
 * and cannot silently face the keyboard into the plaster.
 *
 * Prim count: `3 + key ticks`, i.e. 7 at a baby-grand 1500x1400.
 */
export function drawPiano(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const y0 = r.y;
  const N = 16;
  const E = 0.77;
  // Start at the top-LEFT (the head of the spine); the quarter below closes the ring by
  // running from the top-right corner round to the spine's foot.
  const ring: Point[] = [{ x: x0, y: y0 }];
  for (let i = 0; i <= N; i++) {
    const a = ((i / N) * Math.PI) / 2;
    ring.push({ x: x0 + r.w * Math.cos(a) ** E, y: y0 + r.h * Math.sin(a) ** E });
  }
  g.poly(ring, g.body);

  // The keyboard: a white band inside the back edge, ticked off into key groups. Its right
  // end stops at 0.88 of the width, well inside the outline, which at that depth is still at
  // 0.998 — so the band cannot escape the body at any aspect.
  const keyY = y0 + r.h * 0.02;
  const keyH = r.h * 0.1;
  const keyX = x0 + r.w * 0.04;
  const keyW = r.w * 0.84;
  g.poly(rectPoly({ x: keyX, y: keyY, w: keyW, h: keyH }), g.basin, "extraThin");
  const keys = clampCount((r.w / r.h) * 4, 3, 5);
  for (let i = 1; i <= keys; i++) {
    const x = keyX + (keyW * i) / (keys + 1);
    g.seg({ x, y: keyY }, { x, y: keyY + keyH }, "extraThin");
  }

  // The lid's fold line, run from under the keyboard down toward the tail. It stops at 0.40
  // of the width at 0.86 of the depth, where the outline is still at 0.65.
  g.seg({ x: x0 + r.w * 0.06, y: y0 + r.h * 0.18 }, { x: x0 + r.w * 0.4, y: y0 + r.h * 0.86 }, "extraThin");
  return g.nodes;
}
