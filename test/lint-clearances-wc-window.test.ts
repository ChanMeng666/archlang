/**
 * The clearance family of plan-soundness PS2.11a/b: `W_WC_SIDE_CLEARANCE` and
 * `W_FURNITURE_OVER_WINDOW` (`src/lint/rules/clearances.ts`, measures in
 * `src/lint/clearance-measure.ts`), and the placement check every quoted position passes.
 *
 * Each case is a small plan whose numbers are worked out in its comment; the corpus cases live in
 * `test/defect-corpus/clearances/`.
 */

import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { lint, lintWithCoverage } from "../src/index.js";
import { buildLintContext } from "../src/lint/context.js";
import { placementClear } from "../src/lint/fixture-paste.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";

const WC = "W_WC_SIDE_CLEARANCE";
const WIN = "W_FURNITURE_OVER_WINDOW";

/**
 * A 3000 × 2500 bath inside a 200 mm shell (inner faces x 100 and 2900, y 100 and 2400), a door
 * on the south wall well away from the pan, and the given extra statements.
 */
const bath = (extra: string): string => `plan "Bath" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,2500) (0,2500) close }
  room id=r_bath at (0,0) size 3000x2500 label "Bath" uses bath
  door id=d_in at (2400,2500) width 800 wall shell swing into r_bath
  ${extra}
}`;

/** A 400 × 700 pan backed onto the north face whose centreline is `c` mm from the west face. */
const wcAt = (c: number): string => `furniture wc at (${100 + c - 200},100) size 400x700`;

const of = (src: string, code: string, opts: Parameters<typeof lint>[1] = {}) =>
  lint(src, opts).filter((d) => d.code === code);

describe("W_WC_SIDE_CLEARANCE: the figure comes from the ruleset", () => {
  it("the default holds 400: 390 warns, 400 is clear", () => {
    expect(of(bath(wcAt(390)), WC)).toHaveLength(1);
    expect(of(bath(wcAt(400)), WC)).toEqual([]);
  });

  it("us-residential-advisory holds 381 (IRC P2705.1): 390 is clear there, 380 warns", () => {
    expect(of(bath(wcAt(390)), WC, { profile: "us-residential-advisory" })).toEqual([]);
    const [d] = of(bath(wcAt(380)), WC, { profile: "us-residential-advisory" });
    expect(d?.message).toContain("a WC needs 381 mm to each side (1 mm short)");
  });

  it("accessibility-advisory holds 450: 420 is clear by default and warns there", () => {
    expect(of(bath(wcAt(420)), WC)).toEqual([]);
    const [d] = of(bath(wcAt(420)), WC, { profile: "accessibility-advisory" });
    expect(d?.message).toContain("a WC needs 450 mm to each side (30 mm short)");
  });

  it("`wcSideClearanceMm: null` turns the rule off", () => {
    expect(of(bath(wcAt(200)), WC, { ruleset: { wcSideClearanceMm: null } })).toEqual([]);
  });

  it("names the room by its label and the obstacle by its kind, never an id", () => {
    const [d] = of(bath(wcAt(200)), WC);
    expect(d?.message).toBe(
      "The WC in Bath has its centreline 200 mm from an exterior wall beside it; a WC needs 400 mm to each side (200 mm short).",
    );
    expect(d?.fixes).toBeUndefined();
  });
});

