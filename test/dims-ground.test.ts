import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import type { SceneNode } from "../src/scene.js";
import { CHAIN_BASE, CHAIN_STEP, SHEET_MM } from "../src/sheet.js";

/**
 * `dims auto` chains vs. `outdoor` ground (backlog 4.8).
 *
 * The law, in both directions:
 *
 * 1. A facade with ground beyond it pushes THAT facade's chains past the ground, so the
 *    dimension line lands in clear paper rather than on the terrace.
 * 2. A facade with no ground beyond it keeps the EXACT pre-4.8 offset — spelled out here
 *    as `outer + dimFont · (CHAIN_BASE + slot · CHAIN_STEP)` rather than as a magic
 *    number, so the second half is a statement about the formula and not about a digest.
 *    That is what protects the 29 shipped examples that declare no `outdoor` (the
 *    committed-SVG drift gate re-renders them; this pins the arithmetic behind it).
 */

/**
 * Every plan here declares `paper`+`scale`, so `dimFont` is `SHEET_MM.dimText × denom`
 * and does NOT move when a surface changes the drawing extent. Without a sheet the font
 * is derived from the drawing span, and adding a lawn would change the very offset the
 * assertion is measuring — the control and the case would no longer differ by one thing.
 */
const DENOM = 100;
const DIM_FONT = SHEET_MM.dimText * DENOM; // 250 plan mm
const slotOffset = (slot: number): number => DIM_FONT * (CHAIN_BASE + slot * CHAIN_STEP);

/** A 6000×4000 room in a 200 shell → the bottom facade's OUTER face sits at y = 4100. */
const BOTTOM_OUTER = 4100;

const plan = (body: string, mode = "overall"): string =>
  `plan "P" {
  units mm
  paper A2 landscape
  scale 1:${DENOM}
  dims auto ${mode}
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room" uses living
${body}}
`;

const isLine = (
  n: SceneNode,
): n is SceneNode & { prim: { t: "line"; a: { x: number; y: number }; b: { x: number; y: number } } } =>
  n.prim.t === "line";

/**
 * The y of every BOTTOM chain baseline: a horizontal line on the `dims` pass that spans
 * more than the building itself, i.e. the chain rather than one of its ticks. One entry
 * per slot, ascending.
 */
function bottomChainYs(src: string): number[] {
  const scene = compile(src, { noCache: true }).scene;
  if (!scene) throw new Error("no scene");
  const ys = scene.nodes
    .filter((n) => n.layer === "dims")
    .filter(isLine)
    .filter((n) => n.prim.a.y === n.prim.b.y && Math.abs(n.prim.b.x - n.prim.a.x) > 1000 && n.prim.a.y > BOTTOM_OUTER)
    .map((n) => n.prim.a.y);
  return [...new Set(ys)].sort((p, q) => p - q);
}

