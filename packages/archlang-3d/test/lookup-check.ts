/**
 * The contact shadows' face lookup checked against a scan of every face (card RM8.8b, review round 1):
 * a `FaceLookup` that answers exactly as `TriGrid` does and counts each lookup whose answer, after
 * the exact test, differs from the scan's. `at(q)` is checked against `contains` over every face;
 * `near(box)` against `touches`, an exact triangle–box test of its own (not the grid's `overlaps`),
 * so a fault in either the grid or its overlap test shows as a miss. Read by `shadows.test.ts`.
 */
import { contains, type FaceLookup, type P2, type Tri, TriGrid } from "../src/replay/shadows.js";

export interface Tally {
  at: number;
  near: number;
  misses: number;
  /** The first few misses, for the failure message. */
  seen: string[];
}

export const tally = (): Tally => ({ at: 0, near: 0, misses: 0, seen: [] });

/** `(b − a) × (c − a)`, exactly. */
const orient = (a: P2, b: P2, c: P2): bigint =>
  (BigInt(b[0]) - BigInt(a[0])) * (BigInt(c[1]) - BigInt(a[1])) -
  (BigInt(b[1]) - BigInt(a[1])) * (BigInt(c[0]) - BigInt(a[0]));

const sgn = (v: bigint): number => (v > 0n ? 1 : v < 0n ? -1 : 0);

/** Whether the closed segments `pq` and `rs` share a point, exactly. */
function segmentsMeet(p: P2, q: P2, r: P2, s: P2): boolean {
  const d1 = sgn(orient(p, q, r));
  const d2 = sgn(orient(p, q, s));
  const d3 = sgn(orient(r, s, p));
  const d4 = sgn(orient(r, s, q));
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  const on = (a: P2, b: P2, c: P2): boolean =>
    Math.min(a[0], b[0]) <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] &&
    c[1] <= Math.max(a[1], b[1]);
  return (
    (d1 === 0 && on(p, q, r)) || (d2 === 0 && on(p, q, s)) || (d3 === 0 && on(r, s, p)) || (d4 === 0 && on(r, s, q))
  );
}

/** Whether the closed triangle `t` and the closed box share a point: a vertex of one in the other, or two edges meeting. */
export function touches(t: Tri, x0: number, z0: number, x1: number, z1: number): boolean {
  const vs = [t.a, t.b, t.c];
  if (vs.some((v) => v[0] >= x0 && v[0] <= x1 && v[1] >= z0 && v[1] <= z1)) return true;
  if (Math.max(...vs.map((v) => v[0])) < x0 || Math.min(...vs.map((v) => v[0])) > x1) return false;
  if (Math.max(...vs.map((v) => v[1])) < z0 || Math.min(...vs.map((v) => v[1])) > z1) return false;
  const box: P2[] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  if (box.some((c) => contains(t, c))) return true;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 4; j++)
      if (segmentsMeet(vs[i] as P2, vs[(i + 1) % 3] as P2, box[j] as P2, box[(j + 1) % 4] as P2)) return true;
  return false;
}

/** A lookup over `tris` that answers as `TriGrid` and tallies where its exact answer differs from the scan. */
export function checked(t: Tally, tris: readonly Tri[], grid: FaceLookup = new TriGrid(tris)): FaceLookup {
  const differs = (got: readonly Tri[], keep: (f: Tri) => boolean): boolean => {
    const g = new Set(got.filter(keep));
    const all = tris.filter(keep);
    return all.length !== g.size || all.some((f) => !g.has(f));
  };
  return {
    at(q) {
      const got = grid.at(q);
      t.at++;
      if (differs(got, (f) => contains(f, q))) {
        t.misses++;
        if (t.seen.length < 5) t.seen.push(`at ${q.join(",")}`);
      }
      return got;
    },
    near(x0, z0, x1, z1) {
      const got = grid.near(x0, z0, x1, z1);
      t.near++;
      if (differs(got, (f) => touches(f, x0, z0, x1, z1))) {
        t.misses++;
        if (t.seen.length < 5) t.seen.push(`near ${x0},${z0},${x1},${z1}`);
      }
      return got;
    },
  };
}

/**
 * Slivers one micrometre thin laid along the cell borders of the grid their count and extent make,
 * each with an edge on a border (vertical and horizontal) or a vertex on a cell's corner, inside two
 * triangles spanning `[0, size]²`; and the probes on and one micrometre either side of each border
 * edge. The grid of the base and the slivers is the one the placeholders measured (same count, same
 * extent), which the caller asserts.
 */
export function borderSlivers(
  size = 1_000_000,
  n = 48,
): { tris: Tri[]; probes: P2[]; grid: TriGrid; measured: TriGrid } {
  const base: Tri[] = [
    { a: [0, 0], b: [size, 0], c: [0, size], y: 0 },
    { a: [size, 0], b: [size, size], c: [0, size], y: 0 },
  ];
  const holder = Array.from({ length: n }, (_, k): Tri => ({ a: [k + 1, 1], b: [k + 2, 1], c: [k + 1, 2], y: 1 }));
  const measured = new TriGrid([...base, ...holder]);
  const { x0, z0, w, h, kx, kz } = measured;
  const slivers: Tri[] = [];
  const probes: P2[] = [];
  for (let k = 0; slivers.length < n; k++) {
    // Interior borders a cell in from the edge, so every sliver stays inside the base's extent.
    const i = 2 + (k % Math.max(1, kx - 3));
    const j = 2 + (Math.floor(k / Math.max(1, kx - 3)) % Math.max(1, kz - 3));
    const bx = x0 + i * w;
    const bz = z0 + j * h;
    const zA = bz - Math.floor(h / 3);
    const xA = bx - Math.floor(w / 3);
    switch (k % 4) {
      case 0: // an edge on the vertical border, the sliver to its left (in the cell before it)
        slivers.push({ a: [bx, zA], b: [bx, zA + Math.floor(h / 2)], c: [bx - 1, zA + 1], y: 2 });
        probes.push([bx, zA], [bx, zA + 1], [bx, zA + Math.floor(h / 4)], [bx - 1, zA + 1], [bx + 1, zA + 1]);
        break;
      case 1: // an edge on the horizontal border, the sliver above it (in the row before it)
        slivers.push({ a: [xA, bz], b: [xA + Math.floor(w / 2), bz], c: [xA + 1, bz - 1], y: 2 });
        probes.push([xA, bz], [xA + 1, bz], [xA + Math.floor(w / 4), bz], [xA + 1, bz - 1], [xA + 1, bz + 1]);
        break;
      case 2: // a vertex on a cell's corner, the sliver in the cell up and left of it
        slivers.push({ a: [bx, bz], b: [bx - Math.floor(w / 2), bz - 1], c: [bx - 1, bz - Math.floor(h / 2)], y: 2 });
        probes.push([bx, bz], [bx - 1, bz - 1], [bx + 1, bz + 1]);
        break;
      default: // a long diagonal sliver crossing cell borders between its vertices
        slivers.push({ a: [bx - w, bz - h], b: [bx + w, bz + h], c: [bx + w, bz + h - 1], y: 2 });
        probes.push([bx, bz], [bx + 1, bz + 1], [bx, bz - 1], [bx - 1, bz]);
    }
  }
  const tris = [...base, ...slivers];
  return { tris, probes, grid: new TriGrid(tris), measured };
}
