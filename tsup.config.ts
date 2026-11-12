import { copyFileSync, mkdirSync } from "node:fs";
import { build, defineConfig } from "tsup";

export default defineConfig({
  // `src/cli/link.ts` is the Node-only `@chanmeng666/archlang/link` subpath (it uses zlib), so
  // the MCP shim mints the same share links as `archlang link`; the main entry stays browser-safe.
  // `src/cli/review.ts` (`arch preview --review`'s sheet, pure and browser-safe) is built as its
  // own file, `dist/cli/review.js`, for the playground's Checks overlay, which draws the same
  // review rings from the same function. It is not a package export: no `exports` entry names it,
  // and it gets no declaration file (one would split the shared types out of `index.d.ts`); the
  // playground reads its types from the source.
  // `src/share.ts` is the browser-safe `@chanmeng666/archlang/share` subpath (the share-link
  // decoder, caps and id shape, no encoder), `dist/share.js` + `dist/share.d.ts`. Its web codec
  // lands in a small chunk that `dist/share.js`, `dist/cli/link.js` and `dist/cli.js` share (the
  // Node encoder imports the edit flag from it); `dist/index.js` imports none of it, so it stays
  // out of the compiler chunk the playground splits off.
  entry: ["src/index.ts", "src/cli.ts", "src/cli/link.ts", "src/cli/review.ts", "src/share.ts"],
  format: ["esm"],
  dts: { entry: ["src/index.ts", "src/cli.ts", "src/cli/link.ts", "src/share.ts"] },
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
    // `dist/error-catalog.js`: the diagnostic catalogue (`src/error-catalog.ts`) in one file of its
    // own, for the playground's edit-mode diagnostics panel (card RM0.7), so its messages, causes and
    // examples load there and not with the compiler chunk. A second build, after the first, with no
    // splitting: as a fourth entry of the build above it would split the shared chunk `dist/index.js`
    // imports in two (the catalogue and what it reads, ~460 KB, against everything else), and the
    // playground's `compiler` group, which captures what `index.js` imports, would take it back. Not a
    // package export (no `exports` entry, no declaration file), like `dist/cli/review.js`.
    await build({
      config: false,
      entry: { "error-catalog": "src/error-catalog.ts" },
      format: ["esm"],
      splitting: false,
      clean: false,
      dts: false,
      sourcemap: true,
      target: "es2022",
      outDir: "dist",
      silent: true,
    });
  },
});
