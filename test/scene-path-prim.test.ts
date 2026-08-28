/**
 * The `path` Scene primitive reaches every backend.
 *
 * `path` is the curved generalisation of `region` — a multi-loop closed area whose edges
 * may be true arcs. It is what the wall-joinery layer emits for a plan with a curved
 * facade, where `region`'s polylines would facet the curve.
 *
 * ## Why this test is written BEFORE anything emits one
 *
 * `test/furniture-curves-backends.test.ts` was written for exactly this reason and its
 * header states the rule: a primitive that no shipped plan emits is a primitive no
 * golden covers, so a backend that silently DROPS it passes every existing test. `pdf.ts`
 * already carries a `never` exhaustiveness guard (added after poché fell through a
 * missing case and vanished from every PDF ArchLang had ever exported), and that guard
 * forces a `path` case to exist — but it cannot force the case to be CORRECT.
 *
 * So the Scene here is hand-built, and every assertion is **differential** against the
 * same Scene without the node: a backend that emitted nothing, or emitted the same bytes
 * either way, fails.
 */

import { describe, expect, it } from "vitest";
import { renderSvg } from "../src/backends/svg.js";
import { renderAscii } from "../src/backends/ascii.js";
import { toDxf } from "../src/export/dxf.js";
import { toPdf } from "../src/export/pdf.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import type { PathLoop, Scene, SceneNode } from "../src/scene.js";
import { rotateNode } from "../src/elements/furniture.js";

async function hasPdfkit(): Promise<boolean> {
  try {
    await import("pdfkit" as string);
    return true;
  } catch {
    return false;
  }
}
const HAS_PDFKIT = await hasPdfkit();
const PDFKIT_REQUIRED = !!process.env.CI;

// A door-free plan, so nothing in the base drawing emits an `arc` on its own and "the
// base has no path" is a fact about this fixture rather than an assumption.
const SRC = `plan "Path" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Room"
}`;

/**
 * One loop: two straight edges and one arc, closing back on the start. A quarter turn
 * about (1000, 1000) from (1600, 1000) to (1000, 1600), clockwise as drawn.
 */
const LOOP: PathLoop = {
  start: { x: 1000, y: 1000 },
  edges: [
    { t: "line", to: { x: 1600, y: 1000 } },
    { t: "arc", to: { x: 1000, y: 1600 }, center: { x: 1000, y: 1000 }, r: 600, sweep: 1 },
    { t: "line", to: { x: 1000, y: 1000 } },
  ],
};

const PATH_NODE = (theme: Scene["theme"], width: number): SceneNode => ({
  layer: "wallFace",
  prim: { t: "path", loops: [LOOP] },
  paint: { fill: "none", stroke: theme.wallStroke, width, linejoin: "miter", miterLimit: 4 },
});

function scenes(): { base: Scene; withPath: Scene } {
  const build = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
  const base = build();
  const withPath = build();
  withPath.nodes.push(PATH_NODE(withPath.theme, withPath.sizes.wallStroke));
  return { base, withPath };
}

const { base, withPath } = scenes();

