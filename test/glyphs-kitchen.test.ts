/**
 * `src/elements/glyphs-kitchen.ts` — the kitchen and utility plan symbols.
 *
 * A fixture glyph has no return value anyone inspects: it pushes primitives into a Scene
 * that four backends serialize, and the only thing that has ever guarded one is a full-SVG
 * snapshot. A snapshot proves the drawing did not CHANGE; it says nothing about whether the
 * drawing is inside its own footprint, finite at a hostile aspect ratio, or free of the one
 * primitive (`text`) glyphs are contractually not allowed to emit. Those are the laws below,
 * and they are stated once and swept over every symbol in the module — so a symbol added
 * later is covered by writing one row in {@link GLYPHS}, not by remembering to test it.
 *
 * The single fact worth stating in prose, because it is the one place this module measures in
 * real millimetres rather than fractions of a footprint: a counter's division ticks are spaced
 * by the 600 mm base-cabinet module, and the guard that keeps a legend swatch from turning
 * into a comb is `run ≥ 2 modules`. That guard is tested at its boundary from both sides.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { rotateNode } from "../src/elements/furniture.js";
import { toScene } from "../src/scene-build.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import type { GlyphCtx, Rect } from "../src/elements/glyph-lib.js";
import {
  CABINET_PITCH_MM,
  drawCounter,
  drawDishwasher,
  drawDryer,
  drawFridge,
  drawIsland,
  drawKitchenSink,
  drawOven,
  drawStove,
  drawUpperCabinet,
  drawWasher,
} from "../src/elements/glyphs-kitchen.js";

/** A furniture-free plan, used only as a source of a real theme and real pen sizes. */
const BASE = `plan "G" { units mm room id=r at (0,0) size 4000x3000 label "R" }`;
const { theme, sizes } = toScene(resolve(parse(BASE).plan!).ir);
const ctx = (): GlyphCtx => glyphCtx(theme, sizes);

type Draw = (r: Rect, g: GlyphCtx) => SceneNode[];

/**
 * Every symbol in the module, its ArchLang category, and the number of primitives it draws
 * at {@link REF}.
 *
 * The counts are asserted, not documented: a symbol that quietly grows a primitive is a
 * symbol whose budget nobody is watching, and the ~2–15 range is what keeps a plan with
 * forty fixtures from being mostly glyph. `counter` is listed at its tick-free count —
 * {@link REF} is a single cabinet module wide — and its ticks get their own describe below.
 */
const GLYPHS: readonly (readonly [category: string, draw: Draw, prims: number])[] = [
  ["kitchen_sink", drawKitchenSink, 7],
  ["counter", drawCounter, 2],
  ["stove", drawStove, 10],
  ["fridge", drawFridge, 4],
  ["oven", drawOven, 4],
  ["dishwasher", drawDishwasher, 3],
  ["island", drawIsland, 2],
  ["upper_cabinet", drawUpperCabinet, 2],
  ["washer", drawWasher, 4],
  ["dryer", drawDryer, 6],
];

/** A plausible appliance footprint: 600 mm wide, 600 mm deep. */
const REF: Rect = { x: 1000, y: 2000, w: 600, h: 600 };

/**
 * Footprints a symbol must survive. The first is ordinary; the rest are the shapes that
 * actually break a glyph — `hasFixtureGlyph` probes every category with a 1×1 rect to ask
 * whether it draws at all, and the fuzz feeds ratios like 10000×10. A radius keyed to the
 * WIDTH rather than the short side escapes its own footprint on the fourth of these, which
 * is why {@link inside} exists.
 */
const SHAPES: readonly Rect[] = [
  REF,
  { x: 0, y: 0, w: 1800, h: 600 },
  { x: -500, y: -900, w: 1, h: 1 },
  { x: 0, y: 0, w: 10000, h: 10 },
  { x: 0, y: 0, w: 10, h: 10000 },
  { x: 0, y: 0, w: 1, h: 10000 },
  { x: 0, y: 0, w: 10000, h: 1 },
];

