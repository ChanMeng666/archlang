/**
 * The measures behind the clearance family of plan-soundness PS2.11 (`rules/clearances.ts`):
 * a WC's two side strips, and the band a window's span makes on its host wall. Stated once here
 * so the rules and the placement check every quoted position passes (`placementClear`,
 * `fixture-paste.ts`) read the same geometry: a hint never quotes a WC into a corner or a fridge
 * in front of a window that the rule would then report.
 *
 * Shapes, never bounding boxes: a piece's footprint is a quarter-turned rectangle, so its
 * rectangle is its shape; a wall is its straight body; a window is its span on its host.
 */

import { backEdgeOfDeg } from "../algebra/d4.js";
import type { Point } from "../ast.js";
import { DOOR_HEAD } from "../datum.js";
import { canonicalFixture } from "../elements/fixtures-glyphs.js";
import { cutPlaneLayer, isTallUnit } from "../fixtures-catalog.js";
import {
  area2,
  type ClearMeasure,
  type ClearWorld,
  clearStrips,
  clipToRect,
  measureStrip,
  type Strip,
} from "../furniture-relation.js";
import type { WallSegment } from "../geometry.js";
import { type Arc, arcContainsRay, distPointToArc } from "../geometry/arc.js";
import type { BBox } from "../geometry/rect.js";
import { pointInRoomBox } from "../analyze.js";
import type { RFurniture, RRoom, RWindow } from "../ir.js";
import type { LintContext } from "./context.js";
import { WALL_COLLISION_SLACK_MM } from "./measure.js";

/** Is this category a WC (the `wc` family: `wc`, `toilet`)? */
export const isWc = (category: string): boolean => canonicalFixture(category) === "wc";

/** A counter, worktop or bar counter: standing across a cased opening, it is a servery hatch, which
 *  `W_DOORWAY_BLOCKED` does not read as blocking the opening (PS2.11e). */
export const isServiceCounter = (category: string): boolean => {
  const family = canonicalFixture(category);
  return family === "counter" || family === "bar_counter";
};

/** Is this category a cooking surface (the `stove` family: `stove`, `hob`, `cooktop`)? */
export const isCookingSurface = (category: string): boolean => canonicalFixture(category) === "stove";

/** The room a piece stands in: its declared room, else the first room whose floor holds the
 *  footprint's centre; `null` when none does. */
export function roomOf(f: RFurniture, ctx: Pick<LintContext, "rooms" | "roomRects">): RRoom | null {
  if (f.room !== undefined) {
    const r = ctx.rooms.find((x) => x.id === f.room);
    if (r) return r;
  }
  const c = { x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 };
  return (
    ctx.rooms.find((r) => {
      const box = ctx.roomRects.get(r.id);
      return box !== undefined && pointInRoomBox(c, box);
    }) ?? null
  );
}

/** What {@link wcWorld} reads off a lint context. */
export type WcWorldSource = Pick<LintContext, "wallSegs" | "doors" | "openings">;

/**
 * The straight wall bodies a WC's side can meet: every straight segment with the span of each
 * door and cased opening it hosts cut out, so a pan beside a doorway is measured to the jamb, not
 * to wall that is not there (the seam `W_FURNITURE_WALL_COLLISION` subtracts too). A window is
 * not cut: the wall stands under its sill, at the height a pan's side is. Curved segments are
 * left out (their body is not a polygon here; {@link curvedNear} says when one is near).
 */
