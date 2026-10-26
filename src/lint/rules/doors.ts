/**
 * Door rules: obstructed swing arcs, blocked walk-through landings,
 * sub-passable widths, a pocket panel with nowhere to go, and a jamb that leaves
 * too little wall at a corner — in that (pinned) order via `rules/index.ts`.
 */

import { isDerivedWall } from "../../wall-ref.js";
import { openingName, wallNamed, wallPhrase } from "../element-phrases.js";
import { relationText } from "../../opening-relation.js";
import { det } from "../../algebra/d4.js";
import { CLI_NAME } from "../../command-name.js";
import {
  type AccessEdge,
  connectorClearWidth,
  DEFAULT_CLEAR_ALLOWANCE_MM,
  EXTERIOR_NODE,
  pointInRoomBox,
  rectOf,
} from "../../analyze.js";
import type { Point } from "../../ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorHingeFlipFix, fixesFrom, pocketRunFix } from "../../fix-producers.js";
import {
  doorSwing,
  sectorIntersectsRect,
  swingsCollide,
  swingsCollideAsIndependent,
  type DoorLike,
  type DoorSwing,
  type WallSegment,
} from "../../geometry.js";
import { arcOpeningVoid } from "../../geometry/arc-band.js";
import { type Arc, arcLength, arcTangentAt } from "../../geometry/arc.js";
import { doorLandingRect, rectsOverlap } from "../../geometry/rect.js";
import type { RDoor } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";
import { approachGapMm, deficitMm, distPointToRect, mm, shortfall } from "../measure.js";

/**
 * A door whose swing arc is blocked by furniture or another door's swing.
 *
 * The message states the clear radius the swing needs, what it actually has, and the
 * shortfall ({@link deficitMm}: rounded so the three numbers agree); the hints enumerate the
 * closed remedy set. Only the hinge flip is carried as a machine-applicable
 * {@link doorHingeFlipFix} — and only when the flipped swing is recomputed and proved clear
 * of everything. The "narrow the door" remedy is held to the same proof: it quotes the widest
 * narrower leaf whose recomputed swing (hinge moved, since narrowing keeps `at`) is clear of
 * everything ({@link widestClearingWidth}), **refuses itself** when that width is under the
 * narrowest one the ruleset passes ({@link passableDoorWidthMm}: shrinking a door below that
 * does not solve the conflict, it relocates it into `W_DOOR_CLEARANCE` or
 * `W_PATH_TOO_NARROW`), and is left out when no narrower leaf clears.
 */
