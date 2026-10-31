/**
 * The derivation behind `walls from rooms` (ADR 0028 §3, plan decision D5): one group's
 * rectangular and rectilinear rooms in, its exterior ring(s) and its partitions out, or a refusal
 * naming the rooms at fault. Pure: no diagnostics, no ids beyond the internal names, no `RWall`
 * (the element module `src/elements/walls-from-rooms.ts` builds those).
 *
 * A rectilinear polygon is rectangles of one owner ({@link ringParts}): every interval below
 * belongs to a room, not to a rectangle, and an edge with one room on both sides is no wall. So
 * runs and boundary pieces merge across a seam, what is derived depends on the ring and not on
 * how it was cut, and a pair of rooms may share several runs.
 *
 * The pairwise wall forms (ADR 0028 §4) reuse steps 1–5 through {@link sweepRooms} and
 * {@link linkRings}: `wall … between` is one pair's shared run ({@link deriveBetween}) and
 * `wall … around` the outer ring of a listed set with no hole ({@link deriveAround}).
 *
 * Every decision is exact on the resolved coordinates; there is no tolerance anywhere
 * (`===`/`<` only). The work is charged to the evaluator's step meter (`MAX_EVAL_STEPS`)
 * BEFORE it is done or allocated, so any input returns within the budget.
 *
 * ## The algorithm
 *
 * 1. A `circle` room, or a `polygon` room with a slanted edge, refuses
 *    (`E_ROOM_NOT_RECTANGLE`); nothing else is decided around it (it has no edge lines).
 * 2. Overlap: a sweep over the rooms sorted by left edge, comparing each room with the rooms
 *    still open at its left edge (`E_ROOMS_OVERLAP`, every pair named). The rest of the
 *    algorithm relies on the rooms being interior-disjoint, so an overlap stops here.
 * 3. Every room edge lies on one line (`x = c` or `y = c`) with the room on one side of it.
 *    One sort of the edges per axis groups them by line; on each line a merge of the two
 *    sides' intervals (each side's intervals are disjoint, because the rooms are) yields:
 *    the runs where both sides hold a room (a shared run: one PARTITION between that pair),
 *    and the runs where one side only does (a BOUNDARY piece, oriented so the floor is on
 *    its right on the page: top edges run `+x`, right edges `+y`, bottom edges `-x`, left
 *    edges `-y`).
 * 4. The boundary pieces link end to start into rings. A vertex with two outgoing pieces is
 *    a pinch (the union touches itself, or its hole, at a single point): `E_ROOMS_NOT_TILING`.
 *    At a ring's vertex with the smallest `y`, then `x`, the outgoing piece runs `+x` on an
 *    outer ring (clockwise on the page) and `+y` on a hole ring (counter-clockwise), so the
 *    orientation is read exactly, with no area sum. More than one outer ring is more than
 *    one edge-connected component: `E_ROOMS_NOT_TILING`.
 * 5. A hole is legal only when the group's `outdoor` surfaces, or its `void`s, cover it
 *    exactly (one kind; every cover wholly inside the hole or wholly outside it), decided on
 *    a compressed grid of the hole's and the covers' edge coordinates. An `outdoor` hole is a
 *    courtyard and keeps its ring (an inner exterior wall); a `void` hole derives no wall.
 * 6. A shared run shorter than its partition's thickness refuses (`E_PARTITION_TOO_SHORT`);
 *    a pair clause naming two rooms that share no run refuses (`E_WALL_BETWEEN_NOT_ADJACENT`).
 * 7. Coexistence: where an authored straight wall segment lies exactly on the line of a
 *    derived segment and overlaps it with positive length, the derived wall is dropped over
 *    that span (the author's wall wins) and every dropped span is reported. What remains of
 *    a ring is one or more open runs, in ring order. On a pair declared `open` an authored
 *    wall is refused instead (`E_WALL_BETWEEN_OPEN`): the run is already voided.
 * 8. An `open` pair's opening spans the CLEAR SPAN of its run: from each end, the run is
 *    cut back by half the thickness of the thickest wall that meets it there (a derived or
 *    authored straight wall perpendicular to the run whose centreline passes through the
 *    end), so a jamb lies on a meeting wall's face and carries no nib. With a `width`, the
 *    opening is centred on that span and must fit in it (`E_WALL_BETWEEN_WIDTH`).
 *
 * ## Direction and names (ADR 0028 §3)
 *
 * The outer ring starts at its vertex with the smallest `y`, then `x`, and runs clockwise
 * (first along `+x`); a courtyard ring starts the same way and runs counter-clockwise (first
 * along `+y`); a partition runs from its end with the smaller `y`, then `x`. Names no
 * identifier can spell: `exterior` (the outer ring), `exterior#2`, `exterior#3`, … (courtyard
 * rings, by start vertex), `A|B` (a partition, the two room ids in source order), and `A|B#2`,
 * `A|B#3`, … for the later runs of a pair that shares several, numbered by start point. A derived
 * wall that an authored wall splits keeps its name on the first remaining run, and the later
 * runs are `<name>~2`, `<name>~3`, ….
 */

import type { Point } from "./ast.js";
import { chargeSteps } from "./expr.js";
import { fmt3 as numStr } from "./num-format.js";

/** An axis-aligned rectangle `[x0, x1] × [y0, y1]`. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * One room of the set, in source order: a rectangle, or the interior-disjoint rectangles of a
 * rectilinear polygon ({@link ringParts}). A room with neither is a slanted polygon or a circle.
 */
export interface TileRoom {
  id: string;
  rect?: TileRect;
  parts?: readonly TileRect[];
  shape?: "polygon" | "circle";
}

/** An `outdoor` surface or a `void` of the group: a rectangle or a ring. */
export interface TileCover {
  kind: "outdoor" | "void";
  rect?: TileRect;
  poly?: Point[];
}

/** One straight segment of an authored wall of the group. */
export interface TileWallSeg {
  a: Point;
  b: Point;
  wallId: string;
  /** The wall's thickness: read only to find the face of a wall that meets an `open` run. */
  thickness?: number;
}

/**
 * A pair clause of the statement, already checked to name two distinct rectangles of the set
 * and no pair twice: `open` voids the pair's run with an opening (`width` absent: across the
 * whole clear span), `thickness` sets that one partition's thickness.
 */
export type TilePair =
  | { kind: "open"; a: string; b: string; width?: number }
  | { kind: "thickness"; a: string; b: string; thickness: number };

/** What the derivation reads beyond the rooms, covers, walls and partition thickness. */
export interface TileOptions {
  /** The exterior ring's thickness (the face an `open` run's clear span stops at). */
  tExt?: number;
  /** The pair clauses, in source order; a refusal about one names its index (`clause`). */
  pairs?: readonly TilePair[];
}

