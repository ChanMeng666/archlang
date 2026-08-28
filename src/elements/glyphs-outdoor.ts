/**
 * The OUTDOOR plan symbols: what a site plan draws once the drawing leaves the building —
 * planting, garden furniture, the things parked on a driveway, and the small standing
 * objects (a bin, a mailbox, a charge point) a survey records.
 *
 * Every other glyph module answers the question "what belongs in this ROOM?". This one
 * answers "what belongs on this SITE?", and that difference decides two of its conventions:
 *
 * - **Nothing here is `requiresWall`.** That flag means SERVICES and only services — the
 *   plumbed and vented goods, and the cabinet that hangs off a wall by definition. A hot
 *   tub is plumbed in reality and is still not `requiresWall` here, because it is set down
 *   on a deck rather than fixed to a wall, and `W_FIXTURE_FLOATING`'s own remedy line
 *   ("supply/waste/venting runs in the wall") is simply false about it. Five of the
 *   twenty-one are `directional` — a shed's door, a barbecue's shelf, a mailbox's flap, a
 *   charger's pedestal and a bin's lid all have a back worth turning to something — and ten
 *   are `symmetric`, which for a tree or a parasol is not a simplification but the truth:
 *   a canopy in plan has no front.
 *
 * - **Planting is drawn UNFILLED.** A tree, a shrub and a pergola all sit *over* ground
 *   that has to keep reading through them — a path, a terrace, a parking bay. So their
 *   canopies are `"none"`-filled outlines, and the pergola is dashed all the way round for
 *   the same reason `upper_cabinet` is: it is above the cut plane. The pieces that stand ON
 *   the ground and hide it (a shed, a barbecue, a bin) carry `g.body` as every indoor
 *   symbol does.
 *
 * Otherwise this module obeys exactly the contract the five domain modules before it do,
 * and it is worth restating because it is what makes a symbol survive contact with a real
 * plan:
 *
 *   - Symbols draw with their **back along the TOP edge** of the footprint;
 *     `furniture.render()` quarter-turns the result about the footprint centre.
 *   - **Every measure is a FRACTION of `r.w`/`r.h`**, never an absolute millimetre, so a
 *     piece sized by hand and one sized from `defaultFootprint` draw the same symbol at two
 *     scales, and a degenerate aspect (the fuzz feeds 10000x10, `hasFixtureGlyph` probes
 *     1x1) still lands inside its own footprint with finite numbers.
 *   - **Every repeat count is clamped** — the hedge's scallops are the only count derived
 *     from an aspect ratio here, and it is held to twelve.
 *   - Two pen weights only: the outline of a piece is `thin`, anything inside it is
 *     `extraThin`. The heavier half of the ramp belongs to the built fabric.
 *   - No text. A glyph is read, not labelled.
 *
 * Pure and deterministic: fixed angles through `Math.cos`/`sin`, no clock, no randomness.
 */

import type { Point } from "../ast.js";
import type { SceneNode } from "../scene.js";
import type { GlyphCtx, Rect } from "./glyph-lib.js";
import {
  centerOf,
  clamp,
  dashedPoly,
  ellipsePoly,
  insetRect,
  insetRectSides,
  insetRectXY,
  rectPoly,
  roundedRectPoly,
  shortSide,
} from "./glyph-lib.js";

/**
 * The point at `deg` (screen degrees: 0 = +x, 90 = +y, i.e. DOWN) and radius `rad` about
 * `c`. Local for the same reason `glyphs-misc.ts`'s copy is: the two modules are the only
 * ones that reach for trigonometry, and a shared helper would be one import for one line.
 */
function polar(c: Point, rad: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) };
}

/**
 * A closed star/scallop ring: `lobes` outer points at `rOuter` alternating with `lobes`
 * inner points at `rInner`, starting at 0 degrees.
 *
 * The one shape three of the planting symbols are built from, and the reason they can
 * honestly claim `symmetric: true`: with `lobes` a multiple of four the vertex list maps
 * onto itself under a quarter-turn — an even index stays even, because the rotation shifts
 * it by `lobes / 2`, which is even. A tree in plan has no front, and this is what makes the
 * DRAWING say so rather than a flag asserting it.
 *
 * `rInner` near `rOuter` gives the soft scalloped canopy of a broadleaf; well under it
 * gives the spiky one of a conifer. Same helper, one number apart.
 */
