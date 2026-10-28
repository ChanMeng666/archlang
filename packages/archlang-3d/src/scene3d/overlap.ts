/**
 * V-GEO-05 (archlang-3d plan §4.2, §8.1; card A2b): rooms whose floors overlap by more than 1 cm²
 * would draw two coplanar floor finishes that fight in depth. Each such pair is reported
 * (`W3D_FLOOR_OVERLAP`; the core warns `W_ROOM_OVERLAP` on the same plans) and the later room in
 * declaration order is lifted 0.5 mm, deterministically: a room is lifted one step above the
 * highest earlier room it overlaps, so a stack of three overlapping rooms takes 0, 0.5 and 1 mm.
 *
 * The overlap area is exact up to float rounding: each floor is triangulated (earcut, which adds no
 * vertex) and every pair of triangles is intersected as two convex polygons.
 */
import earcut from "earcut";
import type { Floor, Polygon, Pt } from "./types.js";

/** More than this much overlap (µm², i.e. 1 cm²) is reported and lifted (plan §4.2). */
export const FLOOR_OVERLAP_MIN_UM2 = 1e8;
/** The lift per step (µm): 0.5 mm. */
export const FLOOR_LIFT_UM = 500;

export interface FloorOverlap {
  code: "W3D_FLOOR_OVERLAP";
  /** The earlier room, then the later (lifted) one, in declaration order. */
  rooms: [string, string];
  /** Overlap area, mm², rounded. */
  areaMm2: number;
  message: string;
}

type Tri = [Pt, Pt, Pt];

function triangles(p: Polygon): Tri[] {
  const rings = [p.outer, ...(p.holes ?? [])];
  const flat: number[] = [];
  const holes: number[] = [];
  rings.forEach((r, i) => {
    if (i > 0) holes.push(flat.length / 2);
    for (const q of r) flat.push(q[0], q[1]);
  });
  const ix = earcut(flat, holes, 2);
  const pt = (i: number): Pt => [flat[2 * i] as number, flat[2 * i + 1] as number];
  const out: Tri[] = [];
  for (let t = 0; t < ix.length; t += 3)
    out.push([pt(ix[t] as number), pt(ix[t + 1] as number), pt(ix[t + 2] as number)]);
  return out;
}

const cross = (o: readonly number[], a: readonly number[], b: readonly number[]): number =>
  ((a[0] as number) - (o[0] as number)) * ((b[1] as number) - (o[1] as number)) -
  ((a[1] as number) - (o[1] as number)) * ((b[0] as number) - (o[0] as number));

const areaOf = (r: ReadonlyArray<readonly number[]>): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += cross([0, 0], r[i] as number[], r[(i + 1) % r.length] as number[]);
  return Math.abs(s) / 2;
};

/** Area of two triangles' intersection (Sutherland–Hodgman, both convex). */
function triOverlap(a: Tri, b: Tri): number {
  const clip: Pt[] = cross(b[0], b[1], b[2]) > 0 ? b : [b[0], b[2], b[1]];
  let poly: number[][] = a.map((p) => [p[0], p[1]]);
  for (let k = 0; k < 3 && poly.length > 0; k++) {
    const e0 = clip[k] as Pt;
    const e1 = clip[(k + 1) % 3] as Pt;
    const input = poly;
    poly = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i] as number[];
      const q = input[(i + 1) % input.length] as number[];
      const sp = cross(e0, e1, p);
      const sq = cross(e0, e1, q);
      if (sp >= 0) poly.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        poly.push([
          (p[0] as number) + ((q[0] as number) - (p[0] as number)) * t,
          (p[1] as number) + ((q[1] as number) - (p[1] as number)) * t,
        ]);
      }
    }
  }
  return poly.length >= 3 ? areaOf(poly) : 0;
}

type BBox = [number, number, number, number];
const bboxOf = (ps: readonly Pt[]): BBox => [
  Math.min(...ps.map((p) => p[0])),
  Math.min(...ps.map((p) => p[1])),
  Math.max(...ps.map((p) => p[0])),
  Math.max(...ps.map((p) => p[1])),
];
const apart = (a: BBox, b: BBox): boolean => a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1];

/** Overlap area of two polygons (µm²). */
export function overlapArea(p: Polygon, q: Polygon): number {
  if (apart(bboxOf(p.outer), bboxOf(q.outer))) return 0;
  const tq = triangles(q).map((t) => [t, bboxOf(t)] as const);
  let s = 0;
  for (const t of triangles(p)) {
    const bt = bboxOf(t);
    for (const [u, bu] of tq) if (!apart(bt, bu)) s += triOverlap(t, u);
  }
  return s;
}

/** Every pair of a storey's floors overlapping by more than 1 cm², in declaration order. */
export function floorOverlaps(floors: readonly Floor[]): FloorOverlap[] {
  const out: FloorOverlap[] = [];
  for (let j = 1; j < floors.length; j++) {
    for (let i = 0; i < j; i++) {
      const [a, b] = [floors[i] as Floor, floors[j] as Floor];
      const area = overlapArea(a.polygon, b.polygon);
      if (!(area > FLOOR_OVERLAP_MIN_UM2)) continue;
      const mm2 = Math.round(area / 1e6);
      out.push({
        code: "W3D_FLOOR_OVERLAP",
        rooms: [a.id, b.id],
        areaMm2: mm2,
        message: `Rooms ${a.id} and ${b.id} overlap by ${mm2} mm²; ${b.id}'s floor is lifted 0.5 mm above ${a.id}'s so the two never draw in the same plane.`,
      });
    }
  }
  return out;
}

/** Each lifted floor's lift (µm), from its overlaps: one step above the highest earlier room it overlaps. */
export function floorLifts(floors: readonly Floor[], overlaps: readonly FloorOverlap[]): Map<string, number> {
  const steps = new Map<string, number>();
  for (const f of floors) {
    const below = overlaps.filter((o) => o.rooms[1] === f.id).map((o) => steps.get(o.rooms[0]) ?? 0);
    steps.set(f.id, below.length > 0 ? 1 + Math.max(...below) : 0);
  }
  return new Map([...steps].filter(([, s]) => s > 0).map(([id, s]) => [id, s * FLOOR_LIFT_UM] as const));
}
