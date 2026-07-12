/**
 * Deterministic fault injectors — pure structured-source transforms that seed exactly
 * one (or, for `combined`, two) defect into a strict-clean {@link PlanModel}, mirroring
 * the six classes in `eval/faults/*.arch`.
 *
 * Each injector clones the plan and perturbs ONE element's coordinates so the target
 * diagnostic code is raised:
 *   - off-wall-door / -window / -opening → nudge an opening perpendicular off its host
 *     wall past the on-wall tolerance → `W_{DOOR,WINDOW,OPENING}_OFF_WALL`;
 *   - furniture-through-wall → shove the movable piece into a wall's solid past the
 *     30 mm slack → `W_FURNITURE_WALL_COLLISION`;
 *   - blocked-doorway → park the movable piece in the entrance door's clear landing →
 *     `W_DOORWAY_BLOCKED`;
 *   - combined → an off-wall interior door PLUS a blocked entrance (the fix→repair
 *     ordering exercise).
 *
 * Injectors operate on structured parameters, not text, so they are deterministic and
 * span-consistent once emitted. The generator re-verifies that the intended code(s)
 * actually surfaced (and heal to a clean plan); a candidate that does not is rejected.
 */

import type { Family, FurnitureModel, OpeningModel, PlanModel, Pt, WallModel } from "./templates.js";

/** How far (mm, grid-multiple) to nudge an opening off its wall — past the ~300 mm
 *  on-wall tolerance, but close enough that the nearest wall stays unique (so the
 *  `offWallFix` is machine-applicable). */
const OFF_WALL_MM = 400;
/** How far to shove furniture into a wall solid — past the 30 mm collision slack. */
const THROUGH_WALL_MM = 500;

/** A structured-source defect: the perturbed plan and the code(s) it should raise. */
export interface Injected {
  plan: PlanModel;
  faultClasses: string[];
}

/** The six fault classes, matching `eval/faults/`. */
export const FAULT_CLASSES = [
  "off-wall-door",
  "off-wall-window",
  "off-wall-opening",
  "furniture-through-wall",
  "blocked-doorway",
  "combined",
] as const;
export type FaultClass = (typeof FAULT_CLASSES)[number];

/** Which template families can host each fault (opening faults need that element kind). */
export const FAULT_FAMILIES: Record<FaultClass, Family[]> = {
  "off-wall-door": ["studio", "hall-flat", "corridor"],
  "off-wall-window": ["studio", "hall-flat", "corridor"],
  "off-wall-opening": ["hall-flat"], // only hall-flat carries a cased `opening`
  "furniture-through-wall": ["studio", "hall-flat", "corridor"],
  // The entrance must open into a ROOMY space so repair can relocate the blocking piece
  // clear of the door swing; the tight corridor leaves it nowhere to go (it would pinch
  // the shared walk), so `repair` reports rather than moves it.
  "blocked-doorway": ["studio", "hall-flat"],
  combined: ["hall-flat"], // needs ≥2 doors AND a roomy entrance
};

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

const clonePlan = (p: PlanModel): PlanModel => structuredClone(p);
const snap = (v: number, grid: number): number => Math.round(v / grid) * grid;

/** The bounding-box centre of the exterior wall loop (the plan's "inside"). */
function planCenter(plan: PlanModel): Pt {
  const ext = plan.walls.find((w) => w.kind === "exterior") ?? plan.walls[0]!;
  const xs = ext.points.map((p) => p.x);
  const ys = ext.points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** The wall an opening is hosted on: the exterior loop for `"exterior"`, else by id. */
function hostWall(plan: PlanModel, o: OpeningModel): WallModel | undefined {
  if (o.wall === "exterior") return plan.walls.find((w) => w.kind === "exterior");
  return plan.walls.find((w) => w.id === o.wall);
}

/** Segments of a wall polyline (closed loops include the closing edge). */
function segments(w: WallModel): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < w.points.length; i++) segs.push([w.points[i]!, w.points[i + 1]!]);
  if (w.close && w.points.length > 2) segs.push([w.points[w.points.length - 1]!, w.points[0]!]);
  return segs;
}

/**
 * Nudge an opening perpendicular off its host wall by {@link OFF_WALL_MM}, AWAY from the
 * plan centre (off the building for an exterior opening, into a room for a partition).
 * The nearest wall stays the original host, so `offWallFix` re-attaches it uniquely.
 */
