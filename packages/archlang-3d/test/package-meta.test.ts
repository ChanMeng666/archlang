/**
 * The manifest's promises, without a build. The package's stated core floor (card A9): `MIN_CORE`,
 * which the adapter's refusal names, is the `peerDependencies` floor, so the message and the
 * install-time range never disagree. And the publish shape: everything a consumer resolves names a
 * `dist/` file a tsup entry writes, nothing published names `src/`, and every runtime dependency is
 * pinned exactly. That the built tree really holds these files is `e2e/pack.e2e.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_CORE } from "../src/index.js";

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
  dependencies: Record<string, string>;
};
const tsup = readFileSync(new URL("../tsup.config.ts", import.meta.url), "utf8");
const entries = Object.keys(
  JSON.parse((/entry: (\{[^}]*\}),\n\s*format/.exec(tsup)?.[1] ?? "{}").replace(/(\w+):/g, '"$1":')) as Record<
    string,
    string
  >,
);

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
    expect(entries).toEqual(["index", "browser", "node", "cli"]);
    const built = (name: string) => `./dist/${name}.js`;
    expect(pkg.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: built("index") },
      "./browser": { types: "./dist/browser.d.ts", import: built("browser") },
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

  it("the playground takes whatever version the workspace holds, so a bump never breaks npm ci", () => {
    const playground = JSON.parse(
      readFileSync(new URL("../../../playground/package.json", import.meta.url), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(playground.dependencies["@chanmeng666/archlang-3d"]).toBe("*");
  });

  // D5: the words the npm page may use. The README says what the package does and claims no more.
  it("the README keeps to the product's words", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("3D preview");
    expect(readme).toContain("a separate package that reads the same\n`.arch` source and is checked against the plan");
    const banned =
      /\b(first|only|CDN|IFC|measur\w*|buildab\w*|structur\w*|accura\w*|to scale|code.?compliant)\b|AI architect/gi;
    expect(readme.match(banned) ?? []).toEqual([]);
  });
});
