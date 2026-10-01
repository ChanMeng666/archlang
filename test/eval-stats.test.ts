import { describe, expect, it } from "vitest";
import { wilson95 } from "../eval/stats.js";
import { renderDelta, renderResults } from "../eval/run.js";
import type { Score } from "../eval/run.js";

describe("wilson95", () => {
  const near = (k: number, n: number, lo: number, hi: number): void => {
    const w = wilson95(k, n);
    expect(w.lo).toBeCloseTo(lo, 4);
    expect(w.hi).toBeCloseTo(hi, 4);
  };

  it("matches known values", () => {
    near(23, 26, 0.7102, 0.96);
    near(14, 26, 0.3546, 0.7124);
    near(3, 26, 0.04, 0.2898);
  });

  it("edges never produce NaN and stay inside [0, 1]", () => {
    expect(wilson95(0, 0)).toEqual({ lo: 0, hi: 1 });
    const none = wilson95(0, 10);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeCloseTo(0.2775, 4);
    const all = wilson95(10, 10);
    expect(all.hi).toBe(1);
    expect(all.lo).toBeCloseTo(0.7225, 4);
    for (const [k, n] of [
      [0, 0],
      [0, 1],
      [1, 1],
      [5, 10],
      [26, 26],
    ] as const) {
      const w = wilson95(k, n);
      expect(Number.isNaN(w.lo) || Number.isNaN(w.hi)).toBe(false);
      expect(w.lo).toBeGreaterThanOrEqual(0);
      expect(w.hi).toBeLessThanOrEqual(1);
      expect(w.lo).toBeLessThanOrEqual(w.hi);
    }
  });
});

describe("live report intervals", () => {
  const row = (id: string, ok: boolean): Score => ({
    id,
    valid: true,
    lintWarnings: 0,
    physicalWarnings: 0,
    semanticPass: ok,
    failures: ok ? [] : ["x"],
  });
  const results = [row("a", true), row("b", true), row("c", false)];
  const summary = { total: 3, valid: 3, semanticPass: 2, sound: 3 };

  it("ci mode (default) is unchanged — no interval text", () => {
    const md = renderResults(results, summary, "offline");
    expect(md).not.toContain("Wilson");
    expect(md).toContain("- **Valid (compiles):** 3/3 (100%)\n");
    expect(md).toContain("- **Intent match (semantic):** 2/3 (67%)\n");
    expect(renderResults(results, summary, "offline", undefined, {})).toBe(md);
  });

  it("live mode prints k/n with a Wilson 95 % interval beside every rate", () => {
    const md = renderResults(results, summary, "live (x)", undefined, { intervals: true });
    expect(md).toContain("- **Valid (compiles):** 3/3 (100%; Wilson 95 % 43–100 %)");
    expect(md).toContain("- **Intent match (semantic):** 2/3 (67%; Wilson 95 % 20–94 %)");
    expect(md).toContain("- **Sound (lint-clean):** 3/3 (100%; Wilson 95 % 43–100 %)");
  });

  it("the delta carries intervals only when asked, and keeps the judge warning", () => {
    const base = { total: 3, valid: 3, semanticPass: 1, sound: 3, judge: "0" };
    const plain = renderDelta(base, summary);
    expect(plain).not.toContain("Wilson");
    const live = renderDelta(base, summary, { intervals: true });
    expect(live).toContain("baseline 1/3 (Wilson 95 %");
    expect(live).toContain("now 2/3 (Wilson 95 % 20–94 %)");
    expect(live).toContain("are NOT comparable");
    expect(plain).toContain("are NOT comparable");
  });
});
