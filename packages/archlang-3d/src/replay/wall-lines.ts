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
 * The faces two prisms share are left out of what is drawn (`wallFaces`): drawn, they leak through
 * a flat face seen at a grazing angle along the very seams the outline no longer draws. Inside one
 * node (a lintel's end on its jamb) always, since a node rises as one piece. Between two nodes (a
 * stem's end on the wall it meets) only once every node whose faces meet theirs, directly or through
 * others (their `group`), stands at full height: the replay raises each node on its own, so until
 * then each draws its own faces there and is a closed solid by itself (`FaceFix`'s `alone` and
 * `joined`; `mount.ts` picks one per frame). The outline is read off the faces of the finished
 * storey (`wallOutline`).
 *
 * Each line goes to one node whose face it bounds: the last of them the replay raises (`rank`), so
 * a line where two walls meet rises with the second, and while they rise it never stands above
 * the corner it marks (the first is at least as far up). The walls rise in their build order, so
 * their ranks are that order (`ReplayEvent.rank`).
 *
 * Coordinates are integer micrometres (Mesh3D's contract): every comparison is exact (a product too
 * large for a double goes through `BigInt`, and so does the 30° test), every key is built from
 * integers, and every list is sorted before it is read, so the result depends on no triangle order
 * and no `Map` or `Set` iteration order. The work is a sort and a sweep per plane and per line,
 * never a comparison of every face with every other.
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
 * Whether two vertical faces meet closer to flat than 30° (`EdgesGeometry`'s threshold): their plan
 * lines' directions `p`, `q` (integers), each face's facing `fp`, `fq` (±1, its normal is its
 * direction turned a quarter counter-clockwise, times its facing). The angle θ between the normals
 * is under 30° when cos θ > √3/2: with `d` the dot and `c` the cross product of `p` and `q`, and
 * `s = fp·fq·d`, that is `s > 0` and `4s² > 3(d² + c²)`, so `s² > 3c²`. In integers, exactly. (On
 * integer directions θ is never exactly 30°: `d² = 3c²` has no solution but 0.)
 */
export function nearlyFlat(
  p: readonly [number, number],
  q: readonly [number, number],
  fp: number,
  fq: number,
): boolean {
  const d = BigInt(p[0]) * BigInt(q[0]) + BigInt(p[1]) * BigInt(q[1]);
  const c = BigInt(p[0]) * BigInt(q[1]) - BigInt(p[1]) * BigInt(q[0]);
  const s = fp * fq > 0 ? d : -d;
  return s > 0n && s * s > 3n * c * c;
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
  /** The nodes whose own edges there do not cancel (ascending): the line may go to any of them. */
  nodes: number[];
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
  let n = 0;
  for (let i = 0; i < s.length; i++) if (i === 0 || s[i] !== s[n - 1]) s[n++] = s[i] as number;
  s.length = n;
  return s;
};

/** The least and the greatest of `xs` (never spread into `Math.min`: a list can be long). */
function extent(xs: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return [lo, hi];
}

/**
 * The node a line goes to among `nodes` (node indices): the greatest `rank`, the lowest index among
 * equal ranks. With no ranks, the lowest index.
 */
function lastRaised(nodes: Iterable<number>, rank: readonly number[] | undefined): number {
  let best = -1;
  for (const n of nodes) {
    if (best < 0) best = n;
    else {
      const rn = rank?.[n] ?? 0;
      const rb = rank?.[best] ?? 0;
      if (rn > rb || (rn === rb && n < best)) best = n;
    }
  }
  return best;
}

/** The indices of the nodes this module draws, storey by storey (a key's `L<level>/` prefix), storeys in key order. */
function byStorey(nodes: readonly LineSource[]): number[][] {
  const storeys = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (!takesWallLines(n)) return;
    const level = /^L(-?\d+)\//.exec(n.key)?.[1] ?? "";
    const members = storeys.get(level);
    if (members) members.push(i);
    else storeys.set(level, [i]);
  });
  return sortedKeys(storeys).map((k) => storeys.get(k) ?? []);
}

