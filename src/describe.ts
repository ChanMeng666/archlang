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
 */

import type {
  ResolvedLevel,
  ResolvedPlan,
  RRoom,
  RDoor,
  RWindow,
  ROpening,
  RFurniture,
  RoomPlacement,
  OpeningPlacement,
  FurniturePlacement,
} from "./ir.js";
import type { Point, VerticalDir } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  resolvePlan,
  rectOf,
  roomAreaMm2,
  roomBox,
  roomsAdjacent,
  roomsAtPoint,
  doorConnections,
  roomUses,
  buildDoorAccessGraph,
  DEFAULT_TOL,
  type AnalyzeOptions,
  type AccessGraph,
  type BBox,
  type RoomBox,
} from "./analyze.js";
import { outerFaceBounds } from "./geometry.js";
import type { PaperOrientation, PaperSize } from "./sheet.js";
import { computeCirculation, type CirculationModel } from "./analyze/circulation.js";
import { roomTypeForUses, buildInputGraph } from "./plan-json.js";
import { roomSchedule, type ScheduleRow } from "./sheet-tables.js";
import {
  type RVertical,
  roomOfVertical,
  type VerticalConnection,
  verticalConnections,
  type VerticalKind,
  verticalReach,
  verticalsOf,
} from "./vertical.js";
import { fmt2 } from "./num-format.js";

export type { ScheduleRow } from "./sheet-tables.js";

export type { VerticalConnection, VerticalKind, VerticalStop } from "./vertical.js";

export type { CirculationModel, RoomCirculation, CirculationRoute } from "./analyze/circulation.js";

export type { BBox } from "./analyze.js";

/** Options for {@link describe}; the shared analysis options plus an adjacency tolerance. */
export interface DescribeOptions extends AnalyzeOptions {
  /**
   * How close (in mm) two room edges may be and still count as adjacent, and how
   * close an opening must be to a room edge to count as serving it. Defaults to
   * 200 mm — wide enough to treat rooms separated by a typical partition wall as
   * adjacent, narrow enough to avoid joining clearly separate rooms.
   */
  adjacencyTolMm?: number;
}

export interface RoomSummary {
  id: string;
  label?: string;
  /** Declared or inferred function(s) of the room (e.g. `["living","kitchen"]`). */
  uses: string[];
  /** Canonical RPLAN-style room category derived from {@link uses} (v1.13). */
  room_type: string;
  /** Floor area in square metres, rounded to 2 decimals. */
  area_m2: number;
  bbox: BBox;
  /**
   * The room's FLOOR as a closed ring (v1.13): a rectangle's four corners clockwise from
   * top-left, or — for a `room polygon` (v1.23) — its authored vertices in source order.
   * This, not `bbox`, is the room's actual shape; `bbox` is the vertex extent.
   */
  floor_polygon: { x: number; y: number }[];
  /**
   * A CIRCULAR room's exact centre + radius (v1.24), present only for `room … circle`.
   * Such a room reports this INSTEAD of a 48-vertex ring: the tessellation is an
   * implementation detail of the grid layer, so `floor_polygon` is `[]` here and
   * `area_m2` is the exact πR². Append-only, like the rest of the summary.
   */
  floor_circle?: { cx: number; cy: number; r: number };
  /** Ids of rooms whose edges touch this one (within the adjacency tolerance). */
  adjacent: string[];
  /** The `place`d instance this room was drawn inside (v1.22); absent at plan level. */
  instance?: string;
  /** The component {@link RoomSummary.instance} was made from. */
  component?: string;
}

export interface DoorSummary {
  id: string;
  /** The `place`d instance this door was drawn inside (v1.22); absent at plan level. */
  instance?: string;
  /**
   * The one or two spaces this door connects: room ids, and/or the literal
   * `"exterior"` when the door sits on an outer wall with open space on one side.
   */
  between: string[];
  width: number;
}

