import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The package's HEAVY tests (GLB validation, Playwright, pixel baselines, whole-corpus builds):
 * `e2e/*.e2e.ts`, run by the root `npm run check:3d`, never by `npm test` (archlang-3d Q16). The
 * suffix is not `.test.ts`, so `check:test-wiring` and the core suite never see them. Empty
 * until A2; `passWithNoTests` keeps the job green meanwhile.
 */
export default defineConfig({
  resolve: {
    alias: { "@chanmeng666/archlang": resolve(__dirname, "../../src/index.ts") },
  },
  test: {
    include: ["e2e/**/*.e2e.ts"],
    passWithNoTests: true,
    testTimeout: 120_000,
  },
});
