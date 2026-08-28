/**
 * The remaining plan symbols: the workspace pieces, the two that belong to no room at
 * all (a plant, a parked car), and the one that belongs outdoors (a sun lounger).
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
import { clamp, easedRing, insetRect, insetRectXY, rectPoly, roundedRectPoly } from "./glyph-lib.js";

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
 * The desk: a slab with the modesty panel across its back, the working edge stepped in, a
 * drawer pedestal down one side, and the cable grommet.
 *
 * The modesty line sits at 0.12 of the depth from the BACK (top) edge, which is where the
 * panel actually is — so the drawing says which way the user sits without needing a label.
 *
 * **The pedestal is what makes it a desk rather than a `table`.** Three primitives — a slab, a
 * line and an inset outline — is a table with a rule across it, and the two categories were
 * telling a reader nothing apart at plan scale. A desk has a box of drawers under one end and a
 * hole for the cables, so both are drawn: the pedestal on the RIGHT (the handed choice every
 * asymmetric symbol in this repository makes, and the one `place … mirror` will not flip — turn
 * it with `rotate`), and the grommet at the back left, where a cable actually drops.
 *
 * Prim count: 7.
 */
export function drawDesk(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const my = r.y + r.h * 0.12;
  g.seg({ x: r.x, y: my }, { x: r.x + r.w, y: my }, "extraThin");
  g.poly(rectPoly(insetRect(r, 0.06)), "none", "extraThin");
  // The drawer pedestal, clear of the stepped edge on all three of its free sides.
  const ped = { x: r.x + r.w * 0.68, y: r.y + r.h * 0.24, w: r.w * 0.26, h: r.h * 0.68 };
  g.poly(rectPoly(ped), g.body, "extraThin");
  for (const f of [1 / 3, 2 / 3]) {
    const y = ped.y + ped.h * f;
    g.seg({ x: ped.x, y }, { x: ped.x + ped.w, y }, "extraThin");
  }
  g.dot({ x: r.x + r.w * 0.24, y: r.y + r.h * 0.24 }, Math.min(r.w, r.h) * 0.05, g.basin, "extraThin");
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

/**
 * The sun lounger: an eased body, the raised backrest at the head, and the slats across the
 * seat and leg rest.
 *
 * The head is the TOP edge, which is this module's back-on-top convention doing its usual
 * work — `rotate 90` lays the lounger along an east wall with its head to the east, and
 * `in <room> anchor …` never derives a turn for it, because the catalog leaves it neither
 * `requiresWall` nor `directional`: a lounger is aimed at the sun, and ArchLang has no sun
 * model (the v1.25 `site` layer names an aspect, not a daylight measurement). So which way it
 * faces is the author's to state and nothing here will second-guess it.
 *
 * The slats run TRANSVERSE — across the short axis of the drawn rectangle — and their count
 * comes from the footprint's own aspect, clamped to four..six. A real lounger has a dozen or
 * more, and drawing them would turn the symbol into a hatch at plan scale; four to six reads
 * as slatted without competing with the poché.
 *
 * Prim count: `2 + slats`, i.e. 8 on a typical 700x1900 lounger.
 */
export function drawSunLounger(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.min(r.w, r.h);
  g.poly(roundedRectPoly(r, s * 0.2), g.body);
  g.poly(
    roundedRectPoly({ x: r.x + r.w * 0.08, y: r.y + r.h * 0.05, w: r.w * 0.84, h: r.h * 0.26 }, s * 0.12),
    g.body,
    "extraThin",
  );
  // `clamp` lands a NaN (the `0/0` of a zero-area footprint) on the floor of 4, and pins an
  // `Infinity` (a zero-WIDTH one) to 6 — so the loop bound below is always an integer in
  // [4, 6] and `n - 1` is never zero.
  const n = clamp(Math.round((r.h / r.w) * 6), 4, 6);
  for (let i = 0; i < n; i++) {
    const y = r.y + r.h * (0.4 + (0.52 * i) / (n - 1));
    g.seg({ x: r.x + r.w * 0.1, y }, { x: r.x + r.w * 0.9, y }, "extraThin");
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// ── v1.32 F2: office & commercial ──
//
// Six families that take the drawing out of a house and into a workplace: the table a meeting
// happens round, the counter someone is met at, the two boxes an office stores things in, and
// the two large objects a room is given over to. Appended at the foot of the file for the same
// reason they are appended to `FIXTURE_FAMILIES`: that table's order is the LEGEND's order.

/**
 * A repeat count derived from an aspect ratio, rounded and clamped to `[lo, hi]` — the same
 * guard `glyphs-living.ts` states at length, restated here because two of the symbols below
 * derive a count and `clamp` alone does not round.
 *
 * The NaN case is what makes it a function rather than an expression: a zero-area footprint
 * makes an aspect `0/0`, `Math.round(NaN)` is `NaN`, and {@link clamp} lands that on `lo`
 * instead of passing it into a loop bound.
 */
function clampCount(v: number, lo: number, hi: number): number {
  return clamp(Math.round(v), lo, hi);
}

/**
 * The meeting table: a long eased top inside a chair-zone band, with the chairs drawn in it as
 * RINGS.
 *
 * It is `drawDiningTable`'s construction with two deliberate differences, and both carry
 * meaning. The top is eased rather than square-cornered, which is how a boardroom table is
 * drawn and what tells the two apart on a plan that has both. And the seats are rings rather
 * than squares, which is the office-chair symbol this module already draws — a meeting is sat
 * at in swivel chairs.
 *
 * **The declared footprint is the whole meeting zone, chairs included**, exactly as
 * `dining_table`'s is: the dimension a plan needs to check is the one you cannot pull a chair
 * out of, so a 2400 mm table is authored as roughly 3000 mm of footprint. Seats run along the
 * two LONG edges, `clamp(round(aspect x 1.4), 1, 6)` per side, plus one at each short end when
 * the aspect is under 2 — the same boundary and for the same reason as the dining table's: a
 * square table is sat at all round and a long one is not.
 *
 * Prim count: `2 + chairs`, i.e. 8 at the catalogued 2400x1200 (3 per long side, no ends).
 */
export function drawMeetingTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.min(r.w, r.h);
  const band = s * 0.2;
  const top: Rect = { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band };
  g.poly(roundedRectPoly(top, Math.min(top.w, top.h) * 0.14), g.body);
  const inner = insetRect(top, 0.06);
  g.poly(roundedRectPoly(inner, Math.min(inner.w, inner.h) * 0.12), "none", "extraThin");

  const horizontal = r.w >= r.h;
  const aspect = horizontal ? r.w / r.h : r.h / r.w;
  const perSide = clampCount(aspect * 1.4, 1, 6);
  const seat = Math.max(0, band * 0.42);
  const runStart = horizontal ? top.x : top.y;
  const runLen = horizontal ? top.w : top.h;
  for (let i = 0; i < perSide; i++) {
    const along = runStart + (runLen * (i + 0.5)) / perSide;
    if (horizontal) {
      g.ring({ x: along, y: r.y + band / 2 }, seat, "extraThin");
      g.ring({ x: along, y: r.y + r.h - band / 2 }, seat, "extraThin");
    } else {
      g.ring({ x: r.x + band / 2, y: along }, seat, "extraThin");
      g.ring({ x: r.x + r.w - band / 2, y: along }, seat, "extraThin");
    }
  }
  // `NaN < 2` is false, so a zero-area footprint takes the no-end-chairs branch.
  if (aspect < 2) {
    if (horizontal) {
      g.ring({ x: r.x + band / 2, y: r.y + r.h / 2 }, seat, "extraThin");
      g.ring({ x: r.x + r.w - band / 2, y: r.y + r.h / 2 }, seat, "extraThin");
    } else {
      g.ring({ x: r.x + r.w / 2, y: r.y + band / 2 }, seat, "extraThin");
      g.ring({ x: r.x + r.w / 2, y: r.y + r.h - band / 2 }, seat, "extraThin");
    }
  }
  return g.nodes;
}

/**
 * The reception desk: an L-shaped counter — a run along the back with a return down the left —
 * the nosing line on each of its two working faces, and the chair inside the L.
 *
 * The L is what makes it a reception desk rather than a `desk`: you are met ACROSS a counter,
 * and the return is what turns a table into one. It is built from `glyph-lib`'s
 * {@link easedRing} with the reflex corner left sharp — that corner is a seam in the real
 * joinery, not a radius — which is the same construction `drawSofaL` uses and the reason the
 * helper moved out of `glyphs-living.ts` when this symbol was written.
 *
 * **The chair is in the BOTTOM-RIGHT quadrant, which is the inside of the L**, so the drawing
 * says which side the staff are on and therefore which way the counter faces. That is what the
 * catalog's `directional: true` rests on. The handedness is fixed (the return is on the left)
 * and carries the same known limitation every asymmetric symbol here does: `place … mirror`
 * transforms a resolved element's position, not the glyph, so turn it with `rotate`.
 *
 * Prim count: 4.
 */
export function drawReceptionDesk(r: Rect, g: GlyphCtx): SceneNode[] {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const runY = y0 + r.h * 0.42; // the front face of the back run
  const retX = x0 + r.w * 0.3; // the inner face of the left-hand return
  g.poly(
    easedRing(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: runY },
        { x: retX, y: runY }, // the reflex corner: a seam, not a radius
        { x: retX, y: y1 },
        { x: x0, y: y1 },
      ],
      [true, true, true, false, true, true],
      Math.min(r.w, r.h) * 0.1,
    ),
    g.body,
  );
  // The nosing on each working face, held clear of the eased corners.
  g.seg({ x: retX + r.w * 0.04, y: runY - r.h * 0.06 }, { x: x1 - r.w * 0.04, y: runY - r.h * 0.06 }, "extraThin");
  g.seg({ x: retX - r.w * 0.06, y: runY + r.h * 0.06 }, { x: retX - r.w * 0.06, y: y1 - r.h * 0.04 }, "extraThin");
  g.ring({ x: x0 + r.w * 0.62, y: y0 + r.h * 0.72 }, Math.max(0, Math.min(r.w * 0.09, r.h * 0.13)), "extraThin");
  return g.nodes;
}