function starPoly(c: Point, lobes: number, rOuter: number, rInner: number): Point[] {
  const pts: Point[] = [];
  const n = lobes * 2;
  for (let i = 0; i < n; i++) pts.push(polar(c, i % 2 === 0 ? rOuter : rInner, (i * 360) / n));
  return pts;
}

/** The long/short extents of a footprint and which page axis the long one runs on. */
function axes(r: Rect): { horizontal: boolean; long: number; short: number } {
  const horizontal = r.w >= r.h;
  return { horizontal, long: horizontal ? r.w : r.h, short: horizontal ? r.h : r.w };
}

/**
 * A point given in (along, across) coordinates of a footprint's own long axis: `u` runs
 * 0..1 from one end of the long side, `v` is a signed fraction of the short side about its
 * centreline.
 *
 * Three symbols here read off their own long axis rather than off the page — a bicycle, a
 * swing beam, a washing line — exactly as `drawBookshelf` does, so a piece turned 90 degrees
 * draws the same object instead of a different one. Written once rather than three times
 * because the sign conventions are easy to get subtly wrong in each copy.
 */
function alongPt(r: Rect, u: number, v: number): Point {
  const { horizontal } = axes(r);
  return horizontal ? { x: r.x + r.w * u, y: r.y + r.h * (0.5 + v) } : { x: r.x + r.w * (0.5 + v), y: r.y + r.h * u };
}

/**
 * The PAGE bearing, in screen degrees, of a direction given in a footprint's own
 * (along, across) axes — the angular twin of {@link alongPt}.
 *
 * A symbol that reads off its own long axis and then names an angle in page degrees is right
 * on one orientation and wrong on the other: the hedge's scallops would bulge off the ends of
 * a run stood on end instead of off its faces. Routing every bearing through this keeps the
 * two consistent by construction.
 */
