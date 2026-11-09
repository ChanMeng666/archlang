/**
 * The two source-token formatters Plan JSON's projector and emitter share: a leaf module (no
 * parser, no validator), so `to-json.ts` can print a token without loading `from-json.ts`.
 */

import { escapeStr } from "../expr-source.js";
import { plainDigits } from "../num-format.js";

/** Deterministic number → source token (no scientific notation; normalize -0).
 *  Deliberately full-precision `String(n)`, NOT `src/num-format.ts`'s 3-dp `fmt3`
 *  (`statement-print.ts`'s `numStr`): Plan JSON round-trips a RESOLVED, already-rounded
 *  number, so re-quantizing it here would only lose precision a second time for
 *  nothing — this emitter also never touches `statement-print.ts`, since it prints from
 *  validated JSON values, not the `Expr` AST that module's leaf printer takes.
 *  `String(n)` with its exponent expanded ({@link plainDigits}): `String(1e-9)` is `1e-9`, which
 *  the lexer (no exponent form) read as `1` then `e`, an `E_PARSE` (EH1.15). */
export function num(n: number): string {
  if (Object.is(n, -0)) return "0";
  return plainDigits(n);
}

/** A literal string as an ArchLang `"…"` template, through the language's own escaper
 *  ({@link escapeStr}, so `{`/`}`/`"`/`\`/newline stay literal and cannot end the literal). */
export function q(s: string): string {
  return `"${escapeStr(s)}"`;
}
