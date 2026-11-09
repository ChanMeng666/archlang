/**
 * Connector (door / opening / window) helpers of the analysis layer: which rooms a
 * connector joins, the wall faces it opens onto, and which room a window serves.
 *
 * Invariant: imports no value from `ir.ts`, `parser.ts` or `analyze.ts` (types only), so
 * the opening schedule can read these without a runtime import cycle
 * (`test/no-value-cycles.test.ts`). Pure and deterministic; charges the step meter: none.
 * `analyze.ts` re-exports everything here, so existing importers are untouched.
 */

import type { Point } from "../ast.js";
import { distPointToWallSegment, wallFaceProbes, type WallSegment } from "../geometry.js";
import { polygonEdges } from "../geometry/polygon.js";
import { arcLength, arcParamAt, arcPointAt } from "../geometry/arc.js";
import type { RoomBox } from "./rooms.js";
import { doorConnections, pointInRoomBox, pointOnRoomEdge, roomRing, roomsAtPoint } from "./rooms.js";

/** The synthetic graph node standing for the world outside the building. */
export const EXTERIOR_NODE = "exterior";

/**
 * Default mm subtracted from a door's *nominal* width to estimate its *clear*
 * opening (leaf thickness, stop, frame projection). A coarse advisory assumption —
 * a real clear width depends on door type and hardware, which ArchLang doesn't model
 * yet — so the access graph exposes BOTH the nominal and the estimate.
 */
export const DEFAULT_CLEAR_ALLOWANCE_MM = 60;

/**
 * What a connector with three or more rooms at its point joins. The point is on
 * several room edges, so the edge-touch test alone does not say which two rooms it
 * connects.
 *
 *  - `"probe"` asks the connector's HOST WALL: one wall thickness either side of its
 *    centreline ({@link wallFaceProbes}), which room's floor holds the probe point
 *    ({@link pointInRoomBox}, shape-aware)? A probe on no floor is the `exterior` side
 *    when the host is an exterior wall. When both faces resolve, to two different
 *    spaces, the connector joins exactly those. When either face cannot be decided —
 *    the probe lies on a room boundary (in two floors at once), or in no floor behind a
 *    non-exterior host — the edge is `ambiguous` and joins nothing. Every surface uses
 *    it: `describe().access`, Plan JSON, circulation, lint reachability,
 *    `suggestTopology` and the intent channel's `reachable`
 *    (`test/access-policy.test.ts` is the agreement law).
 *  - `"drop"` joins nothing: every such connector is `ambiguous`. The reference the
 *    probe degrades to when it cannot decide.
 *
 * A connector touching two rooms or fewer is never `ambiguous` and is answered the same
 * under either policy: by its host wall's two faces when it has a host
 * ({@link connectorConnection}), else by {@link doorConnections}.
 */
export type AmbiguityPolicy = "probe" | "drop";

/** What {@link connectorEdges} reads off a door or cased opening. `RDoor` and
 *  `ROpening` satisfy it as they are. */
export interface AccessConnector {
  id: string;
  at: Point;
  width: number;
  host: (Pick<WallSegment, "a" | "b" | "arc" | "thickness"> & { category: string; wallId: string }) | null;
  kind: "door" | "opening";
  /** A door's kind when it is not hinged ({@link RDoor.doorKind}); a `double` or
   *  `glazed_sliding` door passes through one leaf ({@link activeLeafWidth}). */
  doorKind?: string;
}

/**
 * The width a person passes through: a `double` door's one active leaf, half its width (the
 * ADA 2010 Standards 404.2.3: "for a pair of doors, at least one of the active leaves" gives the
 * clear width), or the half a `glazed_sliding` door's one moving panel leaves when it parks over
 * the fixed one, else the whole width. Read by `W_DOOR_CLEARANCE` and by every connector's clear
 * width ({@link connectorClearWidth}), so `W_PATH_TOO_NARROW` reads the leaf too.
 */
