/**
 * Space-enclosure rules (plan-soundness PS2.4): floor the walls and the rooms disagree about.
 *
 *  - `W_BOUNDARY_NO_WALL` — two rooms meet along an edge with a run longer than a doorway
 *    (`maxBoundaryGapMm`) that no wall, door, cased opening or fixed counter stands on.
 *  - `W_FLOOR_UNASSIGNED` — a closed region of floor the walls enclose (a walled face) that the
 *    rooms cover less than `minFaceCoverRatio` of, by at least `minUnassignedM2`.
 *  - `W_ROOM_OUTSIDE_SHELL` — a room with at least `minOutsideShellM2` of its floor off every
 *    walled face and every wall: outside the building.
 *  - `W_EXTERIOR_RING_OPEN` — exterior walls that stand on a room and enclose nothing, on the
 *    gross internal area's own reading (`src/analyze/gross-area.ts`).
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
import { MAX_GROSS_AREA_TESTS, openExteriorRuns } from "../../analyze/gross-area.js";
import {
  type FaceRoom,
  faceCover,
  roomOutside,
  type WallFaces,
  type WallFacesRefused,
  wallFaces,
} from "../../analyze/wall-faces.js";
import type { Diagnostic } from "../../diagnostics.js";
import { distPointToWallSegment, segmentDirAt, type WallSegment, wallFaceProbes } from "../../geometry.js";
import { edgeMid, edgeTangentAt } from "../../geometry/band.js";
import { collinearOverlapLength } from "../../geometry/polygon.js";
import type { ResolvedPlan, RRoom, RWall } from "../../ir.js";
import { fmt2 } from "../../num-format.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst } from "../../naming.js";
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
  // A run a demolished wall leaves open (B3a) joins the two rooms as an opening does.
  for (const c of [...ctx.connectors, ...ctx.openRuns]) {
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
  stage: "walls",
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
  stage: "openings",
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
  stage: "walls",
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

// ─── W_WALL_END_SHORT ──────────────────────────────────────────────────────────────────

/** ` on level 1` on a plan of several storeys, else nothing. */
const levelWords = (ctx: LintContext): string =>
  (ctx.building.storeyCount ?? 1) > 1 && ctx.ir.level !== undefined ? ` on level ${ctx.ir.level}` : "";

/** A wall named by its kind in a message ("an exterior wall", "a partition"). */
function wallKindWords(category: string): string {
  return category === "exterior" ? "exterior wall" : category === "partition" ? "partition" : `${category} wall`;
}

