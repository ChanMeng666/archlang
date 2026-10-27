/**
 * Resolved storeys → Scene3D v0. A mapping of the core's resolved facts into micrometres and
 * plan-aligned records: no geometry is built here beyond the core's own (wall ownership through
 * `joinWallSet`, arcs through `loopsToPolygons`). Every value the plan did not state goes to the
 * assumption ledger.
 *
 * Reads only fields the exported IR types document; underscore-prefixed fields are not part of
 * the core's promise (ADR 0031) and are never read (`test/no-private-fields.test.ts`).
 */
import {
  loopsToPolygons,
  type EdgeLoop,
  type RColumn,
  type RDoor,
  type ResolvedElement,
  type ResolvedPlan,
  type RFence,
  type RFurniture,
  type ROpening,
  type ROutdoor,
  type RRoof,
  type RRoom,
  type RStair,
  type RVoid,
  type RWindow,
} from "@chanmeng666/archlang";
import { um, umPoint } from "../units.js";
import { type Point, type Ring, wallOwnership } from "../walls/ownership.js";
import type {
  Assumption,
  Box,
  Fence,
  Floor,
  Furniture,
  Level,
  Opening,
  Outdoor,
  Polygon,
  Ring3,
  Roof,
  Scene3D,
  Source,
  Stair,
  Wall,
} from "./types.js";

/** The package's own version, stamped into `meta.tool`. */
export const ARCHLANG_3D_VERSION = "0.0.0";

/** A resolved storey: its number, name and IR. */
export interface Storey {
  level: number;
  name?: string;
  ir: ResolvedPlan;
}

export interface BuildOptions {
  /** The core version the plan was resolved with, stamped into `meta.tool.archlang`. */
  coreVersion: string;
}

const ring = (r: readonly Point[]): Ring3 => r.map(umPoint);

const source = (e: { kind: string; id: string; span?: { start: number; end: number } }): Source =>
  e.span ? { kind: e.kind, id: e.id, span: [e.span.start, e.span.end] } : { kind: e.kind, id: e.id };

const rectRing = (at: Point, size: { w: number; h: number }): Point[] => [
  { x: at.x, y: at.y },
  { x: at.x + size.w, y: at.y },
  { x: at.x + size.w, y: at.y + size.h },
  { x: at.x, y: at.y + size.h },
];

/** A circle as two half-arcs, discretised by the core's own arc tessellation. */
function circleRing(c: Point, r: number): Ring {
  const a = { x: c.x + r, y: c.y };
  const b = { x: c.x - r, y: c.y };
  const loop: EdgeLoop = [
    { t: "arc", arc: { center: c, r, a, b, sweep: Math.PI, start: 0 } },
    { t: "arc", arc: { center: c, r, a: b, b: a, sweep: Math.PI, start: Math.PI } },
  ];
  return loopsToPolygons([loop])[0] ?? [];
}

const polygon = (outer: readonly Point[], holes: readonly Point[][] = []): Polygon =>
  holes.length > 0 ? { outer: ring(outer), holes: holes.map(ring) } : { outer: ring(outer) };

const box = (e: RColumn | RVoid | RStair): Box => ({
  id: e.id,
  source: source(e),
  at: umPoint(e.at),
  size: { w: um(e.size.w), h: um(e.size.h) },
});

function floorOf(r: RRoom): Floor {
  const outer = r.poly ?? (r.circle ? circleRing(r.circle.c, r.circle.r) : rectRing(r.at, r.size));
  return { id: r.id, source: source(r), polygon: polygon(outer), ...(r.uses?.length ? { uses: [...r.uses] } : {}) };
}

function furnitureOf(f: RFurniture): Furniture {
  const rotate = f.rotate ?? 0;
  return {
    id: f.id,
    source: source(f),
    category: f.category,
    ...(f.room ? { room: f.room } : {}),
    centre: umPoint({ x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 }),
    size: { w: um(f.size.w), d: um(f.size.h) },
    yawDeg: rotate === 0 ? 0 : -rotate,
    asset: "greybox",
  };
}

function outdoorOf(o: ROutdoor): Outdoor {
  return {
    id: o.id,
    source: source(o),
    surface: o.surface,
    polygon: polygon(o.poly ?? rectRing(o.at, o.size)),
    ...(o.rail?.length ? { rail: [...o.rail] } : {}),
  };
}

const fenceOf = (f: RFence): Fence => ({
  id: f.id,
  source: source(f),
  style: f.style,
  points: f.points.map(umPoint),
  closed: f.closed,
});

const stairOf = (s: RStair): Stair => ({
  id: s.id,
  source: source(s),
  box: box(s),
  dir: s.dir,
  width: um(s.width),
});

