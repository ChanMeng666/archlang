/**
 * `polygonsOverlap` (`src/geometry/polygon.ts`) against the form it replaced, kept here VERBATIM as
 * the oracle (`docs/backlog.md` M.19): every edge pair, then every vertex and midpoint against the
 * whole other ring. The new form reads only what reaches the window the two boxes share, and
 * `test/room-overlap-oracle.test.ts` cannot see that change, because it imports the function it
 * compares.
 *
 * The law: the two forms answer alike, except where the old form reported a crossing between
 * disjoint near-collinear edges outside the shared window, a rounding artefact, and there the new
 * answer is correct. `cross3` can round two such edges' products to opposite signs at
 * full-precision coordinates; every lattice below is exact in binary64, so it cannot reach that
 * class and those blocks ask for plain equality, on the corpus's rings and on rings built to touch,
 * share edges and sit a rounding away from each other, with each `eps` a caller passes. The trig
 * and jittered rings ask for the law as it stands: new true implies old true, and any old true with
 * new false is that artefact, decided in exact arithmetic (`isCollinearArtefact`). Each block counts
 * what it reached, so a green run cannot be a vacuous one.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import {
  VERTEX_EPS,
  cross3,
  distToPolygonEdge,
  pointInPolygon,
  polygonBounds,
  polygonEdges,
  polygonsOverlap,
  rectRing,
} from "../src/geometry/polygon.js";
import { link } from "../src/import.js";
import { compile } from "../src/index.js";
import { resolveAll } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";

const ROOT = resolvePath(__dirname, "..");

function segmentsProperlyCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross3(p3, p4, p1);
  const d2 = cross3(p3, p4, p2);
  const d3 = cross3(p1, p2, p3);
  const d4 = cross3(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** The form before the window, verbatim. */
function polygonsOverlapOracle(a: readonly Point[], b: readonly Point[], eps = 1): boolean {
  const ba = polygonBounds(a);
  const bb = polygonBounds(b);
  if (Math.min(ba.x + ba.w, bb.x + bb.w) - Math.max(ba.x, bb.x) <= eps) return false;
  if (Math.min(ba.y + ba.h, bb.y + bb.h) - Math.max(ba.y, bb.y) <= eps) return false;
  for (const [a1, a2] of polygonEdges(a)) {
    for (const [b1, b2] of polygonEdges(b)) {
      if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
    }
  }
  const strictlyInside = (p: Point, ring: readonly Point[]): boolean =>
    distToPolygonEdge(p, ring) > eps && pointInPolygon(p.x, p.y, ring);
  for (const [p, ring] of [
    [a, b],
    [b, a],
  ] as Array<[readonly Point[], readonly Point[]]>) {
    for (const v of p) if (strictlyInside(v, ring)) return true;
    for (const [e1, e2] of polygonEdges(p)) {
      if (strictlyInside({ x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 }, ring)) return true;
    }
  }
  return false;
}

const EPS = [1, 0, 0.5, VERTEX_EPS] as const;

const walk = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return walk(p);
      return f.endsWith(".arch") ? [p] : [];
    });

/** Every room and ground ring of one plan, a rectangle as its ring. */
function ringsOf(file: string): Point[][] {
  const world: World = {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dirname(file), p), "utf8");
      } catch {
        return null;
      }
    },
  };
  const { plan } = parse(readFileSync(file, "utf8"), BUILTIN_REGISTRY);
  if (!plan) return [];
  const res = resolveAll(link(plan, world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, world);
  const irs = res.levels.length > 0 ? res.levels.map((l) => l.ir) : [res.ir];
  return irs.flatMap((ir) =>
    ir.elements.flatMap((e) => {
      if (e.kind !== "room" && e.kind !== "outdoor") return [];
      return [e.poly ?? rectRing({ x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h })];
    }),
  );
}

