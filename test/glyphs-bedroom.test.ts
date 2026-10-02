/**
 * `src/elements/glyphs-bedroom.ts` — the bed, the nightstand and the wardrobe.
 *
 * Three things are worth holding down here, and only one of them is "the drawing looks right".
 *
 * **1. Every coordinate stays inside the footprint, for every glyph and every aspect.** A
 * fixture symbol is drawn into a rect the resolver computed; a primitive that escapes it
 * overlaps whatever stands next to the piece and nothing else in the pipeline would notice.
 * The collector below counts an arc by the bounding box of its whole CIRCLE, not by its three
 * defining points — a semicircle bulges away from its endpoints, and checking the endpoints
 * alone would let the bulge hang out of the carcass unremarked.
 *
 * **2. The wardrobe's rail is the only dashed thing in it, and its hangers cross it.** A joiner's
 * plan draws a wardrobe as a carcass, a door-front line, a divider between door bays, and the
 * hanging rail HIDDEN inside (dashed: above the cut plane and behind a closed door) with short
 * hanger strokes across it. The door-bay count and the hanger count are fraction rules read off
 * the footprint and clamped; each is asserted by counting what was emitted, not by re-running
 * the module's own formula.
 *
 * **3. The dashes survive the quarter-turn, end to end through `compile()`.** After `rotate 90` the
 * rail that was horizontal must be vertical and the hangers across it horizontal, and the dashes
 * must still be the named line type — a rotation that moved the endpoints and dropped the dash
 * (or left the rail where it was) fails that.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import type { GlyphCtx, Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import {
  drawBed,
  drawBunkBed,
  drawCrib,
  drawDoubleBed,
  drawDresser,
  drawNightstand,
  drawVanity,
  drawWardrobe,
} from "../src/elements/glyphs-bedroom.js";
import { CANONICAL_FIXTURES, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { dashedPattern } from "../src/elements/glyph-lib.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import type { SceneNode } from "../src/scene.js";
import { DEFAULT_THEME } from "../src/theme.js";
import { pathExtentPoints } from "./glyph-extent.js";

const BASE = toScene(resolve(parse(`plan "G" { units mm room id=r at (0,0) size 8000x8000 label "R" }`).plan!).ir);

/** A fresh drawing surface — `glyphCtx` accumulates, so never share one between two glyphs. */
const ctx = (): GlyphCtx => glyphCtx(BASE.theme, BASE.sizes);

type Draw = (r: Rect, g: GlyphCtx) => SceneNode[];
const draw = (fn: Draw, r: Rect): SceneNode[] => fn(r, ctx());

/**
 * Every point that bounds `nodes`, as a CONSERVATIVE cover: a circle and an arc each
 * contribute the corners of their full circle's bounding square, so a curve cannot escape the
 * footprint between the points it is defined by.
 */
function coverPoints(nodes: readonly SceneNode[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const n of nodes) {
    const p = n.prim;
    if (p.t === "polygon") pts.push(...p.pts);
    else if (p.t === "line") pts.push(p.a, p.b);
    else if (p.t === "arc" || p.t === "circle")
      pts.push({ x: p.center.x - p.r, y: p.center.y - p.r }, { x: p.center.x + p.r, y: p.center.y + p.r });
    // A curved outline: its vertices and its arcs' axis extremes (never a centre — see the helper).
    else if (p.t === "path") pts.push(...pathExtentPoints(p));
    else throw new Error(`bedroom glyphs emit no "${p.t}" primitive`);
  }
  return pts;
}

/** Assert every bounding point of `nodes` lies within `r` (1 mm of slack for float dust). */
function expectInside(nodes: readonly SceneNode[], r: Rect, what: string): void {
  for (const p of coverPoints(nodes)) {
    expect(p.x, `${what}: x`).toBeGreaterThanOrEqual(r.x - 1);
    expect(p.x, `${what}: x`).toBeLessThanOrEqual(r.x + r.w + 1);
    expect(p.y, `${what}: y`).toBeGreaterThanOrEqual(r.y - 1);
    expect(p.y, `${what}: y`).toBeLessThanOrEqual(r.y + r.h + 1);
  }
}

const kinds = (nodes: readonly SceneNode[]): string[] => nodes.map((n) => n.prim.t);

/** Does the drawing differ from its own mirror image about the footprint's vertical centre line? */
const handed = (fn: Draw, r: Rect): boolean => {
  const nodes = draw(fn, r);
  return !marksEqual(
    nodes,
    nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
  );
};
/** A bed footprint `h` deep and `w` wide, offset off the origin so a sign error cannot hide. */
const rect = (w: number, h: number): Rect => ({ x: 2000, y: 3000, w, h });

