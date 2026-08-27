import { readdirSync, readFileSync } from "node:fs";
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

/**
 * `W_NO_ENTRANCE` used to stand down unless some wall was categorised `exterior`, so a
 * shell drawn entirely out of `partition` walls — or a plan with rooms and no walls at
 * all — was never asked whether you could get in, while `describe().access.hasEntrance`
 * said plainly that you could not. The rule now asks the SAME geometric question
 * `describe()` asks (`buildDoorAccessGraph(...).hasEntrance`), so the two agree.
 */
describe("lint — W_NO_ENTRANCE asks the geometric question, not the wall's category", () => {
  const SEALED = `plan "Sealed" {
    units mm
    wall partition thickness 100 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Studio"
  }`;

  it("fires on a closed shell built entirely from `partition` walls", () => {
    // Non-vacuity: the shell really is closed and really has no wall categorised
    // `exterior` — which is exactly the condition the old guard stood down on.
    expect(SEALED).not.toContain("exterior");
    expect(codes(SEALED)).toContain("W_NO_ENTRANCE");
  });

  it("fires on rooms with no walls at all", () => {
    expect(codes(`plan "Open" { units mm  room id=r at (0,0) size 4000x3000 label "Studio" }`)).toContain(
      "W_NO_ENTRANCE",
    );
  });

  it("stays silent on a plan with a real way in", () => {
    expect(codes(SOUND)).not.toContain("W_NO_ENTRANCE");
  });

  it("stays silent when there are no rooms at all (a component library)", () => {
    const lib = `plan "Lib" {
      units mm
      wall partition thickness 100 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    }`;
    expect(codes(lib)).not.toContain("W_NO_ENTRANCE");
  });
});

describe("lint — shipped examples", () => {
  it("the canonical studio is architecturally sound (no warnings)", () => {
    expect(lint(example("studio.arch"))).toEqual([]);
  });

  /**
   * The corpus-wide pin for the widened `W_NO_ENTRANCE` guard. One example warns on
   * purpose (it is a fragment that draws no way in) and every other shipped plan must
   * not — a rule that starts shouting at the shipped corpus is a rule that will be
   * silenced, so this names the exact set rather than counting it.
   *
   * `two-bed` used to be on this list — it shipped `ok:false` with six warnings,
   * including this one, until the 2026-08 gallery refresh repaired its topology and gave
   * it a real front door. It is off the list on purpose, not because the rule loosened.
   */
  it("only `themed` reports W_NO_ENTRANCE across the whole corpus", () => {
    const dir = join(__dirname, "..", "examples");
    const world = {
      read: (p: string): string | null => {
        try {
          return readFileSync(join(dir, p), "utf8");
        } catch {
          return null;
        }
      },
    };
    const warned = readdirSync(dir)
      .filter((f) => f.endsWith(".arch"))
      .sort()
      .filter((f) => lint(readFileSync(join(dir, f), "utf8"), { world }).some((d) => d.code === "W_NO_ENTRANCE"));
    expect(warned).toEqual(["themed.arch"]);
  });
});
