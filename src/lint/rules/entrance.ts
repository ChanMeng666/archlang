/** The building has rooms and an outer shell but no way in. */

import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

export const noEntrance: LintRule = {
  name: "no-entrance",
  check({ rooms, connectors, ir }: LintContext): Diagnostic[] {
    const hasExteriorWall = ir.walls.some((wl) => wl.category === "exterior");
    const hasExteriorEntry = connectors.some((c) => c.host?.category === "exterior");
    if (rooms.length > 0 && hasExteriorWall && !hasExteriorEntry) {
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