/** {@link wallKindWords} with its article. */
function aKind(category: string): string {
  const w = wallKindWords(category);
  return /^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`;
}

/** Where a wall segment stands, for a message that must not quote its id: the line it runs on. */
function wallLineWords(s: WallSegment): string {
  if (s.a.x === s.b.x && s.a.y !== s.b.y) return `on the line x ${mm(s.a.x)}`;
  if (s.a.y === s.b.y && s.a.x !== s.b.x) return `on the line y ${mm(s.a.y)}`;
  return `from (${mm(s.a.x)}, ${mm(s.a.y)}) to (${mm(s.b.x)}, ${mm(s.b.y)})`;
}

/** Step (mm) along a wall end's own line when looking for the wall it points at. */
const END_SCAN_STEP_MM = 1;

/**
 * The longest slit (mm) the rule looks for, whatever `wallGapMm` says: the scan is one step per
 * millimetre per free end, so the work is bounded by a count (at most this many steps per end;
 * `AGENTS.md`: budgets are counts), never by a ruleset figure. Far above any real slit.
 */
const MAX_WALL_GAP_SCAN_MM = 500;

/**
 * Whether `p` lies in the DRAWN outline of a wall segment: the band of half its thickness round
 * the centreline, and, on a straight segment, the square cap the renderer adds half a thickness
 * beyond each end. Every segment end is capped, an inner joint too: that only over-covers a
 * corner, so the rule can miss a slit there, never invent one.
 */
function inDrawnWall(p: Point, s: WallSegment): boolean {
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
interface WallEnd {
  e: Point;
  from: Point;
  seg: number;
  which: 0 | 1;
}

/** An open wall's two ends; a closed wall has none. */
function endsOfWall(w: RWall): WallEnd[] {
  if (w.closed || w.points.length < 2) return [];
  const n = w.points.length;
  return [
    { e: w.points[0]!, from: w.points[1]!, seg: 0, which: 0 },
    { e: w.points[n - 1]!, from: w.points[n - 2]!, seg: n - 2, which: 1 },
  ];
}

/** A free end {@link wallEndShort} measures a slit from, and what it stops short of. */
interface ShortEnd {
  wall: RWall;
  which: 0 | 1;
  seg: number;
  gap: number;
  target: WallSegment;
  other: RWall;
}

/**
 * Every free end {@link wallEndShort} measures, in wall order: one wall end stopping a slit of
 * `gap` mm short of another wall. Two walls ending toward each other on one line give one entry
 * each. {@link exteriorRingOpen} reads this too, so a slit is reported by exactly one rule.
 */
function shortEnds(ctx: LintContext): ShortEnd[] {
  const configured = ctx.rules.wallGapMm;
  if (configured === null || !(configured > 0)) return [];
  const limit = Math.min(configured, MAX_WALL_GAP_SCAN_MM);
  const out: ShortEnd[] = [];
  for (const w of ctx.ir.walls) {
    for (const { e, from, seg, which } of endsOfWall(w)) {
      if (w.arcs?.[seg]) continue;
      const len = Math.hypot(e.x - from.x, e.y - from.y);
      if (len < EPS) continue;
      const d = { x: (e.x - from.x) / len, y: (e.y - from.y) / len };
      // The drawn end: the square cap's face, half a thickness past the last point.
      const tip = { x: e.x + (d.x * w.thickness) / 2, y: e.y + (d.y * w.thickness) / 2 };
      const near = ctx.wallSegs.filter(
        (s) => s.wallId !== w.id && !s.arc && distPointToWallSegment(tip, s) <= limit + s.thickness + 1,
      );
      if (near.length === 0) continue;
      if (near.some((s) => inDrawnWall(tip, s))) continue;
      let hit: { gap: number; s: WallSegment } | undefined;
      for (let g = END_SCAN_STEP_MM; g <= limit && !hit; g += END_SCAN_STEP_MM) {
        const p = { x: tip.x + d.x * g, y: tip.y + d.y * g };
        const s = near.find((o) => inDrawnWall(p, o));
        if (s) hit = { gap: g, s };
      }
      if (!hit) continue;
      const other = ctx.ir.walls.find((x) => x.id === hit.s.wallId);
      if (!other) continue;
      out.push({ wall: w, which, seg, gap: hit.gap, target: hit.s, other });
    }
  }
  return out;
}

/**
 * `W_WALL_END_SHORT`: a wall whose free end stops a sliver short of another wall it runs toward,
 * measured on the DRAWING. The renderer caps every free end square, half the wall's thickness
 * beyond its last point, so the drawn end is that cap's face; the rule starts there and walks the
 * wall's own line on, one millimetre at a time (at most {@link MAX_WALL_GAP_SCAN_MM}), to the
 * first point inside another wall's drawn outline ({@link inDrawnWall}). The step count is the
 * drawn slit, in whole millimetres, reported only when it is above 0 and at most `wallGapMm`: a
 * cap already in or against another wall's outline is a join, not a slit. A wall that ends in the
 * open further off is a stub, a peninsula or a doorway's jamb, never judged.
 *
 * Per free end of every open, straight-ended wall (a closed wall has none), against every OTHER
 * wall's STRAIGHT segments (a curved wall is not a target: its drawn cap and band are not worth
 * approximating, and `examples/hexagon-pavilion`'s spokes, 50 mm from its drum as drawn, stay unjudged).
 * Two walls ending toward each other on one line are one finding. A curved end
 * segment is not judged (no straight line to carry on). Walls are named by kind and the line they
 * run on, and the storey on a plan of several; ids are in the hints only.
 */
export const wallEndShort: LintRule = {
  name: "wall-end-short",
  family: "enclosure",
  layer: "validity",
  stage: "walls",
  codes: ["W_WALL_END_SHORT"],
  check(ctx: LintContext): Diagnostic[] {
    const level = levelWords(ctx);
    const out: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const { wall: w, seg, gap, target, other } of shortEnds(ctx)) {
      const key = `${[w.id, other.id].sort().join("|")}|${gap}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mine = ctx.wallSegs.find((s) => s.wallId === w.id && s.index === seg);
      if (!mine) continue;
      const ids = [w, other].filter((x) => x._idAuthored === true).map((x) => `"${x.id}"`);
      out.push({
        severity: "warning",
        code: "W_WALL_END_SHORT",
        ...ctx.at(w),
        message: `${capFirst(aKind(w.category))} ${wallLineWords(mine)} ends ${mm(gap)} mm short of ${aKind(other.category)} ${wallLineWords(target)}${level}, as drawn. The two do not meet, so the plan shows a slit of ${mm(gap)} mm between them and the walls do not close.`,
        hints: [
          `Extend the end of the ${wallKindWords(w.category)} to the face of the ${wallKindWords(other.category)}, or into it so they join; if the slit is a real opening, draw a door or an \`opening\` there instead.`,
          ...(ids.length > 0 ? [`The walls are ${ids.join(" and ")}.`] : []),
        ],
      });
    }
    return out;
  },
};

