/**
 * The replay's soft contact shadows (product-roadmap card RM8.8; design
 * `docs/plans/product-roadmap/design/visual-language.md` §1), browser-safe and pure: flat bands of
 * translucent black, baked once from the replay's nodes when the replay is mounted, never a shadow
 * map and never a per-frame pass. `mount.ts` draws them and fades each in as its caster finishes
 * rising (`contactFade`); nothing here reads the theme, the time or the camera.
 *
 * Three classes, each one buffer per storey (so at most three draws a storey):
 *   - `foot`: along the foot of the storey's walls and columns, on the floor or the ground beside
 *     them. The bands follow the outline of their bottom faces taken together (the same nodes
 *     `wall-lines.ts` outlines): directed edges summed per plan line, so a joint between two pieces
 *     that meet edge to edge (a sill on its wall, two collinear walls) carries no band. Where two
 *     stretches meet at a turn sharper than 30°: at an outside corner a fan of the 16-gon's
 *     directions (`C16`) closes the gap between the two bands, and at an inside corner the two bands
 *     overlap, darker, as an inside corner is. Where they meet flatter than 30° (the chords of a
 *     curved wall, `nearlyFlat`) the two bands are mitred instead: no fan, no overlap, no corner.
 *     Where another stretch faces one across a gap narrower than two bands (a slot), each band takes
 *     half the gap (`narrowed`), so neither crosses it into the solid beyond. The
 *     same buffer holds each fence run's bands (both sides of its rails) and each stair's (round the
 *     plan of its stringers).
 *   - `corner`: up each inside corner sharper than 30°, a vertical band on each of the two wall
 *     faces, from the floor to the lower of the two walls' tops, narrowed to stop at a jamb on the
 *     face nearer the corner than the band's width (a vertical line of `lines`, the walls' outline).
 *   - `halo`: round each standing piece of furniture's footprint (`ReplayNode.band`: a hung piece and
 *     a flat one, lower than its band, cast none).
 * Floors, outdoor surfaces, slabs, flat furniture (a rug, `ReplayNode.flat`) and the ground plane
 * only receive. Each band lies `CONTACT_SHADOW.liftMm` above the highest receiving face under any of
 * its probes (its middle and both ends, half its width out; a fan's at its rim; a halo's at each side
 * and under the piece), so it is never under a face it overlaps and floats at most a step (a floor's
 * 5 mm finish, a rug) over a lower one. Where no probe finds a face (beside an upper storey's outside
 * wall, over nothing) the band is not drawn: the design's fallback to the storey's floor level would
 * hang it in the air there.
 *
 * What the outline is and is not: where casters overlap (a column set into a wall) the summed edges
 * are not their union's outline. Each stretch is cut where another node's bottom face begins or ends
 * along it, and a piece is banded only when the point 1 mm out from its middle lies in no caster's
 * bottom face, so no band runs inside another caster and the outside is not banded twice. Within one
 * piece that point decides for the whole piece.
 *
 * Exactness: Mesh3D coordinates are integer micrometres, every test of a side is exact (`det`), every
 * key is built from integers and every list is sorted before it is read, so the bands depend on no
 * triangle order and no `Map` iteration order. The one exception is where an overlap cuts a stretch:
 * those places come from plain floating-point products and quotients, the same on every run and
 * engine (IEEE arithmetic, no transcendental), but not exact as `det` is, and rounded to whole
 * micrometres. A length is the square root of an exact integer sum
 * (never `Math.hypot`, whose last bit an engine may choose), and every offset is rounded to whole
 * micrometres with -0 made 0. Receivers and casters are looked up through a uniform grid of near-square
 * cells listing the faces that overlap each cell, so the work is the probes times the faces in one
 * cell, not times every face of the storey (`TriGrid`).
 */
import { CONTACT_SHADOW } from "../materials.js";
import { C16, S16 } from "../mesh/c16.js";
import type { ReplayNode } from "./payload.js";
import { ease } from "./timeline.js";
import { det, nearlyFlat, planLine, sweep } from "./wall-lines.js";

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
  /** What was built and how much was looked up, for the structural bounds (`test/shadows.test.ts`). */
  counts: {
    /** Outline stretches of the walls and columns that carry a band. */
    edges: number;
    /** Outside and inside corners sharper than 30° (a fan; two vertical bands). */
    convex: number;
    concave: number;
    /** Joints flatter than 30° (a curved wall's chords): mitred, no corner. */
    flatJoints: number;
    /** Stretches left unbanded because the point just outside lies in another caster. */
    dropped: number;
    furniture: number;
    /** Fence rail sides that carry a band. */
    fenceSides: number;
    /** Outline edges of the stairs' stringers that carry a band. */
    stairEdges: number;
    triangles: number;
    /** Plan points looked up, and faces tested against them. */
    probes: number;
    tests: number;
  };
}

