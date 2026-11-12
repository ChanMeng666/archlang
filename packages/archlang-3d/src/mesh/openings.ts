/**
 * The trim of a doorway and a window (product-roadmap card RM8.6; design
 * `docs/plans/product-roadmap/design/visual-language.md` §2.1, §2.2), as parts of the opening's
 * node, every size a clamped share of the host wall's thickness `t`, rounded to a whole millimetre:
 *
 * - a door (every kind) and a cased `opening`: a lining on the two jamb faces and the head, `l` =
 *   0.1 t in [12, 25] thick along the wall; a door's in two halves across the wall, a 40 mm slot
 *   between them for the leaf (which keeps its length and place, so it stays the core's `doorLeaves`
 *   leaf); and a casing (architrave) on each wall face, `c` = 0.35 t in [50, 90] wide and `p` =
 *   0.1 t in [10, 20] proud, its legs from the floor to the head, its head piece over the full width,
 *   cut at the wall's top (none when the head is at the top). A barn door has no casing on the face
 *   its panel hangs on (the core's `swing`), a garage door none at all, a door on a curved host no
 *   trim (its closed leaf is the chord between its jambs; a cased opening there keeps its lining,
 *   along the arc), and a leg that would stand in a wall or a column (a doorway at a corner), in
 *   standing furniture (not a rug: `FLAT_MM`), in another doorway or in another doorway's casing
 *   (two doorways side by side: both legs) is left out, never shortened, its head piece then
 *   stopping at that jamb;
 * - a window: on the interior half of the cut, a reveal lining 0.075 t in [10, 20] on the jambs and
 *   the head, in the frame's colour; on its sill, an exterior sill 0.15 t in [20, 40] thick, proud
 *   of the outside face by 0.2 t and past each jamb by 0.2 t (the core's `SILL_PROJECTION` and
 *   `SILL_HORN`, of the host's own `t`), and an interior board 0.1 t in [18, 30] thick, past the
 *   inside face and each jamb by 0.1 t in [15, 30]. Which face is outside is the core's own rule
 *   (`exteriorNormal`, `src/elements/window.ts`): one wall thickness off each face, the side with no
 *   room or void of the storey there. Inside on both sides (an interior window): a reveal on both
 *   halves, no sill; on neither (a free-standing wall): nothing. A window with no sill (`sill 0`)
 *   has neither sill nor board. At a mitred end (a window run to a corner) a sill or a board stops
 *   on the mitre, past no jamb, and an end that would stand in a neighbour's doorway, casing, sill
 *   or board stops at its jamb (`window-sill-horn-omitted`); on a curved host the reveals follow the
 *   arc and the sill and the board stay inside the cut.
 *
 * A storey's trim is decided all at once (`storeyTrim`), never in the order the plan writes its
 * openings: every casing before any sill or board (a casing beats a horn), and two pieces of the
 * same rank that meet are both cut back or left out, so a plan's trim is the same whatever order
 * its openings are written in, and a mirror-symmetric plan gets mirror-symmetric trim (RM8.6b).
 *
 * Every part is square to its wall, built in its jamb frame and rounded to whole micrometres; every
 * shell closed (`prism`). Each default is ledgered per opening (ADR 0030 decision 5).
 */
import type { Assumption, Level, Opening, Polygon, Pt } from "../scene3d/types.js";
import { overlapArea } from "../scene3d/overlap.js";
import { type CutSector, cutSector, sectorBand, where } from "./extrude.js";
import type { Shell } from "./types.js";

const MM = 1000;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** A share of `t` mm, rounded to a whole millimetre and clamped (design §2). */
const share = (k: number, t: number, lo: number, hi: number): number => clamp(Math.round(k * t), lo, hi);

/** The trim's sizes (mm) for a host `t` mm thick (design §2.1, §2.2). */
export const OPENING_DETAIL = {
  /** The slot a door's lining leaves for its leaf: the leaf's own thickness (`LEAF_MM`). */
  slot: 40,
  lining: (t: number): number => share(0.1, t, 12, 25),
  casingWidth: (t: number): number => share(0.35, t, 50, 90),
  casingProud: (t: number): number => share(0.1, t, 10, 20),
  sillThickness: (t: number): number => share(0.15, t, 20, 40),
  /** The core's `SILL_PROJECTION` and `SILL_HORN` (both 0.2 of the host's thickness). */
  sillProjection: (t: number): number => Math.round(0.2 * t),
  sillHorn: (t: number): number => Math.round(0.2 * t),
  boardThickness: (t: number): number => share(0.1, t, 18, 30),
  boardOverhang: (t: number): number => share(0.1, t, 15, 30),
  reveal: (t: number): number => share(0.075, t, 10, 20),
  /** The window frame's half depth (`FRAME_DEPTH_MM` / 2): where the reveal and the sills start. */
  frameHalfDepth: 30,
} as const;

