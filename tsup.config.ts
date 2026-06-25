import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Optional export-backend deps are lazy-imported; never bundle them so the
  // core build stays self-contained and they remain truly optional.
  external: ["pdfkit", "clipper2-wasm"],
  // CLI needs a shebang; library entry stays clean.
  banner: ({ format }) => (format === "esm" ? {} : {}),
});