describe("`dims auto` chains clear the ground attached to the facade they measure (backlog 4.8)", () => {
  it("no `outdoor` at all → the chain sits at exactly the pre-4.8 offset", () => {
    expect(bottomChainYs(plan(""))).toEqual([BOTTOM_OUTER + slotOffset(2)]);
  });

  it("a surface beyond the facade pushes the chain exactly past its far edge", () => {
    // A 3000-deep patio from y=4200 to y=7200, spanning the whole facade.
    const ys = bottomChainYs(plan(`  outdoor id=g patio at (0,4200) size 6000x3000\n`));
    expect(ys).toEqual([7200 + slotOffset(2)]);
    // Stated the other way round: the standoff is exactly how far the ground reaches
    // past the wall face, and the chain's own offset is unchanged on top of it.
    expect(ys[0]! - (BOTTOM_OUTER + slotOffset(2))).toBe(7200 - BOTTOM_OUTER);
  });

  it("the chain clears EVERY surface in the span, not just the one abutting the facade", () => {
    // A patio against the wall and a lawn beyond it with a gap between. Pushing only past
    // the abutting surface would move the chain off the patio and onto the lawn — which is
    // what `garden-house` does, and why the rule takes the maximum rather than the nearest.
    const src = plan(
      `  outdoor id=g1 patio at (0,4200) size 6000x2000\n` + `  outdoor id=g2 lawn at (0,7000) size 6000x3000\n`,
    );
    expect(bottomChainYs(src)).toEqual([10000 + slotOffset(2)]);
  });

  it("ground OUTSIDE the measured along-span does not move the chain", () => {
    // The bottom chain measures x ∈ [-100, 6100]; this lawn starts at x = 8000.
    expect(bottomChainYs(plan(`  outdoor id=g lawn at (8000,4200) size 4000x3000\n`))).toEqual([
      BOTTOM_OUTER + slotOffset(2),
    ]);
  });

  it("ground INBOARD of the facade does not move the chain", () => {
    // A courtyard surface inside the footprint is not something the chain crosses.
    expect(bottomChainYs(plan(`  outdoor id=g paving at (1000,1000) size 2000x1000\n`))).toEqual([
      BOTTOM_OUTER + slotOffset(2),
    ]);
  });

  it("reads a POLYGON surface's reach off its ring clipped to the span, not off its bbox", () => {
    // An L whose deep leg lies entirely outside the measured span (x ≥ 7000): within
    // x ∈ [-100, 6100] it reaches only y = 5200, while its bounding box reaches 9200.
    const src = plan(
      `  outdoor id=g paving polygon (0,4200) (9000,4200) (9000,9200) (7000,9200) (7000,5200) (0,5200)\n`,
    );
    const ys = bottomChainYs(src);
    expect(ys).toEqual([5200 + slotOffset(2)]);
    expect(ys[0]!, "a bbox-derived reach would push the chain 4000 mm further out").not.toBe(9200 + slotOffset(2));
  });

  it("moves the WHOLE stack by one standoff, keeping the slots' CHAIN_STEP spacing", () => {
    // `dims auto all` puts openings/axis/overall on slots 0/1/2. All three must translate
    // together — reflowing them independently would leave the inner chains on the ground.
    // The shell runs (0,0)→(6000,0)→(6000,4000)→(0,4000)→close, so the BOTTOM facade is
    // the run from 10000 to 16000 along the wall — an opening anywhere else gives that
    // facade no openings chain and only two of the three slots appear.
    const body = `  door id=d on shell at 13000 width 900 swing into r\n`;
    const clear = bottomChainYs(plan(body, "all"));
    const grounded = bottomChainYs(plan(`${body}  outdoor id=g deck at (0,4200) size 6000x2000\n`, "all"));
    expect(clear).toHaveLength(3);
    expect(grounded).toHaveLength(3);
    const stand = 6200 - BOTTOM_OUTER;
    expect(grounded).toEqual(clear.map((y) => y + stand));
    // …and the spacing between adjacent slots is untouched on both.
    for (const ys of [clear, grounded]) {
      expect(ys[1]! - ys[0]!).toBeCloseTo(CHAIN_STEP * DIM_FONT, 6);
      expect(ys[2]! - ys[1]!).toBeCloseTo(CHAIN_STEP * DIM_FONT, 6);
    }
  });

  it("is per-FACADE: ground on one side leaves the other side's chain where it was", () => {
    const src = plan(`  outdoor id=g patio at (0,4200) size 6000x3000\n`);
    const scene = compile(src, { noCache: true }).scene!;
    // The LEFT chain is the vertical one; its outer face is x = -100 and it faces −x.
    const leftXs = scene.nodes
      .filter((n) => n.layer === "dims")
      .filter(isLine)
      .filter((n) => n.prim.a.x === n.prim.b.x && Math.abs(n.prim.b.y - n.prim.a.y) > 1000 && n.prim.a.x < -100)
      .map((n) => n.prim.a.x);
    expect([...new Set(leftXs)]).toEqual([-100 - slotOffset(2)]);
  });

  it("`garden-house` is the shipped case: both storeys' bottom chains clear their ground", () => {
    // L1's terrace-and-garden band reaches y = 21700 (the south planting bed) and L2's
    // balcony y = 15500; both facades' outer face is y = 13650.
    const src = `plan "G" {
  units mm
  paper A2 landscape
  scale 1:100
  dims auto overall
  level 1 {
    wall id=s exterior thickness 300 { (2500,4500) (14000,4500) (14000,13500) (2500,13500) close }
    room id=r at (2500,4500) size 11500x9000 label "R" uses living
    outdoor id=g1 patio at (2600,13700) size 4300x3300
    outdoor id=g2 planting at (2600,21100) size 11000x600
  }
  level 2 {
    wall id=s exterior thickness 300 { (2500,4500) (14000,4500) (14000,13500) (2500,13500) close }
    room id=r at (2500,4500) size 11500x9000 label "R" uses living
    outdoor id=g3 balcony at (9300,13700) size 4200x1800
  }
}
`;
    // `compile()` takes no `level` option — a multi-storey plan comes back in `pages[]`,
    // and the top-level `scene` is `pages[0]`. Reading it per storey any other way
    // silently measures the ground floor twice.
    const pages = compile(src, { noCache: true }).pages;
    expect(pages?.map((p) => p.level)).toEqual([1, 2]);
    // The facade outer face is y = 13650 on both storeys; only the chain BASELINE is
    // taken (a long horizontal line outboard of it) — the LEFT chain's witness lines are
    // also long and horizontal, and sit AT 13650, not past it.
    const chainY = (level: number): number =>
      Math.max(
        ...pages!
          .find((p) => p.level === level)!
          .scene.nodes.filter((n) => n.layer === "dims")
          .filter(isLine)
          .filter((n) => n.prim.a.y === n.prim.b.y && Math.abs(n.prim.b.x - n.prim.a.x) > 1000 && n.prim.a.y > 13650)
          .map((n) => n.prim.a.y),
      );
    expect(chainY(1)).toBe(21700 + slotOffset(2));
    expect(chainY(2)).toBe(15500 + slotOffset(2));
  });
});