export type TilingCode =
  | "E_ROOM_NOT_RECTANGLE"
  | "E_ROOMS_OVERLAP"
  | "E_ROOMS_NOT_TILING"
  | "E_PARTITION_TOO_SHORT"
  | "E_ELEMENT_LIMIT"
  | "E_OPENING_HOST_AMBIGUOUS"
  | "E_WALL_BETWEEN_NOT_ADJACENT"
  | "E_WALL_BETWEEN_OPEN"
  | "E_WALL_BETWEEN_WIDTH";

/** A refusal: its code, the rooms it names (source order) and the reason, in words. */
export interface TilingRefusal {
  code: TilingCode;
  rooms: string[];
  why: string;
  /** The pair clause at fault (its index in {@link TileOptions.pairs}), when one is. */
  clause?: number;
}

/** The opening an `open` pair derives: centred at `at`, `width` along its run. */
export interface DerivedOpeningSpec {
  /** The clause's index in {@link TileOptions.pairs}. */
  clause: number;
  at: Point;
  width: number;
  /** Present when the opening spans the run's whole clear span, however the clause wrote it:
   *  no length of wall is left on the run for anything to meet. */
  whole?: true;
}

/** One derived wall before coexistence, with what is left of it. */
export interface DerivedWallSpec {
  /** Internal name: `exterior`, `exterior#<k>`, `A|B` or `A|B#<k>`. */
  name: string;
  role: "exterior" | "partition";
  /** Rings only: the outer ring, or a courtyard ring. */
  ring?: "outer" | "inner";
  /** Partitions only: the two rooms, in source order. */
  between?: [string, string];
  /** Partitions only: the pair's own thickness (`between … thickness`), when a clause sets it. */
  thickness?: number;
  /** Partitions only: the opening an `open between` clause voids the run with. */
  open?: DerivedOpeningSpec;
  /** The runs that remain after coexistence, in the wall's direction. The first keeps the
   *  name; the later ones are `<name>~2`, …. A ring with nothing dropped is one closed run. */
  pieces: Array<{ name: string; points: Point[]; closed: boolean }>;
  /** The spans an authored wall took over, in the wall's direction. */
  dropped: Array<{ x1: number; y1: number; x2: number; y2: number; by: string }>;
}

export type TilingResult =
  | { ok: false; refusals: TilingRefusal[] }
  | { ok: true; walls: DerivedWallSpec[]; counts: { partitions: number; ringVertices: number } };

/** The step cost of sorting `m` items: `m log2 m`, rounded up (at least `m`). */
export function sortSteps(m: number): number {
  return m <= 1 ? 1 : Math.ceil(m * Math.log2(m));
}

interface Interval {
  s: number;
  e: number;
  room: number;
}

/** A directed boundary piece on one line, floor on its right; `owners` the rooms along it. */
export interface TilePiece {
  a: Point;
  b: Point;
  owners: number[];
}

/** A shared run on one line between two rooms (`lo`/`hi` their indices, by side), `a`→`b`
 *  along the line's growing coordinate. */
export interface TileRun {
  a: Point;
  b: Point;
  lo: number;
  hi: number;
}

const key = (p: Point): string => `${p.x},${p.y}`;

/**
 * Derive one group's walls. `rooms` in source order (that order names the partitions and
 * the rooms a refusal lists); `covers` the group's `outdoor`/`void` shapes; `walls` the
 * group's authored straight segments (coexistence); `tInt` the partition thickness.
 */
