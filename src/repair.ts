/**
 * `repair(source)` — an explicit, opt-in source-to-source corrector.
 *
 * Per [ADR 0006](../docs/adr/0006-solver-as-explicit-transform.md), ArchLang's
 * `compile()` never auto-fixes a plan: it renders exactly what is written and `lint`
 * flags problems. Corrective arranging lives **here**, behind an explicit command, and
 * its output is *new `.arch` source plus a change log* the author reviews — never an
 * invisible render-time edit.
 *
 * It fixes the furniture-placement faults a geometry-blind generator produces, each by
 * a closed-form move (no search, no optimizer), applied in priority order:
 *   1. a piece drawn **through a wall** → pushed flush against the nearest face;
 *   2. a fixture outside its declared `in <room>` → moved back inside that room;
 *   3. two **overlapping** pieces → the later one separated off the earlier;
 *   4. a piece in a **door's clear landing** → pushed out, preferring an exit that
 *      doesn't drive it into a wall;
 *   5. a piece in a **door's swing arc** → moved out of the quarter-disc the leaf sweeps;
 *   6. a wall-requiring **fixture floating** mid-room → snapped onto the nearest wall.
 *
 * A global fixpoint iterates every piece (in source order, so overlap separation has a
 * deterministic mover) until nothing moves. A piece that would cycle, sits with no
 * majority side, or floats too far is left at its best position and **reported** —
 * repair never guesses among equal options. Pieces placed `against wall` or with
 * non-literal coordinates are untouched. Pure: parse → resolve (wall/door/room
 * geometry) → mutate the parsed AST → re-emit via the formatter. No I/O, deterministic.
 */

import { parse } from "./parser.js";
import { formatPlan } from "./format.js";
import { resolvePlan, isAgainstWall, buildDoorAccessGraph, DEFAULT_TOL, type BBox } from "./analyze.js";
import { computeCirculation, type CirculationModel } from "./analyze/circulation.js";
import { doorLandingRect, pointInRect, rectOverlapAmounts, wallIntrusion } from "./geometry/rect.js";
import { segmentsOfWall, doorSwing, sectorIntersectsRect, type DoorSwing } from "./geometry.js";
import { DEFAULT_RULESET } from "./lint.js";
import { requiresWall } from "./fixtures-catalog.js";
import type { RWall, RDoor, RRoom, ROpening, RFurniture } from "./ir.js";
import type { FurnitureNode } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";

/** Intrusion (mm) past which a piece counts as colliding with a wall — mirrors lint. */
const SLACK_MM = 30;
/** How far (mm) a floating fixture may be from a wall and still be auto-snapped to it. */
const MAX_SNAP_MM = 1200;

export interface RepairChange {
  id: string;
  category: string;
  /** What was done. A single move may combine reasons across iteration steps. */
  kind: "moved";
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Human summary of every fix applied to this piece, in order. */
  reason: string;
}

export interface RepairNote {
  id: string;
  reason: string;
}

export interface RepairResult {
  /** The corrected `.arch` source (canonical formatting). Equal to the input when
   *  there was nothing to fix or the plan could not be parsed. */
  source: string;
  changes: RepairChange[];
  /** Problems repair declined to (fully) fix — ambiguous, conflicting, scripted,
   *  `against wall`, or floating too far from any wall. */
  unresolved: RepairNote[];
  /** True when at least one change was applied. */
  changed: boolean;
}

/** Literal numeric value of an expression (a bare number or a signed number), else null. */
function litNum(e: Expr | undefined): number | null {
  if (!e) return null;
  if (e.t === "num") return e.value;
  if (e.t === "unary" && e.op === "-" && e.e.t === "num") return -e.e.value;
  if (e.t === "unary" && e.op === "+" && e.e.t === "num") return e.e.value;
  return null;
}

const numExpr = (value: number): Expr => ({ t: "num", value });
const snapOut = (v: number, dir: number, grid: number): number =>
  grid > 0 ? (dir > 0 ? Math.ceil(v / grid) : Math.floor(v / grid)) * grid : v;

