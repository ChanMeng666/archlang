/**
 * `src/elements/glyphs-bath.ts` — the bathroom plan symbols.
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
 * 5. **The visual-polish language.** The first node is the OUTLINE (thin pen); a curve is a `path`
 *    or a `circle`, never a tessellated polygon; the symmetric pieces are mirror-symmetric and the
 *    two handed ones (the tub, the mirror) are not.
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
import { pathExtentPoints } from "./glyph-extent.js";
import type { Rect } from "../src/elements/glyph-lib.js";
import { glyphCtx } from "../src/elements/glyph-lib.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import {
  drawBasin,
  drawBathtub,
  drawBidet,
  drawMirror,
  drawShower,
  drawUrinal,
  drawWc,
} from "../src/elements/glyphs-bath.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 4000x3000 label "R" }`;
const sceneOf = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
const { theme, sizes } = sceneOf();

type Draw = (r: Rect, g: ReturnType<typeof glyphCtx>) => SceneNode[];

const GLYPHS: readonly (readonly [string, Draw])[] = [
  ["wc", drawWc],
  ["basin", drawBasin],
  ["shower", drawShower],
  ["bathtub", drawBathtub],
  // -- kitchen & bath additions --
  ["bidet", drawBidet],
  ["urinal", drawUrinal],
  ["mirror", drawMirror],
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
  // A curved outline (the WC's cistern, bowl and seat): vertices and arc extremes, no centres.
  if (p.t === "path") return pathExtentPoints(p);
  return [];
}

const allPoints = (nodes: SceneNode[]): { x: number; y: number }[] => nodes.flatMap(pointsOf);

/** A realistic bathroom footprint per fixture, in plan millimetres. */
const FOOTPRINTS: Record<string, Rect> = {
  wc: { x: 1000, y: 2000, w: 400, h: 700 },
  basin: { x: 1000, y: 2000, w: 600, h: 450 },
  shower: { x: 1000, y: 2000, w: 900, h: 900 },
  bathtub: { x: 1000, y: 2000, w: 1700, h: 700 },
  bidet: { x: 1000, y: 2000, w: 400, h: 700 },
  urinal: { x: 1000, y: 2000, w: 400, h: 350 },
  // 900 x 50 is the catalogued footprint, and it is the point: a mirror has no depth, so
  // this is the one glyph in the file whose ordinary case is an 18:1 sliver.
  mirror: { x: 1000, y: 2000, w: 900, h: 50 },
};

describe("glyphs-bath — the drawn content of each symbol", () => {
  // The exact primitive budget of each symbol, and what each one buys.
  const COUNTS: Record<string, number> = {
    wc: 6, // cistern · bowl · seat opening · 2 hinge ticks · flush button
    basin: 6, // top · bowl · floor · tap · spout · waste
    shower: 8, // tray · floor · 4 falls · drain ring · waste
    bathtub: 6, // rim · well · 2 taps · drain ring · waste
    bidet: 6, // bowl · rim · tap deck · tap · jet · waste
    urinal: 4, // bowl · rim · flush plate · waste
    mirror: 6, // glass · 5 reflection ticks
  };

  for (const [name, f] of GLYPHS) {
    it(`${name} draws exactly ${COUNTS[name]} primitives`, () => {
      expect(draw(f, FOOTPRINTS[name]!)).toHaveLength(COUNTS[name]!);
    });
  }

  it("a wide vanity draws TWO bowls — eleven primitives, not six", () => {
    expect(draw(drawBasin, { x: 0, y: 0, w: 1600, h: 500 })).toHaveLength(11);
  });

  it("every node names a glyph weight, and both weights are in use across the module", () => {
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
    expect(circles("basin", drawBasin)).toBe(2); // the tap and the waste
    expect(circles("shower", drawShower)).toBe(2); // drain ring + waste
    expect(circles("bathtub", drawBathtub)).toBe(4); // two taps + drain ring + waste
    expect(circles("bidet", drawBidet)).toBe(2); // the tap and the waste on the bowl centre
    expect(circles("urinal", drawUrinal)).toBe(1); // the waste
    expect(circles("mirror", drawMirror)).toBe(0); // a mirror has no round detail at all
  });

  it("the outline comes first, in the thin pen — it is the node `data-arch-primary` is read from", () => {
    for (const [name, f] of GLYPHS) {
      const first = draw(f, FOOTPRINTS[name]!)[0]!;
      expect(first.lineWeight, `${name}: the first node is the outline`).toBe("thin");
      expect(["polygon", "path"], `${name}: the outline is a closed shape`).toContain(first.prim.t);
    }
  });

  it("a curve is a `path` or a `circle` — no symbol tessellates one into a polygon", () => {
    // The old bowls were 24-gons. Anything left that is a polygon must be genuinely straight-edged:
    // four points, and in this module only the mirror's glass.
    for (const [name, f] of GLYPHS) {
      for (const n of draw(f, FOOTPRINTS[name]!)) {
        if (n.prim.t === "polygon") expect(n.prim.pts, `${name}: a polygon is a plain rectangle`).toHaveLength(4);
      }
    }
    expect(draw(drawBasin, FOOTPRINTS.basin!).filter((n) => n.prim.t === "path")).toHaveLength(3);
  });
});

