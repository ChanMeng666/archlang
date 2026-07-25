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

  // ---- GB/T dimension chains (`dims auto`) ---------------------------------
  //
  // A 6200×5200-outside cottage (6000×5000 of room grid inside a 200 shell) with a
  // fully INTERIOR room — the case the old per-room dims drew *inside* the building —
  // plus one opening per facade so every chain has content.
  const chainPlan = (head: string, extras = "") =>
    `plan "P" { units mm ${head} ` +
    `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close } ` +
    `wall id=vL partition thickness 100 { (1500,0) (1500,5000) } ` +
    `wall id=vR partition thickness 100 { (4500,0) (4500,5000) } ` +
    `wall id=hT partition thickness 100 { (1500,1000) (4500,1000) } ` +
    `wall id=hB partition thickness 100 { (1500,4000) (4500,4000) } ` +
    `room id=left at (0,0) size 1500x5000 label "Left" ` +
    `room id=core at (1500,1000) size 3000x3000 label "Core" ` + // interior on all four sides
    `room id=right at (4500,0) size 1500x5000 label "Right" ` +
    `door id=d_s at (3000,5000) width 1000 wall shell hinge left swing in ` +
    `window id=w_n at (3000,0) width 1200 wall shell ` +
    `window id=w_w at (0,2500) width 1500 wall shell ` +
    `window id=w_e at (6000,2500) width 900 wall shell ${extras}}`;

  const dimTexts = (scene: ReturnType<typeof sceneOf>) =>
    scene.nodes.filter((n: any) => n.layer === "dims" && n.prim.t === "text").map((n: any) => n.prim);
  const dimLines = (scene: ReturnType<typeof sceneOf>) =>
    scene.nodes.filter((n: any) => n.layer === "dims" && n.prim.t === "line").map((n: any) => n.prim);

  it("never draws a `dims auto all` chain inside the building — not even for a fully interior room", () => {
    const scene = sceneOf(chainPlan("dims auto all"));
    // The room-extents box (what a reader sees as "the building"), not the page bounds.
    const room = { minX: 0, minY: 0, maxX: 6000, maxY: 5000 };
    const insideX = (x: number) => x > room.minX + 1 && x < room.maxX - 1;
    const insideY = (y: number) => y > room.minY + 1 && y < room.maxY - 1;
    // Wall-thickness call-outs legitimately sit ON their wall; the chains must not.
    const inside = dimLines(scene).filter(
      (p: any) => insideX(p.a.x) && insideX(p.b.x) && insideY(p.a.y) && insideY(p.b.y),
    );
    // Only the two thickness call-outs (200 + 100) and their ticks may be inside.
    const callOutTexts = dimTexts(scene).filter((p: any) => p.value === "200" || p.value === "100");
    expect(callOutTexts.length).toBe(2);
    // Every inside line belongs to a call-out: it is at most one wall thickness long.
    for (const p of inside) {
      expect(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)).toBeLessThanOrEqual(300);
    }
    // And no chain TEXT lands inside the building.
    const insideText = dimTexts(scene).filter(
      (p: any) => insideX(p.at.x) && insideY(p.at.y) && p.value !== "200" && p.value !== "100",
    );
    expect(insideText, "no chain number should sit inside the building").toEqual([]);
  });

  it("`dims auto all` chains the opening edges from the outer corner on each facade", () => {
    const scene = sceneOf(chainPlan("dims auto all"));
    // South facade: outer corners at x −100 / 6100, a 1000-wide door centred at 3000
    // → edges 2500 / 3500, so the openings chain reads 2600 · 1000 · 2600.
    const south = dimTexts(scene)
      .filter((p: any) => p.at.y > 5100)
      .sort((a: any, b: any) => a.at.y - b.at.y || a.at.x - b.at.x);
    const bands = new Map<number, string[]>();
    for (const p of south) {
      const key = Math.round(p.at.y);
      bands.set(key, [...(bands.get(key) ?? []), p.value]);
    }
    const rows = [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    expect(rows[0], "innermost = openings chain").toEqual(["2600", "1000", "2600"]);
    expect(rows[1], "middle = room/partition axis chain").toEqual(["1500", "3000", "1500"]);
    expect(rows[2], "outermost = overall outer-face span").toEqual(["6200"]);
  });

  it("`dims auto` measures the overall chain outer face to outer face", () => {
    const scene = sceneOf(chainPlan("dims auto overall"));
    const vals = dimTexts(scene).map((p: any) => p.value);
    // 6000×5000 of room grid inside a 200 shell measures 6200×5200 outside.
    expect(vals.sort()).toEqual(["5200", "6200"]);
  });

  it("dimensions the top/right facades only when `all` finds openings there", () => {
    const withNorth = dimTexts(sceneOf(chainPlan("dims auto all"))).filter((p: any) => p.at.y < -100);
    expect(withNorth.length, "north facade has a window → it is chained").toBeGreaterThan(0);
    // Same plan with no north/east openings: those facades carry nothing.
    const blind =
      `plan "P" { units mm dims auto all ` +
      `wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close } ` +
      `room id=r at (0,0) size 6000x5000 label "R" ` +
      `door id=d_s at (3000,5000) width 1000 wall shell hinge left swing in }`;
    const scene = sceneOf(blind);
    expect(
      dimTexts(scene).filter((p: any) => p.at.y < -100),
      "no north chain",
    ).toEqual([]);
    expect(
      dimTexts(scene).filter((p: any) => p.at.x > 6100),
      "no east chain",
    ).toEqual([]);
    // The south + west facades are always dimensioned.
    expect(dimTexts(scene).filter((p: any) => p.at.y > 5100).length).toBeGreaterThan(0);
    expect(dimTexts(scene).filter((p: any) => p.at.x < -100).length).toBeGreaterThan(0);
  });

  it("`dims auto rooms` emits ONE axis chain per dimensioned facade and nothing else", () => {
    const scene = sceneOf(chainPlan("dims auto rooms"));
    const texts = dimTexts(scene);
    // Bottom + left only, one band each: x boundaries 0·1500·4500·6000 and
    // y boundaries 0·1000·4000·5000.
    const south = texts.filter((p: any) => p.at.y > 5100).map((p: any) => p.value);
    const west = texts.filter((p: any) => p.at.x < -100).map((p: any) => p.value);
    expect(south).toEqual(["1500", "3000", "1500"]);
    expect(west).toEqual(["1000", "3000", "1000"]);
    expect(texts.length, "no openings chain, no overall span, no north/east chains").toBe(6);
  });

  it("a zero-offset dim draws no (degenerate) witness lines", () => {
    const on = `plan "P" { units mm dim (0,0)->(1000,0) offset 300 room id=r at (0,0) size 1000x1000 }`;
    const zero = `plan "P" { units mm dim (0,0)->(1000,0) offset 0 room id=r at (0,0) size 1000x1000 }`;
    // Offset dim: 2 witness lines + the dim line + 2 ticks. Zero offset: the two
    // witness lines would be zero-length, so they are dropped.
    expect(dimLines(sceneOf(on)).length).toBe(5);
    expect(dimLines(sceneOf(zero)).length).toBe(3);
    expect(dimLines(sceneOf(zero)).every((p: any) => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) > 0)).toBe(true);
  });

  it("chain synthesis is deterministic (byte-stable across calls)", () => {
    const a = JSON.stringify(sceneOf(chainPlan("dims auto all")).nodes);
    const b = JSON.stringify(sceneOf(chainPlan("dims auto all")).nodes);
    expect(a).toBe(b);
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
