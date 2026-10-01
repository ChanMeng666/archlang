import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import {
  doorSwing,
  swingsCollide,
  swingsCollideAsIndependent,
  type DoorLike,
  type DoorSwing,
} from "../src/geometry.js";
import { lint } from "../src/index.js";
import { widestClearingWidth } from "../src/lint/rules/doors.js";
import { swingsCollideV1 } from "./swing-predicate-v1.js";

/**
 * Backlog 6.12: `swingsCollide` DECIDES whether two door swings obstruct each other, with an
 * exact separating-axis test, where a nine-point arc sampler used to gate the decision and
 * miss any overlap whose shared region held none of its points.
 *
 * Pinned here: the backlog's counterexample (red on the sampler, frozen in
 * `./swing-predicate-v1.ts`); the separating-GAP case the bare axis test got wrong (two leaves
 * with parallel facing edges, apart, read as touching); the superset law (every collision
 * the old predicate found is still one); agreement with an independent oracle (convex
 * polygon clipping, plus straight-edge contact); and the narrowing hint's bisection checked
 * against every width. The double-door and single-point-contact semantics (1.37.1) are
 * pinned, unchanged, in `swing.test.ts`.
 */

const sw = (hinge: Point, farJamb: Point, leafEnd: Point, radius: number): DoorSwing => ({
  hinge,
  farJamb,
  leafEnd,
  radius,
  sweep: 0,
});

describe("6.12 — an overlap with no sampled point in it collides", () => {
  // A hinged at (300,300), r 900, wedge 180°–270°; B hinged at the origin, r 1000, first
  // quadrant. They share the square [0,300]² — 90,000 mm² — and none of either arc's nine
  // sample points lies in it.
  const A = sw({ x: 300, y: 300 }, { x: -600, y: 300 }, { x: 300, y: -600 }, 900);
  const B = sw({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }, 1000);

  it("the frozen sampler predicate reads it as clear (the bug)", () => {
    expect(swingsCollideV1(A, B, 0)).toBe(false);
    expect(swingsCollideV1(B, A, 0)).toBe(false);
  });

  it("collides, in both orders, at clearance 0 and 150", () => {
    for (const clr of [0, 150]) {
      expect(swingsCollide(A, B, clr), `clr ${clr}`).toBe(true);
      expect(swingsCollide(B, A, clr), `clr ${clr}`).toBe(true);
    }
  });

  it("warns as W_SWING_OBSTRUCTED on a plan that hangs the two doors", () => {
    // Two parallel walls 300 mm apart; d_b opens up from y=0, d_a opens down from y=300.
    const src = [
      'plan "6.12" {',
      "  units mm",
      "  wall wa thickness 100 { (-2000,0) (3000,0) }",
      "  wall wb thickness 100 { (-2000,300) (3000,300) }",
      "  door id=d_b at (500,0) width 1000 wall wa hinge left swing in",
      "  door id=d_a at (-150,300) width 900 wall wb hinge right swing out",
      "}",
    ].join("\n");
    const swing = lint(src).filter((d) => d.code === "W_SWING_OBSTRUCTED");
    expect(swing).toHaveLength(1);
    expect(swing[0]!.message).toContain(`door "d_a"'s swing overlaps it`);
  });
});

