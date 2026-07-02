/**
 * Shared semantic-analysis layer for the agent-facing tools.
 *
 * {@link describe} (semantic summary) and {@link lint} (architectural rules) both
 * need the same two things: a resolved plan, and a little rectilinear geometry over
 * room rectangles (areas, edge-touch adjacency, "is this opening on that room's
 * wall?"). That logic lives here once — pure, deterministic, zero-dep — so neither
 * tool re-implements geometry and both stay byte-stable.
 */

import { parse } from "./parser.js";
import { link } from "./import.js";
import { resolve } from "./ir.js";
import type { ResolvedPlan, RDoor, RRoom, ROpening } from "./ir.js";
import type { UseKind } from "./ast.js";
import { BUILTIN_REGISTRY, createRegistry } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import { segmentsOfWall, type WallLike, type WallSegment } from "./geometry.js";
import { overlap1d, type BBox } from "./geometry/rect.js";

/** Options shared by the analysis tools: a subset of {@link CompileOptions}. */
export type AnalyzeOptions = Pick<CompileOptions, "plugins" | "world">;

// Shared rect math lives in geometry/rect.ts; re-exported here so the many
// existing `from "./analyze.js"` importers keep working unchanged.
export { overlap1d };
export type { BBox };

/** Default mm tolerance for edge-touch / point-on-edge tests (≈ one partition wall). */
export const DEFAULT_TOL = 200;

/**
 * Run parse → link → resolve (the same pipeline as `compile`, semantics live in
 * {@link resolve}). Returns the resolved IR, or `null` when fatal errors prevented
 * resolution, alongside every diagnostic. Never throws on user-source problems.
 */
export function resolvePlan(
  source: string,
  opts: AnalyzeOptions = {},
): { ir: ResolvedPlan | null; diagnostics: Diagnostic[] } {
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolve(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])];

  const hasError = diagnostics.some((d) => d.severity === "error");
  return { ir: !resolved || hasError ? null : resolved.ir, diagnostics };
}

/** Axis-aligned rectangle of a sized element. */
export function rectOf(e: { at: Point; size: { w: number; h: number } }): BBox {
  return { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h };
}

/** A room label/id that reads as a bedroom (sleeping space). */
const BEDROOM_RE = /\bbed\b|bedroom/i;
/** Reads as a wet room (bathroom / WC / shower). */
const WET_RE = /\bbath\b|bathroom|\bwc\b|toilet|ensuite|en-suite|shower|washroom/i;
/** A specifically WC-only wet room (vs a full bathroom). */
const WC_RE = /\bwc\b|toilet|powder/i;
/** Reads as a kitchen. */
const KITCHEN_RE = /kitchen|kitchenette/i;
/** Reads as circulation (hall/corridor) or an entry — high-confidence only. */
const HALL_RE = /\bhall\b|hallway|corridor|landing/i;
const ENTRY_RE = /\bfoyer\b|vestibule|\bentry\b|\bentrance\b|mudroom/i;

/**
 * The function(s) a room is classified as. Explicit `uses …` are authored intent
 * and win; otherwise we fall back to a conservative keyword match on the label (or
 * id) — exactly the classification the lint rules used before `uses` existed, so an
 * untagged plan behaves identically. Returns a set (a studio is `living kitchen`).
 */
export function roomUses(room: { label?: string; id: string; uses?: UseKind[] }): Set<UseKind> {
  if (room.uses && room.uses.length > 0) return new Set(room.uses);
  const text = room.label ?? room.id;
  const s = new Set<UseKind>();
  if (BEDROOM_RE.test(text)) s.add("bedroom");
  if (WET_RE.test(text)) s.add(WC_RE.test(text) ? "wc" : "bath");
  if (KITCHEN_RE.test(text)) s.add("kitchen");
  if (ENTRY_RE.test(text)) s.add("entry");
  else if (HALL_RE.test(text)) s.add("hall");
  return s;
}

