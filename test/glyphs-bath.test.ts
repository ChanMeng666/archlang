/**
 * `src/elements/glyphs-bath.ts` — the four bathroom plan symbols.
 *
 * The laws worth pinning are the ones a refinement pass can break silently, and every one of
 * them is checked by CALLING the glyph rather than by reading it:
 *
 * 1. **The symbol stays inside its own footprint.** A glyph that spills draws over the room
 *    next to it, and nothing else in the suite would say so — `furniture.render()` bounds the
 *    piece by its declared `w x h`, not by what the glyph actually emitted. The collector
 *    below takes a circle's FOUR extremes (not the two corners `furniture-rotate.test.ts`
 *    settles for), so a dot pushed off one edge cannot hide behind the other.
 * 2. **No text.** These are drawn symbols; a fixture's label is the caller's fallback path.
 *    A text prim here would double-label every WC on the sheet.
 * 3. **Finite at any aspect ratio.** The fuzz corpus feeds footprints like 10000 x 1. Every
 *    measure is a fraction of `r.w`/`r.h` and every radius a fraction of `min(w, h)`, so
 *    "finite" is a consequence rather than a hope — but a stray division would land here.
 * 4. **Deterministic.** Two calls with the same inputs are deep-equal. `compile()` is
 *    byte-stable and these are on its path.
 *
 * The prim counts are pinned as exact numbers, not ranges. They are the cheapest possible
 * statement of "this symbol still has its seat / its tap / its rim", and a count that moves
 * is a drawing that changed — which is a diff to explain, not one to re-bless.
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { compile } from "../src/index.js";
import type { Scene, SceneNode } from "../src/scene.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import { drawBasin, drawBathtub, drawShower, drawWc } from "../src/elements/glyphs-bath.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 4000x3000 label "R" }`;
const sceneOf = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
const { theme, sizes } = sceneOf();

type Draw = (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[];

const GLYPHS: readonly (readonly [string, Draw])[] = [
  ["wc", drawWc],
  ["basin", drawBasin],
  ["shower", drawShower],
  ["bathtub", drawBathtub],
];

/** Draw one glyph into a fresh context — the same call `fixtureGlyph` makes. */
const draw = (f: Draw, r: Rect): SceneNode[] => f(r, glyphCtx(theme, sizes));

/**
 * Every point that bounds a node's ink. A circle contributes all four extremes of its
 * bounding square, so a dot that has slipped off ONE edge is caught; taking the two opposite
 * corners (as the older collector does) would let a horizontal overrun pass whenever the
 * vertical one was fine.
 */
function pointsOf(n: SceneNode): { x: number; y: number }[] {
  const p = n.prim;
  if (p.t === "polygon") return [...p.pts];
  if (p.t === "line") return [p.a, p.b];
  if (p.t === "circle")
    return [
      { x: p.center.x - p.r, y: p.center.y },
      { x: p.center.x + p.r, y: p.center.y },
      { x: p.center.x, y: p.center.y - p.r },
      { x: p.center.x, y: p.center.y + p.r },
    ];
  if (p.t === "arc") return [p.start, p.end, p.center];
  return [];
}

const allPoints = (nodes: SceneNode[]): { x: number; y: number }[] => nodes.flatMap(pointsOf);

/** A realistic bathroom footprint per fixture, in plan millimetres. */
const FOOTPRINTS: Record<string, Rect> = {
  wc: { x: 1000, y: 2000, w: 400, h: 700 },
  basin: { x: 1000, y: 2000, w: 600, h: 450 },
  shower: { x: 1000, y: 2000, w: 900, h: 900 },
  bathtub: { x: 1000, y: 2000, w: 1700, h: 700 },
};

