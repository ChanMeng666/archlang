/**
 * Closed-form intersection and ray-crossing primitives for **wall joinery**.
 *
 * Everything the joinery layer needs to ask of two curves — where do they meet, and is
 * this point inside that loop — lives here, once. Pure arithmetic: no iteration to a
 * tolerance, no sampling, no optional geometry backend. The same inputs give the same
 * numbers on every platform, which is what lets a joined wall drawing stay byte-stable
 * with and without `clipper2-wasm`.
 *
 * ## Three conventions to read before touching a sign
 *
 * 1. **Screen millimetres.** +x right, +y **down**, so `atan2(y, x)` increases
 *    *clockwise as drawn*. Every rotation below is stated the way the reader sees it on
 *    the sheet, matching `./arc.js`'s header.
 * 2. **`perp(d) = (-d.y, d.x)`** — the same rotation `normal()` in `../geometry.js`
 *    applies. It is `+90°` mathematically, which in y-down screen space points to the
 *    **right of travel**. (`../geometry.js` calls it the "left normal", meaning the
 *    mathematical rotation; `./arc.js`'s header describes the same vector as the right
 *    of travel. Both are correct about the same arithmetic — this module uses the
 *    screen-space wording.)
 * 3. **Positive signed area = clockwise on screen**, the sign `polygon.ts`'s
 *    `polygonSignedArea2` and `elements/roof.ts`'s outward-normal rule already use.
 *
 * ## Why the axis-aligned special case exists
 *
 * `meetLines` short-circuits a vertical × horizontal pair to `(v.x, h.y)` with **no
 * arithmetic at all**. Almost every plan is rectilinear, and a rectilinear corner must
 * come out at `4100`, never at `4099.999999999999` — a corner that misses its own
 * integer by an ulp is a point the interner will not fuse with the identical corner
 * arrived at from the other side, and the joinery graph then has two vertices where the
 * drawing has one. `elements/roof.ts`'s `meet` learned the same lesson one algebraic
 * step later (it uses the implicit `a·x + b·y = c` Cramer form rather than the
 * parametric one, because the parametric form's multiply-back-out produced
 * `-5700.000000000001`); the general branch here uses that same implicit form, and the
 * special case removes even that.
 *
 * `PARALLEL_SIN` is deliberately the same `1e-12` policy as `elements/roof.ts` — a
 * scale-free sine test, so a 60 mm jog and a 60 m facade are judged by the same angle.
 */

import type { Point } from "../ast.js";
import type { Arc } from "./arc.js";
import { arcPointAt } from "./arc.js";

/** A free vector in the same millimetre space as a {@link Point}. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Two directions whose cross product, divided by both lengths, falls below this are
 * parallel. Scale-free by construction — the same policy (and the same literal) as
 * `PARALLEL_SIN` in `elements/roof.ts`.
 */
export const PARALLEL_SIN = 1e-12;

