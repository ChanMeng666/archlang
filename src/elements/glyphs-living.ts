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
 * That tranche also brought a redraw of six symbols in this file — `coffee_table`, `table`,
 * `stool`, `bench`, `chair` and `tv_unit` — each of which was two or three primitives and read
 * as a rectangle with a line in it. What they gained is stated in each function's own comment;
 * what they share is that the additions are all *structural* (legs, supports, armrests, drawer
 * splits) rather than decorative, so each one survives being drawn at 40 mm on an A3 sheet.
 *
 * Pure and deterministic: every function is a total function of (rect, ctx).
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import {
  centerOf,
  clamp,
  easedRing,
  insetRect,
  insetRectSides,
  rectPoly,
  roundedRectPoly,
  shortSide,
} from "./glyph-lib.js";

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
 * The sofa construction, with the cushion count handed IN: an eased body, a back band along
 * the rear edge, an arm at each end, and `divisions` lines cutting the seat into
 * `divisions + 1` cushions.
 *
 * The arms and the divisions are what make it read as a sofa rather than a long box — an
 * outlined rectangle with a line across the back is a bench. Both arm bands are filled in the
 * body colour over a body-coloured shell, so what shows is their OUTLINE; that is deliberate,
 * and it is the same trick the bathtub's inner well uses in reverse.
 *
 * The count is a PARAMETER because {@link drawLoveseat} is the same piece of furniture with
 * two seats rather than three-or-more — a two-seater is not a different construction, and
 * drawing it from a second one would let the pair drift apart in ways that carry no meaning.
 * {@link drawSofa} derives its count from the aspect and passes it here, which is what keeps
 * every shipped sofa on the bytes it had: the body of this function is the old
 * `drawSofa` verbatim.
 *
 * Prim count: `5 + divisions`.
 */
function sofaBody(r: Rect, g: GlyphCtx, divisions: number): SceneNode[] {
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

  for (let i = 0; i < divisions; i++) {
    const cx = innerL + ((innerR - innerL) * (i + 1)) / (divisions + 1);
    g.seg({ x: cx, y: backY }, { x: cx, y: frontY }, "extraThin");
  }
  g.seg({ x: innerL, y: frontY }, { x: innerR, y: frontY }, "extraThin");
  return g.nodes;
}

/**
 * The sofa: {@link sofaBody} with its cushion divisions read off the footprint's aspect, so
 * the 2.3:1 sofa the catalogue's default footprint describes gets the conventional three.
 *
 * Prim count: `5 + divisions`, i.e. 7 at the common 2.3:1 aspect and 11 at the clamp.
 */
