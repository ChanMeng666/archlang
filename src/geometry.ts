/** Pure geometry helpers. All coordinates in millimetres. Deterministic. */

import type { Point } from "./ast.js";
import type { DoorHinge, DoorKind, DoorSwingDir } from "./grammar/tokens.js";
import type { Arc } from "./geometry/arc.js";
import {
  arcBandRing,
  arcExtremes,
  arcLength,
  arcOffset,
  arcPointAt,
  arcTangentAt,
  distPointToArc,
} from "./geometry/arc.js";
import type { GridBox } from "./geometry/grid-index.js";
import { GridIndex } from "./geometry/grid-index.js";

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

/* ---------------------------------------------------------------------------
 * Where a dimension's LINE lands — the one predicate behind `W_DIM_INSIDE`.
 *
 * Two consumers share it, and they must never disagree: the lint rule
 * (`lint/rules/dims.ts`), which asks it of the dimension as written, and the fix
 * producer (`fix-producers.ts`), which asks it of the SWAPPED dimension to decide
 * whether the swap is worth offering. A second copy of this arithmetic is how the
 * fix came to 2-cycle in the first place — the producer offered a swap it had
 * never evaluated, so on a dim running THROUGH the building it swapped back and
 * forth forever. Keep it here, the way `doorSwing` is shared by the renderer and
 * `W_SWING_OBSTRUCTED`.
 * ------------------------------------------------------------------------- */

/** The measured segment of a dimension plus the perpendicular offset its drawn
 *  line sits at — everything the inside/outside question needs. */
export interface DimLike {
  from: Point;
  to: Point;
  offset: number;
}

/**
 * Midpoint of the line a `dim` actually DRAWS: the midpoint of what it measures,
 * pushed `offset` along the LEFT normal of from→to. The endpoints themselves are
 * no use for this — a dimension legitimately runs corner to corner and so sits ON
 * the building's edges; the midpoint is what answers which side the offset threw it.
 */
export function dimLineMid(dm: DimLike): Point {
  const off = mul(normal(unit(sub(dm.to, dm.from))), dm.offset);
  return add({ x: (dm.from.x + dm.to.x) / 2, y: (dm.from.y + dm.to.y) / 2 }, off);
}

/** The same dimension with its two endpoints exchanged — exactly what the
 *  `W_DIM_INSIDE` fix writes, expressed as geometry so it can be evaluated
 *  BEFORE the fix is offered. Reversing from→to negates the left normal, so the
 *  drawn line mirrors across the measured segment. */
export const dimSwapped = (dm: DimLike): DimLike => ({ from: dm.to, to: dm.from, offset: dm.offset });

/** Margin (mm) the drawn line must clear the room-extents box by to count as outside. */
const DIM_INSIDE_EPS = 1;

/** Does this dimension's drawn LINE (not its witness lines) read inside `box`,
 *  the room extents of the building it annotates? */