/** One part of an opening's node: its name and its shells (a `null` one was degenerate). */
export interface TrimPart {
  part: "lining" | "casing" | "sill" | "board" | "reveal";
  shells: Array<Shell | null>;
}

/**
 * An opening's jamb frame: `u` along the centreline from `jambs[0]` to `jambs[1]` (0 … `w`), `v`
 * across it toward the core's `+normal` (the side a door's `swing in` opens to, `doorSwing`).
 */
interface JambFrame {
  w: number;
  at: (u: number, v: number) => Pt;
  /** A plan rectangle over `u0..u1` × `v0..v1` in this frame (corners in order). */
  quad: (u0: number, u1: number, v0: number, v1: number) => Polygon;
}

function jambFrame(o: Opening): JambFrame | null {
  const [j0, j1] = o.jambs;
  const dx = j1[0] - j0[0];
  const dy = j1[1] - j0[1];
  const w = Math.hypot(dx, dy);
  if (!(w > 0)) return null;
  const [ux, uy] = [dx / w, dy / w];
  const at = (u: number, v: number): Pt => [Math.round(j0[0] + u * ux - v * uy), Math.round(j0[1] + u * uy + v * ux)];
  return {
    w,
    at,
    quad: (u0, u1, v0, v1) => ({ outer: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)] }),
  };
}

/** `p` in the frame's (u, v), µm (the inverse of `at`, unrounded). */
function toFrame(o: Opening, p: Pt): [number, number] {
  const [j0, j1] = o.jambs;
  const w = Math.hypot(j1[0] - j0[0], j1[1] - j0[1]) || 1;
  const [ux, uy] = [(j1[0] - j0[0]) / w, (j1[1] - j0[1]) / w];
  const [dx, dy] = [p[0] - j0[0], p[1] - j0[1]];
  return [dx * ux + dy * uy, -dx * uy + dy * ux];
}

/**
 * Where the cut's end at `u = 0` (`end` 0) or at `u = w` (`end` 1) lies at depth `v`: a straight end
 * stays at its jamb; a mitred one (a window run to a corner, its two corners more than 1 mm apart
 * along the wall) is the line through those two corners, as the core stops the window's every line
 * on it (`cornerMitre`). `null` when the cut is not the four corners of a straight host.
 */
function cutEnds(o: Opening, w: number): { mitred: [boolean, boolean]; u: (end: 0 | 1, v: number) => number } | null {
  if (o.cut.length !== 4) return null;
  const pts = o.cut.map((p) => toFrame(o, p)).sort((a, b) => a[0] - b[0]);
  const ends = [pts.slice(0, 2), pts.slice(2)] as [Array<[number, number]>, Array<[number, number]>];
  const mitred = ends.map((e) => Math.abs((e[0] as [number, number])[0] - (e[1] as [number, number])[0]) > MM) as [
    boolean,
    boolean,
  ];
  return {
    mitred,
    u: (end, v) => {
      if (!mitred[end]) return end === 0 ? 0 : w;
      const [a, b] = ends[end] as [[number, number], [number, number]];
      return a[1] === b[1] ? a[0] : a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]);
    },
  };
}

/** Whether plan point `p` lies in one of the storey's rooms or voids (the core's `floorAt`). */
function floorAt(level: Level, p: Pt): boolean {
  return (
    level.floors.some((f) => where(p, f.polygon.outer) === true) ||
    level.voids.some((v) => p[0] > v.at[0] && p[0] < v.at[0] + v.size.w && p[1] > v.at[1] && p[1] < v.at[1] + v.size.h)
  );
}

/**
 * The side of the frame (`+1`: `+v`, `−1`: `−v`) a room or void lies on, one wall thickness off each
 * face at the opening's centre (the core's `exteriorNormal`, through `wallFaceProbes`): `"both"` for
 * an interior window, `null` for one on a free-standing wall.
 */
export function insideOf(o: Opening, t: number, level: Level): 1 | -1 | "both" | null {
  const f = jambFrame(o);
  if (!f) return null;
  const mid = f.w / 2;
  const d = Math.max(t, 1);
  const plus = floorAt(level, f.at(mid, d));
  const minus = floorAt(level, f.at(mid, -d));
  return plus && minus ? "both" : plus ? 1 : minus ? -1 : null;
}

/** More overlap than this (µm², 1 mm²) is a clash; less is the rounding of two faces that touch. */
const CLASH_UM2 = 1e6;

const boxPoly = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  outer: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

