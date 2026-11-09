/**
 * Diagnostic-code extractors for tests.
 *
 * Replaces the local `const codes = (src) => lint(src).map((d) => d.code ?? "")` family: import the
 * shape you need, aliased to the name the file already uses (`import { lintCodes as codes }`).
 *
 * - {@link codes}: the codes of `compile(src).diagnostics` (cache off), `""` for a code-less one.
 * - {@link lintCodes}: the codes of `lint(src)`, `""` for a code-less one.
 * - {@link codesOf}: the codes of a diagnostics list or of a compile result.
 */

import { compile, lint } from "../../src/index.js";
import type { Diagnostic } from "../../src/types.js";

/** The codes of a diagnostics list or of a result that carries one, in order, `""` for a code-less entry. */
export function codesOf(from: readonly Diagnostic[] | { diagnostics: readonly Diagnostic[] }): string[] {
  const list = "diagnostics" in from ? from.diagnostics : from;
  return list.map((d) => d.code ?? "");
}

/** The diagnostic codes of `compile(src)`, with the memo cache off. */
export function codes(src: string): string[] {
  return codesOf(compile(src, { noCache: true }));
}

/** The diagnostic codes of `lint(src)`. */
export function lintCodes(src: string): string[] {
  return codesOf(lint(src));
}
