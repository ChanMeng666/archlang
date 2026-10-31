/**
 * Opening rules: an opening and the walls around it (plan-soundness PS2.1–PS2.3).
 *
 *  - `W_OPENING_AT_JUNCTION` — another wall's body inside an opening's span, or a jamb's nib
 *    to a meeting wall's face shorter than `max(minJunctionNibMm, host thickness × 0.5)`.
 *  - `W_OPENING_OVERLAP` — two openings on one run whose spans intersect, or whose pier is
 *    thinner than a mullion (`minMullionMm`).
 *  - `W_CONNECTOR_AMBIGUOUS` — a door or cased opening whose access edge is `ambiguous`, or
 *    whose clear span covers more than one room on a face of its host (`straddles`).
 *
 * Every position is read off the wall SHAPES: the along-run coordinate of a jamb is the
 * projection onto the host segment (an arc length on a curve, the same `arcOpeningVoid`
 * `W_DOOR_NEAR_CORNER` measures with), and a meeting wall's footprint on the host is where its
 * two face lines cross the host's face line. No bounding box, no centroid, no id or label read
 * for meaning; ids reach only the hints.
 *
 * Every move a hint quotes is searched for and then checked: the moved span stays on its run,
 * keeps the nib to every meeting wall, keeps a mullion to every other opening on the run and,
 * for a door, keeps `W_DOOR_NEAR_CORNER`'s nib at a corner. With grid snapping, the snapped
 * position is the one checked. A direction with no such position is said to have none.
 * No fix is machine-applicable: every remedy moves something the author placed, and there
 * are always at least two (either direction, or the other wall).
 *
 * The two leaves of a double door move as one opening (the pair `W_OPENING_OVERLAP` does not
 * report): the search keeps them together and the hint quotes a clause for each leaf.
 *
 * **Known limits**, each measured and left as it is:
 *  - Two walls that meet END TO END on one line are two runs, never one, so openings either
 *    side of that joint are not paired (doors at 3200–4000 and 4000–4800, a 0 mm pier
 *    between them, raise nothing).
 *  - `W_OPENING_OVERLAP` reports per PAIR, so N openings stacked on one run raise O(N²)
 *    warnings (300 windows at one point: about 30,000 warnings, 3 s).
 *  - A curved host is measured only at its two ends ({@link junctionsOn}).
 *  - A move hint for an opening drawn by a placed component gives world coordinates and no
 *    clause; the edit is in the component's own frame.
 *  - The leaves of a double door move together only when both sit on one segment.
 */

import { isDerivedWall, openingClauseOf, wallRef } from "../../wall-ref.js";
import {
  type AccessGraph,
  buildDoorAccessGraph,
  connectorConnection,
  connectorFaces,
  EXTERIOR_NODE,
  type FaceReading,
  faceLengthInRoom,
  JAMB_PROBE_INSET_MM,
} from "../../analyze.js";
import type { Point } from "../../ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import { doorSwing, isDoubleDoorPair, segmentLength, segmentPointAlong, type WallSegment } from "../../geometry.js";
import { arcOpeningVoid } from "../../geometry/arc-band.js";
import type { LintContext, LintRule } from "../context.js";
import { mm } from "../measure.js";
import { type Hosted, KIND_WORD, openBoundaryPhrase, openingName, wallPhrase } from "../element-phrases.js";
import { isCorner, tightestCorner } from "./doors.js";
import {
  atFreeEnd,
  FLUSH_MM,
  type JunctionSpan,
  MEET_TOL_MM,
  openBoundaryIds,
  PARALLEL_SIN,
  sameSeg,
  standingJunctionSpans,
} from "../../opening-junctions.js";
import { relationalClause } from "../../opening-relation.js";

/** Float dust on whole-millimetre geometry. */
const EPS = 1e-6;

/** One opening placed on its host run: its along-run span on `seg`, from the shape. */
interface OnRun {
  el: Hosted;
  /** Source order among doors, windows and cased openings (the `ir.elements` index). */
  order: number;
  seg: WallSegment;
  /** Along-run jamb coordinates on `seg` (mm from `seg.a`; arc length on a curve). */
  lo: number;
  hi: number;
}

/** A meeting wall's footprint on a host run, in the host's along-run coordinates. */
interface Junction extends JunctionSpan {
  /** The host end this wall meets when that end is a CORNER (`isCorner`), else null. */
  corner: "a" | "b" | null;
}

const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const unitOf = (v: Point): Point | null => {
  const l = Math.hypot(v.x, v.y);
  return l > 0 ? { x: v.x / l, y: v.y / l } : null;
};

/**
 * Where an opening sits on its host segment, or null when it is not on it (an `at (x,y)`
 * element off its wall is `W_*_OFF_WALL`'s report). The on-host tolerance is the access
 * graph's own (`connectorConnection`).
 */
function onRun(el: Hosted, order: number): OnRun | null {
  const seg = el.host;
  if (!seg) return null;
  if (seg.arc) {
    const span = arcOpeningVoid(seg.arc, el.at, el.width, seg.thickness);
    return span ? { el, order, seg, lo: span[0], hi: span[1] } : null;
  }
  const u = unitOf(sub(seg.b, seg.a));
  if (!u) return null;
  const rel = sub(el.at, seg.a);
  if (Math.abs(cross(u, rel)) > seg.thickness / 2 + Math.max(seg.thickness, 1)) return null;
  const s = dot(rel, u);
  return { el, order, seg, lo: s - el.width / 2, hi: s + el.width / 2 };
}