export function dimReadsInside(dm: DimLike, box: Bounds): boolean {
  const p = dimLineMid(dm);
  return (
    p.x > box.minX + DIM_INSIDE_EPS &&
    p.x < box.maxX - DIM_INSIDE_EPS &&
    p.y > box.minY + DIM_INSIDE_EPS &&
    p.y < box.maxY - DIM_INSIDE_EPS
  );
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

/**
 * Start/end angles (in degrees) of the **minor** arc from `start` to `end` about
 * `center`, in CAD orientation (Y up, counter-clockwise positive — the opposite
 * of the screen's Y-down space these points live in). Returned ordered so the
 * swept arc is the shorter one. Backends that emit native arcs (e.g. DXF `ARC`)
 * use this so the trig lives here, not in the serializer.
 */
export function minorArcDegrees(center: Point, start: Point, end: Point): [number, number] {
  const deg = (p: Point): number => (Math.atan2(-(p.y - center.y), p.x - center.x) * 180) / Math.PI;
  const a1 = deg(start);
  const a2 = deg(end);
  const ccw = (((a2 - a1) % 360) + 360) % 360;
  return ccw <= 180 ? [a1, a2] : [a2, a1];
}

/** The hinge/leaf/arc geometry of a door swing, in plan space (mm). */
export interface DoorSwing {
  /** Hinge point (arc centre). */
  hinge: Point;
  /** Far jamb — the other side of the opening; the closed-leaf position. */
  farJamb: Point;
  /** Tip of the leaf at the fully-open (90°) position. */
  leafEnd: Point;
  /** Quarter-disc radius (= door width). */
  radius: number;
  /** SVG sweep flag for the minor arc from `leafEnd` to `farJamb` about `hinge`. */
  sweep: 0 | 1;
}

/** Minimal door shape the swing geometry needs (a resolved door). */
export interface DoorLike {
  at: Point;
  width: number;
  hinge: DoorHinge;
  swing: DoorSwingDir;
  host: { a: Point; b: Point; thickness: number; arc?: Arc } | null;
  /**
   * The door's kind, when it is not the default `hinged` (v1.25). OPTIONAL on
   * purpose: every existing caller and fixture omits it and behaves exactly as
   * before, and the one new rule below is a two-line early return.
   */
  doorKind?: DoorKind;
}

/**
 * Hinge, far jamb, open-leaf tip and minor-arc orientation of a door's swing.
 * Computed **once** from the host wall direction so the renderer (leaf line + arc
 * primitive, every backend) and the linter (swing-clearance checks) agree on the
 * exact quarter-disc the leaf sweeps. Returns `null` for an unhosted door.
 *
 * On a CURVED host the direction is the tangent **at the door's own position** (see
 * {@link segmentDirAt}), so the leaf is a chord of the wall at the doorway and the
 * quarter-disc swings off the true face. `hinge left|right` keeps its meaning — it is
 * relative to the direction of travel along the wall, which on an arc is the direction
 * the arc turns (`ccw` by default), not the chord.
 *
 * Returns `null` for every NON-HINGED kind (v1.25): a bypass, barn, bifold or pocket
 * leaf sweeps no quarter-disc, so there is no hinge, no leaf radius and no arc to
 * report. Every caller already handles `null` — the renderer draws no leaf,
 * `W_SWING_OBSTRUCTED` stops flagging it (correctly: there is nothing to obstruct) and
 * `repair()` has one fewer obstacle. This is the ONE place the kind reaches the swing
 * model; nothing else about a door's geometry is kind-dependent.
 */
export function doorSwing(d: DoorLike): DoorSwing | null {
  const seg = d.host;
  if (!seg) return null;
  if (d.doorKind !== undefined && d.doorKind !== "hinged") return null;
  const dir = segmentDirAt(seg, d.at);
  const n = normal(dir);
  const hw = d.width / 2;
  const hinge = d.hinge === "left" ? add(d.at, mul(dir, -hw)) : add(d.at, mul(dir, hw));
  const farJamb = d.hinge === "left" ? add(d.at, mul(dir, hw)) : add(d.at, mul(dir, -hw));
  const leafDir = d.swing === "in" ? n : mul(n, -1);
  const leafEnd = add(hinge, mul(leafDir, d.width));
  const cross = (leafEnd.x - hinge.x) * (farJamb.y - hinge.y) - (leafEnd.y - hinge.y) * (farJamb.x - hinge.x);
  // SVG draws `M leafEnd A r r 0 0 sweep farJamb` with no explicit centre, so the
  // sweep flag must select the candidate circle centred on the hinge (a convex
  // quarter-disc). For the minor arc (large-arc-flag 0) that is sweep = 1 when the
  // signed area (leafEnd−hinge)×(farJamb−hinge) is positive, 0 otherwise. The prior
  // `cross < 0 ? 1 : 0` was inverted, selecting the other centre → a concave arc.
  const sweep: 0 | 1 = cross > 0 ? 1 : 0;
  return { hinge, farJamb, leafEnd, radius: d.width, sweep };
}

/** Bounding box of a sized element, mm. */
export interface RectXYWH {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Is point `p` inside (or on) the axis-aligned rect, with an optional inflate? */
function pointInRect(p: Point, r: RectXYWH, pad: number): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** Is point `p` within the 90° wedge of swing `s` (between the two bounding radii)? */
function pointInWedge(p: Point, s: DoorSwing): boolean {
  const cr = (ux: number, uy: number, vx: number, vy: number): number => ux * vy - uy * vx;
  const closed = sub(s.farJamb, s.hinge); // closed-leaf radius
  const open = sub(s.leafEnd, s.hinge); // open-leaf radius
  const pv = sub(p, s.hinge);
  // p is in the wedge iff it is on the same rotational side of both bounding radii
  // as the wedge interior (the other bounding radius).
  const sideClosed = Math.sign(cr(closed.x, closed.y, open.x, open.y));
  const sideOpen = Math.sign(cr(open.x, open.y, closed.x, closed.y));
  const pc = Math.sign(cr(closed.x, closed.y, pv.x, pv.y));
  const po = Math.sign(cr(open.x, open.y, pv.x, pv.y));
  return (pc === sideClosed || pc === 0) && (po === sideOpen || po === 0);
}

/**
 * Conservative test: does the 90° quarter-disc the door leaf sweeps overlap the
 * axis-aligned rectangle `r` (inflated by `clearance`)? True when the hinge is in
 * the rect, when any rect corner falls inside the swept wedge within the radius,
 * or when the rect spans the hinge's row/column inside the radius. Used by the
 * `W_SWING_OBSTRUCTED` lint rule — biased to flag (a clearance heuristic), so a
 * door leaf that grazes a bed or fixture is reported.
 */
export function sectorIntersectsRect(s: DoorSwing, r: RectXYWH, clearance: number): boolean {
  const R = s.radius + clearance;
  if (pointInRect(s.hinge, r, clearance)) return true;
  // Nearest point of the rect to the hinge — if it is beyond the radius, no overlap.
  const nx = Math.max(r.x, Math.min(s.hinge.x, r.x + r.w));
  const ny = Math.max(r.y, Math.min(s.hinge.y, r.y + r.h));
  if (Math.hypot(nx - s.hinge.x, ny - s.hinge.y) > R) return false;
  // The nearest point is within radius; accept if it (or any corner) is in the wedge.
  const pad = clearance;
  const corners: Point[] = [
    { x: nx, y: ny },
    { x: r.x - pad, y: r.y - pad },
    { x: r.x + r.w + pad, y: r.y - pad },
    { x: r.x + r.w + pad, y: r.y + r.h + pad },
    { x: r.x - pad, y: r.y + r.h + pad },
  ];
  for (const c of corners) {
    if (Math.hypot(c.x - s.hinge.x, c.y - s.hinge.y) <= R && pointInWedge(c, s)) return true;
  }
  // Wedge interior points (leaf tip, mid-swing) landing inside the rect.
  const mid = add(s.hinge, mul(unit(add(sub(s.leafEnd, s.hinge), sub(s.farJamb, s.hinge))), s.radius));
  for (const p of [s.leafEnd, mid]) {
    if (pointInRect(p, r, clearance)) return true;
  }
  return false;
}

/** Do two door swings' quarter-discs overlap (within `clearance`)? */
export function swingsCollide(a: DoorSwing, b: DoorSwing, clearance: number): boolean {
  // Quick reject: if the hinges are farther apart than the sum of radii + clearance
  // the discs cannot meet.
  const hingeGap = Math.hypot(a.hinge.x - b.hinge.x, a.hinge.y - b.hinge.y);
  if (hingeGap > a.radius + b.radius + clearance) return false;
  // Sample b's wedge arc and test against a's wedge (and vice versa). Conservative.
  const sampleInOther = (s: DoorSwing, o: DoorSwing): boolean => {
    const c0 = sub(s.farJamb, s.hinge);
    const c1 = sub(s.leafEnd, s.hinge);
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const vx = c0.x + (c1.x - c0.x) * t;
      const vy = c0.y + (c1.y - c0.y) * t;
      const p = add(s.hinge, mul(unit({ x: vx, y: vy }), s.radius));
      const within = Math.hypot(p.x - o.hinge.x, p.y - o.hinge.y) <= o.radius + clearance;
      if (within && pointInWedge(p, o)) return true;
    }
    return false;
  };
  return sampleInOther(a, b) || sampleInOther(b, a);
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
  return [add(a2, mul(n, half)), add(b2, mul(n, half)), add(b2, mul(n, -half)), add(a2, mul(n, -half))];
}

export interface WallSegment {
  a: Point;
  b: Point;
  thickness: number;
  category: string;
  /** Id of the wall this segment belongs to (so a host knows *which* wall). */
  wallId: string;
  /** Index of this segment within its wall's point list (0-based). */
  index: number;
  /**
   * Present only when this edge is a circular **arc** (`arc (x,y) radius R`, v1.24).
   * `a`/`b` stay the CHORD endpoints, so every consumer written against a straight
   * run still reads a truthful, in-place edge and degrades gracefully; a consumer
   * that must be exact on a curve reads this and generalises (or declines with a
   * catalogued diagnostic — never silently approximates).
   */
  arc?: Arc;
  /**
   * True on EVERY segment of a wall that carries at least one `arc` edge — including its
   * straight ones.
   *
   * **Informational; no renderer reads it since v1.30.** It existed because a curved wall
   * was lowered per-segment and voided none of its openings, so an opening on such a
   * wall's straight run still needed an opaque cover. The joinery pass now cuts every
   * opening on every host, so there is nothing to branch on. Kept as a truthful fact
   * about the segment (and pinned by `test/curves.test.ts`) rather than removed from a
   * shape other code reads.
   */
  arcWall?: boolean;
}

/** Minimal wall shape needed by the segment/hosting helpers (a resolved wall). */
export interface WallLike {
  id: string;
  category: string;
  thickness: number;
  points: Point[];
  closed: boolean;
  /**
   * Curved edges, indexed by SEGMENT index: entry `k` is the arc from `points[k]` to
   * `points[k+1]`. Absent (or an absent entry) = a straight run, which is every plan
   * written before v1.24 — that is what keeps their geometry byte-identical.
   */
  arcs?: ReadonlyArray<Arc | undefined>;
}

/** Flatten a single wall into its individual segments. */
export function segmentsOfWall(w: WallLike): WallSegment[] {
  const segs: WallSegment[] = [];
  const arcAt = (k: number): Arc | undefined => w.arcs?.[k];
  const curved = wallHasArc(w);
  for (let k = 0; k < w.points.length - 1; k++) {
    const arc = arcAt(k);
    segs.push({
      a: w.points[k]!,
      b: w.points[k + 1]!,
      thickness: w.thickness,
      category: w.category,
      wallId: w.id,
      index: k,
      ...(arc ? { arc } : {}),
      ...(curved ? { arcWall: true } : {}),
    });
  }
  if (w.closed && w.points.length > 2) {
    const k = w.points.length - 1;
    const arc = arcAt(k);
    segs.push({
      a: w.points[k]!,
      b: w.points[0]!,
      thickness: w.thickness,
      category: w.category,
      wallId: w.id,
      index: k,
      ...(arc ? { arc } : {}),
      ...(curved ? { arcWall: true } : {}),
    });
  }
  return segs;
}

/** Does this wall carry any curved edge? (The one predicate the lowering splits on.) */
export function wallHasArc(w: WallLike): boolean {
  return w.arcs?.some((a) => a !== undefined) === true;
}

/**
 * Distance from `p` to a wall segment — the arc-aware generalisation of
 * {@link distPointToSegment}. Every nearest-host, on-wall and adjacency scan routes
 * through this, so a curve competes for an opening on the same footing as a straight
 * run instead of being measured by its chord.
 */
export function distPointToWallSegment(p: Point, s: { a: Point; b: Point; arc?: Arc }): number {
  return s.arc ? distPointToArc(p, s.arc) : distPointToSegment(p, s.a, s.b);
}

/**
 * Unit direction of travel along a wall segment **at** `p`: the chord direction for a
 * straight run, the TANGENT for an arc. This is the single seam through which every
 * traversal-relative rule (a door's hinge side and swing normal, a window's pane and
 * jambs, an opening's cover) keeps meaning the same thing on a curve as on a straight
 * wall — none of them learns about arcs.
 */
export function segmentDirAt(s: { a: Point; b: Point; arc?: Arc }, p: Point): Vec {
  return s.arc ? arcTangentAt(s.arc, p) : unit(sub(s.b, s.a));
}

/** Run length of a wall segment (arc length for a curve, chord length otherwise). */
export function segmentLength(s: { a: Point; b: Point; arc?: Arc }): number {
  return s.arc ? arcLength(s.arc) : length(sub(s.b, s.a));
}

/** The point `along` mm from a segment's start, measured along the edge itself. */
export function segmentPointAlong(s: { a: Point; b: Point; arc?: Arc }, along: number): Point {
  if (s.arc) {
    const total = arcLength(s.arc);
    return arcPointAt(s.arc, total === 0 ? 0 : along / total);
  }
  return add(s.a, mul(unit(sub(s.b, s.a)), along));
}

/**
 * The `thickness`-wide solid of one wall segment as a closed ring: the square-capped
 * offset rectangle for a straight run, the tessellated concentric band for an arc.
 * The ONE place a wall segment becomes an area.
 */
export function segmentSolid(s: { a: Point; b: Point; arc?: Arc }, thickness: number): Point[] {
  return s.arc ? arcBandRing(s.arc, thickness) : segmentRectangle(s.a, s.b, thickness);
}

/**
 * The extreme points of a segment's OUTER face — what a page must contain. Closed-form
 * for an arc (endpoints plus any axis extreme inside the sweep), so a bulge is never
 * clipped and never sized from its tessellation.
 */
export function segmentFaceExtremes(s: { a: Point; b: Point; arc?: Arc }, thickness: number): Point[] {
  if (!s.arc) return segmentRectangle(s.a, s.b, thickness);
  const half = thickness / 2;
  return [...arcExtremes(arcOffset(s.arc, half)), ...arcExtremes(arcOffset(s.arc, -half))];
}

/** The wall segment hosting an opening point (nearest), filtered by ref if given. */
export function hostSegmentForWalls(walls: WallLike[], at: Point, ref?: string): WallSegment | null {
  const candidates = ref ? walls.filter((w) => w.id === ref || w.category === ref) : walls;
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const w of candidates) {
    for (const s of segmentsOfWall(w)) {
      const dist = distPointToWallSegment(at, s);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
  }
  return best;
}

/**
 * The wall nearest to `p` (by closest segment), as a related-span diagnostic
 * note — used to point a "door/window not on any wall" warning at the wall it
 * was probably meant for. Returns null if no wall carries a span.
 */
export function nearestWallNote<T extends WallLike & { span?: { start: number; end: number } }>(
  p: Point,
  walls: readonly T[],
): { span: { start: number; end: number }; message: string } | null {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      const dist = distPointToWallSegment(p, s);
      if (dist < bestDist) {
        bestDist = dist;
        best = w;
      }
    }
  }
  return best?.span ? { span: best.span, message: `nearest wall "${best.id}" is here` } : null;
}

