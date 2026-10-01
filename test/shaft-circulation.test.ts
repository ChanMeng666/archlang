/**
 * Circulation on a storey reached only by a shaft (ADR 0008, `computeCirculation`'s
 * `arrivals`).
 *
 * A storey with no exterior door that a stair, lift or escalator reaches used to have NO
 * circulation facts — `computeCirculation` returned null on `!access.hasEntrance` — while
 * lint's reachability rule already walked it from the room the shaft lands in. So upstairs
 * `W_ROOM_UNREACHABLE` knew where the entrance was and `W_PATH_TOO_NARROW` /
 * `W_CIRCUITOUS_PATH` were silent. The arriving runs are now that storey's entrances: each
 * walk starts in the row of cells in front of the run's entry edge, the doors are walked
 * from the arrival rooms, and the model's `entranceId` is the run's id.
 *
 * Pinned here: the walk starts at the landing (hand-derived on a one-room storey, and moved
 * by flipping the run's direction, which moves its entry edge); a landing with no door out
 * gives `no_door_route` for the rest, matching lint; the law "no arrivals ⇒ unchanged" over
 * the corpus, with the exact set of storeys the arrivals reach; and equivariance — the same
 * building placed under every element of D4 measures the same numbers.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDoorAccessGraph, buildingRoomReach, DEFAULT_TOL, resolvePlan, storeyGrounded } from "../src/analyze.js";
import { type CirculationModel, computeCirculation } from "../src/analyze/circulation.js";
import { describe as describePlan, lint, repair } from "../src/index.js";
import type { RDoor, RFurniture, ROpening, RRoom, RVoid, ResolvedPlan } from "../src/ir.js";
import { arrivalRuns, type RVertical, verticalReach, verticalsOf } from "../src/vertical.js";
import type { World } from "../src/world.js";

/** A two-storey shell: a hall with the front door and a stair, a living room; upstairs is
 *  `upper`, whose stair (same id `st`) is the only way in. Every coordinate is a multiple of
 *  the 100 mm nav cell. */
const building = (upper: string): string => {
  const ground = `
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    room id=hall at (0,0) size 3000x6000 label "Hall" uses hall
    room id=living at (3000,0) size 5000x6000 label "Living" uses living
    door id=front on shell at 23000 width 1000 swing into hall
    door id=dl on hw at 3000 width 900 swing into living
    stair id=st at (200,1000) size 1000x3000 dir up`;
  return `plan "Shaft circulation" {
  units mm
  level 1 "Ground" {${ground}
  }
  level 2 "Upper" {${upper}
  }
}`;
};

/** One room upstairs, the stair in it: the walk is hand-derivable. */
const oneRoom = (dir: "up" | "down"): string =>
  building(`
    wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,6000) (0,6000) close }
    room id=landing at (0,0) size 3000x6000 label "Landing" uses hall circulation
    stair id=st at (200,1000) size 1000x3000 dir ${dir}`);

const level = (src: string, n: number) => {
  const s = describePlan(src);
  expect(s.ok).toBe(true);
  return s.levels!.find((l) => l.level === n)!;
};

