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
import type { ResolvedPlan } from "./ir.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";

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
