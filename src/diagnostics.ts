/**
 * Diagnostics for the ArchLang compiler.
 *
 * A {@link Diagnostic} is the single, span-carrying problem record produced by
 * every compiler stage (lex/parse/validate). The legacy `{message, line, col}`
 * `errors`/`warnings` arrays on {@link import("./types.js").CompileResult} are
 * *derived* from these. {@link formatDiagnostic} renders a codespan-style,
 * caret-framed snippet — zero dependencies, pure, isomorphic.
 */

/** A half-open byte range `[start, end)` into the source string. */
export interface Span {
  start: number;
  end: number;
}

export type Severity = "error" | "warning";

/** A secondary source location that explains a diagnostic (e.g. the wall a
 *  misplaced door was expected to lie on). */
export interface RelatedSpan {
  span: Span;
  message: string;
}

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** Source location; absent for whole-program problems (e.g. an empty plan). */
  span?: Span;
  /** Stable machine code, e.g. `"E_ROOM_SIZE"`. */
  code?: string;
  /** Optional follow-up suggestions, each rendered as a `= help:` line. */
  hints?: string[];
  /** Secondary locations that contextualize the problem (rendered as framed
   *  `note:` snippets after the primary span). */
  relatedSpans?: RelatedSpan[];
}

/** Convert a byte offset into a 1-based `{line, col}`. Offsets are clamped. */
export function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  const o = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let col = 1;
  for (let k = 0; k < o; k++) {
    if (source[k] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

/** Byte offset of the start of the line containing `offset`. */
function lineStart(source: string, offset: number): number {
  let k = Math.max(0, Math.min(offset, source.length));
  while (k > 0 && source[k - 1] !== "\n") k--;
  return k;
}

/** Byte offset just past the end of the line containing `offset` (excludes `\n`). */
function lineEnd(source: string, offset: number): number {
  let k = Math.max(0, Math.min(offset, source.length));
  while (k < source.length && source[k] !== "\n") k++;
  return k;
}

/**
 * Render a diagnostic as a framed source snippet:
 *
 * ```text
 * error[E_ROOM_SIZE]: room "bed" must have a positive size
 *   --> 4:30
 *    |
 *  4 | room id=bed at (0,0) size 0x4000
 *    |                           ^^^^^^ width is 0
 *    = help: did you mean 3000x4000?
 * ```
 *
 * With no `span`, only the header line is produced.
 */
export function formatDiagnostic(source: string, d: Diagnostic): string {
  const codeTag = d.code ? `[${d.code}]` : "";
  const header = `${d.severity}${codeTag}: ${d.message}`;
  const lines: string[] = [header];

  if (d.span) {
    const { line, col } = offsetToLineCol(source, d.span.start);
    const ls = lineStart(source, d.span.start);
    const le = lineEnd(source, d.span.start);
    const srcLine = source.slice(ls, le);
    // Underline within this one line; multi-line spans underline to line end.
    const caretStart = d.span.start - ls;
    const caretEnd = Math.min(d.span.end, le) - ls;
    const caretLen = Math.max(1, caretEnd - caretStart);

    const gutter = String(line);
    const pad = " ".repeat(gutter.length);
    lines.push(`${pad} --> ${line}:${col}`);
    lines.push(`${pad} |`);
    lines.push(`${gutter} | ${srcLine}`);
    lines.push(`${pad} | ${" ".repeat(caretStart)}${"^".repeat(caretLen)}`);
    for (const hint of d.hints ?? []) {
      lines.push(`${pad} = help: ${hint}`);
    }
  } else {
    for (const hint of d.hints ?? []) {
      lines.push(`  = help: ${hint}`);
    }
  }

  // Related locations: a small framed snippet per secondary span.
  for (const rel of d.relatedSpans ?? []) {
    const { line, col } = offsetToLineCol(source, rel.span.start);
    const ls = lineStart(source, rel.span.start);
    const le = lineEnd(source, rel.span.start);
    const srcLine = source.slice(ls, le);
    const caretStart = rel.span.start - ls;
    const caretLen = Math.max(1, Math.min(rel.span.end, le) - ls - caretStart);
    const gutter = String(line);
    const pad = " ".repeat(gutter.length);
    lines.push(`${pad} --> ${line}:${col}`);
    lines.push(`${gutter} | ${srcLine}`);
    lines.push(`${pad} | ${" ".repeat(caretStart)}${"-".repeat(caretLen)} note: ${rel.message}`);
  }

  return lines.join("\n");
}
