/**
 * Door rules: obstructed swing arcs, blocked walk-through landings, and
 * sub-passable widths — in that (pinned) order via `rules/index.ts`.
 */

import { rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorSwing, sectorIntersectsRect, swingsCollide, type DoorSwing } from "../../geometry.js";
import { doorLandingRect, rectsOverlap } from "../../geometry/rect.js";
import type { RDoor } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";

/** A door whose swing arc is blocked by furniture or another door's swing. */
export const swingObstructed: LintRule = {
  name: "swing-obstructed",
  check({ doors, furniture, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const swings: Array<{ d: RDoor; s: DoorSwing }> = [];
    for (const d of doors) {
      const s = doorSwing(d);
      if (s) swings.push({ d, s });
    }
    for (let i = 0; i < swings.length; i++) {
      const { d, s } = swings[i];
      let blocked = furniture.some((f) => sectorIntersectsRect(s, rectOf(f), rules.swingClearanceMm));
      if (!blocked) {
        for (let j = i + 1; j < swings.length; j++) {
          if (swingsCollide(s, swings[j].s, rules.swingClearanceMm)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        out.push({
          severity: "warning",
          code: "W_SWING_OBSTRUCTED",
          ...at(d.span),
          message: `Door swing is obstructed — the leaf cannot open fully.`,
          hints: ["Move the door or the obstruction, flip its `hinge`/`swing`, or use a sliding door."],
        });
      }
    }
    return out;
  },
};

/** Furniture parked in a door's straight approach (the clear landing on each side of
 *  the opening), so you can't pass through even with the leaf open. Distinct from the
 *  swing arc above — this is the walk-through path, the thing that piles fixtures at a
 *  bathroom door. Built as an AABB straddling the opening on orthogonal host walls. */
export const doorwayBlocked: LintRule = {
  name: "doorway-blocked",
  check({ doors, furniture, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of doors) {
      const depth = rules.doorwayLandingMm;
      const landing = doorLandingRect(d, depth);
      if (!landing) continue; // no host, or an angled host — skip
      const blocker = furniture.find((f) => rectsOverlap(landing, rectOf(f)));
      if (blocker) {
        const gn = blocker.label ?? blocker.category;
        out.push({
          severity: "warning",
          code: "W_DOORWAY_BLOCKED",
          ...at(d.span),
          message: `Doorway is blocked — "${gn}" sits in the clear approach through the door.`,
          hints: [`Keep at least ${depth} mm clear on each side of the opening, or move "${gn}".`],
        });
      }
    }
    return out;
  },
};

/** Door too narrow to pass comfortably. */
export const doorClearance: LintRule = {
  name: "door-clearance",
  check({ doors, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of doors) {
      if (d.width < rules.minDoorWidthMm) {
        out.push({
          severity: "warning",
          code: "W_DOOR_CLEARANCE",
          ...at(d.span),
          message: `Door is ${d.width} mm wide (under the ${rules.minDoorWidthMm} mm minimum nominal width).`,
          hints: [`Widen it to at least ${rules.minDoorWidthMm} mm.`],
        });
      }
    }
    return out;
  },
};
