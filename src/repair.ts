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
 * Then, once every position is final, one **orientation** pass: a fixture standing
 * flush against a single wall but with its back to the room is turned to face it
 * (a `rotate` rewrite, not a move — the `W_FIXTURE_BACK_TO_ROOM` correction).
 *
 * A global fixpoint iterates every piece (in source order, so overlap separation has a
 * deterministic mover) until nothing moves. A piece that sits with no majority side or
 * floats too far is left where it stands and **reported**, and one that cycles is parked
 * on that cycle's canonical member and reported — repair never guesses among equal
 * options, and never lets which of them it ships depend on where it started.
 *
 * That pass is run to a **cycle** and the cycle's canonical member is what ships, so
 * `repair(repair(s))` equals `repair(s)` byte for byte. See {@link repair} for why one
 * pass does not have that property and why the remedy cannot be closed-form.
 *
 * **Every flagged piece is accounted for — a silent no-op is a bug.** The statement
 * scan walks *into* `for`/`while`/`if`/component bodies, and reads the resolved
 * position of each statement's instances, so it sees the pieces a top-level-only scan
 * used to miss. What it can rewrite depends on how the position is *written*:
 *
 *   * `at (x,y)` with literal coordinates → a new `at`;
 *   * `in <room> anchor <a> [flush] [inset N]` → a minimal `inset` edit when the move
 *     runs along the anchored axis, else the whole placement becomes an absolute `at`
 *     (carrying the rotation the anchor had derived, so nothing is silently dropped);
 *   * a statement with **more than one** resolved instance (a `for` body, a component
 *     instantiated twice), expression coordinates, or an `against wall` anchor → left
 *     exactly as written and **reported** in `unresolved`, naming the construct and the
 *     instances, so a scripted overlap can never look like a clean run.
 *
 * Pure: parse → resolve (wall/door/room geometry) → mutate a private clone of the
 * parsed AST → re-emit via the formatter. No I/O, deterministic.
 */

import { parse } from "./parser.js";
import { formatPlan } from "./format.js";
import { fmt3 as numStr } from "./num-format.js";
import {
  ANCHOR_BACK_EDGES,
  backCandidateEdges,
  backedEdgeList,
  backEdgeForRotate,
  buildDoorAccessGraph,
  DEFAULT_TOL,
  FIXTURE_WALL_TOL_MM,
  innerFaceOfRoomEdge,
  isAgainstWall,
  rectInRoomBox,
  type RectEdge,
  resolvePlan,
  rotateForBackEdge,
  wallBackedEdges,
  type BBox,
} from "./analyze.js";
import { computeCirculation, type CirculationModel } from "./analyze/circulation.js";
import { verticalsOf } from "./vertical.js";
import { doorLandingRect, rectOverlapAmounts, wallIntrusion } from "./geometry/rect.js";
import { segmentsOfWall, doorSwing, sectorIntersectsRect, type DoorSwing } from "./geometry.js";
import { DEFAULT_RULESET } from "./lint.js";
import { defaultFootprint, orientationMatters, requiresWall } from "./fixtures-catalog.js";
import type { ResolvedPlan, RWall, RDoor, RRoom, ROpening, RFurniture, RVoid } from "./ir.js";
import type { ComponentDef, FurnitureAnchor, FurnitureNode, FurniturePlace, PlanNode, Statement } from "./ast.js";
import type { Span } from "./diagnostics.js";
import type { Expr } from "./expr.js";

/** Intrusion (mm) past which a piece counts as colliding with a wall — mirrors lint. */
const SLACK_MM = 30;
/** How far (mm) a floating fixture may be from a wall and still be auto-snapped to it. */
const MAX_SNAP_MM = 1200;
/** Nesting depth the statement scan walks (matches resolve's component-depth cap). */
const MAX_WALK_DEPTH = 64;

export interface RepairChange {
  id: string;
  category: string;
  /**
   * What was done: the piece was `moved` (a new position), or `rotated` in place (a new
   * `rotate`, so its back faces the wall it stands against). A piece that needed both
   * gets one entry of each — a move and a turn are separate, separately-reviewable
   * edits. A single move may combine reasons across iteration steps.
   */
  kind: "moved" | "rotated";
  /** Footprint corner before/after. Equal for a `rotated` change (nothing moves). */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Quarter-turn before/after — present on a `rotated` change only. */
  fromRotate?: number;
  toRotate?: number;
  /**
   * Which clause was rewritten to express the change: the absolute `at` point, the
   * `inset` of a room-anchored placement, the whole `in <room> …` placement (replaced by
   * an absolute `at`), or the `rotate`. Append-only detail — `kind` still says *what*
   * happened, this says *where in the source* it happened.
   */
  via?: "at" | "inset" | "placement" | "rotate";
  /** Byte span of the furniture statement in the ORIGINAL source. */
  span?: Span;
  /** Human summary of every fix applied to this piece, in order. */
  reason: string;
  /** The storey this piece is on, for a multi-storey plan (`level <n> { … }`). Absent for
   *  a single-storey plan. Ids are unique per LEVEL, so this is what tells two `wc`
   *  entries on different floors apart. */
  level?: number;
}

