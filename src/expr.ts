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
  | { t: "unary"; op: "-" | "+"; e: Expr }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%"; l: Expr; r: Expr };

export type Env = Map<string, number>;

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

/** Evaluate an expression. Errors (unknown ref, division by zero) emit a
 *  diagnostic and yield 0 so resolution can continue and report everything. */
export function evalExpr(e: Expr, env: Env, onError: (d: Diagnostic) => void): number {
  switch (e.t) {
    case "num":
      return e.value;
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
        return 0;
      }
      return v;
    }
    case "unary": {
      const v = evalExpr(e.e, env, onError);
      return e.op === "-" ? -v : v;
    }
    case "bin": {
      const l = evalExpr(e.l, env, onError);
      const r = evalExpr(e.r, env, onError);
      switch (e.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/":
        case "%":
          if (r === 0) {
            onError({ severity: "error", message: `${e.op === "/" ? "Division" : "Modulo"} by zero`, code: "E_DIV_ZERO" });
            return 0;
          }
          return e.op === "/" ? l / r : l % r;
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
