/**
 * Structured JSON I/O for ArchLang plans — the machine-native channel an
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
 *    scripting (`let`/`for`/`if`/`component`) and `import` — author those in `.arch`; the
 *    exception is a placed component that derives its walls (`components`/`instances`, PS3.9).
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
 *
 * This module is the entry point and declares nothing itself: the room-type tables live in
 * `plan-json/room-types.ts`, the wire types in `plan-json/types.ts`, `planToJson` in
 * `plan-json/to-json.ts`, the validator in `plan-json/from-json.ts`, the `.arch` emission and
 * `planFromJson` in `plan-json/emit.ts`, `astToJson` in `plan-json/ast-json.ts`, `checkGraph` in
 * `plan-json/check-graph.ts` and the schema in `plan-json/schema.ts`. Nothing here charges the
 * step meter.
 */

import type { NorthDir, PlanNode, TitleNode, UseKind } from "./ast.js";
import {
  ARC_DIRS,
  AUTO_DIMS_MODES,
  COMPASS_DIRECTIONS,
  FURNITURE_ANCHORS,
  HEMISPHERES,
  TITLE_FIELD_KEY,
  USE_KINDS,
} from "./ast.js";
import { escapeStr } from "./expr-source.js";
import { plainDigits } from "./num-format.js";
import type {
  RRoom,
  RDoor,
  RWindow,
  ROpening,
  RFurniture,
  RDim,
  RColumn,
  RWall,
  RWallsFromRooms,
  ResolvedPlan,
  ResolvedElement,
} from "./ir.js";
import { drawnView, instanceBodiesOf, keepResultsOf } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  DOOR_ENUMS,
  DOOR_KIND_CLAUSES,
  DOOR_KINDS,
  DOOR_SWING_BUILDING,
  TITLE_FIELDS,
  WALL_STATUSES,
  WINDOW_KINDS,
} from "./grammar/tokens.js";
import { parse } from "./parser.js";
import { MAX_HEIGHT } from "./datum.js";
import {
  resolvePlan,
  roomUses,
  roomAreaMm2,
  buildDoorAccessGraph,
  EXTERIOR_NODE,
  DEFAULT_TOL,
  type AccessGraph,
  type AnalyzeOptions,
} from "./analyze.js";
import { roomToward, verticalConnections } from "./vertical.js";
import { SEGMENT_SELECT_RE } from "./segment-select.js";
import { SHEET_DECIMAL_KEY } from "./sheet-text.js";
import { DEFAULT_MATERIAL } from "./hatches.js";
import { openRunsOf } from "./analyze.js";
import { type KindsWith, kindsWith } from "./elements/facets.js";
import type { Arc } from "./geometry/arc.js";
import { PAPER_ORIENTATIONS, PAPER_SIZES, type ResolvedSheet } from "./sheet.js";
import type { RoomType } from "./plan-json/room-types.js";
import { ROOM_TYPES, roomTypeForUses, usesForRoomType } from "./plan-json/room-types.js";
import type {
  PointJson,
  WallArcJson,
  WallPointJson,
  PaperJson,
  InstanceMark,
  RoomJson,
  WallsFromRoomsJson,
  WallJson,
  OpeningJson,
  FurnitureJson,
  DimJson,
  ColumnJson,
  TitleJson,
  EdgeJson,
  PlanBodyJson,
  ComponentJson,
  InstanceJson,
  PlanJson,
} from "./plan-json/types.js";
import { Validator, OPENING_KIND_ENUM, validatePlanJson, pairsJson } from "./plan-json/from-json.js";

export type { RoomType } from "./plan-json/room-types.js";
export {
  ROOM_TYPES,
  USE_TO_ROOM_TYPE,
  ROOM_TYPE_TO_USE,
  roomTypeForUses,
  usesForRoomType,
} from "./plan-json/room-types.js";
export type {
  PointJson,
  WallArcJson,
  WallPointJson,
  PaperJson,
  InstanceMark,
  RoomJson,
  WallsFromRoomsJson,
  WallJson,
  OpeningOnJson,
  OpeningRelationJson,
  OpeningJson,
  FurnitureJson,
  DimJson,
  ColumnJson,
  TitleJson,
  EdgeJson,
  PlanBodyJson,
  ComponentJson,
  InstanceJson,
  PlanJson,
} from "./plan-json/types.js";

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
 * A solved arc as the `.arch` clause that re-solves it, read off the arc, never the AST: an arc
 * carried through a reflecting `place` has turned the other way. `sweep > 0` is clockwise on the
 * sheet (`geometry/arc.ts`), and past half a turn is `major`.
 */
function arcJson(a: Arc): WallArcJson {
  return { radius: a.r, dir: a.sweep > 0 ? "cw" : "ccw", ...(Math.abs(a.sweep) > Math.PI ? { major: true } : {}) };
}

/** The sheet as {@link PaperJson}. */
function paperJson(s: ResolvedSheet): PaperJson {
  return { size: s.size, orientation: s.orientation, ...(s.auto ? { scale_auto: true } : {}) };
}

/**
 * The interior-door adjacency dict (`input_graph`): every room id → the ids of
 * rooms it shares a door / cased opening with (exterior entrances excluded). Keys
 * are in room source order; each neighbour list is sorted by room source order, so
 * the result is deterministic. Shared by {@link planToJson}, {@link checkGraph}, and
 * `describe()`. A caller already holding the plan's access graph passes it as `access`.
 */
