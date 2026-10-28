/** A point-in-closed-shell probe the mesh tests share. */
import type { Shell } from "../src/index.js";

export type V3 = [number, number, number];

const vert = (s: Shell, i: number): V3 => [
  s.positions[3 * i] as number,
  s.positions[3 * i + 1] as number,
  s.positions[3 * i + 2] as number,
];

/**
 * Whether `p` lies inside the closed shell: parity of a +X ray's crossings. `p` is offset by a
 * fraction of a micrometre in Y and Z, so on an all-integer mesh the ray never grazes an edge.
 */
export function inside(s: Shell, p: V3): boolean {
  const o: V3 = [p[0], p[1] + 0.37, p[2] + 0.61];
  let hits = 0;
  for (let t = 0; t < s.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => vert(s, s.indices[t + k] as number)) as [V3, V3, V3];
    // Möller–Trumbore against direction (1, 0, 0).
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const pv: V3 = [0, -e2[2], e2[1]];
    const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
    if (det === 0) continue;
    const tv: V3 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
    if (u < 0 || u > 1) continue;
    const q: V3 = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const v = q[0] / det;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (dist > 0) hits++;
  }
  return hits % 2 === 1;
}