// ---- geometry over the static wall/door layout --------------------------------

/** Does `fr` collide with any wall solid by more than the slack? */
function hitsWall(fr: BBox, walls: RWall[]): boolean {
  for (const w of walls)
    for (const s of segmentsOfWall(w)) {
      const hit = wallIntrusion(fr, s);
      if (hit && hit.depth > SLACK_MM) return true;
    }
  return false;
}

/** The push that clears `fr` from the wall it most penetrates, "ambiguous" when it
 *  straddles a centreline with no majority side, or null when it hits nothing. */
function computeWallPush(
  fr: BBox,
  walls: RWall[],
  grid: number,
): { dx: number; dy: number; wallId: string } | "ambiguous" | null {
  let best: { depth: number; dx: number; dy: number; wallId: string } | null = null;
  let ambiguous = false;
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      const hit = wallIntrusion(fr, s);
      if (!hit || hit.depth <= SLACK_MM) continue;
      const h2 = s.thickness / 2;
      if (hit.axis === "y") {
        if (cy === hit.center) {
          ambiguous = true;
          continue;
        }
        const newY = cy > hit.center ? snapOut(hit.center + h2, +1, grid) : snapOut(hit.center - h2 - fr.h, -1, grid);
        if (!best || hit.depth > best.depth) best = { depth: hit.depth, dx: 0, dy: newY - fr.y, wallId: w.id };
      } else {
        if (cx === hit.center) {
          ambiguous = true;
          continue;
        }
        const newX = cx > hit.center ? snapOut(hit.center + h2, +1, grid) : snapOut(hit.center - h2 - fr.w, -1, grid);
        if (!best || hit.depth > best.depth) best = { depth: hit.depth, dx: newX - fr.x, dy: 0, wallId: w.id };
      }
    }
  }
  if (best) return { dx: best.dx, dy: best.dy, wallId: best.wallId };
  return ambiguous ? "ambiguous" : null;
}

/** The minimal move that lifts `fr` out of any door landing it overlaps, preferring an
 *  exit that does not drive the piece into a wall. "ambiguous" when two equally-good
 *  exits tie; null when no landing is blocked. */
function computeDoorwayPush(
  fr: BBox,
  landings: BBox[],
  walls: RWall[],
  grid: number,
): { dx: number; dy: number } | "ambiguous" | null {
  let best: { shift: number; clean: boolean; dx: number; dy: number } | null = null;
  let tie = false;
  for (const L of landings) {
    const { ox, oy } = rectOverlapAmounts(fr, L);
    if (ox <= 1 || oy <= 1) continue;
    const exits: Array<{ shift: number; x: number; y: number }> = [
      { shift: fr.x + fr.w - L.x, x: snapOut(fr.x - (fr.x + fr.w - L.x), -1, grid), y: fr.y }, // left
      { shift: L.x + L.w - fr.x, x: snapOut(fr.x + (L.x + L.w - fr.x), +1, grid), y: fr.y }, // right
      { shift: fr.y + fr.h - L.y, x: fr.x, y: snapOut(fr.y - (fr.y + fr.h - L.y), -1, grid) }, // up
      { shift: L.y + L.h - fr.y, x: fr.x, y: snapOut(fr.y + (L.y + L.h - fr.y), +1, grid) }, // down
    ];
    for (const e of exits) {
      if (e.shift <= 0) continue;
      const clean = !hitsWall({ x: e.x, y: e.y, w: fr.w, h: fr.h }, walls);
      const cand = { shift: e.shift, clean, dx: e.x - fr.x, dy: e.y - fr.y };
      const better =
        (cand.clean && !(best?.clean ?? false)) ||
        (best !== null && cand.clean === best.clean && cand.shift < best.shift - 1e-6);
      const equal = best !== null && cand.clean === best.clean && Math.abs(cand.shift - best.shift) <= 1e-6;
      if (!best || better) {
        best = cand;
        tie = false;
      } else if (equal && (cand.dx !== best.dx || cand.dy !== best.dy)) tie = true;
    }
  }
  if (!best) return null;
  if (tie) return "ambiguous";
  return { dx: best.dx, dy: best.dy };
}

