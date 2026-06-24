/** Pure geometry helpers. All coordinates in millimetres. Deterministic. */

import type { PlanNode, Point } from "./ast.js";

export interface Vec {
  x: number;
  y: number;
}

export const sub = (a: Point, b: Point): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Point, b: Vec): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (v: Vec, s: number): Vec => ({ x: v.x * s, y: v.y * s });
export const length = (v: Vec): number => Math.hypot(v.x, v.y);
export function unit(v: Vec): Vec {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}
/** Left normal (rotate +90°). */
export const normal = (v: Vec): Vec => ({ x: -v.y, y: v.x });

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const emptyBounds = (): Bounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});

export function extendBounds(b: Bounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
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

/** Axis-aligned rectangle corners (clockwise) from origin + size. */
export function rectCorners(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * Square-capped offset rectangle for a wall segment: the segment is widened by
 * `thickness` and extended by `thickness/2` at each end so orthogonal corners
 * fill cleanly when adjacent segments are drawn.
 */
export function segmentRectangle(a: Point, b: Point, thickness: number): Point[] {
  const d = unit(sub(b, a));
  const n = normal(d);
  const half = thickness / 2;
  const a2 = add(a, mul(d, -half));
  const b2 = add(b, mul(d, half));
  return [
    add(a2, mul(n, half)),
    add(b2, mul(n, half)),
    add(b2, mul(n, -half)),
    add(a2, mul(n, -half)),
  ];
}

export interface WallSegment {
  a: Point;
  b: Point;
  thickness: number;
  kind: string;
}

/** Flatten all walls to their individual segments. */
export function wallSegments(plan: PlanNode): WallSegment[] {
  const segs: WallSegment[] = [];
  for (const w of plan.walls) {
    for (let k = 0; k < w.points.length - 1; k++) {
      segs.push({ a: w.points[k], b: w.points[k + 1], thickness: w.thickness, kind: w.kind });
    }
    if (w.closed && w.points.length > 2) {
      segs.push({ a: w.points[w.points.length - 1], b: w.points[0], thickness: w.thickness, kind: w.kind });
    }
  }
  return segs;
}

/** The wall segment hosting an opening point (nearest), filtered by ref if given. */
export function hostSegment(plan: PlanNode, at: Point, wallRef?: string): WallSegment | null {
  const walls = wallRef
    ? plan.walls.filter((w) => w.id === wallRef || w.kind === wallRef)
    : plan.walls;
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const w of walls) {
    const segs: [Point, Point][] = [];
    for (let k = 0; k < w.points.length - 1; k++) segs.push([w.points[k], w.points[k + 1]]);
    if (w.closed && w.points.length > 2) segs.push([w.points[w.points.length - 1], w.points[0]]);
    for (const [a, b] of segs) {
      const dist = distPointToSegment(at, a, b);
      if (dist < bestDist) {
        bestDist = dist;
        best = { a, b, thickness: w.thickness, kind: w.kind };
      }
    }
  }
  return best;
}

/** Drawing bounds over walls (offset by thickness), rooms, furniture, and dims. */
export function planBounds(plan: PlanNode): Bounds {
  const b = emptyBounds();
  for (const seg of wallSegments(plan)) {
    for (const c of segmentRectangle(seg.a, seg.b, seg.thickness)) extendBounds(b, c.x, c.y);
  }
  for (const r of plan.rooms) {
    extendBounds(b, r.at.x, r.at.y);
    extendBounds(b, r.at.x + r.size.w, r.at.y + r.size.h);
  }
  for (const f of plan.furniture) {
    extendBounds(b, f.at.x, f.at.y);
    extendBounds(b, f.at.x + f.size.w, f.at.y + f.size.h);
  }
  for (const d of plan.dims) {
    extendBounds(b, d.from.x, d.from.y);
    extendBounds(b, d.to.x, d.to.y);
  }
  if (!isFinite(b.minX)) {
    // Nothing to draw; provide a default frame.
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  return b;
}