describe("a separating gap is never contact", () => {
  it("two leaves opening AWAY from each other, facing edges parallel, are clear at any gap", () => {
    // The closed leaves lie on y = 0 and y = gap, overlapping in x; each opens away from the
    // other. A separating axis with a gap used to fall through to the contact measure, which
    // compared the two faces' extents along the line and called the overlap "contact".
    for (const gap of [1, 2, 10, 300, 1000, 1500]) {
      const a = sw({ x: 1500, y: 0 }, { x: 2500, y: 0 }, { x: 1500, y: -1000 }, 1000);
      const b = sw({ x: 2000, y: gap }, { x: 3000, y: gap }, { x: 2000, y: gap + 1000 }, 1000);
      for (const clr of [0, 150]) {
        expect(swingsCollide(a, b, clr), `gap ${gap} clr ${clr}`).toBe(false);
        expect(swingsCollide(b, a, clr), `gap ${gap} clr ${clr}`).toBe(false);
      }
    }
  });

  it("the same pair with NO gap shares a 500 mm segment of the line, and collides", () => {
    const a = sw({ x: 1500, y: 0 }, { x: 2500, y: 0 }, { x: 1500, y: -1000 }, 1000);
    const b = sw({ x: 2000, y: 0 }, { x: 3000, y: 0 }, { x: 2000, y: 1000 }, 1000);
    expect(swingsCollide(a, b, 0)).toBe(true);
    expect(swingsCollide(b, a, 0)).toBe(true);
  });

  it("the shipped eval golden's pair (sized-wet-room d_live / d_bed, 1500 mm apart) is clear", () => {
    const live = sw({ x: 1500, y: 3000 }, { x: 2500, y: 3000 }, { x: 1500, y: 2000 }, 1000);
    const bed = sw({ x: 2000, y: 4500 }, { x: 3000, y: 4500 }, { x: 2000, y: 5500 }, 1000);
    for (const clr of [0, 150]) expect(swingsCollide(live, bed, clr), `clr ${clr}`).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// Random doors, hung on real walls through `doorSwing`, axis-aligned and oblique.

const AXIS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const arbDir = (oblique: boolean): fc.Arbitrary<Point> =>
  oblique
    ? fc
        .integer({ min: 1, max: 359 })
        .filter((deg) => deg % 90 !== 0)
        .map((deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) }))
    : fc.constantFrom(...AXIS);

const arbDoor = (oblique: boolean): fc.Arbitrary<DoorLike> =>
  fc
    .record({
      ox: fc.integer({ min: 0, max: 40 }),
      oy: fc.integer({ min: 0, max: 40 }),
      dir: arbDir(oblique),
      pos: fc.integer({ min: 0, max: 40 }),
      width: fc.constantFrom(600, 700, 800, 900, 1000, 1200),
      hinge: fc.constantFrom("left" as const, "right" as const),
      swing: fc.constantFrom("in" as const, "out" as const),
    })
    .map(({ ox, oy, dir, pos, width, hinge, swing }) => {
      const a = { x: ox * 50, y: oy * 50 };
      const along = 1000 + pos * 50;
      return {
        at: { x: a.x + dir.x * along, y: a.y + dir.y * along },
        width,
        hinge,
        swing,
        host: { a, b: { x: a.x + dir.x * 10000, y: a.y + dir.y * 10000 }, thickness: 100 },
      };
    });

const arbPair = fc.boolean().chain((oblique) => fc.tuple(arbDoor(oblique), arbDoor(oblique)));

describe("the superset law: every collision the old sampler found is still a collision", () => {
  it("holds over random axis-aligned and oblique pairs, at clearance 0 and 150", () => {
    let oldHits = 0;
    fc.assert(
      fc.property(arbPair, fc.constantFrom(0, 150), ([da, db], clr) => {
        const a = doorSwing(da)!;
        const b = doorSwing(db)!;
        if (swingsCollideV1(a, b, clr)) {
          oldHits++;
          return swingsCollide(a, b, clr);
        }
        return true;
      }),
      { numRuns: 4000, seed: 20261001 },
    );
    // The law is not vacuous: the old predicate fired on a good share of the draws.
    expect(oldHits).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------------------
// An independent oracle: convex polygon clipping of the two sectors (the arc as an inscribed
// and as a circumscribed polygon, bracketing the true shape), plus straight-edge contact.

function sectorPolygon(s: DoorSwing, circumscribed: boolean, n = 64): Point[] {
  const a0 = Math.atan2(s.farJamb.y - s.hinge.y, s.farJamb.x - s.hinge.x);
  let span = Math.atan2(s.leafEnd.y - s.hinge.y, s.leafEnd.x - s.hinge.x) - a0;
  while (span > Math.PI) span -= 2 * Math.PI;
  while (span < -Math.PI) span += 2 * Math.PI;
  const pts: Point[] = [s.hinge, s.farJamb];
  const r = circumscribed ? s.radius / Math.cos(Math.abs(span) / n / 2) : s.radius;
  // Inscribed: the arc's own vertices. Circumscribed: the tangent lines' crossings, which
  // sit half a step along.
  for (let i = 1; i <= (circumscribed ? n : n - 1); i++) {
    const ang = a0 + span * (circumscribed ? (i - 0.5) / n : i / n);
    pts.push({ x: s.hinge.x + r * Math.cos(ang), y: s.hinge.y + r * Math.sin(ang) });
  }
  pts.push(s.leafEnd);
  const twice = pts.reduce((acc, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return acc + p.x * q.y - q.x * p.y;
  }, 0);
  return twice < 0 ? pts.reverse() : pts;
}

/** Sutherland–Hodgman: `subject` clipped by the convex CCW polygon `clipper`. */
function clipConvex(subject: Point[], clipper: Point[]): Point[] {
  let out = subject;
  for (let i = 0; i < clipper.length && out.length > 0; i++) {
    const p = clipper[i]!;
    const q = clipper[(i + 1) % clipper.length]!;
    const side = (v: Point): number => (q.x - p.x) * (v.y - p.y) - (q.y - p.y) * (v.x - p.x);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const u = input[j]!;
      const v = input[(j + 1) % input.length]!;
      const su = side(u);
      const sv = side(v);
      if (su >= 0) out.push(u);
      if (su >= 0 !== sv >= 0) {
        const t = su / (su - sv);
        out.push({ x: u.x + (v.x - u.x) * t, y: u.y + (v.y - u.y) * t });
      }
    }
  }
  return out;
}

const polygonArea = (p: Point[]): number =>
  Math.abs(
    p.reduce((acc, u, i) => {
      const v = p[(i + 1) % p.length]!;
      return acc + u.x * v.y - v.x * u.y;
    }, 0),
  ) / 2;

/** The longest run along which a straight edge of `a` lies on a straight edge of `b`. */
function edgeContact(a: DoorSwing, b: DoorSwing): number {
  let best = 0;
  for (const [p0, p1] of [
    [a.hinge, a.farJamb],
    [a.hinge, a.leafEnd],
  ] as const) {
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const u = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len };
    const off = (p: Point): number => (p.x - p0.x) * u.y - (p.y - p0.y) * u.x;
    const at = (p: Point): number => (p.x - p0.x) * u.x + (p.y - p0.y) * u.y;
    for (const [q0, q1] of [
      [b.hinge, b.farJamb],
      [b.hinge, b.leafEnd],
    ] as const) {
      if (Math.abs(off(q0)) > 1e-6 || Math.abs(off(q1)) > 1e-6) continue;
      const lo = Math.max(0, Math.min(at(q0), at(q1)));
      const hi = Math.min(len, Math.max(at(q0), at(q1)));
      best = Math.max(best, hi - lo);
    }
  }
  return best;
}

describe("the decision agrees with an independent oracle (polygon clipping + edge contact)", () => {
  it("clear ⇒ no area and no edge contact; obstruct ⇒ area or edge contact", () => {
    let obstruct = 0;
    let clear = 0;
    fc.assert(
      fc.property(arbPair, ([da, db]) => {
        const a = doorSwing(da)!;
        const b = doorSwing(db)!;
        const contact = edgeContact(a, b);
        if (swingsCollide(a, b, 0)) {
          obstruct++;
          // The circumscribed polygons contain the true sectors, so a real overlap shows there.
          const outer = polygonArea(clipConvex(sectorPolygon(a, true), sectorPolygon(b, true)));
          return outer > 1e-9 || contact > 1e-6;
        }
        clear++;
        // The inscribed polygons lie inside the true sectors, so any area there is real.
        const inner = polygonArea(clipConvex(sectorPolygon(a, false), sectorPolygon(b, false)));
        return inner < 1e-2 && contact <= 1e-6;
      }),
      { numRuns: 1500, seed: 20261001 },
    );
    expect(obstruct).toBeGreaterThan(100);
    expect(clear).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------------------
// `widestClearingWidth`: a bisection, sound only if being clear is monotone in the width.

/** Every candidate width's verdict, and what a correct search returns: the top of the run of
 *  clearing widths that starts at the narrowest (so "or less" holds), or null. */
function bruteForce(d: DoorLike, grid: number, clears: (s: DoorSwing | null) => boolean) {
  const step = grid > 0 ? grid : 1;
  const hi = Math.ceil(d.width / step) - 1;
  const ok: boolean[] = [];
  for (let k = 1; k <= hi; k++) ok.push(clears(doorSwing({ ...d, width: k * step })));
  const firstFail = ok.indexOf(false);
  const monotone = firstFail < 0 || !ok.slice(firstFail).some(Boolean);
  const top = firstFail < 0 ? hi : firstFail; // k of the last width of the clearing run
  return { monotone, expected: top >= 1 ? top * step : null };
}

/** The rule's narrowing proof against swings only: each other door read as independent. */
const independentOf =
  (others: DoorSwing[], clr: number) =>
  (s: DoorSwing | null): boolean =>
    s !== null && others.every((o) => !swingsCollideAsIndependent(s, o, clr));

describe("the narrowing hint's bisection equals a brute force over every width", () => {
  it("over random doors among 1–3 other swings, on and off a grid, at clearance 0 and 150", () => {
    fc.assert(
      fc.property(
        fc
          .boolean()
          .chain((oblique) => fc.tuple(arbDoor(oblique), fc.array(arbDoor(oblique), { minLength: 1, maxLength: 3 }))),
        fc.constantFrom(0, 50, 100),
        fc.constantFrom(0, 150),
        ([d, others], grid, clr) => {
          const clears = independentOf(
            others.map((o) => doorSwing(o)!),
            clr,
          );
          const { monotone, expected } = bruteForce(d, grid, clears);
          return monotone && widestClearingWidth(d, grid, clears) === expected;
        },
      ),
      { numRuns: 400, seed: 20261001 },
    );
  });

  // A narrowed leaf whose far jamb lands EXACTLY on a third door's latch jamb is, at that one
  // width, a double door with it. With the double-door exemption that width is clear under a
  // clearance while every width around it collides, and the bisection could quote it: "narrow
  // to 500 mm or less" with 201–499 mm all colliding. Read as independent doors, it is not.
  const host = { a: { x: -2000, y: 0 }, b: { x: 8000, y: 0 }, thickness: 100 };
  const family = [0, 50, 100].flatMap((grid) =>
    [900, 1000, 1100, 1200].flatMap((dw) =>
      [600, 700, 800, 900].flatMap((cw) =>
        [500, 600, 700, 800].filter((pw) => pw < dw).map((pw) => ({ grid, dw, cw, pw })),
      ),
    ),
  );

  it("is exact on the shared-latch family, where the exemption would make it non-monotone", () => {
    let exemptBreaksIt = 0;
    for (const { grid, dw, cw, pw } of family) {
      // `d` at x=1000 hinged left; at width `pw` its far jamb meets C's latch at 1000 + pw/2.
      const d: DoorLike = { at: { x: 1000, y: 0 }, width: dw, hinge: "left", swing: "in", host };
      const c = doorSwing({ at: { x: 1000 + pw / 2 + cw / 2, y: 0 }, width: cw, hinge: "right", swing: "in", host })!;
      const tag = `grid ${grid} d ${dw} C ${cw} latch at width ${pw}`;
      const exempt = bruteForce(d, grid, (s) => s !== null && !swingsCollide(s, c, 150));
      if (!exempt.monotone) exemptBreaksIt++;
      const clears = independentOf([c], 150);
      const { monotone, expected } = bruteForce(d, grid, clears);
      expect(monotone, tag).toBe(true);
      expect(widestClearingWidth(d, grid, clears), tag).toBe(expected);
    }
    // The family really does exercise the exemption: with it, every case is non-monotone.
    expect(exemptBreaksIt).toBe(family.length);
  });

  it("the lint hint quotes the clearing run, not the isolated shared-latch width", () => {
    // `d` (1000 mm) overlaps c; narrowed to 500 mm its far jamb sits on c's latch at x=1250.
    const src = [
      'plan "latch" {',
      "  units mm",
      "  wall w thickness 100 { (-2000,0) (8000,0) }",
      "  door id=d at (1000,0) width 1000 wall w hinge left swing in",
      "  door id=c at (1650,0) width 800 wall w hinge right swing in",
      "}",
    ].join("\n");
    const swing = lint(src, { profile: "accessibility-advisory" }).filter((x) => x.code === "W_SWING_OBSTRUCTED");
    expect(swing).toHaveLength(1);
    expect(swing[0]!.message).toContain(`door "c"'s swing overlaps it`);
    expect(swing[0]!.hints).toContain(
      "Narrowing the door is not a fix here — the leaf would have to drop to 200 mm, under the 960 mm minimum passable width.",
    );
  });
});
