/**
 * `describe --facts quantities` and `arch takeoff` (preview-and-remodel B4, D9): geometric
 * quantities, held to figures computed BY HAND from the source coordinates, not copied from a run.
 *
 * The rule each figure follows is `docs/analysis.md` § Quantities. In short: a wall's band is its
 * centreline ± half its thickness, square-capped at a free end and mitred at a joint of one run;
 * `length_face_mm` is the outline of the union of every band on the storey (both sides, exposed
 * caps, nothing inside another wall's solid), credited to the wall whose band edge it lies on;
 * `perimeter_net_mm` is the outline of the room less every band.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { curvesOfLoop } from "../src/analyze/net-area.js";
import { MAX_FACE_CURVES } from "../src/analyze/quantities.js";
import { PointInterner, wallBand } from "../src/geometry/band.js";
import { describe, type QuantityFacts, type SceneSummary } from "../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./d4-oracle.js";

const src = (name: string): string => readFileSync(`examples/${name}`, "utf8");
const quantities = (name: string, wastePct?: number): SceneSummary =>
  describe(src(name), { facts: ["quantities"], ...(wastePct !== undefined ? { wastePct } : {}) });

/**
 * `examples/laneway-house.arch`, by hand.
 *
 * Walls (each a separate statement, so every end is a free, square-capped end):
 *   w_lane   exterior 200  (0,0)→(7500,0)       band x −100..7600, y −100..100
 *   w_east   exterior 200  (7500,0)→(7500,6500) band x 7400..7600, y −100..6600
 *   w_garden exterior 200  (0,6500)→(7500,6500) band x −100..7600, y 6400..6600
 *   w_west   exterior 200  (0,0)→(0,6500)       band x −100..100,  y −100..6600
 *   w_hall   partition 100 (4200,0)→(4200,6500) band x 4150..4250, y −50..6550
 *   w_bath   partition 100 (4200,2500)→(7500,2500) band x 4150..7550, y 2450..2550
 * Centreline: exterior 7500 + 6500 + 7500 + 6500 = 28000; partition 6500 + 3300 = 9800.
 *
 * The solid's outline is one outer rectangle and three holes (the partitions' caps end inside
 * the exterior bands and inside w_hall, so no cap is exposed):
 *   outer     x −100..7600, y −100..6600: 2·(7700 + 6700) = 28800, all exterior
 *   r_live    x 100..4150,  y 100..6400:  2·(4050 + 6300) = 20700
 *             = exterior 4050 (lane) + 6300 (west) + 4050 (garden) = 14400, partition 6300 (hall)
 *   r_bath    x 4250..7400, y 100..2450:  2·(3150 + 2350) = 11000
 *             = exterior 3150 (lane) + 2350 (east) = 5500, partition 3150 (bath) + 2350 (hall) = 5500
 *   r_bed     x 4250..7400, y 2550..6400: 2·(3150 + 3850) = 14000
 *             = exterior 3850 (east) + 3150 (garden) = 7000, partition 3150 (bath) + 3850 (hall) = 7000
 * Face: exterior 28800 + 14400 + 5500 + 7000 = 55700; partition 6300 + 5500 + 7000 = 18800
 * (sum 74500 = 28800 + 20700 + 11000 + 14000).
 *
 * Rooms (the strip stacks r_bath 3300×2500 at (4200,0) and r_bed 3300×4000 at (4200,2500)):
 *   r_live 4200×6500: centreline 2·(4200 + 6500) = 21400; net = the hole above, 20700;
 *          net area 4.05 × 6.30 = 25.515 → 25.52
 *   r_bath 3300×2500: 2·(3300 + 2500) = 11600; net 11000; 3.15 × 2.35 = 7.4025 → 7.40
 *   r_bed  3300×4000: 2·(3300 + 4000) = 14600; net 14000; 3.15 × 3.85 = 12.1275 → 12.13
 * Net floor 25.52 + 7.40 + 12.13 = 45.05; with --waste 10: 4505 × 110 / 100 = 4955.5 → 49.56.
 * Doors: d_front hinged 900, d_garden sliding 1800, d_bed hinged 800, d_bath pocket 800.
 * Windows: 1200, 1000, 1600, 600. No `height` clause, so no face area.
 */
