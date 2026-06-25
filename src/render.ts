/**
 * Renders a resolved plan (IR) to a professional SVG floor plan. Deterministic.
 *
 * As of v0.7 this is a thin composition over the backend-neutral Scene IR:
 * `resolve → toScene → renderSvg`. Geometry now lives in `scene-build.ts` (lowering)
 * and the SVG serialization in `backends/svg.ts`; this entry point is kept so
 * existing callers (`index.ts`, `bench/`) and the public surface are unchanged.
 */

import type { CompileOptions } from "./types.js";
import type { ResolvedPlan } from "./ir.js";
import { toScene } from "./scene-build.js";
import { renderSvg } from "./backends/svg.js";

export function render(ir: ResolvedPlan, opts: CompileOptions = {}): string {
  return renderSvg(toScene(ir, opts), opts);
}
