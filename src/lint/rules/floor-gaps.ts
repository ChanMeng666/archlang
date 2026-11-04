/**
 * Floor a piece cannot stand on: a storey's own `void`s, lift shafts and escalators (CR2 group D).
 *
 * A `void` is a hole in THIS storey's floor (a stairwell, an atrium, a double-height room): one on
 * the storey above is headroom here, one below is that storey's floor. A lift's shaft and an
 * escalator's footprint are floor no one stands on either. Stairs are not here: their flights and
 * landings are `W_FURNITURE_ON_STAIR`'s, read with headroom (`stairs.ts`).
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
import { mm } from "../measure.js";

/** One rectangle of floor no piece stands on, and the element it belongs to. */
export interface FloorGap {
  readonly rect: BBox;
  readonly of: RVoid | RVertical;
}

/** A storey's voids, lift shafts and escalators, in source order, each by the pieces it covers. */
export function floorGapsOf(elements: readonly ResolvedElement[]): FloorGap[] {
  return elements.flatMap((e): FloorGap[] => {
    if (e.kind === "void") return [{ rect: { x: e.at.x, y: e.at.y, w: e.size.w, h: e.size.h }, of: e }];
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
 * Is `r` covered by the union of `covers`, but for slivers 1 mm or less across (the tolerance of
 * `rectsOverlap`)? Exact on the grid the rectangles' own edges cut `r` into: every cell wider and
 * taller than 1 mm must have its centre in some cover. Deterministic, and at most (2k + 1)² cells
 * for k covers.
 */
export function coveredBy(r: BBox, covers: readonly BBox[]): boolean {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const cut = (lo: number, hi: number, at: number[]): number[] =>
    [...new Set([lo, hi, ...at.filter((v) => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = cut(
    r.x,
    x1,
    covers.flatMap((c) => [c.x, c.x + c.w]),
  );
  const ys = cut(
    r.y,
    y1,
    covers.flatMap((c) => [c.y, c.y + c.h]),
  );
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const w = xs[i + 1]! - xs[i]!;
      const h = ys[j + 1]! - ys[j]!;
      if (w <= 1 || h <= 1) continue;
      const cx = xs[i]! + w / 2;
      const cy = ys[j]! + h / 2;
      if (!covers.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h)) return false;
    }
  }
  return true;
}

/**
 * `W_FURNITURE_ON_VOID`: a piece standing on a void, a lift shaft or an escalator of its own
 * storey. Whatever stands there is read, a rug as much as a wardrobe, as the stair rule reads a
 * stairwell: a hole has nothing to walk or stand on. One warning per piece and gap element, at the
 * first of its rectangles the piece covers by more than 1 mm both ways (`rectsOverlap`).
 *
 * A stair is `W_FURNITURE_ON_STAIR`'s. A stairwell is usually drawn as a `stair` and a `void` on one
 * rectangle, so where the part of the void a piece covers lies wholly on the storey's stairs
 * ({@link coveredBy} their pieces), this rule yields to that one; a piece reaching past the stair
 * onto the rest of the void is still reported here.
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
    const stairs = ctx.ir.elements.flatMap((e) => (isVertical(e) && e.kind === "stair" ? piecesOf(e) : []));
    const lv = (ctx.building.storeyCount ?? 1) > 1 && ctx.ir.level !== undefined ? ` on level ${ctx.ir.level}` : "";
    const out: Diagnostic[] = [];
    for (const piece of ctx.furniture) {
      const foot = rectOf(piece);
      const seen = new Set<FloorGap["of"]>();
      for (const g of gaps) {
        if (seen.has(g.of) || !rectsOverlap(foot, g.rect)) continue;
        seen.add(g.of);
        const r = g.rect;
        if (g.of.kind === "void" && stairs.length > 0) {
          const x0 = Math.max(foot.x, r.x);
          const y0 = Math.max(foot.y, r.y);
          const on = {
            x: x0,
            y: y0,
            w: Math.min(foot.x + foot.w, r.x + r.w) - x0,
            h: Math.min(foot.y + foot.h, r.y + r.h) - y0,
          };
          if (coveredBy(on, stairs)) continue;
        }
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
