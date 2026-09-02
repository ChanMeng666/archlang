/**
 * Shared axis-aligned rectangle math for the analysis/repair layer.
 *
 * The same point-in-rect / rect-overlap / wall-intrusion arithmetic used to be
 * re-implemented (with identical expressions) in lint, repair, resolve and the
 * occupancy flood-fill. It lives here once. Every helper is a pure expression —
 * callers rely on the exact float behaviour, so change nothing lightly: lint
 * warnings, repair pushes and the W_ROOM_OVERLAP check are all byte-pinned by
 * the test suite.
 */

import type { Point } from "../ast.js";
import type { Arc } from "./arc.js";
import { arcBandIntrusion, arcOpeningVoid } from "./arc-band.js";
import type { Vec, WallSegment } from "../geometry.js";
import { normal, sub, unit } from "../geometry.js";

/** A millimetre bounding box (origin top-left, +x right, +y down). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Overlap length of two 1-D intervals (0 when disjoint). */
export function overlap1d(aLo: number, aHi: number, bLo: number, bHi: number): number {
  return Math.max(0, Math.min(aHi, bHi) - Math.max(aLo, bLo));
}

/**
 * Total length covered by a set of 1-D intervals after merging overlaps. Used by
 * every "how much of this edge is backed by a wall?" scan (perimeter gaps, fixture
 * wall-backing), so they all measure coverage the same way.
 */
export function mergedLength(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  return total + (ce - cs);
}

/** Signed per-axis overlap amounts of two rects (negative when separated). */
export function rectOverlapAmounts(a: BBox, b: BBox): { ox: number; oy: number } {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { ox, oy };
}

/** Do two axis-aligned rects overlap by more than 1 mm on both axes? */
export function rectsOverlap(a: BBox, b: BBox): boolean {
  const { ox, oy } = rectOverlapAmounts(a, b);
  return ox > 1 && oy > 1;
}

/** Is the point inside the rect (closed bounds — edges count as inside)? */
export function pointInRect(px: number, py: number, r: BBox): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/* ---------------------------------------------------------------------------
 * The wall's own frame — what makes the intrusion measurement angle-exact.
 *
 * Every "how far into this wall is that piece?" question used to be asked twice, once
 * for a horizontal wall and once for a vertical one, opening with
 * `if (horiz === vert) return 0`. That guard was a SILENT SKIP: it made
 * `W_FURNITURE_WALL_COLLISION` blind to every wall in the language that is not axis-
 * aligned, so a sofa drawn straight through a 45° wall linted clean. Worse, an ARC
 * carries its CHORD in `a`/`b`, so a curved wall whose chord happened to be axis-aligned
 * was measured against a line the wall is not on — flagging furniture near the chord and
 * missing the wall itself.
 *
 * So the question is asked once, in the segment's own coordinates: `d` along the run,
 * `n` across it. On an axis-aligned segment `d`/`n` are ±1 unit vectors, so every
 * projection below reduces to the exact expression the two hand-written branches used
 * (up to an exact negation) — which is why widening this moved no shipped byte.
 * ------------------------------------------------------------------------- */

/** A straight wall segment resolved into its own frame. */
interface SegFrame {
  /** Unit direction of travel, a→b. */
  d: Vec;
  /** Left normal of `d` — the across-wall axis. */
  n: Vec;
  /** The segment's centerline, as a coordinate on `n`. */
  c: number;
  /** The segment's run on `d` (its endpoints, ordered). */
  lo: number;
  hi: number;
}

/**
 * The frame of a STRAIGHT wall segment, or `null` when there is none to speak of.
 *
 * `null` for a degenerate (zero-length) segment and — deliberately — for a CURVED one:
 * an arc's across-wall direction turns along the run, so a single `n` would be a fiction,
 * and an arc's `a`/`b` are its CHORD (measuring which flags furniture near a straight
 * line the wall is not on, and misses the wall itself).
 *
 * A curve is not skipped any more, it is measured in the coordinates it actually has:
 * `wallIntrusionDepth` routes an arc segment to {@link arcBandIntrusion}, where the
 * across-wall axis is the RADIUS and the along-run axis is the ANGLE. See
 * `./arc-band.ts` for the derivation, and `test/furniture-lint.test.ts` for the pins in
 * both directions — a piece through the true band warns, one on the chord does not.
 */
function segmentFrame(s: { a: Point; b: Point; arc?: Arc }): SegFrame | null {
  if (s.arc) return null;
  const v = sub(s.b, s.a);
  if (v.x === 0 && v.y === 0) return null;
  const d = unit(v);
  const n = normal(d);
  const pa = s.a.x * d.x + s.a.y * d.y;
  const pb = s.b.x * d.x + s.b.y * d.y;
  return { d, n, c: s.a.x * n.x + s.a.y * n.y, lo: Math.min(pa, pb), hi: Math.max(pa, pb) };
}

