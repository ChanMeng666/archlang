import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sparesData } from "../src/save-data.js";

describe("sparesData (nothing fetched ahead of a use under Save-Data or 2g, ruling MP-D4)", () => {
  const nav = (connection?: { saveData?: boolean; effectiveType?: string }) => ({ connection }) as unknown as Navigator;
  it("spares data under Save-Data and on 2g, and only then", () => {
    expect(sparesData(nav({ saveData: true, effectiveType: "4g" }))).toBe(true);
    expect(sparesData(nav({ effectiveType: "2g" }))).toBe(true);
    expect(sparesData(nav({ effectiveType: "slow-2g" }))).toBe(true);
    expect(sparesData(nav({ saveData: false, effectiveType: "3g" }))).toBe(false);
    expect(sparesData(nav({ effectiveType: "4g" }))).toBe(false);
    expect(sparesData(nav())).toBe(false);
  });

  it("is the one copy of the rule: main.ts's idle import and the actions' warm-up both call it", () => {
    for (const file of ["main.ts", "actions.ts"]) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      expect(text, `${file} calls sparesData`).toContain("sparesData(navigator)");
      expect(text, `${file} spells no connection rule of its own`).not.toMatch(/effectiveType|saveData\s*===/);
    }
  });
});
