/**
 * The facade model behind `dims auto`: which wall line each of the four sides reads,
 * the per-axis outline a witness line terminates on, and — the one question both the
 * renderer and `lint()` ask — which openings a side's openings chain dimensions.
 *
 * It lives apart from `scene-build.ts` so that `W_OPENING_NOT_DIMENSIONED` asks the
 * SAME function the chain synthesis asks instead of re-deriving it: a second copy of
 * "which openings are on this facade" would be a second way for the warning and the
 * drawing to disagree. Pure & deterministic — no I/O, no time.
 */

import type { Opening, RDim, ResolvedPlan, RRoom, RWall } from "./ir.js";
import type { Bounds, WallSegment } from "./geometry.js";
import {
  distPointToWallSegment,
  emptyBounds,
  extendBounds,
  normal,
  segmentDirAt,
  segmentFaceExtremes,
  segmentsOfWall,
} from "./geometry.js";
import { pointInRoomBox, roomBox } from "./analyze.js";
import type { Point } from "./ast.js";

/** The four facades a dimension chain can run along. */
export type Side = "bottom" | "left" | "top" | "right";
export const SIDES: readonly Side[] = ["bottom", "left", "top", "right"];

/** Which axis a side measures along: `h` = along x (bottom/top), `v` = along y. */
export const SIDE_AXIS: Record<Side, "h" | "v"> = { bottom: "h", top: "h", left: "v", right: "v" };
/** Outward direction along the side's CROSS axis (+1 = increasing coordinate). */
export const SIDE_OUT: Record<Side, 1 | -1> = { bottom: 1, right: 1, top: -1, left: -1 };

/**
 * Where one facade's chains live: the axis they measure along, the outer-face
 * coordinate they are offset from, the along-axis outer extent (corner to corner),
 * and the endpoint order that makes the dim element's left-normal offset point
 * AWAY from the building.
 */
export interface SideGeom {
  axis: "h" | "v";
  /** Outward direction along the cross axis (`SIDE_OUT[side]`). */
  out: 1 | -1;
  /** This side's axis' facade profile (see {@link facadeAt}). */
  profile: FacadeProfile;
  /** Cross-axis coordinate of this facade's OUTER face (y for h sides, x for v). */
  outer: number;
  /** Centerline coordinate of the hosting exterior wall, or null when there is none. */
  line: number | null;
  /** Half the hosting wall's thickness (0 without one). */
  half: number;
  /** Along-axis outer extent (the two outer corners), always lo < hi. */
  lo: number;
  hi: number;
  /** +1 = emit each span lo→hi; −1 = hi→lo (what puts the offset outside). */
  sign: 1 | -1;
}

/**
 * One straight wall segment reduced to what a facade profile reads on one axis: the
 * centerline as `cross = c0 + m·(along − a0)` over the along-span `[lo,hi]`, plus
 * `faceOff` — how far the OUTER face sits from that centerline **measured on the cross
 * axis**. A line of slope `m` offset perpendicularly by `h` moves by `h·√(1+m²)` on the
 * cross axis, so that factor is exact, not an approximation.
 */
export interface ProfileSeg {
  lo: number;
  hi: number;
  a0: number;
  c0: number;
  faceOff: number;
  m: number;
}

/**
 * One axis' facade profile: the straight segments that can state a cross coordinate,
 * plus the along-spans the plan's CURVED edges occupy.
 */
export interface FacadeProfile {
  segs: ProfileSeg[];
  /** Along-spans (`[lo,hi]`, full wall band incl. the bulge) covered by an `arc` edge. */
  curves: { lo: number; hi: number }[];
}

/**
 * Reduce the plan's wall segments to one axis' facade profile.
 *
 * A straight segment PERPENDICULAR to the axis spans no along range and states no
 * cross coordinate, so it is dropped.
 *
 * An `arc` edge is **not** reduced to a line — a chord would be wrong by the sagitta,
 * and solving the circle for the face coordinate at `v` needs the arc's angular range
 * and its inward sense. Its along-span is recorded in `curves` instead, so
 * {@link facadeAt} can DECLINE there rather than hand back some straight wall further
 * in. Terminating a witness line on a true arc is deferred, in the same spirit as
 * `probeSide` / `facadeOpenings` / `synthWallDims`, which already decline curves
 * rather than approximate them.
 */
