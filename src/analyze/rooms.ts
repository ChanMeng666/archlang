/**
 * Room geometry leaves of the analysis layer: a room's box and ring, its area, the
 * point-in-room and edge-touch tests, and the room-use predicates.
 *
 * Invariant: imports no value from `ir.ts`, `parser.ts` or `analyze.ts` (types only), so
 * the sheet and schedule modules can read these without a runtime import cycle
 * (`test/no-value-cycles.test.ts`). Pure and deterministic; charges the step meter: none.
 * `analyze.ts` re-exports everything here, so existing importers are untouched.
 */

import type { Point, UseKind } from "../ast.js";
import type { BBox } from "../geometry/rect.js";
import { overlap1d, pointInRect } from "../geometry/rect.js";
import {
  pointInPolygon,
  polygonArea,
  pointOnPolygonEdge,
  rectInsidePolygon,
  rectRing,
  ringsAdjacent,
} from "../geometry/polygon.js";
import { classifyLabelUses, namesOpenAir } from "../vocabulary.js";

/** Default mm tolerance for edge-touch / point-on-edge tests (≈ one partition wall). */
export const DEFAULT_TOL = 200;

/** Axis-aligned rectangle of a sized element. */
export function rectOf(e: { at: Point; size: { w: number; h: number } }): BBox {
  return { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h };
}

/**
 * A room's extent for the analysis layer: its bounding box, plus the floor RING when
 * the room is polygonal. Carrying the ring on the box — rather than threading a
 * second map through a dozen signatures — is what keeps a rectangular plan's behaviour
 * (and its bytes) untouched: `poly` is simply absent, and every `x/y/w/h` reader is
 * unchanged. The shape-aware helpers below (`roomsAdjacent`, `pointOnRoomEdge`,
 * `pointInRoomBox`) check `poly` first and fall back to the historical rect arithmetic.
 */
export type RoomBox = BBox & { poly?: Point[] };

/** The {@link RoomBox} of a resolved room — bbox for a rect, bbox + ring for a polygon. */
export function roomBox(r: { at: Point; size: { w: number; h: number }; poly?: Point[] }): RoomBox {
  const box: RoomBox = { x: r.at.x, y: r.at.y, w: r.size.w, h: r.size.h };
  if (r.poly) box.poly = r.poly;
  return box;
}

/** The room's floor as a ring: its polygon, or its rectangle's four corners. */
export const roomRing = (b: RoomBox): Point[] => b.poly ?? rectRing(b);

/**
 * A room's floor area in mm² — the ONE expression every area reader shares
 * (`describe().rooms[].area_m2`, the room schedule, Plan JSON, the too-small lint, the
 * drawn area label). A rectangle keeps the exact historical product; a polygon is
 * measured by the shoelace formula, which is exact (not sampled) for any simple ring; a
 * circle by πR², exact.
 */
export function roomAreaMm2(r: {
  size: { w: number; h: number };
  poly?: Point[];
  circle?: { c: Point; r: number };
}): number {
  // A CIRCLE is measured in closed form (πR²) — never from the 48-gon tessellation it
  // also carries for the grid layer, which understates the area by 0.29%. See the
  // exact-vs-chordal note in docs/analysis.md.
  if (r.circle) return Math.PI * r.circle.r * r.circle.r;
  return r.poly ? polygonArea(r.poly) : r.size.w * r.size.h;
}

/** Is the point inside the room's floor (closed bounds — the boundary counts)? */
export function pointInRoomBox(p: Point, b: RoomBox): boolean {
  return b.poly ? pointInPolygon(p.x, p.y, b.poly) : pointInRect(p.x, p.y, b);
}

/**
 * How far (mm) a fixture's footprint may hang outside the room it declares before the
 * `in <room>` reads as wrong.
 *
 * A room's outline is drawn on wall CENTRELINES, so a piece pushed against a room edge
 * legitimately shares the wall band with whatever is on the other side: 100 mm is half
 * the 200 mm shell every shipped example draws, which is the deepest such overlap an
 * honest placement produces. Well above grid-snap noise, and far below "this piece is
 * standing in the next room".
 */
export const ROOM_CONTAINMENT_SLACK_MM = 100;

