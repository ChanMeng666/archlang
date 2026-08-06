/**
 * The measured half of an advisory placement warning: **required, available,
 * shortfall**.
 *
 * Four rules (`W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`, `W_FURN_CLEARANCE`,
 * `W_PATH_TOO_NARROW`) already had the geometry in hand and printed none of it — a
 * reader was told a swing was "obstructed" without the radius it needed, the distance
 * it actually had, or by how much it fell short, which is the difference between a
 * warning you can act on and one you can only re-read. These helpers are the one place
 * those numbers are derived, so all four messages carry the same shape and quote the
 * same arithmetic the predicate that raised them used.
 *
 * Pure and deterministic; every number reaches prose through {@link mm}.
 */

import type { Point } from "../ast.js";
import type { BBox } from "../geometry/rect.js";
import { fmt2 } from "../num-format.js";

/**
 * A measured millimetre distance as prose. Rounded to whole millimetres (these are
 * advisory clearances, not drawing coordinates) and then through `fmt()` so a float
 * can never drift into the message text.
 */
export const mm = (n: number): string => fmt2(Math.round(n));

/** How far `required` exceeds what is `available` — never negative. */
export const shortfall = (required: number, available: number): number => Math.max(0, required - available);

/** Distance from a point to the nearest point of an axis-aligned rect (0 inside). */
export function distPointToRect(p: Point, r: BBox): number {
  const nx = Math.min(Math.max(p.x, r.x), r.x + r.w);
  const ny = Math.min(Math.max(p.y, r.y), r.y + r.h);
  return Math.hypot(p.x - nx, p.y - ny);
}

/**
 * Clear depth left on ONE side of a door opening: how far the blocker's near edge
 * stands off the opening's line, along the across-wall axis. `line` is the door
 * centre's coordinate on that axis and `[lo, hi]` the blocker's extent on it. A
 * blocker straddling the opening leaves nothing (0); nothing beyond the required
 * landing counts (capped at `depth`), so the number is always the one the rule
 * measures against.
 */
export function approachGapMm(line: number, lo: number, hi: number, depth: number): number {
  if (hi <= line) return Math.min(line - hi, depth);
  if (lo >= line) return Math.min(lo - line, depth);
  return 0;
}

/**
 * Clear depth left in a fixture's frontal use-space: the standoff between the
 * fixture's front face and the blocker's near edge.
 *
 * The outward direction is read from the zone's own position relative to the fixture
 * (`frontClearanceRect` puts it on exactly one side), rather than re-stating that
 * function's `rotate` switch here — so the two can never disagree about which way a
 * fixture faces. Capped at `depth`, floored at 0 (a blocker overlapping the fixture
 * itself leaves nothing).
 */
export function frontGapMm(fixture: BBox, zone: BBox, blocker: BBox, depth: number): number {
  const ux = Math.sign(zone.x + zone.w / 2 - (fixture.x + fixture.w / 2));
  const uy = Math.sign(zone.y + zone.h / 2 - (fixture.y + fixture.h / 2));
  let gap: number;
  if (uy > 0) gap = blocker.y - zone.y;
  else if (uy < 0) gap = zone.y + zone.h - (blocker.y + blocker.h);
  else if (ux > 0) gap = blocker.x - zone.x;
  else gap = zone.x + zone.w - (blocker.x + blocker.w);
  return Math.min(Math.max(gap, 0), depth);
}
