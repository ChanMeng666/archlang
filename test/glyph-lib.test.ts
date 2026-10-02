/**
 * `src/elements/glyph-lib.ts` — the drawing vocabulary the fixture symbols are built from.
 *
 * Two laws are worth a test, and they are the two that let the eight shipped glyph families
 * be re-tagged with semantic line weights without moving a byte.
 *
 * **1. The named weight and the raw width agree.** The SVG serializer prefers
 * `node.lineWeight`; the PDF backend reads `paint.width` and nothing else. A factory that
 * set one and not the other would make the two exports draw different line thicknesses from
 * the same node. Every factory sets both from one ramp, and `weightWidth("thin", sizes)` is
 * exactly `sizes.thin` — the literal the pre-refactor closures already passed — so tagging
 * an existing glyph node is provably invisible in the SVG.
 *
 * **2. A dashed segment's two dash fields agree.** `lineType: "dashed"` resolves to a
 * pattern on the SVG ramp, and `paint.dash` is what a PDF sees. They are set to the same
 * pair, and the assertion below reads the pattern back OUT of the rendered SVG rather than
 * comparing the module's constant to itself.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { renderSvg } from "../src/backends/svg.js";
import { weightWidth } from "../src/scene.js";
import type { PathLoop, Scene, SceneNode } from "../src/scene.js";
import type { Point } from "../src/ast.js";
import {
  bulgeArc,
  dashedPattern,
  ellipsePoly,
  glyphCtx,
  insetRect,
  insetRectXY,
  ovalPath,
  parseHexColor,
  rectPoly,
  roundedRectPath,
  SYMBOL_INK_MIX,
  symbolInk,
} from "../src/elements/glyph-lib.js";
import { DEFAULT_THEME, hexToHsl, mergeTheme, THEMES } from "../src/theme.js";
import { CANONICAL_FIXTURES, fixtureGlyph } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";
import { rotateNode } from "../src/elements/furniture.js";
import { marksEqual, mirrorNode } from "../src/elements/glyph-chirality.js";
import { arcEdgeSweep, arcEdgesOf } from "./glyph-extent.js";

const SRC = `plan "G" { units mm room id=r at (0,0) size 4000x3000 label "R" }`;
const sceneOf = (): Scene => toScene(resolve(parse(SRC).plan!).ir);

/**
 * The SVG element the backend emitted for `node`, isolated by DIFFERENCE: the same plan is
 * rendered with and without it, and the added line is the answer.
 *
 * Picking "the first `<polygon>`" instead would have found the ROOM FLOOR every time, and
 * the byte-identity assertion below would have compared that floor to itself and passed
 * however the node was painted. The base plan is furniture-free, so exactly one line is
 * added and the helper throws if that is ever not true.
 */
