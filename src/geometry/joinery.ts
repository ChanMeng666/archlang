/**
 * **Wall joinery** — one boundary for a whole set of walls, with no line drawn inside
 * another wall's solid.
 *
 * ## What it replaces, and why it is one algorithm rather than three
 *
 * Until now a plan's poché came from one of three lowering paths, chosen by shape: an
 * axis-aligned grid union for orthogonal walls, a `clipper2-wasm` polygon boolean for
 * angled ones (only when the OPTIONAL dependency happened to be installed), and
 * per-segment rectangles with un-trimmed face lines for anything curved. Three paths
 * mean three sets of corner cases, an optional dependency that can move a drawing's
 * bytes, and a curved plan that draws its junctions wrong by construction.
 *
 * This is one path. It works on {@link EdgeLoop}s from `./band.ts`, so a straight run,
 * an oblique facade and a true arc are the same kind of thing; it is zero-dependency and
 * closed form, so a curved plan renders identically with and without clipper2; and it is
 * exact on rectilinear input, which `test/joinery-oracle.test.ts` checks against
 * `./union.ts` as an ORACLE (that module is kept for exactly that purpose).
 *
 * ## The algorithm, in four movements
 *
 * 1. **Split.** Every band edge and every opening-cut edge goes into one universe,
 *    tagged `(kind, wallIndex, loopIndex, edgeIndex)` — the canonical order, derived
 *    from the caller's own indices, so nothing depends on iteration order of a Map or on
 *    which pair happened to be tested first. Pairs are found through the shared
 *    {@link GridIndex} and each pair is intersected ONCE; both edges are split at the
 *    same INTERNED point object, so a junction is one vertex and not two that agree to
 *    fourteen decimal places.
 *
 * 2. **Classify.** Each sub-edge is probed just off either side of its own
 *    midpoint. A probe's *owner* is the thickest wall whose band contains it — or
 *    nothing, if any opening cut contains it. Thickest-wins is what makes a 100 mm
 *    partition on the same centreline as a 250 mm shell disappear INTO the shell rather
 *    than drawing its own faces inside it.
 *
 * 3. **Keep and direct.** An edge is on the OUTLINE iff exactly one side has an owner.
 *    It is on group `g`'s FILL iff exactly one side is owned by that group — so a
 *    thinner wall's end cap buried in a thicker wall of another material belongs to the
 *    thicker wall, and two groups' fills tile without overlapping. Every kept edge is
 *    directed so its solid side is on the right of travel (positive signed area,
 *    clockwise on screen — the sign `elements/roof.ts` and `geometry/polygon.ts` use).
 *
 * 4. **Chain.** Kept edges are walked into loops, taking the right-most turn at a vertex
 *    where several are unused so a pinch point yields simple loops rather than one
 *    figure-of-eight. Consecutive collinear lines and co-circular same-direction arcs
 *    merge; each loop is rotated to its lexicographically smallest vertex and the loops
 *    are sorted, so the output is a function of the input and not of the walk order.
 *
 * ## Determinism
 *
 * No `Math.random()`, no time, no Map-iteration-order dependence in any decision: every
 * ordering is either the caller's index tuple or a lexicographic sort of a quantised
 * key. `joinWalls` called twice on the same input is deep-equal, and permuting the
 * caller's arrays while keeping the `index` fields is a no-op — `test/joinery-oracle.test.ts`
 * asserts both.
 */

import type { Point } from "../ast.js";
import type { Arc } from "./arc.js";
import { arcPieces, arcPointAt, distPointToArc } from "./arc.js";
import { distPointToSegment } from "../geometry.js";
import { MITER_LIMIT } from "../scene.js";
import type { PathEdge, PathLoop, ScenePrim } from "../scene.js";
import type { GridBox } from "./grid-index.js";
import { GridIndex } from "./grid-index.js";
import {
  type Edge,
  type EdgeLoop,
  PointInterner,
  edgeEnd,
  edgeIsNull,
  edgeMid,
  edgeStart,
  edgeTangentAt,
  loopArea,
  loopBBox,
  loopWinding,
  pointKey,
  reverseEdge,
  SNAP_MM,
  tessellateLoops,
  unionBBox,
} from "./band.js";
import {
  type Vec2,
  arcParamSigned,
  circleCircle,
  cross2,
  dot2,
  lineCircleParams,
  lineLineParams,
  meetLines,
  parallel,
  perp,
  sub2,
  subArc,
  unit2,
} from "./intersect.js";

/* ---------------------------------------------------------------------------
 * Inputs
 * ------------------------------------------------------------------------- */

/** One wall, as plain data — no Scene, no theme, no resolved element. */
export interface JoineryWall {
  /** The caller's own index. It is the canonical tie-break, so it must be stable. */
  index: number;
  /** For diagnostics only; never read by a decision. */
  id: string;
  thickness: number;
  /** The hatch/material group whose fill this wall contributes to. */
  group: string;
  /** The wall's band, from `wallBand()`. */
  loops: EdgeLoop[];
  bbox: GridBox;
}

/** One opening's cut volume, from `openingCut()`. */
export interface JoineryCut {
  index: number;
  loop: EdgeLoop;
  bbox: GridBox;
}

/** What {@link joinWalls} produces: one outline, and one fill per requested group. */
export interface JoineryResult {
  outline: EdgeLoop[];
  fills: Array<{ group: string; loops: EdgeLoop[] }>;
}

