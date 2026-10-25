/**
 * Circulation and privacy: three advisory rules that read the access graph
 * (`describe().access`, the same `"probe"` graph `reachability.ts` walks).
 *
 *  - `W_ROOM_VIA_PRIVATE`: a room reached only through a bedroom, bathroom or WC.
 *  - `W_WET_ROOM_DOOR`: a bathroom or WC with no door, a door onto a kitchen or dining room,
 *    or two doors that make it a passage.
 *  - `W_ENTRANCE_INTO_PRIVATE`: the way in from outside lands in a bedroom, bathroom or WC.
 *
 * A room's use is {@link roomUses}: its authored `uses` first, then the label vocabulary.
 * A room with no classified use is skipped by all three rules and declared to the lint coverage
 * report (`ctx.skip`, PS2.13). `W_WET_ROOM_DOOR` (all but its kitchen arm) and
 * `W_ENTRANCE_INTO_PRIVATE` describe a home, so on a plan that reads as non-residential they
 * decline and say so (`non-dwelling`, PS2.18); `W_ROOM_VIA_PRIVATE` judges every plan.
 *
 * "Private" is a bedroom, bath or WC use with no public use beside it. A room that is
 * also a living space, dining room, kitchen, hall, circulation or entry (a bedsit authored
 * `uses bedroom living`) is a room people pass through by design, so none of these rules
 * treats it as private.
 *
 * Every message gives the measured fact first, then one line of reason with its source.
 * The hints hold the options, each checked against the room edges the rooms really share
 * ({@link roomsAdjacent}, the predicate behind `describe().rooms[].adjacent`), then an
 * "accept if" line. Element ids appear only in the hints. No rule offers a machine fix: a
 * door is a geometric decision. No option suggests shrinking, deleting or relabelling a room,
 * and every door an option proposes is held to a width floor, so a plan cannot satisfy a
 * rule by cutting a room down to a sliver.
 */

import type { Point, UseKind } from "../../ast.js";
import {
  accessDigraph,
  type AccessEdge,
  connectorFacePath,
  connectorFaces,
  EXTERIOR_NODE,
  isBedroom,
  pointInRoomBox,
  reachFrom,
  rectOf,
  type RoomBox,
  roomRing,
  roomsAdjacent,
  roomUses,
  wetRoomsOnlyViaBedroom,
} from "../../analyze.js";
import { entranceInputs, entranceWays } from "../../analyze/entrance.js";
import type { Digraph } from "../../algebra/paths.js";
import type { Diagnostic } from "../../diagnostics.js";
import { canonicalFixture } from "../../elements/fixtures-glyphs.js";
import type { WallSegment } from "../../geometry.js";
import { collinearOverlapLength, distPointToSegment, polygonEdges } from "../../geometry/polygon.js";
import type { RDoor, RRoom } from "../../ir.js";
import { fmt0, fmt2 } from "../../num-format.js";
import { judgesAsDwelling, type LintContext, type LintRule } from "../context.js";
import { openingClauseById } from "../../wall-ref.js";
import { capFirst } from "../../naming.js";

/** Uses that make a room one people pass through by design. */
const PUBLIC_USES: ReadonlySet<UseKind> = new Set<UseKind>([
  "living",
  "dining",
  "kitchen",
  "hall",
  "circulation",
  "entry",
]);
/** Uses of a room a person lives in rather than visits (the wet-room door rules' "habitable"). */
const HABITABLE_USES: ReadonlySet<UseKind> = new Set<UseKind>(["living", "dining", "kitchen", "bedroom", "office"]);
/** Uses of a room that may sit inside a private suite: a bath's far side is one of these. */
const SUITE_USES: ReadonlySet<UseKind> = new Set<UseKind>(["bedroom", "bath", "wc", "storage"]);
/** Uses of a room a door may be moved onto to take it off a kitchen: circulation. */
const CIRCULATION_USES: ReadonlySet<UseKind> = new Set<UseKind>(["hall", "circulation", "entry"]);

type PrivateKind = "bedroom" | "bath" | "wc";
const NOUN: Record<PrivateKind, string> = { bedroom: "bedroom", bath: "bathroom", wc: "WC" };

/**
 * The narrowest door an option may propose into a room of each use: GB 50096-2011 Table
 * 5.8.7's door openings (bedroom and living 900 mm, kitchen 800, bath and WC 700), read as
 * advice. A room with several uses takes the widest; an unlisted use takes 800.
 */
function doorFloorMm(uses: ReadonlySet<UseKind>): number {
  let w = 0;
  for (const u of uses) {
    const f = u === "bath" || u === "wc" ? 700 : u === "kitchen" ? 800 : HABITABLE_USES.has(u) ? 900 : 800;
    w = Math.max(w, f);
  }
  return w || 800;
}
/** The wall a door needs beyond its own width: a 100 mm nib at each jamb. */
const NIBS_MM = 200;
/** A front door's width floor (GB 50096-2011 Table 5.8.7, 户门 1000 mm, as advice). */
const FRONT_DOOR_MM = 1000;
/** The clear width a corridor an option proposes must keep (GB 50096-2011 5.7.1: 900 mm). */
const CORRIDOR_MM = 900;
/** The clear width of an entrance lobby an option proposes (GB 50096-2011 5.7.1: 1200 mm). */
const ENTRY_LOBBY_MM = 1200;

const mm = (n: number): string => fmt2(Math.round(n));

/** The room's private kind, or `null` when it has no such use or a public use beside it. */
function privateKind(uses: ReadonlySet<UseKind>): PrivateKind | null {
  for (const u of uses) if (PUBLIC_USES.has(u)) return null;
  if (uses.has("bedroom")) return "bedroom";
  if (uses.has("bath")) return "bath";
  if (uses.has("wc")) return "wc";
  return null;
}

const hasAny = (uses: ReadonlySet<UseKind>, of: ReadonlySet<UseKind>): boolean => {
  for (const u of uses) if (of.has(u)) return true;
  return false;
};

/** Does the edge join two spaces (not ambiguous, both ends named)? */
const joins = (e: AccessEdge): boolean => !e.ambiguous && e.between[0] !== "" && e.between[1] !== "";

