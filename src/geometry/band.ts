/**
 * The **band** of a wall: its two faces, its corners and its caps, as exact edge loops.
 *
 * A wall's solid has always been available as an area (`segmentSolid` gives the
 * square-capped rectangle of a straight run and the tessellated ring of a curve), but
 * only per SEGMENT — which is why two segments of the same wall draw a face line
 * straight through their shared corner. This module produces the whole wall as one
 * closed boundary instead, mitred at every interior vertex, with true arcs where the
 * wall curves. `./joinery.ts` then intersects bands with each other to remove the lines
 * that fall inside a neighbouring wall.
 *
 * ## The edge vocabulary
 *
 * An {@link EdgeLoop} is a closed sequence of {@link Edge}s — a straight `line` or a
 * true `arc` — where **consecutive edges share the same interned `Point` OBJECT**, not
 * merely equal coordinates. That identity is the whole point: the joinery layer chains
 * sub-edges by vertex key, and a corner that arrives from two directions as two
 * near-equal-but-distinct points is a corner the chainer cannot close. {@link PointInterner}
 * is the single place a positional tolerance is applied ({@link SNAP_MM}, via a
 * quantised key — see its comment for why that number and not a finer one); nothing
 * downstream compares coordinates with an epsilon of its own.
 *
 * ## The offset-sign convention, and how it is pinned
 *
 * A side is `σ ∈ {+1, −1}`, meaning `σ·h` along `perp(direction of travel)` — the
 * y-down screen rotation `../geometry.js`'s `normal()` applies. For a straight run that
 * is a plain translation. For an arc it is a CONCENTRIC offset, and the radius change
 * depends on which side of travel the centre is: travelling clockwise keeps the centre
 * on `+perp`, so moving along `+perp` moves TOWARD the centre. Hence
 *
 *     δ = −sign(sweep) · σ · h
 *
 * and the test that pins it is not an assertion about `δ` but about CONTINUITY: the
 * `σ = +1` face of a straight segment and of a tangent-continuous arc that follows it
 * must be one unbroken curve. Get the sign backwards and the two faces jump `2h` apart
 * at the join, which that test sees and a golden SVG would not.
 *
 * ## Mitre or bevel
 *
 * At an interior vertex the two adjacent faces on a side are extended to their meeting
 * point `M` (line–line, line–circle or circle–circle, all closed form in
 * `./intersect.js`; the nearest candidate to the original vertex wins). A mitre grows as
 * `1/sin(θ/2)`, so an acute joint shoots a needle out of the building: past
 * `MITER_LIMIT · h` — the same cap `scene.ts` puts on the stroke join, so the fill and
 * the stroke agree about where a spike stops — the corner is BEVELLED instead, keeping
 * both faces at their own offset endpoints and inserting a straight edge between them.
 * A tangent-continuous join mitres at a point that already IS both endpoints, so no
 * bevel edge appears; a zero-length bevel is dropped rather than emitted.
 *
 * ## Deliberate difference from `arcBandRing`
 *
 * `arcBandRing` caps a lone curved segment by MOVING its first and last tessellated
 * vertices out along the end tangents. That is a tessellation artifact — the first chord
 * then runs from the cap point to the second vertex, cutting the corner. Here the same
 * construction is expressed exactly: a straight cap TAIL of length `h` along the tangent,
 * then the full offset arc. The cap points are identical; the curve between them is a
 * real arc rather than a polyline whose first chord has been dragged. A lone STRAIGHT
 * segment, by contrast, reproduces `segmentRectangle`'s four points exactly — as a
 * cycle; see the orientation law on {@link wallBand} for why the direction is normalised.
 */

import type { Point } from "../ast.js";
import type { Arc } from "./arc.js";
import { arcExtremes, arcOffset, arcPointAt, arcTangentAt, arcTessellate } from "./arc.js";
import type { WallLike } from "../geometry.js";
import { distPointToWallSegment, segmentsOfWall } from "../geometry.js";
import type { GridBox } from "./grid-index.js";
import { MITER_LIMIT } from "../scene.js";
import type { Vec2 } from "./intersect.js";
import {
  arcParamSigned,
  circleCircle,
  lineCircleParams,
  meetLines,
  perp,
  rayCrossingArc,
  rayCrossingLine,
  sub2,
  unit2,
} from "./intersect.js";