/**
 * The primitives a fixture glyph is allowed to emit.
 *
 * `text` is excluded by contract — the fixture LABEL is drawn by `furniture.render()`, and
 * only when no symbol exists, so a glyph that lettered itself would double the label on
 * every plan. `region` and `hatch` are excluded because `rotateNode` cannot turn a hatch
 * (its pattern angle lives in pattern space) and would silently pass one through unrotated.
 */
const ALLOWED_PRIMS = new Set(["polygon", "line", "circle"]);

/** Every point a primitive's extent touches — a circle contributing its bounding corners. */
function extentOf(n: SceneNode): Point[] {
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return p.pts;
    case "line":
      return [p.a, p.b];
    case "circle":
      return [
        { x: p.center.x - p.r, y: p.center.y - p.r },
        { x: p.center.x + p.r, y: p.center.y + p.r },
      ];
    default:
      // Reached only if a glyph starts emitting a primitive `ALLOWED_PRIMS` also rejects;
      // the assertion there fires first and names it.
      throw new Error(`no extent rule for prim "${p.t}"`);
  }
}

/** Assert every primitive of `nodes` lies within `r`, to a tolerance scaled off the rect. */
function inside(nodes: SceneNode[], r: Rect, what: string): void {
  const eps = Math.max(r.w, r.h, 1) * 1e-9;
  for (const [i, n] of nodes.entries()) {
    for (const p of extentOf(n)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what} node ${i}: non-finite point`).toBe(true);
      expect(p.x, `${what} node ${i}: x escapes left`).toBeGreaterThanOrEqual(r.x - eps);
      expect(p.x, `${what} node ${i}: x escapes right`).toBeLessThanOrEqual(r.x + r.w + eps);
      expect(p.y, `${what} node ${i}: y escapes top`).toBeGreaterThanOrEqual(r.y - eps);
      expect(p.y, `${what} node ${i}: y escapes bottom`).toBeLessThanOrEqual(r.y + r.h + eps);
    }
  }
}

describe("glyphs-kitchen — the primitive budget", () => {
  for (const [category, draw, prims] of GLYPHS) {
    it(`${category} draws exactly ${prims} primitives at a 600x600 footprint`, () => {
      expect(draw(REF, ctx())).toHaveLength(prims);
    });
  }

  it("no symbol is under 2 or over 15 primitives", () => {
    for (const [category, draw] of GLYPHS) {
      const n = draw(REF, ctx()).length;
      expect(n, `${category} draws ${n}`).toBeGreaterThanOrEqual(2);
      expect(n, `${category} draws ${n}`).toBeLessThanOrEqual(15);
    }
  });
});

describe("glyphs-kitchen — laws that hold for every symbol", () => {
  for (const [category, draw] of GLYPHS) {
    it(`${category} emits only polygon/line/circle — never a text prim`, () => {
      for (const r of SHAPES) {
        for (const n of draw(r, ctx())) {
          expect(ALLOWED_PRIMS.has(n.prim.t), `${category} emitted a "${n.prim.t}"`).toBe(true);
        }
      }
    });

    it(`${category} keeps all geometry inside its own footprint, at every aspect ratio`, () => {
      for (const r of SHAPES) inside(draw(r, ctx()), r, `${category} @ ${r.w}x${r.h}`);
    });

    it(`${category} carries a named line weight on every node, matching paint.width`, () => {
      for (const n of draw(REF, ctx())) {
        expect(n.lineWeight, `${category}: an untagged node`).toBeDefined();
        expect(["thin", "extraThin"]).toContain(n.lineWeight);
      }
    });

    it(`${category} is deterministic — two calls produce identical nodes`, () => {
      for (const r of SHAPES) expect(draw(r, ctx())).toEqual(draw(r, ctx()));
    });
  }
});

describe("glyphs-kitchen — degenerate footprints", () => {
  // A 1x1 rect is not hypothetical: `hasFixtureGlyph` asks every category with exactly that,
  // to decide whether the piece gets a legend row. A throw here would take down the legend.
  for (const r of [
    { x: 0, y: 0, w: 1, h: 10000 },
    { x: 0, y: 0, w: 10000, h: 1 },
    { x: 0, y: 0, w: 1, h: 1 },
  ]) {
    it(`every symbol is finite and non-empty at ${r.w}x${r.h}`, () => {
      for (const [category, draw] of GLYPHS) {
        const nodes = draw(r, ctx());
        expect(nodes.length, `${category} drew nothing`).toBeGreaterThan(0);
        for (const p of nodes.flatMap(extentOf)) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${category}: non-finite point`).toBe(true);
        }
        for (const n of nodes) expect(Number.isFinite(n.paint.width ?? 0)).toBe(true);
      }
    });
  }
});

