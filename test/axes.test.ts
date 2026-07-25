import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { AXIS_LETTERS, axisLetter, numberAxes } from "../src/axes.js";
import { compile, describe as describePlan, toDxf } from "../src/index.js";
import { renderAscii } from "../src/backends/ascii.js";
import { format } from "../src/format.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RAxis } from "../src/ir.js";
import type { SceneNode } from "../src/scene.js";

/**
 * Positioning axes (定位轴线, GB/T 50001) — the plan-level `axes { … }` datum grid:
 * derived numbering, the dash-dot + bubble render pass, the `dims auto` middle-chain
 * switch, and the `describe()` facts. The load-bearing negative is byte-identity: a
 * plan with no `axes` block must be untouched by all of it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

/** The resolved axis list of a plan (label order), or undefined when it declares none. */
function axesOf(src: string): RAxis[] | undefined {
  const { plan } = parse(src);
  return resolve(plan!).ir.axes;
}

function nodesOf(src: string): SceneNode[] {
  const { scene, errors } = compile(src, { noCache: true });
  expect(errors).toEqual([]);
  return scene!.nodes;
}

const axisNodes = (src: string): SceneNode[] => nodesOf(src).filter((n) => n.layer === "axes");

/** A minimal shell with a room, so bounds/dims have something to measure. */
const shell = (body: string) =>
  `plan "P" {\n  units mm\n  north up\n` +
  `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }\n` +
  `  room id=r at (0,0) size 8000x4000 label "Hall"\n${body}}\n`;

