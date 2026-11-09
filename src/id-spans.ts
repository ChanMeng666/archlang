/**
 * The byte span of an element statement's `id=<name>` name, kept beside the AST. A leaf: the
 * parser records spans here and the resolver reads them, so reading one never loads the parser.
 */

import type { Span } from "./diagnostics.js";

/**
 * The byte span of each element statement's `id=<name>` NAME, kept beside the AST rather than
 * in it, so the AST (and every projection of it, `arch ast --json` included) is unchanged. Read
 * by a diagnostic that is about the id itself (`E_WALL_ID_RESERVED`).
 */
const ID_SPANS = new WeakMap<object, Span>();

/** The span of a parsed element's authored `id=` name, when it has one. */
export function idSpanOf(node: object): Span | undefined {
  return ID_SPANS.get(node);
}

/** Record the span of a parsed element's authored `id=` name. */
export function recordIdSpan(node: object, span: Span): void {
  ID_SPANS.set(node, span);
}