/** Does the room read as a bedroom? */
export const isBedroom = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("bedroom");
/** Does the room read as a wet room (full bath or WC)? */
export const isWetRoom = (room: { label?: string; id: string; uses?: UseKind[] }): boolean => {
  const u = roomUses(room);
  return u.has("bath") || u.has("wc");
};
/** Does the room read as a kitchen? */
export const isKitchen = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("kitchen");
/** Does the room read as circulation (hall) or an entry/foyer? */
export const isCirculation = (room: { label?: string; id: string; uses?: UseKind[] }): boolean => {
  const u = roomUses(room);
  return u.has("hall") || u.has("circulation") || u.has("entry");
};

/** Do two room rectangles share an edge (touch) within tolerance? A shared corner
 *  alone does not count — the perpendicular overlap must be positive. */
export function roomsAdjacent(a: BBox, b: BBox, tol: number): boolean {
  const vTouch = Math.abs(a.x + a.w - b.x) <= tol || Math.abs(b.x + b.w - a.x) <= tol;
  if (vTouch && overlap1d(a.y, a.y + a.h, b.y, b.y + b.h) > 0) return true;
  const hTouch = Math.abs(a.y + a.h - b.y) <= tol || Math.abs(b.y + b.h - a.y) <= tol;
  if (hTouch && overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) > 0) return true;
  return false;
}

/** Does point `p` lie on the perimeter of rectangle `r` (within tolerance)? */
export function pointOnRoomEdge(p: Point, r: BBox, tol: number): boolean {
  const onLeftRight =
    (Math.abs(p.x - r.x) <= tol || Math.abs(p.x - (r.x + r.w)) <= tol) && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  const onTopBottom =
    (Math.abs(p.y - r.y) <= tol || Math.abs(p.y - (r.y + r.h)) <= tol) && p.x >= r.x - tol && p.x <= r.x + r.w + tol;
  return onLeftRight || onTopBottom;
}

/**
 * Ids of the rooms whose perimeter point `p` sits on (within tolerance). Iterates
 * `roomRects` in insertion order so callers get a stable, element-ordered list:
 * ≤2 ids for a door on a shared partition, 1 for a window on an exterior wall.
 */
export function roomsAtPoint(p: Point, roomRects: Map<string, BBox>, tol: number): string[] {
  const out: string[] = [];
  for (const [id, rect] of roomRects) {
    if (pointOnRoomEdge(p, rect, tol)) out.push(id);
  }
  return out;
}

/**
 * The one or two spaces a door connects: room ids, and/or the literal `"exterior"`
 * when the door sits on an outer wall with open space on one side. This is the
 * adjacency-via-doors edge that both {@link import("./describe.js").describe} (for its
 * `between` field) and the connectivity lint rules build their room graph from.
 */
export function doorConnections(
  d: { at: Point; host: { category: string } | null },
  roomRects: Map<string, BBox>,
  tol: number,
): string[] {
  const touching = roomsAtPoint(d.at, roomRects, tol);
  const onExterior = d.host?.category === "exterior";
  return touching.length >= 2 ? touching.slice(0, 2) : onExterior ? ["exterior", ...touching] : touching;
}

/** The synthetic graph node standing for the world outside the building. */
export const EXTERIOR_NODE = "exterior";

/**
 * Default mm subtracted from a door's *nominal* width to estimate its *clear*
 * opening (leaf thickness, stop, frame projection). A coarse advisory assumption —
 * a real clear width depends on door type and hardware, which ArchLang doesn't model
 * yet — so the access graph exposes BOTH the nominal and the estimate.
 */
export const DEFAULT_CLEAR_ALLOWANCE_MM = 60;

