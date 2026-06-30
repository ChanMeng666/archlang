/**
 * `repair(source)` — an explicit, opt-in source-to-source corrector.
 *
 * Per [ADR 0006](../docs/adr/0006-solver-as-explicit-transform.md), ArchLang's
 * `compile()` never auto-fixes a plan: it renders exactly what is written and `lint`
 * flags problems. Corrective arranging lives **here**, behind an explicit command, and
 * its output is *new `.arch` source plus a change log* the author reviews — never an
 * invisible render-time edit.
 *
 * This first pass does one unambiguous, closed-form fix: a piece of furniture drawn
 * **through a wall** is pushed back out so it sits flush against the nearest face. It
 * pushes along the axis of least penetration, in the direction the piece already
 * mostly lies, snapped to the grid away from the wall. A piece centred exactly on a
 * wall (no majority side) is reported as `unresolved` — repair refuses to guess. Pieces
 * placed `against wall` or with non-literal coordinates are left untouched and noted.
 *
 * Pure: parse → resolve (for wall geometry) → mutate the parsed AST → re-emit via the
 * formatter. No I/O, no time, deterministic.
 */

import { parse } from "./parser.js";
import { formatPlan } from "./format.js";
import { resolvePlan, overlap1d } from "./analyze.js";
import { segmentsOfWall } from "./geometry.js";
import type { RWall } from "./ir.js";
import type { FurnitureNode } from "./ast.js";
import type { Expr } from "./expr.js";

/** Matches the lint collision threshold so repair fires on exactly what lint flags. */
const SLACK_MM = 30;

export interface RepairChange {
  id: string;
  category: string;
  kind: "moved-out-of-wall";
  from: { x: number; y: number };
  to: { x: number; y: number };
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
  /** Problems repair declined to touch (ambiguous, scripted, or `against wall`). */
  unresolved: RepairNote[];
  /** True when at least one change was applied. */
  changed: boolean;
}

/** Literal numeric value of an expression (a bare number or a negated number), else null. */
function litNum(e: Expr | undefined): number | null {
  if (!e) return null;
  if (e.t === "num") return e.value;
  if (e.t === "unary" && e.op === "-" && e.e.t === "num") return -e.e.value;
  if (e.t === "unary" && e.op === "+" && e.e.t === "num") return e.e.value;
  return null;
}

const numExpr = (value: number): Expr => ({ t: "num", value });

/** The push (dx,dy) that clears furniture rect `fr` from the wall it most penetrates,
 *  or "ambiguous" when the piece straddles a wall centreline with no majority side,
 *  or null when it penetrates nothing. Snapped out to the grid. */
function computePush(
  fr: { x: number; y: number; w: number; h: number },
  walls: RWall[],
  grid: number,
): { dx: number; dy: number; wallId: string } | "ambiguous" | null {
  let best: { depth: number; dx: number; dy: number; wallId: string } | null = null;
  let ambiguous = false;
  const cx = fr.x + fr.w / 2;
  const cy = fr.y + fr.h / 2;
  const snapOut = (v: number, dir: number): number =>
    grid > 0 ? (dir > 0 ? Math.ceil(v / grid) : Math.floor(v / grid)) * grid : v;

  for (const w of walls) {
    for (const s of segmentsOfWall(w)) {
      const horiz = s.a.y === s.b.y;
      const vert = s.a.x === s.b.x;
      if (horiz === vert) continue; // diagonal/degenerate
      const h2 = s.thickness / 2;
      if (horiz) {
        const band = overlap1d(fr.y, fr.y + fr.h, s.a.y - h2, s.a.y + h2);
        const lo = Math.max(fr.x, Math.min(s.a.x, s.b.x));
        const hi = Math.min(fr.x + fr.w, Math.max(s.a.x, s.b.x));
        if (band <= SLACK_MM || hi - lo <= 1) continue;
        if (cy === s.a.y) { ambiguous = true; continue; }
        const newY = cy > s.a.y ? snapOut(s.a.y + h2, +1) : snapOut(s.a.y - h2 - fr.h, -1);
        const cand = { depth: band, dx: 0, dy: newY - fr.y, wallId: w.id };
        if (!best || cand.depth > best.depth) best = cand;
      } else {
        const band = overlap1d(fr.x, fr.x + fr.w, s.a.x - h2, s.a.x + h2);
        const lo = Math.max(fr.y, Math.min(s.a.y, s.b.y));
        const hi = Math.min(fr.y + fr.h, Math.max(s.a.y, s.b.y));
        if (band <= SLACK_MM || hi - lo <= 1) continue;
        if (cx === s.a.x) { ambiguous = true; continue; }
        const newX = cx > s.a.x ? snapOut(s.a.x + h2, +1) : snapOut(s.a.x - h2 - fr.w, -1);
        const cand = { depth: band, dx: newX - fr.x, dy: 0, wallId: w.id };
        if (!best || cand.depth > best.depth) best = cand;
      }
    }
  }
  if (best) return { dx: best.dx, dy: best.dy, wallId: best.wallId };
  return ambiguous ? "ambiguous" : null;
}

/**
 * Correct a plan and return new source + a change log. Furniture drawn through a wall
 * is pushed flush against the face; everything else is left as authored (with a note
 * for anything that looks broken but can't be fixed unambiguously).
 */
export function repair(source: string): RepairResult {
  const { plan, diagnostics } = parse(source);
  if (!plan || diagnostics.some((d) => d.severity === "error")) {
    return { source, changes: [], unresolved: [], changed: false };
  }
  const { ir } = resolvePlan(source);
  const walls = ir?.walls ?? [];

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
    if (ax === null || ay === null || sw === null || sh === null) {
      // Can't reason about scripted/expression coordinates without evaluating them.
      continue;
    }
    const fr = { x: ax, y: ay, w: sw, h: sh };
    const push = computePush(fr, walls, plan.grid);
    if (push === null) continue;
    if (push === "ambiguous") {
      unresolved.push({ id: idOf, reason: "furniture is centred on a wall — move it onto one side, then re-run" });
      continue;
    }
    const to = { x: ax + push.dx, y: ay + push.dy };
    f.at = { x: numExpr(to.x), y: numExpr(to.y) };
    changes.push({
      id: idOf,
      category: f.category,
      kind: "moved-out-of-wall",
      from: { x: ax, y: ay },
      to,
      reason: `pushed clear of wall "${push.wallId}"`,
    });
  }

  const out = changes.length ? formatPlan(plan, source) : source;
  return { source: out, changes, unresolved, changed: changes.length > 0 };
}