/** Every door, window and cased opening that sits on its host, in source order. */
function openingsOnRuns(ctx: LintContext): OnRun[] {
  const out: OnRun[] = [];
  ctx.ir.elements.forEach((e, i) => {
    if (e.kind !== "door" && e.kind !== "window" && e.kind !== "opening") return;
    const r = onRun(e, i);
    if (r) out.push(r);
  });
  return out;
}

/** The host end a meeting wall touches, when that end is a corner of the host's run. */
function cornerEnd(host: WallSegment, s: WallSegment, all: readonly WallSegment[]): "a" | "b" | null {
  const tol = Math.max(1, host.thickness / 2);
  for (const end of ["a", "b"] as const) {
    const p = host[end];
    const touches = [s.a, s.b].some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol);
    if (touches && isCorner(host, end, all)) return end;
  }
  return null;
}

/**
 * Every other standing wall segment's footprint on `host`'s run ({@link standingJunctionSpans},
 * the measure the resolver's relational openings share), with the host end each one meets when
 * that end is a corner.
 */
function junctionsOn(host: WallSegment, all: readonly WallSegment[], open: ReadonlySet<string>): Junction[] {
  return standingJunctionSpans(host, all, open).map((j) => ({ ...j, corner: cornerEnd(host, j.wall, all) }));
}

const NO_OPEN_BOUNDARIES: ReadonlySet<string> = new Set();

/**
 * The junctions on an opening's host run, memoised per host segment for one rule run. An opening
 * an `open between` clause derived keeps every meeting wall, open boundaries too: its jambs were
 * set on the faces of all of them (`faceAt`, `src/room-tiling.ts`), and the thickest one's pier
 * excuses a thinner one beside it. Every other opening reads what stands.
 */