/** One connector (door or cased opening) as a graph edge between two spaces. */
export interface AccessEdge {
  /** Id of the door/opening element. (`doorId` kept as the historical field name.) */
  doorId: string;
  /** Whether this edge is a `door` (has a leaf) or a leaf-less `opening`. */
  kind: "door" | "opening";
  /** The two spaces it connects (room ids and/or `"exterior"`). */
  between: [string, string];
  nominalWidth: number;
  /** Clear opening width: a door loses the leaf/stop allowance; an opening keeps it all. */
  estimatedClearWidth: number;
  /** Category of the host wall, if any (`"exterior"`, `"partition"`, …). */
  hostCategory?: string;
  /** Id of the host wall, if any (answers "which wall is this opening on?"). */
  hostWallId?: string;
  /** Connects the exterior to a room (an entrance edge). */
  exterior: boolean;
  /** The point touched 3+ rooms, so its endpoints are not well-defined; it is
   *  reported but excluded from reachability/bottleneck. */
  ambiguous: boolean;
}

/** A room as a node, with its reachability facts from the building entrance(s). */
export interface AccessRoomNode {
  id: string;
  /** Door hops from the nearest entrance (1 = opens directly outside); null if unreachable. */
  depthFromEntrance: number | null;
  /** Reachable from the exterior through modeled doors. */
  reachable: boolean;
  /** Narrowest clear width (mm) along the widest path from the exterior; null if unreachable. */
  bottleneckClearWidth: number | null;
}

/**
 * The modeled door access graph: rooms (and a synthetic exterior node) joined by
 * door edges, with reachability/depth and a widest-path clear-width bottleneck.
 * This is the geometric+topological *fact* layer circulation lint builds on — it is
 * a model of the *modeled doors*, not circulation truth (open-plan/cased openings
 * that are not `door`s are invisible until the language models them).
 */
export interface AccessGraph {
  /** Door ids that connect the exterior to a room. */
  entrances: string[];
  hasEntrance: boolean;
  edges: AccessEdge[];
  rooms: AccessRoomNode[];
}

/**
 * Build the {@link AccessGraph} from the resolved rooms + doors. Pure and
 * deterministic: rooms are processed in source order; BFS for depth starts at the
 * single {@link EXTERIOR_NODE} and visits neighbours in door source order; the
 * widest-path bottleneck (max over paths of the min clear width) is a unique value,
 * so its node tie-break order does not affect the result.
 */
