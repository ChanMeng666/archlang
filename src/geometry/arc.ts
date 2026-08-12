/**
 * Circular-arc math for **curved geometry** (v1.24) — arc wall edges and circular rooms.
 *
 * ONE tessellator, ONE containment rule, ONE tangent rule. Everything a curve needs
 * downstream (hosting an opening, walking a wall by run length, a nav-grid ring, a
 * poché band, a bounding box, a radius call-out) is derived here so no consumer
 * re-derives trig of its own.
 *
 * ## Orientation convention (read this before touching a sign)
 *
 * Coordinates are SCREEN millimetres: +x right, +y **down**. In that space
 * `atan2(y, x)` INCREASES clockwise as drawn, so this module states every rotation as
 * the reader sees it on the sheet:
 *
 * - `sweep > 0` — **clockwise on the drawn plan**.
 * - `sweep < 0` — **counter-clockwise on the drawn plan** (the language default).
 * - `normal(d)` (from `../geometry.js`) is 90° clockwise from `d`, i.e. the **right**
 *   of the direction of travel.
 *
 * Travelling clockwise around a circle keeps the centre on your right, so an
 * `arc` edge's centre sits on `+normal` for `cw` and `−normal` for `ccw`. `major`
 * flips that side: the long way round from `a` to `b` in a given rotational
 * direction is the short way round about the OTHER candidate centre.
 *
 * ## Determinism
 *
 * The centre is closed-form (perpendicular bisector + one `sqrt`) — no trig, no
 * iteration. The tessellation vertex COUNT comes from integer arithmetic on a fixed
 * angular step, and the first/last tessellated vertices are the authored endpoints
 * verbatim (never re-derived through `cos`/`sin`), so a chord's ends are exact. The
 * interior vertices use `Math.cos`/`Math.sin`, which every consumer then routes
 * through `fmt()` — the same trig precedent the door swing, the dimension text angle
 * and the fixture ellipse glyphs have shipped on since v0.7.
 *
 * Nothing here reads a geometry backend, so an arc renders and measures IDENTICALLY
 * with and without the optional `clipper2-wasm` dependency.
 */

import type { ArcDirWord, Point } from "../ast.js";

/** Which way round the plan an arc edge travels, as the reader sees it. The word set
 *  itself is `ARC_DIRS` in `../ast.js` — one source, so the parser, this module and
 *  the generated spec can never disagree about what an `arc` clause accepts. */
export type ArcDir = ArcDirWord;

/**
 * A circular arc edge, fully determined. `a`/`b` are the exact authored endpoints
 * (they lie on the circle up to the centre solve); `sweep` is signed radians —
 * positive clockwise as drawn (see the module header).
 */
export interface Arc {
  center: Point;
  r: number;
  a: Point;
  b: Point;
  /** Signed swept angle in radians: `+` clockwise on the sheet, `−` counter-clockwise. */
  sweep: number;
  /** Angle of `a` about the centre, `atan2(dy, dx)` in screen space. */
  start: number;
}

/** Angular step (degrees) between tessellated vertices — 48 chords to the full circle. */
export const ARC_STEP_DEG = 7.5;
/** Never fewer than this many chords, however short the arc. */
export const ARC_MIN_STEPS = 8;
/** Largest sub-arc (degrees) emitted as one SVG/DXF arc primitive — see {@link arcPieces}. */
const ARC_PIECE_DEG = 120;

const TAU = Math.PI * 2;
const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/**
 * The smallest radius that can span the chord `a`–`b`: half its length. Below it no
 * circle passes through both endpoints, which is what `E_ARC_RADIUS` reports (and
 * what its machine-applicable fix suggests).
 */
export function minArcRadius(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y) / 2;
}

/**
 * Solve the arc through `a`→`b` of radius `r` turning `dir`, taking the long way
 * round when `major`. Closed-form: the centre is on the chord's perpendicular
 * bisector at `sqrt(r² − (c/2)²)` from the midpoint, on the side the rotational
 * direction puts it.
 *
 * Returns `null` when `r` is smaller than half the chord (no such circle) or the
 * chord is degenerate — the caller raises the diagnostic; this never throws.
 */
