/**
 * Furniture relations (ADR 0029): the closed-form geometry behind `facing <id>`,
 * `against <room>.<edge>` and `clear front|sides <mm>`.
 *
 * Everything here is pure arithmetic on resolved rectangles and wall segments. Nothing
 * searches and nothing chooses: `facing` evaluates its four quarter-turns and refuses a miss or
 * a tie, `against <room>.<edge>` refuses every backing it cannot state exactly, and the `clear`
 * measure is a distance, never a verdict (lint judges it).
 *
 * **The front.** A symbol is drawn with its back on the TOP edge of its footprint at `rotate 0`
 * (`src/fixture-orientation.ts`), so at turn `r` the back is `top`/`right`/`bottom`/`left` for
 * `r` = 0/90/180/270 and the front is the opposite edge. The footprint is the plan `w x h` at
 * every turn. The front ray starts at the front edge's midpoint and runs along its outward
 * normal.
 */

import type { Point } from "./ast.js";
import { backEdgeOfDeg } from "./algebra/d4.js";
import { doorLeaves, segmentsOfWall, type DoorSwing, type WallSegment } from "./geometry.js";
import type { RDoor, RFurniture, RWall } from "./ir.js";
import { solidFurniture } from "./fixtures-catalog.js";
import type { BBox } from "./geometry/rect.js";
import type { RectEdge } from "./fixture-orientation.js";

/** The four quarter-turns, the only output `facing` has (D4's rotations). */
export const TURNS = [0, 90, 180, 270] as const;
export type Turn = (typeof TURNS)[number];