export type P2 = readonly [number, number];
type Counts = ContactShadows["counts"];

/** `u × v` in plan (x, z): positive when `v` turns counter-clockwise from `u`, exactly in sign. */
const cross = (ux: number, uz: number, vx: number, vz: number): number => det(ux, uz, vx, vz);

const levelOf = (key: string): number => Number(/^L(-?\d+)\//.exec(key)?.[1] ?? 0);

/** Rounded to a whole number, -0 made 0. */
const whole = (x: number): number => Math.round(x) + 0;

/** The length of an integer vector, from its exact squared length: one rounding, then `sqrt`'s. */
const lengthOf = (dx: number, dz: number): number =>
  Math.sqrt(Number(BigInt(dx) * BigInt(dx) + BigInt(dz) * BigInt(dz)));

/**
 * The fade of a caster's bands at replay time `u` (design §1.1): 0 until the last quarter of its
 * rise, then up to 1 by `ease` at its end; a caster that never rises (none here) shows from its time.
 * A pure function of `u`, so a frame at `t` is the same however it was reached.
 */
export function contactFade(ev: { riseFrom: number; riseTo: number; hidden?: boolean } | undefined, u: number): number {
  if (!ev || ev.hidden) return 0;
  const span = ev.riseTo - ev.riseFrom;
  if (span <= 0) return u >= ev.riseTo ? 1 : 0;
  const q = span / 4;
  return ease((u - (ev.riseTo - q)) / q);
}

/** One plan triangle (a receiving face at its height `y`, or a caster's bottom face). */
export interface Tri {
  a: P2;
  b: P2;
  c: P2;
  y: number;
  /** A caster's face: the node it belongs to. */
  node?: number;
}

/** Whether `q` lies in `f` or on its edge (either winding). */
export function contains(f: Tri, q: P2): boolean {
  const s1 = cross(f.b[0] - f.a[0], f.b[1] - f.a[1], q[0] - f.a[0], q[1] - f.a[1]);
  const s2 = cross(f.c[0] - f.b[0], f.c[1] - f.b[1], q[0] - f.b[0], q[1] - f.b[1]);
  const s3 = cross(f.a[0] - f.c[0], f.a[1] - f.c[1], q[0] - f.c[0], q[1] - f.c[1]);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/**
 * How the bake finds faces: `at(q)` lists at least every face that contains `q`, and `near(box)` at
 * least every face that overlaps the box (each once). `TriGrid` is the one the bake uses; the tests
 * pass a lookup that checks it against a scan of every face (`contactShadows`' last parameter).
 */
export interface FaceLookup {
  at(q: P2): readonly Tri[];
  near(x0: number, z0: number, x1: number, z1: number): Tri[];
}

/** Cells a triangle gets on average, and the most cells a grid takes (memory, not correctness). */
const CELLS_PER_TRI = 2;
const CELLS_MAX = 1 << 16;

/**
 * Whether the closed triangle `t` and the closed box `[x0, x1] × [z0, z1]` share a point, exactly:
 * no separating axis among the box's two and the triangle's three edge normals (`det`, integers).
 */
export function overlaps(t: Tri, x0: number, z0: number, x1: number, z1: number): boolean {
  return (
    Math.max(t.a[0], t.b[0], t.c[0]) >= x0 &&
    Math.min(t.a[0], t.b[0], t.c[0]) <= x1 &&
    Math.max(t.a[1], t.b[1], t.c[1]) >= z0 &&
    Math.min(t.a[1], t.b[1], t.c[1]) <= z1 &&
    !separates(t.a, t.b, t.c, x0, z0, x1, z1) &&
    !separates(t.b, t.c, t.a, x0, z0, x1, z1) &&
    !separates(t.c, t.a, t.b, x0, z0, x1, z1)
  );
}

/** Whether the line through `p`, `q` has the box strictly on the side away from `r`. */
function separates(p: P2, q: P2, r: P2, x0: number, z0: number, x1: number, z1: number): boolean {
  const ux = q[0] - p[0];
  const uz = q[1] - p[1];
  const side = Math.sign(cross(ux, uz, r[0] - p[0], r[1] - p[1]));
  if (side === 0) return false;
  return (
    side * cross(ux, uz, x0 - p[0], z0 - p[1]) < 0 &&
    side * cross(ux, uz, x1 - p[0], z0 - p[1]) < 0 &&
    side * cross(ux, uz, x1 - p[0], z1 - p[1]) < 0 &&
    side * cross(ux, uz, x0 - p[0], z1 - p[1]) < 0
  );
}

/**
 * A uniform grid over a storey's plan triangles: a point's cell lists every triangle that overlaps
 * it (exactly, `overlaps`), not every one whose box does, so a long sliver (a many-sided room's
 * triangulation) is listed only where it lies. The cells are as near square as the extent allows,
 * `kx × kz` of them about `CELLS_PER_TRI` a triangle, so a long thin plan (a row of rooms) is cut
 * along its length and not into slivers across it (card RM8.8b item 2). A triangle containing a
 * point is always in that point's cell: the lookup is exact, and the grid decides only how many
 * faces are tested.
 */
export class TriGrid implements FaceLookup {
  /** The grid's corner, its cells' size and their count across and down (µm; read by the tests). */
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  readonly kx: number;
  readonly kz: number;
  /** Each cell's triangles (a hole where a cell has none). */
  private readonly cells: Tri[][];
  constructor(tris: readonly Tri[]) {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const t of tris)
      for (const p of [t.a, t.b, t.c]) {
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < z0) z0 = p[1];
        if (p[1] > z1) z1 = p[1];
      }
    this.x0 = x0;
    this.z0 = z0;
    if (tris.length === 0) {
      [this.kx, this.kz, this.w, this.h] = [0, 0, 1, 1];
      this.cells = [];
      return;
    }
    const sx = x1 - x0 + 1;
    const sz = z1 - z0 + 1;
    const target = Math.min(CELLS_MAX, CELLS_PER_TRI * tris.length);
    // Square cells of side `s` cover the extent in `target` cells; a side never exceeds the target.
    const s = Math.sqrt((sx * sz) / target);
    this.kx = Math.max(1, Math.min(target, Math.ceil(sx / s)));
    this.kz = Math.max(1, Math.min(Math.floor(CELLS_MAX / this.kx), Math.ceil(sz / s)));
    this.w = Math.max(1, Math.ceil(sx / this.kx));
    this.h = Math.max(1, Math.ceil(sz / this.kz));
    this.cells = new Array<Tri[]>(this.kx * this.kz);
    for (const t of tris) {
      const i0 = this.col(Math.min(t.a[0], t.b[0], t.c[0]));
      const i1 = this.col(Math.max(t.a[0], t.b[0], t.c[0]));
      const j0 = this.row(Math.min(t.a[1], t.b[1], t.c[1]));
      const j1 = this.row(Math.max(t.a[1], t.b[1], t.c[1]));
      for (let j = j0; j <= j1; j++) {
        const cz0 = this.z0 + j * this.h;
        const cz1 = cz0 + this.h;
        // The triangle's x-extent [lo, hi] within the row, in floating point (off by far less than
        // a micrometre, a cell's least width): scanned a cell wider each way. A cell strictly
        // between the cells of `lo` and `hi` overlaps (the triangle's part in the row is convex,
        // within the row's height, and reaches every x in [lo, hi]); the cells at either end take
        // the exact test.
        const [lo, hi] = rowExtent(t, cz0, cz1);
        const ilo = this.col(lo);
        const ihi = this.col(hi);
        const to = Math.min(i1, ihi + 1);
        for (let i = Math.max(i0, ilo - 1); i <= to; i++) {
          const cx0 = this.x0 + i * this.w;
          if (!((i > ilo && i < ihi) || overlaps(t, cx0, cz0, cx0 + this.w, cz1))) continue;
          const c = j * this.kx + i;
          const list = this.cells[c];
          if (list) list.push(t);
          else this.cells[c] = [t];
        }
      }
    }
  }
  private col(x: number): number {
    return Math.floor((x - this.x0) / this.w);
  }
  private row(z: number): number {
    return Math.floor((z - this.z0) / this.h);
  }
  at(q: P2): readonly Tri[] {
    if (this.kx === 0) return [];
    const i = this.col(q[0]);
    const j = this.row(q[1]);
    if (i < 0 || j < 0 || i >= this.kx || j >= this.kz) return [];
    return this.cells[j * this.kx + i] ?? [];
  }
  /** The triangles in the cells a plan box covers, each once (callers sort what they derive). */
  near(x0: number, z0: number, x1: number, z1: number): Tri[] {
    if (this.kx === 0) return [];
    const ci = (v: number): number => Math.max(0, Math.min(this.kx - 1, v));
    const cj = (v: number): number => Math.max(0, Math.min(this.kz - 1, v));
    const seen = new Set<Tri>();
    for (let j = cj(this.row(z0)); j <= cj(this.row(z1)); j++)
      for (let i = ci(this.col(x0)); i <= ci(this.col(x1)); i++)
        for (const t of this.cells[j * this.kx + i] ?? []) seen.add(t);
    return [...seen];
  }
}