describe("glyphs-bath — mirror symmetry", () => {
  // `test/glyph-chirality.test.ts` holds a mirrored wc and shower to the plain one's exact bytes
  // through the compiler; this asks the DRAWING, for every piece, at its catalogued footprint.
  const mirrorSymmetric = (name: string, f: Draw): boolean => {
    const r = FOOTPRINTS[name]!;
    const nodes = draw(f, r);
    return marksEqual(
      nodes,
      nodes.map((n) => mirrorNode(n, r.x + r.w / 2)),
    );
  };

  it("the wc, basin, shower, bidet and urinal have a vertical mirror axis", () => {
    for (const [name, f] of GLYPHS) {
      if (name === "bathtub" || name === "mirror") continue;
      expect(mirrorSymmetric(name, f), `${name} must stay mirror-symmetric`).toBe(true);
    }
  });

  it("the tub (taps at one end) and the mirror (ticks that lean one way) are handed", () => {
    expect(mirrorSymmetric("bathtub", drawBathtub)).toBe(false);
    expect(mirrorSymmetric("mirror", drawMirror)).toBe(false);
  });

  it("a basin and a double vanity are symmetric at every aspect, not only the catalogued one", () => {
    for (const r of [
      { x: 0, y: 0, w: 900, h: 450 },
      { x: 0, y: 0, w: 1600, h: 500 },
      { x: 0, y: 0, w: 2400, h: 500 },
    ]) {
      const nodes = draw(drawBasin, r);
      expect(
        marksEqual(
          nodes,
          nodes.map((n) => mirrorNode(n, r.w / 2)),
        ),
        `${r.w}x${r.h}`,
      ).toBe(true);
    }
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
    expect(at(219, 100)).toBe(6); // 2.19 — one bowl
    expect(at(221, 100)).toBe(11); // 2.21 — two bowls
  });

  it("the boundary itself is on the double side — the float form got this wrong", () => {
    // `2.2 * 100` is 220.00000000000003, so `w >= 2.2 * h` sent a 220x100 slab, the exact
    // round number an author types AT the threshold, to the single-bowl branch. The integer
    // form `w * 10 >= h * 22` is what makes the rule mean what it says.
    expect(220 >= 2.2 * 100).toBe(false); // the trap, stated
    expect(at(220, 100)).toBe(11); // the rule, as written
  });

  it("puts the two bowls at the quarter points, clear of each other and of the ends", () => {
    const r: Rect = { x: 0, y: 0, w: 1600, h: 500 };
    const nodes = draw(drawBasin, r);
    // A bowl is a thin-pen WHITE path; its floor is the same oval in the detail pen, so the
    // outline-pen paths in the basin fill are exactly the bowls.
    const basinFill = glyphCtx(theme, sizes).basin;
    const bowls = nodes
      .filter((n) => n.prim.t === "path" && n.lineWeight === "thin" && n.paint.fill === basinFill)
      .map((n) => {
        const xs = pathExtentPoints(n.prim as Extract<typeof n.prim, { t: "path" }>).map((p) => p.x);
        return { min: Math.min(...xs), max: Math.max(...xs) };
      });
    expect(bowls).toHaveLength(2);
    const [left, right] = bowls as [{ min: number; max: number }, { min: number; max: number }];
    expect((left.min + left.max) / 2).toBeCloseTo(r.w * 0.25, 6);
    expect((right.min + right.max) / 2).toBeCloseTo(r.w * 0.75, 6);
    expect(left.min).toBeGreaterThan(r.x);
    expect(right.max).toBeLessThan(r.x + r.w);
    expect(left.max).toBeLessThan(right.min); // they do not touch
    // Each bowl is the same width: 76% of its own half.
    expect(left.max - left.min).toBeCloseTo(r.w * 0.5 * 0.76, 6);
    expect(right.max - right.min).toBeCloseTo(r.w * 0.5 * 0.76, 6);
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
    bidet: "400x700",
    urinal: "400x350",
    mirror: "900x50",
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

describe("glyphs-bath — the three symbols added in v1.32", () => {
  /**
   * Each of the three is only useful if it cannot be mistaken for the piece it sits beside,
   * so each is pinned against that piece rather than against itself. A count alone would let
   * a bidet drift into a WC one primitive at a time and stay green the whole way.
   */
  const extentOf = (n: SceneNode): { min: number; max: number; top: number } => {
    const pts = pointsOf(n);
    const xs = pts.map((p) => p.x);
    return { min: Math.min(...xs), max: Math.max(...xs), top: Math.min(...pts.map((p) => p.y)) };
  };

  it("a bidet is a WC without a cistern — its back block is a third of the width, not most of it", () => {
    const r: Rect = { x: 0, y: 0, w: 400, h: 700 };
    const g = glyphCtx(theme, sizes);
    // The widest BODY-filled shape (a cistern, a tap deck) standing in the back fifth.
    const backOf = (nodes: SceneNode[]): number => {
      const spans = nodes
        .filter((n) => n.prim.t === "path" && n.paint.fill === g.body)
        .map(extentOf)
        .filter((e) => e.top <= r.y + r.h * 0.2)
        .map((e) => e.max - e.min);
      return Math.max(0, ...spans);
    };
    expect(backOf(draw(drawWc, r))).toBeCloseTo(r.w * 0.85, 9);
    const bidet = backOf(draw(drawBidet, r));
    expect(bidet).toBeGreaterThan(0);
    expect(bidet).toBeLessThanOrEqual(r.w * 0.4);
  });

  it("a bidet's bowl is the first node and its tap deck stands on the bowl's rear rim", () => {
    const r: Rect = { x: 0, y: 0, w: 400, h: 700 };
    const [bowl, , deck] = draw(drawBidet, r) as [SceneNode, SceneNode, SceneNode];
    const bowlTop = Math.min(...pointsOf(bowl).map((p) => p.y));
    const deckBottom = Math.max(...pointsOf(deck).map((p) => p.y));
    expect(deckBottom, "the deck overlaps the bowl's rim rather than floating behind it").toBeGreaterThan(bowlTop);
  });

  it("a urinal's bowl is a U closed on the wall face — square back corners, a rounded front", () => {
    // The wall is the piece's back, so the bowl runs to the very top edge of the footprint with
    // its two back corners square — which a closed oval would not be.
    const r: Rect = { x: 0, y: 0, w: 400, h: 350 };
    const bowl = draw(drawUrinal, r)[0]!;
    expect(bowl.prim.t).toBe("path");
    const loop = (bowl.prim as Extract<SceneNode["prim"], { t: "path" }>).loops[0]!;
    const verts = [loop.start, ...loop.edges.map((e) => e.to)];
    // Two DISTINCT corners on the wall face (the closing edge returns to the start point).
    expect(new Set(verts.filter((p) => Math.abs(p.y - r.y) < 1e-9).map((p) => p.x)).size).toBe(2);
    expect(loop.edges.filter((e) => e.t === "arc")).toHaveLength(2); // the two front corners
    expect(Math.max(...pointsOf(bowl).map((p) => p.y))).toBeGreaterThan(r.y + r.h * 0.9);
  });

  it("a mirror keeps its reflection ticks inside an 18:1 sliver, and inside a 1:200 one", () => {
    // The cap that makes this hold is half a pitch, not the short side: the outer ticks sit a
    // half pitch from the ends, so a half-length keyed to `min(w, h)` walks off the ends the
    // moment the footprint is taller than it is wide.
    for (const r of [
      { x: 0, y: 0, w: 900, h: 50 },
      { x: 0, y: 0, w: 50, h: 10000 },
    ]) {
      for (const p of allPoints(draw(drawMirror, r))) {
        expect(p.x).toBeGreaterThanOrEqual(r.x);
        expect(p.x).toBeLessThanOrEqual(r.x + r.w);
        expect(p.y).toBeGreaterThanOrEqual(r.y);
        expect(p.y).toBeLessThanOrEqual(r.y + r.h);
      }
    }
  });

  it("a mirror's tick count follows its run — one per four depths, in [3, 12]", () => {
    const ticks = (w: number, h: number): number => draw(drawMirror, { x: 0, y: 0, w, h }).length - 1;
    expect(ticks(900, 50)).toBe(5); // the catalogued mirror
    expect(ticks(1800, 50)).toBe(9);
    expect(ticks(3000, 50)).toBe(12); // the cap
    expect(ticks(100000, 50)).toBe(12);
    expect(ticks(400, 200)).toBe(3); // the floor — a legend swatch still gets a rhythm
    expect(ticks(10000, 0)).toBe(12); // a zero depth is the cap, not a division by zero
    expect(ticks(0, 0)).toBe(3); // and 0/0 is the floor, not a NaN loop bound
  });
});

describe("glyphs-bath — the tub", () => {
  it("the foot end is rounder than the head end, and the taps and the drain are at the head", () => {
    const r = FOOTPRINTS.bathtub!;
    const nodes = draw(drawBathtub, r);
    const well = nodes[1]!.prim as Extract<SceneNode["prim"], { t: "path" }>;
    const mid = r.x + r.w / 2;
    const radii = (side: (x: number) => boolean): number[] =>
      well.loops[0]!.edges.flatMap((e) => (e.t === "arc" && side(e.center.x) ? [e.r] : []));
    const head = radii((x) => x < mid);
    const foot = radii((x) => x >= mid);
    expect(head).toHaveLength(2);
    expect(foot).toHaveLength(2);
    expect(Math.max(...head)).toBeLessThan(Math.min(...foot));
    // The two taps and the drain's ring and waste all sit in the head half.
    for (const n of nodes.filter((n) => n.prim.t === "circle")) {
      expect((n.prim as { center: { x: number } }).center.x, "taps and drain are at the head").toBeLessThan(mid);
    }
  });
});
