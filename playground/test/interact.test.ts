import { describe, expect, it } from "vitest";
import { DRAG_SLOP, type HitBox, isDragNotClick, pickSmallestContaining } from "../src/interact.js";

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