/* ---------------------------------------------------------------------------
 * Edges and loops
 * ------------------------------------------------------------------------- */

/** One boundary edge: a straight run, or a true circular arc (exact signed sweep). */
export type Edge = { t: "line"; a: Point; b: Point } | { t: "arc"; arc: Arc };

/**
 * A closed boundary. The closing edge is present (edge `n−1` ends where edge `0`
 * starts); consecutive edges share the same interned `Point` object. A full circle is a
 * legal single-edge loop, with `a === b`.
 */
export type EdgeLoop = Edge[];

/** The point an edge starts at. */
export const edgeStart = (e: Edge): Point => (e.t === "line" ? e.a : e.arc.a);
/** The point an edge ends at. */
export const edgeEnd = (e: Edge): Point => (e.t === "line" ? e.b : e.arc.b);

/** The point halfway ALONG an edge (by arc length for a curve, not by chord). */
export function edgeMid(e: Edge): Point {
  if (e.t === "arc") return arcPointAt(e.arc, 0.5);
  return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
}

/** Unit direction of travel at `p` along an edge — the chord for a line, the tangent for an arc. */
export function edgeTangentAt(e: Edge, p: Point): Vec2 {
  return e.t === "arc" ? arcTangentAt(e.arc, p) : unit2(sub2(e.b, e.a));
}

/** Is this edge degenerate (zero length, or a zero sweep)? */
export function edgeIsNull(e: Edge): boolean {
  if (e.t === "arc") return !(e.arc.r > 0) || e.arc.sweep === 0;
  return e.a === e.b || (e.a.x === e.b.x && e.a.y === e.b.y);
}

/** The edge reversed: a line's ends swapped, an arc's sweep negated. */
export function reverseEdge(e: Edge): Edge {
  if (e.t === "line") return { t: "line", a: e.b, b: e.a };
  const arc = e.arc;
  return {
    t: "arc",
    arc: { center: arc.center, r: arc.r, a: arc.b, b: arc.a, sweep: -arc.sweep, start: arc.start + arc.sweep },
  };
}

/** The loop traversed the other way round — every edge reversed, in reverse order. */
export const reverseLoop = (loop: EdgeLoop): EdgeLoop => loop.map(reverseEdge).reverse();

/* ---------------------------------------------------------------------------
 * Point interning
 * ------------------------------------------------------------------------- */

/**
 * Quantisation of the interner's key: **a hundredth of a millimetre** — exactly `fmt2`'s
 * own output resolution, so *two points that print identically are one point*.
 *
 * This number is a robustness decision, not a rounding preference, and it was MEASURED
 * rather than guessed. Coordinates run to `1e4` mm at building scale, so plain double
 * arithmetic is good to about `1e-8` mm, which would suggest a far finer key. But a
 * near-tangent or very oblique crossing amplifies that error by a SQUARE ROOT - the
 * intersection's discriminant is near zero, so its two roots separate by the square root
 * of it. Three configurations measured while building this layer produced, where geometry
 * has exactly ONE crossing, two points **1e-5 mm** apart (an arc whose radius barely
 * exceeded half its chord), **7e-4 mm** apart (a 240 mm run capping into a 120 mm curved
 * one) and **1e-3 mm** apart (a curved band grazing a straight one's corner). At any
 * finer key each of those is two vertices, and the split phase then emits a spurious edge
 * a fraction of a micron long between them - which leaves the boundary graph with an odd
 * vertex and the chainer with a chain that cannot close.
 *
 * `0.01` mm is the resolution the DRAWING itself has: every coordinate that reaches a
 * backend goes through `fmt2`, which rounds to two decimals. So nothing this fuses could
 * ever have been drawn as two distinct points. It is also four orders below the thinnest
 * feature architecture contains, and exact on integers (`Math.round(n * 100)` is exact
 * for every coordinate a plan can hold), so a rectilinear plan's vertices are untouched.
 */
const KEY_SCALE = 1e2;

