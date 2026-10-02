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
 * arc by `[start, end, center]`, so a glyph arc whose centre sat outside its box would drag the
 * ASCII plan's extents with it. A `path` (the curved outlines) contributes its vertices and its
 * arcs' axis extremes but NOT its centres — on a closed outline the centre is a construction
 * point, and ascii's `pointsOf` reads a path's curve, not its centres (`test/glyph-extent.ts`).
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
import { CANONICAL_FIXTURES, fixtureGlyph, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import * as living from "../src/elements/glyphs-living.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import { fixtureSpec } from "../src/fixtures-catalog.js";
import { rotateNode } from "../src/elements/furniture.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { pathExtentPoints } from "./glyph-extent.js";

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
    case "path":
      return pathExtentPoints(p);
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
  // The visual-polish redraw: body + two arms + one back and one seat cushion per seat.
  ["sofa", { x: 1000, y: 1000, w: 2100, h: 900 }, 9], // seat 1764 / (0.62 × 900) → 3 cushions
  ["armchair", { x: 1000, y: 1000, w: 900, h: 850 }, 5], // the same anatomy, one cushion
  // The visual-polish redraws. Each count is the drawing in the module's doc comment; the
  // drawing-specific laws are pinned in their own describes further down rather than left to
  // these numbers.
  ["coffee_table", { x: 1000, y: 1000, w: 1200, h: 600 }, 2], // top + white inset panel
  ["table", { x: 1000, y: 1000, w: 1200, h: 800 }, 2], // top + bevel (the dining table's top)
  ["dining_table", { x: 1000, y: 1000, w: 2400, h: 2400 }, 10], // top + bevel + 4 chairs × (seat, back)
  ["chair", { x: 1000, y: 1000, w: 450, h: 450 }, 2], // seat + backrest bar
  ["stool", { x: 1000, y: 1000, w: 400, h: 400 }, 2], // seat + footrest ring
  ["bench", { x: 1000, y: 1000, w: 1500, h: 400 }, 4], // slab + 3 board joints (400/1500 × 12 = 3.2)
  ["tv_unit", { x: 1000, y: 1000, w: 1500, h: 450 }, 8], // carcass + 2 splits + 3 pulls + TV foot + panel
  // The living additions, at their catalogued footprints.
  ["fireplace", { x: 1000, y: 1000, w: 1200, h: 400 }, 4], // breast+hearth, seam, firebox, grate
  ["radiator", { x: 1000, y: 1000, w: 1000, h: 100 }, 14], // 1 + 13 fins (1000 / 75 = 13.3)
  ["sideboard", { x: 1000, y: 1000, w: 1600, h: 450 }, 8], // carcass + 3 splits + 4 pulls
  ["loveseat", { x: 1000, y: 1000, w: 1500, h: 850 }, 7], // the sofa body at a PINNED two cushions
  ["chaise", { x: 1000, y: 1000, w: 1600, h: 800 }, 6], // body + arm + 3 back cushions + the seat
  ["tv", { x: 1000, y: 1000, w: 1200, h: 80 }, 2], // panel + bracket
  ["coat_rack", { x: 1000, y: 1000, w: 400, h: 400 }, 10], // base + 4 arms + 4 knobs + pole
  ["shoe_cabinet", { x: 1000, y: 1000, w: 800, h: 300 }, 6], // carcass + 2 splits + 3 pulls
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

describe("glyphs-living — the sofa's cushions", () => {
  /** The cushions actually emitted: the white (basin) shapes come in back + seat pairs. */
  const cushions = (category: string, r: Rect): number =>
    glyph(category, r).filter((n) => n.paint.fill === DEFAULT_THEME.opening).length / 2;

  it("one seat cushion per 0.62 depths of seat, between the arms", () => {
    // arms = clamp(0.08 w, 0.12 d, 0.22 d); seat = w − 2 arms; n = round(seat / 0.62 d).
    expect(cushions("sofa", { x: 0, y: 0, w: 1500, h: 900 })).toBe(2); // 1260 / 558 = 2.3
    expect(cushions("sofa", { x: 0, y: 0, w: 1800, h: 900 })).toBe(3); // 1512 / 558 = 2.7
    expect(cushions("sofa", { x: 0, y: 0, w: 2100, h: 900 })).toBe(3); // 1764 / 558 = 3.2
    expect(cushions("sofa", { x: 0, y: 0, w: 2400, h: 900 })).toBe(4); // 2016 / 558 = 3.6
  });

  it("clamps to one cushion at the bottom and four at the top, and an absurd sofa is still four", () => {
    expect(cushions("sofa", { x: 0, y: 0, w: 900, h: 900 })).toBe(1);
    expect(cushions("sofa", { x: 0, y: 0, w: 63000, h: 900 })).toBe(4);
    const absurd = { x: 0, y: 0, w: 10000, h: 10 };
    expect(cushions("sofa", absurd)).toBe(4);
    expect(glyph("sofa", absurd)).toHaveLength(11);
    expectInside(glyph("sofa", absurd), absurd, "absurd sofa");
  });

  it("draws the body first as the outline, then two full-depth arms, then the cushions", () => {
    const r = { x: 0, y: 0, w: 2100, h: 900 };
    const n = glyph("sofa", r);
    expect(n.map((x) => x.prim.t)).toEqual(Array(9).fill("path"));
    expect(n.slice(0, 3).map((x) => [x.paint.fill, x.lineWeight])).toEqual(
      Array(3).fill([DEFAULT_THEME.furnitureFill, "thin"]),
    );
    expect(n.slice(3).every((x) => x.paint.fill === DEFAULT_THEME.opening && x.lineWeight === "extraThin")).toBe(true);
    // Each arm runs the full depth of the footprint.
    for (const arm of n.slice(1, 3)) {
      const ys = pointsOf(arm).map((p) => p.y);
      expect(Math.min(...ys)).toBeCloseTo(r.y, 9);
      expect(Math.max(...ys)).toBeCloseTo(r.y + r.h, 9);
    }
  });

  it("is mirror-symmetric — a sofa has no hand", () => {
    const r = { x: 0, y: 0, w: 2400, h: 900 };
    const n = glyph("sofa", r);
    expect(
      marksEqual(
        n,
        n.map((x) => mirrorNode(x, r.w / 2)),
      ),
    ).toBe(true);
  });
});

describe("glyphs-living — the dining table's chairs", () => {
  /** The chairs actually emitted: two shapes each (seat, backrest) after the top and its bevel. */
  const chairs = (r: Rect): number => (glyph("dining_table", r).length - 2) / 2;

  it("a square table seats one per side plus both ends — the four-seater", () => {
    expect(chairs({ x: 0, y: 0, w: 2400, h: 2400 })).toBe(4);
  });

  it("chairs per LONG side track the top's length, and every table has one at each end", () => {
    // band = 0.22 × short side; one chair per 2.2 bands of top length, [1, 4], plus two ends.
    expect(chairs({ x: 0, y: 0, w: 2400, h: 2000 })).toBe(6); // top 1520 / 968 = 1.6 → 2/side
    expect(chairs({ x: 0, y: 0, w: 2000, h: 1000 })).toBe(8); // top 1560 / 484 = 3.2 → 3/side
    expect(chairs({ x: 0, y: 0, w: 3000, h: 2000 })).toBe(6); // top 2120 / 968 = 2.2 → 2/side
    expect(chairs({ x: 0, y: 0, w: 6000, h: 2000 })).toBe(10); // top 5120 / 968 = 5.3 → 4/side (clamped)
    expect(chairs({ x: 0, y: 0, w: 10000, h: 2000 })).toBe(10);
  });

  it("a portrait table is the landscape one turned — the long edges are found, not assumed", () => {
    expect(chairs({ x: 0, y: 0, w: 2000, h: 3000 })).toBe(6);
    expect(chairs({ x: 0, y: 0, w: 2000, h: 6000 })).toBe(10);
  });

  it("an absurd aspect clamps at four per side and stays inside the footprint", () => {
    const absurd = { x: 0, y: 0, w: 10000, h: 10 };
    expect(chairs(absurd)).toBe(10);
    expectInside(glyph("dining_table", absurd), absurd, "absurd dining table");
  });

  it("draws the top FIRST (the outline), and every chair in the band, meeting the table's edge", () => {
    // Band = 0.22 × min(w,h) = 440 on a 3000 × 2000 table; the top is the inner rectangle.
    const r = { x: 0, y: 0, w: 3000, h: 2000 };
    const band = 440;
    const top = { x0: r.x + band, y0: r.y + band, x1: r.x + r.w - band, y1: r.y + r.h - band };
    const nodes = glyph("dining_table", r);
    expect(nodes[0]!.paint.fill).toBe(DEFAULT_THEME.furnitureFill);
    expect(nodes[0]!.lineWeight).toBe("thin");
    const eps = 1e-6;
    const seats = nodes.slice(2);
    expect(seats).toHaveLength(12);
    for (const s of seats) {
      for (const p of pointsOf(s)) {
        const onTable = p.x > top.x0 + eps && p.x < top.x1 - eps && p.y > top.y0 + eps && p.y < top.y1 - eps;
        expect(onTable, "a chair was drawn on the table top").toBe(false);
      }
    }
    // Never floating: every seat (the white shape of each pair) touches the table's edge.
    for (const s of seats.filter((n) => n.paint.fill === DEFAULT_THEME.opening)) {
      const touches = pointsOf(s).some(
        (p) =>
          ((Math.abs(p.y - top.y0) < eps || Math.abs(p.y - top.y1) < eps) && p.x >= top.x0 && p.x <= top.x1) ||
          ((Math.abs(p.x - top.x0) < eps || Math.abs(p.x - top.x1) < eps) && p.y >= top.y0 && p.y <= top.y1),
      );
      expect(touches, "a seat floats detached from the table").toBe(true);
    }
  });

  it("maps onto itself under a half-turn and a mirror at any size and absolute position", () => {
    // The backrest bars are stadiums; their shape must not depend on which ulp path a chair's
    // position took (the reported failure: a half-turn at 1000x1000 and 3000x1500). Placed the
    // way `furniture.render()` places a piece: `x = cx − w/2` with `cx = at + w/2`.
    for (const [w, h] of [
      [1000, 1000],
      [3000, 1500],
      [2400, 2000],
      [1800, 1000],
      [640, 640],
      [777, 777],
      [555, 900],
      [1, 1],
      [400, 400],
      [2400, 2400],
    ] as const) {
      for (const o of [0, 100, 1000, 12345.678]) {
        const c = { x: o + w / 2, y: o + h / 2 };
        const n = glyph("dining_table", { x: c.x - w / 2, y: c.y - h / 2, w, h });
        const where = `${w}x${h} at ${o}`;
        expect(
          marksEqual(
            n,
            n.map((x) => rotateNode(x, c, 180)),
          ),
          `${where} half-turn`,
        ).toBe(true);
        expect(
          marksEqual(
            n,
            n.map((x) => mirrorNode(x, c.x)),
          ),
          `${where} mirror`,
        ).toBe(true);
        if (w === h)
          expect(
            marksEqual(
              n,
              n.map((x) => rotateNode(x, c, 90)),
            ),
            `${where} quarter-turn`,
          ).toBe(true);
      }
    }
  });

  it("the square four-seater maps onto itself under a quarter-turn and a mirror (the catalog's `symmetric`)", () => {
    const r = { x: 500, y: 700, w: 2400, h: 2400 };
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const n = glyph("dining_table", r);
    for (const deg of [90, 180, 270])
      expect(
        marksEqual(
          n,
          n.map((x) => rotateNode(x, c, deg)),
        ),
        `${deg}`,
      ).toBe(true);
    expect(
      marksEqual(
        n,
        n.map((x) => mirrorNode(x, c.x)),
      ),
    ).toBe(true);
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

  it("is TWO concentric circles — the white seat, and the footrest ring standing proud of it", () => {
    // The concentricity is what makes the quarter-turn byte-identical rather than merely
    // indistinguishable. The obvious alternative — a ring of three or four foot dots — maps onto
    // itself as a SET while each node lands where its neighbour was, so the bytes would move; the
    // two tests above would fail and the shipped goldens would move for a drawing nobody can tell
    // apart.
    const nodes = glyph("stool", { x: 100, y: 200, w: 400, h: 400 });
    expect(nodes).toHaveLength(2);
    const circles = nodes.map((n) => {
      if (n.prim.t !== "circle") throw new Error("a stool must be drawn with true circles");
      return n.prim;
    });
    for (const c of circles) expect(c.center).toEqual({ x: 300, y: 400 });
    // The seat: upholstered (white), the outline pen, first — the symbol's primary node.
    expect(nodes[0]!.paint.fill).toBe(DEFAULT_THEME.opening);
    expect(nodes[0]!.lineWeight).toBe("thin");
    expect(circles[0]!.r).toBeCloseTo(152, 9); // 0.76 of the radius
    // The footrest: an unfilled detail ring OUTSIDE the seat, a clear band away from it, so the
    // two never merge into one heavy line at 1:100.
    expect(nodes[1]!.paint.fill).toBe("none");
    expect(nodes[1]!.lineWeight).toBe("extraThin");
    expect(circles[1]!.r).toBe(200); // the FULL radius: the footrest is the widest part of a stool
    expect(circles[1]!.r - circles[0]!.r).toBeGreaterThan(0.1 * 200);
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
      // The ceiling is the dining table at its clamp: top + bevel + 10 chairs × 2.
      expect(nodes.length, where).toBeGreaterThanOrEqual(2);
      expect(nodes.length, where).toBeLessThanOrEqual(22);
      for (const n of nodes) {
        if (n.prim.t === "circle" || n.prim.t === "arc") {
          expect(Number.isFinite(n.prim.r), `${where}: radius`).toBe(true);
        }
        if (n.prim.t === "path") {
          for (const lp of n.prim.loops)
            for (const e of lp.edges) if (e.t === "arc") expect(Number.isFinite(e.r), `${where}: radius`).toBe(true);
        }
      }
      expectInside(nodes, r, where);
    }
  });
});

// ---------------------------------------------------------------------------
// ── the redrawn tables, bench and cabinets, and the eight living families ──

describe("glyphs-living — the two tables are a hard top and one inner line, with nothing under them", () => {
  const ASPECTS: readonly Rect[] = [
    { x: 0, y: 0, w: 1200, h: 600 },
    { x: 0, y: 0, w: 600, h: 1200 },
    { x: 0, y: 0, w: 900, h: 900 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 1, h: 1 },
  ];

  it.each(["coffee_table", "table"])("%s draws no corner dots and no leaf line, at any aspect", (category) => {
    // A table's legs are UNDER its top, and four dots at the corners read as drains on a slab.
    for (const r of ASPECTS) {
      const kinds = glyph(category, r).map((n) => n.prim.t);
      expect(kinds, `${category} ${r.w}x${r.h}`).toEqual(["path", "path"]);
    }
  });

  it("the table is the dining table's top exactly: a hard top and an unfilled bevel 3% in", () => {
    const r = { x: 100, y: 200, w: 1600, h: 900 };
    const [top, bevel] = glyph("table", r);
    expect([top!.paint.fill, top!.lineWeight]).toEqual([DEFAULT_THEME.furnitureFill, "thin"]);
    expect([bevel!.paint.fill, bevel!.lineWeight]).toEqual(["none", "extraThin"]);
    const xs = pointsOf(bevel!).map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(r.x + 900 * 0.03, 9); // keyed to the SHORT side
    // A dining table whose inner top is this rectangle draws these two nodes first.
    const band = 0.22 / (1 - 2 * 0.22); // the dining band as a fraction of the TOP's short side
    const dining = glyph("dining_table", {
      x: r.x - 900 * band,
      y: r.y - 900 * band,
      w: r.w + 2 * 900 * band,
      h: r.h + 2 * 900 * band,
    });
    const key = (n: SceneNode): string => JSON.stringify(pointsOf(n).map((p) => [p.x.toFixed(6), p.y.toFixed(6)]));
    expect(key(dining[0]!)).toBe(key(top!));
    expect(key(dining[1]!)).toBe(key(bevel!));
  });

  it("the coffee table is told from it by a softer corner and a WHITE inset panel a tenth in", () => {
    const r = { x: 0, y: 0, w: 1200, h: 600 };
    const [top, panel] = glyph("coffee_table", r);
    expect(top!.paint.fill).toBe(DEFAULT_THEME.furnitureFill);
    expect([panel!.paint.fill, panel!.lineWeight]).toEqual([DEFAULT_THEME.opening, "extraThin"]);
    expect(Math.min(...pointsOf(panel!).map((p) => p.y))).toBeCloseTo(60, 9); // 0.1 × the short side
    const corner = (category: string): number => {
      const n = glyph(category, r)[0]!;
      if (n.prim.t !== "path") throw new Error("a table top is a path");
      return n.prim.loops[0]!.edges.flatMap((e) => (e.t === "arc" ? [e.r] : []))[0]!;
    };
    expect(corner("coffee_table")).toBeGreaterThan(2 * corner("table"));
  });
});

describe("glyphs-living — every `symmetric` family in this module is D4-invariant on a square footprint", () => {
  /**
   * The module's families, DERIVED: a catalogued word belongs here when one of the module's own
   * exported `draw*` functions draws exactly what the dispatch draws for it. The `symmetric` set
   * is then read off the catalog flag — so a new family in this module that carries the flag is
   * tested here without anyone remembering to add it.
   */
  const PROBE: Rect = { x: 37, y: 11, w: 1300, h: 900 };
  const drawers = Object.entries(living).filter(
    (e): e is [string, (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[]] =>
      e[0].startsWith("draw") && typeof e[1] === "function",
  );
  const inModule = (category: string): boolean => {
    const want = JSON.stringify(glyph(category, PROBE));
    return drawers.some(([, draw]) => JSON.stringify(draw(PROBE, glyphCtx(DEFAULT_THEME, SIZES))) === want);
  };
  const SYMMETRIC = CANONICAL_FIXTURES.filter((c) => fixtureSpec(c)?.symmetric === true && inModule(c));

  it("finds the module's symmetric families (the sweep below is not vacuous)", () => {
    for (const c of ["coffee_table", "table", "dining_table", "stool", "rug", "coat_rack"]) {
      expect(SYMMETRIC, c).toContain(c);
    }
  });

  const SQUARES: readonly Rect[] = [
    { x: 500, y: 700, w: 1000, h: 1000 },
    { x: -250, y: 90, w: 400, h: 400 },
    { x: 1234.5, y: 678.25, w: 2400, h: 2400 },
    { x: 3, y: 5, w: 1, h: 1 },
  ];

  const invariantOnSquares = (category: string): void => {
    for (const r of SQUARES) {
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      const n = glyph(category, r);
      const at = `${category} ${r.w}x${r.h}`;
      for (const deg of [90, 180, 270]) {
        expect(
          marksEqual(
            n,
            n.map((x) => rotateNode(x, c, deg)),
          ),
          `${at} turned ${deg}`,
        ).toBe(true);
      }
      expect(
        marksEqual(
          n,
          n.map((x) => mirrorNode(x, c.x)),
        ),
        `${at} mirrored`,
      ).toBe(true);
    }
  };

  /**
   * A KNOWN DEFECT, pinned rather than skipped: the dining chair's backrest is a stadium
   * (`roundedRectPath` with a radius of half its depth), and `roundedRectPath` drops a used-up
   * straight run only on EXACT float equality — so at some absolute positions a chair gains a
   * sub-micron straight edge between its end arcs and a turned chair does not. The drawing is
   * the same; the canonical spelling `marksEqual` compares is not, so the table reads as handed
   * there. `it.fails` turns red the day the helper compares with a tolerance — delete this entry
   * then.
   */
  const KNOWN_DEFECT: ReadonlySet<string> = new Set(["dining_table"]);

  it.each(SYMMETRIC.filter((c) => !KNOWN_DEFECT.has(c)))(
    "%s maps onto itself under every quarter-turn and a mirror",
    invariantOnSquares,
  );

  for (const category of SYMMETRIC.filter((c) => KNOWN_DEFECT.has(c))) {
    it.fails(`${category} does not yet (a float-equality edge in roundedRectPath; see KNOWN_DEFECT)`, () =>
      invariantOnSquares(category));
  }
});

describe("glyphs-living — the bench's boards", () => {
  const segs = (r: Rect) => glyph("bench", r).flatMap((n) => (n.prim.t === "line" ? [n.prim] : []));

  it("draws a clamped run of board joints running LENGTHWISE, and nothing across them", () => {
    // 1500x400: short/long = 0.267, x12 = 3.2 → 3 joints. No end supports: a support is under the
    // seat, and a solid line across the boards would say the opposite.
    const s = segs({ x: 0, y: 0, w: 1500, h: 400 });
    expect(s).toHaveLength(3);
    expect(s.filter((p) => p.a.y === p.b.y)).toHaveLength(3);
    // Each joint runs the full length of the slab.
    for (const p of s) expect(Math.abs(p.b.x - p.a.x)).toBeCloseTo(1500, 9);
  });

  it("clamps the joint count at both ends, so 10000x10 is not a hatch", () => {
    expect(segs({ x: 0, y: 0, w: 10000, h: 10 })).toHaveLength(2); // the floor
    expect(segs({ x: 0, y: 0, w: 900, h: 900 })).toHaveLength(5); // the ceiling
  });

  it("reads its own long axis: a bench stood on end draws the same object", () => {
    const flat = segs({ x: 0, y: 0, w: 1500, h: 400 });
    const tall = segs({ x: 0, y: 0, w: 400, h: 1500 });
    expect(tall).toHaveLength(flat.length);
    expect(tall.filter((p) => p.a.x === p.b.x)).toHaveLength(3);
  });
});

describe("glyphs-living — the dining chair is a seat and a backrest", () => {
  it("draws the white seat first, then a pill-ended backrest bar along the back edge", () => {
    const r = { x: 100, y: 200, w: 450, h: 450 };
    const [seat, back] = glyph("chair", r);
    expect(seat!.paint.fill).toBe(DEFAULT_THEME.opening);
    expect(back!.paint.fill).toBe(DEFAULT_THEME.furnitureFill);
    const by = pointsOf(back!).map((p) => p.y);
    expect(Math.min(...by)).toBeCloseTo(r.y, 9); // on the back edge
    expect(Math.max(...by)).toBeCloseTo(r.y + r.h * 0.12, 9); // 12% of the depth
    const sy = pointsOf(seat!).map((p) => p.y);
    expect(Math.max(...sy)).toBeCloseTo(r.y + r.h, 9); // the seat runs to the front
    // Pill-ended: the bar's ends are half-circles of half its depth.
    if (back!.prim.t !== "path") throw new Error("the backrest is a path");
    for (const e of back!.prim.loops[0]!.edges) if (e.t === "arc") expect(e.r).toBeCloseTo((r.h * 0.12) / 2, 9);
  });

  it("is mirror-symmetric", () => {
    const n = glyph("chair", { x: 0, y: 0, w: 500, h: 500 });
    expect(
      marksEqual(
        n,
        n.map((x) => mirrorNode(x, 250)),
      ),
    ).toBe(true);
  });

  it("is NOT the outdoor chair: no slats across its back", () => {
    // `drawOutdoorChair` is a seat-and-back construction plus slats, and the slats are the whole
    // difference between an upholstered dining chair and a slatted patio one.
    const chair = glyph("chair", { x: 0, y: 0, w: 450, h: 450 });
    const patio = glyph("outdoor_chair", { x: 0, y: 0, w: 450, h: 450 });
    expect(patio.length).toBeGreaterThan(chair.length);
  });
});

describe("glyphs-living — the tv_unit says which side the room is on", () => {
  it("stands the television at the BACK and puts the pulls on the FRONT", () => {
    const r = { x: 0, y: 0, w: 1500, h: 450 };
    const nodes = glyph("tv_unit", r);
    expect(nodes).toHaveLength(8);
    // The last two nodes are the television: its foot plate (white, detail) and its panel (body,
    // outline), both in the back half of the carcass — the edge the unit goes against a wall on.
    const [foot, panel] = nodes.slice(-2);
    expect([foot!.paint.fill, foot!.lineWeight]).toEqual([DEFAULT_THEME.opening, "extraThin"]);
    expect([panel!.paint.fill, panel!.lineWeight]).toEqual([DEFAULT_THEME.furnitureFill, "thin"]);
    for (const n of [foot!, panel!]) {
      expect(Math.max(...pointsOf(n).map((p) => p.y))).toBeLessThan(r.y + r.h * 0.45);
    }
    // The pulls — the horizontal lines — are all at the front, 86% of the way to it.
    const pulls = nodes.flatMap((n) => (n.prim.t === "line" && n.prim.a.y === n.prim.b.y ? [n.prim] : []));
    expect(pulls).toHaveLength(3);
    for (const p of pulls) expect(p.a.y).toBeCloseTo(r.y + r.h * 0.86, 9);
  });

  it("is a different symbol from the wall-mounted `tv`, at the same footprint", () => {
    // The two are separate kinds because they occupy different floor — 450 mm against 80 — so a
    // reader must be able to tell them apart even when someone sizes them the same.
    const r = { x: 0, y: 0, w: 1500, h: 450 };
    expect(glyph("tv_unit", r).map((n) => n.prim.t)).not.toEqual(glyph("tv", r).map((n) => n.prim.t));
  });
});

describe("glyphs-living — the loveseat is a sofa with its cushion count PINNED", () => {
  const seats = (category: string, r: Rect): number =>
    glyph(category, r).filter((n) => n.paint.fill === DEFAULT_THEME.opening).length / 2;

  it("draws exactly two seats at every aspect", () => {
    for (const r of [
      { x: 0, y: 0, w: 1500, h: 850 },
      { x: 0, y: 0, w: 900, h: 900 },
      { x: 0, y: 0, w: 6000, h: 900 },
      { x: 0, y: 0, w: 10000, h: 10 },
    ]) {
      expect(seats("loveseat", r), `${r.w}x${r.h}`).toBe(2);
      expect(glyph("loveseat", r)).toHaveLength(7);
    }
  });

  it("…while the `sofa` on the SAME footprint reads its seat length and draws more", () => {
    const wide = { x: 0, y: 0, w: 6000, h: 900 };
    expect(seats("sofa", wide)).toBeGreaterThan(seats("loveseat", wide));
  });

  it("is the same CONSTRUCTION: a sofa whose seat holds two cushions IS the loveseat, byte for byte", () => {
    // The two share `seatBody` and the arm rule, which is what stops them drifting apart.
    const r = { x: 0, y: 0, w: 1500, h: 850 };
    expect(seats("sofa", r)).toBe(2);
    expect(glyph("loveseat", r)).toEqual(glyph("sofa", r));
  });
});

describe("glyphs-living — the symbols that must say which way they face", () => {
  it("the fireplace's firebox opens onto the ROOM side and narrows toward the wall", () => {
    const r = { x: 0, y: 0, w: 1200, h: 400 };
    const nodes = glyph("fireplace", r);
    const box = nodes[2]!;
    if (box.prim.t !== "polygon") throw new Error("the firebox is a polygon");
    expect(box.paint.fill).toBe(DEFAULT_THEME.opening);
    const pts = box.prim.pts;
    const ys = pts.map((p) => p.y);
    const front = Math.max(...ys);
    const back = Math.min(...ys);
    const widthAt = (y: number): number => {
      const xs = pts.filter((p) => p.y === y).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    // The mouth is the WIDE edge and it is the nearer the room; the splayed sides close in behind.
    expect(widthAt(front)).toBeGreaterThan(widthAt(back));
    expect(front).toBeGreaterThan(r.y + r.h / 2);
    // …and the hearth in front of it reaches the footprint's front edge, narrower than the breast.
    const outline = nodes[0]!;
    if (outline.prim.t !== "polygon") throw new Error("the breast and hearth are one polygon");
    const atFront = outline.prim.pts.filter((p) => p.y === r.y + r.h).map((p) => p.x);
    expect(atFront).toHaveLength(2);
    expect(Math.min(...atFront)).toBeGreaterThan(r.x);
    expect(Math.max(...atFront)).toBeLessThan(r.x + r.w);
  });

  it.each([
    ["sideboard", { x: 0, y: 0, w: 1600, h: 450 }, 4, 0.86],
    ["shoe_cabinet", { x: 0, y: 0, w: 800, h: 300 }, 3, 0.82],
  ] as const)("the %s's pulls are all on the front edge, one per door", (category, r, doors, at) => {
    const lines = glyph(category, r).flatMap((n) => (n.prim.t === "line" ? [n.prim] : []));
    const pulls = lines.filter((p) => p.a.y === p.b.y);
    expect(pulls).toHaveLength(doors);
    for (const p of pulls) expect(p.a.y).toBeCloseTo(r.y + r.h * at, 9);
    // Every other line is a full-depth door split; there are no diagonals.
    const splits = lines.filter((p) => p.a.x === p.b.x);
    expect(splits).toHaveLength(doors - 1);
    expect(splits.length + pulls.length).toBe(lines.length);
  });

  it("a shoe cabinet's pull runs twice the share of its door a sideboard's does", () => {
    // Tilt-out bins with a finger-pull along the top: that, at a hall's depth, is the difference.
    const pullShare = (category: string, r: Rect, doors: number): number => {
      const p = glyph(category, r).find((n) => n.prim.t === "line" && n.prim.a.y === n.prim.b.y)!;
      if (p.prim.t !== "line") throw new Error("a pull is a line");
      return Math.abs(p.prim.b.x - p.prim.a.x) / (r.w / doors);
    };
    expect(pullShare("shoe_cabinet", { x: 0, y: 0, w: 800, h: 300 }, 3)).toBeCloseTo(0.5, 9);
    expect(pullShare("sideboard", { x: 0, y: 0, w: 1600, h: 450 }, 4)).toBeCloseTo(0.26, 9);
  });

  it("the wall-mounted tv's panel is on the FRONT edge and stays slim however deep it is authored", () => {
    for (const r of [
      { x: 0, y: 0, w: 1200, h: 80 },
      { x: 0, y: 0, w: 1200, h: 300 },
    ]) {
      const [panel, bracket] = glyph("tv", r);
      const py = pointsOf(panel!).map((p) => p.y);
      expect(Math.max(...py)).toBeCloseTo(r.y + r.h, 9);
      expect(Math.max(...py) - Math.min(...py)).toBeLessThanOrEqual(Math.min(r.h * 0.55, r.w * 0.06) + 1e-9);
      // The bracket reaches from the wall to the panel's back face, centred.
      const by = pointsOf(bracket!).map((p) => p.y);
      expect(Math.min(...by)).toBe(r.y);
      expect(Math.max(...by)).toBeCloseTo(Math.min(...py), 9);
    }
  });
});

describe("glyphs-living — the radiator's and sideboard's counts are clamped", () => {
  const fins = (r: Rect): number => glyph("radiator", r).length - 1;
  const sideboardParts = (r: Rect): number => glyph("sideboard", r).length - 1;

  it("fins run [4, 20] at one per 0.75 depths, reached honestly at both ends", () => {
    expect(fins({ x: 0, y: 0, w: 400, h: 400 })).toBe(4); // 1.33, clamped up
    expect(fins({ x: 0, y: 0, w: 1000, h: 100 })).toBe(13); // 13.3
    expect(fins({ x: 0, y: 0, w: 1500, h: 100 })).toBe(20); // 20, the ceiling reached honestly
    expect(fins({ x: 0, y: 0, w: 10000, h: 10 })).toBe(20); // 1333, clamped down
  });

  it("the fins are detail ticks inside the casing: they never touch its long faces", () => {
    const r = { x: 0, y: 0, w: 1000, h: 100 };
    for (const n of glyph("radiator", r).slice(1)) {
      if (n.prim.t !== "line") throw new Error("a fin is a line");
      expect(n.lineWeight).toBe("extraThin");
      expect(Math.min(n.prim.a.y, n.prim.b.y)).toBeGreaterThan(r.y);
      expect(Math.max(n.prim.a.y, n.prim.b.y)).toBeLessThan(r.y + r.h);
    }
  });

  it("doors run [2, 5], and the splits and pulls both follow the count", () => {
    // `doors - 1` splits plus `doors` pulls, so the total is `2 x doors - 1`.
    expect(sideboardParts({ x: 0, y: 0, w: 450, h: 450 })).toBe(3); // 2 doors, clamped up
    expect(sideboardParts({ x: 0, y: 0, w: 1600, h: 450 })).toBe(7); // 4 doors
    expect(sideboardParts({ x: 0, y: 0, w: 10000, h: 10 })).toBe(9); // 5 doors, clamped down
  });
});

describe("glyphs-living — the coat rack is rotation-symmetric as a SET", () => {
  it("maps onto itself under every quarter-turn and a mirror", () => {
    // The catalog claims `symmetric: true`, which orientation reasoning reads — so prove it
    // against the real `rotateNode` rather than by inspection. Note the weaker claim than the
    // stool's: the SET is invariant, the node LIST is not, because a turn carries arm `i` onto
    // arm `i + 1`.
    const r: Rect = { x: 1000, y: 2000, w: 400, h: 400 };
    const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const n = glyph("coat_rack", r);
    for (const deg of [90, 180, 270]) {
      expect(
        marksEqual(
          n,
          n.map((x) => rotateNode(x, centre, deg)),
        ),
        `coat rack at ${deg} degrees`,
      ).toBe(true);
    }
    expect(
      marksEqual(
        n,
        n.map((x) => mirrorNode(x, centre.x)),
      ),
    ).toBe(true);
  });

  it("is a base, a pole, and four arms on the diagonals each ending in a knob", () => {
    const r: Rect = { x: 0, y: 0, w: 400, h: 400 };
    const c = { x: 200, y: 200 };
    const nodes = glyph("coat_rack", r);
    const circles = nodes.flatMap((n) => (n.prim.t === "circle" ? [n.prim] : []));
    const arms = nodes.flatMap((n) => (n.prim.t === "line" ? [n.prim] : []));
    expect(circles).toHaveLength(6);
    expect(arms).toHaveLength(4);
    // The base (first, the outline) and the pole (last, a solid ink disc) are concentric.
    expect(circles[0]!.center).toEqual(c);
    expect(circles[5]!.center).toEqual(c);
    expect(nodes.at(-1)!.paint.fill).toBe(nodes.at(-1)!.paint.stroke);
    // The arms run out on the diagonals, past the base, and the knobs sit on their ends.
    for (const a of arms) {
      expect(Math.abs(a.b.x - c.x)).toBeCloseTo(Math.abs(a.b.y - c.y), 9);
      expect(Math.hypot(a.b.x - c.x, a.b.y - c.y)).toBeGreaterThan(circles[0]!.r);
    }
    const knobs = circles.slice(1, 5);
    for (const k of knobs) {
      expect(Math.hypot(k.center.x - c.x, k.center.y - c.y)).toBeCloseTo(200 * 0.86, 6);
      expect(k.r).toBeCloseTo(knobs[0]!.r, 9);
    }
  });
});

describe("glyphs-living — the v1.32 families are a contiguous block of the vocabulary", () => {
  it("appears in `CANONICAL_FIXTURES` in this order, with nothing interleaved", () => {
    // Derived, not retyped: appending elsewhere, or re-ordering the table (which is the
    // LEGEND's order, so a re-order moves every shipped plan's legend), fails here.
    const names = ["fireplace", "radiator", "sideboard", "loveseat", "chaise", "tv", "coat_rack", "shoe_cabinet"];
    const start = CANONICAL_FIXTURES.indexOf(names[0]!);
    expect(start, "the block must exist").toBeGreaterThanOrEqual(0);
    expect(CANONICAL_FIXTURES.slice(start, start + names.length)).toEqual(names);
  });

  it("every new name and alias dispatches to a drawn symbol", () => {
    for (const c of [
      "fireplace",
      "radiator",
      "sideboard",
      "buffet",
      "loveseat",
      "sofa_2",
      "chaise",
      "tv",
      "coat_rack",
      "shoe_cabinet",
    ]) {
      expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
    }
  });
});