/**
 * The outlines of every standing wall and column of `nodes`, storey by storey (a node's storey is
 * its key's `L<level>/` prefix): for node `i`, `out[i]` is its segments as flat `[x, y, z, x, y, z, …]`
 * in µm (sorted), or `undefined` for a node this does not outline (`takesWallLines`), which keeps
 * its own outline. Read off the faces of the finished storey (`wallOutline`); `rank` as there.
 */
export function wallLines(nodes: readonly LineSource[], rank?: readonly number[]): Array<number[] | undefined> {
  return wallOutline(nodes, rank).lines;
}

/**
 * The walls' and columns' faces as the 3D preview draws them (`wallFaces`) and the outline of those
 * faces (`wallLines`) once every node stands at full height: the outline is read off the drawn
 * faces, where no inner face remains, so the facing of every face a line bounds is the one seen (it
 * decides the 30° test). `rank[i]` is node `i`'s place in the order the replay raises the nodes: a
 * line where several nodes' faces meet goes to the last raised (greatest rank; the lowest index
 * among equals, and without `rank`).
 */
export function wallOutline(
  nodes: readonly LineSource[],
  rank?: readonly number[],
): {
  faces: Array<FaceFix | undefined>;
  lines: Array<number[] | undefined>;
} {
  const faces = wallFaces(nodes);
  const drawn = nodes.map((n, i) => (takesWallLines(n) ? { ...n, ...withFaces(n, faces[i]) } : n));
  return { faces, lines: linesOf(drawn, rank) };
}

function linesOf(nodes: readonly LineSource[], rank: readonly number[] | undefined): Array<number[] | undefined> {
  const out: Array<number[] | undefined> = nodes.map((n) => (takesWallLines(n) ? [] : undefined));
  const segs: Seg[][] = nodes.map(() => []);
  for (const members of byStorey(nodes)) storeyLines(nodes, members, segs, rank);
  segs.forEach((list, i) => {
    if (!out[i]) return;
    const sorted = list
      .map((s): Seg => (lexLess(s.slice(0, 3), s.slice(3)) <= 0 ? s : [s[3], s[4], s[5], s[0], s[1], s[2]]))
      .sort(lexLess);
    out[i] = sorted.flat();
  });
  return out;
}

/**
 * The stretches between consecutive places of `items` (each an interval `[t0, t1]`, t0 < t1) and
 * the items over each, by one sweep along the line: `visit(t0, t1, on)` for every stretch some item
 * covers, in order (`on` in the order the items start, then their order in `items`).
 */
function sweep<T extends { t0: number; t1: number }>(
  items: readonly T[],
  visit: (t0: number, t1: number, on: readonly T[]) => void,
): void {
  const byStart = items.map((it, i) => [it, i] as const).sort((a, b) => a[0].t0 - b[0].t0 || a[1] - b[1]);
  const ts = sortedUnique(items.flatMap((e) => [e.t0, e.t1]));
  let next = 0;
  let on: T[] = [];
  for (let j = 0; j + 1 < ts.length; j++) {
    const t0 = ts[j] as number;
    const t1 = ts[j + 1] as number;
    // Every place an item starts or ends is in `ts`, so an item on at t0 covers all of [t0, t1].
    if (on.some((e) => e.t1 <= t0)) on = on.filter((e) => e.t1 > t0);
    while (next < byStart.length && (byStart[next]?.[0].t0 as number) <= t0) on.push(byStart[next++]?.[0] as T);
    if (on.length > 0) visit(t0, t1, on);
  }
}

