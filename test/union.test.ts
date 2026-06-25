import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { rectUnionOutline } from "../src/geometry/union.js";

describe("rectUnionOutline", () => {
  it("traces an L-corner as one 6-vertex loop", () => {
    const loops = rectUnionOutline([
      { x0: 0, y0: 0, x1: 1000, y1: 100 },
      { x0: 0, y0: 0, x1: 100, y1: 1000 },
    ]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it("traces a T-junction as one 8-vertex loop", () => {
    const loops = rectUnionOutline([
      { x0: 0, y0: 450, x1: 1000, y1: 550 },
      { x0: 450, y0: 0, x1: 550, y1: 550 },
    ]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(8);
  });

  it("yields an outer loop plus an inner hole for a closed ring", () => {
    const loops = rectUnionOutline([
      { x0: 0, y0: 0, x1: 1000, y1: 100 },
      { x0: 0, y0: 900, x1: 1000, y1: 1000 },
      { x0: 0, y0: 0, x1: 100, y1: 1000 },
      { x0: 900, y0: 0, x1: 1000, y1: 1000 },
    ]);
    expect(loops).toHaveLength(2);
  });

  it("returns no loops for no input", () => {
    expect(rectUnionOutline([])).toEqual([]);
  });
});

describe("wall rendering — clean joins", () => {
  it("renders orthogonal walls as a single unioned outline path (no per-segment seams)", () => {
    const src = `plan "J" {
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      wall partition thickness 200 { (2000,0) (2000,1500) }
      wall partition thickness 200 { (2000,1500) (4000,1500) }
    }`;
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    // Exactly one poché fill path and one outlined boundary — the union.
    expect((svg.match(/fill="url\(#poche\)"/g) ?? []).length).toBe(1);
    expect((svg.match(/stroke-linejoin="miter"/g) ?? []).length).toBe(1);
  });

  it("falls back to per-segment rendering for angled walls (still renders)", () => {
    const src = `plan "A" { wall exterior thickness 200 { (0,0) (3000,2000) (6000,0) } }`;
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain('fill="url(#poche)"');
    // Per-segment fallback emits one fill polygon per segment (2 here).
    expect((svg.match(/fill="url\(#poche\)"/g) ?? []).length).toBe(2);
  });

  it("is deterministic", () => {
    const src = `plan "J" { wall w thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`;
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

describe("wall materials", () => {
  it("renders a material's distinct hatch pattern and fills with it", () => {
    const { svg, errors } = compile(
      `plan "M" { wall w thickness 400 material brick { (0,0) (4000,0) } }`,
      { noCache: true },
    );
    expect(errors).toEqual([]);
    expect(svg).toContain('id="hatch-brick"');
    expect(svg).toContain('fill="url(#hatch-brick)"');
  });

  it("defaults to the poché hatch when no material is given", () => {
    const { svg } = compile(`plan "M" { wall w thickness 400 { (0,0) (4000,0) } }`, { noCache: true });
    expect(svg).toContain('id="poche"');
    expect(svg).toContain('fill="url(#poche)"');
  });

  it("warns on an unknown material and falls back to the default hatch", () => {
    const { svg, diagnostics } = compile(
      `plan "M" { wall w thickness 400 material marble { (0,0) (4000,0) } }`,
      { noCache: true },
    );
    expect(diagnostics.some((d) => d.code === "W_UNKNOWN_MATERIAL")).toBe(true);
    expect(svg).toContain('fill="url(#poche)"');
    expect(svg).not.toContain("hatch-marble");
  });

  it("groups walls by material — two distinct patterns appear", () => {
    const { svg } = compile(
      `plan "M" {
        wall a thickness 400 material concrete { (0,0) (4000,0) }
        wall b thickness 400 material tile { (0,2000) (4000,2000) }
      }`,
      { noCache: true },
    );
    expect(svg).toContain('id="hatch-concrete"');
    expect(svg).toContain('id="hatch-tile"');
    expect((svg.match(/stroke-linejoin="miter"/g) ?? []).length).toBe(2);
  });
});
