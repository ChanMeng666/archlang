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
 * ## The drawing language
 *
 * The same one the pilot symbols speak (`glyphs-living.ts`, `glyphs-bedroom.ts`): the OUTLINE is a
 * `thin` stroke in the derived symbol ink, filled with the body tint; every interior line is
 * `extraThin`; soft or inner surfaces (a seat, a pane of glass, a cloth, a cushion) take the white
 * `basin` fill. Curves are true arcs (`roundedRectPath`, `bulgeArc`), never facets. Hard furniture
 * (a desk, a cabinet, a counter) is nearly square-cornered, an upholstered or moulded piece is
 * eased. A DASH means one thing only — above the cut plane or hidden inside a closed piece — so the
 * desk's drawer pedestal (under the top) and the office chair's star base (under the seat) are
 * dashed and nothing else is.
 *
 * Every measure below is a FRACTION of `r.w`/`r.h`, never an absolute millimetre, so a piece
 * sized by hand and one sized from `defaultFootprint` draw the same symbol at two scales, and
 * a degenerate aspect (the fuzz feeds 10000x10) still lands inside its own footprint. Every
 * repeat count that could run away — shelf bays, door bays, chairs, pockets — is clamped.
 *
 * Pure and deterministic: closed-form arithmetic and fixed angles; the only trigonometry is the
 * plant's polar lobes (a fixed 45 degree pitch, the same as the planting symbols), and the
 * office chair's five spokes are exact `sqrt` constants rather than `cos`/`sin` calls.
 */

import type { Point } from "../ast.js";
import type { PathEdge, PathLoop, SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import {
  bulgeArc,
  centerOf,
  clamp,
  dashedPoly,
  insetRect,
  mapSceneNode,
  rectPoly,
  roundedRectPath,
  shortSide,
} from "./glyph-lib.js";

/**
 * The point at `deg` (screen degrees: 0 = +x, 90 = +y, i.e. DOWN) and radius `rad` about `c`.
 *
 * Local on purpose: this module and the planting symbols are the only ones that reach for
 * trigonometry at all, so there is no second caller to consolidate it with.
 */
function polar(c: Point, rad: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) };
}

/**
 * The desk: the top with its edge bevel, the modesty panel across its back, the drawer pedestal
 * HIDDEN under the top at the right-hand end (dashed), and the monitor standing at the back.
 *
 * The modesty line sits at 0.12 of the depth from the BACK (top) edge, which is where the
 * panel actually is — so the drawing says which way the user sits without needing a label.
 *
 * **The pedestal is what makes it a desk rather than a `table`**, and it is DASHED because it is
 * under the top: the box of drawers and its two drawer lines are hidden, and a hidden edge is the
 * one thing a dash means here. It is on the RIGHT (the handed choice every asymmetric symbol in
 * this repository makes, and the one `place … mirror` will not flip — turn it with `rotate`), and
 * the monitor bar stands over the knee space beside it, where the user is looking.
 *
 * Prim count: 7.
 */
export function drawDesk(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.01), g.body);
  const top = insetRect(r, 0.035);
  g.path(roundedRectPath(top, s * 0.008), "none", "extraThin");
  const my = r.y + r.h * 0.12;
  g.seg({ x: top.x, y: my }, { x: top.x + top.w, y: my }, "extraThin");
  // The drawer pedestal: under the top, so hidden, so dashed; clear of the bevel on all its sides.
  const ped = { x: r.x + r.w * 0.7, y: r.y + r.h * 0.2, w: r.w * 0.25, h: r.h * 0.72 };
  dashedPoly(g, rectPoly(ped), "none", "extraThin");
  for (const f of [1 / 3, 2 / 3]) {
    const y = ped.y + ped.h * f;
    g.seg({ x: ped.x, y }, { x: ped.x + ped.w, y }, "extraThin", true);
  }
  // The monitor: a slim bar at the back of the working surface, over the knee space.
  const mw = r.w * 0.28;
  const mh = r.h * 0.07;
  g.path(
    roundedRectPath({ x: r.x + r.w * 0.35 - mw / 2, y: r.y + r.h * 0.19, w: mw, h: mh }, mh * 0.35),
    g.basin,
    "extraThin",
  );
  return g.nodes;
}

