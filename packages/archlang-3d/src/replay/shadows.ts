/**
 * The replay's soft contact shadows (product-roadmap card RM8.8; design
 * `docs/plans/product-roadmap/design/visual-language.md` §1), browser-safe and pure: flat bands of
 * translucent black, baked once from the replay's nodes when the replay is mounted, never a shadow
 * map and never a per-frame pass. `mount.ts` draws them and fades each in as its caster finishes
 * rising; nothing here reads the theme, the time or the camera.
 *
 * Three classes, each one buffer per storey (so at most three draws a storey):
 *   - `foot`: along the foot of the storey's walls and columns, on the floor or the ground beside
 *     them. The bands follow the outline of the union of their bottom faces (the same nodes
 *     `wall-lines.ts` outlines), not each piece's, so no two bands overlap along a joint between two
 *     pieces (a sill on its wall, two collinear walls); at an outside corner a fan of the 16-gon's
 *     directions (`C16`) closes the gap between the two bands; at an inside corner the two bands
 *     overlap, darker, as an inside corner is. The same buffer holds each fence run's bands (both
 *     sides of its rails) and each stair's (round the plan of its stringers).
 *   - `corner`: up each inside corner of that outline, a vertical band on each of the two wall
 *     faces, from the floor to the lower of the two walls' tops.
 *   - `halo`: round each standing piece of furniture's footprint (`ReplayNode.band` is set on the
 *     standing pieces only: a hung one casts none).
 * Floors, outdoor surfaces, slabs and the ground plane only receive. Each band lies
 * `CONTACT_SHADOW.liftMm` above the highest receiving face under a probe half its width out from its
 * inner edge's midpoint (a fan's and a halo's likewise); where no face receives it (beside an upper
 * storey's outside wall, over nothing) it is not drawn.
 *
 * Exactness: Mesh3D coordinates are integer micrometres, every test of a side is exact (`det`), every
 * key is built from integers and every list is sorted before it is read, so the bands depend on no
 * triangle order and no `Map` iteration order. A band's outer edge is its inner edge moved by a
 * rounded vector, so every coordinate is an integer number of micrometres too.
 */
import { CONTACT_SHADOW } from "../materials.js";
import { C16, S16 } from "../mesh/c16.js";
import type { ReplayNode } from "./payload.js";
import { det, planLine, sweep } from "./wall-lines.js";

/** The three buffers of a storey (see the header). */
export type ShadowClass = "foot" | "corner" | "halo";

export interface ShadowLayer {
  /** The storey's level (its nodes' key prefix `L<level>/`). */
  level: number;
  cls: ShadowClass;
  /** Flat `[x, y, z, …]` in µm, the nodes' axes (X plan x, Y up, Z plan y). */
  positions: number[];
  /** Per vertex: 1 on a band's inner edge, 0 on its outer edge (times its class's alpha when drawn). */
  weight: number[];
  /** Per vertex: its caster (`ContactShadows.casters`), whose rise fades it in. */
  caster: number[];
  indices: number[];
}

export interface ContactShadows {
  layers: ShadowLayer[];
  /** Each caster: the node keys whose rise fades its bands in (the last of them up decides). */
  casters: string[][];
  /** What was built, for the structural bound (`test/shadows.test.ts`). */
  counts: {
    /** Outline edges of the walls' and columns' union that carry a band. */
    edges: number;
    convex: number;
    concave: number;
    furniture: number;
    /** Fence rail sides that carry a band. */
    fenceSides: number;
    /** Outline edges of the stairs' stringers that carry a band. */
    stairEdges: number;
    triangles: number;
  };
}

type P2 = readonly [number, number];

/** `u × v` in plan (x, z): positive when `v` turns counter-clockwise from `u`, exactly in sign. */
const cross = (ux: number, uz: number, vx: number, vz: number): number => det(ux, uz, vx, vz);