export function facadeProfile(walls: readonly RWall[], axis: "h" | "v"): FacadeProfile {
  const alongOf = (p: Point): number => (axis === "h" ? p.x : p.y);
  const crossOf = (p: Point): number => (axis === "h" ? p.y : p.x);
  const profile: FacadeProfile = { segs: [], curves: [] };
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) {
        // Closed-form band extremes (endpoints + any axis extreme inside the sweep),
        // so the bulge is inside the declined span, not just the chord.
        const pts = [s.a, s.b, ...segmentFaceExtremes(s, s.thickness)].map(alongOf);
        profile.curves.push({ lo: Math.min(...pts), hi: Math.max(...pts) });
        continue;
      }
      const a0 = alongOf(s.a);
      const dAl = alongOf(s.b) - a0;
      if (dAl === 0) continue; // perpendicular to this axis: no cross value at a given `along`
      const m = (crossOf(s.b) - crossOf(s.a)) / dAl;
      profile.segs.push({
        lo: Math.min(a0, a0 + dAl),
        hi: Math.max(a0, a0 + dAl),
        a0,
        c0: crossOf(s.a),
        faceOff: (s.thickness / 2) * Math.sqrt(1 + m * m),
        m,
      });
    }
  }
  return profile;
}

/** Distance from `v` to a span; 0 when the span covers it. */
const spanGap = (s: { lo: number; hi: number }, v: number): number => Math.max(0, s.lo - v, v - s.hi);

/**
 * The facade's OUTER-face cross coordinate at along coordinate `v` — the point a
 * witness line for a tick at `v` must terminate on. Null when the profile cannot say
 * (no walls, or a curve is what stands there), which leaves the caller on the flat
 * `SideGeom.outer` fallback.
 *
 * Closed form, one pass, no iteration:
 *
 * - Segments **spanning** `v` describe the facade there; the OUTERMOST of them wins,
 *   which is what makes an L-shaped or angled building read its own silhouette
 *   instead of its bounding box.
 * - When none spans `v` — the overall chain's ticks sit half a wall THROUGH the last
 *   corner, on the outer-face plane — the nearest segments' lines are EXTENDED to `v`,
 *   which lands exactly on the mitred outer corner.
 * - Where two facades meet, their centerlines tie and the drawn outline is the mitre
 *   between their faces. Taking the INNERMOST face of the tied set puts the terminus
 *   inside the poché rather than a hair off the wall — the safe side of the join, and
 *   the one that reproduces an orthogonal plan's existing bytes exactly (both faces
 *   are `half` away when `m = 0`).
 * - A curved edge standing at least as close to `v` as the nearest straight one wins
 *   nothing and blocks everything: returning some partition 20 m inside the building
 *   would be a different wrong answer, not a smaller one.
 */
export function facadeAt(profile: FacadeProfile, out: 1 | -1, v: number): number | null {
  let nearest = Number.POSITIVE_INFINITY;
  for (const s of profile.segs) nearest = Math.min(nearest, spanGap(s, v));
  if (!Number.isFinite(nearest)) return null;
  for (const c of profile.curves) if (spanGap(c, v) <= nearest + TICK_TOL) return null;
  // Signed so that "outermost" is always "largest", whichever way the side faces.
  let bestCr = Number.NEGATIVE_INFINITY;
  let bestFace = 0;
  for (const s of profile.segs) {
    if (spanGap(s, v) > nearest + TICK_TOL) continue;
    const cr = out * (s.c0 + s.m * (v - s.a0));
    const face = cr + s.faceOff;
    if (cr > bestCr + TICK_TOL) {
      bestCr = cr;
      bestFace = face;
    } else if (cr > bestCr - TICK_TOL) {
      bestCr = Math.max(bestCr, cr);
      bestFace = Math.min(bestFace, face);
    }
  }
  return out * bestFace;
}

/** Ticks closer than this (mm) are the same tick — a corner and an opening edge
 *  landing together must not emit a zero-length span. */
export const TICK_TOL = 0.5;

/** The measurement coordinate space: room rectangles when there are rooms (the
 *  coordinate space room boundaries live in), else the wall centerlines. Null when
 *  there is nothing to measure. */
export function measureExtent(ir: ResolvedPlan): Bounds | null {
  const b = emptyBounds();
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room");
  for (const r of rooms) {
    extendBounds(b, r.at.x, r.at.y);
    extendBounds(b, r.at.x + r.size.w, r.at.y + r.size.h);
  }
  if (rooms.length === 0) {
    for (const w of ir.walls) {
      for (const p of w.points) extendBounds(b, p.x, p.y);
      // A curve's chord endpoints are already in `points`; its BULGE is not, and a
      // dimension chain measured to a chord would be short by the sagitta.
      for (const s of segmentsOfWall(w)) {
        if (s.arc) for (const p of segmentFaceExtremes(s, 0)) extendBounds(b, p.x, p.y);
      }
    }
  }
  return Number.isFinite(b.minX) ? b : null;
}

