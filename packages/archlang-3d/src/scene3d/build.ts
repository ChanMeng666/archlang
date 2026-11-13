/**
 * Resolved storeys → Scene3D v0. A mapping of the core's resolved facts into micrometres and
 * plan-aligned records: no geometry is built here beyond the core's own (wall ownership through
 * `joinWallSet`; arcs tessellated to a chord tolerance, `curves.ts`). Every value the plan did not state goes to the
 * assumption ledger.
 *
 * Reads only fields the exported IR types document; underscore-prefixed fields are not part of
 * the core's promise (ADR 0031) and are never read (`test/contract.test.ts`).
 */
import { version } from "../../package.json";
import * as core from "@chanmeng666/archlang";
import {
  doorLeaves,
  doorSwing,
  entryEdges,
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
import { assetFor, handedAt, isHandedAsset } from "../mesh/t0.js";
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
  Side,
  Source,
  Stair,
  StairFlight,
  Wall,
} from "./types.js";

/** The package's own version, stamped into `meta.tool`. */
export const ARCHLANG_3D_VERSION = version;

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
  /**
   * Per storey (in `storeys` order), the ids of the furniture the plan reflects, or `null` where
   * that is unknown; read only for a handed asset (`T0_HANDED`). Omitted: unknown everywhere, so a
   * handed piece stands as a grey box. `adaptPlan` fills it from the core's Plan JSON.
   */
  mirrored?: ReadonlyArray<ReadonlySet<string> | null>;
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
  return {
    id: r.id,
    source: source(r),
    polygon: polygon(outer),
    ...(r.uses?.length ? { uses: [...r.uses] } : {}),
    // The author's `floor` word (card RM8.7): a public, non-underscore field of `RRoom` (ADR 0031).
    ...(r.floor !== undefined ? { pattern: r.floor } : {}),
  };
}

/**
 * A piece of furniture. A handed asset (`T0_HANDED`) needs the plan's reflection of the piece: it
 * carries `mirror` when `mirrored` (this storey's reflected ids, from the core's Plan JSON) holds
 * it, and when that fact is unknown (`null`: the core could not project the plan) it stands as a
 * grey box, ledgered, rather than show a hand the drawing may not.
 */
