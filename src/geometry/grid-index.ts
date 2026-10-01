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

/**
 * The most cells ONE inserted box may occupy before it is kept in the shared
 * {@link GridIndex} overflow list instead of being bucketed cell by cell. A cell is sized
 * from the MEDIAN geometry, so a single extreme box (a 10^12 mm wall in a plan of 200 mm
 * walls) would otherwise be inserted into billions of cells and exhaust memory. No
 * ordinary plan comes near it: a 100 m wall at a 200 mm cell is 500 cells.
 */
export const MAX_CELLS_PER_BOX = 1 << 14;

/** Cell indices at or beyond this magnitude cannot be stepped one at a time (2^52). */
const MAX_SAFE_CELL = 2 ** 52;

function unsafeCells(x0: number, x1: number, y0: number, y1: number): boolean {
  return (
    Math.abs(x0) >= MAX_SAFE_CELL ||
    Math.abs(x1) >= MAX_SAFE_CELL ||
    Math.abs(y0) >= MAX_SAFE_CELL ||
    Math.abs(y1) >= MAX_SAFE_CELL
  );
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
  /** Populated buckets (rows across all columns) — what a huge query range is compared to. */
  private bucketCount = 0;
  /**
   * Items whose box spans more than {@link MAX_CELLS_PER_BOX} cells. Every query returns
   * all of them (after the bucketed items, in insertion order) — still a superset of the
   * true overlappers, so callers' exact tests keep the answer exact, and the index never
   * allocates more than O(1) per such item.
   */
  private readonly overflow: T[] = [];

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
    // A NaN/infinite extent or an inverted box occupies no cell and was always dropped
    // silently; keep dropping it rather than letting overflow return it to every query.
    if (!(Number.isFinite(x0) && Number.isFinite(x1) && Number.isFinite(y0) && Number.isFinite(y1))) return;
    if (x1 < x0 || y1 < y0) return;
    // Past 2^52 a cell index cannot be stepped (`cx++` stops changing it), so the cell
    // loop below would spin on one bucket until the array overflows. Such a box is
    // overflow however few cells it nominally spans.
    if (unsafeCells(x0, x1, y0, y1) || !((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CELLS_PER_BOX)) {
      this.overflow.push(item);
      return;
    }
    for (let cx = x0; cx <= x1; cx++) {
      let col = this.buckets.get(cx);
      if (!col) {
        col = new Map();
        this.buckets.set(cx, col);
      }
      for (let cy = y0; cy <= y1; cy++) {
        const b = col.get(cy);
        if (b) b.push(item);
        else {
          col.set(cy, [item]);
          this.bucketCount++;
        }
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
    if (this.sparse(x0, x1, y0, y1)) {
      for (const b of this.populated(x0, x1, y0, y1)) for (const item of b) visit(item);
    } else {
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
    for (const item of this.overflow) visit(item);
  }

  /**
   * True when walking the range cell by cell would visit far more cells than exist —
   * a query box that is huge next to the cell size. The range is then answered from the
   * populated buckets instead ({@link populated}), which yields the same buckets in the
   * same `(cx, cy)` order, so the answer is the same and only the cost is bounded.
   * (Only OVERFLOW boxes weaken this: they come back after the bucketed items and may be a
   * looser superset than a cell walk would give, so callers must filter exactly. Joinery's
   * `dmin` in `contextAt` reads an entry before any such filter — bounded, and no corpus
   * plan has a box near {@link MAX_CELLS_PER_BOX}.)
   */
  private sparse(x0: number, x1: number, y0: number, y1: number): boolean {
    return unsafeCells(x0, x1, y0, y1) || !((x1 - x0 + 1) * (y1 - y0 + 1) <= this.bucketCount + 64);
  }

  /** The populated buckets inside the cell range, in `(cx, cy)` order. */
  private populated(x0: number, x1: number, y0: number, y1: number): T[][] {
    const out: T[][] = [];
    const cols = [...this.buckets.keys()].filter((cx) => cx >= x0 && cx <= x1).sort((a, b) => a - b);
    for (const cx of cols) {
      const col = this.buckets.get(cx)!;
      const rows = [...col.keys()].filter((cy) => cy >= y0 && cy <= y1).sort((a, b) => a - b);
      for (const cy of rows) out.push(col.get(cy)!);
    }
    return out;
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
    const take = (b: T[]): void => {
      for (const item of b) {
        if (!seen.has(item)) {
          seen.add(item);
          out.push(item);
        }
      }
    };
    if (this.sparse(x0, x1, y0, y1)) {
      for (const b of this.populated(x0, x1, y0, y1)) take(b);
    } else {
      for (let cx = x0; cx <= x1; cx++) {
        const col = this.buckets.get(cx);
        if (!col) continue;
        for (let cy = y0; cy <= y1; cy++) {
          const b = col.get(cy);
          if (b) take(b);
        }
      }
    }
    take(this.overflow);
    return out;
  }
}
