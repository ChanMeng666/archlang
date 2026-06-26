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
    rollupOptions: {
      // The core's Node-only export backends (PNG via @resvg/resvg-js, PDF via
      // pdfkit, angled-geometry via clipper2-wasm) are reached only through lazy
      // `import()`s that never run in the browser — the playground rasterizes via
      // <canvas> and embeds PDF via jsPDF. Externalize them (and node: builtins)
      // so Rollup doesn't try to bundle native binaries it can't parse.
      external: [/^node:/, "@resvg/resvg-js", "pdfkit", "clipper2-wasm"],
    },
  },
});
