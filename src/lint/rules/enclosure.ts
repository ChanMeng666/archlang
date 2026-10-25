/**
 * Space-enclosure rules (plan-soundness PS2.4): floor the walls and the rooms disagree about.
 *
 *  - `W_BOUNDARY_NO_WALL` — two rooms meet along an edge with a run longer than a doorway
 *    (`maxBoundaryGapMm`) that no wall, door, cased opening or fixed counter stands on.
 *  - `W_FLOOR_UNASSIGNED` — a closed region of floor the walls enclose (a walled face) that the
 *    rooms cover less than `minFaceCoverRatio` of, by at least `minUnassignedM2`.
 *  - `W_ROOM_OUTSIDE_SHELL` — a room with at least `minOutsideShellM2` of its floor off every
 *    walled face and every wall: outside the building.
 *
 * **From the shapes.** The run two rooms share is read off their own rings: a pair of
 * parallel edges within `tolMm` of each other (the room-adjacency test), checked by probing
 * just past each edge that one room's floor is on each side ({@link pointInRoomBox}); pieces on
 * one line that meet are merged, so a vertex on a ring cannot split a gap. What stands on the
 * run is measured along the line midway between the two edges: every straight wall whose BODY
 * (centreline ± half its thickness, plus {@link WALL_BODY_SLACK_MM}) meets the gap between the
 * edges (`edgeWallCover` with a body test; `W_ROOM_NOT_ENCLOSED` reads the same function by
 * centreline, unchanged), the span of every door and cased opening on it, and the extent of
 * every fixed counter that straddles the line, which closes a stretch only when what it leaves
 * open there is no wider than a doorway. A curved wall backs no straight run (its chord is not
 * a wall). Walled faces and
 * the outside are the holes and the exterior of the joined wall bands (`src/analyze/wall-faces.ts`),
 * measured in closed form against the rooms' own shapes — arcs and circle rooms included. A
 * bounding box only skips what cannot meet.
 *
 * **Exemptions, and why.** Two rooms whose uses (`roomUses`: their `uses`, else the label
 * vocabulary — never an id) are each one of kitchen, dining or living are an open-plan pair:
 * the missing wall is the design. A walled face with no door, cased opening or window into it
 * and no room bordering its empty floor is a sealed pocket (a duct, a spandrel behind a curved
 * wall), not floor anyone forgot: it is not reported. Floor under an `outdoor` surface, a `void`
 * or a stair, lift or escalator is assigned, though it is no room. `W_ROOM_OUTSIDE_SHELL` judges
 * only a room most of whose floor (an exact area) lies inside walled faces: anything else (no
 * closed face at all, a column ring or a closed WC box beside the room, a shell left open at its
 * door) gives it no shell to be outside of, and the rule refuses rather than guesses (ADR 0005).
 * Both face rules are silent on a storey past the face bounds (`src/analyze/wall-faces.ts`).
 *
 * Messages name rooms by label and walls by kind; element ids are in the hints only. No rule
 * offers a machine fix: a wall, a room edge or a surface is a design decision.
 */

import type { Point } from "../../ast.js";
import { edgeWallCover, type RoomBox, pointInRoomBox, rectOf, roomRing, roomUses } from "../../analyze.js";
import {
  type FaceRoom,
  faceCover,
  roomOutside,
  type WallFaces,
  type WallFacesRefused,
  wallFaces,
} from "../../analyze/wall-faces.js";
import type { Diagnostic } from "../../diagnostics.js";
import { distPointToWallSegment, wallFaceProbes } from "../../geometry.js";
import { edgeMid, edgeTangentAt } from "../../geometry/band.js";
import { collinearOverlapLength } from "../../geometry/polygon.js";
import type { ResolvedPlan, RRoom, RWall } from "../../ir.js";
import { fmt2 } from "../../num-format.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst } from "../phrases.js";
import type { EnclosureBudgetCap } from "../coverage.js";
import { mm } from "../measure.js";

/** Uses that make an open-plan pair: two rooms each with one of these need no wall between them. */
const OPEN_PLAN: ReadonlySet<string> = new Set(["kitchen", "dining", "living"]);

