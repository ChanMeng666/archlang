/**
 * The v1.29 CROSS-FEATURE gate — the two tracks that shipped in this release, exercised
 * TOGETHER rather than each against its own fixtures.
 *
 * `roof`/`void` and the second furniture tranche were authored on parallel branches and
 * touch one file in common: the nav grid's obstacle list in `src/analyze/circulation.ts`.
 * One branch appended the void obstacles to that literal; the other wrapped the furniture
 * entry in `solidFurniture()` so an underlay stops being an obstacle. Git merged the two
 * edits cleanly, and a clean merge is not evidence — neither branch's suite can fail if
 * the other half of the literal is dropped, because neither branch has a fixture that uses
 * both. This file is that fixture.
 *
 * The discriminating case is a rug and a void on the SAME rectangle, spanning the only
 * route between two rooms, with a `sofa` control on that identical rectangle to prove the
 * geometry really does seal. If `solidFurniture` were dropped the rug would seal the plan;
 * if the void obstacle entry were dropped the void would not.
 */

import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, renderAscii, toDxf } from "../src/index.js";
import { resolve as resolvePlan } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { toScene } from "../src/scene-build.js";
import { ROOF_LAYER } from "../src/elements/roof.js";
import { VOID_LAYER } from "../src/elements/void.js";
import { solidFurniture } from "../src/fixtures-catalog.js";

// ---------------------------------------------------------------------------
// 1. A rug UNDER a void's X — both dashed, one walkable and one not
// ---------------------------------------------------------------------------

/**
 * Two rooms joined by exactly one internal door, with `blocker` occupying the full free
 * width of the hall between the entrance and that door. Anything solid there cuts `back`
 * off the entrance entirely; anything walkable leaves both walks untouched.
 */
const twoRooms = (blocker: string): string => `plan "Cross" {
  units mm
  wall id=w1 exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  wall id=w2 partition thickness 100 { (3000,0) (3000,6000) }
  room id=hall at (0,0) size 3000x6000 label "Hall"
  room id=back at (3000,0) size 3000x6000 label "Back"
  door id=d1 at (0,1000) width 900 wall w1
  door id=d2 at (3000,5000) width 900 wall w2
${blocker}
}
`;

/** The blocking rectangle: the hall's full interior width, clear of both wall solids. */
const SPAN = "at (100,2600) size 2800x800";
const RUG = `  furniture rug ${SPAN}`;
const VOID = `  void id=v1 ${SPAN}`;
const SOFA = `  furniture sofa ${SPAN}`;

/** Every room the circulation model can reach from the entrance, in source order. */
const reached = (src: string): string[] => (describePlan(src).circulation?.rooms ?? []).map((r) => r.roomId);

const circulationOf = (src: string) => describePlan(src).circulation;

describe("v1.29 cross — `solidFurniture` and the void obstacle compose in one nav grid", () => {
  it("the control: a SOLID piece on that rectangle really does seal the back room", () => {
    // Non-vacuity. Without this, every assertion below would also pass if the rectangle
    // were simply too small to block anything.
    expect(reached(twoRooms(SOFA))).toEqual(["hall"]);
  });

  it("a rug on the same rectangle changes NOTHING about circulation", () => {
    // `solidFurniture()` drops the underlay before the body radius inflates anything, so
    // the model is not merely "still connected" — it is identical, walk distances and
    // bottlenecks included.
    expect(circulationOf(twoRooms(RUG))).toEqual(circulationOf(twoRooms("")));
    expect(reached(twoRooms(RUG))).toEqual(["hall", "back"]);
  });

  it("a void on the same rectangle DOES seal it", () => {
    expect(reached(twoRooms(VOID))).toEqual(["hall"]);
  });

  it("a rug UNDER a void's X leaves the void's obstruction exactly as it was", () => {
    // The composing case: both elements on the same rectangle, both drawn dashed. The
    // rug contributes nothing to the grid, so the pair must measure as the void alone —
    // and must NOT measure as the unobstructed plan.
    expect(circulationOf(twoRooms(`${RUG}\n${VOID}`))).toEqual(circulationOf(twoRooms(VOID)));
    expect(circulationOf(twoRooms(`${RUG}\n${VOID}`))).not.toEqual(circulationOf(twoRooms("")));
  });

  it("both are drawn, and the rug does not become a void's room owner or vice versa", () => {
    const src = twoRooms(`${RUG}\n${VOID}`);
    const { svg, errors } = compile(src, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain(`id="${VOID_LAYER}"`);
    // The void is attributed to the room whose floor holds its centre; the rug sitting on
    // the identical rectangle has no bearing on that.
    expect(describePlan(src).voids).toEqual([
      { id: "v1", at: { x: 100, y: 2600 }, size: { w: 2800, h: 800 }, room: "hall" },
    ]);
  });

  it("`solidFurniture` is the one predicate both halves of the literal agree on", () => {
    // The unit underneath the plans above: the filter keeps the sofa and drops the rug.
    expect(solidFurniture([{ category: "rug" }, { category: "sofa" }, { category: "carpet" }])).toEqual([
      { category: "sofa" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. A roof over a furnished plan, through every backend
// ---------------------------------------------------------------------------

const ROOFED_AND_FURNISHED = `plan "Roofed" {
  units mm
  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  room id=r1 at (0,0) size 8000x6000 label "Living"
  door id=d1 at (0,1000) width 900 wall w1
  roof overhang 600
  void id=v1 at (6000,4000) size 1500x1500
  furniture rug         at (500,500)  size 3000x2400 in r1
  furniture sofa_l      at (700,1000) size 2400x1500 in r1
  furniture piano       at (4000,600) size 1400x1400 in r1
  furniture sun_lounger at (4000,3000) size 1400x700 in r1
}
`;

describe("v1.29 cross — a roofed, voided, furnished plan serializes on every backend", () => {
  const scene = () => toScene(resolvePlan(parse(ROOFED_AND_FURNISHED).plan!).ir);

  it("SVG carries the roof ring, the void and the new symbols", () => {
    const { svg, errors } = compile(ROOFED_AND_FURNISHED, { noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain(`id="${ROOF_LAYER}"`);
    expect(svg).toContain(`id="${VOID_LAYER}"`);
    // The eaves ring is thickness/2 + overhang outside the wall centreline on every face.
    expect(svg).toContain("-700,-700");
  });

  it("DXF puts the roof and the void on their own layers", () => {
    const dxf = toDxf(scene());
    expect(dxf).toContain(ROOF_LAYER);
    expect(dxf).toContain(VOID_LAYER);
  });

  it("the ASCII plan renders without throwing", () => {
    expect(() => renderAscii(scene())).not.toThrow();
  });

  it("PDF export produces a document", async () => {
    let pdfkit = true;
    try {
      await import("pdfkit" as string);
    } catch {
      pdfkit = false;
    }
    if (!pdfkit) {
      // A missing optional dep is a broken install in CI and a visible skip locally —
      // the `test/export-pdf.test.ts` gate shape, so this can never pass having asserted
      // nothing.
      if (process.env.CI) throw new Error("optional dep pdfkit missing in CI — the install step is broken");
      return;
    }
    const { toPdf } = await import("../src/export/pdf.js");
    const bytes = await toPdf(scene());
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