/** Snap a floating wall-fixture onto its nearest wall face. "ambiguous" on an exact
 *  tie between two walls, "too-far" when no wall is within MAX_SNAP_MM, null when the
 *  piece already backs onto a wall span. */
function computeFloatingSnap(
  fr: BBox,
  walls: RWall[],
  grid: number,
): { dx: number; dy: number } | "ambiguous" | "too-far" | null {
  let best: { dist: number; dx: number; dy: number } | null = null;
  let tie = false;
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  for (const w of walls)
    for (const s of segmentsOfWall(w)) {
      const horiz = s.a.y === s.b.y;
      const vert = s.a.x === s.b.x;
      if (horiz === vert) continue;
      const h2 = s.thickness / 2;
      let dist: number, dx: number, dy: number;
      if (horiz) {
        const segLo = Math.min(s.a.x, s.b.x),
          segHi = Math.max(s.a.x, s.b.x);
        if (Math.min(fr.x + fr.w, segHi) - Math.max(fr.x, segLo) <= 0) continue; // no shared span
        dy = cy >= s.a.y ? s.a.y + h2 - fr.y : s.a.y - h2 - fr.h - fr.y;
        dx = 0;
        dist = Math.abs(dy);
      } else {
        const segLo = Math.min(s.a.y, s.b.y),
          segHi = Math.max(s.a.y, s.b.y);
        if (Math.min(fr.y + fr.h, segHi) - Math.max(fr.y, segLo) <= 0) continue;
        dx = cx >= s.a.x ? s.a.x + h2 - fr.x : s.a.x - h2 - fr.w - fr.x;
        dy = 0;
        dist = Math.abs(dx);
      }
      if (!best || dist < best.dist - 1e-6) {
        best = { dist, dx, dy };
        tie = false;
      } else if (Math.abs(dist - best.dist) <= 1e-6 && (dx !== best.dx || dy !== best.dy)) tie = true;
    }
  if (!best) return null;
  if (best.dist <= 1) return null; // already flush
  if (best.dist > MAX_SNAP_MM) return "too-far";
  if (tie) return "ambiguous";
  void grid; // faces land on-grid (on-grid walls + grid-multiple sizes); no re-snap
  return { dx: best.dx, dy: best.dy };
}

/** Move `fr` out of every door-swing quarter-disc it sits in. The swing is a 90°
 *  sector (not an AABB), so the minimal clearing distance along each axis is found by
 *  grid-stepping against the *same* predicate the lint uses (`sectorIntersectsRect`) —
 *  so repair clears exactly what `W_SWING_OBSTRUCTED` flags. The smallest clearing
 *  shift wins, preferring one that doesn't drive the piece into a wall; an exact tie is
 *  "ambiguous". Bounded: the disc has radius = door width, so a shift past it always
 *  clears. */
