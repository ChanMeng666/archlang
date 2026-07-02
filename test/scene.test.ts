import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { renderSvg } from "../src/backends/svg.js";
import { compile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

function sceneOf(src: string) {
  const { plan } = parse(src);
  return toScene(resolve(plan!).ir);
}

describe("Scene IR", () => {
  it("lowers studio.arch to a golden set of positioned primitives", () => {
    const scene = sceneOf(example("studio.arch"));
    // Snapshot the geometry (theme/sizes are derived + verbose, omitted).
    expect({
      width: scene.width,
      height: scene.height,
      bounds: scene.bounds,
      hatches: scene.hatches,
      nodes: scene.nodes,
    }).toMatchSnapshot();
  });

  it("is deterministic (toScene is byte-stable across calls)", () => {
    const a = JSON.stringify(sceneOf(example("studio.arch")).nodes);
    const b = JSON.stringify(sceneOf(example("studio.arch")).nodes);
    expect(a).toBe(b);
  });

  it("renderSvg(toScene(ir)) equals compile().svg for every shipped example", () => {
    for (const name of ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch"]) {
      const src = example(name);
      const { plan } = parse(src);
      const ir = resolve(plan!).ir;
      const viaScene = renderSvg(toScene(ir), {});
      expect(viaScene).toBe(compile(src, { noCache: true }).svg);
    }
  });

  it("draws a glyph for a known fixture category and a labelled rectangle otherwise", () => {
    const base = `plan "P" { units mm room id=r at (0,0) size 3000x3000 label "R"`;
    const wc = sceneOf(`${base} furniture wc at (200,200) size 400x700 label "WC" }`).nodes.filter(
      (n) => n.layer === "furniture",
    );
    const box = sceneOf(`${base} furniture box at (200,200) size 400x700 label "Box" }`).nodes.filter(
      (n) => n.layer === "furniture",
    );
    // The fixture glyph emits several primitives and no label text; the plain box
    // is exactly one polygon plus its label text.
    expect(wc.some((n) => n.prim.t === "text")).toBe(false);
    expect(wc.length).toBeGreaterThan(1);
    expect(box.filter((n) => n.prim.t === "polygon").length).toBe(1);
    expect(box.some((n) => n.prim.t === "text")).toBe(true);
  });

  it("synthesizes dimension nodes only when `dims auto` is set", () => {
    const src = (head: string) =>
      `plan "P" { units mm ${head} wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close } room id=r at (0,0) size 3000x3000 label "R" }`;
    const without = sceneOf(src("")).nodes.filter((n) => n.layer === "dims");
    const withAuto = sceneOf(src("dims auto")).nodes.filter((n) => n.layer === "dims");
    expect(without.length).toBe(0);
    expect(withAuto.length).toBeGreaterThan(0);
  });

  it("places overall `dims auto` lines OUTSIDE the plan footprint, not inside it", () => {
    const src = `plan "P" { units mm dims auto overall wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close } room id=r at (0,0) size 3000x3000 label "R" }`;
    const scene = sceneOf(src);
    const b = scene.bounds;
    // The overall width dim runs below the plan and the height dim runs to its left;
    // both dimension *lines* (and their witness lines) must clear the footprint —
    // a positive offset on the wrong endpoint order used to draw them inside (the
    // "6000 dimension into the building" bug).
    const lines = scene.nodes.filter((n) => n.layer === "dims" && n.prim.t === "line");
    const below = lines.some((n: any) => n.prim.a.y > b.maxY + 1 && n.prim.b.y > b.maxY + 1);
    const left = lines.some((n: any) => n.prim.a.x < b.minX - 1 && n.prim.b.x < b.minX - 1);
    expect(below, "expected a width dimension below the plan").toBe(true);
    expect(left, "expected a height dimension left of the plan").toBe(true);
    // And NOTHING on the dims layer should sit strictly inside the footprint margin.
    const insideX = (x: number) => x > b.minX + 1 && x < b.maxX - 1;
    const insideY = (y: number) => y > b.minY + 1 && y < b.maxY - 1;
    const overallLineInside = lines.some(
      (n: any) => insideX(n.prim.a.x) && insideX(n.prim.b.x) && insideY(n.prim.a.y) && insideY(n.prim.b.y),
    );
    expect(overallLineInside, "no overall dim line should be fully inside the plan").toBe(false);
  });

  it("places per-room `dims auto rooms` OUTSIDE the building, clear of the interior", () => {
    // Two stacked rooms inside a 4000×6000 shell. Every room edge here is on the
    // building perimeter, so each room's width/height dim should land in the margin
    // (not over the centered label/furniture — the old just-inside placement bug).
    const src =
      `plan "P" { units mm dims auto rooms ` +
      `wall exterior thickness 200 { (0,0) (4000,0) (4000,6000) (0,6000) close } ` +
      `wall partition thickness 100 { (0,3000) (4000,3000) } ` +
      `room id=top at (0,0) size 4000x3000 label "Top" ` +
      `room id=bot at (0,3000) size 4000x3000 label "Bot" }`;
    const scene = sceneOf(src);
    const b = scene.bounds;
    const texts = scene.nodes.filter((n: any) => n.layer === "dims" && n.prim.t === "text");
    // No room-dim number should sit strictly inside the footprint interior.
    const inside = texts.some(
      (n: any) =>
        n.prim.at.x > b.minX + 1 && n.prim.at.x < b.maxX - 1 && n.prim.at.y > b.minY + 1 && n.prim.at.y < b.maxY - 1,
    );
    expect(inside, "no per-room dim text should sit inside the building").toBe(false);
    // Both dimensioned values are present (4000 width, 3000 height).
    const vals = texts.map((n: any) => n.prim.value);
    expect(vals).toContain("4000");
    expect(vals).toContain("3000");
  });

  it("annotates each distinct wall thickness once with `dims auto walls`", () => {
    // Exterior 200 + two 100 partitions: the thickness call-outs must be deduped to
    // one "200" and one "100" (not one per partition), each carrying the thickness.
    const src =
      `plan "P" { units mm dims auto walls ` +
      `wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close } ` +
      `wall partition thickness 100 { (3000,0) (3000,4000) } ` +
      `wall partition thickness 100 { (0,2000) (3000,2000) } ` +
      `room id=r at (0,0) size 3000x4000 label "R" }`;
    const scene = sceneOf(src);
    const texts = scene.nodes
      .filter((n: any) => n.layer === "dims" && n.prim.t === "text")
      .map((n: any) => n.prim.value)
      .sort();
    expect(texts).toEqual(["100", "200"]);
  });

  it("grows the page so a far right-side dimension never clips the viewBox", () => {
    // A right-edge dim whose offset (4000) far exceeds the base margin used to escape
    // the page (only the bottom margin grew). Per-side margins now contain it.
    const src = `plan "P" { units mm dim (3000,3000)->(3000,0) offset 4000 text "H" wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close } room id=r at (0,0) size 3000x3000 label "R" }`;
    const { svg } = compile(src, { noCache: true });
    const vb = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/)!;
    const right = Number(vb[1]) + Number(vb[3]);
    const tx = Number(svg.match(/<text x="([\d.]+)"[^>]*>H<\/text>/)![1]);
    expect(tx, "right dim sits outside the 3000 footprint").toBeGreaterThan(3100);
    expect(tx, "right dim stays inside the grown viewBox").toBeLessThan(right);
  });

  it("emits every primitive kind across the example corpus", () => {
    const kinds = new Set<string>();
    for (const name of ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch"]) {
      for (const n of sceneOf(example(name)).nodes) kinds.add(n.prim.t);
    }
    // walls union → hatch fill + region face, openings → polygon/line, doors → arc, labels → text.
    expect(kinds).toContain("polygon");
    expect(kinds).toContain("line");
    expect(kinds).toContain("region");
    expect(kinds).toContain("hatch");
    expect(kinds).toContain("arc");
    expect(kinds).toContain("text");
  });
});
