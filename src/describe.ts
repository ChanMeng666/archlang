/**
 * `describe(source)` — a pure, semantic summary of a floor plan.
 *
 * Where {@link import("./index.js").compile} produces *pixels* (an SVG/Scene), this
 * produces *facts*: a small JSON object listing rooms (with computed areas, bounding
 * boxes, and which rooms each is adjacent to), doors (which two spaces they connect),
 * windows (which room they serve), and plan totals. It is the channel a **text-only AI
 * agent** uses to verify what it drew — "did I produce a 2-bedroom plan with a bath
 * reachable by a door?" — without ever rasterizing or "seeing" the image.
 *
 * Pure, synchronous, isomorphic, deterministic. The resolve pipeline and the
 * rectilinear geometry it leans on live in {@link import("./analyze.js")}; this module
 * just shapes the result. All numbers are rounded deterministically so the summary is
 * byte-stable across runs.
 *
 * This module keeps the options, `describe`/`describeLevel`/`summarize` and the helpers they
 * share; the summary's types live in `describe/types.ts`, room adjacency in
 * `describe/adjacency.ts`, the vertical facts in `describe/verticals.ts` and the diff fabric in
 * `describe/fabric.ts`. Every name that moved is re-exported from here. Nothing here charges the
 * step meter; the resolve it calls does.
 */

import { relationText } from "./opening-relation.js";
import { wallPhraseOf } from "./wall-ref.js";
import type {
  ResolvedPlan,
  RRoom,
  RDoor,
  RWindow,
  ROpening,
  RFurniture,
  RVoid,
  ROutdoor,
  RFence,
  RWallsFromRooms,
  DerivedWallRow,
  RWall as RWallFact,
  OpeningPlacement,
} from "./ir.js";
import type { PlanNode, Point } from "./ast.js";
import { polygonArea, polygonBounds } from "./geometry/polygon.js";
import { voidPieces } from "./elements/void.js";
import { memoRoomNetAreaMm2, storeyNetAreaBands } from "./analyze/net-area-memo.js";
import { grossInternalArea } from "./analyze/gross-area.js";
import { openShells } from "./analyze/open-shell.js";
import { WALL_STATUSES, type WallStatus } from "./grammar/tokens.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  resolvePlan,
  rectOf,
  pointInRoomBox,
  roomAreaMm2,
  roomBox,
  roomsAtPoint,
  arcWindowRoom,
  connectorConnection,
  roomUses,
  buildDoorAccessGraph,
  DEFAULT_TOL,
  type AnalyzeOptions,
  type RoomBox,
} from "./analyze.js";
import { outerFaceBounds, segmentsOfWall, type WallSegment } from "./geometry.js";
import { computeCirculation } from "./analyze/circulation.js";
import { entranceInputs, withMainEntrance } from "./analyze/entrance.js";
import { symmetryFacts } from "./analyze/symmetry.js";
import { syntaxFacts } from "./analyze/syntax.js";
import { dependsFacts, indexStatements, type StatementIndex } from "./analyze/depends.js";
import { keepFacts } from "./analyze/keep-facts.js";
import { roomTypeForUses, buildInputGraph } from "./plan-json.js";
import { roomSchedule } from "./sheet-tables.js";
// The page→compass conversion and the `site` derivation live in ONE module: the site
// layer's lint rule asks the same question of the same windows, and a second place to
// apply the north rotation is a second place to get it wrong.
import { deriveSite, planCenterOfRooms, type SiteFacts, toCompass, windowFacingPage } from "./site.js";
import {
  type ArrivingRun,
  isBlockStair,
  type RVertical,
  roomOfVertical,
  type VerticalKind,
  verticalsOf,
} from "./vertical.js";
import { fmt2, fmt3 } from "./num-format.js";
import { keepSummary } from "./keep.js";
import { drawnView, keepResultsOf } from "./ir.js";
import { type D4, fromSpelling, northQuarterTurns } from "./algebra/d4.js";
import { type ClearWorld, clearWorldOf, measureClear } from "./furniture-relation.js";
import { clearanceFacts } from "./lint/clearance-facts.js";
import { openRunsOf } from "./analyze.js";
import { quantityFacts } from "./analyze/quantities.js";
import type {
  RoomSummary,
  DoorSummary,
  WindowSummary,
  OpeningSummary,
  WallStatusFacts,
  FurnitureSummary,
  ClearFact,
  VerticalSummary,
  VoidSummary,
  OutdoorSummary,
  FenceSummary,
  InstanceSummary,
  FreedomElement,
  FreedomReport,
  ZoneSummary,
  LevelSummary,
  SceneSummary,
} from "./describe/types.js";
import { roomAdjacency } from "./describe/adjacency.js";
import { blockStairFacts, buildVerticalReport } from "./describe/verticals.js";

export type { ScheduleRow } from "./sheet-tables.js";

export type { VerticalConnection, VerticalKind, VerticalStop } from "./vertical.js";

export type {
  CirculationModel,
  RoomCirculation,
  CirculationRoute,
  BlockedRoom,
  UnmeasuredRoom,
  UnmeasuredReason,
} from "./analyze/circulation.js";

export type { BBox } from "./analyze.js";

export type {
  LayerSymmetry,
  MirrorAxis,
  MirrorRepeat,
  Repeat,
  SymmetryElement,
  SymmetryFacts,
  SymmetryGroup,
  TranslationRepeat,
} from "./analyze/symmetry.js";
export type { SyntaxFacts, SyntaxRoom } from "./analyze/syntax.js";
export type { DependsEntry, DependsFacts, DerivedWallDepends } from "./analyze/depends.js";
export type {
  ApproachFact,
  ClearanceFacts,
  ClearanceObstacle,
  DoorwayFact,
  HobFact,
  HobWindowFact,
  LandingFact,
  LowUnitFact,
  StairFact,
  TallUnitFact,
  WcFact,
  WcSideFact,
  WindowCoverFact,
} from "./lint/clearance-facts.js";
export type {
  DoorQuantity,
  QuantityFacts,
  RoomQuantity,
  WallQuantity,
  WindowQuantity,
} from "./analyze/quantities.js";
export type { ContactFact, RoomEdge } from "./analyze/contacts.js";
export type { KeepFact, KeepRedundancy } from "./analyze/keep-facts.js";

// The access graph and its two node/edge shapes are DECLARED in `analyze.js`, but
// `describe()` is the only public value that surfaces them ({@link SceneSummary.access}),
// so they leave through the same door they arrive by. Without this a consumer could read
// `summary.access.rooms[0].reachable` but never *name* the type of the thing it holds.
export type { AccessEdge, AccessGraph, AccessRoomNode, MainEntranceBasis, MainEntranceFact } from "./analyze.js";

// Likewise for the door kind: it is a grammar token type, but {@link DoorSummary.kind} is
// where a consumer of the facts channel meets it.
export type { DoorKind, WindowKind } from "./grammar/tokens.js";
// And for the wall status (B3a): {@link WallStatusFacts} is where a consumer meets it.
export type { WallStatus } from "./grammar/tokens.js";

