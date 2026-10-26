/**
 * Contact facts (plan-soundness card PS4.5): which room edges an element written at fixed
 * coordinates lies ON, so `arch impact` can say it stayed while that edge moved.
 *
 * A contact is geometric, read off the resolved shapes and never a bounding box:
 *
 * - an authored wall's straight segment whose centreline is collinear with a rectangular room's
 *   edge line and overlaps it by a positive length (a segment that only meets the edge at a
 *   corner, or a curved segment, is no contact);
 * - a furniture piece whose back edge (the footprint side its quarter-turn puts the back on,
 *   `backEdgeOfDeg`, `src/algebra/d4.ts`) is collinear with and overlaps a room edge.
 *
 * Collinear means equal on the 0.001 mm lattice (ADR 0022) in half-lattice units, sign-symmetric
 * (`keepHalfOf`, the scale the keep residuals use), so 1 mm off is no contact. A room edge is one
 * of the four of a rectangular room (`top` is the smaller `y`, the frame the resolved plan places
 * it in, the frame `diffPlans` reads); a polygon, circle, unplaced or zero-size room has no named
 * edge (it exposes no datum lines either, `src/room-datums.ts`) and so no contact. A derived wall
 * is never measured: it follows its rooms by construction.
 *
 * **Bounds.** Post-resolve and outside the evaluator (no meter there, `src/expr.ts`), so the work
 * is bounded by counts: the room edges are indexed by line (a map keyed by the axis and the line's
 * position) and sorted by start once, O(R log R) for R rooms; a probe binary-searches its line's
 * window (edges that start no earlier than its own start less the line's longest edge) and walks
 * it, so for rooms that do not overlap each other a probe costs O(log R + its contacts). Every
 * edge walked is counted, and past {@link MAX_CONTACT_PROBES} in one storey no further contact is
 * recorded (a pile of coincident rooms and walls only). An element lists at most
 * {@link MAX_CONTACTS_LISTED} distinct contacts, the first found in segment order.
 *
 * Pure, synchronous, deterministic (code-unit order, never `localeCompare`).
 */

import { backEdgeOfDeg } from "../algebra/d4.js";
import { segmentsOfWall } from "../geometry.js";
import type { RFurniture, RRoom, RWall } from "../ir.js";
import { keepHalfOf } from "../keep.js";

/** One of a rectangular room's four edges. */
export type RoomEdge = "top" | "bottom" | "left" | "right";

/** One contact: the room (its id as `describe()` prints it) and the edge the element lies on. */
export interface ContactFact {
  room: string;
  edge: RoomEdge;
}

/** The most contacts one element lists (the first found, in segment order). A count. */
export const MAX_CONTACTS_LISTED = 64;
/** The most room edges one storey's contact search walks before it records no more. A count. */
export const MAX_CONTACT_PROBES = 1_000_000;

/** A room edge as a line: the coordinate it fixes (`y` for `top`/`bottom`), where (mm), and
 *  the span it runs along the other coordinate (mm, `from` < `to`). */
