/**
 * Resolved storeys → Scene3D v0. A mapping of the core's resolved facts into micrometres and
 * plan-aligned records: no geometry is built here beyond the core's own (wall ownership through
 * `joinWallSet`; arcs tessellated to a chord tolerance, `curves.ts`). Every value the plan did not state goes to the
 * assumption ledger.
 *
 * Reads only fields the exported IR types document; underscore-prefixed fields are not part of
 * the core's promise (ADR 0031) and are never read (`test/contract.test.ts`).
 */
import {
  doorLeaves,
  doorSwing,
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
import { circleRing, DEFAULT_CURVE_TOL_MM, tessellateLoops } from "../curves.js";
import { assetFor } from "../mesh/t0.js";
import { um, umPoint } from "../units.js";
import { type Point, wallOwnership } from "../walls/ownership.js";
import { FLOOR_OVERLAP_MIN_UM2, floorLifts, floorOverlaps, overlapArea } from "./overlap.js";
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
  Pt,
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
  /** Largest sagitta (mm) of an arc's chords; default {@link DEFAULT_CURVE_TOL_MM}. */
  curveTolMm?: number;
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

const polygon = (outer: readonly Point[], holes: readonly Point[][] = []): Polygon =>
  holes.length > 0 ? { outer: ring(outer), holes: holes.map(ring) } : { outer: ring(outer) };

const box = (e: RColumn | RVoid | RStair): Box => ({
  id: e.id,
  source: source(e),
  at: umPoint(e.at),
  size: { w: um(e.size.w), h: um(e.size.h) },
});

function floorOf(r: RRoom, tol: number): Floor {
  // A circle first: the core also carries it as a fixed 48-gon `poly` for the drawing, and the
  // exact circle is what the chord tolerance discretises.
  const outer = r.circle ? circleRing(r.circle.c, r.circle.r, tol) : (r.poly ?? rectRing(r.at, r.size));
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
    asset: assetFor(f.category),
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
  tol: number,
): { walls: Wall[]; openings: Opening[]; footprint: Ring3[] } {
  const own = wallOwnership(ir.walls, (loops) => tessellateLoops(loops, tol));
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
    const outer = tessellateLoops([cut.loop], tol)[0] ?? [];
    // The core registers every opening with a sill (a window's own, 0 for a door or a cased
    // opening) and a head; an opening without them would be dropped here, which the corpus test
    // turns red by counting the scene's openings against the joinery's cuts.
    const sill = op.sill;
    const head = op.head ?? (el && "head" in el ? (el as RDoor | RWindow | ROpening).head : undefined);
    if (sill === undefined || head === undefined) continue;
    const door = el?.kind === "door" ? (el as RDoor) : undefined;
    const hosted = el as RDoor | RWindow | ROpening | undefined;
    const jambs = jambsOf(op.at, op.width, hosted?.host ?? null);
    const leaves = door
      ? doorLeaves(door).map((l) => [umPoint(l.hinge), umPoint(l.farJamb), umPoint(l.leafEnd)] as [Pt, Pt, Pt])
      : [];
    openings.push({
      id,
      source: el ? source(el) : { kind, id },
      kind,
      ...(door?.doorKind ? { doorKind: door.doorKind } : door ? { doorKind: "hinged" as const } : {}),
      host: host.id,
      cut: ring(outer),
      centre: umPoint(op.at),
      jambs,
      ...(leaves.length > 0 ? { leaves } : {}),
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
    body: o.body.map((p) => polygon(p.outer, p.holes)),
    height: um(o.wall.height),
    thickness: um(o.wall.thickness),
    cuts: cutsOf.get(o.index) ?? [],
  }));
  return { walls, openings, footprint: own.outline.map(ring) };
}

/**
 * The storey's `status demolish` walls, from the plan as drawn (B3a's `ir.drawn`), solid, hosting
 * nothing. Each is TRIMMED to the standing walls (red-team round 1): the ghosts are joined with the
 * standing walls, standing walls listed first, so at a junction the joinery's own rule gives the
 * corner to the thicker wall and a thickness tie to the standing one, and a ghost butting a standing
 * wall stops at its face instead of standing in its openings. The standing walls' own ownership (H1)
 * is computed apart (`wallsAndOpenings`) and stays the plan after the demolition: a demolished wall
 * never takes a share of a standing one. A ghost THICKER than a standing wall it meets would keep
 * that corner; what it then overlaps of any standing wall is measured and ledgered
 * (`wall-demolish-overlap`), never guessed away.
 */
