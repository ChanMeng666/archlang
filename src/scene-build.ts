/**
 * Lowers a resolved plan (IR) to the backend-neutral {@link Scene}.
 *
 * This is the single place geometry is assembled: each element contributes
 * positioned primitives via its registry `render`, walls are unioned/offset here
 * (the only element needing cross-segment treatment), and the page-level sizing
 * (reference dimension, derived font/stroke sizes, bounds) is computed once and
 * carried on the Scene for the backends. Pure & deterministic — no I/O, no time.
 */

import type { CompileOptions } from "./types.js";
import type { Opening, ResolvedPlan, RWall } from "./ir.js";
import type { RenderCtx } from "./registry.js";
import type { RenderSizes, Scene, SceneNode } from "./scene.js";
import { registry } from "./elements/index.js";
import type { Bounds } from "./geometry.js";
import { distPointToSegment, emptyBounds, extendBounds, segmentRectangle, segmentsOfWall } from "./geometry.js";
import type { Rect } from "./geometry/union.js";
import { rectBooleanOutline } from "./geometry/union.js";
import { patternId } from "./hatches.js";
import { DEFAULT_THEME, mergeTheme, sanitizeTheme } from "./theme.js";

/** Drawing bounds: each element contributes points via its registry `bounds`. */
function planBounds(ir: ResolvedPlan): Bounds {
  const b = emptyBounds();
  for (const el of ir.elements) {
    const def = registry.get(el.kind);
    if (!def) continue;
    for (const p of def.bounds(el)) extendBounds(b, p.x, p.y);
  }
  if (!isFinite(b.minX)) {
    // Nothing to draw; provide a default frame.
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  return b;
}

/** Is every segment of every wall axis-aligned (horizontal or vertical)? */
function allOrthogonal(walls: RWall[]): boolean {
  return walls.every((w) => segmentsOfWall(w).every((s) => s.a.x === s.b.x || s.a.y === s.b.y));
}

/** Distinct wall materials present, in a stable (sorted) order. */
function materialsUsed(walls: RWall[]): string[] {
  return [...new Set(walls.map((w) => w.material))].sort();
}

/**
 * Axis-aligned rectangle to subtract for one opening: the opening spans its
 * `width` along the hosting wall segment and the full wall thickness across it.
 * Returns null for a non-orthogonal host (handled by the angled fallback).
 */
function openingRect(w: RWall, op: Opening): Rect | null {
  let seg = null as null | { a: { x: number; y: number }; b: { x: number; y: number } };
  let best = Infinity;
  for (const s of segmentsOfWall(w)) {
    const d = distPointToSegment(op.at, s.a, s.b);
    if (d < best) {
      best = d;
      seg = s;
    }
  }
  if (!seg) return null;
  const halfW = op.width / 2;
  const halfT = w.thickness / 2;
  if (seg.a.y === seg.b.y) {
    return { x0: op.at.x - halfW, x1: op.at.x + halfW, y0: op.at.y - halfT, y1: op.at.y + halfT };
  }
  if (seg.a.x === seg.b.x) {
    return { x0: op.at.x - halfT, x1: op.at.x + halfT, y0: op.at.y - halfW, y1: op.at.y + halfW };
  }
  return null; // angled host
}

/**
 * Wall fill + outline, grouped by material so each material's poché unions
 * independently. Orthogonal groups become a single multi-loop `region` (clean
 * boundaries, no internal seams); angled groups fall back to the wall element's
 * per-segment primitives.
 */
function lowerWalls(walls: RWall[], ctx: RenderCtx): SceneNode[] {
  if (walls.length === 0) return [];
  const nodes: SceneNode[] = [];
  for (const mat of materialsUsed(walls)) {
    const group = walls.filter((w) => w.material === mat);
    if (!allOrthogonal(group)) {
      const def = registry.get("wall")!;
      nodes.push(...group.flatMap((w) => def.render(w, ctx)));
      continue;
    }
    const rects: Rect[] = [];
    const holes: Rect[] = [];
    for (const w of group) {
      for (const s of segmentsOfWall(w)) {
        const corners = segmentRectangle(s.a, s.b, s.thickness);
        const xsv = corners.map((c) => c.x);
        const ysv = corners.map((c) => c.y);
        rects.push({ x0: Math.min(...xsv), y0: Math.min(...ysv), x1: Math.max(...xsv), y1: Math.max(...ysv) });
      }
      // Doors/windows void the wall solid (IFC-style opening subtraction).
      for (const op of w.openings) {
        const hr = openingRect(w, op);
        if (hr) holes.push(hr);
      }
    }
    const loops = rectBooleanOutline(rects, holes);
    if (loops.length === 0) continue;
    nodes.push({ layer: "wallFill", prim: { t: "region", loops }, paint: { fill: `url(#${patternId(mat)})`, fillRule: "nonzero" } });
    nodes.push({
      layer: "wallFace",
      prim: { t: "region", loops },
      paint: { fill: "none", stroke: ctx.theme.wallStroke, width: ctx.sizes.wallStroke, linejoin: "miter" },
    });
  }
  return nodes;
}

/**
 * Build the {@link Scene} for a resolved plan. The theme is merged + sanitized
 * once here and baked into node paint; it is also carried on the Scene for the
 * page chrome (north/scale/title). `opts.width` does not affect the Scene (it is
 * an SVG-only attribute) — only `opts.theme` participates.
 */
export function toScene(ir: ResolvedPlan, opts: CompileOptions = {}): Scene {
  const theme = sanitizeTheme(mergeTheme(DEFAULT_THEME, ir.theme, opts.theme));
  const lw = theme.lineWeight;

  const b = planBounds(ir);
  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
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

  // Collect non-wall elements (source order), then lower walls — exactly the v0.1
  // op order, so layer-bucketing in a backend reproduces the original draw order.
  const ctx: RenderCtx = { theme, sizes, bounds: b };
  const nodes: SceneNode[] = [];
  for (const el of ir.elements) {
    if (el.kind === "wall") continue;
    const def = registry.get(el.kind);
    if (def) nodes.push(...def.render(el, ctx));
  }
  nodes.push(...lowerWalls(ir.walls, ctx));

  return {
    width: drawW + sizes.margin * 2,
    height: drawH + sizes.margin * 2,
    bounds: b,
    nodes,
    theme,
    sizes,
    north: ir.north,
    scale: ir.scale,
    title: ir.title,
    name: ir.name,
    materials: materialsUsed(ir.walls),
  };
}
