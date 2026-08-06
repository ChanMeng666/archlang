import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, repair, suggestTopology } from "../src/index.js";
import { planToJson, planFromJson } from "../src/plan-json.js";
import { resolve } from "../src/ir.js";
import { parse } from "../src/parser.js";
import type { RRoom } from "../src/ir.js";
import {
  collinearOverlapLength,
  distToPolygonEdge,
  effectiveVertices,
  polygonArea,
  polygonCentroid,
  polygonLabelPoint,
  polygonSelfIntersects,
  polygonsOverlap,
  pointInPolygon,
} from "../src/geometry/polygon.js";
import { computeRoomClearances } from "../src/analyze/occupancy.js";
import { fmt2 } from "../src/num-format.js";

/**
 * Polygonal rooms (v1.23) — `room polygon (x,y) …`.
 *
 * The discipline this suite exists to hold: a polygon room is measured EXACTLY where the
 * feature generalises (area, centroid, adjacency, containment, occupancy, door
 * attribution, instance transforms), and every rect-only feature it meets fails with a
 * crisp catalogued diagnostic instead of quietly answering about a bounding box. The
 * final block pins the other half of the contract — an all-rectangle plan is untouched.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const codes = (src: string): string[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "");
const rooms = (src: string): RRoom[] =>
  resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");

/** An L: 12 × 8 m with a 6 × 6 m leg below its left half. */
const L_ROOM = "room id=g polygon (0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000)";

describe("polygon rooms — parsing and shape", () => {
  it("parses a ≥3-vertex ring and keeps the vertices, grid-snapped, in source order", () => {
    const [r] = rooms(`plan "P" { grid 100 ${L_ROOM} }`);
    expect(r!.poly).toEqual([
      { x: 0, y: 0 },
      { x: 12000, y: 0 },
      { x: 12000, y: 8000 },
      { x: 6000, y: 8000 },
      { x: 6000, y: 14000 },
      { x: 0, y: 14000 },
    ]);
  });

  it("derives at/size as the ring's BOUNDING BOX, so a rect-shaped reader still sees a truthful extent", () => {
    const [r] = rooms(`plan "P" { ${L_ROOM} }`);
    expect(r!.at).toEqual({ x: 0, y: 0 });
    expect(r!.size).toEqual({ w: 12000, h: 14000 });
  });

  it("snaps vertices to the grid like every other coordinate", () => {
    const [r] = rooms('plan "P" { grid 500 room polygon (0,0) (3300,0) (3300,2200) }');
    expect(r!.poly).toEqual([
      { x: 0, y: 0 },
      { x: 3500, y: 0 },
      { x: 3500, y: 2000 },
    ]);
  });

  it("rejects fewer than three vertices at parse time (returned, never thrown)", () => {
    const ds = compile('plan "P" { room polygon (0,0) (1000,0) }', { noCache: true }).diagnostics;
    const err = ds.find((d) => d.severity === "error")!;
    expect(err.message).toContain("at least three vertices");
    expect(err.span).toBeDefined();
  });
});

