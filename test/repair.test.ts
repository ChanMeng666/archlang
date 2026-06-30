import { describe, expect, it } from "vitest";
import { repair, lint } from "../src/index.js";

/**
 * `arch repair` — the explicit source-to-source corrector (ADR 0006). It emits new
 * `.arch` source with furniture pushed out of walls; it never edits render behavior.
 * The output must lint clean of the collision it fixed, be idempotent, and refuse to
 * guess (ambiguous / wall-anchored / scripted pieces are left untouched).
 */

const split = (furn: string) =>
  `plan "P" {
    units mm
    grid 50
    wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall partition thickness 100 { (4000,0) (4000,4000) }
    room id=a at (0,0)    size 4000x4000 label "A"
    room id=b at (4000,0) size 4000x4000 label "B"
    ${furn}
  }`;

const has = (src: string, code: string) => lint(src).some((d) => d.code === code);

describe("arch repair", () => {
  it("pushes furniture out of a wall and the result lints clean", () => {
    const src = split(`furniture sofa at (3200,1000) size 1000x900`);
    expect(has(src, "W_FURNITURE_WALL_COLLISION")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0].kind).toBe("moved");
    expect(r.changes[0].reason).toContain("wall");
    expect(has(r.source, "W_FURNITURE_WALL_COLLISION")).toBe(false);
  });

  it("clears furniture out of a door's landing", () => {
    // A door on the bottom exterior wall with a chest parked right in the approach.
    const src = `plan "P" {
      units mm grid 50
      wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
      room id=r at (0,0) size 5000x5000 label "R"
      door at (1000,5000) width 900 wall exterior hinge left swing in
      window at (3000,0) width 1200 wall exterior
      furniture chest at (700,4400) size 800x500
    }`;
    expect(has(src, "W_DOORWAY_BLOCKED")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0].reason).toContain("doorway");
    expect(has(r.source, "W_DOORWAY_BLOCKED")).toBe(false);
  });

  it("snaps a floating wall-fixture onto the nearest wall", () => {
    const src = `plan "P" {
      units mm grid 50
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "Bath" uses bath
      door at (2000,4000) width 900 wall exterior hinge left swing in
      furniture wc at (1700,400) size 400x700
    }`;
    expect(has(src, "W_FIXTURE_FLOATING")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0].reason).toContain("wall");
    expect(has(r.source, "W_FIXTURE_FLOATING")).toBe(false);
  });

  it("separates two overlapping pieces (the later one yields)", () => {
    const src = split(`furniture sofa at (300,300) size 1500x900\n    furniture table at (800,500) size 1000x900`);
    expect(has(src, "W_FURNITURE_OVERLAP")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    // The earlier piece (sofa) is the anchor; the later (table) is the mover.
    expect(r.changes.map((c) => c.id.replace(/#.*/, ""))).toContain("table");
    expect(r.changes.every((c) => !c.id.startsWith("sofa"))).toBe(true);
    expect(has(r.source, "W_FURNITURE_OVERLAP")).toBe(false);
  });

  it("moves a fixture into its declared room", () => {
    // wc declared `in b` but placed in room a's area.
    const src = split(`furniture wc at (200,200) size 400x700 in b`);
    expect(has(src, "W_FIXTURE_WRONG_ROOM")).toBe(true);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0].reason).toContain("declared room");
    expect(has(r.source, "W_FIXTURE_WRONG_ROOM")).toBe(false);
  });

  it("is idempotent — repairing a fixed plan makes no further change", () => {
    const r1 = repair(split(`furniture sofa at (3200,1000) size 1000x900`));
    const r2 = repair(r1.source);
    expect(r2.changed).toBe(false);
    expect(r2.source).toBe(r1.source);
  });

  it("leaves a sound plan untouched (verbatim source)", () => {
    const src = split(`furniture sofa at (300,1000) size 2000x900`);
    const r = repair(src);
    expect(r.changed).toBe(false);
    expect(r.source).toBe(src);
  });

  it("refuses to guess for a piece centred exactly on a wall", () => {
    // Centre x = 4000 sits on the partition centreline — no majority side.
    const r = repair(split(`furniture table at (3500,1000) size 1000x900`));
    expect(r.changed).toBe(false);
    expect(r.unresolved.some((u) => u.reason.includes("centred on a wall"))).toBe(true);
  });

  it("does not touch wall-anchored (`against wall`) furniture", () => {
    const r = repair(split(`furniture wc against wall partition side left in a size 400x700`));
    expect(r.changed).toBe(false);
  });
});
