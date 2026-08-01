import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the playground's Vite alias so its tests (and the modules they import)
  // resolve the bare `archlang` specifier to the core — a repo-root
  // node_modules/archlang symlink otherwise points at the vscode extension.
  // Aliased to the SOURCE entry (not dist/) so tests need no prior build (CI
  // runs the suite without `npm run build`) and never see a stale artifact.
  resolve: {
    alias: {
      archlang: resolve(__dirname, "src/index.ts"),
      // The MCP shim (packages/mcp) imports the core by its published name; alias it
      // to the SOURCE entry too so its smoke test runs against src/ with no prior
      // build (CI runs the suite without `npm run build`) — same rationale as above.
      "@chanmeng666/archlang": resolve(__dirname, "src/index.ts"),
    },
  },
  test: {
    include: [
      "test/**/*.test.ts",
      "playground/test/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "editors/vscode/test/**/*.test.ts",
    ],
    environment: "node",
    // Coverage is REPORT-ONLY and deliberately has NO thresholds: it is a map of
    // what the suite reaches, not a gate. Nothing fails on a coverage number, so
    // `npm test` stays the single pass/fail signal and nobody games a percentage.
    // Only opted into via `npm run test:coverage` (CI runs it on one leg), so the
    // ordinary test legs pay none of the instrumentation cost.
    coverage: {
      provider: "v8",
      // `text` for the console, `json-summary` for the machine-readable totals CI
      // turns into a step summary + artifact.
      reporter: ["text", "json-summary"],
      // Measure the CORE only. The harnesses (test/, eval/, dataset/, scripts/,
      // bench/) are the things doing the measuring — counting them as covered
      // code would inflate the number and say nothing about the compiler.
      include: ["src/**"],
      // Rolled-up barrels and type-only modules carry no branches worth reporting.
      exclude: ["src/index.ts", "src/types.ts", "src/**/*.d.ts"],
      all: true,
    },
  },
});