/**
 * Is the footprint `fr` on the room's floor, allowing {@link ROOM_CONTAINMENT_SLACK_MM}
 * of overhang on every side? The footprint question behind `W_FIXTURE_WRONG_ROOM` — and
 * the same predicate `repair` uses to decide it has moved a piece home, so what repair
 * clears is exactly what lint flags.
 *
 * Asking about the footprint rather than the centre matters most at a CORNER: crossing
 * both the x and the y edge leaves as little as a quarter of the area inside while the
 * centre stays comfortably in, which is how a bed with three quarters of itself in three
 * other rooms used to lint clean. Furniture rotation is a quarter-turn
 * (`E_FURN_ROTATE`), so the AABB is the true footprint and no oriented-box machinery is
 * needed. A piece smaller than twice the slack shrinks to its own centre, degrading
 * gracefully to the historical point test rather than becoming impossible to place.
 */
export function rectInRoomBox(fr: BBox, b: RoomBox, slack: number = ROOM_CONTAINMENT_SLACK_MM): boolean {
  const m = Math.min(slack, fr.w / 2, fr.h / 2);
  return rectInsidePolygon({ x: fr.x + m, y: fr.y + m, w: fr.w - 2 * m, h: fr.h - 2 * m }, roomRing(b));
}

/**
 * The function(s) a room is classified as. Explicit `uses …` are authored intent
 * and win; otherwise we fall back to a conservative keyword match on the label (or
 * id). Returns a set (a studio is `living kitchen`).
 *
 * The keyword match is the shared closed vocabulary in `src/vocabulary.ts`
 * ({@link classifyLabelUses}) — the token-bounded, data-driven form of the label
 * regexes that used to live here, and the only label classifier: it emits every kind
 * it has a row for, `living` and `dining` included. Behaviour on the committed corpus
 * is pinned by `test/vocabulary-equivalence.test.ts`.
 */
export function roomUses(room: { label?: string; id: string; uses?: UseKind[] }): Set<UseKind> {
  if (room.uses && room.uses.length > 0) return new Set(room.uses);
  return new Set(classifyLabelUses(room.label ?? room.id).uses);
}

/** Does the room read as open to the sky (a terrace, a yard)? As {@link roomUses} reads: an authored
 *  `uses` wins, else its label, else its id. */
export const isOpenAir = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  !(room.uses && room.uses.length > 0) && namesOpenAir(room.label ?? room.id);

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
/** Does the room read as a garage (or a carport / parking space)? */
export const isGarage = (room: { label?: string; id: string; uses?: UseKind[] }): boolean =>
  roomUses(room).has("garage");
/** Does the room read as circulation (hall) or an entry/foyer? */
export const isCirculation = (room: { label?: string; id: string; uses?: UseKind[] }): boolean => {
  const u = roomUses(room);
  return u.has("hall") || u.has("circulation") || u.has("entry");
};

/** Do two room rectangles share an edge (touch) within tolerance? A shared corner
 *  alone does not count — the perpendicular overlap must be positive.
 *
 *  With a polygon room on either side the same question is asked of the two RINGS
 *  ({@link ringsAdjacent}): a shared boundary run of positive length, with the two
 *  edges no more than `tol` apart (a partition thickness). Two rectangles keep the
 *  closed-form test below, exactly as before. */
export function roomsAdjacent(a: RoomBox, b: RoomBox, tol: number): boolean {
  if (a.poly || b.poly) return ringsAdjacent(roomRing(a), roomRing(b), tol);
  const vTouch = Math.abs(a.x + a.w - b.x) <= tol || Math.abs(b.x + b.w - a.x) <= tol;
  if (vTouch && overlap1d(a.y, a.y + a.h, b.y, b.y + b.h) > 0) return true;
  const hTouch = Math.abs(a.y + a.h - b.y) <= tol || Math.abs(b.y + b.h - a.y) <= tol;
  if (hTouch && overlap1d(a.x, a.x + a.w, b.x, b.x + b.w) > 0) return true;
  return false;
}

/** Does point `p` lie on the perimeter of a room (within tolerance)? A polygon room
 *  is measured against its own edges; a rectangle keeps the historical test. This is
 *  what attributes a door/window to the room(s) it opens onto, so a door on a polygon
 *  room's wall connects that room exactly as it would a rectangular one. */
export function pointOnRoomEdge(p: Point, r: RoomBox, tol: number): boolean {
  if (r.poly) return pointOnPolygonEdge(p, r.poly, tol);
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
export function roomsAtPoint(p: Point, roomRects: Map<string, RoomBox>, tol: number): string[] {
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
  roomRects: Map<string, RoomBox>,
  tol: number,
): string[] {
  const touching = roomsAtPoint(d.at, roomRects, tol);
  const onExterior = d.host?.category === "exterior";
  return touching.length >= 2 ? touching.slice(0, 2) : onExterior ? ["exterior", ...touching] : touching;
}