function dirDeg(r: Rect, du: number, dv: number): number {
  const { horizontal } = axes(r);
  const rad = horizontal ? Math.atan2(dv, du) : Math.atan2(du, dv);
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Planting

/**
 * A broadleaf tree: a softly scalloped canopy, the crown ring inside it, and the trunk.
 *
 * The canopy is UNFILLED — a tree overhangs a path, a lawn or a parking bay, and all three
 * have to keep reading underneath it. Sixteen vertices at a 22.5-degree pitch, so the symbol
 * maps onto itself under every quarter-turn (see {@link starPoly}); the catalog's
 * `symmetric: true` for this category is therefore a fact about the drawing, not a
 * convenience.
 */
export function drawTree(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  g.poly(starPoly(c, 8, rad, rad * 0.86), "none");
  g.ring(c, rad * 0.34, "extraThin");
  g.dot(c, rad * 0.12);
  return g.nodes;
}

/**
 * A conifer: the same construction as {@link drawTree} with the inner radius pulled in, so
 * the canopy reads as needled rather than leafed.
 *
 * One number apart on purpose. A pine and an oak are the same plan object — a canopy over a
 * trunk — and drawing them from two constructions would make them differ in ways that carry
 * no meaning, while the one difference a reader is entitled to (soft edge vs spiky) is
 * exactly the number that changed.
 */
export function drawConifer(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  g.poly(starPoly(c, 8, rad, rad * 0.46), "none");
  g.ring(c, rad * 0.28, "extraThin");
  g.dot(c, rad * 0.1);
  return g.nodes;
}

/**
 * The eight lobes of a {@link drawShrub}, as `[bearing°, centre distance, lobe radius]` —
 * the last two as fractions of the enclosing radius.
 *
 * **Every row sums `distance + radius` to exactly 1.** That is the containment proof: a point
 * on lobe `i` is within `radius_i` of a centre `distance_i` from the glyph centre, so it is
 * within `1 · R` of that centre, and `R` is half the footprint's short side. No row may be
 * added or edited without preserving the sum.
 *
 * The bearings are deliberately IRREGULAR — 12°, 58°, 104°, … rather than a 45° pitch — and
 * the radii vary with them, because a bush that reads as a bush is lumpy. The first draft of
 * this symbol was four equal circles at a 90° pitch, which is exactly rotation-invariant and
 * reads as a flower. The catalog still calls the category `symmetric`, and that claim is
 * unchanged and still true: it means the piece has no distinguishable BACK, which is a fact
 * about bushes, not a claim that the drawing maps onto itself vertex for vertex. See
 * `test/glyphs-outdoor.test.ts`, which proves the weaker, honest property instead — no side
 * of the outline is favoured.
 */
const SHRUB_LOBES: readonly (readonly [number, number, number])[] = [
  [12, 0.5, 0.5],
  [58, 0.55, 0.45],
  [104, 0.48, 0.52],
  [147, 0.57, 0.43],
  [193, 0.52, 0.48],
  [236, 0.58, 0.42],
  [284, 0.46, 0.54],
  [327, 0.54, 0.46],
];

/**
 * A shrub: a lumpy cloud of eight overlapping lobes, with a scribble of foliage inside it.
 *
 * Only the OUTWARD half of each lobe is drawn — a 160° arc centred on the lobe's own bearing
 * — so the outline is a scalloped cloud rather than eight visible circles. 160° keeps every
 * arc comfortably minor, which is the only kind the Scene's `arc` primitive carries (the
 * large-arc flag is pinned to `0` in every backend, so a wider sweep would be drawn as its
 * complement in some exports and not others).
 *
 * Unfilled, like the tree and the hedge: planting overhangs ground — a path, a bed, a bay —
 * that has to keep reading underneath it.
 *
 * Prim count: 11 (eight lobes, three interior scribbles).
 */
export function drawShrub(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  for (const [deg, dist, lobe] of SHRUB_LOBES) {
    const lc = polar(c, rad * dist, deg);
    g.arcSeg(lc, rad * lobe, polar(lc, rad * lobe, deg - 80), polar(lc, rad * lobe, deg + 80), 1);
  }
  // Three short interior arcs: the mass of foliage inside the outline. Concentric about the
  // centre at three radii and three bearings, so they read as texture rather than as a
  // second, smaller shrub.
  for (const [deg, ring] of [
    [40, 0.2],
    [165, 0.34],
    [275, 0.26],
  ] as const) {
    const rr = rad * ring;
    g.arcSeg(c, rr, polar(c, rr, deg - 50), polar(c, rr, deg + 50), 1, "extraThin");
  }
  return g.nodes;
}

/**
 * A hedge: a clipped RUN, drawn as a scalloped cloud band with no box around it.
 *
 * The first draft outlined the run as a rectangle and put circles inside it, which read as
 * plates on a tray — the rectangle is what makes it read as a container. There is no
 * rectangle here: the outline IS the scallops, a chain of outward-bulging arcs down each long
 * side closed by a half-scallop at each end, and the only interior mark is one dashed
 * centreline.
 *
 * Four constants earn their place:
 *
 *  - **The count** is `clamp(round(aspect × 2), 3, 16)` — a lobe every half-depth of run,
 *    which is what makes a long hedge read as clipped foliage rather than as a lozenge. The
 *    clamp is what bounds the primitive count: a 10000×10 fuzz rect asks for two thousand
 *    lobes and gets sixteen.
 *  - **The radius** is `long / (n + 1.5)`, held to the half-depth and alternating −15% on
 *    every other lobe so consecutive bumps differ. Each arc spans `1.97 × radius` along the
 *    run against a step of about `0.6 × radius`, so neighbours OVERLAP heavily — which is
 *    what fuses them into one outline instead of a row of separate bumps.
 *  - **The sweep** is 120° on a face — only the OUTER BULGE of each lobe, not most of its
 *    circle. At 160° the drawn arcs crossed deep inside one another and the run read as a
 *    chain of overlapping rings rather than as a clipped edge; 120° leaves a shallow scallop
 *    half a radius deep, which is what a hedge face actually looks like. The end caps keep
 *    160°, because a cap's job IS to close the end. Both are comfortably minor, which is the
 *    only kind the Scene's `arc` carries. Each arc's apex is exactly on the run's own face, so
 *    the outline touches the footprint edge and never crosses it.
 *  - **The end-cap radius** is `min(half-depth, quarter-length)`. The first limb is the
 *    natural one; the second is what keeps a nearly-square hedge's two caps from reaching
 *    past each other and out through the opposite end.
 *
 * Every bearing goes through {@link dirDeg}, so a run stood on end draws the same object
 * rather than a hedge with its scallops on the wrong faces.
 *
 * Unfilled, like the tree and the shrub: a hedge is planting, and the ground it overhangs has
 * to read through it.
 *
 * Prim count: `2n + 3` — n lobes a side, two end caps, one dashed centreline. That is 13 on a
 * 1600×700 footprint and 35 at the clamp ceiling, which makes it the one glyph in this module
 * outside the ~2–15 budget the others keep: a run's outline is inherently as long as the run.
 * `test/glyphs-outdoor.test.ts` carves the budget for this family by name.
 */
/** Half the sweep of one FACE scallop, in degrees (the end caps keep the wider 80). */
const FACE_SWEEP = 60;

export function drawHedge(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  const half = short / 2;
  const n = clamp(Math.round((long / short) * 2), 3, 16);
  // The lobe radius comes from the RUN LENGTH, not from the pitch, and is then held to the
  // half-depth. Both limbs are containment: an arc spans `2 sin80 = 1.97` radii along the run,
  // so a radius keyed to the pitch alone puts the first and last lobe out through the ends
  // (it did, by 35 mm on a 1600x700 footprint), and a radius over the half-depth puts the
  // lobe's own centre across the centreline and its far side out through the opposite face.
  const lobe = Math.min(long / (n + 1.5), half);
  const halfSpan = lobe * Math.sin((FACE_SWEEP * Math.PI) / 180);
  // Centres run from one half-span in to one half-span from the far end, so the chain
  // touches both ends exactly. `n` is at least 3, so the divisor is never zero.
  const step = (long - 2 * halfSpan) / (n - 1);
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < n; i++) {
      // Alternate DOWNWARD only: a bigger odd lobe would move the extremes the two clamps
      // above were chosen to hold.
      const rad = lobe * (i % 2 === 0 ? 1 : 0.85);
      const c = alongPt(r, (halfSpan + i * step) / long, (side * (half - rad)) / short);
      const apex = dirDeg(r, 0, side);
      g.arcSeg(c, rad, polar(c, rad, apex - FACE_SWEEP), polar(c, rad, apex + FACE_SWEEP), 1);
    }
  }
  // The two ends, each a half-scallop closing the band.
  const cap = Math.min(half, long * 0.25);
  for (const dir of [-1, 1] as const) {
    const u = dir < 0 ? cap / long : 1 - cap / long;
    const c = alongPt(r, u, 0);
    const apex = dirDeg(r, dir, 0);
    g.arcSeg(c, cap, polar(c, cap, apex - 80), polar(c, cap, apex + 80), 1);
  }
  // One dashed centreline: enough interior to say "clipped run" without competing with the
  // outline. Inset to the end caps' centres so it stays inside them.
  g.seg(alongPt(r, cap / long, 0), alongPt(r, 1 - cap / long, 0), "extraThin", true);
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Garden furniture