export const swingObstructed: LintRule = {
  name: "swing-obstructed",
  family: "doors",
  layer: "validity",
  stage: "openings",
  codes: ["W_SWING_OBSTRUCTED"],
  check(ctx: LintContext): Diagnostic[] {
    const { ir, doors, furniture, rules, at, frameOf } = ctx;
    const out: Diagnostic[] = [];
    const swings: Array<{ d: RDoor; s: DoorSwing }> = [];
    for (const d of doors) {
      const s = doorSwing(d);
      if (s) swings.push({ d, s });
    }
    const clr = rules.swingClearanceMm;
    const min = passableDoorWidthMm(rules);
    for (let i = 0; i < swings.length; i++) {
      const { d, s } = swings[i]!;
      /** The measured cause, as prose. */
      let cause: string | null = null;
      /** The other door whose swing is the cause, for the hint: its id is nowhere in the message. */
      let otherDoor: RDoor | null = null;
      const hit = furniture.find((f) => sectorIntersectsRect(s, rectOf(f), clr));
      if (hit) {
        const m = deficitMm(s.radius + clr, distPointToRect(s.hinge, rectOf(hit)));
        const gn = hit.label ?? hit.category;
        cause = `the swing needs ${m.required} mm of clear radius but "${gn}" is ${m.available} mm from the hinge (${m.short} mm short)`;
      } else {
        // Pairwise, and only against LATER doors — one warning per colliding pair, on
        // the earlier door. (Unchanged: the raise set must stay exactly what it was.)
        for (let j = i + 1; j < swings.length; j++) {
          const o = swings[j]!;
          if (!swingsCollide(s, o.s, clr)) continue;
          const gap = Math.hypot(s.hinge.x - o.s.hinge.x, s.hinge.y - o.s.hinge.y);
          const m = deficitMm(s.radius + o.s.radius + clr, gap);
          otherDoor = o.d;
          cause = `the swing of ${openingName(ctx, o.d)} overlaps it — the hinges are ${m.available} mm apart where the two leaves need ${m.required} mm (${m.short} mm short)`;
          break;
        }
      }
      if (!cause) continue;
      /** Is this swing provably clear of every piece and every OTHER door's swing —
       *  including doors earlier in the list, which this rule does not warn about but
       *  which a remedy could newly collide with? The one proof every quoted remedy
       *  (the hinge flip, the narrowed width) is held to. A narrowed leaf is read as an
       *  independent door ({@link swingsCollideAsIndependent}): it has left any latch it
       *  shared, and a double door it would form with a third door at one exact width is a
       *  coincidence the bisection must not land on. */
      const clearOf =
        (collide: typeof swingsCollide) =>
        (sw: DoorSwing | null): boolean =>
          sw !== null &&
          !furniture.some((f) => sectorIntersectsRect(sw, rectOf(f), clr)) &&
          swings.every((o) => o.d === d || !collide(sw, o.s, clr));
      const flipped = d.hinge === "left" ? "right" : "left";
      const flipClears = clearOf(swingsCollide)(doorSwing({ ...d, hinge: flipped }));
      const narrowTo = widestClearingWidth(d, ir.grid, clearOf(swingsCollideAsIndependent));
      // The swing as WRITTEN: `door.transform` flips `swing` under a reflecting frame, so a
      // mirrored instance's plan-space swing is the opposite of its source clause.
      const g = frameOf(d);
      const writtenSwing = g !== null && det(g) < 0 ? (d.swing === "in" ? "out" : "in") : d.swing;
      out.push({
        severity: "warning",
        code: "W_SWING_OBSTRUCTED",
        ...at(d),
        message: `Door swing is obstructed — ${cause}.`,
        hints: [
          `Hang the leaf on the other jamb — \`hinge ${flipped}\`${flipClears ? " (this clears it)" : ""}.`,
          `Open it to the other side of the wall — \`swing ${writtenSwing === "in" ? "out" : "in"}\`.`,
          `Move the door along its wall (\`on <wall> at <pos>\`), or the obstruction — \`${CLI_NAME} repair\` computes the smallest clearing shift.`,
          // Only a width strictly under the door's own, recomputed and proved clear, is
          // quoted; with no such width (not even 1 mm) the hint is left out.
          ...(narrowTo === null
            ? []
            : [
                narrowTo >= min
                  ? `Narrow the door to ${mm(narrowTo)} mm or less, which still clears the ${mm(min)} mm minimum.`
                  : `Narrowing the door is not a fix here — the leaf would have to drop to ${mm(narrowTo)} mm, under the ${mm(min)} mm minimum passable width.`,
              ]),
          // The remedy is named by the property that solves THIS warning (a panel that sweeps nothing)
          // and by statements the author can paste, not as a vague suggestion.
          "Or hang no swinging leaf at all — a `sliding`, `pocket` or `barn` door sweeps nothing, so this warning cannot apply to it (`door pocket on <wall> at <pos> width <mm>`).",
          "If no leaf is wanted here, make it a leafless `opening` instead.",
          // The other door is named in the message by the rooms it joins; two doors between the
          // same rooms are told apart here, by id.
          ...(otherDoor === null ? [] : [`The door whose swing it meets is \`${otherDoor.id}\`.`]),
        ],
        ...(flipClears ? fixesFrom(doorHingeFlipFix(d, flipped)) : {}),
      });
    }
    return out;
  },
};

/**
 * The narrowest whole-mm door width the active ruleset passes: it raises neither
 * `W_DOOR_CLEARANCE` (nominal width under `minDoorWidthMm`) nor, as a route's pinch,
 * `W_PATH_TOO_NARROW` (clear width under `minPathClearWidthMm`). The clear width comes from
 * {@link connectorClearWidth} with the allowance the lint's access graph uses, the one
 * deduction every circulation bottleneck is measured with, so the narrowing hint can never
 * trade `W_SWING_OBSTRUCTED` for either. (Default ruleset: 760 mm; `accessibility-advisory`:
 * 960 mm.) Clear width grows with the nominal one, so the upward scan ends.
 */
