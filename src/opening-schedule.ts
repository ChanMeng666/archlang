/**
 * **`schedule openings`** — the door and window TAGS drawn beside each opening, and the rows
 * of the DOOR & WINDOW SCHEDULE table the sheet carries (`sheet-tables.ts` lays the table
 * out and lowers it; this module derives what it says and where each tag sits).
 *
 * Opt-in like every sheet table: a plan that does not write `schedule openings` never calls
 * anything here, so its drawing is byte-identical. Presentation only — `describe()` and
 * `lint()` never read it; every fact the table prints is already in `describe().doors[]` /
 * `windows[]` (the rooms, by the same derivation) or in the source (width, kind).
 *
 * **Rows are derived, never authored** (ADR 0005). Doors are tagged `D01, D02, …` and
 * windows `W01, W02, …` in element order, per storey (each page tabulates its own openings,
 * as `schedule rooms` does); the number is zero-padded to a uniform width.
 *
 * **A tag's position comes from the opening's shape and its host wall** — never a bounding
 * box or a centroid. Each side of the wall is probed one wall thickness off the centreline
 * (`wallFaceProbes`) and asked whether it is floor (the room/void rings, `pointInRoomBox`):
 *
 * - A **window** tag's first place is centred on the window, just off the face that HAS floor
 *   — inside the building, clear of the `dims auto` chains (every chain is outside) and of the
 *   sill nose (drawn on the face with no floor). Only when every inside place is taken may it
 *   take the outside face, and then only where that is clear of the chains too (below).
 * - A **door** tag sits BESIDE the doorway, never in front of it: past one jamb, just off a
 *   wall face. That keeps it out of the passage (the doorway's clear zone) on both sides and
 *   clear of the leaf's quarter-disc by construction — the disc is centred on the hinge with
 *   the opening's width as radius, so it reaches along the wall exactly to the far jamb and
 *   never behind the hinge. The face is one with floor that the door does not draw into
 *   (a hinged leaf, a barn panel, a bifold, a garage projection all occupy the `swing` face);
 *   the jamb is the hinge jamb, or for a non-hinged kind the jamb opposite where the panel
 *   parks.
 *
 * Those are the FIRST choices. A tag must also be clear of everything else on its storey —
 * every opening as far as it draws (a leaf's quarter-disc, a panel, a sill nose; the passage
 * itself only to the faces), every straight wall's poché, everything already drawn (furniture,
 * stairs, dimension and axis lines and numbers) and every tag already placed — so each tag
 * tries its candidates in order (a door: both jambs on its preferred face, then on the other
 * face, then one tag-depth further out on the preferred face; a window: centred, beside each
 * jamb, the other face, then the preferred face one tag-depth further out) and takes the
 * first that is clear — so a tag reaches the outside face of an exterior wall only when that
 * place is clear of the dimension chains and everything else.
 * When none is, two tags must still never overlap: it takes the first candidate clear of every
 * other tag — which may be over other ink — and only when none is, its first choice. So a tag
 * moves off ink only to a place free of everything, and off another tag to a place free of
 * tags. The work is bounded (a grid of obstacles, a capped probe per candidate), so it is
 * linear in the tags.
 *
 * What it does not do: step past a room's name (the label pass moves the name instead, once
 * it is buried far enough), or find room where every candidate is taken — the corpus guard
 * (`test/opening-tags-corpus.test.ts`) pins each such tag.
 *
 * Text is ASCII (`D01`, `hinged`, `left`, a dash for "none"), so the PNG backend's bundled
 * font draws all of it; numbers print through {@link fmt2}.
 */

