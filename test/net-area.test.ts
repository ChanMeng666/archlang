/**
 * NET internal area (`describe().rooms[].net_area_m2`, `totals.net_floor_area_m2`; the rule:
 * `docs/adr/0027-net-internal-area.md`, the code: `src/analyze/net-area.ts`): the room's own
 * area less every part of it a wall's band covers, exact or omitted.
 *
 * Three kinds of evidence, each independent of the code under test in its own way:
 *
 * 1. The agent-UX audit plan's numbers, derived by hand from its walls (the card's DoD), and
 *    `examples/hexagon-pavilion.arch`, whose 1200 mm drum stands on the six wedge galleries.
 * 2. Hand-computed rooms whose answer is a product or a closed form a reader can check: walls
 *    on the edge (the inset), an open side, an L, a shared partition, a T, a free wall end's
 *    cap, a wall through the room, a wall off the edge, a triangle, circles walled all or half
 *    round, a straight wall tangent to a circle, an arc bulging into a room.
 * 3. A property over every room of the corpus (`net-area-oracle-corpus.test.ts`; examples, fixtures, recovery plans, eval goldens,
 *    fidelity plans and faults; the docs gallery is left out, `agent-gallery.test.ts` owns it):
 *    the closed-form figure agrees with a GRID ORACLE (`test/helpers/net-area-oracle.ts`, which shares
 *    nothing with the code under test but the band and the room's own area) within the
 *    oracle's own error bound, on every room, so a wall standing on a floor cannot hide again.
 *    The figure is read UNCLAMPED (`netAreaDetail`): `covered` must lie in `[0, area]` on its
 *    own.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import fc from "fast-check";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, roomSchedule } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { MAX_NET_CURVES, MAX_NET_PROBE_WORK, netAreaBands, netAreaDetail } from "../src/analyze/net-area.js";
import { pointInPolygon, polygonInsideTest, VERTEX_EPS } from "../src/geometry/polygon.js";
import type { RRoom } from "../src/ir.js";
import { oracleNetArea } from "./helpers/net-area-oracle.js";
import { runs } from "./setup/fast-check.js";

const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;

/** The one room's measurement: exact mm², its describe() row, and the grid oracle's verdict. */
function measure(src: string, id: string) {
  const { ir } = resolvePlan(src);
  if (!ir) throw new Error("plan did not resolve");
  const room = ir.elements.find((e): e is RRoom => e.kind === "room" && e.id === id)!;
  const d = netAreaDetail(room, netAreaBands(ir.walls));
  if (!d.ok) throw new Error(`net area omitted: ${d.reason}`);
  const row = describePlan(src).rooms.find((r) => r.id === id)!;
  const o = oracleNetArea(room, ir.walls);
  return {
    mm2: d.gross - d.covered,
    m2: row.net_area_m2,
    area_m2: row.area_m2,
    oracle: o.gross - o.covered,
    bound: o.bound,
  };
}

/** The closed form and the oracle agree within the oracle's bound. */
const agrees = (m: { mm2: number; oracle: number; bound: number }): boolean => Math.abs(m.mm2 - m.oracle) <= m.bound;

suite("net area — the agent-UX audit plan (the card's numbers, by hand)", () => {
  // test/callout-fixtures/agent-ux-flat.arch is the audit plan verbatim under a header.
  const src = readFileSync(resolvePath("test/callout-fixtures/agent-ux-flat.arch"), "utf8");
  const s = describePlan(src);
  const net = (id: string): number | undefined => s.rooms.find((r) => r.id === id)!.net_area_m2;

  it("Bedroom 1 nets 11.56 m²: 3450 × 3350 inside a 200 shell on two sides and 100 partitions on two", () => {
    // 3600 − 100 (w_west) − 50 (w_hall_w) = 3450; 3500 − 100 (w_north) − 50 (w_beds) = 3350.
    expect(net("r_bed1")).toBe(11.56);
    expect(measure(src, "r_bed1").mm2).toBe(3450 * 3350);
  });

  it("each room is its centreline rectangle less half of each of its own walls", () => {
    expect(measure(src, "r_bed2").mm2).toBe((3600 - 100 - 50) * (3000 - 50 - 100)); // 3450 × 2850
    expect(measure(src, "r_bath").mm2).toBe((2000 - 50 - 50) * (2200 - 100 - 50)); // 1900 × 2050
    expect(measure(src, "r_hall").mm2).toBe((2000 - 50 - 50) * (4300 - 50 - 100)); // 1900 × 4150
    expect(measure(src, "r_live").mm2).toBe((4400 - 50 - 100) * (6500 - 100 - 100)); // 4250 × 6300
  });

  it("reports about 60.0 m² net beside the 65.00 m² centreline total", () => {
    expect(s.totals.floor_area_m2).toBe(65);
    // The sum of the rooms' rounded nets, as floor_area_m2 sums the rounded areas: 59.96
    // (the unrounded sum is 59.945 m²).
    expect(s.totals.net_floor_area_m2).toBe(59.96);
    expect(s.totals.net_floor_area_m2).toBeCloseTo(60.0, 0);
  });

  it("the drawn ROOM SCHEDULE carries the same net figures", () => {
    expect(s.schedule!.map((r) => r.net_area_m2)).toEqual(s.rooms.map((r) => r.net_area_m2));
  });
});

