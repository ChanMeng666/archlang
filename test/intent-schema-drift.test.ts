/** intent.schema.json drift. */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
    expect(parsed.$id).toBe("https://archlang.uk/intent.schema.json");
  });

  it("every published schema file carries an $id (GOVERNANCE.md: Compatibility and deprecation)", () => {
    // The list comes from the directories, never typed: a new schema file is checked the day it lands.
    const dirs = ["schemas", "packages/archlang-3d/src/scene3d"];
    const files = dirs.flatMap((d) =>
      readdirSync(d)
        .filter((f) => f.endsWith(".schema.json"))
        .map((f) => `${d}/${f}`),
    );
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      const id = JSON.parse(readFileSync(f, "utf8")).$id;
      expect(typeof id, f).toBe("string");
      expect(id, f).toMatch(/^https:\/\/[^\s/]+\/\S+\.schema\.json$/);
    }
  });
});
