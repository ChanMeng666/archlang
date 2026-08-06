import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";
import { northQuarterTurns } from "../src/describe.js";

/**
 * Semantic summary (`describe`) — the text-only verification channel.
 *
 * `describe(source)` resolves the plan and reports *facts* (rooms with areas and
 * adjacency, doors with what they connect, windows with the room they serve,
 * totals). It reuses the same parse→link→resolve pipeline as `compile`, so it must
 * be deterministic and report fatal errors via `diagnostics` (never throw).
 */

const STUDIO = `plan "Studio 1BR" {
  units mm
  grid 50
  scale 1:50
  wall exterior thickness 200 { (0,0) (7000,0) (7000,6000) (0,6000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  wall partition thickness 100 { (4000,4000) (7000,4000) }
  room id=r_living at (0,0)    size 4000x6000 label "Living / Kitchen"
  room id=r_bed    at (4000,0) size 3000x4000 label "Bedroom"
  room id=r_bath   at (4000,4000) size 3000x2000 label "Bath"
  door id=d_main at (1000,6000) width 1000 wall exterior  hinge left  swing in
  door id=d_bed  at (4000,1500) width 900  wall partition hinge left  swing in
  door id=d_bath at (5200,4000) width 800  wall partition hinge right swing out
  window at (2500,0)    width 1800 wall exterior
  window at (7000,2000) width 1200 wall exterior
  window at (7000,5000) width 800  wall exterior
}`;

describe("describe — semantic facts", () => {
  it("reports rooms with computed areas and a correct total", () => {
    const s = describePlan(STUDIO);
    expect(s.ok).toBe(true);
    expect(s.plan).toBe("Studio 1BR");
    expect(s.scale).toBe("1:50");
    expect(s.totals.rooms).toBe(3);
    const byId = Object.fromEntries(s.rooms.map((r) => [r.id, r]));
    expect(byId.r_living!.area_m2).toBe(24);
    expect(byId.r_bed!.area_m2).toBe(12);
    expect(byId.r_bath!.area_m2).toBe(6);
    expect(s.totals.floor_area_m2).toBe(42);
  });

  it("computes room adjacency from touching edges", () => {
    const s = describePlan(STUDIO);
    const byId = Object.fromEntries(s.rooms.map((r) => [r.id, r]));
    // All three rooms touch each other in the studio layout.
    expect([...byId.r_living!.adjacent].sort()).toEqual(["r_bath", "r_bed"]);
    expect([...byId.r_bed!.adjacent].sort()).toEqual(["r_bath", "r_living"]);
    expect([...byId.r_bath!.adjacent].sort()).toEqual(["r_bed", "r_living"]);
  });

  it("connects doors to the spaces on either side", () => {
    const s = describePlan(STUDIO);
    const byId = Object.fromEntries(s.doors.map((d) => [d.id, d]));
    expect([...byId.d_main!.between].sort()).toEqual(["exterior", "r_living"]);
    expect([...byId.d_bed!.between].sort()).toEqual(["r_bed", "r_living"]);
    expect([...byId.d_bath!.between].sort()).toEqual(["r_bath", "r_bed"]);
  });

  it("attributes each window to the room it serves", () => {
    const s = describePlan(STUDIO);
    expect(s.windows.map((w) => w.room)).toEqual(["r_living", "r_bed", "r_bath"]);
  });

  it("derives each window's compass facing from the room edge it sits on (+y down)", () => {
    // One room with a window on every edge: top→N, bottom→S, left→W, right→E.
    const FOUR = `plan "FourWin" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "Room"
      window id=w_top    at (2000,0)    width 1000 wall exterior
      window id=w_bottom at (2000,4000) width 1000 wall exterior
      window id=w_left   at (0,2000)    width 1000 wall exterior
      window id=w_right  at (4000,2000) width 1000 wall exterior
    }`;
    const s = describePlan(FOUR);
    const facing = Object.fromEntries(s.windows.map((w) => [w.id, w.facing]));
    expect(facing).toEqual({ w_top: "N", w_bottom: "S", w_left: "W", w_right: "E" });
    // The studio's windows: top of Living (N) and the two right-edge windows (E).
    const studio = describePlan(STUDIO);
    expect(studio.windows.map((w) => w.facing)).toEqual(["N", "E", "E"]);
  });

  it("is deterministic (same source → byte-identical summary)", () => {
    expect(JSON.stringify(describePlan(STUDIO))).toBe(JSON.stringify(describePlan(STUDIO)));
  });
});

