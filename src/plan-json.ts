/**
 * Structured JSON I/O for ArchLang plans (v1.13) — the machine-native channel an
 * LLM uses to author and read a floor plan without touching `.arch` syntax.
 *
 * The shape follows the **RPLAN / DStruct2Design** convention LLMs are demonstrably
 * trained on: `snake_case`, a canonical `room_type` enum, room rectangles, and an
 * `input_graph` adjacency dict keyed on interior-door connectivity. It is versioned
 * (`version: 1`) and additive.
 *
 * Three entry points, all pure, synchronous, deterministic, zero-dependency:
 *  - {@link planFromJson} — validate a JSON plan (no throw; catalogued `E_JSON_*`
 *    diagnostics naming the offending JSON path) and build the equivalent
 *    {@link PlanNode}. It works by emitting canonical `.arch` text and running the
 *    real parser, so every parse-time check is reused. **Not supported** (by design):
 *    scripting (`let`/`for`/`if`/`component`) and `import` — author those in `.arch`.
 *  - {@link planToJson} — parse + resolve a `.arch` source and project it OUT to the
 *    same shape, enriched with output-only facts (`area`, `floor_polygon`,
 *    `room_count`, `total_area`, `room_types`, `edges`, `input_graph`). Round-trip
 *    law: for a non-scripting, grouped plan, `planFromJson(planToJson(src))` compiles
 *    to byte-identical SVG.
 *  - {@link astToJson} — a faithful, span-bearing projection of a parsed AST (for
 *    `arch ast --json`); scripting nodes appear as their node kind with spans, with
 *    no expansion (so it does not round-trip through {@link planFromJson}).
 *
 * Plus {@link checkGraph} (T3b) — compare an intended adjacency dict against a
 * plan's compiled interior-door connectivity.
 */

import type { AutoDimsMode, CompassWord, FurnitureAnchor, Hemisphere, NorthDir, PlanNode, UseKind } from "./ast.js";
import { AUTO_DIMS_MODES, COMPASS_DIRECTIONS, FURNITURE_ANCHORS, HEMISPHERES, USE_KINDS } from "./ast.js";
import type { RRoom, RDoor, RWindow, ROpening, RFurniture, RDim, RColumn, RWall, ResolvedPlan } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import type { DoorEnumClause, DoorHinge, DoorKind, DoorSlideDir, DoorSwingDir } from "./grammar/tokens.js";
import { DOOR_ENUMS, DOOR_KIND_CLAUSES, DOOR_KINDS, enumList } from "./grammar/tokens.js";
import { parse } from "./parser.js";
import {
  resolvePlan,
  roomUses,
  roomAreaMm2,
  buildDoorAccessGraph,
  EXTERIOR_NODE,
  DEFAULT_TOL,
  type AnalyzeOptions,
} from "./analyze.js";
import { verticalConnections } from "./vertical.js";
import { DEFAULT_MATERIAL } from "./hatches.js";

// ---------------------------------------------------------------------------
// Room-type mapping (uses ⇄ RPLAN-style room_type) — ONE source of truth.
// ---------------------------------------------------------------------------

/** Canonical RPLAN-style room category. `Room` is the catch-all fallback. */
export type RoomType =
  | "LivingRoom"
  | "MasterRoom"
  | "Kitchen"
  | "Bathroom"
  | "DiningRoom"
  | "ChildRoom"
  | "StudyRoom"
  | "SecondRoom"
  | "GuestRoom"
  | "Balcony"
  | "Entrance"
  | "Storage"
  | "Room";

/** Every {@link RoomType} in canonical order (the enum the JSON schema advertises). */
export const ROOM_TYPES: readonly RoomType[] = [
  "LivingRoom",
  "MasterRoom",
  "Kitchen",
  "Bathroom",
  "DiningRoom",
  "ChildRoom",
  "StudyRoom",
  "SecondRoom",
  "GuestRoom",
  "Balcony",
  "Entrance",
  "Storage",
  "Room",
];

/**
 * The canonical `room_type` for each ArchLang `uses` tag. Several uses collapse to
 * one room_type (wet rooms → `Bathroom`; hall/circulation/entry → `Entrance`;
 * storage/utility → `Storage`), so the mapping is deliberately many-to-one in this
 * direction. See {@link ROOM_TYPE_TO_USE} for the (lossy) inverse.
 */
export const USE_TO_ROOM_TYPE: Readonly<Record<UseKind, RoomType>> = Object.freeze({
  living: "LivingRoom",
  kitchen: "Kitchen",
  dining: "DiningRoom",
  bedroom: "MasterRoom",
  bath: "Bathroom",
  wc: "Bathroom",
  hall: "Entrance",
  circulation: "Entrance",
  storage: "Storage",
  utility: "Storage",
  office: "StudyRoom",
  entry: "Entrance",
  // RPLAN has no garage category, and inventing one would put a value in the wire format
  // that the schema's own enum (and therefore every consumer validating against it) does
  // not know. `Storage` is where the many-to-one collapse already sends `utility`, and it
  // is the honest neighbour: a garage is the unconditioned store attached to the house.
  // The inverse is lossy in exactly the way `utility`'s already is — `ROOM_TYPE_TO_USE`
  // maps `Storage` back to `storage`, so a JSON round trip returns `uses storage`. That
  // costs no geometry (a `uses` tag is classification only, so the SVG is byte-identical)
  // and the alternative — a new `Garage` room_type — would be a breaking schema change
  // for a word the format cannot carry back to any other tool.
  garage: "Storage",
});

/**
 * Priority order used to pick a single dominant `room_type` when a room has several
 * `uses` (e.g. a studio is `living kitchen` → `LivingRoom`). The first use present
 * in this order wins.
 */
const USE_PRIORITY: readonly UseKind[] = [
  "living",
  "bedroom",
  "kitchen",
  "dining",
  "office",
  "bath",
  "wc",
  "entry",
  "hall",
  "circulation",
  "storage",
  "utility",
  // Last, beside the other unconditioned stores: a room that is a garage AND something
  // else (`uses garage utility`) reads as the something else on the wire, which is the
  // more informative of the two.
  "garage",
];

/**
 * The primary `uses` tag for each `room_type` — the inverse of {@link USE_TO_ROOM_TYPE}.
 * The RPLAN bedroom variants (`MasterRoom`/`ChildRoom`/`SecondRoom`/`GuestRoom`) all
 * map back to `bedroom`; `Balcony` has no direct ArchLang use so it maps to `utility`;
 * `Room` (the fallback) maps to `null` (no `uses` tag emitted).
 */
export const ROOM_TYPE_TO_USE: Readonly<Record<RoomType, UseKind | null>> = Object.freeze({
  LivingRoom: "living",
  MasterRoom: "bedroom",
  Kitchen: "kitchen",
  Bathroom: "bath",
  DiningRoom: "dining",
  ChildRoom: "bedroom",
  StudyRoom: "office",
  SecondRoom: "bedroom",
  GuestRoom: "bedroom",
  Balcony: "utility",
  Entrance: "entry",
  Storage: "storage",
  Room: null,
});

/** The single canonical `room_type` for a set of `uses` tags (`Room` when empty). */
export function roomTypeForUses(uses: Iterable<UseKind>): RoomType {
  const set = new Set<UseKind>(uses);
  for (const u of USE_PRIORITY) if (set.has(u)) return USE_TO_ROOM_TYPE[u];
  return "Room";
}

/** The `uses` tag(s) a `room_type` implies (empty for `Room` / unknown). */
export function usesForRoomType(roomType: string): UseKind[] {
  const u = (ROOM_TYPE_TO_USE as Record<string, UseKind | null | undefined>)[roomType];
  return u ? [u] : [];
}

// ---------------------------------------------------------------------------
// JSON shape (the wire format). All coordinates are millimetres; areas m².
// ---------------------------------------------------------------------------

export interface PointJson {
  x: number;
  y: number;
}

