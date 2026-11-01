/**
 * **Open shells:** exterior walls that should enclose a room and do not. `W_EXTERIOR_RING_OPEN`
 * reports them, and `describe()` says which rooms the gross internal area leaves out because of them
 * (`totals.gross_internal_area_leaves_out`), from this one reading.
 *
 * The gross internal area (`src/analyze/gross-area.ts`) adds a building for each ring its exterior
 * walls close. Whether a ring exists says nothing about the rest of those walls: a closed porch built
 * off an open shell closes one, and the shell's own gap has not gone. So the question here is asked
 * of each wall's free end, never of the storey or the loop.
 *
 * ## A shell end
 *
 * An end of an open `exterior` wall is a shell end when all of these hold:
 *
 *  1. **Nothing meets it.** Its drawn end touches no wall of any category (a shell finished in
 *     partitions is closed; {@link endMeetsWall}).
 *  2. **It is tall enough to be a storey's wall.** A wall lower than a door's head
 *     ({@link DOOR_HEAD}: no one walks through it, so no door could stand in it) is a parapet or a
 *     garden wall, whatever its category. The floor is that head and not the storey's height,
 *     because a shell is often authored to the clear height, below the storey it stands on.
 *  3. **Its last stretch stands on a room left outside.** The stretch runs from the end to the first
 *     exterior wall that meets the run ({@link lastStretch}), and must lie along the edge of a room
 *     with floor outside every ring ({@link roomsLeftOut}), not open to the sky ({@link isOpenAir}).
 *     That is what tells a shell from a garden wall: a boundary wall carrying on past the corner of
 *     a closed house stands on no room past that corner, though the same wall stands on one before
 *     it. A fin inside a building stands on a room a ring encloses, so it leaves no gap in anything.
 *
 * **A room is left outside by its shape, never by a point.** The exterior walls' own faces are
 * measured against the room's outline in closed form (`roomOutside`): a room is enclosed when its
 * floor lies inside the rings and the walls' bodies. So a ring standing inside a room's outline (a
 * closed core) encloses that core and not the room, and a ring over part of a room leaves the rest
 * outside: the room counts as left outside, and its enclosed part is in the figure.
 *
 * Runs that all lie on one straight line are no ring, so a storey whose shell ends all sit on one
 * line has no open shell (a lean-to, a boundary wall).
 *
 * A curved wall stands on a room when a vertex of the room's outline lies against its body, and a
 * wall meeting a curve part-way along is not measured (`junctionSpans`), so a curved last stretch
 * runs to the segment's end.
 *
 * ## Bounded
 *
 * Counted before the work, {@link MAX_GROSS_AREA_TESTS} in all, and the room measure under the walled
 * faces' own caps: a storey past either is refused, never approximated. Pure and deterministic: rooms
 * and walls in source order.
 */

import { edgeWallCover, isOpenAir, type RoomBox, roomRing } from "../analyze.js";
import type { Point } from "../ast.js";
import { DOOR_HEAD } from "../datum.js";
import { distPointToWallSegment, segmentDirAt, segmentLength, type WallSegment } from "../geometry.js";
import type { RRoom, RWall } from "../ir.js";
import { DEFAULT_RULESET } from "../lint/ruleset.js";
import { junctionSpans } from "../opening-junctions.js";
import { exteriorRuns, MAX_GROSS_AREA_TESTS } from "./gross-area.js";
import { roomOutside, wallFaces, type WallFacesRefused } from "./wall-faces.js";

/** Float dust on whole-millimetre geometry. */
const EPS = 1e-6;

/**
 * How far past its centreline-plus-half-thickness a wall's body may stand and still be read as
 * standing on a boundary (mm): a wall drawn on the room edges' line, or with a face on it, is
 * on it; one standing a room's depth inside is not.
 */
export const WALL_BODY_SLACK_MM = 50;

/**
 * Whether `p` lies in the DRAWN outline of a wall segment: the band of half its thickness round
 * the centreline, and, on a straight segment, the square cap the renderer adds half a thickness
 * beyond each end. Every segment end is capped, an inner joint too: that only over-covers a
 * corner, so the rule can miss a slit there, never invent one.
 */
export function inDrawnWall(p: Point, s: WallSegment): boolean {
  const h = s.thickness / 2;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return Math.hypot(p.x - s.a.x, p.y - s.a.y) <= h + EPS;
  const ux = dx / len;
  const uy = dy / len;
  const along = (p.x - s.a.x) * ux + (p.y - s.a.y) * uy;
  const across = Math.abs((p.x - s.a.x) * uy - (p.y - s.a.y) * ux);
  return along >= -h - EPS && along <= len + h + EPS && across <= h + EPS;
}

/** One free end of an open wall: the end point, the point next to it on the wall, the segment they
 *  bound, and which of the wall's two ends it is. */
export interface WallEnd {
  e: Point;
  from: Point;
  seg: number;
  which: 0 | 1;
}

