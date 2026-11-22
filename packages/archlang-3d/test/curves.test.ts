/** Arc discretisation to a chord tolerance (archlang-3d plan §4.1). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chordCount, circleRing, tessellateLoops } from "../src/curves.js";
import { adaptPlan } from "../src/index.js";

describe("curves: arcs to a chord tolerance", () => {
  const arc = {
    center: { x: 0, y: 0 },
    r: 8000,
    a: { x: 8000, y: 0 },
    b: { x: 0, y: 8000 },
    sweep: Math.PI / 2,
    start: 0,
  };

  it("keeps every chord's sagitta within the tolerance, and clamps the count to [4, 720]", () => {
    for (const tol of [0.5, 2, 10, 100]) {
      const n = chordCount(arc.r, arc.sweep, tol);
      const sagitta = arc.r * (1 - Math.cos(arc.sweep / n / 2));
      expect(sagitta, `tol ${tol}`).toBeLessThanOrEqual(tol + 1e-9);
    }
    expect(chordCount(10, 0.01, 2)).toBe(4);
    expect(chordCount(1e7, 2 * Math.PI, 0.001)).toBe(720);
  });

  it("starts each arc at its exact authored end and lands the next edge on the other", () => {
    const ring =
      tessellateLoops(
        [
          [
            { t: "arc", arc },
            { t: "line", a: { x: 0, y: 8000 }, b: { x: 8000, y: 0 } },
          ],
        ],
        2,
      )[0] ?? [];
    expect(ring[0]).toEqual({ x: 8000, y: 0 });
    expect(ring[ring.length - 1]).toEqual({ x: 0, y: 8000 });
    // Clockwise on the sheet (y down): the first interior point lies at positive y.
    expect(ring[1]?.y).toBeGreaterThan(0);
  });

  it("discretises a round room finer than the drawing's 48-gon at the default 2 mm", () => {
    const ring = circleRing({ x: 0, y: 0 }, 8000);
    expect(ring.length).toBeGreaterThan(48);
    expect(ring.every((p) => Math.abs(Math.hypot(p.x, p.y) - 8000) < 1e-6)).toBe(true);
  });
});

describe("curves: a room ring's arc edge (core card ARC2)", () => {
  it("lays the floor finish to the curve, at the chord tolerance, so it covers the bay", () => {
    // ArchCanvas's Bay Bungalow with its living room written along the bay's arc.
    const src = readFileSync(new URL("../../../test/floor-unassigned/bay-bungalow-arc-living.arch", import.meta.url), "utf8");
    const r = adaptPlan(src);
    if (!r.ok) throw new Error(r.refusal.message);
    const floor = r.scene.levels[0]!.floors.find((f) => f.id === "r_living")!;
    const ring = floor.polygon.outer;
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[(i + 1) % ring.length]!;
      twice += ax * by - bx * ay;
    }
    const areaMm2 = Math.abs(twice) / 2 / 1e6; // µm² to mm²
    // Exact: 5800 × 6800 plus the bay's segment (R²/2)(θ − sin θ), θ = 2·asin(1500/1900).
    const theta = 2 * Math.asin(1500 / 1900);
    const exact = 5800 * 6800 + ((1900 * 1900) / 2) * (theta - Math.sin(theta));
    // An inscribed chord ring at 2 mm sagitta loses at most (2/3)·2 mm over the 3458 mm arc.
    expect(exact - areaMm2).toBeGreaterThan(0);
    expect(exact - areaMm2).toBeLessThan((2 / 3) * 2 * 1900 * theta);
    // It reaches the bay's apex, 733.8 mm north of the facade, not the chord.
    expect(Math.min(...ring.map(([, y]) => y)) / 1000).toBeCloseTo(-733.81, 1);
  });
});
