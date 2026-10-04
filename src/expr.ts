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

/**
 * Where a name an {@link Env} does NOT bind is looked up before it is reported unknown: an
 * imported component's body falls back to its own module's plan-level `let`s (`ir.ts`,
 * `moduleFallback`). Held beside the map, never in it, so every name the env binds — a
 * parameter, a local, a root plan `let`, a built-in — wins, and a lookup that succeeds
 * without it evaluates, copies and charges exactly what it did before it existed: only a
 * lookup that would otherwise be `E_UNKNOWN_REF` / `E_UNKNOWN_FN` ever consults it.
 */
export type EnvFallback = (name: string) => Value | undefined;
const fallbacks = new WeakMap<Env, EnvFallback>();

/** Give `env` a {@link EnvFallback} (an env snapshot of a scope that has one). */
export function setEnvFallback(env: Env, fallback: EnvFallback): void {
  fallbacks.set(env, fallback);
}

/** `env`'s binding of `name`, else its fallback's, else undefined. */
function lookup(env: Env, name: string): Value | undefined {
  return env.get(name) ?? fallbacks.get(env)?.(name);
}

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

/** The one diagnostic for a number that left the finite range (overflow to ±Infinity or a
 *  NaN). The number domain is CLOSED: every producer substitutes 0 beside this diagnostic, so
 *  no non-finite value ever reaches geometry, an index or a printed label. */
export function nonFinite(onError: (d: Diagnostic) => void, span?: Span, what = "Number"): void {
  onError({
    severity: "error",
    message: `${what} is not finite (the result overflows the number range)`,
    code: "E_NON_FINITE",
    span,
  });
}

/** What an evaluation refused by the stack budget yields: the number 0, but a distinct object so
 *  a consumer that wanted another type (an `if` condition, an indexed array, a `for` iterable)
 *  stays silent instead of adding a spurious type error beside the budget's own diagnostic. */
export const BUDGET_SUBSTITUTE: Value = { t: "num", v: 0 };

/** Coerce a Value to a number, diagnosing a mismatch and yielding 0. A non-finite number
 *  is refused here too (defence in depth: producers already yield 0 beside their own
 *  `E_NON_FINITE`, so this fires only for a value that bypassed them). */
export function asNum(v: Value, onError: (d: Diagnostic) => void, span?: Span): number {
  if (v.t === "num") {
    if (Number.isFinite(v.v)) return v.v;
    nonFinite(onError, span);
    return 0;
  }
  onError({ severity: "error", message: `Expected a number but got ${typeName(v)}`, code: "E_TYPE", span });
  return 0;
}

/** Coerce a Value to a boolean, diagnosing a mismatch and yielding false. */
export function asBool(v: Value, onError: (d: Diagnostic) => void, span?: Span): boolean {
  if (v.t === "bool") return v.v;
  // The stack budget's stand-in is not the user's mistake: it was already diagnosed.
  if (v === BUDGET_SUBSTITUTE) return false;
  onError({ severity: "error", message: `Expected a boolean but got ${typeName(v)}`, code: "E_TYPE", span });
  return false;
}

/** Coerce a Value to a string for interpolation/labels. Numbers/bools stringify
 *  deterministically; arrays render as `[a, b]`. Never errors. */
export function asStr(v: Value): string {
  // Printing an array builds a new string: its length is measured and charged to the step
  // budget (`MAX_EVAL_STEPS`) BEFORE it is built, so an array of large strings cannot
  // allocate past the budget (1,100 references to a 1 Mi-character string threw
  // `RangeError: Invalid string length`). A string, number or boolean allocates nothing
  // new of any size.
  if (v.t === "arr") chargeSteps(printedLength(v));
  return printValue(v);
}

/** A scalar's printed form (anything but an array). */
function printScalar(v: Value): string {
  switch (v.t) {
    case "str":
      return v.v;
    case "num":
      return fmtNum(v.v);
    case "bool":
      return v.v ? "true" : "false";
    case "arr":
      return ""; // unreachable: arrays are walked by the callers
    case "fn":
    case "builtin":
      return "<function>";
  }
}