/**
 * The longest single straight run (mm) along which an edge of `ring` lies on one of `segs`
 * (within `tol` of it, on centrelines). Overlaps on one line are merged where they touch, and
 * separate runs are never added together: a door has to fit in ONE run.
 */
function longestRunMm(ring: readonly Point[], segs: ReadonlyArray<readonly [Point, Point]>, tol: number): number {
  const lines = new Map<string, Array<[number, number]>>();
  for (const [a1, a2] of polygonEdges(ring)) {
    const len = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    if (len === 0) continue;
    let ux = (a2.x - a1.x) / len;
    let uy = (a2.y - a1.y) / len;
    if (ux < 0 || (ux === 0 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }
    const t = (q: Point): number => q.x * ux + q.y * uy;
    const key = `${fmt2(ux)},${fmt2(uy)},${Math.round(a1.y * ux - a1.x * uy)}`;
    for (const [b1, b2] of segs) {
      if (collinearOverlapLength(a1, a2, b1, b2, tol) <= 0) continue;
      const lo = Math.max(Math.min(t(a1), t(a2)), Math.min(t(b1), t(b2)));
      const hi = Math.min(Math.max(t(a1), t(a2)), Math.max(t(b1), t(b2)));
      if (hi <= lo) continue;
      const list = lines.get(key) ?? [];
      list.push([lo, hi]);
      lines.set(key, list);
    }
  }
  let best = 0;
  for (const list of lines.values()) {
    list.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let [lo, hi] = list[0]!;
    for (const [a, b] of list.slice(1)) {
      if (a <= hi + 1e-6) hi = Math.max(hi, b);
      else {
        best = Math.max(best, hi - lo);
        [lo, hi] = [a, b];
      }
    }
    best = Math.max(best, hi - lo);
  }
  return best;
}

/** The longest single run (mm) of boundary two room floors share, on centrelines. */
function sharedEdgeMm(a: RoomBox, b: RoomBox, tol: number): number {
  if (!roomsAdjacent(a, b, tol)) return 0;
  return longestRunMm(roomRing(a), polygonEdges(roomRing(b)), tol);
}

/** The longest single run (mm) of the room's ring along a straight exterior wall's centreline. */
function exteriorRunMm(box: RoomBox, segs: readonly WallSegment[], tol: number): number {
  const ext = segs.filter((s) => s.category === "exterior" && !s.arc).map((s) => [s.a, s.b] as const);
  return ext.length === 0 ? 0 : longestRunMm(roomRing(box), ext, tol);
}

/** The connector joining rooms `a` and `b`, if one already does. */
function connectorBetween(edges: readonly AccessEdge[], a: string, b: string): string | undefined {
  return edges.find(
    (e) => joins(e) && ((e.between[0] === a && e.between[1] === b) || (e.between[0] === b && e.between[1] === a)),
  )?.doorId;
}

/**
 * Door hops from the given sources (`[room, hops]`), never entering a node `avoid` names and
 * never walking THROUGH {@link EXTERIOR_NODE}: the ways in are the sources themselves (a room
 * with a door to the ground is 1, so is a room a shaft lands in), and the one exterior node
 * every door to the outside shares, balcony doors included, must not join two rooms.
 */
function hops(
  g: Digraph<string, AccessEdge>,
  sources: ReadonlyArray<readonly [string, number]>,
  avoid?: (id: string) => boolean,
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, d] of [...sources].sort((x, y) => x[1] - y[1])) {
    if (id === EXTERIOR_NODE || avoid?.(id) || dist.has(id)) continue;
    dist.set(id, d);
    queue.push(id);
  }
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    const d = dist.get(n)!;
    for (const { to } of g.out(n)) {
      if (to === EXTERIOR_NODE || dist.has(to) || avoid?.(to)) continue;
      dist.set(to, d + 1);
      queue.push(to);
    }
  }
  return dist;
}

/** What the three rules read about one storey, computed once per rule run. */
interface Facts {
  g: Digraph<string, AccessEdge>;
  /** Joining access edges (not ambiguous, both ends named). */
  edges: AccessEdge[];
  arrivals: string[];
  /** Rooms a connector to the ground opens into (a balcony door is not one), in edge order. */
  ground: Array<{ room: string; doorId: string; kind: AccessEdge["kind"] }>;
  /** The ways in, each at depth 1: the ground rooms the walk keeps (`LintContext.walkWays`,
   *  PS0.10), then the shaft arrivals. */
  sources: Array<readonly [string, number]>;
  /** Is there a way in (a door to the ground, or a shaft from a reachable storey)? */
  wayIn: boolean;
  uses: Map<string, Set<UseKind>>;
  priv: Map<string, PrivateKind>;
  byId: Map<string, RRoom>;
  depth: Map<string, number>;
  /** Hops from the way in avoiding EVERY private room. */
  depthNoPrivate: Map<string, number>;
}

/**
 * {@link factsOf} for a rule that reads every room's use, declaring each room with none to the
 * coverage report (PS2.13): none of the three rules can tell whether such a room is private.
 */
function classifiedFactsOf(ctx: LintContext): Facts {
  const f = factsOf(ctx);
  for (const r of ctx.rooms) if (f.uses.get(r.id)!.size === 0) ctx.skip("no-uses", r);
  return f;
}

/**
 * The fixture families that place a kitchen inside a room that is also the living room: the
 * sink, the hob, the oven, the fridge, the worktop, the island and the dishwasher, by their
 * canonical names in the fixture family table (an alias such as `hob` or `worktop` resolves to
 * its family). Each is a kitchen-only piece. The microwave is left out: it is a portable
 * appliance that may stand on any shelf or sideboard, so it does not mark where the kitchen is.
 */
const KITCHEN_FAMILIES: ReadonlySet<string> = new Set([
  "kitchen_sink",
  "stove",
  "oven",
  "fridge",
  "counter",
  "island",
  "dishwasher",
]);

