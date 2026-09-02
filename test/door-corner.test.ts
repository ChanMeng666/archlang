/**
 * `W_DOOR_NEAR_CORNER` — a door jamb leaving less wall between it and a corner than the
 * wall is thick (`docs/backlog.md` 4.2).
 *
 * Three things are proved here that a reading cannot settle:
 *
 * 1. **The threshold is measured, not asserted.** Every positive case states the nib, the
 *    requirement and the shortfall in the message, and the test computes each from the
 *    plan's own coordinates rather than copying what the rule printed.
 * 2. **The corner test is a TURN, not a shape.** A free wall end, a redundant collinear
 *    vertex, a partition teeing into a run that carries straight past it, and a TANGENT
 *    arc/straight hand-over are all excluded — each with the same door in the same place
 *    as a positive case, so the only variable is whether the wall turns.
 * 3. **On a curve the nib is an ARC LENGTH, not a chord.** The curved case is built so
 *    the two answers differ by an order of magnitude (162 mm vs. 25 mm), and the chord
 *    figure is computed here from first principles so "not a chord" is an assertion about
 *    a number rather than a claim about the implementation.
 */

import { describe, expect, it } from "vitest";
import { ERROR_CATALOG, lint } from "../src/index.js";

const plan = (body: string): string => `plan "Corner" {\n  units mm\n${body}\n}`;
const corners = (src: string) => lint(src).filter((d) => d.code === "W_DOOR_NEAR_CORNER");

/** The one number in a message, by its label — so an assertion names the quantity. */
const nums = (msg: string): number[] => [...msg.matchAll(/(\d+(?:\.\d+)?) mm/g)].map((m) => Number(m[1]));

// ---------------------------------------------------------------------------
// A straight run
// ---------------------------------------------------------------------------

/** An L: 5000 along x, then 4000 down. The corner is at (5000,0). */
const L = (at: number, kind = "") =>
  plan(`  wall id=w1 exterior thickness 250 { (0,0) (5000,0) (5000,4000) }\n  door ${kind}on w1 at ${at} width 900`);

describe("W_DOOR_NEAR_CORNER — a straight run", () => {
  it("warns, with the nib, the requirement and the shortfall all measured", () => {
    // centre 4400, half-width 450 ⇒ jamb at 4850; the corner is at 5000 ⇒ a 150 mm nib
    // on a 250 mm wall, 100 mm short.
    const ds = corners(L(4400));
    expect(ds).toHaveLength(1);
    const d = ds[0]!;
    expect(d.severity).toBe("warning");
    expect(d.span).toBeDefined();
    expect(nums(d.message)).toEqual([250, 150, 100]);
    expect(d.message).toContain('wall "w1" at (5000, 0)');
  });

  it("says nothing when the door is comfortably clear of the corner", () => {
    // centre 4000 ⇒ jamb at 4450 ⇒ a 550 mm nib, 300 mm to spare.
    expect(corners(L(4000))).toEqual([]);
  });

  it("does not fire at EXACTLY the threshold — 'less than the wall is thick' is strict", () => {
    // centre 4300 ⇒ jamb at 4750 ⇒ a 250 mm nib on a 250 mm wall: equal, not less.
    expect(corners(L(4300))).toEqual([]);
    // …and one millimetre further along it does fire, so the boundary is where it says.
    expect(corners(L(4301))).toHaveLength(1);
  });

  it("is kind-independent — a jamb is a jamb", () => {
    for (const kind of ["", "sliding ", "pocket ", "barn ", "bifold ", "garage "]) {
      expect(corners(L(4400, kind)), kind || "hinged").toHaveLength(1);
    }
  });

  it("offers no machine-applicable fix — every remedy rewrites a number the author chose", () => {
    expect(corners(L(4400))[0]!.fixes).toBeUndefined();
  });

  it("finds a corner made by a SEPARATE wall, not just a polyline vertex", () => {
    const src = plan(
      `  wall id=w1 exterior thickness 250 { (0,0) (5000,0) }\n` +
        `  wall id=w2 exterior thickness 250 { (5000,0) (5000,4000) }\n` +
        `  door on w1 at 4400 width 900`,
    );
    expect(nums(corners(src)[0]!.message)).toEqual([250, 150, 100]);
  });
});

// ---------------------------------------------------------------------------
// The three straight shapes that are NOT corners — same door, same place
// ---------------------------------------------------------------------------