describe("polygon rooms — exact area (shoelace)", () => {
  const areaOf = (ring: string): number => polygonArea(rooms(`plan "P" { room polygon ${ring} }`)[0]!.poly!);

  it("measures a convex quadrilateral against the hand-computed area", () => {
    // Trapezoid, parallel sides 6000 and 4000, height 3000 → (6000+4000)/2 · 3000.
    expect(areaOf("(0,0) (6000,0) (5000,3000) (1000,3000)")).toBe(15_000_000);
  });

  it("measures a CONCAVE L against the hand-computed area (not its bounding box)", () => {
    // 12 × 8 + 6 × 6 = 132 m²; the bounding box would claim 12 × 14 = 168 m².
    expect(areaOf("(0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000)")).toBe(132_000_000);
  });

  it("is winding-independent (a ring traced anticlockwise has the same area)", () => {
    expect(areaOf("(0,0) (0,14000) (6000,14000) (6000,8000) (12000,8000) (12000,0)")).toBe(132_000_000);
  });

  it("reports that exact area through describe(), the schedule and the drawn label", () => {
    const src = `plan "P" { schedule rooms\n  ${L_ROOM} label "Gallery" }`;
    const d = describePlan(src);
    expect(d.rooms[0]!.area_m2).toBe(132);
    expect(d.schedule?.[0]?.area_m2).toBe(132);
    expect(compile(src, { noCache: true }).svg).toContain("132.0 m²");
  });

  it("gives describe() the ring as floor_polygon while bbox stays the vertex extent", () => {
    const d = describePlan(`plan "P" { ${L_ROOM} }`);
    expect(d.rooms[0]!.floor_polygon).toHaveLength(6);
    expect(d.rooms[0]!.bbox).toEqual({ x: 0, y: 0, w: 12000, h: 14000 });
    // No stray key leaks out of the analysis layer's RoomBox into the JSON.
    expect(Object.keys(d.rooms[0]!.bbox)).toEqual(["x", "y", "w", "h"]);
  });
});