export function arcFromChord(a: Point, b: Point, r: number, dir: ArcDir, major: boolean): Arc | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (!(chord > 0) || !(r > 0)) return null;
  const half = chord / 2;
  if (r < half) return null;
  // Clockwise keeps the centre on the RIGHT of travel; `major` swaps to the other
  // candidate centre (the long way round one way IS the short way round the other).
  // `(-dy, dx)` is 90° clockwise from the travel direction — the same rotation
  // `normal()` in ../geometry.js applies — and `k` folds the offset distance and the
  // normalisation into ONE scale factor, which keeps the residue on a symmetric chord
  // (where the centre should land on a round number) down at ~1e-13 mm instead of
  // compounding two divisions. Nine orders below `fmt()`'s 0.005 mm, but free.
  const side = (dir === "cw") !== major ? 1 : -1;
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  const k = (side * h) / chord;
  const center = { x: (a.x + b.x) / 2 - dy * k, y: (a.y + b.y) / 2 + dx * k };
  // Magnitude from the chord (exact, no atan2 round-trip): 2·asin(half/r), or its
  // complement for the major arc. Clamped so a chord of exactly 2r yields π.
  const minor = 2 * Math.asin(Math.min(1, half / r));
  const mag = major ? TAU - minor : minor;
  return {
    center,
    r,
    a,
    b,
    sweep: (dir === "cw" ? 1 : -1) * mag,
    start: Math.atan2(a.y - center.y, a.x - center.x),
  };
}

/**
 * The arc of a FULL circle, as one `Arc` running clockwise from its east point.
 * Used by the circular room so a circle and an arc edge tessellate through the same
 * code path (and therefore the same vertex count rule).
 */
export function fullCircleArc(center: Point, r: number): Arc {
  const east = { x: center.x + r, y: center.y };
  return { center, r, a: east, b: east, sweep: TAU, start: 0 };
}

/** Arc length in mm — `r·|θ|`, exact. */
export function arcLength(arc: Arc): number {
  return arc.r * Math.abs(arc.sweep);
}

/** Number of tessellation chords: a fixed angular step, from integer arithmetic. */
export function arcSteps(arc: Arc): number {
  // The `- 1e-9` keeps a sweep that is an exact multiple of the step (a semicircle is
  // 24.000000000000004 steps in binary) off the next integer.
  return Math.max(ARC_MIN_STEPS, Math.ceil(deg(Math.abs(arc.sweep)) / ARC_STEP_DEG - 1e-9));
}

/** The point at parameter `t` ∈ [0,1] along the arc (0 = `a`, 1 = `b`). */
export function arcPointAt(arc: Arc, t: number): Point {
  if (t <= 0) return arc.a;
  if (t >= 1) return arc.b;
  const th = arc.start + arc.sweep * t;
  return { x: arc.center.x + arc.r * Math.cos(th), y: arc.center.y + arc.r * Math.sin(th) };
}

/**
 * The arc as a polyline of `arcSteps(arc) + 1` vertices. The FIRST and LAST are the
 * authored endpoints verbatim, so a tessellated ring closes exactly on the chord ends
 * and adjacent segments never leave a sub-ulp gap.
 */
export function arcTessellate(arc: Arc): Point[] {
  const n = arcSteps(arc);
  const out: Point[] = [arc.a];
  for (let i = 1; i < n; i++) out.push(arcPointAt(arc, i / n));
  out.push(arc.b);
  return out;
}

/** A concentric arc `delta` mm outward (`+` = away from the centre). */
export function arcOffset(arc: Arc, delta: number): Arc {
  const r = arc.r + delta;
  const push = (p: Point): Point => {
    const vx = p.x - arc.center.x;
    const vy = p.y - arc.center.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: arc.center.x + (vx / l) * r, y: arc.center.y + (vy / l) * r };
  };
  return { center: arc.center, r, a: push(arc.a), b: push(arc.b), sweep: arc.sweep, start: arc.start };
}