/**
 * A barbecue: the kettle body with its grill bars crossed over it, the side shelf, and the
 * two wheels it is rolled on.
 *
 * The first draft was a plain rectangle with four horizontal lines and read as a radiator.
 * What tells a barbecue from a slab is the CROSS grid — bars in both directions — the shelf
 * hanging off one end, and the wheels; all three are here.
 *
 * **`directional`, and the back is the TOP edge**, which is this module's convention and is
 * the right answer for this piece: the shelf is on the RIGHT and the wheels are at the
 * BOTTOM (the front, where the cook stands), so the top edge is the one clear of both and is
 * the side that goes against the wall or the fence. `anchor top` therefore derives the
 * quarter-turn that puts the cook on the open side, with the shelf to their hand.
 *
 * Prim count: 11 (body, shelf, shelf line, 3 + 3 grill bars, two wheels).
 */
export function drawBbq(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(roundedRectPoly(r, s * 0.14), g.body);
  // The side shelf: a band down the right-hand fifth, in the basin colour so it reads apart
  // from the body at plan scale — the same trick the kitchen sink's bowls use.
  const shelf: Rect = { x: r.x + r.w * 0.8, y: r.y + r.h * 0.08, w: r.w * 0.16, h: r.h * 0.84 };
  g.poly(rectPoly(shelf), g.basin, "extraThin");
  g.seg({ x: shelf.x, y: shelf.y + shelf.h / 2 }, { x: shelf.x + shelf.w, y: shelf.y + shelf.h / 2 }, "extraThin");
  // The grill: a 3x3 cross grid over the cooking area, which is everything left of the shelf.
  const grill: Rect = { x: r.x + r.w * 0.08, y: r.y + r.h * 0.14, w: r.w * 0.64, h: r.h * 0.66 };
  for (let i = 1; i <= 3; i++) {
    const x = grill.x + (grill.w * i) / 4;
    g.seg({ x, y: grill.y }, { x, y: grill.y + grill.h }, "extraThin");
  }
  for (let i = 1; i <= 3; i++) {
    const y = grill.y + (grill.h * i) / 4;
    g.seg({ x: grill.x, y }, { x: grill.x + grill.w, y }, "extraThin");
  }
  for (const f of [0.16, 0.62]) {
    g.dot({ x: r.x + r.w * f, y: r.y + r.h * 0.9 }, s * 0.06, g.stroke, "extraThin");
  }
  return g.nodes;
}