/* ---------------------------------------------------------------------------
 * Tuning constants — all of them policy, all of them stated once
 * ------------------------------------------------------------------------- */

/**
 * A conservative reach for the per-wall spatial prefilter, as a multiple of the wall's
 * half-thickness.
 *
 * Every point of a band lies within `MITER_LIMIT · h` of the band's own boundary: a face
 * is `h` from the centreline, a square cap `√2 · h` from the end vertex, and a mitred
 * corner at most `MITER_LIMIT · h` from the vertex it turns about (past which `band.ts`
 * bevels). `1 + MITER_LIMIT` is that bound with slack, so a wall rejected by the filter
 * PROVABLY does not contain the point and never needs a winding test.
 */
const REACH_FACTOR = 1 + MITER_LIMIT;

/**
 * Loops smaller than this (mm²) are numerical dust and are dropped. A hundredth of a
 * square millimetre is a 0.1 x 0.1 mm square — an order below what `fmt2` can even print
 * and four orders below the smallest thing a plan draws.
 */
const MIN_LOOP_AREA = 1e-2;

/** Two directions closer than this in sine are collinear, for the merge pass. */
const MERGE_SIN = 1e-12;

/* ---------------------------------------------------------------------------
 * Phase 1 — one universe of tagged edges, split at every mutual crossing
 * ------------------------------------------------------------------------- */

/**
 * One walk of the chainer: the edges it visited, and whether it came back to where it
 * started. `closed: false` is a DEFECT REPORT, not a shape — see {@link finishLoops}.
 */
interface Chain {
  edges: EdgeLoop;
  closed: boolean;
}

/** An edge of the universe, with the tuple that gives it its canonical position. */
interface Tagged {
  /** `0` = a wall band edge, `1` = an opening cut edge. */
  kind: 0 | 1;
  /** The wall's or cut's `index`. */
  owner: number;
  loopIndex: number;
  edgeIndex: number;
  edge: Edge;
  bbox: GridBox;
  /** Split parameters in `(0, 1)`, with the interned point each one lands on. */
  splits: Array<{ t: number; p: Point }>;
}

const byTag = (a: Tagged, b: Tagged): number =>
  a.kind - b.kind || a.owner - b.owner || a.loopIndex - b.loopIndex || a.edgeIndex - b.edgeIndex;

/** A single edge's bounding box (arc bulges included, closed form). */
const edgeBBox = (e: Edge): GridBox => loopBBox([e]);

/** Is `p` inside a box grown by the interner's own fusing distance? */
const inGrownBox = (p: Point, b: GridBox): boolean =>
  p.x >= b.minX - SNAP_MM && p.x <= b.maxX + SNAP_MM && p.y >= b.minY - SNAP_MM && p.y <= b.maxY + SNAP_MM;

/** Do two boxes overlap at all? */
const boxesOverlap = (a: GridBox, b: GridBox): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** A point's parameter along an edge: the projection for a line, the angle for an arc. */
function paramOf(e: Edge, p: Point): number {
  if (e.t === "arc") return arcParamSigned(e.arc, p);
  const d = sub2(e.b, e.a);
  const len2 = dot2(d, d);
  if (len2 === 0) return 0;
  return dot2(sub2(p, e.a), d) / len2;
}

/** Every candidate crossing point of two edges, as raw (un-interned) points. */
function crossPoints(a: Edge, b: Edge): Point[] {
  if (a.t === "line" && b.t === "line") {
    const d = sub2(a.b, a.a);
    const e = sub2(b.b, b.a);
    if (parallel(d, e)) {
      // Collinear (not merely parallel): split each at the other's interior endpoints.
      // Two disjoint parallel runs share no point and fall out of the interval test below.
      if (!parallel(d, sub2(b.a, a.a))) return [];
      return [b.a, b.b, a.a, a.b];
    }
    const m = meetLines(a.a, d, b.a, e);
    return m ? [m] : [];
  }
  if (a.t === "line" && b.t === "arc") return lineArcPoints(a, b.arc);
  if (a.t === "arc" && b.t === "line") return lineArcPoints(b, a.arc);
  if (a.t === "arc" && b.t === "arc") {
    const p = a.arc;
    const q = b.arc;
    const concentric =
      Math.hypot(p.center.x - q.center.x, p.center.y - q.center.y) < 1e-9 && Math.abs(p.r - q.r) < 1e-9;
    // Two runs of the SAME circle cross nowhere and overlap everywhere; the honest split
    // is at each other's endpoints, exactly as for a collinear pair of lines.
    if (concentric) return [q.a, q.b, p.a, p.b];
    return circleCircle(p.center, p.r, q.center, q.r);
  }
  return [];
}

function lineArcPoints(line: { a: Point; b: Point }, arc: Arc): Point[] {
  const d = sub2(line.b, line.a);
  return lineCircleParams(line.a, d, arc.center, arc.r).map((s) => ({
    x: line.a.x + s * d.x,
    y: line.a.y + s * d.y,
  }));
}

/**
 * Register a split of `e` at `p`, unless `p` is one of `e`'s own endpoints.
 *
 * The endpoint test is by interned KEY, not by distance — the interner is the single
 * place a positional tolerance lives, and a second epsilon here is a second opinion
 * about how many vertices a junction has.
 */
