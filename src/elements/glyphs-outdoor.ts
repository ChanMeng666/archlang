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
 *   twenty-one are `directional` — a shed's door, a barbecue's controls, a mailbox's flap, a
 *   charger's pedestal and a bin's handle all have a back worth turning to something — and
 *   eleven are `symmetric`, which for a tree or a parasol is not a simplification but the
 *   truth: a canopy in plan has no front.
 *
 * - **Planting is a canopy, and a canopy masks the ground.** The tree, the conifer, the shrub
 *   and the hedge are each ONE closed outline filled with `theme.lawn`, so the ground hatch
 *   under them is painted out and the crown reads as one clean mass (in `mono` the tint is
 *   white like every tint, and the outline carries the symbol). The pergola is the opposite
 *   case: it is ABOVE the cut plane, so it is dashed and unfilled for the reason
 *   `upper_cabinet` is — the terrace under it has to read through. The pieces that stand ON
 *   the ground (a shed, a barbecue, a bin) carry `g.body` as every indoor symbol does, and
 *   the soft or inner surfaces (a seat, a sand field, a tub's water) the white `g.basin`.
 *
 * The line language is the indoor one: an OUTLINE in the `thin` pen and the derived symbol
 * ink, DETAIL (bars, joints, springs, slats) in `extraThin`; curves are true arcs (`path`),
 * never tessellated polygons; dashed means overhead or hidden and nothing else (the pergola's
 * frame, a shed's ridge, a hedge's hidden stem line).
 *
 * Otherwise this module obeys exactly the contract the domain modules before it do, and it
 * is worth restating because it is what makes a symbol survive contact with a real plan:
 *
 *   - Symbols draw with their **back along the TOP edge** of the footprint;
 *     `furniture.render()` quarter-turns the result about the footprint centre.
 *   - **Every measure is a FRACTION of `r.w`/`r.h`**, never an absolute millimetre, so a
 *     piece sized by hand and one sized from `defaultFootprint` draw the same symbol at two
 *     scales, and a degenerate aspect (the fuzz feeds 10000x10, `hasFixtureGlyph` probes
 *     1x1) still lands inside its own footprint with finite numbers.
 *   - **Every repeat count is clamped** — the hedge's scallops, the pergola's rafters and the
 *     patio table's chairs are the counts derived from an aspect ratio here, and each is held.
 *   - Two pen weights only. The heavier half of the ramp belongs to the built fabric.
 *   - No text. A glyph is read, not labelled.
 *
 * Pure and deterministic: fixed angles through `Math.cos`/`sin`, no clock, no randomness.
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
  insetRectSides,
  mapSceneNode,
  ovalPath,
  polar,
  rectPoly,
  roundedRectPath,
  scallopPath,
  shortSide,
} from "./glyph-lib.js";

/**
 * A closed star ring: `lobes` outer points at `rOuter` alternating with `lobes` inner points at
 * `rInner`, starting at 0 degrees. With `lobes` a multiple of four the vertex list maps onto
 * itself under a quarter-turn and every mirror of the square, which is what lets a star-built
 * symbol claim `symmetric: true` as a fact about the drawing.
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
 * A point given in a footprint's own (along, across) frame, in MILLIMETRES: `a` runs along the
 * long side from its start, `b` across it from the centreline.
 *
 * Five symbols here read off their own long axis rather than off the page — a bicycle, a
 * motorcycle, a swing beam, a washing line, a hedge — exactly as `drawBookshelf` does, so a
 * piece turned 90 degrees draws the same object instead of a different one. The map for a run
 * stood on end swaps the two page axes, which is a REFLECTION: a loop drawn clockwise in the
 * frame comes out anticlockwise on the page, which is why {@link drawHedge} flips the sign of
 * its bulges there.
 */
function axisPt(r: Rect, a: number, b: number): Point {
  return axes(r).horizontal ? { x: r.x + a, y: r.y + r.h / 2 + b } : { x: r.x + r.w / 2 + b, y: r.y + a };
}

/** The rectangle `a0..a1` along × `b0..b1` across in a footprint's own frame (see {@link axisPt}). */
function axisRect(r: Rect, a0: number, a1: number, b0: number, b1: number): Rect {
  return axes(r).horizontal
    ? { x: r.x + a0, y: r.y + r.h / 2 + b0, w: a1 - a0, h: b1 - b0 }
    : { x: r.x + r.w / 2 + b0, y: r.y + a0, w: b1 - b0, h: a1 - a0 };
}

/** An oval centred at `(a, b)` in a footprint's own frame, `ra` along by `rb` across. */
function axisOval(r: Rect, a: number, b: number, ra: number, rb: number): PathLoop {
  const p = axisPt(r, a, b);
  return axes(r).horizontal ? ovalPath(p.x, p.y, ra, rb) : ovalPath(p.x, p.y, rb, ra);
}

/**
 * `n` reflected across the footprint's vertical centre line (`across`) or its horizontal one —
 * the far twin of a mirrored PAIR (a chair's two arms, a washing line's two cross-arms).
 *
 * A pair built as two separate stadiums is not reliably a mirror pair: `roundedRectPath` leaves a
 * sub-ulp straight run wherever `x1 - r` and `x0 + r` round apart, which depends on where the
 * piece sits, so one twin can carry an extra degenerate edge the other lacks — and the symmetry
 * probe (`analyze/symmetry.ts`) then calls a symmetric symbol handed at some positions. A twin
 * made by reflection has the same edges by construction. The point map is `mirrorNode`'s.
 */
function mirroredTwin(n: SceneNode, r: Rect, across: boolean): SceneNode {
  const c = centerOf(r);
  return mapSceneNode(n, (p) => (across ? { x: c.x + (c.x - p.x), y: p.y } : { x: p.x, y: c.y + (c.y - p.y) }), true);
}

