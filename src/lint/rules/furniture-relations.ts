/**
 * Lint for the furniture relations (ADR 0029 §6): a declared `clear front|sides <mm>` that
 * measures short, and the undeclared seat check of plan-soundness PS2.11 — a chair at a table
 * or desk whose front faces away from it.
 *
 * Both read the geometry `src/furniture-relation.ts` states once: the front ray `facing`
 * derives a turn from, and the clear-zone measure `describe()` reports.
 */

import { actOnQuarterTurn, inverse } from "../../algebra/d4.js";
import { pointInRoomBox, rectInRoomBox, rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { canonicalFixture } from "../../elements/fixtures-glyphs.js";
import { sofaLRunDepth } from "../../elements/glyphs-living.js";
import type { WallSegment } from "../../geometry.js";
import { mergedLength, overlap1d } from "../../geometry/rect.js";
import {
  type ClearWorld,
  clearWorldOf,
  facingTurn,
  frontRayHit,
  measureClear,
  type Obstacle,
} from "../../furniture-relation.js";
import type { RFurniture } from "../../ir.js";
import { wallRef } from "../../wall-ref.js";
import type { LintContext, LintRule } from "../context.js";
import type { Hosted } from "../element-phrases.js";
import { mm } from "../measure.js";
import type { LintWork } from "../work.js";
import { onRun } from "./openings.js";

/** The room a piece is in, as a person names it: its declared room, else the room whose floor
 *  holds its centre; `""` when none does. */
export function inRoomPhrase(f: RFurniture, ctx: LintContext, forHint = false): string {
  const room =
    (f.room !== undefined ? ctx.rooms.find((r) => r.id === f.room) : undefined) ??
    ctx.rooms.find((r) => {
      const box = ctx.roomRects.get(r.id);
      return box !== undefined && pointInRoomBox({ x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 }, box);
    });
  // A message names an unlabelled room by what it is; a hint by its id, the handle to edit by.
  return room ? ` in ${room.label ?? (forHint ? room.id : ctx.nameOf(room))}` : "";
}

/** A piece named as a person would: its label, else its category. */
const pieceName = (f: RFurniture): string => f.label ?? f.category;

/** What stands in a clear zone, in prose (no id) and in a hint (with one). */
function obstaclePhrase(o: Obstacle, ctx: LintContext): { prose: string; hint: string } {
  switch (o.kind) {
    case "furniture":
      return { prose: `the ${pieceName(o.piece)}`, hint: `"${o.piece.id}"` };
    case "wall":
      return { prose: `a ${o.seg.category} wall`, hint: wallRef(ctx.ir.walls, o.seg) };
    case "swing":
      return { prose: "a door's swing", hint: `the swing of door "${o.door.id}"` };
  }
}

/**
 * A declared `clear front <mm>` or `clear sides <mm>` (ADR 0029 §4) that measures short: a
 * solid piece, a wall body or a door swing stands inside the zone the author asked to keep
 * free. Fires only on a piece that declares a zone, so no plan without one can see it.
 */
export const furnClearDeclared: LintRule = {
  name: "furn-clear-declared",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURN_CLEAR_FRONT", "W_FURN_CLEAR_SIDES"],
  check(ctx: LintContext): Diagnostic[] {
    const { furniture, ir, doors, at } = ctx;
    if (!furniture.some((f) => f._clear)) return [];
    const world: ClearWorld = clearWorldOf(furniture, ir.walls, doors);
    const out: Diagnostic[] = [];
    for (const f of furniture) {
      const c = f._clear;
      if (!c) continue;
      for (const zone of ["front", "sides"] as const) {
        const declared = c[zone];
        if (declared === undefined) continue;
        const m = measureClear(f, zone, declared, world);
        if (m.measured >= declared || m.by === null) continue;
        const o = obstaclePhrase(m.by, ctx);
        const where = zone === "front" ? "in front" : "at each side";
        out.push({
          severity: "warning",
          ...(zone === "front" ? { code: "W_FURN_CLEAR_FRONT" } : { code: "W_FURN_CLEAR_SIDES" }),
          ...at(f),
          message: `The ${pieceName(f)}${inRoomPhrase(f, ctx)} needs ${mm(declared)} mm clear ${where}, but ${o.prose} leaves ${mm(m.measured)} mm (${mm(declared - m.measured)} mm short).`,
          hints: [
            `Move ${o.hint} or "${f.id}" ${mm(declared - m.measured)} mm apart, or lower \`clear ${zone}\` on "${f.id}" if less will do.`,
          ],
        });
      }
    }
    return out;
  },
};

/** The seats PS2.11 judges: chairs that are sat at a table, by family (aliases included).
 *  `W_TABLE_NO_SEAT` reads them too (`src/lint/rules/room-contents.ts`). */
export const SEATS: ReadonlySet<string> = new Set(["chair", "office_chair", "outdoor_chair"]);
/** What a seat is sat at: tables and desks, by family. */
const TABLES: ReadonlySet<string> = new Set([
  "table",
  "dining_table",
  "meeting_table",
  "outdoor_table",
  "desk",
  "reception_desk",
  // The visual-assets tranche (V8): a desk pod is desks, and a picnic table is sat at.
  "workstation",
  "picnic_table",
]);

/** The larger of the two axis gaps between two rectangles (0 when they overlap on both). */
function gapMm(a: RFurniture, b: RFurniture): number {
  const dx = Math.max(b.at.x - (a.at.x + a.size.w), a.at.x - (b.at.x + b.size.w), 0);
  const dy = Math.max(b.at.y - (a.at.y + a.size.h), a.at.y - (b.at.y + b.size.h), 0);
  return Math.max(dx, dy);
}

/**
 * A chair at a table or desk whose front faces away from it (plan-soundness PS2.11, ADR 0029
 * §6). A seat is at a table when the two footprints are within `seatTableReachMm` of each
 * other on both axes; it warns when its front ray (the ray `facing` reads) enters no such table
 * within that reach. Seat and table must lie in the same room (or both in none). A seat that
 * declares `facing` states its own turn and is never judged.
 * Hint only: the author picks the table, so there is no machine-applicable fix.
 */
export const seatFacingAway: LintRule = {
  name: "seat-facing-away",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_SEAT_FACING_AWAY"],
  check(ctx: LintContext): Diagnostic[] {
    const { furniture, rules, rooms, roomRects, at, frameOf } = ctx;
    const reach = rules.seatTableReachMm;
    if (reach === null) return [];
    const tables = furniture.filter((f) => TABLES.has(canonicalFixture(f.category) ?? ""));
    if (tables.length === 0) return [];
    // The room a piece lies in: the first whose floor holds its footprint (`rectInRoomBox`, the
    // room's own shape, with the wall-band slack), or none. A seat is at a table only in the same
    // room, so a table behind a partition is never the one a chair is sat at.
    const roomOf = (f: RFurniture): string | null => {
      const fr = rectOf(f);
      for (const r of rooms) {
        const box = roomRects.get(r.id);
        if (box !== undefined && rectInRoomBox(fr, box)) return r.id;
      }
      return null;
    };
    const out: Diagnostic[] = [];
    for (const s of furniture) {
      if (s._facing !== undefined || !SEATS.has(canonicalFixture(s.category) ?? "")) continue;
      const home = roomOf(s);
      const near = tables.filter((t) => gapMm(s, t) <= reach && roomOf(t) === home);
      if (near.length === 0) continue;
      const rect = rectOf(s);
      if (near.some((t) => (frontRayHit(rect, s.rotate ?? 0, rectOf(t)) ?? Infinity) <= reach)) continue;
      let nearest = near[0]!;
      for (const t of near) if (gapMm(s, t) < gapMm(s, nearest)) nearest = t;
      const res = facingTurn(rect, rectOf(nearest));
      const sameGroup = s._instance === nearest._instance;
      const localId =
        s._instance !== undefined && nearest.id.startsWith(`${s._instance}.`)
          ? nearest.id.slice(s._instance.length + 1)
          : nearest.id;
      const g = frameOf(s);
      const turn = res.kind === "turn" && g !== null ? actOnQuarterTurn(inverse(g), res.turn) : null;
      // A table with an auto id is named first: `facing` on an auto id would break the moment an
      // earlier piece is named, and naming one renumbers every later auto id (ADR 0029 §6).
      const facingClause =
        nearest._idAuthored === true
          ? `add \`facing ${localId}\``
          : `name the ${pieceName(nearest)} (\`id=\`) and add \`facing <its id>\``;
      const hint =
        sameGroup && res.kind === "turn"
          ? `On "${s.id}", ${facingClause} (it turns to \`rotate ${turn ?? res.turn}\`).`
          : turn !== null
            ? `Turn "${s.id}" to face "${nearest.id}" (\`rotate ${turn}\`).`
            : `Move "${s.id}" so its front lines up with "${nearest.id}", then ${facingClause}.`;
      out.push({
        severity: "warning",
        code: "W_SEAT_FACING_AWAY",
        ...at(s),
        message: `${/^[aeiou]/i.test(pieceName(s)) ? "An" : "A"} ${pieceName(s)}${inRoomPhrase(s, ctx)} faces away from the ${pieceName(nearest)} beside it.`,
        hints: [hint],
      });
    }
    return out;
  },
};

/** The lounge seats `W_SEAT_FACING_WALL` judges, by family (aliases included: `couch`,
 *  `corner_sofa`, `sofa_2`). A chair is not one: `W_SEAT_FACING_AWAY` judges it at its table. */
const LOUNGE_SEATS: ReadonlySet<string> = new Set(["sofa", "sofa_l", "loveseat", "armchair"]);

/** Float noise a front-to-face comparison absorbs: a millionth of a millimetre, never a gap of floor. */
const FLOAT_EPS_MM = 1e-6;

/** Is `category` a lounge seat `W_SEAT_FACING_WALL` judges ({@link LOUNGE_SEATS}, aliases included)? */
export const isLoungeSeat = (category: string): boolean => LOUNGE_SEATS.has(canonicalFixture(category) ?? "");

/** What {@link seatFronts} reads of a piece: `repair` asks it of a footprint it has moved. */
export type SeatPiece = Pick<RFurniture, "category" | "at" | "size" | "rotate" | "_mirror">;

/**
 * The spans of each straight wall segment that are no wall to sit against, keyed by
 * {@link segKey}, as along-axis `[lo, hi]` coordinates: every door and cased opening on its host
 * ({@link onRun}), an `open between` opening included. A window is not one: the wall stands
 * below its sill.
 */
export type WallCuts = ReadonlyMap<string, readonly (readonly [number, number])[]>;

/** The key of a wall segment in {@link WallCuts}: its wall and its index in that wall. */
const segKey = (s: Pick<WallSegment, "wallId" | "index">): string => `${s.wallId}#${s.index}`;

/** {@link WallCuts} of a storey's elements. */
export function wallCutsOf(elements: readonly { kind: string }[]): WallCuts {
  const cuts = new Map<string, [number, number][]>();
  elements.forEach((e, i) => {
    if (e.kind !== "door" && e.kind !== "opening") return;
    const r = onRun(e as Hosted, i);
    if (!r || r.seg.arc) return;
    const { a, b } = r.seg;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= 0) return;
    // Along the segment's own axis (it is straight; a diagonal one is never a seat's wall).
    const horizontal = Math.abs(a.y - b.y) < FLOAT_EPS_MM;
    const p0 = horizontal ? a.x : a.y;
    const dir = (horizontal ? b.x - a.x : b.y - a.y) / len;
    const ends = [p0 + r.lo * dir, p0 + r.hi * dir];
    const span: [number, number] = [Math.min(...ends), Math.max(...ends)];
    const key = segKey(r.seg);
    const list = cuts.get(key);
    if (list) list.push(span);
    else cuts.set(key, [span]);
  });
  return cuts;
}

