/**
 * The per-room checks, run as one order-preserving composite: for each room (in
 * source order) TOO_SMALL → DISCONNECTED → NO_WINDOW → NOT_ENCLOSED → NO_FIXTURE →
 * GARAGE_TOO_NARROW, exactly the interleaving `lint()` has always emitted (the output
 * array is pinned by tests and by agents diffing `--json` output). A new check is
 * APPENDED to that sequence, never inserted into it.
 */

import {
  isBedroom,
  isGarage,
  isKitchen,
  isWetRoom,
  largestPerimeterGap,
  largestPerimeterGapRing,
  pointInRoomBox,
  pointOnRoomEdge,
  rectOf,
  roomAreaMm2,
} from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { zoneFixtureCategories } from "../../fixtures-catalog.js";
import { mm, shortfall } from "../measure.js";
import type { RRoom } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";

/** Furniture categories that count as a plumbing fixture for a wet room — derived
 *  from the catalog's `zones` data (single source; membership drift-tested). */
export const WET_FIX = zoneFixtureCategories("wet");
/** Furniture categories that count as a fixture/appliance for a kitchen. */
export const KITCHEN_FIX = zoneFixtureCategories("kitchen");

/** Square metres of a room (exact for a polygon too), rounded to 2 decimals. */
const areaM2 = (r: RRoom): number => Math.round((roomAreaMm2(r) / 1_000_000) * 100) / 100;

/**
 * Clear width one parked car needs, in millimetres.
 *
 * 2700 mm is the conventional minimum single-bay clear width — body plus the room to open a
 * door on each side — and 5400 for a double, which is what the residential codes and the
 * trade both land on. It is deliberately NOT the rounder 3000: this field obeys the same
 * calibration rule the fixture catalog's clearances do ("tight enough that a normal layout
 * never trips it"), and a 5500 mm double garage is a normal, buildable layout that 3000 would
 * warn about — `examples/hillside-villa.arch`'s is exactly one. A garage that trips this is
 * genuinely too narrow to park in, not merely snug.
 */
const CAR_BAY_WIDTH_MM = 2700;

/** Categories that occupy a parking bay. A bicycle or a motorcycle does not. */
const PARKED_CATEGORIES: ReadonlySet<string> = new Set(["car"]);

export const perRoomRules: LintRule = {
  name: "per-room",
  check(ctx: LintContext): Diagnostic[] {
    const { rules, rooms, windows, furniture, connectors, roomRects, wallSegs, labelOf, at, ir } = ctx;
    const out: Diagnostic[] = [];

    for (const r of rooms) {
      const rect = roomRects.get(r.id)!;
      const onEdge = (p: { x: number; y: number }): boolean => pointOnRoomEdge(p, rect, rules.tolMm);

      // Implausibly tiny room.
      const a = areaM2(r);
      if (a < rules.minRoomAreaM2) {
        out.push({
          severity: "warning",
          code: "W_ROOM_TOO_SMALL",
          ...at(r),
          message: `Room "${labelOf(r)}" is only ${a} m² (under ${rules.minRoomAreaM2} m²).`,
          hints: ["Increase its `size`, or merge it into an adjacent space."],
        });
      }

      // No door or opening on its perimeter, so it can't be entered.
      if (!connectors.some((c) => onEdge(c.at))) {
        out.push({
          severity: "warning",
          code: "W_ROOM_DISCONNECTED",
          ...at(r),
          message: `Room "${labelOf(r)}" has no door or opening — it can't be entered.`,
          hints: ["Add a `door` or a cased `opening` on one of its walls."],
        });
      }

      // A bedroom needs natural light / egress.
      if (isBedroom(r) && !windows.some((win) => onEdge(win.at))) {
        out.push({
          severity: "warning",
          code: "W_BEDROOM_NO_WINDOW",
          ...at(r),
          message: `Bedroom "${labelOf(r)}" has no window.`,
          hints: ["Add a `window` on an exterior wall of this room."],
        });
      }

      // A wet room not fully walled in (a partition that stops short leaves it open).
      if (isWetRoom(r)) {
        // A polygon room is measured around its own ring (any edge angle); a rectangle
        // keeps the four-sided test, byte-for-byte.
        const gap = r.poly
          ? largestPerimeterGapRing(r.poly, ir.walls, rules.tolMm, wallSegs)
          : largestPerimeterGap(rect, ir.walls, rules.tolMm, wallSegs);
        if (gap > rules.maxUnenclosedMm) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NOT_ENCLOSED",
            ...at(r),
            message: `Bathroom "${labelOf(r)}" is not fully enclosed (~${Math.round(gap)} mm of its perimeter has no wall).`,
            hints: ["Extend the partition so the room is walled on all sides — a door or window in the wall is fine."],
          });
        }
      }

      // A wet room or kitchen with no fixtures reads as an empty box.
      const isWet = isWetRoom(r);
      const isKit = isKitchen(r);
      if (isWet || isKit) {
        const want = isWet ? WET_FIX : KITCHEN_FIX;
        const has = furniture.some((f) => {
          const fr = rectOf(f);
          const cx = fr.x + fr.w / 2;
          const cy = fr.y + fr.h / 2;
          return want.has(f.category) && pointInRoomBox({ x: cx, y: cy }, rect);
        });
        if (!has) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NO_FIXTURE",
            ...at(r),
            message: `${isWet ? "Bathroom" : "Kitchen"} "${labelOf(r)}" has no ${isWet ? "fixtures (WC, basin, shower…)" : "fixtures (sink, counter, stove…)"}.`,
            hints: [
              `Add the expected fixtures — e.g. import \`lib/fixtures.arch\` and place a ${isWet ? "`wc`, `basin`, or `shower`" : "`kitchen_sink` and `counter`"}.`,
            ],
          });
        }
      }

      // A garage too narrow to park in. Appended to the per-room sequence, never inserted.
      //
      // The measure is the ROOM's short side, and the rule DECLINES a polygon room rather
      // than approximating one: a bounding box's short side is not a concave floor's clear
      // width, and a derived measurement taken from a shape's box instead of the shape is
      // the defect class this repository has already shipped six of. A garage is a rectangle
      // in practice; an L-shaped one gets no warning rather than a wrong one.
      if (isGarage(r) && !r.poly) {
        const cars = furniture.filter((f) => {
          const fr = rectOf(f);
          return PARKED_CATEGORIES.has(f.category) && pointInRoomBox({ x: fr.x + fr.w / 2, y: fr.y + fr.h / 2 }, rect);
        }).length;
        // An empty garage is still a garage, so it is measured against one bay: a room you
        // could not park in does not become sound by having no car drawn in it.
        const bays = Math.max(1, cars);
        const need = bays * CAR_BAY_WIDTH_MM;
        const have = Math.min(rect.w, rect.h);
        if (have < need) {
          const drawn = cars === 0 ? "no car drawn, so one bay is assumed" : `${cars} car${cars === 1 ? "" : "s"}`;
          out.push({
            severity: "warning",
            code: "W_GARAGE_TOO_NARROW",
            ...at(r),
            message: `Garage "${labelOf(r)}" is ${mm(have)} mm across its short side, under the ${mm(need)} mm ${bays} bay${bays === 1 ? "" : "s"} need (${drawn}) — ${mm(shortfall(need, have))} mm short.`,
            hints: [
              `A parking bay wants ${CAR_BAY_WIDTH_MM} mm of clear width — body plus a door opening each side.`,
              cars > 1
                ? "Widen the room, or park fewer cars in it."
                : "Widen the room, or drop the `uses garage` tag if it is not one.",
            ],
          });
        }
      }
    }
    return out;
  },
};
