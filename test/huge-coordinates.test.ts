import { describe as suite, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compile, describe, lint } from "../src/index.js";
import { GridIndex } from "../src/geometry/grid-index.js";

/**
 * A finite coordinate far beyond any drawing must never make `compile()`, `describe()`
 * (including the symmetry and syntax facts) or `lint()` throw or spin, nor may the
 * circulation overlay. The language has no exponent syntax, so a magnitude is written as
 * its digits. Past 2^52 a grid cell index cannot be stepped one at a time, which used to
 * push into one bucket until `RangeError: Invalid array length`; a plan huge on one axis
 * and thin on the other used to size a nav/occupancy grid by its length; a layer with
 * more elements than the stack allows arguments used to overflow a spread.
 *
 * Behaviour is asserted, not time: the generous timeout only stops a hang.
 */
const digits = (n: number): string => "1" + "0".repeat(n);

/** Every surface that must not throw for `src`. */
const surfaces = (src: string): void => {
  // Not vacuous: the plan must PARSE, or every "does not throw" below proves nothing.
  expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("E_PARSE");
  expect(() => compile(src, { noCache: true, overlays: ["circulation"] })).not.toThrow();
  expect(() => describe(src)).not.toThrow();
  expect(() => describe(src, { facts: ["symmetry", "syntax"] })).not.toThrow();
  expect(() => lint(src)).not.toThrow();
};

const plans = (n: number): Record<string, string> => {
  const E = digits(n);
  return {
    room: `plan "H" {\n room id=a at (${E},0) size 3000x3000\n}`,
    wall: `plan "H" {\n wall exterior thickness 200 { (${E},0) (${E},3000) }\n door at (${E},1500) width 900\n}`,
    "wall + door at the origin, room far away": `plan "H" {\n wall exterior thickness 200 { (0,0) (3000,0) }\n room id=a at (${E},0) size 3000x3000\n door at (1500,0) width 900\n}`,
    mixed: `plan "H" {\n wall exterior thickness 200 { (0,0) (${E},0) (${E},3000) }\n room id=a at (0,0) size 3000x3000\n room id=b at (${E},${E}) size ${E}x${E}\n room id=c at (${E},0) size 3000x3000\n door at (1500,0) width 900\n window at (${E},1500) width 1200\n}`,
  };
};

suite("huge finite coordinates never throw", () => {
  for (const n of [17, 20, 100, 306]) {
    for (const [name, src] of Object.entries(plans(n))) {
      it(`1e${n}: ${name}`, () => surfaces(src), 120_000);
    }
  }
});