function addSplit(t: Tagged, p: Point): void {
  // Compared by OBJECT IDENTITY, not by key. `p` is already interned and so are the
  // edge's own endpoints, so two points at the same position ARE the same object - and
  // building a key string here instead costs three string allocations on the hottest
  // path in the layer (the pair scan calls this twice per candidate crossing).
  if (p === edgeStart(t.edge) || p === edgeEnd(t.edge)) return;
  const param = paramOf(t.edge, p);
  if (!(param > 0 && param < 1)) return;
  for (const s of t.splits) if (s.p === p) return;
  t.splits.push({ t: param, p });
}

/** The universe's sub-edges after every mutual crossing has been cut in. */
function splitAll(universe: Tagged[], intern: PointInterner): Tagged[] {
  const index = new GridIndex<number>(spanCell(universe.map((t) => t.bbox)));
  for (let i = 0; i < universe.length; i++) index.insert(universe[i]!.bbox, i);

  // One reused candidate buffer and a stamp array, so the pair scan allocates NOTHING per
  // edge. `forEach` visits an item once per shared cell; the stamp collapses those
  // repeats without a `Set`, and the sort restores the canonical (index) order the
  // interner's first-registration-wins rule depends on.
  const stamp = new Int32Array(universe.length).fill(-1);
  const candidates: number[] = [];
  for (let i = 0; i < universe.length; i++) {
    const a = universe[i]!;
    candidates.length = 0;
    index.forEach(a.bbox, (j) => {
      if (j <= i || stamp[j] === i) return;
      stamp[j] = i;
      candidates.push(j);
    });
    candidates.sort((x, y) => x - y);
    for (const j of candidates) {
      const b = universe[j]!;
      if (!boxesOverlap(a.bbox, b.bbox)) continue;
      for (const raw of crossPoints(a.edge, b.edge)) {
        // Reject before INTERNING. `crossPoints` answers for the infinite line and the
        // whole circle, so most candidates lie off both edges - and interning is the
        // expensive step (it fuses against a neighbourhood, not a single cell). A box
        // test grown by `SNAP_MM` is conservative: a candidate the interner could still
        // fuse onto an endpoint is inside it.
        if (!inGrownBox(raw, a.bbox) || !inGrownBox(raw, b.bbox)) continue;
        const p = intern.get(raw);
        addSplit(a, p);
        addSplit(b, p);
      }
    }
  }

  const out: Tagged[] = [];
  for (const t of universe) {
    if (t.splits.length === 0) {
      out.push(t);
      continue;
    }
    t.splits.sort((x, y) => x.t - y.t);
    const stops = [{ t: 0, p: edgeStart(t.edge) }, ...t.splits, { t: 1, p: edgeEnd(t.edge) }];
    for (let k = 0; k < stops.length - 1; k++) {
      const from = stops[k]!;
      const to = stops[k + 1]!;
      if (from.p === to.p) continue;
      const sub: Edge =
        t.edge.t === "line"
          ? { t: "line", a: from.p, b: to.p }
          : { t: "arc", arc: { ...subArc(t.edge.arc, from.t, to.t), a: from.p, b: to.p } };
      if (edgeIsNull(sub)) continue;
      out.push({ ...t, edge: sub, bbox: edgeBBox(sub), splits: [] });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Phase 2 — who owns each side
 *
 * The question is: for a sub-edge, which wall's material lies just off it on each side?
 *
 * **The offset is DERIVED from the geometry, never a constant.** An earlier version
 * stepped a fixed tenth of a millimetre; that is unsound wherever another boundary runs
 * closer than the step, because the step then lands past it and reports that band's
 * answer instead. It showed as an ODD vertex in the boundary graph — one sub-edge kept,
 * the one beside it dropped — and therefore as a chain that could not close. The offset
 * used here is
 *
 *     δ = min( nearest OTHER boundary / 2 , this edge's own span / 4 )
 *
 * so by construction nothing can be crossed on the way out, and the reading is the exact
 * limit value. The split phase is what makes the first term meaningful: after it, no
 * other boundary crosses this sub-edge's interior, so the distance from the midpoint to
 * every non-coincident edge is strictly positive.
 *
 * **Why not a purely analytic rule.** It is tempting to skip the offset entirely: the
 * split guarantees that every other band is either disjoint from the sub-edge (one
 * winding test at the midpoint answers both sides) or COINCIDENT with it (its material
 * side is then read off that edge's own direction, since `band.ts` orients every loop
 * material-on-`+perp`). That is sound for other bands and it is exactly how the
 * `coincident` set below is used. It is NOT sound for the sub-edge's OWN band, because a
 * band may overlap itself — an acute corner between a bulging arc and a straight run
 * buries part of its own boundary inside its own solid, and there the true windings are
 * 2 and 1 rather than 1 and 0, so the edge must be dropped and the analytic rule keeps
 * it. (Nor can the winding be decomposed into "everything else, plus one for the
 * material side": ray casting is not local. Square loop, midpoint on the top edge — the
 * other three edges already contribute 1, so the decomposition reports 2 and 1 where the
 * truth is 1 and 0.) The offset asks the whole question at once and cannot disagree with
 * itself.
 *
 * The COINCIDENCE grouping is still what the phase is built on, for two other reasons:
 * it deduplicates a face two walls share into one emitted edge, and it collapses N
 * coincident sub-edges into one pair of readings instead of N.
 * ------------------------------------------------------------------------- */

/** A sub-edge's owner on one side: the thickest wall whose material is there, or `null`. */
type Owner = JoineryWall | null;

/** Nonzero winding over a wall's whole band (its outer loop and any hole). */
function bandContains(w: JoineryWall, p: Point): boolean {
  let n = 0;
  for (const l of w.loops) n += loopWinding(l, p);
  return n !== 0;
}

/**
 * Owner priority: **thickest wins**, ties broken by the lower `index` - applied by
 * scanning a {@link byOwnership}-sorted candidate list and taking the first hit.
 *
 * That single rule is what makes a 100 mm partition drawn along the same centreline as a
 * 250 mm shell vanish into the shell instead of drawing two faces inside its poche - and
 * it is a rule about the WALLS, not about draw order, so it cannot be changed by
 * reordering statements.
 */
/** Thickest first, ties by index — the order a candidate list is scanned in. */
const byOwnership = (a: JoineryWall, b: JoineryWall): number => b.thickness - a.thickness || a.index - b.index;

/**
 * The wall a point belongs to, or `null` when it is in open air or inside an opening.
 * `wallsNear` arrives thickest-first, so the FIRST band that covers the point is the
 * answer and the rest need no winding test — which matters, because the winding walk is
 * this layer's hottest loop.
 *
 * A cut wins over every wall: a doorway is a hole, and a hole is not owned.
 */
function ownerAt(p: Point, wallsNear: readonly JoineryWall[], cutsNear: readonly JoineryCut[]): Owner {
  for (const c of cutsNear) if (loopWinding(c.loop, p) !== 0) return null;
  for (const w of wallsNear) if (bandContains(w, p)) return w;
  return null;
}

/** Run length of an edge — arc length for a curve, never its chord. */
const edgeLength = (e: Edge): number =>
  e.t === "arc" ? Math.abs(e.arc.r * e.arc.sweep) : Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);

/** Distance from a point to an edge — exact for both kinds, never sampled. */
const edgeDist = (p: Point, e: Edge): number =>
  e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));

/**
 * One band or cut whose boundary is COINCIDENT with a group of sub-edges, and the side of
 * the group's representative its material lies on.
 */
interface Coincident {
  /** `0` = a wall band, `1` = an opening cut. */
  kind: 0 | 1;
  /** The wall's or cut's `index`. */
  owner: number;
  /** `true` when this owner's material is on `+perp` of the REPRESENTATIVE's direction. */
  plusSide: boolean;
}

/**
 * A set of sub-edges that are geometrically the same curve — the unit everything after
 * the split works on.
 *
 * Grouping by {@link undirectedKey} does the deduplication (a face two walls share is one
 * group, emitted once) AND yields the coincidence set the exact classification needs, in
 * one pass. The representative is the member with the smallest tag, so the group's
 * direction is a function of the caller's own indices.
 */
interface EdgeGroup {
  key: string;
  rep: Edge;
  mid: Point;
  coincident: Coincident[];
}

/**
 * Does `e` run the same way round as `rep`? For two arcs the SWEEP SIGN decides — a full
 * circle has `a === b`, so comparing start points would be meaningless there.
 */
function sameDirection(rep: Edge, e: Edge): boolean {
  if (rep.t === "arc" && e.t === "arc") return Math.sign(rep.arc.sweep) === Math.sign(e.arc.sweep);
  return pointKey(edgeStart(e)) === pointKey(edgeStart(rep));
}

/**
 * Canonical UNDIRECTED key of a sub-edge — the identity two coincident edges from two
 * different walls share, so a face drawn twice is emitted once.
 *
 * The two endpoint keys are sorted, so direction does not enter. An arc adds its centre,
 * radius, |sweep| **and its own MIDPOINT**, and the midpoint is the load-bearing part:
 * two arcs can share both endpoints and be different curves, and the sharpest case is
 * the one `examples/aquarium.arch` actually draws — a drum written as two semicircles
 * has, on each face, two arcs with the same endpoints, the same centre, the same radius
 * and the same |sweep|, differing only in which way round they go. A key without the
 * midpoint deduplicates one of them away and leaves half a circle where the drawing has
 * a whole one.
 */
function undirectedKey(e: Edge): string {
  const [k1, k2] = [pointKey(edgeStart(e)), pointKey(edgeEnd(e))].sort();
  if (e.t === "line") return `L|${k1}|${k2}`;
  const mid = pointKey(arcPointAt(e.arc, 0.5));
  return `A|${k1}|${k2}|${mid}|${pointKey(e.arc.center)}|${Math.round(e.arc.r * 1e6)}|${Math.round(Math.abs(e.arc.sweep) * 1e9)}`;
}

/* ---------------------------------------------------------------------------
 * Phase 4 — chaining kept edges into loops
 * ------------------------------------------------------------------------- */

/** Unit direction of travel LEAVING an edge's start / ARRIVING at its end. */
const outDir = (e: Edge): Vec2 => edgeTangentAt(e, edgeStart(e));
const inDir = (e: Edge): Vec2 => edgeTangentAt(e, edgeEnd(e));

/** Signed turn from `a` to `b`, in `(−π, π]`. Positive = clockwise on screen. */
const turn = (a: Vec2, b: Vec2): number => Math.atan2(cross2(a, b), dot2(a, b));

/**
 * Walk directed edges into closed loops.
 *
 * At a vertex where several unused edges leave, the RIGHT-most turn is taken. That is
 * what makes a pinch point — two parts of the solid meeting at a single vertex — come
 * apart into two simple loops instead of one self-touching figure of eight, and it is
 * the curved analogue of the left-most-turn rule `./union.ts` uses on its rectilinear
 * grid (the two differ only because the two walks carry opposite orientations).
 *
 * Start vertices are visited in sorted key order and each vertex's outgoing list is
 * sorted by undirected key, so the loop set — and the order it comes out in — is a
 * function of the edges alone.
 */
function chainLoops(edges: readonly Edge[]): Chain[] {
  const outgoing = new Map<string, number[]>();
  for (let i = 0; i < edges.length; i++) {
    const k = pointKey(edgeStart(edges[i]!));
    const list = outgoing.get(k);
    if (list) list.push(i);
    else outgoing.set(k, [i]);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => {
      const ka = undirectedKey(edges[a]!);
      const kb = undirectedKey(edges[b]!);
      return ka < kb ? -1 : ka > kb ? 1 : a - b;
    });
  }

  const used = new Array<boolean>(edges.length).fill(false);
  const startKeys = [...outgoing.keys()].sort();
  const loops: Chain[] = [];

  const takeNext = (vertexKey: string, arriving: Vec2 | null): number | null => {
    const list = outgoing.get(vertexKey);
    if (!list) return null;
    const free = list.filter((i) => !used[i]);
    if (free.length === 0) return null;
    if (free.length === 1 || !arriving) return free[0]!;
    let best = free[0]!;
    let bestTurn = -Infinity;
    for (const i of free) {
      const t = turn(arriving, outDir(edges[i]!));
      if (t > bestTurn) {
        bestTurn = t;
        best = i;
      }
    }
    return best;
  };

  for (const key of startKeys) {
    for (const seed of outgoing.get(key) ?? []) {
      if (used[seed]) continue;
      const loop: EdgeLoop = [];
      let cur: number | null = seed;
      let arriving: Vec2 | null = null;
      let closed = false;
      while (cur !== null) {
        used[cur] = true;
        const e = edges[cur]!;
        loop.push(e);
        const endKey = pointKey(edgeEnd(e));
        if (endKey === key) {
          closed = true;
          break;
        }
        arriving = inDir(e);
        cur = takeNext(endKey, arriving);
      }
      if (loop.length > 0) loops.push({ edges: loop, closed });
    }
  }
  return loops;
}