suite("net area — examples/hexagon-pavilion.arch: the drum stands on the galleries", () => {
  const src = readFileSync(resolvePath("examples/hexagon-pavilion.arch"), "utf8");
  const s = describePlan(src);
  const { ir } = resolvePlan(src);

  it("each wedge gallery loses the drum's outer half-band, a circular segment of ~1.5 m²", () => {
    // The drum (thickness 1200, centreline r 3000) is tangent to every gallery's inner edge,
    // so its band r 3000..3600 lies on the gallery floor. Before this rule the galleries read
    // 15.09 and 11.97 m², the floor under the drum included.
    const net = Object.fromEntries(s.rooms.map((r) => [r.id, r.net_area_m2]));
    expect(net).toEqual({ rotunda: 18.1, g_ne: 13.55, g_n: 10.52, g_nw: 13.55, g_sw: 13.55, g_s: 10.52, g_se: 13.55 });
    expect(s.totals.net_floor_area_m2).toBe(93.34);
  });

  it("the grid oracle agrees with every room, and REJECTS the old inset-only figure", () => {
    for (const room of ir!.elements.filter((e): e is RRoom => e.kind === "room")) {
      const d = netAreaDetail(room, netAreaBands(ir!.walls));
      const o = oracleNetArea(room, ir!.walls);
      expect(d.ok).toBe(true);
      if (!d.ok) continue;
      expect(Math.abs(d.covered - o.covered)).toBeLessThanOrEqual(o.bound);
      // The figure shipped before (an inset of the room's edges only) is outside the bound:
      // the oracle can tell a drum on the floor from no drum.
      if (room.id === "g_ne") expect(Math.abs(15.09e6 - (o.gross - o.covered))).toBeGreaterThan(10 * o.bound);
    }
  });
});

