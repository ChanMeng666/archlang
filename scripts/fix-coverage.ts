/**
 * How many catalogued diagnostic codes can carry a machine fix: a span edit (`Diagnostic.fixes`)
 * that `arch fix` / `applyFixes` can apply, as opposed to the catalogue's prose `fix` text that
 * every code has.
 *
 * Read from the source, never retyped: the TypeScript parser walks every `src/` file and finds
 * each place that attaches fixes:
 *   - an object literal with a `fixes` property (`fixes: […]`, `{ fixes }`, `fixes: r.fixes`);
 *   - an object literal with a spread whose expression mentions `fixesFrom(`/`fixes`, or that
 *     spreads a local constant whose initializer does (`const x = fixesFrom(…); { …, ...x }`);
 *   - an assignment `d.fixes = …` and a call `d.fixes.push(…)`.
 * The code such a site belongs to is read from:
 *   - its own `code` property: every `"E_*"`/`"W_*"` string literal in the initializer (so a
 *     ternary between two codes credits both); else
 *   - the nearest enclosing function's `<x>.code === "…"` / `!== "…"` comparisons — the shape of
 *     the one site that attaches fixes to a diagnostic built elsewhere (`W_WHILE_DEPRECATED` in
 *     `arch fix`, `src/cli/commands-author.ts`).
 * A literal with no `code` of its own that is spread into one (`...(ok ? { fixes } : {})`) takes
 * that one's codes. A pass-through re-maps fixes already attached to the diagnostic it copies and is
 * not a site: `{ ...d, fixes: d.fixes.map(…) }` (the literal spreads the same `d`), and
 * `out.fixes = d.fixes.map((f) => ({ ...f, … }))` (each fix is kept whole). A site of one of these
 * shapes that no code is read for is reported in `unattributed`; `test/fix-coverage.test.ts` requires
 * that list to hold only the non-diagnostic sites named in {@link NOT_A_DIAGNOSTIC}.
 *
 * Each site also records the names of the functions it lies in and an `expanded` text: its own text
 * with the initializers of the local constants it names and the bodies of the same-file functions
 * it calls, two levels deep, so a check can see which producer a site calls through a local
 * (`const fix = dimTextFix(…); …fixesFrom(fix)`). {@link applicabilityLiterals} lists every
 * `applicability` property in `src/`, and whether its value is written out as literals.
 * `test/fixable-codes.test.ts` holds `FIX_PRODUCERS` (`src/fixable-codes.ts`) to both.
 *
 * What it does not see: a fix attached in any other shape. A spread of a call to a helper that
 * returns fixes (`...openRemedy(n)`), a helper in another file that builds the diagnostic or spreads
 * its fixes, `Object.assign`, a spread parameter, and a producer that hands part of its work to
 * another function all escape it. A `code` written partly through a name (`ok ? "E_A" : B`) credits
 * only its literals (a `code` with none is `unattributed`). What it does not prove: that the fix is reachable on some input. It counts codes
 * whose raise site, in one of the shapes above, can attach a span edit.
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
 * Fix-attaching sites that are not a diagnostic: `fixesFrom` itself builds the `{ fixes }` a
 * diagnostic literal spreads, and `diagnosticToJson` projects a diagnostic's fixes to JSON. Keyed
 * `file:line`-free, by file and the site's text (whitespace squashed), so a moved line does not break
 * it; `prefix` matches the start of the text instead of all of it.
 */
export const NOT_A_DIAGNOSTIC: readonly { file: string; text: string; prefix?: true }[] = [
  { file: "src/fix-producers.ts", text: "{ fixes }" },
  { file: "src/diagnostic-json.ts", text: "out.fixes = d.fixes.map((f) => {", prefix: true },
];

