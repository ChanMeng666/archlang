/**
 * `src/geometry/intersect.ts` — the closed-form meeting and ray-crossing primitives the
 * wall-joinery layer is built on.
 *
 * The assertions here are deliberately EXACT wherever the arithmetic can be: a
 * rectilinear corner must come out at `4100`, not `4099.999999999999`, because the
 * joinery interner fuses vertices by a quantised key and a corner that misses its own
 * integer arrives as a second vertex. `toBe` (Object.is) is therefore used on the
 * axis-aligned cases on purpose — `toBeCloseTo` there would pass through exactly the
 * defect this module exists to prevent.
 */

import { describe, expect, it } from "vitest";
import { arcFromChord, arcPointAt, fullCircleArc } from "../src/geometry/arc.js";
import {
  arcParamSigned,
  circleCircle,
  cross2,
  lineCircleParams,
  lineLineParams,
  meetLines,
  parallel,
  perp,
  rayCrossingArc,
  rayCrossingLine,
  reverseArc,
  splitArcYMonotone,
  subArc,
} from "../src/geometry/intersect.js";

const P = (x: number, y: number) => ({ x, y });

describe("lineLineParams", () => {
  it("solves a crossing pair and reports both parameters", () => {
    // (0,0)+s(10,0) meets (4,-3)+u(0,6) at s = 0.4, u = 0.5.
    const r = lineLineParams(P(0, 0), P(10, 0), P(4, -3), P(0, 6))!;
    expect(r.s).toBe(0.4);
    expect(r.u).toBe(0.5);
  });

  it("is null for a parallel pair and for a collinear pair", () => {
    expect(lineLineParams(P(0, 0), P(10, 0), P(0, 5), P(4, 0))).toBeNull();
    expect(lineLineParams(P(0, 0), P(10, 0), P(30, 0), P(4, 0))).toBeNull();
  });

  it("is null for a zero-length direction", () => {
    expect(lineLineParams(P(0, 0), P(0, 0), P(1, 1), P(1, 0))).toBeNull();
  });

  it("`parallel` is scale-free — a 60 mm jog and a 60 m facade are judged by angle", () => {
    const tiny = P(60, 60 * 1e-6);
    const huge = P(60000, 60000 * 1e-6);
    // Same angle off horizontal (1e-6 rad); neither counts as parallel to the axis.
    expect(parallel(P(1, 0), tiny)).toBe(false);
    expect(parallel(P(1, 0), huge)).toBe(false);
    expect(parallel(P(1, 0), P(1e6, 1e-9))).toBe(true);
  });
});

describe("meetLines", () => {
  it("an axis-aligned vertical x horizontal pair is EXACT, both orderings", () => {
    const v = { p: P(4100, -900), d: P(0, 7) };
    const h = { p: P(-31, 2300), d: P(13, 0) };
    const m1 = meetLines(v.p, v.d, h.p, h.d)!;
    expect(m1.x).toBe(4100);
    expect(m1.y).toBe(2300);
    const m2 = meetLines(h.p, h.d, v.p, v.d)!;
    expect(m2.x).toBe(4100);
    expect(m2.y).toBe(2300);
  });

  it("the exactness is not luck — a real offset-face corner lands on its integer", () => {
    // Two 200 mm wall faces at a 90° corner, offset by half the thickness: the corner
    // must be (4100, 2300) and not an ulp off it. The parametric solve is what used to
    // return -5700.000000000001 in `elements/roof.ts`.
    const m = meetLines(P(0, 2300), P(1, 0), P(4100, 0), P(0, -1))!;
    expect(m).toEqual({ x: 4100, y: 2300 });
  });

  it("solves an oblique pair", () => {
    const m = meetLines(P(0, 0), P(1, 1), P(10, 0), P(-1, 1))!;
    expect(m.x).toBeCloseTo(5, 12);
    expect(m.y).toBeCloseTo(5, 12);
  });

  it("is null when parallel", () => {
    expect(meetLines(P(0, 0), P(1, 0), P(0, 10), P(3, 0))).toBeNull();
  });

  it("agrees with lineLineParams on the oblique branch", () => {
    const Pp = P(3, 7);
    const d = P(11, -4);
    const Q = P(-5, 2);
    const e = P(2, 9);
    const { s } = lineLineParams(Pp, d, Q, e)!;
    const m = meetLines(Pp, d, Q, e)!;
    expect(m.x).toBeCloseTo(Pp.x + s * d.x, 9);
    expect(m.y).toBeCloseTo(Pp.y + s * d.y, 9);
  });
});

