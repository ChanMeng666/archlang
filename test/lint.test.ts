import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/**
 * Architectural lint — habitability rules as `W_*` diagnostics.
 *
 * Each rule must fire on exactly the plan that violates it (and carry a span where
 * an element is at fault), stay silent on a sound plan, and never run when the plan
 * has fatal errors (nothing sound to check).
 */

const codes = (src: string, opts?: Parameters<typeof lint>[1]) => lint(src, opts).map((d) => d.code);

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
    expect(
      codes(`plan "P" {
      units mm
      room id=r at (0,0) size 4000x3000 label "Living"
    }`),
    ).toContain("W_ROOM_DISCONNECTED");
  });

  it("W_BEDROOM_NO_WINDOW for a windowless bedroom", () => {
    expect(
      codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (3000,0) (3000,4000) (0,4000) close }
      room id=b at (0,0) size 3000x4000 label "Bedroom"
      door at (1000,4000) width 900 wall exterior
    }`),
    ).toContain("W_BEDROOM_NO_WINDOW");
  });

  it("W_DOOR_CLEARANCE for a sub-700mm door", () => {
    expect(
      codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "R"
      window at (2000,0) width 1200 wall exterior
      door at (1000,3000) width 500 wall exterior
    }`),
    ).toContain("W_DOOR_CLEARANCE");
  });

  it("W_NO_ENTRANCE when an enclosed plan has no exterior door", () => {
    expect(
      codes(`plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "R"
      window at (2000,0) width 1200 wall exterior
    }`),
    ).toContain("W_NO_ENTRANCE");
  });
});

describe("lint — architectural-soundness rules (v1.1)", () => {
  it("W_BATH_VIA_BEDROOM when the bath is reachable only through a bedroom", () => {
    const viaBedroom = `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
      wall partition thickness 100 { (3000,0) (3000,3000) }
      room id=bed  at (0,0)    size 3000x3000 label "Bedroom"
      room id=bath at (3000,0) size 3000x3000 label "Bath"
      door id=d_in   at (1000,0)    width 900 wall exterior  hinge left swing in
      door id=d_bath at (3000,1500) width 900 wall partition hinge left swing in
      furniture wc at (5000,1000) size 400x700 label "WC"
      window at (1000,3000) width 1200 wall exterior
    }`;
    expect(codes(viaBedroom)).toContain("W_BATH_VIA_BEDROOM");

    // A second door straight from the entrance to the bath clears it.
    const offHall = viaBedroom.replace(
      `door id=d_in   at (1000,0)    width 900 wall exterior  hinge left swing in`,
      `door id=d_in   at (1000,0)    width 900 wall exterior  hinge left swing in
      door id=d_bx   at (5000,0)    width 900 wall exterior  hinge left swing in`,
    );
    expect(codes(offHall)).not.toContain("W_BATH_VIA_BEDROOM");
  });

  it("W_ROOM_NOT_ENCLOSED when a partition stops short of a wet room's edge", () => {
    const open = `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
      wall partition thickness 100 { (3000,0) (3000,1500) }
      room id=living at (0,0)    size 3000x3000 label "Living"
      room id=bath   at (3000,0) size 3000x3000 label "Bath"
      door at (1000,3000) width 900 wall exterior
      furniture wc at (5000,1000) size 400x700 label "WC"
    }`;
    expect(codes(open)).toContain("W_ROOM_NOT_ENCLOSED");

    const enclosed = open.replace("(3000,0) (3000,1500)", "(3000,0) (3000,3000)");
    expect(codes(enclosed)).not.toContain("W_ROOM_NOT_ENCLOSED");

    // The rule is tunable: a generous threshold tolerates the gap.
    expect(codes(open, { ruleset: { maxUnenclosedMm: 5000 } })).not.toContain("W_ROOM_NOT_ENCLOSED");
  });

  it("W_SWING_OBSTRUCTED when a door leaf sweeps onto furniture", () => {
    const blocked = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
      room id=r at (0,0) size 4000x3000 label "Room"
      door at (1000,3000) width 1000 wall exterior hinge left swing in
      furniture box at (200,1800) size 1500x900 label "X"
    }`;
    expect(codes(blocked)).toContain("W_SWING_OBSTRUCTED");

    const clear = blocked.replace("at (200,1800)", "at (2600,200)");
    expect(codes(clear)).not.toContain("W_SWING_OBSTRUCTED");
  });

  it("W_ROOM_NO_FIXTURE for an empty bath, silenced by a fixture inside it", () => {
    const empty = `plan "P" {
      units mm
      room id=bath at (0,0) size 2000x2000 label "Bath"
      door at (0,1000) width 900
    }`;
    expect(codes(empty)).toContain("W_ROOM_NO_FIXTURE");

    const fitted = `plan "P" {
      units mm
      room id=bath at (0,0) size 2000x2000 label "Bath"
      door at (0,1000) width 900
      furniture wc at (1400,200) size 400x700 label "WC"
    }`;
    expect(codes(fitted)).not.toContain("W_ROOM_NO_FIXTURE");
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

describe("lint — shipped examples", () => {
  it("the canonical studio is architecturally sound (no warnings)", () => {
    expect(lint(example("studio.arch"))).toEqual([]);
  });
});
