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
    include: ["test/**/*.test.ts", "playground/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