const levelOf = (key: string): number => Number(/^L(-?\d+)\//.exec(key)?.[1] ?? 0);

/** A face that receives a band: one upward horizontal triangle, at height `y`. */
interface Receiver {
  a: P2;
  b: P2;
  c: P2;
  y: number;
}

/** The upward horizontal triangles of `n` (a floor's, a slab's, an outdoor surface's top). */
function receiversOf(n: ReplayNode, out: Receiver[]): void {
  const p = n.positions;
  for (let i = 0; i < n.indices.length; i += 3) {
    const [ia, ib, ic] = [n.indices[i] as number, n.indices[i + 1] as number, n.indices[i + 2] as number];
    const y = p[ia * 3 + 1] as number;
    if (p[ib * 3 + 1] !== y || p[ic * 3 + 1] !== y) continue;
    const a: P2 = [p[ia * 3] as number, p[ia * 3 + 2] as number];
    const b: P2 = [p[ib * 3] as number, p[ib * 3 + 2] as number];
    const c: P2 = [p[ic * 3] as number, p[ic * 3 + 2] as number];
    // Outward-wound: a face whose normal points up turns clockwise in (x, z).
    if (cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]) < 0) out.push({ a, b, c, y });
  }
}

/** The height of the highest receiving face over plan point `q`, or undefined over none. */
function receive(q: P2, faces: readonly Receiver[], ground: number | undefined): number | undefined {
  let best = ground;
  for (const f of faces) {
    if (best !== undefined && f.y <= best) continue;
    const s1 = cross(f.b[0] - f.a[0], f.b[1] - f.a[1], q[0] - f.a[0], q[1] - f.a[1]);
    const s2 = cross(f.c[0] - f.b[0], f.c[1] - f.b[1], q[0] - f.b[0], q[1] - f.b[1]);
    const s3 = cross(f.a[0] - f.c[0], f.a[1] - f.c[1], q[0] - f.c[0], q[1] - f.c[1]);
    if (s1 <= 0 && s2 <= 0 && s3 <= 0) best = f.y;
  }
  return best;
}

/** One directed edge of a downward face on a plan line, as an interval of its place `t`. */
interface LineEdge {
  t0: number;
  t1: number;
  k: 1 | -1;
  node: number;
}

/** A boundary stretch, oriented so the solid lies on its left (counter-clockwise round the solid). */
interface Seg {
  a: P2;
  b: P2;
  node: number;
}

/**
 * The outline of the union of the downward faces `tris` (node index, three plan points each, every
 * one counter-clockwise in (x, z)): per plan line, the faces' directed edges summed along it by one
 * sweep; where the sum is not zero a face starts or ends, and edges two faces share cancel. A stretch
 * goes to the lowest node index among the edges over it. Sorted, so the order of `tris` is not read.
 */
function outline(tris: ReadonlyArray<{ node: number; p: readonly [P2, P2, P2] }>): Seg[] {
  const lines = new Map<string, { edges: LineEdge[]; at: Map<number, P2>; alongX: boolean }>();
  for (const { node, p } of tris) {
    for (let j = 0; j < 3; j++) {
      const a = p[j] as P2;
      const b = p[(j + 1) % 3] as P2;
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const l = planLine(a[0], a[1], b[0], b[1]);
      const alongX = l.dx !== 0;
      const ta = alongX ? a[0] : a[1];
      const tb = alongX ? b[0] : b[1];
      let line = lines.get(l.key);
      if (!line) {
        line = { edges: [], at: new Map(), alongX };
        lines.set(l.key, line);
      }
      line.at.set(ta, a);
      line.at.set(tb, b);
      line.edges.push(ta < tb ? { t0: ta, t1: tb, k: 1, node } : { t0: tb, t1: ta, k: -1, node });
    }
  }
  const out: Seg[] = [];
  for (const key of [...lines.keys()].sort()) {
    const line = lines.get(key);
    if (!line) continue;
    const pieces: Array<{ t0: number; t1: number; s: number; node: number }> = [];
    sweep(line.edges, (t0, t1, on) => {
      let s = 0;
      let node = Infinity;
      for (const e of on) {
        s += e.k;
        if (e.node < node) node = e.node;
      }
      if (s === 0) return;
      const sign = s > 0 ? 1 : -1;
      const last = pieces[pieces.length - 1];
      if (last && last.t1 === t0 && last.s === sign && last.node === node) last.t1 = t1;
      else pieces.push({ t0, t1, s: sign, node });
    });
    for (const pc of pieces) {
      const a = line.at.get(pc.t0) as P2;
      const b = line.at.get(pc.t1) as P2;
      out.push(pc.s > 0 ? { a, b, node: pc.node } : { a: b, b: a, node: pc.node });
    }
  }
  return out;
}