export interface WindowSummary {
  id: string;
  /** The room this window serves, or `null` if it sits on no room edge. */
  room: string | null;
  width: number;
  /**
   * Compass direction the window's wall faces (the outward normal of its host wall
   * segment). ArchLang geometry is rectilinear and +y is DOWN, so a window on a room's
   * TOP edge faces `"N"`, its bottom edge `"S"`, its left edge `"W"`, its right edge
   * `"E"`. When the window has a host {@link WindowSummary.room}, facing is which of
   * that room's four edges the window sits closest to; for a room-less window it is the
   * host wall's orientation resolved to the outward side of the plan (see
   * {@link windowFacing}). Always one of the four; deterministic. (v1.14)
   */
  facing: "N" | "S" | "E" | "W";
}

export interface OpeningSummary {
  id: string;
  /** The one or two spaces this cased opening connects (room ids and/or `"exterior"`). */
  between: string[];
  width: number;
}

export interface FurnitureSummary {
  id: string;
  category: string;
  label?: string;
  /** Declared owning room id (`in <roomId>`), if any. */
  room?: string;
  /**
   * The quarter-turn the drawn symbol carries (0/90/180/270), when it is not 0 — either
   * authored (`rotate`), derived from the backing wall, or carried through a `place`d
   * instance's own turn. Absent for an upright symbol. (v1.22)
   */
  rotate?: number;
  /** The `place`d instance this piece was drawn inside (v1.22); absent at plan level. */
  instance?: string;
  /** The component {@link FurnitureSummary.instance} was made from. */
  component?: string;
}

/**
 * One run of vertical circulation ON THIS STOREY (v1.21). Present in the summary only
 * when the storey draws at least one `stair`/`elevator`/`escalator`, so every existing
 * summary is unchanged. The cross-storey view is {@link SceneSummary.vertical}.
 */
export interface VerticalSummary {
  id: string;
  kind: VerticalKind;
  /** `up`/`down` as declared on THIS storey; absent for an `elevator`. */
  dir?: VerticalDir;
  /** The room whose rectangle contains the footprint's centre, or `null`. */
  room: string | null;
  bbox: BBox;
  /** Flight width across the run (mm) — `stair` only. */
  flight_width?: number;
}

/**
 * The building's **vertical connections** (v1.21): every `stair`/`elevator`/`escalator`
 * id drawn on two or more storeys. Identity is the whole rule — same id, same shaft —
 * so nothing is inferred from geometry (ADR 0005). Present only on a multi-storey plan
 * that actually has one; a run on a single storey is not a connection and is what
 * `W_STAIR_UNMATCHED` reports.
 *
 * `reachable_levels` is the reason this block matters to an agent: a storey with no
 * exterior door of its own is still reachable if a shaft joins it to one that has —
 * which is exactly the reachability `lint` now evaluates per storey.
 */
export interface VerticalReport {
  connections: VerticalConnection[];
  /** Level numbers reachable from the outside once shafts are counted, ascending. */
  reachable_levels: number[];
}

/**
 * One `place`d component instance as a fact (v1.22): its addressable name — which is also
 * the id namespace of everything inside it — the component it was made from, where its
 * local `(0,0)` landed, and the exact rigid transform applied.
 */
export interface InstanceSummary {
  name: string;
  component: string;
  at: { x: number; y: number };
  rotate: 0 | 90 | 180 | 270;
  mirror?: "x" | "y";
}

export type { RoomPlacement, OpeningPlacement, FurniturePlacement } from "./ir.js";

/** How a single placed element's position was authored vs derived (v1.14). */
export interface FreedomElement {
  id: string;
  kind: "room" | "door" | "window" | "opening" | "furniture";
  /** `absolute` = a literal `at (x,y)`; anything else was computed by the
   *  resolver from a higher-level clause (relational/strip/attach/anchor/wall). */
  placement: RoomPlacement | OpeningPlacement | FurniturePlacement;
  /**
   * The `place`d instance this element lives in (v1.22). When present, `placement`
   * describes how the element was authored **inside its component** — its position ON
   * THE PAGE additionally derives from the instance frame, which is the authored-absolute
   * thing (see {@link SceneSummary.instances}). So: an instance is a degree of freedom,
   * and everything inside it is derived from that one. Absent at plan level, so existing
   * reports are unchanged.
   */
  instance?: string;
}

/**
 * Degrees-of-freedom report (v1.14): for each placed element, whether its
 * position was authored **absolutely** or **derived** by the resolver — the
 * "how constrained is this plan" fact an agent reads before editing. Facts only
 * (ADR 0005): no advice, no scoring, no thresholds. Counts per family plus one
 * `elements` row each, in `describe()`'s own emission order (rooms, doors,
 * windows, openings, furniture). Openings pools doors + windows + cased openings.
 */
