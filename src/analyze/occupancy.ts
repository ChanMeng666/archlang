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
 * its own rule, `W_SWING_OBSTRUCTED`.) Pure and deterministic: one cell size per room,
 * derived closed-form from that room's area by {@link roomCellSizeMm}, integer cell
 * coordinates, source-ordered seeds, row-major iteration — no floats as keys.
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

/**
 * Occupancy-grid resolution, the per-room counterpart of the whole-plan nav grid's
 * budget (`circulation.ts`, ADR 0008 addendum): the knob is a target cell **size**
 * bounded by a total cell **budget**, `cell = max(MIN_CELL_MM, ceil(sqrt(roomArea /
 * MAX_CELLS_ROOM)))`, so a big room is measured at the same resolution as a small one
 * instead of having a fixed cell count divided out of its area. A fixed count made a
 * 26 × 26 m gallery grid at ~520 mm, where blocking is "is the cell CENTRE inside the
 * footprint" — a 600 mm-deep counter could fall between two centres and vanish.
 *
 * `MIN_CELL_MM` keeps every room up to MAX_CELLS_ROOM · MIN_CELL_MM² = 250 m² on the
 * 100 mm cells it has always used, and the budget alone bounds the work (nx·ny ≤
 * roomArea / cell² ≤ MAX_CELLS_ROOM), so no per-axis clamp is needed.
 */
const MIN_CELL_MM = 100;
const MAX_CELLS_ROOM = 25_000;

/**
 * The occupancy-grid cell size (mm) for a room of `areaMm2`. Closed-form, integral and
 * monotonic in the area — the same room always grids the same way.
 */
export function roomCellSizeMm(areaMm2: number): number {
  return Math.max(MIN_CELL_MM, Math.ceil(Math.sqrt(areaMm2 / MAX_CELLS_ROOM)));
}

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

    // Cell size: never coarser than the room's area budget asks for, never finer than
    // MIN_CELL_MM. The cell is then stretched to tile the room exactly (cellW/cellH),
    // so the measured areas still sum to the room's own area.
    const cell = roomCellSizeMm(rb.w * rb.h);
    const nx = Math.max(1, Math.floor(rb.w / cell));
    const ny = Math.max(1, Math.floor(rb.h / cell));
    const cellW = rb.w / nx;
    const cellH = rb.h / ny;
    const area1 = (cellW * cellH) / 1_000_000;

    // free[iy*nx+ix] — true when the cell centre is clear of every furniture footprint.
    // Every cell starts free and each piece then clears the cells inside its own bbox
    // window (the exact containment test still runs per cell, widened by one so a
    // boundary centre is never missed). Same predicate on the same cells as a per-cell
    // scan over every piece, but O(cells + covered) instead of O(cells × pieces) —
    // which is what makes the finer, area-budgeted grid affordable.
    const free = new Uint8Array(nx * ny).fill(1);
    for (const fr of furnRects) {
      const ix0 = Math.max(0, Math.floor((fr.x - rb.x) / cellW) - 1);
      const ix1 = Math.min(nx - 1, Math.ceil((fr.x + fr.w - rb.x) / cellW));
      const iy0 = Math.max(0, Math.floor((fr.y - rb.y) / cellH) - 1);
      const iy1 = Math.min(ny - 1, Math.ceil((fr.y + fr.h - rb.y) / cellH));
      for (let iy = iy0; iy <= iy1; iy++) {
        const cy = rb.y + (iy + 0.5) * cellH;
        for (let ix = ix0; ix <= ix1; ix++) {
          const k = iy * nx + ix;
          if (free[k] && pointInRect(rb.x + (ix + 0.5) * cellW, cy, fr)) free[k] = 0;
        }
      }
    }
    let totalFree = 0;
    for (let k = 0; k < free.length; k++) if (free[k]) totalFree++;

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
