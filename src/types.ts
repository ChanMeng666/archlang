/**
 * Public types for the ArchLang compiler.
 *
 * The compiler never throws on user-source errors; it returns them in
 * {@link CompileResult.errors}. Exceptions only escape on internal bugs.
 */

export type { Span, Severity, Diagnostic } from "./diagnostics.js";
export type { Theme } from "./theme.js";

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
  /**
   * Theme overrides applied on top of the plan's `theme { … }` directive and
   * the built-in defaults (these win). Any subset of keys may be supplied.
   */
  theme?: Partial<import("./theme.js").Theme>;
  /**
   * Third-party element definitions, merged into a **per-call** registry (no
   * global mutation → cache-safe). Each must be a valid `ElementDef`; pass them
   * through `registerElement` for validation. Plugin identity is folded into the
   * compile cache key, so reusing the same array hits cache and a different
   * plugin set never bleeds across compiles.
   */
  plugins?: import("./registry.js").ElementDef[];
  /**
   * Per-call polygon-geometry backend (angled-wall joinery). Overrides the
   * module-global `setGeometryBackend()` for this compile only.
   */
  backend?: import("./geometry/backend.js").GeometryBackend | null;
  /** Named hatch materials available to this compile, selectable via `material <name>`. */
  hatches?: import("./registry.js").HatchPlugin[];
  /** Named themes available to this compile, selectable via `theme <name> { … }`. */
  themes?: import("./registry.js").ThemePlugin[];
}

export interface CompileResult {
  /** The rendered SVG document, or `""` when there were fatal errors. */
  svg: string;
  /** Fatal problems. When non-empty, `svg` is `""`. Derived from {@link diagnostics}. */
  errors: CompileError[];
  /** Non-fatal advisories (e.g. a door not lying on any wall). Derived from {@link diagnostics}. */
  warnings: CompileWarning[];
  /**
   * All problems from every stage, with byte-offset spans and optional codes/hints.
   * `errors`/`warnings` are projections of this list; use it for rich, framed output.
   */
  diagnostics: import("./diagnostics.js").Diagnostic[];
  /** The validated AST, present whenever parsing succeeded. */
  ast?: import("./ast.js").PlanNode;
  /**
   * The backend-neutral Scene IR (positioned drawing primitives), present
   * whenever rendering succeeded (i.e. no fatal errors). Feed it to alternate
   * backends: `toDxf(scene)`, `toPdf(scene)`.
   */
  scene?: import("./scene.js").Scene;
}
