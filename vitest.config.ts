import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the playground's Vite alias so its tests (and the modules they import)
  // resolve the bare `archlang` specifier to the built core — a repo-root
  // node_modules/archlang symlink otherwise points at the vscode extension.
  resolve: {
    alias: {
      archlang: resolve(__dirname, "dist/index.js"),
    },
  },
  test: {
    include: ["test/**/*.test.ts", "playground/test/**/*.test.ts"],
    environment: "node",
  },
});
