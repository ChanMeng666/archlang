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
import type { LintRuleset } from "./ruleset.js";

export interface LintContext {
  ir: ResolvedPlan;
  rules: LintRuleset;
  rooms: RRoom[];
  doors: RDoor[];
  windows: RWindow[];
  openings: ROpening[];
  furniture: RFurniture[];
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

export function buildLintContext(ir: ResolvedPlan, rules: LintRuleset): LintContext {
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
    connectors: [...doors, ...openings],
    roomRects: new Map<string, BBox>(rooms.map((r) => [r.id, rectOf(r)])),
    wallSegs: ir.walls.flatMap((w) => segmentsOfWall(w).map((s) => ({ ...s }))),
    wallOpenings: ir.walls.flatMap((w) => w.openings),
    labelOf: (r) => r.label ?? r.id,
    at: (span) => (span ? { span } : {}),
  };
}