/**
 * Single-pass host lookup: the nearest wall segment AND whether the point lies
 * on some wall, computed in one scan (distPointToSegment evaluated once per
 * segment). Byte-identical to calling {@link hostSegmentForWalls} and
 * {@link isOnSomeWall} separately — the nearest uses the same first-wins
 * `dist < best` rule; `onWall` is an order-independent OR of the per-wall
 * tolerance test. This halves the per-opening scan cost (the benchmark's
 * dominant stage) without changing output.
 */
export function hostInfoForWalls(
  walls: WallLike[],
  at: Point,
  ref?: string,
): { host: WallSegment | null; onWall: boolean } {
  const candidates = ref ? walls.filter((w) => w.id === ref || w.category === ref) : walls;
  let host: WallSegment | null = null;
  let bestDist = Infinity;
  let onWall = false;
  for (const w of candidates) {
    const tol = w.thickness / 2 + Math.max(w.thickness, 1);
    for (const s of segmentsOfWall(w)) {
      const dist = distPointToWallSegment(at, s);
      if (dist < bestDist) {
        bestDist = dist;
        host = s;
      }
      if (!onWall && dist <= tol) onWall = true;
    }
  }
  return { host, onWall };
}

/** One indexed wall segment, tagged with its host wall's ref fields + tolerance. */
interface SegEntry {
  seg: WallSegment;
  id: string;
  category: string;
  /** On-wall tolerance for this segment's wall (== the brute-force test). */
  tol: number;
  /** Global order index (wall order, then segment order) — for first-wins ties. */
  index: number;
}