describe("lineCircleParams", () => {
  it("returns the two roots ascending", () => {
    // y = 0 through a unit-radius-5 circle at the origin: s = -5 and +5 from x=-10 with d=(1,0).
    const s = lineCircleParams(P(-10, 0), P(1, 0), P(0, 0), 5);
    expect(s).toEqual([5, 15]);
  });

  it("selects the near root correctly for a normalised direction", () => {
    const s = lineCircleParams(P(0, 0), P(0, 1), P(0, 10), 3);
    expect(s).toEqual([7, 13]);
  });

  it("an exact tangency yields exactly one root", () => {
    // The line y = 5 grazes the circle (0,0) r=5 at its bottom point.
    const s = lineCircleParams(P(-10, 5), P(1, 0), P(0, 0), 5);
    expect(s).toHaveLength(1);
    expect(s[0]).toBe(10);
  });

  it("a miss yields no root", () => {
    expect(lineCircleParams(P(-10, 6), P(1, 0), P(0, 0), 5)).toEqual([]);
  });

  it("a zero-length direction yields no root", () => {
    expect(lineCircleParams(P(0, 0), P(0, 0), P(0, 0), 5)).toEqual([]);
  });

  it("the roots really are on the circle", () => {
    const Pp = P(-3, -7);
    const d = P(4, 9);
    const c = P(2, 1);
    const R = 6;
    for (const s of lineCircleParams(Pp, d, c, R)) {
      const q = { x: Pp.x + s * d.x, y: Pp.y + s * d.y };
      expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeCloseTo(R, 9);
    }
  });
});

describe("circleCircle", () => {
  it("two crossing circles give two points, in a canonical order", () => {
    const a = circleCircle(P(0, 0), 5, P(6, 0), 5);
    expect(a).toHaveLength(2);
    expect(a[0]!.x).toBeCloseTo(3, 12);
    expect(a[0]!.y).toBeCloseTo(-4, 12);
    expect(a[1]!.y).toBeCloseTo(4, 12);
    // Passing the circles the other way round gives the identical list.
    expect(circleCircle(P(6, 0), 5, P(0, 0), 5)).toEqual(a);
  });

  it("externally tangent circles give exactly one point", () => {
    const a = circleCircle(P(0, 0), 3, P(8, 0), 5);
    expect(a).toHaveLength(1);
    expect(a[0]!.x).toBeCloseTo(3, 12);
    expect(a[0]!.y).toBeCloseTo(0, 12);
  });

  it("internally tangent circles give exactly one point", () => {
    const a = circleCircle(P(0, 0), 5, P(2, 0), 3);
    expect(a).toHaveLength(1);
    expect(a[0]!.x).toBeCloseTo(5, 12);
  });

  it("separate, nested and concentric circles give none", () => {
    expect(circleCircle(P(0, 0), 3, P(20, 0), 5)).toEqual([]);
    expect(circleCircle(P(0, 0), 10, P(1, 0), 2)).toEqual([]);
    expect(circleCircle(P(0, 0), 5, P(0, 0), 5)).toEqual([]);
  });
});

