import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/ast.js";
import { buildDoorAccessGraph, DEFAULT_TOL, resolvePlan } from "../src/analyze.js";
import { computeCirculation } from "../src/analyze/circulation.js";
import type { RDoor, RFurniture, ROpening, RRoom, RVoid, RWall, ResolvedPlan } from "../src/ir.js";
import { type RVertical, verticalsOf } from "../src/vertical.js";

/**
 * Circulation is invariant under a translation of the RESOLVED plan — including a
 * non-integer one, which re-rounds every coordinate it touches (`x + 0.3` is not exact).
 *
 * The nav grid samples every input relative to its extent's min corner, snapped to a
 * 2⁻¹⁰ mm lattice (`toExtentFrame`, `src/analyze/circulation.ts`), so the few ulps a
 * translation costs never reach a fact. The claim is not "bit-for-bit under ANY vector":
 * a relative residue within about an ulp of a half-quantum could still round the other way.
 * This pins the measured reality on the two shipped examples with curves — the plans whose
 * tessellated rings are exactly what used to re-round (backlog E.11).
 */

const exampleWorld = {
  read: (p: string) => {
    try {
      return readFileSync(`examples/${p.replace(/^\.\//, "")}`, "utf8");
    } catch {
      return null;
    }
  },
};

const shift =
  (d: Point) =>
  (p: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

/** Circulation of a resolved plan, every coordinate translated by `d` first. */
function circulationOf(ir: ResolvedPlan, d: Point) {
  const s = shift(d);
  const at = <T extends { at: Point }>(e: T): T => ({ ...e, at: s(e.at) });
  const host = <T extends { host: RDoor["host"] }>(e: T): T =>
    e.host
      ? {
          ...e,
          host: {
            ...e.host,
            a: s(e.host.a),
            b: s(e.host.b),
            ...(e.host.arc
              ? { arc: { ...e.host.arc, center: s(e.host.arc.center), a: s(e.host.arc.a), b: s(e.host.arc.b) } }
              : {}),
          },
        }
      : e;
  const rooms = ir.elements
    .filter((e): e is RRoom => e.kind === "room")
    .map((r) => ({
      ...at(r),
      ...(r.poly ? { poly: r.poly.map(s) } : {}),
      ...(r.circle ? { circle: { ...r.circle, c: s(r.circle.c) } } : {}),
    }));
  const walls: RWall[] = ir.walls.map((w) => ({
    ...w,
    points: w.points.map(s),
    ...(w.arcs ? { arcs: w.arcs.map((a) => (a ? { ...a, center: s(a.center), a: s(a.a), b: s(a.b) } : a)) } : {}),
  }));
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door").map((e) => host(at(e)));
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening").map((e) => host(at(e)));
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture").map(at);
  const verticals = verticalsOf(ir).map((v) => at(v) as RVertical);
  const voids = ir.elements.filter((e): e is RVoid => e.kind === "void").map(at);
  const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
  return computeCirculation(rooms, walls, doors, openings, furniture, access, DEFAULT_TOL, undefined, verticals, voids);
}

const VECTORS: Point[] = [
  { x: 0.3, y: 0.7 },
  { x: 1 / 3, y: 1 / 3 },
  { x: 1e6 + 0.1, y: 1e6 + 0.1 },
  { x: -20000.25, y: 7.125 },
];

describe("circulation is invariant under a non-integer translation of the resolved plan", () => {
  for (const name of ["aquarium.arch", "hexagon-pavilion.arch"]) {
    it(name, () => {
      const { ir } = resolvePlan(readFileSync(`examples/${name}`, "utf8"), { world: exampleWorld });
      expect(ir).not.toBeNull();
      const at0 = circulationOf(ir!, { x: 0, y: 0 });
      expect(at0?.rooms.length).toBeGreaterThan(3); // the comparison has something in it
      for (const d of VECTORS) expect(circulationOf(ir!, d), JSON.stringify(d)).toEqual(at0);
    });
  }

  it("is not vacuous: a vector moves a relative coordinate by an ulp", () => {
    const { ir } = resolvePlan(readFileSync("examples/aquarium.arch", "utf8"), { world: exampleWorld });
    // Every coordinate the translation touches: a vector that round-trips all of them
    // exactly would test nothing.
    const pts: Point[] = [
      ...ir!.elements.flatMap((e) => ("at" in e && e.at ? [e.at as Point] : [])),
      ...ir!.elements.flatMap((e) => (e.kind === "room" ? [...(e.poly ?? []), ...(e.circle ? [e.circle.c] : [])] : [])),
      ...ir!.walls.flatMap((w) => [...w.points, ...(w.arcs ?? []).flatMap((a) => (a ? [a.center] : []))]),
    ];
    // At least one vector moves a coordinate RELATIVE to the plan's corner by an ulp — what
    // the snap absorbs. (The others re-round ABSOLUTE samples; on the code before the
    // snapped frame this suite's first two cases fail at (0.3, 0.7) on both examples.)
    const o = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
    const moved = VECTORS.filter((d) =>
      pts.some((p) => p.x + d.x - (o.x + d.x) !== p.x - o.x || p.y + d.y - (o.y + d.y) !== p.y - o.y),
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});
