/**
 * Intent's starter brief is the plan on screen's own facts (audit U9): before, every plan was
 * judged against the Laneway House brief ("expected 3, got 22 · total 337.3 m² outside [44, 54]"
 * on Hillside Villa). A brief cut from a plan holds for that plan, and judges another one.
 */
import { readFileSync } from "node:fs";
import { describe as describePlan, intentFromJson, validateIntent } from "archlang";
import { describe, expect, it } from "vitest";
import { briefFromPlan } from "../src/intent-panel.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

const verdict = (source: string, brief: string) => {
  const { intent } = intentFromJson(JSON.parse(brief));
  return validateIntent(source, intent!);
};

describe("briefFromPlan", () => {
  it("is valid intent JSON, with the plan's rooms and an area band around its own", () => {
    const brief = JSON.parse(briefFromPlan(describePlan(example("laneway-house"))));
    expect(brief).toEqual({
      rooms: 3,
      totalAreaM2: { min: 43, max: 54, source: "around 49 m² total" },
      reachable: true,
    });
    expect(intentFromJson(brief).errors).toEqual([]);
  });

  it("counts every storey of a multi-storey plan, so the plan satisfies its own brief", () => {
    const src = example("hillside-villa");
    const r = verdict(src, briefFromPlan(describePlan(src)));
    expect(r.violations.filter((v) => v.gate)).toEqual([]);
  });

  it("judges another plan: Laneway House's brief is not Hillside Villa's", () => {
    const r = verdict(example("hillside-villa"), briefFromPlan(describePlan(example("laneway-house"))));
    expect(r.ok).toBe(false);
  });
});
