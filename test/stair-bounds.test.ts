/**
 * A stair's `bounds()` covers its ink (D27). The break line's diagonals overshoot the flight's edges
 * by 6 % of its width, and `bounds()` is what the viewBox, the sheet fit, the drawing budget and the
 * range check read, so the two must agree on every stair, in every frame.
 *
 * The ink itself is pinned by `test/block-stair.test.ts` and every golden: it did not move.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as summary } from "../src/index.js";
import { MODEL_RANGE_MM } from "../src/num-format.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { resolveAll, type ResolvedElement } from "../src/ir.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";

const plan = (...lines: string[]): string => `plan "t" {\n  units mm\n${lines.join("\n")}\n}\n`;
const stairs = (src: string): ResolvedElement[] =>
  resolveAll(parse(src, BUILTIN_REGISTRY).plan!, BUILTIN_REGISTRY).ir.elements.filter((e) => e.kind === "stair");
const boundsOf = (el: ResolvedElement): Point[] => BUILTIN_REGISTRY.byKind.get("stair")!.bounds(el);

/** Every point of a line, polygon or path on the stair's layer. */
const inkPoints = (src: string): Point[] => {
  const scene = compile(src, { noCache: true, annotate: true }).scene!;
  const out: Point[] = [];
  for (const n of scene.nodes as SceneNode[]) {
    if (n.elementKind !== "stair") continue;
    const p = n.prim;
    if (p.t === "line") out.push(p.a, p.b);
    else if (p.t === "polygon") out.push(...p.pts);
  }
  return out;
};

const STRAIGHT = `stair id=s at (500,500) size 1000x3000 dir up`;
const LANDSCAPE = `stair id=s at (500,500) size 3000x1000 dir down`;
const NARROW = `stair id=s at (500,500) size 1600x3000 dir up width 1000`;
const NEAR_FULL = `stair id=s at (500,500) size 1050x3000 dir up width 1000`;
const BLOCK = `stair id=s dir up width 1000 {
    flight at (1500,1100) size 1000x1000
    landing at (1500,100) size 1000x1000
    flight at (500,100) size 1000x1000
  }`;

const FRAMES = ["", " rotate 90", " rotate 180", " rotate 270", " mirror x", " mirror y", " rotate 90 mirror x"];