/**
 * An outdoor table with its four chairs, the way `dining_table` draws its chair zone.
 *
 * The top is round when the footprint is near-square and eased-rectangular when it is not,
 * because that is the choice a patio table actually offers; both are derived from the same
 * half-extents so the two branches cannot disagree about where the top ends.
 *
 * The chairs hug the FOOTPRINT edges (`half − chairRadius` on each axis) rather than sitting
 * at a fixed radius from the centre. A fixed radius is right for a square table and puts the
 * chairs on top of the table on a long one; hugging the edge is right at every aspect, and
 * it is also what makes the containment exact — a chair's outer edge IS the footprint edge.
 */
export function drawOutdoorTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const s = shortSide(r);
  const rx = r.w / 2 - s * 0.28;
  const ry = r.h / 2 - s * 0.28;
  if (Math.abs(r.w - r.h) <= 0.2 * Math.max(r.w, r.h)) {
    g.poly(ellipsePoly(c.x, c.y, rx, ry), g.body);
  } else {
    g.poly(roundedRectPoly({ x: c.x - rx, y: c.y - ry, w: 2 * rx, h: 2 * ry }, s * 0.12), g.body);
  }
  const seat = s * 0.12;
  for (const p of [
    { x: c.x - (r.w / 2 - seat), y: c.y },
    { x: c.x + (r.w / 2 - seat), y: c.y },
    { x: c.x, y: c.y - (r.h / 2 - seat) },
    { x: c.x, y: c.y + (r.h / 2 - seat) },
  ]) {
    g.ring(p, seat, "extraThin");
  }
  return g.nodes;
}

/**
 * A patio chair: the seat, the back band along the top edge with its SLATS, and an armrest
 * each side.
 *
 * Built on `glyphs-living.ts`'s `drawChair` — seat, back band on the top edge, inset cushion
 * — so the two read as the same kind of object, and separated from it by the SLATS, which is
 * what an outdoor chair actually has. The armrests are what separate it from a `bin`, whose
 * silhouette (a small rounded rect with a line across it) it would otherwise share; they run
 * from a quarter to three quarters of the depth, clear of the eased corners, because the
 * first draft tucked them into the rounding and they vanished.
 *
 * Deliberately NOT `directional`, for the reason every other seat in the catalog is not:
 * seating is arranged rather than installed, and a chair with its back to the room — or to
 * the fence — is a layout, not a defect. The symbol still has a front, which is what the
 * slats say; nothing derives a rotation from it.
 *
 * Prim count: 9 (seat, back band, seat cushion, four slats, two armrests).
 */
export function drawOutdoorChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(roundedRectPoly(r, s * 0.15), g.body);
  const back: Rect = { x: r.x, y: r.y, w: r.w, h: r.h * 0.2 };
  g.poly(roundedRectPoly(back, s * 0.08), g.body);
  g.poly(roundedRectPoly(insetRectSides(r, 0.22, 0.22, 0.3, 0.1), s * 0.1), g.body, "extraThin");
  for (const f of [0.28, 0.43, 0.57, 0.72]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y + r.h * 0.03 }, { x, y: r.y + r.h * 0.17 }, "extraThin");
  }
  for (const f of [0.11, 0.89]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y + r.h * 0.26 }, { x, y: r.y + r.h * 0.74 }, "extraThin");
  }
  return g.nodes;
}

/**
 * A parasol: the eight-segment canopy with its pole at the centre.
 *
 * An octagon rather than a circle, and the eight radials rather than a second ring, is what
 * tells it from a `plant` at a glance — the two would otherwise both be "concentric rings
 * with spokes". The vertices sit at a 45-degree pitch, so the symbol is quarter-turn
 * invariant and the catalog's `symmetric` claim holds.
 */