/** A stadium (both ends fully round) filling `rect` — a tyre, a bar, a handle. */
const pill = (rect: Rect): PathLoop => roundedRectPath(rect, shortSide(rect) / 2);

// ---------------------------------------------------------------------------
// Planting

/**
 * A broadleaf tree: a scalloped CANOPY, eight forked branches, and the trunk.
 *
 * - **Canopy** (outline pen, filled with `theme.lawn`): sixteen lobes on cusps at 0.82 of the
 *   crown radius. The eight on the axes and diagonals ask for the full radius and are held to
 *   semicircles (0.96 of it); the eight between them reach 0.9 — a period-2 pattern, so the
 *   crown reads as foliage rather than a gear and still has the square's symmetry. Filled, so a
 *   ground hatch under a tree is masked by the crown instead of showing through it; `lawn`
 *   because a crown is planting, and in `mono` it is white like every tint, which leaves the
 *   outline to carry the symbol.
 * - **Branches** (detail pen): eight from 0.12 to 0.42 of the crown radius on the axes and
 *   diagonals, each forking symmetrically into two twigs that reach 0.62.
 * - **Trunk**: an outline-ink disc at the centre.
 *
 * Every mark is placed on the eight D4 bearings or symmetrically about them, so the symbol maps
 * onto itself under every quarter-turn and mirror — the catalog's `symmetric: true` for this
 * category is a fact about the drawing (`test/glyphs-outdoor.test.ts` proves it).
 *
 * Prim count: 26.
 */
export function drawTree(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  // Floored at 0, so a negative extent (the fuzz feeds one) collapses the tree onto its centre.
  const rad = Math.max(0, shortSide(r) * 0.48);
  g.path(
    scallopPath(c, 16, rad * 0.82, (j) => (j % 2 === 0 ? rad : rad * 0.9)),
    g.theme.lawn,
  );
  for (let k = 0; k < 8; k++) {
    const b = k * 45;
    const fork = polar(c, rad * 0.42, b);
    g.seg(polar(c, rad * 0.12, b), fork, "extraThin");
    for (const t of [-1, 1]) g.seg(fork, polar(c, rad * 0.62, b + t * 12), "extraThin");
  }
  g.dot(c, rad * 0.05, undefined, "thin");
  return g.nodes;
}

/**
 * A conifer: a sixteen-point needled star round the same trunk the broadleaf {@link drawTree}
 * has.
 *
 * - **Canopy** (outline pen, `theme.lawn` fill like every planting canopy): sixteen tips on the
 *   crown radius alternating with sixteen notches at 0.6 of it. Sixteen sharp teeth against the
 *   tree's sixteen round lobes is the one difference a reader is entitled to — needled versus
 *   leafed — and it is a straight-edged outline, so it stays a polygon.
 * - **Spokes** (detail pen): eight whorl lines from the trunk to 0.78 of the crown, on the axes
 *   and diagonals — each one runs out to a tip.
 * - **Trunk**: the outline-ink disc, the same radius and pen as the tree's.
 *
 * Every mark sits on the eight D4 bearings, so the drawing maps onto itself under every
 * quarter-turn and mirror.
 *
 * Prim count: 10.
 */
export function drawConifer(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  g.poly(starPoly(c, 16, rad, rad * 0.6), g.theme.lawn);
  for (let k = 0; k < 8; k++) g.seg(polar(c, rad * 0.1, k * 45), polar(c, rad * 0.78, k * 45), "extraThin");
  g.dot(c, rad * 0.05, undefined, "thin");
  return g.nodes;
}

/**
 * A shrub: a closed, lobed CLOUD with a smaller cloud of foliage inside it.
 *
 * - **Outline** (outline pen, `theme.lawn` fill): eight lobes on cusps at 0.78 of the radius,
 *   each bulging out to the full radius — one continuous {@link scallopPath}, so the cloud is
 *   closed with no gap between its arcs and masks the ground like the tree's crown. Eight big
 *   lobes against the tree's sixteen small ones is what tells a bush from a crown at a glance.
 * - **Inner foliage** (detail pen, unfilled): the same cloud at a third of the size, turned
 *   half a lobe so its puffs sit in the outline's cusps.
 *
 * Eight lobes on the axes and diagonals and an inner ring turned by exactly half a lobe: both
 * map onto themselves under every quarter-turn and mirror, so the catalog's `symmetric: true`
 * is now proved the way the tree's is, vertex for vertex.
 *
 * Prim count: 2.
 */
export function drawShrub(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  g.path(
    scallopPath(c, 8, rad * 0.78, () => rad),
    g.theme.lawn,
  );
  g.path(
    scallopPath(c, 8, rad * 0.5, () => rad * 0.62),
    "none",
    "extraThin",
  );
  return g.nodes;
}

/** The most scallops a hedge draws down EACH face; past it the scallops widen instead. */
const HEDGE_MAX_LOBES = 30;

/**
 * A hedge: one continuous SCALLOPED BAND — both long faces scalloped, both ends rounded — filled
 * with `theme.lawn`, with the hidden stem line dashed down its middle.
 *
 * Read in the run's own frame (see {@link axisPt}), so a hedge stood on end draws the same band.
 * With `D` the depth and `L` the length:
 *
 *  - **The core** is the band's centre `0.64 D` deep; each scallop bulges `0.18 D` out of it, so
 *    every scallop's crown lands exactly ON the footprint face and never past it.
 *  - **The ends** are each one round cap of radius `0.32 D` (the core's half-depth), reaching
 *    exactly to the footprint's end.
 *  - **The scallops**: `n = clamp(round(face / 0.7 D), 1, 30)` a face, evenly pitched along the
 *    face between the caps. The clamp is what bounds the outline: one path of `2n + 4` edges at
 *    most, so even a garden-length run (the fuzz feeds 10000×10) is one node of 64 edges, its
 *    scallops widening rather than multiplying.
 *
 * One `path`, so the band is closed and fills: the old symbol was a row of separate arcs that
 * read as overlapping circles and could not mask the ground under it. Uniform scallops on both
 * faces make it mirror-symmetric along and across the run.
 *
 * Prim count: 2 (the band and its stem line).
 */
