/**
 * How deep a rectangle reaches into a CURVED wall's solid — the radial analogue of the
 * straight-segment frame in `./rect.ts`.
 *
 * ## Why a curve needs its own measurement
 *
 * A straight run has one across-wall direction, so its solid is an oriented box and the
 * intrusion is a projection onto a single normal. An arc's across-wall direction TURNS
 * along the run, so there is no such normal — which is why `wallIntrusionDepth` declined
 * a curved segment outright rather than measure its chord (an arc carries its chord in
 * `a`/`b`, and measuring that flags furniture near a straight line the wall is not on
 * while missing the wall itself).
 *
 * The honest analogue is polar. A `thickness`-thick wall on an arc of radius `R` is the
 * **annular sector** `R ± thickness/2` restricted to the arc's own angular sweep. So the
 * across-wall axis is the RADIUS and the along-run axis is the ANGLE, and the two
 * questions the straight case asks become:
 *
 * 1. what radii does the piece reach, *inside the sweep*? — overlapped with the band;
 * 2. what arc length does it cover? — where openings are subtracted, exactly as a door
 *    voids a straight run.
 *
 * ## Closed form, and why it must be
 *
 * Nothing here tessellates. The arc's tessellated band (`arcBandRing`) is a DRAWING
 * artifact whose vertex count is a rendering decision — a measurement that read it would
 * change with the facet count, which is the same reason a circular room's area is exact
 * `πR²` rather than the 48-gon the grid layer draws (v1.24, `docs/analysis.md`).
 *
 * The radial extremes over the region `rect ∩ wedge` are attained on its boundary, and
 * that boundary has only three kinds of piece, each with a closed-form extremum:
 *
 * - **rect edges inside the wedge** — `|p − C|` is convex along a segment, so its max is
 *   at an endpoint (a rect corner, or where a wedge ray crosses the edge) and its min at
 *   the perpendicular foot of `C` when that foot lies on the segment;
 * - **wedge rays inside the rect** — radius along a ray from `C` *is* the ray parameter,
 *   so a slab clip of the rect hands back the two radii directly, no trig at all;
 * - **the centre itself**, when the rect contains it (radius 0).
 *
 * Enumerating those candidates gives the exact `[rmin, rmax]`, and because radius is
 * continuous on a connected region every value between them is genuinely reached. The
 * one residual approximation is stated rather than hidden: when the sweep is reflex and
 * the piece straddles BOTH bounding rays, `rect ∩ wedge` can be two components and the
 * hull of their radii is conservative — the same direction of error the straight case's
 * projection already carries, and it can only over-report on a piece that already
 * surrounds the wall's own angular gap.
 */

import type { Point } from "../ast.js";
import { type Arc, arcAngleOffset, arcContainsRay } from "./arc.js";
import type { BBox } from "./rect.js";

const TAU = Math.PI * 2;

/** A rectangle's meeting with one curved wall's solid band. */
export interface ArcBandHit {
  /** Radial overlap (mm) with the band — the curve's analogue of intrusion depth. */
  depth: number;
  /**
   * The arc-length intervals (mm from the arc's start, so `0 … r·|sweep|`) the piece
   * covers. Openings are subtracted on this axis, exactly as they are along a straight
   * run. More than one interval only when the piece straddles both ends of a reflex
   * sweep.
   */
  runs: Array<[number, number]>;
}

const corners = (r: BBox): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
];

const inBox = (p: Point, r: BBox): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * The radii at which the ray from `c` in unit direction `u` enters and leaves `fr`, or
 * `null` when it misses. A slab clip: since the ray starts at the arc's centre, its
 * parameter IS the radius, so no distance is ever computed.
 */
function rayRectRadii(c: Point, u: Point, fr: BBox): [number, number] | null {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  const clip = (o: number, d: number, lo: number, hi: number): boolean => {
    if (d === 0) return o >= lo && o <= hi;
    const p = (lo - o) / d;
    const q = (hi - o) / d;
    t0 = Math.max(t0, Math.min(p, q));
    t1 = Math.min(t1, Math.max(p, q));
    return t1 >= t0;
  };
  if (!clip(c.x, u.x, fr.x, fr.x + fr.w)) return null;
  if (!clip(c.y, u.y, fr.y, fr.y + fr.h)) return null;
  return Number.isFinite(t1) && t1 >= t0 ? [t0, t1] : null;
}

