/**
 * U.22 / PS0.15: net internal area is held to a total per storey read (`MAX_NET_PLAN_WORK`,
 * `src/analyze/net-area-memo.ts`), not only to a per-room cap.
 *
 * One room's measurement was capped, but nothing capped rooms times that: rooms each just under
 * the per-room probe cap cost `describe()` linear time in rooms, each one about a second. Now one
 * meter per storey read (`describe()`'s per-storey summary, `lint()` per storey, each storey
 * `compile()` draws) is charged each room's counts BEFORE the work they pay for; past the total
 * the figure is omitted, as a room past its own cap omits it. Counts, never time: every number
 * pinned here is a count.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { clearCache, compile, describe as describePlan, lint, lintCoverage, roomSchedule } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { MAX_NET_PROBE_WORK, netAreaBands, netAreaDetail, netAreaPairWork } from "../src/analyze/net-area.js";
import { MAX_NET_PLAN_WORK, takeNetAreaUses } from "../src/analyze/net-area-memo.js";
import type { RRoom } from "../src/ir.js";
import type { Scene } from "../src/scene.js";

/**
 * One storey of `n` comb rooms side by side, `Comb 0` … `Comb n-1`, each crossing the same `s`
 * partitions with `t` teeth: every room is under both of its own caps, and each costs about 18
 * million units (PS0.15's adversary, kept far enough apart that the resolver's overlap charge does
 * not stop it first).
 */
function combStorey(n: number, s = 45, t = 60): string {
  const cw = 4000;
  const w = 2000 + n * cw;
  const h = 1000 + s * 300 + 1000;
  const o = [`wall exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }`];
  for (let i = 0; i < s; i++)
    o.push(`wall partition thickness 20 { (500,${1000 + i * 300}) (${w - 500},${1000 + i * 300}) }`);
  const p = (cw - 400) / t;
  for (let k = 0; k < n; k++) {
    const x = 1000 + k * cw;
    const pts: Array<[number, number]> = [[x, 400]];
    for (let j = 0; j < t; j++) {
      const x0 = Math.round(x + 100 + j * p);
      const x1 = Math.round(x + 100 + j * p + p / 2);
      pts.push([x0, 400], [x0, h - 500], [x1, h - 500], [x1, 400]);
    }
    pts.push([x + cw - 200, 400], [x + cw - 200, 300], [x, 300]);
    o.push(`room id=c${k} polygon ${pts.map(([a, b]) => `(${a},${b})`).join(" ")} label "Comb ${k}" uses storage`);
  }
  return o.join("\n  ");
}

const combs = (n: number, schedule = false): string =>
  `plan "combs" {\n  ${schedule ? "schedule rooms\n  " : ""}${combStorey(n)}\n}`;

/** Three combs on the ground floor, one upstairs, scheduled. */
const TWO_STOREYS = `plan "combs" {
  schedule rooms
  level 1 "Ground" {
  ${combStorey(3)}
  }
  level 2 "Upper" {
  ${combStorey(1)}
  }
}`;

const N = 8;
const SRC = combs(N);
/** Measured when written: each comb's own counts, both under its per-room caps. */
const PER_ROOM = { curves: 432, work: 18_418_752 };
const PAIRS = netAreaPairWork(PER_ROOM.curves);
/** What a storey whose third comb is refused charges: two rooms whole, the third's pair tests. */
const SPENT = { used: 2 * (PAIRS + PER_ROOM.work) + PAIRS, closed: true };

/** The ROOM SCHEDULE's NET AREA cell per row, by name, read off the drawn Scene. */
function drawnNet(scene: Scene | undefined): Record<string, string> {
  const texts = (scene?.nodes ?? []).flatMap((n) => (n.prim.t === "text" ? [String(n.prim.value)] : []));
  const out: Record<string, string> = {};
  texts.forEach((t, i) => {
    // A schedule row: its name, its area to 2 dp, then its net area (or `-`).
    if (/^Comb \d$/.test(t) && /^\d+\.\d\d$/.test(texts[i + 1] ?? "")) out[t] = texts[i + 2]!;
  });
  return out;
}

/** Lint under a net-area ruleset whose storage floor every comb is under, so every room reports. */
const NET_RULES = { roomAreaMeasure: "net", minRoomAreaByUseM2: { storage: 1000 } } as const;

