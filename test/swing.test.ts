import { describe, expect, it } from "vitest";
import { doorSwing, isDoubleDoorPair, sectorIntersectsRect, swingsCollide } from "../src/geometry.js";
import { largestPerimeterGap } from "../src/analyze.js";

/**
 * Geometry shared by the renderer and the architectural lint rules:
 * door-swing quarter-discs and room-perimeter enclosure. Pure & deterministic.
 */

// A door centred on a horizontal wall (segment runs +x), swinging "in" (downward,
// since the left normal of +x is +y in screen space).
const wallSeg = { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 100 };
const door = { at: { x: 1000, y: 0 }, width: 1000, hinge: "left" as const, swing: "in" as const, host: wallSeg };

/**
 * Recover the centre of the circle an SVG endpoint-arc `A r r 0 largeArc sweep`
 * actually draws, from its two endpoints (SVG impl notes F.6.5, rx=ry=r,
 * x-rotation=0). The door renderer emits `M leafEnd A r r 0 0 sweep farJamb`, so a
 * *correct* swing arc must reconstruct to a circle centred on the hinge — a wrong
 * sweep flag silently selects the other candidate centre (the concave arc bug).
 */
function svgArcCentre(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  r: number,
  largeArc: 0 | 1,
  sweep: 0 | 1,
): { x: number; y: number } {
  const x1p = (p0.x - p1.x) / 2;
  const y1p = (p0.y - p1.y) / 2;
  const denom = x1p * x1p + y1p * y1p;
  const factor = Math.sqrt(Math.max(0, (r * r - denom) / denom));
  const sign = largeArc !== sweep ? 1 : -1;
  const cxp = sign * factor * y1p;
  const cyp = sign * factor * -x1p;
  return { x: cxp + (p0.x + p1.x) / 2, y: cyp + (p0.y + p1.y) / 2 };
}

describe("doorSwing", () => {
  it("returns null for an unhosted door", () => {
    expect(doorSwing({ ...door, host: null })).toBeNull();
  });

  it("places the hinge a half-width from centre and the leaf a full width away", () => {
    const s = doorSwing(door)!;
    expect(s.radius).toBe(1000);
    // hinge at 500 from centre along the wall; leaf tip a full width into the room.
    expect(Math.hypot(s.hinge.x - door.at.x, s.hinge.y - door.at.y)).toBeCloseTo(500);
    expect(Math.hypot(s.leafEnd.x - s.hinge.x, s.leafEnd.y - s.hinge.y)).toBeCloseTo(1000);
  });

  // The swing arc must be a *convex* quarter-disc centred on the hinge. The SVG
  // arc syntax carries no centre, so a flipped sweep flag draws the other valid
  // circle (centred across the leaf/jamb chord) — a concave arc. Reconstruct the
  // centre the SVG actually draws and assert it lands on the hinge, for every
  // hinge×swing across all four wall traversal directions.
  it("draws a convex arc centred on the hinge for every hinge×swing×wall direction", () => {
    const walls = [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 }, thickness: 100 }, // +x
      { a: { x: 4000, y: 0 }, b: { x: 0, y: 0 }, thickness: 100 }, // −x (reversed)
      { a: { x: 0, y: 0 }, b: { x: 0, y: 4000 }, thickness: 100 }, // +y
      { a: { x: 0, y: 4000 }, b: { x: 0, y: 0 }, thickness: 100 }, // −y (reversed)
    ];
    for (const w of walls) {
      const at = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      for (const hinge of ["left", "right"] as const) {
        for (const swing of ["in", "out"] as const) {
          const s = doorSwing({ at, width: 1000, hinge, swing, host: w })!;
          const c = svgArcCentre(s.leafEnd, s.farJamb, s.radius, 0, s.sweep);
          expect(
            Math.hypot(c.x - s.hinge.x, c.y - s.hinge.y),
            `${hinge}/${swing} on wall ${JSON.stringify(w.a)}→${JSON.stringify(w.b)}`,
          ).toBeLessThan(1);
        }
      }
    }
  });
});