export function drawHedge(r: Rect, g: GlyphCtx): SceneNode[] {
  const { horizontal, long, short } = axes(r);
  const L = Math.max(0, long);
  const D = Math.max(0, short);
  const depth = D * 0.18;
  const h = D / 2 - depth;
  const face = L - 2 * h;
  const n = clamp(Math.round(face / (D * 0.7)), 1, HEDGE_MAX_LOBES);
  const pitch = face / n;
  const lobe = Math.min(depth, pitch / 2);
  // Clockwise in the run's own frame; a run stood on end is mirrored onto the page, so its
  // outward bulge is the other sign there.
  const out = horizontal ? 1 : -1;
  const start = axisPt(r, h, -h);
  const edges: PathEdge[] = [];
  let cur = start;
  const to = (p: Point, sag: number): void => {
    edges.push(...bulgeArc(cur, p, out * sag));
    cur = p;
  };
  for (let i = 1; i <= n; i++) to(axisPt(r, h + pitch * i, -h), lobe);
  to(axisPt(r, L - h, h), h);
  for (let i = n - 1; i >= 0; i--) to(axisPt(r, h + pitch * i, h), lobe);
  to(start, h);
  g.path({ start, edges }, g.theme.lawn);
  g.seg(axisPt(r, h, 0), axisPt(r, L - h, 0), "extraThin", true);
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Garden furniture

/** Grill bars across a barbecue's grate. */
const GRILL_BARS = 6;

/**
 * A gas barbecue: the firebox in the middle, a side shelf each side, the grate with its bars,
 * and the control knobs along the front.
 *
 * - **Firebox** (outline pen, body): the middle three fifths, the full depth — the first node.
 * - **Shelves** (outline pen, body): a fifth of the width each side, set in from the back and
 *   the front, square where they meet the firebox.
 * - **Grate** (detail pen, white) with six bars running front to back. It sits BEHIND the
 *   firebox's centre — a hood band at the back, a deeper control band at the front.
 * - **Knobs** (detail dots): three on the control band.
 *
 * **`directional`, and the back is the TOP edge**: the knobs are on the front, where the cook
 * stands, and the hood hinges at the back, which is the side that goes against the wall or the
 * fence. Mirror-symmetric about its centre line (a shelf each side), so it is not handed.
 *
 * Prim count: 13.
 */
export function drawBbq(r: Rect, g: GlyphCtx): SceneNode[] {
  const box = insetRectSides(r, 0.2, 0.2, 0, 0);
  g.path(roundedRectPath(box, shortSide(box) * 0.1), g.body);
  const sr = shortSide(r) * 0.04;
  g.path(roundedRectPath(insetRectSides(r, 0, 0.8, 0.12, 0.12), [sr, 0, 0, sr]), g.body);
  g.path(roundedRectPath(insetRectSides(r, 0.8, 0, 0.12, 0.12), [0, sr, sr, 0]), g.body);
  const grate = insetRectSides(box, 0.08, 0.08, 0.16, 0.3);
  g.path(roundedRectPath(grate, shortSide(grate) * 0.04), g.basin, "extraThin");
  for (let i = 1; i <= GRILL_BARS; i++) {
    const x = grate.x + (grate.w * i) / (GRILL_BARS + 1);
    g.seg({ x, y: grate.y }, { x, y: grate.y + grate.h }, "extraThin");
  }
  for (const f of [0.38, 0.5, 0.62]) g.dot({ x: r.x + r.w * f, y: r.y + r.h * 0.85 }, shortSide(r) * 0.035);
  return g.nodes;
}

/** The chair band of a patio table, as a fraction of the footprint's short side. */
const PATIO_BAND = 0.22;
/** The spacing of a patio table's chairs along a side, in chair bands. */
const PATIO_PITCH = 2.2;
/** The fraction of a patio chair's depth tucked under the table top (only the rest is drawn). */
const PATIO_TUCK = 0.3;

/**
 * Draw a dining-style chair whose VISIBLE footprint is `box`, its backrest along the `back`
 * edge, `tuck` of its full depth hidden under a table: a rounded white seat and a pill-ended
 * backrest bar 12% of the depth.
 *
 * The pilot dining chair's proportions, number for number (`glyph-lib.ts`'s `chairAt`, which the
 * dining and meeting tables share), because the design programme asked the patio table to draw
 * in exactly the dining table's chair language. It is a separate construction rather than a call
 * to `chairAt`: it is placed by its visible BOX and laid out from the box's corner, where
 * `chairAt` is laid out about the chair's own centre, so the two take different rounding paths
 * and swapping one for the other would move the patio table's bytes. Built back-on-top and
 * quarter-turned into place through `mapSceneNode`, the rotation `furniture.render()` itself uses.
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
  const s = Math.min(w, full);
  const sr = s * 0.12;
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
 * A patio table with its chairs, in the dining table's language: the declared footprint is the
 * whole seating zone, the top sits inside a chair band `0.22 × min(w, h)` deep, and each chair's
 * visible part stands in that band with its seat meeting the top and its backrest out.
 *
 * - **A near-square footprint draws a ROUND top** (a true circle, or a four-centre oval when the
 *   two sides differ by up to a fifth) with one chair on each side — what a patio set is, and
 *   exactly invariant under a quarter-turn on a square, which is the catalog's `symmetric`.
 * - **An elongated one draws a rectangular top** with an inset bevel, one chair per 2.2 bands
 *   of length a side (`[1, 4]`) and one at each end — the dining table's rule.
 * - **The parasol hole** (detail ring) at the centre of the top is what says "outdoors".
 *
 * Prim count: 10 round; `3 + 2 × chairs` rectangular, 23 at the clamp.
 */
export function drawOutdoorTable(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const band = s * PATIO_BAND;
  const top: Rect = { x: r.x + band, y: r.y + band, w: r.w - 2 * band, h: r.h - 2 * band };
  const c = centerOf(r);
  const round = Math.abs(r.w - r.h) <= 0.2 * Math.max(r.w, r.h);
  if (round) {
    if (top.w === top.h) g.dot(c, Math.max(0, top.w / 2), g.body, "thin");
    else g.path(ovalPath(c.x, c.y, top.w / 2, top.h / 2), g.body);
  } else {
    const st = shortSide(top);
    g.path(roundedRectPath(top, st * 0.03), g.body);
    g.path(roundedRectPath(insetRect(top, 0.04), st * 0.02), "none", "extraThin");
  }
  g.ring(c, s * 0.025, "extraThin");

  const cw = band * 0.9;
  const vis = band * (1 - PATIO_TUCK);
  // ONE chair is drawn — back on top, centred on the top's upper edge — and every other chair is
  // that chair carried by an exact isometry: a quarter-turn about the table's centre (the very
  // arithmetic `furniture.render()` turns a whole symbol by), then a shift along its side. Chairs
  // built one by one are not reliably images of each other: a backrest stadium can carry a
  // sub-ulp straight run that depends on where it sits, so the symbol would stop mapping onto
  // itself under its own quarter-turn at some positions.
  const from = g.nodes.length;
  chairInto(g, { x: c.x - cw / 2, y: top.y - vis, w: cw, h: vis }, "top", PATIO_TUCK);
  const proto = g.nodes.splice(from);
  // On a non-square top the side chairs stand off the top's own half-width, not its half-depth.
  const reach = (top.w - top.h) / 2;
  const turned =
    (deg: 0 | 90 | 180 | 270, tx: number, ty: number) =>
    (p: Point): Point => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const q =
        deg === 0
          ? p
          : deg === 90
            ? { x: c.x - dy, y: c.y + dx }
            : deg === 180
              ? { x: c.x - dx, y: c.y - dy }
              : { x: c.x + dy, y: c.y - dx };
      return { x: q.x + tx, y: q.y + ty };
    };
  const at = (along: number, back: "top" | "bottom" | "left" | "right"): void => {
    const map =
      back === "top"
        ? turned(0, along - c.x, 0)
        : back === "right"
          ? turned(90, reach, along - c.y)
          : back === "bottom"
            ? turned(180, along - c.x, 0)
            : turned(270, -reach, along - c.y);
    for (const n of proto) g.nodes.push(mapSceneNode(n, map, false));
  };
  if (round) {
    at(c.x, "top");
    at(c.y, "right");
    at(c.x, "bottom");
    at(c.y, "left");
    return g.nodes;
  }
  const horizontal = r.w >= r.h;
  const runStart = horizontal ? top.x : top.y;
  const runLen = horizontal ? top.w : top.h;
  const perSide = clamp(Math.round(runLen / (PATIO_PITCH * band)), 1, 4);
  for (let i = 0; i < perSide; i++) {
    const along = runStart + (runLen * (i + 0.5)) / perSide;
    at(along, horizontal ? "top" : "left");
    at(along, horizontal ? "bottom" : "right");
  }
  at(horizontal ? c.y : c.x, horizontal ? "left" : "top");
  at(horizontal ? c.y : c.x, horizontal ? "right" : "bottom");
  return g.nodes;
}