describe("subArc / reverseArc / arcParamSigned", () => {
  const arc = arcFromChord(P(0, -10), P(0, 10), 10, "cw", false)!;

  it("subArc(0,1) keeps the authored endpoints verbatim", () => {
    const s = subArc(arc, 0, 1);
    expect(s.a).toEqual(arc.a);
    expect(s.b).toEqual(arc.b);
    expect(s.sweep).toBe(arc.sweep);
  });

  it("subArc halves compose back into the whole", () => {
    const first = subArc(arc, 0, 0.5);
    const second = subArc(arc, 0.5, 1);
    expect(first.b).toEqual(second.a);
    expect(first.sweep + second.sweep).toBeCloseTo(arc.sweep, 12);
  });

  it("reverseArc swaps the ends and negates the sweep", () => {
    const r = reverseArc(arc);
    expect(r.a).toEqual(arc.b);
    expect(r.b).toEqual(arc.a);
    expect(r.sweep).toBe(-arc.sweep);
    // The reversed arc's own start angle points at its own first endpoint.
    expect(arcPointAt(r, 0)).toEqual(arc.b);
  });

  it("arcParamSigned reads an OVERSHOOT as t > 1, where arcParamAt would clamp", () => {
    // A quarter arc, and a point a tenth of a quarter PAST its end on the same circle.
    // The (−π, π] normalisation is what makes an overshoot read as t > 1 instead of
    // wrapping round to just under 1; the room to overshoot into is `π − |sweep|`, so
    // a near-half-turn face has none — which is why a mitre falls back to a bevel there.
    const quarter = arcFromChord(P(10, 0), P(0, 10), 10, "ccw", false)!;
    // Built from the angle directly: `arcPointAt` short-circuits t ≥ 1 to the authored
    // endpoint, so asking it for an overshoot would hand back the end and prove nothing.
    const onCircle = (t: number) => ({
      x: quarter.center.x + quarter.r * Math.cos(quarter.start + quarter.sweep * t),
      y: quarter.center.y + quarter.r * Math.sin(quarter.start + quarter.sweep * t),
    });
    expect(arcParamSigned(quarter, onCircle(1.1))).toBeGreaterThan(1);
    expect(arcParamSigned(quarter, onCircle(1.1))).toBeCloseTo(1.1, 9);
    // And a point BEFORE the start reads negative, not as ~1.
    expect(arcParamSigned(quarter, onCircle(-0.1))).toBeCloseTo(-0.1, 9);
    expect(arcParamSigned(arc, arc.a)).toBeCloseTo(0, 12);
    expect(arcParamSigned(arc, arc.b)).toBeCloseTo(1, 12);
  });
});

describe("splitArcYMonotone", () => {
  const yMonotone = (a: ReturnType<typeof arcFromChord>): boolean => {
    if (!a) return false;
    // Sample: y must move in one direction only.
    let sign = 0;
    let prev = arcPointAt(a, 0).y;
    for (let i = 1; i <= 32; i++) {
      const y = arcPointAt(a, i / 32).y;
      const d = y - prev;
      if (Math.abs(d) > 1e-12) {
        const s = d > 0 ? 1 : -1;
        if (sign !== 0 && s !== sign) return false;
        sign = s;
      }
      prev = y;
    }
    return true;
  };

  it("a quarter arc inside one quadrant is already monotone", () => {
    const arc = arcFromChord(P(10, 0), P(0, 10), 10, "ccw", false)!;
    const pieces = splitArcYMonotone(arc);
    expect(pieces).toHaveLength(1);
    expect(yMonotone(pieces[0]!)).toBe(true);
  });

  it("a semicircle spanning the bottom extreme splits into two monotone pieces", () => {
    // (10,0) → (-10,0) the CLOCKWISE way passes through (0,10) — the bottom of the circle.
    const arc = arcFromChord(P(10, 0), P(-10, 0), 10, "cw", false)!;
    const pieces = splitArcYMonotone(arc);
    expect(pieces).toHaveLength(2);
    for (const p of pieces) expect(yMonotone(p)).toBe(true);
    expect(pieces[0]!.a).toEqual(arc.a);
    expect(pieces[pieces.length - 1]!.b).toEqual(arc.b);
  });

  it("a full circle splits into three pieces, all monotone, that compose back", () => {
    const arc = fullCircleArc(P(0, 0), 7);
    const pieces = splitArcYMonotone(arc);
    expect(pieces).toHaveLength(3);
    for (const p of pieces) expect(yMonotone(p)).toBe(true);
    const total = pieces.reduce((s, p) => s + p.sweep, 0);
    expect(total).toBeCloseTo(arc.sweep, 12);
  });

  it("each piece lies in ONE half plane about the centre — the property the root choice needs", () => {
    for (const dir of ["cw", "ccw"] as const) {
      const arc = arcFromChord(P(3, -8), P(-6, 5), 9, dir, true)!;
      for (const piece of splitArcYMonotone(arc)) {
        const xs = Array.from({ length: 17 }, (_, i) => arcPointAt(piece, i / 16).x - piece.center.x);
        const anyPos = xs.some((x) => x > 1e-9);
        const anyNeg = xs.some((x) => x < -1e-9);
        expect(anyPos && anyNeg).toBe(false);
      }
    }
  });
});

