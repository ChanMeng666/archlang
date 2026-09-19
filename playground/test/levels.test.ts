import { describe, expect, it } from "vitest";
import { type LevelPage, levelButtonLabel, levelButtonTitle, levelFileName, selectPage } from "../src/levels.js";

/**
 * The storey switcher's arithmetic (`playground/src/levels.ts`).
 *
 * The rules that matter are the ones a browser makes expensive to check: what happens
 * when the selected storey stops existing under you, and that a SINGLE-storey plan takes
 * exactly the path it always took — `compile()` omits `pages` for it, and every decision
 * here must fall through to "no storey at all" rather than inventing level 1.
 */

const p = (level: number, name?: string): LevelPage => (name === undefined ? { level } : { level, name });
const THREE: LevelPage[] = [p(1, "Ground floor"), p(2, "First floor"), p(3, "Second floor")];

describe("selectPage", () => {
  it("returns undefined for a single-storey plan (no `pages` key at all)", () => {
    expect(selectPage(undefined, null)).toBeUndefined();
    // Even with a stale selection left over from the plan before it.
    expect(selectPage(undefined, 3)).toBeUndefined();
    // An empty array is treated the same way — there is no storey to show.
    expect(selectPage([], null)).toBeUndefined();
  });

  it("defaults to the LOWEST storey when nothing is selected", () => {
    expect(selectPage(THREE, null)).toBe(THREE[0]);
  });

  it("returns the selected storey", () => {
    expect(selectPage(THREE, 3)).toBe(THREE[2]);
  });

  it("falls back to the lowest storey when the selected one no longer exists", () => {
    // The live case: level 3 is selected and the source is edited down to two storeys.
    expect(selectPage(THREE.slice(0, 2), 3)).toBe(THREE[0]);
  });

  it("reads the LEVEL NUMBER, never the array index — a basement is level -1", () => {
    const withBasement = [p(-1, "Cellar"), p(0), p(1)];
    expect(selectPage(withBasement, -1)).toBe(withBasement[0]);
    expect(selectPage(withBasement, 0)).toBe(withBasement[1]);
    // `0` is a legal storey number and must not be read as "nothing selected".
    expect(selectPage(withBasement, 0)?.level).toBe(0);
  });
});

describe("the storey button's two labels", () => {
  it("the face is the number alone, so the toolbar stays compact", () => {
    expect(levelButtonLabel(p(1, "Ground floor"))).toBe("L1");
    expect(levelButtonLabel(p(-1))).toBe("L-1");
  });

  it("the title quotes the storey the way the source declares it", () => {
    expect(levelButtonTitle(p(1, "Ground floor"))).toBe('level 1 "Ground floor"');
  });

  it("an unnamed storey gets no empty quotes", () => {
    expect(levelButtonTitle(p(2))).toBe("level 2");
  });
});

describe("levelFileName", () => {
  it("leaves the name untouched when no storey is selected", () => {
    // The single-storey path: every existing download keeps its exact name.
    expect(levelFileName("floorplan.svg", null)).toBe("floorplan.svg");
  });

  it("inserts `.L<n>` before the extension", () => {
    expect(levelFileName("floorplan.svg", 3)).toBe("floorplan.L3.svg");
    expect(levelFileName("floorplan.pdf", 1)).toBe("floorplan.L1.pdf");
  });

  it("handles a basement and a ground storey", () => {
    expect(levelFileName("floorplan.dxf", -1)).toBe("floorplan.L-1.dxf");
    expect(levelFileName("floorplan.txt", 0)).toBe("floorplan.L0.txt");
  });

  it("appends when there is no extension to insert before", () => {
    expect(levelFileName("floorplan", 2)).toBe("floorplan.L2");
  });
});
