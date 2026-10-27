/** Arc discretisation to a chord tolerance (archlang-3d plan §4.1). */
import { describe, expect, it } from "vitest";
import { chordCount, circleRing, tessellateLoops } from "../src/curves.js";

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
