/**
 * `src/elements/glyphs-living.ts` — the living- and dining-room plan symbols.
 *
 * Four laws, and one of them is the reason this file exists rather than a snapshot.
 *
 * **1. A symbol stays inside its own footprint.** `furniture.render()` quarter-turns a glyph
 * about the footprint centre and `bounds()` reports the declared `WxH`, so a primitive drawn
 * outside that rectangle is a piece of furniture the plan does not know it has — it will
 * overlap a wall no lint rule is looking at. The walk below collects a DEFINING point set,
 * not a bounding box: an arc contributes its start, end, centre AND apex, and a circle its
 * bounding square, because a glyph drawn with a curve is exactly where a `pts`-only check
 * goes quietly vacuous (the same hole `test/furniture-rotate.test.ts` closed in `furnPoints`).
 * The arc CENTRE is in that set on purpose: `pointsOf` in `src/backends/ascii.ts` bounds an
 * arc by `[start, end, center]`, so an armchair whose back-arc centre sat below its box would
 * drag the ASCII plan's extents with it. That is the clamp `drawArmchair` documents.
 *
 * **2. Repeat counts are clamped, at absurd aspects included.** A sofa's cushion divisions
 * and a dining table's chairs are derived from the footprint's aspect, which is unbounded.
 * The counts are measured HERE by counting the primitives that were actually emitted — the
 * vertical division segments, the seat polygons — not by re-running the module's own formula,
 * so the assertions cannot agree with a wrong implementation.
 *
 * **3. The stool's symbol is rotation-symmetric, and provably so.** Both of its primitives are
 * true circles about the footprint centre, which is the same point `furniture.render()` pivots
 * about — so all four quarter-turns must be BYTE-identical, non-square footprints included.
 *
 * **4. A degenerate footprint produces finite geometry.** The property suite feeds shapes like
 * 10000 x 10; every measure here is a fraction of `r.w`/`r.h`, and a fraction of zero is the
 * `0/0` that turns a loop bound into `NaN`.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { DEFAULT_THEME } from "../src/theme.js";
import type { Point } from "../src/ast.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { fixtureGlyph } from "../src/elements/fixtures-glyphs.js";

/** Real pen sizes, taken from a real scene rather than invented. */
const SIZES: RenderSizes = toScene(
  resolve(parse(`plan "G" { units mm room id=r at (0,0) size 6000x5000 label "R" }`).plan!).ir,
).sizes;

/** The symbol for `category`, or a failure — every category below must actually draw. */
function glyph(category: string, r: Rect): SceneNode[] {
  const nodes = fixtureGlyph(category, r, DEFAULT_THEME, SIZES);
  if (nodes === null) throw new Error(`${category} draws no symbol`);
  return nodes;
}

/**
 * Every point that DEFINES a primitive's extent.
 *
 * Throws on any primitive kind a fixture symbol has no business emitting — `text` above all,
 * which is how the "no text prims" law is enforced for every case in the file at once rather
 * than in one assertion someone can forget to extend.
 */
function pointsOf(n: SceneNode): Point[] {
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return [...p.pts];
    case "line":
      return [p.a, p.b];
    case "circle":
      return [
        { x: p.center.x - p.r, y: p.center.y - p.r },
        { x: p.center.x + p.r, y: p.center.y + p.r },
      ];
    case "arc": {
      // The apex is the far point of the arc from its centre, through the chord midpoint.
      const mid = { x: (p.start.x + p.end.x) / 2, y: (p.start.y + p.end.y) / 2 };
      const dx = mid.x - p.center.x;
      const dy = mid.y - p.center.y;
      const len = Math.hypot(dx, dy);
      const apex = len > 0 ? [{ x: p.center.x + (dx / len) * p.r, y: p.center.y + (dy / len) * p.r }] : [];
      return [p.start, p.end, p.center, ...apex];
    }
    default:
      throw new Error(`a living-room glyph emitted an unexpected primitive: ${p.t}`);
  }
}

const allPoints = (nodes: SceneNode[]): Point[] => nodes.flatMap(pointsOf);