// ─── W_EXTERIOR_RING_OPEN ──────────────────────────────────────────────────────────────

/** An open exterior run's end that no wall meets. `order` is its place in source order. */
interface FreeEnd {
  wall: RWall;
  at: Point;
  /** Which of the shells it ends. */
  shell: number;
  order: number;
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
const isStraightRun = (run: readonly RWall[]): boolean =>
  !run.some((w) => w.arcs?.some((a) => a !== undefined)) && onOneLine(run.flatMap((w) => w.points));

/**
 * Does the run stand on a room's edge: a straight wall parallel to a stretch of the room's outline
 * with its body within {@link WALL_BODY_SLACK_MM} of it (the run measured on a room edge, so a wall
 * that only touches a corner does not count), or a curved wall against a vertex of the outline? A
 * run that stands on no room is a garden wall, whatever it is called.
 */
function runStandsOnRoom(ctx: LintContext, run: readonly RWall[]): boolean {
  const ids = new Set(run.map((w) => w.id));
  const segs = ctx.wallSegs.filter((s) => ids.has(s.wallId));
  const straight = segs.filter((s) => !s.arc);
  const curved = segs.filter((s) => s.arc);
  return ctx.rooms.some((r) => {
    const ring = roomRing(ctx.roomRects.get(r.id)!);
    return ring.some(
      (a, i) =>
        edgeWallCover(a, ring[(i + 1) % ring.length]!, straight, ctx.rules.tolMm, {
          halfGap: 0,
          slack: WALL_BODY_SLACK_MM,
        }).length > 0 || curved.some((s) => distPointToWallSegment(a, s) <= s.thickness / 2 + WALL_BODY_SLACK_MM),
    );
  });
}

/**
 * Does the drawn end of `w` touch another wall of any kind? The end is the square of its cap,
 * half a thickness long and a thickness wide past the last point, read at nine stations; the wall's
 * own last segment does not count. A wall of another category closes the enclosure as well as an
 * exterior one: nothing is open there, however the plan classes the wall.
 */
function endMeetsWall(ctx: LintContext, w: RWall, end: WallEnd, own: WallSegment): boolean {
  const tangent = segmentDirAt(own, end.e);
  const d = end.which === 0 ? { x: -tangent.x, y: -tangent.y } : tangent;
  const h = w.thickness / 2;
  const others = ctx.wallSegs.filter((s) => s.thickness > 0 && s !== own);
  for (const along of [0, h / 2, h]) {
    for (const across of [-h, 0, h]) {
      const p = { x: end.e.x + d.x * along - d.y * across, y: end.e.y + d.y * along + d.x * across };
      if (others.some((s) => (s.arc ? distPointToWallSegment(p, s) <= s.thickness / 2 + EPS : inDrawnWall(p, s))))
        return true;
    }
  }
  return false;
}

/** Plain multiplication: the same value on every engine, and whichever way round the two points are. */
function squaredGap(p: Point, q: Point): number {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

/**
 * The gaps the free ends leave: the nearest two ends first, then the next nearest of those left.
 * Two ends of one straight run are its length, never a gap. Squared distances, so a turn or a
 * mirror of the plan cannot change a tie; ties fall to source order.
 */
function gapsBetween(ends: readonly FreeEnd[], straightShells: readonly boolean[]): Array<[FreeEnd, FreeEnd]> {
  const pairs: Array<{ a: number; b: number; d2: number }> = [];
  for (let a = 0; a < ends.length; a++) {
    for (let b = a + 1; b < ends.length; b++) {
      const p = ends[a]!;
      const q = ends[b]!;
      if (p.shell === q.shell && straightShells[p.shell]) continue;
      pairs.push({ a, b, d2: squaredGap(p.at, q.at) });
    }
  }
  pairs.sort((p, q) => p.d2 - q.d2 || p.a - q.a || p.b - q.b);
  const used = new Set<number>();
  const out: Array<[FreeEnd, FreeEnd]> = [];
  for (const { a, b } of pairs) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a).add(b);
    out.push([ends[a]!, ends[b]!]);
  }
  return out.sort((p, q) => p[0].order - q[0].order || p[1].order - q[1].order);
}