/**
 * Fixed pieces that close a boundary they stand across — a servery counter, a bar, a kitchen
 * island (the first-contact café's counter in the gap to its seating,
 * `docs/plans/plan-soundness/audits/2026-10-18-first-contact.md` C-plan). Free furniture
 * (a table, a sofa) does not: it moves.
 */
const BOUNDARY_FIXTURES: ReadonlySet<string> = new Set(["counter", "bar_counter", "island"]);

/**
 * How far past each room's edge the shared-run probe stands (mm): half the thinnest partition
 * the examples draw, the depth `JAMB_PROBE_INSET_MM` uses, so a probe is on the room's floor
 * and not past a room as shallow as a cupboard.
 */
const RUN_PROBE_MM = 50;

/**
 * The share of a room's floor that must lie inside walled faces before `W_ROOM_OUTSIDE_SHELL`
 * judges the rest of it against them: most of it. Below that, the faces are not the room's
 * shell (a column ring, a closed WC box beside it, a shell open at the entrance).
 */
const MIN_INSIDE_SHARE = 0.5;

/** The thinnest partition a quoted wall statement gets when the rooms meet edge to edge. */
const DEFAULT_PARTITION_MM = 100;

/** Float dust on whole-millimetre geometry. */
const EPS = 1e-6;

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"`. */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** `x 4000` on a vertical line, `y 4000` on a horizontal one, else a point pair. */
function runWords(p: Point, q: Point): string {
  if (Math.abs(p.x - q.x) < EPS)
    return `on the line x ${mm(p.x)}, y ${mm(Math.min(p.y, q.y))}–${mm(Math.max(p.y, q.y))}`;
  if (Math.abs(p.y - q.y) < EPS)
    return `on the line y ${mm(p.y)}, x ${mm(Math.min(p.x, q.x))}–${mm(Math.max(p.x, q.x))}`;
  return `from (${mm(p.x)}, ${mm(p.y)}) to (${mm(q.x)}, ${mm(q.y)})`;
}

// ─── W_BOUNDARY_NO_WALL ────────────────────────────────────────────────────────────────

/**
 * How far past its centreline-plus-half-thickness a wall's body may stand and still be read as
 * standing on a boundary (mm): a wall drawn on the room edges' line, or with a face on it, is
 * on it; one standing a room's depth inside is not.
 */
const WALL_BODY_SLACK_MM = 50;

/** Two runs on lines this close (mm) are one line. */
const SAME_LINE_MM = 1;

/** One run two rooms share, measured along the line midway between their edges. */
interface SharedRun {
  /** The run's ends on the midline. */
  p: Point;
  q: Point;
  len: number;
  /** Distance between the two rooms' edges (0 when drawn on one centreline). */
  sep: number;
}

/** One stretch of a run with nothing standing on it, and what the run holds besides. */
interface OpenStretch {
  run: SharedRun;
  /** Along-run interval (mm from `run.p`). */
  lo: number;
  hi: number;
  /** Nothing at all stands on the run: no wall, door, opening or counter anywhere on it. */
  bare: boolean;
  /** A door or cased opening stands somewhere on the run. */
  connector: boolean;
}

/**
 * The convex polygon `poly` clipped to the strip `|across(p)| ≤ half` (Sutherland–Hodgman, two
 * half-planes; a strip of width 0 is the line itself, kept to within float dust).
 */
function clipStrip(poly: readonly Point[], across: (p: Point) => number, half: number): Point[] {
  let pts = [...poly];
  for (const sign of [1, -1]) {
    const lim = half + EPS;
    const inside = (p: Point): boolean => sign * across(p) <= lim;
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const ia = inside(a);
      const ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const fa = sign * across(a) - lim;
        const fb = sign * across(b) - lim;
        const t = fa / (fa - fb);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    pts = out;
    if (pts.length === 0) break;
  }
  return pts;
}

