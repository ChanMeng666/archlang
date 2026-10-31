/**
 * Simple-polygon math for **polygonal rooms**.
 *
 * A rectangular room is a special case of a polygon, but the whole analysis layer was
 * written against `{at, size}` rectangles, so the rules here are deliberately kept in
 * their own module and reached ONLY when a room actually carries a polygon: the rect
 * path stays byte-identical (its own expressions, its own float behaviour), and a
 * polygon takes the closed-form generalisation below.
 *
 * Everything is exact and closed-form — shoelace area, the area centroid, ray-cast
 * containment, pairwise segment tests. No iteration to a tolerance, no trig, no
 * randomness: the same polygon always yields the same numbers, with or without the
 * optional geometry backend.
 *
 * The one sampled rule is {@link polygonLabelPoint}'s concave fallback, and it is worth
 * being precise about why that is allowed where "iterate to a tolerance" is not. A
 * tolerance loop stops when it is happy, so its answer depends on when you stopped,
 * which is not deterministic. The fallback here instead spends a **budget pinned in
 * source** ({@link LABEL_GRID} / {@link LABEL_REFINE_ROUNDS} / {@link LABEL_REFINE_STEPS}),
 * visits its candidates in one fixed order and keeps the first strict winner, so it is a
 * total function of the ring: same ring, same point, every run, on every platform. It is
 * also only ever reached when the exact centroid is NOT on the floor, so no plan that was
 * labelled at its centroid moves by a byte.
 *
 * A room polygon is **implicitly closed** and stored WITHOUT a repeated last vertex.
 */

import type { Point } from "../ast.js";
import { chargeSteps } from "../expr.js";
import type { BBox } from "./rect.js";

/** Two vertices closer than this (mm) are the same vertex. */
export const VERTEX_EPS = 1e-6;