function junctionLookup(ctx: LintContext): (o: OnRun) => Junction[] {
  const cache = new Map<string, Junction[]>();
  const open = openBoundaryIds(ctx.ir.walls);
  return ({ el, seg }) => {
    const derived = el.kind === "opening" && el._derived !== undefined;
    const k = `${seg.wallId}#${seg.index}#${derived}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const v = junctionsOn(seg, ctx.wallSegs, derived ? NO_OPEN_BOUNDARIES : open);
    cache.set(k, v);
    return v;
  };
}

/** Does `W_DOOR_NEAR_CORNER` report this door? Its own test ({@link tightestCorner}). */
const cornerReported = (ctx: LintContext, o: OnRun): boolean =>
  o.el.kind === "door" &&
  tightestCorner(o.el, o.seg, ctx.wallSegs, o.seg.thickness * ctx.rules.minCornerNibRatio) !== null;

/**
 * The junctions an opening is REPORTED against. A door that `W_DOOR_NEAR_CORNER` reports is
 * not measured at its host's corners here (one defect, one warning). A door that rule passes
 * is: its one thickness to the corner's CENTRELINE point can leave less than this rule's nib
 * at the FACE (a 100 mm partition asks 100 mm to the corner point, 50 mm at the face, against
 * this rule's 100), and that door would otherwise fall through both rules.
 */
const junctionsFor = (ctx: LintContext, o: OnRun, js: readonly Junction[]): Junction[] =>
  cornerReported(ctx, o) ? js.filter((j) => j.corner === null) : [...js];

/** The nib an opening of this host needs: `max(minJunctionNibMm, host thickness × ratio)`. */
const nibNeed = (ctx: LintContext, seg: WallSegment): number =>
  Math.max(ctx.rules.minJunctionNibMm, seg.thickness * ctx.rules.junctionNibThicknessRatio);

// ─── naming ────────────────────────────────────────────────────────────────────────────

/** A point on the host run, as the coordinate a reader looks up: `x 3050` on a horizontal
 *  run, `y 3650` on a vertical one, `(x, y)` otherwise. */
function runCoord(seg: WallSegment, s: number): string {
  const p = segmentPointAlong(seg, s);
  if (!seg.arc && seg.a.y === seg.b.y) return `x ${mm(p.x)}`;
  if (!seg.arc && seg.a.x === seg.b.x) return `y ${mm(p.y)}`;
  return `(${mm(p.x)}, ${mm(p.y)})`;
}

/** A span on the host run: `x 3100–4000`, or `(x, y)–(x, y)` off the axes. */
function runSpan(seg: WallSegment, lo: number, hi: number): string {
  const a = runCoord(seg, lo);
  const b = runCoord(seg, hi);
  if (a.startsWith("(")) return `${a}–${b}`;
  const axis = a.slice(0, 2);
  const [p, q] = [a.slice(2), b.slice(2)].map(Number).sort((m, k) => m - k);
  return `${axis}${mm(p!)}–${mm(q!)}`;
}

/** The rooms an access graph reaches from outside. */
const reached = (g: AccessGraph): Set<string> => new Set(g.rooms.filter((r) => r.reachable).map((r) => r.id));

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** `half of` / `all of` / `0.75 ×` — the thickness limb's ratio, as prose. */
const ratioWords = (r: number): string => (r === 0.5 ? "half" : r === 1 ? "all of" : `${r} ×`);

/** One sentence per distinct fact, in order (two walls on one line read the same). */
const distinct = (xs: readonly string[]): string[] => xs.filter((x, i) => xs.indexOf(x) === i);

// ─── the move search ───────────────────────────────────────────────────────────────────

/** An along-run interval the moved span must not enter (open intervals). */
type Keepout = { lo: number; hi: number };

/** What a move carries: one opening, or both leaves of a double door, as one along-run span
 *  in `leaves[0]`'s coordinates (`leaves[0]` is the opening the hint is about). */
interface MoveUnit {
  leaves: OnRun[];
  lo: number;
  hi: number;
}

/** `o`, with the other leaf of its double door when that leaf is on the same segment: the
 *  pair `W_OPENING_OVERLAP` treats as one opening, so a move never splits it. */
function moveUnit(o: OnRun, all: readonly OnRun[]): MoveUnit {
  const leaves = [
    o,
    ...all.filter(
      (p) =>
        p !== o &&
        sameSeg(p.seg, o.seg) &&
        Math.min(o.hi, p.hi) - Math.max(o.lo, p.lo) <= EPS &&
        doubleDoor(o.el, p.el),
    ),
  ];
  return { leaves, lo: Math.min(...leaves.map((l) => l.lo)), hi: Math.max(...leaves.map((l) => l.hi)) };
}

/**
 * Every along-run keep-out for moving `u` along its run: the run's ends; each meeting wall,
 * corners included, grown by the nib (`max(minJunctionNibMm, host thickness ×
 * junctionNibThicknessRatio)`), since a quoted position must pass this rule whatever
 * `W_DOOR_NEAR_CORNER` says; each other opening on the run grown by a mullion; and for a door
 * the corner nib `W_DOOR_NEAR_CORNER` asks for.
 */
function keepouts(ctx: LintContext, o: OnRun, u: MoveUnit, all: readonly OnRun[], js: readonly Junction[]): Keepout[] {
  const len = segmentLength(o.seg);
  const need = nibNeed(ctx, o.seg);
  const out: Keepout[] = [
    { lo: -Infinity, hi: 0 },
    { lo: len, hi: Infinity },
  ];
  for (const j of js) out.push({ lo: j.lo - need, hi: j.hi + need });
  for (const p of all) {
    if (u.leaves.includes(p) || !sameRun(o, p)) continue;
    const q = alongOf(o, p);
    out.push({ lo: q.lo - ctx.rules.minMullionMm, hi: q.hi + ctx.rules.minMullionMm });
  }
  if (o.el.kind === "door") {
    const corner = o.seg.thickness * ctx.rules.minCornerNibRatio;
    if (isCorner(o.seg, "a", ctx.wallSegs)) out.push({ lo: -Infinity, hi: corner });
    if (isCorner(o.seg, "b", ctx.wallSegs)) out.push({ lo: len - corner, hi: Infinity });
  }
  return out;
}

const hits = (k: Keepout, lo: number, hi: number): boolean => k.lo < hi - EPS && k.hi > lo + EPS;

/** The along-run centre `o` lands at when moved by `shift`, after the resolver's grid snap. */
function snappedCentre(ctx: LintContext, o: OnRun, shift: number): { s: number; at: Point } {
  const c = (o.lo + o.hi) / 2 + shift;
  const g = ctx.ir.grid;
  const p = segmentPointAlong(o.seg, c);
  if (!(g > 0)) return { s: c, at: p };
  const at = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  if (o.seg.arc) {
    const span = arcOpeningVoid(o.seg.arc, at, 0, o.seg.thickness);
    return { s: span ? span[0] : Number.NaN, at };
  }
  const u = unitOf(sub(o.seg.b, o.seg.a))!;
  // Off the run after snapping (an angled wall): no checked position here.
  if (Math.abs(cross(u, sub(at, o.seg.a))) > MEET_TOL_MM) return { s: Number.NaN, at };
  return { s: dot(sub(at, o.seg.a), u), at };
}

/** Where one leaf of a moved unit lands: its grid-snapped point and along-run centre. */
interface Placed {
  leaf: OnRun;
  at: Point;
  s: number;
}

/**
 * The smallest move of `u` in direction `dir` (towards `seg.b` for +1) that clears every
 * keep-out, or null. Walks the keep-outs it collides with, at most once each, then checks the
 * grid-snapped position (every leaf moved by the same snapped amount); a count, never a time.
 */
function clearMove(
  ctx: LintContext,
  u: MoveUnit,
  ks: readonly Keepout[],
  dir: 1 | -1,
): { shift: number; lo: number; hi: number; placed: Placed[] } | null {
  const g = ctx.ir.grid > 0 ? ctx.ir.grid : 1;
  const centre = (l: OnRun): number => (l.lo + l.hi) / 2;
  let shift = 0;
  for (let step = 0; step <= 2 * ks.length + 4; step++) {
    const lo = u.lo + shift;
    const hi = u.hi + shift;
    const blocking = ks.filter((k) => hits(k, lo, hi));
    if (blocking.length === 0) {
      if (shift === 0) return null; // nothing to clear
      const q = Math.ceil(Math.abs(shift) / g - EPS) * g * dir;
      const placed: Placed[] = u.leaves.map((leaf) => ({ leaf, ...snappedCentre(ctx, leaf, q) }));
      if (placed.some((p) => Number.isNaN(p.s))) return null;
      const d = placed[0]!.s - centre(u.leaves[0]!);
      const nlo = u.lo + d;
      const nhi = u.hi + d;
      // A leaf that snaps by a different amount would pull the pair apart.
      const apart = placed.some((p) => Math.abs(p.s - centre(p.leaf) - d) > EPS);
      if (apart || ks.some((k) => hits(k, nlo, nhi))) {
        shift = q + dir * g;
        continue;
      }
      return { shift: Math.abs(d), lo: nlo, hi: nhi, placed };
    }
    const edge =
      dir > 0 ? Math.max(...blocking.map((k) => k.hi)) - u.lo : Math.min(...blocking.map((k) => k.lo)) - u.hi;
    if (!Number.isFinite(edge)) return null; // ran off the end of the run
    shift = edge;
  }
  return null;
}

/** The nearest meeting-wall face to a span, in mm, and whose it is (for "that leaves N mm"). */
function nearestNib(lo: number, hi: number, js: readonly Junction[]): { nib: number; j: Junction } | null {
  let best: { nib: number; j: Junction } | null = null;
  for (const j of js) {
    const nib = j.hi <= lo ? lo - j.hi : j.lo >= hi ? j.lo - hi : 0;
    if (best === null || nib < best.nib) best = { nib, j };
  }
  return best;
}

/** The cumulative run position of an along-run coordinate on `seg`, for `on <wall> at`. */
function wallPosition(ctx: LintContext, seg: WallSegment, s: number): number {
  let acc = 0;
  for (const t of ctx.wallSegs) {
    if (t.wallId !== seg.wallId) continue;
    if (t.index === seg.index) break;
    acc += segmentLength(t);
  }
  return acc + s;
}

/** The source clause that puts `el` at `at` — in the form it was written in. */
function placeClause(ctx: LintContext, o: OnRun, at: Point, s: number): string {
  // A relational opening is quoted in its own form, measured from the start of its run
  // (ADR 0028 §5): never the internal name of its host.
  const rel = o.el._relation ? relationalClause(o.el._relation, ctx.rooms, at) : undefined;
  if (rel !== undefined) return rel;
  // A derived host has no id to write (ADR 0028 §3): the clause is then the point.
  return o.el._placement === "attached" && !isDerivedWall(ctx.ir.walls, o.seg)
    ? `on ${o.seg.wallId} at ${mm(wallPosition(ctx, o.seg, s))}`
    : `at (${mm(at.x)}, ${mm(at.y)})`;
}

/** The direction word for a move along `seg`: towards the run's end it heads for. */
const towards = (seg: WallSegment, dir: 1 | -1): string => {
  const p = dir > 0 ? seg.b : seg.a;
  return `towards (${mm(p.x)}, ${mm(p.y)})`;
};

/**
 * A quoted move's precondition. Given where each moved leaf lands, it returns what was
 * measured there as a phrase (`still opens between "A" and "B"`), or null for a move not to
 * quote. The hint says exactly that phrase, so it never claims more than the check measured.
 */
type MoveCheck = (moved: ReadonlyArray<{ el: Hosted; at: Point }>) => string | null;

/** The spaces a connection joins, by label: `"A" and "B"`, `the outside and "B"`. */
function joined(ctx: LintContext, between: readonly string[]): string {
  const names = between
    .filter((x) => x !== "")
    .map((id) => {
      if (id === EXTERIOR_NODE) return "the outside";
      const r = ctx.rooms.find((x) => x.id === id);
      // A HINT names a room by its quoted label or, with none, its quoted id (the handle to edit by).
      return r ? `"${ctx.labelOf(r)}"` : "no room";
    });
  if (names.length <= 1) return names[0] ?? "no room";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

/**
 * Does each moved leaf still serve exactly the rooms it serves now, with each side of it in
 * one room? The adjacency precondition every quoted move is held to: a move that clears the
 * junction by carrying a door into a different room is a different plan, not a fix.
 */
function servesSame(ctx: LintContext): MoveCheck {
  const key = (b: readonly string[]): string => [...b].sort().join("|");
  return (moved) => {
    let first: readonly string[] | null = null;
    for (const { el, at } of moved) {
      const before = key(connectorConnection(el, ctx.roomRects, ctx.rules.tolMm).between);
      const r = connectorConnection({ ...el, at }, ctx.roomRects, ctx.rules.tolMm);
      if (r.ambiguous || r.straddles !== undefined || key(r.between) !== before) return null;
      first ??= r.between;
    }
    return first ? `still opens between ${joined(ctx, first)}` : null;
  };
}

/** The longest stretch of the run free of every keep-out, among those the span overlaps. */
function widestStretch(o: { lo: number; hi: number }, ks: readonly Keepout[]): number {
  const cuts = ks.map((k) => ({ lo: k.lo, hi: k.hi })).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  let best = 0;
  let from = -Infinity;
  for (const k of [...cuts, { lo: Infinity, hi: Infinity }]) {
    if (k.lo > from && Number.isFinite(from)) {
      const overlaps = Math.min(k.lo, o.hi) > Math.max(from, o.lo);
      if (overlaps) best = Math.max(best, k.lo - from);
    }
    from = Math.max(from, k.hi);
  }
  return best;
}

/**
 * The checked moves for `o`, as hints: one per direction that has a clearing position, each
 * with the span it lands on, the nib it leaves and the source clause; or, when neither
 * direction has one, the measured stretch of wall that is free and how wide an opening it
 * holds. `check` is the adjacency precondition ({@link servesSame} by default), and its
 * phrase is what the hint says the moved opening does. A double door moves as one: the hint
 * names both leaves and quotes a clause for each.
 */
function moveHints(
  ctx: LintContext,
  o: OnRun,
  all: readonly OnRun[],
  js: readonly Junction[],
  what: string,
  check: MoveCheck = servesSame(ctx),
): string[] {
  const u = moveUnit(o, all);
  const pair = u.leaves.length > 1;
  const subject = pair ? `${what} with its other leaf (one double door)` : what;
  const ks = keepouts(ctx, o, u, all, js);
  const out: string[] = [];
  for (const dir of [-1, 1] as const) {
    const m = clearMove(ctx, u, ks, dir);
    if (!m) continue;
    const result = check(m.placed.map((p) => ({ el: p.leaf.el, at: p.at })));
    if (result === null) continue;
    const near = nearestNib(m.lo, m.hi, js);
    const leaves =
      near === null
        ? ""
        : `, ${mm(near.nib)} mm from ${near.j.boundary ? "the edge of the nearest open boundary" : "the nearest meeting wall's face"}`;
    const clause = (p: Placed): string => `\`${placeClause(ctx, p.leaf, p.at, p.s)}\``;
    const edit =
      o.el._instance !== undefined
        ? ""
        : pair
          ? ` — ${m.placed.map((p) => `${clause(p)} for "${p.leaf.el.id}"`).join(" and ")}`
          : ` — ${clause(m.placed[0]!)}`;
    out.push(
      `Move ${subject} ${mm(m.shift)} mm along the wall ${towards(o.seg, dir)}, to ${runSpan(o.seg, m.lo, m.hi)}${leaves}; that position was checked clear of every junction and opening on the run, and ${pair ? "the pair" : "it"} ${result}${edit}.`,
    );
  }
  if (out.length === 0) {
    const free = widestStretch(u, ks);
    out.push(
      `No position along this run clears it and still serves the same rooms. ${
        free > 0
          ? `The longest clear stretch of wall it overlaps, after the nibs and mullions, is ${mm(free)} mm, against its ${mm(u.hi - u.lo)} mm span.`
          : "No stretch of wall it overlaps is clear once the nibs and mullions are kept."
      } Move it to another wall the same rooms share, or move the wall that meets it.`,
    );
  }
  if (o.el._instance !== undefined)
    out.push("It is drawn by a placed component, so make the move in the component's own frame.");
  return out;
}