export type {
  RoomSummary,
  DoorSummary,
  WindowSummary,
  OpeningSummary,
  WallStatusFacts,
  HeightFacts,
  FurnitureSummary,
  ClearFact,
  VerticalSummary,
  StairFlightSummary,
  StairLandingSummary,
  VoidSummary,
  OutdoorSummary,
  FenceSummary,
  VerticalReport,
  InstanceSummary,
  FreedomElement,
  FreedomReport,
  AxisSummary,
  AxesSummary,
  SheetSummary,
  ZoneSummary,
  LevelSummary,
  SceneSummary,
} from "./describe/types.js";
export { roomAdjacency } from "./describe/adjacency.js";

/** Options for {@link describe}; the shared analysis options plus an adjacency tolerance. */
export interface DescribeOptions extends AnalyzeOptions {
  /**
   * How close (in mm) two room edges may be and still count as adjacent, and how
   * close an opening must be to a room edge to count as serving it. Defaults to
   * 200 mm — wide enough to treat rooms separated by a typical partition wall as
   * adjacent, narrow enough to avoid joining clearly separate rooms.
   */
  adjacencyTolMm?: number;
  /**
   * Opt-in derived facts, each computed only when named here: `"symmetry"` adds
   * {@link SceneSummary.symmetry}, `"syntax"` adds {@link SceneSummary.syntax}, `"depends"`
   * adds {@link SceneSummary.depends}, `"clearances"` adds {@link SceneSummary.clearances},
   * `"quantities"` adds {@link SceneSummary.quantities}.
   * Absent or empty (the default), the summary is
   * byte-identical to one written before any of them existed.
   */
  facts?: readonly DescribeFact[];
  /**
   * A waste percentage for {@link QuantityFacts.floor_area_with_waste_m2}, read only by the
   * `"quantities"` fact: a parameter the caller passes, never a default. Absent, the figure is
   * absent. A number from 0 to {@link MAX_WASTE_PCT}; anything else throws a `RangeError` (a
   * caller's argument, never plan source).
   */
  wastePct?: number;
}

/** The largest waste percentage {@link DescribeOptions.wastePct} accepts. */
export const MAX_WASTE_PCT = 100;

/** Every opt-in fact {@link DescribeOptions.facts} can name — `arch describe --facts` reads this list. */
export const DESCRIBE_FACTS = ["symmetry", "syntax", "depends", "clearances", "quantities"] as const;

/** One opt-in fact of {@link DESCRIBE_FACTS}. */
export type DescribeFact = (typeof DESCRIBE_FACTS)[number];

/** {@link DescribeSummary.wall_status}: absent unless a wall on the storey writes `status`. */
function wallStatusFacts(ir: ResolvedPlan): WallStatusFacts | undefined {
  const walls = drawnView(ir).walls;
  if (!walls.some((w) => w.status !== undefined)) return undefined;
  const counts = Object.fromEntries(WALL_STATUSES.map((s) => [s, 0])) as Record<WallStatus, number>;
  const rows = walls.map((w) => {
    const status = w.status ?? "existing";
    counts[status]++;
    return { id: w.id, category: w.category, status };
  });
  return { counts, walls: rows };
}

/**
 * The rigid map an instance applies, as ONE canonical value: the D4 element its
 * `(rotate, mirror)` spelling denotes (`src/algebra/d4.ts`). Two spellings of one map —
 * `mirror y` and `rotate 180 mirror x` — describe differently (the summary echoes what was
 * written) and have equal transforms, so compare instances with this, never by spelling.
 */
export function instanceTransform(i: Pick<InstanceSummary, "rotate" | "mirror">): D4 {
  return fromSpelling(i.rotate, i.mirror);
}

export type { RoomPlacement, OpeningPlacement, FurniturePlacement, DerivedWallRow } from "./ir.js";
export type { KeepAt, KeepSkipped, KeepSummary } from "./keep.js";

/**
 * The lot's measured facts, or nothing when the plan declares no `boundary`.
 *
 * Area is the EXACT shoelace of the ring. The bbox is reported too, but it is a framing
 * convenience only — an L-shaped or splayed lot's box is not its lot, and no number here
 * is derived from it.
 */
function lotFacts(ring: readonly Point[] | undefined): Pick<SiteFacts, "lot_area_m2" | "lot_bbox"> {
  if (!ring || ring.length < 3) return {};
  const b = polygonBounds(ring);
  return {
    lot_area_m2: r2(polygonArea(ring) / 1_000_000),
    lot_bbox: { x: b.x, y: b.y, w: b.w, h: b.h },
  };
}

/** Round to 2 decimals, deterministically (avoids float drift in output). */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Compass north as page quarter-turns — D4 arithmetic, so it lives in `src/algebra/d4.ts`;
 *  re-exported here, its historical home, where `lint` and the tests import it from. */
export { northQuarterTurns };

/** How many rooms to name in a caption before collapsing the rest to "and N more". */
const CAPTION_ROOM_CAP = 8;

/** The minimal slice of a summary the caption is composed from. */
interface CaptionInput {
  plan: string;
  rooms: Pick<RoomSummary, "id" | "label" | "area_m2">[];
  totals: SceneSummary["totals"];
  /** Door/opening ids that connect the exterior to a room (from the access graph). */
  entrances: string[];
}

/**
 * One deterministic caption sentence for a plan, e.g.
 * `"Two-bed" — a 4-room floor plan, 42 m² total: Living / Kitchen (24 m²),
 * Bedroom (12 m²); 3 doors, 3 windows, entrance via d_main.`
 *
 * Composed **only** from already-computed summary fields, in the summary's own
 * (source) order, so it is byte-stable. Numbers route through {@link fmt2}. Long
 * plans list the first {@link CAPTION_ROOM_CAP} rooms then "and N more" so the
 * sentence stays bounded. Shared by {@link describe} (`summary.caption`) and the
 * accessible-SVG `<desc>` so the two never diverge.
 */