const DOUBLE = rect(1500, 2000); // 0.75 — two pillows
const SINGLE = rect(900, 2000); // 0.45 — one
const ROBE = rect(1800, 600); // aspect 3 — the catalogued wardrobe footprint

/** Footprints a glyph must survive without throwing or emitting a non-finite coordinate. */
const DEGENERATE: Rect[] = [
  { x: 0, y: 0, w: 10000, h: 10 },
  { x: 0, y: 0, w: 10, h: 10000 },
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 500 },
  { x: 0, y: 0, w: 500, h: 0 },
  { x: 0, y: 0, w: -100, h: 200 },
];

const ALL: [string, Draw][] = [
  ["bed", drawBed],
  ["double_bed", drawDoubleBed],
  ["nightstand", drawNightstand],
  ["wardrobe", drawWardrobe],
  // ── bedroom additions ──
  ["bunk_bed", drawBunkBed],
  ["crib", drawCrib],
  ["dresser", drawDresser],
  ["vanity", drawVanity],
];

/** The new bedroom families at their catalogued footprints, with the primitive count each emits. */
const F2_CASES: readonly (readonly [string, Draw, Rect, number])[] = [
  ["bunk_bed", drawBunkBed, rect(1000, 2000), 9], // frame, headboard, mattress, pillow, dashed deck, ladder + 3 rungs
  ["crib", drawCrib, rect(700, 1300), 14], // frame, mattress, blanket + band, 2 x 5 rail bars
  ["dresser", drawDresser, rect(1200, 500), 7], // carcass + 3 drawer fronts, each with a pull
  ["vanity", drawVanity, rect(1200, 500), 8], // top, dashed mirror, 2 pedestals + pulls, stool + ring
];

describe("bedroom glyphs — the bed", () => {
  it("draws mattress, headboard, two pillows, the duvet, its turned-down band and the folded corner", () => {
    const n = draw(drawBed, DOUBLE);
    expect(kinds(n)).toEqual(["path", "path", "path", "path", "polygon", "polygon", "polygon"]);
    // The mattress and headboard are the outline; pillows, duvet, band and flap are detail.
    expect(n.map((x) => x.lineWeight)).toEqual([
      "thin",
      "thin",
      "extraThin",
      "extraThin",
      "extraThin",
      "extraThin",
      "extraThin",
    ]);
    // The soft surfaces read white: the pillows, the turned-down band and the flap.
    expect([2, 3, 5, 6].map((i) => n[i]!.paint.fill)).toEqual(Array(4).fill(DEFAULT_THEME.opening));
  });

  it("drops to a single centred pillow on a single mattress", () => {
    const n = draw(drawBed, SINGLE);
    expect(n).toHaveLength(6);
    expect(kinds(n)).toEqual(["path", "path", "path", "polygon", "polygon", "polygon"]);
  });

  it("switches at aspect 0.6 — 1200 mm on a 2000-long bed, the single/double split", () => {
    // The branch is a `>=`, so the boundary itself takes two pillows and a hair under takes one.
    expect(draw(drawBed, rect(1200, 2000))).toHaveLength(7);
    expect(draw(drawBed, rect(1199, 2000))).toHaveLength(6);
  });

  it("reads the SHAPE, not the category — `bed` and `double_bed` are one drawing", () => {
    // A `bed` at double size gets two pillows; a `double_bed` cramped to a single gets one.
    expect(draw(drawBed, DOUBLE)).toHaveLength(7);
    expect(draw(drawDoubleBed, SINGLE)).toHaveLength(6);
    // …and at the same footprint the two categories are byte-for-byte the same nodes.
    expect(draw(drawBed, DOUBLE)).toEqual(draw(drawDoubleBed, DOUBLE));
  });

  it("puts the pillows at the head (the back edge) and the duvet below them", () => {
    const n = draw(drawBed, DOUBLE);
    const pillowY = Math.max(...coverPoints(n.slice(2, 4)).map((q) => q.y));
    const duvetY = Math.min(...coverPoints(n.slice(4, 5)).map((q) => q.y));
    expect(pillowY).toBeLessThan(duvetY);
    // The duvet's head is at 30% of the length and the pillows sit above it.
    expect(duvetY).toBeCloseTo(DOUBLE.y + DOUBLE.h * 0.3, 9);
  });

  it("folds ONE corner of the duvet back at 45° — at the foot, on the right — which makes it handed", () => {
    const n = draw(drawBed, DOUBLE);
    const flap = n.at(-1)!;
    if (flap.prim.t !== "polygon") throw new Error("the flap is a triangle");
    expect(flap.prim.pts).toHaveLength(3);
    const xs = flap.prim.pts.map((q) => q.x);
    const ys = flap.prim.pts.map((q) => q.y);
    expect(Math.min(...xs)).toBeGreaterThan(DOUBLE.x + DOUBLE.w / 2); // right half
    expect(Math.min(...ys)).toBeGreaterThan(DOUBLE.y + DOUBLE.h * 0.8); // at the foot
    // A right isosceles triangle: the fold line is at 45°.
    const [a, b] = flap.prim.pts;
    expect(Math.abs(b!.x - a!.x)).toBeCloseTo(Math.abs(b!.y - a!.y), 9);
  });

  it("stays inside its footprint at both pillow counts", () => {
    expectInside(draw(drawBed, DOUBLE), DOUBLE, "double bed");
    expectInside(draw(drawBed, SINGLE), SINGLE, "single bed");
  });
});