/**
 * `facing` is a TRUE COMPASS direction, not "toward the top of the page": the plan's
 * `north` setting turns it. Before v1.25 a plan declaring `north right` still reported a
 * top-edge window as `"N"`, which silently mis-answered every intent
 * `windows: { facing: … }` assertion.
 */
describe("describe — window facing is read against the plan's `north`", () => {
  /** One room with a window on every edge; `north` is spliced in per case. */
  const fourWin = (north: string): string => `plan "FourWin" {
      units mm
      ${north}
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "Room"
      window id=w_top    at (2000,0)    width 1000 wall exterior
      window id=w_bottom at (2000,4000) width 1000 wall exterior
      window id=w_left   at (0,2000)    width 1000 wall exterior
      window id=w_right  at (4000,2000) width 1000 wall exterior
    }`;

  const facings = (north: string): Record<string, string | undefined> =>
    Object.fromEntries(describePlan(fourWin(north)).windows.map((w) => [w.id, w.facing]));

  it("rotates the page direction by each keyword north", () => {
    // `north up` (and no `north` at all) — the page's top IS compass north.
    const up = { w_top: "N", w_bottom: "S", w_left: "W", w_right: "E" };
    expect(facings("north up")).toEqual(up);
    expect(facings("")).toEqual(up);

    // `north right` — compass north points at the page's RIGHT edge, so the right-edge
    // window faces N and the top-edge one faces W (one quarter-turn anticlockwise).
    expect(facings("north right")).toEqual({ w_top: "W", w_right: "N", w_bottom: "E", w_left: "S" });
    // `north down` — the drawing is upside down relative to the compass.
    expect(facings("north down")).toEqual({ w_top: "S", w_right: "W", w_bottom: "N", w_left: "E" });
    // `north left`.
    expect(facings("north left")).toEqual({ w_top: "E", w_right: "S", w_bottom: "W", w_left: "N" });
  });

  it("snaps a `north <deg>` bearing to the nearest cardinal, ties clockwise", () => {
    // 80° is nearest `right` (90°).
    expect(facings("north 80")).toEqual(facings("north right"));
    // 100° likewise; 170° is nearest `down` (180°).
    expect(facings("north 100")).toEqual(facings("north right"));
    expect(facings("north 170")).toEqual(facings("north down"));
    // Exact 45° ties round CLOCKWISE: 45 → right, 135 → down, 225 → left, 315 → up.
    expect(facings("north 45")).toEqual(facings("north right"));
    expect(facings("north 135")).toEqual(facings("north down"));
    expect(facings("north 225")).toEqual(facings("north left"));
    expect(facings("north 315")).toEqual(facings("north up"));
    // Just short of a tie still rounds the near way.
    expect(facings("north 44")).toEqual(facings("north up"));
    // A bearing outside [0,360) normalises.
    expect(facings("north 450")).toEqual(facings("north right"));
  });

  it("keeps the page-relative answer as `facingPage`, only when north turns it", () => {
    const turned = describePlan(fourWin("north right")).windows;
    expect(Object.fromEntries(turned.map((w) => [w.id, w.facingPage]))).toEqual({
      w_top: "N",
      w_bottom: "S",
      w_left: "W",
      w_right: "E",
    });
    // A plan on the default north would only repeat `facing`, so the key is absent —
    // and a `north <deg>` that snaps back to `up` is the default too.
    for (const source of [fourWin(""), fourWin("north up"), fourWin("north 20")]) {
      for (const w of describePlan(source).windows) expect(w.facingPage).toBeUndefined();
      expect(JSON.stringify(describePlan(source))).not.toContain("facingPage");
    }
  });

  it("northQuarterTurns: keywords are exact, bearings snap, ties go clockwise", () => {
    expect([
      northQuarterTurns("up"),
      northQuarterTurns("right"),
      northQuarterTurns("down"),
      northQuarterTurns("left"),
    ]).toEqual([0, 1, 2, 3]);
    // Nearest cardinal…
    expect(northQuarterTurns({ deg: 0 })).toBe(0);
    expect(northQuarterTurns({ deg: 89 })).toBe(1);
    expect(northQuarterTurns({ deg: 181 })).toBe(2);
    expect(northQuarterTurns({ deg: 271 })).toBe(3);
    // …with exact 45° ties rounding CLOCKWISE, in both directions round the circle.
    expect(northQuarterTurns({ deg: 45 })).toBe(1);
    expect(northQuarterTurns({ deg: 135 })).toBe(2);
    expect(northQuarterTurns({ deg: 225 })).toBe(3);
    expect(northQuarterTurns({ deg: 315 })).toBe(0);
    // Out-of-range bearings normalise (both signs).
    expect(northQuarterTurns({ deg: 450 })).toBe(1);
    expect(northQuarterTurns({ deg: -90 })).toBe(3);
    expect(northQuarterTurns({ deg: -45 })).toBe(0);
  });

  it("leaves a plan that declares no `north` byte-identical", () => {
    // The pin for the fix: declaring the default explicitly changes nothing, and the
    // historical page-relative answers are still what a default plan reports.
    expect(JSON.stringify(describePlan(fourWin("")))).toBe(JSON.stringify(describePlan(fourWin("north up"))));
    expect(describePlan(STUDIO).windows.map((w) => w.facing)).toEqual(["N", "E", "E"]);
  });
});