export function buildDoorAccessGraph(
  rooms: RRoom[],
  doors: RDoor[],
  tol: number,
  clearAllowanceMm: number = DEFAULT_CLEAR_ALLOWANCE_MM,
  openings: ROpening[] = [],
): AccessGraph {
  const roomRects = new Map<string, BBox>(rooms.map((r) => [r.id, rectOf(r)]));

  // Doors and cased openings are both connectors; an opening keeps its full width
  // as clear (no leaf), a door loses the leaf/stop allowance.
  const connectors: Array<{
    id: string;
    at: Point;
    width: number;
    host: { category: string; wallId: string } | null;
    kind: "door" | "opening";
  }> = [
    ...doors.map((d) => ({ id: d.id, at: d.at, width: d.width, host: d.host, kind: "door" as const })),
    ...openings.map((o) => ({ id: o.id, at: o.at, width: o.width, host: o.host, kind: "opening" as const })),
  ];

  const edges: AccessEdge[] = connectors.map((c) => {
    const touching = roomsAtPoint(c.at, roomRects, tol);
    const between = doorConnections(c, roomRects, tol);
    const exterior = between.includes(EXTERIOR_NODE);
    return {
      doorId: c.id,
      kind: c.kind,
      between: [between[0] ?? "", between[1] ?? ""] as [string, string],
      nominalWidth: c.width,
      estimatedClearWidth: c.kind === "opening" ? c.width : Math.max(0, c.width - clearAllowanceMm),
      ...(c.host?.category !== undefined ? { hostCategory: c.host.category } : {}),
      ...(c.host?.wallId !== undefined ? { hostWallId: c.host.wallId } : {}),
      exterior,
      ambiguous: touching.length >= 3,
    };
  });

  // Adjacency from usable edges only (exactly two endpoints, not ambiguous), in door
  // source order so BFS neighbour order is deterministic.
  const adj = new Map<string, Array<{ to: string; clear: number }>>();
  const link = (a: string, b: string, clear: number): void => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, clear });
  };
  const entrances: string[] = [];
  for (const e of edges) {
    if (e.ambiguous || e.between[0] === "" || e.between[1] === "") continue;
    const [a, b] = e.between;
    link(a, b, e.estimatedClearWidth);
    link(b, a, e.estimatedClearWidth);
    if (e.exterior && (a === EXTERIOR_NODE) !== (b === EXTERIOR_NODE)) entrances.push(e.doorId);
  }

  // BFS depth from the exterior (1 = a room opening directly outside).
  const depth = new Map<string, number>([[EXTERIOR_NODE, 0]]);
  const queue: string[] = [EXTERIOR_NODE];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const { to } of adj.get(cur) ?? []) {
      if (depth.has(to)) continue;
      depth.set(to, depth.get(cur)! + 1);
      queue.push(to);
    }
  }

  // Widest path (max-min clear width) from the exterior. The bottleneck *value* is
  // unique, so a deterministic Dijkstra-style relaxation suffices.
  const order = [EXTERIOR_NODE, ...rooms.map((r) => r.id)];
  const rank = new Map<string, number>(order.map((id, i) => [id, i]));
  const best = new Map<string, number>([[EXTERIOR_NODE, Infinity]]);
  const done = new Set<string>();
  for (;;) {
    let u: string | null = null;
    for (const id of order) {
      if (done.has(id) || !best.has(id)) continue;
      if (
        u === null ||
        best.get(id)! > best.get(u)! ||
        (best.get(id)! === best.get(u)! && rank.get(id)! < rank.get(u)!)
      )
        u = id;
    }
    if (u === null) break;
    done.add(u);
    for (const { to, clear } of adj.get(u) ?? []) {
      const cand = Math.min(best.get(u)!, clear);
      if (cand > (best.get(to) ?? -Infinity)) best.set(to, cand);
    }
  }

  const roomNodes: AccessRoomNode[] = rooms.map((r) => {
    const reachable = depth.has(r.id);
    return {
      id: r.id,
      depthFromEntrance: reachable ? depth.get(r.id)! : null,
      reachable,
      bottleneckClearWidth: reachable ? (best.get(r.id) ?? null) : null,
    };
  });

  return { entrances, hasEntrance: entrances.length > 0, edges, rooms: roomNodes };
}

/** Total length covered by a set of 1-D intervals after merging overlaps. */
function mergedLength(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  return total + (ce - cs);
}

/**
 * The largest contiguous run (mm) of a room's four edges that is **not** backed by
 * a wall centerline — i.e. how open the room's perimeter is. For each axis-aligned
 * edge, the orthogonal wall segments collinear with it (within `tol`) are clipped
 * to the edge and merged; the worst edge's `edgeLength − coveredLength` is returned.
 *
 * Openings (doors/windows) are not split out of wall centerlines — they live in
 * `RWall.openings` and are only subtracted at render time — so a wall carrying a
 * door still counts as fully enclosing. Only a genuine missing wall registers as a
 * gap (e.g. a partition that stops short, leaving a wet room open to a living space).
 * Angled walls match no edge and contribute nothing; the rule is for orthogonal rooms.
 */
