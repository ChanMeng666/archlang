import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { describe as describePlan } from "../src/index.js";
import { buildDoorAccessGraph, DEFAULT_TOL, roomBox } from "../src/analyze.js";
import { computeCirculationOverlay } from "../src/analyze/circulation.js";
import { distToPolygonEdge, pointInPolygon, polygonCentroid, polygonLabelPoint } from "../src/geometry/polygon.js";
import { resolve } from "../src/ir.js";
import type { RDoor, RFurniture, ROpening, RRoom } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { verticalsOf } from "../src/vertical.js";
import type { Point } from "../src/ast.js";

/**
 * The circulation routing ANCHOR on a concave floor.
 *
 * Every circulation fact about a room is measured to one representative cell — its
 * anchor — and the anchor is the free nav cell nearest a seed point. The seed used to be
 * the polygon centroid, which an L, a U or a C can put in its own notch, OFF its floor:
 * the nearest in-room cell to an off-floor point is then pinned to the LIP of the notch,
 * so the walk, the detour ratio and the drawn overlay path all stop at the room's edge
 * instead of reaching its body. The seed is now `polygonLabelPoint` — the centroid
 * verbatim whenever the centroid is legal, the ring's pole of inaccessibility only when
 * it is not — the same rule commit `5480bb2` gave the LABEL one layer up.
 *
 * Nothing in the corpus exercises this (`examples/gallery-l.arch` is the only shipped
 * `room polygon` and its centroid is on its floor), so the fixture below is purpose-built
 * and proves its own premise before asserting anything.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/**
 * A U: 10 × 10 m with a 4 × 8 m bite out of the top, off-centre — so the left leg is 2 m
 * wide, the right leg 4 m, and the widest place to stand is unambiguously the right leg.
 * The exterior wall traces the same ring and the entrance is on the south facade, below
 * the notch, so the walk has to go round one leg to reach the anchor.
 */
const U_RING = "(0,0) (2000,0) (2000,8000) (6000,8000) (6000,0) (10000,0) (10000,10000) (0,10000)";
const U_PLAN = `plan "Concave" {
  units mm
  grid 100
  wall exterior thickness 200 { ${U_RING} close }
  room id=hall polygon ${U_RING} label "Hall"
  door id=entry at (5000,10000) width 900 wall exterior hinge left swing in
}`;

/** The ring the resolver actually built for `id`. */
const ringOf = (src: string, id: string): Point[] => {
  const rooms = resolve(parse(src).plan!).ir.elements.filter((e): e is RRoom => e.kind === "room");
  return roomBox(rooms.find((r) => r.id === id)!).poly!;
};

/**
 * Each room's routing anchor, read where it is observable: the overlay walk ends AT the
 * anchor cell's centre (`circulation.ts` — `reconstructPath(g, parent, anchor[ri])`), so
 * the last point of a room's path is the anchor. Same `buildNav` the facts use.
 */
const anchors = (src: string): { anchor: Map<string, Point>; cellSizeMm: number } => {
  const ir = resolve(parse(src).plan!).ir;
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
  const overlay = computeCirculationOverlay(
    rooms,
    ir.walls,
    doors,
    openings,
    furniture,
    access,
    DEFAULT_TOL,
    undefined,
    verticalsOf(ir),
  );
  expect(overlay).not.toBeNull();
  const anchor = new Map<string, Point>();
  for (const r of overlay!.rooms) anchor.set(r.roomId, r.path[r.path.length - 1]!);
  return { anchor, cellSizeMm: overlay!.cellSizeMm };
};

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("circulation — a concave room's routing anchor is on the room, not on its notch lip", () => {
  it("confirms the premise: this ring really does put its centroid OFF its own floor", () => {
    const ring = ringOf(U_PLAN, "hall");
    const c = polygonCentroid(ring);
    expect(pointInPolygon(c.x, c.y, ring)).toBe(false);
    // And the honest fallback has somewhere much better to stand: the 4 m leg's spine.
    expect(distToPolygonEdge(polygonLabelPoint(ring), ring)).toBe(2000);
  });

  it("anchors in the WIDEST part of the floor, a whole leg away from the notch", () => {
    const ring = ringOf(U_PLAN, "hall");
    const { anchor, cellSizeMm } = anchors(U_PLAN);
    const a = anchor.get("hall")!;

    // Inside the ring — which the nav grid alone guarantees, since a cell only joins a
    // room when its centre is in the ring. The real defect was WHERE inside: pre-fix the
    // anchor was (6150, 5450), 150 mm off the notch's inner face — the closest legal cell
    // to a point that is not on the floor at all.
    expect(pointInPolygon(a.x, a.y, ring)).toBe(true);
    expect(distToPolygonEdge(a, ring)).toBeGreaterThan(1500);

    // Strictly: the nearest free cell to the ring's pole of inaccessibility, within half
    // a cell diagonal of it. The old seed was 3.9 m away from this point.
    expect(dist(a, polygonLabelPoint(ring))).toBeLessThanOrEqual(cellSizeMm);
    expect(dist(a, polygonCentroid(ring))).toBeGreaterThan(2000);
  });

  it("reaches the reported facts: the walk goes to the room, not to the mouth of the notch", () => {
    const c = describePlan(U_PLAN).circulation;
    expect(c).not.toBeNull();
    if (!c) return;
    const hall = c.rooms.find((r) => r.roomId === "hall")!;
    // Entrance (5000, 10000) → anchor (~7950, 1950) on a 4-connected grid with the notch
    // in the way: ≈ 2.95 m across + 8.05 m up ≈ 11.0 m. The pre-fix anchor on the notch
    // lip read 5.6 m — a walk that stopped half the room short.
    expect(hall.walkDistanceMm).toBeGreaterThan(9500);
    expect(hall.walkDistanceMm).toBeLessThan(12500);
    expect(hall.detourRatio).toBeGreaterThanOrEqual(1);
    expect(hall.bottleneckClearWidthMm).toBe(840); // the 900 mm entrance, unchanged
  });

  it("is deterministic — the same source yields the same facts and the same anchor twice", () => {
    expect(describePlan(U_PLAN).circulation).toEqual(describePlan(U_PLAN).circulation);
    expect(describePlan(U_PLAN)).toEqual(describePlan(U_PLAN));
    expect([...anchors(U_PLAN).anchor]).toEqual([...anchors(U_PLAN).anchor]);
  });

  it("is INERT where the centroid was already legal — the polygon flagship does not move", () => {
    // `gallery-l` is the only shipped `room polygon`, and its centroid is on its floor, so
    // the new seed IS the old seed and its anchor still sits at the centroid cell. This is
    // why no golden, snapshot or example number changes with this fix.
    const src = example("gallery-l.arch");
    const ring = ringOf(src, "gallery");
    const c = polygonCentroid(ring);
    expect(pointInPolygon(c.x, c.y, ring)).toBe(true);
    expect(polygonLabelPoint(ring)).toEqual(c);
    const { anchor, cellSizeMm } = anchors(src);
    expect(dist(anchor.get("gallery")!, c)).toBeLessThanOrEqual(cellSizeMm);
  });

  it("leaves a rectangular room on its bbox centre (the untouched branch)", () => {
    const src = `plan "Rect" {
  units mm
  grid 100
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Living"
  door id=entry at (3000,4000) width 900 wall exterior hinge left swing in
}`;
    const { anchor, cellSizeMm } = anchors(src);
    expect(dist(anchor.get("a")!, { x: 3000, y: 2000 })).toBeLessThanOrEqual(cellSizeMm);
  });
});
