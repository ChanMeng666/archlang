/**
 * The clearance family of plan-soundness PS2.11, beyond the seat check: a WC whose centreline
 * stands too near a side obstacle (PS2.11a) and a tall unit standing in front of a window
 * (PS2.11b). Both measure the drawn shapes — a fixture's footprint (a quarter-turned rectangle,
 * so its rectangle IS its shape), a straight wall's body, a window's span on its host — never a
 * bounding box, through the measures `../clearance-measure.ts` states once for these rules and
 * for the placement check every quoted position passes.
 */

import { pointInRoomBox, rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { isTallUnit } from "../../fixtures-catalog.js";
import { type ClearWorld, measureStrip, type Obstacle } from "../../furniture-relation.js";
import type { RFurniture, RRoom } from "../../ir.js";
import { wallRef } from "../../wall-ref.js";
import {
  curvedNear,
  isShort,
  isWc,
  measureWcSides,
  type WcSide,
  type WcSides,
  wcWorld,
  windowBands,
  windowCover,
} from "../clearance-measure.js";
import type { LintContext, LintRule } from "../context.js";
import { deficitMm, mm } from "../measure.js";

/** The room a piece stands in: its declared room, else the first room whose floor holds the
 *  footprint's centre; `null` when none does. */
function roomOf(f: RFurniture, ctx: LintContext): RRoom | null {
  if (f.room !== undefined) {
    const r = ctx.rooms.find((x) => x.id === f.room);
    if (r) return r;
  }
  const c = { x: f.at.x + f.size.w / 2, y: f.at.y + f.size.h / 2 };
  return (
    ctx.rooms.find((r) => {
      const box = ctx.roomRects.get(r.id);
      return box !== undefined && pointInRoomBox(c, box);
    }) ?? null
  );
}

/**
 * The subject of a message: "The fridge in Kitchen" when the piece's room has a label, else
 * "A fridge" (iron law: a message never quotes an element id, and an unlabelled room has only
 * one). The piece is named by its own label, else by its category word.
 */
function subject(f: RFurniture, name: string, ctx: LintContext): string {
  const room = roomOf(f, ctx);
  if (room?.label !== undefined) return `The ${name} in ${room.label}`;
  return `${/^[aeiou]/i.test(name) ? "An" : "A"} ${name}`;
}

/** A WC named as a person would: its label, else "WC" (or "toilet", the word the plan used). */
const wcName = (f: RFurniture): string => f.label ?? (f.category === "toilet" ? "toilet" : "WC");

/** What stands beside a WC, in prose (no id) and in a hint (with one). */
function obstaclePhrase(o: Obstacle, ctx: LintContext): { prose: string; hint: string } {
  switch (o.kind) {
    case "furniture":
      return { prose: `the ${o.piece.label ?? o.piece.category}`, hint: `"${o.piece.id}"` };
    case "wall":
      return {
        prose: `${/^[aeiou]/i.test(o.seg.category) ? "an" : "a"} ${o.seg.category} wall`,
        hint: wallRef(ctx.ir.walls, o.seg),
      };
    case "swing":
      return { prose: "a door's swing", hint: `the swing of door "${o.door.id}"` };
  }
}

/**
 * A WC whose centreline is closer than {@link LintRuleset.wcSideClearanceMm} to a side
 * obstacle (plan-soundness PS2.11a): the face of a straight wall, or a fixture or piece of
 * furniture standing at the cut plane beside the pan (an overhead piece such as a mirror, and a
 * rug, are not obstacles; nor is a door's swing, which the door clears by closing and
 * `W_SWING_OBSTRUCTED` judges). The pan's sides are the two edges beside its back (its
 * `rotate`); each is measured square to the centreline over the pan's depth, as `clear sides`
 * measures (ADR 0029 §4), so the gap runs from the drawn footprint to the drawn shape beside
 * it. A curved wall is not measured. One warning per WC, on its nearer short side; hint only,
 * no fix (see {@link wcHint}).
 */
export const wcSideClearance: LintRule = {
  name: "wc-side-clearance",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_WC_SIDE_CLEARANCE"],
  check(ctx: LintContext): Diagnostic[] {
    const need = ctx.rules.wcSideClearanceMm;
    if (need === null) return [];
    const wcs = ctx.furniture.filter((f) => isWc(f.category));
    if (wcs.length === 0) return [];
    const world = wcWorld(ctx.furniture, ctx);
    const out: Diagnostic[] = [];
    for (const f of wcs) {
      const m = measureWcSides(rectOf(f), f.rotate, need, world, f);
      if (m === null) continue; // a pan at least twice the figure wide clears it by itself
      // A curved wall near either side is not measured: decline the pan and say so.
      if (curvedNear(ctx.wallSegs, [m.sides[0].strip, m.sides[1].strip])) {
        ctx.skip("curved-wc-wall");
        continue;
      }
      const short = m.sides.filter((s) => isShort(s, m.depth));
      if (short.length === 0) continue;
      const near = short.reduce((a, b) => (b.m.measured < a.m.measured ? b : a));
      const by = near.m.by!;
      const o = obstaclePhrase(by, ctx);
      const d = deficitMm(need, m.half + near.m.measured);
      out.push({
        severity: "warning",
        code: "W_WC_SIDE_CLEARANCE",
        ...ctx.at(f),
        message: `${subject(f, wcName(f), ctx)} has its centreline ${d.available} mm from ${o.prose} beside it; a WC needs ${d.required} mm to each side (${d.short} mm short).`,
        hints: [wcHint(f, m, near, need, world, ctx, o.hint, by.kind === "furniture")],
      });
    }
    return out;
  },
};

/**
 * The remedy for a short WC side, measured rather than guessed. Sliding the pan along its back
 * wall away from the obstacle by the shortfall works only when the OTHER side then still keeps
 * the figure: that side is re-measured to the depth it would need, and the hint says which.
 *
 * No machine-applicable fix: the edit depends on how the pan was placed (`at`, `against wall …
 * offset`, `in <room> anchor <edge>` or a relation), an anchored pan has no offset to write, and
 * a slide can trade this warning for another (a door's swing, a basin's front) that only the
 * full placement check sees — the author places it.
 */
function wcHint(
  f: RFurniture,
  m: WcSides,
  near: WcSide,
  need: number,
  world: ClearWorld,
  ctx: LintContext,
  obstacle: string,
  movable: boolean,
): string {
  const d = deficitMm(need, m.half + near.m.measured);
  const shift = m.depth - near.m.measured;
  const farSide = m.sides[0] === near ? m.sides[1] : m.sides[0];
  const reach = m.depth + shift;
  const far = measureStrip({ ...farSide.strip, depth: reach }, world, f);
  const figure = `the ruleset's \`wcSideClearanceMm\` is ${d.required} mm, centreline to a side wall or fixture`;
  const orMove = movable ? `; or move ${obstacle}` : "";
  if (far.measured >= reach)
    return `"${f.id}"'s centreline is ${d.available} mm from ${obstacle} (${figure}): slide it ${d.short} mm along its back wall, away from ${obstacle}, and its other side still keeps ${d.required} mm${orMove}.`;
  const width = 2 * m.half + near.m.measured + far.measured;
  const other = far.by !== null ? obstaclePhrase(far.by, ctx).hint : "its other side";
  return `"${f.id}"'s centreline is ${d.available} mm from ${obstacle} (${figure}), and the space across it, from ${obstacle} to ${other}, is ${mm(width)} mm, under the ${mm(2 * need)} mm a WC needs: move it to a wider run${movable ? `, or move ${obstacle}` : ""}.`;
}

/**
 * A tall unit ({@link isTallUnit}: a fridge, wardrobe, bookcase or locker) standing in front of
 * a window (plan-soundness PS2.11b). The window's band is its span along its straight host
 * wall, at most {@link LintRuleset.fixtureWallTolMm} either side of the wall's centreline: the
 * same "against the wall" measure `W_FIXTURE_FLOATING` uses, so the rule judges a unit standing
 * against the window's wall, on either side of it, not one across the room. The unit warns when
 * its footprint overlaps that band with positive area. A window whose sill is at or above a door
 * head (2100 mm, `DOOR_HEAD`) is a high window over full-height storage and is not judged; a
 * window on a curved wall files a `curved-window-host` coverage skip. One warning per unit and
 * window it covers, in source order; hint only, no fix (the author chooses which to move).
 */
export const furnitureOverWindow: LintRule = {
  name: "furniture-over-window",
  family: "furniture",
  layer: "validity",
  stage: "fixtures",
  codes: ["W_FURNITURE_OVER_WINDOW"],
  check(ctx: LintContext): Diagnostic[] {
    const tall = ctx.furniture.filter((f) => isTallUnit(f.category));
    if (tall.length === 0 || ctx.windows.length === 0) return [];
    const bands = windowBands(ctx.windows, () => ctx.skip("curved-window-host"));
    const tol = ctx.rules.fixtureWallTolMm;
    const out: Diagnostic[] = [];
    for (const f of tall) {
      for (const band of bands) {
        const cover = windowCover(band, rectOf(f), tol);
        if (cover === null) continue;
        const { w } = band;
        // The shorter slide along the wall that clears the window's span: past its near end.
        const toStart = cover.hi + w.width / 2;
        const toEnd = w.width / 2 - cover.lo;
        const name = f.label ?? f.category;
        out.push({
          severity: "warning",
          code: "W_FURNITURE_OVER_WINDOW",
          ...ctx.at(f),
          message: `${subject(f, name, ctx)} stands in front of ${mm(cover.covered)} mm of a ${mm(w.width)} mm window: a tall unit against the glass blocks its light and view.`,
          hints: [
            `"${f.id}" covers ${mm(cover.covered)} mm of window "${w.id}" on ${wallRef(ctx.ir.walls, w.host!)}: slide it ${mm(Math.min(toStart, toEnd))} mm along the wall past the window's ${toStart <= toEnd ? "start" : "end"} (its end nearer the wall's ${toStart <= toEnd ? "first" : "last"} point), or move the window, or stand a unit no higher than the sill (${mm(w.sill)} mm) there instead.`,
          ],
        });
      }
    }
    return out;
  },
};