// The five-pointed star of the office chair's base, as exact constants: cos/sin of 18/36/54/72
// degrees are algebraic in sqrt(5), and `Math.sqrt` is correctly rounded on every platform where
// `Math.cos` is not, so the spokes are the same bytes everywhere.
const SQ5 = Math.sqrt(5);
const COS72 = (SQ5 - 1) / 4;
const COS36 = (SQ5 + 1) / 4;
const SIN72 = Math.sqrt(10 + 2 * SQ5) / 4;
const SIN36 = Math.sqrt(10 - 2 * SQ5) / 4;
/** Unit directions of the five spokes in the page's frame (+y down): one straight to the front. */
const STAR_SPOKES: readonly (readonly [number, number])[] = [
  [0, 1],
  [SIN72, COS72],
  [-SIN72, COS72],
  [SIN36, -COS36],
  [-SIN36, -COS36],
];

/**
 * The swivel office chair: a rounded white seat, a crescent backrest at the back, an armrest each
 * side, and the five-star base HIDDEN under the seat (dashed spokes round a hub).
 *
 * The seat is the outline, drawn first; the dashed spokes are drawn LAST, over the white seat,
 * because a hidden line is shown through the thing that hides it. The backrest is a crescent
 * built of two minor arcs (`bulgeArc`) meeting at its tips, so the CAD export gets native curves
 * and no zoom finds the facets. Every mark is placed symmetrically about the vertical axis, with
 * one spoke straight to the front, so the symbol has no hand.
 *
 * Prim count: 10.
 */
export function drawOfficeChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const m = Math.max(0, shortSide(r));
  const hub: Point = { x: c.x, y: c.y + m * 0.07 };
  g.path(roundedRectPath({ x: hub.x - m * 0.29, y: hub.y - m * 0.27, w: m * 0.58, h: m * 0.54 }, m * 0.14), g.basin);
  // The crescent backrest: two arcs between the same pair of tips, the outer one the deeper.
  const tipY = c.y - m * 0.12;
  const a: Point = { x: c.x - m * 0.31, y: tipY };
  const b: Point = { x: c.x + m * 0.31, y: tipY };
  g.path({ start: a, edges: [...bulgeArc(a, b, m * 0.2), ...bulgeArc(b, a, -m * 0.11)] }, g.body);
  for (const side of [-1, 1]) {
    const x = side < 0 ? c.x - m * 0.42 : c.x + m * 0.33;
    g.path(roundedRectPath({ x, y: c.y - m * 0.02, w: m * 0.09, h: m * 0.3 }, m * 0.045), g.body, "extraThin");
  }
  // The star base, hidden under the seat.
  for (const [dx, dy] of STAR_SPOKES) {
    g.seg(hub, { x: hub.x + dx * m * 0.25, y: hub.y + dy * m * 0.25 }, "extraThin", true);
  }
  g.dot(hub, m * 0.035, undefined, "extraThin");
  return g.nodes;
}

/**
 * The bookshelf: a carcass, the back panel, a divider between bays, and a row of book spines in
 * each bay.
 *
 * The run reads off the footprint's own LONG axis, not off the page, so a stack turned 90 degrees
 * draws the same bays rather than a grid. The divider count is derived from the aspect — one per
 * 1.5 depths of length — and clamped to 8, because a 10000x1 fuzz rect would otherwise ask for
 * six thousand lines; each bay carries three spines, centred and symmetric about the bay, so the
 * piece has no hand. The back is the TOP edge for a run drawn the usual way, and the LEFT edge for
 * one stood on end; the open face is the other side of the back panel.
 *
 * Prim count: `2 + dividers + 3 x (dividers + 1)`, i.e. 13 at the catalogued 900x300.
 */
export function drawBookshelf(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.01), g.body);
  const horizontal = r.w >= r.h;
  const long = horizontal ? r.w : r.h;
  const short = horizontal ? r.h : r.w;
  const n = clamp(Math.floor(long / short / 1.5), 1, 8);
  // (u, v): u along the run, v across it from the back.
  const at = (u: number, v: number): Point => (horizontal ? { x: r.x + u, y: r.y + v } : { x: r.x + v, y: r.y + u });
  const back = short * 0.14;
  g.seg(at(0, back), at(long, back), "extraThin");
  for (let i = 1; i <= n; i++) {
    const u = (long * i) / (n + 1);
    g.seg(at(u, 0), at(u, short), "extraThin");
  }
  // The books: one block per bay, standing off the back panel a gap in from the dividers, split
  // into three spines.
  const bay = long / (n + 1);
  const gap = short * 0.07;
  for (let i = 0; i <= n; i++) {
    const u0 = bay * i + gap;
    const u1 = bay * (i + 1) - gap;
    const a = at(u0, back + gap);
    const b = at(u1, back + short * 0.5);
    g.path(
      roundedRectPath(
        { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
        short * 0.015,
      ),
      g.basin,
      "extraThin",
    );
    for (const f of [1 / 3, 2 / 3]) {
      const u = u0 + (u1 - u0) * f;
      g.seg(at(u, back + gap), at(u, back + short * 0.5), "extraThin");
    }
  }
  return g.nodes;
}

