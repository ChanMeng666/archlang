/**
 * `void … polygon` and `void … rail` (issue #405, plan decision CR-D8): what the forms draw, report
 * and refuse. The byte-identity law for plans that write neither is `test/void-rail-byte-identity.test.ts`.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint } from "../src/index.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import { voidPieces } from "../src/elements/void.js";
import type { RVoid } from "../src/ir.js";

const L = "(1000,1000) (4000,1000) (4000,2000) (2000,2000) (2000,4000) (1000,4000)";
const plan = (body: string): string =>
  `plan "V" {\n  units mm\n  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }\n  room id=a at (0,0) size 6000x5000 label "Landing" uses hall\n  door id=d on s at 3000 width 900\n${body}\n}\n`;

const errors = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);

/** The `<line>`s of one SVG layer group, each as its four numbers. */
const linesOn = (svg: string, layer: string): number[][] => {
  const g = svg.match(new RegExp(`<g id="${layer}"[^>]*>([\\s\\S]*?)</g>`))?.[1] ?? "";
  return [...g.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)].map((m) =>
    m.slice(1, 5).map(Number),
  );
};

suite("void polygon", () => {
  it("draws one outline and each piece's two diagonals, inside the ring", () => {
    const svg = compile(plan(`  void id=w polygon ${L}`), { noCache: true }).svg;
    const g = svg.match(/<g id="A-FLOR-OVHD"[^>]*>([\s\S]*?)<\/g>/)![1]!;
    expect(g.match(/<polygon /g)).toHaveLength(1);
    expect(g).toContain('points="1000,1000 4000,1000 4000,2000 2000,2000 2000,4000 1000,4000"');
    // Two pieces (y 1000–2000 the full width, y 2000–4000 the leg), crossed each.
    expect(linesOn(svg, "A-FLOR-OVHD")).toEqual([
      [1000, 1000, 4000, 2000],
      [4000, 1000, 1000, 2000],
      [1000, 2000, 2000, 4000],
      [2000, 2000, 1000, 4000],
    ]);
    expect(svg).not.toContain("A-FLOR-HRAL");
  });

  it("is read by its pieces, never by its box", () => {
    const { plan: ast } = parse(plan(`  void id=w polygon ${L}`), BUILTIN_REGISTRY);
    expect(ast).toBeDefined();
    const d = describe(plan(`  void id=w polygon ${L}`));
    const v = d.voids![0]!;
    expect(v.polygon).toHaveLength(6);
    expect(v.area_m2).toBe(5);
    expect(v.size).toEqual({ w: 3000, h: 3000 });
    expect(v.room).toBe("a");
    expect(v.rail).toBeUndefined();
    const rv: RVoid = {
      kind: "void",
      id: "w",
      at: { x: 0, y: 0 },
      size: { w: 3, h: 3 },
      poly: [],
      parts: [
        { at: { x: 0, y: 0 }, size: { w: 3, h: 1 } },
        { at: { x: 0, y: 1 }, size: { w: 1, h: 2 } },
      ],
    };
    expect(voidPieces(rv).map((p) => [p.id, p.at, p.size, p.poly, p.parts])).toEqual([
      ["w", { x: 0, y: 0 }, { w: 3, h: 1 }, undefined, undefined],
      ["w", { x: 0, y: 1 }, { w: 1, h: 2 }, undefined, undefined],
    ]);
  });

  it("a piece of furniture in the notch of an L stands on floor; one in its leg does not", () => {
    const notch = lint(plan(`  void id=w polygon ${L}\n  furniture armchair at (3000,3000) size 800x800`));
    expect(notch.map((d) => d.code)).not.toContain("W_FURNITURE_ON_VOID");
    const leg = lint(plan(`  void id=w polygon ${L}\n  furniture armchair at (1100,3000) size 800x800`));
    expect(leg.map((d) => d.code)).toContain("W_FURNITURE_ON_VOID");
  });

  it("refuses a slanted, degenerate or crossing ring with E_VOID_POLY", () => {
    expect(errors(plan("  void id=w polygon (1000,1000) (4000,1000) (3000,3000) (1000,3000)"))).toEqual([
      "E_VOID_POLY",
    ]);
    expect(errors(plan("  void id=w polygon (1000,1000) (4000,1000) (4000,3000) (4000,2000)"))).toEqual([
      "E_VOID_POLY",
    ]);
    expect(
      errors(plan("  void id=w polygon (1000,1000) (3000,1000) (3000,3000) (2000,3000) (2000,500) (1000,500)")),
    ).toEqual(["E_VOID_POLY"]);
  });

  it("goes through a place frame as the same void written in place", () => {
    const placed = `plan "P" {\n  units mm\n  room id=r at (0,0) size 8000x8000 uses hall\n  component c() {\n    void id=v polygon (0,0) (3000,0) (3000,1000) (1000,1000) (1000,3000) (0,3000) rail 1 2 3\n  }\n  place c() as w at (4000,4000) mirror x\n}\n`;
    const direct = `plan "P" {\n  units mm\n  room id=r at (0,0) size 8000x8000 uses hall\n  void id=v polygon (4000,4000) (1000,4000) (1000,5000) (3000,5000) (3000,7000) (4000,7000) rail 1 2 3\n}\n`;
    const layer = (s: string, id: string): string => s.match(new RegExp(`<g id="${id}"[\\s\\S]*?</g>`))?.[0] ?? "";
    const a = compile(placed, { noCache: true }).svg;
    const b = compile(direct, { noCache: true }).svg;
    expect(layer(a, "A-FLOR-OVHD")).toBe(layer(b, "A-FLOR-OVHD"));
    expect(layer(a, "A-FLOR-HRAL")).toBe(layer(b, "A-FLOR-HRAL"));
    expect(JSON.stringify(describe(placed).voids).replaceAll('"w.v"', '"v"')).toBe(
      JSON.stringify(describe(direct).voids),
    );
  });

  it("keep stacked refuses it: it has no rectangular footprint", () => {
    const src = `plan "K" {\n  units mm\n  keep stacked w on levels 1 2\n  level 1 {\n    room id=a at (0,0) size 6000x5000 uses hall\n    void id=w polygon ${L}\n  }\n  level 2 {\n    room id=a at (0,0) size 6000x5000 uses hall\n    void id=w polygon ${L}\n  }\n}\n`;
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_KEEP_MEASURE");
    expect(d?.message).toContain("polygon void");
  });
});