/** The id an agent edits by, for the hints. */
const idHint = (ctx: LintContext, el: Hosted): string => {
  const on = wallRef(ctx.ir.walls, el.host ?? { wallId: "" });
  const clause = openingClauseOf(el);
  return clause
    ? `The opening is derived by ${clause} of \`walls from rooms\` (its \`width\` is set there), on ${on}.`
    : `The ${KIND_WORD[el.kind]} is "${el.id}" on ${on}.`;
};

// ─── PS2.1 ─────────────────────────────────────────────────────────────────────────────

/**
 * `W_OPENING_AT_JUNCTION`: an opening — door, window or cased opening — runs into a wall that
 * meets its host, or leaves too short a nib of wall between a jamb and that wall's face.
 *
 * "Meets" covers a tee (a wall ending on the host), a crossing, a host that itself ends on
 * another wall, and a corner. The nib is measured along the run from the jamb to the meeting
 * wall's FACE, and must be at least `max(minJunctionNibMm, host thickness ×
 * junctionNibThicknessRatio)`, 100 mm and half the thickness by default
 * ({@link import("../ruleset.js").LintRuleset.minJunctionNibMm} and
 * {@link import("../ruleset.js").LintRuleset.junctionNibThicknessRatio} have the sources).
 *
 * **Relation to `W_DOOR_NEAR_CORNER`.** That rule already measures a DOOR at a corner (to
 * the corner's centreline point, against the wall's thickness). One defect gets one warning:
 * a door that rule reports is measured here only against tees and crossings. A door it passes
 * is measured at corners too, because on a thin wall one thickness to the corner point leaves
 * less than this rule's nib at the face (a 100 mm partition: 50 mm, against 100). Windows
 * and cased openings, which that rule does not cover, are always measured at corners. Every
 * plan's existing `W_DOOR_NEAR_CORNER` output is unchanged.
 */
