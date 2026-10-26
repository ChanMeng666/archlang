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
 * (`keepHalfOf`, the scale the keep residuals use), so 0.001 mm off is no contact. Each value is
 * put on the lattice on its own before the comparison (not the difference rounded once, as a keep
 * residual is, ADR 0033 R6 as amended): a contact is "the same lattice line", not a measured gap.
 * A room edge is one of the four of a rectangular room, named in the resolved plan's frame (`top`
 * is the smaller `y`: the datum as it reads at the plan root, the frame `diffPlans` reads, not as a
 * turned component spells it); a polygon, circle, unplaced or zero-size room has no named edge (it
 * exposes no datum lines either, `src/room-datums.ts`) and so no contact. A derived wall is never
 * measured: it follows its rooms by construction.
 *
 * **Bounds.** Post-resolve and outside the evaluator (no meter there, `src/expr.ts`), so the work
 * is bounded by counts. The room edges are indexed by line (a map keyed by the axis and the line's
 * position) and, on each line, by LENGTH CLASS (`⌊log₂ length⌋` in half-lattice units, at most ~37
 * classes over `MODEL_RANGE_MM`), each class sorted by start once: O(R log R) for R rooms. A probe
 * `[lo, hi]` searches each class whose line it is on: an edge of class `c` (length < 2^(c+1)) can
 * overlap only if it starts after `lo − 2^(c+1)`, so a binary search finds that window and the walk
 * stops at the first start ≥ `hi`. Inside the window the edges that do not overlap start in
 * `[lo − 2^(c+1), lo − 2^c]`, a span shorter than any of them, so for rooms that do not overlap each
 * other each class walks O(1) misses: a probe costs O(log R · classes + its contacts) = O(log² R +
 * its contacts). A long edge on the line (a corridor) costs its own class one search, never a walk
 * over the short ones. Every edge walked is counted, and past {@link MAX_CONTACT_PROBES} in one
 * storey no further contact is recorded (a pile of coincident rooms and walls only):
 * {@link ContactIndex.truncated} then says so, and `describe` prints `contacts_truncated: true`.
 *
 * An element lists at most {@link MAX_CONTACTS_LISTED} contacts, chosen by sorted room id (code-unit
 * order): the rooms are taken whole, in id order, while their contacts fit, so the listed ROOM SET
 * does not depend on the frame the plan is placed in (an edge name does; a room's edges come or go
 * together). A cut is also reported by {@link ContactIndex.truncated}.
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

/** The most contacts one element lists (whole rooms, in room-id order). A count. */
export const MAX_CONTACTS_LISTED = 64;
/** The most room edges one storey's contact search walks before it records no more. A count. */
export const MAX_CONTACT_PROBES = 1_000_000;

/** A line piece: the coordinate it fixes (`y` for a horizontal piece), where (mm), and the span
 *  it runs along the other coordinate (mm, unordered). */
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

/**
 * The axis-parallel line pieces an element can touch a room edge with: an authored wall's
 * straight, axis-parallel segments of positive length; a furniture piece's back edge.
 */
export function contactLines(e: RWall | RFurniture): EdgeLine[] {
  const out: EdgeLine[] = [];
  if (e.kind === "wall") {
    for (const s of segmentsOfWall(e)) {
      if (s.arc) continue;
      const same = (p: number, q: number): boolean => keepHalfOf(p) === keepHalfOf(q);
      if (same(s.a.y, s.b.y) && !same(s.a.x, s.b.x)) out.push({ axis: "y", at: s.a.y, from: s.a.x, to: s.b.x });
      else if (same(s.a.x, s.b.x) && !same(s.a.y, s.b.y)) out.push({ axis: "x", at: s.a.x, from: s.a.y, to: s.b.y });
    }
    return out;
  }
  const { x, y } = e.at;
  const { w, h } = e.size;
  switch (backEdgeOfDeg(e.rotate)) {
    case "top":
      out.push({ axis: "y", at: y, from: x, to: x + w });
      break;
    case "bottom":
      out.push({ axis: "y", at: y + h, from: x, to: x + w });
      break;
    case "left":
      out.push({ axis: "x", at: x, from: y, to: y + h });
      break;
    case "right":
      out.push({ axis: "x", at: x + w, from: y, to: y + h });
      break;
  }
  return out;
}

/** Does the element still have a contact line on `(axis, at)`, on the lattice? */
export function liesOnLine(e: RWall | RFurniture, axis: "x" | "y", at: number): boolean {
  const h = keepHalfOf(at);
  return contactLines(e).some((l) => l.axis === axis && keepHalfOf(l.at) === h);
}

