/**
 * NET internal area over the whole corpus (examples, fixtures, recovery plans, eval goldens,
 * fidelity plans and faults; the docs gallery is left out, `agent-gallery.test.ts` owns it): the
 * closed-form figure agrees with the GRID ORACLE (`test/helpers/net-area-oracle.ts`, which shares nothing
 * with the code under test but the band and the room's own area) within the oracle's own error
 * bound, on every room. The figure is read UNCLAMPED (`netAreaDetail`): `covered` must lie in
 * `[0, area]` on its own. See `net-area.test.ts` for the rule and the hand-derived evidence.
 *
 * This is its own file because the brute-force oracle takes minutes: a file of its own is
 * scheduled alone (`test/.durations.json`), and `it.each` over the corpus files shows its progress
 * per case. The aggregate figures are asserted by the last test, after every case has run.
 */
import { walkFiles as archFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan, roomAreaMm2 } from "../src/analyze.js";
import { MAX_NET_PROBE_WORK, netAreaBands, netAreaDetail, roomNetAreaMm2 } from "../src/analyze/net-area.js";
import type { RRoom, RWall } from "../src/ir.js";
import { oracleNetArea } from "./helpers/net-area-oracle.js";

// EH3.4: not CORPUS_DIRS (test/helpers/corpus.ts): the corpus plus test/callout-fixtures and test/finish-fixtures, which hold the net-area cases.
const CORPUS_DIRS = [
  "examples",
  "test/fixtures",
  "test/callout-fixtures",
  "test/finish-fixtures",
  "test/recovery-corpus",
  "eval/goldens",
  "eval/fidelity-plans",
  "eval/faults",
];

const root = resolvePath(".");
const files = CORPUS_DIRS.flatMap((d) => archFiles(resolvePath(d)));

/** One file's storeys, each with its walls and rooms. */
function storeysOf(f: string) {
  const { ir, levels } = resolvePlan(readFileSync(f, "utf8"), { world: worldFor(dirname(f)) });
  if (!ir) return [];
  const where = f.slice(root.length + 1);
  return (levels.length > 0 ? levels.map((l) => l.ir) : [ir]).map((st) => ({
    where,
    walls: st.walls as RWall[],
    rooms: st.elements.filter((e): e is RRoom => e.kind === "room"),
  }));
}

suite("net area — every room of the corpus against the grid oracle", () => {
  // Accumulated across the per-file cases, asserted by the last test.
  let rooms = 0;
  let worst = 0;
  let maxWork = 0;

  it("is a real corpus: hundreds of rooms, most of them losing floor to a wall, every shape", () => {
    const all = files.flatMap(storeysOf).flatMap((s) => s.rooms.map((r) => ({ r, bands: netAreaBands(s.walls) })));
    expect(files.length).toBeGreaterThan(90);
    expect(all.length).toBeGreaterThan(500);
    const lose = all.filter(({ r, bands }) => (roomNetAreaMm2(r, bands) ?? Number.POSITIVE_INFINITY) < roomAreaMm2(r));
    expect(lose.length).toBeGreaterThan(450);
    expect(all.some(({ r }) => r.circle)).toBe(true);
    expect(all.some(({ r }) => r.poly && !r.circle)).toBe(true);
  });

  it.each(files.map((f) => f.slice(root.length + 1)))(
    "%s: every room is measured (none omitted), covered in [0, area] unclamped, and agrees with the oracle within its bound",
    (rel) => {
      const bad: string[] = [];
      for (const s of storeysOf(resolvePath(rel))) {
        const bands = netAreaBands(s.walls);
        for (const r of s.rooms) {
          rooms++;
          const d = netAreaDetail(r, bands);
          if (!d.ok) {
            bad.push(`${s.where} ${r.id}: omitted (${d.reason})`);
            continue;
          }
          maxWork = Math.max(maxWork, d.work);
          if (!(d.covered >= 0 && d.covered <= d.gross))
            bad.push(`${s.where} ${r.id}: covered ${d.covered} of ${d.gross}`);
          if (d.gross > 0 && !(d.gross - d.covered > 0)) bad.push(`${s.where} ${r.id}: no floor left`);
          const o = oracleNetArea(r, s.walls);
          const diff = Math.abs(d.covered - o.covered);
          worst = Math.max(worst, diff);
          if (diff > o.bound) bad.push(`${s.where} ${r.id}: covered ${d.covered} vs oracle ${o.covered} ± ${o.bound}`);
        }
      }
      expect(bad).toEqual([]);
    },
    600_000,
  );

  it("the corpus totals: 500+ rooms, the worst gap and the probe-work charge", () => {
    expect(rooms).toBeGreaterThan(500);
    // Measured when written: 2,412 mm² (0.0024 m²) at worst over 586 rooms.
    expect(worst).toBeLessThan(10_000);
    // The probe-work charge (PS0.14): measured when written, 174,720 at most (the star30
    // fixture's corridor), more than a hundred times inside MAX_NET_PROBE_WORK.
    expect(maxWork).toBe(174_720);
    expect(maxWork * 100).toBeLessThan(MAX_NET_PROBE_WORK);
  });
});
