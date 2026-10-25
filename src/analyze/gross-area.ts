/**
 * **Gross internal area** (GIA) — the floor enclosed by the exterior walls' inner faces
 * (`describe().totals.gross_internal_area_m2`, plan-soundness PS4.4).
 *
 * A room is drawn on wall CENTRELINES, so `totals.floor_area_m2` runs to the middle of the
 * exterior wall, half a wall thickness past the floor a client walks on. A brief's "about
 * 70 m²" means that finished floor, so the brief binds to this figure instead of the
 * centreline sum. The figure counts the partitions inside the shell (they stand on floor the
 * shell encloses) and excludes the shell itself; it reads no room at all, so it is the same
 * whatever the rooms are or whether they tile.
 *
 * ## The rule
 *
 * The storey's walls of category `exterior` (authored, or the ring `walls from rooms` derives)
 * are joined exactly as the drawing joins them, before any opening is cut (`joinWallSet`, the
 * one wall joinery), so a door in the shell leaves it closed. The joined outline's loops never
 * cross, so they nest: an outer loop is a face of wall material seen from outside, a hole is a
 * region the walls enclose. Each building is an outermost loop:
 *
 *   - with no hole, it encloses nothing (a garden wall, an open run) and adds nothing;
 *   - with exactly one hole, its GIA is that hole's area, less every loop standing inside the
 *     hole: a courtyard ring (its outer face bounds the floor; the courtyard is not floor) or
 *     a free-standing run of exterior wall (its body stands on no floor);
 *   - with two or more holes, an exterior wall divides the enclosure, and which side is the
 *     building is a reading the plan does not state: refused (`exterior-ring-subdivided`);
 *   - anything enclosed inside a courtyard ring (a pavilion in the court) is refused
 *     (`nested-exterior-rings`).
 *
 * A storey with no building at all is `no-closed-exterior-ring` (walls-first plans whose shell
 * is an unjoined run, room-only sketches, open sites). The figure is never guessed (ADR 0005).
 *
 * ## Exact, bounded
 *
 * Every area is a loop's closed-form signed area (`loopArea`: a shoelace plus each arc's
 * circular segment), never a tessellation and never a bounding box. The work is counted and
 * capped BEFORE it runs, with the same counts the walled-face rules charge
 * (`src/analyze/wall-faces.ts`): the segments and segment contacts before the joinery, then the
 * containment tests (loops × outline edges). Past a cap the figure is refused
 * (`too-much-work`), never approximated; a sum that comes out negative or not finite (a sign that a
 * configuration defeated the joinery) is `inconsistent`.
 *
 * Pure, synchronous, deterministic: the joinery's own order, then loops by size.
 */

import { edgeMid, loopArea, loopBBox, loopWinding } from "../geometry/band.js";
import type { RWall } from "../ir.js";
import { joinWallSet } from "../wall-lowering.js";
import { MAX_FACE_WALL_SEGMENTS, MAX_WALL_CONTACTS, wallContacts } from "./wall-faces.js";

/** Why a storey has no gross internal area (see the module header). */
export type GrossAreaReason =
  | "no-closed-exterior-ring"
  | "exterior-ring-subdivided"
  | "nested-exterior-rings"
  | "too-much-work"
  | "inconsistent";

/** Every {@link GrossAreaReason}, in a fixed order (for docs and tests). */
export const GROSS_AREA_REASONS: readonly GrossAreaReason[] = [
  "no-closed-exterior-ring",
  "exterior-ring-subdivided",
  "nested-exterior-rings",
  "too-much-work",
  "inconsistent",
];

/** A storey's gross internal area in mm² and how many buildings it sums, or why there is none. */
export type GrossArea = { ok: true; mm2: number; buildings: number } | { ok: false; reason: GrossAreaReason };

/**
 * The most containment tests (outline loops × outline edges) one storey's figure may cost. The
 * exterior walls of a shipped storey join into a handful of loops; this is far above any.
 */
export const MAX_GROSS_AREA_TESTS = 4_000_000;

const segmentCount = (walls: readonly RWall[]): number =>
  walls.reduce((n, w) => n + (w.closed && w.points.length > 2 ? w.points.length : Math.max(0, w.points.length - 1)), 0);

/** The gross internal area of one storey's walls (see the module header). */
export function grossInternalArea(walls: readonly RWall[]): GrossArea {
  const shell = walls.filter((w) => w.category === "exterior" && w.thickness > 0);
  if (shell.length === 0) return { ok: false, reason: "no-closed-exterior-ring" };
  // Charged before the joinery, with the walled-face rules' own counts.
  if (segmentCount(shell) > MAX_FACE_WALL_SEGMENTS) return { ok: false, reason: "too-much-work" };
  if (wallContacts(shell, MAX_WALL_CONTACTS) > MAX_WALL_CONTACTS) return { ok: false, reason: "too-much-work" };
  // The band before any opening is cut: a door in the shell leaves the enclosure closed.
  const joined = joinWallSet(
    shell.map((w) => ({ ...w, openings: [] })),
    [],
  );
  if (!joined) return { ok: false, reason: "no-closed-exterior-ring" };
  const outline = joined.result.outline.filter((l) => l.length > 0);
  const edges = outline.reduce((n, l) => n + l.length, 0);
  // Charged before the containment pass: each loop is tested against every larger loop.
  if (outline.length * edges > MAX_GROSS_AREA_TESTS) return { ok: false, reason: "too-much-work" };

  const signed = outline.map(loopArea);
  const boxes = outline.map(loopBBox);
  // Smallest first, so the first larger loop that winds round a point is its parent.
  const rank = outline.map((_, i) => i).sort((a, b) => Math.abs(signed[a]!) - Math.abs(signed[b]!) || a - b);
  const rankOf = new Array<number>(outline.length);
  rank.forEach((i, r) => {
    rankOf[i] = r;
  });
  // A loop's parent: the smallest other loop around the middle of its first edge. The loops
  // never cross, so every point of a loop has the same parent.
  const parent = outline.map((l, i) => {
    const p = edgeMid(l[0]!);
    for (let r = rankOf[i]! + 1; r < rank.length; r++) {
      const j = rank[r]!;
      const b = boxes[j]!;
      if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
      if (loopWinding(outline[j]!, p) !== 0) return j;
    }
    return -1;
  });
  const children = outline.map(() => [] as number[]);
  parent.forEach((pj, i) => {
    if (pj >= 0) children[pj]!.push(i);
  });

  let mm2 = 0;
  let buildings = 0;
  for (let i = 0; i < outline.length; i++) {
    if (parent[i] !== -1 || !(signed[i]! > 0)) continue;
    const holes = children[i]!.filter((c) => signed[c]! < 0);
    if (holes.length === 0) continue;
    if (holes.length > 1) return { ok: false, reason: "exterior-ring-subdivided" };
    const hole = holes[0]!;
    let area = Math.abs(signed[hole]!);
    for (const c of children[hole]!) {
      // A courtyard ring's own holes (the court) must hold nothing: a pavilion in the court
      // is a second building whose floor this rule does not read.
      for (const court of children[c]!)
        if (children[court]!.length > 0) return { ok: false, reason: "nested-exterior-rings" };
      area -= Math.abs(signed[c]!);
    }
    mm2 += area;
    buildings++;
  }
  if (buildings === 0) return { ok: false, reason: "no-closed-exterior-ring" };
  // A sign that a configuration defeated the joinery; never printed as a figure.
  if (!Number.isFinite(mm2) || mm2 < 0) return { ok: false, reason: "inconsistent" };
  return { ok: true, mm2, buildings };
}
