/** W_OPENING_AT_JUNCTION; W_OPENING_OVERLAP. */

import { describe, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";
import { DEFAULT_RULESET } from "../src/lint.js";
import type { LintRuleset } from "../src/lint.js";

/**
 * `W_OPENING_AT_JUNCTION`, `W_OPENING_OVERLAP` and `W_CONNECTOR_AMBIGUOUS` (plan-soundness
 * PS2.1–PS2.3): each fires on the defect, stays silent on the fix, flips exactly at its
 * threshold, and words its message the way a person would (rooms by label, walls by kind and
 * line, no ids). The defect corpus (`test/defect-corpus/openings-ignore-walls/`) is the wider
 * acceptance set; these are the boundaries it does not pin.
 */

const errorsOf = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const of = (src: string, code: string, ruleset?: Partial<LintRuleset>) =>
  lint(src, ruleset ? { ruleset } : {}).filter((d) => d.code === code);

/** A 200 mm shell with a 100 mm partition teeing into its north run at x 4000. */
const tee = (opening: string) => `plan "Tee" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (4000,0) (4000,5000) }
  room id=a at (0,0) size 4000x5000 label "West room"
  room id=b at (4000,0) size 4000x5000 label "East room"
  door id=d_side on shell at 19000 width 900
  door id=d_mid on p at 3500 width 800
  ${opening}
}
`;

describe("W_OPENING_AT_JUNCTION", () => {
  it("fires on a window the partition stands inside, naming the wall by kind and line", () => {
    const src = tee("window id=win at (4500,0) width 2000 wall shell");
    expect(errorsOf(src)).toEqual([]);
    const [d, more] = of(src, "W_OPENING_AT_JUNCTION");
    expect(more).toBeUndefined();
    expect(d!.message).toContain('The window of "East room" meets a wall junction');
    expect(d!.message).toContain("the partition wall at x 4000 stands inside its span (x 3500–5500");
    expect(d!.message).not.toMatch(/"(win|p|shell|a|b)"/);
    expect(d!.hints!.join(" ")).toContain('"win"');
  });

  it("is silent on a window clear of the tee", () => {
    expect(of(tee("window id=win at (6000,0) width 2000 wall shell"), "W_OPENING_AT_JUNCTION")).toEqual([]);
  });

  // The partition's east face is at x 4050; a 900 mm door centred at x 4600 has its jamb at
  // 4150 (a 100 mm nib, the requirement on a 200 mm wall: max(100, 200 × 0.5)).
  it("flips exactly at the nib: 100 mm is enough, 99 mm is not", () => {
    expect(of(tee("door id=d at (4600,0) width 900 wall shell"), "W_OPENING_AT_JUNCTION")).toEqual([]);
    const [d] = of(tee("door id=d at (4599,0) width 900 wall shell"), "W_OPENING_AT_JUNCTION");
    expect(d!.message).toContain("is 99 mm from the face of the partition wall at x 4000 (at x 4050)");
    expect(d!.message).toContain("at least 100 mm of wall beside it");
  });

  it("reads its threshold from the ruleset (both limbs)", () => {
    const src = tee("door id=d at (4650,0) width 900 wall shell"); // a 150 mm nib
    expect(of(src, "W_OPENING_AT_JUNCTION")).toEqual([]);
    expect(of(src, "W_OPENING_AT_JUNCTION", { junctionNibThicknessRatio: 1 })).toHaveLength(1); // 200 needed
    expect(of(src, "W_OPENING_AT_JUNCTION", { minJunctionNibMm: 151 })).toHaveLength(1);
    expect(DEFAULT_RULESET.minJunctionNibMm).toBe(100);
    expect(DEFAULT_RULESET.junctionNibThicknessRatio).toBe(0.5);
  });

  it("quotes only a move it checked, in the clause the author wrote", () => {
    const [d] = of(tee("window id=win on shell at 4500 width 2000"), "W_OPENING_AT_JUNCTION");
    const moves = d!.hints!.filter((h) => h.startsWith("Move"));
    // West would carry the window into the other room, so only east is quoted.
    expect(moves).toHaveLength(1);
    expect(moves[0]).toContain("towards (8000, 0), to x 4150–6150, 100 mm from the nearest meeting wall's face");
    expect(moves[0]).toContain("`on shell at 5150`");
    const fixed = tee("window id=win on shell at 5150 width 2000");
    expect(of(fixed, "W_OPENING_AT_JUNCTION")).toEqual([]);
  });

  // An L-corner: a door there is W_DOOR_NEAR_CORNER's (one defect, one warning); a window is this rule's.
  const corner = (opening: string) => `plan "Corner" {
  units mm
  wall id=shell exterior thickness 300 { (0,0) (3400,0) (3400,8000) (0,8000) close }
  room id=a at (0,0) size 3400x8000 label "Front room"
  door id=d_back on shell at 1700 width 900
  ${opening}
}
`;
  it("leaves a door at an L-corner to W_DOOR_NEAR_CORNER and measures a window there", () => {
    const door = corner("door id=d at (2850,8000) width 900 wall shell");
    expect(lint(door).map((d) => d.code)).toContain("W_DOOR_NEAR_CORNER");
    expect(of(door, "W_OPENING_AT_JUNCTION")).toEqual([]);
    const win = corner("window id=w at (2850,8000) width 900 wall shell");
    const [d] = of(win, "W_OPENING_AT_JUNCTION");
    expect(d!.message).toContain("the exterior wall at x 3400 stands inside its span (x 2400–3300");
  });

  // A 100 mm partition turning an L at (2000,2500); the face of its other leg is at x 2050.
  // W_DOOR_NEAR_CORNER asks one thickness to the corner POINT (100 mm, so 50 mm at the face);
  // this rule asks 100 mm at the face. A door that rule passes is measured here.
  const thinL = (kind: string, nib: number) => `plan "Thin L" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=p partition thickness 100 { (2000,5000) (2000,2500) (8000,2500) }
  room id=a at (0,0) size 8000x2500 label "South"
  room id=b at (2000,2500) size 6000x2500 label "North"
  door id=d_f on shell at 3000 width 900
  ${kind} id=x at (${2050 + nib + 450},2500) width 900 wall p
}
`;
  it("measures a door at a thin L-corner that W_DOOR_NEAR_CORNER passes, never both", () => {
    const codes = (src: string) =>
      lint(src)
        .map((d) => d.code)
        .filter((c) => c === "W_OPENING_AT_JUNCTION" || c === "W_DOOR_NEAR_CORNER");
    for (const nib of [0, 49]) expect(codes(thinL("door", nib)), `door ${nib}`).toEqual(["W_DOOR_NEAR_CORNER"]);
    for (const nib of [50, 60, 99]) expect(codes(thinL("door", nib)), `door ${nib}`).toEqual(["W_OPENING_AT_JUNCTION"]);
    expect(codes(thinL("door", 100))).toEqual([]);
    for (const nib of [0, 49, 50, 99])
      expect(codes(thinL("window", nib)), `window ${nib}`).toEqual(["W_OPENING_AT_JUNCTION"]);
    expect(codes(thinL("window", 100))).toEqual([]);
    const [d] = of(thinL("door", 60), "W_OPENING_AT_JUNCTION");
    expect(d!.message).toContain(
      "its jamb at x 2110 is 60 mm from the face of the partition wall at x 2000 (at x 2050)",
    );
    const move = d!.hints!.find((h) => h.startsWith("Move"));
    expect(move).toContain("to x 2150–3050, 100 mm from the nearest meeting wall's face");
    expect(move).toContain("`at (2600, 2500)`");
    const fixed = thinL("door", 100);
    expect(of(fixed, "W_OPENING_AT_JUNCTION")).toEqual([]);
    expect(lint(fixed).map((x) => x.code)).not.toContain("W_DOOR_NEAR_CORNER");
  });

  // The two leaves of a double door, the west one 50 mm from the tee's face: a move takes both.
  it("moves a double door as one opening and quotes a clause for each leaf", () => {
    const src = tee(
      "door id=d1 at (4500,0) width 800 wall shell hinge left swing in\n  door id=d2 at (5300,0) width 800 wall shell hinge right swing in",
    );
    expect(errorsOf(src)).toEqual([]);
    expect(of(src, "W_OPENING_OVERLAP")).toEqual([]);
    const [d, more] = of(src, "W_OPENING_AT_JUNCTION");
    expect(more).toBeUndefined();
    const moves = d!.hints!.filter((h) => h.startsWith("Move"));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toBe(
      'Move the door with its other leaf (one double door) 50 mm along the wall towards (8000, 0), to x 4150–5750, 100 mm from the nearest meeting wall\'s face; that position was checked clear of every junction and opening on the run, and the pair still opens between the outside and "East room" — `at (4550, 0)` for "d1" and `at (5350, 0)` for "d2".',
    );
    const after = src.replace("at (4500,0)", "at (4550, 0)").replace("at (5300,0)", "at (5350, 0)");
    expect(errorsOf(after)).toEqual([]);
    const codes = lint(after).map((x) => x.code);
    for (const c of ["W_OPENING_AT_JUNCTION", "W_OPENING_OVERLAP", "W_CONNECTOR_AMBIGUOUS"])
      expect(codes).not.toContain(c);
    // Moving one leaf alone splits the pair into two singles with a 50 mm pier.
    const split = src.replace("at (4500,0)", "at (4550, 0)");
    expect(of(split, "W_OPENING_OVERLAP")).toHaveLength(1);
  });

  it("measures a door against a tee even beside a corner", () => {
    const src = tee("door id=d at (4300,0) width 400 wall shell");
    expect(of(src, "W_OPENING_AT_JUNCTION")).toHaveLength(1);
  });

  // A cased opening flush on a meeting wall's face has no sliver: that face is its jamb.
  const hall = (kind: string) => `plan "Hall end" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=spine partition thickness 100 { (0,3000) (6000,3000) }
  wall id=hw partition thickness 100 { (2000,0) (2000,3000) }
  wall id=he partition thickness 100 { (3000,0) (3000,3000) }
  room id=l at (0,0) size 2000x3000 label "Study"
  room id=h at (2000,0) size 1000x3000 label "Hall"
  room id=r at (3000,0) size 3000x3000 label "Store"
  room id=s at (0,3000) size 6000x3000 label "Living"
  door id=d_front on shell at 4500 width 800
  ${kind} id=o on spine at 2500 width 900
}
`;
  it("excuses a cased opening flush on both meeting faces, but not a door", () => {
    expect(of(hall("opening"), "W_OPENING_AT_JUNCTION")).toEqual([]);
    const [d] = of(hall("door"), "W_OPENING_AT_JUNCTION");
    expect(d!.message).toContain("is 0 mm from the face of the partition wall at x 2000 (at x 2050)");
  });

  // A curved host is measured at its two ends only, along the arc at the centreline radius.
  const bay = (at: number) => `plan "Bay" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) arc (6000,6000) radius 5000 cw (0,6000) close }
  room id=a at (0,0) size 6000x6000 label "Room"
  door id=d on shell at 22000 width 900
  window id=w on shell at ${at} width 600
}
`;
  it("measures a window near the end of a curved run, and not one mid-curve", () => {
    expect(errorsOf(bay(6400))).toEqual([]);
    const near = of(bay(6400), "W_OPENING_AT_JUNCTION");
    expect(near).toHaveLength(1);
    expect(near[0]!.message).toContain("The window on the exterior wall (curved) meets a wall junction");
    expect(of(bay(9500), "W_OPENING_AT_JUNCTION")).toEqual([]);
  });
});

/** A 200 mm shell, one room, a door and a window on the north run. */
const run = (door: string, win: string) => `plan "Run" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  room id=a at (0,0) size 8000x5000 label "Studio"
  ${door}
  ${win}
}
`;

describe("W_OPENING_OVERLAP", () => {
  it("fires on overlapping spans, on the LATER opening, naming both by their room", () => {
    const src = run("door id=d on shell at 4600 width 900", "window id=w on shell at 3800 width 1200");
    const [d, more] = of(src, "W_OPENING_OVERLAP");
    expect(more).toBeUndefined();
    expect(src.slice(d!.span!.start, d!.span!.end)).toContain("window id=w");
    expect(d!.message).toBe(
      'The window of "Studio" overlaps the exterior door into "Studio" on the exterior wall at y 0 — this window spans x 3200–4400 and the door x 4150–5050, so 250 mm of wall is claimed by both. Two openings cannot share a length of wall: one cuts through the other\'s frame.',
    );
    expect(d!.hints!.at(-1)).toBe('This window is "w"; the door is "d"; both are on wall "shell".');
  });

  // Door x 4150–5050; a 1200 mm window ending at x 4050 leaves a 100 mm pier, at 4051 a 99 mm one.
  it("flips exactly at the mullion: 100 mm is enough, 99 mm is not", () => {
    expect(
      of(run("door id=d on shell at 4600 width 900", "window id=w on shell at 3450 width 1200"), "W_OPENING_OVERLAP"),
    ).toEqual([]);
    const [d] = of(
      run("door id=d on shell at 4600 width 900", "window id=w on shell at 3451 width 1200"),
      "W_OPENING_OVERLAP",
    );
    expect(d!.message).toContain("leaving a 99 mm pier between them, under the 100 mm of a mullion");
    expect(d!.hints!.some((h) => h.startsWith("Accept it if the two are one framed unit"))).toBe(true);
    expect(
      of(run("door id=d on shell at 4600 width 900", "window id=w on shell at 3450 width 1200"), "W_OPENING_OVERLAP", {
        minMullionMm: 101,
      }),
    ).toHaveLength(1);
  });

  it("does not report the two leaves of one double door", () => {
    const src = run(
      "door id=d1 at (3500,0) width 1000 wall shell hinge left swing in",
      "door id=d2 at (4500,0) width 1000 wall shell hinge right swing in",
    );
    expect(errorsOf(src)).toEqual([]);
    expect(of(src, "W_OPENING_OVERLAP")).toEqual([]);
    // The same two leaves hinged on the shared jamb are two doors, and their 0 mm pier is reported.
    const notPair = run(
      "door id=d1 at (3500,0) width 1000 wall shell hinge right swing in",
      "door id=d2 at (4500,0) width 1000 wall shell hinge left swing in",
    );
    expect(of(notPair, "W_OPENING_OVERLAP")).toHaveLength(1);
  });

  it("compares openings on collinear segments of one wall", () => {
    const src = `plan "Collinear" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (8000,0) (8000,5000) (0,5000) close }
  room id=a at (0,0) size 8000x5000 label "Studio"
  door id=d at (3700,0) width 900 wall shell
  window id=w at (4500,0) width 1200 wall shell
}
`;
    expect(errorsOf(src)).toEqual([]);
    const [d] = of(src, "W_OPENING_OVERLAP");
    expect(d!.message).toContain("so 250 mm of wall is claimed by both");
  });
});

describe("W_CONNECTOR_AMBIGUOUS", () => {
  it("names the rooms on each side of a door straddling a tee, by label", () => {
    const src = tee("").replace(
      "door id=d_side on shell at 19000 width 900",
      "door id=d_front on shell at 4000 width 900",
    );
    const [d, more] = of(src, "W_CONNECTOR_AMBIGUOUS");
    expect(more).toBeUndefined();
    expect(d!.message).toContain(
      'its outer side is outside, and its inner side spans "West room" (400 mm) and "East room" (400 mm)',
    );
    expect(d!.message).not.toMatch(/"(d_front|shell|a|b)"/);
    expect(d!.hints!.at(-1)).toBe('The door is "d_front" on wall "shell"; its span covers rooms "a", "b".');
    // Both directions put each side in one room, so both are quoted.
    expect(d!.hints!.filter((h) => h.startsWith("Move"))).toHaveLength(2);
  });

  it("is silent on a door with each side in one room", () => {
    expect(of(tee(""), "W_CONNECTOR_AMBIGUOUS")).toEqual([]);
  });

  // A 900 mm front door whose east jamb is `inside` mm past the partition's centreline. The
  // east room's cover runs from the centreline to 50 mm short of the jamb (the probe inset),
  // and the partition's east half (50 mm) is taken out: net = inside - 100, against 100 mm.
  const straddle = (inside: number) =>
    tee("").replace(
      "door id=d_side on shell at 19000 width 900",
      `door id=d_front at (${4000 + inside - 450},0) width 900 wall shell`,
    );
  it("needs a jamb's nib of the second room, net of the meeting wall, and leaves less to the junction", () => {
    for (const inside of [51, 100, 150, 199]) {
      expect(of(straddle(inside), "W_CONNECTOR_AMBIGUOUS"), `${inside}`).toEqual([]);
      expect(of(straddle(inside), "W_OPENING_AT_JUNCTION"), `${inside}`).toHaveLength(1);
    }
    const [d] = of(straddle(200), "W_CONNECTOR_AMBIGUOUS");
    expect(d!.message).toContain('its inner side spans "West room" (650 mm) and "East room" (150 mm)');
    expect(of(straddle(200), "W_OPENING_AT_JUNCTION")).toHaveLength(1);
    // The setting: 250 inside leaves 150 mm net.
    expect(of(straddle(250), "W_CONNECTOR_AMBIGUOUS", { minStraddleCoverMm: 150 })).toHaveLength(1);
    expect(of(straddle(250), "W_CONNECTOR_AMBIGUOUS", { minStraddleCoverMm: 151 })).toEqual([]);
    expect(DEFAULT_RULESET.minStraddleCoverMm).toBe(100);
  });

  it("says what each quoted move was measured to open into", () => {
    const src = tee("").replace(
      "door id=d_side on shell at 19000 width 900",
      "door id=d_front on shell at 4000 width 900",
    );
    const [d] = of(src, "W_CONNECTOR_AMBIGUOUS");
    const moves = d!.hints!.filter((h) => h.startsWith("Move"));
    expect(moves.find((h) => h.includes("towards (0, 0)"))).toContain(
      'and it then opens between the outside and "West room"',
    );
    expect(moves.find((h) => h.includes("towards (8000, 0)"))).toContain(
      'and it then opens between the outside and "East room"',
    );
    for (const h of moves) expect(h).not.toContain("same rooms");
  });

  // Three rooms at the door's point and its north face centred on the a|b boundary (no wall
  // between them): the probe cannot decide, the edge is `ambiguous` and joins nothing.
  it("reports an ambiguous edge as joining nothing, and names the boundary", () => {
    const src = `plan "Three rooms" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall id=p partition thickness 100 { (0,3000) (8000,3000) }
  room id=a at (0,0) size 4000x3000 label "Kitchen"
  room id=b at (4000,0) size 4000x3000 label "Dining"
  room id=c at (0,3000) size 8000x3000 label "Hall"
  door id=d_front on shell at 4000 width 900
  door id=d_x on p at 4000 width 900
}
`;
    expect(errorsOf(src)).toEqual([]);
    const hit = of(src, "W_CONNECTOR_AMBIGUOUS").find((d) => d.hints!.at(-1)!.includes('"d_x"'));
    expect(hit).toBeDefined();
    expect(hit!.message).toMatch(
      /spans "Kitchen" \(\d+ mm\) and "Dining" \(\d+ mm\)|centred on the boundary between "Kitchen" and "Dining"/,
    );
    expect(hit!.message).toContain("the access graph leaves it out of every route");
  });
});
