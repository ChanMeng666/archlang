/**
 * **The pieces of a walled face's unassigned floor**, and whether a person could stand in one
 * (`W_FLOOR_UNASSIGNED`, `src/lint/rules/enclosure.ts`).
 *
 * {@link faceCover} measures the floor of a face that no room covers as one figure. That floor
 * may lie in several separate pieces (a bay beyond a room's straight edge, a strip along a wall,
 * a corner a round room leaves), and the rule judges each piece on its own: its area, and
 * whether it holds a circle as wide as a standing person.
 *
 * **The pieces, from the measurement's own boundary.** Every boundary piece `faceCover` counted
 * is walked with the unassigned floor on its `+n` side (`BoundaryPiece.side`), so the pieces
 * chain end to start into closed loops (ends matched through the joinery's {@link PointInterner},
 * the one positional tolerance). Each loop's signed area is the sum of its pieces' closed-form
 * contributions (`BoundaryPiece.signed`, ADR 0027's boundary integral): an outer boundary comes
 * out positive, a hole (a room standing free in the floor) negative. A hole belongs to the
 * smallest outer loop that winds round a point of it, and a piece of floor is one outer loop
 * with its holes: its area is theirs summed. Nothing is sampled and no box enters a figure.
 *
 * **Standing room: an erosion, exactly.** A piece holds a circle of diameter `d` exactly when
 * the piece eroded by `r = d / 2` — the points at least `r` from its boundary — is not empty.
 * When it is not, that eroded set has a boundary point that is a CORNER of it (where two of
 * the curves below cross) or an END of one of them, because its boundary is made of pieces of:
 * each straight edge moved `r` into the floor, each arc's concentric arc `r` into the floor, and
 * the circles of radius `r` about the boundary's vertices; a closed curve of those alone with
 * no corner and no end is one full concentric circle, whose end is its start. So the candidates
 * are every crossing of two such curves and every end of a moved edge, each tested exactly: it
 * is in the piece (winding over the piece's loops) and no boundary curve is nearer than `r`
 * ({@link distPointToSegment}, {@link distPointToArc}). A candidate that passes is the centre of
 * such a circle; when none passes, the eroded set is empty. Curves are lines and true arcs
 * throughout: no tessellation.
 *
 * **Budget.** The work is counted and offered to the caller's `admit` before it runs (lint runs
 * after resolution, where the step meter is off; the rule spends `MAX_EVAL_STEPS`, `src/expr.ts`,
 * as `outdoor.ts` does): one unit per piece chained, per loop read for a hole's owner, per pair of
 * curves crossed, and per boundary piece read for each candidate's two tests. Past it the answer is
 * `null` and the rule says so in its coverage report.
 *
 * Pure, synchronous, deterministic: pieces in the measurement's own order, loops in the order
 * their first piece appears, candidates in curve order.
 */

import type { Point } from "../ast.js";
import { type Arc, distPointToArc } from "../geometry/arc.js";
import { type Edge, edgeEnd, edgeStart, loopWinding, PointInterner, pointKey } from "../geometry/band.js";
import type { GridBox } from "../geometry/grid-index.js";
import { circleCircle, lineCircleParams, meetLines, reverseArc } from "../geometry/intersect.js";
import { distPointToSegment } from "../geometry/polygon.js";
import { boxesMeet, lineBox } from "./net-area.js";
import type { FacePiece } from "./wall-faces.js";

/**
 * How far inside the clearance a boundary may come and the circle still count (mm): a micron,
 * the float noise of a crossing computed through a square root, far below any drawn size. A
 * piece exactly as wide as the circle holds it.
 */
const CLEAR_TOL_MM = 1e-3;

/** A loop whose area is under this (mm²) is a sliver of the split, not floor: it is dropped. */
const NULL_LOOP_MM2 = 1;

/** One boundary piece, walked with the unassigned floor on its `+n` side. */
interface DirectedEdge {
  edge: Edge;
  /** The piece's own box (an arc by its whole circle): a filter only. */
  box: GridBox;
  /** Its contribution to the area, walked this way. */
  signed: number;
  from: FacePiece;
}

/** One connected piece of a face's unassigned floor. */
export interface UnassignedPiece {
  /** Its floor area (mm²): its outer loop less its holes. */
  area: number;
  /** The cover elements (indices into the `rooms` `faceCover` was given) whose edge bounds it, ascending. */
  owners: number[];
  /** The midpoints of its boundary pieces that lie on the face's own walls. */
  wallMids: Point[];
  /** Does a curved wall bound it? */
  curvedWall: boolean;
  /** Its boundary, loop by loop (the outer loop first): directed, the floor on each edge's `+n` side. */
  loops: Edge[][];
}