function cutSegments(src: WcWorldSource): WallSegment[] {
  // Keyed on all three arrays, so a context copied with other doors or openings never reads
  // another's cut (a copy that shares the three arrays, as `pasteSet`'s do, shares the cut).
  let byDoors = CUT.get(src.wallSegs);
  if (!byDoors) {
    byDoors = new WeakMap();
    CUT.set(src.wallSegs, byDoors);
  }
  let byOpenings = byDoors.get(src.doors);
  if (!byOpenings) {
    byOpenings = new WeakMap();
    byDoors.set(src.doors, byOpenings);
  }
  const cached = byOpenings.get(src.openings);
  if (cached) return cached;
  const out: WallSegment[] = [];
  for (const s of src.wallSegs) {
    if (s.arc) continue;
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len === 0) continue;
    const d = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len };
    const n = { x: -d.y, y: d.x };
    const voids: Array<[number, number]> = [];
    for (const o of [...src.doors, ...src.openings]) {
      const across = (o.at.x - s.a.x) * n.x + (o.at.y - s.a.y) * n.y;
      if (Math.abs(across) > s.thickness / 2 + 1) continue;
      const along = (o.at.x - s.a.x) * d.x + (o.at.y - s.a.y) * d.y;
      if (along + o.width / 2 <= 0 || along - o.width / 2 >= len) continue;
      voids.push([along - o.width / 2, along + o.width / 2]);
    }
    if (voids.length === 0) {
      out.push(s);
      continue;
    }
    voids.sort((p, q) => p[0] - q[0]);
    let at = 0;
    const piece = (lo: number, hi: number): void => {
      if (hi - lo <= 0) return;
      out.push({
        ...s,
        a: { x: s.a.x + d.x * lo, y: s.a.y + d.y * lo },
        b: { x: s.a.x + d.x * hi, y: s.a.y + d.y * hi },
      });
    };
    for (const [lo, hi] of voids) {
      piece(at, Math.min(lo, len));
      at = Math.max(at, hi);
    }
    piece(at, len);
  }
  byOpenings.set(src.openings, out);
  return out;
}
const CUT = new WeakMap<
  readonly WallSegment[],
  WeakMap<readonly object[], WeakMap<readonly object[], WallSegment[]>>
>();

/** The obstacles a WC's sides are measured against: the pieces at the cut plane (a mirror or a
 *  wall cabinet above, a rug below, are not beside the pan), every straight wall body with its
 *  doorways cut out ({@link cutSegments}), and no door swing (a door clears by closing;
 *  `W_SWING_OBSTRUCTED` judges the leaf). */
export function wcWorld(furniture: readonly RFurniture[], src: WcWorldSource): ClearWorld {
  return {
    furniture: furniture.filter((f) => cutPlaneLayer(f.category) === "body"),
    segments: cutSegments(src),
    swings: [],
  };
}

/**
 * Does a curved wall's body reach into either side strip of a pan? The exact distance from the
 * strip's rectangle to each arc's centreline ({@link rectToArc}), against half the wall's
 * thickness: the shape, never its bounding box. The WC rule then declines the pan with a
 * `curved-wc-wall` coverage skip rather than measure one side and not the other.
 */
export function curvedNear(wallSegs: readonly WallSegment[], strips: readonly Strip[]): boolean {
  const arcs = wallSegs.filter((s) => s.arc);
  if (arcs.length === 0) return false;
  const boxes = strips.map(stripBox);
  return arcs.some((s) => boxes.some((b) => rectToArc(b, s.arc!) < s.thickness / 2));
}

/**
 * The least distance from an axis-aligned rectangle (closed) to an arc, `0` when they meet. The
 * nearest pair lies at an arc endpoint, a rectangle corner (its distance to the arc), a crossing of
 * the circle with a rectangle edge inside the sweep, or the circle's nearest approach to an edge
 * (the edge outside the circle, along the radial through the edge's point nearest the centre,
 * when that radial is inside the sweep). Closed form, no tessellation.
 */