/** `[x0, y0, x1, y1]` of a polygon's outer ring. */
function boxOf(poly: Polygon): [number, number, number, number] {
  const xs = poly.outer.map((p) => p[0]);
  const ys = poly.outer.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** What a trim piece can stand in: one class per kind of obstacle a piece is tested against. */
/**
 * `opening`: a doorway between its sill and its head (what a casing is tested against); `jamb`: the
 * same doorway at every height and a millimetre wider each way along its wall (what a sill's or a
 * board's horn is tested against: a horn ending flush with a neighbour's jamb face would share it).
 */
export type ObstacleClass = "wall" | "column" | "furniture" | "opening" | "jamb" | "trim";

/** A trim piece in plan, over heights `z0..z1` (µm over the storey's floor level `e`). */
interface Piece {
  poly: Polygon;
  z0: number;
  z1: number;
}

/** One obstacle: its plan polygon (and box, to reject fast) and its heights over `e`. */
interface Obstacle extends Piece {
  cls: ObstacleClass;
  /** What the ledger names it: `wall`, `column`, `furniture <id>`, `opening <id>`, `casing <id>` … */
  name: string;
  /** The opening it belongs to (its own doorway and trim never block it). */
  owner?: string;
  box: [number, number, number, number];
}

/** A set of obstacles a piece is tested against, each test rejected by bounding box first. */
class Obstacles {
  readonly list: Obstacle[] = [];

  add(cls: ObstacleClass, name: string, piece: Piece, owner?: string): void {
    this.list.push({ ...piece, cls, name, ...(owner !== undefined ? { owner } : {}), box: boxOf(piece.poly) });
  }

  /** The first obstacle, of `classes`, that a piece of `owner`'s trim would stand in, or `null`. */
  clash(owner: string, piece: Piece, classes: readonly ObstacleClass[]): string | null {
    const [x0, y0, x1, y1] = boxOf(piece.poly);
    for (const o of this.list) {
      if (o.owner === owner || !classes.includes(o.cls)) continue;
      if (o.z1 <= piece.z0 || o.z0 >= piece.z1) continue;
      if (o.box[2] <= x0 || o.box[0] >= x1 || o.box[3] <= y0 || o.box[1] >= y1) continue;
      if (overlapArea(o.poly, piece.poly) > CLASH_UM2) return o.name;
    }
    return null;
  }
}

/** Furniture lower than this (mm) lies flat on the floor (a rug, a mat): trim passes through it. */
export const FLAT_MM = 50;

const STATIC: readonly ObstacleClass[] = ["wall", "column", "furniture", "opening"];
const TRIM: readonly ObstacleClass[] = ["trim"];

/**
 * A storey's fixed obstacles (review of PR #729, M2, m4, m7; RM8.6b n2, n3): its wall bodies and
 * columns, its furniture at the heights it is built to (a piece lower than `FLAT_MM`, a rug or a
 * mat, is passed through), and each opening's doorway, its cut and a casing's depth off each face,
 * from its sill to its head.
 */
function fixedObstacles(level: Level, furnitureZ: (f: Level["furniture"][number]) => [number, number]): Obstacles {
  const site = new Obstacles();
  const UP = Number.POSITIVE_INFINITY;
  for (const w of level.walls) for (const b of w.body) site.add("wall", "wall", { poly: b, z0: 0, z1: UP });
  for (const c of level.columns)
    site.add("column", "column", {
      poly: boxPoly(c.at[0], c.at[1], c.at[0] + c.size.w, c.at[1] + c.size.h),
      z0: 0,
      z1: UP,
    });
  for (const f of level.furniture) {
    const [z0, z1] = furnitureZ(f);
    if (z1 - z0 < FLAT_MM * MM) continue;
    site.add("furniture", `furniture ${f.id}`, {
      poly: boxPoly(
        f.centre[0] - f.size.w / 2,
        f.centre[1] - f.size.d / 2,
        f.centre[0] + f.size.w / 2,
        f.centre[1] + f.size.d / 2,
      ),
      z0,
      z1,
    });
  }
  const thick = new Map(level.walls.map((w) => [w.id, w.thickness] as const));
  const reach = OPENING_DETAIL.casingProud(Number.POSITIVE_INFINITY) * MM;
  for (const b of level.openings) {
    const fb = jambFrame(b);
    const hb = (thick.get(b.host) ?? 0) / 2 + reach;
    if (!fb) continue;
    site.add("opening", `opening ${b.id}`, { poly: fb.quad(0, fb.w, -hb, hb), z0: b.sill, z1: b.head }, b.id);
    site.add("jamb", `opening ${b.id}`, { poly: fb.quad(-MM, fb.w + MM, -hb, hb), z0: 0, z1: UP }, b.id);
  }
  return site;
}

/**
 * The other opening of the storey whose cut overlaps this one's (two walls drawn over each other,
 * each with its opening there), or `null`: such an opening gets no trim, since each one's lining
 * would stand in the other's.
 */
function cutOverlap(o: Opening, level: Level): string | null {
  const own = { outer: o.cut };
  for (const b of level.openings) if (b.id !== o.id && overlapArea({ outer: b.cut }, own) > CLASH_UM2) return b.id;
  return null;
}

/** A lining of thickness `l` on a curved host: the two jambs and the head, across `[v0, v1]`. */
function curvedLining(
  sector: CutSector,
  l: number,
  bands: ReadonlyArray<readonly [number, number]>,
  z0: number,
  head: number,
  withHead: boolean,
  prism: Prism,
): Array<Shell | null> {
  const f = Math.min(0.5, l / (sector.r * Math.abs(sector.sweep)));
  return bands.flatMap(([v0, v1]) => [
    prism(sectorBand(sector, v0, v1, 0, f), z0, head),
    prism(sectorBand(sector, v0, v1, 1 - f, 1), z0, head),
    ...(withHead && f < 0.5 ? [prism(sectorBand(sector, v0, v1, f, 1 - f), head - l, head)] : []),
  ]);
}

/** The extruder `build.ts` counts degenerate holes with. */
export type Prism = (poly: Polygon, z0: number, z1: number) => Shell | null;

/** One opening the storey's trim is built for. */
export interface TrimInput {
  o: Opening;
  /** The host's thickness (µm). */
  t: number;
  /** The head as built (µm over `e`; the opening's head capped at the host's built top). */
  head: number;
  /** The host's built top (µm over `e`). */
  top: number;
}

/** An opening's trim: its parts (each a part of its node) and the ledger rows that say what was assumed. */
export interface TrimResult {
  parts: TrimPart[];
  ledger: Assumption[];
}

const END = ["start", "end"] as const;

/** A casing's face, as planned: its legs and head piece before anything is decided. */
interface Face {
  s: 1 | -1;
  name: "+face" | "-face";
  v0: number;
  v1: number;
  /** Each leg's candidate piece, then whether it stands (`null` = left out) and why not. */
  legs: [Piece, Piece];
  keep: [boolean, boolean];
  /** The head piece's two ends past the jambs and its span between them, when it has one. */
  ends: [Piece, Piece] | null;
  mid: Piece | null;
  endKeep: [boolean, boolean];
  midKeep: boolean;
}

interface DoorPlan {
  kind: "door";
  input: TrimInput;
  f: JambFrame;
  result: TrimResult;
  faces: Face[];
  omitted: string[];
  c: number;
  p: number;
  barTop: number;
}

/** A window's sill or board, as planned: its span between the jambs, and its horn past each. */
interface Slab {
  part: "sill" | "board";
  core: Piece;
  horns: [Piece | null, Piece | null];
  hornKeep: [boolean, boolean];
  hornWhy: [string, string];
  coreKeep: boolean;
  coreWhy: string;
  /** The built polygon, once decided. */
  built: Polygon | null;
  thickness: number;
}

interface WindowPlan {
  kind: "window";
  input: TrimInput;
  f: JambFrame;
  result: TrimResult;
  slabs: Slab[];
  /** Builds the window's trim as decided (the reveal's foot is the board's top, if it stands). */
  finish: () => void;
}

/**
 * The trim of every opening of a storey (product-roadmap RM8.6, RM8.6b), decided all at once so it
 * never depends on the order the plan writes its openings in (review of PR #729, S1):
 *
 * 1. Each doorway's casing legs are tested against the storey's fixed obstacles (`fixedObstacles`)
 *    and every OTHER doorway's casing legs as planned. A leg that meets one is left out, never
 *    shortened; two legs that meet each other are both left out (two doorways closer than two
 *    casings), so neither doorway wins by coming first and a symmetric plan stays symmetric.
 * 2. Each head piece's two ends past the jambs, one at a time (S3): an end is cut back to its jamb
 *    when its leg was left out, or when it meets a fixed obstacle, another doorway's standing leg or
 *    another head piece's end (both cut); its span between the jambs is left out when it meets a
 *    fixed obstacle, a standing leg or another head piece's span (both left out).
 * 3. Only then each window's sill and board, a casing beating a horn: each horn past a jamb is cut
 *    back when it meets a fixed obstacle, any built casing, or another window's sill or board as
 *    planned (both cut); a sill or board whose span still meets one of them, or another window's span,
 *    is left out. The reveal stands on the board, or on the sill block when the board is left out.
 *
 * Every omission is ledgered with what it met, end by end.
 */
export function storeyTrim(
  level: Level,
  inputs: readonly TrimInput[],
  e: number,
  prism: Prism,
  furnitureZ: (f: Level["furniture"][number]) => [number, number],
): Map<string, TrimResult> {
  const site = fixedObstacles(level, furnitureZ);
  const out = new Map<string, TrimResult>();
  const doors: DoorPlan[] = [];
  const windows: WindowPlan[] = [];
  for (const input of inputs) {
    const plan = input.o.kind === "window" ? planWindow(input, level, e, prism) : planDoor(input, level, e, prism);
    out.set(input.o.id, plan.result);
    if (plan.kind === "door") doors.push(plan);
    else if (plan.kind === "window") windows.push(plan);
  }
  // 1. Legs: against the fixed obstacles and every other doorway's legs as planned.
  const plannedLegs = new Obstacles();
  for (const d of doors)
    for (const face of d.faces)
      for (const leg of face.legs) plannedLegs.add("trim", `casing ${d.input.o.id}`, leg, d.input.o.id);
  for (const d of doors) {
    const id = d.input.o.id;
    for (const face of d.faces)
      face.legs.forEach((leg, k) => {
        const what = site.clash(id, leg, STATIC) ?? plannedLegs.clash(id, leg, TRIM);
        if (what) {
          face.keep[k] = false;
          d.omitted.push(`${face.name}:${END[k]}:${what}`);
        }
      });
  }
  // 2. Head pieces: their ends one at a time, then their spans.
  const standingLegs = new Obstacles();
  const plannedEnds = new Obstacles();
  const plannedMids = new Obstacles();
  for (const d of doors)
    for (const face of d.faces) {
      face.legs.forEach((leg, k) => {
        if (face.keep[k]) standingLegs.add("trim", `casing ${d.input.o.id}`, leg, d.input.o.id);
      });
      if (face.ends)
        face.ends.forEach((end, k) => {
          if (face.keep[k]) plannedEnds.add("trim", `casing ${d.input.o.id}`, end, d.input.o.id);
        });
      if (face.mid) plannedMids.add("trim", `casing ${d.input.o.id}`, face.mid, d.input.o.id);
    }
  for (const d of doors) {
    const id = d.input.o.id;
    for (const face of d.faces) {
      if (!face.ends || !face.mid) continue;
      face.ends.forEach((end, k) => {
        if (!face.keep[k]) {
          face.endKeep[k] = false;
          return;
        }
        const what =
          site.clash(id, end, STATIC) ?? standingLegs.clash(id, end, TRIM) ?? plannedEnds.clash(id, end, TRIM);
        if (what) {
          face.endKeep[k] = false;
          d.omitted.push(`${face.name}:head-${END[k]}:${what}`);
        }
      });
      const what =
        site.clash(id, face.mid, STATIC) ??
        standingLegs.clash(id, face.mid, TRIM) ??
        plannedMids.clash(id, face.mid, TRIM);
      if (what) {
        face.midKeep = false;
        d.omitted.push(`${face.name}:head:${what}`);
      }
    }
  }
  const casings = new Obstacles();
  for (const d of doors) finishDoor(d, casings, e, prism);
  // 3. Sills and boards: a casing beats a horn; two windows' horns or spans that meet are both cut.
  const plannedSlabs = new Obstacles();
  const plannedCores = new Obstacles();
  for (const w of windows)
    for (const sl of w.slabs) {
      plannedCores.add("trim", `${sl.part} ${w.input.o.id}`, sl.core, w.input.o.id);
      plannedSlabs.add("trim", `${sl.part} ${w.input.o.id}`, sl.core, w.input.o.id);
      for (const h of sl.horns) if (h) plannedSlabs.add("trim", `${sl.part} ${w.input.o.id}`, h, w.input.o.id);
    }
  const NEAR: readonly ObstacleClass[] = ["jamb"];
  for (const w of windows) {
    const id = w.input.o.id;
    for (const sl of w.slabs) {
      sl.horns.forEach((h, k) => {
        if (!h) return;
        const what = site.clash(id, h, NEAR) ?? casings.clash(id, h, TRIM) ?? plannedSlabs.clash(id, h, TRIM);
        if (what) {
          sl.hornKeep[k] = false;
          sl.hornWhy[k] = what;
        }
      });
      const what =
        site.clash(id, sl.core, NEAR) ?? casings.clash(id, sl.core, TRIM) ?? plannedCores.clash(id, sl.core, TRIM);
      if (what) {
        sl.coreKeep = false;
        sl.coreWhy = what;
      }
    }
  }
  for (const w of windows) w.finish();
  return out;
}

/** Plans a doorway's lining (built at once: it stands in its own cut) and its casing's candidates. */
function planDoor(
  input: TrimInput,
  level: Level,
  e: number,
  prism: Prism,
): DoorPlan | { kind: "none"; result: TrimResult } {
  const { o, t, head, top } = input;
  const result: TrimResult = { parts: [], ledger: [] };
  const { parts, ledger } = result;
  const f = jambFrame(o);
  if (!f) return { kind: "none", result };
  const tm = t / MM;
  const kind = o.kind;
  const door = kind === "door";
  const sector = cutSector(o.cut, o.jambs, o.centre);
  // No trim where it cannot stand: a cut another opening's overlaps, or a door on a curved host,
  // whose closed leaf is the chord between its jambs (inside the arc's lining).
  const blocked = cutOverlap(o, level);
  if (blocked || (door && sector)) {
    ledger.push({
      kind,
      id: o.id,
      field: "trim",
      value: blocked ? `cut overlaps ${blocked}` : "curved host",
      provenance: "default",
      rule: "door-trim-omitted",
    });
    return { kind: "none", result };
  }
  const l = OPENING_DETAIL.lining(tm) * MM;
  const slot = (OPENING_DETAIL.slot * MM) / 2;
  const half = t / 2;
  const z0 = e + o.sill;
  const zh = e + head;
  const withHead = head < top;
  // A door's lining is in two halves either side of its leaf's slot; a cased opening's is whole.
  const bands: Array<[number, number]> = door
    ? half - slot >= MM
      ? [
          [-half, -slot],
          [slot, half],
        ]
      : []
    : [[-half, half]];
  const lining: Array<Shell | null> = sector
    ? curvedLining(sector, l, bands, z0, zh, withHead, prism)
    : bands.flatMap(([v0, v1]) => [
        prism(f.quad(0, l, v0, v1), z0, zh),
        prism(f.quad(f.w - l, f.w, v0, v1), z0, zh),
        ...(withHead && f.w > 2 * l ? [prism(f.quad(l, f.w - l, v0, v1), zh - l, zh)] : []),
      ]);
  if (lining.length) parts.push({ part: "lining", shells: lining });
  ledger.push({
    kind,
    id: o.id,
    field: "lining_mm",
    value: bands.length
      ? { thickness: l / MM, ...(door ? { slot: OPENING_DETAIL.slot } : {}), head: withHead }
      : "omitted",
    provenance: "default",
    rule: bands.length ? "door-lining-default" : "door-lining-omitted",
  });
  // The casing, on each face the kind takes it on.
  const why = o.doorKind === "garage" ? "garage" : sector ? "curved" : null;
  if (why) {
    ledger.push({ kind, id: o.id, field: "casing", value: why, provenance: "default", rule: "door-casing-omitted" });
    return { kind: "none", result };
  }
  const c = OPENING_DETAIL.casingWidth(tm) * MM;
  const p = OPENING_DETAIL.casingProud(tm) * MM;
  // A barn door's panel hangs on its `swing` face (the core's `door-panels.ts`): `in` is `+v`.
  const panel = o.doorKind === "barn" ? (o.swing === "out" ? -1 : 1) : 0;
  const omitted: string[] = [];
  const barTop = Math.min(head + c, top);
  const faces: Face[] = [];
  for (const s of [1, -1] as const) {
    const name: Face["name"] = s > 0 ? "+face" : "-face";
    if (s === panel) {
      omitted.push(`${name}:barn`);
      continue;
    }
    const [v0, v1] = s > 0 ? [half, half + p] : [-half - p, -half];
    const bar = barTop > head;
    faces.push({
      s,
      name,
      v0,
      v1,
      legs: [
        { poly: f.quad(-c, 0, v0, v1), z0: 0, z1: head },
        { poly: f.quad(f.w, f.w + c, v0, v1), z0: 0, z1: head },
      ],
      keep: [true, true],
      ends: bar
        ? [
            { poly: f.quad(-c, 0, v0, v1), z0: head, z1: barTop },
            { poly: f.quad(f.w, f.w + c, v0, v1), z0: head, z1: barTop },
          ]
        : null,
      mid: bar ? { poly: f.quad(0, f.w, v0, v1), z0: head, z1: barTop } : null,
      endKeep: [true, true],
      midKeep: true,
    });
  }
  return { kind: "door", input, f, result, faces, omitted, c, p, barTop };
}

/** Builds a doorway's casing as decided, registers what stands in `casings`, and ledgers it. */
function finishDoor(d: DoorPlan, casings: Obstacles, e: number, prism: Prism): void {
  const { o, head } = d.input;
  const { f, c, p, barTop } = d;
  const shells: Array<Shell | null> = [];
  const id = o.id;
  for (const face of d.faces) {
    face.legs.forEach((leg, k) => {
      if (!face.keep[k]) return;
      shells.push(prism(leg.poly, e, e + head));
      casings.add("trim", `casing ${id}`, leg, id);
    });
    if (face.ends && face.midKeep) {
      const u0 = face.endKeep[0] ? -c : 0;
      const u1 = face.endKeep[1] ? f.w + c : f.w;
      const bar = { poly: f.quad(u0, u1, face.v0, face.v1), z0: head, z1: barTop };
      shells.push(prism(bar.poly, e + head, e + barTop));
      casings.add("trim", `casing ${id}`, bar, id);
    }
  }
  const { parts, ledger } = d.result;
  if (shells.length) parts.push({ part: "casing", shells });
  ledger.push({
    kind: o.kind,
    id,
    field: "casing_mm",
    value: { width: c / MM, proud: p / MM, head: barTop > head },
    provenance: "default",
    rule: "door-casing-default",
  });
  if (d.omitted.length)
    ledger.push({
      kind: o.kind,
      id,
      field: "casing",
      value: d.omitted,
      provenance: "default",
      rule: "door-casing-omitted",
    });
}

/** Plans a window's reveal, sill and board: the curved and the unsilled cases are built at once. */
function planWindow(
  input: TrimInput,
  level: Level,
  e: number,
  prism: Prism,
): WindowPlan | { kind: "none"; result: TrimResult } {
  const { o, t, head, top } = input;
  const result: TrimResult = { parts: [], ledger: [] };
  const { parts, ledger } = result;
  const f = jambFrame(o);
  if (!f) return { kind: "none", result };
  const tm = t / MM;
  const half = t / 2;
  const ff = Math.min(OPENING_DETAIL.frameHalfDepth * MM, half);
  const inside = insideOf(o, t, level);
  ledger.push({
    kind: "window",
    id: o.id,
    field: "inside",
    value: inside === null ? "neither" : inside === "both" ? "both" : inside > 0 ? "+normal" : "-normal",
    provenance: "derived",
    rule: "window-inside-probe",
  });
  if (inside === null) return { kind: "none", result };
  const blocked = cutOverlap(o, level);
  if (blocked) {
    ledger.push({
      kind: "window",
      id: o.id,
      field: "trim",
      value: `cut overlaps ${blocked}`,
      provenance: "default",
      rule: "window-trim-omitted",
    });
    return { kind: "none", result };
  }
  const sector = cutSector(o.cut, o.jambs, o.centre);
  const ends = sector ? null : cutEnds(o, f.w);
  const hasSill = o.sill > 0;
  const zs = e + o.sill;
  const zh = e + head;
  const withHead = head < top;
  const bt = OPENING_DETAIL.boardThickness(tm) * MM;
  const st = OPENING_DETAIL.sillThickness(tm) * MM;
  const rl = OPENING_DETAIL.reveal(tm) * MM;
  const sides: Array<1 | -1> = inside === "both" ? [1, -1] : [inside];
  // The reveal: the interior half (both halves of an interior window), from the board, if it stands
  // (RM8.6b n5), or the sill block, to the head; none at a mitred end, where the window turns the
  // corner and has no jamb.
  const reveal = (boardBuilt: boolean): void => {
    const shells: Array<Shell | null> = [];
    if (half - ff >= MM) {
      for (const s of sides) {
        const [v0, v1] = s > 0 ? [ff, half] : [-half, -ff];
        const base = boardBuilt ? zs + bt : zs;
        if (sector) {
          // A millimetre off the frame: the arc's chords differ between the two bands, and the reveal
          // would otherwise overlap the frame by a sliver in the plane of its head.
          const k = sectorSign(o, sector);
          const [a, b] = s > 0 ? [ff + MM, half] : [-half, -ff - MM];
          shells.push(
            ...curvedLining(
              sector,
              rl,
              [[a * k, b * k].sort((x, y) => x - y) as [number, number]],
              base,
              zh,
              withHead,
              prism,
            ),
          );
          continue;
        }
        const m0 = ends?.mitred[0] ?? false;
        const m1 = ends?.mitred[1] ?? false;
        if (!m0) shells.push(prism(f.quad(0, rl, v0, v1), base, zh));
        if (!m1) shells.push(prism(f.quad(f.w - rl, f.w, v0, v1), base, zh));
        const [a, b] = [m0 ? 0 : rl, m1 ? f.w : f.w - rl];
        if (withHead && b > a) shells.push(prism(f.quad(a, b, v0, v1), zh - rl, zh));
      }
    }
    // The reveal comes first among the window's parts and rows.
    if (shells.length) parts.unshift({ part: "reveal", shells });
    ledger.splice(1, 0, {
      kind: "window",
      id: o.id,
      field: "reveal_mm",
      value: shells.length ? { thickness: rl / MM, head: withHead } : "omitted",
      provenance: "default",
      rule: "window-reveal-lining",
    });
  };
  if (inside === "both" || !hasSill) {
    reveal(false);
    ledger.push({
      kind: "window",
      id: o.id,
      field: "sill",
      value: inside === "both" ? "interior window" : "sill 0",
      provenance: "derived",
      rule: "window-sill-omitted",
    });
    return { kind: "none", result };
  }
  const sIn = inside;
  const sOut = -inside as 1 | -1;
  if (sector) {
    const k = sectorSign(o, sector);
    const band = (s: 1 | -1): [number, number] =>
      (s > 0 ? [ff * k, half * k] : [-half * k, -ff * k]).sort((a, b) => a - b) as [number, number];
    const [o0, o1] = band(sOut);
    const [i0, i1] = band(sIn);
    reveal(true);
    parts.push({ part: "sill", shells: [prism(sectorBand(sector, o0, o1), zs, zs + st)] });
    parts.push({ part: "board", shells: [prism(sectorBand(sector, i0, i1), zs, zs + bt)] });
    ledger.push({
      kind: "window",
      id: o.id,
      field: "sill_mm",
      value: { thickness: st / MM, board: bt / MM },
      provenance: "default",
      rule: "window-sill-curved-inside-cut",
    });
    return { kind: "none", result };
  }
  const proj = OPENING_DETAIL.sillProjection(tm) * MM;
  const horn = OPENING_DETAIL.sillHorn(tm) * MM;
  const over = OPENING_DETAIL.boardOverhang(tm) * MM;
  /** A slab on side `s` from the frame's face to `reach` past the wall's, its ends at `u0`/`u1`. */
  const quadAt = (s: 1 | -1, reach: number, u0: (v: number) => number, u1: (v: number) => number): Polygon => {
    const [va, vb] = s > 0 ? [ff, half + reach] : [-half - reach, -ff];
    return { outer: [f.at(u0(va), va), f.at(u1(va), va), f.at(u1(vb), vb), f.at(u0(vb), vb)] };
  };
  const jamb0 = (v: number): number => (ends?.mitred[0] ? ends.u(0, v) : 0);
  const jamb1 = (v: number): number => (ends?.mitred[1] ? ends.u(1, v) : f.w);
  const slabOf = (part: "sill" | "board", s: 1 | -1, reach: number, past: number, thickness: number): Slab => {
    const z = { z0: o.sill, z1: o.sill + thickness };
    return {
      part,
      core: { poly: quadAt(s, reach, jamb0, jamb1), ...z },
      // No horn at a mitred end (a window run to a corner stops on the mitre).
      horns: [
        ends?.mitred[0]
          ? null
          : {
              poly: quadAt(
                s,
                reach,
                () => -past,
                () => 0,
              ),
              ...z,
            },
        ends?.mitred[1]
          ? null
          : {
              poly: quadAt(
                s,
                reach,
                () => f.w,
                () => f.w + past,
              ),
              ...z,
            },
      ],
      hornKeep: [true, true],
      hornWhy: ["", ""],
      coreKeep: true,
      coreWhy: "",
      built: null,
      thickness,
    };
  };
  const slabs = [slabOf("sill", sOut, proj, horn, st), slabOf("board", sIn, over, over, bt)];
  const finish = (boardBuilt: boolean): void => {
    reveal(boardBuilt);
    for (const sl of slabs) {
      if (!sl.built) continue;
      parts.push({ part: sl.part, shells: [prism(sl.built, zs, zs + sl.thickness)] });
    }
    const [sill, board] = slabs as [Slab, Slab];
    if (sill.built)
      ledger.push({
        kind: "window",
        id: o.id,
        field: "sill_mm",
        value: { thickness: st / MM, projection: proj / MM, horn: horn / MM, mitred: ends?.mitred ?? [false, false] },
        provenance: "default",
        rule: "window-sill-exterior",
      });
    if (board.built)
      ledger.push({
        kind: "window",
        id: o.id,
        field: "board_mm",
        value: { thickness: bt / MM, overhang: over / MM },
        provenance: "default",
        rule: "window-board-interior",
      });
  };
  return {
    kind: "window",
    input,
    f,
    result,
    slabs,
    finish: () => {
      // Each slab as decided: its span, with each horn that stands; or left out, ledgered.
      for (const sl of slabs) {
        if (!sl.coreKeep) {
          ledger.push({
            kind: "window",
            id: o.id,
            field: sl.part,
            value: `clash ${sl.coreWhy}`,
            provenance: "derived",
            rule: sl.part === "sill" ? "window-sill-omitted" : "window-board-omitted",
          });
          continue;
        }
        const cut = END.flatMap((name, k) => (sl.horns[k] && !sl.hornKeep[k] ? [`${name}:${sl.hornWhy[k]}`] : []));
        if (cut.length)
          ledger.push({
            kind: "window",
            id: o.id,
            field: `${sl.part}_horn`,
            value: cut,
            provenance: "derived",
            rule: "window-sill-horn-omitted",
          });
        const s = sl.part === "sill" ? sOut : sIn;
        const reach = sl.part === "sill" ? proj : over;
        const past = sl.part === "sill" ? horn : over;
        sl.built = quadAt(
          s,
          reach,
          sl.horns[0] && sl.hornKeep[0] ? () => -past : jamb0,
          sl.horns[1] && sl.hornKeep[1] ? () => f.w + past : jamb1,
        );
      }
      finish((slabs[1] as Slab).built !== null);
    },
  };
}

/**
 * On a curved host, how the frame's `+v` reads radially: `+1` when `+v` points away from the arc's
 * centre at the opening (a band at `r + d` is then on the `+v` side for `d > 0`), else `−1`.
 */
function sectorSign(o: Opening, sector: CutSector): 1 | -1 {
  const [j0, j1] = o.jambs;
  const [dx, dy] = [j1[0] - j0[0], j1[1] - j0[1]];
  const [nx, ny] = [-dy, dx];
  const [rx, ry] = [o.centre[0] - sector.c[0], o.centre[1] - sector.c[1]];
  return nx * rx + ny * ry >= 0 ? 1 : -1;
}
