/**
 * The door-swing collision predicate as it stood BEFORE backlog 6.12, frozen verbatim (the
 * bodies of `pointInWedge`, `vecInCone`, `swingsCollide`, `isDoubleDoorPair`, `inflateSwing`,
 * `sectorSupport`, `sectorsObstruct` and `contactLength` from `src/geometry.ts`, renamed only
 * where they are exported). It is the reference side of `test/swing-exact.test.ts`'s
 * superset law — every collision the nine-point sampler found is still a collision — and
 * must never be edited to match the live code: its whole value is that it is the old answer.
 */

import type { Point } from "../src/ast.js";
import { add, length, mul, normal, sub, unit, type DoorSwing, type Vec } from "../src/geometry.js";
import { VERTEX_EPS } from "../src/geometry/polygon.js";

/** Is point `p` within the 90° wedge of swing `s` (between the two bounding radii)? */
function pointInWedge(p: Point, s: DoorSwing): boolean {
  return vecInCone(sub(p, s.hinge), sub(s.farJamb, s.hinge), sub(s.leafEnd, s.hinge));
}

/**
 * Is the vector `pv` inside the closed cone spanned by `closed` and `open` (a door's
 * closed- and open-leaf radii, taken from the hinge)? Boundary included.
 */
function vecInCone(pv: Vec, closed: Vec, open: Vec): boolean {
  const cr = (ux: number, uy: number, vx: number, vy: number): number => ux * vy - uy * vx;
  // pv is in the wedge iff it is on the same rotational side of both bounding radii
  // as the wedge interior (the other bounding radius).
  const sideClosed = Math.sign(cr(closed.x, closed.y, open.x, open.y));
  const sideOpen = Math.sign(cr(open.x, open.y, closed.x, closed.y));
  const pc = Math.sign(cr(closed.x, closed.y, pv.x, pv.y));
  const po = Math.sign(cr(open.x, open.y, pv.x, pv.y));
  return (pc === sideClosed || pc === 0) && (po === sideOpen || po === 0);
}

export function swingsCollideV1(a: DoorSwing, b: DoorSwing, clearance: number): boolean {
  // Quick reject: if the hinges are farther apart than the sum of radii + clearance
  // the discs cannot meet.
  const hingeGap = Math.hypot(a.hinge.x - b.hinge.x, a.hinge.y - b.hinge.y);
  if (hingeGap > a.radius + b.radius + clearance) return false;
  // Two leaves of one double door: a clearance between them would be a clearance between a
  // door and itself. (At clearance 0 the pair is clear on its own, by single-point contact.)
  if (clearance !== 0 && isDoubleDoorPairV1(a, b)) return false;
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
  if (!(sampleInOther(a, b) || sampleInOther(b, a))) return false;
  // A shared point was found. It is an obstruction unless BOTH pairings the sampler tests
  // (each leaf against the other's clearance-grown disc) meet in at most one point — both
  // are asked, since the sampler may have found its point on the pairing that only touches
  // while missing the one that overlaps.
  return sectorsObstruct(a, inflateSwing(b, clearance)) || sectorsObstruct(b, inflateSwing(a, clearance));
}

/**
 * Are `a` and `b` the two leaves of ONE double door? True when their far (latch) jambs are the
 * same point, their closed leaves run away from it in opposite directions along one line (the
 * wall they close), and at clearance 0 their quarter-discs meet in that one point only. Read
 * within {@link VERTEX_EPS}, the vertex-coincidence tolerance. A pair with any gap at the
 * jamb, however small, is two independent doors.
 *
 * Accepted shapes, each deliberately: EQUAL leaves (the textbook pair); UNEQUAL leaves (a
 * leaf-and-a-half door, e.g. 1000 + 500), since nothing about sharing a latch depends on the
 * widths; and leaves that open to OPPOSITE faces of the wall from the shared latch (one in,
 * one out), whose discs lie on either side of the wall line and still meet only at the latch.
 * What makes all three one assembly is the shared latch jamb itself: the two leaves close
 * onto each other, so no clearance can separate them without separating the door from
 * itself. The clearance exists to keep INDEPENDENT doors' swings apart, and it still applies
 * the moment the jambs part.
 */
function isDoubleDoorPairV1(a: DoorSwing, b: DoorSwing): boolean {
  if (Math.hypot(a.farJamb.x - b.farJamb.x, a.farJamb.y - b.farJamb.y) > VERTEX_EPS) return false;
  const ua = sub(a.hinge, a.farJamb);
  const ub = sub(b.hinge, b.farJamb);
  if (ua.x * ub.x + ua.y * ub.y >= 0) return false; // hinges on opposite sides of the jamb
  // b's hinge off the line of a's closed leaf, in mm.
  if (Math.abs(ua.x * ub.y - ua.y * ub.x) / length(ua) > VERTEX_EPS) return false;
  return !swingsCollideV1(a, b, 0);
}