export function drawUmbrella(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  const verts: Point[] = [];
  for (let i = 0; i < 8; i++) verts.push(polar(c, rad, i * 45));
  g.poly(verts, "none");
  for (const v of verts) g.seg(c, v, "extraThin");
  g.dot(c, rad * 0.12);
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Parked things

/**
 * A bicycle: two wheels, the diamond frame between them, the saddle and the bars.
 *
 * The first draft was two rings and a stick, which reads as a trolley. A bicycle is legible
 * in plan only from its FRAME — the four tubes of the diamond, seat stay and seat tube behind
 * the bottom bracket, top tube and down tube in front of it — so all four are drawn, at
 * `extraThin` so they sit under the wheels rather than competing with them.
 *
 * Read off the footprint's own LONG axis (see {@link alongPt}), so a rack turned across a
 * path draws a bicycle rather than a different object. The wheel radius is the smaller of a
 * fraction of the width and a QUARTER of the length, which is what keeps both wheels inside
 * a footprint of any aspect: a hub at 25% of the run with a radius of at most 25% of it
 * cannot reach past the end. At 1x1 the frame collapses into the wheels and the symbol
 * degenerates to two rings, which is the honest drawing at that size.
 *
 * Prim count: 8 (two wheels, four frame tubes, saddle, handlebar).
 */
export function drawBicycle(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  const wheel = Math.min(short * 0.42, long * 0.24);
  const rear = alongPt(r, 0.25, 0);
  const front = alongPt(r, 0.75, 0);
  g.ring(rear, wheel);
  g.ring(front, wheel);
  // The diamond: bottom bracket on the centreline, seat and head tops above it.
  const bb = alongPt(r, 0.45, 0);
  const seat = alongPt(r, 0.34, -0.32);
  const head = alongPt(r, 0.7, -0.26);
  g.seg(rear, seat, "extraThin"); // seat stay
  g.seg(seat, bb, "extraThin"); // seat tube
  g.seg(seat, head, "extraThin"); // top tube
  g.seg(head, bb, "extraThin"); // down tube
  // The saddle runs ALONG the bike above the rear hub; the bars run ACROSS it at the head,
  // and are deliberately SHORTER than the wheel they sit over — drawn full width they read as
  // a diameter through the front wheel rather than as handlebars above it.
  g.seg(alongPt(r, 0.28, -0.36), alongPt(r, 0.4, -0.36));
  g.seg(alongPt(r, 0.74, -0.32), alongPt(r, 0.74, 0.32));
  return g.nodes;
}

/**
 * A motorcycle: the two wheels with the body slung between them.
 *
 * The body is drawn FIRST and the wheels over it, because the body carries a fill and the
 * wheels do not — the other order would paint the tyres out. Same long-axis reading as
 * {@link drawBicycle}, and the same two-limbed radius clamp.
 */
export function drawMotorcycle(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  const wheel = Math.min(long * 0.13, short * 0.4);
  const a = alongPt(r, 0.28, 0);
  const b = alongPt(r, 0.72, 0);
  const half = short * 0.3;
  g.poly(
    roundedRectPoly(
      {
        x: Math.min(a.x, b.x) - (r.w >= r.h ? 0 : half),
        y: Math.min(a.y, b.y) - (r.w >= r.h ? half : 0),
        w: r.w >= r.h ? Math.abs(b.x - a.x) : 2 * half,
        h: r.w >= r.h ? 2 * half : Math.abs(b.y - a.y),
      },
      half * 0.5,
    ),
    g.body,
  );
  g.ring(alongPt(r, 0.18, 0), wheel);
  g.ring(alongPt(r, 0.82, 0), wheel);
  g.seg(alongPt(r, 0.3, -0.48), alongPt(r, 0.3, 0.48), "extraThin");
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Terrace & lawn

/**
 * A hot tub: the shell, the water inside it, and the four seats round the rim.
 *
 * NOT `requiresWall`, and that is the interesting call in this file. A hot tub is plumbed,
 * and `requiresWall`'s remedy line — "supply/waste/venting runs in the wall" — is exactly
 * the sentence that makes it wrong here: a tub is set down on a deck and fed from below, so
 * flagging one that sits in the middle of a terrace would be a false warning on the normal
 * arrangement. It is `symmetric` instead: you get into it from wherever you are standing.
 */
export function drawHotTub(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  g.poly(roundedRectPoly(r, shortSide(r) * 0.35), g.body);
  const inner = insetRect(r, 0.12);
  g.poly(roundedRectPoly(inner, shortSide(inner) * 0.35), g.basin, "extraThin");
  const seat = shortSide(r) * 0.09;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    g.ring({ x: c.x + sx * r.w * 0.26, y: c.y + sy * r.h * 0.26 }, seat, "extraThin");
  }
  return g.nodes;
}

/**
 * A swing set: the beam down the long axis, an A-frame leg at each end, and the two seats
 * hanging from it.
 *
 * The legs are drawn as the transverse lines they project to — an A-frame seen from above IS
 * a line — rather than as a splayed V, which would be an elevation drawn in a plan.
 */
export function drawSwing(r: Rect, g: GlyphCtx): SceneNode[] {
  const { short } = axes(r);
  g.seg(alongPt(r, 0.06, 0), alongPt(r, 0.94, 0));
  for (const u of [0.06, 0.94]) g.seg(alongPt(r, u, -0.45), alongPt(r, u, 0.45));
  for (const u of [0.35, 0.65]) {
    const c = alongPt(r, u, 0);
    const halfU = short * 0.16;
    const halfV = short * 0.28;
    const horizontal = r.w >= r.h;
    g.poly(
      rectPoly({
        x: c.x - (horizontal ? halfU : halfV),
        y: c.y - (horizontal ? halfV : halfU),
        w: 2 * (horizontal ? halfU : halfV),
        h: 2 * (horizontal ? halfV : halfU),
      }),
      g.body,
      "extraThin",
    );
  }
  return g.nodes;
}

/**
 * A trampoline: the mat, the frame round it, and the springs between the two.
 *
 * Twelve springs at a 30-degree pitch — a multiple of four, so the symbol is quarter-turn
 * invariant. The annulus is deliberately NARROW (the mat is 0.8 of the frame): a wide one
 * with eight spokes is a `plant`, and the two must not read alike on a garden plan where
 * both appear.
 */
export function drawTrampoline(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  const mat = rad * 0.8;
  g.ring(c, rad);
  g.ring(c, mat);
  for (let i = 0; i < 12; i++) g.seg(polar(c, mat, i * 30), polar(c, rad, i * 30), "extraThin");
  return g.nodes;
}

// ---------------------------------------------------------------------------
// The small standing objects

/**
 * A wheelie bin: the body, the lid line at the hinged (back) edge, and the two wheels under
 * it.
 *
 * `directional` — the lid hinges at the back and the wheels are under the same edge, so the
 * drawing says which way it is pulled, and `anchor` can derive the turn that puts its back
 * against the wall it stands beside.
 */
export function drawBin(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.poly(roundedRectPoly(r, s * 0.18), g.body);
  const lidY = r.y + r.h * 0.3;
  g.seg({ x: r.x, y: lidY }, { x: r.x + r.w, y: lidY }, "extraThin");
  for (const f of [0.2, 0.8]) g.dot({ x: r.x + r.w * f, y: r.y + r.h * 0.9 }, s * 0.08, g.stroke, "extraThin");
  return g.nodes;
}

/**
 * A mailbox: the box on its post, the flap across the front, and the flag beside it.
 *
 * Drawn inset from its own footprint on purpose — a letterbox's footprint on a site plan is
 * the space it occupies at arm's length, not the box, and the flag needs somewhere to live
 * that is still inside the rectangle every lint rule measures.
 */
export function drawMailbox(r: Rect, g: GlyphCtx): SceneNode[] {
  const box = insetRectXY(r, r.w * 0.12, r.h * 0.15);
  g.poly(roundedRectPoly(box, shortSide(box) * 0.15), g.body);
  const flapY = box.y + box.h * 0.68;
  g.seg({ x: box.x, y: flapY }, { x: box.x + box.w, y: flapY }, "extraThin");
  const fx = r.x + r.w * 0.95;
  g.seg({ x: fx, y: r.y + r.h * 0.2 }, { x: fx, y: r.y + r.h * 0.5 }, "extraThin");
  return g.nodes;
}

/**
 * An EV charge point: the pedestal against the back edge and the cable hanging off it.
 *
 * The cable is a TRUE arc, for the reason the office chair's back is: the CAD export gets a
 * native curve and no zoom finds facets. It spans 140 degrees — comfortably minor, which is
 * the only kind the Scene's `arc` primitive carries — and its whole circle is inside the
 * lower half of the footprint, so the sampled sweep cannot leave the rectangle at any turn.
 */
export function drawEvCharger(r: Rect, g: GlyphCtx): SceneNode[] {
  const pedestal = insetRectSides(r, 0.2, 0.2, 0.05, 0.5);
  g.poly(roundedRectPoly(pedestal, shortSide(pedestal) * 0.2), g.body);
  const hub: Point = { x: r.x + r.w * 0.5, y: r.y + r.h * 0.62 };
  const rad = Math.min(r.w * 0.3, r.h * 0.28);
  g.arcSeg(hub, rad, polar(hub, rad, 20), polar(hub, rad, 160), 1, "extraThin");
  g.dot(polar(hub, rad, 160), Math.min(r.w, r.h) * 0.06);
  return g.nodes;
}

/**
 * A pergola: the overhead frame, dashed, on four posts.
 *
 * The ONLY symbol in this module whose outline is dashed, and for exactly the reason
 * `upper_cabinet`'s is: a pergola is above the horizontal cut a floor plan is taken at, so
 * drafting convention draws it present-but-not-cut. It is unfilled for the same reason —
 * the terrace, the paving or the planting under it is the whole point of building one, and
 * it has to read through.
 */
export function drawPergola(r: Rect, g: GlyphCtx): SceneNode[] {
  dashedPoly(g, rectPoly(r), "none");
  const posts = insetRect(r, 0.08);
  const rad = shortSide(r) * 0.06;
  for (const p of [
    { x: posts.x, y: posts.y },
    { x: posts.x + posts.w, y: posts.y },
    { x: posts.x + posts.w, y: posts.y + posts.h },
    { x: posts.x, y: posts.y + posts.h },
  ]) {
    g.dot(p, rad, g.stroke, "extraThin");
  }
  return g.nodes;
}

/**
 * A sandpit: the eased kerb with the sand stippled inside it.
 *
 * Five stipple dots in a fixed quincunx — a FIXED count, not one derived from the area, so
 * there is no repeat to run away and the pattern is quarter-turn invariant (which is what
 * the catalog's `symmetric` says about it). A denser stipple would compete with the poché at
 * plan scale; five says "granular fill" and stops.
 */
export function drawSandpit(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(roundedRectPoly(r, shortSide(r) * 0.12), g.body);
  const rad = shortSide(r) * 0.05;
  for (const [fx, fy] of [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.5, 0.5],
    [0.3, 0.7],
    [0.7, 0.7],
  ] as const) {
    g.dot({ x: r.x + r.w * fx, y: r.y + r.h * fy }, rad, g.stroke, "extraThin");
  }
  return g.nodes;
}

