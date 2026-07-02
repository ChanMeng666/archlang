/**
 * Built-in functions: a frozen, pure map injected into the global scope as
 * `builtin` Values. Each is total — bad arity / types emit a diagnostic and
 * return a safe default, never throw — and deterministic (no I/O, no clock).
 *
 * The dispatch is registered into the evaluator via {@link setBuiltinDispatch}
 * so `expr.ts` needs no static import of this module (avoids an import cycle).
 */

import type { Diagnostic, Span } from "./diagnostics.js";
import type { Value } from "./expr.js";
import { asStr, setBuiltinDispatch, typeName } from "./expr.js";

type OnError = (d: Diagnostic) => void;
type BuiltinFn = (args: Value[], onError: OnError, span?: Span) => Value;

const num = (v: number): Value => ({ t: "num", v });

/** Coerce one argument to a number, diagnosing a mismatch and yielding 0. */
function n(v: Value | undefined, onError: OnError, span?: Span): number {
  if (v && v.t === "num") return v.v;
  onError({
    severity: "error",
    message: `Expected a number but got ${v ? typeName(v) : "nothing"}`,
    code: "E_TYPE",
    span,
  });
  return 0;
}

/** Enforce an exact arity; returns true when satisfied. */
function arity(name: string, args: Value[], want: number, onError: OnError, span?: Span): boolean {
  if (args.length === want) return true;
  onError({
    severity: "error",
    message: `"${name}" expects ${want} argument(s) but got ${args.length}`,
    code: "E_ARITY",
    span,
  });
  return false;
}

/** The frozen built-in map. Module-private and never mutated. */
const BUILTINS: ReadonlyMap<string, BuiltinFn> = new Map<string, BuiltinFn>([
  [
    "min",
    (a, e, s) => {
      if (a.length === 0) {
        e({ severity: "error", message: `"min" needs at least 1 argument`, code: "E_ARITY", span: s });
        return num(0);
      }
      return num(Math.min(...a.map((v) => n(v, e, s))));
    },
  ],
  [
    "max",
    (a, e, s) => {
      if (a.length === 0) {
        e({ severity: "error", message: `"max" needs at least 1 argument`, code: "E_ARITY", span: s });
        return num(0);
      }
      return num(Math.max(...a.map((v) => n(v, e, s))));
    },
  ],
  ["abs", (a, e, s) => (arity("abs", a, 1, e, s) ? num(Math.abs(n(a[0], e, s))) : num(0))],
  [
    "sqrt",
    (a, e, s) => {
      if (!arity("sqrt", a, 1, e, s)) return num(0);
      const x = n(a[0], e, s);
      if (x < 0) {
        e({ severity: "error", message: `"sqrt" of a negative number`, code: "E_DOMAIN", span: s });
        return num(0);
      }
      return num(Math.sqrt(x));
    },
  ],
  ["floor", (a, e, s) => (arity("floor", a, 1, e, s) ? num(Math.floor(n(a[0], e, s))) : num(0))],
  ["ceil", (a, e, s) => (arity("ceil", a, 1, e, s) ? num(Math.ceil(n(a[0], e, s))) : num(0))],
  ["round", (a, e, s) => (arity("round", a, 1, e, s) ? num(Math.round(n(a[0], e, s))) : num(0))],
  [
    "len",
    (a, e, s) => {
      if (!arity("len", a, 1, e, s)) return num(0);
      const v = a[0];
      if (v.t === "arr") return num(v.v.length);
      if (v.t === "str") return num(v.v.length);
      e({
        severity: "error",
        message: `"len" expects an array or string but got ${typeName(v)}`,
        code: "E_TYPE",
        span: s,
      });
      return num(0);
    },
  ],
  ["str", (a, e, s) => (arity("str", a, 1, e, s) ? { t: "str", v: asStr(a[0]) } : { t: "str", v: "" })],
]);

/** Names injected into the global scope as `builtin` Values (shadowable by user
 *  `let`s, since they live in a parent scope above the plan's globals). */
export const BUILTIN_NAMES: readonly string[] = [...BUILTINS.keys()];

/** Dispatch a built-in call by name. */
function dispatch(name: string, args: Value[], onError: OnError, span?: Span): Value {
  const fn = BUILTINS.get(name);
  if (!fn) {
    onError({ severity: "error", message: `Unknown built-in "${name}"`, code: "E_UNKNOWN_FN", span });
    return num(0);
  }
  return fn(args, onError, span);
}

// Register dispatch with the evaluator the moment this module loads.
setBuiltinDispatch(dispatch);
