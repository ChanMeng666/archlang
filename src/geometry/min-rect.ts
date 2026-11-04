/**
 * The exact minimum-area enclosing rectangle of a point set on the 0.001 mm lattice
 * (plan-soundness PS5.1b; design `archlang-lab/plans/plan-soundness/research/2026-10-24-ps5-taste-design.md`
 * §3 R9, R18).
 *
 * The rectangle is read from the SHAPE: the convex hull of the ring, then rotating calipers over
 * the hull's edges (Freeman and Shapira 1975: a minimum-area enclosing rectangle has a side
 * collinear with a hull edge). It never reads a bounding box: an axis-aligned box is the answer
 * only when a hull edge is axis-aligned and that edge wins.
 *
 * **Exact.** Every input is a lattice integer (`BigInt`). For a hull edge `e` the rectangle's
 * extents are `Δ(p·e)` along the edge and `Δ(e×p)` across it, each `|e|` times the true length,
 * so the area is `Δ(p·e)·Δ(e×p) / |e|²` and `|e|` cancels from every ratio taste reads (aspect,
 * rectangularity): no square root, no trigonometry, no float. Ties between edges are broken by
 * the smaller aspect, so the answer does not depend on which hull vertex the walk starts at
 * (and so is invariant under the D4 frames and translations, which map the lattice to itself).
 *
 * Bounded by counts: the caller's work counter gets one unit per sort comparison, per hull
 * push or pop and per caliper step; {@link minRectCost} is an upper bound on that, computable
 * from the vertex count before the work.
 */

/** A point on the 0.001 mm lattice, as exact integers. */
export interface LatticePoint {
  x: bigint;
  y: bigint;
}

/** The minimum-area enclosing rectangle, as exact integers scaled by the winning edge's length. */
export interface MinRect {
  /** The longer side times `|e|` (lattice units × `|e|`). */
  long: bigint;
  /** The shorter side times `|e|`. Zero only for a degenerate (collinear) set, never returned. */
  short: bigint;
  /** `|e|²` of the winning hull edge: the rectangle's area is `long·short / norm2`. */
  norm2: bigint;
  /** How many vertices the convex hull kept (collinear points dropped). */
  hull: number;
}

/** A work counter: one unit per counted step. */
export interface MinRectWork {
  n: number;
}

const cross = (o: LatticePoint, a: LatticePoint, b: LatticePoint): bigint =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** ⌈log₂(n + 1)⌉, the comparison depth of a sort of `n` items. */
const log2Ceil = (n: number): number => {
  let k = 0;
  while (2 ** k < n + 1) k++;
  return k;
};

/**
 * An upper bound on the work {@link minAreaRect} counts for `n` input points: the sort (at most
 * `n·(⌈log₂(n+1)⌉ + 1)` comparisons; V8's TimSort stays under `n⌈log₂ n⌉`), the hull's pushes and
 * pops (at most `4n`), and the calipers (each of three pointers goes round at most twice, plus
 * one step per edge: `7n`).
 */
export function minRectCost(n: number): number {
  return n * (log2Ceil(n) + 1) + 4 * n + 7 * n + 2;
}

/**
 * The convex hull, counter-clockwise in the y-up sense (every turn `cross > 0`), with collinear
 * and repeated points dropped (Andrew's monotone chain). Fewer than three points come back for a
 * degenerate set.
 */
export function convexHull(points: readonly LatticePoint[], work: MinRectWork = { n: 0 }): LatticePoint[] {
  const pts = [...points].sort((a, b) => {
    work.n++;
    return a.x < b.x ? -1 : a.x > b.x ? 1 : a.y < b.y ? -1 : a.y > b.y ? 1 : 0;
  });
  const lower: LatticePoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0n) {
      work.n++;
      lower.pop();
    }
    work.n++;
    lower.push(p);
  }
  const upper: LatticePoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0n) {
      work.n++;
      upper.pop();
    }
    work.n++;
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  // A set of one repeated point comes back as two copies of it.
  if (hull.length === 2 && hull[0]!.x === hull[1]!.x && hull[0]!.y === hull[1]!.y) hull.pop();
  return hull;
}

/**
 * The minimum-area enclosing rectangle of `points`, or `null` when they are collinear (no
 * area). Rotating calipers over the convex hull: for each hull edge, three pointers walk
 * forward to the farthest point along the edge, across it, and back against it.
 */
export function minAreaRect(points: readonly LatticePoint[], work: MinRectWork = { n: 0 }): MinRect | null {
  const h = convexHull(points, work);
  const m = h.length;
  if (m < 3) return null;
  const at = (i: number): LatticePoint => h[i % m]!;
  let k = 1;
  let j = 1;
  let l = 1;
  let best: { long: bigint; short: bigint; norm2: bigint } | null = null;
  for (let i = 0; i < m; i++) {
    work.n++;
    const p = h[i]!;
    const q = at(i + 1);
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const dot = (t: LatticePoint): bigint => t.x * ex + t.y * ey;
    const crs = (t: LatticePoint): bigint => ex * (t.y - p.y) - ey * (t.x - p.x);
    if (i === 0) k = 1;
    // Farthest along e (unimodal from i+1; the support directions turn counter-clockwise).
    while (dot(at(k + 1)) >= dot(at(k)) && k < i + m) {
      work.n++;
      k++;
    }
    if (i === 0) j = k;
    // Farthest across e (to the left).
    while (crs(at(j + 1)) >= crs(at(j)) && j < i + m) {
      work.n++;
      j++;
    }
    if (i === 0) l = j;
    // Farthest against e.
    while (dot(at(l + 1)) <= dot(at(l)) && l < i + m) {
      work.n++;
      l++;
    }
    const along = dot(at(k)) - dot(at(l));
    const across = crs(at(j));
    const long = along >= across ? along : across;
    const short = along >= across ? across : along;
    const norm2 = ex * ex + ey * ey;
    if (best === null) {
      best = { long, short, norm2 };
      continue;
    }
    // area = long·short / norm2: the smaller wins; on a tie, the smaller aspect long/short.
    const a = long * short * best.norm2;
    const b = best.long * best.short * norm2;
    if (a < b || (a === b && long * best.short < best.long * short)) best = { long, short, norm2 };
  }
  return { ...best!, hull: m };
}

/** Twice the absolute area of a lattice ring (the shoelace sum), exact. */
export function latticeArea2(ring: readonly LatticePoint[]): bigint {
  let s = 0n;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s < 0n ? -s : s;
}