/** Complement of `covered` within `[0, len]`: the uncovered stretches, in order. */
function gapsOf(covered: Array<[number, number]>, len: number): Array<[number, number]> {
  const sorted = covered
    .map(([a, b]): [number, number] => [Math.max(0, a), Math.min(len, b)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let at = 0;
  for (const [a, b] of sorted) {
    if (a > at) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (len > at) out.push([at, len]);
  return out;
}

/**
 * Every run rooms `a` and `b` share. A piece is a pair of parallel ring edges within `tolMm`
 * that overlap along their length, with `a`'s floor on one side and `b`'s on the other just
 * past the edges at the piece's middle (rooms that overlap or nest share no boundary). Pieces
 * on one line are then merged where they meet, so a vertex on a ring (an edge split in two)
 * does not split the run and hide a gap across it.
 */
function sharedRuns(ctx: LintContext, a: RRoom, b: RRoom): SharedRun[] {
  const ba = ctx.roomRects.get(a.id)!;
  const bb = ctx.roomRects.get(b.id)!;
  const tol = ctx.rules.tolMm;
  const ringA = roomRing(ba);
  const ringB = roomRing(bb);
  const inA = (p: Point): boolean => pointInRoomBox(p, ba);
  const inB = (p: Point): boolean => pointInRoomBox(p, bb);
  // Pieces in a canonical frame: direction `u` pointing east (or south when vertical), the
  // midline at offset `c` along `n`, the piece from `s0` to `s1` along `u`.
  const pieces: Array<{ u: Point; n: Point; c: number; s0: number; s1: number; sep: number }> = [];
  for (let i = 0; i < ringA.length; i++) {
    const a1 = ringA[i]!;
    const a2 = ringA[(i + 1) % ringA.length]!;
    const la = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    if (la < EPS) continue;
    const e = { x: (a2.x - a1.x) / la, y: (a2.y - a1.y) / la };
    const en = { x: -e.y, y: e.x };
    for (let j = 0; j < ringB.length; j++) {
      const b1 = ringB[j]!;
      const b2 = ringB[(j + 1) % ringB.length]!;
      if (collinearOverlapLength(a1, a2, b1, b2, tol) <= EPS) continue;
      const off = (b1.x - a1.x) * en.x + (b1.y - a1.y) * en.y;
      const t1 = (b1.x - a1.x) * e.x + (b1.y - a1.y) * e.y;
      const t2 = (b2.x - a1.x) * e.x + (b2.y - a1.y) * e.y;
      const lo = Math.max(0, Math.min(t1, t2));
      const hi = Math.min(la, Math.max(t1, t2));
      if (hi - lo <= EPS) continue;
      const at = (t: number): Point => ({ x: a1.x + e.x * t + (en.x * off) / 2, y: a1.y + e.y * t + (en.y * off) / 2 });
      const mid = at((lo + hi) / 2);
      const d = Math.abs(off) / 2 + RUN_PROBE_MM;
      const plus = { x: mid.x + en.x * d, y: mid.y + en.y * d };
      const minus = { x: mid.x - en.x * d, y: mid.y - en.y * d };
      const opposite =
        (inA(minus) && inB(plus) && !inA(plus) && !inB(minus)) ||
        (inA(plus) && inB(minus) && !inA(minus) && !inB(plus));
      if (!opposite) continue;
      const u = e.x > EPS || (Math.abs(e.x) <= EPS && e.y > 0) ? e : { x: -e.x, y: -e.y };
      const n = { x: -u.y, y: u.x };
      const p = at(lo);
      const q = at(hi);
      const sp = p.x * u.x + p.y * u.y;
      const sq = q.x * u.x + q.y * u.y;
      pieces.push({ u, n, c: p.x * n.x + p.y * n.y, s0: Math.min(sp, sq), s1: Math.max(sp, sq), sep: Math.abs(off) });
    }
  }
  // Merge pieces on one line that meet or overlap, in a deterministic order.
  pieces.sort((x, y) => x.u.x - y.u.x || x.u.y - y.u.y || x.c - y.c || x.s0 - y.s0);
  const out: SharedRun[] = [];
  let cur: (typeof pieces)[number] | null = null;
  const flush = (): void => {
    if (!cur) return;
    const p = { x: cur.u.x * cur.s0 + cur.n.x * cur.c, y: cur.u.y * cur.s0 + cur.n.y * cur.c };
    const q = { x: cur.u.x * cur.s1 + cur.n.x * cur.c, y: cur.u.y * cur.s1 + cur.n.y * cur.c };
    out.push({ p, q, len: cur.s1 - cur.s0, sep: cur.sep });
  };
  for (const x of pieces) {
    const sameLine =
      cur !== null &&
      Math.abs(cur.u.x - x.u.x) <= EPS &&
      Math.abs(cur.u.y - x.u.y) <= EPS &&
      Math.abs(cur.c - x.c) <= SAME_LINE_MM;
    if (cur !== null && sameLine && x.s0 <= cur.s1 + EPS) {
      cur = { u: cur.u, n: cur.n, c: cur.c, s0: cur.s0, s1: Math.max(cur.s1, x.s1), sep: Math.max(cur.sep, x.sep) };
      continue;
    }
    flush();
    cur = { ...x };
  }
  flush();
  return out;
}

/**
 * The open stretches of one shared run: where no wall body (`edgeWallCover` with a
 * {@link WallBodyTest}: the wall's centreline ± half its thickness, plus
 * {@link WALL_BODY_SLACK_MM}, meets the gap between the two room edges), no door and no cased
 * opening stands, nor any wall body that crosses the run (clipped to the gap between the room
 * edges; one across an END of the run is the wall the rooms are drawn to and splits nothing).
 * A fixed counter closes a stretch only when it STRADDLES the line and what it leaves open there
 * totals no more than a doorway (`maxBoundaryGapMm`); a token counter in a wide gap closes
 * nothing.
 *
 * **Counters and wall stubs are judged differently, by decision (review round 2).** A counter
 * is a declared servery: the total it leaves open must be no wider than a doorway, because a
 * partial counter is suspect (two counters leaving 950 mm open in all, across two slots, still
 * warn). A wall stub is a real boundary: stubs split the run, and only the longest stretch they
 * leave is compared with the doorway (two stubs leaving 950 mm in all, the longest 400 mm, are
 * silent).
 */
function openStretches(ctx: LintContext, run: SharedRun): OpenStretch[] {
  const { p, q, len, sep } = run;
  const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  const n = { x: -u.y, y: u.x };
  const along = (x: Point): number => (x.x - p.x) * u.x + (x.y - p.y) * u.y;
  const across = (x: Point): number => (x.x - p.x) * n.x + (x.y - p.y) * n.y;
  const straight = ctx.wallSegs.filter((s) => !s.arc);
  const covered = edgeWallCover(p, q, straight, ctx.rules.tolMm, { halfGap: sep / 2, slack: WALL_BODY_SLACK_MM });
  // A wall CROSSING the run (not parallel to it) stands on it where its body spans the gap
  // between the room edges: its body is clipped to that strip and its extent along the run
  // counts. One that only reaches the line from one side does not cross it.
  for (const s of straight) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const sl = Math.hypot(dx, dy);
    if (sl < EPS || Math.abs(u.x * dy - u.y * dx) / sl <= 1e-9) continue;
    const h = s.thickness / 2;
    const sn = { x: (-dy / sl) * h, y: (dx / sl) * h };
    const quad = [
      { x: s.a.x + sn.x, y: s.a.y + sn.y },
      { x: s.b.x + sn.x, y: s.b.y + sn.y },
      { x: s.b.x - sn.x, y: s.b.y - sn.y },
      { x: s.a.x - sn.x, y: s.a.y - sn.y },
    ];
    const acr = quad.map(across);
    const half = sep / 2;
    if (!(Math.min(...acr) < -half - EPS && Math.max(...acr) > half + EPS)) continue;
    const clipped = clipStrip(quad, across, half);
    if (clipped.length === 0) continue;
    const al = clipped.map(along);
    const lo = Math.min(...al);
    const hi = Math.max(...al);
    // A wall across an END of the run is the wall the two rooms are drawn to, ending it: it
    // splits nothing, and the run is still measured centreline to centreline.
    if (lo <= EPS || hi >= len - EPS) continue;
    covered.push([lo, hi]);
  }
  let connector = false;
  for (const c of ctx.connectors) {
    const half = (c.host?.thickness ?? 0) / 2;
    if (Math.abs(across(c.at)) - half - WALL_BODY_SLACK_MM > sep / 2) continue;
    const s = along(c.at);
    if (s + c.width / 2 <= 0 || s - c.width / 2 >= len) continue;
    covered.push([s - c.width / 2, s + c.width / 2]);
    connector = true;
  }
  const counters: Array<[number, number]> = [];
  for (const f of ctx.furniture) {
    if (!BOUNDARY_FIXTURES.has(f.category)) continue;
    const r = rectOf(f);
    const corners = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
    const ns = corners.map(across);
    if (!(Math.min(...ns) < 0 && Math.max(...ns) > 0)) continue;
    const ss = corners.map(along);
    counters.push([Math.min(...ss), Math.max(...ss)]);
  }
  const bareRun = covered.length === 0 && counters.length === 0;
  const out: OpenStretch[] = [];
  for (const [lo, hi] of gapsOf(covered, len)) {
    const inGap = counters
      .map(([a, b]): [number, number] => [Math.max(a, lo), Math.min(b, hi)])
      .filter(([a, b]) => b > a)
      .map(([a, b]): [number, number] => [a - lo, b - lo]);
    if (inGap.length > 0) {
      const leftOpen = gapsOf(inGap, hi - lo).reduce((t, [a, b]) => t + (b - a), 0);
      if (leftOpen <= ctx.rules.maxBoundaryGapMm + EPS) continue;
    }
    out.push({ run, lo, hi, bare: bareRun, connector });
  }
  return out;
}

/** Could two room boxes share an edge within `tol`? A filter only: the shapes decide. */
const boxesNear = (a: RoomBox, b: RoomBox, tol: number): boolean =>
  a.x <= b.x + b.w + tol && b.x <= a.x + a.w + tol && a.y <= b.y + b.h + tol && b.y <= a.y + a.h + tol;

/**
 * `W_BOUNDARY_NO_WALL`: two rooms share an edge run on which a stretch longer than a doorway
 * (`maxBoundaryGapMm`) has no wall, door, cased opening or closing counter
 * ({@link openStretches}). One warning per pair, on the later-declared room, measuring the
 * longest such stretch. An open-plan pair (both kitchen, dining or living) is exempt; a circle
 * room shares no straight run.
 */
export const boundaryNoWall: LintRule = {
  name: "boundary-no-wall",
  family: "enclosure",
  layer: "validity",
  codes: ["W_BOUNDARY_NO_WALL"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const max = ctx.rules.maxBoundaryGapMm;
    const tol = ctx.rules.tolMm;
    const rooms = ctx.rooms;
    const thinnest = ctx.ir.walls.reduce(
      (t, w) => (w.category === "partition" ? Math.min(t, w.thickness) : t),
      Number.POSITIVE_INFINITY,
    );
    for (let j = 0; j < rooms.length; j++) {
      const b = rooms[j]!;
      if (b.circle) continue;
      for (let i = 0; i < j; i++) {
        const a = rooms[i]!;
        if (a.circle) continue;
        if (!boxesNear(ctx.roomRects.get(a.id)!, ctx.roomRects.get(b.id)!, tol)) continue;
        const ua = [...roomUses(a)];
        const ub = [...roomUses(b)];
        if (ua.some((x) => OPEN_PLAN.has(x)) && ub.some((x) => OPEN_PLAN.has(x))) continue;
        const stretches = sharedRuns(ctx, a, b).flatMap((run) => openStretches(ctx, run));
        if (stretches.length === 0) continue;
        const worst = stretches.reduce((w, s) => (s.hi - s.lo > w.hi - w.lo ? s : w));
        const gapLen = worst.hi - worst.lo;
        if (gapLen <= max + EPS) continue;
        const { run } = worst;
        const u = { x: (run.q.x - run.p.x) / run.len, y: (run.q.y - run.p.y) / run.len };
        // The open stretch's two ends, west/north end first, so the quoted wall reads the way
        // a person writes one whatever direction the room's ring runs.
        const ends = [worst.lo, worst.hi]
          .map((s) => ({ x: run.p.x + u.x * s, y: run.p.y + u.y * s }))
          .sort((m, k) => Math.round(m.x) - Math.round(k.x) || m.y - k.y);
        const g0 = ends[0]!;
        const g1 = ends[1]!;
        const na = ctx.nameOf(a);
        const nb = ctx.nameOf(b);
        const reason = (it: string): string =>
          worst.connector
            ? `A door or opening on the run joins them, but through ${it} they are one space, so privacy and enclosure are read as if it were walled.`
            : `Through ${it} they are one space that anyone walks through, but no door or opening joins them in the plan, so routes, privacy and enclosure are read as if it were walled.`;
        const message =
          worst.bare && Math.abs(gapLen - run.len) <= EPS
            ? `${capFirst(na)} and ${nb} have no wall between them: they meet along ${mm(run.len)} mm ${runWords(run.p, run.q)} with no wall, door or opening anywhere on it, wider than a ${mm(max)} mm doorway. ${reason("that boundary")}`
            : `The boundary between ${na} and ${nb} is open for ${mm(gapLen)} mm (${runWords(g0, g1).replace(/^on the line /, "")}), wider than a ${mm(max)} mm doorway: they meet along ${mm(run.len)} mm ${runWords(run.p, run.q)}, and that stretch has no wall, door or opening. ${reason("that stretch")}`;
        const thick = run.sep > EPS ? run.sep : Number.isFinite(thinnest) ? thinnest : DEFAULT_PARTITION_MM;
        const stmt = `wall partition thickness ${mm(thick)} { (${mm(g0.x)},${mm(g0.y)}) (${mm(g1.x)},${mm(g1.y)}) }`;
        out.push({
          severity: "warning",
          code: "W_BOUNDARY_NO_WALL",
          ...ctx.at(b),
          message,
          hints: [
            `Draw the missing partition, e.g. \`${stmt}\`, and put a \`door\` in it if the two rooms should connect.`,
            `If they are one space by design, draw that wall with a cased \`opening\` across the gap, so the plan says how they join.`,
            `Accept it if the boundary is closed by something the plan does not draw (a fixed screen, a balustrade, a level change).`,
            `The rooms are "${a.id}" and "${b.id}".`,
          ],
        });
      }
    }
    return out;
  },
};

// ─── walled faces (W_FLOOR_UNASSIGNED, W_ROOM_OUTSIDE_SHELL) ──────────────────────────

/** Which of the coverage report's caps each refusal is, so its words name the one that tripped. */
const CAP_OF: Readonly<Record<WallFacesRefused["refused"], EnclosureBudgetCap>> = {
  "too-many-segments": "regions",
  "too-many-wall-contacts": "regions",
  "too-many-faces": "regions",
  "too-many-face-curves": "regions",
  "too-many-loops-per-cell": "nested-regions",
  "too-many-face-rooms": "room-region-pairs",
  "too-many-room-curves": "room-region-pairs",
  "too-many-candidate-tests": "point-tests",
};

/** The faces of a storey, computed once per resolved plan and shared by both rules. */
const FACES = new WeakMap<ResolvedPlan, WallFaces | WallFacesRefused | null>();
/**
 * The storey's faces, or `null` when there are none to read or a count was over its bound
 * ({@link WallFacesRefused}: past `MAX_FACE_WALL_SEGMENTS` or `MAX_ENCLOSURE_FACES`), in which
 * case both face rules are silent on the storey.
 */
const facesOf = (ctx: LintContext): WallFaces | null => {
  const ir = ctx.ir;
  // The budget is charged against everything the two rules will measure: the cover each face is
  // measured against (rooms, surfaces, voids, runs) and the rooms measured against the faces.
  if (!FACES.has(ir)) FACES.set(ir, wallFaces(ir.walls, [...ctx.rooms, ...nonRoomCover(ctx)], ctx.rooms));
  const wf = FACES.get(ir) ?? null;
  if (wf === null) return null;
  if ("refused" in wf) {
    // Over a counted budget: the rule asking judges nothing on this storey, and says so in the
    // coverage report (filed under its own family by the fold).
    ctx.skip("enclosure-budget", undefined, CAP_OF[wf.refused]);
    return null;
  }
  return wf;
};

/**
 * Does a door, cased opening or window open into face `fi` (one host thickness off either of
 * its host's faces)? A face with none of them and no room on its empty floor is sealed.
 */
function faceHasOpening(ctx: LintContext, wf: WallFaces, fi: number): boolean {
  return [...ctx.connectors, ...ctx.windows].some((c) => {
    if (!c.host) return false;
    const probes = wallFaceProbes(c.host, c.at, Math.max(c.host.thickness, 1));
    return wf.faceAt(probes.plus) === fi || wf.faceAt(probes.minus) === fi;
  });
}

/** The walls along a face's boundary (a wall face within 1 mm of an edge's middle), in wall order. */
function wallsRound(ctx: LintContext, wf: WallFaces, fi: number): RWall[] {
  const mids = wf.faces[fi]!.loop.map(edgeMid);
  const ids = new Set<string>();
  for (const s of ctx.wallSegs) {
    if (mids.some((m) => distPointToWallSegment(m, s) <= s.thickness / 2 + 1)) ids.add(s.wallId);
  }
  return ctx.ir.walls.filter((w) => ids.has(w.id));
}

/**
 * The rooms just beyond a face's walls: from the middle of each edge of its boundary, the
 * room whose floor holds the point one wall thickness (and {@link RUN_PROBE_MM}) outward.
 */
function roomsBeyond(ctx: LintContext, wf: WallFaces, fi: number): RRoom[] {
  const found = new Set<string>();
  for (const e of wf.faces[fi]!.loop) {
    const m = edgeMid(e);
    const t = edgeTangentAt(e, m);
    const n = { x: -t.y, y: t.x };
    const inward = wf.faceAt({ x: m.x + n.x, y: m.y + n.y }) === fi ? 1 : -1;
    let thick = 0;
    for (const s of ctx.wallSegs)
      if (distPointToWallSegment(m, s) <= s.thickness / 2 + 1) thick = Math.max(thick, s.thickness);
    const d = -inward * (thick + RUN_PROBE_MM);
    const probe = { x: m.x + n.x * d, y: m.y + n.y * d };
    for (const r of ctx.rooms) if (pointInRoomBox(probe, ctx.roomRects.get(r.id)!)) found.add(r.id);
  }
  return ctx.rooms.filter((r) => found.has(r.id));
}

/** Everything that assigns floor though it is no room: outdoor surfaces, voids and vertical runs. */
function nonRoomCover(ctx: LintContext): FaceRoom[] {
  const out: FaceRoom[] = [];
  for (const e of ctx.ir.elements) {
    if (e.kind === "outdoor")
      out.push({
        id: e.id,
        at: e.at,
        size: e.size,
        ...(e.poly ? { poly: e.poly } : {}),
      });
    else if (e.kind === "void") out.push({ id: e.id, at: e.at, size: e.size });
  }
  for (const v of ctx.verticals) out.push({ id: v.id, at: v.at, size: v.size });
  return out;
}

/**
 * `W_FLOOR_UNASSIGNED`: a walled face that rooms (with outdoor surfaces, voids and vertical
 * runs) cover less than `minFaceCoverRatio` of, leaving at least `minUnassignedM2` in no room.
 * A sealed face — no door or cased opening into it and no room on its empty floor — is not
 * reported. One warning per face, in the outline's canonical order, on the first room that
 * borders the empty floor (else the first wall round it).
 */
export const floorUnassigned: LintRule = {
  name: "floor-unassigned",
  family: "enclosure",
  layer: "validity",
  codes: ["W_FLOOR_UNASSIGNED"],
  check(ctx: LintContext): Diagnostic[] {
    if (ctx.rooms.length === 0) return [];
    const wf = facesOf(ctx);
    if (!wf || wf.faces.length === 0) return [];
    // Reported in SOURCE order of the element each warning sits on (a bordering room, else a
    // wall round the face), never the outline's order, which follows coordinates and so moves
    // under a turn or a mirror of the plan. Ties keep the measured areas' order.
    const found: Array<{ key: [number, number, number]; d: Diagnostic }> = [];
    const extra = nonRoomCover(ctx);
    const cover = [...ctx.rooms, ...extra];
    for (let fi = 0; fi < wf.faces.length; fi++) {
      const c = faceCover(wf, fi, cover);
      if (!c) continue;
      const covered = 1 - c.unassigned / c.area;
      if (covered >= ctx.rules.minFaceCoverRatio - EPS) continue;
      if (c.unassigned / 1_000_000 < ctx.rules.minUnassignedM2 - EPS) continue;
      const bordering = c.bordering.filter((k) => k < ctx.rooms.length).map((k) => ctx.rooms[k]!);
      if (bordering.length === 0 && !faceHasOpening(ctx, wf, fi)) continue;
      const walls = wallsRound(ctx, wf, fi);
      const beyond = bordering.length === 0 ? roomsBeyond(ctx, wf, fi) : [];
      const names = (rs: readonly RRoom[]): string => listOf(rs.map((r) => ctx.nameOf(r)));
      const where =
        bordering.length > 0
          ? ` next to ${names(bordering)}`
          : beyond.length > 0
            ? `, behind the walls of ${names(beyond)},`
            : "";
      const pct = Math.floor(covered * 1000) / 10;
      const site = bordering[0] ?? walls[0];
      const authored = walls.filter((w) => w._idAuthored === true).map((w) => `"${w.id}"`);
      const idHint = [
        bordering.length > 0 ? `The rooms are ${bordering.map((r) => `"${r.id}"`).join(", ")}` : "",
        authored.length > 0 ? `the walls round it are ${authored.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      const siteKey =
        bordering.length > 0
          ? ctx.rooms.indexOf(bordering[0]!)
          : ctx.rooms.length + (walls[0] ? ctx.ir.walls.indexOf(walls[0]) : ctx.ir.walls.length);
      found.push({
        key: [siteKey, -Math.round(c.unassigned), -Math.round(c.area)],
        d: {
          severity: "warning",
          code: "W_FLOOR_UNASSIGNED",
          ...(site ? ctx.at(site) : {}),
          message: `${fmt2(Math.round(c.unassigned / 10_000) / 100)} m² of walled floor${where} is in no room: the walls there enclose ${fmt2(Math.round(c.area / 10_000) / 100)} m² and rooms cover ${fmt2(pct)} % of it, under ${fmt2(ctx.rules.minFaceCoverRatio * 100)} %. Floor inside the walls that no room claims has no use, no area and no route the plan can check.`,
          hints: [
            bordering.length > 0
              ? `Extend ${listOf(bordering.map((r) => `"${ctx.labelOf(r)}"`))} over it, draw a room on it, or move the walls in to the rooms' edges.`
              : "Draw a room on it, or move the walls so they enclose only rooms.",
            "If it is open ground (a courtyard, a light well), draw it as an `outdoor` surface; if it is a shaft, draw its stair or lift.",
            "Accept it if the floor is a sealed void: then draw it as a `void`, so the plan says so.",
            ...(idHint ? [`${idHint}.`] : []),
          ],
        },
      });
    }
    found.sort((p, q) => p.key[0] - q.key[0] || p.key[1] - q.key[1] || p.key[2] - q.key[2]);
    return found.map((x) => x.d);
  },
};

