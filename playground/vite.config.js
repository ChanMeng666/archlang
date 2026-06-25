import { defineConfig } from "vite";
import { resolve } from "node:path";

// The playground consumes the *built* core (run `npm run build` in the repo
// root first). Aliasing to dist/ keeps the published core import path honest
// and avoids re-resolving the source's `.js` ESM specifiers.
export default defineConfig({
  root: __dirname,
  base: "./",
  resolve: {
    alias: {
      archlang: resolve(__dirname, "../dist/index.js"),
    },
  },
  server: {
    fs: { allow: [resolve(__dirname, "..")] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