export function deriveWallsFromRooms(
  rooms: readonly TileRoom[],
  covers: readonly TileCover[],
  walls: readonly TileWallSeg[],
  tInt: number,
  /** Count the walls (and openings) about to be derived toward the element budget
   *  (`MAX_ELEMENTS`); false past it, and nothing is derived (`E_ELEMENT_LIMIT`). Absent: no
   *  budget. */
  budget?: (walls: number) => boolean,
  opts: TileOptions = {},
): TilingResult {
  const clausePairs = opts.pairs ?? [];
  const swept = sweepRooms(rooms);
  if (!swept.ok) return swept;
  const { ids, named, pieces, runs } = swept;

  const notTiling: string[] = [];
  const tilingRooms: number[] = [];

  // The pair clauses against the runs: each names the runs its two rooms share, or none. Two
  // rectangles share at most one, a polygon may share several. `thickness` sets all of a pair's
  // runs; `open` derives one opening, so it needs one run.
  chargeSteps(runs.length + clausePairs.length + 1);
  const index0 = new Map(ids.map((id, i) => [id, i]));
  const pairKey = (i: number, j: number): string => (i < j ? `${i}|${j}` : `${j}|${i}`);
  const runsOfPair = new Map<string, TileRun[]>();
  for (const r of runs) {
    const k = pairKey(r.lo, r.hi);
    const list = runsOfPair.get(k);
    if (list) list.push(r);
    else runsOfPair.set(k, [r]);
  }
  /** Each run's pair clause, by the run's pair key. */
  const clauseOf = new Map<string, number>();
  const unpaired: TilingRefusal[] = [];
  clausePairs.forEach((p, k) => {
    const i = index0.get(p.a)!;
    const j = index0.get(p.b)!;
    const onPair = runsOfPair.get(pairKey(i, j));
    if (onPair && p.kind === "open" && onPair.length > 1) unpaired.push(severalRuns(p, onPair, named([i, j]), k));
    else if (onPair) clauseOf.set(pairKey(i, j), k);
    else
      unpaired.push({
        code: "E_WALL_BETWEEN_NOT_ADJACENT",
        rooms: named([i, j]),
        why: `"${p.a}" and "${p.b}" share no edge, so there is no partition between them to ${p.kind === "open" ? "open" : "set the thickness of"}`,
        clause: k,
      });
  });
  /** A run's partition thickness: its pair's own, else the statement's. */
  const thick = (r: TileRun): number => {
    const k = clauseOf.get(pairKey(r.lo, r.hi));
    const p = k === undefined ? undefined : clausePairs[k];
    return p?.kind === "thickness" ? p.thickness : tInt;
  };

  // 4–5. The rings, the pinches, the components and the holes.
  const ringed = linkRings(pieces, covers, ids, named, notTiling, tilingRooms);
  if (ringed.pinched) {
    return {
      ok: false,
      refusals: [...refusalsOf(notTiling, tilingRooms, shortRuns(runs, thick, ids), named), ...unpaired],
    };
  }
  const { outers, courtyards } = ringed;

  // 6. Short runs, and the pair clauses that name no run.
  const short = shortRuns(runs, thick, ids);
  if (notTiling.length > 0 || short || unpaired.length > 0)
    return { ok: false, refusals: [...refusalsOf(notTiling, tilingRooms, short, named), ...unpaired] };

  // 7. The walls, then coexistence.
  const outer = outers[0];
  const specs: Array<
    Omit<DerivedWallSpec, "pieces" | "dropped"> & { path: Point[]; closed: boolean; openClause?: number }
  > = [];
  if (outer) specs.push({ name: "exterior", role: "exterior", ring: "outer", path: outer.pts, closed: true });
  courtyards.forEach((pts, k) => {
    specs.push({ name: `exterior#${k + 2}`, role: "exterior", ring: "inner", path: pts, closed: true });
  });
  const partitionSpecs = runs
    .map((r) => {
      const [a, b] = r.lo < r.hi ? [r.lo, r.hi] : [r.hi, r.lo];
      return { a, b, path: [r.a, r.b], clause: clauseOf.get(pairKey(r.lo, r.hi)), t: thick(r) };
    })
    .sort((p, q) => p.a - q.a || p.b - q.b || p.path[0]!.y - q.path[0]!.y || p.path[0]!.x - q.path[0]!.x);
  // A pair's runs are numbered in that order. Two of them can start at one point, a reflex corner
  // of a polygon: `runs` holds the vertical lines first and the sort is stable, so the vertical
  // run is the earlier.
  const nth = new Map<string, number>();
  for (const p of partitionSpecs) {
    const kind = p.clause === undefined ? undefined : clausePairs[p.clause]!.kind;
    const pair = `${ids[p.a]}|${ids[p.b]}`;
    const k = (nth.get(pair) ?? 0) + 1;
    nth.set(pair, k);
    specs.push({
      name: k === 1 ? pair : `${pair}#${k}`,
      role: "partition",
      between: [ids[p.a]!, ids[p.b]!],
      ...(kind === "thickness" ? { thickness: p.t } : {}),
      ...(kind === "open" ? { openClause: p.clause } : {}),
      path: p.path,
      closed: false,
    });
  }
  const index = authoredIndex(walls);
  // An authored wall on a run the author declared `open` is refused, not coexisted with: the
  // run is already voided, so the wall would close what the clause opened.
  const openRefusals: TilingRefusal[] = [];
  for (const s of specs) {
    if (s.openClause === undefined) continue;
    const on = overlapping(s.path, index);
    if (on.length === 0) continue;
    const [a, b] = s.between!;
    openRefusals.push({
      code: "E_WALL_BETWEEN_OPEN",
      rooms: [a, b],
      why: `${on.map((w) => `wall "${w}"`).join(", ")} lies on the edge "${a}" and "${b}" share, which the clause declares open`,
      clause: s.openClause,
    });
  }
  if (openRefusals.length > 0) return { ok: false, refusals: openRefusals };
  // Coexistence splits a derived run once per authored wall lying on it, so the number of
  // walls derived is bounded by the cuts, not by the rooms: counted (and charged to the
  // element budget) before any piece is allocated, with one opening per `open` pair.
  let derivedCount = 0;
  for (const s of specs) derivedCount += pieceBound(s.path, s.closed, index) + (s.openClause === undefined ? 0 : 1);
  if (budget && !budget(derivedCount)) {
    return {
      ok: false,
      refusals: [
        {
          code: "E_ELEMENT_LIMIT",
          rooms: [],
          why: `it would derive up to ${derivedCount} walls (every authored wall lying on a derived line splits it)`,
        },
      ],
    };
  }
  const result: DerivedWallSpec[] = specs.map((s) => {
    const { path, closed, openClause: _o, ...rest } = s;
    return { ...rest, ...coexist(s.name, path, closed, index) };
  });
  // 8. The openings of the `open` pairs, across each run's clear span.
  const opened = specs.flatMap((s, k) => (s.openClause === undefined ? [] : [k]));
  if (opened.length > 0) {
    const faces = faceIndex(result, walls, tInt, opts.tExt ?? tInt);
    const bad: TilingRefusal[] = [];
    for (const k of opened) {
      const s = specs[k]!;
      const clause = s.openClause!;
      const p = clausePairs[clause] as Extract<TilePair, { kind: "open" }>;
      const [a, b] = [s.path[0]!, s.path[1]!];
      const vertical = a.x === b.x;
      const t0 = vertical ? a.y : a.x;
      const t1 = vertical ? b.y : b.x;
      const s0 = t0 + faceAt(a, vertical, faces);
      const s1 = t1 - faceAt(b, vertical, faces);
      const clear = s1 - s0;
      const width = p.width ?? clear;
      if (!(clear > 0) || width > clear) {
        bad.push({
          code: "E_WALL_BETWEEN_WIDTH",
          rooms: [...s.between!],
          why:
            clear > 0
              ? `an opening ${width} mm wide does not fit the ${clear} mm clear between the walls that meet the edge "${p.a}" and "${p.b}" share`
              : `the walls that meet the edge "${p.a}" and "${p.b}" share leave no clear span on it to open`,
          clause,
        });
        continue;
      }
      const mid = (s0 + s1) / 2;
      result[k]!.open = {
        clause,
        at: vertical ? { x: a.x, y: mid } : { x: mid, y: a.y },
        width,
        ...(width === clear ? { whole: true as const } : {}),
      };
    }
    if (bad.length > 0) return { ok: false, refusals: bad };
  }
  const ringVertices = (outer?.pts.length ?? 0) + courtyards.reduce((t, r) => t + r.length, 0);
  return { ok: true, walls: result, counts: { partitions: partitionSpecs.length, ringVertices } };
}

/** An `open` clause on a pair with several runs: refused, naming each, in the order they number. */
function severalRuns(
  p: Extract<TilePair, { kind: "open" }>,
  runs: readonly TileRun[],
  rooms: string[],
  clause: number,
): TilingRefusal {
  chargeSteps(sortSteps(runs.length));
  const said = [...runs]
    .sort((u, v) => u.a.y - v.a.y || u.a.x - v.a.x)
    .map((r) =>
      r.a.x === r.b.x
        ? `on x ${numStr(r.a.x)}, y ${numStr(r.a.y)}–${numStr(r.b.y)}`
        : `on y ${numStr(r.a.y)}, x ${numStr(r.a.x)}–${numStr(r.b.x)}`,
    );
  return {
    code: "E_OPENING_HOST_AMBIGUOUS",
    rooms,
    why: `"${p.a}" and "${p.b}" share ${runs.length} edges (${said.join("; ")}), and one clause derives one opening on one edge`,
    clause,
  };
}

/** What {@link sweepRooms} finds in a set of rooms with disjoint interiors. */
export interface SweptRooms {
  ok: true;
  /** The rooms' ids, in source order (a room's index is its place here). */
  ids: string[];
  /** The distinct room indices of `set`, sorted, as ids. */
  named: (set: Iterable<number>) => string[];
  /** The oriented boundary pieces (floor on the right of travel). */
  pieces: TilePiece[];
  /** The shared runs, each between two rooms, running from its smaller coordinate. */
  runs: TileRun[];
}

