import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve as resolvePath, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { centreFreedomToClearWidth, DEFAULT_BODY_RADIUS_MM } from "../src/analyze/circulation.js";
import { describe as describePlan, type World } from "../src/index.js";

/**
 * A door's width lives on the cells its carve OPENS, and a room cell keeps its own clearance —
 * the doorway's far seed included.
 *
 * A connector's carve used to stamp its clear width on its FAR seed too (the last cell of
 * each carve path, always a floor cell of the `between[1]` room). First that stamp REPLACED
 * the cell's own clearance, so a furniture pinch narrower than the door on the far seed was
 * erased; then it took the minimum of the two. It is now gone. While a key route still
 * started on the cells a carve opened inside its from-room, the far seed was sometimes a
 * door's only cap (`min-bedroom-flat`'s route bed → bath read 14000 through a 740 mm door
 * without it). Once routes and rooms were read on the FLOOR (`test/route-source-floor.test.ts`
 * and the floor tests below), every path through a door crosses an opened cell carrying the
 * door's width, so the stamp could only cap paths that pass the far seed WITHOUT using the
 * door — and, the far seed being `between[1]`'s, only in one source order (the phantom plan
 * below). The pinch tests read min(door, pinch) because a path through the door crosses both
 * the opened cells and the pinched floor, not because anything is stamped on the floor.
 * The corpus invariant at the bottom of this file is a guard, not a witness: nothing in the
 * corpus breaks it on this tree or the one before.
 */

const R = DEFAULT_BODY_RADIUS_MM;
const CELL = 100; // a 6 × 3 m plan sits on the nav grid's 100 mm floor (ADR 0008 addendum)

type Rect = { x: number; y: number; w: number; h: number };
const distToRect = (px: number, py: number, r: Rect): number =>
  Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h)));

/**
 * Two rooms either side of a 100 mm partition at x = 3000, the front door into `b`, and an
 * 800 mm door `d` between them at y = 1500 (threshold y 1100..1900). Two 100 mm-deep cabinets
 * stand against the partition's `b` face, one either side of the doorway's mouth, leaving a
 * gap between `lo` (the lower cabinet's far end) and `hi` (the upper one's near end). `a` is
 * reached only through `d`, so every route into it crosses `b`'s cells at the doorway.
 * `order` is the rooms' source order, which is `d.between`'s — and so which room's seed is
 * the carve's FAR seed: `ab` puts it in `b`, at the cabinets.
 */
const flanked = (
  lo: number,
  hi: number,
  order: "ab" | "ba",
  /** Which room the front door opens into (default `b`), and, when given, the `place`
   *  clauses of a component instance `g` the plan is wrapped in (ids then read `g.<id>`). */
  opts: { frontIn?: "a" | "b"; clauses?: string } = {},
): { src: string; cabinets: Rect[] } => {
  const cabinets: Rect[] = [
    { x: 3050, y: lo - 360, w: 100, h: 360 },
    { x: 3050, y: hi, w: 100, h: 400 },
  ];
  const ra = `  room id=a at (0,0) size 3000x3000 label "Hall" uses hall circulation`;
  const rb = `  room id=b at (3000,0) size 3000x3000 label "Bed" uses bedroom`;
  const body = `  wall id=sh exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  wall id=mid partition thickness 100 { (3000,0) (3000,3000) }
${order === "ab" ? `${ra}\n${rb}` : `${rb}\n${ra}`}
  door id=front at (${opts.frontIn === "a" ? 1500 : 4500},3000) width 900 wall sh
  door id=d at (3000,1500) width 800 wall mid
${cabinets.map((c, i) => `  furniture id=c${i} cabinet at (${c.x},${c.y}) size ${c.w}x${c.h}`).join("\n")}`;
  const src =
    opts.clauses === undefined
      ? `plan "pinch" {\n  units mm\n${body}\n}\n`
      : `plan "pinch" {\n  units mm\n  grid 100\n  component c() {\n${body}\n  }\n  place c() as g at (0,0)${opts.clauses}\n}\n`;
  return { src, cabinets };
};

/**
 * The pinch at the doorway's `b` side, derived from the mechanism rather than read off the
 * model: the first column past the partition's band (x = 3150 — the 100 mm wall blocks the
 * columns whose centres it covers, 2950 and 3050) holds the far seeds; a cell there is free
 * when its centre is farther than R from every cabinet (the erosion); its width is
 * `centreFreedomToClearWidth` of its hop count to the nearest eroded in-room cell, a wall
 * cell under a halo included (the distance transform is 4-connected over the whole grid,
 * so that count is a Manhattan distance). The
 * widest route takes the best free cell in the doorway's span.
 */