/** Cross product of (b−a) × (c−a) — positive when a→b→c turns clockwise on screen. */
export function cross3(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Twice the signed shoelace area (positive = clockwise in screen space, y down). */
export function polygonSignedArea2(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** Absolute polygon area (mm²) by the shoelace formula — exact for any simple polygon. */
export function polygonArea(pts: readonly Point[]): number {
  return Math.abs(polygonSignedArea2(pts)) / 2;
}

/**
 * Area centroid of a simple polygon (the closed-form ⅓·Σ formula). Falls back to the
 * vertex mean for a degenerate (zero-area) ring so it never divides by zero.
 */
export function polygonCentroid(pts: readonly Point[]): Point {
  const a2 = polygonSignedArea2(pts);
  if (Math.abs(a2) < VERTEX_EPS) {
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    const n = Math.max(1, pts.length);
    return { x: sx / n, y: sy / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

/** Axis-aligned bounding box of a point ring (vertex extents). */
export function polygonBounds(pts: readonly Point[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The polygon's edges as vertex pairs, in ring order (last → first included). */
export function polygonEdges(pts: readonly Point[]): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  for (let i = 0; i < pts.length; i++) out.push([pts[i]!, pts[(i + 1) % pts.length]!]);
  return out;
}

/**
 * The ring with consecutive duplicate vertices and **collinear** (straight-through)
 * vertices removed — the polygon's *effective* vertices. `(0,0) (10,0) (20,0) (20,10)`
 * is a triangle with a redundant point on one edge, not a quadrilateral; the degeneracy
 * check counts these.
 */
export function effectiveVertices(pts: readonly Point[]): Point[] {
  const dedup: Point[] = [];
  for (const p of pts) {
    const prev = dedup[dedup.length - 1];
    if (prev && Math.abs(prev.x - p.x) < VERTEX_EPS && Math.abs(prev.y - p.y) < VERTEX_EPS) continue;
    dedup.push(p);
  }
  while (dedup.length > 1) {
    const first = dedup[0]!;
    const last = dedup[dedup.length - 1]!;
    if (Math.abs(first.x - last.x) < VERTEX_EPS && Math.abs(first.y - last.y) < VERTEX_EPS) dedup.pop();
    else break;
  }
  if (dedup.length < 3) return dedup;
  const out: Point[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const prev = dedup[(i - 1 + dedup.length) % dedup.length]!;
    const cur = dedup[i]!;
    const next = dedup[(i + 1) % dedup.length]!;
    if (Math.abs(cross3(prev, cur, next)) < VERTEX_EPS) continue; // straight through
    out.push(cur);
  }
  return out;
}

/** Distance from point p to segment ab. */
export function distPointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Shortest distance from `p` to the polygon's boundary (mm). */
export function distToPolygonEdge(p: Point, pts: readonly Point[]): number {
  let best = Infinity;
  for (const [a, b] of polygonEdges(pts)) {
    const d = distPointToSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** Does `p` lie on the polygon's boundary, within `tol` mm? */
export function pointOnPolygonEdge(p: Point, pts: readonly Point[], tol: number): boolean {
  return distToPolygonEdge(p, pts) <= tol;
}

/**
 * Ray-cast containment (crossing number), with the boundary counted as INSIDE — the
 * same closed-bounds convention {@link import("./rect.js").pointInRect} uses, so a cell
 * centre exactly on a room edge belongs to the room in both shapes.
 */
export function pointInPolygon(px: number, py: number, pts: readonly Point[], boundaryTol = VERTEX_EPS): boolean {
  if (pointOnPolygonEdge({ x: px, y: py }, pts, boundaryTol)) return true;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > py !== b.y > py) {
      const xAt = a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (px < xAt) inside = !inside;
    }
  }
  return inside;
}

/** A ring's {@link pointInPolygon}, answered from an index built once (see {@link polygonInsideTest}). */
export interface PolygonInsideTest {
  inside(px: number, py: number): boolean;
  /** The most edges one query reads: the fullest y-band, or 0 for a ring with no edge. */
  maxEdgesPerQuery: number;
}

/** Most y-bands one ring is binned into (memory is edges × bands spanned). */
const MAX_Y_BANDS = 64;

/**
 * {@link pointInPolygon} for many points against one ring, with its edges binned by **y-band**,
 * so a query reads only the edges whose y-range (grown by `boundaryTol` and a rounding margin)
 * reaches its band. Returns exactly `pointInPolygon(px, py, pts, boundaryTol)` for every point:
 *
 *  - an edge whose closed y-range, so grown, misses `py` can neither straddle `py` (the
 *    crossing test needs `py` inside it) nor lie within `boundaryTol` of the point (the nearest
 *    point of a segment lies in its y-range, up to a few ulps that the margin covers);
 *  - binning is by the same monotone `floor((v − minY) / h)` for an edge's grown ends and for
 *    the query, so a query's band lists every edge whose grown range holds `py`;
 *  - each surviving edge runs the same two expressions, in the same orientation, as
 *    {@link pointOnPolygonEdge} and the crossing loop; the on-edge result is an OR and the
 *    crossing result a parity, so the reduced order cannot change either.
 *
 * It saves work only where the bands thin the ring out: a comb whose teeth span every band
 * still reads them all (`maxEdgesPerQuery` says so, and a caller charges it).
 */
export function polygonInsideTest(pts: readonly Point[], boundaryTol = VERTEX_EPS): PolygonInsideTest {
  const n = pts.length;
  if (n === 0) return { inside: () => false, maxEdgesPerQuery: 0 };
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Far above any rounding of a segment's nearest point (a few ulps of 2^25 mm is ~1e-8).
  const margin = (lo: number, hi: number): number => boundaryTol + 1e-6 + 1e-12 * (Math.abs(lo) + Math.abs(hi));
  const bands = Math.max(1, Math.min(MAX_Y_BANDS, Math.ceil(Math.sqrt(n))));
  const h = maxY > minY ? (maxY - minY) / bands : 1;
  const bandOf = (v: number): number => Math.min(bands - 1, Math.max(0, Math.floor((v - minY) / h)));
  const bins: number[][] = Array.from({ length: bands }, () => []);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let k = 0; k < n; k++) {
    const a = pts[k]!;
    const b = pts[(k + 1) % n]!;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    const m = margin(lo, hi);
    lowest = Math.min(lowest, lo - m);
    highest = Math.max(highest, hi + m);
    for (let i = bandOf(lo - m), e = bandOf(hi + m); i <= e; i++) bins[i]!.push(k);
  }
  let maxEdgesPerQuery = 0;
  for (const b of bins) maxEdgesPerQuery = Math.max(maxEdgesPerQuery, b.length);
  return {
    maxEdgesPerQuery,
    inside(px: number, py: number): boolean {
      // No edge's grown range reaches `py`: no crossing and no edge within tolerance.
      if (!(py >= lowest && py <= highest)) return false;
      const bin = bins[bandOf(py)]!;
      const p = { x: px, y: py };
      for (const k of bin) if (distPointToSegment(p, pts[k]!, pts[(k + 1) % n]!) <= boundaryTol) return true;
      let inside = false;
      for (const k of bin) {
        // pointInPolygon's pair (i, j = i − 1) is this edge read from its far end.
        const a = pts[(k + 1) % n]!;
        const b = pts[k]!;
        if (a.y > py !== b.y > py) {
          const xAt = a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y);
          if (px < xAt) inside = !inside;
        }
      }
      return inside;
    },
  };
}

/** Lattice resolution of the label-point search: `LABEL_GRID + 1` samples per axis. */
export const LABEL_GRID = 10;
/** Refinement rounds around the incumbent, each searching half the previous span. */
export const LABEL_REFINE_ROUNDS = 3;
/** Samples either side of the incumbent, per axis, in each refinement round. */
export const LABEL_REFINE_STEPS = 5;

/**
 * Where a room's label and area text belong: the **area centroid when it is on the
 * floor**, and otherwise the ring's *pole of inaccessibility* — the interior point
 * furthest from any edge, i.e. the middle of the widest place the text can sit.
 *
 * An L or a U can put its exact centroid in the notch, outside its own floor, where the
 * label would be drawn over a neighbouring room (or over nothing at all). The centroid is
 * still the right answer wherever it is legal — it is exact, and it is what every existing
 * drawing was laid out with — so it is returned unchanged whenever the ring contains it,
 * and this fallback is unreachable for a rectangle, a circle, any convex ring and most
 * concave ones.
 *
 * The search is a coarse lattice over the bounding box followed by
 * {@link LABEL_REFINE_ROUNDS} halving rounds around the best point so far. Every
 * candidate is scored by {@link distToPolygonEdge} and only a **strictly** better score
 * displaces the incumbent, so the fixed visit order settles every tie: the result is a
 * pure function of the vertex ring, with no state, no randomness and no stop condition.
 * A ring so thin that not one candidate lands on it keeps the centroid (nothing better is
 * available, and the caller's `W_ROOM_*` diagnostics already speak to a degenerate floor).
 */
export function polygonLabelPoint(pts: readonly Point[]): Point {
  const centroid = polygonCentroid(pts);
  if (pointInPolygon(centroid.x, centroid.y, pts)) return centroid;
  const b = polygonBounds(pts);
  let best = centroid;
  let bestDist = -Infinity;
  const consider = (x: number, y: number): void => {
    if (!pointInPolygon(x, y, pts)) return;
    const d = distToPolygonEdge({ x, y }, pts);
    if (d > bestDist) {
      bestDist = d;
      best = { x, y };
    }
  };
  const cellW = b.w / LABEL_GRID;
  const cellH = b.h / LABEL_GRID;
  for (let i = 0; i <= LABEL_GRID; i++) {
    for (let j = 0; j <= LABEL_GRID; j++) consider(b.x + i * cellW, b.y + j * cellH);
  }
  if (bestDist === -Infinity) return centroid;
  for (let round = 0; round < LABEL_REFINE_ROUNDS; round++) {
    const step = Math.max(cellW, cellH) / 2 ** round / LABEL_REFINE_STEPS;
    const centre = best;
    for (let i = -LABEL_REFINE_STEPS; i <= LABEL_REFINE_STEPS; i++) {
      for (let j = -LABEL_REFINE_STEPS; j <= LABEL_REFINE_STEPS; j++) {
        consider(centre.x + i * step, centre.y + j * step);
      }
    }
  }
  return best;
}

/** Do the segments p1–p2 and p3–p4 cross *properly* (interiors meet at one point)? */
function segmentsProperlyCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross3(p3, p4, p1);
  const d2 = cross3(p3, p4, p2);
  const d3 = cross3(p1, p2, p3);
  const d4 = cross3(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Is `p` on segment a–b (assuming the three are collinear)? */
function onSegment(p: Point, a: Point, b: Point): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - VERTEX_EPS &&
    p.x <= Math.max(a.x, b.x) + VERTEX_EPS &&
    p.y >= Math.min(a.y, b.y) - VERTEX_EPS &&
    p.y <= Math.max(a.y, b.y) + VERTEX_EPS
  );
}

/**
 * Does the ring intersect itself (a non-simple polygon)? Closed form: every
 * non-adjacent edge pair is tested for a proper crossing, plus the degenerate cases
 * where a vertex lands in the middle of another edge or two collinear edges overlap.
 * Adjacent edges legitimately share exactly one endpoint, so they are only rejected
 * when they overlap along their length (a spike doubling back on itself).
 *
 * O(n²) on the vertex count, which is the right shape here — a room polygon is a
 * handful of vertices, and an index would cost more than it saves. A ring that is not
 * pays for it: every pair is one step (`MAX_EVAL_STEPS`), charged before the scan, so a
 * ring too long to test is `E_STEP_LIMIT` at once. Outside a resolution nothing is counted.
 */
export function polygonSelfIntersects(pts: readonly Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  chargeSteps((n * (n - 1)) / 2);
  const edges = polygonEdges(pts);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [a1, a2] = edges[i]!;
      const [b1, b2] = edges[j]!;
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
      // Collinear overlap (including a spike): any shared stretch longer than a point.
      if (Math.abs(cross3(a1, a2, b1)) < VERTEX_EPS && Math.abs(cross3(a1, a2, b2)) < VERTEX_EPS) {
        const t = (p: Point): number => (Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y) ? p.x : p.y);
        const lo = Math.min(t(a1), t(a2));
        const hi = Math.max(t(a1), t(a2));
        const blo = Math.min(t(b1), t(b2));
        const bhi = Math.max(t(b1), t(b2));
        if (Math.min(hi, bhi) - Math.max(lo, blo) > VERTEX_EPS) return true;
      }
      if (adjacent) continue;
      // A vertex of one edge sitting in the middle of the other (a touching, non-simple ring).
      for (const [p, a, b] of [
        [b1, a1, a2],
        [b2, a1, a2],
        [a1, b1, b2],
        [a2, b1, b2],
      ] as Array<[Point, Point, Point]>) {
        if (Math.abs(cross3(a, b, p)) < VERTEX_EPS && onSegment(p, a, b)) return true;
      }
    }
  }
  return false;
}

