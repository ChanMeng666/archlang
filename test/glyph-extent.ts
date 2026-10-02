/**
 * The exact extent of a `path` primitive, for the glyph suites' containment collectors.
 *
 * A fixture glyph draws curves as a `path` (`GlyphCtx.path`): closed loops of straight and
 * minor-arc edges. Its ink extent is its vertices plus, for each arc edge, every point where the
 * arc reaches an axis extreme (0°, 90°, 180°, 270° about its centre) inside its own sweep — so a
 * bulge between two vertices is caught exactly, with no sampling to miss it.
 *
 * The arc CENTRE is deliberately NOT in the set. On a `path` a centre is a construction point, not
 * ink: a four-centre oval's side arcs are centred outside the oval, and the consumers that box a
 * path read the curve, not the centre (`src/backends/ascii.ts` `pointsOf`, `label-placement.ts`
 * `primBBox`). A bare `arc` primitive is different — its centre is a door's hinge — and the
 * suites keep their own rule for it.
 *
 * Also exported: {@link arcEdgeSweep}, the signed sweep of one edge, so a suite can hold every
 * path arc to the ≤ 120° contract.
 */

import type { Point } from "../src/ast.js";
import type { PathEdge, ScenePrim } from "../src/scene.js";

type ArcEdge = Extract<PathEdge, { t: "arc" }>;

/** The signed sweep, in radians, of the arc edge from `from` (SVG sense: sweep 1 = positive). */
export function arcEdgeSweep(from: Point, e: ArcEdge): number {
  const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
  const a1 = Math.atan2(e.to.y - e.center.y, e.to.x - e.center.x);
  let d = a1 - a0;
  if (e.sweep === 1) while (d < 0) d += 2 * Math.PI;
  else while (d > 0) d -= 2 * Math.PI;
  return d;
}

/** Every arc edge of a path, with the point it leaves from. */
export function arcEdgesOf(prim: Extract<ScenePrim, { t: "path" }>): { from: Point; e: ArcEdge }[] {
  const out: { from: Point; e: ArcEdge }[] = [];
  for (const lp of prim.loops) {
    let from = lp.start;
    for (const e of lp.edges) {
      if (e.t === "arc") out.push({ from, e });
      from = e.to;
    }
  }
  return out;
}

/** The points that bound a `path`'s ink: vertices and each arc's in-sweep axis extremes. */
export function pathExtentPoints(prim: Extract<ScenePrim, { t: "path" }>): Point[] {
  const pts: Point[] = [];
  for (const lp of prim.loops) {
    pts.push(lp.start);
    for (const e of lp.edges) pts.push(e.to);
  }
  for (const { from, e } of arcEdgesOf(prim)) {
    const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
    const d = arcEdgeSweep(from, e);
    const lo = Math.min(a0, a0 + d);
    const hi = Math.max(a0, a0 + d);
    for (let k = -4; k <= 4; k++) {
      const a = (k * Math.PI) / 2;
      if (a > lo && a < hi) pts.push({ x: e.center.x + e.r * Math.cos(a), y: e.center.y + e.r * Math.sin(a) });
    }
  }
  return pts;
}
