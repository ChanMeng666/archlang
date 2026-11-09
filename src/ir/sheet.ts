/**
 * The sheet, decided in `resolve()`: the two extents a fit is measured on, the storey as drawn
 * ({@link drawnView}), the `paper` + scale resolved into a {@link ResolvedSheet}, and its
 * reports (`W_SCALE_OVERFLOW`, `W_DRAWING_OVERFLOW`, and `E_OUT_OF_RANGE` for a scale that puts
 * the sheet past the modelling range).
 *
 * Invariant: arithmetic over the resolved extent, never a rendering, so `describe()` and
 * `toScene()` read one answer; the sheet changes annotation sizes, never geometry.
 * Step meter: nothing here calls `chargeSteps`.
 */

import type { PlanNode, Point } from "../ast.js";
import type { Diagnostic } from "../diagnostics.js";
import { fmt3, MODEL_RANGE_MM, maxScaleDenominator, outOfRangeDiagnostic } from "../num-format.js";
import type { Registry } from "../registry.js";
import { extendBounds, outerFaceBounds } from "../geometry.js";
import { titleRows } from "../chrome-layout.js";
import type { ResolvedSheet, SheetFitInput } from "../sheet.js";
import { paperMm, resolveSheetSpec, scaleDenominator, usablePlanMm } from "../sheet.js";
import { planTableRows } from "../sheet-tables.js";
import type { RZone, RWall, RRoom, RFurniture, ROutdoor, ResolvedElement, ResolvedPlan } from "./types.js";

/**
 * The two extents a sheet is decided from.
 *
 * `building` is the outer-wall-face extent — what a builder and a GB/T overall dimension
 * see, and what the fit rule has always measured. `drawn` is that plus **everything else
 * the plan puts on the page**: every non-wall element's own registry `bounds()` (ground,
 * fences, roof eaves, a fixture pushed outside the shell, a stair landing) and the
 * `site … boundary` ring, which is a plan-level datum with no `ElementDef` of its own.
 *
 * `drawn` therefore CONTAINS `building` by construction, which is what makes
 * `fits === false ⟹ grown === true` a fact rather than a coincidence.
 *
 * Two things it deliberately is not. It is not `scene-build.ts`'s `planBounds`: the
 * building half is measured by {@link outerFaceBounds}, the same call `fits` uses, so the
 * new signal and the old one differ by their EXTENT and not by their ruler. And it takes
 * no wall band — the joinery is a rendering concern and this runs in `resolve()`, which
 * `describe()` and `lint()` both go through.
 */
export function sheetExtents(
  elements: readonly ResolvedElement[],
  walls: readonly RWall[],
  siteBoundary: readonly Point[] | undefined,
  registry: Registry,
): { building: { w: number; h: number }; drawn: { w: number; h: number } } {
  const rects = elements
    .filter((e): e is RRoom => e.kind === "room")
    .map((r) => ({ x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }));
  const ob = outerFaceBounds(walls, rects);
  const building = Number.isFinite(ob.minX) ? { w: ob.maxX - ob.minX, h: ob.maxY - ob.minY } : { w: 0, h: 0 };

  const db = { ...ob };
  for (const el of elements) {
    // Walls are already in `ob` on their outer faces; taking their band here would
    // measure the building with a second ruler.
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    for (const p of def.bounds(el)) extendBounds(db, p.x, p.y);
  }
  for (const p of siteBoundary ?? []) extendBounds(db, p.x, p.y);
  const drawn = Number.isFinite(db.minX) ? { w: db.maxX - db.minX, h: db.maxY - db.minY } : { w: 0, h: 0 };
  return { building, drawn };
}

/**
 * The storey as the sheet draws it (preview-and-remodel B3a): {@link ResolvedPlan.drawn}'s
 * elements and walls, the `status demolish` walls included, in place of the plan after the
 * demolition. The SAME object when no wall is demolished, so every plan without the clause reads
 * exactly what it always did. Read by every drawing consumer (`toScene`, the drawing budget, the
 * sheet fit and `finish`), never by an analysis.
 */
export function drawnView(ir: ResolvedPlan): ResolvedPlan {
  return ir.drawn ? { ...ir, elements: ir.drawn.elements, walls: ir.drawn.walls } : ir;
}

/** A scale denominator as it appears in `1:<denom>`: integral when it is whole. */
export function fmtDenom(d: number): string {
  return Number.isInteger(d) ? String(d) : String(Number(d.toFixed(4)));
}

