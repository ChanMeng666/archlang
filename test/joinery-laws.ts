/**
 * Intrinsic laws of a wall boundary, shared by the two suites that check them.
 *
 * `test/joinery-oracle.test.ts` asserts these over GENERATED wall sets, straight from
 * `joinWalls`; `test/joinery-pipeline.test.ts` asserts the same thing over the twenty-nine
 * SHIPPED examples, reading the boundary back off the Scene the compiler actually emits.
 * The two reach the law from opposite ends — one proves it for inputs nobody wrote, the
 * other for the inputs that ship — and neither is worth having twice, hence this module.
 */

import type { Point } from "../src/ast.js";
import type { Arc } from "../src/geometry/arc.js";
import { distPointToArc } from "../src/geometry/arc.js";
import { distPointToSegment } from "../src/geometry.js";
import type { Edge, EdgeLoop } from "../src/geometry/band.js";
import { edgeEnd, edgeStart, pointKey } from "../src/geometry/band.js";
import { circleCircle, lineCircleParams, lineLineParams } from "../src/geometry/intersect.js";
import type { ScenePrim } from "../src/scene.js";

/**
 * Do two edges cross at a point INTERIOR to both? Shared endpoints do not count.
 *
 * This is the law that a face line drawn through a neighbouring wall's solid breaks, and
 * the reason the whole joinery layer exists: a boundary is a closed 1-manifold, so two of
 * its edges may meet only at a vertex they share.
 */
export function crossesInterior(a: Edge, b: Edge): Point | null {
  const ends = new Set([pointKey(edgeStart(a)), pointKey(edgeEnd(a)), pointKey(edgeStart(b)), pointKey(edgeEnd(b))]);
  const interior = (e: Edge, p: Point): boolean => {
    if (ends.has(pointKey(p))) return false;
    const d = e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));
    if (d > 1e-6) return false;
    // Strictly interior: not within a micron of either end.
    const s = edgeStart(e);
    const t = edgeEnd(e);
    return Math.hypot(p.x - s.x, p.y - s.y) > 1e-3 && Math.hypot(p.x - t.x, p.y - t.y) > 1e-3;
  };
  const candidates: Point[] = [];
  if (a.t === "line" && b.t === "line") {
    const d = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
    const e = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
    const r = lineLineParams(a.a, d, b.a, e);
    if (r) candidates.push({ x: a.a.x + r.s * d.x, y: a.a.y + r.s * d.y });
  } else if (a.t === "line" && b.t === "arc") {
    const d = { x: a.b.x - a.a.x, y: a.b.y - a.a.y };
    for (const s of lineCircleParams(a.a, d, b.arc.center, b.arc.r)) {
      candidates.push({ x: a.a.x + s * d.x, y: a.a.y + s * d.y });
    }
  } else if (a.t === "arc" && b.t === "line") {
    const d = { x: b.b.x - b.a.x, y: b.b.y - b.a.y };
    for (const s of lineCircleParams(b.a, d, a.arc.center, a.arc.r)) {
      candidates.push({ x: b.a.x + s * d.x, y: b.a.y + s * d.y });
    }
  } else if (a.t === "arc" && b.t === "arc") {
    candidates.push(...circleCircle(a.arc.center, a.arc.r, b.arc.center, b.arc.r));
  }
  for (const p of candidates) if (interior(a, p) && interior(b, p)) return p;
  return null;
}

/**
 * A wall-outline PRIMITIVE, read back as the {@link EdgeLoop}s it was emitted from.
 *
 * `emitLoops` narrows an `EdgeLoop[]` to whichever primitive can carry it — a `region`
 * when every edge is straight, a `path` when one curves — and a law stated over edge loops
 * has to be checked on both. A `PathEdge` arc carries only `to`/`center`/`r`/`sweep`, so
 * the {@link Arc} is rebuilt here: `a` is the previous vertex, and the signed sweep comes
 * from the flag (SVG `sweep: 1` = clockwise as drawn = increasing `atan2` angle, y down).
 */
export function primToLoops(prim: ScenePrim): EdgeLoop[] {
  if (prim.t === "region") {
    return prim.loops.map((pts) =>
      pts.map((p, i) => ({ t: "line", a: p, b: pts[(i + 1) % pts.length]! }) as Edge).filter((e) => !sameXY(e)),
    );
  }
  if (prim.t !== "path") return [];
  const TAU = 2 * Math.PI;
  return prim.loops.map((loop) => {
    const out: Edge[] = [];
    let from = loop.start;
    for (const e of loop.edges) {
      if (e.t === "line") {
        out.push({ t: "line", a: from, b: e.to });
      } else {
        const a0 = Math.atan2(from.y - e.center.y, from.x - e.center.x);
        const a1 = Math.atan2(e.to.y - e.center.y, e.to.x - e.center.x);
        let sweep = a1 - a0;
        if (e.sweep === 1) {
          while (sweep <= 0) sweep += TAU;
          while (sweep > TAU) sweep -= TAU;
        } else {
          while (sweep >= 0) sweep -= TAU;
          while (sweep < -TAU) sweep += TAU;
        }
        const arc: Arc = { center: e.center, r: e.r, a: from, b: e.to, sweep, start: a0 };
        out.push({ t: "arc", arc });
      }
      from = e.to;
    }
    return out.filter((x) => !sameXY(x));
  });
}

/** A zero-length line — a `region` may legitimately repeat a point; it is not an edge. */
const sameXY = (e: Edge): boolean =>
  e.t === "line" && Math.abs(e.a.x - e.b.x) < 1e-12 && Math.abs(e.a.y - e.b.y) < 1e-12;
