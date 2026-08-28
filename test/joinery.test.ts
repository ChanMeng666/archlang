/**
 * `src/geometry/joinery.ts` — one boundary for a set of walls, with nothing drawn inside
 * another wall's solid.
 *
 * The assertions here are about SHAPE, stated exactly: which vertices exist, which face
 * lines survive, which do not, and where two groups' fills meet. Where a claim can be
 * checked by geometry rather than by counting edges it is — an edge count changes when
 * the merge pass changes, but "no line runs through the shell's poché" does not.
 *
 * The two junction cases worth naming, because they are what the whole feature is for:
 * a T-junction must not draw the stem's end cap across the head's face, and a thin
 * partition on a thick shell's centreline must vanish INTO the shell rather than laying
 * two faces down inside its poché.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Point } from "../src/ast.js";
import { arcFromChord, arcPointAt, distPointToArc } from "../src/geometry/arc.js";
import type { Arc } from "../src/geometry/arc.js";
import { distPointToSegment } from "../src/geometry.js";
import {
  type BandWall,
  type EdgeLoop,
  PointInterner,
  edgeEnd,
  edgeStart,
  loopArea,
  loopWinding,
  openingCut,
  pointKey,
  wallBand,
} from "../src/geometry/band.js";
import {
  type JoineryCut,
  type JoineryWall,
  bandBBox,
  emitLoops,
  joinWalls,
  loopsToPolygons,
} from "../src/geometry/joinery.js";

const P = (x: number, y: number): Point => ({ x, y });

interface WallSpec {
  points: Point[];
  thickness: number;
  closed?: boolean;
  group?: string;
  arcs?: Array<Arc | undefined>;
  openings?: Array<{ at: Point; width: number }>;
}

/** Build a `joinWalls` input from a list of plain wall specs. */
function build(specs: WallSpec[]): {
  walls: JoineryWall[];
  cuts: JoineryCut[];
  groups: string[];
  intern: PointInterner;
} {
  const intern = new PointInterner();
  const walls: JoineryWall[] = [];
  const cuts: JoineryCut[] = [];
  let cutIndex = 0;
  specs.forEach((spec, index) => {
    const w: BandWall = {
      thickness: spec.thickness,
      points: spec.points,
      closed: spec.closed ?? false,
      ...(spec.arcs ? { arcs: spec.arcs } : {}),
    };
    const loops = wallBand(w, intern);
    walls.push({
      index,
      id: `w${index}`,
      thickness: spec.thickness,
      group: spec.group ?? "brick",
      loops,
      bbox: bandBBox(loops),
    });
    for (const op of spec.openings ?? []) {
      const loop = openingCut(w, op, intern);
      if (loop) cuts.push({ index: cutIndex++, loop, bbox: bandBBox([loop]) });
    }
  });
  const groups = [...new Set(specs.map((s) => s.group ?? "brick"))];
  return { walls, cuts, groups, intern };
}

const join = (specs: WallSpec[]) => {
  const { walls, cuts, groups } = build(specs);
  return joinWalls(walls, cuts, groups);
};

const allVerts = (loops: EdgeLoop[]): Point[] => loops.flatMap((l) => l.map(edgeStart));
const vertKeys = (loops: EdgeLoop[]): Set<string> => new Set(allVerts(loops).map(pointKey));
const insideAny = (loops: EdgeLoop[], p: Point): boolean => loops.reduce((n, l) => n + loopWinding(l, p), 0) !== 0;

/**
 * Does any emitted edge pass within `tol` of `p`? EXACT — `distPointToSegment` for a
 * line and `distPointToArc` for a curve, never a sampled walk: a sampled test on a
 * multi-metre facade misses the point it was asked about and reports "no line here"
 * about a line that is right there.
 */
