/**
 * Arc discretisation to a chord tolerance (archlang-3d plan §4.1, `--curve-tol`). The core keeps
 * every arc exact (`Edge` `{ t: "arc", arc }`) and tessellates at a fixed 7.5° step for the drawing;
 * a raised wall is seen up close, so the 3D package tessellates the same exact arcs to a sagitta of
 * at most `tolMm` (default 2 mm): each arc gets n = ceil(|sweep| / Δθ) chords, Δθ = 2·acos(1 − ε/r),
 * n clamped to [4, 720]. An arc's ends are its exact authored ends, so two loops that share an arc
 * share every vertex. Pure and deterministic.
 */
import type { Arc, EdgeLoop } from "@chanmeng666/archlang";
import type { Point, Ring } from "./walls/ownership.js";

export const DEFAULT_CURVE_TOL_MM = 2;
const MIN_CHORDS = 4;
const MAX_CHORDS = 720;

/** How many chords an arc of radius `r` and signed sweep `sweep` (rad) takes at tolerance `tol`. */
export function chordCount(r: number, sweep: number, tol: number): number {
  const step = tol >= r ? Math.PI / 2 : 2 * Math.acos(1 - tol / r);
  return Math.min(MAX_CHORDS, Math.max(MIN_CHORDS, Math.ceil(Math.abs(sweep) / step)));
}

/** The arc's points from its start up to, not including, its end. */
function arcPoints(arc: Arc, tol: number): Point[] {
  const n = chordCount(arc.r, arc.sweep, tol);
  const out: Point[] = [arc.a];
  for (let i = 1; i < n; i++) {
    const t = arc.start + (arc.sweep * i) / n;
    out.push({ x: arc.center.x + arc.r * Math.cos(t), y: arc.center.y + arc.r * Math.sin(t) });
  }
  return out;
}

/** Closed loops → rings, lines as they are, arcs to the chord tolerance. */
export function tessellateLoops(loops: readonly EdgeLoop[], tol: number = DEFAULT_CURVE_TOL_MM): Ring[] {
  return loops.map((loop) => loop.flatMap((e) => (e.t === "line" ? [e.a] : arcPoints(e.arc, tol))));
}

/** A circle (a round room) as a ring at the chord tolerance, from angle 0 clockwise on the sheet. */
export function circleRing(c: Point, r: number, tol: number = DEFAULT_CURVE_TOL_MM): Ring {
  const n = chordCount(r, 2 * Math.PI, tol);
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) };
  });
}
