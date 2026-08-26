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
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { renderSvg } from "../src/backends/svg.js";
import { weightWidth } from "../src/scene.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { dashedPattern, ellipsePoly, glyphCtx, insetRect, insetRectXY, rectPoly } from "../src/elements/glyph-lib.js";

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

  it('"thin" resolves to exactly sizes.thin, "extraThin" to 0.55 of it', () => {
    expect(weightWidth("thin", sizes)).toBe(sizes.thin);
    expect(weightWidth("extraThin", sizes)).toBe(sizes.thin * 0.55);
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
    drawnPattern.forEach((v, i) => expect(v).toBeCloseTo(dashedPattern(sizes)[i]!, 2));
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
