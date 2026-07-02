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

import type { ResolvedPlan, RRoom, RDoor, RWindow, ROpening, RFurniture } from "./ir.js";
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
  /** Floor area in square metres, rounded to 2 decimals. */
  area_m2: number;
  bbox: BBox;
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

/** The semantic summary of a plan. `ok` is false when fatal errors prevented
 *  resolution; inspect `diagnostics` in that case (the lists will be empty). */
export interface SceneSummary {
  ok: boolean;
  plan: string;
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
  totals: { rooms: number; doors: number; windows: number; floor_area_m2: number };
  /** All problems from parse/link/resolve, with byte spans and codes. */
  diagnostics: Diagnostic[];
}

/** Round to 2 decimals, deterministically (avoids float drift in output). */
const r2 = (n: number): number => Math.round(n * 100) / 100;

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
    return {
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      uses: [...roomUses(r)],
      area_m2: r2((r.size.w * r.size.h) / 1_000_000),
      bbox: rect,
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

  const windows: WindowSummary[] = windowEls.map((w) => {
    const touching = roomsAtPoint(w.at, roomRects, tol);
    return { id: w.id, room: touching[0] ?? null, width: w.width };
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

  return {
    plan: ir.name,
    units: ir.units,
    ...(ir.scale !== undefined ? { scale: ir.scale } : {}),
    bbox,
    rooms,
    doors,
    windows,
    openings,
    furniture,
    access,
    totals: { rooms: rooms.length, doors: doors.length, windows: windows.length, floor_area_m2: floorArea },
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
      units: "mm",
      bbox: { w: 0, h: 0 },
      rooms: [],
      doors: [],
      windows: [],
      openings: [],
      furniture: [],
      access: { entrances: [], hasEntrance: false, edges: [], rooms: [] },
      totals: { rooms: 0, doors: 0, windows: 0, floor_area_m2: 0 },
      diagnostics,
    };
  }

  return { ok: true, ...summarize(ir, tol), diagnostics };
}