/** Do the segments `ab` and `cd` cross at a point inside both? (Touching is measured, as 0.) */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Distance (mm) from the polyline `path` to the axis-aligned rectangle `r`, 0 when they meet.
 * Exact for a convex rectangle: a crossing or a path point inside is 0, otherwise the nearest
 * pair is an endpoint of one side against a segment of the other.
 */
function pathToRectMm(path: readonly Point[], r: { x: number; y: number; w: number; h: number }): number {
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  const inside = (p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (path.some(inside)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 4; i++) {
    const c = corners[i]!;
    const d = corners[(i + 1) % 4]!;
    for (const a of path) best = Math.min(best, distPointToSegment(a, c, d));
    for (let k = 0; k + 1 < path.length; k++) {
      const a = path[k]!;
      const b = path[k + 1]!;
      if (segmentsCross(a, b, c, d)) return 0;
      best = Math.min(best, distPointToSegment(c, a, b));
    }
  }
  return best;
}

/**
 * How near the kitchen of `to` (a room that is a kitchen and also the living room) stands to
 * the connector `doorId`: the distance, rounded to whole mm ({@link fmt0}, the value the
 * message prints, so the threshold is tested on it), from the doorway's face on `to`'s side
 * ({@link connectorFacePath}: jamb, centre, jamb) to the nearest {@link KITCHEN_FAMILIES}
 * footprint whose centre is on `to`'s floor ({@link pointInRoomBox}, shape-aware), and that
 * piece's category as written. `null` when `to` holds no such piece: the kitchen cannot be
 * located.
 *
 * The side is the face whose clear span covers more of `to` ({@link connectorFaces}, from the
 * shape). A connector with no host, or whose faces do not read `to`, is measured from its
 * centre point.
 */
function kitchenNearDoor(ctx: LintContext, doorId: string, to: RRoom): { mm: number; category: string } | null {
  const box = ctx.roomRects.get(to.id)!;
  const pieces = ctx.furniture.filter((p) => {
    if (!KITCHEN_FAMILIES.has(canonicalFixture(p.category) ?? "")) return false;
    const r = rectOf(p);
    return pointInRoomBox({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, box);
  });
  if (pieces.length === 0) return null;
  const c = ctx.connectors.find((x) => x.id === doorId);
  if (!c) return null;
  let path: Point[] = [c.at];
  if (c.host) {
    const faces = connectorFaces(c, ctx.roomRects);
    const covers = (i: 0 | 1): number => faces?.[i].cover.find((x) => x.id === to.id)?.mm ?? 0;
    const minus = covers(0);
    const plus = covers(1);
    if (minus > 0 || plus > 0) path = connectorFacePath({ ...c, host: c.host }, plus > minus ? "plus" : "minus");
  }
  let best: { mm: number; category: string } | null = null;
  for (const p of pieces) {
    const d = pathToRectMm(path, rectOf(p));
    if (!best || d < best.mm) best = { mm: d, category: p.category };
  }
  return best && { mm: Number(fmt0(best.mm)), category: best.category };
}

function factsOf(ctx: LintContext): Facts {
  const { rooms, roomRects, building, access } = ctx;
  const all = access().edges;
  const g = accessDigraph(
    rooms.map((r) => r.id),
    all,
  );
  const edges = all.filter(joins);
  const arrivals = building.arrivalRooms.filter((id) => roomRects.has(id));
  const uses = new Map<string, Set<UseKind>>(rooms.map((r) => [r.id, roomUses(r)]));
  const priv = new Map<string, PrivateKind>();
  for (const r of rooms) {
    const k = privateKind(uses.get(r.id)!);
    if (k) priv.set(r.id, k);
  }
  // The storey's ways in, classified once for every rule that reads them
  // (`src/analyze/entrance.ts`): a door onto an `outdoor balcony` is not a way in from the ground.
  const ground: Facts["ground"] = entranceWays(access(), entranceInputs(ctx.ir, roomRects))
    .filter((w) => roomRects.has(w.room) && !w.balcony)
    .map((w) => ({ room: w.room, doorId: w.doorId, kind: w.kind }));
  // A route is judged from the main entrance (PS0.10): another door from outside is a way in only
  // into a room the main entrance does not reach without going outside, so a garden door cannot
  // hide a route through a bedroom. Every way in, when the storey names no main entrance.
  const keep = ctx.walkWays();
  const sources = [
    ...ground.filter((w) => keep === null || keep.has(w.doorId)).map((w) => [w.room, 1] as const),
    ...arrivals.map((id) => [id, 1] as const),
  ];
  return {
    g,
    edges,
    arrivals,
    ground,
    sources,
    wayIn: sources.length > 0,
    uses,
    priv,
    byId: new Map(rooms.map((r) => [r.id, r])),
    depth: hops(g, sources),
    depthNoPrivate: hops(g, sources, (id) => priv.has(id)),
  };
}

/**
 * For every room that removing one private room P cuts off from the way in, the private
 * rooms that do so, in order of their depth. P is a bedroom, bath or WC that is reached and
 * has two or more ways out, a door to the ground and a shaft landing in it counting one each
 * (a room with one way out cuts nothing off).
 */
function privateDominators(ctx: LintContext, f: Facts): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!f.wayIn) return out;
  const order = new Map(ctx.rooms.map((r, i) => [r.id, i]));
  const ps = ctx.rooms
    .filter((r) => f.priv.has(r.id) && f.depth.has(r.id))
    .filter((r) => {
      const inside = new Set(f.g.out(r.id).map((x) => x.to));
      inside.delete(EXTERIOR_NODE);
      const ground = f.ground.some((w) => w.room === r.id) ? 1 : 0;
      return inside.size + ground + (f.arrivals.includes(r.id) ? 1 : 0) >= 2;
    })
    .sort((a, b) => f.depth.get(a.id)! - f.depth.get(b.id)! || order.get(a.id)! - order.get(b.id)!);
  for (const p of ps) {
    const without = hops(f.g, f.sources, (id) => id === p.id);
    for (const r of ctx.rooms) {
      // A room with a door of its own to the ground is never cut off: that door is a way in.
      if (r.id === p.id || !f.depth.has(r.id) || without.has(r.id) || f.ground.some((w) => w.room === r.id)) continue;
      const list = out.get(r.id) ?? [];
      list.push(p.id);
      out.set(r.id, list);
    }
  }
  return out;
}

