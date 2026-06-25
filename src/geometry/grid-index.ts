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
  private readonly buckets = new Map<string, T[]>();

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
      for (let cy = y0; cy <= y1; cy++) {
        const k = `${cx}:${cy}`;
        const b = this.buckets.get(k);
        if (b) b.push(item);
        else this.buckets.set(k, [item]);
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
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(`${cx}:${cy}`);
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