const CODE_RE = /^[EW]_[A-Z0-9_]+$/;
const FIXISH_RE = /\bfixesFrom\(|\bfixes\b/;

export interface FixSite {
  file: string;
  line: number;
  text: string;
  codes: string[];
  /** The names of the named functions the site lies in, innermost first. */
  fns: string[];
  /** The site's text plus the local constants and same-file functions it names (see the header). */
  expanded: string;
  /** The text of the innermost named function the site lies in (`fns[0]`), or `""`. */
  fnText: string;
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

/** The initializer of the nearest `const|let <name> = …` in scope of `from`, or undefined. */
function localInit(name: string, from: ts.Node): ts.Expression | undefined {
  for (let p: ts.Node | undefined = from.parent; p; p = p.parent) {
    // A parameter of that name shadows anything further out.
    if (ts.isFunctionLike(p) && p.parameters.some((q) => ts.isIdentifier(q.name) && q.name.text === name))
      return undefined;
    const statements = ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) ? p.statements : undefined;
    if (!statements) continue;
    for (const st of statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer;
    }
  }
  return undefined;
}

/** A top-level `function <name>` of the file. */
function fileFunction(name: string, sf: ts.SourceFile): ts.FunctionDeclaration | undefined {
  return sf.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
}

/** `node`'s text, plus the local constants it names and the same-file functions it calls, `depth` deep. */
function expand(node: ts.Node, sf: ts.SourceFile, depth = 2, seen = new Set<string>()): string {
  const parts = [node.getText(sf)];
  if (depth === 0) return parts[0]!;
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && !seen.has(n.text)) {
      seen.add(n.text);
      const init = localInit(n.text, node);
      if (init) parts.push(expand(init, sf, depth - 1, seen));
      else if (ts.isCallExpression(n.parent) && n.parent.expression === n) {
        const fn = fileFunction(n.text, sf);
        if (fn) parts.push(expand(fn, sf, depth - 1, seen));
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return parts.join("\n");
}

/** `X.fixes` or `X.fixes.map(…)`: the `X`, or undefined. */
function fixesOf(e: ts.Expression, sf: ts.SourceFile): string | undefined {
  return /^(\w+)\.fixes\b/.exec(e.getText(sf))?.[1];
}

function attachesFixes(lit: ts.ObjectLiteralExpression, sf: ts.SourceFile): boolean {
  const spreads = new Set(
    lit.properties.flatMap((p) =>
      ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) ? [p.expression.text] : [],
    ),
  );
  // `{ ...d, fixes: d.fixes.map(…) }` re-maps the fixes of the diagnostic it copies (provenance
  // welds, `src/lint.ts`): a pass-through. `fixes: r.fixes` from anything else attaches them.
  const remapped = new Set(
    lit.properties.flatMap((p) => {
      const from = propName(p) === "fixes" && ts.isPropertyAssignment(p) ? fixesOf(p.initializer, sf) : undefined;
      return from !== undefined && spreads.has(from) ? [from] : [];
    }),
  );
  return lit.properties.some((p) => {
    if (propName(p) === "fixes") {
      const from = ts.isPropertyAssignment(p) ? fixesOf(p.initializer, sf) : undefined;
      return !(from !== undefined && remapped.has(from));
    }
    if (ts.isSpreadAssignment(p)) {
      if (ts.isIdentifier(p.expression)) {
        if (remapped.has(p.expression.text)) return false;
        // A whole diagnostic (`...d`) is not an attach; a local holding fixes (`...extra`) is.
        const init = localInit(p.expression.text, lit);
        return init !== undefined && FIXISH_RE.test(init.getText(sf));
      }
      return FIXISH_RE.test(p.expression.getText(sf));
    }
    return false;
  });
}

/** `d.fixes = …` that is not a pass-through, or `d.fixes.push(…)`. */
function mutatesFixes(n: ts.Node, sf: ts.SourceFile): boolean {
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(n.left) &&
    n.left.name.text === "fixes"
  ) {
    // `out.fixes = d.fixes.map((f) => ({ ...f, … }))` keeps each fix whole: a pass-through.
    return !/^\w+\.fixes\.map\(\s*\(?(\w+)\)?\s*=>\s*\(\{\s*\.\.\.\1\b/.test(n.right.getText(sf));
  }
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === "push" &&
    ts.isPropertyAccessExpression(n.expression.expression) &&
    n.expression.expression.name.text === "fixes"
  );
}

function stringLiterals(node: ts.Node, re: RegExp = CODE_RE): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && re.test(n.text)) out.push(n.text);
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

/** The names of the named functions `n` lies in (a declaration, a method, `const f = () => …`), innermost first. */
export function functionNames(n: ts.Node): string[] {
  return namedFunctions(n).map((f) => f.name);
}

function namedFunctions(n: ts.Node): { name: string; node: ts.Node }[] {
  const out: { name: string; node: ts.Node }[] = [];
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && ts.isIdentifier(p.name))
      out.push({ name: p.name.text, node: p });
    else if (
      (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) &&
      ts.isVariableDeclaration(p.parent) &&
      ts.isIdentifier(p.parent.name)
    )
      out.push({ name: p.parent.name.text, node: p });
  }
  return out;
}

