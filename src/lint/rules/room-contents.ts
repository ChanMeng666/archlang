/**
 * Room-contents advisories (plan-soundness PS2.8, PS2.9): a habitable room with no window, and
 * a furnished room missing the piece that defines it. Both read a room's use from
 * {@link roomUses} (its `uses`, else its label through `src/vocabulary.ts`); a room with no
 * classified use is skipped and declared through `ctx.skip` (the lint coverage report is where
 * an unclassified room shows, not a guess in these rules). Neither reads `site` or any other storey.
 */

import {
  arcWindowRoom,
  isBedroom,
  pointInRoomBox,
  pointOnRoomEdge,
  rectOf,
  roomRing,
  roomUses,
  roomsAtPoint,
} from "../../analyze.js";
import type { UseKind } from "../../ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { FurnishItem } from "../../furnish-table.js";
import { familyOf, servedBy } from "../../furnish-table.js";
import { distPointToWallSegment } from "../../geometry.js";
import type { RFurniture, RRoom } from "../../ir.js";
import { fmt2 } from "../../num-format.js";
import { judgesAsDwelling, type LintContext, type LintRule } from "../context.js";
import { definingItems, itemWords, pasteSet, useNoun } from "../defining.js";
import { capFirst } from "../../naming.js";
import { areaM2, lacksZoneFixture, pasteFailureWhy, roomHasWindow } from "./per-room.js";

// ---------------------------------------------------------------------------
// W_HABITABLE_NO_WINDOW
// ---------------------------------------------------------------------------

/** The uses this rule asks for daylight, in the order a message names the room by. */
const HABITABLE: readonly [UseKind, string][] = [
  ["living", "Living room"],
  ["dining", "Dining room"],
  ["kitchen", "Kitchen"],
];

/** The room's area in a bracket after its name; folded into the name's own bracket ("… (1 of 2; 20 m²)")
 *  when it ends in one, never two brackets in a row. */
function withArea(name: string, area: string): string {
  return name.endsWith(")") ? `${name.slice(0, -1)}; ${area})` : `${name} (${area})`;
}

/** A probe this far off a room edge, outward, is past any wall it could be on. */
const OUTSIDE_PROBE_MM = 400;

/**
 * Ids of the `exterior` walls along the room's own edge with no room on their far side,
 * sampled at ¼, ½ and ¾ of each ring edge and probed {@link OUTSIDE_PROBE_MM} outward (the
 * side the room's floor is not on): an exterior wall shared with an attached wing is not an
 * outside face.
 */
function outsideWallsAlong(ctx: LintContext, r: RRoom): string[] {
  const box = ctx.roomRects.get(r.id)!;
  const ring = roomRing(box);
  const out: string[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    for (const t of [0.25, 0.5, 0.75]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const side = pointInRoomBox({ x: p.x + n.x, y: p.y + n.y }, box) ? -1 : 1;
      const probe = { x: p.x + side * n.x * OUTSIDE_PROBE_MM, y: p.y + side * n.y * OUTSIDE_PROBE_MM };
      if ([...ctx.roomRects.values()].some((other) => pointInRoomBox(probe, other))) continue;
      for (const s of ctx.wallSegs) {
        if (s.category !== "exterior" || out.includes(s.wallId)) continue;
        if (distPointToWallSegment(p, s) <= ctx.rules.tolMm) out.push(s.wallId);
      }
    }
  }
  return out;
}

/**
 * Does a window the analysis attributes to NO room stand on an arc wall edge whose chord ends
 * both lie on this room's perimeter? A window on an arc host is on no room's straight edge, and
 * where the shape cannot attribute it either ({@link arcWindowRoom}: no floor behind either
 * face, and no bay opening into a room through the chord) `describe().windows[].room` reads
 * `null` for it even when it may light this room: whether the room has daylight is unknown,
 * and the rule says nothing (attribution unknown). A window the shape does attribute is read
 * by {@link roomHasWindow} instead.
 */