import type { Point } from "./ast.js";
import type { RDoor, ResolvedElement, ROpening, RRoom, RVoid, RWall, RWindow } from "./ir.js";
import type { RenderSizes, SceneNode } from "./scene.js";
import type { Theme } from "./theme.js";
import type { WallSegment } from "./geometry.js";
import {
  add,
  distPointToWallSegment,
  doorSwing,
  mul,
  normal,
  segmentDirAt,
  segmentsOfWall,
  sub,
  wallFaceProbes,
} from "./geometry.js";
import { connectorConnection, DEFAULT_TOL, EXTERIOR_NODE, pointInRoomBox, type RoomBox, roomBox } from "./analyze.js";
import { textWidth } from "./text-metrics.js";
import { primBBox } from "./label-placement.js";
import { ROOF_LAYER } from "./elements/roof.js";
import { OUTDOOR_LAYERS } from "./elements/outdoor.js";
import { SILL_PROJECTION } from "./elements/window.js";
import { fmt2 } from "./num-format.js";

/** One DOOR & WINDOW SCHEDULE line. Every cell is the string drawn. */
export interface OpeningRow {
  /** `D01…` / `W01…` — the tag drawn beside the opening. */
  tag: string;
  kind: "door" | "window";
  /** The opening's resolved id (not drawn; the handle back to `describe()`). */
  id: string;
  /** The room(s) it opens onto, by name (`label`, else id), joined by ` / `; `exterior`
   *  for the outside; `-` when it sits on no room edge. */
  rooms: string;
  /** Nominal width in mm, through {@link fmt2}. */
  width: string;
  /** A door's kind (`hinged` when none was written); `window` for a window. */
  type: string;
  /** A hinged door's hand (`left`/`right`, see {@link doorHand}); `-` otherwise. */
  hand: string;
}

/** The doors and windows a storey tags, each list in element order. */
function taggable(elements: readonly ResolvedElement[]): { doors: RDoor[]; windows: RWindow[] } {
  return {
    doors: elements.filter((e): e is RDoor => e.kind === "door"),
    windows: elements.filter((e): e is RWindow => e.kind === "window"),
  };
}

/** How many tags (and table rows) a storey's `schedule openings` draws. */
export function openingCount(elements: readonly { kind: string }[]): number {
  let n = 0;
  for (const e of elements) if (e.kind === "door" || e.kind === "window") n++;
  return n;
}

/** `prefix` + 1-based index, zero-padded to the list's uniform width (`D01 … D09`, `D001 …`). */
const tagOf = (prefix: string, i: number, count: number): string =>
  prefix + String(i + 1).padStart(Math.max(2, String(count).length), "0");

/**
 * A hinged door's HAND, read off the leaf's own geometry: stand on the side the door opens
 * INTO, face the door, and the hinge is on your `left` or your `right` (EN 12519 / DIN 107,
 * read from the pull side; North American ANSI/BHMA handing reads from the push side, so an
 * inswing door's hand is the other word there). It is NOT the `hinge left|right` clause, which is measured along the
 * host wall's traversal and so flips with the order a wall's points were written in; this
 * reads the drawn leaf, so it changes exactly when the drawing does — a mirrored `place`
 * swaps it, a rotation does not. `null` for a door with no swing (unhosted, or a non-hinged
 * kind).
 */
export function doorHand(d: RDoor): "left" | "right" | null {
  const s = doorSwing(d);
  if (!s) return null;
  // Facing the door from the swing side is facing -leaf; on a y-down page the viewer's
  // right of a facing `f` is `(-f.y, f.x)`.
  const leaf = sub(s.leafEnd, s.hinge);
  const right = { x: leaf.y, y: -leaf.x };
  const h = sub(s.hinge, d.at);
  return h.x * right.x + h.y * right.y > 0 ? "right" : "left";
}

/** The rooms (and voids) whose floors the probes test, in element order. */
function floorBoxes(elements: readonly ResolvedElement[]): RoomBox[] {
  return elements.filter((e): e is RRoom | RVoid => e.kind === "room" || e.kind === "void").map(roomBox);
}

/** Index of the first floor ring holding `p`, or -1 when `p` is on no floor. */
function floorIndex(p: Point, boxes: readonly RoomBox[]): number {
  for (let i = 0; i < boxes.length; i++) if (pointInRoomBox(p, boxes[i]!)) return i;
  return -1;
}