describe("glyphs-kitchen — the counter's cabinet divisions", () => {
  const ticksAt = (w: number): number => drawCounter({ x: 0, y: 0, w, h: 600 }, ctx()).length - 2;

  it("the pitch is the 600 mm base-cabinet module", () => {
    expect(CABINET_PITCH_MM).toBe(600);
  });

  // The guard is `run / pitch >= 2`, so one module gets no ticks and two gets one — the
  // divider BETWEEN the cabinets. A tick at the far end would double the outline.
  it.each([
    [600, 0],
    [1199, 0],
    [1200, 1],
    [1800, 2],
    [10000, 16],
  ])("a %i mm run draws %i division ticks", (w, expected) => {
    expect(ticksAt(w)).toBe(expected);
  });

  it("a legend swatch (a run under two modules) degrades to the plain symbol", () => {
    // Two primitives = slab + nosing, exactly what the symbol drew before ticks existed.
    expect(drawCounter({ x: 0, y: 0, w: 400, h: 300 }, ctx())).toHaveLength(2);
  });

  it("every tick lands strictly inside the run, on the pitch", () => {
    const r: Rect = { x: 250, y: 0, w: 2500, h: 600 };
    const ticks = drawCounter(r, ctx()).slice(2);
    expect(ticks).toHaveLength(4);
    for (const [i, n] of ticks.entries()) {
      expect(n.prim.t).toBe("line");
      const line = n.prim as { t: "line"; a: Point; b: Point };
      expect(line.a.x).toBe(r.x + (i + 1) * CABINET_PITCH_MM);
      expect(line.a.x).toBeLessThan(r.x + r.w);
      expect(line.b.x).toBe(line.a.x);
      // A tick runs from the back edge down to the nosing, never across it.
      expect(line.a.y).toBe(r.y);
      expect(line.b.y).toBeCloseTo(r.y + r.h * 0.82, 9);
    }
  });

  it("an absurdly long run is clamped, not looped to the edge", () => {
    // 1000 modules would be 999 ticks. The cap keeps any footprint's primitive count bounded.
    const nodes = drawCounter({ x: 0, y: 0, w: CABINET_PITCH_MM * 1000, h: 600 }, ctx());
    expect(nodes.length - 2).toBe(64);
  });
});

describe("glyphs-kitchen — the dashed-overhead convention", () => {
  it("upper_cabinet is dashed in EVERY node, outline included", () => {
    const nodes = drawUpperCabinet(REF, ctx());
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(n.lineType, "a wall cabinet is above the cut plane — every line of it is dashed").toBe("dashed");
      // Both fields, for the reason glyph-lib's header gives: SVG follows the name, PDF the number.
      expect(n.paint.dash).toBeDefined();
    }
    // The outline is unfilled, so whatever it overhangs still reads through it.
    expect(nodes[0]!.prim.t).toBe("polygon");
    expect(nodes[0]!.paint.fill).toBe("none");
  });

  it("no OTHER symbol in the module dashes anything", () => {
    for (const [category, draw] of GLYPHS) {
      if (category === "upper_cabinet") continue;
      for (const n of draw(REF, ctx())) {
        expect(n.lineType, `${category} dashed a node`).toBeUndefined();
      }
    }
  });
});