/**
 * A fire pit: the rim, the bowl inside it, and the flame.
 *
 * The flame is a four-lobed star rather than a ring of radial ticks, which is the whole
 * design decision here: this module already draws two "concentric rings plus spokes"
 * symbols (`trampoline`, and `plant` next door), and a third would be indistinguishable from
 * both. A spiky shape INSIDE a ring is a different silhouette at any zoom.
 */
export function drawFirePit(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.48;
  g.ring(c, rad);
  g.ring(c, rad * 0.68, "extraThin");
  g.poly(starPoly(c, 4, rad * 0.5, rad * 0.18), "none", "extraThin");
  return g.nodes;
}

/**
 * A garden shed: the carcass, the ridge of its roof, and the door on the front.
 *
 * The ridge is DASHED because it is above the cut plane — the same convention the pergola
 * and `upper_cabinet` follow, and the same one the v1.29 `roof` and `void` elements ship.
 * The door tick is on the BOTTOM edge, so `directional` means something: `anchor top`
 * derives the turn that puts the shed's back against the fence and its door on the garden.
 */
export function drawShed(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(rectPoly(r), g.body);
  const { horizontal } = axes(r);
  if (horizontal) {
    const y = r.y + r.h * 0.5;
    g.seg({ x: r.x + r.w * 0.06, y }, { x: r.x + r.w * 0.94, y }, "extraThin", true);
  } else {
    const x = r.x + r.w * 0.5;
    g.seg({ x, y: r.y + r.h * 0.06 }, { x, y: r.y + r.h * 0.94 }, "extraThin", true);
  }
  const doorY = r.y + r.h * 0.94;
  g.seg({ x: r.x + r.w * 0.35, y: doorY }, { x: r.x + r.w * 0.65, y: doorY }, "extraThin");
  return g.nodes;
}

/**
 * A washing line: a post at each end of the run with the lines strung between them.
 *
 * Read off the long axis like the bicycle, so a line strung north-south draws the same
 * object as one strung east-west. The post radius is clamped against the run length as well
 * as the width, so a very short footprint does not produce two posts that swallow the line.
 */
export function drawClothesline(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  const post = Math.min(short * 0.2, long * 0.05);
  g.dot(alongPt(r, 0.06, 0), post);
  g.dot(alongPt(r, 0.94, 0), post);
  for (const v of [-0.28, 0, 0.28]) g.seg(alongPt(r, 0.06, v), alongPt(r, 0.94, v), "extraThin");
  return g.nodes;
}