/**
 * Steps 1–3 of the algorithm, shared by `walls from rooms` and the pairwise wall forms
 * (`wall … between`, `wall … around`, ADR 0028 §4), which hand it rectangles only: refuse a room
 * that is no rectangle and no rectilinear polygon, then any overlap, then sort the edges per axis
 * and merge each line into shared runs and boundary pieces. Charged before each stage
 * (`n log n + 3n` for the edge sweep, with `n` the 4·rectangles edges). A polygon's rectangles
 * were paid for when it was cut ({@link ringParts}), so listing them here is not charged again.
 */
export function sweepRooms(rooms: readonly TileRoom[]): { ok: false; refusals: TilingRefusal[] } | SweptRooms {
  chargeSteps(rooms.length + 1);
  // 1. Neither a rectangle nor a rectilinear polygon.
  const nonRect = rooms.filter((r) => !r.rect && !r.parts);
  if (nonRect.length > 0) {
    return {
      ok: false,
      refusals: [
        {
          code: "E_ROOM_NOT_RECTANGLE",
          rooms: nonRect.map((r) => r.id),
          why: nonRect
            .map((r) =>
              r.shape === "circle"
                ? `"${r.id}" is a circle room`
                : `"${r.id}" is a polygon room with an edge that is neither horizontal nor vertical`,
            )
            .join("; "),
        },
      ],
    };
  }
  // The rectangles, each with the room that owns it: from here on an interval's room is its owner.
  const R: TileRect[] = [];
  const ownerOf: number[] = [];
  rooms.forEach((r, i) => {
    for (const part of r.parts ?? [r.rect!]) {
      R.push(part);
      ownerOf.push(i);
    }
  });
  const n = R.length;
  const ids = rooms.map((r) => r.id);
  const named = (set: Iterable<number>): string[] => [...new Set(set)].sort((a, b) => a - b).map((i) => ids[i]!);

  // 2. Overlap: sweep by left edge.
  chargeSteps(sortSteps(n) + n);
  const byX = R.map((_, i) => i).sort((a, b) => R[a]!.x0 - R[b]!.x0 || a - b);
  const pairs: Array<[number, number]> = [];
  let active: number[] = [];
  for (const i of byX) {
    const r = R[i]!;
    chargeSteps(2 * active.length + 1);
    active = active.filter((j) => R[j]!.x1 > r.x0);
    for (const j of active) {
      const q = R[j]!;
      if (Math.min(r.x1, q.x1) > Math.max(r.x0, q.x0) && Math.min(r.y1, q.y1) > Math.max(r.y0, q.y0)) {
        const [oi, oj] = [ownerOf[i]!, ownerOf[j]!];
        pairs.push(oi < oj ? [oi, oj] : [oj, oi]);
      }
    }
    active.push(i);
  }
  if (pairs.length > 0) {
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    // Several rectangles of one polygon can overlap one room: the pair is named once.
    const once = pairs.filter((p, k) => k === 0 || p[0] !== pairs[k - 1]![0] || p[1] !== pairs[k - 1]![1]);
    return {
      ok: false,
      refusals: [
        {
          code: "E_ROOMS_OVERLAP",
          rooms: named(once.flat()),
          why: once.map(([a, b]) => `"${ids[a]}" overlaps "${ids[b]}"`).join("; "),
        },
      ],
    };
  }

  // 3. Edges by line: one sort per axis, then a merge on each line. Charged before
  //    allocating: the sort of 4n edges plus three passes over them.
  const m = 4 * n;
  chargeSteps(sortSteps(m) + 3 * m);
  // Vertical lines x = c: `lo` = the room is on the -x side (its right edge), `hi` = +x side.
  const vEdges: Array<{ c: number; side: 0 | 1; iv: Interval }> = [];
  const hEdges: Array<{ c: number; side: 0 | 1; iv: Interval }> = [];
  R.forEach((r, i) => {
    if (!(r.x1 > r.x0 && r.y1 > r.y0)) return; // no area: no edge to derive from
    const room = ownerOf[i]!;
    vEdges.push({ c: r.x1, side: 0, iv: { s: r.y0, e: r.y1, room } });
    vEdges.push({ c: r.x0, side: 1, iv: { s: r.y0, e: r.y1, room } });
    hEdges.push({ c: r.y1, side: 0, iv: { s: r.x0, e: r.x1, room } });
    hEdges.push({ c: r.y0, side: 1, iv: { s: r.x0, e: r.x1, room } });
  });
  const order = (p: { c: number; iv: Interval }, q: { c: number; iv: Interval }): number =>
    p.c - q.c || p.iv.s - q.iv.s || p.iv.room - q.iv.room;
  vEdges.sort(order);
  hEdges.sort(order);

  const pieces: TilePiece[] = [];
  const runs: TileRun[] = [];
  const sweepAxis = (edges: typeof vEdges, vertical: boolean): void => {
    let k = 0;
    while (k < edges.length) {
      const c = edges[k]!.c;
      const lo: Interval[] = [];
      const hi: Interval[] = [];
      while (k < edges.length && edges[k]!.c === c) {
        const ed = edges[k]!;
        (ed.side === 0 ? lo : hi).push(ed.iv);
        k++;
      }
      sweepLine(c, lo, hi, vertical, pieces, runs);
    }
  };
  sweepAxis(vEdges, true);
  sweepAxis(hEdges, false);
  return { ok: true, ids, named, pieces, runs };
}

/** What {@link linkRings} finds: the outer rings and the courtyard rings, canonical. */
export interface LinkedRings {
  /** A vertex with two outgoing pieces was found; nothing past step 4 was decided. */
  pinched: boolean;
  outers: Array<{ pts: Point[]; owners: number[] }>;
  /** The holes covered exactly by `outdoor` surfaces (each a counter-clockwise ring). */
  courtyards: Point[][];
}

/**
 * Steps 4–5: link the boundary pieces into rings, refuse a pinch and more than one outer
 * ring, and judge each hole. `covers` are the group's `outdoor`/`void` shapes; `null` means
 * the caller draws one ring and no hole is legal (`wall … around`, ADR 0028 §4). The reasons
 * a tiling fails are appended to `notTiling`, and the rooms they name to `tilingRooms`.
 */