/**
 * One lobe-ring outline: `lobes` circular lobes round `c`, lobe `j` centred on bearing
 * `j × 360 / lobes` and bulging out to `apex(j)`, consecutive lobes meeting at cusps on the circle
 * of radius `cusp`. The planting symbols' scallop (`glyphs-outdoor.ts`), restated here for the
 * plant at its small scale; with a lobe count that is a multiple of four and an `apex` that is a
 * function of `j mod 2` it maps onto itself under every quarter-turn and mirror of the square.
 */
function lobeRing(c: Point, lobes: number, cusp: number, apex: (j: number) => number): PathLoop {
  const step = 360 / lobes;
  const cuspAt = (j: number): Point => polar(c, cusp, (j - 0.5) * step);
  const start = cuspAt(0);
  const edges: PathEdge[] = [];
  const mid = cusp * Math.cos((step / 2) * (Math.PI / 180));
  for (let j = 0; j < lobes; j++) {
    const to = j === lobes - 1 ? start : cuspAt(j + 1);
    edges.push(...bulgeArc(j === 0 ? start : cuspAt(j), to, apex(j) - mid));
  }
  return { start, edges };
}

/**
 * The potted plant: a scalloped crown of foliage over its pot, the pot ring, and the leaf ribs.
 *
 * - **Foliage** (outline pen, filled with `theme.lawn`, as a tree's crown is): eight lobes in the
 *   tree's [1, 0.9] radius pattern, so the crown reads as foliage and not as a gear.
 * - **Pot**: a ring at 0.45 of the crown radius, with the stem dot at the centre.
 * - **Ribs**: eight `extraThin` strokes from the pot out to just short of the lobe cusps, one on each
 *   of the eight bearings.
 *
 * Every mark is on the eight bearings of the square (or a circle about the centre), so the whole
 * symbol maps onto itself under every quarter-turn and mirror — the catalog's `symmetric: true`
 * for this category is a fact about the drawing (`test/glyphs-misc.test.ts` proves it).
 *
 * Prim count: 11.
 */
export function drawPlant(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  g.path(
    lobeRing(c, 8, rad * 0.78, (j) => (j % 2 === 0 ? rad : rad * 0.88)),
    g.theme.lawn,
  );
  g.ring(c, rad * 0.42, "extraThin");
  for (let i = 0; i < 8; i++) g.seg(polar(c, rad * 0.42, i * 45), polar(c, rad * 0.7, i * 45), "extraThin");
  g.dot(c, rad * 0.06, undefined, "thin");
  return g.nodes;
}

/**
 * The car in plan, as a CAD block draws it: the body, the bonnet and boot panels, the windscreen
 * and rear window, the roof, the door pillars, and a mirror each side.
 *
 * The long axis is the driving direction, drawn top-to-bottom like every other symbol's
 * depth, with the BONNET at the top, so `rotate 90` parks it across a garage the same way it
 * turns a bed. Lateral measures are fractions of the width and longitudinal ones of the length:
 *
 * - **Body** (outline pen): a rounded rectangle 91% of the width, its nose corners eased more
 *   (36% of the body width) than its tail corners (26%), centred so the mirrors have room.
 * - **Bonnet and boot**: rounded panels inset 9% of the body width from the nose and the tail, so
 *   the panel gap stays an even band round the curved ends whatever the length.
 * - **Glass**: the windscreen and the rear window are white trapezoids, widest where they meet the
 *   bonnet and the boot and narrower where they meet the roof panel, which is a rounded rectangle
 *   between them.
 * - **Doors**: one pillar line each side at the middle of the roof, from the body's flank to the
 *   roof's edge.
 * - **Mirrors**: a small rounded pod each side at the foot of the windscreen, standing off the
 *   body and **inside the footprint** — a fixture's footprint is what every clearance and
 *   collision rule measures, and a symbol that drew outside it would make the drawing and the
 *   lint disagree about where the car is.
 *
 * Symmetric about its long axis, so it is not handed. Prim count: 10.
 */
