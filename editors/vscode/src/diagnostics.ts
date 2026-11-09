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
export interface LspDiagnostic {
  range: LspRange;
  /** One of {@link Severity}: the LSP `DiagnosticSeverity` codes, so the result IS an LSP `Diagnostic`. */
  severity: (typeof Severity)[keyof typeof Severity];
  message: string;
  code?: string;
  source: string;
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

/** Compile `text` and return its diagnostics in LSP shape. */
export function lspDiagnostics(compile: CompileFn, text: string): LspDiagnostic[] {
  const { diagnostics } = compile(text, { noCache: true });
  return diagnostics.map((d) => {
    const start = d.span ? offsetToPosition(text, d.span.start) : { line: 0, character: 0 };
    const end = d.span ? offsetToPosition(text, d.span.end) : start;
    return {
      range: {
        start,
        end:
          end.line === start.line && end.character === start.character
            ? { ...start, character: start.character + 1 }
            : end,
      },
      severity: d.severity === "error" ? Severity.Error : Severity.Warning,
      message: d.message,
      code: d.code,
      source: "archlang",
    };
  });
}
