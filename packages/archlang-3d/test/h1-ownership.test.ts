/**
 * H1, ported from the archlang-3d spike (`spike/src/h1_wall_ownership.mts`, `h1_prism_check.mts`;
 * evidence in `docs/plans/archlang-3d/research/02-wall-geometry.md`): the core's joinery hands back
 * one owned region per wall, the regions tile the joined solid, a wall may own several connected
 * pieces, every opening's cut lands on a piece, and a mixed-height joint is reported where the
 * lower wall owns it.
 */
import { resolvePlan } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import {
  inRing,
  mixedHeightJoints,
  type Ownership,
  type Point,
  signedArea,
  wallOwnership,
} from "../src/walls/ownership.js";
import { EXAMPLES_LIST, STRESS_PLANS, WORLD } from "./corpus.js";

function storeys(source: string) {
  const r = resolvePlan(source, { world: WORLD });
  if (!r.ir) throw new Error("plan must resolve");
  return r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir];
}

const tileError = (o: Ownership): number =>
  Math.abs(o.owned.reduce((s, w) => s + w.area, 0) - o.fillArea) / Math.max(1, o.fillArea);

/**
 * A point inside the cut: the opening's own centre, which the core puts on its host's centreline.
 * Not the mean of the cut's vertices: on a curved host (library's drum) that mean falls on the
 * concave side, off the band.
 */
const cutPoint = (o: Ownership, i: number): Point => o.cuts[i]?.opening.at ?? { x: Number.NaN, y: Number.NaN };

const covered = (o: Ownership, p: Point): boolean =>
  o.owned.some((w) => w.pieces.some((pc) => inRing(p, pc.outer) && !pc.holes.some((h) => inRing(p, h))));

describe("H1 on the synthetic stress plans s1…s11", () => {
  const own = Object.fromEntries(
    Object.entries(STRESS_PLANS).map(([n, s]) => [n, storeys(s).map((ir) => wallOwnership(ir.walls))[0] as Ownership]),
  );
  const pieces = (n: string): Record<string, number> =>
    Object.fromEntries((own[n]?.owned ?? []).map((w) => [w.wall.id, w.pieces.length]));

  it("reads all eleven", () => {
    expect(Object.keys(own).length).toBe(11);
  });

  it("tiles the joined solid exactly: the owned areas sum to the fill", () => {
    for (const [n, o] of Object.entries(own)) expect(tileError(o), n).toBeLessThan(1e-9);
  });

  it("splits the thinner wall where a thicker one crosses it (one solid per connected piece)", () => {
    // s1: the 150 mm p2 ends inside the 100 mm p1's band; s2: the 200 mm `a` crosses the 100 mm
    // `b`; s11: the 300 mm `lowthick` crosses the 100 mm `tall`. Each thinner wall owns two pieces.
    expect(pieces("s1-t-junction")).toEqual({ shell: 1, p1: 2, p2: 1 });
    expect(pieces("s2-cross")).toEqual({ a: 1, b: 2, c: 1 });
    expect(pieces("s11-mixed-thick-low")).toEqual({ tall: 2, lowthick: 1 });
    // s3: three equal 200 mm walls meet at 60°; the tie goes to the first listed, and `b`'s
    // remainder is two pieces that touch at a point (the spike's "pinch"): two solids, not one.
    expect(pieces("s3-y-60deg")).toEqual({ a: 1, b: 2, c: 1 });
  });

  it("gives a wall that a heavier duplicate covers nothing, and loses no area", () => {
    // s8: `b` duplicates `a` and `c` lies inside it; the first listed owns the overlap.
    expect(pieces("s8-duplicate-overlap")).toEqual({ a: 1, b: 0, c: 0 });
    expect(own["s8-duplicate-overlap"]?.fillArea).toBe(840000);
  });

  it("keeps a closed ring's inside as a hole of its one piece", () => {
    expect(own["s4-mixed-height"]?.owned[0]?.pieces[0]?.holes.length).toBe(1);
    expect(own["s5-door-on-arc"]?.owned[0]?.pieces[0]?.holes.length).toBe(1);
  });

  it("lands every opening's cut on an owned piece, the arc and the angled host included", () => {
    for (const n of ["s1-t-junction", "s2-cross", "s5-door-on-arc", "s7-collinear-diff-thickness", "s10-angled-door"]) {
      const o = own[n] as Ownership;
      expect(o.cuts.length, n).toBeGreaterThan(0);
      o.cuts.forEach((_, i) => {
        expect(covered(o, cutPoint(o, i)), `${n} cut ${i}`).toBe(true);
      });
    }
  });

  it("reports the mixed-height joint on s11 only, where the thick low wall notches the tall one", () => {
    const fired = Object.entries(own).flatMap(([n, o]) =>
      mixedHeightJoints(o).map((m) => `${n}: ${m.owner.id}>${m.notched.id}`),
    );
    // s4 also mixes heights, but its thicker wall is the taller one, so nothing is notched.
    expect(fired).toEqual(["s11-mixed-thick-low: lowthick>tall"]);
  });

  // The red-team's probes (PR #325 round 1): thickness alone said "notched" where the lower wall
  // took nothing. A 300 mm wall's square cap reaches 150 mm past its end.
  const joints = (walls: string): string[] => {
    const src = `plan "p" { units mm grid 50 ${walls} }`;
    return mixedHeightJoints(wallOwnership(storeys(src)[0]?.walls ?? [])).map((m) => `${m.owner.id}>${m.notched.id}`);
  };
  const TALL = "wall id=tall partition thickness 100 height 3000 { (0,2000) (6000,2000) }";

  it("does not report a butt joint: a lower wall whose cap ends on the taller wall's face", () => {
    expect(joints(`${TALL} wall id=low partition thickness 300 height 1200 { (3000,0) (3000,1800) }`)).toEqual([]);
  });

  it("does not report bands that meet at one corner point", () => {
    expect(joints(`${TALL} wall id=low partition thickness 300 height 1200 { (6200,0) (6200,1800) }`)).toEqual([]);
  });

  it("reports the same pair once the lower wall's band overlaps the taller one's", () => {
    expect(joints(`${TALL} wall id=low partition thickness 300 height 1200 { (3000,0) (3000,1900) }`)).toEqual([
      "low>tall",
    ]);
  });

  it("follows the joinery's tie-break: equal thickness, the lower wall written first owns the crossing", () => {
    const low = "wall id=low partition thickness 100 material brick height 1200 { (3000,0) (3000,4000) }";
    expect(joints(`${low} ${TALL}`)).toEqual(["low>tall"]);
    expect(joints(`${TALL} ${low}`)).toEqual([]);
  });
});