/** Are two consecutive edges the same straight line, running the same way? */
function mergeableLines(a: Edge, b: Edge): boolean {
  if (a.t !== "line" || b.t !== "line") return false;
  const d1 = sub2(a.b, a.a);
  const d2 = sub2(b.b, b.a);
  const l1 = Math.hypot(d1.x, d1.y);
  const l2 = Math.hypot(d2.x, d2.y);
  if (l1 === 0 || l2 === 0) return false;
  return Math.abs(cross2(d1, d2)) / (l1 * l2) < MERGE_SIN && dot2(d1, d2) > 0;
}

/** Are two consecutive edges arcs of the SAME circle, turning the same way? */
function mergeableArcs(a: Edge, b: Edge): boolean {
  if (a.t !== "arc" || b.t !== "arc") return false;
  return (
    pointKey(a.arc.center) === pointKey(b.arc.center) &&
    Math.abs(a.arc.r - b.arc.r) < 1e-9 &&
    Math.sign(a.arc.sweep) === Math.sign(b.arc.sweep)
  );
}

/** The two edges as one. Caller has checked they are mergeable and consecutive. */
function mergeEdges(a: Edge, b: Edge): Edge {
  if (a.t === "line" && b.t === "line") return { t: "line", a: a.a, b: b.b };
  if (a.t === "arc" && b.t === "arc") {
    return {
      t: "arc",
      arc: { ...a.arc, b: b.arc.b, sweep: a.arc.sweep + b.arc.sweep },
    };
  }
  return a;
}

