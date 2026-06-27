import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, compile } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Cased `opening` — a leaf-less gap in a wall that still connects two spaces. It
 * voids the wall like a door/window but draws no leaf/swing, and it participates in
 * the access graph so open-plan layouts read as connected (not "disconnected" or
 * "unreachable").
 */

// Living + kitchen, open to each other via an `opening`, entered through one door.
const openPlan = `plan "Open" {
  units mm
  wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
  wall partition thickness 100 { (4000,0) (4000,4000) }
  room id=living  at (0,0)    size 4000x4000 label "Living"  uses living
  room id=kitchen at (4000,0) size 4000x4000 label "Kitchen" uses kitchen
  door    id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in
  opening id=op   at (4000,2000) width 1800 wall partition
}`;

describe("opening element", () => {
  it("connects two rooms in the access graph with full clear width (no leaf)", () => {
    const { access, openings } = describePlan(openPlan);
    expect(openings).toEqual([{ id: "op", between: ["living", "kitchen"], width: 1800 }]);
    const e = access.edges.find((x) => x.doorId === "op")!;
    expect(e.kind).toBe("opening");
    expect(e.estimatedClearWidth).toBe(1800); // openings keep their full width
    expect(access.rooms.find((r) => r.id === "kitchen")!.reachable).toBe(true);
  });

  it("does not flag a room reached only through an opening as disconnected", () => {
    const codes = lint(openPlan).map((d) => d.code);
    expect(codes).not.toContain("W_ROOM_DISCONNECTED");
    expect(codes).not.toContain("W_ROOM_UNREACHABLE");
    expect(codes).not.toContain("W_NO_ENTRANCE");
  });

  it("counts an opening on an exterior wall as an entrance", () => {
    const src = openPlan.replace(
      "door    id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in",
      "opening id=o_in at (2000,4000) width 1200 wall exterior",
    );
    expect(lint(src).map((d) => d.code)).not.toContain("W_NO_ENTRANCE");
  });

  it("warns W_ROOM_UNREACHABLE for a room with a connector but no path to the entrance", () => {
    // Right cluster (C–D) is walled off from the entered left room — they connect to
    // each other but not to the exterior.
    const src = `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      wall partition thickness 100 { (4000,2000) (8000,2000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=c at (4000,0) size 4000x2000 label "C"
      room id=d at (4000,2000) size 4000x2000 label "D"
      door id=d_in at (2000,4000) width 1000 wall exterior  hinge left swing in
      door id=d_cd at (6000,2000) width 800  wall partition hinge left swing in
    }`;
    const codes = lint(src).filter((x) => x.code === "W_ROOM_UNREACHABLE").map((d) => d.message);
    expect(codes.some((m) => m.includes('"C"'))).toBe(true);
    expect(codes.some((m) => m.includes('"D"'))).toBe(true);
  });

  it("renders the opening as a wall void with jambs but no leaf/swing arc", () => {
    const { svg } = compile(openPlan, { noCache: true });
    // The opening voids the wall (a polygon filled with the opening colour) but adds
    // no door swing arc of its own. (The single arc present is the entrance door's.)
    const arcs = (svg.match(/<path d="M [^"]*A /g) ?? []).length;
    expect(arcs).toBe(1);
  });

  it("rejects a non-positive width and round-trips through the formatter", () => {
    const { diagnostics } = compile(`plan "P" { units mm wall exterior thickness 200 { (0,0) (3000,0) } opening at (1500,0) width 0 }`, { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_OPENING_WIDTH")).toBe(true);
    expect(format(openPlan)).toContain("opening id=op at (4000, 2000) width 1800 wall partition");
  });
});
