/**
 * Ground-surface soundness — two advisory rules over `outdoor`.
 *
 * Both are `W_*`, both are pure, and both key off `outdoor`, so a plan without it can
 * see neither.
 */

import type { Point } from "../../ast.js";
import type { ROutdoor, RRoom } from "../../ir.js";
import type { Diagnostic } from "../../diagnostics.js";
import { rectCorners } from "../../geometry.js";
import {
  distToPolygonEdge,
  pointInPolygon,
  polygonLabelPoint,
  polygonsOverlap,
  rectRing,
} from "../../geometry/polygon.js";
import type { LintContext, LintRule } from "../context.js";
import { capFirst, labelPointOf, placeWithin } from "../phrases.js";

/** The ring a surface actually occupies — its own polygon, or its rectangle. */
function ringOf(o: ROutdoor): Point[] | null {
  if (o.poly) return o.poly;
  if (o.size.w <= 0 || o.size.h <= 0) return null;
  return rectCorners(o.at.x, o.at.y, o.size.w, o.size.h);
}

/**
 * How a message names a ground surface (PS2.29: never by its id): its own label when it has one
 * (`terrace "Back terrace"`), else "the balcony off the living room" (the room whose floor it
 * touches or lies nearest, within `reach`), else "the lawn in the bottom left of the plan"; two
 * surfaces that would read alike are told apart by "(1 of 2)". Positions are the surfaces' and
 * the rooms' label points, not bounding boxes.
 */
function surfaceNames(ctx: LintContext, reach: number): Map<ROutdoor, string> {
  const outs = ctx.ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
  const names = new Map<ROutdoor, string>();
  const base = new Map<ROutdoor, string>();
  const points = ctx.rooms.map((r) => labelPointOf(r));
  for (const o of outs) {
    if (o.label !== undefined) {
      names.set(o, `${o.surface} "${o.label}"`);
      continue;
    }
    const ring = ringOf(o);
    let near: RRoom | undefined;
    let best = Infinity;
    if (ring)
      for (const r of ctx.rooms) {
        const box = ctx.roomRects.get(r.id);
        if (!box) continue;
        const floor = box.poly ?? rectRing(box);
        const d = polygonsOverlap(ring, floor)
          ? 0
          : Math.min(...ring.map((p) => distToPolygonEdge(p, floor)), ...floor.map((p) => distToPolygonEdge(p, ring)));
        if (d <= reach && d < best) {
          best = d;
          near = r;
        }
      }
    const centre = ring ? polygonLabelPoint(ring) : labelPointOf(o);
    base.set(
      o,
      near !== undefined
        ? `the ${o.surface} off ${ctx.nameOf(near)}`
        : `the ${o.surface} ${placeWithin(centre, points)}`,
    );
  }
  // Two surfaces worded alike are told apart by their place in the reading order.
  const alike = new Map<string, ROutdoor[]>();
  for (const [o, b] of base) alike.set(b, [...(alike.get(b) ?? []), o]);
  for (const [b, group] of alike) {
    const ordered = [...group].sort((p, q) => p.at.y - q.at.y || p.at.x - q.at.x);
    for (const [i, o] of ordered.entries()) names.set(o, group.length > 1 ? `${b} (${i + 1} of ${group.length})` : b);
  }
  return names;
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
  family: "outdoor",
  layer: "validity",
  codes: ["W_OUTDOOR_OVERLAPS_ROOM"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const outdoors = ctx.ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
    if (outdoors.length === 0) return out;
    // Named by place alone (reach -1): "off" the very room it overlaps would say nothing.
    const names = surfaceNames(ctx, -1);
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
            `${capFirst(names.get(o)!)} overlaps the floor of ${ctx.nameOf(r, "room")}. ` +
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
  family: "outdoor",
  layer: "validity",
  codes: ["W_BALCONY_NO_DOOR"],
  check(ctx: LintContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    const balconies = ctx.ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor" && e.surface === "balcony");
    if (balconies.length === 0) return out;
    const reach = ctx.ir.walls.length > 0 ? Math.max(...ctx.ir.walls.map((w) => w.thickness)) : 250;
    const names = surfaceNames(ctx, reach);
    const openings: Point[] = [...ctx.doors, ...ctx.windows].map((d) => ({ ...d.at }));
    for (const b of balconies) {
      const ring = ringOf(b);
      if (!ring) continue;
      const served = openings.some((p) => pointInPolygon(p.x, p.y, ring) || distToPolygonEdge(p, ring) <= reach);
      if (served) continue;
      out.push({
        severity: "warning",
        message:
          `${capFirst(names.get(b)!)} has no door or window within ${reach} mm of any of its edges, so there is ` +
          `no way onto it. Add a door (or a full-height window) on the wall it hangs off.`,
        code: "W_BALCONY_NO_DOOR",
        ...ctx.at(b),
      });
    }
    return out;
  },
};