export function linkRings(
  pieces: readonly TilePiece[],
  covers: readonly TileCover[] | null,
  ids: readonly string[],
  named: (set: Iterable<number>) => string[],
  notTiling: string[],
  tilingRooms: number[],
): LinkedRings {
  // 4. Link the boundary pieces into rings; a vertex with two outgoing pieces is a pinch.
  chargeSteps(2 * pieces.length + 1);
  const out = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const k = key(p.a);
    const list = out.get(k);
    if (list) list.push(i);
    else out.set(k, [i]);
  });
  const pinches: string[] = [];
  for (const [k, list] of out) {
    if (list.length < 2) continue;
    chargeSteps(pieces.length + 1);
    pinches.push(`(${k.replace(",", ", ")})`);
    for (const i of list) tilingRooms.push(...pieces[i]!.owners);
    for (const p of pieces) if (key(p.b) === k) tilingRooms.push(...p.owners);
  }
  if (pinches.length > 0) {
    notTiling.push(
      `the rooms touch at a single point ${pinches.slice(0, 4).join(" ")}${pinches.length > 4 ? " …" : ""} (a pinch)`,
    );
    return { pinched: true, outers: [], courtyards: [] };
  }
  const seen = new Uint8Array(pieces.length);
  const rings: Array<{ pts: Point[]; owners: number[]; outer: boolean }> = [];
  for (let i0 = 0; i0 < pieces.length; i0++) {
    if (seen[i0]) continue;
    const pts: Point[] = [];
    const owners: number[] = [];
    let i = i0;
    // Every vertex has exactly one outgoing piece here (no pinch), and every piece ends
    // where another starts (a boundary of a union of rectangles is closed), so this walk
    // returns to its start.
    while (!seen[i]) {
      seen[i] = 1;
      const p = pieces[i]!;
      pts.push(p.a);
      owners.push(...p.owners);
      const next = out.get(key(p.b));
      if (!next) break;
      i = next[0]!;
    }
    // Canonical start: smallest y, then x.
    let s = 0;
    for (let j = 1; j < pts.length; j++) {
      const p = pts[j]!;
      const q = pts[s]!;
      if (p.y < q.y || (p.y === q.y && p.x < q.x)) s = j;
    }
    const ring = [...pts.slice(s), ...pts.slice(0, s)];
    rings.push({ pts: ring, owners, outer: ring[1]!.y === ring[0]!.y });
  }
  const outers = rings.filter((r) => r.outer);
  if (outers.length > 1) {
    const one = outers.map((r) => Math.min(...r.owners));
    tilingRooms.push(...one);
    notTiling.push(
      `the rooms form ${outers.length} separate parts (one room from each: ${one.map((i) => `"${ids[i]}"`).join(", ")}); rooms touching only at a corner are not connected`,
    );
  }

  // 5. Holes: each must be covered exactly by one kind of cover (none, for one ring).
  const holes = rings.filter((r) => !r.outer).sort((p, q) => p.pts[0]!.y - q.pts[0]!.y || p.pts[0]!.x - q.pts[0]!.x);
  const courtyards: Point[][] = [];
  for (const h of holes) {
    const verdict = covers === null ? "one ring" : holeCover(h.pts, covers);
    if (verdict === "outdoor") courtyards.push(h.pts);
    else if (verdict !== "void") {
      tilingRooms.push(...h.owners);
      const xs = h.pts.map((p) => p.x);
      const ys = h.pts.map((p) => p.y);
      const box = `x ${Math.min(...xs)}–${Math.max(...xs)}, y ${Math.min(...ys)}–${Math.max(...ys)}`;
      const by = named(h.owners)
        .map((x) => `"${x}"`)
        .join(", ");
      notTiling.push(
        covers === null
          ? `the rooms enclose a hole ${box} (bounded by ${by}); an \`around\` wall is one ring, so it cannot also go round a hole`
          : `the rooms enclose a hole ${box} that is ${verdict} (bounded by ${by}); a hole must be covered exactly by \`outdoor\` surfaces (a courtyard) or by a \`void\``,
      );
    }
  }
  return { pinched: false, outers, courtyards };
}

/**
 * `wall … between <A> and <B>` (ADR 0028 §4): the one shared run of two rectangles, by the
 * same sweep `walls from rooms` runs, as a two-point path from its end with the smaller `y`,
 * then `x` (§3's partition direction). Refusals: `E_ROOM_NOT_RECTANGLE`, `E_ROOMS_OVERLAP`,
 * `E_WALL_BETWEEN_NOT_ADJACENT` (no run) and `E_PARTITION_TOO_SHORT` (a run shorter than
 * `thickness`; not judged when `thickness` is not positive, which the wall reports itself).
 * Two interior-disjoint rectangles share at most one run, so nothing is chosen.
 */
export function deriveBetween(
  a: TileRoom,
  b: TileRoom,
  thickness: number,
): { ok: false; refusal: TilingRefusal } | { ok: true; points: [Point, Point] } {
  const swept = sweepRooms([a, b]);
  if (!swept.ok) return { ok: false, refusal: swept.refusals[0]! };
  const run = swept.runs[0];
  if (!run) {
    return {
      ok: false,
      refusal: {
        code: "E_WALL_BETWEEN_NOT_ADJACENT",
        rooms: [a.id, b.id],
        why: `"${a.id}" and "${b.id}" share no edge`,
      },
    };
  }
  const len = Math.abs(run.b.x - run.a.x) + Math.abs(run.b.y - run.a.y);
  if (thickness > 0 && len < thickness) {
    return {
      ok: false,
      refusal: {
        code: "E_PARTITION_TOO_SHORT",
        rooms: [a.id, b.id],
        why: `"${a.id}" and "${b.id}" share a run of ${len} mm, from (${run.a.x}, ${run.a.y}) to (${run.b.x}, ${run.b.y}), shorter than the ${thickness} mm wall`,
      },
    };
  }
  return { ok: true, points: [{ ...run.a }, { ...run.b }] };
}

/**
 * `wall … around [<A> <B> …]` (ADR 0028 §4): the rectilinear outline of the rooms' union, by
 * the same sweep and ring linking `walls from rooms` runs, as one closed ring from its vertex
 * with the smallest `y`, then `x`, running clockwise on the page (§3's outer-ring direction).
 * Refusals: `E_ROOM_NOT_RECTANGLE`, `E_ROOMS_OVERLAP` and `E_ROOMS_NOT_TILING` (a pinch, a
 * second edge-connected component, or ANY hole: one wall is one ring, and the hole covers
 * `walls from rooms` reads are not resolved before an authored wall, so a hole is refused
 * whatever covers it rather than drawn round or left open).
 */