/**
 * Resolve the plan's `paper` declaration into a {@link ResolvedSheet}, and raise the
 * advisory `W_SCALE_OVERFLOW` when the building does not fit the sheet at the scale in
 * force. Returns undefined for a plan with no `paper` — the historical
 * reference-dimension sizing path, byte-for-byte unchanged.
 *
 * The fit is measured on the building's OUTER wall faces (what a builder and a GB/T
 * overall dimension see), against the sheet minus its margins, the `dims auto` chain
 * bands, the bottom chrome band and the margin-table row `schedule rooms` / `legend`
 * occupy below it — the one rule in `src/sheet.ts`.
 *
 * An authored `scale` is never overridden: an overflow is reported and the drawing is
 * never clipped (the page grows to contain it — scene-build), because silently re-scaling
 * a drawing out from under the scale in its own title block would be a lie.
 */
export function resolveSheet(
  ast: PlanNode,
  elements: ResolvedElement[],
  walls: RWall[],
  diagnostics: Diagnostic[],
  zones: readonly RZone[] | undefined,
  siteBoundary: readonly Point[] | undefined,
  registry: Registry,
): ResolvedSheet | undefined {
  if (!ast.paper) return undefined;
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const { building: extent, drawn } = sheetExtents(elements, walls, siteBoundary, registry);
  // A sheet always carries a SCALE row (the effective scale is stamped in below), so the
  // row count is scale-independent — pass a placeholder so the band reserved for the
  // title block does not depend on which denominator we are testing.
  const fit: SheetFitInput = {
    extent,
    autoDims: ast.autoDims !== undefined,
    titleRows: ast.hide?.title ? 0 : titleRows(ast.title, "1:1").length,
    ...(ast.hide?.scale ? { scaleBarHidden: true } : {}),
    // The margin tables occupy a second band below the chrome, and it has to be reserved
    // here or the page can be issued taller than the paper it declares. Counted from the
    // same derivation `toScene()` draws them with (`planTableRows`), never re-derived.
    tableRows: planTableRows({
      schedule: ast.schedule,
      legend: ast.legend,
      rooms,
      zones,
      walls,
      furniture: elements.filter((e): e is RFurniture => e.kind === "furniture"),
      outdoor: elements.filter((e): e is ROutdoor => e.kind === "outdoor"),
      openingSchedule: ast.openingSchedule,
      elements,
      notes: ast.notes,
    }),
  };
  const sheet = resolveSheetSpec(ast.paper, scaleInRange(ast, diagnostics), fit, drawn);
  const usable = usablePlanMm(sheet.widthMm, sheet.heightMm, sheet.denom, fit);
  // Exactly one of the two, never both. The drawn extent CONTAINS the building, so
  // `fits === false` implies `drawingFits === false`, and the second warning would repeat
  // the first on every plan it already covers — noise, and `W_SCALE_OVERFLOW` already names
  // the same remedies. What `W_DRAWING_OVERFLOW` reports is the case nothing else could
  // see: the building fits and the drawing still does not.
  if (!sheet.fits) diagnostics.push(scaleOverflowDiagnostic(ast, sheet, extent, usable));
  else if (!sheet.drawingFits) diagnostics.push(drawingOverflowDiagnostic(ast, sheet, drawn, usable));
  return sheet;
}

/**
 * The authored `scale`, or undefined (after one `E_OUT_OF_RANGE`) when its denominator would
 * put the `paper` sheet, in plan millimetres, past the modelling range — the sheet is then
 * auto-fitted, so nothing downstream sizes a pen or a font from it. Without `paper` a scale
 * is a title-block annotation and measures nothing, so it is not held.
 */
export function scaleInRange(ast: PlanNode, diagnostics: Diagnostic[]): string | undefined {
  const denom = scaleDenominator(ast.scale);
  if (!ast.paper || denom === null) return ast.scale;
  const { w, h } = paperMm(ast.paper.size, ast.paper.orientation);
  const max = maxScaleDenominator(Math.max(w, h));
  if (denom <= max) return ast.scale;
  diagnostics.push(
    outOfRangeDiagnostic(
      `\`scale ${ast.scale}\` on ${ast.paper.size} puts the sheet at ${fmt3(denom * Math.max(w, h))} mm, outside the ` +
        `modelling range of ±${fmt3(MODEL_RANGE_MM)} mm (the largest denominator on ${ast.paper.size} is ${max})`,
      ast.scaleSpan,
    ),
  );
  return undefined;
}

