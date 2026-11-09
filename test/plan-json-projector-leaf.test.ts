/**
 * **The Plan JSON projector is a leaf.** `to-json.ts` turns a resolved plan into Plan JSON; it
 * must not load the validator (`from-json.ts`), which it reads nothing from. (The parser stays in its closure through the resolver, `src/ir.ts`, whose IR it projects; that edge is the projector's input, not a leak.) A
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

  it("to-json.ts does not reach the validator", () => {
    expect(mods.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(false);
  });

  it("to-json.ts reaches the parser only through the resolver it reads (src/ir.ts)", () => {
    const direct = runtimeImports(resolve(SRC, "plan-json/to-json.ts"));
    expect(direct).not.toContain(resolve(SRC, "parser.ts"));
    expect(direct).toContain(resolve(SRC, "ir.ts"));
  });

  it("the walk can see the edge where it exists (emit.ts loads both)", () => {
    const emit = closure(resolve(SRC, "plan-json/emit.ts"));
    expect(emit.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(true);
    expect(emit.has(resolve(SRC, "parser.ts"))).toBe(true);
  });
});
