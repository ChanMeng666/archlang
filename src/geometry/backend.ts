/**
 * Optional polygon-geometry backend seam.
 *
 * The zero-dependency core handles the common case — axis-aligned wall
 * rectangles unioned (and openings subtracted) by `geometry/union.ts`'s
 * rectilinear boolean — entirely without this seam. For *angled* (non
 * axis-aligned) walls a true polygon boolean is needed to merge segment
 * rectangles into one seamless outline; that is what a `GeometryBackend`
 * provides.
 *
 * A backend is **opt-in**: nothing is loaded unless a caller registers one via
 * {@link setGeometryBackend} (the CLI does this by lazily loading the optional
 * `clipper2-wasm` adapter — see `geometry/clipper.ts`). When no backend is
 * registered, angled walls fall back to per-segment rendering exactly as before.
 *
 * The registry is a synchronous module-level slot so the pure, synchronous
 * `toScene()`/`compile()` pipeline can consult it without becoming async: the
 * (async) WASM instantiation happens once, ahead of time, in the caller. Feeding
 * the engine deterministic coordinates keeps its output stable.
 *
 * Prior art: Clipper2 (`Union`/`Difference`/`InflatePaths`, integer-coordinate
 * robustness) and D2's pluggable `LayoutGraph` seam shape.
 */

import type { Point } from "../ast.js";

/** How a polygon path is offset at its corners (Clipper2 `JoinType`). */
export type JoinKind = "miter" | "bevel" | "round";

/**
 * A polygon boolean/offset engine. All paths are closed loops of absolute
 * millimetre points (the first point is **not** repeated at the end); results
 * follow the same convention. Implementations must be deterministic for a given
 * input so the compiler stays byte-for-byte reproducible.
 */
export interface GeometryBackend {
  /** Union of all input polygons → boundary loops (outer CCW + holes). */
  union(polys: Point[][]): Point[][];
  /** `(⋃ subj) \ (⋃ clip)` → boundary loops. */
  difference(subj: Point[][], clip: Point[][]): Point[][];
  /** Offset a single path by `delta` mm (positive = outward) → boundary loops. */
  offset(path: Point[], delta: number, join: JoinKind): Point[][];
}

let active: GeometryBackend | null = null;

/** Register (or clear, with `null`) the active polygon-geometry backend. */
export function setGeometryBackend(backend: GeometryBackend | null): void {
  active = backend;
}

/** The active backend, or `null` when none is registered (the default). */
export function getGeometryBackend(): GeometryBackend | null {
  return active;
}