describe("W_WC_SIDE_CLEARANCE: what counts beside the pan", () => {
  // The pan stands with its centreline 1000 mm from the west face, clear of the walls; a piece
  // 200 mm to its east (its east face is at x 1100, the piece starts at x 1300).
  const pan = wcAt(1000);
  it("a basin at the cut plane counts", () => {
    expect(of(bath(`${pan}\n  furniture basin at (1300,100) size 600x450`), WC)).toHaveLength(1);
  });
  it("a mirror (overhead), a rug (underlay) and a door's swing do not", () => {
    expect(of(bath(`${pan}\n  furniture mirror at (1300,100) size 600x50`), WC)).toEqual([]);
    expect(of(bath(`${pan}\n  furniture rug at (1300,300) size 800x800`), WC)).toEqual([]);
    // A door in the west wall swinging in: its leaf sweeps up to 800 mm off the face, past the
    // pan's west side, and is not an obstacle.
    const swing = bath(`${wcAt(500)}\n  door id=d_w at (0,700) width 800 wall shell swing into r_bath`);
    expect(of(swing, WC)).toEqual([]);
  });

  it("the wall the pan backs onto is not beside it, even when the pan is drawn 20 mm into it", () => {
    // Back face at y 80: 20 mm inside the north wall's body, within the 30 mm collision slack.
    expect(of(bath(`furniture wc at (900,80) size 400x700`), WC)).toEqual([]);
  });

  it("a door or cased opening in the side wall is a gap: the pan is measured to the jamb (red team B1)", () => {
    // A partition at x 1500 with a 1900 mm opening centred at y 1050 (y 100–2000): the pan's
    // whole east side (y 100–800) faces the opening, so nothing stands beside it.
    const src = `plan "Opening beside" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close }
  wall id=p partition thickness 100 { (1500,0) (1500,3000) }
  room id=r_a at (0,0) size 1500x3000 label "Bath" uses bath
  room id=r_b at (1500,0) size 1500x3000 label "Hall" uses hall
  opening id=o at (1500,1050) width 1900 wall p
  door id=d_in at (2250,3000) width 800 wall shell
  furniture wc at (1000,100) size 400x700
}`;
    expect(of(src, WC)).toEqual([]);
    // Control: the same plan with the opening closed warns, 250 mm to the partition's face.
    const shut = src.replace("  opening id=o at (1500,1050) width 1900 wall p\n", "");
    expect(of(shut, WC)[0]?.message).toContain("250 mm from a partition wall");
  });

  // The east side is a half circle bulging west into the square: centre (3000,1500), radius 1500,
  // so its 200 mm body's west face passes x 1400 at y 1500.
  const curved = (pieces: string): string => `plan "Curved" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) arc (3000,3000) radius 1500 (0,3000) close }
  room id=r at (0,0) size 3000x3000 label "Bath" uses bath
  door id=d_in at (1500,0) width 800 wall shell
  ${pieces}
}`;
  const skipsOf = (src: string): string[] =>
    (lintWithCoverage(src).coverage?.families ?? []).flatMap((f) => f.skipped ?? []).map((s) => s.reason);

  it("a WC whose side strip reaches a curved wall's body is not judged and files `curved-wc-wall`", () => {
    // Pan x 850–1250, y 1200–1900: its east strip runs to x 1450 at y 1230–1900, and the arc's body
    // (radius 1400–1600 about (3000,1500)) reaches x 1400 there.
    const src = curved("furniture wc at (850,1200) size 400x700");
    expect(of(src, WC)).toEqual([]);
    expect(skipsOf(src)).toContain("curved-wc-wall");
  });

  it("control: a pan far from the curve beside a basin is judged, with no skip (the shape, not its box)", () => {
    // Pan x 2300–2700, y 1200–1900, inside the half circle's bounding box (x 1400–3100): every
    // point of its strips (x 2100–2900, y 1230–1900) lies within 940 mm of the circle's centre, so
    // at least 460 mm clear of the wall's body (radius 1400–1600). A bin from x 2750 stands 50 mm
    // off the pan's east side. A bounding-box test would have skipped this pan.
    const src = curved("furniture wc at (2300,1200) size 400x700\n  furniture bin at (2750,1300) size 200x300");
    expect(of(src, WC)).toHaveLength(1);
    expect(skipsOf(src)).not.toContain("curved-wc-wall");
  });
});

