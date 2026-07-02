/**
 * Arithmetic expressions: a small Pratt parser + a pure evaluator.
 *
 * Expressions appear anywhere a number does (coordinates, sizes, widths,
 * thickness, offsets). They are parsed into an {@link Expr} AST and evaluated
 * during `resolve` against an {@link Env} of `let`/parameter bindings.
 */

import type { Token, TokenType } from "./lexer.js";
import { lex } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";

/** Binary operators, by category (arithmetic, comparison, equality, logical). */
export type BinOp = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||";

export type Expr =
  | { t: "num"; value: number }
  | { t: "bool"; value: boolean }
  /** String template: literal segments interleaved with interpolated exprs. A
   *  plain string is a single literal part. */
  | { t: "str"; parts: (string | Expr)[]; span?: Span }
  | { t: "arr"; items: Expr[]; span?: Span }
  | { t: "ref"; name: string; span?: Span }
  | { t: "unary"; op: "-" | "+" | "!"; e: Expr; span?: Span }
  | { t: "bin"; op: BinOp; l: Expr; r: Expr; span?: Span }
  /** Half-open integer range `lo..hi` → `[lo, lo+1, …, hi-1]`. */
  | { t: "range"; lo: Expr; hi: Expr; span?: Span }
  /** `base[idx]` array indexing. */
  | { t: "index"; base: Expr; idx: Expr; span?: Span }
  /** `callee(args)` — user functions / built-ins. */
  | { t: "call"; callee: string; args: Expr[]; span?: Span }
  /** A function literal from `let f(params) = body`; evaluates to an `fn` Value
   *  closing over the defining scope. */
  | { t: "fnlit"; params: string[]; body: Expr; span?: Span }
  /** `if cond { then } else { else }` as an expression. */
  | { t: "if"; cond: Expr; then: Expr; else: Expr; span?: Span };

/**
 * A runtime value of the expression language. The language is pure and
 * expand-time: every value is computed during `resolve`, never at runtime.
 * Numbers stay unitless millimetres (no Length/Ratio/Angle — one unit).
 */
export type Value =
  | { t: "num"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "str"; v: string }
  | { t: "arr"; v: Value[] }
  /** A user value-function (closure): captures the bindings visible where it
   *  was defined. */
  | { t: "fn"; params: string[]; body: Expr; closure: Env }
  /** A built-in function, dispatched by name through the frozen builtins map. */
  | { t: "builtin"; name: string };

export type Env = Map<string, Value>;

/** The source span of an expression, when it carries one (for diagnostics). */
export function exprSpan(e: Expr): Span | undefined {
  return "span" in e ? e.span : undefined;
}

/** Human-readable type name for diagnostics. */
export function typeName(v: Value): string {
  switch (v.t) {
    case "num":
      return "number";
    case "bool":
      return "boolean";
    case "str":
      return "string";
    case "arr":
      return "array";
    case "fn":
    case "builtin":
      return "function";
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
    case "str":
      return v.v;
    case "num":
      return fmtNum(v.v);
    case "bool":
      return v.v ? "true" : "false";
    case "arr":
      return `[${v.v.map(asStr).join(", ")}]`;
    case "fn":
    case "builtin":
      return "<function>";
  }
}

/** Deterministic number → string (trim to 3 dp, non-finite → "0"). */
import { fmt3 as fmtNum } from "./num-format.js";

/** Minimal token-stream the expression parser needs (satisfied by ParseCtx). */
export interface ExprTokens {
  peek(o?: number): Token;
  next(): Token;
  fail(msg: string, t?: Token): never;
  /** Recovery hook: is `value` a keyword that begins a plan/body statement?
   *  Lets the atom parser refuse to swallow the next statement's keyword as a
   *  bare reference when a previous statement is incomplete. */
  isStatementStart?(value: string): boolean;
}