function storeyLines(
  nodes: readonly LineSource[],
  members: readonly number[],
  segs: Seg[][],
  rank: readonly number[] | undefined,
): void {
  /** Edges by `<plane>|<line>`: the sum is taken in one plane at a time. */
  const buckets = new Map<string, { line: string; plane: string; edges: Edge[] }>();
  const lines = new Map<string, LineAt>();
  /** A vertical plane's plan direction, `[dx, dz]` (coprime integers; the frame's +facing turns it a quarter counter-clockwise). */
  const dirs = new Map<string, [number, number]>();
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
    const key = `${plane}|${a[0]},${a[1]},${a[2]}|${b[0]},${b[1]},${b[2]}`;
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
      if (!dirs.has(plane)) dirs.set(plane, [pl.dx, pl.dz]);
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
    // The common case, two faces of one plane meeting along one edge: they cancel.
    const [e0, e1] = edges as [Edge, Edge | undefined];
    if (edges.length === 2 && e1 && e0.t0 === e1.t0 && e0.t1 === e1.t1 && e0.k !== e1.k) continue;
    sweep(edges, (t0, t1, on) => {
      let m = 0;
      for (const e of on) m += e.k;
      if (m === 0) return;
      const nets = new Map<number, number>();
      for (const e of on) nets.set(e.node, (nets.get(e.node) ?? 0) + e.k);
      const by = sortedUnique(on.filter((e) => nets.get(e.node) !== 0).map((e) => e.node));
      const fs = sortedUnique(on.filter((e) => e.k === Math.sign(m)).map((e) => e.f));
      const b: Bound = { t0, t1, nodes: by, plane, f: fs.length === 1 ? (fs[0] as number) : 0 };
      const list = bounds.get(line);
      if (list) list.push(b);
      else bounds.set(line, [b]);
    });
  }

  // Each line once, whatever planes bound it; a vertical line between two nearly flat faces, none.
  for (const line of sortedKeys(bounds)) {
    const list = bounds.get(line) as Bound[];
    const at = lines.get(line) as LineAt;
    const runs: Array<{ t0: number; t1: number; node: number }> = [];
    sweep(list, (t0, t1, on) => {
      if (at.kind === "vertical" && on.length === 2) {
        const [p, q] = on as [Bound, Bound];
        const dp = dirs.get(p.plane);
        const dq = dirs.get(q.plane);
        if (dp && dq && p.f !== 0 && q.f !== 0 && nearlyFlat(dp, dq, p.f, q.f)) return;
      }
      const node = lastRaised(
        on.flatMap((b) => b.nodes),
        rank,
      );
      const last = runs[runs.length - 1];
      if (last && last.t1 === t0 && last.node === node) last.t1 = t1;
      else runs.push({ t0, t1, node });
    });
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
    (segs[lastRaised(by, rank)] as Seg[]).push([...a, ...b] as Seg);
  }
}

/**
 * What the 3D preview draws of a wall or column node's faces in place of its own (`withFaces`,
 * `faceParts`): `hide`, its triangles not to draw (numbers into `indices` / 3, ascending), and
 * triangles to draw instead, flat `[x, y, z]` in µm, three corners each, counter-clockwise seen
 * from outside: `add` always; then `alone` while some node of its `group` is not standing at full
 * height, and `joined` once every one is. `alone` is the node's own faces where they meet another
 * node's; `joined` leaves out the faces they share, the finished storey's.
 *
 * `group`: the nodes whose faces meet, directly or through others, are one group, named by its
 * lowest node index; -1 for a node whose faces meet no other's (it has no `alone` or `joined`).
 * Switching a whole group at once keeps every frame closed: a group all `alone` is closed solids
 * each by itself, a group all `joined` is the closed surface of their union, and no face a node
 * leaves out is ever left to a neighbour that is not there.
 */
export interface FaceFix {
  hide: number[];
  add: number[];
  alone: number[];
  joined: number[];
  group: number;
}