describe("W_WC_SIDE_CLEARANCE: the hint's two branches", () => {
  it("room to slide: says the other side keeps the figure", () => {
    const [d] = of(bath(wcAt(200)), WC);
    expect(d?.hints?.[0]).toContain("slide it 200 mm along its back wall");
    expect(d?.hints?.[0]).toContain("its other side still keeps 400 mm");
  });
  it("no room: names the space across the pan and the 800 mm it needs", () => {
    // A pan spanning x 200–600 (centreline 300 mm from the west face at x 100) and a basin from
    // x 700: the west face to the basin is 600 mm across.
    const [d] = of(bath(`${wcAt(300)}\n  furniture basin at (700,100) size 600x450`), WC);
    expect(d?.hints?.[0]).toContain("is 600 mm, under the 800 mm a WC needs: move it to a wider run");
  });
});

/** A 4000 × 3000 kitchen with a 1200 mm window centred at x 2000 on the north wall (x 1400–2600). */
const kitchen = (extra: string, sill = ""): string => `plan "Kitchen" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r_k at (0,0) size 4000x3000 label "Kitchen" uses kitchen
  door id=d_in at (2000,3000) width 900 wall shell
  window id=win at (2000,0) width 1200 wall shell${sill}
  ${extra}
}`;

describe("W_FURNITURE_OVER_WINDOW", () => {
  it("a fridge against the wall across the span warns, with the covered length", () => {
    const [d] = of(kitchen("furniture fridge at (2300,100) size 600x650"), WIN);
    expect(d?.message).toBe(
      "The fridge in Kitchen stands in front of 300 mm of a 1200 mm window: a tall unit against the glass blocks its light and view.",
    );
    expect(d?.hints?.[0]).toContain("slide it 300 mm along the wall past the window's end");
  });
  it("a low unit, a fridge clear of the span and a bare `shelf` do not", () => {
    expect(of(kitchen("furniture counter at (1700,100) size 600x600"), WIN)).toEqual([]);
    expect(of(kitchen("furniture fridge at (2600,100) size 600x650"), WIN)).toEqual([]);
    expect(of(kitchen("furniture shelf at (1700,100) size 900x300"), WIN)).toEqual([]);
  });
  it("a window whose sill is at or above 2100 is not judged", () => {
    expect(of(kitchen("furniture fridge at (1700,100) size 600x650", " sill 2100"), WIN)).toEqual([]);
    expect(of(kitchen("furniture fridge at (1700,100) size 600x650", " sill 2000"), WIN)).toHaveLength(1);
  });
  it("a window on a curved wall files `curved-window-host`", () => {
    const src = `plan "Curved" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) arc (3000,3000) radius 1500 (0,3000) close }
  room id=r at (0,0) size 3000x3000 label "Kitchen" uses kitchen
  door id=d_in at (1500,0) width 800 wall shell
  window on shell at 5356 width 900
  furniture fridge at (2000,1200) size 650x600
}`;
    const skips = (lintWithCoverage(src).coverage?.families ?? []).flatMap((f) => f.skipped ?? []).map((s) => s.reason);
    expect(skips).toContain("curved-window-host");
  });
});

/**
 * A 6000 × 3000 living room with a 2000 mm floor-length window on the north wall (x 2000–4000), the
 * wall's face at y 100, a door on the south wall. `extra` holds the piece.
 */
const living = (extra: string, sill = " sill 0"): string => `plan "Living" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  room id=r_l at (0,0) size 6000x3000 label "Living" uses living
  door id=d_in at (5000,3000) width 900 wall shell
  window id=win at (3000,0) width 2000 wall shell${sill}
  ${extra}
}`;
const SOFA = "furniture id=sofa sofa at (2200,100) size 1200x800";