suite("net area — hand-checked rooms", () => {
  const R = "  room id=r at (0,0) size 4000x3000";

  it("a rectangle inside one wall all round: (w − t) × (h − t)", () => {
    const m = measure(plan(`  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n${R}`), "r");
    expect(m.mm2).toBe(3800 * 2800);
    expect(m.m2).toBe(10.64);
    expect(agrees(m)).toBe(true);
  });

  it("each wall takes ITS OWN half-thickness from the edge it runs on: 300 shell, 100 and 200 partitions", () => {
    const src = plan(
      [
        "  wall exterior thickness 300 { (0,4000) (0,0) (5000,0) }",
        "  wall partition thickness 100 { (5000,0) (5000,4000) }",
        "  wall partition thickness 200 { (0,4000) (5000,4000) }",
        "  room id=r at (0,0) size 5000x4000",
      ].join("\n"),
    );
    expect(measure(src, "r").mm2).toBe((5000 - 150 - 50) * (4000 - 150 - 100));
    expect(measure(src, "r").m2).toBe(18);
  });

  it("an edge with no wall loses nothing", () => {
    const m = measure(plan(`  wall exterior thickness 200 { (0,3000) (0,0) (4000,0) (4000,3000) }\n${R}`), "r");
    expect(m.mm2).toBe(3800 * 2900);
  });

  it("a room no wall touches nets its whole area", () => {
    const m = measure(plan(R), "r");
    expect(m.mm2).toBe(4000 * 3000);
    expect(m.m2).toBe(m.area_m2);
  });

  it("an L: the inside corner's joint is wall, not floor", () => {
    const src = plan(
      [
        "  wall exterior thickness 200 { (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000) close }",
        "  room id=r polygon (0,0) (6000,0) (6000,3000) (3000,3000) (3000,6000) (0,6000)",
      ].join("\n"),
    );
    // The 5800 × 2800 bar and the 2800 × 3000 leg; the mitred joint fills the 100 × 100
    // square at the inside corner.
    expect(measure(src, "r").mm2).toBe(5800 * 2800 + 2800 * 3000);
    expect(measure(src, "r").m2).toBe(24.64);
  });

  it("two rooms either side of a 100 partition each lose half of it", () => {
    const src = plan(
      [
        "  wall exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }",
        "  wall partition thickness 100 { (4000,0) (4000,3000) }",
        R,
        "  room id=r2 at (4000,0) size 4000x3000",
      ].join("\n"),
    );
    expect(measure(src, "r").mm2).toBe((4000 - 100 - 50) * 2800);
    expect(measure(src, "r2").mm2).toBe((4000 - 50 - 100) * 2800);
  });

  it("a partition teeing into the room's edge from outside takes nothing past the edge's own wall", () => {
    const src = plan(
      [
        "  wall exterior thickness 200 { (0,0) (4000,0) }",
        "  wall partition thickness 100 { (2000,0) (2000,-3000) }",
        R,
      ].join("\n"),
    );
    // Its square cap (50 past (2000,0)) lies inside the shell's own band.
    expect(measure(src, "r").mm2).toBe(4000 * 2900);
  });

  it("a wall's free end stands on the floor with its square cap", () => {
    const src = plan(
      `  wall exterior thickness 200 { (2000,0) (0,0) (0,3000) (6000,3000) (6000,0) }\n  room id=r at (0,0) size 6000x3000`,
    );
    // The north wall runs from x 0 to 2000 and is drawn square-capped to 2100: without it the
    // floor would be 5800 × 2900 from y 0; its band takes 2000 × 100 (x 100..2100, y 0..100).
    const m = measure(src, "r");
    expect(m.mm2).toBe(5800 * 2900 - 2000 * 100);
    expect(agrees(m)).toBe(true);
  });

  it("a wall across the room takes its whole band", () => {
    const src = plan(
      [
        "  wall exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }",
        "  wall partition thickness 100 { (4000,0) (4000,3000) }",
        "  room id=r at (0,0) size 8000x3000",
      ].join("\n"),
    );
    expect(measure(src, "r").mm2).toBe(7800 * 2800 - 100 * 2800);
  });

  it("a wall whose centreline sits 50 inside the edge takes 150 off it, not 100", () => {
    const m = measure(plan(`  wall exterior thickness 200 { (0,50) (4000,50) }\n${R}`), "r");
    expect(m.mm2).toBe(4000 * (3000 - 150));
  });

  it("an oblique ring: a 3-4-5 triangle walled all round insets to a similar triangle", () => {
    const m = measure(
      plan(
        "  wall exterior thickness 200 { (0,0) (4000,0) (0,3000) close }\n  room id=r polygon (0,0) (4000,0) (0,3000)",
      ),
      "r",
    );
    // Inradius = area / semi-perimeter = 6e6 / 6000 = 1000; inset by 100 scales it by 0.9.
    expect(m.mm2).toBeCloseTo(6e6 * 0.81, 3);
    expect(m.m2).toBe(4.86);
    expect(agrees(m)).toBe(true);
  });

  it("a circle walled all round by one concentric arc wall: π(r − t/2)²", () => {
    const m = measure(
      plan(
        "  wall exterior thickness 200 { (8000,5000) arc (2000,5000) radius 3000 arc (8000,5000) radius 3000 }\n  room id=r circle at (5000,5000) radius 3000",
      ),
      "r",
    );
    expect(m.mm2).toBeCloseTo(Math.PI * 2900 * 2900, 3);
    expect(m.m2).toBe(26.42);
  });

  it("a circle walled half round: the walled half inset, the open half not, less the two end caps", () => {
    const m = measure(
      plan(
        "  wall exterior thickness 200 { (8000,5000) arc (2000,5000) radius 3000 }\n  room id=r circle at (5000,5000) radius 3000",
      ),
      "r",
    );
    // Each free end is drawn with a 100 mm straight tail along its tangent, 200 wide; the part
    // of it inside the circle is ∫₀¹⁰⁰ (√(3000² − u²) − 2900) du.
    const R2 = 3000 * 3000;
    const tail = 0.5 * (100 * Math.sqrt(R2 - 100 * 100) + R2 * Math.asin(100 / 3000)) - 2900 * 100;
    expect(m.mm2).toBeCloseTo((Math.PI * 2900 * 2900) / 2 + (Math.PI * R2) / 2 - 2 * tail, 3);
    expect(m.m2).toBe(27.33);
    expect(agrees(m)).toBe(true);
  });

  it("a straight wall tangent to a circle takes the circular segment its band covers", () => {
    const m = measure(
      plan("  wall exterior thickness 200 { (0,2000) (10000,2000) }\n  room id=r circle at (5000,5000) radius 3000"),
      "r",
    );
    // The band reaches y = 2100, 2900 from the centre: segment = R² acos(d/R) − d√(R² − d²).
    const seg = 9e6 * Math.acos(2900 / 3000) - 2900 * Math.sqrt(9e6 - 2900 * 2900);
    expect(m.mm2).toBeCloseTo(Math.PI * 9e6 - seg, 3);
    expect(agrees(m)).toBe(true);
  });

  it("an arc bulging INTO the room takes its whole band off the floor", () => {
    // `(3000,3000) arc (1000,3000) radius 1000` turns about (2000,3000) through the room
    // side (its midpoint is (2000,2000)): the half-annulus 900..1100 stands on the floor.
    const src = plan(
      `  wall exterior thickness 200 { (0,3000) (0,0) (4000,0) (4000,3000) (3000,3000) arc (1000,3000) radius 1000 (0,3000) }\n${R}`,
    );
    const m = measure(src, "r");
    expect(agrees(m)).toBe(true);
    expect(m.m2).toBe(10.23);
    // Before: 10.84, with the bulge's band left on the floor (the half-annulus alone is
    // ½π(1100² − 900²) = 0.63 m²).
    expect(10.84e6 - m.mm2).toBeGreaterThan((Math.PI * (1100 * 1100 - 900 * 900)) / 2 - 50_000);
  });
});

