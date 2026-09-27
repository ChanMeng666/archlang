/**
 * The 4-neighbourhood of a row-major cell grid, shared by the nav grid
 * (`circulation.ts`) and the occupancy grid (`occupancy.ts`).
 */

/**
 * Call `f` with each in-bounds 4-neighbour of cell `k` on an `nx` × `ny` row-major grid,
 * in the order WEST, EAST, NORTH, SOUTH.
 *
 * The order is part of the output: a breadth-first search keeps the parent that
 * discovers a cell first, and the circulation overlay draws the walk from those parents.
 * Allocates nothing; callers create `f` once per search, not per cell.
 */
export function forEachNeighbour4(k: number, nx: number, ny: number, f: (nb: number) => void): void {
  const ix = k % nx;
  const iy = (k - ix) / nx;
  if (ix > 0) f(k - 1);
  if (ix < nx - 1) f(k + 1);
  if (iy > 0) f(k - nx);
  if (iy < ny - 1) f(k + nx);
}