// Binary-operator precedence, lowest binds loosest. Range (`..`) sits between
// comparison and additive and is handled specially (it builds a `range` node).
const BIN_PREC: Partial<Record<TokenType, number>> = {
  or: 1,
  and: 2,
  eq: 3,
  ne: 3,
  lt: 4,
  gt: 4,
  le: 4,
  ge: 4,
  plus: 6,
  minus: 6,
  star: 7,
  slash: 7,
  percent: 7,
};
const BIN_OP: Partial<Record<TokenType, BinOp>> = {
  or: "||",
  and: "&&",
  eq: "==",
  ne: "!=",
  lt: "<",
  gt: ">",
  le: "<=",
  ge: ">=",
  plus: "+",
  minus: "-",
  star: "*",
  slash: "/",
  percent: "%",
};
const RANGE_PREC = 5;

/** Parse an expression (Pratt / precedence-climbing). */
export function parseExpr(ts: ExprTokens): Expr {
  return parseBin(ts, 1);
}

function parseBin(ts: ExprTokens, minPrec: number): Expr {
  let left = parseUnary(ts);
  for (;;) {
    const t = ts.peek();
    if (t.type === "dotdot") {
      if (RANGE_PREC < minPrec) break;
      ts.next();
      const right = parseBin(ts, RANGE_PREC + 1);
      left = { t: "range", lo: left, hi: right, span: spanOf(left) };
      continue;
    }
    const prec = BIN_PREC[t.type];
    if (prec === undefined || prec < minPrec) break;
    ts.next();
    const right = parseBin(ts, prec + 1);
    left = { t: "bin", op: BIN_OP[t.type]!, l: left, r: right, span: spanOf(left) };
  }
  return left;
}

function parseUnary(ts: ExprTokens): Expr {
  const t = ts.peek();
  if (t.type === "minus" || t.type === "plus" || t.type === "bang") {
    ts.next();
    const op = t.type === "minus" ? "-" : t.type === "plus" ? "+" : "!";
    return { t: "unary", op, e: parseUnary(ts), span: { start: t.start, end: t.end } };
  }
  return parsePostfix(ts);
}

/** An atom followed by zero or more `[index]` postfixes. */
function parsePostfix(ts: ExprTokens): Expr {
  let e = parseAtom(ts);
  for (;;) {
    const t = ts.peek();
    if (t.type !== "lbracket") break;
    ts.next();
    const idx = parseExpr(ts);
    const close = ts.peek();
    if (close.type !== "rbracket") ts.fail(`Expected "]" but found ${describe(close)}`);
    ts.next();
    e = { t: "index", base: e, idx, span: { start: t.start, end: close.end } };
  }
  return e;
}

function eatType(ts: ExprTokens, type: TokenType): Token {
  const t = ts.peek();
  if (t.type !== type) ts.fail(`Expected ${type} but found ${describe(t)}`);
  return ts.next();
}

