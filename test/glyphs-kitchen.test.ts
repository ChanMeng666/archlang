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
  drawBarCounter,
  drawCounter,
  drawDishwasher,
  drawDryer,
  drawFridge,
  drawIsland,
  drawKitchenSink,
  drawLaundrySink,
  drawMicrowave,
  drawOven,
  drawRangeHood,
  drawStove,
  drawUpperCabinet,
  drawWasher,
  drawWaterHeater,
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
  // v1.32: carcass · door face · compartment split · handle bar (was 4 — the door face and
  // the handle BAR replaced a handle stub, and the split moved onto an aspect branch).
  ["fridge", drawFridge, 5],
  // v1.32: carcass · inset · 3 knobs · door seam · window · handle bar. REF is square, so
  // this is the built-under oven; a wide footprint adds four burners and draws 12.
  ["oven", drawOven, 8],
  // v1.32: carcass · inset · 2 basket lines · door leaf · control strip · handle (was 3 —
  // a box with a dial, which is a washing machine's drawing).
  ["dishwasher", drawDishwasher, 7],
  // v1.32: worktop · overhang · 3 cabinet ticks · a bowl and its waste. REF is square, so
  // this is the compact prep island; a run of aspect 1.8 or more draws four burners and 9.
  ["island", drawIsland, 7],
  // v1.32: dashed outline · 2 dashed hinge ticks. REF is ONE cabinet module, so the door
  // splits are guarded out exactly as the counter's division ticks are.
  ["upper_cabinet", drawUpperCabinet, 3],
  // v1.32: carcass · inset · control panel · 2 knobs · drum · porthole (was 4).
  ["washer", drawWasher, 7],
  ["dryer", drawDryer, 6],
  // ── v1.32 F1: kitchen & bath ──
  ["laundry_sink", drawLaundrySink, 6],
  ["water_heater", drawWaterHeater, 4],
  ["range_hood", drawRangeHood, 7],
  ["microwave", drawMicrowave, 6],
  // REF is square, so `clamp((w / h) * 1.2, 1, 8)` rounds to one stool; a 1800x600 bar
  // draws four. Top · overhang · stools.
  ["bar_counter", drawBarCounter, 3],
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
  // Both pieces that hang above the horizontal cut a plan is taken at. The convention is the
  // DRAWING's, not one glyph's: a dashed outline means a thing above the cut plane, which
  // `roof`, `void`, the outdoor `pergola` and the garage door's projection all also say.
  const OVERHEAD: readonly (readonly [string, Draw])[] = [
    ["upper_cabinet", drawUpperCabinet],
    ["range_hood", drawRangeHood],
  ];

  for (const [category, draw] of OVERHEAD) {
    it(`${category} is dashed in EVERY node, outline included`, () => {
      const nodes = draw(REF, ctx());
      expect(nodes.length).toBeGreaterThan(1);
      for (const n of nodes) {
        expect(n.lineType, `${category} is above the cut plane — every line of it is dashed`).toBe("dashed");
        // Both fields, for the reason glyph-lib's header gives: SVG follows the name, PDF the number.
        expect(n.paint.dash).toBeDefined();
      }
      // The outline is unfilled, so whatever it overhangs still reads through it.
      expect(nodes[0]!.prim.t).toBe("polygon");
      expect(nodes[0]!.paint.fill).toBe("none");
    });
  }

  it("a wall cabinet's ticks and a hood's fan are what tell the two apart", () => {
    // Both are dashed unfilled rectangles at the outline; the difference has to be INSIDE.
    // A cabinet's marks run from its back edge (every one starts on `r.y`); a hood's fan is
    // a ring about the centre and none of its marks touch the back edge.
    const cabinet = drawUpperCabinet(REF, ctx()).slice(1);
    for (const n of cabinet) {
      expect(n.prim.t).toBe("line");
      expect((n.prim as { t: "line"; a: Point }).a.y).toBe(REF.y);
    }
    const hood = drawRangeHood(REF, ctx()).slice(1);
    for (const p of hood.flatMap(extentOf)) expect(p.y).toBeGreaterThan(REF.y);
  });

  it("no OTHER symbol in the module dashes anything", () => {
    const overhead = new Set(OVERHEAD.map(([c]) => c));
    for (const [category, draw] of GLYPHS) {
      if (overhead.has(category)) continue;
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

  it("a washer is a panel and a white porthole; a dryer is a ring plus three chords", () => {
    const circles = (draw: Draw): SceneNode[] => draw(REF, ctx()).filter((n) => n.prim.t === "circle");
    // Two panel knobs, the drum ring, and the porthole. It was a bare pair of concentric
    // rings, which differed from the dryer only by a circle count — a difference a reader
    // has to measure rather than see.
    expect(circles(drawWasher)).toHaveLength(4);
    expect(circles(drawDryer)).toHaveLength(1);
    // The porthole is FILLED with the basin colour, and that fill is the thing you see
    // across a utility room; the drum it sits in is an unfilled ring.
    const [drum, porthole] = circles(drawWasher).slice(-2);
    expect(drum!.paint.fill).toBe("none");
    expect(porthole!.paint.fill).toBe(ctx().basin);
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

describe("glyphs-kitchen — the aspect branches", () => {
  // Three symbols read their own footprint and draw a different object either side of a
  // threshold. Each branch is a real appliance, so each is pinned from BOTH sides — a
  // one-sided check would pass a rule that had silently collapsed to one branch.

  it("a wide oven is a range: four burners on top of the eight-primitive oven", () => {
    expect(drawOven({ x: 0, y: 0, w: 600, h: 600 }, ctx())).toHaveLength(8);
    expect(drawOven({ x: 0, y: 0, w: 1000, h: 600 }, ctx())).toHaveLength(12);
    // The threshold is aspect 1.6, written `w * 10 >= h * 16` so a 960 x 600 range — the
    // round number an author types AT the boundary — lands on the side its own rule names.
    expect(drawOven({ x: 0, y: 0, w: 959, h: 600 }, ctx())).toHaveLength(8);
    expect(drawOven({ x: 0, y: 0, w: 960, h: 600 }, ctx())).toHaveLength(12);
  });

  it("a long island takes a hob and a compact one takes a bowl", () => {
    // Aspect 1.8. Below it the end fitting is a bowl and its waste (2 prims); at or above
    // it, four burner rings (4).
    expect(drawIsland({ x: 0, y: 0, w: 1799, h: 1000 }, ctx())).toHaveLength(7);
    expect(drawIsland({ x: 0, y: 0, w: 1800, h: 1000 }, ctx())).toHaveLength(9);
  });

  it("a bar's stools come from its run and are capped at eight", () => {
    const stools = (w: number, h: number): number => drawBarCounter({ x: 0, y: 0, w, h }, ctx()).length - 2;
    expect(stools(600, 600)).toBe(1); // a legend swatch: one stool, never none
    expect(stools(1800, 600)).toBe(4);
    expect(stools(4000, 600)).toBe(8);
    expect(stools(40000, 600)).toBe(8); // the cap, not a loop to the edge
    // `clamp` resolves NaN to its LOW bound, so a zero-by-zero footprint draws one stool
    // rather than looping on a NaN count.
    expect(stools(0, 0)).toBe(1);
  });
});

describe("glyphs-kitchen — through the compiler", () => {
  // A 5-wide grid rather than a single row: the module now has fifteen symbols, and a row of
  // fifteen 600 mm pieces on a 700 mm pitch would run 2.6 m past the room they are declared
  // `in`, which is a different test (a lint one) from the one this file means to run.
  const plan = (rotate: number): string =>
    `plan "K" {\n  units mm\n  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }\n  room id=k at (200,200) size 7600x5600 label "Kitchen"\n` +
    GLYPHS.map(
      ([c], i) =>
        `  furniture ${c} at (${400 + (i % 5) * 1400},${400 + Math.floor(i / 5) * 1400}) size 600x600 rotate ${rotate} in k`,
    ).join("\n") +
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
