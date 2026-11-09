/**
 * **`describe()` never reads the circulation overlay.** The overlay is the opt-in render of
 * the walking model (`--overlay circulation`): polylines for a picture, never a measured fact.
 * Since the split of `src/analyze/circulation.ts` the facts (`computeCirculation`,
 * `roomBottlenecks`) and the overlay geometry (`computeCirculationOverlay`) are separate
 * modules over a shared `nav-grid.ts`, and `circulation.ts` re-exports the overlay's TYPES
 * only. So the fact is visible in the import graph, and this file pins it there: no module
 * `describe.ts` loads at runtime is `circulation-overlay.ts`.
 *
 * Structural, like `iso-describe-blind.test.ts` (and its walk is `taste-invisible.test.ts`'s):
 * a statement about what `describe()` is able to read, not about what it happens to output
 * today.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = resolve("src");
const OVERLAY = resolve(SRC, "analyze/circulation-overlay.ts");

/** Every relative module a source file loads at runtime (type-only statements are erased). */
function runtimeImports(file: string, text: string = readFileSync(file, "utf8")): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.isTypeOnly !== true) out.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = node.arguments[0];
      if (a && ts.isStringLiteral(a)) out.push(a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter((s) => s.startsWith(".")).map((s) => resolve(dirname(file), s).replace(/\.js$/, ".ts"));
}

/** The modules `entry` loads, transitively. */
function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const g of runtimeImports(f)) stack.push(g);
  }
  return seen;
}

describe("describe() never loads the circulation overlay", () => {
  const mods = closure(resolve(SRC, "describe.ts"));

  it("the walk reaches the walking model it does read (the closure is not vacuous)", () => {
    expect(mods.size).toBeGreaterThan(20);
    expect(mods.has(resolve(SRC, "analyze/circulation.ts"))).toBe(true);
    expect(mods.has(resolve(SRC, "analyze/nav-grid.ts"))).toBe(true);
  });

  it("src/analyze/circulation-overlay.ts is not in describe.ts's runtime import closure", () => {
    expect([...mods].filter((m) => m === OVERLAY)).toEqual([]);
  });

  it("the walk can see the overlay where it is loaded (the render overlay)", () => {
    expect(closure(resolve(SRC, "overlays/circulation.ts")).has(OVERLAY)).toBe(true);
  });

  it("circulation.ts re-exports the overlay as types only, and a value re-export would be seen", () => {
    const facts = resolve(SRC, "analyze/circulation.ts");
    expect(readFileSync(facts, "utf8")).toMatch(/export type \{[^}]*\} from "\.\/circulation-overlay\.js";/);
    expect(runtimeImports(facts)).not.toContain(OVERLAY);
    // The same walk over a planted value re-export does see the edge.
    const planted = 'export { computeCirculationOverlay } from "./circulation-overlay.js";';
    expect(runtimeImports(facts, planted)).toEqual([OVERLAY]);
  });
});