describe("bedroom glyphs — the nightstand", () => {
  const R = rect(450, 400);

  it("draws a carcass, the top's bevel, the lamp (two concentric circles), and the drawer front with its pull", () => {
    const n = draw(drawNightstand, R);
    expect(kinds(n)).toEqual(["path", "path", "circle", "circle", "line", "line"]);
    expect(n[0]!.lineWeight).toBe("thin");
    for (const x of n.slice(1)) expect(x.lineWeight).toBe("extraThin");
  });

  it("stands the lamp in the BACK third and puts the drawer pull at the FRONT", () => {
    const n = draw(drawNightstand, R);
    const lamp = n[2]!;
    if (lamp.prim.t !== "circle") throw new Error("the lamp is a circle");
    expect(lamp.prim.r).toBeCloseTo(400 * 0.2, 9);
    expect(lamp.prim.center).toEqual({ x: R.x + 225, y: R.y + 400 * 0.34 });
    expect(lamp.paint.fill, "the lamp's shade is white").toBe(DEFAULT_THEME.opening);
    // Its bulb ring is concentric with it, so a quarter-turn cannot separate the two.
    const bulb = n[3]!;
    if (bulb.prim.t !== "circle") throw new Error("the bulb is a circle");
    expect(bulb.prim.center).toEqual(lamp.prim.center);
    expect(bulb.prim.r).toBeLessThan(lamp.prim.r);
    expect(bulb.paint.fill, "the bulb ring is an outline").toBe("none");
    // The lamp is behind the halfway line and the pull is in front of it: that pair IS the
    // orientation claim `directional: true` makes about this category.
    const pullY = (n[5]!.prim as { a: { y: number } }).a.y;
    const drawerY = (n[4]!.prim as { a: { y: number } }).a.y;
    expect(lamp.prim.center.y).toBeLessThan(R.y + R.h / 2);
    expect(drawerY).toBeGreaterThan(R.y + R.h / 2);
    expect(pullY).toBeGreaterThan(drawerY);
  });

  it("stays inside its footprint", () => {
    expectInside(draw(drawNightstand, R), R, "nightstand");
  });
});