describe("polygon rooms — rejected rings", () => {
  it("rejects a self-intersecting bow-tie", () => {
    expect(codes('plan "P" { room polygon (0,0) (4000,4000) (4000,0) (0,4000) }')).toContain(
      "E_ROOM_POLY_SELF_INTERSECT",
    );
  });

  it("rejects a ring whose points are all collinear (fewer than three effective vertices)", () => {
    expect(codes('plan "P" { room polygon (0,0) (4000,0) (8000,0) }')).toContain("E_ROOM_POLY_DEGENERATE");
  });

  it("rejects a ring that collapses to a point", () => {
    expect(codes('plan "P" { room polygon (0,0) (0,0) (0,0) }')).toContain("E_ROOM_POLY_DEGENERATE");
  });

  it("accepts a ring carrying a redundant collinear vertex (it is a real, simple polygon)", () => {
    const cs = codes('plan "P" { room polygon (0,0) (4000,0) (8000,0) (8000,4000) (0,4000) }');
    expect(cs).not.toContain("E_ROOM_POLY_DEGENERATE");
    expect(cs).not.toContain("E_ROOM_POLY_SELF_INTERSECT");
  });

  it("counts effective vertices with duplicates and straight-through points removed", () => {
    expect(
      effectiveVertices([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toHaveLength(0);
    expect(
      effectiveVertices([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ]),
    ).toHaveLength(3);
  });

  it("detects self-intersection on the ring, not just on declared edges", () => {
    // The closing edge (last → first) is what crosses here.
    expect(
      polygonSelfIntersects([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 2, y: -2 },
      ]),
    ).toBe(true);
  });
});

describe("polygon rooms — label placement", () => {
  it("puts the label and area at the AREA CENTROID by default", () => {
    const c = polygonCentroid(rooms(`plan "P" { ${L_ROOM} }`)[0]!.poly!);
    // Closed form for the L: the centroid of the two rectangles, area-weighted.
    expect(c.x).toBeCloseTo((96e6 * 6000 + 36e6 * 3000) / 132e6, 6);
    expect(c.y).toBeCloseTo((96e6 * 4000 + 36e6 * 11000) / 132e6, 6);
    expect(compile(`plan "P" { ${L_ROOM} label "G" }`, { noCache: true }).svg).toContain(`x="${c.x.toFixed(2)}"`);
  });

  it('honours an explicit `label "…" at (x,y)` override', () => {
    const [r] = rooms(`plan "P" { ${L_ROOM} label "G" at (3000,12000) }`);
    expect(r!.labelAt).toEqual({ x: 3000, y: 12000 });
    expect(compile(`plan "P" { ${L_ROOM} label "G" at (3000,12000) }`, { noCache: true }).svg).toContain('x="3000"');
  });

  it("warns (advisory) when that override falls outside the room", () => {
    // (9000,12000) is in the L's NOTCH — inside the bounding box, outside the floor.
    expect(codes(`plan "P" { ${L_ROOM} label "G" at (9000,12000) }`)).toContain("W_ROOM_LABEL_OUTSIDE");
    expect(codes(`plan "P" { ${L_ROOM} label "G" at (3000,12000) }`)).not.toContain("W_ROOM_LABEL_OUTSIDE");
  });

  it("keeps the warning advisory — the plan still compiles and draws", () => {
    const r = compile(`plan "P" { ${L_ROOM} label "G" at (9000,12000) }`, { noCache: true });
    expect(r.errors).toEqual([]);
    expect(r.svg).toContain("<svg");
  });
});

/**
 * The concave fallback. A U (or a thin L) can put its exact area centroid in its own
 * notch — off the floor entirely — and the label would then be drawn over a neighbouring
 * room. The rule: centroid whenever the centroid is legal (so nothing that already drew
 * correctly moves), pole of inaccessibility only when it is not.
 */
describe("polygon rooms — the label point is always on the floor", () => {
  /**
   * A U: 10 × 10 m with a 4 × 8 m bite out of the top, off-centre — so its two legs are
   * 2 m and 4 m wide and the widest place on the floor is unambiguous (the right leg).
   */
  const U = [
    { x: 0, y: 0 },
    { x: 2000, y: 0 },
    { x: 2000, y: 8000 },
    { x: 6000, y: 8000 },
    { x: 6000, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ];
  const U_ROOM = `room id=u polygon ${U.map((p) => `(${p.x},${p.y})`).join(" ")}`;
  /** A thin L: two 2 m-wide legs, 12 m long — its centroid sits in the open quadrant. */
  const THIN_L = "room id=t polygon (0,0) (12000,0) (12000,2000) (2000,2000) (2000,12000) (0,12000)";

  it("confirms the premise: these rings really do put their centroid OFF the floor", () => {
    for (const src of [`plan "P" { ${U_ROOM} }`, `plan "P" { ${THIN_L} }`]) {
      const ring = rooms(src)[0]!.poly!;
      const c = polygonCentroid(ring);
      expect(pointInPolygon(c.x, c.y, ring)).toBe(false);
    }
  });

  it("places the label STRICTLY inside the ring instead of at the outside centroid", () => {
    for (const src of [`plan "P" { ${U_ROOM} }`, `plan "P" { ${THIN_L} }`]) {
      const ring = rooms(src)[0]!.poly!;
      const p = polygonLabelPoint(ring);
      expect(pointInPolygon(p.x, p.y, ring)).toBe(true);
      // Not merely inside — off the boundary, in the widest part of the floor.
      expect(distToPolygonEdge(p, ring)).toBeGreaterThan(500);
    }
  });

  it("finds the WIDEST part of the floor — the 4 m leg, not the 2 m one or the base", () => {
    // Right leg: 4 m wide → 2 m of clearance. Left leg and base: 2 m wide → 1 m. The
    // maximum is exact and the search lands on it, not merely somewhere legal.
    const p = polygonLabelPoint(U);
    expect(p.x).toBeGreaterThan(6000);
    expect(p.x).toBeLessThan(10000);
    expect(distToPolygonEdge(p, U)).toBe(2000);
  });

  it("reaches the DRAWING: the label and area text move with it", () => {
    const svg = compile(`plan "P" { ${U_ROOM} label "Hall" }`, { noCache: true }).svg;
    const ring = rooms(`plan "P" { ${U_ROOM} }`)[0]!.poly!;
    const p = polygonLabelPoint(ring);
    expect(svg).toContain(`x="${fmt2(p.x)}"`);
    // The old behaviour would have printed the centroid, which is in the bite.
    const c = polygonCentroid(ring);
    expect(svg).not.toContain(`x="${fmt2(c.x)}" y="${fmt2(c.y)}"`);
  });

  it("is deterministic — the same ring yields byte-identical output every time", () => {
    const src = `plan "P" { ${U_ROOM} label "Hall" }`;
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    expect(polygonLabelPoint(U)).toEqual(polygonLabelPoint([...U]));
  });

  it("is winding-independent, like every other polygon answer", () => {
    expect(polygonLabelPoint([...U].reverse())).toEqual(polygonLabelPoint(U));
  });

  it("an explicit `label … at` still wins, warning and all (the author overrides everything)", () => {
    const src = `plan "P" { ${U_ROOM} label "Hall" at (5000,4000) }`;
    expect(compile(src, { noCache: true }).svg).toContain('x="5000"');
    expect(codes(src)).toContain("W_ROOM_LABEL_OUTSIDE");
  });

  it("RETURNS THE CENTROID UNCHANGED wherever the centroid is legal (the byte-identity pin)", () => {
    // A convex ring, a concave-but-well-behaved L, and a rectangle traced as a polygon:
    // the fallback must be unreachable for all three, object-identical to the closed form.
    for (const ring of [
      "(0,0) (6000,0) (5000,3000) (1000,3000)",
      "(0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000)",
      "(0,0) (4000,0) (4000,3000) (0,3000)",
    ]) {
      const poly = rooms(`plan "P" { room polygon ${ring} }`)[0]!.poly!;
      expect(polygonLabelPoint(poly)).toEqual(polygonCentroid(poly));
    }
  });

  it("leaves the polygon flagship's bytes alone (no golden churn for a legal centroid)", () => {
    // `gallery` is labelled automatically and `lobby` by an explicit anchor — between
    // them they cover both paths, and neither one moves.
    const svg = compile(example("gallery-l.arch"), { noCache: true }).svg;
    const ring = rooms(example("gallery-l.arch")).find((r) => r.id === "gallery")!.poly!;
    const c = polygonCentroid(ring);
    expect(pointInPolygon(c.x, c.y, ring)).toBe(true);
    expect(polygonLabelPoint(ring)).toEqual(c);
    expect(svg).toContain(`x="${fmt2(c.x)}"`);
    expect(svg).toContain('x="8200"');
  });
});

describe("polygon rooms — adjacency", () => {
  const adjacencyOf = (src: string) => describePlan(src).rooms.map((r) => [r.id, r.adjacent]);

  it("joins a polygon room to a rect room sharing a boundary run", () => {
    expect(
      adjacencyOf(`plan "P" {
        ${L_ROOM}
        room id=annex at (6000,8000) size 6000x6000
      }`),
    ).toEqual([
      ["g", ["annex"]],
      ["annex", ["g"]],
    ]);
  });

  it("joins two polygon rooms sharing a SLOPING boundary", () => {
    expect(
      adjacencyOf(`plan "P" {
        room id=a polygon (0,0) (6000,0) (2000,6000) (0,6000)
        room id=b polygon (6000,0) (8000,6000) (2000,6000)
      }`),
    ).toEqual([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
  });

  it("does NOT join rooms that only touch at a corner", () => {
    expect(
      adjacencyOf(`plan "P" {
        room id=a polygon (0,0) (4000,0) (4000,4000) (0,4000)
        room id=b polygon (4000,4000) (8000,4000) (8000,8000) (4000,8000)
      }`),
    ).toEqual([
      ["a", []],
      ["b", []],
    ]);
  });

  it("measures the shared run itself, so a graze shorter than nothing does not count", () => {
    const a1 = { x: 0, y: 0 };
    const a2 = { x: 1000, y: 0 };
    // Parallel, 100 mm apart (a partition), overlapping 400 mm.
    expect(collinearOverlapLength(a1, a2, { x: 600, y: 100 }, { x: 1600, y: 100 }, 200)).toBe(400);
    // Same run, but 600 mm apart — too far to be one boundary.
    expect(collinearOverlapLength(a1, a2, { x: 600, y: 600 }, { x: 1600, y: 600 }, 200)).toBe(0);
  });
});

describe("polygon rooms — overlap lint is exact, not bounding-box", () => {
  it("does not warn when a room sits in an L's notch (boxes overlap, floors do not)", () => {
    expect(
      codes(`plan "P" {
        ${L_ROOM}
        room id=annex at (6000,8000) size 6000x6000
      }`),
    ).not.toContain("W_ROOM_OVERLAP");
  });

  it("warns when the floors really do intersect", () => {
    expect(
      codes(`plan "P" {
        ${L_ROOM}
        room id=annex at (4000,6000) size 6000x6000
      }`),
    ).toContain("W_ROOM_OVERLAP");
  });

  it("polygonsOverlap: shared edge is not an overlap, containment is", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const rightOf = square.map((p) => ({ x: p.x + 100, y: p.y }));
    const inner = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ];
    const cross = [
      { x: -50, y: 40 },
      { x: 150, y: 40 },
      { x: 150, y: 60 },
      { x: -50, y: 60 },
    ];
    expect(polygonsOverlap(square, rightOf)).toBe(false);
    expect(polygonsOverlap(square, inner)).toBe(true);
    expect(polygonsOverlap(square, cross)).toBe(true);
  });
});

describe("polygon rooms — doors, windows and occupancy", () => {
  const PLAN = `plan "P" {
    grid 100
    wall exterior thickness 300 { (0,0) (12000,0) (12000,9000) (6000,14000) (0,14000) close }
    wall id=spine partition thickness 150 { (6000,8000) (6000,14000) }
    ${L_ROOM} label "Gallery"
    room id=lobby polygon (6000,8000) (12000,8000) (12000,9000) (6000,14000) label "Lobby"
    door id=entry on exterior at 51% width 1500 swing in
    door id=inner on spine at 50% width 1200 swing in
  }`;

  it("attributes a door on an ANGLED wall to the polygon room it opens into", () => {
    const d = describePlan(PLAN);
    expect(d.doors.find((x) => x.id === "entry")!.between).toEqual(["exterior", "lobby"]);
  });

  it("attributes an interior door to both polygon rooms it joins", () => {
    const d = describePlan(PLAN);
    expect(d.doors.find((x) => x.id === "inner")!.between).toEqual(["g", "lobby"]);
  });

  it("makes both polygon rooms reachable from the entrance", () => {
    const a = describePlan(PLAN).access;
    expect(a.hasEntrance).toBe(true);
    expect(a.rooms.map((r) => [r.id, r.reachable, r.depthFromEntrance])).toEqual([
      ["g", true, 2],
      ["lobby", true, 1],
    ]);
  });

  it("rasterises occupancy over the RING, so the notch is not counted as floor", () => {
    const ir = resolve(parse(PLAN).plan!).ir;
    const rs = ir.elements.filter((e): e is RRoom => e.kind === "room");
    const doors = ir.elements.filter((e): e is never => e.kind === "door") as never[];
    const cl = computeRoomClearances(rs, [], doors, [], ir.walls, 200);
    const gallery = cl.find((c) => c.roomId === "g")!;
    expect(gallery.hasConnector).toBe(true);
    // 132 m² of floor, not the bounding box's 168 — within one cell row of the exact area.
    expect(gallery.totalClearAreaM2).toBeGreaterThan(130);
    expect(gallery.totalClearAreaM2).toBeLessThan(134);
  });

  it("keeps a polygon room out of the fixture-orientation rule (it has no north side)", () => {
    const src = `plan "P" {
      wall exterior thickness 200 { (0,0) (6000,0) (6000,6000) (3000,6000) (3000,9000) (0,9000) close }
      room id=g polygon (0,0) (6000,0) (6000,6000) (3000,6000) (3000,9000) (0,9000) label "Wet room" uses bath
      furniture wc at (2000,300) size 400x700
    }`;
    expect(lint(src).map((d) => d.code)).not.toContain("W_FIXTURE_BACK_TO_ROOM");
  });
});

describe("polygon rooms — rect-only features refuse, they never approximate", () => {
  it("E_PLACE_POLY: relational placement against a polygon reference", () => {
    const cs = codes(`plan "P" {
      ${L_ROOM}
      room id=b right-of g size 3000x3000
    }`);
    expect(cs).toContain("E_PLACE_POLY");
  });

  it("E_PLACE_POLY names the way out (`at (x,y)`)", () => {
    const d = compile(`plan "P" { ${L_ROOM}\n room id=b right-of g size 3000x3000 }`, {
      noCache: true,
    }).diagnostics.find((x) => x.code === "E_PLACE_POLY");
    expect(d!.message).toContain("at (x,y)");
  });

  it("E_PLACE_POLY: `in <polygon room> anchor …` furniture placement", () => {
    expect(codes(`plan "P" { ${L_ROOM}\n furniture wc in g anchor bottom-left size 400x700 }`)).toContain(
      "E_PLACE_POLY",
    );
  });

  it("E_PLACE_POLY: `in <polygon room> centered` furniture placement", () => {
    expect(codes(`plan "P" { ${L_ROOM}\n furniture bed in g centered size 1500x2000 }`)).toContain("E_PLACE_POLY");
  });

  it("absolute `at` furniture inside a polygon room is fine (the escape hatch works)", () => {
    expect(codes(`plan "P" { ${L_ROOM}\n furniture wc at (1000,1000) size 400x700 rotate 90 in g }`)).not.toContain(
      "E_PLACE_POLY",
    );
  });

  it("`against wall` is unaffected — walls are walls whatever shape the room is", () => {
    const src = `plan "P" {
      wall id=w exterior thickness 200 { (0,0) (6000,0) }
      ${L_ROOM}
      furniture counter against wall w side right size 2000x600
    }`;
    expect(codes(src)).not.toContain("E_PLACE_POLY");
  });

  it("repair() declines a piece whose declared room is a polygon, and SAYS SO in `unresolved`", () => {
    const src = `plan "P" {
      wall exterior thickness 200 { (0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000) close }
      ${L_ROOM} label "Gallery"
      door id=d on exterior at 10% width 900
      furniture sofa at (1000,-50) size 2000x900 in g
    }`;
    const r = repair(src);
    expect(r.unresolved.map((n) => n.reason).join(" ")).toContain("polygon");
    expect(r.unresolved.some((n) => n.id.startsWith("sofa"))).toBe(true);
    expect(r.changes).toEqual([]);
  });

  it("suggest() offers no candidate ON a polygon room (silence beats an edge it does not have)", () => {
    const src = `plan "P" {
      wall exterior thickness 200 { (0,0) (12000,0) (12000,8000) (6000,8000) (6000,14000) (0,14000) close }
      ${L_ROOM} label "Gallery"
    }`;
    expect(suggestTopology(src).flatMap((s) => (s.roomId === "g" ? [s.code] : []))).toEqual([]);
  });
});

describe("polygon rooms — composition (zones, levels, placed instances)", () => {
  it("is legal inside a zone and rolls up into the zone's area", () => {
    const d = describePlan(`plan "P" { zone north { ${L_ROOM} label "Gallery" } }`);
    expect(d.zones?.[0]?.floor_area_m2).toBe(132);
  });

  it("is legal inside a level", () => {
    const r = compile(`plan "P" { level 1 { ${L_ROOM} } level 2 { room at (0,0) size 4000x4000 } }`, {
      noCache: true,
    });
    expect(r.errors).toEqual([]);
    expect(r.pages).toHaveLength(2);
  });

  it("a placed instance transforms the ring EXACTLY (rotate 90 is an integer isometry)", () => {
    const src = `plan "P" {
      component wing() { room id=main polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,6000) (0,6000) }
      place wing() as west at (10000,0) rotate 90
    }`;
    const [r] = rooms(src);
    // (x,y) → (−y, x) about the origin, then translated by the instance's `at`.
    expect(r!.id).toBe("west.main");
    expect(r!.poly).toEqual([
      { x: 10000, y: 0 },
      { x: 10000, y: 4000 },
      { x: 8000, y: 4000 },
      { x: 8000, y: 2000 },
      { x: 4000, y: 2000 },
      { x: 4000, y: 0 },
    ]);
  });

  it("the transform preserves area, and the instance's bbox follows the ring", () => {
    const src = `plan "P" {
      component wing() { room id=main polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,6000) (0,6000) }
      place wing() as west at (10000,0) rotate 90
    }`;
    const [r] = rooms(src);
    expect(polygonArea(r!.poly!)).toBe(4000 * 2000 + 2000 * 4000);
    expect(r!.at).toEqual({ x: 4000, y: 0 });
    expect(r!.size).toEqual({ w: 6000, h: 4000 });
  });

  it("a mirrored instance keeps the ring simple and the area unchanged", () => {
    const src = `plan "P" {
      component wing() { room id=main polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,6000) (0,6000) }
      place wing() as east at (0,0) mirror x
    }`;
    const [r] = rooms(src);
    expect(polygonSelfIntersects(r!.poly!)).toBe(false);
    expect(polygonArea(r!.poly!)).toBe(16_000_000);
  });
});

describe("polygon rooms — dimension chains and Plan JSON", () => {
  it("contributes VERTEX coordinates to the `dims auto rooms` chain", () => {
    const svg = compile(`plan "P" { dims auto rooms\n ${L_ROOM} }`, { noCache: true }).svg;
    // The L's step at x = 6000 is a room boundary, so the bottom chain reads 6000 · 6000.
    expect(svg.match(/>6000</g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("round-trips through Plan JSON as a POLYGON, not as its bounding box", () => {
    const src = `plan "P" { ${L_ROOM} label "Gallery" }`;
    const json = planToJson(src).json!;
    expect(json.rooms[0]!.polygon).toHaveLength(6);
    expect(json.rooms[0]!.area).toBe(132);
    const back = planFromJson(json);
    expect(back.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(back.source).toContain("room id=g polygon (0,0) (12000,0)");
    const [r] = resolve(back.ast!).ir.elements.filter((e): e is RRoom => e.kind === "room");
    expect(r!.poly).toHaveLength(6);
    expect(polygonArea(r!.poly!)).toBe(132_000_000);
  });

  it("rejects a JSON room whose polygon has fewer than three vertices", () => {
    const bad = {
      plan: "P",
      rooms: [
        {
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    } as never;
    expect(planFromJson(bad).diagnostics.some((d) => d.code === "E_JSON_SCHEMA")).toBe(true);
  });
});

describe("polygon rooms — determinism and the byte-identity of rectangular plans", () => {
  it("compiles byte-identically twice (the polygon path introduces no state)", () => {
    const src = example("gallery-l.arch");
    expect(compile(src, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("describe() is stable across repeated calls", () => {
    const src = example("gallery-l.arch");
    expect(JSON.stringify(describePlan(src))).toBe(JSON.stringify(describePlan(src)));
  });

  it("a rect room resolves with NO `poly` key at all (the absent-field contract)", () => {
    const [r] = rooms('plan "P" { room at (0,0) size 4000x3000 }');
    expect("poly" in r!).toBe(false);
    expect("labelAt" in r!).toBe(false);
  });

  it("point-in-polygon counts the boundary as inside, matching the rect convention", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(50, 50, sq)).toBe(true);
    expect(pointInPolygon(0, 50, sq)).toBe(true);
    expect(pointInPolygon(-1, 50, sq)).toBe(false);
  });
});
