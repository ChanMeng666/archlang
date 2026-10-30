import { copyFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";
import { bundleViewer } from "./src/replay/viewer-bundle.js";

/**
 * The published `dist/`. Every entry lands flat in `dist/`, chunks included, so a module's
 * `import.meta.url` means the same directory wherever the bundler puts it.
 *
 * `onSuccess` writes the two files the modules read beside them:
 *   - `viewer.iife.js`: the replay's browser script with three.js inlined, bundled here, once, from
 *     the exact `three` the lockfile pins. A consumer runs this script and never a bundler, so
 *     `esbuild` is a devDependency and the replay HTML a user writes holds the bytes `check:3d` tested.
 *   - `scene3d.schema.json`: what `archlang3d schema scene3d` prints, byte for byte.
 *
 * `__ARCHLANG3D_BUILT__` is true only in here: the source-tree paths in `replay/html.ts` and
 * `cli/commands.ts` (esbuild on `viewer.ts`, `../scene3d/`) fold away, so `dist/` cannot reach them.
 */
export default defineConfig({
  entry: { index: "src/index.ts", browser: "src/browser.ts", node: "src/node.ts", cli: "src/cli/main.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "node",
  // Keep the `node:` specifiers the source wrote.
  removeNodeProtocol: false,
  clean: true,
  // No source maps: a map would carry the `src/` tree into the tarball.
  sourcemap: false,
  dts: { entry: { index: "src/index.ts", browser: "src/browser.ts", node: "src/node.ts" } },
  define: { __ARCHLANG3D_BUILT__: "true" },
  onSuccess: async () => {
    writeFileSync("dist/viewer.iife.js", await bundleViewer("src/replay/viewer.ts"));
    copyFileSync("src/scene3d/scene3d.schema.json", "dist/scene3d.schema.json");
  },
});