export function deriveAround(
  rooms: readonly TileRoom[],
): { ok: false; refusals: TilingRefusal[] } | { ok: true; points: Point[] } {
  const swept = sweepRooms(rooms);
  if (!swept.ok) return swept;
  const notTiling: string[] = [];
  const tilingRooms: number[] = [];
  const ringed = linkRings(swept.pieces, null, swept.ids, swept.named, notTiling, tilingRooms);
  const outer = ringed.outers[0];
  if (notTiling.length > 0 || !outer) {
    return {
      ok: false,
      refusals: [
        {
          code: "E_ROOMS_NOT_TILING",
          rooms: swept.named(tilingRooms),
          why: notTiling.join("; ") || "the rooms have no floor to go round",
        },
      ],
    };
  }
  return { ok: true, points: outer.pts.map((p) => ({ ...p })) };
}

function refusalsOf(
  notTiling: string[],
  tilingRooms: number[],
  short: TilingRefusal | undefined,
  named: (s: Iterable<number>) => string[],
): TilingRefusal[] {
  const out: TilingRefusal[] = [];
  if (notTiling.length > 0)
    out.push({ code: "E_ROOMS_NOT_TILING", rooms: named(tilingRooms), why: notTiling.join("; ") });
  if (short) out.push(short);
  return out;
}

function shortRuns(
  runs: readonly TileRun[],
  thick: (r: TileRun) => number,
  ids: readonly string[],
): TilingRefusal | undefined {
  const short = runs
    .filter((r) => Math.abs(r.b.x - r.a.x) + Math.abs(r.b.y - r.a.y) < thick(r))
    .map((r) => (r.lo < r.hi ? { ...r, p: r.lo, q: r.hi, t: thick(r) } : { ...r, p: r.hi, q: r.lo, t: thick(r) }))
    .sort((u, v) => u.p - v.p || u.q - v.q);
  if (short.length === 0) return undefined;
  const rooms = [...new Set(short.flatMap((r) => [r.p, r.q]))].sort((a, b) => a - b).map((i) => ids[i]!);
  return {
    code: "E_PARTITION_TOO_SHORT",
    rooms,
    why: short
      .map(
        (r) =>
          `"${ids[r.p]}" and "${ids[r.q]}" share a run of ${Math.abs(r.b.x - r.a.x) + Math.abs(r.b.y - r.a.y)} mm, from (${r.a.x}, ${r.a.y}) to (${r.b.x}, ${r.b.y}), shorter than the ${r.t} mm partition`,
      )
      .join("; "),
  };
}

/**
 * One line's merge: `lo` holds the intervals of rooms on the line's lower side (left of a
 * vertical line, above a horizontal one), `hi` those on its upper side, each sorted and
 * disjoint. Emits shared runs and oriented boundary pieces; where one room is on both sides
 * the line is a seam inside a polygon, and neither.
 */
function sweepLine(
  c: number,
  lo: Interval[],
  hi: Interval[],
  vertical: boolean,
  pieces: TilePiece[],
  runs: TileRun[],
): void {
  const at = (t: number): Point => (vertical ? { x: c, y: t } : { x: t, y: c });
  // The sorted, distinct endpoints of both sides (each side's sequence is already sorted).
  const ends: number[] = [];
  let i = 0;
  let j = 0;
  const seq = (list: Interval[], k: number): number => (k % 2 === 0 ? list[k >> 1]!.s : list[k >> 1]!.e);
  while (i < 2 * lo.length || j < 2 * hi.length) {
    const v = j >= 2 * hi.length || (i < 2 * lo.length && seq(lo, i) <= seq(hi, j)) ? seq(lo, i++) : seq(hi, j++);
    if (ends.length === 0 || ends[ends.length - 1] !== v) ends.push(v);
  }
  let pl = 0;
  let ph = 0;
  // The open piece/run being extended: its kind and its start.
  let cur: { kind: "lo" | "hi" | "run"; s: number; e: number; owners: number[]; lo?: number; hi?: number } | null =
    null;
  const flush = (): void => {
    if (!cur) return;
    if (cur.kind === "run") {
      runs.push({ a: at(cur.s), b: at(cur.e), lo: cur.lo!, hi: cur.hi! });
    } else {
      // Floor on the right of travel: a `lo` piece (floor at -x or -y) runs +y on a vertical
      // line and -x on a horizontal one; a `hi` piece the opposite way.
      const forward = vertical ? cur.kind === "lo" : cur.kind === "hi";
      pieces.push({
        a: at(forward ? cur.s : cur.e),
        b: at(forward ? cur.e : cur.s),
        owners: cur.owners,
      });
    }
    cur = null;
  };
  for (let k = 0; k + 1 < ends.length; k++) {
    const s = ends[k]!;
    const e = ends[k + 1]!;
    while (pl < lo.length && lo[pl]!.e <= s) pl++;
    while (ph < hi.length && hi[ph]!.e <= s) ph++;
    const L = pl < lo.length && lo[pl]!.s <= s ? lo[pl]!.room : -1;
    const H = ph < hi.length && hi[ph]!.s <= s ? hi[ph]!.room : -1;
    const kind = L >= 0 && H >= 0 ? (L === H ? null : "run") : L >= 0 ? "lo" : H >= 0 ? "hi" : null;
    const same = cur !== null && kind === cur.kind && cur.e === s && (kind !== "run" || (cur.lo === L && cur.hi === H));
    if (!same) flush();
    if (kind === null) continue;
    if (cur === null) {
      cur = { kind, s, e, owners: [], ...(kind === "run" ? { lo: L, hi: H } : {}) };
    } else cur.e = e;
    const owner = kind === "lo" ? L : kind === "hi" ? H : -1;
    if (owner >= 0 && cur.owners[cur.owners.length - 1] !== owner) cur.owners.push(owner);
  }
  flush();
}

/** Even-odd test of a point that lies on no edge of the rectilinear `ring` (vertical edges only). */
function inRing(px: number, py: number, ring: readonly Point[]): boolean {
  let inside = false;
  for (let k = 0, l = ring.length - 1; k < ring.length; l = k++) {
    const a = ring[k]!;
    const b = ring[l]!;
    if (a.x !== b.x) continue;
    if (a.y > py !== b.y > py && px < a.x) inside = !inside;
  }
  return inside;
}

/** Is every edge of the ring horizontal or vertical? Exact: `===` on the resolved coordinates. */
export const rectilinear = (ring: readonly Point[]): boolean =>
  ring.every((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return p.x === q.x || p.y === q.y;
  });

/**
 * A rectilinear ring as interior-disjoint rectangles of its floor, or `undefined` for a ring with
 * a slanted edge. Horizontal slabs: one between each two neighbouring `y`s of the ring, cut at
 * the vertical edges that cross it, alternately in and out. Any ring gives disjoint rectangles,
 * one that touches itself included, so the sweep needs no further guard (the room reports such a
 * ring itself).
 *
 * The test allocates nothing and reads a ring the room's own resolution paid for, so it is free:
 * a slanted polygon costs what it always cost. The cut is what a polygon adds, charged before it
 * allocates: the sort, then one pass over the ring per slab (quadratic on a staircase).
 */
