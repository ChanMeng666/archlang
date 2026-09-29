/**
 * The one `compile()` pipeline: parse → link → resolve → render.
 *
 * Extracted verbatim from `src/index.ts` (WP: one compile pipeline for `compile()`
 * and the `reroll` twin-compile proof) so there is exactly one implementation of
 * "what does this source compile to" — `index.ts`'s `compile()` wraps
 * {@link compileUncached} with its memoization cache and stays the public surface;
 * `reroll.ts`'s proof obligation calls this SAME function (with `noCache: true`)
 * instead of re-deriving the pipeline, so the two can never drift apart.
 *
 * Pure, synchronous and isomorphic — see `compile()`'s own doc comment in
 * `index.ts` for the full contract; nothing here differs from what it always was.
 */

import { parse } from "./parser.js";
import { resolveAll } from "./ir.js";
import { toScene } from "./scene-build.js";
import { renderSvg } from "./backends/svg.js";
import { renderErrorSvg } from "./backends/error-svg.js";
import { offsetToLineCol } from "./diagnostics.js";
import { createRegistry, BUILTIN_REGISTRY } from "./registry.js";
import type { Runtime } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import { link } from "./import.js";
import type { Scene } from "./scene.js";
import type { Diagnostic } from "./diagnostics.js";
import type { CompileError, CompileOptions, CompilePage, CompileResult } from "./types.js";

/** Project a span-carrying diagnostic onto the legacy `{message, line, col}` shape. */
function toLegacy(source: string, d: Diagnostic): CompileError {
  if (!d.span) return { message: d.message };
  const { line, col } = offsetToLineCol(source, d.span.start);
  return { message: d.message, line, col };
}

export function compileUncached(source: string, opts: CompileOptions): CompileResult {
  // Per-call registry (built-ins + plugins) and runtime — fresh each compile, no
  // global mutation. Absent plugins/backend collapse to the built-in behavior.
  // Plugin-free compiles reuse the stable BUILTIN_REGISTRY so the parse/resolve
  // stage memos can hit across reparses (a fresh registry per call would defeat them).
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const runtime: Runtime = { registry, backend: opts.backend, themes: opts.themes };
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);

  // parse → link (resolve `import`s through the World — the one I/O phase) →
  // resolve (AST→IR, the single place semantics live) → render. `resolveAll` is the
  // level-aware resolve: one ResolvedPlan per `level` block (none → one plan, as before).
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolveAll(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])];

  const errs = diagnostics.filter((d) => d.severity === "error");
  const errors = errs.map((d) => toLegacy(source, d));
  const warnings = diagnostics.filter((d) => d.severity === "warning").map((d) => toLegacy(source, d));

  // Warnings never block rendering; any error (or no plan) aborts with svg = "".
  // The Scene is built once and serialized to SVG; it is also exposed on the
  // result so consumers can target other backends (toDxf/toPdf) without re-resolving.
  // A multi-storey plan renders one page per storey, ascending — `svg`/`scene` are page 1
  // (the lowest level), so a level-unaware consumer still gets a complete drawing.
  let svg = "";
  let scene: Scene | undefined;
  let pages: CompilePage[] | undefined;
  if (resolved && errs.length === 0) {
    if (resolved.levels.length > 0) {
      pages = resolved.levels.map((l) => {
        const s = toScene(l.ir, opts, runtime);
        return { level: l.level, ...(l.name !== undefined ? { name: l.name } : {}), svg: renderSvg(s, opts), scene: s };
      });
      scene = pages[0]!.scene;
      svg = pages[0]!.svg;
    } else {
      scene = toScene(resolved.ir, opts, runtime);
      svg = renderSvg(scene, opts);
    }
  } else if (errs.length > 0 && opts.onError === "svg") {
    // Opt-in only: a broken plan yields a self-describing error card instead of
    // a blank. Default (no `onError`) leaves `svg === ""`, byte-identical to the
    // historical behavior. Errors/warnings/diagnostics are untouched.
    svg = renderErrorSvg(source, diagnostics);
  }

  // `pages` is spread so a single-storey result has no such key at all (append-only).
  return { svg, errors, warnings, diagnostics, ast: plan, scene, ...(pages ? { pages } : {}) };
}