/**
 * The walls' inner faces left out (card RM8.1). Where two prisms meet, each one's face there lies
 * inside the other (a lintel's end on its jamb, a stem's end on the wall it meets): never seen, but
 * drawn it leaks: every face is pushed back in depth by its own slope (the outline's polygon offset,
 * `mount.ts`), so where a flat face is seen at a grazing angle the inner face behind it wins the
 * depth test near their common edge, a faint seam along the very line the outline no longer draws.
 *
 * In each vertical plane where faces of the two facings overlap (and only there), the plane's
 * triangles are replaced by its visible part: on the grid of the plane's own corners, a cell is
 * drawn, facing as the faces wind there, when their winding (the vertical edges' running sum,
 * exact) is not zero; inner cells (the two facings cancel) are not. A node's winding is taken on its
 * own and summed: a cell only one node winds is that node's (`add`), and inside one node its own
 * inner faces cancel, since a node rises as one piece. A cell two or more nodes wind is shared: each
 * winds its own face there (`alone`: the node is a closed solid by itself, as each may stand at
 * another height in the replay), and the cell as they wind it together goes to the lowest-indexed
 * node whose own winding has its facing (`joined`; none when they cancel). The nodes sharing a cell
 * are one `group`. The surface seen is the same; only what lies inside the walls is gone. A plane with no such overlap (every outer face of a
 * wall run, every top) keeps its triangles.
 *
 * The overlap test is a sweep along the plane and the grid a sweep across it, keeping only the nodes
 * whose winding is not zero, so the work grows with the plane's cells and the nodes over each, not
 * with every pair of faces. Deterministic as `wallLines` is.
 */
export function wallFaces(nodes: readonly LineSource[]): Array<FaceFix | undefined> {
  const out: Array<FaceFix | undefined> = nodes.map((n) =>
    takesWallLines(n) ? { hide: [], add: [], alone: [], joined: [], group: -1 } : undefined,
  );
  // Union-find over the nodes that share a cell; a group is named by its lowest index.
  const root = nodes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (root[r] !== r) r = root[r] as number;
    while (root[i] !== r) [i, root[i]] = [root[i] as number, r];
    return r;
  };
  const join = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra < rb) root[rb] = ra;
    else if (rb < ra) root[ra] = rb;
  };
  const shared = new Set<number>();
  for (const members of byStorey(nodes)) storeyFaces(nodes, members, out, join, shared);
  out.forEach((f, i) => {
    if (!f) return;
    f.hide.sort((a, b) => a - b);
    if (shared.has(i)) f.group = find(i);
  });
  return out;
}

/**
 * The node's faces as drawn, in one position buffer: its own positions, then `add`'s, `alone`'s and
 * `joined`'s corners; `base` (its own triangles but the hidden ones, and `add`'s), `alone` and
 * `joined` index into it.
 */
export function faceParts(
  n: LineSource,
  fix: FaceFix | undefined,
): { positions: readonly number[]; base: number[]; alone: number[]; joined: number[] } {
  if (!fix) return { positions: n.positions, base: [...n.indices], alone: [], joined: [] };
  const hidden = new Set(fix.hide);
  const base: number[] = [];
  for (let i = 0; i + 2 < n.indices.length; i += 3) {
    if (!hidden.has(i / 3)) base.push(n.indices[i] as number, n.indices[i + 1] as number, n.indices[i + 2] as number);
  }
  let v = n.positions.length / 3;
  const run = (flat: readonly number[], to: number[] = []): number[] => {
    for (let k = 0; k < flat.length / 3; k++) to.push(v++);
    return to;
  };
  run(fix.add, base);
  const alone = run(fix.alone);
  const joined = run(fix.joined);
  return { positions: n.positions.concat(fix.add, fix.alone, fix.joined), base, alone, joined };
}

/**
 * The node's positions and triangles with its `FaceFix` applied, as drawn: once its whole `group`
 * stands at full height (`"joined"`, the finished storey), or before (`"alone"`).
 */
export function withFaces(
  n: LineSource,
  fix: FaceFix | undefined,
  mode: "joined" | "alone" = "joined",
): { positions: readonly number[]; indices: readonly number[] } {
  if (!fix) return { positions: n.positions, indices: n.indices };
  const parts = faceParts(n, fix);
  return { positions: parts.positions, indices: parts.base.concat(mode === "joined" ? parts.joined : parts.alone) };
}

