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
import type { Opening, ResolvedPlan, RWall, RRoom, RDim } from "./ir.js";
import type { RenderCtx, Registry, Runtime } from "./registry.js";
import { BUILTIN_RUNTIME } from "./registry.js";
import type { RenderSizes, Scene, SceneNode } from "./scene.js";
import type { Bounds, Vec } from "./geometry.js";
import { add, distPointToSegment, emptyBounds, extendBounds, mul, normal, segmentRectangle, segmentsOfWall, sub, unit } from "./geometry.js";
import type { Rect } from "./geometry/union.js";
import { rectBooleanOutline } from "./geometry/union.js";
import { getGeometryBackend } from "./geometry/backend.js";
import type { GeometryBackend } from "./geometry/backend.js";
import type { Point } from "./ast.js";
import { patternId } from "./hatches.js";
import type { HatchSpec } from "./hatches.js";
import { layoutChrome } from "./chrome-layout.js";
import { DEFAULT_THEME, THEMES, mergeTheme, sanitizeTheme, derivePoche } from "./theme.js";
import type { Theme } from "./theme.js";

/** Deterministic mm formatter for computed label text (round 2dp, strip zeros, no -0). */
function fmtMm(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Drawing bounds: each element contributes points via its registry `bounds`. */
function planBounds(ir: ResolvedPlan, registry: Registry): Bounds {
  const b = emptyBounds();
  for (const el of ir.elements) {
    const def = registry.byKind.get(el.kind);
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

/** The hatch spec a wall fills with (material + scale + angle). */
function hatchOf(w: RWall): HatchSpec {
  return { material: w.material, scale: w.hatchScale, angle: w.hatchAngle };
}

/** Stable grouping key for a hatch spec (walls sharing it union together). */
function hatchKey(h: HatchSpec): string {
  return `${h.material}|${h.scale}|${h.angle}`;
}

/** Distinct hatch specs present, in a stable (key-sorted) order. */
function hatchesUsed(walls: RWall[]): HatchSpec[] {
  const seen = new Map<string, HatchSpec>();
  for (const w of walls) {
    const h = hatchOf(w);
    const k = hatchKey(h);
    if (!seen.has(k)) seen.set(k, h);
  }
  return [...seen.values()].sort((a, b) => (hatchKey(a) < hatchKey(b) ? -1 : 1));
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
 * Opening rectangle as a rotated polygon, oriented along the hosting wall
 * segment: it spans the opening `width` along the segment direction and the full
 * wall thickness across it. Used by the angled (polygon-backend) path, where the
 * host may be at any angle (unlike {@link openingRect}, which is axis-aligned).
 */
function openingPoly(w: RWall, op: Opening): Point[] | null {
  let seg = null as null | { a: Point; b: Point };
  let best = Infinity;
  for (const s of segmentsOfWall(w)) {
    const d = distPointToSegment(op.at, s.a, s.b);
    if (d < best) {
      best = d;
      seg = s;
    }
  }
  if (!seg) return null;
  const dir: Vec = unit(sub(seg.b, seg.a));
  const nrm = normal(dir);
  const hw = op.width / 2;
  const ht = w.thickness / 2;
  return [
    add(add(op.at, mul(dir, -hw)), mul(nrm, -ht)),
    add(add(op.at, mul(dir, hw)), mul(nrm, -ht)),
    add(add(op.at, mul(dir, hw)), mul(nrm, ht)),
    add(add(op.at, mul(dir, -hw)), mul(nrm, ht)),
  ];
}

/** The fill (data-driven hatch) + outline nodes for one hatch group's unioned region. */
function emitRegion(loops: Point[][], h: HatchSpec, ctx: RenderCtx): SceneNode[] {
  return [
    {
      layer: "wallFill",
      prim: { t: "hatch", region: loops, material: h.material, scale: h.scale, angle: h.angle },
      paint: { fill: `url(#${patternId(h.material, h.scale, h.angle)})`, fillRule: "nonzero" },
    },
    {
      layer: "wallFace",
      prim: { t: "region", loops },
      paint: { fill: "none", stroke: ctx.theme.wallStroke, width: ctx.sizes.wallStroke, linejoin: "miter" },
    },
  ];
}

/** Axis-aligned union (+ opening holes) for an all-orthogonal hatch group. */
function lowerOrthogonalGroup(group: RWall[], h: HatchSpec, ctx: RenderCtx): SceneNode[] {
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
  return loops.length === 0 ? [] : emitRegion(loops, h, ctx);
}

/**
 * Polygon union (+ opening holes) for a hatch group containing angled walls, via
 * the optional {@link GeometryBackend}. Each segment becomes a (possibly rotated)
 * rectangle; the backend merges them into one seamless outline and subtracts the
 * opening polygons. Returns `null` if the backend yields nothing (degenerate
 * input), so the caller can fall back.
 */
function lowerAngledGroup(group: RWall[], h: HatchSpec, ctx: RenderCtx, backend: GeometryBackend): SceneNode[] | null {
  const rects: Point[][] = [];
  const holes: Point[][] = [];
  for (const w of group) {
    for (const s of segmentsOfWall(w)) rects.push(segmentRectangle(s.a, s.b, s.thickness));
    for (const op of w.openings) {
      const hp = openingPoly(w, op);
      if (hp) holes.push(hp);
    }
  }
  const loops = holes.length ? backend.difference(rects, holes) : backend.union(rects);
  return loops.length === 0 ? null : emitRegion(loops, h, ctx);
}

/**
 * Wall fill + outline, grouped by hatch spec (material + scale + angle) so each
 * distinct poché unions independently. Orthogonal groups become a single
 * multi-loop region via the zero-dependency rectilinear boolean (byte-identical
 * regardless of any registered backend). A group with angled walls uses the
 * optional {@link GeometryBackend} when one is registered (seamless joinery),
 * else falls back to the wall element's per-segment primitives.
 */
function lowerWalls(walls: RWall[], ctx: RenderCtx, registry: Registry, backend: GeometryBackend | null): SceneNode[] {
  if (walls.length === 0) return [];
  const nodes: SceneNode[] = [];
  for (const h of hatchesUsed(walls)) {
    const k = hatchKey(h);
    const group = walls.filter((w) => hatchKey(hatchOf(w)) === k);
    if (allOrthogonal(group)) {
      nodes.push(...lowerOrthogonalGroup(group, h, ctx));
      continue;
    }
    const viaBackend = backend ? lowerAngledGroup(group, h, ctx, backend) : null;
    if (viaBackend) {
      nodes.push(...viaBackend);
    } else {
      const def = registry.byKind.get("wall")!;
      nodes.push(...group.flatMap((w) => def.render(w, ctx)));
    }
  }
  return nodes;
}

/**
 * Build the {@link Scene} for a resolved plan. The theme is merged + sanitized
 * once here and baked into node paint; it is also carried on the Scene for the
 * page chrome (north/scale/title). `opts.width` does not affect the Scene (it is
 * an SVG-only attribute) — only `opts.theme` participates.
 */
/** Resolve `theme <name>` to its colours: per-call registered themes win over built-in THEMES. */
function themeBaseLookup(name: string | undefined, runtime: Runtime): Partial<Theme> {
  if (!name) return {};
  const reg = runtime.themes?.find((t) => t.name === name);
  return reg ? reg.theme : THEMES[name] ?? {};
}

/**
 * Synthesize the dimension lines for `dims auto …`. Overall dims run along the
 * bottom and left of the drawing, offset into the page margin; per-room dims run
 * just inside each room's top and left edges (so neither pushes the page extent).
 * Each is a plain {@link RDim} with no `text`, so the dim element formats the
 * measured length itself — the same value a hand-written `dim` would show.
 */
function synthDims(ir: ResolvedPlan, b: Bounds, sizes: RenderSizes): RDim[] {
  const dims: RDim[] = [];
  const mk = (from: Point, to: Point, offset: number): RDim => ({ kind: "dim", id: "", from, to, offset });
  const wantOverall = ir.autoDims === "overall" || ir.autoDims === "all";
  const wantRooms = ir.autoDims === "rooms" || ir.autoDims === "all";

  if (wantOverall) {
    const off = sizes.margin * 0.5;
    // Width below the plan; height to the left of it (both in the page margin). The
    // dim element offsets along the *left normal* of from→to, so endpoint order
    // chooses the side: width runs minX→maxX (normal points +y, below); height runs
    // minY→maxY (normal points −x, left). Reversing either would push it *inside*.
    dims.push(mk({ x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }, off));
    dims.push(mk({ x: b.minX, y: b.minY }, { x: b.minX, y: b.maxY }, off));
  }

  if (wantRooms) {
    const inset = sizes.dimFont * 1.6;
    for (const el of ir.elements) {
      if (el.kind !== "room") continue;
      const r = el as RRoom;
      const { x, y } = r.at;
      const { w, h } = r.size;
      // Width inside the top edge; height inside the left edge (points ordered so
      // the dim's perpendicular offset lands inside the room).
      dims.push(mk({ x, y }, { x: x + w, y }, inset));
      dims.push(mk({ x, y: y + h }, { x, y }, inset));
    }
  }
  return dims;
}

export function toScene(ir: ResolvedPlan, opts: CompileOptions = {}, runtime: Runtime = BUILTIN_RUNTIME): Scene {
  const registry = runtime.registry;
  const backend = runtime.backend ?? getGeometryBackend();

  // Theme cascade (later wins): default → named base → plan `theme{}` overrides →
  // opt-in `theme from` poché → [per-element `style`] → CompileOptions.theme. The
  // `theme from` layer only exists when written, so existing plans are unaffected.
  // `preStyle` holds everything below `style`/`opts.theme`; sanitize is applied
  // exactly once per produced theme (no double-escaping), and `opts.theme` is the
  // last layer in BOTH paths so it always wins — even over a per-element style.
  const base = themeBaseLookup(ir.themeBase, runtime);
  const themeFromLayer = ir.themeFrom ? derivePoche(ir.themeFrom) : undefined;
  const preStyle = mergeTheme(DEFAULT_THEME, base, themeFromLayer, ir.theme);
  const theme = sanitizeTheme(mergeTheme(preStyle, opts.theme));

  // Per-element styled themes (`style <kind> { … }`), each sanitized once. Absent
  // styles → every element reuses `theme` (identity) → byte-identical output.
  const styledByKind = new Map<string, Theme>();
  if (ir.styles) {
    for (const kind of Object.keys(ir.styles)) {
      styledByKind.set(kind, sanitizeTheme(mergeTheme(preStyle, ir.styles[kind], opts.theme)));
    }
  }

  const lw = theme.lineWeight;

  const b = planBounds(ir, registry);
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
  // Each kind gets its styled theme when `style <kind>` applies, else the base ctx.
  const baseCtx: RenderCtx = { theme, sizes, bounds: b, fmt: fmtMm };
  const ctxFor = (kind: string): RenderCtx => {
    const st = styledByKind.get(kind);
    return st ? { ...baseCtx, theme: st } : baseCtx;
  };
  const nodes: SceneNode[] = [];
  for (const el of ir.elements) {
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (def) nodes.push(...def.render(el, ctxFor(el.kind)));
  }
  nodes.push(...lowerWalls(ir.walls, ctxFor("wall"), registry, backend));

  // `dims auto …` — synthesize dimension strings (presentation only; never touches
  // the IR, bounds, describe() or lint()). Overall dims sit in the page margin;
  // per-room dims sit just inside each room, so the page extent is unchanged.
  if (ir.autoDims) {
    const dimDef = registry.byKind.get("dim");
    if (dimDef) {
      const dimCtx = ctxFor("dim");
      for (const dm of synthDims(ir, b, sizes)) nodes.push(...dimDef.render(dm, dimCtx));
    }
  }

  // Page chrome (scale bar + title block) sits below the dimension band; the page
  // margins grow per-side so neither the chrome nor any dimension clips (shared with
  // the SVG/PDF backends via the one layoutChrome source).
  const chrome = layoutChrome({ bounds: b, refDim, baseMargin: sizes.margin, nodes, title: ir.title, scale: ir.scale });
  const m = chrome.margin;

  return {
    width: drawW + m.left + m.right,
    height: drawH + m.top + m.bottom,
    bounds: b,
    nodes,
    theme,
    sizes,
    north: ir.north,
    scale: ir.scale,
    title: ir.title,
    name: ir.name,
    hatches: hatchesUsed(ir.walls),
  };
}