/**
 * Signed offset from the arc's start angle to the angle of `p`, expressed in the
 * arc's own rotational direction and normalised into `[0, 2π)`. `≤ |sweep|` means the
 * radial through `p` is inside the swept range.
 */
function angleOffset(arc: Arc, p: Point): number {
  const th = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
  const d = (arc.sweep >= 0 ? th - arc.start : arc.start - th) % TAU;
  return d < 0 ? d + TAU : d;
}

/** Is the radial through `p` inside the arc's swept range? (Endpoints count.) */
export function arcContainsRay(arc: Arc, p: Point): boolean {
  return angleOffset(arc, p) <= Math.abs(arc.sweep);
}

/**
 * Distance from `p` to the arc — `| |p−centre| − r |` when the radial through `p`
 * falls inside the sweep, else the nearer endpoint. The exact analogue of
 * {@link import("../geometry.js").distPointToSegment} for a curved edge, so nearest-host
 * attribution treats a curve the same way it treats a straight run. No trig beyond one
 * `atan2` in the containment test; no tessellation.
 */
export function distPointToArc(p: Point, arc: Arc): number {
  if (arcContainsRay(arc, p)) return Math.abs(Math.hypot(p.x - arc.center.x, p.y - arc.center.y) - arc.r);
  return Math.min(Math.hypot(p.x - arc.a.x, p.y - arc.a.y), Math.hypot(p.x - arc.b.x, p.y - arc.b.y));
}

/**
 * Unit tangent at `p`, pointing in the arc's direction of travel (`a` → `b`). The
 * radial direction rotated 90° the way the sweep turns — so a door on a curve reads
 * its host's direction exactly as a door on a straight wall does, and every
 * traversal-relative rule (`hinge left/right`, `side left/right`, the swing normal)
 * keeps its existing meaning.
 */
export function arcTangentAt(arc: Arc, p: Point): Point {
  const vx = p.x - arc.center.x;
  const vy = p.y - arc.center.y;
  const l = Math.hypot(vx, vy) || 1;
  const s = arc.sweep >= 0 ? 1 : -1;
  // `normal(u)` = (−u.y, u.x) is 90° clockwise on screen == the +sweep travel direction.
  return { x: (s * -vy) / l, y: (s * vx) / l };
}

/** Parameter `t` ∈ [0,1] of the point on the arc nearest `p` (clamped to the ends). */
export function arcParamAt(arc: Arc, p: Point): number {
  const mag = Math.abs(arc.sweep);
  if (mag === 0) return 0;
  const off = angleOffset(arc, p);
  if (off <= mag) return off / mag;
  // Outside the sweep: snap to whichever end the radial is nearer, the long way round.
  return TAU - off < off - mag ? 0 : 1;
}

/**
 * The arc's extreme points: its two endpoints plus every axis extreme (centre ± r on
 * each axis) whose radial lies inside the sweep. Closed-form — the bulge of a curve is
 * never approximated by its tessellation when sizing a page or a spatial-index cell.
 */
export function arcExtremes(arc: Arc): Point[] {
  const c = arc.center;
  const out: Point[] = [arc.a, arc.b];
  for (const p of [
    { x: c.x + arc.r, y: c.y },
    { x: c.x, y: c.y + arc.r },
    { x: c.x - arc.r, y: c.y },
    { x: c.x, y: c.y - arc.r },
  ]) {
    if (arcContainsRay(arc, p)) out.push(p);
  }
  return out;
}

/**
 * The arc split into sub-arcs of at most {@link ARC_PIECE_DEG}, each emitted as one
 * `{t:"arc"}` scene primitive.
 *
 * Why split at all: the Scene's `arc` primitive carries no large-arc flag (the SVG and
 * PDF serializers hardcode `0`, and the DXF one calls `minorArcDegrees`), because until
 * now the only arc in the language was a 90° door swing. Rather than widen a primitive
 * every backend already agrees on, a long curve is cut into unambiguously MINOR pieces —
 * which is exact (each piece is a real arc of the same circle, sharing endpoints), keeps
 * all four backends byte-identical on every existing plan, and still emits TRUE arcs, so
 * a curved wall face is never faceted.
 */
