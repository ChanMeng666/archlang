/** net internal area — once per room per compile on a `schedule rooms` plan. */

import { readFileSync } from "node:fs";
import { beforeEach, describe as suite, expect, it, vi } from "vitest";

/**
 * Net internal area is computed once per storey and once per room per compile
 * (`src/analyze/net-area-memo.ts`), however many paths read it: the drawn ROOM SCHEDULE and
 * `describe()`'s `rooms[]` and `schedule[]` (the resolver's margin-table row count measures
 * none, U.22). Counted at the
 * core's module boundary; the numbers themselves are held by the byte-identity laws.
 */
const calls = { bands: 0, rooms: 0 };
vi.mock("../src/analyze/net-area.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/analyze/net-area.js")>();
  return {
    ...real,
    netAreaBands: (...args: Parameters<typeof real.netAreaBands>) => {
      calls.bands++;
      return real.netAreaBands(...args);
    },
    roomNetAreaMm2: (...args: Parameters<typeof real.roomNetAreaMm2>) => {
      calls.rooms++;
      return real.roomNetAreaMm2(...args);
    },
  };
});

const { clearCache, compile, describe } = await import("../src/index.js");

type Storey = { rooms: unknown[]; schedule?: unknown[] };
const PLANS = ["examples/clinic.arch", "examples/hillside-villa.arch"];

beforeEach(() => {
  clearCache();
  calls.bands = 0;
  calls.rooms = 0;
});

suite("net internal area — once per room per compile on a `schedule rooms` plan", () => {
  for (const file of PLANS) {
    const src = readFileSync(file, "utf8");
    // The plan's shape, measured once outside the counted runs.
    const facts = describe(src) as Storey & { levels?: Storey[] };
    const storeys = facts.levels ?? [facts];
    const rooms = storeys.reduce((n, s) => n + s.rooms.length, 0);

    it(`${file}: the control — it schedules its rooms, so every path reads net area`, () => {
      expect(storeys.every((s) => Array.isArray(s.schedule))).toBe(true);
      expect(rooms).toBeGreaterThan(0);
    });

    it(`${file}: describe() computes each storey's bands once and each room's area once`, () => {
      clearCache();
      calls.bands = 0;
      calls.rooms = 0;
      describe(src);
      expect(calls.bands).toBe(storeys.length);
      expect(calls.rooms).toBe(rooms);
    });

    it(`${file}: compile() (resolve + drawn schedule) likewise`, () => {
      compile(src, { noCache: true });
      expect(calls.bands).toBe(storeys.length);
      expect(calls.rooms).toBe(rooms);
    });
  }
});
