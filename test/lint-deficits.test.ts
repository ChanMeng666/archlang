import { describe, expect, it } from "vitest";
import { applyFixes, lint } from "../src/index.js";

/**
 * Diagnostic prose for the four advisory placement rules that had the geometry in hand
 * and printed none of it: `W_SWING_OBSTRUCTED`, `W_DOORWAY_BLOCKED`,
 * `W_FURN_CLEARANCE` and `W_PATH_TOO_NARROW` (the last of which has its own suite in
 * `circulation-lint.test.ts`, so only the deficit shape is re-checked here).
 *
 * Each message must carry the **measured value, the measured shortfall, and a closed
 * remedy set** — and the one remedy that is a bounded, provable rewrite (a door's hinge
 * flip) must be carried as a real `FixSuggestion` that, applied, actually clears the
 * warning rather than relocating it.
 */

const one = (src: string, code: string) => {
  const d = lint(src).find((x) => x.code === code);
  expect(d, `expected ${code}`).toBeDefined();
  return d!;
};

/** The room the swing fixtures live in: 6 × 4 m, one door centred on the south wall. */
const swingPlan = (furn: string) => `plan "P" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room"
  door at (3000,4000) width 1000 wall exterior hinge left swing in
  ${furn}
}`;

describe("W_SWING_OBSTRUCTED states the measured deficit", () => {
  it("quotes the required radius, the distance available and the shortfall", () => {
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    // radius 1000 (the leaf) against the nearest point of the obstruction.
    expect(d.message).toMatch(/needs 1000 mm of clear radius but "X" is \d+ mm from the hinge \(\d+ mm short\)/);
  });

  it("measures a swing↔swing overlap as hinge separation against the two leaves", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=r at (0,0) size 4000x4000 label "Room"
        door id=side  at (0,3400) width 900 wall exterior hinge left swing in
        door id=front at (900,4000) width 900 wall exterior hinge left swing in
      }`,
      "W_SWING_OBSTRUCTED",
    );
    expect(d.message).toMatch(/door "front"'s swing overlaps it/);
    expect(d.message).toMatch(/hinges are \d+ mm apart where the two leaves need 1800 mm \(\d+ mm short\)/);
  });

  it("enumerates the remedies as hints, not as one vague sentence", () => {
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    expect(d.hints?.length).toBeGreaterThanOrEqual(4);
    expect(d.hints!.join("\n")).toMatch(/hinge right/);
    expect(d.hints!.join("\n")).toMatch(/swing out/);
    expect(d.hints!.join("\n")).toMatch(/arch repair/);
    expect(d.hints!.join("\n")).toMatch(/leafless `opening`/);
  });

  it("REFUSES the narrow-the-door remedy when it would breach the minimum width", () => {
    // The obstruction reaches to 300 mm of the hinge: narrowing to 300 mm would silence
    // this warning by creating W_DOOR_CLEARANCE. The hint must say so, not offer it.
    const d = one(swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`), "W_SWING_OBSTRUCTED");
    const hints = d.hints!.join("\n");
    expect(hints).toMatch(/Narrowing the door is not a fix here/);
    expect(hints).toMatch(/under the 700 mm minimum passable width/);
    expect(hints).not.toMatch(/Narrow the door to/);
  });

  it("offers the narrow-to width when it stays at or above the minimum", () => {
    // The obstruction stands ~950 mm off the hinge, so a 700–949 mm leaf still clears.
    const d = one(swingPlan(`furniture box at (2600,2600) size 600x500 label "X"`), "W_SWING_OBSTRUCTED");
    expect(d.hints!.join("\n")).toMatch(/Narrow the door to \d+ mm or less, which still clears the 700 mm minimum/);
  });
});

describe("W_SWING_OBSTRUCTED's hinge-flip fix", () => {
  /** The obstruction sits in the disc swept from the LEFT hinge only. */
  const flipClears = swingPlan(`furniture box at (3400,2900) size 600x500 label "X"`);
  /** The obstruction spans the opening: neither jamb clears it. */
  const flipDoesNot = swingPlan(`furniture box at (2000,2600) size 1500x900 label "X"`);

  it("is machine-applicable only when the flipped swing is proved clear", () => {
    const yes = one(flipClears, "W_SWING_OBSTRUCTED");
    expect(yes.fixes?.[0]?.applicability).toBe("machine-applicable");
    expect(yes.fixes?.[0]?.fixId).toBe("door-swing-obstructed");
    expect(one(flipDoesNot, "W_SWING_OBSTRUCTED").fixes).toBeUndefined();
  });

  it("applies to source that compiles and no longer trips the rule", () => {
    const fixes = lint(flipClears).flatMap((d) => d.fixes ?? []);
    const applied = applyFixes(flipClears, fixes);
    expect(applied.output).toContain("hinge right");
    const codes = lint(applied.output).map((x) => x.code);
    expect(codes).not.toContain("W_SWING_OBSTRUCTED");
    // …and it does not launder the problem into the door's own width rule.
    expect(codes).not.toContain("W_DOOR_CLEARANCE");
  });

  it("keeps the `hinge near` idiom when the author used it", () => {
    const src = flipClears.replace("hinge left", "hinge near start");
    const d = one(src, "W_SWING_OBSTRUCTED");
    expect(d.fixes?.[0]?.edits[0]?.newText).toContain("hinge near end");
  });
});

describe("W_DOORWAY_BLOCKED / W_FURN_CLEARANCE state the measured deficit", () => {
  it("quotes the landing depth required, the depth left and the shortfall", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=r at (0,0) size 4000x4000 label "R"
        door at (1000,4000) width 900 wall exterior hinge left swing in
        furniture wc at (700,3600) size 700x400
      }`,
      "W_DOORWAY_BLOCKED",
    );
    expect(d.message).toMatch(/approach needs 300 mm clear on each side but "wc" leaves \d+ mm \(\d+ mm short\)/);
    expect(d.hints?.length).toBe(3);
  });

  it("quotes the catalogued clearance, the depth left and the shortfall", () => {
    const d = one(
      `plan "P" {
        units mm
        wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
        room id=k at (0,0) size 4000x4000 label "Kitchen" uses kitchen
        furniture stove at (200,100) size 600x600
        furniture sofa at (200,800) size 1500x900
      }`,
      "W_FURN_CLEARANCE",
    );
    // The stove's front faces south; the sofa's near edge is 100 mm off it.
    expect(d.message).toBe(
      'Fixture "stove" needs 550 mm of clear space in front but "sofa" leaves 100 mm (450 mm short).',
    );
    expect(d.hints?.length).toBe(4);
  });
});