/** Derive the schedule rows for one storey: doors first, then windows, each in element order. */
export function openingRows(elements: readonly ResolvedElement[]): OpeningRow[] {
  const { doors, windows } = taggable(elements);
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const roomRects = new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)]));
  const nameOf = new Map(rooms.map((r) => [r.id, r.label ?? r.id]));
  const named = (ids: readonly string[]): string =>
    ids.length === 0 ? "-" : ids.map((id) => nameOf.get(id) ?? id).join(" / ");
  const rows: OpeningRow[] = doors.map((d, i) => ({
    tag: tagOf("D", i, doors.length),
    kind: "door",
    id: d.id,
    rooms: named(connectorConnection(d, roomRects, DEFAULT_TOL).between),
    width: fmt2(d.width),
    type: d.doorKind ?? "hinged",
    hand: doorHand(d) ?? "-",
  }));
  windows.forEach((w, i) => {
    // The rooms either side, by the doors' own derivation: an exterior window lists its one
    // room (the outside is not a room it serves), an interior window on a shared wall both.
    // The first is `describe().windows[].room`, except where three or more rooms meet at the
    // window and the face probe decides which two it joins.
    const between = connectorConnection(w, roomRects, DEFAULT_TOL).between.filter((id) => id !== EXTERIOR_NODE);
    rows.push({
      tag: tagOf("W", i, windows.length),
      kind: "window",
      id: w.id,
      rooms: named(between),
      width: fmt2(w.width),
      type: "window",
      hand: "-",
    });
  });
  return rows;
}

/** Primitives one tag draws: its frame (a door's circle, a window's box) and its text. */
export const TAG_PRIMITIVES = 2;

/** A tag's text size: the dimension font, so a tag reads at the weight a dimension does. */
const tagFont = (sizes: RenderSizes): number => sizes.dimFont;

/** The tag frame's half-extents: a door's circle radius / a window's box half-width and
 *  half-height, sized to the text so it never crosses it. */
function tagFrame(text: string, fs: number): { r: number; hw: number; hh: number } {
  const half = textWidth(text, fs) / 2 + fs * 0.35;
  return { r: Math.max(half, fs * 0.9), hw: half, hh: fs * 0.8 };
}

/**
 * Something a tag must not cover, as a box in its OWN frame: `u` along `dir` from `at`
 * spanning `[lo, hi]`, `v` across it (along `n`, the left normal) reaching `plus` on the `+n`
 * side and `minus` on the `-n` side. Three kinds share the shape:
 *
 * - an **opening**: its span along the wall (and, for a `barn` door, the panel parked beside
 *   it on the `slide` side). Past each face it reaches only as far as it DRAWS: a hinged leaf,
 *   a bifold or a garage projection its own width on the face it opens into; a barn panel a
 *   wall thickness there; a window its sill nose on the face with no floor; everything else —
 *   the passage itself, a sliding or pocket panel inside the wall, a cased opening — stops
 *   half a stand-off past the face, so a tag standing off that face beside it is clear;
 * - a straight **wall segment**: its centreline band, half its thickness each side — the
 *   poché a tag must not sit in (a perpendicular wall at a jamb, a party wall);
 * - a placed **tag**: its bounding box, so no two tags overlap.
 */
interface Obstacle {
  at: Point;
  dir: Point;
  n: Point;
  lo: number;
  hi: number;
  plus: number;
  minus: number;
  /** Set on a curved wall segment, which is tested by distance instead of by its frame. */
  arc?: WallSegment;
  half?: number;
  /** De-duplicates an obstacle met in several grid cells of one query. */
  seen: number;
}

