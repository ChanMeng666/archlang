/** `pure()` (src/pure.ts): every call is marked, takes an arrow, and the arrow has no outside effect (card RM0.7e). */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `pure(() => v)` is dropped by a bundler only because two marks say it has no effect:
 * `@__NO_SIDE_EFFECTS__` on the declaration (rolldown honours an arrow function; esbuild only a
 * const in the same module) and `/* @__PURE__ *\/` on the call (the only one that holds when the
 * caller lands in another output chunk, RM0.7f). Both are claims, so they are checked here, from
 * the syntax tree of every `src/**\/*.{ts,tsx,mts,cts}` (never a list):
 *  1. the declaration is still `export const pure = /* @__NO_SIDE_EFFECTS__ *\/ <arrow>`;
 *  2. the name is bound as `import { pure } from ".../pure.js"` and nothing else: no alias, no
 *     namespace or default import, no re-export, no local `pure`, no use of the name other than as a
 *     callee (each would hide a call from this scan);
 *  3. every `pure(...)` call carries `@__PURE__`, and its one argument is an arrow with no
 *     parameters (an arrow, not a function reference: `pure(f)` is not provably effect-free);
 *  4. the arrow body has no effect outside the value it builds (card: never mark a value with side
 *     effects as pure). Scopes are tracked per nested function and block, a name bound to an outer
 *     binding stays outer (`const t = SHARED; t.push(1)`), and the checks are: no assignment to,
 *     update of, delete of, or mutating method call (`push`, `set`, `sort`, ...) on an outer binding;
 *     no `await`/`yield`/`throw`; no registry call (`register*`, `set*Backend`); no I/O or
 *     ambient-state global (`console`, `process`, `Date`, `Math.random`, `globalThis`, ...); `new X`
 *     only for a built-in container or typed array (anything else fails closed), and a tagged
 *     template only as `String.raw`.
 *
 * What the marks DO to a bundle is `playground/test/pure-bundle.test.ts` (red-first, through
 * rolldown); `playground/e2e/preview3d.spec.ts` keeps a tree-shake regression net over the built
 * playground.
 *
 * KNOWN LIMITS, so this is a syntax check and not a proof of purity: a callee's own effects are not
 * followed (a helper that writes foreign state, called from the arrow, is invisible here; neither
 * does `test/no-import-side-effects.test.ts`, which sees only top-level statements and registry
 * names); a value a CALL returns is treated as fresh (`getShared().push(1)`); a mutation through a
 * callback parameter of an outer array is not seen.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "src");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.d\.(ts|mts|cts)$/.test(entry.name)) out.push(p);
  }
  return out.sort();
}

const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
  "set",
  "add",
  "delete",
  "clear",
  "assign",
  "defineProperty",
  "defineProperties",
  "setPrototypeOf",
]);
const AMBIENT = new Set([
  "console",
  "process",
  "globalThis",
  "window",
  "document",
  "self",
  "localStorage",
  "sessionStorage",
  "fetch",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "require",
  "performance",
  "Date",
  "Atomics",
  "WeakRef",
]);
/** Constructors that build a value and touch nothing else. Anything else fails closed. */
const PURE_CONSTRUCTORS = new Set([
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Array",
  "Object",
  "RegExp",
  "String",
  "Number",
  "Boolean",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
]);
const REGISTRY = /^(register[A-Z]\w*|set\w*Backend|setBuiltinDispatch)$/;

/** One lexical scope: name → whether the binding aliases something from outside the `pure()` arrow. */
interface Scope {
  vars: Map<string, boolean>;
  parent: Scope | undefined;
}

/** `true` / `false` for a name a scope declares (outer alias or not), `undefined` when none does. */
function lookup(scope: Scope | undefined, name: string): boolean | undefined {
  for (let s = scope; s; s = s.parent) {
    const v = s.vars.get(name);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Does `e` denote (a part of) something bound outside the arrow? A call or a literal is a fresh value. */
function isOuter(e: ts.Expression, scope: Scope): boolean {
  if (ts.isIdentifier(e)) return lookup(scope, e.text) !== false;
  if (e.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return isOuter(e.expression, scope);
  if (
    ts.isParenthesizedExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e)
  )
    return isOuter(e.expression, scope);
  if (ts.isTypeAssertionExpression(e)) return isOuter(e.expression, scope);
  if (ts.isConditionalExpression(e)) return isOuter(e.whenTrue, scope) || isOuter(e.whenFalse, scope);
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.QuestionQuestionToken
    )
      return isOuter(e.left, scope) || isOuter(e.right, scope);
    if (k === ts.SyntaxKind.CommaToken) return isOuter(e.right, scope);
  }
  return false;
}

