/**
 * The byte span of an element statement's `id=<name>` name, and of the one word a did-you-mean
 * fix rewrites (AF2), kept beside the AST. A leaf: the parser records spans here and the resolver
 * reads them, so reading one never loads the parser.
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

/**
 * The byte span of the one word a did-you-mean fix rewrites (AF2), kept beside the AST for the
 * same reason: a furniture statement's kind word (keyed by its node) and a relational room's
 * reference id (keyed by its `rel`).
 */
const WORD_SPANS = new WeakMap<object, Span>();

/** The span of the word recorded for `key`, when the parser recorded one. */
export function wordSpanOf(key: object): Span | undefined {
  return WORD_SPANS.get(key);
}

/** Record the span of the word a fix for `key` would rewrite. */
export function recordWordSpan(key: object, span: Span): void {
  WORD_SPANS.set(key, span);
}