describe("bedroom glyphs — the wardrobe", () => {
  /** Every line of the wardrobe, as `[a, b, node]`. */
  const linesOf = (R: Rect) =>
    draw(drawWardrobe, R).flatMap((n) => (n.prim.t === "line" ? [{ a: n.prim.a, b: n.prim.b, n }] : []));
  const dashedOf = (R: Rect) => linesOf(R).filter((l) => l.n.lineType === "dashed");
  /** The full-depth dividers: solid lines as long as the carcass is deep. */
  const dividersOf = (R: Rect) =>
    linesOf(R).filter((l) => l.n.lineType !== "dashed" && Math.abs(l.b.y - l.a.y) > R.h - 1e-6 && l.a.x === l.b.x);
  /** The hangers: solid vertical lines shorter than the carcass (0.7 of the depth). */
  const hangersOf = (R: Rect) =>
    linesOf(R).filter((l) => l.n.lineType !== "dashed" && l.a.x === l.b.x && Math.abs(l.b.y - l.a.y) < R.h * 0.9);

  it("draws the carcass, the door-front line, the dividers, a dashed rail per bay and the hangers", () => {
    const n = draw(drawWardrobe, ROBE);
    // 1800 x 600: three 600 mm bays, so 2 dividers, 3 rails and 4 hangers a bay.
    expect(n).toHaveLength(1 + 1 + 2 + 3 + 12);
    expect(kinds(n)).toEqual(["path", ...Array(18).fill("line")]);
    expect(n[0]!.lineWeight).toBe("thin");
    for (const x of n.slice(1)) expect(x.lineWeight).toBe("extraThin");
  });

  it("counts door bays from the aspect — a bay per 0.875 depths of width — clamped to [1, 5]", () => {
    const cases: [number, number, number][] = [
      [600, 600, 1], // 0.69 → 1, a single door
      [1200, 600, 2], // 600 mm doors
      [1400, 600, 3], // 467 mm doors
      [1800, 600, 3], // the catalogued robe: three 600 mm doors
      [2400, 600, 5], // 4.57 → 5
      [12000, 600, 5], // clamped down
      [550, 1800, 1], // a deep, narrow carcass (the hillside-villa robe) is one bay
    ];
    for (const [w, h, bays] of cases) {
      expect(dashedOf(rect(w, h)), `${w}x${h}: one rail a bay`).toHaveLength(bays);
      expect(dividersOf(rect(w, h)), `${w}x${h}: a divider between bays`).toHaveLength(bays - 1);
    }
  });

  it("draws the door-front line 4% of the depth in from the FRONT (bottom) face, the full width", () => {
    const front = linesOf(ROBE).find((l) => l.a.y === l.b.y && l.n.lineType !== "dashed")!;
    expect(front.a.y).toBeCloseTo(ROBE.y + ROBE.h * 0.96, 9);
    expect(front.a.x).toBeCloseTo(ROBE.x, 9);
    expect(front.b.x).toBeCloseTo(ROBE.x + ROBE.w, 9);
  });

  it("draws the rail DASHED at mid-depth, and draws nothing else dashed", () => {
    const n = draw(drawWardrobe, ROBE);
    const dashed = n.filter((x) => x.lineType === "dashed");
    expect(dashed).toHaveLength(3);
    for (const x of dashed) {
      // The named line type and the raw pattern must agree (the SVG follows one, the PDF the other).
      expect(x.paint.dash).toEqual(dashedPattern(BASE.sizes));
      if (x.prim.t !== "line") throw new Error("the rail is a line");
      expect(x.prim.a.y).toBeCloseTo(ROBE.y + ROBE.h / 2, 9);
      expect(x.prim.b.y).toBeCloseTo(ROBE.y + ROBE.h / 2, 9);
    }
    // The carcass and everything else is solid: a dash means "hidden or above the cut", only.
    for (const x of n.filter((y) => y.lineType !== "dashed")) expect(x.paint.dash).toBeUndefined();
  });

  it("keeps each rail inside its bay, clear of the dividers", () => {
    const bayW = ROBE.w / 3;
    dashedOf(ROBE).forEach((l, i) => {
      expect(l.a.x).toBeGreaterThan(ROBE.x + bayW * i);
      expect(l.b.x).toBeLessThan(ROBE.x + bayW * (i + 1));
    });
  });

  it("hangs short strokes ACROSS the rail: 70% of the depth, centred on it, clamped to [3, 5] a bay", () => {
    const hangers = hangersOf(ROBE);
    expect(hangers).toHaveLength(12);
    for (const h of hangers) {
      expect(Math.abs(h.b.y - h.a.y)).toBeCloseTo(ROBE.h * 0.7, 9);
      expect((h.a.y + h.b.y) / 2).toBeCloseTo(ROBE.y + ROBE.h / 2, 9);
    }
    // No hanger lies on a divider.
    const dividers = dividersOf(ROBE).map((d) => d.a.x);
    for (const h of hangers) for (const x of dividers) expect(Math.abs(h.a.x - x)).toBeGreaterThan(1);
    // The clamps are real: a 300 x 600 carcass asks for round(264 / 120) = 2 a bay and gets the floor
    // of 3; 12000 x 600 asks for 18 a bay and gets the ceiling of 5, in 5 bays.
    expect(hangersOf(rect(300, 600))).toHaveLength(3);
    expect(hangersOf(rect(12000, 600))).toHaveLength(5 * 5);
  });

  it("is symmetric about its vertical axis — a robe has no hand", () => {
    for (const R of [ROBE, rect(1400, 600), rect(2400, 600), rect(600, 600)]) {
      expect(handed(drawWardrobe, R), `${R.w}x${R.h}`).toBe(false);
    }
  });

  it("stays inside its footprint at every aspect the count formulas span", () => {
    for (const [w, h] of [
      [600, 600],
      [1800, 600],
      [4800, 600],
      [12000, 600],
      [600, 1800],
      [10000, 10],
      [10, 10000],
    ] as const) {
      const R = rect(w, h);
      expectInside(draw(drawWardrobe, R), R, `wardrobe ${w}x${h}`);
    }
  });
});