/** `[lo, hi]` with every cut taken out of it: the pieces left, in order. */
function minusCuts(
  lo: number,
  hi: number,
  cuts: readonly (readonly [number, number])[] | undefined,
): [number, number][] {
  let parts: [number, number][] = [[lo, hi]];
  for (const [clo, chi] of cuts ?? []) {
    const next: [number, number][] = [];
    for (const [plo, phi] of parts) {
      if (chi <= plo || clo >= phi) {
        next.push([plo, phi]);
        continue;
      }
      if (clo > plo) next.push([plo, clo]);
      if (chi < phi) next.push([chi, phi]);
    }
    parts = next;
  }
  return parts;
}

/** One drawn seat front of a piece: a run on a fixed axis, and the side (`out`, +1 or −1 along
 *  that axis) a sitter's legs go. `axis: "h"` is a horizontal edge at `y = at`. */
interface SeatFront {
  axis: "h" | "v";
  at: number;
  lo: number;
  hi: number;
  out: 1 | -1;
}

/**
 * The drawn fronts of a lounge seat, in plan. Every seat is drawn back-on-top and quarter-turned
 * clockwise about its footprint centre (`furniture.render`); a `mirror` reflects it about its own
 * vertical centre line before the turn. A sofa, loveseat or armchair has one front, the edge
 * opposite its back. An L-sofa has two, the inner edges of the L, {@link sofaLRunDepth} in from
 * the back edge and from the return's back: its open quadrant is floor, so its box's edge is no
 * front (`drawSofaL`). Exact on resolved coordinates: a quarter-turn only swaps and negates.
 */
