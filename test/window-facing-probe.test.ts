import { describe as vDescribe, expect, it } from "vitest";
import { describe } from "../src/describe.js";

/**
 * **A window's outward side comes from a local probe, not from the plan's centre.**
 *
 * `describe().windows[].facing` has three rules. With a rectangular host room it is the
 * room edge the window sits nearest — exact, and untouched here. Without one (no room on
 * the window's point, or a `polygon`/`circle` room whose four "sides" do not exist) the
 * host wall segment fixes the AXIS, and the outward SIDE used to be "the half of the plan
 * the window sits in, relative to the bounding-box midpoint of the union of room
 * rectangles".
 *
 * A **courtyard** puts that midpoint in the courtyard — i.e. outside the building — so
 * every window on a courtyard wall was reported facing the wrong way, silently, as a
 * published `describe()` fact. Both fixtures below are courtyards built so the bbox
 * answer and the true answer are **opposite**; both failed before the probe landed.
 */

/** The single window's page-relative facing (these fixtures declare no `north`). */
function facing(src: string): string {
  const s = describe(src);
  expect(s.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return s.windows[0]?.facing ?? "?";
}

/**
 * A courtyard whose ring of rooms is drawn to the courtyard wall's INNER FACE — a 600mm
 * wall, so the 300mm inset clears the 200mm host tolerance and the window sits on NO
 * room's perimeter. The rooms' union spans the whole building, so `planCenter` is
 * (6000, 6000): inside the courtyard, SOUTH of the window, which made the old rule read
 * "the window is in the northern half, so it faces N".
 *
 * The floor is north of that wall and the open courtyard is south of it, so it faces S.
 */
const HOSTLESS = `plan "courtyard" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,12000) (0,12000) close }
  wall id=court exterior thickness 600 { (4000,4000) (8000,4000) (8000,8000) (4000,8000) close }
  room id=r_north at (100,100)  size 11800x3600 label "North wing"
  room id=r_south at (100,8300) size 11800x3600 label "South wing"
  window id=w_court at (6000,4000) width 1200 wall court
}`;

/**
 * The same defect reached the other way: a re-entrant `polygon` room whose ring IS the
 * courtyard wall. The window has a host room, but a polygon has no four sides to pick the
 * nearest of, so it falls through to the same rule — and the C-shape's bounding-box
 * midpoint (6000, 6000) sits in the notch, not on the floor.
 */
const POLY_RING = `plan "courtyard" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (12000,0) (12000,12000) (0,12000) close }
  wall id=court partition thickness 200 { (4000,12000) (4000,4000) (8000,4000) (8000,12000) }
  room id=r_ring polygon (0,0) (12000,0) (12000,12000) (8000,12000) (8000,4000) (4000,4000) (4000,12000) (0,12000) label "Ring"
  window id=w_court at (6000,4000) width 1200 wall partition
}`;

vDescribe("window facing: the outward side is probed locally", () => {
  it("a courtyard window with no host room faces the courtyard, not the plan centre", () => {
    // Before the probe: "N" — the bounding-box midpoint of the room union is in the
    // courtyard, so the window read as "in the northern half of the plan".
    expect(facing(HOSTLESS)).toBe("S");
  });

  it("a window on a re-entrant polygon room's courtyard wall faces the courtyard", () => {
    expect(facing(POLY_RING)).toBe("S");
  });

  it("the probe decides the PAGE direction; `north` still turns it afterwards", () => {
    const s = describe(HOSTLESS.replace("units mm", "units mm\n  north right"));
    // `north right` = one clockwise quarter-turn, so page-S is compass E.
    expect(s.windows[0]?.facingPage).toBe("S");
    expect(s.windows[0]?.facing).toBe("E");
  });
});

vDescribe("window facing: the probe declines, and the plan-centre rule settles it", () => {
  /**
   * Rooms on BOTH sides — an interior window, whose compass facing is not a meaningful
   * fact anyway. `facing` is a required field, so it cannot be dropped; the historical
   * plan-centre rule is the stated tie-break. Room union y spans 0…10000, centre y 5000,
   * window at y 4000 → the northern half → "N".
   */
  it("rooms on both sides fall back to the plan-centre rule", () => {
    const src = `plan "interior" {
  units mm
  wall id=mid partition thickness 600 { (0,4000) (12000,4000) }
  room id=r_north at (0,0)    size 12000x3700 label "North"
  room id=r_south at (0,4300) size 12000x5700 label "South"
  window id=w at (6000,4000) width 1200 wall partition
}`;
    expect(facing(src)).toBe("N");
  });

  /**
   * Rooms on NEITHER side — a free-standing wall. Same tie-break: the room union is
   * y 6000…10000, centre y 8000, and the window at y 2000 is north of it.
   */
  it("a free-standing wall falls back to the plan-centre rule", () => {
    const src = `plan "free" {
  units mm
  wall id=free partition thickness 200 { (5000,2000) (9000,2000) }
  room id=r at (0,6000) size 12000x4000 label "Hall"
  window id=w at (7000,2000) width 1200 wall partition
}`;
    expect(facing(src)).toBe("N");
  });
});

vDescribe("window facing: the host-room rule is untouched", () => {
  /**
   * The overwhelmingly common case — a rectangular host room — never reaches the probe:
   * the facing is the room edge the window sits nearest, exactly as before. Pinned on the
   * flagship so a change to the probe cannot leak into it.
   */
  it("the flagship's windows keep their edge-derived facings", () => {
    const src = `plan "Studio" {
  units mm
  wall exterior thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  room id=r_living at (0,0) size 7000x6000 label "Living"
  window id=w_w at (0,2000)    width 1500 wall exterior
  window id=w_e at (7000,1500) width 1200 wall exterior
  window id=w_n at (3000,0)    width 1200 wall exterior
  window id=w_s at (3000,6000) width 1200 wall exterior
}`;
    const s = describe(src);
    expect(s.windows.map((w) => `${w.id}:${w.facing}`)).toEqual(["w_w:W", "w_e:E", "w_n:N", "w_s:S"]);
  });
});
