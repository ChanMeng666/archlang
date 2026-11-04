import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";

/**
 * A window on an ARC wall edge is attributed from the shape (plan-soundness PS0.12). Its point
 * is on no room's straight edge, so `describe().windows[].room` read `null` for it and every
 * daylight rule was blind on a bay (`examples/hillside-villa.arch`'s living-room bay;
 * audits/archcanvas-public-examples.md BB3). Now: one wall thickness off the arc's faces (a
 * room whose floor follows the curve), else carried along the concave normal through the
 * arc's chord (a room drawn to the chord, the bay opening into it), else still `null`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

/** A living room drawn to the chord of a bay that bows south out of its wall. */
const bay = (extra = "", room = `room id=r_live at (0,0) size 6000x4000 label "Living"`) => `plan "Bay" {
  units mm
  grid 100
  wall id=shell exterior thickness 250 {
    (0,0) (6000,0) (6000,4000) (4000,4000) arc (2000,4000) radius 1000 cw (0,4000) close
  }
  ${room}
  door id=d_front on shell at 3000 width 900 swing in
  window id=w_bay at (3000,5000) width 1200 wall shell
  ${extra}
}`;

const windowRoom = (src: string, id: string) => describePlan(src).windows.find((w) => w.id === id)?.room;
const codes = (src: string) => lint(src).map((d) => d.code);

describe("PS0.12 — a window on an arc edge is attributed from the shape", () => {
  it("hillside-villa's living-room bay window serves the living room", () => {
    const s = describePlan(read("examples/hillside-villa.arch"));
    const ground = s.levels!.find((l) => l.level === 1)!;
    const w = ground.windows.find((x) => x.id === "window_10")!;
    expect(w.room).toBe("r_living");
    // Its facing is asked exactly as before (no room box), and is unchanged.
    expect(w.facing).toBe("S");
  });

  it("a bay drawn outside a room that stops at the chord: the probe crosses the chord into it", () => {
    expect(windowRoom(bay(), "w_bay")).toBe("r_live");
    // The room now has a window, so the daylight rule reads it as lit.
    expect(codes(bay())).not.toContain("W_HABITABLE_NO_WINDOW");
  });

  it("a wall standing on the chord closes the bay off: no room, and the daylight rule still skips", () => {
    const walled = bay(`wall id=w_chord partition thickness 100 { (2000,4000) (4000,4000) }`);
    expect(windowRoom(walled, "w_bay")).toBeNull();
    // The living room's only window is the unattributed bay window: whether it is lit is
    // unknown, so W_HABITABLE_NO_WINDOW keeps its arc-window skip rather than guessing.
    expect(codes(walled)).not.toContain("W_HABITABLE_NO_WINDOW");
    // Control: without the bay window at all, the same room IS reported.
    const dark = walled.replace("window id=w_bay at (3000,5000) width 1200 wall shell", "");
    expect(codes(dark)).toContain("W_HABITABLE_NO_WINDOW");
  });

  it("a room whose floor follows the curve: the face probe one wall thickness in finds it", () => {
    // The ring traces the bay 300 mm inside the arc's centreline, further than the 200 mm edge
    // tolerance, so no room edge touches the window's point; a 400 mm wall's concave probe
    // lands on the floor.
    const traced = bay(
      "",
      `room id=r_live polygon (0,0) (6000,0) (6000,4000) (3700,4000) (3500,4500) (3000,4700) (2500,4500) (2300,4000) (0,4000) label "Living"`,
    ).replace("thickness 250 {", "thickness 400 {");
    expect(windowRoom(traced, "w_bay")).toBe("r_live");
  });

  it("a bay whose chord two rooms share goes to the room in front of the window's centre", () => {
    const s = describePlan(read("test/plans/plan-soundness/repro/gallery-bench-pinch.arch"));
    expect(s.windows.find((w) => w.id === "win_cafe")!.room).toBe("r_cafe");
    expect(s.windows.find((w) => w.id === "win_n2")!.room).toBe("r_g2");
  });

  it("a window a room edge already touches keeps that room (the arc path is never asked)", () => {
    const s = describePlan(read("examples/aquarium.arch"));
    expect(s.windows.find((w) => w.id === "w_arc1")!.room).toBe("cafe");
    expect(s.windows.find((w) => w.id === "w_arc2")!.room).toBe("cafe");
  });
});
