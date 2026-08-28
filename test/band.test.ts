/**
 * `src/geometry/band.ts` — a wall's two faces, its mitred corners and its caps, as exact
 * edge loops.
 *
 * Two things this file is careful about.
 *
 * **The offset SIGN is pinned by continuity, not by an assertion about the sign.** A
 * test that read the delta back out of the module would pass whatever the module chose.
 * The real law is that the `σ = +1` face of a straight run and of a tangent-continuous
 * arc that follows it are ONE unbroken curve — get the sign backwards and the two faces
 * jump a full thickness apart at the join, which no golden SVG would notice and this
 * does.
 *
 * **A lone straight segment must reproduce `segmentRectangle` EXACTLY**, point for point
 * and in order, because that is the shape every plan has been drawing since v0.1. A lone
 * arc deliberately does NOT reproduce `arcBandRing` byte for byte — `arcBandRing` caps by
 * dragging its first and last tessellated vertices, which cuts the corner; here the cap
 * POINTS are identical and the curve between them is a true arc. That difference is
 * asserted, not glossed.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { arcBandRing, arcFromChord, arcOffset, arcPointAt, arcTangentAt, fullCircleArc } from "../src/geometry/arc.js";
import type { Arc } from "../src/geometry/arc.js";
import type { Point } from "../src/ast.js";
import { distPointToSegment, segmentRectangle } from "../src/geometry.js";
import { MITER_LIMIT } from "../src/scene.js";
import { rectUnionOutline } from "../src/geometry/union.js";
import { meetLines, perp, sub2, unit2 } from "../src/geometry/intersect.js";
import {
  type BandWall,
  type Edge,
  type EdgeLoop,
  PointInterner,
  edgeEnd,
  edgeMid,
  edgeStart,
  edgeTangentAt,
  loopArea,
  loopBBox,
  loopWinding,
  loopsContain,
  openingCut,
  pointKey,
  reverseLoop,
  tessellateLoop,
  wallBand,
} from "../src/geometry/band.js";

const P = (x: number, y: number): Point => ({ x, y });
const wall = (w: Partial<BandWall> & { points: Point[]; thickness: number }): BandWall => ({
  closed: false,
  ...w,
});
const verts = (loop: EdgeLoop): Point[] => loop.map(edgeStart);
const near = (a: Point, b: Point, tol = 1e-9): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe("PointInterner", () => {
  it("fuses points within a tenth of a micron and hands back the FIRST object registered", () => {
    const i = new PointInterner();
    const a = i.get(P(10, 20));
    const b = i.get(P(10 + 1e-9, 20 - 1e-9));
    expect(b).toBe(a);
    expect(i.size).toBe(1);
  });

  it("keeps points a millimetre apart distinct", () => {
    const i = new PointInterner();
    i.get(P(0, 0));
    i.get(P(1, 0));
    expect(i.size).toBe(2);
  });

  it("normalises −0 so it cannot key differently from +0", () => {
    expect(pointKey(P(-0, -0))).toBe(pointKey(P(0, 0)));
    const i = new PointInterner();
    const z = i.get(P(-0, 5));
    expect(Object.is(z.x, -0)).toBe(false);
    expect(i.get(P(0, 5))).toBe(z);
  });
});

describe("wallBand — a single straight segment", () => {
  const w = wall({ points: [P(0, 0), P(4000, 0)], thickness: 200 });

  it("is ONE loop whose four vertices are segmentRectangle's — the same CYCLE", () => {
    const loops = wallBand(w, new PointInterner());
    expect(loops).toHaveLength(1);
    const loop = loops[0]!;
    expect(loop.every((e) => e.t === "line")).toBe(true);
    // `segmentRectangle`'s own order runs counter-clockwise on screen; `wallBand`
    // normalises every loop POSITIVE (see the orientation law), so the four points come
    // back as that CYCLE traversed the other way. Reversing a closed loop keeps its first
    // vertex where it is and reverses the rest, so [A,B,C,D] becomes [A,D,C,B] — the same
    // four points, the same shape, the opposite direction of travel.
    const [a, b, c, d] = segmentRectangle(P(0, 0), P(4000, 0), 200);
    expect(verts(loop)).toEqual([a, d, c, b]);
  });

  it("its area is the rectangle's, POSITIVE — every band loop obeys the orientation law", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    // 4200 long (200 of square cap) x 200 wide.
    expect(loopArea(loop)).toBeCloseTo(4200 * 200, 6);
  });

  it("contains its own middle and excludes a point outside the cap", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    expect(loopWinding(loop, P(2000, 0))).not.toBe(0);
    expect(loopWinding(loop, P(2000, 200))).toBe(0);
    expect(loopWinding(loop, P(4200, 0))).toBe(0); // just past the cap
    expect(loopWinding(loop, P(4050, 0))).not.toBe(0); // inside it
  });

  it("a vertical segment is exact — no ulp drift on an axis-aligned face", () => {
    const v = wall({ points: [P(4100, 0), P(4100, 3000)], thickness: 250 });
    const loop = wallBand(v, new PointInterner())[0]!;
    for (const p of verts(loop)) {
      expect([3975, 4225]).toContain(p.x);
      expect([-125, 3125]).toContain(p.y);
    }
  });

  it("declines a wall of zero or negative thickness rather than inverting", () => {
    expect(wallBand(wall({ points: [P(0, 0), P(1000, 0)], thickness: 0 }), new PointInterner())).toEqual([]);
    expect(wallBand(wall({ points: [P(0, 0), P(1000, 0)], thickness: -50 }), new PointInterner())).toEqual([]);
  });

  it("declines a zero-length wall", () => {
    expect(wallBand(wall({ points: [P(0, 0), P(0, 0)], thickness: 200 }), new PointInterner())).toEqual([]);
  });
});

describe("wallBand — a single arc", () => {
  const arc = arcFromChord(P(2000, 0), P(0, 2000), 2000, "ccw", false)!;
  const w = wall({ points: [P(2000, 0), P(0, 2000)], arcs: [arc], thickness: 200 });

  it("caps at exactly the points arcBandRing caps at, with TRUE arcs between them", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    const ring = arcBandRing(arc, 200);
    // Two true arc edges (the two faces) plus the two straight cap tails.
    expect(loop.filter((e) => e.t === "arc")).toHaveLength(2);
    // arcBandRing's first and last ring vertices are its two outer-face cap points, and
    // the two around the turn are the inner-face ones.
    const capPoints = [ring[0]!, ring[ring.length - 1]!];
    const loopPts = verts(loop);
    for (const c of capPoints) {
      expect(loopPts.some((p) => near(p, c, 1e-9))).toBe(true);
    }
  });

  it("its two arc faces are exactly arcOffset(arc, ±h) — never a faceted approximation", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    const radii = loop.flatMap((e) => (e.t === "arc" ? [e.arc.r] : []));
    expect(radii.sort((a, b) => a - b)).toEqual([1900, 2100]);
  });

  it("its area is the EXACT annular sector plus two square caps — no tessellation in it", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    // (θ/2)(R² − r²) for the quarter-turn band, plus a h x thickness cap at each end.
    const exact = (Math.PI / 2 / 2) * (2100 * 2100 - 1900 * 1900) + 2 * (100 * 200);
    expect(Math.abs(loopArea(loop))).toBeCloseTo(exact, 6);
  });

  it("and that exact area is within a chord's sagitta of the tessellated arcBandRing", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    const ring = arcBandRing(arc, 200);
    let shoelace = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      shoelace += a.x * b.y - b.x * a.y;
    }
    // The true-arc band is slightly LARGER than the polygon inscribed in it; 0.5% is
    // comfortably inside one 7.5° chord's sagitta on a 2 m radius.
    expect(Math.abs(Math.abs(loopArea(loop)) / Math.abs(shoelace / 2) - 1)).toBeLessThan(0.005);
  });

  it("contains a point on the wall centreline and excludes one well off it", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    // The centreline midpoint comes from the arc itself — the chord midpoint is not on it.
    const mid = arcPointAt(arc, 0.5);
    expect(loopWinding(loop, mid)).not.toBe(0);
    expect(loopWinding(loop, arc.center)).toBe(0);
    expect(loopWinding(loop, P(3000, 3000))).toBe(0);
  });
});

describe("wallBand — the offset SIGN, pinned by tangent continuity", () => {
  it("a straight run and a tangent arc after it share one continuous σ=+1 face", () => {
    // A horizontal run east to (2000,0), then a quarter arc curving down to (4000,2000)
    // about (2000,2000) — the tangent at (2000,0) is (+1,0), matching the run exactly.
    const arc = arcFromChord(P(2000, 0), P(4000, 2000), 2000, "cw", false)!;
    expect(arc.center.x).toBeCloseTo(2000, 9);
    expect(arc.center.y).toBeCloseTo(2000, 9);
    const t = arcTangentAt(arc, arc.a);
    expect(t.x).toBeCloseTo(1, 9);
    expect(t.y).toBeCloseTo(0, 9);

    const w = wall({ points: [P(0, 0), P(2000, 0), P(4000, 2000)], arcs: [undefined, arc], thickness: 200 });
    const loop = wallBand(w, new PointInterner())[0]!;

    // Both offset faces of the join must be CONTINUOUS: no bevel edge is inserted and no
    // vertex sits a thickness away from where the two faces should meet.
    const keys = new Set(verts(loop).map(pointKey));
    for (const sigma of [1, -1] as const) {
      const n = perp(unit2(sub2(P(2000, 0), P(0, 0))));
      const meet = { x: 2000 + sigma * 100 * n.x, y: 0 + sigma * 100 * n.y };
      expect(keys.has(pointKey(meet))).toBe(true);
      // And the arc face on that side really is concentric at r ∓ 100 through that point.
      const onCircle = Math.hypot(meet.x - arc.center.x, meet.y - arc.center.y);
      expect([1900, 2100]).toContain(Math.round(onCircle));
    }
    // Exactly two arc edges (the two faces of the curve) and no inserted bevel. The six
    // lines are: the two straight faces, the two cap TAILS the curved end needs (an arc
    // face cannot be extended along itself), and the two end caps stitching the sides.
    expect(loop.filter((e) => e.t === "arc")).toHaveLength(2);
    expect(loop.filter((e) => e.t === "line")).toHaveLength(6);
  });
});

describe("wallBand — corners", () => {
  it("a 90° L mitres to exactly the rectangle union's vertex set", () => {
    const w = wall({ points: [P(0, 0), P(4000, 0), P(4000, 3000)], thickness: 200 });
    const loop = wallBand(w, new PointInterner())[0]!;
    const mine = new Set(verts(loop).map(pointKey));
    const union = rectUnionOutline([
      { x0: -100, y0: -100, x1: 4100, y1: 100 },
      { x0: 3900, y0: -100, x1: 4100, y1: 3100 },
    ]);
    const theirs = new Set(union.flat().map(pointKey));
    expect(mine).toEqual(theirs);
    // ... and every corner is on an integer, not an ulp off one.
    for (const p of verts(loop)) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it("a hexagon's 120° corner lands exactly on `meet` of the two offset face lines", () => {
    const R = 3000;
    const pts: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const th = (i * Math.PI) / 3;
      pts.push({ x: R * Math.cos(th), y: R * Math.sin(th) });
    }
    const w = wall({ points: pts, closed: true, thickness: 200 });
    const loops = wallBand(w, new PointInterner());
    expect(loops).toHaveLength(2);
    const all = loops.flatMap(verts);
    // The outer face corner at vertex pts[1], derived independently by intersecting the
    // two offset lines through `meetLines` (the same solve `elements/roof.ts` uses).
    for (const sigma of [1, -1] as const) {
      const prevA = pts[0]!;
      const V = pts[1]!;
      const nextB = pts[2]!;
      const d1 = unit2(sub2(V, prevA));
      const d2 = unit2(sub2(nextB, V));
      const n1 = perp(d1);
      const n2 = perp(d2);
      const m = meetLines(
        { x: prevA.x + sigma * 100 * n1.x, y: prevA.y + sigma * 100 * n1.y },
        d1,
        { x: V.x + sigma * 100 * n2.x, y: V.y + sigma * 100 * n2.y },
        d2,
      )!;
      expect(all.some((p) => near(p, m, 1e-9))).toBe(true);
    }
  });

  it("a 5° spike BEVELS — no vertex sits farther than MITER_LIMIT·h from the apex", () => {
    const h = 100;
    const th = (5 * Math.PI) / 180;
    const apex = P(0, 0);
    const w = wall({
      points: [P(6000, 0), apex, { x: 6000 * Math.cos(th), y: 6000 * Math.sin(th) }],
      thickness: 2 * h,
    });
    const loop = wallBand(w, new PointInterner())[0]!;
    // An unbevelled mitre at 5° would be h/sin(2.5°) ≈ 22.9h from the apex.
    const naive = h / Math.sin(th / 2);
    expect(naive).toBeGreaterThan(MITER_LIMIT * h);
    // Every band vertex must stay within MITER_LIMIT·h of the wall's own CENTRELINE —
    // the far ends legitimately sit 6 m from the apex, so distance-to-apex alone would
    // be the wrong ruler. An unbevelled mitre would sit ~2290 mm off the centreline.
    const centre = [[P(6000, 0), apex] as const, [apex, { x: 6000 * Math.cos(th), y: 6000 * Math.sin(th) }] as const];
    for (const p of verts(loop)) {
      const d = Math.min(...centre.map(([a, b]) => distPointToSegment(p, a, b)));
      expect(d).toBeLessThanOrEqual(MITER_LIMIT * h + 1e-9);
    }
    // The bevel is a real inserted edge on each side, so the loop carries more than the
    // four faces + two end caps a mitred pair would give.
    expect(loop.length).toBeGreaterThan(6);
  });
});

describe("wallBand — the hillside-villa bay (a NON-tangent line/arc mitre)", () => {
  // examples/hillside-villa.arch, wall `shell`: … (4400,10200) arc (1600,10200) radius
  // 2000 cw (0,10200) … — the bowed bay in the south wall. The arc is NOT tangent to
  // either straight neighbour, so the join is a genuine line/circle mitre.
  const src = readFileSync("examples/hillside-villa.arch", "utf8");
  const arc = arcFromChord(P(4400, 10200), P(1600, 10200), 2000, "cw", false)!;
  const w = wall({
    points: [P(13800, 10200), P(4400, 10200), P(1600, 10200), P(0, 10200)],
    arcs: [undefined, arc, undefined],
    thickness: 250,
  });

  it("the example really does declare that bay (the fixture is not stale)", () => {
    expect(src).toContain("arc (1600,10200) radius 2000 cw");
    expect(src).toContain("(4400,10200)");
  });

  it("the arc is genuinely non-tangent to its straight neighbour", () => {
    const t = arcTangentAt(arc, arc.a);
    // The straight run arrives heading west; a tangent join would need t ≈ (−1, 0).
    expect(Math.abs(t.y)).toBeGreaterThan(0.1);
  });

  it("the mitre point lies on BOTH the offset line and the offset circle, to 1e-9", () => {
    const loops = wallBand(w, new PointInterner());
    expect(loops).toHaveLength(1);
    const loop = loops[0]!;
    for (const sigma of [1, -1] as const) {
      const h = 125;
      const faceY = 10200 + sigma * h * perp(unit2(sub2(P(4400, 10200), P(13800, 10200)))).y;
      const delta = -Math.sign(arc.sweep) * sigma * h;
      const offCircle = arcOffset(arc, delta);
      const hit = verts(loop).filter(
        (p) =>
          Math.abs(p.y - faceY) < 1e-9 &&
          Math.abs(Math.hypot(p.x - offCircle.center.x, p.y - offCircle.center.y) - offCircle.r) < 1e-9,
      );
      expect(hit.length).toBeGreaterThan(0);
    }
  });

  it("the mitre point is the SAME OBJECT on both the line edge and the arc edge", () => {
    const loop = wallBand(w, new PointInterner())[0]!;
    let shared = 0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if (a.t !== b.t) {
        expect(edgeEnd(a)).toBe(edgeStart(b));
        shared++;
      }
    }
    expect(shared).toBeGreaterThan(0);
  });
});

describe("wallBand — a closed ring", () => {
  const w = wall({
    points: [P(0, 0), P(6000, 0), P(6000, 4000), P(0, 4000)],
    closed: true,
    thickness: 200,
  });

  it("gives an OUTER loop with positive area and a HOLE with negative", () => {
    const [outer, hole] = wallBand(w, new PointInterner());
    expect(outer).toBeDefined();
    expect(hole).toBeDefined();
    expect(loopArea(outer!)).toBeGreaterThan(0);
    expect(loopArea(hole!)).toBeLessThan(0);
    expect(Math.abs(loopArea(outer!))).toBeGreaterThan(Math.abs(loopArea(hole!)));
    // 6200x4200 outer minus 5800x3800 hole = the ring's poché area.
    expect(loopArea(outer!)).toBeCloseTo(6200 * 4200, 6);
    expect(loopArea(hole!)).toBeCloseTo(-(5800 * 3800), 6);
  });

  it("fills as a ring under the nonzero rule — solid in the wall, empty in the room", () => {
    const loops = wallBand(w, new PointInterner());
    expect(loopsContain(loops, P(3000, 0))).toBe(true); // in the north wall
    expect(loopsContain(loops, P(3000, 2000))).toBe(false); // in the room
    expect(loopsContain(loops, P(3000, -300))).toBe(false); // outside
  });

  it("gives the SAME two loops however the author wound the ring", () => {
    const ccw = wall({
      points: [P(0, 4000), P(6000, 4000), P(6000, 0), P(0, 0)],
      closed: true,
      thickness: 200,
    });
    const a = wallBand(w, new PointInterner());
    const b = wallBand(ccw, new PointInterner());
    expect(loopArea(a[0]!)).toBeCloseTo(loopArea(b[0]!), 6);
    expect(loopArea(a[1]!)).toBeCloseTo(loopArea(b[1]!), 6);
    expect(loopsContain(b, P(3000, 0))).toBe(true);
    expect(loopsContain(b, P(3000, 2000))).toBe(false);
  });
});

describe("wallBand — the aquarium drum (two arcs closing a circle)", () => {
  // examples/aquarium.arch, wall `rotunda`: (30000,14000) arc (22000,14000) radius 8000
  // arc (38000,14000) radius 8000 close — two default-`ccw` semicircles about (30000,14000).
  const src = readFileSync("examples/aquarium.arch", "utf8");
  const a1 = arcFromChord(P(38000, 14000), P(22000, 14000), 8000, "ccw", false)!;
  const a2 = arcFromChord(P(22000, 14000), P(38000, 14000), 8000, "ccw", false)!;
  // The ring as the source writes it: a start vertex, two `arc` edges, `close`. The
  // closing segment is ZERO LENGTH — which is why `wallBand` decides "is this a cycle"
  // by asking whether the surviving run ends where it began, not by counting segments.
  const w = wall({
    points: [P(38000, 14000), P(22000, 14000), P(38000, 14000)],
    arcs: [a1, a2],
    closed: true,
    thickness: 200,
  });

  it("the example really does declare that drum (the fixture is not stale)", () => {
    expect(src).toContain("arc (22000,14000) radius 8000");
    expect(src).toContain("arc (38000,14000) radius 8000");
  });

  it("yields two loops whose faces are FULL circles at r ± h — no bevel, no cap", () => {
    const loops = wallBand(w, new PointInterner());
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      expect(loop.every((e) => e.t === "arc")).toBe(true);
      const total = loop.reduce((s, e) => s + (e.t === "arc" ? Math.abs(e.arc.sweep) : 0), 0);
      expect(total).toBeCloseTo(Math.PI * 2, 9);
      for (const e of loop) {
        if (e.t === "arc") {
          expect(e.arc.center.x).toBeCloseTo(30000, 6);
          expect(e.arc.center.y).toBeCloseTo(14000, 6);
          expect([7900, 8100]).toContain(Math.round(e.arc.r));
        }
      }
    }
  });

  it("its areas are the exact annulus, computed with no tessellation", () => {
    const [outer, hole] = wallBand(w, new PointInterner());
    expect(Math.abs(loopArea(outer!))).toBeCloseTo(Math.PI * 8100 * 8100, 3);
    expect(Math.abs(loopArea(hole!))).toBeCloseTo(Math.PI * 7900 * 7900, 3);
    expect(loopArea(outer!) > 0).toBe(true);
    expect(loopArea(hole!) < 0).toBe(true);
  });

  it("fills as an annulus: solid in the drum wall, empty inside and out", () => {
    const loops = wallBand(w, new PointInterner());
    expect(loopsContain(loops, P(38000, 14000))).toBe(true);
    expect(loopsContain(loops, P(30000, 14000))).toBe(false);
    expect(loopsContain(loops, P(30000, 30000))).toBe(false);
  });
});

describe("openingCut", () => {
  it("on a straight host it is the rotated rectangle, spanning width x thickness", () => {
    const w = wall({ points: [P(0, 0), P(6000, 0)], thickness: 200 });
    const cut = openingCut(w, { at: P(3000, 0), width: 900 }, new PointInterner())!;
    expect(cut).toHaveLength(4);
    expect(cut.every((e) => e.t === "line")).toBe(true);
    expect(Math.abs(loopArea(cut))).toBeCloseTo(900 * 200, 9);
    const box = loopBBox(cut);
    expect(box).toEqual({ minX: 2550, minY: -100, maxX: 3450, maxY: 100 });
  });

  it("on an ANGLED host it turns with the wall", () => {
    const w = wall({ points: [P(0, 0), P(3000, 3000)], thickness: 200 });
    const cut = openingCut(w, { at: P(1500, 1500), width: 900 }, new PointInterner())!;
    expect(Math.abs(loopArea(cut))).toBeCloseTo(900 * 200, 6);
    // Its long axis runs at 45°, so its bbox is a square of side (900+200)/√2.
    const box = loopBBox(cut);
    expect(box.maxX - box.minX).toBeCloseTo(1100 / Math.SQRT2, 6);
    expect(box.maxY - box.minY).toBeCloseTo(1100 / Math.SQRT2, 6);
  });

  it("on an ARC host it is an annular sector whose width is measured by ARC LENGTH", () => {
    const arc = arcFromChord(P(2000, 0), P(-2000, 0), 2000, "cw", false)!;
    const w = wall({ points: [P(2000, 0), P(-2000, 0)], arcs: [arc], thickness: 200 });
    const cut = openingCut(w, { at: P(0, 2000), width: 900 }, new PointInterner())!;
    expect(cut.filter((e) => e.t === "arc")).toHaveLength(2);
    expect(cut.filter((e) => e.t === "line")).toHaveLength(2);
    // Exact annular-sector area: (θ/2)(R² − r²) with θ = width/R.
    const theta = 900 / 2000;
    expect(Math.abs(loopArea(cut))).toBeCloseTo((theta / 2) * (2100 * 2100 - 1900 * 1900), 6);
  });

  it("the arc cut's jambs are RADIAL — both jamb lines point at the centre", () => {
    const arc = arcFromChord(P(2000, 0), P(-2000, 0), 2000, "cw", false)!;
    const w = wall({ points: [P(2000, 0), P(-2000, 0)], arcs: [arc], thickness: 200 });
    const cut = openingCut(w, { at: P(0, 2000), width: 900 }, new PointInterner())!;
    for (const e of cut) {
      if (e.t !== "line") continue;
      const d = unit2(sub2(e.b, e.a));
      const radial = unit2(sub2(e.a, arc.center));
      expect(Math.abs(Math.abs(d.x * radial.x + d.y * radial.y) - 1)).toBeLessThan(1e-9);
    }
  });

  it("picks the nearest host across a MIXED wall (straight run vs curve)", () => {
    const arc = arcFromChord(P(4000, 0), P(4000, 4000), 2000, "cw", false)!;
    const w = wall({ points: [P(0, 0), P(4000, 0), P(4000, 4000)], arcs: [undefined, arc], thickness: 200 });
    const onStraight = openingCut(w, { at: P(1000, 0), width: 800 }, new PointInterner())!;
    expect(onStraight.every((e) => e.t === "line")).toBe(true);
    const onCurve = openingCut(w, { at: P(6000, 2000), width: 800 }, new PointInterner())!;
    expect(onCurve.filter((e) => e.t === "arc")).toHaveLength(2);
  });

  it("declines a zero-width opening and a wall with no thickness", () => {
    const w = wall({ points: [P(0, 0), P(6000, 0)], thickness: 200 });
    expect(openingCut(w, { at: P(3000, 0), width: 0 }, new PointInterner())).toBeNull();
    const flat = wall({ points: [P(0, 0), P(6000, 0)], thickness: 0 });
    expect(openingCut(flat, { at: P(3000, 0), width: 900 }, new PointInterner())).toBeNull();
  });
});

describe("loop utilities", () => {
  const sq: EdgeLoop = (() => {
    const i = new PointInterner();
    return wallBand(wall({ points: [P(0, 0), P(1000, 0)], thickness: 200 }), i)[0]!;
  })();

  it("reverseLoop flips the sign of the area and preserves |area|", () => {
    const r = reverseLoop(sq);
    expect(loopArea(r)).toBeCloseTo(-loopArea(sq), 9);
    expect(r).toHaveLength(sq.length);
  });

  it("reverseLoop of an ARC loop negates every sweep and swaps the ends", () => {
    const circle = fullCircleArc(P(0, 0), 10);
    const loop: EdgeLoop = [{ t: "arc", arc: circle }];
    const r = reverseLoop(loop);
    const e = r[0]!;
    expect(e.t).toBe("arc");
    if (e.t === "arc") expect(e.arc.sweep).toBe(-circle.sweep);
    expect(loopArea(loop)).toBeCloseTo(-loopArea(r), 6);
  });

  it("tessellateLoop emits each shared endpoint once", () => {
    const pts = tessellateLoop(sq);
    expect(pts).toHaveLength(4);
    const arcLoop: EdgeLoop = [{ t: "arc", arc: fullCircleArc(P(0, 0), 10) }];
    const tess = tessellateLoop(arcLoop);
    expect(tess.length).toBeGreaterThan(8);
    // First and last are distinct — the closing point is implied, never repeated.
    expect(pointKey(tess[0]!)).not.toBe(pointKey(tess[tess.length - 1]!));
  });

  it("loopBBox uses closed-form arc extremes, not the tessellation", () => {
    const arc: Arc = fullCircleArc(P(100, 200), 50);
    const box = loopBBox([{ t: "arc", arc } as Edge]);
    expect(box).toEqual({ minX: 50, minY: 150, maxX: 150, maxY: 250 });
  });
});

describe("the ORIENTATION LAW — a band's material is on +perp of every loop edge", () => {
  /**
   * This is the law `joinery.ts` classifies sides by, with no epsilon: if it does not
   * hold for every loop of every band, the exact classification silently reads the wrong
   * side. It is asserted here by CONSTRUCTION rather than by inspecting a sign — step a
   * hundredth of a millimetre off each edge's midpoint both ways and check which side the
   * band's own winding says is solid.
   */
  const lawHolds = (loops: EdgeLoop[]): boolean => {
    const inside = (p: Point): boolean => loops.reduce((n, l) => n + loopWinding(l, p), 0) !== 0;
    const eps = 0.01;
    for (const l of loops) {
      for (const e of l) {
        const m = edgeMid(e);
        const n = perp(edgeTangentAt(e, m));
        if (!inside({ x: m.x + n.x * eps, y: m.y + n.y * eps })) return false;
        if (inside({ x: m.x - n.x * eps, y: m.y - n.y * eps })) return false;
      }
    }
    return true;
  };

  it("holds for an open straight run", () => {
    expect(lawHolds(wallBand(wall({ points: [P(0, 0), P(4000, 0)], thickness: 200 }), new PointInterner()))).toBe(true);
  });

  it("holds for an L, and for an oblique two-segment run", () => {
    expect(
      lawHolds(wallBand(wall({ points: [P(0, 0), P(4000, 0), P(4000, 3000)], thickness: 200 }), new PointInterner())),
    ).toBe(true);
    expect(
      lawHolds(wallBand(wall({ points: [P(0, 0), P(3000, 900), P(5000, 4000)], thickness: 240 }), new PointInterner())),
    ).toBe(true);
  });

  it("holds for a closed ring — outer AND hole — however the author wound it", () => {
    const cw = wall({ points: [P(0, 0), P(6000, 0), P(6000, 4000), P(0, 4000)], closed: true, thickness: 250 });
    const ccw = wall({ points: [P(0, 4000), P(6000, 4000), P(6000, 0), P(0, 0)], closed: true, thickness: 250 });
    expect(lawHolds(wallBand(cw, new PointInterner()))).toBe(true);
    expect(lawHolds(wallBand(ccw, new PointInterner()))).toBe(true);
  });

  it("holds for a curved run and for the aquarium drum", () => {
    const arc = arcFromChord(P(2000, 0), P(0, 2000), 2000, "ccw", false)!;
    expect(
      lawHolds(wallBand(wall({ points: [P(2000, 0), P(0, 2000)], arcs: [arc], thickness: 200 }), new PointInterner())),
    ).toBe(true);
    const a1 = arcFromChord(P(38000, 14000), P(22000, 14000), 8000, "ccw", false)!;
    const a2 = arcFromChord(P(22000, 14000), P(38000, 14000), 8000, "ccw", false)!;
    const drum = wall({
      points: [P(38000, 14000), P(22000, 14000), P(38000, 14000)],
      arcs: [a1, a2],
      closed: true,
      thickness: 200,
    });
    expect(lawHolds(wallBand(drum, new PointInterner()))).toBe(true);
  });

  it("holds for an opening cut too — its interior is on +perp", () => {
    const w = wall({ points: [P(0, 0), P(6000, 0)], thickness: 200 });
    const straight = openingCut(w, { at: P(3000, 0), width: 900 }, new PointInterner())!;
    expect(lawHolds([straight])).toBe(true);
    const arc = arcFromChord(P(2000, 0), P(-2000, 0), 2000, "cw", false)!;
    const curved = wall({ points: [P(2000, 0), P(-2000, 0)], arcs: [arc], thickness: 200 });
    const sector = openingCut(curved, { at: P(0, 2000), width: 900 }, new PointInterner())!;
    expect(lawHolds([sector])).toBe(true);
  });
});
