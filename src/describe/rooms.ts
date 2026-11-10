/**
 * The `rooms` list of a `describe()` summary: {@link roomSummaries}, one {@link RoomSummary} per
 * room (area, net area, bbox, floor polygon, adjacency), in element order. Moved out of `summarize`.
 *
 * Pure; charges nothing to the step meter.
 */

import type { RRoom } from "../ir.js";
import { rectRing } from "../geometry/polygon.js";
import { memoRoomNetAreaMm2 } from "../analyze/net-area-memo.js";
import type { NetAreaBand } from "../analyze/net-area.js";
import { roomAreaMm2, roomUses, type RoomBox } from "../analyze.js";
import { roomTypeForUses } from "../plan-json.js";
import type { RoomSummary } from "./types.js";
import { instanceOf, r2 } from "./shared.js";

/** A room's `net_area_m2` key: the rounded figure, or no key at all when it is omitted. */
const netField = (mm2: number | undefined): { net_area_m2?: number } =>
  mm2 === undefined ? {} : { net_area_m2: r2(mm2 / 1_000_000) };

/** One summary per room, in element order. `adjacency[i]` is room `i`'s `adjacent` list; `bands` is the storey's wall bands. */
export function roomSummaries(
  roomEls: readonly RRoom[],
  roomRects: Map<string, RoomBox>,
  adjacency: readonly string[][],
  bands: readonly NetAreaBand[],
): RoomSummary[] {
  return roomEls.map((r, i) => {
    const rect = roomRects.get(r.id)!;
    const adjacent = adjacency[i]!;
    const uses = roomUses(r);
    return {
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: [...uses],
      room_type: roomTypeForUses(uses),
      area_m2: r2(roomAreaMm2(r) / 1_000_000),
      ...netField(memoRoomNetAreaMm2(r, bands)),
      // `bbox` stays a plain {x,y,w,h} — never the RoomBox, whose `poly` would leak a
      // fifth key into the JSON. A polygon room's true floor is `floor_polygon`.
      bbox: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      // A CIRCULAR room reports its exact centre + radius (append-only) INSTEAD of a
      // 48-vertex ring: the tessellation is an implementation detail of the grid layer,
      // and dumping it would bloat an agent's context with numbers that are not the
      // truth about the floor. `area_m2` above is πR², exact.
      ...(r.circle
        ? {
            floor_circle: { cx: r.circle.c.x, cy: r.circle.c.y, r: r.circle.r },
          }
        : {}),
      floor_polygon: r.circle ? [] : r.poly ? r.poly.map((p) => ({ x: p.x, y: p.y })) : rectRing(rect),
      adjacent,
      ...instanceOf(r),
    };
  });
}
