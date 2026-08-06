/**
 * Simple-polygon math for **polygonal rooms** (v1.23).
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
 * tolerance loop stops when it is happy, so its answer depends on when you stopped —
 * that is the thing v1.23 rejected. The fallback here instead spends a **budget pinned in
 * source** ({@link LABEL_GRID} / {@link LABEL_REFINE_ROUNDS} / {@link LABEL_REFINE_STEPS}),
 * visits its candidates in one fixed order and keeps the first strict winner, so it is a
 * total function of the ring: same ring, same point, every run, on every platform. It is
 * also only ever reached when the exact centroid is NOT on the floor, so no plan that was
 * labelled at its centroid moves by a byte.
 *
 * A room polygon is **implicitly closed** and stored WITHOUT a repeated last vertex.
 */

import type { Point } from "../ast.js";
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

/** Distance from `p` to the segment `a`–`b` (mm). */
function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** Shortest distance from `p` to the polygon's boundary (mm). */
export function distToPolygonEdge(p: Point, pts: readonly Point[]): number {
  let best = Infinity;
  for (const [a, b] of polygonEdges(pts)) {
    const d = distToSegment(p, a, b);
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
 * handful of vertices, and an index would cost more than it saves.
 */
export function polygonSelfIntersects(pts: readonly Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
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
 * Do two simple polygons overlap in their **interiors** (by more than `eps` mm)?
 * Touching along a shared boundary — the normal case for two rooms either side of a
 * partition — is NOT an overlap, matching {@link import("./rect.js").rectsOverlap},
 * which needs more than 1 mm on both axes before it calls two rectangles overlapping.
 *
 * Exact, three closed-form cases: a properly crossing edge pair (two rings cutting
 * through each other), a vertex of one strictly inside the other (containment), or an
 * edge midpoint strictly inside the other (a shared-edge pair where one ring's vertices
 * all sit on the boundary).
 */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[], eps = 1): boolean {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  if (Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x) <= eps) return false;
  if (Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y) <= eps) return false;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
    }
  }
  const strictlyInside = (p: Point, ring: readonly Point[]): boolean =>
    distToPolygonEdge(p, ring) > eps && pointInPolygon(p.x, p.y, ring);
  for (const [p, ring] of [
    [a, b],
    [b, a],
  ] as Array<[readonly Point[], readonly Point[]]>) {
    for (const v of p) if (strictlyInside(v, ring)) return true;
    for (const [e1, e2] of polygonEdges(p)) {
      if (strictlyInside({ x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 }, ring)) return true;
    }
  }
  return false;
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
