/**
 * Each room's `adjacent` list for `describe()`: {@link roomAdjacency}, which asks
 * `roomsAdjacent` of only the pairs that can touch, and the all-pairs definition it falls back
 * to (moved verbatim from `src/describe.ts`).
 *
 * Invariant: the fast path returns the same strings in the same order as the definition
 * (`test/room-adjacency-oracle.test.ts`). It charges nothing to the step meter.
 */

import type { RRoom } from "../ir.js";
import { roomsAdjacent, type RoomBox } from "../analyze.js";

/**
 * Each room's `adjacent` list: the ids of the other rooms that {@link roomsAdjacent} says
 * share an edge with it, in element order. The definition is the loop over every ordered
 * pair ({@link adjacencyAllPairs}); this asks the same predicate of the same boxes, only of
 * fewer pairs, so the lists are the same strings in the same order
 * (`test/room-adjacency-oracle.test.ts`).
 *
 * A pair the predicate can accept is never skipped. Two rectangles touch only when one's
 * edge coordinate (`x`, `x + w`, `y`, `y + h`) lies within `tol` of the facing edge of the
 * other, so each rectangle asks four sorted key lists for the keys within `tol` of its own,
 * widened by far more than the rounding of `|a − b| <= tol`. A pair with a polygon (or
 * circle) side touches only along a shared run of edges, so their ring bounds, widened by
 * `tol` and far more than the slope and rounding allowance of `ringsAdjacent`, intersect.
 * 5,000 coincident rectangles share no edge, so they ask for no pair at all.
 *
 * A non-finite or negative `tol`, or a non-finite coordinate, takes the definition.
 */
export function roomAdjacency(
  roomEls: readonly RRoom[],
  roomRects: ReadonlyMap<string, RoomBox>,
  tol: number,
): string[][] {
  const boxes = roomEls.map((r) => roomRects.get(r.id)!);
  const n = boxes.length;
  // Bounds of what `roomsAdjacent` reads: the ring of a polygon room, the four corners
  // (`rectRing`) of a rectangle.
  const minX = new Float64Array(n);
  const minY = new Float64Array(n);
  const maxX = new Float64Array(n);
  const maxY = new Float64Array(n);
  let finite = tol >= 0 && tol < Number.POSITIVE_INFINITY;
  let reach = 0;
  for (let i = 0; i < n && finite; i++) {
    const b = boxes[i]!;
    const pts = b.poly ?? [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
    ];
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const p of pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) finite = false;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (pts.length === 0) finite = false;
    minX[i] = x0;
    minY[i] = y0;
    maxX[i] = x1;
    maxY[i] = y1;
    reach = Math.max(reach, Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1), x1 - x0 + (y1 - y0));
  }
  if (!finite) return adjacencyAllPairs(roomEls, roomRects, tol);

  // A ring pair's margin: `tol`, plus `ringsAdjacent`'s parallel allowance (|sin| ≤ 1e-9
  // over an edge no longer than `reach`) and its rounding, each covered a thousandfold.
  const ringMargin = tol + 1e-6 * reach + 1e-6;
  const near = (i: number, j: number): boolean =>
    minX[j]! - ringMargin <= maxX[i]! &&
    minX[i]! - ringMargin <= maxX[j]! &&
    minY[j]! - ringMargin <= maxY[i]! &&
    minY[i]! - ringMargin <= maxY[j]!;

  const rects: number[] = [];
  const rings: number[] = [];
  for (let i = 0; i < n; i++) (boxes[i]!.poly ? rings : rects).push(i);
  // The rectangles sorted by each edge coordinate, exactly as `roomsAdjacent` computes it.
  const keyed = (key: (b: RoomBox) => number): { keys: Float64Array; ids: Int32Array } => {
    const order = rects.map((i) => ({ i, k: key(boxes[i]!) })).sort((p, q) => p.k - q.k || p.i - q.i);
    return { keys: Float64Array.from(order, (o) => o.k), ids: Int32Array.from(order, (o) => o.i) };
  };
  const left = keyed((b) => b.x);
  const right = keyed((b) => b.x + b.w);
  const top = keyed((b) => b.y);
  const bottom = keyed((b) => b.y + b.h);

  const seen = new Int32Array(n).fill(-1);
  const out: string[][] = [];
  for (let i = 0; i < n; i++) {
    const cand: number[] = [];
    const take = (j: number): void => {
      if (seen[j] !== i) {
        seen[j] = i;
        cand.push(j);
      }
    };
    const b = boxes[i]!;
    if (b.poly) {
      for (let j = 0; j < n; j++) if (near(i, j)) take(j);
    } else {
      // Every key k with |v − k| <= tol, widened by 2^-40 of the magnitudes: the rounding of
      // that subtraction and of these bounds is below 2^-50 of them.
      const within = (list: { keys: Float64Array; ids: Int32Array }, v: number): void => {
        const w = tol + (Math.abs(v) + tol) * 2 ** -40;
        const lo = v - w;
        const hi = v + w;
        let a = 0;
        let z = list.keys.length;
        while (a < z) {
          const m = (a + z) >>> 1;
          if (list.keys[m]! < lo) a = m + 1;
          else z = m;
        }
        for (let k = a; k < list.keys.length && list.keys[k]! <= hi; k++) take(list.ids[k]!);
      };
      within(left, b.x + b.w);
      within(right, b.x);
      within(top, b.y + b.h);
      within(bottom, b.y);
      for (const j of rings) if (near(i, j)) take(j);
    }
    cand.sort((p, q) => p - q);
    const id = roomEls[i]!.id;
    const adjacent: string[] = [];
    for (const j of cand) {
      const other = roomEls[j]!;
      if (other.id === id) continue;
      if (roomsAdjacent(b, boxes[j]!, tol)) adjacent.push(other.id);
    }
    out.push(adjacent);
  }
  return out;
}

/** {@link roomAdjacency} by its definition: {@link roomsAdjacent} over every ordered pair. */
function adjacencyAllPairs(
  roomEls: readonly RRoom[],
  roomRects: ReadonlyMap<string, RoomBox>,
  tol: number,
): string[][] {
  return roomEls.map((r) => {
    const rect = roomRects.get(r.id)!;
    const adjacent: string[] = [];
    for (const other of roomEls) {
      if (other.id === r.id) continue;
      if (roomsAdjacent(rect, roomRects.get(other.id)!, tol)) adjacent.push(other.id);
    }
    return adjacent;
  });
}