export interface FreedomReport {
  rooms: { total: number; absolute: number; relational: number; strip: number };
  openings: { total: number; attached: number; absolute: number };
  furniture: { total: number; anchored: number; againstWall: number; absolute: number };
  elements: FreedomElement[];
}

/** One positioning axis as a fact: where the datum is and what it is called. */
export interface AxisSummary {
  /** mm along the axis's own direction (x for a vertical axis, y for a horizontal one). */
  pos: number;
  /** The GB/T label drawn in its bubble — derived from position, never authored. */
  label: string;
}

/**
 * The plan's declared **positioning axes** (定位轴线), in label order: `x` numbered
 * `1 2 3 …` left-to-right, `y` lettered `A B C …` bottom-to-top (so `y[0]` is `A`, the
 * BOTTOM-most axis — +y points down). Absent from the summary entirely when the plan
 * declares no axes, so existing summaries are unchanged.
 */
export interface AxesSummary {
  x: AxisSummary[];
  y: AxisSummary[];
}

/**
 * The sheet facts for a plan that declares `paper` (v1.20): which sheet, which way
 * round, the operative scale denominator, and whether the building fits on it at that
 * scale. `fits: false` is the `W_SCALE_OVERFLOW` condition — the drawing is still
 * produced, on a page grown past the sheet.
 */
export interface SheetSummary {
  paper: PaperSize;
  orientation: PaperOrientation;
  /** The `<denom>` of `1:<denom>` — authored, or chosen by auto-fit. */
  scale_denominator: number;
  /** True when the denominator was chosen by auto-fit (the plan declared no `scale`). */
  scale_auto: boolean;
  fits: boolean;
}

/**
 * One declared **zone** — a wing, a department, a phase — and the rooms it groups (v1.22).
 *
 * Membership is by DECLARATION, never geometry (ADR 0005): a room is listed here because
 * it was written inside that `zone` block, not because the compiler decided it looks like
 * it belongs there. A zone has no geometric semantics at all — deleting every `zone`
 * wrapper from a plan leaves the drawing byte-identical.
 *
 * **Nesting rolls up.** `rooms` lists the zone's own rooms *plus* every room in a zone
 * nested inside it, so `west` reports the whole west wing even when its rooms are written
 * in `west.galleries` and `west.stores`. That makes the list a rollup, not a partition:
 * **summing `floor_area_m2` over `zones` double-counts** whenever zones nest, and it is
 * not the plan total. `totals.floor_area_m2` remains the one whole-plan figure. (The
 * drawn ROOM SCHEDULE groups by the *innermost* zone instead, so its subtotals do
 * partition the rooms and do add up to its TOTAL.)
 */
export interface ZoneSummary {
  /** The zone's own id — the last segment of {@link path}. */
  id: string;
  /** The printed name from `zone west "West wing"`, when the source gave one. */
  label?: string;
  /** Dotted path from the outermost enclosing zone (`"west.galleries"`). Its identity —
   *  the value `describe --zone` selects on, and what `id` alone cannot disambiguate. */
  path: string;
  /** The storey this zone was declared on, for a multi-storey plan. Absent otherwise. */
  level?: number;
  /** Member room ids in source order — the zone's own rooms and every nested zone's. */
  rooms: string[];
  room_count: number;
  /** Sum of the member rooms' (rounded) areas, in m². See the rollup caveat above. */
  floor_area_m2: number;
}

/**
 * One **storey** of a multi-storey plan as facts: the level number and name plus the exact
 * same fact shape a single-storey plan reports at the top level (rooms, areas, adjacency,
 * access, circulation, totals, freedom, …). So an agent reads `levels[i]` with the code it
 * already has for a whole plan — a storey IS a plan.
 */
export interface LevelSummary extends Omit<SceneSummary, "ok" | "diagnostics" | "levels" | "vertical"> {
  /** The authored storey number (integer; 0/negative legal). */
  level: number;
  /** The storey's name (`level 1 "Ground floor"`), when the source gave one. */
  name?: string;
}

