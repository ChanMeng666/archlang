/**
 * Boolean of axis-aligned rectangles (union, and difference of "holes") →
 * boundary loops.
 *
 * Zero-dependency, synchronous, deterministic. Used to merge wall segment
 * rectangles into clean outlines (no internal seams at corners/T-junctions) and,
 * since v0.9, to subtract door/window opening rectangles so openings truly void
 * the wall solid. Works via coordinate compression: the union of all rectangle
 * edges forms a grid; a cell is "in" when it is covered by a solid rect and not
 * by any hole rect; the boundary between in/out cells is then walked into closed
 * loops. Angled (non-axis-aligned) rectangles are not handled here — the
 * renderer falls back to per-segment outlines for those.
 *
 * Every rect edge lies exactly on a grid line (the grid is built from the same
 * coordinates), so coverage is rasterized once into a flat cell grid by index
 * range — equivalent to the former per-cell centre-in-rect test, without the
 * O(cells × rects) scans. Cell scan order and per-cell edge emission order are
 * unchanged, so the output loops are byte-identical to the previous
 * implementation.
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

  // Rasterize coverage once. A rect covers exactly the cell index range
  // [xi(x0), xi(x1)) × [yi(y0), yi(y1)) (empty when inverted/degenerate, same
  // as the old strict centre test). Solids paint 1, holes clear to 0.
  const xi = new Map<number, number>();
  for (let i = 0; i < xs.length; i++) xi.set(xs[i]!, i);
  const yi = new Map<number, number>();
  for (let j = 0; j < ys.length; j++) yi.set(ys[j]!, j);
  const fill = new Uint8Array(nx * ny);
  const paint = (rects: Rect[], value: 0 | 1) => {
    for (const r of rects) {
      const i0 = xi.get(r.x0)!;
      const i1 = xi.get(r.x1)!;
      const j0 = yi.get(r.y0)!;
      const j1 = yi.get(r.y1)!;
      for (let i = i0; i < i1; i++) {
        for (let j = j0; j < j1; j++) fill[i * ny + j] = value;
      }
    }
  };
  paint(solid, 1);
  if (holes.length) paint(holes, 0);

  const filled = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    return fill[i * ny + j] === 1;
  };

  // Directed boundary edges, emitted per filled cell so the filled region is
  // consistently on one side (CCW per cell). Vertices are grid points
  // (xs[i], ys[j]) keyed by the packed integer id i*(ny+1)+j; edges are keyed
  // by start id. Emission order matches the former string-keyed maps, so Map
  // insertion order — and therefore loop discovery order — is unchanged.
  const V = ny + 1; // vertex id stride per x-index
  const vertexCount = (nx + 1) * V;
  const starts = new Map<number, number[]>();
  const pushEdge = (a: number, b: number) => {
    const list = starts.get(a);
    if (list) list.push(b);
    else starts.set(a, [b]);
  };

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!filled(i, j)) continue;
      const v00 = i * V + j; // (xs[i],   ys[j])
      const v01 = v00 + 1; // (xs[i],   ys[j+1])
      const v10 = v00 + V; // (xs[i+1], ys[j])
      const v11 = v10 + 1; // (xs[i+1], ys[j+1])
      if (!filled(i, j - 1)) pushEdge(v10, v00); // top: right → left
      if (!filled(i - 1, j)) pushEdge(v00, v01); // left: top → bottom
      if (!filled(i, j + 1)) pushEdge(v01, v11); // bottom: left → right
      if (!filled(i + 1, j)) pushEdge(v11, v10); // right: bottom → top
    }
  }

  const px = (v: number) => xs[Math.floor(v / V)]!;
  const py = (v: number) => ys[v % V]!;

  // Walk the directed edges into closed loops. At a vertex with two outgoing
  // edges (a pinch point), prefer the one that turns left, keeping loops simple.
  const used = new Set<number>();
  const edgeKey = (a: number, b: number) => a * vertexCount + b;
  const loops: Point[][] = [];

  const takeNext = (from: number, prevDir: { x: number; y: number } | null): number | null => {
    const list = starts.get(from);
    if (!list) return null;
    const candidates = list.filter((to) => !used.has(edgeKey(from, to)));
    if (candidates.length === 0) return null;
    if (candidates.length === 1 || !prevDir) return candidates[0]!;
    // Prefer the left-most turn (cross product > 0 in y-down screen space).
    const fx = px(from);
    const fy = py(from);
    let best = candidates[0]!;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const dir = { x: px(c) - fx, y: py(c) - fy };
      const cross = prevDir.x * dir.y - prevDir.y * dir.x;
      if (cross > bestScore) {
        bestScore = cross;
        best = c;
      }
    }
    return best;
  };

  for (const [start, ends] of starts) {
    for (const firstEnd of ends) {
      if (used.has(edgeKey(start, firstEnd))) continue;
      const loop: Point[] = [{ x: px(start), y: py(start) }];
      let cur = start;
      let next: number | null = firstEnd;
      let dir: { x: number; y: number } | null = null;
      while (next !== null) {
        used.add(edgeKey(cur, next));
        if (next === start) break;
        loop.push({ x: px(next), y: py(next) });
        dir = { x: px(next) - px(cur), y: py(next) - py(cur) };
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
    const prev = loop[(i - 1 + n) % n]!;
    const cur = loop[i]!;
    const next = loop[(i + 1) % n]!;
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    // Keep the vertex only if direction changes (cross product non-zero).
    if (d1x * d2y - d1y * d2x !== 0) out.push(cur);
  }
  return out.length >= 3 ? out : loop;
}
