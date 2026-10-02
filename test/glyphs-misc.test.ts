/**
 * `src/elements/glyphs-misc.ts` — the office/misc plan symbols: desk, office chair,
 * bookshelf, plant, car, and the office & commercial families.
 *
 * Five laws are worth holding down here, and only one of them is about how the drawing looks.
 *
 * **1. Nothing leaves its own footprint.** A fixture's footprint is what every clearance,
 * collision and repair rule measures; a symbol that draws outside it makes the drawing and
 * `arch lint` disagree about where the piece is, silently. The containment check below
 * measures a `path` by its vertices and its arcs' axis extremes (`glyph-extent.ts`) and SAMPLES
 * a bare arc along its sweep rather than taking its start/end/centre — the box those three points
 * span misses the whole bulge, which is exactly where a curved backrest lives.
 *
 * **2. The arcs stay minor.** Every backend lowers a Scene `arc` (and a `path`'s arc edge) with the
 * SVG large-arc flag pinned to `0`, so a sweep over 180 degrees is drawn as its complement — in
 * some exports and not others. `glyph-lib.test.ts` holds every glyph's path arcs to 120 degrees;
 * the office chair's crescent, the car's body and the plant's lobes are the curves written here.
 *
 * **3. A repeat count is clamped.** The bookshelf's dividers, the wardrobe-style door bays and the
 * meeting table's chairs are derived from the aspect ratio, so a 10000x1 rect asks for thousands
 * of them. Both ends of every clamp are pinned, by counting what was EMITTED.
 *
 * **4. The plant and the meeting table are genuinely symmetric.** The catalog already claims
 * `symmetric: true` for them, which is a fact orientation reasoning reads. Here it is proved
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
import { pathExtentPoints } from "./glyph-extent.js";
import { weightWidth } from "../src/scene.js";
import { CANONICAL_FIXTURES, hasFixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { dashedPattern, glyphCtx } from "../src/elements/glyph-lib.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { rotateNode } from "../src/elements/furniture.js";
import {
  drawBookshelf,
  drawCar,
  drawDesk,
  drawFilingCabinet,
  drawLocker,
  drawMeetingTable,
  drawOfficeChair,
  drawPlant,
  drawPoolTable,
  drawReceptionDesk,
  drawTreadmill,
} from "../src/elements/glyphs-misc.js";
import { drawDiningTable } from "../src/elements/glyphs-living.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 8000x6000 label "R" }`;
const baseScene = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
const { theme, sizes } = baseScene();

type Draw = (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[];

const draw = (fn: Draw, r: Rect): SceneNode[] => fn(r, glyphCtx(theme, sizes));

/** The symbols under test, by the category name that dispatches to each. */
const GLYPHS: readonly (readonly [string, Draw])[] = [
  ["desk", drawDesk],
  ["office_chair", drawOfficeChair],
  ["bookshelf", drawBookshelf],
  ["plant", drawPlant],
  ["car", drawCar],
  // ── office & commercial additions ──
  ["meeting_table", drawMeetingTable],
  ["reception_desk", drawReceptionDesk],
  ["filing_cabinet", drawFilingCabinet],
  ["locker", drawLocker],
  ["pool_table", drawPoolTable],
  ["treadmill", drawTreadmill],
];

/** A generic footprint: off the origin, wider than deep, no round-number aspect. */
const R: Rect = { x: 1000, y: 2000, w: 1600, h: 700 };

/** A car's footprint, long axis down the page (the aspect the glyph is drawn for). */
const CAR: Rect = { x: 1000, y: 2000, w: 1900, h: 4300 };

/**
 * Primitive counts at {@link R}. The bookshelf's and the locker's are aspect-dependent — 1600/700
 * is 2.29 depths of run, one divider and two bays; two locker doors — so their own clamp cases are
 * pinned separately below.
 */
const EXPECTED_PRIMS: Readonly<Record<string, number>> = {
  // carcass, top bevel, modesty line, dashed pedestal + its 2 drawer lines, monitor.
  desk: 7,
  // seat, crescent back, two armrests, five dashed spokes and the hub.
  office_chair: 10,
  // carcass, back line, 1 divider, then a block and two spines in each of the 2 bays.
  bookshelf: 9,
  // crown, pot ring, eight ribs, stem.
  plant: 11,
  // body, bonnet, boot, windscreen, roof, rear window, two door pillars, two mirrors.
  car: 10,
  // ── office & commercial additions ──, all measured at {@link R} (1600 x 700, aspect 2.29).
  meeting_table: 22, // 2 + 2 x (4 a side + 1 at each end)
  reception_desk: 7, // L counter, 2 ledge lines, 2 nosings, chair seat + back
  filing_cabinet: 6,
  locker: 5, // carcass, front line, 1 split, 2 pulls
  pool_table: 9, // rail, cushion, cloth, 6 pockets
  treadmill: 6, // frame, console, display, 2 platforms, belt
};

/** A redrawn symbol should still be a block, not a hatch: aim for 48 prims, hard cap 72. */
const PRIM_BUDGET = 48;

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
 * primitives a glyph may emit throws, which is what makes "no text primitives" a
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
    // A curved outline: its vertices and its arcs' axis extremes, exactly (`glyph-extent.ts`).
    case "path":
      return pathExtentPoints(p);
    default:
      throw new Error(`a fixture glyph emitted an unexpected primitive: ${p.t}`);
  }
}

/** The axis-aligned extent of one node. */
function extent(n: SceneNode): { x0: number; x1: number; y0: number; y1: number } {
  const pts = boundingPoints(n);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
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
    case "path":
      return `path[${p.loops
        .map(
          (lp) =>
            `${pt(lp.start)}${lp.edges.map((e) => (e.t === "arc" ? ` a${pt(e.to)}@${pt(e.center)}r${f(e.r)}s${e.sweep}` : ` l${pt(e.to)}`)).join("")}`,
        )
        .join(" | ")}]`;
    default:
      throw new Error(`unexpected primitive ${p.t}`);
  }
}