/**
 * The x-extent of triangle `t` within the strip `z0 ≤ z ≤ z1`, in plain floating point (a bound the
 * grid scans from, widened by a cell; `overlaps` is the exact test). Over the whole triangle's x-range
 * when the strip holds no vertex and no edge crosses it (it cannot both miss and overlap).
 */
function rowExtent(t: Tri, z0: number, z1: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (x: number): void => {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  };
  const ps = [t.a, t.b, t.c];
  for (const p of ps) if (p[1] >= z0 && p[1] <= z1) take(p[0]);
  for (let k = 0; k < 3; k++) {
    const p = ps[k] as P2;
    const q = ps[(k + 1) % 3] as P2;
    if (p[1] === q[1]) continue;
    for (const z of [z0, z1])
      if ((p[1] - z) * (q[1] - z) < 0) take(p[0] + ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]));
  }
  if (lo > hi) return [Math.min(t.a[0], t.b[0], t.c[0]), Math.max(t.a[0], t.b[0], t.c[0])];
  return [lo, hi];
}

/** The horizontal triangles of `n` facing up (`up`) or down, at height `y` only when given. */
function flatFaces(n: ReplayNode, up: boolean, y: number | undefined, out: Tri[]): void {
  const p = n.positions;
  for (let i = 0; i < n.indices.length; i += 3) {
    const [ia, ib, ic] = [n.indices[i] as number, n.indices[i + 1] as number, n.indices[i + 2] as number];
    const ya = p[ia * 3 + 1] as number;
    if (p[ib * 3 + 1] !== ya || p[ic * 3 + 1] !== ya || (y !== undefined && ya !== y)) continue;
    const a: P2 = [p[ia * 3] as number, p[ia * 3 + 2] as number];
    const b: P2 = [p[ib * 3] as number, p[ib * 3 + 2] as number];
    const c: P2 = [p[ic * 3] as number, p[ic * 3 + 2] as number];
    // Outward-wound: a face whose normal points up turns clockwise in (x, z), one pointing down
    // counter-clockwise.
    const turn = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
    if (up ? turn < 0 : turn > 0) out.push({ a, b, c, y: ya });
  }
}