describe("rayCrossingLine — every branch of the half-open winding rule", () => {
  it("counts a downward edge +1 and an upward edge −1", () => {
    expect(rayCrossingLine(P(0, 5), P(10, 0), P(10, 10))).toBe(1);
    expect(rayCrossingLine(P(0, 5), P(10, 10), P(10, 0))).toBe(-1);
  });

  it("ignores a crossing behind the ray", () => {
    expect(rayCrossingLine(P(20, 5), P(10, 0), P(10, 10))).toBe(0);
  });

  it("ignores an edge entirely on one side of the ray's line", () => {
    expect(rayCrossingLine(P(0, 50), P(10, 0), P(10, 10))).toBe(0);
    expect(rayCrossingLine(P(0, -50), P(10, 0), P(10, 10))).toBe(0);
  });

  it("ignores a horizontal edge (both endpoints the same side of the half-open test)", () => {
    expect(rayCrossingLine(P(0, 10), P(5, 10), P(20, 10))).toBe(0);
  });

  it("counts a vertex level with the ray exactly once, not twice", () => {
    // An L, and a probe level with its REFLEX corner. Without the half-open rule the two
    // edges meeting at (10,10) would both count (winding 2) or neither would (winding 0);
    // the point is inside, so the only right answer is 1.
    const ell = [P(0, 0), P(20, 0), P(20, 10), P(10, 10), P(10, 20), P(0, 20)];
    const wind = (p: { x: number; y: number }) => {
      let n = 0;
      for (let i = 0; i < ell.length; i++) n += rayCrossingLine(p, ell[i]!, ell[(i + 1) % ell.length]!);
      return n;
    };
    expect(wind(P(5, 10))).toBe(1);
    expect(wind(P(25, 10))).toBe(0);
    expect(wind(P(5, 5))).toBe(1);
    expect(wind(P(15, 5))).toBe(1);
    expect(wind(P(15, 15))).toBe(0);
  });

  it("a vertical edge's crossing abscissa is exact", () => {
    // Just inside a vertical face at x = 4100: still counted; just outside: not.
    expect(rayCrossingLine(P(4099.9999, 5), P(4100, 0), P(4100, 10))).toBe(1);
    expect(rayCrossingLine(P(4100.0001, 5), P(4100, 0), P(4100, 10))).toBe(0);
  });

  it("a clockwise square winds +1 inside and 0 outside", () => {
    const sq = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
    const wind = (p: { x: number; y: number }) => {
      let n = 0;
      for (let i = 0; i < sq.length; i++) n += rayCrossingLine(p, sq[i]!, sq[(i + 1) % sq.length]!);
      return n;
    };
    expect(wind(P(5, 5))).toBe(1);
    expect(wind(P(-5, 5))).toBe(0);
    expect(wind(P(15, 5))).toBe(0);
  });
});

