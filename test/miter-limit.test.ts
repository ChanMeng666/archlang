import { describe, expect, it } from "vitest";
import { compile, getGeometryBackend, loadClipperBackend, setGeometryBackend } from "../src/index.js";
import { MITER_LIMIT } from "../src/scene.js";

/**
 * The wall outline's mitre cap — now enforced TWICE, in two different places, and the
 * pair is the point.
 *
 * A mitred join's point grows as `1 / sin(θ/2)`. At the 90° corners of a rectilinear plan
 * it is 1.41 × the line weight — invisible. Where two walls meet at an ACUTE angle it runs
 * away: 12 × at 10°, 23 × at 5°, a black needle shot out of the building.
 *
 * 1. **On the PAINT** (`Paint.miterLimit`), because the backends' own defaults disagree —
 *    SVG's is 4, PDF's is 10 — so the same drawing spiked in one export and not the other.
 *    That caps how far the STROKE's join may run past the geometry.
 * 2. **In the GEOMETRY** (`geometry/band.ts`), because since v1.30 the wall solid itself is
 *    mitred: an outward offset at an acute vertex meets at a point `h / sin(θ/2)` from it,
 *    and that is a real vertex in a real fill, not a stroke artifact. Past `MITER_LIMIT · h`
 *    the band BEVELS instead — the two faces keep their own offset endpoints and a straight
 *    edge joins them. The same constant on purpose, so the fill and the stroke agree about
 *    where a spike stops.
 *
 * Neither depends on a geometry backend any more. Until v1.30 an angled plan reached a
 * mitrable outline only when the optional `clipper2-wasm` package happened to be
 * registered; without it the drawing was per-segment lines with no joins at all, and the
 * test below asserted exactly that absence.
 */

describe("acute wall joints — the mitre cap", () => {
  /** A 5° wedge: the mitre at its point would run to ~22× the half-thickness uncapped. */
  const SPIKE = 'plan "S" { wall exterior thickness 300 { (0,0) (10000,0) (0,900) close } }';
  const ORTHO = 'plan "S" { wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close } }';
  /** The wedge's acute vertex — the one the mitre would shoot out of. */
  const APEX = { x: 10_000, y: 0 };
  const HALF_THICKNESS = 150;

  /** Every vertex of the wall outline. The SPIKE is all-straight, so it is a `region`. */
  const outlineVertices = (src: string): { x: number; y: number }[] => {
    const scene = compile(src, { noCache: true }).scene!;
    const outline = scene.nodes.filter((n) => n.layer === "wallFace");
    expect(outline).toHaveLength(1);
    const prim = outline[0]!.prim;
    if (prim.t !== "region") throw new Error(`expected a region outline, got ${prim.t}`);
    return prim.loops.flat();
  };

  it("caps the wall-region outline's mitre (the one stroke that has joins)", () => {
    expect(compile(ORTHO, { noCache: true }).svg).toContain('stroke-linejoin="miter" stroke-miterlimit="4"');
  });

  it("caps an ACUTE joint with NO backend registered — it is one outline either way", () => {
    expect(getGeometryBackend()).toBe(null);
    const svg = compile(SPIKE, { noCache: true }).svg;
    // One outline, and it carries the cap. This is the drawing that spiked, and the case
    // that used to have no `stroke-linejoin` at all because it was never joined.
    expect((svg.match(/stroke-miterlimit="4"/g) ?? []).length).toBe(1);
    expect(svg).toContain('stroke-linejoin="miter"');
  });

  it("BEVELS the acute point geometrically: no outline vertex past MITER_LIMIT × h", () => {
    // The stroke cap alone would not save this drawing. The offset faces of a 5° wedge
    // meet 22 half-thicknesses out — an actual vertex, in the poché fill as well as the
    // outline — so `wallBand` refuses the mitre and inserts a bevel edge instead.
    // Measured along +x, the direction the spike shoots: the apex is the drawing's
    // right-most vertex, so `max(x) - APEX.x` IS how far the joint overruns it.
    const verts = outlineVertices(SPIKE);
    expect(verts.length).toBeGreaterThan(0);
    const overrun = Math.max(...verts.map((p) => p.x)) - APEX.x;
    expect(overrun).toBeGreaterThan(0); // the band does reach past the centreline vertex
    expect(overrun).toBeLessThanOrEqual(MITER_LIMIT * HALF_THICKNESS + 1e-6);
    // Non-vacuity: an UNCAPPED mitre really would run far past that, so the assertion
    // above is not just restating how small the wedge is.
    const uncapped = HALF_THICKNESS / Math.sin(Math.atan2(900, 10_000) / 2);
    expect(uncapped).toBeGreaterThan(5 * MITER_LIMIT * HALF_THICKNESS);
  });

  it("bevels identically with the clipper2 backend registered — it is not consulted", async () => {
    const without = compile(SPIKE, { noCache: true }).svg;
    setGeometryBackend(await loadClipperBackend());
    try {
      expect(getGeometryBackend()).not.toBe(null);
      expect(compile(SPIKE, { noCache: true }).svg).toBe(without);
    } finally {
      setGeometryBackend(null);
    }
  });

  it("the cap rides on the PAINT, so every backend gets the same number", () => {
    const scene = compile(ORTHO, { noCache: true }).scene!;
    const outline = scene.nodes.find((n) => n.prim.t === "region")!;
    expect(outline.paint.miterLimit).toBe(MITER_LIMIT);
    expect(MITER_LIMIT).toBe(4);
  });
});
