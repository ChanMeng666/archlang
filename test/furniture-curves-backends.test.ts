/**
 * Do all four backends actually DRAW a curve that lands on the `furniture` pass?
 *
 * The furniture layer has only ever carried polygons, lines and text. `elements/glyph-lib.ts`
 * gives the glyph authors `dot`/`ring`/`arcSeg`, so `circle` and `arc` are about to appear
 * there for the first time — and the v1.26.1 lesson is that a shipped surface is proven by
 * INVOCATION, not by reading the switch that looks like it handles it. Poché was missing from
 * every PDF ArchLang ever exported because `drawNode` had no `hatch` case and no `default`,
 * and reading the file did not find it for twenty-five releases.
 *
 * So this suite hand-builds the Scene rather than waiting for a glyph to exist: a real plan's
 * Scene with one `arc` and one `circle` appended to the furniture pass. That is the least
 * invasive way to reach the four serializers — no test-only `ElementDef`, no registry
 * mutation, nothing in `src/` that ships. Every assertion is DIFFERENTIAL: the same Scene
 * without the two nodes is rendered too, and the plan is deliberately door-free so the base
 * drawing contains no curve of its own. A backend that silently dropped the primitives would
 * produce identical output and fail here.
 *
 * `pdfkit` is an `optionalDependency`, so its half follows the `test/png.test.ts` /
 * `test/export-pdf.test.ts` shape: **required in CI** (a missing dep is a broken install),
 * a **visible named skip** locally — never a silent pass.
 */

import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { renderSvg } from "../src/backends/svg.js";
import { renderAscii } from "../src/backends/ascii.js";
import { toDxf } from "../src/export/dxf.js";
import { toPdf } from "../src/export/pdf.js";
import type { Scene, SceneNode } from "../src/scene.js";

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

// A door-free plan: nothing in the base drawing emits an `arc` (a door swing is the only
// other producer), so "the base has no curve" below is a fact about this fixture, asserted.
const SRC = `plan "Curves" {
  units mm
  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Room"
  furniture id=marker box at (200,200) size 400x400 label "Curvy"
}`;

/** Every `stream … endstream` payload, inflated (mirrors `test/export-pdf.test.ts`). */
function inflatedStreams(pdf: Uint8Array): string[] {
  const buf = Buffer.from(pdf);
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const s = buf.indexOf("stream", i);
    if (s < 0) break;
    if (buf.subarray(s - 3, s).toString("latin1") === "end") {
      i = s + 6;
      continue;
    }
    let p = s + 6;
    if (buf[p] === 0x0d) p++;
    if (buf[p] === 0x0a) p++;
    const e = buf.indexOf("endstream", p);
    if (e < 0) break;
    let end = e;
    while (end > p && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d)) end--;
    try {
      out.push(inflateSync(buf.subarray(p, end)).toString("latin1"));
    } catch {
      /* a font file or an uncompressed stream — not the page content */
    }
    i = e + 9;
  }
  return out;
}

/** The page's vector operator stream — what a reader actually sees drawn. */
function pageOps(pdf: Uint8Array): string {
  const ops = inflatedStreams(pdf).find((s) => s.includes(" cm\n"));
  if (ops === undefined) throw new Error("no page content stream found in the PDF");
  return ops;
}

const ARC: Extract<SceneNode["prim"], { t: "arc" }> = {
  t: "arc",
  center: { x: 1200, y: 1000 },
  r: 200,
  start: { x: 1200, y: 800 },
  end: { x: 1400, y: 1000 },
  sweep: 1,
};
const CIRCLE: Extract<SceneNode["prim"], { t: "circle" }> = { t: "circle", center: { x: 2000, y: 1500 }, r: 150 };

/** The plan's Scene, and the same Scene with an arc + a circle on the furniture pass. */
function scenes(): { base: Scene; curved: Scene } {
  const build = (): Scene => toScene(resolve(parse(SRC).plan!).ir);
  const base = build();
  const curved = build();
  const paint = { fill: "none", stroke: curved.theme.furnitureStroke, width: curved.sizes.thin };
  curved.nodes.push(
    { layer: "furniture", prim: ARC, paint, elementId: "marker", elementKind: "furniture" },
    { layer: "furniture", prim: CIRCLE, paint, elementId: "marker", elementKind: "furniture" },
  );
  return { base, curved };
}