/** An open wall's two ends; a closed wall has none. */
export function endsOfWall(w: RWall): WallEnd[] {
  if (w.closed || w.points.length < 2) return [];
  const n = w.points.length;
  return [
    { e: w.points[0]!, from: w.points[1]!, seg: 0, which: 0 },
    { e: w.points[n - 1]!, from: w.points[n - 2]!, seg: n - 2, which: 1 },
  ];
}

/** Are all these points on one straight line? */
function onOneLine(pts: readonly Point[]): boolean {
  const a = pts[0]!;
  const b = pts.find((p) => Math.hypot(p.x - a.x, p.y - a.y) > EPS);
  if (!b) return true;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return pts.every((p) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len <= EPS);
}

/** Is this run nothing but one straight line? A curve never is. */
export const isStraightRun = (run: readonly RWall[]): boolean =>
  !run.some((w) => w.arcs?.some((a) => a !== undefined)) && onOneLine(run.flatMap((w) => w.points));

/** Where {@link endMeetsWall} reads a drawn end, in half thicknesses along and across the wall. */
const END_ALONG: readonly number[] = [0, 0.5, 1];
const END_ACROSS: readonly number[] = [-1, 0, 1];
/** The stations of one drawn end, each tested against every segment: the count charged for it. */
const END_STATIONS = END_ALONG.length * END_ACROSS.length;

/**
 * Does the drawn end of `w` touch another wall of any kind? The end is the square of its cap,
 * half a thickness long and a thickness wide past the last point, read at {@link END_STATIONS}
 * stations; the wall's own last segment does not count. A wall of another category closes the
 * enclosure as well as an exterior one: nothing is open there, however the plan classes the wall.
 */
function endMeetsWall(segs: readonly WallSegment[], w: RWall, end: WallEnd, own: WallSegment): boolean {
  const tangent = segmentDirAt(own, end.e);
  const d = end.which === 0 ? { x: -tangent.x, y: -tangent.y } : tangent;
  const h = w.thickness / 2;
  const others = segs.filter((s) => s.thickness > 0 && s !== own);
  for (const stepAlong of END_ALONG) {
    const along = stepAlong * h;
    for (const stepAcross of END_ACROSS) {
      const across = stepAcross * h;
      const p = { x: end.e.x + d.x * along - d.y * across, y: end.e.y + d.y * along + d.x * across };
      if (others.some((s) => (s.arc ? distPointToWallSegment(p, s) <= s.thickness / 2 + EPS : inDrawnWall(p, s))))
        return true;
    }
  }
  return false;
}

/** The straight pieces and whole curves of a wall from a free end to where the walk stopped. */
interface Stretch {
  straight: Array<Pick<WallSegment, "a" | "b" | "thickness">>;
  curved: WallSegment[];
}

/**
 * The wall from its free end to the first exterior wall that meets it (`junctionSpans`, the measure
 * `W_OPENING_AT_JUNCTION` reports), or to its other end. The wall's own segments next to the one
 * walked are its corners, not a meeting.
 */
function lastStretch(w: RWall, which: 0 | 1, exterior: readonly WallSegment[]): Stretch {
  const own = exterior.filter((s) => s.wallId === w.id);
  const out: Stretch = { straight: [], curved: [] };
  for (const s of which === 0 ? own : [...own].reverse()) {
    const spans = junctionSpans(
      s,
      exterior.filter((o) => o.wallId !== w.id || Math.abs(o.index - s.index) > 1),
    );
    if (s.arc) {
      out.curved.push(s);
      if (spans.length > 0) break;
      continue;
    }
    const len = segmentLength(s);
    // Along the segment from where the walk enters it, to the nearest wall that meets it.
    const stop = spans.reduce((m, j) => Math.min(m, which === 0 ? j.lo : len - j.hi), len);
    if (stop >= len) {
      out.straight.push(s);
      continue;
    }
    const entry = which === 0 ? s.a : s.b;
    const t = Math.max(0, stop) / len;
    const far = which === 0 ? s.b : s.a;
    const at = { x: entry.x + (far.x - entry.x) * t, y: entry.y + (far.y - entry.y) * t };
    if (t > 0) out.straight.push({ a: entry, b: at, thickness: s.thickness });
    break;
  }
  return out;
}

/** Does the stretch run along an edge of this ring (a curve: against one of its vertices)? */
function standsOn(st: Stretch, ring: readonly Point[]): boolean {
  return ring.some(
    (a, i) =>
      edgeWallCover(a, ring[(i + 1) % ring.length]!, st.straight, 0, { halfGap: 0, slack: WALL_BODY_SLACK_MM }).length >
        0 || st.curved.some((s) => distPointToWallSegment(a, s) <= s.thickness / 2 + WALL_BODY_SLACK_MM),
  );
}