function furnitureOf(f: RFurniture, mirrored: ReadonlySet<string> | null, ledger: Assumption[]): Furniture {
  const rotate = f.rotate ?? 0;
  let asset = assetFor(f.category);
  // Handed at THIS piece's size (its own width and depth: the plan box turned back), so a bicycle
  // stood along its depth, symmetric there, is never greyed for want of its reflection (red-team
  // N3, PR #463).
  const turned = Math.abs(rotate % 180) === 90;
  const [w, d] = turned ? [f.size.h, f.size.w] : [f.size.w, f.size.h];
  const handed = isHandedAsset(asset) && handedAt(asset.slice("t0:".length), w, d);
  if (handed && mirrored === null) {
    asset = "greybox";
    ledger.push({
      kind: "furniture",
      id: f.id,
      field: "asset",
      value: "greybox",
      provenance: "default",
      rule: "furniture-handed-mirror-unknown",
    });
  }
  return {
    id: f.id,
    source: source(f),
    category: f.category,
    ...(f.room ? { room: f.room } : {}),
    centre: umPoint({ x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 }),
    size: { w: um(f.size.w), d: um(f.size.h) },
    yawDeg: rotate === 0 ? 0 : -rotate,
    asset,
    ...(handed && mirrored?.has(f.id) ? { mirror: true as const } : {}),
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

const OPPOSITE: Readonly<Record<Side, Side>> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/**
 * A stair's flights in climbing order, each with the edge its climb starts from and the tread
 * divisions the plan draws on it, read from the core and never re-derived: a turning stair's
 * `flights` (each `tail`, the edge it is entered by on THIS storey) and `landings`, or a straight
 * stair's own rectangle and `entryEdges` (the core's tail, which a `place` frame has carried). On a
 * `dir down` stop the tail is the flight's head, so the climb's foot is the opposite edge. The
 * count is the core's `treadCount` of the run (the side the tail runs along, as the drawing reads
 * it), so the treads stand on the drawing's tread lines. `undefined` when the core does not export
 * `treadCount` (a core before the amendment of 2026-11-06 to ADR 0031): no stair is built then.
 */
function stairPieces(s: RStair, lines: readonly Segment[]): Pick<Stair, "flights" | "landings"> | undefined {
  const treadCount = (core as Partial<typeof core>).treadCount;
  if (typeof treadCount !== "function") return undefined;
  const flight = (at: Point, size: { w: number; h: number }, tail: Side): StairFlight => ({
    at: umPoint(at),
    size: { w: um(size.w), h: um(size.h) },
    foot: s.dir === "up" ? tail : OPPOSITE[tail],
    treads: treadCount(tail === "top" || tail === "bottom" ? size.h : size.w),
  });
  if (s.flights && s.landings) {
    const flights = s.flights;
    return {
      flights: flights.map((f) => flight(f.at, f.size, f.tail)),
      landings: s.landings.map((l, i) => {
        const before = flights[i];
        const winders = before ? winderTreads(l, before, lines) : undefined;
        return { at: umPoint(l.at), size: { w: um(l.size.w), h: um(l.size.h) }, ...(winders ? { winders } : {}) };
      }),
    };
  }
  const tail = entryEdges(s)[0];
  return tail ? { flights: [flight(s.at, s.size, tail)], landings: [] } : undefined;
}

const stairOf = (s: RStair, lines: ReadonlyMap<string, readonly Segment[]>): Stair => ({
  id: s.id,
  source: source(s),
  box: box(s),
  dir: s.dir,
  width: um(s.width),
  ...stairPieces(s, lines.get(s.id) ?? []),
});

/** A straight line the core's drawing draws (mm, plan axes). */
type Segment = readonly [Point, Point];

/** A block stair's rectangle (a flight or a landing), as the core resolves it. */
type StairPiece = NonNullable<RStair["landings"]>[number];

/**
 * The straight lines the core's own drawing of this storey draws for each stair, by stair id, read
 * off `toScene(ir, { annotate: true })` (a public export; `annotate` stamps every primitive with its
 * element's id and changes nothing drawn). Drawn only when a stair of the storey has a `winders`
 * landing (card RM1.2g), the one thing read from it, so every other plan draws nothing more here.
 * Empty on a core without `toScene`, where such a landing is then built level.
 */
function stairLines(ir: ResolvedPlan, stairs: readonly RStair[]): ReadonlyMap<string, readonly Segment[]> {
  const out = new Map<string, Segment[]>();
  const toScene = (core as Partial<typeof core>).toScene;
  if (typeof toScene !== "function" || !stairs.some((s) => s.landings?.some((l) => l.winders !== undefined)))
    return out;
  for (const n of toScene(ir, { annotate: true }).nodes) {
    if (n.elementKind !== "stair" || n.elementId === undefined || n.prim.t !== "line") continue;
    const list = out.get(n.elementId) ?? [];
    list.push([n.prim.a, n.prim.b]);
    out.set(n.elementId, list);
  }
  return out;
}

/** How near two drawn coordinates (mm) must be to be one: the drawing computes both from the same numbers. */
const NEAR_MM = 1e-6;

/**
 * The tapered treads of a `winders <n>` landing (card RM1.2g), in climbing order, each its plan
 * ring (µm), cut out of the landing by the lines the core's drawing draws across it, never
 * re-derived: those `n - 1` lines fan from the landing's inner corner, the corner of the side the
 * flight `before` stands against (the side the climb enters by), to the two sides that corner does
 * not lie on. Ordered by their angle from the entry side, tread `k` is the corner, the end of line
 * `k - 1` (of the entry side for the first), the landing's far corner when the two ends lie on
 * different sides, and the end of line `k` (of the exit side for the last). `undefined` on a level
 * landing, and where the drawing does not draw exactly `n - 1` such lines from one such corner: that
 * landing is then built level.
 */
function winderTreads(l: StairPiece, before: StairPiece, lines: readonly Segment[]): Pt[][] | undefined {
  const n = l.winders;
  if (n === undefined) return undefined;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= NEAR_MM;
  const [x0, y0] = [l.at.x, l.at.y];
  const [x1, y1] = [x0 + l.size.w, y0 + l.size.h];
  const inside = (p: Point): boolean =>
    p.x >= x0 - NEAR_MM && p.x <= x1 + NEAR_MM && p.y >= y0 - NEAR_MM && p.y <= y1 + NEAR_MM;
  const [bx0, by0, bx1, by1] = [before.at.x, before.at.y, before.at.x + before.size.w, before.at.y + before.size.h];
  /** Whether the flight before stands against the side from `(ax, ay)` to `(bx, by)` (one axis fixed). */
  const against = (ax: number, ay: number, bx: number, by: number): boolean =>
    ay === by
      ? (near(by0, ay) || near(by1, ay)) && bx0 < Math.max(ax, bx) - NEAR_MM && bx1 > Math.min(ax, bx) + NEAR_MM
      : (near(bx0, ax) || near(bx1, ax)) && by0 < Math.max(ay, by) - NEAR_MM && by1 > Math.min(ay, by) + NEAR_MM;
  const fans = (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as const
  ).flatMap(([cx, cy]) => {
    // The sides this corner does not lie on: `x = ox` and `y = oy`.
    const [ox, oy] = [near(cx, x0) ? x1 : x0, near(cy, y0) ? y1 : y0];
    // The entry side through it: along x (the side `y = cy`) or along y (`x = cx`), or neither.
    const alongX = against(cx, cy, ox, cy);
    if (!alongX && !against(cx, cy, cx, oy)) return [];
    const ends = lines.flatMap(([a, b]): Point[] => {
      for (const [p, q] of [
        [a, b],
        [b, a],
      ] as const)
        if (near(p.x, cx) && near(p.y, cy) && inside(q) && (near(q.x, ox) || near(q.y, oy))) return [q];
      return [];
    });
    return ends.length === n - 1 ? [{ c: { x: cx, y: cy }, ox, oy, alongX, ends }] : [];
  });
  const fan = fans[0];
  if (fans.length !== 1 || !fan) return undefined;
  const { c, ox, oy, alongX } = fan;
  const entry: Point = alongX ? { x: ox, y: c.y } : { x: c.x, y: oy };
  const exit: Point = alongX ? { x: c.x, y: oy } : { x: ox, y: c.y };
  const [ux, uy] = [entry.x - c.x, entry.y - c.y];
  /** The angle at the corner from the entry side to `p`, within the quarter turn. */
  const angle = (p: Point): number => {
    const [vx, vy] = [p.x - c.x, p.y - c.y];
    return Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
  };
  const ends = [entry, ...[...fan.ends].sort((a, b) => angle(a) - angle(b)), exit];
  const onX = (p: Point): boolean => near(p.x, ox);
  const onY = (p: Point): boolean => near(p.y, oy);
  return Array.from({ length: n }, (_, k) => {
    const [a, b] = [ends[k] as Point, ends[k + 1] as Point];
    const far = !(onX(a) && onX(b)) && !(onY(a) && onY(b));
    return [c, a, ...(far ? [{ x: ox, y: oy }] : []), b].map(umPoint);
  });
}

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

function levelOf(s: Storey, ledger: Assumption[], tol: number, mirrored: ReadonlySet<string> | null): Level {
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
  const stairs = of("stair");
  // Card RM1.2g: the lines the drawing draws for each stair, read only where one has winders.
  const winderLines = stairLines(ir, stairs);
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
    furniture: of("furniture").map((f) => furnitureOf(f, mirrored, ledger)),
    stairs: stairs.map((st) => stairOf(st, winderLines)),
    // A core `void … polygon` (an L) carries the rectangles its hole is made of (`parts`): each is
    // one box, ids `<id>#<k>` (unique per collection), `source` still naming the void.
    voids: of("void").flatMap((v) =>
      v.parts ? v.parts.map((p, k) => ({ ...box({ ...v, at: p.at, size: p.size }), id: `${v.id}#${k}` })) : [box(v)],
    ),
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
  const levels = storeys.map((s, i) => levelOf(s, ledger, tol, opts.mirrored?.[i] ?? null));
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