/**
 * Collapse consecutive collinear lines and co-circular same-direction arcs, cyclically.
 *
 * A joined wall's straight facade arrives here as one sub-edge per crossing it survived,
 * and a reader is entitled to one line. The wrap-around pass matters as much as the
 * inner one: without it a facade that happens to have been chained starting in its
 * middle keeps a seam at an arbitrary point, and the loop's byte output would depend on
 * where the walk began.
 */
function mergeInner(loop: EdgeLoop): EdgeLoop {
  if (loop.length < 2) return loop;
  const out: EdgeLoop = [];
  for (const e of loop) {
    const prev = out[out.length - 1];
    if (prev && (mergeableLines(prev, e) || mergeableArcs(prev, e))) out[out.length - 1] = mergeEdges(prev, e);
    else out.push(e);
  }
  return out;
}

/** {@link mergeInner}, plus the wrap-around join. Only valid on a CLOSED chain. */
function mergeRuns(loop: EdgeLoop): EdgeLoop {
  const out = mergeInner(loop);
  // Wrap-around: the last edge may continue into the first.
  while (out.length > 2) {
    const last = out[out.length - 1]!;
    const first = out[0]!;
    if (!mergeableLines(last, first) && !mergeableArcs(last, first)) break;
    // A full circle must not be merged away into a zero-sweep nothing: two half-turns of
    // the same circle ARE the loop, and joining them leaves one edge with no room to be
    // both the start and the end of itself.
    if (last.t === "arc" && first.t === "arc" && Math.abs(last.arc.sweep + first.arc.sweep) >= Math.PI * 2 - 1e-9) {
      break;
    }
    out[0] = mergeEdges(last, first);
    out.pop();
  }
  return out;
}