describe("sectorIntersectsRect", () => {
  const s = doorSwing(door)!;
  it("flags a rectangle the leaf sweeps onto", () => {
    // A box directly in the swept quarter (in front of the hinge).
    expect(sectorIntersectsRect(s, { x: 200, y: 200, w: 700, h: 700 }, 0)).toBe(true);
  });
  it("clears a rectangle outside the radius", () => {
    expect(sectorIntersectsRect(s, { x: 3000, y: 1000, w: 500, h: 500 }, 0)).toBe(false);
  });
});

describe("swingsCollide", () => {
  it("detects two overlapping swings and clears distant ones", () => {
    const a = doorSwing(door)!;
    const near = doorSwing({ ...door, at: { x: 1500, y: 0 } })!;
    const far = doorSwing({ ...door, at: { x: 3800, y: 0 } })!;
    expect(swingsCollide(a, near, 0)).toBe(true);
    expect(swingsCollide(a, far, 0)).toBe(false);
  });

  // Backlog 6.8: two quarter-discs that meet in exactly ONE point are clear; any overlap of
  // area, however thin, or any contact along a segment of positive length collides.
  // Every wall direction and both swing sides, so the rule is not an accident of one frame.
  const WALLS = [
    { a: { x: 0, y: 0 }, b: { x: 8000, y: 0 }, thickness: 200 }, // +x
    { a: { x: 8000, y: 0 }, b: { x: 0, y: 0 }, thickness: 200 }, // −x
    { a: { x: 0, y: 0 }, b: { x: 0, y: 8000 }, thickness: 200 }, // +y
    { a: { x: 0, y: 8000 }, b: { x: 0, y: 0 }, thickness: 200 }, // −y
  ];
  /** A leaf of `width` centred `pos` mm along `w`, hinged on the jamb nearer to / farther
   *  from the wall's start (`near`/`far`), so the helper states jambs, not hands. */
  const leaf = (w: (typeof WALLS)[number], pos: number, width: number, jamb: "start" | "end", swing: "in" | "out") => {
    const along = w.a.x === w.b.x ? { x: 0, y: Math.sign(w.b.y - w.a.y) } : { x: Math.sign(w.b.x - w.a.x), y: 0 };
    const at = { x: w.a.x + along.x * pos, y: w.a.y + along.y * pos };
    // `hinge left` puts the hinge half a width BEHIND the centre along the traversal.
    return doorSwing({ at, width, hinge: jamb === "start" ? "left" : "right", swing, host: w })!;
  };

  it("clears a textbook double door — two leaves meeting at a shared closed jamb", () => {
    for (const w of WALLS) {
      for (const swing of ["in", "out"] as const) {
        for (const width of [900, 1000]) {
          // Shared jamb at 3000 along the wall; hinges on the OUTER jambs.
          const a = leaf(w, 3000 - width / 2, width, "start", swing);
          const b = leaf(w, 3000 + width / 2, width, "end", swing);
          expect(Math.hypot(a.farJamb.x - b.farJamb.x, a.farJamb.y - b.farJamb.y)).toBe(0);
          const at = `${JSON.stringify(w.a)}→${JSON.stringify(w.b)} ${swing} 2×${width}`;
          expect(swingsCollide(a, b, 0), at).toBe(false);
          expect(swingsCollide(b, a, 0), at).toBe(false);
        }
      }
    }
  });

  it("clears a double door on an OBLIQUE wall, where the shared jamb is equal only in floating point", () => {
    // Off-axis walls put the two far jambs ~1e-13 mm apart; the touch is read within the
    // repository's vertex tolerance (VERTEX_EPS), and a 1 mm overlap still collides.
    const oblique = [
      { a: { x: 0, y: 0 }, b: { x: 5000, y: 5000 }, thickness: 200 },
      { a: { x: 7000, y: 0 }, b: { x: 0, y: 3000 }, thickness: 200 },
      { a: { x: 100, y: 200 }, b: { x: 6100, y: 2700 }, thickness: 200 },
    ];
    for (const w of oblique) {
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const at = (p: number) => ({ x: w.a.x + ((w.b.x - w.a.x) * p) / L, y: w.a.y + ((w.b.y - w.a.y) * p) / L });
      for (const width of [800, 900, 1000]) {
        for (const jamb of [1500, 2000, 2345, 3000]) {
          for (const swing of ["in", "out"] as const) {
            const a = doorSwing({ at: at(jamb - width / 2), width, hinge: "left", swing, host: w })!;
            const b = doorSwing({ at: at(jamb + width / 2), width, hinge: "right", swing, host: w })!;
            const tag = `${JSON.stringify(w.a)}→${JSON.stringify(w.b)} ${width}@${jamb} ${swing}`;
            expect(swingsCollide(a, b, 0), tag).toBe(false);
            const over = doorSwing({ at: at(jamb + width / 2 - 1), width, hinge: "right", swing, host: w })!;
            expect(swingsCollide(a, over, 0), `${tag} −1 mm`).toBe(true);
          }
        }
      }
    }
  });

  it("still collides when the same pair overlaps by 1 mm", () => {
    for (const w of WALLS) {
      for (const swing of ["in", "out"] as const) {
        const a = leaf(w, 2500, 1000, "start", swing);
        const b = leaf(w, 3499, 1000, "end", swing); // hinges 1999 mm apart for two 1000 mm leaves
        expect(swingsCollide(a, b, 0), `${JSON.stringify(w.a)} ${swing}`).toBe(true);
        expect(swingsCollide(b, a, 0), `${JSON.stringify(w.a)} ${swing}`).toBe(true);
      }
    }
  });

  it("clears a row of leaves where one's far jamb is the next one's hinge", () => {
    for (const w of WALLS) {
      const a = leaf(w, 2500, 1000, "start", "in");
      const b = leaf(w, 3500, 1000, "start", "in"); // b's hinge = a's far jamb, same hand
      expect(swingsCollide(a, b, 0)).toBe(false);
    }
  });

  it("still collides when a leaf opens INTO the other's swing (a real overlap)", () => {
    // Facing each other from the outer jambs, 100 mm too close: overlap.
    const w = WALLS[0]!;
    const a = leaf(w, 2500, 1000, "start", "in");
    expect(swingsCollide(a, leaf(w, 3400, 1000, "end", "in"), 0)).toBe(true);
    // A duplicated door is the limit case: the same quarter-disc twice.
    expect(swingsCollide(a, leaf(w, 2500, 1000, "start", "in"), 0)).toBe(true);
  });

  it("still collides on contact along a SEGMENT — only single-point contact is exempt", () => {
    // Leaves are solid, so sharing a line is a clash even with no area in common. The same
    // pair 100 mm too close but opening to OPPOSITE faces: the closed leaves overlap along a
    // 100 mm run of the wall line (the openings overlap). Two leaves hung back to back on one
    // post opening the same way: both open leaves lie on the same 1000 mm line.
    for (const w of WALLS) {
      const a = leaf(w, 2500, 1000, "start", "in");
      const opposite = leaf(w, 3400, 1000, "end", "out");
      expect(swingsCollide(a, opposite, 0), `${JSON.stringify(w.a)} opposite faces`).toBe(true);
      expect(swingsCollide(opposite, a, 0), `${JSON.stringify(w.a)} opposite faces`).toBe(true);
      const post1 = leaf(w, 2500, 1000, "end", "in");
      const post2 = leaf(w, 3500, 1000, "start", "in");
      expect(swingsCollide(post1, post2, 0), `${JSON.stringify(w.a)} back to back`).toBe(true);
    }
  });

  it("with a clearance, contact at exactly radius + clearance is clear; 1 mm closer is not", () => {
    const w = WALLS[0]!;
    const clr = 150;
    const a = leaf(w, 2500, 1000, "start", "in");
    // Hinges exactly 1000 + 1000 + 150 apart: the clearance band touches the other disc.
    const touching = leaf(w, 3650, 1000, "end", "in");
    expect(swingsCollide(a, touching, clr)).toBe(false);
    expect(swingsCollide(a, leaf(w, 3649, 1000, "end", "in"), clr)).toBe(true);
  });

  it("a double door is ONE assembly: its two leaves are clear at any clearance", () => {
    // The swing clearance keeps independent doors apart, not a pair's two leaves. Every wall
    // direction, both swing sides, 2×900 and 2×1000, at clearance 0 and 150.
    for (const w of WALLS) {
      for (const swing of ["in", "out"] as const) {
        for (const width of [900, 1000]) {
          const a = leaf(w, 3000 - width / 2, width, "start", swing);
          const b = leaf(w, 3000 + width / 2, width, "end", swing);
          const tag = `${JSON.stringify(w.a)} ${swing} 2×${width}`;
          expect(isDoubleDoorPair(a, b), tag).toBe(true);
          for (const clr of [0, 150]) {
            expect(swingsCollide(a, b, clr), `${tag} clr ${clr}`).toBe(false);
            expect(swingsCollide(b, a, clr), `${tag} clr ${clr}`).toBe(false);
          }
        }
      }
    }
  });

  it("unequal leaves, and leaves opening to opposite faces from a shared latch, are one assembly too", () => {
    for (const w of WALLS) {
      for (const [wa, wb, sa, sb] of [
        [1000, 500, "in", "in"],
        [900, 900, "in", "out"],
        [1000, 600, "out", "in"],
      ] as const) {
        const a = leaf(w, 3000 - wa / 2, wa, "start", sa);
        const b = leaf(w, 3000 + wb / 2, wb, "end", sb);
        const tag = `${JSON.stringify(w.a)} ${wa}/${wb} ${sa}/${sb}`;
        expect(isDoubleDoorPair(a, b), tag).toBe(true);
        expect(swingsCollide(a, b, 150), tag).toBe(false);
      }
    }
  });

  it("a pair with a 1 mm gap at the jamb is two independent doors and keeps the clearance", () => {
    for (const w of WALLS) {
      const a = leaf(w, 2500, 1000, "start", "in");
      const b = leaf(w, 3501, 1000, "end", "in"); // far jambs at 3000 and 3001
      expect(isDoubleDoorPair(a, b)).toBe(false);
      expect(swingsCollide(a, b, 0)).toBe(false); // a gap: clear on its own
      expect(swingsCollide(a, b, 150)).toBe(true); // inside each other's clearance band
    }
    // Nor is a row of leaves (one's far jamb on the next one's HINGE) a pair.
    const w = WALLS[0]!;
    const row = [leaf(w, 2500, 1000, "start", "in"), leaf(w, 3500, 1000, "start", "in")] as const;
    expect(isDoubleDoorPair(row[0], row[1])).toBe(false);
    expect(swingsCollide(row[0], row[1], 150)).toBe(true);
  });

  it("asks BOTH clearance pairings, not only the one the sampler happened to hit", () => {
    // `a` hinged at 2000 opening in; `b` hinged at 3000 with its far jamb ON a's hinge. With
    // 150 mm clearance, b's disc grown to 1150 overlaps a (positive area), while a's disc grown
    // to 1150 only touches b. The sampler finds its shared point on the touching pairing.
    const w = WALLS[0]!;
    const a = leaf(w, 1500, 1000, "end", "in");
    const b = leaf(w, 2500, 1000, "end", "in");
    expect(swingsCollide(a, b, 150)).toBe(true);
    expect(swingsCollide(b, a, 150)).toBe(true);
  });
});

describe("largestPerimeterGap", () => {
  const wall = (pts: { x: number; y: number }[], closed: boolean) => ({
    id: "w",
    category: "x",
    thickness: 100,
    points: pts,
    closed,
  });
  const room = { x: 0, y: 0, w: 3000, h: 3000 };

  it("is ~0 when every edge is backed by a wall", () => {
    const shell = wall(
      [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      true,
    );
    expect(largestPerimeterGap(room, [shell], 200)).toBeLessThanOrEqual(1);
  });

  it("reports the open run when a wall is missing on one edge", () => {
    // Three sides only — the right edge (x=3000) is unwalled.
    const open = wall(
      [
        { x: 3000, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 3000 },
        { x: 3000, y: 3000 },
      ],
      false,
    );
    expect(largestPerimeterGap(room, [open], 200)).toBeCloseTo(3000);
  });
});