function declare(name: ts.BindingName, outer: boolean, scope: Scope): void {
  if (ts.isIdentifier(name)) scope.vars.set(name.text, outer);
  else for (const el of name.elements) if (ts.isBindingElement(el)) declare(el.name, outer, scope);
}

const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isFunctionDeclaration(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n) ||
  ts.isConstructorDeclaration(n);

/** The effects found in an arrow's body, each as a short reason. */
function effectsOf(arrow: ts.ArrowFunction): string[] {
  const found: string[] = [];
  const text = (n: ts.Node): string => n.getText();

  const visit = (n: ts.Node, scope: Scope): void => {
    let inner = scope;
    if (isFunctionLike(n)) {
      inner = { vars: new Map(), parent: scope };
      if (ts.isFunctionDeclaration(n) && n.name) scope.vars.set(n.name.text, false);
      for (const p of n.parameters) declare(p.name, false, inner);
    } else if (
      ts.isBlock(n) ||
      ts.isCaseBlock(n) ||
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isCatchClause(n)
    ) {
      inner = { vars: new Map(), parent: scope };
      if (ts.isCatchClause(n) && n.variableDeclaration) declare(n.variableDeclaration.name, false, inner);
    } else if (ts.isClassDeclaration(n) && n.name) scope.vars.set(n.name.text, false);

    if (ts.isVariableDeclaration(n)) {
      const loop = n.parent.parent;
      const outer =
        ts.isForOfStatement(loop) || ts.isForInStatement(loop)
          ? isOuter(loop.expression, scope)
          : n.initializer
            ? isOuter(n.initializer, scope)
            : false;
      declare(n.name, outer, scope);
    }

    check(n, scope);
    ts.forEachChild(n, (c) => visit(c, inner));
  };

  const check = (n: ts.Node, scope: Scope): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const l = n.left;
      const target = ts.isIdentifier(l) || ts.isPropertyAccessExpression(l) || ts.isElementAccessExpression(l);
      if (!target) found.push(`destructuring-assigns ${text(l)}`);
      else if (isOuter(l, scope)) found.push(`assigns to ${text(l)}`);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      if (isOuter(n.operand, scope)) found.push(`updates ${text(n.operand)}`);
    } else if (ts.isDeleteExpression(n)) {
      if (isOuter(n.expression, scope)) found.push(`deletes ${text(n.expression)}`);
    } else if (ts.isAwaitExpression(n)) found.push("awaits");
    else if (ts.isYieldExpression(n)) found.push("yields");
    else if (ts.isThrowStatement(n)) found.push("throws");
    else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : undefined;
      if (name && REGISTRY.test(name)) found.push(`calls the registry mutator ${name}`);
      if (
        ts.isPropertyAccessExpression(callee) &&
        MUTATING_METHODS.has(callee.name.text) &&
        isOuter(callee.expression, scope)
      )
        found.push(`calls the mutating ${text(callee)}`);
      if (ts.isElementAccessExpression(callee) && isOuter(callee.expression, scope)) {
        const key = callee.argumentExpression;
        if (!ts.isStringLiteralLike(key) || MUTATING_METHODS.has(key.text))
          found.push(`calls the computed ${text(callee)}`);
      }
    } else if (ts.isNewExpression(n)) {
      const c = n.expression;
      if (!ts.isIdentifier(c) || lookup(scope, c.text) !== undefined || !PURE_CONSTRUCTORS.has(c.text))
        found.push(`constructs the unvetted ${text(c)}`);
    } else if (ts.isTaggedTemplateExpression(n)) {
      if (text(n.tag) !== "String.raw") found.push(`calls the tag ${text(n.tag)}`);
    } else if (ts.isIdentifier(n) && AMBIENT.has(n.text) && lookup(scope, n.text) === undefined) {
      // A bare reference to an ambient global (not a property name, e.g. `x.process`).
      const p = n.parent;
      const isMember = ts.isPropertyAccessExpression(p) && p.name === n;
      const isKey = ts.isPropertyAssignment(p) && p.name === n;
      if (!isMember && !isKey) found.push(`reads the ambient ${n.text}`);
    } else if (
      ts.isPropertyAccessExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "Math" &&
      n.name.text === "random"
    )
      found.push("reads Math.random");
  };

  const root: Scope = { vars: new Map(), parent: undefined };
  // The arrow's own scope: it has no parameters (checked elsewhere), so its body starts empty.
  visit(arrow.body, { vars: new Map(), parent: root });
  return found;
}

interface Site {
  where: string;
  marked: boolean;
  arrow: ts.ArrowFunction | undefined;
  nargs: number;
}

interface Analysis {
  sites: Site[];
  /** Ways the file hides or misuses the name `pure`, each one a failure. */
  problems: string[];
}

