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
import type { Bounds, Vec, WallSegment } from "./geometry.js";
import {
  add,
  distPointToSegment,
  emptyBounds,
  extendBounds,
  mul,
  normal,
  segmentRectangle,
  segmentsOfWall,
  sub,
  unit,
} from "./geometry.js";
import type { Rect } from "./geometry/union.js";
import { rectBooleanOutline } from "./geometry/union.js";
import { getGeometryBackend } from "./geometry/backend.js";
import type { GeometryBackend } from "./geometry/backend.js";
import type { Point } from "./ast.js";
import { patternId } from "./hatches.js";
import type { HatchSpec } from "./hatches.js";
import { dimReach, layoutChrome } from "./chrome-layout.js";
import { axesNodes } from "./axes.js";
import { circulationOverlayNodes } from "./overlays/circulation.js";
import { captionForPlan } from "./describe.js";
import { DEFAULT_THEME, THEMES, mergeTheme, sanitizeTheme, derivePoche } from "./theme.js";
import type { Theme } from "./theme.js";

/** Deterministic mm formatter for computed label text (round 2dp, strip zeros, no -0). */
import { fmt2 as fmtMm } from "./num-format.js";

/** Drawing bounds: each element contributes points via its registry `bounds`. */
function planBounds(ir: ResolvedPlan, registry: Registry): Bounds {
  const b = emptyBounds();
  for (const el of ir.elements) {
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    for (const p of def.bounds(el)) extendBounds(b, p.x, p.y);
  }
  if (!Number.isFinite(b.minX)) {
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
function lowerWalls(
  walls: RWall[],
  hatches: HatchSpec[],
  ctx: RenderCtx,
  registry: Registry,
  backend: GeometryBackend | null,
): SceneNode[] {
  if (walls.length === 0) return [];
  const nodes: SceneNode[] = [];
  for (const h of hatches) {
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
  return reg ? reg.theme : (THEMES[name] ?? {});
}

/**
 * Synthesize the dimension lines for `dims auto …` — the GB/T 50104 exterior
 * dimensioning convention: parallel CHAINS on the facades, all outside the
 * building, stepping outward from the wall faces (see {@link synthGbChains}).
 * Each is a plain {@link RDim} with no `text`, so the dim element formats the
 * measured length itself — the same value a hand-written `dim` would show.
 */
function synthDims(ir: ResolvedPlan, sizes: RenderSizes): RDim[] {
  const dims: RDim[] = [];
  if (ir.autoDims !== "walls") synthGbChains(ir, sizes, dims);
  if (ir.autoDims === "walls" || ir.autoDims === "all") synthWallDims(ir, dims);
  return dims;
}

const mkDim = (from: Point, to: Point, offset: number, text?: string): RDim => ({
  kind: "dim",
  id: "",
  from,
  to,
  offset,
  text,
});

/** The four facades a dimension chain can run along. */
type Side = "bottom" | "left" | "top" | "right";
const SIDES: readonly Side[] = ["bottom", "left", "top", "right"];

/** Which axis a side measures along: `h` = along x (bottom/top), `v` = along y. */
const SIDE_AXIS: Record<Side, "h" | "v"> = { bottom: "h", top: "h", left: "v", right: "v" };
/** Outward direction along the side's CROSS axis (+1 = increasing coordinate). */
const SIDE_OUT: Record<Side, 1 | -1> = { bottom: 1, right: 1, top: -1, left: -1 };

/**
 * Where one facade's chains live: the axis they measure along, the outer-face
 * coordinate they are offset from, the along-axis outer extent (corner to corner),
 * and the endpoint order that makes the dim element's left-normal offset point
 * AWAY from the building.
 */
interface SideGeom {
  axis: "h" | "v";
  /** Cross-axis coordinate of this facade's OUTER face (y for h sides, x for v). */
  outer: number;
  /** Centerline coordinate of the hosting exterior wall, or null when there is none. */
  line: number | null;
  /** Half the hosting wall's thickness (0 without one). */
  half: number;
  /** Along-axis outer extent (the two outer corners), always lo < hi. */
  lo: number;
  hi: number;
  /** +1 = emit each span lo→hi; −1 = hi→lo (what puts the offset outside). */
  sign: 1 | -1;
}

/** A point on a side's chain baseline, at along-axis coordinate `v`. */
const sidePt = (s: SideGeom, v: number): Point => (s.axis === "h" ? { x: v, y: s.outer } : { x: s.outer, y: v });

/** Chain slots, in multiples of `dimFont` outward from the wall face. Fixed per
 *  chain (not packed), so omitting a chain leaves its slot empty instead of
 *  reflowing the others — the openings chain is always the innermost. */
const CHAIN_BASE = 1.2;
const CHAIN_STEP = 2.2;
const chainOffset = (sizes: RenderSizes, slot: number): number => sizes.dimFont * (CHAIN_BASE + slot * CHAIN_STEP);

/** Ticks closer than this (mm) are the same tick — a corner and an opening edge
 *  landing together must not emit a zero-length span. */
const TICK_TOL = 0.5;

/** The measurement coordinate space: room rectangles when there are rooms (the
 *  coordinate space room boundaries live in), else the wall centerlines. Null when
 *  there is nothing to measure. */
function measureExtent(ir: ResolvedPlan): Bounds | null {
  const b = emptyBounds();
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room");
  for (const r of rooms) {
    extendBounds(b, r.at.x, r.at.y);
    extendBounds(b, r.at.x + r.size.w, r.at.y + r.size.h);
  }
  if (rooms.length === 0) {
    for (const w of ir.walls) for (const p of w.points) extendBounds(b, p.x, p.y);
  }
  return Number.isFinite(b.minX) ? b : null;
}

/**
 * The exterior wall bounding one facade: the nearest wall segment PARALLEL to that
 * facade at the matching edge of the measured extent, found with the same
 * nearest-segment idiom {@link openingRect} uses. Returns its centerline coordinate
 * and half thickness, or null when that side has no wall (then the caller falls back
 * to the extent itself — never a crash).
 */
function probeSide(walls: RWall[], ext: Bounds, side: Side): { line: number; half: number } | null {
  const horiz = SIDE_AXIS[side] === "h";
  const cross = side === "bottom" ? ext.maxY : side === "top" ? ext.minY : side === "left" ? ext.minX : ext.maxX;
  const mid = horiz ? (ext.minX + ext.maxX) / 2 : (ext.minY + ext.maxY) / 2;
  const p: Point = horiz ? { x: mid, y: cross } : { x: cross, y: mid };
  let best: WallSegment | null = null;
  let bestDist = Infinity;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      const isH = s.a.y === s.b.y;
      const isV = s.a.x === s.b.x;
      if (isH && isV) continue; // degenerate
      if (horiz ? !isH : !isV) continue; // not parallel to this facade
      const d = distPointToSegment(p, s.a, s.b);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
  }
  if (!best || bestDist > Math.max(best.thickness, 1)) return null;
  return { line: horiz ? best.a.y : best.a.x, half: best.thickness / 2 };
}

/** The four facades' chain geometry, derived once. */
function sideGeoms(ir: ResolvedPlan, ext: Bounds): Record<Side, SideGeom> {
  const probes = {} as Record<Side, { line: number; half: number } | null>;
  for (const s of SIDES) probes[s] = probeSide(ir.walls, ext, s);
  const outerOf = (s: Side): number => {
    const pr = probes[s];
    const base = s === "bottom" ? ext.maxY : s === "top" ? ext.minY : s === "left" ? ext.minX : ext.maxX;
    return pr ? pr.line + SIDE_OUT[s] * pr.half : base;
  };
  const o = { bottom: outerOf("bottom"), top: outerOf("top"), left: outerOf("left"), right: outerOf("right") };
  const mk = (side: Side, lo: number, hi: number, sign: 1 | -1): SideGeom => ({
    axis: SIDE_AXIS[side],
    outer: o[side],
    line: probes[side]?.line ?? null,
    half: probes[side]?.half ?? 0,
    lo,
    hi,
    sign,
  });
  return {
    bottom: mk("bottom", o.left, o.right, 1),
    left: mk("left", o.top, o.bottom, 1),
    top: mk("top", o.left, o.right, -1),
    right: mk("right", o.top, o.bottom, -1),
  };
}

/** One opening, reduced to the facade line it sits on and its along-axis centre. */
interface FacadeOpening {
  axis: "h" | "v";
  /** Centerline coordinate of the hosting segment (y for a horizontal wall). */
  line: number;
  /** Centre of the opening along the wall. */
  along: number;
  width: number;
}

/** Every door/window/cased opening, projected onto its hosting wall's line +
 *  along-axis centre. Angled hosts are skipped (no facade to chain them on). */
function facadeOpenings(ir: ResolvedPlan): FacadeOpening[] {
  const out: FacadeOpening[] = [];
  for (const w of ir.walls) {
    for (const op of w.openings) {
      let seg: WallSegment | null = null;
      let best = Infinity;
      for (const s of segmentsOfWall(w)) {
        const d = distPointToSegment(op.at, s.a, s.b);
        if (d < best) {
          best = d;
          seg = s;
        }
      }
      if (!seg) continue;
      if (seg.a.y === seg.b.y && seg.a.x !== seg.b.x)
        out.push({ axis: "h", line: seg.a.y, along: op.at.x, width: op.width });
      else if (seg.a.x === seg.b.x && seg.a.y !== seg.b.y)
        out.push({ axis: "v", line: seg.a.x, along: op.at.y, width: op.width });
    }
  }
  return out;
}

/** Sorted ticks with near-duplicates and out-of-range values removed. */
function cleanTicks(values: readonly number[], lo: number, hi: number): number[] {
  const inRange = values.filter((v) => v >= lo - TICK_TOL && v <= hi + TICK_TOL).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of inRange) {
    const prev = out[out.length - 1];
    if (prev === undefined || v - prev > TICK_TOL) out.push(v);
  }
  return out;
}

/** Emit one chain: a dim per span between consecutive ticks, all at one offset. */
function emitChain(side: SideGeom, ticks: readonly number[], offset: number, dims: RDim[]): void {
  if (ticks.length < 2) return;
  for (let i = 0; i + 1 < ticks.length; i++) {
    const a = ticks[i]!;
    const b = ticks[i + 1]!;
    const [from, to] = side.sign > 0 ? [a, b] : [b, a];
    dims.push(mkDim(sidePt(side, from), sidePt(side, to), offset));
  }
}

/**
 * `dims auto` — GB/T 50104 exterior dimensioning: up to three parallel chains per
 * facade, ALL outside the building and all measured from the outer wall faces,
 * stepping outward from the wall.
 *
 * 1. **openings** (innermost) — a tick at every opening edge on that facade, so the
 *    chain reads corner · pier · opening · pier · corner. Skipped on a facade with
 *    no openings.
 * 2. **centerline / axis** — when the plan declares **positioning axes** on this
 *    facade's direction (`axes { x at … }` for bottom/top, `y at …` for left/right),
 *    the ticks are those axis positions: the GB/T *axis* chain proper (轴线间距), the
 *    number a structural engineer reads. Without declared axes on that direction it
 *    falls back to the sorted unique room-boundary coordinates projected on that axis
 *    — the partition axes, the classic "4000 · 3000" room chain. This is what
 *    `dims auto rooms` emits on its own, and it replaced the old per-room dims,
 *    which measured room rectangles (short by half a wall thickness at each end) and
 *    fell back to drawing INSIDE any room that touched no perimeter. Either way the
 *    chain stays OUTSIDE the building at the same slot offset: declaring axes changes
 *    only WHERE THE TICKS FALL, never the chain's position or reference faces.
 * 3. **overall** (outermost) — one span, outer face to outer face.
 *
 * Bottom + left always carry chains (the reading convention); top and right only when
 * an openings chain is actually being drawn there (`dims auto all` AND that facade has
 * openings of its own) — so `dims auto rooms`/`overall` stay two-sided, and a fully
 * dimensioned plan reads all four facades. Presentation only: never
 * touches the IR, describe() or lint(), and the page margins grow from the emitted
 * geometry via `dimReach`, so nothing clips.
 */
function synthGbChains(ir: ResolvedPlan, sizes: RenderSizes, dims: RDim[]): void {
  const ext = measureExtent(ir);
  if (!ext) return;
  const mode = ir.autoDims;
  const wantOpenings = mode === "all";
  const wantAxis = mode === "rooms" || mode === "all";
  const wantOverall = mode === "overall" || mode === "all";

  const geoms = sideGeoms(ir, ext);
  const openings = facadeOpenings(ir);
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room");

  for (const side of SIDES) {
    const g = geoms[side];
    // Opening edges on this facade (its own wall line, same orientation).
    const mine =
      g.line === null
        ? []
        : openings.filter((op) => op.axis === g.axis && Math.abs(op.line - g.line!) <= Math.max(g.half, 1));
    // Top/right are only dimensioned when an openings chain will be drawn there.
    if ((side === "top" || side === "right") && !(wantOpenings && mine.length > 0)) continue;

    if (wantOpenings && mine.length > 0) {
      const edges = mine.flatMap((op) => [op.along - op.width / 2, op.along + op.width / 2]);
      emitChain(g, cleanTicks([g.lo, ...edges, g.hi], g.lo, g.hi), chainOffset(sizes, 0), dims);
    }
    if (wantAxis) {
      // Declared axes on this direction win: the middle chain becomes the true GB/T
      // axis chain. The fallback is per-DIRECTION, so a plan that declares only `x`
      // axes still gets the room-boundary chain on its vertical facades.
      const declared = (ir.axes ?? []).filter((a) => a.axis === (g.axis === "h" ? "x" : "y")).map((a) => a.pos);
      const ticks =
        declared.length > 0
          ? declared
          : rooms.flatMap((r) => (g.axis === "h" ? [r.at.x, r.at.x + r.size.w] : [r.at.y, r.at.y + r.size.h]));
      emitChain(g, cleanTicks(ticks, g.lo, g.hi), chainOffset(sizes, 1), dims);
    }
    if (wantOverall) emitChain(g, [g.lo, g.hi], chainOffset(sizes, 2), dims);
  }
}

/** One thickness call-out per distinct wall thickness (deduped so eight identical
 *  partitions show "100" once, not eight times). For each thickness, the longest
 *  axis-aligned segment carrying it is the representative — most room for a clean
 *  annotation, chosen deterministically (max length, then source order). The dim
 *  runs face-to-face across the wall at the segment midpoint with the measured
 *  thickness as its text; its zero offset keeps it on the wall, the dim element
 *  pushes the number just to one side. Presentation only — never expands bounds
 *  meaningfully (faces sit ½-thickness off a centerline already inside the plan). */
function synthWallDims(ir: ResolvedPlan, dims: RDim[]): void {
  const repByThickness = new Map<number, { mid: Point; n: Vec; t: number; len: number }>();
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      const d = sub(s.b, s.a);
      if (d.x !== 0 && d.y !== 0) continue; // orthogonal segments only
      const len = Math.hypot(d.x, d.y);
      if (len <= 0) continue;
      const prev = repByThickness.get(s.thickness);
      if (prev && prev.len >= len) continue;
      const dir = unit(d);
      repByThickness.set(s.thickness, {
        mid: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 },
        n: normal(dir),
        t: s.thickness,
        len,
      });
    }
  }
  for (const t of [...repByThickness.keys()].sort((a, c) => a - c)) {
    const rep = repByThickness.get(t)!;
    const half = mul(rep.n, rep.t / 2);
    dims.push(mkDim(add(rep.mid, half), add(rep.mid, mul(half, -1)), 0, fmtMm(rep.t)));
  }
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
  // Will the wall lowering below actually void the wall solid at every opening? The
  // rectilinear boolean does (it subtracts `openingRect` per opening), so an
  // all-orthogonal wall set is voided for sure; a set containing an angled wall may
  // fall through to the per-segment wall primitives, which subtract nothing. Derived
  // from wall geometry only — never from backend presence — so output stays
  // byte-identical with and without a registered geometry backend.
  const openingsVoided = allOrthogonal(ir.walls);
  const baseCtx: RenderCtx = { theme, sizes, bounds: b, fmt: fmtMm, openingsVoided };
  const ctxFor = (kind: string): RenderCtx => {
    const st = styledByKind.get(kind);
    return st ? { ...baseCtx, theme: st } : baseCtx;
  };
  const nodes: SceneNode[] = [];
  for (const el of ir.elements) {
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    // Only when `annotate` is requested (ADR 0007): carry the element's source
    // span onto every primitive it renders, so the SVG pass can map a drawn
    // element back to its source. Off by default → the Scene IR is byte-identical
    // to before. Purely metadata — never read by geometry/describe/lint. Walls are
    // unioned across statements, so their per-node span is ambiguous → left unset.
    const rendered = def.render(el, ctxFor(el.kind));
    if (opts.annotate) {
      const span = (el as { span?: SceneNode["span"] }).span;
      nodes.push(
        ...rendered.map((n) => ({
          ...n,
          elementId: el.id,
          elementKind: el.kind,
          span: n.span !== undefined ? n.span : span,
        })),
      );
    } else {
      nodes.push(...rendered);
    }
  }
  const hatches = hatchesUsed(ir.walls);
  nodes.push(...lowerWalls(ir.walls, hatches, ctxFor("wall"), registry, backend));

  // `dims auto …` — synthesize dimension strings (presentation only; never touches
  // the IR, bounds, describe() or lint()). Every chain sits OUTSIDE the building,
  // stepping outward from the wall faces; the page margins grow to contain them
  // through `dimReach` below.
  if (ir.autoDims) {
    const dimDef = registry.byKind.get("dim");
    if (dimDef) {
      const dimCtx = ctxFor("dim");
      for (const dm of synthDims(ir, sizes)) nodes.push(...dimDef.render(dm, dimCtx));
    }
  }

  // Positioning axes (定位轴线) — the author-declared datum grid. Emitted AFTER the dims
  // so the bubbles can be placed outside whatever dimension chains exist on each side
  // (measured on the `dims` pass alone — the axis nodes we are about to add must not
  // push themselves further out). `layoutChrome` below then sees both bands, so the page
  // grows to contain the bubbles. No `axes` block → nothing emitted, output unchanged.
  if (ir.axes && ir.axes.length > 0) {
    nodes.push(...axesNodes(ir.axes, b, sizes, theme, dimReach(b, nodes, ["dims"])));
  }

  // Page chrome (scale bar + title block) sits below the dimension band; the page
  // margins grow per-side so neither the chrome nor any dimension clips (shared with
  // the SVG/PDF backends via the one layoutChrome source).
  const chrome = layoutChrome({ bounds: b, refDim, baseMargin: sizes.margin, nodes, title: ir.title, scale: ir.scale });
  const m = chrome.margin;

  // Opt-in diagnostic overlays (ADR 0008): appended AFTER all nodes and after chrome
  // layout, so the default Scene (no overlays) is byte-identical and the overlay never
  // shifts the page or chrome. Off by default — never on the shipped-SVG path.
  if (opts.overlays?.includes("circulation")) {
    nodes.push(...circulationOverlayNodes(ir, theme, sizes));
  }

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
    hatches,
    chrome,
    // Opt-in accessibility metadata (ADR 0007 pattern): carry the accessible
    // <title>/<desc> text onto the Scene only when asked, so the SVG backend can emit
    // them. An explicit `accTitle`/`accDescr` (plan-level keywords) overrides the
    // derived pair — the plan name for the title, the deterministic describe() caption
    // for the desc. Off by default → the Scene is byte-identical. Never read by geometry.
    ...(opts.accessible ? { name: ir.accTitle ?? ir.name, caption: ir.accDescr ?? captionForPlan(ir) } : {}),
  };
}
