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
  // The redraws. Every count below moved because the symbol gained STRUCTURE — legs,
  // supports, armrests, drawer splits — not decoration; what each one gained and why is in the
  // module's own doc comment, and the drawing-specific laws are pinned in their own describes
  // further down rather than left to these numbers.
  ["coffee_table", { x: 1000, y: 1000, w: 1200, h: 600 }, 7], // 2 + 4 legs + the tray line (2:1)
  ["table", { x: 1000, y: 1000, w: 1200, h: 800 }, 6], // 2 + 4 legs, no leaf line at 1.5:1
  ["dining_table", { x: 1000, y: 1000, w: 2400, h: 2400 }, 10], // top + bevel + 4 chairs × (seat, back)
  ["chair", { x: 1000, y: 1000, w: 450, h: 450 }, 2], // seat + backrest bar
  ["stool", { x: 1000, y: 1000, w: 400, h: 400 }, 3], // seat, seat edge, pedestal foot
  ["bench", { x: 1000, y: 1000, w: 1500, h: 400 }, 6], // 1 + 3 slats + 2 end supports
  ["tv_unit", { x: 1000, y: 1000, w: 1500, h: 450 }, 6], // + 2 drawer splits + the handle
  // The living additions, at their catalogued footprints.
  ["fireplace", { x: 1000, y: 1000, w: 1200, h: 400 }, 5],
  ["radiator", { x: 1000, y: 1000, w: 1000, h: 100 }, 9], // 1 + 8 fins at 10:1
  ["sideboard", { x: 1000, y: 1000, w: 1600, h: 450 }, 9], // 2 + 3 splits + 4 handles
  ["loveseat", { x: 1000, y: 1000, w: 1500, h: 850 }, 7], // the sofa body at a PINNED two cushions
  ["chaise", { x: 1000, y: 1000, w: 1600, h: 800 }, 6],
  ["tv", { x: 1000, y: 1000, w: 1200, h: 80 }, 4],
  ["coat_rack", { x: 1000, y: 1000, w: 400, h: 400 }, 6],
  ["shoe_cabinet", { x: 1000, y: 1000, w: 800, h: 300 }, 6], // 1 + 2 splits + 3 tilt lines
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

  it("is THREE concentric circles — seat, seat edge, pedestal foot", () => {
    // The third circle is what the redraw added, and the concentricity is what makes the
    // quarter-turn byte-identical rather than merely indistinguishable. The obvious alternative
    // — a ring of three or four foot dots — maps onto itself as a SET while each node lands
    // where its neighbour was, so the bytes would move; the two tests above would fail and the
    // shipped goldens would move for a drawing nobody can tell apart.
    const nodes = glyph("stool", { x: 100, y: 200, w: 400, h: 400 });
    expect(nodes).toHaveLength(3);
    const circles = nodes.map((n) => {
      if (n.prim.t !== "circle") throw new Error("a stool must be drawn with true circles");
      return n.prim;
    });
    for (const c of circles) expect(c.center).toEqual({ x: 300, y: 400 });
    expect(circles[0]!.r).toBe(200);
    expect(circles[1]!.r).toBeCloseTo(124, 9);
    expect(circles[2]!.r).toBeCloseTo(48, 9);
    // Strictly nested, so the drawing never has two rings on top of each other.
    expect(circles[1]!.r).toBeLessThan(circles[0]!.r);
    expect(circles[2]!.r).toBeLessThan(circles[1]!.r);
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
// ── the six redraws and the eight new living families ──

describe("glyphs-living — the redrawn tables carry legs, and a leaf line only when elongated", () => {
  const legs = (category: string, r: Rect): number => glyph(category, r).filter((n) => n.prim.t === "circle").length;
  const lines = (category: string, r: Rect): number => glyph(category, r).filter((n) => n.prim.t === "line").length;

  it.each(["coffee_table", "table"])("%s draws exactly four legs at any aspect", (category) => {
    for (const r of [
      { x: 0, y: 0, w: 1200, h: 600 },
      { x: 0, y: 0, w: 600, h: 1200 },
      { x: 0, y: 0, w: 900, h: 900 },
      { x: 0, y: 0, w: 10000, h: 10 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]) {
      expect(legs(category, r), `${category} ${r.w}x${r.h}`).toBe(4);
    }
  });

  it("the legs sit INSIDE the top, symmetrically about its centre", () => {
    const r = { x: 100, y: 200, w: 1200, h: 600 };
    const circles = glyph("table", r).flatMap((n) => (n.prim.t === "circle" ? [n.prim] : []));
    expect(circles).toHaveLength(4);
    for (const c of circles) {
      expect(c.center.x).toBeGreaterThan(r.x);
      expect(c.center.x).toBeLessThan(r.x + r.w);
      expect(c.center.y).toBeGreaterThan(r.y);
      expect(c.center.y).toBeLessThan(r.y + r.h);
    }
    // Two either side of each centreline: the leg placement is a rectangle, not a drift.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    expect(circles.filter((c) => c.center.x < cx)).toHaveLength(2);
    expect(circles.filter((c) => c.center.y < cy)).toHaveLength(2);
    // …and every leg is the same size, so none of them reads as something else.
    for (const c of circles) expect(c.r).toBeCloseTo(circles[0]!.r, 9);
  });

  it("the leaf/tray line appears strictly ABOVE aspect 1.6, on both categories", () => {
    // A square-ish top has one surface; a long one reads as two. The boundary is measured by
    // counting the LINES actually emitted, so the assertion cannot agree with a wrong formula.
    expect(lines("table", { x: 0, y: 0, w: 1590, h: 1000 })).toBe(0);
    expect(lines("table", { x: 0, y: 0, w: 1610, h: 1000 })).toBe(1);
    expect(lines("coffee_table", { x: 0, y: 0, w: 1590, h: 1000 })).toBe(0);
    expect(lines("coffee_table", { x: 0, y: 0, w: 1610, h: 1000 })).toBe(1);
    // …and it is found off the footprint's OWN long axis, not off the page.
    expect(lines("table", { x: 0, y: 0, w: 1000, h: 1610 })).toBe(1);
    expect(lines("coffee_table", { x: 0, y: 0, w: 1000, h: 1610 })).toBe(1);
  });

  it("the two tables' leaf lines run on OPPOSITE axes, which is what tells them apart", () => {
    // A refectory table's boards run WITH its length; a tray's division runs ACROSS it. Same
    // footprint, two perpendicular lines — so the symbols never draw the same line in the same
    // place at the same aspect.
    const r = { x: 0, y: 0, w: 2000, h: 800 };
    const lineOf = (category: string) => {
      const n = glyph(category, r).find((x) => x.prim.t === "line");
      if (!n || n.prim.t !== "line") throw new Error(`${category} drew no leaf line`);
      return n.prim;
    };
    const t = lineOf("table");
    const c = lineOf("coffee_table");
    expect(t.a.y, "the table's board line runs along the length").toBeCloseTo(t.b.y, 9);
    expect(c.a.x, "the coffee table's tray line runs across it").toBeCloseTo(c.b.x, 9);
  });
});

describe("glyphs-living — the bench's slats and end supports", () => {
  const segs = (r: Rect) => glyph("bench", r).flatMap((n) => (n.prim.t === "line" ? [n.prim] : []));

  it("draws a clamped run of slats plus exactly two end supports", () => {
    // 1500x400: short/long = 0.267, x12 = 3.2 → 3 slats, then the two supports.
    const s = segs({ x: 0, y: 0, w: 1500, h: 400 });
    expect(s).toHaveLength(5);
    // The slats run LENGTHWISE (constant y on a landscape bench); the supports run across it.
    expect(s.filter((p) => p.a.y === p.b.y)).toHaveLength(3);
    expect(s.filter((p) => p.a.x === p.b.x)).toHaveLength(2);
  });

  it("clamps the slat count at both ends, so 10000x10 is not a hatch", () => {
    expect(segs({ x: 0, y: 0, w: 10000, h: 10 })).toHaveLength(4); // 2 slats (floor) + 2 supports
    expect(segs({ x: 0, y: 0, w: 900, h: 900 })).toHaveLength(7); // 5 slats (ceiling) + 2 supports
  });

  it("reads its own long axis: a bench stood on end draws the same object", () => {
    const flat = segs({ x: 0, y: 0, w: 1500, h: 400 });
    const tall = segs({ x: 0, y: 0, w: 400, h: 1500 });
    expect(tall).toHaveLength(flat.length);
    // …with the roles of the two axes swapped, which is what "the same object turned" means.
    expect(tall.filter((p) => p.a.x === p.b.x)).toHaveLength(3);
    expect(tall.filter((p) => p.a.y === p.b.y)).toHaveLength(2);
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
  it("puts the screen at the BACK and the drawer splits + handle at the FRONT", () => {
    const r = { x: 0, y: 0, w: 1500, h: 450 };
    const nodes = glyph("tv_unit", r);
    expect(nodes).toHaveLength(6);
    const screen = nodes[1]!;
    if (screen.prim.t !== "polygon") throw new Error("the screen is a polygon");
    expect(Math.max(...screen.prim.pts.map((p) => p.y))).toBeLessThan(r.y + r.h * 0.25);
    // Every drawer split and the handle live below the shelf line, in the half facing the room.
    const shelfY = r.y + r.h * 0.52;
    const below = nodes.slice(3).flatMap((n) => (n.prim.t === "line" ? [n.prim.a.y, n.prim.b.y] : []));
    expect(below).toHaveLength(6);
    for (const y of below) expect(y).toBeGreaterThanOrEqual(shelfY);
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

describe("glyphs-living — the two symbols that must say which way they face", () => {
  it("the fireplace's opening is on the ROOM side, not the wall side", () => {
    const r = { x: 0, y: 0, w: 1200, h: 400 };
    const box = glyph("fireplace", r)[1]!;
    if (box.prim.t !== "polygon") throw new Error("the firebox is a polygon");
    const ys = box.prim.pts.map((p) => p.y);
    expect(Math.min(...ys), "the opening starts past the halfway line").toBeGreaterThan(r.y + r.h / 2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(r.y + r.h);
  });

  it("the shoe cabinet's tilt lines all lean the SAME way, toward the front", () => {
    const r = { x: 0, y: 0, w: 800, h: 300 };
    const tilts = glyph("shoe_cabinet", r).flatMap((n) =>
      n.prim.t === "line" && n.prim.a.y !== n.prim.b.y && n.prim.a.x !== n.prim.b.x ? [n.prim] : [],
    );
    expect(tilts).toHaveLength(3);
    for (const t of tilts) {
      // Down-and-to-the-right in every bay: a door that falls out toward the room.
      expect(t.b.x).toBeGreaterThan(t.a.x);
      expect(t.b.y).toBeGreaterThan(t.a.y);
    }
  });

  it("the sideboard's handles are all on the front edge", () => {
    const r = { x: 0, y: 0, w: 1600, h: 450 };
    const handles = glyph("sideboard", r).flatMap((n) =>
      n.prim.t === "line" && n.prim.a.y === n.prim.b.y ? [n.prim] : [],
    );
    expect(handles).toHaveLength(4);
    for (const h of handles) expect(h.a.y).toBeCloseTo(r.y + r.h * 0.88, 9);
  });
});

describe("glyphs-living — the radiator's and sideboard's counts are clamped", () => {
  const fins = (r: Rect): number => glyph("radiator", r).length - 1;
  const sideboardParts = (r: Rect): number => glyph("sideboard", r).length - 2;

  it("fins run [4, 12], reached honestly at both ends", () => {
    expect(fins({ x: 0, y: 0, w: 400, h: 400 })).toBe(4); // aspect 1 → 0.83, clamped up
    expect(fins({ x: 0, y: 0, w: 1000, h: 100 })).toBe(8); // 10 / 1.2 = 8.33
    expect(fins({ x: 0, y: 0, w: 1500, h: 100 })).toBe(12); // 12.5, the ceiling reached honestly
    expect(fins({ x: 0, y: 0, w: 10000, h: 10 })).toBe(12); // 833, clamped down
  });

  it("doors run [2, 5], and the splits and handles both follow the count", () => {
    // `doors - 1` splits plus `doors` handles, so the total is `2 x doors - 1`.
    expect(sideboardParts({ x: 0, y: 0, w: 450, h: 450 })).toBe(3); // 2 doors, clamped up
    expect(sideboardParts({ x: 0, y: 0, w: 1600, h: 450 })).toBe(7); // 4 doors
    expect(sideboardParts({ x: 0, y: 0, w: 10000, h: 10 })).toBe(9); // 5 doors, clamped down
  });
});

describe("glyphs-living — the coat rack is rotation-symmetric as a SET", () => {
  it("maps onto itself under every quarter-turn", () => {
    // The catalog claims `symmetric: true`, which orientation reasoning reads — so prove it
    // against the real `rotateNode` rather than by inspection. Note the weaker claim than the
    // stool's: the SET is invariant, the node LIST is not, because a turn carries hook `i` onto
    // hook `i + 1`.
    const r: Rect = { x: 1000, y: 2000, w: 400, h: 400 };
    const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const key = (n: SceneNode): string => {
      if (n.prim.t !== "circle") throw new Error("a coat rack is drawn with true circles");
      return `${n.prim.center.x.toFixed(6)},${n.prim.center.y.toFixed(6)},${n.prim.r.toFixed(6)}`;
    };
    const original = glyph("coat_rack", r).map(key).sort();
    for (const deg of [90, 180, 270]) {
      const turned = glyph("coat_rack", r)
        .map((n) => rotateNode(n, centre, deg))
        .map(key)
        .sort();
      expect(turned, `coat rack at ${deg} degrees`).toEqual(original);
    }
  });

  it("is four hooks round two concentric rings", () => {
    const r: Rect = { x: 0, y: 0, w: 400, h: 400 };
    const circles = glyph("coat_rack", r).flatMap((n) => (n.prim.t === "circle" ? [n.prim] : []));
    expect(circles).toHaveLength(6);
    const c = { x: 200, y: 200 };
    expect(circles[0]!.center).toEqual(c);
    expect(circles[1]!.center).toEqual(c);
    // The four hooks are all the same distance out and all the same size.
    const hooks = circles.slice(2);
    for (const h of hooks) {
      expect(Math.hypot(h.center.x - c.x, h.center.y - c.y)).toBeCloseTo(200 * 0.72, 6);
      expect(h.r).toBeCloseTo(hooks[0]!.r, 9);
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