export function buildInputGraph(
  rooms: RRoom[],
  doors: RDoor[],
  openings: ROpening[],
  tol: number = DEFAULT_TOL,
  access: AccessGraph = buildDoorAccessGraph(rooms, doors, tol, undefined, openings),
): Record<string, string[]> {
  const order = rooms.map((r) => r.id);
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const adj = new Map<string, Set<string>>(order.map((id) => [id, new Set<string>()]));
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
function buildEdges(access: AccessGraph): EdgeJson[] {
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
export function resolvedToJson(ir: ResolvedPlan, tol: number = DEFAULT_TOL, carried?: CarriedInstances): PlanJson {
  // A row born in a `place`d instance names it, but only in a payload that carries the
  // instances (PS3.9): everywhere else the key is absent, so those payloads are unchanged.
  const mark = (e: { _instance?: string }): InstanceMark =>
    carried && e._instance !== undefined ? { instance: e._instance } : {};
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
      ...mark(r),
    };
  });

  // The vertical datum's gate — one boolean, the same one `describe()` reads, so
  // the two surfaces can never disagree about whether this plan has heights.
  const heights = ir._heightsAuthored;

  // Authored walls only: a derived wall is exported as the statement that derives it.
  // The walls as drawn (B3a): a `status demolish` wall is listed with its status, though no
  // analysis below reads it.
  const walls: WallJson[] = drawnView(ir)
    .walls.filter((w) => w._derived === undefined)
    .map((w: RWall) => ({
      id: w.id,
      category: w.category,
      // `arcs[k]` is the edge from point k to point k+1: the point it arrives at carries it.
      points: w.points.map((p, i) => {
        const arc = i > 0 ? w.arcs?.[i - 1] : undefined;
        return arc ? { x: p.x, y: p.y, arc: arcJson(arc) } : { x: p.x, y: p.y };
      }),
      thickness: w.thickness,
      ...(heights ? { height: w.height } : {}),
      ...(w.status !== undefined ? { status: w.status } : {}),
      closed: w.closed,
      ...(w.material !== DEFAULT_MATERIAL ? { material: w.material } : {}),
      ...(w.material !== DEFAULT_MATERIAL && w.hatchScale !== 1 ? { material_scale: w.hatchScale } : {}),
      ...(w.material !== DEFAULT_MATERIAL && w.hatchAngle !== 0 ? { material_angle: w.hatchAngle } : {}),
      ...mark(w),
    }));

  const stmt = ir.elements.find((e): e is RWallsFromRooms => e.kind === "walls" && e._instance === undefined);
  const derivesWalls: WallsFromRoomsJson | undefined = stmt
    ? {
        exterior: stmt.exterior,
        partition: stmt.partition,
        ...(stmt.except.length > 0 ? { except: [...stmt.except] } : {}),
        ...pairsJson(stmt),
        ...(stmt.status !== undefined ? { status: stmt.status } : {}),
      }
    : undefined;

  // Doors, windows and cased openings in a single array **in source order** — they
  // share render layers, so preserving their interleaving keeps draw order stable.
  // An opening an `open between` clause derived is exported as the clause, never as a row.
  const openings: OpeningJson[] = ir.elements
    .filter(
      (e): e is RDoor | RWindow | ROpening =>
        e.kind === "door" || e.kind === "window" || (e.kind === "opening" && e._derived === undefined),
    )
    .map((e) => {
      const base: OpeningJson = { kind: e.kind, id: e.id, x: e.at.x, y: e.at.y, width: e.width };
      // Plan JSON carries no `axes`, so a relation positioned `at axis <label>` could not be
      // re-imported (E_OPENING_DATUM): it is exported by its coordinates instead, lossy the way
      // axes already are, never a compile error.
      const onAxis = e._relation?.at !== undefined && /^axis\s/.test(e._relation.at);
      if (e._relation && e._instance === undefined && !onAxis) base.relation = { ...e._relation };
      else if (e.host?.category !== undefined) base.wall = e.host.category;
      if (e.kind === "door") {
        // A door's clauses are emitted only when its KIND accepts them, because
        // `emitOpening` below turns this payload back into source: writing `hinge` on
        // a pocket door would round-trip into an `E_DOOR_KIND_CLAUSE`. For the default
        // hinged door the table says yes to both, so every existing payload — where
        // `doorKind` is absent by construction — is byte-identical.
        const allowed = DOOR_KIND_CLAUSES[e.doorKind ?? "hinged"];
        if (allowed.hinge) base.hinge = e.hinge;
        if (allowed.swing) base.swing = e.swing;
        if (allowed.swing && e._swingBuilding && e._instance === undefined) base.swing_building = e._swingBuilding;
        if (e.doorKind !== undefined) {
          base.door_kind = e.doorKind;
          if (allowed.slide && e.slide !== undefined) base.slide = e.slide;
          if (allowed.open && e.open !== undefined) base.open = e.open;
        }
        // The reflecting `place` frame this door crossed (`_mirror`); `swing` above is
        // already the reflected one, so the flag adds only what it cannot say.
        if (e._mirror) base.mirror = true;
      }
      if (e.kind === "window") {
        if (e.windowKind !== undefined) base.window_kind = e.windowKind;
        if (e.hinge !== undefined) base.hinge = e.hinge;
      }
      // The vertical datum, under the one gate. `sill` is a window's alone — a
      // door's and a cased opening's sill is the floor, and emitting `sill: 0` for them
      // would round-trip into a clause the grammar does not offer.
      if (heights) {
        if (e.kind === "window") base.sill = e.sill;
        base.head = e.head;
      }
      return { ...base, ...mark(e) };
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
      // The reflecting `place` frame this piece crossed (`_mirror`, set by the furniture
      // element's `transform` on every piece in the instance, symmetric or not); the
      // quarter-turn above cannot say so.
      ...(f._mirror ? { mirror: true } : {}),
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
            ...(a.segmentSelect !== undefined ? { segment_select: a.segmentSelect } : {}),
            ...(a.offset !== undefined ? { offset: a.offset } : {}),
            ...(a.side !== undefined ? { side: a.side } : {}),
          }
        : {}),
      ...(a?.mode === "against-edge"
        ? { against_edge: a.edge, ...(a.offset !== undefined ? { offset: a.offset } : {}) }
        : {}),
      ...(f._facing !== undefined && f._instance === undefined ? { facing: f._facing } : {}),
      ...(f._clear?.front !== undefined ? { clear_front: f._clear.front } : {}),
      ...(f._clear?.sides !== undefined ? { clear_sides: f._clear.sides } : {}),
      ...(f.label !== undefined ? { label: f.label } : {}),
      ...mark(f),
    };
  });

  const dims: DimJson[] = dimEls.map((d) => ({
    from: { x: d.from.x, y: d.from.y },
    to: { x: d.to.x, y: d.to.y },
    offset: d.offset,
    ...(d.text !== undefined ? { text: d.text } : {}),
    // The reflecting `place` frame this dimension crossed (`_mirror`); `offset` above is
    // already the reflected one.
    ...(d._mirror ? { mirror: true } : {}),
    ...mark(d),
  }));

  const columns: ColumnJson[] = columnEls.map((c) => ({
    id: c.id,
    x: c.at.x,
    y: c.at.y,
    width: c.size.w,
    height: c.size.h,
    ...mark(c),
  }));

  const roomTypes: RoomType[] = [];
  for (const rm of rooms) if (!roomTypes.includes(rm.room_type)) roomTypes.push(rm.room_type);
  const totalArea = r2(rooms.reduce((s, rm) => s + (rm.area ?? 0), 0));
  const access = buildDoorAccessGraph(roomEls, doorEls, tol, undefined, openingEls, openRunsOf(ir, tol));

  const out: PlanJson = {
    version: 1,
    plan: ir.name,
    units: "mm",
    ...(ir.grid > 0 ? { grid: ir.grid } : {}),
    ...(ir.scale !== undefined ? { scale: ir.scale } : {}),
    ...(ir.sheet ? { paper: paperJson(ir.sheet) } : {}),
    ...(northIsDefault(ir.north) ? {} : { north: ir.north }),
    // Emitted only when declared, so every payload a pre-site plan produced is unchanged.
    ...(ir.site ? { site: { street: ir.site.street, hemisphere: ir.site.hemisphere } } : {}),
    // Same rule as `site`: emitted only when declared, so a plan that never asked for
    // automatic dimensioning produces exactly the payload it always did.
    ...(ir.autoDims !== undefined ? { dims_auto: ir.autoDims } : {}),
    // Same rule again for the vertical datum: emitted only under the one gate, so
    // a plan that declares no height produces exactly the payload it always did.
    ...(heights ? { storey_height: ir.storeyHeight } : {}),
    room_count: rooms.length,
    total_area: totalArea,
    room_types: roomTypes,
    rooms,
    walls,
    // Emitted only when the plan has the statement, so every other payload is unchanged.
    ...(derivesWalls ? { walls_from_rooms: derivesWalls } : {}),
    openings,
    furniture,
    ...(dims.length > 0 ? { dims } : {}),
    ...(columns.length > 0 ? { columns } : {}),
    ...(carried ? { components: carried.components, instances: carried.instances } : {}),
    ...(ir.title ? { title: titleToJson(ir.title) } : {}),
    edges: buildEdges(access),
    input_graph: buildInputGraph(roomEls, doorEls, openingEls, tol, access),
  };
  // `windowEls` intentionally unused beyond its inclusion in `openings`; keep the
  // binding for symmetry with the resolved-element filters above.
  void windowEls;
  return out;
}

