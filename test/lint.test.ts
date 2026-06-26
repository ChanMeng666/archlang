import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";

/**
 * Architectural lint — habitability rules as `W_*` diagnostics.
 *
 * Each rule must fire on exactly the plan that violates it (and carry a span where
 * an element is at fault), stay silent on a sound plan, and never run when the plan
 * has fatal errors (nothing sound to check).
 */

const codes = (src: string, opts?: Parameters<typeof lint>[1]) =>
  lint(src, opts).map((d) => d.code);

// A sound one-room cottage: enterable, a window, a wide door, an entrance.
const SOUND = `plan "Cottage" {
  units mm
  grid 50
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 label "Studio"
  door at (1000,3000) width 900 wall exterior hinge left swing in
  window at (2000,0) width 1200 wall exterior
}`;

describe("lint — clean plans", () => {
  it("a sound plan produces no warnings", () => {
    expect(lint(SOUND)).toEqual([]);
  });

  it("returns [] (does not run) when the plan has fatal errors", () => {
    expect(lint(`plan "Bad" { room at (0,0) size 0x3000 }`)).toEqual([]);
  });
});

describe("lint — rules fire on the right violation", () => {
  it("W_ROOM_TOO_SMALL on a tiny room, with a span", () => {
    const ds = lint(`plan "P" {
      units mm
      room id=r at (0,0) size 1000x1000 label "Closet"
      door at (0,500) width 900
    }`);
    const d = ds.find((x) => x.code === "W_ROOM_TOO_SMALL");
    expect(d).toBeTruthy();
    expect(d!.span).toBeTruthy();
  });

  it("W_ROOM_DISCONNECTED when no door touches a room", () => {
    expect(codes(`plan "P" {
      units mm
      room id=r at (0,0) size 4000x3000 label "Living"
    }`)).toContain("W_ROOM_DISCONNECTED");
  });

  it("W_BEDROOM_NO_WINDOW for a windowless bedroom", () => {
    expect(codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (3000,0) (3000,4000) (0,4000) close }
      room id=b at (0,0) size 3000x4000 label "Bedroom"
      door at (1000,4000) width 900 wall exterior
    }`)).toContain("W_BEDROOM_NO_WINDOW");
  });

  it("W_DOOR_CLEARANCE for a sub-700mm door", () => {
    expect(codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "R"
      window at (2000,0) width 1200 wall exterior
      door at (1000,3000) width 500 wall exterior
    }`)).toContain("W_DOOR_CLEARANCE");
  });

  it("W_NO_ENTRANCE when an enclosed plan has no exterior door", () => {
    expect(codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "R"
      window at (2000,0) width 1200 wall exterior
    }`)).toContain("W_NO_ENTRANCE");
  });
});

describe("lint — configurable ruleset", () => {
  it("relaxing minRoomAreaM2 silences W_ROOM_TOO_SMALL", () => {
    const src = `plan "P" {
      units mm
      room id=r at (0,0) size 1500x1500 label "Nook"
      door at (0,750) width 900
    }`;
    expect(codes(src)).toContain("W_ROOM_TOO_SMALL");
    expect(codes(src, { ruleset: { minRoomAreaM2: 2 } })).not.toContain("W_ROOM_TOO_SMALL");
  });
});
