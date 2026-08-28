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
 * A shrub: four overlapping lobes round a centre — the massed, cloud-like outline a bush
 * takes in plan, as against the single canopy of a tree.
 *
 * The lobes sit at a 90-degree pitch and their radius is chosen so `d + rl` is exactly the
 * half-extent, which both fills the footprint and keeps every lobe inside it. Four of them
 * is what makes the symbol quarter-turn invariant; five would read no better and would put
 * the catalog's `symmetric` claim at odds with the drawing.
 */
export function drawShrub(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = shortSide(r) * 0.5;
  const d = rad * 0.55;
  const lobe = rad * 0.45;
  for (let i = 0; i < 4; i++) g.ring(polar(c, d, i * 90), lobe);
  g.dot(c, rad * 0.1, g.stroke, "extraThin");
  return g.nodes;
}

/**
 * A hedge: the run's outline with its clipped face scalloped along the length.
 *
 * Unlike a tree this one is a RUN, so the scallop count comes from the footprint's own
 * aspect — one lobe per depth — and is clamped to twelve, because a 10000x10 fuzz rect would
 * otherwise ask for a thousand. The lobe radius is the smaller of HALF THE DEPTH and half the
 * pitch: the first limb is what makes a lobe fill the run's full width, so the symbol reads as
 * clipped foliage rather than as balls in a box, and the second is what keeps a nearly square
 * hedge (two lobes over a short run) from pushing its first lobe out through the end.
 */
export function drawHedge(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  g.poly(rectPoly(r), "none");
  const n = clamp(Math.round(long / short), 2, 12);
  const lobe = Math.min(short * 0.5, (long / n) * 0.49);
  for (let i = 0; i < n; i++) g.ring(alongPt(r, (i + 0.5) / n, 0), lobe, "extraThin");
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Garden furniture

/**
 * A barbecue: the cooking body with its bars, and the side shelf across the back.
 *
 * The shelf is what makes this `directional` — it is the side that goes against the wall or
 * the fence, so `anchor top` can derive the quarter-turn that puts the cook on the open
 * side. It is drawn in the basin colour rather than the body colour so the two read apart at
 * plan scale, which is the same trick the kitchen sink's bowls use.
 */
export function drawBbq(r: Rect, g: GlyphCtx): SceneNode[] {
  const shelf: Rect = { x: r.x, y: r.y, w: r.w, h: r.h * 0.22 };
  const body: Rect = { x: r.x, y: r.y + r.h * 0.22, w: r.w, h: r.h * 0.78 };
  g.poly(roundedRectPoly(body, shortSide(body) * 0.18), g.body);
  g.poly(rectPoly(shelf), g.basin, "extraThin");
  for (const f of [0.25, 0.5, 0.75]) {
    const y = body.y + body.h * f;
    g.seg({ x: body.x + body.w * 0.08, y }, { x: body.x + body.w * 0.92, y }, "extraThin");
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
 * A patio chair: the seat with its slatted back along the top edge.
 *
 * Deliberately NOT `directional`, for the reason every other seat in the catalog is not:
 * seating is arranged rather than installed, and a chair with its back to the room — or to
 * the fence — is a layout, not a defect. The symbol still has a front, which is what the
 * slats say; nothing derives a rotation from it.
 */
export function drawOutdoorChair(r: Rect, g: GlyphCtx): SceneNode[] {
  g.poly(roundedRectPoly(r, shortSide(r) * 0.15), g.body);
  const backY = r.y + r.h * 0.26;
  g.seg({ x: r.x, y: backY }, { x: r.x + r.w, y: backY }, "extraThin");
  for (const f of [0.3, 0.5, 0.7]) {
    const x = r.x + r.w * f;
    g.seg({ x, y: r.y + r.h * 0.06 }, { x, y: backY }, "extraThin");
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
 * A bicycle: two wheels, the frame between them, the bars and the saddle.
 *
 * Read off the footprint's own LONG axis (see {@link alongPt}), so a rack turned across a
 * path draws a bicycle rather than a different object. The wheel radius is the smaller of a
 * fraction of the length and a fraction of the width, which is what keeps both wheels inside
 * a footprint of any aspect — including the 10000x10 the fuzz asks about.
 *
 * The frame is drawn as two segments through an offset apex rather than one straight bar:
 * two rings and a line read as a trolley, and the triangle is what says bicycle.
 */
export function drawBicycle(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long, short } = axes(r);
  const wheel = Math.min(long * 0.16, short * 0.45);
  const rear = alongPt(r, 0.18, 0);
  const front = alongPt(r, 0.82, 0);
  g.ring(rear, wheel);
  g.ring(front, wheel);
  const apex = alongPt(r, 0.5, -0.25);
  g.seg(rear, apex, "extraThin");
  g.seg(apex, front, "extraThin");
  g.seg(alongPt(r, 0.8, -0.45), alongPt(r, 0.8, 0.45), "extraThin");
  g.seg(alongPt(r, 0.42, -0.12), alongPt(r, 0.42, 0.12), "extraThin");
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
