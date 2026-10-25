/**
 * PS4.4: the gross internal area is never computed inside `compile()`.
 *
 * `compile(src, { accessible: true })` builds the SVG `<desc>` from `describe()`'s caption
 * (`captionForPlan`, `src/scene-build.ts`), which runs the storey summary. The caption reads only
 * the plan name, the rooms, the centreline total and the entrances, so the summary skips the gross
 * internal area there: `compile()` does none of that unbudgeted work. The rule's own module is
 * wrapped here to count its calls.
 */

import { describe as suite, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock("../src/analyze/gross-area.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/analyze/gross-area.js")>();
  return {
    ...real,
    grossInternalArea: (...args: Parameters<typeof real.grossInternalArea>) => {
      calls.n++;
      return real.grossInternalArea(...args);
    },
  };
});

import { compile, describe } from "../src/index.js";

const SRC = `plan "p" {
  units mm
  wall id=s exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=a at (0,0) size 8000x6000 label "A"
  door on s at 1000 width 900
}`;

suite("PS4.4 — the caption path does not compute the gross internal area", () => {
  it("compile(…, { accessible: true }) draws the caption and calls the rule zero times", () => {
    calls.n = 0;
    const r = compile(SRC, { accessible: true });
    expect(r.errors).toEqual([]);
    expect(r.svg).toContain("<desc");
    expect(calls.n).toBe(0);
  });

  it("describe() does call it (the wrapper is live)", () => {
    calls.n = 0;
    expect(describe(SRC).totals.gross_internal_area_m2).toBe(45.24);
    expect(calls.n).toBeGreaterThan(0);
  });
});