suite("net area — omitted, never approximated", () => {
  it("a room meeting more than MAX_NET_CURVES edges has no net area, and the plan no net total", () => {
    // 600 stub walls inside one room: 2,400 band edges, past the cap.
    const src = plan(
      [
        "  schedule rooms",
        "  for i in 0..600 {",
        "    wall partition thickness 10 { (i * 30 + 10, 100) (i * 30 + 10, 200) }",
        "  }",
        "  room id=big at (0,0) size 20000x1000",
        "  room id=small at (0,2000) size 2000x1000",
      ].join("\n"),
    );
    const s = describePlan(src);
    expect(s.ok).toBe(true);
    const big = s.rooms.find((r) => r.id === "big")!;
    const small = s.rooms.find((r) => r.id === "small")!;
    expect("net_area_m2" in big).toBe(false);
    expect(small.net_area_m2).toBe(2);
    expect("net_floor_area_m2" in s.totals).toBe(false);
    // The schedule agrees: the row has no net, the table no net TOTAL, and the cell reads "-".
    expect(s.schedule!.map((r) => r.net_area_m2)).toEqual([undefined, 2]);
    const { ir } = resolvePlan(src);
    const big2 = ir!.elements.find((e): e is RRoom => e.kind === "room" && e.id === "big")!;
    expect(netAreaDetail(big2, netAreaBands(ir!.walls))).toMatchObject({ ok: false, reason: "too-many-edges" });
    expect(MAX_NET_CURVES).toBe(2000);
    expect(compile(src, { noCache: true }).svg).toContain(">-<");
  });

  it("roomSchedule() without walls reports no net area at all, never one equal to area_m2", () => {
    const { ir } = resolvePlan(readFileSync(resolvePath("test/fixtures/schedule-sheet.arch"), "utf8"));
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const bare = roomSchedule(rooms);
    expect(bare.rows.every((r) => !("net_area_m2" in r))).toBe(true);
    expect("net_total_m2" in bare).toBe(false);
    const walled = roomSchedule(rooms, undefined, ir!.walls);
    expect(walled.rows.map((r) => r.net_area_m2)).toEqual([10.78, 7.98]);
    expect(walled.net_total_m2).toBe(18.76);
  });
});

/**
 * PS0.14: the boundary walk is charged as a COUNT before it runs (`MAX_NET_PROBE_WORK`), so a
 * room with hundreds of vertices crossed by hundreds of free-standing walls is refused, not
 * measured for a minute. The comb: S long partitions inside a 40 m box, a room whose T teeth
 * cross every one of them, and K tiny stubs outside it (the shape the PR #204 red-team found).
 */