function seatFronts(f: SeatPiece): SeatFront[] {
  const k = ((f.rotate ?? 0) / 90) % 4;
  const cx = f.at.x + f.size.w / 2;
  const cy = f.at.y + f.size.h / 2;
  const pw = k % 2 === 1 ? f.size.h : f.size.w;
  const ph = k % 2 === 1 ? f.size.w : f.size.h;
  // The drawing frame, relative to the centre: the back edge at y = −ph/2, the front at +ph/2.
  const left = -pw / 2;
  const right = pw / 2;
  const top = -ph / 2;
  const bottom = ph / 2;
  // [x0, y0, x1, y1, nx, ny] in the drawing frame, centre-relative.
  let runs: Array<[number, number, number, number, number, number]>;
  if (canonicalFixture(f.category) === "sofa_l") {
    const d = sofaLRunDepth(pw, ph);
    runs = f._mirror
      ? [
          [left, top + d, right - d, top + d, 0, 1],
          [right - d, top + d, right - d, bottom, -1, 0],
        ]
      : [
          [left + d, top + d, right, top + d, 0, 1],
          [left + d, top + d, left + d, bottom, 1, 0],
        ];
  } else runs = [[left, bottom, right, bottom, 0, 1]];
  // A clockwise quarter-turn on the sheet (+y down): (x, y) → (−y, x).
  const turn = (x: number, y: number): [number, number] => {
    let p: [number, number] = [x, y];
    for (let i = 0; i < k; i++) p = [-p[1], p[0]];
    return p;
  };
  return runs.map(([ax, ay, bx, by, nx, ny]): SeatFront => {
    const [px, py] = turn(ax, ay);
    const [qx, qy] = turn(bx, by);
    const [ux, uy] = turn(nx, ny);
    return ux === 0
      ? { axis: "h", at: cy + py, lo: cx + Math.min(px, qx), hi: cx + Math.max(px, qx), out: uy > 0 ? 1 : -1 }
      : { axis: "v", at: cx + px, lo: cy + Math.min(py, qy), hi: cy + Math.max(py, qy), out: ux > 0 ? 1 : -1 };
  });
}