suite("void rail", () => {
  it("rails the named sides of a rectangle, inside the outline, on its own CAD layer", () => {
    const svg = compile(plan("  void id=w at (1000,1000) size 3000x1000 rail top left"), { noCache: true }).svg;
    const rails = linesOn(svg, "A-FLOR-HRAL");
    expect(rails.length).toBeGreaterThan(4);
    for (const [x1, y1, x2, y2] of rails) {
      for (const [x, y] of [
        [x1!, y1!],
        [x2!, y2!],
      ])
        expect(x! >= 1000 && x! <= 4000 && y! >= 1000 && y! <= 2000).toBe(true);
    }
    // The top rail's outer line is the edge itself; nothing rails the right or bottom edge.
    expect(rails[0]).toEqual([1000, 1000, 4000, 1000]);
    expect(rails.some(([x1, , x2]) => x1 === 4000 && x2 === 4000)).toBe(false);
    expect(describe(plan("  void id=w at (1000,1000) size 3000x1000 rail left top")).voids![0]!.rail).toEqual([
      "top",
      "left",
    ]);
  });

  it("numbers a ring's edges from point n to n+1, and joins two railed edges round a reflex corner", () => {
    const svg = compile(plan(`  void id=w polygon ${L} rail 2 3`), { noCache: true }).svg;
    const rails = linesOn(svg, "A-FLOR-HRAL");
    // Edge 2 is (4000,2000)→(2000,2000), edge 3 is (2000,2000)→(2000,4000): outer lines on the edges.
    expect(rails).toContainEqual([4000, 2000, 2000, 2000]);
    expect(rails).toContainEqual([2000, 2000, 2000, 4000]);
    // The inner lines meet on the hole's side of the reflex corner, at one depth d from both edges.
    const inner2 = rails[1]!;
    const d = 2000 - inner2[1]!;
    expect(d).toBeGreaterThan(0);
    expect(inner2[3]).toBe(2000 - d);
    expect(inner2[2]).toBe(2000 - d);
    const edge3 = rails.findIndex((r) => r[0] === 2000 && r[1] === 2000 && r[2] === 2000 && r[3] === 4000);
    expect(rails[edge3 + 1]!.slice(0, 2)).toEqual([2000 - d, 2000 - d]);
    expect(describe(plan(`  void id=w polygon ${L} rail 3 2 3`)).voids![0]!.rail).toEqual([2, 3]);
  });

  it("draws nothing for `rail none`, but reports it", () => {
    const svg = compile(plan("  void id=w at (1000,1000) size 3000x1000 rail none"), { noCache: true }).svg;
    expect(svg).not.toContain("A-FLOR-HRAL");
    expect(describe(plan("  void id=w at (1000,1000) size 3000x1000 rail none")).voids![0]!.rail).toEqual([]);
  });

  it("refuses words a void does not have with E_VOID_RAIL, spanning the clause", () => {
    expect(errors(plan(`  void id=w polygon ${L} rail top`))).toEqual(["E_VOID_RAIL"]);
    expect(errors(plan(`  void id=w polygon ${L} rail 6`))).toEqual(["E_VOID_RAIL"]);
    expect(errors(plan(`  void id=w polygon ${L} rail 1.5`))).toEqual(["E_VOID_RAIL"]);
    expect(errors(plan("  void id=w at (1000,1000) size 3000x1000 rail 0"))).toEqual(["E_VOID_RAIL"]);
    const src = plan(`  void id=w polygon ${L} rail 6`);
    const d = compile(src, { noCache: true }).diagnostics.find((x) => x.code === "E_VOID_RAIL")!;
    expect(src.slice(d.span!.start, d.span!.end)).toBe("rail 6");
  });

  it("does not change the walk: a railed void obstructs as an unrailed one does", () => {
    const a = describe(plan(`  void id=w polygon ${L}`));
    const b = describe(plan(`  void id=w polygon ${L} rail all`));
    expect(JSON.stringify(b.circulation)).toBe(JSON.stringify(a.circulation));
  });

  it("formats back to itself", () => {
    for (const body of [
      `  void id=w polygon ${L} rail 0, 2 5`,
      "  void id=w at (1000,1000) size 3000x1000 rail top left",
    ]) {
      const once = format(plan(body));
      expect(format(once)).toBe(once);
      expect(JSON.stringify(describe(once).voids)).toBe(JSON.stringify(describe(plan(body)).voids));
    }
  });
});
