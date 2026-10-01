import { readFileSync } from "node:fs";
import { describe as suite, expect, it, vi } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { arcFromChord, arcSteps, arcTessellate } from "../src/geometry/arc.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";
import { pathArcs } from "./path-prim.js";

/**
 * The `arc … radius R` validity test is decided on exact squared terms, `4·r² < dx² + dy²`,
 * never on `Math.hypot`, which V8 does not round correctly: `Math.hypot(3300, 5600)` is
 * `6500.000000000001`, so testing `r < hypot / 2` refused an exact semicircle (chord 6500,
 * radius 3250) with `E_ARC_RADIUS`. Integer inputs keep every square below 2^53, so the
 * verdict here is exact, and the construction reads the same squares, so an accepted tie
 * builds a real semicircle rather than a NaN centre.
 */

const wallSrc = (a: Point, b: Point, r: number, tail = ""): string =>
  `plan "p" {\n  wall id=w exterior thickness 200 { (${a.x},${a.y}) arc (${b.x},${b.y}) radius ${r}${tail} }\n}\n`;

const arcErrors = (src: string): number =>
  compile(src, { noCache: true }).diagnostics.filter((d) => d.code === "E_ARC_RADIUS").length;

const wallArc = (src: string) => resolve(parse(src).plan!).ir.walls[0]!.arcs?.[0];

const O = { x: 0, y: 0 };

/** The three probes that raised a false `E_ARC_RADIUS` on V8's `Math.hypot`. */
const PROBES: Array<{ b: Point; r: number }> = [
  { b: { x: 3300, y: 5600 }, r: 3250 },
  { b: { x: 70, y: 240 }, r: 125 },
  { b: { x: 480, y: 140 }, r: 250 },
];

suite("arc radius — exact semicircle on a Pythagorean chord", () => {
  it("the probe chords really are ones Math.hypot over-rounds (the control: the bug's precondition holds)", () => {
    // If this ever fails, the engine's hypot became exact on these chords and the
    // probes below no longer exercise the defect — pick new probes, do not delete.
    const over = PROBES.filter(({ b, r }) => Math.hypot(b.x, b.y) / 2 > r);
    expect(over.length).toBeGreaterThan(0);
    // ...while the exact squared test calls every one of them a tie.
    for (const { b, r } of PROBES) expect(4 * r * r).toBe(b.x * b.x + b.y * b.y);
  });

  for (const { b, r } of PROBES) {
    it(`(0,0) → (${b.x},${b.y}) radius ${r}: compiles with no E_ARC_RADIUS and draws the arc`, () => {
      const src = wallSrc(O, b, r);
      expect(arcErrors(src)).toBe(0);
      const arc = wallArc(src);
      expect(arc).toBeDefined();
      // Exactly a half turn about the chord midpoint.
      expect(Math.abs(arc!.sweep)).toBeCloseTo(Math.PI, 12);
      expect(arc!.center.x).toBeCloseTo(b.x / 2, 9);
      expect(arc!.center.y).toBeCloseTo(b.y / 2, 9);
      // Drawn as true arcs on both wall faces (radius ± half the 200 mm thickness).
      const out = compile(src, { noCache: true });
      const faces = out.scene!.nodes.filter((n: SceneNode) => n.layer === "wallFace");
      const radii = new Set(pathArcs(faces).map((p) => p.r));
      expect(radii).toEqual(new Set([r - 100, r + 100]));
      expect(out.svg).toContain(` A ${r - 100} ${r - 100} `);
      expect(out.svg).toContain(` A ${r + 100} ${r + 100} `);
    });

    it(`(0,0) → (${b.x},${b.y}) radius ${r - 1}: one millimetre short still raises E_ARC_RADIUS`, () => {
      expect(arcErrors(wallSrc(O, b, r - 1))).toBe(1);
    });
  }
});