export function rectToArc(r: BBox, arc: Arc): number {
  const inRect = (p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (inRect(arc.a) || inRect(arc.b)) return 0;
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  let best = Math.min(...corners.map((p) => distPointToArc(p, arc)), distToRect(arc.a, r), distToRect(arc.b, r));
  const { center: c, r: R } = arc;
  for (let i = 0; i < 4; i++) {
    const p = corners[i]!;
    const q = corners[(i + 1) % 4]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    // The foot of the perpendicular from the centre on the edge's line, and the edge's point
    // nearest the centre (the foot clamped to the edge).
    const t0 = ((c.x - p.x) * dx + (c.y - p.y) * dy) / len2;
    const t = Math.max(0, Math.min(1, t0));
    const m = { x: p.x + dx * t, y: p.y + dy * t };
    const dm = Math.hypot(m.x - c.x, m.y - c.y);
    if (dm >= R && arcContainsRay(arc, m)) best = Math.min(best, dm - R);
    // The circle's crossings with the edge's line, kept when on the edge and inside the sweep.
    const dLine = Math.hypot(p.x + dx * t0 - c.x, p.y + dy * t0 - c.y);
    if (dLine <= R) {
      const along = Math.sqrt(Math.max(0, R * R - dLine * dLine) / len2);
      for (const s of [t0 - along, t0 + along]) {
        if (s < 0 || s > 1) continue;
        const x = { x: p.x + dx * s, y: p.y + dy * s };
        if (arcContainsRay(arc, x)) return 0;
      }
    }
  }
  return best;
}

/** Distance from a point to a closed axis-aligned rectangle (0 inside). */
function distToRect(p: Point, r: BBox): number {
  const nx = Math.min(Math.max(p.x, r.x), r.x + r.w);
  const ny = Math.min(Math.max(p.y, r.y), r.y + r.h);
  return Math.hypot(p.x - nx, p.y - ny);
}

/** A strip as a plan rectangle. */
function stripBox(s: Strip): BBox {
  const a = s.face;
  const b = s.face + s.depth * (s.u.x !== 0 ? s.u.x : s.u.y);
  const n0 = Math.min(a, b);
  const n1 = Math.max(a, b);
  return s.u.x !== 0 ? { x: n0, y: s.lo, w: n1 - n0, h: s.hi - s.lo } : { x: s.lo, y: n0, w: s.hi - s.lo, h: n1 - n0 };
}

/** One side of a WC as measured: its strip and what stands in it (`by: null`: nothing within). */
export interface WcSide {
  strip: Strip;
  m: ClearMeasure;
}

/** A WC's two sides, measured `need − half` deep, or `null` when the pan is at least twice the
 *  figure wide (it clears the figure by itself). */
export interface WcSides {
  /** Half the pan's width: its centreline to either side face. */
  half: number;
  /** How deep each strip is measured: the figure less {@link half}. */
  depth: number;
  sides: [WcSide, WcSide];
}

/**
 * The two side strips of a pan `rect` at quarter-turn `turn`, `depth` deep, each pulled in from
 * the pan's BACK end by {@link WALL_COLLISION_SLACK_MM}: a pan drawn a few millimetres into the
 * wall it backs onto is flush by `W_FURNITURE_WALL_COLLISION`'s own tolerance, and that wall's
 * body must not then read as standing beside it.
 */
export function wcStrips(rect: BBox, turn: number | undefined, depth: number): [Strip, Strip] {
  const back = backEdgeOfDeg(turn);
  const inset = Math.min(WALL_COLLISION_SLACK_MM, (back === "top" || back === "bottom" ? rect.h : rect.w) / 2);
  const [a, b] = clearStrips(rect, turn, "sides", depth).map((s) =>
    back === "top" || back === "left" ? { ...s, lo: s.lo + inset } : { ...s, hi: s.hi - inset },
  );
  return [a!, b!];
}

/** Half a pan's width at quarter-turn `turn`: its centreline to either side face. */
export function wcHalf(rect: BBox, turn: number | undefined): number {
  const back = backEdgeOfDeg(turn);
  return (back === "top" || back === "bottom" ? rect.w : rect.h) / 2;
}

/** Measure a WC's sides against `world` (the pan itself, `self`, left out). */
export function measureWcSides(
  rect: BBox,
  turn: number | undefined,
  need: number,
  world: ClearWorld,
  self: RFurniture,
): WcSides | null {
  const half = wcHalf(rect, turn);
  const depth = need - half;
  if (depth <= 0) return null;
  const [a, b] = wcStrips(rect, turn, depth);
  return {
    half,
    depth,
    sides: [
      { strip: a, m: measureStrip(a, world, self) },
      { strip: b, m: measureStrip(b, world, self) },
    ],
  };
}

/** A side that is short: something stands in it nearer than the figure. */
export const isShort = (s: WcSide, depth: number): boolean => s.m.by !== null && s.m.measured < depth;

/** A window's band in its own frame: the centre of its span, the host's unit direction `d`
 *  and its normal `n`. */
export interface WindowBand {
  w: RWindow;
  c: Point;
  d: Point;
  n: Point;
}

/**
 * The windows a tall unit is judged against, as bands. A window with no host is
 * `W_WINDOW_OFF_WALL`'s; one whose sill is at or above a door head (2100 mm, `DOOR_HEAD`) is a
 * high window over full-height storage; one on a curved wall is not measured and `onCurved` is
 * told (the rule files the coverage skip).
 */
export function windowBands(windows: readonly RWindow[], onCurved: () => void = () => {}): WindowBand[] {
  const out: WindowBand[] = [];
  for (const w of windows) {
    const s = w.host;
    if (s === null || w.sill >= DOOR_HEAD) continue;
    if (s.arc) {
      onCurved();
      continue;
    }
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len === 0) continue;
    const d = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len };
    out.push({ w, c: w.at, d, n: { x: -d.y, y: d.x } });
  }
  return out;
}

