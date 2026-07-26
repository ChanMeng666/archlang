import { describe, expect, it } from "vitest";
import { compile, loadClipperBackend, setGeometryBackend } from "../src/index.js";
import { MITER_LIMIT } from "../src/scene.js";

/**
 * The wall outline's mitre cap.
 *
 * A mitred join's point grows as `1 / sin(θ/2)`. At the 90° corners the rectilinear wall
 * boolean produces it is 1.41 × the line weight — invisible. Where two walls meet at an
 * ACUTE angle it runs away: 12 × at 10°, 23 × at 5°, a black needle shot out of the
 * building. The cap lives on the PAINT rather than in a backend, because the backends'
 * own defaults disagree — SVG's is 4, PDF's is 10 — so the same drawing spiked in one
 * export and not the other.
 */

describe("acute wall joints — the mitre cap", () => {
  /** A 5° wedge: the mitre at its point would run to ~23× the line weight uncapped. */
  const SPIKE = 'plan "S" { wall exterior thickness 300 { (0,0) (10000,0) (0,900) close } }';
  const ORTHO = 'plan "S" { wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close } }';

  it("caps the wall-region outline's mitre (the one stroke that has joins)", () => {
    expect(compile(ORTHO, { noCache: true }).svg).toContain('stroke-linejoin="miter" stroke-miterlimit="4"');
  });

  it("caps it on an ACUTE joint too, once the geometry backend unions the angled walls", async () => {
    setGeometryBackend(await loadClipperBackend());
    try {
      const svg = compile(SPIKE, { noCache: true }).svg;
      // One unioned region, and it carries the cap — this is the drawing that spiked.
      expect((svg.match(/stroke-miterlimit="4"/g) ?? []).length).toBe(1);
    } finally {
      setGeometryBackend(null);
    }
  });

  it("without a backend an angled plan draws per-segment lines, which have no joins to spike", () => {
    const svg = compile(SPIKE, { noCache: true }).svg;
    expect(svg).not.toContain("stroke-linejoin");
  });

  it("the cap rides on the PAINT, so every backend gets the same number", () => {
    const scene = compile(ORTHO, { noCache: true }).scene!;
    const outline = scene.nodes.find((n) => n.prim.t === "region")!;
    expect(outline.paint.miterLimit).toBe(MITER_LIMIT);
    expect(MITER_LIMIT).toBe(4);
  });
});