describe("glyphs-kitchen — round things are round", () => {
  it("a hob's burners are true circles, in concentric pairs", () => {
    const circles = drawStove(REF, ctx()).filter((n) => n.prim.t === "circle");
    expect(circles, "four burners, two rings each").toHaveLength(8);
    const radii = new Set(circles.map((n) => (n.prim as { r: number }).r));
    expect(radii.size, "one outer radius and one inner").toBe(2);
    for (const n of circles) expect(n.paint.fill).toBe("none");
  });

  it("a washer's drum is a ring pair and a dryer's is a ring plus three chords", () => {
    const rings = (draw: Draw): number => draw(REF, ctx()).filter((n) => n.prim.t === "circle").length;
    expect(rings(drawWasher)).toBe(2);
    expect(rings(drawDryer)).toBe(1);
    // The two appliances are the same box at the same size; they must differ by SHAPE.
    expect(drawWasher(REF, ctx())).not.toEqual(drawDryer(REF, ctx()));
  });

  it("a sink's basins are eased rectangles, each with a drain", () => {
    const nodes = drawKitchenSink(REF, ctx());
    const drains = nodes.filter((n) => n.prim.t === "circle");
    expect(drains, "two drains and the tap").toHaveLength(3);
    // A roundedRectPoly is 20 points; a plain rect is 4. The slab is the plain one.
    const polys = nodes.filter((n) => n.prim.t === "polygon").map((n) => (n.prim as { pts: Point[] }).pts.length);
    expect(polys).toEqual([4, 20, 20]);
  });
});

describe("glyphs-kitchen — through the compiler", () => {
  const plan = (rotate: number): string =>
    `plan "K" {\n  units mm\n  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }\n  room id=k at (200,200) size 7600x5600 label "Kitchen"\n` +
    GLYPHS.map(([c], i) => `  furniture ${c} at (${400 + i * 700},400) size 600x600 rotate ${rotate} in k`).join("\n") +
    `\n}`;

  for (const rotate of [0, 90, 180, 270]) {
    it(`every symbol compiles at rotate ${rotate}`, () => {
      const res = compile(plan(rotate));
      expect(res.errors, JSON.stringify(res.errors)).toHaveLength(0);
      expect(res.svg).toContain("<svg");
    });
  }

  it("a quarter-turn keeps a square symbol inside its own footprint", () => {
    // `furniture.render()` turns the symbol about the footprint centre. On a SQUARE
    // footprint that rotation maps the rect onto itself, so containment must survive it —
    // this is the assertion the four compiles above cannot make.
    const r: Rect = { x: 1000, y: 1000, w: 600, h: 600 };
    const c: Point = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    for (const [category, draw] of GLYPHS) {
      for (const deg of [90, 180, 270]) {
        const turned = draw(r, ctx()).map((n) => rotateNode(n, c, deg));
        inside(turned, r, `${category} rotated ${deg}`);
      }
    }
  });

  it("the six new symbols reach the SVG as drawn geometry, not a labelled box", () => {
    // Before this work package these categories returned `null` and rendered as a rectangle
    // with their name in it. The label text is what must be GONE.
    const src = `plan "U" {\n  units mm\n  room id=u at (0,0) size 4000x3000 label "Utility"\n  furniture washer at (200,200) size 600x600 in u\n  furniture dryer at (1000,200) size 600x600 in u\n}`;
    const svg = compile(src).svg;
    expect(svg).not.toContain(">washer<");
    expect(svg).not.toContain(">dryer<");
    expect(svg).toContain("<circle");
  });
});
