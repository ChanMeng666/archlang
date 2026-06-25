import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, makeVirtualWorld } from "../src/index.js";
import type { World } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "..", "examples");

const FURNITURE_LIB = `plan "furniture" {
  units mm
  grid 50
  component bed(x, y) { furniture bed at (x, y) size 1500x2000 label "Bed" }
  component sofa(x, y) { furniture sofa at (x, y) size 2000x900 label "Sofa" }
}`;

const PLAN = `plan "P" {
  units mm
  grid 50
  import "furniture.arch": bed, sofa
  room at (0,0) size 4000x3000 label "R"
  bed(500, 500)
  sofa(500, 2000)
}`;

describe("T4.3 — import in a virtual-FS (browser-like) World", () => {
  it("brings in the named components and renders them", () => {
    const world = makeVirtualWorld({ "furniture.arch": FURNITURE_LIB });
    const { svg, errors } = compile(PLAN, { world, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("Bed");
    expect(svg).toContain("Sofa");
  });

  it("supports `as` aliasing", () => {
    const world = makeVirtualWorld({ "furniture.arch": FURNITURE_LIB });
    const src = `plan "P" { units mm grid 50 import "furniture.arch": bed as cot  cot(500,500) }`;
    const { svg, errors } = compile(src, { world, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("Bed");
  });

  it("supports `*` (import all components)", () => {
    const world = makeVirtualWorld({ "furniture.arch": FURNITURE_LIB });
    const src = `plan "P" { units mm grid 50 import "furniture.arch": *  bed(0,0) sofa(0,2000) }`;
    const { errors } = compile(src, { world, noCache: true });
    expect(errors).toEqual([]);
  });
});

describe("T4.3 — import in a Node (real-fs) World", () => {
  it("imports from examples/lib/*.arch read off disk", () => {
    const world: World = {
      read: (p) => {
        try {
          return readFileSync(resolvePath(examplesDir, p), "utf8");
        } catch {
          return null;
        }
      },
    };
    const src = `plan "P" {
      units mm
      grid 50
      import "lib/furniture.arch": bed, sofa
      import "lib/doors.arch": single
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      bed(300, 300)
      sofa(300, 2000)
      single(2000, 3000, 900)
    }`;
    const { svg, errors } = compile(src, { world, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("Bed");
  });
});

describe("T4.3 — diagnostics", () => {
  it("a cyclic import yields E_IMPORT_CYCLE (no hang/throw)", () => {
    const world = makeVirtualWorld({
      "a.arch": `plan "a" { units mm grid 50 import "b.arch": fromB  component fromA(x,y){ furniture bed at (x,y) size 100x100 } }`,
      "b.arch": `plan "b" { units mm grid 50 import "a.arch": fromA  component fromB(x,y){ furniture bed at (x,y) size 100x100 } }`,
    });
    const src = `plan "P" { units mm grid 50 import "a.arch": fromA  fromA(0,0) }`;
    const { diagnostics } = compile(src, { world, noCache: true });
    expect(diagnostics.some((d) => d.code === "E_IMPORT_CYCLE")).toBe(true);
  });

  it("a missing module yields E_IMPORT_NOT_FOUND", () => {
    const world = makeVirtualWorld({});
    const src = `plan "P" { units mm grid 50 import "nope.arch": x  x(0,0) }`;
    const { diagnostics } = compile(src, { world, noCache: true });
    expect(diagnostics.some((d) => d.code === "E_IMPORT_NOT_FOUND")).toBe(true);
  });

  it("an unexported name yields E_IMPORT_NOT_EXPORTED", () => {
    const world = makeVirtualWorld({ "furniture.arch": FURNITURE_LIB });
    const src = `plan "P" { units mm grid 50 import "furniture.arch": missing  room at (0,0) size 4000x3000 }`;
    const { diagnostics } = compile(src, { world, noCache: true });
    expect(diagnostics.some((d) => d.code === "E_IMPORT_NOT_EXPORTED")).toBe(true);
  });

  it("resolves a namespaced @local/...:1.0.0 spec", () => {
    const world = makeVirtualWorld({
      "@local/office-kit/1.0.0/index.arch": `plan "kit" { units mm grid 50 component chair(x,y){ furniture chair at (x,y) size 500x500 label "Chair" } }`,
    });
    const src = `plan "P" { units mm grid 50 import "@local/office-kit:1.0.0": chair  chair(0,0) }`;
    const { svg, errors } = compile(src, { world, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain("Chair");
  });

  it("an unknown namespace yields a bad-spec diagnostic", () => {
    const world = makeVirtualWorld({});
    const src = `plan "P" { units mm grid 50 import "@remote/x:1.0.0": y  y(0,0) }`;
    const { diagnostics } = compile(src, { world, noCache: true });
    expect(diagnostics.some((d) => d.code === "E_IMPORT_BAD_SPEC")).toBe(true);
  });
});