/** Assert every defining point of `nodes` lies inside `r`, to within a hair of float noise. */
function expectInside(nodes: SceneNode[], r: Rect, what: string): void {
  const eps = Math.max(r.w, r.h, 1) * 1e-9;
  for (const p of allPoints(nodes)) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: (${p.x}, ${p.y}) is not finite`).toBe(true);
    expect(p.x, `${what}: x`).toBeGreaterThanOrEqual(r.x - eps);
    expect(p.x, `${what}: x`).toBeLessThanOrEqual(r.x + r.w + eps);
    expect(p.y, `${what}: y`).toBeGreaterThanOrEqual(r.y - eps);
    expect(p.y, `${what}: y`).toBeLessThanOrEqual(r.y + r.h + eps);
  }
}

/**
 * One representative footprint per category, with the primitive count it must emit.
 *
 * The counts are written out rather than derived. A sofa is `5 + divisions` and a dining
 * table `2 + chairs`, and both of those variables get their own tests below; here the point
 * is that the COMMON case draws the number of pieces the module's doc comment claims.
 */
const CASES: readonly (readonly [string, Rect, number])[] = [
  ["sofa", { x: 1000, y: 1000, w: 2100, h: 900 }, 7], // aspect 2.33 → 2 divisions
  ["armchair", { x: 1000, y: 1000, w: 900, h: 850 }, 3],
  ["coffee_table", { x: 1000, y: 1000, w: 1200, h: 600 }, 2],
  ["table", { x: 1000, y: 1000, w: 1200, h: 800 }, 2],
  ["dining_table", { x: 1000, y: 1000, w: 2400, h: 2400 }, 6], // 1 per side + 2 ends = 4 chairs
  ["chair", { x: 1000, y: 1000, w: 450, h: 450 }, 3],
  ["stool", { x: 1000, y: 1000, w: 400, h: 400 }, 2],
  ["bench", { x: 1000, y: 1000, w: 1500, h: 400 }, 3],
  ["tv_unit", { x: 1000, y: 1000, w: 1500, h: 450 }, 3],
];

describe("glyphs-living — the drawing contract", () => {
  it.each(CASES)("%s draws %o as %i primitives, all inside its footprint", (category, r, count) => {
    const nodes = glyph(category, r);
    expect(nodes).toHaveLength(count);
    expectInside(nodes, r, category);
  });

  it.each(CASES)("%s uses only the two glyph pen weights, and outlines at least one in thin", (category, r) => {
    const nodes = glyph(category, r);
    const weights = nodes.map((n) => n.lineWeight);
    for (const w of weights) expect(["thin", "extraThin"]).toContain(w);
    // The heavier half of the ramp belongs to the built fabric; a fixture drawn at wall
    // weight would read as a wall. But a symbol with NO `thin` node has no outline at all.
    expect(weights, `${category} must have an outline`).toContain("thin");
  });

  it.each(CASES)("%s emits no text primitive", (category, r) => {
    // `pointsOf` throws on `text`; this states the law where a reader will look for it.
    for (const n of glyph(category, r)) expect(n.prim.t).not.toBe("text");
  });

  it.each(CASES)("%s is a deterministic function of its inputs", (category, r) => {
    expect(glyph(category, r)).toEqual(glyph(category, r));
  });

  it.each(CASES)("%s draws on the furniture layer", (category, r) => {
    for (const n of glyph(category, r)) expect(n.layer).toBe("furniture");
  });
});

describe("glyphs-living — through the compiler, at all four quarter-turns", () => {
  // Declared 2100 x 900 at (1000,1000): x ∈ [1000,3100], y ∈ [1000,1900] whatever the turn,
  // because `furniture.render()` swaps the pre-rotation extents for 90/270.
  const AT = { x: 1000, y: 1000, w: 2100, h: 900 };
  const plan = (category: string, deg: number): string =>
    `plan "P" { units mm room id=r at (0,0) size 6000x5000 label "R" ` +
    `furniture ${category} at (${AT.x},${AT.y}) size ${AT.w}x${AT.h} rotate ${deg} }`;

  const furnitureNodes = (src: string): SceneNode[] =>
    toScene(resolve(parse(src).plan!).ir).nodes.filter((n) => n.layer === "furniture");

  it.each(CASES.map(([c]) => c))("%s compiles clean and stays in its footprint at 0/90/180/270", (category) => {
    for (const deg of [0, 90, 180, 270]) {
      const src = plan(category, deg);
      const out = compile(src, { noCache: true });
      expect(out.errors, `${category} rotate ${deg}`).toEqual([]);
      expect(out.svg.length).toBeGreaterThan(0);
      const nodes = furnitureNodes(src);
      expect(nodes.length, `${category} rotate ${deg} drew nothing`).toBeGreaterThan(0);
      expectInside(nodes, AT, `${category} rotate ${deg}`);
    }
  });
});

describe("glyphs-living — the sofa's cushion divisions", () => {
  /** The division lines actually emitted: the vertical segments between the arms. */
  const divisions = (r: Rect): number =>
    glyph("sofa", r).filter((n) => n.prim.t === "line" && n.prim.a.x === n.prim.b.x).length;

  it("a square sofa clamps DOWN to the two-division floor", () => {
    // round(1 × 0.9) = 1, below the floor of 2.
    expect(divisions({ x: 0, y: 0, w: 900, h: 900 })).toBe(2);
    expect(glyph("sofa", { x: 0, y: 0, w: 900, h: 900 })).toHaveLength(7);
  });

  it("divisions track the aspect between the clamps", () => {
    expect(divisions({ x: 0, y: 0, w: 2100, h: 900 })).toBe(2); // 2.33 × 0.9 = 2.1
    expect(divisions({ x: 0, y: 0, w: 3600, h: 900 })).toBe(4); // 4 × 0.9 = 3.6
    expect(divisions({ x: 0, y: 0, w: 5400, h: 900 })).toBe(5); // 6 × 0.9 = 5.4
  });

  it("a wide sofa clamps UP to six, and an absurd one is still six", () => {
    expect(divisions({ x: 0, y: 0, w: 6300, h: 900 })).toBe(6); // 7 × 0.9 = 6.3
    expect(divisions({ x: 0, y: 0, w: 63000, h: 900 })).toBe(6); // 70 × 0.9 = 63
    const absurd = { x: 0, y: 0, w: 10000, h: 10 };
    expect(divisions(absurd)).toBe(6); // 1000 × 0.9 = 900
    expect(glyph("sofa", absurd)).toHaveLength(11);
    expectInside(glyph("sofa", absurd), absurd, "absurd sofa");
  });
});

describe("glyphs-living — the dining table's chairs", () => {
  /** The seats actually emitted: everything after the table top and its inset edge. */
  const chairs = (r: Rect): number => glyph("dining_table", r).length - 2;

  it("a square table seats one per side plus both ends — the four-seater", () => {
    expect(chairs({ x: 0, y: 0, w: 2400, h: 2400 })).toBe(4);
  });

  it("chairs per LONG side track the aspect", () => {
    expect(chairs({ x: 0, y: 0, w: 3000, h: 2000 })).toBe(6); // 1.5 × 1.2 = 1.8 → 2/side + 2 ends
    expect(chairs({ x: 0, y: 0, w: 6000, h: 2000 })).toBe(8); // 3 × 1.2 = 3.6 → 4/side, no ends
    expect(chairs({ x: 0, y: 0, w: 10000, h: 2000 })).toBe(12); // 5 × 1.2 = 6 → 6/side, no ends
  });

  it("the short-end chairs appear strictly BELOW aspect 2", () => {
    // Same 2 chairs per long side either side of the boundary; only the ends move.
    expect(chairs({ x: 0, y: 0, w: 3990, h: 2000 })).toBe(6); // aspect 1.995 → ends drawn
    expect(chairs({ x: 0, y: 0, w: 4000, h: 2000 })).toBe(4); // aspect 2.000 → no ends
  });

  it("a portrait table is the landscape one turned — the long edges are found, not assumed", () => {
    expect(chairs({ x: 0, y: 0, w: 2000, h: 3000 })).toBe(6);
    expect(chairs({ x: 0, y: 0, w: 2000, h: 6000 })).toBe(8);
  });

  it("an absurd aspect clamps at eight per side and stays inside the footprint", () => {
    const absurd = { x: 0, y: 0, w: 10000, h: 10 };
    expect(chairs(absurd)).toBe(16); // 1000 × 1.2 → clamped to 8 per long side, no ends
    expectInside(glyph("dining_table", absurd), absurd, "absurd dining table");
  });

  it("every seat is drawn inside the chair-zone band, never on the table", () => {
    // Band = 0.22 × min(w,h) = 440 on a 3000 × 2000 table; the top is the inner rectangle.
    const r = { x: 0, y: 0, w: 3000, h: 2000 };
    const band = 440;
    const seats = glyph("dining_table", r).slice(2);
    expect(seats).toHaveLength(6);
    for (const s of seats) {
      const pts = pointsOf(s);
      const onTable = pts.every(
        (p) => p.x > r.x + band && p.x < r.x + r.w - band && p.y > r.y + band && p.y < r.y + r.h - band,
      );
      expect(onTable, "a seat was drawn on the table top").toBe(false);
    }
  });
});

describe("glyphs-living — the stool is rotation-symmetric", () => {
  const stool = (w: number, h: number, deg: number): string =>
    `plan "P" { units mm room id=r at (0,0) size 4000x4000 label "R" ` +
    `furniture stool at (1000,1000) size ${w}x${h} rotate ${deg} }`;

  it("all four quarter-turns are byte-identical, square footprint", () => {
    const base = compile(stool(400, 400, 0), { noCache: true }).svg;
    for (const deg of [90, 180, 270]) {
      expect(compile(stool(400, 400, deg), { noCache: true }).svg, `rotate ${deg}`).toBe(base);
    }
  });

  it("…and on a NON-square footprint too, which is what proves it is structural", () => {
    // A rectangular declaration still yields one disc of radius min(w,h)/2 about the same
    // centre, so the turn maps the symbol onto itself rather than onto a lucky look-alike.
    const base = compile(stool(400, 600, 0), { noCache: true }).svg;
    for (const deg of [90, 180, 270]) {
      expect(compile(stool(400, 600, deg), { noCache: true }).svg, `rotate ${deg}`).toBe(base);
    }
  });

  it("is two concentric circles, the inner at 0.6 of the outer", () => {
    const nodes = glyph("stool", { x: 100, y: 200, w: 400, h: 400 });
    expect(nodes).toHaveLength(2);
    const circles = nodes.map((n) => {
      if (n.prim.t !== "circle") throw new Error("a stool must be drawn with true circles");
      return n.prim;
    });
    for (const c of circles) expect(c.center).toEqual({ x: 300, y: 400 });
    expect(circles[0]!.r).toBe(200);
    expect(circles[1]!.r).toBeCloseTo(120, 9);
  });
});

describe("glyphs-living — degenerate footprints", () => {
  const DEGENERATE: readonly Rect[] = [
    { x: 0, y: 0, w: 0, h: 0 },
    { x: 500, y: 500, w: 0, h: 900 },
    { x: 500, y: 500, w: 900, h: 0 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 10, h: 10000 },
    { x: -1000, y: -1000, w: 1, h: 1 },
  ];

  it.each(CASES.map(([c]) => c))("%s stays finite, bounded and text-free on every degenerate rect", (category) => {
    for (const r of DEGENERATE) {
      const nodes = glyph(category, r);
      const where = `${category} at ${r.w}x${r.h}`;
      // A clamped repeat count is what keeps this bounded: an unclamped aspect-derived
      // count would emit hundreds of lines into the 10000 × 10 case.
      expect(nodes.length, where).toBeGreaterThanOrEqual(2);
      expect(nodes.length, where).toBeLessThanOrEqual(20);
      for (const n of nodes) {
        if (n.prim.t === "circle" || n.prim.t === "arc") {
          expect(Number.isFinite(n.prim.r), `${where}: radius`).toBe(true);
        }
      }
      expectInside(nodes, r, where);
    }
  });
});