/** Rotate a loop so it begins at its lexicographically smallest vertex key. */
function canonicalRotation(loop: EdgeLoop): EdgeLoop {
  if (loop.length < 2) return loop;
  let at = 0;
  let best = pointKey(edgeStart(loop[0]!));
  for (let i = 1; i < loop.length; i++) {
    const k = pointKey(edgeStart(loop[i]!));
    if (k < best) {
      best = k;
      at = i;
    }
  }
  return at === 0 ? loop : [...loop.slice(at), ...loop.slice(0, at)];
}

/**
 * Merge, rotate, drop dust, and sort — the one place a loop set becomes canonical.
 *
 * **An UNCLOSED chain is normalised differently, and that is load-bearing.** A boundary
 * is a closed 1-manifold, so a chain that dead-ends means the classification was
 * inconsistent — a real defect, and one the properties in `test/joinery-oracle.test.ts`
 * are there to catch. What must not happen is this pass hiding it: the wrap-around merge
 * assumes the last edge continues into the first, and applied to a dead-end chain it
 * FABRICATES an edge spanning from the tail's start to the head's end — a face line
 * across ground neither wall occupies, which then reads as a boundary with air on both
 * sides. (Measured: a chain that had lost its `(3991, −155) → (10000, −155)` face came
 * back carrying an invented `(3991, −155) → (3155, −155)` instead.) The same goes for
 * the canonical rotation, which is only meaningful on a cycle. So an unclosed chain is
 * passed through with its inner merges only, exactly as computed.
 */
function finishLoops(chains: Chain[]): EdgeLoop[] {
  const out = chains
    .map((c) => (c.closed ? canonicalRotation(mergeRuns(c.edges)) : mergeInner(c.edges)))
    .filter((l) => l.length > 0 && Math.abs(loopArea(l)) >= MIN_LOOP_AREA);
  out.sort((a, b) => {
    const ka = pointKey(edgeStart(a[0]!));
    const kb = pointKey(edgeStart(b[0]!));
    return ka < kb ? -1 : ka > kb ? 1 : Math.abs(loopArea(b)) - Math.abs(loopArea(a));
  });
  return out;
}

/* ---------------------------------------------------------------------------
 * The join
 * ------------------------------------------------------------------------- */

/**
 * Join a set of wall bands into one outline plus one fill region per material group.
 *
 * Pure: no I/O, no clock, no randomness, and no dependence on the ORDER of the `walls`
 * or `cuts` arrays — every decision keys off their `index` fields. See the module header
 * for the four movements.
 */