describe("bedroom glyphs — shared laws", () => {
  it("emit no text primitive (a symbol is drawn, never spelled)", () => {
    for (const [name, fn] of ALL) {
      for (const R of [DOUBLE, SINGLE, ROBE, rect(450, 400)]) {
        expect(kinds(draw(fn, R)), name).not.toContain("text");
      }
    }
  });

  it("are pure functions of the rect — two calls agree exactly", () => {
    for (const [name, fn] of ALL) {
      expect(draw(fn, ROBE), name).toEqual(draw(fn, ROBE));
      expect(draw(fn, DOUBLE), name).toEqual(draw(fn, DOUBLE));
    }
  });

  it("survive a degenerate footprint: no throw, no NaN, no Infinity", () => {
    for (const [name, fn] of ALL) {
      for (const R of DEGENERATE) {
        const nodes = draw(fn, R);
        for (const p of coverPoints(nodes)) {
          expect(Number.isFinite(p.x), `${name} ${R.w}x${R.h}: x`).toBe(true);
          expect(Number.isFinite(p.y), `${name} ${R.w}x${R.h}: y`).toBe(true);
        }
        for (const n of nodes) {
          if (n.prim.t === "circle" || n.prim.t === "arc")
            expect(Number.isFinite(n.prim.r) && n.prim.r >= 0, `${name} ${R.w}x${R.h}: radius`).toBe(true);
          if (n.prim.t === "path")
            for (const lp of n.prim.loops)
              for (const e of lp.edges)
                if (e.t === "arc") expect(Number.isFinite(e.r) && e.r >= 0, `${name} ${R.w}x${R.h}: radius`).toBe(true);
        }
      }
    }
  });
});

/**
 * The glyphs through the real pipeline. `furniture.render()` draws into a rect whose sides are
 * SWAPPED for a quarter-turn and then rotates about the footprint centre, so a plan is the only
 * place the two halves of that contract are exercised together.
 */
