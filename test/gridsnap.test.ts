import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

/**
 * Grid snapping (src/ir.ts): snap(v) = grid > 0 ? Math.round(v / grid) * grid : v.
 * JS `Math.round` rounds halves toward +∞ (NOT away from zero), so .5 boundaries
 * are direction-sensitive — these tests pin that behavior down, plus the
 * grid-0 passthrough.
 */
function roomAt(src: string): { x: number; y: number } {
  const { plan } = parse(src);
  const { ir, diagnostics } = resolve(plan!);
  expect(diagnostics).toEqual([]);
  const room = ir.elements.find((e) => e.kind === "room") as { at: { x: number; y: number } };
  return room.at;
}

const at = (grid: number, x: number, y: number) =>
  `plan "G" { grid ${grid} room id=r at (${x},${y}) size 1000x1000 label "R" }`;

describe("grid-snap rounding", () => {
  it("rounds a positive half up (toward +∞)", () => {
    expect(roomAt(at(100, 50, 150))).toEqual({ x: 100, y: 200 }); // 0.5→1, 1.5→2
    expect(roomAt(at(100, 250, 350))).toEqual({ x: 300, y: 400 }); // 2.5→3, 3.5→4
  });

  it("rounds down below the half", () => {
    expect(roomAt(at(100, 149, 101))).toEqual({ x: 100, y: 100 });
  });

  it("rounds a negative half toward +∞ (Math.round semantics)", () => {
    // -1.5 → -1 → -100 ; -2.5 → -2 → -200
    expect(roomAt(at(100, -150, -250))).toEqual({ x: -100, y: -200 });
  });

  it("snaps exact multiples to themselves", () => {
    expect(roomAt(at(50, 2000, 3000))).toEqual({ x: 2000, y: 3000 });
  });

  it("does not snap when grid is 0 (passthrough)", () => {
    expect(roomAt(at(0, 123, 77))).toEqual({ x: 123, y: 77 });
  });
});
