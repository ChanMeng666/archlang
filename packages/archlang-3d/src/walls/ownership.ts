/**
 * Per-wall ownership (H1): the region of the joined wall solid each wall owns, from the core's
 * one joinery. `joinWallSet(walls, groups, { faceOf, faces })` partitions every group's fill by
 * face; with one face per wall the partition IS the ownership, so the 3D package never derives a
 * second footprint (ADR 0018, ADR 0031).
 *
 * Two rules from the spike (`docs/plans/archlang-3d/research/02-wall-geometry.md`):
 *  1. one solid per CONNECTED PIECE: a wall can own several pieces (a thinner wall split by a
 *     thicker one), and two pieces touching at a point are separate solids;
 *  2. an opening's cut is removed from EVERY piece it covers, not only its host's.
 * Ownership is computed with the openings stripped (the solid), and the cuts are returned
 * beside it, so the geometry stage can keep the sill and lintel under and over each cut.
 */
import { joinWallSet, loopsToPolygons, type JoinedCut, type RWall } from "@chanmeng666/archlang";

/** A plan point (mm). The core's `Point` is not nameable from its root, so it is read off `RWall`. */
export type Point = RWall["points"][number];

/** A ring of plan points (mm), as `loopsToPolygons` returns it: closed, no repeated vertex. */
export type Ring = Point[];

/** One connected piece of a wall's owned region: its outer ring, then the holes inside it. */
export interface Piece {
  outer: Ring;
  holes: Ring[];
}

export interface OwnedWall {
  /** Index into the wall list given to {@link wallOwnership}. */
  index: number;
  wall: RWall;
  pieces: Piece[];
  /** Plan area owned, mm² (outer minus holes). */
  area: number;
}

export interface Ownership {
  owned: OwnedWall[];
  /** Area of the joined solid (every group's fill), mm²: the owned areas tile it. */
  fillArea: number;
  /** Every opening's cut, joined back to its host wall, from the same joinery. */
  cuts: JoinedCut[];
}

/**
 * The hatch group a wall's fill belongs to. `joinWallSet` groups fills by the wall's hatch
 * (material, scale, angle) and the caller must name the groups it wants back; the core does not
 * export its key function, so the key is rebuilt from the three public fields. A drift in the
 * core's key format empties every fill, which `test/h1-ownership.test.ts` turns red on the
 * corpus (every wall must own a positive area).
 */
export function hatchGroupKey(w: Pick<RWall, "material" | "hatchScale" | "hatchAngle">): string {
  return `${w.material}|${w.hatchScale}|${w.hatchAngle}`;
}

/** Signed shoelace area of a ring in plan axes (y down). */
export function signedArea(r: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i] as Point;
    const b = r[(i + 1) % r.length] as Point;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Even-odd point-in-ring test. */
export function inRing(p: Point, r: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i] as Point;
    const b = r[j] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Rings → connected pieces. The joinery's loops come out with outers and holes of opposite
 * orientation; the sign of the larger-magnitude ring is the outer sign, and each hole joins the
 * outer that contains its first vertex.
 */
export function piecesOf(rings: readonly Ring[]): Piece[] {
  if (rings.length === 0) return [];
  const largest = rings.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
  const outerSign = Math.sign(signedArea(largest));
  const outers = rings.filter((r) => Math.sign(signedArea(r)) === outerSign);
  const holes = rings.filter((r) => Math.sign(signedArea(r)) !== outerSign);
  return outers.map((outer) => ({ outer, holes: holes.filter((h) => inRing(h[0] as Point, outer)) }));
}

const pieceArea = (p: Piece): number =>
  Math.abs(signedArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);

/**
 * Every wall's owned region, in the order given. `walls` must be in the drawing's order
 * (`ResolvedPlan.walls` is): that order breaks the joinery's thickness ties.
 */