export function activeLeafWidth(d: { width: number; doorKind?: string }): number {
  return d.doorKind === "double" || d.doorKind === "glazed_sliding" ? d.width / 2 : d.width;
}

/**
 * How far (mm) a connector's jamb probes stand inside each end of its opening, along the
 * host run: `min(JAMB_PROBE_INSET_MM, width / 4)`. 50 mm is half the thinnest partition
 * the examples draw, so a partition whose FACE meets a jamb (the honest way to hang a door
 * beside a T) is not read as running into the opening, while one whose centreline is any
 * further inside is. The quarter-width cap keeps a very narrow connector's probes apart.
 */
export const JAMB_PROBE_INSET_MM = 50;

/** What one side of a connector's host wall holds, probed one wall thickness from the
 *  host's CENTRELINE ({@link wallFaceProbes}) — half a thickness past that face. Exported
 *  for `W_CONNECTOR_AMBIGUOUS`, which names the rooms on each side from this reading. */
export interface FaceReading {
  /** Rooms whose floor holds the CENTRE probe (closed bounds), in `roomRects` order. */
  holders: string[];
  /** Every room covering a positive length (mm) of the face's clear span — the path
   *  jamb probe → centre probe → jamb probe — in `roomRects` order. */
  cover: Array<{ id: string; mm: number }>;
}

/**
 * Length (mm) of the polyline `path` lying on the room's floor, from the shape: each leg
 * is cut at every crossing with the room's ring (and at the ring's vertices where an edge
 * runs along it), and each piece counts when its midpoint is on the floor
 * ({@link pointInRoomBox}, closed bounds). Exact for any simple ring; never a bounding box.
 */