function northIsDefault(n: NorthDir): boolean {
  return n === "up";
}

/** The title block, one JSON key per `TITLE_FIELDS` word (`drawn_by`, not `drawnBy`). */
function titleToJson(t: TitleNode): TitleJson {
  const out: TitleJson = {};
  for (const word of TITLE_FIELDS) {
    const v = t[TITLE_FIELD_KEY[word]];
    if (v !== undefined) out[word] = v;
  }
  return out;
}

/** The element kinds Plan JSON has no row for (`KIND_FACETS.unprojected`), in registration order.
 *  Every other kind is projected. */
export const UNPROJECTED_KINDS: readonly KindsWith<"unprojected">[] = kindsWith("unprojected");

/**
 * A clause of a plan that its Plan JSON does not carry, spelled as the language spells it. `circle`
 * is the one that changes shape: the document keeps the 48-gon.
 */
export type PlanJsonDroppedClause =
  | "keep"
  | "poche hatch"
  | "circle"
  | "label at"
  | "floor"
  | "column order"
  | (typeof UNPROJECTED_KINDS)[number]
  | "zone"
  | "level"
  | "axes"
  | "site boundary"
  | "schedule rooms"
  | "schedule openings"
  | "legend"
  | "hidden"
  | "notes"
  | "sheet text"
  | "decimal mark"
  | "theme"
  | "style"
  | "accTitle"
  | "accDescr";

/** One line of what a Plan JSON export left out (see {@link planToJson}). */
export interface PlanJsonDropped {
  clause: PlanJsonDroppedClause;
  /** How many: axes, notes, the elements of a kind. */
  count: number;
  /** Who carries it, each once: the elements of a kind, the zones. */
  ids?: string[];
  /** The clause as the source means it (`level 1 "Ground floor"`, `schedule rooms net`). */
  text?: string;
  /** The storey it sits on, on a multi-storey plan; absent on a plan-wide clause, and on every
   *  row of a single-storey plan. */
  level?: number;
}

/** What one storey holds and its document cannot carry. `level` is absent on a single-storey plan. */
function droppedFromStorey(storey: ResolvedPlan, level: number | undefined): PlanJsonDropped[] {
  const rows: PlanJsonDropped[] = [];
  const on = level !== undefined ? { level } : {};
  const add = (clause: PlanJsonDroppedClause, count: number, ids: string[]): void => {
    if (count > 0) rows.push({ clause, count, ids: [...new Set(ids)], ...on });
  };
  // The walls and elements `resolvedToJson` lists, a demolished wall among them.
  const { walls, elements } = drawnView(storey);
  // `material_scale`/`material_angle` are written only beside a `material`, and the default
  // material writes none, so `material poche scale 2` is the one hatch that does not travel.
  const hatched = walls
    .filter(
      (w) => w._derived === undefined && w.material === DEFAULT_MATERIAL && (w.hatchScale !== 1 || w.hatchAngle !== 0),
    )
    .map((w) => w.id);
  add("poche hatch", hatched.length, hatched);
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const circles = rooms.filter((r) => r.circle !== undefined).map((r) => r.id);
  add("circle", circles.length, circles);
  const anchored = rooms.filter((r) => r.labelAt !== undefined).map((r) => r.id);
  add("label at", anchored.length, anchored);
  const floored = rooms.filter((r) => r.floor !== undefined).map((r) => r.id);
  add("floor", floored.length, floored);
  // The document holds furniture and columns in two arrays, furniture first, and they draw on one
  // pass, so a column written before a piece comes back after it: the same shapes, in another order.
  const lastPiece = elements.map((e) => e.kind).lastIndexOf("furniture");
  const early = elements.filter((e, i) => e.kind === "column" && i < lastPiece).map((e) => e.id);
  add("column order", early.length, early);
  for (const kind of UNPROJECTED_KINDS) {
    const ids = elements.filter((e) => e.kind === kind).map((e) => e.id);
    add(kind, ids.length, ids);
  }
  const zones = (storey.zones ?? []).filter((z) => !z.instance).map((z) => z.path);
  add("zone", zones.length, zones);
  return rows;
}

/** The plan-wide clauses, which every storey's document leaves out alike. */
function droppedFromPlan(ir: ResolvedPlan): PlanJsonDropped[] {
  const rows: PlanJsonDropped[] = [];
  if (ir.axes && ir.axes.length > 0) rows.push({ clause: "axes", count: ir.axes.length });
  if (ir.siteBoundary) rows.push({ clause: "site boundary", count: 1 });
  if (ir.schedule)
    rows.push({
      clause: "schedule rooms",
      count: 1,
      ...(ir.scheduleNet ? { text: "schedule rooms net" } : {}),
    });
  if (ir.openingSchedule) rows.push({ clause: "schedule openings", count: 1 });
  if (ir.legend) rows.push({ clause: "legend", count: 1 });
  const marks = Object.keys(ir.hide ?? {});
  if (marks.length > 0) rows.push({ clause: "hidden", count: marks.length, ids: marks });
  if (ir.notes && ir.notes.length > 0) rows.push({ clause: "notes", count: ir.notes.length });
  // `decimal` sets a mark and is no word of the sheet, so it is said on a row of its own.
  const wording = ir.sheetText?.entries ?? [];
  const words = wording.filter((e) => e.key !== SHEET_DECIMAL_KEY).length;
  if (words > 0) rows.push({ clause: "sheet text", count: words });
  const mark = wording.find((e) => e.key === SHEET_DECIMAL_KEY);
  if (mark) rows.push({ clause: "decimal mark", count: 1, text: `decimal ${JSON.stringify(mark.value)}` });
  const themed = ir.themeBase !== undefined || ir.themeFrom !== undefined || Object.keys(ir.theme ?? {}).length > 0;
  if (themed) rows.push({ clause: "theme", count: 1 });
  const styled = Object.entries(ir.styles ?? {}).filter(([, over]) => Object.keys(over).length > 0);
  if (styled.length > 0) rows.push({ clause: "style", count: styled.length, ids: styled.map(([kind]) => kind) });
  if (ir.accTitle !== undefined) rows.push({ clause: "accTitle", count: 1 });
  if (ir.accDescr !== undefined) rows.push({ clause: "accDescr", count: 1 });
  return rows;
}