function parsed(root: string): { file: string; sf: ts.SourceFile }[] {
  return sourceFiles(join(root, "src")).map((path) => ({
    file: relative(root, path).replace(/\\/g, "/"),
    sf: ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true),
  }));
}

export function fixCoverage(root: string = REPO): FixCoverage {
  const sites: FixSite[] = [];
  for (const { file, sf } of parsed(root)) {
    const visit = (n: ts.Node): void => {
      const literal = ts.isObjectLiteralExpression(n) && attachesFixes(n, sf);
      if (literal || mutatesFixes(n, sf)) {
        const codeProp = literal ? n.properties.find((p) => propName(p) === "code") : undefined;
        let codes = codeProp ? stringLiterals(codeProp) : [];
        // `{ code: "E_X", …(ok ? { fixes: [...] } : {}) }`: the inner literal belongs to the
        // diagnostic literal it is spread into.
        for (let p = n.parent; literal && codes.length === 0 && p; p = p.parent) {
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
          fns: functionNames(n),
          expanded: expand(n, sf),
          fnText: namedFunctions(n)[0]?.node.getText(sf) ?? "",
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const catalogued = Object.keys(ERROR_CATALOG).sort();
  const credited = new Set(sites.flatMap((s) => s.codes));
  const inCatalog = new Set(catalogued);
  const notDiag = (s: FixSite): boolean =>
    NOT_A_DIAGNOSTIC.some((x) => x.file === s.file && (x.prefix ? s.text.startsWith(x.text) : x.text === s.text));
  return {
    withEdit: [...credited].filter((c) => inCatalog.has(c)).sort(),
    catalogued,
    uncatalogued: [...credited].filter((c) => !inCatalog.has(c)).sort(),
    unattributed: sites.filter((s) => s.codes.length === 0 && !notDiag(s)),
    sites,
  };
}

/** One `applicability` property of an object literal. */
export interface ApplicabilityLiteral {
  file: string;
  line: number;
  /** As {@link FixSite.fns}. */
  fns: string[];
  /**
   * Whether the value is written out: a string literal, or a conditional whose every branch is one
   * (through parentheses and `as const`). False for a name, a call, a shorthand `{ applicability }`
   * or anything else whose value the scan cannot read.
   */
  literal: boolean;
  /** The applicability literals of a written-out value (`a ? "maybe-incorrect" : "machine-applicable"` gives both). */
  values: string[];
}

const APPLICABILITY_RE = /^(machine-applicable|maybe-incorrect|has-placeholders|unspecified)$/;

/** `e`'s applicability literals when it is written out (see {@link ApplicabilityLiteral.literal}), else null. */
function writtenOut(e: ts.Expression): string[] | null {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e))
    return writtenOut(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
    return APPLICABILITY_RE.test(e.text) ? [e.text] : null;
  if (ts.isConditionalExpression(e)) {
    const a = writtenOut(e.whenTrue);
    const b = writtenOut(e.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

/** Whether a property's key is `applicability`: a name, a quoted key or a computed string key. */
function isApplicabilityKey(name: ts.PropertyName): boolean {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
    return name.text === "applicability";
  return (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression)) &&
    name.expression.text === "applicability"
  );
}

/**
 * Every `applicability` property of an object literal in `src/`, whatever its key's form (a name, a
 * quoted or computed string key, a shorthand) and wherever the literal sits (a spread object too).
 * A computed key that is not a string literal (`[KEY]`) is not seen.
 */
export function applicabilityLiterals(root: string = REPO): ApplicabilityLiteral[] {
  const out: ApplicabilityLiteral[] = [];
  for (const { file, sf } of parsed(root)) {
    const visit = (n: ts.Node): void => {
      const assign = ts.isPropertyAssignment(n) && isApplicabilityKey(n.name);
      const shorthand = ts.isShorthandPropertyAssignment(n) && n.name.text === "applicability";
      if (assign || shorthand) {
        const values = assign ? writtenOut((n as ts.PropertyAssignment).initializer) : null;
        out.push({
          file,
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          fns: functionNames(n),
          literal: values !== null,
          values: [...new Set(values ?? [])].sort(),
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
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
