/**
 * What `npm pack` really sends (Phase 4; `npm run check:3d`). This runs the package's build, as
 * `prepack` does on a publish: every path the manifest publishes exists in the tarball, nothing from `src/`,
 * `test/` or `e2e/` rides along, and the built tree does what the source tree does:
 *   - `dist/viewer.iife.js` is, byte for byte, what `viewerScript()` bundles from source, so the
 *     replay the key-frame baseline tests is the one a consumer gets;
 *   - no module of the browser entries' graph imports a Node builtin;
 *   - `dist/` never imports esbuild, a devDependency.
 * The tarball installed into an empty project is `scripts/prove-pack.ts` (needs the registry).
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { viewerScript } from "../src/node.js";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
  exports: Record<string, { types: string; import: string }>;
  bin: Record<string, string>;
};
const dist = (f: string): string => readFileSync(join(PKG, "dist", f), "utf8");

describe("npm pack (what the first publish would send)", () => {
  // Built apart from the pack: `prepack`'s output would land in the JSON on stdout.
  execSync("npm run build", { cwd: PKG, stdio: "ignore" });
  const out = execSync("npm pack --dry-run --ignore-scripts --json", {
    cwd: PKG,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const files = (JSON.parse(out) as Array<{ files: Array<{ path: string }> }>)[0]?.files.map((f) => f.path) ?? [];

  it("carries every exported file, the bin and the notices", () => {
    const published = Object.values(pkg.exports).flatMap((e) => [e.types, e.import]);
    for (const f of [
      ...published.map((p) => p.replace(/^\.\//, "")),
      ...Object.values(pkg.bin),
      "dist/viewer.iife.js",
      "dist/scene3d.schema.json",
      "package.json",
      "LICENSE",
      "README.md",
      "CHANGELOG.md",
      "THIRD_PARTY_NOTICES",
    ]) {
      expect(files, f).toContain(f);
    }
  });

  it("carries nothing else: no source, test, script, map or binary", () => {
    const shipped = (f: string) =>
      /^(package\.json|LICENSE|README\.md|CHANGELOG\.md|THIRD_PARTY_NOTICES)$/.test(f) ||
      /^dist\/[\w.-]+\.(js|d\.ts|json)$/.test(f);
    expect(files.filter((f) => !shipped(f))).toEqual([]);
    // Plan §8.5 L2: no binary of a GPL program rides along (Blender, IfcOpenShell are external processes).
    expect(files.filter((f) => /\.(exe|dll|so|dylib|wasm|node)$/.test(f))).toEqual([]);
  });

  it("the shipped viewer is what the source bundles, with the pinned three.js inside", async () => {
    const shipped = dist("viewer.iife.js");
    expect(shipped).toBe(await viewerScript());
    expect(shipped).toContain("WebGLRenderer");
    // three.js's REVISION: the minor of the exact pin, which the bundle cannot have lost.
    const pin = (JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { dependencies: { three: string } })
      .dependencies.three;
    expect(shipped).toContain(`"${pin.split(".")[1]}"`);
    expect(shipped).not.toMatch(/\b(unpkg\.com|jsdelivr|cdnjs|esm\.sh|skypack)\b/i);
  });

  it("dist/ never imports esbuild, and the browser entries reach no Node builtin", () => {
    const modules = readdirSync(join(PKG, "dist")).filter((f) => f.endsWith(".js") && f !== "viewer.iife.js");
    const imports = (f: string) =>
      [...dist(f).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1] as string);
    for (const f of modules) expect(imports(f), f).not.toContain("esbuild");
    expect(modules.filter((f) => f.includes("viewer-bundle"))).toEqual([]); // bundled in, it imports nothing
    const seen = new Set<string>();
    const walk = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const i of imports(f)) if (i.startsWith("./")) walk(i.slice(2));
    };
    walk("index.js");
    walk("browser.js");
    expect(seen.size).toBeGreaterThan(2);
    // Either spelling: tsup strips `node:` unless told otherwise.
    const builtin = (i: string) => i.startsWith("node:") || builtinModules.includes(i);
    expect([...seen].flatMap((f) => imports(f).filter(builtin))).toEqual([]);
  });
});
