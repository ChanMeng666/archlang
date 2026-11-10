/**
 * Boundary: 3D lives only in `packages/archlang-3d`, never a core dependency (AGENTS.md hard rules).
 * The rule was prose and comments; this scans `src/` so a stray import goes red. Any import/export
 * specifier (static, `export ... from`, dynamic `import(`, `require(`) naming `archlang-3d` or
 * `three` (a `three/...` subpath, `three-*` such as three-stdlib or three-mesh-bvh, `@types/three`) fails, as does a
 * `/// <reference types="three" />` directive. Reports file:line. Specifiers come from the TypeScript-AST
 * walk in `helpers/imports.ts`, so comments and string contents are never mistaken for code.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importRefs } from "./helpers/imports.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN =
  /^(?:(?:@[\w-]+\/archlang-3d|archlang-3d|@types\/three|three(?:-[\w-]+)?)(?:\/.*)?|(?:\.\.?\/)+(?:[\w.-]+\/)*packages\/archlang-3d(?:\/.*)?)$/;
const SOURCE = /\.(?:ts|mts|cts|mjs|cjs|js)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SOURCE.test(name)) out.push(p);
  }
  return out;
}

/** Every specifier a source text names (the shared AST walk: type-only and `/// <reference>` included), with its line. */
function specifiersOf(raw: string, file = "x.ts"): { spec: string; line: number }[] {
  return importRefs(file, raw);
}

function offences(file: string): string[] {
  const where = relative(ROOT, file).split(sep).join("/");
  return specifiersOf(readFileSync(file, "utf8"), file)
    .filter((s) => FORBIDDEN.test(s.spec))
    .map((s) => `${where}:${s.line} imports "${s.spec}"`);
}

describe("the core never imports 3D", () => {
  it("scans a non-empty src/", () => {
    expect(walk(join(ROOT, "src")).length).toBeGreaterThan(100);
  });

  it("no src/ import or export specifier names archlang-3d or three", () => {
    const bad = walk(join(ROOT, "src")).flatMap(offences);
    expect(bad, `3D must stay out of the core (AGENTS.md hard rules):\n${bad.join("\n")}`).toEqual([]);
  });

  it("the root package.json has no dependency on archlang-3d or three", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
    const bad: string[] = [];
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys((pkg[field] as Record<string, string>) ?? {})) {
        if (FORBIDDEN.test(name)) bad.push(`package.json ${field}.${name}`);
      }
    }
    expect(bad, `the core takes no 3D dependency:\n${bad.join("\n")}`).toEqual([]);
  });

  it("the detector recognises the specifier forms it guards", () => {
    const hit = (s: string) => specifiersOf(s).some((x) => FORBIDDEN.test(x.spec));
    expect(hit(`import * as T from "three";`)).toBe(true);
    expect(hit(`import("three/examples/jsm/x.js")`)).toBe(true);
    expect(hit(`export { a } from "@chanmeng666/archlang-3d";`)).toBe(true);
    expect(hit(`import "three";`)).toBe(true);
    expect(hit(`import { x } from "three-stdlib";`)).toBe(true);
    expect(hit(`import("three-mesh-bvh/src/x.js")`)).toBe(true);
    expect(hit(`import type { Mesh } from "@types/three";`)).toBe(true);
    expect(hit(`/// <reference types="three" />`)).toBe(true);
    expect(hit(`import x from "./three-way.js"; import y from "threshold";`)).toBe(false);
    expect(hit(`// import x from "three"\n/* import("archlang-3d") */`)).toBe(false);
    expect(hit(`import x from "./three-way.js";`)).toBe(false);
    expect(hit(`await import(/* @vite-ignore */ "three" as string)`)).toBe(true);
    expect(hit('await import("three" as string)')).toBe(true);
    expect(hit(`import x from "../packages/archlang-3d/src/index.js";`)).toBe(true);
    expect(hit(`import x from "./packages-archlang-3d.js";`)).toBe(false);
  });

  it("an import after a // inside a string literal on the same line is still seen", () => {
    const text = `const s = "x // y"; import "../packages/archlang-3d/src/index.js";`;
    expect(specifiersOf(text).map((x) => x.spec)).toContain("../packages/archlang-3d/src/index.js");
    expect(specifiersOf(text).some((x) => FORBIDDEN.test(x.spec))).toBe(true);
    expect(specifiersOf(`const s = "x // y"; import "three";`).some((x) => FORBIDDEN.test(x.spec))).toBe(true);
  });
});