/** `s` with its radius grown by `by` about the hinge (`s` itself when `by` is 0, exactly). */
function inflateSwing(s: DoorSwing, by: number): DoorSwing {
  if (by === 0) return s;
  const k = (s.radius + by) / s.radius;
  return {
    ...s,
    farJamb: add(s.hinge, mul(sub(s.farJamb, s.hinge), k)),
    leafEnd: add(s.hinge, mul(sub(s.leafEnd, s.hinge), k)),
    radius: s.radius + by,
  };
}

/** Support function of a swing's closed quarter-disc: max of `p · d` over the sector. */
function sectorSupport(s: DoorSwing, d: Vec): number {
  const dot = (p: Point): number => p.x * d.x + p.y * d.y;
  const h = dot(s.hinge);
  // The polygon hull (hinge, both jambs), plus the arc's farthest point when `d` points
  // into the wedge; outside it the arc's maximum is one of its endpoints, already counted.
  const hull = Math.max(h, dot(s.farJamb), dot(s.leafEnd));
  return vecInCone(d, sub(s.farJamb, s.hinge), sub(s.leafEnd, s.hinge)) ? Math.max(hull, h + s.radius) : hull;
}

/**
 * Do two swings' closed quarter-discs meet in MORE than one point — an overlap of positive
 * area, or a contact along a segment of positive length?
 *
 * Two convex sets have disjoint interiors iff a line weakly separates them: some unit
 * direction `d` with `support(a, d) + support(b, −d) <= 0`. That sum is the support
 * function of the Minkowski difference `a ⊕ −b`, and its minimum over `d` is attained at
 * the normal of the difference's boundary point nearest the origin. The boundary is built
 * from edges and arcs of the two sectors, so that normal is one of a finite set: an
 * edge normal or an arc-end radial of either sector, or the axis from one arc's centre
 * (a hinge) to a vertex of the other (arc + vertex, arc + arc). Checking all of them, in
 * both signs, decides the question without sampling. No separating line: the interiors
 * overlap. A separating line: whatever the two share lies on it, inside each sector's FACE
 * there (see {@link contactLength}), and it is an obstruction only if those faces overlap
 * along a segment. A shared segment pins the separating line to itself, so the first line
 * found answers for all of them.
 *
 * On an axis-aligned wall with whole-millimetre positions every candidate is exact in
 * floating point, so a shared closed jamb evaluates to exactly 0 and a zero-length contact
 * to exactly 0. On an oblique wall the jambs agree only to ~1e-13 mm, so both are read
 * within {@link VERTEX_EPS} — the repository's own rule for when two vertices are the same
 * vertex — rather than as a fresh epsilon.
 */
function sectorsObstruct(a: DoorSwing, b: DoorSwing): boolean {
  const axes: Vec[] = [];
  for (const s of [a, b]) {
    for (const v of [sub(s.farJamb, s.hinge), sub(s.leafEnd, s.hinge)]) axes.push(v, normal(v));
  }
  for (const v of [b.hinge, b.farJamb, b.leafEnd]) axes.push(sub(v, a.hinge));
  for (const v of [a.farJamb, a.leafEnd]) axes.push(sub(b.hinge, v));
  for (const v of axes) {
    const u = unit(v);
    if (u.x === 0 && u.y === 0) continue;
    for (const d of [u, mul(u, -1)]) {
      const nd = mul(d, -1);
      const ha = sectorSupport(a, d);
      const hb = sectorSupport(b, nd);
      if (ha + hb <= VERTEX_EPS) return contactLength(a, d, ha, b, nd, hb) > VERTEX_EPS;
    }
  }
  return true;
}

/**
 * Length of the overlap of `a`'s face in direction `d` (its points at support level `ha`)
 * with `b`'s face in direction `nd = −d`, measured along the separating line. A sector's face
 * is a vertex, the arc's one farthest point, or a straight edge (when `d` is that edge's
 * outward normal), so the overlap is a segment only when two straight edges lie on the line.
 */
function contactLength(a: DoorSwing, d: Vec, ha: number, b: DoorSwing, nd: Vec, hb: number): number {
  const t = normal(d); // along the separating line
  const face = (s: DoorSwing, dir: Vec, level: number): [number, number] => {
    const pts: Point[] = [s.hinge, s.farJamb, s.leafEnd];
    if (vecInCone(dir, sub(s.farJamb, s.hinge), sub(s.leafEnd, s.hinge))) pts.push(add(s.hinge, mul(dir, s.radius)));
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const p of pts) {
      if (p.x * dir.x + p.y * dir.y < level - VERTEX_EPS) continue;
      const q = p.x * t.x + p.y * t.y;
      if (q < lo) lo = q;
      if (q > hi) hi = q;
    }
    return [lo, hi];
  };
  const [alo, ahi] = face(a, d, ha);
  const [blo, bhi] = face(b, nd, hb);
  return Math.min(ahi, bhi) - Math.max(alo, blo);
}