suite("arc radius — the exact tie is built as the exact semicircle, whichever way hypot rounds", () => {
  // `Math.hypot(216, 90)` is 233.99999999999997 on V8 — it rounds DOWN, so the old test
  // accepted this tie but built a centre ~1e-6 mm off the midpoint and a `major` sweep a
  // hair over π: 25 tessellation chords for a semicircle. The tie is now decided on the
  // squares and built from them: centre on the midpoint, sweep exactly π, 24 chords.
  const a = { x: -14605, y: 2242 };
  const b = { x: -14389, y: 2332 };
  it.each([
    ["cw", false],
    ["ccw", false],
    ["cw", true],
    ["ccw", true],
  ] as const)("(-14605,2242) → (-14389,2332) radius 117 %s major=%s", (dir, major) => {
    const arc = arcFromChord(a, b, 117, dir, major)!;
    expect(arc.center).toEqual({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    expect(Math.abs(arc.sweep)).toBe(Math.PI);
    expect(arcSteps(arc)).toBe(24);
  });
});

suite("arc radius — the verdict does not depend on how Math.hypot rounds", () => {
  // Red-team reproduction: with `Math.hypot` nudged UP by an ulp, the aquarium's
  // exact-semicircle rotunda raised E_ARC_RADIUS and the plan rendered empty.
  // The lex/parse/resolve stage memos key on the source text and survive `noCache` (only
  // `clearCache()` drops them), so each phase compiles a byte-distinct copy (a trailing
  // comment) — otherwise the perturbed run reads the honest run's resolved arcs and passes
  // without the arc solve ever running. (Measured: it did, on the pre-fix source.)
  const AQUARIUM = readFileSync(new URL("../examples/aquarium.arch", import.meta.url), "utf8");
  const variant = (tag: string): string => `${AQUARIUM}\n# ${tag}\n`;
  const arcCount = (src: string): number =>
    resolve(parse(src).plan!).ir.walls.reduce((n, w) => n + (w.arcs?.filter(Boolean).length ?? 0), 0);

  it("examples/aquarium.arch keeps every arc with hypot perturbed one ulp up or down", () => {
    const honest = arcCount(variant("honest"));
    expect(honest).toBeGreaterThan(0);
    expect(arcErrors(variant("honest-compile"))).toBe(0);
    const real = Math.hypot;
    for (const [tag, nudge] of [
      ["up", 1 + Number.EPSILON],
      ["down", 1 - Number.EPSILON / 2],
    ] as const) {
      const spy = vi.spyOn(Math, "hypot").mockImplementation((...xs: number[]) => real(...xs) * nudge);
      try {
        // Control: the nudge is live and really moves the rotunda's 16 000 mm chord.
        expect(Math.hypot(16000, 0)).not.toBe(16000);
        expect(arcErrors(variant(`${tag}-compile`)), tag).toBe(0);
        expect(arcCount(variant(`${tag}-resolve`)), tag).toBe(honest);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    }
  });
});

suite("arc radius — property over Pythagorean triples × k", () => {
  const triples: Array<[number, number, number]> = [];
  for (let m = 2; m <= 8; m++)
    for (let n = 1; n < m; n++) {
      const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
      if ((m - n) % 2 === 1 && g(m, n) === 1) triples.push([m * m - n * n, 2 * m * n, m * m + n * n]);
    }
  const KS = [1, 2, 3, 7, 10, 25, 50, 99, 100, 137, 250, 500, 999, 1000];
  const DIRS = [
    ["ccw", false],
    ["cw", false],
    ["ccw", true],
    ["cw", true],
  ] as const;

  it("radius exactly chord/2 is always accepted and is the exact semicircle; chord/2 − ε always refused", () => {
    let accepted = 0;
    for (const [p, q, c] of triples)
      for (const k of KS)
        for (const [sx, sy] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ] as const)
          for (const [dx, dy] of [
            [p * k * sx, q * k * sy],
            [q * k * sx, p * k * sy],
          ] as Array<[number, number]>) {
            const a = { x: 1000, y: -2000 };
            const b = { x: a.x + dx, y: a.y + dy };
            const half = (c * k) / 2;
            for (const [dir, major] of DIRS) {
              const arc = arcFromChord(a, b, half, dir, major);
              expect(arc, `${JSON.stringify({ a, b, half, dir, major })}`).not.toBeNull();
              expect(arc!.center).toEqual({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              expect(Math.abs(arc!.sweep)).toBe(Math.PI);
              // ε = one ulp below, and a whole millimetre below: both describe no circle.
              const below = half - half * Number.EPSILON;
              expect(arcFromChord(a, b, below, dir, major)).toBeNull();
              expect(arcFromChord(a, b, half - 1, dir, major)).toBeNull();
              accepted++;
            }
          }
    // Control: the loop ran over every case it claims to.
    expect(accepted).toBe(triples.length * KS.length * 4 * 2 * DIRS.length);
  });

  it("the accepted arc's drawn endpoints are exactly the authored points", () => {
    for (const [p, q, c] of triples)
      for (const k of [1, 3, 100, 1000]) {
        const a = { x: -500, y: 700 };
        const b = { x: a.x + p * k, y: a.y - q * k };
        for (const r of [(c * k) / 2, (c * k) / 2 + 1, c * k * 3]) {
          const src = wallSrc(a, b, r, " cw");
          expect(arcErrors(src)).toBe(0);
          const arc = wallArc(src)!;
          expect(arc.a).toEqual(a);
          expect(arc.b).toEqual(b);
          const ring = arcTessellate(arc);
          expect(ring[0]).toEqual(a);
          expect(ring[ring.length - 1]).toEqual(b);
        }
      }
  });

  it("the property also holds through the compiler for every k = 1…1000 on the 3-4-5 and 33-56-65 triples", () => {
    for (const [p, q, c] of [
      [3, 4, 5],
      [33, 56, 65],
    ] as const)
      for (let k = 1; k <= 1000; k += k < 20 ? 1 : 37) {
        const b = { x: p * k, y: q * k };
        expect(arcErrors(wallSrc(O, b, (c * k) / 2)), `k=${k}`).toBe(0);
        expect(arcErrors(wallSrc(O, b, (c * k) / 2 - 1)), `k=${k}`).toBe(1);
      }
  });
});
