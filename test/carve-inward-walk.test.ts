import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";
import { centreFreedomToClearWidth, DEFAULT_BODY_RADIUS_MM } from "../src/analyze/circulation.js";

/**
 * A connector's inward walk stops at the room's first eroded floor cell.
 *
 * A connector's carve seeds come from `seedCells`, which walks inward from each threshold
 * point to the room's first free cell. That walk used to step on through cells the clearance
 * erosion had taken — past a fixture, or a stair's whole footprint — to a FAR seed. A straight
 * carve back to it meets the obstacle and is refused, but an L-shaped one (from a threshold
 * point on a lattice line, or one within tolerance of a room corner, whose walk runs
 * diagonally) can run round the obstacle. When it did, it stamped the doorway's width on the
 * far seed, a cell nowhere near the doorway, or bored a tunnel through the wall beside the
 * doorway and measured the room through it.
 *
 * Before this file only one example's digest guarded the rule. On the tree before it, the
 * landing's bedroom read 640 and the 100 mm-cell bath at R + δ was measured, so both of those
 * cases fail there. The 108 mm-cell case reads the same before and after; it is here to pin
 * the threshold's formula at a cell size where δ is not a whole cell.
 */

const R = DEFAULT_BODY_RADIUS_MM;

type Circ = NonNullable<ReturnType<typeof describePlan>["circulation"]>;
const circ = (src: string): Circ => {
  const c = describePlan(src).circulation;
  if (!c) throw new Error("plan has no circulation model");
  return c;
};
const room = (c: Circ, id: string) => c.rooms.find((r) => r.roomId === id);

describe("a far seed past a stair no longer takes the doorway's width (hillside-villa's landing)", () => {
  // A landing band between a closet `e` (north) and a bedroom `m` (south-east). A stair
  // stands on the landing right below the closet's 700 mm door; its foot (`dir down`, the
  // left edge) is open, so the column just west of it is free floor. Past the stair the
  // landing's only way east is the one-cell passage under the flight, between the stair's
  // halo and the 200 mm south wall, so every walk from the front door to `m` crosses it.
  //
  // The door's threshold point at x = 4900 lies on a lattice line and seeds two columns.
  // Column 4950's landing-side walk used to cross the whole stair to the passage, (4950,
  // 4050); column 4850's closet-side seed (the stair's halo reaches through the wall onto
  // (4950, 2450), not onto (4850, 2450), which lies outside the open foot) is its nearest
  // closet seed, and the y-then-x run from it went down the free column and along the
  // passage, stamping the door's 640 mm clear width on (4950, 4050). `m` then read 640.
  const plan = (withClosetDoor: boolean): string => `plan "landing" {
  units mm
  wall id=sh exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }
  wall id=wn partition thickness 100 { (0,2600) (12000,2600) }
  wall id=ws partition thickness 200 { (0,4200) (12000,4200) }
  wall id=we partition thickness 100 { (4000,0) (4000,2600) }
  wall id=wm partition thickness 100 { (9000,4200) (9000,6000) }
  room id=e at (4000,0) size 2000x2600 uses storage
  room id=l at (0,2600) size 12000x1600 uses hall circulation
  room id=m at (9000,4200) size 3000x1800 uses bedroom
  door id=front on sh at 32600 width 900 swing into l
${withClosetDoor ? "  door id=de on wn at 4900 width 700\n" : ""}  door id=dm on ws at 10500 width 1000 swing into m
  stair id=st at (4900,2700) size 2200x1000 dir down
}
`;

  it("the bedroom past the flight reads the passage's own width, exactly as with no closet door at all", () => {
    const withDoor = circ(plan(true));
    const control = circ(plan(false)); // nothing to carve from the closet: no stamp can land
    const m = room(withDoor, "m");
    expect(m).toBeDefined();
    // The one-cell passage is one free cell between two eroded ones: its clear width is the
    // closed form at one hop, not the closet door's 640.
    expect(m!.bottleneckClearWidthMm).toBe(centreFreedomToClearWidth(1, withDoor.cellSizeMm, R));
    // And the closet door changes nothing about the walk to `m`: walk, width and detour.
    expect(m).toEqual(room(control, "m"));
  });

  it("the closet is still entered, through the door's columns that meet free floor", () => {
    const e = room(circ(plan(true)), "e");
    expect(e).toBeDefined();
    expect(e!.bottleneckClearWidthMm).toBeLessThan(700); // the 700 mm door's clear width
  });
});

