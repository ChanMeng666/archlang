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
   * When set, tag each drawn primitive that carries a source span with a
   * `data-span="start:end"` attribute (byte offsets into the source). This is an
   * **opt-in editor affordance** — it lets a tool map a clicked SVG element back
   * to the source that produced it. Default output is unaffected (byte-identical)
   * so shipped SVGs stay clean; see ADR 0007.
   */
  annotate?: boolean;
  /**
   * Opt-in diagnostic overlays drawn on top of the plan (on the `annotations`
   * layer, after all existing nodes). Currently only `"circulation"` — the
   * entrance→room walks, bottleneck markers and key routes from the circulation
   * model (ADR 0008). Unknown names are ignored. Default output is **byte-identical**
   * (no overlay), so shipped SVGs stay clean; folded into the compile cache key.
   */
  overlays?: readonly "circulation"[];
  /**
   * What to render when the plan has fatal errors. Default (unset): `svg` is
   * left `""` — the historical, byte-identical behavior. `"svg"` opts in to a
   * self-describing **error card** SVG (via `renderErrorSvg`) listing every
   * diagnostic (severity, code, line:col, message, fix), so an agent loop or an
   * embed always has visual feedback instead of a blank. This only affects the
   * error path: `errors`/`warnings`/`diagnostics`/`ok` semantics are unchanged,
   * and a plan with **no** errors renders byte-identically regardless.
   */
  onError?: "svg";
  /**
   * Emit accessibility metadata into the `<svg>` (borrowing Mermaid's lesson): a
   * `<title>` (the plan name), a `<desc>` (the deterministic `describe()` caption),
   * `role="img"`, and `aria-labelledby` wiring them so assistive tech — and machine
   * consumers — get a self-describing drawing. **Opt-in and purely additive**:
   * default output is byte-identical (no `<title>`/`<desc>`/`role`), so shipped SVGs
   * stay clean; folded into the compile cache key. Only affects the SVG backend.
   */
  accessible?: boolean;
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
  /**
   * Environment seam: resolves `import` paths and supplies `now`. Defaults to a
   * no-op World (nothing readable, no clock), so an import-free plan compiles
   * byte-identically with or without one. Node builds a real-fs World; the
   * browser/tests pass a virtual map. See {@link import("./world.js").World}.
   */
  world?: import("./world.js").World;
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
