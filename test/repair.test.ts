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

const collisions = (src: string) => lint(src).filter((d) => d.code === "W_FURNITURE_WALL_COLLISION").length;

describe("arch repair", () => {
  it("pushes furniture out of a wall and the result lints clean", () => {
    const src = split(`furniture sofa at (3200,1000) size 1000x900`);
    expect(collisions(src)).toBe(1);
    const r = repair(src);
    expect(r.changed).toBe(true);
    expect(r.changes[0].kind).toBe("moved-out-of-wall");
    expect(collisions(r.source)).toBe(0);
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