export interface RepairNote {
  id: string;
  reason: string;
  /** Byte span of the furniture statement the note is about, when there is one. */
  span?: Span;
  /** The storey the note is about (multi-storey plans only) — see {@link RepairChange.level}. */
  level?: number;
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

/**
 * A number as the SOURCE will carry it. `formatPlan` prints every number through
 * `fmt3`, so a coordinate repair computed but never rounded is not the coordinate the
 * caller gets back: `1117.9999999999982` is written as `1118` and resolves as `1118`.
 * Reading the printer's own output back is what keeps the two one number — there is
 * deliberately no second rounding rule here to drift from `fmt3`.
 *
 * Found by `test/fuzz.test.ts`'s round-trip property, which failed roughly one run in
 * five; pre-existing since at least v1.30.0. See `test/repair.test.ts` → "records a
 * moved position as the printer will write it".
 */
const printed = (v: number): number => Number(numStr(v));

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
 *  straddles a centreline with no majority side, `{ angled }` when the wall it hits is
 *  not axis-aligned (there is no on-grid axis push that clears it — `curved` says whether
 *  the move it declines is along a normal or along a radius, so the note names the wall
 *  the author is looking at), or null when it hits nothing. */
function computeWallPush(
  fr: BBox,
  walls: RWall[],
  grid: number,
): { dx: number; dy: number; wallId: string } | { angled: string; curved: boolean } | "ambiguous" | null {
  let best: { depth: number; dx: number; dy: number; wallId: string } | null = null;
  let ambiguous = false;
  let angled: { id: string; curved: boolean } | null = null;
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      const hit = wallIntrusion(fr, s);
      if (!hit || hit.depth <= SLACK_MM) continue;
      const h2 = s.thickness / 2;
      // An ANGLED wall: clearing it is a move along the wall normal — off-axis and, on
      // any real grid, off-grid. A CURVED one is the same refusal with a different
      // direction (a radius). repair does not guess (ADR 0005), so the piece is
      // reported rather than shoved somewhere plausible-looking.
      if (hit.axis === null) {
        if (angled === null) angled = { id: w.id, curved: s.arc !== undefined };
        continue;
      }
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
  if (angled !== null) return { angled: angled.id, curved: angled.curved };
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
 *  already sits in the room, measured by the same {@link rectInRoomBox} predicate the
 *  `W_FIXTURE_WRONG_ROOM` lint uses, so what repair clears is exactly what lint flags. */
function computeWrongRoomPush(fr: BBox, room: BBox, grid: number): { dx: number; dy: number } | null {
  if (rectInRoomBox(fr, room)) return null;
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
 *  coincide on the chosen axis; null when it overlaps nothing. `others` are the pieces
 *  this one must yield to (earlier in source order — a deterministic mover order so a
 *  pair never chases itself), each with the id the change log/report names it by. */
function computeOverlapPush(
  fr: BBox,
  others: Array<{ id: string; rect: BBox }>,
  grid: number,
): { dx: number; dy: number; hitId: string } | { ambiguous: true; hitId: string } | null {
  let worst: { id: string; o: BBox; ox: number; oy: number; area: number } | null = null;
  for (const other of others) {
    const { ox, oy } = rectOverlapAmounts(fr, other.rect);
    if (ox <= 1 || oy <= 1) continue;
    const area = ox * oy;
    if (!worst || area > worst.area) worst = { id: other.id, o: other.rect, ox, oy, area };
  }
  if (!worst) return null;
  const { id, o, ox, oy } = worst;
  const cxF = fr.x + fr.w / 2,
    cyF = fr.y + fr.h / 2;
  const cxO = o.x + o.w / 2,
    cyO = o.y + o.h / 2;
  // Push along the smaller overlap; on a tie use the axis whose centres differ.
  const useX = ox < oy || (ox === oy && cxF !== cxO);
  if (useX) {
    if (cxF === cxO) return { ambiguous: true, hitId: id };
    const newX = cxF > cxO ? snapOut(fr.x + ox, +1, grid) : snapOut(fr.x - ox, -1, grid);
    return { dx: newX - fr.x, dy: 0, hitId: id };
  }
  if (cyF === cyO) return { ambiguous: true, hitId: id };
  const newY = cyF > cyO ? snapOut(fr.y + oy, +1, grid) : snapOut(fr.y - oy, -1, grid);
  return { dx: 0, dy: newY - fr.y, hitId: id };
}

// ---- the corrector ------------------------------------------------------------

interface Fix {
  dx: number;
  dy: number;
  /** What was done, for the change log ("pushed clear of wall …"). */
  reason: string;
  /** What is wrong, for a report on a piece that cannot be rewritten ("penetrates …"). */
  problem: string;
}
/** A fault with no single answer: `ambiguous` is the advice for a piece repair *could*
 *  have moved, `problem` the bare fault for one it may not rewrite at all. */
interface Ambiguous {
  ambiguous: string;
  problem: string;
}
type NextFix = Fix | Ambiguous | null;

interface FixCtx {
  category: string;
  room?: BBox;
  earlier: Array<{ id: string; rect: BBox }>;
  walls: RWall[];
  landings: BBox[];
  swings: DoorSwing[];
  grid: number;
}

/**
 * The single highest-priority fix for a piece at rect `fr`, in order: out of a wall,
 * into its declared room, off an overlapping neighbour, out of a doorway, then (for a
 * wall-fixture) snapped to a wall.
 *
 * It is also the *diagnosis*: every branch carries a `problem` phrase, so a piece whose
 * position repair may not rewrite is reported with exactly the fault the mover would
 * have corrected — one priority list behind both the change log and the report.
 */
function nextFix(fr: BBox, ctx: FixCtx): NextFix {
  const wall = computeWallPush(fr, ctx.walls, ctx.grid);
  if (wall === "ambiguous")
    return { ambiguous: "is centred on a wall — move it onto one side, then re-run", problem: "straddles a wall" };
  if (wall && "angled" in wall)
    return {
      ambiguous: wall.curved
        ? `penetrates the curved wall "${wall.angled}" — clearing it is a move along that wall's radius, which is neither plan axis; move it by hand`
        : `penetrates the angled wall "${wall.angled}" — clearing it is a move along that wall's normal, which is neither plan axis; move it by hand`,
      problem: `penetrates wall "${wall.angled}"`,
    };
  if (wall)
    return {
      dx: wall.dx,
      dy: wall.dy,
      reason: `pushed clear of wall "${wall.wallId}"`,
      problem: `penetrates wall "${wall.wallId}"`,
    };

  if (ctx.room) {
    const wr = computeWrongRoomPush(fr, ctx.room, ctx.grid);
    if (wr)
      return {
        dx: wr.dx,
        dy: wr.dy,
        reason: "moved into its declared room",
        problem: "sits outside its declared room",
      };
    // Not inside, and no move puts it inside — the piece is bigger than the room, or the
    // only fit is the position it already has. Report it: the mover returning `null` here
    // is exactly how a flagged piece would go silent (`test/repair-coverage.test.ts`).
    if (!rectInRoomBox(fr, ctx.room))
      return {
        ambiguous: "is too big for its declared room — resize it, or correct the `in <roomId>`",
        problem: "sits outside its declared room",
      };
  }

  const over = computeOverlapPush(fr, ctx.earlier, ctx.grid);
  if (over && "ambiguous" in over)
    return {
      ambiguous: `sits exactly on "${over.hitId}" — separate them manually`,
      problem: `overlaps "${over.hitId}"`,
    };
  if (over)
    return {
      dx: over.dx,
      dy: over.dy,
      reason: "separated from an overlapping piece",
      problem: `overlaps "${over.hitId}"`,
    };

  const door = computeDoorwayPush(fr, ctx.landings, ctx.walls, ctx.grid);
  if (door === "ambiguous")
    return {
      ambiguous: "sits centred in a doorway — move it aside manually",
      problem: "blocks the clear approach through a door",
    };
  if (door)
    return {
      dx: door.dx,
      dy: door.dy,
      reason: "cleared the doorway approach",
      problem: "blocks the clear approach through a door",
    };

  const swing = computeSwingPush(fr, ctx.swings, ctx.walls, ctx.grid);
  if (swing === "ambiguous")
    return {
      ambiguous: "sits in a door's swing with no clear way out — move it manually",
      problem: "sits in a door's swing",
    };
  if (swing)
    return { dx: swing.dx, dy: swing.dy, reason: "moved out of a door's swing", problem: "sits in a door's swing" };

  if (requiresWall(ctx.category) && !isAgainstWall(fr, ctx.walls, DEFAULT_RULESET.fixtureWallTolMm)) {
    const snap = computeFloatingSnap(fr, ctx.walls, ctx.grid);
    if (snap === "ambiguous")
      return {
        ambiguous: "is equidistant from two walls — give it an explicit place",
        problem: "is not against a wall",
      };
    if (snap === "too-far")
      return { ambiguous: "floats too far from any wall to snap automatically", problem: "is not against a wall" };
    if (snap)
      return { dx: snap.dx, dy: snap.dy, reason: "snapped against the nearest wall", problem: "is not against a wall" };
  }
  return null;
}

/**
 * The orientation verdict for a fixture standing at `fr` with quarter-turn `rotate`:
 * the turn that puts its back on the one wall it stands against, a message when there
 * is no single answer (a corner), or null when nothing is wrong. Shared by the
 * orientation pass and the final report, so a fixture repair may not turn is described
 * with the same geometry that would have turned it (ADR 0005 — never guess).
 */
function orientationVerdict(
  fr: BBox,
  category: string,
  rotate: number,
  walls: RWall[],
): { to: number; reason: string; problem: string } | Ambiguous | null {
  if (!orientationMatters(category)) return null;
  const backing = wallBackedEdges(fr, walls, DEFAULT_RULESET.fixtureWallTolMm);
  if (backing[backEdgeForRotate(rotate)] !== null) return null; // already facing its wall
  const walled = backedEdgeList(backing);
  if (walled.length === 0) return null; // floats against nothing — the mover pass owns that
  // Narrow by the footprint's aspect, exactly as the lint fix does: a 400×700 WC can
  // only back onto a horizontal edge, so a corner often has one valid answer after all.
  const shape = backCandidateEdges({ w: fr.w, h: fr.h }, defaultFootprint(category));
  const targets = walled.filter((e) => shape.includes(e));
  if (targets.length !== 1)
    return {
      ambiguous: `faces the room with no single wall to back onto (walls on its ${walled.join(
        "/",
      )} side) — set \`rotate\` yourself`,
      problem: `has its back to the room (the wall is on its ${walled.join("/")} side)`,
    };
  const to = rotateForBackEdge(targets[0]!);
  if (to === rotate) return null;
  return {
    to,
    reason: `turned to put its back against the wall on its ${walled[0]} side`,
    problem: `has its back to the room (the wall is on its ${walled.join("/")} side)`,
  };
}

// ---- statement scan: every furniture statement, however deeply nested ----------

/** The innermost expansion construct a furniture statement sits inside. */
interface Enclosure {
  /** How to name it in a report ("a `for` statement"). */
  what: string;
  line: number;
}

/** One furniture *statement* in repair's private AST clone. */
interface Site {
  f: FurnitureNode;
  /** Id the change log/report names this statement by. */
  id: string;
  enc: Enclosure | null;
}

/**
 * Every furniture statement in the plan, in source order — including the ones inside
 * `for` / `while` / `if` bodies and component definitions, which a top-level-only scan
 * silently skipped (the bug this walk exists to kill). A component body is walked once
 * however many times it is instantiated: the *instance count* comes from the resolved
 * IR, so one statement is one site no matter how many pieces it draws.
 */
function collectSites(plan: PlanNode): Site[] {
  const out: Site[] = [];
  let counter = 0;
  const seen = new Set<ComponentDef>();
  const walk = (body: Statement[], enc: Enclosure | null, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) return;
    for (const st of body) {
      switch (st.kind) {
        case "furniture": {
          const f = st as FurnitureNode;
          out.push({ f, id: f.id || `${f.category}#${++counter}`, enc });
          break;
        }
        case "for":
          walk(st.body, { what: "a `for` statement", line: st.line }, depth + 1);
          break;
        // A storey. Its body is where a multi-storey plan's furniture actually lives, so
        // NOT recursing here would silently skip every piece above the ground floor (the
        // exact class of bug this walk exists to kill). A level is not an expansion
        // construct — one statement is still one drawn piece — so no `Enclosure` is
        // pushed: `repair` can rewrite an `at`/`inset` inside a level in place.
        case "level":
          walk(st.body, enc, depth + 1);
          break;
        // A wing/department grouping. Like a level it is NOT an expansion construct — one
        // statement inside it is still one drawn piece — so no `Enclosure` is pushed and
        // `repair` can rewrite an `at`/`inset` inside a zone in place. Failing to recurse
        // here would silently skip every fixture in a zoned plan, which the repair-coverage
        // postcondition (`test/repair-coverage.test.ts`) forbids.
        case "zone":
          walk(st.body, enc, depth + 1);
          break;
        case "while":
          walk(st.body, { what: "a `while` statement", line: st.line }, depth + 1);
          break;
        case "if": {
          const e: Enclosure = { what: "an `if` statement", line: st.line };
          walk(st.then, e, depth + 1);
          if (st.else) walk(st.else, e, depth + 1);
          break;
        }
        case "instance": {
          const def = plan.components.get(st.name);
          if (def && !seen.has(def)) {
            seen.add(def);
            walk(def.body, { what: `component "${st.name}"`, line: def.line }, depth + 1);
          }
          break;
        }
        // A `place`d instance. Same shape as a bare call — ONE statement can draw N
        // pieces, so the body is walked once and every site inside it is enclosed, which
        // is what turns a would-be rewrite into an `unresolved` entry instead of an edit
        // that silently moves every instance. It is enclosed even for a SINGLE `place`,
        // because the piece's coordinates are the component's local ones while the move
        // repair computed is in plan coordinates: under a `rotate`/`mirror` the two are
        // not the same number, so the honest answer is to say so.
        case "place": {
          const def = plan.components.get(st.name);
          if (def && !seen.has(def)) {
            seen.add(def);
            walk(def.body, { what: `component "${st.name}" (placed as "${st.alias}")`, line: def.line }, depth + 1);
          }
          break;
        }
        default:
          break;
      }
    }
  };
  walk(plan.body, null, 0);
  return out;
}

const spanKey = (s: Span | undefined): string => (s ? `${s.start}:${s.end}` : "");

/** Key linking a furniture statement to its resolved instances. The byte span alone
 *  could collide with a node linked in from another module (whose offsets are that
 *  file's), so the category joins it. */
const instKey = (span: Span | undefined, category: string): string => `${spanKey(span)}|${category}`;

// ---- room-anchored placement: re-expressing a move as an `inset` ---------------

/** One axis of a room-anchored placement: `coord = base + coef * inset`
 *  (`coef === 0` ⇒ the axis is centred, so no `inset` can move it). */
interface InsetAxis {
  base: number;
  coef: -1 | 0 | 1;
}

/** How a `furniture … in <room> centered|anchor …` statement turns an `inset` into a
 *  footprint corner — the resolver's arithmetic, inverted so repair can solve for the
 *  `inset` a move needs. */
interface PlaceModel {
  roomId: string;
  /** null for `centered` — it anchors no edge, so there is no `inset` to rewrite. */
  anchor: FurnitureAnchor | null;
  inset: number;
  flush: boolean;
  x: InsetAxis;
  y: InsetAxis;
}

/**
 * Model the resolver's room-anchored placement (`placeInRoom` in
 * `elements/furniture.ts`) as one linear axis pair. It reads the anchored edges from
 * the shared {@link ANCHOR_BACK_EDGES} table and, for `flush`, the backing wall's inner
 * face from {@link innerFaceOfRoomEdge} — the very functions resolve uses — so the
 * inverse can never drift from the forward computation. `flush` is therefore honoured
 * in its own reference frame: an `inset` rewritten on a flush placement still measures
 * from the plaster.
 */
function placeModel(
  place: FurniturePlace,
  roomId: string,
  room: BBox,
  w: number,
  h: number,
  inset: number,
  walls: RWall[],
): PlaceModel {
  const flush = place.flush === true;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  if (place.mode === "centered") {
    return {
      roomId,
      anchor: null,
      inset,
      flush,
      x: { base: cx - w / 2, coef: 0 },
      y: { base: cy - h / 2, coef: 0 },
    };
  }
  const a = place.anchor;
  const face = (e: RectEdge): number | null =>
    flush && ANCHOR_BACK_EDGES[a].includes(e) ? innerFaceOfRoomEdge(room, e, walls, FIXTURE_WALL_TOL_MM) : null;
  let x: InsetAxis;
  if (a === "top-left" || a === "left" || a === "bottom-left") x = { base: face("left") ?? room.x, coef: 1 };
  else if (a === "top-right" || a === "right" || a === "bottom-right")
    x = { base: (face("right") ?? room.x + room.w) - w, coef: -1 };
  else x = { base: cx - w / 2, coef: 0 };
  let y: InsetAxis;
  if (a === "top-left" || a === "top" || a === "top-right") y = { base: face("top") ?? room.y, coef: 1 };
  else if (a === "bottom-left" || a === "bottom" || a === "bottom-right")
    y = { base: (face("bottom") ?? room.y + room.h) - h, coef: -1 };
  else y = { base: cy - h / 2, coef: 0 };
  return { roomId, anchor: a, inset, flush, x, y };
}

/**
 * The `inset` that puts an anchored piece's corner exactly at `target`, or null when no
 * single `inset` can (the two anchored axes need different values, the move runs along a
 * centred axis, or it would need a negative inset — i.e. a position outside the room
 * edge). One `inset` serves both axes of a corner anchor, which is exactly why an
 * arbitrary move often is *not* expressible — the caller then rewrites the whole
 * placement rather than pretend.
 *
 * The candidate is verified by running the placement forward through the same grid snap
 * `resolve` applies, so a rewrite either reproduces the repaired position byte-for-byte
 * or is rejected.
 */
function insetForTarget(
  place: PlaceModel,
  target: { x: number; y: number },
  snap: (v: number) => number,
): number | null {
  let want: number | null = null;
  const axes: Array<[InsetAxis, number]> = [
    [place.x, target.x],
    [place.y, target.y],
  ];
  for (const [ax, t] of axes) {
    if (ax.coef === 0) continue;
    const i = (t - ax.base) / ax.coef;
    if (want === null) want = i;
    else if (want !== i) return null;
  }
  if (want === null || want < 0) return null;
  for (const [ax, t] of axes) if (snap(ax.base + ax.coef * want) !== t) return null;
  return want;
}

// ---- pieces --------------------------------------------------------------------

/**
 * Why repair may not rewrite a statement's position. `null` ⇒ it can (a movable piece);
 * anything else is the sentence appended to the fault when reporting it, so a declined
 * piece says both *what* is wrong and *why it was left alone*.
 */
type Blocked = string | null;

interface Piece {
  site: Site;
  f: FurnitureNode;
  id: string;
  /** Position in the resolved element order — the mover order overlap separation uses. */
  ord: number;
  orig: { x: number; y: number };
  cur: { x: number; y: number };
  w: number;
  h: number;
  /** Resolved quarter-turn (an anchor-derived rotation included). */
  rotate: number;
  /** Set when the resolver derived the rotation rather than the author writing it. */
  rotateDerived: boolean;
  room?: BBox;
  /** Present for a `in <room> …` piece — how to re-express a move as an `inset`. */
  place?: PlaceModel;
  /** Every position this piece has held in this pass, oldest first — the `"x,y"` keys.
   *  Ordered, not a set, because a repeat has to yield the CYCLE (the stretch from the
   *  first sighting on) and not merely the fact that one exists. */
  trail: string[];
  reasons: string[];
  stuck: boolean;
  /** Set by the orientation pass: the quarter-turn before/after, and why. */
  turn?: { from: number; to: number; reason: string };
}

/** Anything the arrangement must respect: a live movable piece or a fixed obstacle. */
interface Occupant {
  ord: number;
  /**
   * How a report names this piece: the *statement* id for a movable piece (what the
   * change log has always used), the **resolved** id for one repair may not rewrite —
   * a scripted statement draws several pieces, and only the resolved id (the one `lint`
   * and `describe` print) says which of them is meant.
   */
  id: string;
  /** The resolved id, used when naming this piece inside another's message. */
  ref: string;
  category: string;
  span?: Span;
  /** Resolved rect — the live one when `piece` is set. */
  rect: BBox;
  rotate: number;
  room?: BBox;
  piece?: Piece;
  /** Why this occupant is not movable (unset for a movable piece). */
  blocked?: string;
}

const rectOfPiece = (p: Piece): BBox => ({ x: p.cur.x, y: p.cur.y, w: p.w, h: p.h });
const rectOfOccupant = (o: Occupant): BBox => (o.piece ? rectOfPiece(o.piece) : o.rect);

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
 * How many times {@link repair} may re-run its own pass while looking for the cycle it
 * settles in.
 *
 * The orbit is short because a pass already parks each cycling PIECE on its own cycle's
 * canonical member, so what is left for this loop is the interaction between pieces
 * rather than the pieces themselves: over 2000 generated plans the longest orbit is five
 * rounds and 95% are one or two. (Without the per-piece rule the two lengths multiply —
 * the same corpus then reached thirty, three pieces cycling with periods 4, 2 and 6.)
 * The cap only bounds a pathological plan, and reaching it is reported rather than hidden.
 */
const MAX_ROUNDS = 24;

/**
 * Byte spans of the **original** source's furniture statements, keyed `${level}|${id}`.
 *
 * The first round fills it and every later round reads it: a later round parses a
 * re-*printed* source, so its own offsets index that intermediate text, not the source
 * the caller passed in — and `RepairChange.span` / `RepairNote.span` promise the
 * caller's. Ids survive the re-print (an author's `id=`, or the walk-order counter), so
 * they are what ties a later round's statement back to the one the caller wrote.
 */
type SpanBook = Map<string, Span>;

/**
 * Correct a plan and return new source + a change log.
 *
 * **`repair` is idempotent: `repair(repair(s)).source === repair(s).source`, byte for
 * byte.** That is a law, pinned by `test/fuzz.test.ts`, and it is not free — a single
 * pass does not have it. A pass moves each piece by the highest-priority closed-form fix
 * until nothing moves, and stops a piece that would revisit a position it has already
 * held. Where two rules disagree, *where* it stops is then an accident of where it
 * started: a piece 1800 mm wide in an 1800 mm gap whose only exact position is off the
 * grid is pushed off the left wall onto the right one and back for ever, and the pass
 * banks whichever of the two it happened to reach. Run the pass again from there and it
 * banks the other. So which arrangement `arch repair` shipped depended on how many times
 * you had run it (`docs/backlog.md` 3.11).
 *
 * There is no closed-form cause fix for that, because nothing is miscomputed: on a
 * gridded plan the two constraints are jointly **unsatisfiable**, and each remedy is
 * individually right. What can be fixed is the arbitrariness, and the same trick works
 * twice. Iterating anything deterministic walks a trajectory that must eventually
 * repeat, and the repeated stretch is a *cycle* — a property of the plan, not of where
 * the walk began. So both levels park on the cycle's **canonical member**, chosen by a
 * key that reads only the members and never the order they were reached in:
 *
 *   * a **piece** that returns to a position it has held is parked on the lowest `(x,y)`
 *     of the cycle it is walking, rather than wherever the pass happened to catch it;
 *   * the **pass** is then run until the emitted source repeats, and the
 *     lexicographically smallest source of that cycle is what ships.
 *
 * Every member of a cycle has that same cycle as its orbit, so re-running from the
 * canonical member returns it unchanged — which is the law. A plan whose pass already
 * reaches a fixpoint has a cycle of one and comes back byte-identical to before any of
 * this existed; only the plans that never settled move.
 *
 * The pieces that keep moving inside the cycle are named in `unresolved` — repair never
 * pretends a plan it could not settle is clean. Anything else left unfixable goes there
 * too, including a piece repair may not rewrite at all.
 */
export function repair(source: string): RepairResult {
  const book: SpanBook = new Map();
  const rounds: RepairResult[] = [];
  // Source text → the round that produced it. The caller's own source is round −1, so a
  // pass that hands it straight back is a cycle of one and returns untouched.
  const seen = new Map<string, number>([[source, -1]]);
  let cur = source;
  let start = 0;
  let end = -1;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const r = repairPass(cur, book, i === 0);
    rounds.push(r);
    const prev = seen.get(r.source);
    if (prev !== undefined) {
      start = prev + 1; // the cycle runs from the first sighting to this repeat
      end = i;
      break;
    }
    seen.set(r.source, i);
    cur = r.source;
  }
  const bounded = end < 0;
  if (bounded) {
    start = 0;
    end = rounds.length - 1;
  }
  let canon = rounds[start]!.source;
  for (let i = start + 1; i <= end; i++) if (rounds[i]!.source < canon) canon = rounds[i]!.source;
  // The EARLIEST round that produced it: the change log is composed along the chain up to
  // there, and a shorter chain is a shorter composition.
  const c = rounds.findIndex((r) => r.source === canon);
  const unresolved = [...rounds[c]!.unresolved];
  const noted = new Set(unresolved.map((u) => `${u.level ?? ""}|${u.id}|${u.reason}`));
  const push = (n: RepairNote): void => {
    const k = `${n.level ?? ""}|${n.id}|${n.reason}`;
    if (noted.has(k)) return;
    noted.add(k);
    unresolved.push(n);
  };
  if (end > start)
    for (const n of cycleNotes(
      rounds.slice(start, end + 1).map((r) => r.source),
      book,
    ))
      push(n);
  if (bounded)
    push({
      id: "plan",
      reason: `repair's passes did not settle within ${MAX_ROUNDS} rounds — the plan keeps the canonical arrangement of the ones they reached; place the pieces reported above by hand`,
    });
  return {
    source: canon,
    changes: composeChanges(rounds.slice(0, c + 1)),
    unresolved,
    changed: canon !== source,
  };
}

/**
 * The change log of the whole run: one entry per piece per kind, from where it started
 * to where it ended, however many rounds it took to get there.
 *
 * A piece that a later round moved back to where it began gets **no entry** — the change
 * log describes the source the caller receives, and reporting a move that source does not
 * contain would be a lie of exactly the kind {@link planWrite} exists to prevent.
 */
function composeChanges(rounds: RepairResult[]): RepairChange[] {
  const byPiece = new Map<string, RepairChange>();
  for (const r of rounds)
    for (const c of r.changes) {
      const key = `${c.level ?? ""}|${c.id}|${c.kind}`;
      const prior = byPiece.get(key);
      if (!prior) {
        byPiece.set(key, { ...c });
        continue;
      }
      prior.to = c.to;
      // A `rotated` entry's from/to are the piece's position, and both name where it
      // ended up — the turn moved nothing, and the field says so.
      if (c.kind === "rotated") prior.from = c.to;
      if (c.toRotate !== undefined) prior.toRotate = c.toRotate;
      // `placement` is not undone by a later `at`: the placement clause is gone for good,
      // so that is what the net edit did to the statement.
      prior.via = prior.via === "placement" || c.via === "placement" ? "placement" : c.via;
      const said = new Set(prior.reason.split("; "));
      for (const part of c.reason.split("; ")) if (part && !said.has(part)) said.add(part);
      prior.reason = [...said].join("; ");
    }
  return [...byPiece.values()].filter((c) =>
    c.kind === "rotated" ? c.fromRotate !== c.toRotate : c.from.x !== c.to.x || c.from.y !== c.to.y,
  );
}

/**
 * One `unresolved` entry per piece that keeps moving inside the settled cycle — the
 * pieces `repair` could not place, named with every arrangement it saw them in.
 *
 * The comparison is over the RESOLVED positions of each cycle member rather than its
 * text, because the text also carries the clause form (`in <room> anchor …` becoming an
 * absolute `at`), and a piece that is standing still is standing still however its
 * position is spelled.
 */
function cycleNotes(members: string[], book: SpanBook): RepairNote[] {
  interface Seen {
    level?: number;
    id: string;
    where: string[];
  }
  const byPiece = new Map<string, Seen>();
  for (const src of members) {
    const { ir, levels } = resolvePlan(src);
    const add = (lvl: number | undefined, p: ResolvedPlan | null): void => {
      for (const e of p?.elements ?? []) {
        if (e.kind !== "furniture") continue;
        const f = e as RFurniture;
        const key = `${lvl ?? ""}|${f.id}`;
        const where = `(${f.at.x},${f.at.y})${f.rotate ? ` rotate ${f.rotate}` : ""}`;
        let rec = byPiece.get(key);
        if (!rec) {
          rec = { ...(lvl !== undefined ? { level: lvl } : {}), id: f.id, where: [] };
          byPiece.set(key, rec);
        }
        if (!rec.where.includes(where)) rec.where.push(where);
      }
    };
    if (levels.length > 0) for (const l of levels) add(l.level, l.ir);
    else add(undefined, ir);
  }
  const out: RepairNote[] = [];
  for (const [key, rec] of byPiece) {
    if (rec.where.length < 2) continue;
    const span = book.get(key);
    out.push({
      id: rec.id,
      reason:
        `could not be settled — repair's own passes cycle between ${rec.where.length} positions for it ` +
        `(${rec.where.join(" ↔ ")}), so no arrangement satisfies every rule here; the plan keeps the ` +
        `canonical one. Move it, resize it, or move what it conflicts with.`,
      ...(span ? { span } : {}),
      ...(rec.level !== undefined ? { level: rec.level } : {}),
    });
  }
  return out;
}

/**
 * ONE corrective pass: parse, resolve, move every piece by the highest-priority
 * closed-form fix until nothing moves, and re-emit. A pure function of `source` — which
 * is what lets {@link repair} iterate it and canonicalise the cycle it lands in.
 *
 * Each pass applies fixes in resolved source order, so overlap separation has a
 * deterministic mover. A piece with no unambiguous move is left where it stands and
 * reported; a piece that returns to a position it has already held is parked on the
 * canonical member of the cycle it is walking, and reported.
 */
function repairPass(source: string, book: SpanBook, record: boolean): RepairResult {
  const unresolved: RepairNote[] = [];
  const noted = new Set<string>();
  /**
   * Record a declined fix. Dedup is per (storey, id, reason): furniture ids are unique
   * within a LEVEL, so on a multi-storey plan the same `wc` id exists on every floor and a
   * globally-keyed dedup would silence the upper storeys' notes.
   */
  const note = (id: string, reason: string, span?: Span, level?: number, seenIds?: Set<string>): void => {
    const key = `${level ?? ""}|${id}|${reason}`;
    seenIds?.add(id);
    if (!noted.has(key)) {
      noted.add(key);
      unresolved.push({ id, reason, ...(span ? { span } : {}), ...(level !== undefined ? { level } : {}) });
    }
  };

  const parsed = parse(source);
  if (!parsed.plan || parsed.diagnostics.some((d) => d.severity === "error")) {
    note("plan", "the source does not parse — fix the syntax errors first (`arch compile --json`)");
    return { source, changes: [], unresolved, changed: false };
  }
  // The parse stage memo shares its PlanNode across callers on the contract that it is
  // never mutated downstream (see parser.ts). repair rewrites furniture placement nodes
  // in place before printing, so it must work on a private deep clone — without this, a
  // second repair() of the same source read the already-moved cached AST and reported
  // zero changes (same input, history-dependent output: an ADR 0006 violation).
  const plan = structuredClone(parsed.plan);
  const { ir, levels } = resolvePlan(source);
  if (!ir) {
    // No resolved geometry ⇒ no positions to reason about. Say so: a plan that does not
    // resolve is exactly the case where a silent `changed: false` reads as "all clear".
    note("plan", "the plan does not resolve — fix the errors first (`arch validate`), then re-run repair");
    return { source, changes: [], unresolved, changed: false };
  }

  // One storey is one building as far as geometry goes — its own walls, rooms, doors and
  // circulation — so a multi-storey plan is repaired level by level against that level's
  // own IR. The statements live in ONE cloned AST (each level's nodes are disjoint), so
  // every storey's rewrites land in the same source and are printed once at the end.
  const storeys: Array<{ level?: number; ir: ResolvedPlan }> =
    levels.length > 0 ? levels.map((l) => ({ level: l.level, ir: l.ir })) : [{ ir }];
  const changes: RepairChange[] = [];
  for (const st of storeys) {
    const seenIds = new Set<string>();
    changes.push(
      ...repairStorey(
        st.ir,
        plan,
        st.level,
        (id, reason, span) => note(id, reason, span, st.level, seenIds),
        seenIds,
        book,
        record,
      ),
    );
  }

  const out = changes.length ? formatPlan(plan, source) : source;
  return { source: out, changes, unresolved, changed: changes.length > 0 };
}

/**
 * Repair ONE resolved plan — a single-storey plan, or one `level` of a multi-storey one.
 *
 * `plan` is repair's private AST clone: the statements this pass rewrites are the ones
 * whose resolved instances appear in `ir`, so a storey only ever edits its own floor
 * (statements belonging to another level resolve to nothing here and are left untouched).
 * `note` is already bound to this storey, and `notedIds` tracks the ids it reported so the
 * postcondition sweep below does not double-report them. `book`/`record` carry the
 * caller's own byte spans across rounds — see {@link SpanBook}.
 */
function repairStorey(
  ir: ResolvedPlan,
  plan: PlanNode,
  level: number | undefined,
  note: (id: string, reason: string, span?: Span) => void,
  notedIds: Set<string>,
  book: SpanBook,
  record: boolean,
): RepairChange[] {
  const spanKeyFor = (id: string): string => `${level ?? ""}|${id}`;
  /** The span to report for `id`. The first round records each statement's ORIGINAL
   *  span; a later round is parsing a re-printed source, so it reads the book rather
   *  than its own offsets ({@link SpanBook}). */
  const spanOf = (id: string, own: Span | undefined): Span | undefined =>
    record ? own : (book.get(spanKeyFor(id)) ?? own);
  const walls = ir.walls;
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const landings = doors
    .map((d) => doorLandingRect(d, DEFAULT_RULESET.doorwayLandingMm))
    .filter((l): l is BBox => l !== null);
  const swings = doors.map((d) => doorSwing(d)).filter((s): s is DoorSwing => s !== null);
  const roomRects = new Map<string, BBox>(
    ir.elements
      .filter((e): e is RRoom => e.kind === "room")
      .map((r) => [r.id, { x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h }]),
  );
  // Rooms whose floor is a POLYGON, not the rectangle above. Every containment push
  // repair knows ("move it back inside its declared room") is rectangle arithmetic, so
  // a piece belonging to one of these is DECLINED and reported in `unresolved` — never
  // pushed towards a bounding box that includes floor the room does not have.
  const polyRoomIds = new Set(
    ir.elements.filter((e): e is RRoom => e.kind === "room" && e.poly !== undefined).map((r) => r.id),
  );
  const grid = plan.grid;

  // ---- statements ⇄ resolved instances ----
  // One furniture statement can resolve to zero pieces (an untaken `if` branch), one, or
  // many (a `for` body, a twice-instantiated component). Only the one-instance case has a
  // single position to rewrite; the rest are reported, never guessed at.
  const irFurniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const byStatement = new Map<string, RFurniture[]>();
  for (const rf of irFurniture) {
    const k = instKey(rf.span, rf.category);
    const list = byStatement.get(k);
    if (list) list.push(rf);
    else byStatement.set(k, [rf]);
  }
  const sites = collectSites(plan);
  const siteOfKey = new Map<string, Site>();
  const ambiguousKeys = new Set<string>();
  for (const s of sites) {
    const k = instKey(s.f.span, s.f.category);
    if (siteOfKey.has(k)) ambiguousKeys.add(k);
    else siteOfKey.set(k, s);
  }

  const pieces: Piece[] = [];
  const occupants: Occupant[] = [];
  irFurniture.forEach((rf, ord) => {
    const k = instKey(rf.span, rf.category);
    const site = siteOfKey.get(k);
    const instances = byStatement.get(k) ?? [];
    const room = rf.room ? roomRects.get(rf.room) : undefined;
    const base: Occupant = {
      ord,
      id: rf.id,
      ref: rf.id,
      category: rf.category,
      ...(rf.span ? { span: rf.span } : {}),
      rect: { x: rf.at.x, y: rf.at.y, w: rf.size.w, h: rf.size.h },
      rotate: rf.rotate ?? 0,
      ...(room ? { room } : {}),
    };
    // Every statement's ORIGINAL span, under both names a report can use for it: the
    // resolved id (a piece repair may not rewrite) and the statement id (one it can).
    if (record && rf.span) {
      book.set(spanKeyFor(rf.id), rf.span);
      if (site) book.set(spanKeyFor(site.id), rf.span);
    }
    const blocked = ((): Blocked => {
      if (rf.room !== undefined && polyRoomIds.has(rf.room))
        return `its declared room "${rf.room}" is a polygon (\`room polygon …\`), whose floor is not a rectangle — repair has no containing push for that shape; move the piece by hand`;
      if (!site || ambiguousKeys.has(k))
        return "repair could not tie it back to a single statement in this file (an imported or duplicated statement) — adjust the source it comes from";
      const f = site.f;
      if (instances.length > 1) {
        const where = site.enc ? `${site.enc.what} at line ${site.enc.line}` : `line ${f.line}`;
        const ids = instances.map((i) => i.id).join(", ");
        return `its placement is scripted — ${where} expands to ${instances.length} pieces (${ids}), so one statement cannot carry one piece's own position or rotation; edit the source`;
      }
      if (f.against)
        return `it is anchored with \`against wall ${f.against.wall}\`, so the wall decides where it sits — change the \`offset\`/\`side\`, or move what it conflicts with`;
      if (f.place) {
        if (f.place.mode === "anchor" && f.place.inset !== undefined && litNum(f.place.inset) === null)
          return "its `inset` is an expression, so rewriting it would discard that arithmetic — adjust the source";
        return null;
      }
      if (!f.at) return "it has no position clause repair understands — adjust the source";
      if (litNum(f.at.x) === null || litNum(f.at.y) === null)
        return "its coordinates are expressions, so rewriting them would discard that arithmetic — adjust the source";
      return null;
    })();
    if (blocked !== null || !site) {
      occupants.push({ ...base, blocked: blocked ?? "it is not a statement repair can rewrite" });
      return;
    }
    const f = site.f;
    const p: Piece = {
      site,
      f,
      id: site.id,
      ord,
      orig: { x: rf.at.x, y: rf.at.y },
      cur: { x: rf.at.x, y: rf.at.y },
      w: rf.size.w,
      h: rf.size.h,
      rotate: rf.rotate ?? 0,
      rotateDerived: f.rotate === undefined && rf.rotate !== undefined,
      ...(room ? { room } : {}),
      ...(f.place
        ? {
            place: placeModel(
              f.place,
              rf.room ?? "",
              roomRects.get(rf.room ?? "") ?? base.rect,
              rf.size.w,
              rf.size.h,
              (f.place.mode === "anchor" ? litNum(f.place.inset) : 0) ?? 0,
              walls,
            ),
          }
        : {}),
      trail: [`${rf.at.x},${rf.at.y}`],
      reasons: [],
      stuck: false,
    };
    pieces.push(p);
    occupants.push({ ...base, id: site.id, piece: p });
  });

  // ---- circulation guard (ADR 0006/0008) ----
  // A furniture move is rejected if it would newly squeeze any room's entrance walk
  // (or a key route) below the lint threshold. Static geometry (rooms/walls/doors) is
  // hoisted; only the movable furniture varies, so a candidate check is one circulation
  // compute. The guard is active only when there is an entrance to measure a walk from.
  const minPathClear = DEFAULT_RULESET.minPathClearWidthMm;
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const openingEls = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const access = buildDoorAccessGraph(roomEls, doors, DEFAULT_TOL, undefined, openingEls);
  // Furniture NOT under repair's control (against-wall / scripted / expression-placed)
  // stays put; the movable pieces contribute their live position instead.
  const staticFurniture = occupants.filter((o) => !o.piece).map((o) => irFurniture[o.ord]!);
  const guardActive = access.hasEntrance;
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
    return computeCirculation(
      roomEls,
      walls,
      doors,
      openingEls,
      [...staticFurniture, ...dyn],
      access,
      DEFAULT_TOL,
      undefined,
      verticalsOf(ir),
      ir.elements.filter((e): e is RVoid => e.kind === "void"),
    );
  };
  // Baseline circulation of the starting arrangement; updated in place as pieces move so
  // each candidate check is a single compute (the accepted `after` becomes the next `before`).
  let beforeCirc = guardActive ? circWith(-1, { x: 0, y: 0 }) : null;

