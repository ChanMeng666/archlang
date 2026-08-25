/**
 * The shared, precomputed context every lint rule checks against — element
 * subsets, room rectangles and the hoisted wall-segment list are built exactly
 * once per `lint()` run, so no rule re-derives them.
 */

import type { AccessGraph, RoomBox } from "../analyze.js";
import { buildDoorAccessGraph, roomBox } from "../analyze.js";
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
  /** Per-room extent: bbox, plus the floor ring for a `room polygon` (v1.23). */
  roomRects: Map<string, RoomBox>;
  /** Every wall segment, hoisted once (several rules scan them per room/fixture). */
  wallSegs: WallSegment[];
  wallOpenings: Array<{ at: { x: number; y: number }; width: number }>;
  /**
   * The modeled door/opening access graph for this storey — rooms joined to each other
   * and to the synthetic `exterior` node — built at most once per `lint()` run.
   *
   * It is a function rather than a field because most plans never ask: only the rules
   * that need reachability pay for it. Sharing ONE graph is the point, though — this is
   * the same `buildDoorAccessGraph` call `describe()` makes, so "is there a way into this
   * building?" has a single answer across the whole tool. `W_NO_ENTRANCE` used to ask its
   * own, weaker question (does any WALL carry `category exterior`?) and so stood down on
   * a plan `describe().access.hasEntrance` called shut.
   */
  access(): AccessGraph;
  labelOf(r: RRoom): string;
  /**
   * The location half of a diagnostic raised ON an element: its byte `span` **and the
   * file that span is measured in**.
   *
   * It takes the element rather than `el.span` on purpose — it is the ONE seam where a
   * lint diagnostic learns its provenance, so a rule cannot report a span while silently
   * forgetting which source it addresses. An element written in the compiled source
   * carries no `_file`, so the returned object is exactly `{ span }` and every existing
   * plan's diagnostics are byte-identical.
   */
  at(el: DiagnosticSite): { span?: Diagnostic["span"]; file?: string };
}

/** What {@link LintContext.at} needs off an element: where it is, and in which file. */
export interface DiagnosticSite {
  span?: Diagnostic["span"];
  _file?: string;
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
  let accessMemo: AccessGraph | null = null;
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
    roomRects: new Map<string, RoomBox>(rooms.map((r) => [r.id, roomBox(r)])),
    wallSegs: ir.walls.flatMap((w) => segmentsOfWall(w).map((s) => ({ ...s }))),
    wallOpenings: ir.walls.flatMap((w) => w.openings),
    access: () => (accessMemo ??= buildDoorAccessGraph(rooms, doors, rules.tolMm, undefined, openings)),
    labelOf: (r) => r.label ?? r.id,
    at: (el) => ({
      ...(el.span ? { span: el.span } : {}),
      ...(el._file !== undefined ? { file: el._file } : {}),
    }),
  };
}