/** The semantic summary of a plan. `ok` is false when fatal errors prevented
 *  resolution; inspect `diagnostics` in that case (the lists will be empty). */
export interface SceneSummary {
  ok: boolean;
  plan: string;
  /**
   * One deterministic natural-language sentence describing the plan, composed
   * purely from the fields below (plan name, room labels/areas, totals, entrance).
   * Feeds the accessible-SVG `<desc>` (`compile(src, { accessible: true })`) and is
   * useful as ready-made alt text. Empty string when the plan failed to resolve.
   */
  caption: string;
  /**
   * Explicit accessible metadata from the plan-level `accTitle "…"` / `accDescr "…"`
   * keywords, when present. In accessible-SVG output these override the plan name in
   * `<title>` and the derived {@link caption} in `<desc>` respectively; here they are
   * surfaced as facts alongside the always-derived {@link caption}. Absent when the
   * plan declares neither, so existing summaries are unchanged.
   */
  accTitle?: string;
  accDescr?: string;
  units: "mm";
  /**
   * The EFFECTIVE drawing scale, e.g. `"1:200"`. Annotation-only on its own; when
   * {@link sheet} is present it is operative (every annotation size derives from it),
   * and it is the scale auto-fit chose if the plan declared none.
   */
  scale?: string;
  /**
   * The sheet the drawing is issued on — present only when the plan declares `paper`.
   * Absent (the default) means reference-dimension sizing: no paper, and `scale` is a
   * title-block annotation. See [the sheet layer](../src/sheet.ts).
   */
  sheet?: SheetSummary;
  /**
   * Overall drawing extent in mm, measured on wall **centerlines** (the union of raw
   * wall points and room rectangles). This is the coordinate space the source is
   * written in — a room's `at`/`size`, a door's `at`, a wall point — so it is the
   * number to reason with when placing elements. Normative and unchanged.
   */
  bbox: { w: number; h: number };
  /**
   * Overall extent in mm measured on the **outer wall faces** — the building as a
   * builder or a GB/T overall dimension sees it: `bbox` plus half a wall thickness at
   * each end (a 7000×6000 centerline plan inside a 200 shell is 7200×6200 outside).
   * This is what `dims auto`'s outermost chain prints. Use `bbox` for authoring
   * coordinates and `bbox_outer` when quoting the building's size.
   */
  bbox_outer: { w: number; h: number };
  /**
   * The plan's positioning axes (定位轴线) — the datum grid every GB/T dimension is read
   * from, with the labels the drawing prints. Present only when the plan declares an
   * `axes` block; read it to know which coordinates are structural datums (and, with
   * `dims auto rooms|all`, what the middle dimension chain measures).
   */
  axes?: AxesSummary;
  /**
   * The `place`d component instances this drawing is made of (v1.22), in source order:
   * where each one's local origin landed and the rigid transform it carries. Present only
   * when the plan places at least one, so existing summaries are unchanged.
   *
   * This is the block that says WHICH degrees of freedom the plan really has: everything
   * with a matching `instance` field is positioned by its component's own coordinates
   * plus this frame, so moving a wing is one edit here, not N edits inside.
   */
  instances?: InstanceSummary[];
  rooms: RoomSummary[];
  doors: DoorSummary[];
  windows: WindowSummary[];
  /** Leaf-less cased openings and the spaces they connect. */
  openings: OpeningSummary[];
  furniture: FurnitureSummary[];
  /**
   * The vertical-circulation runs drawn on this storey (v1.21) — `stair`, `elevator`,
   * `escalator`. Absent when the storey draws none, so existing summaries are unchanged.
   */
  verticals?: VerticalSummary[];
  /**
   * The modeled access graph: entrances, room reachability/depth from the exterior,
   * and connector edges (doors and cased openings) with estimated clear widths.
   */
  access: AccessGraph;
  /**
   * Circulation facts on a clearance-eroded navigation grid: how far, how wide and
   * how direct the walk is from the entrance to each room, plus key functional
   * routes. Null when the plan has no modeled exterior entrance. Coarse & advisory —
   * facts, never a generated layout (ADR 0008).
   */
  circulation: CirculationModel | null;
  totals: { rooms: number; doors: number; windows: number; floor_area_m2: number };
  /**
   * Interior-door adjacency dict (v1.13): every room id → the ids of rooms it shares
   * a door / cased opening with (exterior entrances excluded). Keys in room source
   * order; each neighbour list sorted by room source order. Empty when the plan
   * failed to resolve. The RPLAN-style `input_graph` an intent check compares against.
   */
  input_graph: Record<string, string[]>;
  /**
   * Degrees-of-freedom placement report (v1.14): which elements were positioned
   * absolutely vs derived by the resolver. Facts only — see {@link FreedomReport}.
   */
  freedom: FreedomReport;
  /**
   * The ROOM SCHEDULE exactly as the sheet draws it (v1.20) — `{ no, id, name, area_m2 }`
   * per room in source order, so an agent can read the numbered table it just rendered
   * without OCR'ing the SVG. Present **only when the plan sets `schedule rooms`**; absent
   * otherwise, so existing summaries are unchanged. `area_m2` matches
   * {@link RoomSummary.area_m2} and the drawn TOTAL matches {@link totals}`.floor_area_m2`.
   * The `legend` setting has no counterpart here on purpose: it is pure rendering, and
   * every fact it shows (wall materials, furniture categories) is already in `furniture`
   * and the source.
   */
  schedule?: ScheduleRow[];
  /**
   * The plan's declared **zones** (v1.22) — wings, departments, phases — in
   * first-declaration order, with the rooms each groups. Present **only** when the plan
   * declares a `zone` block, so every existing summary is unchanged. See
   * {@link ZoneSummary} for the nesting-rollup caveat.
   */
  zones?: ZoneSummary[];
  /**
   * The plan's **storeys**, ascending by level — present **only** when the plan declares
   * `level` blocks (so every existing summary is unchanged).
   *
   * Every field ABOVE describes the LOWEST storey (page 1), because a storey is what a
   * floor plan is: rooms, adjacency and circulation only mean something within one floor.
   * Read `levels` to see the whole building — `levels[0]` repeats the top-level facts.
   * Diagnostics stay whole-plan (aggregated across storeys, each tagged with its `level`).
   */
  levels?: LevelSummary[];
  /**
   * The BUILDING's vertical connections (v1.21) — which shafts join which storeys, and
   * which storeys that makes reachable from outside. A whole-building fact, so it exists
   * only at the top level (never inside `levels[i]`) and only when the plan is
   * multi-storey AND a run appears on two or more of its storeys. See
   * {@link VerticalReport}.
   */
  vertical?: VerticalReport;
  /** All problems from parse/link/resolve, with byte spans and codes. */
  diagnostics: Diagnostic[];
}