function pushOffWall(plan: PlanModel, o: OpeningModel): boolean {
  const wall = hostWall(plan, o);
  if (!wall) return false;
  // Find the segment the opening sits on (closest by perpendicular distance).
  let best: { seg: [Pt, Pt]; d: number } | null = null;
  for (const seg of segments(wall)) {
    const [a, b] = seg;
    const horiz = a.y === b.y;
    const d = horiz ? Math.abs(o.at.y - a.y) : Math.abs(o.at.x - a.x);
    const within = horiz
      ? o.at.x >= Math.min(a.x, b.x) && o.at.x <= Math.max(a.x, b.x)
      : o.at.y >= Math.min(a.y, b.y) && o.at.y <= Math.max(a.y, b.y);
    if (within && (!best || d < best.d)) best = { seg, d };
  }
  if (!best) return false;
  const [a, b] = best.seg;
  const center = planCenter(plan);
  if (a.y === b.y) {
    const sign = o.at.y >= center.y ? 1 : -1;
    o.at = { x: o.at.x, y: snap(a.y + sign * OFF_WALL_MM, plan.grid) };
  } else {
    const sign = o.at.x >= center.x ? 1 : -1;
    o.at = { x: snap(a.x + sign * OFF_WALL_MM, plan.grid), y: o.at.y };
  }
  return true;
}

/** The single movable furniture piece a repair-fault targets. */
function movablePiece(plan: PlanModel): FurnitureModel | undefined {
  return plan.furniture.find((f) => f.movable);
}

/** The main entrance door (on the exterior wall). */
function entranceDoor(plan: PlanModel): OpeningModel | undefined {
  return plan.openings.find((o) => o.kind === "door" && o.id === "d_main");
}

// ---------------------------------------------------------------------------
// The injectors.
// ---------------------------------------------------------------------------

function firstOpening(plan: PlanModel, kind: OpeningModel["kind"], excludeMain = false): OpeningModel | undefined {
  return plan.openings.find((o) => o.kind === kind && (!excludeMain || o.id !== "d_main"));
}

/** off-wall-{door,window,opening}: nudge one opening of the given kind off its wall. */
function injectOffWall(kind: OpeningModel["kind"], code: string): (plan: PlanModel) => Injected | null {
  return (base) => {
    const plan = clonePlan(base);
    // For a door, prefer the entrance (studio has only that); windows/openings pick the first.
    const target = kind === "door" ? (entranceDoor(plan) ?? firstOpening(plan, "door")) : firstOpening(plan, kind);
    if (!target || !pushOffWall(plan, target)) return null;
    return { plan, faultClasses: [code] };
  };
}

/** furniture-through-wall: shove the movable piece up through the north exterior wall. */
function injectThroughWall(base: PlanModel): Injected | null {
  const plan = clonePlan(base);
  const piece = movablePiece(plan);
  if (!piece) return null;
  // Every family places the movable piece in a room whose top edge is the exterior north
  // wall (y=0). Move its top edge above the wall centreline so it crosses the solid band.
  piece.at = { x: piece.at.x, y: snap(-THROUGH_WALL_MM, plan.grid) };
  return { plan, faultClasses: ["W_FURNITURE_WALL_COLLISION"] };
}

/** blocked-doorway: park the movable piece in the entrance door's clear landing. */
function injectBlockedDoorway(base: PlanModel): Injected | null {
  const plan = clonePlan(base);
  const piece = movablePiece(plan);
  const door = entranceDoor(plan);
  if (!piece || !door) return null;
  // The entrance sits on the south wall at (dx, doorY); its clear landing is the strip
  // immediately inside. Centre the piece on the door, a little inside the wall face.
  const doorY = door.at.y; // == exterior south y
  piece.at = {
    x: snap(door.at.x - piece.size.w / 2, plan.grid),
    y: snap(doorY - piece.size.h - 200, plan.grid),
  };
  return { plan, faultClasses: ["W_DOORWAY_BLOCKED"] };
}

/** combined: an off-wall interior door PLUS a blocked entrance (fix → repair ordering). */
function injectCombined(base: PlanModel): Injected | null {
  // Block the entrance first (operates on the movable piece)…
  const blocked = injectBlockedDoorway(base);
  if (!blocked) return null;
  // …then nudge a NON-entrance door off its (partition) wall.
  const plan = blocked.plan;
  const sideDoor = firstOpening(plan, "door", true);
  if (!sideDoor || !pushOffWall(plan, sideDoor)) return null;
  return { plan, faultClasses: ["W_DOOR_OFF_WALL", "W_DOORWAY_BLOCKED"] };
}

const INJECTORS: Record<FaultClass, (plan: PlanModel) => Injected | null> = {
  "off-wall-door": injectOffWall("door", "W_DOOR_OFF_WALL"),
  "off-wall-window": injectOffWall("window", "W_WINDOW_OFF_WALL"),
  "off-wall-opening": injectOffWall("opening", "W_OPENING_OFF_WALL"),
  "furniture-through-wall": injectThroughWall,
  "blocked-doorway": injectBlockedDoorway,
  combined: injectCombined,
};

/** Inject `fault` into `plan`, returning the perturbed plan and its target code(s), or
 *  `null` when the plan cannot host the fault (the generator then skips the candidate). */
export function injectFault(fault: FaultClass, plan: PlanModel): Injected | null {
  return INJECTORS[fault](plan);
}