function svgFor(node: SceneNode): string {
  const scene = sceneOf();
  scene.nodes.push(node);
  const before = renderSvg(sceneOf(), {}).split("\n");
  const after = renderSvg(scene, {}).split("\n");
  const left = new Map<string, number>();
  for (const l of before) left.set(l, (left.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of after) {
    const c = left.get(l) ?? 0;
    if (c > 0) left.set(l, c - 1);
    // The furniture pass had no nodes at all, so its `<g>` wrapper is new too — that is
    // layer chrome, not the drawing.
    else if (!l.startsWith("<g") && l !== "</g>") added.push(l);
  }
  if (added.length !== 1) throw new Error(`expected exactly one added SVG element, got ${added.length}`);
  return added[0]!;
}

describe("glyph-lib — weight resolution", () => {
  const { sizes } = sceneOf();

  it('"thin" resolves to exactly sizes.thin, "extraThin" to 13/18 of it — the ISO 0.13 / 0.18 mm pens', () => {
    expect(weightWidth("thin", sizes)).toBe(sizes.thin);
    expect(weightWidth("extraThin", sizes)).toBe((sizes.thin * 13) / 18);
    // On a sheet `thin` is 0.18 sheet-mm × the scale denominator, so extraThin is 0.13 sheet-mm:
    // the ISO 128 floor below which a line stops reproducing in print.
    const sheet = toScene(
      resolve(parse(`plan "S" { units mm paper A3 scale 1:50 room id=r at (0,0) size 4000x3000 }`).plan!).ir,
    ).sizes;
    expect(sheet.thin / 50).toBeCloseTo(0.18, 9);
    expect(weightWidth("extraThin", sheet) / 50).toBeCloseTo(0.13, 9);
  });

  it("every factory sets paint.width to what its lineWeight resolves to", () => {
    const g = glyphCtx(sceneOf().theme, sizes);
    g.poly(rectPoly({ x: 0, y: 0, w: 100, h: 100 }), g.body);
    g.seg({ x: 0, y: 0 }, { x: 100, y: 0 });
    g.seg({ x: 0, y: 50 }, { x: 100, y: 50 }, "extraThin", true);
    g.dot({ x: 50, y: 50 }, 10);
    g.ring({ x: 50, y: 50 }, 20, "extraThin");
    g.arcSeg({ x: 0, y: 0 }, 50, { x: 50, y: 0 }, { x: 0, y: 50 }, 1);
    expect(g.nodes).toHaveLength(6);
    for (const n of g.nodes) {
      expect(n.lineWeight, "every glyph node carries a named weight").toBeDefined();
      expect(n.paint.width).toBe(weightWidth(n.lineWeight!, sizes));
    }
    // …and both weights are actually exercised, so the loop above is not one-valued.
    expect(new Set(g.nodes.map((n) => n.lineWeight))).toEqual(new Set(["thin", "extraThin"]));
  });

  it("tagging a node with lineWeight thin leaves its SVG byte-identical", () => {
    // Exactly the node shape the pre-refactor `poly` closure emitted, and the same node
    // with the semantic weight added. This is the identity the whole refactor rests on.
    const pts = rectPoly({ x: 100, y: 100, w: 400, h: 300 });
    const untagged: SceneNode = {
      layer: "furniture",
      prim: { t: "polygon", pts },
      paint: { fill: "#eee", stroke: "#111", width: sizes.thin },
    };
    const tagged: SceneNode = { ...untagged, lineWeight: "thin" };
    expect(svgFor(tagged)).toBe(svgFor(untagged));
  });
});

describe("glyph-lib — the dash convention", () => {
  const { sizes, theme } = sceneOf();

  it("a dashed segment's lineType and paint.dash resolve to the same pattern", () => {
    const g = glyphCtx(theme, sizes);
    g.seg({ x: 100, y: 100 }, { x: 900, y: 100 }, "thin", true);
    const node = g.nodes[0]!;
    expect(node.lineType).toBe("dashed");
    expect(node.paint.dash).toEqual(dashedPattern(sizes));
    // Read the pattern back out of the rendered SVG — the SVG follows the NAME, so this
    // compares the ramp's answer against `paint.dash`, not the constant against itself.
    const drawn = svgFor(node);
    const m = /stroke-dasharray="([^"]+)"/.exec(drawn);
    expect(m, "a dashed segment must emit a stroke-dasharray").not.toBeNull();
    // The SVG rounds through `fmt2`, so compare to the printed precision, not to float bits.
    const drawnPattern = m![1]!.split(" ").map(Number);
    expect(drawnPattern).toHaveLength(2);
    for (const [i, v] of drawnPattern.entries()) expect(v).toBeCloseTo(dashedPattern(sizes)[i]!, 2);
  });

  it("an undashed segment names no line type and carries no dash", () => {
    const g = glyphCtx(theme, sizes);
    g.seg({ x: 100, y: 100 }, { x: 900, y: 100 });
    expect(g.nodes[0]!.lineType).toBeUndefined();
    expect(g.nodes[0]!.paint.dash).toBeUndefined();
    expect(svgFor(g.nodes[0]!)).not.toContain("stroke-dasharray");
  });
});

