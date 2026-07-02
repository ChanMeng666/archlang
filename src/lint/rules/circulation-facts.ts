/**
 * Circulation quality as advisory warnings, built on the circulation nav-grid facts
 * (ADR 0008): a walk that squeezes below a passable width (`W_PATH_TOO_NARROW`), or
 * that wanders far from a straight line (`W_CIRCUITOUS_PATH`). Facts → advisory only,
 * never a layout change (ADR 0005/0006).
 *
 * Both rules read the same circulation model, so it is built once per `lint()` run and
 * memoised on the (per-run) LintContext identity.
 */

import { buildDoorAccessGraph } from "../../analyze.js";
import { type CirculationModel, computeCirculation } from "../../analyze/circulation.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { LintContext, LintRule } from "../context.js";

const modelCache = new WeakMap<LintContext, CirculationModel | null>();

function circulationOf(ctx: LintContext): CirculationModel | null {
  if (modelCache.has(ctx)) return modelCache.get(ctx) ?? null;
  const access = buildDoorAccessGraph(ctx.rooms, ctx.doors, ctx.rules.tolMm, undefined, ctx.openings);
  const model = computeCirculation(
    ctx.rooms,
    ctx.ir.walls,
    ctx.doors,
    ctx.openings,
    ctx.furniture,
    access,
    ctx.rules.tolMm,
  );
  modelCache.set(ctx, model);
  return model;
}

const NARROW_HINT = "Widen the tightest door/opening on the way, or move the furniture pinching it.";

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
        ...at(r.span),
        message: `The walk from the entrance to "${labelOf(r)}" squeezes to ${rc.bottleneckClearWidthMm} mm (below ${min} mm).`,
        hints: [NARROW_HINT],
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
        ...at(from.span),
        message: `The route from "${labelOf(from)}" to "${to ? labelOf(to) : rt.toRoomId}" squeezes to ${rt.bottleneckClearWidthMm} mm (below ${min} mm).`,
        hints: [NARROW_HINT],
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
        ...at(r.span),
        message: `The walk from the entrance to "${labelOf(r)}" is ${rc.detourRatio}× the straight-line distance (over ${max}×).`,
        hints: ["Add a more direct connection — a door or a hall — so the room isn't reached the long way round."],
      });
    }
    return out;
  },
};
