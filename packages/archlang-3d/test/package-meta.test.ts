/**
 * The manifest's promises, without a build. The package's stated core floor (card A9): `MIN_CORE`,
 * which the adapter's refusal names, is the `peerDependencies` floor, so the message and the
 * install-time range never disagree. And the publish shape: everything a consumer resolves names a
 * `dist/` file a tsup entry writes, nothing published names `src/`, and every runtime dependency is
 * pinned exactly. That the built tree really holds these files is `e2e/pack.e2e.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_CORE } from "../src/index.js";
import { PREVIEW_LABEL, PREVIEW_LIMITS } from "../src/replay/payload.js";

interface Conditions {
  types: string;
  import: string;
}
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  private?: boolean;
  main: string;
  module: string;
  types: string;
  exports: Record<string, Conditions>;
  bin: Record<string, string>;
  files: string[];
  scripts: Record<string, string>;
  publishConfig: Record<string, unknown>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const tsup = readFileSync(new URL("../tsup.config.ts", import.meta.url), "utf8");
// The entry object as JSON: its keys quoted, and the trailing comma Biome writes on a broken line dropped.
const entryObject = (/entry: (\{[^}]*\}),\n\s*format/.exec(tsup)?.[1] ?? "{}")
  .replace(/(\w+):/g, '"$1":')
  .replace(/,(\s*\})$/, "$1");
const entries = Object.keys(JSON.parse(entryObject) as Record<string, string>);

describe("package metadata", () => {
  it("MIN_CORE is the peer range's floor", () => {
    expect(pkg.peerDependencies["@chanmeng666/archlang"]).toBe(`^${MIN_CORE}`);
  });

  it("is publishable, public, and leaves provenance to the workflow", () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig.access).toBe("public");
    // `provenance: true` here would make the owner's hand publish of a new package fail: a laptop
    // is not a supported provenance provider. `release.yml` passes `--provenance` on the command.
    expect(pkg.publishConfig.provenance).toBeUndefined();
  });

  it("every published path is under dist/, from a tsup entry, with types", () => {
    expect(entries).toEqual(["index", "browser", "glb", "node", "cli"]);
    const built = (name: string) => `./dist/${name}.js`;
    expect(pkg.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: built("index") },
      "./browser": { types: "./dist/browser.d.ts", import: built("browser") },
      "./glb": { types: "./dist/glb.d.ts", import: built("glb") },
      "./node": { types: "./dist/node.d.ts", import: built("node") },
    });
    expect([pkg.main, pkg.module]).toEqual([built("index"), built("index")]);
    expect(pkg.types).toBe("./dist/index.d.ts");
    expect(pkg.bin).toEqual({ archlang3d: "dist/cli.js" });
  });

  it("nothing published names src/, and a pack builds first", () => {
    const published = JSON.stringify([pkg.main, pkg.module, pkg.types, pkg.exports, pkg.bin, pkg.files]);
    expect(published).not.toMatch(/src|\.ts"(?<!\.d\.ts")/);
    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE", "THIRD_PARTY_NOTICES", "CHANGELOG.md"]);
    expect(pkg.scripts.prepack).toBe("npm run build");
  });

  // Geometry (earcut) and the replay (three.js) must not move under a published version: the README
  // promises the same bytes for the same plan and versions. property-graph, under
  // @gltf-transform/core, floats and cannot be pinned from here.
  it("every runtime dependency is pinned exactly", () => {
    expect(pkg.dependencies.three).toBeDefined();
    expect(pkg.dependencies.earcut).toBeDefined();
    const loose = Object.entries(pkg.dependencies).filter(([, v]) => !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v));
    expect(loose).toEqual([]);
  });

  // Card CG19: only the browser paths (`view`'s key frames and video, `doctor`) load playwright-core
  // (14 MB), so a consumer never installs it unasked: an optional peer, with a floor that the
  // Playwright API the package calls (launch, newPage, goto, evaluate, locator, screenshot) has long
  // met. The repository tests with an exact devDependency (the key-frame baseline's Chromium
  // follows it), which must satisfy the peer range.
  it("playwright-core is an optional peer, not a dependency, and the tested pin satisfies it", () => {
    expect(pkg.dependencies["playwright-core"]).toBeUndefined();
    expect(pkg.peerDependenciesMeta).toEqual({ "playwright-core": { optional: true } });
    const tuple = (v: string): number[] => v.split(".").map(Number);
    const floor = /^>=(\d+\.\d+\.\d+)$/.exec(pkg.peerDependencies["playwright-core"] ?? "")?.[1];
    expect(floor, "the peer range is a plain >= floor").toBeDefined();
    const tested = pkg.devDependencies["playwright-core"] ?? "";
    expect(tested).toMatch(/^\d+\.\d+\.\d+$/);
    const [a, b] = [tuple(tested), tuple(floor ?? "")];
    const cmp = a.map((x, i) => x - (b[i] ?? 0)).find((d) => d !== 0) ?? 0;
    expect(cmp, `the tested ${tested} is below the peer floor ${floor}`).toBeGreaterThanOrEqual(0);
  });

  // One door to playwright-core: every runtime import goes through `src/replay/chromium.ts`, whose
  // missing-package message the CLI relies on. A type-only import is erased and loads nothing.
  it("only src/replay/chromium.ts imports playwright-core at run time", () => {
    const files: URL[] = [];
    const walk = (at: URL): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, at));
        else if (/\.m?ts$/.test(entry.name)) files.push(new URL(entry.name, at));
      }
    };
    const src = new URL("../src/", import.meta.url);
    walk(src);
    const importers = files
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        // Biome's layout: double quotes, one space; a dynamic, a static value or a bare import.
        return (
          text.includes('import("playwright-core")') ||
          /^import (?!type )[^;]*from "playwright-core"/m.test(text) ||
          /^import "playwright-core"/m.test(text)
        );
      })
      .map((f) => f.href.slice(src.href.length));
    expect(importers).toEqual(["replay/chromium.ts"]);
  });

  // Hoisting from the root manifest once hid an undeclared `pngjs` in the asset generator,
  // so an isolated install of this workspace would have failed. Every package imported from src/
  // or scripts/ is declared here, in one of the three dependency lists.
  it("every package src/ and scripts/ import is declared by this package", () => {
    const declared = new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies),
      ...Object.keys(pkg.peerDependencies),
    ]);
    const imported = new Set<string>();
    for (const dir of ["src", "scripts"]) {
      // A hand walk: `readdirSync`'s `recursive` is newer than CI's Node 18 leg.
      const files: URL[] = [];
      const walk = (at: URL): void => {
        for (const entry of readdirSync(at, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(new URL(`${entry.name}/`, at));
          else if (/\.m?ts$/.test(entry.name)) files.push(new URL(entry.name, at));
        }
      };
      walk(new URL(`../${dir}/`, import.meta.url));
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/(?:\bfrom |\bimport\()"((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)[^"]*"/g)) {
          imported.add(m[1] as string);
        }
      }
    }
    expect(imported).toContain("pngjs");
    expect([...imported].filter((name) => name !== "node" && !declared.has(name))).toEqual([]);
    expect(pkg.devDependencies.pngjs).toBeDefined();
    expect(pkg.devDependencies["@types/pngjs"]).toBeDefined();
  });

  it("the playground takes whatever version the workspace holds, so a bump never breaks npm ci", () => {
    const playground = JSON.parse(
      readFileSync(new URL("../../../playground/package.json", import.meta.url), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(playground.dependencies["@chanmeng666/archlang-3d"]).toBe("*");
  });

  // D5, then PS-D12 (public-surfaces card X1): the words the npm page may use. The README says what
  // the package does and claims no more, with the line every surface uses and the limits line.
  it("the README keeps to the product's words", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("3D preview");
    expect(readme).toContain("a separate package that reads the same\n`.arch` source and is checked against the plan");
    const prose = readme.replace(/\s+/g, " ");
    expect(prose).toContain(PREVIEW_LABEL);
    expect(prose).toContain(PREVIEW_LIMITS);
    const banned =
      /\b(first|only|CDN|IFC|measur\w*|buildab\w*|structur\w*|accura\w*|to scale|code.?compliant)\b|AI architect/gi;
    expect(readme.match(banned) ?? []).toEqual([]);
  });
});
