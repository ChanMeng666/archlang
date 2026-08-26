/**
 * `src/elements/glyphs-misc.ts` — the office/misc plan symbols: desk, office chair,
 * bookshelf, plant, car.
 *
 * Five laws are worth holding down here, and only one of them is about how the drawing looks.
 *
 * **1. Nothing leaves its own footprint.** A fixture's footprint is what every clearance,
 * collision and repair rule measures; a symbol that draws outside it makes the drawing and
 * `arch lint` disagree about where the piece is, silently. The containment check below
 * SAMPLES an arc along its sweep rather than taking its start/end/centre — the box those
 * three points span misses the whole bulge, which is exactly where the office chair's back
 * lives, so the cheaper check would have passed on a chair drawn a metre above its seat.
 *
 * **2. The arcs stay minor.** Every backend lowers a Scene `arc` with the SVG large-arc flag
 * pinned to `0`, so a sweep over 180 degrees is drawn as its complement — in some exports and
 * not others. That is a property of the primitive, not of this module, but this module is the
 * first fixture glyph to emit one, so the assertion belongs where the arc is written.
 *
 * **3. A repeat count is clamped.** The bookshelf's bay ticks are derived from the aspect
 * ratio, so a 10000x1 rect asks for six thousand of them. Both ends of the clamp are pinned.
 *
 * **4. The plant is genuinely rotation-symmetric.** The catalog already claims
 * `symmetric: true` for it, which is a fact orientation reasoning reads. Here it is proved
 * against the real `rotateNode`, by turning the symbol and comparing the two primitive SETS.
 *
 * **5. Degenerate aspects produce finite numbers.** The property suites feed 10000x10; a
 * fraction-of-the-footprint rule survives that, an absolute millimetre does not.
 */

import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { compile } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { weightWidth } from "../src/scene.js";
import { hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import { rotateNode } from "../src/elements/furniture.js";
import { drawBookshelf, drawCar, drawDesk, drawOfficeChair, drawPlant } from "../src/elements/glyphs-misc.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 8000x6000 label "R" }`;
const baseScene = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
const { theme, sizes } = baseScene();

type Draw = (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[];

const draw = (fn: Draw, r: Rect): SceneNode[] => fn(r, glyphCtx(theme, sizes));

/** The five symbols under test, by the category name that dispatches to each. */
const GLYPHS: readonly (readonly [string, Draw])[] = [
  ["desk", drawDesk],
  ["office_chair", drawOfficeChair],
  ["bookshelf", drawBookshelf],
  ["plant", drawPlant],
  ["car", drawCar],
];

/** A generic footprint: off the origin, wider than deep, no round-number aspect. */
const R: Rect = { x: 1000, y: 2000, w: 1600, h: 700 };

/**
 * Primitive counts at {@link R}. The bookshelf's is aspect-dependent — 1600/700 is 2.29
 * depths of run, one bay short of the second tick — so its own clamp cases are pinned
 * separately below.
 */
const EXPECTED_PRIMS: Readonly<Record<string, number>> = {
  desk: 3,
  office_chair: 4,
  bookshelf: 3,
  plant: 10,
  car: 6,
};

const TAU = Math.PI * 2;

/** The signed sweep of an arc primitive, in radians, following its `sweep` flag. */
function arcSweep(p: Extract<SceneNode["prim"], { t: "arc" }>): number {
  const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
  const a1 = Math.atan2(p.end.y - p.center.y, p.end.x - p.center.x);
  let d = a1 - a0;
  if (p.sweep === 1) while (d <= 0) d += TAU;
  else while (d >= 0) d -= TAU;
  return d;
}

/**
 * Points that bound one primitive.
 *
 * An arc is SAMPLED along its sweep, not reduced to start/end/centre: those three points
 * bound the chord, and the drawn curve bulges away from it. Anything that is not one of the
 * five primitives a glyph may emit throws, which is what makes "no text primitives" a
 * consequence of this helper rather than a second assertion nobody updates.
 */
function boundingPoints(n: SceneNode): Point[] {
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
      const a0 = Math.atan2(p.start.y - p.center.y, p.start.x - p.center.x);
      const d = arcSweep(p);
      const out: Point[] = [];
      for (let i = 0; i <= 32; i++) {
        const a = a0 + (d * i) / 32;
        out.push({ x: p.center.x + p.r * Math.cos(a), y: p.center.y + p.r * Math.sin(a) });
      }
      return out;
    }
    default:
      throw new Error(`a fixture glyph emitted an unexpected primitive: ${p.t}`);
  }
}