export function drawCar(r: Rect, g: GlyphCtx): SceneNode[] {
  const bw = r.w * 0.91;
  const x0 = r.x + (r.w - bw) / 2;
  const H = r.h;
  const y = (f: number): number => r.y + H * f;
  const bx = (f: number): number => x0 + bw * f;
  const noseR = bw * 0.36;
  const tailR = bw * 0.26;
  g.path(roundedRectPath({ x: x0, y: r.y, w: bw, h: H }, [noseR, noseR, tailR, tailR]), g.body);

  // The bonnet and boot panels, an even gap in from the curved nose and tail.
  const gap = Math.min(bw * 0.09, H * 0.05);
  g.path(
    roundedRectPath({ x: x0 + gap, y: r.y + gap, w: bw - 2 * gap, h: H * 0.235 - gap }, [
      noseR - gap,
      noseR - gap,
      bw * 0.03,
      bw * 0.03,
    ]),
    "none",
    "extraThin",
  );
  g.path(
    roundedRectPath({ x: x0 + gap, y: y(0.765), w: bw - 2 * gap, h: H * 0.235 - gap }, [
      bw * 0.03,
      bw * 0.03,
      tailR - gap,
      tailR - gap,
    ]),
    "none",
    "extraThin",
  );

  // The glass: widest at the bonnet / boot, narrower at the roof.
  g.poly(
    [
      { x: bx(0.12), y: y(0.245) },
      { x: bx(0.88), y: y(0.245) },
      { x: bx(0.81), y: y(0.355) },
      { x: bx(0.19), y: y(0.355) },
    ],
    g.basin,
    "extraThin",
  );
  g.path(roundedRectPath({ x: bx(0.19), y: y(0.37), w: bw * 0.62, h: H * 0.25 }, bw * 0.05), g.body, "extraThin");
  g.poly(
    [
      { x: bx(0.19), y: y(0.635) },
      { x: bx(0.81), y: y(0.635) },
      { x: bx(0.86), y: y(0.745) },
      { x: bx(0.14), y: y(0.745) },
    ],
    g.basin,
    "extraThin",
  );

  // The pillar line of each door, from the flank to the roof's edge.
  for (const [a, b] of [
    [0.03, 0.19],
    [0.81, 0.97],
  ] as const) {
    g.seg({ x: bx(a), y: y(0.495) }, { x: bx(b), y: y(0.495) }, "extraThin");
  }
  // A mirror each side at the foot of the windscreen, standing off the body, inside the footprint.
  const mw = r.w * 0.07;
  const mh = Math.min(H * 0.028, r.w * 0.09);
  for (const x of [r.x, r.x + r.w - mw]) {
    g.path(roundedRectPath({ x, y: y(0.285), w: mw, h: mh }, mh * 0.4), g.body, "extraThin");
  }
  return g.nodes;
}

/**
 * The sun lounger: the frame, and on it the three cushions of a reclining lounger — the RAISED
 * BACK at the head with a headrest on it, the seat, and the leg rest — each a white rounded panel
 * with a small gap between them, so the splits between the sections are what say "lounger".
 *
 * The head is the TOP edge, which is this module's back-on-top convention doing its usual
 * work — `rotate 90` lays the lounger along an east wall with its head to the east, and
 * `in <room> anchor …` never derives a turn for it, because the catalog leaves it neither
 * `requiresWall` nor `directional`: a lounger is aimed at the sun, and ArchLang has no sun
 * model (the `site` layer names an aspect, not a daylight measurement). So which way it
 * faces is the author's to state and nothing here will second-guess it.
 *
 * Symmetric about its long axis. Prim count: 5.
 */
export function drawSunLounger(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.08), g.body);
  const inset = s * 0.09;
  const x = r.x + inset;
  const w = r.w - 2 * inset;
  const panel = (f0: number, f1: number): void =>
    g.path(roundedRectPath({ x, y: r.y + r.h * f0, w, h: r.h * (f1 - f0) }, s * 0.04), g.basin, "extraThin");
  panel(0.035, 0.31); // the raised back
  panel(0.325, 0.56); // the seat
  panel(0.575, 0.965); // the leg rest
  // The headrest, a small bolster on the raised back.
  g.path(
    roundedRectPath({ x: x + w * 0.18, y: r.y + r.h * 0.06, w: w * 0.64, h: r.h * 0.05 }, s * 0.02),
    g.body,
    "extraThin",
  );
  return g.nodes;
}

