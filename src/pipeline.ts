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
import { lineWeightOutOfRange, resolveAll } from "./ir.js";
import type { PlanResolution } from "./ir.js";
import { planTheme, toScene } from "./scene-build.js";
import { drawBudgetDiagnostic } from "./draw-budget.js";
import type { PlanNode } from "./ast.js";
import { toIso } from "./view/iso.js";
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

/**
 * `E_OUT_OF_RANGE` when the `lineWeight` the drawing will use came from the compile options
 * (`opts.theme`, or a theme registered in `opts.themes` that the plan selects and does not
 * override) and its heaviest pen leaves the modelling range, by the rule the source's
 * `lineWeight` is held to (`checkDrawnSizes`, `src/ir.ts`). The value has no source span, so
 * it is reported at the plan header. A built-in theme's weight is bounded and a source
 * `lineWeight` is checked by the resolver, so neither is re-checked here.
 */
function apiLineWeightOutOfRange(
  plan: PlanNode,
  resolved: PlanResolution,
  opts: CompileOptions,
  runtime: Runtime,
): Diagnostic | undefined {
  const ir = resolved.ir;
  let from: string | undefined;
  if (opts.theme?.lineWeight !== undefined) from = "from the compile options' `theme`";
  else if (ir.theme?.lineWeight === undefined) {
    const reg = runtime.themes?.find((t) => t.name === ir.themeBase);
    if (reg?.theme.lineWeight !== undefined) from = `from the theme "${reg.name}" in the compile options' \`themes\``;
  }
  if (from === undefined) return undefined;
  const lw = planTheme(ir, opts, runtime).theme.lineWeight;
  const storeys = resolved.levels.length > 0 ? resolved.levels : [{ ir }];
  return lineWeightOutOfRange(storeys, lw, plan.headerSpan, runtime.registry, from);
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
  // A `lineWeight` that comes from the compile options is held to the drawn-pen rule the
  // source's is; only the compile draws, so only the compile checks it.
  const pen = plan && resolved ? apiLineWeightOutOfRange(plan, resolved, opts, runtime) : undefined;
  if (pen) diagnostics.push(pen);
  // The drawing budget, before anything is drawn: estimated over every storey, and only for a
  // plan that would otherwise be drawn (an error already draws nothing).
  if (plan && resolved && !diagnostics.some((d) => d.severity === "error")) {
    const storeys = resolved.levels.length > 0 ? resolved.levels : [{ ir: resolved.ir }];
    const over = drawBudgetDiagnostic(storeys, registry, plan.headerSpan);
    if (over) diagnostics.push(over);
  }

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
    if (opts.view) {
      // The opt-in axonometric. One drawing of the WHOLE building, so a
      // multi-storey plan yields no `pages` — its storeys are stacked into this one
      // Scene rather than issued as a set. `describe()`/`lint()` are untouched above and
      // never see the option.
      scene = toIso(
        resolved.levels.length > 0 ? resolved.levels.map((l) => l.ir) : [resolved.ir],
        opts.view,
        opts,
        runtime,
      );
      svg = renderSvg(scene, opts);
    } else if (resolved.levels.length > 0) {
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