/**
 * The exterior wall bounding one facade: the nearest wall segment PARALLEL to that
 * facade at the matching edge of the measured extent, found with the same
 * nearest-segment idiom `openingRect` in `scene-build.ts` uses. Returns its centerline coordinate
 * and half thickness, or null when that side has no wall (then the caller falls back
 * to the extent itself — never a crash).
 */
export function probeSide(walls: RWall[], ext: Bounds, side: Side): { line: number; half: number } | null {
  const horiz = SIDE_AXIS[side] === "h";
  const cross = side === "bottom" ? ext.maxY : side === "top" ? ext.minY : side === "left" ? ext.minX : ext.maxX;
  const mid = horiz ? (ext.minX + ext.maxX) / 2 : (ext.minY + ext.maxY) / 2;
  const p: Point = horiz ? { x: mid, y: cross } : { x: cross, y: mid };
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      // A curved facade has no single face coordinate to offset a chain from, so it
      // never hosts one (`synthCurveDims` gives it an R call-out instead).
      if (s.arc) continue;
      const isH = s.a.y === s.b.y;
      const isV = s.a.x === s.b.x;
      if (isH && isV) continue; // degenerate
      if (horiz ? !isH : !isV) continue; // not parallel to this facade
      const d = distPointToWallSegment(p, s);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
  }
  if (!best || bestDist > Math.max(best.thickness, 1)) return null;
  return { line: horiz ? best.a.y : best.a.x, half: best.thickness / 2 };
}

/**
 * A side's OUTER face when {@link probeSide} found no wall line: the outermost wall face
 * the facade outline has anywhere across the measured extent, and never inboard of the
 * extent edge `base` itself.
 *
 * This is the stepped facade of issue #109 again. The probe fails there because the
 * legs straddle the bounding-box midpoint. The old fallback was the extent edge, which is
 * the ROOM boundary, a wall thickness or more inside the outermost leg. Every chain on
 * that side was then offset from a line inside the wall, and the innermost chain landed
 * on the outer leg's face. Reading the outline puts the baseline where the building
 * actually ends. Evaluated per segment at its clipped ends: a straight line's cross
 * coordinate is linear along it, so its extremes are at the ends. A curve contributes
 * nothing (its face is not a line); `base` still bounds the answer from inside.
 */
function outlineOuter(profile: FacadeProfile, out: 1 | -1, lo: number, hi: number, base: number): number {
  let best = out * base;
  for (const s of profile.segs) {
    const a = Math.max(s.lo, lo);
    const b = Math.min(s.hi, hi);
    if (!(b > a)) continue;
    for (const v of [a, b]) best = Math.max(best, out * (s.c0 + s.m * (v - s.a0)) + s.faceOff);
  }
  return out * best;
}

/** The four facades' chain geometry, derived once. */
export function sideGeoms(ir: ResolvedPlan, ext: Bounds): Record<Side, SideGeom> {
  const probes = {} as Record<Side, { line: number; half: number } | null>;
  for (const s of SIDES) probes[s] = probeSide(ir.walls, ext, s);
  // One profile per AXIS (not per side) — the two facades facing each other read the
  // same segments from opposite directions.
  const profiles = { h: facadeProfile(ir.walls, "h"), v: facadeProfile(ir.walls, "v") };
  const outerOf = (s: Side): number => {
    const pr = probes[s];
    const base = s === "bottom" ? ext.maxY : s === "top" ? ext.minY : s === "left" ? ext.minX : ext.maxX;
    if (pr) return pr.line + SIDE_OUT[s] * pr.half;
    const [lo, hi] = SIDE_AXIS[s] === "h" ? [ext.minX, ext.maxX] : [ext.minY, ext.maxY];
    return outlineOuter(profiles[SIDE_AXIS[s]], SIDE_OUT[s], lo, hi, base);
  };
  const o = { bottom: outerOf("bottom"), top: outerOf("top"), left: outerOf("left"), right: outerOf("right") };
  const mk = (side: Side, lo: number, hi: number, sign: 1 | -1): SideGeom => ({
    axis: SIDE_AXIS[side],
    out: SIDE_OUT[side],
    profile: profiles[SIDE_AXIS[side]],
    outer: o[side],
    line: probes[side]?.line ?? null,
    half: probes[side]?.half ?? 0,
    lo,
    hi,
    sign,
  });
  return {
    bottom: mk("bottom", o.left, o.right, 1),
    left: mk("left", o.top, o.bottom, 1),
    top: mk("top", o.left, o.right, -1),
    right: mk("right", o.top, o.bottom, -1),
  };
}