/** A unit axis direction. */
export interface Axis {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

/** The front edge of `rect` at turn `turn`: its midpoint, its outward normal, and the
 *  coordinate of its line on the normal's axis. */
export function frontOf(rect: BBox, turn: number): { o: Point; u: Axis; edge: RectEdge } {
  const back = backEdgeOfDeg(turn);
  switch (back) {
    case "right":
      return { o: { x: rect.x, y: rect.y + rect.h / 2 }, u: { x: -1, y: 0 }, edge: "left" };
    case "bottom":
      return { o: { x: rect.x + rect.w / 2, y: rect.y }, u: { x: 0, y: -1 }, edge: "top" };
    case "left":
      return { o: { x: rect.x + rect.w, y: rect.y + rect.h / 2 }, u: { x: 1, y: 0 }, edge: "right" };
    default:
      return { o: { x: rect.x + rect.w / 2, y: rect.y + rect.h }, u: { x: 0, y: 1 }, edge: "bottom" };
  }
}

/**
 * How far the front ray of `rect` at `turn` runs before it enters `target`, or `null` when it
 * never does. The ray's line must pass through the target's OPEN interior (a ray along a side
 * does not enter it) and the target must not lie wholly behind the ray's origin; the distance
 * is then the entry parameter, `0` when the origin is already in the target's closure.
 * Exact on resolved coordinates (integers or half-integers).
 */
export function frontRayHit(rect: BBox, turn: number, target: BBox): number | null {
  const { o, u } = frontOf(rect, turn);
  const x0 = target.x;
  const x1 = target.x + target.w;
  const y0 = target.y;
  const y1 = target.y + target.h;
  if (u.x === 0) {
    if (!(x0 < o.x && o.x < x1)) return null;
    if (u.y > 0) return y1 > o.y ? Math.max(0, y0 - o.y) : null;
    return y0 < o.y ? Math.max(0, o.y - y1) : null;
  }
  if (!(y0 < o.y && o.y < y1)) return null;
  if (u.x > 0) return x1 > o.x ? Math.max(0, x0 - o.x) : null;
  return x0 < o.x ? Math.max(0, o.x - x1) : null;
}

/** What `facing` derives: one turn, or the reason there is none. */
export type FacingResult =
  | { kind: "turn"; turn: Turn; distance: number }
  | { kind: "miss" }
  | { kind: "tie"; turns: Turn[] };

/** The quarter-turn whose front ray enters `target` nearest; a miss or a tie is refused. */
export function facingTurn(rect: BBox, target: BBox): FacingResult {
  let best: number | null = null;
  let at: Turn[] = [];
  for (const t of TURNS) {
    const d = frontRayHit(rect, t, target);
    if (d === null) continue;
    if (best === null || d < best) {
      best = d;
      at = [t];
    } else if (d === best) at.push(t);
  }
  if (best === null) return { kind: "miss" };
  if (at.length > 1) return { kind: "tie", turns: at };
  return { kind: "turn", turn: at[0]!, distance: best };
}

/** The body of an opening on its host (width along the host, host thickness across it), or
 *  `null` when the host is missing, curved or not axis-aligned. */
export function openingBody(o: { at: Point; width: number; host: WallSegment | null }): BBox | null {
  const s = o.host;
  if (!s || s.arc) return null;
  const t = s.thickness;
  if (s.a.y === s.b.y) return { x: o.at.x - o.width / 2, y: o.at.y - t / 2, w: o.width, h: t };
  if (s.a.x === s.b.x) return { x: o.at.x - t / 2, y: o.at.y - o.width / 2, w: t, h: o.width };
  return null;
}

// ---- clear zones (ADR 0029 §4) ----------------------------------------------------------

/** One clear strip: the region `face … face + depth` along `u`, laterally `lo … hi`. */
export interface Strip {
  /** Coordinate of the piece's face on `u`'s axis. */
  face: number;
  u: Axis;
  lo: number;
  hi: number;
  depth: number;
}

/** The strip in front of a piece's face `edge`. */
function stripOn(rect: BBox, edge: RectEdge, depth: number): Strip {
  switch (edge) {
    case "top":
      return { face: rect.y, u: { x: 0, y: -1 }, lo: rect.x, hi: rect.x + rect.w, depth };
    case "bottom":
      return { face: rect.y + rect.h, u: { x: 0, y: 1 }, lo: rect.x, hi: rect.x + rect.w, depth };
    case "left":
      return { face: rect.x, u: { x: -1, y: 0 }, lo: rect.y, hi: rect.y + rect.h, depth };
    case "right":
      return { face: rect.x + rect.w, u: { x: 1, y: 0 }, lo: rect.y, hi: rect.y + rect.h, depth };
  }
}

const OPPOSITE: Readonly<Record<RectEdge, RectEdge>> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** The strips a `clear front` (one) or `clear sides` (two: the edges beside the back) names. */
export function clearStrips(rect: BBox, turn: number | undefined, zone: "front" | "sides", depth: number): Strip[] {
  const back = backEdgeOfDeg(turn);
  if (zone === "front") return [stripOn(rect, OPPOSITE[back], depth)];
  return back === "top" || back === "bottom"
    ? [stripOn(rect, "left", depth), stripOn(rect, "right", depth)]
    : [stripOn(rect, "top", depth), stripOn(rect, "bottom", depth)];
}

/** Standoff of `p` from the strip's face along its normal. */
const standoff = (s: Strip, p: Point): number => (s.u.x !== 0 ? (p.x - s.face) * s.u.x : (p.y - s.face) * s.u.y);
/** The strip as a plan rectangle. */
function stripRect(s: Strip): BBox {
  const a = s.face;
  const b = s.face + s.depth * (s.u.x !== 0 ? s.u.x : s.u.y);
  const n0 = Math.min(a, b);
  const n1 = Math.max(a, b);
  return s.u.x !== 0 ? { x: n0, y: s.lo, w: n1 - n0, h: s.hi - s.lo } : { x: s.lo, y: n0, w: s.hi - s.lo, h: n1 - n0 };
}

/** Clip a convex polygon to an axis-aligned rectangle (Sutherland–Hodgman). */
export function clipToRect(poly: Point[], r: BBox): Point[] {
  const edges: Array<[(p: Point) => number, number]> = [
    [(p) => p.x - r.x, 0],
    [(p) => r.x + r.w - p.x, 0],
    [(p) => p.y - r.y, 0],
    [(p) => r.y + r.h - p.y, 0],
  ];
  let out = poly;
  for (const [f] of edges) {
    if (out.length === 0) break;
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i]!;
      const q = inp[(i + 1) % inp.length]!;
      const fp = f(p);
      const fq = f(q);
      if (fp >= 0) out.push(p);
      if (fp >= 0 !== fq >= 0) {
        const t = fp / (fp - fq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

/** Twice the signed area of a polygon. */
export function area2(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** The nearest standoff of a convex polygon inside the strip, or `null` when it does not
 *  overlap the strip with positive area. */
export function polygonStandoff(s: Strip, poly: Point[]): number | null {
  const clipped = clipToRect(poly, stripRect(s));
  if (clipped.length < 3 || Math.abs(area2(clipped)) <= 1e-9) return null;
  let m = Infinity;
  for (const p of clipped) m = Math.min(m, standoff(s, p));
  return Math.max(0, m);
}

/** The corners of a rectangle as a polygon. */
export function rectPoly(r: BBox): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** A straight wall segment's body (centreline +/- half thickness), or `null` for an arc. */
export function wallBody(seg: WallSegment): Point[] | null {
  if (seg.arc) return null;
  const dx = seg.b.x - seg.a.x;
  const dy = seg.b.y - seg.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = (-dy / len) * (seg.thickness / 2);
  const ny = (dx / len) * (seg.thickness / 2);
  return [
    { x: seg.a.x + nx, y: seg.a.y + ny },
    { x: seg.b.x + nx, y: seg.b.y + ny },
    { x: seg.b.x - nx, y: seg.b.y - ny },
    { x: seg.a.x - nx, y: seg.a.y - ny },
  ];
}

/**
 * The nearest standoff of a hinged door's swept quarter-disc inside the strip, in closed form,
 * or `null` when the two do not meet. The intersection is convex, so the minimum of the
 * standoff (a linear function) lies on one of: the disc's three vertices, the strip's corners,
 * the strip edges' crossings with the disc's two radii and its arc, and the arc's extreme point
 * toward the face.
 */
export function swingStandoff(s: Strip, sw: DoorSwing): number | null {
  const r = stripRect(s);
  const R = sw.radius;
  const h = sw.hinge;
  const a = { x: sw.leafEnd.x - h.x, y: sw.leafEnd.y - h.y };
  const b = { x: sw.farJamb.x - h.x, y: sw.farJamb.y - h.y };
  const cross = (p: Point, q: Point): number => p.x * q.y - p.y * q.x;
  const ab = cross(a, b);
  // Inside the (at most 90 degree) wedge between the two radii, on the hinge's side.
  const inWedge = (v: Point): boolean =>
    ab >= 0 ? cross(a, v) >= -1e-9 && cross(v, b) >= -1e-9 : cross(a, v) <= 1e-9 && cross(v, b) <= 1e-9;
  const inDisc = (p: Point): boolean => {
    const v = { x: p.x - h.x, y: p.y - h.y };
    return v.x * v.x + v.y * v.y <= R * R * (1 + 1e-12) + 1e-9 && inWedge(v);
  };
  const inRect = (p: Point): boolean =>
    p.x >= r.x - 1e-9 && p.x <= r.x + r.w + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.h + 1e-9;
  const cands: Point[] = [h, sw.leafEnd, sw.farJamb, ...rectPoly(r)];
  // The arc's extreme points along both axes: the one toward the face (−u) is where the
  // standoff can be least, and the others are where an arc bulging through a strip edge has the
  // third vertex the area test below needs.
  cands.push({ x: h.x + R, y: h.y }, { x: h.x - R, y: h.y }, { x: h.x, y: h.y + R }, { x: h.x, y: h.y - R });
  // Crossings of the strip's four edge lines with the radii and the circle.
  const lines: Array<{ vertical: boolean; c: number }> = [
    { vertical: true, c: r.x },
    { vertical: true, c: r.x + r.w },
    { vertical: false, c: r.y },
    { vertical: false, c: r.y + r.h },
  ];
  for (const L of lines) {
    for (const end of [sw.leafEnd, sw.farJamb]) {
      const p0 = L.vertical ? h.x : h.y;
      const p1 = L.vertical ? end.x : end.y;
      if (p0 === p1) continue;
      const t = (L.c - p0) / (p1 - p0);
      if (t < 0 || t > 1) continue;
      cands.push({ x: h.x + (end.x - h.x) * t, y: h.y + (end.y - h.y) * t });
    }
    const off = L.c - (L.vertical ? h.x : h.y);
    const disc = R * R - off * off;
    if (disc < 0) continue;
    const k = Math.sqrt(disc);
    for (const sgn of [-1, 1]) {
      cands.push(L.vertical ? { x: L.c, y: h.y + sgn * k } : { x: h.x + sgn * k, y: L.c });
    }
  }
  const inside = cands.filter((p) => inRect(p) && inDisc(p));
  // The disc and the strip must overlap with positive AREA: a contact at a point or along a
  // line (a leaf end on the strip's edge, a vertex on the face, a radius lying along a side)
  // leaves the strip usable. The intersection is convex and every vertex of it is a candidate,
  // so it has area exactly when three of the candidates found are not collinear.
  if (!spansArea(inside)) return null;
  let m = Infinity;
  for (const p of inside) m = Math.min(m, standoff(s, p));
  return Math.max(0, m);
}

/** Do three of `pts` span a triangle of positive area? (Duplicates are harmless.) */
function spansArea(pts: readonly Point[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const a = pts[i]!;
        const b = pts[j]!;
        const c = pts[k]!;
        if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 1e-6) return true;
      }
  return false;
}

/** A thing that can stand in a clear zone. */
export type Obstacle =
  | { kind: "furniture"; piece: RFurniture }
  | { kind: "wall"; seg: WallSegment }
  | { kind: "swing"; door: RDoor };

/** The measured clear depth of one zone and what set it (`null`: nothing inside it). */
export interface ClearMeasure {
  measured: number;
  by: Obstacle | null;
}

/** The obstacles a `clear` zone is measured against: the solid pieces (`solidFurniture()`,
 *  ADR 0017 decision 3), every straight wall segment, every hinged door's swing. */
export interface ClearWorld {
  furniture: readonly RFurniture[];
  segments: readonly WallSegment[];
  swings: readonly { door: RDoor; swing: DoorSwing }[];
}

/** The obstacle world of one storey's IR. */
export function clearWorldOf(
  furniture: readonly RFurniture[],
  walls: readonly RWall[],
  doors: readonly RDoor[],
): ClearWorld {
  const swings: { door: RDoor; swing: DoorSwing }[] = [];
  for (const d of doors) for (const s of doorLeaves(d)) swings.push({ door: d, swing: s });
  return { furniture: solidFurniture(furniture), segments: walls.flatMap((w) => segmentsOfWall(w)), swings };
}

/** The clear depth of one strip, capped at its declared depth and floored at 0. */
export function measureStrip(s: Strip, world: ClearWorld, self: RFurniture): ClearMeasure {
  let best = s.depth;
  let by: Obstacle | null = null;
  const take = (v: number | null, o: Obstacle): void => {
    if (v === null) return;
    const c = Math.min(v, s.depth);
    if (c < best) {
      best = c;
      by = o;
    }
  };
  for (const f of world.furniture) {
    if (f !== self)
      take(polygonStandoff(s, rectPoly({ x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h })), {
        kind: "furniture",
        piece: f,
      });
  }
  for (const seg of world.segments) {
    const body = wallBody(seg);
    if (body) take(polygonStandoff(s, body), { kind: "wall", seg });
  }
  for (const { door, swing } of world.swings) take(swingStandoff(s, swing), { kind: "swing", door });
  return { measured: best, by };
}

/** The measured clear depth of a declared zone of `f`: the smallest of its strips (both
 *  sides for `sides`), and what set it. */
export function measureClear(f: RFurniture, zone: "front" | "sides", depth: number, world: ClearWorld): ClearMeasure {
  const rect = { x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h };
  let out: ClearMeasure | undefined;
  for (const s of clearStrips(rect, f.rotate, zone, depth)) {
    const m = measureStrip(s, world, f);
    if (out === undefined || m.measured < out.measured) out = m;
  }
  return out!;
}
