/**
 * A rectilinear `room polygon` inside `walls from rooms` (issue #363, card L1; ADR 0028 §3 as
 * amended). Inside the sweep a polygon is rectangles of one owner, and an edge with one room on
 * both sides is no wall, so the L stays one room and its walls come from its ring.
 *
 * What is here: the ring decided exactly, the walls of an L, a U, a comb and two interlocked Ls,
 * the several-run rules (`#n` names, `between … thickness` over every run, `open between`
 * refused, the pairwise forms left rectangle-only), the two equivalence laws, the D4 oracle on a
 * derived L, the budgets, and a digest table of the new plans. The byte-identity law for every
 * other plan is `test/rectilinear-rooms-byte-identity.test.ts`.
 *
 * A moved digest below is a finding to explain (`docs/testing.md` §3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, joinWallSet, lint, planJsonToArch, planToJson, resolvePlan } from "../src/index.js";
import type { Point } from "../src/ast.js";
import { clearResolveCache, evaluationSteps, resolveAll } from "../src/ir.js";
import { loopWinding } from "../src/geometry/band.js";
import { link } from "../src/import.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import {
  deriveWallsFromRooms,
  ringParts,
  type DerivedWallSpec,
  type TileRect,
  type TileRoom,
} from "../src/room-tiling.js";
import { NULL_WORLD } from "../src/world.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";
import { compareScenes, D4_ELEMENTS, frameFor, sceneOf, witnessCase, witnessPair } from "./d4-oracle.js";
import {
  BED,
  COMB_PLAN,
  INTERLOCKED_PLAN,
  ISSUE_PLAN,
  L_RING,
  L_RING_REVERSED,
  RECTILINEAR_PLANS,
  STATEMENT,
  U_PLAN,
} from "./rectilinear-rooms-plans.js";

const API: CompilerApi = { compile, describe, lint };
const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const LIV = `  room id=liv polygon ${L_RING} label "Living" uses living`;
const LIV_BED = `${LIV}\n${BED}\n`;

const errors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
const codes = (src: string): string[] => errors(src).map((d) => d.code!);

const wallsOf = (src: string) => {
  const ir = resolvePlan(src).ir;
  if (!ir) throw new Error(`the plan must resolve: ${JSON.stringify(errors(src).map((d) => d.message))}`);
  return ir.walls;
};
const pts = (s: string): Point[] => [...s.matchAll(/\((\d+),(\d+)\)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
const wall = (src: string, id: string) => wallsOf(src).find((w) => w.id === id)!;
const line = (src: string, id: string): number[] => wall(src, id).points.flatMap((p) => [p.x, p.y]);
const named = (src: string): string[] => wallsOf(src).map((w) => w.id);

suite("rectilinear only, decided exactly", () => {
  it("a ring with every edge horizontal or vertical joins the set, whichever way it is written", () => {
    const a = plan(`${LIV_BED}${STATEMENT}`);
    const b = plan(`  room id=liv polygon ${L_RING_REVERSED} label "Living" uses living\n${BED}\n${STATEMENT}`);
    expect(codes(a)).toEqual([]);
    expect(wallsOf(b).map((w) => [w.id, w.points, w.closed])).toEqual(
      wallsOf(a).map((w) => [w.id, w.points, w.closed]),
    );
  });

  it("a redundant vertex on an edge changes nothing", () => {
    const a = plan(`${LIV_BED}${STATEMENT}`);
    const ring = L_RING.replace("(6000,0)", "(2000,0) (6000,0)").replace(
      "(3000,3000) (3000,6000)",
      "(3000,3000) (3000,5000) (3000,6000)",
    );
    const b = plan(`  room id=liv polygon ${ring} label "Living" uses living\n${BED}\n${STATEMENT}`);
    expect(wallsOf(b).map((w) => [w.id, w.points])).toEqual(wallsOf(a).map((w) => [w.id, w.points]));
  });

  it("a four-cornered polygon is a rectangle by its ring: the same walls as `at … size`", () => {
    const ring = plan(
      `  room id=a polygon (0,0) (4000,0) (4000,3000) (0,3000)\n  room id=b at (4000,0) size 3000x3000\n${STATEMENT}`,
    );
    const box = plan(`  room id=a at (0,0) size 4000x3000\n  room id=b at (4000,0) size 3000x3000\n${STATEMENT}`);
    expect(wallsOf(ring).map((w) => [w.id, w.points])).toEqual(wallsOf(box).map((w) => [w.id, w.points]));
  });

  it("one edge a single millimetre off the axis keeps E_ROOM_NOT_RECTANGLE, in words that say why", () => {
    const src = plan(`  grid 1\n  room id=p polygon (0,0) (4000,1) (4000,3000) (0,3000)\n${STATEMENT}`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(d[0]!.message).toContain("rectangular or rectilinear rooms only");
    expect(d[0]!.message).toContain('"p" is a polygon room with an edge that is neither horizontal nor vertical');
    expect(d[0]!.hints?.[0]).toContain("`except p`");
  });

  it("a circle keeps E_ROOM_NOT_RECTANGLE", () => {
    const d = errors(plan(`  room id=c circle at (2000,2000) radius 2000\n${STATEMENT}`));
    expect(d.map((x) => x.code)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(d[0]!.message).toContain('"c" is a circle room');
  });

  it("the pair clauses read the same test: a slanted polygon or a circle cannot be named, a rectilinear one can", () => {
    const slanted = plan(
      `  room id=a at (0,0) size 4000x3000\n  room id=p polygon (4000,0) (6000,0) (5000,3000) (4000,3000)\n  walls from rooms exterior 200 partition 100 { except p  open between a and p }`,
    );
    const d = errors(slanted);
    expect(d.map((x) => x.code)).toEqual(["E_WALL_BETWEEN_ROOM"]);
    expect(d[0]!.message).toContain("is a polygon room with an edge that is neither horizontal nor vertical");
    expect(
      codes(plan(`${LIV_BED}  walls from rooms exterior 200 partition 100 { between liv and bed thickness 150 }`)),
    ).toEqual([]);
  });

  it("every rectangle the cut makes lies inside the ring, and they fill it", () => {
    const parts = ringParts(pts(L_RING))!;
    expect(parts).toEqual([
      { x0: 0, y0: 0, x1: 6000, y1: 3000 },
      { x0: 0, y0: 3000, x1: 3000, y1: 6000 },
    ]);
    expect(ringParts(pts("(0,0) (4000,0) (3000,3000)"))).toBeUndefined();
  });
});

suite("the walls of a polygon", () => {
  it("an L beside a room: one ring round the pair, and two partitions, with nothing on the seam", () => {
    const src = plan(`${LIV_BED}${STATEMENT}`);
    expect(named(src)).toEqual(["exterior", "liv|bed", "liv|bed#2"]);
    expect(wall(src, "exterior").points).toEqual(pts("(0,0) (6000,0) (6000,6000) (0,6000)"));
    expect(line(src, "liv|bed")).toEqual([3000, 3000, 3000, 6000]);
    expect(line(src, "liv|bed#2")).toEqual([3000, 3000, 6000, 3000]);
    const outline = joinWallSet(wallsOf(src), [])!.result.outline;
    const solidAt = (p: Point): boolean => outline.reduce((n, l) => n + loopWinding(l, p), 0) !== 0;
    // The seam of the two slabs the ring is cut into runs along y 3000 for x 0–3000.
    expect(solidAt({ x: 1500, y: 3000 })).toBe(false);
    // The control: the same probe on a run that does stand.
    expect(solidAt({ x: 4500, y: 3000 })).toBe(true);
  });

  it("an L alone: the ring follows the notch", () => {
    const src = plan(`${LIV}\n${STATEMENT}`);
    expect(named(src)).toEqual(["exterior"]);
    expect(wall(src, "exterior").points).toEqual(pts(L_RING));
  });

  it("one room stays one room: one row, one area, one stamp, and a wall on each face", () => {
    const d = describe(ISSUE_PLAN);
    expect(d.rooms.map((r) => r.id)).toEqual(["liv", "bed", "bath"]);
    expect(d.rooms[0]!.area_m2).toBe(27);
    expect(d.rooms[0]!.floor_polygon).toEqual(pts(L_RING));
    expect(compile(ISSUE_PLAN, { noCache: true }).svg.match(/Living/g)).toHaveLength(1);
    expect(d.derived_walls?.map((w) => [w.name, w.between])).toEqual([
      ["exterior", undefined],
      ["liv|bed", ["liv", "bed"]],
      ["liv|bed#2", ["liv", "bed"]],
      ["liv|bath", ["liv", "bath"]],
    ]);
  });

  it("a U round a room: three runs, numbered from the smallest `y`, then `x`, the vertical first at a tie", () => {
    expect(named(U_PLAN)).toEqual(["exterior", "u|core", "u|core#2", "u|core#3"]);
    expect(line(U_PLAN, "u|core")).toEqual([3000, 3000, 3000, 6000]);
    expect(line(U_PLAN, "u|core#2")).toEqual([3000, 3000, 6000, 3000]);
    expect(line(U_PLAN, "u|core#3")).toEqual([6000, 3000, 6000, 6000]);
  });

  it("two interlocked Ls, no rectangle at all: three runs, and the ring round both", () => {
    expect(named(INTERLOCKED_PLAN)).toEqual(["exterior", "a|b", "a|b#2", "a|b#3"]);
    expect(wall(INTERLOCKED_PLAN, "exterior").points).toEqual(pts("(0,0) (9000,0) (9000,6000) (0,6000)"));
    expect(line(INTERLOCKED_PLAN, "a|b")).toEqual([6000, 0, 6000, 3000]);
    expect(line(INTERLOCKED_PLAN, "a|b#2")).toEqual([3000, 3000, 3000, 6000]);
    expect(line(INTERLOCKED_PLAN, "a|b#3")).toEqual([3000, 3000, 6000, 3000]);
  });

  it("a comb: the ring goes in and out of the empty slots, and each filled slot has its three runs", () => {
    expect(
      wallsOf(COMB_PLAN)
        .filter((w) => w.id.startsWith("a|b"))
        .map((w) => [w.id, w.thickness]),
    ).toEqual([
      ["a|b", 150],
      ["a|b#2", 150],
    ]);
    expect(wall(COMB_PLAN, "exterior").points).toHaveLength(14);
    expect(named(COMB_PLAN).filter((n) => n.startsWith("a|c"))).toEqual(["a|c", "a|c#2", "a|c#3"]);
  });

  it("`#n` and `~n` compose: an authored wall splits a later run", () => {
    const src = RECTILINEAR_PLANS.find((p) => p[0] === "coexist-second-run")![1];
    expect(named(src)).toEqual(["w", "exterior", "liv|bed", "liv|bed#2", "liv|bed#2~2"]);
    expect(line(src, "liv|bed#2~2")).toEqual([5000, 3000, 6000, 3000]);
    expect(describe(src).derived_walls?.find((w) => w.name === "liv|bed#2")?.dropped).toEqual([
      { x1: 4000, y1: 3000, x2: 5000, y2: 3000, by: "w" },
    ]);
  });

  it("names ride a frame, and the rooms a run stands between keep their own names", () => {
    const src = RECTILINEAR_PLANS.find((p) => p[0] === "placed")![1];
    const ids = named(src);
    expect(ids).toContain("w.liv|bed#2");
    expect(ids).toContain("m.liv|bed#2");
    expect(ids).toContain("n.liv|bed#2");
    expect(wallsOf(src).find((w) => w.id === "m.liv|bed#2")!._derived?.between).toEqual(["m.liv", "m.bed"]);
  });

  it("a door by position hosts on either run of a pair, and no message or hint quotes a wall's internal name", () => {
    const src = RECTILINEAR_PLANS.find((p) => p[0] === "door-at")![1];
    expect(codes(src)).toEqual([]);
    const hosts = resolvePlan(src).ir!.elements.flatMap((e) => (e.kind === "door" ? [e.host!.wallId] : []));
    expect(hosts).toEqual(["liv|bed", "liv|bed#2", "exterior"]);
    expect(
      describe(src)
        .doors.slice(0, 2)
        .map((d) => d.between),
    ).toEqual([
      ["liv", "bed"],
      ["liv", "bed"],
    ]);
    for (const [, s] of RECTILINEAR_PLANS) {
      for (const d of [...lint(s), ...compile(s, { noCache: true }).diagnostics]) {
        expect(`${d.message} ${(d.hints ?? []).join(" ")}`, s).not.toMatch(/\w\|\w/);
      }
    }
  });

  it("a courtyard closed by an L keeps its inner ring", () => {
    const src = RECTILINEAR_PLANS.find((p) => p[0] === "courtyard")![1];
    expect(named(src)).toContain("exterior#2");
    expect(wall(src, "exterior#2").points).toEqual(pts("(3000,3000) (3000,6000) (6000,6000) (6000,3000)"));
  });
});

suite("the refusals keep their codes", () => {
  it("E_ROOMS_OVERLAP names the pair once, however many rectangles of the ring overlap it", () => {
    const src = plan(`${LIV}\n  room id=x at (1000,2000) size 1000x2000\n${STATEMENT}`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_ROOMS_OVERLAP"]);
    expect(d[0]!.message.match(/overlaps/g)).toHaveLength(1);
  });

  it("E_ROOMS_NOT_TILING: a gap, and a pinch at the notch", () => {
    expect(codes(plan(`${LIV}\n  room id=x at (9000,0) size 1000x1000\n${STATEMENT}`))).toEqual(["E_ROOMS_NOT_TILING"]);
    expect(codes(plan(`${LIV}\n  room id=x at (6000,3000) size 1000x1000\n${STATEMENT}`))).toEqual([
      "E_ROOMS_NOT_TILING",
    ]);
    expect(codes(plan(`${LIV}\n  room id=x at (3000,6000) size 1000x1000\n${STATEMENT}`))).toEqual([
      "E_ROOMS_NOT_TILING",
    ]);
  });

  it("E_PARTITION_TOO_SHORT: a 1 mm jog in a ring", () => {
    const src = plan(
      `  grid 1\n  room id=a polygon (0,0) (4000,0) (4000,2000) (4001,2000) (4001,3000) (0,3000)\n  room id=b at (4000,0) size 3000x2000\n  room id=c at (4001,2000) size 2999x1000\n${STATEMENT}`,
    );
    expect(codes(src)).toEqual(["E_PARTITION_TOO_SHORT"]);
  });

  it("a ring the room itself refuses never throws: the room's own error is reported", () => {
    const figure8 = plan(
      `  room id=a polygon (0,0) (3000,0) (3000,3000) (6000,3000) (6000,6000) (3000,6000) (3000,3000) (0,3000)\n${STATEMENT}`,
    );
    const keyhole = plan(
      `  room id=a polygon (0,0) (6000,0) (6000,6000) (0,6000) (0,3000) (2000,3000) (2000,2000) (4000,2000) (4000,4000) (2000,4000) (2000,3000) (0,3000)\n${STATEMENT}`,
    );
    const degenerate = plan(`  room id=a polygon (0,0) (1000,0) (2000,0)\n${STATEMENT}`);
    expect(codes(figure8)).toContain("E_ROOM_POLY_SELF_INTERSECT");
    expect(codes(keyhole)).toContain("E_ROOM_POLY_SELF_INTERSECT");
    expect(codes(degenerate)).toContain("E_ROOM_POLY_DEGENERATE");
  });
});

suite("a pair that shares several runs", () => {
  it("`between … thickness` sets every run of the pair", () => {
    const src = plan(`${LIV_BED}  walls from rooms exterior 200 partition 100 { between liv and bed thickness 150 }`);
    expect(
      wallsOf(src)
        .filter((w) => w._derived?.between)
        .map((w) => [w.id, w.thickness]),
    ).toEqual([
      ["liv|bed", 150],
      ["liv|bed#2", 150],
    ]);
  });

  it("`open between` is refused, on the clause, naming each run", () => {
    const src = plan(`${LIV_BED}  walls from rooms exterior 200 partition 100 { open between liv and bed }`);
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("open between liv and bed");
    expect(d[0]!.message).toContain("x 3000, y 3000–6000");
    expect(d[0]!.message).toContain("y 3000, x 3000–6000");
    expect(d[0]!.hints?.join(" ")).toContain("one room");
    // The hint's other way out works: an opening by position, on the one run it stands on.
    const one = plan(`${LIV_BED}${STATEMENT}\n  opening id=o at (3000,4500) width 1000`);
    expect(codes(one)).toEqual([]);
    expect(wall(one, "liv|bed").openings).toHaveLength(1);
    expect(wall(one, "liv|bed#2").openings).toEqual([]);
  });

  it("`open between` on a U names all three runs, and a `width` or an `id` changes nothing", () => {
    const src = U_PLAN.replace(
      STATEMENT,
      "  walls from rooms exterior 200 partition 100 { open id=o between u and core width 1000 }",
    );
    const d = errors(src);
    expect(d.map((x) => x.code)).toEqual(["E_OPENING_HOST_AMBIGUOUS"]);
    expect(d[0]!.message).toContain("3 edges");
  });

  it("a pair of one run still opens: the L to a room it shares one edge with", () => {
    const src = RECTILINEAR_PLANS.find((p) => p[0] === "open-one-run")![1];
    expect(codes(src)).toEqual([]);
    const o = describe(src).openings;
    expect(o).toHaveLength(1);
    expect(o[0]!.between).toEqual(["liv", "din"]);
  });

  it("`wall … between` and `wall … around` stay rectangle-only, so no run is picked silently", () => {
    const between = plan(`${LIV_BED}  wall id=p partition thickness 100 between liv and bed`);
    const around = plan(`${LIV_BED}  wall id=e exterior thickness 200 around [liv bed]`);
    expect(codes(between)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(codes(around)).toEqual(["E_ROOM_NOT_RECTANGLE"]);
  });

  it("what is not built yet still refuses: `door between`, a datum, `right-of`, an anchor", () => {
    const body = `${LIV_BED}${STATEMENT}\n`;
    expect(codes(plan(`${body}  door between liv and bed at center width 800 swing into bed`))).toEqual([
      "E_ROOM_NOT_RECTANGLE",
    ]);
    expect(codes(plan(`${body}  window on liv.left width 1000`))).toEqual(["E_ROOM_NOT_RECTANGLE"]);
    expect(codes(plan(`${LIV}\n  room id=x right-of liv size 2000x3000\n${STATEMENT}`))).toContain("E_PLACE_POLY");
    expect(codes(plan(`${body}  furniture sofa in liv anchor bottom-left flush size 2000x900`))).toEqual([
      "E_PLACE_POLY",
    ]);
  });
});

/** The ring cut the other way: vertical slabs, by cutting it with its axes swapped. */
function vertical(ring: readonly Point[]): TileRect[] {
  return ringParts(ring.map((p) => ({ x: p.y, y: p.x })))!.map((r) => ({ x0: r.y0, y0: r.x0, x1: r.y1, y1: r.x1 }));
}