export function joinWalls(
  walls: readonly JoineryWall[],
  cuts: readonly JoineryCut[],
  groups: readonly string[],
): JoineryResult {
  const empty: JoineryResult = { outline: [], fills: groups.map((group) => ({ group, loops: [] })) };
  if (walls.length === 0) return empty;

  const intern = new PointInterner();

  /**
   * Re-intern an incoming edge's endpoints through THIS call's interner.
   *
   * The caller built its bands and cuts with an interner of its own, and `joinWalls`
   * cannot assume it was the same one. Without this the two are separate authorities: a
   * band vertex and a split point at the identical position are different OBJECTS, so
   * every identity test in the layer silently answers "different" - `addSplit` then
   * registers a split AT an endpoint and emits a sub-edge a hundredth of a millimetre
   * long, which surfaces as a one-edge "loop" of its own in the output. One interner per
   * call, seeded from the input, is the whole fix; it also frees the caller from having
   * to share one.
   */
  const renorm = (e: Edge): Edge =>
    e.t === "line"
      ? { t: "line", a: intern.get(e.a), b: intern.get(e.b) }
      : { t: "arc", arc: { ...e.arc, a: intern.get(e.arc.a), b: intern.get(e.arc.b) } };

  // Canonical universe: wall band edges first (by wall index, then loop, then edge),
  // then opening cuts. The tuple is the caller's, so a permuted input is a no-op.
  const universe: Tagged[] = [];
  const wallsSorted = [...walls].sort((a, b) => a.index - b.index);
  const cutsSorted = [...cuts].sort((a, b) => a.index - b.index);
  for (const w of wallsSorted) {
    for (let li = 0; li < w.loops.length; li++) {
      const loop = w.loops[li]!;
      for (let ei = 0; ei < loop.length; ei++) {
        const e = loop[ei]!;
        if (edgeIsNull(e)) continue;
        const edge = renorm(e);
        universe.push({
          kind: 0,
          owner: w.index,
          loopIndex: li,
          edgeIndex: ei,
          edge,
          bbox: edgeBBox(edge),
          splits: [],
        });
      }
    }
  }
  for (const c of cutsSorted) {
    for (let ei = 0; ei < c.loop.length; ei++) {
      const e = c.loop[ei]!;
      if (edgeIsNull(e)) continue;
      const edge = renorm(e);
      universe.push({ kind: 1, owner: c.index, loopIndex: 0, edgeIndex: ei, edge, bbox: edgeBBox(edge), splits: [] });
    }
  }
  universe.sort(byTag);
  if (universe.length === 0) return empty;

  const pieces = splitAll(universe, intern);

  // GROUP the sub-edges by canonical key. This is the deduplication (a face two walls
  // share is emitted once) AND the coincidence detection the exact classification needs,
  // in one pass — which is why it happens BEFORE classification and not after it.
  const edgeGroups: EdgeGroup[] = [];
  const byKey = new Map<string, EdgeGroup>();
  // Every sub-edge's canonical key, computed ONCE. Building one is not cheap for an arc
  // (six quantised fields, one of them a midpoint that costs a trig evaluation).
  const pieceKeys = pieces.map((t) => undirectedKey(t.edge));
  for (let pi = 0; pi < pieces.length; pi++) {
    const t = pieces[pi]!;
    const key = pieceKeys[pi]!;
    let g = byKey.get(key);
    if (!g) {
      g = { key, rep: t.edge, mid: edgeMid(t.edge), coincident: [] };
      byKey.set(key, g);
      edgeGroups.push(g);
    }
    const plusSide = sameDirection(g.rep, t.edge);
    if (!g.coincident.some((c) => c.kind === t.kind && c.owner === t.owner && c.plusSide === plusSide)) {
      g.coincident.push({ kind: t.kind, owner: t.owner, plusSide });
    }
  }

  // Spatial index over each wall's BAND EDGES, so the containment question reaches only
  // the walls actually near the point. Indexing the wall's whole bbox instead is what
  // made this the hot loop: a closed ring's band bbox is the WHOLE BUILDING, so every
  // midpoint wound every wall in the plan.
  const reachOf = (w: JoineryWall): number => (w.thickness / 2) * REACH_FACTOR;
  const edgeBoxes: GridBox[] = [];
  const entries: Array<{ wall: JoineryWall; edge: Edge; reach: number }> = [];
  for (const w of wallsSorted) {
    const reach = reachOf(w);
    for (const l of w.loops) {
      for (const e of l) {
        const b = edgeBBox(e);
        // Grown by the offset ceiling too: a wall that covers the PROBE must be a
        // candidate, and the probe sits up to `SNAP_MM * 4` off the midpoint queried.
        const g = reach + SNAP_MM * 4;
        const box = { minX: b.minX - g, minY: b.minY - g, maxX: b.maxX + g, maxY: b.maxY + g };
        edgeBoxes.push(box);
        entries.push({ wall: w, edge: e, reach: g });
      }
    }
  }
  // Sized by `pointCell`, because the queries here are single POINTS: a fine cell keeps
  // the candidate list per probe short, and the distance test that follows is what stops
  // a winding walk. Coarsening it to `spanCell` was measured and is 50% slower overall.
  const wallIndex = new GridIndex<number>(pointCell(edgeBoxes));
  for (let i = 0; i < entries.length; i++) wallIndex.insert(edgeBoxes[i]!, i);
  const cutIndex = new GridIndex<JoineryCut>(pointCell(cutsSorted.map((c) => c.bbox)));
  for (const c of cutsSorted) cutIndex.insert(c.bbox, c);

  const pointBox = (p: Point): GridBox => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y });

  /**
   * Everything a group needs, from ONE index query.
   *
   * The candidate walls and the safe offset come out of the same scan because they read
   * the same thing: the band edges near the midpoint, with their exact distances. Asking
   * separately cost five queries per group (one for the offset, two per side for walls
   * and cuts) where one does.
   *
   * `dmin` counts only boundaries at least `SNAP_MM` away. Anything nearer is, by this
   * layer's own resolution, the same curve as the one being classified - which is exactly
   * what the group's coincident members are - so including it would collapse the offset
   * to nothing on every ordinary edge.
   */
  const contextAt = (mid: Point, cap: number): { walls: JoineryWall[]; dmin: number } => {
    const seen = new Set<number>();
    const walls: JoineryWall[] = [];
    let dmin = Number.POSITIVE_INFINITY;
    wallIndex.forEach(pointBox(mid), (i) => {
      const en = entries[i]!;
      const d = edgeDist(mid, en.edge);
      if (d >= SNAP_MM && d < dmin) dmin = d;
      if (d > en.reach || seen.has(en.wall.index)) return;
      seen.add(en.wall.index);
      walls.push(en.wall);
    });
    cutIndex.forEach(pointBox(mid), (c) => {
      for (const e of c.loop) {
        const d = edgeDist(mid, e);
        if (d >= SNAP_MM && d < dmin) dmin = d;
      }
    });
    walls.sort(byOwnership);
    return { walls, dmin: Math.min(cap, dmin / 2) };
  };

  const classified = edgeGroups.map((g) => {
    const span = edgeLength(g.rep);
    // The ceiling is deliberately SMALL - four times the interner's own fusing distance,
    // or a quarter of the edge if that is smaller. It does not need to be the largest
    // safe step, only a safe one, and a large ceiling makes the search box large too.
    let cap = Math.min(span / 4, SNAP_MM * 4);
    if (g.rep.t === "arc") cap = Math.min(cap, g.rep.arc.r / 4);
    const ctx = contextAt(g.mid, cap);
    // A floor keeps a pathologically close neighbour from collapsing the step to zero.
    const d = Math.max(ctx.dmin, 1e-9);
    const n = perp(edgeTangentAt(g.rep, g.mid));
    const read = (sign: 1 | -1): Owner => {
      const p = { x: g.mid.x + sign * n.x * d, y: g.mid.y + sign * n.y * d };
      return ownerAt(p, ctx.walls, cutIndex.queryBox(pointBox(p)));
    };
    return { edge: g.rep, plus: read(1), minus: read(-1) };
  });

  // OUTLINE: exactly one side owned. Directed so the solid is on the +perp side, which is
  // the clockwise-positive orientation this codebase uses for "material inside". No
  // dedupe pass is needed — the groups ARE the deduplication.
  const outlineEdges: Edge[] = [];
  for (const c of classified) {
    const inPlus = c.plus !== null;
    const inMinus = c.minus !== null;
    if (inPlus === inMinus) continue;
    outlineEdges.push(inPlus ? c.edge : reverseEdge(c.edge));
  }

  // FILL of group g: exactly one side owned BY THAT GROUP. A thinner wall's cap buried in
  // a thicker wall of another material therefore belongs to the thicker one, and two
  // groups' fills tile without overlapping.
  const fills = groups.map((group) => {
    const kept: Edge[] = [];
    for (const c of classified) {
      const inPlus = c.plus?.group === group;
      const inMinus = c.minus?.group === group;
      if (inPlus === inMinus) continue;
      kept.push(inPlus ? c.edge : reverseEdge(c.edge));
    }
    return { group, loops: finishLoops(chainLoops(kept)) };
  });

  return { outline: finishLoops(chainLoops(outlineEdges)), fills };
}