describe("describe — freedom (degrees-of-freedom placement report)", () => {
  it("marks every absolute plan's elements `absolute`, with per-family totals", () => {
    const f = describePlan(STUDIO).freedom;
    expect(f.rooms).toEqual({ total: 3, absolute: 3, relational: 0, strip: 0 });
    // Studio has 3 doors + 3 windows, all authored with a literal `at`.
    expect(f.openings).toEqual({ total: 6, attached: 0, absolute: 6 });
    expect(f.furniture).toEqual({ total: 0, anchored: 0, againstWall: 0, absolute: 0 });
    // One row per placed element, all absolute, in emit order (rooms, then openings).
    expect(f.elements.every((e) => e.placement === "absolute")).toBe(true);
    expect(f.elements.map((e) => e.kind)).toEqual([
      "room",
      "room",
      "room",
      "door",
      "door",
      "door",
      "window",
      "window",
      "window",
    ]);
  });

  it("reports relationally-placed rooms as `relational` (the reference room stays absolute)", () => {
    const REL = `plan "Rel" {
      room id=a at (0,0) size 3000x3000
      room id=b right-of a gap 200 size 3000x3000
      room id=c below a gap 200 size 3000x3000
    }`;
    const f = describePlan(REL).freedom;
    expect(f.rooms).toEqual({ total: 3, absolute: 1, relational: 2, strip: 0 });
    expect(f.elements.map((e) => [e.id, e.placement])).toEqual([
      ["a", "absolute"],
      ["b", "relational"],
      ["c", "relational"],
    ]);
  });

  it("reports `strip`-laid rooms and `attached` openings as resolver-derived", () => {
    const SRC = `plan "Strip" {
      wall ext thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
      strip right at (0,0) gap 0 height 3000 {
        room id=r_a size 3000 label "A"
        room id=r_b size 3000 label "B"
      }
      door on ext at 50% width 900
      window on ext at 25% width 1000
    }`;
    const f = describePlan(SRC).freedom;
    expect(f.rooms).toEqual({ total: 2, absolute: 0, relational: 0, strip: 2 });
    expect(f.openings).toEqual({ total: 2, attached: 2, absolute: 0 });
    expect(f.elements.filter((e) => e.kind === "room").map((e) => e.placement)).toEqual(["strip", "strip"]);
  });

  it("distinguishes furniture placement paths (absolute / anchored / against-wall)", () => {
    const SRC = `plan "Furn" {
      wall w1 thickness 200 { (0,0) (4000,0) }
      room id=r at (0,200) size 4000x3000
      furniture desk at (500,500) size 1200x600
      furniture bed in r anchor top-left inset 100 size 1600x2000
      furniture sofa against wall w1 side left size 2000x800
    }`;
    const f = describePlan(SRC).freedom;
    expect(f.furniture).toEqual({ total: 3, anchored: 1, againstWall: 1, absolute: 1 });
    const byId = Object.fromEntries(f.elements.filter((e) => e.kind === "furniture").map((e) => [e.id, e.placement]));
    expect(byId.desk_1).toBe("absolute");
    expect(byId.bed_2).toBe("anchored");
    expect(byId.sofa_3).toBe("against-wall");
  });

  it("is present and empty on a failed resolution", () => {
    const f = describePlan(`plan "Bad" { room at (0,0) size 0x4000 label "X" }`).freedom;
    expect(f).toEqual({
      rooms: { total: 0, absolute: 0, relational: 0, strip: 0 },
      openings: { total: 0, attached: 0, absolute: 0 },
      furniture: { total: 0, anchored: 0, againstWall: 0, absolute: 0 },
      elements: [],
    });
  });
});

describe("describe — errors", () => {
  it("returns ok:false with diagnostics on a fatal error, never throws", () => {
    const s = describePlan(`plan "Bad" { room at (0,0) size 0x4000 label "X" }`);
    expect(s.ok).toBe(false);
    expect(s.rooms).toEqual([]);
    expect(s.diagnostics.some((d) => d.code === "E_ROOM_SIZE")).toBe(true);
  });
});