/** A triangle of a vertical plane: its node, its number in the node's `indices`, corners, facing, places along. */
interface PlaneTri {
  node: number;
  tri: number;
  p: number[][];
  f: number;
  s: number[];
}

/**
 * Whether faces of the two facings overlap in the plane (their boxes share some area): a sweep
 * along it, each face met against the faces of the other facing still open there.
 */
function contested(tris: readonly PlaneTri[]): boolean {
  const boxes = tris.map((t) => {
    const [s0, s1] = extent(t.s);
    const [y0, y1] = extent(t.p.map((q) => q[1] as number));
    return { s0, s1, y0, y1, f: t.f };
  });
  boxes.sort((a, b) => a.s0 - b.s0);
  let up: typeof boxes = [];
  let down: typeof boxes = [];
  for (const b of boxes) {
    // Still open: reaching past where this one starts (a face has area, so it ends after it starts).
    if (up.some((o) => o.s1 <= b.s0)) up = up.filter((o) => o.s1 > b.s0);
    if (down.some((o) => o.s1 <= b.s0)) down = down.filter((o) => o.s1 > b.s0);
    const other = b.f > 0 ? down : up;
    if (other.some((o) => Math.min(o.y1, b.y1) > Math.max(o.y0, b.y0))) return true;
    (b.f > 0 ? up : down).push(b);
  }
  return false;
}

