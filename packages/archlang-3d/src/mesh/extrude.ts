/**
 * Prisms: a plan polygon (with holes) between two heights → one closed triangle shell, in the
 * exporters' axes (X = plan x, Y = up, Z = plan y), integer micrometres. Caps are triangulated with
 * earcut (ISC), which adds no vertex, so the caps and the sides share every edge and the shell is
 * watertight whenever every hole lies strictly inside the outer ring and apart from the others
 * (checked; anything else returns null). Winding is decided numerically per face, never assumed: each face's
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

/** Even-odd containment, `null` when `p` lies ON the ring (a vertex or an edge). */
export function where(p: Pt, r: readonly Pt[]): boolean | null {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as Pt;
    const b = r[j] as Pt;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const within =
      Math.min(a[0], b[0]) <= p[0] &&
      p[0] <= Math.max(a[0], b[0]) &&
      Math.min(a[1], b[1]) <= p[1] &&
      p[1] <= Math.max(a[1], b[1]);
    if (cross === 0 && within) return null;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/**
 * Whether every hole lies strictly inside the outer ring and apart from every other hole: the
 * condition under which earcut's bridging keeps the caps and the sides sharing every edge. A hole
 * touching its outer ring or another hole at a vertex or along an edge breaks it (red-team, PR #328).
 */
function holesApart(outer: readonly Pt[], holes: readonly Pt[][]): boolean {
  const strictlyIn = (ps: readonly Pt[], r: readonly Pt[]) => ps.every((p) => where(p, r) === true);
  const strictlyOut = (ps: readonly Pt[], r: readonly Pt[]) => ps.every((p) => where(p, r) === false);
  return holes.every(
    (h, i) =>
      strictlyIn(h, outer) &&
      strictlyOut(outer, h) &&
      holes.every((g, j) => j === i || (strictlyOut(h, g) && strictlyOut(g, h))),
  );
}

/**
 * A closed prism over `poly` from `z0` to `z1` (µm, z0 < z1), or `null` when the polygon is
 * degenerate or a hole touches its outer ring or another hole (callers cut such voids exactly
 * instead; see `lessVoids` in `build.ts`). Outer ring counter-clockwise and holes clockwise in plan numbers, so the solid lies to
 * the LEFT of every edge.
 *
 * `splits`, when given, names heights (strictly between z0 and z1) at which a vertex's vertical
 * edge is split: the side faces then carry those vertices, so a neighbouring shell whose edge ends
 * there (a wall's sill or lintel against its body's jamb, card A2b) meets a vertex, not the middle
 * of an edge (no T-junction). A side face whose two edges are not split keeps its two triangles.
 */
export function prism(poly: Polygon, z0: number, z1: number, splits?: (p: Pt) => readonly number[]): Shell | null {
  if (!(z1 > z0)) return null;
  const outer = clean(poly.outer);
  if (!outer) return null;
  const rings: Pt[][] = [orient(outer, true)];
  for (const h of poly.holes ?? []) {
    const c = clean(h);
    if (c) rings.push(orient(c, false));
  }
  if (!holesApart(rings[0] as Pt[], rings.slice(1))) return null;
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
  // Each plan vertex's column of vertices, bottom to top: its split heights in between.
  const column: number[][] = [];
  for (let i = 0; i < n; i++) {
    const p: Pt = [flat[2 * i] as number, flat[2 * i + 1] as number];
    const hs = splits ? [...new Set(splits(p))].filter((h) => h > z0 && h < z1).sort((x, y) => x - y) : [];
    const col = [i];
    for (const h of hs) {
      col.push(positions.length / 3);
      positions.push(p[0], h, p[1]);
    }
    col.push(n + i);
    column.push(col);
  }
  const height = (v: number): number => positions[3 * v + 1] as number;
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
      const ci = column[i] as number[];
      const cj = column[j] as number[];
      if (ci.length === 2 && cj.length === 2) {
        face(i, j, n + j, out);
        face(i, n + j, n + i, out);
        continue;
      }
      // A ladder up the two columns: always step the side whose next vertex is lower.
      let u = 0;
      let w = 0;
      while (u < ci.length - 1 || w < cj.length - 1) {
        const hu = u < ci.length - 1 ? height(ci[u + 1] as number) : Number.POSITIVE_INFINITY;
        const hw = w < cj.length - 1 ? height(cj[w + 1] as number) : Number.POSITIVE_INFINITY;
        if (hu <= hw) {
          face(ci[u] as number, cj[w] as number, ci[u + 1] as number, out);
          u++;
        } else {
          face(ci[u] as number, cj[w] as number, cj[w + 1] as number, out);
          w++;
        }
      }
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

/**
 * `ring ∩ convex` (Sutherland–Hodgman: any simple subject, a convex clip), rounded to whole
 * micrometres; `null` when nothing of it is left.
 */
export function clipToConvex(ring: readonly Pt[], convex: readonly Pt[]): Polygon | null {
  const c = area2(convex) > 0 ? [...convex] : [...convex].reverse();
  let out: Array<[number, number]> = ring.map((p) => [p[0], p[1]]);
  for (let k = 0; k < c.length && out.length > 0; k++) {
    const a = c[k] as Pt;
    const b = c[(k + 1) % c.length] as Pt;
    const side = (p: readonly number[]): number =>
      (b[0] - a[0]) * ((p[1] as number) - a[1]) - (b[1] - a[1]) * ((p[0] as number) - a[0]);
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i] as [number, number];
      const q = input[(i + 1) % input.length] as [number, number];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  const rounded = clean(out.map((p): Pt => [Math.round(p[0]), Math.round(p[1])]));
  return rounded ? { outer: rounded } : null;
}

/**
 * `poly` (a convex part: a pane, a frame member) kept inside `ring` (its opening's cut): as it is
 * when every corner already lies in or on the cut, which is every opening on a straight wall; else
 * the cut clipped to it. On a curved host the pane runs along the chord between the jambs, so its
 * corners cross the jambs' radial faces into the wall body (card A2b); clipped, its ends follow them.
 */
export function insideCut(poly: Polygon, ring: readonly Pt[]): Polygon | null {
  if (poly.outer.every((p) => where(p, ring) !== false)) return poly;
  return clipToConvex(ring, poly.outer);
}

/**
 * An opening's cut on a CURVED host, read back from its plan ring: the core's cut there is an
 * annular sector bounded by two RADIAL jamb faces (`openingCut`, `src/geometry/band.ts`). `c` is the
 * arc's centre (where the two jamb faces' lines meet), `r` the radius through the faces' midpoints
 * (the host's centreline), `t0` the angle of the face at `jambs[0]` and `sweep` the signed angle to
 * the face at `jambs[1]`, through the opening's centre; `steps` is how many chords the cut's longer
 * arc was tessellated into. `null` for a straight host (a four-corner cut) or anything this does not
 * recognise, where the chord between the jambs already runs between the jamb faces.
 */
export interface CutSector {
  c: Pt;
  r: number;
  t0: number;
  sweep: number;
  steps: number;
}

const TAU = 2 * Math.PI;
/** `x` mod 2π, in [0, 2π). */
const mod2pi = (x: number): number => ((x % TAU) + TAU) % TAU;

export function cutSector(cut: readonly Pt[], jambs: readonly [Pt, Pt], centre: Pt): CutSector | null {
  const ring = clean(cut);
  if (!ring || ring.length <= 4) return null;
  const n = ring.length;
  // The four corners turn by about a right angle; a tessellated arc's vertices by a chord's angle.
  const turn = ring.map((p, i) => {
    const a = ring[(i + n - 1) % n] as Pt;
    const b = ring[(i + 1) % n] as Pt;
    const u = [p[0] - a[0], p[1] - a[1]];
    const v = [b[0] - p[0], b[1] - p[1]];
    return Math.abs(
      Math.atan2(
        (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
        (u[0] as number) * (v[0] as number) + (u[1] as number) * (v[1] as number),
      ),
    );
  });
  const corners = turn
    .map((t, i) => [t, i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, 4)
    .map(([, i]) => i)
    .sort((a, b) => a - b);
  // The four corner-to-corner paths: their chords and how many edges each has.
  const paths = corners.map((ci, k) => {
    const cj = corners[(k + 1) % 4] as number;
    return { a: ring[ci] as Pt, b: ring[cj] as Pt, edges: (cj - ci + n) % n };
  });
  const mid = (p: { a: Pt; b: Pt }): Pt => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2];
  const d = (p: Pt, q: Pt): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // The jamb faces are two opposite paths: the pair whose midpoints lie nearest the jambs.
  let best: { cost: number; f0: { a: Pt; b: Pt }; f1: { a: Pt; b: Pt }; arcs: number } | null = null;
  for (const [i, j] of [
    [0, 2],
    [1, 3],
  ] as const) {
    const [p, q] = [paths[i], paths[j]] as [(typeof paths)[number], (typeof paths)[number]];
    const arcs = Math.max(
      (paths[(i + 1) % 4] as (typeof paths)[number]).edges,
      (paths[(j + 1) % 4] as (typeof paths)[number]).edges,
    );
    const straight = d(mid(p), jambs[0]) + d(mid(q), jambs[1]);
    const swapped = d(mid(q), jambs[0]) + d(mid(p), jambs[1]);
    const cand = straight <= swapped ? { cost: straight, f0: p, f1: q, arcs } : { cost: swapped, f0: q, f1: p, arcs };
    if (!best || cand.cost < best.cost) best = cand;
  }
  if (!best) return null;
  // The centre: where the two radial faces' lines meet.
  const { f0, f1 } = best;
  const u = [f0.b[0] - f0.a[0], f0.b[1] - f0.a[1]] as const;
  const v = [f1.b[0] - f1.a[0], f1.b[1] - f1.a[1]] as const;
  const den = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(den) <= 1e-9 * Math.hypot(...u) * Math.hypot(...v)) return null;
  const s = ((f1.a[0] - f0.a[0]) * v[1] - (f1.a[1] - f0.a[1]) * v[0]) / den;
  const c: Pt = [f0.a[0] + s * u[0], f0.a[1] + s * u[1]];
  const m0 = mid(f0);
  const m1 = mid(f1);
  const r = (d(m0, c) + d(m1, c)) / 2;
  const t0 = Math.atan2(m0[1] - c[1], m0[0] - c[0]);
  const t1 = Math.atan2(m1[1] - c[1], m1[0] - c[0]);
  const tc = Math.atan2(centre[1] - c[1], centre[0] - c[0]);
  // The way round from face 0 to face 1 that passes the opening's centre.
  const ccw = mod2pi(t1 - t0);
  const sweep = mod2pi(tc - t0) <= ccw ? ccw : ccw - TAU;
  return { c, r, t0, sweep, steps: Math.max(1, best.arcs) };
}

/**
 * A band of `sector`, between radii `r + d0` and `r + d1` (d0 < d1) and from fraction `f0` to `f1`
 * of its sweep (0 = the face at `jambs[0]`), tessellated as finely as the cut's arc; whole
 * micrometres. Its ends lie on the jamb faces' radial lines, so a pane or a frame built on it runs
 * from jamb face to jamb face, inside the cut.
 */
export function sectorBand(sector: CutSector, d0: number, d1: number, f0 = 0, f1 = 1): Polygon {
  const k = Math.max(1, Math.ceil(sector.steps * (f1 - f0)));
  const at = (rr: number, f: number): Pt => {
    const t = sector.t0 + sector.sweep * f;
    return [Math.round(sector.c[0] + rr * Math.cos(t)), Math.round(sector.c[1] + rr * Math.sin(t))];
  };
  const outer: Pt[] = [];
  for (let i = 0; i <= k; i++) outer.push(at(sector.r + d1, f0 + ((f1 - f0) * i) / k));
  for (let i = k; i >= 0; i--) outer.push(at(sector.r + d0, f0 + ((f1 - f0) * i) / k));
  return { outer };
}