// ---------------------------------------------------------------------------
// ── office & commercial ──
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

/** The chair-zone band of a meeting table, as a fraction of the footprint's short side. */
const MEETING_BAND = 0.22;
/** The spacing of the chairs along a side, in chair-zone bands (the pilot dining table's pitch). */
const CHAIR_PITCH = 2.2;
/** The fraction of a chair's depth tucked under the table top. */
const CHAIR_TUCK = 0.3;

/**
 * A dining-style chair whose VISIBLE part is `box`, its backrest along the `back` edge, built
 * back-on-top and quarter-turned into place.
 *
 * Mirrors `chairInto` in `glyphs-living.ts` (the pilot dining chair) construction for
 * construction: a white rounded seat set in from the sides, square-fronted where it runs under a
 * table, and a pill-ended backrest bar 12% of the FULL depth along the back edge. It is mirrored
 * rather than imported because that module owns it and is edited alongside this one; the second
 * caller for it in `glyph-lib.ts` is the planting module's outdoor table, and it moves there then.
 */
function chairInto(g: GlyphCtx, box: Rect, back: "top" | "right" | "bottom" | "left", tuck: number): void {
  const deg = back === "top" ? 0 : back === "right" ? 90 : back === "bottom" ? 180 : 270;
  const sideways = deg === 90 || deg === 270;
  const c = centerOf(box);
  const w = sideways ? box.h : box.w;
  const vis = sideways ? box.w : box.h;
  const full = vis / (1 - tuck);
  const r: Rect = { x: c.x - w / 2, y: c.y - vis / 2, w, h: vis };
  const from = g.nodes.length;
  const sr = Math.min(w, full) * 0.12;
  const seat: Rect = { x: r.x + w * 0.06, y: r.y + full * 0.08, w: w * 0.88, h: vis - full * 0.08 };
  g.path(roundedRectPath(seat, tuck > 0 ? [sr, sr, 0, 0] : sr), g.basin);
  const bar: Rect = { x: r.x, y: r.y, w, h: full * 0.12 };
  g.path(roundedRectPath(bar, bar.h / 2), g.body);
  if (deg === 0) return;
  const turn = (p: Point): Point => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return deg === 90
      ? { x: c.x - dy, y: c.y + dx }
      : deg === 180
        ? { x: c.x - dx, y: c.y - dy }
        : { x: c.x + dy, y: c.y - dx };
  };
  for (let i = from; i < g.nodes.length; i++) g.nodes[i] = mapSceneNode(g.nodes[i]!, turn, false);
}

/**
 * The meeting table: an eased boardroom top inside a chair-zone band, with the pilot dining
 * chairs tucked under it, backrests out.
 *
 * It is `drawDiningTable`'s construction with two deliberate differences, and both carry meaning.
 * The top is eased (a boardroom table is drawn rounded, and it is what tells the two apart on a
 * plan that has both), and the run takes up to SIX chairs a side rather than four, since a
 * meeting table is the long one. The chairs are the dining chairs, because a chair is a chair:
 * a seat and a backrest bar, tucked 30% under the top so each meets the table instead of floating
 * beside it.
 *
 * **The declared footprint is the whole meeting zone, chairs included**, exactly as
 * `dining_table`'s is: the dimension a plan needs to check is the one you cannot pull a chair
 * out of, so a 2400 mm table is authored as roughly 3000 mm of footprint. The top is drawn FIRST —
 * it is the symbol's outline — then its bevel, then each chair's visible part. Chairs per LONG
 * side: one per 2.2 chair bands of top length, `[1, 6]` (the pitch the dining table uses, which
 * makes a SQUARE footprint seat one a side and keeps `symmetric: true` honest); plus one at each
 * end.
 *
 * Prim count: `2 + 2 x chairs`, i.e. 18 at the catalogued 2400x1200 (3 a side and 2 ends).
 */
