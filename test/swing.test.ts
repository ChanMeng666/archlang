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
  const wall = (pts: { x: number; y: number }[], closed: boolean) => ({ id: "w", category: "x", thickness: 100, points: pts, closed });
  const room = { x: 0, y: 0, w: 3000, h: 3000 };

  it("is ~0 when every edge is backed by a wall", () => {
    const shell = wall([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, { x: 0, y: 3000 }], true);
    expect(largestPerimeterGap(room, [shell], 200)).toBeLessThanOrEqual(1);
  });

  it("reports the open run when a wall is missing on one edge", () => {
    // Three sides only — the right edge (x=3000) is unwalled.
    const open = wall([{ x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 3000 }, { x: 3000, y: 3000 }], false);
    expect(largestPerimeterGap(room, [open], 200)).toBeCloseTo(3000);
  });
});
