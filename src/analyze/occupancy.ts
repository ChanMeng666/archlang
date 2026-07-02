/**
 * Room circulation as a fact: can a person actually step through a room's door and
 * reach its floor, or do furniture, fixtures and door swings seal it off?
 *
 * This is the one place ArchLang borrows a game/robotics idea — a grid **flood-fill
 * over a navmesh**. Each room is rasterised to a coarse occupancy grid; cells whose
 * centre falls inside a furniture/fixture footprint are blocked; we flood-fill the free
 * cells from the room's doorways and measure how much clear floor the entrance can
 * actually reach. (Door *swing* arcs are deliberately NOT occupancy here — the leaf
 * opens flat against a wall and you stand in the doorway to enter; swing clearance is
 * its own rule, `W_SWING_OBSTRUCTED`.) Pure and deterministic: fixed cell size, integer
 * cell coordinates, source-ordered seeds, row-major iteration — no floats as keys.
 *
 * It computes a **fact** (reachable clear floor area); the lint rule decides whether
 * that is too little. It never moves anything — see ADR 0006.
 */

import type { RRoom, RDoor, ROpening, RFurniture, RWall } from "../ir.js";
import { rectOf, pointOnRoomEdge } from "../analyze.js";
import { pointInRect } from "../geometry/rect.js";

export interface RoomClearance {
  roomId: string;
  /** Has at least one door/opening on its perimeter (else circulation is moot). */
  hasConnector: boolean;
  /** Clear floor area (m²) the entrance(s) can actually reach by walking. */
  reachableClearAreaM2: number;
  /** Total clear floor area (m²) in the room, reachable or not. */
  totalClearAreaM2: number;
}

/** Target ~cell count per room; the cell size grows for large rooms so the grid
 *  stays bounded (and fast) regardless of plan size. */
const TARGET_CELLS = 2500;
const MIN_CELL_MM = 100;
const MAX_CELLS_PER_AXIS = 200;

/**
 * Compute, per room, how much clear floor its doorways can reach. Deterministic and
 * allocation-light: one boolean grid per room, 4-connected BFS from the doorway cells.
 */
export function computeRoomClearances(
  rooms: RRoom[],
  furniture: RFurniture[],
  doors: RDoor[],
  openings: ROpening[],
  _walls: RWall[],
  tolMm: number,
): RoomClearance[] {
  const furnRects = furniture.map((f) => rectOf(f));
  const connectors: Array<{ at: { x: number; y: number } }> = [
    ...doors.map((d) => ({ at: d.at })),
    ...openings.map((o) => ({ at: o.at })),
  ];

  return rooms.map((r) => {
    const rb = rectOf(r);
    const onPerim = connectors.filter((c) => pointOnRoomEdge(c.at, rb, tolMm));
    if (onPerim.length === 0) {
      return { roomId: r.id, hasConnector: false, reachableClearAreaM2: 0, totalClearAreaM2: 0 };
    }

    // Cell size: aim for ~TARGET_CELLS cells, never finer than MIN_CELL_MM, and clamp
    // the per-axis count so a huge room can't blow up the grid.
    const ideal = Math.sqrt((rb.w * rb.h) / TARGET_CELLS);
    const cell = Math.max(MIN_CELL_MM, Math.ceil(ideal));
    const nx = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.floor(rb.w / cell)));
    const ny = Math.min(MAX_CELLS_PER_AXIS, Math.max(1, Math.floor(rb.h / cell)));
    const cellW = rb.w / nx;
    const cellH = rb.h / ny;
    const area1 = (cellW * cellH) / 1_000_000;

    // free[iy*nx+ix] — true when the cell centre is clear of every furniture footprint.
    const free = new Uint8Array(nx * ny);
    let totalFree = 0;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const cx = rb.x + (ix + 0.5) * cellW;
        const cy = rb.y + (iy + 0.5) * cellH;
        let blocked = false;
        for (const fr of furnRects) {
          if (pointInRect(cx, cy, fr)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          free[iy * nx + ix] = 1;
          totalFree++;
        }
      }
    }

    // Seed BFS from the doorway. The connector sits on a room edge, so step inward
    // (perpendicular to that edge) to the first free cell — a doorway whose whole
    // inward column/row is blocked by furniture contributes no seed (it's sealed).
    const seen = new Uint8Array(nx * ny);
    const queue: number[] = [];
    for (const c of onPerim) {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor((c.at.x - rb.x) / cellW)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor((c.at.y - rb.y) / cellH)));
      // Inward step from whichever edge the connector lies on.
      const dx = Math.abs(c.at.x - rb.x) <= tolMm ? 1 : Math.abs(c.at.x - (rb.x + rb.w)) <= tolMm ? -1 : 0;
      const dy = Math.abs(c.at.y - rb.y) <= tolMm ? 1 : Math.abs(c.at.y - (rb.y + rb.h)) <= tolMm ? -1 : 0;
      for (let step = 0; step < nx + ny; step++) {
        const sx = Math.min(nx - 1, Math.max(0, ix + dx * step));
        const sy = Math.min(ny - 1, Math.max(0, iy + dy * step));
        const k = sy * nx + sx;
        if (free[k]) {
          if (!seen[k]) {
            seen[k] = 1;
            queue.push(k);
          }
          break;
        }
        if ((dx === 0 || sx === (dx > 0 ? nx - 1 : 0)) && (dy === 0 || sy === (dy > 0 ? ny - 1 : 0))) break;
      }
    }
    let reached = queue.length;
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h]!;
      const ix = k % nx;
      const iy = (k - ix) / nx;
      const nbrs = [ix > 0 ? k - 1 : -1, ix < nx - 1 ? k + 1 : -1, iy > 0 ? k - nx : -1, iy < ny - 1 ? k + nx : -1];
      for (const nb of nbrs) {
        if (nb >= 0 && free[nb] && !seen[nb]) {
          seen[nb] = 1;
          queue.push(nb);
          reached++;
        }
      }
    }

    return {
      roomId: r.id,
      hasConnector: true,
      reachableClearAreaM2: Math.round(reached * area1 * 100) / 100,
      totalClearAreaM2: Math.round(totalFree * area1 * 100) / 100,
    };
  });
}
