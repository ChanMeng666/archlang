/**
 * OpenPlan3D's rooms, found the way OpenPlan3D finds them: it never stores a room's outline, it
 * detects every closed loop of wall centrelines on each render and attaches saved metadata to a
 * loop by the set of walls that bound it.
 *
 * A port of `src/lib/utils/roomDetection.ts` (`splitWallsAtJunctions`, `detectSplitRooms`,
 * `withoutSpikes`, `boundaryKey`, `resolveSplitRooms`), `outerWalls.ts` (which walls are the
 * envelope) and the section matching of `roomplanImport.ts`, from github.com/laanlabs/openPlan3D
 * (MIT) at commit 98f9cb467e4045c6abc5d9880ada1f03dff50c68. Same tolerances (5 cm endpoint
 * snapping, 0.1 m² sliver floor), same traversal and order.
 *
 * One deliberate difference: OpenPlan3D orders a vertex's edges and picks the next edge of a face
 * by `Math.atan2` angles; this port decides the same choice with exact sign tests on cross and dot
 * products, because trigonometry is not exactly rounded across engines and the output must be
 * the same everywhere. The two agree except where `atan2` itself cannot tell two directions apart.
 * Square roots (exactly rounded) replace `Math.hypot`.
 *
 * Bounded: the pairwise passes are charged to the step meter before they run.
 */

/*!
 * Portions of this file are adapted from OpenPlan3D (https://github.com/laanlabs/openPlan3D),
 * commit 98f9cb467e4045c6abc5d9880ada1f03dff50c68, which carries this licence:
 *
 * MIT License
 *
 * Copyright (c) 2026 theLodgeStudio
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { chargeSteps } from "../expr.js";
import type { OWall, Pt, ORoomRecord, OSection } from "./openplan3d-model.js";

const EPSILON = 5;
/** Pairwise tests (one endpoint against one wall, or two walls) per evaluator step. */
const PAIR_TESTS_PER_STEP = 8;

const ptEq = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

interface Edge {
  wallIds: string[];
  start: Pt;
  end: Pt;
}

/** `wallPathSpans`: a straight wall's one span, or a curved wall's 16 facets of its quadratic. */
export function wallSpans(w: OWall): { start: Pt; end: Pt }[] {
  if (!w.curvePoint) return [{ start: w.start, end: w.end }];
  const c = w.curvePoint;
  const count = 16;
  const at = (t: number): Pt => ({
    x: (1 - t) * (1 - t) * w.start.x + 2 * (1 - t) * t * c.x + t * t * w.end.x,
    y: (1 - t) * (1 - t) * w.start.y + 2 * (1 - t) * t * c.y + t * t * w.end.y,
  });
  const out: { start: Pt; end: Pt }[] = [];
  for (let i = 0; i < count; i++) out.push({ start: at(i / count), end: at((i + 1) / count) });
  return out;
}