/** Every rectangle cut again at each coordinate of the ring: a grid of cells. */
function cells(parts: readonly TileRect[], ring: readonly Point[]): TileRect[] {
  const xs = [...new Set(ring.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(ring.map((p) => p.y))].sort((a, b) => a - b);
  const out: TileRect[] = [];
  for (const r of parts) {
    const cx = [r.x0, ...xs.filter((x) => x > r.x0 && x < r.x1), r.x1];
    const cy = [r.y0, ...ys.filter((y) => y > r.y0 && y < r.y1), r.y1];
    for (let i = 0; i + 1 < cx.length; i++)
      for (let j = 0; j + 1 < cy.length; j++) out.push({ x0: cx[i]!, y0: cy[j]!, x1: cx[i + 1]!, y1: cy[j + 1]! });
  }
  return out;
}

const shape = (walls: readonly DerivedWallSpec[]) => walls.map((w) => [w.name, w.role, w.between, w.pieces]);
const R = (id: string, x0: number, y0: number, w: number, h: number): TileRoom => ({
  id,
  rect: { x0, y0, x1: x0 + w, y1: y0 + h },
});

suite("the two equivalence laws", () => {
  const COMB_RING = pts(COMB_PLAN.match(/polygon ([^l]*)label/)![1]!);
  const U_RING = pts(U_PLAN.match(/polygon ([^l]*)label/)![1]!);

  it("any cut of a ring derives the same walls", () => {
    const cases: [readonly Point[], TileRoom[]][] = [
      [pts(L_RING), [R("bed", 3000, 3000, 3000, 3000)]],
      [U_RING, [R("core", 3000, 3000, 3000, 3000)]],
      [COMB_RING, [R("b", 0, 1000, 1000, 2000), R("c", 2000, 1000, 1000, 2000)]],
    ];
    for (const [ring, others] of cases) {
      const base = ringParts(ring)!;
      const run = (parts: TileRect[]) => deriveWallsFromRooms([{ id: "p", parts }, ...others], [], [], 100);
      const want = run(base);
      if (!want.ok) throw new Error("refused");
      for (const cut of [vertical(ring), cells(base, ring), [...cells(base, ring)].reverse()]) {
        const got = run(cut);
        if (!got.ok) throw new Error("refused");
        expect(shape(got.walls)).toEqual(shape(want.walls));
        expect(got.counts).toEqual(want.counts);
        // Not vacuous: each cut really is other rectangles.
        expect(cut).not.toEqual(base);
      }
    }
  });

  it("an L tiles to the ring and the partition lines of its two rectangles, less the seam", () => {
    const ring = pts(L_RING);
    const bed = R("bed", 3000, 3000, 3000, 3000);
    const bath = R("bath", 6000, 0, 2000, 3000);
    const asL = deriveWallsFromRooms([{ id: "liv", parts: ringParts(ring)! }, bed, bath], [], [], 100);
    const asTwo = deriveWallsFromRooms([R("a", 0, 0, 6000, 3000), R("b", 0, 3000, 3000, 3000), bed, bath], [], [], 100);
    if (!asL.ok || !asTwo.ok) throw new Error("refused");
    expect(asL.walls[0]!.pieces).toEqual(asTwo.walls[0]!.pieces);
    const lines = (w: readonly DerivedWallSpec[]) =>
      w
        .slice(1)
        .map((s) => JSON.stringify(s.pieces[0]!.points))
        .sort();
    const seam = JSON.stringify([
      { x: 0, y: 3000 },
      { x: 3000, y: 3000 },
    ]);
    expect(lines(asTwo.walls)).toContain(seam);
    expect(lines(asL.walls)).toEqual(lines(asTwo.walls).filter((l) => l !== seam));
  });

  it("the drawn join at a reflex corner is the one the same plan draws in rectangles, less the seam", () => {
    // Design §9's jog, where partitions meet the ring at (6000, 3000). The rectangle plan's walls
    // bar the seam are the L's walls, so the outlines must agree edge for edge.
    const rects = plan(
      `  room id=a at (0,0) size 6000x3000\n  room id=b at (0,3000) size 3000x3000\n${BED}\n  room id=bath at (6000,0) size 2000x3000\n${STATEMENT}`,
    );
    const edges = (walls: Parameters<typeof joinWallSet>[0]): string[] =>
      joinWallSet(walls, [])!
        .result.outline.flat()
        .map((e) => {
          if (e.t !== "line") throw new Error("a straight plan");
          return `${e.a.x},${e.a.y} ${e.b.x},${e.b.y}`;
        })
        .sort();
    const noSeam = wallsOf(rects).filter((w) => w.id !== "a|b");
    expect(noSeam).toHaveLength(wallsOf(rects).length - 1);
    expect(edges(wallsOf(ISSUE_PLAN))).toEqual(edges(noSeam));
    // The control: with its seam the rectangle plan draws something else.
    expect(edges(wallsOf(rects))).not.toEqual(edges(noSeam));
  });
});

suite("the D4 oracle on a derived L", () => {
  const BODY = `  ${LIV}\n  ${BED}\n  ${STATEMENT}\n    door id=d at (3000,4500) width 800 wall partition hinge left swing in`;

  it("under all eight frames every fact and every drawn primitive follows the frame", () => {
    expect(D4_ELEMENTS).toHaveLength(8);
    for (const g of D4_ELEMENTS) {
      const { vs, ctx } = witnessCase(BODY, g);
      expect(
        vs.map((v) => v.key),
        g.name,
      ).toEqual([]);
      expect(
        ctx.obsG.summary.derived_walls?.map((w) => w.name),
        g.name,
      ).toEqual(["g.exterior", "g.liv|bed", "g.liv|bed#2"]);
    }
  });

  it("the oracle can fail: the frame's image of another plan is reported", () => {
    const g = D4_ELEMENTS.find((e) => e.mirror)!;
    const { p0 } = witnessPair(BODY, g, { fixedSheet: true });
    const { gP } = witnessPair(BODY.replace(STATEMENT.trim(), "walls from rooms exterior 200 partition 150"), g, {
      fixedSheet: true,
    });
    expect(compareScenes(sceneOf(p0), sceneOf(gP), frameFor(g, 50)).length).toBeGreaterThan(0);
  });
});

/** The steps a source's whole resolution spends. */
function stepsOf(src: string): number {
  clearResolveCache();
  const { plan: ast } = parse(src, BUILTIN_REGISTRY);
  if (!ast) return 0;
  const linked = link(ast, NULL_WORLD, BUILTIN_REGISTRY);
  return evaluationSteps(resolveAll(linked.plan, BUILTIN_REGISTRY, NULL_WORLD));
}

/** A staircase ring of `n` treads: as many slabs as treads, every one read against every edge. */
function staircase(n: number): string {
  const up: string[] = [];
  for (let i = 0; i < n; i++) up.push(`(${(i + 1) * 1000},${i * 1000})`, `(${(i + 1) * 1000},${(i + 1) * 1000})`);
  return `(0,0) ${up.join(" ")} (0,${n * 1000})`;
}

suite("budgets", () => {
  it("a polygon pays for its cut: more edges cost more steps, charged in the ring's size", () => {
    const steps = (n: number) => stepsOf(plan(`  room id=a polygon ${staircase(n)}\n${STATEMENT}`));
    expect(steps(20)).toBeGreaterThan(steps(10));
    // The cut is quadratic on this shape (a slab per tread, an edge read per slab); the sweep is not.
    expect(steps(40) - steps(20)).toBeGreaterThan(2 * (steps(20) - steps(10)));
  });

  it("a ring too large to cut is E_STEP_LIMIT, returned, not a hang and not a throw", () => {
    const src = plan(`  room id=a polygon ${staircase(2500)}\n${STATEMENT}`);
    expect(codes(src)).toContain("E_STEP_LIMIT");
  }, 60_000);

  it("two interlocked combs: the flat pre-charge covers two rooms, the real count refuses", () => {
    // Each tooth of one comb stands in a slot of the other, so two rooms share about 4n runs.
    const combs = (n: number): string => {
      const w = (2 * n + 1) * 1000;
      const a = ["(0,0)", `(${w},0)`, `(${w},1000)`];
      const b = [`(${w},3000)`, "(0,3000)", "(0,1000)"];
      for (let i = n; i > 0; i--) {
        const x = 2 * i * 1000;
        a.push(`(${x},1000)`, `(${x},2000)`, `(${x - 1000},2000)`, `(${x - 1000},1000)`);
      }
      a.push("(0,1000)");
      for (let i = 0; i < n; i++) {
        const x = 2 * i * 1000;
        b.push(`(${x + 1000},1000)`, `(${x + 1000},2000)`, `(${x + 2000},2000)`, `(${x + 2000},1000)`);
      }
      b.push(`(${w},1000)`);
      return plan(`  room id=a polygon ${a.join(" ")}\n  room id=b polygon ${b.join(" ")}\n${STATEMENT}`);
    };
    expect(wallsOf(combs(3)).filter((w) => w._derived?.between)).toHaveLength(4 * 3 + 1);
    const d = errors(combs(1500));
    expect(d.map((x) => x.code)).toEqual(["E_ELEMENT_LIMIT"]);
    expect(d[0]!.message).toContain("would derive up to");
  }, 60_000);
});

suite("Plan JSON", () => {
  it("round-trips an L: the ring and the statement, never a derived wall, and the same drawing", () => {
    const { json } = planToJson(ISSUE_PLAN);
    const text = JSON.stringify(json);
    expect(text).toContain("walls_from_rooms");
    expect(text).not.toContain("liv|bed");
    const back = planJsonToArch(json);
    expect(compile(back.source!, { noCache: true }).svg).toBe(compile(ISSUE_PLAN, { noCache: true }).svg);
  });
});

/** Measured on this branch, with `test/rectilinear-rooms-plans.ts` as it stands. */
const DIGESTS: [string, string][] = [
  ["5f2d0bbf572d77201d96558db8174abb57341f30f79bffbf477b9a3f3c24c03a", "issue"],
  ["0e3c48a4d685c6528428b2e24859d2761c73794f5ede7e0dc122a7a3d391a330", "issue-tiled"],
  ["88304076db719661a617f19eefc870818c664fbe50be9a10eab8240b2115d218", "notch-outside"],
  ["797dbf8bc7ee7dc3c65c0afe8b53b2e9d2889136f7bb597e08ea1d1f81688b03", "u"],
  ["e8cc696a1cfce3a19fe9cda22fa1b6b7e4b46a59ec7a3449e0e19464b15e3dd0", "comb"],
  ["62946cee4d634ec28de0b975fa1a0610634029612e151b469f4caffd4ee3392a", "interlocked"],
  ["3a73d8934de7a406b294b8ca2fb4e6550f23cc80e17572e82c169cfe2dac1460", "two-runs-one-line"],
  ["95511dfdb74dc7929b0556b5ff322cdb68738fa44cc176dd31bc4375aa213d9e", "courtyard"],
  ["de0183f0f84df5287765e25512f2cee4336568ee2830e9e5d76c1749f6607ed0", "coexist-second-run"],
  ["818566c77994d02cd63c9800e0578057d8f56872472e6ca086a9fbedbdeb0715", "open-one-run"],
  ["8cf9a11afd539f57a930e4c42b38350ff1162617ba969e9233b9cb2c0310cde1", "door-at"],
  ["70d9682e468ac43fa00fc25ba7cf6e4c4f7bd6bbb9110a586f062a8c3ad500cb", "placed"],
];

suite("the digest table", () => {
  it("pins every plan", () => {
    expect(DIGESTS.map((d) => d[1])).toEqual(RECTILINEAR_PLANS.map((p) => p[0]));
  });
  for (const [digest, name] of DIGESTS) {
    it(name, () => {
      const src = RECTILINEAR_PLANS.find((p) => p[0] === name)![1];
      expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
    });
  }
});
