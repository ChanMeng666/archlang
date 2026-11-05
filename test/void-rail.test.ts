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
import { compareScenes, D4_ELEMENTS, frameFor, sceneOf } from "./d4-oracle.js";

const L = "(1000,1000) (4000,1000) (4000,2000) (2000,2000) (2000,4000) (1000,4000)";
const plan = (body: string): string =>
  `plan "V" {\n  units mm\n  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }\n  room id=a at (0,0) size 6000x5000 label "Landing" uses hall\n  door id=d on s at 3000 width 900\n${body}\n}\n`;

const errors = (src: string): string[] =>
  compile(src, { noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code ?? "");

/** The body of one SVG layer group, up to its first `</g>`, by plain string search (no regex over
 *  the SVG: a backtracking pattern there is a CodeQL polynomial-ReDoS finding). */
const layerBody = (svg: string, layer: string): string => {
  const open = svg.indexOf(`<g id="${layer}"`);
  if (open < 0) return "";
  const start = svg.indexOf(">", open) + 1;
  const end = svg.indexOf("</g>", start);
  return end < 0 ? "" : svg.slice(start, end);
};

/** The `<line>`s of one SVG layer group, each as its four numbers. */
const linesOn = (svg: string, layer: string): number[][] => {
  const g = layerBody(svg, layer);
  return [...g.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)].map((m) =>
    m.slice(1, 5).map(Number),
  );
};

suite("void polygon", () => {
  it("draws one outline and each piece's two diagonals, inside the ring", () => {
    const svg = compile(plan(`  void id=w polygon ${L}`), { noCache: true }).svg;
    const g = layerBody(svg, "A-FLOR-OVHD");
    expect(g).not.toBe("");
    expect(g.match(/<polygon /g)).toHaveLength(1);
    expect(g).toContain('points="1000,1000 4000,1000 4000,2000 2000,2000 2000,4000 1000,4000"');
    // The three cells of the grid its corners make (the corner square and each arm), crossed each.
    expect(linesOn(svg, "A-FLOR-OVHD")).toEqual([
      [1000, 1000, 2000, 2000],
      [2000, 1000, 1000, 2000],
      [2000, 1000, 4000, 2000],
      [4000, 1000, 2000, 2000],
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
    const layer = (s: string, id: string): string => {
      const open = s.indexOf(`<g id="${id}"`);
      const end = open < 0 ? -1 : s.indexOf("</g>", open);
      return end < 0 ? "" : s.slice(open, end + "</g>".length);
    };
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
    // (A post tick at the top rail's end stands on x = 4000 too, so the test is a line ALONG an edge.)
    const along = (r: number[], x: number): boolean => r[0] === x && r[2] === x && Math.abs(r[3]! - r[1]!) > 500;
    expect(rails.some((r) => along(r, 1000))).toBe(true);
    expect(rails.some((r) => along(r, 4000))).toBe(false);
    expect(rails.some((r) => r[1] === 2000 && r[3] === 2000 && Math.abs(r[2]! - r[0]!) > 500)).toBe(false);
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
    const negative = compile(plan(`  void id=w polygon ${L} rail -1`), { noCache: true }).diagnostics;
    expect(negative.some((d) => d.severity === "error" && d.message.includes("counts from 0"))).toBe(true);
    // A `none` among the words wins, then an `all`, as on a balcony.
    expect(describe(plan(`  void id=w polygon ${L} rail 2 none all`)).voids![0]!.rail).toEqual([]);
    expect(describe(plan(`  void id=w polygon ${L} rail 2 all`)).voids![0]!.rail).toEqual([0, 1, 2, 3, 4, 5]);
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

/**
 * The same `polygon` void placed under all eight elements of D4: the same room, the same railing
 * depth, and a drawing that is the frame's image of the unturned one (the oracle's own primitive
 * comparison, `test/d4-oracle.ts`). The two rings are the red team's: an L whose largest page-axis
 * slab lies in another room than most of its area, and a stepped ring whose page-axis slabs are
 * thin one way only.
 */
suite("void polygon under the frame", () => {
  const RINGS: Record<string, string> = {
    "L over two rooms": [
      "    room id=a at (0,0) size 2000x8000 uses hall",
      "    room id=b at (2000,0) size 6000x8000 uses living",
      "    void id=v polygon (500,500) (6500,500) (6500,1500) (1500,1500) (1500,6500) (500,6500) rail 1 2 3",
    ].join("\n"),
    "stepped ring": [
      "    room id=a at (0,0) size 8000x5000 uses hall",
      "    void id=v polygon (1000,1000) (3000,1000) (3000,1200) (5000,1200) (5000,1400) (7000,1400) (7000,4000) (1000,4000) rail all",
    ].join("\n"),
  };
  // One fixed sheet, so every render size is a constant on both sides.
  const placed = (body: string, rotate: number, mirror?: string): string =>
    [
      'plan "F" {',
      "  units mm",
      "  paper A1",
      "  scale 1:100",
      "  component c() {",
      body,
      "  }",
      `  place c() as w at (0,0)${rotate ? ` rotate ${rotate}` : ""}${mirror ? ` mirror ${mirror}` : ""}`,
      "}",
      "",
    ].join("\n");
  /** The railing depth: the shortest line it draws (a post tick). */
  const depthOf = (svg: string): number =>
    Math.min(...linesOn(svg, "A-FLOR-HRAL").map(([x1, y1, x2, y2]) => Math.hypot(x2! - x1!, y2! - y1!)));
  const voidViolations = (e: string, src: string, g: (typeof D4_ELEMENTS)[number]) =>
    compareScenes(sceneOf(e), sceneOf(src), frameFor(g, 0)).filter((v) => v.key.includes("w.v"));

  for (const [name, body] of Object.entries(RINGS)) {
    it.each(D4_ELEMENTS.map((g) => [g.name, g] as const))(`${name}: %s`, (_, g) => {
      const e = placed(body, 0);
      const src = placed(body, g.rotate, g.mirror);
      expect(describe(src).voids![0]!.room).toBe(describe(e).voids![0]!.room);
      expect(depthOf(compile(src, { noCache: true }).svg)).toBe(depthOf(compile(e, { noCache: true }).svg));
      expect(voidViolations(e, src, g)).toEqual([]);
    });
  }

  it("the answers it holds are the right ones, and the comparison can fail", () => {
    // Most of the L (6.5 of 11 m²) stands in `a`, though its largest page-axis slab lies in `b`.
    expect(describe(placed(RINGS["L over two rooms"]!, 0)).voids![0]!.room).toBe("w.a");
    // A quarter of the 200 mm steps, the narrowest cell, whichever way the ring is turned.
    expect(depthOf(compile(placed(RINGS["stepped ring"]!, 90), { noCache: true }).svg)).toBe(50);
    // r270 observed against r90's prediction is caught.
    const e = placed(RINGS["L over two rooms"]!, 0);
    const r90 = D4_ELEMENTS.find((g) => g.name === "r90")!;
    expect(voidViolations(e, placed(RINGS["L over two rooms"]!, 270), r90).length).toBeGreaterThan(0);
  });
});