function parseAtom(ts: ExprTokens): Expr {
  const t = ts.peek();
  if (t.type === "number") {
    ts.next();
    return { t: "num", value: t.num! };
  }
  if (t.type === "string") {
    ts.next();
    return parseTemplate(t.raw ?? "", t.start + 1, ts);
  }
  if (t.type === "lbracket") {
    ts.next();
    const items: Expr[] = [];
    while (ts.peek().type !== "rbracket" && ts.peek().type !== "eof") {
      items.push(parseExpr(ts));
      if (ts.peek().type === "comma") ts.next();
      else break;
    }
    const close = ts.peek();
    if (close.type !== "rbracket") ts.fail(`Expected "]" or "," in array but found ${describe(close)}`);
    ts.next();
    return { t: "arr", items, span: { start: t.start, end: close.end } };
  }
  if (t.type === "ident") {
    if (t.value === "true" || t.value === "false") {
      ts.next();
      return { t: "bool", value: t.value === "true" };
    }
    if (t.value === "if") return parseIfExpr(ts);
    // A name immediately followed by "(" is a function/built-in call.
    if (ts.peek(1).type === "lparen") {
      ts.next(); // name
      ts.next(); // (
      const args: Expr[] = [];
      while (ts.peek().type !== "rparen" && ts.peek().type !== "eof") {
        args.push(parseExpr(ts));
        if (ts.peek().type === "comma") ts.next();
        else break;
      }
      const close = ts.peek();
      if (close.type !== "rparen") ts.fail(`Expected ")" or "," in call but found ${describe(close)}`);
      ts.next();
      return { t: "call", callee: t.value, args, span: { start: t.start, end: close.end } };
    }
    // Recovery guard: a statement-start keyword that begins a new line is almost
    // certainly the next statement (the current one is incomplete) — refuse to
    // swallow it as a bare reference so the parser can resynchronize on it. A
    // same-line keyword-named binding (`let grid = 5; … grid x grid`) still works.
    if (ts.isStatementStart?.(t.value)) {
      const prev = ts.peek(-1);
      if (!prev || prev.line < t.line) ts.fail(`Expected a value but found "${t.value}"`, t);
    }
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
  return ts.fail(`Expected a value but found ${describe(t)}`);
}

/** `if cond { thenExpr } else { elseExpr }` as an expression (else required). */
function parseIfExpr(ts: ExprTokens): Expr {
  const kw = ts.next(); // "if"
  const cond = parseExpr(ts);
  eatType(ts, "lcurly");
  const then = parseExpr(ts);
  eatType(ts, "rcurly");
  const elseKw = ts.peek();
  if (!(elseKw.type === "ident" && elseKw.value === "else")) {
    ts.fail(`Expected "else" in if-expression but found ${describe(elseKw)}`);
  }
  ts.next();
  eatType(ts, "lcurly");
  const els = parseExpr(ts);
  const close = eatType(ts, "rcurly");
  return { t: "if", cond, then, else: els, span: { start: kw.start, end: close.end } };
}

function spanOf(e: Expr): Span | undefined {
  return "span" in e ? e.span : undefined;
}

/** Parse a string's raw inner source into a template: literal segments split on
 *  unescaped `{…}` interpolations. Literal braces are `\{` / `\}`. */
function parseTemplate(raw: string, baseOffset: number, outer: ExprTokens): Expr {
  const parts: (string | Expr)[] = [];
  let lit = "";
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "\\") {
      const n = raw[i + 1] ?? "";
      lit += n === "n" ? "\n" : n;
      i += 2;
      continue;
    }
    if (c === "{") {
      let j = i + 1;
      let depth = 1;
      let inner = "";
      while (j < raw.length) {
        const d = raw[j];
        if (d === "{") depth++;
        else if (d === "}") {
          depth--;
          if (depth === 0) break;
        }
        inner += d;
        j++;
      }
      if (depth !== 0) outer.fail('Unterminated "{" interpolation in string');
      if (lit) {
        parts.push(lit);
        lit = "";
      }
      const lr = lex(inner);
      if (lr.errors.length) outer.fail(lr.errors[0]!.message);
      const its = tokensOver(lr.tokens, baseOffset + i + 1, outer);
      const ex = parseExpr(its);
      if (its.peek().type !== "eof") outer.fail(`Unexpected ${describe(its.peek())} in interpolation`);
      parts.push(ex);
      i = j + 1;
      continue;
    }
    if (c === "}") outer.fail('Unexpected "}" in string (use \\} for a literal brace)');
    lit += c;
    i++;
  }
  if (lit || parts.length === 0) parts.push(lit);
  return { t: "str", parts, span: { start: baseOffset - 1, end: baseOffset + raw.length + 1 } };
}

/** An {@link ExprTokens} over a fixed token array (for interpolation sub-parses),
 *  shifting spans back into the original source and delegating `fail` outward. */
function tokensOver(toks: Token[], shift: number, outer: ExprTokens): ExprTokens {
  let pos = 0;
  // A lexed token list always ends with EOF, so the clamped index is present.
  const at = (o = 0) => toks[Math.min(pos + o, toks.length - 1)]!;
  const shifted = (t: Token): Token => ({ ...t, start: t.start + shift, end: t.end + shift });
  return {
    peek: (o = 0) => shifted(at(o)),
    next: () => shifted(toks[Math.min(pos++, toks.length - 1)]!),
    fail: (msg) => outer.fail(msg),
  };
}