/**
 * A patio armchair: the pilot dining chair (white rounded seat, pill backrest along the back)
 * with an ARM down each side and slat joints across the seat.
 *
 * The arms are what tell it from an indoor `chair` and from a `bin` — two pieces of the same
 * size — and the slats (detail pen, parallel to the back) are the timber of a garden chair.
 * Deliberately NOT `directional`, as no seat in the catalog is: seating is arranged, not
 * installed. The drawing still has a back, which is the backrest.
 *
 * Prim count: 7.
 */
export function drawOutdoorChair(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const seat = insetRectSides(r, 0.13, 0.13, 0.08, 0.04);
  g.path(roundedRectPath(seat, s * 0.1), g.basin);
  g.path(pill({ x: r.x, y: r.y, w: r.w, h: r.h * 0.13 }), g.body);
  // The right arm is the left one REFLECTED, not a second stadium built at its own x: two
  // stadiums built apart can differ by a sub-ulp straight run, and that difference alone would
  // make the chair read as handed to the symmetry probe at some positions.
  g.path(pill({ x: r.x, y: r.y + r.h * 0.06, w: r.w * 0.11, h: r.h * 0.84 }), g.body);
  g.nodes.push(mirroredTwin(g.nodes[g.nodes.length - 1]!, r, true));
  for (const f of [0.4, 0.6, 0.8]) {
    const y = r.y + r.h * f;
    g.seg({ x: seat.x, y }, { x: seat.x + seat.w, y }, "extraThin");
  }
  return g.nodes;
}

/**
 * A parasol: the eight-panel canopy, its ribs, and the pole at the centre.
 *
 * The canopy is an octagon whose eight panels SAG slightly between the ribs — each edge a
 * shallow inward arc, which is how stretched fabric reads in plan and what tells it from a
 * straight-edged table or a `plant`. White (fabric is a soft surface), outline pen; the eight
 * ribs from the pole to the tips are detail; the pole an outline-ink disc. The tips sit on the
 * axes and diagonals, so the symbol is quarter-turn and mirror invariant.
 *
 * Prim count: 10.
 */