/** A room as a message names it: its quoted label, or the phrase its plan gives it (PS2.29). */
const quoted = (ctx: LintContext, r: RRoom, noun?: string): string =>
  noun === undefined ? ctx.nameOf(r) : ctx.nameAs(r, noun);
/** Does this name already say the noun? An unlabelled room's phrase does ("the bedroom"), a quoted
 *  label does not, so only the label wants ", a bedroom" after it. */
const saysNoun = (name: string, noun: string): boolean => !name.startsWith('"') && name.includes(noun);
/** A room as a HINT names it: its quoted label, or its quoted id when it has none, which is the
 *  handle an agent edits by (a message uses {@link quoted}). */
const hq = (ctx: LintContext, r: RRoom): string => `"${ctx.labelOf(r)}"`;
/** {@link quoted} at the start of a sentence. */
const quotedStart = (ctx: LintContext, r: RRoom): string => capFirst(ctx.nameOf(r));

/** `"A"`, `"A" then "B"`, `"A", then "B", then "C"`. */
function chain(names: readonly string[]): string {
  const shown = shorten(names, (n) => `${n} more private rooms`);
  return shown.length <= 2 ? shown.join(" then ") : shown.join(", then ");
}

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"`. */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** At most four items: past four, the first two, a count of the rest but one, and the last. */
function shorten(items: readonly string[], rest: (n: number) => string): string[] {
  if (items.length <= 4) return [...items];
  return [items[0]!, items[1]!, rest(items.length - 3), items[items.length - 1]!];
}

/**
 * `W_ROOM_VIA_PRIVATE` (plan-soundness PS2.5): remove one bedroom, bathroom or WC P from the
 * access graph, and a room that can no longer be reached from the way in is reached only
 * through P. One warning per such room, naming every private room on its only route and its
 * access depth.
 *
 * The question is one room at a time: a room every route to which crosses SOME private room,
 * but no single one (Living reached through Bedroom 1 OR Bedroom 2), is not reported. That is
 * a known limit of the single-removal test, not a judgement that the plan is sound.
 *
 * The ways in are the doors to the ground and the shaft arrivals; a door onto an `outdoor
 * balcony` is not one, so it cannot hide a route through a bedroom. When the front door itself
 * opens into the private room, `W_ENTRANCE_INTO_PRIVATE` reports that one fault and the rooms
 * behind it are not reported again. On a plan that reads as non-residential that rule declines
 * (PS2.18), so the rooms behind such a door are reported here instead.
 *
 * Not reported, because the room legitimately belongs behind P: a bath or WC (an en-suite, or
 * a WC compartment behind a bathroom) and a storage room (a wardrobe or dressing room).
 * Balconies and other `outdoor` surfaces are not rooms, so they are never cut off. A wet room `W_BATH_VIA_BEDROOM` already reports (the storey's only
 * bathroom, behind a bedroom) is not reported again. Rooms with no classified use are skipped
 * and declared to the coverage report (PS2.13).
 */
export const roomViaPrivate: LintRule = {
  name: "room-via-private",
  family: "privacy",
  layer: "validity",
  codes: ["W_ROOM_VIA_PRIVATE"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const f = classifiedFactsOf(ctx);
    if (!f.wayIn) {
      // No way in, so no room is "reached only through" anything. When the storey does have
      // a door to the outside but every one opens onto a balcony or terrace, this rule does not
      // count it as a way in while the access graph and the walk do: say that, not "no entrance".
      if (ctx.rooms.length > 0)
        ctx.skip(f.edges.some((e) => e.between.includes(EXTERIOR_NODE)) ? "balcony-only-entrance" : "no-entrance");
      return out;
    }
    // PS0.10: with no main entrance named, routes are judged from every door to the ground.
    if (ctx.mainEntrance()?.door === null) ctx.skip("no-main-entrance");
    const doms = privateDominators(ctx, f);
    if (doms.size === 0) return out;
    // W_BATH_VIA_BEDROOM's own question, asked exactly as `reachability.ts` asks it.
    const reachAll = reachFrom(f.g, { extraSources: f.arrivals });
    const reachNoBed = reachFrom(f.g, {
      extraSources: f.arrivals,
      avoid: (id) => {
        const r = f.byId.get(id);
        return r ? isBedroom(r) : false;
      },
    });
    const viaBedroom = wetRoomsOnlyViaBedroom(ctx.rooms, reachAll, reachNoBed);
    // One fault, one warning: behind a front door into a private room, W_ENTRANCE_INTO_PRIVATE,
    // but only where that rule judges (PS2.18); on a non-residential plan these rooms report here.
    const entered = new Set(judgesAsDwelling(ctx) ? privateEntrances(ctx, f).map((w) => w.room.id) : []);
    const order = new Map(ctx.rooms.map((r, i) => [r.id, i]));
    for (const d of ctx.rooms) {
      const ps = doms.get(d.id)?.filter((p) => !entered.has(p));
      if (!ps || ps.length === 0) continue;
      const uses = f.uses.get(d.id)!;
      if (uses.size === 0) continue; // unclassified: skipped (PS2.13)
      const kind = f.priv.get(d.id);
      if (kind === "bath" || kind === "wc") continue; // an en-suite or a WC compartment
      if ([...uses].every((u) => u === "storage")) continue; // a wardrobe or dressing room
      if (viaBedroom.has(d.id)) continue;
      const depth = f.depth.get(d.id)!;
      const names = ps.map((p) => quoted(ctx, f.byId.get(p)!));
      const kinds = [...new Set(ps.map((p) => NOUN[f.priv.get(p)!]))];
      const message =
        `${quotedStart(ctx, d)} is reached only through ${chain(names)} (access depth ${depth}). ` +
        `A route through a ${kinds.join(" or ")} takes away that room's privacy (Ching's pass-through rule, ` +
        "Alexander pattern 131; ResPlan: about 0.03 % of 16,317 dwellings reach a room this way).";
      out.push({
        severity: "warning",
        code: "W_ROOM_VIA_PRIVATE",
        ...ctx.at(d),
        message,
        hints: viaPrivateHints(ctx, f, d, ps, order),
      });
    }
    return out;
  },
};