/**
 * Cell size for the EDGE-pair index: the median LONGER extent.
 *
 * A pair scan queries with a whole edge's box, so a cell smaller than an edge only makes
 * the same edge appear in more buckets — measured on `bench/`'s opening-heavy set, the
 * finer {@link pointCell} rule cost 40% MORE here. A POINT query is the opposite case,
 * which is why the two indices size their cells differently.
 */
function spanCell(boxes: readonly GridBox[]): number {
  if (boxes.length === 0) return 1;
  const ext = boxes.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)).sort((a, b) => a - b);
  const m = ext[Math.floor(ext.length / 2)]!;
  return m > 0 ? m : 1;
}

/**
 * Cell size for a POINT-query index (the wall and cut lookups behind `ownerAt`), from
 * the median box.
 *
 * Not the median LONGER extent, which is the obvious choice and is wrong for a point
 * query: a wall band is a long thin sliver (a 4.2 m run is 200 x 4200), so sizing cells
 * by the longer side gives cells metres across and drops a whole row of walls into one
 * bucket — every probe then winds every one of them.
 *
 * `max(shorter, longer / 8)` gives a cell on the scale of the geometry's own THICKNESS,
 * so a probe's cell holds only the walls actually near it. The `/ 8` floor keeps a
 * zero-thickness sliver from collapsing the cell to nothing.
 */
function pointCell(boxes: readonly GridBox[]): number {
  if (boxes.length === 0) return 1;
  const ext = boxes
    .map((b) => {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      return Math.max(Math.min(w, h), Math.max(w, h) / 8);
    })
    .sort((a, b) => a - b);
  const m = ext[Math.floor(ext.length / 2)]!;
  return m > 0 ? m : 1;
}

/** The union box of a wall's band loops — the caller's `bbox`, computed here for it. */
export const bandBBox = (loops: readonly EdgeLoop[]): GridBox => unionBBox(loops.map(loopBBox));

/* ---------------------------------------------------------------------------
 * Emission
 * ------------------------------------------------------------------------- */

/**
 * Loops → the Scene primitive that carries them.
 *
 * An ALL-STRAIGHT set becomes a `region`, the primitive every backend has serialized
 * since v0.9 — which is what keeps a rectilinear plan's bytes exactly where they were.
 * A set with any curve becomes a `path`, with each arc cut into unambiguously MINOR
 * pieces by the same `arcPieces` rule the `arc` primitive uses, because neither
 * primitive carries a large-arc flag.
 */
export function emitLoops(loops: readonly EdgeLoop[]): ScenePrim {
  const anyArc = loops.some((l) => l.some((e) => e.t === "arc"));
  if (!anyArc) {
    return { t: "region", loops: loops.map((l) => l.map((e) => edgeStart(e))) };
  }
  const out: PathLoop[] = loops.map((l) => {
    const edges: PathEdge[] = [];
    for (const e of l) {
      if (e.t === "line") edges.push({ t: "line", to: e.b });
      else {
        for (const piece of arcPieces(e.arc)) {
          edges.push({ t: "arc", to: piece.end, center: piece.center, r: piece.r, sweep: piece.sweep });
        }
      }
    }
    return { start: edgeStart(l[0]!), edges };
  });
  return { t: "path", loops: out };
}

/** Loops → plain polygons, for a hatch fill (arcs tessellated once, shared ends dropped). */
export const loopsToPolygons = (loops: readonly EdgeLoop[]): Point[][] => tessellateLoops(loops);

/** Re-exported so a caller can build a `JoineryWall` without importing two modules. */
export { unit2, lineLineParams };
