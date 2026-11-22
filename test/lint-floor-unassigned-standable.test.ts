/** W_FLOOR_UNASSIGNED by standing room: a connected piece of empty floor that holds a 600 mm circle and 0.5 m² is reported whatever the face's cover share (ARC3). */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";
import type { LintRuleset } from "../src/lint/ruleset.js";

/**
 * `W_FLOOR_UNASSIGNED` used to need BOTH a cover share under `minFaceCoverRatio` and
 * `minUnassignedM2` of empty floor, so a bay beyond a room's straight edge, a small share of a
 * big face, was never reported. It is now also reported when one connected piece of the empty
 * floor holds a circle `minStandableMm` across (default 600) and `minUnassignedM2` on its own
 * (`src/analyze/unassigned-pieces.ts`). Every case below carries its own counter-case, so a rule
 * that never fires or always fires fails it.
 */

const unassigned = (src: string, ruleset: Partial<LintRuleset> = {}) =>
  lint(src, { ruleset }).filter((d) => d.code === "W_FLOOR_UNASSIGNED");
const standing = (src: string, ruleset: Partial<LintRuleset> = {}) =>
  unassigned(src, ruleset).filter((d) => d.message.includes("a person could stand in"));

const plan = (body: string): string => `plan "P" {\n  units mm\n  grid 50\n${body}\n}\n`;

describe("the bay of the owner's Bay Bungalow (test/floor-unassigned/bay-bungalow.arch)", () => {
  const bay = readFileSync("test/floor-unassigned/bay-bungalow.arch", "utf8");

  it("reports the bay the rectangular living room leaves, beside the Snug's share report", () => {
    const ds = unassigned(bay);
    expect(ds.map((d) => d.message.split(": the walls")[0])).toEqual([
      '1.13 m² of walled floor next to "Living", along a curved wall, is in no room, in one piece a person could stand in (it holds a circle 600 mm across)',
      // The share report is unchanged.
      '3.66 m² of walled floor next to "Snug" is in no room',
    ]);
    expect(ds[0]!.message).toContain("the walls there enclose 38.74 m² and rooms cover 97 % of it.");
    expect(ds[0]!.hints!.at(-1)).toBe('The rooms are "r_living"; the walls round it are "shell".');
    // Without the new path the share alone (97 % covered) would say nothing about the bay.
    expect(unassigned(bay, { minStandableMm: 5000 }).map((d) => d.message.split(" ")[0])).toEqual(["3.66"]);
  });

  it("measures the bay exactly: its widest circle is 608.8 mm across, from the true arc", () => {
    // The bay is the segment of the arc wall's inner face (radius 1900 − 125) beyond the room's
    // edge on the chord, whose centre stands √(1900² − 1500²) ≈ 1166.2 mm inside: depth 608.81 mm.
    expect(standing(bay, { minStandableMm: 608.5 })).toHaveLength(1);
    expect(standing(bay, { minStandableMm: 609 })).toHaveLength(0);
  });
});

describe("what a person cannot stand in is not reported by it", () => {
  it("is silent on rooms drawn 100 mm short of every wall (a ring 100 mm wide)", () => {
    // Face 9800 × 9800 (y 100–9900); the room 9600 × 9600 leaves 3.92 m², 95.9 % covered.
    const src = plan(`  wall id=shell exterior thickness 200 { (0,0) (10000,0) (10000,10000) (0,10000) close }
  door id=d_in on shell at 5000 width 900
  room id=r_hall at (200,200) size 9600x9600 label "Hall" uses office`);
    expect(unassigned(src)).toEqual([]);
    // The floor is there to report: a 100 mm circle stands in the ring, and a stricter share sees it.
    expect(standing(src, { minStandableMm: 100 })).toHaveLength(1);
    expect(unassigned(src, { minFaceCoverRatio: 0.97 })).toHaveLength(1);
  });

  it("is silent on a strip 400 mm wide along a wall", () => {
    // Face 7800 × 7800; the room stops 400 mm short of the south wall's face for 2900 mm: 1.16 m².
    const src = plan(`  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,8000) (0,8000) close }
  door id=d_in on shell at 5000 width 900
  room id=r_a polygon (0,0) (8000,0) (8000,8000) (3000,8000) (3000,7500) (0,7500) label "Office" uses office`);
    expect(unassigned(src)).toEqual([]);
    expect(standing(src, { minStandableMm: 400 })).toHaveLength(1);
    expect(standing(src, { minStandableMm: 401 })).toHaveLength(0);
  });
});