/** One end of a shell left open. `shell` is its place in {@link OpenShells.runs}. */
export interface ShellEnd {
  wall: RWall;
  at: Point;
  which: 0 | 1;
  shell: number;
}

/** A storey's open shells (see the module header). All empty when there are none. */
export interface OpenShells {
  /** The walls of each shell left open, one entry per outermost loop that holds a shell end. */
  runs: RWall[][];
  /** The shell ends, in wall order. */
  ends: ShellEnd[];
  /** The rooms no ring encloses and which are not open to the sky, in source order. */
  rooms: RRoom[];
}

/** What {@link openShells} reads: one storey's walls and rooms. */
export interface StoreyShellInput {
  walls: readonly RWall[];
  segs: readonly WallSegment[];
  rooms: readonly RRoom[];
  rects: ReadonlyMap<string, RoomBox>;
}

/** Refused before the work: by the exterior joinery's caps, by this count, or by the walled faces'. */
export type OpenShellsRefused = { refused: "too-much-work" | "point-tests" | WallFacesRefused["refused"] };

const NONE: OpenShells = { runs: [], ends: [], rooms: [] };

/**
 * The rooms not open to the sky with floor outside every ring: more of it off the exterior walls'
 * faces and bodies than `W_ROOM_OUTSIDE_SHELL` calls outside by default, so a room's edge drawn a
 * little past a ring's wall does not count. Measured from the shapes (see the module header), and
 * only on a storey with a ring: with none, every room is outside.
 */
function roomsLeftOut(
  walls: readonly RWall[],
  rooms: readonly RRoom[],
  rings: boolean,
): readonly RRoom[] | OpenShellsRefused {
  const indoor = rooms.filter((r) => !isOpenAir(r));
  if (!rings) return indoor;
  const faces = wallFaces(
    walls.filter((w) => w.category === "exterior" && w.thickness > 0),
    [],
    indoor,
  );
  if (faces === null) return indoor;
  if ("refused" in faces) return { refused: faces.refused };
  const out: RRoom[] = [];
  for (const r of indoor) {
    const o = roomOutside(faces, r);
    if (o === null) return { refused: "too-many-room-curves" };
    if (o.area / 1_000_000 >= DEFAULT_RULESET.minOutsideShellM2 - EPS) out.push(r);
  }
  return out;
}

/** The storey's open shells (see the module header), or the count that refused them. */
export function openShells(input: StoreyShellInput): OpenShells | OpenShellsRefused {
  const { walls, segs, rooms, rects } = input;
  const read = exteriorRuns(walls);
  if (read === "too-much-work") return { refused: read };
  const open = read.runs.flatMap((r) => r.walls.filter((w) => !w.closed));
  if (open.length === 0) return NONE;
  // Charged before the work, in one count: each end at its stations against every segment, every
  // room edge against every segment, the pairing's two passes over the pairs of ends (the rule's,
  // whose bound belongs here with the rest), and each end's walk over its wall's segments against
  // the exterior segments. The rooms against the rings are charged in `wallFaces`.
  const exterior = segs.filter((s) => s.category === "exterior" && s.thickness > 0);
  const ringEdges = rooms.reduce((n, r) => n + roomRing(rects.get(r.id)!).length, 0);
  const openEnds = 2 * open.length;
  const openIds = new Set(open.map((w) => w.id));
  const openSegs = exterior.reduce((n, s) => n + (openIds.has(s.wallId) ? 1 : 0), 0);
  const tests =
    (openEnds * END_STATIONS + ringEdges) * segs.length + openEnds * openEnds + 2 * openSegs * exterior.length;
  if (tests > MAX_GROSS_AREA_TESTS) return { refused: "point-tests" };

  const left = roomsLeftOut(walls, rooms, read.rings);
  if ("refused" in left) return left;
  const leftRings = left.map((r) => roomRing(rects.get(r.id)!));

  const runs: RWall[][] = [];
  const ends: ShellEnd[] = [];
  for (const run of read.runs) {
    const found: ShellEnd[] = [];
    for (const w of run.walls) {
      if (w.height < DOOR_HEAD) continue;
      for (const end of endsOfWall(w)) {
        const own = segs.find((s) => s.wallId === w.id && s.index === end.seg);
        if (!own || endMeetsWall(segs, w, end, own)) continue;
        const st = lastStretch(w, end.which, exterior);
        if (!leftRings.some((ring) => standsOn(st, ring))) continue;
        found.push({ wall: w, at: end.e, which: end.which, shell: runs.length });
      }
    }
    if (found.length === 0) continue;
    // A loop that closes a ring holds walls that are no part of the shell: only the ones with an
    // end say what it is. A loop that closes nothing is the shell, all of it.
    runs.push(run.closes ? [...new Set(found.map((e) => e.wall))] : run.walls);
    ends.push(...found);
  }
  if (runs.length === 0 || isStraightRun(runs.flat())) return NONE;
  return { runs, ends, rooms: [...left] };
}