function arcWindowUnattributed(ctx: LintContext, r: RRoom): boolean {
  const box = ctx.roomRects.get(r.id)!;
  const tol = ctx.rules.tolMm;
  return ctx.windows.some(
    (w) =>
      w.host?.arc !== undefined &&
      roomsAtPoint(w.at, ctx.roomRects, tol).length === 0 &&
      arcWindowRoom({ at: w.at, width: w.width, host: w.host }, ctx.roomRects, tol, ctx.wallSegs) === null &&
      ctx.wallSegs.some(
        (s) =>
          s.arc !== undefined &&
          distPointToWallSegment(w.at, s) <= tol &&
          pointOnRoomEdge(s.a, box, tol) &&
          pointOnRoomEdge(s.b, box, tol),
      ),
  );
}

/**
 * `W_HABITABLE_NO_WINDOW`: a room whose use is living, dining or kitchen with no window on any
 * of its walls. The window test is `W_BEDROOM_NO_WINDOW`'s ({@link roomHasWindow}, the fact
 * `describe().windows[].room` is built from), so lint and describe read one attribution. A
 * bedroom is that rule's report, never this one's: one code per room. A bath, WC, hall or any
 * other use is never asked, and a room with no classified use is skipped (declared to the
 * coverage report). A room bounded by an arc wall edge carrying a window the analysis gives to
 * no room is skipped too (attribution unknown; PS0.12, declared as `arc-window-unattributed`):
 * its bay may well light it. A room whose only habitable use is kitchen is judged only on a plan
 * that reads as a dwelling (PS2.18, {@link judgesAsDwelling}): on a café or an office it is
 * declared as `non-dwelling`, window or not. Living and dining rooms are judged on every plan.
 */
export const habitableNoWindow: LintRule = {
  name: "habitable-no-window",
  family: "daylight",
  layer: "validity",
  stage: "openings",
  codes: ["W_HABITABLE_NO_WINDOW"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      const uses = roomUses(r);
      if (uses.size === 0) ctx.skip("no-uses", r);
      const kind = HABITABLE.find(([u]) => uses.has(u));
      if (kind === undefined || isBedroom(r)) continue;
      // PS2.18: a kitchen's daylight is a dwelling's need; an office kitchenette has no such duty.
      if (kind[0] === "kitchen" && !judgesAsDwelling(ctx)) {
        ctx.skip("non-dwelling", r);
        continue;
      }
      if (roomHasWindow(ctx, r)) continue;
      if (arcWindowUnattributed(ctx, r)) {
        ctx.skip("arc-window-unattributed", r);
        continue;
      }
      const along = outsideWallsAlong(ctx, r);
      // Only an authored id can be named back to the author; a generated one is not in the source.
      const named = along.filter((id) => ctx.ir.walls.find((w) => w.id === id)?._idAuthored === true);
      const where =
        along.length === 0
          ? `No \`exterior\` wall runs along an outside edge of this room (\`${r.id}\`): give it an outside wall to take a \`window\`, or accept that it is an inner room.`
          : named.length === 0
            ? `Add a \`window\` on the \`exterior\` wall that runs along this room's (\`${r.id}\`) outside edge.`
            : `Add a \`window\` on ${named.length === 1 ? "wall" : "one of walls"} ${named.map((w) => `\`${w}\``).join(", ")}, which ${named.length === 1 ? "runs" : "run"} along this room's (\`${r.id}\`) outside edge.`;
      out.push({
        severity: "warning",
        code: "W_HABITABLE_NO_WINDOW",
        ...ctx.at(r),
        message: `${withArea(capFirst(ctx.nameOf(r, kind[1].toLowerCase())), `${fmt2(areaM2(r))} m²`)} has no window on any of its walls; a room people live in needs daylight.`,
        hints: [where, "Accept it if the room is lit in a way the plan cannot draw (a roof light, a light well)."],
      });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// W_ROOM_MISSING_DEFINING