interface Entry {
  from: number;
  to: number;
  room: string;
  edge: RoomEdge;
  /** Its place in (room, edge) code-unit order over the storey, so an element's contacts sort
   *  by number, never by string. */
  rank: number;
}
/** One length class of one line: its edges sorted by start, and the class's length bound. */
interface LengthClass {
  entries: Entry[];
  /** Every entry is shorter than this (half-lattice units): 2^(c+1). */
  bound: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const lineKey = (axis: "x" | "y", at: number): string => `${axis}${at}`;

/** One storey's room edges, indexed by line and length class. */
export interface ContactIndex {
  /** The contacts of an authored wall or a furniture piece, less those with the rooms in
   *  `skip` (rooms it already records as a dependency), sorted by room then edge. */
  of(e: RWall | RFurniture, skip: ReadonlySet<string>): ContactFact[];
  /** True once a contact was left out: the storey's probe budget ran out, or an element had
   *  more than {@link MAX_CONTACTS_LISTED}. */
  truncated(): boolean;
}

/** Index the room edges of one storey (its placed rectangular rooms). */
export function contactIndex(rooms: readonly RRoom[]): ContactIndex {
  const lines = new Map<string, Map<number, LengthClass>>();
  const all: Entry[] = [];
  for (const r of rooms) {
    for (const edge of EDGES) {
      const l = roomEdgeLine(r, edge);
      if (!l) continue;
      const from = keepHalfOf(l.from);
      const to = keepHalfOf(l.to);
      const len = to - from;
      if (len <= 0) continue;
      const k = lineKey(l.axis, keepHalfOf(l.at));
      let classes = lines.get(k);
      if (!classes) {
        classes = new Map();
        lines.set(k, classes);
      }
      const c = Math.floor(Math.log2(len));
      let cls = classes.get(c);
      if (!cls) {
        cls = { entries: [], bound: 2 ** (c + 1) };
        classes.set(c, cls);
      }
      const entry: Entry = { from, to, room: r.id, edge, rank: 0 };
      cls.entries.push(entry);
      all.push(entry);
    }
  }
  all.sort((a, b) => cmp(a.room, b.room) || cmp(a.edge, b.edge));
  all.forEach((e, k) => {
    e.rank = k;
  });
  for (const classes of lines.values())
    for (const cls of classes.values())
      cls.entries.sort((a, b) => a.from - b.from || cmp(a.room, b.room) || cmp(a.edge, b.edge));
  let probes = 0;
  let truncated = false;

  /** The first entry index whose `from` is greater than `v`. */
  const firstAfter = (es: readonly Entry[], v: number): number => {
    let lo = 0;
    let hi = es.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (es[mid]!.from <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** Add the edges overlapping the line piece `l` to `out`. */
  const probe = (l: EdgeLine, skip: ReadonlySet<string>, out: Set<Entry>): void => {
    const classes = lines.get(lineKey(l.axis, keepHalfOf(l.at)));
    if (!classes) return;
    const lo = keepHalfOf(Math.min(l.from, l.to));
    const hi = keepHalfOf(Math.max(l.from, l.to));
    if (hi <= lo) return;
    for (const cls of classes.values()) {
      const es = cls.entries;
      // An entry shorter than `bound` that starts at or before `lo − bound` ends before `lo`.
      for (let i = firstAfter(es, lo - cls.bound); i < es.length; i++) {
        const e = es[i]!;
        if (e.from >= hi) break;
        if (probes >= MAX_CONTACT_PROBES) {
          truncated = true;
          return;
        }
        probes++;
        if (Math.min(e.to, hi) - Math.max(e.from, lo) <= 0 || skip.has(e.room)) continue;
        out.add(e);
      }
    }
  };

  return {
    of(e, skip) {
      if (lines.size === 0) return [];
      const out = new Set<Entry>();
      for (const l of contactLines(e)) probe(l, skip, out);
      const found = [...out].sort((p, q) => p.rank - q.rank);
      let n = found.length;
      if (n > MAX_CONTACTS_LISTED) {
        // Whole rooms, in id order, while they fit: the room set is frame-free.
        truncated = true;
        n = 0;
        for (let i = 0; i < found.length; ) {
          let j = i;
          while (j < found.length && found[j]!.room === found[i]!.room) j++;
          if (j > MAX_CONTACTS_LISTED) break;
          n = j;
          i = j;
        }
      }
      return found.slice(0, n).map((x) => ({ room: x.room, edge: x.edge }));
    },
    truncated: () => truncated,
  };
}
