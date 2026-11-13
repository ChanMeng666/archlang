/**
 * U.22 / PS0.15: net internal area is held to a per-call total (`MAX_NET_PLAN_WORK`,
 * `src/analyze/net-area-memo.ts`), not only to a per-room cap.
 *
 * One room's measurement was capped, but nothing capped rooms times that: rooms each just under
 * the per-room probe cap cost `describe()` linear time in rooms, each one about a second. Now one
 * meter per call (`describe()`, `lint()`, each storey `compile()` draws) is charged each room's
 * counts BEFORE the work they pay for; past the total the figure is omitted, as a room past its
 * own cap omits it. Counts, never time: every number pinned here is a count.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { clearCache, compile, describe as describePlan, lint } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import { MAX_NET_PROBE_WORK, netAreaBands, netAreaDetail, netAreaPairWork } from "../src/analyze/net-area.js";
import { lastNetAreaUse, MAX_NET_PLAN_WORK } from "../src/analyze/net-area-memo.js";
import type { RRoom } from "../src/ir.js";

/**
 * `n` comb rooms side by side, each crossing the same `s` partitions with `t` teeth: every room
 * is under both of its own caps, and each costs about 18 million units (PS0.15's adversary,
 * kept far enough apart that the resolver's overlap charge does not stop it first).
 */
function combs(n: number, s = 45, t = 60, schedule = false): string {
  const cw = 4000;
  const w = 2000 + n * cw;
  const h = 1000 + s * 300 + 1000;
  const o = [`plan "combs" {`, `wall exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }`];
  if (schedule) o.push("schedule rooms");
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
    o.push(`room id=c${k} polygon ${pts.map(([a, b]) => `(${a},${b})`).join(" ")} label "Comb" uses storage`);
  }
  o.push("}");
  return o.join("\n");
}

const N = 8;
const SRC = combs(N);
/** Measured when written: each comb's own counts, both under its per-room caps. */
const PER_ROOM = { curves: 432, work: 18_418_752 };

suite("net area: one total per call (U.22, PS0.15)", () => {
  it("each comb is under its own caps, so only the per-call total can stop the sum", () => {
    const { ir } = resolvePlan(SRC);
    const bands = netAreaBands(ir!.walls);
    const rooms = ir!.elements.filter((e): e is RRoom => e.kind === "room");
    expect(rooms).toHaveLength(N);
    for (const r of rooms) expect(netAreaDetail(r, bands)).toMatchObject({ ok: true, ...PER_ROOM });
    expect(PER_ROOM.work).toBeLessThan(MAX_NET_PROBE_WORK);
    // Two rooms fit (pairs + walk each), the third does not.
    const one = netAreaPairWork(PER_ROOM.curves) + PER_ROOM.work;
    expect(2 * one).toBeLessThanOrEqual(MAX_NET_PLAN_WORK);
    expect(3 * one).toBeGreaterThan(MAX_NET_PLAN_WORK);
  });

  it("describe() measures the rooms that fit, in element order, and omits the rest", () => {
    clearCache();
    const s = describePlan(SRC);
    const use = lastNetAreaUse();
    expect(s.rooms.filter((r) => r.net_area_m2 !== undefined).map((r) => r.id)).toEqual(["c0", "c1"]);
    expect("net_floor_area_m2" in s.totals).toBe(false);
    // The two rooms' charges plus the third room's pair tests, offered before its split.
    const pairs = netAreaPairWork(PER_ROOM.curves);
    expect(use).toEqual({ used: 2 * (pairs + PER_ROOM.work) + pairs, closed: true });
    expect(use.used).toBeLessThanOrEqual(MAX_NET_PLAN_WORK);
  });

  it("a warm memo decides exactly as a cold one: the summary is a function of the source alone", () => {
    clearCache();
    const cold = JSON.stringify(describePlan(SRC));
    // Warm every room's figure outside any total, then describe again.
    const { ir } = resolvePlan(SRC);
    for (const e of ir!.elements) if (e.kind === "room") netAreaDetail(e as RRoom, netAreaBands(ir!.walls));
    compile(SRC, { noCache: true });
    expect(JSON.stringify(describePlan(SRC))).toBe(cold);
    expect(JSON.stringify(describePlan(SRC))).toBe(cold);
  });

  it("the schedule, the drawn table and lint's net reading omit the same rooms describe() omits", () => {
    const src = combs(4, 45, 60, true);
    const s = describePlan(src);
    const measured = s.rooms.filter((r) => r.net_area_m2 !== undefined).map((r) => r.id);
    expect(measured).toEqual(["c0", "c1"]);
    expect(s.schedule!.filter((r) => r.net_area_m2 !== undefined).map((r) => r.id)).toEqual(measured);
    expect(s.schedule!.map((r) => r.net_area_m2)).toEqual(s.rooms.map((r) => r.net_area_m2));
    // The drawn ROOM SCHEDULE prints "-" for an omitted figure.
    expect(compile(src, { noCache: true }).svg).toContain(">-<");
    lint(src, { profile: "uk-residential-advisory" });
    expect(lastNetAreaUse()).toMatchObject({ closed: true });
  });

  it("the corpus's heaviest plans stay far inside the total (counts pinned when written)", () => {
    // `test/fixtures/star30.arch` is the corpus maximum over every corpus directory (measured
    // when written, examples through eval plans and the defect corpus): 272,216 units.
    const PINNED: Record<string, number> = {
      "test/fixtures/star30.arch": 272_216,
    };
    for (const [file, used] of Object.entries(PINNED)) {
      describePlan(readFileSync(file, "utf8"));
      expect(lastNetAreaUse()).toEqual({ used, closed: false });
      expect(used * 100).toBeLessThan(MAX_NET_PLAN_WORK);
    }
  });
});
