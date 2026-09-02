import { describe, expect, it } from "vitest";
import { lint, compile, describe as describePlan } from "../src/index.js";
import { format } from "../src/format.js";
import { arcBandIntrusion } from "../src/geometry/arc-band.js";
import { arcFromChord } from "../src/geometry/arc.js";

/**
 * Furniture professionalism lint: pieces that overlap each other
 * (`W_FURNITURE_OVERLAP`) and wall-requiring fixtures that float in the middle of a
 * room (`W_FIXTURE_FLOATING`). Advisory, deterministic, over the resolved IR.
 */

const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");

const room = (furniture: string) =>
  `plan "P" {
    units mm
    wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
    room id=r at (0,0) size 4000x4000 label "Studio"
    ${furniture}
  }`;

describe("furniture lint", () => {
  it("flags two overlapping furniture pieces", () => {
    const c = codes(
      room(`furniture sofa at (300,300) size 2000x900\n    furniture table at (1000,500) size 1000x1000`),
    );
    expect(c).toContain("W_FURNITURE_OVERLAP");
  });

  it("does not flag furniture that merely sits apart", () => {
    const c = codes(room(`furniture sofa at (300,300) size 1500x900\n    furniture table at (2200,300) size 1000x600`));
    expect(c).not.toContain("W_FURNITURE_OVERLAP");
  });

  it("flags a wall-requiring fixture floating in the middle of the room", () => {
    const c = codes(room(`furniture wc at (1800,1800) size 400x700`));
    expect(c).toContain("W_FIXTURE_FLOATING");
  });

  it("does not flag a fixture placed against a wall", () => {
    const c = codes(room(`furniture wc at (100,100) size 400x700`));
    expect(c).not.toContain("W_FIXTURE_FLOATING");
  });

  it("does not flag free-standing furniture (a bed) for floating", () => {
    const c = codes(room(`furniture bed at (1700,1700) size 1500x2000`));
    expect(c).not.toContain("W_FIXTURE_FLOATING");
  });
});

// Two rooms side by side for the `in <room>` ownership checks.
const twoRoom = (furniture: string) =>
  `plan "P" {
    units mm
    wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall partition thickness 100 { (4000,0) (4000,4000) }
    room id=living at (0,0)    size 4000x4000 label "Living"
    room id=bath   at (4000,0) size 4000x4000 label "Bath"
    ${furniture}
  }`;

