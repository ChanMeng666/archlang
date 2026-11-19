/** every value the package root declares is defined at runtime (`export type *` once hid ast.ts's constants). */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

/**
 * A TypeScript consumer compiles `import { USE_KINDS } from "@chanmeng666/archlang"` when the
 * built d.ts lists it as a value, then gets `undefined` if `src/index.ts` only has
 * `export type * from "./ast.js"`. The d.ts is generated from the same module graph, so the
 * source-level equivalent is exact and needs no build: ask the type checker for every export of
 * `src/index.ts` and demand that each one it resolves to a value (variable, function, class,
 * enum) is a runtime key of the module. Type-only names have no value meaning and are skipped.
 * Derived, never retyped: a new `export const` reachable through the index fails here at once.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

describe("package root: declared values exist at runtime", () => {
  it("every value-meaning export of src/index.ts is defined at runtime", () => {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    };
    const program = ts.createProgram([resolve(SRC, "index.ts")], options);
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(resolve(SRC, "index.ts"))!;
    const mod = checker.getSymbolAtLocation(sf)!;
    const valueFlags = ts.SymbolFlags.Variable | ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Enum;
    const declared: string[] = [];
    for (const sym of checker.getExportsOfModule(mod)) {
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      if (target.flags & valueFlags) declared.push(sym.name);
    }
    expect(declared.length).toBeGreaterThan(100);
    const runtime = new Set(Object.keys(core));
    expect(declared.filter((n) => !runtime.has(n))).toEqual([]);
  });
});