function splitWallsAtJunctions(walls: readonly OWall[]): Edge[] {
  // The pairwise passes below are paid for before anything is built for them.
  let n = 0;
  for (const w of walls) n += w.curvePoint ? 16 : 1;
  const ends = 2 * walls.length;
  chargeSteps(Math.ceil((n * ends + (n * (n - 1)) / 2) / PAIR_TESTS_PER_STEP));
  const endpoints: Pt[] = [];
  for (const w of walls) endpoints.push(w.start, w.end);
  interface SplitWall {
    wallId: string;
    start: Pt;
    end: Pt;
    splitPoints: { point: Pt; t: number }[];
  }
  const splitWalls: SplitWall[] = [];
  for (const w of walls)
    for (const s of wallSpans(w)) splitWalls.push({ wallId: w.id, start: s.start, end: s.end, splitPoints: [] });

  for (const w of splitWalls) {
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < EPSILON * EPSILON) continue;
    const len = Math.sqrt(lenSq);
    for (const ep of endpoints) {
      if (ptEq(ep, w.start) || ptEq(ep, w.end)) continue;
      const t = ((ep.x - w.start.x) * dx + (ep.y - w.start.y) * dy) / lenSq;
      if (t <= EPSILON / len || t >= 1 - EPSILON / len) continue;
      const projX = w.start.x + t * dx;
      const projY = w.start.y + t * dy;
      const dist = Math.sqrt((ep.x - projX) * (ep.x - projX) + (ep.y - projY) * (ep.y - projY));
      if (dist < EPSILON && !w.splitPoints.some((sp) => ptEq(sp.point, ep))) {
        chargeSteps(1);
        w.splitPoints.push({ point: { x: ep.x, y: ep.y }, t });
      }
    }
  }

  // Interior crossings need a vertex on BOTH walls.
  for (let i = 0; i < n; i++) {
    const a = splitWalls[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = splitWalls[j]!;
      if (a.wallId === b.wallId) continue;
      if (
        Math.max(a.start.x, a.end.x) < Math.min(b.start.x, b.end.x) ||
        Math.max(b.start.x, b.end.x) < Math.min(a.start.x, a.end.x) ||
        Math.max(a.start.y, a.end.y) < Math.min(b.start.y, b.end.y) ||
        Math.max(b.start.y, b.end.y) < Math.min(a.start.y, a.end.y)
      )
        continue;
      const ax = a.end.x - a.start.x;
      const ay = a.end.y - a.start.y;
      const bx = b.end.x - b.start.x;
      const by = b.end.y - b.start.y;
      const cross = ax * by - ay * bx;
      if (Math.abs(cross) <= 1e-10 * Math.sqrt(ax * ax + ay * ay) * Math.sqrt(bx * bx + by * by)) continue;
      const dx = b.start.x - a.start.x;
      const dy = b.start.y - a.start.y;
      const t = (dx * by - dy * bx) / cross;
      const u = (dx * ay - dy * ax) / cross;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const point = { x: a.start.x + t * ax, y: a.start.y + t * ay };
      for (const [wall, position] of [
        [a, t],
        [b, u],
      ] as const) {
        if (ptEq(point, wall.start) || ptEq(point, wall.end) || wall.splitPoints.some((p) => ptEq(p.point, point)))
          continue;
        chargeSteps(1);
        wall.splitPoints.push({ point, t: position });
      }
    }
  }

  const edges: { wallId: string; start: Pt; end: Pt }[] = [];
  for (const sw of splitWalls) {
    if (sw.splitPoints.length === 0) {
      edges.push({ wallId: sw.wallId, start: sw.start, end: sw.end });
      continue;
    }
    sw.splitPoints.sort((p, q) => p.t - q.t);
    let prev = sw.start;
    for (const sp of sw.splitPoints) {
      edges.push({ wallId: sw.wallId, start: prev, end: sp.point });
      prev = sp.point;
    }
    edges.push({ wallId: sw.wallId, start: prev, end: sw.end });
  }

  // A coincident segment is one graph edge with all of its source aliases.
  chargeSteps(Math.ceil((edges.length * edges.length) / 2 / PAIR_TESTS_PER_STEP));
  const unique: Edge[] = [];
  for (const edge of edges) {
    if (ptEq(edge.start, edge.end)) continue;
    const existing = unique.find(
      (e) =>
        (ptEq(e.start, edge.start) && ptEq(e.end, edge.end)) || (ptEq(e.start, edge.end) && ptEq(e.end, edge.start)),
    );
    if (existing) existing.wallIds = [...new Set([...existing.wallIds, edge.wallId])].sort();
    else unique.push({ wallIds: [edge.wallId], start: edge.start, end: edge.end });
  }
  return unique;
}

/** `withoutSpikes`: cancel the out-and-back steps a face walk takes along a dead-end wall. */
function withoutSpikes(walk: number[]): number[] {
  const steps: [number, number][] = [];
  for (let i = 0; i < walk.length; i++) {
    const from = walk[i]!;
    const to = walk[(i + 1) % walk.length]!;
    const last = steps[steps.length - 1];
    if (last && last[0] === to && last[1] === from) steps.pop();
    else steps.push([from, to]);
  }
  while (steps.length > 1 && steps[0]![1] === steps[steps.length - 1]![0]) {
    steps.shift();
    steps.pop();
  }
  return steps.map(([from]) => from);
}