/** One storey of a multi-storey plan, projected on its own (see {@link planToJson}). */
export interface PlanJsonPage {
  level: number;
  name?: string;
  json: PlanJson;
}

/**
 * Parse + resolve `source` and project it to {@link PlanJson} with output-only
 * enrichments. On a fatal user-source error, `json` is absent and `diagnostics`
 * carries the problems.
 *
 * Plan JSON is single-storey, so `json` is the LOWEST storey of a multi-storey plan (the
 * page `compile().svg` draws). `pages` carries every storey, each projected alone in
 * ascending level order, exactly as `compile().pages` carries one drawing per storey; it is
 * absent for a single-storey plan, so that result is unchanged.
 *
 * Plan JSON carries no `keep` (ADR 0033; plan-soundness PS4.10 would carry them), so a plan that
 * declares keeps says how many it left out: `droppedKeeps`, the accepted keeps as measured (a
 * keep a `for` loop repeats counts once per pass), present only when there is one (PS4.11), and
 * `compile -f json` prints it as a note on stderr. The loss is visible, never silent.
 *
 * `dropped` is the same report for every clause the format has no field for (issue #366): one
 * {@link PlanJsonDropped} per clause, the keeps among them, over the whole plan; a row held by one
 * storey says which, so a caller exporting one storey keeps that storey's rows and the plan-wide
 * ones. Absent when nothing was dropped. What the document restates in another form is not
 * dropped: a loop is exported as what it made, a `place`d element by its plan coordinates, a
 * relational position by its result.
 */
export function planToJson(
  source: string,
  opts: AnalyzeOptions = {},
): {
  json?: PlanJson;
  pages?: PlanJsonPage[];
  diagnostics: Diagnostic[];
  droppedKeeps?: number;
  dropped?: PlanJsonDropped[];
} {
  const { ir, diagnostics, levels } = resolvePlan(source, opts);
  if (!ir) return { diagnostics };
  const keeps = keepResultsOf(ir, levels);
  const rows: PlanJsonDropped[] = [
    ...(keeps ? [{ clause: "keep" as const, count: keeps.length }] : []),
    ...(levels.length > 0
      ? levels.flatMap((l) => [
          {
            clause: "level" as const,
            count: 1,
            text: `level ${num(l.level)}${l.name !== undefined ? ` ${q(l.name)}` : ""}`,
            level: l.level,
          },
          ...droppedFromStorey(l.ir, l.level),
        ])
      : droppedFromStorey(ir, undefined)),
    ...droppedFromPlan(ir),
  ];
  const dropped = { ...(keeps ? { droppedKeeps: keeps.length } : {}), ...(rows.length > 0 ? { dropped: rows } : {}) };
  // A storey whose `place`d component derives its walls carries its components and instances
  // (PS3.9): the statement sits in the component's body, never the walls it derives (ADR 0028
  // §3). What that record cannot carry is refused, naming the instance, never dropped.
  const carriedOf = new Map<ResolvedPlan, CarriedInstances | undefined>();
  for (const s of levels.length > 0 ? [ir, ...levels.map((l) => l.ir)] : [ir]) {
    if (carriedOf.has(s)) continue;
    const c = carryInstances(s);
    if (c && "refusal" in c) return { diagnostics: [...diagnostics, c.refusal] };
    carriedOf.set(s, c);
  }
  const project = (s: ResolvedPlan): PlanJson => resolvedToJson(s, DEFAULT_TOL, carriedOf.get(s));
  if (levels.length === 0) return { json: project(ir), diagnostics, ...dropped };
  const pages = levels.map((l) => ({
    level: l.level,
    ...(l.name !== undefined ? { name: l.name } : {}),
    json: project(l.ir),
  }));
  return { json: project(ir), pages, diagnostics, ...dropped };
}

/** {@link PlanJson.components} and {@link PlanJson.instances}, as one storey carries them. */
export interface CarriedInstances {
  components: ComponentJson[];
  instances: InstanceJson[];
}

/**
 * The components and instances of a storey on which a `place`d instance derives its walls
 * (the gate: nothing for any other storey, so its payload is unchanged), or the refusal of
 * what the record cannot carry. Each body is the instance's own resolution in its LOCAL frame
 * ({@link instanceBodiesOf}), projected by the very code that projects the root.
 */
function carryInstances(ir: ResolvedPlan): CarriedInstances | { refusal: Diagnostic } | undefined {
  const statements = ir.elements.filter((e) => e.kind === "walls" && e._instance !== undefined);
  if (statements.length === 0) return undefined;
  const deriving = [...new Set(statements.map((e) => e._instance!))];
  // Spanned on the first deriving statement itself (inside the component body, and in the
  // file that body was written in), the line the author would have to change.
  const first = statements[0]!;
  const refuse = (why: string): { refusal: Diagnostic } => ({
    refusal: {
      severity: "error",
      message: `Plan JSON cannot carry the walls \`walls from rooms\` derives inside the placed instance${
        deriving.length > 1 ? "s" : ""
      } ${deriving.map((i) => `"${i}"`).join(", ")}: ${why}, so the projection is refused rather than drop them`,
      code: "E_JSON_DERIVED_IN_INSTANCE",
      ...(first.span ? { span: first.span } : {}),
      ...(first._file !== undefined ? { file: first._file } : {}),
    },
  });
  const placed = ir.instances ?? [];
  const nested = placed.find((p) => p.name.includes("."));
  if (nested)
    return refuse(
      `the plan nests a \`place\` ("${nested.name}"), and Plan JSON's component record holds one level of instances`,
    );
  const bodies = instanceBodiesOf(ir);
  const components: ComponentJson[] = [];
  const firstOf = new Map<string, { instance: string; key: string }>();
  for (const p of placed) {
    const own = bodies.get(p.name);
    if (!own) return refuse(`instance "${p.name}" was not resolved`);
    if (own.imported)
      return refuse(
        `component "${p.component}" comes in through an \`import\`, and Plan JSON carries only a component written in the compiled file`,
      );
    const body = bodyJson(ir, own.local);
    const key = JSON.stringify(body);
    const seen = firstOf.get(p.component);
    if (seen === undefined) {
      firstOf.set(p.component, { instance: p.name, key });
      components.push({ name: p.component, body });
    } else if (seen.key !== key)
      return refuse(
        `instances "${seen.instance}" and "${p.name}" of component "${p.component}" resolve to different bodies (different arguments), and Plan JSON carries one body per component`,
      );
  }
  const instances: InstanceJson[] = placed.map((p) => ({
    name: p.name,
    component: p.component,
    at: { x: p.at.x, y: p.at.y },
    ...(p.rotate !== 0 ? { rotate: p.rotate } : {}),
    ...(p.mirror ? { mirror: p.mirror } : {}),
  }));
  return { components, instances };
}

/** One instance's LOCAL elements as a {@link PlanBodyJson}: projected exactly as the root is
 *  (they carry no `_instance`, so their relational clauses are kept as written). */
