/**
 * Floor a piece cannot stand on: a storey's own `void`s, lift shafts and escalators (CR2 group D).
 *
 * A `void` is a hole in THIS storey's floor (a stairwell, an atrium, a double-height room): one on
 * the storey above is headroom here, one below is that storey's floor. A lift's shaft and an
 * escalator's footprint are floor no one stands on either. A stair is not a gap here: its flights
 * and landings are `W_FURNITURE_ON_STAIR`'s, read with headroom (`stairs.ts`). A `void` drawn over a
 * stair is still one, so a drawn stairwell can raise both codes.
 *
 * {@link floorGapsOf} is the one definition: `finish`'s furnish stage keeps every piece off the
 * same rectangles (`floorGaps`, `src/furnish.ts`), so it never proposes a position this rule
 * reports.
 */

import { rectOf } from "../../analyze.js";
import { pointInRoomBox } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { type BBox, rectOverlapAmounts, rectsOverlap } from "../../geometry/rect.js";
import type { ResolvedElement, RVoid } from "../../ir.js";
import { isVertical, piecesOf, type RVertical } from "../../vertical.js";
import type { LintContext, LintRule } from "../context.js";
import { voidPieces } from "../../elements/void.js";
import { mm } from "../measure.js";

/** One rectangle of floor no piece stands on, and the element it belongs to. */
export interface FloorGap {
  readonly rect: BBox;
  readonly of: RVoid | RVertical;
}

/** A storey's voids, lift shafts and escalators, in source order, each by the pieces it covers. */
export function floorGapsOf(elements: readonly ResolvedElement[]): FloorGap[] {
  return elements.flatMap((e): FloorGap[] => {
    if (e.kind === "void")
      return voidPieces(e).map((p) => ({ rect: { x: p.at.x, y: p.at.y, w: p.size.w, h: p.size.h }, of: e }));
    return isVertical(e) && e.kind !== "stair" ? piecesOf(e).map((rect) => ({ rect, of: e })) : [];
  });
}

/** What a gap is, as a person says it, and what the piece covers of it. */
const WHAT: Readonly<Record<FloorGap["of"]["kind"], { noun: string; of: string }>> = {
  void: { noun: "a void", of: "the hole in this floor" },
  elevator: { noun: "a lift shaft", of: "the shaft" },
  escalator: { noun: "an escalator", of: "its footprint" },
  stair: { noun: "a stair", of: "its footprint" },
};

/**
 * `W_FURNITURE_ON_VOID`: a piece standing on a void, a lift shaft or an escalator of its own
 * storey. Whatever stands there is read, a rug as much as a wardrobe, as the stair rule reads a
 * stairwell: a hole has nothing to walk or stand on. One warning per piece and gap element, at the
 * first of its rectangles the piece covers by more than 1 mm both ways (`rectsOverlap`).
 *
 * A `void` is read whatever else stands on it. A stairwell drawn as a `stair` and a `void` on one
 * rectangle can therefore raise this code beside `W_FURNITURE_ON_STAIR`: the stair rule reads only
 * what its headroom, landing and budget rules let it, and a yield here would lose the warning from
 * both (red-team round 2 of CR2d).
 */
export const furnitureOnVoid: LintRule = {
  name: "furniture-on-void",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURNITURE_ON_VOID"],
  check(ctx: LintContext): Diagnostic[] {
    if (ctx.furniture.length === 0) return [];
    const gaps = floorGapsOf(ctx.ir.elements);
    if (gaps.length === 0) return [];
    const lv = (ctx.building.storeyCount ?? 1) > 1 && ctx.ir.level !== undefined ? ` on level ${ctx.ir.level}` : "";
    const out: Diagnostic[] = [];
    for (const piece of ctx.furniture) {
      const foot = rectOf(piece);
      const seen = new Set<FloorGap["of"]>();
      for (const g of gaps) {
        if (seen.has(g.of) || !rectsOverlap(foot, g.rect)) continue;
        seen.add(g.of);
        const r = g.rect;
        const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const room = ctx.rooms.find((x) => {
          const b = ctx.roomRects.get(x.id);
          return b !== undefined && pointInRoomBox(centre, b);
        });
        const where = `${room ? `in ${ctx.nameOf(room)}` : ctx.placeAt(centre)}${lv}`;
        const what = WHAT[g.of.kind];
        const { ox, oy } = rectOverlapAmounts(foot, r);
        out.push({
          severity: "warning",
          code: "W_FURNITURE_ON_VOID",
          ...ctx.at(piece),
          message: `Furniture "${piece.label ?? piece.category}" stands on ${what.noun} ${where}: it covers ${mm(ox)} × ${mm(oy)} mm of ${what.of}, and there is no floor there to stand on.`,
          hints: [
            `Move or resize it so it clears \`${g.of.id}\` (x ${mm(r.x)}–${mm(r.x + r.w)}, y ${mm(r.y)}–${mm(r.y + r.h)}), or move the ${g.of.kind === "void" ? "void" : g.of.kind === "elevator" ? "lift" : "escalator"}.`,
          ],
        });
      }
    }
    return out;
  },
};