/** Tight box of a wall segment — the arc's TRUE extremes (closed-form), not its chord:
 *  a curve indexed by its chord would be missed by a query box over its bulge. */
const segBox = (s: WallSegment): GridBox => {
  const pts = s.arc ? arcExtremes(s.arc) : [s.a, s.b];
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
  return { minX, minY, maxX, maxY };
};

/**
 * Spatial index over wall segments giving a grid-accelerated {@link hostInfoForWalls}.
 *
 * Built once per resolve and reused for every opening, so the per-opening cost is
 * ~O(nearby segments) instead of O(all segments). Results are **identical** to
 * the brute-force scan: a query box of half-size `r` around the point returns all
 * segments within distance `r`, so the search expands `r` until it provably holds
 * both the nearest segment (`r ≥ bestDist`) and every on-wall candidate
 * (`r ≥ maxTol`); the final pass scans the gathered segments in global index
 * order with the same first-wins `dist < best` rule.
 */
export class WallGrid {
  private readonly grid: GridIndex<SegEntry>;
  private readonly maxTol: number;
  private readonly reach: number;
  private readonly empty: boolean;

  constructor(walls: WallLike[]) {
    let count = 0;
    let extent = 0;
    let maxTol = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const segs: SegEntry[] = [];
    let index = 0;
    for (const w of walls) {
      const tol = w.thickness / 2 + Math.max(w.thickness, 1);
      if (tol > maxTol) maxTol = tol;
      for (const seg of segmentsOfWall(w)) {
        const bb = segBox(seg);
        segs.push({ seg, id: w.id, category: w.category, tol, index: index++ });
        extent += bb.maxX - bb.minX + (bb.maxY - bb.minY);
        count++;
        if (bb.minX < minX) minX = bb.minX;
        if (bb.minY < minY) minY = bb.minY;
        if (bb.maxX > maxX) maxX = bb.maxX;
        if (bb.maxY > maxY) maxY = bb.maxY;
      }
    }
    this.empty = count === 0;
    this.maxTol = maxTol;
    // Cell ≈ average segment extent (so each segment spans O(1) cells); clamped.
    const cell = count > 0 ? Math.max(extent / (count * 2), 1) : 1;
    this.grid = new GridIndex<SegEntry>(cell);
    for (const e of segs) this.grid.insert(segBox(e.seg), e);
    // A radius that is guaranteed to cover every segment from any query point is
    // bounded by the diagonal of the bounds plus the spread; computed per query.
    this.reach = this.empty ? 0 : Math.hypot(maxX - minX, maxY - minY) + Math.max(maxX - minX, maxY - minY);
    this._b = this.empty ? null : { minX, minY, maxX, maxY };
  }

