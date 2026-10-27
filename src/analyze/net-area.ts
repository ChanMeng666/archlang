/**
 * **Net internal area** — the part of a room's floor that no wall stands on
 * (`describe().rooms[].net_area_m2`; the rule and why: `docs/adr/0027-net-internal-area.md`).
 *
 * A room is drawn on wall CENTRELINES, so its own area (`area_m2`, {@link
 * import("../analyze.js").roomAreaMm2}) runs to the middle of every wall round it. The net
 * area is that same shape LESS every part of it a wall's solid covers:
 *
 *     net = area(room) − area(room ∩ ⋃ wall bands)
 *
 * A wall's band is the solid the drawing draws for it before any opening is cut: its two
 * faces at ± half its thickness, square caps at a free end, mitred (or, past the stroke's
 * mitre limit, bevelled) joints, and true concentric arcs on a curved run —
 * `wallBand()` in `src/geometry/band.ts`, the one band builder the wall joinery uses. A wall
 * on the room's edge therefore takes half of itself out of the room (the inset), a wall
 * that runs through or curves into the room takes all of what stands on the floor, and a
 * wall that stands clear takes nothing. Doors and windows do not cut the band: the
 * threshold inside a wall's thickness is not floor.
 *
 * ## How the area is computed — exactly, or not at all
 *
 * By Green's theorem on the boundary of `room ∩ ⋃ bands`. Every edge of the room and of
 * every band near it (straight lines and true arcs) is split at every crossing with every
 * other, closed form (`src/geometry/intersect.ts`). A piece lies on the boundary of the
 * covered region exactly when one side of it is in the room and in a band and the other is
 * not; each such piece contributes `½∮(x dy − y dx)` in closed form (a line by its
 * endpoints, an arc by its endpoints, centre and sweep). A piece shared by two edges (a
 * band face on the room's edge, two bands face to face) is counted once. No tessellation,
 * no sampling and no bounding box enters the figure.
 *
 * The answer is OMITTED (`undefined`) rather than approximated when it cannot be trusted
 * or cannot be afforded: when the room's box meets more than {@link MAX_NET_CURVES} band and
 * room edges (the split is quadratic in them), when the walk over the split's pieces would
 * cost more than {@link MAX_NET_PROBE_WORK} (a count charged before it runs: a ring of
 * hundreds of vertices crossed by hundreds of walls), or when the boundary integral comes
 * out outside `[−ε, area + ε]` or not finite — a sign that a configuration defeated the
 * split. A caller then omits the field and every total that would include it.
 *
 * Pure, synchronous, deterministic. Arc pieces read their angles through `Math.atan2`
 * and `Math.cos`/`Math.sin`, which are not exactly rounded across engines, so a room
 * crossed by a curved band may differ in the last ulps between platforms (far below the
 * 0.01 m² the figure is printed to).
 */

import type { Point } from "../ast.js";
import type { Arc } from "../geometry/arc.js";
import { type BandWall, type EdgeLoop, PointInterner, loopBBox, loopsContain, wallBand } from "../geometry/band.js";
import type { GridBox } from "../geometry/grid-index.js";
import { circleCircle, lineCircleParams, lineLineParams, meetLines } from "../geometry/intersect.js";
import { polygonArea, polygonInsideTest } from "../geometry/polygon.js";

/**
 * The most room-and-band edges one room's measurement may read. Past it the pair loop
 * (every edge against every edge) is not run and the room's net area is omitted; no
 * shipped plan comes within a tenth of it.
 */
export const MAX_NET_CURVES = 2000;

/** One wall's band, with its box, ready to be measured against many rooms. */
export interface NetAreaBand {
  loops: EdgeLoop[];
  box: GridBox;
}

/** The room facts the net area reads: the same shape fields `roomAreaMm2` reads. */
export interface NetAreaRoom {
  at: Point;
  size: { w: number; h: number };
  poly?: readonly Point[];
  circle?: { c: Point; r: number };
}

