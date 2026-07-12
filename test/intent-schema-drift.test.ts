import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderIntentSchema } from "../scripts/gen-intent-schema.js";

/**
 * Drift guard: `schemas/intent.schema.json` is generated from `INTENT_JSON_SCHEMA`
 * (src/intent.ts) by `scripts/gen-intent-schema.ts`. Regenerate it in-memory and
 * compare to the committed bytes, so CI fails if the schema object and the committed
 * file diverge. Run `npx tsx scripts/gen-intent-schema.ts` to refresh.
 */

describe("intent.schema.json drift", () => {
  it("the committed schema matches the generator output", () => {
    const committed = readFileSync("schemas/intent.schema.json", "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(renderIntentSchema());
  });

  it("is valid JSON with the advertised $id", () => {
    const parsed = JSON.parse(readFileSync("schemas/intent.schema.json", "utf8"));
    expect(parsed.$id).toBe("https://archlang-docs.vercel.app/intent.schema.json");
  });
});