export function drawUmbrella(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  const tips: Point[] = [];
  for (let i = 0; i < 8; i++) tips.push(polar(c, rad, i * 45));
  const edges: PathEdge[] = [];
  for (let i = 0; i < 8; i++) edges.push(...bulgeArc(tips[i]!, tips[(i + 1) % 8]!, -rad * 0.05));
  g.path({ start: tips[0]!, edges }, g.basin);
  for (const t of tips) g.seg(c, t, "extraThin");
  g.dot(c, rad * 0.05, undefined, "thin");
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Parked things

/**
 * A bicycle seen from above: two narrow tyres in line, the frame between them, the saddle, the
 * handlebar across the front wheel, and the cranks with their pedals.
 *
 * Read off the footprint's own LONG axis (see {@link axisPt}). From above a bicycle is narrow —
 * every tube of the diamond frame lies on the centre line — so what makes it legible is the
 * TYRES as two slim rounded slots in line, the bar ACROSS the front one, and the saddle; the
 * cranks and pedals (detail pen) say which way it is pedalled. Every along measure is a
 * fraction of the length, every across one of the width; the tyre is additionally held to
 * 3% of the length so a short, fat footprint does not get balloon tyres.
 *
 * Prim count: 8.
 */
export function drawBicycle(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long: L, short: S } = axes(r);
  const tyre = Math.min(S * 0.05, L * 0.03);
  g.path(pill(axisRect(r, L * 0.03, L * 0.41, -tyre, tyre)), g.body);
  g.path(pill(axisRect(r, L * 0.59, L * 0.97, -tyre, tyre)), g.body);
  g.seg(axisPt(r, L * 0.33, 0), axisPt(r, L * 0.7, 0));
  g.path(axisOval(r, L * 0.3, 0, L * 0.065, Math.min(S * 0.12, L * 0.042)), g.body);
  g.path(pill(axisRect(r, L * 0.685, L * 0.715, -S * 0.44, S * 0.44)), g.body);
  g.seg(axisPt(r, L * 0.46, -S * 0.2), axisPt(r, L * 0.46, S * 0.2), "extraThin");
  for (const b of [-1, 1]) {
    g.path(
      roundedRectPath(axisRect(r, L * 0.44, L * 0.48, b < 0 ? -S * 0.3 : S * 0.2, b < 0 ? -S * 0.2 : S * 0.3), 0),
      g.body,
      "extraThin",
    );
  }
  return g.nodes;
}

/**
 * A motorcycle seen from above: the two tyres in line, the body slung over them, the seat,
 * the handlebar across the front with a mirror at each end.
 *
 * The tyres are drawn FIRST and the body over them, because from above the bodywork covers
 * the middle of both wheels — the tyres show only fore and aft of it. The rear tyre is wider
 * than the front, as on the machine; the body narrows to the tail and to the headstock and is
 * widest at the tank (detail oval); the seat is the soft white panel behind it. Same long-axis
 * reading as {@link drawBicycle}.
 *
 * Prim count: 8.
 */
export function drawMotorcycle(r: Rect, g: GlyphCtx): SceneNode[] {
  const { horizontal, long: L, short: S } = axes(r);
  g.path(pill(axisRect(r, L * 0.02, L * 0.32, -S * 0.11, S * 0.11)), g.body);
  g.path(pill(axisRect(r, L * 0.7, L * 0.98, -S * 0.08, S * 0.08)), g.body);
  // The body: narrow at the tail, widening over the seat to the tank, narrowing again to the
  // headstock — one closed outline of gentle bulges, clockwise in the machine's own frame (and
  // so mirrored on the page for a machine stood on end, which flips the bulges' sign).
  const out = horizontal ? 1 : -1;
  const side = (b: number): Point[] => [
    axisPt(r, L * 0.16, b * S * 0.1),
    axisPt(r, L * 0.48, b * S * 0.18),
    axisPt(r, L * 0.64, b * S * 0.24),
    axisPt(r, L * 0.8, b * S * 0.09),
  ];
  const left = side(-1);
  const right = side(1).reverse();
  const ring = [...left, ...right];
  const sags = [S * 0.02, S * 0.015, S * 0.03, L * 0.025, S * 0.03, S * 0.015, S * 0.02, L * 0.02];
  const edges: PathEdge[] = [];
  for (let i = 0; i < ring.length; i++) edges.push(...bulgeArc(ring[i]!, ring[(i + 1) % ring.length]!, out * sags[i]!));
  g.path({ start: ring[0]!, edges }, g.body);
  const seat = axisRect(r, L * 0.22, L * 0.48, -S * 0.13, S * 0.13);
  g.path(roundedRectPath(seat, shortSide(seat) * 0.4), g.basin, "extraThin");
  g.path(axisOval(r, L * 0.63, 0, L * 0.06, S * 0.1), "none", "extraThin");
  g.path(pill(axisRect(r, L * 0.745, L * 0.77, -S * 0.42, S * 0.42)), g.body);
  for (const b of [-1, 1]) g.dot(axisPt(r, L * 0.73, b * S * 0.4), Math.min(S * 0.06, L * 0.025));
  return g.nodes;
}

// ---------------------------------------------------------------------------
// Terrace & lawn

/**
 * A hot tub: the rounded shell, the water inside it, the moulded bench round a sunken
 * footwell, and the four seat divisions on the bench.
 *
 * NOT `requiresWall`, and that is the interesting call in this file. A hot tub is plumbed,
 * and `requiresWall`'s remedy line — "supply/waste/venting runs in the wall" — is exactly
 * the sentence that makes it wrong here: a tub is set down on a deck and fed from below, so
 * flagging one that sits in the middle of a terrace would be a false warning on the normal
 * arrangement. It is `symmetric` instead: you get into it from wherever you are standing, and
 * the drawing — a seat division at the middle of every side — maps onto itself on a square.
 *
 * Prim count: 7.
 */
