import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lint } from "../src/index.js";

/**
 * Circulation lint (ADR 0008): W_PATH_TOO_NARROW (a walk squeezes below a passable
 * width) and W_CIRCUITOUS_PATH (a room reached by a roundabout route). Advisory,
 * calibrated so the flagship studio.arch stays clean at the default profile.
 */

const STUDIO = readFileSync(new URL("../examples/studio.arch", import.meta.url), "utf8");
const codes = (src: string, opts?: Parameters<typeof lint>[1]) => lint(src, opts).map((d) => d.code);

describe("circulation lint", () => {
  it("keeps the flagship studio.arch clean of circulation warnings at the default profile", () => {
    const c = codes(STUDIO);
    expect(c).not.toContain("W_PATH_TOO_NARROW");
    expect(c).not.toContain("W_CIRCUITOUS_PATH");
  });

  it("trips W_PATH_TOO_NARROW on a connector narrower than the minimum", () => {
    // The graded half of the rule: a modelled clear width below the threshold. A door's
    // own width is stamped on its threshold cells, so this is where a fractional reading
    // comes from — and, at the default 300 mm body radius, the only place it can. Any
    // FURNITURE pinch that a body still fits through is by construction at least
    // 2 x 300 mm wide, which is why the case below reports a seal instead of a number.
    const src = `plan "Narrow Door" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "Living" uses living
  room id=b at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door id=entry at (0,2000)  width 1000 wall exterior hinge left swing in
  door id=thru  at (4000,2000) width 600 wall partition hinge left swing in
  furniture kitchen_sink at (4300,300) size 800x600 label "sink"
}`;
    const warns = lint(src).filter((d) => d.code === "W_PATH_TOO_NARROW");
    expect(warns.length).toBeGreaterThanOrEqual(1);
    // Measured value, then the measured shortfall against the threshold.
    expect(warns[0]!.message).toMatch(/squeezes to \d+ mm \(\d+ mm below the 700 mm minimum\)/);
  });

  it("trips W_PATH_TOO_NARROW as a SEAL when furniture closes the only way through", () => {
    // The limit case, and the one `docs/backlog.md` 5.8 is about: two cabinets leaving a
    // 500 mm gap no body fits through. The room drops out of `circulation.rooms[]`, which
    // is exactly how this used to go silent — a plan got CLEANER as the obstacle grew.
    const src = `plan "Sealed" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=a at (0,0)    size 4000x4000 label "Living" uses living
  room id=b at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door id=entry at (0,2000)  width 2000 wall exterior hinge left swing in
  opening id=gap at (4000,2000) width 2000 wall partition
  furniture cabinet at (3600,300)  size 700x1200 label "c1"
  furniture cabinet at (3600,2000) size 700x1200 label "c2"
}`;
    const warns = lint(src).filter((d) => d.code === "W_PATH_TOO_NARROW");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.message).toMatch(/to "Kitchen" is blocked: .+\(0 mm against the 700 mm minimum\)/);
  });

  it("flags studio under the accessibility profile (wheelchair passage) that default does not", () => {
    expect(codes(STUDIO)).not.toContain("W_PATH_TOO_NARROW");
    expect(codes(STUDIO, { profile: "accessibility-advisory" })).toContain("W_PATH_TOO_NARROW");
  });

  it("honours a ruleset override for minPathClearWidthMm", () => {
    // studio's tightest room walk is ~700 mm — clean at the 700 default, flagged at 900.
    expect(codes(STUDIO, { ruleset: { minPathClearWidthMm: 900 } })).toContain("W_PATH_TOO_NARROW");
  });

  it("trips W_CIRCUITOUS_PATH only below the detour ratio (studio's bath is ~2.7×)", () => {
    expect(codes(STUDIO)).not.toContain("W_CIRCUITOUS_PATH");
    expect(codes(STUDIO, { ruleset: { maxDetourRatio: 2.0 } })).toContain("W_CIRCUITOUS_PATH");
  });

  it("emits no circulation warnings when the plan has no entrance", () => {
    const c = codes(`plan "Sealed" {
  units mm
  grid 100
  wall partition thickness 100 { (3000,0) (3000,3000) }
  room id=a at (0,0)    size 3000x3000 label "A"
  room id=b at (3000,0) size 3000x3000 label "B"
  door id=mid at (3000,1500) width 800 wall partition hinge left swing in
}`);
    expect(c).not.toContain("W_PATH_TOO_NARROW");
    expect(c).not.toContain("W_CIRCUITOUS_PATH");
  });
});