/** Does the drawing differ from its own mirror image about the footprint's vertical centre line? */
const handed = (fn: Draw, r: Rect): boolean => {
  const nodes = draw(fn, r);
  return !marksEqual(
    nodes,
    nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
  );
};

/** The straight segments among `nodes`. */
type Seg = { a: Point; b: Point; dashed: boolean; node: SceneNode };
const segs = (nodes: readonly SceneNode[]): Seg[] =>
  nodes.flatMap((n) =>
    n.prim.t === "line" ? [{ a: n.prim.a, b: n.prim.b, dashed: n.lineType === "dashed", node: n }] : [],
  );

describe("glyphs-misc — what each symbol draws", () => {
  it("every category dispatches to a drawn symbol, aliases included", () => {
    for (const c of ["desk", "office_chair", "bookshelf", "bookcase", "shelf", "plant", "planter", "car"]) {
      expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
    }
  });

  it("draws the expected number of primitives, all within the 48-primitive budget", () => {
    for (const [name, fn] of GLYPHS) {
      const nodes = draw(fn, R);
      expect(nodes.length, `${name} primitive count`).toBe(EXPECTED_PRIMS[name]);
      expect(nodes.length, `${name} is within the budget`).toBeGreaterThanOrEqual(2);
      expect(nodes.length, `${name} is within the budget`).toBeLessThanOrEqual(PRIM_BUDGET);
    }
  });

  it("keeps every primitive inside the footprint", () => {
    for (const [name, fn] of GLYPHS) expectInside(draw(fn, R), R, name);
    expectInside(draw(drawCar, CAR), CAR, "car (portrait)");
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

  it("emits its outline first, as a filled closed shape in the thin pen", () => {
    for (const [name, fn] of GLYPHS) {
      const first = draw(fn, R)[0]!;
      expect(["path", "polygon"], `${name} outline is a closed shape`).toContain(first.prim.t);
      expect(first.lineWeight, `${name} outline is the thin pen`).toBe("thin");
      // The seat is a chair's outline and is upholstered (white); the plant's crown wears the planting tint.
      const fill = name === "plant" ? theme.lawn : name === "office_chair" ? theme.opening : theme.furnitureFill;
      expect(first.paint.fill, `${name} outline fill`).toBe(fill);
    }
  });

  it("is deterministic — two calls produce identical geometry", () => {
    for (const [name, fn] of GLYPHS) {
      const a = draw(fn, R).map(canonical);
      const b = draw(fn, R).map(canonical);
      expect(a, `${name} is deterministic`).toEqual(b);
    }
  });

  it("dashes only what is hidden or above the cut: the desk's pedestal and the chair's star base", () => {
    const dashedBy = (fn: Draw, r: Rect): number => draw(fn, r).filter((n) => n.lineType === "dashed").length;
    expect(dashedBy(drawDesk, R), "desk: pedestal + 2 drawer lines").toBe(3);
    expect(dashedBy(drawOfficeChair, R), "office chair: five spokes").toBe(5);
    for (const [name, fn] of GLYPHS) {
      if (name === "desk" || name === "office_chair") continue;
      expect(dashedBy(fn, R), `${name} draws nothing dashed`).toBe(0);
    }
    // Every dash names its type AND carries the raw pattern — the SVG follows one, the PDF the other.
    for (const fn of [drawDesk, drawOfficeChair]) {
      for (const n of draw(fn, R).filter((x) => x.lineType === "dashed")) {
        expect(n.paint.dash).toEqual(dashedPattern(sizes));
      }
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

  it("draws a top, its bevel, the modesty line, a dashed pedestal with two drawer lines, and a monitor", () => {
    const nodes = draw(drawDesk, R);
    expect(nodes.map((n) => n.prim.t)).toEqual(["path", "path", "line", "polygon", "line", "line", "path"]);
    // The top is filled and its bevel is not; the monitor is a white pane.
    expect(nodes[0]!.paint.fill).toBe(theme.furnitureFill);
    expect(nodes[1]!.paint.fill).toBe("none");
    expect(nodes[6]!.paint.fill).toBe(theme.opening);
    // The pedestal is under the top: dashed and unfilled, so nothing hides what the top hides.
    expect(nodes[3]!.lineType).toBe("dashed");
    expect(nodes[3]!.paint.fill).toBe("none");
  });

  it("puts the pedestal on the right, inside the bevel, with both drawer lines across it", () => {
    const nodes = draw(drawDesk, R);
    const ped = nodes[3]!;
    if (ped.prim.t !== "polygon") throw new Error("the pedestal is a polygon");
    const x0 = Math.min(...ped.prim.pts.map((p) => p.x));
    const x1 = Math.max(...ped.prim.pts.map((p) => p.x));
    expect(x0).toBeGreaterThan(R.x + R.w / 2);
    const bevel = extent(nodes[1]!);
    expect(x1).toBeLessThan(bevel.x1);
    for (const n of [nodes[4]!, nodes[5]!]) {
      if (n.prim.t !== "line") throw new Error("a drawer line is a line");
      expect(n.prim.a.y).toBeCloseTo(n.prim.b.y, 9);
      expect(n.prim.a.x).toBeCloseTo(x0, 9);
      expect(n.prim.b.x).toBeCloseTo(x1, 9);
    }
    // A pedestal at one end is the desk's hand: it is what `place … mirror` has to flip.
    expect(handed(drawDesk, R)).toBe(true);
  });

  it("stands the monitor at the back, behind the modesty panel's working side, over the knee space", () => {
    const nodes = draw(drawDesk, R);
    const modestyY = (nodes[2]!.prim as Extract<SceneNode["prim"], { t: "line" }>).a.y;
    const mon = extent(nodes[6]!);
    const ped = extent(nodes[3]!);
    expect(mon.y0).toBeGreaterThan(modestyY);
    expect(mon.y1).toBeLessThan(R.y + R.h / 2);
    expect(mon.x1).toBeLessThan(ped.x0);
    expect(mon.x1 - mon.x0).toBeGreaterThan(mon.y1 - mon.y0); // a bar, not a box
  });
});

describe("glyphs-misc — the office chair", () => {
  const nodes = draw(drawOfficeChair, R);

  it("draws a rounded seat, a crescent back, two armrests, five dashed spokes and a hub", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual(["path", "path", "path", "path", ...Array(5).fill("line"), "circle"]);
    expect(nodes[0]!.paint.fill, "the seat is upholstered").toBe(theme.opening);
    expect(nodes[1]!.paint.fill, "the back is the body tint").toBe(theme.furnitureFill);
  });

  it("is a crescent: two ARCS between one pair of tips, curved toward the BACK (top) edge", () => {
    const back = nodes[1]!.prim;
    if (back.t !== "path") throw new Error("the back is a path");
    const edges = back.loops[0]!.edges;
    expect(
      edges.every((e) => e.t === "arc"),
      "a lune is bounded by arcs only",
    ).toBe(true);
    const cy = R.y + R.h / 2;
    // The whole crescent stands above the seat's centre — the tips and every extreme.
    const ext = extent(nodes[1]!);
    expect(ext.y1).toBeLessThan(cy);
    expect(ext.y0, "…and inside the footprint").toBeGreaterThanOrEqual(R.y);
    // The seat's top edge is clear of the crescent's inner arc at the middle.
    expect(extent(nodes[0]!).y0).toBeGreaterThan(ext.y0);
  });

  it("flanks the seat with one armrest each side, beside it and not over it", () => {
    const seat = extent(nodes[0]!);
    const l = extent(nodes[2]!);
    const r = extent(nodes[3]!);
    expect(l.x1).toBeLessThan(seat.x0);
    expect(r.x0).toBeGreaterThan(seat.x1);
    // The pair is symmetric about the vertical axis.
    expect(R.x + R.w / 2 - l.x0).toBeCloseTo(r.x1 - (R.x + R.w / 2), 9);
  });

  it("hides a five-pointed star under the seat: a spoke straight to the front, the rest in pairs", () => {
    const spokes = segs(nodes).filter((s) => s.dashed);
    expect(spokes).toHaveLength(5);
    const hub = spokes[0]!.a;
    for (const s of spokes) {
      expect(s.a).toEqual(hub); // every spoke leaves the hub
      expect(Math.hypot(s.b.x - hub.x, s.b.y - hub.y), "all five the same length").toBeCloseTo(
        Math.hypot(spokes[0]!.b.x - hub.x, spokes[0]!.b.y - hub.y),
        9,
      );
    }
    // 72 degrees apart: the angle of each from the front spoke is a multiple of 72.
    const ang = (s: Seg): number => (Math.atan2(s.b.x - hub.x, s.b.y - hub.y) * 180) / Math.PI;
    const sorted = spokes.map(ang).sort((x, y) => x - y);
    expect(sorted[0]).toBeCloseTo(-144, 6);
    expect(sorted[1]).toBeCloseTo(-72, 6);
    expect(sorted[2]).toBeCloseTo(0, 6);
    expect(sorted[3]).toBeCloseTo(72, 6);
    expect(sorted[4]).toBeCloseTo(144, 6);
    // Under the seat: every spoke ends inside the seat's extent.
    const seat = extent(nodes[0]!);
    for (const s of spokes) {
      expect(s.b.x).toBeGreaterThan(seat.x0);
      expect(s.b.x).toBeLessThan(seat.x1);
      expect(s.b.y).toBeGreaterThan(seat.y0);
      expect(s.b.y).toBeLessThan(seat.y1);
    }
  });

  it("has no hand: it maps onto its own mirror image", () => {
    expect(handed(drawOfficeChair, R)).toBe(false);
    expect(handed(drawOfficeChair, { x: 0, y: 0, w: 600, h: 600 })).toBe(false);
  });
});

describe("glyphs-misc — the bookshelf", () => {
  /** Dividers: the solid lines that cross the whole short side, perpendicular to the run. */
  const dividers = (r: Rect): number => {
    const horizontal = r.w >= r.h;
    return segs(draw(drawBookshelf, r)).filter((s) =>
      horizontal
        ? s.a.x === s.b.x && Math.abs(s.b.y - s.a.y) >= r.h - 1e-6
        : s.a.y === s.b.y && Math.abs(s.b.x - s.a.x) >= r.w - 1e-6,
    ).length;
  };

  it("derives the divider count from the aspect ratio", () => {
    // The catalog's own footprint, 900 along x 300 deep: three depths of run, two dividers.
    expect(dividers({ x: 0, y: 0, w: 900, h: 300 })).toBe(2);
    expect(dividers({ x: 0, y: 0, w: 300, h: 900 })).toBe(2); // …and the same run stood on end
  });

  it("clamps to one divider at the floor (a square carcass asks for none)", () => {
    expect(dividers({ x: 0, y: 0, w: 1000, h: 1000 })).toBe(1);
    expect(dividers({ x: 0, y: 0, w: 1000, h: 900 })).toBe(1);
  });

  it("clamps to eight dividers at the ceiling (10000x10 asks for six hundred)", () => {
    expect(dividers({ x: 0, y: 0, w: 10000, h: 10 })).toBe(8);
    expect(dividers({ x: 0, y: 0, w: 10, h: 10000 })).toBe(8);
    expect(dividers({ x: 0, y: 0, w: 10000, h: 1 })).toBe(8);
  });

  it("puts a block of three book spines in every bay, and no more than 48 primitives anywhere", () => {
    for (const r of [
      { x: 0, y: 0, w: 900, h: 300 },
      { x: 0, y: 0, w: 10000, h: 10 },
      { x: 0, y: 0, w: 1000, h: 1000 },
    ]) {
      const n = draw(drawBookshelf, r);
      const bays = dividers(r) + 1;
      // carcass + back line + dividers + (block + 2 spines) a bay
      expect(n, `${r.w}x${r.h}`).toHaveLength(2 + dividers(r) + 3 * bays);
      expect(n.length).toBeLessThanOrEqual(PRIM_BUDGET);
    }
  });

  it("runs its back panel along the LONG axis, whichever axis that is", () => {
    const long = (r: Rect): "x" | "y" => {
      const p = draw(drawBookshelf, r)[1]!.prim as Extract<SceneNode["prim"], { t: "line" }>;
      return Math.abs(p.b.x - p.a.x) > Math.abs(p.b.y - p.a.y) ? "x" : "y";
    };
    expect(long({ x: 0, y: 0, w: 900, h: 300 })).toBe("x");
    expect(long({ x: 0, y: 0, w: 300, h: 900 })).toBe("y");
  });

  it("stands the books off the back panel, inside their bay", () => {
    const r: Rect = { x: 0, y: 0, w: 900, h: 300 };
    const n = draw(drawBookshelf, r);
    const back = (n[1]!.prim as Extract<SceneNode["prim"], { t: "line" }>).a.y;
    expect(back).toBeCloseTo(300 * 0.14, 9);
    // Every block (a path after the carcass) starts below the back panel.
    for (const b of n.slice(2).filter((x) => x.prim.t === "path")) expect(extent(b).y0).toBeGreaterThan(back);
  });

  it("has no hand", () => {
    // At the catalogued footprint (a run along the wall) it is symmetric. Stood on end the back is
    // the LEFT edge, so that drawing is deliberately handed — the same rule as every back-on-a-side symbol.
    expect(handed(drawBookshelf, { x: 0, y: 0, w: 900, h: 300 })).toBe(false);
    expect(handed(drawBookshelf, { x: 0, y: 0, w: 300, h: 900 })).toBe(true);
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
    const original = draw(drawPlant, R);
    for (const deg of [90, 180, 270]) {
      const turned = draw(drawPlant, R).map((n) => rotateNode(n, centre, deg));
      expect(marksEqual(original, turned), `plant at ${deg} degrees`).toBe(true);
    }
  });

  it("has no hand: it maps onto its own mirror image too", () => {
    expect(handed(drawPlant, R)).toBe(false);
  });

  it("draws a lobed crown filled with the planting tint, a pot ring, eight ribs and a stem", () => {
    const nodes = draw(drawPlant, R);
    const crown = nodes[0]!.prim;
    if (crown.t !== "path") throw new Error("the crown is a path");
    // Eight lobes in the tree's [1, 0.9] pattern, each a minor arc or two: a scallop of TRUE arcs.
    expect(crown.loops[0]!.edges.every((e) => e.t === "arc")).toBe(true);
    expect(crown.loops[0]!.edges.length).toBeGreaterThanOrEqual(8);
    const circles = nodes.filter((n) => n.prim.t === "circle");
    const lines = nodes.filter((n) => n.prim.t === "line");
    expect(circles).toHaveLength(2); // the pot ring and the stem
    expect(lines).toHaveLength(8);
    const [pot, stem] = circles.map((n) => n.prim as Extract<SceneNode["prim"], { t: "circle" }>);
    expect(pot!.center).toEqual(stem!.center);
    const rad = Math.min(R.w, R.h) * 0.48;
    expect(pot!.r).toBeCloseTo(rad * 0.42, 9);
    expect(circles[1]!.lineWeight, "the stem is an outline-weight dot, like a tree's trunk").toBe("thin");
    // Each rib leaves the pot ring and stops short of the crown's cusps.
    const d = (p: Point): number => Math.hypot(p.x - pot!.center.x, p.y - pot!.center.y);
    for (const l of lines) {
      const p = l.prim as Extract<SceneNode["prim"], { t: "line" }>;
      expect(d(p.a)).toBeCloseTo(rad * 0.42, 6);
      expect(d(p.b)).toBeCloseTo(rad * 0.7, 6);
    }
  });
});

describe("glyphs-misc — the car", () => {
  const nodes = draw(drawCar, CAR);

  it("draws a body, the bonnet and boot panels, the glass, the roof, two door pillars and two mirrors", () => {
    expect(nodes.map((n) => n.prim.t)).toEqual([
      "path", // body
      "path", // bonnet
      "path", // boot
      "polygon", // windscreen
      "path", // roof
      "polygon", // rear window
      "line",
      "line", // door pillars
      "path",
      "path", // mirrors
    ]);
    expect(nodes[0]!.paint.fill).toBe(theme.furnitureFill);
    expect(nodes[3]!.paint.fill).toBe(theme.opening);
    expect(nodes[5]!.paint.fill).toBe(theme.opening);
  });

  it("rounds the body at both ends, the nose more than the tail", () => {
    const body = nodes[0]!.prim;
    if (body.t !== "path") throw new Error("the body is a path");
    const arcs = body.loops[0]!.edges.flatMap((e) => (e.t === "arc" ? [e] : []));
    expect(arcs).toHaveLength(4);
    // roundedRectPath draws top-right, bottom-right, bottom-left, top-left: the nose is the top.
    expect(arcs[0]!.r).toBeGreaterThan(arcs[1]!.r);
    expect(arcs[3]!.r).toBeCloseTo(arcs[0]!.r, 9);
    expect(arcs[2]!.r).toBeCloseTo(arcs[1]!.r, 9);
    // The body is narrower than the footprint: the mirrors need the room.
    const b = extent(nodes[0]!);
    expect(b.x1 - b.x0).toBeCloseTo(CAR.w * 0.91, 6);
    expect(b.y1 - b.y0).toBeCloseTo(CAR.h, 6);
  });

  it("lays the panels and glass in driving order: bonnet, windscreen, roof, rear window, boot", () => {
    const [bonnet, boot, windscreen, roof, rear] = [nodes[1]!, nodes[2]!, nodes[3]!, nodes[4]!, nodes[5]!].map(extent);
    const order = [bonnet!, windscreen!, roof!, rear!, boot!];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]!.y0, `panel ${i} starts after panel ${i - 1}`).toBeGreaterThan(order[i - 1]!.y0);
      expect(order[i]!.y0, `…and clear of it`).toBeGreaterThanOrEqual(order[i - 1]!.y1 - 1e-6);
    }
  });

  it("draws the glass as trapezoids, widest where each meets the bonnet or the boot", () => {
    const widthAt = (n: SceneNode, y: number): number => {
      if (n.prim.t !== "polygon") throw new Error("glass is a polygon");
      const xs = n.prim.pts.filter((p) => Math.abs(p.y - y) < 1e-6).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const ws = extent(nodes[3]!);
    expect(widthAt(nodes[3]!, ws.y0), "windscreen base (bonnet end)").toBeGreaterThan(widthAt(nodes[3]!, ws.y1));
    const rw = extent(nodes[5]!);
    expect(widthAt(nodes[5]!, rw.y1), "rear window base (boot end)").toBeGreaterThan(widthAt(nodes[5]!, rw.y0));
  });

  it("keeps the mirrors INSIDE the footprint, one each side, standing off the body at the same station", () => {
    const [l, r] = [extent(nodes[8]!), extent(nodes[9]!)];
    const body = extent(nodes[0]!);
    expect(l.x0).toBeGreaterThanOrEqual(CAR.x - 1e-6);
    expect(r.x1).toBeLessThanOrEqual(CAR.x + CAR.w + 1e-6);
    expect(l.x0).toBeLessThan(body.x0);
    expect(r.x1).toBeGreaterThan(body.x1);
    expect((l.y0 + l.y1) / 2).toBeCloseTo((r.y0 + r.y1) / 2, 9);
    // …at the foot of the windscreen, nearer the nose than the middle.
    expect((l.y0 + l.y1) / 2).toBeLessThan(CAR.y + CAR.h * 0.4);
  });

  it("puts one door pillar line each side, level, from the flank to the roof", () => {
    const pillars = [nodes[6]!, nodes[7]!].map((n) => n.prim as Extract<SceneNode["prim"], { t: "line" }>);
    expect(pillars[0]!.a.y).toBeCloseTo(pillars[0]!.b.y, 9);
    expect(pillars[0]!.a.y).toBeCloseTo(pillars[1]!.a.y, 9);
    expect(pillars[0]!.b.x).toBeLessThan(CAR.x + CAR.w / 2);
    expect(pillars[1]!.a.x).toBeGreaterThan(CAR.x + CAR.w / 2);
  });

  it("is symmetric about its long axis, so it is not handed", () => {
    expect(handed(drawCar, CAR)).toBe(false);
    expect(handed(drawCar, { x: 0, y: 0, w: 1800, h: 4600 })).toBe(false);
  });
});

describe("glyphs-misc — degenerate footprints", () => {
  const DEGENERATE: readonly Rect[] = [
    { x: 0, y: 0, w: 1, h: 10000 },
    { x: 0, y: 0, w: 10000, h: 1 },
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 0, y: 0, w: 10000, h: 10 },
    { x: 0, y: 0, w: 10, h: 10000 },
    { x: 0, y: 0, w: 0, h: 0 },
  ];

  it("draws finite geometry inside the footprint at any aspect, and never throws", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        const nodes = draw(fn, r);
        expect(nodes.length, `${name} at ${r.w}x${r.h}`).toBeGreaterThan(0);
        expectInside(nodes, r, `${name} at ${r.w}x${r.h}`);
        for (const n of nodes) {
          if (n.prim.t === "circle") expect(Number.isFinite(n.prim.r) && n.prim.r >= 0).toBe(true);
          if (n.prim.t === "path")
            for (const lp of n.prim.loops)
              for (const e of lp.edges)
                if (e.t === "arc") expect(Number.isFinite(e.r) && e.r >= 0, `${name}: arc radius`).toBe(true);
        }
      }
    }
  });

  it("never asks for an unbounded number of primitives", () => {
    for (const r of DEGENERATE) {
      for (const [name, fn] of GLYPHS) {
        expect(draw(fn, r).length, `${name} at ${r.w}x${r.h}`).toBeLessThanOrEqual(PRIM_BUDGET);
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
    // The chair's crescent and the plant's stem are primitives no fallback ever emitted.
    expect(svg).toContain('<path d="M ');
    expect(svg).toContain("<circle ");
  });

  it("turns the whole symbol — each quarter-turn moves the bytes", () => {
    const seen = new Set([0, 90, 180, 270].map((rot) => compile(plan(rot), { noCache: true }).svg));
    expect(seen.size, "four distinct drawings").toBe(4);
  });

  it("the desk's dashed pedestal survives the quarter-turn as a dashed shape", () => {
    for (const rot of [0, 90, 180, 270]) {
      const nodes = toScene(resolve(parse(plan(rot)).plan!).ir).nodes.filter((n) => n.layer === "furniture");
      const dashed = nodes.filter((n) => n.lineType === "dashed");
      // desk: pedestal + 2 drawer lines; chair: 5 spokes. Nothing else in the plan is dashed.
      expect(dashed, `rotate ${rot}`).toHaveLength(3 + 5);
      for (const n of dashed) expect(n.paint.dash, `rotate ${rot}: the raw pattern rides along`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// ── the six office/commercial families ──

describe("glyphs-misc — the meeting table's chairs", () => {
  /** Chairs drawn: every chair is a seat and a backrest, after the top and its bevel. */
  const chairs = (r: Rect): number => (draw(drawMeetingTable, r).length - 2) / 2;

  it("seats each long side by length, plus one chair at each end", () => {
    // The pilot dining table's pitch, so a SQUARE footprint seats one a side and `symmetric` is honest.
    expect(chairs({ x: 0, y: 0, w: 2000, h: 2000 })).toBe(4); // 1 a side + 2 ends
    expect(chairs({ x: 0, y: 0, w: 2400, h: 1200 })).toBe(8); // the catalogued table: 3 a side + 2 ends
    expect(chairs({ x: 0, y: 0, w: 1200, h: 2400 })).toBe(8); // …and stood on end
    expect(chairs({ x: 0, y: 0, w: 4800, h: 1200 })).toBe(14); // 6 a side (clamped) + 2 ends
  });

  it("clamps at six per side, so a 10000x10 boardroom is not a hatch", () => {
    expect(chairs({ x: 0, y: 0, w: 10000, h: 10 })).toBe(14);
    expect(chairs({ x: 0, y: 0, w: 10, h: 10000 })).toBe(14);
    expect(draw(drawMeetingTable, { x: 0, y: 0, w: 10000, h: 10 }).length).toBeLessThanOrEqual(PRIM_BUDGET);
  });

  it("draws the pilot dining chair: a white seat and a pill-ended body-tint backrest, in pairs", () => {
    const nodes = draw(drawMeetingTable, { x: 0, y: 0, w: 2400, h: 1200 });
    const parts = nodes.slice(2);
    for (let i = 0; i < parts.length; i += 2) {
      expect(parts[i]!.prim.t).toBe("path");
      expect(parts[i]!.paint.fill, "the seat is upholstered").toBe(theme.opening);
      expect(parts[i + 1]!.prim.t).toBe("path");
      expect(parts[i + 1]!.paint.fill, "the backrest is a body-tint bar").toBe(theme.furnitureFill);
    }
  });

  it("tucks every chair under the top, backrest OUT: it touches the table and never lies on it", () => {
    const r = { x: 0, y: 0, w: 2400, h: 1200 };
    const nodes = draw(drawMeetingTable, r);
    const top = extent(nodes[0]!);
    const eps = 1e-6;
    const chairParts = nodes.slice(2);
    for (let i = 0; i < chairParts.length; i += 2) {
      const seat = extent(chairParts[i]!);
      const back = extent(chairParts[i + 1]!);
      // The seat's visible part ends exactly on one of the table's four edges…
      const touches =
        Math.abs(seat.y1 - top.y0) < eps ||
        Math.abs(seat.y0 - top.y1) < eps ||
        Math.abs(seat.x1 - top.x0) < eps ||
        Math.abs(seat.x0 - top.x1) < eps;
      expect(touches, "a chair floated off the table").toBe(true);
      // …and no part of the chair is over the table top.
      for (const e of [seat, back]) {
        const overlapX = Math.min(e.x1, top.x1) - Math.max(e.x0, top.x0);
        const overlapY = Math.min(e.y1, top.y1) - Math.max(e.y0, top.y0);
        expect(overlapX > eps && overlapY > eps, "a chair was drawn on the table top").toBe(false);
      }
      // The backrest is the part farther from the table than the seat's middle.
      const dist = (e: ReturnType<typeof extent>): number =>
        Math.max(
          top.x0 - (e.x0 + e.x1) / 2,
          (e.x0 + e.x1) / 2 - top.x1,
          top.y0 - (e.y0 + e.y1) / 2,
          (e.y0 + e.y1) / 2 - top.y1,
        );
      expect(dist(back)).toBeGreaterThan(dist(seat));
    }
  });

  it("is not the dining table: a boardroom top is EASED where a dining top is nearly square", () => {
    const r = { x: 0, y: 0, w: 2400, h: 2400 };
    const radiusOf = (n: SceneNode): number => {
      if (n.prim.t !== "path") throw new Error("the top is a path");
      const arc = n.prim.loops[0]!.edges.find((e) => e.t === "arc");
      if (arc?.t !== "arc") throw new Error("a rounded top has arcs");
      return arc.r;
    };
    expect(radiusOf(draw(drawMeetingTable, r)[0]!)).toBeGreaterThan(8 * radiusOf(draw(drawDiningTable, r)[0]!));
  });

  it("maps a SQUARE footprint onto itself under a quarter-turn and a mirror (the catalog's `symmetric`)", () => {
    const sq: Rect = { x: 500, y: 700, w: 2400, h: 2400 };
    const centre: Point = { x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 };
    const original = draw(drawMeetingTable, sq);
    for (const deg of [90, 180, 270]) {
      const turned = draw(drawMeetingTable, sq).map((n) => rotateNode(n, centre, deg));
      expect(marksEqual(original, turned), `meeting table at ${deg} degrees`).toBe(true);
    }
    expect(handed(drawMeetingTable, sq)).toBe(false);
    expect(handed(drawMeetingTable, { x: 0, y: 0, w: 2400, h: 1200 })).toBe(false);
  });
});

describe("glyphs-misc — the reception desk is an L with the chair inside it", () => {
  const r: Rect = { x: 0, y: 0, w: 2400, h: 900 };

  it("draws one counter path, two ledge lines, two nosings and a chair (seat + back)", () => {
    expect(draw(drawReceptionDesk, r).map((n) => n.prim.t)).toEqual([
      "path",
      "line",
      "line",
      "line",
      "line",
      "path",
      "path",
    ]);
  });

  it("rounds the five outer corners with true fillets and leaves the reflex corner sharp", () => {
    const counter = draw(drawReceptionDesk, r)[0]!;
    if (counter.prim.t !== "path") throw new Error("the counter is a path");
    const edges = counter.prim.loops[0]!.edges;
    expect(edges.filter((e) => e.t === "arc")).toHaveLength(5);
    // The reflex vertex is where two straight edges meet at (0.3 w, 0.42 h): no arc ends there.
    const reflex = { x: r.x + r.w * 0.3, y: r.y + r.h * 0.42 };
    const at = edges.find((e) => e.to.x === reflex.x && e.to.y === reflex.y);
    expect(at?.t, "the seam is a straight edge ending on the corner").toBe("line");
    for (const e of edges) if (e.t === "arc") expect(e.r).toBeCloseTo(Math.min(r.w, r.h) * 0.05, 9);
  });

  it("leaves the bottom-right quadrant OPEN — that is what makes it an L", () => {
    const body = draw(drawReceptionDesk, r)[0]!;
    // No part of the counter reaches the far corner of the footprint.
    const far = boundingPoints(body).filter((p) => p.x > r.x + r.w * 0.75 && p.y > r.y + r.h * 0.75);
    expect(far, "the open quadrant is where the staff stand").toHaveLength(0);
  });

  it("puts the ledge on the VISITOR faces (top and left) and the nosings on the staff faces", () => {
    const lines = segs(draw(drawReceptionDesk, r));
    const [ledgeTop, ledgeLeft, noseRun, noseReturn] = lines;
    expect(ledgeTop!.a.y).toBeCloseTo(ledgeTop!.b.y, 9);
    expect(ledgeTop!.a.y).toBeLessThan(r.y + r.h * 0.2);
    expect(ledgeLeft!.a.x).toBeCloseTo(ledgeLeft!.b.x, 9);
    expect(ledgeLeft!.a.x).toBeLessThan(r.x + r.w * 0.1);
    // The staff-side nosings stand just inside the inner faces of the L.
    expect(noseRun!.a.y).toBeLessThan(r.y + r.h * 0.42);
    expect(noseRun!.a.y).toBeGreaterThan(r.y + r.h * 0.3);
    expect(noseReturn!.a.x).toBeLessThan(r.x + r.w * 0.3);
    expect(noseReturn!.a.x).toBeGreaterThan(r.x + r.w * 0.2);
  });

  it("puts the chair in that open quadrant, its back to the far side — the orientation claim", () => {
    const nodes = draw(drawReceptionDesk, r);
    const seat = extent(nodes[5]!);
    const back = extent(nodes[6]!);
    expect((seat.x0 + seat.x1) / 2).toBeGreaterThan(r.x + r.w / 2);
    expect((seat.y0 + seat.y1) / 2).toBeGreaterThan(r.y + r.h / 2);
    // The backrest is farther from the counter (lower on the page) than the seat's middle.
    expect((back.y0 + back.y1) / 2).toBeGreaterThan((seat.y0 + seat.y1) / 2);
  });

  it("is handed — the return is on the left — and the survey agrees", () => {
    expect(handed(drawReceptionDesk, r)).toBe(true);
  });
});

describe("glyphs-misc — the filing cabinet, the locker run and the treadmill face the room", () => {
  it("the filing cabinet's drawer lines run across it, with the pull on the front edge", () => {
    const r: Rect = { x: 0, y: 0, w: 450, h: 600 };
    const nodes = draw(drawFilingCabinet, r);
    expect(nodes).toHaveLength(6);
    const lines = segs(nodes);
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l.a.y).toBeCloseTo(l.b.y, 9);
    // The three drawer lines sit inside the top's bevel…
    const bevel = extent(nodes[1]!);
    for (const l of lines) {
      expect(l.a.x).toBeCloseTo(bevel.x0, 9);
      expect(l.b.x).toBeCloseTo(bevel.x1, 9);
    }
    // …and the pull is the last primitive: a pill on the room side, below every drawer line, narrower than the piece.
    const pull = extent(nodes[5]!);
    expect(pull.y0).toBeGreaterThan(Math.max(...lines.map((l) => l.a.y)));
    expect(pull.y0).toBeGreaterThan(r.y + r.h * 0.8);
    expect(pull.x1 - pull.x0).toBeLessThan(r.w);
  });

  it("the locker's door count is clamped, and every pull is on the front", () => {
    // `2 + (doors - 1) + doors` primitives, so the count is read off what was emitted, not
    // re-run from the module's own formula.
    const doors = (r: Rect): number => (draw(drawLocker, r).length - 1) / 2;
    expect(doors({ x: 0, y: 0, w: 1200, h: 450 })).toBe(3);
    expect(doors({ x: 0, y: 0, w: 450, h: 450 })).toBe(2); // aspect 1, clamped up
    expect(doors({ x: 0, y: 0, w: 10000, h: 10 })).toBe(6); // clamped down
    const r: Rect = { x: 0, y: 0, w: 1200, h: 450 };
    const level = segs(draw(drawLocker, r)).filter((s) => s.a.y === s.b.y);
    // The door-front line, full width near the front face…
    const front = level.filter((s) => Math.abs(s.b.x - s.a.x) >= r.w - 1e-6);
    expect(front).toHaveLength(1);
    expect(front[0]!.a.y).toBeCloseTo(r.y + r.h * 0.95, 9);
    // …and one pull per door, all at the same station on the front half.
    const pulls = level.filter((s) => Math.abs(s.b.x - s.a.x) < r.w - 1e-6);
    expect(pulls).toHaveLength(3);
    for (const v of pulls) expect(v.a.y).toBeCloseTo(r.y + r.h * 0.82, 9);
    // The dividers run the full depth.
    const dividers = segs(draw(drawLocker, r)).filter((s) => s.a.x === s.b.x);
    expect(dividers).toHaveLength(2);
    for (const d of dividers) expect(Math.abs(d.b.y - d.a.y)).toBeCloseTo(r.h, 9);
  });

  it("the treadmill's console is at the WALL end, over the belt", () => {
    const r: Rect = { x: 0, y: 0, w: 800, h: 1800 };
    const nodes = draw(drawTreadmill, r);
    expect(nodes).toHaveLength(6);
    const con = extent(nodes[1]!);
    const display = extent(nodes[2]!);
    const belt = extent(nodes[5]!);
    expect(con.y1).toBeLessThan(belt.y0);
    expect(con.y1).toBeLessThan(r.y + r.h * 0.3); // at the back
    // The display sits inside the console.
    expect(display.x0).toBeGreaterThan(con.x0);
    expect(display.x1).toBeLessThan(con.x1);
    expect(display.y0).toBeGreaterThan(con.y0);
    expect(display.y1).toBeLessThan(con.y1);
    expect(nodes[5]!.paint.fill, "the belt is a distinct surface inside the frame").toBe(theme.opening);
  });

  it("the treadmill's belt is a stadium between two side platforms", () => {
    const r: Rect = { x: 0, y: 0, w: 800, h: 1800 };
    const nodes = draw(drawTreadmill, r);
    const belt = nodes[5]!.prim;
    if (belt.t !== "path") throw new Error("the belt is a path");
    const be = extent(nodes[5]!);
    // A stadium: its end arcs are half the belt's width, so it is a round-ended loop.
    for (const e of belt.loops[0]!.edges) if (e.t === "arc") expect(e.r).toBeCloseTo((be.x1 - be.x0) / 2, 6);
    // The platforms flank it, level with it, one each side, equal and opposite.
    const [pl, pr] = [extent(nodes[3]!), extent(nodes[4]!)];
    expect(pl.x1).toBeLessThan(be.x0);
    expect(pr.x0).toBeGreaterThan(be.x1);
    expect(pl.y0).toBeCloseTo(be.y0, 9);
    expect(pr.y1).toBeCloseTo(be.y1, 9);
    expect(r.x + r.w / 2 - pl.x0).toBeCloseTo(pr.x1 - (r.x + r.w / 2), 9);
    expect(handed(drawTreadmill, r)).toBe(false);
  });
});

describe("glyphs-misc — the pool table's six pockets follow its own long axis", () => {
  const pockets = (r: Rect) => draw(drawPoolTable, r).flatMap((n) => (n.prim.t === "circle" ? [n.prim] : []));

  it("draws exactly six, four at the corners and two on the long rails", () => {
    for (const r of [
      { x: 0, y: 0, w: 2500, h: 1400 },
      { x: 0, y: 0, w: 1400, h: 2500 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]) {
      expect(pockets(r), `${r.w}x${r.h}`).toHaveLength(6);
    }
  });

  it("puts the two middle pockets on the LONG sides, whichever axis those are", () => {
    const landscape = pockets({ x: 0, y: 0, w: 2500, h: 1400 });
    // The two middle pockets are the ones sharing the table's own centre on one axis.
    expect(landscape.filter((p) => Math.abs(p.center.x - 1250) < 1)).toHaveLength(2);
    const portrait = pockets({ x: 0, y: 0, w: 1400, h: 2500 });
    expect(portrait.filter((p) => Math.abs(p.center.y - 1250) < 1)).toHaveLength(2);
  });

  it("nests the rail, the cushion and the cloth, and fills the cloth so it does not read as a rug", () => {
    const nodes = draw(drawPoolTable, { x: 0, y: 0, w: 2500, h: 1400 });
    const [rail, cushion, cloth] = [nodes[0]!, nodes[1]!, nodes[2]!].map(extent);
    expect(cushion!.x0).toBeGreaterThan(rail!.x0);
    expect(cushion!.y0).toBeGreaterThan(rail!.y0);
    expect(cloth!.x0).toBeGreaterThan(cushion!.x0);
    expect(cloth!.y0).toBeGreaterThan(cushion!.y0);
    expect(cloth!.x1).toBeLessThan(cushion!.x1);
    expect(nodes[2]!.paint.fill).toBe(theme.opening);
    // The pockets are solid discs on the cloth's edge, inside the cushion.
    for (const p of pockets({ x: 0, y: 0, w: 2500, h: 1400 })) {
      expect(p.center.x).toBeGreaterThanOrEqual(cloth!.x0 - 1e-6);
      expect(p.center.x).toBeLessThanOrEqual(cloth!.x1 + 1e-6);
    }
  });
});

describe("glyphs-misc — the v1.32 office families in the vocabulary and in a plan", () => {
  it("every new name dispatches to a drawn symbol", () => {
    for (const c of ["meeting_table", "reception_desk", "filing_cabinet", "locker", "pool_table", "treadmill"]) {
      expect(hasFixtureGlyph(c), `${c} draws a symbol`).toBe(true);
    }
  });

  it("the six are a contiguous block of the canonical vocabulary, in order", () => {
    const names = ["meeting_table", "reception_desk", "filing_cabinet", "locker", "pool_table", "treadmill"];
    const start = CANONICAL_FIXTURES.indexOf(names[0]!);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(CANONICAL_FIXTURES.slice(start, start + names.length)).toEqual(names);
  });

  it("compile clean at all four quarter-turns and are deterministic", () => {
    const office = (rot: number): string => `plan "Office" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,9000) (0,9000) close }
  room id=o at (0,0) size 12000x9000 label "Office"
  furniture meeting_table at (400,400) size 2400x1200 rotate ${rot}
  furniture reception_desk at (3200,400) size 2400x900 rotate ${rot}
  furniture filing_cabinet at (6200,400) size 450x600 rotate ${rot}
  furniture locker at (7200,400) size 1200x450 rotate ${rot}
  furniture pool_table at (400,3000) size 2500x1400 rotate ${rot}
  furniture treadmill at (4000,3000) size 800x1800 rotate ${rot}
}`;
    for (const rot of [0, 90, 180, 270]) {
      const out = compile(office(rot), { noCache: true });
      expect(out.errors, `rotate ${rot}`).toEqual([]);
      expect(out.svg.length).toBeGreaterThan(0);
      expect(compile(office(rot), { noCache: true }).svg, `rotate ${rot} is deterministic`).toBe(out.svg);
    }
    // Four distinct drawings: a quarter-turn moves the whole symbol, not part of it.
    expect(new Set([0, 90, 180, 270].map((rot) => compile(office(rot), { noCache: true }).svg)).size).toBe(4);
  });
});
