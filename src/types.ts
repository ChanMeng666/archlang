/**
 * Public types for the ArchLang compiler.
 *
 * The compiler never throws on user-source errors; it returns them in
 * {@link CompileResult.errors}. Exceptions only escape on internal bugs.
 */

export interface CompileError {
  /** Human-readable message. */
  message: string;
  /** 1-based source line, when known. */
  line?: number;
  /** 1-based source column, when known. */
  col?: number;
}

export type CompileWarning = CompileError;

export interface CompileOptions {
  /**
   * Width attribute (in px) for the produced `<svg>`. Height is derived from
   * the drawing's aspect ratio. Omit to emit a viewBox-only, fluid SVG.
   */
  width?: number;
  /** Bypass the internal memoization cache (mostly for benchmarks/tests). */
  noCache?: boolean;
}

export interface CompileResult {
  /** The rendered SVG document, or `""` when there were fatal errors. */
  svg: string;
  /** Fatal problems. When non-empty, `svg` is `""`. */
  errors: CompileError[];
  /** Non-fatal advisories (e.g. a door not lying on any wall). */
  warnings: CompileWarning[];
  /** The validated AST, present whenever parsing succeeded. */
  ast?: import("./ast.js").PlanNode;
}
