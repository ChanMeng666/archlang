import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compile } from "../src/index.js";
import { GridIndex } from "../src/geometry/grid-index.js";

describe("GridIndex", () => {
  it("returns items whose cells intersect the query box (deduped, deterministic)", () => {
    const g = new GridIndex<string>(100);
    g.insert({ minX: 0, minY: 0, maxX: 250, maxY: 50 }, "a"); // spans several cells
    g.insert({ minX: 1000, minY: 1000, maxX: 1050, maxY: 1050 }, "b"); // far away
    const near = g.queryBox({ minX: 10, minY: 10, maxX: 20, maxY: 20 });
    expect(near).toEqual(["a"]); // 'a' once (not duplicated across its cells), not 'b'
    expect(g.queryBox({ minX: 1010, minY: 1010, maxX: 1020, maxY: 1020 })).toEqual(["b"]);
  });

  it("a query box of half-size r contains every item within distance r of a point", () => {
    // Property: for a point p and an item box, if the item's nearest point to p is
    // within r, the query box [p±r] returns it (superset completeness).
    const g = new GridIndex<number>(37);
    const boxes = [
      { minX: 500, minY: 500, maxX: 520, maxY: 520 },
      { minX: -300, minY: 40, maxX: -280, maxY: 60 },
    ];
    boxes.forEach((b, i) => g.insert(b, i));
    const p = { x: 0, y: 0 };
    const r = 600;
    const got = new Set(g.queryBox({ minX: p.x - r, minY: p.y - r, maxX: p.x + r, maxY: p.y + r }));
    // box 0 nearest point (500,500) is ~707 away (> r) — may or may not appear;
    // box 1 nearest point (-280,40)..( -300 within x) is < 600 → must appear.
    expect(got.has(1)).toBe(true);
  });
});

/**
 * The grid-accelerated room-overlap check (T3.7) must emit the exact same set of
 * W_ROOM_OVERLAP warnings, in the same order, as the former O(n²) double loop.
 * We compile random room sets and compare against a brute-force reference.
 */
describe("room-overlap grid ≡ O(n²) (T3.7)", () => {
  const roomGen = fc.record({
    x: fc.integer({ min: 0, max: 4000 }),
    y: fc.integer({ min: 0, max: 4000 }),
    w: fc.integer({ min: 100, max: 2500 }),
    h: fc.integer({ min: 100, max: 2500 }),
  });

  it("produces identical overlap warnings (set + order)", () => {
    fc.assert(
      fc.property(fc.array(roomGen, { maxLength: 14 }), (rooms) => {
        // grid 1 ⇒ integer coords pass through snapping unchanged.
        const src =
          `plan "R" { units mm grid 1\n` +
          rooms.map((r, i) => `room id=r${i} at (${r.x},${r.y}) size ${r.w}x${r.h}`).join("\n") +
          `\n}`;
        const { diagnostics } = compile(src, { noCache: true });
        const got = diagnostics.filter((d) => d.code === "W_ROOM_OVERLAP").map((d) => d.message);

        // Brute-force reference, mirroring the former double loop exactly.
        const want: string[] = [];
        for (let a = 0; a < rooms.length; a++) {
          for (let b = a + 1; b < rooms.length; b++) {
            const r1 = rooms[a];
            const r2 = rooms[b];
            const ox = Math.max(0, Math.min(r1.x + r1.w, r2.x + r2.w) - Math.max(r1.x, r2.x));
            const oy = Math.max(0, Math.min(r1.y + r1.h, r2.y + r2.h) - Math.max(r1.y, r2.y));
            if (ox > 1 && oy > 1) want.push(`Rooms "r${a}" and "r${b}" overlap`);
          }
        }
        expect(got).toEqual(want);
      }),
      { numRuns: 300 },
    );
  });
});