/** The last clause of every {@link exteriorRingOpen} message. */
const NO_SHELL = "so the shell encloses no floor and counts in no gross internal area";

/** What to do about a run that is not a shell, and which walls to edit. */
function ringHints(walls: readonly RWall[]): string[] {
  const ids = [...new Set(walls.filter((w) => w._idAuthored === true).map((w) => `"${w.id}"`))];
  return [
    "If the gap is a way in, draw the wall across it and put a `door` or an `opening` in that wall.",
    "If this run is not the building's shell (a garden wall, a carport), give it another category: only `exterior` walls are read as the shell.",
    ...(ids.length > 0 ? [`${ids.length > 1 ? "The walls are" : "The wall is"} ${ids.join(" and ")}.`] : []),
  ];
}

/**
 * `W_EXTERIOR_RING_OPEN`: exterior walls that stand on a room and close nothing. The closure is
 * {@link openExteriorRuns}, the reading `describe()`'s gross internal area adds nothing for, so a
 * plan this rule names is one `gross_internal_area_omitted` hints at, or, beside a closed building,
 * a second building the figure leaves out. A closed ring with a stub built off it encloses floor
 * and is not a finding; a run standing free inside a building is not outermost.
 *
 * **What it refuses, and why.** A storey with no room (nothing says the wall is a shell) or no
 * exterior wall. A run that stands on no room (a garden wall). Runs that all lie on one straight
 * line, which no ring is (a lean-to, a boundary wall). An end that meets a wall of any category:
 * a shell finished in partitions is closed, and nothing is open there, though the area still
 * reads no ring. An end `W_WALL_END_SHORT` measures: that slit is its finding, read through the
 * one {@link shortEnds} scan, so `wallGapMm: null` hands the slit to this rule rather than drop it.
 * A `demolish` wall is not in `ir.walls`: it closes nothing, so a shell it leaves open is named.
 *
 * One warning per gap, in source order, on the wall the gap's earlier end belongs to (one end with
 * no other end to pair it is named alone). The gap is quoted between centreline ends, the points
 * the source writes; the drawing shows it narrower by the walls' caps and bodies. Work is counted
 * before it runs ({@link MAX_GROSS_AREA_TESTS}); past the count the storey is filed as an
 * `enclosure-budget` skip. No machine fix: which wall moves is a design decision.
 */