export function buildCaption(s: CaptionInput): string {
  const named = s.plan ? `"${s.plan}" — a` : "A";
  let out = `${named} ${s.totals.rooms}-room floor plan, ${fmt2(s.totals.floor_area_m2)} m² total`;

  if (s.rooms.length > 0) {
    const shown = s.rooms.slice(0, CAPTION_ROOM_CAP);
    const parts = shown.map((r) => `${r.label ?? r.id} (${fmt2(r.area_m2)} m²)`);
    const more = s.rooms.length - shown.length;
    out += `: ${parts.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
  }

  const counts: string[] = [];
  if (s.totals.doors > 0) counts.push(`${s.totals.doors} door${s.totals.doors === 1 ? "" : "s"}`);
  if (s.totals.windows > 0) counts.push(`${s.totals.windows} window${s.totals.windows === 1 ? "" : "s"}`);
  if (counts.length > 0) out += `; ${counts.join(", ")}`;

  if (s.entrances.length > 0) {
    const sep = counts.length > 0 ? ", " : "; ";
    if (s.entrances.length === 1) {
      out += `${sep}entrance via ${s.entrances[0]}`;
    } else {
      const first = s.entrances.slice(0, 2);
      const extra = s.entrances.length - first.length;
      out += `${sep}entrances via ${first.join(", ")}${extra > 0 ? `, and ${extra} more` : ""}`;
    }
  }

  return `${out}.`;
}

/**
 * The caption for an already-resolved plan (the {@link compile} path, which has the
 * IR but not a {@link SceneSummary}). Reuses the real {@link summarize} so it stays
 * byte-identical to `describe(source).caption`; no re-parse. See ADR 0007's opt-in
 * pattern — this only runs in accessible mode.
 */
export function captionForPlan(ir: ResolvedPlan, tol: number = DEFAULT_TOL): string {
  const s = summarize(ir, tol, [], [], false, undefined, false);
  return buildCaption({ plan: s.plan, rooms: s.rooms, totals: s.totals, entrances: s.access.entrances });
}

/** An all-zero {@link FreedomReport} (the failed-resolution path). */
function emptyFreedom(): FreedomReport {
  return {
    rooms: { total: 0, absolute: 0, relational: 0, strip: 0 },
    openings: { total: 0, attached: 0, absolute: 0 },
    furniture: { total: 0, anchored: 0, againstWall: 0, absolute: 0 },
    elements: [],
  };
}

/**
 * Build the {@link FreedomReport} from the resolved elements. Reads the internal
 * `_placement` marker set during resolve (defaulting to `absolute` for the
 * literal-`at` path). Pure tallying — one `elements` row per placed element in
 * describe's own order (rooms, doors, windows, openings, furniture).
 */
/** The walls family of `freedom` (ADR 0028 §6): derived walls against walls typed as points. */
function wallFreedom(walls: readonly RWallFact[]): {
  total: number;
  derived: number;
  absolute: number;
  relational?: number;
} {
  const derived = walls.filter((w) => w._derived !== undefined).length;
  // An authored wall written `between`/`around` rooms (ADR 0028 §4): `relational`, present
  // only when there is one, so a storey without one reports exactly what it did.
  const relational = walls.filter((w) => w._relation !== undefined).length;
  return {
    total: walls.length,
    derived,
    absolute: walls.length - derived - relational,
    ...(relational > 0 ? { relational } : {}),
  };
}

function buildFreedom(
  rooms: RRoom[],
  doors: RDoor[],
  windows: RWindow[],
  openings: ROpening[],
  furniture: RFurniture[],
): FreedomReport {
  const f = emptyFreedom();
  const elements: FreedomElement[] = f.elements;

  for (const r of rooms) {
    const placement = r._placement ?? "absolute";
    f.rooms.total++;
    f.rooms[placement]++;
    elements.push({ id: r.id, kind: "room", placement, ...inst(r._instance) });
  }

  const opening = (
    id: string,
    kind: "door" | "window" | "opening",
    placement: OpeningPlacement,
    instance: string | undefined,
  ): void => {
    f.openings.total++;
    if (placement === "relational") f.openings.relational = (f.openings.relational ?? 0) + 1;
    else f.openings[placement]++;
    elements.push({ id, kind, placement, ...inst(instance) });
  };
  for (const d of doors) opening(d.id, "door", d._placement ?? "absolute", d._instance);
  for (const w of windows) opening(w.id, "window", w._placement ?? "absolute", w._instance);
  for (const o of openings) opening(o.id, "opening", o._placement ?? "absolute", o._instance);

  for (const fu of furniture) {
    const placement = fu._placement ?? "absolute";
    f.furniture.total++;
    if (placement === "relational") f.furniture.relational = (f.furniture.relational ?? 0) + 1;
    else f.furniture[placement === "against-wall" ? "againstWall" : placement]++;
    elements.push({ id: fu.id, kind: "furniture", placement, ...inst(fu._instance) });
  }

  return f;
}

function instanceOf(e: { _instance?: string; _component?: string }): { instance?: string; component?: string } {
  return e._instance === undefined ? {} : { instance: e._instance, component: e._component };
}

/** Spreadable {@link DoorSummary.centreline_at}: the resolved point of an opening placed `between`. */
function centrelineAt(o: RDoor | ROpening): { centreline_at?: Point } {
  return o._relation?.between ? { centreline_at: { x: Number(fmt3(o.at.x)), y: Number(fmt3(o.at.y)) } } : {};
}

/** Spreadable instance stamp for a {@link FreedomElement}. */
function inst(instance: string | undefined): { instance?: string } {
  return instance === undefined ? {} : { instance };
}

/** A room's `net_area_m2` key: the rounded figure, or no key at all when it is omitted. */
const netField = (mm2: number | undefined): { net_area_m2?: number } =>
  mm2 === undefined ? {} : { net_area_m2: r2(mm2 / 1_000_000) };

/** Build the summary from a fully resolved plan. */
function summarize(
  ir: ResolvedPlan,
  tol: number,
  facts: readonly DescribeFact[] = [],
  /** The runs a shaft-reached storey is walked from — see `computeCirculation`. */
  arrivals: readonly ArrivingRun[] = [],
  /** A shaft arrives on this storey from below: it names no main entrance (PS0.10/PS0.3). */
  upperStorey = false,
  /** The linked plan's statements, built only when `depends` is requested. */
  statements?: StatementIndex,
  /** False on the caption path only: the gross internal area is not computed at all. */
  withGrossArea = true,
): Omit<SceneSummary, "ok" | "diagnostics"> {
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doorEls = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windowEls = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openingEls = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furnEls = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const verticalEls: RVertical[] = verticalsOf(ir);
  // The walls `walls from rooms` derived, and the authored walls written `between`/`around`
  // rooms (ADR 0028 §4), as facts (§6), in source order, copied so the IR is never shared. A
  // `walls from rooms … status demolish` statement's walls are gone like an authored demolished
  // wall (B3a): they are listed under `wall_status` only.
  const derivedRows: DerivedWallRow[] = ir.elements.flatMap((e): DerivedWallRow[] => {
    if (e.kind === "walls")
      return (e as RWallsFromRooms).status === "demolish"
        ? []
        : (e as RWallsFromRooms)._derivedRows.map((r) => structuredClone(r));
    if (e.kind !== "wall" || !(e as RWallFact)._relation || (e as RWallFact).points.length === 0) return [];
    const rel = (e as RWallFact)._relation!;
    return "between" in rel
      ? [{ from: "between", name: e.id, between: [...rel.between] }]
      : [{ from: "around", name: e.id, around: [...rel.around] }];
  });
  const voidEls = ir.elements.filter((e): e is RVoid => e.kind === "void");
  const outdoorEls = ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
  const fenceEls = ir.elements.filter((e): e is RFence => e.kind === "fence");

  const roomRects = new Map<string, RoomBox>(roomEls.map((r) => [r.id, roomBox(r)]));

  const adjacency = roomAdjacency(roomEls, roomRects, tol);
  // The storey's wall bands, once: every room's net area reads them.
  const bands = storeyNetAreaBands(ir.walls);

  const rooms: RoomSummary[] = roomEls.map((r, i) => {
    const rect = roomRects.get(r.id)!;
    const adjacent = adjacency[i]!;
    const uses = roomUses(r);
    return {
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: [...uses],
      room_type: roomTypeForUses(uses),
      area_m2: r2(roomAreaMm2(r) / 1_000_000),
      ...netField(memoRoomNetAreaMm2(r, bands)),
      // `bbox` stays a plain {x,y,w,h} — never the RoomBox, whose `poly` would leak a
      // fifth key into the JSON. A polygon room's true floor is `floor_polygon`.
      bbox: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      // A CIRCULAR room reports its exact centre + radius (append-only) INSTEAD of a
      // 48-vertex ring: the tessellation is an implementation detail of the grid layer,
      // and dumping it would bloat an agent's context with numbers that are not the
      // truth about the floor. `area_m2` above is πR², exact.
      ...(r.circle ? { floor_circle: { cx: r.circle.c.x, cy: r.circle.c.y, r: r.circle.r } } : {}),
      floor_polygon: r.circle
        ? []
        : r.poly
          ? r.poly.map((p) => ({ x: p.x, y: p.y }))
          : [
              { x: rect.x, y: rect.y },
              { x: rect.x + rect.w, y: rect.y },
              { x: rect.x + rect.w, y: rect.y + rect.h },
              { x: rect.x, y: rect.y + rect.h },
            ],
      adjacent,
      ...instanceOf(r),
    };
  });

  // Which rooms' perimeters does this opening sit on? (≤2 for a door, 1 for a window.)
  // Shared with the lint connectivity rules — see analyze.ts.
  // The vertical datum's gate. ONE boolean decides whether any height key appears
  // anywhere in this summary — every `...(heights ? …)` below reads this and nothing else,
  // so there is no second rule to disagree with the first. It is whole-PLAN (see
  // `ResolvedPlan._heightsAuthored`), which is why a building whose upper floor alone
  // declares a height reports heights on every page.
  const heights = ir._heightsAuthored;
  // The walls' remodel status (B3a): a per-storey block, absent unless a wall here writes one.
  const wallStatus = wallStatusFacts(ir);

  const doors: DoorSummary[] = doorEls.map((d) => {
    const { between, straddles } = connectorConnection(d, roomRects, tol);
    return {
      id: d.id,
      ...(d._instance !== undefined ? { instance: d._instance } : {}),
      between,
      ...(straddles ? { straddles } : {}),
      width: d.width,
      ...(d._relation ? { relation: relationText(d._relation) } : {}),
      ...(d.doorKind !== undefined ? { kind: d.doorKind } : {}),
      ...(heights ? { head: d.head } : {}),
      ...centrelineAt(d),
    };
  });

  // Plan centre (bounding-box midpoint of the union of room rectangles). Its ONLY reader
  // is `windowFacingPage`, and only as the stated tie-break for when the outward-face
  // probe cannot decide — it is NOT a datum for anything else: a courtyard plan's midpoint
  // lies in the courtyard, i.e. outside the building. Cheap and deterministic to compute
  // up front.
  const planCenter: Point = planCenterOfRooms(roomRects);

  // The plan's declared `north`, as clockwise quarter-turns off the page top. Zero for
  // the default `north up`, in which case the compass answer IS the page answer and no
  // `facingPage` key is emitted — so a plan that declares no `north` is byte-identical.
  const northTurns = northQuarterTurns(ir.north);

  // The storey's wall segments, built only when a window stands on an arc edge, the one case
  // `arcWindowRoom` reads them in.
  let segsMemo: WallSegment[] | null = null;
  const segs = (): WallSegment[] => {
    if (segsMemo === null) segsMemo = ir.walls.flatMap((x) => segmentsOfWall(x));
    return segsMemo;
  };
  const windows: WindowSummary[] = windowEls.map((w) => {
    const touching = roomsAtPoint(w.at, roomRects, tol);
    const edgeRoom = touching[0] ?? null;
    // A window on an arc edge no room touches is attributed from the shape (`windowRoom`'s rule
    // in analyze.ts, PS0.12). Its facing is asked exactly as before, of the edge room only.
    const room =
      edgeRoom ??
      (w.host?.arc ? arcWindowRoom({ at: w.at, width: w.width, host: w.host }, roomRects, tol, segs()) : null);
    const box = edgeRoom ? (roomRects.get(edgeRoom) ?? null) : null;
    // A POLYGON/CIRCLE room has no four sides to pick the nearest of, and its bounding box
    // would answer for an edge the window is not on — `windowFacingPage` drops it and falls
    // through to the outward-face probe, which is exact at any wall angle and reads the
    // ring, not the box.
    const facingPage = windowFacingPage(w.at, box, w.host, planCenter, roomRects);
    return {
      id: w.id,
      room,
      width: w.width,
      ...(w._relation ? { relation: relationText(w._relation) } : {}),
      ...(w.windowKind !== undefined ? { kind: w.windowKind } : {}),
      ...(w._corner?.with !== undefined ? { corner_with: w._corner.with } : {}),
      facing: toCompass(facingPage, northTurns),
      ...(northTurns !== 0 ? { facingPage } : {}),
      ...(heights ? { sill: w.sill, head: w.head } : {}),
    };
  });

  const openings: OpeningSummary[] = openingEls.map((o) => {
    const { between, straddles } = connectorConnection(o, roomRects, tol);
    return {
      id: o.id,
      between,
      ...(straddles ? { straddles } : {}),
      width: o.width,
      ...(o._relation ? { relation: relationText(o._relation) } : {}),
      ...(heights ? { head: o.head } : {}),
      ...centrelineAt(o),
    };
  });

  // The `clear` measure's obstacle world, built only when a piece declares a zone, so a plan
  // without one does no new work.
  const clearWorld = furnEls.some((f) => f._clear) ? clearWorldOf(furnEls, ir.walls, doorEls) : undefined;
  const furniture: FurnitureSummary[] = furnEls.map((f) => ({
    id: f.id,
    category: f.category,
    ...(f.label !== undefined ? { label: f.label } : {}),
    ...(f.room !== undefined ? { room: f.room } : {}),
    ...(f.rotate ? { rotate: f.rotate } : {}),
    ...instanceOf(f),
    ...(f._relation !== undefined ? { relation: f._relation } : {}),
    ...(f._facing !== undefined ? { facing: f._facing } : {}),
    ...(f._clear && clearWorld ? { clear: clearFacts(f, f._clear, clearWorld) } : {}),
  }));

  const verticals: VerticalSummary[] = verticalEls.map((v) => ({
    id: v.id,
    kind: v.kind as VerticalKind,
    ...(v.kind === "elevator" ? {} : { dir: v.dir }),
    room: roomOfVertical(v, roomEls),
    bbox: rectOf(v),
    ...(v.kind === "stair" ? { flight_width: v.width } : {}),
    ...(isBlockStair(v) ? blockStairFacts(v) : {}),
  }));

  // A void's owning room is the room whose FLOOR holds the opening's CENTRE — through the
  // poly-aware `pointInRoomBox`, never the bounding box. The box is the wrong datum for a
  // concave room (its notch is inside the box and outside the floor).
  // A `polygon` void belongs to the room that holds most of it: each grid cell of its ring
  // votes its area for the room whose floor holds the cell's centre, and the largest total wins
  // (the first room written on a tie). The cells are a set the frame carries onto itself, so the
  // answer is the same however the void is placed, which a single probe point chosen in page
  // order (`polygonLabelPoint`'s scan, or "the largest piece") is not.
  const ownerOfRing = (v: RVoid): RRoom | undefined => {
    const votes = new Map<string, number>();
    for (const p of voidPieces(v)) {
      const c = { x: p.at.x + p.size.w / 2, y: p.at.y + p.size.h / 2 };
      const r = roomEls.find((room) => pointInRoomBox(c, roomRects.get(room.id)!));
      if (r) votes.set(r.id, (votes.get(r.id) ?? 0) + p.size.w * p.size.h);
    }
    let best: RRoom | undefined;
    for (const r of roomEls) if ((votes.get(r.id) ?? 0) > (best ? votes.get(best.id)! : 0)) best = r;
    return best;
  };
  const voids: VoidSummary[] = voidEls.map((v) => {
    const centre = { x: v.at.x + v.size.w / 2, y: v.at.y + v.size.h / 2 };
    const owner = v.parts ? ownerOfRing(v) : roomEls.find((r) => pointInRoomBox(centre, roomRects.get(r.id)!));
    return {
      id: v.id,
      at: { ...v.at },
      size: { ...v.size },
      room: owner ? owner.id : null,
      ...(v.poly ? { polygon: v.poly.map((p) => ({ ...p })), area_m2: r2(polygonArea(v.poly) / 1_000_000) } : {}),
      ...(v.rail ? { rail: [...v.rail] } : v.railEdges ? { rail: [...v.railEdges] } : {}),
    };
  });

  // Ground surfaces. The area is the EXACT shoelace for a ring and w x h for a
  // rectangle — never the bounding box, which for a garden edge would be wildly wrong and
  // is exactly the derived-position defect class the project closed six instances of.
  const outdoor: OutdoorSummary[] = outdoorEls.map((o) => ({
    id: o.id,
    kind: o.surface,
    ...(o.label !== undefined ? { label: o.label } : {}),
    area_m2: r2((o.poly ? polygonArea(o.poly) : o.size.w * o.size.h) / 1_000_000),
    bbox: { x: o.at.x, y: o.at.y, w: o.size.w, h: o.size.h },
    // Present on a balcony and absent on every other kind, INCLUDING when the list is
    // empty: `rail: []` on a balcony means "no railing", which is a different fact from
    // "railings do not apply to this thing".
    ...(o.rail ? { rail: [...o.rail] } : {}),
  }));

  const fences: FenceSummary[] = fenceEls.map((f) => {
    let len = 0;
    for (let i = 0; i + 1 < f.points.length; i++) {
      len += Math.hypot(f.points[i + 1]!.x - f.points[i]!.x, f.points[i + 1]!.y - f.points[i]!.y);
    }
    if (f.closed && f.points.length > 2) {
      const a = f.points[f.points.length - 1]!;
      const b = f.points[0]!;
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return { id: f.id, style: f.style, length_mm: r2(len), closed: f.closed };
  });

  // The main entrance (PS0.10) rides on the access graph, appended, only on a storey with more
  // than one entrance. Circulation keeps measuring each room from its nearest entrance.
  const access = withMainEntrance(
    buildDoorAccessGraph(roomEls, doorEls, tol, undefined, openingEls, openRunsOf(ir, tol)),
    entranceInputs(ir, roomRects, upperStorey),
  );
  const circulation = computeCirculation(
    roomEls,
    ir.walls,
    doorEls,
    openingEls,
    furnEls,
    access,
    tol,
    undefined,
    verticalEls,
    voidEls.flatMap(voidPieces),
    arrivals,
  );

  // Drawing extent: union of wall points and sized-element rectangles.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const ext = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const w of ir.walls) for (const p of w.points) ext(p.x, p.y);
  for (const rect of roomRects.values()) {
    ext(rect.x, rect.y);
    ext(rect.x + rect.w, rect.y + rect.h);
  }
  const bbox = minX === Infinity ? { w: 0, h: 0 } : { w: maxX - minX, h: maxY - minY };
  // Outer-face extent: the same union taken over each wall's OFFSET rectangle, so the
  // box lands on the wall faces rather than their centerlines (the shared helper the
  // `dims auto` overall chain measures with).
  const ob = outerFaceBounds(ir.walls, [...roomRects.values()]);
  const bbox_outer = Number.isFinite(ob.minX) ? { w: ob.maxX - ob.minX, h: ob.maxY - ob.minY } : { w: 0, h: 0 };

  const floorArea = r2(rooms.reduce((s, r) => s + r.area_m2, 0));
  // Skipped on the accessible-caption path (`captionForPlan`, inside `compile()`): the caption
  // never reads it, so `compile()` does none of this unbudgeted work.
  const gia = withGrossArea ? grossInternalArea(ir.walls) : null;
  // Past its counted cap this says nothing: the figure stands, and no list is guessed at.
  const shells = gia?.ok
    ? openShells({
        walls: ir.walls,
        segs: segs(),
        rooms: roomEls,
        rects: roomRects,
      })
    : null;
  const leavesOut = shells && !("refused" in shells) ? shells.rooms.map((r) => r.id) : [];
  const totals = {
    rooms: rooms.length,
    doors: doors.length,
    windows: windows.length,
    floor_area_m2: floorArea,
    // The shell's enclosure, beside the centreline sum: every resolving summary carries exactly
    // one of the two keys.
    ...(gia === null
      ? {}
      : gia.ok
        ? { gross_internal_area_m2: r2(gia.mm2 / 1_000_000) }
        : { gross_internal_area_omitted: gia.reason }),
    ...(leavesOut.length > 0 ? { gross_internal_area_leaves_out: leavesOut } : {}),
    // Never a sum over a subset: one omitted room omits the total.
    ...(rooms.every((r) => r.net_area_m2 !== undefined)
      ? { net_floor_area_m2: r2(rooms.reduce((s, r) => s + (r.net_area_m2 ?? 0), 0)) }
      : {}),
    // Summed from the same already-rounded per-surface numbers the rows report, the way
    // `floor_area_m2` is summed from the rooms — so the total and the list can never
    // disagree by a rounding step. Spread, so a plan with no ground has no key at all.
    ...(outdoor.length > 0 ? { outdoor_area_m2: r2(outdoor.reduce((s, o) => s + o.area_m2, 0)) } : {}),
  };

  // Declared zones. Membership ROLLS UP through nesting (`west` contains everything in
  // `west.galleries`), and each area is summed from the same rounded per-room number
  // `totals.floor_area_m2` uses, so a zone's figure and the room list can never disagree.
  const areaOf = new Map<string, number>(rooms.map((r) => [r.id, r.area_m2]));
  const zones: ZoneSummary[] | undefined =
    ir.zones && ir.zones.length > 0
      ? ir.zones.map((z) => {
          const members = roomEls.filter((r) => inZone(r._zone, z.path)).map((r) => r.id);
          return {
            id: z.id,
            ...(z.label !== undefined ? { label: z.label } : {}),
            path: z.path,
            ...(ir.level !== undefined ? { level: ir.level } : {}),
            rooms: members,
            room_count: members.length,
            floor_area_m2: r2(members.reduce((s, id) => s + (areaOf.get(id) ?? 0), 0)),
          };
        })
      : undefined;

  return {
    plan: ir.name,
    caption: buildCaption({ plan: ir.name, rooms, totals, entrances: access.entrances }),
    ...(ir.accTitle !== undefined ? { accTitle: ir.accTitle } : {}),
    ...(ir.accDescr !== undefined ? { accDescr: ir.accDescr } : {}),
    units: ir.units,
    ...(ir.scale !== undefined ? { scale: ir.scale } : {}),
    // Append-only: present only for a plan that declares `paper`, so every existing
    // summary is unchanged. Read straight off the IR — `resolve()` already picked the
    // operative scale, so describe() and the drawing can never disagree.
    ...(ir.sheet
      ? {
          sheet: {
            paper: ir.sheet.size,
            orientation: ir.sheet.orientation,
            scale_denominator: ir.sheet.denom,
            scale_auto: ir.sheet.auto,
            fits: ir.sheet.fits,
            // Conditional, so a sheet whose whole drawing fits describes byte-identically
            // to every payload before this key existed. See `SheetSummary.drawing_fits`.
            ...(ir.sheet.drawingFits ? {} : { drawing_fits: false as const }),
          },
        }
      : {}),
    bbox,
    bbox_outer,
    ...(ir.axes && ir.axes.length > 0
      ? {
          axes: {
            x: ir.axes.filter((a) => a.axis === "x").map((a) => ({ pos: a.pos, label: a.label })),
            y: ir.axes.filter((a) => a.axis === "y").map((a) => ({ pos: a.pos, label: a.label })),
          },
        }
      : {}),
    // Append-only: present only for a plan that declares `site`, so every existing summary
    // is unchanged. Five names, derived in closed form (`src/site.ts`) — nothing measured.
    // The two LOT facts are appended to the five direction names rather than
    // living beside them, because they come from a different half of the block: the
    // directions are a closed-form table lookup on two words, the lot is measured
    // geometry. Both absent unless the plan declares a `boundary`, so the `site` law — a
    // `site` with only `street`/`hemisphere` describes exactly as before — still holds.
    ...(ir.site ? { site: { ...deriveSite(ir.site), ...lotFacts(ir.siteBoundary) } } : {}),
    // Append-only: present only for a plan that `place`s a component, so every existing
    // summary is unchanged. Copied straight off the IR — the frames the resolver actually
    // applied, never re-derived from the elements.
    ...(ir.instances ? { instances: ir.instances.map((i) => ({ ...i })) } : {}),
    rooms,
    doors,
    windows,
    openings,
    furniture,
    ...(verticals.length > 0 ? { verticals } : {}),
    ...(voids.length > 0 ? { voids } : {}),
    ...(outdoor.length > 0 ? { outdoor } : {}),
    ...(fences.length > 0 ? { fences } : {}),
    // Append-only: present only on a storey that `walls from rooms` derived walls for.
    ...(derivedRows.length > 0 ? { derived_walls: derivedRows } : {}),
    // The vertical datum, under the one gate. `walls` is present even when empty,
    // unlike the lists above: an empty `voids` means "this storey has no holes in it", but
    // an empty `walls` here would be indistinguishable from "heights are not reported",
    // and the block's presence is already the answer to that question.
    ...(heights
      ? {
          heights: {
            storey_height: ir.storeyHeight,
            elevation: ir.elevation,
            // Every wall as drawn: a demolished wall (B3a) still has a height.
            walls: drawnView(ir).walls.map((w) => ({ id: w.id, height: w.height })),
          },
        }
      : {}),
    ...(wallStatus ? { wall_status: wallStatus } : {}),
    access,
    circulation,
    totals,
    input_graph: buildInputGraph(roomEls, doorEls, openingEls, tol, access),
    freedom: {
      ...buildFreedom(roomEls, doorEls, windowEls, openingEls, furnEls),
      ...(derivedRows.length > 0 ? { walls: wallFreedom(ir.walls) } : {}),
    },
    // The drawn schedule, from the same pure derivation the renderer uses — so the table
    // in the SVG and this JSON can never disagree. Opt-in only. `ir.zones` is passed for
    // exactly the same reason: the rows here must be the rows drawn, grouping included.
    ...(ir.schedule === "rooms" ? { schedule: roomSchedule(roomEls, ir.zones, ir.walls).rows } : {}),
    ...(zones ? { zones } : {}),
    // Opt-in derived facts: computed and present ONLY when requested, so the default
    // summary is byte-identical. The logic lives in `analyze/symmetry.ts`/`analyze/syntax.ts`.
    ...(facts.includes("symmetry") ? { symmetry: symmetryFacts(ir) } : {}),
    ...(facts.includes("syntax") ? { syntax: syntaxFacts(access) } : {}),
    ...(facts.includes("depends") && statements ? { depends: dependsFacts(ir, statements) } : {}),
  };
}

/**
 * Does an element declared in zone `member` belong to the zone at `path`? True for the
 * zone itself and for anything nested inside it — membership rolls up, and the test is on
 * whole dotted segments, so `west` never captures `westwing`.
 */
function inZone(member: string | undefined, path: string): boolean {
  return member !== undefined && (member === path || member.startsWith(`${path}.`));
}

/**
 * Produce a {@link SceneSummary} for ArchLang `source`. Never throws on a
 * user-source problem: on fatal errors it returns `{ ok: false, …empty…,
 * diagnostics }`; otherwise `{ ok: true, … }` with the full summary.
 *
 * @example
 * const s = describe(`plan "X" { room at (0,0) size 4000x3000 label "R" }`);
 * s.totals.floor_area_m2; // 12
 */
export function describe(source: string, opts: DescribeOptions = {}): SceneSummary {
  const w = opts.wastePct;
  if (w !== undefined && !(Number.isFinite(w) && w >= 0 && w <= MAX_WASTE_PCT))
    throw new RangeError(`describe: wastePct must be a number from 0 to ${MAX_WASTE_PCT}, got ${String(w)}`);
  return describeWithAutoIds(source, opts).summary;
}

/**
 * @internal {@link describe}, plus the ids of the summary's top-level `rooms[]` whose id was
 * an assigned positional auto-id (`room_<n>`) rather than author-declared — read from the
 * SAME resolve, so `diffPlans` needs no second resolve and no guess from the id's spelling.
 * Not public API: `describe()`'s own output is exactly what it was (the flag never reaches
 * a `RoomSummary`), and the set is a side channel for the diff alone.
 */
export function describeWithAutoIds(
  source: string,
  opts: DescribeOptions = {},
): { summary: SceneSummary; autoRoomIds: ReadonlySet<string>; fabric: DiffFabric } {
  const { ir, diagnostics, levels, plan } = resolvePlan(source, opts);
  const autoRoomIds = new Set<string>();
  if (ir)
    for (const e of ir.elements) if (e.kind === "room" && (e as RRoom)._idAuthored !== true) autoRoomIds.add(e.id);
  const statements = plan && opts.facts?.includes("depends") ? indexStatements(plan) : undefined;
  return {
    summary: summarizeResolved(ir, diagnostics, levels, opts, statements, plan),
    autoRoomIds,
    fabric: diffFabricOf(ir),
  };
}

/**
 * @internal One wall as `diffPlans` compares it, read from the same resolve as the summary
 * (the lowest storey, like `describe()`'s top-level arrays). Not public API and never part of
 * `describe()`'s output. `key` pairs it with the other side: its resolved id, with `@<n>` on
 * the n-th wall sharing an id. `name` is what a person reads: `wall "<authored id>"`, or the
 * room relation of a derived wall (`wallPhraseOf`), never its internal name.
 */
export interface DiffWallFact {
  key: string;
  name: string;
  /** The wall's id when it is an authored statement; absent on a derived wall. */
  id?: string;
  category: string;
  thickness: number;
  closed: boolean;
  points: Point[];
  /** Per segment index: the arc's radius and signed sweep, absent for a straight run. */
  arcs: Array<{ r: number; sweep: number } | undefined>;
  /** The rooms the wall stands by, by relation: a derived partition's or a pairwise wall's
   *  pair, an `around` list, or `"rooms"` for a derived ring (it follows the room union). */
  follows?: string[] | "rooms";
}

/** @internal An opening's host as `diffPlans` compares it. */
export interface DiffHostFact {
  /** The {@link DiffWallFact.key} of the wall it stands in, or null when it stands in none. */
  wall: string | null;
  /** The host part of a relational placement as written (`between a and b`, `on r.top`). */
  relation?: string;
  /** How a person names the opening when its id cannot be typed (a derived `open between`). */
  name?: string;
}

/** @internal The fabric `describe()` does not report, carried beside it for `diffPlans`. */
export interface DiffFabric {
  walls: DiffWallFact[];
  hosts: Map<string, DiffHostFact>;
}

function sameSegment(w: RWallFact, a: Point, b: Point): boolean {
  const n = w.points.length;
  const last = w.closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const p = w.points[k]!;
    const q = w.points[(k + 1) % n]!;
    if (
      (p.x === a.x && p.y === a.y && q.x === b.x && q.y === b.y) ||
      (p.x === b.x && p.y === b.y && q.x === a.x && q.y === a.y)
    )
      return true;
  }
  return false;
}

/** Linear in walls + openings: one pass each, walls grouped by id once (an opening scans only
 *  the walls sharing its host's id, as `wallOf` picks among them). */
function diffFabricOf(ir: ReturnType<typeof resolvePlan>["ir"]): DiffFabric {
  const walls: DiffWallFact[] = [];
  const hosts = new Map<string, DiffHostFact>();
  if (!ir) return { walls, hosts };
  const byId = new Map<string, Array<{ w: RWallFact; key: string }>>();
  for (const w of ir.walls) {
    const group = byId.get(w.id) ?? [];
    if (group.length === 0) byId.set(w.id, group);
    const key = group.length === 0 ? w.id : `${w.id}@${group.length + 1}`;
    group.push({ w, key });
    // A run an authored wall split off a derived wall is `<name>~<k>`: same relation, run k.
    const run = w._derived ? /~(\d+)$/.exec(w.id) : null;
    const rel = w._relation;
    const follows: DiffWallFact["follows"] = w._derived
      ? w._derived.between
        ? [...w._derived.between]
        : "rooms"
      : rel && "between" in rel
        ? [...rel.between]
        : rel && "around" in rel
          ? [...rel.around]
          : undefined;
    walls.push({
      key,
      name: `${wallPhraseOf(w)}${run ? ` (run ${run[1]})` : ""}`,
      ...(w._derived ? {} : { id: w.id }),
      category: w.category,
      thickness: w.thickness,
      closed: w.closed,
      points: w.points.map((p) => ({ x: p.x, y: p.y })),
      arcs: (w.arcs ?? []).map((a) => (a ? { r: a.r, sweep: a.sweep } : undefined)),
      ...(follows !== undefined ? { follows } : {}),
    });
  }
  for (const e of ir.elements) {
    if (e.kind !== "door" && e.kind !== "window" && e.kind !== "opening") continue;
    const o = e as RDoor | RWindow | ROpening;
    let wall: string | null = null;
    if (o.host) {
      const group = byId.get(o.host.wallId) ?? [];
      const hit =
        group.length <= 1 ? group[0] : (group.find((g) => sameSegment(g.w, o.host!.a, o.host!.b)) ?? group[0]);
      wall = hit ? hit.key : o.host.wallId;
    }
    const r = o._relation;
    const relation = r ? (r.between ? `between ${r.between[0]} and ${r.between[1]}` : `on ${r.edge}`) : undefined;
    // An `open between` opening derived with no `id=` has an id no one can type (`A|B:open`).
    const d = o.kind === "opening" ? (o as ROpening)._derived : undefined;
    const name = d && !d.idAuthored ? `opening between ${d.between[0]} and ${d.between[1]}` : undefined;
    hosts.set(o.id, { wall, ...(relation !== undefined ? { relation } : {}), ...(name !== undefined ? { name } : {}) });
  }
  return { walls, hosts };
}

function summarizeResolved(
  ir: ReturnType<typeof resolvePlan>["ir"],
  diagnostics: Diagnostic[],
  levels: ReturnType<typeof resolvePlan>["levels"],
  opts: DescribeOptions,
  statements?: StatementIndex,
  plan?: PlanNode,
): SceneSummary {
  const tol = opts.adjacencyTolMm ?? DEFAULT_TOL;
  const keeps = ir ? keepResultsOf(ir, levels) : undefined;

  if (!ir) {
    return {
      ok: false,
      plan: "",
      caption: "",
      units: "mm",
      bbox: { w: 0, h: 0 },
      bbox_outer: { w: 0, h: 0 },
      rooms: [],
      doors: [],
      windows: [],
      openings: [],
      furniture: [],
      access: { entrances: [], hasEntrance: false, edges: [], rooms: [] },
      circulation: null,
      totals: { rooms: 0, doors: 0, windows: 0, floor_area_m2: 0, net_floor_area_m2: 0 },
      input_graph: {},
      freedom: emptyFreedom(),
      diagnostics,
    };
  }

  // Vertical connections are a BUILDING fact: they only exist across storeys, so they
  // are computed once from the whole level set and never per level — and BEFORE the
  // storeys are summarised, because a storey reached only by a shaft is walked from the
  // runs that arrive on it (its `circulation`).
  const building = levels.length > 0 ? buildVerticalReport(levels, tol) : undefined;
  const vertical = building?.report;
  const arrivalsOn = (level: number): readonly ArrivingRun[] => building?.arrivals.get(level) ?? [];

  // Multi-storey: the top-level facts are the LOWEST storey (`levels[0].ir === ir`), and
  // `levels` adds one same-shaped summary per storey. `summarize` is reused verbatim per
  // level, so a storey's facts can never be computed a second, different way.
  const perLevel: LevelSummary[] | undefined =
    levels.length > 0
      ? levels.map((l) => ({
          level: l.level,
          ...(l.name !== undefined ? { name: l.name } : {}),
          ...summarize(
            l.ir,
            tol,
            opts.facts,
            arrivalsOn(l.level),
            building?.fromBelow.has(l.level) ?? false,
            statements,
          ),
        }))
      : undefined;

  // The lowest storey's arrivals, so the top level still repeats `levels[0]` exactly.
  const top = summarize(
    ir,
    tol,
    opts.facts,
    levels.length > 0 ? arrivalsOn(levels[0]!.level) : [],
    levels.length > 0 ? (building?.fromBelow.has(levels[0]!.level) ?? false) : false,
    statements,
  );
  // ADR 0033 / PS4.3b: the keeps as static facts, under `depends` (the plan's every keep on the
  // top-level object, a storey's own on its `levels[]` entry), only when the plan declares one.
  if (keeps && plan && top.depends) {
    const facts = keepFacts(plan, ir, levels, keeps, (level) =>
      level === undefined ? top.depends : perLevel?.find((l) => l.level === level)?.depends,
    );
    top.depends = { ...top.depends, keeps: facts };
    for (const l of perLevel ?? []) {
      const own = facts.filter((f) => f.level === l.level);
      if (l.depends && own.length > 0) l.depends = { ...l.depends, keeps: own };
    }
  }
  // PS2.72: the clearance measures, last among the opt-in facts, on each storey and the top.
  if (opts.facts?.includes("clearances")) {
    const c = clearanceFacts(ir, levels);
    top.clearances = c.top;
    for (const l of perLevel ?? []) l.clearances = c.byLevel.get(l.level)!;
  }
  // B4: the geometric quantities, after the clearances, on each storey and the top (the lowest
  // storey's, as every top-level fact is).
  if (opts.facts?.includes("quantities")) {
    top.quantities = quantityFacts(ir, opts.wastePct);
    for (const l of perLevel ?? [])
      l.quantities = quantityFacts(levels.find((x) => x.level === l.level)!.ir, opts.wastePct);
  }
  return {
    ok: true,
    ...top,
    totals: withAllLevelsGrossArea(top.totals, perLevel),
    ...(perLevel ? { levels: perLevel } : {}),
    ...(vertical ? { vertical } : {}),
    diagnostics,
    // ADR 0033: the plan's keeps, measured, LAST and only when it declares one, so every byte
    // before it is what it was (PS4.3 design §3.3).
    ...(keeps ? { keeps: keeps.map(keepSummary) } : {}),
  };
}

/**
 * The top-level totals with the building's gross internal area inserted right after the
 * storey's own (so the key order reads storey figure, building figure): the sum over every
 * storey, or the first storey whose figure is omitted. A single-storey plan's building is its
 * one storey.
 */
function withAllLevelsGrossArea(
  totals: SceneSummary["totals"],
  perLevel: LevelSummary[] | undefined,
): SceneSummary["totals"] {
  const storeys = perLevel ? perLevel.map((l) => ({ level: l.level, t: l.totals })) : [{ level: undefined, t: totals }];
  const missing = storeys.find((s) => s.t.gross_internal_area_m2 === undefined);
  const left = storeys.flatMap((s) =>
    s.t.gross_internal_area_leaves_out
      ? [{ ...(s.level !== undefined ? { level: s.level } : {}), rooms: s.t.gross_internal_area_leaves_out }]
      : [],
  );
  const building = missing
    ? {
        gross_internal_area_all_levels_omitted: {
          ...(missing.level !== undefined ? { level: missing.level } : {}),
          reason: missing.t.gross_internal_area_omitted ?? ("no-closed-exterior-ring" as const),
        },
      }
    : {
        gross_internal_area_all_levels_m2: r2(storeys.reduce((n, s) => n + (s.t.gross_internal_area_m2 ?? 0), 0)),
        ...(left.length > 0 ? { gross_internal_area_all_levels_leaves_out: left } : {}),
      };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(totals)) {
    out[k] = v;
    if (k === "gross_internal_area_m2" || k === "gross_internal_area_omitted") Object.assign(out, building);
  }
  return out as SceneSummary["totals"];
}

/**
 * Top-level {@link SceneSummary} keys that are OPTIONAL and vary from storey to storey.
 *
 * {@link describeLevel} spreads that storey's facts over the whole-plan ones, so a key
 * this storey does not have must be DELETED rather than left standing from the previous
 * spread — otherwise the narrowed read reports another floor's facts under its own name.
 * Exported so a test can hold each one to that rule.
 *
 * `heights` is deliberately NOT here: its gate is whole-PLAN (`_heightsAuthored`), so
 * when the block exists at all it exists on every storey.
 */
export const PER_STOREY_OPTIONAL_KEYS = [
  "verticals",
  "voids",
  "derived_walls",
  // B3a: a storey's walls' remodel status, present only on a storey that writes one.
  "wall_status",
] as const satisfies readonly (keyof SceneSummary)[];

/**
 * Narrow a whole-plan summary to ONE storey: that level's facts become the top-level
 * ones (they are the same shape — see {@link LevelSummary}) and `levels` narrows to it
 * alone. A plan that declares no such level is returned unchanged.
 *
 * This is a DISPLAY filter, and the law it carries is that a display filter never
 * changes a verdict: `ok` and `diagnostics` still come from the whole plan, so reading
 * one floor can never make a broken building look sound. Callers that report an exit
 * code or a status must take it from the UNFILTERED summary.
 *
 * Pure and deterministic like everything else here — it reshapes an existing summary
 * and never re-resolves the plan. Behind `arch describe --level N` and the playground's
 * storey switcher, which is why it lives in the core rather than in one of them: a
 * second copy is a second place to forget a per-storey key.
 */
export function describeLevel(summary: SceneSummary, level: number): SceneSummary {
  const want = summary.levels?.find((l) => l.level === level);
  if (!want) return summary;
  const { level: _l, name: _n, ...facts } = want;
  const out: SceneSummary = { ...summary, ...facts, levels: [want] };
  // Optional per-storey keys are absent from `facts` when THIS storey has none, so the
  // spread would leave the previous top-level value (page 1's) standing and the narrowed
  // read would lie. Whole-BUILDING keys (`vertical`) legitimately survive; per-storey
  // ones must not. A LIST rather than one `if`, because there are two of these now
  // (`voids` too) and the failure mode of forgetting the next one is silent:
  // the narrowed read reports the wrong storey's facts and says nothing.
  for (const k of PER_STOREY_OPTIONAL_KEYS) {
    if (facts[k] === undefined) delete out[k];
  }
  return out;
}

/** The declared clear zones of one piece, each with its measured free depth (ADR 0029 §4). */
function clearFacts(
  f: RFurniture,
  c: { front?: number; sides?: number },
  world: ClearWorld,
): { front?: ClearFact; sides?: ClearFact } {
  const out: { front?: ClearFact; sides?: ClearFact } = {};
  if (c.front !== undefined)
    out.front = { declared: c.front, measured: measureClear(f, "front", c.front, world).measured };
  if (c.sides !== undefined)
    out.sides = { declared: c.sides, measured: measureClear(f, "sides", c.sides, world).measured };
  return out;
}
