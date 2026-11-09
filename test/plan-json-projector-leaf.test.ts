/**
 * **The Plan JSON projector is a leaf.** `to-json.ts` turns a resolved plan into Plan JSON; it
 * must not load the validator (`from-json.ts`) or the parser, which it reads nothing from. A
 * stray import of a printer helper from `emit.ts` once pulled both in. Structural, with the
 * walk `describe-overlay-blind.test.ts` uses.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = resolve("src");

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

describe("the Plan JSON projector is a leaf", () => {
  const mods = closure(resolve(SRC, "plan-json/to-json.ts"));

  it("the walk is not vacuous", () => {
    expect(mods.size).toBeGreaterThan(5);
    expect(mods.has(resolve(SRC, "plan-json/source-tokens.ts"))).toBe(true);
  });

  it("to-json.ts does not reach the validator or the parser", () => {
    expect(mods.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(false);
    expect(mods.has(resolve(SRC, "parser.ts"))).toBe(false);
  });

  it("the walk can see the edge where it exists (emit.ts loads both)", () => {
    const emit = closure(resolve(SRC, "plan-json/emit.ts"));
    expect(emit.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(true);
    expect(emit.has(resolve(SRC, "parser.ts"))).toBe(true);
  });
});