  /** Everything placed before `ord`, at its live position — what a piece yields to. */
  const earlierThan = (ord: number): Array<{ id: string; rect: BBox }> =>
    occupants.filter((o) => o.ord < ord).map((o) => ({ id: o.ref, rect: rectOfOccupant(o) }));

  const MAX_PASSES = Math.min(64, pieces.length * 6 + 8);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.stuck) continue;
      const fr = rectOfPiece(p);
      const fix = nextFix(fr, {
        category: p.f.category,
        ...(p.room ? { room: p.room } : {}),
        earlier: earlierThan(p.ord),
        walls,
        landings,
        swings,
        grid,
      });
      if (fix === null) continue;
      if ("ambiguous" in fix) {
        note(p.id, fix.ambiguous, spanOf(p.id, p.f.span));
        p.stuck = true;
        continue;
      }
      const next = { x: p.cur.x + fix.dx, y: p.cur.y + fix.dy };
      const key = `${next.x},${next.y}`;
      const back = p.trail.indexOf(key);
      if (back >= 0) {
        // The piece is chasing its own tail: the positions from `back` on are a cycle
        // this pass will walk for ever. Which of them it happens to be standing on right
        // now is an accident of where it started, so it is parked on the cycle's
        // CANONICAL member instead — the lowest `(x, y)`, a key that reads only the
        // cycle. Leaving it at the arrival point is what made `arch repair` ship a
        // different arrangement depending on how many times it had been run
        // (`docs/backlog.md` 3.11); parking it here keeps the pass its own fixpoint for
        // this piece, so a plan's cycles cannot multiply into one long orbit.
        const cycle = p.trail.slice(back).map((k) => {
          const [x, y] = k.split(",");
          return { x: Number(x), y: Number(y) };
        });
        let canon = cycle[0]!;
        for (const c of cycle) if (c.x < canon.x || (c.x === canon.x && c.y < canon.y)) canon = c;
        if (canon.x !== p.cur.x || canon.y !== p.cur.y) {
          p.cur = canon;
          moved = true;
        }
        note(
          p.id,
          `can't be placed without conflict — it cycles between ${cycle.length} positions (${cycle
            .map((c) => `(${c.x},${c.y})`)
            .join(" ↔ ")}); parked on the lowest of them, adjust manually`,
          spanOf(p.id, p.f.span),
        );
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
          note(
            p.id,
            `would pinch the walk to "${label}" below ${minPathClear} mm — left in place; adjust manually`,
            spanOf(p.id, p.f.span),
          );
          p.stuck = true;
          continue;
        }
        beforeCirc = after; // accepted → this arrangement is the new baseline
      }
      p.cur = next;
      p.trail.push(key);
      if (!p.reasons.includes(fix.reason)) p.reasons.push(fix.reason);
      moved = true;
    }
    if (!moved) break;
  }

  // ---- realise every move -----------------------------------------------------
  // A move is only real if the source repair is about to WRITE resolves back to it. The
  // write is therefore planned here, before anything downstream reads a position: an
  // absolute `at` is grid-snapped by `resolve`, so a target off the grid comes back
  // somewhere repair never evaluated — the change log would promise a position the
  // output does not contain, and the next call would start from a piece nobody had
  // looked at. Planning it now also means the orientation pass below asks "which wall is
  // this piece standing on?" of the piece's FINAL position rather than a proposed one.
  // Only a piece that actually moved is planned: re-pointing an untouched `in <room>`
  // placement at its own snapped coordinate would be a gratuitous rewrite.
  const snap = (v: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);
  const writes = pieces.map((p) => (p.cur.x === p.orig.x && p.cur.y === p.orig.y ? null : planWrite(p, snap)));
  pieces.forEach((p, i) => {
    const w = writes[i];
    if (w) p.cur = w.target;
  });

  // ---- orientation pass -------------------------------------------------------
  // Positions are final, so "which wall is this piece standing on?" now has a stable
  // answer. A fixture whose facing means something (a WC's cistern, a basin's tap —
  // not a symmetric shower tray) that sits against exactly ONE wall with its back to
  // the room is turned to face that wall. A corner piece has two equally valid walls,
  // so it is reported, never guessed (ADR 0005). A turn moves nothing, so it can't
  // pinch a walk — the circulation guard has nothing to re-check. A scripted `rotate`
  // is left alone, exactly as a scripted position is.
  for (const p of pieces) {
    if (p.f.rotate !== undefined && litNum(p.f.rotate) === null) continue;
    const verdict = orientationVerdict(rectOfPiece(p), p.f.category, p.rotate, walls);
    if (verdict === null) continue;
    if ("ambiguous" in verdict) {
      note(p.id, verdict.ambiguous, spanOf(p.id, p.f.span));
      continue;
    }
    p.turn = { from: p.rotate, to: verdict.to, reason: verdict.reason };
  }

  // ---- emit -------------------------------------------------------------------
  const changes: RepairChange[] = [];
  const changedIds = new Set<string>();
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const w = writes[i];
    const sp = spanOf(p.id, p.f.span);
    if (w && (p.cur.x !== p.orig.x || p.cur.y !== p.orig.y)) {
      applyWrite(p, w);
      changes.push({
        id: p.id,
        category: p.f.category,
        kind: "moved",
        from: p.orig,
        to: p.cur,
        via: w.via,
        ...(sp ? { span: sp } : {}),
        reason: [...p.reasons, ...w.extra].join("; "),
        ...(level !== undefined ? { level } : {}),
      });
      changedIds.add(p.id);
    }
    if (p.turn) {
      p.f.rotate = numExpr(p.turn.to);
      changes.push({
        id: p.id,
        category: p.f.category,
        kind: "rotated",
        from: p.cur,
        to: p.cur,
        fromRotate: p.turn.from,
        toRotate: p.turn.to,
        via: "rotate",
        ...(sp ? { span: sp } : {}),
        reason: p.turn.reason,
        ...(level !== undefined ? { level } : {}),
      });
      changedIds.add(p.id);
    }
  }

  // ---- the postcondition: nothing flagged is left silent ----------------------
  // Every piece repair did NOT change is put back through the same passes one last
  // time. If a fault is still there, it is reported with the reason repair left the
  // piece alone (scripted, `against wall`, expression coordinates, …). Pieces already
  // reported above keep their (more specific) note — this only closes the silence.
  for (const o of occupants) {
    if (o.piece && changedIds.has(o.id)) continue;
    if (notedIds.has(o.id)) continue;
    const fr = rectOfOccupant(o);
    // A piece repair may not rewrite is reported as "<fault> — <why it was left alone>".
    // A movable one that simply ran out of fixpoint passes keeps the pass's own advice.
    const why = o.blocked;
    const say = (v: { problem: string; ambiguous?: string }): string =>
      why === undefined
        ? (v.ambiguous ?? `${v.problem} — repair's fixpoint ended before it could be placed; adjust manually`)
        : `${v.problem} — ${why}`;
    const fix = nextFix(fr, {
      category: o.category,
      ...(o.room ? { room: o.room } : {}),
      earlier: earlierThan(o.ord),
      walls,
      landings,
      swings,
      grid,
    });
    if (fix !== null) {
      note(o.id, say(fix), spanOf(o.id, o.span));
      continue;
    }
    const verdict = orientationVerdict(fr, o.category, o.rotate, walls);
    if (verdict === null) continue;
    note(o.id, say(verdict), spanOf(o.id, o.span));
  }

  return changes;
}

