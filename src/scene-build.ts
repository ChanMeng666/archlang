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
import type { Opening, ResolvedPlan, RWall, RRoom, RDim, RFurniture } from "./ir.js";
import type { RenderCtx, Registry, Runtime } from "./registry.js";
import { BUILTIN_RUNTIME } from "./registry.js";
import type { RenderSizes, Scene, SceneNode, SceneSheet } from "./scene.js";
import { MITER_LIMIT } from "./scene.js";
import type { Bounds, Vec, WallSegment } from "./geometry.js";
import {
  add,
  distPointToWallSegment,
  emptyBounds,
  extendBounds,
  mul,
  normal,
  segmentFaceExtremes,
  segmentRectangle,
  segmentsOfWall,
  sub,
  unit,
  wallHasArc,
} from "./geometry.js";
import { arcPointAt, diameterText, radiusText } from "./geometry/arc.js";
import type { Rect } from "./geometry/union.js";
import { rectBooleanOutline } from "./geometry/union.js";
import { getGeometryBackend } from "./geometry/backend.js";
import type { GeometryBackend } from "./geometry/backend.js";
import type { Point } from "./ast.js";
import { hatchKey, hatchOf, hatchesUsed, patternId } from "./hatches.js";
import type { HatchSpec } from "./hatches.js";
import { anchorChromeToSheet, dimReach, layoutChrome } from "./chrome-layout.js";
import { axesNodes } from "./axes.js";
import { CHAIN_BASE, CHAIN_STEP, DIM_TEXT_GAP, SHEET_MM, sizesFromPaper } from "./sheet.js";
import { textWidth } from "./text-metrics.js";
import type { RoomLabelGroup } from "./label-placement.js";
import { relocateRoomLabels } from "./label-placement.js";
import { legendEntries, roomSchedule, sheetTableNodes } from "./sheet-tables.js";
import { circulationOverlayNodes } from "./overlays/circulation.js";
import { captionForPlan } from "./describe.js";
import type { RoomBox } from "./analyze.js";
import { pointInRoomBox, roomBox } from "./analyze.js";
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

/** Is every segment of every wall axis-aligned (horizontal or vertical)? A CURVED edge
 *  never is — its chord may well be axis-aligned (a semicircle's is), so the arc marker
 *  is what decides, not the endpoints. */
