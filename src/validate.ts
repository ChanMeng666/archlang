/** Semantic analysis: grid-snap, auto-id assignment, and sanity checks. */

import type { PlanNode, Point } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { distPointToSegment } from "./geometry.js";

/**
 * Validate a parsed plan, returning all semantic problems as diagnostics.
 *
 * NOTE: still mutates `plan` in place (grid-snap + auto-id assignment); the
 * AST→IR split that makes this pure is deferred to v0.3.
 */
export function validate(plan: PlanNode): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const error = (message: string, code: string, span?: Span) =>
    diags.push({ severity: "error", message, code, span });
  const warn = (message: string, code: string, span?: Span) =>
    diags.push({ severity: "warning", message, code, span });

  // --- Grid snapping -------------------------------------------------------
  const g = plan.grid;
  const snap = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
  const snapPt = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  for (const w of plan.walls) {
    w.points = w.points.map(snapPt);
    w.thickness = snap(w.thickness) || w.thickness;
  }
  for (const r of plan.rooms) {
    r.at = snapPt(r.at);
    r.size = { w: snap(r.size.w), h: snap(r.size.h) };
  }
  for (const f of plan.furniture) {
    f.at = snapPt(f.at);
    f.size = { w: snap(f.size.w), h: snap(f.size.h) };
  }
  for (const d of plan.doors) {
    d.at = snapPt(d.at);
    d.width = snap(d.width) || d.width;
  }
  for (const win of plan.windows) {
    win.at = snapPt(win.at);
    win.width = snap(win.width) || win.width;
  }
  for (const dm of plan.dims) {
    dm.from = snapPt(dm.from);
    dm.to = snapPt(dm.to);
  }

  // --- Auto-id assignment + duplicate detection ----------------------------
  const seen = new Set<string>();
  const assign = (provided: string, prefix: string, idx: number, span?: Span): string => {
    if (provided) {
      if (seen.has(provided)) {
        error(`Duplicate id "${provided}"`, "E_DUP_ID", span);
      }
      seen.add(provided);
      return provided;
    }
    let auto = `${prefix}_${idx}`;
    while (seen.has(auto)) auto = `${auto}_`;
    seen.add(auto);
    return auto;
  };

  plan.walls.forEach((w, i) => (w.id = assign(w.id, w.kind || "wall", i + 1, w.span)));
  plan.rooms.forEach((r, i) => (r.id = assign(r.id, "room", i + 1, r.span)));
  plan.doors.forEach((d, i) => (d.id = assign(d.id, "door", i + 1, d.span)));
  plan.windows.forEach((w, i) => (w.id = assign(w.id, "window", i + 1, w.span)));
  plan.furniture.forEach((f, i) => (f.id = assign(f.id, f.kind || "furniture", i + 1, f.span)));
  plan.dims.forEach((d, i) => (d.id = assign(d.id, "dim", i + 1, d.span)));

  // --- Dimension sanity ----------------------------------------------------
  for (const r of plan.rooms) {
    if (r.size.w <= 0 || r.size.h <= 0)
      error(`Room "${r.id}" must have a positive size`, "E_ROOM_SIZE", r.span);
  }
  for (const f of plan.furniture) {
    if (f.size.w <= 0 || f.size.h <= 0)
      error(`Furniture "${f.id}" must have a positive size`, "E_FURN_SIZE", f.span);
  }
  for (const d of plan.doors) {
    if (d.width <= 0) error(`Door "${d.id}" must have a positive width`, "E_DOOR_WIDTH", d.span);
  }
  for (const w of plan.windows) {
    if (w.width <= 0) error(`Window "${w.id}" must have a positive width`, "E_WINDOW_WIDTH", w.span);
  }
  for (const w of plan.walls) {
    if (w.thickness <= 0)
      error(`Wall "${w.id}" must have a positive thickness`, "E_WALL_THICKNESS", w.span);
  }

  if (
    plan.walls.length === 0 &&
    plan.rooms.length === 0 &&
    plan.furniture.length === 0
  ) {
    warn("Plan has no walls, rooms, or furniture — nothing to draw", "W_EMPTY_PLAN");
  }

  // --- Openings should lie on a wall --------------------------------------
  const onSomeWall = (at: Point, wallRef?: string): boolean => {
    const candidates = wallRef
      ? plan.walls.filter((w) => w.id === wallRef || w.kind === wallRef)
      : plan.walls;
    for (const w of candidates) {
      const tol = w.thickness / 2 + Math.max(w.thickness, 1);
      for (let k = 0; k < w.points.length - 1; k++) {
        if (distPointToSegment(at, w.points[k], w.points[k + 1]) <= tol) return true;
      }
      if (w.closed && w.points.length > 2) {
        if (distPointToSegment(at, w.points[w.points.length - 1], w.points[0]) <= tol) return true;
      }
    }
    return false;
  };
  for (const d of plan.doors) {
    if (plan.walls.length > 0 && !onSomeWall(d.at, d.wall))
      warn(`Door "${d.id}" does not lie on any wall`, "W_DOOR_OFF_WALL", d.span);
  }
  for (const w of plan.windows) {
    if (plan.walls.length > 0 && !onSomeWall(w.at, w.wall))
      warn(`Window "${w.id}" does not lie on any wall`, "W_WINDOW_OFF_WALL", w.span);
  }

  // --- Overlapping rooms (advisory) ---------------------------------------
  for (let a = 0; a < plan.rooms.length; a++) {
    for (let b = a + 1; b < plan.rooms.length; b++) {
      const r1 = plan.rooms[a];
      const r2 = plan.rooms[b];
      const ox = Math.max(0, Math.min(r1.at.x + r1.size.w, r2.at.x + r2.size.w) - Math.max(r1.at.x, r2.at.x));
      const oy = Math.max(0, Math.min(r1.at.y + r1.size.h, r2.at.y + r2.size.h) - Math.max(r1.at.y, r2.at.y));
      if (ox > 1 && oy > 1) {
        warn(`Rooms "${r1.id}" and "${r2.id}" overlap`, "W_ROOM_OVERLAP", r2.span);
      }
    }
  }

  return diags;
}
