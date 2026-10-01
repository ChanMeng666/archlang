/**
 * Pure statistics for the eval reports. No I/O; safe to import anywhere in `eval/`.
 */

/** Two-sided 95 % normal quantile. */
const Z95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion `k` successes out of `n` trials, at 95 %.
 * Total over its domain: `n = 0` yields the vacuous `[0, 1]`; `k = 0` pins `lo` to exactly 0
 * and `k = n` pins `hi` to exactly 1 (float rounding must not leak a 1e-17 sliver). `k` is
 * clamped into `[0, n]`.
 */
export function wilson95(k: number, n: number): { lo: number; hi: number } {
  if (!(n > 0)) return { lo: 0, hi: 1 };
  const x = Math.min(Math.max(k, 0), n);
  const p = x / n;
  const z2 = Z95 * Z95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    lo: x === 0 ? 0 : Math.max(0, centre - half),
    hi: x === n ? 1 : Math.min(1, centre + half),
  };
}
