/**
 * Door rules: obstructed swing arcs, blocked walk-through landings, and
 * sub-passable widths — in that (pinned) order via `rules/index.ts`.
 */

import { rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorHingeFlipFix, fixesFrom, pocketRunFix } from "../../fix-producers.js";
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
          // P1-5 deleted "or use a sliding door" from this hint set, and was right to:
          // the language could not write one, so the remedy named a door that did not
          // exist. v1.25 makes it expressible, so the remedy comes back — but named
          // by the property that solves THIS warning (a panel that sweeps nothing)
          // and by statements the author can paste, not as a vague suggestion.
          "Or hang no swinging leaf at all — a `sliding`, `pocket` or `barn` door sweeps nothing, so this warning cannot apply to it (`door pocket on <wall> at <pos> width <mm>`).",
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

/**
 * A `pocket` door with nowhere for its panel to go.
 *
 * The panel disappears into a cavity inside the host wall, so the wall must continue
 * past the slide-side jamb by at least the door's own width plus end clearance. The run
 * is measured from that jamb, along the slide direction, to the end of the HOST SEGMENT
 * (a panel does not turn a corner) — and is then truncated at the near edge of any other
 * opening that falls inside it, because a panel cannot slide through a window either.
 * That truncation is the one thing this rule does that the reference it is modelled on
 * (planscript-rust `pocket_door_wall_run`, which counts wall length alone) does not.
 *
 * The threshold is `width + max(pocketRunClearanceMm, width × 5%)` — a deliberate
 * divergence from that reference's flat `×1.05`; the reasoning is written down beside
 * `pocketRunClearanceMm` in the ruleset and in the catalog entry, not left as drift.
 *
 * Of the four remedies only ONE is carried as a machine-applicable fix — reversing the
 * slide, and only after the reversed run is recomputed and proved to satisfy. "Narrow
 * it" is a hint on principle, never a fix: rewriting the author's stated width to
 * satisfy the checker is constraint laundering, and it would walk into
 * `W_DOOR_CLEARANCE` besides.
 *
 * Skipped on a curved host — a straight cavity has no meaning there, and the resolver
 * has already refused that plan with `E_DOOR_KIND_CURVED`.
 */
export const pocketRun: LintRule = {
  name: "pocket-run",
  check({ doors, ir, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of doors) {
      if (d.doorKind !== "pocket") continue;
      const seg = d.host;
      if (!seg || seg.arc) continue;
      const wall = ir.walls.find((w) => w.id === seg.wallId);
      const openings = wall ? wall.openings : [];
      const need = d.width + Math.max(rules.pocketRunClearanceMm, d.width * POCKET_RUN_RATIO);
      const side = d.slide ?? "left";
      const have = pocketRunMm(d, seg, openings, side);
      if (have >= need) continue;
      // Only offer the reverse when it is PROVED to work — never as a guess.
      const reversed = side === "left" ? "right" : "left";
      const reverseFits = pocketRunMm(d, seg, openings, reversed) >= need;
      out.push({
        severity: "warning",
        code: "W_POCKET_RUN",
        ...at(d),
        message: `Pocket door has nowhere to slide — it needs ${mm(need)} mm of clear wall past the ${side} jamb but only ${mm(have)} mm is available on wall "${seg.wallId}" (${mm(shortfall(need, have))} mm short).`,
        hints: [
          `Slide it the other way — \`slide ${reversed}\`${reverseFits ? " (that run is long enough)" : " — though that run is no longer"}.`,
          "Or move the door along its wall (`on <wall> at <pos>`) so the pocket lands on solid wall.",
          "Or lengthen the wall past the jamb by the shortfall.",
          "Narrowing the door is not offered as a fix: it rewrites the width you asked for to satisfy the check, and would head toward `W_DOOR_CLEARANCE`.",
        ],
        ...(reverseFits ? fixesFrom(pocketRunFix(d, reversed)) : {}),
      });
    }
    return out;
  },
};

/** The ratio limb of the pocket-door end clearance — the reference's own constant. */
const POCKET_RUN_RATIO = 0.05;

/**
 * Clear wall (mm) a pocket panel has to slide into: from the `side` jamb, along the
 * host segment, to whichever comes first — the end of the segment, or the near edge of
 * another opening on the same wall. Never negative.
 *
 * Signed-projection arithmetic along the wall direction, so it is orientation-agnostic:
 * ArchLang's y-down convention (the reference is y-up) inverts nothing here, and none of
 * that project's handed outside-normal machinery is needed, because a slide direction is
 * defined along traversal — exactly as `hinge` is — not against an outward face.
 */
function pocketRunMm(
  d: RDoor,
  seg: { a: { x: number; y: number }; b: { x: number; y: number }; thickness: number },
  openings: ReadonlyArray<{ at: { x: number; y: number }; width: number }>,
  side: "left" | "right",
): number {
  const vx = seg.b.x - seg.a.x;
  const vy = seg.b.y - seg.a.y;
  const len = Math.hypot(vx, vy);
  if (len === 0) return 0;
  const ux = vx / len;
  const uy = vy / len;
  // +1 slides toward the segment's end, -1 toward its start — the same reading of
  // `left`/`right` the renderer and `hinge` use.
  const sd = side === "right" ? 1 : -1;
  const jx = d.at.x + ux * sd * (d.width / 2);
  const jy = d.at.y + uy * sd * (d.width / 2);
  const reach = (px: number, py: number): number => ((px - jx) * ux + (py - jy) * uy) * sd;
  let run = Math.max(0, sd > 0 ? reach(seg.b.x, seg.b.y) : reach(seg.a.x, seg.a.y));
  for (const o of openings) {
    // The door itself, and anything on a different segment of the same polyline.
    const perp = Math.abs((o.at.x - seg.a.x) * uy - (o.at.y - seg.a.y) * ux);
    if (perp > Math.max(seg.thickness, 1)) continue;
    const near = reach(o.at.x, o.at.y) - o.width / 2;
    if (near <= 0) continue; // behind the jamb, or the door's own opening
    run = Math.min(run, near);
  }
  return Math.max(0, run);
}

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