/** Every node's geometry lies inside `r`, to within a nanometre of float slack. */
function expectInside(nodes: SceneNode[], r: Rect, what: string): void {
  const eps = 1e-6;
  for (const n of nodes) {
    for (const p of boundingPoints(n)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${what}: a finite point`).toBe(true);
      expect(p.x, `${what}: x >= left`).toBeGreaterThanOrEqual(r.x - eps);
      expect(p.x, `${what}: x <= right`).toBeLessThanOrEqual(r.x + r.w + eps);
      expect(p.y, `${what}: y >= top`).toBeGreaterThanOrEqual(r.y - eps);
      expect(p.y, `${what}: y <= bottom`).toBeLessThanOrEqual(r.y + r.h + eps);
    }
  }
}

/** A primitive as a rounded, order-independent string — for comparing two SETS of nodes. */
function canonical(n: SceneNode): string {
  const f = (v: number): string => v.toFixed(6);
  const pt = (p: Point): string => `${f(p.x)},${f(p.y)}`;
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return `poly[${p.pts.map(pt).join(" ")}]`;
    case "line":
      return `line[${pt(p.a)} ${pt(p.b)}]`;
    case "circle":
      return `circle[${pt(p.center)} ${f(p.r)}]`;
    case "arc":
      return `arc[${pt(p.center)} ${f(p.r)} ${pt(p.start)} ${pt(p.end)} ${p.sweep}]`;
    default:
      throw new Error(`unexpected primitive ${p.t}`);
  }
}

describe("glyphs-misc — what each symbol draws", () => {
  it("every category dispatches to a drawn symbol, aliases included", () => {
    for (const c of ["desk", "office_chair", "bookshelf", "bookcase", "shelf", "plant", "planter", "car"]) {
      expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
    }
  });

  it("draws the expected number of primitives, all within the ~2-15 budget", () => {
    for (const [name, fn] of GLYPHS) {
      const nodes = draw(fn, R);
      expect(nodes.length, `${name} primitive count`).toBe(EXPECTED_PRIMS[name]);
      expect(nodes.length, `${name} is within the budget`).toBeGreaterThanOrEqual(2);
      expect(nodes.length, `${name} is within the budget`).toBeLessThanOrEqual(15);
    }
  });

  it("keeps every primitive inside the footprint", () => {
    for (const [name, fn] of GLYPHS) expectInside(draw(fn, R), R, name);
  });

  it("emits no text primitive (a symbol is read, not labelled)", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) expect(n.prim.t, `${name} primitive kind`).not.toBe("text");
    }
  });

  it("paints on the furniture layer at a glyph weight, with paint.width agreeing", () => {
    for (const [name, fn] of GLYPHS) {
      for (const n of draw(fn, R)) {
        expect(n.layer, `${name} layer`).toBe("furniture");
        expect(n.lineWeight, `${name} names a weight`).toBeDefined();
        expect(["thin", "extraThin"]).toContain(n.lineWeight);
        expect(n.paint.width, `${name} width matches its weight`).toBe(weightWidth(n.lineWeight!, sizes));
      }
    }
  });

  it("uses both weights: an outline in thin, interior detail in extraThin", () => {
    for (const [name, fn] of GLYPHS) {
      const weights = new Set(draw(fn, R).map((n) => n.lineWeight));
      expect(weights, `${name} draws detail below its outline`).toEqual(new Set(["thin", "extraThin"]));
    }
  });

  it("is deterministic — two calls produce identical geometry", () => {
    for (const [name, fn] of GLYPHS) {
      const a = draw(fn, R).map(canonical);
      const b = draw(fn, R).map(canonical);
      expect(a, `${name} is deterministic`).toEqual(b);
    }
  });
});

describe("glyphs-misc — the desk", () => {
  it("puts the modesty panel at 0.12 of the depth from the BACK (top) edge", () => {
    const nodes = draw(drawDesk, R);
    const line = nodes.find((n) => n.prim.t === "line");
    expect(line).toBeDefined();
    const p = line!.prim as Extract<SceneNode["prim"], { t: "line" }>;
    expect(p.a.y).toBeCloseTo(R.y + R.h * 0.12, 9);
    expect(p.b.y).toBeCloseTo(R.y + R.h * 0.12, 9);
    // …and it is nearer the back than the front, which is the whole architectural claim.
    expect(p.a.y - R.y).toBeLessThan(R.y + R.h - p.a.y);
  });

  it("fills the slab with the furniture body colour and leaves the inset unfilled", () => {
    const polys = draw(drawDesk, R).filter((n) => n.prim.t === "polygon");
    expect(polys).toHaveLength(2);
    expect(polys[0]!.paint.fill).toBe(theme.furnitureFill);
    expect(polys[1]!.paint.fill).toBe("none");
  });
});

describe("glyphs-misc — the office chair", () => {
  const nodes = draw(drawOfficeChair, R);

  it("draws a round seat, a curved back and two armrests", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual(["circle", "arc", "line", "line"]);
  });

  it("bows the back toward the BACK (top) edge, above the seat centre", () => {
    const arc = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
    const cy = R.y + R.h / 2;
    expect(arc.center.y).toBeCloseTo(cy, 9);
    // Both endpoints, and therefore the whole sweep, sit above the seat centre.
    expect(arc.start.y).toBeLessThan(cy);
    expect(arc.end.y).toBeLessThan(cy);
    // The topmost point of the sweep is the one the chord misses; it is still inside.
    expect(arc.center.y - arc.r).toBeGreaterThanOrEqual(R.y);
  });

  it("keeps the back a MINOR arc — the large-arc flag is pinned to 0 in every backend", () => {
    const arc = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "arc" }>;
    expect(Math.abs(arcSweep(arc))).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(Math.abs(arcSweep(arc))).toBeCloseTo((140 * Math.PI) / 180, 9);
  });

  it("flanks the seat with one armrest each side", () => {
    const cx = R.x + R.w / 2;
    const xs = nodes
      .filter((n) => n.prim.t === "line")
      .map((n) => (n.prim as Extract<SceneNode["prim"], { t: "line" }>).a.x);
    expect(xs).toHaveLength(2);
    expect(xs.some((x) => x < cx)).toBe(true);
    expect(xs.some((x) => x > cx)).toBe(true);
  });
});

describe("glyphs-misc — the bookshelf", () => {
  const ticks = (r: Rect): number => draw(drawBookshelf, r).length - 2;

  it("derives the bay count from the aspect ratio", () => {
    // The catalog's own footprint, 900 along x 300 deep: three depths of run, two ticks.
    expect(ticks({ x: 0, y: 0, w: 900, h: 300 })).toBe(2);
    expect(ticks({ x: 0, y: 0, w: 300, h: 900 })).toBe(2); // …and the same run stood on end
  });

  it("clamps to one tick at the floor (a square carcass asks for none)", () => {
    expect(ticks({ x: 0, y: 0, w: 1000, h: 1000 })).toBe(1);
    expect(ticks({ x: 0, y: 0, w: 1000, h: 900 })).toBe(1);
  });

  it("clamps to twelve ticks at the ceiling (10000x10 asks for six hundred)", () => {
    expect(ticks({ x: 0, y: 0, w: 10000, h: 10 })).toBe(12);
    expect(ticks({ x: 0, y: 0, w: 10, h: 10000 })).toBe(12);
    expect(ticks({ x: 0, y: 0, w: 10000, h: 1 })).toBe(12);
  });

  it("runs its centreline along the LONG axis, whichever axis that is", () => {
    const long = (r: Rect): "x" | "y" => {
      const p = draw(drawBookshelf, r)[1]!.prim as Extract<SceneNode["prim"], { t: "line" }>;
      return Math.abs(p.b.x - p.a.x) > Math.abs(p.b.y - p.a.y) ? "x" : "y";
    };
    expect(long({ x: 0, y: 0, w: 900, h: 300 })).toBe("x");
    expect(long({ x: 0, y: 0, w: 300, h: 900 })).toBe("y");
  });

  it("stays inside the footprint at both clamp ends", () => {
    for (const r of [
      { x: 500, y: 500, w: 1000, h: 1000 },
      { x: 500, y: 500, w: 10000, h: 10 },
      { x: 500, y: 500, w: 10, h: 10000 },
    ]) {
      expectInside(draw(drawBookshelf, r), r, `bookshelf ${r.w}x${r.h}`);
    }
  });
});

describe("glyphs-misc — the plant", () => {
  it("maps onto itself under every quarter-turn", () => {
    // The catalog claims `symmetric: true` for this category; orientation reasoning reads
    // that claim, so prove it against the real rotateNode rather than by inspection.
    const centre: Point = { x: R.x + R.w / 2, y: R.y + R.h / 2 };
    const original = draw(drawPlant, R).map(canonical).sort();
    for (const deg of [90, 180, 270]) {
      const turned = draw(drawPlant, R)
        .map((n) => rotateNode(n, centre, deg))
        .map(canonical)
        .sort();
      expect(turned, `plant at ${deg} degrees`).toEqual(original);
    }
  });

  it("draws two concentric rings and eight radials between them", () => {
    const nodes = draw(drawPlant, R);
    const circles = nodes.filter((n) => n.prim.t === "circle");
    const lines = nodes.filter((n) => n.prim.t === "line");
    expect(circles).toHaveLength(2);
    expect(lines).toHaveLength(8);
    const [outer, inner] = circles.map((n) => n.prim as Extract<SceneNode["prim"], { t: "circle" }>);
    expect(outer!.center).toEqual(inner!.center);
    expect(inner!.r).toBeCloseTo(outer!.r * 0.6, 9);
    // Each radial spans exactly the annulus between them.
    const d = (p: Point): number => Math.hypot(p.x - outer!.center.x, p.y - outer!.center.y);
    for (const l of lines) {
      const p = l.prim as Extract<SceneNode["prim"], { t: "line" }>;
      expect(d(p.a)).toBeCloseTo(inner!.r, 6);
      expect(d(p.b)).toBeCloseTo(outer!.r, 6);
    }
  });
});

describe("glyphs-misc — the car", () => {
  const nodes = draw(drawCar, R);

  it("draws a body, a cabin, two screens and two mirrors", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual(["polygon", "polygon", "line", "line", "line", "line"]);
    expect(nodes[0]!.paint.fill).toBe(theme.furnitureFill);
    expect(nodes[1]!.paint.fill).toBe(theme.opening);
  });

  it("insets the cabin inside the body on all four sides", () => {
    const body = nodes[0]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>;
    const cab = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "polygon" }>;
    const box = (pts: Point[]) => ({
      x0: Math.min(...pts.map((p) => p.x)),
      x1: Math.max(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      y1: Math.max(...pts.map((p) => p.y)),
    });
    const b = box(body.pts);
    const c = box(cab.pts);
    expect(c.x0).toBeGreaterThan(b.x0);
    expect(c.x1).toBeLessThan(b.x1);
    expect(c.y0).toBeGreaterThan(b.y0);
    expect(c.y1).toBeLessThan(b.y1);
  });

  it("puts the two screens across the cabin, one near each end", () => {
    const screens = [nodes[2]!, nodes[3]!].map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    for (const s of screens) expect(s.a.y).toBeCloseTo(s.b.y, 9); // transverse
    expect(screens[0]!.a.y).toBeLessThan(screens[1]!.a.y);
  });

  it("puts one mirror each side, at the same station along the length", () => {
    const mirrors = [nodes[4]!, nodes[5]!].map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    expect(mirrors[0]!.a.y).toBeCloseTo(mirrors[1]!.a.y, 9);
    expect(mirrors[0]!.a.y).toBeCloseTo(R.y + R.h * 0.3, 9);
    const cx = R.x + R.w / 2;
    expect(mirrors[0]!.a.x).toBeLessThan(cx);
    expect(mirrors[1]!.a.x).toBeGreaterThan(cx);
  });
});

describe("glyphs-misc — degenerate footprints", () => {
  const DEGENERATE: readonly Rect[] = [
    { x: 0, y: 0, w: 1, h: 10000 },
    { x: 0, y: 0, w: 10000, h: 1 },
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 10000, h: 10 },
  ];

  it("draws finite geometry inside the footprint at any aspect, and never throws", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        const nodes = draw(fn, r);
        expect(nodes.length, `${name} at ${r.w}x${r.h}`).toBeGreaterThan(0);
        expectInside(nodes, r, `${name} at ${r.w}x${r.h}`);
      }
    }
  });

  it("never asks for an unbounded number of primitives", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        expect(draw(fn, r).length, `${name} at ${r.w}x${r.h}`).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe("glyphs-misc — through the compiler", () => {
  const plan = (rot: number): string => `plan "Misc" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=g at (0,0) size 8000x6000 label "Garage"
  furniture desk at (400,400) size 1600x700 label "Desk" rotate ${rot}
  furniture office_chair at (900,1300) size 600x600 rotate ${rot}
  furniture bookshelf at (2400,400) size 900x300 rotate ${rot}
  furniture plant at (3600,400) size 500x500 rotate ${rot}
  furniture car at (4600,600) size 2000x4400 rotate ${rot}
}`;

  it("compiles clean at all four quarter-turns and is deterministic", () => {
    for (const rot of [0, 90, 180, 270]) {
      const out = compile(plan(rot), { noCache: true });
      expect(out.errors, `rotate ${rot}`).toEqual([]);
      expect(out.svg.length).toBeGreaterThan(0);
      expect(compile(plan(rot), { noCache: true }).svg, `rotate ${rot} is deterministic`).toBe(out.svg);
    }
  });

  it("draws the symbol instead of the labelled rectangle", () => {
    const svg = compile(plan(0), { noCache: true }).svg;
    // `furniture.render()` drops the label entirely once a glyph draws, so the one word
    // that could only come from the fallback path is the proof the fallback is gone.
    expect(svg).not.toContain(">Desk<");
    expect(svg).toContain(">Garage<");
    // The chair's back and the plant's rings are the primitives no fallback ever emitted.
    expect(svg).toContain('<path d="M ');
    expect(svg).toContain("<circle ");
  });

  it("turns the whole symbol — each quarter-turn moves the bytes", () => {
    const seen = new Set([0, 90, 180, 270].map((rot) => compile(plan(rot), { noCache: true }).svg));
    expect(seen.size, "four distinct drawings").toBe(4);
  });
});
