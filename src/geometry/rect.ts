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

import type { WallSegment } from "../geometry.js";

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

/**
 * How deep (mm) a furniture rectangle `fr` intrudes into an orthogonal wall
 * segment's solid band, counting only the run that is *not* an opening (a door or
 * window voids the wall there). A piece flush against the wall face intrudes ~0;
 * one straddling the centerline intrudes by up to the wall thickness. Returns 0 for
 * non-orthogonal segments (handled conservatively — angled walls don't trip this).
 *
 * "Intrusion" is the across-wall overlap; it is only meaningful when the along-wall
 * overlap survives opening subtraction, so a counter under a window or a piece in a
 * doorway isn't read as passing through solid wall.
 */
export function wallIntrusionDepth(
  fr: BBox,
  s: WallSegment,
  openings: Array<{ at: { x: number; y: number }; width: number }>,
): number {
  const horiz = s.a.y === s.b.y;
  const vert = s.a.x === s.b.x;
  if (horiz === vert) return 0; // diagonal or degenerate — skip
  const half = s.thickness / 2;
  if (horiz) {
    const band = overlap1d(fr.y, fr.y + fr.h, s.a.y - half, s.a.y + half); // across-wall (depth)
    if (band <= 0) return 0;
    const segLo = Math.min(s.a.x, s.b.x);
    const segHi = Math.max(s.a.x, s.b.x);
    const lo = Math.max(fr.x, segLo);
    const hi = Math.min(fr.x + fr.w, segHi);
    if (hi - lo <= 1) return 0;
    // Subtract opening spans that lie on this segment's line.
    const voids = openings
      .filter((o) => Math.abs(o.at.y - s.a.y) <= half + 1)
      .map((o) => [o.at.x - o.width / 2, o.at.x + o.width / 2] as [number, number]);
    return solidRemains(lo, hi, voids) ? band : 0;
  }
  const band = overlap1d(fr.x, fr.x + fr.w, s.a.x - half, s.a.x + half);
  if (band <= 0) return 0;
  const segLo = Math.min(s.a.y, s.b.y);
  const segHi = Math.max(s.a.y, s.b.y);
  const lo = Math.max(fr.y, segLo);
  const hi = Math.min(fr.y + fr.h, segHi);
  if (hi - lo <= 1) return 0;
  const voids = openings
    .filter((o) => Math.abs(o.at.x - s.a.x) <= half + 1)
    .map((o) => [o.at.y - o.width / 2, o.at.y + o.width / 2] as [number, number]);
  return solidRemains(lo, hi, voids) ? band : 0;
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
 * Signed across-wall intrusion of `fr` into one orthogonal wall segment (null if
 * none or non-orthogonal), with the axis and wall centerline so callers can compute
 * the push that clears it. Deliberately DISTINCT semantics from
 * {@link wallIntrusionDepth}: this one **ignores openings** (the repair corrector
 * moves a piece out of the wall band whether or not a door voids part of it) —
 * do not merge the two.
 */
export function wallIntrusion(
  fr: BBox,
  s: { a: { x: number; y: number }; b: { x: number; y: number }; thickness: number },
): { depth: number; axis: "x" | "y"; center: number } | null {
  const horiz = s.a.y === s.b.y;
  const vert = s.a.x === s.b.x;
  if (horiz === vert) return null;
  const h2 = s.thickness / 2;
  if (horiz) {
    const band = overlap1d(fr.y, fr.y + fr.h, s.a.y - h2, s.a.y + h2);
    const lo = Math.max(fr.x, Math.min(s.a.x, s.b.x));
    const hi = Math.min(fr.x + fr.w, Math.max(s.a.x, s.b.x));
    if (band <= 0 || hi - lo <= 1) return null;
    return { depth: band, axis: "y", center: s.a.y };
  }
  const band = overlap1d(fr.x, fr.x + fr.w, s.a.x - h2, s.a.x + h2);
  const lo = Math.max(fr.y, Math.min(s.a.y, s.b.y));
  const hi = Math.min(fr.y + fr.h, Math.max(s.a.y, s.b.y));
  if (band <= 0 || hi - lo <= 1) return null;
  return { depth: band, axis: "x", center: s.a.x };
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
