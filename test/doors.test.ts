import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/**
 * The door swing arc is an SVG elliptical-arc whose *sweep-flag* (the 6th
 * parameter of `A rx ry x-rot large-arc sweep x y`) encodes which way the leaf
 * opens. It is computed in src/elements/door.ts from the sign of a 2D cross
 * product of (leafEnd - hinge) × (farJamb - hinge):
 *
 *   left/in  →  sign(n×d)        left/out →  -sign(n×d)
 *   right/in → -sign(n×d)        right/out →  sign(n×d)
 *
 * So flipping EITHER hinge or swing flips the sweep, and the two are
 * diagonally symmetric: left/in == right/out and left/out == right/in.
 * That relationship holds regardless of how `normal()` is oriented, which is
 * what we assert here.
 */
const plan = (hinge: string, swing: string) =>
  [
    'plan "D" {',
    "  wall exterior thickness 200 { (0,0) (4000,0) }",
    `  door id=d at (2000,0) width 900 wall exterior hinge ${hinge} swing ${swing}`,
    "}",
  ].join("\n");

function sweepOf(hinge: string, swing: string): string {
  const { svg, errors } = compile(plan(hinge, swing), { noCache: true });
  expect(errors).toEqual([]);
  // `A <rx> <ry> 0 0 <sweep> ` — capture the sweep flag.
  const m = svg.match(/A [\d.]+ [\d.]+ 0 0 ([01]) /);
  expect(m, `expected a swing arc for ${hinge}/${swing}`).not.toBeNull();
  return m![1];
}

describe("door swing — all four hinge×swing combos", () => {
  const li = sweepOf("left", "in");
  const lo = sweepOf("left", "out");
  const ri = sweepOf("right", "in");
  const ro = sweepOf("right", "out");

  it("renders a valid sweep flag (0 or 1) for every combo", () => {
    for (const s of [li, lo, ri, ro]) expect(["0", "1"]).toContain(s);
  });

  it("uses both sweep directions — the four are not all identical", () => {
    const set = new Set([li, lo, ri, ro]);
    expect(set.has("0")).toBe(true);
    expect(set.has("1")).toBe(true);
  });

  it("flips the sweep when swing flips (same hinge)", () => {
    expect(li).not.toBe(lo);
    expect(ri).not.toBe(ro);
  });

  it("flips the sweep when hinge flips (same swing)", () => {
    expect(li).not.toBe(ri);
    expect(lo).not.toBe(ro);
  });

  it("is diagonally symmetric: left/in == right/out, left/out == right/in", () => {
    expect(li).toBe(ro);
    expect(lo).toBe(ri);
  });
});