/** 2D cross product (the z of the 3D one): `> 0` means `b` is clockwise from `a` on screen. */
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
/** 2D dot product. */
export const dot2 = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** `d` rotated 90° — to the **right of travel** in y-down screen space. */
export const perp = (d: Vec2): Vec2 => ({ x: -d.y, y: d.x });
/** `b − a`. */
export const sub2 = (a: Point, b: Point): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
/** Unit vector, or `(0,0)` for a zero vector (never NaN). */
export function unit2(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

/** Are two directions parallel (within {@link PARALLEL_SIN})? */
export function parallel(d: Vec2, e: Vec2): boolean {
  const ld = Math.hypot(d.x, d.y);
  const le = Math.hypot(e.x, e.y);
  if (ld === 0 || le === 0) return true;
  return Math.abs(cross2(d, e)) / (ld * le) < PARALLEL_SIN;
}

/**
 * Parameters of the meeting point of the two infinite lines `P + s·d` and `Q + u·e`,
 * by Cramer's rule. `null` when they are parallel (including collinear — a collinear
 * pair has no single meeting point, and the joinery layer handles it by splitting at
 * each other's endpoints instead).
 *
 * `s`/`u` are the parametric positions, so `0 ≤ s ≤ 1` says the crossing falls inside
 * the segment `P → P+d`.
 */
export function lineLineParams(P: Point, d: Vec2, Q: Point, e: Vec2): { s: number; u: number } | null {
  const den = cross2(d, e);
  if (parallel(d, e)) return null;
  const w = sub2(Q, P);
  return { s: cross2(w, e) / den, u: cross2(w, d) / den };
}

/**
 * The point where the two infinite lines meet, or `null` when they are parallel.
 *
 * A vertical × horizontal pair returns `(vertical.x, horizontal.y)` with no arithmetic,
 * so a rectilinear plan's corners are EXACT (see the header). Everything else takes the
 * implicit-form Cramer solve — algebraically identical to the parametric one, but every
 * quantity is a product of the inputs divided exactly once.
 */
export function meetLines(P: Point, d: Vec2, Q: Point, e: Vec2): Point | null {
  // Exact rectilinear short circuit, both orderings.
  if (d.x === 0 && d.y !== 0 && e.y === 0 && e.x !== 0) return { x: P.x, y: Q.y };
  if (d.y === 0 && d.x !== 0 && e.x === 0 && e.y !== 0) return { x: Q.x, y: P.y };
  if (parallel(d, e)) return null;
  const a1 = d.y;
  const b1 = -d.x;
  const c1 = d.y * P.x - d.x * P.y;
  const a2 = e.y;
  const b2 = -e.x;
  const c2 = e.y * Q.x - e.x * Q.y;
  const det = a1 * b2 - a2 * b1;
  return { x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det };
}

/**
 * Parameters `s` along the line `P + s·d` where it meets the circle `(c, R)`, ascending.
 *
 * The quadratic `(d·d)s² + 2 d·(P−c) s + |P−c|² − R² = 0`. A negative discriminant is
 * two misses (empty); an exactly-zero one is a true tangency (one root). A *grazing*
 * pair produces two roots a sub-micron apart, which is correct — the joinery layer's
 * interner is the single place a tolerance is applied, and it fuses them into one
 * vertex. Deciding tangency here with a second, different epsilon is how two layers
 * come to disagree about how many vertices a junction has.
 */
export function lineCircleParams(P: Point, d: Vec2, c: Point, R: number): number[] {
  const A = dot2(d, d);
  if (A === 0) return [];
  const f = sub2(P, c);
  const B = dot2(d, f);
  const C = dot2(f, f) - R * R;
  const disc = B * B - A * C;
  if (disc < 0) return [];
  if (disc === 0) return [-B / A];
  const sq = Math.sqrt(disc);
  return [(-B - sq) / A, (-B + sq) / A];
}

/**
 * The 0, 1 or 2 points where two circles meet, in a canonical order (by `x`, then `y`)
 * so the result never depends on which circle was passed first.
 *
 * Empty when the circles are separate (`D > r1+r2`), nested (`D < |r1−r2|`) or
 * **concentric** (`D = 0` — identical circles have infinitely many meeting points, and
 * the honest answer to "where do they cross" is none; the joinery layer detects that
 * case by name and splits at each other's endpoints).
 */
export function circleCircle(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const D = Math.hypot(dx, dy);
  if (D === 0) return [];
  if (D > r1 + r2) return [];
  if (D < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + D * D) / (2 * D);
  const k2 = r1 * r1 - a * a;
  const k = Math.sqrt(Math.max(0, k2));
  const bx = c1.x + (a * dx) / D;
  const by = c1.y + (a * dy) / D;
  if (k === 0) return [{ x: bx, y: by }];
  const px = (-dy / D) * k;
  const py = (dx / D) * k;
  const out = [
    { x: bx + px, y: by + py },
    { x: bx - px, y: by - py },
  ];
  out.sort((p, q) => p.x - q.x || p.y - q.y);
  return out;
}

/* ---------------------------------------------------------------------------
 * Arc sub-ranges
 * ------------------------------------------------------------------------- */

const TAU = Math.PI * 2;

/**
 * Signed parameter of `p` along `arc`, **unclamped and un-wrapped**: `0` at `a`, `1` at
 * `b`, slightly negative just before the start, slightly over 1 just past the end.
 *
 * `arcParamAt` in `./arc.js` deliberately clamps and snaps (it answers "where along this
 * edge does an opening sit"); a mitre has to be able to say "0.3 mm PAST the end", which
 * is what this answers. The offset is normalised into `(−π, π]` rather than `[0, 2π)`,
 * so an overshoot reads as `t > 1` instead of wrapping round to just under 1. That
 * necessarily breaks down when `|sweep|` approaches `2π` — there is no room left to
 * overshoot into — and a near-full-circle face has no meaningful mitre either, so the
 * caller falls back to a bevel there.
 */
export function arcParamSigned(arc: Arc, p: Point): number {
  const mag = Math.abs(arc.sweep);
  if (mag === 0) return 0;
  const th = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
  let d = (arc.sweep >= 0 ? th - arc.start : arc.start - th) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d / mag;
}

/**
 * The sub-arc of `arc` between parameters `t0` and `t1` (each `0` = `a`, `1` = `b`).
 * Same circle, proportionally scaled sweep. The endpoints come from `arcPointAt`, which
 * returns the authored endpoints verbatim at `t = 0` / `t = 1`, so trimming nothing off
 * an end leaves that end EXACT rather than re-derived through `cos`/`sin`.
 */
export function subArc(arc: Arc, t0: number, t1: number): Arc {
  return {
    center: arc.center,
    r: arc.r,
    a: arcPointAt(arc, t0),
    b: arcPointAt(arc, t1),
    sweep: arc.sweep * (t1 - t0),
    start: arc.start + arc.sweep * t0,
  };
}

/** The arc reversed: same circle, endpoints swapped, sweep negated. */
export function reverseArc(arc: Arc): Arc {
  return { center: arc.center, r: arc.r, a: arc.b, b: arc.a, sweep: -arc.sweep, start: arc.start + arc.sweep };
}

/**
 * Parameters `t ∈ [0, 1)` of the given absolute angles that fall inside the arc's swept
 * range, walked in the arc's OWN rotational direction. Unlike {@link arcParamSigned}
 * this wraps into `[0, 2π)`, so it stays correct for a sweep longer than a half turn —
 * which is exactly the case a y-monotone split has to get right (a 300° arc has both
 * extremes inside it).
 */
function anglesInSweep(arc: Arc, angles: readonly number[]): number[] {
  const mag = Math.abs(arc.sweep);
  if (mag === 0) return [];
  const out: number[] = [];
  for (const th of angles) {
    let off = (arc.sweep >= 0 ? th - arc.start : arc.start - th) % TAU;
    if (off < 0) off += TAU;
    if (off < mag) out.push(off / mag);
  }
  return out;
}

/**
 * `arc` cut into at most three pieces, each **monotone in y**.
 *
 * The cuts are at the two angles where `dy/dθ = r·cos θ = 0` — i.e. `±π/2`, the
 * circle's bottom and top points — that fall strictly inside the sweep. The property
 * this buys the ray-crossing rule is stronger than monotonicity alone: because the cuts
 * are exactly where `cos θ` changes sign, every piece also lies entirely in ONE half
 * plane about the centre (`x ≥ c.x` or `x ≤ c.x`), so the horizontal ray's crossing
 * abscissa `c.x ± √(r² − dy²)` has an unambiguous root.
 */
export function splitArcYMonotone(arc: Arc): Arc[] {
  const hit = Y_MONOTONE_MEMO.get(arc);
  if (hit) return hit;
  const out = computeYMonotone(arc);
  Y_MONOTONE_MEMO.set(arc, out);
  return out;
}

/**
 * Memo for {@link splitArcYMonotone}, keyed by the `Arc` OBJECT.
 *
 * A winding test walks every arc of every loop it is asked about, and the joinery layer
 * asks thousands of times per plan; re-deriving the same two cuts each time was the
 * dominant cost on a curved drawing. A `WeakMap` keeps this a pure memo rather than
 * state: the result is a total function of the arc, entries die with the arcs, and
 * nothing observable depends on whether a lookup hit.
 */
const Y_MONOTONE_MEMO = new WeakMap<Arc, Arc[]>();

function computeYMonotone(arc: Arc): Arc[] {
  if (arc.r <= 0 || arc.sweep === 0) return [arc];
  const ts: number[] = [];
  for (const t of anglesInSweep(arc, [Math.PI / 2, -Math.PI / 2])) {
    if (t > 1e-12 && t < 1 - 1e-12) ts.push(t);
  }
  const uniq = [...new Set(ts)].sort((a, b) => a - b);
  if (uniq.length === 0) return [arc];
  const out: Arc[] = [];
  let prev = 0;
  for (const t of uniq) {
    out.push(subArc(arc, prev, t));
    prev = t;
  }
  out.push(subArc(arc, prev, 1));
  return out;
}

/* ---------------------------------------------------------------------------
 * Ray crossings (the nonzero winding rule)
 * ------------------------------------------------------------------------- */

/**
 * Winding contribution of the straight edge `a → b` to a horizontal `+x` ray from `p`.
 *
 * The half-open rule `(a.y ≤ p.y) !== (b.y ≤ p.y)` counts a vertex exactly once however
 * many edges meet there, which is what makes the winding number well defined for a
 * point level with a corner. `+1` for an edge running DOWN the screen, `−1` for one
 * running up.
 *
 * A horizontal edge contributes nothing (both endpoints fall the same side of the
 * test), and a vertical edge's crossing abscissa is `a.x` exactly — no arithmetic at
 * all on the coordinate that decides the comparison.
 */
export function rayCrossingLine(p: Point, a: Point, b: Point): number {
  if (a.y <= p.y === b.y <= p.y) return 0;
  const t = (p.y - a.y) / (b.y - a.y);
  const x = a.x + t * (b.x - a.x);
  if (!(x > p.x)) return 0;
  return b.y > a.y ? 1 : -1;
}

/**
 * Winding contribution of a circular edge to the same horizontal `+x` ray from `p`.
 *
 * Split into y-monotone pieces first, so each piece crosses the ray's line at most once
 * and sits in one half plane about the centre — the root of `x = c.x ± √(r² − dy²)` is
 * then chosen by which half the piece is in, never by trying both and picking one. The
 * same half-open endpoint rule as {@link rayCrossingLine}, so a loop that mixes straight
 * and curved edges is counted consistently.
 */
export function rayCrossingArc(p: Point, arc: Arc): number {
  let n = 0;
  for (const piece of splitArcYMonotone(arc)) {
    const a = piece.a;
    const b = piece.b;
    if (a.y <= p.y === b.y <= p.y) continue;
    const dy = p.y - piece.center.y;
    const rad2 = piece.r * piece.r - dy * dy;
    if (rad2 < 0) continue;
    const half = Math.sqrt(rad2);
    // Which half plane the piece occupies: its own midpoint decides, and by
    // construction the whole piece agrees with it.
    const mid = arcPointAt(piece, 0.5);
    const x = mid.x >= piece.center.x ? piece.center.x + half : piece.center.x - half;
    if (!(x > p.x)) continue;
    n += b.y > a.y ? 1 : -1;
  }
  return n;
}
