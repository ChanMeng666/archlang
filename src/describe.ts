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
import type { Point } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  resolvePlan,
  rectOf,
  roomsAdjacent,
  roomsAtPoint,
  doorConnections,
  roomUses,
  buildDoorAccessGraph,
  DEFAULT_TOL,
  type AnalyzeOptions,
  type AccessGraph,
  type BBox,
} from "./analyze.js";
import { computeCirculation, type CirculationModel } from "./analyze/circulation.js";
import { roomTypeForUses, buildInputGraph } from "./plan-json.js";
import { fmt2 } from "./num-format.js";

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
  /** The room rectangle as a 4-point polygon, clockwise from top-left (v1.13). */
  floor_polygon: { x: number; y: number }[];
  /** Ids of rooms whose edges touch this one (within the adjacency tolerance). */
  adjacent: string[];
}

export interface DoorSummary {
  id: string;
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
}

export type { RoomPlacement, OpeningPlacement, FurniturePlacement } from "./ir.js";

/** How a single placed element's position was authored vs derived (v1.14). */
export interface FreedomElement {
  id: string;
  kind: "room" | "door" | "window" | "opening" | "furniture";
  /** `absolute` = a literal `at (x,y)`; anything else was computed by the
   *  resolver from a higher-level clause (relational/strip/attach/anchor/wall). */
  placement: RoomPlacement | OpeningPlacement | FurniturePlacement;
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
  scale?: string;
  /** Overall drawing extent in mm. */
  bbox: { w: number; h: number };
  rooms: RoomSummary[];
  doors: DoorSummary[];
  windows: WindowSummary[];
  /** Leaf-less cased openings and the spaces they connect. */
  openings: OpeningSummary[];
  furniture: FurnitureSummary[];
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
    elements.push({ id: r.id, kind: "room", placement });
  }

  const opening = (id: string, kind: "door" | "window" | "opening", placement: OpeningPlacement): void => {
    f.openings.total++;
    f.openings[placement]++;
    elements.push({ id, kind, placement });
  };
  for (const d of doors) opening(d.id, "door", d._placement ?? "absolute");
  for (const w of windows) opening(w.id, "window", w._placement ?? "absolute");
  for (const o of openings) opening(o.id, "opening", o._placement ?? "absolute");

  for (const fu of furniture) {
    const placement = fu._placement ?? "absolute";
    f.furniture.total++;
    f.furniture[placement === "against-wall" ? "againstWall" : placement]++;
    elements.push({ id: fu.id, kind: "furniture", placement });
  }

  return f;
}

/** Build the summary from a fully resolved plan. */
function summarize(ir: ResolvedPlan, tol: number): Omit<SceneSummary, "ok" | "diagnostics"> {
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doorEls = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windowEls = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openingEls = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furnEls = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");

  const roomRects = new Map<string, BBox>(roomEls.map((r) => [r.id, rectOf(r)]));

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
      area_m2: r2((r.size.w * r.size.h) / 1_000_000),
      bbox: rect,
      floor_polygon: [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
      ],
      adjacent,
    };
  });

  // Which rooms' perimeters does this opening sit on? (≤2 for a door, 1 for a window.)
  // Shared with the lint connectivity rules — see analyze.ts.
  const doors: DoorSummary[] = doorEls.map((d) => ({
    id: d.id,
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
    const roomRect = room ? (roomRects.get(room) ?? null) : null;
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
  }));

  const access = buildDoorAccessGraph(roomEls, doorEls, tol, undefined, openingEls);
  const circulation = computeCirculation(roomEls, ir.walls, doorEls, openingEls, furnEls, access, tol);

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

  const floorArea = r2(rooms.reduce((s, r) => s + r.area_m2, 0));
  const totals = { rooms: rooms.length, doors: doors.length, windows: windows.length, floor_area_m2: floorArea };

  return {
    plan: ir.name,
    caption: buildCaption({ plan: ir.name, rooms, totals, entrances: access.entrances }),
    ...(ir.accTitle !== undefined ? { accTitle: ir.accTitle } : {}),
    ...(ir.accDescr !== undefined ? { accDescr: ir.accDescr } : {}),
    units: ir.units,
    ...(ir.scale !== undefined ? { scale: ir.scale } : {}),
    bbox,
    rooms,
    doors,
    windows,
    openings,
    furniture,
    access,
    circulation,
    totals,
    input_graph: buildInputGraph(roomEls, doorEls, openingEls, tol),
    freedom: buildFreedom(roomEls, doorEls, windowEls, openingEls, furnEls),
  };
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
  const { ir, diagnostics } = resolvePlan(source, opts);

  if (!ir) {
    return {
      ok: false,
      plan: "",
      caption: "",
      units: "mm",
      bbox: { w: 0, h: 0 },
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

  return { ok: true, ...summarize(ir, tol), diagnostics };
}