export const openingAtJunction: LintRule = {
  name: "opening-at-junction",
  family: "openings",
  layer: "validity",
  stage: "openings",
  codes: ["W_OPENING_AT_JUNCTION"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const all = openingsOnRuns(ctx);
    const jsOf = junctionLookup(ctx);
    for (const o of all) {
      const js = jsOf(o);
      const mine = junctionsFor(ctx, o, js);
      if (mine.length === 0) continue;
      const need = nibNeed(ctx, o.seg);
      // A cased opening whose jamb lands FLUSH on a meeting wall's face uses that face as its
      // jamb: there is no sliver of wall to carry anything, because there is no wall there at
      // all (a hall that opens its full width into a room). A door's frame, or a window's,
      // still needs a nib, so only a leaf-less opening is excused, and only at 0 mm.
      const short = (nib: number): boolean => nib < need - EPS && !(o.el.kind === "opening" && nib <= FLUSH_MM);
      const inside = mine.filter((j) => j.lo < o.hi - EPS && j.hi > o.lo + EPS);
      let left: { j: Junction; nib: number } | null = null;
      let right: { j: Junction; nib: number } | null = null;
      // An opening `open between` DERIVED spans the clear span: each jamb sits on the face of the
      // thickest wall meeting that end of the run. A thinner wall meeting the same end leaves a
      // sliver of the run beside its face, inside the thickest wall's extent: that is the
      // thickest wall's pier, not a nib (ADR 0028 §3, PS3.0 part C).
      const derived = o.el.kind === "opening" && o.el._derived !== undefined;
      const pier = (j: Junction, leftSide: boolean): boolean =>
        derived &&
        mine.some(
          (k) =>
            k !== j &&
            !inside.includes(k) &&
            k.lo <= j.lo + EPS &&
            k.hi >= j.hi - EPS &&
            (leftSide ? Math.abs(k.hi - o.lo) <= FLUSH_MM : Math.abs(k.lo - o.hi) <= FLUSH_MM),
        );
      for (const j of mine) {
        if (inside.includes(j)) continue;
        if (j.hi <= o.lo + EPS) {
          if (pier(j, true)) continue;
          const nib = Math.max(0, o.lo - j.hi);
          if (short(nib) && (!left || nib < left.nib)) left = { j, nib };
        } else {
          if (pier(j, false)) continue;
          const nib = Math.max(0, j.lo - o.hi);
          if (short(nib) && (!right || nib < right.nib)) right = { j, nib };
        }
      }
      if (inside.length === 0 && !left && !right) continue;

      const name = openingName(ctx, o.el);
      const span = runSpan(o.seg, o.lo, o.hi);
      // Every junction reported is an open boundary at a free end: no wall meets this one there,
      // so the whole message says so, and each fact need not.
      const reported = [...inside, ...(left ? [left.j] : []), ...(right ? [right.j] : [])];
      const allFree = reported.every((j) => j.boundary?.freeEnd);
      const freeEndOf = (j: Junction): string => (allFree ? "" : atFreeEnd(j));
      const facts: string[] = [];
      for (const j of inside) {
        const lo = Math.max(j.lo, o.lo);
        const hi = Math.min(j.hi, o.hi);
        facts.push(
          j.boundary
            ? `${openBoundaryPhrase(j.wall)}${freeEndOf(j)}${allFree ? "" : ","} lies inside its span (${span}; it is measured over ${runSpan(o.seg, j.lo, j.hi)}, ${mm(hi - lo)} mm of the opening)`
            : `${wallPhrase(j.wall)} stands inside its span (${span}; that wall occupies ${runSpan(o.seg, j.lo, j.hi)}, ${mm(hi - lo)} mm of the opening)`,
        );
      }
      for (const [side, at] of [
        [left, o.lo],
        [right, o.hi],
      ] as const) {
        if (!side) continue;
        const { j } = side;
        const face = j.hi <= o.lo + EPS ? j.hi : j.lo;
        const met = j.boundary ? `edge of ${openBoundaryPhrase(j.wall)}` : `face of ${wallPhrase(j.wall)}`;
        facts.push(
          `its jamb at ${runCoord(o.seg, at)} is ${mm(side.nib)} mm from the ${met} (at ${runCoord(o.seg, face)})${freeEndOf(j)}`,
        );
      }
      const reason =
        inside.length > 0
          ? inside.every((j) => j.boundary)
            ? "The wall stops at that boundary, so the opening's frame has no wall to close on there."
            : "A wall standing inside an opening is a pier in it, and the opening's frame has no jamb to close on."
          : `A jamb needs at least ${mm(need)} mm of wall beside it (the larger of ${mm(ctx.rules.minJunctionNibMm)} mm and ${ratioWords(ctx.rules.junctionNibThicknessRatio)} this wall's ${mm(o.seg.thickness)} mm thickness) to carry its frame or lining.`;
      const accept = allFree
        ? "Accept it if the end of the wall is detailed to carry the frame."
        : inside.length > 0
          ? o.el.kind === "window"
            ? "Accept it if the glazing is meant to run past the junction, with the meeting wall stopping on a mullion."
            : o.el.kind === "opening"
              ? "Accept it if the meeting wall is a screen that stops short of the opening's head."
              : null
          : "Accept it if the frame is meant to be fixed into the meeting wall itself (a flush corner detail).";
      out.push({
        severity: "warning",
        code: "W_OPENING_AT_JUNCTION",
        ...ctx.at(o.el),
        message: `${cap(name)} ${allFree ? "stands at a free end of its wall" : "meets a wall junction"} — ${distinct(facts).join("; ")}. ${reason}`,
        hints: [
          ...moveHints(ctx, o, all, js, `the ${KIND_WORD[o.el.kind]}`),
          ...(accept ? [accept] : []),
          idHint(ctx, o.el),
        ],
      });
    }
    return out;
  },
};

