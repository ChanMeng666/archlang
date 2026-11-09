/**
 * `astToJson` — a faithful, span-bearing projection of a parsed AST for `arch ast --json`, with no
 * expansion (moved verbatim from `src/plan-json.ts`, which re-exports every name it exported).
 *
 * Invariant: it does not round-trip through `planFromJson`. It charges nothing to the step meter.
 */

import type { PlanNode } from "../ast.js";

/**
 * Project a parsed {@link PlanNode} to a plain, JSON-serializable tree, preserving
 * source spans and leaving scripting nodes (`let`/`for`/`if`/`while`/instances/
 * `set`/`strip`/components/imports) as their node kind — nothing is expanded. This
 * is for `arch ast --json` (inspection); it does **not** round-trip through
 * {@link planFromJson}, which only accepts fully-elaborated geometry.
 */
export function astToJson(ast: PlanNode): object {
  return {
    kind: "plan",
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    ...(ast.paper ? { paper: ast.paper } : {}),
    ...(ast.scale !== undefined ? { scale: ast.scale } : {}),
    north: ast.north,
    ...(ast.site ? { site: ast.site } : {}),
    ...(ast.autoDims !== undefined ? { autoDims: ast.autoDims } : {}),
    ...(ast.accTitle !== undefined ? { accTitle: ast.accTitle } : {}),
    ...(ast.accDescr !== undefined ? { accDescr: ast.accDescr } : {}),
    ...(ast.title ? { title: ast.title } : {}),
    components: [...ast.components.values()].map((c) => ({
      kind: "component",
      name: c.name,
      params: c.params,
      body: c.body,
      ...(c.span ? { span: c.span } : {}),
    })),
    imports: ast.imports,
    body: ast.body,
    ...(ast.bodyStart !== undefined ? { bodyStart: ast.bodyStart } : {}),
  };
}