describe("glyphs-bath — the drawn content of each symbol", () => {
  // The exact primitive budget of each symbol, and what each one buys.
  const COUNTS: Record<string, number> = {
    wc: 5, // cistern · lid lip · bowl · seat · flush button
    basin: 5, // slab · bowl · inner bowl · tap block · spout
    shower: 6, // tray · rim · 2 diagonals · drain ring · waste
    bathtub: 4, // outer rim · well · tap · waste
  };

  for (const [name, f] of GLYPHS) {
    it(`${name} draws exactly ${COUNTS[name]} primitives`, () => {
      expect(draw(f, FOOTPRINTS[name]!)).toHaveLength(COUNTS[name]!);
    });
  }

  it("a wide vanity draws TWO bowls — nine primitives, not five", () => {
    expect(draw(drawBasin, { x: 0, y: 0, w: 1600, h: 500 })).toHaveLength(9);
  });

  it("every node names a glyph weight, and both weights are in use across the four", () => {
    const weights = new Set<string>();
    for (const [name, f] of GLYPHS) {
      for (const n of draw(f, FOOTPRINTS[name]!)) {
        expect(n.lineWeight, `${name}: every glyph node carries a named weight`).toBeDefined();
        expect(n.layer).toBe("furniture");
        weights.add(n.lineWeight!);
      }
    }
    expect(weights).toEqual(new Set(["thin", "extraThin"]));
  });

  it("no symbol emits a text primitive", () => {
    for (const [name, f] of GLYPHS) {
      for (const n of draw(f, FOOTPRINTS[name]!)) {
        expect(n.prim.t, `${name} must draw, not write`).not.toBe("text");
      }
    }
  });

  it("the round details are true circles, not tessellated rings", () => {
    // A drain drawn as a 24-gon lowers to a POLYLINE in the DXF export and shows its facets
    // at any real zoom. One circle prim per named detail is the claim.
    const circles = (name: string, f: Draw): number =>
      draw(f, FOOTPRINTS[name]!).filter((n) => n.prim.t === "circle").length;
    expect(circles("wc", drawWc)).toBe(1); // the flush button
    expect(circles("shower", drawShower)).toBe(2); // drain ring + waste
    expect(circles("bathtub", drawBathtub)).toBe(2); // tap + waste
  });
});