/** The interval a rect's four corners project onto the unit axis `u` — closed form:
 *  the extremes are the two corners the signs of `u` pick out. */
function rectSpan(r: BBox, u: Vec): [number, number] {
  const [x0, x1] = u.x >= 0 ? [r.x, r.x + r.w] : [r.x + r.w, r.x];
  const [y0, y1] = u.y >= 0 ? [r.y, r.y + r.h] : [r.y + r.h, r.y];
  return [x0 * u.x + y0 * u.y, x1 * u.x + y1 * u.y];
}

/**
 * How deep (mm) a furniture rectangle `fr` intrudes into a wall segment's solid band
 * **at any angle, straight or curved**, counting only the run that is *not* an opening
 * (a door or window voids the wall there). A piece flush against the wall face intrudes
 * ~0; one straddling the centerline intrudes by up to the wall thickness. Returns 0 for
 * a degenerate segment (see {@link segmentFrame}).
 *
 * A CURVED segment is measured in polar coordinates by {@link arcBandIntrusion} —
 * radius across, arc length along — because an arc has no single across-wall normal to
 * project onto. Both branches answer the same question and return the same units, so
 * the caller never learns which kind of edge it asked about.
 *
 * "Intrusion" is the across-wall overlap; it is only meaningful when the along-wall
 * overlap survives opening subtraction, so a counter under a window or a piece in a
 * doorway isn't read as passing through solid wall.
 *
 * Furniture is an AABB and its rotation is a quarter-turn (`E_FURN_ROTATE`), so `fr` is
 * both its bounding box and its true footprint. The wall solid is an oriented box, so
 * the two shapes genuinely overlap exactly when their projections meet on all FOUR
 * separating axes: the wall's `d` and `n`, and the plan's own x and y. The last two are
 * implied by the first two whenever the wall is axis-aligned (`d`/`n` *are* the plan
 * axes there), which is what keeps every orthogonal plan's verdict unchanged; on an
 * angled wall they are what stops a piece that crosses the wall's LINE somewhere and its
 * RUN somewhere else from reading as a collision.
 */
export function wallIntrusionDepth(
  fr: BBox,
  s: WallSegment,
  openings: Array<{ at: { x: number; y: number }; width: number }>,
): number {
  if (s.arc) return arcIntrusionDepth(fr, s.arc, s.thickness, openings);
  const f = segmentFrame(s);
  if (!f) return 0;
  const half = s.thickness / 2;
  const [fnLo, fnHi] = rectSpan(fr, f.n);
  const band = overlap1d(fnLo, fnHi, f.c - half, f.c + half); // across-wall (depth)
  if (band <= 0) return 0;
  const [fdLo, fdHi] = rectSpan(fr, f.d);
  const lo = Math.max(fdLo, f.lo);
  const hi = Math.min(fdHi, f.hi);
  if (hi - lo <= 1) return 0;
  if (!bandMeetsRectOnPlanAxes(fr, s, f, half)) return 0;
  // Subtract opening spans that lie on this segment's line, measured along the run.
  const voids: Array<[number, number]> = [];
  for (const o of openings) {
    if (Math.abs(o.at.x * f.n.x + o.at.y * f.n.y - f.c) > half + 1) continue;
    const along = o.at.x * f.d.x + o.at.y * f.d.y;
    voids.push([along - o.width / 2, along + o.width / 2]);
  }
  return solidRemains(lo, hi, voids) ? band : 0;
}

/**
 * {@link wallIntrusionDepth} for a curved segment: the radial overlap with the annular
 * band, kept only where the arc length the piece covers still has solid left after the
 * openings hosted on that curve are subtracted.
 *
 * The two axes swap kind but not role — `solidRemains` is the SAME void arithmetic the
 * straight branch runs, applied to arc length instead of distance along a chord, so a
 * piece standing in a curved doorway is no more a collision than one standing in a
 * straight doorway.
 */
function arcIntrusionDepth(
  fr: BBox,
  arc: Arc,
  thickness: number,
  openings: Array<{ at: { x: number; y: number }; width: number }>,
): number {
  const hit = arcBandIntrusion(fr, arc, thickness);
  if (!hit) return 0;
  const voids: Array<[number, number]> = [];
  for (const o of openings) {
    const v = arcOpeningVoid(arc, o.at, o.width, thickness);
    if (v) voids.push(v);
  }
  for (const [lo, hi] of hit.runs) {
    if (hi - lo <= 1) continue;
    if (solidRemains(lo, hi, voids)) return hit.depth;
  }
  return 0;
}