/** A rewrite repair intends to make to one statement, and the position that rewrite
 *  will actually resolve back to. Planned before it is applied, because whether a move
 *  is real at all depends on where the written clause lands. */
interface PlannedWrite {
  /**
   * The position the emitted source **resolves to** — not the position the movers asked
   * for. They differ whenever the write is an absolute `at` on a gridded plan, and that
   * difference is what the change log has to report: `to` is a promise about the output.
   */
  target: { x: number; y: number };
  via: NonNullable<RepairChange["via"]>;
  extra: string[];
  /** The `inset` value, when the placement can express the move as one. */
  inset?: number;
}

/**
 * Decide how a piece's repaired position gets written back into its own statement, in
 * the form the author used — and, crucially, **where that write will land**.
 *
 * An absolute `at` is simply re-pointed. A room-anchored placement is first tried as a
 * minimal `inset` edit ({@link insetForTarget}), which keeps the placement declarative
 * (and, with `flush`, keeps measuring from the wall face). Only when no single `inset`
 * reaches the repaired position does the placement become an absolute `at` — and then
 * the rotation the anchor had *derived* is written out explicitly, because an absolute
 * piece derives nothing and dropping it would silently spin the fixture.
 *
 * The `at` branch **grid-snaps**, because `resolve` does (`elements/furniture.ts`: the
 * absolute path is the one place the grid still applies). Without that, repair reported
 * a `to` the output did not contain — a `in <room> centered` piece resolves off-grid,
 * so re-pointing it at `(550,900)` on `grid 100` came back at `(600,900)`, and 37 of
 * 400 generated plans shipped a change log that disagreed with their own source. The
 * `inset` branch needs no snap for the mirror-image reason: a room-anchored coordinate
 * is resolver-derived and is *not* snapped, and {@link insetForTarget} already proves
 * its own forward reproduction.
 */
