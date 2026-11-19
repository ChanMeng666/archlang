/** every value the package root declares is defined at runtime (`export type *` once hid ast.ts's constants). */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import * as core from "../src/index.js";

/**
 * A TypeScript consumer compiles a named value import from the package root when the built
 * d.ts lists it as a value, then gets `undefined` if `src/index.ts` only has
 * `export type *` for the module that declares it. The d.ts comes from the same module
 * graph, so the source-level equivalent is exact and needs no build: ask the type checker for
 * every export of `src/index.ts`, resolve aliases, and demand that each one with value meaning
 * (variable, function, class, enum, value module) is a runtime key, and the other way round.
 * Type-only names have no value meaning and are skipped. Derived, never retyped: a new
 * `export const` reachable through the index fails here at once.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = resolve(REPO, "src", "index.ts");

/** The compiler options the repo actually builds `src/` with — read, not restated. */
function compilerOptions(): ts.CompilerOptions {
  const configPath = resolve(REPO, "tsconfig.json");
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(raw.error, "tsconfig.json must parse").toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, REPO, undefined, configPath);
  return { ...parsed.options, noEmit: true, skipLibCheck: true };
}

describe("package root: declared values exist at runtime", () => {
  const declared: string[] = [];
  const unresolved: string[] = [];

  beforeAll(() => {
    const program = ts.createProgram([INDEX], compilerOptions());
    const checker = program.getTypeChecker();
    const mod = checker.getSymbolAtLocation(program.getSourceFile(INDEX)!)!;
    const valueFlags =
      ts.SymbolFlags.Variable |
      ts.SymbolFlags.Function |
      ts.SymbolFlags.Class |
      ts.SymbolFlags.Enum |
      ts.SymbolFlags.ValueModule;
    for (const sym of checker.getExportsOfModule(mod)) {
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      if (target.flags === ts.SymbolFlags.None || target.name === "unknown") unresolved.push(sym.name);
      else if (target.flags & valueFlags) declared.push(sym.name);
    }
  }, 60_000);

  it("resolves every export of src/index.ts", () => {
    expect(unresolved).toEqual([]);
  }, 60_000);

  it("every value-meaning export is a runtime key, and every runtime key is declared", () => {
    expect(declared.length).toBeGreaterThanOrEqual(229);
    expect([...declared].sort()).toEqual(Object.keys(core).sort());
  }, 60_000);
});