// ─── PS2.2 ─────────────────────────────────────────────────────────────────────────────

/** Do two openings sit on one run: one segment, or collinear straight segments of one wall? */
function sameRun(p: OnRun, q: OnRun): boolean {
  if (sameSeg(p.seg, q.seg)) return true;
  if (p.seg.wallId !== q.seg.wallId || p.seg.arc || q.seg.arc) return false;
  const u = unitOf(sub(p.seg.b, p.seg.a));
  const v = unitOf(sub(q.seg.b, q.seg.a));
  if (!u || !v || Math.abs(cross(u, v)) >= PARALLEL_SIN) return false;
  return Math.abs(cross(u, sub(q.seg.a, p.seg.a))) <= MEET_TOL_MM;
}

/** `q`'s span in `p`'s along-run coordinates (the two are on one run). */
function alongOf(p: OnRun, q: OnRun): { lo: number; hi: number } {
  if (sameSeg(p.seg, q.seg)) return { lo: q.lo, hi: q.hi };
  const u = unitOf(sub(p.seg.b, p.seg.a))!;
  const c = dot(sub(q.el.at, p.seg.a), u);
  return { lo: c - q.el.width / 2, hi: c + q.el.width / 2 };
}

/** Are two openings the two leaves of one double door? */
function doubleDoor(p: Hosted, q: Hosted): boolean {
  if (p.kind !== "door" || q.kind !== "door") return false;
  const a = doorSwing(p);
  const b = doorSwing(q);
  return a !== null && b !== null && isDoubleDoorPair(a, b);
}

/**
 * `W_OPENING_OVERLAP`: two openings on one run whose along-run spans intersect, or leave a
 * pier thinner than a mullion (`minMullionMm`) between them. One warning per pair, on the
 * later-declared opening, naming both by the rooms they serve.
 */