/**
 * The filing cabinet: a narrow carcass, its top outline, three drawer lines, and the pull tick
 * on the front edge.
 *
 * The drawer lines run ACROSS the piece and the pull is on the FRONT (bottom) edge, which is
 * the whole orientation claim — a filing cabinet you cannot open is one drawn with its drawers
 * into the wall, and the catalogued 600 mm `clearanceMm` is what reserves the room to pull one
 * out. Three lines rather than a derived count: a filing cabinet is a two-, three- or
 * four-drawer object at one depth, so there is no aspect worth reading and a fixed count is the
 * honest drawing.
 *
 * Prim count: 6.
 */
export function drawFilingCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  g.poly(rectPoly(insetRect(r, 0.08)), "none", "extraThin");
  for (const f of [0.25, 0.5, 0.75]) {
    const y = r.y + r.h * f;
    g.seg({ x: r.x, y }, { x: r.x + r.w, y }, "extraThin");
  }
  g.seg({ x: r.x + r.w * 0.36, y: r.y + r.h * 0.9 }, { x: r.x + r.w * 0.64, y: r.y + r.h * 0.9 }, "extraThin");
  return g.nodes;
}

/**
 * The locker run: a carcass split into narrow doors, each with a vent tick on the room face.
 *
 * A run of lockers is a repeat, so the door count is derived from the aspect — roughly one
 * 300 mm door per unit of depth — and clamped to `[2, 6]`: at the ceiling the doors are still
 * legible bays, and past it they close into a hatch at plan scale. Every vent is on the FRONT
 * (bottom) edge, which is the orientation claim: lockers open into the room, never into the
 * wall behind them.
 *
 * Prim count: `1 + (doors - 1) + doors`, i.e. 6 at the catalogued 1200x450 (3 doors).
 */
