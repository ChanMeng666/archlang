/**
 * Which expression evaluator a resolve context asks for (`ResolveCtx.evaluate` and its
 * deprecated alias, the member named `eval`).
 *
 * A context carries the evaluator twice: `evaluate`, and the older member kept for third-party
 * plugins (ADR 0018: the public surface is append-only). The compiler sets both to one function
 * (`src/ir.ts`). A plugin may wrap a built-in element and hand it a context of its own, spread
 * from the one it was given with one member replaced; before `evaluate` existed such a wrapper
 * replaced the old member, and the built-in honoured it. So no built-in reads either member
 * directly; it evaluates through {@link evaluateIn}, by this rule ({@link evaluatorOf}):
 *
 * 1. Only one of the two is a function: that one.
 * 2. Both, the same function: it.
 * 3. Both, different: the one that is not the compiler's own evaluator, since the other was left
 *    as the compiler built it ({@link markNativeEvaluator}). When neither is the compiler's
 *    (a wrapper replaced both, or built the context itself), `evaluate`.
 *
 * The compiler's evaluator is recognised by a symbol on the function itself, so the mark
 * survives however a wrapper copies the context (a spread, `Object.create`, member by member).
 * It is set on the function the compiler made for this resolve; nothing here holds state.
 *
 * Leaf module: the element modules import it, and `src/registry.ts` imports the element modules,
 * so it cannot live there without an import cycle (`test/no-value-cycles.test.ts`).
 */

import type { Expr } from "./expr.js";

/** The mark on the compiler's own evaluator function (non-enumerable, set once per resolve). */
const NATIVE_EVALUATOR: unique symbol = Symbol("archlang.nativeEvaluator");

/** The two evaluator members a resolve context can carry (each a function, or absent). */
export interface EvaluatorHost {
  readonly evaluate?: unknown;
  readonly eval?: unknown;
}

type Evaluator = (e: Expr) => number;

/** Mark `fn` as the compiler's own evaluator and return it (`src/ir.ts`, on the function it made). */
export function markNativeEvaluator<F extends Evaluator>(fn: F): F {
  Object.defineProperty(fn, NATIVE_EVALUATOR, { value: true });
  return fn;
}

const isNative = (fn: unknown): boolean =>
  typeof fn === "function" && (fn as { [NATIVE_EVALUATOR]?: unknown })[NATIVE_EVALUATOR] === true;

/** The evaluator `ctx` asks for, by the rule in this module's header. */
export function evaluatorOf(ctx: EvaluatorHost): Evaluator {
  const current = ctx.evaluate;
  const legacy = ctx.eval;
  const hasCurrent = typeof current === "function";
  const hasLegacy = typeof legacy === "function";
  if (hasCurrent && hasLegacy && current !== legacy && isNative(current) && !isNative(legacy))
    return legacy as Evaluator;
  if (hasCurrent) return current as Evaluator;
  if (hasLegacy) return legacy as Evaluator;
  // Neither is a function: calling it fails as calling the missing member always did.
  return current as Evaluator;
}

/** Evaluate `e` with the evaluator `ctx` asks for, called on `ctx` as a member call would be. */
export function evaluateIn(ctx: EvaluatorHost, e: Expr): number {
  return evaluatorOf(ctx).call(ctx, e);
}
