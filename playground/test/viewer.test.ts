import { describe, expect, it } from "vitest";
import { DEFAULT_STAGE_SIZE, sizeFromViewBox } from "../src/viewer.js";

describe("sizeFromViewBox", () => {
  it("reads width/height from a space-separated viewBox", () => {
    expect(sizeFromViewBox("0 0 5400 4200")).toEqual({ w: 5400, h: 4200 });
  });

  it("ignores the min-x/min-y origin — only the extents size the stage", () => {
    expect(sizeFromViewBox("-200 -150 5400 4200")).toEqual({ w: 5400, h: 4200 });
  });

  it("accepts comma and mixed separators", () => {
    expect(sizeFromViewBox("0,0,800,600")).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox("0, 0, 800, 600")).toEqual({ w: 800, h: 600 });
  });

  it("accepts fractional extents", () => {
    expect(sizeFromViewBox("0 0 123.5 78.25")).toEqual({ w: 123.5, h: 78.25 });
  });

  it("falls back to the default when the attribute is missing", () => {
    expect(sizeFromViewBox(null)).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox(undefined)).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox("")).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox(null)).toEqual({ w: DEFAULT_STAGE_SIZE.w, h: DEFAULT_STAGE_SIZE.h });
  });

  it("falls back when the viewBox is not four numbers", () => {
    expect(sizeFromViewBox("0 0 800")).toEqual({ w: 800, h: 600 }); // three
    expect(sizeFromViewBox("0 0 800 600 1")).toEqual({ w: 800, h: 600 }); // five
    expect(sizeFromViewBox("0 0 wide tall")).toEqual({ w: 800, h: 600 }); // NaN
  });

  it("falls back on a non-positive extent rather than propagating it", () => {
    // A zero or negative size would send the pan/zoom controller a degenerate
    // content box; the fallback keeps the stage measurable.
    expect(sizeFromViewBox("0 0 0 600")).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox("0 0 800 0")).toEqual({ w: 800, h: 600 });
    expect(sizeFromViewBox("0 0 -800 -600")).toEqual({ w: 800, h: 600 });
  });

  it("returns finite positive numbers for every realistic input", () => {
    for (const vb of [null, "", "x", "0 0 0 0", "0 0 -1 -1", "0 0 800", "0 0 5400 4200", "0,0,1,1"]) {
      const { w, h } = sizeFromViewBox(vb);
      expect(Number.isFinite(w) && w > 0).toBe(true);
      expect(Number.isFinite(h) && h > 0).toBe(true);
    }
  });

  it("DOCUMENTED GAP: a literal `Infinity` extent passes the `> 0` guard", () => {
    // The guard is `p[2] > 0`, which Infinity satisfies. This is not reachable from
    // a compiled plan (the SVG backend routes every number through `fmt()`), so it
    // is pinned as documentation rather than fixed — the guard exists to reject the
    // realistic failures above (missing, malformed, zero, negative), not adversarial
    // input from a source the page already trusts.
    expect(sizeFromViewBox("0 0 Infinity 5")).toEqual({ w: Number.POSITIVE_INFINITY, h: 5 });
  });
});
