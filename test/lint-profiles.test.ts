import { describe, expect, it } from "vitest";
import { lint, LINT_PROFILES, LINT_PROFILE_NAMES } from "../src/index.js";

/**
 * Advisory lint profiles — named partial ruleset overrides. Honestly named
 * (`residential-basic`, `accessibility-advisory`, never `ada`/`iso`): a profile is
 * an advisory check, not a compliance guarantee.
 */

const codes = (src: string, profile?: string): string[] =>
  lint(src, profile ? { profile } : {}).map((d) => d.code ?? "");

const plan = (room: string, door: string) =>
  `plan "P" {
    units mm
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    ${room}
    ${door}
  }`;

const door800 = "door id=d at (2000,4000) width 800 wall exterior hinge left swing in";

describe("lint profiles", () => {
  it("exposes the honestly-named built-in profiles", () => {
    expect(LINT_PROFILE_NAMES).toContain("residential-basic");
    expect(LINT_PROFILE_NAMES).toContain("accessibility-advisory");
    expect(LINT_PROFILE_NAMES).not.toContain("ada");
  });

  it("residential-basic accepts an 800 mm door; accessibility-advisory flags it", () => {
    const src = plan(`room id=r at (0,0) size 4000x4000 label "Room"`, door800);
    expect(codes(src, "residential-basic")).not.toContain("W_DOOR_CLEARANCE");
    expect(codes(src, "accessibility-advisory")).toContain("W_DOOR_CLEARANCE");
  });

  it("accessibility-advisory raises the minimum room area (4 → 5 m²)", () => {
    // 2000 × 2250 = 4.5 m² — fine under the default, too small under accessibility.
    const src = plan(`room id=r at (0,0) size 2000x2250 label "Room"`, door800);
    expect(codes(src, "residential-basic")).not.toContain("W_ROOM_TOO_SMALL");
    expect(codes(src, "accessibility-advisory")).toContain("W_ROOM_TOO_SMALL");
  });

  it("residential-basic is identical to the shipped default (empty override)", () => {
    expect(LINT_PROFILES["residential-basic"]).toEqual({});
  });

  it("an explicit ruleset still wins over the profile", () => {
    const src = plan(`room id=r at (0,0) size 4000x4000 label "Room"`, door800);
    // accessibility-advisory would flag the 800 door, but an explicit minDoorWidthMm wins.
    const out = lint(src, { profile: "accessibility-advisory", ruleset: { minDoorWidthMm: 700 } });
    expect(out.map((d) => d.code)).not.toContain("W_DOOR_CLEARANCE");
  });
});
