/**
 * **`toIso` — the axonometric sibling of `toScene`.**
 *
 * It takes the same resolved plans, the same theme cascade and the same `RenderSizes`
 * arithmetic, and produces the same {@link Scene} type — so every serializer ArchLang has
 * (SVG, PDF, PNG, DXF) draws the view with no backend change at all. The one thing it
 * adds to the Scene is {@link Scene.view}, which tells the two backends that draw page
 * chrome to leave it out.
 *
 * ## Why the chrome goes
 *
 * A north arrow points at a compass direction on a plan; on an axonometric the plan has
 * been turned, so an arrow drawn straight up is simply false. A scale bar measures a plan
 * at a stated scale; an isometric foreshortens every axis by `√(2/3)`, so a bar taken from
 * the plan would be wrong by a factor nobody would think to apply. And a title block is
 * what makes a drawing look **issuable** — which this one must never be. `sheet` is left
 * undefined for the same reason: no `paper`, no scale denominator, no drawing frame.
 *
 * That is the whole of the view's contract with the rest of the compiler. It reads
 * `ResolvedPlan`; it writes a `Scene`. `describe()` and `lint()` never learn it exists —
 * they take no view option and cannot be given one, and `test/iso-describe-blind.test.ts`
 * greps them for an import of this directory.
 */

import type { ChromeLayout } from "../chrome-layout.js";
import type { ResolvedPlan } from "../ir.js";
import type { Runtime } from "../registry.js";
import { BUILTIN_RUNTIME } from "../registry.js";
import type { RenderSizes, Scene, SceneNode } from "../scene.js";
import { DEFAULT_THEME, mergeTheme, derivePoche, sanitizeTheme } from "../theme.js";
import { themeBaseLookup } from "../scene-build.js";
import type { CompileOptions } from "../types.js";
import { cameraFor } from "./camera.js";
import type { ViewName } from "./camera.js";
import { facesOf } from "./extrude.js";
import type { Storey } from "./extrude.js";
import { orderFaces, paintFaces } from "./paint.js";

/**
 * Build the axonometric Scene for a whole building.
 *
 * `plans` is every storey, ascending — one entry for a single-storey plan. All of them go
 * into ONE Scene, each at its own {@link ResolvedPlan.elevation}, because a building's
 * axonometric is one picture; splitting it per storey would be a set of drawings, which
 * is what the plan view already gives you.
 */
export function toIso(
  plans: readonly ResolvedPlan[],
  view: ViewName,
  opts: CompileOptions = {},
  runtime: Runtime = BUILTIN_RUNTIME,
): Scene {
  const first = plans[0]!;

  // The same theme cascade `toScene` runs, minus the per-element `style` layer: nothing
  // in the view is styled per element, so a styled theme would have no consumer.
  const base = themeBaseLookup(first.themeBase, runtime);
  const themeFromLayer = first.themeFrom ? derivePoche(first.themeFrom) : undefined;
  const theme = sanitizeTheme(mergeTheme(DEFAULT_THEME, base, themeFromLayer, first.theme, opts.theme));

  const storeys: Storey[] = plans.map((ir, index) => ({ ir, index }));
  const cam = cameraFor(view);
  const faces = facesOf(storeys);
  const drawn = orderFaces(faces, cam);

  // Bounds come from the PROJECTED extent — the drawing's own, not the plan's. A tall
  // building is taller on the page than its footprint is wide, and sizing off the plan
  // would clip it.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of drawn) {
    for (const loop of d.loops) {
      for (const p of loop) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const bounds = { minX, minY, maxX, maxY };
  const drawW = maxX - minX;
  const drawH = maxY - minY;

  // The historical no-`paper` `RenderSizes` arithmetic, verbatim, off the projected
  // reference dimension. There is deliberately no sheet branch: a view has no scale.
  const lw = theme.lineWeight;
  const refDim = Math.max(drawW, drawH, 1);
  const sizes: RenderSizes = {
    refDim,
    wallStroke: refDim * 0.0028 * lw,
    thin: refDim * 0.0016 * lw,
    roomFont: refDim * 0.03,
    areaFont: refDim * 0.022,
    dimFont: refDim * 0.02,
    furnFont: refDim * 0.017,
    margin: refDim * 0.17,
    hatchGap: refDim * 0.013,
  };

  const nodes: SceneNode[] = paintFaces(drawn, theme, sizes);

  // A symmetric margin and no chrome boxes. `layoutChrome` is not called: every input it
  // grows a margin for — a dimension chain, a scale bar, a title block, a schedule — is
  // absent here by construction, so it would only re-derive the base margin on all four
  // sides. The two boxes are inert: the backends skip them when `Scene.view` is set.
  const m = sizes.margin;
  const chrome: ChromeLayout = {
    margin: { top: m, right: m, bottom: m, left: m },
    scaleBar: { x0: 0, y0: 0, barLen: 0, hgt: 0, fs: 0 },
    titleBlock: null,
  };

  return {
    width: drawW + 2 * m,
    height: drawH + 2 * m,
    bounds,
    nodes,
    theme,
    sizes,
    north: first.north,
    name: first.name,
    hatches: [],
    chrome,
    view,
    ...(opts.accessible ? { name: first.accTitle ?? first.name, caption: isoCaption(first, view) } : {}),
  };
}

/** The accessible one-liner for a view. Deliberately NOT `describe()`'s caption: this
 *  drawing is a picture of a building, not a measured summary of one, and saying so is
 *  the honest description. */
function isoCaption(ir: ResolvedPlan, view: ViewName): string {
  const label = view === "iso" ? "isometric" : "plan-oblique axonometric";
  return `An illustrative ${label} view of ${ir.name}, looking from the south-west and above.`;
}
