/**
 * Ground-surface soundness (v1.31) — two advisory rules over `outdoor`.
 *
 * Both are `W_*`, both are pure, and both key off a form no plan written before v1.31
 * can contain, so no existing plan can see either.
 */

import type { Point } from "../../ast.js";
import type { ROutdoor } from "../../ir.js";
import type { Diagnostic } from "../../diagnostics.js";
import { rectCorners } from "../../geometry.js";
import { distToPolygonEdge, pointInPolygon, polygonsOverlap, rectRing } from "../../geometry/polygon.js";
import type { LintContext, LintRule } from "../context.js";

/** The ring a surface actually occupies — its own polygon, or its rectangle. */
function ringOf(o: ROutdoor): Point[] | null {
  if (o.poly) return o.poly;
  if (o.size.w <= 0 || o.size.h <= 0) return null;
  return rectCorners(o.at.x, o.at.y, o.size.w, o.size.h);
}

/**
 * `W_OUTDOOR_OVERLAPS_ROOM` — a ground surface laid over a room's floor.
 *
 * Almost always a coordinate slip: a terrace written from the wrong corner, a lawn given
 * the building's own extent. It matters because the two areas are reported in DIFFERENT
 * totals (`floor_area_m2` and `outdoor_area_m2`), so an overlap silently double-counts
 * the same ground in a plot figure a reader computes by adding them.
 *
 * ## Why this is a boolean and not a "more than 0.5 m²" measurement
 *
 * The design asked for an area threshold. It is not implemented as one, deliberately.
 * There is no exact polygon-INTERSECTION-AREA primitive in this tree — `polygonsOverlap`
 * answers "do the interiors meet", not "by how much" — and a sampled or bbox-clipped
 * estimate would be a measured claim the geometry cannot actually back, in a project
 * whose standing rule is to refuse rather than approximate.
 *
 * The threshold turns out to buy nothing anyway. `polygonsOverlap` already requires more
 * than 1 mm of INTERIOR overlap on both axes, so the case a grace area was meant to
 * forgive — a patio drawn flush against the house, sharing the wall line exactly — does
 * not fire in the first place. The rule is exact, and it is the same predicate
 * `W_ROOM_OVERLAP` uses one element over, which is the strongest available argument that
 * it is the right one. If a measured deficit is ever wanted here, the honest way to get
 * it is a real polygon clipper, and that is a separate piece of work.
 */
export const outdoorOverlapsRoom: LintRule = {
  name: "outdoor-overlaps-room",
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const outdoors = ctx.ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
    if (outdoors.length === 0) return out;
    for (const o of outdoors) {
      const ring = ringOf(o);
      if (!ring) continue;
      for (const r of ctx.rooms) {
        const box = ctx.roomRects.get(r.id);
        if (!box) continue;
        const floor = box.poly ?? rectRing(box);
        if (!polygonsOverlap(ring, floor)) continue;
        out.push({
          severity: "warning",
          message:
            `Outdoor surface "${o.id}" (${o.surface}) overlaps the floor of room "${ctx.labelOf(r)}". ` +
            `Ground and floor are reported in separate totals, so the overlapping ground is counted ` +
            `twice by anything that adds them.`,
          code: "W_OUTDOOR_OVERLAPS_ROOM",
          ...ctx.at(o),
        });
        // One warning per surface: a lawn laid over the whole building would otherwise
        // emit one per room and bury the finding in its own repetitions.
        break;
      }
    }
    return out;
  },
};

/**
 * `W_BALCONY_NO_DOOR` — a balcony you cannot get onto.
 *
 * A balcony is reached through an opening in the wall it hangs off. One with no door and
 * no window within reach of any of its edges is either mis-placed or missing its opening,
 * and in both cases the drawing says something the building could not do.
 *
 * "Within reach" is one wall thickness from the balcony's own boundary — the same probe
 * distance `outdoor.ts` derives the railing with, and for the same reason: the opening
 * sits in the wall the balcony is against, so its centre is up to half a thickness inside
 * the slab edge and up to half a thickness outside it. A `window` counts as well as a
 * `door`, because a French window IS the way onto a balcony and refusing to see one would
 * make the rule fire on correct drawings.
 */
export const balconyNoDoor: LintRule = {
  name: "balcony-no-door",
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const balconies = ctx.ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor" && e.surface === "balcony");
    if (balconies.length === 0) return out;
    const reach = ctx.ir.walls.length > 0 ? Math.max(...ctx.ir.walls.map((w) => w.thickness)) : 250;
    const openings: Point[] = [...ctx.doors, ...ctx.windows].map((d) => ({ ...d.at }));
    for (const b of balconies) {
      const ring = ringOf(b);
      if (!ring) continue;
      const served = openings.some((p) => pointInPolygon(p.x, p.y, ring) || distToPolygonEdge(p, ring) <= reach);
      if (served) continue;
      out.push({
        severity: "warning",
        message:
          `Balcony "${b.id}" has no door or window within ${reach} mm of any of its edges, so there is ` +
          `no way onto it. Add a door (or a full-height window) on the wall it hangs off.`,
        code: "W_BALCONY_NO_DOOR",
        ...ctx.at(b),
      });
    }
    return out;
  },
};