/**
 * Is a seat front against a wall face, with no floor between it and a wall solid? A straight wall
 * parallel to the front counts when its solid reaches the front line from the sitter's side (its
 * near face at or behind the line, its far face beyond it) and, merged, such walls cover at least
 * half the front's run, the share a backed edge needs (`isAgainstWall`). No tolerance: a front
 * any distance off the face has floor in front of it, and `fixtureWallTolMm` (200 mm by default)
 * is far too wide for "against". An arc never counts, as for a backed edge, and neither does a
 * door or a cased opening in the wall ({@link WallCuts}): there is floor through it. Each (front,
 * wall segment) test is charged to `work.seatWallTests`, arcs included. The comparisons allow
 * {@link FLOAT_EPS_MM} of float noise, a millionth of a millimetre, which no grid can write.
 * Returns the segment covering most of the front, or null.
 */
function frontAgainstWall(
  front: SeatFront,
  segs: readonly WallSegment[],
  cuts: WallCuts,
  work?: LintWork,
): WallSegment | null {
  const len = front.hi - front.lo;
  if (len <= 0) return null;
  if (work) work.seatWallTests += segs.length;
  const line = front.out * front.at;
  const covered: Array<[number, number]> = [];
  let best: { s: WallSegment; along: number } | null = null;
  for (const s of segs) {
    if (s.arc) continue;
    const horizontal = Math.abs(s.a.y - s.b.y) < 1e-6;
    const vertical = Math.abs(s.a.x - s.b.x) < 1e-6;
    if (front.axis === "h" ? !horizontal : !vertical) continue;
    const c = front.out * (front.axis === "h" ? (s.a.y + s.b.y) / 2 : (s.a.x + s.b.x) / 2);
    const half = s.thickness / 2;
    // FLOAT_EPS_MM absorbs float noise only (an L-sofa's `D` is 0.56 x 1600 = 896.0000000000001), never a gap.
    if (!(c - half <= line + FLOAT_EPS_MM && line < c + half - FLOAT_EPS_MM)) continue;
    const slo = front.axis === "h" ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y);
    const shi = front.axis === "h" ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y);
    if (overlap1d(slo, shi, front.lo, front.hi) <= 0) continue;
    const parts = minusCuts(Math.max(slo, front.lo), Math.min(shi, front.hi), cuts.get(segKey(s)));
    covered.push(...parts);
    const along = mergedLength(parts);
    if (along > 0 && (best === null || along > best.along)) best = { s, along };
  }
  return best !== null && mergedLength(covered) >= len * 0.5 ? best.s : null;
}

