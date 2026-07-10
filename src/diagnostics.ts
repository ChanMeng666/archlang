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

/**
 * How confident a {@link FixSuggestion} is that applying it is correct — the
 * gate an automated applier (`applyFixes`, `arch fix`) uses to decide whether a
 * fix may be applied without human review. Mirrors rustfix / rustc's
 * `Applicability`.
 *
 * - `machine-applicable` — safe to apply automatically; the edit is correct and
 *   complete (this is the only tier applied by default).
 * - `maybe-incorrect` — likely correct but may need review; applied only when a
 *   caller widens the gate.
 * - `has-placeholders` — the `newText` contains `<...>` placeholders the user
 *   must fill in; **never** auto-applied (would produce invalid source).
 * - `unspecified` — confidence unknown; treated conservatively (never
 *   auto-applied).
 */
export type Applicability = "machine-applicable" | "maybe-incorrect" | "has-placeholders" | "unspecified";

/**
 * A single atomic text replacement: replace the ORIGINAL-source bytes in
 * `span` (a half-open `[start, end)` range of offsets into the *unmodified*
 * source) with `newText`. An insertion is `span.start === span.end`.
 *
 * Structurally identical to (and unified with) the LSP {@link
 * import("./lsp.js").TextEdit}; both names name this one shape.
 */
export interface FixEdit {
  span: Span;
  newText: string;
}

/**
 * A proposed fix for a {@link Diagnostic}: a titled bundle of one or more
 * {@link FixEdit}s.
 *
 * Semantics:
 * - **Multiple `fixes` on one diagnostic are mutually-exclusive ALTERNATIVES** —
 *   a tool picks at most one.
 * - **All `edits` within one suggestion are applied together, atomically** — if
 *   any edit of the suggestion cannot be applied (e.g. it overlaps an
 *   already-applied edit) the whole suggestion is rolled back and skipped.
 * - Every edit's `span` is in ORIGINAL-source coordinates (offsets into the
 *   source as first seen), never shifted for earlier edits — the applier
 *   ({@link import("./fix-apply.js").applyFixes}) accounts for shifts via a
 *   piece table.
 * - When `applicability` is `has-placeholders`, `newText` may contain `<...>`
 *   placeholders and the suggestion is never auto-applied.
 */
export interface FixSuggestion {
  /** Human-readable label, e.g. `"add a window to the bedroom"`. */
  title: string;
  applicability: Applicability;
  edits: FixEdit[];
  /** Optional stable id grouping related suggestions (e.g. one lint rule). */
  fixId?: string;
}

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
  /** Machine-applicable fix suggestions (append-only field). Each entry is a
   *  mutually-exclusive alternative; see {@link FixSuggestion}. Consumed by
   *  {@link import("./fix-apply.js").applyFixes} and projected to JSON by
   *  {@link import("./diagnostic-json.js").diagnosticToJson}. */
  fixes?: FixSuggestion[];
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
