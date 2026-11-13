/** a door onto water is no way in or out; a deck or paving drawn over the water keeps it one (backlog 4.5). */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";
import { groundWalkable } from "../src/elements/outdoor.js";
import { OUTDOOR_KINDS } from "../src/ast.js";

/**
 * Backlog 4.5 (RM1.3b): an `outdoor` surface obstructs nothing, but the kind decides whether the
 * ground can be walked on (`groundWalkable`: every kind but `water`), and so whether a door to the
 * outside leads anywhere. A door whose outside lies on water with no walkable surface drawn over
 * it (a `deck` bridge, paving stepping stones) is no entrance and joins nothing. The garden itself
 * is not walked (the nav grid models the inside of the building only); no corpus door opens onto
 * water, so no shipped plan moves.
 */

/** A hall with an optional front door, a garden room whose only door opens south onto a pond. */
const pond = (o: { front: boolean; over?: string }): string => `plan "Pond" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=hw partition thickness 100 { (4000,0) (4000,5000) }
  room id=hall at (0,0) size 4000x5000 label "Hall" uses hall
  room id=garden at (4000,0) size 4000x5000 label "Garden room" uses living
  ${o.front ? "door id=front on shell at 2000 width 1000 swing into hall" : ""}
  outdoor id=pond water at (3000,5000) size 6000x3000
  ${o.over ? `outdoor id=over ${o.over} at (5500,5000) size 1000x3000` : ""}
  door id=dp on shell at 15000 width 900 swing into garden
}`;

describe("ground kinds: which can be walked on (backlog 4.5)", () => {
  it("every kind but water", () => {
    expect(OUTDOOR_KINDS.filter((k) => !groundWalkable(k))).toEqual(["water"]);
  });
});

describe("a door onto water is no way in or out (backlog 4.5)", () => {
  it("is no entrance, joins nothing, and says why", () => {
    const s = describePlan(pond({ front: true }));
    expect(s.access.entrances).toEqual(["front"]);
    expect(s.access.edges.find((e) => e.doorId === "dp")).toMatchObject({
      between: ["", "garden"],
      exterior: false,
      onto: "water",
    });
    expect(s.access.rooms.find((r) => r.id === "garden")?.reachable).toBe(false);
    // The room behind it has a connector on its edge and no way back: W_ROOM_UNREACHABLE.
    expect(lint(pond({ front: true })).map((d) => d.code)).toContain("W_ROOM_UNREACHABLE");
  });

  it("the only door onto water leaves the building with no way in", () => {
    const s = describePlan(pond({ front: false }));
    expect(s.access.hasEntrance).toBe(false);
    expect(lint(pond({ front: false })).map((d) => d.code)).toContain("W_NO_ENTRANCE");
  });

  for (const over of ["deck", "paving"]) {
    it(`a ${over} drawn over the water at the door keeps it a way out (a bridge, stepping stones)`, () => {
      const s = describePlan(pond({ front: false, over }));
      expect(s.access.entrances).toEqual(["dp"]);
      const dp = s.access.edges.find((e) => e.doorId === "dp")!;
      expect(dp.between).toEqual(["exterior", "garden"]);
      expect(dp).not.toHaveProperty("onto");
      expect(lint(pond({ front: false, over })).map((d) => d.code)).not.toContain("W_NO_ENTRANCE");
    });
  }

  it("a lawn is walked on: a door onto it is a way in as before", () => {
    const src = pond({ front: false }).replace("outdoor id=pond water", "outdoor id=pond lawn");
    expect(describePlan(src).access.entrances).toEqual(["dp"]);
  });
});

/** The same house with the garden room's door opening onto `surfaces`, drawn in this order. */
const drawn = (surfaces: readonly string[]): string => `plan "Order" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room id=garden at (0,0) size 8000x5000 label "Garden room" uses living
  ${surfaces.join("\n  ")}
  door id=dp on shell at 15000 width 900 swing into garden
}`;
const LAWN = "outdoor id=garden_lawn lawn at (-5000,5000) size 18000x10000";
const POND = "outdoor id=pond water at (3000,5000) size 6000x3000";
const DECK = "outdoor id=bridge deck at (5500,5000) size 1000x3000";
const opensOnto = (surfaces: readonly string[]) =>
  describePlan(drawn(surfaces)).access.edges.find((e) => e.doorId === "dp")!.onto ?? "walkable";

describe("the topmost surface at the door decides (draw order, backlog 4.5)", () => {
  it("a pond drawn inside a lawn after it is water there (docs/language-reference.md's garden)", () => {
    expect(opensOnto([LAWN, POND])).toBe("water");
  });
  it("a lawn drawn over the pond after it is walked on", () => {
    expect(opensOnto([POND, LAWN])).toBe("walkable");
  });
  it("a deck drawn over the water after it is a bridge; drawn under it, the water covers it", () => {
    expect(opensOnto([POND, DECK])).toBe("walkable");
    expect(opensOnto([DECK, POND])).toBe("water");
    expect(opensOnto([LAWN, POND, DECK])).toBe("walkable");
  });
});

describe("W_NO_ENTRANCE when the only doors open onto water (backlog 4.5)", () => {
  it("names the door and says it opens onto water, not that there is none", () => {
    const [d] = lint(pond({ front: false })).filter((x) => x.code === "W_NO_ENTRANCE");
    expect(d!.message).toBe(
      "The plan's only door to the outside opens onto water, so there is no way into the building.",
    );
    expect(d!.hints![0]).toMatch(/^`dp` opens onto an `outdoor water` surface/);
  });
  it("a plan with no door to the outside keeps its sentence byte for byte", () => {
    const none = pond({ front: false }).replace("  door id=dp on shell at 15000 width 900 swing into garden\n", "");
    const [d] = lint(none).filter((x) => x.code === "W_NO_ENTRANCE");
    expect(d!.message).toBe("The plan has no exterior door or opening — there is no way into the building.");
    expect(d!.hints).toEqual(["Add a `door` (or a cased `opening`) on an `exterior` wall."]);
  });
});
