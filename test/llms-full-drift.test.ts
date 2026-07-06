/**
 * Drift guard for `llms-full.txt` (the bundled full agent context).
 *
 * `scripts/gen-llms-full.ts` generates it from the language spec, the agent
 * skill, the capability manifest, and the error catalog. This test regenerates it
 * in-memory from those live sources and asserts the committed file matches — the
 * CI equivalent of `npm run gen:llms && git diff --exit-code`. If it fails, run
 * `npm run gen:llms` and commit.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLlmsFull } from "../scripts/gen-llms-full.js";
import { ERROR_CATALOG, ERROR_CODES } from "../src/error-catalog.js";
import { buildManifest } from "../src/manifest.js";

function regenerate(): string {
  const version = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version ?? "0.0.0";
  return renderLlmsFull({
    spec: readFileSync(resolve("spec.llm.md"), "utf8"),
    skill: readFileSync(resolve("SKILL.md"), "utf8"),
    manifest: buildManifest(version),
    errorCatalog: ERROR_CATALOG,
    errorCodes: ERROR_CODES,
  });
}

describe("llms-full.txt is in sync with its sources", () => {
  it("has no drift", () => {
    const committed = readFileSync("llms-full.txt", "utf8").replace(/\r\n/g, "\n");
    expect(regenerate()).toBe(committed);
  });

  it("bundles every section (spec, workflow, CLI, catalog)", () => {
    const full = regenerate();
    expect(full).toContain("## 1. Language spec");
    expect(full).toContain("## 2. Agent workflow");
    expect(full).toContain("## 3. CLI reference");
    expect(full).toContain("## 4. Diagnostic catalog");
  });

  it("documents every error code", () => {
    const full = regenerate();
    for (const code of ERROR_CODES) expect(full).toContain(`\`${code}\``);
  });
});