describe("H1 on the shipped corpus", () => {
  const rows = EXAMPLES_LIST.flatMap(([n, s]) => storeys(s).map((ir) => ({ n, ir, o: wallOwnership(ir.walls) })));

  it("gives every wall a positive owned area (an empty owner means the group key drifted)", () => {
    const empty = rows.flatMap(({ n, o }) => o.owned.filter((w) => w.area <= 0).map((w) => `${n}:${w.wall.id}`));
    expect(empty).toEqual([]);
    expect(rows.reduce((s, r) => s + r.o.owned.length, 0)).toBeGreaterThan(250);
  });

  it("tiles each storey's solid: exactly on straight walls, within 5e-4 where arcs are tessellated", () => {
    for (const { n, ir, o } of rows) {
      const arcs = ir.walls.some((w) => w.arcs?.some(Boolean));
      expect(tileError(o), n).toBeLessThan(arcs ? 5e-4 : 1e-9);
    }
  });

  it("orients every piece consistently: outers one way, holes the other", () => {
    for (const { n, o } of rows) {
      for (const w of o.owned) {
        for (const p of w.pieces) {
          for (const h of p.holes) expect(Math.sign(signedArea(h)), n).toBe(-Math.sign(signedArea(p.outer)));
        }
      }
    }
  });

  it("lands every cut on an owned piece", () => {
    const missed = rows.flatMap(({ n, o }) =>
      o.cuts.flatMap((_, i) => (covered(o, cutPoint(o, i)) ? [] : [`${n}#${i}`])),
    );
    expect(missed).toEqual([]);
  });

  it("reports no mixed-height joint on any shipped example", () => {
    expect(rows.flatMap(({ n, o }) => mixedHeightJoints(o).map((m) => `${n}: ${m.message}`))).toEqual([]);
  });
});
