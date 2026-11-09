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
  /**
   * The module path this suggestion's edit spans are offsets into, when that is NOT the
   * source being fixed — i.e. the defect lives in an `import`ed `.arch` file. Absent (the
   * overwhelmingly common case) means "the source you passed in", exactly as before.
   *
   * {@link import("./fix-apply.js").applyFixes} **refuses** to apply a suggestion that
   * carries one. Applying it would splice bytes measured in another file into this one —
   * an off-wall door inside an imported component would rewrite the middle of the
   * importer's `wall` statement. Append-only field.
   */
  file?: string;
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
  /**
   * Which **storey** raised it, for a multi-storey plan (`level <n> { … }`) — the
   * authored level number, not an index. Absent for a single-storey plan and for
   * whole-file problems (lex/parse/link diagnostics, and the one sheet warning that
   * describes the building rather than a page), so existing output is unchanged.
   *
   * Append-only field. Every level resolves separately, so the same source span can be
   * reported once per storey (a shared `let` that fails, say); this is how a consumer
   * tells those apart and how `arch describe --level N` attributes a problem.
   */
  level?: number;
  /**
   * The FILE this diagnostic's `span` (and every `fixes[].edits[].span`) is measured in,
   * when that is not the compiled source: the module path of the `import`ed `.arch` file
   * whose component body raised it. Absent = the source passed to `compile()`.
   *
   * This exists because a component's body statements carry spans into the file they were
   * WRITTEN in, while the diagnostic is reported against the file being COMPILED. Without
   * it those offsets silently address unrelated bytes of the importer (verified: an
   * imported component's `W_DOOR_OFF_WALL` fix rewrote the middle of the importer's
   * `wall` statement). Consumers must treat a diagnostic with `file` as pointing into
   * that file, and never render it against the compiled source. Append-only field.
   */
  file?: string;
  /**
   * The `place … as <name>` instance whose expansion raised it — dotted for a nested
   * instance (`west.inner`). Absent for the root plan and for a legacy bare component
   * call (which has no instance identity by design). Append-only field.
   */
  instance?: string;
  /** The component the {@link instance} was made from. Append-only field. */
  component?: string;
}

/**
 * The line-start table of a source: `starts[i]` is the offset of the first byte of line
 * `i + 1`, so `starts[0]` is `0` and every `\n` at offset `k` adds `k + 1`. Only `\n` ends a
 * line (a `\r` is an ordinary column, as it always was). Built once per source and kept in
 * a small count-bounded FIFO, newest first, so the many `offsetToLineCol` calls one compile
 * makes for its diagnostics share one O(n) scan.
 */
const lineTables: { src: string; starts: Uint32Array }[] = [];
const LINE_TABLE_MAX = 8;

function lineStartsOf(source: string): Uint32Array {
  for (const t of lineTables) if (t.src === source) return t.starts;
  let count = 1;
  for (let k = source.indexOf("\n"); k !== -1; k = source.indexOf("\n", k + 1)) count++;
  const starts = new Uint32Array(count);
  let i = 1;
  for (let k = source.indexOf("\n"); k !== -1; k = source.indexOf("\n", k + 1)) starts[i++] = k + 1;
  if (lineTables.length >= LINE_TABLE_MAX) lineTables.pop();
  lineTables.unshift({ src: source, starts });
  return starts;
}

/** Clear the line-start tables (called by `clearCache`). */
export function clearLineTableCache(): void {
  lineTables.length = 0;
}

/**
 * Convert a byte offset into a 1-based `{line, col}`. Offsets are clamped. `line` is one
 * more than the `\n`s before the offset; `col` one more than the bytes since the last of
 * them. O(log lines) per call after the source's first (see {@link lineStartsOf}).
 */
export function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  const clamped = Math.max(0, Math.min(offset, source.length));
  if (!(clamped > 0)) return { line: 1, col: 1 }; // 0, and NaN (which counts no bytes)
  const o = Math.ceil(clamped); // a fractional offset counts the bytes below it
  const starts = lineStartsOf(source);
  // The last line start at or before `o`.
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (starts[mid]! <= o) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: o - starts[lo]! + 1 };
}

/**
 * The most diagnostics one compile reports (ruling EH-D8). Past it the producers stop
 * collecting and {@link capDiagnostics} appends ONE limit diagnostic, so a source that floods
 * them (a page of stray characters, thousands of re-declared names) costs a bounded amount of
 * reporting. A count, never a time; no example plan comes near it.
 */
export const MAX_DIAGNOSTICS = 500;

/** The cap's own marker, in either severity. */
const isMarker = (d: Diagnostic): boolean => d.code === "E_DIAGNOSTIC_LIMIT" || d.code === "W_DIAGNOSTIC_LIMIT";

/**
 * The budget and cap codes: each says why work STOPPED, so the cap never drops one (a flood of
 * `E_UNKNOWN_REF` must not hide the `E_STEP_LIMIT` that ended it). Every catalogue code naming a
 * LIMIT or BUDGET, bar the marker itself (pinned in test/diagnostics-volume.test.ts). Each is
 * raised once per budget or loop and charged to the step meter, so keeping them all stays bounded.
 */
export const LIMIT_CODES: ReadonlySet<string> = new Set([
  "E_DRAWING_LIMIT",
  "E_ELEMENT_LIMIT",
  "E_IMPORT_LIMIT",
  "E_KEEP_LIMIT",
  "E_RANGE_LIMIT",
  "E_RATE_LIMITED",
  "E_STEP_LIMIT",
  "E_WHILE_LIMIT",
]);