/** Round to 2 decimals, deterministically (avoids float drift in output). */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The compass direction a window's wall faces (its outward normal), for
 * {@link WindowSummary.facing}. Pure and deterministic; +y is DOWN.
 *
 * - **With a host room** (the common case): facing is which of the room's four edges the
 *   window point `at` lies closest to — top → `"N"`, bottom → `"S"`, left → `"W"`, right →
 *   `"E"`. Ties (a corner window equidistant from two edges) resolve to the horizontal
 *   edge first (`N`/`S`), then to `N`/`W` — a fixed, documented order so output is stable.
 * - **Without a host room** (`room` is null — the window sits on no room edge): the axis
 *   comes from the host wall segment's orientation (a horizontal segment → `N`/`S`, a
 *   vertical one → `E`/`W`), and the outward side is the half of the plan the window sits
 *   in relative to `planCenter` (above centre → `N`, left of centre → `W`). With no host
 *   segment either, the axis falls back to the window's dominant offset from `planCenter`.
 */
function windowFacing(
  at: Point,
  roomRect: BBox | null,
  host: RWindow["host"],
  planCenter: Point,
): "N" | "S" | "E" | "W" {
  if (roomRect) {
    const dTop = Math.abs(at.y - roomRect.y);
    const dBottom = Math.abs(at.y - (roomRect.y + roomRect.h));
    const dLeft = Math.abs(at.x - roomRect.x);
    const dRight = Math.abs(at.x - (roomRect.x + roomRect.w));
    if (Math.min(dTop, dBottom) <= Math.min(dLeft, dRight)) return dTop <= dBottom ? "N" : "S";
    return dLeft <= dRight ? "W" : "E";
  }
  const horizontal = host
    ? Math.abs(host.a.y - host.b.y) <= Math.abs(host.a.x - host.b.x)
    : Math.abs(at.y - planCenter.y) >= Math.abs(at.x - planCenter.x);
  if (horizontal) return at.y <= planCenter.y ? "N" : "S";
  return at.x <= planCenter.x ? "W" : "E";
}

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
  const s = summarize(ir, tol);
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
    f.openings[placement]++;
    elements.push({ id, kind, placement, ...inst(instance) });
  };
  for (const d of doors) opening(d.id, "door", d._placement ?? "absolute", d._instance);
  for (const w of windows) opening(w.id, "window", w._placement ?? "absolute", w._instance);
  for (const o of openings) opening(o.id, "opening", o._placement ?? "absolute", o._instance);

  for (const fu of furniture) {
    const placement = fu._placement ?? "absolute";
    f.furniture.total++;
    f.furniture[placement === "against-wall" ? "againstWall" : placement]++;
    elements.push({ id: fu.id, kind: "furniture", placement, ...inst(fu._instance) });
  }

  return f;
}