export function ringParts(ring: readonly Point[]): TileRect[] | undefined {
  if (!rectilinear(ring)) return undefined;
  const v = ring.length;
  chargeSteps(sortSteps(v) + v + 1);
  const ys = [...new Set(ring.map((p) => p.y))].sort((a, b) => a - b);
  chargeSteps(ys.length * (v + 1));
  const out: TileRect[] = [];
  for (let j = 0; j + 1 < ys.length; j++) {
    const y0 = ys[j]!;
    const y1 = ys[j + 1]!;
    // No vertex lies strictly between y0 and y1, so a vertical edge spans the slab or misses it.
    const xs: number[] = [];
    for (let k = 0; k < v; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % v]!;
      if (a.x === b.x && Math.min(a.y, b.y) <= y0 && y1 <= Math.max(a.y, b.y)) xs.push(a.x);
    }
    chargeSteps(sortSteps(xs.length) + xs.length);
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1]! > xs[k]!) out.push({ x0: xs[k]!, y0, x1: xs[k + 1]!, y1 });
    }
  }
  return out;
}

function boxOf(c: TileCover): TileRect {
  if (c.rect) return c.rect;
  const xs = c.poly!.map((p) => p.x);
  const ys = c.poly!.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function lowerIndex(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Is the hole bounded by `ring` covered exactly by one kind of cover? Decided on a
 * compressed grid of the hole's and the touching covers' edge coordinates: every cell of the
 * hole must be covered, by one kind only, and every cover must lie wholly inside the hole or
 * wholly outside it. A non-rectilinear cover covers no cell exactly and is left out.
 */
function holeCover(ring: readonly Point[], covers: readonly TileCover[]): "outdoor" | "void" | string {
  const hx = ring.map((p) => p.x);
  const hy = ring.map((p) => p.y);
  const hb = { x0: Math.min(...hx), x1: Math.max(...hx), y0: Math.min(...hy), y1: Math.max(...hy) };
  // `rectilinear()`, `boxOf()` and the grid below read every vertex of a polygon cover up to
  // four times, for every hole: charged first.
  chargeSteps(covers.reduce((t, c) => t + 1 + 4 * (c.poly?.length ?? 0), 1));
  const near = covers.filter((c) => {
    if (c.poly && !rectilinear(c.poly)) return false;
    const b = boxOf(c);
    return Math.min(b.x1, hb.x1) > Math.max(b.x0, hb.x0) && Math.min(b.y1, hb.y1) > Math.max(b.y0, hb.y0);
  });
  if (near.length === 0) return "uncovered";
  const xsSet = new Set(hx);
  const ysSet = new Set(hy);
  for (const c of near) {
    if (c.rect) {
      xsSet.add(c.rect.x0).add(c.rect.x1);
      ysSet.add(c.rect.y0).add(c.rect.y1);
    } else {
      for (const p of c.poly!) {
        xsSet.add(p.x);
        ysSet.add(p.y);
      }
    }
  }
  chargeSteps(sortSteps(xsSet.size) + sortSteps(ysSet.size));
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const N = nx * ny;
  // The hole's cells: one in-ring test per cell, one step per ring edge it reads.
  chargeSteps(N * (ring.length + 2) + 1);
  const inHole = new Uint8Array(N);
  const mask = new Uint8Array(N);
  for (let jy = 0; jy < ny; jy++) {
    for (let ix = 0; ix < nx; ix++) {
      if (inRing((xs[ix]! + xs[ix + 1]!) / 2, (ys[jy]! + ys[jy + 1]!) / 2, ring)) inHole[jy * nx + ix] = 1;
    }
  }
  for (const c of near) {
    const b = boxOf(c);
    const i0 = lowerIndex(xs, b.x0);
    const i1 = lowerIndex(xs, b.x1);
    const j0 = lowerIndex(ys, b.y0);
    const j1 = lowerIndex(ys, b.y1);
    chargeSteps((i1 - i0) * (j1 - j0) * (c.poly ? c.poly.length + 1 : 1) + 1);
    let inside = 0;
    let total = 0;
    for (let jy = j0; jy < j1; jy++) {
      for (let ix = i0; ix < i1; ix++) {
        if (c.poly && !inRing((xs[ix]! + xs[ix + 1]!) / 2, (ys[jy]! + ys[jy + 1]!) / 2, c.poly)) continue;
        const cell = jy * nx + ix;
        total++;
        if (inHole[cell]) inside++;
        mask[cell]! |= c.kind === "outdoor" ? 1 : 2;
      }
    }
    if (inside > 0 && inside < total) return "covered, but a cover spills past it";
  }
  let kinds = 0;
  for (let cell = 0; cell < N; cell++) {
    if (!inHole[cell]) continue;
    if (mask[cell] === 0) return kinds === 0 ? "uncovered" : "partly covered";
    kinds |= mask[cell]!;
  }
  if (kinds === 3) return "covered by both outdoor and void";
  return kinds === 1 ? "outdoor" : "void";
}

/** The authored walls lying on a derived path with positive overlap, by id (first seen first). */
function overlapping(
  path: readonly Point[],
  index: ReadonlyMap<string, Array<{ s: number; e: number; by: string }>>,
): string[] {
  const by: string[] = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k]!;
    const b = path[k + 1]!;
    const vertical = a.x === b.x;
    const list = index.get(vertical ? `v:${a.x}` : `h:${a.y}`) ?? [];
    chargeSteps(list.length + 1);
    const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    for (const w of list) if (Math.min(hi, w.e) > Math.max(lo, w.s) && !by.includes(w.by)) by.push(w.by);
  }
  return by;
}

/** Every straight axis-aligned wall segment of the group's final set (the derived pieces and
 *  the authored walls), by line, with its half-thickness: what an `open` run's ends meet.
 *  Charged one step per segment before it is built. */