describe("W_FURNITURE_OVER_WINDOW: a low piece against a `sill 0` window", () => {
  it("a sofa against the glass warns, with the covered length; no id in the message", () => {
    const [d, ...rest] = of(living(SOFA), WIN);
    expect(rest).toEqual([]);
    expect(d?.message).toBe(
      "The sofa in Living stands against 1200 mm of a 2000 mm floor-length window, so the glass is not clear to the floor there.",
    );
    expect(d?.hints?.[0]).toBe(
      '"sofa" stands against 1200 mm of window "win" on wall "shell": slide it 1400 mm along the wall past the window\'s start (its end nearer the wall\'s first point), or raise the window\'s `sill` above it, or move the window.',
    );
  });
  it("the hint at its word: the slide clears it, as does raising the sill", () => {
    const slid = living("furniture id=sofa sofa at (800,100) size 1200x800");
    expect(of(slid, WIN)).toEqual([]);
    // It trades the warning for no other: the slid plan warns of nothing the sofa's first place did not.
    const codes = (src: string): Set<string> => new Set(lint(src).map((d) => d.code ?? ""));
    const before = codes(living(SOFA));
    expect([...codes(slid)].filter((c) => !before.has(c))).toEqual([]);
    expect(of(living(SOFA, " sill 900"), WIN)).toEqual([]);
  });
  it("the slide is rounded up, so a fractional position is cleared and not left 0.4 mm short", () => {
    // The sofa ends at x 3400.4: past the window's start at 2000 is 1400.4 mm.
    const src = living("furniture id=sofa sofa at (2200.4,100) size 1200x800");
    expect(of(src, WIN)[0]?.hints?.[0]).toContain("slide it 1401 mm");
    expect(of(src.replace("(2200.4,100)", "(799.4,100)"), WIN)).toEqual([]);
  });
  it("no slide is offered that the room cannot hold: a sofa as long as the walls beside the window", () => {
    const [d] = of(living("furniture id=sofa sofa at (1900,100) size 2200x800"), WIN);
    expect(d?.hints?.[0]).toContain(": stand it away from the glass, or raise the window's `sill` above it");
    expect(d?.hints?.[0]).not.toContain("slide it");
    // The hint at its word: off the glass, the warning goes.
    expect(of(living("furniture id=sofa sofa at (1900,400) size 2200x800"), WIN)).toEqual([]);
  });
  it("a piece against two such windows is reported for each, and only the first works out a slide", () => {
    const src = living(`window id=win2 at (4400,0) width 400 wall shell sill 0
  furniture id=sofa sofa at (3800,100) size 800x800`);
    const hints = of(src, WIN).map((d) => d.hints?.[0] ?? "");
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('window "win"');
    expect(hints[0]).toContain("slide it");
    expect(hints[1]).toContain('window "win2"');
    expect(hints[1]).toContain(": stand it away from the glass");
  });
  it("an unnamed window and piece are named by what the plan shows", () => {
    const src = living("furniture sofa at (2200,100) size 1200x800").replace("window id=win", "window");
    expect(of(src, WIN)[0]?.hints?.[0]).toContain('The sofa in "Living" stands against 1200 mm of the 2000 mm window');
  });
  it("any sill above 0 leaves it alone, as does a window with no `sill` clause", () => {
    expect(of(living(SOFA, ""), WIN)).toEqual([]);
    expect(of(living(SOFA, " sill 1"), WIN)).toEqual([]);
    expect(of(living(SOFA, " sill 300"), WIN)).toEqual([]);
  });
  it("a rug under the piece's place and an overhead piece stand in no one's way", () => {
    expect(of(living("furniture rug at (2200,100) size 1200x800"), WIN)).toEqual([]);
    expect(of(living("furniture wall_cabinet at (2200,100) size 600x350"), WIN)).toEqual([]);
  });
  it("a piece in the window's band and 100 mm off the wall's face does not warn: a chair at a table", () => {
    expect(of(living("furniture chair at (2500,200) size 450x450"), WIN)).toEqual([]);
    expect(of(living("furniture chair at (2500,100) size 450x450"), WIN)).toHaveLength(1);
  });
  it("an uncatalogued piece counts: nothing stands lower than a sill at the floor", () => {
    // `ottoman` was the uncatalogued word here until the visual-assets tranche catalogued it.
    expect(of(living("furniture trunk at (2500,100) size 600x600"), WIN)).toHaveLength(1);
  });
  it("a hob against it is one finding, `W_HOB_UNDER_WINDOW`'s", () => {
    const src = living("furniture stove at (2500,100) size 600x600");
    expect(of(src, WIN)).toEqual([]);
    expect(of(src, "W_HOB_UNDER_WINDOW")).toHaveLength(1);
  });
  it("a tall unit keeps its own sentence, and the hint offers no unit under a sill at the floor", () => {
    const [d] = of(living("furniture id=f fridge at (2500,100) size 600x650"), WIN);
    expect(d?.message).toContain("a tall unit against the glass blocks its light and view");
    expect(d?.hints?.[0]).not.toContain("no higher than the sill");
    const [high] = of(living("furniture id=f fridge at (2500,100) size 600x650", ""), WIN);
    expect(high?.hints?.[0]).toContain("stand a unit no higher than the sill (900 mm) there instead");
  });
  it("two pieces are reported in source order, each against each window it stands against", () => {
    const src = living(
      "furniture id=f fridge at (3500,100) size 600x650\n  furniture id=b bench at (2100,100) size 1000x400",
    );
    expect(of(src, WIN).map((d) => d.hints?.[0]?.split(" ").slice(0, 3).join(" "))).toEqual([
      '"f" covers 500',
      '"b" stands against',
    ]);
  });
  it("a window on a curved wall files `curved-window-host` for a low piece too", () => {
    const src = `plan "Curved" {
  units mm
  wall id=shell exterior thickness 200 { (0,0) (3000,0) arc (3000,3000) radius 1500 (0,3000) close }
  room id=r at (0,0) size 3000x3000 label "Living" uses living
  door id=d_in at (1500,0) width 800 wall shell
  window on shell at 5356 width 900 sill 0
  furniture sofa at (1500,1200) size 650x600
}`;
    const skips = (lintWithCoverage(src).coverage?.families ?? []).flatMap((f) => f.skipped ?? []).map((s) => s.reason);
    expect(skips).toContain("curved-window-host");
  });
});