describe("glyphs-bath — every symbol stays inside its footprint", () => {
  // Footprints spanning the plausible range plus the degenerate extremes the fuzz corpus
  // reaches: a sliver either way, and a unit square.
  const RECTS: Rect[] = [
    { x: 0, y: 0, w: 400, h: 700 },
    { x: 1000, y: 2000, w: 900, h: 900 },
    { x: -500, y: -300, w: 1700, h: 700 },
    { x: 0, y: 0, w: 1, h: 10000 },
    { x: 0, y: 0, w: 10000, h: 1 },
    { x: 0, y: 0, w: 1, h: 1 },
  ];

  for (const [name, f] of GLYPHS) {
    it(`${name} draws no ink outside r, at any aspect ratio`, () => {
      for (const r of RECTS) {
        // Slack is relative to the footprint, absorbing the float error of the ellipse
        // tessellation without letting a real overrun through: 1e-9 of the span.
        const eps = Math.max(r.w, r.h) * 1e-9;
        for (const p of allPoints(draw(f, r))) {
          expect(Number.isFinite(p.x), `${name} ${r.w}x${r.h}: finite x`).toBe(true);
          expect(Number.isFinite(p.y), `${name} ${r.w}x${r.h}: finite y`).toBe(true);
          expect(p.x, `${name} ${r.w}x${r.h}: left`).toBeGreaterThanOrEqual(r.x - eps);
          expect(p.x, `${name} ${r.w}x${r.h}: right`).toBeLessThanOrEqual(r.x + r.w + eps);
          expect(p.y, `${name} ${r.w}x${r.h}: top`).toBeGreaterThanOrEqual(r.y - eps);
          expect(p.y, `${name} ${r.w}x${r.h}: bottom`).toBeLessThanOrEqual(r.y + r.h + eps);
        }
      }
    });

    it(`${name} emits a finite radius for every circle it draws`, () => {
      for (const r of RECTS) {
        for (const n of draw(f, r)) {
          if (n.prim.t !== "circle") continue;
          expect(Number.isFinite(n.prim.r)).toBe(true);
          expect(n.prim.r).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  it("the collector is not vacuous — it sees the circles it claims to bound", () => {
    // If `pointsOf` ever stopped reading circles, every bounds law above would pass having
    // checked nothing about the drain, the button or the taps.
    const shower = draw(drawShower, { x: 0, y: 0, w: 900, h: 900 });
    const ring = shower.find((n) => n.prim.t === "circle")!;
    const moved: SceneNode = {
      ...ring,
      prim: {
        ...(ring.prim as { t: "circle"; center: { x: number; y: number }; r: number }),
        center: { x: 5000, y: 0 },
      },
    };
    expect(allPoints([moved]).some((p) => p.x > 900)).toBe(true);
  });
});

describe("glyphs-bath — the double-basin branch", () => {
  const at = (w: number, h: number): number => draw(drawBasin, { x: 0, y: 0, w, h }).length;

  it("switches at exactly aspect ratio 2.2", () => {
    expect(at(219, 100)).toBe(5); // 2.19 — one bowl
    expect(at(221, 100)).toBe(9); // 2.21 — two bowls
  });

  it("the boundary itself is on the double side — the float form got this wrong", () => {
    // `2.2 * 100` is 220.00000000000003, so `w >= 2.2 * h` sent a 220x100 slab, the exact
    // round number an author types AT the threshold, to the single-bowl branch. The integer
    // form `w * 10 >= h * 22` is what makes the rule mean what it says.
    expect(220 >= 2.2 * 100).toBe(false); // the trap, stated
    expect(at(220, 100)).toBe(9); // the rule, as written
  });

  it("puts the two bowls at the quarter points, clear of each other and of the ends", () => {
    const r: Rect = { x: 0, y: 0, w: 1600, h: 500 };
    const bowls = draw(drawBasin, r)
      .filter((n) => n.prim.t === "polygon" && n.prim.pts.length === 24)
      .map((n) => {
        const pts = (n.prim as { t: "polygon"; pts: { x: number; y: number }[] }).pts;
        const xs = pts.map((p) => p.x);
        return { min: Math.min(...xs), max: Math.max(...xs) };
      });
    // Two bowls, each with its 0.8 inner ring: four 24-gons.
    expect(bowls).toHaveLength(4);
    const left = bowls[0]!;
    const right = bowls[2]!;
    expect(left.min).toBeGreaterThan(r.x);
    expect(right.max).toBeLessThan(r.x + r.w);
    expect(left.max).toBeLessThan(right.min); // they do not touch
  });

  it("a zero-depth slab picks a branch instead of dividing by zero", () => {
    for (const n of draw(drawBasin, { x: 0, y: 0, w: 600, h: 0 })) {
      for (const p of pointsOf(n)) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});

describe("glyphs-bath — determinism", () => {
  for (const [name, f] of GLYPHS) {
    it(`${name} is a pure function of its inputs`, () => {
      const r = FOOTPRINTS[name]!;
      expect(draw(f, r)).toEqual(draw(f, r));
    });
  }
});

describe("glyphs-bath — through the compiler, at all four rotations", () => {
  const plan = (category: string, size: string, rot: string): string =>
    `plan "P" { units mm room id=r at (0,0) size 6000x6000 label "R" furniture ${category} at (1000,1000) size ${size}${rot} }`;

  const SIZES: Record<string, string> = {
    wc: "400x700",
    basin: "600x450",
    shower: "900x900",
    bathtub: "1700x700",
  };

  for (const name of Object.keys(SIZES)) {
    it(`${name} compiles clean at 0/90/180/270 and its symbol reaches the SVG`, () => {
      for (const rot of ["", " rotate 90", " rotate 180", " rotate 270"]) {
        const out = compile(plan(name, SIZES[name]!, rot), { noCache: true });
        expect(out.errors, `${name}${rot}`).toEqual([]);
        expect(out.svg.length).toBeGreaterThan(0);
        const scene = toScene(resolve(parse(plan(name, SIZES[name]!, rot)).plan!).ir);
        const furn = scene.nodes.filter((n) => n.layer === "furniture");
        // The fallback path draws ONE rectangle (plus a label); a real symbol draws more.
        expect(furn.length, `${name}${rot} must draw its symbol, not the fallback box`).toBeGreaterThan(1);
      }
    });
  }

  it("a rotated symbol is still inside the declared WxH", () => {
    // Footprint (1000,1000) 1700x700 — the tub, whose asymmetric rim is the one thing here
    // that a wrong swap would push out of bounds.
    for (const rot of [" rotate 90", " rotate 180", " rotate 270"]) {
      const scene = toScene(resolve(parse(plan("bathtub", "1700x700", rot)).plan!).ir);
      for (const n of scene.nodes.filter((n) => n.layer === "furniture")) {
        for (const p of pointsOf(n)) {
          expect(p.x).toBeGreaterThanOrEqual(1000 - 1);
          expect(p.x).toBeLessThanOrEqual(2700 + 1);
          expect(p.y).toBeGreaterThanOrEqual(1000 - 1);
          expect(p.y).toBeLessThanOrEqual(1700 + 1);
        }
      }
    }
  });
});