/**
 * The plan-axis half of the separating-axis test: do `fr` and the segment's solid band
 * (its four `a`/`b` ± `n`·half corners — the run UN-extended, exactly the region the
 * `d`/`n` tests describe) overlap on x and on y?
 *
 * A no-op for an axis-aligned wall, where these two intervals are the very ones the
 * caller has already tested.
 */
function bandMeetsRectOnPlanAxes(fr: BBox, s: { a: Point; b: Point }, f: SegFrame, half: number): boolean {
  const ox = f.n.x * half;
  const oy = f.n.y * half;
  const xs = [s.a.x + ox, s.a.x - ox, s.b.x + ox, s.b.x - ox];
  const ys = [s.a.y + oy, s.a.y - oy, s.b.y + oy, s.b.y - oy];
  return (
    overlap1d(fr.x, fr.x + fr.w, Math.min(...xs), Math.max(...xs)) > 0 &&
    overlap1d(fr.y, fr.y + fr.h, Math.min(...ys), Math.max(...ys)) > 0
  );
}

/** Is any > 1 mm of the interval [lo,hi] left uncovered by the `voids` intervals? */
function solidRemains(lo: number, hi: number, voids: Array<[number, number]>): boolean {
  let cuts = [lo, hi];
  for (const [a, b] of voids) {
    cuts.push(Math.max(lo, Math.min(hi, a)), Math.max(lo, Math.min(hi, b)));
  }
  cuts = [...new Set(cuts)].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const mid = (cuts[i]! + cuts[i + 1]!) / 2;
    const len = cuts[i + 1]! - cuts[i]!;
    if (len <= 1) continue;
    const inVoid = voids.some(([a, b]) => mid > a && mid < b);
    if (!inVoid) return true;
  }
  return false;
}

/**
 * The across-wall intrusion of `fr` into one wall segment (null if there is none), at any
 * angle and on a curve. Deliberately DISTINCT semantics from
 * {@link wallIntrusionDepth}: this one **ignores openings** (the repair corrector
 * moves a piece out of the wall band whether or not a door voids part of it) —
 * do not merge the two.
 *
 * An ORTHOGONAL wall reports the plan `axis` the push runs along plus the wall's
 * centerline on it, which is everything `repair` needs to compute a closed-form move.
 * An ANGLED one — and a CURVED one, whose clearing move is along a radius — reports
 * `axis: null`: the push is neither plan axis and lands off-grid, so `repair` declines
 * and REPORTS the piece instead of inventing a diagonal push
 * (`test/repair-coverage.test.ts` pins that every piece lint flags gets a change entry or
 * an `unresolved` entry — never nothing, which is why the curved branch exists here at
 * all rather than leaving `repair` silent on a collision `lint` now raises).
 */
export type WallIntrusion = { depth: number } & ({ axis: "x" | "y"; center: number } | { axis: null });

export function wallIntrusion(fr: BBox, s: { a: Point; b: Point; thickness: number; arc?: Arc }): WallIntrusion | null {
  if (s.arc) {
    const hit = arcBandIntrusion(fr, s.arc, s.thickness);
    return hit && hit.runs.some(([lo, hi]) => hi - lo > 1) ? { depth: hit.depth, axis: null } : null;
  }
  const f = segmentFrame(s);
  if (!f) return null;
  const h2 = s.thickness / 2;
  const [fnLo, fnHi] = rectSpan(fr, f.n);
  const band = overlap1d(fnLo, fnHi, f.c - h2, f.c + h2);
  const [fdLo, fdHi] = rectSpan(fr, f.d);
  const lo = Math.max(fdLo, f.lo);
  const hi = Math.min(fdHi, f.hi);
  if (band <= 0 || hi - lo <= 1) return null;
  if (!bandMeetsRectOnPlanAxes(fr, s, f, h2)) return null;
  if (s.a.y === s.b.y) return { depth: band, axis: "y", center: s.a.y };
  if (s.a.x === s.b.x) return { depth: band, axis: "x", center: s.a.x };
  return { depth: band, axis: null };
}

/**
 * The clear-landing rectangle straddling a door opening on its (orthogonal) host
 * wall — the straight walk-through approach, `depth` mm on each side. Null when the
 * door has no host or the host is angled. Shared by the W_DOORWAY_BLOCKED lint rule
 * and the repair corrector, so what repair clears is exactly what lint flags.
 */
export function doorLandingRect(
  d: {
    at: { x: number; y: number };
    width: number;
    host?: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
  },
  depth: number,
): BBox | null {
  const seg = d.host;
  if (!seg) return null;
  const horiz = seg.a.y === seg.b.y;
  const vert = seg.a.x === seg.b.x;
  if (horiz === vert) return null;
  const halfW = d.width / 2;
  return horiz
    ? { x: d.at.x - halfW, y: d.at.y - depth, w: d.width, h: depth * 2 }
    : { x: d.at.x - depth, y: d.at.y - halfW, w: depth * 2, h: d.width };
}