function pathLengthInRoom(path: readonly Point[], box: RoomBox): number {
  const ring = roomRing(box);
  let total = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const p = path[k]!;
    const q = path[k + 1]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const cuts = [0, 1];
    for (const [u, v] of polygonEdges(ring)) {
      const ex = v.x - u.x;
      const ey = v.y - u.y;
      const wx = u.x - p.x;
      const wy = u.y - p.y;
      const den = dx * ey - dy * ex;
      if (den !== 0) {
        const t = (wx * ey - wy * ex) / den;
        const s = (wx * dy - wy * dx) / den;
        if (t > 0 && t < 1 && s >= 0 && s <= 1) cuts.push(t);
      } else if (wx * dy - wy * dx === 0) {
        // Collinear with the leg: its two ends are where the floor may start or stop.
        for (const e of [u, v]) {
          const t = ((e.x - p.x) * dx + (e.y - p.y) * dy) / len2;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const t0 = cuts[i]!;
      const t1 = cuts[i + 1]!;
      if (t1 <= t0) continue;
      const tm = (t0 + t1) / 2;
      if (pointInRoomBox({ x: p.x + dx * tm, y: p.y + dy * tm }, box)) total += (t1 - t0) * Math.sqrt(len2);
    }
  }
  return total;
}

/** The point `along` mm from `at` along the host run: on the arc itself for a curved host
 *  (clamped to its ends), along the chord direction for a straight one. */
function alongHost(host: NonNullable<AccessConnector["host"]>, at: Point, along: number): Point {
  if (host.arc) {
    const total = arcLength(host.arc);
    const t = total === 0 ? 0 : Math.min(1, Math.max(0, arcParamAt(host.arc, at) + along / total));
    return arcPointAt(host.arc, t);
  }
  const ux = host.b.x - host.a.x;
  const uy = host.b.y - host.a.y;
  const l = Math.hypot(ux, uy) || 1;
  return { x: at.x + (ux / l) * along, y: at.y + (uy / l) * along };
}

/**
 * The length (mm) of `box`'s floor along one face of a connector's host, between the run
 * offsets `from` and `to` (mm from `at`): the probe path {@link connectorFaces} measures a
 * face's `cover` over, cut to a sub-range of it. `W_CONNECTOR_AMBIGUOUS` uses it to take a
 * meeting wall's body out of a straddled room's cover.
 */
export function faceLengthInRoom(
  host: NonNullable<AccessConnector["host"]>,
  at: Point,
  from: number,
  to: number,
  side: "minus" | "plus",
  box: RoomBox,
): number {
  const dist = Math.max(host.thickness, 1);
  const path = [from, (from + to) / 2, to].map((s) => wallFaceProbes(host, alongHost(host, at, s), dist)[side]);
  return pathLengthInRoom(path, box);
}

/**
 * The two sides of a connector's host wall, `[minus, plus]` ({@link wallFaceProbes}),
 * each probed one wall thickness from the host's centreline (half a thickness past the
 * face) at the centre and a little inside both jambs ({@link JAMB_PROBE_INSET_MM}). `null`
 * for a connector with no host.
 *
 * A room whose bounding box, grown by the host's thickness, misses the probe path's box is
 * skipped before its shape is asked: a room's box holds its whole floor, so this only
 * FILTERS candidates — every answer still comes from the shape.
 */
export function connectorFaces(
  c: Pick<AccessConnector, "at" | "host"> & { width?: number },
  roomRects: Map<string, RoomBox>,
): [FaceReading, FaceReading] | null {
  const host = c.host;
  if (!host) return null;
  const dist = Math.max(host.thickness, 1);
  const width = c.width ?? 0;
  const half = Math.max(0, width / 2 - Math.min(JAMB_PROBE_INSET_MM, width / 4));
  const centre = wallFaceProbes(host, c.at, dist);
  const jambLo = wallFaceProbes(host, alongHost(host, c.at, -half), dist);
  const jambHi = wallFaceProbes(host, alongHost(host, c.at, half), dist);
  const read = (side: "minus" | "plus"): FaceReading => {
    const mid = centre[side];
    const path = [jambLo[side], mid, jambHi[side]];
    const x0 = Math.min(path[0]!.x, mid.x, path[2]!.x) - dist;
    const x1 = Math.max(path[0]!.x, mid.x, path[2]!.x) + dist;
    const y0 = Math.min(path[0]!.y, mid.y, path[2]!.y) - dist;
    const y1 = Math.max(path[0]!.y, mid.y, path[2]!.y) + dist;
    const holders: string[] = [];
    const cover: FaceReading["cover"] = [];
    for (const [id, box] of roomRects) {
      if (box.x > x1 || box.x + box.w < x0 || box.y > y1 || box.y + box.h < y0) continue;
      if (pointInRoomBox(mid, box)) holders.push(id);
      const mm = pathLengthInRoom(path, box);
      if (mm > 0) cover.push({ id, mm });
    }
    return { holders, cover };
  };
  return [read("minus"), read("plus")];
}

/**
 * The doorway's face on one side of its host wall, half the host's thickness from the
 * centreline: `[jamb, centre, jamb]`, the jambs at the ends of the connector's width along
 * the host run (on the arc itself for a curved host). The same three stations
 * {@link connectorFaces} probes, set on the face rather than past it; a distance from the
 * doorway into a room is measured from this path.
 */
export function connectorFacePath(
  c: Pick<AccessConnector, "at"> & { host: NonNullable<AccessConnector["host"]>; width: number },
  side: "minus" | "plus",
): [Point, Point, Point] {
  const d = c.host.thickness / 2;
  const half = c.width / 2;
  return [
    wallFaceProbes(c.host, alongHost(c.host, c.at, -half), d)[side],
    wallFaceProbes(c.host, c.at, d)[side],
    wallFaceProbes(c.host, alongHost(c.host, c.at, half), d)[side],
  ];
}

/** The pair `a`/`b` in `roomRects` order with `exterior` first — the order
 *  {@link doorConnections} uses — so it depends on no page direction. */
function orderedPair(a: string, b: string, roomRects: Map<string, RoomBox>): [string, string] {
  const order = [EXTERIOR_NODE, ...roomRects.keys()];
  return order.indexOf(a) <= order.indexOf(b) ? [a, b] : [b, a];
}

/**
 * The two spaces a connector touching 3+ rooms joins under the `"probe"`
 * {@link AmbiguityPolicy}, or `null` when the probe cannot decide: a centre probe on a
 * room boundary, or on no floor behind a non-exterior host, decides nothing.
 */
function probeConnection(
  faces: [FaceReading, FaceReading],
  hostCategory: string,
  roomRects: Map<string, RoomBox>,
): [string, string] | null {
  const face = (f: FaceReading): string | null => {
    if (f.holders.length === 1) return f.holders[0]!;
    if (f.holders.length === 0 && hostCategory === "exterior") return EXTERIOR_NODE;
    return null; // on a room boundary, or in no floor behind an interior wall
  };
  const a = face(faces[0]);
  const b = face(faces[1]);
  if (a === null || b === null || a === b) return null;
  return orderedPair(a, b, roomRects);
}

/**
 * The two spaces a hosted connector touching ≤2 rooms joins, read off its host wall's
 * faces, or `null` when they do not name two different spaces. A face whose centre probe
 * is on one floor is that room; on no floor, `exterior` behind an exterior host (else
 * undecided); on a boundary two floors share, the room covering more of that face's
 * clear span — a measured length, ties to `roomRects` order.
 *
 * A face's room counts only when it is one of the rooms the connector's point `touching`
 * (`exterior` always counts). The probe stands half a thickness past the face, so behind a
 * thick wall and a room shallower than that it lands in the room beyond, which the
 * connector does not open into; such a face decides nothing.
 */
function faceConnection(
  faces: [FaceReading, FaceReading],
  hostCategory: string,
  touching: readonly string[],
  roomRects: Map<string, RoomBox>,
): [string, string] | null {
  const face = (f: FaceReading): string | null => {
    if (f.holders.length === 0) return hostCategory === "exterior" ? EXTERIOR_NODE : null;
    let best = f.holders[0]!;
    let bestMm = -1;
    for (const id of f.holders) {
      const mm = f.cover.find((x) => x.id === id)?.mm ?? 0;
      if (mm > bestMm) {
        best = id;
        bestMm = mm;
      }
    }
    return touching.includes(best) ? best : null;
  };
  const a = face(faces[0]);
  const b = face(faces[1]);
  if (a === null || b === null || a === b) return null;
  return orderedPair(a, b, roomRects);
}

/**
 * Every room a face's clear span covers, over each face that covers more than one, in
 * `roomRects` order — or `undefined` when no face does. Never suppressed for equalling
 * `between`: a wall running into the opening is the fact, whichever rooms it divides.
 */
function straddledRooms(faces: [FaceReading, FaceReading], roomRects: Map<string, RoomBox>): string[] | undefined {
  const covered = new Set<string>();
  for (const f of faces) if (f.cover.length > 1) for (const x of f.cover) covered.add(x.id);
  if (covered.size === 0) return undefined;
  return [...roomRects.keys()].filter((id) => covered.has(id));
}

/**
 * The spaces one connector joins, whether it is `ambiguous`, and the rooms its opening
 * `straddles` — the ONE answer every access surface reads (`describe().doors[]`/
 * `openings[]` `between`, `describe().access`, circulation, lint reachability,
 * `suggestTopology`).
 *
 *  - No host wall: {@link doorConnections}, `ambiguous` when 3+ rooms touch its point.
 *  - A host, ≤2 rooms touching: the room on each face of the host wall
 *    ({@link faceConnection}) — never the centre point's edge touch alone, which hands an
 *    exterior door on a T-junction or beside a partition's end to the two rooms inside.
 *    A face's room counts only if the point touches it. When the faces do not name two
 *    different spaces, {@link doorConnections}' answer.
 *  - A host, 3+ rooms touching: resolved by `policy` ({@link AmbiguityPolicy}); when that
 *    cannot decide it keeps {@link doorConnections}' pair for display and is `ambiguous`.
 *
 * `straddles` ({@link AccessEdge.straddles}) is present only for a hosted connector whose
 * clear span on a face covers more than one room.
 */
export function connectorConnection(
  c: Pick<AccessConnector, "at" | "host"> & { width?: number },
  roomRects: Map<string, RoomBox>,
  tol: number,
  policy: AmbiguityPolicy = "probe",
): { between: string[]; ambiguous: boolean; straddles?: string[] } {
  const touching = roomsAtPoint(c.at, roomRects, tol);
  const faces = connectorFaces(c, roomRects);
  const hostCategory = c.host?.category ?? "";
  // A connector that is not ON its host — a free `door at` far from every wall is still
  // given the nearest segment — has no faces of its own: it keeps the edge-touch answer and
  // straddles nothing. The tolerance is `hostInfoForWalls`' own on-wall test. (The 3+-room
  // policy probes it as it always has.)
  const onHost =
    c.host !== null && distPointToWallSegment(c.at, c.host) <= c.host.thickness / 2 + Math.max(c.host.thickness, 1);
  let between: string[];
  let ambiguous = false;
  if (touching.length < 3) {
    between =
      (faces && onHost && faceConnection(faces, hostCategory, touching, roomRects)) ||
      doorConnections(c, roomRects, tol);
  } else {
    const probed = faces && policy === "probe" ? probeConnection(faces, hostCategory, roomRects) : null;
    between = probed ?? doorConnections(c, roomRects, tol);
    ambiguous = probed === null;
  }
  const straddles = faces && onHost ? straddledRooms(faces, roomRects) : undefined;
  return straddles ? { between, ambiguous, straddles } : { between, ambiguous };
}

/** Do the open segments p1–p2 and q1–q2 cross (a proper crossing, not a touch)? */
function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = (q2.x - q1.x) * (p1.y - q1.y) - (q2.y - q1.y) * (p1.x - q1.x);
  const d2 = (q2.x - q1.x) * (p2.y - q1.y) - (q2.y - q1.y) * (p2.x - q1.x);
  const d3 = (p2.x - p1.x) * (q1.y - p1.y) - (p2.y - p1.y) * (q1.x - p1.x);
  const d4 = (p2.x - p1.x) * (q2.y - p1.y) - (p2.y - p1.y) * (q2.x - p1.x);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Does window `w` serve room `id`: on that room's perimeter (every room it touches, so a
 * window on a shared straight wall serves both, as the daylight rules always read it), or,
 * on an arc edge no room touches, attributed to it by {@link arcWindowRoom}? The lint side of
 * `describe().windows[].room`, which is the first room the window's point touches
 * ({@link roomsAtPoint}) or else that same {@link arcWindowRoom} answer.
 */