/**
 * The string {@link asStr} returns, with no charge (the caller has charged its length):
 * `[a, b]`, recursively. Walked with an explicit stack, never the JS one: an array nested
 * 10,000 deep (`a = [a, 2]` in a loop) overflowed the call stack and threw `RangeError:
 * Maximum call stack size exceeded` out of `compile()`. Depth costs nothing here but its
 * items, which {@link printedLength} has already charged.
 */
function printValue(v: Value): string {
  if (v.t !== "arr") return printScalar(v);
  const out: string[] = ["["];
  const stack: { items: Value[]; i: number }[] = [{ items: v.v, i: 0 }];
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    if (top.i >= top.items.length) {
      out.push("]");
      stack.pop();
      continue;
    }
    if (top.i > 0) out.push(", ");
    const x = top.items[top.i++]!;
    if (x.t === "arr") {
      out.push("[");
      stack.push({ items: x.v, i: 0 });
    } else out.push(printScalar(x));
  }
  return out.join("");
}

/**
 * The length {@link printValue} will return, measured without building it, with the same
 * explicit stack. Each array item walked is a step, so an array nested in itself many times
 * over (whose printed form doubles per level) is stopped by the walk before any length is
 * summed.
 */
function printedLength(v: Value): number {
  if (v.t !== "arr") return printScalar(v).length;
  let n = 0;
  const stack: Value[][] = [v.v];
  while (stack.length > 0) {
    const items = stack.pop()!;
    chargeSteps(items.length);
    n += 2 + 2 * Math.max(0, items.length - 1);
    for (const x of items) {
      if (x.t === "arr") stack.push(x.v);
      else n += x.t === "str" ? x.v.length : printScalar(x).length;
    }
  }
  return n;
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
  /** Record a NON-fatal catalogued error and carry on (a literal the lexer replaced by 0
   *  inside a `"{…}"` interpolation). Absent, such an error falls back to {@link fail}. */
  report?(code: string, message: string, span: Span): void;
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

/**
 * How an expression is parsed in one particular slot.
 *
 * `noModulo` exists for the one slot where `%` is a SUFFIX rather than an operator:
 * an opening's `on <wall> at <pos>`, where `40%` means "40 per cent of the wall run".
 * The lexer emits `40%` as `number` + `percent`, so without this the shared Pratt
 * parser would read the suffix as a modulo and go looking for a right operand (in
 * `door on w1 at 40% width 900`, it finds the keyword `width` and takes it as a bare
 * reference). The rule the flag states is one line: **inside an attachment position,
 * `%` always terminates the expression.** Modulo is still reachable there inside
 * parentheses — a parenthesised sub-expression is parsed by a fresh {@link parseExpr}
 * with no options, and a `%` inside brackets cannot be the terminator anyway.
 */
export interface ParseExprOpts {
  /** Treat `%` as a terminator rather than the modulo operator (see above). */
  noModulo?: boolean;
}

/**
 * The deepest nesting the parser accepts, for statement blocks (`for`/`if`/`zone`/…) and for
 * expressions alike. Both are recursive descents (and the expander and evaluator recurse over
 * the result), and a few thousand levels overflow the JS stack — a `RangeError` thrown out of
 * `compile()`. This limit is ~6x below the lowest depth that overflowed when measured (about
 * 1,560 levels) and far above any real plan (a handful), so it refuses only pathological
 * input — with an `E_PARSE` diagnostic, never a throw. One limit serves blocks, parentheses and
 * tree height, so it also caps a flat chain `a + b + …` at 257 terms (a chain is
 * left-deep, one binary node per `+`, and the evaluator recurses down it); a longer sum is
 * written with `for` and an accumulator instead.
 */
export const MAX_NEST_DEPTH = 256;

/** Parser recursion depth of the expression being read (parens, arrays, calls, `if`,
 *  indexes, unary chains). Module state is safe: parsing is synchronous, and every increment
 *  is undone in a `finally`. */
let exprDepth = 0;
/** AST height of each built node. Parentheses build no node, so {@link exprDepth} bounds
 *  them; this bounds the height of the TREE (a flat `1+1+…+1` is left-deep), which is what
 *  the evaluator and every AST walker recurse over. */
const heights = new WeakMap<object, number>();

const tooDeep = (ts: ExprTokens): never => ts.fail(`Expression is nested too deeply (limit ${MAX_NEST_DEPTH})`);

/** Register a freshly built node's height; refuse it once the tree gets too tall. */
function sealed<T extends Expr>(ts: ExprTokens, e: T, kids: readonly (Expr | undefined)[]): T {
  let h = 0;
  for (const k of kids) h = Math.max(h, (k && heights.get(k)) || 0);
  if (++h > MAX_NEST_DEPTH) tooDeep(ts);
  heights.set(e, h);
  return e;
}

/** Parse an expression (Pratt / precedence-climbing). */
export function parseExpr(ts: ExprTokens, opts?: ParseExprOpts): Expr {
  if (exprDepth >= MAX_NEST_DEPTH) tooDeep(ts);
  exprDepth++;
  try {
    return parseBin(ts, 1, opts);
  } finally {
    exprDepth--;
  }
}

function parseBin(ts: ExprTokens, minPrec: number, opts?: ParseExprOpts): Expr {
  // Where this whole sub-expression begins, taken from the TOKEN stream rather than
  // from the parsed left operand. It used to be `spanOf(left)`, and a `num` (or `bool`)
  // atom carries no span at all — so every `bin`/`range` node whose left operand is a
  // literal was built with `span: undefined`, and every diagnostic the evaluator raises
  // from one (`E_DIV_ZERO`, `E_TYPE`, `E_INDEX`) came back UNLOCATABLE: a real code, a
  // real message, and nothing for an editor or `arch fix` to point at. `1200 / 0` in a
  // width had the same hole as one in an attachment position. Spanning from the first
  // token to the last also makes the span the WHOLE expression rather than just its
  // left half, which is what a reader expects a "Division by zero" to underline.
  const startTok = ts.peek();
  const spanTo = (): Span => ({ start: startTok.start, end: ts.peek(-1).end });
  let left = parseUnary(ts);
  for (;;) {
    const t = ts.peek();
    if (t.type === "dotdot") {
      if (RANGE_PREC < minPrec) break;
      ts.next();
      const right = parseBin(ts, RANGE_PREC + 1, opts);
      left = sealed(ts, { t: "range", lo: left, hi: right, span: spanTo() } as Expr, [left, right]);
      continue;
    }
    if (t.type === "percent" && opts?.noModulo) break;
    const prec = BIN_PREC[t.type];
    if (prec === undefined || prec < minPrec) break;
    ts.next();
    const right = parseBin(ts, prec + 1, opts);
    left = sealed(ts, { t: "bin", op: BIN_OP[t.type]!, l: left, r: right, span: spanTo() } as Expr, [left, right]);
  }
  return left;
}

function parseUnary(ts: ExprTokens): Expr {
  const t = ts.peek();
  if (t.type === "minus" || t.type === "plus" || t.type === "bang") {
    ts.next();
    const op = t.type === "minus" ? "-" : t.type === "plus" ? "+" : "!";
    if (exprDepth >= MAX_NEST_DEPTH) tooDeep(ts);
    exprDepth++;
    try {
      const e = parseUnary(ts);
      return sealed(ts, { t: "unary", op, e, span: { start: t.start, end: t.end } } as Expr, [e]);
    } finally {
      exprDepth--;
    }
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
    e = sealed(ts, { t: "index", base: e, idx, span: { start: t.start, end: close.end } } as Expr, [e, idx]);
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
    return sealed(ts, { t: "arr", items, span: { start: t.start, end: close.end } } as Expr, items);
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
      return sealed(ts, { t: "call", callee: t.value, args, span: { start: t.start, end: close.end } } as Expr, args);
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
  return sealed(ts, { t: "if", cond, then, else: els, span: { start: kw.start, end: close.end } } as Expr, [
    cond,
    then,
    els,
  ]);
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
      // A lexical error with its own code (`E_NON_FINITE`, the literal already replaced by 0)
      // is reported like it is outside a string, at its span in the original source; any other
      // lexical error is fatal for the string.
      const soft = lr.errors.filter((le) => le.code !== undefined);
      const hard = lr.errors.find((le) => le.code === undefined);
      for (const le of soft) {
        const at = { start: le.span.start + baseOffset + i + 1, end: le.span.end + baseOffset + i + 1 };
        if (outer.report) outer.report(le.code!, le.message, at);
        else outer.fail(le.message);
      }
      // After the soft ones, so a string holding both a coded and an uncoded error reports both.
      if (hard) outer.fail(hard.message);
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
  return sealed(
    outer,
    { t: "str", parts, span: { start: baseOffset - 1, end: baseOffset + raw.length + 1 } } as Expr,
    parts.map((p) => (typeof p === "string" ? undefined : p)),
  );
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
    ...(outer.report ? { report: outer.report } : {}),
  };
}

const NUM0: Value = { t: "num", v: 0 };
/** Safety cap on the length of a generated range (deterministic guard). */
const MAX_RANGE = 100_000;
/** Safety cap on function-call nesting (guards against runaway recursion). */
const MAX_CALL_DEPTH = 512;
/**
 * The stack budget shared by the evaluator and the expander (`ir.ts` `expandScope`).
 *
 * Both recurse over user structure (expression trees and user calls; blocks and component
 * instances), and the two nest INSIDE each other — a component body is a stack of blocks, each
 * evaluating expressions — so a bound on either alone leaves their product free to overflow the
 * JS stack. One counter measures the whole stack in "units": a nested evaluation costs
 * {@link EVAL_UNITS}, a nested expansion frame {@link EXPAND_UNITS}. Crossing
 * {@link MAX_STACK_UNITS} is a diagnostic (reported once per crossing), never a throw.
 *
 * ## How the budget was decided
 *
 * Overflow capacity was MEASURED with the budget switched off, cold (a fresh process, Worker or
 * page per probe — the first compile after load is the worst case, frames being bigger before
 * the JIT optimises), by bisecting the size of the worst shapes: a recursive function whose body
 * wraps the recursive call in 3-250 nested `abs(` (call-heavy) or `1+(` (cheap) levels, and a
 * component recursion whose body holds 60-250 nested `if`/`for` blocks. Capacity is the deepest
 * counter value an accepted probe reached (an expansion frame counted as 1):
 *
 * | host (cold)                        | call-heavy eval | cheap eval | expansion frames |
 * | ---------------------------------- | --------------- | ---------- | ---------------- |
 * | Node main thread (dist/)           | 1,266           | 1,518      | 1,009            |
 * | Node worker_threads (default)      | 4,542           | 5,550      | 4,537            |
 * | Chromium Web Worker                | 510             | 738        | 505              |
 * | Firefox Web Worker                 | 1,714           | 1,518      | 1,261            |
 * | WebKit Web Worker                  | 11,346          | 12,450     | 8,317            |
 *
 * (The minimum of each column, lowest host first: Chromium's Worker stack is the binding one.
 * Evaluation and expansion capacities agree within a few percent, which is why a frame is 1
 * unit.) The rule: budget = floor(min capacity / 1.5) = floor(505 / 1.5) = 336, with
 * {@link EXPAND_RESERVE} (200) of it kept free for the expressions evaluated inside a frame. The
 * outcome therefore does not depend on the host, and every host keeps at least 1.5x headroom
 * over its own worst measured shape. The exact figures move with engine versions; the rule is
 * the thing to re-run (`MAX_CALL_DEPTH` and the parser's nesting limit are separate, structural
 * bounds).
 *
 * ## What it costs
 *
 * Accepted depths under the 336 budget: `n + sum(n - 1)` (3 nested evaluations per call) about
 * 110 calls; `f(n - 1)` in `if n < 1 { 0 } else { f(n - 1) }` (2 per call) about 165; a
 * component recursing through `k` nested blocks per level about 136 / (k + 1) levels (`k = 3`:
 * 34 levels; no blocks: all 64 allowed by `MAX_DEPTH`). Without the budget the call cap alone
 * accepted 512 and the component cap 64, but both overflow the stack on the shapes above, so
 * that acceptance was not real. Module state is safe: both walks are synchronous and every
 * increment is undone in a `finally`.
 */
export const EVAL_UNITS = 1;
export const EXPAND_UNITS = 1;
export const MAX_STACK_UNITS = 336;
/** Units an expansion frame leaves free for the expressions evaluated inside it, so a plan
 *  too deep to expand is refused by `E_RECURSION` rather than by a cascade of evaluation errors. */
export const EXPAND_RESERVE = 200;
let stackUse = 0;
let reported = { eval: false, expand: false };

/** Reserve `units` of the stack budget; false (nothing reserved) when it would be exceeded. */
export function enterStack(units: number, reserve = 0): boolean {
  if (stackUse + units + reserve > MAX_STACK_UNITS) return false;
  stackUse += units;
  return true;
}
/** Release what {@link enterStack} reserved. */
export function leaveStack(units: number): void {
  stackUse -= units;
  if (stackUse === 0) reported = { eval: false, expand: false };
}
/** True exactly once per crossing of the budget, per kind (the flag resets when the stack empties). */
export function resetOverflowReports(): void {
  reported = { eval: false, expand: false };
}
/** True when only the outermost expansion frame is active (so a statement of the plan body
 *  starts a fresh crossing, and each independent fault is reported on its own). */
export function atStackRoot(): boolean {
  return stackUse === EXPAND_UNITS;
}
export function firstOverflow(kind: "eval" | "expand"): boolean {
  if (reported[kind]) return false;
  reported[kind] = true;
  return true;
}

/**
 * The evaluation-step budget: ONE deterministic counter across a whole resolution (every
 * storey, component instance, import, function call and loop iteration), so a plan that
 * creates nothing can still not run without bound. `E_ELEMENT_LIMIT` bounds what a plan
 * creates, `E_WHILE_LIMIT` one loop and the stack budget nesting; nested loops, recursion
 * that branches and string doubling multiply inside all three.
 *
 * ## The unit
 *
 * One step is one unit of evaluator work whose cost is bounded by a constant, charged where
 * the work is done, so the time to reach the budget is bounded whatever shape spends it:
 *
 * - an expression node evaluated (every {@link evalExpr} entry, which is every call too);
 * - a statement executed and a `for`/`while` iteration started (`ir.ts` `expandScope`);
 * - a value produced or walked: a range item, a character a string template appends, an
 *   array item `str()`/interpolation prints or `==` compares, a character two strings of
 *   one length compare;
 * - a binding copied: a scope snapshot (`ir.ts` `Scope.flatten`) and a call's closure copy
 *   cost one step per binding, because both copy the whole visible environment;
 * - a cell of a "did you mean" hint's edit distance, and a diagnostic raised during
 *   evaluation ({@link DIAGNOSTIC_STEPS}).
 *
 * Whatever builds a string is charged BEFORE it builds it (`asStr` measures an array's printed
 * length first; a template charges each part before appending it), so no surface can allocate
 * a string past the budget. The walks over a value (`printedLength`, `printValue`, `valueEq`)
 * use an explicit stack, so an array nested 100,000 deep costs its items, never the JS stack.
 *
 * Counting nodes alone was not enough: a statement in a scope with many bindings, a closure
 * copy per call and a doubling string cost work proportional to a size, and each would
 * otherwise spend seconds on a handful of steps (the doubling string threw
 * `RangeError: Invalid string length` out of `compile()`).
 *
 * ## The bound
 *
 * {@link MAX_EVAL_STEPS} was set by measurement (`test/step-budget.test.ts` pins both
 * margins). Over the corpus (examples with `lib`, test fixtures, the recovery corpus, eval
 * goldens, faults and fidelity plans, every `arch` fence of the docs) the median plan spends
 * 79 steps and the largest that compiles 4,974 (`terrace-row`, four placed instances): the
 * bound is 1,005 times that. The catalogue's demonstrations of the other caps spend more by
 * construction (a `while` at its 10,000 iterations 260,090, a range at its 100,000 items
 * 200,078) and still reach their own cap first, 19 times under it. The bound is not set
 * higher because time to reach it is linear in it: on Node 24 M.2's nested loops reach it in
 * about 1 s cold (a loop iteration is about 2 µs and 14 steps), three nested capped `while`s
 * in 0.7 s, recursion that branches in 0.3 s.
 *
 * Past it the resolution stops (`E_STEP_LIMIT`, reported once, at the statement that
 * crossed it). The crossing unwinds with an internal signal ({@link StepLimitSignal}) that
 * `ir.ts` catches inside the resolution and turns into the diagnostic; it never leaves
 * `resolve()`. Every evaluator frame it unwinds releases its stack units in `finally`.
 */
export const MAX_EVAL_STEPS = 5_000_000;

/**
 * What one diagnostic raised during evaluation costs: a retained object with its formatted
 * message and spans, a few hundred bytes. Charged where the resolver records it, so a
 * runaway loop that raises one per iteration is held to tens of thousands of reports, not
 * hundreds of thousands (an unknown name in M.2's nested loops raised 326,000 in 4.5 s).
 */
export const DIAGNOSTIC_STEPS = 64;

/** Where the statement being executed was written, for the {@link StepLimitSignal}'s report. */
export interface StepSite {
  span?: Span;
  /** The imported file the span is measured in (absent = the compiled source). */
  file?: string;
  /** Opaque provenance the resolver re-stamps the report with (the `place` frame). */
  frame?: unknown;
}

/** The meter of the resolution in progress, or null outside one (then nothing is counted).
 *  The site is held field by field so marking a statement allocates nothing. */
interface StepMeter {
  used: number;
  limit: number;
  span: Span | undefined;
  file: string | undefined;
  frame: unknown;
}
let meter: StepMeter | null = null;

/** Thrown when a resolution spends past its step budget; caught by the resolution itself. */
export class StepLimitSignal {
  constructor(readonly at: StepSite) {}
}

/** Charge `n` steps to the active meter; past its limit, unwind with a {@link StepLimitSignal}. */
export function chargeSteps(n: number): void {
  if (meter === null) return;
  meter.used += n;
  if (meter.used > meter.limit) throw new StepLimitSignal({ span: meter.span, file: meter.file, frame: meter.frame });
}

/** The statement now executing, or undefined outside a resolution. */
export function currentStepSite(): StepSite | undefined {
  return meter === null ? undefined : { span: meter.span, file: meter.file, frame: meter.frame };
}

/** Record the statement now executing (the site a crossing is reported at). */
export function stepSite(span: Span | undefined, file?: string, frame?: unknown): void {
  if (meter !== null) {
    meter.span = span;
    meter.file = file;
    meter.frame = frame;
  }
}

/**
 * Run `fn` with a fresh meter starting at `used` steps (what earlier storeys of the same
 * resolution spent), restoring whatever meter was active before. Returns the steps used in
 * total, and the signal when the budget was crossed.
 */
export function withStepMeter<T>(
  used: number,
  fn: () => T,
): { value: T; used: number } | { signal: StepLimitSignal; used: number } {
  const outer = meter;
  const m: StepMeter = { used, limit: MAX_EVAL_STEPS, span: undefined, file: undefined, frame: undefined };
  meter = m;
  try {
    return { value: fn(), used: m.used };
  } catch (e) {
    if (e instanceof StepLimitSignal) return { signal: e, used: m.used };
    throw e;
  } finally {
    meter = outer;
  }
}

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
  // One step per node evaluated (see `MAX_EVAL_STEPS`), taken before any stack unit.
  chargeSteps(1);
  // See `MAX_STACK_UNITS`: nested evaluation shares one stack budget with expansion.
  if (!enterStack(EVAL_UNITS)) {
    if (firstOverflow("eval")) {
      onError({
        severity: "error",
        message: "Evaluation nested too deeply (the recursion or nesting exhausts the evaluator's stack budget)",
        code: "E_CALL_DEPTH",
        span: exprSpan(e),
      });
    }
    return BUDGET_SUBSTITUTE;
  }
  try {
    switch (e.t) {
      case "num":
        return { t: "num", v: e.value };
      case "bool":
        return { t: "bool", v: e.value };
      case "str": {
        let s = "";
        for (const p of e.parts) {
          // A character appended is a step, charged BEFORE the append: a template can double
          // a string per iteration. An array's printed form is charged by `asStr` before it
          // is built; a string, number or boolean part exists already, so only the append
          // is new work.
          if (typeof p === "string") {
            chargeSteps(p.length);
            s += p;
            continue;
          }
          const v = evalExpr(p, env, onError, depth);
          const part = asStr(v);
          if (v.t !== "arr") chargeSteps(part.length);
          s += part;
        }
        return { t: "str", v: s };
      }
      case "arr": {
        const items: Value[] = [];
        for (const it of e.items) items.push(evalExpr(it, env, onError, depth));
        return { t: "arr", v: items };
      }
      case "fnlit":
        return { t: "fn", params: e.params, body: e.body, closure: env };
      case "ref": {
        const v = lookup(env, e.name);
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
          chargeSteps(1);
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
        if (base === BUDGET_SUBSTITUTE) return NUM0;
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
        // Written as the negation of "in range" so a NaN index (every comparison false) is
        // diagnosed as E_INDEX rather than reaching `base.v[NaN]`.
        if (!(k >= 0 && k < base.v.length)) {
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
  } finally {
    leaveStack(EVAL_UNITS);
  }
}

function evalCall(e: Extract<Expr, { t: "call" }>, env: Env, onError: (d: Diagnostic) => void, depth: number): Value {
  // A loop, not `.map`: each nested call would otherwise cost two extra stack frames, and
  // the stack is what bounds nested evaluation (see `MAX_EVAL_NEST`).
  const args: Value[] = [];
  for (const a of e.args) args.push(evalExpr(a, env, onError, depth));
  const callee = lookup(env, e.callee);
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
    // The closure is copied per call: a binding copied is a step (see `MAX_EVAL_STEPS`).
    chargeSteps(callee.closure.size);
    const callEnv: Env = new Map(callee.closure);
    // A function written in an imported component's body keeps the body's fallback.
    const fallback = fallbacks.get(callee.closure);
    if (fallback) fallbacks.set(callEnv, fallback);
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
 *  functions compare by identity). Walked with an explicit stack in the order the
 *  recursive form visited (each array's items left to right, stopping at the first
 *  difference), so a deeply nested array cannot overflow the JS stack. */
function valueEq(a0: Value, b0: Value): boolean {
  const stack: [Value, Value][] = [[a0, b0]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    if (a.t !== b.t) return false;
    if (a.t === "arr" && b.t === "arr") {
      if (a.v.length !== b.v.length) return false;
      // An item compared is a step (`MAX_EVAL_STEPS`).
      chargeSteps(a.v.length);
      for (let i = a.v.length - 1; i >= 0; i--) stack.push([a.v[i]!, b.v[i]!]);
      continue;
    }
    if (a.t === "fn" || a.t === "builtin") {
      if (a !== b) return false;
      continue;
    }
    // Two strings of one length compare character by character: a character is a step.
    if (a.t === "str" && b.t === "str" && a.v.length === b.v.length) chargeSteps(a.v.length);
    // num/bool/str compare by primitive value.
    if ((a as { v: unknown }).v !== (b as { v: unknown }).v) return false;
  }
  return true;
}

/** An arithmetic result as a number Value; a non-finite one is diagnosed at the operation's
 *  span and becomes 0. */
function finiteNum(v: number, e: Extract<Expr, { t: "bin" }>, onError: (d: Diagnostic) => void): Value {
  if (Number.isFinite(v)) return { t: "num", v };
  nonFinite(onError, e.span, `"${e.op}"`);
  return NUM0;
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
      return finiteNum(l + r, e, onError);
    case "-":
      return finiteNum(l - r, e, onError);
    case "*":
      return finiteNum(l * r, e, onError);
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
      return finiteNum(op === "/" ? l / r : l % r, e, onError);
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
  // The edit-distance search is |name| x |candidate| cells per candidate: each cell is an
  // evaluation step (`MAX_EVAL_STEPS`), so a hint raised in a runaway loop is paid for.
  let cells = 0;
  for (const c of candidates) cells += (name.length + 1) * (c.length + 1);
  chargeSteps(cells);
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