/**
 * The distance below which two points are the SAME vertex, in millimetres - the single
 * positional tolerance of the whole joinery layer.
 *
 * It is the cell size times **root 2, rounded up**, and that relation is load-bearing
 * rather than decorative: two points that share a key can be up to a cell DIAGONAL
 * apart, so a fuse radius smaller than the diagonal lets `pointKey` say "same" about two
 * points the interner kept distinct. Downstream that is not a rounding difference - the
 * chainer keys vertices by `pointKey`, so it read a 0.014 mm edge as a self-loop and
 * emitted it as a one-edge "loop" of its own. With this relation, **same key implies
 * same object**, and the two notions of identity cannot disagree.
 *
 * Exported so a consumer or a test DERIVES it rather than retyping it.
 */
export const SNAP_MM = 1.5 / KEY_SCALE;

/** Positional key of a point, at {@link SNAP_MM}, with `−0` normalised to `0`. */
export function pointKey(p: Point): string {
  const x = Math.round(p.x * KEY_SCALE);
  const y = Math.round(p.y * KEY_SCALE);
  return `${x === 0 ? 0 : x}|${y === 0 ? 0 : y}`;
}

/**
 * The single place a positional tolerance lives.
 *
 * Two points within {@link SNAP_MM} are the SAME vertex, and the first one registered
 * is the object every later caller gets back — so registration order is the canonical order,
 * and it is deterministic because the joinery layer registers in a fixed tag order.
 * Downstream code compares vertices by object identity or by {@link pointKey}, never by
 * subtracting coordinates and picking an epsilon.
 */
export class PointInterner {
  /** Registered points by CELL, each list in registration order. */
  private readonly cells = new Map<string, Array<{ p: Point; ord: number }>>();
  private next = 0;

  /**
   * The canonical object for this position, registering it if it is new.
   *
   * The lookup scans the point's own cell **and its eight neighbours**, not just its own.
   * That is the difference between "rounds to the same cell" and "is within `SNAP_MM`",
   * and it is not a refinement — a cell-only lookup leaves two points 0.0099 mm apart
   * distinct whenever they straddle a cell boundary, which measured out as a 0.01 mm
   * sliver edge between two adjacent keys and a chain that could not close. Among the
   * candidates within `SNAP_MM` the EARLIEST-registered wins, so the answer depends on
   * the caller's registration order and not on which neighbour the scan reached first.
   */
  get(p: Point): Point {
    const cx = Math.round(p.x * KEY_SCALE);
    const cy = Math.round(p.y * KEY_SCALE);
    let best: { p: Point; ord: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.cells.get(`${cx + dx}|${cy + dy}`);
        if (!list) continue;
        for (const c of list) {
          if (Math.hypot(c.p.x - p.x, c.p.y - p.y) > SNAP_MM) continue;
          if (!best || c.ord < best.ord) best = c;
        }
      }
    }
    if (best) return best.p;
    // Normalise -0 on the way in so a stored point never carries one.
    const canon: Point = { x: p.x === 0 ? 0 : p.x, y: p.y === 0 ? 0 : p.y };
    const key = `${cx === 0 ? 0 : cx}|${cy === 0 ? 0 : cy}`;
    const list = this.cells.get(key);
    const entry = { p: canon, ord: this.next++ };
    if (list) list.push(entry);
    else this.cells.set(key, [entry]);
    return canon;
  }

  /** How many distinct vertices have been registered (diagnostics and tests). */
  get size(): number {
    return this.next;
  }
}

/* ---------------------------------------------------------------------------
 * Loop measurements
 * ------------------------------------------------------------------------- */

/**
 * Exact signed area of a loop, **positive = clockwise on screen** (the sign convention
 * `polygon.ts`'s `polygonSignedArea2` and `elements/roof.ts` already use).
 *
 * Shoelace over the loop's vertices, plus for every arc edge the circular SEGMENT
 * between its chord and the curve: `(r²/2)(θ − sin θ)`, signed by the sweep. Because
 * `sin` is odd that collapses to `(r²/2)(sweep − sin sweep)` with no separate sign
 * bookkeeping, and it is exact — a full circle traversed clockwise contributes `+πr²`,
 * a drum of two semicircles the same. No tessellation is involved, so a curved band's
 * area does not depend on the tessellation step.
 */
export function loopArea(loop: EdgeLoop): number {
  let shoelace = 0;
  let bulge = 0;
  for (const e of loop) {
    const a = edgeStart(e);
    const b = edgeEnd(e);
    shoelace += a.x * b.y - b.x * a.y;
    if (e.t === "arc") bulge += (e.arc.r * e.arc.r * (e.arc.sweep - Math.sin(e.arc.sweep))) / 2;
  }
  return shoelace / 2 + bulge;
}

