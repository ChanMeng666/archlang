/**
 * The walls' outlines in the 3D preview (product-roadmap card RM8.1), browser-safe and pure: a line
 * is drawn only where the visible surface of a storey's walls really turns.
 *
 * Why not three.js's `EdgesGeometry` per node: every wall piece, sill and lintel is its own closed
 * prism (`mesh/build.ts`), so a per-node outline draws each prism's own corners, also where two
 * prisms' outer faces are one flat surface: a full-height line beside every door and window (only
 * the reveal between sill and head is a real corner), two lines on the flat back of a T junction, a
 * seam one wall thickness from an L corner of two walls, a line at every joint of collinear walls,
 * and a cut across the wall top at each of them. The geometry is right; only the outline was.
 *
 * How (per storey, across every standing wall and column node): each triangle lies in a vertical
 * plane (a wall face: its plan line) or a horizontal one (a top or a bottom). In a plane, sum the
 * triangles' directed edges along each line: across a line, the winding of the plane's faces jumps
 * by that sum, so where it is not zero a face starts or ends there, and where two coplanar faces
 * meet (the face above an opening, the back of a T, a joint) or an inner face lies against another
 * (a lintel's end on a jamb), the edges cancel and nothing is drawn. A line two planes share (a
 * corner) is drawn once. Where two vertical planes meet at less than 30° (the chords of a curved
 * wall) nothing is drawn, as `EdgesGeometry`'s 30° threshold did. The true inside corners at a T or
 * an X junction stay (README §6.3 of the product roadmap).
 *
 * Each line goes to one node whose face it bounds (the lowest node index among those whose edges
 * make it), so the wall-by-wall replay still raises a wall with its own lines. Coordinates are
 * integer micrometres (Mesh3D's contract): every comparison is exact (a product too large for a
 * double goes through `BigInt`), every key is built from integers, and every list is sorted before
 * it is read, so the result depends on no triangle order and no `Map` or `Set` iteration order.
 */

/** A node as the replay carries it (`ReplayNode`): flat `[x, y, z, …]` in µm, Y up, and triangles. */
export interface LineSource {
  key: string;
  kind: string;
  part?: string;
  positions: readonly number[];
  indices: readonly number[];
}

/** Whether `wallLines` outlines this node: a standing wall (a demolished one is a ghost) or a column. */
export function takesWallLines(n: { kind: string; part?: string }): boolean {
  return (n.kind === "wall" && n.part === undefined) || n.kind === "column";
}

/** Two vertical faces meeting closer to flat than this draw no line (`EdgesGeometry`'s 30°). */
const SMOOTH_DOT = Math.cos((30 * Math.PI) / 180);

/** Below this, a product of two coordinates is exact in a double, and so is the difference of two. */
const EXACT = 2 ** 26;

/** `a·d − b·c`, exactly in sign (and in value when it fits a double). */
function det(a: number, b: number, c: number, d: number): number {
  if (Math.abs(a) < EXACT && Math.abs(b) < EXACT && Math.abs(c) < EXACT && Math.abs(d) < EXACT) return a * d - b * c;
  const r = BigInt(a) * BigInt(d) - BigInt(b) * BigInt(c);
  return r > 0n ? 1 : r < 0n ? -1 : 0;
}