/** How a footprint covers a window: the length of the span it stands in front of, and the
 *  footprint's own extent along the host, both measured from the window's centre; and how deep
 *  across the host the covered part reaches into the band (`describe --facts clearances`). */
export interface WindowCover {
  covered: number;
  lo: number;
  hi: number;
  across: number;
}

/**
 * Does footprint `r` stand in front of the window: overlap, with positive area, the window's span
 * along its host within `tol` of the host's centreline on either side? Exact on an axis-aligned
 * host (a unit direction of 0 or ±1).
 */
export function windowCover(band: WindowBand, r: BBox, tol: number): WindowCover | null {
  const { w, c, d, n } = band;
  const local = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ].map((p) => ({ x: (p.x - c.x) * d.x + (p.y - c.y) * d.y, y: (p.x - c.x) * n.x + (p.y - c.y) * n.y }));
  const clipped = clipToRect(local, { x: -w.width / 2, y: -tol, w: w.width, h: 2 * tol });
  if (clipped.length < 3 || Math.abs(area2(clipped)) <= 1e-9) return null;
  const xs = clipped.map((p) => p.x);
  const ys = clipped.map((p) => p.y);
  const ls = local.map((p) => p.x);
  return {
    covered: Math.max(...xs) - Math.min(...xs),
    lo: Math.min(...ls),
    hi: Math.max(...ls),
    across: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Does a cooking surface at footprint `r` stand under the window (plan-soundness PS2.64)? It stands
 * in front of it ({@link windowCover}) AND against its host: the footprint's side nearest the host
 * lies on the wall, no farther off its face than {@link WALL_COLLISION_SLACK_MM} (a piece drawn a
 * few millimetres short of the wall it stands against is flush, as `W_FURNITURE_WALL_COLLISION`
 * reads it). A hob backing onto a return wall, standing clear of the window wall with only a
 * corner in its band, is beside that window, not under it. The side is the footprint's, not the
 * `rotate` back edge: an unturned stove on a side wall, or a corner stove whose side stands
 * against the window wall, is as near the curtain as one backing onto it.
 */
export function hobWindowCover(band: WindowBand, r: BBox, tol: number): WindowCover | null {
  const cover = windowCover(band, r, tol);
  if (cover === null) return null;
  return hobNearHost(band, r) <= band.w.host!.thickness / 2 + WALL_COLLISION_SLACK_MM ? cover : null;
}

/** How far footprint `r`'s side nearest the window's host stands from the host's centreline
 *  (0 when the footprint straddles it): the distance {@link hobWindowCover} judges. */
export function hobNearHost(band: WindowBand, r: BBox): number {
  const { c, n } = band;
  const ys = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ].map((p) => (p.x - c.x) * n.x + (p.y - c.y) * n.y);
  return ys.every((y) => y >= 0) || ys.every((y) => y <= 0) ? Math.min(...ys.map(Math.abs)) : 0;
}

/**
 * Would a piece of `category` at footprint `fr` and turn `rotate` raise or change a clearance
 * finding? A WC whose own side is short; a piece standing nearer a WC's centreline than the
 * figure and no farther than what already stands on that side (`<=`, deliberately: at an equal
 * distance the new piece can become the obstacle the warning names, which changes the warning's
 * words, so the conservative test refuses the tie too); a tall unit in front of a window. `self`
 * is the piece being moved, left out of every measure. The placement check behind quoted
 * positions.
 */
