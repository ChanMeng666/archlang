/**
 * The per-room checks, run as one order-preserving composite: for each room (in
 * source order) TOO_SMALL → DISCONNECTED → NO_WINDOW → NOT_ENCLOSED → NO_FIXTURE,
 * exactly the interleaving `lint()` has always emitted (the output array is pinned
 * by tests and by agents diffing `--json` output).
 */

import { isBedroom, isKitchen, isWetRoom, largestPerimeterGap, pointOnRoomEdge, rectOf } from "../../analyze.js";
import type { Diagnostic } from "../../diagnostics.js";
import { pointInRect } from "../../geometry/rect.js";
import type { RRoom } from "../../ir.js";
import type { LintContext, LintRule } from "../context.js";

/** Furniture categories that count as a plumbing fixture for a wet room. */
export const WET_FIX = new Set(["wc", "toilet", "basin", "sink", "shower", "bath", "bathtub", "tub"]);
/** Furniture categories that count as a fixture/appliance for a kitchen. */
export const KITCHEN_FIX = new Set([
  "sink",
  "kitchen_sink",
  "stove",
  "hob",
  "cooktop",
  "oven",
  "counter",
  "worktop",
  "fridge",
  "refrigerator",
]);

/** Square metres of a room, rounded to 2 decimals. */
const areaM2 = (r: RRoom): number => Math.round(((r.size.w * r.size.h) / 1_000_000) * 100) / 100;

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
          ...at(r.span),
          message: `Room "${labelOf(r)}" is only ${a} m² (under ${rules.minRoomAreaM2} m²).`,
          hints: ["Increase its `size`, or merge it into an adjacent space."],
        });
      }

      // No door or opening on its perimeter, so it can't be entered.
      if (!connectors.some((c) => onEdge(c.at))) {
        out.push({
          severity: "warning",
          code: "W_ROOM_DISCONNECTED",
          ...at(r.span),
          message: `Room "${labelOf(r)}" has no door or opening — it can't be entered.`,
          hints: ["Add a `door` or a cased `opening` on one of its walls."],
        });
      }

      // A bedroom needs natural light / egress.
      if (isBedroom(r) && !windows.some((win) => onEdge(win.at))) {
        out.push({
          severity: "warning",
          code: "W_BEDROOM_NO_WINDOW",
          ...at(r.span),
          message: `Bedroom "${labelOf(r)}" has no window.`,
          hints: ["Add a `window` on an exterior wall of this room."],
        });
      }

      // A wet room not fully walled in (a partition that stops short leaves it open).
      if (isWetRoom(r)) {
        const gap = largestPerimeterGap(rect, ir.walls, rules.tolMm, wallSegs);
        if (gap > rules.maxUnenclosedMm) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NOT_ENCLOSED",
            ...at(r.span),
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
          return want.has(f.category) && pointInRect(cx, cy, rect);
        });
        if (!has) {
          out.push({
            severity: "warning",
            code: "W_ROOM_NO_FIXTURE",
            ...at(r.span),
            message: `${isWet ? "Bathroom" : "Kitchen"} "${labelOf(r)}" has no ${isWet ? "fixtures (WC, basin, shower…)" : "fixtures (sink, counter, stove…)"}.`,
            hints: [
              `Add the expected fixtures — e.g. import \`lib/fixtures.arch\` and place a ${isWet ? "`wc`, `basin`, or `shower`" : "`kitchen_sink` and `counter`"}.`,
            ],
          });
        }
      }
    }
    return out;
  },
};
