/** The `./share` import graph holds no Node built-in and no CLI I/O module (browser-safe). */
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The `./share` subpath (`src/share.ts`) is read by the playground page, two Workers and the docs
 * widget, none of which has Node built-ins. Its web codec sits under `src/cli/`, where Node APIs
 * are otherwise allowed, so nothing else keeps a `node:` import out of it. This scans the static
 * import graph from `src/share.ts` (every `import`/`export ... from`, dynamic `import()` and
 * `require()` with a string argument, transitively through `src/`) and refuses a Node built-in
 * (`node:*` or a bare name such as `fs`, `path`, `zlib`) and any module that is CLI I/O
 * (`src/cli/io.ts`, `src/cli.ts`, the Node encoder `src/cli/share-codec.mjs`).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(ROOT, "src", "share.ts");
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, m.replace(/^node:/, "")]));
const FORBIDDEN_FILES = new Set(["src/cli/io.ts", "src/cli.ts", "src/cli/share-codec.mjs"]);

const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");

/** The string specifiers a file imports, read from its syntax tree. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    )
      out.push(n.moduleSpecifier.text);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal))
      out.push(n.argument.literal.text);
    else if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0]!)) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require"))
        out.push((n.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** A relative specifier to the source file it names (`./x.js` is `./x.ts`; `.mjs` stays). */
function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, base.replace(/\.js$/, ".ts"), `${base}.ts`, `${base}.mjs`, resolve(base, "index.ts")])
    if (existsSync(c) && /\.(ts|mjs)$/.test(c)) return c;
  return null;
}

function graph(): { files: Set<string>; problems: string[] } {
  const files = new Set<string>();
  const problems: string[] = [];
  const queue = [ENTRY];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (FORBIDDEN_FILES.has(rel(file))) problems.push(`${rel(file)} is reachable from src/share.ts`);
    for (const spec of specifiers(file)) {
      if (spec.startsWith(".")) {
        const next = resolveLocal(file, spec);
        if (next === null) problems.push(`${rel(file)}: cannot resolve "${spec}"`);
        else queue.push(next);
      } else if (spec.startsWith("node:") || BUILTINS.has(spec) || BUILTINS.has(spec.split("/")[0]!)) {
        problems.push(`${rel(file)} imports the Node built-in "${spec}"`);
      } else {
        problems.push(`${rel(file)} imports the package "${spec}" (zero runtime deps)`);
      }
    }
  }
  return { files, problems };
}

describe("the ./share subpath is browser-safe", () => {
  const { files, problems } = graph();

  it("reaches the web codec, so the scan is not vacuous", () => {
    const seen = [...files].map(rel);
    expect(seen).toContain("src/share.ts");
    expect(seen).toContain("src/cli/share-codec.web.mjs");
  });

  it("imports no node: API, no package, and nothing from CLI I/O, transitively", () => {
    expect(problems).toEqual([]);
  });
});