/**
 * The advisory `W_SCALE_OVERFLOW`, built in one place so the single-storey path and the
 * multi-storey shared-sheet pass word it identically.
 *
 * It quotes BOTH numbers — the building and the drawing area it is measured against — so
 * the verdict is checkable rather than asserted, and so a reader can see when the sheet
 * FURNITURE is what consumed the room (a schedule and a legend take a real band, and
 * adding one can raise this with no change to the plan's geometry at all).
 *
 * It deliberately does not promise that the page grows. That is the usual consequence, but
 * a marginal overflow eats the sheet margin instead and comes out exactly paper-sized — so
 * what is stated is the invariant that actually holds: nothing is clipped.
 */
export function scaleOverflowDiagnostic(
  ast: PlanNode,
  sheet: ResolvedSheet,
  extent: { w: number; h: number },
  usable: { w: number; h: number },
): Diagnostic {
  return {
    severity: "warning",
    code: "W_SCALE_OVERFLOW",
    message:
      `The drawing does not fit ${sheet.size} ${sheet.orientation} at 1:${fmtDenom(sheet.denom)} — ` +
      `the building measures ${Math.round(extent.w)}×${Math.round(extent.h)} mm on its outer faces, ` +
      `against ${Math.round(usable.w)}×${Math.round(usable.h)} mm of drawing area once the margins, ` +
      `dimension bands, title block and margin tables are taken out. ` +
      `Nothing is clipped — the sheet margin gives way first, and the page grows past the paper if ` +
      `that is not enough; use a larger sheet, a coarser scale, or one fewer margin table.`,
    span: ast.scaleSpan ?? ast.paperSpan,
  };
}

/**
 * The advisory `W_DRAWING_OVERFLOW` — the residual `W_SCALE_OVERFLOW` cannot see.
 *
 * Same ruler, different subject. `W_SCALE_OVERFLOW` measures the BUILDING against the
 * sheet's drawing area; this measures **everything the plan draws** against that same
 * area, because a plan draws ground, fences, a lot line and eaves the building's
 * outer-face extent does not contain, and none of it can make the fit test say no. It
 * quotes the whole drawing's extent, the same drawing area the other rule quotes, and the
 * OVERFLOW ITSELF on each axis, so a reader can tell a millimetre of eaves from a 40 m
 * yard — the two want different answers.
 *
 * **It does not promise the page grows**, and that is measurement rather than caution: of
 * the three shipped examples that raise it, only `garden-house` is actually issued on a
 * larger page (+1.01%); `courtyard-house`'s eaves overrun by 90 plan mm at 1:100 and
 * `hillside-villa`'s by 715 at 1:50, and both come out exactly paper-sized because the
 * reserved margin gives way first. `W_SCALE_OVERFLOW` words its own consequence the same
 * way for the same reason. The measured page fact is `SceneSheet.grown`, which needs a
 * laid-out Scene.
 *
 * It carries no machine-applicable fix, for the reason `W_SCALE_OVERFLOW` carries none:
 * every remedy rewrites a decision the author made (which paper, which scale, how much
 * ground to draw), and picking one for them is exactly the invisible architect ADR 0005
 * refuses. Unlike `W_SCALE_OVERFLOW` there is not even a defensible default — a coarser
 * scale shrinks a building the author had already sized correctly for the sheet.
 */
export function drawingOverflowDiagnostic(
  ast: PlanNode,
  sheet: ResolvedSheet,
  drawn: { w: number; h: number },
  usable: { w: number; h: number },
): Diagnostic {
  const over = (d: number, u: number): string => (d > u ? `${Math.round(d - u)} mm` : "none");
  return {
    severity: "warning",
    code: "W_DRAWING_OVERFLOW",
    message:
      `The BUILDING fits ${sheet.size} ${sheet.orientation} at 1:${fmtDenom(sheet.denom)}, but the whole ` +
      `DRAWING does not — everything drawn measures ${Math.round(drawn.w)}×${Math.round(drawn.h)} mm ` +
      `against ${Math.round(usable.w)}×${Math.round(usable.h)} mm of drawing area, over by ` +
      `${over(drawn.w, usable.w)} across and ${over(drawn.h, usable.h)} down. ` +
      `The excess is the part of the drawing that is not the building — \`outdoor\` ground, a \`fence\`, ` +
      `a \`site … boundary\`, a \`roof\` eaves line — none of which the fit test measures, which is ` +
      `why \`sheet.fits\` is still true. Nothing is clipped: the reserved sheet margin gives way first, and ` +
      `only if that is not enough does the page grow past the paper. Use a larger sheet, a coarser scale, ` +
      `or draw less ground.`,
    span: ast.paperSpan ?? ast.scaleSpan,
  };
}