export const openingOverlap: LintRule = {
  name: "opening-overlap",
  family: "openings",
  layer: "validity",
  stage: "openings",
  codes: ["W_OPENING_OVERLAP"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const all = openingsOnRuns(ctx);
    const jsOf = junctionLookup(ctx);
    const min = ctx.rules.minMullionMm;
    for (let j = 0; j < all.length; j++) {
      const later = all[j]!;
      for (let i = 0; i < j; i++) {
        const earlier = all[i]!;
        if (!sameRun(later, earlier)) continue;
        const e = alongOf(later, earlier);
        const overlap = Math.min(later.hi, e.hi) - Math.max(later.lo, e.lo);
        if (overlap <= EPS && -overlap >= min - EPS) continue;
        // Two hinged leaves closing onto one shared latch jamb are ONE double door, which is how
        // the language draws a pair (`isDoubleDoorPair`, the rule `W_SWING_OBSTRUCTED` exempts).
        if (overlap <= EPS && doubleDoor(later.el, earlier.el)) continue;
        const nameL = openingName(ctx, later.el);
        const nameE = openingName(ctx, earlier.el);
        const kL = KIND_WORD[later.el.kind];
        const kE = KIND_WORD[earlier.el.kind];
        const spans = `this ${kL} spans ${runSpan(later.seg, later.lo, later.hi)} and the ${kE} ${runSpan(later.seg, e.lo, e.hi)}`;
        const fact =
          overlap > EPS
            ? `${spans}, so ${mm(overlap)} mm of wall is claimed by both`
            : `${spans}, leaving a ${mm(-overlap)} mm pier between them, under the ${mm(min)} mm of a mullion`;
        const reason =
          overlap > EPS
            ? "Two openings cannot share a length of wall: one cuts through the other's frame."
            : "A pier thinner than a mullion has no room for the two frames that meet on it.";
        const hints = [
          ...moveHints(ctx, later, all, jsOf(later), `this ${kL}`),
          ...moveHints(ctx, earlier, all, jsOf(earlier), `the ${kE}`)
            .filter((h) => h.startsWith("Move"))
            .map((h) => `Or m${h.slice(1)}`),
          ...(overlap > EPS
            ? []
            : [
                "Accept it if the two are one framed unit (a door with a sidelight, or windows meeting on a mullion thinner than 100 mm).",
              ]),
          `This ${kL} is "${later.el.id}"; the ${kE} is "${earlier.el.id}"; both are on ${wallRef(ctx.ir.walls, later.seg)}.`,
        ];
        out.push({
          severity: "warning",
          code: "W_OPENING_OVERLAP",
          ...ctx.at(later.el),
          message: `${cap(nameL)} ${overlap > EPS ? "overlaps" : "almost meets"} ${nameE} on ${wallPhrase(later.seg)} — ${fact}. ${reason}`,
          hints,
        });
      }
    }
    return out;
  },
};

// ─── PS2.3 ─────────────────────────────────────────────────────────────────────────────

/**
 * Does a straddling connector really open onto two rooms on one face? At least two rooms
 * must each cover `max(minStraddleCoverMm, host thickness × junctionNibThicknessRatio)` of
 * that face's clear span (the access graph's `cover`), net of the body of every wall meeting
 * the host there. Less than that is a jamb set against a meeting wall, which is
 * `W_OPENING_AT_JUNCTION`'s report ({@link import("../ruleset.js").LintRuleset.minStraddleCoverMm}).
 */
function straddlesRooms(
  ctx: LintContext,
  o: OnRun,
  faces: readonly [FaceReading, FaceReading],
  js: readonly Junction[],
): boolean {
  const need = Math.max(ctx.rules.minStraddleCoverMm, o.seg.thickness * ctx.rules.junctionNibThicknessRatio);
  const w = o.el.width;
  // The clear span's probe path, as `connectorFaces` lays it: inset from both jambs.
  const half = Math.max(0, w / 2 - Math.min(JAMB_PROBE_INSET_MM, w / 4));
  const mid = (o.lo + o.hi) / 2;
  const cuts = js
    .map((j) => ({ lo: Math.max(j.lo - mid, -half), hi: Math.min(j.hi - mid, half) }))
    .filter((b) => b.hi > b.lo + EPS)
    .sort((a, b) => a.lo - b.lo);
  const bodies: Keepout[] = [];
  for (const b of cuts) {
    const last = bodies[bodies.length - 1];
    if (last && b.lo <= last.hi) last.hi = Math.max(last.hi, b.hi);
    else bodies.push({ ...b });
  }
  return ([0, 1] as const).some((i) => {
    const side = i === 0 ? "minus" : "plus";
    const rooms = faces[i].cover.filter((x) => {
      const box = ctx.roomRects.get(x.id);
      const body = box ? bodies.reduce((a, b) => a + faceLengthInRoom(o.seg, o.el.at, b.lo, b.hi, side, box), 0) : 0;
      return x.mm - body >= need - EPS;
    });
    return rooms.length >= 2;
  });
}

/**
 * `W_CONNECTOR_AMBIGUOUS`: a door or cased opening whose access edge cannot name the two
 * spaces it joins — the edge is `ambiguous` (three or more rooms at its point, and the face
 * probe cannot decide), or a face of its host has more than one room along the connector's
 * clear span (`straddles`) by at least a jamb's nib, net of the meeting wall's body
 * ({@link straddlesRooms}). The message names the rooms on each side by label; ids are in
 * the hints.
 */