export function wallOwnership(walls: readonly RWall[]): Ownership {
  if (walls.length === 0) return { owned: [], fillArea: 0, cuts: [] };
  const groups = [...new Set(walls.map(hatchGroupKey))];
  // Faces are wall INDICES, so two walls sharing an id (a placed component) never merge.
  const faces = walls.map((_, i) => String(i));
  const solid = walls.map((w) => ({ ...w, openings: [] }));
  const index = new Map(solid.map((w, i) => [w, i] as const));
  const joined = joinWallSet(solid, groups, { faceOf: (w) => String(index.get(w)), faces });
  const withCuts = joinWallSet(walls, []);
  const fillArea = (joined?.result.fills ?? []).reduce(
    (s, f) => s + loopsToPolygons(f.loops).reduce((t, r) => t + signedArea(r), 0),
    0,
  );
  const rings = new Map<number, Ring[]>();
  for (const sf of joined?.result.split?.fills ?? []) {
    const i = Number(sf.face);
    rings.set(i, [...(rings.get(i) ?? []), ...loopsToPolygons(sf.loops)]);
  }
  const owned = walls.map((wall, i) => {
    const pieces = piecesOf(rings.get(i) ?? []);
    return { index: i, wall, pieces, area: pieces.reduce((s, p) => s + pieceArea(p), 0) };
  });
  return { owned, fillArea: Math.abs(fillArea), cuts: withCuts?.cuts ?? [] };
}

/** Distance from `p` to segment `ab`. */
function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const ringsOf = (p: Piece): Ring[] => [p.outer, ...p.holes];

/** Whether two pieces share a point of their boundaries (an edge or a vertex), within `tol` mm. */
export function piecesTouch(a: Piece, b: Piece, tol = 1e-3): boolean {
  const near = (p: Point, rs: Ring[]): boolean =>
    rs.some((r) => r.some((q, i) => segDist(p, q, r[(i + 1) % r.length] as Point) <= tol));
  return (
    ringsOf(a).some((r) => r.some((p) => near(p, ringsOf(b)))) ||
    ringsOf(b).some((r) => r.some((p) => near(p, ringsOf(a))))
  );
}

export interface MixedHeightJoint {
  code: "W3D_MIXED_HEIGHT_JOINT";
  /** The wall that owns the joint (the joinery's winner) and the taller wall it notches. */
  owner: { id: string; height: number };
  notched: { id: string; height: number };
  message: string;
}

/**
 * Same-storey walls whose owned pieces touch, where the wall that owns the joint is the LOWER
 * one, so the taller wall is notched where they meet (archlang-3d Q19, V-GEO-12; the synthetic
 * `s11` is the regression case). The joinery gives a contested point to the thicker wall, a tie
 * to the earlier one; a joint whose owner is the taller wall loses nothing and is not reported.
 * Reported, never repaired: the geometry is the core's ownership, as drawn.
 */
export function mixedHeightJoints(own: Ownership): MixedHeightJoint[] {
  const out: MixedHeightJoint[] = [];
  const { owned } = own;
  for (let i = 0; i < owned.length; i++) {
    for (let j = i + 1; j < owned.length; j++) {
      const a = owned[i] as OwnedWall;
      const b = owned[j] as OwnedWall;
      if (a.wall.height === b.wall.height) continue;
      const winner = b.wall.thickness > a.wall.thickness ? b : a;
      const loser = winner === a ? b : a;
      if (winner.wall.height >= loser.wall.height) continue;
      if (!a.pieces.some((p) => b.pieces.some((q) => piecesTouch(p, q)))) continue;
      out.push({
        code: "W3D_MIXED_HEIGHT_JOINT",
        owner: { id: winner.wall.id, height: winner.wall.height },
        notched: { id: loser.wall.id, height: loser.wall.height },
        message:
          `Wall ${winner.wall.id} (${winner.wall.height} mm high) owns its joint with the taller wall ` +
          `${loser.wall.id} (${loser.wall.height} mm), so the taller wall is notched where they meet.`,
      });
    }
  }
  return out;
}