export function drawHotTub(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  const c = centerOf(r);
  g.path(roundedRectPath(r, s * 0.16), g.body);
  const water = insetRect(r, 0.09);
  g.path(roundedRectPath(water, s * 0.1), g.basin);
  const well = insetRect(r, 0.3);
  g.path(roundedRectPath(well, s * 0.05), "none", "extraThin");
  // Each division runs OUTWARD, from the footwell to the water's edge, so a quarter-turn maps
  // one onto the next end for end.
  g.seg({ x: c.x, y: well.y }, { x: c.x, y: water.y }, "extraThin");
  g.seg({ x: well.x + well.w, y: c.y }, { x: water.x + water.w, y: c.y }, "extraThin");
  g.seg({ x: c.x, y: well.y + well.h }, { x: c.x, y: water.y + water.h }, "extraThin");
  g.seg({ x: well.x, y: c.y }, { x: water.x, y: c.y }, "extraThin");
  return g.nodes;
}

/**
 * A swing set: the top beam down the long axis, an A-frame at each end, and the two seats
 * hung under the beam on their chains.
 *
 * Each A-frame is drawn as its two legs splaying from the beam end out to the feet — the V a
 * splayed frame projects to in plan. The seats are rounded boards under the beam, long side
 * along it; the chains hang straight down, so in plan they are the two hanger points at each
 * seat's ends (detail dots). Read off the long axis like the bicycle.
 *
 * Prim count: 11.
 */
export function drawSwing(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long: L, short: S } = axes(r);
  const beam = Math.min(S * 0.03, L * 0.02);
  g.path(pill(axisRect(r, L * 0.08, L * 0.92, -beam, beam)), g.body);
  for (const [a, foot] of [
    [0.08, 0.04],
    [0.92, 0.96],
  ] as const) {
    for (const b of [-1, 1]) g.seg(axisPt(r, L * a, 0), axisPt(r, L * foot, b * S * 0.46));
  }
  const seatV = Math.min(S * 0.08, L * 0.05);
  for (const a of [0.34, 0.66]) {
    const seat = axisRect(r, L * (a - 0.08), L * (a + 0.08), -seatV, seatV);
    g.path(roundedRectPath(seat, shortSide(seat) * 0.3), g.body);
  }
  const hanger = Math.min(S * 0.02, L * 0.012);
  for (const a of [0.34, 0.66]) for (const d of [-0.065, 0.065]) g.dot(axisPt(r, L * (a + d), 0), hanger);
  return g.nodes;
}

/** Springs between a trampoline's mat and its frame — a multiple of eight, for D4. */
const TRAMPOLINE_SPRINGS = 24;

/**
 * A trampoline: the padded frame, the mat inside it, and the springs between the two.
 *
 * The frame is a body-filled disc, the mat a white one at 0.8 of it (both outline pen), and
 * twenty-four springs (detail pen) at a 15° pitch bridge the gap — a set closed under every
 * quarter-turn and mirror, so the symbol is D4 invariant. A narrow band densely sprung is what
 * tells it from a `fire_pit` (a wide stone ring with logs) at a glance.
 *
 * Prim count: 26.
 */
export function drawTrampoline(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  const mat = rad * 0.8;
  g.dot(c, rad, g.body, "thin");
  g.dot(c, mat, g.basin, "thin");
  for (let i = 0; i < TRAMPOLINE_SPRINGS; i++) {
    const deg = (i * 360) / TRAMPOLINE_SPRINGS;
    g.seg(polar(c, mat, deg), polar(c, rad * 0.94, deg), "extraThin");
  }
  return g.nodes;
}

// ---------------------------------------------------------------------------
// The small standing objects

/**
 * A wheelie bin seen from above: the body, the lid panel on it, the handle bar along the
 * hinged BACK edge, and the grip at the front of the lid.
 *
 * `directional` — the handle (and the wheels under it) are at the back, so the drawing says
 * which way it is pulled, and `anchor` can derive the turn that puts its back against the wall
 * it stands beside. Mirror-symmetric about its centre line.
 *
 * Prim count: 4.
 */
export function drawBin(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.08), g.body);
  g.path(roundedRectPath(insetRectSides(r, 0.08, 0.08, 0.2, 0.07), s * 0.05), "none", "extraThin");
  g.path(pill(insetRectSides(r, 0.12, 0.12, 0.03, 0.86)), g.body);
  const y = r.y + r.h * 0.86;
  g.seg({ x: r.x + r.w * 0.35, y }, { x: r.x + r.w * 0.65, y }, "extraThin");
  return g.nodes;
}

/**
 * A mailbox: the box on its post, the flap across its front, and the flag on its side.
 *
 * Drawn inset from its own footprint on purpose — a letterbox's footprint on a site plan is
 * the space it occupies at arm's length, not the box, and the flag needs somewhere to live
 * that is still inside the rectangle every lint rule measures. The flag is on the right, which
 * makes the symbol handed (a mirrored `place` mirrors it).
 *
 * Prim count: 3.
 */
export function drawMailbox(r: Rect, g: GlyphCtx): SceneNode[] {
  const box = insetRectSides(r, 0.12, 0.2, 0.14, 0.12);
  g.path(roundedRectPath(box, shortSide(box) * 0.18), g.body);
  const y = box.y + box.h * 0.78;
  g.seg({ x: box.x, y }, { x: box.x + box.w, y }, "extraThin");
  g.path(pill(insetRectSides(r, 0.86, 0.06, 0.24, 0.36)), g.body);
  return g.nodes;
}