/**
 * Nonzero winding number of `loop` about `p` — `0` means outside. Half-open crossing
 * rule (see `./intersect.js`), so a point level with a vertex is counted once.
 */
export function loopWinding(loop: EdgeLoop, p: Point): number {
  let n = 0;
  for (const e of loop) {
    n += e.t === "arc" ? rayCrossingArc(p, e.arc) : rayCrossingLine(p, e.a, e.b);
  }
  return n;
}

/** Is `p` inside the multi-loop region under the nonzero fill rule? */
export function loopsContain(loops: readonly EdgeLoop[], p: Point): boolean {
  let n = 0;
  for (const l of loops) n += loopWinding(l, p);
  return n !== 0;
}

/**
 * Bounding box of a loop. An arc contributes its closed-form {@link arcExtremes} — its
 * endpoints plus every axis extreme inside the sweep — so a bulge is never sized from
 * its tessellation.
 */
export function loopBBox(loop: EdgeLoop): GridBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (p: Point): void => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of loop) {
    if (e.t === "arc") for (const p of arcExtremes(e.arc)) take(p);
    else {
      take(e.a);
      take(e.b);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** The union of several boxes (an empty list gives a zero box at the origin). */
export function unionBBox(boxes: readonly GridBox[]): GridBox {
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let { minX, minY, maxX, maxY } = boxes[0]!;
  for (const b of boxes) {
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A loop as a plain polygon — arcs tessellated through the ONE tessellator in
 * `./arc.js`, so a band's polygonal form has the same vertex-count rule as every other
 * curve in the compiler. Shared endpoints are emitted once.
 */
export function tessellateLoop(loop: EdgeLoop): Point[] {
  const out: Point[] = [];
  for (const e of loop) {
    if (e.t === "arc") {
      const pts = arcTessellate(e.arc);
      for (let i = 0; i < pts.length - 1; i++) out.push(pts[i]!);
    } else {
      out.push(e.a);
    }
  }
  return out;
}

/** {@link tessellateLoop} over a list of loops. */
export const tessellateLoops = (loops: readonly EdgeLoop[]): Point[][] => loops.map(tessellateLoop);

/* ---------------------------------------------------------------------------
 * Building a wall's band
 * ------------------------------------------------------------------------- */

/** What {@link wallBand} needs of a resolved wall — id and category are not read. */
export interface BandWall {
  thickness: number;
  points: readonly Point[];
  arcs?: ReadonlyArray<Arc | undefined>;
  closed: boolean;
}

/** One offset FACE, before it is joined to its neighbours. */
type Face = { t: "line"; a: Point; b: Point; d: Vec2 } | { t: "arc"; arc: Arc };

const asWallLike = (w: BandWall): WallLike => ({
  id: "",
  category: "",
  thickness: w.thickness,
  points: [...w.points],
  closed: w.closed,
  ...(w.arcs ? { arcs: w.arcs } : {}),
});

const faceStart = (f: Face): Point => (f.t === "line" ? f.a : f.arc.a);
const faceEnd = (f: Face): Point => (f.t === "line" ? f.b : f.arc.b);
const faceToEdge = (f: Face): Edge => (f.t === "line" ? { t: "line", a: f.a, b: f.b } : { t: "arc", arc: f.arc });

/**
 * The offset of one wall segment on side `σ`.
 *
 * For an arc the delta is `−sign(sweep)·σ·h` — see the header for the derivation, and
 * `test/band.test.ts`'s tangent-continuity case for the pin.
 */
function offsetFace(seg: { a: Point; b: Point; arc?: Arc }, sigma: 1 | -1, h: number): Face {
  if (seg.arc) {
    const delta = -Math.sign(seg.arc.sweep) * sigma * h;
    return { t: "arc", arc: arcOffset(seg.arc, delta) };
  }
  const d = unit2(sub2(seg.b, seg.a));
  const n = perp(d);
  return {
    t: "line",
    a: { x: seg.a.x + sigma * h * n.x, y: seg.a.y + sigma * h * n.y },
    b: { x: seg.b.x + sigma * h * n.x, y: seg.b.y + sigma * h * n.y },
    d,
  };
}

/** Candidate meeting points of two faces' supporting geometry (infinite line / full circle). */
function faceMeetCandidates(prev: Face, next: Face): Point[] {
  if (prev.t === "line" && next.t === "line") {
    const m = meetLines(prev.a, prev.d, next.a, next.d);
    return m ? [m] : [];
  }
  if (prev.t === "line" && next.t === "arc") {
    return lineCircleParams(prev.a, prev.d, next.arc.center, next.arc.r).map((s) => ({
      x: prev.a.x + s * prev.d.x,
      y: prev.a.y + s * prev.d.y,
    }));
  }
  if (prev.t === "arc" && next.t === "line") {
    return lineCircleParams(next.a, next.d, prev.arc.center, prev.arc.r).map((s) => ({
      x: next.a.x + s * next.d.x,
      y: next.a.y + s * next.d.y,
    }));
  }
  if (prev.t === "arc" && next.t === "arc") {
    return circleCircle(prev.arc.center, prev.arc.r, next.arc.center, next.arc.r);
  }
  return [];
}

/** An arc face re-cut so it ENDS at `M` (which must lie on its circle). */
function retargetArcEnd(arc: Arc, M: Point): Arc | null {
  const t = arcParamSigned(arc, M);
  if (!(t > -0.5 && t < 1.5)) return null;
  return { center: arc.center, r: arc.r, a: arc.a, b: M, sweep: arc.sweep * t, start: arc.start };
}

/** An arc face re-cut so it STARTS at `M` (which must lie on its circle). */
function retargetArcStart(arc: Arc, M: Point): Arc | null {
  const t = arcParamSigned(arc, M);
  if (!(t > -0.5 && t < 1.5)) return null;
  return { center: arc.center, r: arc.r, a: M, b: arc.b, sweep: arc.sweep * (1 - t), start: arc.start + arc.sweep * t };
}

/**
 * Join `faces[i]` to `faces[i+1]` at original vertex `V`, in place.
 *
 * Returns `true` when the pair was mitred (they now share `M`), `false` when it must be
 * bevelled — the caller then inserts a straight edge between the two face endpoints.
 */
function joinAt(faces: Face[], i: number, j: number, V: Point, h: number): boolean {
  const prev = faces[i]!;
  const next = faces[j]!;
  const candidates = faceMeetCandidates(prev, next);
  if (candidates.length === 0) return false;
  let M = candidates[0]!;
  let best = Math.hypot(M.x - V.x, M.y - V.y);
  for (const c of candidates.slice(1)) {
    const d = Math.hypot(c.x - V.x, c.y - V.y);
    if (d < best) {
      best = d;
      M = c;
    }
  }
  // The mitre cap: a joint's point grows as 1/sin(θ/2), so an acute corner would shoot a
  // needle out of the building. Same limit the stroke join uses, so fill and stroke agree.
  if (!(best <= MITER_LIMIT * h)) return false;
  const newPrev: Face | null = prev.t === "line" ? { ...prev, b: M } : mapArcFace(retargetArcEnd(prev.arc, M));
  const newNext: Face | null = next.t === "line" ? { ...next, a: M } : mapArcFace(retargetArcStart(next.arc, M));
  if (!newPrev || !newNext) return false;
  faces[i] = newPrev;
  faces[j] = newNext;
  return true;
}

const mapArcFace = (arc: Arc | null): Face | null => (arc ? { t: "arc", arc } : null);

/** Push a point `d` mm along `t` (the square cap at an open end). */
const along = (p: Point, t: Vec2, d: number): Point => ({ x: p.x + t.x * d, y: p.y + t.y * d });

/**
 * The band of one wall as closed edge loops.
 *
 * An OPEN wall gives exactly one loop: the `σ = +1` faces out, an end cap, the `σ = −1`
 * faces back, a start cap. A CLOSED ring gives two — an outer loop and a hole.
 *
 * **Every returned loop obeys the ORIENTATION LAW: the wall's material lies on the
 * `+perp` side of travel** (outer loops positive, holes negative). That is not
 * cosmetic — it is what lets `./joinery.ts` decide which side of an edge is solid
 * ANALYTICALLY, with no epsilon probe at all, so a near-tangent neighbouring band can
 * never flip the answer on one sub-edge and not on the one beside it. Which SIDE of a
 * closed ring is the outer one is decided by exact signed area, never by a fixed `σ`:
 * a ring written clockwise puts `σ = +1` inside, and one written counter-clockwise puts
 * it outside.
 *
 * The one visible cost: `segmentRectangle`'s own four-point order runs counter-clockwise
 * on screen, so a lone straight segment's loop is that same four-point CYCLE traversed
 * the other way round rather than that exact array.
 *
 * A wall of non-positive thickness, or with fewer than one non-degenerate segment,
 * produces no loops rather than an empty or inverted one.
 *
 * On a segment shorter than the wall is thick the inner face inverts (its two ends cross
 * over). The edges are produced anyway and the nonzero winding rule over-covers the
 * pinch — which is what a drawing wants: the poché is solid there, rather than carrying
 * a hole the wall does not have.
 */
export function wallBand(w: BandWall, intern: PointInterner): EdgeLoop[] {
  const h = w.thickness / 2;
  if (!(h > 0)) return [];
  const all = segmentsOfWall(asWallLike(w));
  const segs = all.filter((s) => (s.arc ? s.arc.sweep !== 0 && s.arc.r > 0 : s.a.x !== s.b.x || s.a.y !== s.b.y));
  if (segs.length === 0) return [];
  // Is the run actually a CYCLE? **Not "did the author write `close`"**, and not a
  // segment count: `examples/aquarium.arch`'s drum is two semicircular arcs plus a
  // zero-length closing segment, so a `points.length > 2` or `segs.length >= 3` rule
  // would call a closed circle an open run and cap it. The honest test is whether what
  // SURVIVED filtering ends where it began.
  //
  // The `close` keyword is what makes `segmentsOfWall` ADD a final segment back to the
  // first point; it is not, and must not be, the test for whether the result is a ring.
  // A polyline whose last point IS its first needs no such segment and is already a
  // cycle — and for a curve that is the ONLY spelling there is, because there is no
  // close-an-arc form: a closed curve is written as the two halves it is
  // (`examples/hexagon-pavilion.arch`'s 1200 mm drum, whose own header says so). Reading
  // `w.closed` here capped that drum twice at its seam, each cap standing `h` proud of
  // the curving face along the end tangent — a 100 mm step, 1200 mm tall, on ONE side of
  // an otherwise symmetric ring, because the seam is at 3 o'clock and nothing marks it
  // at 9 o'clock. Nothing about that is specific to arcs: a straight polyline written
  // back to its own first point was mitred at every vertex except that one.
  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  const cyclic = segs.length >= 2 && pointKey(last.b) === pointKey(first.a);

  const build = (sigma: 1 | -1): { faces: Face[]; bevels: Map<number, boolean> } => {
    const faces = segs.map((s) => offsetFace(s, sigma, h));
    const bevels = new Map<number, boolean>();
    const joins = cyclic ? segs.length : segs.length - 1;
    for (let k = 0; k < joins; k++) {
      const i = k;
      const j = (k + 1) % segs.length;
      const V = segs[j]!.a;
      bevels.set(i, !joinAt(faces, i, j, V, h));
    }
    return { faces, bevels };
  };

  const plus = build(1);
  const minus = build(-1);

  const finish = (edges: Edge[]): EdgeLoop => internLoop(edges, intern);

  if (cyclic) {
    const outEdges = sideLoopEdges(plus.faces, plus.bevels);
    const inEdges = reverseLoop(sideLoopEdges(minus.faces, minus.bevels));
    const a = finish(outEdges);
    const b = finish(inEdges);
    if (a.length === 0 || b.length === 0) return [a, b].filter((l) => l.length > 0);
    // Outer = the larger area; then force outer positive and hole negative, so nonzero
    // filling gives a wall ring a real hole however the author wound the wall.
    const [outer, hole] = Math.abs(loopArea(a)) >= Math.abs(loopArea(b)) ? [a, b] : [b, a];
    return [loopArea(outer) > 0 ? outer : reverseLoop(outer), loopArea(hole) < 0 ? hole : reverseLoop(hole)];
  }

  // Open run: extend the two end faces by h along their own tangents (the square cap
  // `segmentRectangle` and `arcBandRing` both apply), then stitch +σ out and −σ back.
  // BOTH caps are applied before the run is read: `capEnd` MUTATES a line face in place
  // (that is what keeps a lone straight segment to exactly four points), so reading the
  // run between the two calls would emit the un-extended face and lose the far cap.
  const sideRun = (side: { faces: Face[]; bevels: Map<number, boolean> }): Edge[] => {
    const head = capEnd(side.faces, "start", h);
    const tail = capEnd(side.faces, "end", h);
    return [...head, ...sideRunEdges(side.faces, side.bevels), ...tail];
  };
  const plusEdges = sideRun(plus);
  const minusEdges = sideRun(minus);
  const back = reverseLoop(minusEdges);
  const endCap: Edge = { t: "line", a: edgeEnd(plusEdges[plusEdges.length - 1]!), b: edgeStart(back[0]!) };
  const startCap: Edge = { t: "line", a: edgeEnd(back[back.length - 1]!), b: edgeStart(plusEdges[0]!) };
  const loop = finish([...plusEdges, endCap, ...back, startCap]);
  if (loop.length === 0) return [];
  // Normalised POSITIVE, like the closed ring's outer loop - see the header's
  // orientation law. `segmentRectangle`'s own vertex order is counter-clockwise on
  // screen, so a lone straight segment's loop is that same four-point cycle traversed
  // the other way round.
  return [loopArea(loop) > 0 ? loop : reverseLoop(loop)];
}

/**
 * The cap tail at one open end.
 *
 * A LINE face is simply extended — its own endpoint moves — so a lone straight segment
 * reproduces `segmentRectangle`'s four points exactly and adds no fifth edge. An ARC
 * face cannot be extended along itself, so the cap becomes a short straight tail of
 * length `h` along the end tangent: the same two cap POINTS `arcBandRing` computes, with
 * a real arc between them instead of a dragged first chord.
 */
function capEnd(faces: Face[], which: "start" | "end", h: number): Edge[] {
  const idx = which === "start" ? 0 : faces.length - 1;
  const f = faces[idx]!;
  if (f.t === "line") {
    if (which === "start") faces[idx] = { ...f, a: along(f.a, f.d, -h) };
    else faces[idx] = { ...f, b: along(f.b, f.d, h) };
    return [];
  }
  if (which === "start") {
    const t = arcTangentAt(f.arc, f.arc.a);
    return [{ t: "line", a: along(f.arc.a, t, -h), b: f.arc.a }];
  }
  const t = arcTangentAt(f.arc, f.arc.b);
  return [{ t: "line", a: f.arc.b, b: along(f.arc.b, t, h) }];
}

/** The faces of one side of an OPEN run, with a bevel edge wherever the mitre was refused. */
function sideRunEdges(faces: Face[], bevels: Map<number, boolean>): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < faces.length; i++) {
    out.push(faceToEdge(faces[i]!));
    if (i < faces.length - 1 && bevels.get(i)) {
      out.push({ t: "line", a: faceEnd(faces[i]!), b: faceStart(faces[i + 1]!) });
    }
  }
  return out;
}

/** The faces of one side of a CLOSED ring, including the bevel at the wrap-around join. */
function sideLoopEdges(faces: Face[], bevels: Map<number, boolean>): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < faces.length; i++) {
    out.push(faceToEdge(faces[i]!));
    if (bevels.get(i)) {
      const next = faces[(i + 1) % faces.length]!;
      out.push({ t: "line", a: faceEnd(faces[i]!), b: faceStart(next) });
    }
  }
  return out;
}

