/**
 * A seeded, deterministic PRNG for the dataset generator.
 *
 * Everything under `dataset/` must be reproducible byte-for-byte from an explicit seed,
 * so wall-clock reads, entropy-seeded randomness, and argless date construction are
 * FORBIDDEN anywhere in this directory (a test grep-asserts their absence). All
 * randomness flows from {@link mulberry32}, whose seed is always passed in explicitly.
 */

/** A pure PRNG: successive calls return floats in `[0, 1)`. */
export type Rng = () => number;

/**
 * `mulberry32` — a fast, well-distributed 32-bit PRNG. Deterministic: the same seed
 * always yields the same stream. No global state, no time or entropy source.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `splitmix32` — derive a fresh 32-bit sub-seed from a base seed and an index. Used to
 * give each generated row its own independent {@link mulberry32} stream deterministically
 * (row `i`'s seed is a pure function of the master seed and `i`).
 */
export function splitmix32(seed: number, index: number): number {
  let z = (seed + index * 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

/** An integer in `[lo, hi]` inclusive. */
export function randint(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** A multiple of `step` in `[lo, hi]` inclusive (both bounds assumed multiples of `step`). */
export function randstep(rng: Rng, lo: number, hi: number, step: number): number {
  const n = Math.floor((hi - lo) / step);
  return lo + randint(rng, 0, n) * step;
}

/** Pick one element of a non-empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick from empty array");
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** True with probability `p`. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}
