import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { renderSvg } from "../src/backends/svg.js";
import { toDxf } from "../src/export/dxf.js";
import type { Scene, SceneNode } from "../src/scene.js";

/** A valid Scene skeleton (from a tiny plan) with custom nodes spliced in. */
function sceneWith(nodes: SceneNode[]): Scene {
  const base = compile(`plan "S" { column at (0,0) size 1000x1000 }`, { noCache: true }).scene!;
  return { ...base, nodes };
}

const line = (y: number, extra: Partial<SceneNode>): SceneNode => ({
  layer: "wallFace",
  prim: { t: "line", a: { x: 0, y }, b: { x: 1000, y } },
  paint: { stroke: "#000000" },
  ...extra,
});

describe("Scene style metadata (T3.1)", () => {
  it("line weights map to a named ramp (heavy is wider than extraThin)", () => {
    const svg = renderSvg(sceneWith([
      line(0, { lineWeight: "heavy" }),
      line(500, { lineWeight: "extraThin" }),
    ]));
    const widths = [...svg.matchAll(/<line[^>]*stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeGreaterThan(widths[1]); // heavy > extraThin
  });

  it("a dashed line round-trips to an SVG stroke-dasharray", () => {
    const svg = renderSvg(sceneWith([line(0, { lineType: "dashed" })]));
    expect(svg).toMatch(/stroke-dasharray="[\d.]+ [\d.]+"/);
  });

  it("a center line emits a 4-value SVG dash pattern", () => {
    const svg = renderSvg(sceneWith([line(0, { lineType: "center" })]));
    const m = svg.match(/stroke-dasharray="([^"]+)"/);
    expect(m).not.toBeNull();
    expect(m![1].split(" ").length).toBe(4);
  });

  it("a continuous (or unset) line emits no dash array", () => {
    const svg = renderSvg(sceneWith([line(0, {}), line(500, { lineType: "continuous" })]));
    expect(svg).not.toContain("stroke-dasharray");
  });

  it("DXF declares an LTYPE table BEFORE the LAYER table", () => {
    const dxf = toDxf(sceneWith([line(0, { lineType: "dashed" })]));
    const ltype = dxf.indexOf("\nLTYPE\n");
    const layer = dxf.indexOf("\nLAYER\n");
    expect(ltype).toBeGreaterThanOrEqual(0);
    expect(layer).toBeGreaterThanOrEqual(0);
    expect(ltype).toBeLessThan(layer);
    for (const name of ["CONTINUOUS", "DASHED", "CENTER", "HIDDEN"]) expect(dxf).toContain(name);
  });

  it("a dashed/center DXF entity carries a linetype (group code 6); continuous does not", () => {
    const dxf = toDxf(sceneWith([
      line(0, { lineType: "center" }),
      line(500, {}), // continuous → BYLAYER, no code 6 on the entity
    ]));
    expect(dxf).toContain("\n6\nCENTER\n"); // explicit linetype on the center line
    // Exactly one entity-level code-6 CENTER (the LTYPE table uses code 2 for names).
    expect((dxf.match(/\n6\nCENTER\n/g) ?? []).length).toBe(1);
  });

  it("style metadata is deterministic", () => {
    const mk = () => renderSvg(sceneWith([line(0, { lineWeight: "medium", lineType: "hidden" })]));
    expect(mk()).toBe(mk());
  });
});

describe("AIA layers (T3.2)", () => {
  const src = `plan "L" {
    wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room at (0,0) size 4000x3000 label "R"
    door at (2000,0) width 900 wall exterior
    column at (500,500) size 300x300
  }`;

  it("SVG groups nodes into Inkscape layers per AIA name", () => {
    const { scene } = compile(src, { noCache: true });
    const svg = renderSvg(scene!);
    for (const lyr of ["A-WALL", "A-FLOR", "A-DOOR", "A-COLS"]) {
      expect(svg).toContain(`<g id="${lyr}" inkscape:groupmode="layer"`);
    }
    expect(svg).toContain('xmlns:inkscape=');
  });

  it("a column lands on A-COLS, not A-FURN", () => {
    const { scene } = compile(src, { noCache: true });
    const col = scene!.nodes.find((n) => n.layerName === "A-COLS");
    expect(col).toBeDefined();
  });

  it("DXF declares AIA layers with colours and references them on entities", () => {
    const { scene } = compile(src, { noCache: true });
    const dxf = toDxf(scene!);
    for (const lyr of ["A-WALL", "A-FLOR", "A-DOOR", "A-COLS"]) expect(dxf).toContain(lyr);
    expect(dxf).toContain("\n8\nA-COLS\n"); // an entity is on the A-COLS layer
  });
});

describe("openings void walls (T3.3)", () => {
  const wallLoops = (src: string) => {
    const { scene } = compile(src, { noCache: true });
    const node = scene!.nodes.find((n) => n.layer === "wallFill" && n.prim.t === "region");
    return node && node.prim.t === "region" ? node.prim.loops : [];
  };

  it("a door cuts its host wall into two pieces", () => {
    const intact = wallLoops(`plan "P" { wall exterior thickness 200 { (0,0) (4000,0) } }`);
    const cut = wallLoops(`plan "P" { wall exterior thickness 200 { (0,0) (4000,0) } door at (2000,0) width 900 wall exterior }`);
    expect(intact.length).toBe(1); // solid band
    expect(cut.length).toBe(2); // split by the opening
  });

  it("the opening gap matches the door width and position", () => {
    const cut = wallLoops(`plan "P" { wall exterior thickness 200 { (0,0) (4000,0) } door at (2000,0) width 900 wall exterior }`);
    const xs = new Set(cut.flat().map((p) => p.x));
    expect(xs.has(1550)).toBe(true); // 2000 - 450
    expect(xs.has(2450)).toBe(true); // 2000 + 450
  });

  it("a window also voids its host wall", () => {
    const cut = wallLoops(`plan "P" { wall exterior thickness 200 { (0,0) (4000,0) } window at (2000,0) width 1200 wall exterior }`);
    expect(cut.length).toBe(2);
  });

  it("cutting is deterministic", () => {
    const src = `plan "P" { wall exterior thickness 200 { (0,0) (4000,0) } door at (2000,0) width 900 wall exterior }`;
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});