function bodyJson(ir: ResolvedPlan, local: readonly ResolvedElement[]): PlanBodyJson {
  const walls = local.filter((e): e is RWall => e.kind === "wall" && e.points.length > 0);
  const j = resolvedToJson({ ...ir, elements: [...local], walls, drawn: undefined, instances: undefined });
  return {
    rooms: j.rooms,
    walls: j.walls,
    ...(j.walls_from_rooms ? { walls_from_rooms: j.walls_from_rooms } : {}),
    openings: j.openings,
    furniture: j.furniture,
    ...(j.dims ? { dims: j.dims } : {}),
    ...(j.columns ? { columns: j.columns } : {}),
  };
}

/** Deterministic number → source token (no scientific notation; normalize -0).
 *  Deliberately full-precision `String(n)`, NOT `src/num-format.ts`'s 3-dp `fmt3`
 *  (`statement-print.ts`'s `numStr`): Plan JSON round-trips a RESOLVED, already-rounded
 *  number, so re-quantizing it here would only lose precision a second time for
 *  nothing — this emitter also never touches `statement-print.ts`, since it prints from
 *  validated JSON values, not the `Expr` AST that module's leaf printer takes.
 *  `String(n)` with its exponent expanded ({@link plainDigits}): `String(1e-9)` is `1e-9`, which
 *  the lexer (no exponent form) read as `1` then `e`, an `E_PARSE` (EH1.15). */
function num(n: number): string {
  if (Object.is(n, -0)) return "0";
  return plainDigits(n);
}

/** A literal string as an ArchLang `"…"` template, through the language's own escaper
 *  ({@link escapeStr}, so `{`/`}`/`"`/`\`/newline stay literal and cannot end the literal). */
function q(s: string): string {
  return `"${escapeStr(s)}"`;
}

const idAttr = (id: string | undefined): string => (id ? `id=${id} ` : "");

/** Emit canonical `.arch` source for a validated {@link PlanJson}. */
function emitArch(p: PlanJson): string {
  const L: string[] = [];
  L.push(`plan ${q(p.plan ?? "")} {`);
  L.push(`  units mm`);
  if (typeof p.grid === "number" && p.grid > 0) L.push(`  grid ${num(p.grid)}`);
  // The sheet, and then the scale unless the sheet fitted it: writing a fitted scale back would
  // turn an auto-fitted plan into an authored one.
  if (p.paper) L.push(`  paper ${p.paper.size} ${p.paper.orientation ?? "landscape"}`);
  if (typeof p.scale === "string" && /^\d+:\d+$/.test(p.scale) && !p.paper?.scale_auto) L.push(`  scale ${p.scale}`);
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
  // The round-trip half of the vertical datum. Without this line every wall in the
  // re-emitted source silently inherits the 3000 default, and a 2400 storey comes back as
  // a 3000 one with no diagnostic — the `dims auto` failure above, one layer down.
  if (p.storey_height !== undefined) L.push(`  height ${num(p.storey_height)}`);

  emitRows(p, L);
  // PS3.9: each component as its resolved body, then each instance as its `place`, after the
  // root rows, so the round-trip law holds for a plan whose `place`s follow its root statements.
  if (p.components && p.instances) {
    for (const c of p.components) {
      L.push(`  component ${c.name}() {`);
      const body: string[] = [];
      emitRows(c.body, body);
      for (const line of body) L.push(`  ${line}`);
      L.push(`  }`);
    }
    for (const i of p.instances) {
      const frame = `${i.rotate ? ` rotate ${i.rotate}` : ""}${i.mirror ? ` mirror ${i.mirror}` : ""}`;
      L.push(`  place ${i.component}() as ${i.name} at (${num(i.at.x)},${num(i.at.y)})${frame}`);
    }
  }

  if (p.title) {
    L.push(`  title {`);
    for (const word of TITLE_FIELDS) {
      const v = p.title[word];
      if (v !== undefined) L.push(`    ${word} ${q(v)}`);
    }
    L.push(`  }`);
  }

  L.push(`}`);
  L.push("");
  return L.join("\n");
}

/** A row the source states itself: not a flattened instance row, which its `place` re-creates. */
const own = (r: InstanceMark): boolean => r.instance === undefined;