/** Spreadable instance stamp for a resolved element — nothing at all at plan level. */
function instanceOf(e: { _instance?: string; _component?: string }): { instance?: string; component?: string } {
  return e._instance === undefined ? {} : { instance: e._instance, component: e._component };
}

/** Spreadable instance stamp for a {@link FreedomElement}. */
function inst(instance: string | undefined): { instance?: string } {
  return instance === undefined ? {} : { instance };
}

/** Build the summary from a fully resolved plan. */
function summarize(ir: ResolvedPlan, tol: number): Omit<SceneSummary, "ok" | "diagnostics"> {
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doorEls = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windowEls = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openingEls = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furnEls = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const verticalEls: RVertical[] = verticalsOf(ir);

  const roomRects = new Map<string, RoomBox>(roomEls.map((r) => [r.id, roomBox(r)]));

  const rooms: RoomSummary[] = roomEls.map((r) => {
    const rect = roomRects.get(r.id)!;
    const adjacent: string[] = [];
    for (const other of roomEls) {
      if (other.id === r.id) continue;
      if (roomsAdjacent(rect, roomRects.get(other.id)!, tol)) adjacent.push(other.id);
    }
    const uses = roomUses(r);
    return {
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: [...uses],
      room_type: roomTypeForUses(uses),
      area_m2: r2(roomAreaMm2(r) / 1_000_000),
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
  const doors: DoorSummary[] = doorEls.map((d) => ({
    id: d.id,
    ...(d._instance !== undefined ? { instance: d._instance } : {}),
    between: doorConnections(d, roomRects, tol),
    width: d.width,
  }));

  // Plan centre (union of room rectangles) — only the outward-side fallback for a
  // room-less window uses it, but it is cheap and deterministic to compute up front.
  let pcMinX = Infinity,
    pcMinY = Infinity,
    pcMaxX = -Infinity,
    pcMaxY = -Infinity;
  for (const rect of roomRects.values()) {
    if (rect.x < pcMinX) pcMinX = rect.x;
    if (rect.y < pcMinY) pcMinY = rect.y;
    if (rect.x + rect.w > pcMaxX) pcMaxX = rect.x + rect.w;
    if (rect.y + rect.h > pcMaxY) pcMaxY = rect.y + rect.h;
  }
  const planCenter: Point =
    pcMinX === Infinity ? { x: 0, y: 0 } : { x: (pcMinX + pcMaxX) / 2, y: (pcMinY + pcMaxY) / 2 };

  const windows: WindowSummary[] = windowEls.map((w) => {
    const touching = roomsAtPoint(w.at, roomRects, tol);
    const room = touching[0] ?? null;
    const box = room ? (roomRects.get(room) ?? null) : null;
    // A POLYGON room has no four sides to pick the nearest of, and its bounding box
    // would answer for an edge the window is not on — so it falls through to the
    // host-segment rule, which is exact at any wall angle.
    const roomRect = box && !box.poly ? box : null;
    return { id: w.id, room, width: w.width, facing: windowFacing(w.at, roomRect, w.host, planCenter) };
  });

  const openings: OpeningSummary[] = openingEls.map((o) => ({
    id: o.id,
    between: doorConnections(o, roomRects, tol),
    width: o.width,
  }));

  const furniture: FurnitureSummary[] = furnEls.map((f) => ({
    id: f.id,
    category: f.category,
    ...(f.label !== undefined ? { label: f.label } : {}),
    ...(f.room !== undefined ? { room: f.room } : {}),
    ...(f.rotate ? { rotate: f.rotate } : {}),
    ...instanceOf(f),
  }));

  const verticals: VerticalSummary[] = verticalEls.map((v) => ({
    id: v.id,
    kind: v.kind as VerticalKind,
    ...(v.kind === "elevator" ? {} : { dir: v.dir }),
    room: roomOfVertical(v, roomEls),
    bbox: rectOf(v),
    ...(v.kind === "stair" ? { flight_width: v.width } : {}),
  }));

  const access = buildDoorAccessGraph(roomEls, doorEls, tol, undefined, openingEls);
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
  const totals = { rooms: rooms.length, doors: doors.length, windows: windows.length, floor_area_m2: floorArea };

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
    access,
    circulation,
    totals,
    input_graph: buildInputGraph(roomEls, doorEls, openingEls, tol),
    freedom: buildFreedom(roomEls, doorEls, windowEls, openingEls, furnEls),
    // The drawn schedule, from the same pure derivation the renderer uses — so the table
    // in the SVG and this JSON can never disagree. Opt-in only. `ir.zones` is passed for
    // exactly the same reason: the rows here must be the rows drawn, grouping included.
    ...(ir.schedule === "rooms" ? { schedule: roomSchedule(roomEls, ir.zones).rows } : {}),
    ...(zones ? { zones } : {}),
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
 * The building-level vertical report for a multi-storey plan, or `undefined` when no run
 * spans two storeys. A storey is *grounded* when it has its own exterior entrance (the
 * same access-graph fact `lint` reads); reachability then spreads along the shafts.
 */
function buildVerticalReport(levels: readonly ResolvedLevel[], tol: number): VerticalReport | undefined {
  const inputs = levels.map((l) => ({ level: l.level, ir: l.ir }));
  const connections = verticalConnections(inputs);
  if (connections.length === 0) return undefined;
  const grounded = (n: number): boolean => {
    const l = levels.find((x) => x.level === n);
    if (!l) return false;
    const rooms = l.ir.elements.filter((e): e is RRoom => e.kind === "room");
    const doors = l.ir.elements.filter((e): e is RDoor => e.kind === "door");
    const openings = l.ir.elements.filter((e): e is ROpening => e.kind === "opening");
    return buildDoorAccessGraph(rooms, doors, tol, undefined, openings).hasEntrance;
  };
  const reach = verticalReach(inputs, grounded);
  return { connections, reachable_levels: [...reach.reachable].sort((a, b) => a - b) };
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
  const tol = opts.adjacencyTolMm ?? DEFAULT_TOL;
  const { ir, diagnostics, levels } = resolvePlan(source, opts);

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
      totals: { rooms: 0, doors: 0, windows: 0, floor_area_m2: 0 },
      input_graph: {},
      freedom: emptyFreedom(),
      diagnostics,
    };
  }

  // Multi-storey: the top-level facts are the LOWEST storey (`levels[0].ir === ir`), and
  // `levels` adds one same-shaped summary per storey. `summarize` is reused verbatim per
  // level, so a storey's facts can never be computed a second, different way.
  const perLevel: LevelSummary[] | undefined =
    levels.length > 0
      ? levels.map((l) => ({
          level: l.level,
          ...(l.name !== undefined ? { name: l.name } : {}),
          ...summarize(l.ir, tol),
        }))
      : undefined;

  // Vertical connections are a BUILDING fact: they only exist across storeys, so they
  // are computed once from the whole level set and never per level.
  const vertical = levels.length > 0 ? buildVerticalReport(levels, tol) : undefined;

  return {
    ok: true,
    ...summarize(ir, tol),
    ...(perLevel ? { levels: perLevel } : {}),
    ...(vertical ? { vertical } : {}),
    diagnostics,
  };
}
