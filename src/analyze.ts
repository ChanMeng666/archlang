/**
 * Shared semantic-analysis layer for the agent-facing tools.
 *
 * {@link describe} (semantic summary) and {@link lint} (architectural rules) both
 * need the same two things: a resolved plan, and a little rectilinear geometry over
 * room rectangles (areas, edge-touch adjacency, "is this opening on that room's
 * wall?"). That logic lives here once — pure, deterministic, zero-dep — so neither
 * tool re-implements geometry and both stay byte-stable.
 */

import { parse } from "./parser.js";
import { link } from "./import.js";
import { resolve } from "./ir.js";
import type { ResolvedPlan, RDoor } from "./ir.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import { segmentsOfWall, type WallLike, type WallSegment } from "./geometry.js";

/** Options shared by the analysis tools: a subset of {@link CompileOptions}. */
export type AnalyzeOptions = Pick<CompileOptions, "plugins" | "world">;

/** A millimetre bounding box (origin top-left, +x right, +y down). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Default mm tolerance for edge-touch / point-on-edge tests (≈ one partition wall). */
export const DEFAULT_TOL = 200;

/**
 * Run parse → link → resolve (the same pipeline as `compile`, semantics live in
 * {@link resolve}). Returns the resolved IR, or `null` when fatal errors prevented
 * resolution, alongside every diagnostic. Never throws on user-source problems.
 */
export function resolvePlan(
  source: string,
  opts: AnalyzeOptions = {},
): { ir: ResolvedPlan | null; diagnostics: Diagnostic[] } {
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolve(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [
    ...parseDiags,
    ...(linked?.diagnostics ?? []),
    ...(resolved?.diagnostics ?? []),
  ];

  const hasError = diagnostics.some((d) => d.severity === "error");
  return { ir: !resolved || hasError ? null : resolved.ir, diagnostics };
}

/** Axis-aligned rectangle of a sized element. */
export function rectOf(e: { at: Point; size: { w: number; h: number } }): BBox {
  return { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h };
}

/** Length of the overlap of two 1-D intervals (0 if they do not overlap). */
export function overlap1d(aLo: number, aHi: number, bLo: number, bHi: number): number {
  return Math.max(0, Math.min(aHi, bHi) - Math.max(aLo, bLo));
}

/** Do two room rectangles share an edge (touch) within tolerance? A shared corner
 *  alone does not count — the perpendicular overlap must be positive. */
export function roomsAdjacent(a: BBox, b: BBox, tol: number): boolean {
  const vTouch = Math.abs(a.x + a.w - b.x) <= tol || Math.abs(b.x + b.w - a.x) <= tol;
  if (vTouch && overlap1d(a.y, a.y + a.h, b.y, b.y + b.h) > 0) return true;
  const hTouch = Math.abs(a.y + a.h - b.y) <= tol || Math.abs(b.y + b.h - a.y) <= tol;
  if (hTouch && overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) > 0) return true;
  return false;
}

/** Does point `p` lie on the perimeter of rectangle `r` (within tolerance)? */
export function pointOnRoomEdge(p: Point, r: BBox, tol: number): boolean {
  const onLeftRight =
    (Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.w)) <= tol) &&
    p.y >= r.y - tol &&
    p.y <= r.y + r.h + tol;
  const onTopBottom =
    (Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.h)) <= tol) &&
    p.x >= r.x - tol &&
    p.x <= r.x + r.w + tol;
  return onLeftRight || onTopBottom;
}

/**
 * Ids of the rooms whose perimeter point `p` sits on (within tolerance). Iterates
 * `roomRects` in insertion order so callers get a stable, element-ordered list:
 * ≤2 ids for a door on a shared partition, 1 for a window on an exterior wall.
 */
export function roomsAtPoint(p: Point, roomRects: Map<string, BBox>, tol: number): string[] {
  const out: string[] = [];
  for (const [id, rect] of roomRects) {
    if (pointOnRoomEdge(p, rect, tol)) out.push(id);
  }
  return out;
}

/**
 * The one or two spaces a door connects: room ids, and/or the literal `"exterior"`
 * when the door sits on an outer wall with open space on one side. This is the
 * adjacency-via-doors edge that both {@link import("./describe.js").describe} (for its
 * `between` field) and the connectivity lint rules build their room graph from.
 */
export function doorConnections(d: RDoor, roomRects: Map<string, BBox>, tol: number): string[] {
  const touching = roomsAtPoint(d.at, roomRects, tol);
  const onExterior = d.host?.category === "exterior";
  return touching.length >= 2 ? touching.slice(0, 2) : onExterior ? ["exterior", ...touching] : touching;
}

/** Total length covered by a set of 1-D intervals after merging overlaps. */
function mergedLength(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  return total + (ce - cs);
}

/**
 * The largest contiguous run (mm) of a room's four edges that is **not** backed by
 * a wall centerline — i.e. how open the room's perimeter is. For each axis-aligned
 * edge, the orthogonal wall segments collinear with it (within `tol`) are clipped
 * to the edge and merged; the worst edge's `edgeLength − coveredLength` is returned.
 *
 * Openings (doors/windows) are not split out of wall centerlines — they live in
 * `RWall.openings` and are only subtracted at render time — so a wall carrying a
 * door still counts as fully enclosing. Only a genuine missing wall registers as a
 * gap (e.g. a partition that stops short, leaving a wet room open to a living space).
 * Angled walls match no edge and contribute nothing; the rule is for orthogonal rooms.
 */
export function largestPerimeterGap(rect: BBox, walls: WallLike[], tol: number): number {
  const segs: WallSegment[] = walls.flatMap((w) => segmentsOfWall(w));
  const edges = [
    { axis: "h" as const, fixed: rect.y, lo: rect.x, hi: rect.x + rect.w },
    { axis: "h" as const, fixed: rect.y + rect.h, lo: rect.x, hi: rect.x + rect.w },
    { axis: "v" as const, fixed: rect.x, lo: rect.y, hi: rect.y + rect.h },
    { axis: "v" as const, fixed: rect.x + rect.w, lo: rect.y, hi: rect.y + rect.h },
  ];
  let worst = 0;
  for (const e of edges) {
    const covered: Array<[number, number]> = [];
    for (const s of segs) {
      const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
      const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
      if (e.axis === "h") {
        if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.x, s.b.x);
        const shi = Math.max(s.a.x, s.b.x);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      } else {
        if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.y, s.b.y);
        const shi = Math.max(s.a.y, s.b.y);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      }
    }
    const gap = e.hi - e.lo - mergedLength(covered);
    if (gap > worst) worst = gap;
  }
  return worst;
}