  private readonly _b: GridBox | null;

  /** Distance beyond which a box around `at` is guaranteed to contain all segments. */
  private reachFrom(at: Point): number {
    if (!this._b) return 0;
    const dx = Math.max(at.x - this._b.minX, this._b.maxX - at.x, 0);
    const dy = Math.max(at.y - this._b.minY, this._b.maxY - at.y, 0);
    return Math.max(dx, dy) + this.reach;
  }

  /** Identical to {@link hostInfoForWalls}, but grid-accelerated. */
  hostInfo(at: Point, ref?: string): { host: WallSegment | null; onWall: boolean } {
    if (this.empty) return { host: null, onWall: false };
    const reach = this.reachFrom(at);
    const accept = (e: SegEntry): boolean => !ref || e.id === ref || e.category === ref;
    let radius = this.grid.cellSize;
    let entries: SegEntry[] = [];
    for (;;) {
      entries = this.grid.queryBox({
        minX: at.x - radius,
        minY: at.y - radius,
        maxX: at.x + radius,
        maxY: at.y + radius,
      });
      let bestDist = Infinity;
      for (const e of entries) {
        if (!accept(e)) continue;
        const d = distPointToWallSegment(at, e.seg);
        if (d < bestDist) bestDist = d;
      }
      // The box now holds every segment within `radius`. Once `radius` covers both
      // the nearest segment and the on-wall tolerance band, the answer is exact.
      if (radius >= reach || (bestDist <= radius && radius >= this.maxTol)) break;
      radius *= 2;
    }
    // Exact pass in global index order (first-wins ties — matches brute force).
    const filtered = entries.filter(accept).sort((a, b) => a.index - b.index);
    let host: WallSegment | null = null;
    let bestDist = Infinity;
    let onWall = false;
    for (const e of filtered) {
      const d = distPointToWallSegment(at, e.seg);
      if (d < bestDist) {
        bestDist = d;
        host = e.seg;
      }
      if (!onWall && d <= e.tol) onWall = true;
    }
    return { host, onWall };
  }
}

