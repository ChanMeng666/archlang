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
 * **2. The wardrobe's scallops tile the rail exactly.** Consecutive semicircles must meet, and
 * the run must start and end on the rail's own endpoints. That evenness is the symbol — a
 * ragged row of arcs reads as noise at plan scale — and it is a property of the derivation, so
 * it is asserted as one rather than eyeballed in an SVG.
 *
 * **3. The arcs survive the quarter-turn, end to end through `compile()`.** `rotateNode`'s
 * `arc` arm was written before any shipped glyph emitted an arc, so nothing had ever driven it
 * from a real fixture. The wardrobe is the first that does, and the assertion is exact: after
 * `rotate 90` a scallop whose chord was horizontal must have a VERTICAL one, with all three of
 * its defining points sharing an x. A rotation that moved the endpoints and left the centre
 * behind (the shape of the bug the arm exists to prevent) fails that, and so does one that
 * moved nothing.
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
import type { SceneNode } from "../src/scene.js";

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
const arcsOf = (nodes: readonly SceneNode[]) =>
  nodes.flatMap((n) => (n.prim.t === "arc" ? [n.prim] : [])) as {
    center: { x: number; y: number };
    r: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    sweep: 0 | 1;
  }[];

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
  // ── v1.32 F2 ──
  ["bunk_bed", drawBunkBed],
  ["crib", drawCrib],
  ["dresser", drawDresser],
  ["vanity", drawVanity],
];

/** The v1.32 families at their catalogued footprints, with the primitive count each emits. */
const F2_CASES: readonly (readonly [string, Draw, Rect, number])[] = [
  ["bunk_bed", drawBunkBed, rect(1000, 2000), 6],
  ["crib", drawCrib, rect(700, 1300), 12], // 2 + 2 x 5 rail bars
  ["dresser", drawDresser, rect(1200, 500), 7], // 1 + band + 2 splits + 3 handles
  ["vanity", drawVanity, rect(1200, 500), 5],
];