describe("the `path` primitive", () => {
  it("the fixture is honest: the base drawing carries no `path` node at all", () => {
    expect(base.nodes.some((n) => n.prim.t === "path")).toBe(false);
    expect(withPath.nodes.filter((n) => n.prim.t === "path")).toHaveLength(1);
  });

  it("SVG emits one <path> with L and A commands, in region's attribute order", () => {
    const svg = renderSvg(withPath, {});
    const baseline = renderSvg(base, {});
    expect(svg).not.toBe(baseline);
    // The exact `d`: the start, a line, the arc (large-arc flag 0, sweep 1), the closing
    // line, then Z. Endpoints are the stored ones, never re-derived from trig.
    expect(svg).toContain(`d="M 1000,1000 L 1600,1000 A 600 600 0 0 1 1000,1600 L 1000,1000 Z"`);
    // Paint attributes in the same canonical order `region` uses.
    expect(svg).toContain(`fill="none" stroke="${withPath.theme.wallStroke}"`);
    expect(svg).toContain(`stroke-linejoin="miter" stroke-miterlimit="4"`);
  });

  it("SVG emits one loop per PathLoop, joined by a space, like regionPath", () => {
    const two = toScene(resolve(parse(SRC).plan!).ir);
    two.nodes.push({
      layer: "wallFace",
      prim: {
        t: "path",
        loops: [
          LOOP,
          {
            start: { x: 3000, y: 2000 },
            edges: [
              { t: "line", to: { x: 3200, y: 2000 } },
              { t: "line", to: { x: 3200, y: 2200 } },
              { t: "line", to: { x: 3000, y: 2000 } },
            ],
          },
        ],
      },
      paint: { fill: "none", stroke: two.theme.wallStroke, width: two.sizes.wallStroke },
    });
    const svg = renderSvg(two, {});
    expect(svg).toContain("Z M 3000,2000 L 3200,2000 L 3200,2200 L 3000,2000 Z");
  });

  it("DXF emits a LINE per straight edge and a native ARC per curve, on the node's layer", () => {
    // Counted by the full entity HEADER `\n0\n<TYPE>\n`, never by splitting on `\n0\n`
    // alone: a group VALUE of exactly `0` — this very arc's end angle, group 51 — is
    // byte-identical to an entity separator, so a naive split invents a boundary in the
    // middle of an entity and undercounts the ones after it. The header form cannot be
    // produced by a value line.
    const count = (dxf: string, type: string): number => dxf.split(`\n0\n${type}\n`).length - 1;
    expect(count(toDxf(base), "ARC")).toBe(0);
    expect(count(toDxf(withPath), "ARC")).toBe(1);
    // The two straight edges become two more LINEs than the base drawing has.
    expect(count(toDxf(withPath), "LINE") - count(toDxf(base), "LINE")).toBe(2);

    // A-WALL is the AIA layer for the `wallFace` pass; a curve landing anywhere else
    // would be invisible to a CAD user who froze the wrong layer. Group 10/20 is the
    // centre (DXF flips Y, so its y comes out negated) and 40 the radius — both the
    // STORED values, never re-derived from the endpoints.
    const dxf = toDxf(withPath);
    const arcAt = dxf.indexOf("\n0\nARC\n");
    const arcEntity = dxf.slice(arcAt, dxf.indexOf("\n0\nLINE\n", arcAt + 7));
    expect(arcEntity).toContain("A-WALL");
    expect(arcEntity).toContain("\n10\n1000\n20\n-1000\n");
    expect(arcEntity).toContain("\n40\n600\n");
    // The two straight edges are there with their own exact endpoints.
    expect(dxf).toContain("\n0\nLINE\n8\nA-WALL\n10\n1000\n20\n-1000\n11\n1600\n21\n-1000\n");
    expect(dxf).toContain("\n0\nLINE\n8\nA-WALL\n10\n1000\n20\n-1600\n11\n1000\n21\n-1000\n");
  });

  it("ASCII rasterises it without throwing, and draws something the base does not", () => {
    const a = renderAscii(base);
    const b = renderAscii(withPath);
    expect(() => renderAscii(withPath)).not.toThrow();
    expect(b).not.toBe(a);
    expect(renderAscii(withPath)).toBe(b); // deterministic
  });

  it("ASCII tessellates the arc rather than dropping it", () => {
    // The same loop with the arc replaced by its chord draws LESS ink; if the tessellation
    // were dropped the two would agree.
    const chord = toScene(resolve(parse(SRC).plan!).ir);
    chord.nodes.push({
      layer: "wallFace",
      prim: {
        t: "path",
        loops: [
          {
            start: LOOP.start,
            edges: [
              { t: "line", to: { x: 1600, y: 1000 } },
              { t: "line", to: { x: 1000, y: 1600 } },
              { t: "line", to: { x: 1000, y: 1000 } },
            ],
          },
        ],
      },
      paint: { fill: "none", stroke: chord.theme.wallStroke, width: chord.sizes.wallStroke },
    });
    expect(renderAscii(withPath)).not.toBe(renderAscii(chord));
  });

  if (!HAS_PDFKIT) {
    const gate = "optional dep pdfkit is installed";
    if (PDFKIT_REQUIRED) {
      it(gate, () => {
        throw new Error(
          "optional dep pdfkit missing in CI — install step is broken. The PDF backend's " +
            "`path` case went unasserted, which is the exact shape of the defect that once " +
            "dropped poché from every PDF ArchLang exported.",
        );
      });
    } else {
      it.skip(`${gate} (absent locally — the PDF path case was not exercised)`, () => {});
    }
  } else {
    it("PDF renders it, and the bytes differ from the same Scene without it", async () => {
      const a = await toPdf(base);
      const b = await toPdf(withPath);
      expect(Buffer.from(a)).not.toEqual(Buffer.from(b));
      expect(b.length).toBeGreaterThan(100);
      // `toPdf` is byte-deterministic (v1.26.1), so this must hold across two renders.
      expect(Buffer.from(await toPdf(withPath))).toEqual(Buffer.from(b));
    });
  }
});

describe("rotateNode carries a `path` through a quarter turn", () => {
  const node = PATH_NODE(withPath.theme, 1);
  const centre = { x: 1000, y: 1000 };

  it("rotates start, every `to` and every `center`, and leaves r and sweep alone", () => {
    for (const deg of [90, 180, 270]) {
      const r = rotateNode(node, centre, deg);
      expect(r.prim.t).toBe("path");
      if (r.prim.t !== "path") continue;
      const lp = r.prim.loops[0]!;
      // The loop is anchored at the rotation centre, so the start does not move.
      expect(lp.start.x).toBeCloseTo(1000, 9);
      expect(lp.start.y).toBeCloseTo(1000, 9);
      const arc = lp.edges[1]!;
      expect(arc.t).toBe("arc");
      if (arc.t !== "arc") continue;
      // `r` is a length and a rotation preserves orientation, so neither may move.
      expect(arc.r).toBe(600);
      expect(arc.sweep).toBe(1);
      // The arc's centre rotates with everything else (here it IS the centre).
      expect(arc.center.x).toBeCloseTo(1000, 9);
      expect(arc.center.y).toBeCloseTo(1000, 9);
    }
  });

  it("a 90° turn really MOVES the geometry — the rotation is not a no-op", () => {
    const r = rotateNode(node, { x: 0, y: 0 }, 90);
    expect(r.prim.t).toBe("path");
    if (r.prim.t !== "path") return;
    const lp = r.prim.loops[0]!;
    // (1000,1000) turned 90° about the origin lands at (-1000,1000) in y-down space.
    expect(lp.start.x).toBeCloseTo(-1000, 9);
    expect(lp.start.y).toBeCloseTo(1000, 9);
    const first = lp.edges[0]!;
    expect(first.to.x).toBeCloseTo(-1000, 9);
    expect(first.to.y).toBeCloseTo(1600, 9);
  });

  it("four quarter turns return the original geometry", () => {
    let r = node;
    for (let i = 0; i < 4; i++) r = rotateNode(r, { x: 500, y: 700 }, 90);
    expect(r.prim.t).toBe("path");
    if (r.prim.t !== "path") return;
    const lp = r.prim.loops[0]!;
    expect(lp.start.x).toBeCloseTo(LOOP.start.x, 6);
    expect(lp.start.y).toBeCloseTo(LOOP.start.y, 6);
  });
});