/**
 * An EV charge point: the pedestal against the back edge with its display, the cable hanging
 * off it, and the plug at the cable's end.
 *
 * The cable is a TRUE arc spanning 140 degrees — comfortably minor, which is the only kind the
 * Scene's `arc` primitive carries — and its whole circle is inside the lower half of the
 * footprint, so the sampled sweep cannot leave the rectangle at any turn. The plug sits at the
 * left end, which makes the symbol handed.
 *
 * Prim count: 4.
 */
export function drawEvCharger(r: Rect, g: GlyphCtx): SceneNode[] {
  const pedestal = insetRectSides(r, 0.25, 0.25, 0.06, 0.44);
  g.path(roundedRectPath(pedestal, shortSide(pedestal) * 0.15), g.body);
  const screen = insetRectSides(pedestal, 0.2, 0.2, 0.22, 0.3);
  g.path(roundedRectPath(screen, shortSide(screen) * 0.2), g.basin, "extraThin");
  const hub: Point = { x: r.x + r.w * 0.5, y: r.y + r.h * 0.62 };
  const rad = Math.min(r.w * 0.3, r.h * 0.28);
  g.arcSeg(hub, rad, polar(hub, rad, 20), polar(hub, rad, 160), 1, "extraThin");
  g.dot(polar(hub, rad, 160), shortSide(r) * 0.06, g.body, "thin");
  return g.nodes;
}

/**
 * A pergola: the overhead frame and its rafters, dashed, on four solid posts.
 *
 * The frame and the rafters are above the horizontal cut a floor plan is taken at, so they are
 * DASHED and unfilled for exactly the reason `upper_cabinet` is: present, not cut, and the
 * terrace under them has to read through. The frame is the outline pen; the rafters run both
 * ways at about a quarter of the short side (`[1, 9]` each way, so a square pergola draws the
 * same grid turned) in the detail pen. The four POSTS are what the cut plane does pass through,
 * so they are solid ink squares — the one part of the symbol that is cut.
 *
 * Prim count: `5 + 2 × rafters` — 17 on a square, 29 at the clamp.
 */
export function drawPergola(r: Rect, g: GlyphCtx): SceneNode[] {
  dashedPoly(g, rectPoly(r), "none");
  const s = shortSide(r);
  const nx = clamp(Math.round(r.w / (s * 0.25)) - 1, 1, 9);
  const ny = clamp(Math.round(r.h / (s * 0.25)) - 1, 1, 9);
  // Each rafter is drawn as two halves running OUT from the centre line, so its dash pattern is
  // symmetric about the middle of the pergola and the whole grid maps onto itself, dash for
  // dash, under every quarter-turn and mirror of a square.
  const c = centerOf(r);
  for (let i = 1; i <= nx; i++) {
    const x = r.x + (r.w * i) / (nx + 1);
    g.seg({ x, y: c.y }, { x, y: r.y }, "extraThin", true);
    g.seg({ x, y: c.y }, { x, y: r.y + r.h }, "extraThin", true);
  }
  for (let i = 1; i <= ny; i++) {
    const y = r.y + (r.h * i) / (ny + 1);
    g.seg({ x: c.x, y }, { x: r.x, y }, "extraThin", true);
    g.seg({ x: c.x, y }, { x: r.x + r.w, y }, "extraThin", true);
  }
  const posts = insetRect(r, 0.08);
  const half = s * 0.03;
  for (const p of [
    { x: posts.x, y: posts.y },
    { x: posts.x + posts.w, y: posts.y },
    { x: posts.x + posts.w, y: posts.y + posts.h },
    { x: posts.x, y: posts.y + posts.h },
  ]) {
    g.poly(rectPoly({ x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half }), g.ink);
  }
  return g.nodes;
}

/**
 * A sandpit: the timber frame, the sand inside it, and a corner seat board across each corner.
 *
 * The sand is a plain white field — no stipple: a fixed scatter of dots read as a die face, and
 * a texture would compete with the ground hatch round it. The four corner boards (body, detail
 * pen) are what a built sandpit has and what tells it from a raised bed; one in every corner
 * keeps it quarter-turn and mirror invariant on a square.
 *
 * Prim count: 6.
 */
export function drawSandpit(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = shortSide(r);
  g.path(roundedRectPath(r, s * 0.03), g.body);
  const sand = insetRect(r, 0.08);
  g.path(roundedRectPath(sand, s * 0.015), g.basin, "extraThin");
  const k = s * 0.2;
  const x0 = sand.x;
  const y0 = sand.y;
  const x1 = sand.x + sand.w;
  const y1 = sand.y + sand.h;
  // Each board is wound the same way round its corner (corner, then the leg along the edge that
  // runs clockwise from it, then the other), so a quarter-turn maps one onto the next exactly.
  for (const [cx, cy, ax, ay, bx, by] of [
    [x0, y0, 1, 0, 0, 1],
    [x1, y0, 0, 1, -1, 0],
    [x1, y1, -1, 0, 0, -1],
    [x0, y1, 0, -1, 1, 0],
  ] as const) {
    g.poly(
      [
        { x: cx, y: cy },
        { x: cx + ax * k, y: cy + ay * k },
        { x: cx + bx * k, y: cy + by * k },
      ],
      g.body,
      "extraThin",
    );
  }
  return g.nodes;
}

/**
 * A fire pit: the stone surround with its joints, the fire bowl inside it, four logs laid
 * toward the centre, and the embers between them.
 *
 * A wide body-filled ring of stone (eight joints at 22.5° off the axes) round a white bowl is a
 * different silhouette from the `trampoline`'s narrow, densely sprung band; the logs on the
 * axes and the ember dot say "fire". Every mark is on the D4 bearings or symmetric about them.
 *
 * Prim count: 15.
 */