function demolishedOf(ir: ResolvedPlan, standing: readonly Wall[], ledger: Assumption[], tol: number): Wall[] {
  const gone = (ir.drawn?.walls ?? []).filter((w) => w.status === "demolish");
  if (gone.length === 0) return [];
  const own = wallOwnership([...ir.walls, ...gone], (loops) => tessellateLoops(loops, tol));
  return own.owned.slice(ir.walls.length).flatMap((o) => {
    const pieces = o.pieces.map((p) => polygon(p.outer, p.holes));
    // Wholly inside thicker standing walls: nothing of it is left to show.
    if (pieces.length === 0) return [];
    const overlap = pieces.reduce(
      (s, p) => s + standing.reduce((t, w) => t + w.footprint.reduce((u, q) => u + overlapArea(p, q), 0), 0),
      0,
    );
    if (overlap > FLOOR_OVERLAP_MIN_UM2) {
      ledger.push({
        kind: "wall",
        id: o.wall.id,
        field: "status",
        value: `ghost overlaps a thinner standing wall by ${Math.round(overlap / 1e6)} mm²`,
        provenance: "default",
        rule: "wall-demolish-overlap",
      });
    }
    return [
      {
        id: o.wall.id,
        source: source(o.wall),
        category: o.wall.category,
        material: o.wall.material,
        footprint: pieces,
        body: pieces,
        height: um(o.wall.height),
        thickness: um(o.wall.thickness),
        cuts: [],
      },
    ];
  });
}

/**
 * An opening's two jambs on its host's centreline: the core's own chord through the doorway (its
 * tangent there on a curved host), read through `doorSwing` with a probe door of the opening's width,
 * so the 3D package never re-derives a wall direction.
 */
function jambsOf(at: Point, width: number, host: RDoor["host"]): [Pt, Pt] {
  const s = host ? doorSwing({ at, width, hinge: "left", swing: "in", host }) : null;
  return s ? [umPoint(s.hinge), umPoint(s.farJamb)] : [umPoint(at), umPoint(at)];
}

function levelOf(s: Storey, ledger: Assumption[], tol: number): Level {
  const { ir } = s;
  const els = ir.elements;
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const of = <K extends ResolvedElement["kind"]>(k: K): Extract<ResolvedElement, { kind: K }>[] =>
    els.filter((e): e is Extract<ResolvedElement, { kind: K }> => e.kind === k);
  const { walls, openings, footprint } = wallsAndOpenings(ir, byId, tol);
  const demolished = demolishedOf(ir, walls, ledger, tol);
  for (const w of demolished) {
    ledger.push({
      kind: "wall",
      id: w.id,
      field: "status",
      value: "demolish",
      provenance: "authored",
      rule: "wall-demolish-ghost",
    });
  }
  const rooms = of("room").map((r) => floorOf(r, tol));
  const lifts = floorLifts(rooms, floorOverlaps(rooms));
  const floors = rooms.map((f) => {
    const lift = lifts.get(f.id);
    if (lift === undefined) return f;
    ledger.push({
      kind: "floor",
      id: f.id,
      field: "lift_mm",
      value: lift / 1000,
      provenance: "derived",
      rule: "floor-overlap-lift",
    });
    return { ...f, lift };
  });
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
    footprint,
    floors,
    walls,
    ...(demolished.length > 0 ? { demolished } : {}),
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
  const tol = opts.curveTolMm ?? DEFAULT_CURVE_TOL_MM;
  const ledger: Assumption[] = [
    { kind: "door", field: "pose", value: "closed", provenance: "default", rule: "door-pose-closed" },
    {
      kind: "curve",
      field: "tolerance_mm",
      value: tol,
      provenance: opts.curveTolMm === undefined ? "default" : "user-param",
      rule: "curve-tol",
    },
  ];
  const levels = storeys.map((s) => levelOf(s, ledger, tol));
  return {
    version: 0,
    kind: "scene3d",
    meta: {
      name: first.ir.name,
      units: "mm",
      tool: { archlang3d: ARCHLANG_3D_VERSION, archlang: opts.coreVersion },
      north: typeof first.ir.north === "object" ? first.ir.north.deg : first.ir.north,
      ...(first.ir.siteBoundary ? { siteBoundary: ring(first.ir.siteBoundary) } : {}),
      params: { curveTolMm: tol },
      assumptions: ledger,
    },
    levels,
  };
}