/** One directed edge of a downward face on a plan line, as an interval of its place `t`. */
interface LineEdge {
  t0: number;
  t1: number;
  k: 1 | -1;
  node: number;
}

/** A boundary stretch, oriented so the solid lies on its left (counter-clockwise round the solid). */
export interface Seg {
  a: P2;
  b: P2;
  node: number;
  /** Its band's width (mm) where a facing stretch narrows it (`narrowed`); else its node's. */
  w?: number;
}

/**
 * The stretches with each band narrowed where another stretch faces it closer than two bands (card
 * RM8.8b item 5: the slot a thinner wall's doorway leaves in a thicker collinear wall, stress plan
 * `s7`, where a 188 mm band crossed the 100 mm slot and came out beyond the far face). Facing: on
 * parallel lines (the same reduced direction, exactly), opposite in direction, each in front of the
 * other, and overlapping along their length. A stretch is cut where a facing one's ends fall along
 * it, and each piece in front of one takes half the gap (when that is less than its band), so two
 * facing bands meet in the middle and neither crosses the gap. `band` is a stretch's own width, mm.
 */
export function narrowed(segs: readonly Seg[], band: (s: Seg) => number): Seg[] {
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const l = planLine(s.a[0], s.a[1], s.b[0], s.b[1]);
    const key = `${l.dx},${l.dz}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  /** Per stretch: the stretches of it (`t0..t1`, its place along it) another faces, and how wide each may be. */
  const near = new Map<Seg, Array<{ t0: number; t1: number; w: number }>>();
  /** Where `o` falls along `s`, clipped to `s`: `[t0, t1]` with t0 < t1, or undefined. */
  const along = (s: Seg, o: Seg): [number, number] | undefined => {
    const dx = s.b[0] - s.a[0];
    const dz = s.b[1] - s.a[1];
    const l2 = dx * dx + dz * dz;
    const ta = ((o.a[0] - s.a[0]) * dx + (o.a[1] - s.a[1]) * dz) / l2;
    const tb = ((o.b[0] - s.a[0]) * dx + (o.b[1] - s.a[1]) * dz) / l2;
    const t0 = Math.max(0, Math.min(ta, tb));
    const t1 = Math.min(1, Math.max(ta, tb));
    return t1 > t0 ? [t0, t1] : undefined;
  };
  const note = (s: Seg, o: Seg, w: number): void => {
    if (w >= band(s)) return;
    const t = along(s, o);
    if (!t) return;
    const list = near.get(s);
    if (list) list.push({ t0: t[0], t1: t[1], w });
    else near.set(s, [{ t0: t[0], t1: t[1], w }]);
  };
  for (const key of [...groups.keys()].sort()) {
    const g = groups.get(key) as Seg[];
    if (g.length < 2) continue;
    const [dx, dz] = key.split(",").map(Number) as [number, number];
    const len = lengthOf(dx, dz);
    // Each stretch's place across the lines (its line's signed distance from the origin) and its
    // extent along them, in floating point: they only find the candidates, the facing test below is
    // exact. A sweep along the lines pairs the stretches whose extents overlap.
    let widest = 0;
    for (const s of g) widest = Math.max(widest, band(s));
    const reach = 2000 * widest;
    const items = g
      .map((s) => {
        const [ta, tb] = [(dx * s.a[0] + dz * s.a[1]) / len, (dx * s.b[0] + dz * s.b[1]) / len];
        return { s, off: (dx * s.a[1] - dz * s.a[0]) / len, lo: Math.min(ta, tb), hi: Math.max(ta, tb) };
      })
      .sort((p, q) => p.lo - q.lo || p.off - q.off);
    let active: typeof items = [];
    for (const it of items) {
      active = active.filter((o) => o.hi > it.lo);
      for (const o of active) {
        if (Math.abs(o.off - it.off) > reach) continue;
        const [s, t] = [it.s, o.s];
        const fs = frame(s);
        const ft = frame(t);
        // Opposite in direction, and `t` in front of `s` (on its outward side): then `s` is in
        // front of `t` too (the relation is symmetric, so each pair is tested once).
        if (fs.d[0] * ft.d[0] + fs.d[1] * ft.d[1] >= 0) continue;
        const ex = t.a[0] - s.a[0];
        const ez = t.a[1] - s.a[1];
        if (cross(fs.d[0], fs.d[1], ex, ez) >= 0) continue;
        // The gap from the exact cross product (an integer, then one rounding), never from the
        // float normal, whose cancellation on a long, nearly parallel offset could give a negative
        // width; and never below 0.
        const c = BigInt(fs.d[0]) * BigInt(ez) - BigInt(fs.d[1]) * BigInt(ex);
        const w = Math.max(0, -Number(c) / fs.len / 2000);
        note(s, t, w);
        note(t, s, w);
      }
      active.push(it);
    }
  }
  return segs.flatMap((s): Seg[] => {
    const list = near.get(s);
    if (!list) return [s];
    const own = band(s);
    const ts = [...new Set([0, 1, ...list.flatMap((c) => [c.t0, c.t1])])].sort((x, y) => x - y);
    const f = frame(s);
    const at = (t: number): P2 =>
      t === 0 ? s.a : t === 1 ? s.b : [whole(s.a[0] + f.d[0] * t), whole(s.a[1] + f.d[1] * t)];
    const out: Seg[] = [];
    for (let k = 0; k + 1 < ts.length; k++) {
      const [t0, t1] = [ts[k] as number, ts[k + 1] as number];
      const m = (t0 + t1) / 2;
      let w = own;
      for (const c of list) if (c.t0 <= m && m <= c.t1 && c.w < w) w = c.w;
      const last = out[out.length - 1];
      const lw = last ? (last.w ?? own) : undefined;
      if (last && lw === w) last.b = at(t1);
      else out.push({ a: at(t0), b: at(t1), node: s.node, ...(w < own ? { w } : {}) });
    }
    return out.filter((p) => p.a[0] !== p.b[0] || p.a[1] !== p.b[1]);
  });
}

/**
 * The outline of the downward faces `tris` (node index, three plan points each, every one
 * counter-clockwise in (x, z)): per plan line, the faces' directed edges summed along it by one
 * sweep; where the sum is not zero a face starts or ends, and edges two faces share cancel. A stretch
 * goes to the lowest node index among the edges over it. Sorted, so the order of `tris` is not read.
 */
function outline(tris: ReadonlyArray<{ node: number; p: readonly [P2, P2, P2] }>): Seg[] {
  const lines = new Map<string, { edges: LineEdge[]; at: Map<number, P2> }>();
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
        line = { edges: [], at: new Map() };
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

/** A stretch's integer direction, its length, and its unit direction and outward (right) normal. */
function frame(s: Seg): { d: [number, number]; len: number; u: [number, number]; n: [number, number] } {
  const dx = s.b[0] - s.a[0];
  const dz = s.b[1] - s.a[1];
  const len = lengthOf(dx, dz);
  return { d: [dx, dz], len, u: [dx / len, dz / len], n: [dz / len, -dx / len] };
}

/** `v` scaled to `mm` millimetres, rounded to whole micrometres. */
const scaled = (v: readonly [number, number], mm: number): [number, number] => [
  whole(v[0] * mm * 1000),
  whole(v[1] * mm * 1000),
];

const plus = (p: P2, o: readonly [number, number]): P2 => [p[0] + o[0], p[1] + o[1]];

/** The most fan triangles an outside corner takes (a quarter turn takes four). */
const MAX_FAN = 8;

/**
 * The contact shadows of a replay's nodes (`ReplayPayload.nodes`). `ground` (its ground plane)
 * receives under the lowest storey; `lines` (the walls' outline per node, `wallOutline`) narrows the
 * inside-corner bands at a jamb, and without it they keep their full width. `lookup` builds the face
 * lookups (`TriGrid`; a test passes one that checks it). Pure: the same nodes give the same bands,
 * byte for byte.
 */
export function contactShadows(
  nodes: readonly ReplayNode[],
  ground?: { y: number },
  lines?: ReadonlyArray<readonly number[] | undefined>,
  lookup: (tris: readonly Tri[]) => FaceLookup = (tris) => new TriGrid(tris),
): ContactShadows {
  const counts: Counts = {
    edges: 0,
    convex: 0,
    concave: 0,
    flatJoints: 0,
    dropped: 0,
    furniture: 0,
    fenceSides: 0,
    stairEdges: 0,
    triangles: 0,
    probes: 0,
    tests: 0,
  };
  const casters: string[][] = [];
  const layers: ShadowLayer[] = [];
  const levels = [...new Set(nodes.map((n) => levelOf(n.key)))].sort((a, b) => a - b);
  const lowest = levels[0];
  const lift = CONTACT_SHADOW.liftMm * 1000;
  for (const level of levels) {
    const here = nodes.map((n, i) => [n, i] as const).filter(([n]) => levelOf(n.key) === level);
    const faces: Tri[] = [];
    for (const [n] of here)
      if (n.kind === "floor" || n.kind === "slab" || n.kind === "outdoor" || n.flat === true)
        flatFaces(n, true, undefined, faces);
    const receivers = lookup(faces);
    const groundY = level === lowest ? ground?.y : undefined;
    /** The band height over the highest receiving face under any of `qs`, or undefined over none. */
    const over = (qs: readonly P2[]): number | undefined => {
      let best: number | undefined;
      for (const q of qs) {
        counts.probes++;
        let here = groundY;
        for (const f of receivers.at(q)) {
          counts.tests++;
          if (here !== undefined && f.y <= here) continue;
          if (contains(f, q)) here = f.y;
        }
        if (here !== undefined && (best === undefined || here > best)) best = here;
      }
      return best === undefined ? undefined : best + lift;
    };
    const foot = new Buf();
    const corner = new Buf();
    const halo = new Buf();
    /** A band along `s` (inner edge weight 1), its outer corners at `s.a + oa` and `s.b + ob`. */
    const band = (s: Seg, oa: readonly [number, number], ob: readonly [number, number], y: number, c: number) => {
      const a = foot.vertex(s.a[0], y, s.a[1], 1, c);
      const b = foot.vertex(s.b[0], y, s.b[1], 1, c);
      const d = foot.vertex(s.b[0] + ob[0], y, s.b[1] + ob[1], 0, c);
      const e = foot.vertex(s.a[0] + oa[0], y, s.a[1] + oa[1], 0, c);
      foot.quad(a, b, d, e);
    };
    /** Where a band along `s` is read: its middle and, 1 mm in from each end, half its width out. */
    const probesOf = (s: Seg, oa: readonly [number, number], ob: readonly [number, number]): P2[] => {
      const f = frame(s);
      const mid: P2 = [whole((s.a[0] + s.b[0]) / 2), whole((s.a[1] + s.b[1]) / 2)];
      const half = (o: readonly [number, number]): [number, number] => [whole(o[0] / 2), whole(o[1] / 2)];
      const om: [number, number] = [whole((oa[0] + ob[0]) / 4), whole((oa[1] + ob[1]) / 4)];
      const out: P2[] = [plus(mid, om)];
      if (f.len > 2000) {
        out.push(plus(plus(s.a, scaled(f.u, 1)), half(oa)), plus(plus(s.b, scaled(f.u, -1)), half(ob)));
      }
      return out;
    };

    // The walls' and columns' foot, their corners' fans and inside bands, mitred where flat.
    const walls = here.filter(([n]) => n.band !== undefined && (n.kind === "wall" || n.kind === "column"));
    if (walls.length > 0) {
      const caster = casters.push(walls.map(([n]) => n.key)) - 1;
      let e = Infinity;
      for (const [n] of walls) e = Math.min(e, yRange(n)[0]);
      const tris: Array<{ node: number; p: readonly [P2, P2, P2] }> = [];
      for (const [n, i] of walls) downFaces(n, i, e, tris);
      const solid = lookup(tris.map((t) => ({ a: t.p[0], b: t.p[1], c: t.p[2], y: e, node: t.node })));
      const inSolid = (q: P2): boolean => {
        counts.probes++;
        for (const f of solid.at(q)) {
          counts.tests++;
          if (contains(f, q)) return true;
        }
        return false;
      };
      // Where casters overlap the summed edges are not the outline: cut each stretch where another
      // node's bottom face begins or ends along it, and keep the pieces whose outside (1 mm out from
      // the piece's middle) is no caster's.
      const cutSegs = outline(tris).flatMap((s): Seg[] => {
        const f = frame(s);
        const ts = [0, 1];
        const [bx0, bx1] = [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])];
        const [bz0, bz1] = [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])];
        for (const t of solid.near(bx0, bz0, bx1, bz1)) {
          if (t.node === s.node) continue;
          counts.tests++;
          for (const [p, q] of [
            [t.a, t.b],
            [t.b, t.c],
            [t.c, t.a],
          ] as const) {
            const den = f.d[0] * (q[1] - p[1]) - f.d[1] * (q[0] - p[0]);
            if (den === 0) continue;
            const along = ((p[0] - s.a[0]) * (q[1] - p[1]) - (p[1] - s.a[1]) * (q[0] - p[0])) / den;
            const on = ((p[0] - s.a[0]) * f.d[1] - (p[1] - s.a[1]) * f.d[0]) / den;
            if (along > 0 && along < 1 && on >= 0 && on <= 1) ts.push(along);
          }
        }
        ts.sort((x, y) => x - y);
        const at = (t: number): P2 =>
          t === 0 ? s.a : t === 1 ? s.b : [whole(s.a[0] + f.d[0] * t), whole(s.a[1] + f.d[1] * t)];
        const kept: Seg[] = [];
        let from: number | undefined;
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k] as number;
          const t1 = ts[k + 1] as number;
          if (t1 - t0 <= 0) continue;
          const m = at((t0 + t1) / 2);
          const outside = !inSolid(plus(m, scaled(f.n, 1)));
          if (outside && from === undefined) from = t0;
          if (!outside) {
            counts.dropped++;
            if (from !== undefined) kept.push({ a: at(from), b: at(t0), node: s.node });
            from = undefined;
          }
        }
        if (from !== undefined) kept.push({ a: at(from), b: s.b, node: s.node });
        return kept.filter((k) => k.a[0] !== k.b[0] || k.a[1] !== k.b[1]);
      });
      const bandOf = (s: Seg): number => s.w ?? nodes[s.node]?.band ?? 0;
      const segs = narrowed(cutSegs, bandOf);
      const pk = (p: P2): string => `${p[0]},${p[1]}`;
      const ending = new Map<string, Seg[]>();
      const starting = new Map<string, Seg[]>();
      for (const s of segs) {
        ending.set(pk(s.b), [...(ending.get(pk(s.b)) ?? []), s]);
        starting.set(pk(s.a), [...(starting.get(pk(s.a)) ?? []), s]);
      }
      // Each stretch's outer corners: straight out by its band, or mitred at a flat joint.
      const outerA = new Map<Seg, [number, number]>();
      const outerB = new Map<Seg, [number, number]>();
      for (const s of segs) {
        const o = scaled(frame(s).n, bandOf(s));
        outerA.set(s, o);
        outerB.set(s, o);
      }
      const joints: Array<{ v: P2; si: Seg; so: Seg; turn: number }> = [];
      for (const key of [...ending.keys()].sort()) {
        const ins = ending.get(key) ?? [];
        const outs = starting.get(key) ?? [];
        if (ins.length !== 1 || outs.length !== 1) continue;
        const si = ins[0] as Seg;
        const so = outs[0] as Seg;
        const fi = frame(si);
        const fo = frame(so);
        const turn = cross(fi.d[0], fi.d[1], fo.d[0], fo.d[1]);
        if (nearlyFlat(fi.d, fo.d, 1, 1)) {
          // Flatter than 30° (a curved wall's chords; a straight joint of two casters): the two
          // bands' outer corners lie on the bisector, so they neither overlap nor part. Where
          // `narrowed` cut a stretch (a narrowed piece beside a full-width one, on one line) the two
          // widths differ and the band steps in width there.
          const m: [number, number] = [fi.n[0] + fo.n[0], fi.n[1] + fo.n[1]];
          const k = 1 + fi.n[0] * fo.n[0] + fi.n[1] * fo.n[1];
          outerB.set(si, scaled([m[0] / k, m[1] / k], bandOf(si)));
          outerA.set(so, scaled([m[0] / k, m[1] / k], bandOf(so)));
          if (turn !== 0) counts.flatJoints++;
          continue;
        }
        if (turn !== 0) joints.push({ v: si.b, si, so, turn });
      }
      for (const s of segs) {
        const oa = outerA.get(s) as [number, number];
        const ob = outerB.get(s) as [number, number];
        const y = over(probesOf(s, oa, ob));
        if (y === undefined) continue;
        band(s, oa, ob, y, caster);
        counts.edges++;
      }
      // The jambs on the walls' faces (vertical outline lines), for the inside-corner bands.
      const jambs: P2[] = [];
      for (const [, i] of walls) {
        const l = lines?.[i] ?? [];
        for (let j = 0; j + 5 < l.length; j += 6)
          if (l[j] === l[j + 3] && l[j + 2] === l[j + 5] && l[j + 1] !== l[j + 4])
            jambs.push([l[j] as number, l[j + 2] as number]);
      }
      for (const { v, si, so, turn } of joints) {
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
          const rims = ring.map((d, j) => scaled(d, bi + ((bo - bi) * j) / (ring.length - 1)));
          const y = over(rims.map((o) => plus(v, [whole(o[0] / 2), whole(o[1] / 2)])));
          if (y === undefined) continue;
          const c = foot.vertex(v[0], y, v[1], 1, caster);
          const rim = rims.map((o) => foot.vertex(v[0] + o[0], y, v[1] + o[1], 0, caster));
          for (let j = 0; j + 1 < rim.length; j++) foot.tri(c, rim[j] as number, rim[j + 1] as number);
          counts.convex++;
        } else {
          // Inside corner: up each of the two faces, from the floor to the lower wall's top, each
          // stopping short of a jamb nearer the corner than its width.
          const r = Math.max(bi, bo);
          const y0 = over([plus(v, scaled([fi.n[0] + fo.n[0], fi.n[1] + fo.n[1]], r / 2))]);
          if (y0 === undefined) continue;
          const top = Math.min(yRange(nodes[si.node] as ReplayNode)[1], yRange(nodes[so.node] as ReplayNode)[1]);
          if (top <= y0) continue;
          const strip = (f: ReturnType<typeof frame>, mm: number, back: boolean): void => {
            // Along the face away from the corner: back along the incoming stretch, on along the outgoing.
            const dir: [number, number] = back ? [-f.d[0], -f.d[1]] : f.d;
            let reach = Math.min(mm * 1000, f.len);
            for (const p of jambs) {
              const wx = p[0] - v[0];
              const wz = p[1] - v[1];
              if (cross(dir[0], dir[1], wx, wz) !== 0) continue;
              const along = (dir[0] * wx + dir[1] * wz) / f.len;
              if (along > 0 && along < reach) reach = along;
            }
            if (reach <= 0) return;
            const off = scaled(f.n, CONTACT_SHADOW.liftMm);
            const step = scaled(back ? [-f.u[0], -f.u[1]] : f.u, reach / 1000);
            const x = v[0] + off[0];
            const z = v[1] + off[1];
            const a = corner.vertex(x, y0, z, 1, caster);
            const b = corner.vertex(x, top, z, 1, caster);
            const c = corner.vertex(x + step[0], top, z + step[1], 0, caster);
            const d = corner.vertex(x + step[0], y0, z + step[1], 0, caster);
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
          const o = scaled(frame(s).n, n.band);
          const yy = over(probesOf(s, o, o));
          if (yy === undefined) continue;
          band(s, o, o, yy, caster);
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
        const o = scaled(frame(s).n, n.band);
        const y = over(probesOf(s, o, o));
        if (y === undefined) continue;
        band(s, o, o, y, caster);
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
      const h = n.band * 1000;
      const cx = whole((x0 + x1) / 2);
      const cz = whole((z0 + z1) / 2);
      const y = over([
        [cx, cz],
        [cx, z0 - h / 2],
        [x1 + h / 2, cz],
        [cx, z1 + h / 2],
        [x0 - h / 2, cz],
      ]);
      if (y === undefined) continue;
      const caster = casters.push([n.key]) - 1;
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
