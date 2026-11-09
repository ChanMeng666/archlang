/**
 * No runtime import cycles in `src/`.
 *
 * ES modules in a cycle see each other half-initialised: the first top-level
 * `const X = importedFn()` added inside a cycle throws a TDZ ReferenceError, and only for
 * some entry points. Type-only imports are erased and cannot cycle at runtime, so this
 * builds the VALUE-import graph of `src/**` (comments stripped; `import type`,
 * `export type … from` and all-`type` specifier lists ignored) and asserts it has no
 * strongly connected component of more than one module (a self-import counts).
 * Fix a failure by moving the shared leaf into its own module, never by reordering imports.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..", "src");

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

function stripComments(s: string): string {
  return s.replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Value-import specifiers of one stripped source text. */
function valueSpecifiers(text: string): string[] {
  const out: string[] = [];
  const from = /\b(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g;
  for (let m = from.exec(text); m; m = from.exec(text)) {
    if (m[1]) continue; // import type / export type … from
    const clause = m[2]!.trim();
    const brace = /^\{([\s\S]*)\}$/.exec(clause);
    if (brace) {
      const items = brace[1]!
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (items.length > 0 && items.every((x) => /^type\s/.test(x))) continue;
    }
    out.push(m[3]!);
  }
  const bare = /\bimport\s*["']([^"']+)["']/g;
  for (let m = bare.exec(text); m; m = bare.exec(text)) out.push(m[1]!);
  return out;
}

function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base.replace(/\.js$/, ".ts"), base + ".ts", join(base, "index.ts")];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

function valueGraph(files: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const f of files) {
    const deps = new Set<string>();
    for (const spec of valueSpecifiers(stripComments(readFileSync(f, "utf8")))) {
      const to = resolveSpecifier(f, spec);
      if (to) deps.add(to);
    }
    graph.set(f, [...deps].sort());
  }
  return graph;
}

/** Tarjan: strongly connected components with more than one node, or a self-edge. */
function cycles(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];
  let next = 0;
  const visit = (v: string): void => {
    index.set(v, next);
    low.set(v, next);
    next++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) found.push(comp.reverse());
    }
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found;
}

describe("no runtime import cycles in src/", () => {
  it("parses type-only imports out and value imports in", () => {
    const text = stripComments(
      [
        '// import { a } from "./commented.js";',
        'import type { A } from "./a.js";',
        'import { type B, type C } from "./b.js";',
        'import { type D, e } from "./d.js";',
        'export type { F } from "./f.js";',
        'export { g } from "./g.js";',
        'import {\n  h,\n  type I,\n} from "./h.js";',
        'import "./side.js";',
      ].join("\n"),
    );
    expect(valueSpecifiers(text)).toEqual(["./d.js", "./g.js", "./h.js", "./side.js"]);
  });

  it("finds a cycle and a self-import in a toy graph", () => {
    const g = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
      ["d", ["d"]],
      ["e", ["a"]],
    ]);
    expect(cycles(g).map((c) => [...c].sort())).toEqual([["a", "b", "c"], ["d"]]);
  });

  it("has no strongly connected component of more than one module", () => {
    const files = listTs(SRC);
    const graph = valueGraph(files);
    expect(files.length).toBeGreaterThan(100);
    const found = cycles(graph).map((c) => c.map((f) => relative(SRC, f).replace(/\\/g, "/")));
    const message = found.map((c) => `cycle of ${c.length} modules: ${c.join(", ")}`).join("\n");
    expect(found, message).toEqual([]);
  });
});