describe("`bounds()` covers the stair's ink", () => {
  const cases: [string, string][] = [
    ["portrait", STRAIGHT],
    ["landscape", LANDSCAPE],
    ["a band narrower than the footprint", NARROW],
    ["a band nearly the footprint", NEAR_FULL],
    ["a block", BLOCK],
  ];

  it.each(cases)("%s, drawn on its own", (_n, stair) => {
    const src = plan(`  ${stair}`);
    const [el] = stairs(src);
    const pts = boundsOf(el!);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const ink = inkPoints(src);
    expect(ink.length).toBeGreaterThan(8);
    for (const p of ink) {
      expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(p.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(p.y).toBeLessThanOrEqual(Math.max(...ys));
    }
  });

  it.each(cases.flatMap(([n, s]) => FRAMES.map((f): [string, string, string] => [n, f, s])))(
    "%s, placed%s",
    (_n, frame, stair) => {
      const src = plan(`  component c() {\n  ${stair}\n  }`, `  place c() as p at (9000,9000)${frame}`);
      const [el] = stairs(src);
      const pts = boundsOf(el!);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const ink = inkPoints(src);
      expect(ink.length).toBeGreaterThan(8);
      for (const p of ink) {
        expect(p.x).toBeGreaterThanOrEqual(Math.min(...xs));
        expect(p.x).toBeLessThanOrEqual(Math.max(...xs));
        expect(p.y).toBeGreaterThanOrEqual(Math.min(...ys));
        expect(p.y).toBeLessThanOrEqual(Math.max(...ys));
      }
    },
  );

  it("reaches exactly as far as the ink, no further: 60 mm on a 1000 mm flight", () => {
    const src = plan(`  ${STRAIGHT}`);
    const xs = boundsOf(stairs(src)[0]!).map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(440, 6);
    expect(Math.max(...xs)).toBeCloseTo(1560, 6);
    const ink = inkPoints(src).map((p) => p.x);
    expect(Math.min(...xs)).toBe(Math.min(...ink));
    expect(Math.max(...xs)).toBe(Math.max(...ink));
  });

  it("a band well inside its footprint adds nothing past it", () => {
    const xs = boundsOf(stairs(plan(`  ${NARROW}`))[0]!).map((p) => p.x);
    expect(Math.min(...xs)).toBe(500);
    expect(Math.max(...xs)).toBe(2100);
  });

  it("only the cut flight of a block reaches past its pieces", () => {
    const pts = boundsOf(stairs(plan(`  ${BLOCK}`))[0]!);
    expect(pts.length).toBe(3 * 4 + 4);
  });

  it("a refused stair has a finite extent and adds no error of its own", () => {
    const refused = plan(`  stair id=s dir up width 1000 {\n    flight at (0,0) size 1000x1000\n  }`);
    expect(compile(refused, { noCache: true }).diagnostics.map((d) => d.code)).toEqual(["E_STAIR_PIECES"]);
    for (const p of boundsOf(stairs(refused)[0]!)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("what reads `bounds()`", () => {
  it("the viewBox holds the ink: a stair alone on the page frames its reach", () => {
    const wide = compile(plan(`  ${STRAIGHT}`), { noCache: true }).scene!.bounds;
    expect(wide.minX).toBeCloseTo(440, 6);
    expect(wide.maxX).toBeCloseTo(1560, 6);
  });

  it("a stair against a 200 mm wall does not reach past its face: nothing moves", () => {
    const shell = `  wall id=w exterior thickness 200 { (0,0) (1000,0) (1000,3000) (0,3000) close }`;
    const b = compile(plan(shell, `  stair id=s at (0,0) size 1000x3000 dir up`), { noCache: true }).scene!.bounds;
    expect(b.minX).toBe(-100);
    expect(b.maxX).toBe(1100);
  });

  it("a flight wider than its wall covers does reach past the face: 8 mm on an 1800 mm flight", () => {
    const shell = `  wall id=w exterior thickness 200 { (0,0) (1800,0) (1800,3000) (0,3000) close }`;
    const b = compile(plan(shell, `  stair id=s at (0,0) size 1800x3000 dir up`), { noCache: true }).scene!.bounds;
    expect(b.minX).toBeCloseTo(-108, 6);
    expect(b.maxX).toBeCloseTo(1908, 6);
  });

  it("`describe().bbox` reads walls and rooms, so the stair's reach never moves it", () => {
    const s = summary(plan(`  room id=r at (500,500) size 1000x3000`, `  ${STRAIGHT}`));
    expect(s.bbox).toEqual({ w: 1000, h: 3000 });
  });

  it("the range check is the law it says it is: past the range in ink is past the range", () => {
    // The footprint's corners stand inside the range, the break line's ends do not.
    const x = MODEL_RANGE_MM - 1020;
    const inside = plan(`  stair id=s at (${x - 100},0) size 1000x3000 dir up`);
    const past = plan(`  stair id=s at (${x},0) size 1000x3000 dir up`);
    expect(x + 1000).toBeLessThan(MODEL_RANGE_MM);
    expect(compile(inside, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("E_OUT_OF_RANGE");
    expect(compile(past, { noCache: true }).diagnostics.map((d) => d.code)).toContain("E_OUT_OF_RANGE");
  });

  it("the sheet fit reads the reach: `W_DRAWING_OVERFLOW` fires 60 mm sooner on a 1000 mm flight", () => {
    const sheet = (x: number): string =>
      `plan "t" {\n  units mm\n  paper a4 landscape\n  scale 1:100\n  room id=r at (0,0) size 10000x8000\n  stair id=s at (${x},0) size 1000x3000 dir up\n}\n`;
    const warns = (x: number): boolean =>
      compile(sheet(x), { noCache: true }).diagnostics.some((d) => d.code === "W_DRAWING_OVERFLOW");
    // The boundary was 25700 before the extent held the break line.
    expect(warns(25640)).toBe(false);
    expect(warns(25641)).toBe(true);
    expect(warns(25700)).toBe(true);
  });

  it("the drawing budget still holds an upper bound", () => {
    for (const stair of [STRAIGHT, NARROW, BLOCK]) {
      const src = plan(`  ${stair}`);
      const el = stairs(src)[0]!;
      const def = BUILTIN_REGISTRY.byKind.get("stair")!;
      const nodes = (compile(src, { noCache: true, annotate: true }).scene!.nodes as SceneNode[]).filter(
        (n) => n.elementKind === "stair",
      );
      expect(def.drawCost!(el) + def.bounds(el).length).toBeGreaterThanOrEqual(nodes.length);
    }
  });
});
