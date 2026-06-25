/**
 * Deterministic .arch plan generator for benchmarking.
 *
 * No Math.random / Date — every coordinate is index-derived so the same spec
 * always yields byte-identical source (and therefore byte-identical SVG). The
 * layout is laid out as disjoint bands so it stays a *valid* plan (no errors):
 *   - walls:     vertical segments at x = i*STEP, y in [0, 4000]
 *   - openings:  doors/windows placed exactly on wall i  (they host, no warning)
 *   - rooms:     a spaced row in the y=5000 band (disjoint, no overlap warning)
 *   - furniture: a spaced row in the y=7000 band
 *
 * Counts are configurable so callers can build a *balanced* ~1000-element plan
 * or skew it to isolate a single hotspot (room-overlap O(R^2) vs. the per-
 * opening host-segment scan O(openings * walls)).
 */

const STEP = 1000;

export interface GenSpec {
  walls: number;
  rooms: number;
  doors: number;
  windows: number;
  furniture: number;
}

export function genPlan(spec: GenSpec): string {
  const lines: string[] = ['plan "Benchmark" {', "  units mm", "  grid 50", "  north up", ""];

  for (let i = 0; i < spec.walls; i++) {
    const x = i * STEP;
    lines.push(`  wall ext thickness 200 { (${x},0) (${x},4000) }`);
  }
  for (let i = 0; i < spec.doors; i++) {
    const x = i * STEP; // sits on wall i's segment
    lines.push(`  door id=dr${i} at (${x},2000) width 600`);
  }
  for (let i = 0; i < spec.windows; i++) {
    const x = i * STEP;
    lines.push(`  window id=wn${i} at (${x},1000) width 500`);
  }
  for (let i = 0; i < spec.rooms; i++) {
    const x = i * STEP;
    lines.push(`  room id=rm${i} at (${x},5000) size 800x800 label "R${i}"`);
  }
  for (let i = 0; i < spec.furniture; i++) {
    const x = i * STEP;
    lines.push(`  furniture chair id=ch${i} at (${x},7000) size 500x500 label "F${i}"`);
  }

  lines.push("}", "");
  return lines.join("\n");
}

export function count(spec: GenSpec): number {
  return spec.walls + spec.rooms + spec.doors + spec.windows + spec.furniture;
}

/** A balanced ~1000-element plan. */
export const BALANCED: GenSpec = { walls: 200, rooms: 300, doors: 200, windows: 200, furniture: 100 };

/** Skewed to stress the O(R^2) room-overlap check (many rooms, few of everything else). */
export const ROOM_HEAVY: GenSpec = { walls: 4, rooms: 1000, doors: 0, windows: 0, furniture: 0 };

/** Skewed to stress the per-opening host-segment scan (many walls x many openings). */
export const OPENING_HEAVY: GenSpec = { walls: 400, rooms: 4, doors: 300, windows: 300, furniture: 0 };
