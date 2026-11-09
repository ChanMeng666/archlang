/**
 * `planToJson` — parse + resolve a plan, then project it OUT to the wire shape with the
 * output-only enrichments (areas, `edges`, `input_graph`, `dropped`) (moved verbatim from
 * `src/plan-json.ts`, which re-exports every name it exported).
 *
 * Invariant: `planToJson` resolves the source once and projects that one result. It charges
 * nothing to the step meter itself; the resolve it calls (`resolvePlan`) does.
 */

import type { NorthDir, TitleNode } from "../ast.js";
import { TITLE_FIELD_KEY } from "../ast.js";
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
} from "../ir.js";
import { drawnView, instanceBodiesOf, keepResultsOf } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";
import { DOOR_KIND_CLAUSES, TITLE_FIELDS } from "../grammar/tokens.js";
import {
  resolvePlan,
  roomUses,
  roomAreaMm2,
  buildDoorAccessGraph,
  EXTERIOR_NODE,
  DEFAULT_TOL,
  type AccessGraph,
  type AnalyzeOptions,
} from "../analyze.js";
import { SHEET_DECIMAL_KEY } from "../sheet-text.js";
import { DEFAULT_MATERIAL } from "../hatches.js";
import { openRunsOf } from "../analyze.js";
import { type KindsWith, kindsWith } from "../elements/facets.js";
import type { Arc } from "../geometry/arc.js";
import { rectRing } from "../geometry/polygon.js";
import type { ResolvedSheet } from "../sheet.js";
import type { RoomType } from "./room-types.js";
import { roomTypeForUses } from "./room-types.js";
import type {
  PointJson,
  WallArcJson,
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
} from "./types.js";
import { num, q } from "./source-tokens.js";

/** The pair clauses of a `walls from rooms` statement, as Plan JSON (absent when none). */
function pairsJson(stmt: RWallsFromRooms): Pick<WallsFromRoomsJson, "open" | "between"> {
  const open: NonNullable<WallsFromRoomsJson["open"]> = [];
  const between: NonNullable<WallsFromRoomsJson["between"]> = [];
  for (const c of stmt.pairs ?? []) {
    if (c.kind === "open")
      open.push({
        between: [c.between[0], c.between[1]],
        ...(c.id !== undefined ? { id: c.id } : {}),
        ...(c.width !== undefined ? { width: c.width } : {}),
      });
    else between.push({ between: [c.between[0], c.between[1]], thickness: c.thickness });
  }
  return { ...(open.length > 0 ? { open } : {}), ...(between.length > 0 ? { between } : {}) };
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Rectangle corners of a resolved sized element, clockwise from top-left. */
export function rectPolygon(x: number, y: number, w: number, h: number): PointJson[] {
  return rectRing({ x, y, w, h });
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
