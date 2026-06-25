import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  hostInfoForWalls,
  hostSegmentForWalls,
  isOnSomeWall,
  type WallLike,
} from "../src/geometry.js";

/**
 * The fused single-pass hostInfoForWalls() must stay byte-identical to the
 * original pair (hostSegmentForWalls + isOnSomeWall). This property test pins
 * that equivalence so the Track 3 optimization can never silently diverge.
 */
const coord = fc.integer({ min: -2000, max: 6000 });
const point = fc.record({ x: coord, y: coord });

const wall = fc.record({
  id: fc.string({ minLength: 1, maxLength: 4 }),
  category: fc.constantFrom("ext", "int", "part"),
  thickness: fc.integer({ min: 1, max: 400 }),
  points: fc.array(point, { minLength: 2, maxLength: 5 }),
  closed: fc.boolean(),
}) as fc.Arbitrary<WallLike>;

describe("hostInfoForWalls — equivalence with the original two functions", () => {
  it("matches host (nearest) and onWall for arbitrary walls/points/refs", () => {
    fc.assert(
      fc.property(
        fc.array(wall, { maxLength: 8 }),
        point,
        fc.option(fc.constantFrom("ext", "int", "part", "missing"), { nil: undefined }),
        (walls, at, ref) => {
          const fused = hostInfoForWalls(walls, at, ref);
          expect(fused.host).toEqual(hostSegmentForWalls(walls, at, ref));
          expect(fused.onWall).toBe(isOnSomeWall(walls, at, ref));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("handles the empty-walls case identically", () => {
    const fused = hostInfoForWalls([], { x: 0, y: 0 });
    expect(fused.host).toBeNull();
    expect(fused.onWall).toBe(false);
  });
});