/**
 * Outer-face extent of a building: the union of every wall's **offset rectangle**
 * (so the box lands on the wall faces, half a thickness outside each centerline)
 * and any sized-element rectangles passed in. This is the box a GB/T overall
 * dimension measures and what `describe().bbox_outer` reports — distinct from the
 * centerline extent (`describe().bbox`, the union of raw wall points + room rects).
 *
 * Falls back to the supplied rectangles when there are no walls, and to a
 * degenerate empty box when there is nothing at all (never throws).
 */
export function outerFaceBounds(walls: readonly WallLike[], rects: readonly RectXYWH[] = []): Bounds {
  const b = emptyBounds();
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      for (const c of segmentFaceExtremes(s, s.thickness)) extendBounds(b, c.x, c.y);
    }
  }
  for (const r of rects) {
    extendBounds(b, r.x, r.y);
    extendBounds(b, r.x + r.w, r.y + r.h);
  }
  return b;
}

/**
 * Push `p` along the unit direction `u` onto a wall FACE: `"faces"` lands on the
 * far (outer) face of the nearest wall crossing `p` in that direction, `"clear"`
 * on the near (inner) one. Only segments **perpendicular to `u`** are candidates —
 * at a building corner two walls are equidistant and only the one the measurement
 * runs into can bound it — and the nearest of those must be within the same
 * tolerance band {@link hostInfoForWalls} uses.
 *
 * Closed-form and idempotent: a point already on the outer face projects to
 * itself. Returns `null` when no perpendicular wall is near enough, so the caller
 * can keep the raw point and warn (`W_DIM_NO_WALL`).
 */