/**
 * `W_ROOM_OUTSIDE_SHELL`: a room with at least `minOutsideShellM2` of its floor outside the
 * building — off every walled face and every wall body. Silent on a storey whose walls close
 * no face (no shell: refuse, never guess). One warning per room, in source order.
 */
export const roomOutsideShell: LintRule = {
  name: "room-outside-shell",
  family: "enclosure",
  layer: "validity",
  codes: ["W_ROOM_OUTSIDE_SHELL"],
  check(ctx: LintContext): Diagnostic[] {
    if (ctx.rooms.length === 0) return [];
    const wf = facesOf(ctx);
    if (!wf || wf.faces.length === 0) return [];
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      const o = roomOutside(wf, r);
      if (!o || o.area / 1_000_000 < ctx.rules.minOutsideShellM2 - EPS) continue;
      // A shell to judge against: most of the room's floor (an exact area, not a sample) lies
      // inside walled faces. A room standing mostly outside every face (beside a column ring or
      // a closed WC box, or behind a shell left open at its door) has no closed shell of its
      // own, and the rule says nothing rather than invent one (ADR 0005).
      if (o.inFaces < MIN_INSIDE_SHARE * o.gross) continue;
      const m2 = fmt2(Math.round(o.area / 10_000) / 100);
      const depth = o.depth >= 0.5 ? `, up to ${mm(o.depth)} mm past their outer face` : "";
      out.push({
        severity: "warning",
        code: "W_ROOM_OUTSIDE_SHELL",
        ...ctx.at(r),
        message: `${capFirst(ctx.nameOf(r, "room"))} has ${m2} m² of its floor outside the building's walls${depth}. A room drawn past the outside wall has floor no wall encloses, usually a room resized or moved while its walls stayed put.`,
        hints: [
          `Bring "${ctx.labelOf(r)}" back inside the walls (resize or move it so its edge meets the outside wall), or move the outside wall out to the room's edge.`,
          "If that part is meant to be outside (a terrace, a balcony, a porch), it is not a room: draw it as an `outdoor` surface instead and keep the room inside the walls.",
          `The room is "${r.id}".`,
        ],
      });
    }
    return out;
  },
};
