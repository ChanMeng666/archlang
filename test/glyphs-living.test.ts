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
import { CANONICAL_FIXTURES, fixtureGlyph, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { rotateNode } from "../src/elements/furniture.js";

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
  // The v1.32 redraws. Every count below moved because the symbol gained STRUCTURE — legs,
  // supports, armrests, drawer splits — not decoration; what each one gained and why is in the
  // module's own doc comment, and the drawing-specific laws are pinned in their own describes
  // further down rather than left to these numbers.
  ["coffee_table", { x: 1000, y: 1000, w: 1200, h: 600 }, 7], // 2 + 4 legs + the tray line (2:1)
  ["table", { x: 1000, y: 1000, w: 1200, h: 800 }, 6], // 2 + 4 legs, no leaf line at 1.5:1
  ["dining_table", { x: 1000, y: 1000, w: 2400, h: 2400 }, 6], // 1 per side + 2 ends = 4 chairs
  ["chair", { x: 1000, y: 1000, w: 450, h: 450 }, 5], // 3 + 2 armrests
  ["stool", { x: 1000, y: 1000, w: 400, h: 400 }, 3], // seat, seat edge, pedestal foot
  ["bench", { x: 1000, y: 1000, w: 1500, h: 400 }, 6], // 1 + 3 slats + 2 end supports
  ["tv_unit", { x: 1000, y: 1000, w: 1500, h: 450 }, 6], // + 2 drawer splits + the handle
  // The v1.32 additions, at their catalogued footprints.
  ["fireplace", { x: 1000, y: 1000, w: 1200, h: 400 }, 5],
  ["radiator", { x: 1000, y: 1000, w: 1000, h: 100 }, 9], // 1 + 8 fins at 10:1
  ["sideboard", { x: 1000, y: 1000, w: 1600, h: 450 }, 9], // 2 + 3 splits + 4 handles
  ["loveseat", { x: 1000, y: 1000, w: 1500, h: 850 }, 6], // the sofa body at a PINNED 1 division
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

  it("is THREE concentric circles — seat, seat edge, pedestal foot", () => {
    // The third circle is what the v1.32 redraw added, and the concentricity is what makes the
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

// ---------------------------------------------------------------------------
// ── v1.32 F2: the six redraws and the eight new living families ──

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

describe("glyphs-living — the chair's armrests are conditional, not decorative", () => {
  const arms = (r: Rect): number => glyph("chair", r).filter((n) => n.prim.t === "line").length;

  it("a normal seat gets two; a seat too narrow to hold them gets none", () => {
    expect(arms({ x: 0, y: 0, w: 450, h: 450 })).toBe(2);
    // The branch is a `>=`, so 0.7 exactly takes the armrests and a hair under takes none.
    expect(arms({ x: 0, y: 0, w: 350, h: 500 })).toBe(2);
    expect(arms({ x: 0, y: 0, w: 349, h: 500 })).toBe(0);
    expect(arms({ x: 0, y: 0, w: 300, h: 500 })).toBe(0);
  });

  it("flanks the seat, one each side of the centreline", () => {
    const r = { x: 100, y: 200, w: 450, h: 450 };
    const xs = glyph("chair", r).flatMap((n) => (n.prim.t === "line" ? [n.prim.a.x] : []));
    expect(xs).toHaveLength(2);
    const cx = r.x + r.w / 2;
    expect(xs.some((x) => x < cx)).toBe(true);
    expect(xs.some((x) => x > cx)).toBe(true);
  });

  it("is NOT the outdoor chair: no slats across its back", () => {
    // `drawOutdoorChair` is this construction plus four slats, and the slats are the whole
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
  const divisions = (category: string, r: Rect): number =>
    glyph(category, r).filter((n) => n.prim.t === "line" && n.prim.a.x === n.prim.b.x).length;

  it("draws exactly one division — two seats — at every aspect", () => {
    for (const r of [
      { x: 0, y: 0, w: 1500, h: 850 },
      { x: 0, y: 0, w: 900, h: 900 },
      { x: 0, y: 0, w: 6000, h: 900 },
      { x: 0, y: 0, w: 10000, h: 10 },
    ]) {
      expect(divisions("loveseat", r), `${r.w}x${r.h}`).toBe(1);
      expect(glyph("loveseat", r)).toHaveLength(6);
    }
  });

  it("…while the `sofa` on the SAME footprint reads its aspect and draws more", () => {
    const wide = { x: 0, y: 0, w: 6000, h: 900 };
    expect(divisions("sofa", wide)).toBeGreaterThan(divisions("loveseat", wide));
  });

  it("is the same CONSTRUCTION: a sofa clamped to one division is byte-identical to it", () => {
    // The two share `sofaBody`, which is what stops them drifting apart. A 900x900 sofa clamps
    // DOWN to two divisions, so it cannot be used here; the check that matters is that every
    // primitive of the loveseat also appears, in order, in a sofa of the same footprint minus
    // its extra division lines.
    const r = { x: 0, y: 0, w: 1500, h: 850 };
    const love = glyph("loveseat", r);
    const sofa = glyph("sofa", r);
    expect(love.slice(0, 4)).toEqual(sofa.slice(0, 4)); // body, both arms, back band
    expect(love.at(-1)).toEqual(sofa.at(-1)); // the front seat line
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
