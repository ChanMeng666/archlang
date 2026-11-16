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
 * glTF-Transform (`@gltf-transform/core` and its one dependency, `property-graph`) is inlined, not left
 * to the consumer's bundler: its `NodeIO`, which `writeGlb` never uses, loads `node:fs` and
 * `node:path` by a lazy `import()` that webpack refuses for a browser target (and esbuild cannot
 * resolve there), so it is shaken out here, once, and `dist/glb.js`'s graph names no `node:` module
 * (`e2e/pack.e2e.ts`, `test/browser-safety.test.ts`). Only `glb/write.ts` imports it, so the code
 * lands in a chunk `./glb`, `./node` and the CLI share, one copy.
 *
 * `__ARCHLANG3D_BUILT__` is true only in here: the source-tree paths in `replay/html.ts` and
 * `cli/commands.ts` (esbuild on `viewer.ts`, `../scene3d/`) fold away, so `dist/` cannot reach them.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    browser: "src/browser.ts",
    glb: "src/glb.ts",
    node: "src/node.ts",
    cli: "src/cli/main.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "node",
  noExternal: ["@gltf-transform/core", "property-graph"],
  // Keep the `node:` specifiers the source wrote.
  removeNodeProtocol: false,
  clean: true,
  // No source maps: a map would carry the `src/` tree into the tarball.
  sourcemap: false,
  // `replay.d.ts` holds the types `./node` shares with `./browser`, so `./node` never reads a DOM name.
  dts: {
    entry: {
      index: "src/index.ts",
      browser: "src/browser.ts",
      glb: "src/glb.ts",
      node: "src/node.ts",
      replay: "src/replay/payload.ts",
    },
  },
  define: { __ARCHLANG3D_BUILT__: "true" },
  onSuccess: async () => {
    writeFileSync("dist/viewer.iife.js", await bundleViewer("src/replay/viewer.ts"));
    copyFileSync("src/scene3d/scene3d.schema.json", "dist/scene3d.schema.json");
  },
});
