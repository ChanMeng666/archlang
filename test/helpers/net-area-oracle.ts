/**
 * An INDEPENDENT measure of a room's net area: a grid over `room ∩ ⋃ wall bands`, refined
 * where a cell straddles a boundary, with a rigorous-in-practice error bound.
 *
 * It shares nothing with `src/analyze/net-area.ts` past the definition of a wall's band
 * (`wallBand()` in `src/geometry/band.ts`, the drawing's own band) and the room's own
 * closed-form area: no curve splitting, no Green's theorem, no coincidence rule. It asks
 * only "is this point in the room, and in some band?" (`pointInPolygon` / a circle test,
 * and `loopsContain`'s winding rule).
 *
 * The domain is every cell meeting the box of some band edge grown by the band's thickness
 * (every point of a band lies within half its thickness of one of its own edges, so every
 * covered point is in that domain), clipped to the room's box grown by a cell. A cell whose four corners and centre classify alike counts whole; one that
 * does not is split in four, down to {@link LEAF_DEPTH} levels, and a straddling leaf counts
 * by its centre and adds its own area to the bound. So the oracle's error is at most
 * `bound`, except for a boundary that enters and leaves a cell without changing any of its
 * five samples — a sliver thinner than a cell, which no wall band is.
 *
 * Importable without vitest, so a scratch script can run the same body.
 */
import type { Point } from "../../src/ast.js";
import { type EdgeLoop, PointInterner, loopBBox, loopsContain, wallBand } from "../../src/geometry/band.js";
import { pointInPolygon, polygonArea } from "../../src/geometry/polygon.js";
import type { RRoom, RWall } from "../../src/ir.js";

/** Coarse cell (mm). */
export const CELL_MM = 40;
/** Refinement levels below a straddling cell: 40 mm → 2.5 mm leaves. */
export const LEAF_DEPTH = 4;
/** The grid is offset from the plan's integer lattice so cell corners do not sit on wall faces. */
const OFF = { x: 0.37123, y: 0.23911 };

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface OracleResult {
  gross: number;
  covered: number;
  bound: number;
}

export function oracleNetArea(room: RRoom, walls: readonly RWall[]): OracleResult {
  const intern = new PointInterner();
  const bands = walls
    .map((w) => ({ loops: wallBand(w, intern), t: w.thickness }))
    .filter((b) => b.loops.length > 0)
    .map((b) => ({ ...b, box: unionBox(b.loops.map(loopBBox)) }));

  let gross: number;
  let inRoom: (p: Point) => boolean;
  let roomBox: Box;
  if (room.circle) {
    const { c, r } = room.circle;
    gross = Math.PI * r * r;
    inRoom = (p) => Math.hypot(p.x - c.x, p.y - c.y) < r;
    roomBox = { minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r };
  } else {
    const ring = room.poly ?? [
      { x: room.at.x, y: room.at.y },
      { x: room.at.x + room.size.w, y: room.at.y },
      { x: room.at.x + room.size.w, y: room.at.y + room.size.h },
      { x: room.at.x, y: room.at.y + room.size.h },
    ];
    gross = room.poly ? polygonArea(room.poly) : room.size.w * room.size.h;
    inRoom = (p) => pointInPolygon(p.x, p.y, ring, 0);
    roomBox = unionBox(ring.map((p) => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })));
  }
  const near = bands.filter((b) => meets(b.box, roomBox));
  const covers = (p: Point): boolean => inRoom(p) && near.some((b) => inside(b.box, p) && loopsContain(b.loops, p));

  // The domain: each band edge's box grown by the band's thickness, clipped to the room box.
  const boxes: Box[] = [];
  for (const b of near)
    for (const loop of b.loops)
      for (const e of edgeBoxes(loop)) {
        // Clipped to the room's box grown by a cell, so a cell straddling the box's edge is visited.
        const g = clip(grow(e, b.t), grow(roomBox, CELL_MM));
        if (g) boxes.push(g);
      }

  let covered = 0;
  let bound = 0;
  const visit = (x: number, y: number, s: number, depth: number): void => {
    const c = covers({ x: x + s / 2, y: y + s / 2 });
    const corners = [
      covers({ x, y }),
      covers({ x: x + s, y }),
      covers({ x, y: y + s }),
      covers({ x: x + s, y: y + s }),
    ];
    if (corners.every((k) => k === c)) {
      if (c) covered += s * s;
      return;
    }
    if (depth === LEAF_DEPTH) {
      if (c) covered += s * s;
      bound += s * s;
      return;
    }
    const h = s / 2;
    visit(x, y, h, depth + 1);
    visit(x + h, y, h, depth + 1);
    visit(x, y + h, h, depth + 1);
    visit(x + h, y + h, h, depth + 1);
  };
  const done = new Set<string>();
  for (const b of boxes) {
    const i0 = Math.floor((b.minX - OFF.x) / CELL_MM);
    const i1 = Math.ceil((b.maxX - OFF.x) / CELL_MM);
    const j0 = Math.floor((b.minY - OFF.y) / CELL_MM);
    const j1 = Math.ceil((b.maxY - OFF.y) / CELL_MM);
    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        // Each cell once, whichever boxes overlap it.
        const key = `${i},${j}`;
        if (done.has(key)) continue;
        done.add(key);
        visit(OFF.x + i * CELL_MM, OFF.y + j * CELL_MM, CELL_MM, 0);
      }
    }
  }
  return { gross, covered, bound };
}

function edgeBoxes(loop: EdgeLoop): Box[] {
  return loop.map((e) => loopBBox([e]));
}

const unionBox = (bs: readonly Box[]): Box => ({
  minX: Math.min(...bs.map((b) => b.minX)),
  minY: Math.min(...bs.map((b) => b.minY)),
  maxX: Math.max(...bs.map((b) => b.maxX)),
  maxY: Math.max(...bs.map((b) => b.maxY)),
});
const grow = (b: Box, g: number): Box => ({ minX: b.minX - g, minY: b.minY - g, maxX: b.maxX + g, maxY: b.maxY + g });
const meets = (a: Box, b: Box): boolean => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const inside = (b: Box, p: Point): boolean => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
function clip(a: Box, b: Box): Box | null {
  const r = {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
  return r.minX < r.maxX && r.minY < r.maxY ? r : null;
}
