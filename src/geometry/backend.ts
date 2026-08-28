/**
 * Optional polygon-geometry backend seam.
 *
 * ---------------------------------------------------------------------------
 * **DEPRECATED: not consulted by the renderer since v1.30.** Retained for API
 * compatibility only.
 *
 * `src/wall-lowering.ts` joins every wall — orthogonal, angled and curved alike —
 * in one closed-form, zero-dependency pass (`geometry/joinery.ts`). Nothing in the
 * rendering path calls a `GeometryBackend` any more, so registering one changes no
 * byte of any output; `test/union.test.ts` and `test/miter-limit.test.ts` assert
 * exactly that, in both directions. `clipper2-wasm` has moved from
 * `optionalDependencies` to `devDependencies`, where it survives as the ANGLED
 * ORACLE in `test/joinery-oracle.test.ts` — nothing zero-dependency can answer an
 * oblique or curved boolean, so the property suite still needs it.
 *
 * These exports are kept because `src/index.ts` is append-only and a plugin may hold
 * them. **Removing them is a MAJOR**, deferred by name in ADR 0018. See that ADR for
 * why the seam existed and what replaced it.
 * ---------------------------------------------------------------------------
 *
 * The zero-dependency core handles the common case — axis-aligned wall
 * rectangles unioned (and openings subtracted) by `geometry/union.ts`'s
 * rectilinear boolean — entirely without this seam. For *angled* (non
 * axis-aligned) walls a true polygon boolean is needed to merge segment
 * rectangles into one seamless outline; that is what a `GeometryBackend`
 * provides.
 *
 * A backend was **opt-in**: nothing loaded unless a caller registered one via
 * {@link setGeometryBackend}, and the CLI did that by lazily loading the
 * `clipper2-wasm` adapter. It no longer does — `src/cli/serialize.ts` stopped calling
 * `tryLoadGeometryBackend`, and that helper is gone.
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