describe("bedroom glyphs — in a plan", () => {
  const plan = (body: string) => `plan "P" {
    units mm
    wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
    room id=br at (0,0) size 6000x6000 label "Bedroom"
    ${body}
  }`;
  const furnOf = (src: string): SceneNode[] =>
    toScene(resolve(parse(src).plan!).ir).nodes.filter((n) => n.layer === "furniture");
  const lines = (nodes: readonly SceneNode[]) =>
    nodes.flatMap((n) => (n.prim.t === "line" ? [{ a: n.prim.a, b: n.prim.b, dashed: n.lineType === "dashed" }] : []));

  it("compiles a bedroom at all four rotations, drawing symbols and no labels", () => {
    for (const deg of [0, 90, 180, 270]) {
      // A quarter-turned piece is authored with its SWAPPED declared size, so the glyph always sees
      // its natural 1800x600 frame (see the rotate-90 test below).
      const robe = deg % 180 === 0 ? "1800x600" : "600x1800";
      const src = plan(`furniture wardrobe at (1000,1000) size ${robe} rotate ${deg} in br
        furniture bed at (1000,3000) size 1500x2000 rotate ${deg} in br
        furniture nightstand at (3200,3000) size 450x400 rotate ${deg} in br`);
      const { diagnostics } = compile(src, { noCache: true });
      expect(
        diagnostics.filter((d) => d.severity === "error"),
        `rotate ${deg}`,
      ).toEqual([]);
      const furn = furnOf(src);
      expect(kinds(furn), `rotate ${deg}`).not.toContain("text");
      // The wardrobe's three rails are the dashes in this plan (a bed and a nightstand draw none).
      expect(furn.filter((n) => n.lineType === "dashed").length, `rotate ${deg}`).toBe(3);
    }
  });

  it("rotate 90 turns the rail and its hangers with the rest of the symbol", () => {
    // `furniture.render()` draws a quarter-turned piece into the SWAPPED rect and then rotates it,
    // so a wardrobe standing on a side wall is authored `size 600x1800 rotate 90`: the glyph sees
    // its natural 1800x600 frame, and the turned result fills the 600x1800 box the author declared.
    const R: Rect = { x: 1000, y: 1000, w: 600, h: 1800 };
    const turned = furnOf(plan(`furniture wardrobe at (1000,1000) size 600x1800 rotate 90 in br`));
    const flat = furnOf(plan(`furniture wardrobe at (1000,1000) size 1800x600 in br`));

    const rails = lines(turned).filter((l) => l.dashed);
    expect(rails).toHaveLength(3);
    // After a quarter-turn the rail that was horizontal is vertical…
    for (const l of rails) expect(l.a.x).toBeCloseTo(l.b.x, 9);
    // …it is still the NAMED dashed type, with its raw pattern…
    for (const n of turned.filter((x) => x.lineType === "dashed")) expect(n.paint.dash).toBeDefined();
    // …the hangers across it are horizontal and 70% of the 600 mm depth…
    const hangers = lines(turned).filter((l) => !l.dashed && l.a.y === l.b.y && Math.abs(l.b.x - l.a.x) < 500);
    expect(hangers).toHaveLength(12);
    for (const h of hangers) expect(Math.abs(h.b.x - h.a.x)).toBeCloseTo(600 * 0.7, 6);
    // …and the whole symbol — rail and hangers included — lands inside the box the author declared.
    expectInside(turned, R, "rotated wardrobe");
    // …and it really did move: unrotated, the rails run along x.
    for (const l of lines(flat).filter((x) => x.dashed)) expect(l.a.y).toBeCloseTo(l.b.y, 9);
  });

  it("is byte-deterministic through compile()", () => {
    const src = plan(`furniture wardrobe at (1000,1000) size 1800x600 rotate 90 in br
      furniture double_bed at (1000,3000) size 1800x2000 in br`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

// ---------------------------------------------------------------------------
// ── the four new bedroom families ──

describe("bedroom glyphs — the v1.32 families draw what they claim", () => {
  it.each(F2_CASES)("%s emits its documented primitive count at its catalogued footprint", (name, fn, R, count) => {
    expect(draw(fn, R), name).toHaveLength(count);
    expectInside(draw(fn, R), R, name);
  });

  it.each(F2_CASES)("%s uses both pen weights, outlined in thin", (name, fn, R) => {
    const weights = new Set(draw(fn, R).map((n) => n.lineWeight));
    expect(weights, `${name} draws detail below its outline`).toEqual(new Set(["thin", "extraThin"]));
  });

  it.each(F2_CASES)("%s emits its outline first, as a filled path", (name, fn, R) => {
    const first = draw(fn, R)[0]!;
    expect(first.prim.t, name).toBe("path");
    expect(first.lineWeight, name).toBe("thin");
    expect(first.paint.fill, name).toBe(DEFAULT_THEME.furnitureFill);
  });

  it("every new name and alias dispatches to a drawn symbol", () => {
    for (const c of ["bunk_bed", "crib", "cot", "dresser", "chest_of_drawers", "vanity", "dressing_table"]) {
      expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
    }
  });

  it("the four are a contiguous block of the canonical vocabulary, in order", () => {
    // Derived, not retyped — this table's order is the LEGEND's order, so appending elsewhere
    // or re-ordering it moves the legend of every shipped plan that draws a robe.
    const names = ["bunk_bed", "crib", "dresser", "vanity"];
    const start = CANONICAL_FIXTURES.indexOf(names[0]!);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(CANONICAL_FIXTURES.slice(start, start + names.length)).toEqual(names);
  });

  it("none of the bedroom symbols has a hand: each maps onto its own mirror image", () => {
    // Only the BED is handed, deliberately (its folded corner). Everything beside it is symmetric
    // about the vertical axis — a hand here would flip a mirrored `place` for no reason.
    for (const [name, fn, R] of [
      ["nightstand", drawNightstand, rect(450, 400)] as const,
      ["wardrobe", drawWardrobe, ROBE] as const,
      ...F2_CASES,
    ]) {
      expect(handed(fn, R), name).toBe(false);
    }
    expect(handed(drawBed, DOUBLE), "the folded corner is the bed's one hand").toBe(true);
  });
});

describe("bedroom glyphs — the bunk bed's upper deck is DASHED", () => {
  // A dashed outline in this drawing means one thing and has meant it since `upper_cabinet`:
  // above the horizontal cut a plan is taken at. An upper bunk is exactly that, and drawing it
  // solid would claim the room has two mattresses of floor.
  const R = rect(1000, 2000);
  const extent = (n: SceneNode) => {
    const pts = coverPoints([n]);
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      x1: Math.max(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      y1: Math.max(...pts.map((p) => p.y)),
    };
  };

  it("draws the upper deck with a dash pattern, and nothing else dashed", () => {
    const n = draw(drawBunkBed, R);
    const dashed = n.filter((x) => x.lineType === "dashed");
    expect(dashed, "exactly one dashed node: the deck").toHaveLength(1);
    const upper = dashed[0]!;
    expect(upper.prim.t, "a rounded deck is a path").toBe("path");
    expect(upper.paint.dash, "the named type and the raw pattern must agree").toEqual(dashedPattern(BASE.sizes));
    expect(upper.paint.fill, "an overhead piece does not occlude what it is over").toBe("none");
    expect(n[0]!.lineType, "the lower bunk is cut through, so it is solid").toBeUndefined();
    expect(n[0]!.paint.dash).toBeUndefined();
  });

  it("nests the frame, the deck's guard rail and the lower mattress, a rail's width apart", () => {
    const n = draw(drawBunkBed, R);
    const frame = extent(n[0]!);
    const mattress = extent(n[2]!);
    const upper = extent(n.find((x) => x.lineType === "dashed")!);
    // post → rail → mattress, on both sides: each outline stands inside the one before it.
    expect(upper.x0).toBeGreaterThan(frame.x0);
    expect(mattress.x0).toBeGreaterThan(upper.x0);
    expect(upper.x1).toBeLessThan(frame.x1);
    expect(mattress.x1).toBeLessThan(upper.x1);
    expect(upper.y0).toBeGreaterThan(frame.y0 + R.h * 0.045); // below the headboard band
    expect(mattress.y0).toBeGreaterThan(upper.y0);
    expect(mattress.y1).toBeLessThan(upper.y1);
  });

  it("puts the pillow at the HEAD and the ladder at the FOOT", () => {
    const n = draw(drawBunkBed, R);
    const pillow = extent(n[3]!);
    expect(pillow.y1).toBeLessThan(R.y + R.h * 0.25);
    const ladder = extent(n[5]!);
    expect(ladder.y0).toBeGreaterThan(R.y + R.h * 0.8);
    // The three rungs are inside the ladder's frame, across it.
    const rungs = n.slice(6).flatMap((x) => (x.prim.t === "line" ? [x.prim] : []));
    expect(rungs).toHaveLength(3);
    for (const g of rungs) {
      expect(g.a.y).toBeCloseTo(g.b.y, 9);
      expect(g.a.y).toBeGreaterThan(ladder.y0);
      expect(g.a.y).toBeLessThan(ladder.y1);
    }
  });
});

describe("bedroom glyphs — the crib's rail bars", () => {
  const bars = (R: Rect): number => draw(drawCrib, R).length - 4;

  it("draws a clamped run down BOTH long faces", () => {
    expect(bars(rect(700, 1300))).toBe(10); // 5 a side
    expect(bars(rect(700, 700))).toBe(6); // aspect 1 → 2.5, clamped up to 3 a side
    expect(bars(rect(10000, 10))).toBe(14); // clamped down to 7 a side
  });

  it("reads its own long axis, so a cot against a side wall draws the same object", () => {
    expect(bars(rect(700, 1300))).toBe(bars(rect(1300, 700)));
  });

  it("puts the bars in the band between the carcass and the mattress, never across it", () => {
    // Stated orientation-free — a bar's MIDPOINT must lie outside the mattress rectangle — so
    // the assertion holds for a cot drawn either way up rather than pinning one axis and going
    // quietly vacuous on the other.
    for (const R of [rect(700, 1300), rect(1300, 700)]) {
      const n = draw(drawCrib, R);
      const mat = coverPoints([n[1]!]);
      const x0 = Math.min(...mat.map((p) => p.x));
      const x1 = Math.max(...mat.map((p) => p.x));
      const y0 = Math.min(...mat.map((p) => p.y));
      const y1 = Math.max(...mat.map((p) => p.y));
      for (const b of n.slice(4)) {
        if (b.prim.t !== "line") throw new Error("a rail bar is a line");
        const mx = (b.prim.a.x + b.prim.b.x) / 2;
        const my = (b.prim.a.y + b.prim.b.y) / 2;
        const onMattress = mx > x0 + 1e-9 && mx < x1 - 1e-9 && my > y0 + 1e-9 && my < y1 - 1e-9;
        expect(onMattress, `a bar was drawn over the mattress on ${R.w}x${R.h}`).toBe(false);
      }
    }
  });

  it("lays the blanket from a third of the mattress to the foot, its white band at the head end", () => {
    const R = rect(700, 1300);
    const n = draw(drawCrib, R);
    const mat = coverPoints([n[1]!]);
    const matTop = Math.min(...mat.map((p) => p.y));
    const matBottom = Math.max(...mat.map((p) => p.y));
    const blanket = coverPoints([n[2]!]);
    const band = coverPoints([n[3]!]);
    expect(Math.min(...blanket.map((p) => p.y))).toBeGreaterThan(matTop + (matBottom - matTop) * 0.3);
    expect(Math.max(...blanket.map((p) => p.y))).toBeLessThan(matBottom);
    // The turned-down band is the blanket's head end: it starts where the blanket does.
    expect(Math.min(...band.map((p) => p.y))).toBeCloseTo(Math.min(...blanket.map((p) => p.y)), 6);
    expect(n[3]!.paint.fill).toBe(DEFAULT_THEME.opening);
  });
});

describe("bedroom glyphs — the dresser and the vanity say which way they face", () => {
  it("the dresser's drawer fronts and pulls are all on the ROOM side", () => {
    const R = rect(1200, 500);
    const n = draw(drawDresser, R);
    expect(n).toHaveLength(7);
    for (const x of n.slice(1)) {
      // Each drawer front is a path and each pull a line; every one starts at or past mid-depth.
      expect(Math.min(...coverPoints([x]).map((p) => p.y))).toBeGreaterThanOrEqual(R.y + R.h * 0.5 - 1e-9);
    }
  });

  it("counts drawers from the width — one per 0.8 depths, clamped to [2, 6]", () => {
    const drawers = (R: Rect): number => (draw(drawDresser, R).length - 1) / 2;
    expect(drawers(rect(1200, 500))).toBe(3);
    expect(drawers(rect(600, 500))).toBe(2); // 1.5 → 2, and a floor of 2
    expect(drawers(rect(4000, 500))).toBe(6); // clamped down
    expect(drawers(rect(10000, 10))).toBe(6);
  });

  it("the vanity's mirror is dashed, at the wall side, with the stool between the pedestals in front of it", () => {
    const R = rect(1200, 500);
    const n = draw(drawVanity, R);
    expect(n).toHaveLength(8);
    const mirror = n[1]!;
    expect(mirror.lineType, "a mirror stands on the table, above the cut plane").toBe("dashed");
    expect(
      n.filter((x) => x.lineType === "dashed"),
      "and nothing else is dashed",
    ).toHaveLength(1);
    if (mirror.prim.t !== "polygon") throw new Error("the mirror is a polygon");
    expect(Math.max(...mirror.prim.pts.map((p) => p.y))).toBeLessThan(R.y + R.h * 0.3);
    const stool = n[6]!;
    if (stool.prim.t !== "circle") throw new Error("the stool is a circle");
    expect(stool.prim.center.y).toBeGreaterThan(R.y + R.h / 2);
    expect(stool.paint.fill, "a stool's seat is upholstered").toBe(DEFAULT_THEME.opening);
    // The stool sits between the two pedestals, not on one.
    for (const i of [2, 4]) {
      const ped = coverPoints([n[i]!]);
      const near = i === 2 ? Math.max(...ped.map((p) => p.x)) : Math.min(...ped.map((p) => p.x));
      expect(Math.abs(stool.prim.center.x - near)).toBeGreaterThan(stool.prim.r);
    }
    // Drawn INSIDE the footprint, deliberately: the footprint is what every clearance and
    // collision rule measures, and the catalogued 600 mm clearance is what reserves the room
    // to sit down. A symbol drawn outside its box makes the drawing and `arch lint` disagree.
    expect(stool.prim.center.y + stool.prim.r).toBeLessThanOrEqual(R.y + R.h);
  });
});

/** A walled bedroom to drive the new bedroom families through the real pipeline. */
const plan2 = (body: string): string => `plan "P" {
    units mm
    wall id=w exterior thickness 200 { (0,0) (6000,6000) (0,6000) (0,0) close }
    room id=br at (0,0) size 6000x6000 label "Bedroom"
    ${body}
  }`;

describe("bedroom glyphs — the v1.32 families in a plan", () => {
  it("compile at all four rotations, drawing symbols and no labels", () => {
    for (const deg of [0, 90, 180, 270]) {
      const src = plan2(`furniture bunk_bed at (400,400) size 1000x2000 rotate ${deg} in br
        furniture crib at (1800,400) size 700x1300 rotate ${deg} in br
        furniture dresser at (2800,400) size 1200x500 rotate ${deg} in br
        furniture vanity at (400,3000) size 1200x500 rotate ${deg} in br`);
      const { diagnostics } = compile(src, { noCache: true });
      expect(
        diagnostics.filter((d) => d.severity === "error"),
        `rotate ${deg}`,
      ).toEqual([]);
      expect(compile(src, { noCache: true }).svg, `rotate ${deg} is deterministic`).toBe(
        compile(src, { noCache: true }).svg,
      );
    }
  });
});
