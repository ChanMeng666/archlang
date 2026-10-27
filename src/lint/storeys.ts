/**
 * The storeys `lint()` reads and the building fact each is read with: the per-storey
 * {@link BuildingContext} of a multi-storey plan ({@link buildingContexts}) and the plan's dwelling
 * reading (PS2.18). Stated once here so every reader of a lint context, `lint()` and the
 * `describe --facts clearances` facet (PS2.72), builds the same contexts.
 */

import { buildingRoomReach, DEFAULT_TOL, storeyGrounded } from "../analyze.js";
import { dwellingReading } from "../analyze/dwelling.js";
import { storeyHasEntranceCandidate } from "../analyze/entrance.js";
import type { ResolvedLevel, ResolvedPlan, RRoom } from "../ir.js";
import {
  arrivalRuns,
  levelsEnteredFromBelow,
  type RVertical,
  verticalConnections,
  verticalReach,
  verticalsOf,
} from "../vertical.js";
import { type BuildingContext, NO_BUILDING, type ShaftNeighbours } from "./context.js";
import { MAX_ATTRIBUTION_MEASURES } from "./rules/circulation-facts.js";

/** One storey `lint()` folds its rules over: its resolved plan, its level (absent for a
 *  single-storey plan) and the building context it is read with (`undefined`: the inert one). */
export interface LintStorey {
  ir: ResolvedPlan;
  level?: number;
  building: BuildingContext | undefined;
}

/**
 * The storeys of a resolved plan as `lint()` reads them: one per `level` in level order, each
 * with its {@link buildingContexts} entry, or the plan itself with the inert context. The dwelling
 * reading (PS2.18) is read once over every storey's rooms and recorded only when the plan is not a
 * dwelling, so a dwelling's contexts are exactly the ones they were.
 */
export function lintStoreys(ir: ResolvedPlan, levels: readonly ResolvedLevel[], tolMm: number): LintStorey[] {
  const storeyIrs = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const nonResidential =
    dwellingReading(storeyIrs.flatMap((p) => p.elements.filter((e): e is RRoom => e.kind === "room"))) ===
    "non-residential";
  if (levels.length > 0) {
    const byLevel = buildingContexts(levels, tolMm);
    if (nonResidential) for (const b of byLevel.values()) b.dwelling = "non-residential";
    return levels.map((l) => ({ ir: l.ir, level: l.level, building: byLevel.get(l.level) }));
  }
  return [{ ir, building: nonResidential ? { ...NO_BUILDING, dwelling: "non-residential" } : undefined }];
}

/**
 * Per-storey {@link BuildingContext} for a multi-storey plan: which vertical runs are
 * real shafts (their id appears on another storey too) and, for a storey with no exterior
 * entrance of its own, which rooms a shaft delivers you into. Computed once for the whole
 * building so no rule re-derives it, and deterministic (levels are already ascending).
 */
export function buildingContexts(levels: readonly ResolvedLevel[], tolMm: number): Map<number, BuildingContext> {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  const peerIds = new Set(connections.map((c) => c.id));
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyGrounded(l.ir, tolMm ?? DEFAULT_TOL) : false;
  };
  // Room-aware: a shaft relays only from a stop whose room is walkable on its storey, on
  // the same tolerance `grounded` uses, so lint and `describe().vertical` agree.
  const roomReach = buildingRoomReach(inputs, tolMm ?? DEFAULT_TOL);
  const reach = verticalReach(inputs, grounded, roomReach);
  const runs = arrivalRuns(inputs, grounded, roomReach);
  const fromBelow = levelsEnteredFromBelow(connections, (n) => {
    const l = levels.find((x) => x.level === n);
    return l ? storeyHasEntranceCandidate(l.ir, tolMm ?? DEFAULT_TOL) : false;
  });
  // Each run's neighbouring stops (PS2.11e, PS2.15): the first run of an id per storey, as
  // `verticalConnections` reads it; levels are ascending, so the neighbours are adjacent entries.
  const firstRuns = levels.map((l) => {
    const m = new Map<string, RVertical>();
    for (const v of verticalsOf(l.ir)) if (!m.has(v.id)) m.set(v.id, v);
    return m;
  });
  const neighbours = levels.map((l, i) => {
    const m = new Map<string, ShaftNeighbours>();
    for (const id of firstRuns[i]!.keys()) {
      if (!peerIds.has(id)) continue;
      const n: ShaftNeighbours = {};
      for (let j = i - 1; j >= 0 && !n.below; j--) {
        const run = firstRuns[j]!.get(id);
        if (run) n.below = { level: levels[j]!.level, run };
      }
      for (let j = i + 1; j < levels.length && !n.above; j++) {
        const run = firstRuns[j]!.get(id);
        if (run) n.above = { level: levels[j]!.level, run };
      }
      m.set(id, n);
    }
    return { level: l.level, m };
  });
  const out = new Map<number, BuildingContext>();
  // One re-measure budget for the whole building, not one per storey.
  const attributionMeasures = { left: MAX_ATTRIBUTION_MEASURES, storeys: levels.length };
  for (const l of levels) {
    out.set(l.level, {
      multiStorey: true,
      storeyCount: levels.length,
      verticalPeerIds: peerIds,
      arrivalRooms: reach.arrivalRooms.get(l.level) ?? [],
      arrivalShafts: runs.get(l.level) ?? [],
      attributionMeasures,
      ...(fromBelow.has(l.level) ? { enteredFromBelow: true } : {}),
      // Levels arrive ascending, so the first is the lowest.
      ...(l === levels[0] ? { lowestStorey: true as const } : {}),
      shaftNeighbours: neighbours.find((x) => x.level === l.level)!.m,
    });
  }
  return out;
}
