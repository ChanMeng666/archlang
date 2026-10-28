/**
 * The storey slab's plan region (archlang-3d plan §4.2; card A2b): the rooms ∪ the wall outline,
 * before the voids are cut. The wall outline (its outer rings, holes dropped) already covers every
 * room the walls enclose; what a room adds is its part outside it (a room outside every wall had no
 * slab under it before A2b).
 *
 * Exact when the outline and the room are rectilinear (every edge along an axis, every coordinate
 * an integer): the room is cut into rectangles and the outline and every earlier addition are
 * subtracted, so the additions never overlap anything. Otherwise a room the outline covers adds
 * nothing, a room apart from it adds itself, and a room that crosses it adds itself whole, the
 * two solids overlapping, and the ledger says so (no boolean is guessed).
 */
import type { Assumption, Floor, Polygon, Pt, Ring3 } from "../scene3d/types.js";
import { where } from "./extrude.js";

/** An axis-aligned plan rectangle `[x0, y0, x1, y1]` (µm), x0 < x1, y0 < y1. */
export type Rect = [number, number, number, number];

export const rectPolygon = (r: Rect): Polygon => ({
  outer: [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[2], r[3]],
    [r[0], r[3]],
  ],
});

/** `a` less `b`: at most four rectangles, exact, tiling `a` outside `b`. */
export function rectMinus(a: Rect, b: Rect): Rect[] {
  const [x0, y0, x1, y1] = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  if (!(x0 < x1 && y0 < y1)) return [a];
  const out: Rect[] = [];
  if (a[1] < y0) out.push([a[0], a[1], a[2], y0]);
  if (y1 < a[3]) out.push([a[0], y1, a[2], a[3]]);
  if (a[0] < x0) out.push([a[0], y0, x0, y1]);
  if (x1 < a[2]) out.push([x1, y0, a[2], y1]);
  return out;
}

/** Whether every edge of `r` runs along an axis. */
export const rectilinear = (r: readonly Pt[]): boolean =>
  r.every((p, i) => {
    const q = r[(i + 1) % r.length] as Pt;
    return p[0] === q[0] || p[1] === q[1];
  });

/** A rectilinear ring as rectangles, band by band between its distinct y's (even-odd). */
export function rectsOf(r: readonly Pt[]): Rect[] {
  const ys = [...new Set(r.map((p) => p[1]))].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let k = 0; k + 1 < ys.length; k++) {
    const [y0, y1] = [ys[k] as number, ys[k + 1] as number];
    const xs: number[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i] as Pt;
      const b = r[(i + 1) % r.length] as Pt;
      if (a[0] === b[0] && Math.min(a[1], b[1]) <= y0 && Math.max(a[1], b[1]) >= y1) xs.push(a[0]);
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      if ((xs[i] as number) < (xs[i + 1] as number)) out.push([xs[i] as number, y0, xs[i + 1] as number, y1]);
  }
  return out;
}

/** Whether `room` lies in (or on) one of `rings`: its vertices and edge midpoints, and no ring vertex strictly inside it. */
function covered(room: readonly Pt[], rings: readonly Ring3[]): boolean {
  const probes = room.flatMap((p, i) => {
    const q = room[(i + 1) % room.length] as Pt;
    return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Pt];
  });
  return rings.some((r) => probes.every((p) => where(p, r) !== false) && !r.some((p) => where(p, room) === true));
}

/** Whether `room` and every ring are apart: no vertex of either strictly inside the other. */
function apart(room: readonly Pt[], rings: readonly Ring3[]): boolean {
  return rings.every((r) => room.every((p) => where(p, r) !== true) && r.every((p) => where(p, room) !== true));
}

/**
 * The slab's region on a storey: the wall outline's rings, then each room's part outside them
 * (declaration order), as polygons ready for the voids.
 */
export function slabRegion(footprint: readonly Ring3[], floors: readonly Floor[], ledger: Assumption[]): Polygon[] {
  const out: Polygon[] = footprint.map((r) => ({ outer: [...r] }));
  const exact = footprint.every(rectilinear);
  let taken: Rect[] = exact ? footprint.flatMap(rectsOf) : [];
  const added: Ring3[] = [];
  for (const f of floors) {
    const room = f.polygon.outer;
    if (exact && rectilinear(room)) {
      let pieces = rectsOf(room);
      for (const t of taken) pieces = pieces.flatMap((p) => rectMinus(p, t));
      taken = [...taken, ...pieces];
      for (const p of pieces) out.push(rectPolygon(p));
      continue;
    }
    const others = [...footprint, ...added];
    if (covered(room, others)) continue;
    if (!apart(room, others)) {
      ledger.push({
        kind: "slab",
        id: f.id,
        field: "union",
        value: "room overlaps the outline: added whole",
        provenance: "default",
        rule: "slab-room-unsplit",
      });
    }
    out.push({ outer: [...room] });
    added.push(room);
  }
  return out;
}
