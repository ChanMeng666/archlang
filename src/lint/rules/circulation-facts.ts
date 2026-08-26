/**
 * Circulation quality as advisory warnings, built on the circulation nav-grid facts
 * (ADR 0008): a walk that squeezes below a passable width (`W_PATH_TOO_NARROW`), or
 * that wanders far from a straight line (`W_CIRCUITOUS_PATH`). Facts → advisory only,
 * never a layout change (ADR 0005/0006).
 *
 * Both rules read the same circulation model, so it is built once per `lint()` run and
 * memoised on the (per-run) LintContext identity.
 */

import { type CirculationModel, computeCirculation } from "../../analyze/circulation.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";
import { mm, shortfall } from "../measure.js";

const modelCache = new WeakMap<LintContext, CirculationModel | null>();

function circulationOf(ctx: LintContext): CirculationModel | null {
  if (modelCache.has(ctx)) return modelCache.get(ctx) ?? null;
  const model = computeCirculation(
    ctx.rooms,
    ctx.ir.walls,
    ctx.doors,
    ctx.openings,
    ctx.furniture,
    ctx.access(),
    ctx.rules.tolMm,
    undefined,
    ctx.verticals,
    ctx.voids,
  );
  modelCache.set(ctx, model);
  return model;
}

/**
 * The closed remedy set for `W_PATH_TOO_NARROW`, sized against the ruleset minimum.
 *
 * None of these is a machine-applicable fix and none can be: the bottleneck is a nav-grid
 * CELL, not an element — the model knows the route pinches to N mm, not which door or
 * which piece of furniture to rewrite. `arch repair` is deliberately not named either;
 * it clears wall intrusions, swings, doorway landings and overlaps, not a route pinch,
 * and pointing at a tool that would report "nothing to do" is worse than silence.
 */
const narrowHints = (min: number): string[] => [
  `Widen the tightest door/opening on the way to at least ${mm(min)} mm.`,
  `Or move the furniture pinching the route so ${mm(min)} mm of clear width survives.`,
  "Or add a second way in (another door or a leafless `opening`) so the pinch is avoidable.",
];

export const pathTooNarrow: LintRule = {
  name: "path-too-narrow",
  check(ctx: LintContext): Diagnostic[] {
    const circ = circulationOf(ctx);
    if (!circ) return [];
    const { rooms, labelOf, at } = ctx;
    const min = ctx.rules.minPathClearWidthMm;
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const out: Diagnostic[] = [];
    // One warning per room: entrance-walk pinches first, then a key route's pinch on a
    // from-room not already flagged (dedupe deterministically — rooms, then routes).
    const warned = new Set<string>();
    for (const rc of circ.rooms) {
      if (rc.bottleneckClearWidthMm >= min) continue;
      const r = roomById.get(rc.roomId);
      if (!r) continue;
      warned.add(rc.roomId);
      out.push({
        severity: "warning",
        code: "W_PATH_TOO_NARROW",
        ...at(r),
        message: `The walk from the entrance to "${labelOf(r)}" squeezes to ${mm(rc.bottleneckClearWidthMm)} mm (${mm(shortfall(min, rc.bottleneckClearWidthMm))} mm below the ${mm(min)} mm minimum).`,
        hints: narrowHints(min),
      });
    }
    for (const rt of circ.routes) {
      if (rt.bottleneckClearWidthMm >= min || warned.has(rt.fromRoomId)) continue;
      const from = roomById.get(rt.fromRoomId);
      if (!from) continue;
      const to = roomById.get(rt.toRoomId);
      warned.add(rt.fromRoomId);
      out.push({
        severity: "warning",
        code: "W_PATH_TOO_NARROW",
        ...at(from),
        message: `The route from "${labelOf(from)}" to "${to ? labelOf(to) : rt.toRoomId}" squeezes to ${mm(rt.bottleneckClearWidthMm)} mm (${mm(shortfall(min, rt.bottleneckClearWidthMm))} mm below the ${mm(min)} mm minimum).`,
        hints: narrowHints(min),
      });
    }
    return out;
  },
};

export const circuitousPath: LintRule = {
  name: "circuitous-path",
  check(ctx: LintContext): Diagnostic[] {
    const circ = circulationOf(ctx);
    if (!circ) return [];
    const { rooms, labelOf, at } = ctx;
    const max = ctx.rules.maxDetourRatio;
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const out: Diagnostic[] = [];
    for (const rc of circ.rooms) {
      if (rc.detourRatio <= max) continue;
      const r = roomById.get(rc.roomId);
      if (!r) continue;
      out.push({
        severity: "warning",
        code: "W_CIRCUITOUS_PATH",
        ...at(r),
        message: `The walk from the entrance to "${labelOf(r)}" is ${rc.detourRatio}× the straight-line distance (over ${max}×).`,
        hints: ["Add a more direct connection — a door or a hall — so the room isn't reached the long way round."],
      });
    }
    return out;
  },
};