/** The bands of every wall of a storey, built once and shared by every room measured. */
export function netAreaBands(walls: readonly BandWall[]): NetAreaBand[] {
  const intern = new PointInterner();
  const out: NetAreaBand[] = [];
  for (const w of walls) {
    const loops = wallBand(w, intern);
    if (loops.length === 0) continue;
    const boxes = loops.map(loopBBox);
    out.push({
      loops,
      box: {
        minX: Math.min(...boxes.map((b) => b.minX)),
        minY: Math.min(...boxes.map((b) => b.minY)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
        maxY: Math.max(...boxes.map((b) => b.maxY)),
      },
    });
  }
  return out;
}

/**
 * What measuring every room's net area costs, as a COUNT and without building a band: for
 * each room, its edges times the wall segments whose box (grown by half the wall's thickness,
 * and by the radius for an arc) meets the room's box. `compile()` charges it to the drawing
 * budget before a `schedule rooms` table is measured (`src/draw-budget.ts`); the pair loop
 * per room is in addition held under {@link MAX_NET_CURVES}.
 */
export function netAreaWorkUnits(
  rooms: readonly NetAreaRoom[],
  walls: readonly {
    thickness: number;
    points: readonly Point[];
    arcs?: ReadonlyArray<Arc | undefined>;
    closed: boolean;
  }[],
): number {
  const segBoxes: GridBox[] = [];
  for (const w of walls) {
    const h = w.thickness / 2;
    const n = w.points.length;
    const segs = w.closed && n > 2 ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = w.points[k]!;
      const b = w.points[(k + 1) % n]!;
      const arc = w.arcs?.[k];
      const g = arc ? arc.r + h : h;
      const c = arc ? arc.center : null;
      segBoxes.push(
        c
          ? { minX: c.x - g, minY: c.y - g, maxX: c.x + g, maxY: c.y + g }
          : {
              minX: Math.min(a.x, b.x) - g,
              minY: Math.min(a.y, b.y) - g,
              maxX: Math.max(a.x, b.x) + g,
              maxY: Math.max(a.y, b.y) + g,
            },
      );
    }
  }
  let units = 0;
  for (const r of rooms) {
    const box: GridBox = r.circle
      ? {
          minX: r.circle.c.x - r.circle.r,
          minY: r.circle.c.y - r.circle.r,
          maxX: r.circle.c.x + r.circle.r,
          maxY: r.circle.c.y + r.circle.r,
        }
      : r.poly
        ? lineBox(
            { x: Math.min(...r.poly.map((p) => p.x)), y: Math.min(...r.poly.map((p) => p.y)) },
            { x: Math.max(...r.poly.map((p) => p.x)), y: Math.max(...r.poly.map((p) => p.y)) },
          )
        : { minX: r.at.x, minY: r.at.y, maxX: r.at.x + r.size.w, maxY: r.at.y + r.size.h };
    const edges = r.circle ? 1 : r.poly ? r.poly.length : 4;
    let near = 0;
    for (const b of segBoxes) if (boxesMeet(b, box, 0)) near++;
    units += edges * near;
  }
  return units;
}

/** The measurement behind {@link roomNetAreaMm2}, unclamped, for callers that must see it. */
export type NetAreaDetail =
  | { ok: true; gross: number; covered: number; curves: number; work: number }
  | {
      ok: false;
      gross: number;
      reason: "too-many-edges" | "too-much-work" | "inconsistent";
      curves: number;
      /** The probe work charged ({@link netAreaProbeWork}); absent when refused before it was counted. */
      work?: number;
    };

/**
 * The room's net internal area in mm² (see the module header), or `undefined` when it is
 * omitted. Never more than the room's own area and never negative when present.
 */
export function roomNetAreaMm2(r: NetAreaRoom, bands: readonly NetAreaBand[]): number | undefined {
  const d = netAreaDetail(r, bands);
  if (!d.ok) return undefined;
  // `covered` is checked to lie in [−ε, gross + ε] (see `netAreaDetail`); the clamp only
  // removes that ε of float noise so `net <= area` holds to the last bit.
  return Math.min(d.gross, Math.max(0, d.gross - d.covered));
}

/* ---------------------------------------------------------------------------
 * Curves: a straight edge or a true arc, each walked from parameter 0 to 1
 * ------------------------------------------------------------------------- */

export type Curve = { t: "line"; a: Point; b: Point; box: GridBox } | { t: "arc"; arc: Arc; box: GridBox };

const TAU = Math.PI * 2;

/** Where along the arc `p` sits, `0` at `a`, `1` at `b`, wrapped into `[0, 2π)/|sweep|`. */
function arcT(arc: Arc, p: Point): number {
  const th = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
  let off = (arc.sweep >= 0 ? th - arc.start : arc.start - th) % TAU;
  if (off < 0) off += TAU;
  return off / Math.abs(arc.sweep);
}

