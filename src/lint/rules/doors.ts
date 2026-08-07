/**
 * Door rules: obstructed swing arcs, blocked walk-through landings, and
 * sub-passable widths — in that (pinned) order via `rules/index.ts`.
 */

import { rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorHingeFlipFix, fixesFrom } from "../../fix-producers.js";
import { doorSwing, sectorIntersectsRect, swingsCollide, type DoorSwing } from "../../geometry.js";
import { doorLandingRect, rectsOverlap } from "../../geometry/rect.js";
import type { RDoor } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";
import { approachGapMm, distPointToRect, mm, shortfall } from "../measure.js";

/**
 * A door whose swing arc is blocked by furniture or another door's swing.
 *
 * The message states the clear radius the swing needs, what it actually has, and the
 * shortfall; the hints enumerate the closed remedy set. Only the hinge flip is carried
 * as a machine-applicable {@link doorHingeFlipFix} — and only when the flipped swing is
 * recomputed and proved clear of everything. The "narrow the door" remedy quotes the
 * exact width that would clear and **refuses itself** when that width is under the
 * minimum passable one: shrinking a door below its own floor does not solve the
 * conflict, it relocates it into `W_DOOR_CLEARANCE`.
 */
export const swingObstructed: LintRule = {
  name: "swing-obstructed",
  check({ doors, furniture, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const swings: Array<{ d: RDoor; s: DoorSwing }> = [];
    for (const d of doors) {
      const s = doorSwing(d);
      if (s) swings.push({ d, s });
    }
    const clr = rules.swingClearanceMm;
    const min = rules.minDoorWidthMm;
    for (let i = 0; i < swings.length; i++) {
      const { d, s } = swings[i]!;
      /** Measured cause + the widest leaf that would still clear it. */
      let cause: { text: string; widest: number } | null = null;
      const hit = furniture.find((f) => sectorIntersectsRect(s, rectOf(f), clr));
      if (hit) {
        const need = s.radius + clr;
        const reach = distPointToRect(s.hinge, rectOf(hit));
        const gn = hit.label ?? hit.category;
        cause = {
          text: `the swing needs ${mm(need)} mm of clear radius but "${gn}" is ${mm(reach)} mm from the hinge (${mm(shortfall(need, reach))} mm short)`,
          widest: reach - clr,
        };
      } else {
        // Pairwise, and only against LATER doors — one warning per colliding pair, on
        // the earlier door. (Unchanged: the raise set must stay exactly what it was.)
        for (let j = i + 1; j < swings.length; j++) {
          const o = swings[j]!;
          if (!swingsCollide(s, o.s, clr)) continue;
          const gap = Math.hypot(s.hinge.x - o.s.hinge.x, s.hinge.y - o.s.hinge.y);
          const need = s.radius + o.s.radius + clr;
          cause = {
            text: `door "${o.d.id}"'s swing overlaps it — the hinges are ${mm(gap)} mm apart where the two leaves need ${mm(need)} mm (${mm(shortfall(need, gap))} mm short)`,
            widest: gap - o.s.radius - clr,
          };
          break;
        }
      }
      if (!cause) continue;
      const flipped = d.hinge === "left" ? "right" : "left";
      const alt = doorSwing({ ...d, hinge: flipped });
      // Applicable only if the OTHER jamb is provably clear of every piece and every
      // other door's swing — including doors earlier in the list, which this rule does
      // not warn about but which a flip could newly collide with.
      const flipClears =
        alt !== null &&
        !furniture.some((f) => sectorIntersectsRect(alt, rectOf(f), clr)) &&
        swings.every((o) => o.d === d || !swingsCollide(alt, o.s, clr));
      const narrowTo = Math.max(0, Math.floor(cause.widest));
      out.push({
        severity: "warning",
        code: "W_SWING_OBSTRUCTED",
        ...at(d),
        message: `Door swing is obstructed — ${cause.text}.`,
        hints: [
          `Hang the leaf on the other jamb — \`hinge ${flipped}\`${flipClears ? " (this clears it)" : ""}.`,
          `Open it to the other side of the wall — \`swing ${d.swing === "in" ? "out" : "in"}\`.`,
          `Move the door along its wall (\`on <wall> at <pos>\`), or the obstruction — \`arch repair\` computes the smallest clearing shift.`,
          narrowTo >= min
            ? `Narrow the door to ${mm(narrowTo)} mm or less, which still clears the ${min} mm minimum.`
            : `Narrowing the door is not a fix here — the leaf would have to drop to ${mm(narrowTo)} mm, under the ${min} mm minimum passable width.`,
          "If no leaf is wanted here, make it a leafless `opening` instead.",
        ],
        ...(flipClears ? fixesFrom(doorHingeFlipFix(d, flipped)) : {}),
      });
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
        const br = rectOf(blocker);
        // The host is orthogonal (a landing exists at all only then — see
        // `doorLandingRect`), so the approach runs across the wall on one axis.
        const horiz = d.host!.a.y === d.host!.b.y;
        const gap = horiz
          ? approachGapMm(d.at.y, br.y, br.y + br.h, depth)
          : approachGapMm(d.at.x, br.x, br.x + br.w, depth);
        const short = shortfall(depth, gap);
        out.push({
          severity: "warning",
          code: "W_DOORWAY_BLOCKED",
          ...at(d),
          message: `Doorway is blocked — the approach needs ${mm(depth)} mm clear on each side but "${gn}" leaves ${mm(gap)} mm (${mm(short)} mm short).`,
          hints: [
            `Move "${gn}" ${mm(short)} mm clear of the opening — \`arch repair\` computes the smallest clearing shift.`,
            `Or shrink it by ${mm(short)} mm on the axis facing the door, so it stops ${mm(depth)} mm short of the opening.`,
            `Or move the door along its wall (\`on <wall> at <pos>\`) so its landing misses "${gn}".`,
          ],
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
          ...at(d),
          message: `Door is ${d.width} mm wide (under the ${rules.minDoorWidthMm} mm minimum nominal width).`,
          hints: [`Widen it to at least ${rules.minDoorWidthMm} mm.`],
        });
      }
    }
    return out;
  },
};
