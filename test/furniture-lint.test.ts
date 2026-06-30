import { describe, expect, it } from "vitest";
import { lint, compile, describe as describePlan } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Furniture professionalism lint: pieces that overlap each other
 * (`W_FURNITURE_OVERLAP`) and wall-requiring fixtures that float in the middle of a
 * room (`W_FIXTURE_FLOATING`). Advisory, deterministic, over the resolved IR.
 */

const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");

const room = (furniture: string) =>
  `plan "P" {
    units mm
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Studio"
    ${furniture}
  }`;

describe("furniture lint", () => {
  it("flags two overlapping furniture pieces", () => {
    const c = codes(room(`furniture sofa at (300,300) size 2000x900\n    furniture table at (1000,500) size 1000x1000`));
    expect(c).toContain("W_FURNITURE_OVERLAP");
  });

  it("does not flag furniture that merely sits apart", () => {
    const c = codes(room(`furniture sofa at (300,300) size 1500x900\n    furniture table at (2200,300) size 1000x600`));
    expect(c).not.toContain("W_FURNITURE_OVERLAP");
  });

  it("flags a wall-requiring fixture floating in the middle of the room", () => {
    const c = codes(room(`furniture wc at (1800,1800) size 400x700`));
    expect(c).toContain("W_FIXTURE_FLOATING");
  });

  it("does not flag a fixture placed against a wall", () => {
    const c = codes(room(`furniture wc at (100,100) size 400x700`));
    expect(c).not.toContain("W_FIXTURE_FLOATING");
  });

  it("does not flag free-standing furniture (a bed) for floating", () => {
    const c = codes(room(`furniture bed at (1700,1700) size 1500x2000`));
    expect(c).not.toContain("W_FIXTURE_FLOATING");
  });
});

// Two rooms side by side for the `in <room>` ownership checks.
const twoRoom = (furniture: string) =>
  `plan "P" {
    units mm
    wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall partition thickness 100 { (4000,0) (4000,4000) }
    room id=living at (0,0)    size 4000x4000 label "Living"
    room id=bath   at (4000,0) size 4000x4000 label "Bath"
    ${furniture}
  }`;

describe("furniture `in <room>` ownership", () => {
  it("flags a fixture whose centre is outside its declared room", () => {
    const c = lint(twoRoom(`furniture wc at (200,200) size 400x700 in bath`)).map((d) => d.code ?? "");
    expect(c).toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("does not flag a fixture that sits inside its declared room", () => {
    const c = lint(twoRoom(`furniture wc at (4200,200) size 400x700 in bath`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("errors when `in` names a room that does not exist", () => {
    const { diagnostics } = compile(twoRoom(`furniture wc at (4200,200) size 400x700 in nosuchroom`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_FURN_ROOM")).toBe(true);
  });

  it("surfaces the owning room in describe() and round-trips through the formatter", () => {
    const src = twoRoom(`furniture wc at (4200,200) size 400x700 in bath`);
    expect(describePlan(src).furniture[0].room).toBe("bath");
    expect(format(src)).toContain("size 400x700 in bath");
  });
});

describe("furniture-vs-wall collision lint", () => {
  // Two rooms split by a partition at x=4000.
  const split = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      ${furn}
    }`;

  it("flags furniture drawn straddling a wall", () => {
    // Sofa crosses the x=4000 partition (x 3500→4500).
    const c = codes(split(`furniture sofa at (3500,1000) size 1000x900`));
    expect(c).toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("does not flag furniture flush against the wall face", () => {
    // Counter backs onto the partition's left face (x ends at 3950, the wall face).
    const c = codes(split(`furniture sofa at (2950,1000) size 1000x900`));
    expect(c).not.toContain("W_FURNITURE_WALL_COLLISION");
  });
});

describe("doorway-blocked lint", () => {
  const room = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      window at (3000,0) width 1200 wall exterior
      ${furn}
    }`;

  it("flags furniture parked in the door's clear approach", () => {
    const c = codes(room(`furniture wc at (700,3600) size 700x400`));
    expect(c).toContain("W_DOORWAY_BLOCKED");
  });

  it("leaves a clear doorway alone", () => {
    const c = codes(room(`furniture wc at (3500,3500) size 400x700`));
    expect(c).not.toContain("W_DOORWAY_BLOCKED");
  });
});

describe("room circulation (clear-path) lint", () => {
  it("flags a room whose door reaches only a sealed-off sliver of floor", () => {
    // A full-width barrier seals a thin strip at the door from the open room above.
    // ~22 m² of free floor exists, but the door can reach < 1 m² of it.
    const src = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
      room id=r at (0,0) size 6000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      furniture barrier at (0,3600) size 6000x300
    }`;
    expect(codes(src)).toContain("W_ROOM_NO_CLEAR_PATH");
  });

  it("does not flag a normally-furnished room", () => {
    const src = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
      room id=r at (0,0) size 6000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      furniture sofa at (300,300) size 2000x900
      furniture bed  at (3500,300) size 1500x2000
    }`;
    expect(codes(src)).not.toContain("W_ROOM_NO_CLEAR_PATH");
  });
});

describe("fixture front-clearance lint", () => {
  const kitchen = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=k at (0,0) size 4000x4000 label "Kitchen" uses kitchen
      furniture stove at (200,100) size 600x600
      ${furn}
    }`;

  it("flags a free-standing piece parked in the fixture's use-space", () => {
    // Stove front faces south (y 700→1250); the sofa sits right there.
    const c = lint(kitchen(`furniture sofa at (200,800) size 1500x900`)).map((d) => d.code ?? "");
    expect(c).toContain("W_FURN_CLEARANCE");
  });

  it("does not flag furniture clear of the use-space", () => {
    const c = lint(kitchen(`furniture sofa at (200,2000) size 1500x900`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FURN_CLEARANCE");
  });

  it("ignores another fixture in front (compact runs are fine)", () => {
    // A counter directly south of the stove is a normal kitchen run, not a blockage.
    const c = lint(kitchen(`furniture counter at (200,800) size 600x600`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FURN_CLEARANCE");
  });
});