export function drawMeetingTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const band = shortSide(r) * MEETING_BAND;
  const top: Rect = { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band };
  const st = shortSide(top);
  g.path(roundedRectPath(top, st * 0.14), g.body);
  g.path(roundedRectPath(insetRect(top, 0.04), st * 0.1), "none", "extraThin");

  const horizontal = r.w >= r.h;
  const runStart = horizontal ? top.x : top.y;
  const runLen = horizontal ? top.w : top.h;
  const perSide = clampCount(runLen / (CHAIR_PITCH * band), 1, 6);
  const cd = band;
  const cw = band * 0.9;
  const vis = cd * (1 - CHAIR_TUCK);
  const at = (along: number, back: "top" | "bottom" | "left" | "right"): void => {
    const box: Rect =
      back === "top"
        ? { x: along - cw / 2, y: top.y - vis, w: cw, h: vis }
        : back === "bottom"
          ? { x: along - cw / 2, y: top.y + top.h, w: cw, h: vis }
          : back === "left"
            ? { x: top.x - vis, y: along - cw / 2, w: vis, h: cw }
            : { x: top.x + top.w, y: along - cw / 2, w: vis, h: cw };
    chairInto(g, box, back, CHAIR_TUCK);
  };
  for (let i = 0; i < perSide; i++) {
    const along = runStart + (runLen * (i + 0.5)) / perSide;
    if (horizontal) {
      at(along, "top");
      at(along, "bottom");
    } else {
      at(along, "left");
      at(along, "right");
    }
  }
  if (horizontal) {
    at(top.y + top.h / 2, "left");
    at(top.y + top.h / 2, "right");
  } else {
    at(top.x + top.w / 2, "top");
    at(top.x + top.w / 2, "bottom");
  }
  return g.nodes;
}

/**
 * A closed ring through the rectilinear polygon `pts` (drawn CLOCKWISE on the page) as a `path`:
 * a TRUE quarter-circle fillet of radius `rad[i]` at each vertex whose radius is positive, a sharp
 * corner at each whose radius is 0. Every radius is held to half of the shorter incident edge, so
 * a fillet never overruns its edges, and every corner must be a right angle — the fillet centre is
 * `v + (u_prev + u_next) x rad`, which is only `rad` from both edges when they meet square.
 *
 * The curved counterpart of `glyph-lib`'s `easedRing`, which tessellates the same corner. The
 * reception counter is its only caller, so it stays here; the one sharp corner it needs is the
 * reflex vertex of the L, which is a seam in the real joinery rather than a radius.
 */
function orthoRing(pts: readonly Point[], rad: readonly number[]): PathLoop {
  const n = pts.length;
  const at = (i: number): Point => pts[((i % n) + n) % n]!;
  const info = (i: number): { entry: Point; exit: Point; center: Point; rr: number } => {
    const v = at(i);
    const p = at(i - 1);
    const q = at(i + 1);
    const lp = Math.hypot(p.x - v.x, p.y - v.y);
    const lq = Math.hypot(q.x - v.x, q.y - v.y);
    const rr = clamp(rad[((i % n) + n) % n] ?? 0, 0, Math.min(lp, lq) / 2);
    const up = lp > 0 ? { x: (p.x - v.x) / lp, y: (p.y - v.y) / lp } : { x: 0, y: 0 };
    const uq = lq > 0 ? { x: (q.x - v.x) / lq, y: (q.y - v.y) / lq } : { x: 0, y: 0 };
    return {
      entry: { x: v.x + up.x * rr, y: v.y + up.y * rr },
      exit: { x: v.x + uq.x * rr, y: v.y + uq.y * rr },
      center: { x: v.x + (up.x + uq.x) * rr, y: v.y + (up.y + uq.y) * rr },
      rr,
    };
  };
  const first = info(0);
  const start = first.exit;
  const edges: PathEdge[] = [];
  let cur = start;
  const line = (to: Point): void => {
    if (to.x !== cur.x || to.y !== cur.y) edges.push({ t: "line", to });
    cur = to;
  };
  for (let i = 1; i <= n; i++) {
    const k = info(i);
    line(k.entry);
    if (k.rr > 0) {
      edges.push({ t: "arc", to: k.exit, center: k.center, r: k.rr, sweep: 1 });
      cur = k.exit;
    }
  }
  return { start, edges };
}