describe("rayCrossingArc", () => {
  it("a full circle winds ±1 inside and 0 outside", () => {
    const c = fullCircleArc(P(0, 0), 10);
    expect(Math.abs(rayCrossingArc(P(0, 0), c))).toBe(1);
    expect(rayCrossingArc(P(20, 0), c)).toBe(0);
    expect(rayCrossingArc(P(-20, 0), c)).toBe(0);
    expect(rayCrossingArc(P(0, 20), c)).toBe(0);
  });

  it("a circle drawn ccw winds the opposite sign to the same circle drawn cw", () => {
    const cw = fullCircleArc(P(0, 0), 10);
    const ccw = reverseArc(cw);
    expect(rayCrossingArc(P(0, 0), cw)).toBe(-rayCrossingArc(P(0, 0), ccw));
  });

  it("picks the correct root on the LEFT half of a circle", () => {
    // (0,-10) → (0,10) the ccw way is the LEFT semicircle (x ∈ [-10, 0]); at y = 0 its
    // only point is x = -10. A ray from x = -20 must find it; one from x = -5 must not,
    // because the crossing is BEHIND the ray — picking the wrong root would report one.
    const left = arcFromChord(P(0, -10), P(0, 10), 10, "ccw", false)!;
    expect(rayCrossingArc(P(-20, 0), left)).not.toBe(0);
    expect(rayCrossingArc(P(-5, 0), left)).toBe(0);
    expect(rayCrossingArc(P(5, 0), left)).toBe(0);
  });

  it("picks the correct root on the RIGHT half of a circle", () => {
    // The mirror case: the cw semicircle is x ∈ [0, 10], meeting y = 0 only at x = +10.
    const right = arcFromChord(P(0, -10), P(0, 10), 10, "cw", false)!;
    expect(rayCrossingArc(P(-5, 0), right)).not.toBe(0);
    expect(rayCrossingArc(P(5, 0), right)).not.toBe(0);
    expect(rayCrossingArc(P(11, 0), right)).toBe(0);
  });

  it("a drum of two semicircles closes into a circle and winds like one", () => {
    const right = arcFromChord(P(0, -10), P(0, 10), 10, "cw", false)!;
    const left = arcFromChord(P(0, 10), P(0, -10), 10, "cw", false)!;
    const wind = (p: { x: number; y: number }) => rayCrossingArc(p, right) + rayCrossingArc(p, left);
    expect(Math.abs(wind(P(0, 0)))).toBe(1);
    expect(Math.abs(wind(P(-8, 0)))).toBe(1);
    expect(Math.abs(wind(P(8, 0)))).toBe(1);
    expect(wind(P(0, 20))).toBe(0);
    expect(wind(P(20, 0))).toBe(0);
  });

  it("a ray level with the circle's very top or bottom is not double counted", () => {
    const c = fullCircleArc(P(0, 0), 10);
    // y = ±10 grazes the extreme; the half-open rule must give a single, consistent answer.
    expect(Math.abs(rayCrossingArc(P(-20, 10), c))).toBeLessThanOrEqual(1);
    expect(Math.abs(rayCrossingArc(P(-20, -10), c))).toBeLessThanOrEqual(1);
  });

  it("mixes with straight edges: a half-round-ended slot winds 1 inside", () => {
    // (0,0)→(20,0) top, a cw semicircle round the right end, (20,10)→(0,10) bottom,
    // a cw semicircle round the left end.
    const rightCap = arcFromChord(P(20, 0), P(20, 10), 5, "cw", false)!;
    const leftCap = arcFromChord(P(0, 10), P(0, 0), 5, "cw", false)!;
    const wind = (p: { x: number; y: number }) =>
      rayCrossingLine(p, P(0, 0), P(20, 0)) +
      rayCrossingArc(p, rightCap) +
      rayCrossingLine(p, P(20, 10), P(0, 10)) +
      rayCrossingArc(p, leftCap);
    expect(wind(P(10, 5))).toBe(1);
    expect(wind(P(23, 5))).toBe(1); // inside the right cap's bulge
    expect(wind(P(26, 5))).toBe(0); // beyond it
    expect(wind(P(10, -3))).toBe(0);
  });
});

describe("vector helpers", () => {
  it("perp is 90° to the RIGHT of travel in y-down screen space", () => {
    const n = perp({ x: 1, y: 0 }); // travelling right ⇒ perp points down the screen
    expect(n.x).toBe(-0); // `-p.y` of a +0 is -0; arithmetically identical, and the
    expect(n.y).toBe(1); //  joinery interner is the one place -0 is normalised away.
    expect(cross2({ x: 1, y: 0 }, perp({ x: 1, y: 0 }))).toBe(1);
  });
});
