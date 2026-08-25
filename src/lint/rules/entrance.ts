/**
 * The building has rooms but no way in.
 *
 * The question is the GEOMETRIC one `describe()` asks — is there a door or cased opening
 * that connects a room to the outside? — read off the shared access graph
 * (`LintContext.access`), so lint and `describe().access.hasEntrance` can never disagree.
 *
 * This rule used to stand down unless some wall carried `category exterior`. That
 * guard silently exempted two whole shapes of plan from ever being asked: a closed shell
 * drawn entirely out of `partition` walls, and rooms with no walls at all. `describe()`
 * reported `hasEntrance: false` for both while `arch lint` said nothing. Component
 * libraries — the case the shell test was standing in for — are covered by
 * `rooms.length > 0` on its own: a library file declares no rooms.
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
  check({ rooms, access, building }: LintContext): Diagnostic[] {
    const reachedByShaft = building.arrivalRooms.length > 0;
    if (rooms.length > 0 && !access().hasEntrance && !reachedByShaft) {
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
