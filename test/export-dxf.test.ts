import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { toScene } from "../src/scene-build.js";
import { toDxf } from "../src/export/dxf.js";

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