export const exteriorRingOpen: LintRule = {
  name: "exterior-ring-open",
  family: "enclosure",
  layer: "validity",
  stage: "walls",
  codes: ["W_EXTERIOR_RING_OPEN"],
  check(ctx: LintContext): Diagnostic[] {
    if (ctx.rooms.length === 0) return [];
    const runs = openExteriorRuns(ctx.ir.walls);
    const refuse = (): Diagnostic[] => {
      ctx.skip("enclosure-budget", undefined, "regions");
      return [];
    };
    if (runs === "too-much-work") return refuse();
    if (runs.length === 0) return [];
    // Charged before the work: every open wall's two ends against every segment, every room
    // edge against every segment of the runs.
    const ringEdges = ctx.rooms.reduce((n, r) => n + roomRing(ctx.roomRects.get(r.id)!).length, 0);
    const open = runs.reduce((n, run) => n + run.length, 0);
    if ((2 * open + ringEdges) * ctx.wallSegs.length > MAX_GROSS_AREA_TESTS) return refuse();
    const shells = runs.filter((run) => runStandsOnRoom(ctx, run));
    if (shells.length === 0 || isStraightRun(shells.flat())) return [];

    const inOrder = new Map(ctx.ir.walls.map((w, i) => [w.id, i] as const));
    const slits = new Set(shortEnds(ctx).map((s) => `${s.wall.id}|${s.which}`));
    const ends: FreeEnd[] = [];
    shells.forEach((run, shell) => {
      for (const w of run) {
        for (const end of endsOfWall(w)) {
          if (slits.has(`${w.id}|${end.which}`)) continue;
          const own = ctx.wallSegs.find((s) => s.wallId === w.id && s.index === end.seg);
          if (!own || endMeetsWall(ctx, w, end, own)) continue;
          ends.push({ wall: w, at: end.e, shell, order: 2 * inOrder.get(w.id)! + end.which });
        }
      }
    });
    if (ends.length * ends.length > MAX_GROSS_AREA_TESTS) return refuse();
    ends.sort((p, q) => p.order - q.order);

    const straight = shells.map(isStraightRun);
    const level = levelWords(ctx);
    const gaps = gapsBetween(ends, straight);
    if (gaps.length === 0) {
      return ends
        .filter((end) => !straight[end.shell])
        .map((end) => ({
          severity: "warning" as const,
          code: "W_EXTERIOR_RING_OPEN",
          ...ctx.at(end.wall),
          message: `The exterior walls do not close: a run stops at (${mm(end.at.x)}, ${mm(end.at.y)})${level} with no wall to meet there, ${NO_SHELL}.`,
          hints: ["Carry the wall on until it meets another wall.", ...ringHints([end.wall])],
        }));
    }
    return gaps.map(([a, b]) => {
      // West or north end first, so the quoted wall reads the way a person writes one.
      const [p, q] = [a.at, b.at].sort((m, k) => Math.round(m.x) - Math.round(k.x) || m.y - k.y) as [Point, Point];
      const span = Math.sqrt(squaredGap(p, q));
      const stmt = `wall exterior thickness ${mm(a.wall.thickness)} { (${mm(p.x)},${mm(p.y)}) (${mm(q.x)},${mm(q.y)}) }`;
      const axial = Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS;
      return {
        severity: "warning" as const,
        code: "W_EXTERIOR_RING_OPEN",
        ...ctx.at(a.wall),
        message: `The exterior walls do not close: their ends stop ${mm(span)} mm apart ${runWords(p, q)}, centreline to centreline${level}. No wall joins them, ${NO_SHELL}.`,
        hints: [
          axial
            ? `Draw the missing run, e.g. \`${stmt}\`, or carry one wall on to meet the other.`
            : "Carry the walls on until their ends meet.",
          ...ringHints([a.wall, b.wall]),
        ],
      };
    });
  },
};
