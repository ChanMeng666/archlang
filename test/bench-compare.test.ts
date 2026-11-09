import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs CI script with no type declarations.
import { compareRuns, median, MIN_BASE_MS, parseArgs, render, stageClass, THRESHOLD_PCT } from "../bench/compare.mjs";

const run = (v: Record<string, number>) => ({ P: v });
const stageOf = (x: { stage: string }) => x.stage;

describe("bench/compare.mjs", () => {
  it("takes the median per row and the ratio head/base", () => {
    expect(median([1, 3])).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
    const r = compareRuns([run({ compile: 10 }), run({ compile: 20 })], [run({ compile: 30 }), run({ compile: 30 })]);
    expect(r.rows[0]).toMatchObject({ base: 15, head: 30, ratio: 2, flagged: true });
    expect(r.rows[0]?.deltaPct).toBeCloseTo(100);
  });

  it("flags only rows with base above the floor and |delta| above the threshold", () => {
    const r = compareRuns(
      [run({ big: 100, small: 1, steady: 100, faster: 100 })],
      [run({ big: 160, small: 9, steady: 140, faster: 30 })],
    );
    // big is +60 %, faster is -70 %; small is under MIN_BASE_MS; steady is +40 %
    expect(r.flagged.map(stageOf).sort()).toEqual(["big", "faster"]);
    expect(MIN_BASE_MS).toBe(5);
    expect(THRESHOLD_PCT).toBe(50);
  });

  it("reports the noise floor as the spread between the base runs", () => {
    const r = compareRuns([run({ a: 100, b: 2 }), run({ a: 120, b: 4 })], [run({ a: 110, b: 5 })]);
    expect(r.noiseFloor).toBeCloseTo(20); // b's median is under the floor, so its spread is not counted
  });

  it("keeps a row the base lacks, unflagged, without a ratio", () => {
    const r = compareRuns([run({ a: 100 })], [run({ a: 100, fresh: 400 })]);
    expect(r.rows.find((x: { stage: string }) => x.stage === "fresh")).toMatchObject({
      base: null,
      ratio: null,
      flagged: false,
    });
  });

  it("shows a row only the base has as removed, with no ratio and no flag", () => {
    const r = compareRuns([run({ a: 100, gone: 400 })], [run({ a: 100 })]);
    const gone = r.rows.find((x: { stage: string }) => x.stage === "gone");
    expect(gone).toMatchObject({ base: 400, head: null, ratio: null, flagged: false, removed: true });
    expect(r.flagged).toEqual([]);
    expect(render(r)).toContain("| P | gone | 400.00 | - | - | removed |");
  });

  it("does not flag a row whose base is exactly the floor, however far it moves", () => {
    const r = compareRuns([run({ edge: 5, above: 5.01 })], [run({ edge: 50, above: 50 })]);
    expect(r.flagged.map(stageOf)).toEqual(["above"]);
  });

  it("reports lint rows as their own class", () => {
    expect(stageClass("lint")).toBe("lint");
    expect(stageClass("compile")).toBe("pipeline");
    expect(stageClass("describe")).toBe("analysis");
    const md = render(
      compareRuns([run({ compile: 10, lint: 10, describe: 10 })], [run({ compile: 10, lint: 10, describe: 10 })]),
    );
    const at = (t: string) => md.indexOf(t);
    expect(at("**Pipeline stages**")).toBeGreaterThan(-1);
    expect(at("**Pipeline stages**")).toBeLessThan(at("**Lint**"));
    expect(at("| P | lint |")).toBeGreaterThan(at("**Lint**"));
    expect(at("| P | lint |")).toBeLessThan(at("**Other analysis"));
    expect(md).toContain("nothing is built");
  });

  it("renders the honest header, the noise line and the work-counts pointer", () => {
    const md = render(compareRuns([run({ a: 100 }), run({ a: 110 })], [run({ a: 105 }), run({ a: 105 })]));
    expect(md).toContain("<!-- archlang-bench -->");
    expect(md).toContain("Noise floor");
    expect(md).toContain("test/work-counts.test.ts");
    expect(md).toContain("| P | a | 105.00 | 105.00 | 1.00x | +0% |");
  });

  it("parses the argument groups", () => {
    expect(parseArgs(["--base", "a", "b", "--head", "c", "d", "--out", "o.md"])).toEqual({
      base: ["a", "b"],
      head: ["c", "d"],
      out: "o.md",
    });
  });
});