describe("furniture within R + δ of a doorway's face blocks it: the threshold, from the mechanism", () => {
  // The red team's plan, generalised: a hall `a` (west half) with the front door; a bath `c`
  // in the lower right, entered only by an 800 mm door on the partition at x = W/2, 500 mm
  // (centre) from c's far corner; and a sofa in the hall whose east face stands `gap` mm off
  // the partition's hall-side face, across the whole door.
  //
  // The hall side's walk from every threshold point (straight, or diagonal for a point
  // within tolerance of the corner) first meets the hall's first cell the partition leaves
  // free. Its centre lies δ west of the wall face, so the sofa's halo (cells within R of it)
  // takes it exactly when gap − δ ≤ R. Every walk then stops there and the door seeds
  // nothing: `c` is BLOCKED for gap ≤ R + δ and measured for gap > R + δ. Before, the
  // diagonal walk stepped through the halo and the sofa to free floor beyond, and an L-shaped
  // carve back bored through the partition beside the doorway; `c` was measured through that
  // tunnel at any gap.
  const plan = (W: number, H: number, gap: number): string => {
    const X = W / 2;
    const face = X - 50;
    const doorY = H - 500;
    return `plan "threshold" {
  units mm
  wall id=sh exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }
  wall id=p partition thickness 100 { (${X},0) (${X},${H}) }
  wall id=q partition thickness 100 { (${X},${H / 2}) (${W},${H / 2}) }
  room id=a at (0,0) size ${X}x${H} uses hall
  room id=b at (${X},0) size ${X}x${H / 2} uses bedroom
  room id=c at (${X},${H / 2}) size ${X}x${H / 2} uses bath
  door id=front on sh at ${W + H + W - X / 2} width 1000 swing into a
  door id=d on p at ${H / 4} width 700
  door id=d2 on p at ${doorY} width 800 swing into c
  furniture sofa at (${face - gap - 1600},${doorY - 1200}) size 1600x1650
}
`;
  };

  /** δ: the wall face to the centre of the hall's first cell the partition (x = X, 100 mm,
   *  rasterised by cell centre within half its thickness, or — a wall thinner than a cell's
   *  half-diagonal — by any cell its centreline touches) leaves free. The grid starts at the
   *  plan's least room x, 0. */
  const delta = (X: number, cell: number): number => {
    const half = 50;
    let ix = Math.floor(X / cell);
    while (X - (ix + 0.5) * cell <= half || (ix + 1) * cell >= X) ix--;
    return X - half - (ix + 0.5) * cell;
  };

  // Two cell sizes: a dwelling's 100 mm, and 108 mm (a 2880 m² plan's area budget), where
  // the partition no longer falls on a cell edge and δ is not a whole cell.
  for (const [W, H, cell] of [
    [12000, 8000, 100],
    [60000, 48000, 108],
  ] as const) {
    const threshold = R + delta(W / 2, cell);
    it(`${cell} mm cells: blocked at gap ${threshold} (R + δ), measured 1 mm further off`, () => {
      const at = circ(plan(W, H, threshold));
      expect(at.cellSizeMm).toBe(cell);
      expect(room(at, "c")).toBeUndefined();
      const blocked = (at.blocked ?? []).find((b) => b.roomId === "c");
      expect(blocked).toBeDefined();
      // Something narrower than a body still gets through, which is what `blocked` claims.
      expect(blocked!.widestWayInMm).toBeGreaterThan(0);
      expect(blocked!.widestWayInMm).toBeLessThan(2 * R);

      const past = circ(plan(W, H, threshold + 1));
      expect(room(past, "c")).toBeDefined();
      expect(past.blocked ?? []).toEqual([]);
    });
  }

  it("the two thresholds are the formula's, not tuned numbers", () => {
    expect(R + delta(6000, 100)).toBe(400);
    expect(R + delta(30000, 108)).toBe(388);
  });
});
