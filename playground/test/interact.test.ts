import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describe as describeArch } from "../../src/index.js";
import { DRAG_SLOP, type HitBox, isDragNotClick, pickSmallestContaining } from "../src/interact.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

const room = (id: string, x: number, y: number, w: number, h: number): { id: string; bbox: HitBox } => ({
  id,
  bbox: { x, y, w, h },
});

describe("pickSmallestContaining", () => {
  const outer = room("outer", 0, 0, 10000, 8000);
  const inner = room("inner", 1000, 1000, 3000, 2000);
  const tiny = room("tiny", 1500, 1500, 500, 500);

  it("returns null when nothing contains the point", () => {
    expect(pickSmallestContaining([outer], -1, -1)).toBeNull();
    expect(pickSmallestContaining([outer], 10001, 4000)).toBeNull();
    expect(pickSmallestContaining([], 0, 0)).toBeNull();
  });

  it("picks the innermost of nested boxes regardless of order", () => {
    for (const order of [
      [outer, inner, tiny],
      [tiny, inner, outer],
      [inner, tiny, outer],
    ]) {
      expect(pickSmallestContaining(order, 1700, 1700)?.id).toBe("tiny");
      expect(pickSmallestContaining(order, 3000, 2500)?.id).toBe("inner");
      expect(pickSmallestContaining(order, 9000, 7000)?.id).toBe("outer");
    }
  });

  it("breaks an equal-area tie in favour of the earlier item, deterministically", () => {
    // Two identically sized overlapping rooms: the comparison is a strict `<`, so
    // the incumbent (earlier) wins and the result is a function of describe()'s
    // room order rather than of float luck.
    const a = room("a", 0, 0, 1000, 1000);
    const b = room("b", 500, 500, 1000, 1000);
    expect(pickSmallestContaining([a, b], 700, 700)?.id).toBe("a");
    expect(pickSmallestContaining([b, a], 700, 700)?.id).toBe("b");
    // Same inputs, same answer, every time.
    for (let i = 0; i < 5; i++) expect(pickSmallestContaining([a, b], 700, 700)?.id).toBe("a");
  });

  it("treats the box boundary as inside (a wall-edge hover still hits its room)", () => {
    const r = room("r", 100, 200, 400, 300);
    expect(pickSmallestContaining([r], 100, 200)?.id).toBe("r"); // top-left corner
    expect(pickSmallestContaining([r], 500, 500)?.id).toBe("r"); // bottom-right corner
    expect(pickSmallestContaining([r], 99.999, 200)).toBeNull();
    expect(pickSmallestContaining([r], 500.001, 500)).toBeNull();
  });

  it("ignores a smaller box that does not contain the point", () => {
    expect(pickSmallestContaining([tiny, outer], 9000, 7000)?.id).toBe("outer");
  });

  it("handles a zero-area box (a degenerate room) without picking it off-point", () => {
    const zero = room("zero", 50, 50, 0, 0);
    expect(pickSmallestContaining([outer, zero], 50, 50)?.id).toBe("zero");
    expect(pickSmallestContaining([outer, zero], 51, 50)?.id).toBe("outer");
  });
});

describe("pickSmallestContaining by shape, not by box (PG.2)", () => {
  const pick = (name: string, x: number, y: number) =>
    pickSmallestContaining(describeArch(example(name)).rooms, x, y)?.id ?? null;

  it("hexagon-pavilion: a corner of the rotunda's box outside its circle is the trapezoid there", () => {
    // Inside the rotunda's box and the g_nw/g_ne boxes (equal area, the rotunda first), outside the circle.
    expect(pick("hexagon-pavilion", 6000, 4500)).toBe("g_nw");
    expect(pick("hexagon-pavilion", 11000, 4500)).toBe("g_ne");
    // The circle itself, its boundary inclusive.
    expect(pick("hexagon-pavilion", 8500, 7000)).toBe("rotunda");
    expect(pick("hexagon-pavilion", 11500, 7000)).toBe("rotunda");
    expect(pick("hexagon-pavilion", 5500, 7000)).toBe("rotunda");
  });

  it("hexagon-pavilion: a point in g_n's box but outside its trapezoid is g_nw, not g_n", () => {
    // g_n's box (6000×3000) is smaller than g_nw's (6000×6000): by box it would win.
    expect(pick("hexagon-pavilion", 6000, 3800)).toBe("g_nw");
    expect(pick("hexagon-pavilion", 8500, 2500)).toBe("g_n");
    // A slanted edge both trapezoids share is inside both; the smaller room wins.
    expect(pick("hexagon-pavilion", 6250, 2500)).toBe("g_n");
  });

  it("gallery-l: a point in the L's box and the lobby's box but in neither room picks nothing", () => {
    expect(pick("gallery-l", 11000, 13000)).toBeNull();
    // The lobby's trapezoid (inside the L's box, outside the L).
    expect(pick("gallery-l", 9000, 11000)).toBe("lobby");
    // The L, and its boundary.
    expect(pick("gallery-l", 3000, 3000)).toBe("gallery");
    expect(pick("gallery-l", 3000, 11000)).toBe("gallery");
    expect(pick("gallery-l", 0, 14000)).toBe("gallery");
    expect(pick("gallery-l", 12000, 4000)).toBe("gallery");
  });
});

describe("isDragNotClick", () => {
  it("is a click when the pointer never went down", () => {
    expect(isDragNotClick(null, 999, 999)).toBe(false);
  });

  it("is a click with no travel", () => {
    expect(isDragNotClick({ x: 100, y: 100 }, 100, 100)).toBe(false);
  });

  it("treats travel of exactly DRAG_SLOP as a click (the threshold is exclusive)", () => {
    expect(DRAG_SLOP).toBe(6);
    expect(isDragNotClick({ x: 0, y: 0 }, DRAG_SLOP, 0)).toBe(false);
    expect(isDragNotClick({ x: 0, y: 0 }, 0, DRAG_SLOP)).toBe(false);
    // 3-4-5 triangle scaled: hypot(3.6, 4.8) === 6 exactly.
    expect(isDragNotClick({ x: 0, y: 0 }, 3.6, 4.8)).toBe(false);
  });

  it("is a drag one pixel past the slop, on either axis or diagonally", () => {
    expect(isDragNotClick({ x: 0, y: 0 }, DRAG_SLOP + 1, 0)).toBe(true);
    expect(isDragNotClick({ x: 0, y: 0 }, 0, DRAG_SLOP + 1)).toBe(true);
    expect(isDragNotClick({ x: 0, y: 0 }, 5, 5)).toBe(true); // hypot ≈ 7.07
  });

  it("measures distance, not signed offset (a drag left is still a drag)", () => {
    expect(isDragNotClick({ x: 100, y: 100 }, 80, 100)).toBe(true);
    expect(isDragNotClick({ x: 100, y: 100 }, 100, 80)).toBe(true);
  });
});