function computeSwingPush(
  fr: BBox,
  swings: DoorSwing[],
  walls: RWall[],
  grid: number,
): { dx: number; dy: number } | "ambiguous" | null {
  const clr = DEFAULT_RULESET.swingClearanceMm;
  const hit = swings.filter((s) => sectorIntersectsRect(s, fr, clr));
  if (hit.length === 0 || grid <= 0) return null;
  const maxR = Math.max(...hit.map((s) => s.radius));
  const bound = 2 * maxR + Math.max(fr.w, fr.h) + 4 * grid;
  let best: { shift: number; clean: boolean; dx: number; dy: number } | null = null;
  let tie = false;
  for (const [ux, uy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (let k = grid; k <= bound; k += grid) {
      const cand: BBox = { x: fr.x + ux * k, y: fr.y + uy * k, w: fr.w, h: fr.h };
      if (hit.some((s) => sectorIntersectsRect(s, cand, clr))) continue;
      const c = { shift: k, clean: !hitsWall(cand, walls), dx: ux * k, dy: uy * k };
      const better =
        (c.clean && !(best?.clean ?? false)) ||
        (best !== null && c.clean === best.clean && c.shift < best.shift - 1e-6);
      const equal = best !== null && c.clean === best.clean && Math.abs(c.shift - best.shift) <= 1e-6;
      if (!best || better) {
        best = c;
        tie = false;
      } else if (equal && (c.dx !== best.dx || c.dy !== best.dy)) tie = true;
      break; // first clearing step in this direction is its minimal shift
    }
  }
  if (!best) return null;
  if (tie) return "ambiguous";
  return { dx: best.dx, dy: best.dy };
}

/** Move a fixture declared `in <room>` whose footprint has drifted out of that room
 *  back inside it — fully inside when it fits, else centred. Closed-form; null when it
 *  already sits in the room. */
function computeWrongRoomPush(fr: BBox, room: BBox, grid: number): { dx: number; dy: number } | null {
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  if (pointInRect(cx, cy, room)) return null; // centre inside
  const fitX = fr.w <= room.w ? Math.min(Math.max(fr.x, room.x), room.x + room.w - fr.w) : room.x + (room.w - fr.w) / 2;
  const fitY = fr.h <= room.h ? Math.min(Math.max(fr.y, room.y), room.y + room.h - fr.h) : room.y + (room.h - fr.h) / 2;
  const snap = (v: number, lo: number, hi: number): number => {
    if (grid <= 0) return v;
    const r = Math.round(v / grid) * grid;
    return Math.min(Math.max(r, lo), hi); // keep inside after snapping
  };
  const newX = snap(fitX, room.x, room.x + Math.max(0, room.w - fr.w));
  const newY = snap(fitY, room.y, room.y + Math.max(0, room.h - fr.h));
  if (newX === fr.x && newY === fr.y) return null;
  return { dx: newX - fr.x, dy: newY - fr.y };
}

/** Separate `fr` from the earlier-placed piece it most overlaps, pushing it along the
 *  axis of least overlap away from that piece's centre. "ambiguous" when the centres
 *  coincide on the chosen axis; null when it overlaps nothing. `others` are the rects
 *  this piece must yield to (earlier in source order — a deterministic mover order so
 *  a pair never chases itself). */
function computeOverlapPush(fr: BBox, others: BBox[], grid: number): { dx: number; dy: number } | "ambiguous" | null {
  let worst: { o: BBox; ox: number; oy: number; area: number } | null = null;
  for (const o of others) {
    const { ox, oy } = rectOverlapAmounts(fr, o);
    if (ox <= 1 || oy <= 1) continue;
    const area = ox * oy;
    if (!worst || area > worst.area) worst = { o, ox, oy, area };
  }
  if (!worst) return null;
  const { o, ox, oy } = worst;
  const cxF = fr.x + fr.w / 2,
    cyF = fr.y + fr.h / 2;
  const cxO = o.x + o.w / 2,
    cyO = o.y + o.h / 2;
  // Push along the smaller overlap; on a tie use the axis whose centres differ.
  const useX = ox < oy || (ox === oy && cxF !== cxO);
  if (useX) {
    if (cxF === cxO) return "ambiguous";
    const newX = cxF > cxO ? snapOut(fr.x + ox, +1, grid) : snapOut(fr.x - ox, -1, grid);
    return { dx: newX - fr.x, dy: 0 };
  }
  if (cyF === cyO) return "ambiguous";
  const newY = cyF > cyO ? snapOut(fr.y + oy, +1, grid) : snapOut(fr.y - oy, -1, grid);
  return { dx: 0, dy: newY - fr.y };
}

// ---- the corrector ------------------------------------------------------------

interface Fix {
  dx: number;
  dy: number;
  reason: string;
}
type NextFix = Fix | { ambiguous: string } | null;

interface FixCtx {
  category: string;
  room?: BBox;
  earlier: BBox[];
  walls: RWall[];
  landings: BBox[];
  swings: DoorSwing[];
  grid: number;
}

/** The single highest-priority fix for a piece at rect `fr`, in order: out of a wall,
 *  into its declared room, off an overlapping neighbour, out of a doorway, then (for a
 *  wall-fixture) snapped to a wall. */
function nextFix(fr: BBox, ctx: FixCtx): NextFix {
  const wall = computeWallPush(fr, ctx.walls, ctx.grid);
  if (wall === "ambiguous") return { ambiguous: "is centred on a wall — move it onto one side, then re-run" };
  if (wall) return { dx: wall.dx, dy: wall.dy, reason: `pushed clear of wall "${wall.wallId}"` };

  if (ctx.room) {
    const wr = computeWrongRoomPush(fr, ctx.room, ctx.grid);
    if (wr) return { dx: wr.dx, dy: wr.dy, reason: "moved into its declared room" };
  }

  const over = computeOverlapPush(fr, ctx.earlier, ctx.grid);
  if (over === "ambiguous") return { ambiguous: "sits exactly on another piece — separate them manually" };
  if (over) return { dx: over.dx, dy: over.dy, reason: "separated from an overlapping piece" };

  const door = computeDoorwayPush(fr, ctx.landings, ctx.walls, ctx.grid);
  if (door === "ambiguous") return { ambiguous: "sits centred in a doorway — move it aside manually" };
  if (door) return { dx: door.dx, dy: door.dy, reason: "cleared the doorway approach" };

  const swing = computeSwingPush(fr, ctx.swings, ctx.walls, ctx.grid);
  if (swing === "ambiguous") return { ambiguous: "sits in a door's swing with no clear way out — move it manually" };
  if (swing) return { dx: swing.dx, dy: swing.dy, reason: "moved out of a door's swing" };

  if (requiresWall(ctx.category) && !isAgainstWall(fr, ctx.walls, DEFAULT_RULESET.fixtureWallTolMm)) {
    const snap = computeFloatingSnap(fr, ctx.walls, ctx.grid);
    if (snap === "ambiguous") return { ambiguous: "is equidistant from two walls — give it an explicit place" };
    if (snap === "too-far") return { ambiguous: "floats too far from any wall to snap automatically" };
    if (snap) return { dx: snap.dx, dy: snap.dy, reason: "snapped against the nearest wall" };
  }
  return null;
}

interface Piece {
  f: FurnitureNode;
  id: string;
  orig: { x: number; y: number };
  cur: { x: number; y: number };
  w: number;
  h: number;
  room?: BBox;
  visited: Set<string>;
  reasons: string[];
  stuck: boolean;
}

const rectOfPiece = (p: Piece): BBox => ({ x: p.cur.x, y: p.cur.y, w: p.w, h: p.h });

const spanKey = (s: Span | undefined): string => (s ? `${s.start}:${s.end}` : "");

/**
 * Circulation guard (ADR 0006/0008): the id of the first room/route whose entrance
 * walk `after` a candidate move would squeeze below `min` mm **when it wasn't already
 * below** `before`, or null when the move pinches nothing new. A move that leaves an
 * already-tight (or unreachable) path no worse is allowed — repair never regresses a
 * walk it can measure. Unreachable ⇒ a bottleneck of 0, so blocking the entrance or a
 * room counts as a new pinch.
 */
function firstNewPinch(before: CirculationModel | null, after: CirculationModel | null, min: number): string | null {
  const bRoom = new Map((before?.rooms ?? []).map((r) => [r.roomId, r.bottleneckClearWidthMm]));
  const aRoom = new Map((after?.rooms ?? []).map((r) => [r.roomId, r.bottleneckClearWidthMm]));
  for (const id of new Set([...bRoom.keys(), ...aRoom.keys()])) {
    if ((aRoom.get(id) ?? 0) < min && (bRoom.get(id) ?? 0) >= min) return id;
  }
  const key = (rt: { fromRoomId: string; toRoomId: string }): string => `${rt.fromRoomId}→${rt.toRoomId}`;
  const bRoute = new Map((before?.routes ?? []).map((rt) => [key(rt), rt.bottleneckClearWidthMm]));
  const aRoute = new Map((after?.routes ?? []).map((rt) => [key(rt), rt.bottleneckClearWidthMm]));
  for (const k of new Set([...bRoute.keys(), ...aRoute.keys()])) {
    if ((aRoute.get(k) ?? 0) < min && (bRoute.get(k) ?? 0) >= min) return k;
  }
  return null;
}

/**
 * Correct a plan and return new source + a change log. Furniture is moved to a stable
 * arrangement by a global fixpoint: each pass applies the highest-priority fix to each
 * piece (in source order, so overlap separation has a deterministic mover); a piece
 * that would cycle, or that has no unambiguous move, is left at its best position and
 * reported. Anything left unfixable goes in `unresolved`.
 */
export function repair(source: string): RepairResult {
  const { plan, diagnostics } = parse(source);
  if (!plan || diagnostics.some((d) => d.severity === "error")) {
    return { source, changes: [], unresolved: [], changed: false };
  }
  const { ir } = resolvePlan(source);
  const walls = ir?.walls ?? [];
  const doors = (ir?.elements ?? []).filter((e): e is RDoor => e.kind === "door");
  const landings = doors
    .map((d) => doorLandingRect(d, DEFAULT_RULESET.doorwayLandingMm))
    .filter((l): l is BBox => l !== null);
  const swings = doors.map((d) => doorSwing(d)).filter((s): s is DoorSwing => s !== null);
  const roomRects = new Map<string, BBox>(
    (ir?.elements ?? [])
      .filter((e): e is RRoom => e.kind === "room")
      .map((r) => [r.id, { x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }]),
  );
  const grid = plan.grid;

  // Collect the fixable pieces (top-level, literal `at` + size).
  const pieces: Piece[] = [];
  let counter = 0;
  for (const st of plan.body) {
    if (st.kind !== "furniture") continue;
    const f = st as FurnitureNode;
    const idOf = f.id || `${f.category}#${++counter}`;
    if (f.against || !f.at) continue;
    const ax = litNum(f.at.x),
      ay = litNum(f.at.y);
    const sw = litNum(f.size?.w),
      sh = litNum(f.size?.h);
    if (ax === null || ay === null || sw === null || sh === null) continue;
    pieces.push({
      f,
      id: idOf,
      orig: { x: ax, y: ay },
      cur: { x: ax, y: ay },
      w: sw,
      h: sh,
      room: f.room ? roomRects.get(f.room) : undefined,
      visited: new Set([`${ax},${ay}`]),
      reasons: [],
      stuck: false,
    });
  }

  const unresolved: RepairNote[] = [];
  const noted = new Set<string>();
  const note = (id: string, reason: string): void => {
    const key = `${id}|${reason}`;
    if (!noted.has(key)) {
      noted.add(key);
      unresolved.push({ id, reason });
    }
  };

  // ---- circulation guard (ADR 0006/0008) ----
  // A furniture move is rejected if it would newly squeeze any room's entrance walk
  // (or a key route) below the lint threshold. Static geometry (rooms/walls/doors) is
  // hoisted; only the movable furniture varies, so a candidate check is one circulation
  // compute. The guard is active only when there is an entrance to measure a walk from
  // and every movable piece has a source span (the AST↔IR link the guard maps pieces by).
  const minPathClear = DEFAULT_RULESET.minPathClearWidthMm;
  const roomEls = (ir?.elements ?? []).filter((e): e is RRoom => e.kind === "room");
  const openingEls = (ir?.elements ?? []).filter((e): e is ROpening => e.kind === "opening");
  const irFurniture = (ir?.elements ?? []).filter((e): e is RFurniture => e.kind === "furniture");
  const access = ir ? buildDoorAccessGraph(roomEls, doors, DEFAULT_TOL, undefined, openingEls) : null;
  const pieceKeys = new Set(pieces.map((p) => spanKey(p.f.span)));
  // Furniture NOT under repair's control (against-wall / scripted) stays put; the movable
  // pieces contribute their live position instead.
  const staticFurniture = irFurniture.filter((rf) => !pieceKeys.has(spanKey(rf.span)));
  const guardActive = !!ir && !!access && access.hasEntrance && pieces.every((p) => p.f.span !== undefined);
  const labelOf = new Map(roomEls.map((r) => [r.id, r.label ?? r.id]));

  /** Circulation for the current arrangement, with piece `overrideIdx` at `pos`. */
  const circWith = (overrideIdx: number, pos: { x: number; y: number }): CirculationModel | null => {
    const dyn: RFurniture[] = pieces.map((p, i) => {
      const at = i === overrideIdx ? pos : p.cur;
      return {
        kind: "furniture",
        id: p.id,
        category: p.f.category,
        at: { x: at.x, y: at.y },
        size: { w: p.w, h: p.h },
      };
    });
    return computeCirculation(roomEls, walls, doors, openingEls, [...staticFurniture, ...dyn], access!, DEFAULT_TOL);
  };
  // Baseline circulation of the starting arrangement; updated in place as pieces move so
  // each candidate check is a single compute (the accepted `after` becomes the next `before`).
  let beforeCirc = guardActive ? circWith(-1, { x: 0, y: 0 }) : null;

  const MAX_PASSES = Math.min(64, pieces.length * 6 + 8);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.stuck) continue;
      const fr = rectOfPiece(p);
      const earlier = pieces.slice(0, i).map(rectOfPiece);
      const fix = nextFix(fr, { category: p.f.category, room: p.room, earlier, walls, landings, swings, grid });
      if (fix === null) continue;
      if ("ambiguous" in fix) {
        note(p.id, fix.ambiguous);
        p.stuck = true;
        continue;
      }
      const next = { x: p.cur.x + fix.dx, y: p.cur.y + fix.dy };
      const key = `${next.x},${next.y}`;
      if (p.visited.has(key)) {
        note(p.id, "can't be placed without conflict — adjust manually");
        p.stuck = true;
        continue;
      }
      // Circulation guard: reject a move that would newly pinch a walk below the
      // threshold, terminating this piece like an "ambiguous" fix (report, don't guess).
      if (guardActive) {
        const after = circWith(i, next);
        const pinched = firstNewPinch(beforeCirc, after, minPathClear);
        if (pinched !== null) {
          const label = labelOf.get(pinched) ?? pinched;
          note(p.id, `would pinch the walk to "${label}" below ${minPathClear} mm — left in place; adjust manually`);
          p.stuck = true;
          continue;
        }
        beforeCirc = after; // accepted → this arrangement is the new baseline
      }
      p.cur = next;
      p.visited.add(key);
      if (!p.reasons.includes(fix.reason)) p.reasons.push(fix.reason);
      moved = true;
    }
    if (!moved) break;
  }

  const changes: RepairChange[] = [];
  for (const p of pieces) {
    if (p.cur.x === p.orig.x && p.cur.y === p.orig.y) continue;
    p.f.at = { x: numExpr(p.cur.x), y: numExpr(p.cur.y) };
    changes.push({
      id: p.id,
      category: p.f.category,
      kind: "moved",
      from: p.orig,
      to: p.cur,
      reason: p.reasons.join("; "),
    });
  }

  const out = changes.length ? formatPlan(plan, source) : source;
  return { source: out, changes, unresolved, changed: changes.length > 0 };
}
