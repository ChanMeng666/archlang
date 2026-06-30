import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";
import { compile } from "../src/index.js";
import type { RFurniture } from "../src/ir.js";

/**
 * Catalogued default footprints: a wall-anchored fixture may omit `size` and pick up
 * its conventional footprint from the frozen catalog (closed-form, ADR 0005/0006).
 * `at` placement and uncatalogued categories still require an explicit size.
 */

const furnOf = (src: string): RFurniture | undefined =>
  resolve(parse(src).plan!).ir.elements.find((e): e is RFurniture => e.kind === "furniture");

const plan = (furn: string) =>
  `plan "P" {
    units mm grid 50
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Bath" uses bath
    ${furn}
  }`;

describe("catalogued default footprints", () => {
  it("a wall-anchored wc with no size takes the catalog footprint (400×700, oriented to the wall)", () => {
    // Against the left (vertical) wall: along=400 runs vertically, depth=700 into the room.
    const f = furnOf(plan(`furniture wc against wall exterior segment 3 in r`));
    expect(f).toBeDefined();
    expect({ w: f!.size.w, h: f!.size.h }).toEqual({ w: 700, h: 400 });
  });

  it("an explicit size still overrides the catalog footprint", () => {
    const f = furnOf(plan(`furniture wc against wall exterior segment 3 size 500x800 in r`));
    // Wall-relative along=500, depth=800 → plan w=depth, h=along on a vertical wall.
    expect({ w: f!.size.w, h: f!.size.h }).toEqual({ w: 800, h: 500 });
  });

  it("errors when an `at`-placed fixture omits its size (no orientation to apply a footprint)", () => {
    const { diagnostics } = compile(plan(`furniture wc at (1000,1000)`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_FURN_SIZE")).toBe(true);
  });

  it("errors when an uncatalogued category omits its size", () => {
    const { diagnostics } = compile(plan(`furniture desk against wall exterior segment 3 in r`), { noCache: true });
    expect(diagnostics.some((d) => d.code === "E_FURN_SIZE")).toBe(true);
  });
});
