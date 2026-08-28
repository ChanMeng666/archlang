/**
 * Uniform-grid bucket spatial index over axis-aligned boxes.
 *
 * Zero-dependency, deterministic. Items are bucketed into the grid cells their
 * bounding box overlaps; a query box returns the distinct items whose cells it
 * touches — a *superset* of the true overlappers (callers do the exact test).
 * This turns the compiler's O(n²) room-overlap scan and per-opening wall scan
 * into ~O(n) for the common case (well-distributed geometry), while remaining
 * exact: a box query of half-size `r` around a point is guaranteed to return
 * every item within distance `r` of that point, so callers can expand `r` until
 * a completeness bound is met and get the same answer as a full scan.
 */

export interface GridBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class GridIndex<T> {
  readonly cellSize: number;
  /**
   * Buckets nested by column then row, rather than keyed by a `"cx:cy"` string.
   *
   * Purely an allocation decision, and a measured one: a long thin box (a 4 m wall face)
   * lands in dozens of cells, so a string key means dozens of string allocations per
   * insert. Building the wall-joinery layer's indices cost 55 ms of a 214 ms budget on
   * that alone. Iteration order is unchanged - it comes from the `cx`/`cy` loops, never
   * from the Map's own ordering.
   */
  private readonly buckets = new Map<number, Map<number, T[]>>();

  constructor(cellSize: number) {
    this.cellSize = cellSize > 0 ? cellSize : 1;
  }

  private idx(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  /** Insert an item under every cell its bounding box overlaps. */
  insert(box: GridBox, item: T): void {
    const x0 = this.idx(box.minX);
    const x1 = this.idx(box.maxX);
    const y0 = this.idx(box.minY);
    const y1 = this.idx(box.maxY);
    for (let cx = x0; cx <= x1; cx++) {
      let col = this.buckets.get(cx);
      if (!col) {
        col = new Map();
        this.buckets.set(cx, col);
      }
      for (let cy = y0; cy <= y1; cy++) {
        const b = col.get(cy);
        if (b) b.push(item);
        else col.set(cy, [item]);
      }
    }
  }

  /**
   * Every item in every cell `box` touches, in deterministic order and **without
   * allocating** - cells in `(cx, cy)` order, items in insertion order. An item in
   * several touched cells is visited once PER CELL, so the callback must tolerate
   * repeats; `queryBox` is the de-duplicating wrapper.
   *
   * This exists because the de-duplication is the expensive part. A pair scan asks this
   * once per edge and rejects almost every candidate on a bounding box, so building a
   * `Set` and an array of the candidates first costs more than the scan does - measured
   * as the dominant cost of the wall-joinery split phase.
   */
  forEach(box: GridBox, visit: (item: T) => void): void {
    const x0 = this.idx(box.minX);
    const x1 = this.idx(box.maxX);
    const y0 = this.idx(box.minY);
    const y1 = this.idx(box.maxY);
    for (let cx = x0; cx <= x1; cx++) {
      const col = this.buckets.get(cx);
      if (!col) continue;
      for (let cy = y0; cy <= y1; cy++) {
        const b = col.get(cy);
        if (!b) continue;
        for (const item of b) visit(item);
      }
    }
  }

  /**
   * Distinct items whose cells intersect `box`, in deterministic order (cells
   * scanned in (cx,cy) order, items in insertion order, de-duplicated). A
   * superset of items truly overlapping `box`.
   */
  queryBox(box: GridBox): T[] {
    const x0 = this.idx(box.minX);
    const x1 = this.idx(box.maxX);
    const y0 = this.idx(box.minY);
    const y1 = this.idx(box.maxY);
    const seen = new Set<T>();
    const out: T[] = [];
    for (let cx = x0; cx <= x1; cx++) {
      const col = this.buckets.get(cx);
      if (!col) continue;
      for (let cy = y0; cy <= y1; cy++) {
        const b = col.get(cy);
        if (!b) continue;
        for (const item of b) {
          if (!seen.has(item)) {
            seen.add(item);
            out.push(item);
          }
        }
      }
    }
    return out;
  }
}
