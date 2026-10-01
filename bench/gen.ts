/**
 * Deterministic .arch plan generator for benchmarking.
 *
 * No Math.random / Date — every coordinate is index-derived so the same spec
 * always yields byte-identical source (and therefore byte-identical SVG).
 *
 * Layout: four bands stacked top to bottom, each a ⌈√n⌉-column grid filled
 * row-major, so the drawing is roughly square (the whole plan is on the order of
 * 100 m across, not a ~1 km line). That matters: the renderer sizes every label
 * from the drawing's reference dimension (`max(width, height)`), so a long thin
 * line inflates the room font to tens of metres and relocates EVERY label — the
 * toScene numbers then measure label placement, not the pass under test.
 *   - walls:     vertical 4000 mm segments, 6000 mm pitch both ways
 *   - openings:  doors/windows placed exactly on wall i  (they host, no warning)
 *   - rooms:     3000x3000 mm at a 3200 mm pitch (disjoint, no overlap warning)
 *   - furniture: 500x500 mm chairs at a 1000 mm pitch
 * Element COUNTS are exactly the spec's; only positions are laid out.
 *
 * Sheet: every plan declares `paper A0 landscape` with no `scale`, so the sheet auto-fits
 * the finest scale that holds the drawing and label sizes come from the PAPER (a fixed
 * number of sheet millimetres), not from a fraction of the drawing. Without it the room font
 * is 3% of the ~100 m drawing and 300 to 1000 rooms cannot hold their labels, so the
 * relocator dominates toScene. A0 is the largest paper; the auto-fit choice is
 * deterministic. The plan adds no element, only the sheet chrome.
 *
 * Counts are configurable so callers can build a *balanced* ~1000-element plan
 * or skew it to isolate a single hotspot (room-overlap O(R^2) vs. the per-
 * opening host-segment scan O(openings * walls)).
 */

const WALL_PITCH = 6000;
const WALL_LEN = 4000;
const ROOM_SIZE = 3000;
const ROOM_PITCH = 3200;
const FURN_SIZE = 500;
const FURN_PITCH = 1000;
const BAND_GAP = 2000;

export interface GenSpec {
  walls: number;
  rooms: number;
  doors: number;
  windows: number;
  furniture: number;
}

/** Row-major cell `i` of a ⌈√n⌉-column grid with the given pitch, offset down by `y0`. */
function cell(i: number, n: number, pitch: number, y0: number): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { x: (i % cols) * pitch, y: y0 + Math.floor(i / cols) * pitch };
}

/** Height of a ⌈√n⌉-column grid of rows at `pitch` (0 rows when n is 0). */
function bandHeight(n: number, pitch: number): number {
  return n === 0 ? 0 : Math.ceil(n / Math.max(1, Math.ceil(Math.sqrt(n)))) * pitch;
}

export function genPlan(spec: GenSpec): string {
  const lines: string[] = ['plan "Benchmark" {', "  units mm", "  grid 50", "  paper A0 landscape", "  north up", ""];

  const roomsY = bandHeight(spec.walls, WALL_PITCH) + BAND_GAP;
  const furnY = roomsY + bandHeight(spec.rooms, ROOM_PITCH) + BAND_GAP;

  for (let i = 0; i < spec.walls; i++) {
    const { x, y } = cell(i, spec.walls, WALL_PITCH, 0);
    lines.push(`  wall ext thickness 200 { (${x},${y}) (${x},${y + WALL_LEN}) }`);
  }
  for (let i = 0; i < spec.doors; i++) {
    const { x, y } = cell(i, spec.walls, WALL_PITCH, 0); // sits on wall i's segment
    lines.push(`  door id=dr${i} at (${x},${y + 2000}) width 600`);
  }
  for (let i = 0; i < spec.windows; i++) {
    const { x, y } = cell(i, spec.walls, WALL_PITCH, 0);
    lines.push(`  window id=wn${i} at (${x},${y + 1000}) width 500`);
  }
  for (let i = 0; i < spec.rooms; i++) {
    const { x, y } = cell(i, spec.rooms, ROOM_PITCH, roomsY);
    lines.push(`  room id=rm${i} at (${x},${y}) size ${ROOM_SIZE}x${ROOM_SIZE} label "R${i}"`);
  }
  for (let i = 0; i < spec.furniture; i++) {
    const { x, y } = cell(i, spec.furniture, FURN_PITCH, furnY);
    // furniture has no `id=` slot (ids are auto-assigned); category + at/size/label only.
    lines.push(`  furniture chair at (${x},${y}) size ${FURN_SIZE}x${FURN_SIZE} label "F${i}"`);
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