/** The root's (or a component body's) rows as `.arch` statements, one line each. */
function emitRows(p: PlanBodyJson, L: string[]): void {
  for (const w of (p.walls ?? []).filter(own)) {
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
    // Last before the body, the grammar's own order.
    if (typeof w.height === "number") parts.push(`height ${num(w.height)}`);
    // Then `status` (B3a), the grammar's own order.
    if (typeof w.status === "string") parts.push(`status ${w.status}`);
    const pts = (w.points ?? []).map(wallPoint).join(" ");
    parts.push(`{ ${pts}${w.closed ? " close" : ""} }`);
    L.push(parts.join(" "));
  }
  // The round-trip half of `walls_from_rooms`: the statement, never the walls it derives.
  if (p.walls_from_rooms) {
    const s = p.walls_from_rooms;
    const body = [
      ...(s.except && s.except.length > 0 ? [`except ${s.except.join(" ")}`] : []),
      ...(s.open ?? []).map(
        (c) =>
          `open ${c.id !== undefined ? `id=${c.id} ` : ""}between ${c.between[0]} and ${c.between[1]}${
            c.width !== undefined ? ` width ${num(c.width)}` : ""
          }`,
      ),
      ...(s.between ?? []).map((c) => `between ${c.between[0]} and ${c.between[1]} thickness ${num(c.thickness)}`),
    ];
    const ex = body.length > 0 ? ` { ${body.join(" ")} }` : "";
    const status = typeof s.status === "string" ? ` status ${s.status}` : "";
    L.push(`  walls from rooms exterior ${num(s.exterior)} partition ${num(s.partition)}${status}${ex}`);
  }

  for (const r of (p.rooms ?? []).filter(own)) {
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

  for (const o of (p.openings ?? []).filter(own)) L.push(emitOpening(o));

  for (const f of (p.furniture ?? []).filter(own)) L.push(emitFurniture(f));

  for (const c of (p.columns ?? []).filter(own))
    L.push(`  column ${idAttr(c.id)}at (${num(c.x)},${num(c.y)}) size ${num(c.width)}x${num(c.height)}`);

  for (const d of (p.dims ?? []).filter(own)) {
    let line = `  dim (${num(d.from.x)},${num(d.from.y)})->(${num(d.to.x)},${num(d.to.y)})`;
    if (typeof d.offset === "number") line += ` offset ${num(d.offset)}`;
    if (d.text !== undefined) line += ` text ${q(d.text)}`;
    L.push(line);
  }
}

/** A wall vertex as source: a point, or the `arc` clause of the edge arriving at it. */
function wallPoint(pt: WallPointJson): string {
  const at = `(${num(pt.x)},${num(pt.y)})`;
  if (!pt.arc) return at;
  return `arc ${at} radius ${num(pt.arc.radius)}${pt.arc.dir ? ` ${pt.arc.dir}` : ""}${pt.arc.major ? " major" : ""}`;
}

/**
 * The `uses` tags to emit for a room: explicit `uses` win; else none when the label
 * already reads as the `room_type`; else derive from `room_type`.
 *
 * {@link planToJson} writes `uses` only when the source authored it, so a room whose use
 * came from its label ("Hall" → `hall`) arrives with a `room_type` alone. Several uses share
 * one `room_type` (hall/circulation/entry → `Entrance`, wc/bath → `Bathroom`), so turning it
 * into its primary use would rewrite `label "Hall"` as `uses entry`: another room for
 * `describe()` and every rule that reads uses. When the label (or, as {@link roomUses} reads,
 * the id) already maps to this `room_type`, the regenerated source writes no `uses` and the
 * label says it again, exactly as the source did. A label that reads as nothing, or as a
 * different `room_type`, still takes `room_type`'s use: `room_type` is the authority there.
 */
function usesForRoom(r: RoomJson): UseKind[] {
  if (r.uses && r.uses.length > 0) return r.uses;
  if (!r.room_type) return [];
  const fromLabel = roomUses({ id: r.id ?? "", ...(r.label !== undefined ? { label: r.label } : {}) });
  if (fromLabel.size > 0 && roomTypeForUses(fromLabel) === r.room_type) return [];
  return usesForRoomType(r.room_type);
}

function emitOpening(o: OpeningJson): string {
  const kw = o.kind;
  let line = `  ${kw} ${idAttr(o.id)}`;
  // The KIND word leads, after any `id=` — `door pocket on w1 at 40% width 900`.
  if (o.kind === "door" && o.door_kind) line += `${o.door_kind} `;
  if (o.kind === "window" && o.window_kind) line += `${o.window_kind} `;
  const rel = o.relation;
  if (rel) {
    line += rel.between ? `between ${rel.between[0]} and ${rel.between[1]}` : `on ${rel.edge}`;
    if (rel.at !== undefined) line += ` at ${rel.at}`;
  } else if (o.on) line += `on ${o.on.wall} at ${o.on.at}`;
  else line += `at (${num(o.x ?? 0)},${num(o.y ?? 0)})`;
  line += ` width ${num(o.width)}`;
  if (!o.on && !rel && o.wall) line += ` wall ${o.wall}`;
  if (o.kind === "door") {
    if (o.hinge) line += ` hinge ${o.hinge}`;
    if (o.swing_building) line += ` swing ${o.swing_building}`;
    else if (o.swing) line += ` swing ${o.swing}`;
    if (o.slide) line += ` slide ${o.slide}`;
    if (o.open !== undefined) line += ` open ${num(o.open)}`;
  }
  // The validator above holds a window's `hinge` to a kind that takes it.
  if (o.kind === "window" && o.hinge) line += ` hinge ${o.hinge}`;
  // The vertical clauses trail every other one, in `sill` then `head` order — the
  // grammar's, so the emitted line re-parses. `sill` is a window's alone; the validator
  // above refuses it anywhere else, so this needs no second check.
  if (o.kind === "window" && o.sill !== undefined) line += ` sill ${num(o.sill)}`;
  if (o.head !== undefined) line += ` head ${num(o.head)}`;
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
  if ((f.against_wall || f.against_edge) && (f.rotate === 90 || f.rotate === 270)) {
    sizeW = f.height;
    sizeH = f.width;
  }
  if (f.against_edge) {
    // The edge names the room, so no trailing `in` (ADR 0029 §2).
    line += ` against ${f.against_edge}`;
    if (typeof f.offset === "number") line += ` offset ${num(f.offset)}`;
    placedIn = true;
  } else if (f.against_wall) {
    line += ` against wall ${f.against_wall}`;
    if (typeof f.segment_select === "string") line += ` segment ${f.segment_select}`;
    else if (typeof f.segment === "number") line += ` segment ${num(f.segment)}`;
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
  if (typeof f.facing === "string") line += ` facing ${f.facing}`;
  else if (typeof f.rotate === "number" && !f.against_wall && !f.against_edge) line += ` rotate ${num(f.rotate)}`;
  if (f.mirror === true) line += " mirror";
  if (typeof f.clear_front === "number") line += ` clear front ${num(f.clear_front)}`;
  if (typeof f.clear_sides === "number") line += ` clear sides ${num(f.clear_sides)}`;
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
  if (!model || val.hasError()) return { diagnostics: val.capped() };
  return { source: emitArch(model), diagnostics: val.diags };
}

/**
 * Build a {@link PlanNode} from a JSON plan (the RPLAN/DStruct2Design shape). Never
 * throws: shape problems are returned as catalogued `E_JSON_SCHEMA` / `E_JSON_KIND`
 * diagnostics whose message names the offending JSON path. Internally it emits
 * canonical `.arch` text and runs the real parser (reusing every parse-time check),
 * and also returns that `source` for callers that want to compile it.
 *
 * Not supported (documented): scripting (`let`/`for`/`if`/`component`) and `import`, but for a
 * placed component that derives its walls (`components`/`instances`); and a
 * `mirror: true` door, dimension or dotted-id piece, which only a `place` frame can state (`E_JSON_MIRROR`).
 */
export function planFromJson(json: unknown): { ast?: PlanNode; source?: string; diagnostics: Diagnostic[] } {
  const { source, diagnostics } = planJsonToArch(json);
  if (source === undefined) return { diagnostics };
  const { plan, diagnostics: parseDiags } = parse(source);
  return { ast: plan, source, diagnostics: [...diagnostics, ...parseDiags] };
}

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
 * **Multi-storey** (`level <n> { … }`): the graph is the WHOLE BUILDING's, not
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
    return `${x}\u0000${y}`;
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
    const graph = buildInputGraph(
      pr,
      pd,
      po,
      DEFAULT_TOL,
      buildDoorAccessGraph(pr, pd, DEFAULT_TOL, undefined, po, openRunsOf(p, DEFAULT_TOL)),
    );
    for (const a of Object.keys(graph)) for (const b of graph[a] ?? []) addActual(a, b);
  }
  if (levels.length > 0) {
    for (const c of verticalConnections(levels.map((l) => ({ level: l.level, ir: l.ir })))) {
      // One edge per ADJACENT pair of the shaft's storeys: a lift serving 1/2/3 links
      // 1–2 and 2–3, never 1–3 (you pass through the intervening floor's room).
      for (let i = 1; i < c.stops.length; i++) {
        const a = roomToward(c.stops[i - 1]!, "above");
        const b = roomToward(c.stops[i]!, "below");
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

const POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    x: { type: "number", description: "X coordinate in millimetres (origin top-left, +x right)." },
    y: { type: "number", description: "Y coordinate in millimetres (+y DOWN, screen convention)." },
  },
} as const;

/** A wall vertex: {@link POINT_SCHEMA} plus the `arc` of the edge arriving at it. */
const WALL_POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    ...POINT_SCHEMA.properties,
    arc: {
      type: "object",
      additionalProperties: false,
      required: ["radius"],
      description:
        "`arc (x,y) radius R [cw|ccw] [major]`: the edge ARRIVING at this point is a circular arc, and x/y are its end, so ignoring this key leaves the chord. Not on a wall's first point.",
      properties: {
        radius: { type: "number", exclusiveMinimum: 0, description: "Radius in millimetres." },
        dir: {
          enum: [...ARC_DIRS],
          description: "Which way round, as the reader sees it on the sheet. Defaults to `ccw`.",
        },
        major: { type: "boolean", description: "Take the long way round. Omitted when false." },
      },
    },
  },
} as const;