function anyEdgeNear(loops: EdgeLoop[], p: Point, tol: number): boolean {
  for (const l of loops) {
    for (const e of l) {
      const d = e.t === "arc" ? distPointToArc(p, e.arc) : distPointToSegment(p, edgeStart(e), edgeEnd(e));
      if (d <= tol) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ junctions */

describe("junctions", () => {
  it("an L: one loop, six vertices, all on integers", () => {
    const r = join([
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
      { points: [P(4000, 0), P(4000, 3000)], thickness: 200 },
    ]);
    expect(r.outline).toHaveLength(1);
    const vs = allVerts(r.outline);
    expect(vs).toHaveLength(6);
    for (const p of vs) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
    // The inner corner of the L is a real vertex; the crossing face lines are gone.
    expect(vertKeys(r.outline).has(pointKey(P(3900, 100)))).toBe(true);
    expect(insideAny(r.outline, P(2000, 0))).toBe(true);
    expect(insideAny(r.outline, P(4000, 1500))).toBe(true);
    expect(insideAny(r.outline, P(2000, 1500))).toBe(false);
  });

  it("a T: the stem's END CAP is not drawn across the head's face", () => {
    const r = join([
      { points: [P(0, 0), P(6000, 0)], thickness: 200 },
      { points: [P(3000, 0), P(3000, 4000)], thickness: 200 },
    ]);
    expect(r.outline).toHaveLength(1);
    // The stem's cap would be the line y = -100 from x = 2900 to 3100 — INSIDE the head.
    // Nothing may run through the head's poché there.
    expect(anyEdgeNear(r.outline, P(3000, -50), 1e-6)).toBe(false);
    expect(anyEdgeNear(r.outline, P(3000, 0), 1e-6)).toBe(false);
    // But the head's own face on the far side is still drawn.
    expect(anyEdgeNear(r.outline, P(3000, -100), 1e-6)).toBe(true);
    // and the two re-entrant corners exist.
    expect(vertKeys(r.outline).has(pointKey(P(2900, 100)))).toBe(true);
    expect(vertKeys(r.outline).has(pointKey(P(3100, 100)))).toBe(true);
  });

  it("an X: one outline, four re-entrant corners, no line through the crossing", () => {
    const r = join([
      { points: [P(0, 0), P(6000, 0)], thickness: 200 },
      { points: [P(3000, -3000), P(3000, 3000)], thickness: 200 },
    ]);
    expect(r.outline).toHaveLength(1);
    expect(anyEdgeNear(r.outline, P(3000, 0), 1e-6)).toBe(false);
    for (const c of [P(2900, -100), P(3100, -100), P(2900, 100), P(3100, 100)]) {
      expect(vertKeys(r.outline).has(pointKey(c))).toBe(true);
    }
  });

  it("two collinear walls end to end read as ONE face, with no cap between them", () => {
    const r = join([
      { points: [P(0, 0), P(3000, 0)], thickness: 200 },
      { points: [P(3000, 0), P(6000, 0)], thickness: 200 },
    ]);
    expect(r.outline).toHaveLength(1);
    // Four vertices, not eight: the two caps at x = 3000 are gone and the two collinear
    // face runs have merged.
    expect(allVerts(r.outline)).toHaveLength(4);
    expect(anyEdgeNear(r.outline, P(3000, 0), 1e-6)).toBe(false);
    expect(Math.abs(loopArea(r.outline[0]!))).toBeCloseTo(6200 * 200, 6);
  });

  it("a partition ENDING inside a thicker wall has its cap swallowed", () => {
    const r = join([
      { points: [P(0, 0), P(6000, 0)], thickness: 400, group: "concrete" },
      { points: [P(3000, 0), P(3000, 4000)], thickness: 100, group: "concrete" },
    ]);
    // The stem's cap sits at y = -50, deep inside the 400 mm head (y ∈ [-200, 200]).
    expect(anyEdgeNear(r.outline, P(3000, -50), 1e-6)).toBe(false);
    expect(anyEdgeNear(r.outline, P(2950, 0), 1e-6)).toBe(false);
    // The head's own faces survive intact.
    expect(anyEdgeNear(r.outline, P(3000, -200), 1e-6)).toBe(true);
  });

  it("duplicate identical walls yield the SAME outline as one of them", () => {
    const one = join([{ points: [P(0, 0), P(4000, 0)], thickness: 200 }]);
    const two = join([
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
    ]);
    expect(vertKeys(two.outline)).toEqual(vertKeys(one.outline));
    expect(two.outline).toHaveLength(1);
    expect(Math.abs(loopArea(two.outline[0]!))).toBeCloseTo(Math.abs(loopArea(one.outline[0]!)), 6);
  });

  it("a zero-thickness or zero-length wall contributes nothing and never throws", () => {
    expect(() => join([{ points: [P(0, 0), P(1000, 0)], thickness: 0 }])).not.toThrow();
    expect(join([{ points: [P(0, 0), P(1000, 0)], thickness: 0 }]).outline).toEqual([]);
    expect(join([{ points: [P(0, 0), P(0, 0)], thickness: 200 }]).outline).toEqual([]);
    const mixed = join([
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
      { points: [P(0, 0), P(0, 0)], thickness: 200 },
      { points: [P(1000, 1000), P(2000, 1000)], thickness: 0 },
    ]);
    expect(mixed.outline).toHaveLength(1);
  });

  it("joinWalls of NO walls is empty, and still reports every requested group", () => {
    const r = joinWalls([], [], ["brick", "concrete"]);
    expect(r.outline).toEqual([]);
    expect(r.fills.map((f) => f.group)).toEqual(["brick", "concrete"]);
    expect(r.fills.every((f) => f.loops.length === 0)).toBe(true);
  });
});

/* --------------------------------------------------- the villa's shared centreline */

describe("a thin partition on a thick shell's centreline (examples/hillside-villa.arch)", () => {
  // The real case: `component ensuite` draws its own 100 mm ring, and every instance
  // backs one edge onto the 250 mm `shell` running along the SAME line. Before joinery
  // that laid two partition faces down inside the shell's poché.
  const src = readFileSync("examples/hillside-villa.arch", "utf8");

  it("the example really does declare that pairing (the fixture is not stale)", () => {
    expect(src).toContain("wall id=wall partition thickness 100");
    expect(src).toContain("wall id=shell exterior thickness 250");
  });

  const r = join([
    { points: [P(0, 0), P(10000, 0)], thickness: 250, group: "brick" },
    { points: [P(2000, 0), P(5000, 0)], thickness: 100, group: "brick" },
  ]);

  it("the partition's own faces vanish inside the shell", () => {
    expect(anyEdgeNear(r.outline, P(3000, 50), 1e-6)).toBe(false);
    expect(anyEdgeNear(r.outline, P(3000, -50), 1e-6)).toBe(false);
    expect(anyEdgeNear(r.outline, P(2000, 0), 1e-6)).toBe(false);
  });

  it("the outline is exactly the shell's own rectangle", () => {
    expect(r.outline).toHaveLength(1);
    expect(allVerts(r.outline)).toHaveLength(4);
    expect(Math.abs(loopArea(r.outline[0]!))).toBeCloseTo(10250 * 250, 6);
  });
});

/* --------------------------------------------------------------------- openings */

describe("opening cuts", () => {
  it("on a straight host: the face is absent between the jambs and the jambs are drawn", () => {
    const r = join([{ points: [P(0, 0), P(6000, 0)], thickness: 200, openings: [{ at: P(3000, 0), width: 900 }] }]);
    // The face between the jambs is gone …
    expect(anyEdgeNear(r.outline, P(3000, 100), 1e-6)).toBe(false);
    expect(anyEdgeNear(r.outline, P(3000, -100), 1e-6)).toBe(false);
    // … and outside them it is still there.
    expect(anyEdgeNear(r.outline, P(1000, 100), 1e-6)).toBe(true);
    expect(anyEdgeNear(r.outline, P(5000, -100), 1e-6)).toBe(true);
    // Both jamb reveals are drawn.
    expect(anyEdgeNear(r.outline, P(2550, 0), 1e-6)).toBe(true);
    expect(anyEdgeNear(r.outline, P(3450, 0), 1e-6)).toBe(true);
    // The doorway is a real hole in the solid.
    expect(insideAny(r.outline, P(3000, 0))).toBe(false);
    expect(insideAny(r.outline, P(1000, 0))).toBe(true);
  });

  it("on an ANGLED host the cut turns with the wall", () => {
    const r = join([
      {
        points: [P(0, 0), P(4000, 4000)],
        thickness: 200,
        openings: [{ at: P(2000, 2000), width: 900 }],
      },
    ]);
    expect(insideAny(r.outline, P(2000, 2000))).toBe(false);
    expect(insideAny(r.outline, P(500, 500))).toBe(true);
  });

  it("on an ARC host the cut is an annular sector and the curve stops at the jambs", () => {
    const arc = arcFromChord(P(2000, 0), P(-2000, 0), 2000, "cw", false)!;
    const r = join([
      {
        points: [P(2000, 0), P(-2000, 0)],
        arcs: [arc],
        thickness: 200,
        openings: [{ at: P(0, 2000), width: 900 }],
      },
    ]);
    // A point on the wall centreline at the opening is void; one a quarter turn away is solid.
    expect(insideAny(r.outline, P(0, 2000))).toBe(false);
    expect(insideAny(r.outline, P(2000, 0))).toBe(true);
    // The two faces still curve: some arc edge survives.
    expect(r.outline.some((l) => l.some((e) => e.t === "arc"))).toBe(true);
  });

  it("the area removed equals the cut's own area (nothing else is lost)", () => {
    const solid = join([{ points: [P(0, 0), P(6000, 0)], thickness: 200 }]);
    const holed = join([{ points: [P(0, 0), P(6000, 0)], thickness: 200, openings: [{ at: P(3000, 0), width: 900 }] }]);
    const area = (ls: EdgeLoop[]) => ls.reduce((s, l) => s + Math.abs(loopArea(l)), 0);
    // The doorway splits the run in two, so the outline is two loops whose total area is
    // the solid's minus the cut's.
    expect(area(solid.outline) - area(holed.outline)).toBeCloseTo(900 * 200, 6);
  });
});

/* ------------------------------------------------------------------------ curves */

describe("curves", () => {
  it("two 180° arcs closing a circle emit MINOR pieces with no extra vertex introduced", () => {
    const a1 = arcFromChord(P(38000, 14000), P(22000, 14000), 8000, "ccw", false)!;
    const a2 = arcFromChord(P(22000, 14000), P(38000, 14000), 8000, "ccw", false)!;
    const r = join([
      {
        points: [P(38000, 14000), P(22000, 14000), P(38000, 14000)],
        arcs: [a1, a2],
        closed: true,
        thickness: 200,
      },
    ]);
    expect(r.outline).toHaveLength(2);
    for (const l of r.outline) expect(l.every((e) => e.t === "arc")).toBe(true);
    // Exact annulus, computed with no tessellation anywhere.
    const areas = r.outline.map((l) => Math.abs(loopArea(l))).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(Math.PI * 8100 * 8100, 3);
    expect(areas[1]).toBeCloseTo(Math.PI * 7900 * 7900, 3);

    // Emission: a full circle becomes 3 x 120° pieces, and that is ALL — no vertex is
    // introduced beyond the piece boundaries the `arc` contract forces.
    const prim = emitLoops(r.outline);
    expect(prim.t).toBe("path");
    if (prim.t === "path") {
      for (const lp of prim.loops) {
        expect(lp.edges).toHaveLength(3);
        expect(lp.edges.every((e) => e.t === "arc")).toBe(true);
      }
    }
  });

  it("a curved wall meeting a straight one keeps its arc and loses the crossing lines", () => {
    const arc = arcFromChord(P(4400, 10200), P(1600, 10200), 2000, "cw", false)!;
    const r = join([
      {
        points: [P(13800, 10200), P(4400, 10200), P(1600, 10200), P(0, 10200)],
        arcs: [undefined, arc, undefined],
        thickness: 250,
      },
      { points: [P(0, 10200), P(0, 0)], thickness: 250 },
    ]);
    expect(r.outline.some((l) => l.some((e) => e.t === "arc"))).toBe(true);
    // Nothing runs through the corner where the two walls meet.
    expect(anyEdgeNear(r.outline, P(0, 10200), 1e-6)).toBe(false);
  });
});

/* ------------------------------------------------------------------------- fills */

describe("fills by material group", () => {
  // A 100 mm brick partition running INTO a 250 mm concrete shell.
  const specs: WallSpec[] = [
    { points: [P(0, 0), P(10000, 0)], thickness: 250, group: "concrete" },
    { points: [P(5000, 0), P(5000, 4000)], thickness: 100, group: "brick" },
  ];

  it("the brick fill stops at the concrete's face — its cap does not enter the shell", () => {
    const r = join(specs);
    const brick = r.fills.find((f) => f.group === "brick")!.loops;
    expect(brick.length).toBeGreaterThan(0);
    // The brick region must not include any point inside the concrete band.
    for (const y of [-100, 0, 100]) {
      expect(insideAny(brick, P(5000, y))).toBe(false);
    }
    // But it does include the partition below the shell's face.
    expect(insideAny(brick, P(5000, 500))).toBe(true);
    expect(insideAny(brick, P(5000, 3900))).toBe(true);
  });

  it("the two groups' fills do not overlap anywhere", () => {
    const r = join(specs);
    const brick = r.fills.find((f) => f.group === "brick")!.loops;
    const concrete = r.fills.find((f) => f.group === "concrete")!.loops;
    let both = 0;
    let either = 0;
    for (let x = -300; x <= 10300; x += 37) {
      for (let y = -300; y <= 4300; y += 23) {
        const p = P(x, y);
        const a = insideAny(brick, p);
        const b = insideAny(concrete, p);
        if (a && b) both++;
        if (a || b) either++;
      }
    }
    expect(both).toBe(0);
    expect(either).toBeGreaterThan(100);
  });

  it("their union is the outline — every sampled point agrees", () => {
    const r = join(specs);
    const brick = r.fills.find((f) => f.group === "brick")!.loops;
    const concrete = r.fills.find((f) => f.group === "concrete")!.loops;
    let mismatches = 0;
    for (let x = -300; x <= 10300; x += 37) {
      for (let y = -300; y <= 4300; y += 23) {
        const p = P(x, y);
        const union = insideAny(brick, p) || insideAny(concrete, p);
        if (union !== insideAny(r.outline, p)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("a single-group plan puts every wall in that one fill", () => {
    const r = join([
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
      { points: [P(4000, 0), P(4000, 3000)], thickness: 200 },
    ]);
    expect(r.fills).toHaveLength(1);
    expect(vertKeys(r.fills[0]!.loops)).toEqual(vertKeys(r.outline));
  });
});

/* ---------------------------------------------------------------------- closed ring */

describe("a closed ring with partitions", () => {
  // The partition runs to the RING'S CENTRELINES, so its square caps (y = -50 and 6050)
  // land inside the ring's own poché (y ∈ [-125, 125] and [5875, 6125]) and the two rooms
  // are genuinely separate. A partition stopped at the inner faces would float, leaving
  // one connected room and a second outer loop.
  const r = join([
    { points: [P(0, 0), P(8000, 0), P(8000, 6000), P(0, 6000)], closed: true, thickness: 250 },
    { points: [P(4000, 0), P(4000, 6000)], thickness: 100 },
  ]);

  it("gives one outer loop and the holes the rooms make", () => {
    const outer = r.outline.filter((l) => loopArea(l) > 0);
    const holes = r.outline.filter((l) => loopArea(l) < 0);
    expect(outer).toHaveLength(1);
    expect(holes).toHaveLength(2); // the partition splits the interior in two
    expect(Math.abs(loopArea(outer[0]!))).toBeCloseTo(8250 * 6250, 6);
  });

  it("fills solid in the walls and hollow in both rooms", () => {
    expect(insideAny(r.outline, P(4000, 0))).toBe(true); // the north wall
    expect(insideAny(r.outline, P(4000, 3000))).toBe(true); // the partition
    expect(insideAny(r.outline, P(2000, 3000))).toBe(false); // room A
    expect(insideAny(r.outline, P(6000, 3000))).toBe(false); // room B
    expect(insideAny(r.outline, P(-200, 3000))).toBe(false); // outside
  });
});

/* -------------------------------------------------------------------- emission */

describe("emitLoops / loopsToPolygons", () => {
  it("an all-straight set becomes a `region` — the primitive every backend already has", () => {
    const r = join([{ points: [P(0, 0), P(4000, 0)], thickness: 200 }]);
    const prim = emitLoops(r.outline);
    expect(prim.t).toBe("region");
    if (prim.t === "region") expect(prim.loops[0]).toHaveLength(4);
  });

  it("a set with any curve becomes a `path`, arcs cut into minor pieces", () => {
    const arc = arcFromChord(P(2000, 0), P(0, 2000), 2000, "ccw", false)!;
    const r = join([{ points: [P(2000, 0), P(0, 2000)], arcs: [arc], thickness: 200 }]);
    const prim = emitLoops(r.outline);
    expect(prim.t).toBe("path");
    if (prim.t === "path") {
      const arcs = prim.loops.flatMap((l) => l.edges.filter((e) => e.t === "arc"));
      expect(arcs.length).toBeGreaterThan(0);
      // Every emitted arc is a MINOR piece: its chord is at most 2r·sin(60°).
      for (const lp of prim.loops) {
        let from = lp.start;
        for (const e of lp.edges) {
          if (e.t === "arc") {
            const chord = Math.hypot(e.to.x - from.x, e.to.y - from.y);
            expect(chord).toBeLessThanOrEqual(2 * e.r * Math.sin(Math.PI / 3) + 1e-6);
          }
          from = e.to;
        }
      }
      // The closing edge is present: the last edge lands back on the start.
      for (const lp of prim.loops) {
        const last = lp.edges[lp.edges.length - 1]!;
        expect(pointKey(last.to)).toBe(pointKey(lp.start));
      }
    }
  });

  it("loopsToPolygons tessellates for a hatch, without repeating a shared endpoint", () => {
    const arc = arcFromChord(P(2000, 0), P(0, 2000), 2000, "ccw", false)!;
    const r = join([{ points: [P(2000, 0), P(0, 2000)], arcs: [arc], thickness: 200 }]);
    const polys = loopsToPolygons(r.outline);
    expect(polys).toHaveLength(r.outline.length);
    for (const poly of polys) {
      expect(poly.length).toBeGreaterThan(3);
      expect(pointKey(poly[0]!)).not.toBe(pointKey(poly[poly.length - 1]!));
    }
  });
});

/* ------------------------------------------------- regressions from failing seeds */

describe("regressions — cases a property run found, pinned as examples", () => {
  /** Every loop closes: each edge ends where the next begins, cyclically. */
  const allClosed = (loops: EdgeLoop[]): boolean =>
    loops.every((l) => l.every((e, k) => pointKey(edgeEnd(e)) === pointKey(edgeStart(l[(k + 1) % l.length]!))));

  it("a lone curved wall yields ONE closed loop — not a stray one-edge loop beside it", () => {
    // `joinWalls` used to build its own `PointInterner` and leave the caller's alone, so
    // a band vertex and a split point at the SAME position were different objects. Every
    // identity test in the layer then answered "different", `addSplit` registered a split
    // AT an endpoint, and the 0.014 mm sub-edge that produced came back as a loop of its
    // own with an area of 0.012 mm². One interner per call, seeded from the input, is the
    // fix; this is the smallest input that showed it.
    const arc = arcFromChord(P(0, 0), P(1500, 0), 1401.6082102156001, "ccw", false)!;
    const r = join([{ points: [P(0, 0), P(1500, 0)], arcs: [arc], thickness: 120 }]);
    expect(r.outline).toHaveLength(1);
    expect(r.outline[0]).toHaveLength(8);
    expect(allClosed(r.outline)).toBe(true);
    expect(Math.abs(loopArea(r.outline[0]!))).toBeGreaterThan(200000);
  });

  it("a bulging arc into an acute straight run closes, though the band overlaps ITSELF", () => {
    // The case that rules out the purely analytic side rule. A 120° arc meeting a nearly
    // reversed straight run buries part of its own boundary inside its own solid — the
    // true windings there are 2 and 1, not 1 and 0 — so "the own band's material is on
    // the side its coincident edge says" keeps an edge that must be dropped.
    const arc = arcFromChord(P(0, 0), P(1500, 0), 862.4999999999999, "cw", false)!;
    const r = join([
      {
        points: [P(0, 0), P(1500, 0), P(1284.8304283909251, -1484.4871354961508)],
        arcs: [arc, undefined],
        thickness: 120,
      },
    ]);
    expect(allClosed(r.outline)).toBe(true);
    expect(r.outline.every((l) => l.length >= 3 || l.some((e) => e.t === "arc"))).toBe(true);
  });

  it("an opening centred on a deep arc leaves two closed halves, no 0.01 mm sliver", () => {
    // Two points 0.01 mm apart could round to different interner cells and stay distinct
    // while `pointKey` called them equal; the chainer, which keys vertices by `pointKey`,
    // then read the sliver between them as a self-loop. The fuse radius is now the cell
    // DIAGONAL, so same key implies same object.
    const arc = arcFromChord(P(-500, 0), P(3445.3873829037966, 0), 2280.882896778086, "cw", false)!;
    const r = join([
      {
        points: [P(-500, 0), P(3445.3873829037966, 0)],
        arcs: [arc],
        thickness: 310,
        openings: [{ at: arcPointAt(arc, 0.5), width: 700 }],
      },
    ]);
    expect(r.outline).toHaveLength(2);
    expect(allClosed(r.outline)).toBe(true);
    // The doorway splits the wall into two equal halves.
    const [a, b] = r.outline.map((l) => Math.abs(loopArea(l)));
    expect(a).toBeCloseTo(b!, 3);
  });

  it("the caller need NOT share an interner with joinWalls", () => {
    // The same plan built with one interner per wall must join identically to one built
    // with a single shared interner — the API must not depend on the caller's bookkeeping.
    const specs: WallSpec[] = [
      { points: [P(0, 0), P(4000, 0)], thickness: 200 },
      { points: [P(4000, 0), P(4000, 3000)], thickness: 200 },
    ];
    const shared = join(specs);
    const perWall = specs.map((spec, index) => {
      const own = new PointInterner();
      const loops = wallBand({ thickness: spec.thickness, points: spec.points, closed: false }, own);
      return { index, id: `w${index}`, thickness: spec.thickness, group: "brick", loops, bbox: bandBBox(loops) };
    });
    const split = joinWalls(perWall, [], ["brick"]);
    expect(vertKeys(split.outline)).toEqual(vertKeys(shared.outline));
    expect(split.outline.map((l) => l.length)).toEqual(shared.outline.map((l) => l.length));
  });
});
