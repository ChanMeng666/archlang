/**
 * The adapter and Scene3D run in a browser (the playground preview reads them later): bundled for
 * `platform: "browser"` with the core INSIDE, the bundle builds, and it carries no static `node:`
 * import, no `process`, no clock and no randomness.
 *
 * Externals: only the core's optional Node-only backends (PDF, PNG, the CJK font), which it reaches
 * by a lazy `import()` that never runs in a browser. The list is the one the core's own standalone
 * browser build uses (`NODE_ONLY` in `packages/web-component/scripts/build.ts`), read from there,
 * and the test proves each is reached only dynamically.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { REPO } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `NODE_ONLY` from the web component's build script: the core's lazy Node-only imports. */
function nodeOnly(): string[] {
  const script = readFileSync(join(REPO, "packages/web-component/scripts/build.ts"), "utf8");
  const body = /const NODE_ONLY = \[([^\]]*)\]/.exec(script)?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

describe("browser safety", () => {
  it("bundles adapter + Scene3D for the browser with no Node, clock or randomness", async () => {
    const external = nodeOnly();
    expect(external).toContain("node:*");
    expect(external.length).toBeGreaterThan(3);
    const out = await build({
      entryPoints: [join(HERE, "../src/index.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      external,
      // Comments out, so the scan reads code: the core's own comments say "never `Math.random()`".
      minifyWhitespace: true,
      legalComments: "none",
      // Read the core through its source entry, as the package's tests do.
      alias: { "@chanmeng666/archlang": join(REPO, "src/index.ts") },
    });
    expect(out.errors).toEqual([]);
    const code = out.outputFiles?.[0]?.text ?? "";
    expect(code.length).toBeGreaterThan(100_000); // the core is inside: nothing was left external
    const banned: Array<[RegExp, string]> = [
      [/\bfrom\s*["']node:/, "a static node: import"],
      [/\brequire\(\s*["']node:/, "a node: require"],
      [/\bprocess\.(env|argv|cwd|exit|platform)\b/, "process"],
      [/\bDate\.now\s*\(/, "Date.now()"],
      [/\bnew\s+Date\s*\(/, "new Date()"],
      [/\bperformance\.now\s*\(/, "performance.now()"],
      [/\bMath\.random\s*\(/, "Math.random()"],
    ];
    const hits = banned.filter(([re]) => re.test(code)).map(([, why]) => why);
    expect(hits).toEqual([]);
    // Each external the bundle still names is reached only through a dynamic import().
    const statics = external
      .filter((e) => !e.includes("*"))
      .filter((e) => new RegExp(`(from|import)\\s*["']${e.replace(/[/.]/g, "\\$&")}["']`).test(code));
    expect(statics).toEqual([]);
  }, 60_000);
});