describe("axes — GB/T 50001 numbering (derived, never authored)", () => {
  it("numbers x axes 1,2,3… LEFT-TO-RIGHT and letters y axes A,B,C… BOTTOM-TO-TOP", () => {
    // +y points DOWN, so bottom-to-top is DESCENDING y: the largest y is "A".
    const axes = numberAxes([0, 6000, 12000], [0, 4000, 8000]);
    expect(axes.filter((a) => a.axis === "x")).toEqual([
      { axis: "x", pos: 0, label: "1" },
      { axis: "x", pos: 6000, label: "2" },
      { axis: "x", pos: 12000, label: "3" },
    ]);
    expect(axes.filter((a) => a.axis === "y")).toEqual([
      { axis: "y", pos: 8000, label: "A" },
      { axis: "y", pos: 4000, label: "B" },
      { axis: "y", pos: 0, label: "C" },
    ]);
  });

  it("sorts unordered input and collapses exact duplicates silently", () => {
    const axes = numberAxes([12000, 0, 6000, 0, 12000], [4000, 4000]);
    expect(axes.filter((a) => a.axis === "x").map((a) => [a.pos, a.label])).toEqual([
      [0, "1"],
      [6000, "2"],
      [12000, "3"],
    ]);
    // A duplicate datum is declarative idempotence, not an error — one axis, no diagnostic.
    expect(axes.filter((a) => a.axis === "y")).toEqual([{ axis: "y", pos: 4000, label: "A" }]);
    const src = shell(`  axes { x at 6000, 0, 6000\n  y at 2000 }\n`);
    const { plan } = parse(src);
    const { diagnostics } = resolve(plan!);
    expect(diagnostics).toEqual([]);
    expect(
      axesOf(src)!
        .filter((a) => a.axis === "x")
        .map((a) => a.pos),
    ).toEqual([0, 6000]);
  });

  it("skips I, O and Z (they misread as 1, 0, 2 at drawing scale)", () => {
    expect(AXIS_LETTERS).toBe("ABCDEFGHJKLMNPQRSTUVWXY");
    expect(AXIS_LETTERS).toHaveLength(23);
    for (const bad of ["I", "O", "Z"]) expect(AXIS_LETTERS).not.toContain(bad);
    // H → J (no I), N → P (no O), Y is last (no Z).
    expect([7, 8].map(axisLetter)).toEqual(["H", "J"]);
    expect([12, 13].map(axisLetter)).toEqual(["N", "P"]);
    expect(axisLetter(22)).toBe("Y");
  });

  it("continues AA, AB, … BA past the 23rd letter", () => {
    expect(axisLetter(23)).toBe("AA");
    expect(axisLetter(24)).toBe("AB");
    expect(axisLetter(45)).toBe("AY");
    expect(axisLetter(46)).toBe("BA");
    // Never repeats a label, however many axes there are.
    const labels = Array.from({ length: 600 }, (_, i) => axisLetter(i));
    expect(new Set(labels).size).toBe(600);
  });

  it("is deterministic — same positions, same labels, byte-for-byte", () => {
    const a = numberAxes([3000, 0, 9000], [0, 6000]);
    const b = numberAxes([9000, 3000, 0], [6000, 0]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const src = shell(`  axes { x at 0, 4000\n  y at 0 }\n`);
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

describe("axes — parsing", () => {
  it("evaluates positions as expressions (let bindings, arithmetic)", () => {
    const src = shell(`  let W = 3000\n  axes { x at 0, W, 2 * W\n  y at 0, W }\n`);
    expect(
      axesOf(src)!
        .filter((a) => a.axis === "x")
        .map((a) => a.pos),
    ).toEqual([0, 3000, 6000]);
    expect(
      axesOf(src)!
        .filter((a) => a.axis === "y")
        .map((a) => [a.pos, a.label]),
    ).toEqual([
      [3000, "A"],
      [0, "B"],
    ]);
  });

  it("sees plan-level lets wherever the block sits (it is a setting, not a body statement)", () => {
    const before = shell(`  let W = 3000\n  axes { x at W }\n`);
    const after = shell(`  axes { x at W }\n  let W = 3000\n`);
    expect(axesOf(after)).toEqual(axesOf(before));
  });

  it("accepts rows in either order, repeated, and merges repeated blocks", () => {
    const src = shell(`  axes { y at 0\n  x at 0\n  y at 4000 }\n  axes { x at 8000 }\n`);
    expect(axesOf(src)!.map((a) => [a.axis, a.pos, a.label])).toEqual([
      ["x", 0, "1"],
      ["x", 8000, "2"],
      ["y", 4000, "A"],
      ["y", 0, "B"],
    ]);
  });

  it("grid-snaps positions like every other coordinate", () => {
    const src = `plan "P" {\n  units mm\n  grid 100\n  axes { x at 6040 }\n  room at (0,0) size 8000x4000\n}\n`;
    expect(axesOf(src)!.map((a) => a.pos)).toEqual([6000]);
  });

  it("resolves an empty block to no axes at all (absent, not an empty list)", () => {
    expect(axesOf(shell(`  axes { }\n`))).toBeUndefined();
    expect(axisNodes(shell(`  axes { }\n`))).toEqual([]);
  });

  it("reports a bad direction as a returned diagnostic, never a throw", () => {
    const { diagnostics, plan } = parse(shell(`  axes { z at 0 }\n`));
    expect(plan).toBeDefined();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.message).toContain('Expected an axis direction ("x" or "y")');
    // And the whole pipeline still returns rather than throwing.
    expect(() => compile(shell(`  axes { z at 0 }\n`), { noCache: true })).not.toThrow();
  });

  it("round-trips through the formatter, keeping the authored expressions", () => {
    const src = shell(`  let W = 3000\n  axes { x at 0, W, 2 * W\n  y at 0 }\n`);
    const once = format(src);
    expect(once).toContain("axes {");
    expect(once).toContain("x at 0, W, 2 * W");
    expect(once).toContain("y at 0");
    expect(format(once)).toBe(once); // idempotent
    expect(axesOf(once)).toEqual(axesOf(src));
  });
});

describe("axes — render pass", () => {
  const src = shell(`  axes { x at 0, 4000, 8000\n  y at 0, 4000 }\n`);

  it("emits a dash-dot line, a bubble circle and a derived label per axis, on the A-GRID layer", () => {
    const nodes = axisNodes(src);
    expect(nodes).toHaveLength(15); // 5 axes × (line + circle + text)
    expect(new Set(nodes.map((n) => n.layerName ?? "A-GRID"))).toEqual(new Set(["A-GRID"]));
    const lines = nodes.filter((n) => n.prim.t === "line");
    expect(lines).toHaveLength(5);
    for (const l of lines) {
      expect(l.lineType).toBe("center"); // dash-dot
      expect(l.lineWeight).toBe("thin");
    }
    expect(nodes.filter((n) => n.prim.t === "circle")).toHaveLength(5);
    const labels = nodes.flatMap((n) => (n.prim.t === "text" ? [n.prim.value] : []));
    expect(labels).toEqual(["1", "2", "3", "A", "B"]);
  });

  it("draws the label as a plain glyph in a drawn circle — no Unicode ①/Ⓐ codepoint", () => {
    const svg = compile(src, { noCache: true }).svg;
    expect(svg).toMatch(/<circle cx="[-\d.]+" cy="[-\d.]+" r="[\d.]+"/);
    expect(svg).not.toMatch(/[①-⑳Ⓐ-Ⓩ]/); // enclosed alphanumerics
    expect(svg).toContain(">1<");
    expect(svg).toContain(">A<");
  });

  it("tags x axes at the BOTTOM and y axes at the LEFT, outside the plan", () => {
    const nodes = axisNodes(src);
    const { scene } = compile(src, { noCache: true });
    const b = scene!.bounds;
    const circles = nodes.flatMap((n) => (n.prim.t === "circle" ? [n.prim] : []));
    const [x1, x2, x3, yA, yB] = circles;
    // x bubbles: below the plan, centred on their own datum, all on one baseline.
    for (const c of [x1!, x2!, x3!]) expect(c.center.y).toBeGreaterThan(b.maxY);
    expect([x1!.center.x, x2!.center.x, x3!.center.x]).toEqual([0, 4000, 8000]);
    expect(new Set([x1!.center.y, x2!.center.y, x3!.center.y]).size).toBe(1);
    // y bubbles: left of the plan; "A" is the BOTTOM one (largest y).
    for (const c of [yA!, yB!]) expect(c.center.x).toBeLessThan(b.minX);
    expect([yA!.center.y, yB!.center.y]).toEqual([4000, 0]);
    expect(new Set([yA!.center.x, yB!.center.x]).size).toBe(1);
  });

  it("scales the bubble with the size system (diameter = 1.8 × dimFont)", () => {
    const { scene } = compile(src, { noCache: true });
    const circle = scene!.nodes.find((n) => n.layer === "axes" && n.prim.t === "circle")!;
    const r = (circle.prim as { t: "circle"; r: number }).r;
    expect(r).toBeCloseTo((scene!.sizes.dimFont * 1.8) / 2, 9);
  });

  it("grows the page so no bubble clips, and puts them outside the dimension chains", () => {
    const withDims = shell(`  dims auto all\n  axes { x at 0, 4000, 8000\n  y at 0, 4000 }\n`);
    const { scene } = compile(withDims, { noCache: true });
    const b = scene!.bounds;
    const m = scene!.chrome!.margin;
    const circles = scene!.nodes.flatMap((n) => (n.layer === "axes" && n.prim.t === "circle" ? [n.prim] : []));
    for (const c of circles) {
      expect(c.center.y + c.r).toBeLessThanOrEqual(b.maxY + m.bottom);
      expect(c.center.x - c.r).toBeGreaterThanOrEqual(b.minX - m.left);
    }
    // Outside every dimension node on that side (GB/T tags the axes beyond the dims).
    const dimYs = scene!.nodes.flatMap((n) =>
      n.layer === "dims" && n.prim.t === "line" ? [n.prim.a.y, n.prim.b.y] : [],
    );
    const bubbleY = circles[0]!.center.y;
    expect(bubbleY).toBeGreaterThan(Math.max(...dimYs));
  });

  it("puts axis nodes on A-GRID in the DXF, with a declared layer", () => {
    const dxf = toDxf(compile(src, { noCache: true }).scene!);
    expect(dxf).toContain("A-GRID");
    expect(dxf).toContain("CIRCLE"); // a native entity, not two half-arcs
    // The layer is declared in the LAYER table, so CAD does not have to invent it.
    expect(dxf.slice(0, dxf.indexOf("ENTITIES"))).toContain("A-GRID");
  });

  it("leaves the ASCII backend untouched — the axes pass is not read", () => {
    const plain = shell("");
    const withAxes = shell(`  axes { x at 0, 4000, 8000\n  y at 0, 4000 }\n`);
    expect(renderAscii(compile(withAxes, { noCache: true }).scene!)).toBe(
      renderAscii(compile(plain, { noCache: true }).scene!),
    );
  });
});

describe("axes — the `dims auto` middle chain becomes the axis chain", () => {
  /** Along-axis tick coordinates of the chain at `slot`, on the bottom facade. */
  function bottomChain(src: string, slot: number): number[] {
    const { scene } = compile(src, { noCache: true });
    const b = scene!.bounds;
    const lines = scene!.nodes.flatMap((n) =>
      n.layer === "dims" && n.prim.t === "line" && n.prim.a.y === n.prim.b.y && n.prim.a.y > b.maxY
        ? [{ y: n.prim.a.y, xs: [n.prim.a.x, n.prim.b.x] }]
        : [],
    );
    const bands = [...new Set(lines.map((l) => l.y))].sort((p, q) => p - q);
    const band = bands[slot];
    return [...new Set(lines.filter((l) => l.y === band).flatMap((l) => l.xs))].sort((p, q) => p - q);
  }

  const rooms = `  room id=a at (0,0) size 3000x4000 label "A"\n  room id=b at (3000,0) size 5000x4000 label "B"\n`;
  const withRooms = (body: string) =>
    `plan "P" {\n  units mm\n  north up\n  dims auto rooms\n` +
    `  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }\n` +
    rooms +
    body +
    `}\n`;

  it("without axes, the middle chain still measures room boundaries (pinned)", () => {
    expect(bottomChain(withRooms(""), 0)).toEqual([0, 3000, 8000]);
  });

  it("with x axes declared, the bottom chain's ticks ARE the axis positions", () => {
    const src = withRooms(`  axes { x at 0, 2000, 6000, 8000 }\n`);
    expect(bottomChain(src, 0)).toEqual([0, 2000, 6000, 8000]);
  });

  it("the switch is per-direction: y-only axes leave the horizontal chain alone", () => {
    const src = withRooms(`  axes { y at 0, 4000 }\n`);
    expect(bottomChain(src, 0)).toEqual([0, 3000, 8000]);
  });

  it("keeps the chain OUTSIDE at the same offset — only the ticks move", () => {
    const plain = compile(withRooms(""), { noCache: true }).scene!;
    const axed = compile(withRooms(`  axes { x at 0, 2000, 8000 }\n`), { noCache: true }).scene!;
    const bandOf = (s: typeof plain) =>
      Math.min(
        ...s.nodes.flatMap((n) =>
          n.layer === "dims" && n.prim.t === "line" && n.prim.a.y === n.prim.b.y && n.prim.a.y > s.bounds.maxY
            ? [n.prim.a.y]
            : [],
        ),
      );
    expect(bandOf(axed)).toBe(bandOf(plain));
  });

  it("drives the flagship-style fixture end to end (4000 · 4000 read off the axes)", () => {
    const svg = compile(fixture("axes-grid.arch"), { noCache: true }).svg;
    expect(svg).toContain(">4000<");
    expect(svg).toContain(">8200<"); // outer-face overall chain, unchanged by axes
  });
});

describe("axes — describe() facts", () => {
  it("reports x/y in label order, with derived labels", () => {
    const s = describePlan(fixture("axes-grid.arch"));
    expect(s.ok).toBe(true);
    expect(s.axes).toEqual({
      x: [
        { pos: 0, label: "1" },
        { pos: 4000, label: "2" },
        { pos: 8000, label: "3" },
      ],
      y: [
        { pos: 3000, label: "A" },
        { pos: 0, label: "B" },
      ],
    });
  });

  it("omits the key entirely when the plan declares no axes", () => {
    const s = describePlan(example("studio.arch"));
    expect(s.axes).toBeUndefined();
    expect("axes" in s).toBe(false);
  });

  it("is a whole-plan fact — a --room narrowed read keeps it", () => {
    const cli = join(__dirname, "..", "src", "cli.ts");
    const out = execFileSync(process.execPath, [
      join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs"),
      cli,
      "describe",
      join(__dirname, "fixtures", "axes-grid.arch"),
      "--json",
      "--room",
      "left",
    ]);
    const j = JSON.parse(out.toString());
    expect(j.rooms.map((r: { id: string }) => r.id)).toEqual(["left"]);
    expect(j.axes.x).toHaveLength(3);
  }, 60000);
});

describe("axes — byte-identity for plans that declare none", () => {
  const EXAMPLES = [
    "studio.arch",
    "two-bed.arch",
    "parametric.arch",
    "themed.arch",
    "relational.arch",
    "attached.arch",
    "accessible.arch",
  ];

  it("emits no node on the axes pass for any shipped example", () => {
    for (const name of EXAMPLES) {
      const { scene, errors } = compile(example(name), { noCache: true });
      expect(errors, name).toEqual([]);
      expect(
        scene!.nodes.filter((n) => n.layer === "axes"),
        name,
      ).toEqual([]);
    }
  });

  it("adding an axes block is the ONLY thing that changes the drawing", () => {
    const plain = shell("");
    // Same plan, an empty axes block: no axes resolve → identical bytes.
    expect(compile(shell(`  axes { }\n`), { noCache: true }).svg).toBe(compile(plain, { noCache: true }).svg);
    // A real block adds nodes and grows the page, and nothing else regresses.
    const axed = compile(shell(`  axes { x at 0 }\n`), { noCache: true });
    expect(axed.errors).toEqual([]);
    expect(axed.svg).not.toBe(compile(plain, { noCache: true }).svg);
  });
});