export function passableDoorWidthMm(rules: LintContext["rules"]): number {
  const passes = (w: number): boolean =>
    w >= rules.minDoorWidthMm &&
    connectorClearWidth("door", w, DEFAULT_CLEAR_ALLOWANCE_MM) >= rules.minPathClearWidthMm;
  let w = Math.max(1, Math.ceil(rules.minDoorWidthMm));
  while (!passes(w)) w++;
  return w;
}

/**
 * The widest leaf strictly narrower than `d`'s own whose RECOMPUTED swing `clears` proves
 * clear, or `null` when no narrower leaf would.
 *
 * Only widths the author can actually get are candidates: on a `grid` the resolver snaps a
 * door's width to the module (`door.ts`), so a quoted 849 mm on `grid 50` would resolve to
 * 850 and not clear; the candidates are the grid's multiples (whole millimetres without
 * one). Narrowing keeps the door's `at`, so the hinge moves toward it by half the change;
 * the recomputed `doorSwing` accounts for that exactly, where `gap − radius − clearance` did
 * not. A narrower leaf's quarter-disc lies inside the wider one's (the radius shrinks by Δ
 * while the hinge moves Δ/2 along the closed leaf, and the cone's vectors sum inside the
 * cone), and so does its disc grown by the swing clearance (radius `r − Δ + c` about a hinge
 * Δ/2 away, inside `r + c`). {@link swingsCollideAsIndependent} decides exactly on those
 * shapes, so a leaf nested in one clear of every other swing is clear of them too: being
 * clear is monotone in the width and a bisection finds the widest (`test/swing-exact.test.ts`
 * checks it against every width). That is why the caller does not grant the double-door
 * exemption here: with it, a narrowed leaf that happens to share a latch with a third door
 * is clear at that one width while the widths around it collide, and the bisection could
 * quote it. (The furniture half, `sectorIntersectsRect`, is a conservative heuristic, not an
 * exact test; this argument does not cover it.) The width returned is one that was TESTED,
 * never an extrapolation, and every narrower one is nested inside it — which is what the
 * hint's "or less" rests on.
 */
export function widestClearingWidth(
  d: DoorLike,
  grid: number,
  clears: (s: DoorSwing | null) => boolean,
): number | null {
  const step = grid > 0 ? grid : 1;
  const ok = (k: number): boolean => clears(doorSwing({ ...d, width: k * step }));
  let lo = 1;
  let hi = Math.ceil(d.width / step) - 1;
  if (hi < lo || !ok(lo)) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo * step;
}

/** Furniture parked in a door's straight approach (the clear landing on each side of
 *  the opening), so you can't pass through even with the leaf open. Distinct from the
 *  swing arc above — this is the walk-through path, the thing that piles fixtures at a
 *  bathroom door. Built as an AABB straddling the opening on orthogonal host walls. */
