import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compile, getGeometryBackend, loadClipperBackend, setGeometryBackend } from "../src/index.js";
import { rectUnionOutline } from "../src/geometry/union.js";

const pocheFills = (svg: string): number => (svg.match(/fill="url\(#poche\)"/g) ?? []).length;

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

  it("joins ANGLED walls into one fill and one outline, with no engine installed", () => {
    // The retired behaviour, for the record: this drew one poché rectangle PER SEGMENT
    // with untrimmed face lines through the shared corner, unless the optional
    // clipper2-wasm dependency happened to be registered. Since v1.30 the shape of the
    // wall chooses nothing — the joinery pass mitres the corner in closed form.
    const src = `plan "A" { wall exterior thickness 200 { (0,0) (3000,2000) (6000,0) } }`;
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(getGeometryBackend()).toBe(null);
    expect(svg).toContain('fill="url(#poche)"');
    expect((svg.match(/fill="url\(#poche\)"/g) ?? []).length).toBe(1);
    expect((svg.match(/stroke-linejoin="miter"/g) ?? []).length).toBe(1);
  });

  it("is deterministic", () => {
    const src = `plan "J" { wall w thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`;
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });
});

describe("wall materials", () => {
  it("renders a material's distinct hatch pattern and fills with it", () => {
    const { svg, errors } = compile(`plan "M" { wall w thickness 400 material brick { (0,0) (4000,0) } }`, {
      noCache: true,
    });
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
    const { svg, diagnostics } = compile(`plan "M" { wall w thickness 400 material marble { (0,0) (4000,0) } }`, {
      noCache: true,
    });
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
    // Two fills — the two materials tile without overlapping — but ONE outline for the
    // whole set. A boundary between two materials is a boundary of neither wall's air,
    // so the joinery keeps it on exactly one of them and the drawing has one edge there,
    // not the two the per-group union used to stack.
    expect((svg.match(/fill="url\(#hatch-concrete\)"/g) ?? []).length).toBe(1);
    expect((svg.match(/fill="url\(#hatch-tile\)"/g) ?? []).length).toBe(1);
    expect((svg.match(/stroke-linejoin="miter"/g) ?? []).length).toBe(1);
  });
});

describe("hatch as data (T3.5)", () => {
  const brick = (extra: string) =>
    compile(`plan "H" { wall w thickness 400 material brick${extra} { (0,0) (4000,0) } }`, { noCache: true });

  it("bakes scale + angle into a distinct pattern id and patternTransform", () => {
    const { svg } = brick(" scale 2 angle 30");
    expect(svg).toContain('id="hatch-brick-s2-a30"');
    expect(svg).toContain('fill="url(#hatch-brick-s2-a30)"');
    expect(svg).toContain('patternTransform="rotate(30)"');
  });

  it("keeps the bare id for the default (scale 1, angle 0)", () => {
    const { svg } = brick("");
    expect(svg).toContain('id="hatch-brick"');
    expect(svg).not.toContain("hatch-brick-s");
  });

  it("two scales of one material emit two distinct patterns", () => {
    const { svg } = compile(
      `plan "H" {
        wall a thickness 400 material brick scale 1 { (0,0) (4000,0) }
        wall b thickness 400 material brick scale 3 { (0,2000) (4000,2000) }
      }`,
      { noCache: true },
    );
    expect(svg).toContain('id="hatch-brick"');
    expect(svg).toContain('id="hatch-brick-s3-a0"');
  });

  it("scale/angle change output deterministically", () => {
    expect(brick(" scale 1.5 angle 45").svg).toBe(brick(" scale 1.5 angle 45").svg);
  });

  it("warns on a non-positive scale and falls back to 1", () => {
    const { svg, diagnostics } = brick(" scale 0");
    expect(diagnostics.some((d) => d.code === "W_HATCH_SCALE")).toBe(true);
    expect(svg).toContain('id="hatch-brick"'); // fell back to scale 1
  });
});

// Angled (non-axis-aligned) walls. Until v1.30 these took one of two paths — per-segment
// fills with visible seams, or a `clipper2-wasm` polygon boolean when that OPTIONAL
// dependency was registered — so an angled plan's BYTES depended on whether an optional
// native package happened to be installed. There is now one closed-form path and the
// backend is not consulted at all; these tests pin that, in both directions.
const ANGLED = `plan "A" { wall exterior thickness 200 { (0,0) (3000,2000) (6000,0) } }`;
const ORTHO = `plan "O" { wall w thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`;

describe("wall joinery — no geometry engine is consulted", () => {
  it("draws an angled plan as ONE fill and ONE mitred outline with no backend", () => {
    expect(getGeometryBackend()).toBe(null); // sanity: default is no backend
    const { svg, errors } = compile(ANGLED, { noCache: true });
    expect(errors).toEqual([]);
    expect(pocheFills(svg)).toBe(1);
    expect((svg.match(/stroke-linejoin="miter"/g) ?? []).length).toBe(1);
  });

  it("is deterministic without a backend", () => {
    expect(compile(ANGLED, { noCache: true }).svg).toBe(compile(ANGLED, { noCache: true }).svg);
  });
});

describe("wall joinery — a registered clipper2 backend changes NOTHING", () => {
  let orthoNoBackend: string;
  let angledNoBackend: string;
  beforeAll(async () => {
    // Capture both BEFORE the backend exists, then register it. `clipper2-wasm` is a
    // devDependency now: the renderer never calls it, and it survives here as the
    // rectilinear oracle in `test/joinery-oracle.test.ts`.
    orthoNoBackend = compile(ORTHO, { noCache: true }).svg;
    angledNoBackend = compile(ANGLED, { noCache: true }).svg;
    setGeometryBackend(await loadClipperBackend());
  });
  afterAll(() => setGeometryBackend(null));

  it("leaves ANGLED output byte-identical whether or not the engine is loaded", () => {
    // This is the one that used to be false. Before v1.30 registering the engine took an
    // angled plan from two seamy per-segment fills to one unioned region — a different
    // drawing, decided by an optional install.
    expect(getGeometryBackend()).not.toBe(null); // sanity: it really is registered
    expect(compile(ANGLED, { noCache: true }).svg).toBe(angledNoBackend);
  });

  it("leaves ORTHOGONAL output byte-identical whether or not the engine is loaded", () => {
    expect(compile(ORTHO, { noCache: true }).svg).toBe(orthoNoBackend);
  });

  it("renders angled walls deterministically with the engine present", () => {
    expect(compile(ANGLED, { noCache: true }).svg).toBe(compile(ANGLED, { noCache: true }).svg);
  });
});
