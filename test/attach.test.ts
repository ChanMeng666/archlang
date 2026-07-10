import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import type { RDoor, ROpening, RWindow } from "../src/ir.js";

/**
 * T1a — opening attachment (`door|window|opening on <wall> at <pos>`) and
 * T1b — explicit swing/hinge (`swing into <room>`, `hinge near start|end`).
 *
 * An attached opening walks the named wall's polyline to a point (percent / mm /
 * center), pins to that host segment by construction (never "off wall"), and is
 * byte-identical to the hand-computed absolute-coordinate form (twin golden).
 */

// Wall w1: (0,0)->(4000,0), 200 thick. Room r below it (on the +y / interior side).
const plan = (body: string) => `plan "P" {
  units mm
  grid 1
  wall id=w1 exterior thickness 200 { (0,0) (4000,0) }
  room id=r at (0,200) size 4000x3000 label "R"
  ${body}
}`;

const doorOf = (src: string): RDoor => resolve(parse(src).plan!).ir.elements.find((e) => e.kind === "door") as RDoor;

describe("T1a — opening attachment", () => {
  it("attached door is byte-identical to the hand-computed absolute door (twin golden)", () => {
    // 40% of the 4000 mm wall = 1600 mm from start → point (1600, 0) on w1.
    const attached = compile(plan(`door on w1 at 40% width 900 swing out`), { noCache: true });
    const manual = compile(plan(`door at (1600,0) width 900 wall w1 swing out`), { noCache: true });
    expect(attached.errors).toEqual([]);
    expect(attached.svg).toBe(manual.svg);
  });

  it("percent / mm / center resolve to the same point on the wall", () => {
    expect(doorOf(plan(`door on w1 at 40% width 900`)).at).toEqual({ x: 1600, y: 0 });
    expect(doorOf(plan(`door on w1 at 1600 width 900`)).at).toEqual({ x: 1600, y: 0 });
    expect(doorOf(plan(`door on w1 at center width 900`)).at).toEqual({ x: 2000, y: 0 });
  });

  it("an attached opening always has a host (never W_*_OFF_WALL)", () => {
    const { diagnostics } = compile(plan(`door on w1 at 10% width 900`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_DOOR_OFF_WALL")).toBe(false);
    expect(doorOf(plan(`door on w1 at 10% width 900`)).host).not.toBeNull();
  });

  it("walks a multi-segment polyline by cumulative length", () => {
    // L-shaped wall: (0,0)->(2000,0) [len 2000] ->(2000,2000) [len 2000]; total 4000.
    const src = `plan "P" {
      units mm
      grid 1
      wall id=w exterior thickness 200 { (0,0) (2000,0) (2000,2000) }
      door on w at 75% width 800
    }`;
    // 75% of 4000 = 3000 → 1000 into the 2nd (vertical) segment → (2000, 1000).
    const d = doorOf(src);
    expect(d.at).toEqual({ x: 2000, y: 1000 });
    expect(d.host!.index).toBe(1);
  });

  it("window and opening attach the same way", () => {
    const w = resolve(parse(plan(`window on w1 at 50% width 1200`)).plan!).ir.elements.find(
      (e) => e.kind === "window",
    ) as RWindow;
    const o = resolve(parse(plan(`opening on w1 at 25% width 800`)).plan!).ir.elements.find(
      (e) => e.kind === "opening",
    ) as ROpening;
    expect(w.at).toEqual({ x: 2000, y: 0 });
    expect(w.host).not.toBeNull();
    expect(o.at).toEqual({ x: 1000, y: 0 });
    expect(o.host).not.toBeNull();
  });

  it("raises E_ATTACH_WALL_REF for an unknown wall", () => {
    const { diagnostics } = compile(plan(`door on nope at 50% width 900`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_ATTACH_WALL_REF")).toBe(true);
  });

  it("raises E_ATTACH_POS_RANGE for a percent past 100 or an mm past the wall length", () => {
    expect(
      compile(plan(`door on w1 at 150% width 900`), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_ATTACH_POS_RANGE",
      ),
    ).toBe(true);
    expect(
      compile(plan(`door on w1 at 9000 width 900`), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_ATTACH_POS_RANGE",
      ),
    ).toBe(true);
  });

  it("round-trips the `on … at` clause through the formatter", () => {
    expect(format(plan(`door on w1 at 40% width 900`))).toContain("door on w1 at 40% width 900");
    expect(format(plan(`window on w1 at center width 1200`))).toContain("window on w1 at center width 1200");
    expect(format(plan(`opening on w1 at 1600 width 800`))).toContain("opening on w1 at 1600 width 800");
  });
});

describe("T1b — swing into / hinge near", () => {
  it("`swing into <room>` picks the side toward that room (byte-identical to explicit swing)", () => {
    // Room r is on the +y side of w1 (dir (1,0), left-normal (0,1)) → swing "in".
    expect(doorOf(plan(`door on w1 at 50% width 900 swing into r`)).swing).toBe("in");
    const into = compile(plan(`door on w1 at 50% width 900 swing into r`), { noCache: true });
    const explicit = compile(plan(`door on w1 at 50% width 900 swing in`), { noCache: true });
    expect(into.svg).toBe(explicit.svg);
  });

  it("warns W_SWING_ROOM_NOT_ADJACENT and falls back when the room does not border the wall", () => {
    const src = `plan "P" {
      units mm
      grid 1
      wall id=w1 exterior thickness 200 { (0,0) (4000,0) }
      room id=far at (9000,9000) size 100x100
      door on w1 at 50% width 900 swing into far
    }`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics.some((d) => d.code === "W_SWING_ROOM_NOT_ADJACENT")).toBe(true);
    expect(doorOf(src).swing).toBe("in"); // default
  });

  it("`hinge near start|end` maps to the wall-vertex side (start→left, end→right)", () => {
    expect(doorOf(plan(`door on w1 at 50% width 900 hinge near start`)).hinge).toBe("left");
    expect(doorOf(plan(`door on w1 at 50% width 900 hinge near end`)).hinge).toBe("right");
  });

  it("round-trips swing into / hinge near through the formatter", () => {
    const out = format(plan(`door on w1 at 50% width 900 hinge near end swing into r`));
    expect(out).toContain("hinge near end");
    expect(out).toContain("swing into r");
  });
});