describe("a storey reached only by a stair is walked from the landing", () => {
  it("measures the one room from the row of cells in front of the run's entry edge (hand-derived)", () => {
    // `dir down` upstairs: you step off at the flight's HEAD, the footprint's top edge
    // (y = 1000), so the seeds are the cells centred at y = 950, x = 250 … 1150. The room is
    // measured to the free cell nearest its centre (1500, 3000): the column x = 1450 lies
    // within the 300 mm body radius of the flight (x ≤ 1200), so the nearest free cells are
    // (1550, 2950) and (1550, 3050), and the walk reaches (1550, 2950) first — from (1150,
    // 950) four cells east along the open landing, then twenty south: 24 × 100 = 2400 mm.
    // The straight line is hypot(400, 2000) ≈ 2039.6, so the detour is 2400 / 2039.6 = 1.18.
    // The room the run stands in is entered across the run itself: 1000 mm, its width.
    const up = level(oneRoom("down"), 2);
    expect(up.access.hasEntrance).toBe(false);
    expect(up.circulation).toEqual({
      entranceId: "st",
      cellSizeMm: 100,
      bodyRadiusMm: 300,
      rooms: [{ roomId: "landing", walkDistanceMm: 2400, bottleneckClearWidthMm: 1000, detourRatio: 1.18 }],
      routes: [],
    } satisfies CirculationModel);
  });

  it("follows the entry edge: the same run read `dir up` is stepped off at its foot instead", () => {
    // `dir up` puts the tail on the bottom edge (y = 4000), so the seeds are the cells
    // centred at y = 4050: from (1150, 4050) four cells east and ten north to (1550, 3050),
    // 14 × 100 = 1400 mm, over a straight line of hypot(400, 1000) ≈ 1077.0 (detour 1.30) —
    // the walk moved because the landing moved, nothing else did.
    const up = level(oneRoom("up"), 2);
    expect(up.circulation?.entranceId).toBe("st");
    expect(up.circulation?.rooms).toEqual([
      { roomId: "landing", walkDistanceMm: 1400, bottleneckClearWidthMm: 1000, detourRatio: 1.3 },
    ]);
  });

  it("lints the storey it now measures: a 700 mm door upstairs is W_PATH_TOO_NARROW on level 2", () => {
    const src = building(`
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    room id=landing at (0,0) size 3000x6000 label "Landing" uses hall circulation
    room id=box at (3000,0) size 5000x6000 label "Box room" uses storage
    door id=db on hw at 3000 width 700 swing into box
    stair id=st at (200,1000) size 1000x3000 dir down`);
    const narrow = lint(src).filter((d) => d.code === "W_PATH_TOO_NARROW");
    // A 700 mm door's modeled clear width is 640 mm (the 60 mm leaf allowance).
    expect(narrow.map((d) => [d.level, d.message])).toEqual([
      [2, 'The walk from the entrance to "Box room" squeezes to 640 mm (60 mm below the 700 mm minimum).'],
    ]);
    expect(level(src, 2).circulation?.rooms.find((r) => r.roomId === "box")?.bottleneckClearWidthMm).toBe(640);
  });
});

describe("a landing with no door into the rest of the storey", () => {
  const src = building(`
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    wall id=bw partition thickness 100 { (3000,3000) (8000,3000) }
    room id=landing at (0,0) size 3000x6000 label "Landing" uses hall circulation
    room id=bed at (3000,0) size 5000x3000 label "Bedroom" uses bedroom
    room id=bath at (3000,3000) size 5000x3000 label "Bath" uses bath
    door id=dbb on bw at 2500 width 800 swing into bath
    stair id=st at (200,1000) size 1000x3000 dir down`);

  it("measures the landing and gives every other room `no_door_route`", () => {
    const c = level(src, 2).circulation!;
    expect(c.entranceId).toBe("st");
    expect(c.rooms.map((r) => r.roomId)).toEqual(["landing"]);
    expect(c.unmeasured).toEqual([
      { roomId: "bed", reason: "no_door_route" },
      { roomId: "bath", reason: "no_door_route" },
    ]);
    expect(c.blocked).toBeUndefined();
  });

  it("agrees with lint's reachability rule, which walks the same storey from the same landing", () => {
    const unreachable = lint(src)
      .filter((d) => d.code === "W_ROOM_UNREACHABLE" && d.level === 2)
      .map((d) => d.message);
    expect(unreachable).toEqual([
      `Room "Bedroom" can't be reached from the entrance.`,
      `Room "Bath" can't be reached from the entrance.`,
    ]);
  });
});

// ---- the law: no arrivals ⇒ unchanged, over the corpus ------------------------------

const EXAMPLES = resolvePath("examples");
const FIXTURES = resolvePath("test/fixtures");

function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

const corpus = (): Array<{ name: string; path: string; world: World }> => [
  ...readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `examples/${f}`, path: join(EXAMPLES, f), world: worldFor(EXAMPLES) })),
  ...readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => ({ name: `test/fixtures/${f}`, path: join(FIXTURES, f), world: worldFor(FIXTURES) })),
];