describe("glyph-lib — shape helpers", () => {
  it("ellipsePoly is the same 24-gon the glyphs have always drawn", () => {
    const pts = ellipsePoly(100, 200, 40, 30);
    expect(pts).toHaveLength(24);
    expect(pts[0]).toEqual({ x: 140, y: 200 }); // angle 0 → +x
    expect(pts[6]!.x).toBeCloseTo(100, 9);
    expect(pts[6]!.y).toBeCloseTo(230, 9); // quarter turn → +y (screen down)
  });

  it("insetRect shrinks by a fraction of the SHORT side, on all four edges", () => {
    // The bathtub's hand-written rule: `min(w,h) * 0.14` in from every edge.
    expect(insetRect({ x: 0, y: 0, w: 1000, h: 500 }, 0.1)).toEqual({ x: 50, y: 50, w: 900, h: 400 });
  });

  it("insetRectXY takes absolute per-axis margins", () => {
    expect(insetRectXY({ x: 10, y: 20, w: 100, h: 200 }, 5, 10)).toEqual({ x: 15, y: 30, w: 90, h: 180 });
  });
});

// ---------------------------------------------------------------------------
// The symbol ink (tone follows weight) — design decisions D3/D4.

/** WCAG 2 relative luminance and contrast ratio, from the spec's formula. */
const lum = (hex: string): number => {
  const [r, g, b] = parseHexColor(hex)!;
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Every shipped theme, the default included, as the merged palette a plan would draw with. */
const SHIPPED = [
  ["default", DEFAULT_THEME] as const,
  ...Object.keys(THEMES).map((n) => [n, mergeTheme(THEMES[n])] as const),
];

describe("glyph-lib — the derived symbol ink", () => {
  it("the default theme's ink is #6c6864, clearing WCAG 4.5:1 on the room fill (furnitureStroke does not)", () => {
    const ink = symbolInk(DEFAULT_THEME.furnitureStroke, DEFAULT_THEME.wallStroke);
    expect(ink).toBe("#6c6864");
    expect(contrast(ink, DEFAULT_THEME.roomFill)).toBeGreaterThanOrEqual(4.5);
    // …which is the whole reason it exists: the pale detail tone alone is ~2.4:1.
    expect(contrast(DEFAULT_THEME.furnitureStroke, DEFAULT_THEME.roomFill)).toBeLessThan(3);
  });

  it("every shipped theme's ink clears 4.5:1 on that theme's own room fill", () => {
    expect(SHIPPED.length).toBeGreaterThanOrEqual(5);
    for (const [name, t] of SHIPPED) {
      const ink = symbolInk(t.furnitureStroke, t.wallStroke);
      expect(contrast(ink, t.roomFill), `${name}: ${ink} on ${t.roomFill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("3/7 is the smallest move toward the wall ink (denominator ≤ 12) that does it for every theme", () => {
    // A lighter mix keeps the outline further from the wall's weight; this pins that no lighter
    // fraction would have done. Contrast grows monotonically with the mix toward the wall ink.
    expect(SYMBOL_INK_MIX).toEqual([3, 7]);
    const mix = (f: string, w: string, p: number, q: number): string => {
      const a = parseHexColor(f)!;
      const b = parseHexColor(w)!;
      const ch = (i: number): string =>
        Math.round((a[i]! * (q - p) + b[i]! * p) / q)
          .toString(16)
          .padStart(2, "0");
      return `#${ch(0)}${ch(1)}${ch(2)}`;
    };
    const passes = (p: number, q: number): boolean =>
      SHIPPED.every(([, t]) => contrast(mix(t.furnitureStroke, t.wallStroke, p, q), t.roomFill) >= 4.5);
    expect(passes(3, 7)).toBe(true);
    expect(mix(DEFAULT_THEME.furnitureStroke, DEFAULT_THEME.wallStroke, 3, 7)).toBe(
      symbolInk(DEFAULT_THEME.furnitureStroke, DEFAULT_THEME.wallStroke),
    );
    for (let q = 1; q <= 12; q++) {
      for (let p = 0; p < q; p++) if (p / q < 3 / 7) expect(passes(p, q), `${p}/${q}`).toBe(false);
    }
  });

  it("parses #rgb and #rrggbb in either case and nothing else", () => {
    expect(parseHexColor("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseHexColor("#ABCDEF")).toEqual([0xab, 0xcd, 0xef]);
    expect(parseHexColor("  #000000 ")).toEqual([0, 0, 0]);
    for (const bad of ["", "abcdef", "#abcd", "#abcdefff", "#ggg", "red", "url(#poche)", "rgb(1,2,3)", "none"]) {
      expect(parseHexColor(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("falls back to furnitureStroke, unchanged, when either colour is not a hex", () => {
    expect(symbolInk("red", "#1b1b1b")).toBe("red");
    expect(symbolInk("#a8a29a", "black")).toBe("#a8a29a");
    expect(symbolInk("url(#p)", "#000")).toBe("url(#p)");
    // A short hex mixes like its long form, and black on black stays black (the `mono` theme).
    expect(symbolInk("#fff", "#000")).toBe(symbolInk("#ffffff", "#000000"));
    expect(symbolInk("#000000", "#000000")).toBe("#000000");
  });

  it("a `style furniture { stroke … }` override keeps its hue in the outline ink", () => {
    const nodesOf = (stroke: string): SceneNode[] =>
      compile(
        `plan "S" { units mm style furniture { stroke "${stroke}" } room id=r at (0,0) size 4000x3000 ` +
          "furniture sofa at (500,500) size 2000x900 }",
        { noCache: true },
      ).scene!.nodes.filter((n) => n.layer === "furniture");
    const red = nodesOf("#cc3333");
    const thin = red.filter((n) => n.lineWeight === "thin");
    const fine = red.filter((n) => n.lineWeight === "extraThin");
    expect(thin.length).toBeGreaterThan(0);
    expect(fine.length).toBeGreaterThan(0);
    for (const n of fine) expect(n.paint.stroke).toBe("#cc3333");
    const hue = hexToHsl("#cc3333")!.h;
    for (const n of thin) {
      expect(n.paint.stroke).not.toBe("#cc3333");
      expect(hexToHsl(n.paint.stroke!)!.h).toBeCloseTo(hue, 2);
      expect(lum(n.paint.stroke!)).toBeLessThan(lum("#cc3333")); // darker, toward the wall ink
    }
    // A named colour cannot be mixed: both tones are the author's colour.
    for (const n of nodesOf("teal")) expect(n.paint.stroke).toBe("teal");
  });

  it("the unknown-category fallback rectangle is NOT a glyph: it keeps furnitureStroke", () => {
    const nodes = compile(
      `plan "F" { units mm room id=r at (0,0) size 3000x2400 furniture widget at (300,300) size 800x600 }`,
      { noCache: true },
    ).scene!.nodes.filter((n) => n.layer === "furniture");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.paint.stroke).toBe(DEFAULT_THEME.furnitureStroke);
    expect(nodes[0]!.lineWeight).toBeUndefined();
  });

  it("tone follows weight in EVERY glyph: thin strokes are the ink, extraThin strokes furnitureStroke", () => {
    const { sizes } = sceneOf();
    for (const [name, t] of SHIPPED) {
      const ink = symbolInk(t.furnitureStroke, t.wallStroke);
      for (const c of CANONICAL_FIXTURES) {
        const fp = defaultFootprint(c);
        const nodes = fixtureGlyph(c, { x: 0, y: 0, w: fp?.along ?? 1000, h: fp?.depth ?? 600 }, t, sizes)!;
        for (const n of nodes) {
          const want = n.lineWeight === "thin" ? ink : t.furnitureStroke;
          expect(n.paint.stroke, `${name}/${c} ${n.lineWeight} ${n.prim.t}`).toBe(want);
        }
      }
    }
  });

  it("a bare dot is DETAIL (one solid furnitureStroke disc); a thin dot is one solid ink disc", () => {
    const g = glyphCtx(DEFAULT_THEME, sceneOf().sizes);
    g.dot({ x: 0, y: 0 }, 5);
    g.dot({ x: 0, y: 0 }, 5, undefined, "thin");
    g.dot({ x: 0, y: 0 }, 50, g.body, "thin");
    const [detail, inkDot, seat] = g.nodes;
    expect(detail!.lineWeight).toBe("extraThin");
    expect(detail!.paint).toMatchObject({ fill: g.stroke, stroke: g.stroke });
    expect(inkDot!.paint).toMatchObject({ fill: g.ink, stroke: g.ink });
    expect(seat!.paint).toMatchObject({ fill: g.body, stroke: g.ink });
  });
});

// ---------------------------------------------------------------------------
// True curves: the `path` factory and its builders — design decision D9.

const TWO_THIRDS_PI = (2 * Math.PI) / 3;
const pathNode = (loop: PathLoop): SceneNode => {
  const g = glyphCtx(DEFAULT_THEME, sceneOf().sizes);
  g.path(loop, g.body);
  return g.nodes[0]!;
};
const arcs = (n: SceneNode) => (n.prim.t === "path" ? arcEdgesOf(n.prim) : []);
const closes = (lp: PathLoop): boolean => {
  const last = lp.edges.at(-1)!.to;
  return Math.abs(last.x - lp.start.x) < 1e-9 && Math.abs(last.y - lp.start.y) < 1e-9;
};
const near = (a: Point, b: Point, eps = 1e-6): boolean => Math.hypot(a.x - b.x, a.y - b.y) < eps;
type ArcEdge = Extract<PathLoop["edges"][number], { t: "arc" }>;

describe("glyph-lib — the path factory", () => {
  it("emits one furniture `path` node carrying the loop, painted by tone like every factory", () => {
    const g = glyphCtx(DEFAULT_THEME, sceneOf().sizes);
    const loop = roundedRectPath({ x: 0, y: 0, w: 100, h: 50 }, 10);
    g.path(loop, g.basin, "extraThin");
    g.path([loop, loop], g.body);
    expect(g.nodes[0]!.prim).toEqual({ t: "path", loops: [loop] });
    expect(g.nodes[0]!.paint).toEqual({ fill: g.basin, stroke: g.stroke, width: weightWidth("extraThin", g.sizes) });
    const two = g.nodes[1]!.prim;
    expect(two.t === "path" ? two.loops : []).toHaveLength(2);
    expect(g.nodes[1]!.paint.stroke).toBe(g.ink);
    // …and it reaches the SVG as one `<path>` with true arcs, minor (large-arc 0).
    expect(svgFor(g.nodes[0]!)).toMatch(/^<path d="M [^"]* A 10 10 0 0 1 [^"]*Z"/);
  });
});

describe("glyph-lib — roundedRectPath", () => {
  it("is a closed clockwise loop of four lines and four 90° corner arcs", () => {
    const lp = roundedRectPath({ x: 10, y: 20, w: 200, h: 100 }, 15);
    expect(closes(lp)).toBe(true);
    expect(lp.edges.map((e) => e.t)).toEqual(["line", "arc", "line", "arc", "line", "arc", "line", "arc"]);
    for (const { from, e } of arcs(pathNode(lp))) {
      expect(e.r).toBe(15);
      expect(e.sweep).toBe(1);
      expect(arcEdgeSweep(from, e)).toBeCloseTo(Math.PI / 2, 12);
    }
  });

  it("takes one radius per corner, clockwise from the top-left; 0 is a sharp corner", () => {
    const lp = roundedRectPath({ x: 0, y: 0, w: 200, h: 100 }, [20, 0, 10, 0]);
    expect(lp.start).toEqual({ x: 20, y: 0 });
    const corners = lp.edges.flatMap((e) => (e.t === "arc" ? [[e.center, e.r]] : []));
    expect(corners).toEqual([
      [{ x: 190, y: 90 }, 10],
      [{ x: 20, y: 20 }, 20],
    ]);
    expect(lp.edges.some((e) => e.t === "line" && e.to.x === 200 && e.to.y === 0)).toBe(true); // sharp TR
  });

  it("holds every radius to half the short side — a pill — and omits the used-up straight runs", () => {
    const lp = roundedRectPath({ x: 0, y: 0, w: 300, h: 60 }, 999);
    for (const e of lp.edges) if (e.t === "arc") expect(e.r).toBe(30);
    expect(lp.edges.filter((e) => e.t === "line")).toHaveLength(2); // the two long sides only
    expect(closes(lp)).toBe(true);
  });

  it("degenerates to a finite plain rectangle on a zero, negative or NaN radius or extent", () => {
    for (const [r, rad] of [
      [{ x: 0, y: 0, w: 100, h: 50 }, 0],
      [{ x: 0, y: 0, w: 100, h: 50 }, -5],
      [{ x: 0, y: 0, w: 100, h: 50 }, Number.NaN],
      [{ x: 5, y: 5, w: 0, h: 0 }, 10],
      [{ x: 5, y: 5, w: -40, h: 30 }, 10],
    ] as const) {
      const lp = roundedRectPath(r, rad);
      expect(lp.edges.every((e) => e.t === "line")).toBe(true);
      expect(closes(lp)).toBe(true);
      for (const e of lp.edges) expect(Number.isFinite(e.to.x) && Number.isFinite(e.to.y)).toBe(true);
    }
  });
});

describe("glyph-lib — ovalPath (the four-centre oval)", () => {
  const CASES: readonly [number, number][] = [
    [100, 100], // a circle
    [160, 255.5], // the WC bowl: vertical major axis
    [300, 180],
    [300, 100],
    [400, 100], // exactly the aspect cap
    [1000, 60], // flatter than the cap: straight runs let in
    [60, 1000],
  ];

  it.each(CASES)("rx=%d ry=%d: closed, every arc ≤ 120°, tangent-continuous, reaching exactly ±rx/±ry", (rx, ry) => {
    const cx = 500;
    const cy = 300;
    const lp = ovalPath(cx, cy, rx, ry);
    const node = pathNode(lp);
    expect(closes(lp)).toBe(true);
    for (const { from, e } of arcs(node)) {
      expect(Math.abs(arcEdgeSweep(from, e))).toBeLessThanOrEqual(TWO_THIRDS_PI + 1e-12);
      expect(e.sweep).toBe(1);
    }
    // Tangent continuity: at every vertex the incoming and outgoing edges share a tangent — an
    // arc's is its radius turned +90° (clockwise travel in y-down axes), a line's its direction.
    const n = lp.edges.length;
    const verts = [lp.start, ...lp.edges.map((e) => e.to)];
    const tangent = (e: PathLoop["edges"][number], at: Point, from: Point): Point => {
      if (e.t === "line") {
        const d = Math.hypot(e.to.x - from.x, e.to.y - from.y);
        return { x: (e.to.x - from.x) / d, y: (e.to.y - from.y) / d };
      }
      const d = Math.hypot(at.x - e.center.x, at.y - e.center.y);
      return { x: -(at.y - e.center.y) / d, y: (at.x - e.center.x) / d };
    };
    for (let i = 0; i < n; i++) {
      const v = verts[i + 1]!;
      const t1 = tangent(lp.edges[i]!, v, verts[i]!);
      const t2 = tangent(lp.edges[(i + 1) % n]!, v, v);
      expect(t1.x * t2.x + t1.y * t2.y, `vertex ${i}`).toBeCloseTo(1, 9);
    }
    // The extremes are reached exactly and nothing passes them.
    const pts: Point[] = [...verts];
    for (const { from, e } of arcs(node)) {
      const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
      const d = arcEdgeSweep(from, e);
      for (let k = 0; k <= 16; k++) {
        const a = a0 + (d * k) / 16;
        pts.push({ x: e.center.x + e.r * Math.cos(a), y: e.center.y + e.r * Math.sin(a) });
      }
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs)).toBeCloseTo(cx + rx, 9);
    expect(Math.min(...xs)).toBeCloseTo(cx - rx, 9);
    expect(Math.max(...ys)).toBeCloseTo(cy + ry, 9);
    expect(Math.min(...ys)).toBeCloseTo(cy - ry, 9);
  });

  it("a circle is at least three arcs, every one on the circle", () => {
    const lp = ovalPath(10, 20, 50, 50);
    const as = lp.edges.flatMap((e) => (e.t === "arc" ? [e] : []));
    expect(as.length).toBeGreaterThanOrEqual(3);
    for (const e of as) {
      expect(near(e.center, { x: 10, y: 20 }, 1e-9)).toBe(true);
      expect(e.r).toBeCloseTo(50, 9);
    }
  });

  it("a degenerate oval is a finite diamond, never a NaN", () => {
    for (const [rx, ry] of [
      [0, 0],
      [10, 0],
      [-5, 10],
      [Number.NaN, 4],
    ] as const) {
      const lp = ovalPath(0, 0, rx, ry);
      expect(lp.edges.every((e) => e.t === "line" && Number.isFinite(e.to.x) && Number.isFinite(e.to.y))).toBe(true);
      expect(closes(lp)).toBe(true);
    }
  });
});

describe("glyph-lib — bulgeArc", () => {
  it("a positive sagitta bulges to the LEFT of travel (outward on a clockwise loop), sweep 1", () => {
    const [e] = bulgeArc({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    if (e?.t !== "arc") throw new Error("an arc");
    expect(e.sweep).toBe(1);
    expect(e.center.y).toBeGreaterThan(0); // the centre is below the chord, so the bulge is above
    expect(e.r).toBeCloseTo((50 * 50 + 20 * 20) / 40, 12);
    const [f] = bulgeArc({ x: 0, y: 0 }, { x: 100, y: 0 }, -20);
    expect(f?.t === "arc" && f.sweep).toBe(0);
  });

  it("splits an arc past 120° at its apex — a semicircle is two 90° edges, sweep read off the sign", () => {
    const es = bulgeArc({ x: 0, y: 0 }, { x: 100, y: 0 }, 80); // held to the half-chord: a semicircle
    expect(es).toHaveLength(2);
    expect(es[0]!.to).toEqual({ x: 50, y: -50 });
    let from: Point = { x: 0, y: 0 };
    for (const e of es) {
      if (e.t !== "arc") throw new Error("an arc");
      expect(e.sweep).toBe(1);
      expect(arcEdgeSweep(from, e)).toBeCloseTo(Math.PI / 2, 12);
      from = e.to;
    }
  });

  it("is a straight edge on a zero chord or a zero sagitta", () => {
    expect(bulgeArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toEqual([{ t: "line", to: { x: 10, y: 0 } }]);
    expect(bulgeArc({ x: 3, y: 3 }, { x: 3, y: 3 }, 5)).toEqual([{ t: "line", to: { x: 3, y: 3 } }]);
  });
});

describe("glyph-lib — a path glyph under the eight frame transforms", () => {
  const C: Point = { x: 1200, y: 2350 };
  const R = { x: 1000, y: 2000, w: 400, h: 700 };

  /** Does `p` lie ON the drawn arc edge — on its circle, inside its sweep? */
  const onArc = (p: Point, from: Point, e: ArcEdge): boolean => {
    if (Math.abs(Math.hypot(p.x - e.center.x, p.y - e.center.y) - e.r) > 1e-6 * Math.max(1, e.r)) return false;
    const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
    const ap = Math.atan2(p.y - e.center.y, p.x - e.center.x);
    const d = arcEdgeSweep(from, e);
    const TAU = 2 * Math.PI;
    const s = d >= 0 ? (((ap - a0) % TAU) + TAU) % TAU : (((a0 - ap) % TAU) + TAU) % TAU;
    return s <= Math.abs(d) + 1e-9 || s >= TAU - 1e-9;
  };

  it("maps every point of every drawn arc onto the mapped arc — so a reflection's sweep flip is right", () => {
    // A synthetic curved glyph — an oval, a lopsided rounded box, and a loop of bulges both ways
    // (one split at its apex) — so the law is about the traversal, not one symbol's art.
    const g = glyphCtx(DEFAULT_THEME, sceneOf().sizes);
    g.path(ovalPath(1150, 2300, 160, 255), g.basin);
    g.path(roundedRectPath(R, [10, 40, 80, 0]), g.body);
    const a = { x: 1000, y: 2600 };
    const b = { x: 1300, y: 2600 };
    const c = { x: 1150, y: 2450 };
    g.path({ start: a, edges: [...bulgeArc(a, b, 140), ...bulgeArc(b, c, -30), ...bulgeArc(c, a, 50)] }, g.basin);
    const wc = g.nodes;
    expect(arcs(wc[2]!).length).toBeGreaterThan(3); // the semicircle was split at its apex
    const maps: [string, (n: SceneNode) => SceneNode, (p: Point) => Point][] = [];
    for (const deg of [0, 90, 180, 270]) {
      const turn = (p: Point): Point => {
        const dx = p.x - C.x;
        const dy = p.y - C.y;
        if (deg === 90) return { x: C.x - dy, y: C.y + dx };
        if (deg === 180) return { x: C.x - dx, y: C.y - dy };
        if (deg === 270) return { x: C.x + dy, y: C.y - dx };
        return p;
      };
      const flip = (p: Point): Point => ({ x: 2 * C.x - p.x, y: p.y });
      maps.push([`r${deg}`, (n) => rotateNode(n, C, deg), turn]);
      maps.push([`r${deg}·m`, (n) => rotateNode(mirrorNode(n, C.x), C, deg), (p) => turn(flip(p))]);
    }
    let checked = 0;
    for (const [name, mapNode, mapPt] of maps) {
      for (const n of wc) {
        if (n.prim.t !== "path") continue;
        const m = mapNode(n);
        if (m.prim.t !== "path") throw new Error("the map changed the primitive kind");
        const src = arcEdgesOf(n.prim);
        const dst = arcEdgesOf(m.prim);
        expect(dst).toHaveLength(src.length);
        src.forEach(({ from, e }, i) => {
          const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
          const d = arcEdgeSweep(from, e);
          for (let k = 1; k < 8; k++) {
            const a = a0 + (d * k) / 8;
            const p = mapPt({ x: e.center.x + e.r * Math.cos(a), y: e.center.y + e.r * Math.sin(a) });
            expect(onArc(p, dst[i]!.from, dst[i]!.e), `${name} edge ${i} sample ${k}`).toBe(true);
            checked++;
          }
        });
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("a curved symbol drawn in a turned frame is the turned symbol: oval and rounded rect", () => {
    const g = (loop: PathLoop): SceneNode[] => [pathNode(loop)];
    // An oval turned a quarter about its centre is the oval with its axes swapped…
    expect(
      marksEqual(
        g(ovalPath(C.x, C.y, 160, 255)).map((n) => rotateNode(n, C, 90)),
        g(ovalPath(C.x, C.y, 255, 160)),
      ),
    ).toBe(true);
    // …and a rounded rect's corner radii move round with it (TL takes what was BL).
    const box = { x: C.x - 200, y: C.y - 100, w: 400, h: 200 };
    const turned = { x: C.x - 100, y: C.y - 200, w: 200, h: 400 };
    expect(
      marksEqual(
        g(roundedRectPath(box, [10, 20, 30, 40])).map((n) => rotateNode(n, C, 90)),
        g(roundedRectPath(turned, [40, 10, 20, 30])),
      ),
    ).toBe(true);
    // A symmetric curve is its own mirror image — the predicate the renderer asks — and a
    // handed one is not, so the predicate is not vacuous.
    const oval = g(ovalPath(C.x, C.y, 160, 255));
    expect(
      marksEqual(
        oval,
        oval.map((n) => mirrorNode(n, C.x)),
      ),
    ).toBe(true);
    const lopsided = g(roundedRectPath(box, [10, 20, 30, 40]));
    expect(
      marksEqual(
        lopsided,
        lopsided.map((n) => mirrorNode(n, C.x)),
      ),
    ).toBe(false);
  });
});
