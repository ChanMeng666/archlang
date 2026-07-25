/**
 * The shared, precomputed context every lint rule checks against — element
 * subsets, room rectangles and the hoisted wall-segment list are built exactly
 * once per `lint()` run, so no rule re-derives them.
 */

import type { BBox } from "../analyze.js";
import { rectOf } from "../analyze.js";
import type { Diagnostic } from "../diagnostics.js";
import { segmentsOfWall, type WallSegment } from "../geometry.js";
import type { RDoor, RFurniture, ROpening, RRoom, RWindow, ResolvedPlan } from "../ir.js";
import { type RVertical, verticalsOf } from "../vertical.js";
import type { LintRuleset } from "./ruleset.js";

/**
 * What one storey's rules need to know about the BUILDING around it (v1.21). A
 * single-storey plan has none of this, and the defaults below are exactly "no vertical
 * circulation anywhere", so every existing plan lints identically.
 */
export interface BuildingContext {
  /** True when the plan is made of `level` blocks. */
  multiStorey: boolean;
  /** Ids of vertical runs that also appear on some OTHER storey (i.e. real shafts). */
  verticalPeerIds: ReadonlySet<string>;
  /**
   * Rooms on THIS storey you arrive in by coming up or down a shaft from a storey that
   * is itself reachable from outside — so this storey needs no exterior door of its own.
   * Empty when the storey is grounded (it has its own entrance) or is not reached at all.
   */
  arrivalRooms: readonly string[];
}

const NO_BUILDING: BuildingContext = { multiStorey: false, verticalPeerIds: new Set(), arrivalRooms: [] };

export interface LintContext {
  ir: ResolvedPlan;
  rules: LintRuleset;
  rooms: RRoom[];
  doors: RDoor[];
  windows: RWindow[];
  openings: ROpening[];
  furniture: RFurniture[];
  /** Vertical-circulation runs on this storey, in source order. */
  verticals: RVertical[];
  /** The multi-storey facts this storey's rules read; inert for a single-storey plan. */
  building: BuildingContext;
  /** Both doors and cased openings connect a room to its neighbours. */
  connectors: Array<RDoor | ROpening>;
  roomRects: Map<string, BBox>;
  /** Every wall segment, hoisted once (several rules scan them per room/fixture). */
  wallSegs: WallSegment[];
  wallOpenings: Array<{ at: { x: number; y: number }; width: number }>;
  labelOf(r: RRoom): string;
  at(span: Diagnostic["span"]): { span?: Diagnostic["span"] };
}

/** One architectural-soundness rule (or an order-preserving composite of several). */
export interface LintRule {
  /** Stable name for tests/debugging (not user-facing). */
  name: string;
  check(ctx: LintContext): Diagnostic[];
}

export function buildLintContext(
  ir: ResolvedPlan,
  rules: LintRuleset,
  building: BuildingContext = NO_BUILDING,
): LintContext {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  return {
    ir,
    rules,
    rooms,
    doors,
    windows,
    openings,
    furniture,
    verticals: verticalsOf(ir),
    building,
    connectors: [...doors, ...openings],
    roomRects: new Map<string, BBox>(rooms.map((r) => [r.id, rectOf(r)])),
    wallSegs: ir.walls.flatMap((w) => segmentsOfWall(w).map((s) => ({ ...s }))),
    wallOpenings: ir.walls.flatMap((w) => w.openings),
    labelOf: (r) => r.label ?? r.id,
    at: (span) => (span ? { span } : {}),
  };
}
