import { readdirSync, readFileSync } from "node:fs";
import { resolvePlan } from "../src/analyze.js";
import { navExtent, rasteriseWallSegments } from "../src/analyze/circulation.js";
import { distPointToWallSegment, segmentsOfWall } from "../src/geometry.js";
import { loopBBox, loopsContain, PointInterner, wallBand, type EdgeLoop } from "../src/geometry/band.js";
import type { ResolvedPlan, RWall, RRoom } from "../src/ir.js";
import { MITER_LIMIT } from "../src/scene.js";
import type { World } from "../src/world.js";

/**
 * Shared machinery for `test/nav-grid-residual.test.ts` — the gate that compares the nav
 * grid's WALL MASK against the DRAWN wall solid (`docs/backlog.md` G.11).
 *
 * Not a `.test.ts`, so vitest does not collect it (the `test/joinery-laws.ts` precedent).
 *
 * ## Why the comparands are what they are
 *
 * THE MASK is `rasteriseWallSegments` run into a mask of its own, over the full
 * `navExtent`. It is deliberately NOT `NavGrid.free`: that array conflates room
 * membership, furniture erosion and carved thresholds, and it is `0` everywhere outside
 * the room boxes — so most of every wall's rasterisation is invisible in it, and a gate
 * reading it would examine only the fraction of each wall that happens to overlap a room
 * rectangle.
 *
 * THE SOLID is the union of UN-CUT `wallBand` loops. Three deliberate choices:
 *
 *  - **No opening cuts.** The nav grid does not subtract openings either — it models them
 *    separately, as thresholds carved from the access graph's connectors. So the pre-carve
 *    mask and the un-cut band union are like for like, and no neighbourhood around a door
 *    or window has to be excluded. That matters: a doorway is exactly where an excluded
 *    neighbourhood would hide a chord error.
 *  - **The per-wall union, not `joinWalls`' outline.** A junction trim deletes a FACE LINE,
 *    never solid — `joinWalls` keeps an edge iff exactly one side has an owner — so
 *    `{inside the joined outline}` and `{inside some band}` are the same point set. The
 *    union is equal, faster, and naturally windowed per wall.
 *  - **`EdgeLoop`s, never the emitted Scene `path`.** Every arc in a `path` is split into
 *    minor arcs of at most 120 degrees for the backends' large-arc flag; the loops carry the
 *    un-split signed `Arc`.
 *
 * ## The two exclusions, both structural
 *
 * VERTEX DISCS. `wallBand` extends an open run's end faces by `h` along their tangents, so
 * the drawn square cap CONTAINS the mask's round one; and a mitre reaches at most
 * `MITER_LIMIT * h` from a vertex before it bevels. Away from a vertex the two predicates
 * are literally the same formula — distance to the same centreline against the same `h`.
 * So the disc radius is `MITER_LIMIT * h + cell`, read off those stated constants rather
 * than tuned, applied at every point of `w.points` (interior vertex, free end and closing
 * vertex alike).
 *
 * BOUNDARY TIES. On the corpus's `thickness 100` walls (`h = 50`) laid on a 100 mm grid,
 * cell centres land at distance EXACTLY `50` from the centreline. The mask's `d <= half` is
 * inclusive; `loopsContain` answers by a half-open crossing rule. The predicate is simply
 * undefined on that measure-zero set, so cells within `EPS_MM` of a drawn face are counted
 * separately and reported — never folded into a tolerance.
 *
 * ## Why there is no magnitude tolerance at all
 *
 * Because one could not work. In the OVER direction a chord error is large and obvious
 * (`library`'s eight-arc drum has its chords sitting hundreds of mm inside the true
 * circle). In the UNDER direction the residual is capped by the wall's own half-thickness:
 * a cell in the middle of a `thickness 200` drum is only 100 mm from the boundary, so a
 * blanket tolerance able to admit a legitimate 90-degree mitre — which reaches
 * `sqrt(2) * h` past the faces, and up to `MITER_LIMIT * h` at an acute one — would
 * already swallow it. **A blanket magnitude tolerance would have to be at least
 * `MITER_LIMIT * h` = 400 mm on a 200 mm wall, which exceeds `library`'s own chord
 * residual, which is why this gate excludes by geometry instead** and then asserts exact
 * equality on what is left.
 */