export const doorwayBlocked: LintRule = {
  name: "doorway-blocked",
  family: "doors",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_DOORWAY_BLOCKED"],
  check({ doors, furniture, rules, at, skip }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of doors) {
      const depth = rules.doorwayLandingMm;
      const landing = doorLandingRect(d, depth);
      if (!landing) {
        // No host (`W_DOOR_OFF_WALL`'s report), or an angled or curved host: not measured.
        if (d.host) skip("unsupported-host-geometry");
        continue;
      }
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
            `Move "${gn}" ${mm(short)} mm clear of the opening — \`${CLI_NAME} repair\` computes the smallest clearing shift.`,
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
  family: "doors",
  layer: "validity",
  stage: "openings",
  codes: ["W_POCKET_RUN"],
  check(ctx: LintContext): Diagnostic[] {
    const { doors, ir, rules, at, skip } = ctx;
    const out: Diagnostic[] = [];
    for (const d of doors) {
      if (d.doorKind !== "pocket") continue;
      const seg = d.host;
      if (!seg) continue;
      if (seg.arc) {
        skip("unsupported-host-geometry");
        continue;
      }
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
        message: `Pocket door has nowhere to slide — it needs ${mm(need)} mm of clear wall past the ${side} jamb but only ${mm(have)} mm is available on ${wallNamed(ctx, seg)} (${mm(shortfall(need, have))} mm short).`,
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
  family: "doors",
  layer: "validity",
  stage: "openings",
  codes: ["W_DOOR_CLEARANCE"],
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

/**
 * A door whose jamb leaves less wall between it and a **corner** than the wall is thick.
 *
 * The drawing is not wrong — the nib is drawn and mitred into the neighbouring run. What
 * is wrong is the plan: at page scale a sliver of wall shorter than the wall's own
 * thickness stops reading as *wall continuing to the corner* and starts reading as a
 * chamfer on the corner, which is easy to mis-diagnose as a rendering defect when it is
 * the geometry the author asked for (ADR 0018).
 *
 * ## Why the threshold is the wall's own thickness
 *
 * The wall's thickness is the only length in the drawing intrinsic to the wall being
 * measured, so a rule stated in it needs no new absolute constant and is scale-free — a
 * 100 mm partition asks for a 100 mm nib and a 400 mm shell asks for 400. It is also the
 * dimension the defect is *about*: a piece of wall whose length along the run is under
 * its own across-run depth is drawn deeper than it is long, and the mitre at the corner
 * removes material from its outer face on top of that. Architecturally it is the same
 * line: the returned face of such a nib has nowhere to carry the frame and architrave a
 * door jamb is fixed to. The reference probe lands where the framing says it should — a 227 mm nib on a 250 mm wall, 23 mm short.
 *
 * {@link LintRuleset.minCornerNibRatio} scales it for a project that wants to be stricter
 * or laxer; it is one-limbed on purpose. `W_POCKET_RUN` needs its second, absolute limb
 * because it compares a wall run against the DOOR's width, which can be small enough to
 * make a pure ratio meaningless. Here both sides of the comparison belong to the same
 * wall, so there is no narrow-door pathology to guard and a second constant would be
 * invented rather than evidenced.
 *
 * ## What counts as a corner
 *
 * The host segment's run has to **end** at that point and the wall has to **go somewhere
 * else** from it. So: some other segment (this wall's next edge, or a separate wall
 * meeting it) leaves the point, and none leaves it within {@link COLLINEAR_TURN_RAD} of
 * straight on. That excludes the three shapes that are not corners and would otherwise be
 * false positives — a wall's free END (nothing to mitre into; a stub at a wall's end is a
 * different shape and, if it is worth a rule, a different rule), a redundant COLLINEAR
 * vertex, and a **tangent** arc/straight junction, where the curve hands over to the
 * straight run with no turn at all and the material simply continues. A partition teeing
 * into a wall that carries straight past it is likewise not a corner, for the same reason:
 * nothing is mitred, so nothing reads as a chamfer.
 *
 * ## On a curve
 *
 * The remaining wall is an **arc length, not a chord**, and the jambs are **radial** — so
 * the along-run coordinate comes from {@link arcOpeningVoid}, which is built on
 * `arcAngleOffset`, the one rule in the codebase for "how far round is this?". Nothing
 * tessellates: the arc's facet count is a rendering decision and a measurement must not
 * move with it (the same reason a circular room's area is exact `piR^2`). The nib is
 * quoted at the wall's **centreline** radius — the datum the straight case projects onto
 * and the one `at <pos>` walks — so a concave nib is a little shorter at its inner face
 * and a convex one a little longer.
 *
 * Kind-independent: a jamb is a jamb, whether the leaf swings, slides, folds or parks
 * overhead. No machine-applicable fix is offered — every remedy rewrites a number the
 * author chose (the door's position, the wall's extent, the leaf's width), and there is no
 * second reading of the plan that satisfies the check without changing the design.
 * Deliberately scoped to doors: a window nib is a different
 * detail with no frame to hang, and widening this rule to openings needs its own evidence.
 */
export const doorNearCorner: LintRule = {
  name: "door-near-corner",
  family: "doors",
  layer: "validity",
  stage: "openings",
  codes: ["W_DOOR_NEAR_CORNER"],
  check({ ir, doors, wallSegs, rules, at }: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const d of doors) {
      const seg = d.host;
      if (!seg) continue;
      const need = seg.thickness * rules.minCornerNibRatio;
      const worst = tightestCorner(d, seg, wallSegs, need);
      if (!worst) continue;
      const short = shortfall(need, worst.have);
      out.push({
        severity: "warning",
        code: "W_DOOR_NEAR_CORNER",
        ...at(d),
        message:
          `Door leaves too little wall at a corner — the nib between its jamb and the corner at ` +
          `(${mm(worst.corner.x)}, ${mm(worst.corner.y)}) of ${wallPhrase(seg)} should be at least ` +
          `${mm(need)} mm, the wall's own thickness, but measures ${mm(worst.have)} mm ` +
          `(${mm(short)} mm short).`,
        hints: [
          d._relation
            ? `Move the door ${mm(short)} mm further from that corner along the wall: the position in \`${relationText(d._relation)}\` is the one number to change.`
            : isDerivedWall(ir.walls, seg)
              ? `Move the door ${mm(short)} mm further from that corner along the wall: its \`at (x,y)\` is the one position to change.`
              : `Move the door ${mm(short)} mm further from that corner — \`on ${seg.wallId} at <pos>\` measures along the run, so the position is the one number to change.`,
          isDerivedWall(ir.walls, seg)
            ? "Or move the rooms so the corner moves away from the jamb: the wall is derived from them."
            : `Or lengthen wall "${seg.wallId}" past the door, so the corner moves away from the jamb instead.`,
          "Narrowing the leaf would also close the gap and is deliberately NOT offered as a fix: rewriting the width you asked for to satisfy a checker is constraint laundering, and it heads toward `W_DOOR_CLEARANCE`.",
        ],
      });
    }
    return out;
  },
};

/**
 * The tightest CORNER end of a door's host run whose nib is under `need` (the one
 * `W_DOOR_NEAR_CORNER` reports), or null when that rule is silent for the door. Exported so
 * `W_OPENING_AT_JUNCTION` defers to this rule by the same test, never a restatement of it.
 */
export function tightestCorner(
  d: Pick<RDoor, "at" | "width">,
  seg: WallSegment,
  wallSegs: readonly WallSegment[],
  need: number,
): { have: number; corner: Point } | null {
  const runs = jambRuns(d, seg);
  if (!runs || !(need > 0)) return null;
  let worst: { have: number; corner: Point } | null = null;
  for (const end of ["a", "b"] as const) {
    const have = Math.max(0, end === "a" ? runs.toA : runs.toB);
    if (have >= need) continue;
    if (!isCorner(seg, end, wallSegs)) continue;
    if (!worst || have < worst.have) worst = { have, corner: seg[end] };
  }
  return worst;
}

/**
 * Below this turn two runs are one straight wall. 5 degrees — at a wall's half-thickness
 * the mitre then moves the outer face by `h*tan(theta/2)`, i.e. 5.5 mm on a 250 mm wall,
 * which is nothing at page scale — and it comfortably absorbs the float residue in an
 * arc's tangent, so a curve that hands over to a straight run smoothly reads as smooth.
 */
const COLLINEAR_TURN_RAD = (5 * Math.PI) / 180;

/**
 * Along-run distance (mm) from each of a door's jambs to the two ends of its host
 * segment — arc length on a curve, projection on a straight run. `null` when the door is
 * not on this segment at all (a degenerate run, or an `at (x,y)` door off its own wall,
 * which `W_DOOR_OFF_WALL` owns).
 *
 * A negative result means the opening runs PAST that end; the caller floors it at zero,
 * so the warning reports the nib that exists rather than a negative length.
 */
export function jambRuns(d: Pick<RDoor, "at" | "width">, seg: WallSegment): { toA: number; toB: number } | null {
  if (seg.arc) {
    // `arcOpeningVoid` is the single existing answer for where an opening lands along a
    // curve — the same one the curved band measurement uses — so the jamb positions here
    // cannot disagree with the ones the drawing cuts.
    const span = arcOpeningVoid(seg.arc, d.at, d.width, seg.thickness);
    if (!span) return null;
    return { toA: span[0], toB: arcLength(seg.arc) - span[1] };
  }
  const vx = seg.b.x - seg.a.x;
  const vy = seg.b.y - seg.a.y;
  const len = Math.hypot(vx, vy);
  if (!(len > 0)) return null;
  const u = ((d.at.x - seg.a.x) * vx + (d.at.y - seg.a.y) * vy) / len;
  return { toA: u - d.width / 2, toB: len - u - d.width / 2 };
}

/** Unit tangent at one end of a segment, pointing INTO it. Arc-aware. */
function tangentInto(seg: { a: Point; b: Point; arc?: Arc }, end: "a" | "b"): Point | null {
  if (seg.arc) {
    const t = arcTangentAt(seg.arc, seg.arc[end]);
    return end === "a" ? t : { x: -t.x, y: -t.y };
  }
  const vx = seg.b.x - seg.a.x;
  const vy = seg.b.y - seg.a.y;
  const l = Math.hypot(vx, vy);
  if (!(l > 0)) return null;
  const s = end === "a" ? 1 : -1;
  return { x: (s * vx) / l, y: (s * vy) / l };
}

/** Unsigned angle (rad) between two unit vectors, via `atan2` so it stays exact near 0. */
const angleBetween = (u: Point, v: Point): number => Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y));

/**
 * Does the wall TURN at this end of `seg` — i.e. does its run stop here and set off in
 * another direction?
 *
 * True only when at least one other segment leaves the point and NONE leaves it straight
 * on. A run that carries straight through (a collinear vertex, a tangent arc/straight
 * hand-over, or a partition teeing into a wall that continues) is not a corner however
 * many other segments meet there — nothing is mitred, so nothing reads as a chamfer. A
 * free end with no neighbour at all is not a corner either.
 *
 * Two ends count as meeting when they are within half a wall thickness of each other:
 * that is close enough that the two solids overlap and the joinery draws one corner, so
 * the test matches what a reader sees rather than demanding byte-equal coordinates.
 */
export function isCorner(seg: WallSegment, end: "a" | "b", all: readonly WallSegment[]): boolean {
  const into = tangentInto(seg, end);
  if (!into) return false;
  const p = seg[end];
  // The direction a run continuing straight on would leave `p` in.
  const straight = { x: -into.x, y: -into.y };
  const tol = Math.max(1, seg.thickness / 2);
  let turns = false;
  for (const s of all) {
    if (s.wallId === seg.wallId && s.index === seg.index) continue;
    for (const oe of ["a", "b"] as const) {
      if (Math.hypot(s[oe].x - p.x, s[oe].y - p.y) > tol) continue;
      const away = tangentInto(s, oe);
      if (!away) continue;
      if (angleBetween(away, straight) <= COLLINEAR_TURN_RAD) return false; // the wall carries on
      turns = true;
    }
  }
  return turns;
}

/**
 * Door–door interference (plan-soundness PS2.11d): a hinged door whose OPEN leaf, parked where
 * it is drawn (hinge to the fully open tip, `doorSwing`'s `hinge`→`leafEnd`), stands across
 * another door's approach in the room the two share, so one door must be shut to use the
 * other (the first-contact audits' A1, K4, NH5, RA6).
 *
 * The approach is the other door's opening span (jamb to jamb) by `doorwayLandingMm` (300; 450
 * under `accessibility-advisory`) into the room, measured from the FACE of its host wall on the
 * side the leaf is on. That is the depth `W_DOORWAY_BLOCKED` keeps clear, but not its datum:
 * `doorLandingRect` (`src/geometry/rect.ts`) measures its landing from the wall's CENTRELINE.
 * Read from the centreline, the audits' A1 and NH5 (a leaf 250 mm in front of a 100 mm wall's
 * face) would sit exactly on the zone's edge; a person standing in a doorway stands past the
 * face, so the face is the datum here (card PS2.54 unifies the two). The leaf's run inside that zone casts a shadow on the span; what is left is
 * the longest stretch of the span the leaf does not cover. The rule fires when that is under
 * `min(the other door's width, minDoorWidthMm)`: the leaf leaves less of the doorway free than
 * a passable door (or, for a door already narrower than that, any less than its own width). A
 * leaf parked flat against the wall beside a doorway, or standing on its jamb line, covers none
 * of it. Both doors must open onto the room the leaf parks in (the access graph's `between`,
 * the mid-point of the leaf's run in the zone on that room's floor), so a leaf behind a
 * partition never counts.
 *
 * Not `W_SWING_OBSTRUCTED`: that rule compares the two leaves' swept quarter-discs, and a pair
 * whose swings collide is its report, never this one's. This one compares the parked leaf with
 * the other doorway's approach, which no swing test sees (a sliding or pocket door has no
 * swing and still has a doorway). Both doors' hosts must be orthogonal (the zone is axis-aligned,
 * as `W_DOORWAY_BLOCKED`'s landing is): neither a leaf from a door on an angled or curved wall
 * nor an approach to one is measured, and `W_DOORWAY_BLOCKED` already files the coverage skip
 * for such doors. Leaf-less openings are not
 * judged (PS2.11e extends `W_DOORWAY_BLOCKED` to them). No fix: which door moves, or which way
 * a leaf turns, is a design decision (ADR 0005).
 */
export const leafAcrossDoorway: LintRule = {
  name: "leaf-across-doorway",
  family: "doors",
  layer: "validity",
  stage: "openings",
  codes: ["W_LEAF_ACROSS_DOORWAY"],
  check(ctx: LintContext): Diagnostic[] {
    const { doors, rules, rooms, roomRects, at } = ctx;
    const swings: Array<{ d: RDoor; s: DoorSwing }> = [];
    for (const d of doors) {
      const s = doorSwing(d);
      if (s) swings.push({ d, s });
    }
    if (swings.length === 0 || doors.length < 2) return [];
    const edgeOf = new Map(ctx.access().edges.map((e) => [e.doorId, e] as const));
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const depth = rules.doorwayLandingMm;
    const out: Diagnostic[] = [];
    for (const { d: a, s: sa } of swings) {
      const ea = edgeOf.get(a.id);
      if (!ea || !orthogonalHost(a)) continue;
      for (const b of doors) {
        if (b === a) continue;
        const eb = edgeOf.get(b.id);
        if (!eb) continue;
        const sb = doorSwing(b);
        if (sb && swingsCollide(sa, sb, rules.swingClearanceMm)) continue;
        const hit = leafOverApproach(sa, b, depth);
        if (!hit) continue;
        const need = Math.min(b.width, rules.minDoorWidthMm);
        if (hit.free >= need) continue;
        const shared = ea.between.find((id) => {
          const box = roomRects.get(id);
          return id !== EXTERIOR_NODE && eb.between.includes(id) && box !== undefined && pointInRoomBox(hit.mid, box);
        });
        const room = shared === undefined ? undefined : roomById.get(shared);
        if (room === undefined) continue;
        // A message names the room by what it is; a hint by its quoted label or id.
        const to = (e: AccessEdge, forHint = false): string => {
          const other = e.between[0] === room.id ? e.between[1] : e.between[0];
          const r = roomById.get(other);
          if (r === undefined) return "the door from outside";
          return `the door to ${forHint ? `"${ctx.labelOf(r)}"` : ctx.nameOf(r)}`;
        };
        // Does the leaf hung on its other jamb (same side of the wall) still stand in this
        // doorway's approach? Recomputed, never assumed.
        const flipped = doorSwing({ ...a, hinge: a.hinge === "left" ? "right" : "left" });
        const flipHit = flipped ? leafOverApproach(flipped, b, depth) : null;
        const flipClears = flipped !== null && (flipHit === null || flipHit.free >= need);
        // A door is quoted by id only when the author wrote one (ADR 0029 §6): an assigned id
        // renumbers the moment an earlier door is named. Otherwise by the rooms it joins.
        // Two doors from the same room to the same place read alike; the second is "the other".
        const toA = to(ea);
        const toB = to(eb) === toA ? toA.replace(/^the door/, "the other door") : to(eb);
        const toAh = to(ea, true);
        const toBh = to(eb, true) === toAh ? toAh.replace(/^the door/, "the other door") : to(eb, true);
        const refA = a._idAuthored === true ? `door "${a.id}"` : toAh;
        const refB = b._idAuthored === true ? `door "${b.id}"` : toBh;
        out.push({
          severity: "warning",
          code: "W_LEAF_ACROSS_DOORWAY",
          ...at(a),
          message:
            `In ${ctx.nameOf(room)}, the open leaf of ${toA} parks ${mm(hit.depth)} mm in front of ${toB} ` +
            `and leaves ${mm(hit.free)} mm of its ${mm(b.width)} mm doorway clear (${mm(need)} mm needed), ` +
            "so one door must be shut to use the other.",
          hints: [
            `Hang ${refA} on its other jamb (flip its \`hinge\`)${flipClears ? ", which parks the leaf clear of this doorway" : ""}, or open it to the other side of its wall (flip its \`swing\`).`,
            `Or move ${refA} or ${refB} along its wall until the open leaf stands at least ${mm(depth)} mm clear of the doorway's face, or beside it.`,
            `Or make ${refA} a \`sliding\` or \`pocket\` door, which parks no leaf in the room.`,
          ],
        });
      }
    }
    return out;
  },
};

/**
 * Where the parked leaf of `s` stands in door `b`'s approach, or `null` when it does not:
 * `depth` is the leaf's nearest approach to `b`'s wall face (mm), `free` the longest stretch of
 * `b`'s span (jamb to jamb) the leaf's shadow leaves uncovered, `mid` the mid-point of the
 * leaf's run inside the zone (the room probe). The zone is closed on the face and the jambs and
 * open at `depth` (a leaf exactly `depth` from the face stands outside it). `null` for a door
 * with no orthogonal host. The leaf is axis-parallel (its own door's host is orthogonal, which
 * the caller checks), so the clip is an interval intersection: exact, no division.
 */
function leafOverApproach(s: DoorSwing, b: RDoor, depth: number): { depth: number; free: number; mid: Point } | null {
  const seg = b.host;
  if (!seg || !orthogonalHost(b)) return null;
  const horiz = seg.a.y === seg.b.y;
  // Into b's frame: u along its wall, w across it (signed, from the centreline).
  const toUW = (p: Point): { u: number; w: number } =>
    horiz ? { u: p.x, w: p.y - b.at.y } : { u: p.y, w: p.x - b.at.x };
  const fromUW = (u: number, w: number): Point => (horiz ? { x: u, y: w + b.at.y } : { x: w + b.at.x, y: u });
  const p = toUW(s.hinge);
  const q = toUW(s.leafEnd);
  const u0 = (horiz ? b.at.x : b.at.y) - b.width / 2;
  const u1 = u0 + b.width;
  const half = seg.thickness / 2;
  let best: { depth: number; free: number; mid: Point } | null = null;
  for (const side of [1, -1] as const) {
    // Distance from the face on this side: v = side·w − half; the zone is v ∈ [0, depth).
    const clip = clipToBox(p.u, side * p.w - half, q.u, side * q.w - half, u0, u1, 0, depth);
    if (clip === null) continue;
    const [ua, va, ub, vb] = clip;
    const near = Math.min(va, vb);
    if (near >= depth) continue;
    const free = Math.max(Math.min(ua, ub) - u0, u1 - Math.max(ua, ub));
    const mid = fromUW((ua + ub) / 2, side * ((va + vb) / 2 + half));
    if (best === null || free < best.free) best = { depth: near, free, mid };
  }
  return best;
}

/** A door hosted on a straight, axis-aligned wall segment. */
function orthogonalHost(d: RDoor): boolean {
  const seg = d.host;
  if (!seg || seg.arc) return false;
  return (seg.a.y === seg.b.y) !== (seg.a.x === seg.b.x);
}

/**
 * The part of the axis-parallel segment (ua,va)→(ub,vb) inside the closed box [u0,u1] × [v0,v1],
 * as its two end points, or `null` when it misses: an interval intersection on each axis.
 */
function clipToBox(
  ua: number,
  va: number,
  ub: number,
  vb: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): [number, number, number, number] | null {
  const ul = Math.max(Math.min(ua, ub), u0);
  const uh = Math.min(Math.max(ua, ub), u1);
  const vl = Math.max(Math.min(va, vb), v0);
  const vh = Math.min(Math.max(va, vb), v1);
  if (ul > uh || vl > vh) return null;
  return [ul, vl, uh, vh];
}
