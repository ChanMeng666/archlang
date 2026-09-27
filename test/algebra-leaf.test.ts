import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `src/algebra/` is a domain-free LEAF layer: the group and semiring arithmetic every other
 * module may build on, so it must build on nothing. Every file in the folder — scanned,
 * never listed, so a new module is covered the day it lands — may import from outside the
 * folder ONLY with a statement-level `import type` / `export type` (erased at compile time).
 *
 * A value import from outside would let the domain leak in (and, through `registry.ts` or
 * `ir.ts`, an import cycle with it). An inline `import { type X }` is NOT type-only here: the
 * statement survives emit under `verbatimModuleSyntax`, so it would still load the module.
 * Dynamic `import()` and `require()` are refused outright.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ALGEBRA = resolve(HERE, "..", "src", "algebra");

interface Edge {
  file: string;
  spec: string;
  typeOnly: boolean;
  kind: string;
}

/** Every module reference in one source file, with whether the statement is type-only. */
function edgesOf(file: string): Edge[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Edge[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({
        file,
        spec: node.moduleSpecifier.text,
        typeOnly: node.importClause?.isTypeOnly === true,
        kind: "import",
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ file, spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly, kind: "export-from" });
    } else if (ts.isImportEqualsDeclaration(node)) {
      out.push({ file, spec: node.moduleReference.getText(sf), typeOnly: node.isTypeOnly, kind: "import=" });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
        const arg = node.arguments[0];
        out.push({
          file,
          spec: arg && ts.isStringLiteral(arg) ? arg.text : "<dynamic>",
          typeOnly: false,
          kind: "dynamic",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Does `spec`, relative to `file`, resolve to a module inside `src/algebra/`? */
const staysInside = (file: string, spec: string): boolean =>
  spec.startsWith(".") && !relative(ALGEBRA, resolve(dirname(file), spec)).startsWith("..");

const files = readdirSync(ALGEBRA)
  .filter((f) => f.endsWith(".ts"))
  .sort()
  .map((f) => join(ALGEBRA, f));

describe("src/algebra/ is a leaf", () => {
  it("scans a non-empty folder (the guard is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((f) => f.replace(/\\/g, "/"))).toContainEqual(expect.stringMatching(/\/d4\.ts$/));
  });

  it("imports from outside the folder only with `import type` / `export type`", () => {
    const bad = files
      .flatMap(edgesOf)
      .filter((e) => e.kind === "dynamic" || (!e.typeOnly && !staysInside(e.file, e.spec)))
      .map((e) => `${relative(ALGEBRA, e.file)}: ${e.kind} "${e.spec}"`);
    expect(bad, "src/algebra/ must stay domain-free: move the value into the folder, or import only its TYPE").toEqual(
      [],
    );
  });

  it("the check can fail: a planted value import from outside is caught", () => {
    const planted = join(ALGEBRA, "__planted__.ts");
    const sf = ts.createSourceFile(
      planted,
      'import { fmt2 } from "../num-format.js";\nimport { type Point } from "../ast.js";\nimport type { NorthDir } from "../ast.js";\n',
      ts.ScriptTarget.Latest,
      true,
    );
    const specs = sf.statements.filter(ts.isImportDeclaration).map((d) => ({
      spec: (d.moduleSpecifier as ts.StringLiteral).text,
      typeOnly: d.importClause?.isTypeOnly === true,
    }));
    const flagged = specs.filter((e) => !e.typeOnly && !staysInside(planted, e.spec)).map((e) => e.spec);
    expect(flagged).toEqual(["../num-format.js", "../ast.js"]);
    expect(staysInside(planted, "./semiring.js")).toBe(true);
  });
});
