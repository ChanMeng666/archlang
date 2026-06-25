/**
 * Boolean of axis-aligned rectangles (union, and difference of "holes") →
 * boundary loops.
 *
 * Zero-dependency, synchronous, deterministic. Used to merge wall segment
 * rectangles into clean outlines (no internal seams at corners/T-junctions) and,
 * since v0.9, to subtract door/window opening rectangles so openings truly void
 * the wall solid. Works via coordinate compression: the union of all rectangle
 * edges forms a grid; a cell is "in" when its centre is inside a solid rect and
 * not inside any hole rect; the boundary between in/out cells is then walked into
 * closed loops. Angled (non-axis-aligned) rectangles are not handled here — the
 * renderer falls back to per-segment outlines for those.
 */

import type { Point } from "../ast.js";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function uniqSorted(values: number[]): number[] {
  const out = [...new Set(values)].sort((a, b) => a - b);
  return out;
}

const insideAny = (rects: Rect[], cx: number, cy: number): boolean =>
  rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);

/**
 * Outline loops of the union of axis-aligned rectangles. Each loop is a closed
 * rectilinear polygon (the closing point is implied, not repeated). Outer
 * boundaries and holes are both returned; render with `fill-rule: nonzero`.
 */
export function rectUnionOutline(rects: Rect[]): Point[][] {
  return rectBooleanOutline(rects, []);
}

/**
 * Outline loops of `(⋃ solid) \ (⋃ holes)` — the solid rectangles unioned, with
 * the hole rectangles subtracted. With no holes this is exactly
 * {@link rectUnionOutline} (byte-identical), so walls without openings are
 * unaffected.
 */
export function rectBooleanOutline(solid: Rect[], holes: Rect[] = []): Point[][] {
  if (solid.length === 0) return [];
  const all = holes.length ? [...solid, ...holes] : solid;
  const xs = uniqSorted(all.flatMap((r) => [r.x0, r.x1]));
  const ys = uniqSorted(all.flatMap((r) => [r.y0, r.y1]));
  const nx = xs.length - 1;
  const ny = ys.length - 1;

  const filled = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return insideAny(solid, cx, cy) && !insideAny(holes, cx, cy);
  };

  // Directed boundary edges, emitted per filled cell so the filled region is
  // consistently on one side (CCW per cell). Key by start point.
  const key = (x: number, y: number) => `${x},${y}`;
  const starts = new Map<string, Point[]>();
  const pushEdge = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const list = starts.get(k);
    if (list) list.push({ x: bx, y: by });
    else starts.set(k, [{ x: bx, y: by }]);
  };

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!filled(i, j)) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const y0 = ys[j];
      const y1 = ys[j + 1];
      if (!filled(i, j - 1)) pushEdge(x1, y0, x0, y0); // top: right → left
      if (!filled(i - 1, j)) pushEdge(x0, y0, x0, y1); // left: top → bottom
      if (!filled(i, j + 1)) pushEdge(x0, y1, x1, y1); // bottom: left → right
      if (!filled(i + 1, j)) pushEdge(x1, y1, x1, y0); // right: bottom → top
    }
  }

  // Walk the directed edges into closed loops. At a vertex with two outgoing
  // edges (a pinch point), prefer the one that turns left, keeping loops simple.
  const used = new Set<string>();
  const edgeKey = (a: Point, b: Point) => `${a.x},${a.y}->${b.x},${b.y}`;
  const loops: Point[][] = [];

  const takeNext = (from: Point, prevDir: { x: number; y: number } | null): Point | null => {
    const list = starts.get(key(from.x, from.y));
    if (!list) return null;
    const candidates = list.filter((to) => !used.has(edgeKey(from, to)));
    if (candidates.length === 0) return null;
    if (candidates.length === 1 || !prevDir) return candidates[0];
    // Prefer the left-most turn (cross product > 0 in y-down screen space).
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const dir = { x: c.x - from.x, y: c.y - from.y };
      const cross = prevDir.x * dir.y - prevDir.y * dir.x;
      if (cross > bestScore) {
        bestScore = cross;
        best = c;
      }
    }
    return best;
  };

  for (const [startKey, ends] of starts) {
    for (const firstEnd of ends) {
      const [sx, sy] = startKey.split(",").map(Number);
      const start: Point = { x: sx, y: sy };
      if (used.has(edgeKey(start, firstEnd))) continue;
      const loop: Point[] = [start];
      let cur = start;
      let next: Point | null = firstEnd;
      let dir: { x: number; y: number } | null = null;
      while (next) {
        used.add(edgeKey(cur, next));
        if (next.x === start.x && next.y === start.y) break;
        loop.push(next);
        dir = { x: next.x - cur.x, y: next.y - cur.y };
        cur = next;
        next = takeNext(cur, dir);
      }
      if (loop.length >= 4) loops.push(mergeCollinear(loop));
    }
  }
  return loops;
}

/** Drop interior vertices that lie on a straight run. */
function mergeCollinear(loop: Point[]): Point[] {
  const n = loop.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const cur = loop[i];
    const next = loop[(i + 1) % n];
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    // Keep the vertex only if direction changes (cross product non-zero).
    if (d1x * d2y - d1y * d2x !== 0) out.push(cur);
  }
  return out.length >= 3 ? out : loop;
}