export function arcPieces(arc: Arc): Array<{ center: Point; r: number; start: Point; end: Point; sweep: 0 | 1 }> {
  const n = Math.max(1, Math.ceil(deg(Math.abs(arc.sweep)) / ARC_PIECE_DEG - 1e-9));
  const sweepFlag: 0 | 1 = arc.sweep >= 0 ? 1 : 0;
  const out: Array<{ center: Point; r: number; start: Point; end: Point; sweep: 0 | 1 }> = [];
  for (let i = 0; i < n; i++) {
    out.push({
      center: arc.center,
      r: arc.r,
      start: arcPointAt(arc, i / n),
      end: arcPointAt(arc, (i + 1) / n),
      sweep: sweepFlag,
    });
  }
  return out;
}

/**
 * The poché band of a `thickness`-thick wall following this arc, as one closed ring:
 * the outer offset arc out, the inner offset arc back. The ends are extended along the
 * end tangents by half the thickness so the band square-caps into an adjoining
 * straight run exactly the way {@link import("../geometry.js").segmentRectangle} does.
 *
 * Tessellated — a FILL has to be a polygon for every backend (and for the boolean
 * layer), while the visible FACES stay true arcs. That split is deliberate: a 7.5°
 * chord's sagitta is `r(1−cos 3.75°)` ≈ r/1400, well under a hatch tile.
 */
export function arcBandRing(arc: Arc, thickness: number): Point[] {
  const half = thickness / 2;
  const outer = arcTessellate(arcOffset(arc, half));
  const inner = arcTessellate(arcOffset(arc, -half));
  const tA = arcTangentAt(arc, arc.a);
  const tB = arcTangentAt(arc, arc.b);
  const capA = (p: Point): Point => ({ x: p.x - tA.x * half, y: p.y - tA.y * half });
  const capB = (p: Point): Point => ({ x: p.x + tB.x * half, y: p.y + tB.y * half });
  const ring: Point[] = [];
  ring.push(capA(outer[0]!));
  for (let i = 1; i < outer.length - 1; i++) ring.push(outer[i]!);
  ring.push(capB(outer[outer.length - 1]!));
  ring.push(capB(inner[inner.length - 1]!));
  for (let i = inner.length - 2; i > 0; i--) ring.push(inner[i]!);
  ring.push(capA(inner[0]!));
  return ring;
}

/**
 * Rebuild an {@link Arc} from an emitted `{t:"arc"}` scene primitive — the inverse of
 * {@link arcPieces}. Every piece that reaches a backend is a MINOR arc by construction,
 * so the magnitude is `2·asin(chord/2r)` and the SVG sweep flag gives the sign (1 =
 * clockwise as drawn). Used by the ASCII backend, which has to rasterize a curve as a
 * polyline; a backend with native arcs never needs it.
 */
export function arcFromPrimitive(p: { center: Point; r: number; start: Point; end: Point; sweep: 0 | 1 }): Arc {
  const half = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y) / 2;
  const mag = p.r > 0 ? 2 * Math.asin(Math.min(1, half / p.r)) : 0;
  return {
    center: p.center,
    r: p.r,
    a: p.start,
    b: p.end,
    sweep: (p.sweep === 1 ? 1 : -1) * mag,
    start: Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x),
  };
}

/** Radius call-out text in the GB/T form: `R6000`. */
export const radiusText = (r: number, fmt: (n: number) => string): string => `R${fmt(r)}`;
/** Diameter call-out text in the GB/T form: `φ12000`. */
export const diameterText = (r: number, fmt: (n: number) => string): string => `φ${fmt(2 * r)}`;

/** Degrees of an arc's sweep (unsigned) — for diagnostics and tests. */
export const arcSweepDegrees = (arc: Arc): number => Math.abs(deg(arc.sweep));

/** Radians helper re-exported for the circle-room tessellation step count. */
export const degToRad = rad;
