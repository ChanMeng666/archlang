import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { toDxf } from "../src/export/dxf.js";
import { compile } from "../src/index.js";
import { RENDER_PASSES, aiaLayer, layerOf } from "../src/scene.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studio = readFileSync(join(__dirname, "..", "examples", "studio.arch"), "utf8");
const dxfSource = readFileSync(join(__dirname, "..", "src", "export", "dxf.ts"), "utf8");

function dxfOf(src: string): string {
  const { plan } = parse(src);
  return toDxf(toScene(resolve(plan!).ir));
}

describe("DXF export", () => {
  it("emits a well-formed ASCII DXF document", () => {
    const dxf = dxfOf(studio);
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    expect(dxf).toContain("HEADER");
    expect(dxf).toContain("$ACADVER");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("ENDSEC");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("renders walls/rooms as LINEs, doors as ARCs, and labels as TEXT", () => {
    const dxf = dxfOf(studio);
    expect(dxf).toContain("\nLINE\n");
    expect(dxf).toContain("\nARC\n"); // door swing arcs
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("Bedroom"); // room label text
    expect(dxf).toContain("A-WALL"); // AIA wall layer
    expect(dxf).toContain("A-FLOR"); // AIA floor (room) layer
  });

  it("is deterministic (pure, byte-identical across calls)", () => {
    expect(dxfOf(studio)).toBe(dxfOf(studio));
  });

  it("flips Y so the plan is right-side-up in CAD (negated coordinates present)", () => {
    // studio has geometry at positive y; flipped DXF must contain negative y values.
    const dxf = dxfOf(studio);
    expect(/\n20\n-\d/.test(dxf)).toBe(true);
  });

  it("emits one door ARC per door", () => {
    const src = [
      'plan "D" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) }",
      "  door id=d at (2000,0) width 900 wall exterior hinge left swing in",
      "}",
    ].join("\n");
    const dxf = dxfOf(src);
    expect((dxf.match(/\nARC\n/g) ?? []).length).toBe(1);
  });

  it("does not throw on an empty plan", () => {
    expect(() => dxfOf('plan "Empty" { }')).not.toThrow();
  });

  it("emits a real HATCH entity for wall poché (pattern name, scale, angle, boundary)", () => {
    const dxf = dxfOf(`plan "H" { wall w thickness 400 material brick scale 2 angle 30 { (0,0) (4000,0) } }`);
    // Version must support HATCH (post-R12).
    expect(dxf).toContain("AC1015");
    expect(dxf).toContain("\nHATCH\n");
    expect(dxf).toContain("AcDbHatch");
    expect(dxf).toContain("\nANSI32\n"); // predefined pattern name (group 2)
    // Pattern scale (41) and angle (52) round-trip the DSL values.
    expect(/\n41\n2\b/.test(dxf)).toBe(true);
    expect(/\n52\n30\b/.test(dxf)).toBe(true);
    // A polyline boundary path (92=2) with vertices (93).
    expect(/\n92\n2\n/.test(dxf)).toBe(true);
    expect(/\n93\n\d/.test(dxf)).toBe(true);
  });

  it("emits one HATCH per wall hatch group", () => {
    const dxf = dxfOf(`plan "H" {
      wall a thickness 400 material brick { (0,0) (4000,0) }
      wall b thickness 400 material concrete { (0,2000) (4000,2000) }
    }`);
    expect((dxf.match(/\nHATCH\n/g) ?? []).length).toBe(2);
  });

  it("re-derives no element geometry (door swing math lives only in the element)", () => {
    // The backend is a pure Scene serializer: it must not recompute door swing,
    // hinges, leaves, panes, or arc trig — those come from the element primitives.
    for (const forbidden of [/\bhinge\b/, /\bswing\b/, /\bleaf/i, /jamb/i, /atan2/, /Math\.PI/]) {
      expect(dxfSource).not.toMatch(forbidden);
    }
    expect(dxfSource).not.toContain("emitDoor");
    expect(dxfSource).not.toContain("emitWindow");
    expect(dxfSource).not.toContain("emitDim");
  });

  it("a door's swing arc shares the element code path (same arc as SVG)", () => {
    const src = [
      'plan "D" {',
      "  wall exterior thickness 200 { (0,0) (4000,0) }",
      "  door id=d at (2000,0) width 900 wall exterior hinge left swing in",
      "}",
    ].join("\n");
    const { plan } = parse(src);
    const scene = toScene(resolve(plan!).ir);
    const arcs = scene.nodes.filter((n) => n.prim.t === "arc");
    expect(arcs).toHaveLength(1); // one arc primitive, consumed identically by SVG + DXF
  });
});

/*
 * AIA CAD layer naming — the mapping a CAD consumer keys its imports to.
 *
 * Two sources of truth, and these tests hold them closed against each other rather
 * than restating either: `aiaLayer()`/`RENDER_PASSES` (`src/scene.ts`) decide which
 * layer a pass lands on, and the DXF LAYER table (`AIA_LAYERS`, `src/export/dxf.ts`)
 * decides which layers exist. Nothing below retypes the table — the declared set is
 * read back out of real output, and the pass→name map is a reviewed snapshot
 * *generated* from `aiaLayer` (see the note on that test before you `-u` it).
 */

/** DXF is a strict alternating group-code / value line stream — read it as pairs. */
function dxfPairs(dxf: string): [number, string][] {
  const lines = dxf.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([Number(lines[i]), lines[i + 1]!]);
  return out;
}

/** Layer names the TABLES→LAYER table declares, in table order. */
function declaredLayers(dxf: string): string[] {
  const p = dxfPairs(dxf);
  const out: string[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    // A layer record is `0 LAYER` / `2 <name>`. The table header is `0 TABLE` / `2 LAYER`,
    // so it never matches; nor does the LTYPE table's `0 LTYPE` / `2 <name>`.
    if (p[i]![0] === 0 && p[i]![1] === "LAYER" && p[i + 1]![0] === 2) out.push(p[i + 1]![1]);
  }
  return out;
}

/** Layer names entities actually reference (group code 8, inside ENTITIES). */
function entityLayers(dxf: string): Set<string> {
  const p = dxfPairs(dxf);
  const start = p.findIndex(([c, v]) => c === 2 && v === "ENTITIES");
  const out = new Set<string>();
  for (let i = start; i < p.length; i++) if (p[i]![0] === 8) out.add(p[i]![1]);
  return out;
}

/**
 * One plan that puts a node on **every** `RenderPass` and exercises every per-node
 * `layerName` override (`column` → A-COLS, `stair`/`elevator` → the A-FLOR-* shafts).
 * The first test below is its own guard: if a grammar change makes this stop covering
 * a pass, the layer assertions fail loudly instead of silently narrowing.
 */
const allPasses = `plan "Layers" {
  paper A3
  axes { x at 0, 4000, 8000 y at 0, 6000 }
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall part thickness 100 { (4000,0) (4000,6000) }
  room id=r1 at (0,0) size 4000x6000 label "Hall"
  room id=r2 at (4000,0) size 4000x6000 label "Office"
  door at (2000,0) width 900 wall exterior
  opening at (4000,3000) width 800 wall part
  window at (6000,0) width 1200 wall exterior
  column at (500,500) size 300x300
  furniture desk at (1000,1000) size 600x600 label "Desk"
  stair id=s at (6500,4000) size 1200x2400 dir up
  elevator id=e at (500,4000) size 1600x1600
  dims auto
  schedule rooms
  legend
}`;

describe("AIA CAD layers", () => {
  const scene = compile(allPasses, { noCache: true }).scene!;
  const dxf = toDxf(scene);

  it("the fixture compiles clean and covers every RenderPass", () => {
    expect(compile(allPasses, { noCache: true }).errors).toEqual([]);
    const covered = new Set(scene.nodes.map((n) => n.layer));
    expect(RENDER_PASSES.filter((p) => !covered.has(p))).toEqual([]);
  });

  it("pins the RenderPass → AIA layer map (generated from aiaLayer; re-bless, never -u)", () => {
    // Derived from the source of truth, not retyped: a rename on either side shows up
    // here as a reviewable diff. Update it only when the mapping change is the intent.
    expect(Object.fromEntries(RENDER_PASSES.map((p) => [p, aiaLayer(p)]))).toMatchInlineSnapshot(`
      {
        "annotations": "A-ANNO",
        "axes": "A-GRID",
        "dims": "A-ANNO-DIMS",
        "doors": "A-DOOR",
        "floor": "A-FLOR",
        "furniture": "A-FURN",
        "labels": "A-ANNO-TEXT",
        "openings": "A-DOOR",
        "wallFace": "A-WALL",
        "wallFill": "A-WALL",
        "windows": "A-GLAZ",
      }
    `);
  });

  it("declares every pass's AIA layer in the LAYER table", () => {
    const declared = declaredLayers(dxf);
    for (const pass of RENDER_PASSES) expect(declared).toContain(aiaLayer(pass));
  });

  it("declares every layer an entity actually references", () => {
    // The gap this closed: `stair`/`elevator` draw on the A-FLOR-* shaft sublayers via
    // `layerName`, and the LAYER table used to declare only the pass defaults.
    const declared = new Set(declaredLayers(dxf));
    expect([...entityLayers(dxf)].filter((l) => !declared.has(l))).toEqual([]);
  });

  it("declares no dead layer — every name is one a node can land on", () => {
    const reachable = new Set<string>([...RENDER_PASSES.map(aiaLayer), ...scene.nodes.map(layerOf)]);
    expect(declaredLayers(dxf).filter((l) => !reachable.has(l))).toEqual([]);
  });

  it("names every layer in the AIA form: A- + a 4-char major group [+ a 4-char minor]", () => {
    const names = [...new Set([...declaredLayers(dxf), ...RENDER_PASSES.map(aiaLayer)])];
    expect(names.filter((n) => !/^A-[A-Z]{4}(-[A-Z]{4})?$/.test(n))).toEqual([]);
  });

  it("declares each layer exactly once", () => {
    const declared = declaredLayers(dxf);
    expect(declared).toEqual([...new Set(declared)]);
  });
});