export function windowServesRoom(
  w: { at: Point; width: number; host: WallSegment | null },
  id: string,
  roomRects: Map<string, RoomBox>,
  tol: number,
  segs: readonly WallSegment[] = [],
): boolean {
  const box = roomRects.get(id);
  if (!box) return false;
  if (pointOnRoomEdge(w.at, box, tol)) return true;
  if (!w.host?.arc || roomsAtPoint(w.at, roomRects, tol).length > 0) return false;
  return arcWindowRoom({ at: w.at, width: w.width, host: w.host }, roomRects, tol, segs) === id;
}

/**
 * The room a window on an ARC wall edge serves, from the shape — or `null` (plan-soundness
 * PS0.12). Asked only for a window whose point no room's edge touches: one that a room edge
 * touches keeps the first such room, as every window always has.
 *
 * 1. **The faces.** One wall thickness off the arc's concave and convex faces at the window
 *    centre and just inside its jambs ({@link connectorFaces}, PS0.1's probes, which walk the
 *    arc's own normal): a face whose centre probe is on a floor names that room, a boundary
 *    two floors share going to the room covering more of the face's span (ties to
 *    `roomRects` order). One face naming a room is the answer; both naming rooms (an interior
 *    curved wall) gives the first in `roomRects` order, the order {@link roomsAtPoint} uses.
 *    This is the case of a room whose floor follows the curve (a `room circle`, or a polygon
 *    traced along the arc).
 * 2. **The bay.** A room drawn to the arc's CHORD leaves the bay between chord and curve on
 *    no room's floor, so neither probe lands anywhere. Then the probe is carried on along the
 *    concave normal (towards the arc's centre) to where it crosses the chord, and one wall
 *    thickness past it. The first room in `roomRects` order whose floor holds that point and
 *    whose edge holds the crossing serves the window (the bay opens into it there), provided
 *    no other wall runs between the window and the probe: a wall standing on the chord at the
 *    crossing, or crossing the way in, closes the bay off, and the window then serves no
 *    room. The window's CENTRE decides, as it does on a straight wall: a bay whose chord two
 *    rooms share goes to the room in front of the window's centre.
 *
 * `null` when neither step names a room. A room's bounding box only filters candidates in the
 * face probes; every answer comes from `pointInRoomBox`/`pointOnRoomEdge` on the shape.
 */