function viaPrivateHints(
  ctx: LintContext,
  f: Facts,
  d: RRoom,
  ps: readonly string[],
  order: ReadonlyMap<string, number>,
): string[] {
  const hints: string[] = [];
  const tol = ctx.rules.tolMm;
  const dBox = ctx.roomRects.get(d.id)!;
  const floor = doorFloorMm(f.uses.get(d.id)!);
  // A room reached without passing any private room, with a public use, sharing an edge
  // long enough for a door of the floor width and its nibs.
  const cands: Array<{ r: RRoom; shared: number; depth: number }> = [];
  for (const h of ctx.rooms) {
    if (h.id === d.id || !f.depthNoPrivate.has(h.id) || !hasAny(f.uses.get(h.id)!, PUBLIC_USES)) continue;
    const shared = sharedEdgeMm(ctx.roomRects.get(h.id)!, dBox, tol);
    if (shared < floor + NIBS_MM) continue;
    cands.push({ r: h, shared, depth: f.depthNoPrivate.get(h.id)! + 1 });
  }
  cands.sort((a, b) => a.depth - b.depth || b.shared - a.shared || order.get(a.r.id)! - order.get(b.r.id)!);
  for (const c of cands.slice(0, 3)) {
    hints.push(
      `${hq(ctx, c.r)} (${c.r.id}) shares a straight ${mm(c.shared)} mm of edge with ${hq(ctx, d)} (${d.id}), on ` +
        `centrelines: a door at least ${floor} mm wide there, with 100 mm of wall left at each jamb, reaches it at depth ` +
        `${c.depth} without passing a bedroom, bathroom or WC.`,
    );
  }
  let outside = false;
  if (!f.priv.has(d.id)) {
    const run = exteriorRunMm(dBox, ctx.wallSegs, tol);
    outside = run >= FRONT_DOOR_MM + NIBS_MM;
    if (outside)
      hints.push(
        `${hq(ctx, d)} (${d.id}) has a straight run of ${mm(run)} mm of exterior wall, on centrelines: a door from ` +
          `outside at least ${FRONT_DOOR_MM} mm wide there, with 100 mm of wall left at each jamb, reaches it at depth 1.`,
      );
  }
  if (cands.length === 0 && !outside)
    hints.push(
      `No room reached without a bedroom, bathroom or WC shares a door-wide edge with ${hq(ctx, d)} (${d.id}), ` +
        `${f.priv.has(d.id) ? "so no new door between rooms" : "and it has no exterior wall for a door, so no single new door"} can fix this: move partitions so a hall or corridor at least ${CORRIDOR_MM} mm clear runs ` +
        "to it, keeping every room at least the size its use needs (do not shrink or delete a room to silence this).",
    );
  hints.push(
    `Accept if the route through ${shorten(ps, (n) => `${n} more`).join(" and ")} is deliberate: a room that ` +
      "belongs to that room's own suite (a dressing room, nursery or study off a main bedroom), or a railroad flat. " +
      "The warning is advisory.",
  );
  return hints;
}

/**
 * `W_WET_ROOM_DOOR` (plan-soundness PS2.6): a bathroom or WC whose door is in the wrong place
 * or missing. One code, three sub-cases, each with its own message:
 *
 *  1. its only connector is a leaf-less `opening` onto a habitable room (living, dining,
 *     kitchen, bedroom, office), so it cannot be closed;
 *  2. a connector joins it straight to a kitchen or dining room with no lobby between
 *     (GB 50096-2011 5.4.3, cited as advice, not compliance). A room that is a kitchen and also
 *     the living room (an open-plan kitchen/living, with or without dining) counts only where
 *     the door opens onto its kitchen: a sink, hob, oven, fridge, worktop, island or dishwasher
 *     on its floor nearer the doorway's face than `wetDoorKitchenProximityMm`, compared in
 *     whole mm ({@link kitchenNearDoor}; a microwave does not locate the kitchen). Such a room
 *     with no kitchen fixture at all cannot be located, so it is declared to the coverage
 *     report (`no-kitchen-fixtures`) and not warned. A kitchen alone, a dining room alone and a
 *     kitchen that is also the dining room (no living use) always count. A living room with no
 *     kitchen use, and a dining room that is also the living room, are exempt: a bath opening
 *     off the living space is graded by the taste layer, never warned;
 *  3. two or more connectors join it to two different rooms outside a private suite (not a
 *     bedroom, bath, WC or storage room), so it is a passage between them. When one of those
 *     rooms is reached ONLY through the wet room, `W_ROOM_VIA_PRIVATE` already reports it and
 *     this sub-case stays silent.
 *
 * Rooms with no classified use are skipped and declared to the coverage report (PS2.13).
 *
 * On a plan that reads as non-residential ({@link judgesAsDwelling}, PS2.18) only sub-case 2's
 * kitchen arm judges: a WC opening onto a room where food is handled is a fault in a café as in
 * a home, while a WC off a café's seating, a wash area with no leaf and a WC between two rooms
 * are what a dwelling forbids. The others decline, declared once as `non-dwelling`.
 */
