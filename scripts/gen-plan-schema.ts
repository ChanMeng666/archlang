/**
 * Generate `schemas/plan.schema.json` from the single source of truth
 * (`PLAN_JSON_SCHEMA` in `src/plan-json.ts`). Run with `npx tsx scripts/gen-plan-schema.ts`.
 *
 * The committed file is what tools and LLMs fetch at
 * https://archlang.uk/plan.schema.json; a vitest drift test
 * (`test/plan-schema-drift.test.ts`) regenerates it in-memory and compares, so CI
 * fails if the schema object and the committed JSON diverge.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_JSON_SCHEMA } from "../src/plan-json.js";

/** The exact bytes the drift test compares against (2-space indent + trailing newline). */
export function renderPlanSchema(): string {
  return `${JSON.stringify(PLAN_JSON_SCHEMA, null, 2)}\n`;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "..", "schemas", "plan.schema.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPlanSchema());
  // eslint-disable-next-line no-console
  console.log(`wrote ${out}`);
}

// Only write when run directly (the drift test imports `renderPlanSchema`).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-plan-schema.ts")) {
  main();
}