const edgeBox = (e: Edge): GridBox =>
  e.t === "line"
    ? lineBox(e.a, e.b)
    : {
        minX: e.arc.center.x - e.arc.r,
        minY: e.arc.center.y - e.arc.r,
        maxX: e.arc.center.x + e.arc.r,
        maxY: e.arc.center.y + e.arc.r,
      };

function directed(fp: FacePiece): DirectedEdge {
  const { piece, curve } = fp;
  const forward = piece.side === 1;
  let edge: Edge;
  if (curve.t === "line") {
    edge = forward ? { t: "line", a: piece.p0, b: piece.p1 } : { t: "line", a: piece.p1, b: piece.p0 };
  } else {
    const arc = curve.arc;
    const sub: Arc = {
      center: arc.center,
      r: arc.r,
      a: piece.p0,
      b: piece.p1,
      sweep: arc.sweep * (piece.t1 - piece.t0),
      start: arc.start + arc.sweep * piece.t0,
    };
    edge = { t: "arc", arc: forward ? sub : reverseArc(sub) };
  }
  return { edge, box: edgeBox(edge), signed: piece.signed, from: fp };
}

/**
 * The connected pieces of one face's unassigned floor, from the boundary pieces
 * {@link faceCover} counted for it — or `null` when they do not chain into closed loops, a hole
 * has no outer loop round it, or `admit` refuses the work (the rule then judges the face by its
 * cover share alone).
 */
export function unassignedPieces(
  pieces: readonly FacePiece[],
  admit: (units: number) => boolean,
): UnassignedPiece[] | null {
  if (!admit(pieces.length)) return null;
  const edges = pieces.map(directed);
  const intern = new PointInterner();
  const fromKey: string[] = [];
  const toKey: string[] = [];
  for (const e of edges) {
    fromKey.push(pointKey(intern.get(edgeStart(e.edge))));
    toKey.push(pointKey(intern.get(edgeEnd(e.edge))));
  }
  const leaving = new Map<string, number[]>();
  fromKey.forEach((k, i) => {
    const list = leaving.get(k);
    if (list) list.push(i);
    else leaving.set(k, [i]);
  });
  // Chain: from each unused piece, follow the first unused piece leaving where it ends, until
  // the walk is back where it began. A vertex two loops touch at is passed through either way;
  // each loop's area is the same sum.
  const used = edges.map(() => false);
  const loops: Array<{ edges: number[]; area: number }> = [];
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const loop: number[] = [];
    let area = 0;
    let cur = i;
    for (;;) {
      used[cur] = true;
      loop.push(cur);
      area += edges[cur]!.signed;
      if (toKey[cur] === fromKey[i]) break;
      const next = (leaving.get(toKey[cur]!) ?? []).find((j) => !used[j]);
      if (next === undefined) return null;
      cur = next;
    }
    if (Math.abs(area) >= NULL_LOOP_MM2) loops.push({ edges: loop, area });
  }
  const outer = loops.filter((l) => l.area > 0);
  const holes = loops.filter((l) => l.area < 0);
  const asEdges = (l: { edges: number[] }): Edge[] => l.edges.map((k) => edges[k]!.edge);
  const outerEdges = outer.map(asEdges);
  if (!admit(holes.length * outerEdges.reduce((n, l) => n + l.length, 0))) return null;
  const holesOf: number[][] = outer.map(() => []);
  for (let h = 0; h < holes.length; h++) {
    const probe = edges[holes[h]!.edges[0]!]!.from.piece.mid;
    let best = -1;
    outer.forEach((o, k) => {
      if (loopWinding(outerEdges[k]!, probe) === 0) return;
      if (best < 0 || o.area < outer[best]!.area) best = k;
    });
    if (best < 0) return null;
    holesOf[best]!.push(h);
  }
  return outer.map((o, k) => {
    const members = [o, ...holesOf[k]!.map((h) => holes[h]!)];
    const all = members.flatMap((l) => l.edges.map((i) => edges[i]!));
    const owners = [...new Set(all.map((e) => e.from.owner).filter((n) => n >= 0))].sort((a, b) => a - b);
    const onWalls = all.filter((e) => e.from.owner < 0);
    return {
      area: members.reduce((n, l) => n + l.area, 0),
      owners,
      wallMids: onWalls.map((e) => e.from.piece.mid),
      curvedWall: onWalls.some((e) => e.edge.t === "arc"),
      loops: members.map(asEdges),
    };
  });
}

