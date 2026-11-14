/** Every published JSON schema file carries a well-formed `$id` (GOVERNANCE.md: Compatibility and deprecation). */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GENERATORS } from "../scripts/generators.js";
import { LINT_RULES_SCHEMA_DRAFT } from "../src/lint/provenance.js";

/** The one hand-written published schema; the rest come from the generator table. */
const SCENE3D_SCHEMA = "packages/archlang-3d/src/scene3d/scene3d.schema.json";

/**
 * `$id` values that predate the policy and keep their form. Anything not listed here must be
 * `https://archlang.uk/schemas/<name>/v<major>.schema.json`.
 */
const LEGACY_IDS: ReadonlyMap<string, string> = new Map([
  ["schemas/plan.schema.json", "https://archlang.uk/plan.schema.json"],
  ["schemas/intent.schema.json", "https://archlang.uk/intent.schema.json"],
  // Until replaced; see card CR11a / the schema-policy design (the placeholder is a separate card).
  [SCENE3D_SCHEMA, "https://example.invalid/archlang-3d/scene3d.schema.json"],
]);

const NEW_ID = /^https:\/\/archlang\.uk\/schemas\/[a-z0-9-]+\/v\d+\.schema\.json$/;

describe("published schema $id", () => {
  // Derived from the generator table, never typed: a schema a generator starts to write is checked at once.
  const files = [...GENERATORS.flatMap((g) => g.artifacts).filter((a) => a.endsWith(".schema.json")), SCENE3D_SCHEMA];

  it("finds the schema files", () => {
    expect(files).toContain("schemas/plan.schema.json");
    expect(files).toContain("schemas/intent.schema.json");
  });

  it("every file carries an $id: a named legacy value, or the versioned form", () => {
    for (const f of files) {
      const id = JSON.parse(readFileSync(f, "utf8")).$id;
      expect(typeof id, f).toBe("string");
      const legacy = LEGACY_IDS.get(f);
      if (legacy !== undefined) expect(id, f).toBe(legacy);
      else expect(id, f).toMatch(NEW_ID);
    }
  });

  // A schema the source holds but publishes as no file yet still names itself in the versioned form
  // (RM1.6b: `lint --rules --json` prints this `$id` in its `schema.id`).
  it("the lint-rules draft, which no generator writes yet, carries the versioned form at v0", () => {
    expect(files.some((f) => f.includes("lint-rules"))).toBe(false);
    expect(LINT_RULES_SCHEMA_DRAFT.$id).toMatch(NEW_ID);
    expect(LINT_RULES_SCHEMA_DRAFT.$id).toBe("https://archlang.uk/schemas/lint-rules/v0.schema.json");
  });

  it("the versioned form accepts a nested path and rejects a flat or foreign one", () => {
    expect(NEW_ID.test("https://archlang.uk/schemas/lint-rules/v0.schema.json")).toBe(true);
    expect(NEW_ID.test("https://archlang.uk/lint-rules.schema.json")).toBe(false);
    expect(NEW_ID.test("https://example.invalid/schemas/x/v1.schema.json")).toBe(false);
  });
});