describe("furniture `in <room>` ownership", () => {
  it("flags a fixture whose centre is outside its declared room", () => {
    const c = lint(twoRoom(`furniture wc at (200,200) size 400x700 in bath`)).map((d) => d.code ?? "");
    expect(c).toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("does not flag a fixture that sits inside its declared room", () => {
    const c = lint(twoRoom(`furniture wc at (4200,200) size 400x700 in bath`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("errors when `in` names a room that does not exist", () => {
    const { diagnostics } = compile(twoRoom(`furniture wc at (4200,200) size 400x700 in nosuchroom`), {
      noCache: true,
    });
    expect(diagnostics.some((d) => d.code === "E_FURN_ROOM")).toBe(true);
  });

  it("surfaces the owning room in describe() and round-trips through the formatter", () => {
    const src = twoRoom(`furniture wc at (4200,200) size 400x700 in bath`);
    expect(describePlan(src).furniture[0]!.room).toBe("bath");
    expect(format(src)).toContain("size 400x700 in bath");
  });
});

/**
 * `W_FIXTURE_WRONG_ROOM` used to ask only where the fixture's CENTRE was, so a piece
 * could have three quarters of its footprint in three other rooms and still pass by
 * putting its centre 50 mm inside the one it declares. The rule now measures the
 * footprint. A corner is what makes the centre test so weak: crossing both the x and
 * the y edge leaves at most `0.5 × 0.5` of the area inside while the centre stays in.
 */
describe("furniture `in <room>` ownership is measured by FOOTPRINT, not centre", () => {
  const quad = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,8000) (0,8000) close }
      wall partition thickness 100 { (4000,0) (4000,8000) }
      wall partition thickness 100 { (0,4000) (8000,4000) }
      room id=nw at (0,0)       size 4000x4000 label "NW"
      room id=ne at (4000,0)    size 4000x4000 label "NE"
      room id=sw at (0,4000)    size 4000x4000 label "SW"
      room id=se at (4000,4000) size 4000x4000 label "SE"
      ${furn}
    }`;

  it("flags a bed with 72% of its footprint in three OTHER rooms", () => {
    // 1500×2000 at (3300,3050): centre (4050,4050) is 50 mm inside `se` on both axes,
    // which is exactly what the old centre test rewarded. 800/1500 of its width and
    // 1050/2000 of its height are inside — 28% of the area, so 72% is elsewhere.
    const src = quad(`furniture bed at (3300,3050) size 1500x2000 in se`);
    expect(lint(src).map((d) => d.code)).toContain("W_FIXTURE_WRONG_ROOM");
    // Non-vacuity: the fixture's CENTRE is what the old rule looked at, and it has not
    // moved. A 100×100 piece sharing that exact centre is wholly inside `se` and stays
    // quiet — so the verdict above comes from the footprint and nothing else.
    const sameCentre = quad(`furniture stool at (4000,4000) size 100x100 in se`);
    expect(lint(sameCentre).map((d) => d.code)).not.toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("leaves a bed wholly inside its declared room alone", () => {
    const c = lint(quad(`furniture bed at (4200,4200) size 1500x2000 in se`)).map((d) => d.code);
    expect(c).not.toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("leaves a fixture sitting ON the room boundary alone (the slack)", () => {
    // Corner-anchored at the room rectangle's own edge: the footprint touches the
    // boundary line, which is a wall CENTRELINE, so a piece drawn flush to the room
    // rect legitimately shares it.
    const c = lint(quad(`furniture wc at (4000,4000) size 400x700 in se`)).map((d) => d.code);
    expect(c).not.toContain("W_FIXTURE_WRONG_ROOM");
  });

  it("leaves a `flush` room-anchored fixture alone (the resolver's own placement)", () => {
    const c = lint(quad(`furniture counter in se anchor top-left flush size 600x1200`)).map((d) => d.code);
    expect(c).not.toContain("W_FIXTURE_WRONG_ROOM");
  });
});

describe("furniture-vs-wall collision lint", () => {
  // Two rooms split by a partition at x=4000.
  const split = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,0) (4000,4000) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      ${furn}
    }`;

  it("flags furniture drawn straddling a wall", () => {
    // Sofa crosses the x=4000 partition (x 3500→4500).
    const c = codes(split(`furniture sofa at (3500,1000) size 1000x900`));
    expect(c).toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("does not flag furniture flush against the wall face", () => {
    // Counter backs onto the partition's left face (x ends at 3950, the wall face).
    const c = codes(split(`furniture sofa at (2950,1000) size 1000x900`));
    expect(c).not.toContain("W_FURNITURE_WALL_COLLISION");
  });
});

/**
 * The same rule on a wall that is not axis-aligned. `wallIntrusionDepth` used to open
 * with `if (horiz === vert) return 0` — a silent skip that made the whole rule blind to
 * every diagonal wall in the language, so a sofa drawn straight through one linted
 * clean. The measurement is now taken in the WALL's own frame (its direction and its
 * normal), which is exactly the orthogonal arithmetic when the wall happens to be
 * orthogonal.
 */
describe("furniture-vs-wall collision on an ANGLED wall", () => {
  // One 300 mm wall on the 45° diagonal. Its centreline is y = x; its faces are
  // 150 mm either side of it, i.e. 212.13 mm apart measured on a coordinate axis.
  const diagonal = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 300 { (0,0) (10000,10000) }
      room id=r at (0,0) size 10000x10000 label "R"
      ${furn}
    }`;

  it("flags a piece drawn straight through the wall", () => {
    // 1000×900 centred on (5000,5000) — a point ON the wall's own centreline.
    const c = codes(diagonal(`furniture sofa at (4500,4550) size 1000x900`));
    expect(c).toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("does not flag a piece sitting against the wall's face", () => {
    // Nearest corner is (1000,1215) — 152 mm off the centreline on the wall's normal,
    // i.e. just clear of the 150 mm face. Nothing of the footprint is in the solid.
    const c = codes(diagonal(`furniture sofa at (0,1215) size 1000x900`));
    expect(c).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("does not flag a piece the wall's RUN never reaches", () => {
    // On the line y = x extended, but past the segment's end — the along-wall overlap
    // is what keeps a wall from colliding with furniture it does not run past.
    const c = codes(
      `plan "P" {
        units mm
        wall exterior thickness 300 { (0,0) (3000,3000) }
        room id=r at (0,0) size 10000x10000 label "R"
        furniture sofa at (7500,7550) size 1000x900
      }`,
    );
    expect(c).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("subtracts an opening on the angled wall, so a piece in the doorway is not a collision", () => {
    // Same straddling piece as the first case, but the wall is voided by a 2000 mm
    // door centred exactly where it sits: there is no solid there to penetrate.
    const c = codes(
      `plan "P" {
        units mm
        wall exterior thickness 300 { (0,0) (10000,10000) }
        room id=r at (0,0) size 10000x10000 label "R"
        door at (5000,5000) width 2000 wall exterior hinge left swing in
        furniture sofa at (4500,4550) size 1000x900
      }`,
    );
    expect(c).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("still measures an orthogonal wall exactly as before (the frame is the identity there)", () => {
    // The horizontal/vertical cases above and below this block are the real pin; this
    // one guards the reverse-direction segment, whose frame flips both axes.
    const backwards = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
      wall partition thickness 100 { (4000,4000) (4000,0) }
      room id=a at (0,0)    size 4000x4000 label "A"
      room id=b at (4000,0) size 4000x4000 label "B"
      furniture sofa at (3500,1000) size 1000x900
    }`;
    expect(codes(backwards)).toContain("W_FURNITURE_WALL_COLLISION");
  });
});

/**
 * A CURVED WALL IS MEASURED, NOT SKIPPED — and measured in the coordinates it has.
 *
 * Two wrong answers were available here and both are pinned against. A curved segment
 * carries its CHORD in `a`/`b`, so measuring that flags furniture near a straight line
 * the wall is not on and misses the wall itself; declining outright (what this replaced)
 * is silent on a piece drawn straight through a curved wall, which is the false negative
 * this project ranks worst.
 *
 * The right answer is polar: intersect the piece's radial extent, restricted to the arc's
 * angular sweep, with the band `R ± thickness/2` (`src/geometry/arc-band.ts`). It is
 * closed form — the arc's tessellated band is a drawing artifact whose facet count is a
 * rendering decision, so a measurement that read it would be wrong by construction.
 * docs/backlog.md item 3.15.
 */
describe("furniture-vs-wall collision measures an ARC in polar coordinates", () => {
  // A drum: two semicircles about (5000,5000) at R 3000, walls 300 thick, so the solid
  // band is exactly [2850, 3150] from the centre. The upper arc runs (8000,5000) →
  // (2000,5000); the CHORD of both is the horizontal line y = 5000, through the middle
  // of the open floor.
  const drum = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 300 {
        (2000,5000)
        arc (8000,5000) radius 3000
        arc (2000,5000) radius 3000
        close
      }
      room id=r circle at (5000,5000) radius 2850 label "Drum"
      ${furn}
    }`;

  it("flags a piece straddling the curved wall's true band", () => {
    // Centred on (5000,2000) — the top of the circle, dead on the arc's centreline.
    expect(codes(drum(`furniture sofa at (4500,1550) size 1000x900`))).toContain("W_FURNITURE_WALL_COLLISION");
  });

  it("does not flag a piece on the arc's CHORD (the pre-decline false positive)", () => {
    // The chord runs (2000,5000)→(8000,5000); this piece straddles that line and is
    // nowhere near the wall. Measuring the chord would have called it a collision.
    expect(codes(drum(`furniture sofa at (4500,4550) size 1000x900`))).not.toContain("W_FURNITURE_WALL_COLLISION");
  });

  /**
   * The depth is a real measurement, not a boolean dressed up as one — asserted in closed
   * form against numbers derived from the geometry rather than read back off the rule.
   * The band is [2850, 3150] exactly, so every figure below is exact in binary.
   */
  describe("the measured radial depth", () => {
    const upper = arcFromChord({ x: 8000, y: 5000 }, { x: 2000, y: 5000 }, 3000, "ccw", false)!;

    it("solves to the drum's own circle", () => {
      expect(upper.center).toEqual({ x: 5000, y: 5000 });
      expect(upper.r).toBe(3000);
    });

    it("reads the FULL thickness for a piece straddling the whole band", () => {
      // y 1550…2450 spans radii 2550…3486, which swallows [2850, 3150] whole.
      const hit = arcBandIntrusion({ x: 4500, y: 1550, w: 1000, h: 900 }, upper, 300);
      expect(hit?.depth).toBe(300);
    });

    it("reads the shortfall for a piece that only breaks the outer face", () => {
      // y 1000…1900: the nearest point of the rect is 3100 from the centre, 50 mm inside
      // the outer face at 3150. Not the thickness, not a boolean — 50.
      const hit = arcBandIntrusion({ x: 4500, y: 1000, w: 1000, h: 900 }, upper, 300);
      expect(hit?.depth).toBe(50);
    });

    it("reads NOTHING for a piece flush against the outer face", () => {
      // y 1000…1850: the nearest point is exactly 3150 — on the face, not in the solid.
      expect(arcBandIntrusion({ x: 4500, y: 1000, w: 1000, h: 850 }, upper, 300)).toBeNull();
    });

    it("reads nothing on the chord, where the radii are nowhere near the band", () => {
      // The rect contains the centre, so it reaches radii 0…673 — the band starts at 2850.
      expect(arcBandIntrusion({ x: 4500, y: 4550, w: 1000, h: 900 }, upper, 300)).toBeNull();
    });
  });

  /**
   * THE SWEEP IS HONOURED. A quarter-arc from (5000,2000) to (8000,5000) about the same
   * centre covers only the top-RIGHT quadrant of the circle. A piece in the top-LEFT
   * quadrant crosses the same radii — the band is the same distance from the centre all
   * the way round — and is not on this wall at all. The pair is the point: identical
   * geometry, mirrored about the centre, opposite verdicts.
   */
  describe("restricted to the arc's angular sweep", () => {
    const quarter = (furn: string) =>
      `plan "P" {
        units mm
        wall id=bow exterior thickness 300 {
          (5000,2000)
          arc (8000,5000) radius 3000 cw
        }
        ${furn}
      }`;

    it("flags the piece INSIDE the sweep", () => {
      // Centred at 45° round from the top — (7121,2879), on the wall's centreline.
      expect(codes(quarter(`furniture sofa at (6621,2429) size 1000x900`))).toContain("W_FURNITURE_WALL_COLLISION");
    });

    it("does not flag its mirror image OUTSIDE the sweep", () => {
      // (2879,2879) — the same distance from the centre, on the quadrant the wall
      // does not occupy. Its radial extent crosses the band; the wall is not there.
      expect(codes(quarter(`furniture sofa at (2379,2429) size 1000x900`))).not.toContain("W_FURNITURE_WALL_COLLISION");
    });

    it("subtracts an opening hosted on the curve, measured along the ARC", () => {
      // The same flagged piece, with a window centred where it sits. 1600 mm of arc is
      // enough to void the ~1325 mm of run the piece covers; 1200 mm is not, and the
      // sliver of solid left over still counts — the same all-or-nothing rule a straight
      // run applies, on arc length instead of distance along a chord.
      const withWindow = (w: number) =>
        `plan "P" {
          units mm
          wall id=bow exterior thickness 300 {
            (5000,2000)
            arc (8000,5000) radius 3000 cw
          }
          window at (7121,2879) width ${w} wall exterior
          furniture sofa at (6621,2429) size 1000x900
        }`;
      expect(codes(withWindow(1200))).toContain("W_FURNITURE_WALL_COLLISION");
      expect(codes(withWindow(1600))).not.toContain("W_FURNITURE_WALL_COLLISION");
    });
  });
});

describe("doorway-blocked lint", () => {
  const room = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=r at (0,0) size 4000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      window at (3000,0) width 1200 wall exterior
      ${furn}
    }`;

  it("flags furniture parked in the door's clear approach", () => {
    const c = codes(room(`furniture wc at (700,3600) size 700x400`));
    expect(c).toContain("W_DOORWAY_BLOCKED");
  });

  it("leaves a clear doorway alone", () => {
    const c = codes(room(`furniture wc at (3500,3500) size 400x700`));
    expect(c).not.toContain("W_DOORWAY_BLOCKED");
  });
});

describe("room circulation (clear-path) lint", () => {
  it("flags a room whose door reaches only a sealed-off sliver of floor", () => {
    // A full-width barrier seals a thin strip at the door from the open room above.
    // ~22 m² of free floor exists, but the door can reach < 1 m² of it.
    const src = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
      room id=r at (0,0) size 6000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      furniture barrier at (0,3600) size 6000x300
    }`;
    expect(codes(src)).toContain("W_ROOM_NO_CLEAR_PATH");
  });

  it("does not flag a normally-furnished room", () => {
    const src = `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
      room id=r at (0,0) size 6000x4000 label "R"
      door at (1000,4000) width 900 wall exterior hinge left swing in
      furniture sofa at (300,300) size 2000x900
      furniture bed  at (3500,300) size 1500x2000
    }`;
    expect(codes(src)).not.toContain("W_ROOM_NO_CLEAR_PATH");
  });
});

describe("fixture front-clearance lint", () => {
  const kitchen = (furn: string) =>
    `plan "P" {
      units mm
      wall exterior thickness 200 { (0,0) (4000,0) (4000,4000) (0,4000) close }
      room id=k at (0,0) size 4000x4000 label "Kitchen" uses kitchen
      furniture stove at (200,100) size 600x600
      ${furn}
    }`;

  it("flags a free-standing piece parked in the fixture's use-space", () => {
    // Stove front faces south (y 700→1250); the sofa sits right there.
    const c = lint(kitchen(`furniture sofa at (200,800) size 1500x900`)).map((d) => d.code ?? "");
    expect(c).toContain("W_FURN_CLEARANCE");
  });

  it("does not flag furniture clear of the use-space", () => {
    const c = lint(kitchen(`furniture sofa at (200,2000) size 1500x900`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FURN_CLEARANCE");
  });

  it("ignores another fixture in front (compact runs are fine)", () => {
    // A counter directly south of the stove is a normal kitchen run, not a blockage.
    const c = lint(kitchen(`furniture counter at (200,800) size 600x600`)).map((d) => d.code ?? "");
    expect(c).not.toContain("W_FURN_CLEARANCE");
  });
});
