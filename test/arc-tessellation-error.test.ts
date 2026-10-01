import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARC_STEP_DEG } from "../src/geometry/arc.js";

/**
 * The inscribed n-gon an arc is tessellated into has two TRUE errors, both fixed by the
 * step alone: the area shortfall `1 − n·sin(2π/n)/(2π)` and the sagitta `R(1 − cos(π/n))`.
 * Code comments and docs state rounded forms of them; this pins the derivation and that
 * each stated figure is the derived one, so a wrong number cannot creep back in.
 */
const n = 360 / ARC_STEP_DEG;
const areaShortfall = 1 - (n * Math.sin((2 * Math.PI) / n)) / (2 * Math.PI);
const sagittaDivisor = 1 / (1 - Math.cos(Math.PI / n));

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const pct = (areaShortfall * 100).toFixed(2); // "0.29"
const div = String(Math.round(sagittaDivisor)); // "467"
const mm = String(Math.round(9000 / sagittaDivisor)); // "19"

/** Prose and comments wrap, so every space in a pattern is written `\s+`. */
const S = String.raw`\s+`;

/** A miss reports the file and the pattern, never the file's contents. */
const stated = (file: string, re: RegExp): void => {
  expect(re.test(read(file)), `${file} must state ${re}`).toBe(true);
};
/** A wrong figure left behind: the failure value is the offending text only. */
const absent = (file: string, re: RegExp): void => {
  expect(read(file).match(re)?.[0]).toBeUndefined();
};

describe("arc tessellation error statements", () => {
  it("the step makes a 48-gon", () => {
    expect(n).toBe(48);
  });

  it("derives sagitta ≈ R/467 and area shortfall ≈ 0.2853 %", () => {
    expect(sagittaDivisor).toBeCloseTo(467.05, 1);
    expect(areaShortfall * 100).toBeCloseTo(0.2853, 4);
    // 9 m radius: ≈ 19 mm.
    expect(9000 / sagittaDivisor).toBeCloseTo(19.27, 1);
  });

  it("src/geometry/arc.ts states the derived sagitta", () => {
    stated("src/geometry/arc.ts", new RegExp(`r/${div}\\b[^\\n]*\\(${mm}${S}mm${S}on${S}a${S}9${S}m${S}radius\\)`));
    absent("src/geometry/arc.ts", /r\/1400/);
  });

  it("docs/analysis.md states the derived sagitta and area shortfall", () => {
    stated("docs/analysis.md", new RegExp(`\`R/${div}\`${S}—${S}${mm}${S}mm${S}on${S}a${S}9${S}m${S}radius`));
    stated("docs/analysis.md", new RegExp(`a${S}48-gon${S}is${S}${pct}\\s*%${S}short`));
    absent("docs/analysis.md", /R\/1400|0\.14\s*%/);
  });

  it("src/analyze.ts states the derived area shortfall", () => {
    stated("src/analyze.ts", new RegExp(`understates${S}the${S}area${S}by${S}${pct}\\s*%`));
    absent("src/analyze.ts", /understates\s+the\s+area\s+by\s+~?0\.1\s*%/);
  });

  it("src/elements/room.ts states the derived area shortfall", () => {
    stated("src/elements/room.ts", new RegExp(`\\(${pct}\\s*%${S}short\\)`));
    absent("src/elements/room.ts", /\(0\.1\s*%\s+short\)/);
  });
});
