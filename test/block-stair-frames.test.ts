/**
 * A block stair under the whole group D4 (issue #362, card S1). A turn is a real, handed fact, and
 * it comes from geometry a frame carries, never from a glyph: so `place … mirror` must draw the true
 * mirror, flight by flight, and a turn must flip under a reflection and hold under a rotation.
 *
 * For every fixture, both directions and all eight elements g: `entryEdges(gP) = g · entryEdges(P₀)`,
 * every flight's tail is the image of its tail, the pieces are the images of the pieces, and every
 * primitive the stair draws is g applied to P₀'s, compared orientation-free through the oracle's
 * `canonPrim` (the method of `test/vertical-frames.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint } from "../src/index.js";
import type { RStair } from "../src/ir.js";
import { entryEdges, flightsOf, piecesOf, travelVector, verticalsOf } from "../src/vertical.js";
import { canonPrim, D4_ELEMENTS, frameFor, lin, observe, sceneOf, transformPrim, witnessPair } from "./d4-oracle.js";
import { BLOCK_STAIRS, type BlockStair, hallBody, L_STAIR, stairBlock, U_STAIR } from "./block-stair-plans.js";

type Edge = "top" | "right" | "bottom" | "left";
const NORMAL: Record<Edge, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const edgeOf = (v: { x: number; y: number }): Edge =>
  (Object.keys(NORMAL) as Edge[]).find((e) => NORMAL[e].x === v.x && NORMAL[e].y === v.y)!;

const stairOf = (src: string): RStair => verticalsOf(observe(src).ir!)[0] as RStair;

/** Every primitive the stair draws, canonical, sorted; through the frame when one is given. */
const prims = (src: string, f?: ReturnType<typeof frameFor>): string[] =>
  sceneOf(src)
    .nodes.filter((n) => n.elementKind === "stair")
    .map((n) => canonPrim(f ? transformPrim(f, n.prim) : n.prim))
    .sort();

/** Which way the stair turns on leaving its first landing: the sign of the cross product of two
 *  flights' travel, positive clockwise on the sheet. A half-turn or a straight read 0. */
const turnOf = (s: RStair): number => {
  const [a, b] = flightsOf(s);
  const [u, v] = [travelVector(a!), travelVector(b!)];
  return u.x * v.y - u.y * v.x + 0;
};

describe("a block stair under D4: the frame carries every flight", () => {
  for (const s of BLOCK_STAIRS) {
    for (const dir of ["up", "down"] as const) {
      for (const g of D4_ELEMENTS) {
        it(`${s.name} ${dir} × ${g.name}`, () => {
          const f = frameFor(g, 50);
          const { p0, gP } = witnessPair(hallBody(stairBlock(s, dir)), g, { fixedSheet: true });
          const s0 = stairOf(p0);
          const sG = stairOf(gP);
          expect(sG.flights!.map((x) => x.tail)).toEqual(
            s0.flights!.map((x) => edgeOf(lin(f, NORMAL[x.tail as Edge]))),
          );
          expect(entryEdges(sG)).toEqual(entryEdges(s0).map((e) => edgeOf(lin(f, NORMAL[e]))));
          expect(piecesOf(sG).length).toBe(s.pieces.length);
          // The outline of every piece is among these, so the pieces are the images of the pieces.
          const expected = prims(p0, f);
          expect(expected.length).toBeGreaterThan(8);
          expect(prims(gP)).toEqual(expected);
        });
      }
    }
  }
});

describe("a turn is a fact of the carried geometry", () => {
  const turn = (name: string): number => {
    const g = D4_ELEMENTS.find((x) => x.name === name)!;
    return turnOf(stairOf(witnessPair(hallBody(stairBlock(L_STAIR)), g).gP));
  };

  it("a rotation keeps the sense of an L, a reflection flips it", () => {
    const base = turnOf(stairOf(witnessPair(hallBody(stairBlock(L_STAIR)), D4_ELEMENTS[0]!).p0));
    expect(Math.abs(base)).toBe(1);
    for (const g of D4_ELEMENTS) {
      expect(turn(g.name), g.name).toBe(g.mirror ? -base : base);
    }
  });

  it("a half-turn has no sense to flip", () => {
    for (const g of D4_ELEMENTS) {
      expect(turnOf(stairOf(witnessPair(hallBody(stairBlock(U_STAIR)), g).gP)), g.name).toBe(0);
    }
  });

  it("a nested place composes back: mirror of a mirror is the stair", () => {
    const flat = `plan "p" {
  units mm
  component c() {
${stairBlock(L_STAIR)}
  }
  component d() {
    place c() as a at (0,0) mirror x
  }
  place d() as b at (0,0) mirror x
}
`;
    const s = verticalsOf(observe(flat).ir!)[0] as RStair;
    expect(s._mirror).toBeUndefined();
    expect(s.flights!.map((f) => f.tail)).toEqual(L_STAIR.tails);
  });

  it("the plan lints the same under every frame: the stair rules read the carried pieces", () => {
    const body = hallBody(stairBlock(L_STAIR));
    const ofId = (src: string): string[] =>
      lint(src)
        .map((d) => d.code ?? "")
        .filter((c) => c.startsWith("W_STAIR") || c === "W_SWING_OVER_STAIR" || c === "W_FURNITURE_ON_STAIR")
        .sort();
    const id = ofId(witnessPair(body, D4_ELEMENTS[0]!).p0);
    for (const g of D4_ELEMENTS) expect(ofId(witnessPair(body, g).gP), g.name).toEqual(id);
  });

  it("symmetry reads the pieces: two stairs are mirror images only if every piece is", () => {
    const pair = (right: BlockStair): string => `plan "Pair" {
  units mm
  room id=r at (0,0) size 6000x5000
  component a() {
${stairBlock(U_STAIR)}
  }
  component b() {
${stairBlock(right)}
  }
  place a() as left at (0,0)
  place b() as right at (6000,0) mirror x
}
`;
    const full = (src: string) => describePlan(src, { facts: ["symmetry"] }).symmetry!.layers.full!;
    expect(full(pair(U_STAIR))).toMatchObject({ group: "D1", axis: "x" });
    // Its third piece grows 100 mm west into the well: the same box, boarded the same way, in a
    // frame with the same hand. Only the pieces differ.
    const grown: BlockStair = {
      ...U_STAIR,
      pieces: [U_STAIR.pieces[0]!, U_STAIR.pieces[1]!, [1600, 2000, 1100, 2000]],
    };
    const [a, b] = verticalsOf(observe(pair(grown)).ir!) as RStair[];
    expect(b!.size).toEqual(a!.size);
    expect(entryEdges(b!)).toEqual(entryEdges(a!));
    expect(full(pair(grown)).group).toBe("C1");
  });

  it("a U on the axis of a square hall is no mirror image of itself", () => {
    const bare = (run: string): string => `plan "Sym" {\n  units mm\n  room id=r at (0,0) size 6000x6000\n${run}\n}\n`;
    const full = (src: string) => describePlan(src, { facts: ["symmetry"] }).symmetry!.layers.full!.group;
    // The box stands centred in the room, which keeps both mirrors; the two flights travel
    // opposite ways, and the landing is at one end, so the stair keeps none of them.
    const u = bare(`  stair id=s dir up width 1000 {
    flight at (1900,3000) size 1000x2000
    landing at (1900,1000) size 2200x2000
    flight at (3100,3000) size 1000x2000
  }`);
    const box = bare("  column at (1900,1000) size 2200x4000");
    expect(full(box)).toBe("D2");
    expect(full(u)).toBe("C1");
  });
});
