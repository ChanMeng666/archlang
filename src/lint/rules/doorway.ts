/**
 * The walk-through landing rule, `W_DOORWAY_BLOCKED` (`doorwayBlocked`), and the move it offers as a
 * fix (card AF9, `src/lint/doorway-move.ts`). It stands apart from the other door rules
 * (`./doors.ts`) because those are on `describe()`'s path (`src/lint/clearance-facts.ts` reads
 * `blockedApproach`), and the move search, which reuses the opening rules' own, must stay off the
 * compiler's chunk. Moved from `./doors.ts` unchanged but for the fix.
 */

import { rectOf } from "../../analyze.js";
import { CLI_NAME } from "../../command-name.js";
import type { Diagnostic } from "../../diagnostics.js";
import { fixesFrom } from "../../fix-producers.js";
import { DOORWAY_WIDTH_MM, openingBlock } from "../../geometry/rect.js";
import type { RFurniture, ROpening } from "../../ir.js";
import { isServiceCounter } from "../clearance-measure.js";
import type { LintContext, LintRule } from "../context.js";
import { doorwayMoveFix, doorwayMoves } from "../doorway-move.js";
import { openingName } from "../element-phrases.js";
import { mm, shortfall } from "../measure.js";
import { cite } from "../rule-ref.js";
import { blockedApproach } from "./doors.js";

/**
 * Furniture parked in a doorway's straight approach (the clear landing on each side of the
 * opening), so you can't pass through even with the leaf open. Distinct from the swing arc above
 * — this is the walk-through path, the thing that piles fixtures at a bathroom door. Built as an
 * AABB straddling the opening on orthogonal host walls, its depth measured from the wall's face
 * on each side (PS2.54, {@link doorLandingRect}).
 *
 * A leaf-less (cased) opening is read too (plan-soundness PS2.11e), after every door, with the
 * same landing: an opening has no leaf, so nothing but the approach can block it, and a sofa
 * 250 mm in front of a hall's only way into the living room (the first-contact audit's T2)
 * blocks it as surely as a door. An opening up to a doorway's width ({@link DOORWAY_WIDTH_MM},
 * 1200 mm) is judged as a door is; a wider one, an open-plan join or the full shared edge an
 * `open between` derives, only when the pieces in its approach leave no 1200 mm stretch of it
 * clear ({@link openingBlock}): a dining table 250 mm off a 3 m join leaves the rest of it to walk
 * through. Its message names the opening by the rooms it joins (never an id); a derived
 * `open between` opening takes its span from the rooms' shared edge, so its hint does not offer
 * to move it. A counter (`counter`, `worktop`, `bar_counter`) is not a blocker
 * there: a counter across a cased opening is the servery hatch a café or a kitchen is served
 * across (`examples/corner-cafe.arch`), the opening's purpose; whether a room is still reached is
 * `W_PATH_TOO_NARROW`'s question.
 *
 * A `garage` door is not read (plan-soundness PS2.65): it is a vehicle door, not a pedestrian
 * doorway, and the car parked in its approach is the one it exists for (the 2026-10-18
 * first-contact house's 2400 mm door and its "Car"), as `W_LEAF_TOO_WIDE` leaves out the kinds
 * with no swinging leaf.
 */