function curvePoint(c: Curve, t: number): Point {
  if (c.t === "line") {
    if (t === 0) return c.a;
    if (t === 1) return c.b;
    return { x: c.a.x + (c.b.x - c.a.x) * t, y: c.a.y + (c.b.y - c.a.y) * t };
  }
  const arc = c.arc;
  if (t === 0) return arc.a;
  if (t === 1) return arc.b;
  const th = arc.start + arc.sweep * t;
  return { x: arc.center.x + arc.r * Math.cos(th), y: arc.center.y + arc.r * Math.sin(th) };
}

/** Unit direction of travel at parameter `t`. */
function curveTangent(c: Curve, t: number): Point {
  if (c.t === "line") {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const l = Math.hypot(dx, dy);
    return { x: dx / l, y: dy / l };
  }
  const th = c.arc.start + c.arc.sweep * t;
  const s = Math.sign(c.arc.sweep);
  return { x: -Math.sin(th) * s, y: Math.cos(th) * s };
}

/**
 * `½∫(x dy − y dx)` along `c` from `p0` (parameter `t0`) to `p1` (`t1`), about the origin
 * `o`. Closed form: a line by its two ends, an arc by its ends, centre and swept angle. The
 * ends are the crossing POINTS themselves (exact on a rectilinear plan), never re-derived.
 */
function curveIntegral(c: Curve, t0: number, t1: number, p0: Point, p1: Point, o: Point): number {
  if (c.t === "line") return ((p0.x - o.x) * (p1.y - o.y) - (p1.x - o.x) * (p0.y - o.y)) / 2;
  const { center, r, sweep } = c.arc;
  const cx = center.x - o.x;
  const cy = center.y - o.y;
  return (cx * (p1.y - p0.y) - cy * (p1.x - p0.x) + r * r * sweep * (t1 - t0)) / 2;
}

