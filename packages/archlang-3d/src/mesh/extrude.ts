/**
 * Prisms: a plan polygon (with holes) between two heights → one closed triangle shell, in the
 * exporters' axes (X = plan x, Y = up, Z = plan y), integer micrometres. Caps are triangulated with
 * earcut (ISC), which adds no vertex, so the caps and the sides share every edge and the shell is
 * watertight by construction. Winding is decided numerically per face, never assumed: each face's
 * normal is turned to point out of the solid.
 */
import earcut from "earcut";
import type { Polygon, Pt, Ring3 } from "../scene3d/types.js";
import type { Shell } from "./types.js";

const area2 = (r: readonly Pt[]): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i] as Pt;
    const b = r[(i + 1) % r.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
};

/** Drop repeated and closing duplicates; `null` when fewer than three distinct points remain. */
function clean(r: readonly Pt[]): Pt[] | null {
  const out: Pt[] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  while (out.length > 1 && out[0]?.[0] === out[out.length - 1]?.[0] && out[0]?.[1] === out[out.length - 1]?.[1])
    out.pop();
  return out.length >= 3 && area2(out) !== 0 ? out : null;
}

/** Orient a ring: `ccw` = positive numeric area in plan (x, y). */
const orient = (r: Pt[], ccw: boolean): Pt[] => (area2(r) > 0 === ccw ? r : [...r].reverse());

/**
 * A closed prism over `poly` from `z0` to `z1` (µm, z0 < z1), or `null` when the polygon is
 * degenerate. Outer ring counter-clockwise and holes clockwise in plan numbers, so the solid lies to
 * the LEFT of every edge.
 */
export function prism(poly: Polygon, z0: number, z1: number): Shell | null {
  if (!(z1 > z0)) return null;
  const outer = clean(poly.outer);
  if (!outer) return null;
  const rings: Pt[][] = [orient(outer, true)];
  for (const h of poly.holes ?? []) {
    const c = clean(h);
    if (c) rings.push(orient(c, false));
  }
  const flat: number[] = [];
  const holes: number[] = [];
  rings.forEach((r, i) => {
    if (i > 0) holes.push(flat.length / 2);
    for (const p of r) flat.push(p[0], p[1]);
  });
  const tris = earcut(flat, holes, 2);
  const n = flat.length / 2;
  const positions: number[] = [];
  // Bottom layer (Y = z0) then top layer (Y = z1); vertex i of the plan is i (bottom), n + i (top).
  for (const z of [z0, z1])
    for (let i = 0; i < n; i++) positions.push(flat[2 * i] as number, z, flat[2 * i + 1] as number);
  const indices: number[] = [];
  const v = (i: number): [number, number, number] => [
    positions[3 * i] as number,
    positions[3 * i + 1] as number,
    positions[3 * i + 2] as number,
  ];
  /** Push triangle (a, b, c), flipped if its normal does not point along `want`. */
  const face = (a: number, b: number, c: number, want: [number, number, number]): void => {
    const [A, B, C] = [v(a), v(b), v(c)];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nrm = [
      (u[1] as number) * (w[2] as number) - (u[2] as number) * (w[1] as number),
      (u[2] as number) * (w[0] as number) - (u[0] as number) * (w[2] as number),
      (u[0] as number) * (w[1] as number) - (u[1] as number) * (w[0] as number),
    ];
    const dot = (nrm[0] as number) * want[0] + (nrm[1] as number) * want[1] + (nrm[2] as number) * want[2];
    // A zero-area sliver is kept (either winding): dropping it would leave its edges unpaired.
    if (dot >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] as number, tris[t + 1] as number, tris[t + 2] as number];
    face(n + a, n + b, n + c, [0, 1, 0]);
    face(a, b, c, [0, -1, 0]);
  }
  let base = 0;
  for (const r of rings) {
    for (let k = 0; k < r.length; k++) {
      const i = base + k;
      const j = base + ((k + 1) % r.length);
      const a = r[k] as Pt;
      const b = r[(k + 1) % r.length] as Pt;
      // Solid on the left of a→b (plan numbers), so outward is the right-hand normal (dy, −dx);
      // in the exporters' axes plan (x, y) is (X, Z).
      const out: [number, number, number] = [b[1] - a[1], 0, -(b[0] - a[0])];
      face(i, j, n + j, out);
      face(i, n + j, n + i, out);
    }
    base += r.length;
  }
  return { positions, indices };
}

/** An axis-aligned plan rectangle as a polygon. */
export function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return {
    outer: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  };
}

/**
 * A thin plan box centred on segment `a`→`b`, `depth` across it: an oriented rectangle (a door
 * leaf, a glazing pane, a frame member), rounded to whole micrometres.
 */
export function slab2d(a: Pt, b: Pt, depth: number): Polygon {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (depth / 2);
  const ny = (dx / len) * (depth / 2);
  const p = (x: number, y: number): Pt => [Math.round(x), Math.round(y)];
  return {
    outer: [p(a[0] + nx, a[1] + ny), p(b[0] + nx, b[1] + ny), p(b[0] - nx, b[1] - ny), p(a[0] - nx, a[1] - ny)],
  };
}

export type { Ring3 };