function faceIndex(
  derived: readonly DerivedWallSpec[],
  authored: readonly TileWallSeg[],
  tInt: number,
  tExt: number,
): Map<string, Array<{ s: number; e: number; half: number }>> {
  let n = authored.length + 1;
  for (const d of derived) for (const p of d.pieces) n += p.points.length;
  chargeSteps(n);
  const segs: Array<{ a: Point; b: Point; t: number }> = [];
  for (const d of derived) {
    const t = d.role === "exterior" ? tExt : (d.thickness ?? tInt);
    for (const p of d.pieces) {
      const m = p.closed ? p.points.length : p.points.length - 1;
      for (let k = 0; k < m; k++) segs.push({ a: p.points[k]!, b: p.points[(k + 1) % p.points.length]!, t });
    }
  }
  for (const w of authored) if (w.thickness !== undefined) segs.push({ a: w.a, b: w.b, t: w.thickness });
  const idx = new Map<string, Array<{ s: number; e: number; half: number }>>();
  for (const { a, b, t } of segs) {
    let k: string;
    let s: number;
    let e: number;
    if (a.x === b.x && a.y !== b.y) {
      k = `v:${a.x}`;
      s = Math.min(a.y, b.y);
      e = Math.max(a.y, b.y);
    } else if (a.y === b.y && a.x !== b.x) {
      k = `h:${a.y}`;
      s = Math.min(a.x, b.x);
      e = Math.max(a.x, b.x);
    } else continue;
    const list = idx.get(k);
    if (list) list.push({ s, e, half: t / 2 });
    else idx.set(k, [{ s, e, half: t / 2 }]);
  }
  return idx;
}

/** How far an `open` run's end `p` is cut back: half the thickness of the thickest wall
 *  perpendicular to the run whose centreline passes through `p` (0 when none does). */
function faceAt(
  p: Point,
  vertical: boolean,
  faces: ReadonlyMap<string, Array<{ s: number; e: number; half: number }>>,
): number {
  // A vertical run is met by horizontal walls on the line y = p.y, and the other way round.
  const list = faces.get(vertical ? `h:${p.y}` : `v:${p.x}`) ?? [];
  chargeSteps(list.length + 1);
  const t = vertical ? p.x : p.y;
  let half = 0;
  for (const w of list) if (w.s <= t && t <= w.e && w.half > half) half = w.half;
  return half;
}

/** An upper bound on the runs coexistence leaves of one derived path: one, plus one per
 *  authored segment that overlaps one of its sides. Charged per authored segment read. */
function pieceBound(
  path: readonly Point[],
  closed: boolean,
  index: ReadonlyMap<string, Array<{ s: number; e: number; by: string }>>,
): number {
  let n = 1;
  const sides = closed ? path.length : path.length - 1;
  for (let k = 0; k < sides; k++) {
    const a = path[k]!;
    const b = path[(k + 1) % path.length]!;
    const vertical = a.x === b.x;
    const list = index.get(vertical ? `v:${a.x}` : `h:${a.y}`) ?? [];
    chargeSteps(list.length + 1);
    const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    for (const w of list) if (Math.min(hi, w.e) > Math.max(lo, w.s)) n++;
  }
  return n;
}

/** The group's authored straight axis-aligned segments, by line (`v:<x>` / `h:<y>`). */
function authoredIndex(walls: readonly TileWallSeg[]): Map<string, Array<{ s: number; e: number; by: string }>> {
  chargeSteps(walls.length + 1);
  const idx = new Map<string, Array<{ s: number; e: number; by: string }>>();
  for (const w of walls) {
    let k: string;
    let s: number;
    let e: number;
    if (w.a.x === w.b.x && w.a.y !== w.b.y) {
      k = `v:${w.a.x}`;
      s = Math.min(w.a.y, w.b.y);
      e = Math.max(w.a.y, w.b.y);
    } else if (w.a.y === w.b.y && w.a.x !== w.b.x) {
      k = `h:${w.a.y}`;
      s = Math.min(w.a.x, w.b.x);
      e = Math.max(w.a.x, w.b.x);
    } else continue;
    const list = idx.get(k);
    if (list) list.push({ s, e, by: w.wallId });
    else idx.set(k, [{ s, e, by: w.wallId }]);
  }
  return idx;
}

/**
 * Coexistence (ADR 0028 §3): drop every span of the derived path that an authored wall
 * lies on exactly, and return what remains as runs in the path's direction.
 */
function coexist(
  name: string,
  path: readonly Point[],
  closed: boolean,
  index: ReadonlyMap<string, Array<{ s: number; e: number; by: string }>>,
): Pick<DerivedWallSpec, "pieces" | "dropped"> {
  const sides = closed ? path.length : path.length - 1;
  const dropped: DerivedWallSpec["dropped"] = [];
  /** Kept sub-runs of each side, in travel order. */
  const kept: Array<Array<[Point, Point]>> = [];
  let anyDrop = false;
  for (let k = 0; k < sides; k++) {
    const a = path[k]!;
    const b = path[(k + 1) % path.length]!;
    const vertical = a.x === b.x;
    const list = index.get(vertical ? `v:${a.x}` : `h:${a.y}`) ?? [];
    chargeSteps(list.length + 1);
    const t0 = vertical ? a.y : a.x;
    const t1 = vertical ? b.y : b.x;
    const lo = Math.min(t0, t1);
    const hi = Math.max(t0, t1);
    const at = (t: number): Point => (vertical ? { x: a.x, y: t } : { x: t, y: a.y });
    const cuts: Array<[number, number]> = [];
    for (const w of list) {
      const s = Math.max(lo, w.s);
      const e = Math.min(hi, w.e);
      if (e <= s) continue;
      cuts.push([s, e]);
      const [p, q] = t0 < t1 ? [at(s), at(e)] : [at(e), at(s)];
      dropped.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, by: w.by });
    }
    if (cuts.length === 0) {
      kept.push([[a, b]]);
      continue;
    }
    anyDrop = true;
    cuts.sort((u, v) => u[0] - v[0]);
    const free: Array<[number, number]> = [];
    let t = lo;
    for (const [s, e] of cuts) {
      if (s > t) free.push([t, s]);
      t = Math.max(t, e);
    }
    if (hi > t) free.push([t, hi]);
    const runs = free.map(([s, e]) => [at(s), at(e)] as [Point, Point]);
    kept.push(t0 < t1 ? runs : runs.reverse().map(([p, q]) => [q, p] as [Point, Point]));
  }
  if (!anyDrop) return { pieces: [{ name, points: path.map((p) => ({ ...p })), closed }], dropped };
  // Chain the kept sub-runs: consecutive ones that meet continue one run.
  const chains: Point[][] = [];
  for (const side of kept) {
    for (const [p, q] of side) {
      const last = chains[chains.length - 1];
      const end = last?.[last.length - 1];
      if (last && end && end.x === p.x && end.y === p.y) last.push(q);
      else chains.push([p, q]);
    }
  }
  // A closed path whose first and last runs meet at the start vertex is one run across it.
  if (closed && chains.length > 1) {
    const first = chains[0]!;
    const last = chains[chains.length - 1]!;
    const end = last[last.length - 1]!;
    if (end.x === first[0]!.x && end.y === first[0]!.y) {
      chains.pop();
      chains[0] = [...last, ...first.slice(1)];
    }
  }
  return {
    pieces: chains.map((points, k) => ({ name: k === 0 ? name : `${name}~${k + 1}`, points, closed: false })),
    dropped,
  };
}
