import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compile } from "../src/index.js";
import { GridIndex } from "../src/geometry/grid-index.js";
import { MAX_OVERLAP_PAIRS_LISTED } from "../src/ir.js";

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
    boxes.forEach((b, i) => {
      g.insert(b, i);
    });
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
            const r1 = rooms[a]!;
            const r2 = rooms[b]!;
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

/**
 * Resource caps: a pile of identical rooms is n(n-1)/2 overlapping pairs. The listing is
 * capped at MAX_OVERLAP_PAIRS_LISTED in the exact order the uncapped check used, and one
 * summary diagnostic counts the rest — memory stays O(n), never O(pairs).
 */
describe("room-overlap listing cap", () => {
  const stack = (n: number): string =>
    `plan "S" { units mm grid 1\n` +
    Array.from({ length: n }, (_, i) => `room id=r${i} at (0,0) size 2000x2000`).join("\n") +
    `\n}`;

  it("lists exactly K pairs in (a,b) order, then one correct summary", () => {
    const n = 150;
    const msgs = compile(stack(n), { noCache: true })
      .diagnostics.filter((d) => d.code === "W_ROOM_OVERLAP")
      .map((d) => d.message);
    const total = (n * (n - 1)) / 2;
    expect(msgs).toHaveLength(MAX_OVERLAP_PAIRS_LISTED + 1);
    const want: string[] = [];
    for (let a = 0; a < n && want.length < MAX_OVERLAP_PAIRS_LISTED; a++) {
      for (let b = a + 1; b < n && want.length < MAX_OVERLAP_PAIRS_LISTED; b++) {
        want.push(`Rooms "r${a}" and "r${b}" overlap`);
      }
    }
    expect(msgs.slice(0, MAX_OVERLAP_PAIRS_LISTED)).toEqual(want);
    expect(msgs[MAX_OVERLAP_PAIRS_LISTED]).toBe(
      `…and ${total - MAX_OVERLAP_PAIRS_LISTED} more room pairs overlap (first ${MAX_OVERLAP_PAIRS_LISTED} listed)`,
    );
  });

  it("emits no summary at or under the cap", () => {
    const msgs = compile(stack(20), { noCache: true })
      .diagnostics.filter((d) => d.code === "W_ROOM_OVERLAP")
      .map((d) => d.message);
    expect(msgs).toHaveLength(190);
    expect(msgs.some((m) => m.startsWith("…and"))).toBe(false);
  });
});

/** A box wider than MAX_CELLS_PER_BOX cells goes to the overflow list; a query wider than
 *  the populated cells is answered from the populated buckets — neither enumerates cells. */
describe("GridIndex extreme extents", () => {
  it("indexes a 10^12-wide box without enumerating its cells, and still finds it", () => {
    const g = new GridIndex<string>(100);
    g.insert({ minX: 0, minY: 0, maxX: 1e12, maxY: 200 }, "wall");
    g.insert({ minX: 500, minY: 0, maxX: 600, maxY: 50 }, "near");
    expect(g.queryBox({ minX: 520, minY: 10, maxX: 530, maxY: 20 })).toEqual(["near", "wall"]);
    const seen: string[] = [];
    g.forEach({ minX: 5e11, minY: 0, maxX: 5e11 + 10, maxY: 10 }, (i) => seen.push(i));
    expect(seen).toEqual(["wall"]);
  });

  it("a huge query box returns the populated buckets in the same order as a cell walk", () => {
    const a = new GridIndex<number>(10);
    const b = new GridIndex<number>(10);
    for (let i = 0; i < 6; i++) {
      const box = { minX: i * 30, minY: (5 - i) * 30, maxX: i * 30 + 5, maxY: (5 - i) * 30 + 5 };
      a.insert(box, i);
      b.insert(box, i);
    }
    const small = { minX: 0, minY: 0, maxX: 400, maxY: 400 };
    const huge = { minX: -1e12, minY: -1e12, maxX: 1e12, maxY: 1e12 };
    expect(a.queryBox(huge)).toEqual(b.queryBox(small));
  });
});
