import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A ratchet on import-time effects in `src/`, the precondition for declaring `"sideEffects": false`
 * (a bundler may then drop an import whose exports go unused, so a module that registers itself on
 * load would silently stop working). It scans every `src/**\/*.ts` (never a list) and checks
 * EXACTLY two things, read from the syntax tree:
 *  - top-level bare expression statements (`f();`, `x = 1;`, `void main();`): each must be in
 *    KNOWN_LOAD_EFFECTS below, with its reason;
 *  - calls to a registry mutator (`register*`, `set*Backend`, `setBuiltinDispatch`) anywhere that
 *    runs at module evaluation, i.e. outside function-like bodies (this includes `const X = f()`
 *    initialisers whose callee is one of those names), except the known one.
 *
 * KNOWN LIMIT, so this is not a proof of purity: an ordinary initialiser such as
 * `const VERSION = readVersion()` (`src/cli/io.ts`) or `const BUILTIN_REGISTRY = createRegistry()`
 * is NOT inspected beyond the mutator names (about 45 such initialisers exist); a helper that mutates
 * foreign state when called from an initialiser, an IIFE doing the same under a different name, and
 * class static blocks are all invisible here.
 *
 * Why the root `package.json` does not declare `sideEffects`: `src/builtins.ts` injects its dispatch
 * into `src/expr.ts` on load (it breaks an import cycle). The hazard is real only if the value import
 * of `BUILTIN_NAMES` (`src/ir.ts`, `src/analyze/depends.ts`) ever disappears. The way out is to make
 * the registration an explicit call from the pipeline, drop the entry below, then declare
 * `sideEffects: false`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "src");

/** `file: [first line of the statement]`, the only expression statements allowed at the top level. */
const KNOWN_LOAD_EFFECTS: Record<string, string[]> = {
  // Injects the built-in dispatch into the evaluator when the module loads (cycle break).
  "src/builtins.ts": ["setBuiltinDispatch(dispatch);"],
  // The `arch` binary's entry point; not part of the library entries or their import graph.
  "src/cli.ts": ["void main();"],
};

const MUTATOR = /^(register[A-Z]\w*|set\w*Backend|setBuiltinDispatch)$/;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

interface Found {
  statements: string[];
  mutatorCalls: string[];
}

function scan(file: string): Found {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  const found: Found = { statements: [], mutatorCalls: [] };
  const firstLine = (n: ts.Node) => n.getText(sf).split("\n")[0]!.trim();
  const visit = (n: ts.Node): void => {
    // Function and method bodies run when called, not when the module loads.
    if (ts.isFunctionLike(n)) return;
    if (ts.isCallExpression(n)) {
      const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText(sf);
      if (MUTATOR.test(callee)) found.mutatorCalls.push(firstLine(n));
    }
    ts.forEachChild(n, visit);
  };
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st)) found.statements.push(firstLine(st));
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isImportDeclaration(st)) continue;
    visit(st);
  }
  return found;
}

describe("importing a src module has no side effect beyond the known ones", () => {
  const files = sources(SRC);
  const rel = (f: string) => relative(resolve(HERE, ".."), f).replace(/\\/g, "/");

  it("scans the whole source tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("top-level expression statements are exactly the known load effects", () => {
    const actual: Record<string, string[]> = {};
    for (const f of files) {
      const { statements } = scan(f);
      if (statements.length) actual[rel(f)] = statements;
    }
    expect(actual).toEqual(KNOWN_LOAD_EFFECTS);
  });

  it("no registry mutator runs while a module evaluates, beyond the known ones", () => {
    const actual: Record<string, string[]> = {};
    for (const f of files) {
      const { mutatorCalls } = scan(f);
      if (mutatorCalls.length) actual[rel(f)] = mutatorCalls;
    }
    expect(actual).toEqual({ "src/builtins.ts": ["setBuiltinDispatch(dispatch)"] });
  });
});