// ---------------------------------------------------------------------------

const spoken = (category: string): string => category.replace(/_/g, " ");

/**
 * `W_ROOM_MISSING_DEFINING`: a room that holds at least one piece of furniture (so the author
 * furnished it) but lacks a piece its use is defined by (`DEFINING`, `src/lint/defining.ts`). A
 * piece is in the room when its footprint centre is on the room's floor, read off the shape
 * ({@link pointInRoomBox}: the polygon when there is one), as `W_ROOM_NO_FIXTURE` reads it. A
 * held piece does the job of its own family and of the one the catalogue says it `serves`
 * (`double_bed` serves `bed`), the reading `finish` uses. An empty room is never reported, and
 * neither are the wet and kitchen uses of a room `W_ROOM_NO_FIXTURE` already reports. A room
 * with no classified use is skipped (declared to the coverage report). No machine fix: where a
 * piece goes is the author's decision; the hint quotes statements checked together.
 */
export const roomMissingDefining: LintRule = {
  name: "room-missing-defining",
  family: "contents",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_ROOM_MISSING_DEFINING"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const r of ctx.rooms) {
      const uses = [...roomUses(r)];
      if (uses.length === 0) {
        ctx.skip("no-uses", r);
        continue;
      }
      const rect = ctx.roomRects.get(r.id)!;
      const held: RFurniture[] = ctx.furniture.filter((f) => {
        const fr = rectOf(f);
        return pointInRoomBox({ x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }, rect);
      });
      if (held.length === 0) continue;
      const noFixture = lacksZoneFixture(ctx, r);
      const families = new Set(held.flatMap((f) => servedBy(f.category)));
      const holds = (i: FurnishItem): boolean => itemWords(i).some((w) => families.has(familyOf(w)));
      const missing: { use: UseKind; items: FurnishItem[] }[] = [];
      for (const use of uses) {
        if (noFixture && (use === "bath" || use === "wc" || use === "kitchen")) continue;
        const items = definingItems(use).filter((i) => !holds(i) && !missing.some((m) => m.items.includes(i)));
        if (items.length > 0) missing.push({ use, items });
      }
      if (missing.length === 0) continue;
      const items = missing.flatMap((m) => m.items);
      const pieces = [...new Set(held.map((f) => spoken(f.category)))].join(", ");
      const lackList = items.map((i) => `no ${itemWords(i).map(spoken).join(" or ")}`);
      // "no A, no B and no C", as `W_WET_ROOM_DOOR` lists rooms, never "no A and no B and no C".
      const lacks =
        lackList.length <= 1
          ? (lackList[0] ?? "")
          : `${lackList.slice(0, -1).join(", ")} and ${lackList[lackList.length - 1]}`;
      const nouns = missing.map((m) => `a ${useNoun(m.use)}`).join(" and ");
      const paste = pasteSet(ctx, r, items);
      const add =
        "stmts" in paste
          ? `Add ${paste.stmts.length === 1 ? "it" : "them"} (nothing to import), e.g. ${paste.stmts.map((s) => `\`${s}\``).join(" and ")}.`
          : `Add \`furniture ${paste.item.category} in ${r.id} …\`${paste.footprint ? ` (${fmt2(paste.footprint.along)} along a wall, ${fmt2(paste.footprint.depth)} deep)` : ""}; ${pasteFailureWhy(ctx, paste.failure)}.`;
      out.push({
        severity: "warning",
        code: "W_ROOM_MISSING_DEFINING",
        ...ctx.at(r),
        message: `${capFirst(ctx.nameOf(r))} is furnished (${pieces}) but has ${lacks}: ${items.length === 1 ? "the piece that makes" : "the pieces that make"} it ${nouns}.`,
        hints: [
          add,
          `If \`${r.id}\` is not ${nouns}, say what it is with \`uses …\`: a room's use is read from its \`uses\`, or from its label when it has none.`,
        ],
      });
    }
    return out;
  },
};
