/**
 * Generate `schemas/intent.schema.json` from the single source of truth
 * (`INTENT_JSON_SCHEMA` in `src/intent.ts`). Run with `npx tsx scripts/gen-intent-schema.ts`.
 *
 * The committed file is what tools and LLMs fetch at
 * https://archlang.uk/intent.schema.json; a vitest drift test
 * (`test/intent-schema-drift.test.ts`) regenerates it in-memory and compares, so CI
 * fails if the schema object and the committed JSON diverge.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INTENT_JSON_SCHEMA } from "../src/intent.js";

/** The exact bytes the drift test compares against (2-space indent + trailing newline). */
export function renderIntentSchema(): string {
  return `${JSON.stringify(INTENT_JSON_SCHEMA, null, 2)}\n`;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "..", "schemas", "intent.schema.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderIntentSchema());
  // eslint-disable-next-line no-console
  console.log(`wrote ${out}`);
}

// Only write when run directly (the drift test imports `renderIntentSchema`).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-intent-schema.ts")) {
  main();
}
