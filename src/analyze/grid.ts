/**
 * The 4-neighbourhood of a row-major cell grid, shared by the nav grid
 * (`circulation.ts`) and the occupancy grid (`occupancy.ts`).
 */

/**
 * Write the in-bounds 4-neighbours of cell `k` on an `nx` × `ny` row-major grid into
 * `out`, in the order WEST, EAST, NORTH, SOUTH, and return how many there are (0–4).
 *
 * The order is part of the output: a breadth-first search keeps the parent that
 * discovers a cell first, and the circulation overlay draws the walk from those parents.
 *
 * A caller-owned buffer rather than a callback: every search hands in the same
 * `Int32Array(4)` for all its cells, so nothing is allocated per cell, and the loop body
 * stays in the caller, where the engine can inline it. A shared callback taking five
 * different closures measured up to 3× slower on the occupancy flood.
 */
export function neighbours4(k: number, nx: number, ny: number, out: Int32Array): number {
  const ix = k % nx;
  const iy = (k - ix) / nx;
  let n = 0;
  if (ix > 0) out[n++] = k - 1;
  if (ix < nx - 1) out[n++] = k + 1;
  if (iy > 0) out[n++] = k - nx;
  if (iy < ny - 1) out[n++] = k + nx;
  return n;
}