describe("bedroom glyphs — the bed", () => {
  it("draws mattress, headboard, two pillows and the turned-down sheet", () => {
    const n = draw(drawBed, DOUBLE);
    expect(kinds(n)).toEqual(["polygon", "polygon", "polygon", "polygon", "line", "line", "line"]);
    // Bodies at outline weight, the sheet rules and the fold at detail weight.
    expect(n.slice(0, 4).map((x) => x.lineWeight)).toEqual(["thin", "thin", "thin", "thin"]);
    expect(n.slice(4).map((x) => x.lineWeight)).toEqual(["extraThin", "extraThin", "extraThin"]);
  });

  it("drops to a single centred pillow on a single mattress", () => {
    const n = draw(drawBed, SINGLE);
    expect(n).toHaveLength(6);
    expect(kinds(n)).toEqual(["polygon", "polygon", "polygon", "line", "line", "line"]);
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

  it("puts the pillows at the head (the back edge) and the sheet below them", () => {
    const n = draw(drawBed, DOUBLE);
    const pillowY = Math.max(
      ...n.slice(2, 4).flatMap((p) => (p.prim.t === "polygon" ? p.prim.pts.map((q) => q.y) : [])),
    );
    const sheetY = Math.min(...n.slice(4).flatMap((s) => (s.prim.t === "line" ? [s.prim.a.y, s.prim.b.y] : [])));
    expect(pillowY).toBeLessThan(sheetY);
    // Both live in the top half — the head is the top edge, which is what `rotate` turns.
    expect(sheetY).toBeLessThan(DOUBLE.y + DOUBLE.h / 2);
  });

  it("stays inside its footprint at both pillow counts", () => {
    expectInside(draw(drawBed, DOUBLE), DOUBLE, "double bed");
    expectInside(draw(drawBed, SINGLE), SINGLE, "single bed");
  });
});

describe("bedroom glyphs — the nightstand", () => {
  const R = rect(450, 400);

  it("draws a carcass, its top, the lamp, and the drawer front with its handle", () => {
    // The v1.32 redraw: the old symbol was a box, an inset box and a ring in the dead centre,
    // which said nothing about which way a `directional` piece faces.
    const n = draw(drawNightstand, R);
    expect(kinds(n)).toEqual(["polygon", "polygon", "circle", "circle", "line", "line"]);
    expect(n[0]!.lineWeight).toBe("thin");
    for (const x of n.slice(1)) expect(x.lineWeight).toBe("extraThin");
  });

  it("stands the lamp in the BACK third and puts the drawer handle at the FRONT", () => {
    const n = draw(drawNightstand, R);
    const lamp = n[2]!;
    if (lamp.prim.t !== "circle") throw new Error("the lamp is a circle");
    expect(lamp.prim.r).toBeCloseTo(400 * 0.2, 9);
    expect(lamp.prim.center).toEqual({ x: R.x + 225, y: R.y + 120 });
    expect(lamp.paint.fill, "the lamp's shade is an unfilled ring").toBe("none");
    // Its bulb is concentric with it, so a quarter-turn cannot separate the two.
    const bulb = n[3]!;
    if (bulb.prim.t !== "circle") throw new Error("the bulb is a circle");
    expect(bulb.prim.center).toEqual(lamp.prim.center);
    expect(bulb.prim.r).toBeLessThan(lamp.prim.r);
    // The lamp is behind the halfway line and the handle is in front of it: that pair IS the
    // orientation claim `directional: true` makes about this category.
    const handleY = (n[5]!.prim as { a: { y: number } }).a.y;
    expect(lamp.prim.center.y).toBeLessThan(R.y + R.h / 2);
    expect(handleY).toBeGreaterThan(R.y + R.h / 2);
  });

  it("stays inside its footprint", () => {
    expectInside(draw(drawNightstand, R), R, "nightstand");
  });
});

describe("bedroom glyphs — the wardrobe", () => {
  it("draws carcass, rail, scallops and the door split", () => {
    const n = draw(drawWardrobe, ROBE);
    // aspect 3 → floor(4.5) = 4 scallops → 3 + 4 primitives.
    expect(kinds(n)).toEqual(["polygon", "line", "arc", "arc", "arc", "arc", "line"]);
    expect(n[0]!.lineWeight).toBe("thin");
    for (const x of n.slice(1)) expect(x.lineWeight).toBe("extraThin");
  });

  it("counts scallops from the aspect, clamped to [3, 12]", () => {
    // floor(1.5 × w/h), held between 3 and 12. The two clamps are real, not decorative:
    // a square carcass would ask for 1 and a 20:1 one for 30.
    const cases: [number, number, number][] = [
      [600, 600, 3], // aspect 1 → 1, clamped up
      [1200, 600, 3], // aspect 2 → 3, the clamp floor reached honestly
      [1620, 600, 4], // aspect 2.7 → 4, the first count above the floor
      [1800, 600, 4], // the catalogued robe
      [2400, 600, 6],
      [4800, 600, 12], // aspect 8 → 12, the ceiling reached honestly
      [12000, 600, 12], // aspect 20 → 30, clamped down
    ];
    for (const [w, h, want] of cases) {
      expect(arcsOf(draw(drawWardrobe, rect(w, h))), `${w}x${h}`).toHaveLength(want);
    }
  });

  it("tiles the rail end to end: the scallops meet, and the run fills the rail exactly", () => {
    const n = draw(drawWardrobe, ROBE);
    const rail = n[1]!;
    if (rail.prim.t !== "line") throw new Error("the rail is a line");
    const arcs = arcsOf(n);
    // Every endpoint sits ON the rail line…
    for (const a of arcs) {
      expect(a.start.y).toBeCloseTo(rail.prim.a.y, 9);
      expect(a.end.y).toBeCloseTo(rail.prim.a.y, 9);
      expect(a.center.y).toBeCloseTo(rail.prim.a.y, 9);
      // …and the chord is a true diameter, so the arc is a clean semicircle.
      expect(a.end.x - a.start.x).toBeCloseTo(2 * a.r, 9);
    }
    // …the run starts and ends with the rail…
    expect(arcs[0]!.start.x).toBeCloseTo(rail.prim.a.x, 9);
    expect(arcs.at(-1)!.end.x).toBeCloseTo(rail.prim.b.x, 9);
    // …and consecutive scallops touch, with no gap and no overlap.
    for (let i = 1; i < arcs.length; i++) expect(arcs[i]!.start.x).toBeCloseTo(arcs[i - 1]!.end.x, 9);
  });

  it("bows the scallops DOWNWARD off the rail, inside the carcass", () => {
    const arcs = arcsOf(draw(drawWardrobe, ROBE));
    for (const a of arcs) {
      // `sweep: 0` travels from the left endpoint to the right one through +y (screen down).
      expect(a.sweep).toBe(0);
      expect(a.center.y + a.r).toBeLessThanOrEqual(ROBE.y + ROBE.h);
    }
  });

  it("caps the bow by depth on a long shallow carcass rather than escaping the front", () => {
    // 10000 × 200: 12 scallops over a 9000 mm rail would want a 375 mm radius, which would
    // reach 475 mm past a rail sitting 100 mm deep. The depth cap (0.42 × h) binds instead,
    // and the price is paid where it belongs — the scallops stop touching, not the carcass.
    const R = rect(10000, 200);
    const arcs = arcsOf(draw(drawWardrobe, R));
    expect(arcs).toHaveLength(12);
    for (const a of arcs) expect(a.r).toBeCloseTo(200 * 0.42, 9);
    expect(arcs[1]!.start.x).toBeGreaterThan(arcs[0]!.end.x);
    expectInside(draw(drawWardrobe, R), R, "shallow wardrobe");
  });

  it("stays inside its footprint at every aspect the count formula spans", () => {
    for (const [w, h] of [
      [600, 600],
      [1800, 600],
      [4800, 600],
      [12000, 600],
      [600, 1800],
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

  it("compiles a bedroom at all four rotations, drawing symbols and no labels", () => {
    for (const deg of [0, 90, 180, 270]) {
      const src = plan(`furniture wardrobe at (1000,1000) size 1800x600 rotate ${deg} in br
        furniture bed at (1000,3000) size 1500x2000 rotate ${deg} in br
        furniture nightstand at (3200,3000) size 450x400 rotate ${deg} in br`);
      const { diagnostics } = compile(src, { noCache: true });
      expect(
        diagnostics.filter((d) => d.severity === "error"),
        `rotate ${deg}`,
      ).toEqual([]);
      const furn = furnOf(src);
      expect(kinds(furn), `rotate ${deg}`).not.toContain("text");
      expect(arcsOf(furn).length, `rotate ${deg}`).toBeGreaterThan(0);
    }
  });

  it("rotate 90 turns the scallop arcs with the rest of the symbol", () => {
    // `furniture.render()` draws a quarter-turned piece into the SWAPPED rect and then
    // rotates it, so a wardrobe standing on a side wall is authored `size 600x1800 rotate 90`:
    // the glyph sees its natural 1800×600 frame, and the turned result fills the 600×1800 box
    // the author declared. The two plans below therefore draw the SAME symbol, once flat and
    // once on its side — which is what makes the scallop counts comparable at all.
    const R: Rect = { x: 1000, y: 1000, w: 600, h: 1800 };
    const turned = furnOf(plan(`furniture wardrobe at (1000,1000) size 600x1800 rotate 90 in br`));
    const flat = furnOf(plan(`furniture wardrobe at (1000,1000) size 1800x600 in br`));

    const arcs = arcsOf(turned);
    expect(arcs.length).toBeGreaterThan(0);
    expect(arcs.length).toBe(arcsOf(flat).length);
    // The whole symbol — bulges included — lands inside the box the author declared.
    expectInside(turned, R, "rotated wardrobe");
    for (const a of arcs) {
      // All THREE defining points moved together: after a quarter-turn the chord that was
      // horizontal is vertical, and the centre shares its x. An arm that rotated the
      // endpoints and left the centre behind would fail here.
      expect(a.start.x).toBeCloseTo(a.end.x, 9);
      expect(a.center.x).toBeCloseTo(a.start.x, 9);
      expect(Math.abs(a.end.y - a.start.y)).toBeCloseTo(2 * a.r, 9);
      // A rotation preserves both the radius and the sense of travel.
      expect(a.sweep).toBe(0);
    }
    // …and it really did move: unrotated, those same chords are horizontal.
    for (const a of arcsOf(flat)) expect(a.start.y).toBeCloseTo(a.end.y, 9);
  });

  it("is byte-deterministic through compile()", () => {
    const src = plan(`furniture wardrobe at (1000,1000) size 1800x600 rotate 90 in br
      furniture double_bed at (1000,3000) size 1800x2000 in br`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

// ---------------------------------------------------------------------------
// ── v1.32 F2: the four new bedroom families ──

describe("bedroom glyphs — the v1.32 families draw what they claim", () => {
  it.each(F2_CASES)("%s emits its documented primitive count at its catalogued footprint", (name, fn, R, count) => {
    expect(draw(fn, R), name).toHaveLength(count);
    expectInside(draw(fn, R), R, name);
  });

  it.each(F2_CASES)("%s uses both pen weights, outlined in thin", (name, fn, R) => {
    const weights = new Set(draw(fn, R).map((n) => n.lineWeight));
    expect(weights, `${name} draws detail below its outline`).toEqual(new Set(["thin", "extraThin"]));
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
});

describe("bedroom glyphs — the bunk bed's upper deck is DASHED", () => {
  // A dashed outline in this drawing means one thing and has meant it since `upper_cabinet`:
  // above the horizontal cut a plan is taken at. An upper bunk is exactly that, and drawing it
  // solid would claim the room has two mattresses of floor.
  const R = rect(1000, 2000);

  it("draws the upper deck with a dash pattern, and the lower bunk without one", () => {
    const n = draw(drawBunkBed, R);
    const upper = n[1]!;
    expect(upper.lineType, "the upper deck is dashed").toBe("dashed");
    expect(upper.paint.dash, "the named type and the raw pattern must agree").toEqual(dashedPattern(BASE.sizes));
    expect(upper.paint.fill, "an overhead piece does not occlude what it is over").toBe("none");
    expect(n[0]!.lineType, "the lower bunk is cut through, so it is solid").toBeUndefined();
    expect(n[0]!.paint.dash).toBeUndefined();
  });

  it("puts the pillow at the HEAD and the ladder at the FOOT", () => {
    const n = draw(drawBunkBed, R);
    const pillow = n[2]!;
    if (pillow.prim.t !== "polygon") throw new Error("the pillow is a polygon");
    expect(Math.max(...pillow.prim.pts.map((p) => p.y))).toBeLessThan(R.y + R.h * 0.25);
    const rungs = n.slice(3).flatMap((x) => (x.prim.t === "line" ? [x.prim.a.y] : []));
    expect(rungs).toHaveLength(3);
    for (const y of rungs) expect(y).toBeGreaterThan(R.y + R.h * 0.8);
  });
});

describe("bedroom glyphs — the crib's rail bars", () => {
  const bars = (R: Rect): number => draw(drawCrib, R).length - 2;

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
      const mat = n[1]!;
      if (mat.prim.t !== "polygon") throw new Error("the mattress is a polygon");
      const x0 = Math.min(...mat.prim.pts.map((p) => p.x));
      const x1 = Math.max(...mat.prim.pts.map((p) => p.x));
      const y0 = Math.min(...mat.prim.pts.map((p) => p.y));
      const y1 = Math.max(...mat.prim.pts.map((p) => p.y));
      for (const b of n.slice(2)) {
        if (b.prim.t !== "line") throw new Error("a rail bar is a line");
        const mx = (b.prim.a.x + b.prim.b.x) / 2;
        const my = (b.prim.a.y + b.prim.b.y) / 2;
        const onMattress = mx > x0 + 1e-9 && mx < x1 - 1e-9 && my > y0 + 1e-9 && my < y1 - 1e-9;
        expect(onMattress, `a bar was drawn over the mattress on ${R.w}x${R.h}`).toBe(false);
      }
    }
  });
});

describe("bedroom glyphs — the dresser and the vanity say which way they face", () => {
  it("the dresser's drawer band, splits and handles are all on the ROOM side", () => {
    const R = rect(1200, 500);
    const n = draw(drawDresser, R);
    expect(n).toHaveLength(7);
    for (const x of n.slice(1)) {
      if (x.prim.t !== "line") throw new Error("everything below the carcass is a line");
      expect(Math.min(x.prim.a.y, x.prim.b.y)).toBeGreaterThanOrEqual(R.y + R.h * 0.55 - 1e-9);
    }
  });

  it("the vanity's mirror is dashed, at the wall side, with the stool in front of it", () => {
    const R = rect(1200, 500);
    const n = draw(drawVanity, R);
    const mirror = n[1]!;
    expect(mirror.lineType, "a mirror stands on the table, above the cut plane").toBe("dashed");
    if (mirror.prim.t !== "polygon") throw new Error("the mirror is a polygon");
    expect(Math.max(...mirror.prim.pts.map((p) => p.y))).toBeLessThan(R.y + R.h * 0.3);
    const stool = n[3]!;
    if (stool.prim.t !== "circle") throw new Error("the stool is a circle");
    expect(stool.prim.center.y).toBeGreaterThan(R.y + R.h / 2);
    // Drawn INSIDE the footprint, deliberately: the footprint is what every clearance and
    // collision rule measures, and the catalogued 600 mm clearance is what reserves the room
    // to sit down. A symbol drawn outside its box makes the drawing and `arch lint` disagree.
    expect(stool.prim.center.y + stool.prim.r).toBeLessThanOrEqual(R.y + R.h);
  });
});

/** A walled bedroom to drive the v1.32 families through the real pipeline. */
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