// Every magnitude above is now refused by the modelling range (`E_OUT_OF_RANGE`), so
// `describe()`/`lint()` stop at the error and never measure it. This suite keeps the same
// shapes at the largest magnitude the range admits, where every surface still draws and
// measures, so the bounded grids and loops are exercised, not skipped.
suite("the same shapes at the edge of the modelling range are drawn and measured", () => {
  const E = String(2 ** 24); // corners at E + E = 2^25, exactly on the bound
  const shapes: Record<string, string> = {
    room: `plan "H" {\n room id=a at (${E},0) size 3000x3000\n}`,
    wall: `plan "H" {\n wall exterior thickness 200 { (${E},0) (${E},3000) }\n door at (${E},1500) width 900\n}`,
    "wall + door at the origin, room far away": `plan "H" {\n wall exterior thickness 200 { (0,0) (3000,0) }\n room id=a at (${E},0) size 3000x3000\n door at (1500,0) width 900\n}`,
    mixed: `plan "H" {\n wall exterior thickness 200 { (0,0) (${E},0) (${E},3000) }\n room id=a at (0,0) size 3000x3000\n room id=b at (${E},${E}) size ${E}x${E}\n room id=c at (${E},0) size 3000x3000\n door at (1500,0) width 900\n window at (${E},1500) width 1200\n}`,
    "two rooms 2^24 apart": `plan "H" {\n room id=a at (0,0) size 3000x3000\n room id=b at (${E},0) size 3000x3000\n}`,
    "a polygon room 2^25 wide, with a door": `plan "H" {\n room id=p polygon (0,0) (${2 ** 25},0) (${2 ** 25},3000) (0,3000)\n door at (${E},0) width 900\n}`,
  };
  for (const [name, src] of Object.entries(shapes)) {
    it(name, () => {
      surfaces(src);
      expect(compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }, 120_000);
  }
});

suite("huge on one axis, thin on the other (nav and occupancy grids)", () => {
  for (const n of [17, 20, 100, 306]) {
    const E = digits(n);
    it(`two rooms 1e${n} apart`, () => {
      surfaces(`plan "H" {\n room id=a at (0,0) size 3000x3000\n room id=b at (${E},0) size 3000x3000\n}`);
    }, 120_000);
    it(`a polygon room 1e${n} wide, with a door`, () => {
      // The door puts a connector on the polygon's edge, which is what makes the
      // occupancy grid measure it (a room with no connector is skipped).
      surfaces(
        `plan "H" {\n room id=p polygon (0,0) (${E},0) (${E},3000) (0,3000)\n door at (${"5" + "0".repeat(n - 1)},0) width 900\n}`,
      );
    }, 120_000);
  }
});

suite("symmetry facts at the edge of the double range", () => {
  const E = digits(306);
  it("an arc wall with a 1e306 radius", () => {
    surfaces(
      `plan "H" {\n wall exterior thickness 200 { (0,0) arc (3000,0) radius ${E} (3000,3000) (0,3000) (0,0) }\n}`,
    );
  }, 120_000);
  it("a roof overhang of 1e306", () => {
    surfaces(
      `plan "H" {\n wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }\n roof overhang ${E}\n}`,
    );
  }, 120_000);
});

suite("a shipped example with every integer scaled by 1000", () => {
  // It used to render 129k furniture nodes (escalator chevrons) and overflow a spread; at
  // 90 km it is now refused by the modelling range before anything is drawn. The
  // render-a-huge-layer guard lives in `test/model-range.test.ts` (130 runs at the tread cap).
  it("transit-hall ×1000 is refused (E_OUT_OF_RANGE), never thrown", () => {
    const src = readFileSync(new URL("../examples/transit-hall.arch", import.meta.url), "utf8").replace(
      // Every integer, including both sides of a `WxH` size (the `x` is not a word break).
      /(?<![A-WYZa-wyz0-9_.])([0-9]+)(?![A-WYZa-wyz0-9_.])/g,
      (m: string) => String(BigInt(m) * 1000n),
    );
    surfaces(src);
    const codes = compile(src, { noCache: true })
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.code);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((c) => c === "E_OUT_OF_RANGE" || c === "E_RUN_TOO_LONG")).toBe(true);
  }, 300_000);
});

suite("GridIndex cells past 2^52", () => {
  it("inserts and queries a box at an unsteppable cell index without spinning", () => {
    const g = new GridIndex<string>(1);
    // 2^53 + 2 spans three representable cell indices that cx++ cannot walk.
    g.insert({ minX: 2 ** 53, minY: 0, maxX: 2 ** 53 + 2, maxY: 1 }, "far");
    g.insert({ minX: 1e306, minY: 1e306, maxX: 1e306, maxY: 1e306 }, "point");
    g.insert({ minX: 0, minY: 0, maxX: 5, maxY: 5 }, "near");
    expect(g.queryBox({ minX: 1, minY: 1, maxX: 2, maxY: 2 })).toEqual(["near", "far", "point"]);
    const seen: string[] = [];
    g.forEach({ minX: 2 ** 53, minY: 0, maxX: 2 ** 53 + 2, maxY: 1 }, (i) => seen.push(i));
    expect(seen).toContain("far");
    expect(g.queryBox({ minX: 1e306, minY: 1e306, maxX: 1e306, maxY: 1e306 })).toContain("point");
  });
});