export function lineBox(a: Point, b: Point): GridBox {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

export const boxesMeet = (a: GridBox, b: GridBox, pad: number): boolean =>
  a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minY <= b.maxY + pad && b.minY <= a.maxY + pad;

export function curvesOfLoop(loop: EdgeLoop): Curve[] {
  return loop.map(
    (e): Curve => (e.t === "line" ? { t: "line", a: e.a, b: e.b, box: lineBox(e.a, e.b) } : arcCurve(e.arc)),
  );
}

export function arcCurve(arc: Arc): Curve {
  // The arc's own extremes bound it; its loop's box is a safe superset when it has one.
  const { center, r } = arc;
  return { t: "arc", arc, box: { minX: center.x - r, minY: center.y - r, maxX: center.x + r, maxY: center.y + r } };
}

/* ---------------------------------------------------------------------------
 * Splitting: the parameters at which each curve is crossed by another
 * ------------------------------------------------------------------------- */

/** Positional tolerance for "on the curve" (mm): far below a fmt2 hundredth, far above float noise. */
const ON_MM = 1e-6;
/** Parameter tolerance at a curve's own ends. */
const T_EPS = 1e-12;

/** A crossing on one curve: its parameter and the point itself. */
export interface Split {
  t: number;
  p: Point;
}

function addT(list: Split[], t: number, p: Point): void {
  if (t > T_EPS && t < 1 - T_EPS) list.push({ t, p });
}

/** The parameter of `p` on curve `c`, or null when `p` is not on it (within {@link ON_MM}). */
function paramOn(c: Curve, p: Point): number | null {
  if (c.t === "line") {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return null;
    const s = ((p.x - c.a.x) * dx + (p.y - c.a.y) * dy) / l2;
    const l = Math.sqrt(l2);
    if (s < -ON_MM / l || s > 1 + ON_MM / l) return null;
    const perpDist = Math.abs((p.x - c.a.x) * dy - (p.y - c.a.y) * dx) / l;
    return perpDist <= ON_MM ? Math.min(1, Math.max(0, s)) : null;
  }
  const arc = c.arc;
  if (Math.abs(Math.hypot(p.x - arc.center.x, p.y - arc.center.y) - arc.r) > ON_MM) return null;
  const t = arcT(arc, p);
  const slack = ON_MM / (arc.r * Math.abs(arc.sweep));
  if (t <= 1 + slack) return Math.min(1, t);
  if (t >= TAU / Math.abs(arc.sweep) - slack) return 0; // just before the start, wrapped
  return null;
}

/** Record every crossing of curves `i` and `j` on both curves' split lists. */
function cross(ci: Curve, cj: Curve, ti: Split[], tj: Split[]): void {
  if (ci.t === "line" && cj.t === "line") {
    const d = { x: ci.b.x - ci.a.x, y: ci.b.y - ci.a.y };
    const e = { x: cj.b.x - cj.a.x, y: cj.b.y - cj.a.y };
    const m = lineLineParams(ci.a, d, cj.a, e);
    if (m) {
      if (m.s >= -T_EPS && m.s <= 1 + T_EPS && m.u >= -T_EPS && m.u <= 1 + T_EPS) {
        // `meetLines` is exact for a vertical × horizontal pair, so a rectilinear plan's
        // crossings are the integers they are and its area sums exactly.
        const p = meetLines(ci.a, d, cj.a, e) ?? curvePoint(ci, m.s);
        addT(ti, m.s, p);
        addT(tj, m.u, p);
      }
      return;
    }
    // Parallel: collinear pieces split each other at their ends.
    overlapEnds(ci, cj, ti, tj);
    return;
  }
  if (ci.t === "arc" && cj.t === "arc") {
    const a = ci.arc;
    const b = cj.arc;
    if (Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) <= ON_MM && Math.abs(a.r - b.r) <= ON_MM) {
      overlapEnds(ci, cj, ti, tj);
      return;
    }
    for (const p of circleCircle(a.center, a.r, b.center, b.r)) {
      const s = paramOn(ci, p);
      const u = paramOn(cj, p);
      if (s !== null && u !== null) {
        addT(ti, s, p);
        addT(tj, u, p);
      }
    }
    return;
  }
  const [ln, ar, tl, ta] = ci.t === "line" ? [ci, cj, ti, tj] : [cj, ci, tj, ti];
  if (ln.t !== "line" || ar.t !== "arc") return;
  const d = { x: ln.b.x - ln.a.x, y: ln.b.y - ln.a.y };
  for (const s of lineCircleParams(ln.a, d, ar.arc.center, ar.arc.r)) {
    if (s < -T_EPS || s > 1 + T_EPS) continue;
    const p = { x: ln.a.x + d.x * s, y: ln.a.y + d.y * s };
    const u = paramOn(ar, p);
    if (u === null) continue;
    addT(tl, s, p);
    addT(ta, u, p);
  }
}

/** Two curves on one line or one circle: each is split where the other ends. */
function overlapEnds(ci: Curve, cj: Curve, ti: Split[], tj: Split[]): void {
  for (const p of ends(cj)) {
    const s = paramOn(ci, p);
    if (s !== null) addT(ti, s, p);
  }
  for (const p of ends(ci)) {
    const s = paramOn(cj, p);
    if (s !== null) addT(tj, s, p);
  }
}

const ends = (c: Curve): Point[] => (c.t === "line" ? [c.a, c.b] : [c.arc.a, c.arc.b]);

/* ---------------------------------------------------------------------------
 * The measurement
 * ------------------------------------------------------------------------- */

/** How far off a piece's midpoint each side is probed (mm). */
const PROBE_MM = 1e-4;

/**
 * A room as a region the boundary integral can read: its own boundary curves (a true arc
 * for a circle, never its tessellation), its own inside test (open bounds), its box and its
 * gross area — the same reading {@link netAreaDetail} measures a room by. Shared with the
 * walled-face rules (`src/analyze/wall-faces.ts`), so a room's floor is one region there and
 * here.
 */
export interface RoomRegion {
  curves: Curve[];
  inside: (p: Point) => boolean;
  /** The most ring edges one {@link RoomRegion.inside} call reads (1 for a circle). */
  insideCost: number;
  box: GridBox;
  gross: number;
}