export const wetRoomDoor: LintRule = {
  name: "wet-room-door",
  family: "privacy",
  layer: "validity",
  codes: ["W_WET_ROOM_DOOR"],
  readsFurniture: "wet-door",
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const f = classifiedFactsOf(ctx);
    const wets = ctx.rooms.filter((r) => {
      const k = f.priv.get(r.id);
      return k === "bath" || k === "wc";
    });
    if (wets.length === 0) return out;
    if (f.wayIn && ctx.mainEntrance()?.door === null) ctx.skip("no-main-entrance");
    // PS2.18: on a plan that reads as non-residential only the kitchen arm judges.
    const home = judgesAsDwelling(ctx);
    if (!home) ctx.skip("non-dwelling");
    const edges = f.edges;
    const doms = privateDominators(ctx, f);
    const tol = ctx.rules.tolMm;
    const order = new Map(ctx.rooms.map((r, i) => [r.id, i]));
    for (const w of wets) {
      const noun = NOUN[f.priv.get(w.id)!];
      const mine = edges.filter((e) => e.between[0] === w.id || e.between[1] === w.id);
      const far = (e: AccessEdge): string => (e.between[0] === w.id ? e.between[1] : e.between[0]);
      const room = (id: string): RRoom | undefined => f.byId.get(id);
      const wBox = ctx.roomRects.get(w.id)!;
      const reported = new Set<string>();

      // 1. The only connector is a leaf-less opening onto a habitable room.
      const only = mine.length === 1 ? mine[0]! : undefined;
      const onlyTo = only ? room(far(only)) : undefined;
      if (home && only && only.kind === "opening" && onlyTo && hasAny(f.uses.get(onlyTo.id)!, HABITABLE_USES)) {
        reported.add(only.doorId);
        const clause = openingClauseById(ctx.ir.elements, only.doorId);
        const hints = [
          clause
            ? `Hang a leaf in it: remove ${clause} from \`walls from rooms\` and put a \`door\` on that partition, at least 700 mm wide.`
            : `Hang a leaf in it: write \`door\` in place of \`opening\` for ${only.doorId}, at the same position, at least 700 mm wide.`,
          ...movesOnto(ctx, f, w, wBox, new Set([onlyTo.id]), order, tol, clause ?? only.doorId),
          f.priv.get(onlyTo.id) === "bedroom"
            ? `Accept if an open en-suite inside the bedroom suite of ${onlyTo.id} is the design intent. The warning is advisory.`
            : "Accept if an open wash area is the design intent and it is screened from view. The warning is advisory.",
        ];
        out.push({
          severity: "warning",
          code: "W_WET_ROOM_DOOR",
          ...ctx.at(w),
          message:
            `${quotedStart(ctx, w)} has no door: its only way in is a leaf-less opening ${mm(only.nominalWidth)} mm wide from ` +
            `${quoted(ctx, onlyTo)}. A ${noun} that cannot be closed gives no privacy and lets steam and odour into a ` +
            "habitable room (GB 50096-2011 Table 5.8.7 gives a bath or WC a door of at least 700 mm, cited as advice).",
          hints,
        });
      }

      // 2. A connector straight onto a kitchen or a dining room. A room that is also the
      // living room counts only as a kitchen, and then only where a kitchen fixture stands near
      // the doorway; a kitchen that is also the dining room (no living) always counts.
      for (const e of mine) {
        if (reported.has(e.doorId)) continue;
        const to = room(far(e));
        if (!to) continue;
        const u = f.uses.get(to.id)!;
        if (!(u.has("kitchen") || u.has("dining"))) continue;
        if (u.has("living") && !u.has("kitchen")) continue;
        // A dining room alone is a dwelling's arm; a kitchen is food handling in any building.
        if (!home && !u.has("kitchen")) continue;
        if (f.priv.has(to.id)) continue;
        let near: { mm: number; category: string } | null = null;
        if (u.has("kitchen") && u.has("living")) {
          near = kitchenNearDoor(ctx, e.doorId, to);
          if (!near) {
            ctx.skip("no-kitchen-fixtures", to);
            continue;
          }
          if (near.mm >= ctx.rules.wetDoorKitchenProximityMm) continue;
        }
        reported.add(e.doorId);
        const what = u.has("kitchen") ? "a kitchen" : "a dining room";
        // A room named by its use already says what it is; a label needs ", a kitchen" after it.
        const useWord = u.has("kitchen") ? "kitchen" : "dining room";
        const toName = quoted(ctx, to, useWord);
        const moves = movesOnto(ctx, f, w, wBox, new Set([to.id]), order, tol, e.doorId);
        const way = `${e.kind === "door" ? "a door" : "an opening"} ${mm(e.nominalWidth)} mm wide`;
        out.push({
          severity: "warning",
          code: "W_WET_ROOM_DOOR",
          ...ctx.at(w),
          message:
            (near
              ? `${quotedStart(ctx, w)} opens straight into ${
                  saysNoun(toName, "kitchen") ? toName : `the kitchen of ${toName}`
                } through ${way}, ` + `${mm(near.mm)} mm from its ${near.category}. `
              : `${quotedStart(ctx, w)} opens straight into ${toName}${
                  saysNoun(toName, useWord) ? "" : `, ${what}`
                }, through ${way}. `) +
            `A ${noun} door should not open directly onto a kitchen or dining room without a lobby ` +
            "(GB 50096-2011 5.4.3, cited as advice, not compliance; ResPlan: about 0.3 % of bath doors open off a kitchen).",
          hints: [
            ...moves,
            ...(near
              ? [
                  `Keep the kitchen of ${hq(ctx, to)} (${to.id}) at least ${mm(ctx.rules.wetDoorKitchenProximityMm)} mm ` +
                    `from ${openingClauseById(ctx.ir.elements, e.doorId) ? `the opening ${openingClauseById(ctx.ir.elements, e.doorId)} derives` : e.doorId}, measured from the doorway's face: its ${near.category} is ${mm(near.mm)} mm away.`,
                ]
              : []),
            ...(moves.length === 0
              ? [
                  `No hall or corridor shares a door-wide edge with ${hq(ctx, w)} (${w.id}): a lobby at least ` +
                    `${CORRIDOR_MM} mm clear between ${hq(ctx, to)} (${to.id}) and it keeps the door off the ${what.slice(2)}.`,
                ]
              : []),
            `Accept if the plan follows a code that allows it, or ${hq(ctx, to)} is the only room the ${noun} can ` +
              "open from. The warning is advisory.",
          ],
        });
      }

      // 3. A passage: two or more connectors joining two different rooms outside a private suite.
      if (!home || mine.length < 2) continue;
      const farRooms: RRoom[] = [];
      const doorTo = new Map<string, string>();
      for (const e of mine) {
        const to = room(far(e));
        if (!to || doorTo.has(to.id)) continue;
        const u = f.uses.get(to.id)!;
        if (u.size === 0 || hasAny(u, SUITE_USES)) continue;
        doorTo.set(to.id, e.doorId);
        farRooms.push(to);
      }
      if (farRooms.length < 2) continue;
      if (farRooms.some((r) => doms.get(r.id)?.includes(w.id))) continue; // W_ROOM_VIA_PRIVATE's
      const names = farRooms.map((r) => quoted(ctx, r));
      // Every room the connectors join, by label, whether or not it counts toward the passage.
      const joined: string[] = [];
      for (const e of mine) {
        const to = room(far(e));
        const name = to ? quoted(ctx, to) : "outside";
        if (!joined.includes(name)) joined.push(name);
      }
      // The far room nearest the way in stays; each other one is offered a door from a room
      // it is reached from without the wet room, sharing a door-wide edge with it. A room that
      // already has its own door to such a room needs only the wet room's door taken away.
      const without = hops(f.g, f.sources, (id) => id === w.id);
      const hop = (id: string): number => without.get(id) ?? Number.MAX_SAFE_INTEGER;
      const near = [...farRooms].sort((a, b) => hop(a.id) - hop(b.id) || order.get(a.id)! - order.get(b.id)!);
      const hints: string[] = [];
      for (const b of near.slice(1)) {
        if (hints.length >= 2) break;
        const direct = ctx.rooms.find(
          (h) =>
            h.id !== w.id && h.id !== b.id && without.has(h.id) && connectorBetween(edges, h.id, b.id) !== undefined,
        );
        if (direct) {
          hints.push(
            `${hq(ctx, b)} (${b.id}) already opens onto ${hq(ctx, direct)} (${direct.id}) through ` +
              `${connectorBetween(edges, direct.id, b.id)}: remove ${doorTo.get(b.id)}, and the ${noun} is no longer on the way.`,
          );
          continue;
        }
        const floor = doorFloorMm(f.uses.get(b.id)!);
        const bBox = ctx.roomRects.get(b.id)!;
        const cands: Array<{ r: RRoom; shared: number }> = [];
        for (const h of ctx.rooms) {
          if (h.id === w.id || h.id === b.id || !without.has(h.id) || f.priv.has(h.id)) continue;
          const u = f.uses.get(h.id)!;
          if (u.size === 0 || hasAny(u, SUITE_USES)) continue;
          const shared = sharedEdgeMm(ctx.roomRects.get(h.id)!, bBox, tol);
          if (shared >= floor + NIBS_MM) cands.push({ r: h, shared });
        }
        const isFar = (r: RRoom): number => (farRooms.includes(r) ? 0 : 1);
        cands.sort(
          (x, y) =>
            isFar(x.r) - isFar(y.r) ||
            hop(x.r.id) - hop(y.r.id) ||
            y.shared - x.shared ||
            order.get(x.r.id)! - order.get(y.r.id)!,
        );
        const c = cands[0];
        if (!c) continue;
        hints.push(
          `${hq(ctx, c.r)} (${c.r.id}) shares a straight ${mm(c.shared)} mm of edge with ${hq(ctx, b)} (${b.id}), ` +
            `on centrelines: re-host ${doorTo.get(b.id)} onto it, at least ${floor} mm wide with 100 mm of wall left at ` +
            `each jamb, so ${hq(ctx, b)} is reached without crossing the ${noun}.`,
        );
      }
      if (hints.length === 0)
        hints.push(
          `No room reached without the ${noun} shares a door-wide edge with ${near
            .slice(1)
            .map((r) => hq(ctx, r))
            .join(" or ")}: a hall or ` +
            `corridor at least ${CORRIDOR_MM} mm clear between ${farRooms.map((r) => hq(ctx, r)).join(" and ")} takes the route out of the ${noun}.`,
        );
      hints.push(
        `Accept if ${w.id} is a utility or mud room meant to be walked through, with the ${noun} closed off by a door of its own. The warning is advisory.`,
      );
      out.push({
        severity: "warning",
        code: "W_WET_ROOM_DOOR",
        ...ctx.at(w),
        message:
          `${quotedStart(ctx, w)} is a passage: its ${mine.length} connectors join ${listed(joined)}, so the way between ` +
          `${listed(names)} runs through a ${noun}. A ${noun} should be a dead end off circulation, not a route between rooms ` +
          "(Ching's pass-through rule; privacy and hygiene).",
        hints,
      });
    }
    return out;
  },
};

