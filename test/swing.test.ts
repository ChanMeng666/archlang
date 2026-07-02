import { describe, expect, it } from "vitest";
import { doorSwing, sectorIntersectsRect, swingsCollide } from "../src/geometry.js";
import { largestPerimeterGap } from "../src/analyze.js";

/**
 * Geometry shared by the renderer and the architectural lint rules:
 * door-swing quarter-discs and room-perimeter enclosure. Pure & deterministic.
 */

// A door centred on a horizontal wall (segment runs +x), swinging "in" (downward,
// since the left normal of +x is +y in screen space).
const wallSeg = { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 100 };
const door = { at: { x: 1000, y: 0 }, width: 1000, hinge: "left" as const, swing: "in" as const, host: wallSeg };

/**
 * Recover the centre of the circle an SVG endpoint-arc `A r r 0 largeArc sweep`
 * actually draws, from its two endpoints (SVG impl notes F.6.5, rx=ry=r,
 * x-rotation=0). The door renderer emits `M leafEnd A r r 0 0 sweep farJamb`, so a
 * *correct* swing arc must reconstruct to a circle centred on the hinge — a wrong
 * sweep flag silently selects the other candidate centre (the concave arc bug).
 */
function svgArcCentre(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  r: number,
  largeArc: 0 | 1,
  sweep: 0 | 1,
): { x: number; y: number } {
  const x1p = (p0.x - p1.x) / 2;
  const y1p = (p0.y - p1.y) / 2;
  const denom = x1p * x1p + y1p * y1p;
  const factor = Math.sqrt(Math.max(0, (r * r - denom) / denom));
  const sign = largeArc !== sweep ? 1 : -1;
  const cxp = sign * factor * y1p;
  const cyp = sign * factor * -x1p;
  return { x: cxp + (p0.x + p1.x) / 2, y: cyp + (p0.y + p1.y) / 2 };
}

describe("doorSwing", () => {
  it("returns null for an unhosted door", () => {
    expect(doorSwing({ ...door, host: null })).toBeNull();
  });

  it("places the hinge a half-width from centre and the leaf a full width away", () => {
    const s = doorSwing(door)!;
    expect(s.radius).toBe(1000);
    // hinge at 500 from centre along the wall; leaf tip a full width into the room.
    expect(Math.hypot(s.hinge.x - door.at.x, s.hinge.y - door.at.y)).toBeCloseTo(500);
    expect(Math.hypot(s.leafEnd.x - s.hinge.x, s.leafEnd.y - s.hinge.y)).toBeCloseTo(1000);
  });

  // The swing arc must be a *convex* quarter-disc centred on the hinge. The SVG
  // arc syntax carries no centre, so a flipped sweep flag draws the other valid
  // circle (centred across the leaf/jamb chord) — a concave arc. Reconstruct the
  // centre the SVG actually draws and assert it lands on the hinge, for every
  // hinge×swing across all four wall traversal directions.
  it("draws a convex arc centred on the hinge for every hinge×swing×wall direction", () => {
    const walls = [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 100 }, // +x
      { a: { x: 4000, y: 0 }, b: { x: 0, y: 0 }, thickness: 100 }, // −x (reversed)
      { a: { x: 0, y: 0 }, b: { x: 0, y: 4000 }, thickness: 100 }, // +y
      { a: { x: 0, y: 4000 }, b: { x: 0, y: 0 }, thickness: 100 }, // −y (reversed)
    ];
    for (const w of walls) {
      const at = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      for (const hinge of ["left", "right"] as const) {
        for (const swing of ["in", "out"] as const) {
          const s = doorSwing({ at, width: 1000, hinge, swing, host: w })!;
          const c = svgArcCentre(s.leafEnd, s.farJamb, s.radius, 0, s.sweep);
          expect(
            Math.hypot(c.x - s.hinge.x, c.y - s.hinge.y),
            `${hinge}/${swing} on wall ${JSON.stringify(w.a)}→${JSON.stringify(w.b)}`,
          ).toBeLessThan(1);
        }
      }
    }
  });
});

describe("sectorIntersectsRect", () => {
  const s = doorSwing(door)!;
  it("flags a rectangle the leaf sweeps onto", () => {
    // A box directly in the swept quarter (in front of the hinge).
    expect(sectorIntersectsRect(s, { x: 200, y: 200, w: 700, h: 700 }, 0)).toBe(true);
  });
  it("clears a rectangle outside the radius", () => {
    expect(sectorIntersectsRect(s, { x: 3000, y: 1000, w: 500, h: 500 }, 0)).toBe(false);
  });
});

describe("swingsCollide", () => {
  it("detects two overlapping swings and clears distant ones", () => {
    const a = doorSwing(door)!;
    const near = doorSwing({ ...door, at: { x: 1500, y: 0 } })!;
    const far = doorSwing({ ...door, at: { x: 3800, y: 0 } })!;
    expect(swingsCollide(a, near, 0)).toBe(true);
    expect(swingsCollide(a, far, 0)).toBe(false);
  });
});

describe("largestPerimeterGap", () => {
  const wall = (pts: { x: number; y: number }[], closed: boolean) => ({
    id: "w",
    category: "x",
    thickness: 100,
    points: pts,
    closed,
  });
  const room = { x: 0, y: 0, w: 3000, h: 3000 };

  it("is ~0 when every edge is backed by a wall", () => {
    const shell = wall(
      [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      true,
    );
    expect(largestPerimeterGap(room, [shell], 200)).toBeLessThanOrEqual(1);
  });

  it("reports the open run when a wall is missing on one edge", () => {
    // Three sides only — the right edge (x=3000) is unwalled.
    const open = wall(
      [
        { x: 3000, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 3000 },
        { x: 3000, y: 3000 },
      ],
      false,
    );
    expect(largestPerimeterGap(room, [open], 200)).toBeCloseTo(3000);
  });
});