/** The axis-aligned bounds of an obstacle, for the grid. */
function obstacleBounds(o: Obstacle): { minX: number; minY: number; maxX: number; maxY: number } {
  if (o.arc) {
    const r = o.arc.arc!.r + (o.half ?? 0);
    const c = o.arc.arc!.center;
    return { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [o.lo, o.hi])
    for (const v of [o.plus, -o.minus]) {
      xs.push(o.at.x + o.dir.x * u + o.n.x * v);
      ys.push(o.at.y + o.dir.y * u + o.n.y * v);
    }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** An opening's obstacle; `floorSide` is the face with floor (`0` for both or neither). */
function openingObstacle(o: RDoor | RWindow | ROpening, floorSide: 1 | -1 | 0, gap: number): Obstacle | null {
  const seg = o.host;
  if (!seg) return null;
  const dir = segmentDirAt(seg, o.at);
  const h = seg.thickness / 2;
  const passage = h + gap / 2;
  let lo = -o.width / 2;
  let hi = o.width / 2;
  let plus = passage;
  let minus = passage;
  if (o.kind === "door") {
    const kind = o.doorKind ?? "hinged";
    const face: 1 | -1 = o.swing === "in" ? 1 : -1;
    let reach = 0;
    if (kind === "hinged" || kind === "bifold" || kind === "garage") reach = h + o.width;
    else if (kind === "barn") {
      reach = h + seg.thickness;
      if (o.slide === "right") hi += o.width;
      else lo -= o.width;
    }
    if (reach > 0) {
      if (face === 1) plus = Math.max(plus, reach);
      else minus = Math.max(minus, reach);
    }
  } else if (o.kind === "window" && floorSide !== 0) {
    // The sill nose stands proud of the face with no floor, by `SILL_PROJECTION` of the wall.
    const sill = h + seg.thickness * SILL_PROJECTION;
    if (floorSide === 1) minus = Math.max(minus, sill);
    else plus = Math.max(plus, sill);
  }
  return { at: o.at, dir, n: normal(dir), lo, hi, plus, minus, seen: 0 };
}

/** A straight band `half` either side of `a`→`b` (a wall's poché, a drawn line's stroke). */
function bandObstacle(a: Point, b: Point, half: number): Obstacle | null {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y);
  if (!(len > 0)) return null;
  const dir = { x: d.x / len, y: d.y / len };
  return { at: a, dir, n: normal(dir), lo: 0, hi: len, plus: half, minus: half, seen: 0 };
}

/** A wall segment's obstacle: its poché band (a curved one by distance, see {@link covers}). */
function wallObstacle(s: WallSegment): Obstacle | null {
  const half = s.thickness / 2;
  if (s.arc)
    return { at: s.a, dir: { x: 1, y: 0 }, n: { x: 0, y: 1 }, lo: 0, hi: 0, plus: 0, minus: 0, arc: s, half, seen: 0 };
  return bandObstacle(s.a, s.b, half);
}

/** Does a tag centred at `c`, reaching `ext(u)` along any unit `u` (and `radius` at most),
 *  cover the obstacle? Exact for a box in a straight frame; a curved wall by distance. */
function covers(c: Point, ext: (u: Point) => number, radius: number, o: Obstacle): boolean {
  if (o.arc) return distPointToWallSegment(c, o.arc) < (o.half ?? 0) + radius;
  const d = sub(c, o.at);
  const u = d.x * o.dir.x + d.y * o.dir.y;
  const v = d.x * o.n.x + d.y * o.n.y;
  const eu = ext(o.dir);
  const ev = ext(o.n);
  return u + eu > o.lo && u - eu < o.hi && v - ev < o.plus && -v - ev < o.minus;
}

/**
 * A uniform grid of obstacles: a query visits only the cells its box touches. Bounded by
 * construction — an obstacle spanning more than {@link MAX_CELLS} cells goes on a shared list
 * every query visits, and a query that would examine more than {@link MAX_PROBE} entries
 * stops and answers "not clear" — so placing every tag is linear in the tags, however the
 * openings are stacked, and the answer is the same on every run (the order is fixed).
 */
const MAX_CELLS = 256;
const MAX_PROBE = 4096;
class ObstacleGrid {
  private readonly cells = new Map<number, Map<number, Obstacle[]>>();
  private readonly wide: Obstacle[] = [];
  private stamp = 0;
  constructor(private readonly cell: number) {}
  private at(v: number): number {
    return Math.floor(v / this.cell);
  }
  add(o: Obstacle): void {
    const b = obstacleBounds(o);
    const x0 = this.at(b.minX);
    const x1 = this.at(b.maxX);
    const y0 = this.at(b.minY);
    const y1 = this.at(b.maxY);
    if (!(Number.isFinite(x0) && Number.isFinite(x1) && Number.isFinite(y0) && Number.isFinite(y1))) return;
    if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_CELLS)) {
      this.wide.push(o);
      return;
    }
    for (let cx = x0; cx <= x1; cx++) {
      let col = this.cells.get(cx);
      if (!col) {
        col = new Map();
        this.cells.set(cx, col);
      }
      for (let cy = y0; cy <= y1; cy++) {
        const list = col.get(cy);
        if (list) list.push(o);
        else col.set(cy, [o]);
      }
    }
  }
  /** True when nothing in the grid is covered by a tag at `c` (see {@link covers}). */
  clear(c: Point, ext: (u: Point) => number, halfX: number, halfY: number, radius: number): boolean {
    const stamp = ++this.stamp;
    let probes = 0;
    const hit = (o: Obstacle): boolean => {
      if (o.seen === stamp) return false;
      o.seen = stamp;
      return covers(c, ext, radius, o);
    };
    for (const o of this.wide) {
      if (++probes > MAX_PROBE) return false;
      if (hit(o)) return false;
    }
    const x0 = this.at(c.x - halfX);
    const x1 = this.at(c.x + halfX);
    const y0 = this.at(c.y - halfY);
    const y1 = this.at(c.y + halfY);
    for (let cx = x0; cx <= x1; cx++) {
      const col = this.cells.get(cx);
      if (!col) continue;
      for (let cy = y0; cy <= y1; cy++) {
        for (const o of col.get(cy) ?? []) {
          if (++probes > MAX_PROBE) return false;
          if (hit(o)) return false;
        }
      }
    }
    return true;
  }
}

