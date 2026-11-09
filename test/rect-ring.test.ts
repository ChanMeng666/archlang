/** rectRing: the one rectangle ring that rectPoly, boxRing, corners and rectPolygon delegate to. */

import { describe, expect, it } from "vitest";
import { rectRing } from "../src/geometry/polygon.js";
import { rectCorners } from "../src/geometry.js";
import { rectPoly as glyphRectPoly } from "../src/elements/glyph-lib.js";
import { rectPoly as relationRectPoly } from "../src/furniture-relation.js";
import { boxRing } from "../src/analyze/symmetry.js";
import { rectPolygon } from "../src/plan-json/to-json.js";

/** `rectRing` is the one rectangle ring: clockwise from the top-left (TL, TR, BR, BL). The
 *  deprecated `rectPoly` aliases and the helpers that now delegate to it must equal a HAND-WRITTEN
 *  ring exactly, not a re-run of the same formula. */
const VALUES = [-1234.5, -10, -0.25, 0, 0.1, 3, 17.75, 4000];

describe("rectRing and every helper that delegates to it", () => {
  it("equals the hand-written four-corner ring over a grid incl. negative and zero sizes", () => {
    let n = 0;
    for (const x of VALUES)
      for (const y of VALUES)
        for (const w of VALUES)
          for (const h of VALUES) {
            const want = [
              { x, y },
              { x: x + w, y },
              { x: x + w, y: y + h },
              { x, y: y + h },
            ];
            expect(rectRing({ x, y, w, h })).toEqual(want);
            expect(glyphRectPoly({ x, y, w, h })).toEqual(want);
            expect(relationRectPoly({ x, y, w, h })).toEqual(want);
            expect(rectCorners(x, y, w, h)).toEqual(want);
            expect(boxRing({ x, y }, { w, h })).toEqual(want);
            expect(rectPolygon(x, y, w, h)).toEqual(want);
            n++;
          }
    expect(n).toBe(VALUES.length ** 4);
  });
});