function comb(S: number, T: number, K: number): string {
  const W = 40000;
  const H = 40000;
  const o = [`plan "comb" {`, `wall exterior thickness 200 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }`];
  for (let i = 0; i < S; i++)
    o.push(`wall partition thickness 20 { (1000,${1000 + i * 300}) (${W - 1000},${1000 + i * 300}) }`);
  const p = (W - 4000) / T;
  const pts: Array<[number, number]> = [[1500, 400]];
  for (let t = 0; t < T; t++) {
    const x0 = Math.round(2000 + t * p);
    const x1 = Math.round(2000 + t * p + p / 2);
    pts.push([x0, 400], [x0, H - 500], [x1, H - 500], [x1, 400]);
  }
  pts.push([W - 1500, 400], [W - 1500, 300], [1500, 300]);
  o.push(`room id=comb polygon ${pts.map(([x, y]) => `(${x},${y})`).join(" ")} label "Comb" uses storage`);
  for (let k = 0; k < K; k++) {
    const x = -20000 - (k % 40) * 500;
    const y = Math.floor(k / 40) * 500;
    o.push(`wall partition thickness 20 { (${x},${y}) (${x + 300},${y}) }`);
  }
  o.push("}");
  return o.join("\n");
}

suite("net area — the probe walk is charged before it runs (PS0.14)", () => {
  // Measured when written. The count is what is pinned, never a time: on the tree before the
  // charge, `arch describe` took 2.8 s, 21 s and 41 s on these three.
  const COMBS = [
    { S: 60, T: 100, K: 400, work: 59_647_352 },
    { S: 100, T: 200, K: 600, work: 358_857_912 },
    { S: 125, T: 300, K: 800, work: 928_066_112 },
  ];
  for (const { S, T, K, work } of COMBS) {
    it(`comb ${S}/${T}/${K} is refused on its count (${work}), and describe() omits its net area`, () => {
      const src = comb(S, T, K);
      const { ir } = resolvePlan(src);
      const room = ir!.elements.find((e): e is RRoom => e.kind === "room" && e.id === "comb")!;
      const d = netAreaDetail(room, netAreaBands(ir!.walls));
      // Under the edge cap, so it is the walk's charge that refuses it, not MAX_NET_CURVES.
      expect(d.curves).toBeLessThanOrEqual(MAX_NET_CURVES);
      expect(d).toMatchObject({ ok: false, reason: "too-much-work", work });
      expect(work).toBeGreaterThan(MAX_NET_PROBE_WORK);
      const s = describePlan(src);
      expect("net_area_m2" in s.rooms.find((r) => r.id === "comb")!).toBe(false);
      expect("net_floor_area_m2" in s.totals).toBe(false);
    });
  }

  it("the corpus's largest ring (aquarium's 56-vertex concourse) is measured as before, far inside the cap", () => {
    const { ir } = resolvePlan(readFileSync(resolvePath("examples/aquarium.arch"), "utf8"));
    const room = ir!.elements.find((e): e is RRoom => e.kind === "room" && e.id === "concourse")!;
    expect(room.poly?.length).toBe(56);
    const d = netAreaDetail(room, netAreaBands(ir!.walls));
    expect(d).toMatchObject({ ok: true, work: 34_272 });
    expect(d.work! * 100).toBeLessThan(MAX_NET_PROBE_WORK);
    const row = describePlan(readFileSync(resolvePath("examples/aquarium.arch"), "utf8")).rooms.find(
      (r) => r.id === "concourse",
    )!;
    expect(row.net_area_m2).toBe(544.72);
    expect(row.area_m2).toBe(564.56);
  });

  it("the binned inside test is pointInPolygon, point for point, on degenerate rings", () => {
    // Small integer rings: collinear runs, horizontal edges, repeated vertices and spikes; the
    // queries include every vertex, every edge midpoint and a lattice through them all.
    const ring = fc.array(fc.record({ x: fc.integer({ min: -6, max: 6 }), y: fc.integer({ min: -6, max: 6 }) }), {
      minLength: 3,
      maxLength: 40,
    });
    fc.assert(
      fc.property(ring, fc.constantFrom(0, VERTEX_EPS, 0.5), (pts, tol) => {
        const test = polygonInsideTest(pts, tol);
        const qs: Array<[number, number]> = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[(i + 1) % pts.length]!;
          qs.push([a.x, a.y], [(a.x + b.x) / 2, (a.y + b.y) / 2], [a.x + 1e-7, a.y - 1e-7]);
        }
        for (let x = -7; x <= 7; x += 0.5) for (let y = -7; y <= 7; y += 0.5) qs.push([x, y]);
        for (const [x, y] of qs) {
          if (test.inside(x, y) !== pointInPolygon(x, y, pts, tol)) return false;
        }
        return true;
      }),
      { numRuns: runs(300) },
    );
  });
});