/** One storey's walls and openings, through the core's joinery. */
function wallsAndOpenings(
  ir: ResolvedPlan,
  byId: ReadonlyMap<string, ResolvedElement>,
): { walls: Wall[]; openings: Opening[] } {
  const own = wallOwnership(ir.walls);
  const cutsOf = new Map<number, string[]>();
  const openings: Opening[] = [];
  for (const cut of own.cuts) {
    const host = ir.walls[cut.wall];
    const op = cut.opening;
    const id = op.ownerId;
    if (!host || !id) continue;
    const el = byId.get(id);
    const kind =
      op.kind ?? (el?.kind === "door" || el?.kind === "window" || el?.kind === "opening" ? el.kind : "opening");
    const outer = loopsToPolygons([cut.loop])[0] ?? [];
    // The core registers every opening with a sill (a window's own, 0 for a door or a cased
    // opening) and a head; an opening without them would be dropped here, which the corpus test
    // turns red by counting the scene's openings against the joinery's cuts.
    const sill = op.sill;
    const head = op.head ?? (el && "head" in el ? (el as RDoor | RWindow | ROpening).head : undefined);
    if (sill === undefined || head === undefined) continue;
    const door = el?.kind === "door" ? (el as RDoor) : undefined;
    openings.push({
      id,
      source: el ? source(el) : { kind, id },
      kind,
      ...(door?.doorKind ? { doorKind: door.doorKind } : door ? { doorKind: "hinged" as const } : {}),
      host: host.id,
      cut: ring(outer),
      centre: umPoint(op.at),
      width: um(op.width),
      sill: um(sill),
      head: um(head),
      ...(door ? { hinge: door.hinge, swing: door.swing } : {}),
      ...(door?.slide ? { slide: door.slide } : {}),
    });
    cutsOf.set(cut.wall, [...(cutsOf.get(cut.wall) ?? []), id]);
  }
  const walls: Wall[] = own.owned.map((o) => ({
    id: o.wall.id,
    source: source(o.wall),
    category: o.wall.category,
    material: o.wall.material,
    footprint: o.pieces.map((p) => polygon(p.outer, p.holes)),
    height: um(o.wall.height),
    thickness: um(o.wall.thickness),
    cuts: cutsOf.get(o.index) ?? [],
  }));
  return { walls, openings };
}

function levelOf(s: Storey, ledger: Assumption[]): Level {
  const { ir } = s;
  const els = ir.elements;
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const of = <K extends ResolvedElement["kind"]>(k: K): Extract<ResolvedElement, { kind: K }>[] =>
    els.filter((e): e is Extract<ResolvedElement, { kind: K }> => e.kind === k);
  const { walls, openings } = wallsAndOpenings(ir, byId);
  const roofs: Roof[] = of("roof").map((r: RRoof) => ({
    id: r.id,
    source: source(r),
    form: "flat",
    ring: ring(r.ring),
    provenance: "default",
  }));
  for (const r of roofs) {
    ledger.push({
      kind: "roof",
      id: r.id,
      field: "form",
      value: "flat",
      provenance: "default",
      rule: "roof-default-flat",
    });
  }
  for (const k of ["elevator", "escalator"] as const) {
    for (const e of of(k)) {
      ledger.push({
        kind: k,
        id: e.id,
        field: "geometry",
        value: "omitted",
        provenance: "default",
        rule: "v0-omits-vertical-transport",
      });
    }
  }
  return {
    level: s.level,
    ...(s.name ? { name: s.name } : {}),
    elevation: um(ir.elevation),
    storeyHeight: um(ir.storeyHeight),
    floors: of("room").map(floorOf),
    walls,
    openings,
    furniture: of("furniture").map(furnitureOf),
    stairs: of("stair").map(stairOf),
    voids: of("void").map(box),
    columns: of("column").map(box),
    outdoor: of("outdoor").map(outdoorOf),
    fences: of("fence").map(fenceOf),
    roofs,
  };
}

/** Resolved storeys (lowest first) → a Scene3D v0. */
export function buildScene3D(storeys: readonly Storey[], opts: BuildOptions): Scene3D {
  const first = storeys[0];
  if (!first) throw new Error("buildScene3D needs at least one storey");
  const ledger: Assumption[] = [
    { kind: "door", field: "pose", value: "closed", provenance: "default", rule: "door-pose-closed" },
  ];
  const levels = storeys.map((s) => levelOf(s, ledger));
  return {
    version: 0,
    kind: "scene3d",
    meta: {
      name: first.ir.name,
      units: "mm",
      tool: { archlang3d: ARCHLANG_3D_VERSION, archlang: opts.coreVersion },
      north: typeof first.ir.north === "object" ? first.ir.north.deg : first.ir.north,
      ...(first.ir.siteBoundary ? { siteBoundary: ring(first.ir.siteBoundary) } : {}),
      assumptions: ledger,
    },
    levels,
  };
}
