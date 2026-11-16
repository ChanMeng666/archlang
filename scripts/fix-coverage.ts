/**
 * How many catalogued diagnostic codes can carry a machine fix: a span edit (`Diagnostic.fixes`)
 * that `arch fix` / `applyFixes` can apply, as opposed to the catalogue's prose `fix` text that
 * every code has.
 *
 * Read from the source, never retyped: the TypeScript parser walks every `src/` file and finds
 * each object literal that attaches fixes (a `fixes` property, or a spread whose expression
 * mentions `fixesFrom(`/`fixes`). The code such a literal belongs to is read from:
 *   - its own `code` property: every `"E_*"`/`"W_*"` string literal in the initializer (so a
 *     ternary between two codes credits both); else
 *   - the nearest enclosing function's `<x>.code === "…"` / `!== "…"` comparisons — the shape of
 *     the one site that attaches fixes to a diagnostic built elsewhere (`W_WHILE_DEPRECATED` in
 *     `arch fix`, `src/cli/commands-author.ts`).
 * A literal with no `code` of its own that is spread into one (`...(ok ? { fixes } : {})`) takes
 * that one's codes; `fixes: d.fixes.map(…)` re-maps fixes already attached and is not a site.
 * A literal none of these names is reported in `unattributed`; `test/fix-coverage.test.ts` requires
 * that list to hold only the non-diagnostic sites named in {@link NOT_A_DIAGNOSTIC}, so a new fix
 * site is never silently left out of the count.
 *
 * What it does not prove: that the fix is reachable on some input. It counts codes whose raise
 * site can attach a span edit.
 *
 *   npx tsx scripts/fix-coverage.ts          print "N of M codes have a span edit" and the codes
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { ERROR_CATALOG } from "../src/error-catalog.js";

export const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Object literals that carry a `fixes` key but are not a diagnostic: `fixesFrom` itself builds
 * the `{ fixes }` a diagnostic literal spreads. Keyed `file:line`-free, by file and the text of
 * the literal, so a moved line does not break it.
 */
export const NOT_A_DIAGNOSTIC: readonly { file: string; text: string }[] = [
  { file: "src/fix-producers.ts", text: "{ fixes }" },
];

const CODE_RE = /^[EW]_[A-Z0-9_]+$/;

export interface FixSite {
  file: string;
  line: number;
  text: string;
  codes: string[];
}

export interface FixCoverage {
  /** Catalogued codes some raise site can attach a span edit to, sorted. */
  withEdit: string[];
  /** Every catalogued code, sorted. */
  catalogued: string[];
  /** Codes the scan credited that the catalogue does not hold (should be empty). */
  uncatalogued: string[];
  /** Fix-attaching literals no code could be read for. */
  unattributed: FixSite[];
  sites: FixSite[];
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...sourceFiles(p));
    else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
    const n = p.name;
    if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  }
  return undefined;
}

function attachesFixes(lit: ts.ObjectLiteralExpression, sf: ts.SourceFile): boolean {
  return lit.properties.some((p) => {
    if (propName(p) === "fixes") {
      // `fixes: d.fixes.map(…)` re-maps fixes a producer already attached (provenance welds,
      // `src/lint.ts`): a pass-through, not an attach site.
      return !(ts.isPropertyAssignment(p) && /^\w+\.fixes\b/.test(p.initializer.getText(sf)));
    }
    if (ts.isSpreadAssignment(p)) {
      const t = p.expression.getText(sf);
      // A spread that is a whole diagnostic (`...d`) is not an attach; one that computes fixes is.
      return /\bfixesFrom\(|\bfixes\b/.test(t) && !ts.isIdentifier(p.expression);
    }
    return false;
  });
}

function stringLiterals(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CODE_RE.test(n.text)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function codeComparisons(fn: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(n.operatorToken.kind)
    ) {
      for (const [a, b] of [
        [n.left, n.right],
        [n.right, n.left],
      ] as const) {
        if (ts.isPropertyAccessExpression(a) && a.name.text === "code" && ts.isStringLiteral(b) && CODE_RE.test(b.text))
          out.push(b.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return out;
}

function enclosingFunction(n: ts.Node): ts.Node | undefined {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
  return undefined;
}

export function fixCoverage(root: string = REPO): FixCoverage {
  const sites: FixSite[] = [];
  for (const path of sourceFiles(join(root, "src"))) {
    const file = relative(root, path).replace(/\\/g, "/");
    const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (n: ts.Node): void => {
      if (ts.isObjectLiteralExpression(n) && attachesFixes(n, sf)) {
        const codeProp = n.properties.find((p) => propName(p) === "code");
        let codes = codeProp ? stringLiterals(codeProp) : [];
        // `{ code: "E_X", …(ok ? { fixes: [...] } : {}) }`: the inner literal belongs to the
        // diagnostic literal it is spread into.
        for (let p = n.parent; codes.length === 0 && p; p = p.parent) {
          if (ts.isFunctionLike(p)) break;
          if (ts.isObjectLiteralExpression(p)) {
            const outer = p.properties.find((q) => propName(q) === "code");
            if (outer) codes = stringLiterals(outer);
          }
        }
        if (codes.length === 0) {
          const fn = enclosingFunction(n);
          if (fn) codes = codeComparisons(fn);
        }
        sites.push({
          file,
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          text: n.getText(sf).replace(/\s+/g, " "),
          codes: [...new Set(codes)].sort(),
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const catalogued = Object.keys(ERROR_CATALOG).sort();
  const credited = new Set(sites.flatMap((s) => s.codes));
  const inCatalog = new Set(catalogued);
  const notDiag = (s: FixSite): boolean => NOT_A_DIAGNOSTIC.some((x) => x.file === s.file && x.text === s.text);
  return {
    withEdit: [...credited].filter((c) => inCatalog.has(c)).sort(),
    catalogued,
    uncatalogued: [...credited].filter((c) => !inCatalog.has(c)).sort(),
    unattributed: sites.filter((s) => s.codes.length === 0 && !notDiag(s)),
    sites,
  };
}

export function renderFixCoverage(c: FixCoverage): string {
  const lines = [
    `${c.withEdit.length} of ${c.catalogued.length} codes have a span edit`,
    ...c.withEdit.map((x) => `  ${x}`),
  ];
  if (c.uncatalogued.length) lines.push(`uncatalogued: ${c.uncatalogued.join(", ")}`);
  for (const s of c.unattributed) lines.push(`unattributed fix site: ${s.file}:${s.line}`);
  return lines.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(renderFixCoverage(fixCoverage()));
}
