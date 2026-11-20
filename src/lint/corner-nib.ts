/**
 * Whether a wall turns at the end of a run, and the tightest corner nib a door leaves there: the test
 * `W_DOOR_NEAR_CORNER` reports by, shared with `W_OPENING_AT_JUNCTION` and its move search so they
 * defer to that rule by the same test, never a restatement of it. A leaf of `src/lint/`, so that the
 * opening rules and the door rules can share it without importing each other (card AF9 moved it here
 * from `src/lint/rules/doors.ts`, unchanged).
 */

import type { Point } from "../ast.js";
import type { WallSegment } from "../geometry.js";
import { arcOpeningVoid } from "../geometry/arc-band.js";
import { type Arc, arcLength, arcTangentAt } from "../geometry/arc.js";
import type { RDoor } from "../ir.js";

/**
 * The tightest CORNER end of a door's host run whose nib is under `need` (the one
 * `W_DOOR_NEAR_CORNER` reports), or null when that rule is silent for the door. Exported so
 * `W_OPENING_AT_JUNCTION` defers to this rule by the same test, never a restatement of it.
 */
export function tightestCorner(
  d: Pick<RDoor, "at" | "width">,
  seg: WallSegment,
  wallSegs: readonly WallSegment[],
  need: number,
): { have: number; corner: Point } | null {
  const runs = jambRuns(d, seg);
  if (!runs || !(need > 0)) return null;
  let worst: { have: number; corner: Point } | null = null;
  for (const end of ["a", "b"] as const) {
    const have = Math.max(0, end === "a" ? runs.toA : runs.toB);
    if (have >= need) continue;
    if (!isCorner(seg, end, wallSegs)) continue;
    if (!worst || have < worst.have) worst = { have, corner: seg[end] };
  }
  return worst;
}

/**
 * Below this turn two runs are one straight wall. 5 degrees — at a wall's half-thickness
 * the mitre then moves the outer face by `h*tan(theta/2)`, i.e. 5.5 mm on a 250 mm wall,
 * which is nothing at page scale — and it comfortably absorbs the float residue in an
 * arc's tangent, so a curve that hands over to a straight run smoothly reads as smooth.
 */
const COLLINEAR_TURN_RAD = (5 * Math.PI) / 180;

/**
 * Along-run distance (mm) from each of a door's jambs to the two ends of its host
 * segment — arc length on a curve, projection on a straight run. `null` when the door is
 * not on this segment at all (a degenerate run, or an `at (x,y)` door off its own wall,
 * which `W_DOOR_OFF_WALL` owns).
 *
 * A negative result means the opening runs PAST that end; the caller floors it at zero,
 * so the warning reports the nib that exists rather than a negative length.
 */
export function jambRuns(d: Pick<RDoor, "at" | "width">, seg: WallSegment): { toA: number; toB: number } | null {
  if (seg.arc) {
    // `arcOpeningVoid` is the single existing answer for where an opening lands along a
    // curve — the same one the curved band measurement uses — so the jamb positions here
    // cannot disagree with the ones the drawing cuts.
    const span = arcOpeningVoid(seg.arc, d.at, d.width, seg.thickness);
    if (!span) return null;
    return { toA: span[0], toB: arcLength(seg.arc) - span[1] };
  }
  const vx = seg.b.x - seg.a.x;
  const vy = seg.b.y - seg.a.y;
  const len = Math.hypot(vx, vy);
  if (!(len > 0)) return null;
  const u = ((d.at.x - seg.a.x) * vx + (d.at.y - seg.a.y) * vy) / len;
  return { toA: u - d.width / 2, toB: len - u - d.width / 2 };
}

/** Unit tangent at one end of a segment, pointing INTO it. Arc-aware. */
function tangentInto(seg: { a: Point; b: Point; arc?: Arc }, end: "a" | "b"): Point | null {
  if (seg.arc) {
    const t = arcTangentAt(seg.arc, seg.arc[end]);
    return end === "a" ? t : { x: -t.x, y: -t.y };
  }
  const vx = seg.b.x - seg.a.x;
  const vy = seg.b.y - seg.a.y;
  const l = Math.hypot(vx, vy);
  if (!(l > 0)) return null;
  const s = end === "a" ? 1 : -1;
  return { x: (s * vx) / l, y: (s * vy) / l };
}

/** Unsigned angle (rad) between two unit vectors, via `atan2` so it stays exact near 0. */
const angleBetween = (u: Point, v: Point): number => Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y));

/**
 * Does the wall TURN at this end of `seg` — i.e. does its run stop here and set off in
 * another direction?
 *
 * True only when at least one other segment leaves the point and NONE leaves it straight
 * on. A run that carries straight through (a collinear vertex, a tangent arc/straight
 * hand-over, or a partition teeing into a wall that continues) is not a corner however
 * many other segments meet there — nothing is mitred, so nothing reads as a chamfer. A
 * free end with no neighbour at all is not a corner either.
 *
 * Two ends count as meeting when they are within half a wall thickness of each other:
 * that is close enough that the two solids overlap and the joinery draws one corner, so
 * the test matches what a reader sees rather than demanding byte-equal coordinates.
 */
export function isCorner(seg: WallSegment, end: "a" | "b", all: readonly WallSegment[]): boolean {
  const into = tangentInto(seg, end);
  if (!into) return false;
  const p = seg[end];
  // The direction a run continuing straight on would leave `p` in.
  const straight = { x: -into.x, y: -into.y };
  const tol = Math.max(1, seg.thickness / 2);
  let turns = false;
  for (const s of all) {
    if (s.wallId === seg.wallId && s.index === seg.index) continue;
    for (const oe of ["a", "b"] as const) {
      if (Math.hypot(s[oe].x - p.x, s[oe].y - p.y) > tol) continue;
      const away = tangentInto(s, oe);
      if (!away) continue;
      if (angleBetween(away, straight) <= COLLINEAR_TURN_RAD) return false; // the wall carries on
      turns = true;
    }
  }
  return turns;
}
