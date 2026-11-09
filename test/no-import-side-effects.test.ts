import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Which `src/` modules do something when they are merely imported? A package may declare
 * `"sideEffects": false` only if the answer is none: a bundler is then free to drop an import whose
 * exports go unused, and any module that registers itself somewhere on load would silently stop
 * working. This scan, over every `src/**\/*.ts` (never a list), pins the answer.
 *
 * Rules, read from the syntax tree:
 *  - a top-level statement that is a bare expression (a call, an assignment) runs on load, so each
 *    one must be in KNOWN_LOAD_EFFECTS below, with its reason;
 *  - no registry mutator (`register*`, `set*Backend`, `setBuiltinDispatch`) is called while a module
 *    evaluates (outside function bodies), except the known ones.
 *
 * Finding that stands behind the root `package.json` NOT declaring `sideEffects`: `src/builtins.ts`
 * injects its dispatch table into `src/expr.ts` on load (it breaks an import cycle), so dropping an
 * "unused" `import "./builtins.js"` would leave the evaluator without built-in functions. When that
 * becomes an explicit call from the pipeline, delete the entry here and declare `sideEffects: false`.
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