/** The four corners of a rect as a clockwise ring (the rectangle's polygon form). */
export function rectRing(r: BBox): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/**
 * Does the axis-aligned rect `r` lie **wholly inside** the ring? Every corner is
 * contained AND no ring edge cuts through the rect — the corner test alone would pass a
 * rect whose middle is crossed by the notch of a U.
 *
 * Used by the label-relocation pass to prefer a text box that fits on its own floor.
 * Closed form, no sampling: four containment tests plus the edge-pair crossings.
 */
export function rectInsidePolygon(r: BBox, ring: readonly Point[]): boolean {
  const corners = rectRing(r);
  for (const c of corners) if (!pointInPolygon(c.x, c.y, ring)) return false;
  for (const [a1, a2] of polygonEdges(ring)) {
    for (const [b1, b2] of polygonEdges(corners)) {
      if (segmentsProperlyCross(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/**
 * How many edge reads of an exact ring test one evaluation step pays for, so a read is counted at
 * the budget's own rate: {@link import("../expr.js").MAX_EVAL_STEPS} is set on a loop iteration of
 * 14 steps in 2 µs, about 140 ns a step, and a read is a few comparisons with no allocation, 6 to
 * 20 ns over staircases, combs and round rooms alike. A count, never a time.
 */
export const RING_READS_PER_STEP = 14;

/** Charge `reads` edge reads of an exact ring test to the step meter. */
function chargeRingReads(reads: number): void {
  chargeSteps(Math.ceil(reads / RING_READS_PER_STEP));
}

/** What of a ring can matter inside the two rings' shared window. */
interface WindowedRing {
  edges: Array<[Point, Point]>;
  /** Its vertices and edge midpoints, each one the only points a containment test asks about. */
  points: Point[];
}

/**
 * The window two rings' boxes share, and what of each ring reaches it. Two edges that cross do so
 * inside both boxes, so an edge that misses the window crosses nothing; a point outside the other
 * ring's box is neither inside it nor within {@link VERTEX_EPS} of it. The window is grown by far
 * more than any rounding of those tests (a few ulps of 2^25 mm is ~1e-8), so nothing is dropped.
 */
function overlapWindow(a: readonly Point[], b: readonly Point[], eps: number): [WindowedRing, WindowedRing] {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  const x0 = Math.max(ba.x, bb.x);
  const y0 = Math.max(ba.y, bb.y);
  const x1 = Math.min(ba.x + ba.w, bb.x + bb.w);
  const y1 = Math.min(ba.y + ba.h, bb.y + bb.h);
  const margin =
    Math.max(eps, VERTEX_EPS) + 1e-6 + 1e-12 * Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1));
  const inWindow = (p: Point): boolean =>
    p.x >= x0 - margin && p.x <= x1 + margin && p.y >= y0 - margin && p.y <= y1 + margin;
  const windowed = (ring: readonly Point[]): WindowedRing => {
    const edges: Array<[Point, Point]> = [];
    const points: Point[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if (inWindow(p)) points.push(p);
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (inWindow(mid)) points.push(mid);
      if (
        Math.max(p.x, q.x) >= x0 - margin &&
        Math.min(p.x, q.x) <= x1 + margin &&
        Math.max(p.y, q.y) >= y0 - margin &&
        Math.min(p.y, q.y) <= y1 + margin
      ) {
        edges.push([p, q]);
      }
    }
    return { edges, points };
  };
  return [windowed(a), windowed(b)];
}

/**
 * `distToPolygonEdge(p, ring) > eps && pointInPolygon(p.x, p.y, ring)` in one pass with no
 * allocation. An edge whose box, grown by the larger tolerance, misses `p` is further than that
 * tolerance, so its distance cannot decide either test and is not computed; the near edges and the
 * crossing count run the same expressions in the same orientation as those two functions.
 */
function strictlyInside(p: Point, ring: readonly Point[], eps: number): boolean {
  const reach = Math.max(eps, VERTEX_EPS) + 1e-6 + 1e-12 * (Math.abs(p.x) + Math.abs(p.y));
  let nearest = Infinity;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (
      p.x >= Math.min(a.x, b.x) - reach &&
      p.x <= Math.max(a.x, b.x) + reach &&
      p.y >= Math.min(a.y, b.y) - reach &&
      p.y <= Math.max(a.y, b.y) + reach
    ) {
      // The edge read as `polygonEdges` reads it, from pts[j] to pts[i].
      nearest = Math.min(nearest, distPointToSegment(p, b, a));
    }
    if (a.y > p.y !== b.y > p.y) {
      const xAt = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xAt) inside = !inside;
    }
  }
  return nearest > eps && (nearest <= VERTEX_EPS || inside);
}

/** The edge reads of the containment tests over two rings' windows. */
function containmentReads(a: readonly Point[], b: readonly Point[], wa: WindowedRing, wb: WindowedRing): number {
  return wa.points.length * b.length + wb.points.length * a.length;
}

/**
 * Do two simple polygons overlap in their **interiors** (by more than `eps` mm)?
 * Touching along a shared boundary — the normal case for two rooms either side of a
 * partition — is NOT an overlap, matching {@link import("./rect.js").rectsOverlap},
 * which needs more than 1 mm on both axes before it calls two rectangles overlapping.
 *
 * Exact, three closed-form cases: a properly crossing edge pair (two rings cutting
 * through each other), a vertex of one strictly inside the other (containment), or an
 * edge midpoint strictly inside the other (a shared-edge pair where one ring's vertices
 * all sit on the boundary). Each case reads only what reaches the window the two boxes share
 * ({@link overlapWindow}), so two round rooms that clip at a corner read a few edges of each.
 *
 * Past the box test each case is charged before it runs, in {@link RING_READS_PER_STEP}, so a pair
 * that a box rejects costs nothing and the charge falls with the work. Outside a resolution
 * nothing is counted: a caller there bounds itself with {@link polygonsOverlapCost}.
 */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[], eps = 1): boolean {
  if (ringBoxesMiss(a, b, eps)) return false;
  chargeRingReads(a.length + b.length);
  const [wa, wb] = overlapWindow(a, b, eps);
  chargeRingReads(wa.edges.length * wb.edges.length);
  for (const [a1, a2] of wa.edges) {
    for (const [b1, b2] of wb.edges) {
      if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
    }
  }
  chargeRingReads(containmentReads(a, b, wa, wb));
  for (const p of wa.points) if (strictlyInside(p, b, eps)) return true;
  for (const p of wb.points) if (strictlyInside(p, a, eps)) return true;
  return false;
}