const PURE_MODULE = /(^|\/)pure(\.js|\.ts)?$/;

function analyze(file: string, text: string): Analysis {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const at = (n: ts.Node): string => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const sites: Site[] = [];
  const problems: string[] = [];
  let bound = false;

  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      PURE_MODULE.test(st.moduleSpecifier.text)
    ) {
      const c = st.importClause;
      const nb = c?.namedBindings;
      if (!c || c.name || !nb || !ts.isNamedImports(nb)) {
        problems.push(`${at(st)}: imports ${st.moduleSpecifier.text} other than as \`{ pure }\``);
        continue;
      }
      for (const el of nb.elements) {
        if (el.name.text === "pure" && !el.propertyName) bound = true;
        else
          problems.push(`${at(el)}: imports \`${el.getText()}\` from ${st.moduleSpecifier.text}, not exactly \`pure\``);
      }
    } else if (
      ts.isExportDeclaration(st) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      PURE_MODULE.test(st.moduleSpecifier.text)
    )
      problems.push(`${at(st)}: re-exports from ${st.moduleSpecifier.text}`);
  }

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "pure") {
      // The mark sits right before the callee. (`getLeadingCommentRanges` skips a comment on the
      // same line as a non-initial position, so the text before the call is read instead.)
      const marked = /\/\*\s*[@#]__PURE__\s*\*\/\s*$/.test(text.slice(Math.max(0, n.getStart() - 40), n.getStart()));
      const first = n.arguments[0];
      if (!bound) problems.push(`${at(n)}: calls \`pure\` with no \`import { pure }\` from pure.js in this file`);
      sites.push({
        where: at(n),
        marked,
        arrow: first && ts.isArrowFunction(first) ? first : undefined,
        nargs: n.arguments.length,
      });
    } else if (ts.isIdentifier(n) && n.text === "pure") {
      const p = n.parent;
      const isCallee = ts.isCallExpression(p) && p.expression === n;
      const isImportName = ts.isImportSpecifier(p) || ts.isExportSpecifier(p);
      const isMemberName =
        (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
      if (!isCallee && !isImportName && !isMemberName)
        problems.push(`${at(n)}: uses \`pure\` other than as a callee (\`${p.getText().slice(0, 40)}\`)`);
    } else if (
      ts.isVariableDeclaration(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isParameter(n) ||
      ts.isClassDeclaration(n)
    ) {
      const nm = n.name;
      if (nm && ts.isIdentifier(nm) && nm.text === "pure") problems.push(`${at(n)}: declares its own \`pure\``);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { sites, problems };
}

const FILES = sources(SRC).filter((f) => relative(SRC, f) !== "pure.ts");
const ANALYSES = FILES.map((f) => analyze(f, readFileSync(f, "utf8")));
const SITES = ANALYSES.flatMap((a) => a.sites);

describe("pure() guard (card RM0.7e)", () => {
  it("src/pure.ts still declares `pure` as a @__NO_SIDE_EFFECTS__ arrow const", () => {
    const text = readFileSync(join(SRC, "pure.ts"), "utf8");
    expect(text).toMatch(
      /export const pure = \/\* @__NO_SIDE_EFFECTS__ \*\/ <const T>\(make: \(\) => T\): T => make\(\);/,
    );
  });

  it("the scan finds the call sites (not vacuous)", () => {
    expect(SITES.length).toBeGreaterThan(20);
  });

  it("every file binds `pure` as `import { pure }` and uses it only as a callee", () => {
    expect(ANALYSES.flatMap((a) => a.problems)).toEqual([]);
  });

  it("every pure() call is marked /* @__PURE__ */ (the mark that survives a chunk boundary)", () => {
    const bad = SITES.filter((s) => !s.marked).map((s) => s.where);
    expect(
      bad,
      "write `/* @__PURE__ */ pure(() => value)`: rolldown keeps an unmarked call that lands in another chunk",
    ).toEqual([]);
  });

  it("every pure() call takes one zero-parameter arrow", () => {
    const bad = SITES.filter((s) => s.nargs !== 1 || !s.arrow || s.arrow.parameters.length > 0).map((s) => s.where);
    expect(bad, "pass `() => value`, not a reference or a function expression").toEqual([]);
  });

  it("no pure() argument has a side effect outside the value it builds", () => {
    const bad = SITES.flatMap((s) => (s.arrow ? effectsOf(s.arrow).map((e) => `${s.where}: ${e}`) : []));
    expect(bad, "never mark a value with side effects as pure").toEqual([]);
  });

  describe("the checker itself", () => {
    const IMPORT = `import { pure } from "./pure.js";\n`;
    const effects = (body: string): string[] => {
      const { sites, problems } = analyze("t.ts", `${IMPORT}const x = /* @__PURE__ */ pure(${body});`);
      const site = sites[0];
      return [...problems, ...(site?.arrow ? effectsOf(site.arrow) : ["no arrow"])];
    };
    const problems = (src: string): string[] => analyze("t.ts", src).problems;

    it("accepts reads, spreads, local building and fresh values", () => {
      expect(effects("() => ({ a: [...xs], b: xs.filter((v) => v).map((v) => v + 1) })")).toEqual([]);
      expect(effects("() => { const o: string[] = []; o.push('a'); let i = 0; i++; return o; }")).toEqual([]);
      expect(effects("() => [...xs].sort()")).toEqual([]);
      expect(effects("() => Object.keys(o).sort()")).toEqual([]);
      expect(effects("() => new Map([[1, 2]])")).toEqual([]);
      expect(effects("() => String.raw`a`")).toEqual([]);
    });
    it("rejects foreign writes, registries and ambient state", () => {
      expect(effects("() => { CACHE.set('k', 1); return 1; }")).toHaveLength(1);
      expect(effects("() => { counter++; return 1; }")).toHaveLength(1);
      expect(effects("() => { state.n = 1; return 1; }")).toHaveLength(1);
      expect(effects("() => registerThing(1)")).toHaveLength(1);
      expect(effects("() => { console.log(1); return 1; }").length).toBeGreaterThan(0);
      expect(effects("() => Math.random()")).toHaveLength(1);
      expect(effects("() => new Date()").length).toBeGreaterThan(0);
    });
    it("rejects await, throw and delete", () => {
      expect(effects("async () => await load()")).toEqual(["awaits"]);
      expect(effects("() => { throw new Error('x'); }")).toContain("throws");
      expect(effects("() => { delete OBJ.a; return 1; }")).toHaveLength(1);
      expect(effects("() => { const o = { a: 1 }; delete o.a; return o; }")).toEqual([]);
    });
    it("tracks scopes per function: a nested parameter does not make an outer name local", () => {
      expect(effects("() => { const f = (SHARED: number[]) => SHARED; SHARED.push(1); return f; }")).toHaveLength(1);
      expect(
        effects("() => { { const SHARED: number[] = []; SHARED.push(1); } SHARED.push(2); return 1; }"),
      ).toHaveLength(1);
    });
    it("treats an alias of an outer binding as outer", () => {
      expect(effects("() => { const t = SHARED; t.push(1); return 1; }")).toHaveLength(1);
      expect(effects("() => { const t = SHARED.items; t.push(1); return 1; }")).toHaveLength(1);
      expect(effects("() => { const { items } = SHARED; items.push(1); return 1; }")).toHaveLength(1);
      expect(effects("() => { for (const row of ROWS) row.push(1); return 1; }")).toHaveLength(1);
      expect(effects("() => (flag ? A : B).push(1)")).toHaveLength(1);
      expect(effects("() => (A || [])[0] = 1")).toHaveLength(1);
    });
    it("fails closed on an unknown constructor and on a tagged template", () => {
      expect(effects("() => new Tracker()")).toEqual(["constructs the unvetted Tracker"]);
      expect(effects("() => tag`x`")).toEqual(["calls the tag tag"]);
    });
    it("flags a call without the mark or with a non-arrow", () => {
      const [a] = analyze("t.ts", `${IMPORT}const x = pure(() => 1);`).sites;
      expect(a?.marked).toBe(false);
      const [b] = analyze("t.ts", `${IMPORT}const x = /* @__PURE__ */ pure(f);`).sites;
      expect(b?.arrow).toBeUndefined();
    });
    it("flags every way of hiding a pure call from the scan", () => {
      expect(problems(`import { pure as p } from "./pure.js";\nconst x = /* @__PURE__ */ p(() => 1);`)).not.toEqual([]);
      expect(problems(`import * as P from "../pure.js";\nconst x = /* @__PURE__ */ P.pure(() => 1);`)).not.toEqual([]);
      expect(problems(`import pure from "./pure.js";\nconst x = 1;`)).not.toEqual([]);
      expect(problems(`export { pure } from "./pure.js";`)).not.toEqual([]);
      expect(problems(`const x = /* @__PURE__ */ pure(() => 1);`)).not.toEqual([]);
      expect(problems(`${IMPORT}const q = pure;\nconst x = q(() => 1);`)).not.toEqual([]);
      expect(problems(`${IMPORT}const pure2 = [pure];`)).not.toEqual([]);
      expect(problems(`${IMPORT}function f(pure: number) { return pure; }`)).not.toEqual([]);
      expect(problems(`${IMPORT}const x = /* @__PURE__ */ pure(() => 1);`)).toEqual([]);
    });
  });
});