const doorwayPinch = (cabinets: Rect[]): number => {
  const eroded = (x: number, y: number): boolean =>
    x > 0 && x < 6000 && y > 0 && y < 3000 && cabinets.some((c) => distToRect(x, y, c) <= R);
  const hops = (x: number, y: number): number => {
    for (let d = 0; d < 30; d++) {
      for (let i = -d; i <= d; i++) {
        const j = d - Math.abs(i);
        if (eroded(x + i * CELL, y + j * CELL) || eroded(x + i * CELL, y - j * CELL)) return d;
      }
    }
    return Infinity;
  };
  const widths: number[] = [];
  for (let y = 1150; y < 1900; y += CELL) {
    if (!eroded(3150, y)) widths.push(centreFreedomToClearWidth(hops(3150, y), CELL, R));
  }
  expect(widths.length).toBeGreaterThan(0);
  return Math.max(...widths);
};

const measure = (src: string) => {
  const s = describePlan(src);
  const a = s.circulation?.rooms.find((r) => r.roomId === "a");
  const doorClear = s.access?.edges.find((e) => e.doorId === "d")?.estimatedClearWidth;
  if (!a || doorClear === undefined) throw new Error("room a is not measured through d");
  return {
    bottleneck: a.bottleneckClearWidthMm,
    doorClear,
    between: s.access!.edges.find((e) => e.doorId === "d")!.between,
  };
};

describe("a doorway's far seed keeps the room's own clearance (the route reads min(door, pinch))", () => {
  it("a furniture pinch narrower than the door on the far seed is reported, in either source order", () => {
    const ab = flanked(1060, 1840, "ab");
    const m = measure(ab.src);
    const pinch = doorwayPinch(ab.cabinets);
    // Not vacuous: the far seed is `b`'s, and the pinch is narrower than the door.
    expect(m.between).toEqual(["a", "b"]);
    expect(pinch).toBeLessThan(m.doorClear);
    expect(m.bottleneck).toBe(Math.min(m.doorClear, pinch));
    // The far seed is always `between[1]`'s, so a far-seed stamp was asymmetric in source
    // order: with `b` written first the seed in the pinch is the NEAR one, never stamped, and
    // the pinch was always reported. With no far-seed stamp both orders read the same.
    const ba = measure(flanked(1060, 1840, "ba").src);
    expect(ba.between).toEqual(["b", "a"]);
    expect(ba.bottleneck).toBe(m.bottleneck);
  });

  it("a pinch wider than the door leaves the door's width as the bottleneck", () => {
    const wide = flanked(960, 1940, "ab");
    const m = measure(wide.src);
    const pinch = doorwayPinch(wide.cabinets);
    expect(pinch).toBeGreaterThan(m.doorClear);
    expect(m.bottleneck).toBe(m.doorClear);
    expect(measure(flanked(960, 1940, "ba").src).bottleneck).toBe(m.doorClear);
  });
});

describe("a door a walk never uses cannot cap it (no far-seed stamp)", () => {
  // Red team's plan: a 1 m hall `h`, narrowed by a cabinet to one free row, a 700 mm door `d`
  // off it into `r`, and a 1000 mm door `d2` at its end into the study `e`. `e`'s walk runs
  // along the hall and never through `d`. When a carve stamped its door's width on its far
  // seed, `d`'s far seed — a HALL cell on that one free row whenever `h` was written after `r`
  // — took 640, and `e` read 640 through a door it never crosses; with the rooms the other
  // way round, 700.
  const FRAMES = [0, 90, 180, 270].flatMap((r) => ["", " mirror x"].map((m) => `${r ? ` rotate ${r}` : ""}${m}`));
  const phantom = (hallFirst: boolean, withD: boolean, clauses: string): string => {
    const r = `    room id=r at (0,1000) size 6000x3000 label "Bed" uses bedroom`;
    const h = `    room id=h at (0,0) size 6000x1000 label "Hall" uses hall circulation`;
    return `plan "phantom" {\n  units mm\n  grid 100\n  component c() {
    wall id=sh exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall id=p1 partition thickness 100 { (0,1000) (6000,1000) }
    wall id=p2 partition thickness 100 { (6000,0) (6000,4000) }
${hallFirst ? `${h}\n${r}` : `${r}\n${h}`}
    room id=e at (6000,0) size 2000x4000 label "Study" uses office
    door id=front at (0,500) width 1200 wall sh
${withD ? "    door id=d at (3000,1000) width 700 wall p1\n" : ""}    door id=d2 at (6000,500) width 1000 wall p2
    furniture id=c cabinet at (2600,100) size 800x400
  }\n  place c() as g at (0,0)${clauses}\n}\n`;
  };
  const read = (src: string) => {
    const s = describePlan(src);
    const e = s.circulation?.rooms.find((x) => x.roomId === "g.e");
    if (!e) throw new Error("the study is not measured");
    return { s, e: { walk: e.walkDistanceMm, bottleneck: e.bottleneckClearWidthMm, detour: e.detourRatio } };
  };

  it("the study reads the same with or without the door it never uses, in both source orders and all eight frames", () => {
    // The reference is the plan WITHOUT `d`: a door no walk to `e` crosses cannot change it.
    const ref = read(phantom(true, false, "")).e;
    const withD = read(phantom(false, true, ""));
    const dClear = withD.s.access?.edges.find((x) => x.doorId === "g.d")?.estimatedClearWidth;
    // Not vacuous: `d` is narrower than what the study reads, so a stamp of it would show.
    expect(dClear).toBeLessThan(ref.bottleneck);
    for (const hallFirst of [true, false]) {
      for (const f of FRAMES)
        expect(read(phantom(hallFirst, true, f)).e, `${hallFirst ? "h" : "r"} first${f}`).toEqual(ref);
    }
  });
});

