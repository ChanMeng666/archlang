/**
 * The building has rooms and an outer shell but no way in.
 *
 * On a multi-storey plan a storey reached by a `stair`/`elevator`/`escalator` from a
 * storey that itself reaches the outside HAS a way in — it just isn't a door on this
 * floor — so the rule stands down there (see `src/vertical.ts`). Before v1.21 an upper
 * floor had to fake a front door to lint clean.
 */

import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

export const noEntrance: LintRule = {
  name: "no-entrance",
  check({ rooms, connectors, ir, building }: LintContext): Diagnostic[] {
    const hasExteriorWall = ir.walls.some((wl) => wl.category === "exterior");
    const hasExteriorEntry = connectors.some((c) => c.host?.category === "exterior");
    const reachedByShaft = building.arrivalRooms.length > 0;
    if (rooms.length > 0 && hasExteriorWall && !hasExteriorEntry && !reachedByShaft) {
      return [
        {
          severity: "warning",
          code: "W_NO_ENTRANCE",
          message: "The plan has no exterior door or opening — there is no way into the building.",
          hints: ["Add a `door` (or a cased `opening`) on an `exterior` wall."],
        },
      ];
    }
    return [];
  },
};
