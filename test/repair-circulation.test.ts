import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, repair } from "../src/index.js";

/**
 * `repair` circulation guard (ADR 0006/0008): repair never regresses a walk it can
 * measure. A candidate furniture move is rejected when it would newly squeeze a room's
 * entrance walk (or a key route) below the lint threshold (minPathClearWidthMm, 700) —
 * the piece is left in place and reported, report-don't-guess. A harmless move still
 * applies exactly as before.
 */

const bottleneck = (src: string, roomId: string): number | undefined =>
  describePlan(src).circulation?.rooms.find((r) => r.roomId === roomId)?.bottleneckClearWidthMm;

/**
 * A wardrobe declared `in bed` but parked in a far corner of a big living room, out of
 * the entrance walk. The naive wrong-room fix would relocate it into the narrow bedroom
 * and pinch the walk to it below 700 mm — so the guard must decline the move.
 */
const GUARDED = `plan "Guard" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
  wall partition thickness 100 { (0,3000) (5000,3000) }
  room id=living at (0,0)    size 5000x3000 label "Living" uses living
  room id=bed    at (0,3000) size 2000x2000 label "Bedroom" uses bedroom
  door id=entry at (2500,0)    width 900 wall exterior hinge left swing in
  door id=mid   at (1000,3000) width 900 wall partition hinge left swing in
  furniture wardrobe at (3800,200) size 1000x800 label "Wardrobe" in bed
}`;

describe("repair — circulation guard", () => {
  it("declines a move that would pinch a room's walk, and reports it", () => {
    // Precondition: the bedroom walk is clear before repair, and the naive fix exists.
    expect(bottleneck(GUARDED, "bed")).toBeGreaterThanOrEqual(700);
    expect(lint(GUARDED).map((d) => d.code)).toContain("W_FIXTURE_WRONG_ROOM");

    const r = repair(GUARDED);
    expect(r.changed).toBe(false); // the pinching move was rejected — nothing applied
    expect(r.changes).toEqual([]);
    const note = r.unresolved.find((u) => u.id === "wardrobe#1");
    expect(note).toBeDefined();
    expect(note!.reason).toMatch(/pinch the walk to "Bedroom" below 700 mm/);

    // The guard preserved circulation: the (unchanged) source still walks clear.
    expect(bottleneck(r.source, "bed")).toBeGreaterThanOrEqual(700);
  });

  it("still applies a harmless fix exactly as before (no false rejection)", () => {
    // A sofa drawn through a partition — the wall push moves it clear and does not pinch
    // any walk, so it applies and clears the warning (no circulation note).
    const src = `plan "P" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (4000,0) (4000,6000) (0,6000) close }
  wall partition thickness 100 { (0,3000) (4000,3000) }
  room id=living at (0,0)    size 4000x3000 label "Living" uses living
  room id=bed    at (0,3000) size 4000x3000 label "Bedroom" uses bedroom
  door id=entry at (2000,0)    width 900 wall exterior hinge left swing in
  door id=mid   at (2000,3000) width 900 wall partition hinge left swing in
  furniture sofa at (350,2300) size 2000x900 label "Sofa"
}`;
    expect(lint(src).map((d) => d.code)).toContain("W_FURNITURE_WALL_COLLISION");
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0]!.reason).toContain("wall");
    expect(lint(r.source).map((d) => d.code)).not.toContain("W_FURNITURE_WALL_COLLISION");
    expect(r.unresolved.some((u) => /pinch/.test(u.reason))).toBe(false);
  });

  it("is deterministic (two runs identical)", () => {
    expect(repair(GUARDED)).toEqual(repair(GUARDED));
  });

  it("converges on the guarded plan (a rejected move terminates that piece)", () => {
    // A rejected move marks the piece stuck like an ambiguous fix, so the fixpoint
    // still terminates and the result is stable across a re-run of the corrected source.
    const r = repair(GUARDED);
    expect(r.unresolved).toHaveLength(1);
    const again = repair(r.source);
    expect(again.source).toBe(r.source); // fixpoint reached; re-repair is a no-op move-wise
  });
});