/** A curve the eroded set's boundary is drawn from: a moved straight edge, or a circle. */
type Offset = { t: "line"; p: Point; d: Point; box: GridBox } | { t: "circle"; c: Point; r: number; box: GridBox };

const grow = (b: GridBox, by: number): GridBox => ({
  minX: b.minX - by,
  minY: b.minY - by,
  maxX: b.maxX + by,
  maxY: b.maxY + by,
});

/**
 * Does `piece` hold a circle of diameter `diameter` (mm) — is it, anywhere, at least half that
 * from its own boundary? `null` when `admit` refuses the work. Exact, by the erosion's corners
 * and ends (module header).
 */
export function holdsCircle(
  piece: UnassignedPiece,
  diameter: number,
  admit: (units: number) => boolean,
): boolean | null {
  const r = diameter / 2;
  if (!(r > 0)) return piece.area > 0;
  const edges = piece.loops.flat();
  const offsets: Offset[] = [];
  const candidates: Point[] = [];
  const vertices = new PointInterner();
  const seen = new Set<string>();
  for (const e of edges) {
    const v = vertices.get(edgeStart(e));
    const key = pointKey(v);
    if (!seen.has(key)) {
      seen.add(key);
      offsets.push({ t: "circle", c: v, r, box: grow({ minX: v.x, minY: v.y, maxX: v.x, maxY: v.y }, r) });
    }
    const box = grow(edgeBox(e), r);
    if (e.t === "line") {
      const d = { x: e.b.x - e.a.x, y: e.b.y - e.a.y };
      const len = Math.hypot(d.x, d.y);
      if (!(len > 0)) continue;
      // The floor is on the +n side, n = (−d.y, d.x) / |d|.
      const n = { x: -d.y / len, y: d.x / len };
      const p = { x: e.a.x + n.x * r, y: e.a.y + n.y * r };
      offsets.push({ t: "line", p, d, box });
      candidates.push(p, { x: e.b.x + n.x * r, y: e.b.y + n.y * r });
    } else {
      const { center, r: R, sweep } = e.arc;
      // +n is (−cos θ, −sin θ)·sign(sweep): toward the centre on a positive sweep.
      const rho = sweep > 0 ? R - r : R + r;
      if (Math.abs(rho) <= CLEAR_TOL_MM) candidates.push(center);
      if (!(rho > CLEAR_TOL_MM)) continue;
      offsets.push({ t: "circle", c: center, r: rho, box });
      for (const q of [e.arc.a, e.arc.b])
        candidates.push({
          x: center.x + ((q.x - center.x) * rho) / R,
          y: center.y + ((q.y - center.y) * rho) / R,
        });
    }
  }
  // Every crossing costs at most two candidates: the pairs are charged before they are crossed.
  if (!admit(offsets.length * offsets.length)) return null;
  for (let i = 0; i < offsets.length; i++) {
    const f = offsets[i]!;
    for (let j = i + 1; j < offsets.length; j++) {
      const g = offsets[j]!;
      if (!boxesMeet(f.box, g.box, 0)) continue;
      if (f.t === "line" && g.t === "line") {
        const m = meetLines(f.p, f.d, g.p, g.d);
        if (m) candidates.push(m);
      } else if (f.t === "circle" && g.t === "circle") {
        candidates.push(...circleCircle(f.c, f.r, g.c, g.r));
      } else {
        const [ln, ci] = f.t === "line" ? [f, g as Offset & { t: "circle" }] : [g as Offset & { t: "line" }, f];
        for (const s of lineCircleParams(ln.p, ln.d, ci.c, ci.r))
          candidates.push({ x: ln.p.x + ln.d.x * s, y: ln.p.y + ln.d.y * s });
      }
    }
  }
  if (!admit(candidates.length * 2 * edges.length)) return null;
  const reach = r - CLEAR_TOL_MM;
  for (const q of candidates) {
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    let clear = true;
    for (const e of edges) {
      const d = e.t === "line" ? distPointToSegment(q, e.a, e.b) : distPointToArc(q, e.arc);
      if (d < reach) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    let w = 0;
    for (const l of piece.loops) w += loopWinding(l, q);
    if (w !== 0) return true;
  }
  return false;
}
