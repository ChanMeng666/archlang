import { copyFileSync, mkdirSync } from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  // `src/cli/link.ts` is the Node-only `@chanmeng666/archlang/link` subpath (it uses zlib), so
  // the MCP shim mints the same share links as `archlang link`; the main entry stays browser-safe.
  // `src/cli/review.ts` (`arch preview --review`'s sheet, pure and browser-safe) is built as its
  // own file, `dist/cli/review.js`, for the playground's Checks overlay, which draws the same
  // review rings from the same function. It is not a package export: no `exports` entry names it,
  // and it gets no declaration file (one would split the shared types out of `index.d.ts`); the
  // playground reads its types from the source.
  entry: ["src/index.ts", "src/cli.ts", "src/cli/link.ts", "src/cli/review.ts"],
  format: ["esm"],
  dts: { entry: ["src/index.ts", "src/cli.ts", "src/cli/link.ts"] },
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Optional export-backend deps are lazy-imported; never bundle them so the
  // core build stays self-contained and they remain truly optional.
  external: ["pdfkit", "clipper2-wasm", "@resvg/resvg-js", "@chanmeng666/archlang-font-cjk"],
  // CLI needs a shebang; library entry stays clean.
  banner: ({ format }) => (format === "esm" ? {} : {}),
  // Ship the PNG backend's bundled font next to the emitted chunks so
  // `backends/png.ts` can resolve `./assets/Roboto-Regular.ttf` at runtime. The
  // font is read lazily (only when rendering PNG), so it stays out of the JS bundle.
  onSuccess: async () => {
    mkdirSync("dist/assets", { recursive: true });
    copyFileSync("assets/fonts/Roboto-Regular.ttf", "dist/assets/Roboto-Regular.ttf");
  },
});
