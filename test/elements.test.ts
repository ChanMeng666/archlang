import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { registry, registryOrder } from "../src/elements/index.js";

describe("element registry", () => {
  it("registers every element keyword in canonical order", () => {
    expect(registryOrder.map((d) => d.keyword)).toEqual([
      "wall",
      "room",
      "door",
      "window",
      "furniture",
      "dim",
      "column",
    ]);
    expect(registry.get("room")?.kind).toBe("room");
  });
});

describe("column — extensibility proof", () => {
  // `column` is a whole element type added as one module + one register line,
  // with no edits to parser/render cores. If this renders, the registry works.
  const src = `plan "C" { column id=c1 at (1000,1000) size 400x400 }`;

  it("parses, resolves, and renders a registered-only element", () => {
    const { svg, errors, ast } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(ast?.elements[0].kind).toBe("column");
    expect(svg).toContain('fill="#4a4a4a"'); // column fill
    expect(svg).toContain("1000,1000 1400,1000 1400,1400 1000,1400"); // snapped square
  });

  it("reports a positive-size error via the generic resolve path", () => {
    const { svg, diagnostics } = compile(`plan "C" { column at (0,0) size 0x400 }`, { noCache: true });
    expect(svg).toBe("");
    expect(diagnostics.some((d) => d.code === "E_COLUMN_SIZE")).toBe(true);
  });
});

describe("render passes — global draw order is independent of source order", () => {
  it("draws all wall fills before any wall faces", () => {
    const src = [
      'plan "W" {',
      "  wall a thickness 200 { (0,0) (4000,0) }",
      "  wall b thickness 200 { (0,2000) (4000,2000) }",
      "}",
    ].join("\n");
    const { svg } = compile(src, { noCache: true });
    const lastFill = svg.lastIndexOf('fill="url(#poche)"');
    const firstFace = svg.indexOf('stroke-linecap="square"');
    expect(lastFill).toBeGreaterThan(-1);
    expect(firstFace).toBeGreaterThan(lastFill);
  });

  it("draws doors before windows even when the window is declared first", () => {
    const src = [
      'plan "O" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }",
      "  window at (3000,0) width 800 wall exterior",
      "  door at (1000,0) width 900 wall exterior",
      "}",
    ].join("\n");
    const { svg } = compile(src, { noCache: true });
    const doorLeaf = svg.indexOf('stroke="#555555"'); // door leaf
    const windowPane = svg.indexOf('stroke="#3a6ea5"'); // window glazing
    expect(doorLeaf).toBeGreaterThan(-1);
    expect(windowPane).toBeGreaterThan(doorLeaf);
  });
});