/** `computeCirculation` on one resolved storey, exactly as `describe()` calls it. */
function circulationOf(ir: ResolvedPlan, arrivals?: readonly RVertical[]): CirculationModel | null {
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const voids = ir.elements.filter((e): e is RVoid => e.kind === "void");
  const access = buildDoorAccessGraph(rooms, doors, DEFAULT_TOL, undefined, openings);
  const args = [
    rooms,
    ir.walls,
    doors,
    openings,
    furniture,
    access,
    DEFAULT_TOL,
    undefined,
    verticalsOf(ir),
    voids,
  ] as const;
  return arrivals === undefined ? computeCirculation(...args) : computeCirculation(...args, arrivals);
}

describe("law: a storey no shaft arrives on measures exactly as before", () => {
  it("over every example and fixture storey: [] ≡ omitted; a front door ignores arrivals; describe() reads the reach", () => {
    const reached: string[] = [];
    for (const { name, path, world } of corpus()) {
      const src = readFileSync(path, "utf8");
      const { ir, levels } = resolvePlan(src, { world });
      if (!ir) continue;
      const storeys = levels.length > 0 ? levels : [{ level: 0, ir }];
      const inputs = storeys.map((l) => ({ level: l.level, ir: l.ir }));
      const reach =
        levels.length > 0
          ? verticalReach(
              inputs,
              (n) => storeyGrounded(inputs.find((x) => x.level === n)!.ir, DEFAULT_TOL),
              buildingRoomReach(inputs, DEFAULT_TOL),
            )
          : null;
      const runs = reach ? arrivalRuns(inputs, reach.arrivals) : new Map<number, RVertical[]>();
      const summary = describePlan(src, { world });
      for (const st of storeys) {
        const without = JSON.stringify(circulationOf(st.ir));
        // An empty arrival list is the pre-existing call, byte for byte.
        expect(JSON.stringify(circulationOf(st.ir, [])), `${name} L${st.level}`).toBe(without);
        // A storey with a front door walks from it, whatever shafts land there.
        const hasEntrance = buildDoorAccessGraph(
          st.ir.elements.filter((e): e is RRoom => e.kind === "room"),
          st.ir.elements.filter((e): e is RDoor => e.kind === "door"),
          DEFAULT_TOL,
          undefined,
          st.ir.elements.filter((e): e is ROpening => e.kind === "opening"),
        ).hasEntrance;
        if (hasEntrance)
          expect(JSON.stringify(circulationOf(st.ir, verticalsOf(st.ir))), `${name} L${st.level}`).toBe(without);
        // describe() is that call with the storey's own arrivals; only where some arrive and
        // the storey has no front door may it differ from the call without them.
        const arrivals = runs.get(st.level) ?? [];
        const got =
          levels.length > 0 ? summary.levels!.find((l) => l.level === st.level)!.circulation : summary.circulation;
        expect(JSON.stringify(got), `${name} L${st.level}`).toBe(JSON.stringify(circulationOf(st.ir, arrivals)));
        if (JSON.stringify(got) !== without) reached.push(`${name} L${st.level}`);
      }
    }
    // The storeys the change reaches — every one was null before (no front door).
    expect(reached).toEqual([
      "examples/hillside-villa.arch L2",
      "examples/townhouse.arch L2",
      "examples/townhouse.arch L3",
      "examples/two-storey.arch L2",
    ]);
  }, 120_000);
});

// ---- equivariance: the same building under every element of D4 ----------------------

