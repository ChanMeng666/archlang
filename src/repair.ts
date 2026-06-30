/**
 * `repair(source)` — an explicit, opt-in source-to-source corrector.
 *
 * Per [ADR 0006](../docs/adr/0006-solver-as-explicit-transform.md), ArchLang's
 * `compile()` never auto-fixes a plan: it renders exactly what is written and `lint`
 * flags problems. Corrective arranging lives **here**, behind an explicit command, and
 * its output is *new `.arch` source plus a change log* the author reviews — never an
 * invisible render-time edit.
 *
 * It fixes the three furniture-placement faults a geometry-blind generator produces,
 * each by a closed-form move (no search, no optimizer):
 *   1. a piece drawn **through a wall** → pushed flush against the nearest face;
 *   2. a piece in a **door's clear landing** → pushed out of the approach, preferring
 *      an exit that doesn't drive it into a wall;
 *   3. a wall-requiring **fixture floating** mid-room → snapped onto the nearest wall.
 *
 * Each piece is iterated to a stable position (wall → doorway → floating priority); a
 * piece that would have to cycle, that sits with no majority side, or that floats too
 * far from any wall is left at its best position and **reported** — repair never
 * guesses among equal options. Pieces placed `against wall` or with non-literal
 * coordinates are untouched. Pure: parse → resolve (wall/door geometry) → mutate the
 * parsed AST → re-emit via the formatter. No I/O, no time, deterministic.
 */

import { parse } from "./parser.js";
import { formatPlan } from "./format.js";
import { resolvePlan, overlap1d, isAgainstWall, type BBox } from "./analyze.js";
import { segmentsOfWall } from "./geometry.js";
import { DEFAULT_RULESET } from "./lint.js";
import { requiresWall } from "./fixtures-catalog.js";
import type { RWall, RDoor } from "./ir.js";
import type { FurnitureNode } from "./ast.js";
import type { Expr } from "./expr.js";

/** Intrusion (mm) past which a piece counts as colliding with a wall — mirrors lint. */
const SLACK_MM = 30;
/** How far (mm) a floating fixture may be from a wall and still be auto-snapped to it. */
const MAX_SNAP_MM = 1200;
/** Safety cap on per-piece iterations (a stuck piece is reported, not thrashed). */
const MAX_STEPS = 8;

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

/** Signed across-wall intrusion of `fr` into one orthogonal wall segment (0 if none
 *  or non-orthogonal). Returns `{ depth, axis, center }` so callers can both test a
 *  collision and compute the push that clears it. */
function wallIntrusion(fr: BBox, s: { a: { x: number; y: number }; b: { x: number; y: number }; thickness: number }):
  { depth: number; axis: "x" | "y"; center: number } | null {
  const horiz = s.a.y === s.b.y;
  const vert = s.a.x === s.b.x;
  if (horiz === vert) return null;
  const h2 = s.thickness / 2;
  if (horiz) {
    const band = overlap1d(fr.y, fr.y + fr.h, s.a.y - h2, s.a.y + h2);
    const lo = Math.max(fr.x, Math.min(s.a.x, s.b.x));
    const hi = Math.min(fr.x + fr.w, Math.max(s.a.x, s.b.x));
    if (band <= 0 || hi - lo <= 1) return null;
    return { depth: band, axis: "y", center: s.a.y };
  }
  const band = overlap1d(fr.x, fr.x + fr.w, s.a.x - h2, s.a.x + h2);
  const lo = Math.max(fr.y, Math.min(s.a.y, s.b.y));
  const hi = Math.min(fr.y + fr.h, Math.max(s.a.y, s.b.y));
  if (band <= 0 || hi - lo <= 1) return null;
  return { depth: band, axis: "x", center: s.a.x };
}

/** Does `fr` collide with any wall solid by more than the slack? */
function hitsWall(fr: BBox, walls: RWall[]): boolean {
  for (const w of walls) for (const s of segmentsOfWall(w)) {
    const hit = wallIntrusion(fr, s);
    if (hit && hit.depth > SLACK_MM) return true;
  }
  return false;
}

/** The push that clears `fr` from the wall it most penetrates, "ambiguous" when it
 *  straddles a centreline with no majority side, or null when it hits nothing. */
function computeWallPush(fr: BBox, walls: RWall[], grid: number): { dx: number; dy: number; wallId: string } | "ambiguous" | null {
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
        if (cy === hit.center) { ambiguous = true; continue; }
        const newY = cy > hit.center ? snapOut(hit.center + h2, +1, grid) : snapOut(hit.center - h2 - fr.h, -1, grid);
        if (!best || hit.depth > best.depth) best = { depth: hit.depth, dx: 0, dy: newY - fr.y, wallId: w.id };
      } else {
        if (cx === hit.center) { ambiguous = true; continue; }
        const newX = cx > hit.center ? snapOut(hit.center + h2, +1, grid) : snapOut(hit.center - h2 - fr.w, -1, grid);
        if (!best || hit.depth > best.depth) best = { depth: hit.depth, dx: newX - fr.x, dy: 0, wallId: w.id };
      }
    }
  }
  if (best) return { dx: best.dx, dy: best.dy, wallId: best.wallId };
  return ambiguous ? "ambiguous" : null;
}

