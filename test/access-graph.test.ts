import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";

/**
 * The modeled door access graph (`describe().access`) — entrances, per-room
 * reachability/depth from the exterior, and a widest-path clear-width bottleneck.
 * Pure facts for agents and (later) circulation lint; a model of the *modeled
 * doors*, so non-`door` openings are intentionally invisible.
 */

// A linear chain A—B—C with one exterior entrance into A, doors of decreasing width.
const chain = `plan "P" {
  units mm
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  wall partition thickness 100 { (6000,0) (6000,3000) }
  room id=a at (0,0)    size 3000x3000 label "A"
  room id=b at (3000,0) size 3000x3000 label "B"
  room id=c at (6000,0) size 2000x3000 label "C"
  door id=d_in at (1500,3000) width 1000 wall exterior  hinge left swing in
  door id=d_ab at (3000,1500) width 900  wall partition hinge left swing in
  door id=d_bc at (6000,1500) width 800  wall partition hinge left swing in
}`;

const roomById = (a: ReturnType<typeof describePlan>["access"], id: string) => a.rooms.find((r) => r.id === id)!;

describe("door access graph", () => {
  it("finds the entrance and per-room depth from the exterior", () => {
    const { access } = describePlan(chain);
    expect(access.hasEntrance).toBe(true);
    expect(access.entrances).toEqual(["d_in"]);
    expect(roomById(access, "a").depthFromEntrance).toBe(1);
    expect(roomById(access, "b").depthFromEntrance).toBe(2);
    expect(roomById(access, "c").depthFromEntrance).toBe(3);
    expect(access.rooms.every((r) => r.reachable)).toBe(true);
  });

  it("computes the widest-path clear-width bottleneck (min clear along the route)", () => {
    const { access } = describePlan(chain);
    // clear = nominal − 60. A reached by the 1000 door → 940. B adds the 900 (840).
    // C adds the 800 (740). The bottleneck is the narrowest door on the route.
    expect(roomById(access, "a").bottleneckClearWidth).toBe(940);
    expect(roomById(access, "b").bottleneckClearWidth).toBe(840);
    expect(roomById(access, "c").bottleneckClearWidth).toBe(740);
    // Edge facts expose both nominal and estimated clear width.
    const e = access.edges.find((x) => x.doorId === "d_in")!;
    expect(e.nominalWidth).toBe(1000);
    expect(e.estimatedClearWidth).toBe(940);
    expect(e.exterior).toBe(true);
  });

  it("reports no entrance and unreachable rooms when nothing opens to the exterior", () => {
    // Same chain but the entrance door is on a partition, not an exterior wall.
    const sealed = chain.replace("door id=d_in at (1500,3000) width 1000 wall exterior  hinge left swing in", "");
    const { access } = describePlan(sealed);
    expect(access.hasEntrance).toBe(false);
    expect(access.entrances).toEqual([]);
    expect(access.rooms.every((r) => !r.reachable)).toBe(true);
    expect(access.rooms.every((r) => r.depthFromEntrance === null)).toBe(true);
    expect(access.rooms.every((r) => r.bottleneckClearWidth === null)).toBe(true);
  });

  it("excludes an ambiguous door (touching 3+ rooms) from reachability", () => {
    // A, B, C meet at the point (3000,3000); a door there touches all three, so its
    // endpoints are undefined. D is reachable ONLY through that ambiguous door → it
    // must read as unreachable, and the edge must be flagged ambiguous.
    const src = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
      room id=a at (0,0)       size 3000x3000 label "A"
      room id=b at (3000,0)    size 3000x3000 label "B"
      room id=c at (0,3000)    size 3000x3000 label "C"
      room id=d at (3000,3000) size 3000x3000 label "D"
      door id=d_in  at (1500,0)    width 900 wall exterior  hinge left swing in
      door id=d_amb at (3000,3000) width 800 wall partition hinge left swing in
    }`;
    const { access } = describePlan(src);
    const amb = access.edges.find((e) => e.doorId === "d_amb")!;
    expect(amb.ambiguous).toBe(true);
    // A is reachable via the real entrance; D only via the ambiguous door → not reachable.
    expect(roomById(access, "a").reachable).toBe(true);
    expect(roomById(access, "d").reachable).toBe(false);
  });

  it("is deterministic (same source → identical graph)", () => {
    const a = JSON.stringify(describePlan(chain).access);
    const b = JSON.stringify(describePlan(chain).access);
    expect(a).toBe(b);
  });
});
