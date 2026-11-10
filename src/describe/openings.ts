/**
 * The `doors`, `windows` and `openings` lists of a `describe()` summary: {@link doorSummaries},
 * {@link windowSummaries}, {@link openingSummaries}. Moved out of `summarize`; each keeps element order.
 *
 * Pure; charges nothing to the step meter.
 */

import type { Point } from "../ast.js";
import type { RDoor, ROpening, RWindow } from "../ir.js";
import { relationText } from "../opening-relation.js";
import { arcWindowRoom, connectorConnection, roomsAtPoint, type RoomBox } from "../analyze.js";
import type { WallSegment } from "../geometry.js";
import { windowFacingPage, toCompass } from "../site.js";
import { fmt3 } from "../num-format.js";
import type { DoorSummary, OpeningSummary, WindowSummary } from "./types.js";

/** Spreadable {@link DoorSummary.centreline_at}: the resolved point of an opening placed `between`. */
function centrelineAt(o: RDoor | ROpening): { centreline_at?: Point } {
  return o._relation?.between ? { centreline_at: { x: Number(fmt3(o.at.x)), y: Number(fmt3(o.at.y)) } } : {};
}

/** One summary per door. `heights` is the plan's vertical-datum gate (`ir._heightsAuthored`). */
export function doorSummaries(
  doorEls: readonly RDoor[],
  roomRects: Map<string, RoomBox>,
  tol: number,
  heights: boolean | undefined,
): DoorSummary[] {
  return doorEls.map((d) => {
    const { between, straddles } = connectorConnection(d, roomRects, tol);
    return {
      id: d.id,
      ...(d._instance !== undefined ? { instance: d._instance } : {}),
      between,
      ...(straddles ? { straddles } : {}),
      width: d.width,
      ...(d._relation ? { relation: relationText(d._relation) } : {}),
      ...(d.doorKind !== undefined ? { kind: d.doorKind } : {}),
      ...(heights ? { head: d.head } : {}),
      ...centrelineAt(d),
    };
  });
}

/**
 * One summary per window. `segs` is the storey's lazily-built wall segments (read only for a window
 * on an arc edge); `planCenter` and `northTurns` are the facing inputs `summarize` computes once.
 */
export function windowSummaries(
  windowEls: readonly RWindow[],
  roomRects: Map<string, RoomBox>,
  tol: number,
  heights: boolean | undefined,
  planCenter: Point,
  northTurns: 0 | 1 | 2 | 3,
  segs: () => WallSegment[],
): WindowSummary[] {
  return windowEls.map((w) => {
    const touching = roomsAtPoint(w.at, roomRects, tol);
    const edgeRoom = touching[0] ?? null;
    // A window on an arc edge no room touches is attributed from the shape (`windowRoom`'s rule
    // in analyze.ts, PS0.12). Its facing is asked exactly as before, of the edge room only.
    const room =
      edgeRoom ??
      (w.host?.arc ? arcWindowRoom({ at: w.at, width: w.width, host: w.host }, roomRects, tol, segs()) : null);
    const box = edgeRoom ? (roomRects.get(edgeRoom) ?? null) : null;
    // A POLYGON/CIRCLE room has no four sides to pick the nearest of, and its bounding box
    // would answer for an edge the window is not on — `windowFacingPage` drops it and falls
    // through to the outward-face probe, which is exact at any wall angle and reads the
    // ring, not the box.
    const facingPage = windowFacingPage(w.at, box, w.host, planCenter, roomRects);
    return {
      id: w.id,
      room,
      width: w.width,
      ...(w._relation ? { relation: relationText(w._relation) } : {}),
      ...(w.windowKind !== undefined ? { kind: w.windowKind } : {}),
      ...(w._corner?.with !== undefined ? { corner_with: w._corner.with } : {}),
      facing: toCompass(facingPage, northTurns),
      ...(northTurns !== 0 ? { facingPage } : {}),
      ...(heights ? { sill: w.sill, head: w.head } : {}),
    };
  });
}

/** One summary per `opening`. */
export function openingSummaries(
  openingEls: readonly ROpening[],
  roomRects: Map<string, RoomBox>,
  tol: number,
  heights: boolean | undefined,
): OpeningSummary[] {
  return openingEls.map((o) => {
    const { between, straddles } = connectorConnection(o, roomRects, tol);
    return {
      id: o.id,
      between,
      ...(straddles ? { straddles } : {}),
      width: o.width,
      ...(o._relation ? { relation: relationText(o._relation) } : {}),
      ...(heights ? { head: o.head } : {}),
      ...centrelineAt(o),
    };
  });
}