export function largestPerimeterGap(
  rect: BBox,
  walls: WallLike[],
  tol: number,
  // Callers looping over many rooms hoist the segment list once and pass it in.
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): number {
  const edges = [
    { axis: "h" as const, fixed: rect.y, lo: rect.x, hi: rect.x + rect.w },
    { axis: "h" as const, fixed: rect.y + rect.h, lo: rect.x, hi: rect.x + rect.w },
    { axis: "v" as const, fixed: rect.x, lo: rect.y, hi: rect.y + rect.h },
    { axis: "v" as const, fixed: rect.x + rect.w, lo: rect.y, hi: rect.y + rect.h },
  ];
  let worst = 0;
  for (const e of edges) {
    const covered: Array<[number, number]> = [];
    for (const s of segs) {
      const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
      const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
      if (e.axis === "h") {
        if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.x, s.b.x);
        const shi = Math.max(s.a.x, s.b.x);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      } else {
        if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.y, s.b.y);
        const shi = Math.max(s.a.y, s.b.y);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      }
    }
    const gap = e.hi - e.lo - mergedLength(covered);
    if (gap > worst) worst = gap;
  }
  return worst;
}

/**
 * The activity-clearance rectangle directly in front of a fixture — the space a
 * person needs to use it. "Front" is the face opposite the symbol's back, derived
 * from its quarter-turn `rotate` (0 = back north → front south, 90 → front west, …).
 * Used by the clearance lint; returns a zero-area rect when `clearance` is 0.
 */
export function frontClearanceRect(
  f: { at: Point; size: { w: number; h: number }; rotate?: number },
  clearance: number,
): BBox {
  const { x, y } = f.at;
  const { w, h } = f.size;
  const rot = (((f.rotate ?? 0) % 360) + 360) % 360;
  switch (rot) {
    case 90:
      return { x: x - clearance, y, w: clearance, h }; // front west
    case 180:
      return { x, y: y - clearance, w, h: clearance }; // front north
    case 270:
      return { x: x + w, y, w: clearance, h }; // front east
    default:
      return { x, y: y + h, w, h: clearance }; // rot 0 → front south
  }
}

/**
 * Is any edge of `rect` backed by a wall over at least half its length (within
 * `tol` of a collinear wall centerline)? Distinguishes a fixture placed against a
 * wall from one floating in the middle of a room. `tol` should comfortably exceed a
 * wall's half-thickness (a fixture's back sits at the wall *face*, half a thickness
 * off the centerline) plus a small installation setback.
 */
export function isAgainstWall(
  rect: BBox,
  walls: WallLike[],
  tol: number,
  // Callers looping over many fixtures hoist the segment list once and pass it in.
  segs: readonly WallSegment[] = walls.flatMap((w) => segmentsOfWall(w)),
): boolean {
  const edges = [
    { axis: "h" as const, fixed: rect.y, lo: rect.x, hi: rect.x + rect.w },
    { axis: "h" as const, fixed: rect.y + rect.h, lo: rect.x, hi: rect.x + rect.w },
    { axis: "v" as const, fixed: rect.x, lo: rect.y, hi: rect.y + rect.h },
    { axis: "v" as const, fixed: rect.x + rect.w, lo: rect.y, hi: rect.y + rect.h },
  ];
  for (const e of edges) {
    const len = e.hi - e.lo;
    if (len <= 0) continue;
    const covered: Array<[number, number]> = [];
    for (const s of segs) {
      const isH = Math.abs(s.a.y - s.b.y) < 1e-6;
      const isV = Math.abs(s.a.x - s.b.x) < 1e-6;
      if (e.axis === "h") {
        if (!isH || Math.abs((s.a.y + s.b.y) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.x, s.b.x);
        const shi = Math.max(s.a.x, s.b.x);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      } else {
        if (!isV || Math.abs((s.a.x + s.b.x) / 2 - e.fixed) > tol) continue;
        const slo = Math.min(s.a.y, s.b.y);
        const shi = Math.max(s.a.y, s.b.y);
        if (overlap1d(slo, shi, e.lo, e.hi) > 0) covered.push([Math.max(slo, e.lo), Math.min(shi, e.hi)]);
      }
    }
    if (mergedLength(covered) >= len * 0.5) return true;
  }
  return false;
}
