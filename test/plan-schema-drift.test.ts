import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderPlanSchema } from "../scripts/gen-plan-schema.js";

/**
 * Drift guard: `schemas/plan.schema.json` is generated from `PLAN_JSON_SCHEMA`
 * (src/plan-json.ts) by `scripts/gen-plan-schema.ts`. Regenerate it in-memory and
 * compare to the committed bytes, so CI fails if the schema object and the committed
 * file diverge. Run `npx tsx scripts/gen-plan-schema.ts` to refresh.
 */

describe("plan.schema.json drift", () => {
  it("the committed schema matches the generator output", () => {
    const committed = readFileSync("schemas/plan.schema.json", "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(renderPlanSchema());
  });

  it("is valid JSON with the advertised $id", () => {
    const parsed = JSON.parse(readFileSync("schemas/plan.schema.json", "utf8"));
    expect(parsed.$id).toBe("https://archlang.uk/plan.schema.json");
  });
});