/** One opening, reduced to the facade line it sits on and its along-axis centre. */
export interface FacadeOpening {
  axis: "h" | "v";
  /** Centerline coordinate of the hosting segment (y for a horizontal wall). */
  line: number;
  /** Centre of the opening along the wall. */
  along: number;
  width: number;
  /** Id of the door/window/opening this is (every IR {@link Opening} carries it). */
  ownerId?: string;
}

/** The segment of `w` an opening sits on: the nearest one to its centre. */
function hostSegment(w: RWall, op: Opening): WallSegment | null {
  let seg: WallSegment | null = null;
  let best = Infinity;
  for (const s of segmentsOfWall(w)) {
    const d = distPointToWallSegment(op.at, s);
    if (d < best) {
      best = d;
      seg = s;
    }
  }
  return seg;
}

/** Every door/window/cased opening, projected onto its hosting wall's line +
 *  along-axis centre. Angled hosts are skipped (no facade to chain them on). */
export function facadeOpenings(ir: ResolvedPlan): FacadeOpening[] {
  const out: FacadeOpening[] = [];
  for (const w of ir.walls) {
    for (const op of w.openings) {
      const seg = hostSegment(w, op);
      // An opening on a CURVE has no facade line to be chained on — its position along
      // the wall is an angle, not a coordinate — so it contributes no tick. GB/T
      // dimensions a curved wall by radius, which `synthCurveDims` emits.
      if (!seg || seg.arc) continue;
      if (seg.a.y === seg.b.y && seg.a.x !== seg.b.x)
        out.push({ axis: "h", line: seg.a.y, along: op.at.x, width: op.width, ownerId: op.ownerId });
      else if (seg.a.x === seg.b.x && seg.a.y !== seg.b.y)
        out.push({ axis: "v", line: seg.a.x, along: op.at.y, width: op.width, ownerId: op.ownerId });
    }
  }
  return out;
}

/**
 * The OUTERMOST straight wall line standing at along coordinate `v` on one side: the
 * centerline cross coordinate of whichever segment spanning `v` sits furthest out. Null
 * when no straight segment spans `v`, or when a curve does. A curve's face is not a line,
 * and {@link facadeAt} declines there for the same reason.
 */
function outlineLineAt(profile: FacadeProfile, out: 1 | -1, v: number): number | null {
  for (const c of profile.curves) if (spanGap(c, v) === 0) return null;
  let best = Number.NEGATIVE_INFINITY;
  for (const s of profile.segs) {
    if (spanGap(s, v) > 0) continue;
    best = Math.max(best, out * (s.c0 + s.m * (v - s.a0)));
  }
  return Number.isFinite(best) ? out * best : null;
}

/**
 * Which openings each side's openings chain dimensions.
 *
 * An opening belongs to a side when it sits on that side's probed wall line (the
 * historical rule), **or** when its own wall is the outermost wall standing at its
 * position on that side. The second test reads the facade OUTLINE, not one line probed
 * at the middle of the bounding box.
 *
 * The second clause is issue #109. A stepped facade has two parallel legs, and the
 * bounding-box probe can find at most one of them. On a facade whose legs straddle the
 * probe point it finds neither, because the nearest leg is further away than a wall
 * thickness. Until this rule, every opening on that side, on both legs, was dropped with
 * no diagnostic. A chain measures ALONG the side, so openings on two legs chain together
 * exactly as openings on one leg do; the witness lines already reach back to each leg
 * through {@link facadeAt}. Both clauses are needed: the first keeps every plan whose
 * probe succeeds byte-identical, and the second adds only what the probe missed.
 */
export function openingsBySide(
  openings: readonly FacadeOpening[],
  geoms: Record<Side, SideGeom>,
): Record<Side, FacadeOpening[]> {
  const by = {} as Record<Side, FacadeOpening[]>;
  for (const side of SIDES) {
    const g = geoms[side];
    by[side] = openings.filter((op) => {
      if (op.axis !== g.axis) return false;
      if (g.line !== null && Math.abs(op.line - g.line) <= Math.max(g.half, 1)) return true;
      const outline = outlineLineAt(g.profile, g.out, op.along);
      return outline !== null && Math.abs(op.line - outline) <= TICK_TOL;
    });
  }
  return by;
}