describe("equivariance: a shaft-reached storey measures the same however the building is placed", () => {
  // Both storeys are components placed with the SAME frame, so the stair keeps its id
  // (`b.st`) across them and stays one shaft; the stair's entry edge crosses `place` as its
  // `_tail`. Furniture upstairs makes the plan asymmetric, so a wrong landing would show.
  const components = `
  component ground() {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    room id=hall at (0,0) size 3000x6000 label "Hall" uses hall
    room id=living at (3000,0) size 5000x6000 label "Living" uses living
    door id=front on shell at 23000 width 1000 swing into hall
    door id=dl on hw at 3000 width 900 swing into living
    stair id=st at (200,1000) size 1000x3000 dir up
  }
  component upper() {
    wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
    wall id=hw partition thickness 100 { (3000,0) (3000,6000) }
    wall id=bw partition thickness 100 { (3000,3000) (8000,3000) }
    room id=landing at (0,0) size 3000x6000 label "Landing" uses hall circulation
    room id=bed at (3000,0) size 5000x3000 label "Bedroom" uses bedroom
    room id=bath at (3000,3000) size 5000x3000 label "Bath" uses bath
    door id=db on hw at 1500 width 900 swing into bed
    door id=dba on hw at 4500 width 800 swing into bath
    furniture bed at (5000,300) size 1600x2000 in bed
    furniture wc at (7200,5000) size 400x700 in bath
    stair id=st at (200,1000) size 1000x3000 dir down
  }`;
  const placed = (frame: string): string =>
    `plan "Placed" {
  units mm
  ${components}
  level 1 "Ground" {
    place ground() as b at (20000,20000) ${frame}
  }
  level 2 "Upper" {
    place upper() as b at (20000,20000) ${frame}
  }
}`;
  const FRAMES = [
    "",
    "rotate 90",
    "rotate 180",
    "rotate 270",
    "mirror x",
    "mirror y",
    "rotate 90 mirror x",
    "rotate 90 mirror y",
  ];

  it("every frame measures the identity's numbers, and the identity is a real measurement", () => {
    const id = level(placed(""), 2).circulation;
    expect(id?.entranceId).toBe("b.st");
    expect(id?.rooms.map((r) => r.roomId)).toEqual(["b.landing", "b.bed", "b.bath"]);
    for (const f of FRAMES) expect(level(placed(f), 2).circulation, f || "identity").toEqual(id);
  });
});

// ---- repair's circulation guard reads the same arrivals ------------------------------

describe("repair guards the walks of a storey reached only by a stair", () => {
  // `test/repair-circulation.test.ts`'s GUARDED plan moved upstairs: no front door, the
  // stair is the way in. Before the guard read the arrivals it was inactive here (no
  // entrance), and the naive wrong-room fix parked the wardrobe over the bedroom doorway.
  const src = `plan "Guard upstairs" {
  units mm
  grid 100
  level 1 "Ground" {
    wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
    room id=hall at (0,0) size 5000x5000 label "Hall" uses hall
    door id=entry at (2500,0) width 900 wall exterior hinge left swing in
    stair id=st at (200,200) size 900x2000 dir up
  }
  level 2 "Upper" {
    wall exterior thickness 200 { (0,0) (5000,0) (5000,5000) (0,5000) close }
    wall partition thickness 100 { (0,3000) (5000,3000) }
    room id=living at (0,0)    size 5000x3000 label "Living" uses living
    room id=bed    at (0,3000) size 2000x2000 label "Bedroom" uses bedroom
    door id=mid   at (1100,3000) width 900 wall partition hinge left swing in
    furniture wardrobe at (3800,200) size 1000x800 label "Wardrobe" in bed
    stair id=st at (200,200) size 900x2000 dir up
  }
}`;

  it("declines the move that would pinch the walk to the bedroom, and reports it", () => {
    const up = level(src, 2).circulation;
    expect(up?.entranceId).toBe("st");
    expect(up?.rooms.find((r) => r.roomId === "bed")?.bottleneckClearWidthMm).toBeGreaterThanOrEqual(700);
    expect(lint(src).some((d) => d.code === "W_FIXTURE_WRONG_ROOM" && d.level === 2)).toBe(true);
    const r = repair(src);
    expect(r.changes).toEqual([]);
    const note = r.unresolved.find((u) => u.id === "wardrobe#1");
    expect(note?.level).toBe(2);
    expect(note?.reason).toMatch(/pinch the walk to "Bedroom" below 700 mm/);
  });
});