/**
 * The most steps {@link polygonsOverlap} spends on a pair, and 0 when the box test rejects it. For
 * a caller outside a resolution, where nothing is counted: it adds this up and decides first.
 */
export function polygonsOverlapCost(a: readonly Point[], b: readonly Point[], eps = 1): number {
  if (ringBoxesMiss(a, b, eps)) return 0;
  const [wa, wb] = overlapWindow(a, b, eps);
  const steps = (reads: number): number => Math.ceil(reads / RING_READS_PER_STEP);
  return steps(a.length + b.length) + steps(wa.edges.length * wb.edges.length) + steps(containmentReads(a, b, wa, wb));
}

/** Are two rings' boxes too far apart to share more than `eps` mm on both axes? */
function ringBoxesMiss(a: readonly Point[], b: readonly Point[], eps: number): boolean {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  if (Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x) <= eps) return true;
  return Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y) <= eps;
}

/**
 * Length (mm) of the collinear overlap between segments a1–a2 and b1–b2: how much
 * *shared boundary* the two runs have. Zero unless the segments are parallel and their
 * supporting lines are within `tol` mm of each other — which is how two rooms either
 * side of a partition wall (drawn on centerlines up to a wall thickness apart) still
 * read as sharing that boundary.
 */
export function collinearOverlapLength(a1: Point, a2: Point, b1: Point, b2: Point, tol: number): number {
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < VERTEX_EPS || lb < VERTEX_EPS) return 0;
  // Parallel? (|sin| of the angle between them, scaled by the shorter length.)
  if (Math.abs(ax * by - ay * bx) / (la * lb) > 1e-9) return 0;
  // Perpendicular distance between the two supporting lines.
  const perp = Math.abs((b1.x - a1.x) * ay - (b1.y - a1.y) * ax) / la;
  if (perp > tol) return 0;
  const ux = ax / la;
  const uy = ay / la;
  const proj = (p: Point): number => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const t1 = proj(b1);
  const t2 = proj(b2);
  return Math.max(0, Math.min(la, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)));
}

