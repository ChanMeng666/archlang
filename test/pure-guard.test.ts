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
 * the syntax tree of every `src/**\/*.ts` (never a list):
 *  1. the declaration is still `export const pure = /* @__NO_SIDE_EFFECTS__ *\/ <arrow>`;
 *  2. every `pure(...)` call carries `@__PURE__`, and its one argument is an arrow with no
 *     parameters (an arrow, not a function reference: `pure(f)` is not provably effect-free);
 *  3. the arrow body has no effect outside the value it builds (card: never mark a value with side
 *     effects as pure): no assignment to, or mutating call on, anything declared outside the arrow;
 *     no `await`/`yield`/`delete`/`throw`; no registry call (`register*`, `set*Backend`); no I/O or
 *     ambient-state global (`console`, `process`, `Date`, `Math.random`, `globalThis`, ...).
 *
 * The built-chunk half is `playground/e2e/preview3d.spec.ts` ("startup chunks"): a compiler-only
 * chunk carries no value `pure()` wraps and the playground never reads.
 *
 * KNOWN LIMIT: a callee that itself writes foreign state is not followed; the marks are
 * a claim about the arguments' syntax, and `test/no-import-side-effects.test.ts` covers the rest.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(ROOT, "src");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(p);
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
]); // prettier-ignore
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
]); // prettier-ignore
const REGISTRY = /^(register[A-Z]\w*|set\w*Backend|setBuiltinDispatch)$/;

/** The leftmost identifier of `a.b[c].d`, or undefined for anything not rooted in one. */
function rootIdent(e: ts.Expression): string | undefined {
  let x = e;
  for (;;) {
    if (ts.isIdentifier(x)) return x.text;
    if (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) x = x.expression;
    else if (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
    else return undefined;
  }
}

/** Names a binding pattern or parameter list declares. */
function bindingNames(n: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(n)) into.add(n.text);
  else for (const el of n.elements) if (ts.isBindingElement(el)) bindingNames(el.name, into);
}

/** Every name declared anywhere inside `arrow` (parameters, variables, nested functions). */
function localNames(arrow: ts.ArrowFunction): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) bindingNames(n.name, names);
    else if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text);
    else if (ts.isCatchClause(n) && n.variableDeclaration) bindingNames(n.variableDeclaration.name, names);
    ts.forEachChild(n, visit);
  };
  visit(arrow);
  return names;
}

/** The effects found in an arrow's body, each as a short reason. */
function effectsOf(arrow: ts.ArrowFunction): string[] {
  const locals = localNames(arrow);
  const outside = (e: ts.Expression): boolean => {
    const r = rootIdent(e);
    return r === undefined || !locals.has(r);
  };
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      if (outside(n.left)) found.push(`assigns to ${n.left.getText()}`);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      if (outside(n.operand)) found.push(`updates ${n.operand.getText()}`);
    } else if (ts.isDeleteExpression(n) && outside(n.expression)) found.push(`deletes ${n.expression.getText()}`);
    else if (ts.isAwaitExpression(n)) found.push("awaits");
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
      if (ts.isPropertyAccessExpression(callee) && MUTATING_METHODS.has(callee.name.text) && outside(callee.expression))
        found.push(`calls the mutating ${callee.getText()}`);
      if (ts.isIdentifier(callee) && AMBIENT.has(callee.text)) found.push(`calls the ambient ${callee.text}`);
    } else if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && AMBIENT.has(n.expression.text))
      found.push(`reads the ambient ${n.expression.text}`);
    else if (ts.isIdentifier(n) && AMBIENT.has(n.text) && !locals.has(n.text)) {
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
    ts.forEachChild(n, visit);
  };
  visit(arrow.body);
  return found;
}

interface Site {
  where: string;
  marked: boolean;
  arrow: ts.ArrowFunction | undefined;
  nargs: number;
}

function callSites(file: string, text: string): Site[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const out: Site[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "pure") {
      // The mark sits right before the callee. (`getLeadingCommentRanges` skips a comment on the
      // same line as a non-initial position, so the text before the call is read instead.)
      const marked = /\/\*\s*[@#]__PURE__\s*\*\/\s*$/.test(text.slice(Math.max(0, n.getStart() - 40), n.getStart()));
      const first = n.arguments[0];
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
      out.push({
        where: `${relative(ROOT, file).replace(/\\/g, "/")}:${line + 1}`,
        marked,
        arrow: first && ts.isArrowFunction(first) ? first : undefined,
        nargs: n.arguments.length,
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const SITES = sources(SRC)
  .filter((f) => relative(SRC, f) !== "pure.ts")
  .flatMap((f) => callSites(f, readFileSync(f, "utf8")));

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

  describe("the effect check itself", () => {
    const effects = (body: string): string[] => {
      const text = `const x = /* @__PURE__ */ pure(${body});`;
      const [site] = callSites("t.ts", text);
      return site?.arrow ? effectsOf(site.arrow) : ["no arrow"];
    };
    it("accepts reads, spreads and local building", () => {
      expect(effects("() => ({ a: [...xs], b: xs.filter((v) => v).map((v) => v + 1) })")).toEqual([]);
      expect(effects("() => { const o: string[] = []; o.push('a'); let i = 0; i++; return o; }")).toEqual([]);
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
    it("flags a call without the mark or with a non-arrow", () => {
      const [a] = callSites("t.ts", "const x = pure(() => 1);");
      expect(a?.marked).toBe(false);
      const [b] = callSites("t.ts", "const x = /* @__PURE__ */ pure(f);");
      expect(b?.arrow).toBeUndefined();
    });
  });
});