/** The {@link RoomRegion} of a room. */
export function roomRegion(r: NetAreaRoom): RoomRegion {
  if (r.circle) {
    const { c, r: rad } = r.circle;
    const east = { x: c.x + rad, y: c.y };
    return {
      curves: [arcCurve({ center: c, r: rad, a: east, b: east, sweep: TAU, start: 0 })],
      inside: (p) => Math.hypot(p.x - c.x, p.y - c.y) < rad,
      insideCost: 1,
      box: { minX: c.x - rad, minY: c.y - rad, maxX: c.x + rad, maxY: c.y + rad },
      gross: Math.PI * rad * rad,
    };
  }
  const ring: Point[] = r.poly
    ? [...r.poly]
    : [
        { x: r.at.x, y: r.at.y },
        { x: r.at.x + r.size.w, y: r.at.y },
        { x: r.at.x + r.size.w, y: r.at.y + r.size.h },
        { x: r.at.x, y: r.at.y + r.size.h },
      ];
  // The ring binned by y-band once, so each of the many probes reads only its band's edges;
  // exactly `pointInPolygon(p.x, p.y, ring, 0)` on every point (`polygonInsideTest`).
  const test = polygonInsideTest(ring, 0);
  return {
    curves: ring
      .map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }))
      .filter(({ a, b }) => a.x !== b.x || a.y !== b.y)
      .map(({ a, b }): Curve => ({ t: "line", a, b, box: lineBox(a, b) })),
    inside: (p) => test.inside(p.x, p.y),
    insideCost: test.maxEdgesPerQuery,
    box: lineBox(
      { x: Math.min(...ring.map((p) => p.x)), y: Math.min(...ring.map((p) => p.y)) },
      { x: Math.max(...ring.map((p) => p.x)), y: Math.max(...ring.map((p) => p.y)) },
    ),
    gross: r.poly ? polygonArea(r.poly) : r.size.w * r.size.h,
  };
}

/** What {@link regionBoundary} reads off one piece of the boundary of `S`. */
export interface BoundaryPiece {
  /** Index into the `curves` the measurement was given. */
  curve: number;
  /** The piece's midpoint. */
  mid: Point;
  /** `+1` when `S` lies on the piece's left (the `+n` side), `-1` on its right. */
  side: 1 | -1;
  /** The piece's length (mm), closed form: a line by its two ends, an arc by `r · |sweep| · Δt`. */
  length: number;
}

/**
 * Split every curve at every crossing with every other (the first half of
 * {@link regionBoundary}), so a caller can count the pieces ({@link pieceCount}) and charge the
 * walk over them before it runs. Quadratic in `curves.length`; the caller caps that.
 */
export function splitCurves(curves: readonly Curve[]): Split[][] {
  const splits: Split[][] = curves.map(() => []);
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      if (!boxesMeet(curves[i]!.box, curves[j]!.box, ON_MM)) continue;
      cross(curves[i]!, curves[j]!, splits[i]!, splits[j]!);
    }
  }
  return splits;
}

/** The pieces {@link regionBoundary} walks over `splits`, at most: each curve's crossings + 1. */
export function pieceCount(splits: readonly (readonly Split[])[]): number {
  let n = 0;
  for (const s of splits) n += s.length + 1;
  return n;
}

/**
 * The area (mm², signed as measured, unclamped) of a region `S` whose boundary lies on
 * `curves`, by Green's theorem (see the module header): every curve is split at every
 * crossing with every other, closed form; a piece bounds `S` exactly when `inS` differs on
 * its two sides, and contributes `½∮(x dy − y dx)` about `origin`, once even when two curves
 * share it. Curves that do not bound `S` may be included; their pieces have `S` on both sides
 * or neither and contribute nothing. `onPiece`, when given, sees every counted piece.
 *
 * The caller bounds the work: it is quadratic in `curves.length` (`MAX_NET_CURVES`).
 */