/** A diagnostic the cap always keeps (see {@link LIMIT_CODES}). */
export const isLimitClass = (d: Diagnostic): boolean => d.code !== undefined && LIMIT_CODES.has(d.code);

/**
 * `list` with its first {@link MAX_DIAGNOSTICS} ordinary diagnostics plus EVERY limit-class one
 * ({@link LIMIT_CODES}), in their original order, then one marker last when any were dropped.
 * The marker's severity follows the diagnostics (EH-D8 as amended): `E_DIAGNOSTIC_LIMIT` when
 * there is an error ANYWHERE — in the whole uncapped `list`, kept or dropped, or among what a
 * producer stopped collecting (`droppedError`, the parser's flag) — and `W_DIAGNOSTIC_LIMIT`
 * otherwise, so a plan that only floods warnings still draws, lints and describes.
 *
 * A list with at most 500 ordinary diagnostics and no marker is returned AS IS (the same array),
 * so sub-cap output is byte-identical. Idempotent: a marker from upstream (the parse stage) is
 * moved to the end, keeps its span, and an `E_DIAGNOSTIC_LIMIT` there stays an error (it stands
 * for an error the parser dropped). A new marker's span is the byte just past the 500th ordinary
 * diagnostic's span, or the end of the source when that one has no span or is measured in
 * another file.
 */
export function capDiagnostics(list: Diagnostic[], sourceLength: number, droppedError = false): Diagnostic[] {
  if (list.length <= MAX_DIAGNOSTICS) return list;
  let ordinary = 0;
  let upstream: Diagnostic | undefined;
  for (const d of list) {
    if (isMarker(d)) upstream ??= d;
    else if (!isLimitClass(d)) ordinary++;
  }
  if (ordinary <= MAX_DIAGNOSTICS && upstream === undefined) return list;
  const anyError =
    droppedError || list.some((d) => d.code === "E_DIAGNOSTIC_LIMIT" || (d.severity === "error" && !isMarker(d)));
  const kept: Diagnostic[] = [];
  let lastOrdinary: Diagnostic | undefined;
  let count = 0;
  for (const d of list) {
    if (isMarker(d)) continue;
    if (isLimitClass(d)) kept.push(d);
    else if (count < MAX_DIAGNOSTICS) {
      kept.push(d);
      lastOrdinary = d;
      count++;
    }
  }
  let span: Span;
  if (upstream?.span) span = upstream.span;
  else {
    const at =
      lastOrdinary?.span && lastOrdinary.file === undefined
        ? Math.min(Math.max(0, lastOrdinary.span.end), sourceLength)
        : sourceLength;
    span = { start: at, end: Math.min(at + 1, sourceLength) };
  }
  const message = `More than ${MAX_DIAGNOSTICS} diagnostics; further diagnostics were not collected`;
  const hints = ["fix the first problems reported and compile again"];
  const limit: Diagnostic = anyError
    ? { severity: "error", message, code: "E_DIAGNOSTIC_LIMIT", span, hints }
    : { severity: "warning", message, code: "W_DIAGNOSTIC_LIMIT", span, hints };
  return [...kept, limit];
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
 *
 * A diagnostic carrying `file` is measured in ANOTHER module's source (an imported
 * component's body — see {@link Diagnostic.file}), so `source` — the string this
 * function was handed — cannot be indexed for line/col or a source excerpt without
 * confidently pointing at the wrong bytes. That case prints `--> <file> [start..end]`
 * instead, no excerpt, matching the JSON projection's rule
 * ({@link import("./diagnostic-json.js").diagnosticToJson}: `file` present means no
 * `line`/`col`).
 */
export function formatDiagnostic(source: string, d: Diagnostic): string {
  const codeTag = d.code ? `[${d.code}]` : "";
  const header = `${d.severity}${codeTag}: ${d.message}`;
  const lines: string[] = [header];

  if (d.span && d.file !== undefined) {
    lines.push(` --> ${d.file} [${d.span.start}..${d.span.end}]`);
    for (const hint of d.hints ?? []) {
      lines.push(` = help: ${hint}`);
    }
  } else if (d.span) {
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

  // Related locations: a small framed snippet per secondary span. A `RelatedSpan` carries
  // no `file` of its own — it is measured in whatever source the OWNING diagnostic is
  // (`d.file`), so the same "cannot index the wrong file" rule as the primary span above
  // applies here too: `file` present means `--> <file> [start..end]`, no excerpt.
  //
  // One known imprecision, pre-existing and not introduced here: `ir.ts`'s
  // `stampProvenance` can attach a "placed here" related span measured in the COMPILED
  // source even when the diagnostic's OWN span (and `file`) point into a component's
  // body — a `place` statement always renders its related span against the file it is
  // written in, which is not always `d.file`. `diagnosticJson` does not project
  // `relatedSpans` at all today, so no consumer currently disambiguates this either;
  // fixing it precisely needs `RelatedSpan` to carry its own optional `file`.
  for (const rel of d.relatedSpans ?? []) {
    if (d.file !== undefined) {
      lines.push(` --> ${d.file} [${rel.span.start}..${rel.span.end}] note: ${rel.message}`);
      continue;
    }
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