/** `a·d − b·c` as an exact decimal string (a key). */
function detKey(a: number, b: number, c: number, d: number): string {
  if (Math.abs(a) < EXACT && Math.abs(b) < EXACT && Math.abs(c) < EXACT && Math.abs(d) < EXACT)
    return String(a * d - b * c);
  return (BigInt(a) * BigInt(d) - BigInt(b) * BigInt(c)).toString();
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/**
 * The plan line through two distinct plan points `(x, z)`: its direction reduced to coprime
 * integers pointing +x (or +z when it runs along z), and a key exact for the line itself. A point's
 * place along it is `t` (its x, or its z when the line runs along z), which grows along the direction.
 */
interface PlanLine {
  dx: number;
  dz: number;
  key: string;
}
function planLine(x0: number, z0: number, x1: number, z1: number): PlanLine {
  let dx = x1 - x0;
  let dz = z1 - z0;
  const g = gcd(dx, dz);
  dx /= g;
  dz /= g;
  if (dx < 0 || (dx === 0 && dz < 0)) {
    dx = 0 - dx;
    dz = 0 - dz;
  }
  return { dx, dz, key: `${dx},${dz},${detKey(dx, dz, x0, z0)}` };
}

/** One directed edge on a line, as an interval `[t0, t1]` (t0 < t1) and its direction `k`. */
interface Edge {
  t0: number;
  t1: number;
  k: 1 | -1;
  node: number;
  /** The facing of its triangle in its plane's frame (±1; vertical planes only, else 0). */
  f: number;
}

/** Where a line lies, to turn a place `t` on it back into a point. */
type LineAt =
  | { kind: "vertical"; x: number; z: number }
  | { kind: "horizontal"; y: number; alongX: boolean; other: Map<number, number> };

/** A stretch of a line where one plane's faces start or end. */
interface Bound {
  t0: number;
  t1: number;
  node: number;
  plane: string;
  /** The visible face's facing in its plane's frame (±1), 0 when its edges disagree. */
  f: number;
}

type Seg = [number, number, number, number, number, number];

const lexLess = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
};

const sortedKeys = <V>(m: Map<string, V>): string[] => [...m.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const sortedUnique = (xs: number[]): number[] => {
  const s = [...xs].sort((a, b) => a - b);
  return s.filter((x, i) => i === 0 || x !== s[i - 1]);
};

/**
 * The outlines of every standing wall and column of `nodes`, storey by storey (a node's storey is
 * its key's `L<level>/` prefix): for node `i`, `out[i]` is its segments as flat `[x, y, z, x, y, z, …]`
 * in µm (sorted), or `undefined` for a node this does not outline (`takesWallLines`), which keeps
 * its own outline.
 */
export function wallLines(nodes: readonly LineSource[]): Array<number[] | undefined> {
  const out: Array<number[] | undefined> = nodes.map((n) => (takesWallLines(n) ? [] : undefined));
  const storeys = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (!takesWallLines(n)) return;
    const level = /^L(-?\d+)\//.exec(n.key)?.[1] ?? "";
    const members = storeys.get(level);
    if (members) members.push(i);
    else storeys.set(level, [i]);
  });
  const segs: Seg[][] = nodes.map(() => []);
  for (const level of sortedKeys(storeys)) storeyLines(nodes, storeys.get(level) ?? [], segs);
  segs.forEach((list, i) => {
    if (!out[i]) return;
    const sorted = list
      .map((s): Seg => (lexLess(s.slice(0, 3), s.slice(3)) <= 0 ? s : [s[3], s[4], s[5], s[0], s[1], s[2]]))
      .sort(lexLess);
    out[i] = sorted.flat();
  });
  return out;
}