/** Twice the signed shoelace area (positive for a face OpenPlan3D counts as a room). */
function shoelace2(pts: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/**
 * Where a direction lies in `atan2` order, `(-π, π]`: 0 for an angle in `(-π, 0]`, 1 for
 * `(0, π]`. Inside a half the order is the cross product's sign.
 */
const half = (v: Pt): 0 | 1 => (v.y < 0 || (v.y === 0 && v.x >= 0) ? 0 : 1);
const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;

/** `a.angle - b.angle` for `atan2` angles, as a sign. */
function angleOrder(a: Pt, b: Pt): number {
  const ha = half(a);
  const hb = half(b);
  if (ha !== hb) return ha - hb;
  const c = cross(a, b);
  return c > 0 ? -1 : c < 0 ? 1 : 0;
}

/**
 * The turn class of `v` seen from the back direction `back`, for OpenPlan3D's
 * `delta = inAngle − n.angle` (wrapped into `(0, 2π]`, a zero delta becoming 2π): 0 for a delta in
 * `(0, π)`, 1 for exactly π, 2 for `(π, 2π)`, 3 for the full turn (the same direction).
 */
function turnClass(back: Pt, v: Pt): number {
  const c = cross(back, v);
  if (c < 0) return 0;
  if (c > 0) return 2;
  return back.x * v.x + back.y * v.y < 0 ? 1 : 3;
}

/** Is `a`'s delta smaller than `b`'s? */
function smallerTurn(back: Pt, a: Pt, b: Pt): boolean {
  const ca = turnClass(back, a);
  const cb = turnClass(back, b);
  if (ca !== cb) return ca < cb;
  if (ca === 1 || ca === 3) return false;
  return cross(b, a) > 0;
}

/** A detected room: the face OpenPlan3D traces and the walls that bound it. */
export interface DetectedRoom {
  polygon: Pt[];
  /** Every wall id touching the loop (a split wall contributes its own id), deduplicated. */
  walls: string[];
  /** Absolute area, cm². */
  area: number;
}

export interface FloorRooms {
  rooms: DetectedRoom[];
  /** The ids of the walls on the envelope (one side faces a room, the other faces none). */
  exterior: Set<string>;
  /** `boundaryKey` of a wall-id list, for matching saved metadata. */
  key: (walls: readonly string[]) => string;
  /** For each room, the rooms strictly inside it (OpenPlan3D subtracts them as holes). */
  nested: number[][];
}

/** `detectRooms` + `outerWalls`' exposure test, for one floor. */
export function detectFloorRooms(walls: readonly OWall[]): FloorRooms {
  const edges = walls.length < 2 ? [] : splitWallsAtJunctions(walls);
  const vertices: Pt[] = [];
  const findOrAdd = (p: Pt): number => {
    chargeSteps(Math.ceil(vertices.length / PAIR_TESTS_PER_STEP) + 1);
    for (let i = 0; i < vertices.length; i++) if (ptEq(vertices[i]!, p)) return i;
    vertices.push({ x: p.x, y: p.y });
    return vertices.length - 1;
  };
  interface GEdge {
    a: number;
    b: number;
    wallIds: string[];
  }
  const gedges: GEdge[] = [];
  for (const e of edges) {
    const si = findOrAdd(e.start);
    const ei = findOrAdd(e.end);
    if (si !== ei) gedges.push({ a: si, b: ei, wallIds: e.wallIds });
  }
  interface Nb {
    to: number;
    wallIds: string[];
    dir: Pt;
  }
  const adj = new Map<number, Nb[]>();
  const dirOf = (from: number, to: number): Pt => ({
    x: vertices[to]!.x - vertices[from]!.x,
    y: vertices[to]!.y - vertices[from]!.y,
  });
  for (const e of gedges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ to: e.b, wallIds: e.wallIds, dir: dirOf(e.a, e.b) });
    adj.get(e.b)!.push({ to: e.a, wallIds: e.wallIds, dir: dirOf(e.b, e.a) });
  }
  for (const [, nbs] of adj) {
    chargeSteps(nbs.length);
    nbs.sort((p, q) => angleOrder(p.dir, q.dir));
  }

  const usedDirected = new Set<string>();
  /** The face index each traced directed edge belongs to, keyed `from-to`. */
  const faceOf = new Map<string, number>();
  const faces: { accepted: boolean; vertexIds: number[] }[] = [];
  const rooms: DetectedRoom[] = [];
  const roomOfFace = new Map<number, number>();
  const maxCycleSteps = 2 * gedges.length + 1;

  for (const e of gedges) {
    for (const [from, to] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      const key0 = `${from}-${to}`;
      if (usedDirected.has(key0)) continue;
      const cycle: number[] = [from];
      const wallIds: string[] = [];
      const traced: string[] = [];
      let cur: number = from;
      let next: number = to;
      let closed = false;
      for (let step = 0; step < maxCycleSteps; step++) {
        chargeSteps(1);
        if (step > 0 && cur === from && next === to) {
          closed = true;
          break;
        }
        const dk = `${cur}-${next}`;
        if (usedDirected.has(dk)) break;
        usedDirected.add(dk);
        traced.push(dk);
        cycle.push(next);
        const here = adj.get(cur)?.find((nb) => nb.to === next);
        if (here) wallIds.push(...here.wallIds);
        const back = dirOf(next, cur);
        const nbs = adj.get(next);
        if (!nbs || nbs.length === 0) break;
        chargeSteps(Math.ceil(nbs.length / PAIR_TESTS_PER_STEP));
        let best = -1;
        for (let i = 0; i < nbs.length; i++) {
          const nb = nbs[i]!;
          if (nb.to === cur && nbs.length > 1) continue;
          if (best < 0 || smallerTurn(back, nb.dir, nbs[best]!.dir)) best = i;
        }
        if (best === -1) break;
        cur = next;
        next = nbs[best]!.to;
      }
      const faceIndex = faces.length;
      faces.push({ accepted: false, vertexIds: cycle });
      for (const dk of traced) faceOf.set(dk, faceIndex);
      if (!closed || cycle.length < 4) continue;
      const ring = withoutSpikes(cycle.slice(0, -1));
      const poly = ring.map((i) => ({ x: vertices[i]!.x, y: vertices[i]!.y }));
      const signed2 = shoelace2(poly);
      if (signed2 <= 0) continue;
      const area = signed2 / 2;
      if (area < 1000) continue;
      const unique = [...new Set(wallIds)];
      chargeSteps(rooms.length);
      const dup = rooms.some((r) => {
        const rw = new Set(r.walls);
        return unique.length === rw.size && unique.every((w) => rw.has(w));
      });
      if (dup) continue;
      faces[faceIndex]!.accepted = true;
      roomOfFace.set(faceIndex, rooms.length);
      rooms.push({ polygon: poly, walls: unique, area });
    }
  }

  // Components of the wall graph, so an island's outside can be found inside another's room.
  const parent = vertices.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (const e of gedges) parent[root(e.a)] = root(e.b);
  const roomComponent = rooms.map((r) => {
    const v = vertices.findIndex((p) => p.x === r.polygon[0]!.x && p.y === r.polygon[0]!.y);
    return root(v);
  });

  // `outerWalls.ts`: a wall is on the envelope where one side faces a room and the other does
  // not. A side faces a room when the face traced along it is a room, or when it is the outside
  // of an island that stands inside another component's room. No room at all: every wall is.
  const exterior = new Set<string>();
  if (rooms.length === 0) for (const w of walls) exterior.add(w.id);
  else {
    const islandInside = new Map<number, boolean>();
    const sideInRoom = (from: number, to: number): boolean => {
      const f = faceOf.get(`${from}-${to}`);
      if (f === undefined) return false;
      if (faces[f]!.accepted) return true;
      let inside = islandInside.get(f);
      if (inside === undefined) {
        const v = faces[f]!.vertexIds[0]!;
        const comp = root(v);
        const p = vertices[v]!;
        chargeSteps(rooms.length);
        inside = rooms.some((r, ri) => roomComponent[ri] !== comp && pointInPolygon(p, r.polygon));
        islandInside.set(f, inside);
      }
      return inside;
    };
    for (const e of gedges) {
      if (sideInRoom(e.a, e.b) !== sideInRoom(e.b, e.a)) for (const id of e.wallIds) exterior.add(id);
    }
  }

  // `roomHoles`, as far as the report needs it: which rooms stand wholly inside which.
  chargeSteps(Math.ceil((rooms.length * rooms.length) / PAIR_TESTS_PER_STEP));
  const nested = rooms.map((outer, oi) =>
    rooms.flatMap((inner, ii) =>
      ii !== oi &&
      roomComponent[ii] !== roomComponent[oi] &&
      inner.polygon.every((p) => pointInPolygon(p, outer.polygon))
        ? [ii]
        : [],
    ),
  );

  // `boundaryKey`: a room's wall ids plus every wall coincident with one of them.
  const aliasEdges = edges.filter((e) => e.wallIds.length > 1);
  const key = (ids: readonly string[]): string => {
    const set = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      chargeSteps(aliasEdges.length + 1);
      for (const edge of aliasEdges)
        if (edge.wallIds.some((id) => set.has(id)))
          for (const id of edge.wallIds)
            if (!set.has(id)) {
              set.add(id);
              changed = true;
            }
    }
    return JSON.stringify([...set].sort());
  };
  return { rooms, exterior, key, nested };
}