/**
 * The wall segment a lounge seat's drawn front is against ({@link seatFronts},
 * {@link frontAgainstWall}), or null: `W_SEAT_FACING_WALL`'s question, and repair's when it has
 * pushed a seat flush to a face (ruling RM-D80).
 */
export function seatFrontWall(
  f: SeatPiece,
  segs: readonly WallSegment[],
  cuts: WallCuts,
  work?: LintWork,
): WallSegment | null {
  for (const front of seatFronts(f)) {
    const s = frontAgainstWall(front, segs, cuts, work);
    if (s !== null) return s;
  }
  return null;
}

/**
 * `W_SEAT_FACING_WALL` (product roadmap RM9.6, coverage class CV08; plan-soundness PS2.32): a
 * sofa, L-sofa, loveseat or armchair ({@link LOUNGE_SEATS}) whose drawn front is against a wall
 * face, with no floor between ({@link seatFronts}, {@link frontAgainstWall}): nobody can sit on
 * it. The front is read off the drawn turn (`rotate 0` puts the back to the north), never off the
 * box or off which side is nearer a wall. A seat's back to the room is not judged: seating is
 * arranged, and a sofa backing into the room is a room-divider layout (`src/fixtures-catalog.ts`).
 * No distance: the 600 mm version of PS2.32 has no read source. One warning per seat, at the
 * seat. No machine fix: half a turn may put the seat's front on another piece, so the hint names
 * the turn and the author decides.
 */
export const seatFacingWall: LintRule = {
  name: "seat-facing-wall",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_SEAT_FACING_WALL"],
  check(ctx: LintContext): Diagnostic[] {
    const { furniture, wallSegs, at, frameOf, work } = ctx;
    const seats = furniture.filter((f) => isLoungeSeat(f.category));
    if (seats.length === 0) return [];
    const cuts = wallCutsOf(ctx.ir.elements);
    const out: Diagnostic[] = [];
    for (const f of seats) {
      const family = canonicalFixture(f.category) ?? "";
      if (seatFrontWall(f, wallSegs, cuts, work) === null) continue;
      // An empty label draws nothing and names nothing: the category names the piece.
      const name = f.label || f.category;
      // An auto id is never quoted: naming any earlier piece renumbers it (ADR 0029 §6).
      const which = f._idAuthored === true ? `"${f.id}"` : `the ${name}`;
      const g = frameOf(f);
      // Half a turn puts the back where the front was, on that wall. Not offered for an L-sofa
      // (its fronts are inside its box), a piece whose turn `facing` states, or one placed
      // `against` a wall or a room edge, whose turn is derived (`E_FURN_AGAINST` refuses a
      // `rotate` there; a placed component's piece keeps `_againstWall`/`_relation`, not
      // `_authored`); pulled back into a placed component's frame.
      const derived =
        f._authored?.mode === "against" ||
        f._authored?.mode === "against-edge" ||
        f._againstWall !== undefined ||
        f._relation !== undefined;
      const turnable = family !== "sofa_l" && f._facing === undefined && !derived && g !== null;
      // The room phrase scans the storey's rooms once per reported seat (lesson bl: counted work).
      work.seatWallTests += ctx.rooms.length;
      const rot = f.rotate ?? 0;
      const local = (deg: number): number => actOnQuarterTurn(inverse(g!), deg % 360);
      // A sofa or loveseat drawn deeper than it is wide is a row of seats stretched along its
      // depth: half a turn keeps it so, and a quarter turn puts a long side to its back. (An
      // armchair is about square either way.)
      const deep = family !== "armchair" && (rot % 180 === 0 ? f.size.h > f.size.w : f.size.w > f.size.h);
      const quarter = turnable && deep ? [local(rot + 90), local(rot + 270)].sort((a, b) => a - b) : null;
      out.push({
        severity: "warning",
        code: "W_SEAT_FACING_WALL",
        ...at(f),
        message: `${/^[aeiou]/i.test(name) ? "An" : "A"} ${name}${inRoomPhrase(f, ctx)} has its front against a wall, with no floor in front of it to sit down from.`,
        hints: [
          quarter !== null
            ? `Turn ${which} a quarter turn (\`rotate ${quarter[0]}\` or \`rotate ${quarter[1]}\`, whichever puts its back on a wall): it is drawn deeper than it is wide, so a long side is its back. Or move it off the wall.`
            : turnable
              ? `Turn ${which} to \`rotate ${local(rot + 180)}\` so its back is on that wall and it faces the room, or move it off the wall.`
              : `Move ${which} so its front faces open floor (\`rotate 0\` puts its back to the north).`,
        ],
      });
    }
    return out;
  },
};
