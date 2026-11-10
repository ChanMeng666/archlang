/**
 * The one TypeScript-AST walk over a module's import specifiers, shared by `core-no-3d.test.ts`
 * (every specifier, type-only included) and `plan-json-projector-leaf.test.ts` (runtime loads only).
 *
 * Replaces a per-line regex scan that blanked everything after a `//` inside a string literal and so
 * missed an import after it on the same line. The walk sees import declarations, `import x = require()`,
 * re-exports (`export ... from`), dynamic `import()` and `require()` calls, plus `/// <reference>`
 * directives. It takes the TEXT, so a fixture needs no file on disk.
 *
 * `test/no-duplicate-helpers.test.ts` keeps a local copy from reappearing.
 */
import ts from "typescript";

export interface ImportRef {
  spec: string;
  line: number;
  typeOnly: boolean;
}

/** Every module specifier `text` names, with its 1-based line; `typeOnly` marks statements TypeScript erases. */
export function importRefs(file: string, text: string): ImportRef[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: ImportRef[] = [];
  const add = (node: ts.Node, typeOnly: boolean): void => {
    let lit = node;
    // `import(/* @vite-ignore */ "x" as string)`: the core's lazy-import idiom wraps the specifier.
    while (
      ts.isAsExpression(lit) ||
      ts.isParenthesizedExpression(lit) ||
      ts.isSatisfiesExpression(lit) ||
      ts.isTypeAssertionExpression(lit)
    )
      lit = lit.expression;
    if (ts.isStringLiteralLike(lit))
      out.push({ spec: lit.text, line: sf.getLineAndCharacterOfPosition(lit.getStart(sf)).line + 1, typeOnly });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, node.importClause?.isTypeOnly === true);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier, node.isTypeOnly);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      add(node.moduleReference.expression, node.isTypeOnly);
    else if (ts.isCallExpression(node) && node.arguments[0]) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require"))
        add(node.arguments[0], false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const r of [...sf.referencedFiles, ...sf.typeReferenceDirectives]) {
    out.push({ spec: r.fileName, line: sf.getLineAndCharacterOfPosition(r.pos).line + 1, typeOnly: true });
  }
  return out;
}