export function clearancesClear(
  ctx: LintContext,
  fr: BBox,
  category: string,
  rotate: number,
  self?: RFurniture,
): boolean {
  const need = ctx.rules.wcSideClearanceMm;
  const others = ctx.furniture.filter((f) => f !== self);
  if (need !== null) {
    const probe = { at: { x: fr.x, y: fr.y }, size: { w: fr.w, h: fr.h }, rotate, category } as RFurniture;
    if (isWc(category)) {
      const m = measureWcSides(fr, rotate, need, wcWorld(others, ctx), probe);
      if (m?.sides.some((s) => isShort(s, m.depth))) return false;
    }
    if (cutPlaneLayer(category) === "body") {
      const alone: ClearWorld = { furniture: [probe], segments: [], swings: [] };
      for (const wc of others) {
        if (!isWc(wc.category)) continue;
        const r = { x: wc.at.x, y: wc.at.y, w: wc.size.w, h: wc.size.h };
        const now = measureWcSides(r, wc.rotate, need, wcWorld(others, ctx), wc);
        if (now === null) continue;
        for (const s of now.sides) {
          const by = measureStrip(s.strip, alone, wc);
          if (by.by !== null && by.measured < now.depth && by.measured <= s.m.measured) return false;
        }
      }
    }
  }
  const tol = ctx.rules.fixtureWallTolMm;
  if (isTallUnit(category)) {
    if (windowBands(ctx.windows).some((b) => windowCover(b, fr, tol) !== null)) return false;
  }
  if (isCookingSurface(category)) {
    if (windowBands(ctx.windows).some((b) => hobWindowCover(b, fr, tol) !== null)) return false;
  }
  // The hob-to-fridge gap (PS2.11e), both ways: a hob with a tall unit inside its landing, and a
  // tall unit standing inside a hob's.
  const landing = ctx.rules.hobLandingMm;
  if (landing !== null) {
    const probe = { at: { x: fr.x, y: fr.y }, size: { w: fr.w, h: fr.h }, rotate, category } as RFurniture;
    if (isCookingSurface(category)) {
      const tall = others.filter((f) => isTallUnit(f.category));
      if (tall.length > 0 && hobSideGap(ctx, probe, tall, landing) !== null) return false;
    }
    if (isTallUnit(category)) {
      for (const hob of others)
        if (isCookingSurface(hob.category) && hobSideGap(ctx, hob, [probe], landing) !== null) return false;
    }
  }
  return true;
}

/** What {@link hobSideGap} reads off a lint context: the walls, with their doorways cut out. */
export type HobWorldSource = WcWorldSource;

/**
 * The nearest tall unit standing inside either side strip of cooking surface `f`, `need` deep,
 * and its gap from the hob's side face, or `null` when neither side has one (`W_HOB_FRIDGE_GAP`
 * and the placement check above read this one measure). Each strip runs along the hob's wall line
 * over the hob's depth, so only a unit beside it on its run is read, and is measured against the
 * straight wall bodies as well ({@link cutSegments}, doorways and openings cut out), so a fridge
 * behind a partition is not beside the hob: the wall is the nearer obstacle and is not this
 * measure's. Rooms do not enter it: across an `open between` join there is no wall, and a dining
 * room's fridge 100 mm from the kitchen's hob is as close as one in the kitchen. Equal gaps on the
 * two sides keep the unit first in source order (`tall`'s order), so the reading does not depend
 * on which side a turn of the frame lists first.
 */
export function hobSideGap(
  src: HobWorldSource,
  f: RFurniture,
  tall: readonly RFurniture[],
  need: number,
): { piece: RFurniture; gap: number } | null {
  const mine = tall.filter((t) => t !== f);
  if (mine.length === 0) return null;
  const world: ClearWorld = { furniture: mine, segments: cutSegments(src), swings: [] };
  const rect = { x: f.at.x, y: f.at.y, w: f.size.w, h: f.size.h };
  let best: { piece: RFurniture; gap: number } | null = null;
  for (const s of clearStrips(rect, f.rotate, "sides", need)) {
    const m = measureStrip(s, world, f);
    if (m.by?.kind !== "furniture" || m.measured >= need) continue;
    const piece = m.by.piece;
    if (
      best === null ||
      m.measured < best.gap ||
      (m.measured === best.gap && mine.indexOf(piece) < mine.indexOf(best.piece))
    )
      best = { piece, gap: m.measured };
  }
  return best;
}