function allOrthogonal(walls: RWall[]): boolean {
  return walls.every((w) => segmentsOfWall(w).every((s) => !s.arc && (s.a.x === s.b.x || s.a.y === s.b.y)));
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
    if (s.arc) continue; // a curve never reaches the axis-aligned boolean (see lowerWalls)
    const d = distPointToWallSegment(op.at, s);
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
    if (s.arc) continue; // a curve never reaches the polygon boolean (see lowerWalls)
    const d = distPointToWallSegment(op.at, s);
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
      paint: {
        fill: "none",
        stroke: ctx.theme.wallStroke,
        width: ctx.sizes.wallStroke,
        linejoin: "miter",
        miterLimit: MITER_LIMIT,
      },
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
  const wallDef = registry.byKind.get("wall")!;
  for (const h of hatches) {
    const k = hatchKey(h);
    const inGroup = walls.filter((w) => hatchKey(hatchOf(w)) === k);
    // CURVED walls are lowered by the wall element itself, ALWAYS — never through a
    // boolean. Two reasons, both load-bearing:
    //
    //  1. The unioned `region` primitive is a straight-segment path, so routing a curve
    //     through it would draw a faceted 48-gon face. The element path emits TRUE `arc`
    //     primitives (SVG `A`, DXF `ARC`) at r ± t/2, so a curve is never faceted.
    //  2. `lowerAngledGroup` runs only when the optional clipper2 backend is registered.
    //     Sending a curve down it would make an arc plan's bytes DEPEND ON AN OPTIONAL
    //     DEPENDENCY — exactly what the determinism suite (which compiles with the
    //     backend both present and absent) forbids.
    //
    // The split is PER WALL, not per group, so a plan mixing a curved facade with
    // straight service wings keeps the straight walls' existing union — and therefore
    // their bytes — untouched. A plan with no arc has an empty `curved` list and takes
    // exactly the code it always did.
    const curved = inGroup.filter(wallHasArc);
    const group = curved.length === 0 ? inGroup : inGroup.filter((w) => !wallHasArc(w));
    if (group.length > 0) {
      if (allOrthogonal(group)) {
        nodes.push(...lowerOrthogonalGroup(group, h, ctx));
      } else {
        const viaBackend = backend ? lowerAngledGroup(group, h, ctx, backend) : null;
        if (viaBackend) nodes.push(...viaBackend);
        else nodes.push(...group.flatMap((w) => wallDef.render(w, ctx)));
      }
    }
    for (const w of curved) nodes.push(...wallDef.render(w, ctx));
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
  if (ir.autoDims !== "walls") {
    synthGbChains(ir, sizes, dims);
    synthCurveDims(ir, dims);
  }
  if (ir.autoDims === "walls" || ir.autoDims === "all") synthWallDims(ir, sizes, dims);
  return dims;
}

/**
 * `dims auto` for CURVES — the GB/T 50104 convention for anything round: a linear chain
 * cannot describe an arc, so a curve is dimensioned by its RADIUS and a circle by its
 * DIAMETER.
 *
 * One `R<r>` leader per distinct arc edge, drawn from the centre out to the arc's
 * midpoint (so it reads as the radius it measures), and one `phi<d>` across every circular
 * room through its centre. Deduplicated by (centre, radius) so a full circle written as
 * two semicircles gets ONE call-out, not two. Presentation only — like every other
 * `dims auto` chain it never touches the IR, `describe()` or `lint()`, and a plan with no
 * curve emits nothing here.
 */
function synthCurveDims(ir: ResolvedPlan, dims: RDim[]): void {
  const seen = new Set<string>();
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (!s.arc) continue;
      const key = `${fmtMm(s.arc.center.x)}|${fmtMm(s.arc.center.y)}|${fmtMm(s.arc.r)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dims.push(mkDim(s.arc.center, arcPointAt(s.arc, 0.5), 0, radiusText(s.arc.r, fmtMm)));
    }
  }
  for (const el of ir.elements) {
    if (el.kind !== "room") continue;
    const c = (el as RRoom).circle;
    if (!c || !(c.r > 0)) continue;
    dims.push(mkDim({ x: c.c.x - c.r, y: c.c.y }, { x: c.c.x + c.r, y: c.c.y }, 0, diameterText(c.r, fmtMm)));
  }
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
  /** Outward direction along the cross axis (`SIDE_OUT[side]`). */
  out: 1 | -1;
  /** This side's axis' facade profile (see {@link facadeAt}). */
  profile: FacadeProfile;
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

/**
 * One straight wall segment reduced to what a facade profile reads on one axis: the
 * centerline as `cross = c0 + m·(along − a0)` over the along-span `[lo,hi]`, plus
 * `faceOff` — how far the OUTER face sits from that centerline **measured on the cross
 * axis**. A line of slope `m` offset perpendicularly by `h` moves by `h·√(1+m²)` on the
 * cross axis, so that factor is exact, not an approximation.
 */
interface ProfileSeg {
  lo: number;
  hi: number;
  a0: number;
  c0: number;
  faceOff: number;
  m: number;
}

/**
 * One axis' facade profile: the straight segments that can state a cross coordinate,
 * plus the along-spans the plan's CURVED edges occupy.
 */
interface FacadeProfile {
  segs: ProfileSeg[];
  /** Along-spans (`[lo,hi]`, full wall band incl. the bulge) covered by an `arc` edge. */
  curves: { lo: number; hi: number }[];
}

/**
 * Reduce the plan's wall segments to one axis' facade profile.
 *
 * A straight segment PERPENDICULAR to the axis spans no along range and states no
 * cross coordinate, so it is dropped.
 *
 * An `arc` edge is **not** reduced to a line — a chord would be wrong by the sagitta,
 * and solving the circle for the face coordinate at `v` needs the arc's angular range
 * and its inward sense. Its along-span is recorded in `curves` instead, so
 * {@link facadeAt} can DECLINE there rather than hand back some straight wall further
 * in. Terminating a witness line on a true arc is deferred, in the same spirit as
 * `probeSide` / `facadeOpenings` / `synthWallDims`, which already decline curves
 * rather than approximate them.
 */
function facadeProfile(walls: readonly RWall[], axis: "h" | "v"): FacadeProfile {
  const alongOf = (p: Point): number => (axis === "h" ? p.x : p.y);
  const crossOf = (p: Point): number => (axis === "h" ? p.y : p.x);
  const profile: FacadeProfile = { segs: [], curves: [] };
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) {
        // Closed-form band extremes (endpoints + any axis extreme inside the sweep),
        // so the bulge is inside the declined span, not just the chord.
        const pts = [s.a, s.b, ...segmentFaceExtremes(s, s.thickness)].map(alongOf);
        profile.curves.push({ lo: Math.min(...pts), hi: Math.max(...pts) });
        continue;
      }
      const a0 = alongOf(s.a);
      const dAl = alongOf(s.b) - a0;
      if (dAl === 0) continue; // perpendicular to this axis: no cross value at a given `along`
      const m = (crossOf(s.b) - crossOf(s.a)) / dAl;
      profile.segs.push({
        lo: Math.min(a0, a0 + dAl),
        hi: Math.max(a0, a0 + dAl),
        a0,
        c0: crossOf(s.a),
        faceOff: (s.thickness / 2) * Math.sqrt(1 + m * m),
        m,
      });
    }
  }
  return profile;
}

/** Distance from `v` to a span; 0 when the span covers it. */
const spanGap = (s: { lo: number; hi: number }, v: number): number => Math.max(0, s.lo - v, v - s.hi);

/**
 * The facade's OUTER-face cross coordinate at along coordinate `v` — the point a
 * witness line for a tick at `v` must terminate on. Null when the profile cannot say
 * (no walls, or a curve is what stands there), which leaves the caller on the flat
 * `SideGeom.outer` fallback.
 *
 * Closed form, one pass, no iteration:
 *
 * - Segments **spanning** `v` describe the facade there; the OUTERMOST of them wins,
 *   which is what makes an L-shaped or angled building read its own silhouette
 *   instead of its bounding box.
 * - When none spans `v` — the overall chain's ticks sit half a wall THROUGH the last
 *   corner, on the outer-face plane — the nearest segments' lines are EXTENDED to `v`,
 *   which lands exactly on the mitred outer corner.
 * - Where two facades meet, their centerlines tie and the drawn outline is the mitre
 *   between their faces. Taking the INNERMOST face of the tied set puts the terminus
 *   inside the poché rather than a hair off the wall — the safe side of the join, and
 *   the one that reproduces an orthogonal plan's existing bytes exactly (both faces
 *   are `half` away when `m = 0`).
 * - A curved edge standing at least as close to `v` as the nearest straight one wins
 *   nothing and blocks everything: returning some partition 20 m inside the building
 *   would be a different wrong answer, not a smaller one.
 */
function facadeAt(profile: FacadeProfile, out: 1 | -1, v: number): number | null {
  let nearest = Number.POSITIVE_INFINITY;
  for (const s of profile.segs) nearest = Math.min(nearest, spanGap(s, v));
  if (!Number.isFinite(nearest)) return null;
  for (const c of profile.curves) if (spanGap(c, v) <= nearest + TICK_TOL) return null;
  // Signed so that "outermost" is always "largest", whichever way the side faces.
  let bestCr = Number.NEGATIVE_INFINITY;
  let bestFace = 0;
  for (const s of profile.segs) {
    if (spanGap(s, v) > nearest + TICK_TOL) continue;
    const cr = out * (s.c0 + s.m * (v - s.a0));
    const face = cr + s.faceOff;
    if (cr > bestCr + TICK_TOL) {
      bestCr = cr;
      bestFace = face;
    } else if (cr > bestCr - TICK_TOL) {
      bestCr = Math.max(bestCr, cr);
      bestFace = Math.min(bestFace, face);
    }
  }
  return out * bestFace;
}

/** Where the extension (witness) line for a tick at `v` STARTS: on the facade itself,
 *  not on the chain's straight baseline (which is where {@link sidePt} measures). */
const witnessPt = (s: SideGeom, v: number): Point => {
  const cross = facadeAt(s.profile, s.out, v) ?? s.outer;
  return s.axis === "h" ? { x: v, y: cross } : { x: cross, y: v };
};

/** Chain slots, in multiples of `dimFont` outward from the wall face. Fixed per
 *  chain (not packed), so omitting a chain leaves its slot empty instead of
 *  reflowing the others — the openings chain is always the innermost. The two
 *  constants live in `src/sheet.ts` because the sheet fit test must reserve exactly
 *  the band these chains occupy. */
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
    for (const w of ir.walls) {
      for (const p of w.points) extendBounds(b, p.x, p.y);
      // A curve's chord endpoints are already in `points`; its BULGE is not, and a
      // dimension chain measured to a chord would be short by the sagitta.
      for (const s of segmentsOfWall(w)) {
        if (s.arc) for (const p of segmentFaceExtremes(s, 0)) extendBounds(b, p.x, p.y);
      }
    }
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
      // A curved facade has no single face coordinate to offset a chain from, so it
      // never hosts one (`synthCurveDims` gives it an R call-out instead).
      if (s.arc) continue;
      const isH = s.a.y === s.b.y;
      const isV = s.a.x === s.b.x;
      if (isH && isV) continue; // degenerate
      if (horiz ? !isH : !isV) continue; // not parallel to this facade
      const d = distPointToWallSegment(p, s);
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
  // One profile per AXIS (not per side) — the two facades facing each other read the
  // same segments from opposite directions.
  const profiles = { h: facadeProfile(ir.walls, "h"), v: facadeProfile(ir.walls, "v") };
  const mk = (side: Side, lo: number, hi: number, sign: 1 | -1): SideGeom => ({
    axis: SIDE_AXIS[side],
    out: SIDE_OUT[side],
    profile: profiles[SIDE_AXIS[side]],
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
        const d = distPointToWallSegment(op.at, s);
        if (d < best) {
          best = d;
          seg = s;
        }
      }
      // An opening on a CURVE has no facade line to be chained on — its position along
      // the wall is an angle, not a coordinate — so it contributes no tick. GB/T
      // dimensions a curved wall by radius, which `synthCurveDims` emits.
      if (!seg || seg.arc) continue;
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

/**
 * Does this chain's NUMBERS crowd, and should they therefore stagger?
 *
 * Chain TIERING (which slot a chain sits in) and number CROWDING are different problems:
 * three chains can be correctly tiered into three slots and still be unreadable, because
 * every number in one of them is wider than the bay it labels. Twelve 200 mm bays cannot
 * each hold a ~300 mm-wide "200" — the values overprint their neighbours while the lines
 * themselves are perfectly staged. The GB/T 50104 / ISO 129 answer is to stagger the
 * values: put every other one on the far side of the dimension line.
 *
 * **The rule.** Each value is centred on its own span, so two neighbours' centres are
 * `(wᵢ + wᵢ₊₁) / 2` apart and their facing half-widths sum to `(Wᵢ + Wᵢ₊₁) / 2`. The pair
 * is crowded when what is left is less than the clear gap {@link DIM_TEXT_GAP}:
 *
 * ```
 *   Wᵢ + Wᵢ₊₁ + 2·gap  >  wᵢ + wᵢ₊₁
 * ```
 *
 * `W` is the shared closed-form {@link textWidth} estimate over the exact string
 * `dim.render` will draw — the same helper `W_DIM_OVERLAP` measures with, so the lint rule
 * and this decision can never disagree about what collides. There are no text metrics in
 * `src/` and there is no font to measure.
 *
 * **Whole chain, or none.** One crowded PAIR staggers the WHOLE chain. Staggering only the
 * offending pairs would leave an irregular two-row pattern that reads worse than either
 * row alone, and can re-collide downstream (pushing `i` down leaves `i+1` up against
 * `i+2`). Alternating from one end is the drafting convention and is what makes the
 * same-side neighbours two bays apart instead of one.
 *
 * **Determinism.** Which numbers move is settled by INDEX PARITY, not by geometry: span 0
 * keeps the outward side, span 1 flips, span 2 keeps, and so on from the chain's `from`
 * end. No float comparison chooses a winner; the only float comparison is the crowding
 * predicate itself, which is strict (`>`) so an exact fit is NOT crowded and a chain that
 * already fits emits byte-identical geometry.
 *
 * A one-span chain (the `overall` chain, always) has no adjacent pair and can never crowd.
 */
function staggerChain(ticks: readonly number[], dimFont: number): boolean {
  if (ticks.length < 3) return false;
  const gap = DIM_TEXT_GAP * dimFont;
  // Width of the value each span will be labelled with, in tick order. `dims auto` never
  // writes a `text` override, so the label is the measured length through the same `fmtMm`
  // the render context hands `dim.render` as its `fmt`.
  const w = ticks.slice(1).map((t, i) => Math.abs(t - ticks[i]!));
  const width = w.map((len) => textWidth(fmtMm(len), dimFont));
  for (let i = 0; i + 1 < w.length; i++) {
    if (width[i]! + width[i + 1]! + 2 * gap > w[i]! + w[i + 1]!) return true;
  }
  return false;
}

/** Emit one chain: a dim per span between consecutive ticks, all at one offset. */
function emitChain(side: SideGeom, ticks: readonly number[], offset: number, dimFont: number, dims: RDim[]): void {
  if (ticks.length < 2) return;
  // Only a crowded chain staggers, so a plan whose numbers already fit carries no `stagger`
  // flag at all and renders byte-for-byte as it always did.
  const stagger = staggerChain(ticks, dimFont);
  for (let i = 0; i + 1 < ticks.length; i++) {
    const a = ticks[i]!;
    const b = ticks[i + 1]!;
    const [from, to] = side.sign > 0 ? [a, b] : [b, a];
    dims.push({
      ...mkDim(sidePt(side, from), sidePt(side, to), offset),
      // The measured endpoints stay on the chain baseline (so the dimension line, its
      // ticks and its text are untouched); only the witness lines reach back to the
      // wall, which on a stepped or angled facade is not under the baseline at all.
      witness: { from: witnessPt(side, from), to: witnessPt(side, to) },
      // Alternate spans put their number on the inner side of the line. Parity runs from
      // the chain's tick order, which `cleanTicks` has already sorted ascending — so the
      // pattern does not depend on which facade this is or which way `side.sign` points.
      ...(stagger && i % 2 === 1 ? { stagger: true } : {}),
    });
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
      emitChain(g, cleanTicks([g.lo, ...edges, g.hi], g.lo, g.hi), chainOffset(sizes, 0), sizes.dimFont, dims);
    }
    if (wantAxis) {
      // Declared axes on this direction win: the middle chain becomes the true GB/T
      // axis chain. The fallback is per-DIRECTION, so a plan that declares only `x`
      // axes still gets the room-boundary chain on its vertical facades.
      const declared = (ir.axes ?? []).filter((a) => a.axis === (g.axis === "h" ? "x" : "y")).map((a) => a.pos);
      const ticks =
        declared.length > 0
          ? declared
          : rooms.flatMap((r) =>
              // A polygon room contributes every vertex coordinate on this axis — the
              // room boundaries it actually has. `cleanTicks` dedupes and clips, so the
              // interior ones simply fall out; only those on the facade survive.
              r.poly
                ? r.poly.map((p) => (g.axis === "h" ? p.x : p.y))
                : g.axis === "h"
                  ? [r.at.x, r.at.x + r.size.w]
                  : [r.at.y, r.at.y + r.size.h],
            );
      emitChain(g, cleanTicks(ticks, g.lo, g.hi), chainOffset(sizes, 1), sizes.dimFont, dims);
    }
    if (wantOverall) emitChain(g, [g.lo, g.hi], chainOffset(sizes, 2), sizes.dimFont, dims);
  }
}

/**
 * Which side of a wall segment a thickness call-out's NUMBER should be written on: the
 * side that has floor under it.
 *
 * The number cannot fit between the two faces of a 100 mm partition, so `dim.render`
 * writes it past the far station instead — which makes the endpoint ORDER decide which
 * side of the wall it lands on. On an exterior wall one of those sides is the annotation
 * band where the `dims auto` chains live, and dropping a call-out into it would overprint
 * a chain's numbers; the other is the room the wall encloses, which is clear paper.
 *
 * So the side is derived from the SHAPE, not from a bounding box or a winding order (a
 * plan is free to wind its shell either way, and a partition's `n` is whatever its two
 * written points imply). Probe one wall thickness clear of each face at three fixed
 * stations along the segment and count the rooms found: more floor wins, a tie keeps the
 * historical order. Closed form — three samples, no search — and it reads the room's own
 * ring through {@link pointInRoomBox}, never the wall boolean union.
 *
 * Returns `true` when `+n` is the floor side — the side the number belongs on.
 */
function thicknessSideFlipped(a: Point, b: Point, n: Vec, t: number, rooms: readonly RoomBox[]): boolean {
  if (rooms.length === 0) return false;
  const reach = mul(n, t * 1.5); // half the wall, then one whole thickness clear of the face
  let plus = 0;
  let minus = 0;
  for (const f of [0.25, 0.5, 0.75]) {
    const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    if (rooms.some((r) => pointInRoomBox(add(p, reach), r))) plus++;
    if (rooms.some((r) => pointInRoomBox(sub(p, reach), r))) minus++;
  }
  return plus > minus;
}

/** An axis-aligned wall segment reduced to its drawn BAND: the rectangle the poché fills. */
function segmentBand(s: WallSegment): Bounds {
  const h = s.thickness / 2;
  const horiz = s.a.y === s.b.y;
  return {
    minX: Math.min(s.a.x, s.b.x) - (horiz ? 0 : h),
    maxX: Math.max(s.a.x, s.b.x) + (horiz ? 0 : h),
    minY: Math.min(s.a.y, s.b.y) - (horiz ? h : 0),
    maxY: Math.max(s.a.y, s.b.y) + (horiz ? h : 0),
  };
}

/**
 * WHERE along its wall a thickness call-out is taken: the middle of the segment's widest
 * run clear of every other wall.
 *
 * The segment midpoint is the obvious station and the wrong one — on a shell it is very
 * often exactly where a partition tees in, which is the case the backlog reported. The
 * number is written past the wall face, so a wall crossing there puts the digits straight
 * back into poché, this time somebody else's.
 *
 * Every wall band that comes within the number's reach of this segment's centreline blocks
 * the run it covers, widened by a cap height at each end so the digits clear it rather than
 * touch it. What is left is a set of free runs; the widest one's midpoint is the station.
 * Closed form — merge the intervals once, take the maximum — and it falls back to the
 * segment midpoint when a wall is crossed end to end (a call-out has to go somewhere).
 */
function thicknessStation(rep: { a: Point; b: Point; t: number }, ir: ResolvedPlan, reach: number, pad: number): Point {
  const horiz = rep.a.y === rep.b.y;
  const lo = horiz ? Math.min(rep.a.x, rep.b.x) : Math.min(rep.a.y, rep.b.y);
  const hi = horiz ? Math.max(rep.a.x, rep.b.x) : Math.max(rep.a.y, rep.b.y);
  const c = horiz ? rep.a.y : rep.a.x;
  const mid = { x: (rep.a.x + rep.b.x) / 2, y: (rep.a.y + rep.b.y) / 2 };

  const blocked: { lo: number; hi: number }[] = [];
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) continue;
      // Only a PERPENDICULAR wall can be escaped by moving along this one. A parallel
      // band (this segment's own, or a wall running beside it) covers the same run
      // wherever the station goes, so blocking on it would say nothing and could veto
      // every station on the wall.
      const sHoriz = s.a.y === s.b.y && s.a.x !== s.b.x;
      const sVert = s.a.x === s.b.x && s.a.y !== s.b.y;
      if (!(horiz ? sVert : sHoriz)) continue;
      const band = segmentBand(s);
      const crossLo = horiz ? band.minY : band.minX;
      const crossHi = horiz ? band.maxY : band.maxX;
      // Only a band the number could actually reach into counts.
      if (crossHi < c - reach || crossLo > c + reach) continue;
      const aLo = (horiz ? band.minX : band.minY) - pad;
      const aHi = (horiz ? band.maxX : band.maxY) + pad;
      if (aHi <= lo || aLo >= hi) continue;
      blocked.push({ lo: Math.max(lo, aLo), hi: Math.min(hi, aHi) });
    }
  }
  blocked.sort((p, q) => p.lo - q.lo || p.hi - q.hi);

  let bestLen = 0;
  let bestAt = 0;
  let cursor = lo;
  const consider = (from: number, to: number): void => {
    if (to - from > bestLen) {
      bestLen = to - from;
      bestAt = (from + to) / 2;
    }
  };
  for (const b of blocked) {
    consider(cursor, b.lo);
    cursor = Math.max(cursor, b.hi);
  }
  consider(cursor, hi);
  if (bestLen <= 0) return mid;
  return horiz ? { x: bestAt, y: c } : { x: c, y: bestAt };
}

/** One thickness call-out per distinct wall thickness (deduped so eight identical
 *  partitions show "100" once, not eight times). For each thickness, the longest
 *  axis-aligned segment carrying it is the representative — most room for a clean
 *  annotation, chosen deterministically (max length, then source order). The dim
 *  runs face-to-face across the wall with the measured thickness as its text; its zero
 *  offset keeps it on the wall, and because the number is far wider than the wall the
 *  dim element writes it past the far station (`outsideStations` in `elements/dim.ts`).
 *  That makes two derived positions, and both come from the shape rather than a box:
 *  {@link thicknessStation} picks WHERE along the wall (a run no other wall crosses) and
 *  {@link thicknessSideFlipped} picks WHICH SIDE (the one with floor under it, not the
 *  annotation band outside the building). Presentation only — never expands bounds
 *  meaningfully (faces sit ½-thickness off a centerline already inside the plan). */
function synthWallDims(ir: ResolvedPlan, sizes: RenderSizes, dims: RDim[]): void {
  const repByThickness = new Map<number, { a: Point; b: Point; n: Vec; t: number; len: number }>();
  for (const w of ir.walls) {
    for (const s of segmentsOfWall(w)) {
      if (s.arc) continue; // a curve's thickness call-out would sit on its chord, not on it
      const d = sub(s.b, s.a);
      if (d.x !== 0 && d.y !== 0) continue; // orthogonal segments only
      const len = Math.hypot(d.x, d.y);
      if (len <= 0) continue;
      const prev = repByThickness.get(s.thickness);
      if (prev && prev.len >= len) continue;
      const dir = unit(d);
      repByThickness.set(s.thickness, {
        a: s.a,
        b: s.b,
        n: normal(dir),
        t: s.thickness,
        len,
      });
    }
  }
  const rooms = ir.elements.filter((el): el is RRoom => el.kind === "room").map(roomBox);
  for (const t of [...repByThickness.keys()].sort((a, c) => a - c)) {
    const rep = repByThickness.get(t)!;
    // How far off the centreline the number reaches, and how tall it is — the same two
    // numbers `outsideStations` places it with, so the clear run asked for is the clear
    // run actually used.
    const text = fmtMm(rep.t);
    const reach = rep.t / 2 + DIM_TEXT_GAP * sizes.dimFont + textWidth(text, sizes.dimFont);
    const at = thicknessStation(rep, ir, reach, sizes.dimFont);
    const half = mul(rep.n, rep.t / 2);
    // The endpoints keep their historical order (which is what fixes the number's reading
    // direction); the SIDE the number is written on is `calloutFrom`, so a flip moves the
    // text and nothing else.
    const onPlusSide = thicknessSideFlipped(rep.a, rep.b, rep.n, rep.t, rooms);
    dims.push({
      ...mkDim(add(at, half), add(at, mul(half, -1)), 0, text),
      ...(onPlusSide ? { calloutFrom: true } : {}),
    });
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

  // Two RenderSizes constructors, one struct (so nothing below branches):
  //
  //  • No `paper` — the historical path. Every size is a fraction of the drawing's own
  //    reference dimension. Self-similar, and BYTE-IDENTICAL to every release before
  //    the sheet layer: this arithmetic must never change.
  //  • With `paper` — `sizesFromPaper` (src/sheet.ts): every size a fixed number of
  //    millimetres ON THE SHEET × the scale denominator, so a 100 m building gets the
  //    same 3.5 mm room label a 7 m one does. `refDim` becomes 100 mm of sheet × the
  //    denominator, which makes the `refDim * <fraction>` chrome/tick formulas
  //    downstream read as plain drafting millimetres with no second code path.
  const refDim = ir.sheet ? SHEET_MM.ref * ir.sheet.denom : Math.max(drawW, drawH, 1);
  const sizes: RenderSizes = ir.sheet
    ? sizesFromPaper(ir.sheet, lw)
    : {
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
  // Curved walls are lowered per-segment and subtract nothing, so they are excluded from
  // the question — a door on a straight orthogonal host in a plan that ALSO has a curved
  // facade keeps its real hole (and its bytes) instead of regressing to an opaque cover.
  const openingsVoided = allOrthogonal(ir.walls.filter((w) => !wallHasArc(w)));
  const baseCtx: RenderCtx = { theme, sizes, bounds: b, fmt: fmtMm, openingsVoided };
  const ctxFor = (kind: string): RenderCtx => {
    const st = styledByKind.get(kind);
    return st ? { ...baseCtx, theme: st } : baseCtx;
  };
  const nodes: SceneNode[] = [];
  // Which nodes each ROOM contributed, so the label post-pass at the end can find its
  // text without matching coordinates back to elements (two rooms can share an anchor).
  const labelGroups: RoomLabelGroup[] = [];
  for (const el of ir.elements) {
    if (el.kind === "wall") continue;
    const def = registry.byKind.get(el.kind);
    if (!def) continue;
    const groupStart = nodes.length;
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
    if (el.kind === "room") labelGroups.push({ room: el as RRoom, from: groupStart, to: nodes.length });
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

  // Obstacle-aware room labels (`src/label-placement.ts`). It has to run HERE — after the
  // walls are lowered and after `dims auto` has emitted its numbers — because a dimension
  // value is not an element and no element could ever see one. Purely a translation of
  // already-emitted `labels` text: it adds no node, removes none, and only moves a label
  // whose box is genuinely buried, so a plan whose labels are already clear keeps its
  // exact previous bytes. It runs before the sheet tables and the opt-in overlays, so
  // neither can influence where a label lands.
  relocateRoomLabels(nodes, labelGroups, ir, sizes);

  // Opt-in sheet tables (`schedule rooms` / `legend`) — derived closed-form from the plan
  // (see `sheet-tables.ts`). Computed before chrome layout because the table heights are
  // what grow the bottom margin; a plan that opts into neither passes null and every
  // margin below reduces to the previous arithmetic, so its bytes are unchanged.
  const scheduleData =
    ir.schedule === "rooms"
      ? roomSchedule(
          ir.elements.filter((e): e is RRoom => e.kind === "room"),
          ir.zones,
        )
      : null;
  const legendData = ir.legend
    ? legendEntries(
        hatches,
        ir.elements.filter((e): e is RFurniture => e.kind === "furniture"),
      )
    : null;

  // Page chrome (scale bar + title block) sits below the dimension band; the page
  // margins grow per-side so neither the chrome nor any dimension clips (shared with
  // the SVG/PDF backends via the one layoutChrome source).
  let chrome = layoutChrome({
    bounds: b,
    refDim,
    baseMargin: sizes.margin,
    nodes,
    title: ir.title,
    scale: ir.scale,
    schedule: scheduleData,
    legend: legendData,
    // Multi-storey: stamp the page with its storey, so a drawing SET is readable (a plan
    // with no `level` block passes nothing and its chrome is byte-identical).
    ...(ir.level !== undefined
      ? { level: { level: ir.level, ...(ir.levelName !== undefined ? { name: ir.levelName } : {}) } }
      : {}),
  });
  const m = chrome.margin;

  // The page. Without a sheet it is the content box (drawing + grown margins) — the
  // historical page, byte-for-byte. With a sheet it is the PAPER (paper mm × the scale
  // denominator) and the content box is centred on it; if the laid-out content is
  // bigger than the sheet (an authored scale we warned about with `W_SCALE_OVERFLOW`)
  // the page grows to contain it, so a drawing is never clipped to make a sheet fit.
  const content = { x: b.minX - m.left, y: b.minY - m.top, w: drawW + m.left + m.right, h: drawH + m.top + m.bottom };
  let sheet: SceneSheet | undefined;
  if (ir.sheet) {
    const pageW = Math.max(ir.sheet.widthMm * ir.sheet.denom, content.w);
    const pageH = Math.max(ir.sheet.heightMm * ir.sheet.denom, content.h);
    const page = {
      x: content.x + (content.w - pageW) / 2,
      y: content.y + (content.h - pageH) / 2,
      w: pageW,
      h: pageH,
    };
    const grown = pageW > ir.sheet.widthMm * ir.sheet.denom || pageH > ir.sheet.heightMm * ir.sheet.denom;
    sheet = { ...ir.sheet, page, grown };
    // On a sheet the bottom chrome belongs in the sheet's corners, not beside the plan —
    // but only when the corner band is provably clear of the drawing (see the helper).
    chrome = anchorChromeToSheet(chrome, page, sizes.margin, content.y + content.h, refDim);
  }

  // The sheet tables are ordinary `annotations`-pass primitives, so every backend that
  // walks RENDER_PASSES draws them from this one lowering (unlike the title block, whose
  // geometry each backend still redraws). Lowered AFTER any sheet re-anchoring above, so
  // they are drawn wherever the final chrome layout put them; like the overlays below,
  // they are outside the dimension reach and shift nothing.
  if (chrome.tables) nodes.push(...sheetTableNodes(chrome.tables, theme, sizes));

  // Opt-in diagnostic overlays (ADR 0008): appended AFTER all nodes and after chrome
  // layout, so the default Scene (no overlays) is byte-identical and the overlay never
  // shifts the page or chrome. Off by default — never on the shipped-SVG path.
  if (opts.overlays?.includes("circulation")) {
    nodes.push(...circulationOverlayNodes(ir, theme, sizes));
  }

  return {
    width: sheet ? sheet.page.w : content.w,
    height: sheet ? sheet.page.h : content.h,
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
    ...(sheet ? { sheet } : {}),
    // Opt-in accessibility metadata (ADR 0007 pattern): carry the accessible
    // <title>/<desc> text onto the Scene only when asked, so the SVG backend can emit
    // them. An explicit `accTitle`/`accDescr` (plan-level keywords) overrides the
    // derived pair — the plan name for the title, the deterministic describe() caption
    // for the desc. Off by default → the Scene is byte-identical. Never read by geometry.
    ...(opts.accessible ? { name: ir.accTitle ?? ir.name, caption: ir.accDescr ?? captionForPlan(ir) } : {}),
  };
}