/** The downward faces of `n`, projected to plan: horizontal ones at `y` only, or any (`y` undefined). */
function downFaces(
  n: ReplayNode,
  node: number,
  y: number | undefined,
  out: Array<{ node: number; p: readonly [P2, P2, P2] }>,
): void {
  const p = n.positions;
  for (let i = 0; i < n.indices.length; i += 3) {
    const [ia, ib, ic] = [n.indices[i] as number, n.indices[i + 1] as number, n.indices[i + 2] as number];
    if (y !== undefined && (p[ia * 3 + 1] !== y || p[ib * 3 + 1] !== y || p[ic * 3 + 1] !== y)) continue;
    const a: P2 = [p[ia * 3] as number, p[ia * 3 + 2] as number];
    const b: P2 = [p[ib * 3] as number, p[ib * 3 + 2] as number];
    const c: P2 = [p[ic * 3] as number, p[ic * 3 + 2] as number];
    // Outward-wound: a face whose normal points down turns counter-clockwise in (x, z).
    if (cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]) > 0) out.push({ node, p: [a, b, c] });
  }
}

const yRange = (n: ReplayNode): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < n.positions.length; i += 3) {
    const y = n.positions[i] as number;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return [lo, hi];
};

/** A buffer being filled. */
class Buf {
  positions: number[] = [];
  weight: number[] = [];
  caster: number[] = [];
  indices: number[] = [];
  vertex(x: number, y: number, z: number, w: number, caster: number): number {
    this.positions.push(x, y, z);
    this.weight.push(w);
    this.caster.push(caster);
    return this.weight.length - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
  /** A quad `a b c d` as two triangles. */
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }
}

/** The unit outward normal (to the right of a → b) of a segment, and its unit direction. */
function frame(s: Seg): { n: [number, number]; u: [number, number]; len: number } {
  const dx = s.b[0] - s.a[0];
  const dz = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dz);
  return { n: [dz / len, -dx / len], u: [dx / len, dz / len], len };
}

/** `v` scaled to `mm` millimetres, rounded to whole micrometres. */
const scaled = (v: readonly [number, number], mm: number): [number, number] => [
  Math.round(v[0] * mm * 1000),
  Math.round(v[1] * mm * 1000),
];

/** A band along `s`, `mm` wide, outward of it, at height `y`: inner edge weight 1, outer 0. */
function band(buf: Buf, s: Seg, mm: number, y: number, caster: number): void {
  const o = scaled(frame(s).n, mm);
  const a = buf.vertex(s.a[0], y, s.a[1], 1, caster);
  const b = buf.vertex(s.b[0], y, s.b[1], 1, caster);
  const c = buf.vertex(s.b[0] + o[0], y, s.b[1] + o[1], 0, caster);
  const d = buf.vertex(s.a[0] + o[0], y, s.a[1] + o[1], 0, caster);
  buf.quad(a, b, c, d);
}

/** The plan point half a band out from a segment's midpoint: where its receiving face is read. */
function probe(s: Seg, mm: number): P2 {
  const o = scaled(frame(s).n, mm / 2);
  return [Math.round((s.a[0] + s.b[0]) / 2) + o[0], Math.round((s.a[1] + s.b[1]) / 2) + o[1]];
}

/** The most fan triangles an outside corner takes (a quarter turn takes four). */
const MAX_FAN = 8;

/**
 * The contact shadows of a replay's nodes (`ReplayPayload.nodes`; `ground`, its ground plane, which
 * receives under the lowest storey). Pure: the same nodes give the same bands, byte for byte.
 */