function storeyLines(nodes: readonly LineSource[], members: readonly number[], segs: Seg[][]): void {
  /** Edges by `<plane>|<line>`: the sum is taken in one plane at a time. */
  const buckets = new Map<string, { line: string; plane: string; edges: Edge[] }>();
  const lines = new Map<string, LineAt>();
  /** A vertical plane's unit normal in the plan, `[nx, nz]` (the frame's +facing). */
  const normals = new Map<string, [number, number]>();
  /** A vertical face's slanted edges (a side quad's diagonal): cancelled end to end, in their plane. */
  const pairs = new Map<string, { a: number[]; b: number[]; net: number; nodes: number[] }>();

  const push = (plane: string, line: string, e: Edge): void => {
    const key = `${plane}|${line}`;
    const b = buckets.get(key);
    if (b) b.edges.push(e);
    else buckets.set(key, { line, plane, edges: [e] });
  };
  const pair = (plane: string, p: number[], q: number[], node: number): void => {
    const fwd = lexLess(p, q) < 0;
    const [a, b] = fwd ? [p, q] : [q, p];
    const key = `${plane}|${a.join(",")}|${b.join(",")}`;
    const was = pairs.get(key);
    if (was) {
      was.net += fwd ? 1 : -1;
      was.nodes.push(node);
    } else pairs.set(key, { a, b, net: fwd ? 1 : -1, nodes: [node] });
  };
  /** A horizontal line along plan line `pl` at height `y`; records where its places lie. */
  const horizontal = (y: number, pl: PlanLine, p: number[], q: number[]): string => {
    const key = `h${y}:${pl.key}`;
    let at = lines.get(key);
    if (!at) {
      at = { kind: "horizontal", y, alongX: pl.dx !== 0, other: new Map() };
      lines.set(key, at);
    }
    if (at.kind === "horizontal") {
      for (const r of [p, q]) {
        const [x, , z] = r as [number, number, number];
        if (at.alongX) at.other.set(x, z);
        else at.other.set(z, x);
      }
    }
    return key;
  };
  const along = (pl: PlanLine, p: number[]): number => (pl.dx !== 0 ? (p[0] as number) : (p[2] as number));
  const edge = (t0: number, t1: number, node: number, f: number): Edge =>
    t0 < t1 ? { t0, t1, k: 1, node, f } : { t0: t1, t1: t0, k: -1, node, f };

  for (const ni of members) {
    const n = nodes[ni] as LineSource;
    const P = (v: number): number[] => [
      Math.round(n.positions[v * 3] as number),
      Math.round(n.positions[v * 3 + 1] as number),
      Math.round(n.positions[v * 3 + 2] as number),
    ];
    for (let i = 0; i + 2 < n.indices.length; i += 3) {
      const tri = [P(n.indices[i] as number), P(n.indices[i + 1] as number), P(n.indices[i + 2] as number)];
      const [a, b, c] = tri as [number[], number[], number[]];
      const ax = a[0] as number;
      const ay = a[1] as number;
      const az = a[2] as number;
      const sides: Array<[number[], number[]]> = [
        [a, b],
        [b, c],
        [c, a],
      ];
      if (ay === b[1] && ay === c[1]) {
        // A horizontal face (a top or a bottom); a sliver of no area draws nothing.
        if (det((b[0] as number) - ax, (b[2] as number) - az, (c[0] as number) - ax, (c[2] as number) - az) === 0)
          continue;
        const plane = `H${ay}`;
        for (const [p, q] of sides) {
          if (p[0] === q[0] && p[2] === q[2]) continue;
          const pl = planLine(p[0] as number, p[2] as number, q[0] as number, q[2] as number);
          push(plane, horizontal(ay, pl, p, q), edge(along(pl, p), along(pl, q), ni, 0));
        }
        continue;
      }
      const flatInPlan =
        det((b[0] as number) - ax, (b[2] as number) - az, (c[0] as number) - ax, (c[2] as number) - az) === 0;
      if (!flatInPlan) {
        // Neither vertical nor horizontal: a prism builds none. Outlined whole, as a face of its own.
        for (const [p, q] of sides) (segs[ni] as Seg[]).push([...p, ...q] as Seg);
        continue;
      }
      const far = a[0] !== b[0] || a[2] !== b[2] ? b : c;
      // A vertical sliver of no area (all three corners over one plan point) draws nothing.
      if (far[0] === ax && far[2] === az) continue;
      const pl = planLine(ax, az, far[0] as number, far[2] as number);
      const plane = `V${pl.key}`;
      if (!normals.has(plane)) {
        const len = Math.hypot(pl.dx, pl.dz);
        normals.set(plane, [-pl.dz / len, pl.dx / len]);
      }
      // Facing in the plane's frame (s along the plan line, y up): counter-clockwise is +.
      const s = (p: number[]): number => along(pl, p);
      const turn = det(s(b) - s(a), (b[1] as number) - ay, s(c) - s(a), (c[1] as number) - ay);
      if (turn === 0) continue;
      const f = turn > 0 ? 1 : -1;
      for (const [p, q] of sides) {
        if (p[0] === q[0] && p[2] === q[2]) {
          if (p[1] === q[1]) continue;
          const key = `v${p[0]},${p[2]}`;
          if (!lines.has(key)) lines.set(key, { kind: "vertical", x: p[0] as number, z: p[2] as number });
          push(plane, key, edge(p[1] as number, q[1] as number, ni, f));
        } else if (p[1] === q[1]) {
          push(plane, horizontal(p[1] as number, pl, p, q), edge(along(pl, p), along(pl, q), ni, f));
        } else pair(plane, p, q, ni);
      }
    }
  }

  // In each plane, where a line's edges do not cancel: a face of that plane starts or ends there.
  const bounds = new Map<string, Bound[]>();
  for (const key of sortedKeys(buckets)) {
    const { line, plane, edges } = buckets.get(key) as { line: string; plane: string; edges: Edge[] };
    const ts = sortedUnique(edges.flatMap((e) => [e.t0, e.t1]));
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j] as number;
      const t1 = ts[j + 1] as number;
      const on = edges.filter((e) => e.t0 <= t0 && e.t1 >= t1);
      const m = on.reduce((sum, e) => sum + e.k, 0);
      if (m === 0) continue;
      const nets = new Map<number, number>();
      for (const e of on) nets.set(e.node, (nets.get(e.node) ?? 0) + e.k);
      const node = Math.min(...on.filter((e) => nets.get(e.node) !== 0).map((e) => e.node));
      const fs = sortedUnique(on.filter((e) => e.k === Math.sign(m)).map((e) => e.f));
      const b: Bound = { t0, t1, node, plane, f: fs.length === 1 ? (fs[0] as number) : 0 };
      const list = bounds.get(line);
      if (list) list.push(b);
      else bounds.set(line, [b]);
    }
  }

  // Each line once, whatever planes bound it; a vertical line between two nearly flat faces, none.
  for (const line of sortedKeys(bounds)) {
    const list = bounds.get(line) as Bound[];
    const at = lines.get(line) as LineAt;
    const ts = sortedUnique(list.flatMap((b) => [b.t0, b.t1]));
    const runs: Array<{ t0: number; t1: number; node: number }> = [];
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j] as number;
      const t1 = ts[j + 1] as number;
      const on = list.filter((b) => b.t0 <= t0 && b.t1 >= t1);
      if (on.length === 0) continue;
      if (at.kind === "vertical" && on.length === 2) {
        const [p, q] = on as [Bound, Bound];
        const np = normals.get(p.plane);
        const nq = normals.get(q.plane);
        if (np && nq && p.f !== 0 && q.f !== 0) {
          const dot = p.f * q.f * (np[0] * nq[0] + np[1] * nq[1]);
          if (dot > SMOOTH_DOT) continue;
        }
      }
      const node = Math.min(...on.map((b) => b.node));
      const last = runs[runs.length - 1];
      if (last && last.t1 === t0 && last.node === node) last.t1 = t1;
      else runs.push({ t0, t1, node });
    }
    for (const r of runs) {
      const end = (t: number): [number, number, number] => {
        if (at.kind === "vertical") return [at.x, t, at.z];
        const o = at.other.get(t) as number;
        return at.alongX ? [t, at.y, o] : [o, at.y, t];
      };
      (segs[r.node] as Seg[]).push([...end(r.t0), ...end(r.t1)]);
    }
  }

  for (const key of sortedKeys(pairs)) {
    const { a, b, net, nodes: by } = pairs.get(key) as { a: number[]; b: number[]; net: number; nodes: number[] };
    if (net === 0) continue;
    (segs[Math.min(...by)] as Seg[]).push([...a, ...b] as Seg);
  }
}