/** The clear-landing rectangle straddling a door opening on its (orthogonal) host wall. */
function landingOf(d: RDoor, depth: number): BBox | null {
  const seg = d.host;
  if (!seg) return null;
  const horiz = seg.a.y === seg.b.y;
  const vert = seg.a.x === seg.b.x;
  if (horiz === vert) return null;
  const halfW = d.width / 2;
  return horiz
    ? { x: d.at.x - halfW, y: d.at.y - depth, w: d.width, h: depth * 2 }
    : { x: d.at.x - depth, y: d.at.y - halfW, w: depth * 2, h: d.width };
}

/** The minimal move that lifts `fr` out of any door landing it overlaps, preferring an
 *  exit that does not drive the piece into a wall. "ambiguous" when two equally-good
 *  exits tie; null when no landing is blocked. */
function computeDoorwayPush(fr: BBox, landings: BBox[], walls: RWall[], grid: number): { dx: number; dy: number } | "ambiguous" | null {
  let best: { shift: number; clean: boolean; dx: number; dy: number } | null = null;
  let tie = false;
  for (const L of landings) {
    const ox = Math.min(fr.x + fr.w, L.x + L.w) - Math.max(fr.x, L.x);
    const oy = Math.min(fr.y + fr.h, L.y + L.h) - Math.max(fr.y, L.y);
    if (ox <= 1 || oy <= 1) continue;
    const exits: Array<{ shift: number; x: number; y: number }> = [
      { shift: fr.x + fr.w - L.x, x: snapOut(fr.x - (fr.x + fr.w - L.x), -1, grid), y: fr.y }, // left
      { shift: L.x + L.w - fr.x, x: snapOut(fr.x + (L.x + L.w - fr.x), +1, grid), y: fr.y },   // right
      { shift: fr.y + fr.h - L.y, x: fr.x, y: snapOut(fr.y - (fr.y + fr.h - L.y), -1, grid) }, // up
      { shift: L.y + L.h - fr.y, x: fr.x, y: snapOut(fr.y + (L.y + L.h - fr.y), +1, grid) },   // down
    ];
    for (const e of exits) {
      if (e.shift <= 0) continue;
      const clean = !hitsWall({ x: e.x, y: e.y, w: fr.w, h: fr.h }, walls);
      const cand = { shift: e.shift, clean, dx: e.x - fr.x, dy: e.y - fr.y };
      const better = (cand.clean && !(best?.clean ?? false)) ||
        (best !== null && cand.clean === best.clean && cand.shift < best.shift - 1e-6);
      const equal = best !== null && cand.clean === best.clean && Math.abs(cand.shift - best.shift) <= 1e-6;
      if (!best || better) { best = cand; tie = false; }
      else if (equal && (cand.dx !== best.dx || cand.dy !== best.dy)) tie = true;
    }
  }
  if (!best) return null;
  if (tie) return "ambiguous";
  return { dx: best.dx, dy: best.dy };
}

/** Snap a floating wall-fixture onto its nearest wall face. "ambiguous" on an exact
 *  tie between two walls, "too-far" when no wall is within MAX_SNAP_MM, null when the
 *  piece already backs onto a wall span. */
function computeFloatingSnap(fr: BBox, walls: RWall[], grid: number): { dx: number; dy: number } | "ambiguous" | "too-far" | null {
  let best: { dist: number; dx: number; dy: number } | null = null;
  let tie = false;
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  for (const w of walls) for (const s of segmentsOfWall(w)) {
    const horiz = s.a.y === s.b.y;
    const vert = s.a.x === s.b.x;
    if (horiz === vert) continue;
    const h2 = s.thickness / 2;
    let dist: number, dx: number, dy: number;
    if (horiz) {
      const segLo = Math.min(s.a.x, s.b.x), segHi = Math.max(s.a.x, s.b.x);
      if (Math.min(fr.x + fr.w, segHi) - Math.max(fr.x, segLo) <= 0) continue; // no shared span
      dy = cy >= s.a.y ? (s.a.y + h2) - fr.y : (s.a.y - h2 - fr.h) - fr.y;
      dx = 0;
      dist = Math.abs(dy);
    } else {
      const segLo = Math.min(s.a.y, s.b.y), segHi = Math.max(s.a.y, s.b.y);
      if (Math.min(fr.y + fr.h, segHi) - Math.max(fr.y, segLo) <= 0) continue;
      dx = cx >= s.a.x ? (s.a.x + h2) - fr.x : (s.a.x - h2 - fr.w) - fr.x;
      dy = 0;
      dist = Math.abs(dx);
    }
    if (!best || dist < best.dist - 1e-6) { best = { dist, dx, dy }; tie = false; }
    else if (Math.abs(dist - best.dist) <= 1e-6 && (dx !== best.dx || dy !== best.dy)) tie = true;
  }
  if (!best) return null;
  if (best.dist <= 1) return null; // already flush
  if (best.dist > MAX_SNAP_MM) return "too-far";
  if (tie) return "ambiguous";
  void grid; // faces land on-grid (on-grid walls + grid-multiple sizes); no re-snap
  return { dx: best.dx, dy: best.dy };
}

