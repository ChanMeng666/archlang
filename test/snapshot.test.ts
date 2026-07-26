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
});
