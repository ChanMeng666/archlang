import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // CLI needs a shebang; library entry stays clean.
  banner: ({ format }) => (format === "esm" ? {} : {}),
});
