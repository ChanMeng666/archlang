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

  const pct = `${(areaShortfall * 100).toFixed(2)}%`; // "0.29%"
  const div = `R/${Math.round(sagittaDivisor)}`; // "R/467"
  const mm = `${Math.round(9000 / sagittaDivisor)} mm`; // "19 mm"

  it("src/geometry/arc.ts states the derived sagitta", () => {
    const t = read("src/geometry/arc.ts");
    expect(t).toContain(`r/${Math.round(sagittaDivisor)}`);
    expect(t).toContain(mm);
    expect(t).not.toContain("r/1400");
  });

  it("docs/analysis.md states the derived sagitta and area shortfall", () => {
    const t = read("docs/analysis.md");
    expect(t).toContain(`\`${div}\``);
    expect(t).toContain(`${mm} on\na 9 m radius`);
    expect(t).toContain(`a 48-gon is ${pct} short`);
    expect(t).not.toMatch(/R\/1400|0\.14%/);
  });

  it("src/analyze.ts states the derived area shortfall", () => {
    const t = read("src/analyze.ts");
    expect(t).toContain(`understates the area by ${pct}`);
    expect(t).not.toContain("~0.1%");
  });

  it("src/elements/room.ts states the derived area shortfall", () => {
    const t = read("src/elements/room.ts");
    expect(t).toContain(`(${pct} short)`);
    expect(t).not.toContain("(0.1% short)");
  });
});