const NUM0: Value = { t: "num", v: 0 };
/** Safety cap on the length of a generated range (deterministic guard). */
const MAX_RANGE = 100_000;
/** Safety cap on function-call nesting (guards against runaway recursion). */
const MAX_CALL_DEPTH = 512;

/** Built-in dispatch is injected by {@link setBuiltinDispatch} (from builtins.ts)
 *  to avoid a static import cycle. Until set, built-in calls are unknown. */
let builtinDispatch: ((name: string, args: Value[], onError: (d: Diagnostic) => void, span?: Span) => Value) | null =
  null;
export function setBuiltinDispatch(fn: typeof builtinDispatch): void {
  builtinDispatch = fn;
}

/** Evaluate an expression to a {@link Value}. Errors (unknown ref, type
 *  mismatch, division by zero, bad index, arity, recursion) emit a diagnostic
 *  and yield a safe default so resolution can continue and report everything.
 *  `depth` bounds function-call nesting; callers pass 0. */
export function evalExpr(e: Expr, env: Env, onError: (d: Diagnostic) => void, depth = 0): Value {
  switch (e.t) {
    case "num":
      return { t: "num", v: e.value };
    case "bool":
      return { t: "bool", v: e.value };
    case "str": {
      let s = "";
      for (const p of e.parts) s += typeof p === "string" ? p : asStr(evalExpr(p, env, onError, depth));
      return { t: "str", v: s };
    }
    case "arr":
      return { t: "arr", v: e.items.map((it) => evalExpr(it, env, onError, depth)) };
    case "fnlit":
      return { t: "fn", params: e.params, body: e.body, closure: env };
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
      if (e.op === "!") {
        return { t: "bool", v: !asBool(evalExpr(e.e, env, onError, depth), onError, e.span) };
      }
      const v = asNum(evalExpr(e.e, env, onError, depth), onError, e.span);
      return { t: "num", v: e.op === "-" ? -v : v };
    }
    case "bin":
      return evalBin(e, env, onError, depth);
    case "range": {
      const lo = asNum(evalExpr(e.lo, env, onError, depth), onError, e.span);
      const hi = asNum(evalExpr(e.hi, env, onError, depth), onError, e.span);
      const items: Value[] = [];
      let n = 0;
      for (let v = lo; v < hi; v += 1) {
        if (n++ >= MAX_RANGE) {
          onError({
            severity: "error",
            message: `Range too large (limit ${MAX_RANGE})`,
            code: "E_RANGE_LIMIT",
            span: e.span,
          });
          break;
        }
        items.push({ t: "num", v });
      }
      return { t: "arr", v: items };
    }
    case "index": {
      const base = evalExpr(e.base, env, onError, depth);
      const i = asNum(evalExpr(e.idx, env, onError, depth), onError, e.span);
      if (base.t !== "arr") {
        onError({
          severity: "error",
          message: `Cannot index a ${typeName(base)} (only arrays)`,
          code: "E_TYPE",
          span: e.span,
        });
        return NUM0;
      }
      const k = Math.trunc(i);
      if (k < 0 || k >= base.v.length) {
        onError({
          severity: "error",
          message: `Index ${k} out of range for array of length ${base.v.length}`,
          code: "E_INDEX",
          span: e.span,
        });
        return NUM0;
      }
      return base.v[k]!;
    }
    case "if": {
      const c = asBool(evalExpr(e.cond, env, onError, depth), onError, e.span);
      return evalExpr(c ? e.then : e.else, env, onError, depth);
    }
    case "call":
      return evalCall(e, env, onError, depth);
  }
}