describe("W_DOOR_NEAR_CORNER — what is not a corner", () => {
  it("a wall's free END is not a corner (nothing to mitre into)", () => {
    // The identical door 150 mm from the end of a run that simply stops.
    expect(
      corners(plan(`  wall id=w1 exterior thickness 250 { (0,0) (5000,0) }\n  door on w1 at 4400 width 900`)),
    ).toEqual([]);
  });

  it("a redundant COLLINEAR vertex is not a corner", () => {
    expect(
      corners(plan(`  wall id=w1 exterior thickness 250 { (0,0) (5000,0) (9000,0) }\n  door on w1 at 4400 width 900`)),
    ).toEqual([]);
  });

  it("a partition teeing into a wall that carries straight past it is not a corner", () => {
    // A branch leaves (5000,0) at 90°, but the host run also continues straight through,
    // so nothing is mitred and the wall does not read as turning.
    const src = plan(
      `  wall id=w1 exterior  thickness 250 { (0,0) (5000,0) (9000,0) }\n` +
        `  wall id=w2 partition thickness 100 { (5000,0) (5000,3000) }\n` +
        `  door on w1 at 4400 width 900`,
    );
    expect(corners(src)).toEqual([]);
    // Non-vacuity: bend the host at that same point and the same door DOES warn.
    const bent = plan(
      `  wall id=w1 exterior  thickness 250 { (0,0) (5000,0) (9000,3000) }\n` +
        `  wall id=w2 partition thickness 100 { (5000,0) (5000,3000) }\n` +
        `  door on w1 at 4400 width 900`,
    );
    expect(corners(bent)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A curve: arc length, not chord
// ---------------------------------------------------------------------------

// A quarter circle of radius 3000 about the origin, from (3000,0) round to (0,3000) —
// arc length exactly 3000·π/2 — handing over to a straight run. `tail` decides whether
// that hand-over TURNS (down the y axis) or is TANGENT (on along −x).
const R = 3000;
const ARC_LEN = R * (Math.PI / 2);
const curved = (at: number, tail: string) =>
  plan(
    `  wall id=w1 exterior thickness 250 {\n    (3000,0)\n    arc (0,3000) radius 3000 cw\n    ${tail}\n  }\n` +
      `  door on w1 at ${at} width 900`,
  );
const TURNS = "(0,6000)"; // 90° down — a real corner
const TANGENT = "(-3000,3000)"; // straight on along the tangent — no corner

describe("W_DOOR_NEAR_CORNER — on a curve", () => {
  it("measures the nib as an arc length, which is nothing like the chord", () => {
    // centre at arc-length 4100, jamb at 4550, junction at ARC_LEN ⇒ 162.4 mm of nib.
    const expected = ARC_LEN - 4100 - 450;
    expect(expected).toBeCloseTo(162.389, 3);
    const ds = corners(curved(4100, TURNS));
    expect(ds).toHaveLength(1);
    expect(nums(ds[0]!.message)).toEqual([250, Math.round(expected), Math.round(250 - expected)]);

    // What the CHORD would have said, computed here rather than taken on trust: project
    // the door centre onto the chord (3000,0)→(0,3000) and subtract the half-width.
    const th = 4100 / R;
    const centre = { x: R * Math.cos(th), y: R * Math.sin(th) };
    const chordLen = Math.hypot(3000, 3000);
    const u = ((centre.x - 3000) * -3000 + (centre.y - 0) * 3000) / chordLen;
    const chordNib = chordLen - u - 450;
    expect(chordNib).toBeCloseTo(24.067, 2);
    // The two answers are not the same rule with rounding — they are 138 mm apart, and
    // the chord one would have called this plan 226 mm short instead of 88.
    expect(Math.abs(expected - chordNib)).toBeGreaterThan(100);
    expect(ds[0]!.message).not.toContain(`${Math.round(chordNib)} mm`);
  });

  it("says nothing when the door is clear of the curved junction", () => {
    // centre 3800 ⇒ jamb at 4250 ⇒ 462 mm of nib.
    expect(corners(curved(3800, TURNS))).toEqual([]);
  });

  it("a TANGENT arc/straight hand-over is not a corner — the wall does not turn", () => {
    // Byte-for-byte the same door in the same place as the positive case above; the only
    // difference is where the straight run goes after the curve ends.
    expect(corners(curved(4100, TANGENT))).toEqual([]);
  });

  it("the curved nib is closed form — it does not move with the arc's facet count", () => {
    // A tessellated measurement would change with the sweep, since the chord count is a
    // fixed angular step. Two sweeps around the SAME radius that leave the same nib must
    // report the same number.
    const half = plan(
      `  wall id=w1 exterior thickness 250 {\n    (3000,0)\n    arc (-3000,0) radius 3000 cw\n    (-3000,4000)\n  }\n` +
        `  door on w1 at ${R * Math.PI - 612.389} width 900`,
    );
    expect(nums(corners(half)[0]!.message)[1]).toBe(162);
  });
});

// ---------------------------------------------------------------------------
// The corpus fact worth pinning
// ---------------------------------------------------------------------------

describe("W_DOOR_NEAR_CORNER — the catalogue and the corpus", () => {
  it("is catalogued with a cause, a fix and an example", () => {
    const e = ERROR_CATALOG.W_DOOR_NEAR_CORNER!;
    expect(e.cause.length).toBeGreaterThan(0);
    expect(e.fix.length).toBeGreaterThan(0);
    expect(e.example.length).toBeGreaterThan(0);
  });

  it("the tightest door in the shipped corpus sits EXACTLY on the threshold and passes", () => {
    // `examples/hillside-villa.arch`'s `d_living_garden`: a 1000 mm leaf centred 800 mm
    // from the shell's corner leaves a 300 mm nib on a 300 mm wall. It is the closest any
    // shipped plan comes, it does not warn, and this pins that — a threshold that moved
    // even 1 mm stricter would start warning on the showpiece.
    const src = plan(
      `  wall id=shell exterior thickness 300 { (0,0) (12000,0) (12000,10200) (0,10200) close }\n` +
        `  door id=d_living_garden at (800,10200) width 1000 wall shell hinge left swing out`,
    );
    expect(corners(src)).toEqual([]);
    // …and the same door 1 mm nearer the corner does warn, so the pin is not vacuous.
    const nearer = src.replace("(800,10200)", "(799,10200)");
    expect(corners(nearer)).toHaveLength(1);
  });
});