/** {@link InstanceMark}: the `instance` key every row schema accepts. */
const INSTANCE_MARKER = {
  type: "string",
  description:
    "Output-only, and present only when the payload carries `instances`: the placed instance this row was born inside. The row is that instance's element in plan coordinates under its dotted id (`west.kit`), kept for a reader that only wants geometry. On input a marked row is regenerated from its component and an edit to it is IGNORED: edit `components[].body` (or `instances[]`) instead. A marked row's `id` must start with `<instance>.` (a dimension has none), so a root row cannot be marked and lost by mistake (E_JSON_SCHEMA). Never present on a row inside `components[].body`.",
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
    "A floor plan as structured JSON (RPLAN / DStruct2Design convention). Coordinates are millimetres; the origin is top-left with +x right and +y DOWN. Fields marked output-only are produced by planToJson and ignored on input. Scripting (let/for/if/component) and import are not representable — author those in .arch source; the one exception is a placed component that derives its walls, carried by `components`/`instances`. Vertical circulation (stair/escalator/elevator) is not projected: Plan JSON has no member for it.",
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
        'Drawing scale, e.g. "1:50". Annotation only without `paper`; with it, the operative scale of the sheet.',
    },
    paper: {
      type: "object",
      additionalProperties: false,
      required: ["size"],
      description: "`paper <size> <orientation>`: the sheet the drawing is issued on. Omit it for no sheet.",
      properties: {
        size: { enum: [...PAPER_SIZES], description: "ISO paper size." },
        orientation: { enum: [...PAPER_ORIENTATIONS], description: "Defaults to `landscape`." },
        scale_auto: {
          type: "boolean",
          description:
            "The plan wrote no `scale`, so the sheet fitted one. `scale` then reports that fit and is ignored on input, which fits again.",
        },
      },
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
    storey_height: {
      type: "number",
      exclusiveMinimum: 0,
      maximum: MAX_HEIGHT,
      description:
        "`height <mm>` — the plan's default floor-to-floor storey height in millimetres (default 3000). The VERTICAL datum: it draws nothing at all, because a floor plan is a horizontal cut, and exists so heights are readable facts. A wall's own `height` overrides it. Plan JSON is a single-storey projection, so per-level heights and elevations are not representable here — author those with `level <n> height <mm>` in .arch source.",
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
          instance: INSTANCE_MARKER,
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
    walls_from_rooms: {
      type: "object",
      additionalProperties: false,
      required: ["exterior", "partition"],
      description:
        "`walls from rooms` (ADR 0028 §3): derive every wall from the rooms — an exterior ring on their outline and a partition on each shared edge. The derived walls are not listed in `walls`.",
      properties: {
        exterior: { type: "number", exclusiveMinimum: 0, description: "Exterior ring thickness in millimetres." },
        partition: { type: "number", exclusiveMinimum: 0, description: "Partition thickness in millimetres." },
        except: { type: "array", items: { type: "string" }, description: "Room ids left out of the derivation." },
        status: {
          type: "string",
          enum: [...WALL_STATUSES],
          description:
            "`status existing|demolish|new`: the status of every wall the statement derives (as on a wall). Omitted when not written.",
        },
        open: {
          type: "array",
          description:
            "`open [id=] between A and B [width]`: the pair's partition is voided by a derived leaf-less opening across its clear span (not listed in `openings`).",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["between"],
            properties: {
              between: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 2,
                description: "The two room ids.",
              },
              id: { type: "string", description: "The derived opening's id, when the clause gives one." },
              width: {
                type: "number",
                exclusiveMinimum: 0,
                description: "Opening width in millimetres, centred on the clear span.",
              },
            },
          },
        },
        between: {
          type: "array",
          description: "`between A and B thickness t`: that one partition's thickness.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["between", "thickness"],
            properties: {
              between: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 2,
                description: "The two room ids.",
              },
              thickness: { type: "number", exclusiveMinimum: 0, description: "Partition thickness in millimetres." },
            },
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
          instance: INSTANCE_MARKER,
          id: { type: "string", description: "Unique wall id." },
          category: {
            type: "string",
            description: 'Free-form category, e.g. "exterior" or "partition"; also a host reference.',
          },
          points: { type: "array", minItems: 2, description: "Polyline vertices in order.", items: WALL_POINT_SCHEMA },
          thickness: { type: "number", description: "Wall thickness in millimetres." },
          height: {
            type: "number",
            exclusiveMinimum: 0,
            maximum: MAX_HEIGHT,
            description:
              "How tall the wall STANDS, in millimetres — a vertical height, NOT a plan extent like a room's `height`. Defaults to the plan's `storey_height` (3000). It draws nothing: a floor plan is a horizontal cut. An opening's `head` may not exceed it.",
          },
          status: {
            type: "string",
            enum: [...WALL_STATUSES],
            description:
              "What becomes of the wall in a remodel: `existing` (the default when omitted), `demolish` or `new`. A `demolish` wall is drawn but encloses nothing, hosts nothing (a door, window or opening in it is E_OPENING_ON_DEMOLISHED_WALL) and counts in no area; where it stood between two rooms, they are joined. Omitted when not written.",
          },
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
          instance: INSTANCE_MARKER,
          kind: { enum: OPENING_KIND_ENUM, description: "Opening kind." },
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
          relation: {
            type: "object",
            additionalProperties: false,
            description:
              "Relational placement as written (ADR 0028 §5), alternative to x/y on input: `between` two rooms (the wall on their shared edge) or `edge` (`<room>.top|bottom|left|right`, the exterior wall on it), at `at` (`center`, `<mm> from start|end|<room>.<edge>`, `axis <label>`; a window on an edge may leave it out).",
            properties: {
              between: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 2,
                description: "The two room ids whose shared edge run hosts the opening.",
              },
              edge: { type: "string", description: "A room edge, `<room>.top|bottom|left|right`." },
              at: { type: "string", description: "The position along the run or the edge, as written." },
            },
          },
          width: { type: "number", description: "Opening width in millimetres." },
          wall: { type: "string", description: "Host wall by id or category (else nearest)." },
          hinge: {
            enum: [...DOOR_ENUMS.hinge],
            description:
              "Hinge side relative to the wall direction: a door's, or a `casement` or `tilt_turn` window's when one was written.",
          },
          swing: {
            enum: [...DOOR_ENUMS.swing],
            description:
              "Hinged: which side of the wall the leaf sweeps to. Barn/bifold: which face the panel hangs on or folds toward. Not accepted on a sliding or pocket door.",
          },
          swing_building: {
            enum: [...DOOR_SWING_BUILDING],
            description: `\`swing ${DOOR_SWING_BUILDING.join("|")}\` as written: relative to the building (towards or away from the one face of the host wall that has floor), beside the wall-relative \`swing\` it resolved to. On input it wins over \`swing\`.`,
          },
          door_kind: {
            enum: [...DOOR_KINDS],
            description:
              "Door kind (default `hinged`, in which case this is omitted). A non-hinged kind has no swing arc; `hinge` is not accepted on one.",
          },
          window_kind: {
            enum: [...WINDOW_KINDS],
            description: "Window only. The kind word as written; omitted on a window with none.",
          },
          slide: {
            enum: [...DOOR_ENUMS.slide],
            description:
              "Which way a sliding-family panel travels to open, along the wall's direction (as `hinge` is). Sliding family only.",
          },
          mirror: {
            type: "boolean",
            description:
              "Door only. True on a door inside a reflecting `place` frame: it records the frame's reflection (a sliding door takes the other track), not the leaf's handedness. Absent otherwise. Output-only: `planFromJson` refuses `true` with E_JSON_MIRROR.",
          },
          open: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description:
              "How far the panel is DRAWN open, 0–1 (default 0.5). A drawing fact only — no measured output reads it. Sliding family only.",
          },
          sill: {
            type: "number",
            minimum: 0,
            maximum: MAX_HEIGHT,
            description:
              "Bottom of the glazing above this storey's floor, in millimetres (default 900 — GB 50352-2019's minimum for a residential external window). WINDOW ONLY: a door and a cased opening start at the floor. 0 is legal and means a floor-length window. Draws nothing.",
          },
          head: {
            type: "number",
            exclusiveMinimum: 0,
            maximum: MAX_HEIGHT,
            description:
              "Top of the opening above this storey's floor, in millimetres — 2100 for a door or a window, the host wall's own height for a cased opening. Must be above `sill` and no higher than the host wall. Draws nothing.",
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
          instance: INSTANCE_MARKER,
          category: { type: "string", description: "Furniture category, e.g. bed, sofa, wc, basin, stove." },
          id: { type: "string", description: "Unique furniture id." },
          room: { type: "string", description: "Owning room id (`in <room>`)." },
          x: { type: "number", description: "Top-left corner X in millimetres (resolved footprint)." },
          y: { type: "number", description: "Top-left corner Y in millimetres (resolved footprint)." },
          width: { type: "number", description: "Plan-axis width in millimetres." },
          height: { type: "number", description: "Plan-axis height in millimetres." },
          rotate: { enum: [0, 90, 180, 270], description: "Quarter-turn rotation of the drawn symbol." },
          mirror: {
            type: "boolean",
            description:
              "True on a fixture that writes `mirror` and on every fixture inside a reflecting `place` frame, the two composed: it records the reflection, not the glyph's handedness, so a symmetric symbol carries it too (a handed one is drawn as its mirror image). Absent otherwise. `planFromJson` prints it as the `mirror` clause, and refuses it with E_JSON_MIRROR on a dotted id, a flattened instance's piece.",
          },
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
          segment_select: {
            type: "string",
            pattern: SEGMENT_SELECT_RE.source,
            description:
              "A segment selector as written (for against_wall): `north|south|east|west` or `containing <room>.<edge>`; re-emitted in place of `segment`.",
          },
          offset: {
            type: "number",
            description: "Distance (mm) along the segment (for against_wall) or the room edge (for against_edge).",
          },
          side: { enum: ["left", "right"], description: "Which wall face to back onto (for against_wall)." },
          against_edge: {
            type: "string",
            description: "Edge-anchored placement: back onto this room edge (`<room>.top|bottom|left|right`).",
          },
          facing: {
            type: "string",
            description: "Id of the piece, rectangular room or opening this piece faces; its turn is derived.",
          },
          clear_front: { type: "number", exclusiveMinimum: 0, description: "Declared clear depth (mm) in front." },
          clear_sides: { type: "number", exclusiveMinimum: 0, description: "Declared clear depth (mm) at each side." },
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
          instance: INSTANCE_MARKER,
          from: { ...POINT_SCHEMA, description: "Start point." },
          to: { ...POINT_SCHEMA, description: "End point." },
          offset: { type: "number", description: "Perpendicular offset of the dimension line in millimetres." },
          text: { type: "string", description: "Override text; defaults to the measured length." },
          mirror: {
            type: "boolean",
            description:
              "True on a dimension inside a reflecting `place` frame: it records the frame's reflection (the side a zero-offset call-out's number reads on). Absent otherwise. Output-only: `planFromJson` refuses `true` with E_JSON_MIRROR.",
          },
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
          instance: INSTANCE_MARKER,
          id: { type: "string", description: "Unique column id." },
          x: { type: "number", description: "Top-left corner X in millimetres." },
          y: { type: "number", description: "Top-left corner Y in millimetres." },
          width: { type: "number", description: "Width in millimetres." },
          height: { type: "number", description: "Height in millimetres." },
        },
      },
    },
    components: {
      type: "array",
      description:
        "The components the plan's placed instances were made from. Present (with `instances`, and with `instance` on every flattened instance row) ONLY on a storey where a placed component derives its walls with `walls from rooms`; every other payload has neither key, and a placed plan without that statement is exported flattened. Each body is what one instance resolved to in the component's own frame and names (`liv`, not `west.liv`), with the same row shapes as the root: the `walls from rooms` statement as written, never the walls it derives. A component that took parameters is carried parameterless, its arguments already applied. planFromJson prints each as `component <name>() { … }`. Not representable (planToJson refuses, E_JSON_DERIVED_IN_INSTANCE): a nested `place`, two instances of one component with different bodies, an imported component.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "body"],
        properties: {
          name: { type: "string", description: "The component name, as `place` names it." },
          body: {
            type: "object",
            additionalProperties: false,
            required: ["rooms", "walls", "openings", "furniture"],
            description: "The component's statements in its LOCAL frame and names; the root row shapes.",
            properties: {
              rooms: { $ref: "#/properties/rooms" },
              walls: { $ref: "#/properties/walls" },
              walls_from_rooms: { $ref: "#/properties/walls_from_rooms" },
              openings: { $ref: "#/properties/openings" },
              furniture: { $ref: "#/properties/furniture" },
              dims: { $ref: "#/properties/dims" },
              columns: { $ref: "#/properties/columns" },
            },
          },
        },
      },
    },
    instances: {
      type: "array",
      description:
        "The placed instances, in source order, as `describe().instances` lists them; present exactly when `components` is. planFromJson prints each as `place <component>() as <name> at (x,y) [rotate r] [mirror m]`, after the root statements: the round trip is byte-identical for a plan whose `place`s follow its root statements (one that places first comes back in that grouped order).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "component", "at"],
        properties: {
          name: { type: "string", description: "The `as <name>` instance name; one level, so never dotted." },
          component: { type: "string", description: "A `components[].name`." },
          at: { ...POINT_SCHEMA, description: "Where the component's local (0,0) lands, in plan coordinates." },
          rotate: { enum: [0, 90, 180, 270], description: "Quarter-turn of the instance (omitted when 0)." },
          mirror: { enum: ["x", "y"], description: "Axis reflection of the instance, applied before the rotation." },
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
        number: { type: "string", description: "Drawing number, e.g. A-101." },
        revision: { type: "string", description: "Drawing revision, e.g. B." },
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