describe("an alcove a person can stand in is reported", () => {
  /** A shell with an alcove 700 mm clear between its side walls' faces, `depth` mm past the room's edge. */
  const alcove = (depth: number): string =>
    plan(`  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,8000) (4450,8000) (4450,${8100 + depth}) (3550,${8100 + depth}) (3550,8000) (0,8000) close }
  door id=d_in on shell at 2000 width 900
  room id=r_a at (0,0) size 8000x8000 label "Office" uses office`);

  it("reports a 700 × 750 mm alcove (0.53 m²) the room stops at the mouth of", () => {
    expect(unassigned(alcove(750)).map((d) => d.message)).toEqual([
      '0.53 m² of walled floor next to "Office" is in no room, in one piece a person could stand in (it holds a circle 600 mm across): the walls there enclose 61.44 m² and rooms cover 99.1 % of it. Floor inside the walls that no room claims has no use, no area and no route the plan can check.',
    ]);
    // 700 mm wide: a 700 mm circle stands in it, a 701 mm one does not.
    expect(standing(alcove(750), { minStandableMm: 700 })).toHaveLength(1);
    expect(standing(alcove(750), { minStandableMm: 701 })).toHaveLength(0);
  });

  it("holds the piece's own area to minUnassignedM2: a 700 × 700 mm alcove is 0.49 m²", () => {
    expect(unassigned(alcove(700))).toEqual([]);
    expect(standing(alcove(700), { minUnassignedM2: 0.45 })).toHaveLength(1);
  });

  it("reads a piece the rooms close round, less a room standing free in it", () => {
    // A 2000 × 2000 gap between four rooms, with a 600 × 600 store standing free in the middle:
    // 4 − 0.36 = 3.64 m² in one piece (the store is its hole), of a 139.24 m² face.
    const src = plan(`  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,12000) (0,12000) close }
  door id=d_in on shell at 2000 width 900
  room id=r_n at (0,0) size 12000x5000 label "North" uses office
  room id=r_w at (0,5000) size 5000x2000 label "West" uses office
  room id=r_e at (7000,5000) size 5000x2000 label "East" uses office
  room id=r_s at (0,7000) size 12000x5000 label "South" uses office
  room id=r_st at (5700,5700) size 600x600 label "Store" uses storage`);
    const [d, ...rest] = unassigned(src);
    expect(rest).toEqual([]);
    expect(d!.message.split(": the walls")[0]).toBe(
      '3.64 m² of walled floor next to "North", "West", "East", "South" and "Store" is in no room, in one piece a person could stand in (it holds a circle 600 mm across)',
    );
    // The ring round the store is 700 mm wide, and wider in its corners: the widest circle there
    // touches both walls of the gap and the store's corner, 1400·√2 / (1 + √2) ≈ 820.1 mm across.
    expect(standing(src, { minStandableMm: 820 })).toHaveLength(1);
    expect(standing(src, { minStandableMm: 821 })).toHaveLength(0);
  });

  it("judges each piece on its own: two alcoves of 0.46 m² are not one of 0.91 m²", () => {
    const src =
      plan(`  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,8000) (6450,8000) (6450,8750) (5550,8750) (5550,8000) (2450,8000) (2450,8750) (1550,8750) (1550,8000) (0,8000) close }
  door id=d_in on shell at 2000 width 900
  room id=r_a at (0,0) size 8000x8000 label "Office" uses office`);
    // Each alcove is 700 × 650 = 0.455 m² and holds the 600 mm circle; 0.91 m² in all is over
    // minUnassignedM2 together, and each is under it apart.
    expect(unassigned(src)).toEqual([]);
    const [d, ...rest] = standing(src, { minUnassignedM2: 0.45 });
    expect(rest).toEqual([]);
    expect(d!.message).toContain('0.46 m² of walled floor next to "Office" is in no room');
    expect(d!.message).toContain(", the largest of 2 such pieces:");
  });
});
