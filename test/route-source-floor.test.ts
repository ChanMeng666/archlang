import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";

/**
 * A key route starts on its from-room's FLOOR — the cells that were walkable before any
 * threshold was carved — not on the cells a carve opened inside that room's rectangle.
 *
 * A route is seeded at +Infinity on its from-room's cells (you start inside the room, so its
 * own furniture must not cap the route), and the widest search never reads a source cell's
 * own clearance. A cell belongs to the room whose rectangle holds its centre, so a doorway's
 * opened wall cells can lie in the from-room; seeded at +Infinity, they let the route step
 * past every cell the door stamped. Whether that happened depended on which side of the room
 * edge the partition's cells fell and on which room was written first (the far seed is always
 * `between[1]`'s): the red team's plan read 14000 with the bath written first and 740 with
 * the bedroom first. Seeding only the floor makes the opened cells part of the way out, so
 * the door caps the route whatever the order.
 */

const body = (bathFirst: boolean, partitionX = 5050, thickness = 100): string => {
  const bath = `    room id=bath at (0,0) size 5000x4000 label "Bathroom" uses bath`;
  const bed = `    room id=bed at (5000,0) size 5000x4000 label "Bedroom" uses bedroom`;
  // Rooms meet at x = 5000; the 100 mm partition is centred on x = 5050, so its cells lie in
  // the bedroom's rectangle, and the door `d` between them is the only way from bed to bath.
  return `    wall id=sh exterior thickness 200 { (0,0) (10000,0) (10000,4000) (0,4000) close }
    wall id=p partition thickness ${thickness} { (${partitionX},0) (${partitionX},4000) }
${bathFirst ? `${bath}\n${bed}` : `${bed}\n${bath}`}
    door id=front at (7500,4000) width 900 wall sh
    door id=d at (${partitionX},2000) width 800 wall p`;
};

const FRAMES = [0, 90, 180, 270].flatMap((r) => ["", " mirror x"].map((m) => `${r ? ` rotate ${r}` : ""}${m}`));

const measure = (bathFirst: boolean, clauses: string, partitionX?: number, thickness?: number) => {
  const src = `plan "route" {\n  units mm\n  grid 100\n  component c() {\n${body(bathFirst, partitionX, thickness)}\n  }\n  place c() as g at (0,0)${clauses}\n}\n`;
  const s = describePlan(src);
  const route = s.circulation?.routes.find((r) => r.fromRoomId === "g.bed" && r.toRoomId === "g.bath");
  const door = s.access?.edges.find((e) => e.doorId === "g.d");
  if (!route || !door) throw new Error("no bed → bath route through d");
  return { bottleneck: route.bottleneckClearWidthMm, walk: route.walkDistanceMm, doorClear: door.estimatedClearWidth };
};

describe("a key route is capped by the door it crosses, whatever the source order or frame", () => {
  it("bed → bath reads the door's clear width in both source orders and all eight frames", () => {
    const ref = measure(true, "");
    // The only way from bed to bath is `d`, and nothing else in either room is narrower.
    expect(ref.bottleneck).toBe(ref.doorClear);
    for (const bathFirst of [true, false]) {
      for (const f of FRAMES) expect(measure(bathFirst, f), `${bathFirst ? "bath" : "bed"} first${f}`).toEqual(ref);
    }
  });

  it("wherever the partition sits against the room edge, and however thick, the door caps the route", () => {
    // Which room's rectangle holds the partition's cells moves with its offset from the edge
    // at x = 5000; the route must read the door's width in every case and in either order.
    for (const x of [4900, 4950, 5000, 5050, 5100]) {
      for (const t of [80, 100, 200]) {
        for (const bathFirst of [true, false]) {
          const m = measure(bathFirst, "", x, t);
          expect(m.bottleneck, `partition x=${x} t=${t} ${bathFirst ? "bath" : "bed"} first`).toBe(m.doorClear);
        }
      }
    }
  });
});
