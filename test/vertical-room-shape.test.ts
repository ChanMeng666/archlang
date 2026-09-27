/**
 * **A stair, lift or escalator belongs to the room whose FLOOR holds its footprint centre.**
 *
 * `roomOfVertical` (what `describe().verticals[].room` and the shaft graph's per-storey
 * `stops[].room` report) used to test the centre against each room's RECTANGLE — its
 * bounding box — which for a concave `polygon` room includes the notch. A stair standing in
 * the notch of an L, on nobody's floor, was reported as inside the L. It now asks the
 * room's shape (`pointInRoomBox`, the containment every other shape-aware reader uses);
 * a rectangle is its own shape, so a rectangular plan answers exactly as before, closed
 * bounds included.
 */

import { describe as suite, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";

/** An L: 8000×8000 with the south-east 4000×4000 quadrant cut out (the notch). */
const L_ROOM = `room id=ell polygon (0,0) (8000,0) (8000,4000) (4000,4000) (4000,8000) (0,8000) label "L"`;

const plan = (rooms: string, stair: string): string => `plan "t" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,8000) (0,8000) close }
  ${rooms}
  ${stair}
}`;

/** The one vertical's reported room. */
function roomOf(src: string): string | null {
  const s = describePlan(src);
  expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(s.verticals).toHaveLength(1);
  return s.verticals![0]!.room;
}

suite("roomOfVertical asks the room's shape, not its bounding box", () => {
  it("a stair in the notch of an L-shaped polygon room is NOT that room's", () => {
    // Footprint centre (5950, 6000): inside the L's bounding box, outside its floor.
    expect(roomOf(plan(L_ROOM, `stair id=st at (5500,5000) size 900x2000 dir up`))).toBeNull();
  });

  it("a stair inside the L IS that room's", () => {
    // Footprint centre (1450, 6000): in the L's west leg.
    expect(roomOf(plan(L_ROOM, `stair id=st at (1000,5000) size 900x2000 dir up`))).toBe("ell");
  });

  it("the notch stair is claimed by the room that actually fills the notch", () => {
    const rooms = `${L_ROOM}\n  room id=nook at (4000,4000) size 4000x4000 label "Nook"`;
    expect(roomOf(plan(rooms, `stair id=st at (5500,5000) size 900x2000 dir up`))).toBe("nook");
  });

  it("a circle room: a lift in its bounding-box corner is not on its floor", () => {
    const circle = `room id=drum circle at (4000,4000) radius 4000 label "Drum"`;
    // Centre (600, 600): inside the 0..8000 box, ~4808 mm from the circle's centre.
    expect(roomOf(plan(circle, `elevator id=lift at (100,100) size 1000x1000`))).toBeNull();
    expect(roomOf(plan(circle, `elevator id=lift at (3500,3500) size 1000x1000`))).toBe("drum");
  });

  it("control: a rectangle room keeps the closed-bounds answer, edge included", () => {
    const rect = `room id=hall at (0,0) size 8000x8000 label "Hall"`;
    // The notch position is floor for a rectangle of the same extent.
    expect(roomOf(plan(rect, `stair id=st at (5500,5000) size 900x2000 dir up`))).toBe("hall");
    // Centre exactly on the east edge (x = 8000): closed bounds count it inside.
    expect(roomOf(plan(rect, `stair id=st at (7550,3000) size 900x2000 dir up`))).toBe("hall");
    // Just past it: outside.
    expect(roomOf(plan(rect, `stair id=st at (7600,3000) size 900x2000 dir up`))).toBeNull();
  });
});