// ---- the corrector ------------------------------------------------------------

interface Fix { dx: number; dy: number; reason: string }
type NextFix = Fix | { ambiguous: string } | null;

/** The single highest-priority fix for a piece at rect `fr`: wall, then doorway, then
 *  (for a wall-requiring fixture) snap-to-wall. */
function nextFix(fr: BBox, category: string, walls: RWall[], landings: BBox[], grid: number): NextFix {
  const wall = computeWallPush(fr, walls, grid);
  if (wall === "ambiguous") return { ambiguous: "is centred on a wall — move it onto one side, then re-run" };
  if (wall) return { dx: wall.dx, dy: wall.dy, reason: `pushed clear of wall "${wall.wallId}"` };

  const door = computeDoorwayPush(fr, landings, walls, grid);
  if (door === "ambiguous") return { ambiguous: "sits centred in a doorway — move it aside manually" };
  if (door) return { dx: door.dx, dy: door.dy, reason: "cleared the doorway approach" };

  if (requiresWall(category) && !isAgainstWall(fr, walls, DEFAULT_RULESET.fixtureWallTolMm)) {
    const snap = computeFloatingSnap(fr, walls, grid);
    if (snap === "ambiguous") return { ambiguous: "is equidistant from two walls — give it an explicit place" };
    if (snap === "too-far") return { ambiguous: "floats too far from any wall to snap automatically" };
    if (snap) return { dx: snap.dx, dy: snap.dy, reason: "snapped against the nearest wall" };
  }
  return null;
}

/**
 * Correct a plan and return new source + a change log. Each top-level, literally-placed
 * piece is iterated to a stable position; anything left unfixable is reported.
 */
export function repair(source: string): RepairResult {
  const { plan, diagnostics } = parse(source);
  if (!plan || diagnostics.some((d) => d.severity === "error")) {
    return { source, changes: [], unresolved: [], changed: false };
  }
  const { ir } = resolvePlan(source);
  const walls = ir?.walls ?? [];
  const doors = (ir?.elements ?? []).filter((e): e is RDoor => e.kind === "door");
  const landings = doors.map((d) => landingOf(d, DEFAULT_RULESET.doorwayLandingMm)).filter((l): l is BBox => l !== null);
  const grid = plan.grid;

  const changes: RepairChange[] = [];
  const unresolved: RepairNote[] = [];
  let counter = 0;

  for (const st of plan.body) {
    if (st.kind !== "furniture") continue;
    const f = st as FurnitureNode;
    const idOf = f.id || `${f.category}#${++counter}`;
    if (f.against || !f.at) continue; // wall-anchored placement is already closed-form
    const ax = litNum(f.at.x);
    const ay = litNum(f.at.y);
    const sw = litNum(f.size?.w);
    const sh = litNum(f.size?.h);
    if (ax === null || ay === null || sw === null || sh === null) continue; // scripted coords

    const orig = { x: ax, y: ay };
    let cur = { x: ax, y: ay };
    const visited = new Set<string>([`${ax},${ay}`]);
    const reasons: string[] = [];
    for (let step = 0; step < MAX_STEPS; step++) {
      const fr: BBox = { x: cur.x, y: cur.y, w: sw, h: sh };
      const fix = nextFix(fr, f.category, walls, landings, grid);
      if (fix === null) break; // stable
      if ("ambiguous" in fix) { unresolved.push({ id: idOf, reason: fix.ambiguous }); break; }
      const next = { x: cur.x + fix.dx, y: cur.y + fix.dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) { // would cycle — keep the best position so far, report
        unresolved.push({ id: idOf, reason: "can't be placed without conflicting with a wall or door — adjust manually" });
        break;
      }
      cur = next;
      visited.add(key);
      if (!reasons.includes(fix.reason)) reasons.push(fix.reason);
    }

    if (cur.x !== orig.x || cur.y !== orig.y) {
      f.at = { x: numExpr(cur.x), y: numExpr(cur.y) };
      changes.push({ id: idOf, category: f.category, kind: "moved", from: orig, to: cur, reason: reasons.join("; ") });
    }
  }

  const out = changes.length ? formatPlan(plan, source) : source;
  return { source: out, changes, unresolved, changed: changes.length > 0 };
}
