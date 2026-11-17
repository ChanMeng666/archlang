/**
 * Maps ArchLang's compiler diagnostics to LSP-shaped diagnostics.
 *
 * Pure and dependency-injected (the compile function is passed in) so it carries
 * no `vscode-languageserver` import — the core test suite can exercise it
 * directly, and the LSP server (server.ts) adapts the result to the real
 * `Diagnostic` type (structurally identical).
 */

/** LSP DiagnosticSeverity numeric codes. */
export const Severity = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;

export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based
}
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}
/** An LSP `DiagnosticRelatedInformation`: a location in a document, and what it says there. */
export interface LspRelatedInformation {
  location: { uri: string; range: LspRange };
  message: string;
}
export interface LspDiagnostic {
  range: LspRange;
  /** One of {@link Severity}: the LSP `DiagnosticSeverity` codes, so the result IS an LSP `Diagnostic`. */
  severity: (typeof Severity)[keyof typeof Severity];
  message: string;
  code?: string;
  source: string;
  /**
   * The diagnostic's related spans (`Diagnostic.relatedSpans`: an id's first declaration, the
   * `place` behind an instance), each a location in the document `uri` names. Present only when
   * a `uri` was passed and the diagnostic carries a related span measured in this document; a
   * span that names another `file` is left out, since it addresses that module's bytes.
   */
  relatedInformation?: LspRelatedInformation[];
}

/**
 * The core's `compile`, typed from the core's own declarations (a type-only reference from this
 * CJS module into the ESM core), so a renamed or reshaped field of its `Diagnostic` (`span`,
 * `severity`, `file`, …) is a compile error here, not a silent miss. `file` is the module `span`
 * is measured in when that is NOT the compiled source (the defect lives inside an `import`ed
 * component); `handlers.ts` reads it to refuse a quickfix whose edits address another file (see
 * its `foreignDiagnostics`).
 */
export type CompileFn = typeof import("@chanmeng666/archlang", { with: { "resolution-mode": "import" }}).compile;

/** 0-based line/character for a source offset. */
export function offsetToPosition(text: string, offset: number): LspPosition {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: clamped - lineStart };
}

/** Source offset for a 0-based line/character position (inverse of the above). */
export function positionToOffset(text: string, pos: LspPosition): number {
  let i = 0;
  let line = 0;
  while (i < text.length && line < pos.line) {
    if (text[i] === "\n") line++;
    i++;
  }
  return Math.min(text.length, i + Math.max(0, pos.character));
}

/** LSP range for a byte-offset span. */
export function spanToRange(text: string, span: { start: number; end: number }): LspRange {
  return { start: offsetToPosition(text, span.start), end: offsetToPosition(text, span.end) };
}

/** A span's LSP range, widened to one character when it is empty so the editor can show it. */
function visibleRange(text: string, span: { start: number; end: number } | undefined): LspRange {
  const start = span ? offsetToPosition(text, span.start) : { line: 0, character: 0 };
  const end = span ? offsetToPosition(text, span.end) : start;
  return {
    start,
    end:
      end.line === start.line && end.character === start.character ? { ...start, character: start.character + 1 } : end,
  };
}

/**
 * Compile `text` and return its diagnostics in LSP shape. With the document's `uri`, a diagnostic's
 * related spans become `relatedInformation` (card AF1); without it there is no location to name,
 * and the result is what it always was.
 */
export function lspDiagnostics(compile: CompileFn, text: string, uri?: string): LspDiagnostic[] {
  const { diagnostics } = compile(text, { noCache: true });
  return diagnostics.map((d) => {
    const out: LspDiagnostic = {
      range: visibleRange(text, d.span),
      severity: d.severity === "error" ? Severity.Error : Severity.Warning,
      message: d.message,
      code: d.code,
      source: "archlang",
    };
    if (uri !== undefined) {
      // A span naming another `file` (`RelatedSpan.file`) addresses that module's bytes, not this
      // document's. Read through `in`, so the adapter also typechecks against a built core older than
      // the field (a worktree whose `node_modules` is a junction resolves the primary's `dist/`).
      const related = (d.relatedSpans ?? [])
        .filter((r) => !("file" in r && r.file !== undefined))
        .map((r) => ({ location: { uri, range: visibleRange(text, r.span) }, message: r.message }));
      if (related.length) out.relatedInformation = related;
    }
    return out;
  });
}