export interface RoomJson {
  id?: string;
  label?: string;
  room_type: RoomType;
  uses?: UseKind[];
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * An explicit, implicitly-closed simple polygon of ≥3 vertices (v1.23) — the room's
   * floor when it is not a rectangle. Present on OUTPUT for a `room polygon`, and
   * honoured on INPUT, where it replaces `x`/`y`/`width`/`height` (which stay on output
   * as the polygon's bounding box, so a rect-only reader still sees a truthful extent).
   */
  polygon?: PointJson[];
  /** Output-only: floor area in m² (2 dp) — exact (shoelace) for a polygon. Ignored on input. */
  area?: number;
  /** Output-only: the room's floor ring — the rectangle's four corners, or the polygon. */
  floor_polygon?: PointJson[];
}

export interface WallJson {
  id?: string;
  /** Free-form category (e.g. `exterior`, `partition`); also a door/window host ref. */
  category?: string;
  points: PointJson[];
  thickness?: number;
  /** Whether the polyline closes into a loop. */
  closed?: boolean;
  /** Hatch material (omitted when the default poché). */
  material?: string;
  material_scale?: number;
  material_angle?: number;
}

/** Where along a named wall an opening attaches (percentage / mm / `center`). */
export interface OpeningOnJson {
  wall: string;
  at: string;
}

export interface OpeningJson {
  kind: "door" | "window" | "opening";
  id?: string;
  x?: number;
  y?: number;
  /** Wall-attached placement (alternative to `x`/`y`). */
  on?: OpeningOnJson;
  width: number;
  /** Host wall by id or category. */
  wall?: string;
  hinge?: DoorHinge;
  swing?: DoorSwingDir;
  /**
   * The door's kind — `door_kind`, not `kind`, because `kind` already discriminates
   * door/window/opening here. Emitted only when it is not the default `hinged`, so
   * every payload a pre-v1.25 plan produces is byte-identical.
   */
  door_kind?: DoorKind;
  /** Which way a sliding-family panel travels to open. */
  slide?: DoorSlideDir;
  /** How far the panel is drawn open, 0–1. A drawing fact; nothing measured reads it. */
  open?: number;
}

/**
 * One fixture.
 *
 * `x`/`y`/`width`/`height` are always the RESOLVED plan-space footprint, so a reader
 * that only wants to know where the piece ended up can stop there. The placement
 * clause beside them — `centered`/`anchor` (with `room`), or `against_wall` — is the
 * one the author WROTE, and it is what `planJsonToArch` re-emits, because a derived
 * coordinate re-authored as `at (x,y)` is re-snapped by `grid` and lands somewhere
 * else (see {@link import("./ir.js").FurnitureAuthored}). A payload carrying both is
 * not contradictory: the clause is the statement, the coordinates are its result.
 *
 * The one place the two frames differ is `against wall`, whose `.arch` `size` is
 * wall-relative (along × depth) while `width`/`height` here stay plan-axis. `rotate`
 * carries the derived quarter-turn, so the emitter un-turns them; a hand-written
 * payload that gives `against_wall` without `rotate` is read exactly as before.
 */
export interface FurnitureJson {
  category: string;
  id?: string;
  room?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotate?: number;
  /** Room-relative placement: centre the fixture inside `room`. */
  centered?: boolean;
  /** Room-relative placement: anchor the fixture to a corner/edge of `room`. */
  anchor?: FurnitureAnchor;
  inset?: number;
  /** Measure the anchored edge(s) from the backing wall's inner FACE rather than the
   *  room rectangle's centerline edge (`anchor <a> flush`). Emitted only when the
   *  author wrote it, so every payload a flush-free plan produces is unchanged. */
  flush?: boolean;
  /** Wall-anchored placement: back the fixture onto a wall by id/category. */
  against_wall?: string;
  segment?: number;
  offset?: number;
  side?: "left" | "right";
  label?: string;
}

export interface DimJson {
  from: PointJson;
  to: PointJson;
  offset?: number;
  text?: string;
}

export interface ColumnJson {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TitleJson {
  project?: string;
  drawn_by?: string;
  date?: string;
}

/** One connector edge (output-only), from the modeled door/opening access graph. */
export interface EdgeJson {
  from: string;
  to: string;
  via: "door" | "opening";
  /** `front` when it connects the exterior (an entrance); else `interior`. */
  type: "interior" | "front";
}

export interface PlanJson {
  version: 1;
  plan: string;
  units: "mm";
  grid?: number;
  scale?: string;
  north?: "up" | "down" | "left" | "right" | { deg: number };
  /**
   * `site { street … [hemisphere …] }` — the building's relation to its street. Emitted
   * only when the plan declares one, so every existing payload is byte-identical, and
   * accepted on input because Plan JSON is a ROUND-TRIP surface: without it
   * `compile --from-json` would silently drop the site and every derived fact with it.
   */
  site?: { street: CompassWord; hemisphere?: Hemisphere };
  /**
   * `dims auto [overall|rooms|walls|all]` — which automatic dimension chains the render
   * draws. A plan-level SETTING, like `grid`/`scale`/`north`/`site`, and emitted only when
   * the plan declares one, so every pre-existing payload is byte-identical. It is here
   * because it is load-bearing on OUTPUT: the chains it synthesizes grow the drawing
   * extent, so dropping the word silently reflows the whole sheet (a plan that declares
   * `dims auto all` and one that declares nothing render different bytes with no
   * diagnostic). `dims[]` beside it is the unrelated list of EXPLICIT `dim` statements;
   * the two compose exactly as they do in `.arch`.
   */
  dims_auto?: AutoDimsMode;
  /** Output-only enrichments (ignored on input). */
  room_count?: number;
  total_area?: number;
  room_types?: RoomType[];
  rooms: RoomJson[];
  walls: WallJson[];
  openings: OpeningJson[];
  furniture: FurnitureJson[];
  dims?: DimJson[];
  columns?: ColumnJson[];
  title?: TitleJson;
  /** Output-only: connector edges from the access graph. */
  edges?: EdgeJson[];
  /** Output-only: interior-door adjacency dict, keyed by room id. */
  input_graph?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// planToJson — parse + resolve, then project OUT (with enrichments).
// ---------------------------------------------------------------------------

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Rectangle corners of a resolved sized element, clockwise from top-left. */
function rectPolygon(x: number, y: number, w: number, h: number): PointJson[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * The interior-door adjacency dict (`input_graph`): every room id → the ids of
 * rooms it shares a door / cased opening with (exterior entrances excluded). Keys
 * are in room source order; each neighbour list is sorted by room source order, so
 * the result is deterministic. Shared by {@link planToJson}, {@link checkGraph}, and
 * `describe()`.
 */
export function buildInputGraph(
  rooms: RRoom[],
  doors: RDoor[],
  openings: ROpening[],
  tol: number = DEFAULT_TOL,
): Record<string, string[]> {
  const order = rooms.map((r) => r.id);
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const adj = new Map<string, Set<string>>(order.map((id) => [id, new Set<string>()]));
  const access = buildDoorAccessGraph(rooms, doors, tol, undefined, openings);
  for (const e of access.edges) {
    if (e.ambiguous) continue;
    const [a, b] = e.between;
    if (a === EXTERIOR_NODE || b === EXTERIOR_NODE || a === "" || b === "") continue;
    if (!adj.has(a) || !adj.has(b)) continue;
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  const out: Record<string, string[]> = {};
  for (const id of order) {
    out[id] = [...adj.get(id)!].sort((x, y) => (rank.get(x) ?? 0) - (rank.get(y) ?? 0));
  }
  return out;
}

/** Project the modeled access graph to output-only connector {@link EdgeJson}s. */
function buildEdges(rooms: RRoom[], doors: RDoor[], openings: ROpening[], tol: number): EdgeJson[] {
  const access = buildDoorAccessGraph(rooms, doors, tol, undefined, openings);
  const edges: EdgeJson[] = [];
  for (const e of access.edges) {
    if (e.ambiguous || e.between[0] === "" || e.between[1] === "") continue;
    edges.push({
      from: e.between[0],
      to: e.between[1],
      via: e.kind,
      type: e.exterior ? "front" : "interior",
    });
  }
  return edges;
}

/**
 * Project a resolved plan to {@link PlanJson}. Exposed so `describe()`-style callers
 * that already hold IR can reuse it; {@link planToJson} is the source-string entry.
 */
export function resolvedToJson(ir: ResolvedPlan, tol: number = DEFAULT_TOL): PlanJson {
  const roomEls = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doorEls = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windowEls = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openingEls = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furnEls = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const dimEls = ir.elements.filter((e): e is RDim => e.kind === "dim");
  const columnEls = ir.elements.filter((e): e is RColumn => e.kind === "column");

  const rooms: RoomJson[] = roomEls.map((r) => {
    const uses = [...roomUses(r)];
    const area = r2(roomAreaMm2(r) / 1_000_000);
    return {
      id: r.id,
      ...(r.label !== undefined ? { label: r.label } : {}),
      room_type: roomTypeForUses(uses),
      // Explicit authored uses only — an untagged room omits `uses` (its room_type is
      // still derived above), so round-trip regeneration stays byte-identical.
      ...(r.uses && r.uses.length > 0 ? { uses: [...r.uses] } : {}),
      x: r.at.x,
      y: r.at.y,
      width: r.size.w,
      height: r.size.h,
      ...(r.poly ? { polygon: r.poly.map((pt) => ({ x: pt.x, y: pt.y })) } : {}),
      area,
      floor_polygon: r.poly
        ? r.poly.map((pt) => ({ x: pt.x, y: pt.y }))
        : rectPolygon(r.at.x, r.at.y, r.size.w, r.size.h),
    };
  });

  const walls: WallJson[] = ir.walls.map((w: RWall) => ({
    id: w.id,
    category: w.category,
    points: w.points.map((p) => ({ x: p.x, y: p.y })),
    thickness: w.thickness,
    closed: w.closed,
    ...(w.material !== DEFAULT_MATERIAL ? { material: w.material } : {}),
    ...(w.material !== DEFAULT_MATERIAL && w.hatchScale !== 1 ? { material_scale: w.hatchScale } : {}),
    ...(w.material !== DEFAULT_MATERIAL && w.hatchAngle !== 0 ? { material_angle: w.hatchAngle } : {}),
  }));

  // Doors, windows and cased openings in a single array **in source order** — they
  // share render layers, so preserving their interleaving keeps draw order stable.
  const openings: OpeningJson[] = ir.elements
    .filter((e): e is RDoor | RWindow | ROpening => e.kind === "door" || e.kind === "window" || e.kind === "opening")
    .map((e) => {
      const base: OpeningJson = { kind: e.kind, id: e.id, x: e.at.x, y: e.at.y, width: e.width };
      if (e.host?.category !== undefined) base.wall = e.host.category;
      if (e.kind === "door") {
        // A door's clauses are emitted only when its KIND accepts them, because
        // `emitOpening` below turns this payload back into source: writing `hinge` on
        // a pocket door would round-trip into an `E_DOOR_KIND_CLAUSE`. For the default
        // hinged door the table says yes to both, so every existing payload — where
        // `doorKind` is absent by construction — is byte-identical.
        const allowed = DOOR_KIND_CLAUSES[e.doorKind ?? "hinged"];
        if (allowed.hinge) base.hinge = e.hinge;
        if (allowed.swing) base.swing = e.swing;
        if (e.doorKind !== undefined) {
          base.door_kind = e.doorKind;
          if (allowed.slide && e.slide !== undefined) base.slide = e.slide;
          if (allowed.open && e.open !== undefined) base.open = e.open;
        }
      }
      return base;
    });

  // The resolved footprint, PLUS the placement clause the author wrote when there was
  // one. Emitting only the coordinate made this projection lossy in a way nothing
  // reported: `grid` snaps the numbers an author writes, so a position the resolver
  // DERIVED from wall geometry — `anchor … flush`, `against wall …` — came back on the
  // grid instead of on the wall (docs/backlog.md G.4). The clause keys appear only for a
  // piece that was authored with one, so an absolute `at (x,y)` fixture's payload is
  // byte-identical, key order included.
  const furniture: FurnitureJson[] = furnEls.map((f) => {
    const a = f._authored;
    return {
      category: f.category,
      id: f.id,
      x: f.at.x,
      y: f.at.y,
      width: f.size.w,
      height: f.size.h,
      ...(f.rotate ? { rotate: f.rotate } : {}),
      ...(f.room !== undefined ? { room: f.room } : {}),
      ...(a?.mode === "centered" ? { centered: true } : {}),
      ...(a?.mode === "anchor"
        ? {
            anchor: a.anchor,
            ...(f.flush ? { flush: true } : {}),
            ...(a.inset !== undefined ? { inset: a.inset } : {}),
          }
        : {}),
      ...(a?.mode === "against"
        ? {
            against_wall: a.wall,
            ...(a.segment !== undefined ? { segment: a.segment } : {}),
            ...(a.offset !== undefined ? { offset: a.offset } : {}),
            ...(a.side !== undefined ? { side: a.side } : {}),
          }
        : {}),
      ...(f.label !== undefined ? { label: f.label } : {}),
    };
  });

  const dims: DimJson[] = dimEls.map((d) => ({
    from: { x: d.from.x, y: d.from.y },
    to: { x: d.to.x, y: d.to.y },
    offset: d.offset,
    ...(d.text !== undefined ? { text: d.text } : {}),
  }));

  const columns: ColumnJson[] = columnEls.map((c) => ({
    id: c.id,
    x: c.at.x,
    y: c.at.y,
    width: c.size.w,
    height: c.size.h,
  }));

  const roomTypes: RoomType[] = [];
  for (const rm of rooms) if (!roomTypes.includes(rm.room_type)) roomTypes.push(rm.room_type);
  const totalArea = r2(rooms.reduce((s, rm) => s + (rm.area ?? 0), 0));

  const out: PlanJson = {
    version: 1,
    plan: ir.name,
    units: "mm",
    ...(ir.grid > 0 ? { grid: ir.grid } : {}),
    ...(ir.scale !== undefined ? { scale: ir.scale } : {}),
    ...(northIsDefault(ir.north) ? {} : { north: ir.north }),
    // Emitted only when declared, so every payload a pre-site plan produced is unchanged.
    ...(ir.site ? { site: { street: ir.site.street, hemisphere: ir.site.hemisphere } } : {}),
    // Same rule as `site`: emitted only when declared, so a plan that never asked for
    // automatic dimensioning produces exactly the payload it always did.
    ...(ir.autoDims !== undefined ? { dims_auto: ir.autoDims } : {}),
    room_count: rooms.length,
    total_area: totalArea,
    room_types: roomTypes,
    rooms,
    walls,
    openings,
    furniture,
    ...(dims.length > 0 ? { dims } : {}),
    ...(columns.length > 0 ? { columns } : {}),
    ...(ir.title ? { title: titleToJson(ir.title) } : {}),
    edges: buildEdges(roomEls, doorEls, openingEls, tol),
    input_graph: buildInputGraph(roomEls, doorEls, openingEls, tol),
  };
  // `windowEls` intentionally unused beyond its inclusion in `openings`; keep the
  // binding for symmetry with the resolved-element filters above.
  void windowEls;
  return out;
}

function northIsDefault(n: NorthDir): boolean {
  return n === "up";
}

function titleToJson(t: { project?: string; drawnBy?: string; date?: string }): TitleJson {
  return {
    ...(t.project !== undefined ? { project: t.project } : {}),
    ...(t.drawnBy !== undefined ? { drawn_by: t.drawnBy } : {}),
    ...(t.date !== undefined ? { date: t.date } : {}),
  };
}

/**
 * Parse + resolve `source` and project it to {@link PlanJson} with output-only
 * enrichments. On a fatal user-source error, `json` is absent and `diagnostics`
 * carries the problems.
 */
export function planToJson(source: string, opts: AnalyzeOptions = {}): { json?: PlanJson; diagnostics: Diagnostic[] } {
  const { ir, diagnostics } = resolvePlan(source, opts);
  if (!ir) return { diagnostics };
  return { json: resolvedToJson(ir), diagnostics };
}

// ---------------------------------------------------------------------------
// planFromJson — validate the shape, emit canonical .arch, run the real parser.
// ---------------------------------------------------------------------------

/** Diagnostic collector that stamps JSON paths onto shape/kind problems. */
class Validator {
  readonly diags: Diagnostic[] = [];
  err(path: string, msg: string): void {
    this.diags.push({ severity: "error", message: `plan JSON ${path}: ${msg}`, code: "E_JSON_SCHEMA" });
  }
  kindErr(path: string, msg: string): void {
    this.diags.push({ severity: "error", message: `plan JSON ${path}: ${msg}`, code: "E_JSON_KIND" });
  }
  hasError(): boolean {
    return this.diags.some((d) => d.severity === "error");
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/** Validate a `{x,y}` point at `path`; returns it (or null on error). */
function reqPoint(v: unknown, path: string, val: Validator): PointJson | null {
  if (!isObj(v)) {
    val.err(path, "expected an object with numeric x and y");
    return null;
  }
  if (!isNum(v.x)) val.err(`${path}/x`, "expected a number");
  if (!isNum(v.y)) val.err(`${path}/y`, "expected a number");
  return isNum(v.x) && isNum(v.y) ? { x: v.x, y: v.y } : null;
}

/**
 * The `uses` values this format accepts — DERIVED from {@link USE_KINDS}, never retyped.
 *
 * It was a hand-typed twelve-name literal until v1.31, which is the defect class this
 * repository has already shipped four instances of: a fact about the language, copied into
 * something that describes the language, where `check:drift` is structurally blind to it (the
 * gate proves a generator reproduces its own output, never that the output is true). The proof
 * it was live rather than theoretical: adding a thirteenth use kind to `src/ast.ts` left this
 * validator rejecting the new word with `E_JSON_SCHEMA`, so `planToJson` emitted a document
 * its own `planFromJson` refused — a round trip that fails on a plan the compiler accepts.
 * Deriving it is one line and the drift becomes impossible; the same is now true of the
 * `uses` enum inside {@link PLAN_JSON_SCHEMA}.
 */
const USE_SET: ReadonlySet<string> = new Set<string>(USE_KINDS);
const ROOM_TYPE_SET: ReadonlySet<string> = new Set<string>(ROOM_TYPES);
const OPENING_KINDS: ReadonlySet<string> = new Set(["door", "window", "opening"]);

/**
 * Validate `json` against the plan shape (no throw). Returns the value cast to
 * {@link PlanJson} for the emitter, or null when a shape error makes it unusable.
 * Output-only enrichments (`area`, `edges`, …) are ignored.
 */
function validatePlanJson(json: unknown, val: Validator): PlanJson | null {
  if (!isObj(json)) {
    val.err("", "expected a top-level object");
    return null;
  }
  // Guard against scripting/import keys that this form cannot represent.
  for (const k of ["components", "imports", "let", "for", "if", "component"]) {
    if (k in json)
      val.err(`/${k}`, "scripting and imports are not supported in the JSON form — author them in .arch source");
  }
  if ("version" in json && json.version !== 1) val.err("/version", "only version 1 is supported");
  if ("units" in json && json.units !== "mm") val.err("/units", 'only "mm" is supported');
  if (!isStr(json.plan) && json.plan !== undefined) val.err("/plan", "expected a string");

  if (json.site !== undefined) validateSite(json.site, "/site", val);

  // Accept-list DERIVED from the parser's own `AUTO_DIMS_MODES`, never retyped — the same
  // law the `uses` enum learned when a thirteenth use kind made `planToJson` emit a
  // document its own `planFromJson` refused.
  if (
    json.dims_auto !== undefined &&
    !(isStr(json.dims_auto) && (AUTO_DIMS_MODES as readonly string[]).includes(json.dims_auto))
  )
    val.err("/dims_auto", `expected one of ${AUTO_DIMS_MODES.join(", ")}`);

  const rooms = json.rooms;
  if (rooms !== undefined && !Array.isArray(rooms)) val.err("/rooms", "expected an array");
  if (Array.isArray(rooms)) rooms.forEach((r, i) => void validateRoom(r, `/rooms/${i}`, val));

  const walls = json.walls;
  if (walls !== undefined && !Array.isArray(walls)) val.err("/walls", "expected an array");
  if (Array.isArray(walls)) walls.forEach((w, i) => void validateWall(w, `/walls/${i}`, val));

  const openings = json.openings;
  if (openings !== undefined && !Array.isArray(openings)) val.err("/openings", "expected an array");
  if (Array.isArray(openings)) openings.forEach((o, i) => void validateOpening(o, `/openings/${i}`, val));

  const furniture = json.furniture;
  if (furniture !== undefined && !Array.isArray(furniture)) val.err("/furniture", "expected an array");
  if (Array.isArray(furniture)) furniture.forEach((f, i) => void validateFurniture(f, `/furniture/${i}`, val));

  const dims = json.dims;
  if (dims !== undefined && !Array.isArray(dims)) val.err("/dims", "expected an array");
  if (Array.isArray(dims)) dims.forEach((d, i) => void validateDim(d, `/dims/${i}`, val));

  const columns = json.columns;
  if (columns !== undefined && !Array.isArray(columns)) val.err("/columns", "expected an array");
  if (Array.isArray(columns)) columns.forEach((c, i) => void validateColumn(c, `/columns/${i}`, val));

  if (val.hasError()) return null;
  return json as unknown as PlanJson;
}

/** `site` — a required `street` word and an optional `hemisphere`, both from the closed
 *  vocabularies the parser itself checks against (`src/ast.ts`), never a retyped list. */
function validateSite(s: unknown, path: string, val: Validator): void {
  if (!isObj(s)) {
    val.err(path, "expected an object");
    return;
  }
  for (const k of Object.keys(s)) if (k !== "street" && k !== "hemisphere") val.err(`${path}/${k}`, "unknown key");
  if (!(isStr(s.street) && (COMPASS_DIRECTIONS as readonly string[]).includes(s.street)))
    val.err(`${path}/street`, `expected one of ${COMPASS_DIRECTIONS.join(", ")}`);
  if (s.hemisphere !== undefined && !(isStr(s.hemisphere) && (HEMISPHERES as readonly string[]).includes(s.hemisphere)))
    val.err(`${path}/hemisphere`, `expected one of ${HEMISPHERES.join(", ")}`);
}

function validateRoom(r: unknown, path: string, val: Validator): void {
  if (!isObj(r)) {
    val.err(path, "expected an object");
    return;
  }
  // A polygon room carries its ring instead of a rectangle; a rect room still needs all
  // four numbers. Exactly one of the two forms must be usable.
  if (r.polygon !== undefined) {
    if (!Array.isArray(r.polygon)) val.err(`${path}/polygon`, "expected an array of points");
    else {
      if (r.polygon.length < 3) val.err(`${path}/polygon`, "a polygon room needs at least three vertices");
      r.polygon.forEach((pt, i) => void reqPoint(pt, `${path}/polygon/${i}`, val));
    }
  } else {
    for (const key of ["x", "y", "width", "height"]) {
      if (!isNum(r[key])) val.err(`${path}/${key}`, "expected a number");
    }
  }
  if (r.id !== undefined && !isStr(r.id)) val.err(`${path}/id`, "expected a string");
  if (r.label !== undefined && !isStr(r.label)) val.err(`${path}/label`, "expected a string");
  if (r.room_type !== undefined && !(isStr(r.room_type) && ROOM_TYPE_SET.has(r.room_type)))
    val.err(`${path}/room_type`, `expected one of ${ROOM_TYPES.join(", ")}`);
  if (r.uses !== undefined) {
    if (!Array.isArray(r.uses)) val.err(`${path}/uses`, "expected an array");
    else
      r.uses.forEach((u, i) => {
        if (!(isStr(u) && USE_SET.has(u))) val.err(`${path}/uses/${i}`, "unknown room use");
      });
  }
}

function validateWall(w: unknown, path: string, val: Validator): void {
  if (!isObj(w)) {
    val.err(path, "expected an object");
    return;
  }
  if (!Array.isArray(w.points)) {
    val.err(`${path}/points`, "expected an array of points");
  } else {
    if (w.points.length < 2) val.err(`${path}/points`, "a wall needs at least two points");
    w.points.forEach((p, i) => void reqPoint(p, `${path}/points/${i}`, val));
  }
  if (w.thickness !== undefined && !isNum(w.thickness)) val.err(`${path}/thickness`, "expected a number");
  if (w.category !== undefined && !isStr(w.category)) val.err(`${path}/category`, "expected a string");
}

function validateOpening(o: unknown, path: string, val: Validator): void {
  if (!isObj(o)) {
    val.err(path, "expected an object");
    return;
  }
  if (!(isStr(o.kind) && OPENING_KINDS.has(o.kind)))
    val.kindErr(`${path}/kind`, `expected "door", "window", or "opening"${isStr(o.kind) ? ` (got "${o.kind}")` : ""}`);
  if (!isNum(o.width)) val.err(`${path}/width`, "expected a number");
  const hasXY = isNum(o.x) && isNum(o.y);
  const hasOn =
    isObj(o.on) && isStr((o.on as Record<string, unknown>).wall) && isStr((o.on as Record<string, unknown>).at);
  if (!hasXY && !hasOn) val.err(path, "needs either numeric x and y, or an `on` { wall, at } attachment");
  // Both door value sets come from `DOOR_ENUMS` — the same table the parser, the
  // schema below and both `gen:*` generators read — so a JSON payload can never be
  // accepted (or refused) on a different list from the one `.arch` source is held to.
  for (const clause of Object.keys(DOOR_ENUMS) as DoorEnumClause[]) {
    const v = o[clause];
    if (v !== undefined && !(isStr(v) && (DOOR_ENUMS[clause] as readonly string[]).includes(v)))
      val.err(`${path}/${clause}`, `expected ${enumList(DOOR_ENUMS[clause])}`);
  }
  // The kind word — `door_kind` here, because `kind` already discriminates
  // door/window/opening. Held to `DOOR_KINDS`, the same table the parser reads.
  if (o.door_kind !== undefined && !(isStr(o.door_kind) && (DOOR_KINDS as readonly string[]).includes(o.door_kind)))
    val.err(`${path}/door_kind`, `expected ${enumList(DOOR_KINDS)}`);
  if (o.open !== undefined && !(isNum(o.open) && o.open >= 0 && o.open <= 1))
    val.err(`${path}/open`, "expected a number in [0,1]");
}

function validateFurniture(f: unknown, path: string, val: Validator): void {
  if (!isObj(f)) {
    val.err(path, "expected an object");
    return;
  }
  if (!isStr(f.category)) val.err(`${path}/category`, "expected a string");
  const hasAt = isNum(f.x) && isNum(f.y);
  const hasAgainst = isStr(f.against_wall);
  const hasInPlace = (f.centered === true || isStr(f.anchor)) && isStr(f.room);
  if (!hasAt && !hasAgainst && !hasInPlace)
    val.err(path, "needs a placement: `x`/`y`, `against_wall`, or (`centered`/`anchor` with `room`)");
  if (f.rotate !== undefined && !isNum(f.rotate)) val.err(`${path}/rotate`, "expected a number");
  if (f.side !== undefined && f.side !== "left" && f.side !== "right")
    val.err(`${path}/side`, 'expected "left" or "right"');
  // The anchor accept-list is DERIVED from the parser's own `FURNITURE_ANCHORS`, never
  // retyped — the same law `uses` and `dims auto` follow above. It was unchecked here and
  // hand-listed in the schema below, so the two could have disagreed about the language.
  if (f.anchor !== undefined && !(isStr(f.anchor) && (FURNITURE_ANCHORS as readonly string[]).includes(f.anchor)))
    val.err(`${path}/anchor`, `expected ${enumList(FURNITURE_ANCHORS)}`);
  if (f.flush !== undefined && typeof f.flush !== "boolean") val.err(`${path}/flush`, "expected a boolean");
  // `flush` measures from the wall face behind an ANCHORED edge; with no anchor there is
  // no edge, which is the same refusal `.arch` makes (`E_FURN_FLUSH`) — said here rather
  // than emitted into source that would fail later with a span pointing at generated text.
  if (f.flush === true && !isStr(f.anchor))
    val.err(`${path}/flush`, "needs an `anchor` — it measures from an anchored edge");
}

function validateDim(d: unknown, path: string, val: Validator): void {
  if (!isObj(d)) {
    val.err(path, "expected an object");
    return;
  }
  reqPoint(d.from, `${path}/from`, val);
  reqPoint(d.to, `${path}/to`, val);
  if (d.offset !== undefined && !isNum(d.offset)) val.err(`${path}/offset`, "expected a number");
  if (d.text !== undefined && !isStr(d.text)) val.err(`${path}/text`, "expected a string");
}

function validateColumn(c: unknown, path: string, val: Validator): void {
  if (!isObj(c)) {
    val.err(path, "expected an object");
    return;
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!isNum(c[key])) val.err(`${path}/${key}`, "expected a number");
  }
}

// ---- canonical .arch emission ---------------------------------------------

/** Deterministic number → source token (no scientific notation; normalize -0). */
function num(n: number): string {
  if (Object.is(n, -0)) return "0";
  return String(n);
}

/** Escape a literal string for an ArchLang `"…"` template (so `{`/`}`/`"`/`\` stay literal). */
function q(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n") out += "\\n";
    else out += ch;
  }
  return out + '"';
}

const idAttr = (id: string | undefined): string => (id ? `id=${id} ` : "");

/** Emit canonical `.arch` source for a validated {@link PlanJson}. */
function emitArch(p: PlanJson): string {
  const L: string[] = [];
  L.push(`plan ${q(p.plan ?? "")} {`);
  L.push(`  units mm`);
  if (typeof p.grid === "number" && p.grid > 0) L.push(`  grid ${num(p.grid)}`);
  if (typeof p.scale === "string" && /^\d+:\d+$/.test(p.scale)) L.push(`  scale ${p.scale}`);
  if (p.north !== undefined && !(p.north === "up")) {
    L.push(`  north ${typeof p.north === "string" ? p.north : num(p.north.deg)}`);
  }
  // The round-trip half of `site`: without this line a plan that went through Plan JSON
  // would come back with no orientation and every derived fact changed with it.
  if (p.site) {
    L.push(`  site { street ${p.site.street} hemisphere ${p.site.hemisphere ?? "north"} }`);
  }
  // The round-trip half of `dims auto`. Without this line the chains vanish and the
  // drawing extent shrinks around them — a silently smaller sheet, no diagnostic.
  if (p.dims_auto !== undefined) L.push(`  dims auto ${p.dims_auto}`);

  for (const w of p.walls ?? []) {
    const parts = [
      `  wall`,
      `${idAttr(w.id)}${w.category ?? "partition"}`.trim(),
      `thickness ${num(w.thickness ?? 100)}`,
    ];
    if (w.material && w.material !== DEFAULT_MATERIAL) {
      parts.push(`material ${w.material}`);
      if (typeof w.material_scale === "number") parts.push(`scale ${num(w.material_scale)}`);
      if (typeof w.material_angle === "number") parts.push(`angle ${num(w.material_angle)}`);
    }
    const pts = (w.points ?? []).map((pt) => `(${num(pt.x)},${num(pt.y)})`).join(" ");
    parts.push(`{ ${pts}${w.closed ? " close" : ""} }`);
    L.push(parts.join(" "));
  }

  for (const r of p.rooms ?? []) {
    // A polygon room round-trips through its RING, never its bounding box — emitting
    // `at`+`size` for it would quietly turn an L-shaped gallery back into a rectangle.
    const shape =
      r.polygon && r.polygon.length >= 3
        ? `polygon ${r.polygon.map((pt) => `(${num(pt.x)},${num(pt.y)})`).join(" ")}`
        : `at (${num(r.x)},${num(r.y)}) size ${num(r.width)}x${num(r.height)}`;
    let line = `  room ${idAttr(r.id)}${shape}`;
    if (r.label !== undefined) line += ` label ${q(r.label)}`;
    const uses = usesForRoom(r);
    if (uses.length > 0) line += ` uses ${uses.join(" ")}`;
    L.push(line);
  }

  for (const o of p.openings ?? []) L.push(emitOpening(o));

  for (const f of p.furniture ?? []) L.push(emitFurniture(f));

  for (const c of p.columns ?? [])
    L.push(`  column ${idAttr(c.id)}at (${num(c.x)},${num(c.y)}) size ${num(c.width)}x${num(c.height)}`);

  for (const d of p.dims ?? []) {
    let line = `  dim (${num(d.from.x)},${num(d.from.y)})->(${num(d.to.x)},${num(d.to.y)})`;
    if (typeof d.offset === "number") line += ` offset ${num(d.offset)}`;
    if (d.text !== undefined) line += ` text ${q(d.text)}`;
    L.push(line);
  }

  if (p.title) {
    L.push(`  title {`);
    if (p.title.project !== undefined) L.push(`    project ${q(p.title.project)}`);
    if (p.title.drawn_by !== undefined) L.push(`    drawn_by ${q(p.title.drawn_by)}`);
    if (p.title.date !== undefined) L.push(`    date ${q(p.title.date)}`);
    L.push(`  }`);
  }

  L.push(`}`);
  L.push("");
  return L.join("\n");
}

/** The `uses` tags to emit for a room: explicit `uses` win; else derive from `room_type`. */
function usesForRoom(r: RoomJson): UseKind[] {
  if (r.uses && r.uses.length > 0) return r.uses;
  if (r.room_type) return usesForRoomType(r.room_type);
  return [];
}

function emitOpening(o: OpeningJson): string {
  const kw = o.kind;
  let line = `  ${kw} ${idAttr(o.id)}`;
  // The KIND word leads, after any `id=` — `door pocket on w1 at 40% width 900`.
  if (o.kind === "door" && o.door_kind) line += `${o.door_kind} `;
  if (o.on) line += `on ${o.on.wall} at ${o.on.at}`;
  else line += `at (${num(o.x ?? 0)},${num(o.y ?? 0)})`;
  line += ` width ${num(o.width)}`;
  if (!o.on && o.wall) line += ` wall ${o.wall}`;
  if (o.kind === "door") {
    if (o.hinge) line += ` hinge ${o.hinge}`;
    if (o.swing) line += ` swing ${o.swing}`;
    if (o.slide) line += ` slide ${o.slide}`;
    if (o.open !== undefined) line += ` open ${num(o.open)}`;
  }
  return line;
}

function emitFurniture(f: FurnitureJson): string {
  let line = `  furniture ${idAttr(f.id)}${f.category}`;
  let placedIn = false;
  // `against wall`'s `size` is WALL-relative (along × depth) while `width`/`height`
  // carry the plan-axis footprint, so a piece the resolver turned a quarter has them
  // swapped; `rotate` is that quarter-turn, and un-turning by it recovers the pair the
  // author wrote. A payload with no `rotate` — every hand-written one — is unswapped,
  // so this reads exactly as it always did.
  let sizeW = f.width;
  let sizeH = f.height;
  if (f.against_wall && (f.rotate === 90 || f.rotate === 270)) {
    sizeW = f.height;
    sizeH = f.width;
  }
  if (f.against_wall) {
    line += ` against wall ${f.against_wall}`;
    if (typeof f.segment === "number") line += ` segment ${num(f.segment)}`;
    if (typeof f.offset === "number") line += ` offset ${num(f.offset)}`;
    if (f.side) line += ` side ${f.side}`;
  } else if (f.centered && f.room) {
    line += ` in ${f.room} centered`;
    placedIn = true;
  } else if (f.anchor && f.room) {
    // `flush` before `inset` — it re-bases it (room centerline → wall face), and the
    // parser refuses the other order outright.
    line += ` in ${f.room} anchor ${f.anchor}`;
    if (f.flush) line += " flush";
    if (typeof f.inset === "number") line += ` inset ${num(f.inset)}`;
    placedIn = true;
  } else {
    line += ` at (${num(f.x ?? 0)},${num(f.y ?? 0)})`;
  }
  if (typeof sizeW === "number" && typeof sizeH === "number") line += ` size ${num(sizeW)}x${num(sizeH)}`;
  if (f.label !== undefined) line += ` label ${q(f.label)}`;
  if (typeof f.rotate === "number" && !f.against_wall) line += ` rotate ${num(f.rotate)}`;
  // The trailing `in <room>` is what an `against wall` piece with no explicit `side`
  // infers its wall FACE from, so it has to survive — it used to be suppressed here,
  // which was invisible only because nothing ever emitted `against_wall` alongside it.
  if (!placedIn && f.room) line += ` in ${f.room}`;
  return line;
}

/**
 * Validate `json` and emit the canonical `.arch` source it represents (no throw).
 * On a shape/kind error, `source` is absent and `diagnostics` names the JSON path.
 * Exposed so tools can offer a JSON → `.arch` conversion.
 */
export function planJsonToArch(json: unknown): { source?: string; diagnostics: Diagnostic[] } {
  const val = new Validator();
  const model = validatePlanJson(json, val);
  if (!model || val.hasError()) return { diagnostics: val.diags };
  return { source: emitArch(model), diagnostics: val.diags };
}

/**
 * Build a {@link PlanNode} from a JSON plan (the RPLAN/DStruct2Design shape). Never
 * throws: shape problems are returned as catalogued `E_JSON_SCHEMA` / `E_JSON_KIND`
 * diagnostics whose message names the offending JSON path. Internally it emits
 * canonical `.arch` text and runs the real parser (reusing every parse-time check),
 * and also returns that `source` for callers that want to compile it.
 *
 * Not supported (documented): scripting (`let`/`for`/`if`/`component`) and `import`.
 */
export function planFromJson(json: unknown): { ast?: PlanNode; source?: string; diagnostics: Diagnostic[] } {
  const { source, diagnostics } = planJsonToArch(json);
  if (source === undefined) return { diagnostics };
  const { plan, diagnostics: parseDiags } = parse(source);
  return { ast: plan, source, diagnostics: [...diagnostics, ...parseDiags] };
}

// ---------------------------------------------------------------------------
// astToJson — faithful, span-bearing projection of a parsed AST (no expansion).
// ---------------------------------------------------------------------------

/**
 * Project a parsed {@link PlanNode} to a plain, JSON-serializable tree, preserving
 * source spans and leaving scripting nodes (`let`/`for`/`if`/`while`/instances/
 * `set`/`strip`/components/imports) as their node kind — nothing is expanded. This
 * is for `arch ast --json` (inspection); it does **not** round-trip through
 * {@link planFromJson}, which only accepts fully-elaborated geometry.
 */
export function astToJson(ast: PlanNode): object {
  return {
    kind: "plan",
    name: ast.name,
    units: ast.units,
    grid: ast.grid,
    ...(ast.paper ? { paper: ast.paper } : {}),
    ...(ast.scale !== undefined ? { scale: ast.scale } : {}),
    north: ast.north,
    ...(ast.site ? { site: ast.site } : {}),
    ...(ast.autoDims !== undefined ? { autoDims: ast.autoDims } : {}),
    ...(ast.accTitle !== undefined ? { accTitle: ast.accTitle } : {}),
    ...(ast.accDescr !== undefined ? { accDescr: ast.accDescr } : {}),
    ...(ast.title ? { title: ast.title } : {}),
    components: [...ast.components.values()].map((c) => ({
      kind: "component",
      name: c.name,
      params: c.params,
      body: c.body,
      ...(c.span ? { span: c.span } : {}),
    })),
    imports: ast.imports,
    body: ast.body,
    ...(ast.bodyStart !== undefined ? { bodyStart: ast.bodyStart } : {}),
  };
}

// ---------------------------------------------------------------------------
// checkGraph (T3b) — compare an intended adjacency dict to the compiled plan.
// ---------------------------------------------------------------------------

/** The result of comparing an intended adjacency graph against a compiled plan. */
export interface GraphCheck {
  /** True when every intended room resolves and the intended and actual interior
   *  adjacency graphs match exactly (no missing and no extra connections). */
  ok: boolean;
  /** Intended room names that did not resolve to any room in the plan. */
  missing_rooms: string[];
  /** Intended connections absent from the plan (as resolved room-id pairs). */
  missing_connections: [string, string][];
  /** Connections present in the plan but not requested (as resolved room-id pairs). */
  extra_connections: [string, string][];
}

/**
 * Compare an intended room-adjacency dict (`{ room: [neighbours…] }`) against the
 * interior-door connectivity of the compiled `source`.
 *
 * Room-name matching (first match wins, rooms scanned in source order): exact **id**,
 * else case-insensitive **label**, else case-insensitive **room_type**. Comparisons
 * are undirected; output pairs use the plan's resolved room ids and are ordered by
 * room source order, so results are deterministic. On a fatal compile error every
 * intended room is reported missing.
 *
 * **Multi-storey** (`level <n> { … }`, v1.21): the graph is the WHOLE BUILDING's, not
 * page 1's — storeys are scanned in ascending level order and their rooms pooled in that
 * order (a room id that repeats on two storeys resolves to the LOWER storey's room, which
 * is also the rank used for output ordering). Nodes stay rooms: a `stair`/`elevator`/
 * `escalator` drawn with the same id on two storeys contributes ONE extra undirected edge
 * per adjacent pair of its storeys, **between the rooms whose rectangles contain its
 * footprint centre on each of them**. A run whose footprint centre falls in no room on one
 * of the two storeys contributes no edge there, and a run that appears on only one storey
 * contributes nothing at all (that is `W_STAIR_UNMATCHED`).
 */
export function checkGraph(source: string, intent: Record<string, string[]>, opts: AnalyzeOptions = {}): GraphCheck {
  const intentKeys = Object.keys(intent);
  const { ir, levels } = resolvePlan(source, opts);
  if (!ir) {
    return { ok: false, missing_rooms: [...intentKeys], missing_connections: [], extra_connections: [] };
  }
  // Single-storey: the plan IS the building. Multi-storey: pool every storey's rooms in
  // ascending level order, so an intended edge may span floors.
  const plans: ResolvedPlan[] = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const rooms: RRoom[] = [];
  const seenRoomIds = new Set<string>();
  for (const p of plans) {
    for (const r of p.elements) {
      if (r.kind !== "room" || seenRoomIds.has(r.id)) continue;
      seenRoomIds.add(r.id);
      rooms.push(r);
    }
  }
  const rank = new Map<string, number>(rooms.map((r, i) => [r.id, i]));

  // Resolve an intent name → a plan room id (or null).
  const resolveName = (name: string): string | null => {
    const lower = name.toLowerCase();
    for (const r of rooms) if (r.id === name) return r.id;
    for (const r of rooms) if (r.label !== undefined && r.label.toLowerCase() === lower) return r.id;
    for (const r of rooms) if (roomTypeForUses(roomUses(r)).toLowerCase() === lower) return r.id;
    return null;
  };

  const missingRooms: string[] = [];
  const seenMissing = new Set<string>();
  const noteMissing = (name: string): void => {
    if (!seenMissing.has(name)) {
      seenMissing.add(name);
      missingRooms.push(name);
    }
  };

  // Intended undirected edges, as resolved id pairs (canonical order by source rank).
  const pairKey = (a: string, b: string): string => {
    const [x, y] = (rank.get(a) ?? 0) <= (rank.get(b) ?? 0) ? [a, b] : [b, a];
    return `${x} ${y}`;
  };
  const intended = new Map<string, [string, string]>();
  for (const key of intentKeys) {
    const from = resolveName(key);
    if (from === null) noteMissing(key);
    for (const nb of intent[key] ?? []) {
      const to = resolveName(nb);
      if (to === null) {
        noteMissing(nb);
        continue;
      }
      if (from === null || from === to) continue;
      const [x, y] = (rank.get(from) ?? 0) <= (rank.get(to) ?? 0) ? [from, to] : [to, from];
      intended.set(pairKey(from, to), [x, y]);
    }
  }

  // Actual interior adjacency, as the same undirected id pairs — per storey, then the
  // cross-storey edges each vertical shaft contributes.
  const actual = new Map<string, [string, string]>();
  const addActual = (a: string, b: string): void => {
    if (a === b || !rank.has(a) || !rank.has(b)) return;
    const [x, y] = (rank.get(a) ?? 0) <= (rank.get(b) ?? 0) ? [a, b] : [b, a];
    actual.set(pairKey(a, b), [x, y]);
  };
  for (const p of plans) {
    const pr = p.elements.filter((e): e is RRoom => e.kind === "room");
    const pd = p.elements.filter((e): e is RDoor => e.kind === "door");
    const po = p.elements.filter((e): e is ROpening => e.kind === "opening");
    const graph = buildInputGraph(pr, pd, po);
    for (const a of Object.keys(graph)) for (const b of graph[a] ?? []) addActual(a, b);
  }
  if (levels.length > 0) {
    for (const c of verticalConnections(levels.map((l) => ({ level: l.level, ir: l.ir })))) {
      // One edge per ADJACENT pair of the shaft's storeys: a lift serving 1/2/3 links
      // 1–2 and 2–3, never 1–3 (you pass through the intervening floor's room).
      for (let i = 1; i < c.stops.length; i++) {
        const a = c.stops[i - 1]!.room;
        const b = c.stops[i]!.room;
        if (a !== null && b !== null) addActual(a, b);
      }
    }
  }

  const byRank = (p: [string, string], qy: [string, string]): number =>
    (rank.get(p[0]) ?? 0) - (rank.get(qy[0]) ?? 0) || (rank.get(p[1]) ?? 0) - (rank.get(qy[1]) ?? 0);

  const missing: [string, string][] = [];
  for (const [k, pair] of intended) if (!actual.has(k)) missing.push(pair);
  const extra: [string, string][] = [];
  for (const [k, pair] of actual) if (!intended.has(k)) extra.push(pair);
  missing.sort(byRank);
  extra.sort(byRank);

  return {
    ok: missingRooms.length === 0 && missing.length === 0 && extra.length === 0,
    missing_rooms: missingRooms,
    missing_connections: missing,
    extra_connections: extra,
  };
}

// ---------------------------------------------------------------------------
// JSON Schema (2020-12) — ONE source of truth (the gen script just writes it).
// ---------------------------------------------------------------------------

const POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    x: { type: "number", description: "X coordinate in millimetres (origin top-left, +x right)." },
    y: { type: "number", description: "Y coordinate in millimetres (+y DOWN, screen convention)." },
  },
} as const;

/**
 * The JSON Schema (2020-12) for {@link PlanJson}, description-rich for LLM consumption.
 * This object is the single source of truth: `scripts/gen-plan-schema.ts` writes it to
 * `schemas/plan.schema.json` and a drift test regenerates it in-memory to compare.
 */
export const PLAN_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://archlang.uk/plan.schema.json",
  title: "ArchLang Plan",
  description:
    "A floor plan as structured JSON (RPLAN / DStruct2Design convention). Coordinates are millimetres; the origin is top-left with +x right and +y DOWN. Fields marked output-only are produced by planToJson and ignored on input. Scripting (let/for/if/component) and import are not representable — author those in .arch source.",
  type: "object",
  required: ["plan", "rooms", "walls", "openings", "furniture"],
  additionalProperties: false,
  properties: {
    version: { const: 1, description: "Schema version. Always 1." },
    plan: { type: "string", description: "Plan name (shown in the title block)." },
    units: { const: "mm", description: "Distance unit. Only millimetres are supported." },
    grid: { type: "number", description: "Snap module in millimetres; 0 or omitted disables snapping." },
    scale: {
      type: "string",
      pattern: "^\\d+:\\d+$",
      description:
        'Drawing scale, e.g. "1:50". Annotation only in Plan JSON — the operative-scale form needs a `paper` sheet, which is authored in .arch (see the language reference).',
    },
    north: {
      description: "North orientation: a cardinal keyword or an explicit bearing in degrees.",
      oneOf: [
        { enum: ["up", "down", "left", "right"] },
        { type: "object", required: ["deg"], additionalProperties: false, properties: { deg: { type: "number" } } },
      ],
    },
    site: {
      type: "object",
      additionalProperties: false,
      required: ["street"],
      description:
        "Where the building sits relative to its street. `street` is the TRUE compass direction the frontage faces; `hemisphere` (default `north`) decides only which way the equator lies. It draws nothing and moves nothing — it names directions, so a brief can say `equator_side` instead of `S`. NOTE: the derived names ArchLang reports from it (`back`, `equator_side`, `sunrise_side`, `sunset_side`) are a drafting convention, NOT a daylight measurement: there is no sun model, latitude or date anywhere in ArchLang.",
      properties: {
        street: { enum: [...COMPASS_DIRECTIONS], description: "Compass direction the street frontage faces." },
        hemisphere: { enum: [...HEMISPHERES], description: "Hemisphere the building sits in. Defaults to north." },
      },
    },
    dims_auto: {
      enum: [...AUTO_DIMS_MODES],
      description:
        "`dims auto <mode>` — draw automatic dimension chains: `overall` (the two exterior chains), `rooms`, `walls`, or `all`. Omit it and no chains are drawn. This is a SETTING, not the `dims` array beside it: `dims` lists explicit `dim` statements, and the two compose. It affects output — the chains grow the drawing extent — so a document that drops it renders a differently-sized sheet.",
    },
    room_count: { type: "integer", description: "Output-only: number of rooms." },
    total_area: { type: "number", description: "Output-only: total floor area in square metres." },
    room_types: {
      type: "array",
      description: "Output-only: the distinct room_type values present, in first-appearance order.",
      items: { enum: [...ROOM_TYPES] },
    },
    rooms: {
      type: "array",
      description: "Rooms — a rectangle (x/y/width/height) or an explicit `polygon` ring.",
      items: {
        type: "object",
        additionalProperties: false,
        anyOf: [{ required: ["x", "y", "width", "height"] }, { required: ["polygon"] }],
        properties: {
          id: { type: "string", description: "Unique room id (referenced by furniture/openings)." },
          label: { type: "string", description: "Human-readable room label drawn in the room." },
          room_type: {
            enum: [...ROOM_TYPES],
            description: "Canonical RPLAN-style room category (mapped bidirectionally from `uses`).",
          },
          uses: {
            type: "array",
            description: "Explicit ArchLang function tags; authoritative over room_type when present.",
            // Interpolated from USE_KINDS for the reason USE_SET above is: a retyped copy
            // of a closed value set inside a document that DESCRIBES the set is the drift
            // `check:drift` cannot see.
            items: { enum: [...USE_KINDS] },
          },
          x: { type: "number", description: "Top-left corner X in millimetres." },
          y: { type: "number", description: "Top-left corner Y in millimetres." },
          width: { type: "number", description: "Room width in millimetres." },
          height: { type: "number", description: "Room height in millimetres." },
          polygon: {
            type: "array",
            minItems: 3,
            description:
              "An implicitly-closed simple polygon of >=3 vertices — the room's floor when it is not a rectangle. Replaces x/y/width/height on input; on output those remain as its bounding box.",
            items: POINT_SCHEMA,
          },
          area: { type: "number", description: "Output-only: floor area in square metres (2 dp)." },
          floor_polygon: {
            type: "array",
            description:
              "Output-only: the room's floor ring — a rectangle's four corners (clockwise from top-left), or the polygon's own vertices.",
            items: POINT_SCHEMA,
          },
        },
      },
    },
    walls: {
      type: "array",
      description: "Wall polylines (poché-filled; host doors/windows/openings).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["points"],
        properties: {
          id: { type: "string", description: "Unique wall id." },
          category: {
            type: "string",
            description: 'Free-form category, e.g. "exterior" or "partition"; also a host reference.',
          },
          points: { type: "array", minItems: 2, description: "Polyline vertices in order.", items: POINT_SCHEMA },
          thickness: { type: "number", description: "Wall thickness in millimetres." },
          closed: { type: "boolean", description: "Whether the polyline closes back to its first vertex." },
          material: {
            type: "string",
            description: "Hatch material (brick, concrete, …); omitted for the default poché.",
          },
          material_scale: { type: "number", description: "Hatch tile-size multiplier (after material)." },
          material_angle: { type: "number", description: "Extra hatch rotation in degrees (after material)." },
        },
      },
    },
    openings: {
      type: "array",
      description: "Doors, windows and leaf-less cased openings — all must lie on a wall.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "width"],
        properties: {
          kind: { enum: ["door", "window", "opening"], description: "Opening kind." },
          id: { type: "string", description: "Unique opening id." },
          x: { type: "number", description: "Center X in millimetres (on the wall centerline)." },
          y: { type: "number", description: "Center Y in millimetres (on the wall centerline)." },
          on: {
            type: "object",
            additionalProperties: false,
            required: ["wall", "at"],
            description: "Wall-attached placement (alternative to x/y): walk `wall` to position `at`.",
            properties: {
              wall: { type: "string", description: "Host wall id or category to walk." },
              at: {
                type: "string",
                description: 'Position along the wall: a percentage ("40%"), millimetres ("1200"), or "center".',
              },
            },
          },
          width: { type: "number", description: "Opening width in millimetres." },
          wall: { type: "string", description: "Host wall by id or category (else nearest)." },
          hinge: { enum: [...DOOR_ENUMS.hinge], description: "Door hinge side relative to the wall direction." },
          swing: {
            enum: [...DOOR_ENUMS.swing],
            description:
              "Hinged: which side of the wall the leaf sweeps to. Barn/bifold: which face the panel hangs on or folds toward. Not accepted on a sliding or pocket door.",
          },
          door_kind: {
            enum: [...DOOR_KINDS],
            description:
              "Door kind (default `hinged`, in which case this is omitted). A non-hinged kind has no swing arc; `hinge` is not accepted on one.",
          },
          slide: {
            enum: [...DOOR_ENUMS.slide],
            description:
              "Which way a sliding-family panel travels to open, along the wall's direction (as `hinge` is). Sliding family only.",
          },
          open: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
              "How far the panel is DRAWN open, 0–1 (default 0.5). A drawing fact only — no measured output reads it. Sliding family only.",
          },
        },
      },
    },
    furniture: {
      type: "array",
      description: "Furniture and plumbing/kitchen fixtures.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category"],
        properties: {
          category: { type: "string", description: "Furniture category, e.g. bed, sofa, wc, basin, stove." },
          id: { type: "string", description: "Unique furniture id." },
          room: { type: "string", description: "Owning room id (`in <room>`)." },
          x: { type: "number", description: "Top-left corner X in millimetres (resolved footprint)." },
          y: { type: "number", description: "Top-left corner Y in millimetres (resolved footprint)." },
          width: { type: "number", description: "Plan-axis width in millimetres." },
          height: { type: "number", description: "Plan-axis height in millimetres." },
          rotate: { enum: [0, 90, 180, 270], description: "Quarter-turn rotation of the drawn symbol." },
          centered: { type: "boolean", description: "Room-relative placement: centre inside `room`." },
          anchor: {
            // DERIVED from the parser's own `FURNITURE_ANCHORS`, never retyped.
            enum: [...FURNITURE_ANCHORS],
            description: "Room-relative placement: anchor to a corner/edge of `room`.",
          },
          inset: { type: "number", description: "Inset (mm) from the anchored edge." },
          flush: {
            type: "boolean",
            description: "Measure the anchored edge from the backing wall's inner face (needs `anchor`).",
          },
          against_wall: { type: "string", description: "Wall-anchored placement: back onto this wall id/category." },
          segment: { type: "number", description: "Which segment of a multi-segment wall (for against_wall)." },
          offset: { type: "number", description: "Distance (mm) along the segment (for against_wall)." },
          side: { enum: ["left", "right"], description: "Which wall face to back onto (for against_wall)." },
          label: { type: "string", description: "Label for the generic rectangle fallback." },
        },
      },
    },
    dims: {
      type: "array",
      description: "Dimension lines.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to"],
        properties: {
          from: { ...POINT_SCHEMA, description: "Start point." },
          to: { ...POINT_SCHEMA, description: "End point." },
          offset: { type: "number", description: "Perpendicular offset of the dimension line in millimetres." },
          text: { type: "string", description: "Override text; defaults to the measured length." },
        },
      },
    },
    columns: {
      type: "array",
      description: "Structural columns.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y", "width", "height"],
        properties: {
          id: { type: "string", description: "Unique column id." },
          x: { type: "number", description: "Top-left corner X in millimetres." },
          y: { type: "number", description: "Top-left corner Y in millimetres." },
          width: { type: "number", description: "Width in millimetres." },
          height: { type: "number", description: "Height in millimetres." },
        },
      },
    },
    title: {
      type: "object",
      additionalProperties: false,
      description: "Title-block metadata.",
      properties: {
        project: { type: "string", description: "Project name." },
        drawn_by: { type: "string", description: "Author / drafter." },
        date: { type: "string", description: "Date string." },
      },
    },
    edges: {
      type: "array",
      description: "Output-only: connector edges from the modeled door/opening access graph.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "via", "type"],
        properties: {
          from: { type: "string", description: "One endpoint (room id or `exterior`)." },
          to: { type: "string", description: "Other endpoint (room id or `exterior`)." },
          via: { enum: ["door", "opening"], description: "Whether the connector is a door or a cased opening." },
          type: {
            enum: ["interior", "front"],
            description: "`front` connects the exterior (an entrance); else `interior`.",
          },
        },
      },
    },
    input_graph: {
      type: "object",
      description: "Output-only: interior-door adjacency dict, keyed by room id → neighbouring room ids.",
      additionalProperties: { type: "array", items: { type: "string" } },
    },
  },
} as const;
