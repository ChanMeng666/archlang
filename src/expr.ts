/**
 * Arithmetic expressions: a small Pratt parser + a pure evaluator.
 *
 * Expressions appear anywhere a number does (coordinates, sizes, widths,
 * thickness, offsets). They are parsed into an {@link Expr} AST and evaluated
 * during `resolve` against an {@link Env} of `let`/parameter bindings.
 */

import type { Token, TokenType } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";

export type Expr =
  | { t: "num"; value: number }
  | { t: "ref"; name: string; span?: Span }
  | { t: "unary"; op: "-" | "+"; e: Expr; span?: Span }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%"; l: Expr; r: Expr; span?: Span };

/**
 * A runtime value of the expression language. The language is pure and
 * expand-time: every value is computed during `resolve`, never at runtime.
 * Numbers stay unitless millimetres (no Length/Ratio/Angle — one unit).
 *
 * `fn`/`builtin` are added in later tasks (user functions, built-ins).
 */
export type Value =
  | { t: "num"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "str"; v: string }
  | { t: "arr"; v: Value[] };

export type Env = Map<string, Value>;

/** The source span of an expression, when it carries one (for diagnostics). */
export function exprSpan(e: Expr): Span | undefined {
  return "span" in e ? e.span : undefined;
}

/** Human-readable type name for diagnostics. */
export function typeName(v: Value): string {
  switch (v.t) {
    case "num": return "number";
    case "bool": return "boolean";
    case "str": return "string";
    case "arr": return "array";
  }
}

/** Coerce a Value to a number, diagnosing a mismatch and yielding 0. */
export function asNum(v: Value, onError: (d: Diagnostic) => void, span?: Span): number {
  if (v.t === "num") return v.v;
  onError({ severity: "error", message: `Expected a number but got ${typeName(v)}`, code: "E_TYPE", span });
  return 0;
}

/** Coerce a Value to a boolean, diagnosing a mismatch and yielding false. */
export function asBool(v: Value, onError: (d: Diagnostic) => void, span?: Span): boolean {
  if (v.t === "bool") return v.v;
  onError({ severity: "error", message: `Expected a boolean but got ${typeName(v)}`, code: "E_TYPE", span });
  return false;
}

/** Coerce a Value to a string for interpolation/labels. Numbers/bools stringify
 *  deterministically; arrays render as `[a, b]`. Never errors. */
export function asStr(v: Value): string {
  switch (v.t) {
    case "str": return v.v;
    case "num": return fmtNum(v.v);
    case "bool": return v.v ? "true" : "false";
    case "arr": return `[${v.v.map(asStr).join(", ")}]`;
  }
}

/** Deterministic number → string (mirrors render.ts `fmt`: trim to 3 dp). */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Minimal token-stream the expression parser needs (satisfied by ParseCtx). */
export interface ExprTokens {
  peek(o?: number): Token;
  next(): Token;
  fail(msg: string, t?: Token): never;
}

const BIN_PREC: Partial<Record<TokenType, number>> = {
  plus: 1,
  minus: 1,
  star: 2,
  slash: 2,
  percent: 2,
};
const BIN_OP: Partial<Record<TokenType, "+" | "-" | "*" | "/" | "%">> = {
  plus: "+",
  minus: "-",
  star: "*",
  slash: "/",
  percent: "%",
};

/** Parse an expression (Pratt / precedence-climbing). */
export function parseExpr(ts: ExprTokens): Expr {
  return parseBin(ts, 1);
}

function parseBin(ts: ExprTokens, minPrec: number): Expr {
  let left = parseUnary(ts);
  for (;;) {
    const t = ts.peek();
    const prec = BIN_PREC[t.type];
    if (prec === undefined || prec < minPrec) break;
    ts.next();
    const right = parseBin(ts, prec + 1);
    left = { t: "bin", op: BIN_OP[t.type]!, l: left, r: right };
  }
  return left;
}

function parseUnary(ts: ExprTokens): Expr {
  const t = ts.peek();
  if (t.type === "minus" || t.type === "plus") {
    ts.next();
    return { t: "unary", op: t.type === "minus" ? "-" : "+", e: parseUnary(ts) };
  }
  return parseAtom(ts);
}

function parseAtom(ts: ExprTokens): Expr {
  const t = ts.peek();
  if (t.type === "number") {
    ts.next();
    return { t: "num", value: t.num! };
  }
  if (t.type === "ident") {
    ts.next();
    return { t: "ref", name: t.value, span: { start: t.start, end: t.end } };
  }
  if (t.type === "lparen") {
    ts.next();
    const e = parseExpr(ts);
    const close = ts.peek();
    if (close.type !== "rparen") ts.fail(`Expected ")" but found ${describe(close)}`);
    ts.next();
    return e;
  }
  return ts.fail(`Expected a number, name, or "(" but found ${describe(t)}`);
}

const NUM0: Value = { t: "num", v: 0 };

/** Evaluate an expression to a {@link Value}. Errors (unknown ref, type
 *  mismatch, division by zero) emit a diagnostic and yield a safe default so
 *  resolution can continue and report everything. */
export function evalExpr(e: Expr, env: Env, onError: (d: Diagnostic) => void): Value {
  switch (e.t) {
    case "num":
      return { t: "num", v: e.value };
    case "ref": {
      const v = env.get(e.name);
      if (v === undefined) {
        const hint = closest(e.name, [...env.keys()]);
        onError({
          severity: "error",
          message: `Unknown name "${e.name}"`,
          code: "E_UNKNOWN_REF",
          span: e.span,
          hints: hint ? [`did you mean "${hint}"?`] : undefined,
        });
        return NUM0;
      }
      return v;
    }
    case "unary": {
      const v = asNum(evalExpr(e.e, env, onError), onError, e.span);
      return { t: "num", v: e.op === "-" ? -v : v };
    }
    case "bin": {
      const l = asNum(evalExpr(e.l, env, onError), onError, e.span);
      const r = asNum(evalExpr(e.r, env, onError), onError, e.span);
      switch (e.op) {
        case "+": return { t: "num", v: l + r };
        case "-": return { t: "num", v: l - r };
        case "*": return { t: "num", v: l * r };
        case "/":
        case "%":
          if (r === 0) {
            onError({ severity: "error", message: `${e.op === "/" ? "Division" : "Modulo"} by zero`, code: "E_DIV_ZERO", span: e.span });
            return NUM0;
          }
          return { t: "num", v: e.op === "/" ? l / r : l % r };
      }
    }
  }
}

function describe(t: Token): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}

/** Nearest candidate within a small edit distance, for "did you mean" hints. */
export function closest(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // Only suggest when reasonably close (≤ 2 edits, or ≤ a third of the length).
  const limit = Math.max(2, Math.floor(name.length / 3));
  return best !== null && bestDist <= limit ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}