function evalCall(e: Extract<Expr, { t: "call" }>, env: Env, onError: (d: Diagnostic) => void, depth: number): Value {
  const args = e.args.map((a) => evalExpr(a, env, onError, depth));
  const callee = env.get(e.callee);
  if (callee && callee.t === "fn") {
    if (args.length !== callee.params.length) {
      onError({
        severity: "error",
        message: `Function "${e.callee}" expects ${callee.params.length} argument(s) but got ${args.length}`,
        code: "E_ARITY",
        span: e.span,
      });
    }
    if (depth >= MAX_CALL_DEPTH) {
      onError({
        severity: "error",
        message: `Call stack too deep (limit ${MAX_CALL_DEPTH}) calling "${e.callee}"`,
        code: "E_CALL_DEPTH",
        span: e.span,
      });
      return NUM0;
    }
    const callEnv: Env = new Map(callee.closure);
    callee.params.forEach((p, i) => {
      callEnv.set(p, args[i] ?? NUM0);
    });
    return evalExpr(callee.body, callEnv, onError, depth + 1);
  }
  if (callee && callee.t === "builtin" && builtinDispatch) {
    return builtinDispatch(callee.name, args, onError, e.span);
  }
  const hint = closest(e.callee, [...env.keys()]);
  onError({
    severity: "error",
    message: `Unknown function "${e.callee}"`,
    code: "E_UNKNOWN_FN",
    span: e.span,
    hints: hint ? [`did you mean "${hint}"?`] : undefined,
  });
  return NUM0;
}

/** Structural equality across Value kinds (cross-type compares unequal;
 *  functions compare by identity). */
function valueEq(a: Value, b: Value): boolean {
  if (a.t !== b.t) return false;
  if (a.t === "arr" && b.t === "arr") {
    return a.v.length === b.v.length && a.v.every((x, i) => valueEq(x, b.v[i]!));
  }
  if (a.t === "fn" || a.t === "builtin") return a === b;
  // num/bool/str compare by primitive value.
  return (a as { v: unknown }).v === (b as { v: unknown }).v;
}

function evalBin(e: Extract<Expr, { t: "bin" }>, env: Env, onError: (d: Diagnostic) => void, depth: number): Value {
  const op = e.op;
  // Logical operators short-circuit (so the RHS isn't evaluated needlessly).
  if (op === "&&" || op === "||") {
    const l = asBool(evalExpr(e.l, env, onError, depth), onError, e.span);
    if (op === "&&" && !l) return { t: "bool", v: false };
    if (op === "||" && l) return { t: "bool", v: true };
    return { t: "bool", v: asBool(evalExpr(e.r, env, onError, depth), onError, e.span) };
  }
  // Equality works on any matching Value kind.
  if (op === "==" || op === "!=") {
    const eq = valueEq(evalExpr(e.l, env, onError, depth), evalExpr(e.r, env, onError, depth));
    return { t: "bool", v: op === "==" ? eq : !eq };
  }
  // Remaining operators are numeric (comparisons and arithmetic).
  const l = asNum(evalExpr(e.l, env, onError, depth), onError, e.span);
  const r = asNum(evalExpr(e.r, env, onError, depth), onError, e.span);
  switch (op) {
    case "<":
      return { t: "bool", v: l < r };
    case ">":
      return { t: "bool", v: l > r };
    case "<=":
      return { t: "bool", v: l <= r };
    case ">=":
      return { t: "bool", v: l >= r };
    case "+":
      return { t: "num", v: l + r };
    case "-":
      return { t: "num", v: l - r };
    case "*":
      return { t: "num", v: l * r };
    case "/":
    case "%":
      if (r === 0) {
        onError({
          severity: "error",
          message: `${op === "/" ? "Division" : "Modulo"} by zero`,
          code: "E_DIV_ZERO",
          span: e.span,
        });
        return NUM0;
      }
      return { t: "num", v: op === "/" ? l / r : l % r };
    default:
      return NUM0; // unreachable: logical/equality ops returned above
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
    let prev = dp[0]!;
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i]!;
      dp[i] = Math.min(dp[i]! + 1, dp[i - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m]!;
}