/** Distance below which the two predicates are answering about the same face and may
 *  legitimately disagree — a boundary tie, not a residual. */
export const EPS_MM = 1e-6;

/** Vertex-disc radius for a wall: the furthest a mitre or a square cap can reach from a
 *  vertex, plus one cell so the containing cell is covered too. Derived, not tuned. */
export const vertexRadius = (thickness: number, cell: number): number => (MITER_LIMIT * thickness) / 2 + cell;

export interface Storey {
  name: string;
  storey: number;
  ir: ResolvedPlan;
}

const world: World = {
  read: (p) => {
    try {
      return readFileSync(`examples/${p.replace(/^\.\//, "")}`, "utf8");
    } catch {
      return null;
    }
  },
};

/** Every shipped example, one entry per storey. */
export function shippedStoreys(): Storey[] {
  const out: Storey[] = [];
  for (const f of readdirSync("examples")
    .filter((x) => x.endsWith(".arch"))
    .sort()) {
    const { ir, levels } = resolvePlan(readFileSync(`examples/${f}`, "utf8"), { world });
    if (!ir) continue;
    const name = f.replace(/\.arch$/, "");
    const irs = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
    for (const [i, x] of irs.entries()) out.push({ name, storey: i, ir: x });
  }
  return out;
}

interface Band {
  w: RWall;
  loops: EdgeLoop[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bandsOf(walls: readonly RWall[]): Band[] {
  const intern = new PointInterner();
  return walls.map((w) => {
    const bbs = wallBand(w, intern).map((l) => ({ l, b: loopBBox(l) }));
    return {
      w,
      loops: bbs.map((x) => x.l),
      minX: Math.min(...bbs.map((x) => x.b.minX), Infinity),
      minY: Math.min(...bbs.map((x) => x.b.minY), Infinity),
      maxX: Math.max(...bbs.map((x) => x.b.maxX), -Infinity),
      maxY: Math.max(...bbs.map((x) => x.b.maxY), -Infinity),
    };
  });
}

/** Distance from `p` to a wall's centreline, arc-aware, through the same nearest-host rule
 *  every other consumer uses. Only ever used to SIZE a disagreement the mask comparison has
 *  already found, and to recognise a boundary tie — never to decide one. */
function distToCentreline(p: { x: number; y: number }, w: RWall): number {
  let best = Infinity;
  for (const s of segmentsOfWall(w)) {
    const d = distPointToWallSegment(p, s);
    if (d < best) best = d;
  }
  return best;
}

export interface Cell {
  x: number;
  y: number;
  /** Signed: positive when the grid blocks and the drawing does not ("over"). */
  kind: "over" | "under";
  /** Distance (mm) from the cell centre to the nearest drawn wall face. */
  residualMm: number;
}

export interface Census {
  name: string;
  storey: number;
  /** Cells visited (the union of the per-wall windows). */
  cells: number;
  /** Visited, minus the vertex discs. */
  examined: number;
  agree: number;
  /** Disagreeing, but the centre lies within `EPS_MM` of a drawn face — a tie, not a residual. */
  onBoundary: number;
  /** The largest such tie's own offset from the face; measured headroom under `EPS_MM`. */
  maxOnBoundaryOffsetMm: number;
  /** Disagreeing and NOT on a face. Every one of these is a finding. */
  inexplicable: Cell[];
}

/**
 * Walk one storey: the mask against the solid, cell by cell, over the union of the per-wall
 * windows. Cells outside every window are blocked by neither predicate, so restricting to
 * them is sound and complete.
 */
export function censusOf(s: Storey): Census | null {
  const rooms = s.ir.elements.filter((e): e is RRoom => e.kind === "room");
  const walls = s.ir.walls;
  const ex = navExtent(rooms);
  if (!ex || walls.length === 0) return null;

  const mask = new Uint8Array(ex.nx * ex.ny);
  rasteriseWallSegments(ex, walls, (k) => {
    mask[k] = 1;
  });
  const bands = bandsOf(walls);

  // Vertex discs, hashed into cell-sized buckets so the per-cell test is O(1).
  const discs = new Map<string, Array<{ x: number; y: number; r: number }>>();
  for (const w of walls) {
    const r = vertexRadius(w.thickness, ex.cell);
    const span = Math.ceil(r / ex.cell) + 1;
    for (const p of w.points) {
      const bx = Math.floor(p.x / ex.cell);
      const by = Math.floor(p.y / ex.cell);
      for (let dy = -span; dy <= span; dy++) {
        for (let dx = -span; dx <= span; dx++) {
          const key = `${bx + dx},${by + dy}`;
          const list = discs.get(key);
          if (list) list.push({ x: p.x, y: p.y, r });
          else discs.set(key, [{ x: p.x, y: p.y, r }]);
        }
      }
    }
  }
  const nearVertex = (x: number, y: number): boolean => {
    for (const d of discs.get(`${Math.floor(x / ex.cell)},${Math.floor(y / ex.cell)}`) ?? []) {
      if (Math.hypot(x - d.x, y - d.y) <= d.r) return true;
    }
    return false;
  };

  const seen = new Uint8Array(ex.nx * ex.ny);
  const out: Census = {
    name: s.name,
    storey: s.storey,
    cells: 0,
    examined: 0,
    agree: 0,
    onBoundary: 0,
    maxOnBoundaryOffsetMm: 0,
    inexplicable: [],
  };

  for (const bd of bands) {
    // The rasteriser's own per-wall span, unioned with the band bbox (a mitre or a square
    // cap can reach past the span) and widened by one cell.
    const half = bd.w.thickness / 2;
    let loX = bd.minX;
    let hiX = bd.maxX;
    let loY = bd.minY;
    let hiY = bd.maxY;
    for (const seg of segmentsOfWall(bd.w)) {
      for (const p of [seg.a, seg.b]) {
        loX = Math.min(loX, p.x - half);
        hiX = Math.max(hiX, p.x + half);
        loY = Math.min(loY, p.y - half);
        hiY = Math.max(hiY, p.y + half);
      }
    }
    const ix0 = Math.max(0, Math.floor((loX - ex.minX) / ex.cell) - 2);
    const ix1 = Math.min(ex.nx - 1, Math.ceil((hiX - ex.minX) / ex.cell) + 2);
    const iy0 = Math.max(0, Math.floor((loY - ex.minY) / ex.cell) - 2);
    const iy1 = Math.min(ex.ny - 1, Math.ceil((hiY - ex.minY) / ex.cell) + 2);
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const k = iy * ex.nx + ix;
        if (seen[k]) continue;
        seen[k] = 1;
        out.cells++;
        const x = ex.minX + (ix + 0.5) * ex.cell;
        const y = ex.minY + (iy + 0.5) * ex.cell;
        if (nearVertex(x, y)) continue;
        out.examined++;
        const blocked = mask[k] === 1;
        const p = { x, y };
        let drawn = false;
        for (const b of bands) {
          if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
          if (loopsContain(b.loops, p)) {
            drawn = true;
            break;
          }
        }
        if (blocked === drawn) {
          out.agree++;
          continue;
        }
        let residualMm = Infinity;
        for (const w of walls) residualMm = Math.min(residualMm, Math.abs(distToCentreline(p, w) - w.thickness / 2));
        if (residualMm <= EPS_MM) {
          out.onBoundary++;
          if (residualMm > out.maxOnBoundaryOffsetMm) out.maxOnBoundaryOffsetMm = residualMm;
          continue;
        }
        out.inexplicable.push({ x, y, kind: blocked ? "over" : "under", residualMm });
      }
    }
  }
  return out;
}

/** One line per storey, for the census report. */
export function censusLine(c: Census): string {
  const worst = c.inexplicable.reduce((m, i) => Math.max(m, i.residualMm), 0);
  return (
    `${c.name.padEnd(18)} L${c.storey}  cells ${String(c.cells).padStart(7)}  examined ${String(c.examined).padStart(7)}` +
    `  agree ${String(c.agree).padStart(7)}  onBoundary ${String(c.onBoundary).padStart(5)}` +
    `  inexplicable ${String(c.inexplicable.length).padStart(5)}  worst ${worst.toFixed(1)} mm`
  );
}
