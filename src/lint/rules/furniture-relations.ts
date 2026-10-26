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
import { mm } from "../measure.js";

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

/** The seats PS2.11 judges: chairs that are sat at a table, by family (aliases included). */
const SEATS: ReadonlySet<string> = new Set(["chair", "office_chair", "outdoor_chair"]);
/** What a seat is sat at: tables and desks, by family. */
const TABLES: ReadonlySet<string> = new Set([
  "table",
  "dining_table",
  "meeting_table",
  "outdoor_table",
  "desk",
  "reception_desk",
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