describe("furniture-layer curves reach every backend", () => {
  const { base, curved } = scenes();

  it("the fixture is honest: the base drawing contains no arc or circle at all", () => {
    expect(base.nodes.some((n) => n.prim.t === "arc" || n.prim.t === "circle")).toBe(false);
    expect(curved.nodes.filter((n) => n.layer === "furniture" && n.prim.t === "arc")).toHaveLength(1);
    expect(curved.nodes.filter((n) => n.layer === "furniture" && n.prim.t === "circle")).toHaveLength(1);
  });

  it("SVG emits an `A` path command and a <circle>", () => {
    const svg = renderSvg(curved, {});
    expect(renderSvg(base, {})).not.toContain("<circle");
    // The exact command the arc lowers to — endpoints and sweep, not re-derived from trig.
    expect(svg).toContain(`M 1200,800 A 200 200 0 0 1 1400,1000`);
    expect(svg).toContain(`<circle cx="2000" cy="1500" r="150"`);
  });

  it("DXF emits native ARC and CIRCLE entities on the furniture layer", () => {
    // DXF is a line-oriented group-code stream: `0` opens an entity, `8` names its layer.
    const entitiesOf = (dxf: string): string[] => dxf.split("\n0\n").slice(1);
    const curvesIn = (dxf: string): string[] =>
      entitiesOf(dxf).filter((e) => e.startsWith("ARC\n") || e.startsWith("CIRCLE\n"));
    expect(curvesIn(toDxf(base))).toHaveLength(0);
    const curves = curvesIn(toDxf(curved));
    expect(curves.map((e) => e.split("\n")[0])).toEqual(["ARC", "CIRCLE"]);
    // Both must land on A-FURN — the AIA layer for the `furniture` pass — or a CAD user
    // freezing the furniture layer would keep the curve.
    for (const e of curves) expect(e.split("\n").slice(0, 3)).toContain("A-FURN");
  });

  it("ASCII accounts for the curves in the furniture item's extent", () => {
    // The ASCII backend groups a fixture's primitives by `elementId` and marks the centre
    // of their combined extent. Both new nodes carry the same id as the box, so the marker
    // MOVES — which is only true if `pointsOf` reads an arc's and a circle's own points.
    const a = renderAscii(base, { charset: "ascii" });
    const b = renderAscii(curved, { charset: "ascii" });
    expect(b).not.toBe(a);
    expect(b).toContain("C"); // the "Curvy" marker, still drawn
    expect(b.split("\n").length).toBe(a.split("\n").length); // same grid, moved marker
  });

  describe("PDF", () => {
    if (!HAS_PDFKIT) {
      const gate = "optional dep pdfkit is installed";
      if (PDFKIT_REQUIRED) {
        it(gate, () => {
          throw new Error(
            "optional dep pdfkit missing in CI — install step is broken. The PDF backend was NOT " +
              "exercised for furniture-layer arcs/circles, the primitives `elements/glyph-lib.ts` " +
              "is about to start emitting. Check that the install step still pulls optionalDependencies.",
          );
        });
      } else {
        it.skip(`${gate} (skipped: pdfkit not installed locally)`, () => {});
      }
      return;
    }

    it("draws them as bezier curves in the page content stream", async () => {
      // A PDF has no arc operator: pdfkit lowers an SVG `A` and a `circle` alike to cubic
      // bezier (`c`) ops. The plan is door-free and rectilinear, so the base page has none
      // — which is what makes the curved page's `c` ops evidence rather than coincidence.
      const flat = pageOps(await toPdf(base));
      const withCurves = pageOps(await toPdf(curved));
      expect(flat).toContain(" l\n"); // guard: the reader really is looking at drawing ops
      expect(flat).not.toContain(" c\n");
      expect(withCurves).toContain(" c\n");
    });

    it("is byte-identical across two renders", async () => {
      const a = await toPdf(curved);
      const b = await toPdf(curved);
      expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
    });
  });
});