describe("the windowed exact ring test answers as the whole-ring test did", () => {
  it("every pair of rings in each corpus plan, with each eps a caller passes", () => {
    let pairs = 0;
    let overlapping = 0;
    let polygonPairs = 0;
    for (const dir of ["examples", "test/fixtures", "eval/goldens", "test/defect-corpus", "test/taste-corpus"]) {
      for (const file of walk(join(ROOT, dir))) {
        const rings = ringsOf(file);
        for (let i = 0; i < rings.length; i++) {
          for (let j = i; j < rings.length; j++) {
            const [a, b] = [rings[i]!, rings[j]!];
            for (const eps of EPS) {
              const want = polygonsOverlapOracle(a, b, eps);
              expect(polygonsOverlap(a, b, eps), `${file} ${i} ${j} ${eps}`).toBe(want);
              pairs++;
              if (want) overlapping++;
              if (a.length > 4 || b.length > 4) polygonPairs++;
            }
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(10_000);
    expect(overlapping).toBeGreaterThan(100);
    expect(polygonPairs).toBeGreaterThan(300);
  }, 300_000);

  /** Rings on a coarse lattice, so edges share lines, vertices land on edges and rings touch. */
  const lattice = (scale: number, offset: number): fc.Arbitrary<Point[]> =>
    fc
      .array(fc.tuple(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 })), { minLength: 3, maxLength: 12 })
      .map((ps) => ps.map(([x, y]) => ({ x: x * scale + offset, y: y * scale + offset })));

  it("generated rings on a lattice, simple or not, at drawing scale and at the modelling range", () => {
    let hits = 0;
    let misses = 0;
    for (const [scale, offset] of [
      [500, 0],
      [0.25, 3],
      [1000, 2 ** 24],
      [1, -(2 ** 24)],
    ] as const) {
      fc.assert(
        fc.property(lattice(scale, offset), lattice(scale, offset), fc.constantFrom(...EPS), (a, b, eps) => {
          const want = polygonsOverlapOracle(a, b, eps);
          expect(polygonsOverlap(a, b, eps)).toBe(want);
          if (want) hits++;
          else misses++;
        }),
        { numRuns: 1500, seed: 20261101 },
      );
    }
    expect(hits).toBeGreaterThan(500);
    expect(misses).toBeGreaterThan(500);
  }, 120_000);

  it("points a tolerance from an edge: the on-edge and `eps` arms decide as they did", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    // A second square whose corner sits this far inside, past, or just short of the first's edge.
    const gaps = [0, 1e-9, 5e-7, 1e-6, 2e-6, 1e-3, 0.5, 1, 1 + 1e-9, 1.5, 2];
    let hits = 0;
    let misses = 0;
    for (const dx of gaps) {
      for (const dy of gaps) {
        for (const sign of [1, -1]) {
          const b = rectRing({ x: 4000 - sign * dx, y: 2000 - sign * dy, w: 3000, h: 3000 });
          for (const eps of EPS) {
            const want = polygonsOverlapOracle(square, b, eps);
            expect(polygonsOverlap(square, b, eps), `${dx} ${dy} ${sign} ${eps}`).toBe(want);
            expect(polygonsOverlap(b, square, eps)).toBe(polygonsOverlapOracle(b, square, eps));
            if (want) hits++;
            else misses++;
          }
        }
      }
    }
    expect(hits).toBeGreaterThan(50);
    expect(misses).toBeGreaterThan(50);
  });

  it("a ring far outside the window still answers: containment with no vertex near the other ring", () => {
    const outer = rectRing({ x: 0, y: 0, w: 10_000, h: 10_000 });
    const inner = rectRing({ x: 4000, y: 4000, w: 1000, h: 1000 });
    expect(polygonsOverlap(outer, inner)).toBe(true);
    expect(polygonsOverlap(inner, outer)).toBe(true);
    expect(polygonsOverlapOracle(outer, inner)).toBe(true);
  });
});

/** A finite double's exact value times 2^1074, so every double is an integer and no sum rounds. */
function exact(x: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const magnitude = exponent === 0 ? fraction : (fraction | (1n << 52n)) << BigInt(exponent - 1);
  return bits >> 63n === 1n ? -magnitude : magnitude;
}

/** {@link cross3} in exact arithmetic, on {@link exact}'s scale squared. */
function exactCross(a: Point, b: Point, c: Point): bigint {
  const [ax, ay] = [exact(a.x), exact(a.y)];
  return (exact(b.x) - ax) * (exact(c.y) - ay) - (exact(b.y) - ay) * (exact(c.x) - ax);
}

const opposite = (p: bigint, q: bigint): boolean => (p > 0n && q < 0n) || (p < 0n && q > 0n);

/** Is `c` on the line through a and b, to within about 1e-6 mm? Exact, so rounding cannot decide it. */
function nearLine(a: Point, b: Point, c: Point): boolean {
  const cross = exactCross(a, b, c);
  const size = exact(b.x) - exact(a.x);
  const size2 = exact(b.y) - exact(a.y);
  const span = (size < 0n ? -size : size) + (size2 < 0n ? -size2 : size2);
  return (cross < 0n ? -cross : cross) * 2n ** 20n <= span * 2n ** 1074n;
}

/**
 * The one way the forms may differ: the old form said yes only because two edges read as crossing,
 * and each such pair is an artefact. Decided without `cross3`'s rounding: their boxes are apart,
 * exact arithmetic says they do not cross, and all four ends lie on one line to within 1e-6 mm.
 */
function isCollinearArtefact(a: readonly Point[], b: readonly Point[], eps: number): boolean {
  const reads = polygonEdges(a).flatMap(([a1, a2]) =>
    polygonEdges(b).flatMap(([b1, b2]) => (segmentsProperlyCross(a1, a2, b1, b2) ? [[a1, a2, b1, b2] as const] : [])),
  );
  if (reads.length === 0 || oldContainment(a, b, eps)) return false;
  return reads.every(([a1, a2, b1, b2]) => {
    const apart =
      Math.max(a1.x, a2.x) < Math.min(b1.x, b2.x) ||
      Math.max(b1.x, b2.x) < Math.min(a1.x, a2.x) ||
      Math.max(a1.y, a2.y) < Math.min(b1.y, b2.y) ||
      Math.max(b1.y, b2.y) < Math.min(a1.y, a2.y);
    const crosses =
      opposite(exactCross(b1, b2, a1), exactCross(b1, b2, a2)) &&
      opposite(exactCross(a1, a2, b1), exactCross(a1, a2, b2));
    return apart && !crosses && nearLine(a1, a2, b1) && nearLine(a1, a2, b2);
  });
}

/** The old form's containment half, verbatim. */
function oldContainment(a: readonly Point[], b: readonly Point[], eps: number): boolean {
  const strictlyInside = (p: Point, ring: readonly Point[]): boolean =>
    distToPolygonEdge(p, ring) > eps && pointInPolygon(p.x, p.y, ring);
  for (const [p, ring] of [
    [a, b],
    [b, a],
  ] as Array<[readonly Point[], readonly Point[]]>) {
    for (const v of p) if (strictlyInside(v, ring)) return true;
    for (const [e1, e2] of polygonEdges(p)) {
      if (strictlyInside({ x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 }, ring)) return true;
    }
  }
  return false;
}

/** A seeded generator: these rings need full-precision doubles, which a lattice cannot give. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("on full-precision coordinates the forms differ only by a rounding artefact", () => {
  /** New true implies old true; old true and new false must be the named artefact. */
  interface Seen {
    hits: number;
    artefacts: number;
    misses: number;
  }
  function law(a: readonly Point[], b: readonly Point[], eps: number, seen: Seen): void {
    const want = polygonsOverlapOracle(a, b, eps);
    const got = polygonsOverlap(a, b, eps);
    if (got) {
      expect(want).toBe(true);
      seen.hits++;
    } else if (want) {
      expect(isCollinearArtefact(a, b, eps), JSON.stringify([a, b, eps])).toBe(true);
      seen.artefacts++;
    } else {
      seen.misses++;
    }
  }

  it("rooms either side of a skew line: the finder's plans, where exact lattices never reach", () => {
    const rnd = seeded(11);
    const seen: Seen = { hits: 0, artefacts: 0, misses: 0 };
    for (let i = 0; i < 40_000; i++) {
      const k = 0.6 + rnd() * 1.4;
      const ox = rnd() * 100;
      const oy = rnd() * 100;
      const size = 1000 + rnd() * 2000;
      const on = (t: number): Point => ({ x: ox + t, y: oy + k * t });
      const t0 = rnd() * size;
      const t1 = t0 + rnd() * size;
      const t2 = t1 + (rnd() + 0.01) * size;
      const t3 = t2 + rnd() * size;
      const a = [on(t0), on(t1), { x: Math.round(ox + t3 + 100), y: Math.round(on(t3).y + 50) }];
      const b = [on(t2), on(t3), { x: Math.round(ox + t2 + 3), y: Math.round(on(t3).y + 1) }];
      law(a, b, 1, seen);
    }
    // Not vacuous: the class is reached. The two triangles never truly overlap, so nothing is a hit.
    expect(seen.artefacts).toBeGreaterThan(5);
    expect(seen.hits).toBe(0);
    expect(seen.misses).toBeGreaterThan(30_000);
  }, 120_000);

  it("trig rings and jittered lattices, overlapping, clipping, nested and apart", () => {
    const rnd = seeded(20261101);
    const seen: Seen = { hits: 0, artefacts: 0, misses: 0 };
    const circle = (cx: number, cy: number, r: number, n: number): Point[] =>
      Array.from({ length: n }, (_, i) => ({
        x: cx + r * Math.cos((2 * Math.PI * i) / n),
        y: cy + r * Math.sin((2 * Math.PI * i) / n),
      }));
    const jittered = (scale: number, size: number): Point[] =>
      Array.from({ length: 3 + Math.floor(rnd() * 9) }, () => ({
        x: Math.floor(rnd() * 9) * scale + (rnd() - 0.5) * size,
        y: Math.floor(rnd() * 9) * scale + (rnd() - 0.5) * size,
      }));
    for (let i = 0; i < 6_000; i++) {
      const r = 200 + rnd() * 3000;
      const reach = (rnd() * 3 - 0.5) * r;
      const a = circle(rnd() * 100, rnd() * 100, r, 12 + Math.floor(rnd() * 37));
      const b = circle(reach, reach * rnd(), r * (0.1 + rnd()), 12 + Math.floor(rnd() * 37));
      const eps = EPS[i % EPS.length]!;
      law(a, b, eps, seen);
      law(jittered(500, 1e-3), jittered(500, 1e-3), eps, seen);
      law(jittered(500, 100), jittered(500, 100), eps, seen);
    }
    expect(seen.hits).toBeGreaterThan(1000);
    expect(seen.misses).toBeGreaterThan(100);
  }, 120_000);

  it("pins the red-team's plan: two triangles either side of a line, no W_ROOM_OVERLAP", () => {
    const a = "(701.3457685437253,870.9659397026044) (1690.6995936965625,2118.6654546226564) (2779,3415)";
    const b = "(1757.8549774116025,2203.356833536142) (2679.2729697544837,3365.3807251476396) (1761,3366)";
    const src = `plan "cex" {\n  units mm\n  room id=a polygon ${a}\n  room id=b polygon ${b}\n}\n`;
    const ring = (s: string): Point[] =>
      [...s.matchAll(/\(([\d.]+),([\d.]+)\)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    // The old form said they overlap, the new one does not, and exact arithmetic sides with the new.
    expect(polygonsOverlapOracle(ring(a), ring(b))).toBe(true);
    expect(polygonsOverlap(ring(a), ring(b))).toBe(false);
    expect(isCollinearArtefact(ring(a), ring(b), 1)).toBe(true);
    expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("W_ROOM_OVERLAP");
  });
});
