import { describe, expect, it } from "vitest";
import { MAX_RASTER_EDGE, rasterSize } from "../src/raster-export.js";

const svgWith = (vb: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><g/></svg>`;

describe("rasterSize", () => {
  it("upscales a small plan by at most 2x", () => {
    // 400x300 could fit MAX_RASTER_EDGE at 10x, but a vector blown up 10x is just
    // a blurry raster — the 2x cap is the rule being asserted.
    const s = rasterSize(svgWith("0 0 400 300"));
    expect(s.scale).toBe(2);
    expect(s.width).toBe(800);
    expect(s.height).toBe(600);
  });

  it("caps the longest edge at MAX_RASTER_EDGE exactly", () => {
    const s = rasterSize(svgWith(`0 0 ${MAX_RASTER_EDGE * 3} ${MAX_RASTER_EDGE}`));
    expect(s.width).toBe(MAX_RASTER_EDGE);
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX_RASTER_EDGE);
  });

  it("is exactly 2x at the changeover edge and downscales just past it", () => {
    // The two rules cross where MAX_RASTER_EDGE / longest === 2.
    const atEdge = rasterSize(svgWith(`0 0 ${MAX_RASTER_EDGE / 2} 100`));
    expect(atEdge.scale).toBe(2);
    expect(atEdge.width).toBe(MAX_RASTER_EDGE);

    const pastEdge = rasterSize(svgWith(`0 0 ${MAX_RASTER_EDGE} 100`));
    expect(pastEdge.scale).toBe(1);
    expect(pastEdge.width).toBe(MAX_RASTER_EDGE);
  });

  it("preserves aspect ratio on a non-square plan", () => {
    const s = rasterSize(svgWith("0 0 12000 3000"));
    expect(s.width / s.height).toBeCloseTo(4, 6);
    expect(s.width).toBe(MAX_RASTER_EDGE);
    expect(s.height).toBe(MAX_RASTER_EDGE / 4);
  });

  it("clamps on the LONGEST edge, whichever axis that is", () => {
    const wide = rasterSize(svgWith("0 0 20000 500"));
    const tall = rasterSize(svgWith("0 0 500 20000"));
    expect(wide.width).toBe(MAX_RASTER_EDGE);
    expect(tall.height).toBe(MAX_RASTER_EDGE);
    expect(wide.width).toBe(tall.height);
    expect(wide.height).toBe(tall.width);
  });

  it("falls back to 800x600 when there is no parsable viewBox", () => {
    const s = rasterSize(`<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>`);
    expect(s.vbW).toBe(800);
    expect(s.vbH).toBe(600);
    expect(s.width).toBe(1600); // the 2x rule still applies to the fallback
    expect(s.height).toBe(1200);
  });

  it("floors a degenerate 0-size viewBox at a 1x1 canvas without NaN", () => {
    // `MAX_RASTER_EDGE / 0` is Infinity, so `scale` is the 2x cap and the rounded
    // dimensions are 0 — the `Math.max(1, …)` floor is what keeps <canvas> legal.
    const s = rasterSize(svgWith("0 0 0 0"));
    expect(Number.isFinite(s.width) && Number.isFinite(s.height)).toBe(true);
    expect(s.width).toBe(1);
    expect(s.height).toBe(1);
  });

  it("floors a degenerate single axis at 1px while keeping the other honest", () => {
    const s = rasterSize(svgWith("0 0 1000 0"));
    expect(s.width).toBe(2000);
    expect(s.height).toBe(1);
  });

  it("rounds to whole pixels", () => {
    const s = rasterSize(svgWith("0 0 3333 1111"));
    expect(Number.isInteger(s.width)).toBe(true);
    expect(Number.isInteger(s.height)).toBe(true);
  });

  it("reads the viewBox even when other attributes precede it", () => {
    const s = rasterSize(`<svg width="10" height="10" viewBox="0 0 2000 1000" xmlns="x"></svg>`);
    expect(s.vbW).toBe(2000);
    expect(s.vbH).toBe(1000);
  });
});