export function regionBoundary(
  curves: readonly Curve[],
  inS: (p: Point) => boolean,
  origin: Point,
  onPiece?: (piece: BoundaryPiece) => void,
  splits: readonly (readonly Split[])[] = splitCurves(curves),
): number {
  // Walk each piece; keep it once if it bounds the region, signed by its side.
  const seen = new PointInterner();
  const counted = new Set<string>();
  let area = 0;
  curves.forEach((c, i) => {
    const ts: Split[] = [
      { t: 0, p: curvePoint(c, 0) },
      ...[...splits[i]!].sort((p, q) => p.t - q.t),
      { t: 1, p: curvePoint(c, 1) },
    ];
    for (let k = 0; k + 1 < ts.length; k++) {
      const { t: t0, p: p0 } = ts[k]!;
      const { t: t1, p: p1 } = ts[k + 1]!;
      if (!(t1 > t0)) continue;
      const tm = (t0 + t1) / 2;
      const m = curvePoint(c, tm);
      const dir = curveTangent(c, tm);
      const n = { x: -dir.y, y: dir.x };
      const plus = inS({ x: m.x + n.x * PROBE_MM, y: m.y + n.y * PROBE_MM });
      const minus = inS({ x: m.x - n.x * PROBE_MM, y: m.y - n.y * PROBE_MM });
      if (plus === minus) continue;
      // One copy of a piece two curves share: keyed by its interned ends and middle.
      const ids = [seen.get(p0), seen.get(p1)].map(keyOf).sort();
      const key = `${c.t}|${ids[0]}|${ids[1]}|${keyOf(seen.get(m))}`;
      if (counted.has(key)) continue;
      counted.add(key);
      const v = curveIntegral(c, t0, t1, p0, p1, origin);
      area += plus ? v : -v;
      if (onPiece) {
        const length =
          c.t === "line" ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : Math.abs(c.arc.r * c.arc.sweep * (t1 - t0));
        onPiece({ curve: i, mid: m, side: plus ? 1 : -1, length });
      }
    }
  });
  return area;
}

/**
 * Measure `room ∩ ⋃ bands` for one room. `covered` is the boundary integral, unclamped;
 * `ok: false` names why the figure is omitted.
 */
export function netAreaDetail(r: NetAreaRoom, bands: readonly NetAreaBand[]): NetAreaDetail {
  // The room as a region: its own boundary curves and its own inside test.
  const { curves: roomCurves, inside: inRoom, insideCost, box: roomBox, gross } = roomRegion(r);
  if (!(gross > 0)) return { ok: true, gross: Math.max(0, gross), covered: 0, curves: 0, work: 0 };

  const near = bands.filter((b) => boxesMeet(b.box, roomBox, 0));
  if (near.length === 0) return { ok: true, gross, covered: 0, curves: 0, work: 0 };
  const inBands = (p: Point): boolean =>
    near.some(
      (b) =>
        p.x >= b.box.minX && p.x <= b.box.maxX && p.y >= b.box.minY && p.y <= b.box.maxY && loopsContain(b.loops, p),
    );
  // The cheap band test first: most probes off a room edge are on no band, and the room's own
  // test (a walk over its ring) is then never asked. Both are pure, so the order is invisible.
  const inS = (p: Point): boolean => inBands(p) && inRoom(p);

  const curves: Curve[] = [...roomCurves, ...near.flatMap((b) => b.loops.flatMap(curvesOfLoop))];
  if (curves.length > MAX_NET_CURVES) return { ok: false, gross, reason: "too-many-edges", curves: curves.length };

  // The split is held under MAX_NET_CURVES² pair tests; the walk over its pieces is charged
  // here, as a count, before it runs.
  const splits = splitCurves(curves);
  const bandEdges = near.reduce((n, b) => n + b.loops.reduce((m, l) => m + l.length, 0), 0);
  const work = netAreaProbeWork(pieceCount(splits), near.length + bandEdges, insideCost);
  if (work > MAX_NET_PROBE_WORK) return { ok: false, gross, reason: "too-much-work", curves: curves.length, work };

  const covered = regionBoundary(curves, inS, { x: roomBox.minX, y: roomBox.minY }, undefined, splits);

  const eps = 1e-9 * gross + 1e-3;
  if (!Number.isFinite(covered) || covered < -eps || covered > gross + eps) {
    return { ok: false, gross, reason: "inconsistent", curves: curves.length, work };
  }
  return { ok: true, gross, covered, curves: curves.length, work };
}

/**
 * The most probe work one room's net area may cost ({@link netAreaProbeWork}). Past it the
 * walk is not run and the figure is omitted (`too-much-work`), like a room past
 * {@link MAX_NET_CURVES}. The corpus maximum is pinned beside it in `test/net-area.test.ts`
 * and stays far inside it.
 */
export const MAX_NET_PROBE_WORK = 20_000_000;

/**
 * An upper bound on the work of the boundary walk, as a count: every piece is probed on both
 * sides, and each probe may ask every nearby band (its box, then each of its edges) and then
 * the room's own inside test (the fullest y-band of its ring).
 */
export function netAreaProbeWork(pieces: number, bandCost: number, insideCost: number): number {
  return 2 * pieces * (bandCost + insideCost);
}

/** A stable key for an interned point (the interner returns one object per position). */
function keyOf(p: Point): string {
  return `${p.x},${p.y}`;
}
