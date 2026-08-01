import { describe, expect, it } from "vitest";
import {
  clampScale,
  FIT_PAD,
  fitTransform,
  MAX_SCALE,
  MIN_SCALE,
  type ViewTransform,
  zoomAtTransform,
} from "../src/pan-zoom.js";

/** Apply a view transform to a content-space point → viewport pixels. */
const project = (t: ViewTransform, cx: number, cy: number) => ({ x: t.tx + cx * t.scale, y: t.ty + cy * t.scale });
/** The inverse — viewport pixels → content space. */
const unproject = (t: ViewTransform, px: number, py: number) => ({
  x: (px - t.tx) / t.scale,
  y: (py - t.ty) / t.scale,
});

describe("clampScale", () => {
  it("clamps at both bounds and passes anything between through", () => {
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(-5)).toBe(MIN_SCALE);
    expect(clampScale(1e9)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(MIN_SCALE)).toBe(MIN_SCALE);
    expect(clampScale(MAX_SCALE)).toBe(MAX_SCALE);
  });
});

describe("fitTransform", () => {
  it("centres the content in the viewport", () => {
    const t = fitTransform(1000, 800, 500, 400)!;
    // The projected content box's margins are equal on each axis.
    const topLeft = project(t, 0, 0);
    const bottomRight = project(t, 500, 400);
    expect(topLeft.x).toBeCloseTo(1000 - bottomRight.x, 10);
    expect(topLeft.y).toBeCloseTo(800 - bottomRight.y, 10);
  });

  it("preserves aspect ratio — one scale for both axes", () => {
    // A wide viewport on tall content: the fit must be driven by the tight axis,
    // never stretched to fill.
    const t = fitTransform(2000, 300, 400, 400)!;
    const w = 400 * t.scale;
    const h = 400 * t.scale;
    expect(w).toBeCloseTo(h, 10);
    expect(h).toBeLessThanOrEqual(300);
  });

  it("fits inside the viewport with FIT_PAD breathing room", () => {
    const t = fitTransform(1000, 800, 500, 400)!;
    // 500x400 into 1000x800 is a clean 2x, padded.
    expect(t.scale).toBeCloseTo(2 * FIT_PAD, 10);
    expect(500 * t.scale).toBeLessThan(1000);
  });

  it("clamps the fitted scale into the zoom range", () => {
    // Content one thousandth of a px wide would fit at ~1e6x — clamp to MAX_SCALE.
    expect(fitTransform(1000, 1000, 0.001, 0.001)!.scale).toBe(MAX_SCALE);
    // ...and a plan the size of a continent floors at MIN_SCALE.
    expect(fitTransform(1000, 1000, 1e9, 1e9)!.scale).toBe(MIN_SCALE);
  });

  it("returns null for a degenerate viewport or content instead of NaN/Infinity", () => {
    // A container that has not been laid out yet reports 0x0. The controller must
    // decline rather than write `translate(NaN,NaN) scale(Infinity)`.
    expect(fitTransform(0, 0, 500, 400)).toBeNull();
    expect(fitTransform(1000, 0, 500, 400)).toBeNull();
    expect(fitTransform(0, 800, 500, 400)).toBeNull();
    expect(fitTransform(1000, 800, 0, 400)).toBeNull();
    expect(fitTransform(1000, 800, 500, 0)).toBeNull();
  });

  it("never produces a non-finite number for any accepted input", () => {
    for (const [vw, vh, cw, ch] of [
      [1, 1, 1e9, 1e9],
      [4000, 3000, 1, 1],
      [1, 20000, 20000, 1],
    ] as const) {
      const t = fitTransform(vw, vh, cw, ch)!;
      expect(Number.isFinite(t.scale) && Number.isFinite(t.tx) && Number.isFinite(t.ty)).toBe(true);
    }
  });
});

describe("zoomAtTransform", () => {
  const start: ViewTransform = { scale: 1.5, tx: -40, ty: 90 };

  it("keeps the anchor point fixed under the transform", () => {
    for (const [px, py] of [
      [0, 0],
      [317, 208],
      [-50, 900],
    ] as const) {
      const before = unproject(start, px, py);
      const after = zoomAtTransform(start, start.scale * 2.5, px, py);
      const now = project(after, before.x, before.y);
      expect(now.x).toBeCloseTo(px, 9);
      expect(now.y).toBeCloseTo(py, 9);
    }
  });

  it("keeps the anchor fixed when zooming OUT too", () => {
    const px = 640;
    const py = 360;
    const before = unproject(start, px, py);
    const after = zoomAtTransform(start, start.scale * 0.31, px, py);
    const now = project(after, before.x, before.y);
    expect(now.x).toBeCloseTo(px, 9);
    expect(now.y).toBeCloseTo(py, 9);
  });

  it("keeps the anchor fixed even when the request is clamped", () => {
    // The clamp changes the scale that is applied; the anchor invariant must hold
    // for the scale actually used, not the one asked for.
    const px = 200;
    const py = 120;
    const before = unproject(start, px, py);
    const after = zoomAtTransform(start, 1e6, px, py);
    expect(after.scale).toBe(MAX_SCALE);
    const now = project(after, before.x, before.y);
    expect(now.x).toBeCloseTo(px, 6);
    expect(now.y).toBeCloseTo(py, 6);
  });

  it("clamps the scale at both bounds", () => {
    expect(zoomAtTransform(start, 1e9, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAtTransform(start, 0, 0, 0).scale).toBe(MIN_SCALE);
  });

  it("is a no-op transform when the scale does not change", () => {
    const same = zoomAtTransform(start, start.scale, 123, 456);
    expect(same.scale).toBe(start.scale);
    expect(same.tx).toBeCloseTo(start.tx, 10);
    expect(same.ty).toBeCloseTo(start.ty, 10);
  });

  it("does not mutate the transform it is given", () => {
    const input: ViewTransform = { scale: 1.5, tx: -40, ty: 90 };
    zoomAtTransform(input, 4, 10, 10);
    expect(input).toEqual({ scale: 1.5, tx: -40, ty: 90 });
  });
});