function storeyFaces(
  nodes: readonly LineSource[],
  members: readonly number[],
  out: Array<FaceFix | undefined>,
  join: (a: number, b: number) => void,
  shared: Set<number>,
): void {
  const planes = new Map<string, { pl: PlanLine; tris: PlaneTri[] }>();
  for (const ni of members) {
    const n = nodes[ni] as LineSource;
    const P = (v: number): number[] => [
      Math.round(n.positions[v * 3] as number),
      Math.round(n.positions[v * 3 + 1] as number),
      Math.round(n.positions[v * 3 + 2] as number),
    ];
    for (let i = 0; i + 2 < n.indices.length; i += 3) {
      const a = P(n.indices[i] as number);
      const b = P(n.indices[i + 1] as number);
      const c = P(n.indices[i + 2] as number);
      const ax = a[0] as number;
      const ay = a[1] as number;
      const az = a[2] as number;
      if (ay === b[1] && ay === c[1]) continue;
      if (det((b[0] as number) - ax, (b[2] as number) - az, (c[0] as number) - ax, (c[2] as number) - az) !== 0)
        continue;
      const far = a[0] !== b[0] || a[2] !== b[2] ? b : c;
      if (far[0] === ax && far[2] === az) continue;
      const pl = planLine(ax, az, far[0] as number, far[2] as number);
      const along = (p: number[]): number => (pl.dx !== 0 ? (p[0] as number) : (p[2] as number));
      const s = [along(a), along(b), along(c)];
      const turn = det(
        (s[1] as number) - (s[0] as number),
        (b[1] as number) - ay,
        (s[2] as number) - (s[0] as number),
        (c[1] as number) - ay,
      );
      if (turn === 0) continue;
      const key = `V${pl.key}`;
      const t: PlaneTri = { node: ni, tri: i / 3, p: [a, b, c], f: turn > 0 ? 1 : -1, s };
      const plane = planes.get(key);
      if (plane) plane.tris.push(t);
      else planes.set(key, { pl, tris: [t] });
    }
  }

  for (const key of sortedKeys(planes)) {
    const { tris } = planes.get(key) as { pl: PlanLine; tris: PlaneTri[] };
    if (!contested(tris)) continue;

    // The plane's grid: every place along it and every height its corners have.
    const S = sortedUnique(tris.flatMap((t) => t.s));
    const Y = sortedUnique(tris.flatMap((t) => t.p.map((q) => q[1] as number)));
    const where = new Map<number, number[]>();
    for (const t of tris) for (let k = 0; k < 3; k++) where.set(t.s[k] as number, t.p[k] as number[]);
    const sAt = new Map(S.map((s, i) => [s, i] as const));
    const yAt = new Map(Y.map((y, j) => [y, j] as const));
    const ny = Y.length - 1;
    // The vertical edges on each line of the grid: whose, which rows, and +1 up, −1 down.
    const steps: Array<Array<[node: number, j0: number, j1: number, up: number]>> = S.map(() => []);
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const p = t.p[k] as number[];
        const q = t.p[(k + 1) % 3] as number[];
        if (p[0] !== q[0] || p[2] !== q[2] || p[1] === q[1]) continue;
        const i = sAt.get(t.s[k] as number) as number;
        const lo = Math.min(p[1] as number, q[1] as number);
        const hi = Math.max(p[1] as number, q[1] as number);
        (steps[i] as Array<[number, number, number, number]>).push([
          t.node,
          yAt.get(lo) as number,
          yAt.get(hi) as number,
          (q[1] as number) > (p[1] as number) ? 1 : -1,
        ]);
      }
    }
    // Sweep along the plane: crossing a line, a node's winding falls by its upward edges there.
    // Only the nodes whose winding is not zero somewhere are kept (`live`, ascending).
    const wind = new Map<number, Int32Array>();
    const nonzero = new Map<number, number>();
    let live: number[] = [];
    const total = new Int32Array(ny);
    const cell = (to: number[], s0: number, s1: number, j: number, facing: number): void => {
      const y0 = Y[j] as number;
      const y1 = Y[j + 1] as number;
      const at = (s: number, y: number): number[] => {
        const q = where.get(s) as number[];
        return [q[0] as number, y, q[2] as number];
      };
      const [p00, p10, p11, p01] = [at(s0, y0), at(s1, y0), at(s1, y1), at(s0, y1)];
      // Counter-clockwise along the plane and up faces the plane's + side.
      if (facing > 0) to.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      else to.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
    };
    for (let i = 0; i + 1 < S.length; i++) {
      const here = steps[i] as Array<[number, number, number, number]>;
      for (const [o, j0, j1, d] of here) {
        let w = wind.get(o);
        if (!w) {
          w = new Int32Array(ny);
          wind.set(o, w);
        }
        let nz = nonzero.get(o) ?? 0;
        for (let j = j0; j < j1; j++) {
          const was = w[j] as number;
          const now = was - d;
          w[j] = now;
          total[j] = (total[j] as number) - d;
          if (was === 0) nz++;
          else if (now === 0) nz--;
        }
        nonzero.set(o, nz);
      }
      if (here.length > 0) {
        for (const o of [...wind.keys()]) {
          if (nonzero.get(o) === 0) {
            wind.delete(o);
            nonzero.delete(o);
          }
        }
        live = [...wind.keys()].sort((a, b) => a - b);
      }
      const s0 = S[i] as number;
      const s1 = S[i + 1] as number;
      for (let j = 0; j < ny; j++) {
        const over = live.filter((o) => (wind.get(o) as Int32Array)[j] !== 0);
        if (over.length === 0) continue;
        if (over.length === 1) {
          const o = over[0] as number;
          cell((out[o] as FaceFix).add, s0, s1, j, (wind.get(o) as Int32Array)[j] as number);
          continue;
        }
        for (const o of over) {
          cell((out[o] as FaceFix).alone, s0, s1, j, (wind.get(o) as Int32Array)[j] as number);
          shared.add(o);
          join(o, over[0] as number);
        }
        const sum = total[j] as number;
        if (sum === 0) continue;
        const owner = over.find((o) => Math.sign((wind.get(o) as Int32Array)[j] as number) === Math.sign(sum));
        cell((out[owner as number] as FaceFix).joined, s0, s1, j, sum);
      }
    }
    for (const t of tris) (out[t.node] as FaceFix).hide.push(t.tri);
  }
}