/**
 * Give every junction of a closed edge sequence its canonical interned `Point`, and drop
 * the edges that collapse to nothing once fused. Each edge's END becomes the NEXT edge's
 * interned START, so the loop closes on object identity rather than on coordinates that
 * agree to within an ulp.
 */
function internLoop(edges: Edge[], intern: PointInterner): EdgeLoop {
  if (edges.length === 0) return [];
  const starts = edges.map((e) => intern.get(edgeStart(e)));
  const out: EdgeLoop = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const a = starts[i]!;
    const b = starts[(i + 1) % edges.length]!;
    const joined: Edge = e.t === "line" ? { t: "line", a, b } : { t: "arc", arc: { ...e.arc, a, b } };
    if (!edgeIsNull(joined)) out.push(joined);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Opening cuts
 * ------------------------------------------------------------------------- */

/** What {@link openingCut} needs of a resolved opening. */
export interface CutOpening {
  at: Point;
  width: number;
}

/**
 * The volume a door/window/opening removes from its host wall, as one closed loop.
 *
 * The host is the nearest segment over ALL of the wall's segments, curves included,
 * measured by `distPointToWallSegment` — the same nearest-host rule every other consumer
 * uses, so an opening cannot be attributed to one segment by the renderer and another by
 * `describe()`.
 *
 * The loop obeys the same ORIENTATION LAW as a band's: the cut's interior is on the
 * `+perp` side of travel. Its two long edges lie EXACTLY on the host wall's faces (both
 * span the full `± thickness/2`), so the joinery layer sees them as coincident with
 * those faces and reads which side is void from this orientation — which is why the law
 * has to hold here too, not only for bands.
 *
 * On a STRAIGHT host it is the rotated rectangle spanning `width` along the segment and
 * the full wall thickness across it — the arithmetic `scene-build.ts`'s `openingPoly`
 * has always used, moved here so there is one copy. On a CURVED host it is the annular
 * sector between `r ± h`, bounded by RADIAL jamb lines: the half-angle is `hw / r`, so
 * the opening spans its width by ARC LENGTH, exactly as `on <wall> at <pos>` walks a
 * curve by run length rather than by chord.
 */
export function openingCut(w: BandWall, op: CutOpening, intern: PointInterner): EdgeLoop | null {
  const h = w.thickness / 2;
  if (!(h > 0) || !(op.width > 0)) return null;
  const segs = segmentsOfWall(asWallLike(w));
  let host: (typeof segs)[number] | null = null;
  let best = Infinity;
  for (const s of segs) {
    const d = distPointToWallSegment(op.at, s);
    if (d < best) {
      best = d;
      host = s;
    }
  }
  if (!host) return null;
  const hw = op.width / 2;

  if (!host.arc) {
    const dir = unit2(sub2(host.b, host.a));
    const n = perp(dir);
    const corner = (u: number, v: number): Point => ({
      x: op.at.x + dir.x * u + n.x * v,
      y: op.at.y + dir.y * u + n.y * v,
    });
    const pts = [corner(-hw, -h), corner(hw, -h), corner(hw, h), corner(-hw, h)];
    return positive(
      internLoop(
        pts.map((p, i) => ({ t: "line", a: p, b: pts[(i + 1) % pts.length]! }) as Edge),
        intern,
      ),
    );
  }

  const arc = host.arc;
  if (!(arc.r > h)) return null; // a hole through the centre is not a doorway
  const dir = arc.sweep >= 0 ? 1 : -1;
  const thc = Math.atan2(op.at.y - arc.center.y, op.at.x - arc.center.x);
  const half = Math.min(Math.PI, hw / arc.r);
  const th0 = thc - dir * half;
  const th1 = thc + dir * half;
  const at = (th: number, r: number): Point => ({
    x: arc.center.x + r * Math.cos(th),
    y: arc.center.y + r * Math.sin(th),
  });
  const outerR = arc.r + h;
  const innerR = arc.r - h;
  const outer: Arc = {
    center: arc.center,
    r: outerR,
    a: at(th0, outerR),
    b: at(th1, outerR),
    sweep: dir * 2 * half,
    start: th0,
  };
  const inner: Arc = {
    center: arc.center,
    r: innerR,
    a: at(th1, innerR),
    b: at(th0, innerR),
    sweep: -dir * 2 * half,
    start: th1,
  };
  return positive(
    internLoop(
      [
        { t: "arc", arc: outer },
        { t: "line", a: outer.b, b: inner.a },
        { t: "arc", arc: inner },
        { t: "line", a: inner.b, b: outer.a },
      ],
      intern,
    ),
  );
}

/**
 * The loop oriented so its interior is on the `+perp` side of travel — the same
 * orientation law {@link wallBand} normalises its band loops to, so a cut and a band
 * can be asked the same question in the same way.
 */
const positive = (loop: EdgeLoop): EdgeLoop => (loopArea(loop) >= 0 ? loop : reverseLoop(loop));
