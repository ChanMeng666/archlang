/**
 * `polygonsOverlap` (`src/geometry/polygon.ts`) against the form it replaced, kept here VERBATIM as
 * the oracle (`docs/backlog.md` M.19): every edge pair, then every vertex and midpoint against the
 * whole other ring. The new form reads only what reaches the window the two boxes share, and
 * `test/room-overlap-oracle.test.ts` cannot see that change, because it imports the function it
 * compares. The gate here is that no answer moves, on the corpus's rings and on generated ones
 * built to touch, share edges and sit a rounding away from each other, with each `eps` a caller
 * passes. Each block counts what it reached, so a green run cannot be a vacuous one.
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