export function drawLocker(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const doors = clampCount(r.w / r.h, 2, 6);
  for (let i = 1; i < doors; i++) {
    const x = r.x + (r.w * i) / doors;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }
  for (let i = 0; i < doors; i++) {
    const cx = r.x + (r.w * (i + 0.5)) / doors;
    const half = (r.w / doors) * 0.24;
    g.seg({ x: cx - half, y: r.y + r.h * 0.84 }, { x: cx + half, y: r.y + r.h * 0.84 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The pool table: the eased frame, the playing surface inside it, and the six pockets.
 *
 * The pockets are the symbol, and they are placed off the footprint's own LONG axis rather than
 * off the page — four at the corners of the cloth and two at the middle of the long rails, so a
 * table drawn portrait gets its middle pockets on its own long sides instead of on its ends.
 * That is the same long-axis reading `drawBookshelf` does, for the same reason: a piece turned
 * 90 degrees must draw the same object.
 *
 * The cloth is `basin`-filled, which is this vocabulary's "a distinct surface sitting inside the
 * piece" convention (a sink's bowls, a car's cabin, a hot tub's water), and it is what stops the
 * symbol reading as a `rug` with dots on it.
 *
 * Prim count: 8.
 */
export function drawPoolTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.min(r.w, r.h);
  g.poly(roundedRectPoly(r, s * 0.12), g.body);
  const cloth = insetRect(r, 0.12);
  g.poly(roundedRectPoly(cloth, Math.min(cloth.w, cloth.h) * 0.08), g.basin, "extraThin");
  const pocket = Math.max(0, s * 0.07);
  const cx = cloth.x + cloth.w / 2;
  const cy = cloth.y + cloth.h / 2;
  const mids: [number, number][] =
    r.w >= r.h
      ? [
          [cx, cloth.y],
          [cx, cloth.y + cloth.h],
        ]
      : [
          [cloth.x, cy],
          [cloth.x + cloth.w, cy],
        ];
  for (const [px, py] of [
    [cloth.x, cloth.y],
    [cloth.x + cloth.w, cloth.y],
    [cloth.x + cloth.w, cloth.y + cloth.h],
    [cloth.x, cloth.y + cloth.h],
    ...mids,
  ] as const) {
    g.ring({ x: px, y: py }, pocket, "extraThin");
  }
  return g.nodes;
}

/**
 * The treadmill: the frame, the console band at the wall end, the belt, and the two side rails.
 *
 * The console is at the BACK (top) edge — this module's convention, and also where a treadmill's
 * console really is, because the machine is set with its motor end against a wall and you run
 * facing it. So `directional` is a fact the drawing shows, and the catalogued 900 mm
 * `clearanceMm` reserves the run-off space behind you, which is the one thing a gym plan can be
 * wrong about.
 *
 * The belt is `basin`-filled and the rails are drawn OVER it rather than beside it, because a
 * rail is above the belt in section and the two would otherwise read as three parallel strips of
 * nothing in particular.
 *
 * Prim count: 5.
 */
export function drawTreadmill(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.min(r.w, r.h);
  g.poly(roundedRectPoly(r, s * 0.1), g.body);
  const console_ = { x: r.x + r.w * 0.08, y: r.y + r.h * 0.05, w: r.w * 0.84, h: r.h * 0.12 };
  g.poly(rectPoly(console_), g.body, "extraThin");
  const belt = { x: r.x + r.w * 0.22, y: r.y + r.h * 0.22, w: r.w * 0.56, h: r.h * 0.72 };
  g.poly(rectPoly(belt), g.basin, "extraThin");
  for (const f of [0.14, 0.86]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y + r.h * 0.24 }, { x, y: r.y + r.h * 0.8 }, "extraThin");
  }
  return g.nodes;
}
