import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hostInfoForWalls, hostSegmentForWalls, isOnSomeWall, WallGrid, type WallLike } from "../src/geometry.js";

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

/**
 * The grid-accelerated WallGrid.hostInfo() (T3.7) must return byte-identical
 * results to the brute-force scan for ALL inputs — same nearest host (object
 * value + first-wins tie-break) and same onWall — including points far from any
 * wall and ref filters. This pins the ~O(n) optimization to the O(n²) truth.
 */
describe("WallGrid — equivalence with brute-force hostInfoForWalls (T3.7)", () => {
  it("matches host + onWall for arbitrary walls/points/refs", () => {
    fc.assert(
      fc.property(
        fc.array(wall, { maxLength: 10 }),
        point,
        fc.option(fc.constantFrom("ext", "int", "part", "missing"), { nil: undefined }),
        (walls, at, ref) => {
          const grid = new WallGrid(walls);
          const brute = hostInfoForWalls(walls, at, ref);
          const viaGrid = grid.hostInfo(at, ref);
          expect(viaGrid.onWall).toBe(brute.onWall);
          expect(viaGrid.host).toEqual(brute.host);
        },
      ),
      { numRuns: 600 },
    );
  });

  it("handles far points and empty walls identically", () => {
    expect(new WallGrid([]).hostInfo({ x: 9e6, y: -9e6 })).toEqual({ host: null, onWall: false });
    const walls: WallLike[] = [
      {
        id: "w",
        category: "ext",
        thickness: 200,
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
        ],
        closed: false,
      },
    ];
    const at = { x: 50000, y: 50000 };
    expect(new WallGrid(walls).hostInfo(at)).toEqual(hostInfoForWalls(walls, at));
  });
});