export const doorwayBlocked: LintRule = {
  name: "doorway-blocked",
  family: "doors",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_DOORWAY_BLOCKED"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of ctx.doors) {
      // A vehicle door is not a pedestrian doorway: the car in front of it is what it is for.
      if (d.doorKind === "garage") continue;
      const hit = blockedApproach(d, ctx);
      if (!hit) continue;
      const { blocker, depth, gap, short } = hit;
      const gn = blocker.label ?? blocker.category;
      out.push(
        cite(ctx.rules, "doorwayLandingMm", {
          severity: "warning",
          code: "W_DOORWAY_BLOCKED",
          ...ctx.at(d),
          message: `Doorway is blocked — the approach needs ${mm(depth)} mm clear on each side but "${gn}" leaves ${mm(gap)} mm (${mm(short)} mm short).`,
          hints: [
            `Move "${gn}" ${mm(short)} mm clear of the opening — \`${CLI_NAME} repair\` computes the smallest clearing shift.`,
            `Or shrink it by ${mm(short)} mm on the axis facing the door, so it stops ${mm(depth)} mm short of the opening.`,
            `Or move the door along its wall (\`on <wall> at <pos>\`) so its landing misses "${gn}".`,
          ],
          ...fixesFrom(
            doorwayMoveFix(
              doorwayMoves(ctx, d, (x) => blockedApproach(x, ctx) !== null),
              "door",
              gn,
            ),
          ),
        }),
      );
    }
    // Cased openings after every door, so a plan's door diagnostics keep their order.
    for (const o of ctx.openings) {
      if (o.width > DOORWAY_WIDTH_MM) {
        const wide = wideOpeningBlocked(o, ctx);
        if (wide) out.push(wide);
        continue;
      }
      const counts = (f: RFurniture): boolean => !isServiceCounter(f.category);
      const hit = blockedApproach(o, ctx, counts);
      if (!hit) continue;
      const { blocker, depth, gap, short } = hit;
      const gn = blocker.label ?? blocker.category;
      const ref = blocker._idAuthored === true ? `"${blocker.id}"` : `"${gn}"`;
      const name = openingName(ctx, o);
      out.push(
        cite(ctx.rules, "doorwayLandingMm", {
          severity: "warning",
          code: "W_DOORWAY_BLOCKED",
          ...ctx.at(o),
          message: `${name[0]!.toUpperCase()}${name.slice(1)} is blocked — the approach needs ${mm(depth)} mm clear on each side but "${gn}" leaves ${mm(gap)} mm (${mm(short)} mm short).`,
          hints: [
            `Move ${ref} ${mm(short)} mm clear of the opening — \`${CLI_NAME} repair\` computes the smallest clearing shift.`,
            `Or shrink it by ${mm(short)} mm on the axis facing the opening, so it stops ${mm(depth)} mm short of the wall's face.`,
            o._derived
              ? "The opening is derived by `open between` and spans the rooms' shared edge, so the piece is what moves."
              : `Or move the opening along its wall (\`on <wall> at <pos>\`) so its landing misses ${ref}.`,
          ],
          ...fixesFrom(
            doorwayMoveFix(
              doorwayMoves(ctx, o, (x) => blockedApproach(x, ctx, counts) !== null, counts),
              "opening",
              gn,
            ),
          ),
        }),
      );
    }
    return out;
  },
};

/**
 * A cased opening wider than a doorway ({@link DOORWAY_WIDTH_MM}) whose approach keeps no doorway's
 * width clear ({@link openingBlock}), or `null`. The piece named is the first in its approach, in
 * source order; a service counter is not read, as for a narrow opening.
 */
function wideOpeningBlocked(o: ROpening, ctx: LintContext): Diagnostic | null {
  const pieces = ctx.furniture.filter((f) => !isServiceCounter(f.category));
  const block = openingBlock(o, ctx.rules.doorwayLandingMm, pieces.map(rectOf));
  if (block === null) {
    if (o.host) ctx.skip("unsupported-host-geometry");
    return null;
  }
  if (!block.blocked) return null;
  const blocker = pieces[block.inside[0]!]!;
  const gn = blocker.label ?? blocker.category;
  const ref = blocker._idAuthored === true ? `"${blocker.id}"` : `"${gn}"`;
  const others = block.inside.length - 1;
  const name = openingName(ctx, o);
  const short = shortfall(DOORWAY_WIDTH_MM, block.stretch);
  return cite(ctx.rules, "doorwayLandingMm", {
    severity: "warning",
    code: "W_DOORWAY_BLOCKED",
    ...ctx.at(o),
    message: `${name[0]!.toUpperCase()}${name.slice(1)} is blocked — "${gn}"${others > 0 ? ` and ${others} other piece${others > 1 ? "s" : ""}` : ""} in its ${mm(ctx.rules.doorwayLandingMm)} mm approach leave${others > 0 ? "" : "s"} ${mm(block.stretch)} mm of its ${mm(o.width)} mm clear, under the ${mm(DOORWAY_WIDTH_MM)} mm a doorway needs (${mm(short)} mm short).`,
    hints: [
      `Move ${ref} out of the opening's approach (${mm(ctx.rules.doorwayLandingMm)} mm past each face of the wall) or along it, so ${mm(DOORWAY_WIDTH_MM)} mm of the opening stays clear — \`${CLI_NAME} repair\` clears the whole approach.`,
      o._derived
        ? "The opening is derived by `open between` and spans the rooms' shared edge, so the pieces are what move."
        : `Or widen the opening, or move it along its wall (\`on <wall> at <pos>\`), so a ${mm(DOORWAY_WIDTH_MM)} mm stretch of it misses ${ref}.`,
    ],
  });
}
