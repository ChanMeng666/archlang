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
  // The core's optional Node-only backends (@resvg/resvg-js, pdfkit, clipper2-wasm)
  // are reached only via lazy `import()`s that never run in the browser. Exclude
  // them from dev dep-prebundling so esbuild doesn't try to load their native
  // `.node`/wasm files (the `build.rollupOptions.external` below covers prod).
  optimizeDeps: { exclude: ["@resvg/resvg-js", "pdfkit", "clipper2-wasm", "archlang"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // Two pages: the full playground (index.html) and the chrome-less embed
      // renderer (embed.html) that third-party pages iframe in.
      input: {
        index: resolve(__dirname, "index.html"),
        embed: resolve(__dirname, "embed.html"),
      },
      // The core's Node-only export backends (PNG via @resvg/resvg-js, PDF via
      // pdfkit, angled-geometry via clipper2-wasm) are reached only through lazy
      // `import()`s that never run in the browser — the playground rasterizes via
      // <canvas> and embeds PDF via jsPDF. Externalize them (and node: builtins)
      // so Rollup doesn't try to bundle native binaries it can't parse.
      external: [/^node:/, "@resvg/resvg-js", "pdfkit", "clipper2-wasm"],
    },
  },
});