/**
 * Options taking a wet room's connector off a room: when the wet room already opens onto a hall
 * or corridor, remove the connector; otherwise re-host it onto a hall or corridor it shares a
 * door-wide straight edge with (700 mm plus 100 mm of wall at each jamb).
 */
function movesOnto(
  ctx: LintContext,
  f: Facts,
  w: RRoom,
  wBox: RoomBox,
  except: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
  tol: number,
  connectorId: string,
): string[] {
  const cands: Array<{ r: RRoom; shared: number }> = [];
  for (const h of ctx.rooms) {
    if (h.id === w.id || except.has(h.id) || !hasAny(f.uses.get(h.id)!, CIRCULATION_USES)) continue;
    const existing = connectorBetween(f.edges, h.id, w.id);
    if (existing !== undefined)
      return [
        `${hq(ctx, w)} (${w.id}) already opens onto ${hq(ctx, h)} (${h.id}) through ${existing}: remove ` +
          `${connectorId}.`,
      ];
    const shared = sharedEdgeMm(ctx.roomRects.get(h.id)!, wBox, tol);
    if (shared >= 700 + NIBS_MM) cands.push({ r: h, shared });
  }
  cands.sort((a, b) => b.shared - a.shared || order.get(a.r.id)! - order.get(b.r.id)!);
  return cands
    .slice(0, 2)
    .map(
      (c) =>
        `${hq(ctx, c.r)} (${c.r.id}) shares a straight ${mm(c.shared)} mm of edge with ${hq(ctx, w)} (${w.id}), ` +
        `on centrelines: re-host ${connectorId} onto it as a door at least 700 mm wide, with 100 mm of wall left at each jamb.`,
    );
}

