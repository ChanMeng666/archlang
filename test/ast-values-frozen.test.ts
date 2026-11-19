/** the tables ast.ts exports are deep-frozen: they are public values, so no consumer can edit them for everyone. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as ast from "../src/ast.js";

/**
 * The list is derived from the source (every `export const` of `src/ast.ts`), never retyped, so
 * a new table that is not frozen fails here. `Object.isFrozen`, recursively through arrays and
 * plain objects.
 */

const AST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "ast.ts");

function exportedConsts(): string[] {
  const sf = ts.createSourceFile(AST, readFileSync(AST, "utf8"), ts.ScriptTarget.ES2022, true);
  const names: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
  }
  return names;
}

function unfrozen(value: unknown, path: string): string[] {
  if (value === null || typeof value !== "object") return [];
  const out = Object.isFrozen(value) ? [] : [path];
  for (const [k, v] of Object.entries(value)) out.push(...unfrozen(v, `${path}.${k}`));
  return out;
}

describe("ast.ts value exports are deep-frozen", () => {
  const names = exportedConsts();
  it("finds the exported constants", () => {
    expect(names.length).toBeGreaterThanOrEqual(25);
    for (const n of names) expect(n in ast, n).toBe(true);
  });
  it("freezes every exported table, recursively", () => {
    const bad = names.flatMap((n) => unfrozen((ast as Record<string, unknown>)[n], n));
    expect(bad).toEqual([]);
  });
});