describe("placementClear refuses what the two rules would report", () => {
  const ctxOf = (src: string) => {
    const { ir } = resolvePlan(src, {});
    return buildLintContext(ir!, DEFAULT_RULESET);
  };
  it("a corner WC is refused, the same pan 400 mm off the corner is not", () => {
    const ctx = ctxOf(bath(""));
    expect(placementClear(ctx, { x: 100, y: 100, w: 400, h: 700 }, "wc", 0)).toBe(false);
    expect(placementClear(ctx, { x: 300, y: 100, w: 400, h: 700 }, "wc", 0)).toBe(true);
  });
  it("a basin beside a WC, nearer its centreline than the figure, is refused", () => {
    const ctx = ctxOf(bath(wcAt(1000)));
    expect(placementClear(ctx, { x: 1300, y: 100, w: 600, h: 450 }, "basin", 0)).toBe(false);
    expect(placementClear(ctx, { x: 1500, y: 100, w: 600, h: 450 }, "basin", 0)).toBe(true);
  });
  it("a fridge over the window is refused, beside it is not", () => {
    const ctx = ctxOf(kitchen(""));
    expect(placementClear(ctx, { x: 2300, y: 100, w: 600, h: 650 }, "fridge", 0)).toBe(false);
    expect(placementClear(ctx, { x: 2700, y: 100, w: 600, h: 650 }, "fridge", 0)).toBe(true);
  });
  it("a low piece against a floor-length window is refused, against a default window it is not", () => {
    const fr = { x: 2200, y: 100, w: 1200, h: 800 };
    expect(placementClear(ctxOf(living("")), fr, "sofa", 0)).toBe(false);
    expect(placementClear(ctxOf(living("", "")), fr, "sofa", 0)).toBe(true);
    expect(placementClear(ctxOf(living("")), { ...fr, y: 400 }, "sofa", 0)).toBe(true);
  });
});