export function contactShadows(nodes: readonly ReplayNode[], ground?: { y: number }): ContactShadows {
  const counts = { edges: 0, convex: 0, concave: 0, furniture: 0, fenceSides: 0, stairEdges: 0, triangles: 0 };
  const casters: string[][] = [];
  const layers: ShadowLayer[] = [];
  const levels = [...new Set(nodes.map((n) => levelOf(n.key)))].sort((a, b) => a - b);
  const lowest = levels[0];
  const lift = CONTACT_SHADOW.liftMm * 1000;
  for (const level of levels) {
    const here = nodes.map((n, i) => [n, i] as const).filter(([n]) => levelOf(n.key) === level);
    const faces: Receiver[] = [];
    for (const [n] of here) if (n.kind === "floor" || n.kind === "slab" || n.kind === "outdoor") receiversOf(n, faces);
    const groundY = level === lowest ? ground?.y : undefined;
    const at = (q: P2): number | undefined => {
      const y = receive(q, faces, groundY);
      return y === undefined ? undefined : y + lift;
    };
    const foot = new Buf();
    const corner = new Buf();
    const halo = new Buf();

    // The walls' and columns' foot, their outside corners' fans and their inside corners' bands.
    const walls = here.filter(([n]) => n.band !== undefined && (n.kind === "wall" || n.kind === "column"));
    if (walls.length > 0) {
      const caster = casters.push(walls.map(([n]) => n.key)) - 1;
      let e = Infinity;
      for (const [n] of walls) e = Math.min(e, yRange(n)[0]);
      const tris: Array<{ node: number; p: readonly [P2, P2, P2] }> = [];
      for (const [n, i] of walls) downFaces(n, i, e, tris);
      const segs = outline(tris);
      const bandOf = (s: Seg): number => nodes[s.node]?.band ?? 0;
      for (const s of segs) {
        const y = at(probe(s, bandOf(s)));
        if (y === undefined) continue;
        band(foot, s, bandOf(s), y, caster);
        counts.edges++;
      }
      // Corners: a vertex where exactly one stretch ends and one starts.
      const pk = (p: P2): string => `${p[0]},${p[1]}`;
      const ending = new Map<string, Seg[]>();
      const starting = new Map<string, Seg[]>();
      for (const s of segs) {
        ending.set(pk(s.b), [...(ending.get(pk(s.b)) ?? []), s]);
        starting.set(pk(s.a), [...(starting.get(pk(s.a)) ?? []), s]);
      }
      for (const key of [...ending.keys()].sort()) {
        const ins = ending.get(key) ?? [];
        const outs = starting.get(key) ?? [];
        if (ins.length !== 1 || outs.length !== 1) continue;
        const si = ins[0] as Seg;
        const so = outs[0] as Seg;
        const v = si.b;
        const turn = cross(si.b[0] - si.a[0], si.b[1] - si.a[1], so.b[0] - so.a[0], so.b[1] - so.a[1]);
        if (turn === 0) continue;
        const fi = frame(si);
        const fo = frame(so);
        const bi = bandOf(si);
        const bo = bandOf(so);
        if (turn > 0) {
          // Outside corner: a fan from the incoming band's outer edge to the outgoing one's, through
          // each 16-gon direction strictly between their normals (the outline turns less than 180°).
          const dirs: Array<[number, number]> = [];
          for (let k = 0; k < 16; k++) {
            const d: [number, number] = [C16[k] as number, S16[k] as number];
            if (cross(fi.n[0], fi.n[1], d[0], d[1]) > 0 && cross(d[0], d[1], fo.n[0], fo.n[1]) > 0) dirs.push(d);
          }
          dirs.sort((a, b) => -Math.sign(cross(a[0], a[1], b[0], b[1])));
          const ring = [fi.n, ...dirs.slice(0, MAX_FAN - 1), fo.n];
          const mid: [number, number] = [fi.n[0] + fo.n[0], fi.n[1] + fo.n[1]];
          const ml = Math.hypot(mid[0], mid[1]);
          const r = Math.max(bi, bo);
          const q = scaled([mid[0] / ml, mid[1] / ml], r / 2);
          const y = at([v[0] + q[0], v[1] + q[1]]);
          if (y === undefined) continue;
          const c = foot.vertex(v[0], y, v[1], 1, caster);
          const rim = ring.map((d, j) => {
            const o = scaled(d, bi + ((bo - bi) * j) / (ring.length - 1));
            return foot.vertex(v[0] + o[0], y, v[1] + o[1], 0, caster);
          });
          for (let j = 0; j + 1 < rim.length; j++) foot.tri(c, rim[j] as number, rim[j + 1] as number);
          counts.convex++;
        } else {
          // Inside corner: up each of the two faces, from the floor to the lower wall's top.
          const mid: [number, number] = [fi.n[0] + fo.n[0], fi.n[1] + fo.n[1]];
          const ml = Math.hypot(mid[0], mid[1]);
          const q = scaled([mid[0] / ml, mid[1] / ml], Math.max(bi, bo) / 2);
          const y0 = at([v[0] + q[0], v[1] + q[1]]);
          if (y0 === undefined) continue;
          const top = Math.min(yRange(nodes[si.node] as ReplayNode)[1], yRange(nodes[so.node] as ReplayNode)[1]);
          if (top <= y0) continue;
          const strip = (f: ReturnType<typeof frame>, mm: number, back: boolean): void => {
            const off = scaled(f.n, CONTACT_SHADOW.liftMm);
            const along = scaled(f.u, Math.min(mm, f.len / 1000));
            const sx = back ? -along[0] : along[0];
            const sz = back ? -along[1] : along[1];
            const x = v[0] + off[0];
            const z = v[1] + off[1];
            const a = corner.vertex(x, y0, z, 1, caster);
            const b = corner.vertex(x, top, z, 1, caster);
            const c = corner.vertex(x + sx, top, z + sz, 0, caster);
            const d = corner.vertex(x + sx, y0, z + sz, 0, caster);
            corner.quad(a, b, c, d);
          };
          strip(fi, bi, true);
          strip(fo, bo, false);
          counts.concave++;
        }
      }
    }

    // Fences: along both sides of each rail (a panel's board), deduplicated across the rails' heights.
    for (const [n, i] of here) {
      if (n.kind !== "fence" || n.band === undefined) continue;
      const caster = casters.push([n.key]) - 1;
      const ys = [...new Set(n.positions.filter((_, j) => j % 3 === 1))].sort((a, b) => a - b);
      const seen = new Set<string>();
      for (const y of ys) {
        const tris: Array<{ node: number; p: readonly [P2, P2, P2] }> = [];
        downFaces(n, i, y, tris);
        for (const s of outline(tris)) {
          // A rail's side, not a post's or a picket's: longer than twice the band.
          if (frame(s).len <= 2 * n.band * 1000) continue;
          const key = `${s.a[0]},${s.a[1]},${s.b[0]},${s.b[1]}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const yy = at(probe(s, n.band));
          if (yy === undefined) continue;
          band(foot, s, n.band, yy, caster);
          counts.fenceSides++;
        }
      }
    }

    // Stairs: round the plan of each flight's stringers.
    for (const [n, i] of here) {
      if (n.kind !== "stair" || n.band === undefined) continue;
      const caster = casters.push([n.key]) - 1;
      const tris: Array<{ node: number; p: readonly [P2, P2, P2] }> = [];
      downFaces(n, i, undefined, tris);
      for (const s of outline(tris)) {
        const y = at(probe(s, n.band));
        if (y === undefined) continue;
        band(foot, s, n.band, y, caster);
        counts.stairEdges++;
      }
    }

    // Furniture: a ring round each standing piece's footprint.
    for (const [n] of here) {
      if (n.kind !== "furniture" || n.band === undefined || n.positions.length === 0) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let j = 0; j < n.positions.length; j += 3) {
        const x = n.positions[j] as number;
        const z = n.positions[j + 2] as number;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      const y = at([Math.round((x0 + x1) / 2), Math.round((z0 + z1) / 2)]);
      if (y === undefined) continue;
      const caster = casters.push([n.key]) - 1;
      const h = n.band * 1000;
      const inner: P2[] = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ];
      const outer: P2[] = [
        [x0 - h, z0 - h],
        [x1 + h, z0 - h],
        [x1 + h, z1 + h],
        [x0 - h, z1 + h],
      ];
      const iv = inner.map((p) => halo.vertex(p[0], y, p[1], 1, caster));
      const ov = outer.map((p) => halo.vertex(p[0], y, p[1], 0, caster));
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4;
        halo.quad(iv[j] as number, iv[k] as number, ov[k] as number, ov[j] as number);
      }
      counts.furniture++;
    }

    for (const [cls, buf] of [
      ["foot", foot],
      ["corner", corner],
      ["halo", halo],
    ] as const) {
      if (buf.indices.length === 0) continue;
      counts.triangles += buf.indices.length / 3;
      layers.push({ level, cls, ...buf });
    }
  }
  return { layers, casters, counts };
}
