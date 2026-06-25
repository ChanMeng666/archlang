/**
 * ArchLang — compile declarative floor-plan source to a professional SVG.
 *
 * @example
 * import { compile } from "@chanmeng666/archlang";
 * const { svg, errors } = compile(`plan "Demo" { room at (0,0) size 4000x3000 label "Room" }`);
 */

import { parse } from "./parser.js";
import { resolve } from "./ir.js";
import { toScene } from "./scene-build.js";
import { renderSvg } from "./backends/svg.js";
import { offsetToLineCol } from "./diagnostics.js";
import { createRegistry } from "./registry.js";
import type { Runtime } from "./registry.js";
import { idToken } from "./identity.js";
import type { Scene } from "./scene.js";
import type { Diagnostic } from "./diagnostics.js";
import type { CompileError, CompileOptions, CompileResult } from "./types.js";

export type {
  CompileError,
  CompileOptions,
  CompileResult,
  CompileWarning,
  Diagnostic,
  Span,
  Severity,
} from "./types.js";
export { formatDiagnostic, offsetToLineCol } from "./diagnostics.js";
export type * from "./ast.js";

// IR + export backends (for consumers that want resolved geometry or other
// output formats). `resolve`/`toDxf` are pure & zero-dep; `toPdf` lazily loads
// optional deps. None of these are part of `compile()`.
export { resolve } from "./ir.js";
export type {
  ResolvedPlan,
  ResolvedElement,
  RWall,
  RRoom,
  RDoor,
  RWindow,
  RFurniture,
  RDim,
  RColumn,
} from "./ir.js";
// Scene IR (the backend-neutral drawing target) + its builder. Backends consume
// a Scene: `toDxf(scene)` / `toPdf(scene)`; build one with `toScene(ir)` or read
// `compile().scene`.
export { toScene } from "./scene-build.js";
export type { Scene, SceneNode, ScenePrim, Paint, RenderPass, RenderSizes, LineWeight, LineType } from "./scene.js";
export { toDxf } from "./export/dxf.js";
export { toPdf } from "./export/pdf.js";
// Optional polygon-geometry backend seam. The default path is zero-dependency
// (rectilinear boolean); registering a backend (e.g. the lazily-loaded
// `clipper2-wasm` adapter) unlocks seamless angled-wall joinery.
export { setGeometryBackend, getGeometryBackend } from "./geometry/backend.js";
export type { GeometryBackend, JoinKind } from "./geometry/backend.js";
export { loadClipperBackend } from "./geometry/clipper.js";
// Extensibility surface (v0.10). `compile(src, { plugins, backend, hatches, themes })`
// adds third-party elements/backends/hatches/themes per call — cache-safe, with no
// global mutation. The `register*` helpers validate + tag an extension for an opts field.
export {
  createRegistry,
  BUILTIN_REGISTRY,
  registerElement,
  registerTheme,
  registerHatch,
  registerBackend,
} from "./registry.js";
export type {
  Registry,
  Runtime,
  ElementDef,
  ParseCtx,
  ResolveCtx,
  RenderCtx,
  ThemePlugin,
  HatchPlugin,
  HatchMetaInput,
} from "./registry.js";

/** Small LRU-ish memo cache keyed by source+options. Bounded to 64 entries. */
const cache = new Map<string, CompileResult>();
const CACHE_MAX = 64;

export function compile(source: string, opts: CompileOptions = {}): CompileResult {
  // The key includes plugin/theme/backend/hatch identity so distinct extension
  // sets never share a cache entry. Trusted, JSON-serializable `theme`/`width`
  // are embedded directly; object plugins get a stable process-local id token
  // (reused object → hit; different object → safe miss). Trailing tokens are 0
  // when absent, preserving the legacy key shape for plain compiles.
  const key = JSON.stringify([
    source,
    opts.width ?? null,
    opts.theme ?? null,
    opts.plugins?.map(idToken) ?? null,
    idToken(opts.themes),
    idToken(opts.backend),
    idToken(opts.hatches),
  ]);
  if (!opts.noCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const result = compileUncached(source, opts);

  if (!opts.noCache) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
  }
  return result;
}

/** Project a span-carrying diagnostic onto the legacy `{message, line, col}` shape. */
function toLegacy(source: string, d: Diagnostic): CompileError {
  if (!d.span) return { message: d.message };
  const { line, col } = offsetToLineCol(source, d.span.start);
  return { message: d.message, line, col };
}

function compileUncached(source: string, opts: CompileOptions): CompileResult {
  // Per-call registry (built-ins + plugins) and runtime — fresh each compile, no
  // global mutation. Absent plugins/backend collapse to the built-in behavior.
  const registry = createRegistry(opts.plugins);
  const runtime: Runtime = { registry, backend: opts.backend };

  const { plan, diagnostics: parseDiags } = parse(source, registry);

  // parse → resolve (AST→IR, the single place semantics live) → render.
  const resolved = plan ? resolve(plan, registry) : null;
  const diagnostics: Diagnostic[] = resolved
    ? [...parseDiags, ...resolved.diagnostics]
    : [...parseDiags];

  const errs = diagnostics.filter((d) => d.severity === "error");
  const errors = errs.map((d) => toLegacy(source, d));
  const warnings = diagnostics
    .filter((d) => d.severity === "warning")
    .map((d) => toLegacy(source, d));

  // Warnings never block rendering; any error (or no plan) aborts with svg = "".
  // The Scene is built once and serialized to SVG; it is also exposed on the
  // result so consumers can target other backends (toDxf/toPdf) without re-resolving.
  let svg = "";
  let scene: Scene | undefined;
  if (resolved && errs.length === 0) {
    scene = toScene(resolved.ir, opts, runtime);
    svg = renderSvg(scene, opts);
  }

  return { svg, errors, warnings, diagnostics, ast: plan, scene };
}

/** Clear the internal compile cache (useful in long-lived processes/tests). */
export function clearCache(): void {
  cache.clear();
}