export function arcWindowRoom(
  w: { at: Point; width: number; host: WallSegment },
  roomRects: Map<string, RoomBox>,
  tol: number,
  segs: readonly WallSegment[],
): string | null {
  const host = w.host;
  const arc = host.arc;
  if (!arc) return null;
  const faces = connectorFaces(w, roomRects);
  if (faces) {
    const named = (f: FaceReading): string | null => {
      if (f.holders.length === 0) return null;
      let best = f.holders[0]!;
      let bestMm = -1;
      for (const id of f.holders) {
        const mm = f.cover.find((x) => x.id === id)?.mm ?? 0;
        if (mm > bestMm) {
          best = id;
          bestMm = mm;
        }
      }
      return best;
    };
    const a = named(faces[0]);
    const b = named(faces[1]);
    if (a !== null || b !== null) {
      if (a === null || b === null) return (a ?? b)!;
      return [...roomRects.keys()].find((id) => id === a || id === b) ?? a;
    }
  }
  // The bay: along the concave normal from the window centre to the chord a–b.
  const ux0 = arc.center.x - w.at.x;
  const uy0 = arc.center.y - w.at.y;
  const ul = Math.hypot(ux0, uy0);
  if (ul === 0) return null;
  const u = { x: ux0 / ul, y: uy0 / ul };
  const cx = arc.b.x - arc.a.x;
  const cy = arc.b.y - arc.a.y;
  const den = u.x * cy - u.y * cx;
  if (den === 0) return null; // the normal runs along the chord
  const t = ((arc.a.x - w.at.x) * cy - (arc.a.y - w.at.y) * cx) / den;
  const s = ((arc.a.x - w.at.x) * u.y - (arc.a.y - w.at.y) * u.x) / den;
  if (!(t > 0) || s < 0 || s > 1) return null; // the chord is not ahead of the window
  const crossing = { x: w.at.x + u.x * t, y: w.at.y + u.y * t };
  const reach = t + Math.max(host.thickness, 1);
  const probe = { x: w.at.x + u.x * reach, y: w.at.y + u.y * reach };
  // No other wall between the window and the probe: crossing it, or standing on the chord.
  for (const g of segs) {
    if (g.wallId === host.wallId && g.index === host.index) continue;
    if (distPointToWallSegment(crossing, g) <= g.thickness / 2) return null;
    if (!g.arc && segmentsCross(w.at, probe, g.a, g.b)) return null;
  }
  for (const [id, box] of roomRects) if (pointInRoomBox(probe, box) && pointOnRoomEdge(crossing, box, tol)) return id;
  return null;
}