/**
 * The doors `W_ENTRANCE_INTO_PRIVATE` reports, with the private room each opens into: every
 * connector to the ground (not a balcony door) opens into a private room, the storey is not
 * reached by a shaft, and it has a classified room that is not private. Empty otherwise.
 */
function privateEntrances(ctx: LintContext, f: Facts): Array<{ door: RDoor; room: RRoom }> {
  if (ctx.building.arrivalRooms.length > 0) return [];
  if (f.ground.length === 0 || f.ground.some((w) => !f.priv.has(w.room))) return [];
  // A storey of private rooms alone (a bedroom drawn by itself) is a fragment of a dwelling,
  // not one: its "outside" stands for the rest of the flat, and there is no room to move the
  // front door to.
  if (!ctx.rooms.some((r) => f.uses.get(r.id)!.size > 0 && !f.priv.has(r.id))) return [];
  const doors = new Map<string, RDoor>(ctx.doors.map((d) => [d.id, d]));
  const out: Array<{ door: RDoor; room: RRoom }> = [];
  for (const w of f.ground) {
    const door = doors.get(w.doorId);
    const room = f.byId.get(w.room);
    if (w.kind === "door" && door && room) out.push({ door, room });
  }
  return out;
}

/**
 * `W_ENTRANCE_INTO_PRIVATE` (plan-soundness PS2.7): every door from outside on the storey
 * opens into a bedroom, bathroom or WC (ResPlan: 0 of 16,317 front doors do). One warning per
 * such door.
 *
 * Only a storey's real ways in count: a door onto an `outdoor balcony` is not one, and a storey
 * reached by a shaft (it has no front door of its own) is not checked. When any connector from
 * outside lands in a room that is not private (a hall, living space, kitchen, or a room with
 * no classified use), the plan has a front door elsewhere and a private room's door to the
 * outside (a bedroom's garden door) is not reported. Kitchen entry is NOT reported: whether a
 * front door may open into a kitchen is culture-dependent, so a profile may add it later.
 * A storey whose classified rooms are all private (a bedroom drawn alone, a fragment of a
 * dwelling whose "outside" is the rest of the flat) is not reported either. The rooms behind
 * such an entrance are not also reported by `W_ROOM_VIA_PRIVATE`: one fault, one warning.
 * Rooms with no classified use are skipped and declared to the coverage report (PS2.13).
 * A plan that reads as non-residential ({@link judgesAsDwelling}, PS2.18) is not judged and is
 * declared as `non-dwelling`; the rooms behind such a door are then reported by
 * `W_ROOM_VIA_PRIVATE`, so the fault still has its one warning.
 */
export const entranceIntoPrivate: LintRule = {
  name: "entrance-into-private",
  family: "privacy",
  layer: "validity",
  codes: ["W_ENTRANCE_INTO_PRIVATE"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    // PS2.18: a front door into a WC is a home's fault; a café or clinic is declared, not judged.
    if (!judgesAsDwelling(ctx)) {
      ctx.skip("non-dwelling");
      return out;
    }
    const f = classifiedFactsOf(ctx);
    const ways = privateEntrances(ctx, f);
    const tol = ctx.rules.tolMm;
    const order = new Map(ctx.rooms.map((r, i) => [r.id, i]));
    for (const { door, room } of ways) {
      const noun = NOUN[f.priv.get(room.id)!];
      // A room named by its use already says what it is ("the bedroom"); a label needs ", a bedroom".
      const there = quoted(ctx, room, noun);
      const fact = saysNoun(there, noun)
        ? ways.length === 1
          ? `The only door from outside opens into ${there}.`
          : `A door from outside opens into ${there}, and no door from outside opens into a hall, living space or kitchen.`
        : ways.length === 1
          ? `The only door from outside opens into ${there}, a ${noun}.`
          : `The door from outside into ${there} opens into a ${noun}, and no door from outside opens into a hall, living space or kitchen.`;
      // A public room with exterior wall for a front door, from which this room is still reached.
      const cands: Array<{ r: RRoom; run: number; depth: number }> = [];
      for (const h of ctx.rooms) {
        if (h.id === room.id || !hasAny(f.uses.get(h.id)!, PUBLIC_USES) || f.priv.has(h.id)) continue;
        const run = exteriorRunMm(ctx.roomRects.get(h.id)!, ctx.wallSegs, tol);
        if (run < FRONT_DOOR_MM + NIBS_MM) continue;
        const k = hops(f.g, [[h.id, 0]]).get(room.id);
        if (k === undefined) continue;
        cands.push({ r: h, run, depth: k + 1 });
      }
      cands.sort((a, b) => a.depth - b.depth || b.run - a.run || order.get(a.r.id)! - order.get(b.r.id)!);
      const hints = cands
        .slice(0, 3)
        .map(
          (c) =>
            `Move ${door.id} onto ${hq(ctx, c.r)} (${c.r.id}), which has a straight run of ${mm(c.run)} mm of ` +
            `exterior wall on centrelines, at least ${FRONT_DOOR_MM} mm wide with 100 mm of wall left at each jamb: ` +
            `${hq(ctx, room)} (${room.id}) is then at depth ${c.depth}.`,
        );
      hints.push(
        `${cands.length > 0 ? "Or put" : "Put"} an entrance hall or lobby at least ${ENTRY_LOBBY_MM} mm clear ` +
          `(GB 50096-2011 5.7.1, as advice) between ${door.id} and ${hq(ctx, room)} (${room.id}).`,
      );
      hints.push(`Accept if ${room.id} is a bedsit or cabin with no separate living space. The warning is advisory.`);
      out.push({
        severity: "warning",
        code: "W_ENTRANCE_INTO_PRIVATE",
        ...ctx.at(door),
        message:
          `${fact} A front door opens into a hall, living space or kitchen, never straight into a bedroom, bathroom ` +
          "or WC (Alexander patterns 112 and 130; ResPlan: 0 of 16,317 front doors).",
        hints,
      });
    }
    return out;
  },
};