const LANEWAY: QuantityFacts = {
  walls: [
    { category: "exterior", count: 4, length_centreline_mm: 28000, length_face_mm: 55700 },
    { category: "partition", count: 2, length_centreline_mm: 9800, length_face_mm: 18800 },
  ],
  rooms: [
    { id: "r_live", perimeter_centreline_mm: 21400, perimeter_net_mm: 20700, area_net_m2: 25.52 },
    { id: "r_bath", perimeter_centreline_mm: 11600, perimeter_net_mm: 11000, area_net_m2: 7.4 },
    { id: "r_bed", perimeter_centreline_mm: 14600, perimeter_net_mm: 14000, area_net_m2: 12.13 },
  ],
  floor_area_net_m2: 45.05,
  waste_pct: 10,
  floor_area_with_waste_m2: 49.56,
  doors: [
    { kind: "hinged", width_mm: 800, count: 1 },
    { kind: "hinged", width_mm: 900, count: 1 },
    { kind: "pocket", width_mm: 800, count: 1 },
    { kind: "sliding", width_mm: 1800, count: 1 },
  ],
  windows: [
    { width_mm: 600, count: 1 },
    { width_mm: 1000, count: 1 },
    { width_mm: 1200, count: 1 },
    { width_mm: 1600, count: 1 },
  ],
};

suite("quantities: hand-computed figures on three corpus plans", () => {
  it("laneway-house matches the hand-computed table", () => {
    expect(quantities("laneway-house.arch", 10).quantities).toEqual(LANEWAY);
  });

  it("one-room: a closed, mitred ring", () => {
    // shell exterior 200, (0,0)(5000,0)(5000,4000)(0,4000) close: centreline 2·(5000 + 4000) = 18000.
    // Mitred ring: outer face 2·(5200 + 4200) = 18800, inner 2·(4800 + 3800) = 17200; 36000.
    // r_main 5000×4000: centreline 18000; net x 100..4900, y 100..3900: 17200; 4.8 × 3.8 = 18.24.
    expect(quantities("one-room.arch").quantities).toEqual({
      walls: [{ category: "exterior", count: 1, length_centreline_mm: 18000, length_face_mm: 36000 }],
      rooms: [{ id: "r_main", perimeter_centreline_mm: 18000, perimeter_net_mm: 17200, area_net_m2: 18.24 }],
      floor_area_net_m2: 18.24,
      doors: [{ kind: "hinged", width_mm: 900, count: 1 }],
      windows: [{ width_mm: 1500, count: 1 }],
    });
  });

  it("two-storey: per level, with face areas because the plan authors heights", () => {
    const s = quantities("two-storey.arch");
    const [l1, l2] = s.levels!;
    // The top-level block is the lowest storey's, as every top-level fact is.
    expect(s.quantities).toEqual(l1!.quantities);
    // Level 1 (height 2700). shell 8000×7000 ring t200: centreline 30000. hall_w x=2200 (7000)
    // and kitchen_w y=3600 from x 2200 to 8000 (5800): partition centreline 12800.
    // Outline: outer 2·(8200 + 7200) = 30800 (exterior); holes, inner faces x 100..7900, y 100..6900:
    //   hall    x 100..2150, y 100..6900:   exterior 2050 + 6800 + 2050 = 10900, partition 6800
    //   living  x 2250..7900, y 100..3550:  exterior 5650 + 3450 = 9100, partition 5650 + 3450 = 9100
    //   kitchen x 2250..7900, y 3650..6900: exterior 3250 + 5650 = 8900, partition 5650 + 3250 = 8900
    // Face: exterior 30800 + 10900 + 9100 + 8900 = 59700; partition 6800 + 9100 + 8900 = 24800.
    // Face area: 59700 × 2700 = 161.19 m²; 24800 × 2700 = 66.96 m².
    expect(l1!.quantities!.walls).toEqual([
      {
        category: "exterior",
        count: 1,
        length_centreline_mm: 30000,
        length_face_mm: 59700,
        face_area_before_openings_m2: 161.19,
      },
      {
        category: "partition",
        count: 2,
        length_centreline_mm: 12800,
        length_face_mm: 24800,
        face_area_before_openings_m2: 66.96,
      },
    ]);
    // Rooms: hall 2200×7000 → 18400, net 2·(2050 + 6800) = 17700, 2.05 × 6.8 = 13.94;
    // living 5800×3600 → 18800, net 2·(5650 + 3450) = 18200, 5.65 × 3.45 = 19.4925 → 19.49;
    // kitchen 5800×3400 → 18400, net 2·(5650 + 3250) = 17800, 5.65 × 3.25 = 18.3625 → 18.36.
    expect(l1!.quantities!.rooms).toEqual([
      { id: "hall", perimeter_centreline_mm: 18400, perimeter_net_mm: 17700, area_net_m2: 13.94 },
      { id: "living", perimeter_centreline_mm: 18800, perimeter_net_mm: 18200, area_net_m2: 19.49 },
      { id: "kitchen", perimeter_centreline_mm: 18400, perimeter_net_mm: 17800, area_net_m2: 18.36 },
    ]);
    expect(l1!.quantities!.floor_area_net_m2).toBe(51.79); // 13.94 + 19.49 + 18.36
    // Level 2 (height 3000). Partitions hall_w 7000 + bath_w 2200 + bed_w 5800 = 15000.
    // Holes: landing x 100..2150, y 100..4850 (exterior 2050 + 4750, partition 4750 + 2050);
    // bath y 4950..6900 (exterior 1950 + 2050, partition 2050 + 1950); bed1 as living, bed2 as
    // kitchen. Exterior 30800 + 6800 + 4000 + 9100 + 8900 = 59600; partition 6800 + 4000 + 9100
    // + 8900 = 28800. Face area 59600 × 3000 = 178.8; 28800 × 3000 = 86.4.
    expect(l2!.quantities!.walls).toEqual([
      {
        category: "exterior",
        count: 1,
        length_centreline_mm: 30000,
        length_face_mm: 59600,
        face_area_before_openings_m2: 178.8,
      },
      {
        category: "partition",
        count: 3,
        length_centreline_mm: 15000,
        length_face_mm: 28800,
        face_area_before_openings_m2: 86.4,
      },
    ]);
    // landing 2·(2050 + 4750) = 13600, 2.05 × 4.75 = 9.7375 → 9.74; bath 2·(2050 + 1950) = 8000,
    // 2.05 × 1.95 = 3.9975 → 4.00.
    expect(l2!.quantities!.rooms.slice(0, 2)).toEqual([
      { id: "landing", perimeter_centreline_mm: 14200, perimeter_net_mm: 13600, area_net_m2: 9.74 },
      { id: "bath", perimeter_centreline_mm: 8600, perimeter_net_mm: 8000, area_net_m2: 4 },
    ]);
    expect(l2!.quantities!.doors).toEqual([
      { kind: "hinged", width_mm: 800, count: 1 },
      { kind: "hinged", width_mm: 900, count: 2 },
    ]);
    expect(l2!.quantities!.windows.map((w) => w.width_mm)).toEqual([600, 1200, 1500]);
  });
});