export function drawFirePit(r: Rect, g: GlyphCtx): SceneNode[] {
  const c = centerOf(r);
  const rad = Math.max(0, shortSide(r) * 0.48);
  const bowl = rad * 0.68;
  g.dot(c, rad, g.body, "thin");
  g.dot(c, bowl, g.basin, "thin");
  for (let k = 0; k < 8; k++) g.seg(polar(c, bowl, 22.5 + k * 45), polar(c, rad, 22.5 + k * 45), "extraThin");
  // One log, then the same log turned three times about the centre — so the four are exact
  // quarter-turns of each other (four separately built stadiums are not: a horizontal and a
  // vertical one leave their sub-ulp straight runs on different sides).
  const half = rad * 0.08;
  const near = rad * 0.12;
  const far = rad * 0.58;
  const at = g.nodes.length;
  g.path(pill({ x: c.x + near, y: c.y - half, w: far - near, h: 2 * half }), g.body, "extraThin");
  const log = g.nodes[at]!;
  for (const turn of [
    (p: Point): Point => ({ x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) }),
    (p: Point): Point => ({ x: c.x - (p.x - c.x), y: c.y - (p.y - c.y) }),
    (p: Point): Point => ({ x: c.x + (p.y - c.y), y: c.y - (p.x - c.x) }),
  ]) {
    g.nodes.push(mapSceneNode(log, turn, false));
  }
  g.dot(c, rad * 0.06);
  return g.nodes;
}

/**
 * A garden shed: the walls in plan with a pair of doors in the front wall, the floor inside,
 * and the roof ridge overhead.
 *
 * - **Floor** (outline pen, white): the whole footprint — the first node, and its front edge is
 *   the sill line across the door opening.
 * - **Walls** (outline pen, body): ONE polygon, the wall band a twentieth of the short side
 *   thick all the way round with the door opening left out of the front wall.
 * - **Doors**: a pair of leaves (slabs, outline pen) swung open INTO the shed from the two
 *   jambs, each with its swing arc (detail pen) — the door language of the building, so the
 *   shed reads as a small building rather than a box.
 * - **Ridge**: DASHED, because it is above the cut plane — the same convention the pergola,
 *   `upper_cabinet` and the `roof` element follow. Along the long axis.
 *
 * `directional`: the doors are on the BOTTOM edge, so `anchor top` derives the turn that puts
 * the back against the fence and the doors on the garden. A PAIR of doors keeps the drawing
 * mirror-symmetric about its centre line, so the shed is not handed.
 *
 * Prim count: 7.
 */
export function drawShed(r: Rect, g: GlyphCtx): SceneNode[] {
  const s = Math.max(0, shortSide(r));
  const t = s * 0.06;
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const cx = r.x + r.w / 2;
  const dw = Math.max(0, Math.min(r.w * 0.36, (r.h - 2 * t) * 1.2));
  const d0 = cx - dw / 2;
  const d1 = cx + dw / 2;
  g.poly(rectPoly(r), g.basin);
  g.poly(
    [
      { x: d1, y: y1 },
      { x: x1, y: y1 },
      { x: x1, y: y0 },
      { x: x0, y: y0 },
      { x: x0, y: y1 },
      { x: d0, y: y1 },
      { x: d0, y: y1 - t },
      { x: x0 + t, y: y1 - t },
      { x: x0 + t, y: y0 + t },
      { x: x1 - t, y: y0 + t },
      { x: x1 - t, y: y1 - t },
      { x: d1, y: y1 - t },
    ],
    g.body,
  );
  const leaf = dw / 2;
  const lt = Math.min(t * 0.6, leaf * 0.12);
  const jamb = y1 - t;
  g.poly(rectPoly({ x: d0, y: jamb - leaf, w: lt, h: leaf }), g.basin);
  g.poly(rectPoly({ x: d1 - lt, y: jamb - leaf, w: lt, h: leaf }), g.basin);
  g.arcSeg({ x: d0, y: jamb }, leaf, { x: cx, y: jamb }, { x: d0, y: jamb - leaf }, 0, "extraThin");
  g.arcSeg({ x: d1, y: jamb }, leaf, { x: cx, y: jamb }, { x: d1, y: jamb - leaf }, 1, "extraThin");
  const { horizontal } = axes(r);
  if (horizontal) {
    const y = r.y + r.h * 0.5;
    g.seg({ x: r.x + t, y }, { x: r.x + r.w - t, y }, "extraThin", true);
  } else {
    g.seg({ x: cx, y: r.y + t }, { x: cx, y: r.y + r.h - t }, "extraThin", true);
  }
  return g.nodes;
}

/**
 * A rotary-free washing line: a T-post at each end of the run — the post (outline-ink disc)
 * and its cross-arm (outline pen, body) — and four lines strung between the arms.
 *
 * Read off the long axis like the bicycle, so a line strung north-south draws the same object as
 * one strung east-west. The post and the arm are clamped against the run length as well as the
 * width, so a very short footprint does not produce two posts that swallow the lines.
 *
 * Prim count: 8.
 */
export function drawClothesline(r: Rect, g: GlyphCtx): SceneNode[] {
  const { long: L, short: S } = axes(r);
  const arm = Math.min(L * 0.012, S * 0.05);
  const post = Math.min(S * 0.07, L * 0.02);
  // The far cross-arm is the near one reflected end for end (see {@link mirroredTwin}).
  g.path(pill(axisRect(r, L * 0.05 - arm, L * 0.05 + arm, -S * 0.42, S * 0.42)), g.body);
  g.nodes.push(mirroredTwin(g.nodes[g.nodes.length - 1]!, r, axes(r).horizontal));
  for (const a of [0.05, 0.95]) g.dot(axisPt(r, L * a, 0), post, undefined, "thin");
  for (const b of [-0.3, -0.1, 0.1, 0.3]) g.seg(axisPt(r, L * 0.05, S * b), axisPt(r, L * 0.95, S * b), "extraThin");
  return g.nodes;
}