/** Sorted ticks with near-duplicates and out-of-range values removed. */
export function cleanTicks(values: readonly number[], lo: number, hi: number): number[] {
  const inRange = values.filter((v) => v >= lo - TICK_TOL && v <= hi + TICK_TOL).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of inRange) {
    const prev = out[out.length - 1];
    if (prev === undefined || v - prev > TICK_TOL) out.push(v);
  }
  return out;
}

/** Why `dims auto all` could not put an exterior opening on a chain. */
export type UnchainedReason = "curve" | "angled" | "inner";

/** An opening on an `exterior` wall that no openings chain dimensions. */
export interface UnchainedOpening {
  ownerId: string;
  wallId: string;
  reason: UnchainedReason;
}

/**
 * The openings on `exterior` walls that `dims auto all` leaves off every chain — the
 * set `W_OPENING_NOT_DIMENSIONED` reports.
 *
 * It asks the functions the chain synthesis asks ({@link sideGeoms},
 * {@link facadeOpenings}, {@link openingsBySide}, {@link cleanTicks}' range), so an
 * opening is reported exactly when the drawing leaves it out. An opening is chained
 * when some side claims it AND both of its edges fall inside that side's corner-to-corner
 * span (a tick outside the span is clipped away, so the opening is not measured).
 *
 * An opening is a candidate only when it is on an `exterior` wall AND opens to the
 * outside: it does not join two different rooms, probed one wall thickness clear of
 * each face.
 * The category alone is not enough. A wing added outboard of a shell leaves doors on
 * that shell which join two rooms (the garage door in `hillside-villa`, the hall doors in
 * `museum-wings`), and a facade chain is not expected to measure those. The side test
 * reads each room's own ring through {@link pointInRoomBox}, never a bounding box. A
 * partition that carries the outer face is still chained when it is on the outline; it
 * just is not reported when it is not.
 */
export function unchainedOpenings(ir: ResolvedPlan): UnchainedOpening[] {
  const ext = measureExtent(ir);
  if (!ext) return [];
  const geoms = sideGeoms(ir, ext);
  const bySide = openingsBySide(facadeOpenings(ir), geoms);
  const chained = new Set<string>();
  for (const side of SIDES) {
    const g = geoms[side];
    for (const op of bySide[side]) {
      const a = op.along - op.width / 2;
      const b = op.along + op.width / 2;
      if (op.ownerId && a >= g.lo - TICK_TOL && b <= g.hi + TICK_TOL) chained.add(op.ownerId);
    }
  }
  // Every `dim` in the IR is hand-written (the auto chains never enter it). One with an
  // endpoint on the opening (a jamb, its centre, anywhere across its void) is the author
  // doing what the warning asks, so the opening is dimensioned.
  const handEnds = ir.elements.filter((el): el is RDim => el.kind === "dim").flatMap((d) => [d.from, d.to]);
  const boxes = ir.elements.filter((el): el is RRoom => el.kind === "room").map(roomBox);
  const roomAt = (p: Point): number => boxes.findIndex((b) => pointInRoomBox(p, b));
  const out: UnchainedOpening[] = [];
  for (const w of ir.walls) {
    if (w.category !== "exterior") continue;
    for (const op of w.openings) {
      if (!op.ownerId || chained.has(op.ownerId)) continue;
      const seg = hostSegment(w, op);
      if (!seg) continue;
      const reach = op.width / 2 + seg.thickness / 2 + TICK_TOL;
      if (handEnds.some((p) => Math.hypot(p.x - op.at.x, p.y - op.at.y) <= reach)) continue;
      const n = normal(segmentDirAt(seg, op.at));
      const clear = seg.thickness;
      const sideA = { x: op.at.x + n.x * clear, y: op.at.y + n.y * clear };
      const sideB = { x: op.at.x - n.x * clear, y: op.at.y - n.y * clear };
      // Joins two DIFFERENT rooms: a connection, not a facade opening. The same room on
      // both sides is a room ring overhanging its own wall, which still leaves this
      // opening on the facade.
      const ra = roomAt(sideA);
      const rb = roomAt(sideB);
      if (ra >= 0 && rb >= 0 && ra !== rb) continue;
      const straight = !seg.arc && (seg.a.x === seg.b.x || seg.a.y === seg.b.y);
      const reason: UnchainedReason = seg.arc ? "curve" : straight ? "inner" : "angled";
      out.push({ ownerId: op.ownerId, wallId: w.id, reason });
    }
  }
  return out;
}