export function projectToWallFace(
  walls: readonly WallLike[],
  p: Point,
  u: Vec,
  mode: "faces" | "clear",
): { at: Point; seg: WallSegment } | null {
  const EPS = 1e-9;
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      // A curved edge has no single face coordinate along a measurement axis, so it
      // never bounds a `dim faces|clear`; the caller warns (`W_DIM_NO_WALL`) instead of
      // projecting onto a chord that is not where the wall is.
      if (s.arc) continue;
      const d = sub(s.b, s.a);
      if (Math.abs(d.x) < EPS && Math.abs(d.y) < EPS) continue; // degenerate
      const dir = unit(d);
      if (Math.abs(dir.x * u.x + dir.y * u.y) > 1e-6) continue; // not perpendicular to u
      const dist = distPointToSegment(p, s.a, s.b);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
  }
  if (!best) return null;
  if (bestDist > best.thickness / 2 + Math.max(best.thickness, 1)) return null;
  // Signed distance from p to the segment's line, measured along u.
  const along = (best.a.x - p.x) * u.x + (best.a.y - p.y) * u.y;
  const half = best.thickness / 2;
  return { at: add(p, mul(u, mode === "faces" ? along + half : along - half)), seg: best };
}

/** Whether a point lies within tolerance of some wall (filtered by ref if given). */
export function isOnSomeWall(walls: WallLike[], at: Point, ref?: string): boolean {
  const candidates = ref ? walls.filter((w) => w.id === ref || w.category === ref) : walls;
  for (const w of candidates) {
    const tol = w.thickness / 2 + Math.max(w.thickness, 1);
    for (const s of segmentsOfWall(w)) {
      if (distPointToWallSegment(at, s) <= tol) return true;
    }
  }
  return false;
}
