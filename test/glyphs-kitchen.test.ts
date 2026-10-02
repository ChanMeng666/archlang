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
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { toScene } from "../src/scene-build.js";
import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";
import { pathExtentPoints } from "./glyph-extent.js";
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
 * Several symbols read their own footprint (a sink's drainer, an oven's hob, an island's end
 * fitting); {@link REF} is square, so each is listed at its COMPACT branch and the aspect
 * branches have their own describe.
 */
const GLYPHS: readonly (readonly [category: string, draw: Draw, prims: number])[] = [
  // worktop · bowl · its waste · tap ring · spout. REF is square, so one bowl and no drainer: a
  // wider run puts a drainer board with four grooves either side of the bowl (15), and a run
  // twice as wide as it is deep takes a second bowl (7, or 17 between two drainers).
  ["kitchen_sink", drawKitchenSink, 5],
  // worktop · upstand line · front-edge line. REF is one module, so no division ticks.
  ["counter", drawCounter, 3],
  // slab · hob plate · 8 burner rings · 4 knobs.
  ["stove", drawStove, 14],
  // carcass · door face · handle bar. A side-by-side (aspect 1.4+) adds the split (4).
  ["fridge", drawFridge, 3],
  // carcass · 3 knobs · door window · handle. REF is square, so this is the built-under oven;
  // a wide footprint adds four burner rings and draws 10.
  ["oven", drawOven, 6],
  // carcass · tub panel · 2 rack rails · control strip · handle.
  ["dishwasher", drawDishwasher, 6],
  // worktop · overhang line · a bowl and its waste · tap ring and spout. REF is square, so this
  // is the compact prep island; a run of aspect 1.8 or more draws a hob plate and 8 rings (11).
  ["island", drawIsland, 6],
  // dashed outline · dashed door face. REF is ONE cabinet module, so the door splits are
  // guarded out exactly as the counter's division ticks are.
  ["upper_cabinet", drawUpperCabinet, 2],
  // carcass · control strip · dial · button · door ring · porthole.
  ["washer", drawWasher, 6],
  // carcass · control strip · dial · drum ring · gasket ring · filter slot.
  ["dryer", drawDryer, 6],
  // ── kitchen & bath additions ──
  // slab · bowl · waste · step · tap ring · spout.
  ["laundry_sink", drawLaundrySink, 6],
  // vessel · jacket ring · 2 pipe stubs.
  ["water_heater", drawWaterHeater, 4],
  // dashed canopy · fan ring · 4 radials · hub ring.
  ["range_hood", drawRangeHood, 7],
  // carcass · door frame · window · keypad · 3 buttons.
  ["microwave", drawMicrowave, 7],
  // REF is square, so `clamp((w / h) * 1.2, 1, 8)` rounds to one stool; a 1800x600 bar
  // draws four. Top · overhang line · stools.
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
 * `path` — a closed outline of lines and minor arcs (`GlyphCtx.path`) — is allowed: it is how a
 * glyph draws a true curve, and `rotateNode`/`mirrorNode` carry it exactly.
 */
const ALLOWED_PRIMS = new Set(["polygon", "line", "circle", "path"]);

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
    case "path":
      return pathExtentPoints(p);
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

/** Is the drawing its own mirror image about the vertical centre line of `r`? */
function mirrorSymmetric(draw: Draw, r: Rect): boolean {
  const nodes = draw(r, ctx());
  return marksEqual(
    nodes,
    nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
  );
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
    it(`${category} emits only polygon/line/circle/path — never a text prim`, () => {
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

    it(`${category} draws its outline first, in the thin pen`, () => {
      // The first node is what `data-arch-primary` is read from: the piece's silhouette.
      for (const r of SHAPES) {
        const first = draw(r, ctx())[0]!;
        expect(first.lineWeight, `${category} @ ${r.w}x${r.h}`).toBe("thin");
      }
    });

    it(`${category} is deterministic — two calls produce identical nodes`, () => {
      for (const r of SHAPES) expect(draw(r, ctx())).toEqual(draw(r, ctx()));
    });
  }

  it("a curve is never tessellated — a polygon here is always a plain rectangle", () => {
    for (const [category, draw] of GLYPHS) {
      for (const r of SHAPES) {
        for (const n of draw(r, ctx())) {
          if (n.prim.t === "polygon") expect(n.prim.pts, `${category}: a polygon is a rectangle`).toHaveLength(4);
        }
      }
    }
  });

  it("every footprint a symbol is drawn at stays within the drawing budget", () => {
    // 72 is the floor's hard cap (`DEFAULT_DRAW_COST`); the long runs are the only way past 20.
    for (const [category, draw] of GLYPHS) {
      for (const r of [...SHAPES, { x: 0, y: 0, w: 300000, h: 600 }, { x: 0, y: 0, w: 600, h: 300000 }]) {
        const n = draw(r, ctx()).length;
        expect(n, `${category} @ ${r.w}x${r.h} draws ${n}`).toBeLessThanOrEqual(72);
      }
    }
  });
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
  const ticksAt = (w: number): number => drawCounter({ x: 0, y: 0, w, h: 600 }, ctx()).length - 3;

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
    // Three primitives = slab + upstand line + front-edge line: no comb.
    expect(drawCounter({ x: 0, y: 0, w: 400, h: 300 }, ctx())).toHaveLength(3);
  });

  it("the upstand and the front edge run the full width, and the slab is a worktop, not a plank", () => {
    const r: Rect = { x: 100, y: 200, w: 1200, h: 600 };
    const [slab, upstand, edge] = drawCounter(r, ctx()) as [SceneNode, SceneNode, SceneNode];
    expect(slab.prim.t).toBe("polygon");
    for (const n of [upstand, edge]) {
      expect(n.lineWeight).toBe("extraThin");
      const line = n.prim as { t: "line"; a: Point; b: Point };
      expect(line.a.x).toBe(r.x);
      expect(line.b.x).toBe(r.x + r.w);
      expect(line.a.y).toBe(line.b.y);
    }
    const up = (upstand.prim as { a: Point }).a.y;
    const fr = (edge.prim as { a: Point }).a.y;
    // The upstand is near the BACK (a few percent of the depth in), the edge near the FRONT.
    expect(up - r.y).toBeGreaterThan(r.h * 0.02);
    expect(up - r.y).toBeLessThan(r.h * 0.08);
    expect(r.y + r.h - fr).toBeGreaterThan(r.h * 0.03);
    expect(r.y + r.h - fr).toBeLessThan(r.h * 0.1);
  });

  it("every tick lands strictly inside the run, on the pitch, between the two lines", () => {
    const r: Rect = { x: 250, y: 0, w: 2500, h: 600 };
    const nodes = drawCounter(r, ctx());
    const upstandY = (nodes[1]!.prim as { a: Point }).a.y;
    const edgeY = (nodes[2]!.prim as { a: Point }).a.y;
    const ticks = nodes.slice(3);
    expect(ticks).toHaveLength(4);
    for (const [i, n] of ticks.entries()) {
      expect(n.prim.t).toBe("line");
      const line = n.prim as { t: "line"; a: Point; b: Point };
      expect(line.a.x).toBe(r.x + (i + 1) * CABINET_PITCH_MM);
      expect(line.a.x).toBeLessThan(r.x + r.w);
      expect(line.b.x).toBe(line.a.x);
      // A tick runs from the upstand to the front-edge line, never across either.
      expect(line.a.y).toBe(upstandY);
      expect(line.b.y).toBe(edgeY);
    }
  });

  it("an absurdly long run is clamped, not looped to the edge", () => {
    // 1000 modules would be 999 ticks. The cap keeps any footprint's primitive count bounded.
    const nodes = drawCounter({ x: 0, y: 0, w: CABINET_PITCH_MM * 1000, h: 600 }, ctx());
    expect(nodes.length - 3).toBe(64);
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

  it("a wall cabinet's marks run edge to edge and a hood's fan is a ring about the centre", () => {
    // Both are dashed unfilled rectangles at the outline; the difference has to be INSIDE. A
    // cabinet's marks are straight runs from one edge of the footprint to the other (the door
    // face across the width, a split from the back to the front); a hood's fan sits wholly
    // inside, and none of its marks reaches an edge.
    const wide: Rect = { x: 0, y: 0, w: 1800, h: 350 };
    for (const n of drawUpperCabinet(wide, ctx()).slice(1)) {
      const l = n.prim as { t: "line"; a: Point; b: Point };
      expect(l.t).toBe("line");
      const spansWidth = l.a.x === wide.x && l.b.x === wide.x + wide.w;
      const spansDepth = l.a.y === wide.y && l.b.y === wide.y + wide.h;
      expect(spansWidth || spansDepth, "a cabinet mark reaches both ends of its run").toBe(true);
    }
    const hood = drawRangeHood(REF, ctx()).slice(1);
    expect(hood.length).toBeGreaterThan(0);
    for (const p of hood.flatMap(extentOf)) {
      expect(p.x).toBeGreaterThan(REF.x);
      expect(p.x).toBeLessThan(REF.x + REF.w);
      expect(p.y).toBeGreaterThan(REF.y);
      expect(p.y).toBeLessThan(REF.y + REF.h);
    }
  });

  it("a hood's fan and hub are TRUE circles, dashed through both fields", () => {
    const circles = drawRangeHood(REF, ctx()).filter((n) => n.prim.t === "circle");
    expect(circles).toHaveLength(2);
    for (const n of circles) {
      expect(n.paint.fill).toBe("none");
      expect(n.lineType).toBe("dashed");
      expect(n.paint.dash).toEqual([sizes.thin * 6, sizes.thin * 4]);
    }
    const [fan, hub] = circles.map((n) => (n.prim as { r: number }).r) as [number, number];
    expect(hub).toBeLessThan(fan);
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
  it("a hob's burners are true circles, in concentric pairs, the large pair along the back", () => {
    const nodes = drawStove(REF, ctx());
    const rings = nodes.filter((n) => n.prim.t === "circle" && n.paint.fill === "none");
    expect(rings, "four burners, two rings each").toHaveLength(8);
    const radii = [...new Set(rings.map((n) => (n.prim as { r: number }).r))].sort((a, b) => a - b);
    expect(radii.length, "large and small, outer and inner").toBe(4);
    // The outer rings: two large, two small. The large pair stands side by side on the BACK row
    // and the small pair on the front row, so the hob is mirror-symmetric about the centre line.
    const outer = rings
      .filter((n) => (n.prim as { r: number }).r >= radii[2]!)
      .map((n) => n.prim as { center: Point; r: number });
    expect(outer).toHaveLength(4);
    const large = outer.filter((p) => p.r === radii[3]!);
    const small = outer.filter((p) => p.r === radii[2]!);
    expect(large).toHaveLength(2);
    expect(small).toHaveLength(2);
    expect(large[0]!.center.y).toBe(large[1]!.center.y);
    expect(small[0]!.center.y).toBe(small[1]!.center.y);
    expect(large[0]!.center.y, "the large pair is at the back").toBeLessThan(small[0]!.center.y);
    const cx = REF.x + REF.w / 2;
    expect(large[0]!.center.x + large[1]!.center.x).toBeCloseTo(2 * cx, 9);
    expect(small[0]!.center.x + small[1]!.center.x).toBeCloseTo(2 * cx, 9);
    // The four knobs are filled discs in a row along the front band.
    const knobs = nodes.filter((n) => n.prim.t === "circle" && n.paint.fill !== "none");
    expect(knobs).toHaveLength(4);
    const ys = new Set(knobs.map((n) => (n.prim as { center: Point }).center.y));
    expect(ys.size).toBe(1);
    expect([...ys][0]!).toBeGreaterThan(REF.y + REF.h * 0.8);
  });

  it("a washer is a panel and a white porthole; a dryer is an empty drum with a gasket and a slot", () => {
    const circles = (draw: Draw): SceneNode[] => draw(REF, ctx()).filter((n) => n.prim.t === "circle");
    // Dial ring, button disc, the door ring and the porthole.
    expect(circles(drawWasher)).toHaveLength(4);
    // Dial ring, drum ring and gasket ring — no filled disc anywhere.
    expect(circles(drawDryer)).toHaveLength(3);
    // The porthole is FILLED with the basin colour, and that fill is the thing you see
    // across a utility room; the drum it sits in is an unfilled ring.
    const [drum, porthole] = circles(drawWasher).slice(-2);
    expect(drum!.paint.fill).toBe("none");
    expect(porthole!.paint.fill).toBe(ctx().basin);
    for (const n of circles(drawDryer)) expect(n.paint.fill).toBe("none");
    // The two appliances are the same box at the same size; they must differ by SHAPE.
    expect(drawWasher(REF, ctx())).not.toEqual(drawDryer(REF, ctx()));
  });

  it("a sink's bowls are eased rectangles with a waste each, between two grooved drainers", () => {
    const g = ctx();
    const nodes = drawKitchenSink({ x: 0, y: 0, w: 1800, h: 600 }, g);
    // Two bowls (thin white paths), a drainer board either side (detail paths) and the slab (a rectangle).
    const bowls = nodes.filter((n) => n.prim.t === "path" && n.lineWeight === "thin");
    expect(bowls).toHaveLength(2);
    for (const b of bowls) expect(b.paint.fill).toBe(g.basin);
    const boards = nodes.filter((n) => n.prim.t === "path" && n.lineWeight === "extraThin");
    expect(boards, "a drainer each side").toHaveLength(2);
    for (const b of boards) expect(b.paint.fill).toBe("none");
    // Four grooves on each board.
    expect(nodes.filter((n) => n.prim.t === "line" && n.lineWeight === "extraThin")).toHaveLength(2 * 4 + 1);
    expect(nodes.filter((n) => n.prim.t === "polygon").map((n) => (n.prim as { pts: Point[] }).pts.length)).toEqual([
      4,
    ]);
    // A waste on each bowl's centre, and the tap ring: three circles.
    const circles = nodes.filter((n) => n.prim.t === "circle");
    expect(circles, "two wastes and the tap ring").toHaveLength(3);
  });

  it("a tap is a base ring on the back deck with its spout running toward the bowl", () => {
    const nodes = drawKitchenSink(REF, ctx());
    const ring = nodes.find((n) => n.prim.t === "circle" && n.paint.fill === "none")!.prim as {
      center: Point;
      r: number;
    };
    expect(ring.center.y, "the tap stands on the back deck").toBeLessThan(REF.y + REF.h * 0.2);
    const spout = nodes.find((n) => n.prim.t === "line")!.prim as { a: Point; b: Point };
    expect(spout.a.x).toBe(ring.center.x);
    expect(spout.b.y).toBeGreaterThan(spout.a.y);
  });
});

describe("glyphs-kitchen — the aspect branches", () => {
  // Several symbols read their own footprint and draw a different object either side of a
  // threshold. Each branch is a real appliance, so each is pinned from BOTH sides — a
  // one-sided check would pass a rule that had silently collapsed to one branch.

  it("a sink run takes a second bowl at aspect 2, and a drainer each side once the bowls leave room", () => {
    const n = (w: number): number => drawKitchenSink({ x: 0, y: 0, w, h: 600 }, ctx()).length;
    expect(n(600)).toBe(5); // a bowl and its tap
    expect(n(800)).toBe(5); // the catalogued 800 x 600 — a centred bowl on a worktop
    expect(n(1000)).toBe(5); // still too little room for a drainer either side
    expect(n(1100)).toBe(15); // one bowl between two four-groove drainers
    expect(n(1199)).toBe(15); // 1.998 — still one bowl
    expect(n(1200)).toBe(7); // 2.0 — two bowls, which take the whole width
    expect(n(1500)).toBe(7);
    expect(n(1800)).toBe(17); // two bowls between two drainers
    expect(n(10000)).toBe(17); // the drainers are capped; a long run keeps worktop at its ends
  });

  it("a sink bowl is never a trough — at most 1.25 times as wide as it is deep, at any run", () => {
    for (const w of [600, 720, 800, 913, 1000, 1100, 1200, 1440, 1800, 3000, 10000]) {
      const r: Rect = { x: 0, y: 0, w, h: w === 913 ? 438 : 600 };
      for (const n of drawKitchenSink(r, ctx())) {
        if (n.prim.t !== "path" || n.lineWeight !== "thin") continue;
        const pts = extentOf(n);
        const bw = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
        const bh = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
        expect(bw / bh, `${r.w}x${r.h}: bowl ${bw.toFixed(0)} x ${bh.toFixed(0)}`).toBeLessThanOrEqual(1.25 + 1e-9);
      }
    }
  });

  it("a wide oven is a range: four burners on top of the six-primitive oven", () => {
    expect(drawOven({ x: 0, y: 0, w: 600, h: 600 }, ctx())).toHaveLength(6);
    expect(drawOven({ x: 0, y: 0, w: 1000, h: 600 }, ctx())).toHaveLength(10);
    // The threshold is aspect 1.6, written `w * 10 >= h * 16` so a 960 x 600 range — the
    // round number an author types AT the boundary — lands on the side its own rule names.
    expect(drawOven({ x: 0, y: 0, w: 959, h: 600 }, ctx())).toHaveLength(6);
    expect(drawOven({ x: 0, y: 0, w: 960, h: 600 }, ctx())).toHaveLength(10);
  });

  it("a side-by-side fridge splits its door at aspect 1.4; an upright draws no split", () => {
    expect(drawFridge({ x: 0, y: 0, w: 839, h: 600 }, ctx())).toHaveLength(3);
    expect(drawFridge({ x: 0, y: 0, w: 840, h: 600 }, ctx())).toHaveLength(4);
    // The split is a vertical line through the door band, a third of the width in.
    const r: Rect = { x: 0, y: 0, w: 900, h: 600 };
    const split = drawFridge(r, ctx())[2]!.prim as { t: "line"; a: Point; b: Point };
    expect(split.a.x).toBeCloseTo(r.w * 0.3, 9);
    expect(split.b.x).toBe(split.a.x);
    expect(split.b.y).toBe(r.y + r.h);
  });

  it("a long island takes a hob and a compact one takes a bowl", () => {
    // Aspect 1.8. Below it the end fitting is a bowl, its waste and its tap (4 prims); at or
    // above it, a hob plate and eight burner rings (9).
    expect(drawIsland({ x: 0, y: 0, w: 1799, h: 1000 }, ctx())).toHaveLength(6);
    expect(drawIsland({ x: 0, y: 0, w: 1800, h: 1000 }, ctx())).toHaveLength(11);
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

  it("a bar's stools stand in the front band, clear of the top and inside the footprint", () => {
    const r: Rect = { x: 0, y: 0, w: 1800, h: 600 };
    const nodes = drawBarCounter(r, ctx());
    const topBottom = Math.max(...extentOf(nodes[0]!).map((p) => p.y));
    const stools = nodes.filter((n) => n.prim.t === "circle");
    expect(stools).toHaveLength(4);
    for (const s of stools) {
      const c = s.prim as { center: Point; r: number };
      expect(c.center.y - c.r, "a stool never overlaps the worktop").toBeGreaterThan(topBottom);
      expect(c.center.y + c.r).toBeLessThanOrEqual(r.y + r.h);
      expect(s.paint.fill).toBe(ctx().basin);
    }
  });
});

describe("glyphs-kitchen — which symbols are handed", () => {
  // Mirror symmetry is a property of the DRAWING, asked at the footprint it is drawn at, and
  // `describe --facts symmetry` reads it: a symbol that was symmetric on `main` must still be, or a
  // plan with mirrored kitchens changes from `D1 axis x` to `C1`. So a redraw adds no handedness.
  // Only the three that already had it keep it — a washer's dial, a microwave's keypad, an island's
  // fitting at one end.
  const catalogued: Record<string, Rect> = {
    kitchen_sink: { x: 0, y: 0, w: 800, h: 600 },
    stove: REF,
    oven: { x: 0, y: 0, w: 1000, h: 600 },
    washer: REF,
    microwave: { x: 0, y: 0, w: 500, h: 400 },
    island: { x: 0, y: 0, w: 1800, h: 900 },
    fridge: { x: 0, y: 0, w: 600, h: 650 },
    dishwasher: REF,
    dryer: REF,
    laundry_sink: { x: 0, y: 0, w: 600, h: 500 },
    water_heater: REF,
    range_hood: { x: 0, y: 0, w: 900, h: 500 },
    bar_counter: { x: 0, y: 0, w: 1800, h: 600 },
    counter: REF,
    upper_cabinet: { x: 0, y: 0, w: 600, h: 350 },
  };
  const drawOf = (c: string): Draw => (c === "oven" ? drawOven : GLYPHS.find(([name]) => name === c)![1]);

  it.each(["washer", "microwave", "island"])("%s is handed", (c) => {
    expect(mirrorSymmetric(drawOf(c), catalogued[c]!)).toBe(false);
  });

  it.each([
    "kitchen_sink",
    "stove",
    "oven",
    "fridge",
    "dishwasher",
    "dryer",
    "laundry_sink",
    "water_heater",
    "range_hood",
    "bar_counter",
    "counter",
    "upper_cabinet",
  ])("%s is mirror-symmetric", (c) => {
    expect(mirrorSymmetric(drawOf(c), catalogued[c]!)).toBe(true);
  });

  it("the sink, the stove and the oven stay symmetric at every threshold where their drawing changes", () => {
    const at = (w: number, h = 600): Rect => ({ x: 0, y: 0, w, h });
    // The sink: a centred bowl, drainers either side (1100), a second bowl (1200), drainers again (1800),
    // the capped drainer on an absurd run, and the awkward 913 x 438 and a tall one.
    for (const r of [at(600), at(720), at(800), at(1000), at(1100), at(1199), at(1200), at(1500), at(1800), at(3000)]) {
      expect(mirrorSymmetric(drawKitchenSink, r), `kitchen_sink ${r.w}x${r.h}`).toBe(true);
    }
    for (const r of [at(913, 438), at(400, 800), at(10000, 10), at(1, 1), at(10, 10000)]) {
      expect(mirrorSymmetric(drawKitchenSink, r), `kitchen_sink ${r.w}x${r.h}`).toBe(true);
    }
    // The stove: square, wide and tall.
    for (const r of [at(600), at(900), at(600, 900), at(10000, 10)]) {
      expect(mirrorSymmetric(drawStove, r), `stove ${r.w}x${r.h}`).toBe(true);
    }
    // The oven either side of the range threshold (aspect 1.6), and well past it.
    for (const r of [at(600), at(959), at(960), at(1000), at(2000)]) {
      expect(mirrorSymmetric(drawOven, r), `oven ${r.w}x${r.h}`).toBe(true);
    }
  });

  it("an island's hob is the handed part: the burners are symmetric, the end they are at is not", () => {
    expect(mirrorSymmetric(drawIsland, { x: 0, y: 0, w: 1800, h: 900 })).toBe(false);
    expect(mirrorSymmetric(drawIsland, { x: 0, y: 0, w: 1000, h: 900 })).toBe(false);
  });
});

describe("glyphs-kitchen — nothing crowds its neighbour (design spec D8)", () => {
  it("the dryer's filter slot and its control strip each stand clear of the drum ring by 3% of the short side", () => {
    const nodes = drawDryer(REF, ctx());
    const drum = nodes.find((n) => n.prim.t === "circle" && n.lineWeight === "thin")!.prim as {
      center: Point;
      r: number;
    };
    const ys = (n: SceneNode): number[] => extentOf(n).map((p) => p.y);
    const strip = nodes[1]!;
    const slot = nodes[nodes.length - 1]!;
    const slotGap = Math.min(...ys(slot)) - (drum.center.y + drum.r);
    const stripGap = drum.center.y - drum.r - Math.max(...ys(strip));
    expect(slotGap, "slot to drum ring").toBeGreaterThanOrEqual(REF.h * 0.03);
    expect(stripGap, "drum ring to control strip").toBeGreaterThanOrEqual(REF.h * 0.03);
    // …and the slot is still inside the carcass with room to spare at the front edge.
    expect(REF.y + REF.h - Math.max(...ys(slot))).toBeGreaterThanOrEqual(REF.h * 0.03);
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