/**
 * The reception desk: an L-shaped counter — a run along the back with a return down the left —
 * with the raised transaction ledge along its two outer faces, the nosing line on each of its two
 * working faces, and the staff chair inside the L.
 *
 * The L is what makes it a reception desk rather than a `desk`: you are met ACROSS a counter,
 * and the return is what turns a table into one. It is built with {@link orthoRing}, a `path`
 * whose five outer corners are true fillets and whose reflex corner is left sharp — that corner
 * is a seam in the real joinery, not a radius. The ledge runs along the visitor side (the top and
 * the left), the nosings along the staff side.
 *
 * **The chair is in the BOTTOM-RIGHT quadrant, which is the inside of the L**, with its back to
 * the open side and its seat toward the counter, so the drawing says which side the staff are on
 * and therefore which way the counter faces. That is what the catalog's `directional: true` rests
 * on. The handedness is fixed (the return is on the left) and carries the same known limitation
 * every asymmetric symbol here does: `place … mirror` transforms a resolved element's position,
 * not the glyph, so turn it with `rotate`.
 *
 * Prim count: 7.
 */
export function drawReceptionDesk(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const runY = y0 + r.h * 0.42; // the front face of the back run
  const retX = x0 + r.w * 0.3; // the inner face of the left-hand return
  const e = s * 0.05;
  g.path(
    orthoRing(
      [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: runY },
        { x: retX, y: runY }, // the reflex corner: a seam, not a radius
        { x: retX, y: y1 },
        { x: x0, y: y1 },
      ],
      [e, e, e, 0, e, e],
    ),
    g.body,
  );
  // The transaction ledge, a step in from the two outer (visitor) faces, held clear of the fillets.
  const led = s * 0.12;
  g.seg({ x: x0 + led, y: y0 + led }, { x: x1 - led, y: y0 + led }, "extraThin");
  g.seg({ x: x0 + led, y: y0 + led }, { x: x0 + led, y: y1 - led }, "extraThin");
  // The nosing on each working face (the staff side).
  const nose = s * 0.06;
  g.seg({ x: retX + led, y: runY - nose }, { x: x1 - led, y: runY - nose }, "extraThin");
  g.seg({ x: retX - nose, y: runY + led }, { x: retX - nose, y: y1 - led }, "extraThin");
  // The staff chair, in the open quadrant, its back to the far side.
  const cs = Math.max(0, Math.min(r.h * 0.34, r.w * 0.14));
  const cc = { x: x0 + r.w * 0.62, y: runY + (y1 - runY) * 0.58 };
  chairInto(g, { x: cc.x - cs / 2, y: cc.y - cs / 2, w: cs, h: cs }, "bottom", 0);
  return g.nodes;
}

/**
 * The filing cabinet: a narrow carcass, the top's edge bevel, three drawer lines across it, and
 * the pull on the front edge.
 *
 * The drawer lines run ACROSS the piece and the pull is on the FRONT (bottom) edge, which is
 * the whole orientation claim — a filing cabinet you cannot open is one drawn with its drawers
 * into the wall, and the catalogued 600 mm `clearanceMm` is what reserves the room to pull one
 * out. Three lines rather than a derived count: a filing cabinet is a two-, three- or
 * four-drawer object at one depth, so there is no aspect worth reading and a fixed count is the
 * honest drawing. The pull is a small pill, the way a drawer handle is drawn in plan.
 *
 * Prim count: 6.
 */
export function drawFilingCabinet(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.015), g.body);
  const top = insetRect(r, 0.08);
  g.path(roundedRectPath(top, s * 0.01), "none", "extraThin");
  for (const f of [0.25, 0.5, 0.75]) {
    const y = r.y + r.h * f;
    g.seg({ x: top.x, y }, { x: top.x + top.w, y }, "extraThin");
  }
  const ph = Math.max(0, s * 0.045);
  g.path(
    roundedRectPath({ x: r.x + r.w * 0.34, y: r.y + r.h * 0.875 - ph / 2, w: r.w * 0.32, h: ph }, ph / 2),
    g.basin,
    "extraThin",
  );
  return g.nodes;
}

/**
 * The locker run: a carcass with its door-front line near the front face, split into narrow
 * doors, each with a pull on its front.
 *
 * A run of lockers is a repeat, so the door count is derived from the aspect — roughly one
 * 300 mm door per unit of depth — and clamped to `[2, 6]`: at the ceiling the doors are still
 * legible bays, and past it they close into a hatch at plan scale. A divider is the carcass's own
 * partition and runs the full depth. Every pull is on the FRONT (bottom) edge, which is the
 * orientation claim: lockers open into the room, never into the wall behind them.
 *
 * Prim count: `2 + (doors - 1) + doors`, i.e. 7 at the catalogued 1200x450 (3 doors).
 */
