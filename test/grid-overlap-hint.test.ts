/**
 * `W_ROOM_OVERLAP` names the grid when the grid can be the cause (issue #405).
 *
 * The issue's plan: room `a` ends at 3336 in the source, where `b` starts, and `grid 5` rounds the two
 * apart by one step. The overlap was never silent. What it did not say is where it came from.
 */

import { describe as suite, expect, it } from "vitest";
import { compile } from "../src/index.js";

const overlap = (src: string) => compile(src).diagnostics.find((d) => d.code === "W_ROOM_OVERLAP");
const plan = (grid: string, body: string): string => `plan "G" {\n  units mm\n${grid}\n${body}\n}\n`;

const ISSUE = plan(
  "  grid 5",
  "  room id=a at (3,0) size 3333x3000 uses living\n  room id=b at (3336,0) size 2000x3000 uses bedroom",
);

suite("the overlap says the grid can be the cause", () => {
  it("on the issue's plan, whose rooms touch in the source", () => {
    const d = overlap(ISSUE);
    expect(d?.hints).toHaveLength(1);
    expect(d?.hints?.[0]).toContain(
      "This overlap may be the grid's: `grid 5` rounds every coordinate and size on its own",
    );
  });

  it("keeps the message, and quotes no id", () => {
    const d = overlap(ISSUE);
    expect(d?.message).toBe("The living room and the bedroom overlap");
    expect(d?.hints?.[0]).not.toMatch(/"[ab]"/);
  });

  it("on rooms a whole step deep, the most rounding can make", () => {
    const src = plan(
      "  grid 100",
      "  room id=a at (0,0) size 3000x3000 uses living\n  room id=b at (2900,0) size 3000x3000 uses bedroom",
    );
    expect(overlap(src)?.hints).toHaveLength(1);
  });

  it("not on rooms deeper than a step: rounding cannot do that", () => {
    const src = plan(
      "  grid 100",
      "  room id=a at (0,0) size 3000x3000 uses living\n  room id=b at (2800,0) size 3000x3000 uses bedroom",
    );
    expect(overlap(src)).toBeDefined();
    expect(overlap(src)?.hints).toBeUndefined();
  });

  it("not without a grid, and not on a polygon room", () => {
    const none = plan(
      "",
      "  room id=a at (0,0) size 3000x3000 uses living\n  room id=b at (2995,0) size 3000x3000 uses bedroom",
    );
    expect(overlap(none)?.hints).toBeUndefined();
    const poly = plan(
      "  grid 100",
      "  room id=a polygon (0,0) (3000,0) (3000,3000) (0,3000) uses living\n  room id=b at (2900,0) size 3000x3000 uses bedroom",
    );
    expect(overlap(poly)).toBeDefined();
    expect(overlap(poly)?.hints).toBeUndefined();
  });
});
