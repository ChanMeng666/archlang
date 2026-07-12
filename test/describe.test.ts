import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";

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
    expect(byId.r_living.area_m2).toBe(24);
    expect(byId.r_bed.area_m2).toBe(12);
    expect(byId.r_bath.area_m2).toBe(6);
    expect(s.totals.floor_area_m2).toBe(42);
  });

  it("computes room adjacency from touching edges", () => {
    const s = describePlan(STUDIO);
    const byId = Object.fromEntries(s.rooms.map((r) => [r.id, r]));
    // All three rooms touch each other in the studio layout.
    expect([...byId.r_living.adjacent].sort()).toEqual(["r_bath", "r_bed"]);
    expect([...byId.r_bed.adjacent].sort()).toEqual(["r_bath", "r_living"]);
    expect([...byId.r_bath.adjacent].sort()).toEqual(["r_bed", "r_living"]);
  });

  it("connects doors to the spaces on either side", () => {
    const s = describePlan(STUDIO);
    const byId = Object.fromEntries(s.doors.map((d) => [d.id, d]));
    expect([...byId.d_main.between].sort()).toEqual(["exterior", "r_living"]);
    expect([...byId.d_bed.between].sort()).toEqual(["r_bed", "r_living"]);
    expect([...byId.d_bath.between].sort()).toEqual(["r_bath", "r_bed"]);
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