/**
 * The candidate centres for one tag, in preference order — see the module header for the
 * rule that orders them. A window: centred on its floor face, then beside each jamb on that
 * face, then centred on the other face. A door: beside its preferred jamb on its preferred
 * face, then the other jamb, then the same two on the other face. `ext(u)` is how far the
 * tag's frame reaches along the unit `u`, so every stand-off is exact at any wall angle.
 */
function tagCandidates(o: RDoor | RWindow, boxes: readonly RoomBox[], ext: (u: Point) => number, gap: number): Point[] {
  const seg = o.host;
  if (!seg) return [o.at];
  const dir = segmentDirAt(seg, o.at);
  const n = normal(dir);
  const h = seg.thickness / 2;
  const { plus, minus } = wallFaceProbes(seg, o.at, Math.max(seg.thickness, 1));
  const fPlus = floorIndex(plus, boxes);
  const fMinus = floorIndex(minus, boxes);
  // Sides as signs of `n`. The floor side: the one with floor, or — floor on both — the one
  // whose room comes first in element order (a fact `place` carries unchanged); `-n` when
  // neither has floor or both are the same room.
  const hasFloor = (s: 1 | -1): boolean => (s > 0 ? fPlus : fMinus) >= 0;
  const floorSide: 1 | -1 = fPlus >= 0 && (fMinus < 0 || fPlus < fMinus) ? 1 : -1;
  // `ring` 1 stands one more tag-depth off the face: the second row a tag tries, on the
  // face it prefers only, after every first-row place is taken.
  const standOff = (s: 1 | -1, ring = 0): Point => {
    const e = ext(mul(n, s));
    return mul(n, s * (h + gap + e + ring * (2 * e + gap)));
  };
  const beside = (a: 1 | -1): Point => mul(dir, a * (o.width / 2 + gap + ext(dir)));

  if (o.kind === "window") {
    const off = standOff(floorSide);
    const off2 = standOff(floorSide, 1);
    return [
      add(o.at, off),
      add(add(o.at, beside(-1)), off),
      add(add(o.at, beside(1)), off),
      add(o.at, standOff(floorSide === 1 ? -1 : 1)),
      add(o.at, off2),
      add(add(o.at, beside(-1)), off2),
      add(add(o.at, beside(1)), off2),
    ];
  }

  // A door: the face it draws INTO (a hinged leaf, a barn panel, a bifold, a garage
  // projection — all on the `swing` face, as `door.render` draws them), if any. Prefer a
  // floor face it leaves free, then the floor face it occupies, then the free face.
  const kind = o.doorKind ?? "hinged";
  const occupied: 1 | -1 | 0 = kind === "sliding" || kind === "pocket" ? 0 : o.swing === "in" ? 1 : -1;
  let side: 1 | -1;
  if (occupied === 0) side = floorSide;
  else {
    const free = occupied === 1 ? -1 : 1;
    side = hasFloor(free) ? free : hasFloor(occupied) ? occupied : free;
  }
  // The jamb: the hinge jamb, or for a non-hinged kind the one opposite where its panel
  // parks (`slide`, measured along the traversal exactly as `hinge` is).
  const along: 1 | -1 = kind === "hinged" ? (o.hinge === "left" ? -1 : 1) : o.slide === "right" ? -1 : 1;
  const flip: 1 | -1 = along === 1 ? -1 : 1;
  const other: 1 | -1 = side === 1 ? -1 : 1;
  return [
    add(add(o.at, beside(along)), standOff(side)),
    add(add(o.at, beside(flip)), standOff(side)),
    add(add(o.at, beside(along)), standOff(other)),
    add(add(o.at, beside(flip)), standOff(other)),
    add(add(o.at, beside(along)), standOff(side, 1)),
    add(add(o.at, beside(flip)), standOff(side, 1)),
  ];
}