export function drawLocker(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.01), g.body);
  const frontY = r.y + r.h * 0.95;
  g.seg({ x: r.x, y: frontY }, { x: r.x + r.w, y: frontY }, "extraThin");
  const doors = clampCount(r.w / r.h, 2, 6);
  for (let i = 1; i < doors; i++) {
    const x = r.x + (r.w * i) / doors;
    g.seg({ x, y: r.y }, { x, y: r.y + r.h }, "extraThin");
  }
  for (let i = 0; i < doors; i++) {
    const cx = r.x + (r.w * (i + 0.5)) / doors;
    const half = (r.w / doors) * 0.14;
    g.seg({ x: cx - half, y: r.y + r.h * 0.82 }, { x: cx + half, y: r.y + r.h * 0.82 }, "extraThin");
  }
  return g.nodes;
}

/**
 * The pool table: the frame (the rail), the cushion band inside it, the playing cloth, and the
 * six pockets.
 *
 * The pockets are the symbol, and they are placed off the footprint's own LONG axis rather than
 * off the page — four at the corners of the cloth and two at the middle of the long rails, so a
 * table drawn portrait gets its middle pockets on its own long sides instead of on its ends.
 * That is the same long-axis reading `drawBookshelf` does, for the same reason: a piece turned
 * 90 degrees must draw the same object.
 *
 * Three nested outlines say what a pool table is made of: the rail (the outline, 6.5% of the
 * short side deep), the cushion rubber inside it (to 12%), and the cloth, which is `basin`-filled —
 * this vocabulary's "a distinct surface sitting inside the piece" convention — and is what stops
 * the symbol reading as a `rug` with dots on it. The pockets are solid discs on the cloth's
 * corners and rail midpoints.
 *
 * Prim count: 9.
 */
export function drawPoolTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.035), g.body);
  const cushion = insetRect(r, 0.065);
  g.path(roundedRectPath(cushion, s * 0.02), g.body, "extraThin");
  const cloth = insetRect(r, 0.12);
  g.path(roundedRectPath(cloth, s * 0.012), g.basin, "extraThin");
  const pocket = Math.max(0, s * 0.036);
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
    g.dot({ x: px, y: py }, pocket, undefined, "extraThin");
  }
  return g.nodes;
}

/**
 * The treadmill: the frame, the console at the wall end with its display, the two side platforms
 * and the belt between them.
 *
 * The console is at the BACK (top) edge — this module's convention, and also where a treadmill's
 * console really is, because the machine is set with its motor end against a wall and you run
 * facing it. So `directional` is a fact the drawing shows, and the catalogued 900 mm
 * `clearanceMm` reserves the run-off space behind you, which is the one thing a gym plan can be
 * wrong about.
 *
 * The belt is a stadium (a rounded rectangle at half its width: the loop of the belt round its
 * two rollers) filled `basin`, and the platforms stand either side of it, so the three read as
 * the deck you stand on rather than as three parallel strips of nothing in particular.
 *
 * Prim count: 6.
 */
export function drawTreadmill(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.05), g.body);
  const con: Rect = { x: r.x + r.w * 0.1, y: r.y + r.h * 0.035, w: r.w * 0.8, h: r.h * 0.13 };
  g.path(roundedRectPath(con, s * 0.04), g.body, "extraThin");
  g.path(
    roundedRectPath({ x: con.x + con.w * 0.14, y: con.y + con.h * 0.22, w: con.w * 0.72, h: con.h * 0.5 }, s * 0.015),
    g.basin,
    "extraThin",
  );
  const deckTop = r.y + r.h * 0.21;
  const deckH = r.h * 0.74;
  for (const x of [r.x + r.w * 0.075, r.x + r.w * 0.795]) {
    g.path(roundedRectPath({ x, y: deckTop, w: r.w * 0.13, h: deckH }, s * 0.04), g.body, "extraThin");
  }
  const belt: Rect = { x: r.x + r.w * 0.255, y: deckTop, w: r.w * 0.49, h: deckH };
  g.path(roundedRectPath(belt, Math.min(belt.w, belt.h) / 2), g.basin, "extraThin");
  return g.nodes;
}