describe("a room is reached on its FLOOR, not on the doorway cells inside its rectangle", () => {
  // The front door opens into `a`, so `b` is the room behind `d`, and its whole floor is
  // reached only past the cabinets' pinch just inside the doorway. `d`'s carve opens the
  // partition's cells, and the column at x = 3050 lies in `b`'s rectangle (a cell belongs to
  // the room holding its centre): it reads the door's width, and a room read as its BEST
  // cell took that one, reporting the door (740) for a floor reached only at the pinch.
  const FRAMES = [0, 90, 180, 270].flatMap((r) => ["", " mirror x"].map((m) => `${r ? ` rotate ${r}` : ""}${m}`));

  it("a room pinched just past its doorway reads the pinch, in both source orders and all eight frames", () => {
    const { cabinets } = flanked(1060, 1840, "ab");
    const pinch = doorwayPinch(cabinets);
    const read = (order: "ab" | "ba", clauses: string) => {
      const s = describePlan(flanked(1060, 1840, order, { frontIn: "a", clauses }).src);
      const b = s.circulation?.rooms.find((r) => r.roomId === "g.b");
      const doorClear = s.access?.edges.find((e) => e.doorId === "g.d")?.estimatedClearWidth;
      if (!b || doorClear === undefined) throw new Error("room b is not measured through d");
      return { bottleneck: b.bottleneckClearWidthMm, walk: b.walkDistanceMm, detour: b.detourRatio, doorClear };
    };
    const ref = read("ab", "");
    // Not vacuous: the pinch is narrower than the door, and it is what `b` reads.
    expect(pinch).toBeLessThan(ref.doorClear);
    expect(ref.bottleneck).toBe(Math.min(ref.doorClear, pinch));
    for (const order of ["ab", "ba"] as const) {
      for (const f of FRAMES) expect(read(order, f), `${order}${f}`).toEqual(ref);
    }
  });
});

// ---------------------------------------------------------------------------------------
// The corpus invariant: no walk or route is wider than the doors it must pass.
// ---------------------------------------------------------------------------------------

const CORPUS_DIRS = [
  "examples",
  "test/fixtures",
  "test/recovery-corpus",
  "eval/goldens",
  "eval/fidelity-plans",
  "eval/faults",
];

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".arch") ? [p] : [];
    });
}