/**
 * The tags' Scene primitives for one storey, on the `annotations` pass: per door a circle
 * and its tag, per window a box and its tag — {@link TAG_PRIMITIVES} each, which is what the
 * drawing budget counts.
 *
 * Each tag takes its FIRST candidate (see {@link tagCandidates}) when that is clear of every
 * obstacle of the storey — every opening as far as it draws, every straight wall's poché,
 * everything already drawn, every tag already placed — and otherwise the first candidate that
 * is. When none is clear, the first candidate clear of the other TAGS (two tags never overlap,
 * though that place may be over other ink), and only when none is, the first. Tags are placed
 * doors first, then windows, each in element order.
 */
export function openingTagNodes(
  elements: readonly ResolvedElement[],
  theme: Theme,
  sizes: RenderSizes,
  drawn: readonly SceneNode[] = [],
  /** The walls an element derives (`ElementDef.yieldsWalls` from the caller's registry): a
   *  derived wall is an obstacle too, though it is never an element. */
  derivedWallsOf: (e: ResolvedElement) => readonly RWall[] | undefined = () => undefined,
  /** Room-name nodes an authored `label "…" at (x,y)` pinned: the label pass never moves
   *  them, so a tag must keep off them as it does off furniture. */
  pinned: ReadonlySet<SceneNode> = new Set(),
): SceneNode[] {
  const { doors, windows } = taggable(elements);
  const boxes = floorBoxes(elements);
  const fs = tagFont(sizes);
  const gap = fs * 0.4;
  const ink = theme.annotation;
  const out: SceneNode[] = [];

  // The storey's obstacles, in one grid whose cell is a few tags wide.
  const grid = new ObstacleGrid(fs * 6);
  const tags = new ObstacleGrid(fs * 6);
  for (const e of elements) {
    // A wall-deriving statement's walls (`walls from rooms`) are walls here too (never elements).
    const walls = e.kind === "wall" ? [e as RWall] : (derivedWallsOf(e) ?? []);
    if (walls.length > 0) {
      for (const w of walls) {
        for (const s of segmentsOfWall(w)) {
          const o = wallObstacle(s);
          if (o) grid.add(o);
        }
      }
      continue;
    }
    if (e.kind !== "door" && e.kind !== "window" && e.kind !== "opening") continue;
    const o = e as RDoor | RWindow | ROpening;
    let floorSide: 1 | -1 | 0 = 0;
    if (o.kind === "window" && o.host) {
      const { plus, minus } = wallFaceProbes(o.host, o.at, Math.max(o.host.thickness, 1));
      const p = floorIndex(plus, boxes) >= 0;
      const m = floorIndex(minus, boxes) >= 0;
      floorSide = p === m ? 0 : p ? 1 : -1;
    }
    const z = openingObstacle(o, floorSide, gap);
    if (z) grid.add(z);
  }
  // Everything already drawn that a tag could print over — furniture, stairs, door leaves and
  // panels, dimension lines and numbers, axis lines and bubbles — by each primitive's box (a
  // line by its stroke),
  // filtered the way the room-label pass filters its obstacles: never the floor or the wall
  // fills (the walls are in by segment above), a roof outline or the ground (each boxes the
  // whole site), and never a room's name, which moves off a tag after this pass — unless the
  // author pinned it with `label … at`, which the label pass will not move.
  for (const n of drawn) {
    if (n.layer === "floor" || n.layer === "wallFill" || n.layer === "wallFace") continue;
    if (n.layer === "labels" && !pinned.has(n)) continue;
    // The annotations pass holds only the lot line here (the tables come after the tags).
    if (n.layer === "annotations") continue;
    if (n.layerName === ROOF_LAYER) continue;
    if (n.layerName !== undefined && OUTDOOR_LAYERS.includes(n.layerName)) continue;
    if (n.prim.t === "line") {
      // A line is its stroke, not its box: a dimension or an axis line crosses a whole room.
      const l = bandObstacle(n.prim.a, n.prim.b, (n.paint.width ?? 0) / 2);
      if (l) grid.add(l);
      continue;
    }
    const b = primBBox(n.prim);
    if (!b) continue;
    grid.add({
      at: { x: b.x, y: b.y },
      dir: { x: 1, y: 0 },
      n: { x: 0, y: 1 },
      lo: 0,
      hi: b.w,
      plus: b.h,
      minus: 0,
      seen: 0,
    });
  }

  const place = (o: RDoor | RWindow, ext: (u: Point) => number, halfX: number, halfY: number): Point => {
    const radius = Math.hypot(halfX, halfY);
    const candidates = tagCandidates(o, boxes, ext, gap);
    // Strictly clear of everything, else at least clear of every tag already placed (two tags
    // on top of each other read as neither), else the first choice.
    const c =
      candidates.find((p) => grid.clear(p, ext, halfX, halfY, radius)) ??
      candidates.find((p) => tags.clear(p, ext, halfX, halfY, radius)) ??
      candidates[0]!;
    const box = (): Obstacle => ({
      at: c,
      dir: { x: 1, y: 0 },
      n: { x: 0, y: 1 },
      lo: -halfX,
      hi: halfX,
      plus: halfY,
      minus: halfY,
      seen: 0,
    });
    grid.add(box());
    tags.add(box());
    return c;
  };

  const text = (at: Point, value: string): SceneNode => ({
    layer: "annotations",
    prim: { t: "text", at, value, size: fs, anchor: "middle", baseline: "central" },
    paint: { fill: ink },
  });
  doors.forEach((d, i) => {
    const tag = tagOf("D", i, doors.length);
    const { r } = tagFrame(tag, fs);
    const c = place(d, () => r, r, r);
    out.push({
      layer: "annotations",
      prim: { t: "circle", center: c, r },
      paint: { fill: "none", stroke: ink, width: sizes.thin },
      lineWeight: "thin",
    });
    out.push(text(c, tag));
  });
  windows.forEach((w, i) => {
    const tag = tagOf("W", i, windows.length);
    const { hw, hh } = tagFrame(tag, fs);
    const c = place(w, (u) => Math.abs(u.x) * hw + Math.abs(u.y) * hh, hw, hh);
    out.push({
      layer: "annotations",
      prim: {
        t: "polygon",
        pts: [
          { x: c.x - hw, y: c.y - hh },
          { x: c.x + hw, y: c.y - hh },
          { x: c.x + hw, y: c.y + hh },
          { x: c.x - hw, y: c.y + hh },
        ],
      },
      paint: { fill: "none", stroke: ink, width: sizes.thin },
      lineWeight: "thin",
    });
    out.push(text(c, tag));
  });
  return out;
}