/** The ray-casting test both OpenPlan3D importers use. Points on an edge may go either way. */
export function pointInPolygon(point: Pt, polygon: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/**
 * `resolveSplitRooms`: the saved record each detected room shows. Records whose boundary key
 * repeats cancel each other (OpenPlan3D shows neither name).
 */
export function matchRecords(
  found: FloorRooms,
  records: readonly ORoomRecord[],
): { byRoom: (ORoomRecord | undefined)[]; cancelled: Set<ORoomRecord> } {
  const saved = new Map<string, ORoomRecord | null>();
  for (const r of records) {
    const k = found.key(r.walls);
    saved.set(k, saved.has(k) ? null : r);
  }
  const cancelled = new Set<ORoomRecord>();
  for (const r of records) if (saved.get(found.key(r.walls)) === null) cancelled.add(r);
  const byRoom = found.rooms.map((room) => saved.get(found.key(room.walls)) ?? undefined);
  return { byRoom, cancelled };
}

/**
 * The interchange importer's section matching: each label names the smallest detected room
 * enclosing it; a label nothing encloses takes the nearest room no label claimed (by the
 * vertex average, as OpenPlan3D measures it); a second label in a claimed room names nothing.
 */
export function matchSections(found: FloorRooms, sections: readonly OSection[]): number[] {
  const polys = found.rooms.map((r) => r.polygon);
  chargeSteps(Math.ceil((sections.length * (polys.length + 1)) / PAIR_TESTS_PER_STEP));
  const enclosing = sections.map((s) => {
    let best = -1;
    polys.forEach((poly, di) => {
      if (
        poly.length >= 3 &&
        pointInPolygon(s.center, poly) &&
        (best < 0 || found.rooms[di]!.area < found.rooms[best]!.area)
      )
        best = di;
    });
    return best;
  });
  const claimed = new Set<number>();
  const matched = enclosing.map(() => -1);
  enclosing.forEach((di, si) => {
    if (di >= 0 && !claimed.has(di)) {
      claimed.add(di);
      matched[si] = di;
    }
  });
  enclosing.forEach((di, si) => {
    if (di >= 0) return;
    const anchor = sections[si]!.center;
    let bestDistance = Infinity;
    for (let ci = 0; ci < polys.length; ci++) {
      if (claimed.has(ci) || polys[ci]!.length < 3) continue;
      const poly = polys[ci]!;
      let cx = 0;
      let cy = 0;
      for (const p of poly) {
        cx += p.x;
        cy += p.y;
      }
      cx /= poly.length;
      cy /= poly.length;
      const d = Math.sqrt((cx - anchor.x) * (cx - anchor.x) + (cy - anchor.y) * (cy - anchor.y));
      if (d < bestDistance) {
        bestDistance = d;
        matched[si] = ci;
      }
    }
    if (matched[si]! >= 0) claimed.add(matched[si]!);
  });
  return matched;
}
