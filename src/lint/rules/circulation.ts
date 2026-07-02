/**
 * Circulation: a room whose doorways can't reach a usable patch of clear floor —
 * technically reachable (it has a door) but so packed that you can't step in. A grid
 * flood-fill fact (see analyze/occupancy.ts); only fires when there *is* enough free
 * floor somewhere (totalClear ≥ the minimum) but the entrance can't get to it, so a
 * genuinely tiny room isn't double-flagged for being small.
 */

import { computeRoomClearances } from "../../analyze/occupancy.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

export const roomNoClearPath: LintRule = {
  name: "room-no-clear-path",
  check({ rooms, furniture, doors, openings, ir, rules, labelOf, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const rc of computeRoomClearances(rooms, furniture, doors, openings, ir.walls, rules.tolMm)) {
      if (
        rc.hasConnector &&
        rc.reachableClearAreaM2 < rules.minClearAreaM2 &&
        rc.totalClearAreaM2 >= rules.minClearAreaM2
      ) {
        const r = rooms.find((x) => x.id === rc.roomId)!;
        out.push({
          severity: "warning",
          code: "W_ROOM_NO_CLEAR_PATH",
          ...at(r.span),
          message: `Room "${labelOf(r)}" can't be entered — furniture and door swings seal off the floor by its door (only ${rc.reachableClearAreaM2} m² reachable).`,
          hints: ["Move or shrink the pieces nearest the door so there's a continuous walkable path into the room."],
        });
      }
    }
    return out;
  },
};
