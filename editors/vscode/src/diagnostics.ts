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
  severity: number;
  message: string;
  code?: string;
  source: string;
}

/** Minimal shape of a compiler diagnostic (matches the core's `Diagnostic`). */
interface CoreDiagnostic {
  severity: "error" | "warning";
  message: string;
  code?: string;
  span?: { start: number; end: number };
}
interface CoreResult {
  diagnostics: CoreDiagnostic[];
}
export type CompileFn = (source: string, opts?: { noCache?: boolean }) => CoreResult;

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

/** Compile `text` and return its diagnostics in LSP shape. */
export function lspDiagnostics(compile: CompileFn, text: string): LspDiagnostic[] {
  const { diagnostics } = compile(text, { noCache: true });
  return diagnostics.map((d) => {
    const start = d.span ? offsetToPosition(text, d.span.start) : { line: 0, character: 0 };
    const end = d.span ? offsetToPosition(text, d.span.end) : start;
    return {
      range: { start, end: end.line === start.line && end.character === start.character ? { ...start, character: start.character + 1 } : end },
      severity: d.severity === "error" ? Severity.Error : Severity.Warning,
      message: d.message,
      code: d.code,
      source: "archlang",
    };
  });
}