/** The point of segment `a`–`b` nearest `p` (clamped to the segment). */
function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Unit direction `c` → `p`, or `null` when they coincide. */
function unitFrom(c: Point, p: Point): Point | null {
  const vx = p.x - c.x;
  const vy = p.y - c.y;
  const l = Math.hypot(vx, vy);
  return l > 0 ? { x: vx / l, y: vy / l } : null;
}

/**
 * The arc-length intervals of the arc that `fr` covers.
 *
 * A rectangle that contains the centre subtends every direction, so it covers the whole
 * run. Otherwise it is convex and seen from an outside point, so its angular extremes are
 * at CORNERS and its angular hull is narrower than a half-turn: the hull is the complement
 * of the widest gap between the four corner offsets, and intersecting that with `[0, mag]`
 * — at its own position and one turn back — gives the covered run.
 */
function sweptRuns(fr: BBox, arc: Arc, mag: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const keep = (a: number, b: number): void => {
    const s = Math.max(a, 0);
    const e = Math.min(b, mag);
    if (e > s) out.push([s * arc.r, e * arc.r]);
  };
  if (inBox(arc.center, fr)) {
    keep(0, mag);
    return out;
  }
  const offs = corners(fr)
    .map((p) => arcAngleOffset(arc, p))
    .sort((x, y) => x - y);
  let gap = offs[0]! + TAU - offs[3]!;
  let lo = offs[0]!;
  let hi = offs[3]!;
  for (let i = 0; i < 3; i++) {
    const g = offs[i + 1]! - offs[i]!;
    if (g > gap) {
      gap = g;
      lo = offs[i + 1]!;
      hi = offs[i]! + TAU;
    }
  }
  keep(lo, hi);
  keep(lo - TAU, hi - TAU);
  return out;
}

/**
 * The rectangle's meeting with the solid band of a `thickness`-thick wall following
 * `arc`, or `null` when there is none. See the module header for the derivation.
 */
export function arcBandIntrusion(fr: BBox, arc: Arc, thickness: number): ArcBandHit | null {
  const mag = Math.abs(arc.sweep);
  if (!(arc.r > 0) || !(mag > 0) || !(thickness > 0)) return null;
  const runs = sweptRuns(fr, arc, mag);
  if (runs.length === 0) return null;

  const c = arc.center;
  const radii: number[] = [];
  const cs = corners(fr);
  if (inBox(c, fr)) radii.push(0);
  for (const p of cs) if (arcContainsRay(arc, p)) radii.push(Math.hypot(p.x - c.x, p.y - c.y));
  for (const end of [arc.a, arc.b]) {
    const u = unitFrom(c, end);
    if (!u) continue;
    const hit = rayRectRadii(c, u, fr);
    if (hit) radii.push(hit[0], hit[1]);
  }
  for (let i = 0; i < 4; i++) {
    const foot = closestOnSegment(c, cs[i]!, cs[(i + 1) % 4]!);
    if (arcContainsRay(arc, foot)) radii.push(Math.hypot(foot.x - c.x, foot.y - c.y));
  }
  if (radii.length === 0) return null;

  const half = thickness / 2;
  const lo = Math.max(Math.min(...radii), arc.r - half);
  const hi = Math.min(Math.max(...radii), arc.r + half);
  return hi - lo > 0 ? { depth: hi - lo, runs } : null;
}

/**
 * The along-run interval (arc length from the arc's start) an opening centred at `at`
 * voids on this curve, or `null` when it is not on this arc at all — radially off the
 * band, or outside its sweep. Its width is measured along the arc, which is how `at
 * <pos>` walks a curved host in the first place (v1.24).
 */
export function arcOpeningVoid(
  arc: Arc,
  at: { x: number; y: number },
  width: number,
  thickness: number,
): [number, number] | null {
  const d = Math.hypot(at.x - arc.center.x, at.y - arc.center.y);
  if (Math.abs(d - arc.r) > thickness / 2 + 1) return null;
  if (!arcContainsRay(arc, at)) return null;
  const u = arcAngleOffset(arc, at) * arc.r;
  return [u - width / 2, u + width / 2];
}