export interface EdgeLine {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const EDGES: readonly RoomEdge[] = ["top", "bottom", "left", "right"];

/** The edge line of a rectangular room, or undefined for a room with no named edges. */
export function roomEdgeLine(r: RRoom, edge: RoomEdge): EdgeLine | undefined {
  if (r.poly || r.circle || r._unplaced || !(r.size.w > 0 && r.size.h > 0)) return undefined;
  const { x, y } = r.at;
  const { w, h } = r.size;
  switch (edge) {
    case "top":
      return { axis: "y", at: y, from: x, to: x + w };
    case "bottom":
      return { axis: "y", at: y + h, from: x, to: x + w };
    case "left":
      return { axis: "x", at: x, from: y, to: y + h };
    case "right":
      return { axis: "x", at: x + w, from: y, to: y + h };
  }
}

interface Entry {
  from: number;
  to: number;
  room: string;
  edge: RoomEdge;
}
interface Line {
  entries: Entry[];
  /** The longest entry on the line, in half-lattice units. */
  maxLen: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const lineKey = (axis: "x" | "y", at: number): string => `${axis}${at}`;

/** One storey's room edges, indexed by line; {@link ContactIndex.of} answers per element. */
export interface ContactIndex {
  /** The contacts of an authored wall or a furniture piece, less those with the rooms in
   *  `skip` (rooms it already records as a dependency), sorted by room then edge. */
  of(e: RWall | RFurniture, skip: ReadonlySet<string>): ContactFact[];
}

/** Index the room edges of one storey (its placed rectangular rooms). */
export function contactIndex(rooms: readonly RRoom[]): ContactIndex {
  const lines = new Map<string, Line>();
  for (const r of rooms) {
    for (const edge of EDGES) {
      const l = roomEdgeLine(r, edge);
      if (!l) continue;
      const k = lineKey(l.axis, keepHalfOf(l.at));
      let line = lines.get(k);
      if (!line) {
        line = { entries: [], maxLen: 0 };
        lines.set(k, line);
      }
      const from = keepHalfOf(l.from);
      const to = keepHalfOf(l.to);
      line.entries.push({ from, to, room: r.id, edge });
      if (to - from > line.maxLen) line.maxLen = to - from;
    }
  }
  for (const line of lines.values())
    line.entries.sort((a, b) => a.from - b.from || cmp(a.room, b.room) || cmp(a.edge, b.edge));
  let probes = 0;

  /** The first entry index whose `from` is at least `v`. */
  const lowerBound = (es: readonly Entry[], v: number): number => {
    let lo = 0;
    let hi = es.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (es[mid]!.from < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** Add the edges on line `(axis, at)` overlapping `[a, b]` (mm) to `out`. */
  const probe = (
    axis: "x" | "y",
    at: number,
    a: number,
    b: number,
    skip: ReadonlySet<string>,
    out: Map<string, ContactFact>,
  ): void => {
    const line = lines.get(lineKey(axis, keepHalfOf(at)));
    if (!line) return;
    const lo = keepHalfOf(Math.min(a, b));
    const hi = keepHalfOf(Math.max(a, b));
    if (hi <= lo) return;
    const es = line.entries;
    for (let i = lowerBound(es, lo - line.maxLen); i < es.length; i++) {
      if (probes >= MAX_CONTACT_PROBES || out.size >= MAX_CONTACTS_LISTED) return;
      probes++;
      const e = es[i]!;
      if (e.from >= hi) return;
      if (Math.min(e.to, hi) - Math.max(e.from, lo) <= 0 || skip.has(e.room)) continue;
      const k = `${e.room}\u0000${e.edge}`;
      if (!out.has(k)) out.set(k, { room: e.room, edge: e.edge });
    }
  };

  return {
    of(e, skip) {
      if (lines.size === 0) return [];
      const out = new Map<string, ContactFact>();
      if (e.kind === "wall") {
        for (const s of segmentsOfWall(e)) {
          if (s.arc) continue;
          const ay = keepHalfOf(s.a.y);
          const by = keepHalfOf(s.b.y);
          const ax = keepHalfOf(s.a.x);
          const bx = keepHalfOf(s.b.x);
          if (ay === by && ax !== bx) probe("y", s.a.y, s.a.x, s.b.x, skip, out);
          else if (ax === bx && ay !== by) probe("x", s.a.x, s.a.y, s.b.y, skip, out);
        }
      } else {
        const { x, y } = e.at;
        const { w, h } = e.size;
        switch (backEdgeOfDeg(e.rotate)) {
          case "top":
            probe("y", y, x, x + w, skip, out);
            break;
          case "bottom":
            probe("y", y + h, x, x + w, skip, out);
            break;
          case "left":
            probe("x", x, y, y + h, skip, out);
            break;
          case "right":
            probe("x", x + w, y, y + h, skip, out);
            break;
        }
      }
      return [...out.values()].sort((p, q) => cmp(p.room, q.room) || cmp(p.edge, q.edge));
    },
  };
}