suite("net area: one total per storey read (U.22, PS0.15)", () => {
  it("each comb is under its own caps, so only the total can stop the sum", () => {
    const { ir } = resolvePlan(SRC);
    const bands = netAreaBands(ir!.walls);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    expect(rooms).toHaveLength(N);
    for (const r of rooms) expect(netAreaDetail(r, bands)).toMatchObject({ ok: true, ...PER_ROOM });
    expect(PER_ROOM.work).toBeLessThan(MAX_NET_PROBE_WORK);
    // Two rooms fit (pairs + walk each), the third does not.
    expect(2 * (PAIRS + PER_ROOM.work)).toBeLessThanOrEqual(MAX_NET_PLAN_WORK);
    expect(3 * (PAIRS + PER_ROOM.work)).toBeGreaterThan(MAX_NET_PLAN_WORK);
  });

  it("describe() measures the rooms that fit, in element order, and omits the rest", () => {
    clearCache();
    takeNetAreaUses();
    const s = describePlan(SRC);
    expect(s.rooms.filter((r) => r.net_area_m2 !== undefined).map((r) => r.id)).toEqual(["c0", "c1"]);
    expect("net_floor_area_m2" in s.totals).toBe(false);
    // One meter (the storey's summary): the two rooms' charges, then the third's pair tests.
    expect(takeNetAreaUses()).toEqual([SPENT]);
  });

  it("a memo warmed outside any total decides exactly as a cold one", () => {
    clearCache();
    const cold = JSON.stringify(describePlan(SRC));
    // Warm EVERY room's figure on the path no total holds (the public `roomSchedule` with walls):
    // the rooms the total refuses in describe() are measured and memoised here.
    const { ir } = resolvePlan(SRC);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    const warm = roomSchedule(rooms, undefined, ir!.walls).rows;
    expect(warm.filter((r) => r.net_area_m2 !== undefined)).toHaveLength(N);
    // Every room is now a memo hit, and a hit replays the counts its miss charged: the same rooms
    // are refused, and the summary is byte for byte the cold one.
    expect(JSON.stringify(describePlan(SRC))).toBe(cold);
  });

  it("the schedule, the drawn table and lint's net reading omit the same rooms describe() omits", () => {
    const src = combs(4, true);
    const s = describePlan(src);
    expect(s.rooms.map((r) => r.net_area_m2 !== undefined)).toEqual([true, true, false, false]);
    expect(s.schedule!.map((r) => r.net_area_m2)).toEqual(s.rooms.map((r) => r.net_area_m2));
    // The drawn ROOM SCHEDULE prints `-` in exactly those rows.
    expect(drawnNet(compile(src, { noCache: true }).scene)).toEqual({
      "Comb 0": "25.04",
      "Comb 1": "25.04",
      "Comb 2": "-",
      "Comb 3": "-",
    });
    // Lint reads net floor where describe() reports it, and the drawn area, saying why, elsewhere.
    const small = lint(src, { ruleset: NET_RULES }).filter((d) => d.code === "W_ROOM_TOO_SMALL");
    expect(small.map((d) => d.message.includes("of net floor"))).toEqual([true, true, false, false]);
    expect(small.slice(2).every((d) => d.hints!.some((h) => h.includes("this storey may cost")))).toBe(true);
    expect(small.some((d) => d.hints!.some((h) => h.includes("too much wall geometry")))).toBe(false);
    // The coverage report names the budget, apart from a room's own cap.
    const rooms = lintCoverage(src, { ruleset: NET_RULES })!.families.find((f) => f.family === "rooms")!;
    expect(rooms.skipped?.find((k) => k.reason === "net-area-budget")?.roomIds).toEqual(["c2", "c3"]);
    expect(rooms.skipped?.some((k) => k.reason === "net-area-cap")).toBe(false);
  });

  it("two storeys: each has its own total, and describe(), the drawing and lint agree storey by storey", () => {
    takeNetAreaUses();
    const s = describePlan(TWO_STOREYS);
    const nets = s.levels!.map((l) => l.rooms.map((r) => r.net_area_m2));
    // The ground floor's third comb is refused; upstairs is a total of its own.
    expect(nets).toEqual([[25.04, 25.04, undefined], [25.04]]);
    expect(s.levels![1]!.schedule!.map((r) => r.net_area_m2)).toEqual([25.04]);
    // One meter per storey summarised (the top level repeats the lowest).
    expect(takeNetAreaUses()).toEqual([SPENT, { used: PAIRS + PER_ROOM.work, closed: false }, SPENT]);
    const pages = compile(TWO_STOREYS, { noCache: true }).pages!;
    expect(drawnNet(pages[0]!.scene)).toEqual({ "Comb 0": "25.04", "Comb 1": "25.04", "Comb 2": "-" });
    expect(drawnNet(pages[1]!.scene)).toEqual({ "Comb 0": "25.04" });
    const small = lint(TWO_STOREYS, { ruleset: NET_RULES }).filter((d) => d.code === "W_ROOM_TOO_SMALL");
    expect(small.map((d) => [d.level, d.message.includes("of net floor")])).toEqual([
      [1, true],
      [1, true],
      [1, false],
      [2, true],
    ]);
  });

  it("the corpus's heaviest plans stay far inside the total (counts pinned when written)", () => {
    // `test/fixtures/star30.arch` is the corpus maximum over every corpus directory (measured
    // when written, examples through eval plans and the defect corpus): 272,216 units.
    const PINNED: Record<string, number> = {
      "test/fixtures/star30.arch": 272_216,
    };
    for (const [file, used] of Object.entries(PINNED)) {
      takeNetAreaUses();
      describePlan(readFileSync(file, "utf8"));
      expect(takeNetAreaUses()).toEqual([{ used, closed: false }]);
      expect(used * 100).toBeLessThan(MAX_NET_PLAN_WORK);
    }
  });
});