function planWrite(p: Piece, snap: (v: number) => number): PlannedWrite {
  if (p.place && p.f.place && p.f.place.mode === "anchor") {
    const i = insetForTarget(p.place, p.cur, (v) => v);
    if (i !== null) {
      // The `inset` is what the source carries, so round IT and read the position back
      // out of the placement's own linear model (`coord = base + coef * inset`, the
      // arithmetic `insetForTarget` just inverted). Reporting the pre-rounding target
      // would promise a position the rewritten statement does not resolve to.
      const ri = printed(i);
      const axis = (ax: InsetAxis): number => (ax.coef === 0 ? ax.base : ax.base + ax.coef * ri);
      return {
        target: { x: axis(p.place.x), y: axis(p.place.y) },
        via: "inset",
        inset: ri,
        extra: [
          `re-expressed as \`inset ${numStr(ri)}\`${p.place.flush ? " from the wall face" : ""} (was ${p.place.inset})`,
        ],
      };
    }
  }
  const target = { x: printed(snap(p.cur.x)), y: printed(snap(p.cur.y)) };
  if (!p.place || !p.f.place) return { target, via: "at", extra: [] };
  const place = p.f.place;
  const clause = place.mode === "centered" ? "centered" : `anchor ${place.anchor}`;
  return {
    target,
    via: "placement",
    extra: [
      `\`in ${p.place.roomId} ${clause}\` could not express the move as an \`inset\`, so it became an absolute \`at\``,
    ],
  };
}

/** Apply a {@link planWrite} decision to the AST clone. `p.cur` is already the plan's
 *  {@link PlannedWrite.target}, so what is written and what is reported are one number. */
function applyWrite(p: Piece, w: PlannedWrite): void {
  const place = p.f.place;
  if (w.via === "inset") {
    // `planWrite` only chooses this branch for an `anchor` placement (`centered` anchors
    // no edge, so no `inset` can move it) — the narrowing follows that, not a guess.
    if (place?.mode === "anchor") place.inset = numExpr(w.inset!);
    return;
  }
  if (w.via === "placement") {
    p.f.place = undefined;
    p.f.room = p.place!.roomId; // keep the ownership the `in <room>` carried
    if (p.rotateDerived && p.f.rotate === undefined) {
      p.f.rotate = numExpr(p.rotate);
      w.extra.push(`the anchor-derived \`rotate ${p.rotate}\` is now written out`);
    }
  }
  p.f.at = { x: numExpr(p.cur.x), y: numExpr(p.cur.y) };
}
