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
 * deterministic mover) until nothing moves. A piece that would cycle, sits with no
 * majority side, or floats too far is left at its best position and **reported** —
 * repair never guesses among equal options.
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
  type RectEdge,
  resolvePlan,
  rotateForBackEdge,
  wallBackedEdges,
  type BBox,
} from "./analyze.js";
import { computeCirculation, type CirculationModel } from "./analyze/circulation.js";
import { doorLandingRect, pointInRect, rectOverlapAmounts, wallIntrusion } from "./geometry/rect.js";
import { segmentsOfWall, doorSwing, sectorIntersectsRect, type DoorSwing } from "./geometry.js";
import { DEFAULT_RULESET } from "./lint.js";
import { defaultFootprint, orientationMatters, requiresWall } from "./fixtures-catalog.js";
import type { RWall, RDoor, RRoom, ROpening, RFurniture } from "./ir.js";
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
}

export interface RepairNote {
  id: string;
  reason: string;
  /** Byte span of the furniture statement the note is about, when there is one. */
  span?: Span;
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
  visited: Set<string>;
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
 * Correct a plan and return new source + a change log. Furniture is moved to a stable
 * arrangement by a global fixpoint: each pass applies the highest-priority fix to each
 * piece (in resolved source order, so overlap separation has a deterministic mover); a
 * piece that would cycle, or that has no unambiguous move, is left at its best position
 * and reported. Anything left unfixable goes in `unresolved` — including a piece repair
 * may not rewrite at all, which is reported rather than silently skipped.
 */
export function repair(source: string): RepairResult {
  const unresolved: RepairNote[] = [];
  const noted = new Set<string>();
  const notedIds = new Set<string>();
  const note = (id: string, reason: string, span?: Span): void => {
    const key = `${id}|${reason}`;
    notedIds.add(id);
    if (!noted.has(key)) {
      noted.add(key);
      unresolved.push({ id, reason, ...(span ? { span } : {}) });
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
  const { ir } = resolvePlan(source);
  if (!ir) {
    // No resolved geometry ⇒ no positions to reason about. Say so: a plan that does not
    // resolve is exactly the case where a silent `changed: false` reads as "all clear".
    note("plan", "the plan does not resolve — fix the errors first (`arch validate`), then re-run repair");
    return { source, changes: [], unresolved, changed: false };
  }
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
  const grid = plan.grid;
  const snap = (v: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);

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
    const blocked = ((): Blocked => {
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
      visited: new Set([`${rf.at.x},${rf.at.y}`]),
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
    return computeCirculation(roomEls, walls, doors, openingEls, [...staticFurniture, ...dyn], access, DEFAULT_TOL);
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
        note(p.id, fix.ambiguous, p.f.span);
        p.stuck = true;
        continue;
      }
      const next = { x: p.cur.x + fix.dx, y: p.cur.y + fix.dy };
      const key = `${next.x},${next.y}`;
      if (p.visited.has(key)) {
        note(p.id, "can't be placed without conflict — adjust manually", p.f.span);
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
            p.f.span,
          );
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
      note(p.id, verdict.ambiguous, p.f.span);
      continue;
    }
    p.turn = { from: p.rotate, to: verdict.to, reason: verdict.reason };
  }

  // ---- emit -------------------------------------------------------------------
  const changes: RepairChange[] = [];
  const changedIds = new Set<string>();
  for (const p of pieces) {
    const shifted = p.cur.x !== p.orig.x || p.cur.y !== p.orig.y;
    if (shifted) {
      const { via, extra } = writePosition(p, snap);
      changes.push({
        id: p.id,
        category: p.f.category,
        kind: "moved",
        from: p.orig,
        to: p.cur,
        via,
        ...(p.f.span ? { span: p.f.span } : {}),
        reason: [...p.reasons, ...extra].join("; "),
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
        ...(p.f.span ? { span: p.f.span } : {}),
        reason: p.turn.reason,
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
      note(o.id, say(fix), o.span);
      continue;
    }
    const verdict = orientationVerdict(fr, o.category, o.rotate, walls);
    if (verdict === null) continue;
    note(o.id, say(verdict), o.span);
  }

  const out = changes.length ? formatPlan(plan, source) : source;
  return { source: out, changes, unresolved, changed: changes.length > 0 };
}

/**
 * Write a piece's repaired position back into its own statement, in the form the author
 * used — and say which clause changed.
 *
 * An absolute `at` is simply re-pointed. A room-anchored placement is first tried as a
 * minimal `inset` edit ({@link insetForTarget}), which keeps the placement declarative
 * (and, with `flush`, keeps measuring from the wall face). Only when no single `inset`
 * reaches the repaired position does the placement become an absolute `at` — and then
 * the rotation the anchor had *derived* is written out explicitly, because an absolute
 * piece derives nothing and dropping it would silently spin the fixture.
 */
function writePosition(p: Piece, snap: (v: number) => number): { via: RepairChange["via"]; extra: string[] } {
  if (!p.place || !p.f.place) {
    p.f.at = { x: numExpr(p.cur.x), y: numExpr(p.cur.y) };
    return { via: "at", extra: [] };
  }
  const place = p.f.place;
  const i = insetForTarget(p.place, p.cur, snap);
  if (i !== null && place.mode === "anchor") {
    const was = p.place.inset;
    place.inset = numExpr(i);
    return {
      via: "inset",
      extra: [`re-expressed as \`inset ${i}\`${p.place.flush ? " from the wall face" : ""} (was ${was})`],
    };
  }
  const clause = place.mode === "centered" ? "centered" : `anchor ${place.anchor}`;
  const extra = [
    `\`in ${p.place.roomId} ${clause}\` could not express the move as an \`inset\`, so it became an absolute \`at\``,
  ];
  p.f.place = undefined;
  p.f.at = { x: numExpr(p.cur.x), y: numExpr(p.cur.y) };
  p.f.room = p.place.roomId; // keep the ownership the `in <room>` carried
  if (p.rotateDerived && p.f.rotate === undefined) {
    p.f.rotate = numExpr(p.rotate);
    extra.push(`the anchor-derived \`rotate ${p.rotate}\` is now written out`);
  }
  return { via: "placement", extra };
}