const worldAt = (dir: string): World => ({
  read: (p) => {
    try {
      return readFileSync(resolvePath(dir, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
});

type Summary = ReturnType<typeof describePlan>;
type Edge = NonNullable<Summary["access"]>["edges"][number];

/**
 * The widest-path (max-min) clear width from `from` to every node of the door graph, over
 * the edges the nav grid carves — every non-ambiguous edge between two rooms — plus, when
 * `from` is the exterior, each ENTRANCE edge (the doors the walk is seeded at).
 */
function widest(edges: readonly Edge[], entrances: ReadonlySet<string>, from: string): Map<string, number> {
  const usable = edges.filter(
    (e) =>
      !e.ambiguous &&
      e.between[0] !== "" &&
      e.between[1] !== "" &&
      (!e.between.includes("exterior") || entrances.has(e.doorId)),
  );
  const best = new Map<string, number>([[from, Infinity]]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of usable) {
      for (const [u, v] of [e.between, [e.between[1], e.between[0]]] as const) {
        const bu = best.get(u);
        if (bu === undefined) continue;
        const cand = Math.min(bu, e.estimatedClearWidth);
        if (cand > (best.get(v) ?? -Infinity)) {
          best.set(v, cand);
          changed = true;
        }
      }
    }
  }
  return best;
}

/**
 * Files outside the invariant's premise, each with why. Held both ways: a listed file must
 * still break the bound (else delete its row), and no other file may.
 */
const OPEN_FLOOR: Readonly<Record<string, string>> = {
  // No internal walls at all — its doors stand off every wall (`W_DOOR_OFF_WALL`), so the
  // rooms meet on open floor and the walk reaches `gal_a` and `office` at the 1140 mm front
  // door's width without passing a carved 840 mm threshold.
  "test/fixtures/zones-wings.arch": "rooms share open floor with no wall between them",
};

describe("corpus invariant: a walk's or route's bottleneck never exceeds the doors it passes", () => {
  /**
   * What it checks: each measured room's bottleneck is at most the door graph's widest-path
   * width from the exterior through the entrances, and each key route's at most the widest
   * path between its two rooms over the internal edges (`describe()` does not expose which
   * connectors a walk crossed, so the graph's best path stands in for it).
   *
   * Why it is a law for rooms separated by walls: a grid route between walled rooms crosses
   * a sequence of carved connectors, a path in that graph (the grid has no exterior cells),
   * and each crossing passes a cell stamped with that connector's width: a rasterised wall
   * blocks at least one cell between the two rooms' seeds, so the carve opens at least one
   * cell, and that cell carries the door's width. A walk is seeded only at its entrances, each at that
   * entrance's width, so it passes those cells. A key route is seeded at +Infinity on its
   * from-room's FLOOR, never on a cell a carve opened (`test/route-source-floor.test.ts`), so
   * it passes them too. The one way round is open floor: two rooms that meet with no wall
   * between them touch outside any connector ({@link OPEN_FLOOR}). Limits: it bounds by the BEST door
   * path, not the one the walk took, so it cannot see a walk capped by the wrong door of two
   * parallel ones; a storey walked from a shaft (no exterior entrance) and `blocked[]`'s
   * widest way in (a smaller-body re-run, not a door width) are not checked.
   */
  it("holds on every storey of the whole corpus", () => {
    const violations: string[] = [];
    const openFloor = new Set<string>();
    let rooms = 0;
    let routes = 0;
    const root = resolvePath(".");
    for (const dir of CORPUS_DIRS) {
      for (const file of walk(resolvePath(dir))) {
        const name = relative(root, file).split(sep).join("/");
        const s = describePlan(readFileSync(file, "utf8"), { world: worldAt(resolvePath(file, "..")) });
        const storeys = s.levels ?? [s];
        storeys.forEach((lv, i) => {
          const c = lv.circulation;
          const acc = lv.access;
          if (!c || !acc?.hasEntrance) return;
          const entrances = new Set(acc.entrances);
          const fromOutside = widest(acc.edges, entrances, "exterior");
          for (const r of c.rooms) {
            rooms++;
            const bound = fromOutside.get(r.roomId) ?? -Infinity;
            if (r.bottleneckClearWidthMm > Math.round(bound))
              violations.push(`${name} L${i} room ${r.roomId}: ${r.bottleneckClearWidthMm} > ${bound}`);
          }
          for (const rt of c.routes) {
            routes++;
            const bound = widest(acc.edges, new Set(), rt.fromRoomId).get(rt.toRoomId) ?? -Infinity;
            if (rt.bottleneckClearWidthMm > Math.round(bound))
              violations.push(
                `${name} L${i} route ${rt.fromRoomId}>${rt.toRoomId}: ${rt.bottleneckClearWidthMm} > ${bound}`,
              );
          }
        });
      }
    }
    // Not vacuous: the corpus measures hundreds of walks and dozens of routes.
    expect(rooms).toBeGreaterThan(200);
    expect(routes).toBeGreaterThan(20);
    expect(violations.filter((v) => !(v.split(" ")[0]! in OPEN_FLOOR))).toEqual([]);
    for (const v of violations) openFloor.add(v.split(" ")[0]!);
    expect([...openFloor].sort()).toEqual(Object.keys(OPEN_FLOOR).sort());
  });
});