export const connectorAmbiguous: LintRule = {
  name: "connector-ambiguous",
  family: "openings",
  layer: "validity",
  stage: "openings",
  codes: ["W_CONNECTOR_AMBIGUOUS"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const edges = ctx.access().edges;
    const all = openingsOnRuns(ctx);
    const jsOf = junctionLookup(ctx);
    const label = (id: string): string => {
      const r = ctx.rooms.find((x) => x.id === id);
      return r ? ctx.nameOf(r) : "outside";
    };
    const listWith =
      (name: (id: string) => string) =>
      (ids: readonly string[]): string =>
        ids.length <= 1
          ? ids.map(name).join("")
          : `${ids.slice(0, -1).map(name).join(", ")} and ${name(ids[ids.length - 1]!)}`;
    const list = listWith(label);
    // The same for a hint, which names a room by its label or its id.
    const hlist = listWith((id) => {
      const r = ctx.rooms.find((x) => x.id === id);
      return r ? `"${ctx.labelOf(r)}"` : "outside";
    });
    ctx.connectors.forEach((c, k) => {
      const e = edges[k];
      if (!e || e.doorId !== c.id) return;
      if (!e.ambiguous && !e.straddles) return;
      const faces = connectorFaces(c, ctx.roomRects);
      if (!faces || !c.host) return;
      const o = all.find((x) => x.el === c);
      const js = o ? jsOf(o) : [];
      if (!e.ambiguous && o && !straddlesRooms(ctx, o, faces, js)) return;
      const word = KIND_WORD[c.kind];
      const exteriorHost = c.host.category === "exterior";
      // Which face is the outside one, when one face holds no room behind an exterior wall.
      const isOuter = (i: 0 | 1): boolean => exteriorHost && faces[i].cover.length === 0;
      const sideName = (i: 0 | 1): string =>
        isOuter(i)
          ? "its outer side"
          : isOuter(i === 0 ? 1 : 0)
            ? "its inner side"
            : i === 0
              ? "one side"
              : "the other side";
      const sides: string[] = [];
      for (const i of [0, 1] as const) {
        const f = faces[i];
        const nm = sideName(i);
        if (f.cover.length > 1) {
          sides.push(`${nm} spans ${f.cover.map((x) => `${label(x.id)} (${mm(x.mm)} mm)`).join(" and ")}`);
        } else if (f.holders.length > 1) {
          sides.push(`${nm} is centred on the boundary between ${list(f.holders)}`);
        } else if (f.cover.length === 1) {
          sides.push(`${nm} opens into ${label(f.cover[0]!.id)}`);
        } else if (f.holders.length === 1) {
          sides.push(`${nm} opens into ${label(f.holders[0]!)}`);
        } else {
          sides.push(isOuter(i) ? `${nm} is outside` : `${nm} opens onto no room`);
        }
      }
      const reading = e.ambiguous
        ? "so the plan does not say which two spaces it joins and the access graph leaves it out of every route"
        : `so which room it opens into is a guess (the access graph reads it as between ${list(e.between.filter((x) => x !== ""))})`;
      // A move is quoted only when the moved connector reads one room per face, is not
      // ambiguous, joins only rooms it touches now, and leaves no room unreachable that the
      // access graph reaches today (moving a straddling door wholly onto one room can take
      // the only way into the other with it).
      const near = new Set<string>([
        EXTERIOR_NODE,
        ...faces.flatMap((f) => [...f.holders, ...f.cover.map((x) => x.id)]),
      ]);
      const reachedNow = reached(ctx.access());
      const checkMove: MoveCheck = (moved) => {
        let mineAfter: readonly string[] | null = null;
        for (const { el, at } of moved) {
          const r = connectorConnection({ ...el, at }, ctx.roomRects, ctx.rules.tolMm);
          if (r.ambiguous || r.straddles !== undefined || !r.between.every((x) => near.has(x))) return null;
          if (el === c) mineAfter = r.between;
        }
        const move = <T extends { id: string }>(xs: readonly T[]): T[] =>
          xs.map((x) => {
            const m = moved.find((y) => y.el.id === x.id);
            return m ? { ...x, at: m.at } : x;
          });
        const after = reached(
          buildDoorAccessGraph(
            ctx.rooms,
            move(ctx.doors),
            ctx.rules.tolMm,
            undefined,
            move(ctx.openings),
            ctx.openRuns,
          ),
        );
        if (![...reachedNow].every((id) => after.has(id))) return null;
        return mineAfter ? `then opens between ${joined(ctx, mineAfter)}` : null;
      };
      const moves = o ? moveHints(ctx, o, all, js, `the ${word}`, checkMove) : [];
      const wallInside = o !== undefined && junctionsFor(ctx, o, js).some((j) => j.lo < o.hi && j.hi > o.lo);
      const straddled = e.straddles ?? [];
      const hints = [
        ...moves.filter((h) => h.startsWith("Move")),
        ...(moves.some((h) => h.startsWith("Move"))
          ? []
          : [
              `No checked position along this wall puts each side of the ${word} in one room. Move it to a wall two rooms share, or move the walls that meet it.`,
            ]),
        ...(!e.ambiguous && !wallInside && straddled.length > 1
          ? [
              `Accept it if ${hlist(straddled)} are one open space with no wall between them, so the ${word} serves both.`,
            ]
          : []),
        `The ${word} is "${c.id}" on ${wallRef(ctx.ir.walls, c.host)}${straddled.length ? `; its span covers rooms ${straddled.map((x) => `"${x}"`).join(", ")}` : ""}.`,
      ];
      out.push({
        severity: "warning",
        code: "W_CONNECTOR_AMBIGUOUS",
        ...ctx.at(c),
        message: `${cap(`the ${word} on ${wallPhrase(c.host)}`)} does not join two rooms cleanly — ${sides.join(", and ")}, ${reading}. A doorway joins exactly two spaces, and each side of it should lie in one of them.`,
        hints,
      });
    });
    return out;
  },
};