export function drawSofa(r: Rect, g: GlyphCtx): SceneNode[] {
  return sofaBody(r, g, clampCount((r.w / r.h) * 0.9, 2, 6));
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

/**
 * The four legs of a table, as dots at the corners of `r` inset by `frac` of its short side.
 *
 * Three of the tables here are otherwise the same object — a filled top with an edge inside
 * it — and the legs are what make them read as furniture rather than as a slab of something.
 * Sharing the placement rule is what stops the `table` and the `coffee_table` from having
 * their legs in visibly different places for no reason.
 *
 * The inset is keyed to the SHORT side (see {@link insetRect}), so a long refectory table gets
 * its legs an even distance in from all four sides rather than a wedge, and the leg radius is
 * capped at a third of that inset — which is what keeps a leg inside the footprint on a
 * 10000 x 10 rect, where the inset itself is a hair.
 */
function tableLegs(r: Rect, g: GlyphCtx, frac: number): void {
  const inner = insetRect(r, frac);
  const rad = short(r) * frac * 0.34;
  for (const [x, y] of [
    [inner.x, inner.y],
    [inner.x + inner.w, inner.y],
    [inner.x + inner.w, inner.y + inner.h],
    [inner.x, inner.y + inner.h],
  ] as const) {
    g.dot({ x, y }, rad, g.body, "extraThin");
  }
}

/**
 * The coffee table: a generously eased top, the inner ring that reads as its edge, four legs
 * at the corners, and — on an elongated top only — the centre line of a two-part tray.
 *
 * It is drawn ROUNDED where {@link drawTable} is drawn square, and that is the whole
 * distinction between them at plan scale: a coffee table is a low, soft-cornered object and a
 * dining or work table is not. The two used to differ only by a corner radius of 0.12 against
 * 0.08 on the same two primitives, which is not a difference a reader can see.
 *
 * The tray line is drawn only past an aspect of 1.6, across the SHORT axis at mid-length — a
 * squarish table has one top and a long one reads as two. Below the threshold it is simply
 * absent, which is why the prim count is 6 or 7 rather than a fixed number.
 *
 * Prim count: `6 + (elongated ? 1 : 0)`.
 */
export function drawCoffeeTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.22), g.body);
  const inner = insetRect(r, 0.12);
  g.poly(roundedRectPoly(inner, short(inner) * 0.2), "none", "extraThin");
  tableLegs(r, g, 0.16);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  if (long > s * 1.6) {
    if (horizontal) {
      g.seg({ x: inner.x + inner.w / 2, y: inner.y }, { x: inner.x + inner.w / 2, y: inner.y + inner.h }, "extraThin");
    } else {
      g.seg({ x: inner.x, y: inner.y + inner.h / 2 }, { x: inner.x + inner.w, y: inner.y + inner.h / 2 }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * A plain table: a SQUARE-cornered top, the inset edge, four legs, and a centre leaf line on
 * an elongated top.
 *
 * Square corners and a shallower inset are what tell it from the {@link drawCoffeeTable}
 * beside it; the leaf line runs ALONG the long axis rather than across it, which is the other
 * half of the distinction — a refectory table's boards run with its length, a tray's division
 * runs across it — and it also means the two symbols never draw the same line in the same
 * place at the same aspect. It carries no chairs, which is what tells it from
 * {@link drawDiningTable}, whose footprint is the whole eating zone.
 *
 * Prim count: `6 + (elongated ? 1 : 0)`.
 */
export function drawTable(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const inner = insetRect(r, 0.1);
  g.poly(rectPoly(inner), "none", "extraThin");
  tableLegs(r, g, 0.14);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  if (long > short(r) * 1.6) {
    if (horizontal) {
      g.seg({ x: inner.x, y: inner.y + inner.h / 2 }, { x: inner.x + inner.w, y: inner.y + inner.h / 2 }, "extraThin");
    } else {
      g.seg({ x: inner.x + inner.w / 2, y: inner.y }, { x: inner.x + inner.w / 2, y: inner.y + inner.h }, "extraThin");
    }
  }
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

/**
 * The dining chair: seat, back band along the rear edge, the cushion, and — on a seat wide
 * enough to have them — an armrest each side.
 *
 * The armrests are what make it read as a chair rather than as a small box with a line across
 * it, which is what the three-primitive version was at plan scale. They are drawn only when
 * the seat is at least {@link ARMREST_ASPECT} as wide as it is deep: a chair narrower than
 * that has no room between its cushion and its edge, and drawing them anyway would put two
 * lines through the cushion. So the count is 5 or 3, not a fixed number.
 *
 * It is deliberately NOT the outdoor chair: `glyphs-outdoor.ts`'s `drawOutdoorChair` is this
 * same construction plus SLATS across the back, and the slats are the whole difference — an
 * outdoor chair is slatted and a dining chair is upholstered. Nor is it the office chair,
 * which is round and has a true-arc back.
 *
 * Prim count: `3 + (armrests ? 2 : 0)`.
 */
export function drawChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.15), g.body);
  g.poly(roundedRectPoly({ x: r.x, y: r.y, w: r.w, h: r.h * 0.18 }, s * 0.08), g.body);
  // The cushion is deliberately narrow — 0.56 of the width, not 0.72 — so it does not crowd
  // the body outline it sits inside, and so the armrests have somewhere to be. The first draft
  // ran it to 0.86 and the symbol read as three nested boxes.
  g.poly(
    roundedRectPoly({ x: r.x + r.w * 0.22, y: r.y + r.h * 0.34, w: r.w * 0.56, h: r.h * 0.5 }, s * 0.1),
    g.body,
    "extraThin",
  );
  // `NaN >= x` is false, so a zero-area footprint takes the no-armrest branch rather than
  // needing a second guard.
  if (r.w >= r.h * ARMREST_ASPECT) {
    for (const f of [0.12, 0.88]) {
      const x = r.x + r.w * f;
      g.seg({ x, y: r.y + r.h * 0.28 }, { x, y: r.y + r.h * 0.86 }, "extraThin");
    }
  }
  return g.nodes;
}

/** Seat aspect (`w / h`) at or above which {@link drawChair} draws its two armrests. */
const ARMREST_ASPECT = 0.7;

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
 * **Three CONCENTRIC circles, and the concentricity is the constraint, not a preference.** The
 * seat edge alone reads as a plain disc at plan scale, so the pedestal foot is drawn inside it
 * — but the obvious way to say "this thing stands on legs", a ring of three or four foot dots,
 * cannot be used here. `furniture.render()` rotates the node LIST in place: a set of dots at a
 * 90-degree pitch maps onto itself as a SET while each node lands where its neighbour was, so
 * the SVG bytes move even though the drawing does not. A circle centred on the pivot maps onto
 * ITSELF, which is what makes the quarter-turn byte-identical rather than merely
 * indistinguishable — the law `test/glyphs-living.test.ts` asserts, and the reason a stool has
 * no feet in it.
 *
 * Prim count: 3.
 */
export function drawStool(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const rad = short(r) / 2;
  g.dot(c, rad, g.body);
  g.ring(c, rad * 0.62, "extraThin");
  g.ring(c, rad * 0.24, "extraThin");
  return g.nodes;
}

/**
 * The bench: a slab with its slats running LENGTHWISE — along the long axis, whichever that
 * is, so a bench authored 1800x400 and one authored 400x1800 read the same way up — and a
 * support across each end.
 *
 * The two supports are what tell it from a shelf or a plain slab: a bench is a board carried
 * clear of the ground at its ends, and in plan the legs project to exactly those two
 * transverse lines. They stand 0.1 of the run in from each end, which is where a real bench's
 * legs are and, more usefully, clear of the slab's own outline at every aspect.
 *
 * The slat count is derived from the aspect — a deeper bench takes more boards — and clamped
 * for the reason every count in this module is: an aspect is unbounded and the property suite
 * feeds 10000 x 10, where an underived count would ask for a solid band of lines.
 *
 * Prim count: `3 + slats`, i.e. 6 at the common 1500x400.
 */
export function drawBench(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const slats = clampCount((short(r) / long) * 12, 2, 5);
  for (let i = 1; i <= slats; i++) {
    const f = i / (slats + 1);
    if (horizontal) {
      g.seg({ x: r.x, y: r.y + r.h * f }, { x: r.x + r.w, y: r.y + r.h * f }, "extraThin");
    } else {
      g.seg({ x: r.x + r.w * f, y: r.y }, { x: r.x + r.w * f, y: r.y + r.h }, "extraThin");
    }
  }
  for (const u of [0.1, 0.9]) {
    if (horizontal) {
      g.seg({ x: r.x + r.w * u, y: r.y }, { x: r.x + r.w * u, y: r.y + r.h }, "extraThin");
    } else {
      g.seg({ x: r.x, y: r.y + r.h * u }, { x: r.x + r.w, y: r.y + r.h * u }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The TV unit / media console: the carcass, the screen against the back edge, the shelf line,
 * and the drawer bank under it with its handle tick.
 *
 * The screen is drawn in the `basin` (white interior) colour so it reads as a distinct object
 * sitting ON the unit rather than part of it — the same reason a sink's bowls are white
 * against its counter. It sits against the BACK (top) edge, which is the edge the unit is
 * placed against a wall on, so a quarter-turned unit still faces the room.
 *
 * The two drawer splits and the handle are what stop it reading as a plain box with a lid,
 * and they say which side is the front: they are drawn BELOW the shelf line, in the half of
 * the carcass that faces the room. A `tv_unit` is `directional` in the catalog, and this is
 * the linework that claim rests on — a symbol whose facing nothing in the drawing shows has
 * no business carrying the flag.
 *
 * It is not the wall-mounted {@link drawTv}, which is a screen on a bracket with no carcass at
 * all; the two are separate kinds because a media wall and a mounted panel occupy different
 * floor area — 450 mm of it against nearly none.
 *
 * Prim count: 6.
 */
export function drawTvUnit(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const tvW = r.w * 0.7;
  const tvH = r.h * 0.15;
  g.poly(rectPoly({ x: r.x + (r.w - tvW) / 2, y: r.y, w: tvW, h: tvH }), g.basin, "extraThin");
  const shelfY = r.y + r.h * 0.52;
  g.seg({ x: r.x, y: shelfY }, { x: r.x + r.w, y: shelfY }, "extraThin");
  for (const f of [1 / 3, 2 / 3]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: shelfY }, { x, y: r.y + r.h }, "extraThin");
  }
  // The handle: a short tick on the middle drawer's front, centred on the carcass.
  g.seg({ x: r.x + r.w * 0.44, y: r.y + r.h * 0.86 }, { x: r.x + r.w * 0.56, y: r.y + r.h * 0.86 }, "extraThin");
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

// ---------------------------------------------------------------------------
// ── v1.32 F2: living ──
//
// Eight families that furnish the rooms the tranches above already drew seating for, and each
// of them is here because a plan cannot say the thing without it: a `fireplace` and a
// `radiator` are the two objects a living room is arranged AROUND, a `sideboard` and a
// `shoe_cabinet` are the storage a hall has, and a wall-mounted `tv` occupies almost no floor
// where a `tv_unit` occupies 450 mm of it. Appended at the foot of the file for the same
// reason they are appended to `FIXTURE_FAMILIES`: that table's order is the LEGEND's order.

/**
 * The fireplace: the chimney breast, the firebox opening cut into its room face, and the
 * flame ticks inside it.
 *
 * The opening is `basin`-filled and pushed to the FRONT (bottom) half, which is the whole
 * orientation claim: a fireplace's breast goes into the wall and its opening faces the room,
 * so a piece drawn with the opening at the back has been turned the wrong way and the drawing
 * says so. That is the linework the catalog's `directional: true` rests on.
 *
 * The three flame ticks are drawn INSIDE the opening rather than over the breast — a hearth
 * fire is in the firebox — and they are what tell it from a `radiator` at a glance, the other
 * long shallow directional piece that backs onto a wall.
 *
 * Prim count: 5.
 */
export function drawFireplace(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  // The opening starts PAST the halfway line, so the breast is unmistakably the back half —
  // which is the fact `directional: true` rests on and what `test/glyphs-living.test.ts` pins.
  const box = insetRectSides(r, 0.18, 0.18, 0.52, 0.1);
  g.poly(rectPoly(box), g.basin, "extraThin");
  for (const f of [0.3, 0.5, 0.7]) {
    const x = box.x + box.w * f;
    g.seg({ x, y: box.y + box.h * 0.25 }, { x, y: box.y + box.h * 0.85 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The radiator: a shallow slab against the wall with its fins ticked off across the depth.
 *
 * The fin pitch is derived from the run — one fin per 1.2 depths — and clamped to `[4, 12]`,
 * which is the same rule the bookshelf's bays and the bench's slats follow and for the same
 * reason: the property suite feeds 10000 x 10, where an underived pitch would ask for eight
 * hundred lines and draw a solid band.
 *
 * The fins run ACROSS the piece, from the back face to the front, which is how a panel
 * radiator is drawn and what tells it from a `sideboard` — three times as deep, and carrying
 * handle ticks on one edge only.
 *
 * Prim count: `1 + fins`, i.e. 9 at the catalogued 1000x100.
 */
export function drawRadiator(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const fins = clampCount(long / short(r) / 1.2, 4, 12);
  for (let i = 1; i <= fins; i++) {
    const f = i / (fins + 1);
    if (horizontal) {
      g.seg({ x: r.x + r.w * f, y: r.y }, { x: r.x + r.w * f, y: r.y + r.h }, "extraThin");
    } else {
      g.seg({ x: r.x, y: r.y + r.h * f }, { x: r.x + r.w, y: r.y + r.h * f }, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The sideboard / buffet: a carcass, the inner outline that reads as its top, the door splits
 * along the run, and one handle tick per door on the room-facing edge.
 *
 * The door count comes from the aspect — roughly one door per unit of depth — and is clamped
 * to `[2, 5]`, so the splits and the handles are both bounded. The handles are drawn on the
 * FRONT (bottom) edge only, which is what makes the symbol directional: a sideboard whose
 * handles face the wall has been turned round.
 *
 * Prim count: `2 + (doors - 1) + doors`, i.e. 9 at the catalogued 1600x450 (4 doors).
 */
export function drawSideboard(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const inner = insetRect(r, 0.08);
  g.poly(rectPoly(inner), "none", "extraThin");
  const doors = clampCount(r.w / r.h, 2, 5);
  for (let i = 1; i < doors; i++) {
    const x = r.x + (r.w * i) / doors;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }
  for (let i = 0; i < doors; i++) {
    const cx = r.x + (r.w * (i + 0.5)) / doors;
    const half = (r.w / doors) * 0.16;
    g.seg({ x: cx - half, y: r.y + r.h * 0.88 }, { x: cx + half, y: r.y + r.h * 0.88 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The loveseat / two-seater: {@link sofaBody} with its cushion count PINNED at one division,
 * so it draws exactly two seats whatever its footprint.
 *
 * That is the whole difference from {@link drawSofa}, and stating it as a pinned count rather
 * than as a second construction is the point: a two-seater IS a sofa, and a reader who can
 * tell the two symbols apart is reading the number of cushions, which is the fact the category
 * carries. `sofa` derives its count from the aspect and would draw three on this footprint;
 * `loveseat` draws two on any.
 *
 * Free-standing and NOT `directional`, like every other seat in the catalogue: a two-seater
 * floated with its back to the room is a room divider, not a defect.
 *
 * Prim count: 6.
 */
export function drawLoveseat(r: Rect, g: GlyphCtx): SceneNode[] {
  return sofaBody(r, g, 1);
}

/**
 * The chaise longue: an eased body with a back down ONE long side and a raised head across the
 * top, plus the cushion and its two divisions.
 *
 * The asymmetry IS the symbol. A sofa has an arm at each end and a chaise has a back on one
 * side and a head at one end, so the piece reads as something you lie along rather than sit
 * across — and it reads that way at any aspect, because both bands are fractions of the
 * footprint rather than a fixed depth. It is not the `sun_lounger`, whose head band spans the
 * full width and whose seat is slatted; the side back is what separates them.
 *
 * The back is on the LEFT, which is the handedness `drawSofaL` chose and carries the same known
 * limitation: `place … mirror` reflects a resolved element's position without reflecting the
 * glyph, so a mirrored instance still draws a left-hand chaise. Turn it with `rotate`.
 *
 * Prim count: 6.
 */
export function drawChaise(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = short(r);
  g.poly(roundedRectPoly(r, s * 0.12), g.body);
  g.poly(roundedRectPoly({ x: r.x, y: r.y, w: r.w * 0.16, h: r.h }, s * 0.1), g.body);
  g.poly(roundedRectPoly({ x: r.x + r.w * 0.16, y: r.y, w: r.w * 0.84, h: r.h * 0.18 }, s * 0.08), g.body);
  const seat = { x: r.x + r.w * 0.22, y: r.y + r.h * 0.26, w: r.w * 0.72, h: r.h * 0.66 };
  g.poly(roundedRectPoly(seat, short(seat) * 0.12), g.body, "extraThin");
  for (const f of [1 / 3, 2 / 3]) {
    const x = seat.x + seat.w * f;
    g.seg({ x, y: seat.y }, { x, y: seat.y + seat.h }, "extraThin");
  }
  return g.nodes;
}

/**
 * The wall-mounted television: the bracket against the wall and the panel hanging off it.
 *
 * It is deliberately a DIFFERENT kind from {@link drawTvUnit} rather than an alias of it,
 * because the two occupy different floor: a media console is 450 mm deep and a mounted panel
 * is 80, and a plan that draws the first where the second belongs has taken a walkway away.
 * The symbol says which is which — no carcass to speak of, a `basin` panel across the room
 * face, and two bracket ticks joining it to the back edge.
 *
 * The panel is on the FRONT (bottom) half and the brackets are behind it, so the drawing reads
 * back-to-front the way the piece is: the mount is against the wall, which is the TOP edge by
 * this module's convention, and the screen faces the room.
 *
 * Prim count: 4.
 */
export function drawTv(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const panel = { x: r.x + r.w * 0.04, y: r.y + r.h * 0.42, w: r.w * 0.92, h: r.h * 0.52 };
  g.poly(rectPoly(panel), g.basin, "extraThin");
  for (const f of [0.36, 0.64]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y + r.h * 0.06 }, { x, y: r.y + r.h * 0.42 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The coat rack: the post as two true circles about the footprint centre, with four hooks at a
 * 90-degree pitch round it.
 *
 * The drawn SET maps onto itself under every quarter-turn, which is what the catalog's
 * `symmetric: true` claims about this category and what `test/glyphs-living.test.ts` proves
 * against the real `rotateNode` rather than asserting.
 *
 * Note the weaker word: the SET is invariant, not the node LIST. A quarter-turn carries hook
 * `i` onto hook `i + 1`, so the SVG bytes move even though the drawing does not — unlike
 * {@link drawStool}, whose concentric circles each map onto themselves. Both claims are true
 * and they are not the same claim; the stool needs the stronger one because a stool is drawn on
 * plans in numbers and a byte-identical turn is what keeps the goldens still.
 *
 * Prim count: 6.
 */
export function drawCoatRack(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  // A negative extent (the fuzz feeds one) would make every radius below negative, which is
  // finite and still not a circle; the floor at 0 collapses the symbol onto its centre instead.
  const rad = Math.max(0, short(r) / 2);
  g.ring(c, rad * 0.34);
  g.ring(c, rad * 0.16, "extraThin");
  for (let i = 0; i < 4; i++) {
    const a = ((i * 90 + 45) * Math.PI) / 180;
    g.dot({ x: c.x + Math.cos(a) * rad * 0.72, y: c.y + Math.sin(a) * rad * 0.72 }, rad * 0.14, g.body, "extraThin");
  }
  return g.nodes;
}

/**
 * The shoe cabinet: a slim carcass, the door splits along the run, and a TILT line inside each
 * door.
 *
 * The tilt lines are the symbol. A shoe cabinet is a shallow box whose doors hinge at the floor
 * and fall out toward the room, and the diagonal inside each bay is the drafting shorthand for
 * exactly that — the same shorthand a door leaf's swing arc is. Without them the piece is a
 * `sideboard` drawn at half the depth, which is not a distinction a reader can make.
 *
 * Every diagonal leans the SAME way and they lean toward the FRONT (bottom) edge, so the symbol
 * says which side the doors fall into — the linework the catalog's `directional: true` rests
 * on.
 *
 * Prim count: `1 + (doors - 1) + doors`, i.e. 6 at the catalogued 800x300 (3 doors).
 */
export function drawShoeCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const doors = clampCount(r.w / r.h, 2, 4);
  for (let i = 1; i < doors; i++) {
    const x = r.x + (r.w * i) / doors;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }
  for (let i = 0; i < doors; i++) {
    const x0 = r.x + (r.w * (i + 0.16)) / doors;
    const x1 = r.x + (r.w * (i + 0.84)) / doors;
    g.seg({ x: x0, y: r.y + r.h * 0.14 }, { x: x1, y: r.y + r.h * 0.86 }, "extraThin");
  }
  return g.nodes;
}