/**
 * Do two room rings share a boundary run longer than a point (within `tol`)? The
 * polygon generalisation of {@link import("../analyze.js").roomsAdjacent}: same
 * semantics — a shared *corner* alone never counts, and a partition-thickness gap
 * still counts — expressed over arbitrary edges instead of the four rect sides.
 */
export function ringsAdjacent(a: readonly Point[], b: readonly Point[], tol: number): boolean {
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      if (collinearOverlapLength(a1, a2, b1, b2, tol) > 0) return true;
    }
  }
  return false;
}

/** Twice the signed area of a ring (shoelace). */
function area2(p: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/**
 * The area `subject` shares with the CONVEX ring `clip` (a text box): Sutherland–Hodgman against
 * each of the clip's edges, then the shoelace. Exact for any simple subject ring, convex or not —
 * the clipped ring may carry zero-width bridges along the clip's edges, which add no area.
 */
export function clippedArea(subject: readonly Point[], clip: readonly Point[]): number {
  return Math.abs(clippedSigned(subject, clip));
}

/** {@link clippedArea} keeping the subject's winding, so a hole's loop subtracts from its outer's. */
export function clippedSigned(subject: readonly Point[], clip: readonly Point[]): number {
  const turn = area2(clip) > 0 ? 1 : -1;
  let ring: Point[] = [...subject];
  for (let i = 0; i < clip.length && ring.length > 0; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const side = (p: Point): number => turn * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = ring;
    ring = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) ring.push(cut(prev, cur, sp, sc));
        ring.push(cur);
      } else if (sp >= 0) ring.push(cut(prev, cur, sp, sc));
    }
  }
  return ring.length >= 3 ? area2(ring) / 2 : 0;
}

function cut(p: Point, q: Point, sp: number, sq: number): Point {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/** The area of the rectangle `r` that lies outside `ring`: 0 when it stands wholly on the ring. */
export function rectAreaOutside(r: BBox, ring: readonly Point[]): number {
  return r.w * r.h - Math.abs(clippedSigned(ring, rectRing(r)));
}
