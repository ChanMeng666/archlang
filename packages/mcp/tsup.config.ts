import { defineConfig } from "tsup";

// Bundle just the thin server entry. The MCP SDK, zod, and the ArchLang core are
// runtime `dependencies`, so tsup leaves them external (resolved from node_modules)
// — the core is never re-bundled, keeping this shim a shim. `dist/` also receives
// the four resource files via scripts/copy-resources.mjs (run after the build).
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "es2022",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
