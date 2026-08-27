import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, makeVirtualWorld } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/**
 * Golden-SVG guards: any change to rendered output for the shipped examples
 * must be intentional (review the snapshot diff, then `vitest -u`).
 */
describe("golden SVG snapshots", () => {
  for (const name of [
    "studio.arch",
    "two-bed.arch",
    "parametric.arch",
    "themed.arch",
    "relational.arch",
    "attached.arch",
    "museum.arch",
    "museum-wing.arch",
    // v1.23: the polygon-room flagship — an L and a trapezoid, an angled facade, and
    // `dims auto` measured off vertex coordinates rather than room rectangles.
    "gallery-l.arch",
    // v1.25: the orientation-and-openings example. `site` draws nothing, so this
    // snapshot pins the half that DOES reach the SVG — the sliding/pocket/bifold panel
    // geometry, and the absence of a swing arc on all three.
    "bungalow.arch",
    // v1.27 showcase — the twelve examples added when the gallery was redrawn. Each is
    // here because it is the only shipped plan that exercises some part of the pipeline:
    // laneway-house resolves EVERY position (no `at (x,y)` on an opening or a fixture),
    // one-room is the minimum that renders, courtyard-house is the outward-face case a
    // bounding box answers backwards, hexagon-pavilion is oblique mitres that are not the
    // polygon flagship, library/transit-hall/clinic are sheet drawings with margin
    // tables, materials is the only user of `style <kind> { … }`, and terrace-row is a
    // `for`-generated run of four units.
    "laneway-house.arch",
    "one-room.arch",
    "tiny-house.arch",
    "garden-loft.arch",
    "courtyard-house.arch",
    "hexagon-pavilion.arch",
    "library.arch",
    "transit-hall.arch",
    "clinic.arch",
    "materials.arch",
    "terrace-row.arch",
    // v1.28: the furniture flagship — twenty-six of the thirty-two catalogued kinds in
    // one plan, so this is the golden where a drawn symbol's geometry, its derived
    // quarter-turn or the `against wall` footprint default would show up as a string
    // diff. No other shipped example draws more than a handful.
    "furnished-flat.arch",
  ]) {
    it(`renders ${name} deterministically`, () => {
      const { svg, errors } = compile(example(name), { noCache: true });
      expect(errors).toEqual([]);
      expect(svg).toMatchSnapshot();
    });
  }

  // Component v2: the composed building. Its SVG is one wing serialized twice, the second
  // time mirrored, so this golden is where an id-namespacing or transform drift would show
  // up as a string diff. It needs a World, hence its own case.
  it("renders museum-wings.arch (two placed instances) deterministically", () => {
    const world = makeVirtualWorld({ "museum-wing.arch": example("museum-wing.arch") });
    const { svg, errors } = compile(example("museum-wings.arch"), { world, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toMatchSnapshot();
  });

  // A multi-storey plan is one drawing PER LEVEL, so every page needs its own golden —
  // `svg` alone would only ever pin page 1 and an upper storey could drift unnoticed.
  it("renders two-storey.arch as one page per level", () => {
    const { svg, pages, errors } = compile(example("two-storey.arch"), { noCache: true });
    expect(errors).toEqual([]);
    expect(pages?.map((p) => [p.level, p.name])).toEqual([
      [1, "Ground floor"],
      [2, "First floor"],
    ]);
    // `svg` is page 1 (the lowest level) — the level-unaware view of the same drawing.
    expect(svg).toBe(pages![0]!.svg);
    for (const p of pages!) expect(p.svg).toMatchSnapshot(`two-storey.arch L${p.level}`);
  });

  // The second multi-storey plan, and the first with three levels — so it is the only
  // snapshot that pins a MIDDLE storey, where a per-level fault has a page above and
  // below it to hide between.
  it("renders townhouse.arch as one page per level", () => {
    const { svg, pages, errors } = compile(example("townhouse.arch"), { noCache: true });
    expect(errors).toEqual([]);
    expect(pages?.map((p) => p.level)).toEqual([1, 2, 3]);
    expect(svg).toBe(pages![0]!.svg);
    for (const p of pages!) expect(p.svg).toMatchSnapshot(`townhouse.arch L${p.level}`);
  });

  // v1.29 gallery refresh: the SHOWPIECE flagship — every surface of the language on one
  // A2 sheet, across two levels. This is where a roof/void/arc/mirrored-component
  // interaction would show up as a string diff; the other multi-level goldens above don't
  // combine those with `site`, curves or `place … mirror`.
  it("renders hillside-villa.arch as one page per level", () => {
    const { svg, pages, errors } = compile(example("hillside-villa.arch"), { noCache: true });
    expect(errors).toEqual([]);
    expect(pages?.map((p) => [p.level, p.name])).toEqual([
      [1, "Ground floor"],
      [2, "Upper floor"],
    ]);
    expect(svg).toBe(pages![0]!.svg);
    for (const p of pages!) expect(p.svg).toMatchSnapshot(`hillside-villa.arch L${p.level}`);
  });
});
