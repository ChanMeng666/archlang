/**
 * Boundary: 3D lives only in `packages/archlang-3d`, never a core dependency (AGENTS.md hard rules).
 * The rule was prose and comments; this scans `src/` so a stray import goes red. Any import/export
 * specifier (static, `export ... from`, dynamic `import(`, `require(`) naming `archlang-3d` or
 * `three` (or a `three/...` subpath) fails, with its file:line.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = /^(?:@[\w-]+\/archlang-3d|archlang-3d|three)(?:\/.*)?$/;
const SOURCE = /\.(?:ts|mts|cts|mjs|cjs|js)$/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'`])([^"'`\n]+)\1/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SOURCE.test(name)) out.push(p);
  }
  return out;
}

/** Blank comments (keeping newlines) so a comment that names the rule is not a violation. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/.*$/gm, (m) => " ".repeat(m.length));
}

function offences(file: string): string[] {
  const text = stripComments(readFileSync(file, "utf8"));
  const found: string[] = [];
  for (const m of text.matchAll(SPECIFIER)) {
    if (!FORBIDDEN.test(m[2] ?? "")) continue;
    const line = text.slice(0, m.index).split("\n").length;
    found.push(`${relative(ROOT, file).split(sep).join("/")}:${line} imports "${m[2]}"`);
  }
  return found;
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
    const hit = (s: string) => [...stripComments(s).matchAll(SPECIFIER)].some((m) => FORBIDDEN.test(m[2] ?? ""));
    expect(hit(`import * as T from "three";`)).toBe(true);
    expect(hit(`import("three/examples/jsm/x.js")`)).toBe(true);
    expect(hit(`export { a } from "@chanmeng666/archlang-3d";`)).toBe(true);
    expect(hit(`import "three";`)).toBe(true);
    expect(hit(`// import x from "three"\n/* import("archlang-3d") */`)).toBe(false);
    expect(hit(`import x from "./three-way.js";`)).toBe(false);
  });
});
