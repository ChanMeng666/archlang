import { describe, expect, it } from "vitest";
import { rectRing } from "../src/geometry/polygon.js";
import { rectPoly as glyphRectPoly } from "../src/elements/glyph-lib.js";
import { rectPoly as relationRectPoly } from "../src/furniture-relation.js";

/** `rectRing` is the one rectangle ring: clockwise from the top-left (TL, TR, BR, BL). The two
 *  deprecated `rectPoly` aliases and the retired inline literals must equal it exactly. */
const VALUES = [-1234.5, -10, -0.25, 0, 0.1, 3, 17.75, 4000];
const literal = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

describe("rectRing and its deprecated aliases", () => {
  it("equals the original four-corner literal over a grid incl. negative and zero sizes", () => {
    let n = 0;
    for (const x of VALUES)
      for (const y of VALUES)
        for (const w of VALUES)
          for (const h of VALUES) {
            const want = literal(x, y, w, h);
            expect(rectRing({ x, y, w, h })).toEqual(want);
            expect(glyphRectPoly({ x, y, w, h })).toEqual(want);
            expect(relationRectPoly({ x, y, w, h })).toEqual(want);
            n++;
          }
    expect(n).toBe(VALUES.length ** 4);
  });
});
