/**
 * Reading a `path` primitive back out of a Scene, for tests.
 *
 * Since v1.30 a plan whose walls carry any curve draws its whole outline as ONE `path`
 * node instead of a scatter of `arc` and `line` primitives, so the tests that used to
 * filter `n.prim.t === "arc"` on the `wallFace` pass have to walk the path's edges
 * instead. A {@link PathEdge} carries only where it goes — `from` is the previous edge's
 * `to`, or the loop's `start` — so this rejoins the two and hands back arcs a test can
 * assert about.
 *
 * `sweep` is the SVG flag: `1` = clockwise as drawn, in a y-DOWN space, which is the
 * direction of INCREASING `atan2` angle. {@link arcSweepAngle} and {@link arcMidpoint}
 * both follow from that one fact, and they are what makes a sweep-flag assertion mean
 * something a reader can check: a flag flipped the wrong way puts the arc's midpoint on
 * the other side of its own chord.
 */

import type { Point } from "../src/ast.js";
import type { SceneNode } from "../src/scene.js";

/** One arc edge of a `path`, with the start point the primitive leaves implicit. */
export interface PathArc {
  from: Point;
  to: Point;
  center: Point;
  r: number;
  sweep: 0 | 1;
}

/** One line edge of a `path`, likewise rejoined to its start. */
export interface PathLine {
  from: Point;
  to: Point;
}

/** Every arc edge of every `path` node in `nodes`, in emission order. */
export function pathArcs(nodes: readonly SceneNode[]): PathArc[] {
  const out: PathArc[] = [];
  for (const n of nodes) {
    if (n.prim.t !== "path") continue;
    for (const loop of n.prim.loops) {
      let from = loop.start;
      for (const e of loop.edges) {
        if (e.t === "arc") out.push({ from, to: e.to, center: e.center, r: e.r, sweep: e.sweep });
        from = e.to;
      }
    }
  }
  return out;
}

/** Every line edge of every `path` node in `nodes`, in emission order. */
export function pathLines(nodes: readonly SceneNode[]): PathLine[] {
  const out: PathLine[] = [];
  for (const n of nodes) {
    if (n.prim.t !== "path") continue;
    for (const loop of n.prim.loops) {
      let from = loop.start;
      for (const e of loop.edges) {
        if (e.t === "line") out.push({ from, to: e.to });
        from = e.to;
      }
    }
  }
  return out;
}

/** Every vertex a `path` passes through: each loop's start plus every edge's `to`. */
export function pathVertices(nodes: readonly SceneNode[]): Point[] {
  const out: Point[] = [];
  for (const n of nodes) {
    if (n.prim.t !== "path") continue;
    for (const loop of n.prim.loops) {
      out.push(loop.start);
      for (const e of loop.edges) out.push(e.to);
    }
  }
  return out;
}

/**
 * Every STRAIGHT edge of a wall outline, whichever primitive carries it.
 *
 * An all-straight wall set lowers to a `region` (loops of points, the closing edge
 * implied); a set with any curve lowers to a `path`. A test that asks "is there a jamb
 * here?" wants the same answer either way, so this normalises both to segments.
 */
export function outlineSegments(nodes: readonly SceneNode[]): PathLine[] {
  const out: PathLine[] = [];
  for (const n of nodes) {
    if (n.prim.t === "region") {
      for (const loop of n.prim.loops) {
        for (let i = 0; i < loop.length; i++) out.push({ from: loop[i]!, to: loop[(i + 1) % loop.length]! });
      }
    } else if (n.prim.t === "path") {
      for (const loop of n.prim.loops) {
        let from = loop.start;
        for (const e of loop.edges) {
          if (e.t === "line") out.push({ from, to: e.to });
          from = e.to;
        }
      }
    }
  }
  return out;
}

/** The signed angle an arc turns through, in radians: `+` clockwise-as-drawn (`sweep 1`). */
export function arcSweepAngle(a: PathArc): number {
  const a0 = Math.atan2(a.from.y - a.center.y, a.from.x - a.center.x);
  const a1 = Math.atan2(a.to.y - a.center.y, a.to.x - a.center.x);
  const TAU = 2 * Math.PI;
  let d = a1 - a0;
  if (a.sweep === 1) {
    while (d <= 0) d += TAU;
    while (d > TAU) d -= TAU;
  } else {
    while (d >= 0) d -= TAU;
    while (d < -TAU) d += TAU;
  }
  return d;
}

/** The point halfway ALONG an arc — the side of its chord the sweep flag actually draws. */
export function arcMidpoint(a: PathArc): Point {
  const a0 = Math.atan2(a.from.y - a.center.y, a.from.x - a.center.x);
  const mid = a0 + arcSweepAngle(a) / 2;
  return { x: a.center.x + a.r * Math.cos(mid), y: a.center.y + a.r * Math.sin(mid) };
}
