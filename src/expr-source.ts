/**
 * `exprToSource(e)` — render an {@link Expr} back to canonical ArchLang source
 * text (single-line, precedence-correct parenthesisation).
 *
 * Extracted so it has exactly one home: the source formatter (`format.ts`) and
 * the fix producers (`fix-producers.ts`) both re-emit expressions and must agree
 * byte-for-byte. Dependency-light on purpose (only `num-format`) so importing it
 * from an element's `resolve` introduces no parser/registry import cycle.
 */

import type { Expr } from "./expr.js";
import { fmtLiteral, fmtSource } from "./num-format.js";

/**
 * The printer every numeric literal goes through, here and in `statement-print.ts`.
 * `fmtSource` (3 dp on the 0.001 mm lattice) for the fix producers, `repair` and every other
 * tool that prints values it COMPUTED, whose last digits are float noise; `arch fmt` switches it
 * to the lossless `fmtLiteral` for the length of one synchronous `format()` call
 * ({@link withLosslessLiterals}), since every number it prints is one the author wrote (M.8).
 * One binding, swapped and restored in a `finally`, so the printers keep their one shape and no
 * caller outside `format()` ever sees the lossless printer.
 */
let literalPrinter: (n: number) => string = fmtSource;

/** A numeric literal as source text, through the printer in force (see {@link literalPrinter}). */
export const numLiteral = (n: number): string => literalPrinter(n);

/** Run `f` with every numeric literal printed losslessly (`fmtLiteral`); `arch fmt`'s one entry. */
export function withLosslessLiterals<T>(f: () => T): T {
  const prev = literalPrinter;
  literalPrinter = fmtLiteral;
  try {
    return f();
  } finally {
    literalPrinter = prev;
  }
}

const BIN_PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
};
const RANGE_PREC = 5;

/** Binding strength of an expression (atoms/calls bind tightest). */
function precOf(e: Expr): number {
  if (e.t === "bin") return BIN_PREC[e.op]!;
  if (e.t === "range") return RANGE_PREC;
  return 99;
}

/** Render a child, wrapping in parens when its precedence is below `min`. */
function child(e: Expr, min: number): string {
  const s = exprToSource(e);
  return precOf(e) < min ? `(${s})` : s;
}

/** Escape a literal string segment back to ArchLang source form. */
export function escapeStr(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

/** A string template `"…{expr}…"` rebuilt from its parts. */
function strStr(parts: (string | Expr)[]): string {
  let out = '"';
  for (const p of parts) out += typeof p === "string" ? escapeStr(p) : `{${exprToSource(p)}}`;
  return out + '"';
}

/** Render an expression to canonical single-line source text. */
export function exprToSource(e: Expr): string {
  switch (e.t) {
    case "num":
      return numLiteral(e.value);
    case "bool":
      return e.value ? "true" : "false";
    case "ref":
      return e.name;
    case "str":
      return strStr(e.parts);
    case "arr":
      return `[${e.items.map(exprToSource).join(", ")}]`;
    case "unary":
      return `${e.op}${child(e.e, 99)}`;
    case "bin":
      return `${child(e.l, BIN_PREC[e.op]!)} ${e.op} ${child(e.r, BIN_PREC[e.op]! + 1)}`;
    case "range":
      return `${child(e.lo, RANGE_PREC)}..${child(e.hi, RANGE_PREC + 1)}`;
    case "index":
      return `${child(e.base, 99)}[${exprToSource(e.idx)}]`;
    case "call":
      return `${e.callee}(${e.args.map(exprToSource).join(", ")})`;
    case "fnlit":
      return `(${e.params.join(", ")}) = ${exprToSource(e.body)}`;
    case "if":
      return `if ${exprToSource(e.cond)} { ${exprToSource(e.then)} } else { ${exprToSource(e.else)} }`;
  }
}