suite("quantities: the documented T-joint (docs/analysis.md § Quantities)", () => {
  it("a partition's faces stop at the exterior wall's inner face", () => {
    const s = describe(
      `plan "T" {
      units mm
      wall exterior  thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
      wall partition thickness 100 { (3000,0) (3000,4000) }
    }`,
      { facts: ["quantities"] },
    );
    // Outer 2·(6200 + 4200) = 20800; two holes 2·(2850 + 3800) = 13300 each; the partition owns
    // its two faces 2·3800 = 7600, the exterior the rest: 20800 + 26600 − 7600 = 39800.
    expect(s.quantities!.walls).toEqual([
      { category: "exterior", count: 1, length_centreline_mm: 20000, length_face_mm: 39800 },
      { category: "partition", count: 1, length_centreline_mm: 4000, length_face_mm: 7600 },
    ]);
  });
});

suite("quantities: the opt-in path and its parameters", () => {
  it("no waste figure unless a waste percentage is passed", () => {
    const q = quantities("laneway-house.arch").quantities!;
    expect("waste_pct" in q).toBe(false);
    expect("floor_area_with_waste_m2" in q).toBe(false);
    expect(quantities("laneway-house.arch", 0).quantities!.floor_area_with_waste_m2).toBe(45.05);
  });

  it("a waste percentage outside 0..100 is a caller's error", () => {
    for (const bad of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => describe(src("one-room.arch"), { facts: ["quantities"], wastePct: bad })).toThrow(RangeError);
  });

  it.each(SHIPPED_EXAMPLES)("%s: only the quantities key is added, and it agrees with the summary", (rel) => {
    const source = EXAMPLE_FILES[rel]!;
    const plain = describe(source, { world: EXAMPLES_WORLD });
    const withQ = describe(source, { world: EXAMPLES_WORLD, facts: ["quantities"], wastePct: 7.5 });
    // Drop the key in place, so every other key keeps its order.
    const drop = (o: object): Record<string, unknown> =>
      Object.fromEntries(Object.entries(o).filter(([k]) => k !== "quantities"));
    const strip = (s: SceneSummary): unknown => {
      const top = drop(s);
      if (s.levels) top.levels = s.levels.map(drop);
      return top;
    };
    expect(JSON.stringify(strip(withQ))).toBe(JSON.stringify(plain));
    if (!withQ.ok) return;
    for (const st of [withQ, ...(withQ.levels ?? [])]) {
      const q = st.quantities!;
      // The corpus never omits a face length or a net perimeter.
      expect(q.faces_omitted).toBeUndefined();
      for (const w of q.walls) expect(w.length_face_mm).toBeTypeOf("number");
      for (const r of q.rooms) expect(r.perimeter_net_mm).toBeTypeOf("number");
      // The same rooms and net areas `rooms[]` and `totals` report.
      expect(q.rooms.map((r) => r.id)).toEqual(st.rooms.map((r) => r.id));
      expect(q.rooms.map((r) => r.area_net_m2)).toEqual(st.rooms.map((r) => r.net_area_m2));
      expect(q.floor_area_net_m2).toBe(st.totals.net_floor_area_m2);
      // Counts agree with the lists.
      expect(q.doors.reduce((n, d) => n + d.count, 0)).toBe(st.doors.length);
      expect(q.windows.reduce((n, w) => n + w.count, 0)).toBe(st.windows.length);
      // Face area appears exactly when heights are reported.
      for (const w of q.walls) expect(w.face_area_before_openings_m2 !== undefined).toBe(st.heights !== undefined);
    }
  });

  it("no field anywhere is named cost, stud or code", () => {
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    for (const rel of SHIPPED_EXAMPLES) {
      const s = describe(EXAMPLE_FILES[rel]!, { world: EXAMPLES_WORLD, facts: ["quantities"], wastePct: 5 });
      walk(s.quantities);
      for (const l of s.levels ?? []) walk(l.quantities);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const k of keys) expect(k).not.toMatch(/cost|stud|code/i);
  });

  it("the corpus's largest storey reads under a tenth of MAX_FACE_CURVES", () => {
    let most = 0;
    for (const rel of SHIPPED_EXAMPLES) {
      const { ir, levels } = resolvePlan(EXAMPLE_FILES[rel]!, { world: EXAMPLES_WORLD });
      if (!ir) continue;
      for (const st of levels.length > 0 ? levels.map((l) => l.ir) : [ir]) {
        const intern = new PointInterner();
        const n = st.walls.reduce((m, w) => m + wallBand(w, intern).reduce((k, l) => k + curvesOfLoop(l).length, 0), 0);
        most = Math.max(most, n);
      }
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThan(MAX_FACE_CURVES / 10);
  });
});

function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

suite("arch takeoff", () => {
  it("laneway-house as CSV: the hand-computed table, one figure per row", () => {
    const r = cli(["takeoff", "examples/laneway-house.arch", "--format", "csv", "--waste", "10"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      [
        "level,section,item,width_mm,field,value",
        ",walls,exterior,,count,4",
        ",walls,exterior,,length_centreline_mm,28000",
        ",walls,exterior,,length_face_mm,55700",
        ",walls,partition,,count,2",
        ",walls,partition,,length_centreline_mm,9800",
        ",walls,partition,,length_face_mm,18800",
        ",rooms,r_live,,perimeter_centreline_mm,21400",
        ",rooms,r_live,,perimeter_net_mm,20700",
        ",rooms,r_live,,area_net_m2,25.52",
        ",rooms,r_bath,,perimeter_centreline_mm,11600",
        ",rooms,r_bath,,perimeter_net_mm,11000",
        ",rooms,r_bath,,area_net_m2,7.4",
        ",rooms,r_bed,,perimeter_centreline_mm,14600",
        ",rooms,r_bed,,perimeter_net_mm,14000",
        ",rooms,r_bed,,area_net_m2,12.13",
        ",floor,storey,,floor_area_net_m2,45.05",
        ",floor,storey,,waste_pct,10",
        ",floor,storey,,floor_area_with_waste_m2,49.56",
        ",doors,hinged,800,count,1",
        ",doors,hinged,900,count,1",
        ",doors,pocket,800,count,1",
        ",doors,sliding,1800,count,1",
        ",windows,window,600,count,1",
        ",windows,window,1000,count,1",
        ",windows,window,1200,count,1",
        ",windows,window,1600,count,1",
        "",
      ].join("\n"),
    );
  });

  it("Markdown by default, one table per section and storey", () => {
    const r = cli(["takeoff", "examples/two-storey.arch"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## Level 2 (First floor): walls");
    expect(r.stdout).toContain("| exterior | 1 | 30000 | 59600 | 178.8 |");
    expect(r.stdout).not.toMatch(/cost|stud|code/i);
  });

  it("--json carries the describe block", () => {
    const r = cli(["takeoff", "examples/laneway-house.arch", "--json", "--waste", "10"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).quantities).toEqual(LANEWAY);
  });

  it("exit codes: 3 for a bad flag value, 2 for a plan that does not resolve", () => {
    expect(cli(["takeoff", "examples/one-room.arch", "--format", "xls"]).status).toBe(3);
    expect(cli(["takeoff", "examples/one-room.arch", "--waste", "150"]).status).toBe(3);
    expect(cli(["takeoff", "examples/one-room.arch", "--json", "--format", "csv"]).status).toBe(3);
    expect(cli(["describe", "examples/one-room.arch", "--waste", "10"]).status).toBe(3);
    const broken = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "takeoff", "-"], {
      input: 'plan "B" { units mm room at (0,0) size 0x3000 }',
      encoding: "utf8",
    });
    expect(broken.status).toBe(2);
  });
});
