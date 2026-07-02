import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compile, describe as describePlan } from "../src/index.js";

/**
 * Circulation facts (`describe().circulation`) — how far, how wide and how direct the
 * walk is over a clearance-eroded navigation grid (ADR 0008). Pure facts: coarse,
 * deterministic, and never a render change.
 */

/** Two 3×3 m rooms side by side, a 900 mm entrance and an 800 mm interior door. */
const TWO_ROOM = `plan "Two" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=a at (0,0)    size 3000x3000 label "Living"
  room id=b at (3000,0) size 3000x3000 label "Bedroom"
  door id=entry at (0,1500)    width 900 wall exterior  hinge left swing in
  door id=mid   at (3000,1500) width 800 wall partition hinge left swing in
}`;

const byId = <T extends { roomId: string }>(rows: T[]): Record<string, T> =>
  Object.fromEntries(rows.map((r) => [r.roomId, r]));

describe("circulation — facts on the nav grid", () => {
  it("measures a hand-checkable two-room plan", () => {
    const c = describePlan(TWO_ROOM).circulation;
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.entranceId).toBe("entry");
    expect(c.cellSizeMm).toBe(100);
    expect(c.bodyRadiusMm).toBe(300);

    const rooms = byId(c.rooms);
    // Bottleneck into each room is its connector's clear width (door width − 60 mm):
    // the entrance room reads the entrance, the far room the interior door it is behind.
    expect(rooms.a!.bottleneckClearWidthMm).toBe(840); // 900 − 60
    expect(rooms.b!.bottleneckClearWidthMm).toBe(740); // 800 − 60

    // The entrance is at (0,1500); room a's centre is ~1500 mm straight in, room b a
    // further 3000 mm across the plan — so b's walk is the longer, and both are direct.
    expect(rooms.a!.walkDistanceMm).toBeGreaterThan(1200);
    expect(rooms.a!.walkDistanceMm).toBeLessThan(1800);
    expect(rooms.b!.walkDistanceMm).toBeGreaterThan(rooms.a!.walkDistanceMm + 2500);
    expect(rooms.a!.detourRatio).toBeGreaterThanOrEqual(1);
    expect(rooms.a!.detourRatio).toBeLessThan(1.3);
  });

  it("is deterministic (two describe() calls deep-equal)", () => {
    expect(describePlan(TWO_ROOM).circulation).toEqual(describePlan(TWO_ROOM).circulation);
    // The whole summary too, not just the circulation block.
    expect(describePlan(TWO_ROOM)).toEqual(describePlan(TWO_ROOM));
  });

  it("reads a narrower bottleneck when furniture squeezes the route", () => {
    // A wide (1500 mm) cased opening between two rooms, then the same plan with two
    // fixtures pinching the way through it. The obstructed plan's far-room bottleneck
    // must drop below the clear one's.
    const base = (obstruct: string) => `plan "Squeeze" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "Living"
  room id=b at (4000,0) size 4000x4000 label "Kitchen"
  door id=entry at (0,2000)  width 900  wall exterior hinge left swing in
  opening id=gap at (4000,2000) width 1500 wall partition
${obstruct}}`;
    const clear = describePlan(base("")).circulation;
    const squeezed = describePlan(
      base(
        `  furniture cabinet at (3600,300) size 700x1200 label "c1"\n  furniture cabinet at (3600,2500) size 700x1200 label "c2"\n`,
      ),
    ).circulation;
    expect(clear).not.toBeNull();
    expect(squeezed).not.toBeNull();
    if (!clear || !squeezed) return;

    const clearB = byId(clear.rooms).b!.bottleneckClearWidthMm;
    const squeezedB = byId(squeezed.rooms).b!.bottleneckClearWidthMm;
    // Unobstructed, the tightest point reaching b is the 900 mm entrance (the 1500 mm
    // opening is wider); the fixtures then pinch the way well below that.
    expect(clearB).toBe(840);
    expect(squeezedB).toBeGreaterThan(0);
    expect(squeezedB).toBeLessThan(clearB);
    expect(squeezedB).toBeLessThanOrEqual(500);
  });

  it("routes a bedroom to its nearest bath", () => {
    const c = describePlan(`plan "Flat" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (9000,0) (9000,3000) (0,3000) close }
  wall partition thickness 100 { (3000,0) (3000,3000) }
  wall partition thickness 100 { (6000,0) (6000,3000) }
  room id=hall at (0,0)    size 3000x3000 label "Hall"
  room id=bed  at (3000,0) size 3000x3000 label "Bedroom"
  room id=bath at (6000,0) size 3000x3000 label "Bath"
  door id=entry at (0,1500)    width 900 wall exterior  hinge left swing in
  door id=d1    at (3000,1500) width 800 wall partition hinge left swing in
  door id=d2    at (6000,1500) width 700 wall partition hinge left swing in
}`).circulation;
    expect(c).not.toBeNull();
    if (!c) return;
    const route = c.routes.find((r) => r.fromRoomId === "bed" && r.toRoomId === "bath");
    expect(route).toBeDefined();
    expect(route!.walkDistanceMm).toBeGreaterThan(2000);
    expect(route!.bottleneckClearWidthMm).toBeGreaterThan(0);
  });

  it("is null when the plan has no modeled exterior entrance", () => {
    const c = describePlan(`plan "Sealed" {
  units mm
  grid 100
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=a at (0,0)    size 3000x3000 label "A"
  room id=b at (3000,0) size 3000x3000 label "B"
  door id=mid at (3000,1500) width 800 wall partition hinge left swing in
}`).circulation;
    expect(c).toBeNull();
  });

  it("does not change the default compiled SVG (facts-only, no render effect)", () => {
    const src = readFileSync(new URL("../examples/studio.arch", import.meta.url), "utf8");
    const before = compile(src, { noCache: true }).svg;
    // Running the circulation model (via describe) must not perturb compile output.
    describePlan(src);
    const after = compile(src, { noCache: true }).svg;
    expect(after).toBe(before);
    expect(after).not.toContain("circulation");
  });
});
